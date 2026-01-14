// Background service worker for Reader View extension

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  // Don't run on chrome:// or extension pages
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    console.log('Cannot run Chrome Reader on this page');
    return;
  }

  try {
    // Inject the content script to extract article content
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['libs/Readability.js', 'content.js']
    });

    // Get the extracted article from the content script
    const article = results[0].result;

    if (!article || !article.content) {
      console.error('Failed to extract article content');
      return;
    }

    // Store the article in session storage with the original URL
    await chrome.storage.session.set({
      currentArticle: {
        ...article,
        sourceUrl: tab.url,
        sourceFavicon: tab.favIconUrl
      }
    });

    // Open the reader view in a new tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('reader.html')
    });

  } catch (error) {
    console.error('Error extracting article:', error);
  }
});
