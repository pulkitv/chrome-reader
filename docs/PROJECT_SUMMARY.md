# ReadEasy Chrome Extension — Project Summary

> Last updated: May 25, 2026

> **Maintenance rules:** Update `What exists right now` and `Chronological progression` after every feature. Keep `Operational contracts` and `Invariants` accurate when they change. Both SUMMARY and FOUNDATION must be updated together and must not contradict each other.

---

## May 25, 2026 — Canonical Executive Summary

### What exists right now

1. **Reader pipeline is stable** — toolbar click → background extraction → session storage → reader render
2. **Reading list is two-layered** — `readingListMeta` in local storage for fast UI; full article HTML in IndexedDB for export
3. **Selection save is sidepanel-driven** — old floating on-page marker removed; `selection.js` responds to `getSelectedHTML`; sidepanel owns Save Selection
4. **Current article add flow** — compact plus button on top-right of current article card (same semantics as old Add-to-List)
5. **Save Selection visibility decoupled** — controlled independently from current-article card reset lifecycle
6. **Floating launcher on webpages** — draggable launcher via `selection.js`; click menu: Switch to reading view / Open side panel; position persisted
7. **Side panel settings menu** — 3-dot overflow → Settings page → `ReadEasy Floater` toggle (default: enabled)
8. **Google sign-in** — sidepanel header guest/avatar auth; `chrome.identity.getAuthToken()`; auth state in `chrome.storage.sync.authState`
9. **Feedback CTAs** — reader header **Feedback** + sidepanel footer **Share feedback & ideas** → `https://readeasy.featurebase.app/`
10. **Reader toolbar Merge EPUBs** — reader header shortcut opens `https://merge-epubs.vercel.app/`
11. **Side panel is ES-modularized** — `sidepanel.js` thin entry-point; logic in `sidepanel/*.js` modules; shared state in `sidepanel/state.js`
12. **Floater toggle is reliability-hardened** — disable force-cleans stale artifacts; re-enable injects `selection.js` across eligible open tabs without manual refresh
13. **Extraction resilience** — Readability `charThreshold` 500→250; fallback to highest-text-content DOM element; retry ladder `[0, 350, 900]` ms; `!` badge on failure; floater toast on failure
14. **Social dialog extraction** — domain-gated `pickActiveDialog()` for Facebook, Instagram, Reddit, Twitter/X, LinkedIn post overlays before full-document extraction
15. **CDN referrer rules** — `rules.json` rules for `fbcdn.net` (referer: `facebook.com`) and `cdninstagram.com` (referer: `instagram.com`)
16. **Facebook post permalink extraction** (Priority 0b) — `extractFacebookPermalink()` + `pruneFacebookNode()` + `removeScrambledDates()` + `cleanFacebookTitle()`; not-logged-in finds `[data-pagelet*="Permalink"]`; logged-in returns null → Priority 1 dialog handles post modal; `[role="main"]` intentionally excluded
17. **Reader edit mode** — `#editBtn` (pastel yellow) → `#editToolbar` (B/I/U, color, size, alignment, bullet, numbered list, HR, note, image, link, Save, Cancel); title/byline/body all `contenteditable`; Save always updates session storage; if article is in the reading list (`state.currentArticleId` set), also persists to IndexedDB via `updateArticleContent`; note blocks with `hr.note-sep` separators; EPUB converts `.note-block` → `<blockquote>` with gradient for Apple Books
18. **Sidepanel Merge & Create PDF** — `sidepanel/pdf-build.js`; red `#mergePdfBtn` in footer; blob HTML in new tab with auto `window.print()`; user completes save via Chrome print dialog
19. **Reader is ES-modularized** — `reader.js` ~160-line entry-point; 8 modules: `reader/state.js`, `reader/article.js`, `reader/preferences.js`, `reader/auth.js`, `reader/edit-mode.js`, `reader/tts.js`, `reader/flash-it.js`, `reader/epub.js`; `reader.html` loads with `type="module"`
20. **ChatGPT conversation extractor** (Priority 0a) — `extractChatGPT()` collects `[data-message-author-role]` turns; strips UI chrome; resets absolute positioning; normalises images/code blocks; wraps turns as `<section class="chat-turn chat-turn--user/assistant">`
21. **Right-click context menu** — "ReadEasy Reader View" on `page/selection/link` contexts; `http/https` only; uses `openReaderViewForTab()` with same retry + failure badge; `contextMenus` permission in manifest
22. **Floater ping guard** — re-enable pings each tab (`{ action: 'ping' }`) before injecting `selection.js`; `{ alive: true }` response → skip injection; prevents duplicate launcher instances
23. **"Hide launcher" in floater menu** — floater click menu has divider + "Hide launcher"; sets `floatingButtonEnabled = false` same as Settings toggle
24. **Reader auth button first-load fix** — `#readerAuthBtn { position: relative }`; `.auth-guest-icon` and `.auth-avatar` use `position: absolute; inset: 0`; `onerror` handler falls back to guest state on expired Google profile picture URL
25. **Supabase cloud sync** — `background.js` fire-and-forgets to `supabase.co` edge functions on every article save, delete, and content edit; Google access token verified server-side; djb2 `contentHash` deduplicates uploads; non-fatal — Supabase failures never block the local save flow
26. **EPUB/HTML file upload to reader** — `#uploadFileBtn` in reader header opens file picker; `reader/upload.js` parses EPUB (spine + chapters + embedded images) or raw HTML; result opens in a new reader tab via `chrome.storage.session.currentArticle`
27. **Edit mode persists to reading list** — `exitEditMode(save)` now calls `persistEditToReadingList()` if `state.currentArticleId` is set; re-fetches remote images as PNG, then sends `updateArticleContent` to background which updates IndexedDB + metadata + syncs to Supabase

