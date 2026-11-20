import {
  encryptAgentContextForRelay, generateAgentContextKeyValue, ownerIdString,
  ownerWriteKeyBytes, sha256Hex, signAgentContextRequest, type MessengerOwner,
} from './agent-context-crypto.js';
export { encryptAgentContextForRelay } from './agent-context-crypto.js';

import type { LabContextOptions } from './lab-context-runtime.js';
import type { StoredProfileRecord } from './profile-list-store.js';
import type { buildWearableSeriesSection as buildWearableSeries } from './lab-context-wearables.js';
// sync-messenger.js - Agent Access token and context gateway helpers.

import { state } from './state.js';
import { bindSyncAppliedRefresh } from './utils.js';
import { addUtilsRuntimeListener } from './utils-runtime.js';
import { isDemoProfileId } from './profile-sync-policy.js';
import { profileStorageKey } from './profile-storage-key.js';
import { MESSENGER_TOKEN_KEY, MESSENGER_ENABLED_KEY, MESSENGER_CONTEXT_KEY_KEY,
  AGENT_ACCESS_MIGRATION_PROFILE_KEY, retireAgentAccessLegacySource } from './agent-access-legacy-source.js';

export interface AgentAccessRecord extends Record<string, unknown> {
  version?: number;
  enabled?: boolean;
  token?: string | null;
  contextKey?: string | null;
  wearableSeriesDays?: number;
  updatedAt?: number;
  revokedAt?: number | null;
  migratedFromLocalStorageAt?: number;
  credentialCreatedAt?: number;
}
interface AgentAccessProfile {
  entries: unknown[];
  agentAccess?: unknown;
  agentAccessWearableSeriesDays?: unknown;
}

const AGENT_ACCESS_SYNC_VERSION = 1;

let _getSyncRelay: () => string = () => 'wss://sync.getbased.health';
let _getAppOwner: () => MessengerOwner | null = () => null;
let _debug: (...args: unknown[]) => void = () => {};
export const buildDefaultSyncMessengerContext = (_options?: LabContextOptions) => '';
let _buildLabContext: (options?: LabContextOptions) => string = buildDefaultSyncMessengerContext;
type ContextPreparation = () => Promise<(options?: LabContextOptions) => string>;
let _prepareContext: ContextPreparation | null = null;
let _buildWearableSeriesSection: typeof buildWearableSeries = async () => '';
let _getAgentWearableSeriesDays: () => number = () => 0;
let _getProfiles: () => StoredProfileRecord[] = () => [];
let _contextPushTimer: ReturnType<typeof setTimeout> | null = null;
let _contextPushInFlight = false;
let contextPushDone: Promise<void> | null = null;
let contextPushRevision = 0;
let contextPushQueued = false;
let _blockedContextPushIdentity = '';
let agentAccessMigrationDirty = new WeakSet<object>();
let unclaimedAgentAccessSource = new WeakSet<object>();

function cancelPendingContextPush() {
  if (_contextPushTimer != null) {
    clearTimeout(_contextPushTimer);
    _contextPushTimer = null;
  }
}

interface SyncMessengerDeps {
  getSyncRelay: typeof _getSyncRelay;
  getAppOwner: typeof _getAppOwner;
  debug: typeof _debug;
  buildLabContext: typeof _buildLabContext;
  buildWearableSeriesSection: typeof _buildWearableSeriesSection;
  getAgentWearableSeriesDays: typeof _getAgentWearableSeriesDays;
  getProfiles: typeof _getProfiles;
}

export function configureSyncMessenger({
  getSyncRelay,
  getAppOwner,
  debug,
  buildLabContext,
  buildWearableSeriesSection,
  getAgentWearableSeriesDays,
  getProfiles,
}: Partial<SyncMessengerDeps> = {}) {
  if (typeof getSyncRelay === 'function') _getSyncRelay = getSyncRelay;
  if (typeof getAppOwner === 'function') _getAppOwner = getAppOwner;
  if (typeof debug === 'function') _debug = debug;
  if (typeof buildLabContext === 'function') _buildLabContext = buildLabContext;
  if (typeof buildWearableSeriesSection === 'function') _buildWearableSeriesSection = buildWearableSeriesSection;
  if (typeof getAgentWearableSeriesDays === 'function') _getAgentWearableSeriesDays = getAgentWearableSeriesDays;
  if (typeof getProfiles === 'function') _getProfiles = getProfiles;
}

