# ReadEasy Extension — Architecture Foundation & System Map

> Last updated: June 29, 2026

> **Maintenance rules:** Update this file on every architectural change (new file roles, message actions, storage keys, components). Keep the canonical snapshot current. Append new phases to the timeline — never edit history. Both FOUNDATION and SUMMARY must be updated together and must not contradict each other.

---

## June 29, 2026 — Canonical Architecture Snapshot

1. **Core extraction path** — `background.js` injects `libs/Readability.js` + `content.js`; extracted article stored in `chrome.storage.session.currentArticle`; `reader.html` renders via `reader.js` (ES-module entry-point)

2. **Reading List is two-layered** — IndexedDB (`savedArticles`) stores full `htmlContent`; `chrome.storage.local.readingListMeta` stores lightweight metadata; background keeps them in sync on add/delete/title-update

3. **Selection save is sidepanel-driven** — old floating on-page marker was removed; `selection.js` responds to `getSelectedHTML`; sidepanel owns the Save Selection flow

4. **Side panel UX** — `#saveSelectionSection` at top; compact plus button (`#addToListBtn`) on current article card; Save Selection visibility is independent from card reset logic

5. **EPUB merge is sidepanel-central** — X4/EPUB modules load full articles from IndexedDB; image dedup via content fingerprint; X4 modal supports image-included and image-excluded modes

6. **Floating launcher** — `selection.js` renders a draggable launcher on regular webpages; click opens a two-option menu (`openReaderView` / `openSidePanel`); position persists via `floatingButtonPosition`

7. **Side panel settings** — 3-dot overflow menu → in-panel Settings page → `ReadEasy Floater` enable/disable toggle → `chrome.storage.sync.floatingButtonEnabled` (default: enabled)

8. **Google sign-in** — sidepanel header auth icon (guest/avatar); `chrome.identity.getAuthToken()`; normalized `authState` persisted in `chrome.storage.sync`; access token memory-only in service worker

9. **Feedback CTAs** — Reader header **Feedback** + sidepanel footer **Share feedback & ideas** → both open `https://readeasy.featurebase.app/`

10. **Side panel is ES-modularized** — `sidepanel.js` is thin entry-point; logic in `sidepanel/*.js` (auth, settings, tab-detection, reading-list-add, reading-list-render, epub-build, x4-modal, utils, state, pdf-build); `db.js` and `jszip.min.js` remain global preloads

11. **Floater toggle is reliability-hardened** — disable force-cleans stale DOM artifacts; re-enable injects `selection.js` across scriptable tabs; `selection.js` has idempotent init + stale-reference self-healing

12. **Reader edit mode** (May 17, 2026; extended May 25, 2026) — `#editBtn` (pastel yellow) → fixed `#editToolbar` with B/I/U, color, size, alignment, bullet, numbered list, HR, note, image, link, Save, Cancel; title/byline/body all `contenteditable`; Save always persists to `chrome.storage.session.currentArticle`; if `state.currentArticleId` is set, also persists to IndexedDB via `updateArticleContent` and syncs to Supabase; note blocks use `hr.note-sep` separators; EPUB export converts `.note-block` → `<blockquote>` with gradient for Apple Books

13. **Sidepanel Merge & Create PDF** (May 17, 2026) — `sidepanel/pdf-build.js`; `#mergePdfBtn` (red) in footer; blob HTML opened in new tab with auto `window.print()`; no PDF library

14. **Reader is ES-modularized** (May 20, 2026) — `reader.js` is ~160-line entry-point; 8 modules under `reader/`: `state.js`, `article.js`, `preferences.js`, `auth.js`, `edit-mode.js`, `tts.js`, `flash-it.js`, `epub.js`; `reader.html` loads with `type="module"`

15. **ChatGPT extractor** (May 20, 2026) — `isChatGPT()` + `extractChatGPT()` in `content.js`; Priority 0a — before all other paths; collects `[data-message-author-role]` turns; resets `position:absolute/fixed/sticky`; returns `extractionMode: 'chatgpt'`

16. **Right-click context menu** (May 20, 2026) — `chrome.contextMenus.create()` in `background.js`; "ReadEasy Reader View" on `page/selection/link` contexts; restricted to `http/https`; uses `openReaderViewForTab()` with same retry + badge-on-failure

