// settings-sync-panel-impl.js — lazy Cross-device sync and Agent Access settings UI

import { getErrorMessage } from './caught-error.js';
import { showNotification, bindSyncAppliedRefresh } from './utils.js';
import {
  isSyncEnabled,
  isSyncPaused,
  enableSync,
  disableSync,
  pauseSync,
  getMnemonic,
  getMnemonicResolutionError,
  getSyncIdentityFingerprint,
  setSyncRelay,
  checkRelayConnection,
  getSyncRelay,
  applyPendingTombstone,
  listPendingTombstones,
  pushContextToGateway,
  rejectPendingTombstone,
  setAgentAccessWearableSeriesDays,
  showSyncDiagnose,
  updateSyncIndicator,
} from './sync.js';
import { renderSyncSectionMarkup } from './settings-sync-panel-render.js';
import { getSyncSettingsSnapshot } from './settings-sync-view.js';
import type { PendingTombstoneList } from './settings-sync-view.js';
import type { SyncSettingsView } from './settings-sync-contract.js';
import { mountSyncSettings, getSyncSettingsView, disposeSyncSettings } from './settings-sync-component.js';
import {
  closeRestoreMnemonicDialog, openRestoreMnemonicDialog, configureSyncDialogHooks,
  showSyncSetupModal, closeSyncSetup, syncSetupNew, syncSetupRestore, syncSetupBack,
  syncSetupDoRestore, syncSetupDone, updateSyncSetupAck, confirmRestoreMnemonic,
  updateRestoreMnemonicDialogState, updateSyncSetupRestoreState,
} from './settings-sync-restore-ui.js';
export { showSyncSetupModal, closeSyncSetup, closeRestoreMnemonicDialog } from './settings-sync-restore-ui.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';
import { addUtilsRuntimeListener } from './utils-runtime.js';
import { beginAgentAccessMutation } from './settings-agent-access-mutation.js';
import {
  copyAgentAccessSetupCommand,
  copyMessengerContextKey,
  copyMessengerToken,
  regenerateMessengerContextKey,
  regenerateMessengerToken,
  refreshMessengerSectionForOwnerChange,
  renderMessengerSection,
  hydrateMessengerSection,
  disposeAgentAccessSection,
  toggleMessenger,
  toggleMessengerContextKey,
  toggleMessengerToken,
} from './settings-agent-access-panel.js';

export { renderMessengerSection, disposeAgentAccessSection };
export { prepareMessengerSection } from './settings-agent-access-panel.js';

const settingsSyncPanelDeps: Record<string, unknown> = {
  applyPendingTombstone,
  listPendingTombstones,
  pushContextToGateway,
  rejectPendingTombstone,
  updateSyncIndicator,
};

export function configureSettingsSyncPanelDeps(deps: Record<string, unknown> = {}) {
  const previous = { ...settingsSyncPanelDeps };
  for (const [name, value] of Object.entries(deps)) {
    if (typeof value === 'function' && name in settingsSyncPanelDeps) {
      settingsSyncPanelDeps[name] = value;
    }
  }
  return previous;
}

let settingsSyncDelegatesInstalled = false;
const SETTINGS_SYNC_STATE_ACTIONS = new Set([
  'toggle-sync',
  'setup-ack',
  'setup-restore-input',
  'restore-dialog-input',
  'toggle-messenger',
  'set-agent-wearable-series-days',
]);

function closestSettingsSyncAction(event: Event, selector = '[data-sync-action],[data-sync-setup-action]') {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const el = target.closest(selector);
  if (!(el instanceof HTMLElement)) return null;
  return el.closest('#sync-section, #messenger-section, #sync-setup-overlay, #sync-restore-overlay') ? el : null;
}

function nudgeSyncSetupDialog() {
  const d = document.querySelector('#sync-setup-overlay .confirm-dialog');
  if (!d) return;
  d.classList.add('modal-nudge');
  d.addEventListener('animationend', () => d.classList.remove('modal-nudge'), { once: true });
}