// Separate from the existing configuration object: its getter order and
// synchronous injected-provider contract remain unchanged.
export function configureSyncMessengerContextPreparation(prepare: ContextPreparation | null) {
  const previous = _prepareContext;
  _prepareContext = typeof prepare === 'function' ? prepare : null;
  return previous;
}

function currentSyncRelay() {
  try { return _getSyncRelay?.() || 'wss://sync.getbased.health'; } catch { return 'wss://sync.getbased.health'; }
}

function currentAppOwner() {
  try { return _getAppOwner?.() || null; } catch { return null; }
}

function dbg(...args: unknown[]) {
  try { _debug(...args); } catch {}
}

function buildLabContext(options?: LabContextOptions) {
  return options === undefined ? _buildLabContext() : _buildLabContext(options);
}

function buildWearableSeriesSection(days: number, options?: Parameters<typeof buildWearableSeries>[1]) {
  return options === undefined
    ? _buildWearableSeriesSection(days)
    : _buildWearableSeriesSection(days, options);
}

function getAgentWearableSeriesDays() {
  return _getAgentWearableSeriesDays();
}

function nowTs() { return Date.now(); }

function currentAgentAccess() {
  if (!state.importedData) ((state as { importedData: AgentAccessProfile | null })).importedData = { entries: [] };
  const imported = (state.importedData as AgentAccessProfile);
  const aa = imported.agentAccess;
  return (aa && typeof aa === 'object') ? aa as AgentAccessRecord : null;
}

function writeAgentAccess(patch: Partial<AgentAccessRecord>) {
  const prev = currentAgentAccess() || {};
  const next = {
    version: AGENT_ACCESS_SYNC_VERSION,
    ...prev,
    ...patch,
    updatedAt: nowTs(),
  };
  if (!state.importedData) ((state as { importedData: AgentAccessProfile | null })).importedData = { entries: [] };
  ((state.importedData as AgentAccessProfile)).agentAccess = next;
  return next;
}

function agentAccessProfileId() {
  return state.currentProfile || (typeof localStorage !== 'undefined' && localStorage.getItem('labcharts-active-profile')) || 'default';
}

function legacySourceBelongsToCurrentProfile() {
  try {
    const owner = localStorage.getItem(AGENT_ACCESS_MIGRATION_PROFILE_KEY);
    return !owner || owner === agentAccessProfileId();
  } catch { return false; }
}

function hasBoundLegacyAgentAccessSource() {
  try { return localStorage.getItem(AGENT_ACCESS_MIGRATION_PROFILE_KEY) === agentAccessProfileId(); }
  catch { return false; }
}

function claimLegacyAgentAccessSource() {
  try {
    if (!legacySourceBelongsToCurrentProfile()) return false;
    const profileId = agentAccessProfileId();
    localStorage.setItem(AGENT_ACCESS_MIGRATION_PROFILE_KEY, profileId);
    return localStorage.getItem(AGENT_ACCESS_MIGRATION_PROFILE_KEY) === profileId;
  } catch {
    dbg('Agent Access legacy source could not be bound to its profile; migration remains retryable');
    return false;
  }
}

function legacyLocalEnabled() {
  try { return localStorage.getItem(MESSENGER_ENABLED_KEY) === 'true'; } catch { return false; }
}

function legacyLocalToken() {
  try { return localStorage.getItem(MESSENGER_TOKEN_KEY) || null; } catch { return null; }
}

function legacyLocalContextKey() {
  try { return localStorage.getItem(MESSENGER_CONTEXT_KEY_KEY) || null; } catch { return null; }
}

const AGENT_SERIES_DAYS = [0, 7, 30, 90];

function normalizeAgentSeriesDays(days: unknown) {
  const n = Number(days) || 0;
  return AGENT_SERIES_DAYS.includes(n) ? n : 0;
}

