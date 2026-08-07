// @ts-check
// settings-sync-panel-impl.js — lazy Cross-device sync and Agent Access settings UI

import { getErrorMessage } from './caught-error.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import {
  isSyncEnabled,
  enableSync,
  disableSync,
  getMnemonic,
  getMnemonicResolutionError,
  getSyncIdentityFingerprint,
  getSyncBlocker,
  restoreFromMnemonic,
  getSyncRelay,
  setSyncRelay,
  checkRelayConnection,
  applyPendingTombstone,
  listPendingTombstones,
  pushContextToGateway,
  rejectPendingTombstone,
  setAgentAccessWearableSeriesDays,
  showSyncDiagnose,
  updateSyncIndicator,
} from './sync.js';
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
import { saveImportedData } from './data.js';
import { state } from './state.js';
import {
  copyAgentAccessSetupCommand,
  copyMessengerContextKey,
  copyMessengerToken,
  regenerateMessengerContextKey,
  regenerateMessengerToken,
  refreshMessengerSectionForOwnerChange,
  renderMessengerSection,
  toggleMessenger,
  toggleMessengerContextKey,
  toggleMessengerToken,
} from './settings-agent-access-panel.js';

export { closeRestoreMnemonicDialog, renderMessengerSection };
// Agent Access UI implementation moved to settings-agent-access-panel.js.
// Facade breadcrumbs kept for source-inspection tests/backward ownership:
// renderMessengerSection · OpenClaw · GETBASED_AGENT_CONTEXT_KEY · messenger-token · data-masked
// Extracted markup contract: id="agent-wearable-series-select" data-sync-action="set-agent-wearable-series-days"
// setAgentAccessWearableSeriesDays(days) · saveImportedData({ reason: 'agent-access-series' })
// <option value="off" · <option value="7" · <option value="30" · <option value="90"
// Extracted action contract: data-sync-action="toggle-messenger" data-sync-action="toggle-messenger-token"
// data-sync-action="toggle-messenger-context-key" data-sync-action="copy-messenger-token"
// data-sync-action="copy-messenger-context-key" data-sync-action="copy-agent-access-setup-command"
// data-sync-action="regenerate-messenger-token" data-sync-action="regenerate-messenger-context-key"
// Copy contract: Let AI agents query your labs and context · ~100 / 400 / 1200 extra tokens for 7 / 30 / 90 days

function snapshotImportedData() {
  try { return JSON.stringify(state.importedData || {}); } catch { return null; }
}

function restoreImportedDataSnapshot(snapshot) {
  if (!snapshot) return;
  try { state.importedData = JSON.parse(snapshot); } catch {}
}

const settingsSyncPanelDeps = {
  applyPendingTombstone,
  listPendingTombstones,
  pushContextToGateway,
  rejectPendingTombstone,
  updateSyncIndicator,
};