17. **Floater ping guard** (May 20, 2026) — re-enable sends `{ action: 'ping' }` before injecting `selection.js`; `selection.js` responds `{ alive: true }` if running; no response → safe to inject; prevents duplicate launcher instances; "Hide launcher" item added to floater menu

18. **Reader auth button first-load fix** (May 25, 2026) — reader `.icon-btn` sets `display: flex` which broke `align-self: stretch` on first paint; fix: `#readerAuthBtn { position: relative }`, `.auth-guest-icon` and `.auth-avatar` use `position: absolute; inset: 0`; `onerror` handler reverts avatar to guest state on expired Google CDN URL

19. **Supabase cloud sync** (May 25, 2026; extended June 29, 2026) — `background.js` fires-and-forgets to Deno edge functions hosted on `pcyjafpopnjtjqaelycy.supabase.co`; Google access token verified server-side; djb2 `contentHash` skips redundant uploads; `supabaseSyncArticle` handles save/edit/duplicate heal, `supabaseDeleteArticle` handles delete, and `get-user-plan` returns Pro entitlement + article count; Supabase `public.articles` table + `article-content` private storage bucket; `simpleHash()` djb2 in background.js; `updateArticleContent` message action added for edit-mode persistence

20. **EPUB/HTML file upload to reader** (May 25, 2026) — `reader/upload.js` new module; `#uploadFileBtn` + hidden `#uploadFileInput` in reader header; EPUB parsed via JSZip (spine order, chapter concat, image pre-cache as base64 data URIs, `resolveZipPath` for relative hrefs); HTML parsed via DOMParser; result written to `chrome.storage.session.currentArticle` and opened in new reader tab

21. **Edit mode reading-list persistence** (May 25, 2026) — `state.currentArticleId` (new field in `reader/state.js`) is populated from `saveToReadingList` response `articleId`; `exitEditMode(save)` calls `persistEditToReadingList(articleId, titleEl, bodyEl)` which re-fetches remote images as PNG then sends `{ action: 'updateArticleContent', id, title, htmlContent }` to background; background updates IndexedDB, metadata, and Supabase

22. **Dodo Payments / ReadEasy Pro** (June 29, 2026) — Dodo checkout uses `https://checkout.dodopayments.com/buy/pdt_0NhrebkSf6BNYIxwThp3A?quantity=1`; Dodo webhook events update Supabase `public.user_entitlements`; Chrome auth Google email is matched against `google_email_lower`; free users are capped at 10 articles by oldest-first eviction; Pro users are unlimited; reader and sidepanel upgrade CTAs hide when `get-user-plan` reports Pro

---

## Chronological Timeline

| Phase | Key Commit(s) | Summary |
|-------|--------------|---------|
| A | `0375d98` | Foundation: reader, extraction, session storage, EPUB baseline |
| B | `061e3e3` | Unified image pipeline: fetch + canvas PNG, cross-origin reliability |
| C | `054e906` `13085ca` `0e4f11e` | UI labels, privacy clarifications, release prep |
| D | `85fbb49` | X4 modal workflow: upload, regeneration, image-exclusion mode |
| E | `7d8d2ba` `71054e6` | Selection marker prototype + SPA hardening |
| F | `b893cfb` | v1.0.4 metadata/privacy prep |
| G | — | Marker removed; selection save migrated to sidepanel-driven `getSelectedHTML` |
| H | `d454174` | Compact plus-button add UX; Save Selection visibility decoupled from card reset |
| I | — | Floating launcher, sidepanel Settings page, synced floater toggle |
| J | — | Google auth, floater click menu, launcher menu bug fix, cross-tab rebroadcast |
| K | — | Featurebase feedback CTAs in reader header + sidepanel footer |
| L | — | Reader toolbar: Download EPUB removed, Merge EPUBs shortcut restored |
| M | `3513076` | Sidepanel ES-module split (`sidepanel/*.js`), shared state store |
| N | `983339c` | Floater reliability: disable cleanup + re-enable injection across tabs |
| O | — | Extraction resilience: charThreshold 500→250, fallback, retry ladder `[0,350,900]`ms, dialog detection domain-gated to social platforms, CDN referrer rules for FB/Instagram |
| P | — | Facebook post permalink extraction Priority 0b: `extractFacebookPermalink()`, `pruneFacebookNode()`, `removeScrambledDates()`, `cleanFacebookTitle()` |
| Q | — | Reader edit mode: contenteditable toolbar, session-only save, note blocks with HR separators, link popover fix |
| R | — | Sidepanel Merge & Create PDF: `sidepanel/pdf-build.js`, blob HTML + auto-print |
| S | — | Reader ES-module split: `reader.js` → 8 modules under `reader/`; `autoSaveToReadingList()` added |
| T | — | ChatGPT extractor Priority 0a; right-click context menu; ping guard on re-enable; "Hide launcher" in floater menu |
| U | — | Reader auth button first-load fix: `position: absolute; inset: 0` CSS + `onerror` fallback |
| V | `3ed2334` | Supabase cloud sync (3 background helpers + 2 edge functions); EPUB/HTML file upload (`reader/upload.js`); edit-mode reading-list persistence (`updateArticleContent` message + `state.currentArticleId`) |
| W | — | Dodo Payments / ReadEasy Pro: `get-user-plan`, `user_entitlements` plan lookup, free 10-article cap enforcement, Pro upgrade links in reader and sidepanel |

