/** =========================================================
 *  MODULE: Tab Detection  |  sidepanel/tab-detection.js
 *  Active tab monitoring — detects reader.html vs regular
 *  website vs internal page and updates the "Current Article"
 *  section accordingly.
 *
 *  Depends on: state.js
 *  Exports: checkCurrentTab, updateSaveSelectionVisibility,
 *           showCurrentArticleSection, hideCurrentArticleSection
 * ========================================================= */

/* global chrome */

import { state } from './state.js';

// ── Tab detection ──────────────────────────────────────────────────────────

/**
 * Check current tab and update the "Current Article" section accordingly.
 *
 * Cases:
 *  1. chrome:// or non-reader extension page  → hide (no article possible)
 *  2. reader.html tab                          → message reader tab for article info
 *  3. Normal http/https website                → show tab title, enable Add to List
 */
export async function checkCurrentTab() {
  console.log('[SidePanel] checkCurrentTab called');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[SidePanel] Active tab:', tab && { id: tab.id, url: tab.url });

    if (!tab || !tab.url) {
      hideCurrentArticleSection('Nothing open');
      await updateSaveSelectionVisibility();
      return;
    }

    // Case 1 — Chrome internal or other extension pages (not our reader)
    if (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://') ||
      (tab.url.startsWith('chrome-extension://') && !tab.url.includes('reader.html'))
    ) {
      state.currentReaderTabId   = null;
      state.currentRegularTabId  = null;
      state.currentRegularTabUrl = null;
      hideCurrentArticleSection('Internal page – no article available');
      await updateSaveSelectionVisibility();
      return;
    }

    // Case 2 — Our reader.html tab
    if (tab.url.includes('reader.html')) {
      state.currentRegularTabId  = null;
      state.currentRegularTabUrl = null;
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getCurrentArticle' });
        console.log('[SidePanel] reader tab response:', response);
        if (response && response.title) {
          state.currentReaderTabId = tab.id;
          showCurrentArticleSection(response);
        } else {
          state.currentReaderTabId = null;
          hideCurrentArticleSection('Article not loaded yet');
          await updateSaveSelectionVisibility();
        }
      } catch (err) {
        console.warn('[SidePanel] Could not reach reader tab:', err.message);
        state.currentReaderTabId = null;
        hideCurrentArticleSection('Reader page still loading…');
        await updateSaveSelectionVisibility();
      }
      return;
    }

    // Case 3 — Normal website
    if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
      state.currentReaderTabId   = null;
      state.currentRegularTabId  = tab.id;
      state.currentRegularTabUrl = tab.url;

      let hostname = tab.url;
      try { hostname = new URL(tab.url).hostname; } catch (_) {}

      showCurrentArticleSection({
        title:    tab.title || 'Current Page',
        url:      tab.url,
        siteName: hostname
      });
      return;
    }

    // Fallback
    hideCurrentArticleSection('Unsupported page');
    await updateSaveSelectionVisibility();
  } catch (error) {
    console.error('[SidePanel] Error in checkCurrentTab:', error);
    hideCurrentArticleSection('Could not detect current page');
    await updateSaveSelectionVisibility();
  }
}

/**
 * Update Save Selection button visibility based on the active tab.
 * This runs independently of the article card — Save Selection stays visible
 * whenever the user is on a regular http/https page.
 */
export async function updateSaveSelectionVisibility() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isRegularPage = tab && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'));
    document.getElementById('saveSelectionSection').style.display = isRegularPage ? '' : 'none';
  } catch (err) {
    console.warn('[SidePanel] Could not check tab for Save Selection:', err);
    document.getElementById('saveSelectionSection').style.display = 'none';
  }
}

// ── Article section UI ─────────────────────────────────────────────────────

/**
 * Show current article section
 */
export function showCurrentArticleSection(articleData) {
  state.currentArticleData = articleData;

  const section = document.getElementById('currentArticleSection');
  const title   = document.getElementById('currentTitle');
  const domain  = document.getElementById('currentDomain');

  title.textContent  = articleData.title;
  domain.textContent = articleData.siteName || new URL(articleData.url).hostname;
  section.style.display = 'block';

  // Enable the Add to List button
  const addBtn = document.getElementById('addToListBtn');
  addBtn.disabled = false;
  addBtn.querySelector('span').textContent = 'Add to List';

  // Show/hide Save Selection based on current tab type
  updateSaveSelectionVisibility();
}

/**
 * Hide current article section (show fallback message)
 * @param {string} [reason] - Optional hint shown as subtitle
 */
export function hideCurrentArticleSection(reason) {
  state.currentArticleData   = null;
  state.currentReaderTabId   = null;
  state.currentRegularTabId  = null;
  state.currentRegularTabUrl = null;
  const section = document.getElementById('currentArticleSection');
  section.style.display = 'block';
  document.getElementById('currentTitle').textContent  = 'No article detected';
  document.getElementById('currentDomain').textContent = reason || 'Navigate to a webpage to add it';
  document.getElementById('addToListBtn').disabled     = true;
  // Note: Save Selection visibility is managed independently by updateSaveSelectionVisibility()
}
