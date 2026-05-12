// main.js — Entry point, DOMContentLoaded, global event listeners

import { state } from './state.js';
window._getActiveProfileId = () => state.currentProfile;
import './schema.js';
import './constants.js';
import './utils.js';
import { getTheme, setTheme } from './theme.js';
import { exchangeOpenRouterCode, saveOpenRouterKey, setAIProvider, fetchOpenRouterModels } from './api.js';
import { saveProfiles, getActiveProfileId, setActiveProfileId, getProfileSex, getProfileDob, profileStorageKey, migrateProfileData, initProfilesCache } from './profile.js';
import { updateHeaderDates, updateHeaderRangeToggle, registerRefreshCallback } from './data.js';
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
import './pdf-import.js';
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
import './client-list.js';
import './views.js';
import { initEncryption, initBroadcastChannel, initFolderBackup, encryptedGetItem, maybeShowBackupNudge } from './crypto.js';
import { initSync, renderSyncIndicator } from './sync.js';
import { initMeteoConfigCache } from './sun-uvdata.js';

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
    } catch (e) {
      window.showNotification('OpenRouter connection failed: ' + e.message, 'error', 6000);
    }
  }

  // Initialize Evolu sync after profile is loaded (needs state.currentProfile)
  await initSync();
  renderSyncIndicator();
  ensureSNPTable(); // Eagerly load SNP table if genetics data exists (e.g. after JSON import)
  ensureHaplogroupTable(); // Eagerly load haplogroup table if mtDNA data exists
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
  window.showDashboard();
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
  document.getElementById("pdf-input").addEventListener("change", async e => {
    if (window.isImportRunning && window.isImportRunning()) { e.target.value = ''; return; }
    if (e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const { jsonFiles, pdfFiles, imageFiles, dnaFiles, textFiles, unsupportedCount } = await window.classifyImportFiles(files);
      if (unsupportedCount > 0 && jsonFiles.length === 0 && pdfFiles.length === 0 && imageFiles.length === 0 && dnaFiles.length === 0 && textFiles.length === 0) {
        showNotification("Unsupported file type. Use PDF, text, image, JSON, or DNA raw data (.txt/.csv).", "error");
        e.target.value = '';
        return;
      }
      for (const f of jsonFiles) window.importDataJSON(f);
      if (dnaFiles.length > 0) {
        for (const f of dnaFiles) {
          const header = await f.slice(0, 1500).text();
          const fmt = window.detectDNAFile ? window.detectDNAFile(header) : null;
          if ((fmt === 'mtdna' || fmt === '23andme-mito') && window.handleMtDNAFile) await window.handleMtDNAFile(f);
          else if (fmt === '23andme-y') { showNotification('Y-chromosome DNA files are not supported', 'info'); }
          else await window.handleDNAFile(f);
        }
      }
      else if (textFiles.length > 0) { for (const f of textFiles) await window.handleTextFile(f); }
      else if (imageFiles.length > 0) { for (const f of imageFiles) await window.handleImageFile(f); }
      else {
        if (pdfFiles.length === 1) await window.handlePDFFile(pdfFiles[0]);
        else if (pdfFiles.length > 1) await window.handleBatchPDFs(pdfFiles);
      }
      e.target.value = '';
    }
  });
  // Prevent browser from opening dropped files outside drop zone
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => e.preventDefault());
});

// ═══════════════════════════════════════════════
// GLOBAL EVENT LISTENERS
// ═══════════════════════════════════════════════
// Prevent scroll bleed-through on modal overlays and chat backdrop
document.addEventListener("wheel", e => {
  const overlay = e.target.closest(".modal-overlay.show, .chat-backdrop.open");
  if (!overlay) return;
  // Allow scroll inside scrollable children (modal content, chat messages)
  const scrollable = e.target.closest(".modal, .chat-messages, .chat-thread-list, .cl-list, .cl-form, .pii-diff-left, .pii-diff-right, .dna-preview-body");
  if (scrollable) {
    const atTop = scrollable.scrollTop <= 0 && e.deltaY < 0;
    const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight && e.deltaY > 0;
    if (!atTop && !atBottom) return;
  }
  e.preventDefault();
}, { passive: false });

