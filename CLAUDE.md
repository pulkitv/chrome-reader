# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Development workflow

**No build step.** This is a vanilla JS Chrome extension — no npm, no bundler, no transpiler.

**To load / reload the extension:**
1. Open `chrome://extensions/`
2. Enable Developer Mode
3. Click "Load unpacked" → select this directory (first time)
4. Click the reload ↺ icon (subsequent changes)

**Mandatory reloads:**
- After changing `background.js`, `manifest.json`, or `rules.json` — the service worker and DNR rules do not hot-reload
- After changing `content.js` or `selection.js` — content scripts only inject into new navigations after reload
- `reader/*.js`, `sidepanel/*.js`, `reader.html`, `sidepanel.html` — take effect immediately on the next open of that page

**Testing:** Manual only. See `docs/TESTING.md` for the full checklist. No automated test runner.

---

## Architecture

### Entry points and module structure

| Entry | Purpose |
|---|---|
| `background.js` | Service worker — extraction trigger, reading list CRUD, auth, floater rebroadcast, context menu |
| `content.js` | Injected on demand — full extraction pipeline; dispatched by background |
| `selection.js` | Declarative content script (`<all_urls>`) — floating launcher, Save Selection, ping responder |
| `reader.html` + `reader.js` | Reader tab — ES module entry-point (~160 lines), delegates to `reader/*.js` |
| `sidepanel.html` + `sidepanel.js` | Side panel — ES module entry-point, delegates to `sidepanel/*.js` |
| `db.js` | IndexedDB wrapper (used by sidepanel; background has inline helpers) |

Both `reader.js` and `sidepanel.js` are thin entry-points only — all feature logic lives in their respective `reader/` and `sidepanel/` module directories and is imported via ES `import`.

### Extraction priority chain (`content.js → extractArticle()`)

```
Priority 0a  isChatGPT()           → extractChatGPT()
Priority 0b  isFacebookPostPermalink() → extractFacebookPermalink() (returns null if logged-in)
Priority 1   pickActiveDialog()    (domain-gated: FB/IG/Reddit/Twitter/LinkedIn)
Priority 2   Readability           (charThreshold 250, retry ladder [0, 350, 900] ms)
Priority 3   buildFallbackArticle() (highest-text-content DOM element)
```

### Reading list storage (two-tier)

- `chrome.storage.local.readingListMeta` — fast UI metadata array `[{id, title, url, siteName, addedDate}]`
- IndexedDB `savedArticles` — full HTML with embedded base64 PNG data-URIs (for EPUB/PDF export)

Both stores **must be kept in sync** on every add/delete/title-update.

### Key message flows

- **Toolbar click / floater "Switch to reader"** → `background.js openReaderViewForTab()` → `chrome.scripting.executeScript(content.js)` → `extractArticle()` → `chrome.storage.session.currentArticle` → `reader.html` loads article
- **Floater re-enable** → background sends `{ action: 'ping' }` to each tab; `{ alive: true }` → skip injection; no response → inject `selection.js` (prevents duplicate launchers)
- **Auth** → sidepanel sends `authSignIn/authGetState/authSignOut` → background manages token + profile → emits `authUpdated` + writes `chrome.storage.sync.authState`

---

## Critical constraints

1. **Never RegExp on base64** — use `str.split(literal).join(replacement)`. Base64 contains `+`, `/`, `=` which break regex.
2. **Always replace both `&` and `&amp;`** when patching image URLs in HTML strings.
3. **`fetch()` from extension context bypasses CORS** — `<all_urls>` permission covers this; never inject image-fetch into the page.
4. **Canvas taint** — fetch blob → objectURL → `<img>` → canvas draw. ObjectURL is same-origin; direct `http` src taints the canvas.
5. **`document.execCommand()` in edit mode** — deprecated per spec but the only viable in-browser rich-text API without an external library; it works in Chrome extension contexts.
6. **`[role="main"]` is excluded from `FB_POST_PERMALINK_SELECTORS`** — it contains the full news feed when logged in.
7. **`pickActiveDialog()` is domain-gated** — generic article pages have cookie/newsletter modals as false positives.
8. **IndexedDB is per-context** — `background.js` has inline helpers; `sidepanel.js` uses `db.js`; same database, different access paths.
9. **`chrome://` pages** — extension cannot inject scripts; always guard with `tab.url.startsWith('chrome://')`.
10. **EPUB `mimetype` entry must use `{ compression: 'STORE' }`** — required by EPUB spec.
11. **`declarativeNetRequest` rules require extension reload** — Chrome rebuilds `_metadata/` on reload.
12. **`#readerAuthBtn` needs `position: relative`; `.auth-guest-icon` and `.auth-avatar` need `position: absolute; inset: 0`** — `align-self: stretch` silently fails on first paint in Chrome extension pages.
13. **Cloud sync is fire-and-forget** — `supabaseSyncArticle` and `supabaseDeleteArticle` catch all errors internally; never gate the save/delete flow on Supabase availability. The duplicate-detected re-save path also goes through `supabaseSyncArticle(..., { autoSaveOnly: true })` so a missing cloud row gets healed by the server's first-capture fallback.
14. **`state.currentArticleId` must be populated from `saveToReadingList` response** — `response.articleId` is set by background on save; without it, edit-mode changes cannot persist to the reading list entry.
15. **Webapp-created draft rows exist in Supabase** — the web app can create `articles` rows with `url = 'webapp://draft/<uuid>'` and `site_name = 'Web App'`. The extension currently never reads from Supabase, so this is inert for the extension today. If/when cloud-pull is added: treat these as display-only (no `chrome.tabs.create`, no re-extraction, no image refetch); prefer `site_name` over a derived hostname.

---

## Storage keys reference

| Storage | Key | Content |
|---|---|---|
| `session` | `currentArticle` | Article object — reader tab data bus |
| `local` | `readingListMeta` | `[{id, title, url, siteName, addedDate}]` |
| `sync` | `readerPreferences` | `{theme, fontSize, wideWidth}` |
| `sync` | `floatingButtonEnabled` | boolean, default `true` when missing |
| `sync` | `floatingButtonPosition` | Persisted launcher coordinates |
| `sync` | `authState` | `{isSignedIn, provider, profile: {email, name, picture}, lastSignInAt}` |
| IndexedDB | `savedArticles` | `{id, title, url, siteName, addedDate, htmlContent}` |

---

## Documentation

Full architecture, invariants, and sprint history live in `docs/`. Key files:

- `docs/PROJECT_SUMMARY.md` — canonical snapshot of what exists, operational contracts, invariants, handoff checklist
- `docs/PROJECT_ARCHITECTURE_FOUNDATION_AND_SYSTEM_MAP.md` — message contracts, storage schema, file map, architecture diagram
- `docs/PROJECT_ARCHITECTURE_WORKFLOWS_AND_HISTORY.md` — function reference, common task recipes, quick-reference table
- `docs/PROJECT_ARCHITECTURE.md` — hub/index pointing to the above
- `docs/sprints/` — month-by-month delivery history

**When making architectural or contract changes**, update `PROJECT_SUMMARY.md` and `PROJECT_ARCHITECTURE_FOUNDATION_AND_SYSTEM_MAP.md` together — they must not contradict each other.
