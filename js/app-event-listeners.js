// @ts-check
// app-event-listeners.js - app-wide DOM event and refresh wiring

import { state } from './state.js';
import { registerRefreshCallback } from './data.js';
import { buildSidebar, refreshAgentProposalNavBadge } from './nav.js';
import { endTour } from './tour.js';

let globalEventsBound = false;
let mouseDownInsideModal = false;
const APP_MODAL_OVERLAY_SELECTOR = '.modal-overlay.show,.confirm-overlay.show,.tweaks-overlay.show,[data-modal-focus-trap]';
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
const ESCAPE_CLOSE_ACTIONS = [
  ['sync-restore-overlay', 'closeRestoreMnemonicDialog'],
  ['sync-setup-overlay', 'closeSyncSetup'],
  ['summary-modal-overlay', 'closeSummaryModal'],
  ['chat-panel', 'closeChatPanel'],
  ['import-modal-overlay', 'closeImportModal'],
  ['changelog-modal-overlay', 'closeChangelog'],
  ['report-builder-overlay', 'closeReportBuilder'],
  ['client-list-overlay', 'closeClientList'],
  ['feedback-modal-overlay', 'closeFeedbackModal'],
  ['settings-modal-overlay', 'closeSettingsModal'],
  ['tweaks-panel-overlay', 'closeTweaksPanel'],
  ['light-env-assessment-overlay', 'closeLightEnvironmentAssessment'],
  ['modal-overlay', 'closeModal'],
];

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

function modalDismissProtected(overlay) {
  return !!overlay?.hasAttribute('data-modal-dismiss-protected');
}

function topmostModalOverlay() {
  const overlays = document.querySelectorAll(APP_MODAL_OVERLAY_SELECTOR);
  return /** @type {HTMLElement | null} */ (overlays[overlays.length - 1] || null);
}

