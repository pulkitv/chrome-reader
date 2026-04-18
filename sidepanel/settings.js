/** =========================================================
 *  MODULE: Settings  |  sidepanel/settings.js
 *  Floating button toggle, settings page navigation,
 *  and header menu toggle.
 *
 *  Depends on: state.js, auth.js (toggleAuthMenu)
 *  Exports: loadFloaterSetting, applyFloaterSettingUI,
 *           openSettingsPage, closeSettingsPage, toggleHeaderMenu
 * ========================================================= */

/* global chrome */

import { state, FLOATING_BUTTON_ENABLED_KEY } from './state.js';
import { toggleAuthMenu } from './auth.js';

// ── Floater setting ────────────────────────────────────────────────────────

export async function loadFloaterSetting() {
  try {
    const data  = await chrome.storage.sync.get(FLOATING_BUTTON_ENABLED_KEY);
    const value = data ? data[FLOATING_BUTTON_ENABLED_KEY] : undefined;

    if (typeof value === 'boolean') {
      state.floaterEnabled = value;
      return;
    }

    state.floaterEnabled = true;
    await chrome.storage.sync.set({ [FLOATING_BUTTON_ENABLED_KEY]: true });
  } catch (err) {
    console.warn('[SidePanel] Failed to load floater setting, defaulting to enabled:', err);
    state.floaterEnabled = true;
  }
}

export function applyFloaterSettingUI() {
  const select = document.getElementById('floaterEnabledSelect');
  if (!select) return;
  select.value = state.floaterEnabled ? 'enabled' : 'disabled';
}

// ── Settings page navigation ───────────────────────────────────────────────

export function openSettingsPage() {
  const mainPage     = document.getElementById('mainPage');
  const settingsPage = document.getElementById('settingsPage');
  mainPage.style.display     = 'none';
  settingsPage.style.display = 'flex';
  toggleAuthMenu(false);
  toggleHeaderMenu(false);
  applyFloaterSettingUI();
}

export function closeSettingsPage() {
  const mainPage     = document.getElementById('mainPage');
  const settingsPage = document.getElementById('settingsPage');
  settingsPage.style.display = 'none';
  mainPage.style.display     = 'flex';
}

// ── Header menu toggle ─────────────────────────────────────────────────────

export function toggleHeaderMenu(show) {
  const dropdown = document.getElementById('headerMenuDropdown');
  const btn      = document.getElementById('headerMenuBtn');
  if (!dropdown || !btn) return;

  if (show) {
    toggleAuthMenu(false);
    dropdown.removeAttribute('hidden');
    btn.setAttribute('aria-expanded', 'true');
  } else {
    dropdown.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', 'false');
  }
}
