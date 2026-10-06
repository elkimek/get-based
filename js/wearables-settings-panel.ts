type ClosestEventTarget = EventTarget & Partial<Pick<Element, 'closest'>>;

// wearables-settings-panel.js — Settings → Wearables integrations panel.
// Keeps provider rows, connection actions, Apple Health import controls, and
// manual-source management out of the dashboard strip renderer.

import { getErrorMessage } from './caught-error.js';
import { showNotification, showConfirmDialog } from './utils.js';
import { state } from './state.js';
import {
  adapterById,
  visibleAdapters,
  getOAuthClientId,
  isOAuthAdapterConfigured,
  isWearableRelayUnavailable,
} from './wearable-adapters.js';
import { SELF_HOSTED_WEARABLE_MESSAGE, isOfficialGetbasedHost } from './url-safety.js';
import { buildWearablesSettingsSnapshot } from './wearables-settings-view.js';
import { mountWearablesSettings, getWearablesSettingsView } from './wearables-settings-component.js';
import { requestHostedWearableRelayConsent, withdrawHostedWearableRelayConsent } from './wearables-settings-groups.js';
import {
  beginConnectOAuth,
  backfillWearable,
  disconnectWearable,
  syncNow,
  listConnectedSources,
  loadWearableRuntimeConfig,
} from './wearables-connect.js';
import { syncWearableSummary } from './wearables-summary.js';
import { getActiveProfileId } from './profile.js';
import { getDailyRange } from './wearables-store.js';
import { deleteAllManualMetrics, refreshManualSummary } from './wearables-manual.js';
import {
  closeWearableSettingsModal,
  confirmWearableSettingsAction,
  navigateWearablesDashboard,
} from './wearables-settings-runtime.js';
let wearableSettingsDelegatesInstalled = false;
const pendingAdapters = new Set<string>();

export const GOOGLE_HEALTH_CONNECT_DISCLOSURE = `Google Health will let getbased read three categories from your Google account: activity and fitness; health metrics and measurements; and sleep. No write access is requested.

getbased uses this data to show daily Body metrics, personal baselines, trends, and comparisons. OAuth tokens and imported daily rows are AES-GCM encrypted on this device. Google Health is self-host only: OAuth exchanges and Google API requests use infrastructure controlled by that deployment.

If you enable cross-device sync, a compact derived summary is sent through the end-to-end-encrypted relay. If you use a cloud AI or agent while Wearables context is enabled, that summary may be sent to the provider you selected. You can disable Wearables context before using those features.

Disconnecting deletes this device's Google Health credentials, imported rows, and derived source data. Revoke getbased in your Google Account to stop access on every device.`;

const HOSTED_WEARABLE_RELAY_ADAPTERS = new Set(['oura', 'withings', 'polar', 'fitbit']);

export function requiresHostedWearableRelayConsent(adapterId: string, locationLike: Parameters<typeof isOfficialGetbasedHost>[0] = globalThis.location) {
  return isOfficialGetbasedHost(locationLike) && HOSTED_WEARABLE_RELAY_ADAPTERS.has(adapterId);
}

export function hostedWearableRelayDisclosure(providerName: string) {
  return `getbased s.r.o. uses its secure relay to connect ${providerName} and import the health readings you request. The relay can read those values while forwarding them, but does not intentionally store request or response contents.

You can withdraw at any time by disconnecting ${providerName}, which stops future imports and removes this device's connection and imported ${providerName} data. Encrypted sync and cloud AI are separate choices.`;
}

function clickAppleHealthFileInput() {
  document.getElementById('apple-health-file-input')?.click();
}

function handleWearableSettingsClick(event: Event) {
  const target = event.target as ClosestEventTarget | null;
  if (!target || typeof target.closest !== 'function') return;
  const actionEl = (target.closest('[data-wearable-settings-action]') as HTMLElement | null);
  if (!actionEl?.dataset) return;

  const action = actionEl.dataset.wearableSettingsAction || '';
  if (actionEl.dataset.wearableSettingsStopPropagation === 'true') {
    event.stopPropagation();
  }

  const currentView = getWearablesSettingsView();
  if (currentView && currentView.profileId !== getActiveProfileId()) { event.preventDefault(); hydrateWearablesSettingsPanel(); return; }
  const adapterId = actionEl.dataset.wearableSettingsAdapter || '';
  switch (action) {
    case 'connect':
      event.preventDefault();
      handleWearableConnect(adapterId);
      break;
    case 'pick-apple-health-file':
      event.preventDefault();
      clickAppleHealthFileInput();
      break;
    case 'sync-now':
      event.preventDefault();
      handleWearableSyncNow(adapterId, (actionEl as HTMLButtonElement));
      break;
    case 'backfill':
      event.preventDefault();
      handleWearableBackfill(adapterId);
      break;
    case 'disconnect':
      event.preventDefault();
      handleWearableDisconnect(adapterId);
      break;
    case 'manual-dashboard':
      event.preventDefault();
      handleManualOpenDashboard();
      break;
    case 'manual-disconnect':
      event.preventDefault();
      handleManualDisconnect();
      break;
  }
}

