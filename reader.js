// Reader View UI JavaScript

const FONT_SIZES = ['font-small', 'font-normal', 'font-large', 'font-xlarge', 'font-xxlarge'];
const THEMES = ['light-theme', 'sepia-theme', 'dark-theme'];

let currentFontSizeIndex = 1; // Start with font-normal
let isWideWidth = false;

// Initialize reader on page load
document.addEventListener('DOMContentLoaded', async () => {
  // Set base URL from query parameter to help with image loading
  const urlParams = new URLSearchParams(window.location.search);
  const sourceUrl = urlParams.get('url');
  if (sourceUrl) {
    const base = document.createElement('base');
    base.href = sourceUrl;
    document.head.insertBefore(base, document.head.firstChild);
  }
  
  await loadArticle();
  setupEventListeners();
  loadPreferences();
  updateProgressBar();
});

/**
 * Load article from session storage
 */
async function loadArticle() {
  try {
    const { currentArticle } = await chrome.storage.session.get('currentArticle');
    
    if (!currentArticle) {
      displayError('No article found. Please try again.');
      return;
    }

    // Update document title
    document.title = currentArticle.title || 'Chrome Reader';

    // Display article metadata
    const titleEl = document.getElementById('articleTitle');
    const bylineEl = document.getElementById('articleByline');
    const siteEl = document.getElementById('articleSite');
    const bodyEl = document.getElementById('articleBody');
    const sourceLink = document.getElementById('sourceLink');

    titleEl.textContent = currentArticle.title || 'Untitled';
    
    if (currentArticle.byline) {
      bylineEl.textContent = `By ${currentArticle.byline}`;
      bylineEl.style.display = 'block';
    } else {
      bylineEl.style.display = 'none';
    }

    if (currentArticle.siteName) {
      siteEl.textContent = currentArticle.siteName;
      siteEl.style.display = 'block';
    } else {
      siteEl.style.display = 'none';
    }

    // Set source link
    if (currentArticle.sourceUrl) {
      sourceLink.href = currentArticle.sourceUrl;
    }

    // Sanitize and display article content
    bodyEl.innerHTML = sanitizeHtml(currentArticle.content);

    // Debug: Check images in content
    const images = bodyEl.querySelectorAll('img');
    console.log(`Article has ${images.length} images`);
    images.forEach((img, i) => {
      console.log(`Image ${i}:`, {
        src: img.src,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight
      });
    });

    // Lazy load images for better performance
    setupLazyLoading();

  } catch (error) {
    console.error('Error loading article:', error);
    displayError('Failed to load article content.');
  }
}

/**
 * Basic HTML sanitization (removes scripts and dangerous attributes)
 */
function sanitizeHtml(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Remove script tags
  const scripts = temp.querySelectorAll('script');
  scripts.forEach(script => script.remove());

  // Remove event handler attributes
  const allElements = temp.querySelectorAll('*');
  allElements.forEach(el => {
    // Remove on* event attributes
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
  });

  // Remove iframes (optionally, you could convert them to links)
  const iframes = temp.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    const link = document.createElement('a');
    link.href = iframe.src || '#';
    link.textContent = `[Embedded content: ${iframe.src || 'Unknown'}]`;
    link.target = '_blank';
    iframe.replaceWith(link);
  });

  return temp.innerHTML;
}

/**
 * Setup lazy loading for images
 */
function setupLazyLoading() {
  const images = document.querySelectorAll('.article-body img');
  
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          observer.unobserve(img);
        }
      });
    });

    images.forEach(img => imageObserver.observe(img));
  }
}

/**
 * Setup event listeners for controls
 */
