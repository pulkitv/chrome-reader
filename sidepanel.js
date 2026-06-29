/**
 * ReadEasy Side Panel — Entry Point
 *
 * Imports all sub-modules, wires DOM event listeners, and boots
 * the panel on DOMContentLoaded.  Business logic lives in
 * sidepanel/*.js — this file is intentionally thin (~120 lines).
 */

/* global chrome */

// ── Module imports ─────────────────────────────────────────────────────────

import {
  state,
  AUTH_STATE_KEY,
  FLOATING_BUTTON_ENABLED_KEY,
  PANEL_DISPLAY_STATE_KEY,
  PANEL_STATE_USER_CLOSED,
  READEASY_PRO_CHECKOUT_URL
} from './sidepanel/state.js';

import { showToast }                                   from './sidepanel/utils.js';

import {
  getSignedOutAuthState,
  normalizeAuthState,
  loadAuthState,
  applyAuthUI,
  toggleAuthMenu,
  handleAuthButtonClick,
  handleAuthSignOut
} from './sidepanel/auth.js';

import {
  loadFloaterSetting,
  applyFloaterSettingUI,
  openSettingsPage,
  closeSettingsPage,
  toggleHeaderMenu
} from './sidepanel/settings.js';

import { checkCurrentTab } from './sidepanel/tab-detection.js';

import { initPanel }                                   from './sidepanel/reading-list-render.js';

import {
  handleAddToListViaTab,
  handleSaveSelection,
  handleAddToListFromRegularTab
} from './sidepanel/reading-list-add.js';

import {
  handleMergeEPUB,
  handleMergeAndSendToX4,
  closeX4Modal,
  handleX4Download,
  handleSendToX4,
  handleCheckX4Connection,
  handleX4ExcludeImagesChange
} from './sidepanel/x4-modal.js';

import { handleMergePDF } from './sidepanel/pdf-build.js';

// ── Bootstrap ──────────────────────────────────────────────────────────────

// Initialise authState to a signed-out default immediately (avoids null reads
// before loadAuthState() completes)
state.authState = getSignedOutAuthState();

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[SidePanel] DOMContentLoaded - JS loaded');
  await initPanel();
  await loadFloaterSetting();
  await loadAuthState();
  applyFloaterSettingUI();
  applyAuthUI();
  setupEventListeners();
  await checkCurrentTab();
});

// ── Event wiring ───────────────────────────────────────────────────────────

