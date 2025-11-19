from __future__ import annotations

import base64
import operator
from pathlib import Path
from typing import Any, Literal, Optional, Callable, Awaitable

from dotenv import load_dotenv
from typing_extensions import Annotated, TypedDict

from langchain.chat_models import init_chat_model
from langchain.messages import AnyMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command

from browser_tools import make_tools as make_browser_tools
from computer_tools import make_tools as make_computer_tools

from rich.console import Console
from rich.text import Text

load_dotenv()

console = Console()

def _load_system_prompt(prompt_filename: str = "prompt_v1.txt") -> str:
    # Prompts directory lives at the project root alongside src/.
    prompts_dir = Path(__file__).resolve().parents[1] / "prompts"
    path = prompts_dir / prompt_filename
    try:
        return path.read_text(encoding="utf-8").strip()
    except Exception as e:
        raise FileNotFoundError(f"Failed to load system prompt from {path}: {e}")


# Use the agent-specific system prompt, which includes instructions
# on when and how to call the ``finish`` tool.
SYSTEM_PROMPT = _load_system_prompt("agent_prompt_v3.txt")


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]
    llm_calls: int
    status: Literal["in_progress", "success", "failure"]


def make_agent(
    target: Any,
    prompt: Optional[str] = None,
    *,
    mode: Literal["browser", "computer"] = "browser",
    include_ui_manifest: bool = True,
    run_id: Optional[str] = None,
):
    """Return a compiled LangGraph agent for either a browser Page or a Computer."""
    
    model = init_chat_model(
        "gemini-2.5-pro",
        model_provider="google_genai",
        temperature=1.0,
        thinking_budget=8192
    )

    if prompt is None or not str(prompt).strip():
        raise ValueError("prompt (task_prompt) must be provided for make_agent")

    # --- Mode-Specific Logic ---
    
    if mode == "browser":
        page = target
        TIMEOUT_MS = 2000
        tools, tools_by_name, supported_tool_names = make_browser_tools(page, TIMEOUT_MS)
        
        async def get_screenshot() -> str:
             png_bytes = await page.screenshot(type="png", full_page=False)
             return base64.b64encode(png_bytes).decode("ascii")
        
        async def get_manifest() -> str:
             try:
                 snap = await page.accessibility.snapshot(interesting_only=True)
             except Exception as e:
                 raise e # Let the common handler catch it and format the error
             return snap

        def get_url() -> str:
             return page.url

    else: # mode == "computer"
        computer = target
        TIMEOUT_S = 2.0
        tools, tools_by_name, supported_tool_names = make_computer_tools(computer, TIMEOUT_S)
        interface = computer.interface

        async def get_screenshot() -> str:
             png_bytes = await interface.screenshot()
             return base64.b64encode(png_bytes).decode("ascii")

        async def get_manifest() -> Any: # Returns the raw tree/snap
             try:
                 snap = await interface.get_accessibility_tree()
             except Exception as e:
                 raise e
             return snap

        def get_url() -> str:
             return getattr(computer, "name", None) or "computer://sandbox"


    model_with_tools = model.bind_tools(tools)
    
    # --- Common Logic ---

    async def build_ui_manifest_common() -> str:
        mode_label = "(Computer Mode)" if mode == "computer" else ""
        console.print(Text(f"Building UI Manifest {mode_label}...", style="italic dim"))
        try:
            snap = await get_manifest()
        except Exception as e:
            console.print(Text(f"UI_MANIFEST_ERROR: {type(e).__name__}: {e}", style="bold red"))
            return f"UI_MANIFEST_ERROR: {type(e).__name__}: {e}"

        if not snap:
            console.print(Text("UI_MANIFEST_EMPTY", style="italic dim"))
            return "UI_MANIFEST_EMPTY"

        if isinstance(snap, (str, int, float, bool)):
            return str(snap)
        
        # Standardize Browser/Computer accessibility tree walking
        lines: list[str] = []

        def walk(node: Any) -> None:
            if isinstance(node, dict):
                # Browser uses 'role'/'name', Computer uses 'AXRole'/'AXTitle'
                role = node.get("role") or node.get("AXRole")
                name = node.get("name") or node.get("AXTitle")
                disabled = node.get("disabled") or node.get("AXDisabled")
                hidden = node.get("hidden") or node.get("AXHidden")

                if not hidden:
                    if role or name:
                        suffix = " [disabled]" if disabled else ""
                        lines.append(f"- {role or '(no role)'}: {name or '(no name)'}{suffix}")
                
                children = node.get("children") or node.get("AXChildren") or []
                for child in children:
                    walk(child)
            elif isinstance(node, list):
                for child in node:
                    walk(child)

        walk(snap)
        
        if not lines:
            console.print(Text("UI_MANIFEST_EMPTY", style="italic dim"))
            return "UI_MANIFEST_EMPTY"
        
        console.print(Text(f"UI Manifest Built {mode_label}.", "green"))
        return "\n".join(lines[:300])


    async def llm_call(state: AgentState) -> Command[Literal["tool_node", "llm_call"]]:
        b64 = await get_screenshot()
        
        manifest: Optional[str] = None
        if include_ui_manifest:
            manifest = await build_ui_manifest_common()

        current_url = get_url()

        content_parts: list[dict[str, Any]] = []
        task_prompt = prompt.strip()
        if task_prompt:
            content_parts.append({"type": "text", "text": f"<task>\n{task_prompt}\n</task>"})

        content_parts.extend([
            {"type": "text", "text": f"<context>\n<url>\n{current_url}\n</url>"},
            {"type": "image", "base64": b64, "mime_type": "image/png"},
        ])
        
        if include_ui_manifest and manifest is not None:
            content_parts.append(
                {"type": "text", "text": f"<ui_manifest>\n{manifest}\n</ui_manifest>\n</context>"}
            )

        user_msg = HumanMessage(content=content_parts)
        
        mode_label = "(Computer Mode)" if mode == "computer" else ""
        console.print(Text(f"Calling LLM (LLM Calls: {state.get('llm_calls', 0) + 1})...", style="cyan"))
        ai_msg = await model_with_tools.ainvoke(
            [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"] + [user_msg]
        )
        console.print(Text(f"LLM Call Finished {mode_label}.", "green"))

        status = state.get("status", "in_progress")
        update = {
            "messages": [user_msg, ai_msg],
            "llm_calls": state.get("llm_calls", 0) + 1,
            "status": status,
        }

        if getattr(ai_msg, "tool_calls", None):
            return Command(update=update, goto="tool_node")
        return Command(update=update, goto="llm_call")


    async def tool_node(state: AgentState) -> Command[Literal["llm_call"]]:
        results = []
        status = state.get("status", "in_progress")
        finished = False
        
        mode_label = "(Computer Mode)" if mode == "computer" else ""

        console.print(Text(f"Executing Tools {mode_label}", style="yellow"))
        
        for tool_call in state["messages"][-1].tool_calls:
            name = tool_call["name"]
            line = Text("  Executing tool: ", style="yellow")
            line.append(str(name), style="bold magenta")
            if mode_label:
                line.append(f" {mode_label}", style="yellow")
            console.print(line)
            
            if name not in tools_by_name:
                results.append(
                    ToolMessage(
                        content=(
                            f"ERROR: Unknown tool '{name}'. "
                            f"Use only the supported tools: {supported_tool_names}."
                        ),
                        tool_call_id=tool_call["id"],
                    )
                )
                continue

            t = tools_by_name[name]
            observation = await t.ainvoke(tool_call["args"])
            results.append(
                ToolMessage(content=str(observation), tool_call_id=tool_call["id"])
            )

            if name == "finish":
                finished = True
                try:
                    reason = str(tool_call.get("args", {}).get("reason", "")).strip().lower()
                except Exception:
                    reason = ""

                if reason.startswith("task success") or reason.startswith("success"):
                    status = "success"
                elif reason.startswith("failure"):
                    status = "failure"
        
        console.print(Text(f"Tool Execution Finished {mode_label}.", "green"))

        update = {"messages": results, "status": status}

        if finished:
            return Command(update=update, goto=END)

        return Command(update=update, goto="llm_call")

    builder = StateGraph(AgentState)
    builder.add_node("llm_call", llm_call)
    builder.add_node("tool_node", tool_node)
    builder.add_edge(START, "llm_call")

    return builder.compile()


__all__ = ["make_agent", "AgentState", "SYSTEM_PROMPT"]
