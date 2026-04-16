# ReadEasy Chrome Extension — Project Summary

## April 17, 2026 — Agent-Oriented Executive Summary (Canonical)

Use this section as the primary source of truth when loading this project into a separate CLI agent.

### What exists right now

1. **Reader pipeline is stable**
   - toolbar click → background extraction → session storage → reader render

2. **Reading list architecture is stable**
   - `readingListMeta` in local storage for fast UI
   - full article HTML in IndexedDB for export-quality operations

3. **Selection saving has been redesigned**
   - The old floating in-page marker is deprecated/removed
   - Side panel now owns selection saving through **Save Selection**
   - `selection.js` listens for `getSelectedHTML` and returns processed selected HTML

4. **Current article add flow UX changed**
   - Old full-width “Add to List” button in the current card was replaced
   - Current behavior: compact plus button on top-right of current article card
   - Action semantics are unchanged (still same Add-to-List behavior)

5. **Important UX bug fixed**
   - Save Selection initially disappeared after using Add-to-List due card reset coupling
   - Save Selection is now controlled independently via dedicated visibility logic tied to active tab type

6. **Floating launcher now exists across webpages**
   - A draggable floating ReadEasy launcher is injected on regular websites
   - Clicking it opens the Chrome side panel
   - Position is persisted across pages

7. **Side panel now has a settings menu**
   - A 3-dot menu exists in the side panel header
   - Menu opens a dedicated in-panel Settings page
   - Settings currently include `ReadEasy Floater` enabled/disabled control
   - Default state is enabled

---

### Chronological progression (condensed but complete)

#### Initial architecture
- `0375d98`: Extension foundation (reader, extraction, storage, EPUB baseline)

#### Reliability upgrades
- `061e3e3`: Unified image embedding pipeline (`fetch` + canvas PNG), better cross-site image handling

#### UI and policy iterations
- `054e906`, `13085ca`, `0e4f11e`: UI naming and privacy/policy updates

#### X4 workflow
- `85fbb49`: Merge & Send to X4 modal flow, regeneration pipeline, image-exclusion mode

#### Selection marker era
- `7d8d2ba`: Added floating marker on selected webpage text
- `71054e6`: Hardened marker behavior for SPA contexts

#### Release docs state
- `b893cfb`: v1.0.4 metadata/privacy prep

#### Post-v1.0.4 UX migration
- Replaced floating marker with sidepanel-driven Save Selection action
- Repurposed `selection.js` to message-based extractor

#### Recent polish
- `d454174`: compact plus-button add UX + Save Selection visibility/state improvements

#### April 17, 2026 follow-up UX additions
- Added floating launcher button on webpages using extension icon
- Added draggable persistence for launcher position
- Added sidepanel header menu and Settings page
- Added synced `ReadEasy Floater` setting controlling launcher visibility across tabs/pages

---

### Current operational contracts

1. **Save selection request path**
   - Sidepanel → tab content script (`getSelectedHTML`) → sidepanel save pipeline → background `saveToReadingList`

2. **Uniqueness for repeated selections**
   - URL includes hash suffix (`#highlight-<timestamp>`) to avoid dedup collision for repeated saves from same source page

3. **List update signaling**
   - background emits `listUpdated`
   - sidepanel also listens to `chrome.storage.onChanged`

4. **Floating launcher control path**
   - `selection.js` reads synced `floatingButtonEnabled`
   - sidepanel settings writes `floatingButtonEnabled`
   - open tabs update live via `chrome.storage.onChanged`

---

### If another agent continues from here, it should assume

1. Save Selection must remain non-intrusive and sidepanel-based
2. Save Selection visibility must not depend on current-article card reset lifecycle
3. Add-to-List plus-button behavior should remain functionally equivalent to old Add-to-List
4. Merged EPUB should include both full articles and saved highlighted selections
5. Floating launcher visibility must remain controlled by synced settings, default enabled
6. Launcher position persistence must remain independent of enable/disable state

---

### Fast handoff checklist for next agent

- Confirm regular webpage: Save Selection visible
- Confirm Add-to-List click does not permanently hide Save Selection
- Confirm multiple selections from same page are saved as separate entries
- Confirm merged EPUB includes these entries
- Confirm floating launcher appears on regular webpages by default
- Confirm disabling `ReadEasy Floater` from settings hides launcher immediately
- Confirm re-enabling restores launcher without needing reinstall

