// settings-agent-access-panel.js — Settings → Agent Access rendering/actions.

import { showNotification, bindSyncAppliedRefresh } from './utils.js';
import { addUtilsRuntimeListener } from './utils-runtime.js';
import { state } from './state.js';
import { beginAgentAccessMutation, isAgentAccessMutationPending } from './settings-agent-access-mutation.js';
import { captureAgentAccessOperationScope } from './sync-messenger.js';
import {
  clearAgentAccessMigrationDirty,
  clearLegacyAgentAccessSecrets,
  disableMessengerTokenLocal,
  getAgentAccessState,
  getSyncRelay,
  isSyncEnabled,
  isMessengerEnabled,
  getMessengerToken,
  getMessengerContextKey,
  hasMessengerSyncIdentity,
  isAgentAccessMigrationDirty,
  migrateLocalAgentAccessToProfile,
  refreshAgentAccessFromSyncedProfile,
  generateMessengerToken,
  generateMessengerContextKey,
  revokeMessengerTokenRemote,
  pushContextToGateway,
} from './sync.js';
import { saveImportedData } from './data.js';
import { AGENT_ACCESS_CLIENTS } from './settings-agent-access-contract.js';
import type { AgentAccessSnapshot } from './settings-agent-access-contract.js';
import { disposeAgentAccessSection, getAgentAccessView, mountAgentAccessSection } from './settings-agent-access-component.js';

export { disposeAgentAccessSection };

let _tokenClipboardClearTimer: ReturnType<typeof setTimeout> | null = null;
let _contextKeyClipboardClearTimer: ReturnType<typeof setTimeout> | null = null;
let _setupCommandClipboardClearTimer: ReturnType<typeof setTimeout> | null = null;

function normalizeAgentAccessClient(client: unknown) {
  const id = String(client || 'hermes').trim();
  return AGENT_ACCESS_CLIENTS.some(c => c.id === id) ? id : 'hermes';
}

function agentAccessClientMeta(client: unknown) {
  const id = normalizeAgentAccessClient(client);
  return AGENT_ACCESS_CLIENTS.find(c => c.id === id) || AGENT_ACCESS_CLIENTS[0]!;
}

