# ReadEasy Extension

A clean, distraction-free reading experience for Chrome. This extension extracts the main article content from web pages and displays it in a beautifully formatted reader view.

## Features


✨ **Clean Article Extraction** - Uses Mozilla's Readability library to intelligently extract main content  
🎨 **Multiple Themes** - Light, Sepia, and Dark themes  
📏 **Customizable Display** - Adjustable font size and content width  
🖼️ **Image Support** - Preserves article images with proper formatting  
📊 **Reading Progress** - Visual progress bar shows reading completion  
⌨️ **Keyboard Shortcuts** - Quick controls for better UX  
💾 **Persistent Preferences** - Remembers your theme and font settings  
⚡ **Flash It Speed Reading** - Three modes for faster reading (RSVP overlay, word highlight, line highlight)  
🗣️ **Text-to-Speech (TTS)** - Listen to articles with voice selection and synced line highlights  
📖 **EPUB Export** - Download articles as EPUB files for offline reading  
📧 **Email EPUB** - Email articles directly from the reader view  
📚 **Reading List & Side Panel** - Save up to 10 articles (with images) for later, manage and merge them in a native Chrome side panel  
🗂️ **EPUB Merge** - Combine multiple saved articles into a single EPUB with deduped images and valid XHTML  
💾 **IndexedDB Storage** - Full article HTML is stored locally for offline access and merging  
🖱️ **Floating Launcher** - Draggable webpage launcher with a two-option menu (**Switch to reading view** / **Open side panel**)  
⚙️ **Side Panel Settings** - In-panel settings for ReadEasy floater visibility (synced)  
🔐 **Optional Google Sign-In** - Side panel guest/avatar auth with extension-native Google identity flow  
🔗 **Beta View** - Send article HTML + styling to your web app via postMessage  

## Installation

### From Source (Developer Mode)

1. **Download or clone this repository** to your local machine

2. **Open Chrome** and navigate to `chrome://extensions/`

3. **Enable Developer Mode** by toggling the switch in the top-right corner

4. **Click "Load unpacked"** and select the extension directory

5. **The extension icon** should now appear in your Chrome toolbar


## How to Use

1. **Navigate to any article** or blog post in Chrome
2. **Click the Reader View extension icon** in the toolbar
3. **The article will open** in a new tab with clean formatting
4. **Customize your experience:**
   - Choose between Light, Sepia, or Dark themes
   - Adjust font size with +/- buttons or keyboard shortcuts
   - Toggle between normal and wide content width
   - View the original page with the "Original" link
   - Use Flash It speed reading for faster reading
   - Listen to the article with TTS (voice selection)
   - Download as HTML or EPUB for offline reading
   - Email EPUB files to yourself or others
   - **Add to Reading List**: Click "Add to List" to save the article (with images) for later
    - **Use the Floating Launcher**: On regular webpages, click the launcher to open menu actions:
       - **Switch to reading view**
       - **Open side panel**
   - **Open the Side Panel**: Use the extension context menu or after saving to view/manage your reading list
    - **Side Panel Settings**: Use the 3-dot menu in side panel header to open settings and enable/disable the floater
    - **Auth**: Use the side panel auth icon (guest/avatar) to sign in/out with Google
    - **Merge & Download EPUB**: In the side panel, click merge to open filename prompt modal before download
    - **Merge & Send to X4**: In the side panel, generate merged EPUB and send to local X4 device (with optional Exclude Images mode)
   - **Beta View**: Click to open in your web app reader view

## Keyboard Shortcuts

- `+` or `=` - Increase font size
- `-` - Decrease font size
- `F` - Toggle Flash It speed reading
- `Space` - Pause/Resume Flash It
- `R` - Restart Flash It from beginning
- `Esc` - Close reader view (or exit Flash It mode)


## File Structure

