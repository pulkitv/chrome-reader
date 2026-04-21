/** =========================================================
 *  MODULE: Reading List — Add  |  sidepanel/reading-list-add.js
 *  Handles adding articles to the reading list:
 *  - via reader tab delegate
 *  - via Readability injection on regular tabs
 *  - via text selection capture
 *
 *  Depends on: state.js, utils.js, reading-list-render.js,
 *              tab-detection.js
 *  Exports: handleAddToListViaTab, fetchImageAsPng,
 *           handleSaveSelection, handleAddToListFromRegularTab
 * ========================================================= */

/* global chrome */

import { state } from './state.js';
import { showToast } from './utils.js';
import { initPanel } from './reading-list-render.js';
import { hideCurrentArticleSection, updateSaveSelectionVisibility } from './tab-detection.js';

const EXTRACTION_RETRY_DELAYS_MS = [0, 350, 900];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getExtractedTextLength(article) {
  if (!article || typeof article !== 'object') return 0;
  const textContent = typeof article.textContent === 'string' ? article.textContent : '';
  const normalized = textContent.replace(/\s+/g, ' ').trim();
  if (normalized.length) return normalized.length;

  const visible = Number(article.visibleTextChars);
  return Number.isFinite(visible) ? visible : 0;
}

function isExtractedArticleUsable(article) {
  return !!(article && article.content && getExtractedTextLength(article) >= 180);
}

async function extractArticleFromTabWithRetries(tabId) {
  let lastError = null;

  for (const delay of EXTRACTION_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await sleep(delay);
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        files: ['libs/Readability.js', 'content.js']
      });

      const article = results && results[0] && results[0].result;
      if (isExtractedArticleUsable(article)) {
        return article;
      }

      lastError = new Error('Could not extract enough readable content from this page.');
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Could not extract content from this page.');
}

// ── Add via reader tab ─────────────────────────────────────────────────────

/**
 * Handle add to list by delegating to the reader tab.
 * The reader tab has all the image-processing logic already.
 */
export async function handleAddToListViaTab(tabId) {
  const addBtn = document.getElementById('addToListBtn');

  try {
    addBtn.disabled = true;
    addBtn.querySelector('span').textContent = 'Saving...';

    // Tell the reader tab to save the article (it handles image conversion)
    const response = await chrome.tabs.sendMessage(tabId, { action: 'addToReadingList' });

    if (response && response.success) {
      showToast('Added to Reading List ✓', 'success', 2000);
      state.currentReaderTabId = null;
      hideCurrentArticleSection('Article saved to Reading List');
      await initPanel();
      await updateSaveSelectionVisibility();
    } else {
      throw new Error((response && response.error) || 'Failed to save article');
    }
  } catch (error) {
    console.error('[SidePanel] Error delegating add to reader tab:', error);
    showToast(error.message || 'Failed to add article', 'error');
    addBtn.disabled = false;
    addBtn.querySelector('span').textContent = 'Add to List';
  }
}

// ── Image fetching helper ──────────────────────────────────────────────────

/**
 * Fetch a remote image URL and convert to a PNG data URL.
 * Runs in the extension page context (sidepanel has <all_urls>) so fetch()
 * bypasses CORS. Normalises to PNG via canvas for maximum EPUB compatibility.
 * @param {string} url - Remote image URL
 * @returns {Promise<string|null>} PNG data URL, or null on any failure
 */
export async function fetchImageAsPng(url) {
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

    const blob      = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const img  = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width  = img.naturalWidth;
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
    console.warn('[SidePanel] Image skipped:', url.substring(0, 100), '—', err.message);
    return null;
  }
}

// ── Save selection ─────────────────────────────────────────────────────────

/**
 * Handle saving the user's text selection from the active tab.
 * Sends a message to the content script (selection.js) to extract the
 * highlighted HTML, then saves it as a reading list article.
 */
