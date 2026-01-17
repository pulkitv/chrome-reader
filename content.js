// Content script - Extracts article content using Readability

(function() {
  'use strict';

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

  /**
   * Extract article using Readability
   */
  function extractArticle() {
    // Clone the document to avoid modifying the original page
    const documentClone = document.cloneNode(true);
    
    // Convert all URLs to absolute before parsing
    makeUrlsAbsolute(documentClone, document.location.href);

    // Create a Readability instance and parse
    const reader = new Readability(documentClone, {
      debug: false,
      charThreshold: 500
    });

    const article = reader.parse();

    if (!article) {
      return null;
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
      publishedTime: article.publishedTime
    };
  }

  // Execute extraction and return result
  return extractArticle();
})();