---

> If older sections below conflict with this April 17 summary, trust this section first.

> **For AI assistants:** Read `PROJECT_ARCHITECTURE.md` for a full deep-dive. This file is a quick orientation.

> **Last updated:** April 17, 2026

---

## What It Does

ReadEasy is a Chrome Manifest V3 extension for distraction-free reading. It extracts article content from any webpage and displays it in a clean reader view. It also maintains a persistent Reading List (up to 10 articles, with images fully embedded) and can export all saved articles as a merged EPUB.

The side panel also supports **Merge & Send to X4**: it generates a merged EPUB, opens a Send-to-X4 modal, supports optional **Exclude Images** regeneration, and uploads to the device over LAN.

---

## File Map

```
chrome-extension/
│
├── manifest.json           MV3 config — permissions, side_panel, declarativeNetRequest,
│                           content scripts, web-accessible icon asset, CSP
├── background.js           Service worker — toolbar click → reader tab, IndexedDB CRUD,
│                           saveToReadingList / deleteFromList handlers, context menu
├── content.js              Injected content script — Readability extraction, URL normalisation
├── selection.js            Declarative content script — Save Selection responder,
│                           floating launcher render/drag/open-sidepanel logic
├── db.js                   IndexedDB wrapper (Promise-based) — used by sidepanel.js
│
├── reader.html             Reader view UI
├── reader.js               ~2400 lines — article render, themes, font, Flash It, TTS,
│                           Web App postMessage handoff, Add to List, single-article EPUB
├── reader.css              Themes (light/sepia/dark), Flash overlay, progress bar, toasts
│
├── sidepanel.html          Side panel UI — Save Selection, current article card,
│                           reading list, overflow menu, settings page
├── sidepanel.js            ~940 lines — list render, add/remove, Save Selection,
│                           inline title edit, EPUB merge, tab detection,
│                           floater settings persistence, storage listeners
├── sidepanel.css           Side panel styles — cards, compact add button, menu,
│                           settings page, inline title editor, toasts
│
├── rules.json              declarativeNetRequest — sets Referer header for CDN images
│                           (Substack, Medium, etc.)
│
├── libs/
│   ├── Readability.js      Mozilla Readability (89 KB — do not modify)
│   └── jszip.min.js        JSZip for EPUB generation (~100 KB)
│
├── icons/                  icon16/32/48/128.png
├── _metadata/              Auto-generated by Chrome for declarativeNetRequest rules
└── readeasy-postmessage-listener.js   Helper for web apps receiving postMessage payload
```

---

## Tech Stack

- **Language:** Vanilla JavaScript (ES2020+), no frameworks
- **Extension:** Chrome Manifest V3, service worker background
- **Content Extraction:** Mozilla Readability.js
- **EPUB Generation:** JSZip
- **Storage:** IndexedDB (article HTML), chrome.storage.local (metadata), chrome.storage.session (article data bus), chrome.storage.sync (user prefs)
- **Permissions:** `activeTab`, `scripting`, `storage`, `declarativeNetRequest`, `sidePanel`, `contextMenus`, `host_permissions: ["<all_urls>"]`

---

## Data Flow

### Reading a webpage
1. User clicks toolbar icon → `background.js` receives `chrome.action.onClicked`
2. Injects `Readability.js` + `content.js` into the active tab
3. `content.js` clones the DOM, normalises URLs, parses with Readability, returns article object
4. background.js saves to `chrome.storage.session` → opens `reader.html?url=<sourceUrl>`
5. `reader.js` reads session storage, sanitises HTML, renders article

### Saving to Reading List (from reader view)
1. User clicks "Add to List" in reader toolbar
2. `reader.js` collects all `<img src="http…">` from article body
3. Each image: `fetch()` (CORS-bypassed via `<all_urls>`) → blob → canvas → `toDataURL('image/png')` (20 s timeout, `AbortController`)
4. `Promise.allSettled` — failures skipped, never block save
5. Raw `innerHTML` patched with `split+join` (never RegExp on base64)
6. `chrome.runtime.sendMessage({ action: 'saveToReadingList', article })` → background.js
7. background.js: URL dedup check → capacity evict if needed → IndexedDB write → metadata update → broadcast
8. Side panel refreshes via `chrome.storage.onChanged`

