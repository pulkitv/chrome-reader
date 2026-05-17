# Sprint 2026-05 (Part 2) — Reader Edit Mode, Toolbar Expansion, and PDF Merge

## Sprint goal
Add a full in-reader content editing capability so users can modify article text, add formatting, insert note callouts, images, and hyperlinks before saving or exporting. Also add a "Merge & Create PDF" action to the sidepanel reading list footer.

## Why this sprint existed
- Users had no way to annotate or modify article content inside the reader view — all edits required going back to the source page.
- The note callout block needed horizontal separators so its boundaries were clearly visible in both the reader and EPUB exports.
- The existing bullet-list toolbar had no numbered list counterpart, and there was no way to insert a plain horizontal rule.
- The link-insert toolbar was silently broken: applying a link did nothing because `closeLinkPopover()` nulled `savedLinkRange` before `applyLink()` could use it.
- Users wanted a way to produce a merged, print-ready document from the reading list — parallel to the EPUB merge, but for PDF.

## Major initiatives delivered

### 1) Full reader edit mode

**Why**
- Reading list content is static; users had no way to correct extraction errors, trim unwanted sections, or add personal commentary before saving or exporting.

**What was built**
- `#editBtn` — pastel yellow button in the reader header secondary row; visually distinct from other nav actions
- `#editToolbar` — fixed bar rendered below the main header when `body.edit-mode` is active, containing:
  - Bold / Italic / Underline (toggle via `document.execCommand`)
  - Font color (native `<input type="color">`)
  - Font size (select, 12–36 px, implemented with a `fontSize('7')` marker + inline-style conversion to bypass execCommand's 1–7 scale)
  - Align Left / Center / Right
  - Bullet list (unordered)
  - Numbered list (ordered) ← new
  - Horizontal rule insert ← new
  - Insert Note callout block
  - Insert Image (FileReader → base64 data URL → `execCommand('insertHTML')`)
  - Insert / Edit Link (link popover)
  - Save and Cancel buttons
- `enterEditMode()` — makes `#articleTitle`, `#articleByline`, and `#articleBody` all `contenteditable="true"`; snapshots all three for Cancel revert; strips `contenteditable="false"` from extracted child nodes and removes `user-select: none` / `pointer-events: none` inline styles that blocked cursor placement; uses `requestAnimationFrame` + `{ preventScroll: true }` for reliable cursor placement on long articles
- `exitEditMode(save)` — on Save: persists `bodyEl.innerHTML` to `currentArticle.content` in `chrome.storage.session`; on Cancel: restores all three snapshots; always calls `closeLinkPopover()`
- `execFormatCmd(cmd, value)` — thin wrapper around `document.execCommand` operating on the currently active contenteditable element
- `applyFontSize(px)` — uses `fontSize('7')` as a marker, then immediately converts all `<font size="7">` elements to inline `style.fontSize` in px
- `insertHorizontalRule()` — `execCommand('insertHTML')` with `<hr><p><br></p>` so the cursor lands after the rule
- `insertImageAtCursor(file)` — FileReader reads file as data URL, inserts `<img>` via `execCommand('insertHTML')`
- `updateToolbarState()` — 30 ms debounced on `selectionchange`; reflects B/I/U active state via `document.queryCommandState()`
- Keydown guard: suppresses Flash It and font shortcuts while `isEditMode` is true (except Escape)
- CSS: `#editBtn` uses `background-color: #fef9c3` (pastel yellow); focus rings on all three contenteditable regions; `#articleBody[contenteditable] * { user-select: text !important; pointer-events: auto !important; }` overrides extraction-injected blocking styles

**Detail**
- `document.execCommand()` is deprecated per web spec but remains the only viable in-browser formatting API without an external library; it works correctly in Chrome extension contexts
- Title and byline are contenteditable alongside the body, giving users a unified editing experience
- Edit mode is session-only: refreshing the reader tab starts fresh from the original extraction; no persistent annotation store is implemented
- `mousedown` → `preventDefault()` on the entire `#editToolbar` prevents toolbar button clicks from stealing focus and collapsing the active text selection; carve-outs exist for `<select>`, color `<input>`, and the Save/Cancel buttons

---

### 2) Note callout blocks with horizontal separators

**Why**
- The note callout block (`div.note-block`) was visually isolated by its yellow background and blue left border in the reader, but it lacked structural separators — making it hard to tell where a note began and ended in dense text, and making it invisible as a distinct block in EPUB exports.

**What was built**
- `insertNoteBlock()` now inserts `<hr class="note-sep">` above and below the `div.note-block`, followed by an empty paragraph for cursor landing
- `hr.note-sep` styled in `reader.css`: `border-top: 2px solid var(--link-color); opacity: 0.6; margin: 20px 0`
- EPUB transformation in `downloadArticleEPUB()`:
  - `hr.note-sep` elements are inline-styled for EPUB readers
  - `.note-block` divs are converted to `<blockquote>` elements with `border-left: 5px solid #0066cc` and `background: linear-gradient(to right, #fffde7, #fffde7)` (gradient avoids Apple Books' override of `background-color`)
  - If adjacent `hr.note-sep` siblings exist, the `<blockquote>` replaces the `div` directly; if absent (legacy notes), `<p>` border elements are added as separator fallbacks
  - `class` attribute stripped from `hr.note-sep` after transformation (no reader.css in EPUB context)

**Detail**
- The gradient background approach is specifically required for Apple Books compatibility — Apple Books overrides `background-color` with its reading theme but does not override CSS gradient backgrounds
- The 65% single-character threshold in `removeScrambledDates()` (FB extraction, separate path) has no interaction with this feature

---

### 3) Link popover bug fix and `https://` pre-fill

**Why**
- The link insert toolbar button opened a popover correctly, but clicking Apply did nothing — the link was never applied to the selected text.
- Root cause: `applyLink()` called `closeLinkPopover()` first, which set `savedLinkRange = null`, then immediately checked `if (!savedLinkRange)` — always returning early. Same bug existed in `unlinkSelection()`.
- Additionally, the URL input opened empty, so users had to type the full `https://` prefix every time.

**What was built**
- `applyLink()` — now captures `const range = savedLinkRange` before calling `closeLinkPopover()`, uses `range` for selection restoration and `execCommand('createLink')`; treats bare `'https://'` as a no-op
- `unlinkSelection()` — same pattern: captures `const range = savedLinkRange` before close
- `openLinkPopover()` — URL input now pre-filled with `'https://'` (not empty string) when no existing link is detected; pre-fills the existing `href` when cursor is already inside an `<a>` tag
- All created links have `target="_blank"` and `rel="noopener"` applied automatically after `createLink`

**Detail**
- `closeLinkPopover()` itself is unchanged: it hides the popover and nulls `savedLinkRange`. The fix is purely in the call order in `applyLink` and `unlinkSelection`.

---

### 4) Numbered list and horizontal rule toolbar buttons

**Why**
- The edit toolbar had a bullet list (unordered) button but no numbered list counterpart, creating an asymmetry for users writing structured notes or numbered steps.
- There was no way to insert a plain horizontal rule (separate from note separators) inside the article body.

**What was built**
- `#editNumberedList` button — SVG icon showing 1/2/3 labels with ruled lines; wired to `execFormatCmd('insertOrderedList')` which toggles an `<ol>` list just as the bullet button toggles `<ul>`
- `#editInsertHR` button — SVG icon showing a bold center line; wired to `insertHorizontalRule()` which uses `execCommand('insertHTML', false, '<hr><p><br></p>')`
- Both buttons placed between the existing bullet list button and the note insert separator in the toolbar
- Plain `<hr>` (without `.note-sep` class) is already styled in `reader.css` (`.article-body hr { border-top: 1px solid var(--border-color); margin: 3em 0; }`)

---

### 5) Sidepanel "Merge & Create PDF"

**Why**
- Users wanted a way to merge all reading list articles into a single printable document, parallel to the EPUB merge — without requiring an external tool.
- True programmatic PDF generation (without a library) is not available in the browser; the cleanest approach is to produce a print-ready HTML document that Chrome's Save as PDF dialog can process.

**What was built**
- `sidepanel/pdf-build.js` (new module) — exports `handleMergePDF()`
  - Fetches all saved articles via `getAllArticles()`
  - Calls `buildMergedPrintHTML(articles)` to generate a styled HTML document with a cover page, table of contents, and all article sections with page-break CSS
  - Opens a blob URL (`URL.createObjectURL`) in a new tab via `window.open()`
  - The new tab's `<script>` calls `window.addEventListener('load', () => window.print())` — Chrome's print dialog opens automatically with "Save as PDF" as the default destination on most systems
  - Blob URL is revoked after 90 seconds to release memory
- `#mergePdfBtn` button added to `sidepanel.html` footer (`.btn-pdf` class, red `#c0392b`)
- `.btn-pdf` CSS added to `sidepanel.css`
- Button enable/disable wired into `reading-list-render.js` alongside the existing EPUB and X4 buttons
- Event listener wired in `sidepanel.js`; `handleMergePDF` imported from the new module
- Print HTML features: Georgia serif font, cover page, TOC with anchor links, per-article page breaks, note-block and hr.note-sep styling, `@media print` rules

**Detail**
- No third-party PDF library is bundled — the blob HTML approach produces full-fidelity output (images, fonts, colors) that jsPDF text extraction cannot match
- Button label is "Merge & Create PDF" (not "Download PDF") to accurately reflect that the user completes the save via Chrome's print dialog
- The button is red to visually distinguish it from the green EPUB button and blue X4 button

---

## Sprint outcomes
- Users can now enter a full edit mode in the reader and modify titles, bylines, and body content with rich formatting
- Notes inserted in edit mode are clearly delineated by horizontal separators in both reader and EPUB
- Numbered lists and horizontal rules are available as first-class toolbar actions
- The link-insert toolbar button now correctly applies links to selected text (was silently broken)
- All reading list articles can be merged into a single print-ready page and saved as PDF via Chrome's print dialog
- The Donate button was renamed "Buy me coffee" (accurate to the link destination) and its gold gradient styling was removed
- Edit mode is session-only by design: no persistent annotation store is needed at this stage

## Risks discovered during sprint
- `document.execCommand()` is deprecated per web spec but has no usable replacement in Chrome extension contexts; will need to monitor Chrome platform announcements for deprecation timelines
- The `caretRangeFromPoint()` API used for cursor placement is also flagged as deprecated in TypeScript types but remains functional in Chrome; same monitoring applies
- Apple Books and other EPUB readers vary in which CSS properties they honor; the gradient background workaround for note blocks may need updating if Apple Books changes its override behavior
- The blob URL approach for PDF preview requires `window.open()` to succeed from the sidepanel context; popup blockers in non-extension contexts could interfere (not an issue here since sidepanel is a trusted extension page)

## Follow-ups for next sprint
- [ ] Test edit mode on articles with heavily nested or complex HTML (tables, nested iframes)
- [ ] Consider persisting edit mode content to IndexedDB so edits survive a tab refresh
- [ ] Test numbered list and HR in EPUB export to confirm they render correctly in Apple Books and Kindle
- [ ] Add a "Clear formatting" button to the edit toolbar for removing inline styles
- [ ] Consider adding heading insertion (H2/H3) to the edit toolbar for structuring notes
- [ ] Test "Merge & Create PDF" with very long reading lists (10 articles with images) for performance
- [ ] Monitor if Chrome removes `execCommand` support and plan migration to Selection/Range API if needed

## Metadata
- Sprint window: 2026-05-01 to 2026-05-31
- Owner(s): Pulkit Vashishta
- Status: completed
- Last updated: 2026-05-17
