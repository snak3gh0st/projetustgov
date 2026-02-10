# Phase 6: Visual Foundation & Component System - Research

**Researched:** 2026-02-09
**Domain:** Streamlit theming, CSS injection, glassmorphic UI design
**Confidence:** HIGH

## Summary

Phase 6 establishes Sigma's premium dark theme foundation and glassmorphic component system for the existing Streamlit dashboard. Research confirms Streamlit supports comprehensive theming through config.toml (dark theme, custom colors, fonts) and CSS injection via st.html() and st.markdown(). Glassmorphic effects using backdrop-filter have excellent browser support (~95% globally) as of 2026, though performance and accessibility considerations require careful implementation.

**Key findings:**
- Streamlit's config.toml supports comprehensive dark theme customization (background, text, accent colors, fonts)
- st.html() is the modern approach for CSS injection (replaces st.markdown unsafe_allow_html for raw HTML/CSS)
- Google Fonts (Space Grotesk + Inter) can be loaded via CSS @import or <link> tag in injected HTML
- Glassmorphic effects (backdrop-filter: blur) require -webkit- prefix for Safari and have performance implications on low-end devices
- Streamlit's internal DOM uses data-testid attributes for reliable CSS targeting (avoid emotion cache classes which are dynamic)
- Component wrappers use Python functions returning styled HTML via st.html() or st.markdown()

**Primary recommendation:** Use config.toml for foundational dark theme colors, load external CSS file at app entry point (streamlit_app.py) using st.html(), create Python wrapper functions for glassmorphic card components, and target Streamlit elements using data-testid selectors for reliable styling.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Streamlit | 1.42+ | Dashboard framework | Already in use, config.toml theming added in recent versions |
| st.html() | Built-in | CSS/HTML injection | Modern replacement for st.markdown unsafe_allow_html, no iframe |
| config.toml | Built-in | Theme configuration | Official Streamlit theming system, supports dark mode |
| Google Fonts | CDN | Typography (Space Grotesk, Inter) | Free, reliable CDN, excellent pairing for modern UI |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| streamlit-extras | Latest | Enhanced metric cards | Optional - provides pre-styled KPI cards if custom components insufficient |
| DOMPurify | Built-in Streamlit | HTML sanitization | Automatic - Streamlit sanitizes all st.html() content by default |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| st.html() | st.markdown unsafe_allow_html | Deprecated approach, less secure, processed through markdown parser |
| Google Fonts CDN | Self-hosted fonts | Better performance but requires asset management and version control |
| config.toml | Pure CSS injection | Miss built-in theming features like chart colors, widget styling |
| Python wrappers | Full custom components (React) | Much heavier development, overkill for styled HTML cards |

**Installation:**
```bash
# Streamlit already installed in project
# No additional packages required for core functionality
# Optional:
pip install streamlit-extras  # If using pre-built metric card styling
```

## Architecture Patterns

### Recommended Project Structure
```
src/dashboard/
├── streamlit_app.py           # Entry point - load CSS here
├── assets/
│   ├── styles/
│   │   ├── theme.css          # Sigma brand dark theme foundation
│   │   ├── components.css     # Glassmorphic card styles
│   │   └── fonts.css          # Google Fonts import
├── components/
│   ├── cards.py               # Glassmorphic card wrappers
│   ├── kpi.py                 # Premium KPI card components
│   └── badges.py              # Value badge components (green/blue/amber/gray)
├── pages/
│   └── home.py                # Test glassmorphic cards here first
└── config.py

.streamlit/
└── config.toml                # Dark theme base configuration
```

### Pattern 1: CSS Foundation Loading at Entry Point
**What:** Load all CSS files once at app entry point (streamlit_app.py) using st.html() before any page rendering
**When to use:** Always - ensures consistent styling across all pages and navigation
**Example:**
```python
# src/dashboard/streamlit_app.py
import streamlit as st
from pathlib import Path

st.set_page_config(
    page_title="PROJETUS Dashboard",
    page_icon="📊",
    layout="wide",
)

# Load CSS foundation immediately after page config
def load_css():
    """Load all CSS files for Sigma brand theming."""
    css_dir = Path(__file__).parent / "assets" / "styles"

    # Load in order: fonts → theme → components
    for css_file in ["fonts.css", "theme.css", "components.css"]:
        css_path = css_dir / css_file
        if css_path.exists():
            st.html(css_path)  # st.html auto-wraps CSS files in <style> tags

load_css()

# Rest of app initialization...
```