### Saving to Reading List (from regular tab, via side panel)
1. Side panel detects active tab is a normal website → shows "Add to List"
2. User clicks → `handleAddToListFromRegularTab()` injects Readability + content.js into the tab
3. Same `fetchImageAsPng()` pipeline as above, but replaces `img.setAttribute('src')` in a `tempDiv` then serialises
4. Sends same `saveToReadingList` message to background.js

### Saving a text selection (from regular tab, via side panel)
1. Side panel detects a normal `http/https` tab and shows **Save Selection**
2. User highlights page text, then clicks **Save Selection** in side panel
3. sidepanel sends `{ action: 'getSelectedHTML' }` to `selection.js`
4. `selection.js` returns processed HTML fragment + source page metadata
5. sidepanel creates a synthetic article title like `Highlighted Text - <today>`
6. URL is suffixed with `#highlight-<timestamp>` so repeated saves from same page stay unique
7. sidepanel sends the final article payload to background `saveToReadingList`

### Floating launcher + floater setting
1. `selection.js` runs declaratively on regular webpages
2. It reads synced `floatingButtonEnabled` and `floatingButtonPosition`
3. If enabled, it renders a draggable floating launcher using the extension icon
4. Clicking launcher requests side panel open via background message path
5. Side panel Settings page writes `floatingButtonEnabled`
6. Open tabs react immediately through `chrome.storage.onChanged`

### Merged EPUB export
1. User clicks "Merge & Download EPUB" in side panel
2. `getAllArticles()` fetches all full-HTML articles from IndexedDB
3. Regex extracts `data:` URIs from raw HTML strings (no DOM round-trip)
4. Content-based fingerprint deduplicates images across articles
5. `decodeNamedEntities()` converts HTML entities to Unicode for valid XHTML
6. JSZip builds EPUB structure, triggers download

### Merge & Send to X4 (side panel)
1. User clicks "Merge & Send to X4"
2. Side panel loads all saved articles, opens **Send to X4** modal, and generates pending EPUB blob
3. Modal allows editable EPUB filename, firmware type, device IP, and connection refresh
4. **Exclude Images** checkbox is session-only (in-memory state for the current side panel lifetime) and triggers async EPUB regeneration + live size update
5. Regeneration uses monotonic request IDs; stale async completions are ignored (`latest-toggle-wins`)
6. Send/Download buttons are disabled only while latest regeneration is in flight
7. On regeneration failure, previous valid blob is retained and a non-blocking toast is shown
8. Send action uploads as multipart `file` to `http://<device-ip>/upload` with adaptive timeout

### Editing saved article titles (side panel)
1. User clicks the pencil icon at top-right of a saved article card
2. Card switches to inline edit mode with title input + Save/Cancel
3. `Save` sends `chrome.runtime.sendMessage({ action: 'updateArticleTitle', id, title })` to `background.js`
4. background.js updates both IndexedDB (`savedArticles.title`) and `chrome.storage.local.readingListMeta[].title`
5. Side panel refreshes via `listUpdated`/`chrome.storage.onChanged`
6. `Merge & Download EPUB` now uses the edited title automatically (from IndexedDB)

---

## Key Features

| Feature | Where | Notes |
|---|---|---|
| Article extraction | `content.js` | Readability, absolute URL fix, srcset removal, lazy-load |
| Reader themes | `reader.css` / `reader.js` | light / sepia / dark via CSS custom properties + body class |
| Font size control | `reader.js` | 5 levels, persisted in sync storage |
| Progress bar | `reader.js` | Scroll % |
| Flash It (RSVP) | `reader.js` | 3 modes: overlay, word-highlight, line-highlight; 100–1000 WPM |
| Text-to-Speech | `reader.js` | Web Speech API, voice selector, sentence chunking, line-sync with Flash It |
| Web App Handoff | `reader.js` | postMessage HTML + CSS to external URL with optional handshake |
| Single-article EPUB | `reader.js` | canvas-embed images, JSZip, EPUB 3.0 |
| HTML download | `reader.js` | Standalone HTML with article CSS |
| Email EPUB | `reader.js` | mailto: link with base64 EPUB |
| Reading List | `sidepanel.js` + `background.js` | Up to 10 articles, images embedded as PNG data URIs |
| Save Selection | `sidepanel.js` + `selection.js` + `background.js` | Sidepanel-driven highlighted-text save flow, non-intrusive replacement for old page marker |
| Floating launcher | `selection.js` + `background.js` | Draggable webpage launcher opens side panel, position persisted across pages |
| Floater settings UI | `sidepanel.html/js/css` | 3-dot menu → Settings page → synced `ReadEasy Floater` toggle |
| Inline title editing | `sidepanel.js` + `background.js` | Pencil icon on saved cards, inline input, Save/Cancel, persisted to metadata + IndexedDB |
| Merged EPUB | `sidepanel.js` | Multi-chapter, image dedup, valid XHTML, EPUB 2+3 nav |
| Merge & Send to X4 | `sidepanel.html/js/css` | Modal flow, connection check, upload, response preview, optional image exclusion with guarded async regeneration |
| CDN image fix | `rules.json` | declarativeNetRequest sets Referer for Substack, Medium |
| Keyboard shortcuts | `reader.js` | F, Space, R, +/−, Esc |

