/** =========================================================
 *  MODULE: Utils  |  sidepanel/utils.js
 *  Pure helper functions with no DOM or Chrome API side-effects
 *  beyond the toast container.
 *
 *  Depends on: nothing
 *  Exports: showToast, escapeHtml, decodeNamedEntities,
 *           formatFileSize, downloadBlob
 * ========================================================= */

// ── Toast notifications ────────────────────────────────────────────────────

/**
 * Show toast notification
 */
export function showToast(message, type = 'error', duration = 4000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── HTML helpers ───────────────────────────────────────────────────────────

/**
 * Escape HTML
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Replace all named HTML entities (e.g. &nbsp; &mdash; &ldquo;) with their
 * literal Unicode characters, which are safe in UTF-8 XML/XHTML.
 * The five XML-native entities (&amp; &lt; &gt; &quot; &apos;) are left alone.
 */
export function decodeNamedEntities(html) {
  // Match named entities only (not numeric &#…; ones, not the 5 XML built-ins)
  return html.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#)[a-zA-Z][a-zA-Z0-9]*;/g, entity => {
    const ta = document.createElement('textarea');
    ta.innerHTML = entity;
    return ta.value; // browser decodes it to the real Unicode character
  });
}

// ── File utilities ─────────────────────────────────────────────────────────

/**
 * Human-readable bytes
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return `${size.toFixed(2)} ${units[idx]}`;
}

/**
 * Download a Blob as file
 */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
