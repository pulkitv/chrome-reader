/**
 * reader.js — ReadEasy Reader View Entry Point
 *
 * This file is intentionally thin (~160 lines).  All feature logic lives in
 * reader/*.js sub-modules; this file only boots the page and wires DOM events.
 *
 * Module layout:
 *   reader/state.js       — shared constants and mutable state object
 *   reader/article.js     — article loading, sanitisation, reading-list save
 *   reader/preferences.js — theme, font size, reading width, progress bar
 *   reader/auth.js        — reader header auth UI and action handlers
 *   reader/edit-mode.js   — edit toolbar: formatting, links, notes, images
 *   reader/tts.js         — Text-to-Speech playback
 *   reader/flash-it.js    — Flash It speed-reading (RSVP)
 *   reader/epub.js        — EPUB / HTML download and email-EPUB flow
 */

/* global chrome */

// ── Module imports ────────────────────────────────────────────────────────────

import { state }                    from './reader/state.js';

import {
  loadArticle,
  handleAddToReadingList,
  autoSaveToReadingList
}                                   from './reader/article.js';

import {
  setTheme,
  updateFontSize,
  loadPreferences,
  updateProgressBar
}                                   from './reader/preferences.js';

import {
  loadReaderAuthState,
  closeReaderAuthDropdown,
  handleReaderAuthClick,
  handleReaderSignOut,
  handleAuthUpdatedMessage
}                                   from './reader/auth.js';

import {
  enterEditMode,
  exitEditMode,
  execFormatCmd,
  applyFontSize,
  insertNoteBlock,
  insertHorizontalRule,
  updateToolbarState,
  insertImageAtCursor,
  openLinkPopover,
  applyLink,
  unlinkSelection,
  closeLinkPopover
}                                   from './reader/edit-mode.js';

import {
  initTtsVoices,
  startTtsPlayback,
  pauseTtsPlayback,
  resumeTtsPlayback,
  sendArticleToWebapp
}                                   from './reader/tts.js';

import {
  startFlashIt,
  pauseFlashIt,
  resumeFlashIt,
  restartFlashIt,
  stopFlashIt,
  changeFlashMode,
  updateFlashSpeed
}                                   from './reader/flash-it.js';

import {
  openDownloadModal,
  closeDownloadModal,
  downloadArticleHTML,
  openEmailEpubModal,
  closeEmailEpubModal,
  emailArticleEPUB
}                                   from './reader/epub.js';

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Inject a <base> tag so relative image URLs in the article resolve correctly
  const sourceUrl = new URLSearchParams(window.location.search).get('url');
  if (sourceUrl) {
    const base = document.createElement('base');
    base.href  = sourceUrl;
    document.head.insertBefore(base, document.head.firstChild);
  }

  await loadArticle();
  await loadReaderAuthState();
  setupEventListeners();

  if ('speechSynthesis' in window) {
    window.addEventListener('beforeunload', () => speechSynthesis.cancel());
  }

  loadPreferences();
  updateProgressBar();

  // Fire-and-forget: silently save article; must not block or throw in reader
  autoSaveToReadingList();
});

// ── Event wiring ──────────────────────────────────────────────────────────────

