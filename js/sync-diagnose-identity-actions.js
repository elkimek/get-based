// sync-diagnose-identity-actions.js - Identity rotation UI for Sync Diagnose.

import { showNotification, escapeHTML } from './utils.js';
import { ensureBip39, ensureQRCode } from './sync-identity.js';
import {
  currentSyncEnabled,
  enableSyncForDiagnose,
  restoreMnemonicForDiagnose,
} from './sync-diagnose-actions-context.js';

// "Rotate identity" - generate a fresh 24-word BIP-39 mnemonic, show
// it (with QR for cross-device entry), confirm the user saved it, then
// apply locally via restoreFromMnemonic. The new ownerId is fresh on
// the relay (no ghost state from any prior Evolu silent-reject), so
// pushes start landing immediately. The other devices need to enter
// the same mnemonic to converge.
export async function confirmRotateIdentity(btn) {
  // Stage 1: warning dialog. Make sure the user understands the
  // implications BEFORE we generate a fresh mnemonic.
  const warning =
    "Rotate sync identity — generate a fresh 24-word mnemonic for this device and apply it.\n\n" +
    "• You'll need to enter the new mnemonic on every OTHER device that should keep syncing with this one.\n" +
    "• The old identity's data stays on the relay until it ages out (no immediate loss), but new pushes will go under the new identity.\n" +
    "• This is the recovery path for a wedged owner (red dot above) — see the 2026-05-11 silent-reject bug.\n\n" +
    "Proceed?";
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(warning)
    : true;
  if (!proceed) return;

  // Stage 2: generate the new mnemonic. BIP-39 256 bits = 24 words.
  const bip39 = await ensureBip39().catch(() => null);
  if (!bip39 || typeof bip39.generateMnemonic !== 'function') {
    showNotification('BIP-39 library not loaded — cannot rotate identity', 'error');
    return;
  }
  let mnemonic;
  try {
    mnemonic = await bip39.generateMnemonic(256);
  } catch (e) {
    showNotification(`Mnemonic generation failed: ${e?.message || e}`, 'error');
    return;
  }
  if (typeof mnemonic !== 'string' || mnemonic.split(/\s+/).filter(Boolean).length !== 24) {
    showNotification('Generated mnemonic is malformed (expected 24 words)', 'error');
    return;
  }

  // Stage 3: present to the user. Show in a dedicated modal with QR for
  // phone-side entry, copy button, and a save-confirmation checkbox
  // that gates the Apply button.
  const existing = btn?.closest?.('.modal-overlay');
  if (existing) existing.remove();

  let qrSvg = '';
  try {
    const makeQr = await ensureQRCode();
    const qr = makeQr(0, 'L');
    qr.addData(mnemonic);
    qr.make();
    qrSvg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  } catch (e) {
    // Non-fatal; the user can still copy-paste.
    qrSvg = '';
  }

  const words = mnemonic.split(/\s+/).filter(Boolean);
  const wordsHtml = words
    .map((w, i) => `<span style="display:inline-flex;align-items:baseline;gap:4px;padding:2px 6px;background:var(--surface);border-radius:4px;font-family:monospace;font-size:12px"><span style="color:var(--text-muted);font-size:10px">${i + 1}.</span>${escapeHTML(w)}</span>`)
    .join(' ');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Rotate sync identity" style="max-width:560px">
    <div class="modal-header"><h3>Rotate sync identity — save your new mnemonic</h3><button class="modal-close" aria-label="Close">×</button></div>
    <div class="modal-body" style="font-size:13px">
      <div style="margin-bottom:12px;padding:8px;border:1px solid var(--red);border-radius:6px;background:rgba(255,80,80,0.08)">
        <div style="font-weight:600;margin-bottom:4px">⚠ Save this BEFORE you click Apply</div>
        <div style="font-size:12px;color:var(--text-muted)">Losing this 24-word mnemonic means losing your new cross-device sync identity — there is no recovery path. Save it in a password manager AND enter it on every device that should keep syncing.</div>
      </div>
      <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:12px">
        ${qrSvg ? `<div style="flex-shrink:0;background:#fff;padding:8px;border-radius:8px;width:180px;height:180px">${qrSvg}</div>` : ''}
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">${qrSvg ? 'Scan from another device, or copy the words below.' : 'Copy the words below — QR code unavailable on this build.'}</div>
          <div id="rotate-words" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${wordsHtml}</div>
          <button class="import-btn import-btn-secondary" id="rotate-copy-btn" style="font-size:11px">Copy mnemonic</button>
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;cursor:pointer;font-size:12px">
        <input type="checkbox" id="rotate-saved-check"/>
        <span>I've saved this mnemonic in a safe place (password manager or written down).</span>
      </label>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="import-btn import-btn-secondary" id="rotate-cancel-btn">Cancel</button>
        <button class="import-btn import-btn-primary" id="rotate-apply-btn" disabled>Apply on this device</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('.modal-close');
  const cancelBtn = overlay.querySelector('#rotate-cancel-btn');
  const copyBtn = overlay.querySelector('#rotate-copy-btn');
  const check = overlay.querySelector('#rotate-saved-check');
  const applyBtn = overlay.querySelector('#rotate-apply-btn');
  const cleanup = () => {
    mnemonic = null;
    if (Array.isArray(words)) {
      words.fill('');
      words.length = 0;
    }
    overlay.remove();
  };
  closeBtn?.addEventListener('click', cleanup);
  cancelBtn?.addEventListener('click', cleanup);
  copyBtn?.addEventListener('click', async () => {
    const text = words.join(' ');
    const fallbackCopy = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    };
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          fallbackCopy();
        }
      } else {
        fallbackCopy();
      }
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => { if (copyBtn) copyBtn.textContent = 'Copy mnemonic'; }, 1500);
    } catch {
      showNotification('Copy failed — select the words manually', 'error');
    }
  });
  check?.addEventListener('change', () => {
    if (applyBtn) applyBtn.disabled = !check.checked;
  });
  applyBtn?.addEventListener('click', async () => {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Applying…';
    try {
      if (!currentSyncEnabled()) {
        await enableSyncForDiagnose({ skipPush: true });
      }
      const ok = await restoreMnemonicForDiagnose(words.join(' '));
      if (!ok) {
        showNotification('Restore returned false — generated mnemonic was rejected', 'error');
        applyBtn.disabled = false;
        applyBtn.textContent = 'Apply on this device';
        return;
      }
    } catch (e) {
      showNotification(`Apply failed: ${e?.message || e}`, 'error');
      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply on this device';
    }
  });
}
