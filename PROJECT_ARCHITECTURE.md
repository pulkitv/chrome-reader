# ReadEasy Extension - Project Architecture & Development Guide

> **Purpose**: This document serves as a comprehensive guide for AI coding assistants (Codex, Cursor, GitHub Copilot, etc.) and developers to quickly understand the project structure, architecture, key features, and development patterns without reading the entire codebase.

> **Last Updated**: February 13, 2026

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

