# ReadEasy Chrome Extension — Project Summary

---

## 📋 Documentation Maintenance Rules (Read Before Editing This File)

> **This section is mandatory reading for any human or AI agent that edits this document.**
> These rules exist to ensure this file always functions as a reliable, self-contained quick-start reference that any new CLI agent can read to orient themselves and immediately continue work.

### Purpose of This File

This file is the **quick-orientation companion** to `PROJECT_ARCHITECTURE.md`. It is written so that a new agent — with no prior conversation context — can read it in under five minutes and:
1. Know what the extension does and what its major features are
2. Know the full chronological history of what was built and when
3. Know the current operational contracts that must be preserved
4. Know the invariants and assumptions the next agent should carry forward
5. Run through the fast handoff checklist to verify nothing is broken before starting new work

> For a full deep-dive (message flows, storage schema, implementation patterns, function references), read `PROJECT_ARCHITECTURE.md`.

### Rules for Updating This File

1. **Update on every feature completion** — After implementing any user-facing feature or significant architectural change, update the `What exists right now` section and the `Chronological progression` section.

2. **Keep `What exists right now` truthful** — This section describes the current state of the codebase, not aspirations. Only include things that are actually implemented and working.

3. **Append to chronological progression, never rewrite** — Each implementation session should add a new dated entry. Do not edit past entries. Agents reading this file later need the history to understand why things are the way they are.

4. **Keep operational contracts accurate** — The `Current operational contracts` section must list every active message action, storage key contract, and data flow contract. Update it whenever contracts change.

5. **Update invariants when design decisions are locked** — The `If another agent continues from here, it should assume` section documents deliberate design constraints. Add entries whenever a decision is made that future agents must not override.

6. **Update the handoff checklist after every change** — Add a new checklist item for every behavior that must be verified before the next agent starts work. Never remove checklist items — only add them.

7. **Update `Last updated` date** — Update the date stamp at the bottom of the canonical snapshot every time this file is edited.

8. **Keep File Map and Storage Keys Reference current** — The `File Map` and `Storage Keys Reference` sections must match the actual repository state. If a file is added, renamed, or repurposed, update the map.

9. **Both files are paired** — `PROJECT_SUMMARY.md` (quick orientation) and `PROJECT_ARCHITECTURE.md` (deep-dive) must be updated together. They must not contradict each other. If the summary says one thing and the architecture doc says another, the architecture doc is authoritative.

10. **Resolve conflicts in favor of the most recent canonical snapshot** — If any older section below conflicts with the latest canonical snapshot, trust the snapshot. Do not delete the older section — add a note instead.

---

## April 18, 2026 — Agent-Oriented Executive Summary (Canonical)

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
   - Clicking it opens a two-option menu: **Switch to reading view** or **Open side panel**
   - Position is persisted across pages

7. **Side panel now has a settings menu**
   - A 3-dot menu exists in the side panel header
   - Menu opens a dedicated in-panel Settings page
   - Settings currently include `ReadEasy Floater` enabled/disabled control
   - Default state is enabled

8. **Optional Google sign-in is implemented**
    - Side panel header now includes guest/avatar auth icon
    - Sign-in uses `chrome.identity.getAuthToken()` + Google profile fetch
    - Auth state persists in `chrome.storage.sync.authState`
    - Access token remains in service-worker memory only

9. **Feedback collection links are now surfaced in-product**
   - Reader top navigation now shows a **Feedback** CTA alongside the restored **Merge EPUBs** shortcut
   - Side panel footer now includes **Share feedback & ideas**
   - Both open `https://readeasy.featurebase.app/` in a new tab

10. **Reader toolbar merge shortcut is restored**
   - The top navigation no longer uses **Download EPUB** in that slot
   - **Merge EPUBs** is back in the reader header and opens the external merge service

11. **Side panel architecture is now modularized**
   - `sidepanel.js` is now a thin ES-module entry-point
   - Core sidepanel logic is split across `sidepanel/*.js` modules (auth, settings, tab detection, list add/render, EPUB build, X4 modal, utils, state)
   - Shared mutable sidepanel state now lives in `sidepanel/state.js`
   - `sidepanel.html` now loads `sidepanel.js` with `type="module"` while `db.js` + `jszip.min.js` remain preloaded globals

12. **Floater toggle now has robust cross-tab recovery**
   - Disable path removes stale/orphaned non-responsive floaters across scriptable tabs
   - Re-enable path restores floaters across eligible already-open tabs without manual refresh
   - Selection script reinjection is idempotent and self-heals stale floater references

