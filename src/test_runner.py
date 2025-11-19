from __future__ import annotations

import os

import asyncio
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import argparse
import json
import time
import traceback
from pathlib import Path
from datetime import datetime, timezone

import requests
from langsmith import uuid7

from playwright.async_api import async_playwright, Browser

from agent import make_agent
import cli_auth

from rich.console import Console
from rich.text import Text
from rich.progress import Progress, BarColumn, TextColumn, TimeElapsedColumn, TimeRemainingColumn

console = Console()

@dataclass
class TestCase:
    url: str
    prompt: str  # required task prompt


# auth_state.json and traces/ live at the project root, one level above src/.
AUTH_STATE_PATH = Path(__file__).resolve().parents[1] / "auth_state.json"


def _serialize_messages(messages: List[Any]) -> List[Dict[str, Any]]:
    """Convert LangChain messages to a JSON-serializable format."""
    serialized = []
    for msg in messages:
        role = "unknown"
        if msg.type == "human":
            role = "user"
        elif msg.type == "ai":
            role = "assistant"
        elif msg.type == "tool":
            role = "tool"
        elif msg.type == "system":
            role = "system"
        
        content = msg.content
        # Simplify content if it's a list (multimodal)
        if isinstance(content, list):
            processed_content = []
            for part in content:
                if isinstance(part, dict):
                    if part.get("type") == "image_url":
                         processed_content.append({"type": "image", "url": part["image_url"]["url"]})
                    elif part.get("type") == "image":
                        # Truncate huge base64 strings for logging/display if needed, 
                        # but for now we keep them so the frontend can render.
                        # If it's too big for Firestore (1MB), this will fail.
                        # Ideally we'd upload to storage, but for now let's try saving.
                        processed_content.append(part) 
                    else:
                        processed_content.append(part)
                else:
                    processed_content.append(str(part))
            content = processed_content

        entry = {
            "role": role,
            "content": content,
            "type": msg.type
        }
        
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            entry["tool_calls"] = msg.tool_calls
        if hasattr(msg, "tool_call_id"):
            entry["tool_call_id"] = msg.tool_call_id
        if hasattr(msg, "name"):
            entry["name"] = msg.name

        serialized.append(entry)
    return serialized


def save_run_to_api(run_id: str, url: str, prompt: str, status: str, messages: List[Any], timestamp: str):
    """Send the run transcript to the API."""
    try:
        token = cli_auth.get_token_silent()
        if not token:
            return

        transcript = _serialize_messages(messages)
        api_url = "http://localhost:3000/api/runs" # Assuming local dev
        # Check env var for base URL if needed
        if os.environ.get("TEST_BASE_URL"):
             # Try to infer API base from TEST_BASE_URL if it's pointing to the app
             pass

        payload = {
            "run_id": run_id,
            "url": url,
            "prompt": prompt,
            "status": status,
            "transcript": transcript,
            "timestamp": timestamp
        }

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        response = requests.post(api_url, json=payload, headers=headers, timeout=10)
        if response.status_code != 200:
             console.print(f"[yellow]Warning: Failed to save run to API: {response.status_code} {response.text}[/yellow]")

    except Exception as e:
         console.print(f"[yellow]Warning: Error saving run to API: {e}[/yellow]")


