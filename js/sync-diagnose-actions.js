// sync-diagnose-actions.js - Sync Diagnose operational action handlers.

import { state } from './state.js';
import { showNotification, escapeHTML } from './utils.js';
import {
  clearDeltaSnapshot, getDeltaCutoverReadiness, getDeltaTelemetry,
  resetDeltaTelemetry,
} from './sync-delta.js';
import { ensureBip39, ensureQRCode } from './sync-identity.js';
import {
  compactOwnerSelfServe, fetchOwnerStorageFromRelay, getRelayQuotaEstimate,
} from './sync-relay-health.js';
import { logSyncEvent } from './sync-state.js';
import { toggleSyncDetail } from './sync-ui.js';

let _enableSync = async () => false;
let _restoreFromMnemonic = async () => false;
let _isSyncEnabled = () => false;
let _pushProfile = async () => {};
let _enablePhase2Cutover = () => ({ ok: false, reason: 'unconfigured' });
let _disablePhase2Cutover = () => false;
let _showSyncDiagnose = async () => {};

export function configureSyncDiagnoseActions({
  enableSync,
  restoreFromMnemonic,
  isSyncEnabled,
  pushProfile,
  enablePhase2Cutover,
  disablePhase2Cutover,
  showSyncDiagnose,
} = {}) {
  if (typeof enableSync === 'function') _enableSync = enableSync;
  if (typeof restoreFromMnemonic === 'function') _restoreFromMnemonic = restoreFromMnemonic;
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof pushProfile === 'function') _pushProfile = pushProfile;
  if (typeof enablePhase2Cutover === 'function') _enablePhase2Cutover = enablePhase2Cutover;
  if (typeof disablePhase2Cutover === 'function') _disablePhase2Cutover = disablePhase2Cutover;
  if (typeof showSyncDiagnose === 'function') _showSyncDiagnose = showSyncDiagnose;
}

function currentSyncEnabled() {
  try { return !!_isSyncEnabled?.(); } catch { return false; }
}

// "Compact storage" - calls POST /self/compact-owner on the relay,
// HMAC-signed with the user's own writeKey. Drops every Evolu message
// row for this owner and zeroes storedBytes; devices re-establish their
// state on the next push. Replaces the old "I just compacted" runbook
// flow that required SSH access and a manual local-counter reset.
export async function confirmCompactRelay(btn) {
  const q = getRelayQuotaEstimate();
  const mb = q ? (q.bytes / 1024 / 1024).toFixed(1) : '?';
  const message = `Compact this owner's storage on the relay (currently ~${mb} MB)? Drops the Evolu message log; every device re-establishes its CRDT state on the next push (a few seconds). Your local data is untouched.`;
  // Helper unavailable (utils.js failed to load) -> proceed without
  // confirmation rather than dead-end the user. Safety net mirrors the
  // pattern in the four sibling confirm* helpers below.
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(message)
    : true;
  if (!proceed) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Compacting…'; }
  try {
    const result = await compactOwnerSelfServe();
    const after = typeof result?.afterStoredBytes === 'number'
      ? `${(result.afterStoredBytes / (1024 * 1024)).toFixed(2)} MB`
      : '0 MB';
    showNotification(`Relay storage compacted · ${result?.deletedMessages ?? '?'} rows dropped · ${after}`, 'success');
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) overlay.remove();
    }
    if (document.getElementById('sync-popover')) {
      toggleSyncDetail(); toggleSyncDetail();
    }
  } catch (e) {
    showNotification(`Compact failed: ${e?.message || e}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Compact storage'; }
  }
}

// "Refresh" - probe /self/owner-storage for the relay's authoritative
// storedBytes for this owner. Mirrors into the local cache so the
// indicator is accurate, not an estimate. Useful after the maintainer
// or another device has compacted.
export async function refreshRelayStorage(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Refreshing…'; }
  try {
    const result = await fetchOwnerStorageFromRelay();
    if (!result) {
      showNotification('Could not reach relay storage probe (older relay or offline?)', 'error');
      return;
    }
    showNotification(`Relay reports ${(result.storedBytes / (1024 * 1024)).toFixed(2)} MB`, 'success');
    if (document.getElementById('sync-popover')) {
      toggleSyncDetail(); toggleSyncDetail();
    }
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) {
        // Re-render the modal in place - close and reopen via the same
        // entrypoint so all sections (including the now-fresh quota
        // tile) re-derive from the updated cache.
        overlay.remove();
        _showSyncDiagnose();
      }
    }
  } catch (e) {
    showNotification(`Refresh failed: ${e?.message || e}`, 'error');
  } finally {
    if (btn && !btn.closest?.('.modal-overlay')?.parentElement) return;
    if (btn) { btn.disabled = false; btn.textContent = 'Refresh'; }
  }
}

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
        await _enableSync({ skipPush: true });
      }
      const ok = await _restoreFromMnemonic(words.join(' '));
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

// "Reset window" - drops the rolling per-push telemetry log so the user
// can start a fresh measurement window.
export async function confirmResetDeltaTelemetry(btn) {
  const t = state.currentProfile ? getDeltaTelemetry(state.currentProfile) : null;
  const n = t?.summary?.count || 0;
  const message = `Reset the push-efficiency log? Drops the ${n} recent push entries used to compute the percentage. Your data and relay state aren't touched.`;
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(message)
    : true;
  if (!proceed) return;
  if (state.currentProfile && resetDeltaTelemetry(state.currentProfile)) {
    try { showNotification('Telemetry window reset', 'success'); } catch {}
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) overlay.remove();
    }
  } else {
    try { showNotification('Could not reset telemetry (no active profile?)', 'error'); } catch {}
  }
}

