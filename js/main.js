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
import './export.js';
import './chat.js';
import './image-utils.js';
import './settings.js';
import './cashu-wallet.js';
import './nostr-discovery.js';
import './glossary.js';
import './feedback.js';
import './tour.js';
import { maybeShowChangelog } from './changelog.js';
import { buildSidebar, renderProfileDropdown } from './nav.js';
import './client-list.js';
import './views.js';
import { initEncryption, initBroadcastChannel, initFolderBackup, encryptedGetItem, maybeShowBackupNudge } from './crypto.js';
import { initSync, renderSyncIndicator } from './sync.js';

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize encryption (shows passphrase modal if enabled, blocks until unlocked)
  await initEncryption();
  // Initialize cross-tab sync
  initBroadcastChannel();
  // Initialize folder backup (restore persisted handle, check permission)
  await initFolderBackup();

  // Handle OpenRouter OAuth callback (?code=...)
  const urlParams = new URLSearchParams(window.location.search);
  const oauthCode = urlParams.get('code');
  if (oauthCode) {
    history.replaceState(null, '', window.location.pathname);
    try {
      const key = await exchangeOpenRouterCode(oauthCode);
      await saveOpenRouterKey(key);
      setAIProvider('openrouter');
      fetchOpenRouterModels(key);
      window._openChatAfterInit = true;
      window.showNotification('Connected to OpenRouter successfully!', 'success');
    } catch (e) {
      window.showNotification('OpenRouter connection failed: ' + e.message, 'error', 6000);
    }
  }

  // Migrate legacy data to profile system on first load
  if (!localStorage.getItem('labcharts-profiles')) {
    const profiles = [{ id: 'default', name: 'Default' }];
    await saveProfiles(profiles);
    setActiveProfileId('default');
    const oldImported = localStorage.getItem('labcharts-imported');
    if (oldImported) {
      localStorage.setItem(profileStorageKey('default', 'imported'), oldImported);
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
  // Load active profile
  state.currentProfile = getActiveProfileId();
  const savedImported = await encryptedGetItem(profileStorageKey(state.currentProfile, 'imported'));
  if (savedImported) { try { state.importedData = JSON.parse(savedImported); if (!state.importedData.notes) state.importedData.notes = []; migrateProfileData(state.importedData); } catch(e) {} }
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
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
  }
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
      const jsonFiles = files.filter(f => f.name.endsWith('.json') || f.type === 'application/json');
      const pdfFiles = files.filter(f => f.name.endsWith('.pdf') || f.type === 'application/pdf');
      const imageFiles = files.filter(f => /\.(jpe?g|png|webp)$/i.test(f.name) || f.type?.startsWith('image/'));
      const dnaFiles = files.filter(f => window.isDNAFile && window.isDNAFile(f));
      // Unmatched .txt/.csv files — check content for DNA format
      const textFiles = [];
      const unmatched = files.filter(f => !jsonFiles.includes(f) && !pdfFiles.includes(f) && !imageFiles.includes(f) && !dnaFiles.includes(f) && /\.(txt|csv)$/i.test(f.name));
      for (const f of unmatched) {
        if (window.isDNAFileByContent && await window.isDNAFileByContent(f)) dnaFiles.push(f);
        else if (f.name.endsWith('.txt')) textFiles.push(f);
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
  const scrollable = e.target.closest(".modal, .glossary-modal, .chat-messages, .chat-thread-list, .cl-list, .cl-form, .pii-diff-left, .pii-diff-right, .dna-preview-body");
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
  if (e.target.id === "glossary-modal-overlay") { window.closeGlossary(); return; }
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
  // Chat panel — nudge (mid-conversation)
  if (e.target.id === "chat-backdrop") { const cp = document.getElementById("chat-panel"); if (cp) { cp.classList.add("modal-nudge"); cp.addEventListener("animationend", () => cp.classList.remove("modal-nudge"), { once: true }); } return; }
  const dd = document.getElementById("corr-options");
  const si = document.getElementById("corr-search");
  if (dd && si && !dd.contains(e.target) && e.target !== si) dd.classList.remove("show");
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
    const glossaryOverlay = document.getElementById("glossary-modal-overlay");
    if (glossaryOverlay && glossaryOverlay.classList.contains("show")) { window.closeGlossary(); return; }
    const settingsOverlay = document.getElementById("settings-modal-overlay");
    if (settingsOverlay && settingsOverlay.classList.contains("show")) { window.closeSettingsModal(); return; }
    const modalOverlay = document.getElementById("modal-overlay");
    if (modalOverlay && modalOverlay.classList.contains("show")) { window.closeModal(); return; }
    return;
  }
  // Focus trap for open modals
  if (e.key === "Tab") {
    const overlayIds = ["client-list-overlay","changelog-modal-overlay","settings-modal-overlay","import-modal-overlay","glossary-modal-overlay","feedback-modal-overlay","modal-overlay"];
    for (const oid of overlayIds) {
      const ov = document.getElementById(oid);
      if (ov && ov.classList.contains("show")) {
        const modal = ov.querySelector('[role="dialog"]') || ov.querySelector('.modal') || ov;
        const focusable = modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])');
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
  const activeNav = document.querySelector('.nav-item.active');
  window.navigate(activeNav ? activeNav.dataset.category : 'dashboard');
  window.updateChatNudge();
});
