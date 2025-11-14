from __future__ import annotations
from dotenv import load_dotenv

import base64
import asyncio
import inspect
import re
import operator
import ast
from typing import Literal, Optional, Callable, Awaitable
from pathlib import Path

from typing_extensions import Annotated, TypedDict

from langchain.tools import tool
from langchain.chat_models import init_chat_model
from langchain.messages import AnyMessage, SystemMessage, ToolMessage, HumanMessage
from langgraph.graph import StateGraph, START, END

from playwright.async_api import Page, expect

load_dotenv()

def _load_system_prompt(prompt_filename: str = "prompt_v1.txt") -> str:
    prompts_dir = Path(__file__).resolve().parent / "prompts"
    path = prompts_dir / prompt_filename
    try:
        return path.read_text(encoding="utf-8").strip()
    except Exception as e:
        raise FileNotFoundError(f"Failed to load system prompt from {path}: {e}")


SYSTEM_PROMPT = _load_system_prompt("prompt_v2.txt")


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]
    llm_calls: int
    task_success: bool


def make_run_pw_tool(page: Page):
    @tool("run_pw")
    async def run_pw(script: str, timeout_ms: int = 30000) -> str:
        """Execute a Playwright async snippet on the current page.

        Accepted format (only):
            async def main(page):
                # your Playwright steps here

        Returns:
        - "OK: <repr(result)>" on success
        - "ERROR: ..." with details and a screenshot snippet on failure
        """
        # Restrict builtins for a safer execution context.
        safe_builtins = {
            "True": True,
            "False": False,
            "None": None,
            "len": len,
            "range": range,
            "min": min,
            "max": max,
            "sum": sum,
            "enumerate": enumerate,
            "str": str,
            "int": int,
            "float": float,
            "bool": bool,
            "list": list,
            "dict": dict,
            "set": set,
            "tuple": tuple,
            "print": print,
        }

        # Validate structure: only one async def main(page) at module level
        try:
            module = ast.parse(script)
        except Exception as e:
            return f"ERROR: parse: {type(e).__name__}: {e}"
        defs = [n for n in module.body if isinstance(n, ast.AsyncFunctionDef)]
        others = [n for n in module.body if not isinstance(n, ast.AsyncFunctionDef)]
        if len(defs) != 1 or len(others) != 0 or defs[0].name != "main":
            return (
                "ERROR: format: Provide only one function 'async def main(page):' "
                "and no other top-level code."
            )

        # Globals available to the script
        g: dict = {"__builtins__": safe_builtins, "re": re, "expect": expect}

        # Build async def main(page) (no wrapping)
        try:
            exec(script, g)
        except Exception as e:
            return f"ERROR: compile: {type(e).__name__}: {e}"
        main = g.get("main")
        if not inspect.iscoroutinefunction(main):
            return "ERROR: Provided main() must be 'async def main(page)'"

        # Run with timeout and capture a screenshot on error
        try:
            result = await asyncio.wait_for(main(page), timeout=timeout_ms / 1000)
            return f"OK: {repr(result)}"
        except Exception as e:
            try:
                png = await page.screenshot(full_page=True)
                b64 = base64.b64encode(png).decode("ascii")
                return f"ERROR: {type(e).__name__}: {e} SCREENSHOT_PNG_BASE64={b64[:4096]}"
            except Exception:
                return f"ERROR: {type(e).__name__}: {e} (screenshot failed)"

    return run_pw

def make_agent(
    page: Page,
    prompt: Optional[str] = None,
    is_success: Optional[Callable[[Page], Awaitable[bool]]] = None,
):
    """Return a compiled LangGraph agent bound to the given Playwright page.

    Loop per turn:
    1) capture screenshot + HTML
    2) send both to the LLM (multimodal)
    3) execute any tool calls
    4) check success; if not, repeat
    """
    # Do not change: user requires this exact model setup
    model = init_chat_model("gpt-5-mini", temperature=0)

    # Require a task prompt (no fallback)
    if prompt is None or not str(prompt).strip():
        raise ValueError("prompt (task_prompt) must be provided for make_agent")

    run_pw_tool = make_run_pw_tool(page)
    tools = [run_pw_tool]
    tools_by_name = {t.name: t for t in tools}
    model_with_tools = model.bind_tools(tools)

    async def llm_call(state: AgentState):
        # 1) Capture current page state
        png_bytes = await page.screenshot(type="png", full_page=False)
        html = await page.content()
        b64 = base64.b64encode(png_bytes).decode("ascii")

        # 2) Build a multimodal user message (text + image + raw HTML)
        user_msg = HumanMessage(
            content=[
                {
                    "type": "text",
                    "text": (
                        "Here is the current page screenshot and raw HTML. "
                    ),
                },
                {
                    "type": "image",
                    "base64": b64,
                    "mime_type": "image/png",
                },
                {
                    "type": "text",
                    "text": f"RAW_HTML_START\n{html}\nRAW_HTML_END",
                },
            ]
        )

        # 2) Send to LLM (with system prompt + required task prompt + history)
        task_prompt = prompt.strip()
        effective_prompt = f"{SYSTEM_PROMPT}\n\nTask: {task_prompt}"
        ai_msg = await model_with_tools.ainvoke(
            [SystemMessage(content=effective_prompt)] + state["messages"] + [user_msg]
        )

        return {
            # Append both the user message we created and the AI response to state
            "messages": [user_msg, ai_msg],
            "llm_calls": state.get("llm_calls", 0) + 1,
        }

    # Require a success function to be provided
    if is_success is None:
        raise ValueError("is_success must be provided for make_agent")

    async def tool_node(state: AgentState):
        # 3) Execute tool calls
        results = []
        for tool_call in state["messages"][-1].tool_calls:
            name = tool_call["name"]
            if name not in tools_by_name:
                results.append(
                    ToolMessage(
                        content=f"ERROR: Unknown tool '{name}'. Use only 'run_pw' with a Playwright snippet.",
                        tool_call_id=tool_call["id"],
                    )
                )
                continue
            t = tools_by_name[name]
            observation = await t.ainvoke(tool_call["args"])
            results.append(ToolMessage(content=str(observation), tool_call_id=tool_call["id"]))

        # 4) Check success via injected checker only
        success = state.get("task_success", False)
        if not success:
            try:
                success = await is_success(page)
            except Exception:
                success = False

        return {"messages": results, "task_success": success}

    def should_continue_from_llm(state: AgentState) -> Literal["tool_node", END]:
        if state.get("task_success"):
            return END
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "tool_node"
        return END

    def should_continue_from_tool(state: AgentState) -> Literal["llm_call", END]:
        if state.get("task_success"):
            return END
        return "llm_call"

    builder = StateGraph(AgentState)
    builder.add_node("llm_call", llm_call)
    builder.add_node("tool_node", tool_node)

    builder.add_edge(START, "llm_call")
    builder.add_conditional_edges("llm_call", should_continue_from_llm, ["tool_node", END])
    builder.add_conditional_edges("tool_node", should_continue_from_tool, ["llm_call", END])

    return builder.compile()


__all__ = ["make_agent", "AgentState", "SYSTEM_PROMPT"]
