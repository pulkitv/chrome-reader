/**
 * ReadEasy Side Panel - Reading List Manager
 * Handles article list display, storage management, and EPUB merging
 */

// State
let readingListMeta = [];
let currentArticleData = null;
let currentReaderTabId = null;   // Tab ID when active tab is reader.html
let currentRegularTabId = null;  // Tab ID when active tab is a normal website
let currentRegularTabUrl = null; // URL of the active regular website tab
let pendingX4Blob = null;
let pendingX4DefaultName = '';
let pendingX4Articles = [];
let pendingX4SizeText = '-';
let x4ExcludeImagesSession = false;
let x4RegenRequestId = 0;
let x4LatestSettledRequestId = 0;
let x4RegenInFlight = false;

const X4_DEFAULT_IP = '192.168.1.11';
const X4_SETTINGS_KEY = 'x4Settings';

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[SidePanel] DOMContentLoaded - JS loaded');
  await initPanel();
  setupEventListeners();
  await checkCurrentTab();
});

// Debounce handle so rapid concurrent calls to initPanel coalesce into one
let _initPanelTimer = null;

/**
 * Initialize panel - load data and render
 */
async function initPanel() {
  // Debounce: if called multiple times in quick succession, only run once
  if (_initPanelTimer) clearTimeout(_initPanelTimer);
  await new Promise(resolve => { _initPanelTimer = setTimeout(resolve, 30); });
  _initPanelTimer = null;

  try {
    // Read metadata from chrome.storage.local (source of truth for list UI)
    const { readingListMeta: storedMeta } = await chrome.storage.local.get('readingListMeta');
    readingListMeta = storedMeta || [];

    // Render list
    await renderArticleList();

    // Update storage size indicator (reads from IndexedDB — separate try so it
    // never blocks the list render if IDB is busy)
    updateStorageInfo().catch(err => console.warn('[SidePanel] updateStorageInfo failed:', err));
  } catch (error) {
    console.error('Failed to initialize panel:', error);
    showToast('Failed to load reading list', 'error');
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  console.log('[SidePanel] setupEventListeners called');
  // Add to list button — delegates to reader tab or extracts from regular tab
  document.getElementById('addToListBtn').addEventListener('click', async () => {
    if (currentReaderTabId) {
      await handleAddToListViaTab(currentReaderTabId);
    } else if (currentRegularTabId) {
      await handleAddToListFromRegularTab(currentRegularTabId, currentRegularTabUrl);
    }
  });
  
  // Save Selection button — captures highlighted text from active tab
  document.getElementById('saveSelectionBtn').addEventListener('click', async () => {
    // Re-query the active tab so we always have a fresh tab ID
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = (activeTab && activeTab.url && activeTab.url.startsWith('http')) ? activeTab.id : currentRegularTabId;
    if (tabId) {
      await handleSaveSelection(tabId);
    }
  });

  // Merge EPUB button
  document.getElementById('mergeEpubBtn').addEventListener('click', async () => {
    await handleMergeEPUB();
  });

  // Merge & Send to X4 button
  document.getElementById('mergeSendX4Btn').addEventListener('click', async () => {
    await handleMergeAndSendToX4();
  });

  // X4 modal controls
  document.getElementById('x4ModalCloseBtn').addEventListener('click', () => closeX4Modal());
  document.getElementById('x4DownloadBtn').addEventListener('click', () => handleX4Download());
  document.getElementById('x4SendBtn').addEventListener('click', async () => {
    await handleSendToX4();
  });
  document.getElementById('x4CheckConnectionBtn').addEventListener('click', async () => {
    await handleCheckX4Connection();
  });
  document.getElementById('x4ExcludeImages').addEventListener('change', async (e) => {
    x4ExcludeImagesSession = !!e.target.checked;
    await regenerateX4BlobForModal();
  });

  document.getElementById('x4Modal').addEventListener('click', (e) => {
    if (e.target && e.target.id === 'x4Modal') {
      closeX4Modal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('x4Modal');
      if (modal.classList.contains('open')) closeX4Modal();
    }
  });
  
  // Reload when readingListMeta changes in storage (primary mechanism)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.readingListMeta) {
      initPanel();
    }
  });

  // Also listen for explicit listUpdated broadcasts from background.js (backup)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'listUpdated') {
      initPanel();
    }
  });
  
  // Listen for tab changes - re-check whenever tabs switch, update, or are created
  chrome.tabs.onActivated.addListener(() => {
    checkCurrentTab();
  });

  // Re-check when a tab finishes loading (e.g. reader.html just opened)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      checkCurrentTab();
    }
  });
}

/**
 * Check current tab and update the "Current Article" section accordingly.
 *
 * Cases:
 *  1. chrome:// or non-reader extension page  → hide (no article possible)
 *  2. reader.html tab                          → message reader tab for article info
 *  3. Normal http/https website                → show tab title, enable Add to List
 */
