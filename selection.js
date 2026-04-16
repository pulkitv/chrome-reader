/**
 * ReadEasy Selection Content Script
 * Listens for getSelectedHTML messages from the side panel,
 * extracts the current text selection with embedded images,
 * and returns the processed HTML.
 */
(function() {
  'use strict';

  // --- Image embedding (same as reader.js / sidepanel.js) ---

  async function fetchImageAsPng(url) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(url, { credentials: 'omit', signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = objectUrl;
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      });
    } catch (e) {
      return null;
    }
  }

  // --- URL normalisation (same as content.js) ---

  function makeUrlsAbsolute(fragment, baseUrl) {
    fragment.querySelectorAll('[src]').forEach(el => {
      try {
        let src = el.getAttribute('src');
        if (src && src.includes('substackcdn.com')) {
          src = src.replace(/,w_\d+,c_limit,/, ',');
        }
        el.setAttribute('src', new URL(src, baseUrl).href);
      } catch (e) {}
    });

    fragment.querySelectorAll('[href]').forEach(el => {
      try {
        el.setAttribute('href', new URL(el.getAttribute('href'), baseUrl).href);
      } catch (e) {}
    });

    fragment.querySelectorAll('[srcset]').forEach(el => {
      el.removeAttribute('srcset');
    });

    fragment.querySelectorAll('[data-src]').forEach(img => {
      try {
        const absoluteUrl = new URL(img.getAttribute('data-src'), baseUrl).href;
        img.setAttribute('src', absoluteUrl);
        img.removeAttribute('data-src');
      } catch (e) {}
    });
  }

  // --- Process selected HTML: absolutise URLs + embed images ---

  async function processSelectedHTML(range) {
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());
    makeUrlsAbsolute(container, window.location.href);

    const images = container.querySelectorAll('img');
    await Promise.allSettled(
      Array.from(images).map(async img => {
        const dataUrl = await fetchImageAsPng(img.src);
        if (dataUrl) img.src = dataUrl;
      })
    );
    return container.innerHTML;
  }

  // --- Message listener: side panel requests the current selection ---

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== 'getSelectedHTML') return false;

    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed || !selection.toString().trim()) {
      sendResponse({ success: false, error: 'No text selected on this page.' });
      return false;
    }

    const range = selection.getRangeAt(0);

    // processSelectedHTML is async (embeds images), so return true to keep the channel open
    processSelectedHTML(range).then(htmlContent => {
      sendResponse({
        success: true,
        htmlContent,
        pageUrl: window.location.href,
        pageTitle: document.title
      });
    }).catch(err => {
      console.error('[SelectionScript] Error processing selection:', err);
      sendResponse({ success: false, error: err.message });
    });

    return true; // keep message channel open for async response
  });
})();