---

### Chronological progression

| Date | What changed |
|------|-------------|
| Jan 2026 | Foundation: reader pipeline, Readability extraction, themes, Flash It, EPUB, TTS, Web App Handoff |
| Feb 2026 | Image pipeline unified: `fetch` + canvas PNG; merged EPUB improvements |
| Mar 2026 | Inline title editing; Merge & Send to X4 modal + Exclude Images toggle + concurrency guard |
| Apr 17, 2026 | Floating launcher + sidepanel Settings + Google auth + floater click menu + cross-tab rebroadcast + Featurebase feedback CTAs + Merge EPUBs toolbar shortcut |
| Apr 18, 2026 | Sidepanel ES-module split (`sidepanel/*.js`); floater reliability hardened (disable cleanup + re-enable injection) |
| Apr 22, 2026 | Extraction resilience: charThreshold, fallback, retry ladder, dialog detection, CDN referrer rules for FB/Instagram |
| May 17, 2026 | FB post permalink extraction (Priority 0b); Reader edit mode; Sidepanel Merge & Create PDF |
| May 20, 2026 | Reader ES-module split (`reader/*.js`); ChatGPT extractor (Priority 0a); right-click context menu; ping guard; "Hide launcher" |
| May 25, 2026 | Reader auth button first-load fix (position CSS + onerror fallback); Supabase cloud sync (background fire-and-forget on save/delete/edit); EPUB/HTML file upload to reader (`reader/upload.js`); edit mode now persists to reading list via `updateArticleContent` |

---

### Current operational contracts

1. **Save Selection** — sidepanel → `getSelectedHTML` → `selection.js` → sidepanel save pipeline → background `saveToReadingList`
2. **Selection uniqueness** — URL gets `#highlight-<timestamp>` suffix to avoid dedup collision for repeated saves from same page
3. **List update signaling** — background emits `listUpdated`; sidepanel also listens to `chrome.storage.onChanged`
4. **Floater control** — `selection.js` reads synced `floatingButtonEnabled`; open tabs update live via `onChanged` + `floaterSettingChanged` rebroadcast; disable force-cleans artifacts; re-enable ping-guards before injecting `selection.js`
5. **Auth flow** — sidepanel sends `authSignIn/authGetState/authSignOut`; background manages token + profile + normalized `authState`; updates via `authUpdated` message + sync storage
6. **Feedback links** — static anchors to `https://readeasy.featurebase.app/`; no article payload sent
7. **Reader Merge EPUBs** — static link to `https://merge-epubs.vercel.app/`; no payload sent
8. **Ping contract** — background sends `{ action: 'ping' }` before injecting `selection.js` on re-enable; `{ alive: true }` response → skip; no response → inject
9. **Cloud sync contract** — `supabaseSyncArticle(localId, article)` is called after every successful `saveToReadingList` and `updateArticleContent`; `supabaseDeleteArticle(localId)` is called after every `deleteFromList`; `supabaseTouchArticle(url)` is called on duplicate detection; all three are fire-and-forget and never propagate errors

---

### Invariants — the next agent must not violate these