### Pattern 2: Glassmorphic Card Component Wrapper
**What:** Python function that returns styled HTML string using st.html() or st.markdown()
**When to use:** For reusable glassmorphic cards with consistent Sigma branding
**Example:**
```python
# src/dashboard/components/cards.py
import streamlit as st

def glassmorphic_card(
    content: str,
    border_color: str = "#00D4FF",
    blur_strength: str = "10px",
) -> None:
    """Render glassmorphic card with semi-transparent background and neon border.

    Args:
        content: HTML content to display inside card
        border_color: Hex color for neon border glow (default: Sigma blue)
        blur_strength: Backdrop blur strength (default: 10px)
    """
    card_html = f"""
    <div class="glassmorphic-card"
         style="--border-glow: {border_color}; --blur: {blur_strength};">
        {content}
    </div>
    """
    st.html(card_html)

# Usage in pages:
# glassmorphic_card("<h3>KPI Title</h3><p>1,234</p>")
```

### Pattern 3: CSS Custom Properties for Theming
**What:** Use CSS variables for all Sigma brand colors, referenced throughout component styles
**When to use:** Always - enables consistent theming and easy updates
**Example:**
```css
/* assets/styles/theme.css */
:root {
    /* Sigma Brand Colors */
    --sigma-bg-primary: #050B1F;
    --sigma-text-primary: #E8F4FD;
    --sigma-accent-neon: #00D4FF;
    --sigma-glass-bg: rgba(255, 255, 255, 0.05);
    --sigma-glass-border: rgba(0, 212, 255, 0.3);

    /* Semantic Colors */
    --color-success: #10B981;
    --color-info: #3B82F6;
    --color-warning: #F59E0B;
    --color-neutral: #6B7280;
}

/* Apply to Streamlit containers */
[data-testid="stAppViewContainer"] {
    background-color: var(--sigma-bg-primary);
    color: var(--sigma-text-primary);
}
```

### Pattern 4: Premium KPI Card with Delta Indicator
**What:** Wrapper function that creates large-number KPI card with label, value, delta, and hover glow
**When to use:** Replacing default st.metric() calls with premium branded cards
**Example:**
```python
# src/dashboard/components/kpi.py
import streamlit as st

def premium_kpi_card(
    label: str,
    value: str | int,
    delta: str | None = None,
    delta_color: str = "green",
) -> None:
    """Render premium KPI card with glassmorphic styling.

    Args:
        label: KPI metric label (e.g., "Total Propostas")
        value: Large number or value to display
        delta: Optional delta indicator (e.g., "+12.5%")
        delta_color: "green", "red", or "gray" for delta styling
    """
    delta_html = ""
    if delta:
        delta_class = f"delta-{delta_color}"
        delta_html = f'<div class="kpi-delta {delta_class}">{delta}</div>'

    kpi_html = f"""
    <div class="premium-kpi-card">
        <div class="kpi-label">{label}</div>
        <div class="kpi-value">{value}</div>
        {delta_html}
    </div>
    """
    st.html(kpi_html)
```

### Pattern 5: Reliable CSS Selectors Using data-testid
**What:** Target Streamlit elements using [data-testid="..."] attribute selectors, not emotion cache classes
**When to use:** When styling needs to target specific Streamlit widgets or containers
**Example:**
```css
/* assets/styles/components.css */

/* Target sidebar - GOOD (stable) */
[data-testid="stSidebar"] {
    background: rgba(5, 11, 31, 0.9);
    border-right: 1px solid rgba(0, 212, 255, 0.2);
}

/* Target metric widget - GOOD (stable) */
[data-testid="stMetric"] {
    background: var(--sigma-glass-bg);
    backdrop-filter: blur(10px);
    border-radius: 12px;
    padding: 1.5rem;
    border: 1px solid var(--sigma-glass-border);
}

/* AVOID emotion cache classes - BAD (dynamic, breaks between versions) */
.st-emotion-cache-ocqkz7 { /* DON'T DO THIS */ }
```

