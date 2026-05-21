// main.js — Entry point and startup orchestration

import { state } from './state.js';
window._getActiveProfileId = () => state.currentProfile;
import './schema.js';
import './constants.js';
import './utils.js';
import { initializeStartupFoundation } from './startup-foundation.js';
import { initializeProfileData } from './startup-profile.js';
import { handleStartupOAuthCallbacks } from './startup-oauth-callbacks.js';
import { renderStartupUI } from './startup-ui.js';
import { installEMFLazyFacade } from './emf-facade.js';
import './pii.js';
import './charts.js';
import './notes.js';
import './supplements.js';
import './recommendations.js';
import './cycle.js';
import './context-cards.js';
import './dna.js';
import './wearables.js';
import { initializeStartupServices, runPostProfileStartupMaintenance } from './startup-maintenance.js';
import './sun-uvdata.js';
import './sun-spectrum.js';
import './sun.js';
import './sun-ai-analysis.js';
import './sun-context.js';
import './light-devices.js';
import './light-device-ai-analysis.js';
import './light-tools.js';
import './light-tools-ai-analysis.js';
import './light-env.js';
import './light-env-ai-analysis.js';
import './light-screen-ai-analysis.js';
import './light-audit-ai-analysis.js';
import './light-burden-ai-analysis.js';
import './light-channels-ai-analysis.js';
import './sun-defaults.js';
import './sun-onboarding-ai.js';
import './sun-correlations.js';
import './light-today-ai.js';
import './export.js';
import './chat.js';
import './image-utils.js';
import './settings.js';
import './lens.js';
import './cashu-wallet.js';
import './nostr-discovery.js';
import './feedback.js';
import './tour.js';
import './touch-tooltip.js';
import { installGlobalEventListeners, registerAppRefreshCallback } from './app-event-listeners.js';
import './client-list.js';
import './views.js';

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
