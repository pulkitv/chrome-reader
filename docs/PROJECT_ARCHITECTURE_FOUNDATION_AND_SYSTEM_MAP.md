# ReadEasy Extension — Project Architecture & Development Guide

---

## 📋 Documentation Maintenance Rules (Read Before Editing This File)

> **This section is mandatory reading for any human or AI agent that edits this document.**
> These rules exist to ensure this file always functions as a reliable, self-contained handoff document that any new CLI agent can read to fully understand and continue work on the project.

### Purpose of This File

This file is the **primary technical reference** for the ReadEasy Chrome extension. It is intentionally written so that a new agent — with no prior conversation context — can read it alone and:
1. Understand the complete current architecture
2. Know every file, what it does, and how components interact
3. Understand all storage contracts, message contracts, and invariants
4. Know the full chronological history of implementation decisions
5. Begin implementing new features or fixing bugs without needing to re-ask basic questions

### Rules for Updating This File

1. **Update on every architectural change** — Any time a file's role changes, a new message action is added, a storage key is added/removed, or a new component is introduced, this file must be updated in the same session.

2. **Keep the canonical snapshot current** — The section titled `Current Architecture Snapshot` must always reflect what is actually implemented today, not what was planned. Remove items that were reverted or superseded.

3. **Append to the chronological timeline** — Every significant implementation session must add a new Phase entry (Phase A, B, C…) to the timeline. Never edit history — only append to it. Include the commit hash if available.

4. **Update message contracts when they change** — The `Current Message Contracts You Must Preserve` section is the source of truth for inter-component communication. Keep every `action` name, request shape, and response shape accurate.

5. **Update storage keys when they change** — The `Storage Architecture` section must list every key used across all storage types (`session`, `local`, `sync`, IndexedDB). Never leave orphaned or missing keys.

6. **Update the File Structure section** — The `File Structure & Purpose` section must describe every file in the repository, including its current role. If a file's role changes (e.g., `selection.js` was repurposed), update the description.

7. **Update invariants when new constraints are established** — The `Invariants for Future Agents` section lists behaviors that must never be regressed. Add to this list whenever a deliberate design decision is made that future agents must respect.

8. **Update the Verification Checklist** — The `Practical Verification Checklist` must include a test step for every major user-facing behavior. Keep it current so new agents can validate their work.

9. **Do not delete history** — Old phase entries, archived notes, and past bug-fix descriptions must be preserved. Agents reading this in the future need historical context to avoid re-introducing known-bad patterns.

10. **Resolve conflicts in favor of the most recent canonical snapshot** — If older sections below conflict with the latest canonical snapshot at the top, the snapshot wins. Add a note to the older section if needed rather than deleting it.

11. **Keep `Last Updated` accurate** — Update the `Last Updated` date at the top of the canonical snapshot section every time this file is edited.

12. **Both files are paired** — `PROJECT_ARCHITECTURE.md` (deep-dive) and `PROJECT_SUMMARY.md` (quick orientation) must be updated together. They serve different audiences but must not contradict each other.

---

> ## April 18, 2026 — Canonical Agent Handoff Update (Read This First)
>
> This section supersedes older historical notes below and is intended for new CLI agents (for example, Anti-Gravity-like workflows) that need a reliable chronological understanding of what has already been implemented.

### Current Architecture Snapshot (as of latest local April 18 state)

1. **Core extraction path remains unchanged**
  - `background.js` injects `libs/Readability.js` + `content.js`
  - Extracted article is stored in `chrome.storage.session.currentArticle`
  - `reader.html` renders it via `reader.js`

2. **Reading List remains two-layered**
  - **IndexedDB (`savedArticles`)** stores full `htmlContent`
  - **`chrome.storage.local.readingListMeta`** stores lightweight list metadata
  - Background worker keeps these in sync on add/delete/title-update

3. **Selection save architecture changed significantly (important)**
  - Old behavior (floating on-page marker) was removed due intrusiveness
  - New behavior: side-panel-driven save via **Save Selection** button
  - `selection.js` now handles selection-save responses and the newer webpage floater
  - Contract: sidepanel sends `getSelectedHTML`; content script returns selected fragment payload

4. **Current side panel UX model**
  - Dedicated top section: `#saveSelectionSection`
  - Current article card still exists for page context
  - Add action in card is now compact top-right plus button (`#addToListBtn`)
  - Save Selection visibility is controlled independently from current-card reset logic

5. **EPUB merge path remains central in sidepanel**
  - Sidepanel X4/EPUB modules load full articles from IndexedDB
  - Generates merged EPUB with chapter files and image dedup strategy
  - X4 modal flow still supports image-included / image-excluded generation modes

6. **Floating launcher architecture now exists on webpages**
  - `selection.js` renders a draggable floating launcher on regular websites
  - Launcher uses extension icon assets and opens a two-option menu on click:
    - **Switch to reading view** → `{ action: 'openReaderView' }`
    - **Open side panel** → `{ action: 'openSidePanel' }`
  - Launcher position persists in synced storage via `floatingButtonPosition`

7. **Side panel now includes a settings surface**
  - Header has a 3-dot overflow menu
  - Menu opens an in-panel Settings page
  - Settings currently include `ReadEasy Floater` enable/disable control
  - Control persists to `chrome.storage.sync.floatingButtonEnabled`
  - Default state is enabled when key is missing

8. **Google sign-in is implemented in side panel header**
  - Side panel header includes auth icon (guest/avatar) left of overflow menu
  - Uses `chrome.identity.getAuthToken()` and Google profile endpoint
  - Persists normalized auth state in `chrome.storage.sync.authState`
  - Access token is memory-only in service worker (not persisted)

9. **Feedback collection links are now exposed in both primary UIs**
  - Reader header includes a **Feedback** CTA alongside the restored external **Merge EPUBs** shortcut
  - Side panel footer includes **Share feedback & ideas**
  - Both route to `https://readeasy.featurebase.app/` in a new tab

10. **Side panel logic is now modularized into ES modules**
  - `sidepanel.js` is now a thin entry-point + event wiring layer
  - Business logic moved into `sidepanel/*.js` modules (`auth`, `settings`, `tab-detection`, `reading-list-*`, `epub-build`, `x4-modal`, `utils`, `state`)
  - Shared mutable state is centralized in `sidepanel/state.js`
  - `sidepanel.html` now loads sidepanel with `type="module"` while keeping `db.js` and `libs/jszip.min.js` as globals loaded first

