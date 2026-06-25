/**
 * reader/tts.js — Text-to-Speech (TTS) playback for the reader view.
 *
 * Uses the Web Speech API (SpeechSynthesis).  Long articles are split into
 * sentence-level chunks to work around the ~32 KB utterance limit in Chrome.
 * While speaking, the current line in the article is highlighted by switching
 * flash-it into 'inline-line' mode.
 *
 * Exports:
 *   initTtsVoices()       — populate voice selector and attach change listener
 *   startTtsPlayback()    — begin reading from the article body
 *   pauseTtsPlayback()    — pause the current utterance
 *   resumeTtsPlayback()   — resume after a pause
 *   stopTtsPlayback()     — cancel playback and clean up
 *   sendArticleToWebapp() — open the ReadEasy webapp and hand off article HTML
 */

/* global chrome */

import { TTS_WEBAPP_URL, state } from './state.js';
import { autoSaveToReadingList } from './article.js';
import {
  extractWordsFromArticle,
  changeFlashMode,
  highlightLine
} from './flash-it.js';

// ── Voice initialisation ──────────────────────────────────────────────────────

/**
 * Populate the voice <select> element and wire the change event.
 * Also handles the asynchronous voiceschanged event that fires after the
 * browser finishes loading the system voice list.
 */
export function initTtsVoices() {
  const voiceSelect = document.getElementById('ttsVoiceSelect');
  const toggleBtn   = document.getElementById('ttsToggleBtn');
  if (!voiceSelect || !toggleBtn) return;

  if (!('speechSynthesis' in window)) {
    voiceSelect.disabled = true;
    toggleBtn.disabled   = true;
    toggleBtn.title      = 'Text-to-speech not supported';
    return;
  }

  _populateVoiceSelect(speechSynthesis.getVoices());

  speechSynthesis.addEventListener('voiceschanged', () => {
    _populateVoiceSelect(speechSynthesis.getVoices());
  });

  voiceSelect.addEventListener('change', () => {
    const voices   = speechSynthesis.getVoices();
    state.ttsVoice = voices.find(v => v.voiceURI === voiceSelect.value) || null;
  });
}

/** Rebuild the <option> list and update state.ttsVoice. */
function _populateVoiceSelect(voices) {
  const voiceSelect = document.getElementById('ttsVoiceSelect');
  if (!voiceSelect) return;

  const previousValue = voiceSelect.value;
  voiceSelect.innerHTML = '';

  if (!voices || voices.length === 0) {
    const opt = document.createElement('option');
    opt.value       = '';
    opt.textContent = 'Default voice';
    voiceSelect.appendChild(opt);
    state.ttsVoice = null;
    return;
  }

  voices.forEach(voice => {
    const opt       = document.createElement('option');
    opt.value       = voice.voiceURI;
    opt.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(opt);
  });

  // Restore previous selection, fall back to first voice
  if (previousValue) voiceSelect.value = previousValue;
  const selected = voices.find(v => v.voiceURI === voiceSelect.value) || voices[0];
  voiceSelect.value  = selected.voiceURI;
  state.ttsVoice     = selected;
}

// ── Playback ──────────────────────────────────────────────────────────────────

/**
 * Start reading the article from the beginning.
 * Splits the full article text into sentence-level chunks and hands each
 * chunk to SpeechSynthesis in sequence so word-boundary events fire correctly.
 */
export function startTtsPlayback() {
  const text = _getArticleText();
  if (!text) return;

  speechSynthesis.cancel();
  state.ttsQueue      = _buildChunks(text);
  state.ttsQueueIndex = 0;
  state.ttsIsPaused   = false;
  _prepareTtsHighlighting();
  _updateTtsButton('playing');
  _speakNextChunk();
}

export function pauseTtsPlayback() {
  state.ttsIsPaused = true;
  speechSynthesis.pause();
  _updateTtsButton('paused');
}

export function resumeTtsPlayback() {
  state.ttsIsPaused = false;
  speechSynthesis.resume();
  _updateTtsButton('playing');
}

/**
 * Stop playback, clear the TTS queue, remove the line highlight, and restore
 * the flash mode that was active before TTS took over.
 */