function handleWearableSettingsChange(event: Event) {
  const target = event.target as ClosestEventTarget | null;
  const inputEl = (target as HTMLInputElement | null);
  if (!inputEl?.dataset?.wearableSettingsInput) return;

  switch (inputEl.dataset.wearableSettingsInput) {
    case 'strip-hidden':
      setWearableStripHidden(!inputEl.checked);
      break;
    case 'apple-health-file':
      handleAppleHealthFilePick(inputEl);
      break;
  }
}

function appleHealthDropzoneFromEvent(event: Event) {
  const target = event.target as ClosestEventTarget | null;
  if (!target || typeof target.closest !== 'function') return null;
  return (target.closest('[data-wearable-settings-dropzone="apple-health"]') as HTMLElement | null);
}

function handleWearableSettingsDragOver(event: Event) {
  const dropzone = appleHealthDropzoneFromEvent(event);
  if (!dropzone) return;
  event.preventDefault();
  dropzone.classList.add('drag-over');
}

function handleWearableSettingsDragLeave(event: Event) {
  const dropzone = appleHealthDropzoneFromEvent(event);
  if (!dropzone) return;
  dropzone.classList.remove('drag-over');
}

function handleWearableSettingsDrop(event: Event) {
  const dropzone = appleHealthDropzoneFromEvent(event);
  if (!dropzone) return;
  event.preventDefault();
  dropzone.classList.remove('drag-over');
  handleAppleHealthDrop((event as DragEvent));
}

export function installWearableSettingsDelegates(root: Document | HTMLElement | null = typeof document !== 'undefined' ? document : null) {
  if (!root || wearableSettingsDelegatesInstalled) return;
  wearableSettingsDelegatesInstalled = true;
  // Capture is required for action buttons nested inside <summary>; stopping
  // at document capture prevents the summary disclosure from toggling.
  root.addEventListener('click', handleWearableSettingsClick, true);
  root.addEventListener('change', handleWearableSettingsChange);
  root.addEventListener('dragover', handleWearableSettingsDragOver);
  root.addEventListener('dragleave', handleWearableSettingsDragLeave);
  root.addEventListener('drop', handleWearableSettingsDrop);
}

// Per-profile so a practitioner can disable wearables for a labs-only client
// without affecting their own profile. Mirrors the per-profile pattern used
// by `labcharts-wearable-stub-dismissed-${profile}` in wearables.js.
function _wearableStripHiddenKey() {
  return `wearables-strip-hidden-${state.currentProfile || 'default'}`;
}

export function isWearableStripHidden() {
  return localStorage.getItem(_wearableStripHiddenKey()) === '1';
}

export function setWearableStripHidden(hidden: boolean) {
  const key = _wearableStripHiddenKey();
  if (hidden) localStorage.setItem(key, '1');
  else localStorage.removeItem(key);
  navigateWearablesDashboard();
}

// Public string contract supplies the required host. Owned Svelte supplies markup.
export function renderWearablesSettingsSection(): string { return '<div data-wearables-view-host></div>'; }
export function hydrateWearablesSettingsPanel(): void {
  const section = document.getElementById('wearables-section');
  if (section) mountWearablesSettings(section, buildWearablesSettingsSnapshot(getActiveProfileId(), isWearableStripHidden()));
}
function captureWearablesOperation() {
  const profileId = getActiveProfileId();
  const profileData = state.importedData;
  const view = getWearablesSettingsView();
  const profileCurrent = () => getActiveProfileId() === profileId && state.importedData === profileData;
  const viewCurrent = () => profileCurrent() && !!view?.isCurrent() && view.profileId === profileId;
  return { profileId, profileCurrent, viewCurrent, view };
}