---

## Current Message Contracts

**1. Sidepanel → selection content script**
- Request: `{ action: 'getSelectedHTML' }`
- Response: `{ success: true, htmlContent, pageUrl, pageTitle }` or `{ success: false, error }`

**2. Reader/Sidepanel → background**
- `{ action: 'saveToReadingList', article }` → response: `{ success, articleId }` (articleId is the new IndexedDB id; reader sets `state.currentArticleId` from this)
- `{ action: 'deleteFromList', id }` (also triggers `supabaseDeleteArticle`)
- `{ action: 'updateArticleTitle', id, title }`
- `{ action: 'updateArticleContent', id, title, htmlContent }` → background updates IndexedDB, metadata, and Supabase; broadcasts `listUpdated`
- `{ action: 'getUserPlan' }` → response: `{ success, isSignedIn, isPro, articleLimit, articleCount }`; used by reader and sidepanel to render upgrade/pro state
- `{ action: 'getCloudArticleCount' }` → legacy count response `{ count }`; internally backed by `get-user-plan`
- `{ action: 'openSidePanel' }`
- `{ action: 'openReaderView' }`
- `{ action: 'authSignIn' }` / `{ action: 'authGetState' }` / `{ action: 'authSignOut' }`

**3. Background broadcasts**
- `{ action: 'listUpdated' }`
- `{ action: 'authUpdated', authState }`
- `{ action: 'floaterSettingChanged', enabled }` (tab-targeted)
- `{ action: 'ping' }` → `selection.js` responds `{ alive: true }`; no response → safe to inject

**4. Synced floater settings contract**
- `chrome.storage.sync.floatingButtonEnabled` — missing = treat as `true`; self-heal to `true`
- Open tabs update live via `chrome.storage.onChanged` + background rebroadcast
- Disable must force-clean stale DOM artifacts; re-enable must inject `selection.js` across scriptable tabs

**5. Synced auth state contract**
- `chrome.storage.sync.authState` — shape: `{ isSignedIn, provider, profile: { email, name, picture }, lastSignInAt }`
- Signed-out state: normalized to empty profile and `lastSignInAt: null`

**6. ReadEasy Pro entitlement contract**
- Dodo checkout/payment status is never trusted from the extension client
- Supabase `dodo-webhook` maps payment/subscription events into `public.user_entitlements`
- `get-user-plan` verifies the Google token, lowercases the Google email, reads `user_entitlements.google_email_lower`, counts `articles`, and returns `{ isPro, articleLimit, articleCount }`
- Free users have `articleLimit: 10`; Pro users have `articleLimit: null`

---

## Invariants for Future Agents