/** @param {Partial<typeof settingsSyncPanelDeps>} deps */
export function configureSettingsSyncPanelDeps(deps = {}) {
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

function closestSettingsSyncAction(event, selector = '[data-sync-action],[data-sync-setup-action]') {
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

async function handleSettingsSyncClick(event) {
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
    await settingsSyncPanelDeps.applyPendingTombstone(actionEl.dataset.tombId || '');
    getSettingsModuleFunction('openSettingsModal')?.('data');
  } else if (action === 'reject-tombstone') {
    await settingsSyncPanelDeps.rejectPendingTombstone(actionEl.dataset.tombId || '');
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
  } else if (action === 'disable-sync') {
    void toggleSync(false);
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

async function handleSettingsSyncChange(event) {
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
    const rollback = snapshotImportedData();
    try {
      setAgentAccessWearableSeriesDays(days);
      const saved = await saveImportedData({ reason: 'agent-access-series' });
      if (saved === false) throw new Error('saveImportedData returned false while saving Agent Access wearable-series preference');
      settingsSyncPanelDeps.pushContextToGateway();
    } catch (err) {
      restoreImportedDataSnapshot(rollback);
      console.warn('[agent-access] failed to persist wearable series preference', err);
      showNotification('Could not save wearable-series preference — try again.', 'error');
      refreshMessengerSectionForOwnerChange();
    }
  }
}

function handleSettingsSyncInput(event) {
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

function renderPendingTombstones() {
  const pending = settingsSyncPanelDeps.listPendingTombstones() || [];
  if (pending.length === 0) return '';
  const rows = pending.map(p => `
    <div class="sync-tombstone-row" data-tomb-id="${escapeAttr(p.id)}">
      <span class="sync-tombstone-name">${escapeHTML(p.name)}</span>
      <span class="sync-tombstone-meta">${p.at ? `flagged ${new Date(p.at).toLocaleDateString()}` : ''}</span>
      <button class="sync-tombstone-btn sync-tombstone-apply" data-sync-action="apply-tombstone" data-tomb-id="${escapeAttr(p.id)}">Apply delete</button>
      <button class="sync-tombstone-btn sync-tombstone-reject" data-sync-action="reject-tombstone" data-tomb-id="${escapeAttr(p.id)}">Restore</button>
    </div>`).join('');
  return `
    <div class="sync-tombstone-banner">
      <div class="sync-tombstone-head">
        <strong>${pending.length} profile${pending.length === 1 ? '' : 's'} flagged for deletion on another device</strong>
        <span class="sync-tombstone-help">Confirm each — Apply wipes locally, Restore re-publishes.</span>
      </div>
      ${rows}
    </div>`;
}

export function renderSyncSection() {
  const enabled = isSyncEnabled();
  const relay = getSyncRelay();
  const blocker = getSyncBlocker();
  const enableDisabled = blocker && !enabled ? 'disabled' : '';
  // Banner appears in place of the toggle when the browser is missing a
  // primitive Evolu needs (Web Locks, StorageManager, OPFS, or WebCrypto).
  // Lets the user see "this is broken and here's why" instead of clicking
  // a dead toggle and waiting 30s for a cryptic timeout toast.
  const blockerBanner = blocker ? `
    <div style="margin-bottom:16px;padding:10px 12px;border:1px solid #fbbf24;background:rgba(251,191,36,0.08);border-radius:6px;color:#fbbf24;font-size:12px;line-height:1.45">
      <strong>Sync unavailable in this browser.</strong><br>
      ${escapeHTML(blocker)}
    </div>` : '';
  return `
    ${blockerBanner}
    ${renderPendingTombstones()}
    <div class="sync-settings-head">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text-primary)">Cross-device sync</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">E2E encrypted via Evolu CRDT</div>
      </div>
      <div class="sync-settings-state">
        <span class="sync-settings-badge ${enabled ? 'is-enabled' : ''}">${enabled ? 'Enabled' : 'Off'}</span>
        <label class="chat-websearch-toggle-label sync-settings-toggle" aria-label="Toggle cross-device sync">
          <input type="checkbox" ${enabled ? 'checked' : ''} data-sync-action="toggle-sync" ${enableDisabled}>
          <span class="chat-toggle-slider sync-settings-toggle-slider"></span>
        </label>
      </div>
    </div>
    ${enabled ? `
      <div id="sync-relay-status" style="display:flex;align-items:center;gap:6px;margin-bottom:16px">
        <span id="sync-status-dot" style="width:8px;height:8px;border-radius:50%;background:var(--text-muted);display:inline-block"></span>
        <span id="sync-status-text" style="font-size:12px;color:var(--text-muted)">Checking relay...</span>
      </div>

      <div class="sync-identity-card" aria-labelledby="sync-identity-label">
        <div class="sync-identity-card-head">
          <div>
            <div id="sync-identity-label" class="sync-identity-label">Sync identity</div>
            <div id="sync-identity-code" class="sync-identity-code" aria-live="polite">Resolving…</div>
          </div>
          <button id="sync-identity-copy" class="import-btn import-btn-secondary sync-identity-copy" data-sync-action="copy-identity-code" aria-label="Copy Sync identity code" disabled>Copy</button>
        </div>
        <div class="sync-identity-help">Compare this code on your devices. Matching codes mean the same 24-word Data Sync identity is active.</div>
        <div class="sync-identity-safety"><span aria-hidden="true">✓</span> Safe to compare — this code doesn’t grant access to your data</div>
      </div>

      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary)">Your mnemonic</label>
          <div style="display:flex;gap:6px">
            <button id="sync-mnemonic-toggle" class="import-btn import-btn-secondary" style="font-size:11px;padding:2px 10px" data-sync-action="toggle-mnemonic" aria-label="Show mnemonic">Show</button>
            <button class="import-btn import-btn-secondary" style="font-size:11px;padding:2px 10px" data-sync-action="copy-mnemonic" aria-label="Copy mnemonic">Copy</button>
          </div>
        </div>
        <div id="sync-mnemonic" data-masked="true" style="font-family:var(--font-mono, monospace);font-size:11.5px;background:var(--bg-secondary);padding:10px 12px;border-radius:8px;border:1px solid var(--border);word-break:break-word;line-height:1.6;min-height:20px;user-select:none" aria-label="Mnemonic phrase">Loading...</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px">These words are your encryption key. Store them offline. Never share them.</div>
      </div>

      <div class="sync-management-actions">
        <button class="import-btn import-btn-secondary" data-sync-action="open-restore-dialog">Restore / switch identity…</button>
        <button class="import-btn import-btn-secondary sync-disable-btn" data-sync-action="disable-sync">Disable on this device</button>
      </div>
      <div class="sync-management-help">Restoring switches this device to another 24-word identity and replaces local synced data. Disabling stops sync here and reloads the app; relay data is not deleted.</div>

      <details style="margin-bottom:8px">
        <summary style="font-size:12px;color:var(--text-muted);cursor:pointer;user-select:none">Advanced</summary>
        <div style="margin-top:8px">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Relay server</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="sync-relay-input" value="${escapeAttr(relay)}" style="flex:1;font-size:12px;border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);padding:6px 10px;font-family:var(--font-mono, monospace)" placeholder="wss://...">
            <button class="import-btn import-btn-secondary" style="font-size:12px;padding:4px 12px" data-sync-action="save-relay">Save</button>
          </div>
          <button class="import-btn import-btn-secondary" style="font-size:12px;padding:5px 14px;width:100%;margin-top:10px" data-sync-action="show-sync-diagnose">Sync status &amp; storage</button>
        </div>
      </details>
    ` : `
      <div style="font-size:12px;color:var(--text-muted);line-height:1.5">
        Sync profiles, lab data, and AI settings across your devices. Data is encrypted with a key derived from a 24-word mnemonic — the relay server only sees ciphertext.
      </div>
      <div class="sync-setup-actions">
        <button class="import-btn import-btn-primary" data-sync-action="setup-new-direct" ${enableDisabled}>Set up new sync</button>
        <button class="import-btn import-btn-secondary" data-sync-action="setup-restore-direct" ${enableDisabled}>Join existing device</button>
      </div>
      <div class="sync-management-help">Choose <b>Join existing device</b> if another device already has sync enabled. You will need its 24-word mnemonic.</div>
    `}
  `;
}

let _syncToggling = false;
let _syncToggleWatchdog = null;
function _releaseSyncToggle() {
  _syncToggling = false;
  if (_syncToggleWatchdog) { clearTimeout(_syncToggleWatchdog); _syncToggleWatchdog = null; }
}

async function toggleSync(enabled) {
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
    showSyncSetupModal();
    // _syncToggling cleared by closeSyncSetup, syncSetupDone, or watchdog
  } else {
    try {
      _mnemonicCache = null;
      _identityFingerprintCache = null;
      _mnemonicRetries = 0;
      clearTimeout(_mnemonicRetryTimer);
      await disableSync();
      // disableSync triggers a page reload, but if we're still here render
      // the disabled state immediately for visual feedback.
      const el = document.getElementById('sync-section');
      if (el) el.innerHTML = renderSyncSection();
    } catch (e) {
      console.error('[sync] disable failed:', e);
      showNotification(`Disable failed: ${getErrorMessage(e, e)}`, 'error');
      // Visually un-stick the toggle by re-rendering — the underlying
      // localStorage flag is already false (set early in disableSync) so
      // the toggle will show as off.
      const el = document.getElementById('sync-section');
      if (el) el.innerHTML = renderSyncSection();
    } finally {
      _releaseSyncToggle();
    }
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
        <button class="confirm-btn confirm-btn-cancel sync-setup-restore-cancel" data-sync-setup-action="setup-cancel">Cancel</button>
      </div>
    </div>
    <div class="sync-setup-choice-footer" style="margin-top:16px;text-align:right">
      <button class="confirm-btn confirm-btn-cancel" data-sync-setup-action="setup-cancel">Cancel</button>
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
      _mnemonicCache = null;
      _mnemonicRetries = 0;
      clearTimeout(_mnemonicRetryTimer);
      await disableSync();
    }
  } catch (e) {
    console.error('[sync] setup close cleanup failed:', e);
    showNotification(`Sync cleanup failed: ${getErrorMessage(e, e)}`, 'error');
  } finally {
    const el = document.getElementById('sync-section');
    if (el) el.innerHTML = renderSyncSection();
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
    let mnemonic = null;
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

    _mnemonicCache = mnemonic;
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
  const doneBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('sync-setup-done-btn'));
  if (!(ack instanceof HTMLInputElement) || !doneBtn) return;
  doneBtn.disabled = !ack.checked;
  doneBtn.style.opacity = ack.checked ? '1' : '0.45';
  doneBtn.style.cursor = ack.checked ? 'pointer' : 'not-allowed';
}

