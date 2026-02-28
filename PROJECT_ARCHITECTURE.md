# ReadEasy Extension — Project Architecture & Development Guide

> **Purpose**: Comprehensive reference for AI coding assistants and developers. Read this file first in any new chat — it describes every component, data flow, storage scheme, and key implementation decision in the current codebase.

> **Last Updated**: February 28, 2026

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
- **Merged EPUB export** — combine all saved articles into a single, image-deduplicated EPUB
- Single-article EPUB and HTML download from reader view

**Tech Stack:** Vanilla JS, Chrome Extension APIs (MV3), Mozilla Readability.js, JSZip

---

## Architecture & Data Flow

### Six-Component Pipeline

```
User Click
    │
    ▼
[1] background.js  (service worker)
    │  injects content script
    │  manages IndexedDB & metadata
    │  coordinates messages
    ▼
[2] content.js  (injected into active tab)
    │  Readability extraction
    │  URL normalisation
    │  returns article object
    ▼
[3] chrome.storage.session  (data bus)
    │  holds currentArticle for reader tab
    ▼
[4] reader.html / reader.js / reader.css
    │  renders article
    │  Flash It, TTS, export
    │  "Add to List" button → fetchImageAsPng → saveToReadingList message
    ▼
[5] IndexedDB + chrome.storage.local  (persistent store)
    │  full HTML with base64 images in IndexedDB
    │  lightweight metadata array in chrome.storage.local
    ▼
[6] sidepanel.html / sidepanel.js / sidepanel.css
    │  reading list display
    │  "Add to List" from regular tab → fetchImageAsPng → saveToReadingList
    │  Merge & Download EPUB
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

### Message Flow: "Add to List" from Reader Tab (sidepanel delegation)

1. `checkCurrentTab()` detects reader.html tab → messages it with `{ action: 'getCurrentArticle' }`
2. reader.js responds with `{ title, url, siteName }` → sidepanel shows article info
3. User clicks **Add to List** in sidepanel
4. `handleAddToListViaTab()` sends `{ action: 'addToReadingList' }` to reader tab
5. reader.js runs `handleAddToReadingList()` (same full pipeline as above)
6. Reader tab responds `{ success: true }` → sidepanel refreshes

---

## File Structure & Purpose

```
chrome-extension/
├── manifest.json            MV3 config — permissions, side_panel, host_permissions, CSP
├── background.js            Service worker — toolbar click handler, IndexedDB helpers,
│                            saveToReadingList / deleteFromList message handlers, context menu
├── content.js               Injected content script — Readability extraction, URL normalisation
├── db.js                    IndexedDB wrapper used by sidepanel.js — Promise-based CRUD
│
├── reader.html              Reader view UI (214 lines)
├── reader.js                Reader view logic (~2400 lines) — article display, themes, font,
│                            Flash It engine, TTS, EPUB export, Add to List, postMessage handoff
├── reader.css               Reader view styles — theme variables, Flash It, Flash overlay,
│                            progress bar, notification toasts
│
├── sidepanel.html           Side panel UI — reading list, current article section, storage info
├── sidepanel.js             Side panel logic (~825 lines) — list render, add/remove, EPUB merge,
│                            fetchImageAsPng, tab detection, storage change listeners
├── sidepanel.css            Side panel styles — card layout, toasts, themes
│
├── rules.json               declarativeNetRequest rules — sets Referer header for CDN images
│                            (Substack, Medium). Add new rules here for blocked CDNs.
│
├── libs/
│   ├── Readability.js       Mozilla Readability (89 KB, don't modify)
│   └── jszip.min.js         JSZip for EPUB generation (~100 KB)
│
├── icons/
│   ├── icon16.png / icon32.png / icon48.png / icon128.png
│
├── _metadata/               Auto-generated by Chrome for declarativeNetRequest rules
│   └── generated_indexed_rulesets/_ruleset1
│
├── readeasy-postmessage-listener.js   Helper snippet for web apps receiving postMessage
│
└── docs/
    README.md
    PROJECT_ARCHITECTURE.md  (this file)
    PROJECT_SUMMARY.md
    QUICKSTART.md
    INSTALL.md
    TESTING.md
    FLASH_IT.md
    GITHUB.md
    WEBAPP_POSTMESSAGE_README.md
    READING_LIST_IMPLEMENTATION.md
    privacy-policy.html
```

### Manifest Highlights

```json
{
  "manifest_version": 3,
  "permissions": ["activeTab","scripting","storage","declarativeNetRequest","sidePanel","contextMenus"],
  "host_permissions": ["<all_urls>"],
  "side_panel": { "default_path": "sidepanel.html" },
  "background": { "service_worker": "background.js" },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; img-src 'self' https: http: data:;"
  }
}
```

**Why `<all_urls>`?** The reader page and side panel need to `fetch()` images from any CDN domain to embed them as base64. Without this host permission, cross-origin fetch would fail even from extension pages.

---

## Storage Architecture

```
chrome.storage.session  (tab-scoped, cleared when browser closes)
├── currentArticle           Article data passed from content.js → reader.html
│   ├── title
│   ├── byline
│   ├── content (HTML)
│   ├── textContent
│   ├── length
│   ├── excerpt
│   ├── siteName
│   ├── publishedTime
│   ├── sourceUrl
│   └── sourceFavicon
└── flashItState             Flash It playback position
    ├── wordIndex
    ├── speed (WPM)
    └── mode

chrome.storage.local  (persistent, device-local)
└── readingListMeta[]        Lightweight metadata array (no HTML content)
    └── { id, title, url, siteName, addedDate }

IndexedDB — ReadEasyDB / savedArticles  (persistent, device-local)
└── savedArticles store
    ├── id (autoIncrement, keyPath)
    ├── title
    ├── url
    ├── siteName
    ├── addedDate (indexed)
    └── htmlContent          Full article HTML with all images as base64 PNG data URIs
                             (can be 5–30 MB per article depending on image count)

