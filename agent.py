from __future__ import annotations
import base64
import asyncio
import operator
from typing import Literal, Optional, Callable, Awaitable, Any
from pathlib import Path

from dotenv import load_dotenv
from typing_extensions import Annotated, TypedDict

from langchain.tools import tool
from langchain.chat_models import init_chat_model
from langchain.messages import AnyMessage, SystemMessage, ToolMessage, HumanMessage
from langgraph.graph import StateGraph, START, END

from playwright.async_api import Page

load_dotenv()


def _load_system_prompt(prompt_filename: str = "prompt_v1.txt") -> str:
    prompts_dir = Path(__file__).resolve().parent / "prompts"
    path = prompts_dir / prompt_filename
    try:
        return path.read_text(encoding="utf-8").strip()
    except Exception as e:
        raise FileNotFoundError(f"Failed to load system prompt from {path}: {e}")


SYSTEM_PROMPT = _load_system_prompt("prompt_v5.txt")


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]
    llm_calls: int
    task_success: bool


MAX_LLM_CALLS = 20


def make_pw_tools(page: Page):
    """Create Playwright tools that operate on the current page via roles.

    The tools are:
    - ``click``: click a control by ARIA role + accessible name.
    - ``check``: ensure a checkbox / switch / radio is checked by role + name.
    - ``input``: fill text into an input-like element by role + name.
    - ``goto``: navigate to an absolute URL.
    - ``back``: go back in browser history.

    All tools must be driven using information from the UI_MANIFEST that the
    agent receives with each screenshot. Never invent selectors; always use
    roles and names exactly as they appear in UI_MANIFEST.
    """

    TIMEOUT_MS = 4000

    async def _run_with_timeout(operation: str, coro: Awaitable[object]) -> str:
        """Run a Playwright coroutine with a timeout and return a simple status string."""
        try:
            page.set_default_timeout(TIMEOUT_MS)
        except Exception:
            pass

        try:
            await asyncio.wait_for(coro, timeout=TIMEOUT_MS / 1000)
            return f"OK: {operation}"
        except Exception as e:
            return f"ERROR: {type(e).__name__}: {e}"

    @tool("click")
    async def click(role: str, name: Optional[str] = None) -> str:
        """Click an element on the current page using its ARIA role and accessible name.

        This is a thin wrapper around ``page.get_by_role(role, name=name).click()``.

        Usage guidelines:
        - Always choose ``role`` and ``name`` from the UI_MANIFEST provided alongside the screenshot.
        - Only click elements that are listed in UI_MANIFEST (e.g. roles ``button``, ``link``, ``tab``, ``menuitem``).
        - ``name`` must exactly match the text shown after the colon in UI_MANIFEST
          (for example, for "- button: Continue", use role="button", name="Continue").
        - Do not invent CSS selectors, XPath expressions, or guess at names; rely purely on role + name from UI_MANIFEST.

        Returns "OK: clicked role='...' name='...'" on success or
        "ERROR: ..." with details on failure.
        """
        locator = page.get_by_role(role, name=name) if name is not None else page.get_by_role(role)
        operation = f"clicked role={role!r} name={name!r}"
        return await _run_with_timeout(operation, locator.click())

    @tool("check")
    async def check(role: str, name: Optional[str] = None) -> str:
        """Ensure a checkbox-like control is checked using its ARIA role and accessible name.

        This wraps ``page.get_by_role(role, name=name).check()`` and is intended for roles
        such as "checkbox", "radio", or "switch".

        Usage guidelines:
        - Use only for elements with roles that support a checked state ("checkbox", "radio", "switch").
        - Choose ``role`` and ``name`` exactly from UI_MANIFEST; do not guess.
        - Use this to turn something ON. It will not uncheck a control that is already checked.

        Returns "OK: checked role='...' name='...'" on success or
        "ERROR: ..." with details on failure.
        """
        locator = page.get_by_role(role, name=name) if name is not None else page.get_by_role(role)
        operation = f"checked role={role!r} name={name!r}"
        return await _run_with_timeout(operation, locator.check())

    @tool("input")
    async def input_text(role: str, name: Optional[str] = None, value: str = "") -> str:
        """Enter text into an input-like element using its ARIA role and accessible name.

        This wraps ``page.get_by_role(role, name=name).fill(value)``.

        Usage guidelines:
        - Use for roles such as "textbox" or "combobox" that appear in UI_MANIFEST.
        - Choose ``role`` and ``name`` exactly from UI_MANIFEST; do not invent values.
        - ``value`` should be the exact text that should appear in the field; existing contents are replaced.
        - Do not send key-by-key commands (like "TAB" or "ENTER"); provide only the final text.

        Returns "OK: filled role='...' name='...' with value='...'" on success or
        "ERROR: ..." with details on failure.
        """
        locator = page.get_by_role(role, name=name) if name is not None else page.get_by_role(role)
        operation = f"filled role={role!r} name={name!r} with value={value!r}"
        return await _run_with_timeout(operation, locator.fill(value))

    @tool("goto")
    async def goto(url: str) -> str:
        """Navigate the browser to a new absolute URL using Playwright ``page.goto(url)``.

        Usage guidelines:
        - Use when you need to open a completely new page or domain.
        - Prefer the ``click`` tool for in-page navigation that can be done by clicking links or buttons.
        - ``url`` should usually be an absolute URL starting with "http://" or "https://".
        - After calling this tool, rely on the next screenshot and UI_MANIFEST to understand the new page state.

        Returns "OK: navigated to url='...'" on success or
        "ERROR: ..." with details on failure.
        """
        operation = f"navigated to url={url!r}"
        return await _run_with_timeout(operation, page.goto(url))

    @tool("back")
    async def back() -> str:
        """Navigate one step back in browser history using Playwright ``page.go_back()``.

        Usage guidelines:
        - Use when you need to return to the previous page in the browser history.
        - Prefer this over manually re-entering a URL when you simply need to go back.
        - After calling this tool, rely on the next screenshot and UI_MANIFEST to understand the new page state.

        Returns "OK: navigated back in history" on success or
        "ERROR: ..." with details on failure.
        """
        operation = "navigated back in history"
        return await _run_with_timeout(operation, page.go_back())

    return [click, check, input_text, goto, back]


