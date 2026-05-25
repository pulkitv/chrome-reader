/*
  ReadEasy Web App PostMessage Listener
  - Receives article HTML from the ReadEasy Chrome extension
  - Validates origin against allowed extension IDs
  - Renders content into a container

  Usage:
    import { initReadEasyListener } from './readeasy-postmessage-listener.js';
    initReadEasyListener({
      containerId: 'articleRoot',
      allowedExtensionIds: ['YOUR_EXTENSION_ID']
    });
*/

export function initReadEasyListener({ containerId = 'articleRoot', allowedExtensionIds = [] } = {}) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`[ReadEasy] Container not found: #${containerId}`);
    return;
  }

  const allowedOrigins = allowedExtensionIds.map((id) => `chrome-extension://${id}`);

  function isAllowedOrigin(origin) {
    if (allowedOrigins.length === 0) {
      return origin.startsWith('chrome-extension://');
    }
    return allowedOrigins.includes(origin);
  }

  function sanitizeHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    doc.querySelectorAll('script').forEach((el) => el.remove());

    doc.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        if (/^on/i.test(attr.name)) {
          el.removeAttribute(attr.name);
        }
      });
    });

    return doc.body.innerHTML;
  }

  function renderArticle(payload) {
    if (!payload || payload.type !== 'readeasy-article') return;

    const { title, byline, siteName, sourceUrl, html, cssText } = payload;

    document.title = title || 'ReadEasy Article';

    if (sourceUrl) {
      let base = document.querySelector('base');
      if (!base) {
        base = document.createElement('base');
        document.head.insertBefore(base, document.head.firstChild);
      }
      base.href = sourceUrl;
    }

    const safeHtml = sanitizeHtml(html || '');

    if (cssText) {
      let styleTag = document.getElementById('readeasy-style');
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'readeasy-style';
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = cssText;
    }

    container.innerHTML = `
      <article class="readeasy-article">
        ${title ? `<h1 class="readeasy-title">${title}</h1>` : ''}
        ${byline ? `<div class="readeasy-byline">${byline}</div>` : ''}
        ${siteName ? `<div class="readeasy-site">${siteName}</div>` : ''}
        <div class="readeasy-body">${safeHtml}</div>
      </article>
    `;
  }

  window.addEventListener('message', (event) => {
    if (!isAllowedOrigin(event.origin)) return;
    renderArticle(event.data);
  });

  if (window.opener && typeof window.opener.postMessage === 'function') {
    window.opener.postMessage('readeasy-ready', '*');
  }
}
