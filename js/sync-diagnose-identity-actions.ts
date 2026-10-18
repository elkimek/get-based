import type { SyncDiagnoseActionElement } from './sync-diagnose-actions-context.js';
// sync-diagnose-identity-actions.js - Identity rotation UI for Sync Diagnose.

import { getErrorMessage } from './caught-error.js';
import { showNotification } from './utils.js';
import { renderSyncIdentityRotation, type GeneratedIdentityQR } from './sync-diagnose-identity-presentation.js';
import { ensureBip39, ensureQRCode } from './sync-identity.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import {
  currentSyncEnabled,
  enableSyncForDiagnose,
  restoreMnemonicForDiagnose,
} from './sync-diagnose-actions-context.js';
import { confirmSyncDiagnoseActionRuntime } from './sync-diagnose-runtime.js';

// "Rotate identity" - generate a fresh 24-word BIP-39 mnemonic, show
// it (with QR for cross-device entry), confirm the user saved it, then
// apply locally via restoreFromMnemonic. The new ownerId is fresh on
// the relay (no ghost state from any prior Evolu silent-reject), so
// pushes start landing immediately. The other devices need to enter
// the same mnemonic to converge.
export async function confirmRotateIdentity(btn?: SyncDiagnoseActionElement | null) {
  // Stage 1: warning dialog. Make sure the user understands the
  // implications BEFORE we generate a fresh mnemonic.
  const warning =
    "Rotate sync identity — generate a fresh 24-word mnemonic for this device and apply it.\n\n" +
    "• You'll need to enter the new mnemonic on every OTHER device that should keep syncing with this one.\n" +
    "• The old identity's data stays on the relay until it ages out (no immediate loss), but new pushes will go under the new identity.\n" +
    "• This is the recovery path when this device's relay-health check shows wedged (red dot above).\n\n" +
    "Proceed?";
  const proceed = await confirmSyncDiagnoseActionRuntime(warning);
  if (!proceed) return;

  // Stage 2: generate the new mnemonic. BIP-39 256 bits = 24 words.
  const bip39 = await ensureBip39().catch(() => null);
  if (!bip39 || typeof bip39.generateMnemonic !== 'function') {
    showNotification('BIP-39 library not loaded — cannot rotate identity', 'error');
    return;
  }
  let mnemonic: string | null;
  try {
    mnemonic = await bip39.generateMnemonic(256);
  } catch (e) {
    showNotification(`Mnemonic generation failed: ${getErrorMessage(e, e)}`, 'error');
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
  if (existing) {
    closeModalOverlay(existing);
    existing.remove();
  }

  let qrSvg: GeneratedIdentityQR | '' = '';
  try {
    const makeQr = await ensureQRCode();
    const qr = makeQr(0, 'L');
    qr.addData(mnemonic);
    qr.make();
    qrSvg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true }) as GeneratedIdentityQR;
  } catch (e) {
    // Non-fatal; the user can still copy-paste.
    qrSvg = '';
  }

  const words = mnemonic.split(/\s+/).filter(Boolean);
  const rotationHTML = renderSyncIdentityRotation(words, qrSvg);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = rotationHTML;
  document.body.appendChild(overlay);
  openModalOverlay(overlay);

  const closeBtn = (overlay.querySelector('.modal-close') as HTMLButtonElement | null);
  const cancelBtn = (overlay.querySelector('#rotate-cancel-btn') as HTMLButtonElement | null);
  const copyBtn = (overlay.querySelector('#rotate-copy-btn') as HTMLButtonElement | null);
  const check = (overlay.querySelector('#rotate-saved-check') as HTMLInputElement | null);
  const applyBtn = (overlay.querySelector('#rotate-apply-btn') as HTMLButtonElement | null);
  const cleanup = () => {
    mnemonic = null;
    if (Array.isArray(words)) {
      words.fill('');
      words.length = 0;
    }
    closeModalOverlay(overlay);
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
      copyBtn!.textContent = '✓ Copied';
      setTimeout(() => { if (copyBtn) copyBtn.textContent = 'Copy mnemonic'; }, 1500);
    } catch {
      showNotification('Copy failed — select the words manually', 'error');
    }
  });
  check?.addEventListener('change', () => {
    if (applyBtn) applyBtn.disabled = !check!.checked;
  });
  applyBtn?.addEventListener('click', async () => {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Applying…';
    try {
      if (!currentSyncEnabled()) {
        await enableSyncForDiagnose({ skipPush: true });
      }
      const ok = await restoreMnemonicForDiagnose(words.join(' '), { seedLocal: true });
      if (!ok) {
        showNotification('Restore returned false — generated mnemonic was rejected', 'error');
        applyBtn.disabled = false;
        applyBtn.textContent = 'Apply on this device';
        return;
      }
      showNotification('Sync identity rotated. Enter the new mnemonic on your other devices to keep them syncing.', 'success');
      cleanup();
      return;
    } catch (e) {
      showNotification(`Apply failed: ${getErrorMessage(e, e)}`, 'error');
      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply on this device';
    }
  });
}
