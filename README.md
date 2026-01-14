# Chrome Reader Extension

A clean, distraction-free reading experience for Chrome. This extension extracts the main article content from web pages and displays it in a beautifully formatted reader view.

## Features

✨ **Clean Article Extraction** - Uses Mozilla's Readability library to intelligently extract main content  
🎨 **Multiple Themes** - Light, Sepia, and Dark themes  
📏 **Customizable Display** - Adjustable font size and content width  
🖼️ **Image Support** - Preserves article images with proper formatting  
📊 **Reading Progress** - Visual progress bar shows reading completion  
⌨️ **Keyboard Shortcuts** - Quick controls for better UX  
💾 **Persistent Preferences** - Remembers your theme and font settings  

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

## Keyboard Shortcuts

- `+` or `=` - Increase font size
- `-` - Decrease font size
- `Esc` - Close reader view

## File Structure

```
chrome-extension/
├── manifest.json          # Extension configuration (MV3)
├── background.js          # Service worker - handles extension clicks
├── content.js            # Content script - extracts article content
├── reader.html           # Reader view UI
├── reader.js             # Reader view functionality
├── reader.css            # Reader view styling
├── libs/
│   └── Readability.js    # Mozilla Readability library
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## Technical Details

### Architecture

- **Manifest V3** - Uses the latest Chrome extension architecture
- **Service Worker** - Background script handles toolbar clicks
- **Content Script** - Runs on active tab to extract article content
- **Session Storage** - Passes extracted content to reader view

### Content Extraction

The extension uses **Mozilla Readability** - the same library powering Firefox Reader View. It:

- Analyzes the DOM structure
- Scores content blocks based on text density and patterns
- Extracts title, author, main content, and images
- Converts relative URLs to absolute URLs
- Handles lazy-loaded images

### Security

- **HTML Sanitization** - Removes scripts and event handlers
- **Minimal Permissions** - Uses `activeTab` for privacy
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
- ✅ Does not send data to external servers
- ✅ Only accesses the active tab when clicked
- ✅ Stores preferences locally using Chrome storage

## Credits

- **Mozilla Readability** - Article extraction library
- Inspired by Firefox Reader View and other reader extensions

## License

MIT License - Feel free to use and modify!

---

**Enjoy distraction-free reading! 📖**