function currentAgentWearableSeriesDays(aa: AgentAccessRecord | null = currentAgentAccess()) {
  if (!state.importedData) ((state as { importedData: AgentAccessProfile | null })).importedData = { entries: [] };
  const imported = (state.importedData as AgentAccessProfile);
  if (typeof imported.agentAccessWearableSeriesDays === 'number') {
    return normalizeAgentSeriesDays(imported.agentAccessWearableSeriesDays);
  }
  if (typeof aa?.wearableSeriesDays === 'number') return normalizeAgentSeriesDays(aa.wearableSeriesDays);
  // In this sync-layer API, 0 means "no synced series preference". Explicit
  // migration/refresh paths promote legacy localStorage before callers that need
  // migrated Agent Access state read this value. The public lab-context getter
  // uses null internally so it can still fall through to the legacy key before
  // migration.
  return 0;
}

let _lastAgentAccessMigrationSignature: string | null = null;

export function _resetAgentAccessMigrationStateForTesting() {
  _lastAgentAccessMigrationSignature = null;
  agentAccessMigrationDirty = new WeakSet<object>();
  unclaimedAgentAccessSource = new WeakSet<object>();
  _contextPushInFlight = false;
  _blockedContextPushIdentity = '';
}

export function isAgentAccessMigrationDirty() {
  return agentAccessMigrationDirty.has(state.importedData);
}

export function clearAgentAccessMigrationDirty() {
  agentAccessMigrationDirty.delete(state.importedData);
}

export function clearLegacyAgentAccessSecrets() {
  try {
    if (retireAgentAccessLegacySource(agentAccessProfileId())) unclaimedAgentAccessSource.delete(state.importedData);
  } catch {}
}

function agentAccessMigrationSignature(existing: AgentAccessRecord | null, enabled: boolean, token: string | null, legacyContextKey: string | null) {
  const pid = agentAccessProfileId();
  // Deliberately exclude importedData.agentAccessWearableSeriesDays: that split
  // preference scalar is mirrored by setAgentAccessWearableSeriesDays() and
  // refreshAgentAccessFromSyncedProfile(), so preference-only changes must not
  // invalidate the one-shot credential migration signature.
  return [
    pid,
    existing?.updatedAt || '',
    existing?.enabled === true ? '1' : '0',
    existing?.token || '',
    existing?.contextKey || '',
    existing?.revokedAt || '',
    enabled ? '1' : '0',
    token || '',
    legacyContextKey || '',
  ].join('|');
}

