# ReadEasy v2.0.1 — Release Notes

---

## New Features in v2.0.1

**Auto-save to Reading List**
Articles are silently saved to the reading list when you open reader view — no manual action needed.

**"Open Side Panel" button**
The old "Add to List" button is repurposed as a direct shortcut to open the side panel from the reader.

**Side Panel close button (✕)**
A close button in the sidepanel header lets you dismiss it. The closed/open state is persisted — the panel won't auto-reopen if you explicitly closed it.

**Smart content-based deduplication**
Same URL + same text → skipped. Same URL but different content (updated article) → saved as a new entry.

**ChatGPT conversation extractor**
Opening a ChatGPT conversation in reader view now extracts the full conversation — all turns, stripped of UI chrome, with images and code blocks normalized.

**Right-click "ReadEasy Reader View"**
A new context menu item lets you trigger reader view on any page, selection, or link via right-click.

**Fixes**
- Reader auth button first-load rendering — avatar and guest icon now render correctly on first paint.
- Google CDN avatar fallback — expired Google profile picture URLs no longer break the auth button.
- Floater re-injection on re-enable — prevented duplicate floating launchers on already-open tabs.

---

## Chrome Web Store — Permission Justifications

**activeTab**
Required to access the current page after a user action so we can extract article content for Reader View without persistent background access.

**scripting**
Needed to inject the article extraction script into the current tab when the user opens Reader View or adds the current page to the Reading List from the side panel.

**storage**
Used to store reader preferences (theme, font size, width), floater settings, signed-in user state, X4 device settings, temporary current-article data and user edits in session storage, Reading List metadata, side panel open/close state, and saved article HTML in IndexedDB for EPUB and PDF export.

**identity**
Used only for optional Google sign-in in the side panel. We store a minimal signed-in state (email/name/profile image) so future user-specific features can be associated with the signed-in account. Authentication is user-initiated.

**declarativeNetRequest**
Used to set safe Referer headers for selected CDN image requests (including Facebook/Instagram CDNs) so images load correctly in Reader View, Reading List saves, and EPUB generation.

**sidePanel**
Used to show the ReadEasy side panel where users can view and manage saved articles, save selected text, configure settings, optionally sign in, edit article content, merge/download EPUBs, create merged PDFs, and use Merge & Send to X4. The panel auto-opens alongside Reader View for quick access and can be dismissed with a close button; the dismissed state is persisted.

**contextMenus**
Used to add two context menu entries: one to open the ReadEasy side panel from any page, and one to open the current page, selection, or link directly in ReadEasy Reader View.

**Host permission**
Required for four features on webpages: (1) extracting article content — including ChatGPT conversations — for Reader View and Add to List actions, (2) showing the optional ReadEasy floater launcher and opening its menu actions, (3) processing user-selected text only when the user explicitly clicks Save Selection in the side panel, and (4) fetching and embedding cross-origin article/CDN images for Reading List and EPUB generation.
