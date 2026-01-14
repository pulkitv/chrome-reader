# Testing Checklist - Chrome Reader Extension

## Installation Test

- [ ] Extension loads without errors in `chrome://extensions/`
- [ ] Extension icon appears in toolbar
- [ ] No console errors in background page

## Basic Functionality

- [ ] Click extension icon on an article page
- [ ] New tab opens with reader view
- [ ] Article title is displayed correctly
- [ ] Article content is extracted and readable
- [ ] Images are displayed (if present in original)
- [ ] Original page link works

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
