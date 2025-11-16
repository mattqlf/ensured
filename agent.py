from __future__ import annotations
import base64
import asyncio
import io
import operator
import os
from typing import Literal, Optional, Callable, Awaitable, Any
from pathlib import Path

from dotenv import load_dotenv
from typing_extensions import Annotated, TypedDict

from langchain.tools import tool
from langchain.chat_models import init_chat_model
from langchain.messages import AnyMessage, SystemMessage, ToolMessage, HumanMessage
from langgraph.graph import StateGraph, START, END

from playwright.async_api import Page
from PIL import Image
import moondream as md

load_dotenv()


def _load_system_prompt(prompt_filename: str = "prompt_v1.txt") -> str:
    prompts_dir = Path(__file__).resolve().parent / "prompts"
    path = prompts_dir / prompt_filename
    try:
        return path.read_text(encoding="utf-8").strip()
    except Exception as e:
        raise FileNotFoundError(f"Failed to load system prompt from {path}: {e}")


SYSTEM_PROMPT = _load_system_prompt("prompt_v6.txt")


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]
    llm_calls: int
    task_success: bool


def make_agent(
    page: Page,
    prompt: Optional[str] = None,
    is_success: Optional[Callable[[Page], Awaitable[bool]]] = None,
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

        This is your primary way to activate buttons, links, tabs, and other controls.
        Always try this ARIA-based tool first, using entries from the UI_MANIFEST,
        before falling back to coordinate-based tools such as ``coord_click``.

        This wraps ``page.get_by_role(role, name=name).click()`` and waits for the
        page to finish loading after the click (load state "load") before returning.

        Usage guidelines:
        - Choose ``role`` and ``name`` directly from the UI_MANIFEST shown with the screenshot.
        - Only click elements that appear in the UI_MANIFEST (e.g. roles ``button``, ``link``, ``tab``, ``menuitem``).
        - ``name`` must exactly match the text shown after the colon in UI_MANIFEST
          (for example, for "- button: Continue", use role="button", name="Continue").
        - Do not invent CSS selectors, XPath expressions, or guess at names; rely purely on role + name from UI_MANIFEST.
        - If this tool fails because no matching element exists or the manifest is incomplete,
          then consider using ``scroll`` to reveal more UI and, as a last resort, ``coord_click``.
        """
        locator = page.get_by_role(role, name=name) if name is not None else page.get_by_role(role)
        operation = f"clicked role={role!r} name={name!r}"

        async def _do_click() -> None:
            await locator.click()

        return await _run_with_timeout(operation, _do_click())

    @tool("check")
    async def check(role: str, name: Optional[str] = None) -> str:
        """Ensure a checkbox-like control is checked using its ARIA role and accessible name.

        This ARIA-based tool should be your first choice for toggles, checkboxes, radios,
        and switches whenever the target appears in the UI_MANIFEST. Only if a matching
        role+name cannot be found or this tool repeatedly fails should you fall back
        to the coordinate-based ``coord_click`` tool.

        This wraps ``page.get_by_role(role, name=name).check()`` and is intended for roles
        such as "checkbox", "radio", or "switch".

        Usage guidelines:
        - Use only for elements with roles that support a checked state ("checkbox", "radio", "switch").
        - Choose ``role`` and ``name`` exactly from UI_MANIFEST; do not guess.
        - Use this to turn something ON. It will not uncheck a control that is already checked.
        """
        locator = page.get_by_role(role, name=name) if name is not None else page.get_by_role(role)
        operation = f"checked role={role!r} name={name!r}"
        return await _run_with_timeout(operation, locator.check())

    @tool("input")
    async def input_text(role: str, name: Optional[str] = None, value: str = "") -> str:
        """Enter text into an input-like element using its ARIA role and accessible name.

        This is the preferred way to fill textboxes, comboboxes, and similar fields:
        always try this ARIA-based tool first using UI_MANIFEST information, before
        resorting to coordinate-based focus plus the ``type`` tool.

        This wraps ``page.get_by_role(role, name=name).fill(value)``.

        Usage guidelines:
        - Use for roles such as "textbox" or "combobox" that appear in UI_MANIFEST.
        - Choose ``role`` and ``name`` exactly from UI_MANIFEST; do not invent values.
        - ``value`` should be the exact text that should appear in the field; existing contents are replaced.
        - Do not send key-by-key commands (like "TAB" or "ENTER"); provide only the final text.
        """
        locator = page.get_by_role(role, name=name) if name is not None else page.get_by_role(role)
        operation = f"filled role={role!r} name={name!r} with value={value!r}"
        return await _run_with_timeout(operation, locator.fill(value))

    @tool("dropdown")
    async def dropdown(role: str, name: Optional[str] = None, option: str = "") -> str:
        """Select an option from a dropdown or combobox using its ARIA role and accessible name.

        This is the preferred way to choose a value from native select elements
        and ARIA comboboxes when they are exposed via ``get_by_role``.

        This wraps ``page.get_by_role(role, name=name).select_option(label=option)``.

        Usage guidelines:
        - Use for roles such as "combobox" or other dropdown-like controls that appear in UI_MANIFEST.
        - Choose ``role`` and ``name`` exactly from UI_MANIFEST; do not invent values.
        - ``option`` should match the visible text label of the option you want to select.
        """
        locator = page.get_by_role(role, name=name) if name is not None else page.get_by_role(role)
        operation = f"selected option={option!r} for role={role!r} name={name!r}"
        return await _run_with_timeout(operation, locator.select_option(label=option))

    @tool("coord_click")
    async def coord_click(prompt: str, button: str = "left") -> str:
        """Ask a vision model where to click in the current screenshot, then click there.

        This is a coordinate-based fallback. Use it only after ARIA-based tools
        (``click``, ``check``, ``input``) have failed or are clearly not applicable
        because the needed control does not appear in the UI_MANIFEST.

        Typical use:
        - You know which visual element you want to interact with, but you cannot
          address it via ARIA role + name (for example, it is missing from UI_MANIFEST
          or is purely decorative) and ARIA tools have already been tried.

        Arguments:
        - ``prompt``: A clear question or instruction that describes exactly one clickable
          visual target in the *current* screenshot. Phrase it as "Where is ...?" or
          "Point to ...", and mention distinguishing details such as text, color, icon,
          or approximate position.
        - ``button``: Which mouse button to use for the click. Defaults to ``"left"``.

        Usage tips:
        - Be specific and concrete in ``prompt``; mention visible text labels, colors,
          icons, or positions (e.g. "the green 'Continue' button in the bottom-right").
        - Refer only to elements that are visible in the current screenshot.
        - Avoid asking about multiple elements at once; keep each call focused on a
          single target to get a precise point.
        """
        try:
            page.set_default_timeout(TIMEOUT_MS)
        except Exception:
            pass

        api_key = os.getenv("MOONDREAM_API_KEY")
        if not api_key:
            return "ERROR: MOONDREAM_API_KEY environment variable is not set"

        try:
            # Capture a fresh screenshot of the current viewport
            png_bytes = await page.screenshot(type="png", full_page=False)
            image = Image.open(io.BytesIO(png_bytes))

            # Initialize Moondream model
            model = md.vl(api_key=api_key)

            # Run Moondream point inference in a worker thread to avoid blocking the event loop
            def _call_moondream() -> Any:
                return model.point(image, prompt)

            try:
                result = await asyncio.wait_for(
                    asyncio.to_thread(_call_moondream),
                    timeout=TIMEOUT_MS / 1000,
                )
            except asyncio.TimeoutError as e:
                return f"ERROR: Timeout during Moondream point call: {e}"

            points = result.get("points") or []
            if not points:
                return "ERROR: Moondream returned no points"

            point = points[0]
            x_norm = float(point.get("x", 0.0))
            y_norm = float(point.get("y", 0.0))

            # Scale by default viewport size
            x_scaled = x_norm * 1280.0
            y_scaled = y_norm * 720.0

            async def _do_click() -> None:
                await page.mouse.click(x_scaled, y_scaled, button=button)

            try:
                await asyncio.wait_for(_do_click(), timeout=TIMEOUT_MS / 1000)
            except asyncio.TimeoutError as e:
                return f"ERROR: Timeout during Playwright click: {e}"

            # Return normalized coordinates as requested, in (x, y) form
            return f"({x_norm}, {y_norm})"
        except Exception as e:
            return f"ERROR: {type(e).__name__}: {e}"

    @tool("scroll")
    async def scroll(delta_x: float = 0, delta_y: float = 0) -> str:
        """Scroll the page using mouse wheel deltas ``(delta_x, delta_y)``.

        Use this to reveal more content so that ARIA-based tools (``click``, ``check``,
        ``input``) can be applied to newly visible controls. Scrolling is often a good
        step before giving up on ARIA and falling back to ``coord_click``.

        This wraps ``page.mouse.wheel(delta_x, delta_y)``.

        Usage guidelines:
        - Positive ``delta_y`` scrolls down; negative scrolls up.
        - Positive ``delta_x`` scrolls right; negative scrolls left.
        - Use small increments (for example 200–800) rather than huge jumps, so you can
          observe intermediate states in subsequent screenshots.
        - Avoid excessive scrolling that would move far away from relevant content.
        """

        async def _do_scroll() -> None:
            await page.mouse.wheel(delta_x, delta_y)

        operation = f"scrolled by (delta_x={delta_x}, delta_y={delta_y})"
        return await _run_with_timeout(operation, _do_scroll())

    @tool("type")
    async def type_text(text: str) -> str:
        """Type raw text into the currently focused element using the keyboard.

        This is a low-level, coordinate-based fallback for entering text.
        Prefer the ARIA-based ``input`` tool whenever possible. Only use
        ``type`` after you have already tried ``input`` and, if needed,
        focused the correct field via ``coord_click``.

        This wraps ``page.keyboard.type(text)``.

        Usage guidelines:
        - Before calling this, use ARIA tools (``input``) when the field is in UI_MANIFEST.
        - If ARIA input fails or is not available, you may use ``coord_click`` to focus
          the correct input element, then call ``type`` with the text you want to enter.
        """

        async def _do_type() -> None:
            await page.keyboard.type(text)

        operation = f"typed text={text!r}"
        return await _run_with_timeout(operation, _do_type())

    @tool("keypress")
    async def keypress(key: str) -> str:
        """Press a single key or key combination on the keyboard.

        This wraps ``page.keyboard.press(key)`` and is useful for actions that are
        naturally triggered by keyboard input, such as pressing Enter to submit a
        message or form, Escape to close a dialog, or arrow keys to navigate lists.

        Usage guidelines:
        - Prefer ARIA-based tools (``click``, ``input``, ``check``) when you can act
          directly on a control. Use ``keypress`` when the UI specifically expects
          a key event (e.g. chat apps that send on Enter, modals that close on Escape).
        - Ensure the correct element is focused before calling ``keypress``. Use
          ARIA tools (or ``coord_click`` as a fallback) to move focus as needed.
        - Use Playwright key notation, such as "Enter", "Tab", "Escape",
          "ArrowUp", "ArrowDown", or combinations like "Control+Enter".
        """

        async def _do_press() -> None:
            await page.keyboard.press(key)

        operation = f"pressed key={key!r}"
        return await _run_with_timeout(operation, _do_press())

    @tool("goto")
    async def goto(url: str) -> str:
        """Navigate the browser to a new absolute URL using Playwright ``page.goto(url)``.

        Usage guidelines:
        - Use when you need to open a completely new page or domain.
        - Prefer ARIA-based ``click`` for in-page navigation that can be done by clicking links or buttons.
        - ``url`` should usually be an absolute URL starting with "http://" or "https://".
        - After calling this tool, rely on the next screenshot and UI_MANIFEST to understand the new page state.
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
        """
        operation = "navigated back in history"
        return await _run_with_timeout(operation, page.go_back())

    @tool("wait")
    async def wait(seconds: float = 1.0) -> str:
        """Pause for a short time to let the UI settle before taking further actions.

        This tool simply waits for the requested number of seconds, without
        performing any Playwright actions. Use it sparingly when asynchronous
        content (such as results lists, feeds, or dynamically loaded forms)
        needs extra time to appear or finish updating after a prior action.

        Usage guidelines:
        - Prefer to use ARIA-based tools (``click``, ``input``, ``check``) first;
          only call ``wait`` if the expected elements are still missing and
          likely just need more time to load.
        - Keep ``seconds`` small (for example 1–3 seconds). Avoid chaining many
          long waits; instead, wait briefly and then re-check the UI_MANIFEST.
        - Do not use this to stall indefinitely; every call should be purposeful
          (e.g. "wait 2 seconds for the search results to load").
        """
        # Clamp to a reasonable range to avoid very long delays.
        duration = max(0.0, min(float(seconds), 10.0))
        await asyncio.sleep(duration)
        return f"OK: waited {duration} seconds"

    # Unified toolset: ARIA-first tools plus coordinate-based and timing fallbacks.
    tools = [click, check, input_text, dropdown, coord_click, scroll, type_text, keypress, goto, back, wait]
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
    builder.add_conditional_edges("llm_call", should_continue_from_llm, ["tool_node", "llm_call", END])
    builder.add_conditional_edges("tool_node", should_continue_from_tool, ["llm_call", END])

    return builder.compile()


__all__ = ["make_agent", "AgentState", "SYSTEM_PROMPT"]