13. **Extraction is now resilient for short and social-media pages**
   - Global Readability `charThreshold` lowered to 250 (was 500)
   - Fallback extraction added: if Readability fails or yields < 220 chars, the highest-text-content DOM element is used
   - Retry ladder `[0, 350, 900]` ms in `background.js` and `sidepanel/reading-list-add.js` handles dynamic/SPA pages
   - Toolbar click shows a visible badge (`!`) on failure instead of a silent no-op
   - Floater "Switch to reading view" shows an in-page toast on failure

14. **Social dialog extraction added (Facebook, Instagram, Reddit)**
   - `content.js` checks for an active `[role="dialog"]` / `[aria-modal="true"]` overlay before full-document extraction
   - Dialog detection is domain-gated to `facebook.com`, `instagram.com`, `reddit.com`, `twitter.com`, `x.com`, `linkedin.com`
   - Enables logged-in Facebook post modals, Instagram overlays, and Reddit post dialogs to open in reader view
   - `extractionMode: 'dialog'` is returned in article metadata

15. **CDN referrer rules expanded for Facebook and Instagram**
   - `rules.json` rules 3 and 4 added for `*fbcdn.net*` and `*cdninstagram.com*` image requests
   - Referrer set to `https://www.facebook.com/` and `https://www.instagram.com/` so CDN images load in the reader tab

16. **Facebook post permalink extraction added (Priority 0)**
   - `content.js` now detects Facebook post permalink URLs (`/posts/`, `/permalink.php`, `/photos/`) before any other extraction path
   - New `extractFacebookPermalink()` function handles two states:
     - **Not logged in**: finds `[data-pagelet*="Permalink"]` container, applies FB-specific DOM pruning, returns clean post content
     - **Logged in**: permalink pagelet is absent (post is a dialog overlay on the feed); returns null so Priority 1 dialog extraction (`pickActiveDialog`) handles it
   - `pruneFacebookNode()` removes FB-specific UI chrome: right rail (`ColumnRight`/`RightRail`), stories, composer, suggested content, ARIA navigation and banner roles
   - `removeScrambledDates()` strips Facebook's CSS-obfuscated timestamps (characters individually spread across child spans, rearranged by CSS `order`)
   - `cleanFacebookTitle()` strips the notification count prefix (`(20+)`) and `| Facebook` suffix from the document title
   - `[role="main"]` intentionally excluded from permalink selectors — it contains the full feed when logged in
   - New `extractionMode: 'fb-permalink'` returned in article metadata for not-logged-in path

17. **Reader edit mode is implemented**
   - A pastel-yellow `#editBtn` in the secondary header row enters edit mode
   - `#articleTitle`, `#articleByline`, and `#articleBody` all become `contenteditable` simultaneously
   - Fixed `#editToolbar` appears below the main header with: Bold, Italic, Underline, Font Color (color picker), Font Size (12–36 px), Align Left/Center/Right, Bullet List, Numbered List, Horizontal Rule, Insert Note callout, Insert Image, Insert/Edit Link, Save, Cancel
   - Save persists edited HTML to `chrome.storage.session.currentArticle` (session-only; tab refresh reverts to original)
   - Cancel reverts all three regions to their pre-edit snapshots
   - All downstream actions (EPUB export, Add to Reading List, TTS, Flash It) automatically use the edited content after Save
   - Note callout blocks are inserted with `<hr class="note-sep">` separators above and below; these separators are preserved in EPUB export
   - Link insert popover captures selection range before showing the URL input; bug where applying a link silently failed is fixed
   - URL input in the link popover is pre-filled with `https://`
   - "Donate" button renamed to "Buy me coffee" and its gold gradient styling removed

18. **Sidepanel "Merge & Create PDF" is implemented**
   - A red `#mergePdfBtn` button appears in the sidepanel footer alongside the EPUB and X4 buttons
   - Clicking it fetches all saved articles, builds a styled HTML document (cover page, TOC, all articles with page breaks), opens it as a blob URL in a new tab, and auto-triggers Chrome's print dialog
   - User selects "Save as PDF" in the print dialog to download the merged PDF
   - Module lives in `sidepanel/pdf-build.js`

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

