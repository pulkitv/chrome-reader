# ReadEasy Extension - AI Coding Agent Instructions

## Project Overview

A Manifest V3 Chrome extension that extracts article content using Mozilla's Readability library and displays it in a clean, themeable reader view with Flash It speed reading mode. Uses session storage for data passing between components.

## Architecture & Data Flow

**Four-component pipeline:**

1. **background.js** (service worker) - Intercepts toolbar clicks, injects content script, stores extracted data in session storage
2. **content.js** - Executes in active tab with Readability.js, extracts article, returns to background script
3. **reader.html/js** - New tab that retrieves article from session storage and renders with themes/controls
4. **Flash It mode** - Speed reading feature with word-by-word highlighting in overlay or inline mode

**Critical Storage Pattern:**
- `chrome.storage.session` - Passes article data from background → reader (key: `currentArticle`), stores Flash It state (`flashItState` with wordIndex/speed/mode)
- `chrome.storage.sync` - Persists user preferences (theme, font size, width)
- Never use local storage - extension relies on Chrome APIs

## Flash It Speed Reading

**Adaptive timing system:**
- Converts WPM to milliseconds: `(60 / WPM) * 1000`
- Word length multipliers: ≤3 chars (0.8x), 4-8 (1x), 9-12 (1.3x), >12 (1.5x)
- Punctuation pauses: periods/!/?  (+300ms), commas/;/: (+150ms)
- Uses `setTimeout` (not `setInterval`) for variable delays

**Dual display modes:**
- **Overlay mode**: RSVP-style centered display at 2x font size with context words
- **Inline mode**: Highlights words in article body with auto-scroll (only if off-screen)
- Mode toggle preserves playback position

**Word extraction:**
- Recursively traverses text nodes in `#articleBody`
- Wraps each word in `<span class="flash-word" data-word-index="N">`
- Skips script/style/SVG elements
- Preserves whitespace between words

**Session persistence:**
- Saves current position on every word advance
- Restores position when resuming after pause
- Clears on stop/exit
- Speed changes apply immediately by recalculating timeout

## Key Development Patterns

### URL Handling (content.js)
All URLs must be converted to absolute before Readability parsing to prevent broken images:
```javascript
const absoluteUrl = new URL(relativeUrl, document.location.href).href;
```

**Special handling:**
- Remove `srcset` attributes entirely (causes Substack URL issues)
- Fix Substack CDN URLs: `src.replace(/,w_\d+,c_limit,/, ',')`
- Convert `data-src` lazy-load patterns to `src`

### Referrer Policy Workaround (rules.json)
Some CDNs (Substack, Medium) block images without proper referrer. The `declarativeNetRequest` rule modifies request headers:
```json
"action": { "type": "modifyHeaders", "requestHeaders": [{ "header": "referer", "value": "https://www.google.com/" }] }
```
If images don't load from new domains, add rules to [rules.json](rules.json).

### HTML Sanitization (reader.js)
Always sanitize Readability output before display:
- Remove `<script>` tags
- Strip all `on*` event attributes
- Convert `<iframe>` to links

### Theme System (reader.css)
CSS custom properties define three themes (light/sepia/dark). Applied via body class:
```css
.light-theme { --bg: #fff; --text: #333; }
```
Font sizes use body classes: `font-small` through `font-xxlarge` (16-24px).

## Development Workflows

**Testing the extension:**
1. Load unpacked: `chrome://extensions/` → Developer mode → Load unpacked
2. Test sites: Medium, CNN, BBC, blogs (see [TESTING.md](TESTING.md))
3. Check console in three places: background service worker, content script (page DevTools), reader tab

**Debugging common issues:**
- Images not loading: Check rules.json referrer policies, inspect Network tab for blocked requests
- Content not extracting: Readability requires `charThreshold: 500` minimum; some SPAs won't work
- Storage errors: Verify service worker is active in `chrome://serviceworker-internals/`

**Modifying extraction logic:**
Edit [content.js](content.js) Readability options or URL conversion. Reload extension and test on problematic sites.

**Adding UI features:**
Update [reader.html](reader.html) structure, [reader.js](reader.js) logic, [reader.css](reader.css) styling. Preferences persist via `savePreferences()` in reader.js.

## File Organization

- **manifest.json** - Permissions, background worker, declarativeNetRequest rules
- **background.js** - Entry point, handles chrome.action.onClicked
- **content.js** - Injected script with Readability extraction
- **reader.{html,js,css}** - Display layer with themes/controls/preferences
- **libs/Readability.js** - Mozilla library (89KB, don't modify directly)
- **rules.json** - declarativeNetRequest rules for CDN image access

## Common Gotchas

- **Manifest V3**: No inline scripts, use service workers not background pages
- **activeTab permission**: Only active when user clicks toolbar; can't auto-run on page load
- **Session storage limits**: Keep article data under ~10MB; large images may cause issues
- **Chrome internal pages**: Extension cannot run on `chrome://` or `chrome-extension://` URLs
- **Base tag hack**: reader.html sets `<base href="sourceUrl">` to resolve relative image paths (see reader.js line 16)

## Extension APIs Used

- `chrome.action.onClicked` - Toolbar click handler
- `chrome.scripting.executeScript` - Inject content script with files array
- `chrome.storage.session/sync` - Data passing and preferences
- `chrome.tabs.create` - Open reader view
- `chrome.declarativeNetRequest` - Modify request headers for CDN access

## When Modifying Code

1. **Changing content extraction**: Update [content.js](content.js), test URL conversion and Readability options
2. **Adding themes**: Extend THEMES array in [reader.js](reader.js), add CSS variables to [reader.css](reader.css)
3. **New keyboard shortcuts**: Add to reader.js `setupEventListeners()`, document in README.md
4. **Fixing image loading**: Add declarativeNetRequest rule to [rules.json](rules.json) for domain, rebuild `_metadata/` on reload
5. **Permissions changes**: Update [manifest.json](manifest.json), users must reinstall extension

## Testing Checklist

Before committing changes, verify:
- Extension loads without errors in `chrome://extensions/`
- Content extracts from Medium, news sites, blogs (see [TESTING.md](TESTING.md) full list)
- Images load correctly (check Network tab for 403/CORS errors)
- Theme switching persists after reload
- Keyboard shortcuts (+/-/Esc) work
- No CSP violations in console
