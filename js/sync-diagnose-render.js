// @ts-check
// sync-diagnose-render.js - Pure HTML render helpers for Sync Diagnose.

import { escapeAttr, escapeHTML } from './utils.js';

export function syncDiagnoseActionAttrs(action) {
  return `data-sync-diagnose-action="${escapeAttr(action)}"`;
}

function renderRowsHtml(rows) {
  if (!rows.length) {
    return '<tr><td colspan="7" style="padding:8px;color:var(--text-muted);text-align:center">No rows in local Evolu DB</td></tr>';
  }
  return rows.map(r => {
    const pidCell = escapeHTML(r.profileId || '?');
    const pidNote = r.profileIdSource === 'payload' ? ' <span style="color:var(--orange);font-size:10px" title="profileId column empty; recovered from payload">*</span>' : '';
    const fmtCell = r.format === 'gz'
      ? '<span title="gzip envelope (v1.6.4)" style="color:var(--green)">gz</span>'
      : r.format === 'invalid'
        ? '<span title="payload could not be decoded" style="color:var(--orange)">invalid</span>'
        : 'plain';
    const delCell = r.isDeleted ? '<span style="color:var(--orange);font-weight:600">yes</span>' : 'no';
    return `<tr><td style="padding:4px 8px;font-family:monospace;font-size:11px">${pidCell}${pidNote}</td><td style="padding:4px 8px;text-align:right;font-size:11px">${delCell}</td><td style="padding:4px 8px;font-family:monospace;font-size:11px;color:var(--text-muted)">${r.syncedAtMs}</td><td style="padding:4px 8px;text-align:right">${r.sun}</td><td style="padding:4px 8px;text-align:right">${r.dev}</td><td style="padding:4px 8px;text-align:right;color:var(--text-muted);font-size:11px">${r.bytes}b</td><td style="padding:4px 8px;text-align:right;font-size:11px">${fmtCell}</td></tr>`;
  }).join('');
}

function renderRelayHealthPanel(healthVerdict) {
  const v = healthVerdict?.verdict || 'unknown';
  const isHealthy = v === 'healthy';
  const needsAttention = v === 'wedged';
  const tone = isHealthy ? 'success' : needsAttention ? 'danger' : 'neutral';
  const label = isHealthy ? 'Verified' : needsAttention ? 'Needs attention' : 'Waiting for verification';
  const detail = isHealthy
    ? `The relay confirmed a recent update from this device${healthVerdict?.at ? ` at ${new Date(healthVerdict.at).toISOString().slice(11, 19)} UTC` : ''}.`
    : needsAttention
      ? 'A recent update was not reflected by the relay. Try Sync now once; use recovery tools only if the warning remains.'
      : 'No failed update was detected. This becomes verified after this device sends a change.';
  return `<section class="sync-diagnose-card sync-diagnose-health-card">
    <div class="sync-diagnose-card-head">
      <div>
        <div class="sync-diagnose-card-label">Relay connection</div>
        <div class="sync-diagnose-card-title">${escapeHTML(label)}</div>
      </div>
      <span class="sync-diagnose-badge sync-diagnose-badge-${tone}">${isHealthy ? 'Connected' : needsAttention ? 'Check now' : 'Not yet tested'}</span>
    </div>
    <p class="sync-diagnose-card-copy">${escapeHTML(detail)}</p>
  </section>`;
}

function renderRelayStoragePanel(q) {
  if (!q) return '';
  const mb = (q.bytes / (1024 * 1024)).toFixed(2);
  const capMb = (q.cap / (1024 * 1024)).toFixed(0);
  const color = q.level === 'red' ? 'var(--red)' : q.level === 'amber' ? 'var(--orange)' : 'var(--green)';
  const note = q.level === 'red'
    ? 'Storage is almost full. Reduce it soon so new updates are not rejected.'
    : q.level === 'amber'
      ? 'Storage is filling up, but sync can continue. Reduce it when all devices are up to date.'
      : 'Plenty of relay storage is available.';
  const compactButton = q.level === 'red' || q.level === 'amber'
    ? `<button class="ctx-btn-option sync-diagnose-storage-action" ${syncDiagnoseActionAttrs('compact-relay')} title="Rebuilds the encrypted relay history from this device after confirmation.">Reduce storage…</button>`
    : '';
  return `<section class="sync-diagnose-card sync-diagnose-storage-card">
    <div class="sync-diagnose-card-head">
      <div>
        <div class="sync-diagnose-card-label">Relay storage</div>
        <div class="sync-diagnose-card-title"><span style="color:${color}">${mb} of ${capMb} MB used</span></div>
      </div>
      <button class="ctx-btn-option sync-diagnose-refresh" ${syncDiagnoseActionAttrs('refresh-relay-storage')} title="Get the current usage directly from the relay.">Refresh usage</button>
    </div>
    <div class="sync-diagnose-storage-track" role="progressbar" aria-label="Relay storage used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${q.pct}"><span style="width:${Math.min(100, Math.max(0, q.pct))}%;background:${color}"></span></div>
    <div class="sync-diagnose-card-footer"><p class="sync-diagnose-card-copy">${note}</p>${compactButton}</div>
  </section>`;
}