#### April 17, 2026 follow-up reliability + auth additions
- Added sidepanel Google sign-in/sign-out (guest/avatar state)
- Added background auth actions: `authSignIn`, `authGetState`, `authSignOut`
- Added shared `openReaderViewForTab` flow so toolbar and floater “Switch to reading view” use same extraction path
- Updated floater click to open two-option menu instead of direct sidepanel open
- Fixed launcher menu initial top-left auto-open regression after page refresh
- Added background tab-wide rebroadcast (`floaterSettingChanged`) so disabling floater applies immediately across open tabs

#### April 17, 2026 follow-up feedback channel additions
- Added reader header **Feedback** CTA
- Added side panel footer **Share feedback & ideas** link
- Standardized both links to `https://readeasy.featurebase.app/`

#### April 17, 2026 reader toolbar follow-up
- Removed the reader header **Download EPUB** button from the top navigation slot
- Restored **Merge EPUBs** in the reader header
- Reader top navigation now includes both **Merge EPUBs** and **Feedback**

#### April 18, 2026 sidepanel modularization follow-up
- `3513076`: Split monolithic sidepanel into ES modules under `sidepanel/`
- Added shared state store (`sidepanel/state.js`) for pending X4 state, tab state, auth state, and constants
- Moved EPUB build logic to `sidepanel/epub-build.js` and X4 orchestration to `sidepanel/x4-modal.js`
- Kept `db.js` and `libs/jszip.min.js` as global scripts loaded before module entry-point

#### April 18, 2026 floater reliability follow-up
- `983339c`: Added stale floater artifact cleanup on disable across long-lived tabs
- Added background fallback cleanup injection when disabling floater
- Added re-enable recovery injection of `selection.js` across scriptable open tabs
- Added selection-script idempotency guard + stale-reference self-healing for reinjection safety

#### May 17, 2026 — Facebook post permalink extraction (Priority 0)
- Added `isFacebookPostPermalink()` — detects `/posts/`, `/permalink.php`, `/photos/` paths on `facebook.com`
- Added `extractFacebookPermalink()` — Priority 0 extraction path in `content.js`, fires before dialog check and Readability
- Added `pruneFacebookNode()` — removes right rail, stories, composer, suggested content, and ARIA navigation/banner roles
- Added `removeScrambledDates()` — removes CSS-scrambled timestamp elements (≥10 children where ≥65% are 1-char)
- Added `cleanFacebookTitle()` — strips `(20+)` notification prefix and `| Facebook` suffix from document title
- Not-logged-in path: finds `[data-pagelet*="Permalink"]`, prunes, returns `extractionMode: 'fb-permalink'`
- Logged-in path: permalink pagelet absent → `extractFacebookPermalink()` returns null → Priority 1 dialog extraction handles the post overlay modal
- `[role="main"]` intentionally excluded from `FB_POST_PERMALINK_SELECTORS` to avoid picking up the full feed in logged-in state

#### May 17, 2026 — Reader edit mode (full implementation)
- Added `#editBtn` (pastel yellow) to reader header secondary row
- Added `#editToolbar` (fixed bar, below header in edit mode): Bold, Italic, Underline, Font Color, Font Size, Align L/C/R, Bullet List, Numbered List, Horizontal Rule, Insert Note, Insert Image, Insert/Edit Link, Save, Cancel
- `enterEditMode()` makes title, byline, and body all contenteditable; strips `user-select:none` / `pointer-events:none` inline styles from extracted content; uses `requestAnimationFrame` + `{ preventScroll: true }` for cursor placement
- `exitEditMode(save)` — Save: persists to `chrome.storage.session.currentArticle`; Cancel: reverts all three snapshots
- `insertNoteBlock()` inserts `<hr class="note-sep">` above and below the note callout block
- `insertHorizontalRule()` inserts plain `<hr>` at cursor
- `insertImageAtCursor(file)` — FileReader → base64 data URL → `execCommand('insertHTML')`
- Link popover bug fixed: `applyLink()` and `unlinkSelection()` now capture `savedLinkRange` before `closeLinkPopover()` nulls it
- Link URL input pre-filled with `'https://'`; bare `'https://'` treated as no-op in `applyLink()`
- EPUB export updated: `.note-block` → `<blockquote>` with gradient background (Apple Books compatible); `hr.note-sep` → inline-styled
- "Donate" button renamed "Buy me coffee"; gold gradient styling removed

