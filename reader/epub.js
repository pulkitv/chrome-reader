/**
 * reader/epub.js — EPUB generation and HTML download.
 *
 * Exports:
 *   openDownloadModal()    — show the download-format modal
 *   closeDownloadModal()   — hide the download modal
 *   downloadArticleHTML()  — build a standalone HTML file and trigger download
 *   downloadArticleEPUB()  — build an EPUB 3 file (requires JSZip) and trigger download
 */

/* global chrome, JSZip */

import { showNotification } from './article.js';

// ── Download modal ────────────────────────────────────────────────────────────

export function openDownloadModal() {
  const modal         = document.getElementById('downloadModal');
  const filenameInput = document.getElementById('filenameInput');
  const title         = document.getElementById('articleTitle').textContent;

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

export function closeDownloadModal() {
  document.getElementById('downloadModal').classList.remove('show');
}

// ── HTML download ─────────────────────────────────────────────────────────────

/**
 * Build a self-contained HTML document from the current article and prompt
 * the browser to download it.
 */
export function downloadArticleHTML() {
  const filenameInput = document.getElementById('filenameInput');
  let filename = filenameInput.value.trim();

  if (!filename) {
    alert('Please enter a filename');
    filenameInput.focus();
    return;
  }
  filename = filename.replace(/[^a-z0-9_-]/gi, '_');

  const title       = document.getElementById('articleTitle').textContent;
  const byline      = document.getElementById('articleByline').textContent;
  const siteName    = document.getElementById('articleSite').textContent;
  const bodyHtml    = document.getElementById('articleBody').innerHTML;
  const sourceLinkEl = document.getElementById('sourceLink');
  const sourceLink  = sourceLinkEl ? sourceLinkEl.href : window.location.href;

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:18px; line-height:1.6; color:#1a1a1a; background:#fff; padding:40px 20px; }
    .container { max-width:720px; margin:0 auto; }
    .article-header { margin-bottom:40px; padding-bottom:30px; border-bottom:1px solid #e0e0e0; }
    h1 { font-size:2.5em; font-weight:700; line-height:1.2; margin-bottom:16px; }
    .byline,.site-name { color:#666; font-size:.9em; margin-bottom:8px; }
    .source-link { color:#0066cc; text-decoration:none; font-size:.9em; }
    .source-link:hover { text-decoration:underline; }
    .article-body { font-size:1em; line-height:1.6; }
    .article-body > * { margin-bottom:1.5em; }
    .article-body h2 { font-size:1.75em; font-weight:600; margin-top:1.5em; }
    .article-body h3 { font-size:1.5em;  font-weight:600; margin-top:1.5em; }
    .article-body h4 { font-size:1.25em; font-weight:600; margin-top:1.5em; }
    .article-body p  { margin-bottom:1.5em; }
    .article-body a  { color:#0066cc; text-decoration:underline; }
    .article-body img { max-width:100%; height:auto; border-radius:8px; margin:2em 0; display:block; }
    .article-body figure { margin:2em 0; }
    .article-body figcaption { font-size:.85em; color:#666; text-align:center; margin-top:.5em; font-style:italic; }
    .article-body blockquote { border-left:4px solid #e0e0e0; padding-left:1.5em; margin:2em 0; color:#666; font-style:italic; }
    .article-body code { background:#f5f5f5; padding:2px 6px; border-radius:3px; font-family:monospace; font-size:.9em; }
    .article-body pre  { background:#f5f5f5; padding:1em; border-radius:6px; overflow-x:auto; margin:2em 0; }
    .article-body pre code { background:none; padding:0; }
    .article-body ul,.article-body ol { padding-left:2em; margin-bottom:1.5em; }
    .article-body li { margin-bottom:.5em; }
    .article-body table { width:100%; border-collapse:collapse; margin:2em 0; }
    .article-body th,.article-body td { border:1px solid #e0e0e0; padding:.75em; text-align:left; }
    .article-body th { background:#f8f9fa; font-weight:600; }
    .article-body hr { border:none; border-top:1px solid #e0e0e0; margin:3em 0; }
    .footer { margin-top:60px; padding-top:30px; border-top:1px solid #e0e0e0; color:#666; font-size:.85em; text-align:center; }
    @media print { body { padding:20px; } }
  </style>
</head>
<body>
  <div class="container">
    <header class="article-header">
      <h1>${title}</h1>
      ${byline   ? `<div class="byline">By ${byline}</div>`    : ''}
      ${siteName ? `<div class="site-name">${siteName}</div>`  : ''}
      <a href="${sourceLink}" class="source-link" target="_blank">View Original Article</a>
    </header>
    <main class="article-body">${bodyHtml}</main>
    <footer class="footer">
      <p>Downloaded from ReadEasy Extension</p>
      <p>Original source: <a href="${sourceLink}" target="_blank">${sourceLink}</a></p>
    </footer>
  </div>
</body>
</html>`;

  _triggerDownload(new Blob([htmlContent], { type: 'text/html;charset=utf-8' }), `${filename}.html`);
  closeDownloadModal();
  showNotification('Article downloaded ✓', 'success');
}

// ── EPUB download ─────────────────────────────────────────────────────────────

/**
 * Build an EPUB 3 archive from the current article and trigger a download.
 * Images are embedded as PNG data via canvas so the EPUB is self-contained.
 * Requires JSZip to be loaded in the page (via <script> in reader.html).
 */
export async function downloadArticleEPUB() {
  const title        = document.getElementById('articleTitle').textContent;
  const byline       = document.getElementById('articleByline').textContent || 'Unknown Author';
  const siteName     = document.getElementById('articleSite').textContent   || 'Unknown Source';
  const sourceLinkEl = document.getElementById('sourceLink');
  const sourceLink   = sourceLinkEl ? sourceLinkEl.href : window.location.href;
  let   bodyHtml     = document.getElementById('articleBody').innerHTML;

  // Wait for all images to finish loading before extracting via canvas
  const images = document.getElementById('articleBody').querySelectorAll('img');
  await Promise.all(Array.from(images).map(img => {
    if (!img.src || img.src.startsWith('data:')) return Promise.resolve();
    return new Promise(resolve => {
      if (img.complete && img.naturalWidth > 0) { resolve(); return; }
      const t = setTimeout(resolve, 20000);
      img.onload  = () => { clearTimeout(t); resolve(); };
      img.onerror = () => { clearTimeout(t); resolve(); };
    });
  }));

  // Convert each loaded image to a base64 PNG via canvas
  const imageMap = new Map();
  let   imgIdx   = 0;
  for (const img of images) {
    if (!img.src || img.src.startsWith('data:')) continue;
    if (!img.naturalWidth || !img.naturalHeight) continue;
    try {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const base64 = canvas.toDataURL('image/png').split(',')[1];
      if (!base64 || base64.length < 100) continue;
      const name = `image_${imgIdx}.png`;
      imageMap.set(img.src, { name, base64, mimeType: 'image/png' });
      imgIdx++;
    } catch (_) {}
  }

  // Replace remote URLs in the HTML with relative EPUB image paths
  imageMap.forEach((data, src) => {
    const encodedSrc = src.replace(/&/g, '&amp;');
    const re1 = new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const re2 = new RegExp(encodedSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    bodyHtml = bodyHtml.replace(re1, `images/${data.name}`);
    bodyHtml = bodyHtml.replace(re2, `images/${data.name}`);
  });

  // Transform .note-block elements into Apple Books-compatible <blockquote>s.
  // Apple Books overrides background-color but respects border-left on blockquote.
  const epubEl = document.createElement('div');
  epubEl.innerHTML = bodyHtml;

  epubEl.querySelectorAll('hr.note-sep').forEach(hr => {
    hr.setAttribute('style', 'border:none;border-top:2px solid #0066cc;margin:20px 0;');
  });

  epubEl.querySelectorAll('.note-block').forEach(el => {
    const bq = document.createElement('blockquote');
    bq.setAttribute('style', [
      'border-left:5px solid #0066cc',
      'background:linear-gradient(to right,#fffde7,#fffde7)',
      'background-color:#fffde7',
      'margin:4px 0',
      'padding:10px 16px',
      'font-size:0.95em'
    ].join(';'));
    while (el.firstChild) bq.appendChild(el.firstChild);

    const hasBefore = el.previousElementSibling?.classList.contains('note-sep');
    const hasAfter  = el.nextElementSibling?.classList.contains('note-sep');
    if (hasBefore && hasAfter) {
      el.replaceWith(bq);
    } else {
      const top = document.createElement('p');
      top.setAttribute('style', 'border:none;border-top:2px solid #0066cc;margin:20px 0 4px;display:block;');
      const bot = document.createElement('p');
      bot.setAttribute('style', 'border:none;border-bottom:2px solid #0066cc;margin:4px 0 20px;display:block;');
      el.replaceWith(top, bq, bot);
    }
  });
  epubEl.querySelectorAll('hr.note-sep').forEach(hr => hr.removeAttribute('class'));

  const bodyXHTML = _htmlToXHTML(epubEl.innerHTML);
  const filename  = title.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').substring(0, 50).toLowerCase();
  const uuid      = 'urn:uuid:' + _generateUUID();
  const timestamp = new Date().toISOString();

  _createEPUBZip({
    mimetype:               'application/epub+zip',
    'META-INF/container.xml': _containerXML(),
    'OEBPS/content.opf':    _contentOPF(uuid, timestamp, title, byline, sourceLink, imageMap),
    'OEBPS/nav.xhtml':      _navXHTML(title),
    'OEBPS/style.css':      _epubCSS(),
    'OEBPS/content.html':   _contentHTML(title, byline, siteName, sourceLink, bodyXHTML)
  }, filename, imageMap);
}

// ── Internal EPUB helpers ─────────────────────────────────────────────────────

/** Convert HTML to XHTML-compliant format required by EPUB 3. */
function _htmlToXHTML(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const voidTags = ['img','br','hr','input','meta','link','area','base','col','embed','param','source','track','wbr'];
  let xhtml = temp.innerHTML;
  voidTags.forEach(tag => {
    const re = new RegExp(`<${tag}([^>]*?)(?<!/)>`, 'gi');
    xhtml = xhtml.replace(re, `<${tag}$1 />`);
  });
  // Escape bare & that are not already HTML entities
  xhtml = xhtml.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
  return xhtml;
}

function _generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function _escapeXML(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function _triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Use JSZip to assemble and download the EPUB archive. */
function _createEPUBZip(files, filename, imageMap) {
  if (typeof JSZip === 'undefined') {
    alert('EPUB generation requires JSZip. Downloading as HTML instead.');
    openDownloadModal();
    return;
  }

  const zip = new JSZip();
  zip.file('mimetype', files['mimetype'], { compression: 'STORE' });
  zip.file('META-INF/container.xml', files['META-INF/container.xml']);
  zip.file('OEBPS/content.opf',      files['OEBPS/content.opf']);
  zip.file('OEBPS/nav.xhtml',        files['OEBPS/nav.xhtml']);
  zip.file('OEBPS/style.css',        files['OEBPS/style.css']);
  zip.file('OEBPS/content.html',     files['OEBPS/content.html']);
  imageMap.forEach(data => zip.file(`OEBPS/images/${data.name}`, data.base64, { base64: true }));

  zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
    .then(blob => { _triggerDownload(blob, `${filename}.epub`); showNotification('EPUB downloaded ✓', 'success'); })
    .catch(() => alert('Failed to generate EPUB file. Please try again.'));
}

// ── EPUB XML/HTML fragments ───────────────────────────────────────────────────

function _containerXML() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function _contentOPF(uuid, timestamp, title, byline, sourceLink, imageMap) {
  const imageItems = Array.from(imageMap.values())
    .map((img, i) => `    <item id="img${i}" href="images/${img.name}" media-type="${img.mimeType}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${uuid}</dc:identifier>
    <dc:title>${_escapeXML(title)}</dc:title>
    <dc:creator>${_escapeXML(byline)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:publisher>ReadEasy</dc:publisher>
    <dc:date>${timestamp}</dc:date>
    <dc:source>${_escapeXML(sourceLink)}</dc:source>
    <meta property="dcterms:modified">${timestamp}</meta>
  </metadata>
  <manifest>
    <item id="content" href="content.html" media-type="application/xhtml+xml"/>
    <item id="style"   href="style.css"    media-type="text/css"/>
    <item id="nav"     href="nav.xhtml"    media-type="application/xhtml+xml" properties="nav"/>
${imageItems}
  </manifest>
  <spine>
    <itemref idref="content"/>
  </spine>
</package>`;
}

function _navXHTML(title) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Navigation</title></head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol><li><a href="content.html">${_escapeXML(title)}</a></li></ol>
  </nav>
</body>
</html>`;
}

function _contentHTML(title, byline, siteName, sourceLink, bodyXHTML) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${_escapeXML(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <div class="article-meta">
    <h1>${_escapeXML(title)}</h1>
    ${byline   ? `<p class="byline">By ${_escapeXML(byline)}</p>`  : ''}
    ${siteName ? `<p class="source">${_escapeXML(siteName)}</p>`   : ''}
    <p class="source"><a href="${_escapeXML(sourceLink)}">View Original Article</a></p>
  </div>
  <div class="article-body">${bodyXHTML}</div>
  <hr/>
  <p style="font-size:0.9em;color:#666;">Downloaded from ReadEasy Extension</p>
</body>
</html>`;
}

function _epubCSS() {
  return `body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:1.1em;line-height:1.6;color:#1a1a1a;margin:1em;padding:0;}
h1,h2,h3,h4,h5,h6{font-weight:600;line-height:1.3;margin-top:1.5em;margin-bottom:.75em;}
h1{font-size:2em;}h2{font-size:1.5em;}h3{font-size:1.25em;}
p{margin-bottom:1em;}
a{color:#0066cc;text-decoration:underline;}
img{max-width:100%;height:auto;margin:1em 0;}
blockquote{border-left:4px solid #ccc;padding-left:1em;margin:1em 0;font-style:italic;}
code{background:#f5f5f5;padding:.2em .4em;border-radius:3px;font-family:monospace;}
pre{background:#f5f5f5;padding:1em;overflow-x:auto;border-radius:6px;}
ul,ol{padding-left:2em;margin-bottom:1em;}
table{width:100%;border-collapse:collapse;margin:1em 0;}
th,td{border:1px solid #ddd;padding:.5em;text-align:left;}
th{background:#f5f5f5;font-weight:600;}
.article-meta{border-bottom:1px solid #e0e0e0;padding-bottom:1em;margin-bottom:2em;}
.byline,.source{color:#666;font-size:.9em;margin-top:.5em;}
.note-block{background-color:rgba(255,200,0,.12);border-left:4px solid #0066cc;border-radius:4px;padding:12px 16px;margin:20px 0;font-size:.95em;}`;
}