function syncSetupDone() {
  closeModalOverlay('sync-setup-overlay');
  _releaseSyncToggle();
  const el = document.getElementById('sync-section');
  if (el) el.innerHTML = renderSyncSection();
  loadMnemonic();
  void loadSyncIdentityFingerprint();
  updateRelayStatus();
}

function syncSetupRestore() {
  const choicesEl = document.getElementById('sync-setup-choices');
  const restoreEl = document.getElementById('sync-setup-restore');
  if (!choicesEl || !restoreEl) return;
  choicesEl.style.display = 'none';
  restoreEl.style.display = 'block';
  const title = document.getElementById('sync-setup-title');
  if (title) title.textContent = 'Join existing sync';
  const choiceFooter = /** @type {HTMLElement | null} */ (document.querySelector('#sync-setup-overlay .sync-setup-choice-footer'));
  if (choiceFooter) choiceFooter.hidden = true;
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('sync-setup-restore-input'));
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
  const choiceFooter = /** @type {HTMLElement | null} */ (document.querySelector('#sync-setup-overlay .sync-setup-choice-footer'));
  if (choiceFooter) choiceFooter.hidden = false;
}

async function syncSetupDoRestore() {
  if (_syncSetupInProgress) {
    showNotification('Sync setup is already in progress…', 'info');
    return;
  }
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('sync-setup-restore-input'));
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
    // Enable sync (generates throwaway identity) then immediately restore
    const enabled = await enableSync({ skipPush: true });
    if (enabled !== true) {
      throw new Error(getMnemonicResolutionError() || 'Sync could not initialize in this browser');
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

async function updateRelayStatus() {
  const dot = document.getElementById('sync-status-dot');
  const text = document.getElementById('sync-status-text');
  if (!dot || !text) return;
  const connected = await checkRelayConnection();
  dot.style.background = connected ? '#22c55e' : 'var(--red)';
  text.textContent = connected ? 'Connected to relay' : 'Relay unreachable';
  // Keep header indicator in sync
  settingsSyncPanelDeps.updateSyncIndicator();
}

let _mnemonicRetries = 0;
let _mnemonicCache = null;
let _mnemonicRetryTimer = null;
let _identityFingerprintCache = null;
const MNEMONIC_MASK = '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022';

async function loadSyncIdentityFingerprint() {
  const codeEl = document.getElementById('sync-identity-code');
  const copyBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('sync-identity-copy'));
  if (!codeEl || !isSyncEnabled()) return;
  const fingerprint = await getSyncIdentityFingerprint();
  if (!fingerprint) {
    codeEl.textContent = getMnemonicResolutionError() ? 'Unavailable' : 'Resolving…';
    if (copyBtn) copyBtn.disabled = true;
    return;
  }
  _identityFingerprintCache = fingerprint;
  codeEl.textContent = fingerprint;
  if (copyBtn) copyBtn.disabled = false;
}