export function stopTtsPlayback() {
  state.ttsIsPaused   = false;
  state.ttsQueue      = [];
  state.ttsQueueIndex = 0;
  speechSynthesis.cancel();
  _clearLineHighlight();
  _restoreFlashMode();
  _updateTtsButton('stopped');
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _getArticleText() {
  const bodyEl = document.getElementById('articleBody');
  return bodyEl ? bodyEl.innerText.trim() : '';
}

/**
 * Split article text into utterance-sized chunks (≤ 1 200 chars each).
 * Splits on sentence boundaries first, then on spaces if a sentence is
 * still too long.
 */
function _buildChunks(text) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks    = [];
  const MAX       = 1200;

  sentences.forEach(sentence => {
    let remaining = sentence.trim();
    while (remaining.length > MAX) {
      let splitIdx = remaining.lastIndexOf(' ', MAX);
      if (splitIdx < 0) splitIdx = MAX;
      chunks.push(remaining.slice(0, splitIdx));
      remaining = remaining.slice(splitIdx).trim();
    }
    if (remaining) chunks.push(remaining);
  });

  return chunks;
}

/**
 * Prepare word-offset data structures so we can highlight the current line
 * as TTS speaks.  Also switches flash mode to 'inline-line' while TTS is active.
 */
function _prepareTtsHighlighting() {
  if (!state.wordArray || state.wordArray.length === 0) {
    state.wordArray = extractWordsFromArticle();
  }

  state.ttsText         = _getArticleText();
  state.ttsWordOffsets  = _buildWordOffsets(state.ttsText, state.wordArray);
  state.ttsChunkOffsets = _buildChunkOffsets(state.ttsText, state.ttsQueue);
  state.ttsLastWordIndex = -1;

  // Remember the current flash mode so we can restore it after TTS ends
  if (state.ttsPrevFlashMode === null) {
    state.ttsPrevFlashMode = state.flashMode;
  }

  if (state.flashMode !== 'inline-line') {
    changeFlashMode('inline-line');
    const modeSelect = document.getElementById('flashModeSelect');
    if (modeSelect) modeSelect.value = 'inline-line';
  }
}

/** Build character offsets for each word relative to the full text string. */
function _buildWordOffsets(text, words) {
  const offsets  = [];
  let searchStart = 0;
  words.forEach(word => {
    const idx = text.indexOf(word.text, searchStart);
    if (idx !== -1) {
      offsets.push(idx);
      searchStart = idx + word.text.length;
    } else {
      offsets.push(searchStart);
    }
  });
  return offsets;
}

/** Build character offsets for each chunk relative to the full text string. */
function _buildChunkOffsets(text, chunks) {
  const offsets   = [];
  let searchStart = 0;
  chunks.forEach(chunk => {
    const idx = text.indexOf(chunk, searchStart);
    if (idx !== -1) {
      offsets.push(idx);
      searchStart = idx + chunk.length;
    } else {
      offsets.push(searchStart);
      searchStart += chunk.length;
    }
  });
  return offsets;
}

/**
 * Binary-search ttsWordOffsets to find the word index closest to a given
 * character offset (used in the SpeechSynthesisUtterance onboundary handler).
 */
function _getWordIndexFromOffset(offset) {
  if (!state.ttsWordOffsets || !state.ttsWordOffsets.length) return -1;
  let lo = 0, hi = state.ttsWordOffsets.length - 1, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (state.ttsWordOffsets[mid] <= offset) { best = mid; lo = mid + 1; }
    else                                       { hi = mid - 1; }
  }
  return best;
}

/** Speak the next chunk in ttsQueue; called recursively via utterance.onend. */
function _speakNextChunk() {
  if (state.ttsQueueIndex >= state.ttsQueue.length) {
    _updateTtsButton('stopped');
    _clearLineHighlight();
    _restoreFlashMode();
    return;
  }

  const chunk            = state.ttsQueue[state.ttsQueueIndex];
  const chunkStartOffset = state.ttsChunkOffsets[state.ttsQueueIndex] || 0;

  // Highlight the line that corresponds to the start of this chunk
  const initialWordIdx = _getWordIndexFromOffset(chunkStartOffset);
  if (initialWordIdx >= 0 && initialWordIdx !== state.ttsLastWordIndex) {
    state.ttsLastWordIndex = initialWordIdx;
    highlightLine(initialWordIdx);
  }

  state.ttsUtterance = new SpeechSynthesisUtterance(chunk);
  if (state.ttsVoice) state.ttsUtterance.voice = state.ttsVoice;

  // Update line highlight as each word boundary fires
  state.ttsUtterance.onboundary = event => {
    if (typeof event.charIndex !== 'number') return;
    const wordIdx = _getWordIndexFromOffset(chunkStartOffset + event.charIndex);
    if (wordIdx >= 0 && wordIdx !== state.ttsLastWordIndex) {
      state.ttsLastWordIndex = wordIdx;
      highlightLine(wordIdx);
    }
  };

  state.ttsUtterance.onend   = () => { if (!state.ttsIsPaused) { state.ttsQueueIndex++; _speakNextChunk(); } };
  state.ttsUtterance.onerror = () => { state.ttsQueueIndex++; _speakNextChunk(); };

  speechSynthesis.speak(state.ttsUtterance);
}