function setupEventListeners() {
  // Close button
  document.getElementById('closeBtn').addEventListener('click', () => {
    window.close();
  });

  // Theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      setTheme(theme);
    });
  });

  // Font size controls
  document.getElementById('decreaseFont').addEventListener('click', () => {
    if (currentFontSizeIndex > 0) {
      currentFontSizeIndex--;
      updateFontSize();
    }
  });

  document.getElementById('increaseFont').addEventListener('click', () => {
    if (currentFontSizeIndex < FONT_SIZES.length - 1) {
      currentFontSizeIndex++;
      updateFontSize();
    }
  });

  // Width toggle
  document.getElementById('toggleWidth').addEventListener('click', () => {
    isWideWidth = !isWideWidth;
    const article = document.getElementById('articleContent');
    if (isWideWidth) {
      article.classList.add('wide');
    } else {
      article.classList.remove('wide');
    }
    savePreferences();
  });

  // Download button
  document.getElementById('downloadBtn').addEventListener('click', () => {
    openDownloadModal();
  });

  // Download EPUB button
  document.getElementById('downloadEpubBtn').addEventListener('click', () => {
    downloadArticleEPUB();
  });

  // Email EPUB button
  document.getElementById('emailEpubBtn').addEventListener('click', () => {
    openEmailEpubModal();
  });

  // Email EPUB modal handlers
  document.getElementById('closeEmailEpubModal').addEventListener('click', closeEmailEpubModal);
  document.getElementById('cancelEmailEpub').addEventListener('click', closeEmailEpubModal);
  document.getElementById('confirmEmailEpub').addEventListener('click', emailArticleEPUB);
  
  // Close email EPUB modal on outside click
  document.getElementById('emailEpubModal').addEventListener('click', (e) => {
    if (e.target.id === 'emailEpubModal') {
      closeEmailEpubModal();
    }
  });
  
  // Handle Enter key in recipient email input
  document.getElementById('recipientEmailInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      emailArticleEPUB();
    }
  });

  // Modal close buttons
  document.getElementById('closeModal').addEventListener('click', closeDownloadModal);
  document.getElementById('cancelDownload').addEventListener('click', closeDownloadModal);
  
  // Confirm download button
  document.getElementById('confirmDownload').addEventListener('click', downloadArticleHTML);
  
  // Close modal on outside click
  document.getElementById('downloadModal').addEventListener('click', (e) => {
    if (e.target.id === 'downloadModal') {
      closeDownloadModal();
    }
  });
  
  // Handle Enter key in filename input
  document.getElementById('filenameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      downloadArticleHTML();
    }
  });

  // Scroll progress
  window.addEventListener('scroll', updateProgressBar);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Escape to close
    if (e.key === 'Escape') {
      window.close();
    }
    // + to increase font size
    if (e.key === '+' || e.key === '=') {
      document.getElementById('increaseFont').click();
    }
    // - to decrease font size
    if (e.key === '-') {
      document.getElementById('decreaseFont').click();
    }
  });
}

/**
 * Set theme
 */
function setTheme(theme) {
  const validTheme = theme + '-theme';
  document.body.className = document.body.className
    .split(' ')
    .filter(c => !THEMES.includes(c))
    .concat(validTheme)
    .join(' ');
  savePreferences();
}

/**
 * Update font size
 */
function updateFontSize() {
  document.body.className = document.body.className
    .split(' ')
    .filter(c => !FONT_SIZES.includes(c))
    .concat(FONT_SIZES[currentFontSizeIndex])
    .join(' ');
  savePreferences();
}

/**
 * Update reading progress bar
 */
function updateProgressBar() {
  const windowHeight = window.innerHeight;
  const documentHeight = document.documentElement.scrollHeight - windowHeight;
  const scrolled = window.scrollY;
  const progress = (scrolled / documentHeight) * 100;
  
  document.getElementById('progressBar').style.width = `${Math.min(progress, 100)}%`;
}

/**
 * Save user preferences
 */
function savePreferences() {
  const preferences = {
    theme: THEMES.find(t => document.body.classList.contains(t)) || 'light-theme',
    fontSize: FONT_SIZES[currentFontSizeIndex],
    wideWidth: isWideWidth
  };
  chrome.storage.sync.set({ readerPreferences: preferences });
}

/**
 * Load user preferences
 */
async function loadPreferences() {
  try {
    const { readerPreferences } = await chrome.storage.sync.get('readerPreferences');
    
    if (readerPreferences) {
      // Apply theme
      if (readerPreferences.theme) {
        document.body.className = document.body.className
          .split(' ')
          .filter(c => !THEMES.includes(c))
          .concat(readerPreferences.theme)
          .join(' ');
      }

      // Apply font size
      if (readerPreferences.fontSize) {
        currentFontSizeIndex = FONT_SIZES.indexOf(readerPreferences.fontSize);
        if (currentFontSizeIndex === -1) currentFontSizeIndex = 1;
        updateFontSize();
      }

      // Apply width
      if (readerPreferences.wideWidth) {
        isWideWidth = true;
        document.getElementById('articleContent').classList.add('wide');
      }
    }
  } catch (error) {
    console.error('Error loading preferences:', error);
  }
}

/**
 * Display error message
 */