chrome.storage.sync  (persistent, synced across devices)
└── readerPreferences
    ├── theme               'light-theme' | 'sepia-theme' | 'dark-theme'
    ├── fontSize            'font-small' | 'font-normal' | 'font-large' | 'font-xlarge' | 'font-xxlarge'
    └── wideWidth           boolean
```

### Metadata vs Content Split

The reading list uses a **two-tier storage split**:
- `chrome.storage.local` holds only the lightweight metadata array (IDs, titles, URLs) — this is what the side panel reads to render the list instantly without touching IndexedDB.
- IndexedDB holds the heavy `htmlContent` (full HTML + base64 images) — only loaded when generating the EPUB.

This split means the side panel list renders fast, and IndexedDB is only opened when actually needed.

---

## Key Features & Implementation Details

### 1. Article Extraction (`content.js`)

**Process:**
1. `document.cloneNode(true)` — never mutate the live page
2. `makeUrlsAbsolute(clone, baseUrl)` — converts all `src`/`href` attributes to absolute URLs
   - Removes `srcset` entirely (causes broken Substack CDN URLs)
   - Converts `data-src` lazy-load attributes to `src`
   - Fixes Substack CDN: `src.replace(/,w_\d+,c_limit,/, ',')`
3. `new Readability(clone, { charThreshold: 500 }).parse()`
4. Returns article object (title, byline, content, textContent, siteName, publishedTime, etc.)
5. Result goes into `chrome.storage.session` as `currentArticle`

**Limitation:** Only works on pages the user actively clicked on (activeTab). Won't work on `chrome://` or other extension pages.

### 2. Image Embedding Pipeline (shared pattern)

Both `reader.js` and `sidepanel.js` use identical `fetchImageAsPng(url)` helpers.

```javascript
async function fetchImageAsPng(url) {
  // 1. fetch() with 20s AbortController timeout, credentials: 'omit'
  //    Extension context + <all_urls> bypasses CORS entirely
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const response = await fetch(url, { credentials: 'omit', signal: controller.signal });
  clearTimeout(timer);

  // 2. Get blob, create objectURL
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

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
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = objectUrl;
  });

  URL.revokeObjectURL(objectUrl); // always clean up
  return dataUrl; // 'data:image/png;base64,...'
}
```

**Why fetch() instead of canvas-on-DOM-img?**
The old approach drew already-rendered `<img>` elements to a canvas. Any cross-origin image taints the canvas, causing `toDataURL()` to throw a security error. `fetch()` from an extension page with `<all_urls>` bypasses CORS entirely — no taint, no error.

**Why normalise to PNG?**
EPUB readers have inconsistent support for JPEG, WebP, AVIF. PNG is universally supported. The canvas step normalises whatever format the CDN serves (WebP, AVIF, JPEG) into a PNG.

**URL replacement — never use RegExp on base64:**
Base64 strings contain `+`, `/`, `=`, which are RegExp special characters. The safe replacement pattern is:
```javascript
htmlContent = htmlContent.split(src).join(dataUrl);
htmlContent = htmlContent.split(src.replace(/&/g, '&amp;')).join(dataUrl);
```

### 3. Reading List — background.js

`saveToReadingList` handler:
1. **Deduplication**: checks `readingListMeta` for existing URL — returns `{ success: true, duplicate: true }` without saving
2. **Capacity enforcement**: if count ≥ 10, deletes the oldest article from both IndexedDB and metadata before inserting
3. Writes article to IndexedDB via `addArticle()`, updates `readingListMeta` in `chrome.storage.local`, broadcasts `listUpdated` message

`deleteFromList` handler:
1. Deletes from IndexedDB by id
2. Filters metadata array, saves back to `chrome.storage.local`
3. Broadcasts `listUpdated`

### 4. Side Panel State Management (`sidepanel.js`)

`checkCurrentTab()` runs on every tab activation and update. It classifies the active tab into three cases:
- **Case 1 — chrome:// / non-reader extension page**: hide "Current Article" section
- **Case 2 — reader.html tab**: send `{ action: 'getCurrentArticle' }` message; reader.js responds with `{ title, url, siteName }`
- **Case 3 — normal http/https page**: show tab title, enable "Add to List" button, store `currentRegularTabId` and `currentRegularTabUrl`

`initPanel()` is debounced (30 ms) so rapid `chrome.storage.onChanged` events (e.g. during batch operations) coalesce into a single re-render.

Both `chrome.storage.onChanged` (primary) and `listUpdated` message (backup) trigger `initPanel()`.

### 5. Merged EPUB Generation (`sidepanel.js` — `generateMergedEPUB`)

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
Some encoders insert `\n` every 76 characters. The EPUB generator strips all whitespace before computing the fingerprint and before writing to the zip.

**d) Named HTML entity decoding:**
Readability can leave `&nbsp;`, `&mdash;`, etc. in content. XHTML/XML doesn't understand these. `decodeNamedEntities()` converts them to literal Unicode before writing XHTML chapter files. The five XML-native entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`) are left untouched.

**EPUB structure generated:**
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

### 6. Single-Article EPUB (`reader.js` — `downloadArticleEPUB`)

The reader's own EPUB export uses a slightly different approach: it waits for DOM images to finish loading (`img.complete && naturalWidth > 0`), then draws each to a canvas and embeds as PNG. This is different from the Reading List path because the images are already loaded in the DOM (no extra fetch needed). URL replacement uses `RegExp` with escaped special characters (safe here since the source URL is a `http(s)://` URL, not base64).

### 7. Flash It Speed Reading (`reader.js`)

**Three display modes:**
- `overlay` — RSVP-style fullscreen overlay, words shown at 2× font size with surrounding context
- `inline-word` — highlights current word in article body with auto-scroll (scrolls only if word is off-screen)
- `inline-line` — highlights entire line; also used during TTS playback for line-sync

