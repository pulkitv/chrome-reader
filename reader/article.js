/**
 * reader/article.js — Article loading, sanitization, saving, and notifications.
 *
 * Exports:
 *   loadArticle()           — reads currentArticle from session storage and renders it
 *   sanitizeHtml(html)      — strips scripts/event-handlers/iframes from raw HTML
 *   setupLazyLoading()      — IntersectionObserver-based lazy loader for article images
 *   displayError(message)   — renders an error state inside #articleBody
 *   fetchImageAsPng(url)    — fetches a remote image and returns a PNG data-URL
 *   handleAddToReadingList()— converts images to base64 and saves to the reading list
 *   showNotification(msg, type) — shows a toast notification (type: 'info'|'success'|'error')
 */

/* global chrome */

import { state } from './state.js';
import { refreshSavedArticlesCount } from './cloud-count.js';

// ── Article rendering ─────────────────────────────────────────────────────────

/**
 * Read the current article from session storage and populate the reader DOM.
 * Called once on DOMContentLoaded.
 */
export async function loadArticle() {
  try {
    const { currentArticle } = await chrome.storage.session.get('currentArticle');

    if (!currentArticle) {
      displayError('No article found. Please try again.');
      return;
    }
    if (!currentArticle.content) {
      displayError('Could not extract readable content from this page.');
      return;
    }

    document.title = currentArticle.title || 'ReadEasy';

    const titleEl   = document.getElementById('articleTitle');
    const bylineEl  = document.getElementById('articleByline');
    const siteEl    = document.getElementById('articleSite');
    const bodyEl    = document.getElementById('articleBody');
    const sourceLink = document.getElementById('sourceLink');

    titleEl.textContent = currentArticle.title || 'Untitled';

    if (currentArticle.byline) {
      bylineEl.textContent = `By ${currentArticle.byline}`;
      bylineEl.style.display = 'block';
    } else {
      bylineEl.style.display = 'none';
    }

    if (currentArticle.siteName) {
      siteEl.textContent    = currentArticle.siteName;
      siteEl.style.display  = 'block';
    } else {
      siteEl.style.display = 'none';
    }

    if (currentArticle.sourceUrl && sourceLink) {
      sourceLink.href = currentArticle.sourceUrl;
    }

    bodyEl.innerHTML = sanitizeHtml(currentArticle.content);

    setupLazyLoading();
  } catch (error) {
    console.error('[ReadEasy] Error loading article:', error);
    displayError('Failed to load article content.');
  }
}

/**
 * Strip scripts, on* event attributes, and iframes from raw HTML.
 * Iframes are replaced with a plain link to preserve the referenced URL.
 */
export function sanitizeHtml(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  temp.querySelectorAll('script').forEach(el => el.remove());

  temp.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
    });
  });

  temp.querySelectorAll('iframe').forEach(iframe => {
    const link = document.createElement('a');
    link.href        = iframe.src || '#';
    link.textContent = `[Embedded content: ${iframe.src || 'Unknown'}]`;
    link.target      = '_blank';
    iframe.replaceWith(link);
  });

  return temp.innerHTML;
}

/**
 * Attach an IntersectionObserver to all .article-body images that carry
 * a data-src attribute, loading them lazily as they scroll into view.
 */
export function setupLazyLoading() {
  const images = document.querySelectorAll('.article-body img');
  if (!('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      if (img.dataset.src) {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
      }
      obs.unobserve(img);
    });
  });

  images.forEach(img => observer.observe(img));
}

/**
 * Replace the article body contents with a user-facing error message.
 */
export function displayError(message) {
  const bodyEl = document.getElementById('articleBody');
  bodyEl.innerHTML = `
    <div class="reader-error-state">
      <p class="reader-error-message">⚠️ ${message}</p>
      <button onclick="window.close()" class="reader-error-close-btn">Close</button>
    </div>
  `;
}

// ── Image utilities ───────────────────────────────────────────────────────────

/**
 * Fetch a remote image and normalise it to a PNG data-URL via canvas.
 * Running inside reader.html (which has <all_urls> access) means fetch()
 * bypasses CORS. Returns null on any failure so callers can skip the image.
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
        const img   = new Image();
        img.onload  = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width  = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d').drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } catch (e) { reject(e); }
        };
        img.onerror = () => reject(new Error('Image decode failed'));
        img.src     = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (err) {
    console.warn('[ReadEasy] Image skipped:', url.substring(0, 100), '—', err.message);
    return null;
  }
}

// ── Reading list ──────────────────────────────────────────────────────────────

/**
 * Save the current article to the reading list.
 * Converts all remote images to base64 PNGs first so they are self-contained.
 * Opens the side panel immediately on the user gesture so Chrome allows it.
 * Returns a resolved Promise on success; throws on failure.
 */