function setupEventListeners() {
  console.log('[SidePanel] setupEventListeners called');

  const authBtn              = document.getElementById('authBtn');
  const authSignOutBtn       = document.getElementById('authSignOutBtn');
  const headerMenuBtn        = document.getElementById('headerMenuBtn');
  const sidepanelGetProBtn   = document.getElementById('sidepanelGetProBtn');
  const openSettingsBtn      = document.getElementById('openSettingsBtn');
  const settingsBackBtn      = document.getElementById('settingsBackBtn');
  const floaterEnabledSelect = document.getElementById('floaterEnabledSelect');

  // ── Auth ──
  authBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await handleAuthButtonClick(toggleHeaderMenu);
  });

  authSignOutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await handleAuthSignOut();
  });

  // ── Header menu ──
  sidepanelGetProBtn.addEventListener('click', () => {
    window.open(READEASY_PRO_CHECKOUT_URL, '_blank');
  });

  headerMenuBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dropdown = document.getElementById('headerMenuDropdown');
    toggleHeaderMenu(dropdown.hasAttribute('hidden'));
  });

  // ── Settings page ──
  openSettingsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openSettingsPage();
  });

  settingsBackBtn.addEventListener('click', () => {
    closeSettingsPage();
  });

  // ── Floater toggle ──
  floaterEnabledSelect.addEventListener('change', async (e) => {
    state.floaterEnabled = e.target.value === 'enabled';
    try {
      await chrome.storage.sync.set({ [FLOATING_BUTTON_ENABLED_KEY]: state.floaterEnabled });
      applyFloaterSettingUI();
    } catch (err) {
      console.error('[SidePanel] Failed to save floater setting:', err);
      showToast('Failed to save settings', 'error');
    }
  });

  // ── Reading list actions ──
  document.getElementById('addToListBtn').addEventListener('click', async () => {
    if (state.currentReaderTabId) {
      await handleAddToListViaTab(state.currentReaderTabId);
    } else if (state.currentRegularTabId) {
      await handleAddToListFromRegularTab(state.currentRegularTabId, state.currentRegularTabUrl);
    }
  });

  document.getElementById('saveSelectionBtn').addEventListener('click', async () => {
    // Re-query the active tab so we always have a fresh tab ID
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = (activeTab && activeTab.url && activeTab.url.startsWith('http')) ? activeTab.id : state.currentRegularTabId;
    if (tabId) {
      await handleSaveSelection(tabId);
    }
  });

  // ── EPUB / X4 ──
  document.getElementById('mergeEpubBtn').addEventListener('click', async () => {
    await handleMergeEPUB();
  });

  document.getElementById('mergePdfBtn').addEventListener('click', async () => {
    await handleMergePDF();
  });

  document.getElementById('mergeSendX4Btn').addEventListener('click', async () => {
    await handleMergeAndSendToX4();
  });

  document.getElementById('x4ModalCloseBtn').addEventListener('click', () => closeX4Modal());
  document.getElementById('x4DownloadBtn').addEventListener('click', () => handleX4Download());
  document.getElementById('x4SendBtn').addEventListener('click', async () => {
    await handleSendToX4();
  });
  document.getElementById('x4CheckConnectionBtn').addEventListener('click', async () => {
    await handleCheckX4Connection();
  });
  document.getElementById('x4ExcludeImages').addEventListener('change', async (e) => {
    await handleX4ExcludeImagesChange(e.target.checked);
  });

  document.getElementById('x4Modal').addEventListener('click', (e) => {
    if (e.target && e.target.id === 'x4Modal') {
      closeX4Modal();
    }
  });

  // ── Panel close ──
  document.getElementById('panelCloseBtn').addEventListener('click', async () => {
    state.panelDisplayState = PANEL_STATE_USER_CLOSED;
    await chrome.storage.sync.set({ [PANEL_DISPLAY_STATE_KEY]: PANEL_STATE_USER_CLOSED });
    window.close();
  });

  // ── Global keyboard / outside-click dismissal ──
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      toggleAuthMenu(false);
      toggleHeaderMenu(false);
      const modal = document.getElementById('x4Modal');
      if (modal.classList.contains('open')) closeX4Modal();
    }
  });

  document.addEventListener('click', (e) => {
    const authDropdown = document.getElementById('authMenuDropdown');
    const authButton   = document.getElementById('authBtn');
    const dropdown     = document.getElementById('headerMenuDropdown');
    const btn          = document.getElementById('headerMenuBtn');

    if (!authDropdown.hasAttribute('hidden') && !authDropdown.contains(e.target) && !authButton.contains(e.target)) {
      toggleAuthMenu(false);
    }

    if (!dropdown.hasAttribute('hidden') && !dropdown.contains(e.target) && !btn.contains(e.target)) {
      toggleHeaderMenu(false);
    }
  });

  // ── Chrome API listeners ──

  // Reload when readingListMeta changes in storage (primary mechanism)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.readingListMeta) {
      initPanel();
    }

    if (area === 'sync' && changes[AUTH_STATE_KEY]) {
      state.authState = normalizeAuthState(changes[AUTH_STATE_KEY].newValue);
      applyAuthUI();
    }
  });

  // Also listen for explicit listUpdated broadcasts from background.js (backup)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'listUpdated') {
      initPanel();
    }

    if (message.action === 'authUpdated' && message.authState) {
      state.authState = normalizeAuthState(message.authState);
      applyAuthUI();
    }
  });

  // Listen for tab changes - re-check whenever tabs switch, update, or are created
  chrome.tabs.onActivated.addListener(() => {
    checkCurrentTab();
  });

  // Re-check when a tab finishes loading (e.g. reader.html just opened)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      checkCurrentTab();
    }
  });
}
