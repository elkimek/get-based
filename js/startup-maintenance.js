// @ts-check
// startup-maintenance.js - startup service boot and non-blocking maintenance

import { state } from './state.js';
import { migrateBiometricsToManual, hasManualData } from './wearables-manual.js';
import { syncWearableSummary } from './wearables-summary.js';
import { loadWearablesConnectModule } from './wearables-connect-loader.js';
import { preloadMitoCompoundData } from './supplement-warnings.js';
import {
  getStartupSunEngineVersionRuntime,
  hasSunSessionRehydrateRuntime,
  logStartupMaintenanceRuntime,
  rehydrateStaleSunSessionsRuntime,
} from './startup-maintenance-runtime.js';

export function runPostProfileStartupMaintenance() {
  preloadTrackedSupplementWarnings();
  startConnectedWearableServices().catch(() => {});
  scheduleSunSessionRehydrate();
  hydrateUserLightDevicesFromPresets();
  migrateLegacyBiometrics();
}

function preloadTrackedSupplementWarnings() {
  if (state.importedData?.supplements?.length) {
    void preloadMitoCompoundData();
  }
}

function hasConnectedOAuthWearable() {
  return Object.values(state.importedData?.wearableConnections || {})
    .some(connection => Boolean(connection?.connectedAt
      && (connection?.accessToken || connection?.refreshToken || connection?.hasStoredCredentials)));
}

export async function startConnectedWearableServices() {
  if (!hasConnectedOAuthWearable()) return false;
  const connect = await loadWearablesConnectModule();
  // Start the runtime-config request before the scheduler. Its first sync
  // waits for this bounded request, preserving self-host client overrides.
  connect.loadWearableRuntimeConfig();
  connect.initWearableScheduler();
  return true;
}

function scheduleSunSessionRehydrate() {
  // Self-heal sun-session doses + safety after engine math fixes. The
  // engineVersion stamp on each session lets us detect data computed
  // under an older (buggy) version and re-run hydrate. Fires async so
  // it doesn't block init; one network call per stale session,
  // serialized inside rehydrateStaleSessions. No-op when everything is
  // already stamped at the current version.
  if (state.importedData?.sunSessions?.length && hasSunSessionRehydrateRuntime()) {
    setTimeout(() => {
      rehydrateStaleSunSessionsRuntime().then(r => {
        if (r?.rehydrated) {
          // Surface in debug console only - not worth a user-facing
          // notification for a silent self-heal.
          logStartupMaintenanceRuntime('[sun] self-healed', r.rehydrated, 'session(s) under v' + getStartupSunEngineVersionRuntime());
        }
      }).catch(() => {});
    }, 1500); // give the engine modules time to settle
  }
}

function hydrateUserLightDevicesFromPresets() {
  // Round 7: backfill channelGroups / modes / coupling onto user devices
  // that pre-date the schema additions. Without this, existing Maxi UVB
  // / Trinity device records have no `modes` array, so the session-log
  // dialog can't render the mode picker for them. Idempotent - re-runs
  // are no-ops once devices carry the fields.
  // Sessions keep a device snapshot, so stale history can still be repaired
  // after the user removes the live device from their library.
  if (!state.importedData?.lightDevices?.length && !state.importedData?.deviceSessions?.length) return;
  import('./light-devices.js')
    .then(async ({ hydrateDevicesFromPresets, rehydrateStaleDeviceSessions }) => {
      const dirty = await hydrateDevicesFromPresets();
      const sessions = await rehydrateStaleDeviceSessions();
      return { dirty, sessions };
    })
    .then(({ dirty, sessions }) => {
      if (dirty) logStartupMaintenanceRuntime('[light] hydrated user devices from preset library');
      if (sessions?.rehydrated) logStartupMaintenanceRuntime('[light] self-healed', sessions.rehydrated, 'device session(s)');
    })
    .catch(() => {});
}

function migrateLegacyBiometrics() {
  // Health Metrics unification (Commit 1/5): walk legacy importedData.biometrics
  // into the wearables IndexedDB with source: 'manual'. Idempotent - tagged in
  // the wearables meta store so it only runs once per profile. Old biometrics
  // data is preserved; the Edit Client modal keeps writing there during the
  // dual-write transition (cleanup lands in Commit 4).
  migrateBiometricsToManual(state.currentProfile, state.importedData?.biometrics)
    .then(async () => {
      // Rebuild the L2 summary on every load that has manual data - covers
      // both the first-run migration AND catching up a stale cached summary
      // after a DEFAULT_METRIC_ORDER change or bug fix. The L2 change-gate
      // (shouldWriteL2) prevents redundant writes when nothing has shifted.
      if (await hasManualData(state.currentProfile)) {
        await syncWearableSummary(state.currentProfile, listStoredConnectedSources());
      }
    })
    .catch(() => { /* non-fatal; Safari can refuse IDB in some contexts */ });
}

function listStoredConnectedSources() {
  const out = {};
  for (const [sourceId, connection] of Object.entries(
    state.importedData?.wearableConnections || {},
  )) {
    if (!connection?.connectedAt) continue;
    out[sourceId] = {
      connectedSince: connection.connectedAt,
      lastSyncAt: connection.lastSyncAt || 0,
    };
  }
  return out;
}
