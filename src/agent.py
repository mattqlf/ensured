from __future__ import annotations
import base64
import asyncio
import io
import operator
import os
from typing import Literal, Optional, Awaitable, Any
from pathlib import Path

from dotenv import load_dotenv
from typing_extensions import Annotated, TypedDict

from langchain.chat_models import init_chat_model
from langchain.messages import AnyMessage, SystemMessage, ToolMessage, HumanMessage
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command

from playwright.async_api import Page
from PIL import Image
import moondream as md

from browser_tools import make_tools

load_dotenv()

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
SYSTEM_PROMPT = _load_system_prompt("agent_prompt_v1.txt")


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]
    llm_calls: int
    status: Literal["in_progress", "success", "failure"]


def make_agent(
    page: Page,
    prompt: Optional[str] = None,
    *,
    include_ui_manifest: bool = True,
):
    """Return a compiled LangGraph agent bound to the given Playwright page.

    Loop per turn:
    1) capture screenshot + accessibility UI manifest
    2) send both to the LLM (multimodal)
    3) execute any tool calls
    4) check success; if not, repeat
    """
    # model = init_chat_model("gpt-5", model_provider="openai", temperature=1.0, reasoning={"effort":"low"}, text={"verbosity": "medium"})
    model = init_chat_model("gemini-2.5-pro", model_provider="google_genai", temperature=1.0, thinking_budget=8192)

    # Require a task prompt (no fallback)
    if prompt is None or not str(prompt).strip():
        raise ValueError("prompt (task_prompt) must be provided for make_agent")

    # Shared timeout for Playwright and vision-driven tools
    TIMEOUT_MS = 2000

    # Unified toolset: ARIA-first tools plus coordinate-based and timing fallbacks,
    # plus an explicit LLM-controlled termination signal via ``finish``.
    tools, tools_by_name, supported_tool_names = make_tools(page, TIMEOUT_MS)
    model_with_tools = model.bind_tools(tools)

    async def llm_call(state: AgentState) -> Command[Literal["tool_node", "llm_call"]]:
        # 1) Capture current page state
        png_bytes = await page.screenshot(type="png", full_page=False)
        b64 = base64.b64encode(png_bytes).decode("ascii")

        manifest: Optional[str] = None
        if include_ui_manifest:
            # Build a compact accessibility-based UI manifest
            async def build_ui_manifest() -> str:
                try:
                    snap = await page.accessibility.snapshot(interesting_only=True)
                except Exception as e:
                    return f"UI_MANIFEST_ERROR: {type(e).__name__}: {e}"

                if not snap:
                    return "UI_MANIFEST_EMPTY"

                lines: list[str] = []

                def walk(node):
                    if not isinstance(node, dict):
                        return
                    role = node.get("role")
                    name = node.get("name")
                    disabled = node.get("disabled")
                    if not node.get("hidden"):
                        # Do not filter by role: include all visible nodes that
                        # have either a role or an accessible name.
                        if role or name:
                            suffix = " [disabled]" if disabled else ""
                            lines.append(f"- {role or '(no role)'}: {name or '(no name)'}{suffix}")
                    for child in node.get("children", []) or []:
                        walk(child)

                walk(snap)
                if not lines:
                    return "UI_MANIFEST_EMPTY"
                return "\n".join(lines[:300])  # safety cap

            manifest = await build_ui_manifest()
        current_url = page.url

        # 2) Build a multimodal user message (task + text + image + UI_MANIFEST)
        content_parts: list[dict[str, Any]] = []

        # Always include the task description for context.
        task_prompt = prompt.strip()
        if task_prompt:
            content_parts.append(
                {
                    "type": "text",
                    "text": f"<task>\n{task_prompt}\n</task>",
                }
            )

        content_parts.extend(
            [
            {
                "type": "text",
                "text": f"<url>\n{current_url}\n</url>",
            },
            {
                "type": "image",
                "base64": b64,
                "mime_type": "image/png",
            },
        ]
        )
        if include_ui_manifest and manifest is not None:
            content_parts.append(
                {
                    "type": "text",
                    "text": f"<ui_manifest>\n{manifest}\n</ui_manifest>",
                }
            )

        user_msg = HumanMessage(content=content_parts)

        # 3) Send to LLM (with system prompt + history)
        ai_msg = await model_with_tools.ainvoke(
            [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"] + [user_msg]
        )

        # Carry forward the current status; only the tool node mutates it.
        status = state.get("status", "in_progress")

        update = {
            # Append both the user message we created and the AI response to state
            "messages": [user_msg, ai_msg],
            "llm_calls": state.get("llm_calls", 0) + 1,
            "status": status,
        }

        # Decide control flow based on the LLM response:
        # - if tools were requested, execute them next
        # - if no tools, capture a fresh screenshot and think again.
        if getattr(ai_msg, "tool_calls", None):
            return Command(update=update, goto="tool_node")
        return Command(update=update, goto="llm_call")

    async def tool_node(state: AgentState) -> Command[Literal["llm_call"]]:
        # Execute tool calls and allow the LLM to explicitly signal completion
        # via the ``finish`` tool. The ``reason`` argument of ``finish`` should
        # be either "Task Success" or "Failure" to indicate the outcome.
        results = []
        status = state.get("status", "in_progress")
        finished = False

        for tool_call in state["messages"][-1].tool_calls:
            name = tool_call["name"]
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
            results.append(ToolMessage(content=str(observation), tool_call_id=tool_call["id"]))

            if name == "finish":
                finished = True
                reason = ""
                try:
                    reason = str(tool_call.get("args", {}).get("reason", "")).strip().lower()
                except Exception:
                    reason = ""

                # Interpret the outcome based on the reason string.
                # Treat "task success" (or strings starting with it) as success,
                # and "failure" (or strings starting with it) as an explicit failure.
                if reason.startswith("task success") or reason.startswith("success"):
                    status = "success"
                elif reason.startswith("failure"):
                    status = "failure"

        update = {"messages": results, "status": status}

        if finished:
            # Terminate regardless of success/failure outcome; caller can inspect
            # ``status`` and the finish reason to understand the result.
            return Command(update=update, goto=END)

        # Otherwise, capture a fresh screenshot and ask the LLM again.
        return Command(update=update, goto="llm_call")

    builder = StateGraph(AgentState)
    builder.add_node("llm_call", llm_call)
    builder.add_node("tool_node", tool_node)

    builder.add_edge(START, "llm_call")

    return builder.compile()


__all__ = ["make_agent", "AgentState", "SYSTEM_PROMPT"]
