// Reader View UI JavaScript

const FONT_SIZES = ['font-small', 'font-normal', 'font-large', 'font-xlarge', 'font-xxlarge'];
const THEMES = ['light-theme', 'sepia-theme', 'dark-theme'];

let currentFontSizeIndex = 1; // Start with font-normal
let isWideWidth = false;

// Flash It speed reading state
let isFlashing = false;
let flashMode = 'overlay'; // 'overlay', 'inline-word', or 'inline-line'
let flashSpeed = 250; // Words per minute (default)
let currentWordIndex = 0;
let wordArray = []; // Array of word objects {text, element, length}
let flashTimeout = null;
let isPaused = false;

// Text-to-Speech state
const TTS_WEBAPP_URL = 'https://merge-epubs.vercel.app/#/reader';
let ttsUtterance = null;
let ttsQueue = [];
let ttsQueueIndex = 0;
let ttsVoice = null;
let ttsIsPaused = false;
let ttsText = '';
let ttsWordOffsets = [];
let ttsChunkOffsets = [];
let ttsLastWordIndex = -1;
let ttsPrevFlashMode = null;

// Initialize reader on page load
document.addEventListener('DOMContentLoaded', async () => {
  // Set base URL from query parameter to help with image loading
  const urlParams = new URLSearchParams(window.location.search);
  const sourceUrl = urlParams.get('url');
  if (sourceUrl) {
    const base = document.createElement('base');
    base.href = sourceUrl;
    document.head.insertBefore(base, document.head.firstChild);
  }
  
  await loadArticle();
  setupEventListeners();
  if ('speechSynthesis' in window) {
    window.addEventListener('beforeunload', () => speechSynthesis.cancel());
  }
  loadPreferences();
  updateProgressBar();
});

/**
 * Load article from session storage
 */
async function loadArticle() {
  try {
    const { currentArticle } = await chrome.storage.session.get('currentArticle');
    
    if (!currentArticle) {
      displayError('No article found. Please try again.');
      return;
    }

    // Update document title
    document.title = currentArticle.title || 'ReadEasy';

    // Display article metadata
    const titleEl = document.getElementById('articleTitle');
    const bylineEl = document.getElementById('articleByline');
    const siteEl = document.getElementById('articleSite');
    const bodyEl = document.getElementById('articleBody');
    const sourceLink = document.getElementById('sourceLink');

    titleEl.textContent = currentArticle.title || 'Untitled';
    
    if (currentArticle.byline) {
      bylineEl.textContent = `By ${currentArticle.byline}`;
      bylineEl.style.display = 'block';
    } else {
      bylineEl.style.display = 'none';
    }

    if (currentArticle.siteName) {
      siteEl.textContent = currentArticle.siteName;
      siteEl.style.display = 'block';
    } else {
      siteEl.style.display = 'none';
    }

    // Set source link
    if (currentArticle.sourceUrl && sourceLink) {
      sourceLink.href = currentArticle.sourceUrl;
    }

    // Sanitize and display article content
    bodyEl.innerHTML = sanitizeHtml(currentArticle.content);

    // Debug: Check images in content
    const images = bodyEl.querySelectorAll('img');
    console.log(`Article has ${images.length} images`);
    images.forEach((img, i) => {
      console.log(`Image ${i}:`, {
        src: img.src,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight
      });
    });

    // Lazy load images for better performance
    setupLazyLoading();

  } catch (error) {
    console.error('Error loading article:', error);
    displayError('Failed to load article content.');
  }
}

/**
 * Basic HTML sanitization (removes scripts and dangerous attributes)
 */
function sanitizeHtml(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Remove script tags
  const scripts = temp.querySelectorAll('script');
  scripts.forEach(script => script.remove());

  // Remove event handler attributes
  const allElements = temp.querySelectorAll('*');
  allElements.forEach(el => {
    // Remove on* event attributes
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
  });

  // Remove iframes (optionally, you could convert them to links)
  const iframes = temp.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    const link = document.createElement('a');
    link.href = iframe.src || '#';
    link.textContent = `[Embedded content: ${iframe.src || 'Unknown'}]`;
    link.target = '_blank';
    iframe.replaceWith(link);
  });

  return temp.innerHTML;
}

/**
 * Setup lazy loading for images
 */
function setupLazyLoading() {
  const images = document.querySelectorAll('.article-body img');
  
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          observer.unobserve(img);
        }
      });
    });

    images.forEach(img => imageObserver.observe(img));
  }
}

/**
 * Setup event listeners for controls
 */
function setupEventListeners() {
  // Close button
  document.getElementById('closeBtn').addEventListener('click', () => {
    window.close();
  });

  // Theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      setTheme(theme);
    });
  });

  // Font size controls
  document.getElementById('decreaseFont').addEventListener('click', () => {
    if (currentFontSizeIndex > 0) {
      currentFontSizeIndex--;
      updateFontSize();
    }
  });

  document.getElementById('increaseFont').addEventListener('click', () => {
    if (currentFontSizeIndex < FONT_SIZES.length - 1) {
      currentFontSizeIndex++;
      updateFontSize();
    }
  });

  // Width toggle
  document.getElementById('toggleWidth').addEventListener('click', () => {
    isWideWidth = !isWideWidth;
    const article = document.getElementById('articleContent');
    if (isWideWidth) {
      article.classList.add('wide');
    } else {
      article.classList.remove('wide');
    }
    savePreferences();
  });

  // Download button
  document.getElementById('downloadBtn').addEventListener('click', () => {
    openDownloadModal();
  });

  // Download EPUB button
  document.getElementById('downloadEpubBtn').addEventListener('click', () => {
    downloadArticleEPUB();
  });

  // Email EPUB button
  document.getElementById('emailEpubBtn').addEventListener('click', () => {
    openEmailEpubModal();
  });

  // TTS controls
  document.getElementById('ttsToggleBtn').addEventListener('click', () => {
    if (!('speechSynthesis' in window)) return;

    if (!speechSynthesis.speaking) {
      startTtsPlayback();
    } else if (speechSynthesis.paused) {
      resumeTtsPlayback();
    } else {
      pauseTtsPlayback();
    }
  });

  document.getElementById('ttsSendBtn').addEventListener('click', () => {
    sendArticleToWebapp();
  });

  // Add to Reading List button
  document.getElementById('addToListBtn').addEventListener('click', async () => {
    await handleAddToReadingList();
  });

  initTtsVoices();

  // Email EPUB modal handlers
  document.getElementById('closeEmailEpubModal').addEventListener('click', closeEmailEpubModal);
  document.getElementById('cancelEmailEpub').addEventListener('click', closeEmailEpubModal);
  document.getElementById('confirmEmailEpub').addEventListener('click', emailArticleEPUB);
  
  // Close email EPUB modal on outside click
  document.getElementById('emailEpubModal').addEventListener('click', (e) => {
    if (e.target.id === 'emailEpubModal') {
      closeEmailEpubModal();
    }
  });
  
  // Handle Enter key in recipient email input
  document.getElementById('recipientEmailInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      emailArticleEPUB();
    }
  });

  // Flash It controls
  document.getElementById('flashBtn').addEventListener('click', () => {
    if (!isFlashing) {
      startFlashIt();
    } else if (isPaused) {
      resumeFlashIt();
    } else {
      pauseFlashIt();
    }
  });
  
  document.getElementById('flashSpeed').addEventListener('change', (e) => {
    updateFlashSpeed(e.target.value);
  });
  
  document.getElementById('flashModeSelect').addEventListener('change', (e) => {
    changeFlashMode(e.target.value);
  });
  
  document.getElementById('flashRestart').addEventListener('click', () => {
    restartFlashIt();
  });
  
  // Flash overlay controls
  document.getElementById('closeFlashOverlay').addEventListener('click', () => {
    stopFlashIt();
  });
  
  document.getElementById('flashOverlayToggle').addEventListener('click', () => {
    if (isPaused) {
      resumeFlashIt();
    } else {
      pauseFlashIt();
    }
  });
  
  document.getElementById('flashOverlayRestart').addEventListener('click', () => {
    restartFlashIt();
  });
  
  // Close flash overlay on outside click
  document.getElementById('flashOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'flashOverlay') {
      stopFlashIt();
    }
  });

  // Modal close buttons
  document.getElementById('closeModal').addEventListener('click', closeDownloadModal);
  document.getElementById('cancelDownload').addEventListener('click', closeDownloadModal);
  
  // Confirm download button
  document.getElementById('confirmDownload').addEventListener('click', downloadArticleHTML);
  
  // Close modal on outside click
  document.getElementById('downloadModal').addEventListener('click', (e) => {
    if (e.target.id === 'downloadModal') {
      closeDownloadModal();
    }
  });
  
  // Handle Enter key in filename input
  document.getElementById('filenameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      downloadArticleHTML();
    }
  });

  // Scroll progress
  window.addEventListener('scroll', updateProgressBar);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts if typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }
    
    // Escape to close (or exit Flash It mode)
    if (e.key === 'Escape') {
      if (isFlashing) {
        stopFlashIt();
      } else {
        window.close();
      }
    }
    // + to increase font size
    if (e.key === '+' || e.key === '=') {
      if (!isFlashing) {
        document.getElementById('increaseFont').click();
      }
    }
    // - to decrease font size
    if (e.key === '-') {
      if (!isFlashing) {
        document.getElementById('decreaseFont').click();
      }
    }
    // F to toggle Flash It mode
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      if (!isFlashing) {
        startFlashIt();
      } else {
        stopFlashIt();
      }
    }
    // Space to pause/resume Flash It
    if (e.key === ' ' && isFlashing) {
      e.preventDefault();
      if (isPaused) {
        resumeFlashIt();
      } else {
        pauseFlashIt();
      }
    }
    // R to restart Flash It
    if ((e.key === 'r' || e.key === 'R') && isFlashing) {
      e.preventDefault();
      restartFlashIt();
    }
  });
}

