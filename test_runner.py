from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Callable, Awaitable
import traceback
import http.server
import socketserver
import threading
import contextlib
import functools
import os
import time

from playwright.async_api import async_playwright, Browser, Page

from agent import make_agent, SYSTEM_PROMPT


@dataclass
class TestCase:
    url: str
    prompt: str  # required task prompt
    success_check: Optional[Callable[[Page], Awaitable[bool]]] = None


async def run_test_case(browser: Browser, case: TestCase) -> bool:
    context = await browser.new_context()
    page = await context.new_page()
    try:
        await page.goto(case.url, wait_until="load")
        agent = make_agent(page, prompt=case.prompt, is_success=case.success_check)
        state = {"messages": [], "llm_calls": 0, "task_success": False}
        result = await agent.ainvoke(state)
        return bool(result.get("task_success"))
    except Exception as e:
        # Treat any exception as a failure; print a brief reason for debugging
        print(f"ERROR running {case.url}: {e.__class__.__name__}: {e}")
        tb = traceback.format_exc(limit=2)
        print(tb.strip())
        try:
            # Attempt a quick failure screenshot for diagnosis
            png = await page.screenshot(full_page=True)
            fname = f"failure_{int(time.time())}.png"
            with open(fname, "wb") as f:
                f.write(png)
            print(f"Saved failure screenshot to {fname}")
        except Exception:
            pass
        return False
    finally:
        await context.close()


class _ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


@contextlib.contextmanager
def maybe_start_static_server(port: int = 8000, directory: Optional[str] = None):
    """Start a simple static file server for the current directory if nothing is listening.

    If the port is busy, do nothing and just yield.
    """
    directory = directory or os.getcwd()
    Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory)
    server = None
    thread = None
    try:
        try:
            server = _ThreadingServer(("127.0.0.1", port), Handler)
        except OSError:
            # Port likely in use; skip starting a server
            yield False
            return
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        # Give the server a moment to start
        time.sleep(0.2)
        yield True
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()
        if thread is not None:
            thread.join(timeout=0.5)


async def run_all(cases: List[TestCase], concurrency: int = 3) -> Dict[str, Any]:
    results: List[Dict[str, Any]] = [None] * len(cases)  # type: ignore
    sem = asyncio.Semaphore(max(1, concurrency))

    async with async_playwright() as p:
        # Use WebKit to match your environment preference
        browser = await p.webkit.launch()
        try:
            async def run_idx(i: int, case: TestCase):
                async with sem:
                    ok = await run_test_case(browser, case)
                    results[i] = {"url": case.url, "success": ok, "prompt": case.prompt}

            tasks = [asyncio.create_task(run_idx(i, c)) for i, c in enumerate(cases)]
            await asyncio.gather(*tasks)
        finally:
            await browser.close()

    succeeded = sum(1 for r in results if r and r["success"])  # type: ignore
    failed = len(cases) - succeeded
    return {"total": len(cases), "succeeded": succeeded, "failed": failed, "results": results}


def main() -> None:
    base = "http://localhost:8000/"
    # Helper: success when heading name equals provided text (exact match)
    def heading_success(name: str) -> Callable[[Page], Awaitable[bool]]:
        async def _check(page: Page) -> bool:
            try:
                await page.get_by_role("heading", name=name).wait_for(timeout=1500)
                return True
            except Exception:
                return False
        return _check

    cases = [
        TestCase(
            url=base + "test_page.html",
            prompt="Navigate to the success page.",
            success_check=heading_success("success"),
        ),
        TestCase(
            url=base + "test_page2.html",
            prompt="Navigate to the success page.",
            success_check=heading_success("success"),
        ),
        TestCase(
            url=base + "test_exam.html",
            prompt="Complete the exam and submit.",
            success_check=heading_success("success"),
        )
    ]

    with maybe_start_static_server(port=8000) as started:
        if started:
            print("Started local static server on http://127.0.0.1:8000")
        summary = asyncio.run(run_all(cases, concurrency=3))
    print(f"Succeeded {summary['succeeded']} / {summary['total']}")
    for r in summary["results"]:
        print(f"- {r['url']}: {'OK' if r['success'] else 'FAIL'}")


if __name__ == "__main__":
    main()