1. Keep `readingListMeta` and IndexedDB (`savedArticles`) consistent on every add/delete/title-update
2. Unique URL hash suffix (`#highlight-<timestamp>`) for repeated saves from same source page
3. Do not re-introduce intrusive on-page marker UX
4. Save Selection visibility must not depend on current-article card reset
5. Floating launcher visibility governed by synced setting, not hardcoded render timing
6. Floater click behavior: menu-based (`Switch to reading view` / `Open side panel`), drag-safe, viewport-clamped
7. Launcher position persistence must be independent of enable/disable state
8. Feedback CTAs point to `https://readeasy.featurebase.app/` unless product changes it
9. Validate all flows across three tab classes: `http/https`, `reader.html`, `chrome://` / extension pages
10. Floater disable/enable must be symmetric: disable removes all stale floaters; re-enable restores without manual refresh
11. `pickActiveDialog()` must remain domain-gated — running on general pages picks up cookie/newsletter modals
12. Extraction priority: ChatGPT (0a) → FB permalink (0b) → dialog/social (1) → Readability → fallback
13. CDN referrer rules must use platform-specific referer values (e.g. `facebook.com`, `instagram.com` — not `google.com`)
14. `FB_POST_PERMALINK_SELECTORS` must never include `[role="main"]` — contains full feed in logged-in state
15. `extractFacebookPermalink()` must return `null` (not throw) when no permalink pagelet found — lets Priority 1 dialog take over
16. ChatGPT extraction Priority 0a must fire before all other paths — ChatGPT DOM has no semantic structure and produces broken Readability output
17. `[data-message-author-role]` is the stable ChatGPT DOM hook — never use obfuscated class names
18. `reader.js` is a thin entry-point — never merge module logic back into it; modules live in `reader/*.js`
19. Ping guard (`{ action: 'ping' }` before inject) must remain on the floater re-enable path
20. `#readerAuthBtn` must keep `position: relative`; `.auth-guest-icon` and `.auth-avatar` must use `position: absolute; inset: 0` — reverting to flex `align-self: stretch` breaks first-paint in Chrome extension pages
21. Edit mode `exitEditMode(save)` always updates session storage; additionally calls `persistEditToReadingList` when `state.currentArticleId != null` — do not skip this path or reading-list edits will be lost on tab close
22. Cloud sync helpers (`supabaseSyncArticle`, `supabaseDeleteArticle`, `supabaseGetUserPlan`) must never propagate errors — wrap all Supabase calls in try/catch; local save must succeed regardless of Supabase availability
23. `state.currentArticleId` is populated from `response.articleId` returned by `saveToReadingList`; if this population is removed, edit-mode persistence silently stops working
24. Free cap enforcement must exist in both places: local IndexedDB eviction in `background.js` and cloud eviction in `sync-article`; Pro users must bypass both caps
25. Pro UI visibility must come from `get-user-plan`, not from local payment assumptions

---

## Practical Verification Checklist

- [ ] Add current page via plus button works; reading list updates
- [ ] Save Selection visible on regular `http/https` pages; persists after Add-to-List
- [ ] Multiple selections from same page save as distinct entries
- [ ] Merged EPUB includes all saved articles and selections
- [ ] Sidepanel opens without import/runtime errors after ES-module migration
- [ ] Floating launcher appears on regular webpages; drag persists position
- [ ] Floater toggle hides/shows launcher immediately across all open tabs
- [ ] Disable removes stale floater artifacts from long-lived tabs; re-enable restores without refresh
- [ ] Re-enable does NOT create duplicate launchers in already-running tabs
- [ ] "Hide launcher" in floater menu disables immediately (same as Settings toggle)
- [ ] Sign-in/out state persists and sidepanel auth icon updates correctly
- [ ] Regular article pages (Medium, BBC, Wikipedia) extract correctly
- [ ] Logged-in Facebook post modal extracts via dialog path (not news feed)
- [ ] Not-logged-in Facebook post permalink extracts cleanly (no scrambled dates, no nav text, clean title)
- [ ] ChatGPT conversation extracts cleanly (turns labeled, no layout overflow, images sized)
- [ ] Right-click shows "ReadEasy Reader View" on `http/https` pages; absent on `chrome://` pages
- [ ] Toolbar shows `!` badge on extraction failure; floater shows in-page toast on failure
- [ ] Facebook/Instagram images load in reader tab (no 403 errors)
- [ ] Reader auth button shows SVG guest icon on first load in logged-out state (not broken image)
- [ ] Reader auth button falls back to guest icon when stored profile picture URL is expired
- [ ] Upload button in reader header opens file picker; EPUB parses to readable article in new tab
- [ ] Edit mode Save on a reading-list article persists to IndexedDB (edits survive tab re-open)
- [ ] Signed-in user save triggers cloud sync (check Supabase `articles` table or background console logs)
- [ ] Free signed-in user saving an 11th article evicts the oldest article locally and in Supabase
- [ ] Pro signed-in user can save more than 10 articles; reader and sidepanel upgrade buttons hide