---

## Storage Keys Reference

| Storage | Key | Content |
|---|---|---|
| `session` | `currentArticle` | Article object passed from background → reader tab |
| `session` | `flashItState` | `{ wordIndex, speed, mode }` — playback position |
| `local` | `readingListMeta` | `[{ id, title, url, siteName, addedDate }]` |
| `sync` | `x4Settings` | `{ firmware, ip }` for Send-to-X4 modal defaults |
| `sync` | `readerPreferences` | `{ theme, fontSize, wideWidth }` |
| `sync` | `floatingButtonEnabled` | Floater visibility toggle, default `true` |
| `sync` | `floatingButtonPosition` | Persisted draggable launcher position |
| IndexedDB | `savedArticles` | `{ id, title, url, siteName, addedDate, htmlContent }` |

---

## Critical Gotchas

1. **Never RegExp on base64** — use `str.split(literal).join(replacement)`. Base64 contains `+`, `/`, `=`.
2. **Always replace both `&` and `&amp;`** when patching image URLs in HTML strings.
3. **fetch() from extension context bypasses CORS** — this is why `<all_urls>` is required and why we don't inject image-fetch code into the page itself.
4. **Canvas taint** — drawing a cross-origin image to canvas from a page context throws a security error. Always fetch the blob first, create an `objectURL`, load it into an `<img>`, then draw. The objectURL is same-origin.
5. **PNG normalisation** — `fetchImageAsPng()` always outputs PNG regardless of source format (WebP, AVIF, JPEG) for EPUB reader compatibility.
6. **IndexedDB is only in extension pages** — background.js has its own IndexedDB helpers. sidepanel.js uses `db.js`. They are separate instances accessing the same database.
7. **Session storage is tab-scoped** — if the reader tab is closed and reopened, `currentArticle` is gone.
8. **Debounce `initPanel()`** — storage.onChanged can fire multiple times rapidly. The 30 ms debounce prevents duplicate renders.
9. **EPUB mimetype must be STORE** — `zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })` — required by EPUB spec.
10. **`chrome://` pages** — extension cannot inject scripts on internal Chrome pages. Always guard with `tab.url.startsWith('chrome://')`.
11. **Title edits must update both stores** — update `readingListMeta` (UI source) and IndexedDB `savedArticles` (EPUB source) in the same action to avoid title mismatch.
12. **X4 Exclude Images is session-only** — `x4ExcludeImagesSession` is in-memory and intentionally not persisted to Chrome storage.
13. **X4 regeneration is race-guarded** — post-`await` UI/blob updates must be request-ID gated so stale toggles cannot overwrite newer results.

---

## Loading & Debugging

```
1. chrome://extensions/ → Developer mode → Load unpacked → select this folder
2. Three DevTools consoles:
   - Background service worker: chrome://extensions/ → Inspect views: service worker
   - Reader tab: F12 on the reader tab
   - Side panel: right-click side panel → Inspect
3. Check chrome.storage.local: DevTools → Application → Local Storage
4. Check IndexedDB: DevTools → Application → IndexedDB → ReadEasyDB
```

---

## What Was Recently Changed

### February 28, 2026 — Image Pipeline Unification
- Both `reader.js` and `sidepanel.js` use `fetchImageAsPng(url)`:
   `fetch()` + 20 s `AbortController` timeout → blob → objectURL → off-screen `<img>` → canvas → `toDataURL('image/png')`
