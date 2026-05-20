/**
 * reader/edit-mode.js — In-reader edit toolbar: formatting, links, notes, images.
 *
 * Exports:
 *   enterEditMode()         — snapshot content, make article editable, show toolbar
 *   exitEditMode(save)      — commit or revert edits; hide toolbar
 *   execFormatCmd(cmd, val) — thin wrapper around document.execCommand
 *   applyFontSize(px)       — apply an explicit pixel font size to the selection
 *   insertNoteBlock()       — insert a styled callout block at the cursor
 *   insertHorizontalRule()  — insert an <hr> at the cursor
 *   updateToolbarState()    — sync Bold/Italic/Underline active states to selection
 *   insertImageAtCursor(f)  — read a File and insert it as an inline <img>
 *   openLinkPopover()       — show the link URL popover (pre-filled if inside a link)
 *   applyLink()             — wrap the saved selection in an <a> tag
 *   unlinkSelection()       — remove the <a> wrapping the saved selection
 *   closeLinkPopover()      — hide the link popover and clear the saved range
 */

/* global chrome */

import { state }            from './state.js';
import { showNotification } from './article.js';

// ── Enter / exit edit mode ────────────────────────────────────────────────────

/**
 * Activate edit mode:
 * — Snapshots title, byline, and body HTML for cancel-revert.
 * — Makes all three elements contenteditable.
 * — Strips any contenteditable="false" islands and pointer-events/user-select
 *   overrides that would block cursor placement inside extracted content.
 * — Adds body.edit-mode to show the toolbar via CSS.
 */
