(function() {
  'use strict';

  let marker = null;
  let currentSelection = null;
  let isMouseDown = false;

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

  // --- Marker helpers ---

  function updateMarkerPosition(range) {
    if (!marker) return;
    const rect = range.getBoundingClientRect();
    marker.style.top = `${rect.top + window.scrollY - 25}px`;
    marker.style.left = `${rect.right + window.scrollX - 25}px`;
  }

  function showMarker(range) {
    hideMarker(); // always clean up any existing marker first
    marker = document.createElement('div');
    marker.innerHTML = `<svg width="20" height="20" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
      <rect width="128" height="128" fill="#4285f4" rx="20"/>
      <g fill="white">
        <rect x="36" y="28" width="56" height="72" rx="4" fill="none" stroke="white" stroke-width="4"/>
        <line x1="64" y1="28" x2="64" y2="100" stroke="white" stroke-width="4"/>
        <line x1="36" y1="48" x2="92" y2="48" stroke="white" stroke-width="2" opacity="0.6"/>
        <line x1="36" y1="58" x2="92" y2="58" stroke="white" stroke-width="2" opacity="0.6"/>
        <line x1="36" y1="68" x2="92" y2="68" stroke="white" stroke-width="2" opacity="0.6"/>
        <line x1="36" y1="78" x2="92" y2="78" stroke="white" stroke-width="2" opacity="0.6"/>
      </g>
    </svg>`;
    marker.style.cssText = 'position:absolute;z-index:10000;cursor:pointer;background:rgba(255,255,255,0.9);border:1px solid #ccc;border-radius:4px;padding:2px;line-height:0;';
    updateMarkerPosition(range);

    // Clone range so it survives even if the live selection changes
    const savedRange = range.cloneRange();

    // Prevent marker clicks from clearing the selection or re-triggering mousedown
    marker.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });

    marker.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const selectedHTML = await processSelectedHTML(savedRange);
      chrome.runtime.sendMessage({
        action: 'saveToReadingList',
        article: {
          title: 'Highlighted text - ' + new Date().toLocaleDateString(),
          htmlContent: selectedHTML,
          url: window.location.href + '#highlight-' + Date.now(),
          siteName: document.title
        }
      });
      // Open the side panel to show the saved card
      chrome.runtime.sendMessage({ action: 'openSidePanel' });
      hideMarker();
    });

    document.body.appendChild(marker);
  }

  function hideMarker() {
    if (marker) {
      marker.remove();
      marker = null;
    }
  }

  // --- Event listeners ---

  // Track mouse-down so we know user is actively selecting
  document.addEventListener('mousedown', (e) => {
    // If click is on the marker itself, let the marker handle it
    if (marker && marker.contains(e.target)) return;
    isMouseDown = true;
    hideMarker();
  });

  // On mouse-up, wait a tick for the browser to finalise the selection, then show marker
  document.addEventListener('mouseup', () => {
    if (!isMouseDown) return;
    isMouseDown = false;

    // Small delay lets the browser settle the final selection range
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        if (range.toString().trim()) {
          currentSelection = range;
          showMarker(range);
          return;
        }
      }
      hideMarker();
    }, 10);
  });

  // Hide marker when selection is cleared programmatically (Ctrl+A → delete, Escape, etc.)
  document.addEventListener('selectionchange', () => {
    if (isMouseDown) return; // ignore while user is still dragging
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed || !selection.toString().trim()) {
      hideMarker();
    }
  });

  // Keep marker anchored to the selected text during scroll
  document.addEventListener('scroll', () => {
    if (!marker) return;
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
      updateMarkerPosition(selection.getRangeAt(0));
    }
  });
})();
