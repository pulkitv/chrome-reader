/**
 * reader/cloud-count.js — Fetch the user's Supabase plan/count, open the
 * web app's saved-articles view, and open ReadEasy Pro checkout.
 *
 * Exports:
 *   refreshSavedArticlesCount() — query background → render plan/count UI
 *   openSavedArticlesWebapp()   — open the web app in a new tab
 *   openReadEasyProCheckout()   — open the Dodo checkout link
 */

/* global chrome */

import { READEASY_PRO_CHECKOUT_URL, TTS_WEBAPP_URL, state } from './state.js';

export async function refreshSavedArticlesCount() {
  const countEl = document.getElementById('savedArticlesCount');
  const proLink = document.getElementById('getProLink');
  const proBadge = document.getElementById('proBadge');
  if (!countEl && !proLink && !proBadge) return;

  try {
    const resp = await chrome.runtime.sendMessage({ action: 'getUserPlan' });
    if (resp && resp.success) {
      state.userPlan = {
        isPro: resp.isPro === true,
        articleLimit: resp.articleLimit ?? null,
        articleCount: typeof resp.articleCount === 'number' ? resp.articleCount : null
      };

      if (countEl && typeof resp.articleCount === 'number') {
        const limitText = resp.isPro ? '' : `/${resp.articleLimit || 10}`;
        countEl.textContent = `(${resp.articleCount}${limitText})`;
        countEl.hidden = false;
      } else if (countEl) {
        countEl.textContent = '';
        countEl.hidden = true;
      }

      if (proLink) proLink.hidden = resp.isPro === true;
      if (proBadge) proBadge.hidden = resp.isPro !== true;
    } else {
      resetPlanUi(countEl, proLink, proBadge);
    }
  } catch (_) {
    resetPlanUi(countEl, proLink, proBadge);
  }
}

export function openSavedArticlesWebapp() {
  window.open(TTS_WEBAPP_URL, '_blank');
}

export function openReadEasyProCheckout() {
  window.open(READEASY_PRO_CHECKOUT_URL, '_blank');
}

function resetPlanUi(countEl, proLink, proBadge) {
  state.userPlan = { isPro: false, articleLimit: 10, articleCount: null };
  if (countEl) {
    countEl.textContent = '';
    countEl.hidden = true;
  }
  if (proLink) proLink.hidden = false;
  if (proBadge) proBadge.hidden = true;
}