function getSyncStatusSummary(d, healthVerdict, quota) {
  const verdict = healthVerdict?.verdict || 'unknown';
  if (!d.syncEnabled) {
    return { tone: 'neutral', eyebrow: 'Not active', title: 'Sync is off on this device', detail: 'Your data remains on this device. Turn sync on in Settings when you want to connect it to your other devices.' };
  }
  if (!d.ownerId || !d.mnemonicConfigured) {
    return { tone: 'warning', eyebrow: 'Setup incomplete', title: 'Finish setting up sync', detail: 'This device does not have a complete sync identity yet. Return to Cross-device sync settings to set up or join an identity.' };
  }
  if (verdict === 'wedged') {
    return { tone: 'danger', eyebrow: 'Action recommended', title: 'Sync needs attention', detail: 'This device saved an update locally, but the relay did not confirm that its state advanced. Try Sync now, then reopen this screen.' };
  }
  if (d.rowsReadFailed || d.rowParseFailureCount > 0) {
    return { tone: 'warning', eyebrow: 'Local check incomplete', title: 'Some sync records could not be checked', detail: 'Your data is still available, but the local sync database reported a reading problem. Copy the diagnostic report below if this persists.' };
  }
  if (quota?.level === 'red') {
    return { tone: 'danger', eyebrow: 'Storage nearly full', title: 'Sync works, but storage needs attention', detail: 'Choose Reduce storage soon so there is room for future changes.' };
  }
  if (quota?.level === 'amber') {
    return { tone: 'warning', eyebrow: 'Storage filling up', title: 'Sync is working', detail: 'Updates are reaching the relay. Storage is getting high, so plan a cleanup after every device is fully synced.' };
  }
  if (verdict === 'healthy') {
    return { tone: 'success', eyebrow: 'All checks passed', title: 'Sync looks healthy', detail: 'This device is configured, its recent update reached the relay, and relay storage has room available.' };
  }
  return { tone: 'neutral', eyebrow: 'Ready', title: 'No problem detected', detail: 'Sync is configured. Make a small change and press Sync now if you want this device to perform a fresh relay verification.' };
}

function renderStatusSummary(d, healthVerdict, quota) {
  const summary = getSyncStatusSummary(d, healthVerdict, quota);
  const relayLabel = healthVerdict?.verdict === 'healthy'
    ? 'Relay verified'
    : healthVerdict?.verdict === 'wedged' ? 'Relay needs attention' : 'Relay waiting';
  const storageLabel = quota ? `Storage ${quota.pct}%` : 'Storage unavailable';
  return `<section class="sync-diagnose-summary sync-diagnose-summary-${summary.tone}" data-sync-diagnose-summary="${summary.tone}">
    <div class="sync-diagnose-summary-icon" aria-hidden="true">${summary.tone === 'success' ? '✓' : summary.tone === 'danger' ? '!' : summary.tone === 'warning' ? '!' : 'i'}</div>
    <div class="sync-diagnose-summary-content">
      <div class="sync-diagnose-summary-eyebrow">${summary.eyebrow}</div>
      <h4>${summary.title}</h4>
      <p>${summary.detail}</p>
      <div class="sync-diagnose-summary-badges">
        <span>${d.syncEnabled ? 'Sync on' : 'Sync off'}</span>
        <span>${relayLabel}</span>
        <span>${storageLabel}</span>
      </div>
    </div>
  </section>`;
}

