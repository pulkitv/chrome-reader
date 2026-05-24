// Background service worker for Reader View extension

// ======================
// IndexedDB Helper Functions
// ======================

const DB_NAME = 'ReadEasyDB';
const DB_VERSION = 1;
const STORE_NAME = 'savedArticles';
const AUTH_STATE_KEY = 'authState';
const AUTH_PROVIDER_GOOGLE = 'google';
const MIN_ACCEPTED_CONTENT_CHARS = 180;
const EXTRACTION_RETRY_DELAYS_MS = [0, 350, 900];

let inMemoryAuthToken = null;

// In-memory cache of panelDisplayState — lets action/context-menu handlers call
// chrome.sidePanel.open() without any preceding await (user gesture must stay fresh).
let _panelDisplayState = 'open';
chrome.storage.sync.get('panelDisplayState').then(({ panelDisplayState }) => {
  _panelDisplayState = panelDisplayState || 'open';
}).catch(() => {});

function getSignedOutAuthState() {
  return {
    isSignedIn: false,
    provider: AUTH_PROVIDER_GOOGLE,
    profile: {
      email: '',
      name: '',
      picture: ''
    },
    lastSignInAt: null
  };
}

function normalizeAuthState(raw) {
  const base = getSignedOutAuthState();
  if (!raw || typeof raw !== 'object') return base;

  const profile = raw.profile && typeof raw.profile === 'object' ? raw.profile : {};
  const isSignedIn = raw.isSignedIn === true;
  const normalized = {
    isSignedIn,
    provider: raw.provider || AUTH_PROVIDER_GOOGLE,
    profile: {
      email: typeof profile.email === 'string' ? profile.email : '',
      name: typeof profile.name === 'string' ? profile.name : '',
      picture: typeof profile.picture === 'string' ? profile.picture : ''
    },
    lastSignInAt: Number.isFinite(raw.lastSignInAt) ? raw.lastSignInAt : null
  };

  if (!normalized.isSignedIn) {
    normalized.profile = { email: '', name: '', picture: '' };
    normalized.lastSignInAt = null;
  }

  return normalized;
}

async function saveAuthState(authState) {
  const normalized = normalizeAuthState(authState);
  await chrome.storage.sync.set({ [AUTH_STATE_KEY]: normalized });

  chrome.runtime.sendMessage({ action: 'authUpdated', authState: normalized }).catch(() => {
    // Sidepanel might not be open.
  });

  return normalized;
}

async function getStoredAuthState() {
  const data = await chrome.storage.sync.get(AUTH_STATE_KEY);
  return normalizeAuthState(data && data[AUTH_STATE_KEY]);
}

function getAuthToken({ interactive }) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || 'Failed to acquire auth token'));
        return;
      }
      resolve(token || null);
    });
  });
}

function removeCachedAuthToken(token) {
  return new Promise((resolve) => {
    if (!token) {
      resolve();
      return;
    }

    chrome.identity.removeCachedAuthToken({ token }, () => {
      resolve();
    });
  });
}

function clearAllCachedAuthTokens() {
  return new Promise((resolve) => {
    if (typeof chrome.identity.clearAllCachedAuthTokens !== 'function') {
      resolve();
      return;
    }

    chrome.identity.clearAllCachedAuthTokens(() => {
      resolve();
    });
  });
}

