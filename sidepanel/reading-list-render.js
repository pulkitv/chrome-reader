/** =========================================================
 *  MODULE: Reading List — Render  |  sidepanel/reading-list-render.js
 *  Renders the article list, manages article card DOM,
 *  inline title editing, remove, and storage indicator.
 *
 *  Depends on: state.js, utils.js
 *  Exports: initPanel, renderArticleList, createArticleCard,
 *           updateStorageInfo
 * ========================================================= */

/* global getAllArticles, chrome */

import { state } from './state.js';
import { showToast, escapeHtml } from './utils.js';

// ── Panel initialisation ───────────────────────────────────────────────────

/**
 * Initialize panel - load data and render
 */
export async function initPanel() {
  // Debounce: if called multiple times in quick succession, only run once
  if (state._initPanelTimer) clearTimeout(state._initPanelTimer);
  await new Promise(resolve => { state._initPanelTimer = setTimeout(resolve, 30); });
  state._initPanelTimer = null;

  try {
    // Read metadata from chrome.storage.local (source of truth for list UI)
    const { readingListMeta: storedMeta } = await chrome.storage.local.get('readingListMeta');
    state.readingListMeta = storedMeta || [];

    // Render list
    await renderArticleList();

    // Update storage size indicator (reads from IndexedDB — separate try so it
    // never blocks the list render if IDB is busy)
    updateStorageInfo().catch(err => console.warn('[SidePanel] updateStorageInfo failed:', err));
  } catch (error) {
    console.error('Failed to initialize panel:', error);
    showToast('Failed to load reading list', 'error');
  }
}

// ── Article list rendering ─────────────────────────────────────────────────

/**
 * Render article list
 */
export async function renderArticleList() {
  const listContainer = document.getElementById('articleList');
  const mergeBtn      = document.getElementById('mergeEpubBtn');
  const mergeSendBtn  = document.getElementById('mergeSendX4Btn');

  // Clear existing content
  listContainer.innerHTML = '';

  if (state.readingListMeta.length === 0) {
    // Show empty state
    listContainer.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 8H36V40H12V8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M18 16H30M18 24H30M18 32H24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p>No articles saved yet</p>
        <small>Click "Add to List" from any reader view to save articles</small>
      </div>
    `;
    mergeBtn.disabled     = true;
    mergeSendBtn.disabled = true;
    return;
  }

  // Render articles (oldest first - already sorted)
  state.readingListMeta.forEach((article) => {
    const card = createArticleCard(article);
    listContainer.appendChild(card);
  });

  mergeBtn.disabled     = false;
  mergeSendBtn.disabled = false;
}

// ── Article card DOM ───────────────────────────────────────────────────────

/**
 * Create article card element
 */
export function createArticleCard(article) {
  const card = document.createElement('div');
  card.className = 'article-card saved-article';
  card.dataset.id            = article.id;
  card.dataset.originalTitle = article.title || 'Untitled';

  const date          = new Date(article.addedDate);
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric'
  });

  card.innerHTML = `
    <button class="edit-icon-btn edit-btn" data-id="${article.id}" title="Edit title" aria-label="Edit title">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M3 21h4l11-11-4-4L3 17v4z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14 6l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <div class="article-title">${escapeHtml(article.title)}</div>
    <div class="title-edit-row">
      <input class="title-edit-input" type="text" maxlength="300" aria-label="Edit article title" />
      <button class="btn-save save-title-btn">Save</button>
      <button class="btn-cancel cancel-edit-btn">Cancel</button>
    </div>
    <div class="article-meta">${escapeHtml(article.siteName)} • ${formattedDate}</div>
    <div class="article-actions">
      <button class="btn-danger remove-btn" data-id="${article.id}">Remove</button>
    </div>
  `;

  const titleInput   = card.querySelector('.title-edit-input');
  titleInput.value   = article.title || 'Untitled';

  // Add edit button handler
  card.querySelector('.edit-icon-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    startInlineTitleEdit(card);
  });

  // Save title handler
  card.querySelector('.save-title-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    await saveInlineTitleEdit(card, article.id);
  });

  // Cancel edit handler
  card.querySelector('.cancel-edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    cancelInlineTitleEdit(card);
  });

  // Keyboard handlers for inline input
  titleInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await saveInlineTitleEdit(card, article.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelInlineTitleEdit(card);
    }
  });

  // Add remove button handler
  card.querySelector('.remove-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    await handleRemoveArticle(article.id);
  });

  return card;
}

// ── Inline title editing ───────────────────────────────────────────────────

/**
 * Enter inline title edit mode for a card
 */
function startInlineTitleEdit(card) {
  // Close any other open editors first
  document.querySelectorAll('.saved-article.is-editing').forEach(openCard => {
    if (openCard !== card) cancelInlineTitleEdit(openCard);
  });

  card.classList.add('is-editing');
  const input = card.querySelector('.title-edit-input');
  input.value = card.dataset.originalTitle || input.value || '';
  input.focus();
  input.select();
}

/**
 * Cancel inline title edit mode for a card
 */
function cancelInlineTitleEdit(card) {
  const input = card.querySelector('.title-edit-input');
  if (input) input.value = card.dataset.originalTitle || input.value || '';
  card.classList.remove('is-editing');
}

/**
 * Save inline title edit for a card
 */
async function saveInlineTitleEdit(card, id) {
  const input         = card.querySelector('.title-edit-input');
  const originalTitle = (card.dataset.originalTitle || '').trim();
  const trimmed       = (input?.value || '').trim();

  if (!trimmed) {
    showToast('Title cannot be empty', 'error', 2000);
    input?.focus();
    return;
  }

  if (trimmed === originalTitle) {
    cancelInlineTitleEdit(card);
    return;
  }

  await handleEditTitle(id, trimmed);
}

// ── Article actions ────────────────────────────────────────────────────────

/**
 * Handle remove article
 */
async function handleRemoveArticle(id) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deleteFromList',
      id:     id
    });

    if (response.success) {
      showToast('Article removed', 'success', 2000);
      await initPanel();
    } else {
      throw new Error(response.error || 'Failed to remove article');
    }
  } catch (error) {
    console.error('Error removing article:', error);
    showToast('Failed to remove article', 'error');
  }
}

/**
 * Handle edit article title
 */
async function handleEditTitle(id, newTitle) {
  const trimmed = (newTitle || '').trim();
  if (!trimmed) {
    showToast('Title cannot be empty', 'error', 2000);
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'updateArticleTitle',
      id,
      title: trimmed
    });

    if (response && response.success) {
      showToast('Title updated ✓', 'success', 2000);
      await initPanel();
    } else {
      throw new Error((response && response.error) || 'Failed to update title');
    }
  } catch (error) {
    console.error('Error updating title:', error);
    showToast(error.message || 'Failed to update title', 'error');
  }
}

// ── Storage indicator ──────────────────────────────────────────────────────

/**
 * Update storage indicator
 */
export async function updateStorageInfo() {
  try {
    const articles = await getAllArticles();
    const count    = articles.length;

    // Calculate total size (sum of HTML content lengths)
    let totalSize = 0;
    articles.forEach(article => {
      if (article.htmlContent) {
        // UTF-16 encoding: 2 bytes per character
        totalSize += article.htmlContent.length * 2;
      }
    });

    // Convert to MB
    const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);

    document.getElementById('storageInfo').textContent = `${count}/10 articles • ${sizeMB}MB`;
  } catch (error) {
    console.error('Error calculating storage:', error);
  }
}