export function migrateLocalAgentAccessToProfile() {
  const existing = currentAgentAccess();
  if (!legacySourceBelongsToCurrentProfile()) return existing;
  // A reload may already contain the committed record, but the source can only
  // be retired after confirming persistence, never from a presentation refresh.
  if (existing && hasBoundLegacyAgentAccessSource()) agentAccessMigrationDirty.add(state.importedData);
  const enabled = legacyLocalEnabled();
  const token = legacyLocalToken();
  const legacyContextKey = legacyLocalContextKey();
  const signature = agentAccessMigrationSignature(existing, enabled, token, legacyContextKey);
  if (signature === _lastAgentAccessMigrationSignature) return existing || null;
  const contextKey = legacyContextKey || existing?.contextKey || (enabled && token ? generateAgentContextKeyValue() : null);
  // A synced revoke is an explicit cross-device credential tombstone. Mirror it
  // down to this origin and never let stale legacy localStorage resurrect the
  // token/context key after another device disabled Agent Access.
  // A legacy localStorage toggle is an explicit browser-local state only until
  // the first migration. After sync has any Agent Access credential or revoke
  // tombstone, the synced profile is authoritative: stale localStorage is only
  // repaired from sync, never written back over a newer token/key/revoke.
  const hasSyncedAgentAccess = !!(existing?.token || existing?.contextKey || existing?.enabled === true || existing?.revokedAt);
  if (hasSyncedAgentAccess) {
    if (existing?.revokedAt && existing.enabled !== true) {
      mirrorAgentAccessToLegacyLocalStorage(existing);
      _lastAgentAccessMigrationSignature = signature;
      return existing;
    }
    if (!(enabled && token)) {
      mirrorAgentAccessToLegacyLocalStorage(existing);
      _lastAgentAccessMigrationSignature = signature;
      return existing;
    }
    const tokenChanged = !!(existing!.token && token && token !== existing!.token);
    const contextKeyChanged = !!(existing!.contextKey && legacyContextKey && legacyContextKey !== existing!.contextKey);
    if (tokenChanged || contextKeyChanged) {
      mirrorAgentAccessToLegacyLocalStorage(existing);
      _lastAgentAccessMigrationSignature = signature;
      return existing;
    }
    // Matching legacy credentials are just a mirror of the synced profile. Do
    // not rewrite the credential scalar from localStorage, because that can
    // recompute preference fields from stale/missing legacy keys on read.
    _lastAgentAccessMigrationSignature = signature;
    return existing;
  }
  const seriesDays = (() => {
    try {
      const pid = state.currentProfile || localStorage.getItem('labcharts-active-profile') || 'default';
      const raw = localStorage.getItem(`labcharts-${pid}-agent-wearable-series`)
        || localStorage.getItem('labcharts-agent-wearable-series-days');
      if (raw === 'on') return 30;
      if (raw === 'off' || raw == null) return 0;
      const n = Number(raw);
      return [0, 7, 30, 90].includes(n) ? n : 0;
    } catch { return 0; }
  })();
  if (!enabled && !token && !contextKey) {
    _lastAgentAccessMigrationSignature = signature;
    return null;
  }
  if (!state.importedData) ((state as { importedData: AgentAccessProfile | null })).importedData = { entries: [] };
  if (!claimLegacyAgentAccessSource()) {
    unclaimedAgentAccessSource.add(state.importedData);
    return existing;
  }
  unclaimedAgentAccessSource.delete(state.importedData);
  ((state.importedData as AgentAccessProfile)).agentAccessWearableSeriesDays = seriesDays;
  const migrated = writeAgentAccess({
    enabled: !!(enabled && token && contextKey),
    token: token || null,
    contextKey: contextKey || null,
    migratedFromLocalStorageAt: nowTs(),
  });
  agentAccessMigrationDirty.add(state.importedData);
  _lastAgentAccessMigrationSignature = agentAccessMigrationSignature(migrated, enabled, token, legacyContextKey);
  return migrated;
}

function mirrorAgentAccessToLegacyLocalStorage(aa: AgentAccessRecord | null = currentAgentAccess()) {
  if (!aa || typeof localStorage === 'undefined') return;
  try {
    // Keep an existing source intact until the migrated profile is durably
    // saved. Another profile must neither consume nor retire that source.
    if (isAgentAccessMigrationDirty() || hasBoundLegacyAgentAccessSource() || unclaimedAgentAccessSource.has(state.importedData)) return;
    if (legacySourceBelongsToCurrentProfile()) {
      localStorage.setItem(MESSENGER_ENABLED_KEY, aa.enabled ? 'true' : 'false');
      clearLegacyAgentAccessSecrets();
    }
    // Never write bearer/decryption secrets back into localStorage. This mirror
    // contains only the toggle and series preference after source retirement.
    const split = (state.importedData as AgentAccessProfile | null)?.agentAccessWearableSeriesDays;
    // A read API's 0 can mean "no synced preference". Only mirror an actual
    // saved choice; otherwise keep the profile's legacy local window intact.
    const wearableSeriesDays = typeof split === 'number' ? normalizeAgentSeriesDays(split)
      : typeof aa.wearableSeriesDays === 'number' ? normalizeAgentSeriesDays(aa.wearableSeriesDays) : null;
    if (typeof wearableSeriesDays === 'number') {
      const pid = state.currentProfile || localStorage.getItem('labcharts-active-profile') || 'default';
      localStorage.setItem(`labcharts-${pid}-agent-wearable-series`, wearableSeriesDays > 0 ? String(wearableSeriesDays) : 'off');
    }
  } catch {}
}

