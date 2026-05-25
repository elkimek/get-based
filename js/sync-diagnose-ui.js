// sync-diagnose-ui.js - Sync Diagnose modal rendering helpers.

import { state } from './state.js';
import { showNotification, isDebugMode, escapeHTML } from './utils.js';
import { _evoluDiagnosticsText, getEvoluDiagnostics } from './sync-diagnostics.js';
import { getRelayQuotaEstimate, verifyPushLanded } from './sync-relay-health.js';
import { configureSyncDiagnoseActions } from './sync-diagnose-actions.js';

export {
  confirmBackfillBlockers, confirmCompactRelay, confirmDisablePhase2,
  confirmEnablePhase2, confirmResetDeltaTelemetry, confirmRotateIdentity,
  refreshRelayStorage,
} from './sync-diagnose-actions.js';

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
  if (typeof isPhase2CutoverEnabled === 'function') _isPhase2CutoverEnabled = isPhase2CutoverEnabled;
  configureSyncDiagnoseActions({
    enableSync,
    restoreFromMnemonic,
    isSyncEnabled,
    pushProfile,
    enablePhase2Cutover,
    disablePhase2Cutover,
    // Intentionally capture the module-scoped hoisted renderer, not a
    // caller-provided config field that could shadow it with undefined.
    showSyncDiagnose,
  });
}
// Read-only modal that dumps Evolu's local state - both devices should
// show the same `ownerId` / `mnemonicPrefix`. If they differ, the two
// devices are talking to different Evolu owners and will never see each
// other's data despite using the same relay URL.
export async function showSyncDiagnose() {
  const d = await getEvoluDiagnostics();
  // Probe the relay so we can render a fresh "are this device's outbound
  // pushes becoming durable?" verdict. verifyPushLanded compares this
  // tab's last locally-committed push against a stored relay baseline.
  // Another device can show healthy/unknown until it performs its own
  // push+probe, so the verdict is intentionally phrased as local outbound
  // health rather than a global relay truth. First call this session is
  // 'unknown' (just seeds the baseline). Best-effort: any error path
  // resolves to a 'unknown' verdict, never blocks modal rendering.
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
        // on /self/owner-storage, letting us verify "did this device's last
        // push become durable?" without operator help. Three-state verdict:
        //   healthy  -> relay advanced after this device pushed (green dot)
        //   wedged   -> this device pushed but relay did not advance (red dot)
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
        const label = isHealthy ? 'Healthy — this device\'s pushes are landing.' : 'Wedged — this device pushed, but the relay state did not advance.';
        const detail = isHealthy
          ? 'Last verified ' + new Date(healthVerdict.at).toISOString().slice(11, 19) + 'Z. Storage state has advanced since the previous check.'
          : (healthVerdict.reason || 'No relay-side advance observed since the previous check.');
        const scope = '<div style="color:var(--text-muted);font-size:11px;margin-top:6px">This verdict is local/outbound: another device can show healthy or unknown until it pushes and probes its own relay baseline. Compare Owner ID / Mnemonic prefix across devices first.</div>';
        const recovery = isHealthy ? scope : scope + '<div style="color:var(--text-muted);font-size:11px;margin-top:6px">This matches the Evolu silent-reject pattern. The fix is identity rotation — generate a fresh 24-word mnemonic and restore every syncing device to it. See <a href="https://docs.getbased.health/guides/cross-device-sync" target="_blank" style="color:var(--accent)">cross-device sync docs</a>.</div>';
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
          <button class="ctx-btn-option" style="font-size:11px" onclick="window.confirmRotateIdentity(this)" title="Generate a fresh 24-word mnemonic for this owner. Use when this device's relay-health verdict shows 'wedged' (silent-reject pattern). You'll need to enter the new mnemonic on every other device.">Rotate identity</button>`;
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
