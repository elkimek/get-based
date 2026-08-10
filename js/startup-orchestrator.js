// @ts-check
// startup-orchestrator.js - app startup wiring and phase ordering

import { initializeStartupFoundation } from './startup-foundation.js';
import { initializeProfileData } from './startup-profile.js';
import { handleStartupOAuthCallbacks } from './startup-oauth-callbacks.js';
import { renderStartupUI } from './startup-ui.js';
import { runPostProfileStartupMaintenance } from './startup-maintenance.js';
import { installGlobalEventListeners, registerAppRefreshCallback } from './app-event-listeners.js';
import { showNotification } from './utils.js';
import { restorePendingImportReviewDraft } from './import-loader.js';
import { configureSyncLifecycleDeps } from './sync.js';
import { configureSyncModules } from './sync-configure.js';
import { disableSync, enableSync, pauseSync } from './sync-lifecycle.js';

let appStarted = false;

async function runStartupSequence() {
  await initializeStartupFoundation();

  await initializeProfileData();

  runPostProfileStartupMaintenance();

  await handleStartupOAuthCallbacks();

  renderStartupUI();

  await restorePendingImportReviewDraft();
}

function handleStartupSequenceError(error) {
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

  document.addEventListener('DOMContentLoaded', () => {
    runStartupSequence().catch(handleStartupSequenceError);
  });
}
