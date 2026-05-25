/** =========================================================
 *  MODULE: EPUB Build  |  sidepanel/epub-build.js
 *  Builds a merged EPUB blob from an array of article objects.
 *  Pure data-transformation — no DOM side-effects except the
 *  textarea trick inside decodeNamedEntities.
 *
 *  Depends on: utils.js
 *  Exports: buildMergedEPUBBlob, generateMergedEPUB
 * ========================================================= */

/* global JSZip */

import { escapeHtml, decodeNamedEntities, downloadBlob } from './utils.js';

// ── EPUB blob builder ──────────────────────────────────────────────────────

/**
 * Build merged EPUB blob from all saved articles
 * @param {Array} articles - Array of article objects from IndexedDB
 * @param {Object} [options]
 * @param {boolean} [options.includeImages=true]
 * @returns {Promise<Blob>}
 */
export async function buildMergedEPUBBlob(articles, options = {}) {
  const includeImages   = options.includeImages !== false;
  const zip             = new JSZip();
  const chapters        = [];
  // contentKey → { name, mimeType, base64 }
  const masterImageMap  = new Map();
  let imageCounter      = 0;
  let chapterNum        = 1;

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
        const mimeType    = match[2]; // image/png
        const base64Raw   = match[3]; // base64 chars (may have whitespace from FileReader)

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
        const len         = cleanBase64.length;
        const mid         = Math.floor(len / 2);
        const contentKey  = `${mimeType}|${len}|${cleanBase64.slice(0, 64)}|${cleanBase64.slice(mid, mid + 64)}|${cleanBase64.slice(-64)}`;

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
      num:      chapterNum,
      id:       `chapter_${chapterNum}`,
      filename: `chapter_${chapterNum}.xhtml`,
      title:    article.title    || 'Untitled',
      siteName: article.siteName || '',
      date:     new Date(article.addedDate || Date.now()),
      content:  convertToXHTML(htmlContent, article.title || 'Untitled')
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
export async function generateMergedEPUB(articles) {
  const blob     = await buildMergedEPUBBlob(articles);
  const fileName = `ReadEasy_Merged_${new Date().toISOString().split('T')[0]}.epub`;
  downloadBlob(blob, fileName);
}

// ── XHTML conversion ───────────────────────────────────────────────────────

/**
 * Convert HTML to XHTML
 */
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

// ── EPUB manifest generators ───────────────────────────────────────────────

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
    const label   = `${ch.title} (${ch.siteName}, ${dateStr})`;

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
    const label   = `${ch.title} (${ch.siteName}, ${dateStr})`;

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