11. **Floater toggle reliability is hardened for large tab sets**
  - Disable path now performs direct stale-artifact cleanup for orphaned/non-responsive floater DOM nodes
  - Background disable flow includes script-injection fallback cleanup for tabs where content-script listeners are stale
  - Re-enable path injects `selection.js` across scriptable open tabs so floater recovers without manual refresh
  - `selection.js` now includes idempotent initialization and stale-reference self-healing for reinjection safety

12. **Reader edit mode is implemented (May 17, 2026)**
  - `#editBtn` (pastel yellow) in the secondary header row enters edit mode
  - `#editToolbar` (fixed bar below header): B/I/U, font color, font size, alignment, bullet list, numbered list, HR, note block, image, link, Save, Cancel
  - Title, byline, and body are all made `contenteditable` simultaneously; extraction-injected blocking styles are stripped on entry
  - Save persists `#articleBody.innerHTML` to `chrome.storage.session.currentArticle` (session-only)
  - Note blocks inserted with `hr.note-sep` separators; EPUB export converts `.note-block` → `<blockquote>` with gradient background for Apple Books compatibility
  - Link popover bug fixed: range captured before `closeLinkPopover()` nulls it

13. **Sidepanel Merge & Create PDF is implemented (May 17, 2026)**
  - `sidepanel/pdf-build.js` new module; `#mergePdfBtn` (red) in sidepanel footer
  - Generates a styled HTML blob (cover, TOC, all articles), opens it in a new tab, auto-triggers `window.print()`
  - No third-party PDF library; user completes save via Chrome's print dialog "Save as PDF"

---

### Chronological Timeline (Accurate Through May 17, 2026)

#### Phase A — Foundation
- **`0375d98`**: Initial extension architecture established (reader, extraction, save paths, EPUB basis)

#### Phase B — Image handling and robustness
- **`061e3e3`**: Unified image pipeline (fetch + canvas PNG) across reader and sidepanel paths
- Improved reliability for cross-origin image embedding

#### Phase C — UI + privacy + tooling iterations
- **`054e906`**, **`13085ca`**, **`0e4f11e`**: UI labels, privacy clarifications, release prep updates

#### Phase D — X4 flow
- **`85fbb49`**: Merge & Send to X4 workflow with modal, upload logic, and regeneration flow

#### Phase E — Selection marker prototype + hardening
- **`7d8d2ba`**: Introduced floating selection marker on webpages
- **`71054e6`**: SPA compatibility hardening (marker behavior on React/SPA pages)

#### Phase F — v1.0.4 metadata and docs
- **`b893cfb`**: release metadata/privacy prep

#### Phase G — Marker removal + sidepanel Save Selection migration
- Marker UI removed from webpage
- Selection save moved to sidepanel action button
- `selection.js` repurposed to selection extraction responder (`getSelectedHTML`)

#### Phase H — UX polish and state bug fixes
- **`d454174`**: “Refine side panel save-selection UX and compact add button”
  - Add-to-list converted into compact plus button in current card
  - Save Selection made persistent at top section for regular webpage contexts
  - Follow-up fix ensured Save Selection does not disappear after Add-to-List card state reset
  - Visibility now driven by active tab type and dedicated visibility updater

#### Phase I — Floating launcher + settings controls
- Added draggable floating launcher on webpages
- Launcher default position changed to left-bottom
- Launcher icon loading fixed using web-accessible resource configuration
- Added fallback launcher label if icon fails to load
- Added sidepanel header menu with Settings entry
- Added in-panel settings page with `ReadEasy Floater` toggle
- Added live synced enable/disable behavior for launcher via `chrome.storage.onChanged`

#### Phase J — Auth + floater menu + cross-tab hardening
- Added Google sign-in/sign-out in side panel header (guest ↔ avatar state)
- Added background auth message handlers: `authSignIn`, `authGetState`, `authSignOut`
- Added shared `openReaderViewForTab(tab)` service-worker path used by toolbar and floater menu
- Floater click now opens a two-option menu (reading view / side panel)
- Fixed launcher menu initial render bug (menu appearing at top-left after page refresh)
- Added background broadcast (`floaterSettingChanged`) so floater enable/disable updates all open tabs immediately

#### Phase K — Feedback channel surfacing
- Added reader header **Feedback** CTA
- Added side panel footer **Share feedback & ideas** link
- Standardized both feedback CTAs to `https://readeasy.featurebase.app/`

#### Phase L — Reader toolbar shortcut adjustment
- Removed the reader header **Download EPUB** button from the top navigation
- Restored the external **Merge EPUBs** shortcut in the reader header
- Reader header now exposes both **Merge EPUBs** and **Feedback** actions

#### Phase M — Sidepanel modularization and ES-module migration
- **`3513076`**: Refactored monolithic sidepanel into module set under `sidepanel/`
- Added shared state store (`sidepanel/state.js`) for cross-module mutable state
- Moved EPUB generation into `sidepanel/epub-build.js` and X4 modal orchestration into `sidepanel/x4-modal.js`
- Converted sidepanel boot script to module entry-point in `sidepanel.js`
- Updated `sidepanel.html` script tag to `type="module"` while preserving global load order for `db.js` and `jszip.min.js`

#### Phase N — Floater cross-tab reliability hardening
- **`983339c`**: Fixed stale/orphaned floater artifacts when disabling across many long-lived tabs
- Added stable floater DOM IDs/data-attributes and stale-artifact cleanup in `selection.js`
- Added background disable fallback cleanup injection for tabs where listeners are dormant or stale
- Added re-enable recovery by injecting `selection.js` into scriptable open tabs
- Added selection-script idempotency guard + stale-reference self-healing to support safe reinjection

#### Phase O — Extraction resilience + social dialog support (April 22, 2026)
- Lowered global Readability `charThreshold` from 500 → 250 in `content.js`
- Added `buildFallbackArticle()`: selects highest-text-content element from `article/main/section`, prunes noise nodes, returns article when Readability yields nothing usable
- Added extraction metadata on all article objects: `extractionMode` (`'readability'|'fallback'|'dialog'`), `isFallback`, `visibleTextChars`, `isThinContent`
- Added `DIALOG_SELECTORS` constant and `pickActiveDialog()` helper: domain-gated to known social platforms, scans live DOM for `[role="dialog"]` / `[aria-modal="true"]` / `[data-pagelet*="Dialog"]` with text-length guard
- Added `buildDialogArticle(dialogEl)`: clones and prunes dialog element, makes URLs absolute, returns article with `extractionMode: 'dialog'`
- Dialog detection fires before full-document cloning in `extractArticle()` — enabling logged-in Facebook post modals, Instagram overlays, Reddit post dialogs
- Added retry extraction ladder `[0, 350, 900]` ms in `background.js` `openReaderViewForTab()` and `sidepanel/reading-list-add.js`
- Added `showActionFailureBadge()` in `background.js`: shows `!` badge on toolbar for 5 s on extraction failure
- Added `showFloatingToast()` in `selection.js`: shows in-page toast when `openReaderView` response is `{ success: false }`
- Added `rules.json` rule id 3 (`*fbcdn.net*` → referer `https://www.facebook.com/`) and id 4 (`*cdninstagram.com*` → referer `https://www.instagram.com/`)
- Removed user-visible extraction metadata notice banner from `reader.js` (was showing internal `extractionMode`/char-count to users)

