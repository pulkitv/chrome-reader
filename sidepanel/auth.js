/** =========================================================
 *  MODULE: Auth  |  sidepanel/auth.js
 *  Google OAuth sign-in / sign-out and auth UI state.
 *
 *  Depends on: state.js, utils.js
 *  Exports: getSignedOutAuthState, normalizeAuthState, loadAuthState,
 *           applyAuthUI, toggleAuthMenu, handleAuthButtonClick,
 *           handleAuthSignOut
 * ========================================================= */

/* global chrome */

import { state, AUTH_STATE_KEY, AUTH_PROVIDER_GOOGLE } from './state.js';
import { showToast } from './utils.js';

// ── Auth state helpers ─────────────────────────────────────────────────────

export function getSignedOutAuthState() {
  return {
    isSignedIn: false,
    provider: AUTH_PROVIDER_GOOGLE,
    profile: {
      email: '',
      name: '',
      picture: ''
    },
    lastSignInAt: null
  };
}

export function normalizeAuthState(raw) {
  const base = getSignedOutAuthState();
  if (!raw || typeof raw !== 'object') return base;

  const profile = raw.profile && typeof raw.profile === 'object' ? raw.profile : {};
  const isSignedIn = raw.isSignedIn === true;
  const normalized = {
    isSignedIn,
    provider: raw.provider || AUTH_PROVIDER_GOOGLE,
    profile: {
      email: typeof profile.email === 'string' ? profile.email : '',
      name: typeof profile.name === 'string' ? profile.name : '',
      picture: typeof profile.picture === 'string' ? profile.picture : ''
    },
    lastSignInAt: Number.isFinite(raw.lastSignInAt) ? raw.lastSignInAt : null
  };

  if (!normalized.isSignedIn) {
    normalized.profile = { email: '', name: '', picture: '' };
    normalized.lastSignInAt = null;
  }

  return normalized;
}

// ── Auth storage ───────────────────────────────────────────────────────────

export async function loadAuthState() {
  try {
    const data = await chrome.storage.sync.get(AUTH_STATE_KEY);
    state.authState = normalizeAuthState(data && data[AUTH_STATE_KEY]);
  } catch (err) {
    console.warn('[SidePanel] Failed to load auth state:', err);
    state.authState = getSignedOutAuthState();
  }
}

// ── Auth UI ────────────────────────────────────────────────────────────────

export function applyAuthUI() {
  const authBtn        = document.getElementById('authBtn');
  const authAvatar     = document.getElementById('authAvatar');
  const authGuestIcon  = document.getElementById('authGuestIcon');
  const authMenuAvatar = document.getElementById('authMenuAvatar');
  const authMenuName   = document.getElementById('authMenuName');
  const authMenuEmail  = document.getElementById('authMenuEmail');
  const authSignOutBtn = document.getElementById('authSignOutBtn');

  if (!authBtn || !authAvatar || !authGuestIcon || !authMenuAvatar || !authMenuName || !authMenuEmail || !authSignOutBtn) {
    return;
  }

  const signedIn   = state.authState && state.authState.isSignedIn === true;
  const hasPicture = signedIn && state.authState.profile && state.authState.profile.picture;

  function showAvatarFallback() {
    authAvatar.removeAttribute('src');
    authAvatar.hidden = true;
    authGuestIcon.hidden = false;
    authBtn.classList.add('avatar-fallback');
  }

  authBtn.classList.remove('avatar-fallback');

  authBtn.classList.toggle('signed-in',  signedIn);
  authBtn.classList.toggle('signed-out', !signedIn);

  if (signedIn && hasPicture) {
    authAvatar.onerror = () => {
      showAvatarFallback();
    };
    authAvatar.src       = state.authState.profile.picture;
    authAvatar.hidden    = false;
    authGuestIcon.hidden = true;

    authMenuAvatar.onerror = () => {
      authMenuAvatar.removeAttribute('src');
      authMenuAvatar.hidden = true;
    };
    authMenuAvatar.src    = state.authState.profile.picture;
    authMenuAvatar.hidden = false;
  } else if (signedIn) {
    authAvatar.onerror = null;
    authMenuAvatar.onerror = null;
    showAvatarFallback();
    authMenuAvatar.removeAttribute('src');
    authMenuAvatar.hidden = true;
  } else {
    authAvatar.onerror = null;
    authMenuAvatar.onerror = null;
    authAvatar.removeAttribute('src');
    authAvatar.hidden    = true;
    authGuestIcon.hidden = false;

    authMenuAvatar.removeAttribute('src');
    authMenuAvatar.hidden = true;
  }

  if (signedIn) {
    authBtn.title = 'Account';
    authBtn.setAttribute('aria-label', 'Open account menu');
    authMenuName.textContent  = (state.authState.profile && state.authState.profile.name)  || 'Signed in';
    authMenuEmail.textContent = (state.authState.profile && state.authState.profile.email) || 'Google account';
    authSignOutBtn.hidden = false;
  } else {
    authBtn.title = 'Sign in with Google';
    authBtn.setAttribute('aria-label', 'Sign in with Google');
    authMenuName.textContent  = 'Guest';
    authMenuEmail.textContent = 'Not signed in';
    authSignOutBtn.hidden = true;
    toggleAuthMenu(false);
  }
}

export function toggleAuthMenu(show) {
  const dropdown = document.getElementById('authMenuDropdown');
  const btn      = document.getElementById('authBtn');
  if (!dropdown || !btn) return;

  if (show) {
    dropdown.removeAttribute('hidden');
    btn.setAttribute('aria-expanded', 'true');
  } else {
    dropdown.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', 'false');
  }
}

// ── Auth actions ───────────────────────────────────────────────────────────

export async function handleAuthButtonClick(toggleHeaderMenuFn) {
  if (!state.authState || state.authState.isSignedIn !== true) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'authSignIn' });
      if (!response || !response.success) {
        throw new Error((response && response.error) || 'Sign-in failed');
      }

      state.authState = normalizeAuthState(response.authState);
      applyAuthUI();
      showToast('Signed in ✓', 'success', 1800);
    } catch (err) {
      console.error('[SidePanel] Sign-in failed:', err);
      showToast(err.message || 'Sign-in failed', 'error');
    }
    return;
  }

  const dropdown  = document.getElementById('authMenuDropdown');
  const shouldShow = dropdown.hasAttribute('hidden');
  toggleAuthMenu(shouldShow);
  if (shouldShow) {
    toggleHeaderMenuFn(false);
  }
}

export async function handleAuthSignOut() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'authSignOut' });
    if (!response || !response.success) {
      throw new Error((response && response.error) || 'Sign-out failed');
    }

    state.authState = normalizeAuthState(response.authState);
    applyAuthUI();
    toggleAuthMenu(false);
    showToast('Signed out', 'success', 1500);
  } catch (err) {
    console.error('[SidePanel] Sign-out failed:', err);
    showToast(err.message || 'Sign-out failed', 'error');
  }
}