```
chrome-extension/
├── manifest.json          # Extension configuration (MV3)
├── background.js          # Service worker - extraction, IndexedDB, reading list, auth, floater broadcasts
├── content.js             # Content script - extracts article content
├── selection.js           # Declarative content script - Save Selection + floating launcher/menu
├── reader.html            # Reader view UI
├── reader.js              # Reader view functionality, Flash It, EPUB, add to list
├── reader.css             # Reader view styling
├── sidepanel.html         # Native Chrome side panel for reading list
├── sidepanel.js           # Side panel logic, list, settings, auth, EPUB merge/X4
├── sidepanel.css          # Side panel styling, themes, auth/settings/modal UI
├── db.js                  # IndexedDB wrapper (used by sidepanel)
├── rules.json             # declarativeNetRequest rules for image loading
├── libs/
│   ├── Readability.js     # Mozilla Readability library
│   └── jszip.min.js       # JSZip library for EPUB generation
└── icons/
   ├── icon16.png
   ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## Technical Details

### Architecture

- **Manifest V3** - Uses the latest Chrome extension architecture
- **Service Worker** - Background script handles toolbar clicks, auth, and cross-tab updates
- **Content Scripts** - `content.js` for extraction + `selection.js` for Save Selection/floater
- **Session Storage** - Passes extracted content to reader view

### Content Extraction

The extension uses **Mozilla Readability** - the same library powering Firefox Reader View. It:

- Analyzes the DOM structure
- Scores content blocks based on text density and patterns
- Extracts title, author, main content, and images
- Converts relative URLs to absolute URLs
- Handles lazy-loaded images
- Fixes Substack/Medium CDN image URLs
- Uses declarativeNetRequest to modify referrer headers for CORS-protected images

### Flash It Speed Reading

Three display modes for different reading preferences:

1. **RSVP Overlay** - Displays words one at a time in center of screen at 2x font size
2. **Word Highlight** - Highlights each word in the article with auto-scroll
3. **Line Highlight** - Highlights entire lines for faster comprehension

Features:
- Adjustable speed (100-1000 WPM)
- Adaptive timing based on word length and punctuation
- Pause/Resume/Restart controls
- Session persistence (remembers position)
- Keyboard shortcuts (F, Space, R)

### Text-to-Speech (TTS)

- Uses the browser’s built-in Web Speech API
- Voice selection from available system voices
- Line highlight syncs with spoken words during playback

### EPUB Generation

- Creates standards-compliant EPUB 3.0 files
- Embeds images using fetch + canvas PNG normalization for compatibility
- Includes article metadata (title, author, date)
- Handles HTML-encoded URLs (`&amp;` to `&`)
- Can be emailed directly from reader view

### Floating Launcher + Side Panel Settings

- `selection.js` injects a draggable launcher on regular webpages
- Click opens a two-option menu:
   - **Switch to reading view** (`openReaderView`)
   - **Open side panel** (`openSidePanel`)
- Position persists in `chrome.storage.sync.floatingButtonPosition`
- Visibility is controlled by `chrome.storage.sync.floatingButtonEnabled`
- Floater setting changes are propagated to open tabs immediately

### Optional Google Sign-In

- Side panel header contains an auth icon (guest/avatar)
- Uses `chrome.identity.getAuthToken()` + Google profile retrieval
- Normalized auth state is stored in `chrome.storage.sync.authState`
- Access tokens are kept in-memory in service worker (not persisted)

### Beta View

- Opens your web app and sends article HTML + CSS via `postMessage`
- Web app can render the same reader view formatting

### Security

- **HTML Sanitization** - Removes scripts and event handlers
- **Scoped Extension Permissions** - Uses Chrome extension APIs required for extraction, side panel, identity, and storage
- **CSP Compliant** - No inline scripts or eval
- **Safe URL Handling** - Validates and converts URLs safely

## Customization

### Themes

Three built-in themes with carefully chosen color schemes:
- **Light** - Classic white background
- **Sepia** - Warm, paper-like appearance
- **Dark** - Easy on the eyes in low light

### Font Sizes

Five preset font sizes from 16px to 24px for comfortable reading.

### Content Width

Toggle between normal (720px) and wide (960px) layouts.

## Browser Compatibility

- ✅ Chrome (Manifest V3)
- ✅ Edge (Chromium-based)
- ✅ Brave
- ✅ Other Chromium-based browsers

## Known Limitations

- Won't work on Chrome internal pages (`chrome://`)
- May not extract content well from:
  - Heavily JavaScript-rendered single-page apps
  - Paywalled content
  - Non-article pages (forums, dashboards)
- Does not bypass paywalls (by design)

## Troubleshooting

**Extension doesn't extract content:**
- Ensure you're on a standard article/blog page
- Some sites use non-standard layouts that don't work well
- Try refreshing the page and clicking again

**Images not showing:**
- Some sites use complex lazy-loading that may not be captured
- Check your internet connection

**Preferences not saving:**
- Ensure Chrome sync is enabled
- Check extension permissions

## Development

Want to contribute or modify the extension?

1. Make your changes to the source files
2. Reload the extension in `chrome://extensions/`
3. Test on various websites
4. Common test sites:
   - Medium articles
   - News sites (CNN, BBC, etc.)
   - Blog posts
   - Wikipedia

## Privacy

This extension:
- ✅ Processes all content locally
- ✅ Does not send data to external servers by default
- ✅ Only sends article HTML + CSS when you explicitly click "Beta View"
- ✅ Uses optional Google sign-in only when explicitly triggered
- ✅ Stores preferences locally using Chrome storage

## Credits

- **Mozilla Readability** - Article extraction library
- Inspired by Firefox Reader View and other reader extensions

## License

MIT License - Feel free to use and modify!

---

**Enjoy distraction-free reading! 📖**