**Timing algorithm:**
```javascript
let displayTime = (60 / flashSpeed) * 1000; // base ms per word from WPM
if (word.length <= 3) displayTime *= 0.8;
else if (word.length <= 8) displayTime *= 1.0;
else if (word.length <= 12) displayTime *= 1.3;
else displayTime *= 1.5;
if (/[.!?]$/.test(word)) displayTime += 300;
else if (/[,;:]$/.test(word)) displayTime += 150;
```

**Word extraction:** Recursively walks text nodes in `#articleBody`, wraps each word in `<span class="flash-word" data-word-index="N">`. Skips script/style/SVG.

**State persistence:** `wordIndex`, `speed`, `mode` saved to `chrome.storage.session` (`flashItState`) on every word advance. Restored on resume.

**Keyboard shortcuts:**
- `F` — toggle Flash It on/off
- `Space` — pause/resume while flashing
- `R` — restart Flash It
- `+` / `-` — font size (outside Flash It)
- `Esc` — exit Flash It or close reader tab

### 8. Text-to-Speech (`reader.js`)

Uses the Web Speech API (`speechSynthesis`). Article text is split into sentence-based chunks to work around browser utterance length limits. During TTS playback, Flash It is auto-switched to `inline-line` mode so the current line scrolls into view and gets highlighted as TTS progresses (`onboundary` word events). On TTS end or stop, the previous Flash It mode is restored.

**Key state variables:**
```javascript
let ttsQueue = [];          // chunked sentence arrays
let ttsQueueIndex = 0;      // current chunk
let ttsWordOffsets = [];    // char offsets for word boundary events
let ttsPrevFlashMode = null; // Flash It mode to restore after TTS
```

### 9. Web App Handoff (`reader.js` — `sendArticleToWebapp`)

Opens `TTS_WEBAPP_URL` in a new tab, then sends the article payload via `postMessage`:
```javascript
{
  type: 'readeasy-article',
  title, byline, siteName, sourceUrl,
  html,      // article body innerHTML
  cssText    // reader.css text (fetched from extension resources)
}
```
Supports an optional handshake: if the web app sends `'readeasy-ready'` before the 1.5 s fallback timer fires, the payload is sent immediately. `readeasy-postmessage-listener.js` is a helper snippet for web apps to implement this listener.

### 10. Theme & Typography System (`reader.css`)

CSS custom properties define three themes applied via body class:
```css
body.light-theme { --bg-color: #ffffff; --text-color: #333; ... }
body.sepia-theme { --bg-color: #f4ecd8; ... }
body.dark-theme  { --bg-color: #1a1a1a; ... }
```
Font sizes are also body classes: `font-small` → `font-xxlarge` (16–24 px). Both are saved to `chrome.storage.sync` as `readerPreferences` and restored on next load.

### 11. Referrer Policy Workaround (`rules.json`)

Some CDNs (Substack, Medium) block image requests that don't carry the correct `Referer` header. `declarativeNetRequest` rules intercept these requests and inject `Referer: https://www.google.com/`.

To support a new CDN:
1. Add a rule to `rules.json` (increment the `id`)
2. Reload the extension — Chrome rebuilds `_metadata/generated_indexed_rulesets/`

---

## Critical Implementation Patterns

### Never use RegExp on base64 strings
Base64 contains `+`, `/`, `=` — all RegExp metacharacters. Always use `str.split(literal).join(replacement)` when replacing data URIs in HTML.

### Always handle both `&` and `&amp;` in URL replacement
Browsers may HTML-encode `&` as `&amp;` in `innerHTML`. When replacing image URLs, replace both forms:
```javascript
htmlContent = htmlContent.split(src).join(dataUrl);
htmlContent = htmlContent.split(src.replace(/&/g, '&amp;')).join(dataUrl);
```