---

> Conflicts: if older sections below conflict with this snapshot, this snapshot wins.
> **Last Updated:** May 25, 2026 (webapp sync — Supabase cloud sync, file upload, edit-mode reading-list persistence)

---

## Architecture & Data Flow

### Seven-Component Pipeline

```
User Click
    │
    ▼
[1] background.js  (service worker)
    │  injects content script; manages IndexedDB & metadata
    │  coordinates messages + auth + floater rebroadcast + context menu
    ▼
[2] content.js  (injected into active tab)
    │  Priority 0a ChatGPT → 0b FB permalink → 1 dialog → Readability → fallback
    │  URL normalisation; returns article object
    ▼
[3] selection.js  (declarative content script on webpages)
    │  responds to getSelectedHTML
    │  renders draggable floating launcher + click menu
    │  ping responder; persists position; reacts to synced setting changes
    ▼
[4] chrome.storage.session  (data bus)
    │  holds currentArticle for reader tab
    ▼
[5] reader.html / reader.js / reader/*.js / reader.css
    │  renders article; Flash It, TTS, edit mode, EPUB export
    │  "Add to List" → fetchImageAsPng → saveToReadingList
    ▼
[6] IndexedDB + chrome.storage.local  (persistent store)
    │  full HTML + base64 images in IndexedDB
    │  lightweight metadata array in chrome.storage.local
    ▼
[7] sidepanel.html / sidepanel.js / sidepanel/*.js / sidepanel.css
       reading list; Save Selection; inline title edit; Settings page
       Merge & Download EPUB; Merge & Send to X4; Merge & Create PDF
```

### Key Message Flows

**"Add to List" from reader view:**
1. `handleAddToReadingList()` collects `<img src="http…">` from `#articleBody`
2. `fetchImageAsPng(url)` — 20 s AbortController; blob → objectURL → canvas → PNG; `Promise.allSettled`
3. Raw `innerHTML` patched with `split+join` (never RegExp) to replace URLs with data URIs
4. `chrome.runtime.sendMessage({ action: 'saveToReadingList' })` → background deduplicates, checks `get-user-plan`, evicts oldest only for non-Pro users at the 10-article cap, writes to IndexedDB + metadata, broadcasts `listUpdated`

**"Add to List" from regular tab (sidepanel):**
1. `handleAddToListFromRegularTab()` injects Readability + content.js via `chrome.scripting.executeScript`
2. Same `fetchImageAsPng()` pipeline; sets `img.setAttribute('src')` in a `tempDiv`, serialises once
3. Same `saveToReadingList` message path

**Save Selection (sidepanel):**
1. Sidepanel sends `{ action: 'getSelectedHTML' }` to `selection.js`
2. Returns `{ success, htmlContent, pageUrl, pageTitle }`
3. Sidepanel creates synthetic title; URL gets `#highlight-<timestamp>` suffix for uniqueness
4. Sends through `saveToReadingList`

**Floater enable/disable:**
- Disable: background force-cleans stale DOM in scriptable tabs via fallback injection
- Re-enable: background pings each tab (`{ action: 'ping' }`) before injecting `selection.js` — skip if `{ alive: true }`
- Live sync: `chrome.storage.onChanged` + `floaterSettingChanged` broadcast keep all tabs current

**Google sign-in:**
1. Sidepanel → `authSignIn` → background → `chrome.identity.getAuthToken({ interactive: true })`
2. Fetches Google profile; writes normalized `authState` to sync; broadcasts `authUpdated`
3. Sign-out clears tokens, resets state

**Cloud sync (fire-and-forget):**
1. After `saveToReadingList` → `supabaseSyncArticle(articleId, article)` — djb2 hash sent to `sync-article` edge fn; if `no_change` skips upload; otherwise upserts metadata and uploads HTML to Supabase Storage via signed URL
2. After `deleteFromList` → `supabaseDeleteArticle(localId)` — `delete-article` edge fn removes row + storage file
3. On duplicate detection → `supabaseSyncArticle(localId, article, { autoSaveOnly: true })` — touches an existing row or heals a missing cloud row without blocking local UX
4. After edit-mode Save → `updateArticleContent` message → background updates IndexedDB then calls `supabaseSyncArticle` with new content
5. `sync-article` enforces the free cap server-side by deleting oldest Supabase articles until the signed-in non-Pro user is below 10 before inserting a new article; Pro users bypass this check via `user_entitlements`