def make_coord_tools(page: Page):
    """Create low-level coordinate-based Playwright tools for the current page.

    The tools are:
    - ``coord_click``: move the mouse to absolute page coordinates (x, y) and click.
    - ``scroll``: scroll the page using mouse wheel deltas.
    - ``type``: type raw text with the keyboard into the currently focused element.
    - ``goto``: navigate to an absolute URL.
    - ``back``: go back in browser history.

    Coordinate system:
    - ``x`` and ``y`` are CSS pixels relative to the top-left of the page viewport.
    - Derive coordinates from the screenshot you see; avoid random guessing.
    - Keep clicks within the visible bounds of clear interactive controls.

    In this tool configuration, you have only coordinate-based mouse/keyboard
    input plus basic URL navigation (``goto``/``back``). You do not have
    higher-level role-based click/input tools, so reason carefully from the
    screenshot (and any provided context) to choose safe, precise coordinates
    and focused elements.
    """

    TIMEOUT_MS = 4000

    async def _run_with_timeout(operation: str, coro: Awaitable[object]) -> str:
        """Run a Playwright coroutine with a timeout and return a simple status string."""
        try:
            page.set_default_timeout(TIMEOUT_MS)
        except Exception:
            pass

        try:
            await asyncio.wait_for(coro, timeout=TIMEOUT_MS / 1000)
            return f"OK: {operation}"
        except Exception as e:
            return f"ERROR: {type(e).__name__}: {e}"

    @tool("coord_click")
    async def coord_click(x: float, y: float, button: str = "left") -> str:
        """Click at absolute page coordinates ``(x, y)`` using the mouse.

        This wraps ``page.mouse.move(x, y)`` followed by ``page.mouse.click(x, y, button=...)``.

        Usage guidelines:
        - Choose ``x`` and ``y`` from the screenshot you see; do not invent arbitrary coordinates.
        - Coordinates are in CSS pixels relative to the current viewport, not screen pixels.
        - Prefer clicking on obvious, visible interactive elements and avoid off-screen areas.

        Returns "OK: clicked at (x, y)" on success or
        "ERROR: ..." with details on failure.
        """

        async def _do_click() -> None:
            await page.mouse.move(x, y)
            await page.mouse.click(x, y, button=button)

        operation = f"clicked at ({x}, {y}) with button={button!r}"
        return await _run_with_timeout(operation, _do_click())

    @tool("scroll")
    async def scroll(delta_x: float = 0, delta_y: float = 0) -> str:
        """Scroll the page using mouse wheel deltas ``(delta_x, delta_y)``.

        This wraps ``page.mouse.wheel(delta_x, delta_y)``.

        Usage guidelines:
        - Positive ``delta_y`` scrolls down; negative scrolls up.
        - Positive ``delta_x`` scrolls right; negative scrolls left.
        - Use small increments (for example 200–800) rather than huge jumps, so you can
          observe intermediate states in subsequent screenshots.
        - Avoid excessive scrolling that would move far away from relevant content.

        Returns "OK: scrolled by (delta_x, delta_y)" on success or
        "ERROR: ..." with details on failure.
        """

        async def _do_scroll() -> None:
            await page.mouse.wheel(delta_x, delta_y)

        operation = f"scrolled by (delta_x={delta_x}, delta_y={delta_y})"
        return await _run_with_timeout(operation, _do_scroll())

    @tool("type")
    async def type_text(text: str) -> str:
        """Type raw text into the currently focused element using the keyboard.

        This wraps ``page.keyboard.type(text)``.

        Usage guidelines:
        - Before calling this, use ``coord_click`` (or another focusing step available
          in this tool set) to focus the correct input element.

        Returns "OK: typed text='...'" on success or
        "ERROR: ..." with details on failure.
        """

        async def _do_type() -> None:
            await page.keyboard.type(text)

        operation = f"typed text={text!r}"
        return await _run_with_timeout(operation, _do_type())

    @tool("goto")
    async def goto(url: str) -> str:
        """Navigate the browser to a new absolute URL using Playwright ``page.goto(url)``.

        Usage guidelines:
        - Use when you need to open a completely new page or domain.
        - Prefer ``coord_click`` for in-page navigation that can be done by clicking links or buttons.
        - ``url`` should usually be an absolute URL starting with "http://" or "https://".
        - After calling this tool, rely on the next screenshot to understand the new page state.

        Returns "OK: navigated to url='...'" on success or
        "ERROR: ..." with details on failure.
        """
        operation = f"navigated to url={url!r}"
        return await _run_with_timeout(operation, page.goto(url))

    @tool("back")
    async def back() -> str:
        """Navigate one step back in browser history using Playwright ``page.go_back()``.

        Usage guidelines:
        - Use when you need to return to the previous page in the browser history.
        - Prefer this over manually re-entering a URL when you simply need to go back.
        - After calling this tool, rely on the next screenshot to understand the new page state.

        Returns "OK: navigated back in history" on success or
        "ERROR: ..." with details on failure.
        """
        operation = "navigated back in history"
        return await _run_with_timeout(operation, page.go_back())

    return [coord_click, scroll, type_text, goto, back]

