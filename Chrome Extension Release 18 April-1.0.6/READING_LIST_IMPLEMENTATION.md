# Reading List & Merge EPUB Feature - Implementation Status (Current)

## ✅ Implementation Summary

Reading List, side panel management, and merged EPUB functionality are fully implemented and actively extended with settings, auth, and floater integrations.

> **Note:** This document originated in Feb 2026 and has been updated to reflect the current April 17, 2026 architecture.

## Core Files

1. **db.js** - IndexedDB wrapper with Promise-based interface
2. **sidepanel.html** - Side panel UI structure
3. **sidepanel.css** - Side panel styling with theme support
4. **sidepanel.js** - Side panel logic and EPUB merge functionality

## Key Modified Files (Current)

1. **manifest.json** - Includes `sidePanel`, `contextMenus`, `identity`, `oauth2`, content script registration for `selection.js`
2. **reader.html** - Added "Add to List" button to toolbar
3. **reader.js** - Add-to-list pipeline with robust image embedding and message listener
4. **reader.css** - Added notification toast styles
5. **background.js** - Save/delete/update handlers, reader-open path, auth handlers, floater setting rebroadcast
6. **selection.js** - Save Selection responder + draggable floating launcher with two-option menu
7. **sidepanel.html/css/js** - Settings page, auth icon/dropdown, merge modal mode reuse (download/send)

## Features Implemented

### 1. Side Panel UI (Native Chrome Right Panel)
- Fixed header with storage indicator (X/10 articles • YMB)
- Current article section (shows when on reader page)
- Scrollable list of saved articles (chronological, oldest first)
- Footer with "Merge & Download EPUB" and "Merge & Send to X4"
- Toast notifications for errors/success
- Header auth icon (guest/avatar) and account dropdown
- Header overflow menu with in-panel Settings page

### 2. Reading List Management
- **Add to List**: Converts images to embedded PNG data URLs via fetch + canvas pipeline
- **Storage**: IndexedDB for full HTML, chrome.storage.local for metadata
- **Limit**: 10 articles maximum (auto-deletes oldest when full)
- **Remove**: Delete individual articles from list
- **Edit title**: Inline pencil editor updates both metadata and IndexedDB title
- **Storage Indicator**: Shows count and estimated size in MB

### 3. EPUB Merging
- Fetches all saved articles from IndexedDB
- Deduplicates images across all articles
- Creates multi-chapter EPUB with auto-generated TOC
- Chapter titles: "Article Title (domain.com, MM/DD/YY)"
- Downloads as: `ReadEasy_Merged_YYYY-MM-DD.epub`
- Supports modal-based pre-download filename edit

### 4. Image Handling
- **20s timeout per image** via `AbortController`
- **PNG normalization** - Source formats (WebP/JPEG/AVIF/etc.) normalized to PNG data URLs
- **Resilient loading** - Uses `Promise.allSettled`; single-image failures do not block full article save
- **Safe replacement** - Uses `split+join` for URL replacement in HTML strings (avoids RegExp issues with base64)

### 5. State Synchronization
- **Tab changes**: Detects when user switches to/from reader pages
- **List updates**: Broadcasts to side panel when articles added/removed
- **Current article**: Shows in side panel when on reader view
- **Floater setting sync**: `floatingButtonEnabled` changes propagate live across open tabs

### 6. Floating Launcher Integration
- Draggable launcher appears on regular webpages (when enabled)
- Click opens two-option menu:
       - **Switch to reading view** (`openReaderView`)
       - **Open side panel** (`openSidePanel`)
- Position persists in sync storage (`floatingButtonPosition`)

### 7. Optional Google Sign-In Integration
- Side panel supports sign-in/sign-out via `chrome.identity`
- Auth state stored in sync as normalized object (`authState`)
- Access token remains in-memory in background service worker

## How to Use

### Opening the Side Panel
- **Right-click** extension icon → "Open Reading List"
- Side panel appears on the **right side** of Chrome window (native UI)

### Adding Articles to List
1. Open any article in ReadEasy reader view
2. Click **"Add to List"** button in toolbar (bottom row, right side)
3. Wait for images to load (up to 20s per image)
4. Success notification appears: "Added to Reading List ✓"
5. Article disappears from current article section (already saved)
6. Open side panel to see saved article in list

### Removing Articles
1. Open side panel (right-click extension icon)
2. Find article in list
3. Click **"Remove"** button on article card
4. Article removed from list and storage

### Merging & Downloading EPUB
1. Open side panel
2. Ensure you have saved articles (button disabled if list empty)
3. Click **"Merge & Download EPUB"** button
4. Enter/confirm filename in modal
5. Wait for EPUB generation
6. File downloads as `ReadEasy_Merged_YYYY-MM-DD.epub`