async function fetchGoogleProfile(token) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Google profile request failed (${response.status})`);
  }

  const payload = await response.json();
  return {
    email: payload && payload.email ? String(payload.email) : '',
    name: payload && payload.name ? String(payload.name) : '',
    picture: payload && payload.picture ? String(payload.picture) : ''
  };
}

async function signInWithGoogle() {
  const manifest = chrome.runtime.getManifest();
  if (!manifest.oauth2 || !manifest.oauth2.client_id || manifest.oauth2.client_id.startsWith('REPLACE_WITH_')) {
    throw new Error('OAuth client ID is not configured in manifest.json');
  }

  const token = await getAuthToken({ interactive: true });
  if (!token) {
    throw new Error('No auth token returned by Google');
  }

  inMemoryAuthToken = token;

  try {
    const profile = await fetchGoogleProfile(token);
    const authState = {
      isSignedIn: true,
      provider: AUTH_PROVIDER_GOOGLE,
      profile,
      lastSignInAt: Date.now()
    };

    return await saveAuthState(authState);
  } catch (error) {
    await removeCachedAuthToken(token);
    inMemoryAuthToken = null;
    throw error;
  }
}

async function signOutGoogle() {
  try {
    if (inMemoryAuthToken) {
      await removeCachedAuthToken(inMemoryAuthToken);
    }

    await clearAllCachedAuthTokens();
  } finally {
    inMemoryAuthToken = null;
  }

  return await saveAuthState(getSignedOutAuthState());
}

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        objectStore.createIndex('addedDate', 'addedDate', { unique: false });
        objectStore.createIndex('url', 'url', { unique: false });
      }
    };
  });
}

async function addArticle(article) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const articleData = { ...article, addedDate: Date.now() };
    const request = store.add(articleData);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function deleteArticle(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function updateArticleTitle(id, title) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const article = getRequest.result;
      if (!article) {
        reject(new Error('Article not found'));
        return;
      }

      article.title = title;
      const putRequest = store.put(article);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
    transaction.oncomplete = () => db.close();
  });
}

async function getArticleCount() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function getOldestArticle() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('addedDate');
    const request = index.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      resolve(cursor ? cursor.value : null);
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function getArticleById(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

function htmlToText(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ======================
// Chrome Extension Handlers
// ======================

// Initialize context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'openReadingList',
    title: 'Open Reading List',
    contexts: ['action']
  });
  chrome.contextMenus.create({
    id: 'openReaderView',
    title: 'ReadEasy Reader View',
    contexts: ['page', 'selection', 'link'],
    documentUrlPatterns: ['http://*/*', 'https://*/*']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'openReadingList') {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
  if (info.menuItemId === 'openReaderView') {
    if (_panelDisplayState !== 'user-closed') {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }
    try {
      await openReaderViewForTab(tab);
    } catch (error) {
      console.error('[ReadEasy] Context menu reader view failed:', error);
      await showActionFailureBadge(error && error.message ? error.message : 'Failed to open Reader View');
    }
  }
});

async function openReaderViewForTab(tab) {
  function createAppError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function getArticleTextLength(article) {
    if (!article || typeof article !== 'object') return 0;
    const textContent = typeof article.textContent === 'string' ? article.textContent : '';
    const normalized = textContent.replace(/\s+/g, ' ').trim();
    if (normalized.length) return normalized.length;

    const visible = Number(article.visibleTextChars);
    if (Number.isFinite(visible) && visible > 0) return visible;
    return 0;
  }

  function isArticleUsable(article) {
    if (!article || !article.content) return false;
    return getArticleTextLength(article) >= MIN_ACCEPTED_CONTENT_CHARS;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function extractArticleWithRetries(tabId) {
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
        if (isArticleUsable(article)) {
          return article;
        }

        lastError = createAppError('EXTRACTION_EMPTY', 'Failed to extract enough readable content from this page');
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || createAppError('EXTRACTION_FAILED', 'Failed to extract article content');
  }

  if (!tab || !tab.id || !tab.url) {
    throw createAppError('NO_ACTIVE_TAB', 'No active tab available');
  }

  // Don't run on chrome:// or extension pages
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    throw createAppError('UNSUPPORTED_PAGE', 'Cannot run ReadEasy on this page');
  }

  // Extract article content with retries for dynamic pages
  const article = await extractArticleWithRetries(tab.id);

  // Store the article in session storage with the original URL
  await chrome.storage.session.set({
    currentArticle: {
      ...article,
      sourceUrl: tab.url,
      sourceFavicon: tab.favIconUrl
    }
  });

  // Open the reader view in a new tab with the original URL as query parameter
  // This helps with referrer policies for loading external images
  const readerUrl = new URL(chrome.runtime.getURL('reader.html'));
  readerUrl.searchParams.set('url', tab.url);

  await chrome.tabs.create({
    url: readerUrl.toString()
  });
}

async function showActionFailureBadge(message) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setTitle({ title: `ReadEasy: ${message}` });

    setTimeout(async () => {
      try {
        await chrome.action.setBadgeText({ text: '' });
        await chrome.action.setTitle({ title: 'Open ReadEasy' });
      } catch (_) {
        // ignore badge reset failures
      }
    }, 5000);
  } catch (_) {
    // ignore action badge failures
  }
}

// Handle messages from reader and sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === 'saveToReadingList') {
        const { readingListMeta: existingMeta = [] } = await chrome.storage.local.get('readingListMeta');

        // Content-based deduplication: same URL + identical text → skip.
        // Same URL but different content → save as a new entry.
        const sameUrlEntries = existingMeta.filter(item => item.url === message.article.url);
        if (sameUrlEntries.length > 0) {
          const mostRecent = sameUrlEntries[sameUrlEntries.length - 1];
          const stored = await getArticleById(mostRecent.id);
          if (stored) {
            const storedText = htmlToText(stored.htmlContent || '');
            const newText    = htmlToText(message.article.htmlContent || '');
            if (storedText === newText) {
              sendResponse({ success: true, duplicate: true });
              return;
            }
            // Content differs — fall through and save as a new entry
          }
        }

        // Check if at capacity (10 articles)
        const count = await getArticleCount();
        
        if (count >= 10) {
          // Delete oldest article to make room
          const oldest = await getOldestArticle();
          if (oldest) {
            await deleteArticle(oldest.id);
            console.log('Deleted oldest article to make room:', oldest.title);
          }
        }
        
        // Add article to IndexedDB
        const articleId = await addArticle(message.article);
        console.log('Article saved to IndexedDB:', articleId);
        
        // Update metadata in chrome.storage.local
        const { readingListMeta = [] } = await chrome.storage.local.get('readingListMeta');
        
        // Remove oldest if we were at capacity
        let updatedMeta = readingListMeta;
        if (updatedMeta.length >= 10) {
          updatedMeta = updatedMeta.slice(1); // Remove first (oldest)
        }
        
        // Add new article metadata
        updatedMeta.push({
          id: articleId,
          title: message.article.title,
          url: message.article.url,
          siteName: message.article.siteName,
          addedDate: Date.now()
        });
        
        await chrome.storage.local.set({ readingListMeta: updatedMeta });
        
        // Broadcast update to sidepanel
        chrome.runtime.sendMessage({ action: 'listUpdated' }).catch(() => {
          // Sidepanel might not be open, ignore error
        });
        
        sendResponse({ success: true });
      } 
      else if (message.action === 'deleteFromList') {
        // Delete from IndexedDB
        await deleteArticle(message.id);
        
        // Update metadata in chrome.storage.local
        const { readingListMeta = [] } = await chrome.storage.local.get('readingListMeta');
        const updatedMeta = readingListMeta.filter(item => item.id !== message.id);
        await chrome.storage.local.set({ readingListMeta: updatedMeta });
        
        // Broadcast update to sidepanel
        chrome.runtime.sendMessage({ action: 'listUpdated' }).catch(() => {
          // Sidepanel might not be open, ignore error
        });
        
        sendResponse({ success: true });
      }
      else if (message.action === 'openSidePanel') {
        // Open the panel first — sidePanel.open() requires the user gesture to still be live.
        // Any await before this call would expire the gesture.
        _panelDisplayState = 'open';
        const windowId = sender.tab ? sender.tab.windowId : undefined;
        if (windowId) {
          await chrome.sidePanel.open({ windowId });
        }
        // Write state after the panel opens (gesture already consumed)
        chrome.storage.sync.set({ panelDisplayState: 'open' }).catch(() => {});
        sendResponse({ success: true });
      }
      else if (message.action === 'openReaderView') {
        if (!sender.tab || !sender.tab.id) {
          throw new Error('No sender tab for reader view');
        }

        // Open side panel first (no await before this — user gesture must stay live)
        if (_panelDisplayState !== 'user-closed' && sender.tab.windowId) {
          chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
        }

        // Use chrome.tabs.get for a fully-populated Tab object — sender.tab from a
        // content script message may be missing fields like `url` in some contexts.
        const tab = await chrome.tabs.get(sender.tab.id);
        await openReaderViewForTab(tab);
        sendResponse({ success: true });
      }
      else if (message.action === 'updateArticleTitle') {
        const id = Number(message.id);
        const newTitle = (message.title || '').trim();

        if (!Number.isFinite(id)) {
          throw new Error('Invalid article id');
        }

        if (!newTitle) {
          throw new Error('Title cannot be empty');
        }

        // Update title in IndexedDB (used by merged EPUB generation)
        await updateArticleTitle(id, newTitle);

        // Update title in metadata (used by sidepanel list UI)
        const { readingListMeta = [] } = await chrome.storage.local.get('readingListMeta');
        const updatedMeta = readingListMeta.map(item =>
          item.id === id ? { ...item, title: newTitle } : item
        );
        await chrome.storage.local.set({ readingListMeta: updatedMeta });

        // Broadcast update to sidepanel
        chrome.runtime.sendMessage({ action: 'listUpdated' }).catch(() => {
          // Sidepanel might not be open, ignore error
        });

        sendResponse({ success: true });
      }
      else if (message.action === 'authSignIn') {
        const authState = await signInWithGoogle();
        sendResponse({ success: true, authState });
      }
      else if (message.action === 'authGetState') {
        const authState = await getStoredAuthState();
        sendResponse({ success: true, authState });
      }
      else if (message.action === 'authSignOut') {
        const authState = await signOutGoogle();
        sendResponse({ success: true, authState });
      }
      else {
        sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message, errorCode: error.code || 'UNKNOWN_ERROR' });
    }
  })();
  
  return true; // Keep channel open for async response
});

// Broadcast floater setting changes to all open tabs
const FLOATING_BUTTON_ENABLED_KEY = 'floatingButtonEnabled';

function isTabUrlScriptable(url) {
  if (!url || typeof url !== 'string') return false;
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://')
  );
}

async function forceRemoveFloaterArtifacts(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const selectors = [
          '#readeasy-floating-btn',
          '#readeasy-floating-menu',
          '[data-readeasy-floating-menu="true"]',
          'button[title="Open ReadEasy"][aria-label="Open ReadEasy side panel"]'
        ];

        const toRemove = new Set();
        selectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(node => toRemove.add(node));
        });

        // Fallback for legacy/no-id menu variant.
        document.querySelectorAll('div[role="menu"]').forEach(menu => {
          const labels = Array.from(menu.querySelectorAll('button')).map(btn => (btn.textContent || '').trim());
          if (labels.includes('Switch to reading view') && labels.includes('Open side panel')) {
            toRemove.add(menu);
          }
        });

        toRemove.forEach(node => {
          try { node.remove(); } catch (_) {}
        });
      }
    });
  } catch (_) {
    // Restricted pages (or tabs without script access) are expected to fail.
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.panelDisplayState) {
    _panelDisplayState = changes.panelDisplayState.newValue || 'open';
  }
  if (areaName !== 'sync' || !(FLOATING_BUTTON_ENABLED_KEY in changes)) return;
  const newValue = changes[FLOATING_BUTTON_ENABLED_KEY].newValue;
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id || !isTabUrlScriptable(tab.url)) continue;
      chrome.tabs.sendMessage(tab.id, { action: 'floaterSettingChanged', enabled: newValue }).catch(() => {});

      // Extra safety: when disabling, forcibly remove stale/orphaned floaters
      // in tabs where old content-script instances no longer receive messages.
      if (newValue === false) {
        forceRemoveFloaterArtifacts(tab.id);
      }

      // Recovery path: when enabling, re-inject selection.js only if the content
      // script is not already running in that tab (e.g. after a browser restart or
      // a tab that was open before the extension was installed). If the script is
      // already alive it already received the floaterSettingChanged message above
      // and will render the button itself — injecting a second instance would
      // create two competing instances that trample each other's DOM nodes.
      if (newValue === true) {
        chrome.tabs.sendMessage(tab.id, { action: 'ping' })
          .then(() => { /* already alive — nothing to do */ })
          .catch(() => {
            // No response: content script is absent, safe to inject
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['selection.js']
            }).catch(() => {});
          });
      }
    }
  });
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  // Open side panel first — no await before this call so the user gesture stays fresh.
  if (_panelDisplayState !== 'user-closed') {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
  try {
    await openReaderViewForTab(tab);
  } catch (error) {
    console.error('Error extracting article:', error);
    await showActionFailureBadge(error && error.message ? error.message : 'Failed to open Reader View');
  }
});
