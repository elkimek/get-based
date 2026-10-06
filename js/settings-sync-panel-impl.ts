// settings-sync-panel-impl.js — lazy Cross-device sync and Agent Access settings UI

import { getErrorMessage } from './caught-error.js';
import { escapeHTML, showNotification, bindSyncAppliedRefresh } from './utils.js';
import {
  isSyncEnabled,
  isSyncPaused,
  enableSync,
  disableSync,
  pauseSync,
  getMnemonic,
  getMnemonicResolutionError,
  getSyncIdentityFingerprint,
  restoreFromMnemonic,
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
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import {
  closeRestoreMnemonicDialog,
  openRestoreMnemonicDialog,
  setSyncSetupRestoreBusy,
  setSyncSetupRestoreReloading,
  updateRestoreMnemonicDialogState,
  updateSyncSetupRestoreState,
} from './settings-sync-restore-ui.js';
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

export { closeRestoreMnemonicDialog, renderMessengerSection, disposeAgentAccessSection };

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
    updateSyncSetupAck(actionEl);
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
  else if (action === 'setup-restore-input') updateSyncSetupRestoreState(actionEl, _syncRestoreInProgress);
}

function installSettingsSyncDelegates() {
  if (settingsSyncDelegatesInstalled || typeof document === 'undefined') return;
  settingsSyncDelegatesInstalled = true;
  document.addEventListener('click', handleSettingsSyncClick);
  document.addEventListener('change', handleSettingsSyncChange);
  document.addEventListener('input', handleSettingsSyncInput);
}

