/** =========================================================
 *  MODULE: X4 Modal  |  sidepanel/x4-modal.js
 *  X4 device modal: open/close, EPUB regeneration,
 *  connection check, send, download, and settings persistence.
 *  Also owns the two EPUB orchestration entry-points
 *  (handleMergeEPUB, handleMergeAndSendToX4).
 *
 *  Depends on: state.js, utils.js, epub-build.js
 *  Exports: handleMergeEPUB, handleMergeAndSendToX4,
 *           openX4Modal, closeX4Modal,
 *           setX4ActionButtonsEnabled, regenerateX4BlobForModal,
 *           handleX4Download, handleCheckX4Connection,
 *           handleSendToX4, handleX4ExcludeImagesChange
 * ========================================================= */

/* global getAllArticles, JSZip, chrome */

import {
  state,
  X4_MODAL_MODE_SEND,
  X4_MODAL_MODE_DOWNLOAD,
  X4_DEFAULT_IP,
  X4_SETTINGS_KEY
} from './state.js';
import { showToast, formatFileSize, downloadBlob } from './utils.js';
import { buildMergedEPUBBlob } from './epub-build.js';

// ── EPUB orchestration entry-points ───────────────────────────────────────

/**
 * Handle merge and download EPUB
 */
export async function handleMergeEPUB() {
  const mergeBtn = document.getElementById('mergeEpubBtn');

  try {
    mergeBtn.disabled = true;
    mergeBtn.querySelector('span').textContent = 'Preparing...';

    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip library not loaded');
    }

    const articles = await getAllArticles();

    if (articles.length === 0) {
      throw new Error('No articles to merge');
    }

    state.pendingX4Articles    = articles;
    state.pendingX4Blob        = null;
    state.pendingX4SizeText    = '-';
    state.pendingX4DefaultName = `ReadEasy_Merged_${new Date().toISOString().split('T')[0]}.epub`;

    await openX4Modal(X4_MODAL_MODE_DOWNLOAD);
  } catch (error) {
    console.error('Error preparing EPUB for download:', error);
    showToast('Could not prepare EPUB: ' + error.message, 'error');
  } finally {
    mergeBtn.disabled = state.readingListMeta.length === 0;
    mergeBtn.querySelector('span').textContent = 'Merge & Download EPUB';
  }
}

/**
 * Handle merge and open Send to X4 modal
 */
export async function handleMergeAndSendToX4() {
  const mergeSendBtn = document.getElementById('mergeSendX4Btn');
  try {
    mergeSendBtn.disabled = true;
    mergeSendBtn.querySelector('span').textContent = 'Preparing...';

    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip library not loaded');
    }

    const articles = await getAllArticles();
    if (articles.length === 0) {
      throw new Error('No articles to merge');
    }

    state.pendingX4Articles    = articles;
    state.pendingX4Blob        = null;
    state.pendingX4SizeText    = '-';
    state.pendingX4DefaultName = `ReadEasy_Merged_${new Date().toISOString().split('T')[0]}.epub`;

    await openX4Modal(X4_MODAL_MODE_SEND);
  } catch (error) {
    console.error('Error preparing EPUB for X4:', error);
    showToast('Could not prepare EPUB: ' + error.message, 'error');
  } finally {
    mergeSendBtn.disabled = state.readingListMeta.length === 0;
    mergeSendBtn.querySelector('span').textContent = 'Merge & Send to X4';
  }
}

// ── X4 modal open / close ──────────────────────────────────────────────────

/**
 * Open Send to X4 modal with prepared EPUB metadata
 */
