// @ts-check
// app-event-listeners.js - app-wide DOM event and refresh wiring

import { state } from './state.js';
import { registerRefreshCallback } from './data.js';
import { buildSidebar } from './nav.js';
import { endTour } from './tour.js';

let globalEventsBound = false;
let mouseDownInsideModal = false;
const appEventListenerDeps = {
  closeChangelog: () => {},
  closeChatPanel: () => {},
  closeClientList: () => {},
  closeEMFInterpretation: () => {},
  closeFeedbackModal: () => {},
  closeImportModal: () => {},
  closeLightEnvironmentAssessment: () => {},
  closeMobileSidebar: () => {},
  closeModal: () => {},
  closeReportBuilder: () => {},
  closeRestoreMnemonicDialog: () => {},
  closeSettingsModal: () => {},
  closeSummaryModal: () => {},
  closeSyncSetup: () => {},
  closeTweaksPanel: () => {},
  navigate: (..._args) => {},
  toggleChatPanel: () => {},
  updateChatNudge: () => {},
};

export function configureAppEventListeners(deps = {}) {
  const previous = { ...appEventListenerDeps };
  for (const [name, value] of Object.entries(deps || {})) {
    if (Object.prototype.hasOwnProperty.call(appEventListenerDeps, name) && typeof value === 'function') {
      appEventListenerDeps[name] = value;
    }
  }
  return previous;
}

function nudgeModal(overlay) {
  const modal = overlay.firstElementChild;
  if (!modal) return;
  modal.classList.add("modal-nudge");
  modal.addEventListener("animationend", () => modal.classList.remove("modal-nudge"), { once: true });
}

function reportAppEventListenerError(label, err) {
  console.error(`[app-event-listeners] ${label} failed:`, err);
}

/**
 * @param {string} label
 * @param {() => unknown} action
 */
function runAppEventListener(label, action) {
  try {
    const result = action();
    if (!result) return;
    const maybePromise = /** @type {{ catch?: (onRejected: (err: unknown) => unknown) => unknown }} */ (result);
    if (typeof maybePromise.catch === 'function') {
      maybePromise.catch((err) => reportAppEventListenerError(label, err));
    }
  } catch (err) {
    reportAppEventListenerError(label, err);
  }
}

function handleModalWheel(e) {
  const overlay = e.target.closest(".modal-overlay.show, .chat-backdrop.open");
  if (!overlay) return;
  // Allow scroll inside scrollable children (modal content, chat messages)
  const scrollable = e.target.closest(".chat-personality-custom-textarea, .light-setup-focus-body, .settings-content, .import-benchmarks-body, .dashboard-marker-widget-grid, .dashboard-biometric-widget-grid, .report-builder-scroll, .report-ai-summary-text, .modal, .chat-messages, .chat-thread-list, .cl-list, .cl-form-body, .cl-form, .pii-diff-left, .pii-diff-right, .dna-preview-body");
  if (scrollable) {
    const atTop = scrollable.scrollTop <= 0 && e.deltaY < 0;
    const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight && e.deltaY > 0;
    if (!atTop && !atBottom) return;
  }
  e.preventDefault();
}

function handleMouseDown(e) {
  mouseDownInsideModal = !!(e.target.closest('.modal, .confirm-dialog, #chat-panel, .emf-interp-modal'));
}

function handleDocumentClick(e) {
  // If mousedown started inside a modal, don't close on backdrop click (#87)
  if (mouseDownInsideModal) {
    mouseDownInsideModal = false;
    return;
  }
  // Read-only modals close on backdrop click.
  if (e.target.id === "modal-overlay") { appEventListenerDeps.closeModal(); return; }
  if (e.target.id === "light-env-assessment-overlay") { appEventListenerDeps.closeLightEnvironmentAssessment(); return; }
  if (e.target.id === "changelog-modal-overlay") { appEventListenerDeps.closeChangelog(); return; }
  if (e.target.id === "report-builder-overlay") { appEventListenerDeps.closeReportBuilder(); return; }
  // Auto-save modals close on backdrop click.
  if (e.target.id === "settings-modal-overlay") { appEventListenerDeps.closeSettingsModal(); return; }
  // Work-in-progress modals nudge instead of closing.
  const nudgeIds = ["import-modal-overlay", "feedback-modal-overlay"];
  if (nudgeIds.includes(e.target.id)) { nudgeModal(e.target); return; }
  // Client List nudges if editing form, closes if browsing list.
  if (e.target.id === "client-list-overlay") {
    if (document.querySelector('.cl-form')) nudgeModal(e.target);
    else appEventListenerDeps.closeClientList();
    return;
  }
  // Chat backdrop is pointer-events: none; clicks never reach it.
  const dd = document.getElementById("corr-options");
  const si = document.getElementById("corr-search");
  if (dd && si && !dd.contains(e.target) && e.target !== si) dd.classList.remove("show");
}