1. Keep `readingListMeta` and IndexedDB consistent on every add/delete/title-update
2. Unique `#highlight-<timestamp>` URL suffix for repeated selection saves
3. No intrusive on-page marker UX
4. Save Selection visibility independent from current-article card reset
5. Floater visibility governed by synced setting, not hardcoded timing
6. Floater click = menu-based (reading view + side panel), drag-safe, viewport-clamped
7. Launcher position persistence independent of enable/disable state
8. Feedback CTAs point to Featurebase portal
9. All flows validated across: `http/https`, `reader.html`, `chrome://` / extension pages
10. Floater toggle symmetric: disable clears all stale floaters; re-enable restores without manual refresh
11. `pickActiveDialog()` must remain domain-gated — general article pages have cookie/newsletter modals as false positives
12. `buildFallbackArticle()` is last-resort; dialog and Readability take priority
13. CDN referrer rules use platform-specific referer (not `google.com`) for social CDNs
14. FB permalink extraction fires before dialog check but returns null when logged in → Priority 1 dialog handles post modal
15. Never include `[role="main"]` in `FB_POST_PERMALINK_SELECTORS` — it contains the full news feed when logged in
16. Reader edit mode always updates `chrome.storage.session.currentArticle`; if `state.currentArticleId != null` (article is in the reading list), edits also persist to IndexedDB via `updateArticleContent` and sync to Supabase
17. Do NOT re-sanitize on edit mode Save — strips user's deliberate edits (images, links, note blocks)
18. Note blocks must always use `hr.note-sep` above and below — EPUB export checks for these siblings
19. `document.execCommand()` is the only viable formatting API in Chrome extension context; deprecated by spec but functional
20. PDF merge button opens blob HTML tab + auto-print — user saves via Chrome's print dialog, not a direct download
21. ChatGPT extraction Priority 0a must fire before all other paths — preserves correct turn structure
22. `[data-message-author-role]` is the stable ChatGPT hook — never use obfuscated class names
23. `reader.js` is a thin entry-point only — feature logic stays in `reader/*.js` modules
24. Ping guard must remain on the floater re-enable path — unconditional injection causes duplicate launchers
25. `#readerAuthBtn` needs `position: relative`; `.auth-guest-icon` and `.auth-avatar` need `position: absolute; inset: 0` — flex `align-self: stretch` breaks first-paint in Chrome extension pages
26. Cloud sync helpers must never throw — wrap in try/catch and log warnings only; local save must succeed regardless of Supabase availability
27. `state.currentArticleId` must be set from `saveToReadingList` response (`response.articleId`) — without it `persistEditToReadingList` is silently skipped

---

### Fast handoff checklist

- [ ] Add-to-List (plus button) works from reader tab and regular webpage tab
- [ ] Save Selection visible on regular `http/https` pages after Add-to-List actions
- [ ] Multiple selections from same source page save as distinct items (`#highlight-<timestamp>`)
- [ ] Merged EPUB contains both full articles and saved selections
- [ ] Sidepanel opens without import/runtime errors
- [ ] Floating launcher appears on regular webpages; click opens two-option menu
- [ ] Floater toggle hides/shows launcher immediately across open tabs
- [ ] Disable clears stale floater remnants; re-enable restores without needing page refresh
- [ ] Re-enable does NOT create duplicate launchers in already-open tabs
- [ ] "Hide launcher" in floater menu disables immediately
- [ ] Auth sign-in/out persists; header icon updates; profile avatar shows after sign-in
- [ ] Reader header Feedback and Merge EPUBs links open correct external URLs
- [ ] Not-logged-in Facebook post permalink extracts cleanly (no scrambled dates, no nav text, clean title)
- [ ] Logged-in Facebook post permalink extracts post content (not news feed) via dialog path
- [ ] ChatGPT page extracts cleanly in reader view (turns labeled, no layout overflow)
- [ ] Right-click shows "ReadEasy Reader View" on webpages; absent on `chrome://` pages
- [ ] Edit button visible and pastel yellow; entering edit mode shows toolbar + blue focus rings
- [ ] Bold/Italic/Underline toggle; font size applies inline px; note block inserted with HR separators
- [ ] Save button persists edits; Cancel reverts all three regions (title, byline, body)
- [ ] "Merge & Create PDF" button visible (red); opens blob tab with print dialog auto-triggered
- [ ] Reader auth button shows SVG guest icon on FIRST load (not broken image); falls back on expired URL
- [ ] Upload button in reader header opens file picker; EPUB parses chapters + images; opens in new reader tab
- [ ] Edit mode Save on a reading-list article persists changes to IndexedDB (not just session storage)
- [ ] Cloud sync: signed-in user saves an article → Supabase row created (check Supabase dashboard or logs)

---

## File Map