async def run_test_case_browser(browser: Browser, case: TestCase) -> tuple[bool, str]:
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
    run_id = str(uuid7())
    messages = []
    status = "running"
    # Generate a stable timestamp for this run (timezone-aware, UTC).
    run_timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    
    try:
        await page.goto(case.url, wait_until="load")
        agent = make_agent(page, prompt=case.prompt, include_ui_manifest=True, mode="browser", run_id=run_id)
        state = {"messages": [], "llm_calls": 0, "status": "in_progress"}
        
        # Create initial run entry
        await asyncio.to_thread(save_run_to_api, run_id, case.url, case.prompt, status, [], run_timestamp)

        async for chunk in agent.astream(state, {"recursion_limit": 100}, stream_mode="values"):
            messages = chunk.get("messages", [])
            status = chunk.get("status", "in_progress")
            await asyncio.to_thread(save_run_to_api, run_id, case.url, case.prompt, status, messages, run_timestamp)
        
        # Consider a test "succeeded" only when the agent has explicitly
        # finished the task with a successful outcome: status == "success".
        return status == "success", run_id
    except Exception as e:
        # Treat any exception as a failure; print a brief reason for debugging
        console.print(f"[bold red]ERROR running {case.url}: {e.__class__.__name__}: {e}[/bold red]")
        tb = traceback.format_exc(limit=2)
        console.print(tb.strip())
        status = "failure"
        try:
            # Attempt a quick failure screenshot for diagnosis
            png = await page.screenshot(full_page=False)
            fname = f"failure_{int(time.time())}.png"
            with open(fname, "wb") as f:
                f.write(png)
            console.print(f"[yellow]Saved failure screenshot to {fname}[/yellow]")
        except Exception:
            pass
        return False, run_id
    finally:
        # Final save
        await asyncio.to_thread(save_run_to_api, run_id, case.url, case.prompt, status, messages, run_timestamp)

        # Stop tracing and persist the trace to a unique file for this case
        try:
            traces_dir = Path(__file__).resolve().parents[1] / "traces"
            traces_dir.mkdir(exist_ok=True)
            slug = case.url.rsplit('/', 1)[-1].split('?')[0]
            slug = (slug.rsplit('.', 1)[0]) or "page"
            trace_path = traces_dir / f"trace_{slug}_{int(time.time()*1000)}.zip"
            await context.tracing.stop(path=str(trace_path))
            console.print(f"[dim]Saved trace to {trace_path}[/dim]")
        except Exception:
            pass
        await context.close()


async def run_test_case_computer(case: TestCase) -> tuple[bool, str]:
    """Run a single test case against a Computer-based UI."""
    try:
        # Import here so computer is only required when using computer mode.
        from computer import Computer  # type: ignore
    except Exception as e:  # pragma: no cover - import guard
        console.print(
            f"[bold red]ERROR: computer mode requested but 'computer' package is not available: {e}[/bold red]"
        )
        return False, ""

    computer = Computer(
        os_type="linux",
        provider_type="docker",
        image="trycua/cua-xfce:latest",
        name="my-xfce-sandbox"
    )

    run_id = str(uuid7())
    messages = []
    status = "running"
    # Generate a stable timestamp for this run (timezone-aware, UTC).
    run_timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    try:
        await computer.run()

        # Open the starting URL inside the sandbox (e.g., in a browser).
        await computer.interface.open(case.url)

        agent = make_agent(
            computer,
            prompt=case.prompt,
            mode="computer",
            include_ui_manifest=True,
            run_id=run_id
        )
        state: Dict[str, Any] = {"messages": [], "llm_calls": 0, "status": "in_progress"}
        
        # Create initial run entry
        await asyncio.to_thread(save_run_to_api, run_id, case.url, case.prompt, status, [], run_timestamp)
        
        async for chunk in agent.astream(state, {"recursion_limit": 100}, stream_mode="values"):
            messages = chunk.get("messages", [])
            status = chunk.get("status", "in_progress")
            await asyncio.to_thread(save_run_to_api, run_id, case.url, case.prompt, status, messages, run_timestamp)

        return status == "success", run_id
    except Exception as e:
        console.print(f"[bold red]ERROR running (computer) {case.url}: {e.__class__.__name__}: {e}[/bold red]")
        tb = traceback.format_exc(limit=2)
        console.print(tb.strip())
        status = "failure"
        return False, run_id
    finally:
        await asyncio.to_thread(save_run_to_api, run_id, case.url, case.prompt, status, messages, run_timestamp)
        try:
            await computer.stop()
        except Exception:
            pass