async function checkCurrentTab() {
  console.log('[SidePanel] checkCurrentTab called');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[SidePanel] Active tab:', tab && { id: tab.id, url: tab.url });

    if (!tab || !tab.url) {
      hideCurrentArticleSection('Nothing open');
      await updateSaveSelectionVisibility();
      return;
    }

    // Case 1 — Chrome internal or other extension pages (not our reader)
    if (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://') ||
      (tab.url.startsWith('chrome-extension://') && !tab.url.includes('reader.html'))
    ) {
      currentReaderTabId = null;
      currentRegularTabId = null;
      currentRegularTabUrl = null;
      hideCurrentArticleSection('Internal page – no article available');
      await updateSaveSelectionVisibility();
      return;
    }

    // Case 2 — Our reader.html tab
    if (tab.url.includes('reader.html')) {
      currentRegularTabId = null;
      currentRegularTabUrl = null;
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getCurrentArticle' });
        console.log('[SidePanel] reader tab response:', response);
        if (response && response.title) {
          currentReaderTabId = tab.id;
          showCurrentArticleSection(response);
        } else {
          currentReaderTabId = null;
          hideCurrentArticleSection('Article not loaded yet');
          await updateSaveSelectionVisibility();
        }
      } catch (err) {
        console.warn('[SidePanel] Could not reach reader tab:', err.message);
        currentReaderTabId = null;
        hideCurrentArticleSection('Reader page still loading…');
        await updateSaveSelectionVisibility();
      }
      return;
    }

    // Case 3 — Normal website
    if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
      currentReaderTabId = null;
      currentRegularTabId = tab.id;
      currentRegularTabUrl = tab.url;

      let hostname = tab.url;
      try { hostname = new URL(tab.url).hostname; } catch (_) {}

      showCurrentArticleSection({
        title: tab.title || 'Current Page',
        url: tab.url,
        siteName: hostname
      });
      return;
    }

    // Fallback
    hideCurrentArticleSection('Unsupported page');
    await updateSaveSelectionVisibility();
  } catch (error) {
    console.error('[SidePanel] Error in checkCurrentTab:', error);
    hideCurrentArticleSection('Could not detect current page');
    await updateSaveSelectionVisibility();
  }
}

/**
 * Update Save Selection button visibility based on the active tab.
 * This runs independently of the article card — Save Selection stays visible
 * whenever the user is on a regular http/https page.
 */
async function updateSaveSelectionVisibility() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isRegularPage = tab && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'));
    document.getElementById('saveSelectionSection').style.display = isRegularPage ? '' : 'none';
  } catch (err) {
    console.warn('[SidePanel] Could not check tab for Save Selection:', err);
    document.getElementById('saveSelectionSection').style.display = 'none';
  }
}

/**
 * Show current article section
 */
function showCurrentArticleSection(articleData) {
  currentArticleData = articleData;
  
  const section = document.getElementById('currentArticleSection');
  const title = document.getElementById('currentTitle');
  const domain = document.getElementById('currentDomain');
  
  title.textContent = articleData.title;
  domain.textContent = articleData.siteName || new URL(articleData.url).hostname;
  section.style.display = 'block';
  
  // Enable the Add to List button
  const addBtn = document.getElementById('addToListBtn');
  addBtn.disabled = false;
  addBtn.querySelector('span').textContent = 'Add to List';

  // Show/hide Save Selection based on current tab type
  updateSaveSelectionVisibility();
}

/**
 * Hide current article section (show fallback message)
 * @param {string} [reason] - Optional hint shown as subtitle
 */
function hideCurrentArticleSection(reason) {
  currentArticleData = null;
  currentReaderTabId = null;
  currentRegularTabId = null;
  currentRegularTabUrl = null;
  const section = document.getElementById('currentArticleSection');
  section.style.display = 'block';
  document.getElementById('currentTitle').textContent = 'No article detected';
  document.getElementById('currentDomain').textContent = reason || 'Navigate to a webpage to add it';
  document.getElementById('addToListBtn').disabled = true;
  // Note: Save Selection visibility is managed independently by updateSaveSelectionVisibility()
}

/**
 * Handle add to list by delegating to the reader tab
 * The reader tab has all the image-processing logic already
 */