**ReadEasy Pro lookup:**
1. Reader or sidepanel sends `{ action: 'getUserPlan' }`
2. Background gets the in-memory Google token and calls `get-user-plan`
3. `get-user-plan` verifies Google userinfo, matches lowercased email to `user_entitlements.google_email_lower`, counts cloud articles by `google_uid`, and returns plan/count data
4. Reader hides **Get ReadEasy Pro** and shows a Pro badge when Pro; sidepanel hides its Pro button and shows `Pro` in storage info

**Merge & Send to X4:**
1. Loads articles from IndexedDB; opens modal; generates EPUB blob
2. Exclude Images toggle = session-only `x4ExcludeImagesSession`; triggers async regen
3. Monotonic `x4RegenRequestId` for latest-toggle-wins; stale completions ignored
4. Uploads multipart `file` to `POST http://<device-ip>/upload` with adaptive timeout

---

## File Structure & Purpose

```
chrome-extension/
├── manifest.json            MV3 config — permissions, side_panel, host_permissions,
│                            identity/oauth2, content scripts, web-accessible resources, CSP
├── background.js            Service worker — toolbar click, IndexedDB helpers,
│                            saveToReadingList / deleteFromList / updateArticleTitle,
│                            open-sidepanel/open-reader, auth handlers, Pro plan lookup,
│                            floater rebroadcast, context menu
├── content.js               Injected content script — Readability extraction, URL normalisation,
│                            ChatGPT/FB/dialog/fallback extraction paths
├── selection.js             Declarative content script — Save Selection responder,
│                            floating launcher render/drag/menu, ping responder
├── db.js                    IndexedDB wrapper (Promise-based CRUD + title update)
│
├── reader.html              Reader view UI shell
├── reader.js                ~160 lines — thin ES-module entry-point; boots page, wires events
├── reader/
│   ├── state.js             Shared mutable state + reader constants
│   ├── article.js           Article load/sanitise/lazy-load; reading-list save; toast
│   ├── preferences.js       Theme, font size, reading width, progress bar, pref persist
│   ├── auth.js              Reader header auth UI; sign-in/out handlers; authUpdated handler
│   ├── cloud-count.js       Saved-count UI, Pro UI state, Dodo checkout/webapp open helpers
│   ├── edit-mode.js         Full edit-mode: enter/exit, formatting, links, images, notes
│   ├── tts.js               Text-to-Speech playback + sendArticleToWebapp
│   ├── flash-it.js          Flash It speed-reading engine (3 modes, word extraction, timing)
│   ├── epub.js              Single-article EPUB / HTML download / email-EPUB modal
│   └── upload.js            EPUB/HTML file upload → parse → new reader tab
├── reader.css               Theme variables, Flash It overlay, progress bar, toasts
│
├── sidepanel.html           Side panel UI — Save Selection, article card, reading list,
│                            overflow menu, Settings page, footer feedback link
├── sidepanel.js             Side panel ES-module entry-point — boot + event wiring
├── sidepanel/
│   ├── state.js             Shared mutable state + sidepanel constants
│   ├── utils.js             Shared helpers (toast, escaping, file-size, blob download)
│   ├── auth.js              Sign-in/sign-out flow, auth UI state normalization
│   ├── settings.js          Header menu/settings page/floater toggle wiring
│   ├── tab-detection.js     Active-tab classification + Save Selection visibility
│   ├── reading-list-add.js  Add-to-list/save-selection + image fetch/PNG conversion
│   ├── reading-list-render.js  List render, inline title edit/remove, storage indicator
│   ├── epub-build.js        Merged EPUB/XHTML generation + packaging helpers
│   ├── x4-modal.js          X4 modal orchestration + regen/check/send/download
│   └── pdf-build.js         PDF preview — merged HTML blob → print dialog tab
├── sidepanel.css            Side panel styles
│
├── rules.json               declarativeNetRequest — Referer header for CDN images
├── libs/
│   ├── Readability.js       Mozilla Readability (do not modify)
│   └── jszip.min.js         JSZip for EPUB generation
├── icons/                   icon16/32/48/128.png
├── _metadata/               Auto-generated by Chrome for declarativeNetRequest rules
├── readeasy-postmessage-listener.js   Helper for web apps receiving postMessage
├── supabase/
│   └── functions/
│       ├── sync-article/index.ts    Deno edge fn — verify Google token, upsert metadata, return signed upload URL, enforce free cap
│       ├── delete-article/index.ts  Deno edge fn — verify Google token, delete row + storage file
│       ├── get-user-plan/index.ts   Deno edge fn — verify Google token, return entitlement + article count
│       └── count-articles/index.ts  Legacy/count helper for signed-in cloud article counts
└── docs/WEBAPP_INTEGRATION.md       Web app integration guide (Supabase schema, auth, code examples)
```

