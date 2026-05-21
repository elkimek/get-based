// main.js — Entry point and startup orchestration

import { state } from './state.js';
window._getActiveProfileId = () => state.currentProfile;
import './schema.js';
import './constants.js';
import './utils.js';
import { getTheme, setTheme } from './theme.js';
import { updateHeaderDates, updateHeaderRangeToggle } from './data.js';
import { bindImportFileInput } from './import-file-input.js';
import { initializeProfileData, applyProfileDisplayState } from './startup-profile.js';
import { handleStartupOAuthCallbacks } from './startup-oauth-callbacks.js';
import './pii.js';
import './charts.js';
import './notes.js';
import './supplements.js';
import './recommendations.js';
import './cycle.js';
import './context-cards.js';
// emf.js is lazy-loaded on first use (1053 lines, only needed when user opens EMF editor)
const _emfFns = ['openEMFAssessmentEditor','addEMFAssessment','toggleEMFAssessment','selectEMFRoom','handleEMFRoomDropdown','addEMFRoom','removeEMFRoom','deleteEMFAssessment','updateEMFField','updateEMFRoom','updateEMFMeasurement','updateEMFMeter','saveEMFExplicit','toggleEMFCompare','interpretEMFAssessment','interpretEMFComparison','closeEMFInterpretation','discussEMFInterpretation','addEMFPhotos','removeEMFPhoto','viewEMFPhoto','handleEMFPDF'];
for (const fn of _emfFns) {
  window[fn] = async function(...args) { const mod = await import('./emf.js'); for (const f of _emfFns) window[f] = mod[f]; return mod[fn](...args); };
}
import { ensureSNPTable, ensureHaplogroupTable } from './dna.js';
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
import { maybeShowChangelog } from './changelog.js';
import { buildSidebar, renderProfileDropdown } from './nav.js';
import { installGlobalEventListeners, registerAppRefreshCallback } from './app-event-listeners.js';
import './client-list.js';
import './views.js';
import { initEncryption, initBroadcastChannel, initFolderBackup, maybeShowBackupNudge } from './crypto.js';
import { initSync, primeSyncState, renderSyncIndicator } from './sync.js';
import { initMeteoConfigCache } from './sun-uvdata.js';

installGlobalEventListeners();
registerAppRefreshCallback();

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize encryption (shows passphrase modal if enabled, blocks until unlocked)
  await initEncryption();
  // Decrypt the meteo config (selfhostBearer is sensitive at-rest — see
  // sun-uvdata.js header note). Run AFTER initEncryption so the session
  // key is available to encryptedGetItem; the cache is then sync-readable
  // by getMeteoConfig() callers (sun-context.js, settings.js, providers).
  await initMeteoConfigCache();
  // Initialize cross-tab sync
  initBroadcastChannel();
  // Initialize folder backup (restore persisted handle, check permission)
  await initFolderBackup();

  initializeStartupServices();

  await initializeProfileData();

  runPostProfileStartupMaintenance();

  await handleStartupOAuthCallbacks();

  // Prime sync state for UI, but let Evolu boot after first paint. Its
  // worker/OPFS startup is expensive and should not block dashboard LCP.
  primeSyncState();
  applyProfileDisplayState();
  setTheme(getTheme());
  // Populate footer version early (doesn't depend on dashboard render)
  const vTextEl = document.getElementById('app-version-text');
  if (vTextEl) vTextEl.textContent = window.APP_VERSION || '';
  buildSidebar();
  renderSyncIndicator();
  window.navigate(window.getInitialView?.() || 'dashboard');
  requestAnimationFrame(() => setTimeout(() => {
    initSync()
      .then(() => renderSyncIndicator())
      .catch(e => console.warn('[sync] deferred init failed:', e));
    ensureSNPTable(); // Eagerly load SNP table if genetics data exists (e.g. after JSON import)
    ensureHaplogroupTable(); // Eagerly load haplogroup table if mtDNA data exists
  }, 0));
  maybeShowChangelog();
  // First-launch transparency banner about anonymous analytics — appears once,
  // never again after the user clicks either "Got it" or "Turn off".
  setTimeout(() => window.maybeShowAnalyticsConsent?.(), 800);
  setTimeout(() => {
    const overlay = document.getElementById('passphrase-overlay');
    if (overlay && overlay.style.display === 'flex') return;
    maybeShowBackupNudge();
  }, 1500);
  if (window._openSettingsAfterInit) {
    window.openSettingsModal(window._openSettingsAfterInit);
    delete window._openSettingsAfterInit;
  }
  if (window._openChatAfterInit) {
    delete window._openChatAfterInit;
    setTimeout(() => window.openChatPanel(), 500);
  }
  updateHeaderDates();
  updateHeaderRangeToggle();
  renderProfileDropdown();
  // Init chat image attachment handlers (paste, drag-drop, file input)
  window.initChatImageHandlers();
  window.updateAttachButtonVisibility();
  window.updateChatNudge();
  bindImportFileInput();
});