async function handleAddToListViaTab(tabId) {
  const addBtn = document.getElementById('addToListBtn');

  try {
    addBtn.disabled = true;
    addBtn.querySelector('span').textContent = 'Saving...';

    // Tell the reader tab to save the article (it handles image conversion)
    const response = await chrome.tabs.sendMessage(tabId, { action: 'addToReadingList' });

    if (response && response.success) {
      showToast('Added to Reading List ✓', 'success', 2000);
      currentReaderTabId = null;
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

/**
 * Fetch a remote image URL and convert to a PNG data URL.
 * Runs in the extension page context (sidepanel has <all_urls>) so fetch()
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
    console.warn('[SidePanel] Image skipped:', url.substring(0, 100), '—', err.message);
    return null;
  }
}

/**
 * Handle saving the user's text selection from the active tab.
 * Sends a message to the content script (selection.js) to extract the
 * highlighted HTML, then saves it as a reading list article.
 */
async function handleSaveSelection(tabId) {
  const saveBtn = document.getElementById('saveSelectionBtn');

  // Preserve tab state so the button stays visible after save
  const savedRegularTabId = currentRegularTabId;
  const savedRegularTabUrl = currentRegularTabUrl;

  try {
    saveBtn.disabled = true;
    saveBtn.querySelector('span').textContent = 'Saving…';

    // Re-query active tab for a fresh ID (avoids stale references)
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const targetTabId = (activeTab && activeTab.url && activeTab.url.startsWith('http')) ? activeTab.id : tabId;

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
      action: 'saveToReadingList',
      article: {
        title: 'Highlighted text - ' + new Date().toLocaleDateString(),
        htmlContent,
        url: result.pageUrl + '#highlight-' + Date.now(),
        siteName: result.pageTitle || 'Selection'
      }
    });

    if (!response || !response.success) {
      throw new Error((response && response.error) || 'Failed to save selection');
    }

    showToast('Selection saved ✓', 'success', 2000);

    // Re-render saved list but restore tab tracking so user can save more selections
    await initPanel();
    currentRegularTabId = savedRegularTabId;
    currentRegularTabUrl = savedRegularTabUrl;
    document.getElementById('saveSelectionSection').style.display = '';
  } catch (error) {
    console.error('[SidePanel] Error saving selection:', error);
    showToast(error.message || 'Failed to save selection', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.querySelector('span').textContent = 'Save Selection';
  }
}

/**
 * Handle add to list for a regular (non-reader) website tab.
 * Injects Readability to extract the article, fetches all images as PNG,
 * then saves to the reading list.
 */
async function handleAddToListFromRegularTab(tabId, tabUrl) {
  const addBtn = document.getElementById('addToListBtn');

  try {
    addBtn.disabled = true;
    addBtn.querySelector('span').textContent = 'Extracting…';

    // Inject Readability + content script — returns article.content with absolute URL srcs
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['libs/Readability.js', 'content.js']
    });

    const article = results && results[0] && results[0].result;
    if (!article || !article.content) {
      throw new Error('Could not extract article from this page.\nTry opening it in Reader View first.');
    }

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
      action: 'saveToReadingList',
      article: {
        title: article.title || 'Untitled',
        url: tabUrl,
        siteName: article.siteName || new URL(tabUrl).hostname,
        htmlContent
      }
    });

    if (!response || !response.success) {
      throw new Error((response && response.error) || 'Failed to save article');
    }

    showToast('Added to Reading List ✓', 'success', 2000);
    currentRegularTabId = null;
    currentRegularTabUrl = null;
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


/**
 * Render article list
 */