#### May 17, 2026 — Sidepanel Merge & Create PDF
- Added `sidepanel/pdf-build.js` module with `handleMergePDF()` and `buildMergedPrintHTML()`
- Added `#mergePdfBtn` (red `.btn-pdf`) to sidepanel footer
- PDF preview page opens as a blob URL in a new tab with `window.print()` auto-triggered
- Button enable/disable wired into `reading-list-render.js`; event listener in `sidepanel.js`

#### April 22, 2026 extraction resilience + social dialog support
- Lowered global Readability `charThreshold` from 500 → 250 in `content.js`
- Added `buildFallbackArticle()` using highest-text-content DOM element when Readability fails
- Added extraction metadata: `extractionMode`, `isFallback`, `visibleTextChars`, `isThinContent`
- Added `DIALOG_SELECTORS`, `pickActiveDialog()`, `buildDialogArticle()` in `content.js`
- Dialog detection domain-gated to social platforms only (facebook, instagram, reddit, twitter/x, linkedin)
- Added retry extraction ladder `[0, 350, 900]` ms in `background.js` and `sidepanel/reading-list-add.js`
- Added `showActionFailureBadge()` in `background.js` for visible toolbar failure feedback
- Added floater in-page toast (`showFloatingToast`) in `selection.js` for `openReaderView` failures
- Added `rules.json` rules 3 (`fbcdn.net`) and 4 (`cdninstagram.com`) with platform-appropriate referrers
- Removed extraction metadata notice banner from reader view (was exposing internal state to users)

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
   - open tabs update live via `chrome.storage.onChanged` plus background rebroadcast (`floaterSettingChanged`) for reliability
   - disabling also force-cleans stale floater artifacts in scriptable tabs
   - enabling also reinjects `selection.js` in scriptable open tabs for immediate floater restoration

5. **Auth control path**
    - sidepanel sends `authSignIn` / `authGetState` / `authSignOut`
    - background manages token + Google profile fetch + normalized `authState` persistence
    - sidepanel updates via `authUpdated` message and `chrome.storage.sync` state

6. **Feedback path (external navigation only)**
   - Reader and side panel feedback CTAs are static anchors to `https://readeasy.featurebase.app/`
   - No extension runtime message or article payload is sent by these CTA clicks

7. **Reader Merge EPUB path (external navigation only)**
   - Reader header **Merge EPUBs** opens `https://merge-epubs.vercel.app/`
   - No article payload is automatically posted by that click

---

### If another agent continues from here, it should assume

1. Save Selection must remain non-intrusive and sidepanel-based
2. Save Selection visibility must not depend on current-article card reset lifecycle
3. Add-to-List plus-button behavior should remain functionally equivalent to old Add-to-List
4. Merged EPUB should include both full articles and saved highlighted selections
5. Floating launcher visibility must remain controlled by synced settings, default enabled
6. Floater click behavior should remain menu-based (reading view + side panel) and drag-safe
7. Launcher position persistence must remain independent of enable/disable state
8. Feedback CTAs should continue to point to the Featurebase portal unless intentionally changed
9. Reader header should continue exposing **Merge EPUBs** alongside **Feedback** unless product direction changes
10. Floater toggle behavior must stay symmetric on large tab counts: disable clears all stale floaters; re-enable restores across eligible open tabs without manual refresh
11. Dialog extraction must remain domain-gated — never run `pickActiveDialog()` on non-social domains to avoid false positives on article pages with cookie/newsletter modals
12. `buildFallbackArticle()` is the last-resort path; dialog extraction and Readability take priority
13. CDN referrer rules in `rules.json` must use platform-appropriate referer values (facebook.com/instagram.com, not google.com) for social CDNs
14. Facebook post permalink extraction (Priority 0) fires before dialog check for FB permalink URLs — but intentionally returns null when logged in so Priority 1 (dialog) handles the post overlay
15. Never include `[role="main"]` in `FB_POST_PERMALINK_SELECTORS` — in logged-in Facebook state, `[role="main"]` contains the full feed, not the post
16. Reader edit mode is session-only by design — edits persist to `chrome.storage.session.currentArticle` and are lost on tab refresh; no persistent annotation store exists
17. Do NOT re-sanitize article HTML on edit mode Save — user's deliberate content changes (images, links, note blocks) would be stripped
18. Note blocks must always be inserted with `hr.note-sep` elements above and below — the EPUB export logic checks for these siblings to decide transformation strategy
19. `document.execCommand()` is the only viable formatting API in the Chrome extension context; it is deprecated by the web spec but functional in Chrome — do not introduce a heavy editor library without explicit product direction
20. The PDF merge button opens a blob HTML tab; it does NOT download a .pdf file directly — Chrome's print dialog is the user's path to save