export async function openX4Modal(mode = X4_MODAL_MODE_SEND) {
  const modal                = document.getElementById('x4Modal');
  const titleEl              = document.getElementById('x4ModalTitle');
  const actionRow            = modal.querySelector('.x4-action-row');
  const sendBtn              = document.getElementById('x4SendBtn');
  const downloadBtn          = document.getElementById('x4DownloadBtn');
  const transportSection     = modal.querySelector('.x4-settings-section');
  const nameInput            = document.getElementById('x4EpubName');
  const sizeEl               = document.getElementById('x4EpubSize');
  const firmwareSelect       = document.getElementById('x4FirmwareSelect');
  const ipInput              = document.getElementById('x4DeviceIp');
  const statusEl             = document.getElementById('x4ConnectionStatus');
  const responsePreviewEl    = document.getElementById('x4ResponsePreview');
  const excludeImagesCheckbox = document.getElementById('x4ExcludeImages');

  state.x4ModalMode = mode === X4_MODAL_MODE_DOWNLOAD ? X4_MODAL_MODE_DOWNLOAD : X4_MODAL_MODE_SEND;

  const settings = await loadX4Settings();
  firmwareSelect.value          = settings.firmware || 'crosspoint';
  ipInput.value                 = settings.ip || X4_DEFAULT_IP;
  excludeImagesCheckbox.checked = !!state.x4ExcludeImagesSession;

  nameInput.value           = state.pendingX4DefaultName || `ReadEasy_Merged_${new Date().toISOString().split('T')[0]}.epub`;
  sizeEl.textContent        = state.pendingX4SizeText;
  statusEl.textContent      = 'Connection not checked.';
  statusEl.classList.remove('success', 'error');
  responsePreviewEl.hidden  = true;
  responsePreviewEl.textContent = '';

  if (state.x4ModalMode === X4_MODAL_MODE_DOWNLOAD) {
    titleEl.textContent = 'Download EPUB';
    sendBtn.hidden      = true;
    transportSection.hidden = true;
    actionRow.classList.add('single-action');
  } else {
    titleEl.textContent = 'Send to X4';
    sendBtn.hidden      = false;
    transportSection.hidden = false;
    actionRow.classList.remove('single-action');
  }
  downloadBtn.hidden = false;

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  setX4ActionButtonsEnabled(false);

  // Build initial blob using current session-scoped image toggle
  regenerateX4BlobForModal();

  nameInput.focus();
  nameInput.select();
}

/**
 * Close Send to X4 modal
 */
