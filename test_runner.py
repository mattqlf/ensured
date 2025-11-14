from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Callable, Awaitable
import traceback
import os
import time
from pathlib import Path

from playwright.async_api import async_playwright, Browser, Page

from agent import make_agent


@dataclass
class TestCase:
    url: str
    prompt: str  # required task prompt
    success_check: Optional[Callable[[Page], Awaitable[bool]]] = None


async def run_test_case(browser: Browser, case: TestCase) -> bool:
    context = await browser.new_context()
    # Start tracing prior to any page actions for this test case
    try:
        await context.tracing.start(screenshots=True, snapshots=True, sources=True)
    except Exception:
        # Non-fatal: continue even if tracing fails to start
        pass
    # Ensure no persisted cookies from previous runs
    try:
        await context.clear_cookies()
    except Exception:
        pass
    page = await context.new_page()
    try:
        await page.goto(case.url, wait_until="load")
        # Clear origin storage once per test (localStorage/sessionStorage) and reload
        try:
            await page.evaluate(
                """
                () => {
                  try { localStorage.clear(); } catch (e) {}
                  try { sessionStorage.clear(); } catch (e) {}
                }
                """
            )
            await page.reload(wait_until="load")
        except Exception:
            pass
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
        # Stop tracing and persist the trace to a unique file for this case
        try:
            traces_dir = Path(__file__).resolve().parent / "traces"
            traces_dir.mkdir(exist_ok=True)
            slug = case.url.rsplit('/', 1)[-1].split('?')[0]
            slug = (slug.rsplit('.', 1)[0]) or "page"
            trace_path = traces_dir / f"trace_{slug}_{int(time.time()*1000)}.zip"
            await context.tracing.stop(path=str(trace_path))
            print(f"Saved trace to {trace_path}")
        except Exception:
            pass
        await context.close()


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
    # Base URL for tests. Targets the React pages in the Next app.
    # Start Next first: `cd tests && npm run dev`
    # Override via env var if needed:
    #   TEST_BASE_URL=http://localhost:3000/cases/
    base = os.environ.get("TEST_BASE_URL", "http://localhost:3000/cases/")

    # Normalize base to end with /cases/
    base = base.rstrip("/")
    if not base.endswith("/cases"):
        base = base + "/cases"

    # Helper: success when heading name equals provided text (exact match)
    def heading_success(name: str) -> Callable[[Page], Awaitable[bool]]:
        async def _check(page: Page) -> bool:
            try:
                await page.get_by_role("heading", name=name).wait_for(timeout=1500)
                return True
            except Exception:
                return False
        return _check

    next_paths = {
        "test_page.html": "test-page",
        "test_page2.html": "test-page2",
        "test_exam.html": "exam",
        "test_hard.html": "hard/start",
        "test_ultra.html": "ultra/start",
        "test_llm_form.html": "llm-form/start",
    }

    def path(name: str) -> str:
        return base.rstrip("/") + "/" + next_paths[name]

    cases: List[TestCase] = [
        # TestCase(
        #     url=path("test_page.html"),
        #     prompt="Navigate to the success page.",
        #     success_check=heading_success("success"),
        # ),
        # TestCase(
        #     url=path("test_page2.html"),
        #     prompt="Navigate to the success page.",
        #     success_check=heading_success("success"),
        # ),
        # TestCase(
        #     url=path("test_exam.html"),
        #     prompt="Complete the exam and submit.",
        #     success_check=heading_success("success"),
        # ),
        # TestCase(
        #     url=path("test_hard.html"),
        #     prompt="Place a successful order.",
        #     success_check=heading_success("success"),
        # ),
        # TestCase(
        #     url=path("test_ultra.html"),
        #     prompt="Place a successful order.",
        #     success_check=heading_success("success"),
        # ),
        TestCase(
            url=path("test_llm_form.html") + "?task=hackernews-top-post",
            prompt=(
                "Go to Show HackerNews and get the top post. "
                "Then return to the submission form and enter your final answer so it can be graded."
            ),
            success_check=heading_success("success"),
        ),
    ]

    summary = asyncio.run(run_all(cases, concurrency=len(cases)))
    print(f"Succeeded {summary['succeeded']} / {summary['total']}")
    for r in summary["results"]:
        print(f"- {r['url']}: {'OK' if r['success'] else 'FAIL'}")


if __name__ == "__main__":
    main()
