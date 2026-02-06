"""Playwright browser lifecycle management for Transfer Gov crawler."""

from contextlib import contextmanager
from typing import Generator

from loguru import logger
from playwright.sync_api import Playwright, sync_playwright
from playwright.sync_api import Browser, BrowserContext, Page

from src.config import get_settings


class BrowserError(Exception):
    """Raised when browser operations fail."""

    pass


class BrowserManager:
    """Context manager for Playwright browser lifecycle.

    Usage:
        with BrowserManager() as bm:
            page = bm.new_page()
            # do stuff with page
        # browser automatically closed

    Attributes:
        headless: Whether to run browser in headless mode.
    """

    def __init__(self, headless: bool = True):
        """Initialize browser manager.

        Args:
            headless: Run browser in headless mode (default True).
                      Set to False for debugging.
        """
        self.headless = headless
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None

    def __enter__(self) -> "BrowserManager":
        """Enter context manager and launch browser."""
        logger.info("Launching Playwright browser (headless={})", self.headless)

        self._playwright = sync_playwright().start()

        # Launch Chromium browser
        self._browser = self._playwright.chromium.launch(
            headless=self.headless,
            args=["--no-sandbox", "--disable-setuid-sandbox"],
        )

        # Create browser context with long timeout for government portals
        self._context = self._browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )

        logger.info("Browser launched successfully")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit context manager and close browser."""
        logger.info("Closing browser...")

        if self._context:
            self._context.close()
            self._context = None

        if self._browser:
            self._browser.close()
            self._browser = None

        if self._playwright:
            self._playwright.stop()
            self._playwright = None

        logger.info("Browser closed")
        return False  # Don't suppress exceptions

    def new_page(self, timeout: int = 120_000) -> Page:
        """Create a new browser page.

        Args:
            timeout: Page navigation timeout in milliseconds.
                    Default 120_000ms (2 minutes) for government portals.

        Returns:
            Playwright Page object.

        Raises:
            BrowserError: If page cannot be created.
        """
        if not self._context:
            raise BrowserError("Browser context not initialized. Use context manager.")

        page = self._context.new_page()
        page.set_default_timeout(timeout)

        logger.debug("Created new page with timeout={}ms", timeout)
        return page


@contextmanager
def browser_context(headless: bool = True) -> Generator[BrowserManager, None, None]:
    """Convenience context manager for browser operations.

    Args:
        headless: Run browser in headless mode.

    Yields:
        BrowserManager instance.
    """
    manager = BrowserManager(headless=headless)
    try:
        yield manager
    finally:
        # Context manager handles cleanup automatically
        pass