async function renderArticleList() {
  const listContainer = document.getElementById('articleList');
  const mergeBtn = document.getElementById('mergeEpubBtn');
  const mergeSendBtn = document.getElementById('mergeSendX4Btn');
  
  // Clear existing content
  listContainer.innerHTML = '';
  
  if (readingListMeta.length === 0) {
    // Show empty state
    listContainer.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 8H36V40H12V8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M18 16H30M18 24H30M18 32H24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p>No articles saved yet</p>
        <small>Click "Add to List" from any reader view to save articles</small>
      </div>
    `;
    mergeBtn.disabled = true;
    mergeSendBtn.disabled = true;
    return;
  }
  
  // Render articles (oldest first - already sorted)
  readingListMeta.forEach((article, index) => {
    const card = createArticleCard(article);
    listContainer.appendChild(card);
  });
  
  mergeBtn.disabled = false;
  mergeSendBtn.disabled = false;
}

/**
 * Create article card element
 */
function createArticleCard(article) {
  const card = document.createElement('div');
  card.className = 'article-card saved-article';
  card.dataset.id = article.id;
  card.dataset.originalTitle = article.title || 'Untitled';
  
  const date = new Date(article.addedDate);
  const formattedDate = date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
  
  card.innerHTML = `
    <button class="edit-icon-btn edit-btn" data-id="${article.id}" title="Edit title" aria-label="Edit title">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M3 21h4l11-11-4-4L3 17v4z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14 6l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <div class="article-title">${escapeHtml(article.title)}</div>
    <div class="title-edit-row">
      <input class="title-edit-input" type="text" maxlength="300" aria-label="Edit article title" />
      <button class="btn-save save-title-btn">Save</button>
      <button class="btn-cancel cancel-edit-btn">Cancel</button>
    </div>
    <div class="article-meta">${escapeHtml(article.siteName)} • ${formattedDate}</div>
    <div class="article-actions">
      <button class="btn-danger remove-btn" data-id="${article.id}">Remove</button>
    </div>
  `;

  const titleInput = card.querySelector('.title-edit-input');
  titleInput.value = article.title || 'Untitled';

  // Add edit button handler
  card.querySelector('.edit-icon-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    startInlineTitleEdit(card);
  });

  // Save title handler
  card.querySelector('.save-title-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    await saveInlineTitleEdit(card, article.id);
  });

  // Cancel edit handler
  card.querySelector('.cancel-edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    cancelInlineTitleEdit(card);
  });

  // Keyboard handlers for inline input
  titleInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await saveInlineTitleEdit(card, article.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelInlineTitleEdit(card);
    }
  });
  
  // Add remove button handler
  card.querySelector('.remove-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    await handleRemoveArticle(article.id);
  });
  
  return card;
}

/**
 * Enter inline title edit mode for a card
 */
function startInlineTitleEdit(card) {
  // Close any other open editors first
  document.querySelectorAll('.saved-article.is-editing').forEach(openCard => {
    if (openCard !== card) cancelInlineTitleEdit(openCard);
  });

  card.classList.add('is-editing');
  const input = card.querySelector('.title-edit-input');
  input.value = card.dataset.originalTitle || input.value || '';
  input.focus();
  input.select();
}

/**
 * Cancel inline title edit mode for a card
 */
function cancelInlineTitleEdit(card) {
  const input = card.querySelector('.title-edit-input');
  if (input) input.value = card.dataset.originalTitle || input.value || '';
  card.classList.remove('is-editing');
}

/**
 * Save inline title edit for a card
 */
async function saveInlineTitleEdit(card, id) {
  const input = card.querySelector('.title-edit-input');
  const originalTitle = (card.dataset.originalTitle || '').trim();
  const trimmed = (input?.value || '').trim();

  if (!trimmed) {
    showToast('Title cannot be empty', 'error', 2000);
    input?.focus();
    return;
  }

  if (trimmed === originalTitle) {
    cancelInlineTitleEdit(card);
    return;
  }

  await handleEditTitle(id, trimmed);
}

/**
 * Handle remove article
 */
async function handleRemoveArticle(id) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deleteFromList',
      id: id
    });
    
    if (response.success) {
      showToast('Article removed', 'success', 2000);
      await initPanel();
    } else {
      throw new Error(response.error || 'Failed to remove article');
    }
  } catch (error) {
    console.error('Error removing article:', error);
    showToast('Failed to remove article', 'error');
  }
}

/**
 * Handle edit article title
 */
async function handleEditTitle(id, newTitle) {
  const trimmed = (newTitle || '').trim();
  if (!trimmed) {
    showToast('Title cannot be empty', 'error', 2000);
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'updateArticleTitle',
      id,
      title: trimmed
    });

    if (response && response.success) {
      showToast('Title updated ✓', 'success', 2000);
      await initPanel();
    } else {
      throw new Error((response && response.error) || 'Failed to update title');
    }
  } catch (error) {
    console.error('Error updating title:', error);
    showToast(error.message || 'Failed to update title', 'error');
  }
}

/**
 * Update storage indicator
 */
async function updateStorageInfo() {
  try {
    const articles = await getAllArticles();
    const count = articles.length;
    
    // Calculate total size (sum of HTML content lengths)
    let totalSize = 0;
    articles.forEach(article => {
      if (article.htmlContent) {
        // UTF-16 encoding: 2 bytes per character
        totalSize += article.htmlContent.length * 2;
      }
    });
    
    // Convert to MB
    const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
    
    document.getElementById('storageInfo').textContent = `${count}/10 articles • ${sizeMB}MB`;
  } catch (error) {
    console.error('Error calculating storage:', error);
  }
}

/**
 * Handle merge and download EPUB
 */
async function handleMergeEPUB() {
  const mergeBtn = document.getElementById('mergeEpubBtn');

  try {
    mergeBtn.disabled = true;
    mergeBtn.querySelector('span').textContent = 'Generating EPUB...';

    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip library not loaded');
    }

    const articles = await getAllArticles();

    if (articles.length === 0) {
      throw new Error('No articles to merge');
    }

    await generateMergedEPUB(articles);

    showToast('EPUB downloaded successfully ✓', 'success', 3000);
  } catch (error) {
    console.error('Error generating EPUB:', error);
    showToast('EPUB generation failed: ' + error.message, 'error');
  } finally {
    mergeBtn.disabled = readingListMeta.length === 0;
    mergeBtn.querySelector('span').textContent = 'Merge & Download EPUB';
  }
}

/**
 * Handle merge and open Send to X4 modal
 */
async function handleMergeAndSendToX4() {
  const mergeSendBtn = document.getElementById('mergeSendX4Btn');

  try {
    mergeSendBtn.disabled = true;
    mergeSendBtn.querySelector('span').textContent = 'Generating EPUB...';

    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip library not loaded');
    }

    const articles = await getAllArticles();
    if (articles.length === 0) {
      throw new Error('No articles to merge');
    }

    pendingX4Articles = articles;
    pendingX4Blob = null;
    pendingX4SizeText = '-';
    pendingX4DefaultName = `ReadEasy_Merged_${new Date().toISOString().split('T')[0]}.epub`;

    await openX4Modal();
  } catch (error) {
    console.error('Error preparing EPUB for X4:', error);
    showToast('Could not prepare EPUB: ' + error.message, 'error');
  } finally {
    mergeSendBtn.disabled = readingListMeta.length === 0;
    mergeSendBtn.querySelector('span').textContent = 'Merge & Send to X4';
  }
}

/**
 * Open Send to X4 modal with prepared EPUB metadata
 */
async function openX4Modal() {
  const modal = document.getElementById('x4Modal');
  const nameInput = document.getElementById('x4EpubName');
  const sizeEl = document.getElementById('x4EpubSize');
  const firmwareSelect = document.getElementById('x4FirmwareSelect');
  const ipInput = document.getElementById('x4DeviceIp');
  const statusEl = document.getElementById('x4ConnectionStatus');
  const responsePreviewEl = document.getElementById('x4ResponsePreview');
  const excludeImagesCheckbox = document.getElementById('x4ExcludeImages');

  const settings = await loadX4Settings();
  firmwareSelect.value = settings.firmware || 'crosspoint';
  ipInput.value = settings.ip || X4_DEFAULT_IP;
  excludeImagesCheckbox.checked = !!x4ExcludeImagesSession;

  nameInput.value = pendingX4DefaultName || `ReadEasy_Merged_${new Date().toISOString().split('T')[0]}.epub`;
  sizeEl.textContent = pendingX4SizeText;
  statusEl.textContent = 'Connection not checked.';
  statusEl.classList.remove('success', 'error');
  responsePreviewEl.hidden = true;
  responsePreviewEl.textContent = '';

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  setX4ActionButtonsEnabled(false);

  // Build initial blob using current session-scoped image toggle
  regenerateX4BlobForModal();

  nameInput.focus();
  nameInput.select();
}

/**
 * Close Send to X4 modal
 */
function closeX4Modal() {
  const modal = document.getElementById('x4Modal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

/**
 * Enable/disable X4 action buttons (send + download)
 */
function setX4ActionButtonsEnabled(enabled) {
  const sendBtn = document.getElementById('x4SendBtn');
  const downloadBtn = document.getElementById('x4DownloadBtn');
  sendBtn.disabled = !enabled;
  downloadBtn.disabled = !enabled;
}

/**
 * Regenerate pending X4 EPUB blob for current modal options.
 * Uses monotonic request IDs so stale async completions cannot mutate UI/blob.
 */
async function regenerateX4BlobForModal() {
  const modal = document.getElementById('x4Modal');
  const sizeEl = document.getElementById('x4EpubSize');
  const statusEl = document.getElementById('x4ConnectionStatus');

  if (!modal.classList.contains('open')) return;
  if (!pendingX4Articles || pendingX4Articles.length === 0) return;

  const requestId = ++x4RegenRequestId;
  const prevBlob = pendingX4Blob;
  const prevSizeText = pendingX4SizeText;

  x4RegenInFlight = true;
  setX4ActionButtonsEnabled(false);
  sizeEl.textContent = 'Regenerating...';
  statusEl.textContent = 'Regenerating EPUB...';
  statusEl.classList.remove('success', 'error');

  try {
    const blob = await buildMergedEPUBBlob(pendingX4Articles, {
      includeImages: !x4ExcludeImagesSession
    });

    if (requestId !== x4RegenRequestId || !modal.classList.contains('open')) return;

    pendingX4Blob = blob;
    pendingX4SizeText = formatFileSize(blob.size);
    sizeEl.textContent = pendingX4SizeText;
    statusEl.textContent = 'Connection not checked.';
    statusEl.classList.remove('success', 'error');
  } catch (error) {
    if (requestId !== x4RegenRequestId || !modal.classList.contains('open')) return;

    // Keep previous valid blob/size on regeneration failures
    pendingX4Blob = prevBlob;
    pendingX4SizeText = prevSizeText;
    sizeEl.textContent = pendingX4SizeText;
    statusEl.textContent = 'Connection not checked.';
    statusEl.classList.remove('success', 'error');
    showToast('Could not regenerate EPUB: ' + (error.message || 'Unknown error'), 'error');
  } finally {
    // Re-enable only when the latest regeneration settles
    if (requestId === x4RegenRequestId) {
      x4RegenInFlight = false;
      x4LatestSettledRequestId = requestId;
      if (modal.classList.contains('open')) {
        setX4ActionButtonsEnabled(!!pendingX4Blob);
      }
    }
  }
}

/**
 * Download from Send to X4 modal
 */
function handleX4Download() {
  if (x4RegenInFlight && x4LatestSettledRequestId !== x4RegenRequestId) {
    showToast('EPUB is still regenerating. Please wait.', 'error', 2000);
    return;
  }

  if (!pendingX4Blob) {
    showToast('No EPUB prepared. Please generate again.', 'error');
    return;
  }

  const fileName = getSanitizedEpubFileName(document.getElementById('x4EpubName').value);
  downloadBlob(pendingX4Blob, fileName);
  showToast('EPUB downloaded successfully ✓', 'success', 2500);
}

/**
 * Check device connection for Send to X4
 */
async function handleCheckX4Connection() {
  const statusEl = document.getElementById('x4ConnectionStatus');
  const checkBtn = document.getElementById('x4CheckConnectionBtn');
  const ip = document.getElementById('x4DeviceIp').value.trim();
  const firmware = document.getElementById('x4FirmwareSelect').value;

  try {
    checkBtn.disabled = true;
    statusEl.textContent = 'Checking connection...';
    statusEl.classList.remove('success', 'error');

    const result = await checkX4Connection(ip, firmware);
    if (result.ok) {
      statusEl.textContent = `Connected: ${result.message}`;
      statusEl.classList.add('success');
      statusEl.classList.remove('error');
      await saveX4Settings({ ip, firmware });
    } else {
      throw new Error(result.message || 'Device is not reachable');
    }
  } catch (error) {
    statusEl.textContent = `Not connected: ${error.message}`;
    statusEl.classList.add('error');
    statusEl.classList.remove('success');
  } finally {
    checkBtn.disabled = false;
  }
}

/**
 * Send prepared EPUB to X4 device
 */
async function handleSendToX4() {
  const sendBtn = document.getElementById('x4SendBtn');
  const statusEl = document.getElementById('x4ConnectionStatus');
  const responsePreviewEl = document.getElementById('x4ResponsePreview');
  const ip = document.getElementById('x4DeviceIp').value.trim();
  const firmware = document.getElementById('x4FirmwareSelect').value;
  const fileName = getSanitizedEpubFileName(document.getElementById('x4EpubName').value);

  if (x4RegenInFlight && x4LatestSettledRequestId !== x4RegenRequestId) {
    showToast('EPUB is still regenerating. Please wait.', 'error', 2000);
    return;
  }

  if (!pendingX4Blob) {
    showToast('No EPUB prepared. Please generate again.', 'error');
    return;
  }

  try {
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    const response = await sendEpubToX4(pendingX4Blob, fileName, ip, firmware);

    if (!response.ok) {
      throw new Error(response.message || 'Upload failed');
    }

    await saveX4Settings({ ip, firmware });
    statusEl.textContent = 'Upload successful ✓';
    statusEl.classList.add('success');
    statusEl.classList.remove('error');
    responsePreviewEl.hidden = false;
    responsePreviewEl.textContent = response.message || 'Upload successful';
    showToast('EPUB sent to X4 successfully ✓', 'success', 3000);
  } catch (error) {
    console.error('X4 upload failed:', error);
    statusEl.textContent = `Upload failed: ${error.message}`;
    statusEl.classList.add('error');
    statusEl.classList.remove('success');
    responsePreviewEl.hidden = false;
    responsePreviewEl.textContent = error.message || 'Upload failed';
    showToast('Failed to send EPUB: ' + error.message, 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send to X4';
  }
}

/**
 * Build base URL from user-entered IP/host
 */
function buildDeviceBaseUrl(input) {
  const value = (input || '').trim();
  if (!value) throw new Error('Please enter a device IP address');
  if (/^https?:\/\//i.test(value)) {
    return value.replace(/\/+$/, '');
  }
  return `http://${value.replace(/\/+$/, '')}`;
}

/**
 * Check X4 connection (same method for stock + crosspoint for now)
 */
async function checkX4Connection(ip, firmware) {
  const baseUrl = buildDeviceBaseUrl(ip);
  const statusUrl = `${baseUrl}/api/status`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const statusRes = await fetch(statusUrl, { method: 'GET', signal: controller.signal });
    if (statusRes.ok) {
      return { ok: true, message: '/api/status reachable' };
    }
  } catch (_) {
    // fallback below
  } finally {
    clearTimeout(timer);
  }

  const homeController = new AbortController();
  const homeTimer = setTimeout(() => homeController.abort(), 8000);
  try {
    const homeRes = await fetch(`${baseUrl}/`, { method: 'GET', signal: homeController.signal });
    if (!homeRes.ok) {
      return { ok: false, message: `HTTP ${homeRes.status} on /` };
    }
    const html = await homeRes.text();
    if (/CrossPoint Reader|CrossPoint/i.test(html)) {
      return { ok: true, message: 'CrossPoint home page detected' };
    }
    return { ok: true, message: 'Device responded on /' };
  } finally {
    clearTimeout(homeTimer);
  }
}