export function getAgentAccessState() {
  const aa = currentAgentAccess() || {
    version: AGENT_ACCESS_SYNC_VERSION,
    enabled: false,
    token: null,
    contextKey: null,
    wearableSeriesDays: 0,
  };
  return { ...aa, wearableSeriesDays: currentAgentWearableSeriesDays(aa) };
}

export function setAgentAccessWearableSeriesDays(days: unknown) {
  const raw = Number(days) || 0;
  if (!AGENT_SERIES_DAYS.includes(raw)) return null;
  const n = normalizeAgentSeriesDays(raw);
  const aa = currentAgentAccess() || (migrateLocalAgentAccessToProfile(), currentAgentAccess());
  if (!state.importedData) ((state as { importedData: AgentAccessProfile | null })).importedData = { entries: [] };
  ((state.importedData as AgentAccessProfile)).agentAccessWearableSeriesDays = n;
  mirrorAgentAccessToLegacyLocalStorage(aa || { enabled: false, token: null, contextKey: null, wearableSeriesDays: n });
  return n;
}

export function refreshAgentAccessFromSyncedProfile({ migrateLegacy = true, clearWhenMissing = false } = {}) {
  const migrated = migrateLegacy ? migrateLocalAgentAccessToProfile() : null;
  const aa = migrated || currentAgentAccess();
  if (!aa) {
    const fallbackSeriesDays = clearWhenMissing ? 0 : currentAgentWearableSeriesDays(null);
    if (clearWhenMissing && state.importedData) {
      ((state.importedData as AgentAccessProfile)).agentAccessWearableSeriesDays = fallbackSeriesDays;
    }
    const fallback = {
      version: AGENT_ACCESS_SYNC_VERSION,
      enabled: false,
      token: null,
      contextKey: null,
      wearableSeriesDays: fallbackSeriesDays,
    };
    if (clearWhenMissing) mirrorAgentAccessToLegacyLocalStorage(fallback);
    return fallback;
  }
  const withSeries = { ...aa, wearableSeriesDays: currentAgentWearableSeriesDays(aa) };
  mirrorAgentAccessToLegacyLocalStorage(aa);
  return withSeries;
}

bindSyncAppliedRefresh(() => { refreshAgentAccessFromSyncedProfile({ migrateLegacy: true }); });
addUtilsRuntimeListener('labcharts-profile-switched', () => {
  refreshAgentAccessFromSyncedProfile({ migrateLegacy: false, clearWhenMissing: true });
});

export function isMessengerEnabled() {
  const aa = getAgentAccessState();
  return !!(aa.enabled && aa.token && aa.contextKey);
}

export function getMessengerToken() {
  const aa = getAgentAccessState();
  return aa.token || null;
}

export function getMessengerContextKey() {
  const aa = getAgentAccessState();
  return aa.contextKey || null;
}

export function hasMessengerSyncIdentity() {
  const owner = currentAppOwner();
  return !!(ownerIdString(owner) && ownerWriteKeyBytes(owner));
}

export function ensureMessengerContextKey() {
  const existing = getMessengerContextKey();
  if (existing) return existing;
  const key = generateAgentContextKeyValue();
  const aa = writeAgentAccess({ contextKey: key });
  mirrorAgentAccessToLegacyLocalStorage(aa);
  return key;
}

export function generateMessengerContextKey() {
  const current = getAgentAccessState();
  const key = generateAgentContextKeyValue();
  const aa = writeAgentAccess({ contextKey: key, enabled: current.enabled === true });
  mirrorAgentAccessToLegacyLocalStorage(aa);
  return key;
}

