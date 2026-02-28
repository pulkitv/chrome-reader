/**
 * ReadEasy Side Panel - Reading List Manager
 * Handles article list display, storage management, and EPUB merging
 */

// State
let readingListMeta = [];
let currentArticleData = null;

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  await initPanel();
  setupEventListeners();
  await checkCurrentTab();
});

/**
 * Initialize panel - load data and render
 */
async function initPanel() {
  try {
    // Initialize IndexedDB
    await initDB();
    
    // Load metadata from chrome.storage.local
    const { readingListMeta: storedMeta } = await chrome.storage.local.get('readingListMeta');
    readingListMeta = storedMeta || [];
    
    // Render list
    await renderArticleList();
    
    // Update storage indicator
    await updateStorageInfo();
  } catch (error) {
    console.error('Failed to initialize panel:', error);
    showToast('Failed to load reading list', 'error');
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Add to list button (current article)
  document.getElementById('addToListBtn').addEventListener('click', async () => {
    if (currentArticleData) {
      await handleAddToList(currentArticleData);
    }
  });
  
  // Merge EPUB button
  document.getElementById('mergeEpubBtn').addEventListener('click', async () => {
    await handleMergeEPUB();
  });
  
  // Listen for list updates from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'listUpdated') {
      initPanel(); // Reload everything
    }
  });
  
  // Listen for tab changes
  chrome.tabs.onActivated.addListener(() => {
    checkCurrentTab();
  });
}

/**
 * Check current tab and show/hide current article section
 */
async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url) {
      hideCurrentArticleSection();
      return;
    }
    
    // Check if it's a reader page
    if (tab.url.includes('reader.html')) {
      // Request article data from reader tab
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getCurrentArticle' });
        if (response && response.title) {
          showCurrentArticleSection(response);
        } else {
          hideCurrentArticleSection();
        }
      } catch (error) {
        // Tab might not have the listener yet
        hideCurrentArticleSection();
      }
    } else {
      hideCurrentArticleSection();
    }
  } catch (error) {
    console.error('Error checking current tab:', error);
    hideCurrentArticleSection();
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
}

/**
 * Hide current article section
 */
function hideCurrentArticleSection() {
  currentArticleData = null;
  document.getElementById('currentArticleSection').style.display = 'none';
}

/**
 * Handle add to list button click
 */
async function handleAddToList(articleData) {
  const addBtn = document.getElementById('addToListBtn');
  
  try {
    // Disable button
    addBtn.disabled = true;
    addBtn.querySelector('span').textContent = 'Adding...';
    
    // Send message to background script to save
    const response = await chrome.runtime.sendMessage({
      action: 'saveToReadingList',
      article: articleData
    });
    
    if (response.success) {
      showToast('Added to Reading List ✓', 'success', 2000);
      
      // Hide current article section after adding
      hideCurrentArticleSection();
      
      // Refresh list
      await initPanel();
    } else {
      throw new Error(response.error || 'Failed to save article');
    }
  } catch (error) {
    console.error('Error adding to list:', error);
    showToast(error.message || 'Failed to add article', 'error');
    
    // Re-enable button
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
    // Disable button
    mergeBtn.disabled = true;
    mergeBtn.querySelector('span').textContent = 'Generating EPUB...';
    
    // Check if JSZip is loaded
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip library not loaded');
    }
    
    // Get all articles from IndexedDB
    const articles = await getAllArticles();
    
    if (articles.length === 0) {
      throw new Error('No articles to merge');
    }
    
    // Generate merged EPUB
    await generateMergedEPUB(articles);
    
    showToast('EPUB downloaded successfully ✓', 'success', 3000);
  } catch (error) {
    console.error('Error generating EPUB:', error);
    showToast('EPUB generation failed: ' + error.message, 'error');
  } finally {
    mergeBtn.disabled = false;
    mergeBtn.querySelector('span').textContent = 'Merge & Download EPUB';
  }
}

/**
 * Generate merged EPUB from multiple articles
 */
async function generateMergedEPUB(articles) {
  const zip = new JSZip();
  
  // Master image map to deduplicate images across all articles
  const masterImageMap = new Map();
  let imageCounter = 0;
  
  // Process each article and extract images
  const chapters = [];
  
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const chapterNum = i + 1;
    
    // Extract images from this article's HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = article.htmlContent;
    const images = tempDiv.querySelectorAll('img');
    
    // Map old src to new src for this article
    const articleImageMap = new Map();
    
    images.forEach(img => {
      const src = img.src;
      
      // Check if this image is already in master map
      if (!masterImageMap.has(src)) {
        const imageName = `image_${imageCounter}.png`;
        const mimeType = src.match(/data:([^;]+);/)?.[1] || 'image/png';
        
        masterImageMap.set(src, {
          name: imageName,
          dataUrl: src,
          mimeType: mimeType
        });
        
        imageCounter++;
      }
      
      articleImageMap.set(src, masterImageMap.get(src).name);
    });
    
    // Replace image URLs in HTML
    let htmlContent = article.htmlContent;
    articleImageMap.forEach((newSrc, oldSrc) => {
      const escapedOldSrc = oldSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      htmlContent = htmlContent.replace(new RegExp(escapedOldSrc, 'g'), `images/${newSrc}`);
    });
    
    // Convert to XHTML
    const xhtmlContent = convertToXHTML(htmlContent, article.title);
    
    chapters.push({
      num: chapterNum,
      id: `chapter_${chapterNum}`,
      filename: `chapter_${chapterNum}.xhtml`,
      title: article.title,
      siteName: article.siteName,
      date: new Date(article.addedDate),
      content: xhtmlContent
    });
  }
  
  // Create EPUB structure
  
  // 1. mimetype (must be first, uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  
  // 2. META-INF/container.xml
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
  
  // 3. content.opf (package document)
  const contentOpf = generateContentOPF(chapters, masterImageMap);
  zip.file('OEBPS/content.opf', contentOpf);
  
  // 4. toc.ncx (navigation)
  const tocNcx = generateTocNCX(chapters);
  zip.file('OEBPS/toc.ncx', tocNcx);
  
  // 5. nav.xhtml (EPUB 3 navigation)
  const navXhtml = generateNavXHTML(chapters);
  zip.file('OEBPS/nav.xhtml', navXhtml);
  
  // 6. style.css
  zip.file('OEBPS/style.css', `
body { font-family: Georgia, serif; line-height: 1.6; margin: 2em; }
h1 { font-size: 2em; margin-bottom: 0.5em; }
img { max-width: 100%; height: auto; }
p { margin-bottom: 1em; }
  `);
  
  // 7. Chapter files
  chapters.forEach(chapter => {
    zip.file(`OEBPS/${chapter.filename}`, chapter.content);
  });
  
  // 8. Images
  for (const [src, imageData] of masterImageMap) {
    // Extract base64 data
    const base64Data = imageData.dataUrl.split(',')[1];
    zip.file(`OEBPS/images/${imageData.name}`, base64Data, { base64: true });
  }
  
  // Generate and download
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ReadEasy_Merged_${new Date().toISOString().split('T')[0]}.epub`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Convert HTML to XHTML
 */
function convertToXHTML(html, title) {
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
