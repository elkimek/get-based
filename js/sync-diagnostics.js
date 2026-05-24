// sync-diagnostics.js - Evolu row diagnostics snapshot and copy text helpers.

import { state } from './state.js';
import { getDeltaCutoverReadiness, getDeltaTelemetry } from './sync-delta.js';
import { getSyncRelay } from './sync-environment.js';
import { parseSyncPayload } from './sync-payload.js';
import { logSyncEvent } from './sync-state.js';

let _getEvolu = () => null;
let _getProfileQuery = () => null;
let _getTombstoneQuery = () => null;
let _getAppOwner = () => null;
let _isSyncEnabled = () => false;

export function configureSyncDiagnostics({
  getEvolu,
  getProfileQuery,
  getTombstoneQuery,
  getAppOwner,
  isSyncEnabled,
} = {}) {
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof getProfileQuery === 'function') _getProfileQuery = getProfileQuery;
  if (typeof getTombstoneQuery === 'function') _getTombstoneQuery = getTombstoneQuery;
  if (typeof getAppOwner === 'function') _getAppOwner = getAppOwner;
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
}

function currentEvolu() {
  try { return _getEvolu?.() || null; } catch { return null; }
}

function currentProfileQuery() {
  try { return _getProfileQuery?.() || null; } catch { return null; }
}

function currentTombstoneQuery() {
  try { return _getTombstoneQuery?.() || null; } catch { return null; }
}

function currentAppOwner() {
  try { return _getAppOwner?.() || null; } catch { return null; }
}

function currentSyncEnabled() {
  try { return !!_isSyncEnabled?.(); } catch { return false; }
}

// Snapshot Evolu's current state for the in-popover Diagnose button. Used
// when push/pull behave correctly per-device but cross-device convergence
// stalls - usually a mnemonic mismatch (different Evolu owners, so devices
// can't see each other's rows) or stale-row replication (relay has the
// data, this device's local Evolu DB hasn't pulled it down yet).
export async function getEvoluDiagnostics() {
  const evolu = currentEvolu();
  const profileQuery = currentProfileQuery();
  const tombstoneQuery = currentTombstoneQuery();
  const appOwner = currentAppOwner();
  const out = {
    syncEnabled: currentSyncEnabled(),
    relay: getSyncRelay(),
    ownerId: appOwner?.id ? String(appOwner.id).slice(0, 12) + '…' : null,
    mnemonicPrefix: appOwner?.mnemonic ? appOwner.mnemonic.split(' ').slice(0, 2).join(' ') + ' …' : null,
    rows: [],
    activeProfileId: state.currentProfile,
    activeImported: { sunSessions: 0, lightDevices: 0 },
  };
  try {
    const liveRows = (evolu && profileQuery) ? evolu.getQueryRows(profileQuery) : [];
    const tombstoneRows = (evolu && tombstoneQuery) ? evolu.getQueryRows(tombstoneQuery) : [];
    const rows = [
      ...(liveRows || []).map(r => ({ ...r, isDeleted: false })),
      ...(tombstoneRows || []).map(r => ({ ...r, isDeleted: true })),
    ];
    for (const row of rows) {
      let sun = 0, dev = 0, payloadProfileId = null, format = 'plain';
      try {
        // parseSyncPayload routes plain JSON + the v1.6.4 GZ envelope.
        // Without it the new compressed rows would render as 0/0 + ? in
        // the diagnose modal (raw JSON.parse on `GZ|v1|<base64>` throws).
        if (typeof row.dataJson === 'string' && row.dataJson.startsWith('GZ|v1|')) format = 'gz';
        const parsed = await parseSyncPayload(row.dataJson || '{}');
        const imp = parsed?.importedData || parsed;
        sun = Array.isArray(imp?.sunSessions) ? imp.sunSessions.length : 0;
        dev = Array.isArray(imp?.lightDevices) ? imp.lightDevices.length : 0;
        // Fallback when the row's profileId column is empty (seen in the
        // wild on cross-device replication of older inserts) - read it
        // from the payload's nested profile object.
        payloadProfileId = parsed?.profile?.id || null;
      } catch (e) {
        // v1.7.15 audit fix: previously silent. The diagnose modal would
        // render the row as 0/0 - indistinguishable from a real empty row.
        // Log so triage can see which rows the parse path is rejecting
        // (gzip-bomb defence trips, malformed envelope, etc).
        logSyncEvent('skip', `Diagnose row ${String(row.id || '?').slice(0, 8)} parse failed: ${String(e?.message || e).slice(0, 80)}`);
      }
      out.rows.push({
        profileId: row.profileId || payloadProfileId,
        profileIdSource: row.profileId ? 'column' : (payloadProfileId ? 'payload' : 'missing'),
        syncedAt: row.syncedAt,
        syncedAtMs: row.syncedAt ? new Date(row.syncedAt).getTime() : 0,
        sun, dev, format,
        isDeleted: !!row.isDeleted,
        bytes: (row.dataJson || '').length,
      });
    }
  } catch (e) { out.rowsError = String(e?.message || e); }
  // What's actually in this device's active state right now.
  out.activeImported.sunSessions = Array.isArray(state.importedData?.sunSessions) ? state.importedData.sunSessions.length : 0;
  out.activeImported.lightDevices = Array.isArray(state.importedData?.lightDevices) ? state.importedData.lightDevices.length : 0;
  // Phase 1 dual-write health for the active profile. Surfaces (a) recent
  // push payload sizes (blob vs delta) so we can confirm the per-row
  // datapath is shipping a small fraction of the blob (Phase 2 cutover
  // gate), and (b) per-array row counts seen by the pull side (cross-
  // device replication gauge).
  out.deltaTelemetry = state.currentProfile ? getDeltaTelemetry(state.currentProfile) : null;
  // Phase 2 cutover readiness - per-surface gap analysis. Surfaces in
  // 'missing-rows' state would silently lose data on Phase 2 flip; the
  // modal renders the full table so any blocker is visible.
  out.cutoverReadiness = state.currentProfile ? getDeltaCutoverReadiness(state.currentProfile, state.importedData) : null;
  return out;
}

