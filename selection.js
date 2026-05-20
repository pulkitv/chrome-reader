/**
 * ReadEasy Selection Content Script
 * Listens for getSelectedHTML messages from the side panel,
 * extracts the current text selection with embedded images,
 * and returns the processed HTML.
 */
(function() {
  'use strict';

  // Idempotency guard: allows safe reinjection (e.g. background recovery path)
  // without duplicating listeners/handlers in the same tab world.
  if (globalThis.__READEASY_SELECTION_INITIALIZED__) {
    return;
  }
  globalThis.__READEASY_SELECTION_INITIALIZED__ = true;

  const FLOATING_BTN_POS_KEY = 'floatingButtonPosition';
  const FLOATING_BUTTON_ENABLED_KEY = 'floatingButtonEnabled';
  const FLOATING_BTN_ID = 'readeasy-floating-btn';
  const FLOATING_MENU_ID = 'readeasy-floating-menu';
  const DEFAULT_OFFSET = 20;
  let floatingBtn = null;
  let floatingMenu = null;
  let floatingButtonEnabled = true;
  let hasResizeListener = false;
  let hasMenuListeners = false;
  let isDragging = false;
  let dragStarted = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let startLeft = 0;
  let startTop = 0;

  function showFloatingToast(message, type = 'error') {
    if (!document.body) return;

    const existing = document.getElementById('readeasy-floating-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'readeasy-floating-toast';
    toast.textContent = message;
    toast.style.cssText = [
      'position:fixed',
      'left:20px',
      'bottom:84px',
      'max-width:320px',
      'background:' + (type === 'error' ? '#b91c1c' : '#166534'),
      'color:#fff',
      'padding:10px 12px',
      'border-radius:8px',
      'font-size:13px',
      'font-weight:500',
      'box-shadow:0 8px 20px rgba(0,0,0,0.28)',
      'z-index:2147483647',
      'opacity:0',
      'transform:translateY(8px)',
      'transition:opacity .2s ease, transform .2s ease'
    ].join(';');

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => toast.remove(), 220);
    }, 3200);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getViewportBoundedPosition(left, top, width, height) {
    const maxLeft = Math.max(0, window.innerWidth - width - 8);
    const maxTop = Math.max(0, window.innerHeight - height - 8);
    return {
      left: clamp(left, 8, maxLeft),
      top: clamp(top, 8, maxTop)
    };
  }

  function positionFloatingButton(left, top) {
    if (!floatingBtn) return;
    const rect = floatingBtn.getBoundingClientRect();
    const bounded = getViewportBoundedPosition(left, top, rect.width || 48, rect.height || 48);
    floatingBtn.style.left = `${bounded.left}px`;
    floatingBtn.style.top = `${bounded.top}px`;
    floatingBtn.style.right = 'auto';
    floatingBtn.style.bottom = 'auto';
  }

  function handleFloatingButtonResize() {
    if (!floatingBtn) return;
    const rect = floatingBtn.getBoundingClientRect();
    positionFloatingButton(rect.left, rect.top);
    if (!floatingMenu || floatingMenu.hidden) return;
    positionFloatingMenu();
  }

  function ensureMenuListeners() {
    if (hasMenuListeners) return;
    hasMenuListeners = true;

    document.addEventListener('mousedown', (e) => {
      if (!floatingMenu || floatingMenu.hidden) return;
      if (floatingMenu.contains(e.target) || (floatingBtn && floatingBtn.contains(e.target))) return;
      closeFloatingMenu();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeFloatingMenu();
      }
    }, true);
  }

  function positionFloatingMenu() {
    if (!floatingBtn || !floatingMenu) return;

    const btnRect = floatingBtn.getBoundingClientRect();
    const menuRect = floatingMenu.getBoundingClientRect();

    // Prefer above the floater; fallback below if needed.
    const preferredLeft = btnRect.right - menuRect.width;
    const preferredTop = btnRect.top - menuRect.height - 8;
    const fallbackTop = btnRect.bottom + 8;

    let top = preferredTop;
    if (top < 8) {
      top = fallbackTop;
    }

    const bounded = getViewportBoundedPosition(
      preferredLeft,
      top,
      menuRect.width || 188,
      menuRect.height || 88
    );

    floatingMenu.style.left = `${bounded.left}px`;
    floatingMenu.style.top = `${bounded.top}px`;
  }

  function closeFloatingMenu() {
    if (!floatingMenu) return;
    floatingMenu.hidden = true;
    floatingMenu.style.display = 'none';
  }

  function openFloatingMenu() {
    if (!floatingBtn || !floatingMenu) return;
    floatingMenu.hidden = false;
    floatingMenu.style.display = 'flex';
    positionFloatingMenu();
  }

  function toggleFloatingMenu() {
    if (!floatingMenu) return;
    if (floatingMenu.hidden) {
      openFloatingMenu();
    } else {
      closeFloatingMenu();
    }
  }

  function ensureFloatingMenu() {
    if (floatingMenu || !document.body) return;

    floatingMenu = document.createElement('div');
    floatingMenu.id = FLOATING_MENU_ID;
    floatingMenu.setAttribute('data-readeasy-floating-menu', 'true');
    floatingMenu.hidden = true;
    floatingMenu.style.display = 'none';
    floatingMenu.setAttribute('role', 'menu');
    floatingMenu.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'min-width:188px',
      'background:#ffffff',
      'border:1px solid rgba(0,0,0,0.12)',
      'border-radius:10px',
      'box-shadow:0 10px 26px rgba(0,0,0,0.22)',
      'padding:6px',
      'display:none',
      'flex-direction:column',
      'gap:4px',
      'z-index:2147483647'
    ].join(';');

    const readViewBtn = document.createElement('button');
    readViewBtn.type = 'button';
    readViewBtn.setAttribute('role', 'menuitem');
    readViewBtn.textContent = 'Switch to reading view';
    readViewBtn.style.cssText = [
      'width:100%',
      'border:none',
      'background:transparent',
      'padding:8px 10px',
      'text-align:left',
      'font-size:13px',
      'color:#111827',
      'border-radius:8px',
      'cursor:pointer'
    ].join(';');
    readViewBtn.addEventListener('mouseenter', () => {
      readViewBtn.style.background = '#f3f4f6';
    });
    readViewBtn.addEventListener('mouseleave', () => {
      readViewBtn.style.background = 'transparent';
    });
    readViewBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeFloatingMenu();
      try {
        const result = await chrome.runtime.sendMessage({ action: 'openReaderView' });
        if (!result || !result.success) {
          const message = (result && result.error) || 'Could not open Reader View on this page';
          showFloatingToast(message, 'error');
        }
      } catch (err) {
        console.warn('[ReadEasy Floating Button] Failed to open reader view:', err);
        showFloatingToast('Could not open Reader View on this page', 'error');
      }
    });

    const sidePanelBtn = document.createElement('button');
    sidePanelBtn.type = 'button';
    sidePanelBtn.setAttribute('role', 'menuitem');
    sidePanelBtn.textContent = 'Open side panel';
    sidePanelBtn.style.cssText = readViewBtn.style.cssText;
    sidePanelBtn.addEventListener('mouseenter', () => {
      sidePanelBtn.style.background = '#f3f4f6';
    });
    sidePanelBtn.addEventListener('mouseleave', () => {
      sidePanelBtn.style.background = 'transparent';
    });
    sidePanelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeFloatingMenu();
      chrome.runtime.sendMessage({ action: 'openSidePanel' }).catch((err) => {
        console.warn('[ReadEasy Floating Button] Failed to open side panel:', err);
      });
    });

    const menuDivider = document.createElement('div');
    menuDivider.style.cssText = 'height:1px;background:rgba(0,0,0,0.08);margin:2px 4px';

    const hideLauncherBtn = document.createElement('button');
    hideLauncherBtn.type = 'button';
    hideLauncherBtn.setAttribute('role', 'menuitem');
    hideLauncherBtn.textContent = 'Hide launcher';
    hideLauncherBtn.style.cssText = [
      'width:100%',
      'border:none',
      'background:transparent',
      'padding:8px 10px',
      'text-align:left',
      'font-size:13px',
      'color:#6b7280',
      'border-radius:8px',
      'cursor:pointer'
    ].join(';');
    hideLauncherBtn.addEventListener('mouseenter', () => {
      hideLauncherBtn.style.background = '#f3f4f6';
    });
    hideLauncherBtn.addEventListener('mouseleave', () => {
      hideLauncherBtn.style.background = 'transparent';
    });
    hideLauncherBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeFloatingMenu();
      chrome.storage.sync.set({ [FLOATING_BUTTON_ENABLED_KEY]: false });
      chrome.runtime.sendMessage({ action: 'floaterSettingChanged', enabled: false }).catch(() => {});
    });

    floatingMenu.appendChild(readViewBtn);
    floatingMenu.appendChild(sidePanelBtn);
    floatingMenu.appendChild(menuDivider);
    floatingMenu.appendChild(hideLauncherBtn);
    document.body.appendChild(floatingMenu);
    ensureMenuListeners();
  }

  function removeStaleFloatingArtifacts() {
    const nodesToRemove = new Set();

    const byIdBtn = document.getElementById(FLOATING_BTN_ID);
    if (byIdBtn) nodesToRemove.add(byIdBtn);

    const byIdMenu = document.getElementById(FLOATING_MENU_ID);
    if (byIdMenu) nodesToRemove.add(byIdMenu);

    document.querySelectorAll('[data-readeasy-floating-menu="true"]').forEach(node => nodesToRemove.add(node));

    // Fallback cleanup for pre-ID floaters left after extension/script lifecycle changes.
    document
      .querySelectorAll('button[title="Open ReadEasy"][aria-label="Open ReadEasy side panel"]')
      .forEach(node => nodesToRemove.add(node));

    document
      .querySelectorAll('div[role="menu"]')
      .forEach(menu => {
        const labels = Array.from(menu.querySelectorAll('button')).map(btn => (btn.textContent || '').trim());
        if (labels.includes('Switch to reading view') && labels.includes('Open side panel')) {
          nodesToRemove.add(menu);
        }
      });

    nodesToRemove.forEach(node => {
      try { node.remove(); } catch (_) {}
    });
  }

  function removeFloatingButton() {
    closeFloatingMenu();
    removeStaleFloatingArtifacts();
    if (floatingMenu) {
      floatingMenu.remove();
      floatingMenu = null;
    }
    if (!floatingBtn) return;
    floatingBtn.remove();
    floatingBtn = null;
    isDragging = false;
    dragStarted = false;
  }

  async function loadFloatingButtonEnabledSetting() {
    try {
      const data = await chrome.storage.sync.get(FLOATING_BUTTON_ENABLED_KEY);
      const value = data && data[FLOATING_BUTTON_ENABLED_KEY];
      if (typeof value === 'boolean') {
        floatingButtonEnabled = value;
      } else {
        floatingButtonEnabled = true;
        await chrome.storage.sync.set({ [FLOATING_BUTTON_ENABLED_KEY]: true });
      }
    } catch (err) {
      console.warn('[ReadEasy Floating Button] Failed to load enabled setting:', err);
      floatingButtonEnabled = true;
    }
  }

  async function updateFloatingButtonVisibility() {
    // Self-heal stale references if DOM nodes were removed externally
    // (for example by background fallback cleanup injection).
    if (floatingBtn && !floatingBtn.isConnected) {
      floatingBtn = null;
    }
    if (floatingMenu && !floatingMenu.isConnected) {
      floatingMenu = null;
    }

    if (floatingButtonEnabled) {
      await renderFloatingButton();
    } else {
      removeFloatingButton();
    }
  }

  async function saveFloatingButtonPosition(left, top) {
    try {
      await chrome.storage.sync.set({
        [FLOATING_BTN_POS_KEY]: { left, top }
      });
    } catch (err) {
      console.warn('[ReadEasy Floating Button] Failed to save position:', err);
    }
  }

  function handleDragMove(e) {
    if (!isDragging || !floatingBtn) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragStarted = true;
    }
    if (dragStarted) {
      closeFloatingMenu();
    }
    positionFloatingButton(startLeft + dx, startTop + dy);
  }

  async function handleDragEnd() {
    if (!isDragging || !floatingBtn) return;
    isDragging = false;
    document.removeEventListener('mousemove', handleDragMove, true);
    document.removeEventListener('mouseup', handleDragEnd, true);
    const rect = floatingBtn.getBoundingClientRect();
    await saveFloatingButtonPosition(rect.left, rect.top);
    if (floatingMenu && !floatingMenu.hidden) {
      positionFloatingMenu();
    }
  }

  function attachFloatingButtonDrag() {
    if (!floatingBtn) return;
    floatingBtn.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = floatingBtn.getBoundingClientRect();
      isDragging = true;
      dragStarted = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      document.addEventListener('mousemove', handleDragMove, true);
      document.addEventListener('mouseup', handleDragEnd, true);
    }, true);

    floatingBtn.addEventListener('click', (e) => {
      if (floatingMenu && floatingMenu.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      if (dragStarted) {
        dragStarted = false;
        return;
      }
      toggleFloatingMenu();
    }, true);
  }

  async function renderFloatingButton() {
    if (!document.body || !floatingButtonEnabled) return;

    // Remove any stale floating artifacts from previous injections/reloads
    removeStaleFloatingArtifacts();

    // If a button is already being rendered, don't create another
    if (floatingBtn) return;

    floatingBtn = document.createElement('button');
    floatingBtn.id = FLOATING_BTN_ID;
    floatingBtn.type = 'button';
    floatingBtn.setAttribute('aria-label', 'Open ReadEasy side panel');
    floatingBtn.title = 'Open ReadEasy';
    floatingBtn.style.cssText = [
      'position:fixed',
      `left:${DEFAULT_OFFSET}px`,
      `bottom:${DEFAULT_OFFSET}px`,
      'width:48px',
      'height:48px',
      'border:none',
      'border-radius:999px',
      'padding:0',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'cursor:grab',
      'background:#ffffff',
      'box-shadow:0 8px 20px rgba(0,0,0,0.25)',
      'z-index:2147483647'
    ].join(';');

    const icon = document.createElement('img');
    icon.src = chrome.runtime.getURL('icons/icon48.png');
    icon.alt = 'ReadEasy';
    icon.style.width = '42px';
    icon.style.height = '42px';
    icon.style.objectFit = 'contain';
    icon.style.borderRadius = '50%';
    icon.style.pointerEvents = 'none';
    icon.addEventListener('error', () => {
      floatingBtn.textContent = 'R';
      floatingBtn.style.fontWeight = '700';
      floatingBtn.style.fontSize = '18px';
      floatingBtn.style.color = '#1f4ed8';
    });
    floatingBtn.appendChild(icon);

    document.body.appendChild(floatingBtn);
    ensureFloatingMenu();
    attachFloatingButtonDrag();

    try {
      const data = await chrome.storage.sync.get(FLOATING_BTN_POS_KEY);
      const saved = data && data[FLOATING_BTN_POS_KEY];
      if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
        positionFloatingButton(saved.left, saved.top);
      }
    } catch (err) {
      console.warn('[ReadEasy Floating Button] Failed to load saved position:', err);
    }

    if (!hasResizeListener) {
      window.addEventListener('resize', handleFloatingButtonResize);
      hasResizeListener = true;
    }
  }

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

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes[FLOATING_BUTTON_ENABLED_KEY]) return;

    const nextValue = changes[FLOATING_BUTTON_ENABLED_KEY].newValue;
    if (typeof nextValue === 'boolean') {
      floatingButtonEnabled = nextValue;
    } else {
      floatingButtonEnabled = true;
      chrome.storage.sync.set({ [FLOATING_BUTTON_ENABLED_KEY]: true }).catch(() => {});
    }

    updateFloatingButtonVisibility();
  });

  // Also handle direct broadcast from background (covers dormant/background tabs)
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'ping') {
      sendResponse({ alive: true });
      return;
    }
    if (message.action !== 'floaterSettingChanged') return;
    const nextValue = message.enabled;
    if (typeof nextValue === 'boolean') {
      floatingButtonEnabled = nextValue;
    } else {
      floatingButtonEnabled = true;
    }
    updateFloatingButtonVisibility();
  });

  (async () => {
    await loadFloatingButtonEnabledSetting();
    if (!floatingButtonEnabled) {
      removeStaleFloatingArtifacts();
    }
    await updateFloatingButtonVisibility();
  })();
})();
