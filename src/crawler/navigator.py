"""Transfer Gov page navigation and export button detection."""

from typing import Any

from loguru import logger
from playwright.sync_api import Page

from src.config import get_settings

from .browser import BrowserError


class NavigationError(BrowserError):
    """Raised when page navigation or element detection fails."""

    def __init__(
        self, message: str, expected: str | None = None, found: str | None = None
    ):
        """Initialize navigation error.

        Args:
            message: Error message.
            expected: What was expected on the page.
            found: What was actually found on the page.
        """
        super().__init__(message)
        self.expected = expected
        self.found = found

    def __str__(self) -> str:
        """Format error message."""
        if self.expected and self.found:
            return f"{self.message} (expected: {self.expected}, found: {self.found})"
        return self.message


# Flexible selector strategy for Transfer Gov panel.
# These are placeholder selectors that need runtime validation.
# Per plan: "NEEDS_UPDATE_FROM_SITE_INSPECTION"
#
# Selector strategy: Each file type has multiple fallback approaches.
# Order: CSS selector (most reliable) -> XPath (flexible) -> Text (most flexible)
#
# Transfer Gov Qlik Sense dashboard typically has:
# - Export menu (three dots or hamburger icon)
# - Export to Excel/CSV options
# - Individual visualization exports
#
# NOTE: These selectors are TENTATIVE and require verification at the checkpoint.
SELECTORS: dict[str, dict[str, str]] = {
    "propostas": {
        "primary": "[data-testid='export-propostas'], .export-propostas, [title*='Proposta'], [aria-label*='Proposta']",
        "fallback_xpath": "//button[contains(@class, 'export') and contains(., 'Proposta')] | //div[contains(@title, 'Proposta')]//following-sibling::button",
        "fallback_text": "Proposta",
        "description": "Export button for propostas (proposals) data",
    },
    "apoiadores": {
        "primary": "[data-testid='export-apoiadores'], .export-apoiadores, [title*='Apoiador'], [aria-label*='Apoiador']",
        "fallback_xpath": "//button[contains(@class, 'export') and contains(., 'Apoiador')] | //div[contains(@title, 'Apoiador')]//following-sibling::button",
        "fallback_text": "Apoiador",
        "description": "Export button for apoiadores (supporters) data",
    },
    "emendas": {
        "primary": "[data-testid='export-emendas'], .export-emendas, [title*='Emenda'], [aria-label*='Emenda']",
        "fallback_xpath": "//button[contains(@class, 'export') and contains(., 'Emenda')] | //div[contains(@title, 'Emenda')]//following-sibling::button",
        "fallback_text": "Emenda",
        "description": "Export button for emendas (amendments) data",
    },
    "programas": {
        "primary": "[data-testid='export-programas'], .export-programas, [title*='Programa'], [aria-label*='Programa']",
        "fallback_xpath": "//button[contains(@class, 'export') and contains(., 'Programa')] | //div[contains(@title, 'Programa')]//following-sibling::button",
        "fallback_text": "Programa",
        "description": "Export button for programas (programs) data",
    },
}

# General export panel selector (if Transfer Gov has a unified export interface)
EXPORT_PANEL_SELECTORS: dict[str, str] = {
    "css": "[class*='export'], [class*='Export'], [data-testid*='export'], [aria-label*='export'], [aria-label*='Export']",
    "xpath": "//*[contains(@class, 'export') or contains(@class, 'Export') or contains(@data-testid, 'export')]",
    "text_contains": ["Exportar", "Export", "Download", "Baixar"],
}


def navigate_to_panel(page: Page, url: str | None = None) -> None:
    """Navigate to Transfer Gov panel.

    Args:
        page: Playwright page object.
        url: URL to navigate to. Defaults to settings.transfer_gov_url.

    Raises:
        NavigationError: If navigation fails.
    """
    # Use default URL if not provided
    default_url = "https://dd-publico.serpro.gov.br/extensions/gestao-transferencias/gestao-transferencias.html"
    target_url = url or default_url

    logger.info("Navigating to Transfer Gov panel: {}", target_url)

    try:
        # Navigate with generous timeout for government portal
        page.goto(
            target_url,
            timeout=60_000,  # 1 minute for initial navigation
            wait_until="networkidle",  # Wait for all resources to load
        )

        # Additional wait for Qlik Sense dashboard rendering
        # Qlik Sense dashboards may take time to initialize
        page.wait_for_load_state("domcontentloaded")

        logger.info(
            "Successfully navigated to Transfer Gov panel (title: {})", page.title()
        )

    except Exception as e:
        logger.error("Failed to navigate to Transfer Gov: {}", e)
        raise NavigationError(
            f"Failed to navigate to Transfer Gov panel: {e}",
            expected="Transfer Gov dashboard page",
            found=f"Navigation failed: {type(e).__name__}",
        ) from e