// Render the diagnostics object as plain text - meant for the Copy button
// in showSyncDiagnose, so a user can paste the device's state into chat /
// support without retyping. Mirrors the modal's structure exactly.
export function _evoluDiagnosticsText(d) {
  const lines = [
    `Sync diagnose @ ${new Date().toISOString()}`,
    `Sync enabled: ${d.syncEnabled ? 'yes' : 'no'}`,
    `Relay: ${d.relay || '-'}`,
    `Owner ID: ${d.ownerId || '- (not initialized)'}`,
    `Mnemonic prefix: ${d.mnemonicPrefix || '-'}`,
    `Active profile: ${d.activeProfileId || '?'}`,
    `In-memory state: sunSessions=${d.activeImported.sunSessions} lightDevices=${d.activeImported.lightDevices}`,
    `Rows in this device's local Evolu DB:`,
  ];
  if (!d.rows.length) {
    lines.push('  (none)');
  } else {
    lines.push('  profileId         del  syncedAtMs       sun  dev  size       fmt   src');
    for (const r of d.rows) {
      const pid = String(r.profileId || '?').padEnd(17);
      const del = r.isDeleted ? 'yes' : 'no ';
      const ts = String(r.syncedAtMs).padEnd(16);
      const sun = String(r.sun).padStart(3);
      const dev = String(r.dev).padStart(3);
      const size = String(r.bytes + 'b').padStart(9);
      const fmt = String(r.format || '?').padEnd(5);
      const src = String(r.profileIdSource || '?');
      lines.push(`  ${pid} ${del}  ${ts} ${sun}  ${dev}  ${size}  ${fmt} ${src}`);
    }
  }
  if (d.rowsError) lines.push(`Rows read error: ${d.rowsError}`);
  const t = d.deltaTelemetry;
  if (t) {
    const s = t.summary;
    const pct = (s.ratio * 100).toFixed(1);
    lines.push('');
    lines.push(`Phase 1 dual-write health (last ${s.count} pushes):`);
    lines.push(`  blob total: ${s.totalBlobBytes}b · delta total: ${s.totalDeltaBytes}b · ops: ${s.totalOps}`);
    lines.push(`  ratio (delta:blob): ${pct}%  ${s.ratio < 0.05 ? '(healthy — Phase 2 cutover safe)' : '(still high — keep baking)'}`);
    if (t.pushes.length > 0) {
      lines.push('  recent pushes:');
      lines.push('    when                blob       delta      ops  arrays');
      for (const p of t.pushes.slice(-6).reverse()) {
        const when = new Date(p.at).toISOString().slice(11, 19) + 'Z';
        const blob = String((p.blobBytes || 0) + 'b').padStart(9);
        const delta = String((p.totalDeltaBytes || 0) + 'b').padStart(9);
        const ops = String(p.totalOps || 0).padStart(3);
        const arrs = Object.entries(p.perArray || {})
          .filter(([, v]) => (v.ins + v.upd + v.tom) > 0)
          .map(([k, v]) => `${k}(${v.ins}/${v.upd}/${v.tom})`).join(' ');
        lines.push(`    ${when}        ${blob}  ${delta}  ${ops}  ${arrs || '-'}`);
      }
      lines.push('    (arrays column: name(insert/update/tombstone))');
    }
    const pullArrays = Object.keys(t.pull.perArray || {});
    if (pullArrays.length > 0) {
      lines.push(`  pull-side rows (latest merge ${t.pull.mergedAt ? new Date(t.pull.mergedAt).toISOString() : '-'}):`);
      for (const name of pullArrays.sort()) {
        const v = t.pull.perArray[name];
        lines.push(`    ${name.padEnd(20)} live=${v.live} tombstones=${v.tombstones}`);
      }
      lines.push('    (compare across devices - diverging counts = relay replication lag)');
    }
  }
  const r = d.cutoverReadiness;
  if (r) {
    lines.push('');
    lines.push(`Phase 2 cutover readiness: ${r.ready ? 'READY ✓' : `BLOCKED — ${r.blockerCount} surface(s) missing rows`}`);
    lines.push(`  ${r.surfaceCount} surfaces total`);
    const blockers = Object.entries(r.surfaces).filter(([, v]) => v.status === 'missing-rows');
    if (blockers.length > 0) {
      lines.push(`  ⚠ BLOCKERS — surfaces with local data but no per-row push:`);
      for (const [name, v] of blockers) {
        lines.push(`    ${name.padEnd(20)} shape=${v.shape} local=${v.localCount} rows=${v.rowCount}`);
      }
    }
    const ok = Object.entries(r.surfaces).filter(([, v]) => v.status === 'ok');
    if (ok.length > 0) {
      lines.push(`  ✓ ok (${ok.length}): ${ok.map(([n]) => n).join(', ')}`);
    }
  }
  return lines.join('\n');
}