function displayError(message) {
  const bodyEl = document.getElementById('articleBody');
  bodyEl.innerHTML = `
    <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
      <p style="font-size: 1.2em; margin-bottom: 16px;">⚠️ ${message}</p>
      <button onclick="window.close()" style="padding: 10px 20px; background: var(--link-color); color: white; border: none; border-radius: 6px; cursor: pointer;">
        Close
      </button>
    </div>
  `;
}

/**
 * Open download modal
 */
function openDownloadModal() {
  const modal = document.getElementById('downloadModal');
  const filenameInput = document.getElementById('filenameInput');
  
  // Set default filename from article title
  const title = document.getElementById('articleTitle').textContent;
  const defaultFilename = title
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .substring(0, 50)
    .toLowerCase();
  
  modal.classList.add('show');
  filenameInput.value = defaultFilename;
  filenameInput.focus();
  filenameInput.select();
}

/**
 * Close download modal
 */
function closeDownloadModal() {
  const modal = document.getElementById('downloadModal');
  modal.classList.remove('show');
}

/**
 * Download article as HTML file
 */
function downloadArticleHTML() {
  const filenameInput = document.getElementById('filenameInput');
  let filename = filenameInput.value.trim();
  
  // Validate filename
  if (!filename) {
    alert('Please enter a filename');
    filenameInput.focus();
    return;
  }
  
  // Sanitize filename
  filename = filename.replace(/[^a-z0-9_-]/gi, '_');
  
  // Get article data
  const title = document.getElementById('articleTitle').textContent;
  const byline = document.getElementById('articleByline').textContent;
  const siteName = document.getElementById('articleSite').textContent;
  const bodyHtml = document.getElementById('articleBody').innerHTML;
  const sourceLink = document.getElementById('sourceLink').href;
  
  // Build complete HTML document with inline styles
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      font-size: 18px;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #ffffff;
      padding: 40px 20px;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
    }
    .article-header {
      margin-bottom: 40px;
      padding-bottom: 30px;
      border-bottom: 1px solid #e0e0e0;
    }
    h1 {
      font-size: 2.5em;
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 16px;
    }
    .byline, .site-name {
      color: #666666;
      font-size: 0.9em;
      margin-bottom: 8px;
    }
    .source-link {
      color: #0066cc;
      text-decoration: none;
      font-size: 0.9em;
    }
    .source-link:hover {
      text-decoration: underline;
    }
    .article-body {
      font-size: 1em;
      line-height: 1.6;
    }
    .article-body > * {
      margin-bottom: 1.5em;
    }
    .article-body h2 {
      font-size: 1.75em;
      font-weight: 600;
      margin-top: 1.5em;
      margin-bottom: 0.75em;
    }
    .article-body h3 {
      font-size: 1.5em;
      font-weight: 600;
      margin-top: 1.5em;
      margin-bottom: 0.75em;
    }
    .article-body h4 {
      font-size: 1.25em;
      font-weight: 600;
      margin-top: 1.5em;
      margin-bottom: 0.75em;
    }
    .article-body p {
      margin-bottom: 1.5em;
    }
    .article-body a {
      color: #0066cc;
      text-decoration: underline;
      text-decoration-color: #0066cc;
      text-underline-offset: 2px;
    }
    .article-body a:hover {
      text-decoration-thickness: 2px;
    }
    .article-body img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 2em 0;
      display: block;
    }
    .article-body figure {
      margin: 2em 0;
    }
    .article-body figcaption {
      font-size: 0.85em;
      color: #666666;
      text-align: center;
      margin-top: 0.5em;
      font-style: italic;
    }
    .article-body blockquote {
      border-left: 4px solid #e0e0e0;
      padding-left: 1.5em;
      margin: 2em 0;
      color: #666666;
      font-style: italic;
    }
    .article-body code {
      background-color: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }
    .article-body pre {
      background-color: #f5f5f5;
      padding: 1em;
      border-radius: 6px;
      overflow-x: auto;
      margin: 2em 0;
    }
    .article-body pre code {
      background: none;
      padding: 0;
    }
    .article-body ul, .article-body ol {
      padding-left: 2em;
      margin-bottom: 1.5em;
    }
    .article-body li {
      margin-bottom: 0.5em;
    }
    .article-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 2em 0;
    }
    .article-body th, .article-body td {
      border: 1px solid #e0e0e0;
      padding: 0.75em;
      text-align: left;
    }
    .article-body th {
      background-color: #f8f9fa;
      font-weight: 600;
    }
    .article-body hr {
      border: none;
      border-top: 1px solid #e0e0e0;
      margin: 3em 0;
    }
    .footer {
      margin-top: 60px;
      padding-top: 30px;
      border-top: 1px solid #e0e0e0;
      color: #666666;
      font-size: 0.85em;
      text-align: center;
    }
    @media print {
      body { padding: 20px; }
      .footer { page-break-before: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="article-header">
      <h1>${title}</h1>
      ${byline ? `<div class="byline">By ${byline}</div>` : ''}
      ${siteName ? `<div class="site-name">${siteName}</div>` : ''}
      <a href="${sourceLink}" class="source-link" target="_blank">View Original Article</a>
    </header>
    
    <main class="article-body">
      ${bodyHtml}
    </main>
    
    <footer class="footer">
      <p>Downloaded from Chrome Reader Extension</p>
      <p>Original source: <a href="${sourceLink}" target="_blank">${sourceLink}</a></p>
    </footer>
  </div>
</body>
</html>`;
  
  // Create blob and download
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  // Clean up
  URL.revokeObjectURL(url);
  
  // Close modal
  closeDownloadModal();
  
  // Show confirmation
  showNotification('✓ Article downloaded successfully!');
}

/**
 * Convert HTML to XHTML-compliant format for EPUB
 */
function htmlToXHTML(html) {
  // Create a temporary div to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Self-close void elements
  const voidElements = ['img', 'br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];
  
  voidElements.forEach(tag => {
    const elements = temp.getElementsByTagName(tag);
    Array.from(elements).forEach(el => {
      if (!el.outerHTML.endsWith('/>') && !el.outerHTML.endsWith(' />')) {
        const clone = el.cloneNode(true);
        // Mark for self-closing
        clone.setAttribute('data-self-close', 'true');
        el.replaceWith(clone);
      }
    });
  });
  
  // Get the HTML and fix self-closing tags
  let xhtml = temp.innerHTML;
  
  // Replace unclosed void elements with self-closing versions
  voidElements.forEach(tag => {
    // Match opening tags that aren't already self-closed
    const regex = new RegExp(`<${tag}([^>]*?)(?<!/)>`, 'gi');
    xhtml = xhtml.replace(regex, `<${tag}$1 />`);
  });
  
  // Remove data-self-close attributes
  xhtml = xhtml.replace(/\s+data-self-close="true"/g, '');
  
  // Ensure all & are properly escaped (but not already escaped ones)
  xhtml = xhtml.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
  
  return xhtml;
}

/**
 * Download article as EPUB file
 */
async function downloadArticleEPUB() {
  // Get article data
  const title = document.getElementById('articleTitle').textContent;
  const byline = document.getElementById('articleByline').textContent || 'Unknown Author';
  const siteName = document.getElementById('articleSite').textContent || 'Unknown Source';
  let bodyHtml = document.getElementById('articleBody').innerHTML;
  const sourceLink = document.getElementById('sourceLink').href;
  
  // Extract and convert images to base64
  const images = document.getElementById('articleBody').querySelectorAll('img');
  const imageMap = new Map();
  let imageIndex = 0;
  
  for (const img of images) {
    const src = img.src;
    if (!src || src.startsWith('data:')) continue;
    
    try {
      // Fetch the image
      const response = await fetch(src);
      const blob = await response.blob();
      
      // Get file extension from blob type
      const mimeType = blob.type || 'image/png';
      const ext = mimeType.split('/')[1] || 'png';
      const imageName = `image_${imageIndex}.${ext}`;
      
      // Convert to base64
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
      
      imageMap.set(src, { name: imageName, base64, mimeType });
      imageIndex++;
      console.log(`Embedded image: ${imageName}`);
    } catch (error) {
      console.warn('Failed to embed image:', src, error);
    }
  }
  
  // Replace image URLs in HTML with embedded paths
  imageMap.forEach((imageData, originalSrc) => {
    const regex = new RegExp(originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    bodyHtml = bodyHtml.replace(regex, `images/${imageData.name}`);
  });
  
  // Convert HTML to XHTML for EPUB compatibility
  const bodyXHTML = htmlToXHTML(bodyHtml);
  
  // Generate filename
  const filename = title
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .substring(0, 50)
    .toLowerCase();
  
  // Create EPUB content
  const uuid = 'urn:uuid:' + generateUUID();
  const timestamp = new Date().toISOString();
  
  // EPUB structure files
  const mimetype = 'application/epub+zip';
  
  const containerXML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  
  const contentOPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${uuid}</dc:identifier>
    <dc:title>${escapeXML(title)}</dc:title>
    <dc:creator>${escapeXML(byline)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:publisher>Chrome Reader</dc:publisher>
    <dc:date>${timestamp}</dc:date>
    <dc:source>${escapeXML(sourceLink)}</dc:source>
    <meta property="dcterms:modified">${timestamp}</meta>
  </metadata>
  <manifest>
    <item id="content" href="content.html" media-type="application/xhtml+xml"/>
    <item id="style" href="style.css" media-type="text/css"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${Array.from(imageMap.values()).map((img, idx) => 
      `<item id="img${idx}" href="images/${img.name}" media-type="${img.mimeType}"/>`
    ).join('\n    ')}
  </manifest>
  <spine>
    <itemref idref="content"/>
  </spine>
</package>`;
  
  const navXHTML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Navigation</title>
</head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol>
      <li><a href="content.html">${escapeXML(title)}</a></li>
    </ol>
  </nav>
</body>
</html>`;
  
  const styleCSS = `body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
  font-size: 1.1em;
  line-height: 1.6;
  color: #1a1a1a;
  margin: 1em;
  padding: 0;
}
h1, h2, h3, h4, h5, h6 {
  font-weight: 600;
  line-height: 1.3;
  margin-top: 1.5em;
  margin-bottom: 0.75em;
}
h1 { font-size: 2em; }
h2 { font-size: 1.5em; }
h3 { font-size: 1.25em; }
p {
  margin-bottom: 1em;
}
a {
  color: #0066cc;
  text-decoration: underline;
}
img {
  max-width: 100%;
  height: auto;
  margin: 1em 0;
}
blockquote {
  border-left: 4px solid #ccc;
  padding-left: 1em;
  margin: 1em 0;
  font-style: italic;
}
code {
  background-color: #f5f5f5;
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: monospace;
}
pre {
  background-color: #f5f5f5;
  padding: 1em;
  overflow-x: auto;
  border-radius: 6px;
}
ul, ol {
  padding-left: 2em;
  margin-bottom: 1em;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
}
th, td {
  border: 1px solid #ddd;
  padding: 0.5em;
  text-align: left;
}
th {
  background-color: #f5f5f5;
  font-weight: 600;
}
.article-meta {
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 1em;
  margin-bottom: 2em;
}
.byline, .source {
  color: #666;
  font-size: 0.9em;
  margin-top: 0.5em;
}`;
  
  const contentHTML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXML(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <div class="article-meta">
    <h1>${escapeXML(title)}</h1>
    ${byline ? `<p class="byline">By ${escapeXML(byline)}</p>` : ''}
    ${siteName ? `<p class="source">${escapeXML(siteName)}</p>` : ''}
    <p class="source"><a href="${escapeXML(sourceLink)}">View Original Article</a></p>
  </div>
  <div class="article-body">
    ${bodyXHTML}
  </div>
  <hr/>
  <p style="font-size: 0.9em; color: #666;">Downloaded from Chrome Reader Extension</p>
</body>
</html>`;
  
  // Create ZIP file with embedded images
  createEPUBZip({
    'mimetype': mimetype,
    'META-INF/container.xml': containerXML,
    'OEBPS/content.opf': contentOPF,
    'OEBPS/nav.xhtml': navXHTML,
    'OEBPS/style.css': styleCSS,
    'OEBPS/content.html': contentHTML
  }, filename, imageMap);
}

