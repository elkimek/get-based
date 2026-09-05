// @ts-check
// settings-sync-panel-render.js — Cross-device sync settings state markup.

import { escapeAttr, escapeHTML } from './utils.js';
import {
  getSyncBlocker,
  getSyncRelay,
  isSyncConfigured,
  isSyncEnabled,
  isSyncPaused,
} from './sync.js';

/** @param {() => any[]} listPendingTombstones */
function renderPendingTombstones(listPendingTombstones) {
  const pending = listPendingTombstones() || [];
  if (pending.length === 0) return '';
  const rows = pending.map(p => `
    <div class="sync-tombstone-row" data-tomb-id="${escapeAttr(p.id)}">
      <span class="sync-tombstone-name">${escapeHTML(p.name)}</span>
      <span class="sync-tombstone-meta">${p.at ? `flagged ${new Date(p.at).toLocaleDateString()}` : ''}</span>
      <button class="sync-tombstone-btn sync-tombstone-apply" data-sync-action="apply-tombstone" data-tomb-id="${escapeAttr(p.id)}">Apply delete</button>
      <button class="sync-tombstone-btn sync-tombstone-reject" data-sync-action="reject-tombstone" data-tomb-id="${escapeAttr(p.id)}">Restore</button>
    </div>`).join('');
  return `
    <div class="sync-tombstone-banner">
      <div class="sync-tombstone-head">
        <strong>${pending.length} profile${pending.length === 1 ? '' : 's'} flagged for deletion on another device</strong>
        <span class="sync-tombstone-help">Confirm each — Apply wipes locally, Restore re-publishes.</span>
      </div>
      ${rows}
    </div>`;
}

