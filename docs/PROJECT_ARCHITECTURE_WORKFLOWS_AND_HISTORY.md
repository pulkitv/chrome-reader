
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

**End of Document** - Last updated: April 18, 2026

