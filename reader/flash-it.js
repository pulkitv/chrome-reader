/**
 * reader/flash-it.js — Flash It speed-reading (RSVP) for the reader view.
 *
 * Three display modes:
 *   'overlay'      — fullscreen RSVP overlay, one word at a time
 *   'inline-word'  — highlight single word inside the article
 *   'inline-line'  — highlight the whole current line (also used by TTS)
 *
 * Exports:
 *   extractWordsFromArticle() — wrap every word in a <span.flash-word> and return array
 *   startFlashIt()            — begin speed-reading from the current position
 *   pauseFlashIt()            — pause playback
 *   resumeFlashIt()           — resume after pause
 *   restartFlashIt()          — reset to word 0 and restart
 *   stopFlashIt()             — stop and clean up all Flash It state
 *   changeFlashMode(mode)     — switch display mode (overlay / inline-word / inline-line)
 *   updateFlashSpeed(wpm)     — update words-per-minute and apply immediately
 *   highlightLine(wordIndex)  — highlight the line containing a given word (used by TTS)
 */

import { state } from './state.js';

// ── Word extraction ───────────────────────────────────────────────────────────

/**
 * Walk the article body text nodes, wrap every non-whitespace word in a
 * <span class="flash-word" data-word-index="N">, and return an array of
 * { text, element, length, index } objects.
 *
 * Called lazily — only when Flash It or TTS first runs.
 */
export function extractWordsFromArticle() {
  const articleBody = document.getElementById('articleBody');
  if (!articleBody) return [];

  const words    = [];
  let wordIndex  = 0;

  function traverseNodes(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (!text.trim()) return;

      const parts    = text.split(/(\s+)/);
      const fragment = document.createDocumentFragment();

      parts.forEach(part => {
        if (part.trim()) {
          const span = document.createElement('span');
          span.className = 'flash-word';
          span.setAttribute('data-word-index', wordIndex);
          span.textContent = part;
          fragment.appendChild(span);
          words.push({ text: part, element: span, length: part.length, index: wordIndex });
          wordIndex++;
        } else if (part.length) {
          fragment.appendChild(document.createTextNode(part));
        }
      });

      if (node.parentNode) node.parentNode.replaceChild(fragment, node);

    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'svg') return;
      Array.from(node.childNodes).forEach(traverseNodes);
    }
  }

  traverseNodes(articleBody);
  return words;
}

// ── Playback controls ─────────────────────────────────────────────────────────

export async function startFlashIt() {
  if (state.isFlashing) return;

  if (state.wordArray.length === 0) {
    state.wordArray = extractWordsFromArticle();
    if (state.wordArray.length === 0) {
      alert('No readable content found in this article.');
      return;
    }
  }

  // Restore a previously saved position if one exists
  await _loadFlashState();

  state.isFlashing = true;
  state.isPaused   = false;

  if (state.flashMode === 'overlay') {
    document.getElementById('flashOverlay').classList.add('show');
    document.getElementById('flashTotalWords').textContent = state.wordArray.length;
  }

  _updateFlashButtons('playing');
  _flashNextWord();
}

export function pauseFlashIt() {
  if (!state.isFlashing) return;
  state.isPaused = true;
  if (state.flashTimeout) { clearTimeout(state.flashTimeout); state.flashTimeout = null; }
  _updateFlashButtons('paused');
  _saveFlashState();
}

export function resumeFlashIt() {
  if (!state.isFlashing) return;
  state.isPaused = false;
  _updateFlashButtons('playing');
  _flashNextWord();
}

export function restartFlashIt() {
  if (state.flashTimeout) { clearTimeout(state.flashTimeout); state.flashTimeout = null; }
  state.currentWordIndex = 0;
  state.isPaused         = false;
  if (state.isFlashing) { _updateFlashButtons('playing'); _flashNextWord(); }
  _saveFlashState();
}

export function stopFlashIt() {
  if (!state.isFlashing) return;
  state.isFlashing = false;
  state.isPaused   = false;

  if (state.flashTimeout) { clearTimeout(state.flashTimeout); state.flashTimeout = null; }

  // Remove any inline word highlight
  const highlighted = document.querySelector('.flash-word.flash-highlight');
  if (highlighted) highlighted.classList.remove('flash-highlight');

  document.getElementById('flashOverlay').classList.remove('show');
  _updateFlashButtons('stopped');

  try { chrome.storage.session.remove('flashItState'); } catch (_) {}
}