---

### Fast handoff checklist for next agent

- Confirm regular webpage: Save Selection visible
- Confirm Add-to-List click does not permanently hide Save Selection
- Confirm multiple selections from same page are saved as separate entries
- Confirm merged EPUB includes these entries
- Confirm sidepanel opens cleanly after ES-module split (no import/runtime errors)
- Confirm floating launcher appears on regular webpages by default
- Confirm floating launcher menu opens with both actions and positions near launcher
- Confirm disabling `ReadEasy Floater` from settings hides launcher immediately
- Confirm re-enabling restores launcher without needing reinstall
- Confirm stale/non-clickable floater remnants are removed on disable in long-lived tabs
- Confirm re-enable restores floater across existing eligible tabs without manual refresh
- Confirm auth sign-in/out state persists and header icon updates correctly
- Confirm reader/sidepanel feedback links open `https://readeasy.featurebase.app/`
- Confirm reader header **Merge EPUBs** opens `https://merge-epubs.vercel.app/`
- Confirm regular article pages (Medium, BBC, Wikipedia) still extract correctly
- Confirm logged-in Facebook post modal opens in reader view (dialog extraction path)
- Confirm not-logged-in Facebook post permalink opens in reader view with clean content (fb-permalink extraction path)
- Confirm FB reader view title has no notification count prefix or `| Facebook` suffix
- Confirm FB reader view content has no scrambled date characters or repeated "Facebook" navigation text
- Confirm reader view does NOT show extraction metadata banner to users
- Confirm toolbar shows `!` badge when extraction fails on an unsupported page
- Confirm floater toast appears when "Switch to reading view" fails
- Confirm Facebook/Instagram post images load in reader tab (no 403s)
- Confirm Edit button is visible and pastel yellow in the secondary header row
- Confirm entering edit mode shows the toolbar and makes title/byline/body editable with blue focus rings
- Confirm cursor appears in the article body immediately after clicking Edit (including on long articles)
- Confirm text selection is preserved when clicking toolbar buttons (selection does not collapse)
- Confirm Bold/Italic/Underline toggle correctly and highlight as active when selection is inside formatted text
- Confirm font size change applies inline px styles (not HTML `size` attribute)
- Confirm bullet list and numbered list toggle correctly
- Confirm horizontal rule is inserted at cursor position
- Confirm note block is inserted with HR separators above and below
- Confirm image insert works (select a local image file via toolbar button)
- Confirm link insert applies `href` to selected text; Apply with bare `https://` is a no-op
- Confirm link unlink removes the `<a>` tag from selected link
- Confirm Save button updates content visibly and shows "Article saved" toast
- Confirm Cancel reverts all three regions (title, byline, body) to pre-edit state
- Confirm EPUB export after edit contains the edited content
- Confirm note blocks appear with yellow background and blue left border in EPUB (Apple Books)
- Confirm "Merge & Create PDF" button is visible in sidepanel footer (red)
- Confirm clicking it opens a new tab with styled merged content and print dialog auto-triggers

---

> If older sections below conflict with this May 17 summary, trust this section first.
> *(Previously: April 22 was canonical — superseded by May 17 above.)*

> **For AI assistants:** Read `PROJECT_ARCHITECTURE.md` for a full deep-dive. This file is a quick orientation.