function nudgeModal(overlay) {
  const modal = overlay.firstElementChild;
  if (!modal) return;
  modal.classList.add("modal-nudge");
  modal.addEventListener("animationend", () => modal.classList.remove("modal-nudge"), { once: true });
}
// Track where mousedown started to prevent drag-from-inside closing modals (#87)
let _mouseDownInsideModal = false;
document.addEventListener("mousedown", e => {
  _mouseDownInsideModal = !!(e.target.closest('.modal, .confirm-dialog, #chat-panel, .emf-interp-modal'));
});
document.addEventListener("click", e => {
  // If mousedown started inside a modal, don't close on backdrop click (#87)
  if (_mouseDownInsideModal) { _mouseDownInsideModal = false; return; }
  // Read-only modals — close on backdrop click
  if (e.target.id === "modal-overlay") { window.closeModal(); return; }
  if (e.target.id === "changelog-modal-overlay") { window.closeChangelog(); return; }
  // Auto-save modals — close on backdrop click
  if (e.target.id === "settings-modal-overlay") { window.closeSettingsModal(); return; }
  // Work-in-progress modals — nudge instead of closing
  const nudgeIds = ["import-modal-overlay","feedback-modal-overlay"];
  if (nudgeIds.includes(e.target.id)) { nudgeModal(e.target); return; }
  // Client List — nudge if editing form, close if browsing list
  if (e.target.id === "client-list-overlay") {
    if (document.querySelector('.cl-form')) nudgeModal(e.target);
    else window.closeClientList();
    return;
  }
  // Chat backdrop is now pointer-events: none (the dashboard stays
  // interactive while chat is open) — clicks never reach it, so the
  // legacy nudge handler is removed.
  const dd = document.getElementById("corr-options");
  const si = document.getElementById("corr-search");
  if (dd && si && !dd.contains(e.target) && e.target !== si) dd.classList.remove("show");
});
// Global keyboard activation for `role="button" tabindex="0"` elements.
// Avoids the boilerplate of `onkeydown="if(event.key==='Enter'||...)..."` on
// every dynamic markup template — adding the two attributes is enough to
// make a clickable div Enter/Space activatable. Native button/a/input keep
// their own keyboard semantics; we only intercept when the role is button
// and we wouldn't be hijacking a form field.
document.addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.getAttribute('role') !== 'button') return;
  if (t.tabIndex < 0) return;
  // Skip native interactives — they handle Space/Enter themselves
  const tag = t.tagName;
  if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  // Don't fire twice if the element already has its own onkeydown shim
  if (t.hasAttribute('onkeydown')) return;
  e.preventDefault();
  t.click();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    // Passphrase overlay should not be dismissible via Escape
    const passphraseOverlay = document.getElementById("passphrase-overlay");
    if (passphraseOverlay && passphraseOverlay.style.display === 'flex') return;
    const tourOverlay = document.getElementById("tour-overlay");
    if (tourOverlay) { window.endTour(); return; }
    const sidebarNav = document.getElementById("sidebar-nav");
    if (sidebarNav && sidebarNav.classList.contains("mobile-open")) { window.closeMobileSidebar(); return; }
    const emfInterpOverlay = document.getElementById("emf-interp-overlay");
    if (emfInterpOverlay && emfInterpOverlay.classList.contains("show")) { window.closeEMFInterpretation(); return; }
    const confirmOverlay = document.getElementById("confirm-dialog-overlay");
    if (confirmOverlay && confirmOverlay.classList.contains("show")) { confirmOverlay.classList.remove("show"); return; }
    // Sync restore dialog — single-step "paste your 24 words" modal.
    const syncRestoreOverlay = document.getElementById("sync-restore-overlay");
    if (syncRestoreOverlay && syncRestoreOverlay.classList.contains("show")) {
      if (window.closeRestoreMnemonicDialog) window.closeRestoreMnemonicDialog();
      else syncRestoreOverlay.classList.remove("show");
      return;
    }
    // Sync setup wizard — "New setup / Join existing" choice + generated seed.
    const syncSetupOverlay = document.getElementById("sync-setup-overlay");
    if (syncSetupOverlay && syncSetupOverlay.classList.contains("show")) {
      if (window.closeSyncSetup) window.closeSyncSetup();
      else syncSetupOverlay.classList.remove("show");
      return;
    }
    const chatPanel = document.getElementById("chat-panel");
    if (chatPanel && chatPanel.classList.contains("open")) { window.closeChatPanel(); return; }
    const importOverlay = document.getElementById("import-modal-overlay");
    if (importOverlay && importOverlay.classList.contains("show")) {
      if (!document.getElementById("import-modal").innerHTML.trim()) window.closeImportModal();
      return;
    }
    const changelogOverlay = document.getElementById("changelog-modal-overlay");
    if (changelogOverlay && changelogOverlay.classList.contains("show")) { window.closeChangelog(); return; }
    const clientListOverlay = document.getElementById("client-list-overlay");
    if (clientListOverlay && clientListOverlay.classList.contains("show")) { window.closeClientList(); return; }
    const feedbackOverlay = document.getElementById("feedback-modal-overlay");
    if (feedbackOverlay && feedbackOverlay.classList.contains("show")) { window.closeFeedbackModal(); return; }
    const settingsOverlay = document.getElementById("settings-modal-overlay");
    if (settingsOverlay && settingsOverlay.classList.contains("show")) { window.closeSettingsModal(); return; }
    const modalOverlay = document.getElementById("modal-overlay");
    if (modalOverlay && modalOverlay.classList.contains("show")) { window.closeModal(); return; }
    // Generic fallback: any dynamically-injected `.modal-overlay.show` (sun
    // sessions, light tools, conditions inspect, etc.) gets dismissed by
    // removing its top-most overlay. Skip overlays with explicit close
    // wiring above. Last resort so Escape never silently no-ops.
    const dynamicOverlays = document.querySelectorAll('.modal-overlay.show');
    if (dynamicOverlays.length > 0) {
      const top = dynamicOverlays[dynamicOverlays.length - 1];
      if (!top.id) { top.remove(); return; } // only remove anonymous (id-less) overlays we created on the fly
    }
    return;
  }
  // Focus trap for open modals. Sync overlays use `.confirm-overlay` not
  // `.modal-overlay` — include them so Tab doesn't escape back to the page
  // while the modal is visible.
  if (e.key === "Tab") {
    const overlayIds = ["client-list-overlay","changelog-modal-overlay","settings-modal-overlay","import-modal-overlay","feedback-modal-overlay","sync-restore-overlay","sync-setup-overlay","modal-overlay","kb-modal-overlay","ai-personalize-picker-overlay","data-protection-picker-overlay"];
    for (const oid of overlayIds) {
      const ov = document.getElementById(oid);
      if (ov && ov.classList.contains("show")) {
        const modal = ov.querySelector('[role="dialog"]') || ov.querySelector('.modal') || ov.querySelector('.confirm-dialog') || ov;
        const focusable = modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
        else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
        return;
      }
    }
  }
  // Skip shortcuts when typing in an input/textarea or when modifier keys are held
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key === "c" || e.key === "C") { e.preventDefault(); window.toggleChatPanel(); }
  if (e.key === "/") { e.preventDefault(); const sb = document.getElementById("sidebar-search"); if (sb) { sb.focus(); sb.select(); } }
});

// ═══════════════════════════════════════════════
// REFRESH CALLBACK
// ═══════════════════════════════════════════════
registerRefreshCallback(() => {
  buildSidebar();
  // buildSidebar resets the sidebar's .active class to Dashboard by
  // default. Source the target view from state.currentView (kept in
  // sync by navigate) — re-reading the DOM here would always pick up
  // Dashboard and bounce the user away from their current view on
  // every refresh.
  window.navigate(state.currentView || 'dashboard');
  window.updateChatNudge();
});
