import asyncio
from pathlib import Path
from playwright.async_api import async_playwright, Playwright

from agent import make_agent
from pathlib import Path

AUTH_STATE_PATH = Path(__file__).resolve().parent / "auth_state.json"


async def run(playwright: Playwright):
    browser = await playwright.webkit.launch()

    context_kwargs = {"record_video_dir": "videos/"}
    if AUTH_STATE_PATH.exists():
        context_kwargs["storage_state"] = str(AUTH_STATE_PATH)

    context = await browser.new_context(**context_kwargs)
    await context.tracing.start(screenshots=True, snapshots=True, sources=True)
    page = await context.new_page()

    await page.goto("http://localhost:8000/static/test_page2.html")

    async def heading_success(page):
        try:
            await page.get_by_role("heading", name="success").wait_for(timeout=1500)
            return True
        except Exception:
            return False

    agent = make_agent(page, prompt="Navigate to the success page.", is_success=heading_success)
    state = {"messages": [], "llm_calls": 0, "task_success": False}
    result = await agent.ainvoke(state)

    await context.tracing.stop(path = "trace.zip")

    print("Task success:", result.get("task_success"))
    await browser.close()


async def main():
    async with async_playwright() as p:
        await run(p)


if __name__ == "__main__":
    asyncio.run(main())