function syncRelayHttpUrl() {
  let relay = 'https://sync.getbased.health';
  try { relay = getSyncRelay?.() || relay; } catch {}
  return String(relay).replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

export function buildAgentAccessSetupCommand(client: unknown = 'hermes') {
  const token = getMessengerToken();
  const contextKey = getMessengerContextKey();
  if (!token || !contextKey) return null;
  const targetClient = normalizeAgentAccessClient(client);
  const payload = {
    version: 1,
    token: token,
    contextKey: contextKey,
    gateway: syncRelayHttpUrl(),
    client: targetClient,
    createdAt: new Date().toISOString(),
  };
  const setup = 'gbsetup_v1_' + btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  // Private bootstrap command shape: install/upgrade the stack, then connect the selected MCP client with this setup payload.
  return `curl -fsSL https://getbased.health/install.sh | bash -s -- connect ${targetClient} --setup '${setup}'`;
}

async function writePrivateClipboard(text: string, onSuccess?: () => void) {
  await navigator.clipboard.writeText(text);
  onSuccess?.();
}

function clearClipboardLater(timer: ReturnType<typeof setTimeout> | null, delay = 60000) {
  clearTimeout(timer!);
  return setTimeout(() => { navigator.clipboard.writeText('').catch(() => {}); }, delay);
}

async function persistMigratedAgentAccessIfNeeded() {
  if (!isAgentAccessMigrationDirty()) return;
  const scope = captureAgentAccessOperationScope();
  const migrated = JSON.stringify(state.importedData.agentAccess);
  const saved = await saveImportedData({ reason: 'agent-access-migration' });
  if (saved === false) {
    console.warn('[agent-access] migrated legacy Agent Access but could not persist it yet');
    return;
  }
  if (!scope.isCurrent() || JSON.stringify(state.importedData.agentAccess) !== migrated) return;
  clearAgentAccessMigrationDirty();
  clearLegacyAgentAccessSecrets();
  refreshAgentAccessFromSyncedProfile({ migrateLegacy: false });
}

function getAgentAccessSnapshot(): AgentAccessSnapshot {
  return {
    enabled: isMessengerEnabled(),
    pending: isAgentAccessMutationPending(),
    hasToken: !!getMessengerToken(),
    syncReady: isSyncEnabled(),
    ownerReady: hasMessengerSyncIdentity(),
    seriesDays: getAgentAccessState().wearableSeriesDays || 0,
  };
}

export function hydrateMessengerSection(refresh = false): void {
  const host = document.querySelector<HTMLElement>('#messenger-section [data-agent-access-root]');
  if (!host) return;
  mountAgentAccessSection(host, getAgentAccessSnapshot(), refresh);
}

export function prepareMessengerSection(): void {
  migrateLocalAgentAccessToProfile();
  void persistMigratedAgentAccessIfNeeded();
  // Keep the string/URL contract for callers. The normal Settings hydrate is
  // synchronous; standalone callers receive the same component next microtask.
  queueMicrotask(() => hydrateMessengerSection());
}

export function renderMessengerSection(): string {
  prepareMessengerSection();
  return '<div data-agent-access-root></div>';
}

function startCredentialMutation() {
  const mutation = beginAgentAccessMutation();
  if (!mutation) {
    showNotification('Agent Access change already in progress — wait for it to finish.', 'info');
    hydrateMessengerSection(true);
  }
  return mutation;
}

export async function toggleMessenger(enabled: unknown) {
  const mutation = startCredentialMutation();
  if (!mutation) return;
  try {
    if (enabled) {
      if (!isSyncEnabled()) {
        showNotification('Enable or restore Cross-device Sync first — Agent Access storage is bound to that Sync identity.', 'error');
        return;
      }
      if (!hasMessengerSyncIdentity()) {
        showNotification('Sync owner is still resolving — wait for Cross-device Sync to finish loading before enabling Agent Access.', 'error');
        return;
      }
      const { previousToken } = generateMessengerToken();
      mutation.captureApplied();
      hydrateMessengerSection(true);
      const saved = await mutation.save('agent-access-enable');
      if (saved === false) throw new Error('saveImportedData returned false while enabling Agent Access');
      mutation.confirmPersisted();
      if (mutation.isCurrent()) clearLegacyAgentAccessSecrets();
      if (previousToken) revokeMessengerTokenRemote(previousToken, mutation.scope);
      if (mutation.isCurrent()) pushContextToGateway();
      showNotification('Agent Access enabled', 'success');
    } else {
      const previousToken = disableMessengerTokenLocal();
      mutation.captureApplied();
      hydrateMessengerSection(true);
      const saved = await mutation.save('agent-access-disable');
      if (saved === false) throw new Error('saveImportedData returned false while disabling Agent Access');
      mutation.confirmPersisted();
      if (mutation.isCurrent()) clearLegacyAgentAccessSecrets();
      revokeMessengerTokenRemote(previousToken, mutation.scope);
      showNotification('Agent Access disabled', 'success');
    }
  } catch (err) {
    mutation.rollback();
    console.warn(mutation.persisted ? '[agent-access] post-save relay update failed' : '[agent-access] failed to persist Agent Access toggle', err);
    showNotification(mutation.persisted
      ? 'Agent Access was saved, but its relay update could not be started. Use Sync now to retry.'
      : enabled
      ? 'Could not save Agent Access token — try enabling again before updating your agent config.'
      : 'Could not save Agent Access disable — try again before removing your agent config.', 'error');
  } finally {
    mutation.release();
    if (mutation.scope.isCurrent()) refreshMessengerSectionForOwnerChange();
    else hydrateMessengerSection(true);
  }
}

export function toggleMessengerToken(): void {
  const token = getMessengerToken();
  if (token) getAgentAccessView()?.toggleSecret('token', token);
}

export function toggleMessengerContextKey(): void {
  const contextKey = getMessengerContextKey();
  if (contextKey) getAgentAccessView()?.toggleSecret('context-key', contextKey);
}

export function copyMessengerToken() {
  const token = getMessengerToken();
  if (!token) return;
  navigator.clipboard.writeText(token).then(() => {
    showNotification('Token copied — clipboard will clear in 60s', 'success');
    clearTimeout(_tokenClipboardClearTimer!);
    _tokenClipboardClearTimer = setTimeout(() => { navigator.clipboard.writeText('').catch(() => {}); }, 60000);
  }).catch(() => { showNotification('Could not access clipboard', 'error'); });
}

export function copyMessengerContextKey() {
  const contextKey = getMessengerContextKey();
  if (!contextKey) return;
  navigator.clipboard.writeText(contextKey).then(() => {
    showNotification('Context encryption key copied — clipboard will clear in 60s', 'success');
    _contextKeyClipboardClearTimer = clearClipboardLater(_contextKeyClipboardClearTimer);
  }).catch(() => { showNotification('Could not access clipboard', 'error'); });
}

function selectedAgentAccessClient() {
  const input = document.querySelector('input[name="agent-access-client"]:checked');
  return normalizeAgentAccessClient(input && 'value' in input ? input.value : 'hermes');
}

export function copyAgentAccessSetupCommand() {
  const client = selectedAgentAccessClient();
  const meta = agentAccessClientMeta(client);
  const command = buildAgentAccessSetupCommand(client);
  if (!command) {
    showNotification('Agent Access credentials are not ready yet — enable Agent Access first.', 'error');
    return;
  }
  writePrivateClipboard(command, () => {
    showNotification(`${meta.label} setup command copied — paste it into the terminal where ${meta.terminal} runs`, 'success');
    _setupCommandClipboardClearTimer = clearClipboardLater(_setupCommandClipboardClearTimer);
  }).catch(() => { showNotification('Could not access clipboard', 'error'); });
}

export async function regenerateMessengerToken() {
  if (!hasMessengerSyncIdentity()) {
    showNotification('Sync owner is still resolving — wait before regenerating Agent Access credentials.', 'error');
    refreshMessengerSectionForOwnerChange();
    return;
  }
  const mutation = startCredentialMutation();
  if (!mutation) return;
  try {
    const { previousToken } = generateMessengerToken();
    mutation.captureApplied();
    hydrateMessengerSection(true);
    const saved = await mutation.save('agent-access-regenerate-token');
    if (saved === false) throw new Error('saveImportedData returned false while regenerating Agent Access token');
    mutation.confirmPersisted();
    if (mutation.isCurrent()) clearLegacyAgentAccessSecrets();
    if (previousToken) revokeMessengerTokenRemote(previousToken, mutation.scope);
    if (mutation.isCurrent()) pushContextToGateway();
    showNotification('Token regenerated — update GETBASED_TOKEN in your agent config', 'success');
  } catch (err) {
    mutation.rollback();
    console.warn(mutation.persisted ? '[agent-access] post-save relay update failed' : '[agent-access] failed to persist regenerated token', err);
    showNotification(mutation.persisted
      ? 'Token was saved, but its relay update could not be started. Use Sync now to retry.'
      : 'Could not save regenerated token — try again before updating your agent config.', 'error');
  } finally {
    mutation.release();
    if (mutation.scope.isCurrent()) refreshMessengerSectionForOwnerChange();
    else hydrateMessengerSection(true);
  }
}

export async function regenerateMessengerContextKey() {
  if (!hasMessengerSyncIdentity()) {
    showNotification('Sync owner is still resolving — wait before regenerating Agent Access credentials.', 'error');
    refreshMessengerSectionForOwnerChange();
    return;
  }
  const mutation = startCredentialMutation();
  if (!mutation) return;
  try {
    generateMessengerContextKey();
    mutation.captureApplied();
    hydrateMessengerSection(true);
    const saved = await mutation.save('agent-access-regenerate-context-key');
    if (saved === false) throw new Error('saveImportedData returned false while regenerating Agent Access context key');
    mutation.confirmPersisted();
    if (mutation.isCurrent()) clearLegacyAgentAccessSecrets();
    if (mutation.isCurrent()) pushContextToGateway();
    showNotification('Context key regenerated — update GETBASED_AGENT_CONTEXT_KEY in your agent config', 'success');
  } catch (err) {
    mutation.rollback();
    console.warn(mutation.persisted ? '[agent-access] post-save relay update failed' : '[agent-access] failed to persist regenerated context key', err);
    showNotification(mutation.persisted
      ? 'Context key was saved, but its relay update could not be started. Use Sync now to retry.'
      : 'Could not save regenerated context key — try again before updating your agent config.', 'error');
  } finally {
    mutation.release();
    if (mutation.scope.isCurrent()) refreshMessengerSectionForOwnerChange();
    else hydrateMessengerSection(true);
  }
}

export function refreshMessengerSectionForOwnerChange() {
  migrateLocalAgentAccessToProfile();
  void persistMigratedAgentAccessIfNeeded();
  hydrateMessengerSection(true);
}

addUtilsRuntimeListener('labcharts-sync-owner-changed', refreshMessengerSectionForOwnerChange);
bindSyncAppliedRefresh(refreshMessengerSectionForOwnerChange);
addUtilsRuntimeListener('labcharts-profile-switched', refreshMessengerSectionForOwnerChange);