function beginWearablesAction(operation: ReturnType<typeof captureWearablesOperation>, adapterId: string): (() => void) | null {
  const key = `${operation.profileId}:${adapterId}`;
  if (pendingAdapters.has(key)) return null;
  pendingAdapters.add(key);
  if (operation.viewCurrent()) operation.view?.setPending(adapterId, true);
  return () => {
    pendingAdapters.delete(key);
    if (operation.viewCurrent()) operation.view?.setPending(adapterId, false);
  };
}

// Manual source — UI handlers. Settings → Integrations → Manual exposes a
// single-click path to (a) go log/manage on the dashboard and (b) nuke all
// manual data. Per-reading delete lives on the dashboard detail modal.
function handleManualOpenDashboard() {
  // Settings modal is an overlay; let the caller close it by dispatching the
  // same Escape path the close button uses. We just navigate the underlying
  // dashboard — the user hits Escape / closes Settings manually.
  closeWearableSettingsModal();
  navigateWearablesDashboard();
  requestAnimationFrame(() => {
    document.getElementById('wearable-strip')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function handleManualDisconnect() {
  const operation = captureWearablesOperation();
  const release = beginWearablesAction(operation, 'manual');
  if (!release) return;
  try {
    if (await confirmWearableSettingsAction(
      'Delete all manual entries? This removes every weight / BP / pulse entry you\'ve logged manually. Data from connected wearables (Oura, Withings, etc.) is untouched. Can\'t be undone.'
    )) {
      if (!operation.profileCurrent()) return;
      try {
        const profileId = operation.profileId;
        // Records synced per-field/date deletion markers before clearing L1,
        // including dates that only survive in the legacy biometrics payload.
        // A peer can therefore no longer rebuild and republish these readings.
        await deleteAllManualMetrics(profileId);
        await refreshManualSummary(profileId);
        showNotification?.('All manual entries deleted', 'success');
        if (operation.profileCurrent()) { refreshSettingsWearables(); navigateWearablesDashboard(); }
      } catch (e) {
        showNotification?.(`Couldn't delete: ${getErrorMessage(e)}`, 'error', 4000);
      }
    }
  } finally { release(); }
}

// Populate the "X weight, Y BP, Z pulse" counts line in the manual
// detail-drawer — async because it reads from IndexedDB. Called when the
// Settings section is rendered and whenever the drawer opens.
let manualCountsSequence = 0;
async function _updateManualCounts() {
  const operation = captureWearablesOperation();
  if (!operation.viewCurrent()) return;
  const sequence = ++manualCountsSequence;
  try {
    const rows = await getDailyRange(operation.profileId, 'manual', '2000-01-01', '2099-12-31');
    let weightN = 0, bpN = 0, rhrN = 0;
    for (const r of rows) {
      if (typeof r.weight === 'number') weightN++;
      if (typeof r.bp_systolic === 'number' || typeof r.bp_diastolic === 'number') bpN++;
      if (typeof r.rhr === 'number') rhrN++;
    }
    const parts: string[] = [];
    if (weightN) parts.push(`${weightN} weight`);
    if (bpN) parts.push(`${bpN} blood pressure`);
    if (rhrN) parts.push(`${rhrN} pulse`);
    if (operation.viewCurrent() && sequence === manualCountsSequence) operation.view?.setManualCounts(parts.length ? parts.join(' · ') + ' readings' : 'No manual entries yet');
  } catch {
    if (operation.viewCurrent() && sequence === manualCountsSequence) operation.view?.setManualCounts('Could not count entries. Reopen this section to retry.');
  }
}

function _oauthClientConfigFingerprint() {
  return visibleAdapters(Object.keys(listConnectedSources()))
    .filter(adapter => adapter.authType === 'oauth2')
    .map(adapter => `${adapter.id}:${getOAuthClientId(adapter) || ''}:${isOAuthAdapterConfigured(adapter)}`)
    .join('|');
}

async function _refreshAfterWearableRuntimeConfig() {
  const operation = captureWearablesOperation();
  const before = _oauthClientConfigFingerprint();
  await loadWearableRuntimeConfig({ waitForFetch: true });
  if (operation.viewCurrent() && before !== _oauthClientConfigFingerprint()) refreshSettingsWearables();
}

// Fire when the details element opens (delegated — the Settings section is
// re-rendered on demand so we can't bind once at module load).
document.addEventListener('toggle', (e) => {
  if (e.target instanceof HTMLDetailsElement
      && e.target.matches('details.wearable-row[data-adapter="manual"]')
      && e.target.open) {
    _updateManualCounts();
  }
}, true);

// Also fire on initial paint so the row populates whether or not the user
// toggles it. The Settings section re-renders on every open so a microtask
// kick is enough — no observer needed.
document.addEventListener('settings:wearables-rendered', () => {
  hydrateWearablesSettingsPanel();
  // Slightly defer so the [data-role="manual-counts"] element is in the DOM.
  queueMicrotask(_updateManualCounts);
  // A fresh profile has no connected OAuth source, so startup maintenance
  // does not load the public client-id map. Start it when Settings opens and
  // re-render only if the returned configuration changed an adapter row.
  void _refreshAfterWearableRuntimeConfig();
});

async function handleWearableConnect(adapterId: string) {
  try {
    const operation = captureWearablesOperation();
    const initiatingProfileId = operation.profileId;
    await loadWearableRuntimeConfig({ waitForFetch: true });
    if (!operation.profileCurrent()) return;
    const adapter = adapterById(adapterId);
    if (!adapter) throw new Error('Unknown wearable provider.');
    if (isWearableRelayUnavailable(adapter)) {
      showNotification?.(SELF_HOSTED_WEARABLE_MESSAGE, 'info', 7000);
      return;
    }
    if (adapter?.hostConfiguredOnly && !isOAuthAdapterConfigured(adapter)) {
      const message = adapter.id === 'google_health'
        ? 'Google Health is self-host only on this deployment. Configure your own Google Cloud OAuth project to enable it.'
        : `${adapter.displayName} is an experimental self-host integration. Configure and enable this deployment's own OAuth client first.`;
      showNotification?.(message, 'info', 6000);
      return;
    }
    if (adapterId === 'google_health') {
      const consented = await confirmWearableSettingsAction(GOOGLE_HEALTH_CONNECT_DISCLOSURE, {
        confirmLabel: 'Continue to Google',
        tone: 'primary',
        ariaLabel: 'Google Health data access consent',
      });
      if (!consented) return;
    } else if (adapterId === 'whoop') {
      const { WHOOP_CONNECT_DISCLOSURE } = await import('./wearables-whoop-storage.js');
      if (!await confirmWearableSettingsAction(WHOOP_CONNECT_DISCLOSURE, { confirmLabel: 'Continue to WHOOP', tone: 'primary', ariaLabel: 'WHOOP data access consent' })) return;
    } else if (requiresHostedWearableRelayConsent(adapterId)) {
      const consented = await requestHostedWearableRelayConsent(initiatingProfileId, adapterId, adapter.displayName);
      if (!consented) return;
    } else if (adapter?.experimentalSelfHost) {
      const consented = await confirmWearableSettingsAction(
        `${adapter.displayName} is an experimental self-hosted integration and uses this deployment's own developer app. Continue to ${adapter.displayName}?`,
        { confirmLabel: `Continue to ${adapter.displayName}`, tone: 'primary' },
      );
      if (!consented) return;
    }
    if (!operation.profileCurrent()) return;
    beginConnectOAuth(adapterId, initiatingProfileId);
    // beginOAuth navigates away — nothing else to do here.
  } catch (e) {
    showNotification?.(`Connect failed: ${getErrorMessage(e)}`, 'error', 5000);
  }
}

function handleAppleHealthDrop(e: DragEvent) {
  const file = e.dataTransfer?.files?.[0];
  if (file) importAppleHealthFlow(file);
}

function handleAppleHealthFilePick(input: HTMLInputElement) {
  const file = input.files?.[0];
  if (file) importAppleHealthFlow(file);
  input.value = ''; // so picking the same file twice re-triggers
}

let importingAppleHealth = false;
async function importAppleHealthFlow(file: File) {
  if (importingAppleHealth) return;
  const operation = captureWearablesOperation();
  importingAppleHealth = true;
  if (operation.viewCurrent()) operation.view?.setImportProgress({ message: 'Reading…', percent: 0 });
  try {
    const { importAppleHealthFile } = await import('./wearables-apple-health.js');
    if (!operation.profileCurrent()) return;
    const res = await importAppleHealthFile(file, ({ stage, pct, rows, startDate, endDate }) => {
      if (operation.viewCurrent()) operation.view?.setImportProgress({ percent: Math.max(0,Math.min(100,pct ?? 0)), message: stage === 'done' ? `${rows} days imported (${startDate} – ${endDate})` : `${stage}… ${pct ?? 0}%` });
    }, { beforeCycleReview: () => { if (operation.profileCurrent()) closeWearableSettingsModal(); } });
    const cycleSuffix = res.cycleImport ? ` + ${res.cycleImport.periods} cycle periods` : '';
    showNotification?.(`Apple Health imported - ${res.rows} days${cycleSuffix}`, 'success', 3000);
    if (res.cycleError) showNotification?.(`Cycle import skipped: ${res.cycleError}`, 'info', 5000);
    if (operation.profileCurrent()) { refreshSettingsWearables(); navigateWearablesDashboard(); }
  } catch (e) {
    showNotification?.(`Apple Health import failed: ${getErrorMessage(e)}`, 'error', 6000);
    if (operation.viewCurrent()) operation.view?.setImportProgress({ message: `Failed: ${getErrorMessage(e)}`, percent: 0, failed: true });
  } finally { importingAppleHealth = false; }
}

async function handleWearableSyncNow(adapterId: string, triggerEl?: HTMLButtonElement | null) {
  const operation = captureWearablesOperation();
  const release = beginWearablesAction(operation, adapterId);
  if (!release) return;
  const btn = triggerEl;
  btn?.classList.add('is-syncing');
  if (btn) btn.disabled = true;
  const name = adapterById(adapterId)?.displayName || adapterId;
  try {
    showNotification?.(`Checking ${name} for new readings…`, 'info', 1500);
    const res = (await syncNow(adapterId, { force: true })) as { rows?: unknown };
    showNotification?.(`${name} is up to date. ${res.rows ?? 0} days checked.`, 'success', 2500);
    if (operation.profileCurrent()) { refreshSettingsWearables(); navigateWearablesDashboard(); }
  } catch { /* syncNow already notified */ }
  finally {
    release();
    btn?.classList.remove('is-syncing');
    if (btn) btn.disabled = false;
  }
}

async function handleWearableBackfill(adapterId: string) {
  const operation = captureWearablesOperation();
  const release = beginWearablesAction(operation, adapterId);
  if (!release) return;
  try {
    const name = adapterById(adapterId)?.displayName || adapterId;
    try {
      showNotification?.(`Importing the last 90 days from ${name}…`, 'info', 2000);
      const bf = await backfillWearable(adapterId);
      if (!operation.profileCurrent()) return;
      await syncWearableSummary(operation.profileId, listConnectedSources());
      showNotification?.(`Imported ${bf.rows} days from ${name}.`, 'success');
      if (operation.profileCurrent()) { refreshSettingsWearables(); navigateWearablesDashboard(); }
    } catch (e) {
      showNotification?.(`Couldn't import ${name} history: ${getErrorMessage(e)}`, 'error', 4000);
    }
  } finally { release(); }
}

async function handleWearableDisconnect(adapterId: string) {
  const operation = captureWearablesOperation();
  const release = beginWearablesAction(operation, adapterId);
  if (!release) return;
  try {
    const name = adapterById(adapterId)?.displayName || adapterId;
    if (await showConfirmDialog(`Disconnect ${name}? This stops future imports and removes this device's connection and imported ${name} data.`)) {
      if (!operation.profileCurrent()) return;
      const profileId = operation.profileId;
      try {
        await disconnectWearable(adapterId, { deleteData: true });
        withdrawHostedWearableRelayConsent(profileId, adapterId);
        showNotification?.(`${name} disconnected`, 'success');
        if (operation.profileCurrent()) { refreshSettingsWearables(); navigateWearablesDashboard(); }
      } catch (e) {
        showNotification?.(`Disconnect failed: ${getErrorMessage(e)}`, 'error', 5000);
        if (operation.profileCurrent()) refreshSettingsWearables();
      }
    }
  } finally { release(); }
}

function refreshSettingsWearables() {
  const section = document.getElementById('wearables-section');
  if (!section) return;
  hydrateWearablesSettingsPanel();
  // Runtime OAuth configuration can arrive after the initial counts read and
  // replace the whole section. Rehydrate the async manual counts on the new
  // DOM instead of leaving the row stuck at "Counting readings…".
  queueMicrotask(_updateManualCounts);
}

export const wearableSettingsActionHandlers = Object.freeze({
  handleManualOpenDashboard,
  handleManualDisconnect,
  handleWearableConnect,
  handleWearableSyncNow,
  handleWearableBackfill,
  handleWearableDisconnect,
  handleAppleHealthDrop,
  handleAppleHealthFilePick,
});

installWearableSettingsDelegates();