export async function handleSaveSelection(tabId) {
  const saveBtn = document.getElementById('saveSelectionBtn');

  // Preserve tab state so the button stays visible after save
  const savedRegularTabId  = state.currentRegularTabId;
  const savedRegularTabUrl = state.currentRegularTabUrl;

  try {
    saveBtn.disabled = true;
    saveBtn.querySelector('span').textContent = 'Saving…';

    // Re-query active tab for a fresh ID (avoids stale references)
    const [activeTab]  = await chrome.tabs.query({ active: true, currentWindow: true });
    const targetTabId  = (activeTab && activeTab.url && activeTab.url.startsWith('http')) ? activeTab.id : tabId;

    // Ask the content script for the current selection
    const result = await chrome.tabs.sendMessage(targetTabId, { action: 'getSelectedHTML' });

    if (!result || !result.success) {
      throw new Error((result && result.error) || 'No text selected on this page.');
    }

    // Embed remote images (re-fetch from extension context to bypass CORS)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = result.htmlContent;

    const remoteImages = Array.from(tempDiv.querySelectorAll('img')).filter(img => {
      const src = img.getAttribute('src') || '';
      return src.startsWith('http://') || src.startsWith('https://');
    });

    if (remoteImages.length > 0) {
      saveBtn.querySelector('span').textContent = 'Loading images…';
      const conversions = await Promise.allSettled(
        remoteImages.map(img => fetchImageAsPng(img.getAttribute('src')))
      );
      remoteImages.forEach((img, i) => {
        const res = conversions[i];
        if (res.status === 'fulfilled' && res.value) {
          img.setAttribute('src', res.value);
        }
      });
    }

    const htmlContent = tempDiv.innerHTML;
    saveBtn.querySelector('span').textContent = 'Saving…';

    const response = await chrome.runtime.sendMessage({
      action:  'saveToReadingList',
      article: {
        title:       'Highlighted text - ' + new Date().toLocaleDateString(),
        htmlContent,
        url:         result.pageUrl + '#highlight-' + Date.now(),
        siteName:    result.pageTitle || 'Selection'
      }
    });

    if (!response || !response.success) {
      throw new Error((response && response.error) || 'Failed to save selection');
    }

    showToast('Selection saved ✓', 'success', 2000);

    // Re-render saved list but restore tab tracking so user can save more selections
    await initPanel();
    state.currentRegularTabId  = savedRegularTabId;
    state.currentRegularTabUrl = savedRegularTabUrl;
    document.getElementById('saveSelectionSection').style.display = '';
  } catch (error) {
    console.error('[SidePanel] Error saving selection:', error);
    showToast(error.message || 'Failed to save selection', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.querySelector('span').textContent = 'Save Selection';
  }
}

// ── Add from regular tab ───────────────────────────────────────────────────

/**
 * Handle add to list for a regular (non-reader) website tab.
 * Injects Readability to extract the article, fetches all images as PNG,
 * then saves to the reading list.
 */
export async function handleAddToListFromRegularTab(tabId, tabUrl) {
  const addBtn = document.getElementById('addToListBtn');

  try {
    addBtn.disabled = true;
    addBtn.querySelector('span').textContent = 'Extracting…';

    const article = await extractArticleFromTabWithRetries(tabId);

    // Parse HTML so we can enumerate img elements
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = article.content;

    const remoteImages = Array.from(tempDiv.querySelectorAll('img')).filter(img => {
      const src = img.getAttribute('src') || '';
      return src.startsWith('http://') || src.startsWith('https://');
    });

    console.log(`[SidePanel] Fetching ${remoteImages.length} images via fetch()...`);
    addBtn.querySelector('span').textContent = 'Loading images…';

    // Fetch + convert all to PNG in parallel, skip failures
    const conversions = await Promise.allSettled(
      remoteImages.map(img => fetchImageAsPng(img.getAttribute('src')))
    );

    // Replace src attributes directly on DOM elements, then serialise once
    let succeeded = 0;
    remoteImages.forEach((img, i) => {
      const result = conversions[i];
      if (result.status !== 'fulfilled' || !result.value) return;
      img.setAttribute('src', result.value);
      succeeded++;
    });
    console.log(`[SidePanel] ${succeeded}/${remoteImages.length} images converted.`);

    const htmlContent = tempDiv.innerHTML;
    addBtn.querySelector('span').textContent = 'Saving…';

    const response = await chrome.runtime.sendMessage({
      action:  'saveToReadingList',
      article: {
        title:    article.title || 'Untitled',
        url:      tabUrl,
        siteName: article.siteName || new URL(tabUrl).hostname,
        htmlContent
      }
    });

    if (!response || !response.success) {
      throw new Error((response && response.error) || 'Failed to save article');
    }

    showToast('Added to Reading List ✓', 'success', 2000);
    state.currentRegularTabId  = null;
    state.currentRegularTabUrl = null;
    hideCurrentArticleSection('Article saved to Reading List');
    await initPanel();
    await updateSaveSelectionVisibility();
  } catch (error) {
    console.error('[SidePanel] Error saving regular tab article:', error);
    showToast(error.message || 'Failed to add article', 'error');
    addBtn.disabled = false;
    addBtn.querySelector('span').textContent = 'Add to List';
  }
}