function renderDeviceCheck(d) {
  return `<section class="sync-diagnose-device-check">
    <div>
      <div class="sync-diagnose-card-label">Checking another device?</div>
      <div class="sync-diagnose-device-title">Compare the Sync identity code first</div>
      <p>Open Settings → Data → Cross-device sync on both devices. The safe identity codes must match. Then press <b>Sync now</b> on each device.</p>
    </div>
    <div class="sync-diagnose-device-code"><span>This device</span><strong>${d.ownerId && d.mnemonicConfigured ? 'Identity ready' : 'Setup incomplete'}</strong></div>
  </section>`;
}

function renderDeltaTelemetryPanel(t, isDebug) {
  if (!isDebug || !t || t.summary.count === 0) return '';
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
      <button class="ctx-btn-option" style="font-size:11px;flex-shrink:0" ${syncDiagnoseActionAttrs('reset-delta-telemetry')} title="Clears just the recent-push log shown here. Your data and relay state aren't touched.">Reset</button>
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
}

function renderCutoverPanel(r, isDebug, cutoverEnabled) {
  if (!isDebug || !r) return '';
  const blockers = Object.entries(r.surfaces).filter(([, v]) => v.status === 'missing-rows');
  const okCount = Object.values(r.surfaces).filter(v => v.status === 'ok').length;
  const noDataCount = Object.values(r.surfaces).filter(v => v.status === 'no-data').length;
  const headerColor = r.ready ? 'var(--green)' : 'var(--orange)';
  const headerLabel = r.ready ? 'Ready ✓' : `${r.blockerCount} item${r.blockerCount === 1 ? '' : 's'} pending`;
  const blockerHtml = blockers.length === 0 ? '' : `
    <div style="margin-top:6px;padding:8px;background:var(--surface);border-left:3px solid var(--orange);border-radius:4px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
        <div style="color:var(--orange);font-weight:600;font-size:12px">These bits of data haven't been re-pushed yet:</div>
        <button class="ctx-btn-option" style="font-size:11px" ${syncDiagnoseActionAttrs('backfill-blockers')} title="Forces a fresh push so each pending item ships as new. Safe — no data loss.">Push now</button>
      </div>
      <table style="width:100%;font-size:11px">
        ${blockers.map(([name, v]) => `<tr><td style="font-family:monospace;padding:2px 6px">${escapeHTML(name)}</td><td style="padding:2px 6px;color:var(--text-muted)">${escapeHTML(v.shape)}</td><td style="padding:2px 6px;text-align:right">local=${v.localCount} rows=${v.rowCount}</td></tr>`).join('')}
      </table>
      <div style="color:var(--text-muted);font-size:10px;margin-top:4px">Tap <b>Push now</b> to take care of all of them at once.</div>
    </div>`;
  const buttonHtml = cutoverEnabled
    ? `<button class="ctx-btn-option" style="font-size:11px;color:var(--orange);border-color:var(--orange)" ${syncDiagnoseActionAttrs('disable-phase2')} title="Switches back to full-blob sync. Use this if a peer device shows missing data.">Disable</button>`
    : (r.ready
      ? `<button class="ctx-btn-option" style="font-size:11px;color:var(--green);border-color:var(--green)" ${syncDiagnoseActionAttrs('enable-phase2')} title="Switch this device to lean sync (per-row deltas only). Reversible.">Enable</button>`
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
}

export function renderSyncDiagnoseModal({
  diagnostics,
  healthVerdict,
  quota,
  isDebug,
  cutoverEnabled,
}) {
  const d = diagnostics;
  const rowsHtml = renderRowsHtml(d.rows);
  const rowParseFailureCount = Number.isSafeInteger(d.rowParseFailureCount) && d.rowParseFailureCount > 0
    ? d.rowParseFailureCount
    : 0;
  const rowWarnings = [
    ...(rowParseFailureCount > 0 ? [`${rowParseFailureCount} row payload${rowParseFailureCount === 1 ? '' : 's'} could not be decoded.`] : []),
    ...(d.rowsReadFailed ? ['Row query failed.'] : []),
  ];
  const rowWarningHtml = rowWarnings.length > 0
    ? `<div class="sync-diagnose-row-warning">${rowWarnings.join(' ')}</div>`
    : '';
  const rowCount = Array.isArray(d.rows) ? d.rows.length : 0;
  const compactInStorageCard = quota?.level === 'amber' || quota?.level === 'red';
  const maintenanceButtons = `
    ${compactInStorageCard ? '' : `<button class="ctx-btn-option" ${syncDiagnoseActionAttrs('compact-relay')} title="Rebuilds the encrypted relay history from this device after confirmation.">Reduce storage…</button>`}
    ${healthVerdict?.verdict === 'wedged' ? `<button class="ctx-btn-option sync-diagnose-danger-action" ${syncDiagnoseActionAttrs('rotate-identity')} title="Creates a new recovery phrase and requires reconnecting every device.">Rotate sync identity…</button>` : ''}
    <button class="ctx-btn-option" ${syncDiagnoseActionAttrs('copy-snapshot')} title="Copy a privacy-safe technical report for troubleshooting.">Copy diagnostic report</button>`;
  const technicalReason = healthVerdict?.verdict === 'wedged' && healthVerdict?.reason
    ? `<div class="sync-diagnose-technical-reason"><b>Relay check detail:</b> ${escapeHTML(healthVerdict.reason)}</div>`
    : '';
  return `<div class="modal sync-diagnose-modal" role="dialog" aria-label="Cross-device sync status">
    <div class="modal-header"><div><div class="sync-diagnose-modal-kicker">Cross-device sync</div><h3>Sync status</h3></div><button class="modal-close" data-sync-diagnose-close aria-label="Close">×</button></div>
    <div class="modal-body sync-diagnose-body">
      ${renderStatusSummary(d, healthVerdict, quota)}
      ${renderDeviceCheck(d)}
      ${renderRelayHealthPanel(healthVerdict)}
      ${renderRelayStoragePanel(quota)}
      <details class="sync-diagnose-technical">
        <summary>
          <span><b>Technical details</b><small>For troubleshooting and support${isDebug ? ' · developer metrics included' : ''}</small></span>
          <span class="sync-diagnose-disclosure" aria-hidden="true">›</span>
        </summary>
        <div class="sync-diagnose-technical-content">
          <div class="sync-diagnose-facts">
            <div><span>Sync enabled</span><b>${d.syncEnabled ? 'Yes' : 'No'}</b></div>
            <div><span>Recovery phrase</span><b>${d.mnemonicConfigured ? 'Configured' : 'Missing'}</b></div>
            <div><span>Owner ID</span><code>${escapeHTML(d.ownerId || 'Not initialized')}</code></div>
            <div><span>Active profile</span><code>${escapeHTML(d.activeProfileId || 'None')}</code></div>
            <div class="sync-diagnose-fact-wide"><span>Relay</span><code>${escapeHTML(d.relay || 'Not configured')}</code></div>
            <div class="sync-diagnose-fact-wide"><span>Local summary</span><b>${d.activeImported.sunSessions} sun sessions · ${d.activeImported.lightDevices} light devices</b></div>
          </div>
          ${technicalReason}
          ${isDebug ? `<div class="sync-diagnose-developer-block"><div class="sync-diagnose-section-heading">Developer metrics</div>${renderDeltaTelemetryPanel(d.deltaTelemetry, isDebug)}${renderCutoverPanel(d.cutoverReadiness, isDebug, cutoverEnabled)}</div>` : ''}
          <details class="sync-diagnose-row-details" ${rowWarnings.length > 0 ? 'open' : ''}>
            <summary><span>Local sync database</span><span>${rowCount} row${rowCount === 1 ? '' : 's'}${rowWarnings.length ? ' · check warning' : ''}</span></summary>
            <div class="sync-diagnose-row-content">
              ${rowWarningHtml}
              <div class="sync-diagnose-table-wrap">
                <table>
                  <thead><tr><th>profileId</th><th>deleted</th><th>syncedAt (ms)</th><th>sun</th><th>dev</th><th>size</th><th>format</th></tr></thead>
                  <tbody>${rowsHtml}</tbody>
                </table>
              </div>
              <p>Support may ask you to compare these rows across devices. <b>gz</b> and <b>plain</b> are valid formats; <b>invalid</b> means a row could not be decoded. An asterisk marks an ID recovered safely from its payload.</p>
            </div>
          </details>
          <div class="sync-diagnose-maintenance">
            <div class="sync-diagnose-section-heading">Recovery and maintenance</div>
            <p>These actions are rarely needed. Use them only when the status above recommends it or support asks you to.</p>
            <div class="sync-diagnose-maintenance-actions">${maintenanceButtons}</div>
          </div>
        </div>
      </details>
      <div class="sync-diagnose-footer">
        <button class="ctx-btn-option" data-sync-diagnose-close>Close</button>
      </div>
    </div>
  </div>`;
}
