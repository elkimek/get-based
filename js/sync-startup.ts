// Local save ordering, context delivery and the header remain ready without
// starting or importing the opt-in cross-device transport.
import { isSyncConfigured, isSyncEnabled } from './sync-settings-state.js';
import { configureSyncSaveHooks, bindSyncSaveHookEvents } from './sync-save-hooks.js';
import { configureSyncUI, initSyncUIDelegates, bindSyncUIStatusUpdates } from './sync-ui.js';
import { configureSyncMessenger, configureSyncMessengerContextPreparation, buildDefaultSyncMessengerContext } from './sync-messenger.js';
import { getProfiles } from './profile-list-store.js';
import { getSyncRelay } from './sync-environment.js';
import { getSyncAppOwner } from './sync-runtime.js';
import { loadLabContextBuilder } from './lab-context-loader.js';
import { buildWearableSeriesSection, getAgentWearableSeriesDays } from './lab-context-wearables.js';
import { state } from './state.js';

function withCurrentProfileSync(work: (module: typeof import('./sync.js')) => unknown) {
  const profile = state.currentProfile, root = state.importedData;
  return import('./sync.js').then(module => state.currentProfile === profile && state.importedData === root ? work(module) : false);
}

export function configureStartupSync() {
  configureSyncSaveHooks({ isSyncConfigured, isSyncEnabled, getProfiles });
  bindSyncSaveHookEvents();
  configureSyncMessenger({ getSyncRelay, getAppOwner: getSyncAppOwner,
    buildLabContext: buildDefaultSyncMessengerContext, buildWearableSeriesSection, getAgentWearableSeriesDays, getProfiles });
  configureSyncMessengerContextPreparation(loadLabContextBuilder);
  configureSyncUI({ isSyncEnabled,
    syncNow: () => import('./sync.js').then(module => module.syncNow()),
    forceResendCurrentProfile: () => withCurrentProfileSync(module => module.forceResendCurrentProfile()),
    cleanStorage: () => withCurrentProfileSync(module => module.cleanStorage()),
    checkRelayConnection: () => import('./sync.js').then(module => module.checkRelayConnection()),
    showSyncDiagnose: () => import('./sync.js').then(module => module.showSyncDiagnose()),
  });
  initSyncUIDelegates();
  bindSyncUIStatusUpdates();
}