export function closeX4Modal() {
  const modal = document.getElementById('x4Modal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

// ── Action button state ────────────────────────────────────────────────────

/**
 * Enable/disable X4 action buttons (send + download)
 */
export function setX4ActionButtonsEnabled(enabled) {
  const sendBtn     = document.getElementById('x4SendBtn');
  const downloadBtn = document.getElementById('x4DownloadBtn');
  const allowSend     = state.x4ModalMode === X4_MODAL_MODE_SEND;
  const allowDownload = state.x4ModalMode === X4_MODAL_MODE_DOWNLOAD || state.x4ModalMode === X4_MODAL_MODE_SEND;

  sendBtn.disabled     = !enabled || !allowSend;
  downloadBtn.disabled = !enabled || !allowDownload;
}

// ── EPUB regeneration ──────────────────────────────────────────────────────

/**
 * Regenerate pending X4 EPUB blob for current modal options.
 * Uses monotonic request IDs so stale async completions cannot mutate UI/blob.
 */
export async function regenerateX4BlobForModal() {
  const modal   = document.getElementById('x4Modal');
  const sizeEl  = document.getElementById('x4EpubSize');
  const statusEl = document.getElementById('x4ConnectionStatus');

  if (!modal.classList.contains('open')) return;
  if (!state.pendingX4Articles || state.pendingX4Articles.length === 0) return;

  const requestId   = ++state.x4RegenRequestId;
  const prevBlob     = state.pendingX4Blob;
  const prevSizeText = state.pendingX4SizeText;

  state.x4RegenInFlight = true;
  setX4ActionButtonsEnabled(false);
  sizeEl.textContent   = 'Regenerating...';
  statusEl.textContent = 'Regenerating EPUB...';
  statusEl.classList.remove('success', 'error');

  try {
    const blob = await buildMergedEPUBBlob(state.pendingX4Articles, {
      includeImages: !state.x4ExcludeImagesSession
    });

    if (requestId !== state.x4RegenRequestId || !modal.classList.contains('open')) return;

    state.pendingX4Blob     = blob;
    state.pendingX4SizeText = formatFileSize(blob.size);
    sizeEl.textContent      = state.pendingX4SizeText;
    statusEl.textContent    = 'Connection not checked.';
    statusEl.classList.remove('success', 'error');
  } catch (error) {
    if (requestId !== state.x4RegenRequestId || !modal.classList.contains('open')) return;

    // Keep previous valid blob/size on regeneration failures
    state.pendingX4Blob     = prevBlob;
    state.pendingX4SizeText = prevSizeText;
    sizeEl.textContent      = state.pendingX4SizeText;
    statusEl.textContent    = 'Connection not checked.';
    statusEl.classList.remove('success', 'error');
    showToast('Could not regenerate EPUB: ' + (error.message || 'Unknown error'), 'error');
  } finally {
    // Re-enable only when the latest regeneration settles
    if (requestId === state.x4RegenRequestId) {
      state.x4RegenInFlight         = false;
      state.x4LatestSettledRequestId = requestId;
      if (modal.classList.contains('open')) {
        setX4ActionButtonsEnabled(!!state.pendingX4Blob);
      }
    }
  }
}

/**
 * Handle x4ExcludeImages checkbox change
 */
export async function handleX4ExcludeImagesChange(checked) {
  state.x4ExcludeImagesSession = !!checked;
  await regenerateX4BlobForModal();
}

// ── Download ───────────────────────────────────────────────────────────────

/**
 * Download from Send to X4 modal
 */
export function handleX4Download() {
  if (state.x4ModalMode !== X4_MODAL_MODE_DOWNLOAD && state.x4ModalMode !== X4_MODAL_MODE_SEND) {
    showToast('Download is not available in the current modal mode.', 'error', 2000);
    return;
  }

  if (state.x4RegenInFlight && state.x4LatestSettledRequestId !== state.x4RegenRequestId) {
    showToast('EPUB is still regenerating. Please wait.', 'error', 2000);
    return;
  }

  if (!state.pendingX4Blob) {
    showToast('No EPUB prepared. Please generate again.', 'error');
    return;
  }

  const fileName = getSanitizedEpubFileName(document.getElementById('x4EpubName').value);
  downloadBlob(state.pendingX4Blob, fileName);
  showToast('EPUB downloaded successfully ✓', 'success', 2500);
}

// ── Connection check ───────────────────────────────────────────────────────

/**
 * Check device connection for Send to X4
 */
export async function handleCheckX4Connection() {
  const statusEl = document.getElementById('x4ConnectionStatus');
  const checkBtn = document.getElementById('x4CheckConnectionBtn');
  const ip       = document.getElementById('x4DeviceIp').value.trim();
  const firmware = document.getElementById('x4FirmwareSelect').value;

  try {
    checkBtn.disabled    = true;
    statusEl.textContent = 'Checking connection...';
    statusEl.classList.remove('success', 'error');

    const result = await checkX4Connection(ip, firmware);
    if (result.ok) {
      statusEl.textContent = `Connected: ${result.message}`;
      statusEl.classList.add('success');
      statusEl.classList.remove('error');
      await saveX4Settings({ ip, firmware });
    } else {
      throw new Error(result.message || 'Device is not reachable');
    }
  } catch (error) {
    statusEl.textContent = `Not connected: ${error.message}`;
    statusEl.classList.add('error');
    statusEl.classList.remove('success');
  } finally {
    checkBtn.disabled = false;
  }
}

// ── Send to X4 ─────────────────────────────────────────────────────────────

/**
 * Send prepared EPUB to X4 device
 */
export async function handleSendToX4() {
  if (state.x4ModalMode !== X4_MODAL_MODE_SEND) {
    showToast('Send is only available in Send to X4 mode.', 'error', 2000);
    return;
  }

  const sendBtn           = document.getElementById('x4SendBtn');
  const statusEl          = document.getElementById('x4ConnectionStatus');
  const responsePreviewEl = document.getElementById('x4ResponsePreview');
  const ip                = document.getElementById('x4DeviceIp').value.trim();
  const firmware          = document.getElementById('x4FirmwareSelect').value;
  const fileName          = getSanitizedEpubFileName(document.getElementById('x4EpubName').value);

  if (state.x4RegenInFlight && state.x4LatestSettledRequestId !== state.x4RegenRequestId) {
    showToast('EPUB is still regenerating. Please wait.', 'error', 2000);
    return;
  }

  if (!state.pendingX4Blob) {
    showToast('No EPUB prepared. Please generate again.', 'error');
    return;
  }

  try {
    sendBtn.disabled    = true;
    sendBtn.textContent = 'Sending...';

    const response = await sendEpubToX4(state.pendingX4Blob, fileName, ip, firmware);

    if (!response.ok) {
      throw new Error(response.message || 'Upload failed');
    }

    await saveX4Settings({ ip, firmware });
    statusEl.textContent = 'Upload successful ✓';
    statusEl.classList.add('success');
    statusEl.classList.remove('error');
    responsePreviewEl.hidden      = false;
    responsePreviewEl.textContent = response.message || 'Upload successful';
    showToast('EPUB sent to X4 successfully ✓', 'success', 3000);
  } catch (error) {
    console.error('X4 upload failed:', error);
    statusEl.textContent = `Upload failed: ${error.message}`;
    statusEl.classList.add('error');
    statusEl.classList.remove('success');
    responsePreviewEl.hidden      = false;
    responsePreviewEl.textContent = error.message || 'Upload failed';
    showToast('Failed to send EPUB: ' + error.message, 'error');
  } finally {
    sendBtn.disabled    = false;
    sendBtn.textContent = 'Send to X4';
  }
}

// ── Device connectivity helpers ────────────────────────────────────────────

/**
 * Build base URL from user-entered IP/host
 */
function buildDeviceBaseUrl(input) {
  const value = (input || '').trim();
  if (!value) throw new Error('Please enter a device IP address');
  if (/^https?:\/\//i.test(value)) {
    return value.replace(/\/+$/, '');
  }
  return `http://${value.replace(/\/+$/, '')}`;
}

/**
 * Check X4 connection (same method for stock + crosspoint for now)
 */
async function checkX4Connection(ip, firmware) {
  const baseUrl   = buildDeviceBaseUrl(ip);
  const statusUrl = `${baseUrl}/api/status`;

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 8000);

  try {
    const statusRes = await fetch(statusUrl, { method: 'GET', signal: controller.signal });
    if (statusRes.ok) {
      return { ok: true, message: '/api/status reachable' };
    }
  } catch (_) {
    // fallback below
  } finally {
    clearTimeout(timer);
  }

  const homeController = new AbortController();
  const homeTimer      = setTimeout(() => homeController.abort(), 8000);
  try {
    const homeRes = await fetch(`${baseUrl}/`, { method: 'GET', signal: homeController.signal });
    if (!homeRes.ok) {
      return { ok: false, message: `HTTP ${homeRes.status} on /` };
    }
    const html = await homeRes.text();
    if (/CrossPoint Reader|CrossPoint/i.test(html)) {
      return { ok: true, message: 'CrossPoint home page detected' };
    }
    return { ok: true, message: 'Device responded on /' };
  } finally {
    clearTimeout(homeTimer);
  }
}

/**
 * Send EPUB blob to X4 upload endpoint (same method for stock + crosspoint)
 */
async function sendEpubToX4(blob, fileName, ip, firmware) {
  const baseUrl  = buildDeviceBaseUrl(ip);
  const formData = new FormData();
  formData.append('file', blob, fileName);

  const bytes  = Number(blob?.size) || 0;
  const sizeMB = bytes / (1024 * 1024);
  // Adaptive timeout: 20s base + 7s per MB, clamped to 45s..15min
  const timeoutMs = Math.min(
    15 * 60 * 1000,
    Math.max(45 * 1000, Math.round((20 + sizeMB * 7) * 1000))
  );

  const controller = new AbortController();
  let timedOut     = false;
  const timer      = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      body:   formData,
      signal: controller.signal
    });

    const bodyText = await res.text().catch(() => '');
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}: ${bodyText || res.statusText}` };
    }
    return { ok: true, message: bodyText || 'Upload successful' };
  } catch (error) {
    if (timedOut || error?.name === 'AbortError') {
      return {
        ok:      false,
        message: `Upload timed out after ${Math.ceil(timeoutMs / 1000)}s (${formatFileSize(bytes)}). Please retry while keeping the device awake and on the same Wi-Fi.`
      };
    }

    return {
      ok:      false,
      message: error?.message || 'Network error while uploading'
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── X4 settings persistence ────────────────────────────────────────────────

/**
 * Load persisted X4 settings
 */
async function loadX4Settings() {
  try {
    const result = await chrome.storage.sync.get(X4_SETTINGS_KEY);
    return result[X4_SETTINGS_KEY] || { firmware: 'crosspoint', ip: X4_DEFAULT_IP };
  } catch (_) {
    return { firmware: 'crosspoint', ip: X4_DEFAULT_IP };
  }
}

/**
 * Save persisted X4 settings
 */
async function saveX4Settings(settings) {
  try {
    await chrome.storage.sync.set({ [X4_SETTINGS_KEY]: settings });
  } catch (_) {
    // non-fatal
  }
}

// ── File name helper ───────────────────────────────────────────────────────

/**
 * Ensure a safe .epub file name
 */
function getSanitizedEpubFileName(inputName) {
  let fileName = (inputName || '').trim() || state.pendingX4DefaultName || `ReadEasy_Merged_${new Date().toISOString().split('T')[0]}.epub`;
  fileName = fileName.replace(/[\\/:*?"<>|]/g, '_');
  if (!/\.epub$/i.test(fileName)) fileName += '.epub';
  return fileName;
}