---

## Storage Architecture

```
chrome.storage.session  (ephemeral, tab-scoped)
├── currentArticle          Extracted article payload for reader tab
└── flashItState            Flash It playback position { wordIndex, speed, mode }

chrome.storage.local  (persistent, device-local)
└── readingListMeta[]       [{ id, title, url, siteName, addedDate }]

IndexedDB — ReadEasyDB / savedArticles
└── { id, addedDate(indexed), title, url, siteName, htmlContent }
    htmlContent = full article HTML with embedded PNG data URIs

chrome.storage.sync  (persistent, synced across devices)
├── readerPreferences       { theme, fontSize, wideWidth }
├── x4Settings              { firmware, ip }
├── floatingButtonEnabled   boolean, default true when missing
├── floatingButtonPosition  persisted launcher coordinates
└── authState               { isSignedIn, provider, profile: { email, name, picture }, lastSignInAt }
```

**Two-tier reading list split:** `chrome.storage.local` holds lightweight metadata (fast UI render); IndexedDB holds full `htmlContent` (loaded only for EPUB generation). Both must be updated together on title edits. `x4ExcludeImagesSession` is intentionally in-memory only (not persisted).

---

## Critical Implementation Patterns

### Image Embedding Pipeline

Both `reader/article.js` and `sidepanel/reading-list-add.js` use `fetchImageAsPng(url)`:
1. `fetch()` with 20 s AbortController, `credentials: 'omit'` — extension context + `<all_urls>` bypasses CORS
2. blob → `objectURL` → off-screen `<img>` → `<canvas>` → `toDataURL('image/png')`
3. PNG normalises WebP/AVIF/JPEG for universal EPUB reader compatibility
4. `Promise.allSettled` — individual image failures never block the save

**URL replacement — never RegExp on base64:**
```js
htmlContent = htmlContent.split(src).join(dataUrl);
htmlContent = htmlContent.split(src.replace(/&/g, '&amp;')).join(dataUrl);
```

### Merged EPUB Generation (`sidepanel/epub-build.js`)

- **Extract data URLs from raw HTML strings** — never via `innerHTML` (DOM round-trip corrupts large base64)
- **Content-based image dedup fingerprint:**
  ```js
  const contentKey = `${mimeType}|${len}|${base64.slice(0,64)}|${base64.slice(mid,mid+64)}|${base64.slice(-64)}`;
  ```
- **`mimetype` entry must be STORE** (uncompressed — required by EPUB spec)
- `buildMergedEPUBBlob(articles, { includeImages })` — `includeImages: false` strips all images for lighter X4 payloads

EPUB structure: `mimetype` → `META-INF/container.xml` → `OEBPS/content.opf` → `OEBPS/toc.ncx` → `OEBPS/nav.xhtml` → `OEBPS/style.css` → `OEBPS/chapter_N.xhtml` → `OEBPS/images/image_N.png`

### Sidepanel Panel Behavior

- `checkCurrentTab()` classifies tabs: `chrome://` → hide current article; `reader.html` → send `getCurrentArticle`; `http/https` → show Save Selection
- `initPanel()` debounced (30 ms) to coalesce rapid `chrome.storage.onChanged` events
- Both `chrome.storage.onChanged` (primary) and `listUpdated` broadcast (backup) trigger `initPanel()`
- X4 modal: `x4RegenRequestId` (monotonic) for latest-toggle-wins; `x4ExcludeImagesSession` in-memory only