function _clearLineHighlight() {
  const el = document.querySelector('.flash-line-highlight-overlay');
  if (el) el.remove();
}

function _restoreFlashMode() {
  if (state.ttsPrevFlashMode !== null && state.ttsPrevFlashMode !== state.flashMode) {
    changeFlashMode(state.ttsPrevFlashMode);
    const modeSelect = document.getElementById('flashModeSelect');
    if (modeSelect) modeSelect.value = state.ttsPrevFlashMode;
  }
  state.ttsPrevFlashMode = null;
}

/** Update the TTS toggle button icon and title. */
function _updateTtsButton(playState) {
  const btn = document.getElementById('ttsToggleBtn');
  if (!btn) return;

  const playIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M5 9v6h4l5 4V5l-5 4H5z"/>
    <path d="M16 8c1 .8 1.5 1.8 1.5 3s-.5 2.2-1.5 3"/>
  </svg>`;
  const pauseIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M5 9v6h4l5 4V5l-5 4H5z"/>
    <rect x="16" y="7" width="3" height="10"/>
    <rect x="20" y="7" width="3" height="10"/>
  </svg>`;

  btn.innerHTML = playState === 'playing' ? pauseIcon : playIcon;
  btn.title     = playState === 'playing' ? 'Pause' : 'Listen';
}

// ── Open in ReadEasy webapp ───────────────────────────────────────────────────

/**
 * Open the ReadEasy webapp in a new tab and post the current article HTML
 * to it via postMessage once the webapp signals it is ready.
 */
export async function sendArticleToWebapp() {
  if (!TTS_WEBAPP_URL || TTS_WEBAPP_URL.includes('your-webapp')) {
    alert('Set TTS_WEBAPP_URL in reader/state.js');
    return;
  }

  const articleBody = document.getElementById('articleBody');
  if (!articleBody) return;

  // If the user is signed in, sync the article to Supabase so it appears
  // in their web app library. Fire-and-forget — opening the web app must
  // not wait on the network. Dedup is handled server-side (same URL +
  // same content_hash → only synced_at bumps; no duplicate row).
  if (state.readerAuthState?.isSignedIn) {
    autoSaveToReadingList().catch(() => {});
  }

  // Bundle the reader CSS so the webapp can recreate the reading experience
  let cssText = '';
  try {
    const cssUrl  = chrome.runtime.getURL('reader.css');
    const cssResp = await fetch(cssUrl);
    cssText       = await cssResp.text();
  } catch (err) {
    console.warn('[ReadEasy] Failed to load reader.css for webapp handoff:', err);
  }

  const payload = {
    type:      'readeasy-article',
    title:     document.getElementById('articleTitle')?.textContent  || '',
    byline:    document.getElementById('articleByline')?.textContent || '',
    siteName:  document.getElementById('articleSite')?.textContent   || '',
    sourceUrl: document.getElementById('sourceLink')?.href           || '',
    html:      articleBody.innerHTML,
    cssText
  };

  const targetOrigin  = new URL(TTS_WEBAPP_URL).origin;
  const webappWindow  = window.open(TTS_WEBAPP_URL, '_blank');
  if (!webappWindow) { alert('Please allow popups for this site.'); return; }

  const sendPayload = () => webappWindow.postMessage(payload, targetOrigin);

  // Listen for the webapp's ready signal, fall back to a 1.5 s timer
  const handler = event => {
    if (event.origin === targetOrigin && event.data === 'readeasy-ready') {
      sendPayload();
      window.removeEventListener('message', handler);
    }
  };
  window.addEventListener('message', handler);
  setTimeout(sendPayload, 1500);
}