/**
 * Listen for messages from sidepanel
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getCurrentArticle') {
    // Get current article data for sidepanel
    const titleEl = document.getElementById('articleTitle');
    const sourceEl = document.getElementById('sourceLink');
    const siteEl = document.getElementById('articleSite');

    if (!titleEl) {
      sendResponse(null);
      return true;
    }

    const title = titleEl.textContent;
    const url = sourceEl.href;
    const siteName = siteEl ? siteEl.textContent : '';

    sendResponse({ title, url, siteName: siteName || new URL(url).hostname });
  }
  else if (message.action === 'addToReadingList') {
    // Side panel is asking us to save the current article
    handleAddToReadingList()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
  }
  return true; // Keep channel open for async response
});

/**
 * Fetch a remote image URL and convert to a PNG data URL.
 * Runs in the extension page context (reader.html has <all_urls>) so fetch()
 * bypasses CORS. Normalises to PNG via canvas for maximum EPUB compatibility.
 * @param {string} url - Remote image URL
 * @returns {Promise<string|null>} PNG data URL, or null on any failure
 */
async function fetchImageAsPng(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetch(url, { credentials: 'omit', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d').drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } catch (e) { reject(e); }
        };
        img.onerror = () => reject(new Error('Image decode failed'));
        img.src = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (err) {
    console.warn('[ReadEasy] Image skipped:', url.substring(0, 100), '—', err.message);
    return null;
  }
}

/**
 * Handle Add to Reading List
 * Returns a resolved Promise on success, throws on failure.
 * Can be triggered by button click or by a message from the side panel.
 */
async function handleAddToReadingList() {
  const addBtn = document.getElementById('addToListBtn');
  const btnSpan = addBtn ? addBtn.querySelector('span') : null;
  const originalText = btnSpan ? btnSpan.textContent : 'Add to List';

  // Open side panel immediately in response to user gesture
  if (chrome.sidePanel && chrome.windows) {
    chrome.windows.getCurrent().then(win => {
      chrome.sidePanel.open({ windowId: win.id });
    });
  }

  if (addBtn) addBtn.disabled = true;
  if (btnSpan) btnSpan.textContent = 'Saving...';

  try {
    const title = document.getElementById('articleTitle').textContent;
    const sourceEl = document.getElementById('sourceLink');
    const url = sourceEl ? sourceEl.href : window.location.href;
    const siteName = document.getElementById('articleSite').textContent || new URL(url).hostname;

    // Collect all remote image src values from the article body
    const allImages = Array.from(document.getElementById('articleBody').querySelectorAll('img'));
    const remoteImages = allImages.filter(img =>
      img.src && (img.src.startsWith('http://') || img.src.startsWith('https://'))
    );
    console.log(`[ReadEasy] Fetching ${remoteImages.length} images via fetch()...`);
    if (btnSpan) btnSpan.textContent = 'Loading images...';

    // Fetch + convert to PNG in parallel — allSettled so one failure never aborts all
    const conversions = await Promise.allSettled(
      remoteImages.map(img => fetchImageAsPng(img.src))
    );

    // Replace URLs in the raw HTML using split+join — never use RegExp on base64
    let htmlContent = document.getElementById('articleBody').innerHTML;
    let succeeded = 0;
    remoteImages.forEach((img, i) => {
      const result = conversions[i];
      if (result.status !== 'fulfilled' || !result.value) return;
      const src = img.src;
      const encodedSrc = src.replace(/&/g, '&amp;');
      htmlContent = htmlContent.split(src).join(result.value);
      htmlContent = htmlContent.split(encodedSrc).join(result.value);
      succeeded++;
    });
    console.log(`[ReadEasy] ${succeeded}/${remoteImages.length} images converted. Sending to background...`);
    if (btnSpan) btnSpan.textContent = 'Saving...';

    const response = await chrome.runtime.sendMessage({
      action: 'saveToReadingList',
      article: { title, url, siteName, htmlContent }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to save article');
    }

    showNotification('Added to Reading List ✓', 'success');

  } catch (error) {
    console.error('Error adding to reading list:', error);
    showNotification('Failed to add article: ' + error.message, 'error');
    // Re-throw so message handler knows it failed
    throw error;
  } finally {
    // Re-enable button
    if (addBtn) addBtn.disabled = false;
    if (btnSpan) btnSpan.textContent = originalText;
  }
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'info') {
  // Remove existing notifications
  const existing = document.querySelector('.reader-notification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.className = `reader-notification notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Trigger animation
  setTimeout(() => notification.classList.add('show'), 10);
  
  // Auto-remove after 2s
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

/**
 * Set theme
 */
function setTheme(theme) {
  const validTheme = theme + '-theme';
  document.body.className = document.body.className
    .split(' ')
    .filter(c => !THEMES.includes(c))
    .concat(validTheme)
    .join(' ');
  savePreferences();
}

/**
 * Update font size
 */
function updateFontSize() {
  document.body.className = document.body.className
    .split(' ')
    .filter(c => !FONT_SIZES.includes(c))
    .concat(FONT_SIZES[currentFontSizeIndex])
    .join(' ');
  savePreferences();
}

/**
 * Update reading progress bar
 */
function updateProgressBar() {
  const windowHeight = window.innerHeight;
  const documentHeight = document.documentElement.scrollHeight - windowHeight;
  const scrolled = window.scrollY;
  const progress = (scrolled / documentHeight) * 100;
  
  document.getElementById('progressBar').style.width = `${Math.min(progress, 100)}%`;
}

/**
 * Save user preferences
 */
function savePreferences() {
  const preferences = {
    theme: THEMES.find(t => document.body.classList.contains(t)) || 'light-theme',
    fontSize: FONT_SIZES[currentFontSizeIndex],
    wideWidth: isWideWidth
  };
  chrome.storage.sync.set({ readerPreferences: preferences });
}

/**
 * Load user preferences
 */
async function loadPreferences() {
  try {
    const { readerPreferences } = await chrome.storage.sync.get('readerPreferences');
    
    if (readerPreferences) {
      // Apply theme
      if (readerPreferences.theme) {
        document.body.className = document.body.className
          .split(' ')
          .filter(c => !THEMES.includes(c))
          .concat(readerPreferences.theme)
          .join(' ');
      }

      // Apply font size
      if (readerPreferences.fontSize) {
        currentFontSizeIndex = FONT_SIZES.indexOf(readerPreferences.fontSize);
        if (currentFontSizeIndex === -1) currentFontSizeIndex = 1;
        updateFontSize();
      }

      // Apply width
      if (readerPreferences.wideWidth) {
        isWideWidth = true;
        document.getElementById('articleContent').classList.add('wide');
      }
    }
  } catch (error) {
    console.error('Error loading preferences:', error);
  }
}

/**
 * Display error message
 */
function displayError(message) {
  const bodyEl = document.getElementById('articleBody');
  bodyEl.innerHTML = `
    <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
      <p style="font-size: 1.2em; margin-bottom: 16px;">⚠️ ${message}</p>
      <button onclick="window.close()" style="padding: 10px 20px; background: var(--link-color); color: white; border: none; border-radius: 6px; cursor: pointer;">
        Close
      </button>
    </div>
  `;
}

// ===== Text-to-Speech Functions =====

function initTtsVoices() {
  const voiceSelect = document.getElementById('ttsVoiceSelect');
  const toggleBtn = document.getElementById('ttsToggleBtn');

  if (!voiceSelect || !toggleBtn) return;

  if (!('speechSynthesis' in window)) {
    voiceSelect.disabled = true;
    toggleBtn.disabled = true;
    toggleBtn.title = 'Text-to-speech not supported';
    return;
  }

  populateVoiceSelect(speechSynthesis.getVoices());

  speechSynthesis.addEventListener('voiceschanged', () => {
    populateVoiceSelect(speechSynthesis.getVoices());
  });

  voiceSelect.addEventListener('change', () => {
    const voices = speechSynthesis.getVoices();
    ttsVoice = voices.find(voice => voice.voiceURI === voiceSelect.value) || null;
  });
}

function populateVoiceSelect(voices) {
  const voiceSelect = document.getElementById('ttsVoiceSelect');
  if (!voiceSelect) return;

  const previousValue = voiceSelect.value;
  voiceSelect.innerHTML = '';

  if (!voices || voices.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Default voice';
    voiceSelect.appendChild(option);
    ttsVoice = null;
    return;
  }

  voices.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });

  if (previousValue) {
    voiceSelect.value = previousValue;
  }

  const selected = voices.find(voice => voice.voiceURI === voiceSelect.value) || voices[0];
  voiceSelect.value = selected.voiceURI;
  ttsVoice = selected;
}

function getArticleTextForTts() {
  const bodyEl = document.getElementById('articleBody');
  return bodyEl ? bodyEl.innerText.trim() : '';
}

function buildTtsChunks(text) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks = [];
  const maxLen = 1200;

  sentences.forEach(sentence => {
    let remaining = sentence.trim();
    while (remaining.length > maxLen) {
      let splitIndex = remaining.lastIndexOf(' ', maxLen);
      if (splitIndex < 0) splitIndex = maxLen;
      chunks.push(remaining.slice(0, splitIndex));
      remaining = remaining.slice(splitIndex).trim();
    }
    if (remaining) chunks.push(remaining);
  });

  return chunks;
}

function prepareTtsHighlighting() {
  if (!wordArray || wordArray.length === 0) {
    wordArray = extractWordsFromArticle();
  }

  ttsText = getArticleTextForTts();
  ttsWordOffsets = buildWordOffsetsFromText(ttsText, wordArray);
  ttsChunkOffsets = buildChunkOffsets(ttsText, ttsQueue);
  ttsLastWordIndex = -1;

  if (ttsPrevFlashMode === null) {
    ttsPrevFlashMode = flashMode;
  }

  if (flashMode !== 'inline-line') {
    changeFlashMode('inline-line');
    const modeSelect = document.getElementById('flashModeSelect');
    if (modeSelect) modeSelect.value = 'inline-line';
  }
}

function buildWordOffsetsFromText(text, words) {
  const offsets = [];
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

function buildChunkOffsets(text, chunks) {
  const offsets = [];
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

function getWordIndexFromCharOffset(offset) {
  if (!ttsWordOffsets || ttsWordOffsets.length === 0) return -1;

  let low = 0;
  let high = ttsWordOffsets.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (ttsWordOffsets[mid] <= offset) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function clearTtsLineHighlight() {
  const prevOverlay = document.querySelector('.flash-line-highlight-overlay');
  if (prevOverlay) prevOverlay.remove();
}

function restoreTtsFlashMode() {
  if (ttsPrevFlashMode !== null && ttsPrevFlashMode !== flashMode) {
    changeFlashMode(ttsPrevFlashMode);
    const modeSelect = document.getElementById('flashModeSelect');
    if (modeSelect) modeSelect.value = ttsPrevFlashMode;
  }
  ttsPrevFlashMode = null;
}

function startTtsPlayback() {
  const text = getArticleTextForTts();
  if (!text) return;

  speechSynthesis.cancel();
  ttsQueue = buildTtsChunks(text);
  ttsQueueIndex = 0;
  ttsIsPaused = false;
  prepareTtsHighlighting();

  updateTtsButton('playing');
  speakNextTtsChunk();
}

function speakNextTtsChunk() {
  if (ttsQueueIndex >= ttsQueue.length) {
    updateTtsButton('stopped');
    clearTtsLineHighlight();
    restoreTtsFlashMode();
    return;
  }

  const chunk = ttsQueue[ttsQueueIndex];
  const chunkStartOffset = ttsChunkOffsets[ttsQueueIndex] || 0;
  const initialWordIndex = getWordIndexFromCharOffset(chunkStartOffset);
  if (initialWordIndex >= 0 && initialWordIndex !== ttsLastWordIndex) {
    ttsLastWordIndex = initialWordIndex;
    highlightLine(initialWordIndex);
  }

  ttsUtterance = new SpeechSynthesisUtterance(chunk);
  if (ttsVoice) ttsUtterance.voice = ttsVoice;

  ttsUtterance.onboundary = (event) => {
    if (typeof event.charIndex !== 'number') return;
    const globalOffset = chunkStartOffset + event.charIndex;
    const wordIndex = getWordIndexFromCharOffset(globalOffset);
    if (wordIndex >= 0 && wordIndex !== ttsLastWordIndex) {
      ttsLastWordIndex = wordIndex;
      highlightLine(wordIndex);
    }
  };

  ttsUtterance.onend = () => {
    if (!ttsIsPaused) {
      ttsQueueIndex++;
      speakNextTtsChunk();
    }
  };

  ttsUtterance.onerror = () => {
    ttsQueueIndex++;
    speakNextTtsChunk();
  };

  speechSynthesis.speak(ttsUtterance);
}

function pauseTtsPlayback() {
  ttsIsPaused = true;
  speechSynthesis.pause();
  updateTtsButton('paused');
}

function resumeTtsPlayback() {
  ttsIsPaused = false;
  speechSynthesis.resume();
  updateTtsButton('playing');
}

function stopTtsPlayback() {
  ttsIsPaused = false;
  ttsQueue = [];
  ttsQueueIndex = 0;
  speechSynthesis.cancel();
  clearTtsLineHighlight();
  restoreTtsFlashMode();
  updateTtsButton('stopped');
}

function updateTtsButton(state) {
  const ttsBtn = document.getElementById('ttsToggleBtn');
  if (!ttsBtn) return;

  const playIcon = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M5 9v6h4l5 4V5l-5 4H5z"/>
      <path d="M16 8c1 .8 1.5 1.8 1.5 3s-.5 2.2-1.5 3"/>
    </svg>`;
  const pauseIcon = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M5 9v6h4l5 4V5l-5 4H5z"/>
      <rect x="16" y="7" width="3" height="10"/>
      <rect x="20" y="7" width="3" height="10"/>
    </svg>`;

  if (state === 'playing') {
    ttsBtn.innerHTML = pauseIcon;
    ttsBtn.title = 'Pause';
  } else {
    ttsBtn.innerHTML = playIcon;
    ttsBtn.title = 'Listen';
  }
}

async function sendArticleToWebapp() {
  if (!TTS_WEBAPP_URL || TTS_WEBAPP_URL.includes('your-webapp')) {
    alert('Set TTS_WEBAPP_URL in reader.js');
    return;
  }

  const articleBody = document.getElementById('articleBody');
  if (!articleBody) return;

  let cssText = '';
  try {
    const cssUrl = chrome.runtime.getURL('reader.css');
    const cssResponse = await fetch(cssUrl);
    cssText = await cssResponse.text();
  } catch (error) {
    console.warn('Failed to load reader.css for webapp handoff:', error);
  }

  const payload = {
    type: 'readeasy-article',
    title: document.getElementById('articleTitle')?.textContent || '',
    byline: document.getElementById('articleByline')?.textContent || '',
    siteName: document.getElementById('articleSite')?.textContent || '',
    sourceUrl: document.getElementById('sourceLink')?.href || '',
    html: articleBody.innerHTML,
    cssText
  };

  const targetOrigin = new URL(TTS_WEBAPP_URL).origin;
  const webappWindow = window.open(TTS_WEBAPP_URL, '_blank');
  if (!webappWindow) {
    alert('Please allow popups for this site.');
    return;
  }

  const sendPayload = () => webappWindow.postMessage(payload, targetOrigin);

  const handler = (event) => {
    if (event.origin === targetOrigin && event.data === 'readeasy-ready') {
      sendPayload();
      window.removeEventListener('message', handler);
    }
  };

  window.addEventListener('message', handler);
  setTimeout(sendPayload, 1500);
}

// ===== Flash It Speed Reading Functions =====

/**
 * Extract all words from article body and wrap them in spans
 */
function extractWordsFromArticle() {
  const articleBody = document.getElementById('articleBody');
  if (!articleBody) return [];
  
  const words = [];
  let wordIndex = 0;
  
  // Recursive function to traverse text nodes
  function traverseNodes(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text.trim().length === 0) return;
      
      // Split into words while preserving whitespace
      const parts = text.split(/(\s+)/);
      const fragment = document.createDocumentFragment();
      
      parts.forEach(part => {
        if (part.trim().length > 0) {
          // Create span for word
          const span = document.createElement('span');
          span.className = 'flash-word';
          span.setAttribute('data-word-index', wordIndex);
          span.textContent = part;
          fragment.appendChild(span);
          
          // Store word info
          words.push({
            text: part,
            element: span,
            length: part.length,
            index: wordIndex
          });
          
          wordIndex++;
        } else if (part.length > 0) {
          // Preserve whitespace
          fragment.appendChild(document.createTextNode(part));
        }
      });
      
      // Replace text node with wrapped words
      if (node.parentNode) {
        node.parentNode.replaceChild(fragment, node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Skip script, style, and SVG elements
      const tagName = node.tagName.toLowerCase();
      if (tagName === 'script' || tagName === 'style' || tagName === 'svg') {
        return;
      }
      
      // Traverse child nodes
      const children = Array.from(node.childNodes);
      children.forEach(child => traverseNodes(child));
    }
  }
  
  traverseNodes(articleBody);
  return words;
}

/**
 * Calculate adaptive delay based on word length and base speed
 */
function calculateWordDelay(word, baseSpeed) {
  // Convert WPM to milliseconds per word
  const baseDelay = (60 / baseSpeed) * 1000;
  
  const wordLength = word.length;
  
  // Adaptive multipliers based on word length
  if (wordLength <= 3) return Math.round(baseDelay * 0.8);
  if (wordLength <= 8) return Math.round(baseDelay);
  if (wordLength <= 12) return Math.round(baseDelay * 1.3);
  return Math.round(baseDelay * 1.5);
}

/**
 * Add pause after punctuation
 */
function getPunctuationPause(word) {
  const lastChar = word.charAt(word.length - 1);
  if (lastChar === '.' || lastChar === '!' || lastChar === '?') {
    return 300; // Extra 300ms pause after sentence endings
  }
  if (lastChar === ',' || lastChar === ';' || lastChar === ':') {
    return 150; // Extra 150ms pause after commas/semicolons
  }
  return 0;
}

/**
 * Get all words on the same line as the given word
 */
function getWordsOnLine(wordIndex) {
  if (wordIndex < 0 || wordIndex >= wordArray.length) return [];
  
  const targetWord = wordArray[wordIndex];
  const targetRect = targetWord.element.getBoundingClientRect();
  const targetTop = targetRect.top;
  const tolerance = 5; // pixels, for matching line heights
  
  const wordsOnLine = [];
  for (let i = 0; i < wordArray.length; i++) {
    const wordRect = wordArray[i].element.getBoundingClientRect();
    // Check if word is approximately on the same vertical line
    if (Math.abs(wordRect.top - targetTop) < tolerance) {
      wordsOnLine.push(i);
    }
  }
  
  return wordsOnLine;
}

/**
 * Highlight all words on a line
 */
function highlightLine(wordIndex) {
  // Remove previous highlight overlay
  const prevOverlay = document.querySelector('.flash-line-highlight-overlay');
  if (prevOverlay) {
    prevOverlay.remove();
  }
  
  if (wordIndex < 0 || wordIndex >= wordArray.length) return;
  
  // Get all words on this line
  const wordsOnLine = getWordsOnLine(wordIndex);
  if (wordsOnLine.length === 0) return;
  
  // Get the parent element of the first word to calculate relative position
  const firstWord = wordArray[wordsOnLine[0]].element;
  const lastWord = wordArray[wordsOnLine[wordsOnLine.length - 1]].element;
  const articleBody = document.getElementById('articleBody');
  
  // Get positions relative to articleBody
  const articleRect = articleBody.getBoundingClientRect();
  const firstRect = firstWord.getBoundingClientRect();
  const lastRect = lastWord.getBoundingClientRect();
  
  // Calculate position relative to article body
  const left = firstRect.left - articleRect.left;
  const top = firstRect.top - articleRect.top + articleBody.scrollTop;
  
  // Create highlight overlay
  const overlay = document.createElement('div');
  overlay.className = 'flash-line-highlight-overlay';
  overlay.style.position = 'absolute';
  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
  overlay.style.width = `${lastRect.right - firstRect.left}px`;
  overlay.style.height = `${firstRect.height}px`;
  overlay.style.pointerEvents = 'none';
  
  // Append to article body
  articleBody.style.position = 'relative';
  articleBody.appendChild(overlay);
  
  // Auto-scroll if needed
  scrollToWordIfNeeded(wordArray[wordIndex].element);
}

/**
 * Highlight word inline (in article body)
 */
function highlightInline(wordIndex) {
  if (flashMode === 'inline-line') {
    highlightLine(wordIndex);
  } else {
    // Remove previous highlight
    const prevHighlighted = document.querySelector('.flash-word.flash-highlight');
    if (prevHighlighted) {
      prevHighlighted.classList.remove('flash-highlight');
    }
    
    // Highlight current word
    if (wordIndex >= 0 && wordIndex < wordArray.length) {
      const wordObj = wordArray[wordIndex];
      wordObj.element.classList.add('flash-highlight');
      
      // Auto-scroll if word is off-screen
      scrollToWordIfNeeded(wordObj.element);
    }
  }
}

/**
 * Scroll to word only if it's off-screen
 */
function scrollToWordIfNeeded(element) {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const headerHeight = 60; // Fixed header height
  
  // Check if element is off-screen
  if (rect.top < headerHeight || rect.bottom > viewportHeight) {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }
}

/**
 * Display word in RSVP overlay
 */
function displayInOverlay(wordIndex) {
  const overlay = document.getElementById('flashOverlay');
  const currentWordEl = document.getElementById('flashCurrentWordDisplay');
  const prevWordEl = document.getElementById('flashPrevWord');
  const nextWordEl = document.getElementById('flashNextWord');
  const currentIndexEl = document.getElementById('flashCurrentWord');
  
  if (wordIndex >= 0 && wordIndex < wordArray.length) {
    const current = wordArray[wordIndex];
    currentWordEl.textContent = current.text;
    
    // Show previous word
    if (wordIndex > 0) {
      prevWordEl.textContent = wordArray[wordIndex - 1].text;
    } else {
      prevWordEl.textContent = '';
    }
    
    // Show next word
    if (wordIndex < wordArray.length - 1) {
      nextWordEl.textContent = wordArray[wordIndex + 1].text;
    } else {
      nextWordEl.textContent = '';
    }
    
    // Update progress
    currentIndexEl.textContent = wordIndex + 1;
  }
}

/**
 * Flash next word (main display loop)
 */
function flashNextWord() {
  if (!isFlashing || isPaused) return;
  
  if (currentWordIndex >= wordArray.length) {
    // Reached end of article
    stopFlashIt();
    return;
  }
  
  const word = wordArray[currentWordIndex];
  
  // Display word based on mode
  if (flashMode === 'overlay') {
    displayInOverlay(currentWordIndex);
  } else {
    highlightInline(currentWordIndex);
  }
  
  // Save current position to session storage
  saveFlashState();
  
  // Calculate delay for this word
  const baseDelay = calculateWordDelay(word.text, flashSpeed);
  const punctuationPause = getPunctuationPause(word.text);
  const totalDelay = baseDelay + punctuationPause;
  
  // Move to next word
  currentWordIndex++;
  
  // Schedule next word
  flashTimeout = setTimeout(flashNextWord, totalDelay);
}

/**
 * Save Flash It state to session storage
 */
async function saveFlashState() {
  try {
    await chrome.storage.session.set({
      flashItState: {
        wordIndex: currentWordIndex,
        speed: flashSpeed,
        mode: flashMode,
        isPaused: isPaused
      }
    });
  } catch (error) {
    console.error('Error saving flash state:', error);
  }
}

/**
 * Load Flash It state from session storage
 */
async function loadFlashState() {
  try {
    const { flashItState } = await chrome.storage.session.get('flashItState');
    if (flashItState) {
      currentWordIndex = flashItState.wordIndex || 0;
      flashSpeed = flashItState.speed || 250;
      flashMode = flashItState.mode || 'overlay';
      isPaused = flashItState.isPaused || false;
      
      // Update UI
      document.getElementById('flashSpeed').value = flashSpeed;
      document.getElementById('flashModeSelect').value = flashMode;
      
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error loading flash state:', error);
    return false;
  }
}

/**
 * Start Flash It speed reading
 */
async function startFlashIt() {
  if (isFlashing) return;
  
  // Extract words if not already done
  if (wordArray.length === 0) {
    wordArray = extractWordsFromArticle();
    if (wordArray.length === 0) {
      alert('No readable content found in this article.');
      return;
    }
  }
  
  // Load saved state if exists
  const hasState = await loadFlashState();
  
  // Set state
  isFlashing = true;
  isPaused = false;
  
  // Show overlay if in overlay mode
  if (flashMode === 'overlay') {
    const overlay = document.getElementById('flashOverlay');
    overlay.classList.add('show');
    document.getElementById('flashTotalWords').textContent = wordArray.length;
  }
  
  // Update UI
  updateFlashButtons('playing');
  
  // Start flashing
  flashNextWord();
}

/**
 * Pause Flash It
 */
function pauseFlashIt() {
  if (!isFlashing) return;
  
  isPaused = true;
  
  // Clear timeout
  if (flashTimeout) {
    clearTimeout(flashTimeout);
    flashTimeout = null;
  }
  
  // Update UI
  updateFlashButtons('paused');
  
  // Save state
  saveFlashState();
}

/**
 * Resume Flash It
 */
function resumeFlashIt() {
  if (!isFlashing) return;
  
  isPaused = false;
  
  // Update UI
  updateFlashButtons('playing');
  
  // Continue flashing
  flashNextWord();
}

/**
 * Restart Flash It from beginning
 */
function restartFlashIt() {
  // Clear timeout
  if (flashTimeout) {
    clearTimeout(flashTimeout);
    flashTimeout = null;
  }
  
  // Reset index
  currentWordIndex = 0;
  isPaused = false;
  
  // If already flashing, restart
  if (isFlashing) {
    updateFlashButtons('playing');
    flashNextWord();
  }
  
  // Save state
  saveFlashState();
}

/**
 * Stop Flash It and cleanup
 */
function stopFlashIt() {
  if (!isFlashing) return;
  
  isFlashing = false;
  isPaused = false;
  
  // Clear timeout
  if (flashTimeout) {
    clearTimeout(flashTimeout);
    flashTimeout = null;
  }
  
  // Remove highlights
  const highlighted = document.querySelector('.flash-word.flash-highlight');
  if (highlighted) {
    highlighted.classList.remove('flash-highlight');
  }
  
  // Hide overlay
  const overlay = document.getElementById('flashOverlay');
  overlay.classList.remove('show');
  
  // Update UI
  updateFlashButtons('stopped');
  
  // Clear session storage
  try {
    chrome.storage.session.remove('flashItState');
  } catch (error) {
    console.error('Error clearing flash state:', error);
  }
}

/**
 * Change Flash It display mode
 */
function changeFlashMode(newMode) {
  const wasFlashing = isFlashing && !isPaused;
  const wasPaused = isPaused;
  
  // Pause if playing
  if (wasFlashing) {
    pauseFlashIt();
  }
  
  // Change mode
  flashMode = newMode;
  
  // Handle overlay visibility
  const overlay = document.getElementById('flashOverlay');
  if (flashMode === 'overlay' && isFlashing) {
    overlay.classList.add('show');
    document.getElementById('flashTotalWords').textContent = wordArray.length;
    // Show current word in overlay when switching to overlay mode
    if (wasPaused && currentWordIndex > 0) {
      displayInOverlay(currentWordIndex - 1);
    }
  } else {
    overlay.classList.remove('show');
    // Show current word inline when switching to inline mode
    if (wasPaused && currentWordIndex > 0) {
      highlightInline(currentWordIndex - 1);
    }
  }
  
  // Resume if was playing
  if (wasFlashing) {
    resumeFlashIt();
  }
  
  // Save state
  saveFlashState();
}

/**
 * Update Flash It speed
 */
function updateFlashSpeed(newSpeed) {
  flashSpeed = parseInt(newSpeed);
  
  // If currently playing, restart with new speed
  if (isFlashing && !isPaused) {
    // Clear current timeout
    if (flashTimeout) {
      clearTimeout(flashTimeout);
      flashTimeout = null;
    }
    // Restart immediately with new speed
    flashNextWord();
  }
  
  // Save state
  saveFlashState();
}

/**
 * Update Flash It control buttons visibility
 */
function updateFlashButtons(state) {
  const flashBtn = document.getElementById('flashBtn');
  const restartBtn = document.getElementById('flashRestart');
  const overlayToggleBtn = document.getElementById('flashOverlayToggle');
  
  const playIcon = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  `;
  const pauseIcon = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="6" y="4" width="4" height="16"/>
      <rect x="14" y="4" width="4" height="16"/>
    </svg>
  `;
  const overlayPlayIcon = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  `;
  const overlayPauseIcon = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="6" y="4" width="4" height="16"/>
      <rect x="14" y="4" width="4" height="16"/>
    </svg>
  `;
  
  if (state === 'playing') {
    flashBtn.classList.add('active');
    flashBtn.innerHTML = pauseIcon;
    flashBtn.title = 'Pause';
    restartBtn.style.display = 'flex';
    overlayToggleBtn.innerHTML = overlayPauseIcon;
  } else if (state === 'paused') {
    flashBtn.classList.add('active');
    flashBtn.innerHTML = playIcon;
    flashBtn.title = 'Resume';
    restartBtn.style.display = 'flex';
    overlayToggleBtn.innerHTML = overlayPlayIcon;
  } else {
    flashBtn.classList.remove('active');
    flashBtn.innerHTML = playIcon;
    flashBtn.title = 'Start speed reading';
    restartBtn.style.display = 'none';
    overlayToggleBtn.innerHTML = overlayPauseIcon;
  }
}

/**
 * Open download modal
``` */
function openDownloadModal() {
  const modal = document.getElementById('downloadModal');
  const filenameInput = document.getElementById('filenameInput');
  
  // Set default filename from article title
  const title = document.getElementById('articleTitle').textContent;
  const defaultFilename = title
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .substring(0, 50)
    .toLowerCase();
  
  modal.classList.add('show');
  filenameInput.value = defaultFilename;
  filenameInput.focus();
  filenameInput.select();
}

/**
 * Close download modal
 */
function closeDownloadModal() {
  const modal = document.getElementById('downloadModal');
  modal.classList.remove('show');
}

/**
 * Download article as HTML file
 */
function downloadArticleHTML() {
  const filenameInput = document.getElementById('filenameInput');
  let filename = filenameInput.value.trim();
  
  // Validate filename
  if (!filename) {
    alert('Please enter a filename');
    filenameInput.focus();
    return;
  }
  
  // Sanitize filename
  filename = filename.replace(/[^a-z0-9_-]/gi, '_');
  
  // Get article data
  const title = document.getElementById('articleTitle').textContent;
  const byline = document.getElementById('articleByline').textContent;
  const siteName = document.getElementById('articleSite').textContent;
  const bodyHtml = document.getElementById('articleBody').innerHTML;
  const sourceLinkEl = document.getElementById('sourceLink');
  const sourceLink = sourceLinkEl ? sourceLinkEl.href : window.location.href;
  
  // Build complete HTML document with inline styles
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      font-size: 18px;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #ffffff;
      padding: 40px 20px;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
    }
    .article-header {
      margin-bottom: 40px;
      padding-bottom: 30px;
      border-bottom: 1px solid #e0e0e0;
    }
    h1 {
      font-size: 2.5em;
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 16px;
    }
    .byline, .site-name {
      color: #666666;
      font-size: 0.9em;
      margin-bottom: 8px;
    }
    .source-link {
      color: #0066cc;
      text-decoration: none;
      font-size: 0.9em;
    }
    .source-link:hover {
      text-decoration: underline;
    }
    .article-body {
      font-size: 1em;
      line-height: 1.6;
    }
    .article-body > * {
      margin-bottom: 1.5em;
    }
    .article-body h2 {
      font-size: 1.75em;
      font-weight: 600;
      margin-top: 1.5em;
      margin-bottom: 0.75em;
    }
    .article-body h3 {
      font-size: 1.5em;
      font-weight: 600;
      margin-top: 1.5em;
      margin-bottom: 0.75em;
    }
    .article-body h4 {
      font-size: 1.25em;
      font-weight: 600;
      margin-top: 1.5em;
      margin-bottom: 0.75em;
    }
    .article-body p {
      margin-bottom: 1.5em;
    }
    .article-body a {
      color: #0066cc;
      text-decoration: underline;
      text-decoration-color: #0066cc;
      text-underline-offset: 2px;
    }
    .article-body a:hover {
      text-decoration-thickness: 2px;
    }
    .article-body img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 2em 0;
      display: block;
    }
    .article-body figure {
      margin: 2em 0;
    }
    .article-body figcaption {
      font-size: 0.85em;
      color: #666666;
      text-align: center;
      margin-top: 0.5em;
      font-style: italic;
    }
    .article-body blockquote {
      border-left: 4px solid #e0e0e0;
      padding-left: 1.5em;
      margin: 2em 0;
      color: #666666;
      font-style: italic;
    }
    .article-body code {
      background-color: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }
    .article-body pre {
      background-color: #f5f5f5;
      padding: 1em;
      border-radius: 6px;
      overflow-x: auto;
      margin: 2em 0;
    }
    .article-body pre code {
      background: none;
      padding: 0;
    }
    .article-body ul, .article-body ol {
      padding-left: 2em;
      margin-bottom: 1.5em;
    }
    .article-body li {
      margin-bottom: 0.5em;
    }
    .article-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 2em 0;
    }
    .article-body th, .article-body td {
      border: 1px solid #e0e0e0;
      padding: 0.75em;
      text-align: left;
    }
    .article-body th {
      background-color: #f8f9fa;
      font-weight: 600;
    }
    .article-body hr {
      border: none;
      border-top: 1px solid #e0e0e0;
      margin: 3em 0;
    }
    .footer {
      margin-top: 60px;
      padding-top: 30px;
      border-top: 1px solid #e0e0e0;
      color: #666666;
      font-size: 0.85em;
      text-align: center;
    }
    @media print {
      body { padding: 20px; }
      .footer { page-break-before: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="article-header">
      <h1>${title}</h1>
      ${byline ? `<div class="byline">By ${byline}</div>` : ''}
      ${siteName ? `<div class="site-name">${siteName}</div>` : ''}
      <a href="${sourceLink}" class="source-link" target="_blank">View Original Article</a>
    </header>
    
    <main class="article-body">
      ${bodyHtml}
    </main>
    
    <footer class="footer">
      <p>Downloaded from ReadEasy Extension</p>
      <p>Original source: <a href="${sourceLink}" target="_blank">${sourceLink}</a></p>
    </footer>
  </div>
</body>
</html>`;
  
  // Create blob and download
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  // Clean up
  URL.revokeObjectURL(url);
  
  // Close modal
  closeDownloadModal();
  
  // Show confirmation
  showNotification('✓ Article downloaded successfully!');
}

/**
 * Convert HTML to XHTML-compliant format for EPUB
 */
function htmlToXHTML(html) {
  // Create a temporary div to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Self-close void elements
  const voidElements = ['img', 'br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];
  
  voidElements.forEach(tag => {
    const elements = temp.getElementsByTagName(tag);
    Array.from(elements).forEach(el => {
      if (!el.outerHTML.endsWith('/>') && !el.outerHTML.endsWith(' />')) {
        const clone = el.cloneNode(true);
        // Mark for self-closing
        clone.setAttribute('data-self-close', 'true');
        el.replaceWith(clone);
      }
    });
  });
  
  // Get the HTML and fix self-closing tags
  let xhtml = temp.innerHTML;
  
  // Replace unclosed void elements with self-closing versions
  voidElements.forEach(tag => {
    // Match opening tags that aren't already self-closed
    const regex = new RegExp(`<${tag}([^>]*?)(?<!/)>`, 'gi');
    xhtml = xhtml.replace(regex, `<${tag}$1 />`);
  });
  
  // Remove data-self-close attributes
  xhtml = xhtml.replace(/\s+data-self-close="true"/g, '');
  
  // Ensure all & are properly escaped (but not already escaped ones)
  xhtml = xhtml.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
  
  return xhtml;
}

/**
 * Download article as EPUB file
 */
async function downloadArticleEPUB() {
  // Get article data
  const title = document.getElementById('articleTitle').textContent;
  const byline = document.getElementById('articleByline').textContent || 'Unknown Author';
  const siteName = document.getElementById('articleSite').textContent || 'Unknown Source';
  let bodyHtml = document.getElementById('articleBody').innerHTML;
  const sourceLinkEl = document.getElementById('sourceLink');
  const sourceLink = sourceLinkEl ? sourceLinkEl.href : window.location.href;
  
  // PRE-LOAD: Ensure ALL images are fully loaded before proceeding
  const images = document.getElementById('articleBody').querySelectorAll('img');
  console.log(`Pre-loading ${images.length} images for EPUB...`);
  
  await Promise.all(Array.from(images).map(img => {
    if (!img.src || img.src.startsWith('data:')) return Promise.resolve();
    
    return new Promise((resolve) => {
      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        console.log(`✓ Already loaded: ${img.naturalWidth}x${img.naturalHeight}`);
        resolve();
      } else {
        console.log(`Waiting for: ${img.src}`);
        const timeout = setTimeout(() => {
          console.error(`Timeout loading: ${img.src}`);
          resolve(); // Resolve anyway to not block
        }, 20000);
        
        img.onload = () => {
          clearTimeout(timeout);
          console.log(`✓ Loaded: ${img.naturalWidth}x${img.naturalHeight}`);
          resolve();
        };
        img.onerror = () => {
          clearTimeout(timeout);
          console.error(`✗ Failed to load: ${img.src}`);
          resolve(); // Resolve anyway to not block other images
        };
      }
    });
  }));
  
  console.log(`All images pre-loaded. Converting to base64...`);
  
  // Extract and convert images to base64
  const imageMap = new Map();
  let imageIndex = 0;
  
  for (const img of images) {
    const src = img.src;
    if (!src || src.startsWith('data:')) continue;
    
    // Skip images that failed to load
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    
    if (!width || !height) {
      console.warn(`Skipping image with invalid dimensions (${width}x${height}): ${src}`);
      continue;
    }
    
    try {
      // Use canvas to convert the displayed image to base64
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      // Convert to base64 PNG
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      
      if (!base64 || base64.length < 100) {
        console.error(`Base64 conversion failed or too small: ${base64?.length || 0} bytes`);
        continue;
      }
      
      const mimeType = 'image/png';
      const imageName = `image_${imageIndex}.png`;
      
      imageMap.set(src, { name: imageName, base64, mimeType });
      imageIndex++;
      console.log(`✓ Embedded: ${imageName} - ${width}x${height} (${Math.round(base64.length/1024)}KB)`);
    } catch (error) {
      console.error(`Failed to embed image: ${src}`, error.message);
    }
  }
  
  console.log(`Replacing ${imageMap.size} image URLs in HTML...`);
  
  // Replace image URLs in HTML with embedded paths
  // Must handle both decoded URLs (from img.src) and HTML-encoded versions (& vs &amp;)
  imageMap.forEach((imageData, originalSrc) => {
    // Create encoded version of URL (& → &amp;)
    const encodedSrc = originalSrc.replace(/&/g, '&amp;');
    
    // Escape special regex characters for both versions
    const decodedRegex = new RegExp(originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const encodedRegex = new RegExp(encodedSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    
    // Replace both versions
    bodyHtml = bodyHtml.replace(decodedRegex, `images/${imageData.name}`);
    bodyHtml = bodyHtml.replace(encodedRegex, `images/${imageData.name}`);
    
    console.log(`✓ Replaced: ${imageData.name}`);
  });
  
  console.log('URL replacement complete.');
  
  // Convert HTML to XHTML for EPUB compatibility
  const bodyXHTML = htmlToXHTML(bodyHtml);
  
  // Generate filename
  const filename = title
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .substring(0, 50)
    .toLowerCase();
  
  // Create EPUB content
  const uuid = 'urn:uuid:' + generateUUID();
  const timestamp = new Date().toISOString();
  
  // EPUB structure files
  const mimetype = 'application/epub+zip';
  
  const containerXML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  
  const contentOPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${uuid}</dc:identifier>
    <dc:title>${escapeXML(title)}</dc:title>
    <dc:creator>${escapeXML(byline)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:publisher>ReadEasy</dc:publisher>
    <dc:date>${timestamp}</dc:date>
    <dc:source>${escapeXML(sourceLink)}</dc:source>
    <meta property="dcterms:modified">${timestamp}</meta>
  </metadata>
  <manifest>
    <item id="content" href="content.html" media-type="application/xhtml+xml"/>
    <item id="style" href="style.css" media-type="text/css"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${Array.from(imageMap.values()).map((img, idx) => 
      `<item id="img${idx}" href="images/${img.name}" media-type="${img.mimeType}"/>`
    ).join('\n    ')}
  </manifest>
  <spine>
    <itemref idref="content"/>
  </spine>
</package>`;
  
  const navXHTML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Navigation</title>
</head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol>
      <li><a href="content.html">${escapeXML(title)}</a></li>
    </ol>
  </nav>
</body>
</html>`;
  
  const styleCSS = `body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
  font-size: 1.1em;
  line-height: 1.6;
  color: #1a1a1a;
  margin: 1em;
  padding: 0;
}
h1, h2, h3, h4, h5, h6 {
  font-weight: 600;
  line-height: 1.3;
  margin-top: 1.5em;
  margin-bottom: 0.75em;
}
h1 { font-size: 2em; }
h2 { font-size: 1.5em; }
h3 { font-size: 1.25em; }
p {
  margin-bottom: 1em;
}
a {
  color: #0066cc;
  text-decoration: underline;
}
img {
  max-width: 100%;
  height: auto;
  margin: 1em 0;
}
blockquote {
  border-left: 4px solid #ccc;
  padding-left: 1em;
  margin: 1em 0;
  font-style: italic;
}
code {
  background-color: #f5f5f5;
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: monospace;
}
pre {
  background-color: #f5f5f5;
  padding: 1em;
  overflow-x: auto;
  border-radius: 6px;
}
ul, ol {
  padding-left: 2em;
  margin-bottom: 1em;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
}
th, td {
  border: 1px solid #ddd;
  padding: 0.5em;
  text-align: left;
}
th {
  background-color: #f5f5f5;
  font-weight: 600;
}
.article-meta {
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 1em;
  margin-bottom: 2em;
}
.byline, .source {
  color: #666;
  font-size: 0.9em;
  margin-top: 0.5em;
}`;
  
  const contentHTML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXML(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <div class="article-meta">
    <h1>${escapeXML(title)}</h1>
    ${byline ? `<p class="byline">By ${escapeXML(byline)}</p>` : ''}
    ${siteName ? `<p class="source">${escapeXML(siteName)}</p>` : ''}
    <p class="source"><a href="${escapeXML(sourceLink)}">View Original Article</a></p>
  </div>
  <div class="article-body">
    ${bodyXHTML}
  </div>
  <hr/>
  <p style="font-size: 0.9em; color: #666;">Downloaded from ReadEasy Extension</p>
</body>
</html>`;
  
  // Create ZIP file with embedded images
  createEPUBZip({
    'mimetype': mimetype,
    'META-INF/container.xml': containerXML,
    'OEBPS/content.opf': contentOPF,
    'OEBPS/nav.xhtml': navXHTML,
    'OEBPS/style.css': styleCSS,
    'OEBPS/content.html': contentHTML
  }, filename, imageMap);
}

/**
 * Generate a simple UUID v4
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Escape XML special characters
 */
function escapeXML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Create EPUB ZIP file using basic ZIP implementation
 */
function createEPUBZip(files, filename, imageMap = new Map()) {
  // Check if JSZip is available
  if (typeof JSZip === 'undefined') {
    alert('EPUB generation requires JSZip library. Downloading as HTML instead.');
    openDownloadModal();
    return;
  }
  
  const zip = new JSZip();
  
  // Add mimetype file (must be first and uncompressed)
  zip.file('mimetype', files['mimetype'], { compression: 'STORE' });
  
  // Add META-INF folder
  zip.file('META-INF/container.xml', files['META-INF/container.xml']);
  
  // Add OEBPS folder with content
  zip.file('OEBPS/content.opf', files['OEBPS/content.opf']);
  zip.file('OEBPS/nav.xhtml', files['OEBPS/nav.xhtml']);
  zip.file('OEBPS/style.css', files['OEBPS/style.css']);
  zip.file('OEBPS/content.html', files['OEBPS/content.html']);
  
  // Add images to EPUB
  imageMap.forEach((imageData) => {
    zip.file(`OEBPS/images/${imageData.name}`, imageData.base64, { base64: true });
  });
  
  console.log(`Added ${imageMap.size} images to EPUB`);
  
  // Generate the EPUB file
  zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
    .then(function(blob) {
      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.epub`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Show success notification
      showNotification('✓ EPUB file downloaded successfully!');
    })
    .catch(function(error) {
      console.error('Error generating EPUB:', error);
      alert('Failed to generate EPUB file. Please try again.');
    });
}

/**
 * Show notification message
 */
function showNotification(message) {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    background: #4caf50;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    font-size: 14px;
    font-weight: 500;
    z-index: 3000;
    animation: slideInUp 0.3s;
  `;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOutDown 0.3s';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Open email EPUB modal
 */
function openEmailEpubModal() {
  const modal = document.getElementById('emailEpubModal');
  const emailInput = document.getElementById('recipientEmailInput');
  modal.classList.add('show');
  emailInput.value = '';
  emailInput.focus();
}

/**
 * Close email EPUB modal
 */
function closeEmailEpubModal() {
  const modal = document.getElementById('emailEpubModal');
  modal.classList.remove('show');
}

/**
 * Email article as EPUB file
 */
function emailArticleEPUB() {
  const emailInput = document.getElementById('recipientEmailInput');
  const recipientEmail = emailInput.value.trim();
  
  // Validate email
  if (!recipientEmail) {
    alert('Please enter a recipient email address');
    emailInput.focus();
    return;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    alert('Please enter a valid email address');
    emailInput.focus();
    return;
  }
  
  // Close modal
  closeEmailEpubModal();
  
  // Get article data
  const title = document.getElementById('articleTitle').textContent;
  const filename = title
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .substring(0, 50)
    .toLowerCase();
  
  // Show instructions
  showEmailInstructions(recipientEmail, filename, title);
  
  // Generate and download EPUB
  downloadArticleEPUB();
  
  // Open email client after a short delay (to allow download to start)
  setTimeout(() => {
    const subject = encodeURIComponent(`Article: ${title}`);
    const body = encodeURIComponent(
      `Hi,\n\nI'm sharing this article with you: "${title}"\n\n` +
      `I've attached it as an EPUB file that you can read on any ebook reader or device.\n\n` +
      `Best regards`
    );
    
    window.location.href = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
  }, 1000);
}

/**
 * Show email instructions overlay
 */
function showEmailInstructions(email, filename, title) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    z-index: 5000;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.3s;
  `;
  
  const card = document.createElement('div');
  card.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 32px;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    animation: slideUp 0.3s;
  `;
  
  card.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">📧</div>
      <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 1.5em;">Email Instructions</h2>
      <div style="text-align: left; line-height: 1.6; color: #333; margin-bottom: 24px;">
        <p style="margin-bottom: 12px;">✅ <strong>EPUB file is downloading...</strong></p>
        <p style="margin-bottom: 12px;">✉️ <strong>Your email client will open shortly</strong></p>
        <p style="margin-bottom: 12px;">📎 <strong>Please attach the downloaded file:</strong><br/>
        <code style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px; font-size: 0.9em;">${filename}.epub</code></p>
        <p style="margin-bottom: 0;">📨 <strong>To:</strong> ${email}</p>
      </div>
      <button id="gotItBtn" style="
        background: #4caf50;
        color: white;
        border: none;
        padding: 12px 32px;
        font-size: 16px;
        font-weight: 600;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.2s;
      ">Got it!</button>
    </div>
  `;
  
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  
  // Close on button click
  const gotItBtn = card.querySelector('#gotItBtn');
  gotItBtn.addEventListener('click', () => {
    overlay.style.animation = 'fadeOut 0.3s';
    setTimeout(() => overlay.remove(), 300);
  });
  
  // Close on outside click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.style.animation = 'fadeOut 0.3s';
      setTimeout(() => overlay.remove(), 300);
    }
  });
  
  // Auto-close after 8 seconds
  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.style.animation = 'fadeOut 0.3s';
      setTimeout(() => overlay.remove(), 300);
    }
  }, 8000);
}