```
chrome-extension/
├── manifest.json           MV3 config — permissions, side_panel, DNR, identity/oauth2
├── background.js           Service worker — extraction, CRUD, auth, floater rebroadcast, context menu
├── content.js              Content script — ChatGPT/FB/dialog/Readability/fallback extraction
├── selection.js            Content script — Save Selection, floating launcher, ping responder
├── db.js                   IndexedDB wrapper (Promise-based)
│
├── reader.html / reader.js / reader.css
├── reader/
│   ├── state.js            Shared mutable state + constants
│   ├── article.js          Article load/sanitise/lazy-load/save/toast
│   ├── preferences.js      Theme, font size, width, progress bar
│   ├── auth.js             Reader auth UI + handlers + authUpdated
│   ├── edit-mode.js        Full edit-mode (enter/exit/formatting/links/images/notes)
│   ├── tts.js              TTS playback + sendArticleToWebapp
│   ├── flash-it.js         Flash It speed-reading engine (3 modes)
│   ├── epub.js             Single-article EPUB / HTML download / email-EPUB
│   └── upload.js           EPUB/HTML file upload → parse → new reader tab
│
├── sidepanel.html / sidepanel.js / sidepanel.css
├── sidepanel/
│   ├── state.js            Shared mutable state + constants
│   ├── utils.js            Helpers (toast/escape/filesize/download)
│   ├── auth.js             Google auth state + UI actions
│   ├── settings.js         Header menu/settings/floater toggle
│   ├── tab-detection.js    Tab type detection + Save Selection visibility
│   ├── reading-list-add.js Add from reader/regular/selection pipeline
│   ├── reading-list-render.js  List render, inline title edit/remove, storage info
│   ├── epub-build.js       Merged EPUB generation
│   ├── x4-modal.js         X4 modal/check/send/download
│   └── pdf-build.js        PDF preview — merged HTML blob → print dialog tab
│
├── rules.json              declarativeNetRequest — CDN Referer header rules
├── libs/Readability.js     Mozilla Readability (do not modify)
├── libs/jszip.min.js       JSZip for EPUB (~100 KB)
├── icons/                  icon16/32/48/128.png
├── supabase/
│   └── functions/
│       ├── sync-article/index.ts    Deno edge fn — upsert article metadata + signed upload URL
│       └── delete-article/index.ts  Deno edge fn — delete article from DB + storage
└── docs/WEBAPP_INTEGRATION.md       Web app integration guide for Supabase cloud sync
```

---

## Storage Keys Reference

| Storage | Key | Content |
|---------|-----|---------|
| `session` | `currentArticle` | Article object: reader tab data bus |
| `session` | `flashItState` | `{ wordIndex, speed, mode }` — playback position |
| `local` | `readingListMeta` | `[{ id, title, url, siteName, addedDate }]` |
| `sync` | `readerPreferences` | `{ theme, fontSize, wideWidth }` |
| `sync` | `x4Settings` | `{ firmware, ip }` |
| `sync` | `floatingButtonEnabled` | boolean, default `true` when missing |
| `sync` | `floatingButtonPosition` | Persisted launcher coordinates |
| `sync` | `authState` | `{ isSignedIn, provider, profile: { email, name, picture }, lastSignInAt }` |
| IndexedDB | `savedArticles` | `{ id, title, url, siteName, addedDate, htmlContent }` |

---

## Critical Gotchas

1. **Never RegExp on base64** — use `str.split(literal).join(replacement)`; base64 contains `+`, `/`, `=`
2. **Always replace both `&` and `&amp;`** when patching image URLs in HTML strings
3. **`fetch()` from extension context bypasses CORS** — `<all_urls>` required; never inject image-fetch into the page
4. **Canvas taint** — fetch blob first → `objectURL` → `<img>` → canvas draw (objectURL is same-origin)
5. **PNG normalisation** — `fetchImageAsPng()` always outputs PNG regardless of source format
6. **IndexedDB is per-context** — background.js has its own helpers; sidepanel uses `db.js`; same database
7. **Session storage is tab-scoped** — cleared when tab closes; never rely on it surviving a refresh
8. **Debounce `initPanel()`** — `storage.onChanged` can fire rapidly; 30 ms debounce prevents duplicate renders
9. **EPUB `mimetype` must be STORE** — `{ compression: 'STORE' }` required by EPUB spec
10. **`chrome://` pages** — extension cannot inject scripts; always guard with `tab.url.startsWith('chrome://')`
11. **Title edits must update both stores** — `readingListMeta` (UI) and IndexedDB `savedArticles` (EPUB source)
12. **X4 Exclude Images is session-only** — `x4ExcludeImagesSession` in-memory; intentionally not persisted
13. **X4 regen is race-guarded** — post-`await` UI/blob updates must check `x4RegenRequestId` for staleness
14. **Cloud sync dedup uses djb2 hash** — `simpleHash()` in `background.js`; not crypto-secure; used only as a change-detection signal to skip redundant Supabase Storage uploads
15. **`saveToReadingList` now returns `articleId`** — background always sends `{ success, articleId }` in response; reader modules capture this into `state.currentArticleId` to enable edit-mode persistence
