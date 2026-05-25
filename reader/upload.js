/**
 * reader/upload.js — Upload EPUB or HTML file and open it in a new Reader View tab.
 *
 * Exports:
 *   initUpload() — wires the upload button and hidden file input in the reader header
 */

/* global JSZip, chrome */

import { showNotification } from './article.js';

const NS_DC = 'http://purl.org/dc/elements/1.1/';

// ── Public init ───────────────────────────────────────────────────────────────

export function initUpload() {
  const btn   = document.getElementById('uploadFileBtn');
  const input = document.getElementById('uploadFileInput');

  btn.addEventListener('click', () => input.click());

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    input.value = ''; // reset so same file can be re-uploaded immediately
    if (!file) return;

    showNotification('Processing file…', 'info');

    let article;
    try {
      article = file.name.toLowerCase().endsWith('.epub')
        ? await parseEpub(file)
        : await parseHtmlFile(file);
    } catch (err) {
      console.error('[ReadEasy] Upload parse error:', err);
      showNotification('Could not read file. Is it a valid EPUB or HTML?', 'error');
      return;
    }

    try {
      await chrome.storage.session.set({ currentArticle: article });
      chrome.tabs.create({ url: chrome.runtime.getURL('reader.html') });
    } catch (err) {
      console.error('[ReadEasy] Upload open reader error:', err);
      showNotification('Failed to open reader view', 'error');
    }
  });
}

// ── HTML parser ───────────────────────────────────────────────────────────────

async function parseHtmlFile(file) {
  const text = await file.text();
  const doc  = new DOMParser().parseFromString(text, 'text/html');

  doc.body.querySelectorAll('script, style, noscript').forEach(el => el.remove());

  const title = doc.querySelector('title')?.textContent?.trim()
             || doc.querySelector('h1')?.textContent?.trim()
             || file.name.replace(/\.[^.]+$/, '');

  return {
    title,
    byline:   '',
    siteName: 'Local file',
    content:  doc.body.innerHTML,
    url:      `local-upload:///${encodeURIComponent(file.name)}?t=${Date.now()}`,
    excerpt:  doc.body.textContent.slice(0, 200).trim(),
  };
}

// ── EPUB parser ───────────────────────────────────────────────────────────────

async function parseEpub(file) {
  const buffer = await file.arrayBuffer();
  const zip    = await JSZip.loadAsync(buffer);

  // 1. container.xml → OPF path
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('Missing META-INF/container.xml');

  const containerDoc = new DOMParser().parseFromString(
    await containerFile.async('string'), 'text/xml'
  );
  const rootfileEl = containerDoc.getElementsByTagName('rootfile')[0];
  if (!rootfileEl) throw new Error('container.xml missing rootfile element');

  const opfPath = rootfileEl.getAttribute('full-path');
  const opfDir  = opfPath.includes('/')
    ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1)
    : '';

  // 2. Parse OPF (metadata + manifest + spine)
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`OPF file not found: ${opfPath}`);

  const opfDoc = new DOMParser().parseFromString(
    await opfFile.async('string'), 'text/xml'
  );

  const title  = (opfDoc.getElementsByTagNameNS(NS_DC, 'title')[0]
               || opfDoc.getElementsByTagName('title')[0])?.textContent?.trim()
               || file.name.replace(/\.epub$/i, '');

  const author = (opfDoc.getElementsByTagNameNS(NS_DC, 'creator')[0]
               || opfDoc.getElementsByTagName('creator')[0])?.textContent?.trim()
               || '';

  // Manifest: id → { href (relative to opfDir), mediaType }
  const manifest = {};
  for (const item of opfDoc.getElementsByTagName('item')) {
    const id = item.getAttribute('id');
    if (id) {
      manifest[id] = {
        href:      item.getAttribute('href') || '',
        mediaType: item.getAttribute('media-type') || '',
      };
    }
  }

  // Spine: ordered list of manifest ids to read
  const spineIds = [...opfDoc.getElementsByTagName('itemref')]
    .map(r => r.getAttribute('idref'))
    .filter(Boolean);

  // 3. Pre-cache all images as base64 data URIs, keyed by their full zip path
  const imageCache = {}; // zipPath → data: URI
  await Promise.all(
    Object.values(manifest)
      .filter(({ mediaType }) => mediaType.startsWith('image/'))
      .map(async ({ href, mediaType }) => {
        const zipPath = opfDir + href;
        const f = zip.file(zipPath) || zip.file(decodeURIComponent(zipPath));
        if (!f) return;
        const b64 = await f.async('base64');
        imageCache[zipPath] = `data:${mediaType};base64,${b64}`;
      })
  );

  // 4. Parse each spine chapter, resolve img src → data URI, collect HTML
  const parts = await Promise.all(
    spineIds.map(async (id) => {
      const item = manifest[id];
      if (!item?.href) return '';

      const chapterZipPath = opfDir + item.href;
      const chapterDir     = chapterZipPath.slice(0, chapterZipPath.lastIndexOf('/') + 1);
      const chapterFile    = zip.file(chapterZipPath);
      if (!chapterFile) return '';

      const xhtml = await chapterFile.async('string');
      const doc   = new DOMParser().parseFromString(xhtml, 'text/html');
      doc.body.querySelectorAll('script, style').forEach(el => el.remove());

      // Resolve image src attributes to embedded data URIs
      doc.body.querySelectorAll('img[src]').forEach(img => {
        const src = img.getAttribute('src');
        if (!src || src.startsWith('data:')) return;
        const resolved = resolveZipPath(chapterDir, src);
        if (imageCache[resolved]) img.setAttribute('src', imageCache[resolved]);
      });

      return doc.body.innerHTML;
    })
  );

  const content = parts
    .filter(Boolean)
    .join('\n<hr style="margin:48px 0;border:none;border-top:1px solid var(--border-color,#e0e0e0);">\n');

  return {
    title,
    byline:   author,
    siteName: 'EPUB upload',
    content,
    url:      `local-upload:///${encodeURIComponent(file.name)}?t=${Date.now()}`,
    excerpt:  '',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve a relative path against a base directory within the ZIP.
 * e.g. resolveZipPath('OEBPS/Text/', '../Images/cover.jpg') → 'OEBPS/Images/cover.jpg'
 */
function resolveZipPath(baseDir, relativePath) {
  if (relativePath.startsWith('/')) return relativePath.slice(1);
  const segments = (baseDir + relativePath).split('/');
  const resolved = [];
  for (const seg of segments) {
    if (seg === '..') resolved.pop();
    else if (seg !== '.') resolved.push(seg);
  }
  return resolved.join('/');
}
