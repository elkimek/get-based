// startup-ui.js - first-render UI bootstrap after profile/OAuth startup

import { applyProfileDisplayState } from './startup-profile.js';
import { getTheme, setTheme } from './theme.js';
import { updateHeaderDates, updateHeaderRangeToggle } from './data.js';
import { bindImportFileInput } from './import-file-input.js';
import { ensureDnaTablesForPersistedState } from './health-data-loader.js';
import { maybeShowChangelog } from './changelog.js';
import { buildSidebar, renderProfileDropdown } from './nav.js';
import { maybeShowBackupNudge } from './crypto.js';
import { maybeShowLegalConsentGate } from './legal-consent.js';
import { initSync, primeSyncState, renderSyncIndicator } from './sync.js';
import { maybeShowAnalyticsConsent } from './utils.js';
import { getAppVersionRuntime } from './utils-runtime.js';
import { updateChatNudgeRuntime } from './chat-runtime.js';

type StartupUIDependencies = {[Key in 'getInitialView'|'maybeShowAnalyticsConsent'|'navigate'|'openChatPanel'|'openSettingsModal']:unknown};
interface StartupUIOperations {getInitialView():unknown;maybeShowAnalyticsConsent?:((()=>unknown)|null);navigate(view:unknown):unknown;openChatPanel():unknown;openSettingsModal(section:unknown):unknown}
interface StartupGlobalOperations {[key:string]:unknown;addEventListener:typeof globalThis.addEventListener}
const startupUIDeps: StartupUIDependencies = {
  getInitialView: (() => 'dashboard'),
  maybeShowAnalyticsConsent: (maybeShowAnalyticsConsent),
  navigate: ((_view:unknown) => {}),
  openChatPanel: () => {},
  openSettingsModal: ((_section?:unknown) => {}),
};

export function configureStartupUIDeps(deps: unknown = {}) {
  const previous = { ...startupUIDeps };
  if (typeof (deps as Record<string,unknown>).getInitialView === 'function') {
    startupUIDeps.getInitialView = (deps as Record<string,unknown>).getInitialView;
  }
  if ('maybeShowAnalyticsConsent' in (deps as object)) {
    startupUIDeps.maybeShowAnalyticsConsent = typeof (deps as Record<string,unknown>).maybeShowAnalyticsConsent === 'function'
      ? ((deps as Record<string,unknown>).maybeShowAnalyticsConsent)
      : null;
  }
  if (typeof (deps as Record<string,unknown>).openChatPanel === 'function') {
    startupUIDeps.openChatPanel = (deps as Record<string,unknown>).openChatPanel;
  }
  if (typeof (deps as Record<string,unknown>).navigate === 'function') {
    startupUIDeps.navigate = (deps as Record<string,unknown>).navigate;
  }
  if (typeof (deps as Record<string,unknown>).openSettingsModal === 'function') {
    startupUIDeps.openSettingsModal = (deps as Record<string,unknown>).openSettingsModal;
  }
  return previous;
}

function startupRuntime() {
  return globalThis as unknown as StartupGlobalOperations;
}

function getStartupRuntimeValue(name: string) {
  return startupRuntime()[name];
}

export function renderStartupUI() {
  // Prime sync state for UI, but let Evolu boot after first paint. Its
  // worker/OPFS startup is expensive and should not block dashboard LCP.
  primeSyncState();
  applyProfileDisplayState();
  setTheme(getTheme());
  populateFooterVersion();
  buildSidebar();
  renderSyncIndicator();
  (startupUIDeps as StartupUIOperations).navigate((startupUIDeps as StartupUIOperations).getInitialView() || 'dashboard');
  scheduleDeferredSyncAndCatalogWarmup();
  const legalGateShown = scheduleStartupNudges();
  if (legalGateShown) {
    startupRuntime().addEventListener('legal-consent-accepted', openDeferredStartupDestinations, { once: true });
  } else {
    openDeferredStartupDestinations();
  }
  refreshStartupChrome();
  updateChatNudgeRuntime();
  bindImportFileInput();
}

function populateFooterVersion() {
  // Populate footer version early (doesn't depend on dashboard render).
  const vTextEl = document.getElementById('app-version-text');
  if (vTextEl) (vTextEl as {textContent:unknown}).textContent = getAppVersionRuntime();
}

function scheduleDeferredSyncAndCatalogWarmup() {
  requestAnimationFrame(() => setTimeout(() => {
    initSync()
      .then(() => renderSyncIndicator())
      .catch(e => console.warn('[sync] deferred init failed:', e));
    void ensureDnaTablesForPersistedState();
  }, 0));
}

function scheduleStartupNudges() {
  // Legal acceptance is a gate: first-time users and users with stale
  // Terms/Privacy acceptance must explicitly accept before continuing. It is
  // local-first, so this is stored per browser/device rather than emailed.
  const legalGateShown = maybeShowLegalConsentGate();
  if (!legalGateShown) maybeShowChangelog();
  else startupRuntime().addEventListener('legal-consent-accepted', () => maybeShowChangelog(), { once: true });
  // First-launch transparency banner about anonymous analytics appears once,
  // never again after the user clicks either "Got it" or "Turn off". Keep it
  // behind the legal gate so the user does not get competing prompts. What's
  // New and tours also stay behind the gate; legal must be the topmost first
  // interaction for new users and stale-version re-consent.
  const showAnalyticsConsent = () => {
    (startupUIDeps as StartupUIOperations).maybeShowAnalyticsConsent?.();
  };
  if (legalGateShown) {
    startupRuntime().addEventListener('legal-consent-accepted', () => setTimeout(showAnalyticsConsent, 800), { once: true });
  } else {
    setTimeout(showAnalyticsConsent, 800);
  }
  const showBackupNudge = () => {
    const overlay = document.getElementById('passphrase-overlay');
    if (overlay && overlay.style.display === 'flex') return;
    maybeShowBackupNudge();
  };
  if (legalGateShown) {
    startupRuntime().addEventListener('legal-consent-accepted', () => setTimeout(showBackupNudge, 1500), { once: true });
  } else {
    setTimeout(showBackupNudge, 1500);
  }
  return legalGateShown;
}

function openDeferredStartupDestinations() {
  const openSettingsAfterInit = getStartupRuntimeValue('_openSettingsAfterInit');
  if (openSettingsAfterInit) {
    (startupUIDeps as StartupUIOperations).openSettingsModal(openSettingsAfterInit);
    delete startupRuntime()._openSettingsAfterInit;
  }
  if (getStartupRuntimeValue('_openChatAfterInit')) {
    delete startupRuntime()._openChatAfterInit;
    setTimeout(() => (startupUIDeps as StartupUIOperations).openChatPanel(), 500);
  }
}

function refreshStartupChrome() {
  updateHeaderDates();
  updateHeaderRangeToggle();
  renderProfileDropdown();
}
