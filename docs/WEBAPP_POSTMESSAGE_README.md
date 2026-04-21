# ReadEasy → Web App PostMessage Integration

This document explains how the ReadEasy Chrome extension sends article HTML to your web app and how your web app should receive and render it.

## 1) What the extension does

When the user clicks the **“Open in web app”** button in the ReadEasy toolbar:

1. The extension opens your web app URL in a new tab (`TTS_WEBAPP_URL` in reader.js).
2. It sends a `postMessage` containing article metadata and HTML to the web app.
3. It also listens for an optional handshake message (`readeasy-ready`) to send the payload immediately.

## 2) Payload format

The extension sends the following object:

```js
{
  type: 'readeasy-article',
  title: string,
  byline: string,
  siteName: string,
  sourceUrl: string,
  html: string,
  cssText: string
}
```

## 3) Web app responsibilities

Your web app should:

- Listen for `message` events
- Validate the sender origin (`chrome-extension://<extension-id>`)
- Parse and render the HTML (sanitize before rendering)
- Optionally send `readeasy-ready` to trigger immediate delivery

## 4) Example listener (vanilla JS)

```js
window.addEventListener('message', (event) => {
  if (!event.origin.startsWith('chrome-extension://')) return;

  const data = event.data;
  if (!data || data.type !== 'readeasy-article') return;

  const { title, byline, siteName, sourceUrl, html, cssText } = data;

  // Optional: set base URL to resolve relative links/images
  const base = document.querySelector('base') || document.createElement('base');
  base.href = sourceUrl || window.location.href;
  if (!document.querySelector('base')) {
    document.head.insertBefore(base, document.head.firstChild);
  }

  // Optional: apply ReadEasy CSS to preserve styling
  if (cssText) {
    let styleTag = document.getElementById('readeasy-style');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'readeasy-style';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = cssText;
  }

  // TODO: sanitize HTML before injecting into DOM
  document.getElementById('articleRoot').innerHTML = html;
});

// Optional handshake
if (window.opener) {
  window.opener.postMessage('readeasy-ready', '*');
}
```

## 5) Using the provided helper file

A helper module is available: [readeasy-postmessage-listener.js](readeasy-postmessage-listener.js)

Usage:
```js
import { initReadEasyListener } from './readeasy-postmessage-listener.js';

initReadEasyListener({
  containerId: 'articleRoot',
  allowedExtensionIds: ['YOUR_EXTENSION_ID']
});
```

## 6) Important notes

- **Security**: always validate `event.origin` and sanitize HTML.
- **Large articles**: postMessage supports large payloads; no URL length limits.
- **Extension ID**: find it in `chrome://extensions` after installing the extension.
- **Cross-origin**: `postMessage` works across origins as long as the target window is open.

## 7) Extension setting to update

Set your web app URL in [reader.js](reader.js):

```js
const TTS_WEBAPP_URL = 'https://your-webapp.example.com';
```

---

If you want me to tailor this to your specific web app (React, Next.js, etc.), tell me the stack and I’ll adapt it.
