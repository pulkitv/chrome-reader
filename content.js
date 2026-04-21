// Content script - Extracts article content using Readability

(function() {
  'use strict';

  const READABILITY_CHAR_THRESHOLD = 250;
  const MIN_PARSED_TEXT_CHARS = 220;
  const FALLBACK_MIN_VISIBLE_TEXT_CHARS = 180;

  // Prioritized selectors for active modal/dialog overlays (Facebook, Instagram, Reddit, generic)
  const DIALOG_SELECTORS = [
    '[role="dialog"]',
    '[aria-modal="true"]',
    '[data-pagelet*="Dialog"]'
  ];

  // Only attempt dialog extraction on known social platforms where posts open in overlays
  const DIALOG_EXTRACTION_DOMAINS = [
    'facebook.com',
    'instagram.com',
    'reddit.com',
    'twitter.com',
    'x.com',
    'linkedin.com'
  ];

  /**
   * Convert relative URLs to absolute URLs
   */
  function makeUrlsAbsolute(documentClone, baseUrl) {
    const elementsWithSrc = documentClone.querySelectorAll('[src]');
    elementsWithSrc.forEach(el => {
      try {
        let src = el.getAttribute('src');
        // Fix Substack CDN URLs - remove w_XXXX,c_limit parameters
        if (src && src.includes('substackcdn.com')) {
          src = src.replace(/,w_\d+,c_limit,/, ',');
        }
        const absoluteUrl = new URL(src, baseUrl).href;
        el.setAttribute('src', absoluteUrl);
      } catch (e) {
        // Invalid URL, skip
      }
    });

    const elementsWithHref = documentClone.querySelectorAll('[href]');
    elementsWithHref.forEach(el => {
      try {
        const absoluteUrl = new URL(el.getAttribute('href'), baseUrl).href;
        el.setAttribute('href', absoluteUrl);
      } catch (e) {
        // Invalid URL, skip
      }
    });

    // Handle srcset attributes for responsive images - REMOVE THEM to avoid broken URLs
    const elementsWithSrcset = documentClone.querySelectorAll('[srcset]');
    elementsWithSrcset.forEach(el => {
      // Remove srcset entirely as it causes issues with Substack URLs
      el.removeAttribute('srcset');
    });

    // Handle lazy-loaded images (common data-src pattern)
    const lazyImages = documentClone.querySelectorAll('[data-src]');
    lazyImages.forEach(img => {
      const dataSrc = img.getAttribute('data-src');
      try {
        const absoluteUrl = new URL(dataSrc, baseUrl).href;
        img.setAttribute('src', absoluteUrl);
        img.removeAttribute('data-src');
      } catch (e) {
        // Invalid URL, skip
      }
    });
  }

  function normalizeText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function getVisibleTextLengthFromElement(element) {
    if (!element) return 0;
    return normalizeText(element.textContent).length;
  }

  function pruneFallbackNode(rootNode) {
    if (!rootNode) return null;
    const clone = rootNode.cloneNode(true);
    clone.querySelectorAll('script, style, noscript, svg, nav, footer, header, aside, form, button, input, select, textarea').forEach(el => {
      el.remove();
    });
    return clone;
  }

  function pickFallbackRoot(documentClone) {
    const candidates = Array.from(documentClone.querySelectorAll('article, main, [role="main"], section'));

    if (!candidates.length) {
      return documentClone.body;
    }

    let bestNode = null;
    let bestLength = 0;

    candidates.forEach(node => {
      const len = getVisibleTextLengthFromElement(node);
      if (len > bestLength) {
        bestLength = len;
        bestNode = node;
      }
    });

    return bestNode || documentClone.body;
  }

  function buildFallbackArticle(documentClone) {
    const rootNode = pickFallbackRoot(documentClone);
    const pruned = pruneFallbackNode(rootNode);
    if (!pruned) return null;

    const visibleText = normalizeText(pruned.textContent);
    const visibleTextChars = visibleText.length;

    if (visibleTextChars < FALLBACK_MIN_VISIBLE_TEXT_CHARS) {
      return null;
    }

    return {
      title: normalizeText(document.title) || 'Untitled',
      byline: '',
      content: pruned.innerHTML,
      textContent: visibleText,
      length: visibleTextChars,
      excerpt: visibleText.slice(0, 240),
      siteName: normalizeText(location.hostname),
      publishedTime: null,
      extractionMode: 'fallback',
      isFallback: true,
      visibleTextChars,
      isThinContent: visibleTextChars < 300
    };
  }

  /**
   * Find an active modal/dialog in the live DOM with sufficient text content.
   * Only fires on known social domains to avoid interfering with regular article pages.
   */
  function pickActiveDialog() {
    const hostname = location.hostname.replace(/^www\./, '');
    const isSocialDomain = DIALOG_EXTRACTION_DOMAINS.some(
      d => hostname === d || hostname.endsWith('.' + d)
    );
    if (!isSocialDomain) return null;

    for (const selector of DIALOG_SELECTORS) {
      try {
        const dialogs = Array.from(document.querySelectorAll(selector));
        for (const el of dialogs) {
          if (getVisibleTextLengthFromElement(el) >= FALLBACK_MIN_VISIBLE_TEXT_CHARS) {
            return el;
          }
        }
      } catch (e) {
        // invalid selector in this browser context, skip
      }
    }
    return null;
  }

  /**
   * Build an article object scoped to an active dialog element.
   */
  function buildDialogArticle(dialogEl) {
    const pruned = pruneFallbackNode(dialogEl);
    if (!pruned) return null;

    makeUrlsAbsolute(pruned, document.location.href);

    const visibleText = normalizeText(pruned.textContent);
    const visibleTextChars = visibleText.length;
    if (visibleTextChars < FALLBACK_MIN_VISIBLE_TEXT_CHARS) return null;

    return {
      title: normalizeText(document.title) || normalizeText(location.hostname) || 'Post',
      byline: '',
      content: pruned.innerHTML,
      textContent: visibleText,
      length: visibleTextChars,
      excerpt: visibleText.slice(0, 240),
      siteName: normalizeText(location.hostname),
      publishedTime: null,
      extractionMode: 'dialog',
      isFallback: true,
      visibleTextChars,
      isThinContent: visibleTextChars < 300
    };
  }

  /**
   * Extract article using Readability
   */
  function extractArticle() {
    // Priority 1: active modal/dialog (logged-in Facebook posts, Instagram overlays, Reddit)
    const activeDialog = pickActiveDialog();
    if (activeDialog) {
      const dialogArticle = buildDialogArticle(activeDialog);
      if (dialogArticle) return dialogArticle;
    }

    // Clone the document to avoid modifying the original page
    const documentClone = document.cloneNode(true);
    
    // Convert all URLs to absolute before parsing
    makeUrlsAbsolute(documentClone, document.location.href);

    // Create a Readability instance and parse
    const reader = new Readability(documentClone, {
      debug: false,
      charThreshold: READABILITY_CHAR_THRESHOLD
    });

    const article = reader.parse();
    const parsedTextChars = normalizeText(article && article.textContent).length;

    if (!article || !article.content || parsedTextChars < MIN_PARSED_TEXT_CHARS) {
      const fallbackArticle = buildFallbackArticle(documentClone);
      if (!fallbackArticle) {
        return null;
      }
      return fallbackArticle;
    }

    // Return the parsed article with metadata
    return {
      title: article.title,
      byline: article.byline,
      content: article.content,
      textContent: article.textContent,
      length: article.length,
      excerpt: article.excerpt,
      siteName: article.siteName,
      publishedTime: article.publishedTime,
      extractionMode: 'readability',
      isFallback: false,
      visibleTextChars: parsedTextChars,
      isThinContent: parsedTextChars < 300
    };
  }

  // Execute extraction and return result
  return extractArticle();
})();
