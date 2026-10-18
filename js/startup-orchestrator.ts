// startup-orchestrator.js - app startup wiring and phase ordering

import { initializeStartupFoundation } from './startup-foundation.js';
import { initializeProfileData } from './startup-profile.js';
import { handleStartupOAuthCallbacks } from './startup-oauth-callbacks.js';
import { renderStartupUI, finishStartupNavigation } from './startup-ui.js';
import { runPostProfileStartupMaintenance } from './startup-maintenance.js';
import { installGlobalEventListeners, registerAppRefreshCallback } from './app-event-listeners.js';
import { showNotification } from './utils.js';
import { restorePendingImportReviewDraft } from './import-loader.js';
import { configureSyncLifecycleDeps } from './sync.js';
import { configureSyncModules } from './sync-configure.js';
import { disableSync, enableSync, pauseSync } from './sync-lifecycle.js';
import { runAppExtensionStartup } from './app-extension-runtime.js';

let appStarted = false;

async function runStartupSequence() {
  await initializeStartupFoundation();

  await initializeProfileData();

  runPostProfileStartupMaintenance();

  await handleStartupOAuthCallbacks();

  // A saved route may need its first module/styles before its controls exist.
  await renderStartupUI();

  // Edition-specific maintenance runs after the public shell is usable and
  // never delays core startup. The public build has a safe no-op adapter.
  runAppExtensionStartup();

  await restorePendingImportReviewDraft();

  // A resize or user navigation can replace the saved route while later
  // bootstrap stages run. Recheck synchronously after each wait so a newer
  // pending owner cannot slip between completion and publishing appReady.
  for (let completion = finishStartupNavigation(); completion !== undefined; completion = finishStartupNavigation()) {
    await completion;
  }

  // `load` only means the static shell arrived. Profile and local nutrition
  // hydration are asynchronous, so consumers that start changing state must
  // wait for this explicit boundary or startup can overwrite their changes.
  document.documentElement.dataset.appReady = '';
}

function handleStartupSequenceError(error: unknown) {
  console.error('Startup initialization failed', error);
  showNotification('Startup failed. Try reloading the app.', 'error', 6000);
}

function configureSyncComposition() {
  configureSyncLifecycleDeps({ enableSync, disableSync, pauseSync });
  configureSyncModules({ enableSync });
}

export function startApp() {
  if (appStarted) return;
  appStarted = true;

  configureSyncComposition();
  installGlobalEventListeners();
  registerAppRefreshCallback();

  const initialize = () => { runStartupSequence().catch(handleStartupSequenceError); };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
}
