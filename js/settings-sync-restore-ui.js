// @ts-check
// settings-sync-restore-ui.js — mnemonic restore progress and validation UI.

import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';

/** @param {HTMLTextAreaElement | null} [input]
 * @param {boolean} [busy]
 */
export function updateSyncSetupRestoreState(
  input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('sync-setup-restore-input')),
  busy = false,
) {
  const msg = document.getElementById('sync-setup-restore-msg');
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('sync-setup-restore-go'));
  if (!input || busy) return;
  const raw = (input.value || '').trim();
  const words = raw ? raw.split(/\s+/) : [];
  if (msg) {
    msg.textContent = raw
      ? (words.length === 24 ? '✓ 24 words detected' : `${words.length} word${words.length === 1 ? '' : 's'} so far — need exactly 24`)
      : 'Paste the 24 words from the device that already has sync.';
    msg.style.color = words.length === 24 ? 'var(--green, #22c55e)' : (raw ? '#fbbf24' : 'var(--text-muted)');
  }
  if (btn) btn.disabled = words.length !== 24;
}

export function setSyncSetupRestoreBusy(busy, message = '') {
  const restoreEl = document.getElementById('sync-setup-restore');
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('sync-setup-restore-input'));
  const msg = document.getElementById('sync-setup-restore-msg');
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('sync-setup-restore-go'));
  const back = /** @type {HTMLButtonElement | null} */ (document.getElementById('sync-setup-restore-back'));
  const cancelButtons = document.querySelectorAll('#sync-setup-overlay [data-sync-setup-action="setup-cancel"]');
  if (restoreEl) restoreEl.setAttribute('aria-busy', busy ? 'true' : 'false');
  if (input) input.disabled = busy;
  if (btn) {
    btn.disabled = busy;
    btn.textContent = busy ? 'Joining…' : 'Join & reload';
  }
  if (back) back.disabled = busy;
  cancelButtons.forEach(cancel => { if (cancel instanceof HTMLButtonElement) cancel.disabled = busy; });
  if (msg && message) {
    msg.textContent = message;
    msg.style.color = busy ? 'var(--text-muted)' : 'var(--red)';
  }
}

export function setSyncSetupRestoreReloading() {
  setSyncSetupRestoreBusy(true, 'Identity accepted. Reloading this device…');
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('sync-setup-restore-go'));
  if (btn) btn.textContent = 'Reloading…';
}

export function openRestoreMnemonicDialog() {
  let overlay = document.getElementById('sync-restore-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sync-restore-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="sync-restore-title" style="max-width:480px">
    <h3 id="sync-restore-title" style="margin:0 0 6px;font-size:16px;color:var(--text-primary)">Restore from mnemonic</h3>
    <p style="font-size:13px;color:var(--text-muted);margin:0 0 14px;line-height:1.5">Paste your 24-word seed from another device. This replaces your current sync identity — anything synced under the old identity will no longer reach this device.</p>
    <textarea id="sync-restore-dialog-input" autofocus aria-label="24-word mnemonic" aria-describedby="sync-restore-dialog-msg" data-sync-action="restore-dialog-input" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" style="font-size:12px;width:100%;height:90px;resize:vertical;border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);padding:10px 12px;font-family:var(--font-mono, monospace);box-sizing:border-box" placeholder="word word word word word word word word word word word word word word word word word word word word word word word word"></textarea>
    <div id="sync-restore-dialog-msg" role="status" aria-live="polite" style="font-size:11px;color:var(--text-muted);margin-top:6px;min-height:14px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="confirm-btn confirm-btn-cancel" data-sync-action="close-restore-dialog">Cancel</button>
      <button id="sync-restore-dialog-go" class="import-btn import-btn-primary" style="padding:8px 16px;font-size:13px" data-sync-action="confirm-restore">Restore &amp; reload</button>
    </div>
  </div>`;
  openModalOverlay(overlay, { initialFocus: '#sync-restore-dialog-input', focusDelay: 50 });
  const input = document.getElementById('sync-restore-dialog-input');
  updateRestoreMnemonicDialogState(input instanceof HTMLTextAreaElement ? input : null);
}

/** @param {HTMLTextAreaElement | null} [input] */
export function updateRestoreMnemonicDialogState(
  input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('sync-restore-dialog-input')),
) {
  const msg = document.getElementById('sync-restore-dialog-msg');
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('sync-restore-dialog-go'));
  if (!input) return;
  const raw = (input.value || '').trim();
  if (!raw) {
    if (msg) { msg.textContent = ''; msg.style.color = 'var(--text-muted)'; }
    if (btn) btn.disabled = true;
    return;
  }
  const words = raw.split(/\s+/);
  if (words.length === 24) {
    if (msg) { msg.textContent = '✓ 24 words detected'; msg.style.color = 'var(--green, #22c55e)'; }
    if (btn) btn.disabled = false;
  } else {
    if (msg) { msg.textContent = `${words.length} word${words.length === 1 ? '' : 's'} so far — need exactly 24`; msg.style.color = '#fbbf24'; }
    if (btn) btn.disabled = true;
  }
}

export function closeRestoreMnemonicDialog() {
  closeModalOverlay('sync-restore-overlay');
}
