# ReadEasy Extension — Project Architecture & Development Guide

> **Purpose**: Comprehensive reference for AI coding assistants and developers. Read this file first in any new chat — it describes every component, data flow, storage scheme, and key implementation decision in the current codebase.

> **Last Updated**: March 28, 2026

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
- **Inline title editing** — pencil icon in side panel cards to rename saved articles
- **Merged EPUB export** — combine all saved articles into a single, image-deduplicated EPUB
- **Merge & Send to X4** — generate merged EPUB in side panel modal and upload to LAN device
- **Optional image-free X4 EPUB mode** — checkbox-triggered regeneration with live file-size update
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
  │  inline title edit (pencil icon + in-card input)
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
├── manifest.json            MV3 config — permissions, side_panel, host_permissions, CSP
├── background.js            Service worker — toolbar click handler, IndexedDB helpers,
│                            saveToReadingList / deleteFromList / updateArticleTitle handlers,
│                            context menu
├── content.js               Injected content script — Readability extraction, URL normalisation
├── db.js                    IndexedDB wrapper used by sidepanel.js — Promise-based CRUD,
│                            includes title update helper
│
├── reader.html              Reader view UI (214 lines)
├── reader.js                Reader view logic (~2400 lines) — article display, themes, font,
│                            Flash It engine, TTS, EPUB export, Add to List, postMessage handoff
├── reader.css               Reader view styles — theme variables, Flash It, Flash overlay,
│                            progress bar, notification toasts
│
├── sidepanel.html           Side panel UI — reading list, current article section, storage info
├── sidepanel.js             Side panel logic (~940 lines) — list render, add/remove,
│                            inline title edit, EPUB merge/download, X4 modal flow,
│                            guarded async regeneration, fetchImageAsPng, tab detection,
│                            storage change listeners
├── sidepanel.css            Side panel styles — card layout, inline editor, X4 modal,
│                            toasts, themes
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

chrome.storage.sync  (persistent, synced across devices)
└── x4Settings
  ├── firmware            'crosspoint' | 'stock'
  └── ip                  default '192.168.1.11' (editable)
```

### Metadata vs Content Split

The reading list uses a **two-tier storage split**:
- `chrome.storage.local` holds only the lightweight metadata array (IDs, titles, URLs) — this is what the side panel reads to render the list instantly without touching IndexedDB.
- IndexedDB holds the heavy `htmlContent` (full HTML + base64 images) — only loaded when generating the EPUB.

When editing a saved title, both stores must be updated in the same action: metadata drives sidebar UI, while IndexedDB drives merged EPUB chapter titles and TOC labels.

This split means the side panel list renders fast, and IndexedDB is only opened when actually needed.

For X4 flow, only firmware/IP are persisted (`x4Settings`). The **Exclude Images** choice is intentionally session-only (`x4ExcludeImagesSession` in memory) and resets on sidepanel reload.

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

`updateArticleTitle` handler:
1. Validates `id` and non-empty trimmed title
2. Updates IndexedDB record by id (`savedArticles.title`)
3. Updates matching `readingListMeta` item title
4. Broadcasts `listUpdated`

### 4. Side Panel State Management (`sidepanel.js`)

`checkCurrentTab()` runs on every tab activation and update. It classifies the active tab into three cases:
- **Case 1 — chrome:// / non-reader extension page**: hide "Current Article" section
- **Case 2 — reader.html tab**: send `{ action: 'getCurrentArticle' }` message; reader.js responds with `{ title, url, siteName }`
- **Case 3 — normal http/https page**: show tab title, enable "Add to List" button, store `currentRegularTabId` and `currentRegularTabUrl`

`initPanel()` is debounced (30 ms) so rapid `chrome.storage.onChanged` events (e.g. during batch operations) coalesce into a single re-render.

Both `chrome.storage.onChanged` (primary) and `listUpdated` message (backup) trigger `initPanel()`.

Saved article cards support inline title editing with a top-right pencil icon. Edit mode is card-local and supports keyboard shortcuts:
- `Enter` = Save
- `Escape` = Cancel

X4 modal state in sidepanel includes:
- `pendingX4Articles` and `pendingX4Blob` for current modal session
- `x4ExcludeImagesSession` (session-only preference)
- `x4RegenRequestId` and `x4LatestSettledRequestId` for latest-toggle-wins semantics
- `x4RegenInFlight` to gate Send/Download buttons only during active regeneration

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

### February 13, 2026 - TTS Sync + Beta View UI

**Changes**:
1. **TTS Line Sync** - Line highlight follows spoken word boundaries during playback
  - Auto-enables Flash It line mode during TTS
  - Restores previous Flash It mode after TTS ends
2. **Beta View UI** - Replaced icon-only actions with icon+label buttons
  - Merge EPUBs and Beta View now labeled
  - Download EPUB also uses icon+label styling
3. **Web App Handoff Payload** - CSS is included with HTML for consistent rendering
4. **Toolbar Alignment** - Header content aligned to the left and spacing adjusted

### March 28, 2026 - Reading List Inline Title Editing

**Changes**:
1. **Inline Edit UX** - Added top-right pencil icon on each saved article card in side panel
  - Click enters in-card edit mode with input + Save/Cancel
  - Keyboard support: Enter (save), Escape (cancel)
2. **Persistence Consistency** - Added `updateArticleTitle` background message handler
  - Updates `chrome.storage.local.readingListMeta` title (side panel UI source)
  - Updates IndexedDB `savedArticles.title` (merged EPUB source)
3. **EPUB Integration** - Merged EPUB now uses edited titles for chapter headings and TOC labels

### March 28, 2026 - Merge & Send to X4 + Exclude Images

**Changes**:
1. **X4 Modal Workflow** - Added sidepanel action + modal for merged EPUB transfer to device
  - Editable EPUB name, firmware selector, IP input, connection refresh
  - Upload response preview panel for server output
2. **Device Upload Path** - Multipart upload to `POST /upload` with `file` field
  - Implemented adaptive timeout based on file size to support large EPUBs
3. **Exclude Images Toggle** - Added modal checkbox to regenerate image-free EPUB
  - File size updates live after regeneration
  - Setting is session-only (not persisted to storage)
4. **Concurrency Safety** - Added monotonic request-ID guarding for async regeneration
  - Stale completions cannot overwrite newer blob/UI state
  - Send/Download disabled only while latest regeneration is in-flight
  - Previous valid blob is retained on regeneration failure

---

## Future Enhancement Ideas

**Potential Features to Add**:
- [ ] Reader mode detection (auto-suggest when user lands on article)
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
| X4 modal workflow | sidepanel.js / sidepanel.html | X4 handlers + modal section |
| Exclude Images regeneration guards | sidepanel.js | `regenerateX4BlobForModal()` |

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

**Common gotchas**:
- Manifest V3 requires service workers, not background pages
- activeTab permission only active when user clicks toolbar
- Session storage has ~10MB limit
- Canvas conversion required for CORS images
- declarativeNetRequest rules need extension reload to update

---

**End of Document** - Last updated: March 28, 2026

