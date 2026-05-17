/** =========================================================
 *  MODULE: PDF Build  |  sidepanel/pdf-build.js
 *  Merges all reading list articles into a styled HTML page,
 *  opens it in a new tab, and auto-triggers the print dialog
 *  so the user can Save as PDF.
 *
 *  Depends on: state.js, utils.js
 *  Exports: handleMergePDF
 * ========================================================= */

/* global getAllArticles */

import { state } from './state.js';
import { showToast, escapeHtml } from './utils.js';

export async function handleMergePDF() {
  const btn = document.getElementById('mergePdfBtn');
  try {
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Preparing...';

    const articles = await getAllArticles();
    if (articles.length === 0) {
      throw new Error('No articles to merge');
    }

    const html = buildMergedPrintHTML(articles);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);

    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 90000);

    showToast('Print dialog opening — choose Save as PDF', 'success', 4000);
  } catch (error) {
    console.error('Error preparing PDF:', error);
    showToast('Could not prepare PDF: ' + error.message, 'error');
  } finally {
    btn.disabled = state.readingListMeta.length === 0;
    btn.querySelector('span').textContent = 'Merge & Create PDF';
  }
}

function buildMergedPrintHTML(articles) {
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  const count = articles.length;

  const tocItems = articles.map((a, i) =>
    `<li><a href="#article-${i + 1}">${escapeHtml(a.title || 'Untitled')}</a></li>`
  ).join('\n      ');

  const articleSections = articles.map((article, i) => {
    const title  = escapeHtml(article.title  || 'Untitled');
    const byline = article.byline ? `<p class="byline">${escapeHtml(article.byline)}</p>` : '';
    const site   = article.site   ? `<p class="site">${escapeHtml(article.site)}</p>`   : '';
    const isLast = i === articles.length - 1;
    return `
  <article id="article-${i + 1}"${isLast ? '' : ' class="page-break"'}>
    <h1 class="article-title">${title}</h1>
    ${byline}${site}
    <div class="article-body">${article.htmlContent || ''}</div>
  </article>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ReadEasy – Merged Articles</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 16px;
      line-height: 1.75;
      color: #1a1a1a;
      max-width: 740px;
      margin: 0 auto;
      padding: 48px 28px;
    }
    .cover {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      text-align: center;
      page-break-after: always;
    }
    .cover h1 { font-size: 2.4em; letter-spacing: -0.02em; margin-bottom: 14px; }
    .cover .meta { color: #555; font-size: 1em; line-height: 1.8; font-style: italic; }
    .toc { page-break-after: always; padding: 32px 0; }
    .toc h2 {
      font-size: 1.3em;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border-bottom: 2px solid #1a1a1a;
      padding-bottom: 8px;
      margin-bottom: 20px;
    }
    .toc ol { padding-left: 22px; }
    .toc li { margin-bottom: 10px; font-size: 0.95em; }
    .toc a { color: #1a1a1a; text-decoration: none; }
    article { padding: 32px 0; }
    article.page-break { page-break-after: always; }
    h1.article-title { font-size: 1.9em; font-weight: 700; line-height: 1.25; margin-bottom: 10px; }
    .byline, .site { font-size: 0.85em; color: #666; margin-bottom: 3px; }
    .article-body { margin-top: 24px; }
    .article-body p  { margin-bottom: 1em; }
    .article-body h1 { font-size: 1.5em;  font-weight: 700; margin: 1.4em 0 0.5em; }
    .article-body h2 { font-size: 1.3em;  font-weight: 700; margin: 1.3em 0 0.5em; }
    .article-body h3 { font-size: 1.1em;  font-weight: 700; margin: 1.2em 0 0.4em; }
    .article-body h4 { font-size: 1em;    font-weight: 700; margin: 1.1em 0 0.4em; }
    .article-body img { max-width: 100%; height: auto; display: block; margin: 1.2em 0; }
    .article-body blockquote {
      border-left: 4px solid #bbb;
      padding-left: 16px;
      color: #555;
      margin: 1em 0;
      font-style: italic;
    }
    .article-body ul, .article-body ol { padding-left: 26px; margin-bottom: 1em; }
    .article-body li { margin-bottom: 0.3em; }
    .article-body a { color: #0055cc; }
    .article-body hr { border: none; border-top: 1px solid #ccc; margin: 2em 0; }
    .article-body pre, .article-body code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 0.88em;
      background: #f5f5f5;
      padding: 2px 5px;
      border-radius: 3px;
    }
    .article-body pre { padding: 12px 16px; margin-bottom: 1em; }
    .article-body pre code { background: none; padding: 0; }
    .note-block {
      background: #fffde7;
      border-left: 5px solid #0066cc;
      border-radius: 3px;
      padding: 10px 16px;
      margin: 16px 0;
      font-size: 0.95em;
    }
    hr.note-sep { border: none; border-top: 2px solid #0066cc; margin: 20px 0; opacity: 0.5; }
    @media print {
      body { max-width: none; padding: 0; }
      .cover, .toc, article.page-break { page-break-after: always; }
      .toc a { color: #1a1a1a; }
      .article-body a { color: #0055cc; }
    }
  </style>
</head>
<body>
  <div class="cover">
    <h1>ReadEasy</h1>
    <p class="meta">
      Merged Articles &nbsp;·&nbsp; ${dateStr}<br>
      ${count} article${count !== 1 ? 's' : ''}
    </p>
  </div>
  <div class="toc">
    <h2>Contents</h2>
    <ol>
      ${tocItems}
    </ol>
  </div>
  ${articleSections}
  <script>window.addEventListener('load', function(){ window.print(); });<\/script>
</body>
</html>`;
}