### Anti-Patterns to Avoid
- **Inline CSS strings scattered across pages:** Leads to unmaintainable code, hard to update theme consistently. Always centralize CSS in external files.
- **Using st.markdown(unsafe_allow_html=True) for CSS:** Deprecated pattern, use st.html() instead. st.markdown processes content through markdown parser, less efficient.
- **Targeting emotion cache classes:** Classes like `st-emotion-cache-xyz` are dynamically generated and change between Streamlit versions. Use data-testid instead.
- **Heavy backdrop-filter on many elements:** Performance killer on mobile/low-end devices. Limit to key UI elements (cards, modals, overlays).
- **Ignoring accessibility contrast:** Glassmorphic designs often fail WCAG 2.2 contrast requirements (4.5:1 for text). Always test contrast and add semi-opaque overlays behind text if needed.
- **Loading CSS on every page separately:** Causes flash of unstyled content (FOUC) and re-parsing overhead. Load once at app entry point.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML sanitization | Custom regex/parsing for user input | DOMPurify (built into st.html) | XSS vulnerabilities, incomplete edge case handling. Streamlit auto-sanitizes. |
| Font loading optimization | Manual font subsetting, custom CDN | Google Fonts CDN with font-display: swap | Google handles subsetting, compression, caching, CDN distribution automatically. |
| Responsive units/scaling | Fixed pixel values everywhere | CSS custom properties + rem units | Streamlit's base font size changes with viewport, rem scales automatically. |
| Cross-browser prefixing | Manual -webkit-, -moz- prefixes | Autoprefixer or modern CSS (2026 support good) | Safari still needs -webkit-backdrop-filter, but most other prefixes unnecessary. |
| Theme switching (light/dark) | JavaScript toggle with manual CSS updates | config.toml [theme.light] / [theme.dark] | Streamlit handles theme switching UI and persistence automatically. |
| Color contrast validation | Manual color picker comparisons | WebAIM Contrast Checker + browser DevTools | WCAG 2.2 compliance requires precise 4.5:1 ratio calculation, tools handle this. |

**Key insight:** Streamlit provides robust built-in theming, sanitization, and configuration systems. Glassmorphic effects and Google Fonts are mature, standardized technologies - leverage existing infrastructure rather than building custom solutions.

## Common Pitfalls

