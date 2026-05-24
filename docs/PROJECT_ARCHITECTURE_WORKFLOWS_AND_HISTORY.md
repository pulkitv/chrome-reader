# ReadEasy — Workflows, Function Reference & Quick Reference

> Last updated: May 25, 2026

---

## Function Reference

### Edit Mode (`reader/edit-mode.js`)

| Function | Purpose |
|----------|---------|
| `enterEditMode()` | Makes title/byline/body contenteditable; strips blocking inline styles; places cursor via RAF |
| `exitEditMode(save)` | Save: persists to session storage; Cancel: reverts snapshots; always closes link popover |
| `execFormatCmd(cmd, value)` | Thin wrapper around `document.execCommand` for the active contenteditable element |
| `applyFontSize(px)` | `fontSize('7')` marker trick → converts `<font size="7">` to inline `style.fontSize` |
| `insertNoteBlock()` | Inserts HR + `.note-block` + HR + empty paragraph at cursor |
| `insertHorizontalRule()` | Inserts plain `<hr>` + empty paragraph at cursor |
| `insertImageAtCursor(file)` | FileReader → base64 data URL → `execCommand('insertHTML')` |
| `openLinkPopover()` | Snapshots selection range; pre-fills URL input; shows link popover |
| `applyLink()` | Captures range before closing popover; restores range; `execCommand('createLink')` |
| `unlinkSelection()` | Captures range before closing popover; restores range; `execCommand('unlink')` |
| `closeLinkPopover()` | Hides popover; nulls `savedLinkRange` |
| `updateToolbarState()` | Debounced 30 ms; reflects B/I/U active state via `queryCommandState` |

### Reader State and Preferences (`reader/state.js`, `reader/preferences.js`)

| Function / Export | File | Purpose |
|----------|------|---------|
| `state` object | `reader/state.js` | Shared mutable state (auth, flash, edit, TTS, preferences) |
| `loadPreferences()` | `reader/preferences.js` | Reads sync storage and applies theme/font/width |
| `savePreferences()` | `reader/preferences.js` | Persists current theme/font/width to sync storage |
| `setTheme(theme)` | `reader/preferences.js` | Changes body class and saves preference |
| `updateFontSize()` | `reader/preferences.js` | Applies font size class from `state.currentFontSizeIndex` |
| `updateProgressBar()` | `reader/preferences.js` | Updates scroll progress bar on scroll events |

### Reader Article Module (`reader/article.js`)

| Function | Purpose |
|----------|---------|
| `loadArticle()` | Reads `currentArticle` from session storage and renders it in the DOM |
| `sanitizeHtml(html)` | Strips scripts, on* handlers, replaces iframes with links |
| `setupLazyLoading()` | IntersectionObserver-based lazy loader for `data-src` images |
| `displayError(message)` | Renders an error state inside `#articleBody` |
| `fetchImageAsPng(url)` | Fetches remote image → blob → canvas → PNG data URL (20 s timeout) |
| `handleAddToReadingList()` | Converts images to base64, sends `saveToReadingList` message, shows toast |
| `autoSaveToReadingList()` | Silent fire-and-forget save on reader view load; never blocks or toasts |
| `showNotification(msg, type)` | Transient toast notification (info/success/error) |

### PDF Merge (`sidepanel/pdf-build.js`)

| Function | Purpose |
|----------|---------|
| `handleMergePDF()` | Entry point: fetches articles, builds HTML, opens blob URL, auto-triggers print |
| `buildMergedPrintHTML(articles)` | Generates full styled HTML string with cover, TOC, article sections, print CSS |

### Content Extraction (`content.js`)

| Function | Purpose |
|----------|---------|
| `extractArticle()` | Main dispatcher — Priority 0a ChatGPT → 0b FB permalink → 1 dialog → Readability → fallback |
| `isChatGPT()` | Detects `chatgpt.com` / `chat.openai.com` by hostname |
| `extractChatGPT()` | Priority 0a: collects `[data-message-author-role]` turns, strips UI chrome, resets positioning |
| `isFacebookPostPermalink()` | Detects FB permalink URLs (`/posts/`, `/permalink.php`, `/photos/`) |
| `extractFacebookPermalink()` | Priority 0b: FB permalink extraction (not-logged-in path); returns null when logged in |
| `pruneFacebookNode(clone)` | Removes FB-specific pagelets and ARIA navigation/banner roles from a clone |
| `removeScrambledDates(clone)` | Removes CSS-scrambled timestamp elements (≥10 children, ≥65% single-char) |
| `cleanFacebookTitle(title)` | Strips `(N+)` prefix and `| Facebook` suffix |
| `pickActiveDialog()` | Priority 1: domain-gated social dialog detection (FB/IG/Reddit/Twitter/LinkedIn) |
| `buildFallbackArticle()` | Last-resort: highest-text-content DOM element when Readability yields nothing |
| `makeUrlsAbsolute(clone, base)` | Converts all relative `src`/`href` attributes to absolute URLs |

---

## Common Tasks & Workflows

### Task 1: Add a New Toolbar Button

1. **HTML** — Add button to `reader.html` toolbar section:
   ```html
   <button id="newFeatureBtn" class="icon-btn" title="Feature Name">
     <svg><!-- icon paths --></svg>
   </button>
   ```
2. **JS** — Wire the event listener in `setupEventListeners()` in `reader.js`; implement logic in the appropriate `reader/` module and import it
3. **CSS** — Use existing `.icon-btn` class, or add custom styles to `reader.css`