> **Last updated:** May 17, 2026

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
│                           identity + oauth2, content scripts, web-accessible icon asset, CSP
├── background.js           Service worker — toolbar click → reader tab, IndexedDB CRUD,
│                           save/delete/title-update handlers, openReaderView/openSidePanel,
│                           auth handlers, floater rebroadcast, context menu
├── content.js              Injected content script — Readability extraction, URL normalisation
├── selection.js            Declarative content script — Save Selection responder,
│                           floating launcher render/drag/two-option menu logic
├── db.js                   IndexedDB wrapper (Promise-based) — used by sidepanel modules
│
├── reader.html             Reader view UI
├── reader.js               ~2400 lines — article render, themes, font, Flash It, TTS,
│                           Web App postMessage handoff, Add to List, single-article EPUB
├── reader.css              Themes (light/sepia/dark), Flash overlay, progress bar, toasts
│
├── sidepanel.html          Side panel UI — Save Selection, current article card,
│                           reading list, overflow menu, settings page, footer feedback link
├── sidepanel.js            Side panel ES-module entry-point — boot + event wiring
├── sidepanel/              Side panel modular logic
│   ├── state.js            Shared mutable state + sidepanel constants
│   ├── utils.js            Shared helpers (toast/escape/filesize/download)
│   ├── auth.js             Sidepanel Google auth state + UI actions
│   ├── settings.js         Header menu/settings page/floater toggle
│   ├── tab-detection.js    Active-tab detection + Save Selection visibility
│   ├── reading-list-add.js Add from reader/regular tab + Save Selection pipeline
│   ├── reading-list-render.js  List rendering + inline title edit/remove + storage info
│   ├── epub-build.js       Merged EPUB/XHTML generation logic
│   ├── x4-modal.js         Merge orchestration + X4 modal/check/send/download logic
│   └── pdf-build.js        PDF preview — builds merged HTML blob, opens print dialog tab
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
- **Permissions:** `activeTab`, `scripting`, `storage`, `identity`, `declarativeNetRequest`, `sidePanel`, `contextMenus`, `host_permissions: ["<all_urls>"]`

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
4. Clicking launcher opens a menu:
   - **Switch to reading view** → `openReaderView`
   - **Open side panel** → `openSidePanel`
5. Side panel Settings page writes `floatingButtonEnabled`
6. Open tabs react through `chrome.storage.onChanged` and background rebroadcast (`floaterSettingChanged`) so all tabs update immediately

### Google sign-in (side panel)
1. User clicks sidepanel auth icon (guest/avatar)
2. sidepanel sends `authSignIn` to background
3. background acquires token with `chrome.identity.getAuthToken({ interactive: true })`
4. background fetches user profile from Google and stores normalized `authState` in sync storage
5. sidepanel refreshes auth UI from `authUpdated` runtime message and storage updates
6. Sign-out clears cached token(s), resets state, and updates all open sidepanel UIs

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

### Feedback collection links (reader + side panel)
1. User clicks **Feedback** in reader top navigation, or **Share feedback & ideas** in side panel footer
2. Browser opens `https://readeasy.featurebase.app/` in a new tab
3. No article HTML/content payload is posted by this action

### Reader Merge EPUB shortcut
1. User clicks **Merge EPUBs** in reader top navigation
2. Browser opens `https://merge-epubs.vercel.app/` in a new tab
3. No article HTML/content payload is posted by this action

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
| Reading List | `sidepanel/reading-list-*.js` + `background.js` | Up to 10 articles, images embedded as PNG data URIs |
| Save Selection | `sidepanel/reading-list-add.js` + `sidepanel/tab-detection.js` + `selection.js` + `background.js` | Sidepanel-driven highlighted-text save flow, non-intrusive replacement for old page marker |
| Floating launcher | `selection.js` + `background.js` | Draggable webpage launcher opens click-menu (reading view / side panel), position persisted across pages |
| Floater settings UI | `sidepanel.html/js/css` | 3-dot menu → Settings page → synced `ReadEasy Floater` toggle |
| Google sign-in | `sidepanel.html/js/css` + `background.js` | Optional Google auth, guest/avatar UI, sync-stored normalized auth state |
| Inline title editing | `sidepanel/reading-list-render.js` + `background.js` | Pencil icon on saved cards, inline input, Save/Cancel, persisted to metadata + IndexedDB |
| Merged EPUB | `sidepanel/epub-build.js` + `sidepanel/x4-modal.js` | Multi-chapter, image dedup, valid XHTML, EPUB 2+3 nav |
| Merge & Send to X4 | `sidepanel.html/js/css` | Modal flow, connection check, upload, response preview, optional image exclusion with guarded async regeneration |
| Feedback collection links | `reader.html` + `sidepanel.html` | Reader header **Feedback** + side panel footer **Share feedback & ideas** open Featurebase portal |
| Reader Merge EPUB shortcut | `reader.html` + `reader.js` | Reader header **Merge EPUBs** opens external merge web app |
| CDN image fix | `rules.json` | declarativeNetRequest sets Referer for Substack, Medium |
| Keyboard shortcuts | `reader.js` | F, Space, R, +/−, Esc |
| Reader edit mode | `reader.html` / `reader.js` / `reader.css` | Contenteditable title+byline+body, fixed formatting toolbar, session-only save to session storage |
| Note callout blocks | `reader.js` / `reader.css` | Yellow+blue-border callout inserted at cursor, with HR separators; EPUB-compatible via blockquote+gradient |
| Insert image (edit mode) | `reader.js` | FileReader → base64 data URL → inserted at cursor in edit mode |
| Insert link (edit mode) | `reader.js` | Link popover with saved-range restore; createLink/unlink via execCommand |
| Merge & Create PDF | `sidepanel/pdf-build.js` + `sidepanel.html/js/css` | Blob HTML opened in new tab; Chrome print dialog auto-triggered for Save as PDF |

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
| `sync` | `authState` | `{ isSignedIn, provider, profile { email, name, picture }, lastSignInAt }` |
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

