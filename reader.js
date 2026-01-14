// Reader View UI JavaScript

const FONT_SIZES = ['font-small', 'font-normal', 'font-large', 'font-xlarge', 'font-xxlarge'];
const THEMES = ['light-theme', 'sepia-theme', 'dark-theme'];

let currentFontSizeIndex = 1; // Start with font-normal
let isWideWidth = false;

// Initialize reader on page load
document.addEventListener('DOMContentLoaded', async () => {
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
