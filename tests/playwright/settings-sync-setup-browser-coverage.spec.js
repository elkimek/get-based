import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?settingsSyncSetupCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openIsolatedSyncSetupPage(page) {
  await page.route('**/settings-sync-setup-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html>
      <html>
        <body>
          <div id="notification-container"></div>
          <section id="sync-section"></section>
        </body>
      </html>`,
  }));
  await page.route('**/js/sync.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      const stub = window.__settingsSyncSetupStub;
      export function isSyncEnabled() { return !!stub.enabled; }
      export async function enableSync(options = {}) {
        stub.calls.push({ fn: 'enableSync', skipPush: options.skipPush === true });
        stub.enabled = true;
        return true;
      }
      export async function disableSync() {
        stub.calls.push({ fn: 'disableSync' });
        stub.enabled = false;
        return true;
      }
      export function getMnemonic() { return stub.mnemonic || null; }
      export function getMnemonicResolutionError() { return stub.mnemonicError || null; }
      export async function getSyncIdentityFingerprint() { return stub.fingerprint || null; }
      export function getSyncBlocker() { return null; }
      export async function restoreFromMnemonic(mnemonic) {
        stub.calls.push({ fn: 'restoreFromMnemonic', mnemonic });
        return stub.restoreResult !== false;
      }
      export function getSyncRelay() { return stub.relay || 'wss://relay.example'; }
      export function setSyncRelay(relay) {
        stub.calls.push({ fn: 'setSyncRelay', relay });
        stub.relay = relay;
      }
      export function checkRelayConnection() {
        stub.calls.push({ fn: 'checkRelayConnection' });
        return true;
      }
      export async function applyPendingTombstone(id) {
        stub.calls.push({ fn: 'applyPendingTombstone', id });
      }
      export function listPendingTombstones() { return []; }
      export async function rejectPendingTombstone(id) {
        stub.calls.push({ fn: 'rejectPendingTombstone', id });
      }
      export function updateSyncIndicator() {
        stub.calls.push({ fn: 'updateSyncIndicator' });
      }
      export function showSyncDiagnose() {
        stub.calls.push({ fn: 'showSyncDiagnose' });
      }
      export function onDataSaved(options = {}) {
        stub.calls.push({ fn: 'onDataSaved', immediate: options.immediate === true, skipSync: options.skipSync === true });
      }
      export function setAgentAccessWearableSeriesDays(days) {
        stub.calls.push({ fn: 'setAgentAccessWearableSeriesDays', days });
        stub.wearableSeriesDays = days;
      }
      export function getAgentAccessState() {
        return { enabled: false, token: null, contextKey: null, wearableSeriesDays: stub.wearableSeriesDays || 0 };
      }
      export function migrateLocalAgentAccessToProfile() {
        stub.calls.push({ fn: 'migrateLocalAgentAccessToProfile' });
        return null;
      }
      export function isAgentAccessMigrationDirty() { return false; }
      export function clearAgentAccessMigrationDirty() {
        stub.calls.push({ fn: 'clearAgentAccessMigrationDirty' });
      }
      export function clearLegacyAgentAccessSecrets() {
        stub.calls.push({ fn: 'clearLegacyAgentAccessSecrets' });
      }
      export function isMessengerEnabled() { return false; }
      export function getMessengerToken() { return null; }
      export function getMessengerContextKey() { return null; }
      export function hasMessengerSyncIdentity() { return true; }
      export function generateMessengerToken() {
        stub.calls.push({ fn: 'generateMessengerToken' });
        return { token: 'token', previousToken: null };
      }
      export function generateMessengerContextKey() {
        stub.calls.push({ fn: 'generateMessengerContextKey' });
        return 'gbctx_v1_test-context-key';
      }
      export function disableMessengerTokenLocal() {
        stub.calls.push({ fn: 'disableMessengerTokenLocal' });
        return 'previous-token';
      }
      export function revokeMessengerTokenRemote(token) {
        stub.calls.push({ fn: 'revokeMessengerTokenRemote', token });
      }
      export function revokeMessengerToken() {
        stub.calls.push({ fn: 'revokeMessengerToken' });
      }
      export function pushContextToGateway() {
        stub.calls.push({ fn: 'pushContextToGateway' });
      }
    `,
  }));
  await page.goto('/settings-sync-setup-browser-coverage', { waitUntil: 'load' });
}

