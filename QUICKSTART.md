# Quick Start Guide - Chrome Reader Extension

## Installation Steps

1. **Open Chrome Extensions Page**
   - Navigate to: `chrome://extensions/`
   - Or: Menu → Extensions → Manage Extensions

2. **Enable Developer Mode**
   - Toggle the switch in the top-right corner

3. **Load the Extension**
   - Click "Load unpacked"
   - Select this folder: `/Users/pulkit.vashishta/Downloads/chrome-extension`

4. **Pin the Extension (Optional)**
   - Click the puzzle icon in Chrome toolbar
   - Pin the Chrome Reader extension for easy access

## Test It Out

Try these websites to test the extension:

- **Medium Articles**: https://medium.com
- **News Sites**: CNN, BBC, The Guardian
- **Blog Posts**: Any WordPress or standard blog
- **Wikipedia**: https://en.wikipedia.org

## Usage

1. Navigate to an article
2. Click the Chrome Reader icon (blue book icon)
3. Article opens in a new tab with clean formatting

## Controls

**Themes**: Click A buttons at the top (Light/Sepia/Dark)  
**Font Size**: Use +/- buttons or keyboard +/- keys  
**Width**: Toggle button for normal/wide layout  
**Original**: Link to return to source page  

## Troubleshooting

**Icon not showing?**
- Refresh the extensions page
- Check that all files are present

**Not extracting content?**
- Ensure you're on an article page (not homepage)
- Some sites with complex layouts may not work
- Try a different article

**No images?**
- Images are included automatically
- Check that the source page has images

## File Checklist

Ensure these files exist:
- ✅ manifest.json
- ✅ background.js
- ✅ content.js
- ✅ reader.html
- ✅ reader.js
- ✅ reader.css
- ✅ libs/Readability.js
- ✅ icons/ (with PNG files)

## Next Steps

- Customize themes in reader.css
- Modify extraction logic in content.js
- Add new features to reader.js
- Test on various websites

Enjoy! 📖