### Merge & Send to X4
1. Open side panel
2. Click **"Merge & Send to X4"**
3. Configure filename, firmware, and device IP in modal
4. (Optional) Toggle **Exclude Images** to regenerate smaller EPUB
5. Send to device or download from the same modal

## Testing Checklist

- [ ] Load extension in Chrome (`chrome://extensions/` → Load unpacked)
- [ ] Extract an article using extension icon
- [ ] Click "Add to List" button in reader view
- [ ] Verify article saves even if one remote image fails
- [ ] Verify success notification appears
- [ ] Right-click extension icon → "Open Reading List"
- [ ] Verify article appears in side panel list
- [ ] Verify storage indicator shows correct count
- [ ] Add another article to list
- [ ] Verify list shows both articles (oldest first)
- [ ] Click "Remove" on an article
- [ ] Verify article removed from list
- [ ] Add at least 2-3 articles
- [ ] Click "Merge & Download EPUB"
- [ ] Verify EPUB downloads
- [ ] Open EPUB in reader (Apple Books, Calibre, etc.)
- [ ] Verify all chapters present with correct TOC
- [ ] Verify images display in EPUB
- [ ] Test adding 10th article (should auto-delete oldest)
- [ ] Test floater disable/enable from settings across open tabs
- [ ] Test floater click menu actions (reader view + side panel)
- [ ] Test auth sign-in/sign-out in side panel header

## Storage Details

### IndexedDB (`ReadEasyDB`)
- **Database**: `ReadEasyDB` version 1
- **Store**: `savedArticles`
- **Schema**: `{id: auto, title, url, siteName, addedDate, htmlContent}`
- **Indexes**: `addedDate`, `url`
- **Estimated size**: 2-5MB per article with embedded images

### chrome.storage.local
- **Key**: `readingListMeta`
- **Value**: Array of metadata objects
- **Schema**: `[{id, title, url, siteName, addedDate}]`
- **Size**: ~5KB for 10 articles

## Architecture Notes

### Data Flow
```
Reader View → Add to List
           ↓
    Preload & Convert Images (20s timeout, per image)
           ↓
    Send to Background Script
           ↓
    Save to IndexedDB + storage.local
           ↓
    Broadcast update to Side Panel
           ↓
    Side Panel refreshes list
```

### EPUB Merge Flow
```
Side Panel → Click Merge
         ↓
  Fetch all articles from IndexedDB
         ↓
  Extract & deduplicate all images
         ↓
  Create XHTML chapters
         ↓
  Generate content.opf, toc.ncx, nav.xhtml
         ↓
  Package with JSZip
         ↓
  Download EPUB
```

## Error Handling

- **Image timeout**: Timed-out images are skipped; article save can still succeed
- **IndexedDB quota**: Shows error toast
- **EPUB generation failure**: Shows error toast, re-enables button
- **Network errors**: Caught and displayed in toast
- **Storage errors**: Logged to console, shown in toast

## Known Limitations

1. **10 article limit** - Hard-coded, can be increased if needed
2. **Image timeout**: 10s per image may not be enough for very slow connections
3. **Storage size**: IndexedDB quota varies by browser/disk space
4. **No cloud sync**: Articles stored locally only
5. **No custom ordering**: List remains chronological
6. **Auth is optional only**: Sign-in exists, but reading-list content is not cloud-synced

## Next Steps (Future Enhancements)

- [ ] Increase article limit (configurable in settings)
- [ ] Add "Clear All" button to empty list
- [ ] Add progress indicator during image loading
- [ ] Add article preview in side panel
- [ ] Add search/filter in side panel
- [ ] Add manual reordering (drag-and-drop)
- [ ] Add checkboxes to select which articles to merge
- [ ] Add export options (JSON, HTML)
- [ ] Add statistics (total articles saved, total size)

## Troubleshooting

### Side panel doesn't open
- Check if extension icon is visible
- Try reloading extension
- Check for errors in service worker console

### Images not loading
- Check Network tab in DevTools
- Verify 10s timeout is sufficient
- Check if images are CORS-protected

### EPUB generation fails
- Check if JSZip library loaded
- Verify articles exist in IndexedDB
- Check console for errors

### Storage indicator shows 0MB
- Refresh side panel
- Check if articles actually saved
- Verify IndexedDB contains data

---

**Initial Implementation Date**: February 28, 2026
**Last Updated**: April 17, 2026
**Status**: ✅ Complete, extended, and in active use
