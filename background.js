// Background service worker for Reader View extension

// ======================
// IndexedDB Helper Functions
// ======================

const DB_NAME = 'ReadEasyDB';
const DB_VERSION = 1;
const STORE_NAME = 'savedArticles';

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
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'openReadingList') {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// Handle messages from reader and sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === 'saveToReadingList') {
        // Deduplicate — don't save if this URL is already in the list
        const { readingListMeta: existingMeta = [] } = await chrome.storage.local.get('readingListMeta');
        const alreadySaved = existingMeta.some(item => item.url === message.article.url);
        if (alreadySaved) {
          console.log('Article already in reading list, skipping duplicate:', message.article.url);
          sendResponse({ success: true, duplicate: true });
          return;
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
        // Open the side panel for the sender's tab
        const windowId = sender.tab ? sender.tab.windowId : undefined;
        if (windowId) {
          await chrome.sidePanel.open({ windowId });
        }
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
      else {
        sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // Keep channel open for async response
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  // Don't run on chrome:// or extension pages
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    console.log('Cannot run ReadEasy on this page');
    return;
  }

  try {
    // Inject the content script to extract article content
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['libs/Readability.js', 'content.js']
    });

    // Get the extracted article from the content script
    const article = results[0].result;

    if (!article || !article.content) {
      console.error('Failed to extract article content');
      return;
    }

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
    
    chrome.tabs.create({
      url: readerUrl.toString()
    });

  } catch (error) {
    console.error('Error extracting article:', error);
  }
});