async def run_all(
    cases: List[TestCase],
    concurrency: int = 3,
    agent_type: str = "browser",
    progress: Optional[Progress] = None,
    progress_task_id: Any | None = None,
) -> Dict[str, Any]:
    results: List[Dict[str, Any]] = [None] * len(cases)  # type: ignore
    sem = asyncio.Semaphore(max(1, concurrency))

    def _advance_progress() -> None:
        if progress is not None and progress_task_id is not None:
            progress.advance(progress_task_id)

    if agent_type == "computer":
        async def run_idx(i: int, case: TestCase) -> None:
            async with sem:
                ok, run_id = await run_test_case_computer(case)
                results[i] = {
                    "url": case.url,
                    "success": ok,
                    "prompt": case.prompt,
                    "run_id": run_id,
                }
                _advance_progress()

        tasks = [asyncio.create_task(run_idx(i, c)) for i, c in enumerate(cases)]
        await asyncio.gather(*tasks)
    else:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            try:
                async def run_idx(i: int, case: TestCase) -> None:
                    async with sem:
                        ok, run_id = await run_test_case_browser(browser, case)
                        results[i] = {
                            "url": case.url,
                            "success": ok,
                            "prompt": case.prompt,
                            "run_id": run_id,
                        }
                        _advance_progress()

                tasks = [asyncio.create_task(run_idx(i, c)) for i, c in enumerate(cases)]
                await asyncio.gather(*tasks)
            finally:
                await browser.close()

    succeeded = sum(1 for r in results if r and r["success"])  # type: ignore
    failed = len(cases) - succeeded
    return {"total": len(cases), "succeeded": succeeded, "failed": failed, "results": results}


def main(argv: list[str] | None = None) -> None:
    # Ensure the user is authenticated via the CLI.
    cli_auth.get_or_prompt_token()

    parser = argparse.ArgumentParser(description="Run LLM-driven UI tests.")
    parser.add_argument(
        "--agent-type",
        choices=["browser", "computer"],
        default="browser",
        help="Which agent backend to use for tests.",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=None,
        help="Maximum number of concurrent tests (default: all for browser, 1 for computer).",
    )
    args = parser.parse_args(argv)

    # Base origin for tests (required).
    # Example: TEST_BASE_URL=http://localhost:3000
    base = os.environ["TEST_BASE_URL"].rstrip("/")

    # Load structured test definitions from tests/test_cases.json at the project root.
    tests_path = Path(__file__).resolve().parents[1] / "tests" / "test_cases.json"
    try:
        raw = json.loads(tests_path.read_text())
    except FileNotFoundError:
        console.print(f"[bold red]Error: Test cases file not found at {tests_path}[/bold red]")
        return
    except json.JSONDecodeError:
        console.print(f"[bold red]Error: Invalid JSON in {tests_path}[/bold red]")
        return

    cases: List[TestCase] = []
    for entry in raw:
        starting_url = str(entry.get("starting_url", "")).strip()
        task_prompt = str(entry.get("task_prompt", "")).strip()
        if not starting_url or not task_prompt:
            continue

        # Allow either absolute URLs or paths starting with /cases/ etc.
        if starting_url.startswith("http://") or starting_url.startswith("https://"):
            full_url = starting_url
        else:
            full_url = base + starting_url

        cases.append(TestCase(url=full_url, prompt=task_prompt))

    if args.concurrency is not None:
        concurrency = max(1, args.concurrency)
    else:
        # Default to full parallelism for browser, single-threaded for computer.
        concurrency = len(cases) if args.agent_type == "browser" else 1

    # Use a single progress bar to track overall test execution.
    progress = Progress(
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("{task.completed}/{task.total}"),
        TimeElapsedColumn(),
        TimeRemainingColumn(),
        console=console,
    )

    async def _run_all_with_progress() -> Dict[str, Any]:
        task_id = progress.add_task("Running tests", total=len(cases))
        summary = await run_all(
            cases,
            concurrency=concurrency,
            agent_type=args.agent_type,
            progress=progress,
            progress_task_id=task_id,
        )
        # Ensure progress is marked complete even if concurrency or results differ.
        progress.update(task_id, completed=len(cases))
        return summary

    console.print(Text("Starting tests...", style="bold magenta"))
    with progress:
        summary = asyncio.run(_run_all_with_progress())
    console.print(Text("All tests finished.", style="bold magenta"))

    console.print(f"\n[bold]Summary:[/bold]")
    console.print(f"Succeeded [green]{summary['succeeded']}[/green] / [bold]{summary['total']}[/bold]")
    if summary['failed'] > 0:
        console.print(f"Failed [red]{summary['failed']}[/red] / [bold]{summary['total']}[/bold]")

    for r in summary["results"]:
        status_text = "[green]OK" if r["success"] else "[red]FAIL"
        console.print(f"- [link={r['url']}]{r['url']}[/link]: {status_text} (Run ID: [dim]{r['run_id']}[/dim])")

if __name__ == "__main__":
    main()