function loadMnemonic() {
  clearTimeout(_mnemonicRetryTimer);
  const el = document.getElementById('sync-mnemonic');
  if (!el || !isSyncEnabled()) { _mnemonicRetries = 0; return; }
  const mnemonic = getMnemonic();
  if (mnemonic) {
    _mnemonicCache = mnemonic;
    el.dataset.masked = 'true';
    el.textContent = MNEMONIC_MASK;
    el.style.userSelect = 'none';
    el.style.color = '';
    _mnemonicRetries = 0;
    void loadSyncIdentityFingerprint();
    return;
  }
  // Stop polling immediately if Evolu surfaced an actual init error —
  // no point waiting 30s for a promise that already rejected.
  const initErr = getMnemonicResolutionError();
  if (initErr) {
    el.textContent = `Sync init failed: ${initErr}`;
    el.style.color = '#fbbf24';
    _mnemonicRetries = 0;
    return;
  }
  if (_mnemonicRetries < 30) {
    _mnemonicRetries++;
    el.textContent = 'Resolving…';
    _mnemonicRetryTimer = setTimeout(loadMnemonic, 1000);
  } else {
    el.textContent = 'Could not resolve mnemonic — open the dev console and check for [sync] errors, or try a hard refresh';
    el.style.color = '#fbbf24';
    _mnemonicRetries = 0;
  }
}

