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
  
  // Merge EPUB button
  document.getElementById('mergeEpubBtn').addEventListener('click', async () => {
    await handleMergeEPUB();
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
        }
      } catch (err) {
        console.warn('[SidePanel] Could not reach reader tab:', err.message);
        currentReaderTabId = null;
        hideCurrentArticleSection('Reader page still loading…');
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
  } catch (error) {
    console.error('[SidePanel] Error in checkCurrentTab:', error);
    hideCurrentArticleSection('Could not detect current page');
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
    return;
  }
  
  // Render articles (oldest first - already sorted)
  readingListMeta.forEach((article, index) => {
    const card = createArticleCard(article);
    listContainer.appendChild(card);
  });
  
  mergeBtn.disabled = false;
}

/**
 * Create article card element
 */
function createArticleCard(article) {
  const card = document.createElement('div');
  card.className = 'article-card saved-article';
  card.dataset.id = article.id;
  
  const date = new Date(article.addedDate);
  const formattedDate = date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
  
  card.innerHTML = `
    <div class="article-title">${escapeHtml(article.title)}</div>
    <div class="article-meta">${escapeHtml(article.siteName)} • ${formattedDate}</div>
    <div class="article-actions">
      <button class="btn-danger remove-btn" data-id="${article.id}">Remove</button>
    </div>
  `;
  
  // Add remove button handler
  card.querySelector('.remove-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    await handleRemoveArticle(article.id);
  });
  
  return card;
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
 * Generate a merged EPUB file from all saved articles and trigger download
 * @param {Array} articles - Array of article objects from IndexedDB
 */
async function generateMergedEPUB(articles) {
  const zip = new JSZip();
  const chapters = [];
  // contentKey → { name, mimeType, base64 }
  const masterImageMap = new Map();
  let imageCounter = 0;
  let chapterNum = 1;

  for (const article of articles) {
    let htmlContent = article.htmlContent || '';

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

  // Generate blob and trigger download
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ReadEasy_Merged_${new Date().toISOString().split('T')[0]}.epub`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