#### Phase Q — Reader edit mode (May 17, 2026)
- Added `#editBtn` (pastel yellow `background-color: #fef9c3`) to reader header secondary row
- Added `#editToolbar` — fixed bar below the main header, visible only while `body.edit-mode` is active:
  - Bold, Italic, Underline (`execCommand` toggle)
  - Font Color (`<input type="color">` → `execCommand('foreColor')`)
  - Font Size (select 12–36 px; implemented via `fontSize('7')` marker + immediate `<font>` → inline `style.fontSize` conversion)
  - Align Left / Center / Right (`execCommand('justifyLeft/Center/Right')`)
  - Bullet List (`execCommand('insertUnorderedList')`)
  - Numbered List (`execCommand('insertOrderedList')`) ← new
  - Horizontal Rule (`insertHorizontalRule()` → `execCommand('insertHTML', '<hr><p><br></p>')`) ← new
  - Insert Note callout (`insertNoteBlock()`)
  - Insert Image (`insertImageAtCursor(file)` via FileReader → base64 data URL)
  - Insert / Edit Link (link popover with `savedLinkRange` restore)
  - Save and Cancel
- State variables: `isEditMode`, `preEditContent`, `preEditTitle`, `preEditByline`, `savedLinkRange`
- `enterEditMode()`: makes `#articleTitle`, `#articleByline`, `#articleBody` all `contenteditable="true"`; snapshots all three; strips `contenteditable="false"` children and `user-select:none` / `pointer-events:none` inline styles; uses `requestAnimationFrame` + `{ preventScroll: true }` for cursor placement
- `exitEditMode(save)`: on Save: writes `bodyEl.innerHTML` to `chrome.storage.session.currentArticle`; on Cancel: restores all three HTML snapshots; always calls `closeLinkPopover()`
- CSS: `#articleBody[contenteditable] * { user-select: text !important; pointer-events: auto !important; }` overrides extraction-injected blocking styles; `mousedown` → `preventDefault()` on `#editToolbar` prevents focus-steal from toolbar clicks (carve-outs for `<select>`, color `<input>`, Save/Cancel)
- `insertNoteBlock()`: inserts `<hr class="note-sep">` + `div.note-block` + `<hr class="note-sep">` + `<p><br></p>`
- EPUB transformation updated in `downloadArticleEPUB()`: `.note-block` → `<blockquote>` with `border-left: 5px solid #0066cc` + `background: linear-gradient(to right, #fffde7, #fffde7)` (gradient avoids Apple Books' `background-color` theme override); `hr.note-sep` inline-styled; adjacent HR siblings detected so redundant separators are not added for notes that already have them
- Link popover bug fixed: `applyLink()` and `unlinkSelection()` now capture `const range = savedLinkRange` before calling `closeLinkPopover()` (which nulls `savedLinkRange`); uses `range` for selection restoration
- Link URL input pre-filled with `'https://'`; bare `'https://'` is treated as a no-op in `applyLink()`
- All created links get `target="_blank"` and `rel="noopener"` applied post-`createLink`
- Keydown guard: suppresses existing Flash It and font shortcuts while `isEditMode` is true (except Escape)
- "Donate" button renamed "Buy me coffee"; entire `#donateBtn` CSS block with gold gradient removed
- Edit mode is session-only: save writes to `chrome.storage.session.currentArticle`; tab refresh restarts from original extraction

#### Phase R — Sidepanel Merge & Create PDF (May 17, 2026)
- Added `sidepanel/pdf-build.js` — new ES module exporting `handleMergePDF()`
  - Calls `getAllArticles()` to fetch all saved articles from IndexedDB
  - `buildMergedPrintHTML(articles)` generates a styled HTML document with: cover page, TOC with anchor links per article, all articles with `page-break-after: always`, note-block + hr.note-sep CSS, `@media print` rules, `<script>window.addEventListener('load', () => window.print())</script>`
  - Creates a `Blob` with `type: 'text/html;charset=utf-8'`, opens via `URL.createObjectURL` + `window.open(url, '_blank')`
  - Blob URL revoked after 90 s
- Added `#mergePdfBtn` to `sidepanel.html` footer between the EPUB and X4 buttons
- Added `.btn-pdf { background-color: #c0392b; }` to `sidepanel.css`
- Button enable/disable wired into `reading-list-render.js` (alongside `mergeEpubBtn` and `mergeSendX4Btn`)
- Import and click listener wired in `sidepanel.js`
- Button label is "Merge & Create PDF" — accurately describes the action (the user completes the save via the print dialog, not a direct download)

#### Phase P — Facebook post permalink extraction (May 17, 2026)
- Added `FB_POST_PERMALINK_SELECTORS` constant: `['[data-pagelet="PermalinkPage"]', '[data-pagelet*="Permalink"]']` — intentionally excludes `[role="main"]` (contains full feed in logged-in state)
- Added `isFacebookPostPermalink()`: detects `facebook.com` URLs with `/posts/`, `/permalink.php`, or `/photos/` in the path
- Added `extractFacebookPermalink()`: Priority 0 extraction path in `extractArticle()`, firing before dialog check and Readability
  - **Not logged in**: finds `[data-pagelet*="Permalink"]` container, applies `pruneFacebookNode()` + `removeScrambledDates()`, returns article with `extractionMode: 'fb-permalink'`
  - **Logged in**: permalink pagelet absent (post rendered as dialog overlay on feed) — returns `null` so Priority 1 (`pickActiveDialog`) handles the post modal
- Added `pruneFacebookNode(clone)`: standard noise removal plus FB-specific pagelet removal (`ColumnRight`, `RightRail`, `Stories`, `Composer`, `Suggested`) and ARIA role removal (`complementary`, `navigation`, `banner`)
- Added `removeScrambledDates(clone)`: detects and removes Facebook's CSS-scrambled timestamp containers — elements with ≥10 children where ≥65% are single-character text nodes (Facebook uses CSS `order` property to visually reorder individual character spans)
- Added `cleanFacebookTitle(rawTitle)`: strips `(N+)` notification count prefix and `| Facebook` suffix from `document.title`
- Root cause addressed: FB post permalink pages previously fell through to Readability → picked up full page including nav repeating "Facebook" and scrambled date characters

---

### Current Message Contracts You Must Preserve

1. **Sidepanel → selection content script**
  - Request: `{ action: 'getSelectedHTML' }`
  - Success response: `{ success: true, htmlContent, pageUrl, pageTitle }`
  - Failure response: `{ success: false, error }`

2. **Reader/Sidepanel → background**
  - `{ action: 'saveToReadingList', article }`
  - `{ action: 'deleteFromList', id }`
  - `{ action: 'updateArticleTitle', id, title }`
  - `{ action: 'openSidePanel' }`
  - `{ action: 'openReaderView' }`
  - `{ action: 'authSignIn' }`
  - `{ action: 'authGetState' }`
  - `{ action: 'authSignOut' }`

3. **Background broadcast**
  - `{ action: 'listUpdated' }`
  - `{ action: 'authUpdated', authState }`
  - `{ action: 'floaterSettingChanged', enabled }` (tab-targeted send from service worker)

4. **Synced floater settings contract**
  - `chrome.storage.sync.floatingButtonEnabled`
  - Missing value must be treated as `true` and self-healed to `true`
  - `selection.js` must react live to changes so open pages update immediately
  - service worker also rebroadcasts setting changes to all tabs for reliability in dormant/background tab content-script contexts
  - on disable, stale floater artifacts must be force-cleaned in scriptable tabs even if old listeners are unresponsive
  - on re-enable, service worker must ensure `selection.js` is present in scriptable open tabs so floater appears without manual tab refresh

5. **Synced auth state contract**
  - `chrome.storage.sync.authState`
  - shape: `{ isSignedIn, provider, profile: { email, name, picture }, lastSignInAt }`
  - signed-out state must be normalized to empty profile and `lastSignInAt: null`

---

### Invariants for Future Agents

1. Keep metadata (`readingListMeta`) and IndexedDB (`savedArticles`) consistent
2. Keep multi-selection save support via unique URL hash suffix (`#highlight-<timestamp>`)
3. Do not re-introduce intrusive on-page marker UX unless explicitly requested
4. Keep Save Selection visibility independent from current-article card reset
5. Keep floating launcher visibility governed by synced floater setting, not hardcoded render timing
6. Keep floater click behavior menu-based (Switch to reading view / Open side panel), drag-safe, and viewport-clamped
7. Preserve launcher position persistence independently of enabled/disabled state
8. Preserve feedback CTA destination (`https://readeasy.featurebase.app/`) unless explicitly changed by product decision
9. Validate flows across three tab classes:
  - regular `http/https`
  - `reader.html`
  - unsupported/internal pages (`chrome://`, extension pages)
10. Floater disable/enable must be symmetric across large tab sets: disable removes all interactive/stale floaters; re-enable restores on all eligible tabs without requiring manual page refresh
11. Dialog extraction (`pickActiveDialog`) must remain domain-gated — running it on general article pages will pick up cookie banners and newsletter modals as false positives
12. Extraction priority order must be preserved: FB permalink (Priority 0) → dialog/social (Priority 1) → Readability → fallback DOM extraction
13. CDN referrer rules for social platforms must use platform-specific referer values (not `google.com`) to correctly satisfy Facebook and Instagram CDN authentication
14. `FB_POST_PERMALINK_SELECTORS` must never include `[role="main"]` — in logged-in Facebook state that element contains the full news feed, causing extraction of the wrong content
15. `extractFacebookPermalink()` must return `null` (not throw) when no permalink pagelet is found — this is the correct behavior for logged-in state and allows Priority 1 dialog extraction to take over

---

### Practical Verification Checklist (Current)

- [ ] Add current page via plus button still works
- [ ] Save Selection remains available on regular pages even after Add-to-List
- [ ] Multiple sequential Save Selection operations from same page create distinct saved entries
- [ ] Merged EPUB includes those selection entries
- [ ] Sidepanel updates correctly on `listUpdated` + storage changes
- [ ] Sidepanel opens without module import/runtime errors after `type="module"` migration
- [ ] Floating launcher appears by default on regular webpages
- [ ] Floating launcher menu opens on click and offers both actions (reading view + side panel)
- [ ] Floating launcher can be dragged and preserves position
- [ ] `ReadEasy Floater` setting hides/shows launcher immediately across open pages
- [ ] Disabling floater removes stale/non-clickable artifacts from long-lived tabs (e.g., Gmail/WhatsApp)
- [ ] Re-enabling floater restores launcher across eligible open tabs without manual refresh
- [ ] Side panel auth icon supports sign-in/out and persists normalized state
- [ ] Reader header Feedback and side panel footer feedback links both open `https://readeasy.featurebase.app/`
- [ ] Regular article pages (Medium, Wikipedia, BBC) extract correctly after extraction resilience changes
- [ ] Logged-in Facebook post modal opens in reader view via toolbar click (dialog extraction path)
- [ ] Not-logged-in Facebook post permalink opens in reader view with clean content (fb-permalink extraction path)
- [ ] FB reader view title shows no notification count (`(20+)`) and no `| Facebook` suffix
- [ ] FB reader view body contains no repeated "Facebook" nav text and no scrambled date characters
- [ ] Reader view does NOT show extraction metadata banner
- [ ] Toolbar shows `!` badge when extraction fails on an unsupported page
- [ ] Floater toast appears when "Switch to reading view" fails
- [ ] Facebook/Instagram images load in reader tab without 403 errors

---

> If there is any conflict between older sections below and this April 22 update, treat this update as canonical.
> *(Previously: April 18 was canonical — superseded by April 22 above.)*

> **Purpose**: Comprehensive reference for AI coding assistants and developers. Read this file first in any new chat — it describes every component, data flow, storage scheme, and key implementation decision in the current codebase.

> **Last Updated**: May 17, 2026

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture & Data Flow](#architecture--data-flow)
3. [File Structure & Purpose](#file-structure--purpose)
4. [Storage Architecture](#storage-architecture)
5. [Key Features & Implementation Details](#key-features--implementation-details)
6. [Critical Implementation Patterns](#critical-implementation-patterns)
7. [Important Functions Reference](#important-functions-reference)
8. [Common Development Tasks](#common-development-tasks)
9. [Chronological Development History](#chronological-development-history)

---

## Project Overview

**ReadEasy** is a Chrome Manifest V3 extension that provides a distraction-free reading experience, a persistent Reading List with images, and multi-article EPUB export. It uses vanilla JavaScript with no front-end frameworks.

**Core capabilities:**
- Article extraction via Mozilla Readability.js
- Themeable reader view (light / sepia / dark) with adjustable typography
- Flash It speed reading (RSVP overlay, word-highlight, line-highlight modes)
- Text-to-Speech (TTS) playback with line-sync Flash It
- Web App Handoff — sends article HTML + CSS to an external web app via `postMessage`
- **Reading List** — save up to 10 articles (with embedded images) to IndexedDB
- **Save Selection** — sidepanel-driven selected-text capture from normal webpages
- **Floating launcher** — draggable webpage launcher with two-click actions (reading view or side panel)
- **Google sign-in** — optional side panel header auth via Chrome identity APIs
- **Side panel settings** — in-panel overflow menu with synced floater preference
- **Inline title editing** — pencil icon in side panel cards to rename saved articles
- **Merged EPUB export** — combine all saved articles into a single, image-deduplicated EPUB
- **Merge & Send to X4** — generate merged EPUB in side panel modal and upload to LAN device
- **Optional image-free X4 EPUB mode** — checkbox-triggered regeneration with live file-size update
- **Feedback collection links** — Reader + side panel CTAs route users to Featurebase feedback portal
- **Reader toolbar merge shortcut** — Reader header includes external **Merge EPUBs** shortcut (`https://merge-epubs.vercel.app/`)
- Single-article EPUB and HTML download from reader view

**Tech Stack:** Vanilla JS, Chrome Extension APIs (MV3), Mozilla Readability.js, JSZip

---

## Architecture & Data Flow

### Seven-Component Pipeline

```
User Click
    │
    ▼
[1] background.js  (service worker)
    │  injects content script
    │  manages IndexedDB & metadata
  │  coordinates messages + auth + cross-tab floater rebroadcast
    ▼
[2] content.js  (injected into active tab)
    │  Readability extraction
    │  URL normalisation
    │  returns article object
    ▼
[3] selection.js  (declarative content script on webpages)
  │  responds to getSelectedHTML
  │  renders draggable floating launcher + click menu
  │  persists launcher position / reacts to synced setting changes
  ▼
[4] chrome.storage.session  (data bus)
    │  holds currentArticle for reader tab
    ▼
[5] reader.html / reader.js / reader.css
    │  renders article
    │  Flash It, TTS, export
  │  Reader header Merge EPUBs shortcut → external merge web app
  │  Reader header Feedback CTA → Featurebase portal
    │  "Add to List" button → fetchImageAsPng → saveToReadingList message
    ▼
[6] IndexedDB + chrome.storage.local  (persistent store)
    │  full HTML with base64 images in IndexedDB
    │  lightweight metadata array in chrome.storage.local
    ▼
[7] sidepanel.html / sidepanel.js / sidepanel/*.js / sidepanel.css
    │  reading list display
  │  Save Selection + compact current-article add button
  │  inline title edit (pencil icon + in-card input)
  │  overflow menu + Settings page
    │  footer feedback CTA → Featurebase portal
    │  "Add to List" from regular tab → fetchImageAsPng → saveToReadingList
    │  Merge & Download EPUB
    │  Merge & Send to X4 modal (name/size/firmware/IP/check/upload)
```

### Message Flow: "Add to List" from Reader View

1. User clicks **Add to List** in `reader.js`
2. `handleAddToReadingList()` collects all `<img src="http…">` from `#articleBody`
3. `fetchImageAsPng(url)` fetches each image with 20 s `AbortController` timeout; converts blob → objectURL → canvas → `toDataURL('image/png')`; uses `Promise.allSettled` so one failure never blocks others
4. Raw `innerHTML` is patched using `split+join` (never `RegExp`) to replace URLs with PNG data URIs
5. `chrome.runtime.sendMessage({ action: 'saveToReadingList', article })` → background.js
6. background.js deduplicates by URL, evicts oldest if at 10-article cap, writes to IndexedDB, updates `readingListMeta` in `chrome.storage.local`, broadcasts `listUpdated`
7. Side panel picks up `chrome.storage.onChanged` or `listUpdated` message → `initPanel()`

### Message Flow: "Add to List" from Regular (non-reader) Tab (sidepanel)

1. `checkCurrentTab()` detects a normal `http/https` tab → sets `currentRegularTabId`
2. User clicks **Add to List** in sidepanel
3. `handleAddToListFromRegularTab()` runs `chrome.scripting.executeScript` injecting Readability.js + content.js into the tab
4. Returns `article.content` with absolute URLs already resolved by content.js
5. Parses HTML into a `tempDiv`, collects remote image `<img>` elements
6. Same `fetchImageAsPng()` pipeline as above
7. Sets `img.setAttribute('src', dataUrl)` directly on DOM elements, serialises once with `tempDiv.innerHTML`
8. Sends `saveToReadingList` message to background.js (same path as above)

### Message Flow: Save Selection from Regular Tab (sidepanel)

1. `checkCurrentTab()` detects a normal `http/https` tab and shows `#saveSelectionSection`
2. User highlights text on the page
3. User clicks **Save Selection** in the side panel
4. sidepanel sends `{ action: 'getSelectedHTML' }` to `selection.js` in the active tab
5. `selection.js` returns `{ success, htmlContent, pageUrl, pageTitle }`
6. sidepanel creates a synthetic article title and applies a unique `#highlight-<timestamp>` URL suffix
7. sidepanel sends the final article payload through background `saveToReadingList`

### Message Flow: Floating Launcher + Settings

1. `selection.js` loads on regular webpages and reads synced floater settings
2. If `floatingButtonEnabled !== false`, it renders a draggable launcher using `icons/icon48.png`
3. Drag end persists `floatingButtonPosition` to `chrome.storage.sync`
4. Launcher click toggles an in-page menu with:
  - **Switch to reading view** → `{ action: 'openReaderView' }`
  - **Open side panel** → `{ action: 'openSidePanel' }`
5. sidepanel Settings page updates `floatingButtonEnabled`
6. `selection.js` listens to `chrome.storage.onChanged` so already-open tabs hide/show the launcher live
7. service worker listens to sync-key changes and sends `{ action: 'floaterSettingChanged' }` to all tabs to ensure cross-tab immediate consistency
8. When disabling, service worker also runs fallback cleanup injection to remove stale/orphaned floater/menu DOM artifacts in scriptable tabs
9. When re-enabling, service worker injects `selection.js` into scriptable open tabs so floater can reappear immediately without manual refresh

### Message Flow: Sidepanel Google Sign-In

1. User clicks auth icon in side panel header
2. If signed out, sidepanel sends `{ action: 'authSignIn' }` to background service worker
3. background acquires token using `chrome.identity.getAuthToken({ interactive: true })`
4. background fetches Google profile (`email`, `name`, `picture`) and writes normalized `authState` to `chrome.storage.sync`
5. background broadcasts `{ action: 'authUpdated', authState }`; sidepanel also listens to sync-storage changes as fallback
6. On sign-out, sidepanel sends `{ action: 'authSignOut' }`; background clears cached tokens and writes normalized signed-out state

### Message Flow: "Add to List" from Reader Tab (sidepanel delegation)

1. `checkCurrentTab()` detects reader.html tab → messages it with `{ action: 'getCurrentArticle' }`
2. reader.js responds with `{ title, url, siteName }` → sidepanel shows article info
3. User clicks **Add to List** in sidepanel
4. `handleAddToListViaTab()` sends `{ action: 'addToReadingList' }` to reader tab
5. reader.js runs `handleAddToReadingList()` (same full pipeline as above)
6. Reader tab responds `{ success: true }` → sidepanel refreshes

### Message Flow: Edit Saved Article Title (sidepanel inline editor)

1. User clicks the pencil icon on a saved article card
2. sidepanel enters inline edit mode (input + Save/Cancel)
3. On Save, sidepanel sends `chrome.runtime.sendMessage({ action: 'updateArticleTitle', id, title })`
4. background.js validates and updates IndexedDB record (`savedArticles.title`)
5. background.js updates matching metadata record in `chrome.storage.local.readingListMeta`
6. background.js broadcasts `listUpdated`; sidepanel re-renders
7. Future merged EPUB exports use the edited title (loaded from IndexedDB)

### Message Flow: Merge & Send to X4 (sidepanel)

1. User clicks **Merge & Send to X4**
2. sidepanel loads all full articles from IndexedDB and opens X4 modal
3. Modal shows editable EPUB name, current size, firmware selector, IP input, connection status, and upload response preview
4. sidepanel regenerates pending blob for current modal options using `regenerateX4BlobForModal()`
5. **Exclude Images** toggle updates session-only `x4ExcludeImagesSession` and triggers another regeneration
6. Regeneration is request-ID guarded (`x4RegenRequestId`) so stale async completions cannot mutate blob/UI
7. Send/Download buttons are disabled only while latest regeneration is in-flight
8. If regeneration fails, previous valid blob is retained and user gets a non-blocking toast
9. On Send, sidepanel uploads multipart `file` to `http://<device-ip>/upload` with adaptive timeout

---

## File Structure & Purpose

```
chrome-extension/
├── manifest.json            MV3 config — permissions, side_panel, host_permissions,
│                            identity/oauth2, content scripts, web-accessible resources, CSP
├── background.js            Service worker — toolbar click handler, IndexedDB helpers,
│                            saveToReadingList / deleteFromList / updateArticleTitle handlers,
│                            open-sidepanel/open-reader handlers, auth handlers,
│                            floater setting rebroadcast, context menu
├── content.js               Injected content script — Readability extraction, URL normalisation
├── selection.js             Declarative content script — Save Selection responder,
│                            floating launcher render/drag/menu logic
├── db.js                    IndexedDB wrapper used by sidepanel modules — Promise-based CRUD,
│                            includes title update helper
│
├── reader.html              Reader view UI (214 lines)
├── reader.js                Reader view logic (~2400 lines) — article display, themes, font,
│                            Flash It engine, TTS, EPUB export, Add to List, postMessage handoff
├── reader.css               Reader view styles — theme variables, Flash It, Flash overlay,
│                            progress bar, notification toasts
│
├── sidepanel.html           Side panel UI — Save Selection section, current article card,
│                            reading list, overflow menu, Settings page, storage info,
│                            footer feedback link
├── sidepanel.js             Side panel ES-module entry-point — boot + event wiring
├── sidepanel/               Side panel modular logic (flat module folder)
│   ├── state.js             Shared mutable state + sidepanel constants
│   ├── utils.js             Shared helpers (toast, escaping, file-size, blob download)
│   ├── auth.js              Sign-in/sign-out flow, auth UI state normalization
│   ├── settings.js          Header menu/settings page/floater toggle wiring
│   ├── tab-detection.js     Active-tab classification + Save Selection visibility logic
│   ├── reading-list-add.js  Add-to-list/save-selection ingestion + image fetch/PNG conversion
│   ├── reading-list-render.js  Reading-list render, inline edit/remove, storage indicator
│   ├── epub-build.js        Merged EPUB/XHTML generation + packaging helpers
│   └── x4-modal.js          Merge orchestration + X4 modal regeneration/check/send/download
├── sidepanel.css            Side panel styles — card layout, compact add button, menu,
│                            settings page, inline editor, X4 modal, toasts, themes
│
├── rules.json               declarativeNetRequest rules — sets Referer header for CDN images
│                            (Substack, Medium). Add new rules here for blocked CDNs.
│
├── libs/
│   ├── Readability.js       Mozilla Readability library (do not modify)
│   └── jszip.min.js         JSZip for EPUB generation (~100 KB)
│
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── _metadata/
│   └── generated_indexed_rulesets/_ruleset1
│
├── readeasy-postmessage-listener.js   Helper snippet for web apps receiving postMessage
├── PROJECT_SUMMARY.md       Agent-oriented condensed project summary
├── QUICKSTART.md            Install/test quickstart
├── READING_LIST_IMPLEMENTATION.md  Reading-list specific design notes
└── privacy-policy.html      Extension privacy policy page
```

---

## Storage Architecture

```text
chrome.storage.session  (ephemeral handoff / tab-scoped)
├── currentArticle              Extracted article payload for reader tab
└── flashItState                Flash It playback position

chrome.storage.local  (persistent, device-local)
└── readingListMeta[]           Lightweight metadata array
  └── { id, title, url, siteName, addedDate }

IndexedDB — ReadEasyDB / savedArticles  (persistent, device-local)
└── savedArticles store
  ├── id (autoIncrement, keyPath)
  ├── addedDate (indexed)
  ├── title
  ├── url
  ├── siteName
  └── htmlContent             Full article HTML with embedded image data URIs

chrome.storage.sync  (persistent, synced across devices)
├── readerPreferences
│   ├── theme                   'light-theme' | 'sepia-theme' | 'dark-theme'
│   ├── fontSize                'font-small' | 'font-normal' | 'font-large' |
│   │                           'font-xlarge' | 'font-xxlarge'
│   └── wideWidth               boolean
├── x4Settings
│   ├── firmware                'crosspoint' | 'stock'
│   └── ip                      default '192.168.1.11' (editable)
├── floatingButtonEnabled       boolean, default true when missing
└── floatingButtonPosition      persisted draggable launcher coordinates
```

### Metadata vs Content Split

The reading list uses a **two-tier storage split**:
- `chrome.storage.local` holds only the lightweight metadata array (IDs, titles, URLs) — this is what the side panel reads to render the list instantly without touching IndexedDB.
- IndexedDB holds the heavy `htmlContent` (full HTML + base64 images) — only loaded when generating the EPUB.

When editing a saved title, both stores must be updated in the same action: metadata drives sidebar UI, while IndexedDB drives merged EPUB chapter titles and TOC labels.

This split means the side panel list renders fast, and IndexedDB is only opened when actually needed.

For X4 flow, only firmware/IP are persisted (`x4Settings`). The **Exclude Images** choice is intentionally session-only (`x4ExcludeImagesSession` in memory) and resets on sidepanel reload.

For the webpage launcher, floater enablement and launcher position are deliberately separate sync keys so visibility toggles do not destroy the user’s saved placement.

---


### 1. Article Extraction (`content.js`)
2. `makeUrlsAbsolute(clone, baseUrl)` — converts all `src`/`href` attributes to absolute URLs
5. Result goes into `chrome.storage.session` as `currentArticle`


### 2. Image Embedding Pipeline (shared pattern)

Both `reader.js` and `sidepanel/reading-list-add.js` use identical `fetchImageAsPng(url)` helpers.

```javascript
async function fetchImageAsPng(url) {
  // 1. fetch() with 20s AbortController timeout, credentials: 'omit'
  //    Extension context + <all_urls> bypasses CORS entirely
  const timer = setTimeout(() => controller.abort(), 20000);
  // 2. Get blob, create objectURL

  // 3. Load into off-screen <img>, draw to <canvas>, export as PNG
  //    PNG normalisation ensures maximum EPUB reader compatibility
  const dataUrl = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = objectUrl;
**Why normalise to PNG?**
EPUB readers have inconsistent support for JPEG, WebP, AVIF. PNG is universally supported. The canvas step normalises whatever format the CDN serves (WebP, AVIF, JPEG) into a PNG.
**URL replacement — never use RegExp on base64:**
Base64 strings contain `+`, `/`, `=`, which are RegExp special characters. The safe replacement pattern is:
htmlContent = htmlContent.split(src).join(dataUrl);
htmlContent = htmlContent.split(src.replace(/&/g, '&amp;')).join(dataUrl);
```
### 3. Reading List — background.js

`saveToReadingList` handler:
2. **Capacity enforcement**: if count ≥ 10, deletes the oldest article from both IndexedDB and metadata before inserting
3. Writes article to IndexedDB via `addArticle()`, updates `readingListMeta` in `chrome.storage.local`, broadcasts `listUpdated` message

`deleteFromList` handler:
2. Filters metadata array, saves back to `chrome.storage.local`
3. Broadcasts `listUpdated`

1. Validates `id` and non-empty trimmed title
2. Updates IndexedDB record by id (`savedArticles.title`)
4. Broadcasts `listUpdated`


`checkCurrentTab()` runs on every tab activation and update. It classifies the active tab into three cases:
- **Case 1 — chrome:// / non-reader extension page**: hide "Current Article" section
- **Case 2 — reader.html tab**: send `{ action: 'getCurrentArticle' }` message; reader.js responds with `{ title, url, siteName }`

`initPanel()` is debounced (30 ms) so rapid `chrome.storage.onChanged` events (e.g. during batch operations) coalesce into a single re-render.

Both `chrome.storage.onChanged` (primary) and `listUpdated` message (backup) trigger `initPanel()`.
Saved article cards support inline title editing with a top-right pencil icon. Edit mode is card-local and supports keyboard shortcuts:
- `Enter` = Save
- `Escape` = Cancel

X4 modal state in sidepanel includes:
- `pendingX4Articles` and `pendingX4Blob` for current modal session
- `x4RegenRequestId` and `x4LatestSettledRequestId` for latest-toggle-wins semantics
- `x4RegenInFlight` to gate Send/Download buttons only during active regeneration

### 5. Merged EPUB Generation (`sidepanel/epub-build.js` — `buildMergedEPUBBlob`)

**Key design decisions:**

**a) Extract data URLs directly from raw HTML strings — never via DOM:**
Parsing HTML through `innerHTML` and re-serialising can corrupt large base64 values (browsers may URL-resolve `src` attributes, or the serialiser may introduce line breaks). The EPUB generator uses a regex only to *extract* the data URLs from the raw string, then replaces with `split+join`.

**b) Content-based image deduplication:**
The same image may appear in multiple articles. Simple URL equality fails here because the URL was already replaced with a data URI. Instead, a fingerprint is computed:
```javascript
const contentKey = `${mimeType}|${len}|${base64.slice(0,64)}|${base64.slice(mid,mid+64)}|${base64.slice(-64)}`;
```
This samples start, middle, and end of the base64 — robust against images that share CDN-identical headers (which would fool a start-only fingerprint).
**c) Base64 whitespace stripping:**
```
mimetype                    (STORE, uncompressed — required by EPUB spec)
META-INF/container.xml
OEBPS/content.opf           Package manifest + spine
OEBPS/toc.ncx               EPUB 2 navigation (for legacy readers)
OEBPS/nav.xhtml             EPUB 3 navigation
OEBPS/style.css
OEBPS/chapter_N.xhtml       One per saved article
OEBPS/images/image_N.png    Deduplicated embedded images
```

`buildMergedEPUBBlob(articles, { includeImages })` supports two modes:
- `includeImages: true` (default): existing dedup + embedded image behavior
- `includeImages: false`: strips `<picture>` / `<img>` from chapter HTML and omits image manifest/files for smaller X4 transfer payloads

### 6. Single-Article EPUB (`reader.js` — `downloadArticleEPUB`)

The reader's own EPUB export uses a slightly different approach: it waits for DOM images to finish loading (`img.complete && naturalWidth > 0`), then draws each to a canvas and embeds as PNG. This is different from the Reading List path because the images are already loaded in the DOM (no extra fetch needed). URL replacement uses `RegExp` with escaped special characters (safe here since the source URL is a `http(s)://` URL, not base64).

### 7. Flash It Speed Reading (`reader.js`)

**Three display modes:**
- `overlay` — RSVP-style fullscreen overlay, words shown at 2× font size with surrounding context
- `inline-word` — highlights current word in article body with auto-scroll (scrolls only if word is off-screen)
- `inline-line` — highlights entire line; also used during TTS playback for line-sync

**Timing algorithm:**

---

## Canonical Scope Note

Duplicate legacy sections were removed on March 28, 2026 to keep this file a single-source architecture reference for new context windows.
  siteName,
  sourceUrl,
  html,
  cssText
}
```

### 5. EPUB Generation

**Location**: `reader.js` lines 1200-1500

**Process**:
1. Pre-load all images (bypass CORS):
   ```javascript
   // Convert images to canvas → data URLs
   const canvas = document.createElement('canvas');
   const ctx = canvas.getContext('2d');
   ctx.drawImage(img, 0, 0);
   const dataUrl = canvas.toDataURL('image/png');
   ```

2. Create EPUB structure using JSZip:
   ```
   EPUB/
   ├── mimetype
   ├── META-INF/container.xml
   ├── OEBPS/
   │   ├── content.opf (metadata)
   │   ├── toc.ncx (table of contents)
   │   ├── chapter1.xhtml (article content)
   │   └── images/ (embedded images)
   ```

3. Replace image URLs in HTML:
   - Handle both `&` and `&amp;` encoded URLs
   - Update src to relative path: `images/image_N.png`

4. Generate and download EPUB file

**Critical Fix** (January 2026):
- Images from X/Twitter had HTML-encoded URLs (`&amp;`)
- JavaScript `img.src` returns decoded version (`&`)
- Solution: Replace both versions in HTML:
  ```javascript
  htmlContent = htmlContent.replace(new RegExp(originalSrc, 'g'), newSrc);
  htmlContent = htmlContent.replace(new RegExp(originalSrc.replace(/&/g, '&amp;'), 'g'), newSrc);
  ```

### 4. Theme System

**Location**: `reader.css` lines 1-100

**Implementation**: CSS custom properties

```css
/* Light theme */
body.light-theme {
  --bg-color: #ffffff;
  --text-color: #333333;
  --border-color: #e0e0e0;
  --header-bg: #f8f8f8;
}

/* Sepia theme */
body.sepia-theme {
  --bg-color: #f4ecd8;
  --text-color: #5c4a3a;
  --border-color: #d4c4a8;
  --header-bg: #ece2d0;
}

/* Dark theme */
body.dark-theme {
  --bg-color: #1a1a1a;
  --text-color: #e0e0e0;
  --border-color: #404040;
  --header-bg: #2d2d2d;
}
```

**Switching**: `setTheme(themeName)` function changes body class

### 5. Email EPUB

**Location**: `reader.js` lines 1600-1700

**Process**:
1. Generate EPUB in memory
2. Convert to base64
3. Open modal for email input
4. Create `mailto:` link with EPUB as attachment
5. Open in default email client

**Limitations**: 
- Size limit ~10MB (email client dependent)
- Some clients may not support attachments via mailto

---

## Development Patterns

### 1. Event Listener Setup

All event listeners initialized in `setupEventListeners()` function:

```javascript
function setupEventListeners() {
  // Simple click handlers
  document.getElementById('closeBtn').addEventListener('click', () => {
    window.close();
  });

  // Loops for multiple similar elements
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setTheme(btn.dataset.theme);
    });
  });

  // Complex features call separate functions
  document.getElementById('flashBtn').addEventListener('click', () => {
    if (!isFlashing) startFlashIt();
    else if (isPaused) resumeFlashIt();
    else pauseFlashIt();
  });
}
```

### 2. Preference Persistence

Pattern used throughout:
```javascript
function savePreferences() {
  chrome.storage.sync.set({
    theme: currentTheme,
    fontSize: currentFontSize,
    isWideWidth: isWideWidth
  });
}