export function enterEditMode() {
  if (state.isEditMode) return;
  state.isEditMode = true;

  const titleEl  = document.getElementById('articleTitle');
  const bylineEl = document.getElementById('articleByline');
  const bodyEl   = document.getElementById('articleBody');

  // Snapshot all three for cancel-revert
  state.preEditTitle   = titleEl.innerHTML;
  state.preEditByline  = bylineEl.innerHTML;
  state.preEditContent = bodyEl.innerHTML;

  titleEl.setAttribute('contenteditable',  'true');
  bylineEl.setAttribute('contenteditable', 'true');
  bodyEl.setAttribute('contenteditable',   'true');

  // Extracted HTML sometimes contains contenteditable="false" on child elements
  // (non-editable islands) and inline styles that hide the caret. Strip both.
  bodyEl.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  bodyEl.querySelectorAll('*').forEach(el => {
    const s = el.style;
    if (s.userSelect === 'none' || s.webkitUserSelect === 'none') {
      s.userSelect = '';
      s.webkitUserSelect = '';
    }
    if (s.pointerEvents === 'none') s.pointerEvents = '';
  });

  document.body.classList.add('edit-mode');

  // Defer focus so the browser finishes processing contenteditable before
  // we place the caret — avoids an invisible-caret race on long articles.
  requestAnimationFrame(() => {
    titleEl.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(titleEl);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
}

/**
 * Deactivate edit mode.
 * @param {boolean} save — if true, persist edits to session storage; otherwise revert.
 */
export function exitEditMode(save) {
  if (!state.isEditMode) return;
  state.isEditMode = false;

  const titleEl  = document.getElementById('articleTitle');
  const bylineEl = document.getElementById('articleByline');
  const bodyEl   = document.getElementById('articleBody');

  if (save) {
    // Persist edits so downstream actions (EPUB, Add to List) see the new content
    chrome.storage.session.get('currentArticle').then(({ currentArticle }) => {
      if (currentArticle) {
        currentArticle.title   = titleEl.textContent.trim();
        currentArticle.byline  = bylineEl.textContent.trim();
        currentArticle.content = bodyEl.innerHTML;
        chrome.storage.session.set({ currentArticle });
      }
    });
    showNotification('Article saved', 'success');
  } else {
    // Revert to the snapshots taken in enterEditMode
    titleEl.innerHTML  = state.preEditTitle;
    bylineEl.innerHTML = state.preEditByline;
    bodyEl.innerHTML   = state.preEditContent;
  }

  titleEl.removeAttribute('contenteditable');
  bylineEl.removeAttribute('contenteditable');
  bodyEl.removeAttribute('contenteditable');
  document.body.classList.remove('edit-mode');
  closeLinkPopover();
}

// ── Formatting commands ───────────────────────────────────────────────────────

/**
 * Execute a document.execCommand formatting command.
 * Does NOT force-focus #articleBody so commands apply to whichever
 * contenteditable element (title / byline / body) currently has focus.
 */
export function execFormatCmd(cmd, value) {
  document.execCommand(cmd, false, value !== undefined ? value : null);
  updateToolbarState();
}

/**
 * Apply an explicit pixel font size to the current selection.
 * execCommand('fontSize') only accepts 1–7 HTML size values, so we use 7
 * as a placeholder and immediately convert the resulting <font size="7">
 * elements to inline font-size styles.
 */
export function applyFontSize(px) {
  document.execCommand('fontSize', false, '7');
  document.querySelectorAll('font[size="7"]').forEach(el => {
    el.removeAttribute('size');
    el.style.fontSize = px + 'px';
    // Unwrap the <font> if it has no remaining attributes
    if (!el.attributes.length) el.replaceWith(...el.childNodes);
  });
}

/**
 * Insert a styled note/callout block at the current cursor position.
 */
export function insertNoteBlock() {
  document.getElementById('articleBody').focus();
  const html = '<hr class="note-sep"><div class="note-block"><strong>📝 Note</strong><br>Type your note here…</div><hr class="note-sep"><p><br></p>';
  document.execCommand('insertHTML', false, html);
}

/**
 * Insert a horizontal rule at the current cursor position.
 */
export function insertHorizontalRule() {
  document.getElementById('articleBody').focus();
  document.execCommand('insertHTML', false, '<hr><p><br></p>');
}

/**
 * Reflect the active Bold / Italic / Underline state of the current selection
 * onto the corresponding toolbar buttons (.active class).
 * No-ops when not in edit mode to avoid redundant queryCommandState calls.
 */
export function updateToolbarState() {
  if (!state.isEditMode) return;
  document.getElementById('editBold').classList.toggle('active',      document.queryCommandState('bold'));
  document.getElementById('editItalic').classList.toggle('active',    document.queryCommandState('italic'));
  document.getElementById('editUnderline').classList.toggle('active', document.queryCommandState('underline'));
}

// ── Image insertion ───────────────────────────────────────────────────────────

/**
 * Read a File object (from <input type="file">) and insert it as an
 * inline data-URL <img> at the current cursor position.
 */
export function insertImageAtCursor(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = `<img src="${e.target.result}" alt="${file.name.replace(/"/g, '')}" style="max-width:100%;height:auto;margin:1em 0;display:block;">`;
    document.execCommand('insertHTML', false, img);
  };
  reader.readAsDataURL(file);
}

// ── Link popover ──────────────────────────────────────────────────────────────

/**
 * Show the link URL popover.
 * Saves the current selection range so it can be restored when the user
 * confirms (the popover's input field would otherwise steal focus/selection).
 * Pre-fills the URL if the cursor is already inside an existing <a> tag.
 */
export function openLinkPopover() {
  const sel  = window.getSelection();
  state.savedLinkRange = sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

  // Pre-fill if cursor is inside an existing link
  const node = state.savedLinkRange ? state.savedLinkRange.commonAncestorContainer : null;
  const existingLink = node
    ? (node.nodeType === Node.TEXT_NODE ? node.parentElement : node).closest('a')
    : null;

  const input   = document.getElementById('editLinkInput');
  input.value   = existingLink ? existingLink.href : 'https://';
  document.getElementById('editLinkUnlink').hidden = !existingLink;

  document.getElementById('editLinkPopover').removeAttribute('hidden');
  input.focus();
  input.select();
}

/**
 * Wrap the saved selection in an <a> tag with the URL from the popover input.
 * Ensures all newly created links open in a new tab.
 */
export function applyLink() {
  const url   = document.getElementById('editLinkInput').value.trim();
  const range = state.savedLinkRange;   // capture before closeLinkPopover clears it
  closeLinkPopover();
  if (!range || !url || url === 'https://') return;

  // Restore the saved selection in the correct contenteditable element
  const container = range.commonAncestorContainer;
  const editableEl = (container.nodeType === Node.TEXT_NODE ? container.parentElement : container)
    .closest('[contenteditable]');
  if (editableEl) editableEl.focus({ preventScroll: true });

  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand('createLink', false, url);

  // Force new-tab behaviour on all links in editable areas
  document.querySelectorAll('#articleBody a, #articleTitle a, #articleByline a').forEach(a => {
    if (!a.getAttribute('target')) a.setAttribute('target', '_blank');
    if (!a.getAttribute('rel'))    a.setAttribute('rel', 'noopener');
  });
}

/**
 * Remove the <a> wrapping from the saved selection.
 */
export function unlinkSelection() {
  const range = state.savedLinkRange;
  closeLinkPopover();
  if (!range) return;

  const container  = range.commonAncestorContainer;
  const editableEl = (container.nodeType === Node.TEXT_NODE ? container.parentElement : container)
    .closest('[contenteditable]');
  if (editableEl) editableEl.focus({ preventScroll: true });

  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand('unlink', false, null);
}

/**
 * Hide the link popover and discard the saved selection range.
 */
export function closeLinkPopover() {
  document.getElementById('editLinkPopover').setAttribute('hidden', '');
  state.savedLinkRange = null;
}
