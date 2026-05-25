/**
 * reader/state.js — Shared constants and mutable state for the reader view.
 *
 * All sub-modules import from here so there is a single source of truth.
 * Mutable values live on the exported `state` object so any module can
 * read and write them without re-export gymnastics.
 */

/* global chrome */

// ── Constants ─────────────────────────────────────────────────────────────────

export const FONT_SIZES     = ['font-small', 'font-normal', 'font-large', 'font-xlarge', 'font-xxlarge'];
export const THEMES         = ['light-theme', 'sepia-theme', 'dark-theme'];
export const AUTH_STATE_KEY = 'authState';
export const TTS_WEBAPP_URL = 'https://merge-epubs.vercel.app/#/reader';

// ── Mutable shared state ──────────────────────────────────────────────────────

export const state = {

  // ── Display preferences ──────────────────────────────────────────────────
  currentFontSizeIndex: 1,   // index into FONT_SIZES; 1 = 'font-normal'
  isWideWidth:          false,

  // ── Reading list ─────────────────────────────────────────────────────────
  currentArticleId: null,  // IndexedDB id of the currently displayed article once saved

  // ── Edit mode ────────────────────────────────────────────────────────────
  isEditMode:     false,
  preEditContent: '',        // innerHTML snapshot of #articleBody before editing
  preEditTitle:   '',        // innerHTML snapshot of #articleTitle before editing
  preEditByline:  '',        // innerHTML snapshot of #articleByline before editing
  savedLinkRange: null,      // Selection range preserved while link popover is open

  // ── Reader auth ──────────────────────────────────────────────────────────
  readerAuthState: {
    isSignedIn: false,
    profile: { email: '', name: '', picture: '' }
  },

  // ── Flash It speed reading ───────────────────────────────────────────────
  isFlashing:       false,
  flashMode:        'overlay',  // 'overlay' | 'inline-word' | 'inline-line'
  flashSpeed:       250,        // words per minute
  currentWordIndex: 0,
  wordArray:        [],         // Array of { text, element, length, index }
  flashTimeout:     null,
  isPaused:         false,

  // ── Text-to-Speech ───────────────────────────────────────────────────────
  ttsUtterance:     null,
  ttsQueue:         [],         // Sentence/chunk array fed to SpeechSynthesis
  ttsQueueIndex:    0,
  ttsVoice:         null,
  ttsIsPaused:      false,
  ttsText:          '',         // Full article text used for offset mapping
  ttsWordOffsets:   [],         // Character offsets of each word in ttsText
  ttsChunkOffsets:  [],         // Character offsets of each TTS chunk in ttsText
  ttsLastWordIndex: -1,
  ttsPrevFlashMode: null        // Flash mode before TTS took over; restored on stop
};
