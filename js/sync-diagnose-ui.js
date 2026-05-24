// sync-diagnose-ui.js - Sync Diagnose modal rendering and action handlers.

import { state } from './state.js';
import { showNotification, isDebugMode, escapeHTML } from './utils.js';
import { _evoluDiagnosticsText, getEvoluDiagnostics } from './sync-diagnostics.js';
import {
  clearDeltaSnapshot, getDeltaCutoverReadiness, getDeltaTelemetry,
  resetDeltaTelemetry,
} from './sync-delta.js';
import { ensureBip39, ensureQRCode } from './sync-identity.js';
import {
  compactOwnerSelfServe, fetchOwnerStorageFromRelay, getRelayQuotaEstimate,
  verifyPushLanded,
} from './sync-relay-health.js';
import { logSyncEvent } from './sync-state.js';
import { toggleSyncDetail } from './sync-ui.js';

let _enableSync = async () => false;
let _restoreFromMnemonic = async () => false;
let _isSyncEnabled = () => false;
let _pushProfile = async () => {};
let _enablePhase2Cutover = () => ({ ok: false, reason: 'unconfigured' });
let _disablePhase2Cutover = () => false;
let _isPhase2CutoverEnabled = () => false;

export function configureSyncDiagnoseUI({
  enableSync,
  restoreFromMnemonic,
  isSyncEnabled,
  pushProfile,
  enablePhase2Cutover,
  disablePhase2Cutover,
  isPhase2CutoverEnabled,
} = {}) {
  if (typeof enableSync === 'function') _enableSync = enableSync;
  if (typeof restoreFromMnemonic === 'function') _restoreFromMnemonic = restoreFromMnemonic;
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof pushProfile === 'function') _pushProfile = pushProfile;
  if (typeof enablePhase2Cutover === 'function') _enablePhase2Cutover = enablePhase2Cutover;
  if (typeof disablePhase2Cutover === 'function') _disablePhase2Cutover = disablePhase2Cutover;
  if (typeof isPhase2CutoverEnabled === 'function') _isPhase2CutoverEnabled = isPhase2CutoverEnabled;
}

function currentSyncEnabled() {
  try { return !!_isSyncEnabled?.(); } catch { return false; }
}