export function renderSyncSection() {
  queueMicrotask(() => hydrateSyncSection());
  return renderSyncSectionMarkup(settingsSyncPanelDeps.listPendingTombstones as PendingTombstoneList);
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

export function showSyncSetupModal() {
  let overlay = document.getElementById('sync-setup-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sync-setup-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="confirm-dialog sync-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="sync-setup-title" style="max-width:480px">
    <h3 id="sync-setup-title" style="margin:0 0 6px;font-size:16px;color:var(--text-primary)">Set up sync</h3>
    <p style="font-size:13px;color:var(--text-muted);margin:0 0 20px;line-height:1.5">Your data is encrypted with a 24-word mnemonic. The relay server only sees ciphertext.</p>
    <div id="sync-setup-choices">
      <button class="import-btn import-btn-primary" style="width:100%;padding:12px 16px;font-size:13px;margin-bottom:10px;text-align:left" data-sync-setup-action="setup-new">
        <div style="font-weight:600">New setup</div>
        <div style="font-weight:400;opacity:0.8;margin-top:2px;font-size:12px">First time syncing — generate a new mnemonic</div>
      </button>
      <button class="import-btn import-btn-secondary" style="width:100%;padding:12px 16px;font-size:13px;text-align:left" data-sync-setup-action="setup-restore">
        <div style="font-weight:600">Join existing</div>
        <div style="font-weight:400;opacity:0.8;margin-top:2px;font-size:12px">I have a mnemonic from another device</div>
      </button>
    </div>
    <div id="sync-setup-new" style="display:none"></div>
    <div id="sync-setup-restore" style="display:none">
      <textarea id="sync-setup-restore-input" aria-label="24-word mnemonic" aria-describedby="sync-setup-restore-msg" data-sync-setup-action="setup-restore-input" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" style="font-size:12px;width:100%;height:70px;resize:vertical;border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);padding:10px 12px;font-family:var(--font-mono, monospace);box-sizing:border-box" placeholder="Paste your 24-word mnemonic here..."></textarea>
      <div id="sync-setup-restore-msg" role="status" aria-live="polite" style="font-size:11px;color:var(--text-muted);margin:6px 0 10px;min-height:14px"></div>
      <div class="sync-setup-restore-actions">
        <button id="sync-setup-restore-go" class="import-btn import-btn-primary" style="flex:1;padding:8px 16px;font-size:13px" data-sync-setup-action="setup-do-restore" disabled>Join &amp; reload</button>
        <button id="sync-setup-restore-back" class="import-btn import-btn-secondary" style="padding:8px 16px;font-size:13px" data-sync-setup-action="setup-back">Back</button>
      </div>
    </div>
    <div class="sync-setup-choice-footer" style="margin-top:16px;text-align:right">
      <button id="sync-setup-cancel" class="confirm-btn confirm-btn-cancel sync-setup-restore-cancel" data-sync-setup-action="setup-cancel">Cancel</button>
    </div>
  </div>`;
  openModalOverlay(overlay, { initialFocus: '[data-sync-setup-action="setup-new"]', focusDelay: 50 });
}

export async function closeSyncSetup() {
  if (_syncRestoreInProgress) {
    showNotification('Joining the existing sync identity…', 'info');
    nudgeSyncSetupDialog();
    return false;
  }
  try {
    closeModalOverlay('sync-setup-overlay');
    // If sync was started during setup but user cancelled, clean up
    if (isSyncEnabled()) {
      _mnemonicRetries = 0;
      (clearTimeout as (timer: ReturnType<typeof setTimeout> | null) => void)(_mnemonicRetryTimer);
      await disableSync();
    }
  } catch (e) {
    console.error('[sync] setup close cleanup failed:', e);
    showNotification(`Sync cleanup failed: ${getErrorMessage(e, e)}`, 'error');
  } finally {
    refreshSyncSection();
    _releaseSyncToggle();
  }
  return true;
}

let _syncSetupInProgress = false;
let _syncRestoreInProgress = false;
async function syncSetupNew() {
  if (_syncSetupInProgress) return;
  const choicesEl = document.getElementById('sync-setup-choices');
  const newEl = document.getElementById('sync-setup-new');
  if (!choicesEl || !newEl) return;
  _syncSetupInProgress = true;
  choicesEl.style.display = 'none';
  newEl.style.display = 'block';
  newEl.innerHTML = '<div style="text-align:center;padding:16px 0;color:var(--text-muted);font-size:13px">Generating identity...</div>';

  try {
    await enableSync({ skipPush: false });

    // Wait for mnemonic to resolve
    let mnemonic: ReturnType<typeof getMnemonic> = null;
    for (let i = 0; i < 30; i++) {
      if (!isSyncEnabled()) return; // cancelled during wait
      mnemonic = getMnemonic();
      if (mnemonic) break;
      await new Promise(r => setTimeout(r, 500));
    }

    if (!mnemonic) {
      newEl.innerHTML = '<div style="color:var(--red);font-size:13px;padding:8px 0">Failed to generate mnemonic. Try again.</div>';
      return;
    }

    newEl.innerHTML = `
      <div style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">Your mnemonic</div>
        <div style="font-family:var(--font-mono, monospace);font-size:11.5px;background:var(--bg-secondary);padding:10px 12px;border-radius:8px;border:1px solid var(--border);word-break:break-word;line-height:1.6;user-select:all">${escapeHTML(mnemonic)}</div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:14px">
        Write these 24 words down and store them offline. You will need them to sync another device. Anyone with this mnemonic can access your synced data.
      </div>
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:12px;color:var(--text-primary);margin-bottom:14px">
        <input type="checkbox" id="sync-setup-ack" style="margin-top:2px" data-sync-setup-action="setup-ack">
        I have saved my mnemonic somewhere safe
      </label>
      <button id="sync-setup-done-btn" class="import-btn import-btn-primary" style="width:100%;padding:8px 16px;font-size:13px;opacity:0.45;cursor:not-allowed" disabled data-sync-setup-action="setup-done">Done</button>
    `;
    updateSyncSetupAck();
  } finally {
    _syncSetupInProgress = false;
  }
}

function updateSyncSetupAck(ack = document.getElementById('sync-setup-ack')) {
  const doneBtn = ((document.getElementById('sync-setup-done-btn')) as HTMLButtonElement | null);
  if (!(ack instanceof HTMLInputElement) || !doneBtn) return;
  doneBtn.disabled = !ack.checked;
  doneBtn.style.opacity = ack.checked ? '1' : '0.45';
  doneBtn.style.cursor = ack.checked ? 'pointer' : 'not-allowed';
}

function syncSetupDone() {
  closeModalOverlay('sync-setup-overlay');
  _releaseSyncToggle();
  refreshSyncSection();
}

function syncSetupRestore() {
  const choicesEl = document.getElementById('sync-setup-choices');
  const restoreEl = document.getElementById('sync-setup-restore');
  if (!choicesEl || !restoreEl) return;
  choicesEl.style.display = 'none';
  restoreEl.style.display = 'block';
  const title = document.getElementById('sync-setup-title');
  if (title) title.textContent = 'Join existing sync';
  const choiceFooter = ((document.querySelector('#sync-setup-overlay .sync-setup-choice-footer')) as HTMLElement | null);
  const restoreActions = document.querySelector('#sync-setup-overlay .sync-setup-restore-actions');
  const cancel = document.getElementById('sync-setup-cancel');
  if (restoreActions && cancel) restoreActions.append(cancel);
  if (choiceFooter) choiceFooter.hidden = true;
  const input = ((document.getElementById('sync-setup-restore-input')) as HTMLTextAreaElement | null);
  updateSyncSetupRestoreState(input);
  input?.focus();
}

function syncSetupBack() {
  const choicesEl = document.getElementById('sync-setup-choices');
  const restoreEl = document.getElementById('sync-setup-restore');
  const newEl = document.getElementById('sync-setup-new');
  if (!choicesEl || !restoreEl || !newEl) return;
  choicesEl.style.display = '';
  restoreEl.style.display = 'none';
  newEl.style.display = 'none';
  const title = document.getElementById('sync-setup-title');
  if (title) title.textContent = 'Set up sync';
  const choiceFooter = ((document.querySelector('#sync-setup-overlay .sync-setup-choice-footer')) as HTMLElement | null);
  const cancel = document.getElementById('sync-setup-cancel');
  if (choiceFooter && cancel) choiceFooter.append(cancel);
  if (choiceFooter) choiceFooter.hidden = false;
}

async function syncSetupDoRestore() {
  if (_syncSetupInProgress) {
    showNotification('Sync setup is already in progress…', 'info');
    return;
  }
  const input = ((document.getElementById('sync-setup-restore-input')) as HTMLTextAreaElement | null);
  if (!input) return;
  const raw = (input.value || '').trim();
  if (!raw) {
    showNotification('Paste your 24-word seed into the textarea first', 'error');
    input.focus();
    return;
  }
  const mnemonic = raw;
  const words = mnemonic.split(/\s+/);
  if (words.length !== 24) {
    showNotification(`Seed must be exactly 24 words (got ${words.length})`, 'error');
    return;
  }

  _syncSetupInProgress = true;
  _syncRestoreInProgress = true;
  let restored = false;
  setSyncSetupRestoreBusy(true, 'Starting encrypted sync…');
  try {
    // Initialize a throwaway identity without persisting it. The restored
    // identity becomes durable only after Evolu accepts the supplied seed.
    const enabled = await enableSync({ skipPush: true, persist: false });
    if (enabled !== true) {
      throw new Error(((getMnemonicResolutionError() || 'Sync could not initialize in this browser') as string));
    }
    setSyncSetupRestoreBusy(true, 'Sync is ready. Checking the 24-word identity…');
    const result = await restoreFromMnemonic(mnemonic);
    if (!result) {
      setSyncSetupRestoreBusy(false, 'Could not join. Verify all 24 words and try again.');
      return;
    }
    restored = true;
    setSyncSetupRestoreReloading();
    // restoreFromMnemonic triggers reload, so nothing else needed
  } catch (e) {
    console.error('[sync] join existing device failed:', e);
    const reason = getErrorMessage(e, e);
    setSyncSetupRestoreBusy(false, `Could not join: ${reason}`);
    showNotification(`Could not join existing sync: ${reason}`, 'error');
  } finally {
    _syncSetupInProgress = false;
    _syncRestoreInProgress = false;
    if (!restored) setSyncSetupRestoreBusy(false);
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

async function confirmRestoreMnemonic() {
  const input = ((document.getElementById('sync-restore-dialog-input')) as HTMLTextAreaElement | null);
  const btn = ((document.getElementById('sync-restore-dialog-go')) as HTMLButtonElement | null);
  if (!input) return;
  const raw = (input.value || '').trim();
  const words = raw.split(/\s+/);
  if (words.length !== 24) {
    showNotification(`Seed must be exactly 24 words (got ${words.length})`, 'error');
    input.focus();
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Restoring…'; }
  const msg = document.getElementById('sync-restore-dialog-msg');
  if (msg) { msg.textContent = 'Checking the 24-word identity…'; msg.style.color = 'var(--text-muted)'; }
  // No second confirm dialog — the modal already explains what restore
  // does, and the action button is explicit ("Restore & reload"). Adding
  // a second confirm pile-up was the friction users complained about.
  try {
    const result = await restoreFromMnemonic(raw);
    if (!result) {
      if (btn) { btn.disabled = false; btn.textContent = 'Restore & reload'; }
      if (msg) { msg.textContent = 'Could not restore. Verify all 24 words and try again.'; msg.style.color = 'var(--red)'; }
      if (!isSyncEnabled()) showNotification('Sync not initialized — enable sync first, then restore', 'error');
      return;
    }
    if (msg) { msg.textContent = 'Identity accepted. Reloading this device…'; msg.style.color = 'var(--green, #22c55e)'; }
  } catch (e) {
    const reason = getErrorMessage(e, e);
    console.error('[sync] restore identity failed:', e);
    if (btn) { btn.disabled = false; btn.textContent = 'Restore & reload'; }
    if (msg) { msg.textContent = `Could not restore: ${reason}`; msg.style.color = 'var(--red)'; }
    showNotification(`Could not restore sync identity: ${reason}`, 'error');
  }
  // On success: restoreFromMnemonic triggers reload (Evolu auto-reloads),
  // so we don't need to close this modal — the page replaces itself.
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

installSettingsSyncDelegates();
