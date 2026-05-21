// startup-maintenance.js - startup service boot and non-blocking maintenance

import { state } from './state.js';
import { initWearableScheduler, loadWearableRuntimeConfig } from './wearables-connect.js';
import { migrateBiometricsToManual, hasManualData } from './wearables-manual.js';

export function initializeStartupServices() {
  // Self-host OAuth client_id overrides - fire-and-forget. Resolves before
  // any user can click Connect (UI renders well after this microtask), so
  // beginConnectOAuth() picks up the overridden client_id when present.
  loadWearableRuntimeConfig();

  // Scheduled wearable sync (only fires when a source is connected).
  initWearableScheduler();
}

export function runPostProfileStartupMaintenance() {
  scheduleSunSessionRehydrate();
  hydrateUserLightDevicesFromPresets();
  migrateLegacyBiometrics();
}

function scheduleSunSessionRehydrate() {
  // Self-heal sun-session doses + safety after engine math fixes. The
  // engineVersion stamp on each session lets us detect data computed
  // under an older (buggy) version and re-run hydrate. Fires async so
  // it doesn't block init; one network call per stale session,
  // serialized inside rehydrateStaleSessions. No-op when everything is
  // already stamped at the current version.
  if (typeof window.rehydrateStaleSessions === 'function') {
    setTimeout(() => {
      window.rehydrateStaleSessions().then(r => {
        if (r?.rehydrated) {
          // Surface in debug console only - not worth a user-facing
          // notification for a silent self-heal.
          if (window.console && console.log) console.log('[sun] self-healed', r.rehydrated, 'session(s) under v' + (window.SUN_ENGINE_VERSION || '?'));
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
  if (typeof window.hydrateDevicesFromPresets === 'function') {
    window.hydrateDevicesFromPresets().then(dirty => {
      if (dirty && window.console && console.log) console.log('[light] hydrated user devices from preset library');
    }).catch(() => {});
  }
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
        const { syncWearableSummary } = await import('./wearables-summary.js');
        const { listConnectedSources } = await import('./wearables-connect.js');
        await syncWearableSummary(state.currentProfile, listConnectedSources());
      }
    })
    .catch(() => { /* non-fatal; Safari can refuse IDB in some contexts */ });
}
