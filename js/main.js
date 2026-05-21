// main.js — Entry point and startup orchestration

import { state } from './state.js';
window._getActiveProfileId = () => state.currentProfile;
import './app-feature-modules.js';
import { initializeStartupFoundation } from './startup-foundation.js';
import { initializeProfileData } from './startup-profile.js';
import { handleStartupOAuthCallbacks } from './startup-oauth-callbacks.js';
import { renderStartupUI } from './startup-ui.js';
import { installEMFLazyFacade } from './emf-facade.js';
import { initializeStartupServices, runPostProfileStartupMaintenance } from './startup-maintenance.js';
import { installGlobalEventListeners, registerAppRefreshCallback } from './app-event-listeners.js';

installEMFLazyFacade();
installGlobalEventListeners();
registerAppRefreshCallback();

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
  await initializeStartupFoundation();

  initializeStartupServices();

  await initializeProfileData();

  runPostProfileStartupMaintenance();

  await handleStartupOAuthCallbacks();

  renderStartupUI();
});