### April 17, 2026 — Floating Launcher + Side Panel Settings + Auth
- Added a draggable floating launcher to regular webpages via `selection.js`
- Exposed launcher icon through manifest web-accessible resources so it renders inside page context
- Changed default launcher placement to bottom-left and increased icon size for better visibility
- Added fallback launcher label when image asset fails to load
- Added side panel 3-dot overflow menu and dedicated Settings page
- Added synced `ReadEasy Floater` setting controlling launcher visibility across open tabs
- Changed floater click behavior to two-option menu (`openReaderView` / `openSidePanel`)
- Fixed menu default-visibility regression that showed options at top-left on refresh
- Added background rebroadcast for floater setting updates across all open tabs
- Added sidepanel Google sign-in and sign-out with auth icon, profile dropdown, and normalized sync state

### April 17, 2026 — Feedback Link Surfacing (Reader + Side Panel)
- Added reader header **Feedback** CTA
- Added side panel footer **Share feedback & ideas** CTA
- Both links now route users to `https://readeasy.featurebase.app/` for feedback and feature requests

### May 17, 2026 — Reader Edit Mode + Toolbar Expansion + Sidepanel PDF

**Reader edit mode:**
- Added `#editBtn` (pastel yellow) in secondary header row; clicking enters edit mode
- `#editToolbar` (fixed bar below header): Bold, Italic, Underline, Font Color, Font Size (12–36 px), Align L/C/R, Bullet List, Numbered List, Horizontal Rule, Insert Note, Insert Image, Insert/Edit Link, Save, Cancel
- `enterEditMode()`: title + byline + body all become `contenteditable`; inline `user-select:none` / `pointer-events:none` styles stripped from extracted content; `requestAnimationFrame` + `preventScroll` ensures cursor appears even on very long articles
- `exitEditMode(save)`: Save persists `bodyEl.innerHTML` to `chrome.storage.session.currentArticle`; Cancel reverts all three regions from snapshots
- Font size applied via `fontSize('7')` marker trick → converted to inline `style.fontSize` in px (avoids HTML `size` attribute)
- `insertNoteBlock()` inserts `<hr class="note-sep">` + note div + `<hr class="note-sep">` + empty para
- `insertHorizontalRule()` inserts `<hr>` at cursor position
- `insertImageAtCursor(file)`: FileReader → base64 data URL → `execCommand('insertHTML')`
- Link popover bug fixed: `applyLink()` / `unlinkSelection()` now capture `savedLinkRange` into local `range` variable before `closeLinkPopover()` nulls the module-level variable
- URL input pre-filled with `'https://'`; bare `'https://'` is a no-op in `applyLink()`
- EPUB export updated: `.note-block` → `<blockquote>` with gradient background (Apple Books compatible); `hr.note-sep` → inline-styled; legacy notes without HR siblings get `<p>` border fallbacks
- "Donate" button renamed "Buy me coffee"; gold gradient CSS removed

**Sidepanel PDF merge:**
- New `sidepanel/pdf-build.js` module: `handleMergePDF()` + `buildMergedPrintHTML()`
- `#mergePdfBtn` (`.btn-pdf`, red `#c0392b`) added to sidepanel footer
- Clicking opens a blob HTML tab (cover page, TOC, all articles with page breaks) and auto-triggers `window.print()`
- Button enable/disable in `reading-list-render.js`; listener in `sidepanel.js`

### May 17, 2026 — Facebook Post Permalink Extraction (Priority 0)

- Added dedicated extraction path for Facebook post permalink URLs in `content.js`
- `isFacebookPostPermalink()` detects `facebook.com` URLs containing `/posts/`, `/permalink.php`, or `/photos/`
- `extractFacebookPermalink()` runs as Priority 0 in `extractArticle()`, before dialog check and Readability:
  - **Not logged in**: finds `[data-pagelet*="Permalink"]` container, prunes FB-specific noise, returns clean article
  - **Logged in**: no permalink pagelet found (post is a dialog overlay) → returns null → Priority 1 dialog check picks up the post modal