// Read-only modal that dumps Evolu's local state - both devices should
// show the same `ownerId` / `mnemonicPrefix`. If they differ, the two
// devices are talking to different Evolu owners and will never see each
// other's data despite using the same relay URL.
export async function showSyncDiagnose() {
  const d = await getEvoluDiagnostics();
  // Probe the relay so we can render a fresh "is the relay actually
  // persisting my pushes?" verdict. verifyPushLanded compares a stored
  // baseline against the relay's current state - if storedBytes /
  // messageCount / lastWriteToken haven't moved since the last probe,
  // the verdict is 'wedged'. First call this session is 'unknown' (just
  // seeds the baseline). Best-effort: any error path resolves to a
  // 'unknown' verdict, never blocks modal rendering.
  let healthVerdict = { verdict: 'unknown', at: 0, reason: null };
  try { healthVerdict = await verifyPushLanded(); } catch {}
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  const rowsHtml = d.rows.length
    ? d.rows.map(r => {
        const pidCell = escapeHTML(r.profileId || '?');
        // Mark a profileId pulled from the payload (column was empty) so
        // a divergence between desktop + phone diagnose tables is legible.
        const pidNote = r.profileIdSource === 'payload' ? ' <span style="color:var(--orange);font-size:10px" title="profileId column empty; recovered from payload">*</span>' : '';
        const fmtCell = r.format === 'gz' ? '<span title="gzip envelope (v1.6.4)" style="color:var(--green)">gz</span>' : 'plain';
        const delCell = r.isDeleted ? '<span style="color:var(--orange);font-weight:600">yes</span>' : 'no';
        return `<tr><td style="padding:4px 8px;font-family:monospace;font-size:11px">${pidCell}${pidNote}</td><td style="padding:4px 8px;text-align:right;font-size:11px">${delCell}</td><td style="padding:4px 8px;font-family:monospace;font-size:11px;color:var(--text-muted)">${r.syncedAtMs}</td><td style="padding:4px 8px;text-align:right">${r.sun}</td><td style="padding:4px 8px;text-align:right">${r.dev}</td><td style="padding:4px 8px;text-align:right;color:var(--text-muted);font-size:11px">${r.bytes}b</td><td style="padding:4px 8px;text-align:right;font-size:11px">${fmtCell}</td></tr>`;
      }).join('')
    : '<tr><td colspan="7" style="padding:8px;color:var(--text-muted);text-align:center">No rows in local Evolu DB</td></tr>';
  // Stash diagnostics text on the modal node so the Copy button can read
  // the same snapshot the user is staring at (avoids racing a re-fetch).
  const copyText = _evoluDiagnosticsText(d);
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Sync diagnose" style="max-width:640px">
    <div class="modal-header"><h3>Sync diagnose</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button></div>
    <div class="modal-body" style="font-size:13px">
      <div style="margin-bottom:12px">
        <div><b>Sync enabled:</b> ${d.syncEnabled ? 'yes' : 'no'}</div>
        <div><b>Relay:</b> <span style="font-family:monospace;font-size:11px;word-break:break-all">${escapeHTML(d.relay || '—')}</span></div>
        <div><b>Owner ID:</b> <span style="font-family:monospace;font-size:11px">${escapeHTML(d.ownerId || '— (not initialized)')}</span></div>
        <div><b>Mnemonic prefix:</b> <span style="font-family:monospace;font-size:11px">${escapeHTML(d.mnemonicPrefix || '—')}</span></div>
        <div style="color:var(--text-muted);font-size:11px;margin-top:6px">If two devices show different Owner ID or Mnemonic prefix, they are using different identities and will never see each other's data even on the same relay.</div>
      </div>
      <div style="margin-bottom:12px">
        <div><b>Active profile (this device):</b> <span style="font-family:monospace;font-size:11px">${escapeHTML(d.activeProfileId || '?')}</span></div>
        <div>In-memory state: sunSessions=${d.activeImported.sunSessions} lightDevices=${d.activeImported.lightDevices}</div>
      </div>
      ${(() => {
        // Sync health - relays >= 1.2.3 surface messageCount + lastWriteToken
        // on /self/owner-storage, letting us verify "did the relay actually
        // persist my push?" without operator help. Three-state verdict:
        //   healthy  -> relay advanced; push landed (green dot)
        //   wedged   -> relay didn't advance; push silently dropped (red dot)
        //   unknown  -> couldn't compare (old relay, offline, first call) - render dim
        const v = healthVerdict?.verdict || 'unknown';
        if (v === 'unknown') {
          // Hide the tile when we genuinely don't know - avoids confusing
          // the user with "Unknown ✓" or similar. The relay-storage tile
          // above already covers the basics. We re-render with a real
          // verdict on the user's next open of this modal.
          return '';
        }
        const isHealthy = v === 'healthy';
        const color = isHealthy ? 'var(--green)' : 'var(--red)';
        const label = isHealthy ? 'Healthy — relay is persisting your pushes.' : 'Wedged — relay accepted the WebSocket round-trip but didn\'t persist anything.';
        const detail = isHealthy
          ? 'Last verified ' + new Date(healthVerdict.at).toISOString().slice(11, 19) + 'Z. Storage state has advanced since the previous check.'
          : (healthVerdict.reason || 'No relay-side advance observed since the previous check.');
        const recovery = isHealthy ? '' : '<div style="color:var(--text-muted);font-size:11px;margin-top:6px">This is the Evolu silent-reject pattern (2026-05-11 production incident). The fix is identity rotation — generate a fresh 24-word mnemonic and restore the other devices to it. See <a href="https://docs.getbased.health/guides/cross-device-sync" target="_blank" style="color:var(--accent)">cross-device sync docs</a>.</div>';
        return `<div style="margin-bottom:12px;padding:10px;border:1px solid var(--border);border-radius:6px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color}"></span>
            <b>Relay sync health:</b>
            <span style="color:${color};font-weight:600">${escapeHTML(label)}</span>
          </div>
          <div style="color:var(--text-muted);font-size:11px">${escapeHTML(detail)}</div>
          ${recovery}
        </div>`;
      })()}
      ${(() => {
        const q = getRelayQuotaEstimate();
        if (!q) return '';
        const mb = (q.bytes / (1024 * 1024)).toFixed(2);
        const capMb = (q.cap / (1024 * 1024)).toFixed(0);
        const color = q.level === 'red' ? 'var(--red)' : q.level === 'amber' ? 'var(--orange)' : 'var(--green)';
        const note = q.level === 'red'
          ? 'Storage almost full — pushes will start silently rejecting at the cap. Use Compact storage to drop the older Evolu message log; clients re-establish their state on the next push.'
          : q.level === 'amber'
          ? 'Approaching the per-account storage cap. No action needed yet — keeps trimming on its own as data ages.'
          : 'Healthy.';
        // Real self-serve compact via /self/compact-owner (HMAC-authed
        // with the user's own writeKey - no admin token, no SSH, no
        // round-trip to the maintainer). Always shown so any user can
        // unwedge themselves at the cap, not just operators with relay
        // access. Refresh hits /self/owner-storage to replace the local
        // estimate with the relay's authoritative storedBytes.
        const buttons = `
          <button class="ctx-btn-option" style="font-size:11px" onclick="window.refreshRelayStorage(this)" title="Probe the relay for the actual storedBytes for this owner — replaces the local estimate.">Refresh</button>
          <button class="ctx-btn-option" style="font-size:11px" onclick="window.confirmCompactRelay(this)" title="Drops every Evolu message row for this owner on the relay and resets storedBytes to 0. Devices re-establish their state on the next push.">Compact storage</button>
          <button class="ctx-btn-option" style="font-size:11px" onclick="window.confirmRotateIdentity(this)" title="Generate a fresh 24-word mnemonic for this owner. Use when the relay-health verdict above shows 'wedged' (silent-reject pattern). You'll need to enter the new mnemonic on every other device.">Rotate identity</button>`;
        return `<div style="margin-bottom:12px;padding:10px;border:1px solid var(--border);border-radius:6px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:8px;flex-wrap:wrap">
            <b>Relay storage:</b>
            <div style="display:flex;gap:6px">${buttons}</div>
          </div>
          <div style="margin-bottom:4px"><span style="color:${color};font-weight:600">${mb} / ${capMb} MB · ${q.pct}%</span></div>
          <div style="height:8px;border-radius:4px;background:var(--surface);overflow:hidden;margin-bottom:6px"><div style="height:100%;width:${q.pct}%;background:${color}"></div></div>
          <div style="color:var(--text-muted);font-size:11px">${note}</div>
        </div>`;
      })()}
      ${(() => {
        if (!isDebugMode()) return '';
        const t = d.deltaTelemetry;
        if (!t || t.summary.count === 0) return '';
        const s = t.summary;
        const pct = (s.ratio * 100).toFixed(1);
        const healthy = s.ratio < 0.05;
        const ratioColor = healthy ? 'var(--green)' : 'var(--orange)';
        const recentRows = t.pushes.slice(-6).reverse().map(p => {
          const when = new Date(p.at).toISOString().slice(11, 19) + 'Z';
          const arrs = Object.entries(p.perArray || {})
            .filter(([, v]) => (v.ins + v.upd + v.tom) > 0)
            .map(([k, v]) => `${escapeHTML(k)}(${v.ins}/${v.upd}/${v.tom})`).join(' ');
          return `<tr><td style="padding:3px 6px;font-family:monospace;font-size:11px;color:var(--text-muted)">${when}</td><td style="padding:3px 6px;text-align:right;font-family:monospace;font-size:11px">${p.blobBytes}b</td><td style="padding:3px 6px;text-align:right;font-family:monospace;font-size:11px">${p.totalDeltaBytes}b</td><td style="padding:3px 6px;text-align:right;font-family:monospace;font-size:11px">${p.totalOps}</td><td style="padding:3px 6px;font-family:monospace;font-size:10px;color:var(--text-muted)">${arrs || '—'}</td></tr>`;
        }).join('');
        const pullArrays = Object.keys(t.pull.perArray || {}).sort();
        const pullHtml = pullArrays.length === 0 ? '' :
          `<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">
            <div style="margin-bottom:4px"><b>Pull-side rows (latest merge ${t.pull.mergedAt ? new Date(t.pull.mergedAt).toISOString().slice(11, 19) + 'Z' : '—'}):</b></div>
            <div style="font-family:monospace;font-size:11px">${pullArrays.map(name => {
              const v = t.pull.perArray[name];
              return `${escapeHTML(name)} live=${v.live} tomb=${v.tombstones}`;
            }).join(' · ')}</div>
            <div style="margin-top:4px">Compare across devices — diverging counts mean relay replication isn't propagating per-row state evenly.</div>
          </div>`;
        return `<div style="margin-bottom:12px;padding:10px;border:1px solid var(--border);border-radius:6px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:8px">
            <b>Push efficiency <span style="font-weight:normal;color:var(--text-muted);font-size:11px">(last ${s.count} pushes — lower % = leaner sync)</span></b>
            <button class="ctx-btn-option" style="font-size:11px;flex-shrink:0" onclick="window.confirmResetDeltaTelemetry(this)" title="Clears just the recent-push log shown here. Your data and relay state aren't touched.">Reset</button>
          </div>
          <div style="margin-bottom:4px">
            <span style="color:${ratioColor};font-weight:600">${pct}%</span>
            <span style="color:var(--text-muted);font-size:11px"> · ${s.totalBlobBytes}b full · ${s.totalDeltaBytes}b deltas · ${s.totalOps} row ops</span>
          </div>
          <div style="color:var(--text-muted);font-size:11px;margin-bottom:8px">${healthy ? 'Looking good — sync is mostly riding the lightweight per-row path.' : 'Still hefty — most state is going as a full blob. Will trim down as more changes flow through.'}</div>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead><tr style="border-bottom:1px solid var(--border);text-align:left"><th style="padding:3px 6px">when</th><th style="padding:3px 6px;text-align:right">blob</th><th style="padding:3px 6px;text-align:right">delta</th><th style="padding:3px 6px;text-align:right">ops</th><th style="padding:3px 6px">arrays(ins/upd/tom)</th></tr></thead>
            <tbody>${recentRows}</tbody>
          </table>
          ${pullHtml}
        </div>`;
      })()}
      ${(() => {
        if (!isDebugMode()) return '';
        const r = d.cutoverReadiness;
        if (!r) return '';
        const blockers = Object.entries(r.surfaces).filter(([, v]) => v.status === 'missing-rows');
        const okCount = Object.values(r.surfaces).filter(v => v.status === 'ok').length;
        const noDataCount = Object.values(r.surfaces).filter(v => v.status === 'no-data').length;
        const headerColor = r.ready ? 'var(--green)' : 'var(--orange)';
        const headerLabel = r.ready ? 'Ready ✓' : `${r.blockerCount} item${r.blockerCount === 1 ? '' : 's'} pending`;
        const blockerHtml = blockers.length === 0 ? '' : `
          <div style="margin-top:6px;padding:8px;background:var(--surface);border-left:3px solid var(--orange);border-radius:4px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
              <div style="color:var(--orange);font-weight:600;font-size:12px">These bits of data haven't been re-pushed yet:</div>
              <button class="ctx-btn-option" style="font-size:11px" onclick="window.confirmBackfillBlockers(this)" title="Forces a fresh push so each pending item ships as new. Safe — no data loss.">Push now</button>
            </div>
            <table style="width:100%;font-size:11px">
              ${blockers.map(([name, v]) => `<tr><td style="font-family:monospace;padding:2px 6px">${escapeHTML(name)}</td><td style="padding:2px 6px;color:var(--text-muted)">${v.shape}</td><td style="padding:2px 6px;text-align:right">local=${v.localCount} rows=${v.rowCount}</td></tr>`).join('')}
            </table>
            <div style="color:var(--text-muted);font-size:10px;margin-top:4px">Tap <b>Push now</b> to take care of all of them at once.</div>
          </div>`;
        const cutoverEnabled = _isPhase2CutoverEnabled(state.currentProfile);
        // Cutover toggle: disabled when not READY (prevents accidental flip
        // before the per-row datapath is proven). When already enabled, the
        // button reads "Disable Phase 2" as an escape hatch - the user can
        // always revert to dual-write.
        const buttonHtml = cutoverEnabled
          ? `<button class="ctx-btn-option" style="font-size:11px;color:var(--orange);border-color:var(--orange)" onclick="window.confirmDisablePhase2(this)" title="Switches back to full-blob sync. Use this if a peer device shows missing data.">Disable</button>`
          : (r.ready
            ? `<button class="ctx-btn-option" style="font-size:11px;color:var(--green);border-color:var(--green)" onclick="window.confirmEnablePhase2(this)" title="Switch this device to lean sync (per-row deltas only). Reversible.">Enable</button>`
            : `<button class="ctx-btn-option" style="font-size:11px;opacity:0.5;cursor:not-allowed" disabled title="Push the pending items below first.">Enable</button>`);
        const cutoverBadge = cutoverEnabled
          ? `<span style="color:var(--green);font-size:10px;font-weight:600;padding:2px 6px;border:1px solid var(--green);border-radius:3px;margin-left:6px">ON</span>`
          : '';
        return `<div style="margin-bottom:12px;padding:10px;border:1px solid var(--border);border-radius:6px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:8px">
            <div><b>Lean sync mode</b>${cutoverBadge}<div style="font-weight:normal;color:var(--text-muted);font-size:11px;margin-top:2px">drops the full-blob backup once everything is reliably moving as per-row deltas — saves bandwidth + relay storage</div></div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              <span style="color:${headerColor};font-weight:600">${headerLabel}</span>
              ${buttonHtml}
            </div>
          </div>
          <div style="color:var(--text-muted);font-size:11px">${okCount} of ${r.surfaceCount} synced · ${noDataCount} empty${blockers.length > 0 ? ` · ${blockers.length} pending` : ''}</div>
          <div style="color:var(--text-muted);font-size:11px;margin-top:4px">Wait for <b>Ready</b> on both devices and let the efficiency above settle below ~5% before flipping. Reversible per device any time.</div>
          ${blockerHtml}
        </div>`;
      })()}
      <div>
        <b>Rows in this device's local Evolu DB:</b>
        <table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:12px">
          <thead><tr style="border-bottom:1px solid var(--border);text-align:left"><th style="padding:4px 8px">profileId</th><th style="padding:4px 8px;text-align:right">deleted</th><th style="padding:4px 8px">syncedAt(ms)</th><th style="padding:4px 8px;text-align:right">sun</th><th style="padding:4px 8px;text-align:right">dev</th><th style="padding:4px 8px;text-align:right">size</th><th style="padding:4px 8px;text-align:right">fmt</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div style="color:var(--text-muted);font-size:11px;margin-top:6px">Compare this table on phone vs desktop. Same profileId, same deleted state, same syncedAt(ms), same sun/dev counts → both devices already have the same data and the issue is rendering. Different counts → relay-replication isn't propagating between Evolu instances. <b>fmt</b> column: <span style="color:var(--green)">gz</span> = v1.6.4 gzip envelope, plain = pre-v1.6.4. <span style="color:var(--orange)">*</span> next to a profileId means it was recovered from the payload because the column was empty.</div>
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
        <button class="ctx-btn-option" onclick="window.copySyncDiagnose(this)" title="Copy this snapshot to the clipboard so you can paste it elsewhere">Copy</button>
        <button class="ctx-btn-option" onclick="this.closest('.modal-overlay').remove()">Close</button>
      </div>
    </div>
  </div>`;
  overlay.dataset.copyText = copyText;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// Copies the Sync diagnose snapshot to the clipboard. Walks up to find
// the overlay so we read the same `data-copy-text` blob the modal was
// rendered from (no stale-snapshot races when sync ticks during read).
export async function copySyncDiagnose(btn) {
  const overlay = btn?.closest?.('.modal-overlay');
  const text = overlay?.dataset?.copyText || '';
  if (!text) {
    try { showNotification('Nothing to copy', 'error'); } catch {}
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for browsers without async clipboard permission.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const original = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch (e) {
    try { showNotification(`Copy failed: ${e?.message || e}`, 'error'); } catch {}
  }
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
        showSyncDiagnose();
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