/** An opaque operation scope retains signing material inside the service. */
export interface AgentAccessOperationScope { isCurrent(): boolean }
interface AgentAccessOperationOrigin {
  owner: MessengerOwner | null; profileId: string; relay: string;
}
const operationOrigins = new WeakMap<AgentAccessOperationScope, AgentAccessOperationOrigin>();
export function captureAgentAccessOperationScope(profileOverride?: string): AgentAccessOperationScope {
  const activeProfile = state.currentProfile;
  const profileId = profileOverride || activeProfile || (typeof localStorage !== 'undefined' && localStorage.getItem('labcharts-active-profile')) || 'default';
  const data = state.importedData;
  const current = currentAppOwner();
  const ownerId = ownerIdString(current);
  const writeKey = ownerWriteKeyBytes(current)?.slice() || null;
  const relay = currentSyncRelay();
  const scope = { isCurrent() {
    const latest = currentAppOwner();
    const latestKey = ownerWriteKeyBytes(latest);
    const sameKey = writeKey === null ? latestKey === null
      : latestKey?.length === writeKey.length && writeKey.every((byte, index) => latestKey[index] === byte);
    return state.currentProfile === activeProfile && state.importedData === data
      && ownerIdString(latest) === ownerId && sameKey && currentSyncRelay() === relay;
  } };
  operationOrigins.set(scope, { owner: ownerId && writeKey ? { id: ownerId, writeKey } : null,
    profileId, relay: relay.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://') });
  return Object.freeze(scope);
}

const REVOCATION_PREFIX = 'labcharts-agent-access-revocation-';
interface PendingRevocation { token: string; ownerId: string; profileId: string; relay: string }
let revocationsInFlight: Promise<boolean> | null = null;

export async function queueMessengerRevocation(token: string | null | undefined, scope?: AgentAccessOperationScope) {
  if (!token) return;
  const origin = operationOrigins.get(scope || captureAgentAccessOperationScope());
  if (!origin) throw new Error('Agent Access operation scope is invalid');
  const ownerId = ownerIdString(origin.owner);
  if (!ownerId) throw new Error('Connect your Sync identity to withdraw the published Agent Access snapshot.');
  const record: PendingRevocation = { token, ownerId, profileId: origin.profileId, relay: origin.relay };
  const key = REVOCATION_PREFIX + await sha256Hex(token);
  const { encryptedSetCredentialItem } = await import('./crypto.js');
  await encryptedSetCredentialItem(key, JSON.stringify(record));
  return key;
}

async function sendQueuedRevocations() {
  await contextPushDone;
  const keys = Object.keys(localStorage).filter(key => key.startsWith(REVOCATION_PREFIX));
  if (!keys.length) return true;
  const { encryptedGetItem, encryptedRemoveItem } = await import('./crypto.js');
  const owner = currentAppOwner();
  const relay = currentSyncRelay().replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
  const results = await Promise.all(keys.map(async key => {
    try {
      const raw = await encryptedGetItem(key, { throwOnDecryptError: true });
      if (!raw) return false;
      const record = JSON.parse(raw) as PendingRevocation;
      const { token, profileId } = record;
      if (record.ownerId !== ownerIdString(owner) || record.relay !== relay
        || typeof profileId !== 'string' || typeof token !== 'string'
        || key !== REVOCATION_PREFIX + await sha256Hex(token)) return false;
      // A failed local mutation can leave its prepared revocation. Recheck
      // persisted profile state before withdrawing a credential still in use.
      const persisted = await encryptedGetItem(profileStorageKey(profileId, 'imported'), { throwOnDecryptError: true });
      if (persisted && JSON.parse(persisted)?.agentAccess?.token === token) return false;
      const timestamp = Date.now();
      const proof = await signAgentContextRequest({ owner, token, profileId, relayContext: '', timestamp });
      const response = await fetch(`${relay}/api/context`, {
        method: 'DELETE', signal: AbortSignal.timeout(10_000), redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId: proof.ownerId, profileId, context: '', timestamp, signature: proof.signature }),
      });
      if (!response.ok && response.status !== 404 && response.status !== 410) return false;
      await encryptedRemoveItem(key);
      return localStorage.getItem(key) === null;
    } catch { return false; }
  }));
  return results.every(Boolean);
}

export function flushQueuedMessengerRevocations() {
  if (!revocationsInFlight) {
    revocationsInFlight = sendQueuedRevocations().catch(() => false).finally(() => { revocationsInFlight = null; });
  }
  return revocationsInFlight;
}

export async function revokeMessengerTokenRemote(token: string | null | undefined, scope?: AgentAccessOperationScope) {
  await queueMessengerRevocation(token, scope);
  return flushQueuedMessengerRevocations();
}