async function handleSettingsSyncClick(event: Event) {
  const target = event.target;
  if (target instanceof Element && target.id === 'sync-setup-overlay') {
    nudgeSyncSetupDialog();
    return;
  }
  if (target instanceof Element && target.id === 'sync-restore-overlay') {
    closeRestoreMnemonicDialog();
    return;
  }

  const actionEl = closestSettingsSyncAction(event);
  if (!actionEl) return;

  const action = actionEl.dataset.syncAction || actionEl.dataset.syncSetupAction;
  if (!action) return;

  if (SETTINGS_SYNC_STATE_ACTIONS.has(action)) return;

  event.preventDefault();

  if (action === 'apply-tombstone') {
    await (settingsSyncPanelDeps.applyPendingTombstone as (...args: Parameters<typeof applyPendingTombstone>) => unknown)(actionEl.dataset.tombId || '');
    getSettingsModuleFunction('openSettingsModal')?.('data');
  } else if (action === 'reject-tombstone') {
    await (settingsSyncPanelDeps.rejectPendingTombstone as (...args: Parameters<typeof rejectPendingTombstone>) => unknown)(actionEl.dataset.tombId || '');
    getSettingsModuleFunction('openSettingsModal')?.('data');
  } else if (action === 'toggle-mnemonic') {
    toggleMnemonicVisibility();
  } else if (action === 'copy-mnemonic') {
    copyMnemonic();
  } else if (action === 'copy-identity-code') {
    copySyncIdentityCode();
  } else if (action === 'open-restore-dialog') {
    openRestoreMnemonicDialog();
  } else if (action === 'save-relay') {
    saveSyncRelay();
  } else if (action === 'show-sync-diagnose') {
    void showSyncDiagnose();
  } else if (action === 'setup-new-direct') {
    showSyncSetupModal();
    void syncSetupNew();
  } else if (action === 'setup-restore-direct') {
    showSyncSetupModal();
    syncSetupRestore();
  } else if (action === 'pause-sync') {
    void toggleSync(false);
  } else if (action === 'resume-sync') {
    void toggleSync(true);
  } else if (action === 'disconnect-sync' || action === 'disable-sync') {
    void disconnectSync();
  } else if (action === 'setup-new') {
    void syncSetupNew();
  } else if (action === 'setup-restore') {
    syncSetupRestore();
  } else if (action === 'setup-do-restore') {
    void syncSetupDoRestore();
  } else if (action === 'setup-back') {
    syncSetupBack();
  } else if (action === 'setup-cancel') {
    void closeSyncSetup();
  } else if (action === 'setup-done') {
    syncSetupDone();
  } else if (action === 'close-restore-dialog') {
    closeRestoreMnemonicDialog();
  } else if (action === 'confirm-restore') {
    void confirmRestoreMnemonic();
  } else if (action === 'toggle-messenger-token') {
    toggleMessengerToken();
  } else if (action === 'toggle-messenger-context-key') {
    toggleMessengerContextKey();
  } else if (action === 'copy-messenger-token') {
    copyMessengerToken();
  } else if (action === 'copy-messenger-context-key') {
    copyMessengerContextKey();
  } else if (action === 'copy-agent-access-setup-command') {
    copyAgentAccessSetupCommand();
  } else if (action === 'regenerate-messenger-token') {
    void regenerateMessengerToken();
  } else if (action === 'regenerate-messenger-context-key') {
    void regenerateMessengerContextKey();
  }
}

async function handleSettingsSyncChange(event: Event) {
  const actionEl = closestSettingsSyncAction(event);
  if (!actionEl) return;
  const action = actionEl.dataset.syncAction || actionEl.dataset.syncSetupAction;
  if (!action) return;

  if (action === 'toggle-sync' && actionEl instanceof HTMLInputElement) {
    void toggleSync(actionEl.checked);
  } else if (action === 'setup-ack' && actionEl instanceof HTMLInputElement) {
    updateSyncSetupAck();
  } else if (action === 'toggle-messenger' && actionEl instanceof HTMLInputElement) {
    void toggleMessenger(actionEl.checked);
  } else if (action === 'set-agent-wearable-series-days' && actionEl instanceof HTMLSelectElement) {
    const days = actionEl.value === 'off' ? 0 : Number(actionEl.value);
    const mutation = beginAgentAccessMutation();
    if (!mutation) {
      showNotification('Agent Access change already in progress — wait for it to finish.', 'info');
      hydrateMessengerSection(true);
      return;
    }
    try {
      setAgentAccessWearableSeriesDays(days);
      mutation.captureApplied();
      hydrateMessengerSection(true);
      const saved = await mutation.save('agent-access-series');
      if (saved === false) throw new Error('saveImportedData returned false while saving Agent Access wearable-series preference');
      mutation.confirmPersisted();
      if (mutation.isCurrent()) (settingsSyncPanelDeps.pushContextToGateway as (...args: Parameters<typeof pushContextToGateway>) => unknown)();
    } catch (err) {
      mutation.rollback();
      console.warn(mutation.persisted ? '[agent-access] post-save relay update failed' : '[agent-access] failed to persist wearable series preference', err);
      showNotification(mutation.persisted
        ? 'Wearable-series preference was saved, but its relay update could not be started. Use Sync now to retry.'
        : 'Could not save wearable-series preference — try again.', 'error');
    } finally {
      mutation.release();
      if (mutation.scope.isCurrent()) refreshMessengerSectionForOwnerChange();
      else hydrateMessengerSection(true);
    }
  }
}