test('settings sync setup browser coverage exercises mnemonic setup restore and clipboard flows', async ({ page }) => {
  await openIsolatedSyncSetupPage(page);

  const results = await page.evaluate(async ({ syncPanelUrl }) => {
    const mnemonic = Array.from({ length: 24 }, (_, index) => `word${index + 1}`).join(' ');
    const clipboardWrites = [];
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, key == null ? null : localStorage.getItem(key)];
    }));
    const savedClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const toasts = () => Array.from(document.querySelectorAll('.notification-toast'))
      .map(el => el.textContent || '');

    window.__settingsSyncSetupStub = {
      calls: [],
      enabled: false,
      mnemonic,
      fingerprint: 'A94F-2C71-B803',
      restoreResult: true,
      relay: 'wss://relay.example',
    };

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async value => {
          clipboardWrites.push(String(value || ''));
        },
      },
    });

    const syncPanel = await import(syncPanelUrl);
    await syncPanel.loadSettingsSyncPanelModule();
    const syncSection = document.getElementById('sync-section');
    if (!(syncSection instanceof HTMLElement)) {
      throw new Error('sync-section fixture missing');
    }
    const outcomes = {};
    const legacyWindowGlobals = [
      'toggleSync', 'toggleMnemonicVisibility', 'copyMnemonic', 'copySyncIdentityCode',
      'openRestoreMnemonicDialog', 'closeRestoreMnemonicDialog', 'confirmRestoreMnemonic',
      'saveSyncRelay', 'closeSyncSetup', 'syncSetupNew', 'syncSetupRestore', 'syncSetupBack',
      'syncSetupDoRestore', 'syncSetupDone', 'showSyncSetupModal', 'toggleMessenger',
      'toggleMessengerToken', 'toggleMessengerContextKey', 'copyMessengerToken',
      'copyMessengerContextKey', 'regenerateMessengerToken', 'regenerateMessengerContextKey',
    ];
    outcomes.legacyWindowFacadeStaysAbsent = legacyWindowGlobals.every(name => !(name in window));

    try {
      syncSection.innerHTML = syncPanel.renderSyncSection();
      syncPanel.showSyncSetupModal();
      document.querySelector('[data-sync-setup-action="setup-new"]')?.click();
      await waitFor(() => !!document.getElementById('sync-setup-ack'), 'new setup mnemonic acknowledgement');
      const ack = document.getElementById('sync-setup-ack');
      const done = document.getElementById('sync-setup-done-btn');
      if (!(ack instanceof HTMLInputElement) || !(done instanceof HTMLButtonElement)) {
        throw new Error('new setup acknowledgement controls missing');
      }
      outcomes.newSetupGeneratesMnemonicAndRequiresAck =
        window.__settingsSyncSetupStub.calls.some(call => call.fn === 'enableSync' && call.skipPush === false)
        && document.getElementById('sync-setup-new')?.textContent.includes('word24') === true
        && done.disabled === true;

      ack.checked = true;
      ack.dispatchEvent(new Event('change', { bubbles: true }));
      outcomes.acknowledgementEnablesDone =
        done.disabled === false
        && done.style.opacity === '1'
        && done.style.cursor === 'pointer';
      done.click();
      await waitFor(() => !document.getElementById('sync-setup-overlay')?.classList.contains('show'), 'setup modal closed');
      outcomes.setupDoneRendersEnabledSection =
        syncSection.textContent.includes('Your mnemonic')
        && window.__settingsSyncSetupStub.calls.some(call => call.fn === 'checkRelayConnection');

      window.__settingsSyncSetupStub.enabled = true;
      syncSection.innerHTML = syncPanel.renderSyncSection();
      outcomes.enabledStateExposesRestoreAndDisableControls =
        syncSection.querySelector('[data-sync-action="open-restore-dialog"]')?.textContent.includes('Restore / switch identity') === true
        && syncSection.querySelector('[data-sync-action="disable-sync"]')?.textContent.includes('Disable on this device') === true
        && syncSection.textContent.includes('relay data is not deleted');
      syncPanel.hydrateSettingsSyncPanel();
      await waitFor(() => document.getElementById('sync-mnemonic')?.dataset.masked === 'true', 'masked mnemonic');
      await waitFor(() => document.getElementById('sync-identity-code')?.textContent === 'A94F-2C71-B803', 'sync identity code');
      outcomes.identityCodeIsProminentAndSafeToCompare =
        document.querySelector('.sync-identity-card')?.textContent.includes('same 24-word Data Sync identity') === true
        && document.querySelector('.sync-identity-card')?.textContent.includes('this code doesn’t grant access to your data') === true
        && document.getElementById('sync-identity-copy')?.hasAttribute('disabled') === false;
      document.querySelector('[data-sync-action="copy-identity-code"]')?.click();
      await waitFor(() => clipboardWrites.includes('A94F-2C71-B803'), 'identity code clipboard write');
      outcomes.copyIdentityCodeWritesNonSecretCode =
        clipboardWrites.includes('A94F-2C71-B803')
        && toasts().some(text => text.includes('Sync identity code copied'));
      document.querySelector('[data-sync-action="toggle-mnemonic"]')?.click();
      outcomes.toggleMnemonicShowsCachedWords =
        document.getElementById('sync-mnemonic')?.textContent === mnemonic
        && document.getElementById('sync-mnemonic-toggle')?.textContent === 'Hide';
      document.querySelector('[data-sync-action="copy-mnemonic"]')?.click();
      await waitFor(() => clipboardWrites.includes(mnemonic), 'mnemonic clipboard write');
      outcomes.copyMnemonicWritesClipboardAndNotifies =
        clipboardWrites.includes(mnemonic)
        && toasts().some(text => text.includes('Mnemonic copied'));
      document.querySelector('[data-sync-action="show-sync-diagnose"]')?.click();
      await waitFor(() => window.__settingsSyncSetupStub.calls.some(call => call.fn === 'showSyncDiagnose'), 'sync diagnostics action');
      outcomes.advancedSettingsExposeSyncDiagnostics =
        window.__settingsSyncSetupStub.calls.some(call => call.fn === 'showSyncDiagnose');

      syncPanel.showSyncSetupModal();
      document.querySelector('[data-sync-setup-action="setup-restore"]')?.click();
      const setupRestoreInput = document.getElementById('sync-setup-restore-input');
      if (!(setupRestoreInput instanceof HTMLTextAreaElement)) {
        throw new Error('setup restore input missing');
      }
      setupRestoreInput.value = mnemonic;
      document.querySelector('[data-sync-setup-action="setup-do-restore"]')?.click();
      await waitFor(() => window.__settingsSyncSetupStub.calls
        .filter(call => call.fn === 'restoreFromMnemonic').length >= 1, 'setup restore call');
      outcomes.setupRestoreEnablesThrowawayIdentityThenRestores =
        window.__settingsSyncSetupStub.calls.some(call => call.fn === 'enableSync' && call.skipPush === true)
        && window.__settingsSyncSetupStub.calls.some(call => call.fn === 'restoreFromMnemonic' && call.mnemonic === mnemonic);

      window.__settingsSyncSetupStub.restoreResult = false;
      window.__settingsSyncSetupStub.enabled = true;
      syncSection.innerHTML = syncPanel.renderSyncSection();
      document.querySelector('[data-sync-action="open-restore-dialog"]')?.click();
      await waitFor(() => !!document.getElementById('sync-restore-dialog-input'), 'restore dialog');
      const dialogInput = document.getElementById('sync-restore-dialog-input');
      const dialogButton = document.getElementById('sync-restore-dialog-go');
      if (!(dialogInput instanceof HTMLTextAreaElement) || !(dialogButton instanceof HTMLButtonElement)) {
        throw new Error('restore dialog controls missing');
      }
      dialogInput.value = mnemonic;
      dialogInput.dispatchEvent(new Event('input', { bubbles: true }));
      window.__settingsSyncSetupStub.enabled = false;
      dialogButton.click();
      await waitFor(() => dialogButton.textContent === 'Restore & reload', 'restore button reset');
      outcomes.confirmRestoreHandlesFailedRestore =
        window.__settingsSyncSetupStub.calls
          .filter(call => call.fn === 'restoreFromMnemonic' && call.mnemonic === mnemonic).length >= 2
        && dialogButton.disabled === false
        && toasts().some(text => text.includes('Sync not initialized'));
    } finally {
      document.getElementById('sync-setup-overlay')?.remove();
      document.getElementById('sync-restore-overlay')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      if (savedClipboard) Object.defineProperty(navigator, 'clipboard', savedClipboard);
      else delete navigator.clipboard;
      delete window.__settingsSyncSetupStub;
    }

    return outcomes;
  }, {
    syncPanelUrl: moduleUrl('/js/settings-sync-panel.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
