from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Callable, Awaitable, Dict, Any, List

from dotenv import load_dotenv
from playwright.async_api import async_playwright, Page


AUTH_STATE_PATH = Path(__file__).resolve().parent / "auth_state.json"


# ---- Per-service login helpers -------------------------------------------------

async def login_default(page: Page, username: str, password: str, login_url: str) -> None:
    """Generic login flow using AUTH_LOGIN_URL / AUTH_USERNAME / AUTH_PASSWORD.

    You should customize selectors below to match your app's login form.
    """
    await page.goto(login_url)
    await page.get_by_label("Email").fill(username)
    await page.get_by_label("Password").fill(password)
    await page.get_by_role("button", name="Sign in").click()
    await page.wait_for_load_state("networkidle")


async def login_github(page: Page, username: str, password: str, login_url: str | None = None) -> None:
    """Login flow for GitHub using GITHUB_USERNAME / GITHUB_PASSWORD."""
    await page.goto(login_url or "https://github.com/login")
    await page.get_by_label("Username or email address").fill(username)
    await page.get_by_label("Password").fill(password)
    await page.get_by_role("button", name="Sign in").click()
    await page.wait_for_url("https://github.com/")


async def login_linkedin(page: Page, username: str, password: str, login_url: str | None = None) -> None:
    """Login flow for LinkedIn using LINKEDIN_USERNAME / LINKEDIN_PASSWORD.

    NOTE: Labels and flows can change; adjust selectors if this stops working.
    """
    await page.goto(login_url or "https://www.linkedin.com/login")
    # Labels vary slightly by locale; tweak if needed.
    await page.get_by_label("Email or Phone").fill(username)
    await page.get_by_label("Password").fill(password)
    # Use exact text match so we avoid "Sign in with Apple" / "Sign in with a passkey".
    await page.get_by_role("button", name="Sign in", exact=True).click()


SERVICE_CONFIG: Dict[str, Dict[str, Any]] = {
    # Backwards-compatible "default" app using AUTH_LOGIN_URL / AUTH_USERNAME / AUTH_PASSWORD.
    "default": {
        "login_func": login_default,
        "username_env": "AUTH_USERNAME",
        "password_env": "AUTH_PASSWORD",
        "login_url_env": "AUTH_LOGIN_URL",
    },
    # Example built-ins for public services. You can add more entries here as needed.
    "github": {
        "login_func": login_github,
        "username_env": "GITHUB_USERNAME",
        "password_env": "GITHUB_PASSWORD",
        "login_url_env": None,
    },
    "linkedin": {
        "login_func": login_linkedin,
        "username_env": "LINKEDIN_USERNAME",
        "password_env": "LINKEDIN_PASSWORD",
        "login_url_env": None,
    },
}


async def create_authenticated_storage_state() -> None:
    """Log in once via the UI for one or more services and save storage state.

    Scalable multi-service pattern:
    - Set ``AUTH_SERVICES`` to a comma-separated list of service names, e.g.:
        AUTH_SERVICES=default,github,linkedin
    - For each service, set the username/password env vars defined in SERVICE_CONFIG.
      Examples:
        AUTH_LOGIN_URL=...
        AUTH_USERNAME=...
        AUTH_PASSWORD=...
        GITHUB_USERNAME=...
        GITHUB_PASSWORD=...
        LINKEDIN_USERNAME=...
        LINKEDIN_PASSWORD=...

    If ``AUTH_SERVICES`` is not set, this falls back to the single "default"
    service using AUTH_LOGIN_URL / AUTH_USERNAME / AUTH_PASSWORD.

    Env vars can be provided via the shell or a ``.env`` file in the repo root.

    Interactive headed mode:
    - Set ``AUTH_INTERACTIVE=1`` to launch a headed browser and log in manually.
    - In this mode, automated per-service login helpers are skipped; you control
      navigation and logins (useful for CAPTCHAs / 2FA).
    """
    # Load variables from .env if present (non-fatal if missing).
    load_dotenv()
    interactive = os.environ.get("AUTH_INTERACTIVE", "").lower() in {"1", "true", "yes"}

    services_raw = os.environ.get("AUTH_SERVICES", "default")
    service_names: List[str] = [s.strip() for s in services_raw.split(",") if s.strip()]

    if not interactive:
        # Basic validation of requested services only when running automated flows.
        unknown = [s for s in service_names if s not in SERVICE_CONFIG]
        if unknown:
            raise RuntimeError(
                f"Unknown AUTH_SERVICES entries: {unknown}. "
                f"Supported services: {sorted(SERVICE_CONFIG.keys())}"
            )

    async with async_playwright() as p:
        # In interactive mode, open headed with custom flags so you can see and
        # interact with the browser; otherwise run headless.
        launch_kwargs: Dict[str, Any] = {
            "headless": not interactive,
            "slow_mo": 250 if interactive else 0,
        }
        if interactive:
            launch_kwargs["args"] = [
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-web-security",
                "--disable-infobars",
                "--disable-extensions",
                "--start-maximized",
                "--window-size=1280,720",
            ]

        browser = await p.chromium.launch(**launch_kwargs)
        try:
            context = await browser.new_context()
            page = await context.new_page()

            if interactive:
                # Let the user drive all logins manually in a headed browser.
                # Optionally navigate to the default app login first, if configured.
                if "default" in service_names:
                    login_url = os.environ.get("AUTH_LOGIN_URL")
                    if login_url:
                        await page.goto(login_url)

                print(
                    "Interactive auth mode enabled (AUTH_INTERACTIVE=1).\n"
                    "- A headed browser window has opened.\n"
                    "- Log into all desired services (GitHub, LinkedIn, Google, etc.).\n"
                    "- When finished, return here and press Enter to save storage_state."
                )
                input("Press Enter here after you have finished logging in... ")
            else:
                # Run each configured service login inside the same context/page.
                for name in service_names:
                    cfg = SERVICE_CONFIG[name]
                    username_env = cfg["username_env"]
                    password_env = cfg["password_env"]
                    login_url_env = cfg.get("login_url_env")

                    username = os.environ.get(username_env)
                    password = os.environ.get(password_env)
                    login_url = os.environ.get(login_url_env) if login_url_env else None

                    if not username or not password or (login_url_env and not login_url):
                        missing = []
                        if not username:
                            missing.append(username_env)
                        if not password:
                            missing.append(password_env)
                        if login_url_env and not login_url:
                            missing.append(login_url_env)
                        raise RuntimeError(
                            f"Missing environment variables for service '{name}': {', '.join(missing)}"
                        )

                    login_func: Callable[..., Awaitable[None]] = cfg["login_func"]
                    await login_func(page, username, password, login_url)  # type: ignore[arg-type]

            # Save authenticated storage state for reuse in tests.
            AUTH_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
            await context.storage_state(path=str(AUTH_STATE_PATH))
        finally:
            await browser.close()


async def _main() -> None:
    await create_authenticated_storage_state()
    print(f"Wrote authenticated storage state to {AUTH_STATE_PATH}")

if __name__ == "__main__":
    asyncio.run(_main())