// ── Mode and speed ────────────────────────────────────────────────────────────

/**
 * Switch between 'overlay', 'inline-word', and 'inline-line' modes.
 * Pauses playback during the switch and resumes if it was playing.
 */
export function changeFlashMode(newMode) {
  const wasPlaying = state.isFlashing && !state.isPaused;
  const wasPaused  = state.isPaused;

  if (wasPlaying) pauseFlashIt();

  state.flashMode = newMode;

  const overlay = document.getElementById('flashOverlay');
  if (state.flashMode === 'overlay' && state.isFlashing) {
    overlay.classList.add('show');
    document.getElementById('flashTotalWords').textContent = state.wordArray.length;
    if (wasPaused && state.currentWordIndex > 0) _displayInOverlay(state.currentWordIndex - 1);
  } else {
    overlay.classList.remove('show');
    if (wasPaused && state.currentWordIndex > 0) _highlightInline(state.currentWordIndex - 1);
  }

  if (wasPlaying) resumeFlashIt();
  _saveFlashState();
}

export function updateFlashSpeed(wpm) {
  state.flashSpeed = parseInt(wpm, 10);
  // If currently playing, restart the word timer immediately at the new speed
  if (state.isFlashing && !state.isPaused) {
    if (state.flashTimeout) { clearTimeout(state.flashTimeout); state.flashTimeout = null; }
    _flashNextWord();
  }
  _saveFlashState();
}

// ── Line highlighting (also used by TTS) ─────────────────────────────────────

/**
 * Overlay-highlight the entire line containing wordArray[wordIndex].
 * Creates a position:absolute overlay div on top of the article body.
 * Exported so tts.js can call it during playback.
 */
