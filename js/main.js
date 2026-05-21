// main.js — Entry point and startup orchestration

import { state } from './state.js';
window._getActiveProfileId = () => state.currentProfile;
import './schema.js';
import './constants.js';
import './utils.js';
import { getTheme, setTheme } from './theme.js';
import { exchangeOpenRouterCode, saveOpenRouterKey, setAIProvider, fetchOpenRouterModels } from './api.js';
import { saveProfiles, getActiveProfileId, setActiveProfileId, getProfileSex, getProfileDob, profileStorageKey, migrateProfileData, initProfilesCache } from './profile.js';
import { updateHeaderDates, updateHeaderRangeToggle } from './data.js';
import { bindImportFileInput } from './import-file-input.js';
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
import { initWearableScheduler, handleOAuthCallbackOnLoad, loadWearableRuntimeConfig } from './wearables-connect.js';
import { migrateBiometricsToManual, hasManualData } from './wearables-manual.js';
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
import { initEncryption, initBroadcastChannel, initFolderBackup, encryptedGetItem, maybeShowBackupNudge } from './crypto.js';
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

  // Self-host OAuth client_id overrides — fire-and-forget. Resolves before
  // any user can click Connect (UI renders well after this microtask), so
  // beginConnectOAuth() picks up the overridden client_id when present.
  loadWearableRuntimeConfig();

  // Scheduled wearable sync (only fires when a source is connected)
  initWearableScheduler();

  // Migrate legacy data to profile system on first load
  if (!localStorage.getItem('labcharts-profiles')) {
    const profiles = [{ id: 'default', name: 'Default' }];
    await saveProfiles(profiles);
    setActiveProfileId('default');
    const oldImported = localStorage.getItem('labcharts-imported');
    if (oldImported) {
      // Route through encryptedSetItem so the destination key
      // (`labcharts-default-imported`) lands in IndexedDB rather than
      // localStorage. Otherwise this v1→v2 migration could fail when
      // the legacy blob is large enough to exceed the localStorage cap
      // even though it just barely fit at the old key.
      const { encryptedSetItem } = await import('./crypto.js');
      await encryptedSetItem(profileStorageKey('default', 'imported'), oldImported);
      localStorage.removeItem('labcharts-imported');
    }
    const oldUnits = localStorage.getItem('labcharts-units');
    if (oldUnits) {
      localStorage.setItem(profileStorageKey('default', 'units'), oldUnits);
      localStorage.removeItem('labcharts-units');
    }
  }
  // Populate profiles cache from (possibly encrypted) storage
  await initProfilesCache();
  // Load active profile BEFORE any OAuth callback handling — the callback
  // writes into state.importedData (wearableConnections for Oura) and
  // persists via saveImportedData, which keys off state.currentProfile. If
  // the callback runs first, saves land in the wrong profile's localStorage
  // and get orphaned the moment we swap profiles here.
  state.currentProfile = getActiveProfileId();
  const savedImported = await encryptedGetItem(profileStorageKey(state.currentProfile, 'imported'));
  if (savedImported) { try { state.importedData = JSON.parse(savedImported); if (!state.importedData.notes) state.importedData.notes = []; migrateProfileData(state.importedData); } catch(e) {} }

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
          // Surface in debug console only — not worth a user-facing
          // notification for a silent self-heal.
          if (window.console && console.log) console.log('[sun] self-healed', r.rehydrated, 'session(s) under v' + (window.SUN_ENGINE_VERSION || '?'));
        }
      }).catch(() => {});
    }, 1500); // give the engine modules time to settle
  }

  // Round 7: backfill channelGroups / modes / coupling onto user devices
  // that pre-date the schema additions. Without this, existing Maxi UVB
  // / Trinity device records have no `modes` array, so the session-log
  // dialog can't render the mode picker for them. Idempotent — re-runs
  // are no-ops once devices carry the fields.
  if (typeof window.hydrateDevicesFromPresets === 'function') {
    window.hydrateDevicesFromPresets().then(dirty => {
      if (dirty && window.console && console.log) console.log('[light] hydrated user devices from preset library');
    }).catch(() => {});
  }

  // Health Metrics unification (Commit 1/5): walk legacy importedData.biometrics
  // into the wearables IndexedDB with source: 'manual'. Idempotent — tagged in
  // the wearables meta store so it only runs once per profile. Old biometrics
  // data is preserved; the Edit Client modal keeps writing there during the
  // dual-write transition (cleanup lands in Commit 4).
  migrateBiometricsToManual(state.currentProfile, state.importedData?.biometrics)
    .then(async () => {
      // Rebuild the L2 summary on every load that has manual data — covers
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

  // Handle wearable OAuth2 callback (Oura / Withings / Ultrahuman / WHOOP / Fitbit) — must run
  // AFTER profile load so saveConnection writes to the active profile's state + localStorage.
  // Distinguishable by presence of a pending state entry in sessionStorage; if handled we skip
  // the OpenRouter path below so the same code isn't double-processed.
  const ouraHandled = await handleOAuthCallbackOnLoad();

  // Handle OpenRouter OAuth callback (?code=...)
  const urlParams = new URLSearchParams(window.location.search);
  const oauthCode = urlParams.get('code');
  const oauthState = urlParams.get('state');
  if (!ouraHandled && oauthCode) {
    history.replaceState(null, '', window.location.pathname);
    try {
      const key = await exchangeOpenRouterCode(oauthCode, oauthState);
      await saveOpenRouterKey(key);
      setAIProvider('openrouter');
      fetchOpenRouterModels(key);
      window._openChatAfterInit = true;
      window.showNotification('Connected to OpenRouter successfully!', 'success');
      // Proactive zero-balance check: a brand-new OpenRouter account has
      // no credits, and the user otherwise discovers this via a vanishing
      // 402 toast on their first AI call. Show the persistent dialog now
      // so they can add credits or pick a free model before getting lost.
      try {
        const { getOpenRouterBalance } = await import('./api.js');
        const balance = await getOpenRouterBalance();
        const remaining = balance?.remaining;
        if (typeof remaining === 'number' && Number.isFinite(remaining) && remaining <= 0 && window.showInsufficientBalanceDialog) {
          setTimeout(() => window.showInsufficientBalanceDialog(), 1500);
        }
      } catch {}
    } catch (e) {
      window.showNotification('OpenRouter connection failed: ' + e.message, 'error', 6000);
    }
  }

  // Prime sync state for UI, but let Evolu boot after first paint. Its
  // worker/OPFS startup is expensive and should not block dashboard LCP.
  primeSyncState();
  const savedUnits = localStorage.getItem(profileStorageKey(state.currentProfile, 'units'));
  if (savedUnits === 'US') state.unitSystem = 'US';
  const savedRange = localStorage.getItem(profileStorageKey(state.currentProfile, 'rangeMode'));
  state.rangeMode = savedRange === 'reference' ? 'reference' : savedRange === 'both' ? 'both' : 'optimal';
  state.profileSex = getProfileSex(state.currentProfile);
  state.profileDob = getProfileDob(state.currentProfile);
  document.querySelectorAll('.unit-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.unit === state.unitSystem);
  });
  document.querySelectorAll('.sex-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sex === state.profileSex);
  });
  document.querySelectorAll('.range-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === state.rangeMode);
  });
  const dobInputInit = document.getElementById('dob-input');
  if (dobInputInit) dobInputInit.value = state.profileDob || '';
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
