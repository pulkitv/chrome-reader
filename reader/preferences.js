/**
 * reader/preferences.js — Theme, font size, reading width, and progress bar.
 *
 * Exports:
 *   setTheme(theme)        — apply a theme class to <body> and persist
 *   updateFontSize()       — apply state.currentFontSizeIndex font class and persist
 *   savePreferences()      — write current theme/font/width to chrome.storage.sync
 *   loadPreferences()      — read saved preferences and apply them on startup
 *   updateProgressBar()    — sync the #progressBar width to current scroll position
 */

/* global chrome */

import { FONT_SIZES, THEMES, state } from './state.js';

// ── Theme ─────────────────────────────────────────────────────────────────────

/**
 * Switch the reader to the given theme ('light' | 'sepia' | 'dark').
 * Removes all existing theme classes before adding the new one.
 */
export function setTheme(theme) {
  const cls = theme + '-theme';
  document.body.className = document.body.className
    .split(' ')
    .filter(c => !THEMES.includes(c))
    .concat(cls)
    .join(' ');
  savePreferences();
}

// ── Font size ─────────────────────────────────────────────────────────────────

/**
 * Apply the font-size class corresponding to state.currentFontSizeIndex
 * and persist the choice.
 */
export function updateFontSize() {
  document.body.className = document.body.className
    .split(' ')
    .filter(c => !FONT_SIZES.includes(c))
    .concat(FONT_SIZES[state.currentFontSizeIndex])
    .join(' ');
  savePreferences();
}

// ── Persistence ───────────────────────────────────────────────────────────────

/**
 * Persist theme, font size, and width preference to chrome.storage.sync
 * so they are restored across sessions.
 */
export function savePreferences() {
  const preferences = {
    theme:     THEMES.find(t => document.body.classList.contains(t)) || 'sepia-theme',
    fontSize:  FONT_SIZES[state.currentFontSizeIndex],
    wideWidth: state.isWideWidth
  };
  chrome.storage.sync.set({ readerPreferences: preferences });
}

/**
 * Read saved preferences from chrome.storage.sync and apply them.
 * Called once during reader initialisation, after the article is rendered.
 */
export async function loadPreferences() {
  try {
    const { readerPreferences } = await chrome.storage.sync.get('readerPreferences');
    if (!readerPreferences) return;

    // Apply saved theme
    if (readerPreferences.theme) {
      document.body.className = document.body.className
        .split(' ')
        .filter(c => !THEMES.includes(c))
        .concat(readerPreferences.theme)
        .join(' ');
    }

    // Apply saved font size
    if (readerPreferences.fontSize) {
      const idx = FONT_SIZES.indexOf(readerPreferences.fontSize);
      state.currentFontSizeIndex = idx !== -1 ? idx : 1;
      updateFontSize();
    }

    // Apply saved reading width
    if (readerPreferences.wideWidth) {
      state.isWideWidth = true;
      document.getElementById('articleContent').classList.add('wide');
    }
  } catch (error) {
    console.error('[ReadEasy] Error loading preferences:', error);
  }
}

// ── Progress bar ──────────────────────────────────────────────────────────────

/**
 * Update the reading progress bar to reflect the current scroll position.
 * Attached to the window 'scroll' event in reader.js.
 */
export function updateProgressBar() {
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress  = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
  document.getElementById('progressBar').style.width = `${Math.min(progress, 100)}%`;
}
