// startup-orchestrator.js - app startup wiring and phase ordering

import { state } from './state.js';
import { initializeStartupFoundation } from './startup-foundation.js';
import { initializeProfileData } from './startup-profile.js';
import { handleStartupOAuthCallbacks } from './startup-oauth-callbacks.js';
import { renderStartupUI } from './startup-ui.js';
import { installEMFLazyFacade } from './emf-facade.js';
import { initializeStartupServices, runPostProfileStartupMaintenance } from './startup-maintenance.js';
import { installGlobalEventListeners, registerAppRefreshCallback } from './app-event-listeners.js';

let appStarted = false;

async function runStartupSequence() {
  await initializeStartupFoundation();

  initializeStartupServices();

  await initializeProfileData();

  runPostProfileStartupMaintenance();

  await handleStartupOAuthCallbacks();

  renderStartupUI();
}

export function startApp() {
  if (appStarted) return;
  appStarted = true;

  window._getActiveProfileId = () => state.currentProfile;
  installEMFLazyFacade();
  installGlobalEventListeners();
  registerAppRefreshCallback();

  document.addEventListener('DOMContentLoaded', runStartupSequence);
}
