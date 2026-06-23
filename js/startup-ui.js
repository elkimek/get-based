// @ts-check
// startup-ui.js - first-render UI bootstrap after profile/OAuth startup

import { applyProfileDisplayState } from './startup-profile.js';
import { getTheme, setTheme } from './theme.js';
import { updateHeaderDates, updateHeaderRangeToggle } from './data.js';
import { bindImportFileInput } from './import-file-input.js';
import { ensureSNPTable, ensureHaplogroupTable } from './dna.js';
import { maybeShowChangelog } from './changelog.js';
import { buildSidebar, renderProfileDropdown } from './nav.js';
import { maybeShowBackupNudge } from './crypto.js';
import { maybeShowLegalConsentGate } from './legal-consent.js';
import { initSync, primeSyncState, renderSyncIndicator } from './sync.js';

function startupRuntime() {
  return /** @type {any} */ (globalThis);
}

function getStartupRuntimeValue(name) {
  return startupRuntime()[name];
}

function callStartupRuntime(name, ...args) {
  const runtime = startupRuntime();
  const fn = runtime[name];
  if (typeof fn !== 'function') return undefined;
  return fn.apply(runtime, args);
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
  callStartupRuntime('navigate', callStartupRuntime('getInitialView') || 'dashboard');
  scheduleDeferredSyncAndCatalogWarmup();
  const legalGateShown = scheduleStartupNudges();
  if (legalGateShown) {
    startupRuntime().addEventListener('legal-consent-accepted', openDeferredStartupDestinations, { once: true });
  } else {
    openDeferredStartupDestinations();
  }
  refreshStartupChrome();
  initializeChatAttachments();
  bindImportFileInput();
}

function populateFooterVersion() {
  // Populate footer version early (doesn't depend on dashboard render).
  const vTextEl = document.getElementById('app-version-text');
  if (vTextEl) vTextEl.textContent = getStartupRuntimeValue('APP_VERSION') || '';
}

function scheduleDeferredSyncAndCatalogWarmup() {
  requestAnimationFrame(() => setTimeout(() => {
    initSync()
      .then(() => renderSyncIndicator())
      .catch(e => console.warn('[sync] deferred init failed:', e));
    ensureSNPTable(); // Eagerly load SNP table if genetics data exists (e.g. after JSON import)
    ensureHaplogroupTable(); // Eagerly load haplogroup table if mtDNA data exists
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
    callStartupRuntime('maybeShowAnalyticsConsent');
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
    callStartupRuntime('openSettingsModal', openSettingsAfterInit);
    delete startupRuntime()._openSettingsAfterInit;
  }
  if (getStartupRuntimeValue('_openChatAfterInit')) {
    delete startupRuntime()._openChatAfterInit;
    setTimeout(() => callStartupRuntime('openChatPanel'), 500);
  }
}

function refreshStartupChrome() {
  updateHeaderDates();
  updateHeaderRangeToggle();
  renderProfileDropdown();
}

function initializeChatAttachments() {
  // Init chat image attachment handlers (paste, drag-drop, file input).
  callStartupRuntime('initChatImageHandlers');
  callStartupRuntime('updateAttachButtonVisibility');
  callStartupRuntime('updateChatNudge');
}
