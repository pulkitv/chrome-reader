# Testing Checklist - ReadEasy Extension

## Installation Test

- [ ] Extension loads without errors in `chrome://extensions/`
- [ ] Extension icon appears in toolbar
- [ ] No console errors in background service worker
- [ ] Side panel opens successfully

## Basic Functionality

- [ ] Click extension icon on an article page
- [ ] New tab opens with reader view
- [ ] Article title is displayed correctly
- [ ] Article content is extracted and readable
- [ ] Images are displayed (if present in original)
- [ ] Original page link works
- [ ] Reader opens from floating launcher menu action (**Switch to reading view**)
- [ ] Side panel opens from floating launcher menu action (**Open side panel**)

## Theme Tests

- [ ] Light theme displays correctly
- [ ] Sepia theme displays correctly
- [ ] Dark theme displays correctly
- [ ] Theme preference is saved
- [ ] Theme persists after closing and reopening

## Font Size Tests

- [ ] Increase font size button works
- [ ] Decrease font size button works
- [ ] Keyboard shortcuts (+/-) work
- [ ] Font size preference is saved
- [ ] Cannot go below minimum size
- [ ] Cannot go above maximum size

## Layout Tests

- [ ] Width toggle button works
- [ ] Normal width displays correctly
- [ ] Wide width displays correctly
- [ ] Width preference is saved
- [ ] Responsive on mobile/tablet sizes

## Content Tests

- [ ] Headings are properly formatted
- [ ] Paragraphs have correct spacing
- [ ] Links are clickable and styled
- [ ] Lists (ordered/unordered) display correctly
- [ ] Blockquotes are styled
- [ ] Code blocks are monospaced
- [ ] Tables display correctly (if present)
- [ ] Images scale properly
- [ ] No script tags execute

## URL Handling

- [ ] Relative URLs converted to absolute
- [ ] Image URLs work correctly
- [ ] Link URLs work correctly
- [ ] srcset attributes handled
- [ ] data-src lazy loading handled

## Progress Bar

- [ ] Progress bar appears at top
- [ ] Progress updates as you scroll
- [ ] Progress reaches 100% at bottom
- [ ] Progress bar styled correctly in all themes

## Edge Cases

- [ ] Works on HTTPS sites
- [ ] Works on HTTP sites
- [ ] Handles pages without images
- [ ] Handles very long articles
- [ ] Handles very short articles
- [ ] Gracefully fails on non-article pages
- [ ] Shows error message if extraction fails
- [ ] Cannot run on chrome:// pages
- [ ] Cannot run on extension pages

## Side Panel & Reading List

- [ ] Side panel shows current article card on `reader.html`
- [ ] Side panel shows Save Selection section on regular `http/https` pages
- [ ] Add to List from reader tab works
- [ ] Add to List from regular webpage tab works
- [ ] Save Selection stores highlighted text as a new reading-list item
- [ ] Repeated Save Selection from same page creates unique entries
- [ ] Inline title edit (pencil icon) updates card title and persists
- [ ] Remove from list works and refreshes UI
- [ ] Reading list cap behavior (10 items) evicts oldest item

## Floating Launcher & Settings

- [ ] Floater appears by default on regular webpages
- [ ] Floater is draggable and position persists after refresh/tab switch
- [ ] Floater click opens menu near launcher (not top-left)
- [ ] Menu closes on outside click and `Esc`
- [ ] Disable `ReadEasy Floater` in side panel settings hides launcher immediately on open tabs
- [ ] Re-enable `ReadEasy Floater` restores launcher immediately on open tabs

## Auth (Optional Google Sign-In)

- [ ] Signed-out state shows guest icon
- [ ] Sign-in flow opens Google auth and returns to signed-in avatar state
- [ ] Auth dropdown shows profile name/email/avatar
- [ ] Sign-out resets to guest state
- [ ] Auth state persists after side panel reopen

## Keyboard Shortcuts

- [ ] ESC closes reader view
- [ ] + increases font
- [ ] = increases font
- [ ] - decreases font

## Recommended Test Sites

### News Articles
- [ ] CNN article
- [ ] BBC article
- [ ] The Guardian article
- [ ] New York Times article

### Blog Posts
- [ ] Medium article
- [ ] WordPress blog post
- [ ] Dev.to article
- [ ] Substack newsletter

### Technical Content
- [ ] Wikipedia article
- [ ] Documentation page
- [ ] Tutorial/how-to article
- [ ] GitHub blog post

### Edge Cases to Test
- [ ] Page with lazy-loaded images
- [ ] Page with embedded videos
- [ ] Page with complex layouts
- [ ] Single-page application
- [ ] Paywall page (should show available content)

## Merge & Export Flows

- [ ] Merge & Download EPUB opens filename modal before download
- [ ] Download from modal produces merged EPUB
- [ ] Merge & Send to X4 opens send-mode modal
- [ ] Exclude Images toggle regenerates file size and keeps UI responsive
- [ ] Send to X4 handles connection check and upload response states

## Performance Tests

- [ ] Extraction completes quickly (< 2 seconds)
- [ ] No noticeable lag when scrolling
- [ ] No memory leaks after multiple uses
- [ ] Smooth theme transitions
- [ ] Smooth font size changes

## Browser Tests (if applicable)

- [ ] Works in Chrome
- [ ] Works in Edge
- [ ] Works in Brave
- [ ] Works in other Chromium browsers

## Security Tests

- [ ] JavaScript from pages doesn't execute
- [ ] Event handlers are removed
- [ ] iframes are converted to links or removed
- [ ] No XSS vulnerabilities
- [ ] No console errors about CSP violations
- [ ] Google auth token is not persisted in storage (in-memory only)

## Cleanup

- [ ] Close button works
- [ ] Session storage is cleaned up
- [ ] No orphaned tabs
- [ ] Preferences persist across sessions

---

## Bug Report Template

If you find issues, document them:

**Issue**: [Brief description]  
**Steps to Reproduce**:
1. 
2. 
3. 

**Expected**: [What should happen]  
**Actual**: [What actually happened]  
**URL**: [Test page URL]  
**Browser**: [Chrome version]  
**Console Errors**: [Any error messages]

---

**Testing completed**: _____ / _____ / _____  
**Tested by**: _______________