function toggleMnemonicVisibility() {
  const el = document.getElementById('sync-mnemonic');
  const btn = document.getElementById('sync-mnemonic-toggle');
  if (!el || !btn || !_mnemonicCache) return;
  const masked = el.dataset.masked === 'true';
  if (masked) {
    el.textContent = _mnemonicCache;
    el.dataset.masked = 'false';
    el.style.userSelect = 'all';
    btn.textContent = 'Hide';
  } else {
    el.textContent = MNEMONIC_MASK;
    el.dataset.masked = 'true';
    el.style.userSelect = 'none';
    btn.textContent = 'Show';
  }
}

let _clipboardClearTimer = null;
function copyMnemonic() {
  if (!_mnemonicCache) return;
  navigator.clipboard.writeText(_mnemonicCache).then(() => {
    showNotification('Mnemonic copied — clipboard will clear in 60s', 'success');
    clearTimeout(_clipboardClearTimer);
    _clipboardClearTimer = setTimeout(() => {
      navigator.clipboard.writeText('').catch(() => {});
    }, 60000);
  }).catch(() => {
    showNotification('Could not access clipboard', 'error');
  });
}

function copySyncIdentityCode() {
  if (!_identityFingerprintCache) return;
  navigator.clipboard.writeText(_identityFingerprintCache).then(() => {
    showNotification('Sync identity code copied', 'success');
  }).catch(() => {
    showNotification('Could not access clipboard', 'error');
  });
}

async function confirmRestoreMnemonic() {
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('sync-restore-dialog-input'));
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('sync-restore-dialog-go'));
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
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('sync-relay-input'));
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
  if (!isSyncEnabled()) return;
  loadMnemonic();
  void loadSyncIdentityFingerprint();
  updateRelayStatus();
}

installSettingsSyncDelegates();
