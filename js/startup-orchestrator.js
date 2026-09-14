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
import { runAppExtensionStartup } from './app-extension-runtime.js';

let appStarted = false;

async function runStartupSequence() {
  console.log('STARTUP before initializeStartupFoundation()');
  await initializeStartupFoundation();
  console.log('STARTUP after initializeStartupFoundation()');

  console.log('STARTUP before initializeProfileData()');
  await initializeProfileData();
  console.log('STARTUP after initializeProfileData()');

  runPostProfileStartupMaintenance();

  console.log('STARTUP before handleStartupOAuthCallbacks()');
  await handleStartupOAuthCallbacks();
  console.log('STARTUP after handleStartupOAuthCallbacks()');

  renderStartupUI();

  // Edition-specific maintenance runs after the public shell is usable and
  // never delays core startup. The public build has a safe no-op adapter.
  runAppExtensionStartup();

  console.log('STARTUP before restorePendingImportReviewDraft()');
  await restorePendingImportReviewDraft();
  console.log('STARTUP after restorePendingImportReviewDraft()');

  // `load` only means the static shell arrived. Profile and local nutrition
  // hydration are asynchronous, so consumers that start changing state must
  // wait for this explicit boundary or startup can overwrite their changes.
  document.documentElement.dataset.appReady = '';
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
  console.log('STARTUP startApp', document.readyState);

  configureSyncComposition();
  installGlobalEventListeners();
  registerAppRefreshCallback();

  document.addEventListener('DOMContentLoaded', () => {
    runStartupSequence().catch(handleStartupSequenceError);
  });
}