/**
 * Send EPUB blob to X4 upload endpoint (same method for stock + crosspoint)
 */
async function sendEpubToX4(blob, fileName, ip, firmware) {
  const baseUrl = buildDeviceBaseUrl(ip);
  const formData = new FormData();
  formData.append('file', blob, fileName);

  const bytes = Number(blob?.size) || 0;
  const sizeMB = bytes / (1024 * 1024);
  // Adaptive timeout: 20s base + 7s per MB, clamped to 45s..15min
  const timeoutMs = Math.min(
    15 * 60 * 1000,
    Math.max(45 * 1000, Math.round((20 + sizeMB * 7) * 1000))
  );

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    const bodyText = await res.text().catch(() => '');
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}: ${bodyText || res.statusText}` };
    }
    return { ok: true, message: bodyText || 'Upload successful' };
  } catch (error) {
    if (timedOut || error?.name === 'AbortError') {
      return {
        ok: false,
        message: `Upload timed out after ${Math.ceil(timeoutMs / 1000)}s (${formatFileSize(bytes)}). Please retry while keeping the device awake and on the same Wi-Fi.`
      };
    }

    return {
      ok: false,
      message: error?.message || 'Network error while uploading'
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load persisted X4 settings
 */
async function loadX4Settings() {
  try {
    const result = await chrome.storage.sync.get(X4_SETTINGS_KEY);
    return result[X4_SETTINGS_KEY] || { firmware: 'crosspoint', ip: X4_DEFAULT_IP };
  } catch (_) {
    return { firmware: 'crosspoint', ip: X4_DEFAULT_IP };
  }
}

/**
 * Save persisted X4 settings
 */
async function saveX4Settings(settings) {
  try {
    await chrome.storage.sync.set({ [X4_SETTINGS_KEY]: settings });
  } catch (_) {
    // non-fatal
  }
}

/**
 * Ensure a safe .epub file name
 */
function getSanitizedEpubFileName(inputName) {
  let fileName = (inputName || '').trim() || pendingX4DefaultName || `ReadEasy_Merged_${new Date().toISOString().split('T')[0]}.epub`;
  fileName = fileName.replace(/[\\/:*?"<>|]/g, '_');
  if (!/\.epub$/i.test(fileName)) fileName += '.epub';
  return fileName;
}

/**
 * Human-readable bytes
 */
function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return `${size.toFixed(2)} ${units[idx]}`;
}

/**
 * Download a Blob as file
 */
function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Build merged EPUB blob from all saved articles
 * @param {Array} articles - Array of article objects from IndexedDB
 * @param {Object} [options]
 * @param {boolean} [options.includeImages=true]
 * @returns {Promise<Blob>}
 */
async function buildMergedEPUBBlob(articles, options = {}) {
  const includeImages = options.includeImages !== false;
  const zip = new JSZip();
  const chapters = [];
  // contentKey → { name, mimeType, base64 }
  const masterImageMap = new Map();
  let imageCounter = 0;
  let chapterNum = 1;

  for (const article of articles) {
    let htmlContent = article.htmlContent || '';

    if (includeImages) {
      // ── Extract data: URLs directly from the raw HTML string ─────────────────
      // Bypasses any DOM round-trip (innerHTML parse+serialize can corrupt large
      // base64 attribute values via img.src URL resolution or serializer quirks).
      //
      // Matches:  src="data:image/png;base64,<base64data>"
      //           (double-quoted; browsers always produce double-quoted via innerHTML)
      const dataUrlRegex = /src="(data:([\w+\-]+\/[\w+\-]+);base64,([^"]+))"/g;
      let match;

      // Map exact data: URL string → assigned image filename (for this article)
      const urlToName = new Map();

      while ((match = dataUrlRegex.exec(htmlContent)) !== null) {
        const fullDataUrl = match[1]; // data:image/png;base64,...
        const mimeType   = match[2]; // image/png
        const base64Raw  = match[3]; // base64 chars (may have whitespace from FileReader)

        if (urlToName.has(fullDataUrl)) continue; // same URL already mapped

        // Strip whitespace — FileReader and some canvases insert \n every 76 chars
        const cleanBase64 = base64Raw.replace(/\s/g, '');

        // Validate: length-without-padding mod 4 must not be 1
        const unpadded = cleanBase64.replace(/=+$/, '');
        if (unpadded.length % 4 === 1) {
          console.warn('[EPUB] Skipping image with invalid base64 length:', unpadded.length, mimeType);
          continue;
        }

        // Deduplication fingerprint: total length + samples from start, middle, end.
        // Using only the first N chars causes false matches on images that share the
        // same encoder headers (e.g. all PNGs from the same CDN start identically).
        const len = cleanBase64.length;
        const mid = Math.floor(len / 2);
        const contentKey = `${mimeType}|${len}|${cleanBase64.slice(0, 64)}|${cleanBase64.slice(mid, mid + 64)}|${cleanBase64.slice(-64)}`;

        let imageName;
        if (masterImageMap.has(contentKey)) {
          imageName = masterImageMap.get(contentKey).name;
        } else {
          const ext = (mimeType.split('/')[1] || 'png').split('+')[0];
          imageName = `image_${imageCounter}.${ext}`;
          masterImageMap.set(contentKey, { name: imageName, mimeType, base64: cleanBase64 });
          imageCounter++;
        }

        urlToName.set(fullDataUrl, imageName);
      }

      // ── Replace data: URLs with EPUB-relative paths ───────────────────────────
      // Use split+join (literal string replacement) — never use RegExp on base64
      // because base64 contains +, /, = which are RegExp special characters.
      for (const [dataUrl, imageName] of urlToName) {
        htmlContent = htmlContent
          .split(`src="${dataUrl}"`)
          .join(`src="images/${imageName}"`);
      }
    } else {
      // Build image-free chapter content for smaller X4 transfers
      htmlContent = htmlContent.replace(/<picture[^>]*>[\s\S]*?<\/picture>/gi, '');
      htmlContent = htmlContent.replace(/<img\b[^>]*>/gi, '');
    }

    chapters.push({
      num: chapterNum,
      id: `chapter_${chapterNum}`,
      filename: `chapter_${chapterNum}.xhtml`,
      title: article.title || 'Untitled',
      siteName: article.siteName || '',
      date: new Date(article.addedDate || Date.now()),
      content: convertToXHTML(htmlContent, article.title || 'Untitled')
    });

    chapterNum++;
  }

  // ── EPUB structure ────────────────────────────────────────────────────────

  // 1. mimetype (must be first and uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  // 3. Package document
  zip.file('OEBPS/content.opf', generateContentOPF(chapters, masterImageMap));

  // 4. NCX navigation (EPUB 2 compatibility)
  zip.file('OEBPS/toc.ncx', generateTocNCX(chapters));

  // 5. EPUB 3 navigation document
  zip.file('OEBPS/nav.xhtml', generateNavXHTML(chapters));

  // 6. Stylesheet
  zip.file('OEBPS/style.css', [
    'body { font-family: Georgia, serif; line-height: 1.6; margin: 2em; max-width: 40em; }',
    'h1 { font-size: 1.8em; margin-bottom: 0.3em; }',
    'img { max-width: 100%; height: auto; display: block; margin: 1em auto; }',
    'p { margin-bottom: 1em; text-align: justify; }',
    'a { color: #0066cc; }',
    'blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 1em; color: #555; }'
  ].join('\n'));

  // 7. Chapter XHTML files
  for (const chapter of chapters) {
    zip.file(`OEBPS/${chapter.filename}`, chapter.content);
  }

  // 8. Embedded images — base64 is pre-cleaned and stored directly in the map value
  for (const [, imageData] of masterImageMap) {
    if (!imageData.base64) continue;
    zip.file(`OEBPS/images/${imageData.name}`, imageData.base64, { base64: true });
  }

  // Generate blob
  return await zip.generateAsync({ type: 'blob' });
}

/**
 * Generate merged EPUB and download (existing behavior)
 * @param {Array} articles - Array of article objects from IndexedDB
 */
async function generateMergedEPUB(articles) {
  const blob = await buildMergedEPUBBlob(articles);
  const fileName = `ReadEasy_Merged_${new Date().toISOString().split('T')[0]}.epub`;
  downloadBlob(blob, fileName);
}

/**
 * Convert HTML to XHTML
 */
/**
 * Replace all named HTML entities (e.g. &nbsp; &mdash; &ldquo;) with their
 * literal Unicode characters, which are safe in UTF-8 XML/XHTML.
 * The five XML-native entities (&amp; &lt; &gt; &quot; &apos;) are left alone.
 */
function decodeNamedEntities(html) {
  // Match named entities only (not numeric &#…; ones, not the 5 XML built-ins)
  return html.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#)[a-zA-Z][a-zA-Z0-9]*;/g, entity => {
    const ta = document.createElement('textarea');
    ta.innerHTML = entity;
    return ta.value; // browser decodes it to the real Unicode character
  });
}

function convertToXHTML(html, title) {
  // Decode named HTML entities → literal Unicode (XML doesn't know &nbsp; etc.)
  html = decodeNamedEntities(html);

  // Remove picture elements and keep only the img
  html = html.replace(/<picture[^>]*>[\s\S]*?<img([^>]*?)\/?>[\s\S]*?<\/picture>/gi, '<img$1 />');
  html = html.replace(/<picture[^>]*>[\s\S]*?<\/picture>/gi, '');
  
  // Self-close void elements
  const voidElements = ['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'track', 'area', 'base', 'col', 'embed', 'param', 'wbr'];
  voidElements.forEach(tag => {
    const regex = new RegExp(`<${tag}([^>]*?)(?<!/)>`, 'gi');
    html = html.replace(regex, `<${tag}$1 />`);
  });
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="style.css"/>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${html}
</body>
</html>`;
}