export function generateMessengerToken() {
  migrateLocalAgentAccessToProfile();
  const previousToken = getMessengerToken();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const contextKey = getMessengerContextKey() || generateAgentContextKeyValue();
  const aa = writeAgentAccess({
    enabled: true,
    token,
    contextKey,
    credentialCreatedAt: nowTs(),
    revokedAt: null,
  });
  mirrorAgentAccessToLegacyLocalStorage(aa);
  return { token, previousToken };
}

export function disableMessengerTokenLocal() {
  cancelPendingContextPush();
  contextPushRevision++;
  const previousToken = getMessengerToken();
  const aa = writeAgentAccess({
    enabled: false,
    token: null,
    contextKey: null,
    revokedAt: nowTs(),
  });
  mirrorAgentAccessToLegacyLocalStorage(aa);
  return previousToken;
}

export function revokeMessengerToken() {
  const token = disableMessengerTokenLocal();
  void revokeMessengerTokenRemote(token).catch(() => {});
}

addUtilsRuntimeListener('online', () => { void flushQueuedMessengerRevocations(); });

export function pushContextToGateway() {
  cancelPendingContextPush();
  void flushQueuedMessengerRevocations();
  migrateLocalAgentAccessToProfile();
  if (!isMessengerEnabled()) return;
  const token = getMessengerToken();
  if (!token) return;
  const pushIdentity = `${ownerIdString(currentAppOwner()) || ''}:${token}`;
  if (_blockedContextPushIdentity === pushIdentity) {
    dbg('Skipped Agent Access context push until its token is regenerated for this Sync identity');
    return;
  }
  const contextKey = ensureMessengerContextKey();
  const profileId = state.currentProfile || 'default';
  const scope = captureAgentAccessOperationScope();
  const origin = operationOrigins.get(scope)!;
  // Demo profiles are intentionally local-only. Agent Access uses a separate
  // relay endpoint, so the Evolu push guard alone is not sufficient.
  if (isDemoProfileId(profileId, _getProfiles())) return;
  const revision = ++contextPushRevision;

  _contextPushTimer = setTimeout(async () => {
    _contextPushTimer = null;
    if (_blockedContextPushIdentity === pushIdentity) return;
    if (_contextPushInFlight) { contextPushQueued = true; return; }
    _contextPushInFlight = true;
    let finish!: () => void;
    contextPushDone = new Promise<void>(resolve => { finish = resolve; });
    try {
      const latest = getAgentAccessState();
      if (!scope.isCurrent() || state.currentProfile !== profileId
        || latest.enabled !== true
        || latest.token !== token
        || latest.contextKey !== contextKey) {
        dbg(`Skipped stale Agent Access context push (profile: ${profileId})`);
        return;
      }
      const configured = {
        getSyncRelay: _getSyncRelay, getAppOwner: _getAppOwner, debug: _debug,
        buildLabContext: _buildLabContext, prepareContext: _prepareContext,
        buildWearableSeriesSection: _buildWearableSeriesSection,
        getAgentWearableSeriesDays: _getAgentWearableSeriesDays, getProfiles: _getProfiles,
      };
      const sourceSettings = JSON.stringify(state.importedData.contextSourceSettings || {});
      const originalSeriesDays = getAgentWearableSeriesDays();
      const preparationOwnerCurrent = () => {
        const access = getAgentAccessState();
        return scope.isCurrent() && state.currentProfile === profileId
          && access.enabled === true && access.token === token && access.contextKey === contextKey
          && _blockedContextPushIdentity !== pushIdentity && contextPushRevision === revision
          && JSON.stringify(state.importedData.contextSourceSettings || {}) === sourceSettings
          && getAgentWearableSeriesDays() === originalSeriesDays
          && configured.getSyncRelay === _getSyncRelay && configured.getAppOwner === _getAppOwner
          && configured.debug === _debug && configured.buildLabContext === _buildLabContext
          && configured.prepareContext === _prepareContext
          && configured.buildWearableSeriesSection === _buildWearableSeriesSection
          && configured.getAgentWearableSeriesDays === _getAgentWearableSeriesDays
          && configured.getProfiles === _getProfiles;
      };
      const preparationCurrent = () => {
        if (!preparationOwnerCurrent()) return false;
        const demo = isDemoProfileId(profileId, _getProfiles());
        // Profile/tag callbacks can replace ownership while being read.
        return !demo && preparationOwnerCurrent();
      };
      let preparedBuild: ((options?: LabContextOptions) => string) | null = null;
      if (_buildLabContext === buildDefaultSyncMessengerContext && configured.prepareContext) {
        if (!origin.owner) return;
        preparedBuild = await configured.prepareContext();
        if (!preparationCurrent()) {
          dbg(`Skipped stale Agent Access context after preparation (profile: ${profileId})`);
          return;
        }
      }
      // Manage Context remains the source-level gate for both in-app chat and
      // external Agent Access. Enabling Agent Access is transport consent; it
      // does not silently re-enable profile sources the user turned off.
      const baseContext = preparedBuild ? preparedBuild() : buildLabContext();
      // Optional wearable daily-series section - user picks 0 (off) / 7 /
      // 30 / 90 days in Settings -> Agent Access. It also respects the
      // Wearables source toggle and reads L1 IDB on the
      // browser. Before anything touches the relay, encrypt the rendered
      // context locally with a dedicated Agent Context key. The Agent Access
      // token authorizes relay fetches; it is not AES key material.
      // Append AFTER the rest so the section parser treats it as a sibling.
      const seriesDays = getAgentWearableSeriesDays();
      const seriesBlock = seriesDays > 0
        ? await buildWearableSeriesSection(seriesDays).catch(() => '')
        : '';
      if (!preparationCurrent()) {
        dbg(`Skipped stale Agent Access context after preparation (profile: ${profileId})`);
        return;
      }
      const context = seriesBlock ? `${baseContext}\n${seriesBlock}\n` : baseContext;
      const encryptedContext = await encryptAgentContextForRelay(context, contextKey, profileId);
      // The gateway only needs the active profileId - do not leak the full
      // profile-name list. Profile names can include real names; keep them
      // out of the relay envelope entirely.
      const relay = origin.relay;

      const relayContext = JSON.stringify({ encryptedContext });
      const timestamp = Date.now();
      const ownerProof = await signAgentContextRequest({
        owner: origin.owner,
        token,
        profileId,
        relayContext,
        timestamp,
      });
      const latestBeforeSend = getAgentAccessState();
      if (!preparationCurrent() || !scope.isCurrent() || latestBeforeSend.enabled !== true
        || latestBeforeSend.token !== token || latestBeforeSend.contextKey !== contextKey) {
        dbg(`Skipped stale Agent Access context after preparation (profile: ${profileId})`);
        return;
      }
      const res = await fetch(`${relay}/api/context`, {
        method: 'POST',
        signal: AbortSignal.timeout(15_000), redirect: 'error',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId,
          context: relayContext,
          ownerId: ownerProof.ownerId,
          timestamp,
          signature: ownerProof.signature,
        }),
      });
      if (!res.ok) {
        let body = '';
        try {
          body = await res.text();
        } catch {}
        if (res.status === 409 && /"error"\s*:\s*"token_owner_mismatch"/.test(body)) {
          _blockedContextPushIdentity = pushIdentity;
          console.warn('[sync] Agent Access token belongs to another Sync identity. Regenerate it in Settings → Data → Agent Access.');
          return;
        }
        const detail = body ? `: ${body.slice(0, 240)}` : '';
        throw new Error(`Gateway returned ${res.status}${detail}`);
      }
      dbg(`Encrypted context pushed to gateway (profile: ${profileId}, series: ${seriesBlock ? 'yes' : 'no'})`);
    } catch (e) {
      console.warn('[sync] Context push failed:', e);
    } finally {
      _contextPushInFlight = false;
      contextPushDone = null;
      finish();
      if (contextPushQueued) { contextPushQueued = false; pushContextToGateway(); }
    }
  }, 5000); // 5s debounce - less urgent than sync
}
