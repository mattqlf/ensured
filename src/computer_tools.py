from __future__ import annotations

import asyncio
import io
import os
from typing import Any, Awaitable, Dict, List, Tuple

from langchain.tools import tool
from PIL import Image
import moondream as md


async def _run_with_timeout(
    operation: str,
    coro: Awaitable[object],
    timeout_s: float,
) -> str:
    """Run a coroutine with a timeout and return a simple status string."""
    try:
        await asyncio.wait_for(coro, timeout=timeout_s)
        return f"OK: {operation}"
    except Exception as e:
        return f"ERROR: {type(e).__name__}: {e}"


def make_tools(
    computer: Any,
    timeout_s: float,
) -> Tuple[List[Any], Dict[str, Any], str]:
    """Create the suite of computer interaction tools bound to the given Computer instance."""
    interface = computer.interface

    @tool("type_text")
    async def type_text(text: str) -> str:
        """Type raw text into the currently focused element using the keyboard.

        Usage guidelines:
        - Ensure the correct input field is focused (e.g., via a click) before calling this.
        - Use this for free-form text entry such as filling forms or writing commands.
        """

        async def _do_type() -> None:
            await interface.type_text(text)

        operation = f"typed text={text!r}"
        return await _run_with_timeout(operation, _do_type(), timeout_s)

    @tool("press_key")
    async def press_key(key: str) -> str:
        """Press a single key on the keyboard (e.g., \"enter\", \"escape\").

        Usage guidelines:
        - Use this when the UI expects a specific key event, such as Enter to submit.
        - Combine with ``type_text`` and mouse actions for more complex workflows.
        """

        async def _do_press() -> None:
            await interface.press_key(key)

        operation = f"pressed key={key!r}"
        return await _run_with_timeout(operation, _do_press(), timeout_s)

    @tool("hotkey")
    async def hotkey(modifier: str, key: str) -> str:
        """Press a key combination such as Command+C or Control+V.

        Usage guidelines:
        - Use modifier keys like \"command\", \"control\", \"shift\", or \"alt\".
        - Use for shortcuts such as copy, paste, select-all, or undo.
        """

        async def _do_hotkey() -> None:
            await interface.hotkey(modifier, key)

        operation = f"pressed hotkey combination ({modifier!r}, {key!r})"
        return await _run_with_timeout(operation, _do_hotkey(), timeout_s)

    @tool("run_command")
    async def run_command(command: str) -> str:
        """Run a shell command inside the sandbox and return its result.

        Usage guidelines:
        - Use standard shell commands to explore and inspect the filesystem, such as:
          - \"pwd\" to print the current directory
          - \"ls\" or \"ls -la\" to list files
          - \"cd /path && ls\" to change directory and list contents
          - \"cat file.txt\" to view file contents
          - \"grep -R 'pattern' .\" to search recursively
        - Prefer simple, safe commands that are relevant to the task.
        - Output includes the return code, stdout, and stderr (truncated if very long).
        """


        async def _do_run() -> Any:
            return await interface.run_command(command)

        try:
            result = await asyncio.wait_for(_do_run(), timeout=timeout_s)
            stdout = getattr(result, "stdout", "")
            stderr = getattr(result, "stderr", "")
            returncode = getattr(result, "returncode", None)

            max_len = 4000
            stdout_str = str(stdout)
            stderr_str = str(stderr)
            if len(stdout_str) > max_len:
                stdout_str = stdout_str[:max_len] + "...[truncated]"
            if len(stderr_str) > max_len:
                stderr_str = stderr_str[:max_len] + "...[truncated]"

            return (
                f"OK: command={command!r} "
                f"returncode={returncode}\nSTDOUT:\n{stdout_str}\nSTDERR:\n{stderr_str}"
            )
        except Exception as e:
            return f"ERROR: {type(e).__name__}: {e}"

    @tool("launch")
    async def launch(command: str) -> str:
        """Launch an application or process inside the sandbox.

        Examples:
        - \"xfce4-terminal\"
        - \"libreoffice --writer\"
        """

        async def _do_launch() -> None:
            await interface.launch(command)

        operation = f"launched application={command!r}"
        return await _run_with_timeout(operation, _do_launch(), timeout_s)

    @tool("open")
    async def open(target: str) -> str:
        """Open a URL or file using the sandbox environment's default handler.

        Examples:
        - \"https://www.google.com\"
        - \"/path/to/document.pdf\"
        """

        async def _do_open() -> None:
            await interface.open(target)

        operation = f"opened target={target!r}"
        return await _run_with_timeout(operation, _do_open(), timeout_s)

    @tool("scroll")
    async def scroll(delta_x: float = 0, delta_y: float = 0) -> str:
        """Scroll the screen using mouse wheel deltas ``(delta_x, delta_y)``.

        This wraps ``computer.interface.scroll(delta_x, delta_y)``.

        Usage guidelines:
        - Positive ``delta_y`` scrolls down; negative scrolls up.
        - Positive ``delta_x`` scrolls right; negative scrolls left.
        - Use moderate values (e.g., 200–800) so you can observe intermediate states.
        - Avoid excessive scrolling that moves far away from relevant content.
        """

        async def _do_scroll() -> None:
            await interface.scroll(delta_x, delta_y)

        operation = f"scrolled by (delta_x={delta_x}, delta_y={delta_y})"
        return await _run_with_timeout(operation, _do_scroll(), timeout_s)


    @tool("get_accessibility_tree")
    async def get_accessibility_tree() -> str:
        """Retrieve the current accessibility tree for the sandboxed computer.

        Usage guidelines:
        - Use this to understand the current UI structure and available controls.
        - You may reference roles, names, or other properties when planning actions.
        """

        async def _do_get() -> Any:
            return await interface.get_accessibility_tree()

        try:
            tree = await asyncio.wait_for(_do_get(), timeout=timeout_s)
            return f"OK: accessibility_tree={tree}"
        except Exception as e:
            return f"ERROR: {type(e).__name__}: {e}"

    @tool("click")
    async def click(prompt: str, button: str = "left", num: str = "single") -> str:
        """Use a vision model (Moondream) to decide where to click, then click there.

        This tool analyzes the current computer screenshot to locate a visual target
        described by ``prompt``, then performs a mouse click at that location.

        Arguments:
        - ``prompt``: A clear instruction that describes exactly one visual target
          in the *current* screenshot (e.g., \"the green 'Continue' button\").
        - ``button``: Which mouse button to use (\"left\" or \"right\").
        - ``num``: Whether to perform a \"single\" or \"double\" click.
        """

        api_key = os.getenv("MOONDREAM_API_KEY")
        if not api_key:
            return "ERROR: MOONDREAM_API_KEY environment variable is not set"

        try:
            png_bytes = await interface.screenshot()
            image = Image.open(io.BytesIO(png_bytes))

            model = md.vl(api_key=api_key)

            def _call_moondream() -> Any:
                return model.point(image, prompt)

            try:
                result = await asyncio.wait_for(
                    asyncio.to_thread(_call_moondream),
                    timeout=timeout_s,
                )
            except asyncio.TimeoutError as e:
                return f"ERROR: Timeout during Moondream point call: {e}"

            points = result.get("points") or []
            if not points:
                return "ERROR: Moondream returned no points"

            point = points[0]
            x_norm = float(point.get("x", 0.0))
            y_norm = float(point.get("y", 0.0))

            width, height = image.size
            x_scaled = x_norm * float(width)
            y_scaled = y_norm * float(height)

            button_norm = (button or "left").lower()
            num_norm = (num or "single").lower()

            async def _do_click() -> None:
                if num_norm.startswith("double"):
                    await interface.double_click(x_scaled, y_scaled)
                else:
                    if button_norm == "right":
                        await interface.right_click(x_scaled, y_scaled)
                    else:
                        await interface.move_cursor(x_scaled, y_scaled)
                        await interface.left_click()

            try:
                await asyncio.wait_for(_do_click(), timeout=timeout_s)
            except asyncio.TimeoutError as e:
                return f"ERROR: Timeout during computer click: {e}"

            return f"({x_norm}, {y_norm})"
        except Exception as e:
            return f"ERROR: {type(e).__name__}: {e}"

    @tool("wait")
    async def wait(seconds: float = 1.0) -> str:
        """Pause for a short time to let the UI settle before taking further actions.

        Usage guidelines:
        - Use this when the sandboxed UI needs time to update after actions.
        - Keep waits small (1–3 seconds) and purposeful.
        """
        duration = max(0.0, min(float(seconds), 10.0))
        await asyncio.sleep(duration)
        return f"OK: waited {duration} seconds"

    @tool("finish")
    async def finish(reason: str = "") -> str:
        """Signal that the task is fully complete and no further actions are needed."""
        return f"TASK_COMPLETE: {reason}"

    tools: List[Any] = [
        type_text,
        press_key,
        hotkey,
        run_command,
        launch,
        open,
        scroll,
        get_accessibility_tree,
        click,
        wait,
        finish,
    ]
    tools_by_name: Dict[str, Any] = {t.name: t for t in tools}
    supported_tool_names = ", ".join(sorted(f"'{name}'" for name in tools_by_name))

    return tools, tools_by_name, supported_tool_names


__all__ = ["make_tools"]