function clickTopmostModalClose(overlay) {
  const closeButton = /** @type {HTMLElement | null | undefined} */ (
    overlay?.querySelector('.modal-close:not([disabled])')
  );
  closeButton?.click();
  return !!closeButton;
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
  if (!e.deltaY) return;
  // Let the nearest eligible surface that can move in this direction consume
  // the wheel. A non-scrolling child (or a child at its edge) must not trap the
  // wheel before a scrollable modal ancestor gets it.
  const selector = ".chat-personality-custom-textarea, .light-setup-focus-body, .settings-content, .import-benchmarks-body, .dashboard-marker-widget-grid, .dashboard-biometric-widget-grid, .report-builder-scroll, .report-ai-summary-text, .nutrition-comparison-models, .legal-consent-modal, .modal, .chat-messages, .chat-thread-list, .cl-list, .cl-form-body, .cl-form, .pii-diff-left, .pii-diff-right, .dna-preview-body";
  let scrollable = e.target.closest(selector);
  while (scrollable && overlay.contains(scrollable)) {
    const hasOverflow = scrollable.scrollHeight > scrollable.clientHeight + 1;
    const canScrollUp = hasOverflow && e.deltaY < 0 && scrollable.scrollTop > 0;
    const canScrollDown = hasOverflow && e.deltaY > 0
      && scrollable.scrollTop + scrollable.clientHeight < scrollable.scrollHeight - 1;
    if (canScrollUp || canScrollDown) return;
    scrollable = scrollable.parentElement?.closest(selector) || null;
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
  // Read-only modals close on backdrop click. Editors with unsaved or costly
  // work can opt out and provide their own explicit close flow.
  if (e.target.id === "modal-overlay") {
    if (modalDismissProtected(e.target) && e.target.hasAttribute('data-modal-background-dismissible')) clickTopmostModalClose(e.target);
    else if (modalDismissProtected(e.target)) nudgeModal(e.target);
    else appEventListenerDeps.closeModal();
    return;
  }
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
  // Feature overlays that are not part of the original shell registry still
  // get consistent backdrop behavior through their own visible close action.
  const genericOverlay = e.target instanceof HTMLElement
    && e.target.matches('.modal-overlay.show,.confirm-overlay.show,.tweaks-overlay.show')
    ? e.target
    : null;
  if (genericOverlay && genericOverlay === topmostModalOverlay()) {
    if (genericOverlay.hasAttribute('data-modal-lifecycle-managed')) return;
    if (modalDismissProtected(genericOverlay)) nudgeModal(genericOverlay);
    else clickTopmostModalClose(genericOverlay);
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
    const topOverlay = topmostModalOverlay();
    // Appended workflows install their own Escape handler so their cleanup
    // callback (camera tracks, live listeners, draft confirmation, etc.) runs.
    if (topOverlay?.hasAttribute('data-modal-lifecycle-managed')) return;
    const aiDecisionOverlay = [
      'cloud-ai-consent-overlay',
      'ai-route-confirmation-overlay',
      'ai-transparency-overlay',
    ].map(id => document.getElementById(id)).find(overlay => overlay?.classList.contains('show'));
    if (aiDecisionOverlay) {
      const cancel = aiDecisionOverlay.querySelector(
        '[data-ai-processing-action="cancel"], [data-cloud-ai-consent-action="cancel"]',
      );
      if (cancel instanceof HTMLElement) cancel.click();
      return;
    }
    const tourOverlay = document.getElementById("tour-overlay");
    if (tourOverlay) { endTour(); return; }
    const sidebarNav = document.getElementById("sidebar-nav");
    if (sidebarNav && sidebarNav.classList.contains("mobile-open")) { appEventListenerDeps.closeMobileSidebar(); return; }
    // Prefer the visible dialog's own close/back action. This keeps nested
    // workflows (preview -> editor, detail -> parent) on their intended route
    // and also covers feature overlays that are newer than this shell file.
    if (topOverlay && clickTopmostModalClose(topOverlay)) {
      // Keep one Escape from closing both a child and its parent modal.
      e.stopImmediatePropagation();
      return;
    }
    // A focus-trap owner may deliberately make Escape non-dismissable (for
    // example an in-progress privacy review), or may need to run teardown in
    // its own later key listener. Never fall through and close a dialog behind
    // that topmost surface.
    if (topOverlay?.hasAttribute('data-modal-focus-trap')) {
      nudgeModal(topOverlay);
      return;
    }
    const emfInterpOverlay = document.getElementById('emf-interp-overlay');
    if (emfInterpOverlay && emfInterpOverlay.classList.contains("show")) { appEventListenerDeps.closeEMFInterpretation(); return; }
    const confirmOverlay = document.getElementById("confirm-dialog-overlay");
    if (confirmOverlay && confirmOverlay.classList.contains("show")) {
      if (confirmOverlay.dataset.escapeOwner) return;
      confirmOverlay.classList.remove("show");
      return;
    }
    for (const [id, actionName] of ESCAPE_CLOSE_ACTIONS) {
      const overlay = document.getElementById(id);
      const openClass = id === 'chat-panel' ? 'open' : 'show';
      if (!overlay?.classList.contains(openClass)) continue;
      if (id === 'import-modal-overlay' && document.getElementById('import-modal')?.innerHTML.trim()) return;
      const action = appEventListenerDeps[/** @type {keyof typeof appEventListenerDeps} */ (actionName)];
      runAppEventListener(actionName, action);
      return;
    }
    const anonymousOverlays = document.querySelectorAll('.modal-overlay.show:not([id])');
    if (anonymousOverlays.length > 0) {
      anonymousOverlays[anonymousOverlays.length - 1].remove();
      return;
    }
    return;
  }

  // Focus trap for open modals. Sync overlays use `.confirm-overlay` too.
  if (e.key === "Tab") {
    const ov = topmostModalOverlay();
    if (ov?.hasAttribute('data-modal-lifecycle-managed')) return;
    if (ov) {
        const modal = ov.querySelector('[role="dialog"]') || ov.querySelector('.modal') || ov.querySelector('.confirm-dialog') || ov;
        const focusable = modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = /** @type {HTMLElement} */ (focusable[0]);
        const last = /** @type {HTMLElement} */ (focusable[focusable.length - 1]);
        if (!modal.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
        else if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
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
  document.addEventListener('getbased-agent-proposals-changed', refreshAgentProposalNavBadge);
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