export function highlightLine(wordIndex) {
  const prevOverlay = document.querySelector('.flash-line-highlight-overlay');
  if (prevOverlay) prevOverlay.remove();

  if (wordIndex < 0 || wordIndex >= state.wordArray.length) return;

  const wordsOnLine = _getWordsOnLine(wordIndex);
  if (!wordsOnLine.length) return;

  const firstWord  = state.wordArray[wordsOnLine[0]].element;
  const lastWord   = state.wordArray[wordsOnLine[wordsOnLine.length - 1]].element;
  const articleBody = document.getElementById('articleBody');

  const articleRect = articleBody.getBoundingClientRect();
  const firstRect   = firstWord.getBoundingClientRect();
  const lastRect    = lastWord.getBoundingClientRect();

  const overlay = document.createElement('div');
  overlay.className    = 'flash-line-highlight-overlay';
  overlay.style.position = 'absolute';
  overlay.style.left   = `${firstRect.left  - articleRect.left}px`;
  overlay.style.top    = `${firstRect.top   - articleRect.top + articleBody.scrollTop}px`;
  overlay.style.width  = `${lastRect.right  - firstRect.left}px`;
  overlay.style.height = `${firstRect.height}px`;
  overlay.style.pointerEvents = 'none';

  articleBody.style.position = 'relative';
  articleBody.appendChild(overlay);

  _scrollToWordIfNeeded(state.wordArray[wordIndex].element);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Main display loop — called on a timeout chain. */
function _flashNextWord() {
  if (!state.isFlashing || state.isPaused) return;

  if (state.currentWordIndex >= state.wordArray.length) {
    stopFlashIt();
    return;
  }

  const word = state.wordArray[state.currentWordIndex];

  if (state.flashMode === 'overlay') {
    _displayInOverlay(state.currentWordIndex);
  } else {
    _highlightInline(state.currentWordIndex);
  }

  _saveFlashState();

  const delay = _calcWordDelay(word.text, state.flashSpeed) + _punctuationPause(word.text);
  state.currentWordIndex++;
  state.flashTimeout = setTimeout(_flashNextWord, delay);
}

/** Display a word in the RSVP overlay element. */
function _displayInOverlay(wordIndex) {
  const currentWordEl = document.getElementById('flashCurrentWordDisplay');
  const prevWordEl    = document.getElementById('flashPrevWord');
  const nextWordEl    = document.getElementById('flashNextWord');
  const counterEl     = document.getElementById('flashCurrentWord');

  if (wordIndex < 0 || wordIndex >= state.wordArray.length) return;

  currentWordEl.textContent = state.wordArray[wordIndex].text;
  prevWordEl.textContent    = wordIndex > 0 ? state.wordArray[wordIndex - 1].text : '';
  nextWordEl.textContent    = wordIndex < state.wordArray.length - 1 ? state.wordArray[wordIndex + 1].text : '';
  counterEl.textContent     = wordIndex + 1;
}

/** Highlight a single word or a whole line inline in the article. */
function _highlightInline(wordIndex) {
  if (state.flashMode === 'inline-line') {
    highlightLine(wordIndex);
  } else {
    const prev = document.querySelector('.flash-word.flash-highlight');
    if (prev) prev.classList.remove('flash-highlight');
    if (wordIndex >= 0 && wordIndex < state.wordArray.length) {
      state.wordArray[wordIndex].element.classList.add('flash-highlight');
      _scrollToWordIfNeeded(state.wordArray[wordIndex].element);
    }
  }
}

/** Return the indices of all words whose bounding rect top matches wordIndex. */
function _getWordsOnLine(wordIndex) {
  if (wordIndex < 0 || wordIndex >= state.wordArray.length) return [];
  const targetTop = state.wordArray[wordIndex].element.getBoundingClientRect().top;
  const tolerance = 5; // px
  return state.wordArray
    .map((_, i) => i)
    .filter(i => Math.abs(state.wordArray[i].element.getBoundingClientRect().top - targetTop) < tolerance);
}

/** Scroll an element into the middle of the viewport if it is offscreen. */
function _scrollToWordIfNeeded(element) {
  const rect         = element.getBoundingClientRect();
  const headerHeight = 60;
  if (rect.top < headerHeight || rect.bottom > window.innerHeight) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/**
 * Adaptive milliseconds-per-word based on WPM and word length.
 * Longer words get proportionally more time.
 */
function _calcWordDelay(word, wpm) {
  const base = (60 / wpm) * 1000;
  const len  = word.length;
  if (len <= 3)  return Math.round(base * 0.8);
  if (len <= 8)  return Math.round(base);
  if (len <= 12) return Math.round(base * 1.3);
  return Math.round(base * 1.5);
}

/** Extra pause after sentence-ending or clause-ending punctuation. */
function _punctuationPause(word) {
  const last = word.charAt(word.length - 1);
  if (last === '.' || last === '!' || last === '?') return 300;
  if (last === ',' || last === ';' || last === ':') return 150;
  return 0;
}

// ── Persistence ───────────────────────────────────────────────────────────────

async function _saveFlashState() {
  try {
    await chrome.storage.session.set({
      flashItState: {
        wordIndex: state.currentWordIndex,
        speed:     state.flashSpeed,
        mode:      state.flashMode,
        isPaused:  state.isPaused
      }
    });
  } catch (_) {}
}

async function _loadFlashState() {
  try {
    const { flashItState } = await chrome.storage.session.get('flashItState');
    if (!flashItState) return;
    state.currentWordIndex = flashItState.wordIndex || 0;
    state.flashSpeed       = flashItState.speed     || 250;
    state.flashMode        = flashItState.mode       || 'overlay';
    state.isPaused         = flashItState.isPaused   || false;
    document.getElementById('flashSpeed').value      = state.flashSpeed;
    document.getElementById('flashModeSelect').value = state.flashMode;
  } catch (_) {}
}

// ── UI button state ───────────────────────────────────────────────────────────

function _updateFlashButtons(playState) {
  const flashBtn         = document.getElementById('flashBtn');
  const restartBtn       = document.getElementById('flashRestart');
  const overlayToggleBtn = document.getElementById('flashOverlayToggle');

  const playIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  const pauseIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  const smPlayIcon  = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  const smPauseIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;

  if (playState === 'playing') {
    flashBtn.classList.add('active');
    flashBtn.innerHTML       = pauseIcon;
    flashBtn.title           = 'Pause';
    restartBtn.style.display = 'flex';
    overlayToggleBtn.innerHTML = smPauseIcon;
  } else if (playState === 'paused') {
    flashBtn.classList.add('active');
    flashBtn.innerHTML       = playIcon;
    flashBtn.title           = 'Resume';
    restartBtn.style.display = 'flex';
    overlayToggleBtn.innerHTML = smPlayIcon;
  } else {
    flashBtn.classList.remove('active');
    flashBtn.innerHTML       = playIcon;
    flashBtn.title           = 'Start speed reading';
    restartBtn.style.display = 'none';
    overlayToggleBtn.innerHTML = smPauseIcon;
  }
}