/**
 * Generate content.opf
 */
function generateContentOPF(chapters, imageMap) {
  const manifestItems = chapters.map(ch => 
    `    <item id="${ch.id}" href="${ch.filename}" media-type="application/xhtml+xml"/>`
  ).join('\n');
  
  const imageItems = Array.from(imageMap.values()).map((img, idx) => 
    `    <item id="img_${idx}" href="images/${img.name}" media-type="${img.mimeType}"/>`
  ).join('\n');
  
  const spineItems = chapters.map(ch => 
    `    <itemref idref="${ch.id}"/>`
  ).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">readeasy-merged-${Date.now()}</dc:identifier>
    <dc:title>ReadEasy Merged Collection</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>ReadEasy</dc:creator>
    <dc:date>${new Date().toISOString().split('T')[0]}</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString()}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
${manifestItems}
${imageItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`;
}

/**
 * Generate toc.ncx
 */
function generateTocNCX(chapters) {
  const navPoints = chapters.map((ch, idx) => {
    const dateStr = ch.date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
    const label = `${ch.title} (${ch.siteName}, ${dateStr})`;
    
    return `    <navPoint id="nav_${ch.num}" playOrder="${idx + 1}">
      <navLabel><text>${escapeHtml(label)}</text></navLabel>
      <content src="${ch.filename}"/>
    </navPoint>`;
  }).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="readeasy-merged-${Date.now()}"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>ReadEasy Merged Collection</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;
}

/**
 * Generate nav.xhtml
 */
function generateNavXHTML(chapters) {
  const navItems = chapters.map(ch => {
    const dateStr = ch.date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
    const label = `${ch.title} (${ch.siteName}, ${dateStr})`;
    
    return `      <li><a href="${ch.filename}">${escapeHtml(label)}</a></li>`;
  }).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="UTF-8"/>
  <title>Table of Contents</title>
</head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`;
}

/**
 * Show toast notification
 */
function showToast(message, type = 'error', duration = 4000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