def find_export_buttons(page: Page) -> list[dict[str, Any]]:
    """Locate export/download buttons on the Transfer Gov panel.

    Uses multiple selector strategies (CSS -> XPath -> Text-based) to find
    export buttons for each file type (propostas, apoiadores, emendas, programas).

    Args:
        page: Playwright page object.

    Returns:
        List of dicts with file_type and selector for each found button.
        Example: [{"file_type": "propostas", "selector": "...", "method": "css"}, ...]

    Raises:
        NavigationError: If no export buttons are found after trying all strategies.
    """
    logger.info("Searching for export buttons on Transfer Gov panel")

    found_buttons: list[dict[str, Any]] = []
    missing_file_types: list[str] = []

    for file_type, selector_info in SELECTORS.items():
        logger.debug("Searching for {} export button...", file_type)

        button = _find_export_button(page, selector_info)

        if button:
            found_buttons.append(
                {
                    "file_type": file_type,
                    "selector": button["selector"],
                    "method": button["method"],
                    "description": selector_info["description"],
                }
            )
            logger.info(
                "Found {} export button (method: {})", file_type, button["method"]
            )
        else:
            missing_file_types.append(file_type)
            logger.warning("Could not find {} export button", file_type)

    # Log all selectors found for debugging
    if found_buttons:
        logger.info(
            "Found {} export buttons: {}",
            len(found_buttons),
            [b["file_type"] for b in found_buttons],
        )

    if missing_file_types:
        logger.warning("Missing export buttons for: {}", missing_file_types)

    # Raise error if no buttons found at all
    if not found_buttons:
        expected = "Export buttons for " + ", ".join(SELECTORS.keys())
        found = "No export buttons found using any selector strategy"

        # Log page structure for debugging
        _log_page_structure(page)

        raise NavigationError(
            "No export buttons found on Transfer Gov panel",
            expected=expected,
            found=found,
        )

    return found_buttons


def _find_export_button(
    page: Page, selector_info: dict[str, str]
) -> dict[str, str] | None:
    """Try multiple strategies to find an export button.

    Args:
        page: Playwright page object.
        selector_info: Selector info dict from SELECTORS.

    Returns:
        Dict with selector and method if found, None otherwise.
    """
    # Strategy 1: CSS selector (most reliable if exact selector known)
    if selector_info.get("primary"):
        try:
            elements = page.locator(selector_info["primary"])
            count = elements.count()
            if count > 0:
                # Use first matching element
                selector = selector_info["primary"]
                logger.debug("Found via CSS selector: {} ({} matches)", selector, count)
                return {"selector": selector, "method": "css"}
        except Exception as e:
            logger.debug("CSS selector failed: {}", e)

    # Strategy 2: XPath fallback
    if selector_info.get("fallback_xpath"):
        try:
            elements = page.locator(selector_info["fallback_xpath"])
            count = elements.count()
            if count > 0:
                selector = selector_info["fallback_xpath"]
                logger.debug("Found via XPath: {} ({} matches)", selector, count)
                return {"selector": selector, "method": "xpath"}
        except Exception as e:
            logger.debug("XPath selector failed: {}", e)

    # Strategy 3: Text-based fallback
    if selector_info.get("fallback_text"):
        try:
            # Try multiple text variations
            text_variations = [
                selector_info["fallback_text"],
                selector_info["fallback_text"].lower(),
                selector_info["fallback_text"].upper(),
                f"Exportar {selector_info['fallback_text']}",
                f"Download {selector_info['fallback_text']}",
                f"Baixar {selector_info['fallback_text']}",
            ]

            for text in text_variations:
                try:
                    # Try exact text match first
                    elements = page.get_by_text(text, exact=True)
                    if elements.count() > 0:
                        selector = f"text={text}"
                        logger.debug(
                            "Found via text (exact): {} ({} matches)",
                            text,
                            elements.count(),
                        )
                        return {"selector": selector, "method": "text_exact"}
                except Exception:
                    pass

                try:
                    # Try contains text
                    elements = page.get_by_text(text, include_hidden=False)
                    if elements.count() > 0:
                        selector = f"text*={text}"
                        logger.debug(
                            "Found via text (contains): {} ({} matches)",
                            text,
                            elements.count(),
                        )
                        return {"selector": selector, "method": "text_contains"}
                except Exception:
                    continue

        except Exception as e:
            logger.debug("Text-based selector failed: {}", e)

    return None


def _log_page_structure(page: Page) -> None:
    """Log page structure for debugging when selectors fail.

    Args:
        page: Playwright page object.
    """
    logger.debug("Page structure for debugging:")
    try:
        # Log page title
        logger.debug("  Title: {}", page.title())

        # Log all clickable elements that might be exports
        export_candidates = page.locator(
            "[class*='export'], [class*='Export'], button, [role='button']"
        )
        count = export_candidates.count()
        logger.debug("  Found {} potential export elements", count)

        if count > 0:
            # Log first 5 elements with their text
            for i in range(min(5, count)):
                element = export_candidates.nth(i)
                try:
                    text = element.text_content()
                    aria_label = element.get_attribute("aria-label") or ""
                    title = element.get_attribute("title") or ""
                    logger.debug(
                        "  Element {}: text='{}' aria-label='{}' title='{}'",
                        i,
                        text[:50],
                        aria_label[:50],
                        title[:50],
                    )
                except Exception:
                    logger.debug("  Element {}: could not extract text", i)

    except Exception as e:
        logger.debug("  Could not log page structure: {}", e)


def get_selector_for_file_type(file_type: str) -> dict[str, str] | None:
    """Get selector information for a specific file type.

    Args:
        file_type: One of 'propostas', 'apoiadores', 'emendas', 'programas'.

    Returns:
        Selector info dict or None if file_type not found.
    """
    return SELECTORS.get(file_type)


def list_available_selectors() -> dict[str, dict[str, str]]:
    """List all configured selectors for export buttons.

    Returns:
        Dict mapping file_type to selector information.
    """
    return SELECTORS