### Task 2: Modify Flash It Timing

Location: `reader/flash-it.js` — `flashNextWord()` function

```javascript
if (word.length <= 3) displayTime *= 0.8;
else if (word.length <= 8) displayTime *= 1.0;
else if (word.length <= 12) displayTime *= 1.3;
else displayTime *= 1.5;
```

### Task 3: Add Support for a New CDN Image Domain

Add a rule to `rules.json` (use platform-specific referer for social CDNs — not `google.com`):
```json
{
  "id": 5,
  "priority": 1,
  "action": {
    "type": "modifyHeaders",
    "requestHeaders": [{"header": "referer", "operation": "set", "value": "https://www.example.com/"}]
  },
  "condition": {
    "urlFilter": "*newcdn.com*",
    "resourceTypes": ["image"]
  }
}
```
Then reload the extension — Chrome rebuilds `_metadata/`.

### Task 4: Add a New Theme

1. **CSS** — Add theme variables to `reader.css` under a new body class
2. **JS** — Add to THEMES array in `reader/preferences.js`
3. **HTML** — Add a theme button to the theme switcher in `reader.html`

### Task 5: Fix Image Loading Issues

1. Inspect Network tab — check for 403/CORS errors
2. Add a rule to `rules.json` for the offending CDN domain
3. Verify URL conversion in `content.js` handles the site correctly
4. Reload extension and retest

---

## Quick Reference: Where to Find Things

| Looking for... | File | Notes |
|---------------|------|-------|
| Article extraction | `content.js` | `extractArticle()` dispatches all paths |
| ChatGPT extraction | `content.js` | `isChatGPT()`, `extractChatGPT()` — Priority 0a |
| FB permalink extraction | `content.js` | `extractFacebookPermalink()`, `pruneFacebookNode()` — Priority 0b |
| Flash It engine | `reader/flash-it.js` | `startFlashIt()` through `stopFlashIt()` |
| EPUB — single article | `reader/epub.js` | `downloadArticleEPUB()` |
| EPUB — merged | `sidepanel/epub-build.js` | `buildMergedEPUBBlob()` |
| PDF merge | `sidepanel/pdf-build.js` | `handleMergePDF()`, `buildMergedPrintHTML()` |
| Edit mode enter/exit | `reader/edit-mode.js` | `enterEditMode()`, `exitEditMode()` |
| Edit mode formatting | `reader/edit-mode.js` | `execFormatCmd()`, `applyFontSize()`, `insertNoteBlock()` |
| Edit mode link popover | `reader/edit-mode.js` | `openLinkPopover()`, `applyLink()`, `unlinkSelection()` |
| Reader auth UI | `reader/auth.js` | `loadReaderAuthState()`, `applyReaderAuthUI()` |
| Reader article load + save | `reader/article.js` | `loadArticle()`, `handleAddToReadingList()`, `autoSaveToReadingList()` |
| Reader preferences | `reader/preferences.js` | `loadPreferences()`, `setTheme()`, `updateFontSize()` |
| Reader TTS | `reader/tts.js` | `startTtsPlayback()`, `sendArticleToWebapp()` |
| Reader shared state | `reader/state.js` | `state` object and constants |
| Event listener wiring | `reader.js` | `setupEventListeners()` — entry-point only |
| Theme CSS variables | `reader.css` | Custom properties at top of file |
| CDN referrer rules | `rules.json` | All declarativeNetRequest rules |
| Right-click context menu | `background.js` | `chrome.contextMenus.create()`, `onClicked` |
| X4 modal workflow | `sidepanel/x4-modal.js` | `openX4Modal()`, `regenerateX4BlobForModal()` |
| Floater ping guard | `background.js` + `selection.js` | `{ action: 'ping' }` / `{ alive: true }` |

---

## Notes for AI Assistants

**When modifying the project:**
- Reader feature logic lives in `reader/*.js` modules — never put it in `reader.js` (entry-point only)
- Update `PROJECT_ARCHITECTURE_FOUNDATION_AND_SYSTEM_MAP.md` when architecture, contracts, or storage changes
- Test on multiple site types after changes (regular articles, social pages, ChatGPT, `chrome://` pages)

**Key principles:** Vanilla JS, no frameworks; CSS custom properties for theming; Chrome storage APIs; sanitize all HTML; convert URLs to absolute; use session storage for temporary data, sync storage for preferences.

**Common gotchas:**
- Never use RegExp on base64 — use `str.split(literal).join(replacement)`
- Always replace both `&` and `&amp;` when patching image URLs in HTML strings
- `declarativeNetRequest` rules need extension reload to apply
- Canvas conversion required for CORS images; objectURL avoids canvas taint
- Session storage clears when tab closes — never rely on it surviving tab refresh

---

## Future Enhancement Ideas

- [ ] Reader mode auto-detection (suggest reader view when landing on an article)
- [ ] Persistent annotations / highlighting (currently session-only via edit mode)
- [ ] Cloud sync for reading list content (auth exists; list sync not implemented)
- [ ] ChatGPT-specific visual differentiation (`.chat-turn--user` vs `--assistant` background tint)
- [ ] "ReadEasy Reader View" context menu on `link` context to open the linked URL's reader view
- [ ] Edit mode save to IndexedDB so edits survive tab refresh
- [ ] Unit tests for critical functions (image pipeline, EPUB generation)
- [ ] Flash It optimization for very large articles (>50 k words)

---

**End of Document** — Last updated: May 25, 2026