function handleSettingsSyncInput(event: Event) {
  const actionEl = closestSettingsSyncAction(event);
  if (!(actionEl instanceof HTMLTextAreaElement)) return;
  const action = actionEl.dataset.syncAction || actionEl.dataset.syncSetupAction;
  if (action === 'restore-dialog-input') updateRestoreMnemonicDialogState(actionEl);
  else if (action === 'setup-restore-input') updateSyncSetupRestoreState(actionEl);
}

function installSettingsSyncDelegates() {
  if (settingsSyncDelegatesInstalled || typeof document === 'undefined') return;
  settingsSyncDelegatesInstalled = true;
  document.addEventListener('click', handleSettingsSyncClick);
  document.addEventListener('change', handleSettingsSyncChange);
  document.addEventListener('input', handleSettingsSyncInput);
}

export function prepareSyncSection(): PendingTombstoneList {
  queueMicrotask(() => hydrateSyncSection());
  return settingsSyncPanelDeps.listPendingTombstones as PendingTombstoneList;
}
export function renderSyncSection() {
  return renderSyncSectionMarkup(prepareSyncSection());
}

let _syncToggling = false;
let _syncToggleWatchdog: ReturnType<typeof setTimeout> | null = null;
function _releaseSyncToggle() {
  _syncToggling = false;
  if (_syncToggleWatchdog) { clearTimeout(_syncToggleWatchdog); _syncToggleWatchdog = null; }
}

async function toggleSync(enabled: boolean) {
  if (_syncToggling) {
    // Don't silently swallow — tell the user their click registered but is
    // already mid-flight. (If they're hitting this repeatedly, the watchdog
    // below will release the lock so the next click works.)
    showNotification('Sync change already in progress…', 'info');
    return;
  }
  _syncToggling = true;
  // Watchdog: if the modal closes by some path that doesn't run our
  // cleanup (e.g. ESC key, page nav, browser back, JS error), release
  // the toggle lock after 60s so the next click isn't dead. 60s is
  // generous — long enough to write down 24 words, short enough to
  // recover from a wedge before the user gives up.
  _syncToggleWatchdog = setTimeout(_releaseSyncToggle, 60000);
  if (enabled) {
    if (isSyncPaused()) {
      try {
        const resumed = await enableSync();
        if (!resumed) throw new Error('Sync could not resume');
        refreshSyncSection();
      } catch (e) {
        console.error('[sync] resume failed:', e);
        showNotification(`Resume failed: ${getErrorMessage(e, e)}`, 'error');
      } finally {
        _releaseSyncToggle();
      }
      return;
    }
    showSyncSetupModal();
    // _syncToggling cleared by closeSyncSetup, syncSetupDone, or watchdog
  } else {
    try {
      await pauseSync();
      // Pause is immediate and retains the current identity/runtime.
      refreshSyncSection();
    } catch (e) {
      console.error('[sync] pause failed:', e);
      showNotification(`Pause failed: ${getErrorMessage(e, e)}`, 'error');
      refreshSyncSection();
    } finally {
      _releaseSyncToggle();
    }
  }
}

async function disconnectSync() {
  if (_syncToggling) {
    showNotification('Sync change already in progress…', 'info');
    return;
  }
  _syncToggling = true;
  _syncToggleWatchdog = setTimeout(_releaseSyncToggle, 60000);
  try {
    _identityFingerprintCache = null;
    _mnemonicRetries = 0;
    (clearTimeout as (timer: ReturnType<typeof setTimeout> | null) => void)(_mnemonicRetryTimer);
    await disableSync();
    refreshSyncSection();
  } catch (e) {
    console.error('[sync] disconnect failed:', e);
    showNotification(`Disconnect failed: ${getErrorMessage(e, e)}`, 'error');
    refreshSyncSection();
  } finally {
    _releaseSyncToggle();
  }
}

let relayRequest = 0;
let identityRequest = 0;
async function updateRelayStatus() {
  const owner = getSyncSettingsView();
  if (!owner || !isSyncEnabled()) return;
  const request = ++relayRequest;
  const relay = getSyncRelay();
  const connected = await checkRelayConnection();
  if (!owner.isCurrent() || !isSyncEnabled() || request !== relayRequest || relay !== getSyncRelay()) return;
  owner.setRelay(connected);
  (settingsSyncPanelDeps.updateSyncIndicator as typeof updateSyncIndicator)();
}

