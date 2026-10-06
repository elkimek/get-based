import { routeHtml, routeJavaScript } from './browser-static-routes.js';

export async function openIsolatedSyncSetupPage(page:import("@playwright/test").Page) {
  await routeHtml(page, '**/settings-sync-setup-browser-coverage', `<!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link rel="stylesheet" href="/styles.css">
          <link rel="stylesheet" href="/css/app-shell.css">
          <link rel="stylesheet" href="/css/modal-shared.css">
          <link rel="stylesheet" href="/css/settings.css">
        </head>
        <body>
          <div id="notification-container"></div>
          <section id="sync-section"></section>
        </body>
      </html>`, 200);
  await routeJavaScript(page, '**/js/sync.js*', `
      const stub = window.__settingsSyncSetupStub;
      export function isSyncEnabled() { return !!stub.enabled; }
      export function isSyncConfigured() { return !!stub.enabled || !!stub.paused; }
      export function isSyncPaused() { return !!stub.paused; }
      export async function enableSync(options = {}) {
        stub.calls.push({
          fn: 'enableSync',
          skipPush: options.skipPush === true,
          persist: options.persist !== false,
        });
        if (stub.enableResult === false) {
          stub.enabled = false;
          return false;
        }
        stub.enabled = true;
        stub.paused = false;
        return true;
      }
      export async function disableSync() {
        stub.calls.push({ fn: 'disableSync' });
        stub.enabled = false;
        stub.paused = false;
        return true;
      }
      export async function pauseSync() {
        stub.calls.push({ fn: 'pauseSync' });
        stub.enabled = false;
        stub.paused = true;
        return true;
      }
      export function getSyncIdentityOwnerId() { return stub.ownerId || (stub.enabled ? 'synthetic-owner' : null); }
      export function getMnemonic() { return stub.mnemonic || null; }
      export function getMnemonicResolutionError() { return stub.mnemonicError || null; }
      export async function getSyncIdentityFingerprint() { return await (stub.fingerprintPromise || stub.fingerprint || null); }
      export function getSyncBlocker() { return stub.blocker || null; }
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
        return stub.relayPromise || stub.connected !== false;
      }
      export async function applyPendingTombstone(id) {
        stub.calls.push({ fn: 'applyPendingTombstone', id });
      }
      export function listPendingTombstones() { return stub.pending || []; }
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
      export function refreshAgentAccessFromSyncedProfile() { return false; }
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
    `, 200);
  await page.goto('/settings-sync-setup-browser-coverage', { waitUntil: 'load' });
}