function handleRoleButtonKeydown(e) {
  if (e.key !== "Enter" && e.key !== " ") return;
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.getAttribute('role') !== 'button') return;
  if (t.tabIndex < 0) return;
  // Skip native interactives; they handle Space/Enter themselves.
  const tag = t.tagName;
  if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  // Don't fire twice if the element already has its own keydown wiring.
  if (t.hasAttribute('onkeydown') || t.hasAttribute('data-chat-key-action') || t.hasAttribute('data-chat-message-action')) return;
  e.preventDefault();
  t.click();
}

function handleAppKeydown(e) {
  if (e.key === "Escape") {
    // Passphrase overlay should not be dismissible via Escape.
    const passphraseOverlay = document.getElementById("passphrase-overlay");
    if (passphraseOverlay && passphraseOverlay.style.display === 'flex') return;
    const tourOverlay = document.getElementById("tour-overlay");
    if (tourOverlay) { endTour(); return; }
    const sidebarNav = document.getElementById("sidebar-nav");
    if (sidebarNav && sidebarNav.classList.contains("mobile-open")) { appEventListenerDeps.closeMobileSidebar(); return; }
    const emfInterpOverlay = document.getElementById("emf-interp-overlay");
    if (emfInterpOverlay && emfInterpOverlay.classList.contains("show")) { appEventListenerDeps.closeEMFInterpretation(); return; }
    const confirmOverlay = document.getElementById("confirm-dialog-overlay");
    if (confirmOverlay && confirmOverlay.classList.contains("show")) {
      if (confirmOverlay.dataset.escapeOwner) return;
      confirmOverlay.classList.remove("show");
      return;
    }
    // Sync restore dialog — single-step "paste your 24 words" modal.
    const syncRestoreOverlay = document.getElementById("sync-restore-overlay");
    if (syncRestoreOverlay && syncRestoreOverlay.classList.contains("show")) {
      runAppEventListener('closeRestoreMnemonicDialog', appEventListenerDeps.closeRestoreMnemonicDialog);
      return;
    }
    // Sync setup wizard — "New setup / Join existing" choice + generated seed.
    const syncSetupOverlay = document.getElementById("sync-setup-overlay");
    if (syncSetupOverlay && syncSetupOverlay.classList.contains("show")) {
      runAppEventListener('closeSyncSetup', appEventListenerDeps.closeSyncSetup);
      return;
    }
    const summaryOverlay = document.getElementById("summary-modal-overlay");
    if (summaryOverlay && summaryOverlay.classList.contains("show")) { appEventListenerDeps.closeSummaryModal(); return; }
    const chatPanel = document.getElementById("chat-panel");
    if (chatPanel && chatPanel.classList.contains("open")) { appEventListenerDeps.closeChatPanel(); return; }
    const importOverlay = document.getElementById("import-modal-overlay");
    if (importOverlay && importOverlay.classList.contains("show")) {
      if (!document.getElementById("import-modal")?.innerHTML.trim()) appEventListenerDeps.closeImportModal();
      return;
    }
    const changelogOverlay = document.getElementById("changelog-modal-overlay");
    if (changelogOverlay && changelogOverlay.classList.contains("show")) { appEventListenerDeps.closeChangelog(); return; }
    const reportBuilderOverlay = document.getElementById("report-builder-overlay");
    if (reportBuilderOverlay && reportBuilderOverlay.classList.contains("show")) { appEventListenerDeps.closeReportBuilder(); return; }
    const clientListOverlay = document.getElementById("client-list-overlay");
    if (clientListOverlay && clientListOverlay.classList.contains("show")) { appEventListenerDeps.closeClientList(); return; }
    const feedbackOverlay = document.getElementById("feedback-modal-overlay");
    if (feedbackOverlay && feedbackOverlay.classList.contains("show")) { appEventListenerDeps.closeFeedbackModal(); return; }
    const settingsOverlay = document.getElementById("settings-modal-overlay");
    if (settingsOverlay && settingsOverlay.classList.contains("show")) { appEventListenerDeps.closeSettingsModal(); return; }
    const tweaksOverlay = document.getElementById("tweaks-panel-overlay");
    if (tweaksOverlay && tweaksOverlay.classList.contains("show")) { appEventListenerDeps.closeTweaksPanel(); return; }
    const anonymousOverlays = document.querySelectorAll('.modal-overlay.show:not([id])');
    if (anonymousOverlays.length > 0) {
      anonymousOverlays[anonymousOverlays.length - 1].remove();
      return;
    }
    const lightEnvOverlay = document.getElementById("light-env-assessment-overlay");
    if (lightEnvOverlay && lightEnvOverlay.classList.contains("show")) { appEventListenerDeps.closeLightEnvironmentAssessment(); return; }
    const modalOverlay = document.getElementById("modal-overlay");
    if (modalOverlay && modalOverlay.classList.contains("show")) { appEventListenerDeps.closeModal(); return; }
    // Generic fallback: anonymous dynamically-injected overlays.
    const dynamicOverlays = document.querySelectorAll('.modal-overlay.show');
    if (dynamicOverlays.length > 0) {
      const top = dynamicOverlays[dynamicOverlays.length - 1];
      if (!top.id) { top.remove(); return; }
    }
    return;
  }

  // Focus trap for open modals. Sync overlays use `.confirm-overlay` too.
  if (e.key === "Tab") {
    const overlayIds = ["legal-consent-overlay", "client-list-overlay", "changelog-modal-overlay", "report-builder-overlay", "settings-modal-overlay", "tweaks-panel-overlay", "import-modal-overlay", "feedback-modal-overlay", "sync-restore-overlay", "sync-setup-overlay", "summary-modal-overlay", "light-env-assessment-overlay", "modal-overlay", "kb-modal-overlay", "ai-personalize-picker-overlay", "context-hub-overlay", "data-protection-picker-overlay"];
    for (const oid of overlayIds) {
      const ov = document.getElementById(oid);
      if (ov && ov.classList.contains("show")) {
        const openOverlays = Array.from(document.querySelectorAll('.modal-overlay.show, .confirm-overlay.show'));
        if (openOverlays.length && openOverlays[openOverlays.length - 1] !== ov) continue;
        const modal = ov.querySelector('[role="dialog"]') || ov.querySelector('.modal') || ov.querySelector('.confirm-dialog') || ov;
        const focusable = modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = /** @type {HTMLElement} */ (focusable[0]);
        const last = /** @type {HTMLElement} */ (focusable[focusable.length - 1]);
        if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
        else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
        return;
      }
    }
  }
  // Skip shortcuts when typing in an input/textarea or when modifier keys are held.
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key === "c" || e.key === "C") { e.preventDefault(); appEventListenerDeps.toggleChatPanel(); }
  if (e.key === "/") {
    e.preventDefault();
    const sb = /** @type {HTMLInputElement | null} */ (document.getElementById("sidebar-search"));
    if (sb) { sb.focus(); sb.select(); }
  }
}

export function installGlobalEventListeners() {
  if (globalEventsBound) return;
  globalEventsBound = true;
  document.addEventListener("wheel", handleModalWheel, { passive: false });
  document.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleRoleButtonKeydown);
  document.addEventListener("keydown", handleAppKeydown);
}

export function registerAppRefreshCallback() {
  registerRefreshCallback(() => {
    buildSidebar();
    // buildSidebar resets the sidebar's .active class to Dashboard by default.
    // Source the target view from state.currentView so refresh preserves place.
    appEventListenerDeps.navigate(state.currentView || 'dashboard');
    appEventListenerDeps.updateChatNudge();
  });
}
