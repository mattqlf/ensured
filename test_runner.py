from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Awaitable
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


AUTH_STATE_PATH = Path(__file__).resolve().parent / "auth_state.json"


async def run_test_case(browser: Browser, case: TestCase) -> bool:
    # If an authenticated storage state exists (created by auth_setup.py),
    # reuse it so all tests start already logged in with a shared account.
    context_kwargs = {}
    if AUTH_STATE_PATH.exists():
        context_kwargs["storage_state"] = str(AUTH_STATE_PATH)

    context = await browser.new_context(**context_kwargs)
    try:
        # Start tracing prior to any page actions for this test case
        await context.tracing.start(screenshots=True, snapshots=True, sources=True)
    except Exception:
        # Non-fatal: continue even if tracing fails to start
        pass

    page = await context.new_page()
    try:
        await page.goto(case.url, wait_until="load")
        agent = make_agent(
            page,
            prompt=case.prompt,
            include_ui_manifest=True,
        )
        state = {"messages": [], "llm_calls": 0, "status": "in_progress"}
        result = await agent.ainvoke(state, {"recursion_limit": 100})
        # Consider a test "succeeded" only when the agent has explicitly
        # finished the task with a successful outcome: status == "success".
        return result.get("status") == "success"
    except Exception as e:
        # Treat any exception as a failure; print a brief reason for debugging
        print(f"ERROR running {case.url}: {e.__class__.__name__}: {e}")
        tb = traceback.format_exc(limit=2)
        print(tb.strip())
        try:
            # Attempt a quick failure screenshot for diagnosis
            png = await page.screenshot(full_page=False)
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
        # Use Chromium for running tests
        browser = await p.chromium.launch()
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
        TestCase(
            url=path("test_page.html"),
            prompt="Navigate to the success page.",
        ),
        TestCase(
            url=path("test_page2.html"),
            prompt="Navigate to the success page.",
        ),
        TestCase(
            url=path("test_exam.html"),
            prompt="Complete the exam and submit.",
        ),
        TestCase(
            url=path("test_hard.html"),
            prompt="Place a successful order.",
        ),
        TestCase(
            url=path("test_ultra.html"),
            prompt="Place a successful order.",
        ),
        TestCase(
            url=path("test_llm_form.html") + "?task=hackernews-top-post",
            prompt=(
                "Go to hackernews show and get the topmost post. "
                "Then return to the submission form and enter your answer so it can be graded."
            ),
        ),
        TestCase(
            url=path("test_llm_form.html") + "?task=linkedin-scouting",
            prompt=(
                "Research Jaesung Kim Li (CS @ University of Michigan) on LinkedIn."
                "Determine what high school he went to, go back to the form and submit your answer."
            ),
        ),
        TestCase(
            url=path("test_llm_form.html") + "?task=instagram-follower-count",
            prompt=(
                "Go to Instagram and go to my profile and get my follower count."
                "Then, return to the submission form and submit your answer."
            ),
        ),
        TestCase(
            url=path("test_llm_form.html") + "?task=discord-message",
            prompt=(
                "Go to Discord and text NotThatBot a paragraph of random philosophical rambling."
                "Only after you complete this task can you return to the submission form and submit the answer."
            ),
        ),
        TestCase(
            url=path("test_llm_form.html") + "?task=llm-research",
            prompt=(
                "Perform research on the latest developments on Diffusion LLMs. Then, open Gmail and send an email to "
                "mattqinli2569@gmail.com with a 2 page report your findings. Then, wait until you receive an email from"
                "mattqinli2569@gmail.com, which will contain the answer. Once you get the answer, return to the submission form and submit the answer."
            ),
        )
    ]

    summary = asyncio.run(run_all(cases, concurrency=len(cases)))
    print(f"Succeeded {summary['succeeded']} / {summary['total']}")
    for r in summary["results"]:
        print(f"- {r['url']}: {'OK' if r['success'] else 'FAIL'}")


if __name__ == "__main__":
    main()