def make_agent(
    page: Page,
    prompt: Optional[str] = None,
    is_success: Optional[Callable[[Page], Awaitable[bool]]] = None,
    *,
    tool_builder: Callable[[Page], list[Any]] = make_pw_tools,
    include_ui_manifest: bool = True,
):
    """Return a compiled LangGraph agent bound to the given Playwright page.

    Loop per turn:
    1) capture screenshot + accessibility UI manifest
    2) send both to the LLM (multimodal)
    3) execute any tool calls
    4) check success; if not, repeat
    """
    # Do not change: user requires this exact model setup
    model = init_chat_model("gemini-2.5-pro", model_provider="google_genai", temperature=1.0)

    # Require a task prompt (no fallback)
    if prompt is None or not str(prompt).strip():
        raise ValueError("prompt (task_prompt) must be provided for make_agent")

    tools = tool_builder(page)
    tools_by_name = {t.name: t for t in tools}
    supported_tool_names = ", ".join(sorted(f"'{name}'" for name in tools_by_name))
    model_with_tools = model.bind_tools(tools)

    async def llm_call(state: AgentState):
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

                roles_of_interest = {
                    "button",
                    "link",
                    "textbox",
                    "checkbox",
                    "radio",
                    "combobox",
                    "option",
                    "tab",
                    "tablist",
                    "tabpanel",
                    "heading",
                    "menuitem",
                    "listitem",
                    "group",
                    "dialog",
                    "spinbutton",
                    "slider",
                    "switch",
                    "progressbar",
                    "alert",
                }

                lines: list[str] = []

                def walk(node):
                    if not isinstance(node, dict):
                        return
                    role = node.get("role")
                    name = node.get("name")
                    disabled = node.get("disabled")
                    if not node.get("hidden"):
                        if role in roles_of_interest and (name or role in {"heading", "group", "tablist", "tabpanel"}):
                            suffix = " [disabled]" if disabled else ""
                            lines.append(f"- {role}: {name or '(no name)'}{suffix}")
                    for child in node.get("children", []) or []:
                        walk(child)

                walk(snap)
                if not lines:
                    return "UI_MANIFEST_EMPTY"
                return "\n".join(lines[:300])  # safety cap

            manifest = await build_ui_manifest()
        current_url = page.url

        # 2) Build a multimodal user message (text + image + UI_MANIFEST)
        content_parts: list[dict[str, Any]] = [
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
        if include_ui_manifest and manifest is not None:
            content_parts.append(
                {
                    "type": "text",
                    "text": f"<ui_manifest>\n{manifest}\n</ui_manifest>",
                }
            )

        user_msg = HumanMessage(content=content_parts)

        # 3) Send to LLM (with system prompt + required task prompt + history)
        task_prompt = prompt.strip()
        effective_prompt = f"{SYSTEM_PROMPT}\n<task>\n{task_prompt}\n</task>"
        ai_msg = await model_with_tools.ainvoke(
            [SystemMessage(content=effective_prompt)] + state["messages"] + [user_msg]
        )

        # Check success after LLM reasoning as well, in case the page
        # reached a success state between tool executions.
        success = state.get("task_success", False)
        if not success:
            try:
                success = await is_success(page)
            except Exception:
                success = False

        return {
            # Append both the user message we created and the AI response to state
            "messages": [user_msg, ai_msg],
            "llm_calls": state.get("llm_calls", 0) + 1,
            "task_success": success,
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

        # Preserve existing success flag; fresh checks are done in llm_call.
        success = state.get("task_success", False)
        return {"messages": results, "task_success": success}

    def should_continue_from_llm(state: AgentState) -> Literal["tool_node", "llm_call", END]:
        if state.get("task_success"):
            return END
        if state.get("llm_calls", 0) >= MAX_LLM_CALLS:
            return END
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "tool_node"
        # No tool calls: capture a fresh screenshot and ask the LLM again.
        return "llm_call"

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