// "Enable Phase 2" - flips the fat-blob off for this profile on this
// device. Gated behind getDeltaCutoverReadiness READY.
export async function confirmEnablePhase2(btn) {
  if (!state.currentProfile) return;
  const r = getDeltaCutoverReadiness(state.currentProfile);
  if (!r?.ready) {
    try { showNotification('Phase 2 not ready — resolve blockers first', 'error'); } catch {}
    return;
  }
  const message = `Switch this device to lean sync mode?\n\nFrom now on, this device will only push per-row deltas instead of the full data blob. Other devices keep working normally.\n\nReversible any time via Disable.`;
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(message)
    : true;
  if (!proceed) return;
  const result = _enablePhase2Cutover(state.currentProfile);
  if (result.ok) {
    try { showNotification('Phase 2 enabled — next push will use per-row only', 'success'); } catch {}
    logSyncEvent('cutover', `Phase 2 enabled for ${state.currentProfile.slice(0, 8)}`);
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) overlay.remove();
    }
  } else {
    try { showNotification(`Could not enable Phase 2 (${result.reason})`, 'error'); } catch {}
  }
}

// "Backfill blockers" - wipes the per-array snapshot for every surface
// flagged 'missing-rows' so the next push emits inserts for every local
// item from scratch. Then forces a push.
export async function confirmBackfillBlockers(btn) {
  if (!state.currentProfile) return;
  const profileId = state.currentProfile;
  const r = getDeltaCutoverReadiness(profileId);
  const blockers = Object.entries(r?.surfaces || {}).filter(([, v]) => v.status === 'missing-rows').map(([n]) => n);
  if (blockers.length === 0) {
    try { showNotification('No blockers to backfill', 'success'); } catch {}
    return;
  }
  const message = `Force a push for ${blockers.length} item${blockers.length === 1 ? '' : 's'} that haven't synced as deltas yet?\n\n${blockers.join(', ')}\n\nSafe — this just re-sends data that should already be on the relay.`;
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(message)
    : true;
  if (!proceed) return;
  let cleared = 0;
  for (const name of blockers) {
    if (clearDeltaSnapshot(profileId, name)) cleared++;
  }
  try { await _pushProfile(profileId, state.importedData, { force: true }); } catch (e) {
    try { showNotification(`Backfill push failed: ${e?.message || e}`, 'error'); } catch {}
    return;
  }
  try { showNotification(`Backfilled ${cleared} surface${cleared === 1 ? '' : 's'} — re-open Diagnose to verify`, 'success'); } catch {}
  logSyncEvent('backfill', `Backfilled ${cleared} surface(s) for ${profileId.slice(0, 8)}: ${blockers.join(',')}`);
  if (btn) {
    const overlay = btn.closest?.('.modal-overlay');
    if (overlay) overlay.remove();
  }
}

export async function confirmDisablePhase2(btn) {
  if (!state.currentProfile) return;
  const message = `Switch this device back to full-blob sync?\n\nPushes will include the full data blob again as a safety net. Use this if a peer device is missing data after going lean.\n\nNo data loss either way.`;
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(message)
    : true;
  if (!proceed) return;
  if (_disablePhase2Cutover(state.currentProfile)) {
    try { showNotification('Phase 2 disabled — back to dual-write', 'success'); } catch {}
    logSyncEvent('cutover', `Phase 2 disabled for ${state.currentProfile.slice(0, 8)}`);
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) overlay.remove();
    }
  } else {
    try { showNotification('Could not disable Phase 2', 'error'); } catch {}
  }
}
