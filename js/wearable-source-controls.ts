// Bounded metadata discovery and exact native refresh handoffs. No sync or credential disclosure.
import { state } from './state.js';
import { isActiveProfileDataOwner } from './profile.js';
import { isContextSourceEnabled } from './context-source-registry.js';
import { getContextDisclosureFingerprint } from './lab-context-settings.js';
import { adapterById, isOAuthAdapterConfigured, isWearableRelayUnavailable } from './wearable-adapters.js';
import { hasLocalWearableCredential, usesWearableCredentialVault } from './wearables-credential-vault.js';
import type { AppNavigationRequest } from '../shared/app-navigation-contract.js';
import type { AppNavigationReceipt } from './app-navigation-runtime.js';
interface Owner { profile: string; thread: string; root: typeof state.importedData; history: typeof state.chatHistory; disclosure: string }
interface Lease extends Owner { versions: Map<string, string>; active: () => boolean; used?: boolean }
const leases = new Map<string, Lease>();
const owned = (owner: Owner) => state.currentProfile === owner.profile && state.currentThreadId === owner.thread
  && state.importedData === owner.root && state.chatHistory === owner.history && isActiveProfileDataOwner(owner.profile, owner.root)
  && isContextSourceEnabled('wearables') && getContextDisclosureFingerprint() === owner.disclosure;
function configuredSources() {
  if (!isContextSourceEnabled('wearables')) return [];
  const stamp = (value: unknown) => { const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) ? Date.parse(value) : NaN; return Number.isFinite(number) && number > 0 && number <= 8640000000000000 ? new Date(number).toISOString() : null; };
  return Object.entries(state.importedData.wearableConnections || {}).flatMap(([id, raw]) => {
    const adapter = adapterById(id); if (!adapter || !raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const connection = raw as Record<string, unknown>; if (!stamp(connection.connectedAt)) return [];
    const credentials = !!(connection.accessToken || connection.refreshToken) || usesWearableCredentialVault(id)
      && !!connection.hasStoredCredentials && hasLocalWearableCredential(state.currentProfile, id, connection.credentialGeneration);
    const unavailable = !!adapter.legacyMigrationOnly || isWearableRelayUnavailable(adapter) || !!adapter.hostConfiguredOnly && !isOAuthAdapterConfigured(adapter);
    const refreshAvailable = !unavailable && !connection.needsReauth && credentials && ['pat', 'oauth2'].includes(adapter.authType);
    return [{ id, name: adapter.displayName, kind: adapter.authType,
      status: unavailable ? 'unavailable' : connection.needsReauth ? 'needs_reauthentication' : refreshAvailable ? 'configured' : 'native_action_required',
      lastSuccessfulSyncAt: stamp(connection.lastSyncAt), refreshAvailable }];
  });
}
export function readConfiguredWearableSources(profile: string, options: { query?: string; offset?: number; limit?: number } = {}, active: () => boolean = () => true) {
  const owner = { profile, thread: state.currentThreadId || '', root: state.importedData, history: state.chatHistory, disclosure: getContextDisclosureFingerprint() };
  if (!active() || !owner.thread || !isActiveProfileDataOwner(profile, owner.root) || state.currentProfile !== profile) throw new Error('The source profile or conversation changed.');
  if (!isContextSourceEnabled('wearables')) return { action: 'wearables.sources', status: 'unavailable', reason: 'Wearable context is disabled. Use native Settings without enabling access through chat.', dataSaved: false };
  const matching = configuredSources().filter(item => !options.query || (item.id + ' ' + item.name).toLowerCase().includes(options.query.toLowerCase()));
  const offset = options.offset ?? 0, limit = options.limit ?? 25, sources = matching.slice(offset, offset + limit), snapshotId = crypto.randomUUID();
  const versions = new Map(sources.filter(item => item.refreshAvailable).map(item => [item.id, JSON.stringify(owner.root.wearableConnections?.[item.id])]));
  if (leases.size >= 100) leases.delete(leases.keys().next().value!); leases.set(snapshotId, { ...owner, versions, active });
  return { action: 'wearables.sources', status: 'read_only', snapshotId, sources, nextOffset: offset + limit < matching.length ? offset + limit : null,
    dataSaved: false, settingsSaved: false, notice: 'Last successful sync is recorded metadata, not live verification. Navigate wearablesSettings with exact refreshAvailable recordId and this snapshotId; the human starts native Update now and sees its actual result. Setup, reconnection and bulk backfill stay native.' };
}
export async function openConfiguredWearableRefresh(request: AppNavigationRequest, canOpen: () => boolean, ownerCurrent = canOpen): Promise<AppNavigationReceipt> {
  const lease = request.snapshotId ? leases.get(request.snapshotId) : undefined, id = request.recordId;
  const rejected = (reason: string): AppNavigationReceipt => ({ changed: false, opened: null, settingsSaved: false, dataSaved: false, reason });
  const valid = () => !!lease && !lease.used && lease.active() && !!id && owned(lease) && lease.versions.has(id)
    && lease.versions.get(id) === JSON.stringify(lease.root.wearableConnections?.[id]) && configuredSources().some(item => item.id === id && item.refreshAvailable);
  if (!canOpen() || !valid()) return rejected('This source refresh snapshot expired or is unavailable. Read wearables.sources again.');
  const [{ getSettingsModuleFunction }, runtime] = await Promise.all([import('./settings-runtime-bridge.js'), import('./wearables-runtime.js')]);
  await runtime.loadWearablesModule();
  const open = getSettingsModuleFunction('openSettingsForOwner'); if (!open || !canOpen() || !valid()) return rejected('Native Wearables settings are unavailable.');
  await open('wearables', () => canOpen() && valid());
  if (!ownerCurrent() || !valid() || !document.querySelector('#settings-modal-overlay.show #settings-tab-wearables.active')) return rejected('The native source refresh handoff could not be confirmed. No refresh was started.');
  const { focusWearableRefreshControl } = await import('./wearables-settings-component.js');
  if (!ownerCurrent() || !valid() || !focusWearableRefreshControl(id!)) return rejected('The native Update now control is unavailable. No refresh was started.');
  lease!.used = true;
  return { changed: true, opened: 'wearablesSettings', settingsSaved: false, dataSaved: false, requiresUserAction: true, status: 'pending_user_confirmation', saved: false,
    nextAction: 'Choose Update now for this source. Native progress and completion show the actual refresh outcome. No refresh has started.' };
}
