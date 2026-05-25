// sync-diagnostics-snapshot.js - Evolu row diagnostics snapshots.

import { state } from './state.js';
import { isDebugMode } from './utils.js';
import { getDeltaCutoverReadiness, getDeltaTelemetry } from './sync-delta.js';
import { getSyncRelay } from './sync-environment.js';
import { parseSyncPayload } from './sync-payload.js';
import { logSyncEvent } from './sync-state.js';
import {
  currentDiagnosticAppOwner,
  currentDiagnosticEvolu,
  currentDiagnosticProfileQuery,
  currentDiagnosticPulling,
  currentDiagnosticSubscriptionFireCount,
  currentDiagnosticSyncEnabled,
  currentDiagnosticSyncing,
  currentDiagnosticTombstoneQuery,
} from './sync-diagnostics-context.js';

export function _syncDiag() {
  const evolu = currentDiagnosticEvolu();
  const profileQuery = currentDiagnosticProfileQuery();
  const appOwner = currentDiagnosticAppOwner();
  const info = {
    enabled: currentDiagnosticSyncEnabled(),
    evoluReady: !!evolu,
    relay: getSyncRelay(),
    mnemonic: appOwner?.mnemonic ? '<set>' : null,
    subscriptionFires: currentDiagnosticSubscriptionFireCount(),
    syncing: currentDiagnosticSyncing(),
    pulling: currentDiagnosticPulling(),
  };
  if (evolu && profileQuery) {
    const rows = evolu.getQueryRows(profileQuery);
    info.evoluRows = (rows || []).map(r => ({
      profileId: r.profileId,
      syncedAt: r.syncedAt,
      dataSize: r.dataJson?.length ?? 0,
    }));
  }
  const tsList = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.endsWith('-sync-ts')) {
      const ts = parseInt(localStorage.getItem(key), 10);
      tsList.push({ key, ts, date: new Date(ts).toISOString() });
    }
  }
  info.localTimestamps = tsList;
  if (isDebugMode()) {
    console.table?.(info.evoluRows);
    console.log('[sync] Diagnostics:', JSON.stringify(info, null, 2));
  }
  return info;
}

// Snapshot Evolu's current state for the in-popover Diagnose button. Used
// when push/pull behave correctly per-device but cross-device convergence
// stalls - usually a mnemonic mismatch (different Evolu owners, so devices
// can't see each other's rows) or stale-row replication (relay has the
// data, this device's local Evolu DB hasn't pulled it down yet).
export async function getEvoluDiagnostics() {
  const evolu = currentDiagnosticEvolu();
  const profileQuery = currentDiagnosticProfileQuery();
  const tombstoneQuery = currentDiagnosticTombstoneQuery();
  const appOwner = currentDiagnosticAppOwner();
  const out = {
    syncEnabled: currentDiagnosticSyncEnabled(),
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
