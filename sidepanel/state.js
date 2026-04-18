/** =========================================================
 *  MODULE: State  |  sidepanel/state.js
 *  Single source of truth for all mutable cross-module state
 *  and shared constants.
 *
 *  Depends on: nothing
 *  Exports: state (mutable object), all constants
 * ========================================================= */

// ── Constants ──────────────────────────────────────────────────────────────

export const X4_MODAL_MODE_SEND     = 'send';
export const X4_MODAL_MODE_DOWNLOAD = 'download';

export const X4_DEFAULT_IP             = '192.168.1.11';
export const X4_SETTINGS_KEY           = 'x4Settings';
export const FLOATING_BUTTON_ENABLED_KEY = 'floatingButtonEnabled';
export const AUTH_STATE_KEY            = 'authState';
export const AUTH_PROVIDER_GOOGLE      = 'google';

// ── Mutable state object ───────────────────────────────────────────────────
// All modules import this object and read/write via state.<key>.
// Using a single object (instead of exported lets) ensures assignments from
// any module are reflected everywhere — ES module bindings are live for
// imported objects but not for imported primitive lets.

export const state = {
  // Reading list
  readingListMeta:      [],

  // Tab detection
  currentArticleData:   null,
  currentReaderTabId:   null,   // Tab ID when active tab is reader.html
  currentRegularTabId:  null,   // Tab ID when active tab is a normal website
  currentRegularTabUrl: null,   // URL of the active regular website tab

  // X4 pending operation cluster
  pendingX4Blob:              null,
  pendingX4DefaultName:       '',
  pendingX4Articles:          [],
  pendingX4SizeText:          '-',
  x4ExcludeImagesSession:     false,
  x4RegenRequestId:           0,
  x4LatestSettledRequestId:   0,
  x4RegenInFlight:            false,
  x4ModalMode:                X4_MODAL_MODE_SEND,

  // Settings
  floaterEnabled:       true,

  // Auth — initialised below after helper is defined
  authState:            null,

  // Internal debounce handle for initPanel
  _initPanelTimer:      null,
};