/** @param {() => any[]} listPendingTombstones */
export function renderSyncSectionMarkup(listPendingTombstones) {
  const enabled = isSyncEnabled();
  const configured = isSyncConfigured();
  const paused = isSyncPaused();
  const relay = getSyncRelay();
  const blocker = getSyncBlocker();
  const enableDisabled = blocker && !configured ? 'disabled' : '';
  const toggleDisabled = blocker && !enabled ? 'disabled' : '';
  const blockerBanner = blocker ? `
    <div style="margin-bottom:16px;padding:10px 12px;border:1px solid #fbbf24;background:rgba(251,191,36,0.08);border-radius:6px;color:#fbbf24;font-size:12px;line-height:1.45">
      <strong>Sync unavailable in this browser.</strong><br>
      ${escapeHTML(blocker)}
    </div>` : '';
  return `
    ${blockerBanner}
    ${renderPendingTombstones(listPendingTombstones)}
    <div class="sync-settings-head">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text-primary)">Cross-device sync</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">E2E encrypted via Evolu CRDT</div>
      </div>
      <div class="sync-settings-state">
        <span class="sync-settings-badge ${enabled ? 'is-enabled' : paused ? 'is-paused' : ''}">${enabled ? 'Enabled' : paused ? 'Paused' : 'Off'}</span>
        <label class="chat-websearch-toggle-label sync-settings-toggle">
          <input type="checkbox" aria-label="Toggle cross-device sync" ${enabled ? 'checked' : ''} data-sync-action="toggle-sync" ${toggleDisabled}>
          <span class="chat-toggle-slider sync-settings-toggle-slider"></span>
        </label>
      </div>
    </div>
    ${enabled ? `
      <div id="sync-relay-status" style="display:flex;align-items:center;gap:6px;margin-bottom:16px">
        <span id="sync-status-dot" style="width:8px;height:8px;border-radius:50%;background:var(--text-muted);display:inline-block"></span>
        <span id="sync-status-text" style="font-size:12px;color:var(--text-muted)">Checking relay...</span>
      </div>

      <div class="sync-identity-card" aria-labelledby="sync-identity-label">
        <div class="sync-identity-card-head">
          <div>
            <div id="sync-identity-label" class="sync-identity-label">Sync identity</div>
            <div id="sync-identity-code" class="sync-identity-code" aria-live="polite">Resolving…</div>
          </div>
          <button id="sync-identity-copy" class="import-btn import-btn-secondary sync-identity-copy" data-sync-action="copy-identity-code" aria-label="Copy Sync identity code" disabled>Copy</button>
        </div>
        <div class="sync-identity-help">Compare this code on your devices. Matching codes mean the same 24-word Data Sync identity is active.</div>
        <div class="sync-identity-safety"><span aria-hidden="true">✓</span> Safe to compare — this code doesn’t grant access to your data</div>
      </div>

      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary)">Your mnemonic</label>
          <div style="display:flex;gap:6px">
            <button id="sync-mnemonic-toggle" class="import-btn import-btn-secondary" style="font-size:11px;padding:2px 10px" data-sync-action="toggle-mnemonic" aria-label="Show mnemonic">Show</button>
            <button class="import-btn import-btn-secondary" style="font-size:11px;padding:2px 10px" data-sync-action="copy-mnemonic" aria-label="Copy mnemonic">Copy</button>
          </div>
        </div>
        <div id="sync-mnemonic" data-masked="true" style="font-family:var(--font-mono, monospace);font-size:11.5px;background:var(--bg-secondary);padding:10px 12px;border-radius:8px;border:1px solid var(--border);word-break:break-word;line-height:1.6;min-height:20px;user-select:none" aria-label="Mnemonic phrase">Loading...</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px">These words are your encryption key. Store them offline. Never share them.</div>
      </div>

      <div class="sync-management-actions">
        <button class="import-btn import-btn-secondary" data-sync-action="open-restore-dialog">Restore / switch identity…</button>
        <button class="import-btn import-btn-secondary" data-sync-action="pause-sync">Pause on this device</button>
      </div>
      <div class="sync-management-help">Pausing keeps this identity and queues local changes for the next resume. Restoring switches this device to another 24-word identity.</div>
      <button class="import-btn import-btn-secondary" style="font-size:12px;padding:7px 14px;width:100%;margin:12px 0 10px" data-sync-action="show-sync-diagnose">Sync status &amp; storage</button>

      <details style="margin-bottom:8px">
        <summary style="font-size:12px;color:var(--text-muted);cursor:pointer;user-select:none">Relay &amp; device options</summary>
        <div style="margin-top:8px">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Relay server</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="sync-relay-input" value="${escapeAttr(relay)}" style="flex:1;font-size:12px;border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);padding:6px 10px;font-family:var(--font-mono, monospace)" placeholder="wss://...">
            <button class="import-btn import-btn-secondary" style="font-size:12px;padding:4px 12px" data-sync-action="save-relay">Save</button>
          </div>
          <button class="import-btn import-btn-secondary sync-disable-btn" style="font-size:12px;padding:5px 14px;width:100%;margin-top:8px" data-sync-action="disconnect-sync">Disconnect &amp; reset sync on this device</button>
          <div class="sync-management-help" style="margin-top:6px">Disconnecting forgets this device’s sync identity and local sync history. Your profile data and relay data are not deleted.</div>
        </div>
      </details>
    ` : `
      ${paused ? `
        <div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:12px">
          Sync is paused on this device. The identity and sync history are retained, and local edits will be uploaded before remote changes are applied when you resume.
        </div>
        <div class="sync-setup-actions">
          <button class="import-btn import-btn-primary" data-sync-action="resume-sync" ${blocker ? 'disabled' : ''}>Resume sync</button>
          <button class="import-btn import-btn-secondary sync-disable-btn" data-sync-action="disconnect-sync">Disconnect &amp; reset sync</button>
        </div>
        <div class="sync-management-help">Disconnect only if you want this device to forget the current sync identity. Keep your 24-word mnemonic before disconnecting.</div>
      ` : `
        <div style="font-size:12px;color:var(--text-muted);line-height:1.5">
          Sync profiles, lab data, and AI settings across your devices. Data is encrypted with a key derived from a 24-word mnemonic — the relay server only sees ciphertext.
        </div>
        <div class="sync-setup-actions">
          <button class="import-btn import-btn-primary" data-sync-action="setup-new-direct" ${enableDisabled}>Set up new sync</button>
          <button class="import-btn import-btn-secondary" data-sync-action="setup-restore-direct" ${enableDisabled}>Join existing device</button>
        </div>
        <div class="sync-management-help">Choose <b>Join existing device</b> if another device already has sync enabled. You will need its 24-word mnemonic.</div>
      `}
    `}
  `;
}