- Fixed CORS canvas-taint failures from the old canvas-on-page-image approach
- `Promise.allSettled` prevents single-image failures from blocking save
- URL replacement uses `split+join` only (never RegExp on base64)
- Merged EPUB improvements: stronger image dedup fingerprint, named-entity decoding, base64 whitespace stripping

### March 28, 2026 — Inline Title Editing in Reading List
- Added top-right pencil edit icon on each saved article card in side panel
- Replaced prompt flow with inline input field + Save/Cancel actions
- Added `updateArticleTitle` message path in `background.js`
- Title updates now persist to both:
   - `chrome.storage.local.readingListMeta` (list UI)
   - IndexedDB `savedArticles.title` (merged EPUB source)
- Merged EPUB chapters and TOC now use edited titles automatically

### March 28, 2026 — Merge & Send to X4 + Exclude Images Toggle
- Added "Merge & Send to X4" side panel action and Send-to-X4 modal
- Implemented firmware/IP controls, connection check, upload response preview
- Upload target uses multipart `file` → `POST /upload` (device IP configurable, default `192.168.1.11`)
- Added adaptive upload timeout for large EPUB transfers
- Added **Exclude Images** checkbox in modal with live blob regeneration and file size refresh
- Implemented guarded async regeneration with monotonic request IDs (`latest-toggle-wins`)
- Send/Download buttons are disabled only during latest regeneration
- If regeneration fails, previous valid EPUB blob is preserved and user gets a non-blocking toast

### April 17, 2026 — Floating Launcher + Side Panel Settings
- Added a draggable floating launcher to regular webpages via `selection.js`
- Exposed launcher icon through manifest web-accessible resources so it renders inside page context
- Changed default launcher placement to bottom-left and increased icon size for better visibility
- Added fallback launcher label when image asset fails to load
- Added side panel 3-dot overflow menu and dedicated Settings page
- Added synced `ReadEasy Floater` setting controlling launcher visibility across open tabs

---

## Next Steps / Known Gaps

- [ ] Login / cloud sync for reading list (planned next phase)
- [ ] Reader mode auto-detection (suggest reader when landing on article)
- [ ] Annotations and highlighting
- [ ] Print stylesheet
- [ ] Unit tests for critical functions (image pipeline, EPUB generation)
- [ ] Large article optimisation (>50k words for Flash It word extraction)



## Archived Request Note — Original Highlight Marker Proposal

This historical note is retained for chronology only.

- Original request: show a small marker directly above selected webpage text and save that selection into the reading list.
- Current implemented architecture: the intrusive marker was removed and replaced by sidepanel-driven **Save Selection**.
- Result: highlighted selections still save into the reading list and still participate in merged EPUB generation, but the trigger now lives in the side panel rather than over the page selection.

---

## Handoff Quick Copy (Chronology + Continuation Checklist)

### Chronological timeline with key commits and architecture shifts

- `0375d98` — Foundation: reader pipeline + extraction + storage + EPUB baseline
- `061e3e3` — Reliability: unified image embedding pipeline (`fetch` + canvas PNG)
- `054e906`, `13085ca`, `0e4f11e` — UI/Privacy iteration wave
- `85fbb49` — X4 architecture: Merge & Send modal + regeneration flow
- `7d8d2ba` — Added floating in-page selection marker
- `71054e6` — SPA hardening for selection marker behavior
- `b893cfb` — v1.0.4 release metadata/privacy prep
- Post-`b893cfb` — Architecture shift: removed floating marker, moved selection save to sidepanel-driven flow via `getSelectedHTML`
- `d454174` — UX/state polish: compact plus add button + persistent Save Selection behavior and visibility decoupling from current-article card lifecycle
- April 17 follow-up — draggable webpage launcher + sidepanel Settings page + synced `ReadEasy Floater` control

### Quick verification checklist for continuation work

- [ ] Plus-button Add-to-List works in both reader tab and regular webpage tab
- [ ] Save Selection remains available on regular `http/https` pages after Add-to-List actions
- [ ] Multiple selections from same source page save as distinct items (`#highlight-<timestamp>`)
- [ ] Merged EPUB contains both full saved articles and saved highlighted selections
- [ ] `listUpdated` + `chrome.storage.onChanged` keep sidepanel state in sync
- [ ] Floating launcher appears on regular webpages by default and opens the side panel
- [ ] Disabling `ReadEasy Floater` hides launcher immediately; re-enabling restores it
- [ ] Internal/unsupported pages (`chrome://`, extension pages) correctly hide Save Selection