export async function handleAddToReadingList() {
  const addBtn     = document.getElementById('addToListBtn');
  const btnSpan    = addBtn ? addBtn.querySelector('span') : null;
  const origText   = btnSpan ? btnSpan.textContent : 'Add to List';

  // Open the side panel on the initial user gesture (Chrome requires this)
  if (chrome.sidePanel && chrome.windows) {
    chrome.windows.getCurrent().then(win => chrome.sidePanel.open({ windowId: win.id }));
  }

  if (addBtn)   addBtn.disabled     = true;
  if (btnSpan)  btnSpan.textContent = 'Saving...';

  try {
    const title    = document.getElementById('articleTitle').textContent;
    const sourceEl = document.getElementById('sourceLink');
    const url      = sourceEl ? sourceEl.href : window.location.href;
    const siteName = document.getElementById('articleSite').textContent || new URL(url).hostname;

    // Collect remote images from the article body
    const allImages    = Array.from(document.getElementById('articleBody').querySelectorAll('img'));
    const remoteImages = allImages.filter(img =>
      img.src && (img.src.startsWith('http://') || img.src.startsWith('https://'))
    );

    if (btnSpan) btnSpan.textContent = 'Loading images...';

    // Convert all remote images to PNG data-URLs in parallel
    const conversions = await Promise.allSettled(
      remoteImages.map(img => fetchImageAsPng(img.src))
    );

    // Substitute data-URLs back into the HTML string
    let htmlContent = document.getElementById('articleBody').innerHTML;
    remoteImages.forEach((img, i) => {
      const result = conversions[i];
      if (result.status !== 'fulfilled' || !result.value) return;
      const encodedSrc = img.src.replace(/&/g, '&amp;');
      htmlContent = htmlContent.split(img.src).join(result.value);
      htmlContent = htmlContent.split(encodedSrc).join(result.value);
    });

    if (btnSpan) btnSpan.textContent = 'Saving...';

    const response = await chrome.runtime.sendMessage({
      action:  'saveToReadingList',
      article: { title, url, siteName, htmlContent }
    });

    if (!response.success) throw new Error(response.error || 'Failed to save article');
    if (response.articleId != null) state.currentArticleId = response.articleId;

    showNotification('Added to Reading List ✓', 'success');
    refreshSavedArticlesCount();
  } catch (error) {
    console.error('[ReadEasy] Error adding to reading list:', error);
    showNotification('Failed to add article: ' + error.message, 'error');
    throw error;
  } finally {
    if (addBtn)  addBtn.disabled     = false;
    if (btnSpan) btnSpan.textContent = origText;
  }
}

// ── Auto-save (silent, fire-and-forget) ───────────────────────────────────────

export async function autoSaveToReadingList() {
  try {
    const title    = document.getElementById('articleTitle').textContent;
    const sourceEl = document.getElementById('sourceLink');
    const url      = sourceEl ? sourceEl.href : window.location.href;
    const siteName = document.getElementById('articleSite').textContent
                     || new URL(url).hostname;

    const allImages    = Array.from(document.getElementById('articleBody').querySelectorAll('img'));
    const remoteImages = allImages.filter(img =>
      img.src && (img.src.startsWith('http://') || img.src.startsWith('https://'))
    );

    const conversions = await Promise.allSettled(
      remoteImages.map(img => fetchImageAsPng(img.src))
    );

    let htmlContent = document.getElementById('articleBody').innerHTML;
    remoteImages.forEach((img, i) => {
      const result = conversions[i];
      if (result.status !== 'fulfilled' || !result.value) return;
      const encodedSrc = img.src.replace(/&/g, '&amp;');
      htmlContent = htmlContent.split(img.src).join(result.value);
      htmlContent = htmlContent.split(encodedSrc).join(result.value);
    });

    const response = await chrome.runtime.sendMessage({
      action:  'saveToReadingList',
      article: { title, url, siteName, htmlContent }
    });

    if (!response.success && !response.duplicate) {
      console.warn('[ReadEasy] Auto-save failed:', response.error);
    }
    if (response.articleId != null) state.currentArticleId = response.articleId;
  } catch (err) {
    console.warn('[ReadEasy] Auto-save error (non-fatal):', err.message);
  }
}

// ── Notification toast ────────────────────────────────────────────────────────

/**
 * Show a transient toast notification at the bottom of the page.
 * @param {string} message
 * @param {'info'|'success'|'error'} type
 */
export function showNotification(message, type = 'info') {
  const existing = document.querySelector('.reader-notification');
  if (existing) existing.remove();

  const el       = document.createElement('div');
  el.className   = `reader-notification notification-${type}`;
  el.textContent = message;
  document.body.appendChild(el);

  // Trigger CSS entry animation on next tick
  setTimeout(() => el.classList.add('show'), 10);

  // Auto-dismiss after 2 s
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2000);
}