let _mnemonicRetries = 0;
let _mnemonicRetryTimer: ReturnType<typeof setTimeout> | null = null;
let _identityFingerprintCache: Awaited<ReturnType<typeof getSyncIdentityFingerprint>> = null;
async function loadSyncIdentityFingerprint() {
  const owner = getSyncSettingsView();
  if (!owner || !isSyncEnabled()) return;
  const request = ++identityRequest;
  _identityFingerprintCache = null;
  owner.setIdentity(null);
  const fingerprint = await getSyncIdentityFingerprint();
  if (!owner.isCurrent() || !isSyncEnabled() || request !== identityRequest) return;
  _identityFingerprintCache = fingerprint;
  owner.setIdentity(fingerprint, !!getMnemonicResolutionError());
}

function loadMnemonic(owner: SyncSettingsView | null = getSyncSettingsView()) {
  if (_mnemonicRetryTimer) clearTimeout(_mnemonicRetryTimer);
  _mnemonicRetryTimer = null;
  if (!owner?.isCurrent() || !isSyncEnabled()) { _mnemonicRetries = 0; return false; }
  if (getMnemonic()) {
    owner.setMnemonicStatus(true);
    _mnemonicRetries = 0;
    void loadSyncIdentityFingerprint();
    return true;
  }
  const error = getMnemonicResolutionError();
  if (error) {
    owner.setMnemonicStatus(false, `Sync init failed: ${error}`, true);
    _mnemonicRetries = 0;
  } else if (_mnemonicRetries < 30) {
    _mnemonicRetries++;
    owner.setMnemonicStatus(false, 'Resolving…');
    _mnemonicRetryTimer = setTimeout(() => loadMnemonic(owner), 1000);
  } else {
    owner.setMnemonicStatus(false, 'Could not resolve mnemonic — open the dev console and check for [sync] errors, or try a hard refresh', true);
    _mnemonicRetries = 0;
  }
  return false;
}

function toggleMnemonicVisibility() {
  const mnemonic = getMnemonic();
  if (isSyncEnabled() && mnemonic) getSyncSettingsView()?.toggleMnemonic(mnemonic);
}

function hydrateSyncSection(refresh = false) {
  const host = document.querySelector<HTMLElement>('[data-sync-settings-root]');
  if (!host) return;
  mountSyncSettings(host, getSyncSettingsSnapshot(settingsSyncPanelDeps.listPendingTombstones as PendingTombstoneList), refresh);
  if (!isSyncEnabled()) return;
  if (!loadMnemonic()) void loadSyncIdentityFingerprint();
  void updateRelayStatus();
}
function refreshSyncSection() { hydrateSyncSection(true); }
addUtilsRuntimeListener('labcharts-sync-owner-changed', refreshSyncSection);
bindSyncAppliedRefresh(refreshSyncSection);
export function disposeSyncSection(): void {
  if (_mnemonicRetryTimer) clearTimeout(_mnemonicRetryTimer);
  _mnemonicRetryTimer = null; _mnemonicRetries = 0; _identityFingerprintCache = null;
  relayRequest++; identityRequest++;
  disposeSyncSettings();
}

let _clipboardClearTimer: ReturnType<typeof setTimeout> | null = null;
function copyMnemonic() {
  const mnemonic = isSyncEnabled() ? getMnemonic() : null;
  if (!mnemonic || !getSyncSettingsView()) return;
  navigator.clipboard.writeText(mnemonic).then(() => {
    showNotification('Mnemonic copied — clipboard will clear in 60s', 'success');
    (clearTimeout as (timer: ReturnType<typeof setTimeout> | null) => void)(_clipboardClearTimer);
    _clipboardClearTimer = setTimeout(() => {
      navigator.clipboard.writeText('').catch(() => {});
    }, 60000);
  }).catch(() => {
    showNotification('Could not access clipboard', 'error');
  });
}

function copySyncIdentityCode() {
  if (!_identityFingerprintCache || !isSyncEnabled() || !getSyncSettingsView()) return;
  navigator.clipboard.writeText(_identityFingerprintCache).then(() => {
    showNotification('Sync identity code copied', 'success');
  }).catch(() => {
    showNotification('Could not access clipboard', 'error');
  });
}

function saveSyncRelay() {
  const input = ((document.getElementById('sync-relay-input')) as HTMLInputElement | null);
  if (!input) return;
  const url = input.value.trim();
  if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
    showNotification('Relay URL must start with wss:// or ws://', 'error');
    return;
  }
  setSyncRelay(url);
  showNotification('Relay saved — restart sync to apply', 'success');
  updateRelayStatus();
}

export function hydrateSettingsSyncPanel() {
  hydrateMessengerSection();
  hydrateSyncSection();
}

configureSyncDialogHooks({ refresh: refreshSyncSection, release: _releaseSyncToggle });
installSettingsSyncDelegates();