/**
 * Generate a simple UUID v4
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Escape XML special characters
 */
function escapeXML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Create EPUB ZIP file using basic ZIP implementation
 */
function createEPUBZip(files, filename, imageMap = new Map()) {
  // Check if JSZip is available
  if (typeof JSZip === 'undefined') {
    alert('EPUB generation requires JSZip library. Downloading as HTML instead.');
    openDownloadModal();
    return;
  }
  
  const zip = new JSZip();
  
  // Add mimetype file (must be first and uncompressed)
  zip.file('mimetype', files['mimetype'], { compression: 'STORE' });
  
  // Add META-INF folder
  zip.file('META-INF/container.xml', files['META-INF/container.xml']);
  
  // Add OEBPS folder with content
  zip.file('OEBPS/content.opf', files['OEBPS/content.opf']);
  zip.file('OEBPS/nav.xhtml', files['OEBPS/nav.xhtml']);
  zip.file('OEBPS/style.css', files['OEBPS/style.css']);
  zip.file('OEBPS/content.html', files['OEBPS/content.html']);
  
  // Add images to EPUB
  imageMap.forEach((imageData) => {
    zip.file(`OEBPS/images/${imageData.name}`, imageData.base64, { base64: true });
  });
  
  console.log(`Added ${imageMap.size} images to EPUB`);
  
  // Generate the EPUB file
  zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
    .then(function(blob) {
      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.epub`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Show success notification
      showNotification('✓ EPUB file downloaded successfully!');
    })
    .catch(function(error) {
      console.error('Error generating EPUB:', error);
      alert('Failed to generate EPUB file. Please try again.');
    });
}

/**
 * Show notification message
 */
function showNotification(message) {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    background: #4caf50;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    font-size: 14px;
    font-weight: 500;
    z-index: 3000;
    animation: slideInUp 0.3s;
  `;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOutDown 0.3s';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Open email EPUB modal
 */
function openEmailEpubModal() {
  const modal = document.getElementById('emailEpubModal');
  const emailInput = document.getElementById('recipientEmailInput');
  modal.classList.add('show');
  emailInput.value = '';
  emailInput.focus();
}

/**
 * Close email EPUB modal
 */
function closeEmailEpubModal() {
  const modal = document.getElementById('emailEpubModal');
  modal.classList.remove('show');
}

/**
 * Email article as EPUB file
 */
function emailArticleEPUB() {
  const emailInput = document.getElementById('recipientEmailInput');
  const recipientEmail = emailInput.value.trim();
  
  // Validate email
  if (!recipientEmail) {
    alert('Please enter a recipient email address');
    emailInput.focus();
    return;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    alert('Please enter a valid email address');
    emailInput.focus();
    return;
  }
  
  // Close modal
  closeEmailEpubModal();
  
  // Get article data
  const title = document.getElementById('articleTitle').textContent;
  const filename = title
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .substring(0, 50)
    .toLowerCase();
  
  // Show instructions
  showEmailInstructions(recipientEmail, filename, title);
  
  // Generate and download EPUB
  downloadArticleEPUB();
  
  // Open email client after a short delay (to allow download to start)
  setTimeout(() => {
    const subject = encodeURIComponent(`Article: ${title}`);
    const body = encodeURIComponent(
      `Hi,\n\nI'm sharing this article with you: "${title}"\n\n` +
      `I've attached it as an EPUB file that you can read on any ebook reader or device.\n\n` +
      `Best regards`
    );
    
    window.location.href = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
  }, 1000);
}

/**
 * Show email instructions overlay
 */
function showEmailInstructions(email, filename, title) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    z-index: 5000;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.3s;
  `;
  
  const card = document.createElement('div');
  card.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 32px;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    animation: slideUp 0.3s;
  `;
  
  card.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">📧</div>
      <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 1.5em;">Email Instructions</h2>
      <div style="text-align: left; line-height: 1.6; color: #333; margin-bottom: 24px;">
        <p style="margin-bottom: 12px;">✅ <strong>EPUB file is downloading...</strong></p>
        <p style="margin-bottom: 12px;">✉️ <strong>Your email client will open shortly</strong></p>
        <p style="margin-bottom: 12px;">📎 <strong>Please attach the downloaded file:</strong><br/>
        <code style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px; font-size: 0.9em;">${filename}.epub</code></p>
        <p style="margin-bottom: 0;">📨 <strong>To:</strong> ${email}</p>
      </div>
      <button id="gotItBtn" style="
        background: #4caf50;
        color: white;
        border: none;
        padding: 12px 32px;
        font-size: 16px;
        font-weight: 600;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.2s;
      ">Got it!</button>
    </div>
  `;
  
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  
  // Close on button click
  const gotItBtn = card.querySelector('#gotItBtn');
  gotItBtn.addEventListener('click', () => {
    overlay.style.animation = 'fadeOut 0.3s';
    setTimeout(() => overlay.remove(), 300);
  });
  
  // Close on outside click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.style.animation = 'fadeOut 0.3s';
      setTimeout(() => overlay.remove(), 300);
    }
  });
  
  // Auto-close after 8 seconds
  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.style.animation = 'fadeOut 0.3s';
      setTimeout(() => overlay.remove(), 300);
    }
  }, 8000);
}
