/**
 * reader/auth.js — Google sign-in state and UI for the reader header.
 *
 * Exports:
 *   loadReaderAuthState()      — read auth state from sync storage and apply UI
 *   applyReaderAuthUI()        — sync button / avatar / dropdown to current auth state
 *   openReaderAuthDropdown()   — show the auth dropdown
 *   closeReaderAuthDropdown()  — hide the auth dropdown
 *   handleReaderAuthClick()    — sign in (if guest) or toggle dropdown (if signed in)
 *   handleReaderSignOut()      — sign out and reset auth state
 */

/* global chrome */

import { AUTH_STATE_KEY, state } from './state.js';
import { showNotification }      from './article.js';

// ── State helpers ─────────────────────────────────────────────────────────────

/**
 * Safely normalise a raw auth object from storage or a message payload
 * into the shape expected by the rest of the auth module.
 */
function normaliseAuthState(raw) {
  const profile = (raw && raw.profile && typeof raw.profile === 'object')
    ? raw.profile
    : {};
  return {
    isSignedIn: raw && raw.isSignedIn === true,
    profile: {
      email:   typeof profile.email   === 'string' ? profile.email   : '',
      name:    typeof profile.name    === 'string' ? profile.name    : '',
      picture: typeof profile.picture === 'string' ? profile.picture : ''
    }
  };
}

// ── Load & apply ──────────────────────────────────────────────────────────────

/**
 * Read the persisted auth state from chrome.storage.sync, store it in
 * state.readerAuthState, and update the header UI.
 */
export async function loadReaderAuthState() {
  try {
    const data = await chrome.storage.sync.get(AUTH_STATE_KEY);
    state.readerAuthState = normaliseAuthState(data && data[AUTH_STATE_KEY]);
  } catch (_) {
    state.readerAuthState = normaliseAuthState(null);
  }
  applyReaderAuthUI();
}

/**
 * Reflect the current state.readerAuthState in the header DOM:
 * — Shows avatar image when signed in, guest icon when not.
 * — Populates the dropdown name/email fields.
 * — Hides or shows the Sign Out button.
 */
export function applyReaderAuthUI() {
  const btn        = document.getElementById('readerAuthBtn');
  if (!btn) return;

  const avatar     = document.getElementById('readerAuthAvatar');
  const guestIcon  = document.getElementById('readerAuthGuestIcon');
  const menuAvatar = document.getElementById('readerAuthMenuAvatar');
  const menuName   = document.getElementById('readerAuthMenuName');
  const menuEmail  = document.getElementById('readerAuthMenuEmail');
  const signOutBtn = document.getElementById('readerAuthSignOutBtn');

  const { isSignedIn, profile } = state.readerAuthState;
  const hasPicture = isSignedIn && profile.picture;

  btn.classList.toggle('signed-in',  isSignedIn);
  btn.classList.toggle('signed-out', !isSignedIn);

  if (hasPicture) {
    avatar.onerror = () => {
      avatar.removeAttribute('src');
      avatar.hidden    = true;
      guestIcon.hidden = false;
      btn.classList.remove('signed-in');
      btn.classList.add('signed-out');
    };
    avatar.src       = profile.picture;
    avatar.hidden    = false;
    guestIcon.hidden = true;
    menuAvatar.src   = profile.picture;
    menuAvatar.hidden = false;
  } else {
    avatar.onerror    = null;
    avatar.removeAttribute('src');
    avatar.hidden     = true;
    guestIcon.hidden  = false;
    menuAvatar.removeAttribute('src');
    menuAvatar.hidden = true;
  }

  if (isSignedIn) {
    btn.title = 'Account';
    btn.setAttribute('aria-label', 'Open account menu');
    menuName.textContent  = profile.name  || 'Signed in';
    menuEmail.textContent = profile.email || 'Google account';
    signOutBtn.hidden     = false;
  } else {
    btn.title = 'Sign in with Google';
    btn.setAttribute('aria-label', 'Sign in with Google');
    menuName.textContent  = 'Guest';
    menuEmail.textContent = 'Not signed in';
    signOutBtn.hidden     = true;
    closeReaderAuthDropdown();
  }
}

// ── Dropdown helpers ──────────────────────────────────────────────────────────

export function openReaderAuthDropdown() {
  const dropdown = document.getElementById('readerAuthDropdown');
  const btn      = document.getElementById('readerAuthBtn');
  if (!dropdown || !btn) return;
  dropdown.removeAttribute('hidden');
  btn.setAttribute('aria-expanded', 'true');
}

export function closeReaderAuthDropdown() {
  const dropdown = document.getElementById('readerAuthDropdown');
  const btn      = document.getElementById('readerAuthBtn');
  if (!dropdown || !btn) return;
  dropdown.setAttribute('hidden', '');
  btn.setAttribute('aria-expanded', 'false');
}

// ── Action handlers ───────────────────────────────────────────────────────────

/**
 * Handle a click on the reader auth button:
 * — If signed out, trigger Google sign-in via background.
 * — If signed in, toggle the account dropdown.
 */
export async function handleReaderAuthClick() {
  if (!state.readerAuthState.isSignedIn) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'authSignIn' });
      if (!response || !response.success) {
        throw new Error((response && response.error) || 'Sign-in failed');
      }
      state.readerAuthState = normaliseAuthState(response.authState);
      applyReaderAuthUI();
      showNotification('Signed in ✓', 'success');
    } catch (err) {
      showNotification(err.message || 'Sign-in failed', 'error');
    }
    return;
  }

  // Toggle dropdown if already signed in
  const dropdown = document.getElementById('readerAuthDropdown');
  if (dropdown.hasAttribute('hidden')) {
    openReaderAuthDropdown();
  } else {
    closeReaderAuthDropdown();
  }
}

/**
 * Handle a click on the Sign Out button inside the auth dropdown.
 */
export async function handleReaderSignOut() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'authSignOut' });
    if (!response || !response.success) {
      throw new Error((response && response.error) || 'Sign-out failed');
    }
    state.readerAuthState = normaliseAuthState(null);
    applyReaderAuthUI();
    showNotification('Signed out', 'success');
  } catch (err) {
    showNotification(err.message || 'Sign-out failed', 'error');
  }
}

/**
 * Handle an incoming 'authUpdated' broadcast message from the background
 * (e.g. signed in/out from the side panel).  Call this from the
 * chrome.runtime.onMessage listener in reader.js.
 */
export function handleAuthUpdatedMessage(authState) {
  state.readerAuthState = normaliseAuthState(authState);
  applyReaderAuthUI();
}
