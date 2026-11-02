import {afterEach, expect, it, vi} from 'vitest';
import {state} from '../js/state.js';
import {configureSyncReconcile, reconcileLocalStorageWithEvolu} from '../js/sync-reconcile.js';
import {configureSyncPush, pushProfile} from '../js/sync-push.js';
import {configureSyncDelta} from '../js/sync-delta.js';
import {parseSyncPayload} from '../js/sync-payload.js';
import {localHasRowsRemoteLacks} from '../js/data-merge.js';
import {chatDataNeedsRebroadcast} from '../js/sync-chat-apply.js';
import {collectAISettings} from '../js/sync-payload-collectors.js';
import {getProfileSyncBlockReason} from '../js/profile-sync-policy.js';
import {isRestoreJoinPending} from '../js/sync-identity.js';
import type {SyncProfileRow} from '../js/sync-payload.js';
import type {DeltaItemRow} from '../js/sync-delta-row-codec.js';
import {makeEvolu, PROFILE_QUERY, ITEM_ROW_QUERY} from './helpers/sync-runtime-fixture.js';

afterEach(() => {vi.clearAllTimers(); vi.useRealTimers(); localStorage.clear(); sessionStorage.clear();});
it('repeated startup reconciliation does not append an equivalent profile, but sends real edits and explicit resends', async () => {
  vi.useFakeTimers(); localStorage.clear(); sessionStorage.clear();
  const previousProfile = state.currentProfile, previousData = state.importedData;
  const id = 'startup-equivalent-profile';
  const fixture = makeEvolu();
  const profiles = [{id}];
  const deps = {getEvolu: () => fixture.evolu, getProfileQuery: () => PROFILE_QUERY, isSyncEnabled: () => true, getProfiles: () => profiles};
  configureSyncDelta({getEvolu: () => fixture.evolu, getItemRowQuery: () => ITEM_ROW_QUERY});
  configureSyncPush({...deps, isPhase2CutoverEnabled: () => false});
  configureSyncReconcile({...deps, getEvolu: () => ({
    getQueryRows: <Row extends SyncProfileRow | DeltaItemRow = SyncProfileRow>(query: unknown) => fixture.evolu.getQueryRows(query) as unknown as readonly Row[],
  }), pushProfile});
  state.currentProfile = id;
  (state as {importedData: unknown}).importedData = {entries: [], customMarkers: {'custom.synthetic': {name: 'Synthetic marker', unit: 'u', group: null}}};
  const writes = () => fixture.calls.insert.length + fixture.calls.update.length;
  try {
    expect(await pushProfile(id, state.importedData)).toMatchObject({ok: true});
    const row = fixture.profileRows[0]!;
    const parsed = await parseSyncPayload(row.dataJson);
    const imported = parsed.importedData as typeof state.importedData;
    const marker = imported!.customMarkers!['custom.synthetic']!;
    // A peer can serialize identical custom-marker fields in another order.
    imported!.customMarkers!['custom.synthetic'] = Object.fromEntries(Object.entries(marker).reverse()) as typeof marker;
    row.dataJson = JSON.stringify({_v: 3, ...parsed});
    expect(row.profileId).toBe(id);
    expect(await chatDataNeedsRebroadcast(id, parsed.chatData)).toBe(false);
    expect(await collectAISettings()).toEqual({});
    expect(localHasRowsRemoteLacks(state.importedData, imported)).toBe(true);
    expect(getProfileSyncBlockReason(id, profiles)).toBe(''); expect(isRestoreJoinPending()).toBe(false);
    expect(await parseSyncPayload(row.dataJson)).toEqual(parsed);
    const before = writes();
    for (let reload = 0; reload < 3; reload++) await reconcileLocalStorageWithEvolu();
    expect(writes()).toBe(before);
    state.importedData!.customMarkers!['custom.synthetic']!.name = 'Actual local edit';
    await reconcileLocalStorageWithEvolu();
    expect(writes()).toBeGreaterThan(before);
    const committed = writes();
    expect(await pushProfile(id, state.importedData, {force: true})).toMatchObject({ok: true});
    expect(writes()).toBeGreaterThan(committed);
  } finally {state.currentProfile = previousProfile; state.importedData = previousData;}
});