### Pitfall 1: CSS Not Loading on First Page Load
**What goes wrong:** CSS injected via st.html() may not apply until page refresh due to Streamlit's rendering lifecycle.
**Why it happens:** If CSS is loaded conditionally or after other page content renders, Streamlit may not apply styles immediately. Also, complex CSS selectors can cause rendering delays (see PR #9901).
**How to avoid:**
- Call CSS loading function immediately after st.set_page_config() in streamlit_app.py
- Use st.html() with file paths (not inline strings) for better caching
- Avoid overly complex CSS selectors that slow parsing
**Warning signs:** Users report "works on refresh but not initial load", or "CSS to change styling isn't loaded on startup but loads when refreshed"

### Pitfall 2: Backdrop-Filter Performance on Mobile
**What goes wrong:** Glassmorphic blur effects cause jank, frame drops, and device heating on mobile/low-end devices.
**Why it happens:** backdrop-filter forces additional rendering passes - browser must render scene behind element, apply filter, then composite. On 4K displays or mobile, this is computationally expensive.
**How to avoid:**
- Limit backdrop-filter to max 3-5 key UI elements (cards, modals)
- Use will-change: backdrop-filter on animated elements to optimize browser rendering
- Set blur strength ≤ 10px (higher values = more expensive)
- Test on mobile devices and use browser DevTools performance profiler
**Warning signs:** Choppy scrolling, delayed interactions, browser warnings about "compositing layer", high CPU usage in DevTools.

### Pitfall 3: WCAG Contrast Failures with Glassmorphic Design
**What goes wrong:** Semi-transparent backgrounds with blurred content behind them often result in insufficient text contrast (< 4.5:1 ratio), failing WCAG 2.2 AA standards.
**Why it happens:** Transparency reduces perceived contrast, blur makes background "busy" and hard to read text over, designers focus on aesthetics over accessibility.
**How to avoid:**
- Add semi-opaque color overlay behind all text on glassmorphic surfaces (rgba(5, 11, 31, 0.85) for dark theme)
- Use WebAIM Contrast Checker to verify 4.5:1 minimum ratio for body text, 3:1 for large text
- Increase font weight to bold (600) on glassmorphic backgrounds
- Test with actual blurred content behind cards, not just solid colors
**Warning signs:** Strain to read text, poor readability in bright environments, accessibility audit failures.

### Pitfall 4: Google Fonts Performance Impact
**What goes wrong:** Loading multiple font weights/styles from Google Fonts CDN adds 200-500ms to page load, causes flash of unstyled text (FOUT).
**Why it happens:** Each font weight is a separate file, browser must download, parse, and apply fonts before rendering text. @import in CSS is sequential and blocks rendering.
**How to avoid:**
- Use <link rel="preload"> for critical font files in HTML head
- Limit to 2 font families with 2-3 weights each (Space Grotesk: 400, 700; Inter: 400, 600)
- Use font-display: swap to show fallback text immediately while fonts load
- Consider self-hosting fonts for production (faster, no external dependency)
**Warning signs:** Visible text reflow after page load, slow initial render, waterfall showing fonts loaded late.

### Pitfall 5: Streamlit Emotion Cache Classes Breaking CSS
**What goes wrong:** Custom CSS targeting .st-emotion-cache-xyz classes stops working after Streamlit version upgrade.
**Why it happens:** Streamlit uses Emotion for CSS-in-JS styling, which generates dynamic class names based on content hash. These change between versions or even between runs if component structure changes.
**How to avoid:**
- ALWAYS use [data-testid="..."] selectors for Streamlit elements
- For custom components, use explicit class names or inline styles
- Document which data-testid values are used and test after Streamlit upgrades
- Avoid relying on Streamlit's internal DOM structure
**Warning signs:** CSS works in development but breaks in production, styles disappear after Streamlit upgrade, community forum posts about "CSS not working after update".

### Pitfall 6: Config.toml Theme Options Requiring Server Restart
**What goes wrong:** Developer changes config.toml theme settings, refreshes app, but changes don't appear.
**Why it happens:** Some config.toml options (like [[theme.fontFace]]) require full Streamlit server restart to take effect, unlike most theme colors which update on refresh.
**How to avoid:**
- Know which options require restart: fontFace, baseFontSize, baseFontWeight
- Use Ctrl+C and restart streamlit run after changing fonts
- For rapid iteration on colors, use CSS custom properties instead of config.toml (updates immediately)
**Warning signs:** Theme color changes work but font changes don't, confusion about when to restart vs. refresh.

## Code Examples

Verified patterns from official sources and research:

### Config.toml Dark Theme Setup
```toml
# .streamlit/config.toml
# Source: https://docs.streamlit.io/develop/api-reference/configuration/config.toml

[theme]
base = "dark"
primaryColor = "#00D4FF"        # Sigma neon blue accent
backgroundColor = "#050B1F"      # Sigma dark background
secondaryBackgroundColor = "#0A1628"  # Slightly lighter for cards
textColor = "#E8F4FD"           # Sigma light text
font = "sans-serif"             # Default, will override with CSS

# Optional: Semantic color palette
[theme]
redColor = "#EF4444"
greenColor = "#10B981"
blueColor = "#00D4FF"
grayColor = "#6B7280"
```

### Loading Google Fonts with Font-Display Swap
```css
/* src/dashboard/assets/styles/fonts.css */
/* Source: Best practices from https://requestmetrics.com/web-performance/5-tips-to-make-google-fonts-faster/ */

/* Import Space Grotesk (headings) and Inter (body) */
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&family=Inter:wght@400;600&display=swap');

/* Apply fonts globally to Streamlit */
:root {
    --font-heading: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
    --font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    --font-code: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
}

/* Target Streamlit typography elements */
[data-testid="stAppViewContainer"] {
    font-family: var(--font-body);
}

h1, h2, h3, h4, h5, h6,
[data-testid="stHeading"] {
    font-family: var(--font-heading);
}

code, pre,
[data-testid="stCode"] {
    font-family: var(--font-code);
}
```

### Glassmorphic Card Component CSS
```css
/* src/dashboard/assets/styles/components.css */
/* Source: Research on glassmorphism patterns from https://ui.glass/generator/ */

.glassmorphic-card {
    /* Semi-transparent background */
    background: rgba(255, 255, 255, 0.05);

    /* Backdrop blur - Safari requires -webkit- prefix */
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);

    /* Neon border with glow */
    border: 1px solid var(--border-glow, rgba(0, 212, 255, 0.3));
    border-radius: 12px;

    /* Shadow for depth */
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);

    /* Padding and spacing */
    padding: 1.5rem;

    /* Smooth hover transition */
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.glassmorphic-card:hover {
    /* Subtle glow on hover */
    border-color: var(--border-glow, rgba(0, 212, 255, 0.6));
    box-shadow: 0 8px 32px rgba(0, 212, 255, 0.2),
                0 0 20px rgba(0, 212, 255, 0.15);
    transform: translateY(-2px);
}

/* Ensure text contrast on glassmorphic backgrounds */
.glassmorphic-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(5, 11, 31, 0.6);  /* Semi-opaque overlay for contrast */
    border-radius: inherit;
    z-index: -1;
}
```

### Premium KPI Card Component
```css
/* src/dashboard/assets/styles/components.css */
/* Source: Streamlit metric styling patterns from community */

.premium-kpi-card {
    /* Inherit glassmorphic base */
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(0, 212, 255, 0.3);
    border-radius: 16px;
    padding: 2rem;

    /* Layout */
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    /* Hover effect */
    transition: all 0.3s ease;
}

.premium-kpi-card:hover {
    border-color: rgba(0, 212, 255, 0.6);
    box-shadow: 0 0 30px rgba(0, 212, 255, 0.2);
}

.kpi-label {
    font-family: var(--font-body);
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(232, 244, 253, 0.7);
}

.kpi-value {
    font-family: var(--font-heading);
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--sigma-text-primary);
    line-height: 1;
}

.kpi-delta {
    font-size: 0.875rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
}

.kpi-delta.delta-green {
    color: var(--color-success);
}

.kpi-delta.delta-red {
    color: var(--color-error, #EF4444);
}

.kpi-delta.delta-gray {
    color: var(--color-neutral);
}
```

### Value Badge Component System
```css
/* src/dashboard/assets/styles/components.css */
/* Source: Design token patterns from https://www.designtokens.org/ */

.value-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.025em;
    text-transform: uppercase;
}

.value-badge--green {
    background: rgba(16, 185, 129, 0.15);
    color: #10B981;
    border: 1px solid rgba(16, 185, 129, 0.3);
}

.value-badge--blue {
    background: rgba(0, 212, 255, 0.15);
    color: #00D4FF;
    border: 1px solid rgba(0, 212, 255, 0.3);
}

.value-badge--amber {
    background: rgba(245, 158, 11, 0.15);
    color: #F59E0B;
    border: 1px solid rgba(245, 158, 11, 0.3);
}

.value-badge--gray {
    background: rgba(107, 114, 128, 0.15);
    color: #9CA3AF;
    border: 1px solid rgba(107, 114, 128, 0.3);
}
```

### Python Wrapper for Glassmorphic Card
```python
# src/dashboard/components/cards.py
# Source: Streamlit custom component patterns from official docs

import streamlit as st
from pathlib import Path

def glassmorphic_card(
    content: str,
    card_class: str = "glassmorphic-card",
) -> None:
    """Render content inside glassmorphic card.

    Args:
        content: HTML content to display
        card_class: CSS class name (default: glassmorphic-card)

    Example:
        glassmorphic_card("<h3>Title</h3><p>Content here</p>")
    """
    st.html(f'<div class="{card_class}">{content}</div>')

def premium_kpi_card(
    label: str,
    value: str | int | float,
    delta: str | None = None,
    delta_color: str = "gray",
) -> None:
    """Render premium KPI card with glassmorphic styling.

    Args:
        label: Metric label (e.g., "Total Propostas")
        value: Metric value (formatted number or string)
        delta: Optional delta indicator (e.g., "+12.5%")
        delta_color: "green", "red", or "gray"

    Example:
        premium_kpi_card("Total Propostas", "1,234", "+12%", "green")
    """
    # Format value
    if isinstance(value, (int, float)):
        value_str = f"{value:,.0f}" if isinstance(value, int) else f"{value:,.2f}"
    else:
        value_str = str(value)

    # Build delta HTML
    delta_html = ""
    if delta:
        delta_html = f'<div class="kpi-delta delta-{delta_color}">{delta}</div>'

    # Render card
    card_html = f"""
    <div class="premium-kpi-card">
        <div class="kpi-label">{label}</div>
        <div class="kpi-value">{value_str}</div>
        {delta_html}
    </div>
    """
    st.html(card_html)

def value_badge(text: str, variant: str = "gray") -> str:
    """Return HTML for value badge component.

    Args:
        text: Badge text content
        variant: "green", "blue", "amber", or "gray"

    Returns:
        HTML string for badge (use with st.html or inside other components)

    Example:
        st.html(value_badge("Active", "green"))
    """
    return f'<span class="value-badge value-badge--{variant}">{text}</span>'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| st.markdown unsafe_allow_html | st.html() for raw HTML/CSS | Streamlit 1.37+ (2025) | st.html() doesn't use iframe, more efficient, better security with explicit unsafe_allow_javascript flag |
| st.components.v1.html | st.components.v2.component | Streamlit 2026 | v2 has better style isolation, CSS custom properties support, no default iframe unless specified |
| @import in CSS | <link rel="preload"> + font-display: swap | 2024-2025 web perf best practice | Faster font loading, eliminates render-blocking, reduces FOUT |
| Manual -webkit- prefixes everywhere | Selective prefixing (only backdrop-filter) | 2025+ browser support | Modern CSS widely supported, only Safari needs -webkit-backdrop-filter |
| Fixed color values | CSS custom properties (variables) | 2023+ standard practice | Easier theming, consistent updates, better maintainability |
| Inline styles scattered in code | External CSS files loaded at entry | Always best practice, but easier with st.html() file support | Single source of truth, better caching, no code duplication |

**Deprecated/outdated:**
- **st.markdown(unsafe_allow_html=True) for CSS injection:** Use st.html() instead. Markdown processing overhead unnecessary for raw HTML/CSS.
- **Targeting emotion cache classes for styling:** Dynamic names break between versions. Use data-testid selectors.
- **theme.base="custom" with URL:** Still works but less common. Modern approach is [theme.light] / [theme.dark] tables in config.toml.
- **@import for Google Fonts in top of CSS:** Blocks rendering. Use @import with font-display: swap or <link> tag with preload.

## Open Questions

1. **Streamlit 1.42.1 st.html() CSS Application Bug**
   - What we know: GitHub Issue #10384 reports CSS present in DOM but not applied in Streamlit 1.42.1 (worked in 1.37)
   - What's unclear: Whether bug is fixed in latest version, workaround if still present
   - Recommendation: Test CSS loading with st.html() in current Streamlit version early in phase. If bug persists, fallback to st.markdown(unsafe_allow_html=True) temporarily or use st.components.v2.

2. **Performance Impact of Multiple Backdrop-Filters**
   - What we know: Each backdrop-filter element requires additional rendering pass, can cause jank on mobile
   - What's unclear: Exact threshold for "too many" glassmorphic elements on page before performance degrades noticeably
   - Recommendation: Start with 3-5 key cards on Home page, measure performance with Chrome DevTools, add more only if metrics are good (60fps scroll, <16ms render time).

3. **Streamlit Data-TestId Stability Across Versions**
   - What we know: data-testid selectors more stable than emotion cache classes
   - What's unclear: Whether Streamlit guarantees data-testid values won't change, or if they could break like emotion classes
   - Recommendation: Document all data-testid selectors used in comments, add regression tests after Streamlit upgrades to verify CSS still applies.

4. **Config.toml Theme Switching UI**
   - What we know: config.toml supports [theme.light] and [theme.dark] tables for switchable themes
   - What's unclear: Where Streamlit exposes theme toggle UI to users (settings menu? automatic based on OS? requires custom component?)
   - Recommendation: Research Streamlit theme switching UX, may need custom toggle if not built-in. For Phase 6, focus on dark theme only.

## Sources

### Primary (HIGH confidence)
- [Streamlit Theming Documentation](https://docs.streamlit.io/develop/concepts/configuration/theming) - Official theming guide, config.toml options
- [Streamlit config.toml Reference](https://docs.streamlit.io/develop/api-reference/configuration/config.toml) - Complete theme configuration parameters
- [st.components.v1.html Documentation](https://docs.streamlit.io/develop/api-reference/custom-components/st.components.v1.html) - Legacy HTML component API
- [st.html Documentation](https://docs.streamlit.io/develop/api-reference/text/st.html) - Modern HTML/CSS injection method
- [Streamlit 2026 Release Notes](https://docs.streamlit.io/develop/quick-reference/release-notes/2026) - Latest features and bug fixes

### Secondary (MEDIUM confidence)
- [Glassmorphism Browser Support 2026](https://invernessdesignstudio.com/glassmorphism-what-it-is-and-how-to-use-it-in-2026) - backdrop-filter ~95% global support
- [Glassmorphism Accessibility Guidelines](https://axesslab.com/glassmorphism-meets-accessibility-can-frosted-glass-be-inclusive/) - WCAG 2.2 contrast requirements, best practices
- [Glass UI Generator](https://ui.glass/generator/) - Glassmorphic CSS patterns and examples
- [Space Grotesk + Inter Font Pairing](https://maxibestof.one/typefaces/inter/pairing/space-grotesk) - Verified good pairing for modern UI
- [Google Fonts Performance Optimization](https://requestmetrics.com/web-performance/5-tips-to-make-google-fonts-faster/) - font-display: swap, preload best practices
- [Design Tokens Best Practices 2026](https://www.frontendtools.tech/blog/tailwind-css-best-practices-design-system-patterns) - CSS custom properties, semantic color systems

### Tertiary (LOW confidence, needs validation)
- [Streamlit CSS Hacks Discussion](https://discuss.streamlit.io/t/css-hacks/14501) - Community CSS injection patterns (older thread)
- [Streamlit Emotion Cache Classes Issue](https://discuss.streamlit.io/t/stremlits-dynamically-named-css-classes/1821) - Dynamic CSS class naming problems
- [st.html() CSS Bug #10384](https://github.com/streamlit/streamlit/issues/10384) - CSS not applying in 1.42.1 (status unclear)
- [Backdrop-Filter Performance Discussion](https://medium.com/@JTCreateim/backdrop-filter-property-in-css-leads-to-choppiness-in-streaming-video-45fa83f3521b) - Video streaming specific, may not apply to static cards

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified from official Streamlit docs, st.html() and config.toml well-documented
- Architecture: HIGH - Patterns derived from official docs and established CSS/design system best practices
- Glassmorphic implementation: MEDIUM-HIGH - Browser support excellent, but performance/accessibility need testing in context
- Pitfalls: MEDIUM - Based on community reports and GitHub issues, some need verification in current Streamlit version

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days - Streamlit stable, CSS standards evolving slowly)
**Recommended re-validation:** After Streamlit version upgrade, or if performance issues emerge during Phase 6 implementation