- `pruneFacebookNode()`: removes standard noise plus FB-specific pagelets (`ColumnRight`, `RightRail`, `Stories`, `Composer`, `Suggested`) and ARIA roles (`navigation`, `banner`, `complementary`)
- `removeScrambledDates()`: removes CSS-obfuscated timestamp elements — containers with ≥10 children where ≥65% are single-character text nodes
- `cleanFacebookTitle()`: strips `(N+)` notification prefix and `| Facebook` suffix from document title
- `[role="main"]` intentionally excluded from `FB_POST_PERMALINK_SELECTORS` — contains the full news feed in logged-in state

### April 17, 2026 — Reader Toolbar Merge Shortcut Restored
- Removed **Download EPUB** from the reader top navigation slot
- Restored **Merge EPUBs** in the reader top navigation
- Reader header now contains both **Merge EPUBs** and **Feedback**

---

## Next Steps / Known Gaps

- [ ] Cloud sync of actual reading list content (auth exists, list sync not implemented)
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
- April 17 latest — floater click menu (`openReaderView` / `openSidePanel`), refresh/menu visibility fix, cross-tab floater rebroadcast, sidepanel Google auth
- April 17 latest+ — reader/sidepanel Featurebase feedback CTA links added (`https://readeasy.featurebase.app/`)
- April 17 latest++ — reader toolbar restored external **Merge EPUBs** shortcut (`https://merge-epubs.vercel.app/`)
- April 18 latest — sidepanel refactored into ES modules (`sidepanel/`), shared state store added, and `sidepanel.html` switched to `type="module"` entry-point loading
- April 18 latest+ — floater toggle reliability hardened: disable force-cleans stale artifacts and re-enable reinjects `selection.js` across eligible open tabs
- May 17, 2026 — Facebook post permalink extraction (Priority 0): `isFacebookPostPermalink()` + `extractFacebookPermalink()` added to `content.js`; handles both logged-in (falls through to dialog) and not-logged-in (finds permalink pagelet) states; `pruneFacebookNode()`, `removeScrambledDates()`, `cleanFacebookTitle()` helpers added
- May 17, 2026 — Reader edit mode: `#editBtn` + `#editToolbar` added; title/byline/body all contenteditable in edit mode; full formatting toolbar (B/I/U, color, size, alignment, bullet, numbered list, HR, note, image, link); session-only save; EPUB note block export updated for Apple Books compatibility; link popover bug fixed; Donate renamed "Buy me coffee"
- May 17, 2026 — Sidepanel Merge & Create PDF: `sidepanel/pdf-build.js` added; `#mergePdfBtn` in footer; blob HTML tab opens with auto-print for Save as PDF flow

### Quick verification checklist for continuation work

- [ ] Plus-button Add-to-List works in both reader tab and regular webpage tab
- [ ] Save Selection remains available on regular `http/https` pages after Add-to-List actions
- [ ] Multiple selections from same source page save as distinct items (`#highlight-<timestamp>`)
- [ ] Merged EPUB contains both full saved articles and saved highlighted selections
- [ ] `listUpdated` + `chrome.storage.onChanged` keep sidepanel state in sync
- [ ] Sidepanel module entry-point loads without import errors
- [ ] Floating launcher appears on regular webpages by default and opens click-menu actions (reading view + side panel)
- [ ] Disabling `ReadEasy Floater` hides launcher immediately; re-enabling restores it
- [ ] Floater toggle update applies across already-open tabs without requiring page refresh
- [ ] No stale/non-clickable floater remnants remain after disable on long-lived tabs
- [ ] Re-enable restores floater on eligible tabs even if they were open for a long time
- [ ] Sign-in icon (guest/avatar) and auth dropdown behavior are correct after panel reopen
- [ ] Internal/unsupported pages (`chrome://`, extension pages) correctly hide Save Selection
- [ ] Reader and sidepanel feedback CTAs open Featurebase feedback portal
- [ ] Reader header Merge EPUBs opens the external merge web app
- [ ] Not-logged-in Facebook post permalink extracts cleanly (no repeated "Facebook" nav text, no scrambled date)
- [ ] Logged-in Facebook post permalink extracts the post dialog content, not the news feed
- [ ] FB reader view title is clean (no `(N+)` prefix, no `| Facebook` suffix)