### session storage as data bus
`chrome.storage.session` is used only to pass article data from the background → reader tab. It is NOT used for the reading list (that's IndexedDB + local storage).

### Never open chrome:// pages with extension
Check `tab.url.startsWith('chrome://')` before injecting scripts.

### Debounce initPanel()
Rapid storage.onChanged events can fire multiple times in quick succession (e.g. when background.js writes both IndexedDB and metadata). The 30 ms debounce in `initPanel()` prevents duplicate renders.

### EPUB mimetype must be STORE (uncompressed)
The EPUB spec requires the `mimetype` file to be the first entry and stored uncompressed: `zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })`.

---

## Important Functions Reference

### background.js

| Function | Purpose |
|---|---|
| `initDB()` | Open / create IndexedDB |
| `addArticle(article)` | Insert article into IndexedDB |
| `deleteArticle(id)` | Remove article from IndexedDB |
| `getArticleCount()` | Count saved articles |
| `getOldestArticle()` | Retrieve oldest article (for capacity eviction) |
| `onMessage('saveToReadingList')` | Dedup, evict oldest if needed, save, update metadata, broadcast |
| `onMessage('deleteFromList')` | Delete from IDB + metadata, broadcast |
| `onClicked` (toolbar) | Inject Readability + content.js, save to session, open reader tab |

### content.js

| Function | Purpose |
|---|---|
| `makeUrlsAbsolute(clone, base)` | Convert all src/href to absolute, remove srcset, convert data-src |
| `extractArticle()` | Main entry point — clones document, runs Readability, returns article |

### db.js (IndexedDB wrapper — used by sidepanel.js)

| Function | Purpose |
|---|---|
| `initDB()` | Open ReadEasyDB, create store with indexes |
| `addArticle(article)` | Insert with addedDate timestamp |
| `getArticle(id)` | Fetch single article by id |
| `getAllArticles()` | Get all articles ordered by addedDate |
| `deleteArticle(id)` | Delete by id |
| `getArticleCount()` | Count articles |
| `getOldestArticle()` | Get article with smallest addedDate |

### reader.js

| Function | Line | Purpose |
|---|---|---|
| `DOMContentLoaded` | ~33 | Entry point — loadArticle, setupEventListeners, loadPreferences |
| `loadArticle()` | ~54 | Read from session storage, sanitize, display |
| `sanitizeHtml(html)` | ~120 | Strip scripts, on* attrs, convert iframes |
| `setupEventListeners()` | ~180 | Bind all toolbar controls, keyboard shortcuts |
| `setTheme(theme)` | ~608 | Switch body class, save prefs |
| `updateFontSize()` | ~619 | Apply font class, save prefs |
| `savePreferences()` | ~633 | Write to chrome.storage.sync |
| `loadPreferences()` | ~641 | Read from chrome.storage.sync, apply |
| `fetchImageAsPng(url)` | ~445 | fetch → blob → canvas → PNG data URI (20 s timeout) |
| `handleAddToReadingList()` | ~488 | Collect imgs, run fetchImageAsPng, patch HTML, sendMessage |
| `sendArticleToWebapp()` | ~960 | Open TTS_WEBAPP_URL, send postMessage payload |
| `startFlashIt()` | ~1332 | Extract words, enter Flash It mode |
| `flashNextWord()` | ~1400 | Advance word with adaptive timing, save state |
| `pauseFlashIt()` | ~1450 | Pause with state save |
| `resumeFlashIt()` | ~1465 | Resume from saved position |
| `restartFlashIt()` | ~1480 | Reset to word 0 |
| `stopFlashIt()` | ~1500 | Exit, clean up spans and overlay |
| `changeFlashMode(mode)` | ~1530 | Switch overlay/inline-word/inline-line |
| `updateFlashSpeed(wpm)` | ~1555 | Update flashSpeed global |
| `saveFlashState()` | ~1570 | Persist to session storage |
| `loadFlashState()` | ~1585 | Restore from session storage |
| `startTtsPlayback()` | ~700 | Chunk text, speak, enable line-sync |
| `pauseTtsPlayback()` | ~800 | speechSynthesis.pause() |
| `resumeTtsPlayback()` | ~810 | speechSynthesis.resume() |
| `downloadArticleEPUB()` | ~1883 | Single-article EPUB — wait for DOM imgs, canvas-embed, JSZip |
| `openEmailEpubModal()` | ~2100 | Open email modal for EPUB attachment |
| `showNotification(msg, type)` | ~562 | Toast notification (2 s) |

### sidepanel.js

| Function | Line | Purpose |
|---|---|---|
| `initPanel()` | ~27 | Debounced — read metadata, renderArticleList, updateStorageInfo |
| `setupEventListeners()` | ~52 | Bind add/merge buttons, storage.onChanged, tab listeners |
| `checkCurrentTab()` | ~105 | Classify active tab, update currentArticle section |
| `showCurrentArticleSection(data)` | ~186 | Display article info + enable Add to List |
| `hideCurrentArticleSection(reason)` | ~202 | Show fallback message, disable Add to List |
| `handleAddToListViaTab(tabId)` | ~213 | Delegate to reader tab via message |
| `fetchImageAsPng(url)` | ~249 | Identical to reader.js helper |
| `handleAddToListFromRegularTab(tabId, url)` | ~292 | Inject Readability, fetch images, save |
| `renderArticleList()` | ~360 | Render article cards from readingListMeta |
| `createArticleCard(article)` | ~403 | Build card DOM element |
| `handleRemoveArticle(id)` | ~437 | Send deleteFromList message |
| `updateStorageInfo()` | ~453 | Calculate and display IDB usage |
| `handleMergeEPUB()` | ~475 | Entry point for EPUB merge |
| `generateMergedEPUB(articles)` | ~518 | Full EPUB build with image dedup |
| `decodeNamedEntities(html)` | ~620 | Decode &nbsp; etc. → Unicode for XHTML |
| `convertToXHTML(html, title)` | ~630 | Wrap in valid XHTML document |
| `generateContentOPF(chapters, images)` | ~670 | OPF package manifest |
| `generateTocNCX(chapters)` | ~730 | EPUB 2 NCX navigation |
| `generateNavXHTML(chapters)` | ~760 | EPUB 3 nav document |
| `escapeHtml(str)` | ~800 | HTML entity escape for user content |
| `showToast(msg, type, duration)` | ~810 | Toast notification |

---

## Common Development Tasks

### Add a New Toolbar Button (reader view)
1. Add button HTML to `reader.html` in the relevant toolbar row
2. Add event listener in `setupEventListeners()` in `reader.js`
3. Use existing `.icon-btn` class in `reader.css` or add custom styles

### Add a New Theme
1. Add CSS variables block to `reader.css`: `body.mytheme-theme { --bg-color: ...; }`
2. Add `'mytheme-theme'` to the `THEMES` array in `reader.js`
3. Add theme button to `reader.html`

### Fix Images Not Loading from a New CDN
1. Check Network tab for 403 or missing Referer
2. Add a new rule to `rules.json` (increment `id`):
   ```json
   { "id": N, "priority": 1,
     "action": { "type": "modifyHeaders",
       "requestHeaders": [{ "header": "referer", "operation": "set", "value": "https://www.google.com/" }] },
     "condition": { "urlFilter": "*cdn.example.com*", "resourceTypes": ["image"] }
   }
   ```
3. Reload the extension (Chrome rebuilds `_metadata/`)

### Increase Reading List Capacity (currently 10)
Change the `>= 10` check in `background.js` `saveToReadingList` handler. Also update the `storageInfo` display text in `sidepanel.html` and `updateStorageInfo()` in `sidepanel.js`.

### Debug Image Embedding
- reader.js Add to List: open DevTools on the reader tab, check console for `[ReadEasy] Fetching N images…` and success/skip counts
- sidepanel.js Add to List: open DevTools on the side panel (inspect → Extensions → ReadEasy side panel), check `[SidePanel]` log lines
- EPUB merge: check `[EPUB]` log lines for invalid base64 or skipped images

### Debug Side Panel Not Updating
- Check `chrome.storage.local` via DevTools → Application → Local Storage
- The side panel listens to `chrome.storage.onChanged` — if it fires, `initPanel()` should run
- If `listUpdated` message is not received, it's OK — the storage listener is the primary mechanism

---

## Chronological Development History

### January 2026 — Initial Extension
- Article extraction with Readability.js
- Reader view: light/sepia/dark themes, font size controls, width toggle, progress bar
- Keyboard shortcuts, preference persistence via `chrome.storage.sync`
- HTML sanitization, URL normalisation

### Late January 2026 — Flash It Speed Reading
- Three display modes: RSVP overlay, word highlight (inline-word), line highlight (inline-line)
- Adaptive timing: word length multipliers + punctuation pauses
- Speed control 100–1000 WPM, session persistence of playback position
- Recursive DOM word extraction with `<span class="flash-word">` wrapping

### Late January 2026 — EPUB Export (single-article)
- JSZip integration, EPUB 3.0 structure
- Image embedding via canvas (wait for DOM load → drawImage → toDataURL)
- Fix: HTML-encoded URLs (`&amp;` vs `&`) — replaced both forms
- Email EPUB via `mailto:` link with base64 attachment

### Early February 2026 — UI Improvements
- Flash It UI consolidated: 4 buttons → 2 (toggle + restart), dynamic icon/title
- Merge EPUB toolbar button linking to `merge-epubs.vercel.app`
- Toolbar split into two rows to prevent overflow at 100% zoom

### February 7, 2026 — TTS + Web App Handoff
- Text-to-Speech via Web Speech API; sentence-based chunking; voice selector
- TTS line-sync: auto-enables Flash It `inline-line` mode, restores on TTS end
- Web App Handoff: `sendArticleToWebapp()` opens external URL, sends HTML + CSS via `postMessage` with optional `readeasy-ready` handshake
- `readeasy-postmessage-listener.js` helper for web app integration

### February 13, 2026 — Reading List + Side Panel
- Native Chrome side panel (`sidepanel.html/js/css`)
- Reading List: save up to 10 articles with embedded images to IndexedDB
- `db.js`: Promise-based IndexedDB wrapper
- `background.js`: `saveToReadingList` / `deleteFromList` message handlers; URL deduplication; capacity eviction (FIFO)
- Two-tier storage: metadata in `chrome.storage.local`, full content in IndexedDB
- Side panel: tab detection (`checkCurrentTab`), add from reader tab (delegation) or regular tab (inject Readability directly)
- Merged EPUB: generate multi-chapter EPUB from all saved articles with image deduplication
- Side panel storage usage indicator
- `chrome.storage.onChanged` as primary refresh mechanism; debounced `initPanel()`

### February 28, 2026 — Image Pipeline Unification
- **Problem:** reader.js `handleAddToReadingList()` used canvas-on-DOM approach which failed on CORS-tainted cross-origin images; sidepanel.js used `fetch()` + `FileReader.readAsDataURL()`
- **Fix:** Both files now use identical `fetchImageAsPng(url)` helper:
  - `fetch()` with `AbortController` 20 s timeout (bypasses CORS from extension context)
  - blob → `URL.createObjectURL()` → off-screen `<img>` → canvas → `toDataURL('image/png')`
  - PNG normalisation for EPUB reader compatibility
  - `Promise.allSettled` — single failure never aborts the batch
  - `split+join` replacement — never `RegExp` on base64
- **EPUB merge improvements:** content-based image deduplication fingerprint (length + start/mid/end samples), named HTML entity decoding for valid XHTML, base64 whitespace stripping


---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture & Data Flow](#architecture--data-flow)
3. [File Structure & Purpose](#file-structure--purpose)
4. [State Management](#state-management)
5. [Key Features & Implementation](#key-features--implementation)
6. [Development Patterns](#development-patterns)
7. [Important Functions Reference](#important-functions-reference)
8. [Common Tasks & Workflows](#common-tasks--workflows)
9. [Chronological Development History](#chronological-development-history)

---

## Project Overview


**ReadEasy** is a Chrome Manifest V3 extension for distraction-free reading, now with a persistent Reading List and EPUB merging:

- **Core**: Article extraction using Mozilla Readability
- **UI**: Themeable reader view with customizable typography
- **Speed Reading**: Flash It mode with 3 display modes (RSVP, word highlight, line highlight)
- **Export**: HTML and EPUB download, email support, and multi-article EPUB merge
- **Reading List**: Save up to 10 articles (with images) for later, managed in a native Chrome side panel
- **Storage**: IndexedDB for full article HTML, chrome.storage.local for metadata, session storage for data passing, sync storage for preferences

**Tech Stack**:
- Vanilla JavaScript (no frameworks)
- Chrome Extension APIs (Manifest V3)
- Mozilla Readability.js (article extraction)
- JSZip (EPUB generation)
- CSS custom properties for theming
---

## Architecture & Data Flow


### Five-Component Pipeline (2026+)

```
User Click  Background Service Worker  Content Script  Reader View  Side Panel
  (1)              (2)                      (3)              (4)         (5)
```

#### 1. Background Service Worker (`background.js`)
- **Trigger**: User clicks extension toolbar icon or "Add to List" in reader
- **Action**: Injects content script, coordinates article extraction, manages IndexedDB and metadata
- **Role**: Coordinator between all components

#### 2. Content Script (`content.js`)
- **Execution Context**: Runs in active tab's DOM
- **Action**: 
  - Extracts article using Readability.js
  - Converts all URLs to absolute

  - Fixes CDN image URLs (Substack, Medium)
  - Returns article data to background script
- **Storage**: Saves article to `chrome.storage.session` (key: `currentArticle`)


#### 3. Background Script Response
- **Action**: Creates new tab with `reader.html` (for reading), or saves article to IndexedDB (for reading list)
- **Data**: Article available via session storage (for reading) or IndexedDB (for reading list)

#### 4. Reader View (`reader.html/js/css`)
  - Retrieves article from session storage
  - Renders with themes and controls
  - Provides Flash It, export, and customization features
  - Allows saving to Reading List (sends message to background)

#### 5. Side Panel (`sidepanel.html/js/css`)
  - Lists saved articles (metadata from chrome.storage.local, content from IndexedDB)
  - Allows removing articles, merging multiple into a single EPUB
  - Handles EPUB generation with deduped images and valid XHTML


### Storage Architecture (2026+)

```
chrome.storage.session
├── currentArticle           # Article data passed from content → reader
│   ├── title
│   ├── byline
│   ├── content (HTML)
│   ├── textContent
│   ├── length
│   ├── excerpt
│   └── sourceUrl
└── flashItState            # Flash It playback position
  ├── wordIndex
  ├── speed
  └── mode

chrome.storage.local
├── readingListMeta          # Array of {id, title, url, siteName, addedDate}

IndexedDB (ReadEasyDB)
├── savedArticles            # Full HTML content for each article (id, htmlContent, ...)

chrome.storage.sync (persists across devices)
├── theme                   # light | sepia | dark
├── fontSize               # small | medium | large | xlarge | xxlarge
└── isWideWidth           # boolean
```

---


## File Structure & Purpose

### Core Extension Files

| `content.js` | DOM extraction script | Readability execution, URL conversion, data return |
| `rules.json` | Network request rules | Modifies referrer headers for CDN images |

| File | Purpose | Lines | Key Sections |
|------|---------|-------|--------------|
| `reader.html` | UI structure | 214 | Toolbar, article body, Flash It overlay, email modal |
| `reader.js` | Logic & features | 1875 | Event listeners, Flash It engine, EPUB generation |
| `reader.css` | Styling & themes | ~800 | Theme variables, responsive layout, Flash It styles |

### Libraries

| File | Purpose | Size | Source |
|------|---------|------|--------|
| `libs/Readability.js` | Article extraction | 89KB | Mozilla (minified) |
| `libs/jszip.min.js` | EPUB generation | ~100KB | JSZip library |
| `README.md` | User-facing documentation |
| `PROJECT_ARCHITECTURE.md` | This file - comprehensive dev guide |
| `.github/copilot-instructions.md` | GitHub Copilot context |
| `PROJECT_SUMMARY.md` | Quick project overview |
| `TESTING.md` | Test sites and scenarios |
| `readeasy-postmessage-listener.js` | Web app listener helper for postMessage payload |
| `WEBAPP_POSTMESSAGE_README.md` | Web app integration guide for postMessage payload |
| `privacy-policy.html` | Privacy policy for Chrome Web Store |

---

## State Management

### Global State Variables (`reader.js`)

#### Article State
```javascript
let article = null;           // Loaded from session storage
let currentTheme = 'light';   // Theme: light | sepia | dark
let currentFontSize = 'medium'; // Font: small | medium | large | xlarge | xxlarge
let isWideWidth = false;      // Content width toggle
```

#### Flash It State
```javascript
let isFlashing = false;       // Is Flash It active?
let flashMode = 'overlay';    // Mode: overlay | highlight | line
let flashSpeed = 250;         // WPM (100-1000)
let currentWordIndex = 0;     // Current word position
let wordArray = [];           // Array of word objects {text, element}
let flashTimeout = null;      // setTimeout reference
let isPaused = false;         // Pause state
```

#### Text-to-Speech (TTS) State
```javascript
const TTS_WEBAPP_URL = 'https://your-webapp.example.com';
let ttsUtterance = null;       // Current speech utterance
let ttsQueue = [];             // Chunked text queue
let ttsQueueIndex = 0;         // Current chunk position
let ttsVoice = null;           // Selected speech voice
let ttsIsPaused = false;       // Pause state
```

#### Reading Progress
```javascript
// Calculated on scroll
scrollPercentage = (scrollTop / (scrollHeight - clientHeight)) * 100
```

### Storage Keys

**Session Storage** (temporary, tab-specific):
- `currentArticle` - Article data object
- `flashItState` - Playback position

**Sync Storage** (persistent, synced):
- `theme` - User's preferred theme
- `fontSize` - User's preferred font size
- `isWideWidth` - Width preference

---

## Key Features & Implementation

### 1. Article Extraction

**Location**: `content.js`

**Process**:
1. Create DocumentClone for Readability
2. Parse with Readability (options: `charThreshold: 500`)
3. Convert all relative URLs to absolute:
   ```javascript
   new URL(relativeUrl, document.location.href).href
   ```
4. Fix CDN URLs:
   - Remove `srcset` attributes (causes issues)
   - Fix Substack: `src.replace(/,w_\d+,c_limit,/, ',')`
   - Convert `data-src` to `src`
5. Sanitize HTML (remove scripts, event handlers)
6. Store in session storage

**Key Code**:
```javascript
// content.js line ~50
const article = new Readability(documentClone, {
  charThreshold: 500,
  keepClasses: true
}).parse();
```

### 2. Flash It Speed Reading

**Location**: `reader.js` lines 467-1100

**Three Display Modes**:

1. **RSVP Overlay** (`flashMode = 'overlay'`)
   - Displays words centered on screen
   - Font size: 2x normal
   - Shows previous and next words for context
   - Implementation: Updates `#flashOverlayWord` innerHTML

2. **Word Highlight** (`flashMode = 'highlight'`)
   - Highlights each word in article body
   - Auto-scrolls if word off-screen
   - Implementation: Adds `.flash-active` class to word spans

3. **Line Highlight** (`flashMode = 'line'`)
   - Highlights entire lines
   - Faster for experienced readers
   - Implementation: Adds `.flash-active-line` class

**Timing Algorithm**:
```javascript
// Base time from WPM
let baseTime = (60 / flashSpeed) * 1000;

// Adjust for word length
if (word.length <= 3) baseTime *= 0.8;
else if (word.length <= 8) baseTime *= 1.0;
else if (word.length <= 12) baseTime *= 1.3;
else baseTime *= 1.5;

// Add punctuation pauses
if (/[.!?]$/.test(word)) baseTime += 300;
else if (/[,;:]$/.test(word)) baseTime += 150;
```

**Word Extraction**:
- Recursively walks text nodes in `#articleBody`
- Wraps each word in `<span class="flash-word" data-word-index="N">`
- Skips script/style/SVG elements
- Preserves whitespace

**State Persistence**:
- Saves `wordIndex`, `speed`, `mode` to session storage on every word
- Restores position when resuming

**Key Functions**:
- `startFlashIt()` - Initialize Flash It mode
- `flashNextWord()` - Advance to next word with timing
- `pauseFlashIt()` - Pause playback
- `resumeFlashIt()` - Resume from current position
- `restartFlashIt()` - Reset to beginning
- `stopFlashIt()` - Exit and cleanup
- `updateFlashButtons()` - Update UI button states

### 3. Text-to-Speech Playback

**Location**: `reader.js` (TTS functions section)

**Playback**:
- Uses Web Speech API (`speechSynthesis`)
- Splits article text into sentence-based chunks to avoid long-utterance limits
- Voice selection via `speechSynthesis.getVoices()` with dropdown
- Play/Pause toggle button in toolbar
- Auto-enables Flash It line mode and highlights current line in sync with TTS word boundaries

**Key Functions**:
- `initTtsVoices()` - Populate voice list and handle selection
- `startTtsPlayback()` / `pauseTtsPlayback()` / `resumeTtsPlayback()`
- `buildTtsChunks(text)` - Chunking strategy for long articles

### 4. Web App Handoff (HTML via postMessage)

**Purpose**: Send article HTML to an external web app that can render or convert content (e.g., TTS download service).

**Flow**:
1. Opens web app URL in a new tab
2. Sends article metadata, HTML, and CSS via `postMessage`
3. Optional handshake: web app replies with `readeasy-ready` to receive immediately

**Payload Structure**:
```javascript
{
  type: 'readeasy-article',
  title,
  byline,
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

### Theme & Display (`reader.js`)

| Function | Line | Purpose |
|----------|------|---------|
| `setTheme(theme)` | 420 | Changes color theme |
| `setFontSize(size)` | 440 | Adjusts font size |
| `changeFontSize(delta)` | 455 | Increments font size |
| `toggleWidth()` | 465 | Switches content width |

### Flash It Core (`reader.js`)

| Function | Line | Purpose |
|----------|------|---------|
| `startFlashIt()` | 789 | Initializes speed reading mode |
| `extractWords()` | 550 | Walks DOM and wraps words in spans |
| `flashNextWord()` | 1000 | Advances to next word with timing |
| `pauseFlashIt()` | 825 | Pauses playback |
| `resumeFlashIt()` | 846 | Resumes from saved position |
| `restartFlashIt()` | 861 | Resets to beginning |
| `stopFlashIt()` | 885 | Exits Flash It and cleans up |
| `changeFlashMode(mode)` | 921 | Switches display mode |
| `updateFlashSpeed()` | 962 | Changes WPM |
| `updateFlashButtons()` | 983 | Updates control button states |
| `saveFlashState()` | 746 | Persists playback position |
| `loadFlashState()` | 764 | Restores playback position |

### EPUB Generation (`reader.js`)

| Function | Line | Purpose |
|----------|------|---------|
| `downloadArticleEPUB()` | 1200 | Entry point for EPUB download |
| `generateEPUB()` | 1250 | Creates EPUB structure with JSZip |
| `preloadImages()` | 1450 | Converts images to data URLs |
| `emailArticleEPUB()` | 1650 | Opens email with EPUB attachment |

### Content Extraction (`content.js`)

| Function | Line | Purpose |
|----------|------|---------|
| `extractArticle()` | 40 | Main extraction function |
| `fixImageUrls()` | 150 | Converts relative URLs to absolute |
| `sanitizeHTML()` | 200 | Removes scripts and event handlers |

---

## Common Tasks & Workflows

### Task 1: Add a New Toolbar Button

1. **HTML** - Add button to [reader.html](reader.html) toolbar section:
   ```html
   <button id="newFeatureBtn" class="icon-btn" title="Feature Name">
     <svg><!-- icon paths --></svg>
   </button>
   ```

2. **JS** - Add event listener in `setupEventListeners()` in [reader.js](reader.js):
   ```javascript
   document.getElementById('newFeatureBtn').addEventListener('click', () => {
     // functionality
   });
   ```

3. **CSS** - Use existing `.icon-btn` class, or add custom styles to [reader.css](reader.css)

### Task 2: Modify Flash It Timing

Location: [reader.js](reader.js) `flashNextWord()` function (~line 1000)

Adjust multipliers:
```javascript
if (word.length <= 3) displayTime *= 0.8;     // Short words
else if (word.length <= 8) displayTime *= 1.0; // Normal
else if (word.length <= 12) displayTime *= 1.3; // Long
else displayTime *= 1.5;                       // Very long
```

### Task 3: Add Support for New CDN Image Domain

1. **Add rule** to [rules.json](rules.json):
   ```json
   {
     "id": 3,
     "priority": 1,
     "action": {
       "type": "modifyHeaders",
       "requestHeaders": [{"header": "referer", "operation": "set", "value": "https://www.google.com/"}]
     },
     "condition": {
       "urlFilter": "*newcdn.com*",
       "resourceTypes": ["image"]
     }
   }
   ```

2. **Reload extension** - Chrome rebuilds `_metadata/` directory

### Task 4: Add a New Theme

1. **CSS** - Add theme variables to [reader.css](reader.css):
   ```css
   body.custom-theme {
     --bg-color: #yourcolor;
     --text-color: #yourcolor;
     --border-color: #yourcolor;
     --header-bg: #yourcolor;
   }
   ```

2. **JS** - Add to THEMES array in [reader.js](reader.js):
   ```javascript
   const THEMES = ['light', 'sepia', 'dark', 'custom'];
   ```

3. **HTML** - Add button to theme switcher in [reader.html](reader.html):
   ```html
   <button class="theme-btn" data-theme="custom" title="Custom">Custom</button>
   ```

### Task 5: Fix Image Loading Issues

1. **Inspect Network tab** - Check for 403/CORS errors
2. **Add rule** to [rules.json](rules.json) for domain
3. **Check content.js** - Verify URL conversion logic handles the site
4. **Test** - Reload extension and try article again

---

## Chronological Development History

### January 2026 - Initial Development

**Core Features Built**:
- Article extraction with Readability.js
- Reader view with themes (light, sepia, dark)
- Font size and width controls
- Keyboard shortcuts
- Progress bar
- Preference persistence

**Technical Decisions**:
- Manifest V3 architecture
- Session storage for data passing
- Sync storage for preferences
- CSS custom properties for theming

### Late January 2026 - Flash It Speed Reading

**Feature**: Added three-mode speed reading system

**Implementation**:
- RSVP overlay mode with centered display
- Word highlight mode with auto-scroll
- Line highlight mode for faster reading
- Adaptive timing algorithm (word length + punctuation)
- Speed control (100-1000 WPM)
- Session persistence of playback position

**Key Challenge**: Word extraction required recursive DOM traversal while preserving layout

### Late January 2026 - EPUB Export

**Feature**: Download articles as EPUB files

**Implementation**:
- JSZip library integration
- EPUB 3.0 structure generation
- Image embedding via canvas conversion
- Metadata inclusion (title, author, date)

**Key Challenge**: CORS-protected images (X/Twitter, Substack)
- **Solution**: Pre-load images, draw to canvas, convert to data URLs
- **Bug Fix**: HTML-encoded URLs (`&amp;` vs `&`) caused image replacement to fail
  - Fixed by replacing both encoded and decoded versions

### Early February 2026 - UI Improvements

**Changes**:
1. **Email EPUB** - Added modal to email EPUB files directly from reader
2. **Flash It UI Consolidation** - Reduced 4 buttons to 2 (toggle + restart)
   - Single button switches between Start/Pause/Resume based on state
   - Dynamic icon and title changes
3. **Restart Button Fix** - Fixed bug where restart didn't update toggle button to pause icon
   - Solution: Added `updateFlashButtons('playing')` call in `restartFlashIt()`
4. **Merge EPUB Tool** - Added toolbar button linking to external EPUB merge service
   - Opens https://merge-epubs.vercel.app/ in new tab
   - Overlapping documents icon for visual clarity

### February 2, 2026 - Documentation & Publishing Prep

**Documentation**:
- Updated README.md with all features
- Created PROJECT_ARCHITECTURE.md (this file) for AI assistants
- Documented all major features, patterns, and implementation details

**Status**: Extension ready for Chrome Web Store submission

### February 7, 2026 - TTS + Toolbar Layout

**Changes**:
1. **Text-to-Speech Playback** - Added listen controls using Web Speech API
  - Voice selector with available system voices
  - Play/Pause toggle button
  - Sentence-based chunking for long articles
2. **Web App Handoff** - Added button to open external web app and send article HTML via `postMessage`
  - Optional handshake (`readeasy-ready`) supported
3. **Toolbar Layout** - Split toolbar into two rows to avoid overflow at 100% zoom
  - Audio controls moved to second row
  - Header height increased for multi-row layout

### February 13, 2026 - TTS Sync + Save for Later UI

**Changes**:
1. **TTS Line Sync** - Line highlight follows spoken word boundaries during playback
  - Auto-enables Flash It line mode during TTS
  - Restores previous Flash It mode after TTS ends
2. **Save for Later UI** - Replaced icon-only actions with icon+label buttons
  - Merge EPUBs and Save for later now labeled
  - Download EPUB also uses icon+label styling
3. **Web App Handoff Payload** - CSS is included with HTML for consistent rendering
4. **Toolbar Alignment** - Header content aligned to the left and spacing adjusted

---

## Future Enhancement Ideas

**Potential Features to Add**:
- [ ] Reader mode detection (auto-suggest when user lands on article)
- [ ] Reading list / bookmarks
- [ ] Highlighting and annotations
- [ ] Print stylesheet for clean printing
- [ ] More Flash It customization (background color, font, etc.)
- [ ] EPUB library management
- [ ] Cloud sync for reading position across devices
- [ ] Browser history integration (save read articles)
- [ ] Reading statistics and analytics

**Technical Debt**:
- [ ] Add unit tests for critical functions
- [ ] Improve error handling in EPUB generation
- [ ] Optimize word extraction for very large articles (>50k words)
- [ ] Add loading states for slow article extraction
- [ ] Internationalization support

---

## Quick Reference: Where to Find Things

| Looking for... | File | Line Range |
|---------------|------|------------|
| Article extraction logic | content.js | 40-250 |
| Flash It engine | reader.js | 467-1100 |
| EPUB generation | reader.js | 1200-1700 |
| Theme definitions | reader.css | 1-100 |
| Event listeners setup | reader.js | 180-400 |
| Storage operations | reader.js | Throughout |
| Image URL fixes | content.js | 150-200 |
| Toolbar HTML | reader.html | 20-120 |
| Keyboard shortcuts | reader.js | 320-380 |
| CDN referrer rules | rules.json | All |

---

## Notes for AI Assistants

**When asked to modify the project**:

1. **Always check** `PROJECT_ARCHITECTURE.md` (this file) first for context
2. **Follow existing patterns** documented in "Development Patterns" section
3. **Update this file** when making architectural changes
4. **Test on multiple sites** from TESTING.md after changes
5. **Update README.md** if adding user-facing features
6. **Add to chronological history** with date when completing major features

**Key principles**:
- Vanilla JavaScript (no frameworks)
- CSS custom properties for theming
- Chrome storage APIs for persistence
- Sanitize all HTML before display
- Convert URLs to absolute
- Use session storage for temporary data, sync storage for preferences

**Common gotcas**:
- Manifest V3 requires service workers, not background pages
- activeTab permission only active when user clicks toolbar
- Session storage has ~10MB limit
- Canvas conversion required for CORS images
- declarativeNetRequest rules need extension reload to update

---

**End of Document** - Last updated: February 2, 2026