function setupEventListeners() {

  // ── Window / nav ──
  document.getElementById('closeBtn').addEventListener('click', () => window.close());
  window.addEventListener('scroll', updateProgressBar);

  // ── Auth ──
  document.getElementById('readerAuthBtn').addEventListener('click', handleReaderAuthClick);
  document.getElementById('readerAuthSignOutBtn').addEventListener('click', handleReaderSignOut);
  document.addEventListener('mousedown', e => {
    const wrap = document.querySelector('.reader-auth-wrap');
    if (wrap && !wrap.contains(e.target)) closeReaderAuthDropdown();
  });

  // ── Themes ──
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });

  // ── Font size ──
  document.getElementById('decreaseFont').addEventListener('click', () => {
    if (state.currentFontSizeIndex > 0) { state.currentFontSizeIndex--; updateFontSize(); }
  });
  document.getElementById('increaseFont').addEventListener('click', () => {
    if (state.currentFontSizeIndex < 4)  { state.currentFontSizeIndex++; updateFontSize(); }
  });

  // ── Reading width ──
  document.getElementById('toggleWidth').addEventListener('click', () => {
    state.isWideWidth = !state.isWideWidth;
    document.getElementById('articleContent').classList.toggle('wide', state.isWideWidth);
    // savePreferences is called inside updateFontSize/setTheme; call directly here
    import('./reader/preferences.js').then(m => m.savePreferences());
  });

  // ── Reading list ──
  document.getElementById('addToListBtn').addEventListener('click', () => handleAddToReadingList());

  // ── Download modal ──
  document.getElementById('downloadBtn').addEventListener('click', openDownloadModal);
  document.getElementById('closeModal').addEventListener('click', closeDownloadModal);
  document.getElementById('cancelDownload').addEventListener('click', closeDownloadModal);
  document.getElementById('confirmDownload').addEventListener('click', downloadArticleHTML);
  document.getElementById('downloadModal').addEventListener('click', e => {
    if (e.target.id === 'downloadModal') closeDownloadModal();
  });
  document.getElementById('filenameInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') downloadArticleHTML();
  });

  // ── Email EPUB modal ──
  document.getElementById('emailEpubBtn').addEventListener('click', openEmailEpubModal);
  document.getElementById('closeEmailEpubModal').addEventListener('click', closeEmailEpubModal);
  document.getElementById('cancelEmailEpub').addEventListener('click', closeEmailEpubModal);
  document.getElementById('confirmEmailEpub').addEventListener('click', emailArticleEPUB);
  document.getElementById('emailEpubModal').addEventListener('click', e => {
    if (e.target.id === 'emailEpubModal') closeEmailEpubModal();
  });
  document.getElementById('recipientEmailInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') emailArticleEPUB();
  });

  // ── TTS ──
  document.getElementById('ttsToggleBtn').addEventListener('click', () => {
    if (!('speechSynthesis' in window)) return;
    if (!speechSynthesis.speaking)   startTtsPlayback();
    else if (speechSynthesis.paused) resumeTtsPlayback();
    else                             pauseTtsPlayback();
  });
  document.getElementById('ttsSendBtn').addEventListener('click', sendArticleToWebapp);
  initTtsVoices();

  // ── Flash It ──
  document.getElementById('flashBtn').addEventListener('click', () => {
    if (!state.isFlashing)    startFlashIt();
    else if (state.isPaused)  resumeFlashIt();
    else                      pauseFlashIt();
  });
  document.getElementById('flashSpeed').addEventListener('change', e => updateFlashSpeed(e.target.value));
  document.getElementById('flashModeSelect').addEventListener('change', e => changeFlashMode(e.target.value));
  document.getElementById('flashRestart').addEventListener('click', restartFlashIt);
  document.getElementById('closeFlashOverlay').addEventListener('click', stopFlashIt);
  document.getElementById('flashOverlayToggle').addEventListener('click', () => {
    if (state.isPaused) resumeFlashIt(); else pauseFlashIt();
  });
  document.getElementById('flashOverlayRestart').addEventListener('click', restartFlashIt);
  document.getElementById('flashOverlay').addEventListener('click', e => {
    if (e.target.id === 'flashOverlay') stopFlashIt();
  });

  // ── Edit mode ──
  document.getElementById('editBtn').addEventListener('click', enterEditMode);
  document.getElementById('editSave').addEventListener('click', () => exitEditMode(true));
  document.getElementById('editCancel').addEventListener('click', () => exitEditMode(false));
  document.getElementById('editBold').addEventListener('click', () => execFormatCmd('bold'));
  document.getElementById('editItalic').addEventListener('click', () => execFormatCmd('italic'));
  document.getElementById('editUnderline').addEventListener('click', () => execFormatCmd('underline'));
  document.getElementById('editFontColor').addEventListener('input', e => execFormatCmd('foreColor', e.target.value));
  document.getElementById('editFontSize').addEventListener('change', e => applyFontSize(Number(e.target.value)));
  document.getElementById('editAlignLeft').addEventListener('click',   () => execFormatCmd('justifyLeft'));
  document.getElementById('editAlignCenter').addEventListener('click', () => execFormatCmd('justifyCenter'));
  document.getElementById('editAlignRight').addEventListener('click',  () => execFormatCmd('justifyRight'));
  document.getElementById('editBulletList').addEventListener('click',  () => execFormatCmd('insertUnorderedList'));
  document.getElementById('editNumberedList').addEventListener('click',() => execFormatCmd('insertOrderedList'));
  document.getElementById('editInsertHR').addEventListener('click', insertHorizontalRule);
  document.getElementById('editInsertNote').addEventListener('click', insertNoteBlock);

  // Highlight swatches (preset colours)
  document.querySelectorAll('.edit-highlight-swatch[data-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      document.getElementById('articleBody').focus();
      document.execCommand('hiliteColor', false, color === 'transparent' ? 'transparent' : color);
    });
  });
  // Custom highlight colour picker
  document.getElementById('editHighlightColor').addEventListener('input', e => {
    document.getElementById('articleBody').focus();
    document.execCommand('hiliteColor', false, e.target.value);
  });

  // Image insert via file input
  document.getElementById('editImageInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) insertImageAtCursor(file);
    e.target.value = '';
  });

  // Link popover
  document.getElementById('editLinkBtn').addEventListener('click', openLinkPopover);
  document.getElementById('editLinkApply').addEventListener('click', applyLink);
  document.getElementById('editLinkUnlink').addEventListener('click', unlinkSelection);
  document.getElementById('editLinkClose').addEventListener('click', closeLinkPopover);
  document.getElementById('editLinkInput').addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); applyLink(); }
    if (e.key === 'Escape') closeLinkPopover();
  });

  // Force cursor placement on article body click (collapsed selections only)
  document.getElementById('articleBody').addEventListener('click', e => {
    if (!state.isEditMode) return;
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) return;
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    const body  = document.getElementById('articleBody');
    if (range && body.contains(range.startContainer)) {
      body.focus({ preventScroll: true });
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  // Debounced selectionchange → update Bold/Italic/Underline button states
  let _selTimer = null;
  document.addEventListener('selectionchange', () => {
    clearTimeout(_selTimer);
    _selTimer = setTimeout(updateToolbarState, 30);
  });

  // Prevent toolbar buttons from stealing focus (which would drop the selection).
  // Exemptions: <select>, color/file <input>, Save/Cancel action buttons.
  document.getElementById('editToolbar').addEventListener('mousedown', e => {
    const t = e.target;
    if (t.tagName === 'SELECT' || t.tagName === 'OPTION') return;
    if (t.tagName === 'INPUT' && (t.type === 'color' || t.type === 'file')) return;
    if (t.id === 'editSave' || t.id === 'editCancel') return;
    e.preventDefault();
  });

  // ── Keyboard shortcuts ──
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (state.isEditMode && e.key !== 'Escape') return;

    if (e.key === 'Escape') {
      if (state.isEditMode)  exitEditMode(false);
      else if (state.isFlashing) stopFlashIt();
      else window.close();
    }
    if ((e.key === '+' || e.key === '=') && !state.isFlashing) {
      document.getElementById('increaseFont').click();
    }
    if (e.key === '-' && !state.isFlashing) {
      document.getElementById('decreaseFont').click();
    }
    if ((e.key === 'f' || e.key === 'F') && !state.isEditMode) {
      e.preventDefault();
      if (!state.isFlashing) startFlashIt(); else stopFlashIt();
    }
    if (e.key === ' ' && state.isFlashing) {
      e.preventDefault();
      if (state.isPaused) resumeFlashIt(); else pauseFlashIt();
    }
    if ((e.key === 'r' || e.key === 'R') && state.isFlashing) {
      e.preventDefault();
      restartFlashIt();
    }
  });

  // ── Chrome runtime messages ──
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'authUpdated' && message.authState) {
      handleAuthUpdatedMessage(message.authState);
      return;
    }
    if (message.action === 'getCurrentArticle') {
      const titleEl  = document.getElementById('articleTitle');
      const sourceEl = document.getElementById('sourceLink');
      const siteEl   = document.getElementById('articleSite');
      if (!titleEl) { sendResponse(null); return true; }
      sendResponse({
        title:    titleEl.textContent,
        url:      sourceEl.href,
        siteName: siteEl ? siteEl.textContent : new URL(sourceEl.href).hostname
      });
    }
    if (message.action === 'addToReadingList') {
      handleAddToReadingList()
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // async response
    }
  });
}