function loadPreferences() {
  chrome.storage.sync.get(['theme', 'fontSize', 'isWideWidth'], (data) => {
    if (data.theme) setTheme(data.theme);
    if (data.fontSize) setFontSize(data.fontSize);
    if (data.isWideWidth !== undefined) { /* apply */ }
  });
}
```

### 3. HTML Sanitization

Always sanitize Readability output before display:
```javascript
function sanitizeHTML(html) {
  // Remove script tags
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers
  html = html.replace(/on\w+="[^"]*"/g, '');
  html = html.replace(/on\w+='[^']*'/g, '');
  
  // Convert iframes to links
  html = html.replace(/<iframe[^>]*src="([^"]*)"[^>]*>/gi, 
    '<a href="$1" target="_blank">View embedded content</a>');
  
  return html;
}
```

### 4. URL Conversion

Critical for image loading:
```javascript
// Convert relative to absolute
const absoluteUrl = new URL(relativeUrl, document.location.href).href;

// Fix Substack CDN
if (src.includes('substackcdn.com')) {
  src = src.replace(/,w_\d+,c_limit,/, ',');
}
```

### 5. Declarative Net Request

For CDN images that require referrer (e.g., Substack, Medium):

**rules.json**:
```json
{
  "id": 1,
  "priority": 1,
  "action": {
    "type": "modifyHeaders",
    "requestHeaders": [
      {
        "header": "referer",
        "operation": "set",
        "value": "https://www.google.com/"
      }
    ]
  },
  "condition": {
    "urlFilter": "*substackcdn.com*",
    "resourceTypes": ["image"]
  }
}
```

---

## Important Functions Reference

### Reader Initialization (`reader.js`)

| Function | Line | Purpose |
|----------|------|---------|
| `DOMContentLoaded` listener | 28 | Entry point, loads article and preferences |
| `loadArticle()` | 100 | Retrieves article from session storage |
| `displayArticle()` | 150 | Renders article HTML and metadata |
| `setupEventListeners()` | 180 | Binds all UI controls |
| `loadPreferences()` | 400 | Loads user settings from sync storage |
