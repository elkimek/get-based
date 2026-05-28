// app-event-listeners.js - app-wide DOM event and refresh wiring

import { state } from './state.js';
import { registerRefreshCallback } from './data.js';
import { buildSidebar } from './nav.js';

let globalEventsBound = false;
let mouseDownInsideModal = false;

function nudgeModal(overlay) {
  const modal = overlay.firstElementChild;
  if (!modal) return;
  modal.classList.add("modal-nudge");
  modal.addEventListener("animationend", () => modal.classList.remove("modal-nudge"), { once: true });
}

function handleModalWheel(e) {
  const overlay = e.target.closest(".modal-overlay.show, .chat-backdrop.open");
  if (!overlay) return;
  // Allow scroll inside scrollable children (modal content, chat messages)
  const scrollable = e.target.closest(".light-setup-focus-body, .settings-content, .dashboard-marker-widget-grid, .dashboard-biometric-widget-grid, .modal, .chat-messages, .chat-thread-list, .cl-list, .cl-form-body, .cl-form, .pii-diff-left, .pii-diff-right, .dna-preview-body");
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
  if (e.target.id === "modal-overlay") { window.closeModal(); return; }
  if (e.target.id === "light-env-assessment-overlay") { window.closeLightEnvironmentAssessment?.(); return; }
  if (e.target.id === "changelog-modal-overlay") { window.closeChangelog(); return; }
  // Auto-save modals close on backdrop click.
  if (e.target.id === "settings-modal-overlay") { window.closeSettingsModal(); return; }
  // Work-in-progress modals nudge instead of closing.
  const nudgeIds = ["import-modal-overlay", "feedback-modal-overlay"];
  if (nudgeIds.includes(e.target.id)) { nudgeModal(e.target); return; }
  // Client List nudges if editing form, closes if browsing list.
  if (e.target.id === "client-list-overlay") {
    if (document.querySelector('.cl-form')) nudgeModal(e.target);
    else window.closeClientList();
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
  // Don't fire twice if the element already has its own onkeydown shim.
  if (t.hasAttribute('onkeydown')) return;
  e.preventDefault();
  t.click();
}

function handleAppKeydown(e) {
  if (e.key === "Escape") {
    // Passphrase overlay should not be dismissible via Escape.
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
    const tweaksOverlay = document.getElementById("tweaks-panel-overlay");
    if (tweaksOverlay && tweaksOverlay.classList.contains("show")) { window.closeTweaksPanel(); return; }
    const anonymousOverlays = document.querySelectorAll('.modal-overlay.show:not([id])');
    if (anonymousOverlays.length > 0) {
      anonymousOverlays[anonymousOverlays.length - 1].remove();
      return;
    }
    const lightEnvOverlay = document.getElementById("light-env-assessment-overlay");
    if (lightEnvOverlay && lightEnvOverlay.classList.contains("show")) { window.closeLightEnvironmentAssessment?.(); return; }
    const modalOverlay = document.getElementById("modal-overlay");
    if (modalOverlay && modalOverlay.classList.contains("show")) { window.closeModal(); return; }
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
    const overlayIds = ["client-list-overlay", "changelog-modal-overlay", "settings-modal-overlay", "tweaks-panel-overlay", "import-modal-overlay", "feedback-modal-overlay", "sync-restore-overlay", "sync-setup-overlay", "light-env-assessment-overlay", "modal-overlay", "kb-modal-overlay", "ai-personalize-picker-overlay", "data-protection-picker-overlay"];
    for (const oid of overlayIds) {
      const ov = document.getElementById(oid);
      if (ov && ov.classList.contains("show")) {
        const openOverlays = Array.from(document.querySelectorAll('.modal-overlay.show'));
        if (openOverlays.length && openOverlays[openOverlays.length - 1] !== ov) continue;
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
  // Skip shortcuts when typing in an input/textarea or when modifier keys are held.
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key === "c" || e.key === "C") { e.preventDefault(); window.toggleChatPanel(); }
  if (e.key === "/") {
    e.preventDefault();
    const sb = document.getElementById("sidebar-search");
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
    window.navigate(state.currentView || 'dashboard');
    window.updateChatNudge();
  });
}
