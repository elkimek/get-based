import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { updateKeyCache } from '../js/crypto.js';
import { _djb2 } from '../js/sync-delta-registry.js';
import { applyAISettings, applyDisplayPrefs } from '../js/sync-apply.js';
import {
  _applyArrayDelta,
  _planArrayDelta,
  _planKeyedMapDelta,
  _planScalarDelta,
  configureSyncDelta,
  getDeltaTelemetry,
  resetDeltaTelemetry,
} from '../js/sync-delta.js';
import {
  configureSyncDiagnosticsContext,
  currentDiagnosticAppOwner,
  currentDiagnosticEvolu,
  currentDiagnosticProfileQuery,
  currentDiagnosticPulling,
  currentDiagnosticSubscriptionFireCount,
  currentDiagnosticSyncEnabled,
  currentDiagnosticSyncing,
  currentDiagnosticTombstoneQuery,
} from '../js/sync-diagnostics-context.js';
import {
  clearSyncDisableStorage,
  isSyncDisableCleanupKey,
} from '../js/sync-disable-cleanup.js';
import { clearStaleSyncHashKeysOnce } from '../js/sync-pull-maintenance.js';
import { parseSyncPayload } from '../js/sync-payload.js';
import { maybeScheduleRebroadcast } from '../js/sync-pull-rebroadcast.js';
import { applyCommittedDeltas, planProfileDeltas } from '../js/sync-push-deltas.js';
import { configureSyncPush, isSyncPushInFlight, pushProfile } from '../js/sync-push.js';
import { getRecentSyncEvents, resetSyncStatus, updateSyncStatus } from '../js/sync-state.js';
import { state } from '../js/state.js';
import {
  _resetAgentAccessMigrationStateForTesting,
  clearAgentAccessMigrationDirty,
  clearLegacyAgentAccessSecrets,
  configureSyncMessenger,
  disableMessengerTokenLocal,
  generateMessengerToken,
  getAgentAccessState,
  getMessengerContextKey,
  getMessengerToken,
  isAgentAccessMigrationDirty,
  isMessengerEnabled,
  migrateLocalAgentAccessToProfile,
  pushContextToGateway,
  refreshAgentAccessFromSyncedProfile,
  revokeMessengerToken,
  setAgentAccessWearableSeriesDays,
} from '../js/sync-messenger.js';
import {
  getAgentWearableSeriesDays,
  setAgentWearableSeriesDays,
} from '../js/lab-context.js';

const PROFILE_ID = 'profile-runtime';
const PROFILE_QUERY = Symbol('profile-query');
const ITEM_ROW_QUERY = Symbol('item-row-query');

function deltaKey(profileId, arrayName) {
  return `labcharts-${profileId}-delta-${arrayName}`;
}

function writeSnapshot(profileId, arrayName, snapshot) {
  localStorage.setItem(deltaKey(profileId, arrayName), JSON.stringify(snapshot));
}

function makeEvolu({ profileRows = [], itemRows = [], completeProfileWrites = true, failItemRows = false } = {}) {
  const calls = { insert: [], update: [] };
  const evolu = {
    getQueryRows(query) {
      if (query === PROFILE_QUERY) return profileRows;
      if (query === ITEM_ROW_QUERY) return itemRows;
      return [];
    },
    insert(table, args, options = {}) {
      calls.insert.push({ table, args });
      if (table === 'profileData') {
        profileRows.push({ id: `profile-row-${profileRows.length + 1}`, ...args });
        if (completeProfileWrites) options.onComplete?.();
        return;
      }
      if (failItemRows) throw new Error('item insert failed');
      itemRows.push({ id: `item-row-${itemRows.length + 1}`, ...args });
    },
    update(table, args, options = {}) {
      calls.update.push({ table, args });
      if (table === 'profileData') {
        const idx = profileRows.findIndex(row => row.id === args.id);
        if (idx >= 0) {
          profileRows[idx] = { ...profileRows[idx], ...args };
          if (completeProfileWrites) options.onComplete?.();
        }
        return;
      }
      if (failItemRows) throw new Error('item update failed');
      const idx = itemRows.findIndex(row => row.id === args.id);
      if (idx >= 0) itemRows[idx] = { ...itemRows[idx], ...args };
      else itemRows.push({ ...args });
    },
  };
  return { evolu, calls, profileRows, itemRows };
}

function configureRuntimeDeps(fake) {
  configureSyncDelta({
    getEvolu: () => fake.evolu,
    getItemRowQuery: () => ITEM_ROW_QUERY,
  });
  configureSyncPush({
    getEvolu: () => fake.evolu,
    getProfileQuery: () => PROFILE_QUERY,
    isSyncEnabled: () => true,
    isPhase2CutoverEnabled: () => false,
    disablePhase2Cutover: vi.fn(),
    debug: vi.fn(),
  });
}

beforeEach(() => {
  _resetAgentAccessMigrationStateForTesting();
  localStorage.clear();
  sessionStorage.clear();
  updateKeyCache('labcharts-openrouter-key', '');
  updateKeyCache('labcharts-venice-key', '');
  updateKeyCache('labcharts-routstr-key', '');
  updateKeyCache('labcharts-ppq-key', '');
  updateKeyCache('labcharts-custom-key', '');
  updateKeyCache('labcharts-cashu-wallet-mnemonic', '');
  window.updateChatHeaderModel = vi.fn();
  window.refreshWebSearchToggle = vi.fn();
  state.currentProfile = PROFILE_ID;
  state.importedData = { entries: [], agentAccess: null };
  localStorage.setItem('labcharts-active-profile', PROFILE_ID);
  configureSyncMessenger({ getSyncRelay: () => 'wss://sync.getbased.health', getAppOwner: () => null, debug: vi.fn() });
  configureRuntimeDeps(makeEvolu());
  configureSyncDiagnosticsContext();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sync apply runtime behavior', () => {
  it('applies remote AI settings, respects local locks, and writes display prefs', async () => {
    await applyAISettings({
      'labcharts-ai-provider': 'openrouter',
      'labcharts-openrouter-key': 'sk-remote',
      'labcharts-custom-url': 'x'.repeat(10001),
      'ignored-key': 'ignored',
    });

    expect(localStorage.getItem('labcharts-ai-provider')).toBe('openrouter');
    expect(localStorage.getItem('labcharts-openrouter-key')).toBe('sk-remote');
    expect(localStorage.getItem('labcharts-custom-url')).toBeNull();
    expect(window.updateChatHeaderModel).toHaveBeenCalledTimes(1);
    expect(window.refreshWebSearchToggle).toHaveBeenCalledTimes(1);

    sessionStorage.setItem('or_oauth_local_settings_lock_until', String(Date.now() + 60_000));
    localStorage.setItem('labcharts-ai-provider', 'local-provider');
    localStorage.setItem('labcharts-openrouter-key', 'sk-local');
    await applyAISettings({
      'labcharts-ai-provider': 'remote-provider',
      'labcharts-openrouter-key': 'sk-remote-2',
      'labcharts-venice-model': 'venice-remote',
    });

    expect(localStorage.getItem('labcharts-ai-provider')).toBe('local-provider');
    expect(localStorage.getItem('labcharts-openrouter-key')).toBe('sk-local');
    expect(localStorage.getItem('labcharts-venice-model')).toBe('venice-remote');

    sessionStorage.setItem('labcharts-ai-settings-local-lock-until', String(Date.now() + 60_000));
    localStorage.setItem('labcharts-venice-model', 'venice-local');
    await applyAISettings({ 'labcharts-venice-model': 'venice-locked-remote' });
    expect(localStorage.getItem('labcharts-venice-model')).toBe('venice-local');

    applyDisplayPrefs(PROFILE_ID, {
      units: 'si',
      rangeMode: 'functional',
      phaseOverlay: '1',
      unknown: 'ignored',
    });
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-units`)).toBe('si');
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-rangeMode`)).toBe('functional');
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-phaseOverlay`)).toBe('1');
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-unknown`)).toBeNull();
  });
});

describe('sync diagnostics context runtime behavior', () => {
  it('returns configured diagnostic dependencies and falls back safely after getter failures', () => {
    const values = {
      evolu: { db: true },
      profileQuery: { profile: true },
      tombstoneQuery: { tombstone: true },
      owner: { id: 'owner-1' },
    };
    configureSyncDiagnosticsContext({
      getEvolu: () => values.evolu,
      getProfileQuery: () => values.profileQuery,
      getTombstoneQuery: () => values.tombstoneQuery,
      getAppOwner: () => values.owner,
      isSyncEnabled: () => 1,
      getSubscriptionFireCount: () => '7',
      isSyncing: () => 'yes',
      isPulling: () => 0,
    });

    expect(currentDiagnosticEvolu()).toBe(values.evolu);
    expect(currentDiagnosticProfileQuery()).toBe(values.profileQuery);
    expect(currentDiagnosticTombstoneQuery()).toBe(values.tombstoneQuery);
    expect(currentDiagnosticAppOwner()).toBe(values.owner);
    expect(currentDiagnosticSyncEnabled()).toBe(true);
    expect(currentDiagnosticSubscriptionFireCount()).toBe(7);
    expect(currentDiagnosticSyncing()).toBe(true);
    expect(currentDiagnosticPulling()).toBe(false);

    configureSyncDiagnosticsContext({
      getEvolu: () => { throw new Error('evolu failed'); },
      getProfileQuery: () => { throw new Error('profile failed'); },
      getTombstoneQuery: () => { throw new Error('tombstone failed'); },
      getAppOwner: () => { throw new Error('owner failed'); },
      isSyncEnabled: () => { throw new Error('enabled failed'); },
      getSubscriptionFireCount: () => { throw new Error('count failed'); },
      isSyncing: () => { throw new Error('syncing failed'); },
      isPulling: () => { throw new Error('pulling failed'); },
    });

    expect(currentDiagnosticEvolu()).toBeNull();
    expect(currentDiagnosticProfileQuery()).toBeNull();
    expect(currentDiagnosticTombstoneQuery()).toBeNull();
    expect(currentDiagnosticAppOwner()).toBeNull();
    expect(currentDiagnosticSyncEnabled()).toBe(false);
    expect(currentDiagnosticSubscriptionFireCount()).toBe(0);
    expect(currentDiagnosticSyncing()).toBe(false);
    expect(currentDiagnosticPulling()).toBe(false);
  });
});

describe('sync delta planner runtime behavior', () => {
  it('plans array inserts, resurrecting updates, tombstones, unsafe-id skips, and storm guards', async () => {
    const fake = makeEvolu({
      itemRows: [
        { id: 'row-existing', profileId: PROFILE_ID, arrayName: 'sunSessions', itemId: 'sun-1', isDeleted: 1 },
        { id: 'row-gone', profileId: PROFILE_ID, arrayName: 'sunSessions', itemId: 'gone' },
      ],
    });
    configureRuntimeDeps(fake);
    writeSnapshot(PROFILE_ID, 'sunSessions', { 'sun-1': 'old-hash', gone: 'old-gone' });

    const plan = await _planArrayDelta(PROFILE_ID, 'sunSessions', [
      { id: 'sun-1', date: '2026-06-01', minutes: 12 },
      { id: 'sun-2', date: '2026-06-02', minutes: 18 },
      { id: 'bad:id', date: '2026-06-03', minutes: 99 },
    ]);

    expect(plan.ops).toHaveLength(3);
    expect(plan.ops.find(op => op.kind === 'update')?.args).toMatchObject({
      id: 'row-existing',
      itemId: 'sun-1',
      isDeleted: null,
    });
    expect(plan.ops.find(op => op.kind === 'insert')?.args).toMatchObject({ itemId: 'sun-2' });
    expect(plan.ops.find(op => op.kind === 'tombstone')?.args).toMatchObject({ id: 'row-gone', isDeleted: 1 });
    expect(plan.next).toHaveProperty('sun-1');
    expect(plan.next).toHaveProperty('sun-2');
    expect(plan.next).not.toHaveProperty('bad:id');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeSnapshot(PROFILE_ID, 'deviceSessions', Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [`dev-${index}`, `hash-${index}`]),
    ));
    configureRuntimeDeps(makeEvolu({
      itemRows: Array.from({ length: 20 }, (_, index) => ({
        id: `row-${index}`,
        profileId: PROFILE_ID,
        arrayName: 'deviceSessions',
        itemId: `dev-${index}`,
      })),
    }));

    const storm = await _planArrayDelta(PROFILE_ID, 'deviceSessions', []);
    expect(storm.ops).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('refused tombstone storm'));
  });

  it('plans keyed-map sanitized keys, explicit null clears, row-derived SNPs, and scalar transitions', async () => {
    const fake = makeEvolu({
      itemRows: [
        { id: 'mv-row', profileId: PROFILE_ID, arrayName: 'manualValues', itemId: 'labs.glucose_2026-06-01' },
        { id: 'old-mv-row', profileId: PROFILE_ID, arrayName: 'manualValues', itemId: 'old.key' },
        { id: 'snp-row', profileId: PROFILE_ID, arrayName: 'genetics.snps', itemId: 'rs123', payload: JSON.stringify({ k: 'rs123', v: { genotype: 'AA' } }) },
        { id: 'scalar-row-old', profileId: PROFILE_ID, arrayName: 'menstrualCycle', itemId: 'menstrualCycle', syncedAt: '2026-01-01T00:00:00Z' },
        { id: 'scalar-row-new', profileId: PROFILE_ID, arrayName: 'menstrualCycle', itemId: 'menstrualCycle', syncedAt: '2026-06-01T00:00:00Z', isDeleted: 1 },
      ],
    });
    configureRuntimeDeps(fake);
    writeSnapshot(PROFILE_ID, 'manualValues', {
      'labs.glucose_2026-06-01': 'old-hash',
      'old.key': 'old-map-hash',
    });

    const mapPlan = await _planKeyedMapDelta(PROFILE_ID, 'manualValues', {
      'labs.glucose:2026-06-01': null,
      'labs.hdl:2026-06-02': 1.8,
      __proto__: 'ignored',
    });

    expect(mapPlan.ops.find(op => op.kind === 'update')?.args).toMatchObject({
      id: 'mv-row',
      itemId: 'labs.glucose_2026-06-01',
    });
    expect(JSON.parse(mapPlan.ops.find(op => op.kind === 'update')?.args.payload)).toEqual({
      k: 'labs.glucose:2026-06-01',
      v: null,
    });
    expect(mapPlan.ops.find(op => op.kind === 'insert')?.args.itemId).toBe('labs.hdl_2026-06-02');
    expect(mapPlan.ops.find(op => op.kind === 'tombstone')?.args).toMatchObject({ id: 'old-mv-row', isDeleted: 1 });

    writeSnapshot(PROFILE_ID, 'genetics.snps', { rs123: 'old-snp-hash' });
    const snpPlan = await _planKeyedMapDelta(PROFILE_ID, 'genetics.snps', {});
    expect(snpPlan.next).toHaveProperty('rs123');
    expect(snpPlan.ops).toHaveLength(1);

    writeSnapshot(PROFILE_ID, 'menstrualCycle', { menstrualCycle: 'old-cycle-hash' });
    const scalarPlan = await _planScalarDelta(PROFILE_ID, 'menstrualCycle', { cycleLength: 28 });
    expect(scalarPlan.ops).toHaveLength(1);
    expect(scalarPlan.ops[0]).toMatchObject({
      kind: 'update',
      args: {
        id: 'scalar-row-new',
        arrayName: 'menstrualCycle',
        itemId: 'menstrualCycle',
        isDeleted: null,
      },
    });
    expect(JSON.parse(scalarPlan.ops[0].args.payload)).toEqual({ v: { cycleLength: 28 } });

    fake.itemRows.find(row => row.id === 'scalar-row-new').isDeleted = 0;
    const tombstonePlan = await _planScalarDelta(PROFILE_ID, 'menstrualCycle', '');
    expect(tombstonePlan.ops).toEqual([
      expect.objectContaining({
        kind: 'tombstone',
        args: expect.objectContaining({ id: 'scalar-row-new', isDeleted: 1 }),
      }),
    ]);
  });

  it('applies delta ops through Evolu and reports partial failures', () => {
    const fake = makeEvolu();
    configureRuntimeDeps(fake);
    const ok = _applyArrayDelta('sunSessions', {
      ops: [
        { kind: 'insert', args: { profileId: PROFILE_ID, arrayName: 'sunSessions', itemId: 'sun-1', payload: '{}' } },
        { kind: 'update', args: { id: 'missing-row', profileId: PROFILE_ID, arrayName: 'sunSessions', itemId: 'sun-2', payload: '{}' } },
        { kind: 'tombstone', args: { id: 'missing-row', isDeleted: 1 } },
      ],
    });

    expect(ok).toBe(true);
    expect(fake.calls.insert).toHaveLength(1);
    expect(fake.calls.update).toHaveLength(2);

    const failing = makeEvolu({ failItemRows: true });
    configureRuntimeDeps(failing);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(_applyArrayDelta('sunSessions', {
      ops: [{ kind: 'insert', args: { profileId: PROFILE_ID, arrayName: 'sunSessions', itemId: 'sun-fail', payload: '{}' } }],
    })).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('delta op insert sunSessions failed:'), 'item insert failed');
  });
});

describe('sync push delta runtime behavior', () => {
  it('plans representative arrays, maps, and scalars, strips genetics SNPs from scalar payloads, and commits snapshots', async () => {
    const fake = makeEvolu();
    configureRuntimeDeps(fake);

    const importedData = {
      sunSessions: [{ id: 'sun-1', date: '2026-06-01', minutes: 12 }],
      lightEnvironment: {
        rooms: [{ id: 'room-1', name: 'Bedroom' }],
        burdenAI: { score: 0.4 },
      },
      manualValues: { 'labs.glucose:2026-06-01': 5.4 },
      genetics: {
        coverage: { found: 1, total: 2 },
        source: 'fixture',
        snps: { rs123: { genotype: 'AA' } },
      },
      diagnoses: { items: ['low ferritin'] },
    };

    const { deltaPlans, deltaOpCount } = await planProfileDeltas(PROFILE_ID, importedData);

    expect(deltaOpCount).toBeGreaterThanOrEqual(6);
    expect(deltaPlans.map(item => item.arrayName)).toEqual(expect.arrayContaining([
      'sunSessions',
      'lightEnvironment.rooms',
      'manualValues',
      'genetics.snps',
      'genetics',
      'diagnoses',
      'lightEnvironment.burdenAI',
    ]));
    const geneticsPlan = deltaPlans.find(item => item.arrayName === 'genetics');
    expect(JSON.parse(geneticsPlan.plan.ops[0].args.payload).v).toEqual({
      coverage: { found: 1, total: 2 },
      source: 'fixture',
    });

    const debug = vi.fn();
    applyCommittedDeltas(PROFILE_ID, 'payload-json', deltaPlans, deltaOpCount, debug);

    expect(fake.calls.insert.filter(call => call.table === 'itemRow').length).toBe(deltaOpCount);
    expect(JSON.parse(localStorage.getItem(deltaKey(PROFILE_ID, 'sunSessions')))).toHaveProperty('sun-1');
    expect(getDeltaTelemetry(PROFILE_ID).summary).toMatchObject({
      count: 1,
      totalBlobBytes: 'payload-json'.length,
      totalOps: deltaOpCount,
    });
    expect(debug).toHaveBeenCalledWith(expect.stringContaining(`Applied ${deltaOpCount} delta ops`));
    expect(resetDeltaTelemetry(PROFILE_ID)).toBe(true);
  });
});

describe('sync push runtime behavior', () => {
  it('inserts and updates profile rows only after a committed push and records local commit state', async () => {
    const fake = makeEvolu();
    const debug = vi.fn();
    configureSyncDelta({
      getEvolu: () => fake.evolu,
      getItemRowQuery: () => ITEM_ROW_QUERY,
    });
    configureSyncPush({
      getEvolu: () => fake.evolu,
      getProfileQuery: () => PROFILE_QUERY,
      isSyncEnabled: () => true,
      isPhase2CutoverEnabled: () => false,
      disablePhase2Cutover: vi.fn(),
      debug,
    });

    await expect(pushProfile(PROFILE_ID, {
      sunSessions: [{ id: 'sun-1', date: '2026-06-01' }],
      lightDevices: [{ id: 'device-1', name: 'Panel' }],
    })).resolves.toEqual({ ok: true });

    expect(fake.calls.insert.find(call => call.table === 'profileData')?.args).toMatchObject({
      profileId: PROFILE_ID,
    });
    expect(fake.calls.insert.filter(call => call.table === 'itemRow').length).toBeGreaterThanOrEqual(2);
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-sync-ts`)).toMatch(/^\d+$/);
    expect(isSyncPushInFlight()).toBe(false);

    await expect(pushProfile(PROFILE_ID, { sunSessions: [{ id: 'sun-1', date: '2026-06-02' }] })).resolves.toEqual({ ok: true });
    expect(fake.calls.update.find(call => call.table === 'profileData')?.args).toMatchObject({
      id: 'profile-row-1',
      profileId: PROFILE_ID,
    });
    expect(debug).toHaveBeenCalledWith(expect.stringContaining(`Queued ${PROFILE_ID.slice(0, 8)}`));
  });

  it('normalizes legacy importedData before writing sync payloads and deltas', async () => {
    const fake = makeEvolu();
    configureRuntimeDeps(fake);

    await expect(pushProfile(PROFILE_ID, {
      entries: [{ date: '2026-01-01', markers: { 'hormones.cPeptide': 1 } }],
      customMarkers: { 'hormones.cPeptide': { name: 'C-peptide' } },
    })).resolves.toEqual({ ok: true });

    const profileWrite = fake.calls.insert.find(call => call.table === 'profileData')?.args;
    const parsed = await parseSyncPayload(profileWrite?.dataJson || '{}');
    expect(parsed.importedData.entries[0].markers['diabetes.cPeptide']).toBe(1);
    expect(parsed.importedData.entries[0].markers['hormones.cPeptide']).toBeUndefined();
    expect(parsed.importedData.customMarkers['hormones.cPeptide']).toBeUndefined();
  });

  it('skips concurrent pushes and releases the in-flight flag through the watchdog', async () => {
    vi.useFakeTimers();
    const fake = makeEvolu({ completeProfileWrites: false });
    configureRuntimeDeps(fake);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const firstPush = pushProfile(PROFILE_ID, { sunSessions: [{ id: 'sun-hung' }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(isSyncPushInFlight()).toBe(true);

    await expect(pushProfile(PROFILE_ID, { sunSessions: [{ id: 'sun-skipped' }] })).resolves.toEqual({
      ok: false,
      skipped: true,
      reason: 'in-flight',
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('another push is in-flight'));

    await vi.advanceTimersByTimeAsync(30_000);
    await expect(firstPush).resolves.toEqual({ ok: false, reason: 'timeout' });
    expect(isSyncPushInFlight()).toBe(false);
  });
});

describe('sync cleanup and rebroadcast runtime behavior', () => {
  it('recognizes and clears disable-time sync storage plus stale pull hash keys', () => {
    expect(isSyncDisableCleanupKey(`labcharts-${PROFILE_ID}-delta-sunSessions`)).toBe(true);
    expect(isSyncDisableCleanupKey(`labcharts-${PROFILE_ID}-sync-cutover-v2`)).toBe(true);
    expect(isSyncDisableCleanupKey(`labcharts-${PROFILE_ID}-relay-bytes-total`)).toBe(true);
    expect(isSyncDisableCleanupKey('labcharts-sync-restore-join-pending')).toBe(true);
    expect(isSyncDisableCleanupKey('labcharts-relay-quota-warned')).toBe(true);
    expect(isSyncDisableCleanupKey(`labcharts-${PROFILE_ID}-imported`)).toBe(false);

    localStorage.setItem(`labcharts-${PROFILE_ID}-sync-ts`, '123');
    localStorage.setItem(`labcharts-${PROFILE_ID}-delta-sunSessions`, '{}');
    localStorage.setItem(`labcharts-${PROFILE_ID}-delta-sunSessions-meta`, '{}');
    localStorage.setItem(`labcharts-${PROFILE_ID}-sync-cutover-v2`, '1');
    localStorage.setItem(`labcharts-${PROFILE_ID}-relay-bytes-total`, '99');
    localStorage.setItem('labcharts-relay-quota-warned', '1');
    localStorage.setItem(`labcharts-${PROFILE_ID}-imported`, '{"keep":true}');

    clearSyncDisableStorage();

    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-sync-ts`)).toBeNull();
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-delta-sunSessions`)).toBeNull();
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-delta-sunSessions-meta`)).toBeNull();
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-sync-cutover-v2`)).toBeNull();
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-relay-bytes-total`)).toBeNull();
    expect(localStorage.getItem('labcharts-relay-quota-warned')).toBeNull();
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-imported`)).toBe('{"keep":true}');

    const debug = vi.fn();
    localStorage.setItem(`labcharts-${PROFILE_ID}-sync-hash`, 'old-hash');
    localStorage.setItem('labcharts-not-sync-hash-extra', 'keep');
    clearStaleSyncHashKeysOnce(debug);
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-sync-hash`)).toBeNull();
    expect(localStorage.getItem('labcharts-not-sync-hash-extra')).toBe('keep');
    expect(localStorage.getItem('labcharts-sync-hash-v2-migrated')).toBe('1');
    expect(debug).toHaveBeenCalledWith('Cleared 1 stale -sync-hash keys (one-time migration)');

    clearStaleSyncHashKeysOnce(debug);
    expect(debug).toHaveBeenCalledTimes(1);
  });

  it('schedules rebroadcasts only for active profiles with available budget and idle push state', async () => {
    vi.useFakeTimers();
    const previousProfile = state.currentProfile;
    state.currentProfile = PROFILE_ID;
    try {
      resetSyncStatus();

      const pushProfileSpy = vi.fn();
      const debug = vi.fn();
      const merged = { sunSessions: [{ id: 'sun-1' }] };

      expect(maybeScheduleRebroadcast({
        profileId: PROFILE_ID,
        merged,
        needsRebroadcast: true,
        pushProfile: pushProfileSpy,
        debug,
      })).toBe(true);
      expect(pushProfileSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(100);
      expect(pushProfileSpy).toHaveBeenCalledWith(PROFILE_ID, merged);
      expect(getRecentSyncEvents().at(-1)).toMatchObject({
        kind: 'rebroadcast',
        text: `Rebroadcast ${PROFILE_ID.slice(0, 8)}`,
      });

      updateSyncStatus({ push: 'pending' });
      expect(maybeScheduleRebroadcast({
        profileId: PROFILE_ID,
        merged,
        needsRebroadcast: true,
        pushProfile: pushProfileSpy,
        debug,
      })).toBe(false);
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('rebroadcast deferred'));
      expect(getRecentSyncEvents().at(-1)).toMatchObject({ kind: 'skip' });

      resetSyncStatus();
      state.currentProfile = 'other-profile';
      expect(maybeScheduleRebroadcast({
        profileId: PROFILE_ID,
        merged,
        needsRebroadcast: true,
        pushProfile: pushProfileSpy,
        debug,
      })).toBe(false);

      state.currentProfile = PROFILE_ID;
      maybeScheduleRebroadcast({ profileId: PROFILE_ID, merged, needsRebroadcast: true, pushProfile: pushProfileSpy });
      maybeScheduleRebroadcast({ profileId: PROFILE_ID, merged, needsRebroadcast: true, pushProfile: pushProfileSpy });
      expect(maybeScheduleRebroadcast({
        profileId: PROFILE_ID,
        merged,
        needsRebroadcast: true,
        pushProfile: pushProfileSpy,
        debug,
      })).toBe(false);
      expect(getRecentSyncEvents().at(-1)).toMatchObject({
        kind: 'skip',
        text: 'Rebroadcast budget exhausted \u2014 possible clock skew',
      });
    } finally {
      state.currentProfile = previousProfile;
    }
  });
});

describe('synced Agent Access state', () => {
  it('treats synced profile Agent Access as enabled even when this origin has no local toggle', () => {
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'a'.repeat(64),
      contextKey: 'gbctx_v1_' + 'A'.repeat(43),
      wearableSeriesDays: 90,
      updatedAt: 123,
    };
    localStorage.removeItem('labcharts-messenger-enabled');
    localStorage.removeItem('labcharts-messenger-token');
    localStorage.removeItem('labcharts-agent-context-key');
    localStorage.removeItem(`labcharts-${PROFILE_ID}-agent-wearable-series`);

    expect(isMessengerEnabled()).toBe(true);
    expect(getMessengerToken()).toBe('a'.repeat(64));
    expect(getMessengerContextKey()).toBe('gbctx_v1_' + 'A'.repeat(43));
    expect(getAgentAccessState().wearableSeriesDays).toBe(90);
    expect(getAgentWearableSeriesDays()).toBe(90);

    refreshAgentAccessFromSyncedProfile();
    expect(localStorage.getItem('labcharts-messenger-enabled')).toBe('true');
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-agent-wearable-series`)).toBe('90');
  });

  it('builds a one-paste Hermes setup command carrying token, context key, and gateway', () => {
    const token = 't'.repeat(64);
    const contextKey = 'gbctx_v1_' + 'C'.repeat(43);
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token,
      contextKey,
      updatedAt: 123,
    };
    setSyncRelay('wss://sync.getbased.health/app');
    vi.stubGlobal('location', { hostname: 'localhost' });

    const command = buildAgentAccessSetupCommand('hermes');

    expect(command).toMatch(/^curl -fsSL https:\/\/getbased\.health\/install\.sh \| bash -s -- connect hermes --setup 'gbsetup_v1_[A-Za-z0-9_-]+'$/);
    const setup = command.match(/--setup '([^']+)'/)?.[1];
    expect(setup).toBeTruthy();
    const raw = setup.slice('gbsetup_v1_'.length).replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, '=')));
    expect(payload).toMatchObject({
      version: 1,
      token,
      contextKey,
      gateway: 'https://sync.getbased.health/app',
      client: 'hermes',
    });
    expect(typeof payload.createdAt).toBe('string');
  });

  it('migrates legacy local Agent Access into synced profile state and delta rows', async () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'b'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'B'.repeat(43));
    localStorage.setItem(`labcharts-${PROFILE_ID}-agent-wearable-series`, '30');

    const migrated = migrateLocalAgentAccessToProfile();
    expect(migrated.enabled).toBe(true);
    expect(migrated.token).toBe('b'.repeat(64));
    expect(migrated.contextKey).toBe('gbctx_v1_' + 'B'.repeat(43));
    expect(getAgentAccessState().wearableSeriesDays).toBe(30);
    expect(state.importedData.agentAccess).toMatchObject({
      enabled: true,
      token: 'b'.repeat(64),
      contextKey: 'gbctx_v1_' + 'B'.repeat(43),
    });
    expect(state.importedData.agentAccess.wearableSeriesDays).toBeUndefined();
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(30);
    expect(isAgentAccessMigrationDirty()).toBe(true);
    clearAgentAccessMigrationDirty();
    expect(isAgentAccessMigrationDirty()).toBe(false);
    const migratedUpdatedAt = state.importedData.agentAccess.updatedAt;
    getAgentAccessState();
    expect(state.importedData.agentAccess.updatedAt).toBe(migratedUpdatedAt);

    const fake = makeEvolu();
    configureRuntimeDeps(fake);
    const { deltaPlans } = await planProfileDeltas(PROFILE_ID, state.importedData);
    expect(deltaPlans.some(p => p.arrayName === 'agentAccess')).toBe(true);
  });

  it('migrates an explicit legacy off wearable-series preference into the synced scalar', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'o'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'O'.repeat(43));
    localStorage.setItem(`labcharts-${PROFILE_ID}-agent-wearable-series`, 'off');

    const migrated = migrateLocalAgentAccessToProfile();

    expect(migrated.enabled).toBe(true);
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(0);
    expect(getAgentWearableSeriesDays()).toBe(0);
  });

  it('pushContextToGateway explicitly migrates legacy credentials before checking enabled state', () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'p'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'P'.repeat(43));
    state.importedData.agentAccess = null;

    pushContextToGateway();

    expect(state.importedData.agentAccess).toMatchObject({
      enabled: true,
      token: 'p'.repeat(64),
      contextKey: 'gbctx_v1_' + 'P'.repeat(43),
    });
    expect(isMessengerEnabled()).toBe(true);
    vi.clearAllTimers();
  });

  it('cancels a pending context push when switching to a profile without Agent Access', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);
    configureSyncMessenger({
      getSyncRelay: () => 'wss://sync.getbased.health',
      getAppOwner: () => ({ id: 'abcdefghijklmnopqrstuv', writeKey: new Uint8Array(32).fill(7) }),
      debug: vi.fn(),
    });
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'q'.repeat(64),
      contextKey: 'gbctx_v1_' + 'Q'.repeat(43),
      updatedAt: 123,
    };

    pushContextToGateway();
    state.currentProfile = 'profile-without-agent-access';
    localStorage.setItem('labcharts-active-profile', 'profile-without-agent-access');
    state.importedData.agentAccess = null;
    refreshAgentAccessFromSyncedProfile({ migrateLegacy: false, clearWhenMissing: true });
    pushContextToGateway();

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(6000);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('cancels a pending context push when Agent Access is revoked before the debounce fires', () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    configureSyncMessenger({
      getSyncRelay: () => 'wss://sync.getbased.health',
      getAppOwner: () => null,
      debug: vi.fn(),
    });
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'r'.repeat(64),
      contextKey: 'gbctx_v1_' + 'R'.repeat(43),
      updatedAt: 123,
    };

    pushContextToGateway();
    revokeMessengerToken();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('profile-switch refresh does not mirror the departed profile series preference under the new profile key', () => {
    state.currentProfile = 'new-profile';
    localStorage.setItem('labcharts-active-profile', 'new-profile');
    state.importedData.agentAccess = null;
    state.importedData.agentAccessWearableSeriesDays = 90;
    localStorage.removeItem('labcharts-new-profile-agent-wearable-series');

    const refreshed = refreshAgentAccessFromSyncedProfile({ migrateLegacy: false, clearWhenMissing: true });

    expect(refreshed).toMatchObject({ enabled: false, token: null, contextKey: null, wearableSeriesDays: 0 });
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(0);
    expect(getAgentWearableSeriesDays()).toBe(0);
    expect(localStorage.getItem('labcharts-new-profile-agent-wearable-series')).toBe('off');
  });

  it('does not let stale legacy localStorage resurrect Agent Access after a synced revoke', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'c'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'C'.repeat(43));
    state.importedData.agentAccess = {
      version: 1,
      enabled: false,
      token: null,
      contextKey: null,
      wearableSeriesDays: 0,
      revokedAt: 999,
      updatedAt: 999,
    };

    expect(getAgentAccessState()).toMatchObject({
      enabled: false,
      token: null,
      contextKey: null,
      revokedAt: 999,
    });
    expect(isMessengerEnabled()).toBe(false);
    refreshAgentAccessFromSyncedProfile();
    expect(localStorage.getItem('labcharts-messenger-enabled')).toBe('false');
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
  });

  it('does not let stale legacy localStorage overwrite a regenerated synced token', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'd'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'D'.repeat(43));
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'e'.repeat(64),
      contextKey: 'gbctx_v1_' + 'E'.repeat(43),
      wearableSeriesDays: 30,
      migratedFromLocalStorageAt: 111,
      credentialCreatedAt: 222,
      revokedAt: null,
      updatedAt: 333,
    };

    expect(getAgentAccessState()).toMatchObject({
      enabled: true,
      token: 'e'.repeat(64),
      contextKey: 'gbctx_v1_' + 'E'.repeat(43),
      wearableSeriesDays: 30,
      migratedFromLocalStorageAt: 111,
    });
    expect(getMessengerToken()).toBe('e'.repeat(64));
    expect(getMessengerContextKey()).toBe('gbctx_v1_' + 'E'.repeat(43));
    refreshAgentAccessFromSyncedProfile();
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
  });

  it('trusts synced regenerated credentials even when the local state was originally generated, not migrated', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'g'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'G'.repeat(43));
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'h'.repeat(64),
      contextKey: 'gbctx_v1_' + 'H'.repeat(43),
      wearableSeriesDays: 0,
      credentialCreatedAt: 222,
      revokedAt: null,
      updatedAt: 333,
    };

    expect(getAgentAccessState()).toMatchObject({
      enabled: true,
      token: 'h'.repeat(64),
      contextKey: 'gbctx_v1_' + 'H'.repeat(43),
    });
    refreshAgentAccessFromSyncedProfile();
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
  });

  it('profile-switch refresh clears stale legacy credentials instead of importing them into an empty profile', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'i'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'I'.repeat(43));
    state.importedData.agentAccess = null;
    state.importedData.agentAccessWearableSeriesDays = 90;

    const refreshed = refreshAgentAccessFromSyncedProfile({ migrateLegacy: false, clearWhenMissing: true });

    expect(refreshed).toMatchObject({ enabled: false, token: null, contextKey: null, wearableSeriesDays: 0 });
    expect(state.importedData.agentAccess).toBeNull();
    expect(localStorage.getItem('labcharts-messenger-enabled')).toBe('false');
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
    expect(localStorage.getItem(`labcharts-${PROFILE_ID}-agent-wearable-series`)).toBe('off');
  });

  it('does not let matching legacy credentials rewrite an existing synced series preference', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'j'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'J'.repeat(43));
    localStorage.removeItem(`labcharts-${PROFILE_ID}-agent-wearable-series`);
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'j'.repeat(64),
      contextKey: 'gbctx_v1_' + 'J'.repeat(43),
      wearableSeriesDays: 90,
      migratedFromLocalStorageAt: 111,
      updatedAt: 333,
    };

    expect(getAgentAccessState()).toMatchObject({
      enabled: true,
      token: 'j'.repeat(64),
      contextKey: 'gbctx_v1_' + 'J'.repeat(43),
      wearableSeriesDays: 90,
    });
    expect(state.importedData.agentAccess.wearableSeriesDays).toBe(90);
  });

  it('synced wearable-series preference beats legacy local on value', () => {
    localStorage.setItem(`labcharts-${PROFILE_ID}-agent-wearable-series`, 'on');
    state.importedData.agentAccessWearableSeriesDays = 7;
    expect(getAgentWearableSeriesDays()).toBe(7);

    state.importedData.agentAccessWearableSeriesDays = 0;
    expect(getAgentWearableSeriesDays()).toBe(0);

    state.importedData.agentAccessWearableSeriesDays = 90;
    expect(getAgentWearableSeriesDays()).toBe(90);
  });

  it('does not create unsaved synced series state when only legacy preference exists', () => {
    localStorage.setItem(`labcharts-${PROFILE_ID}-agent-wearable-series`, '30');

    const stateOnly = getAgentAccessState();

    expect(stateOnly.enabled).toBe(false);
    expect(stateOnly.wearableSeriesDays).toBe(0);
    expect(state.importedData.agentAccess).toBeNull();
    expect(state.importedData.agentAccessWearableSeriesDays).toBeUndefined();
    expect(getAgentWearableSeriesDays()).toBe(30);
  });

  it('sync refresh migrates legacy credentials before mirroring disabled fallback', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'm'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'M'.repeat(43));
    state.importedData.agentAccess = null;

    const refreshed = refreshAgentAccessFromSyncedProfile();

    expect(refreshed).toMatchObject({
      enabled: true,
      token: 'm'.repeat(64),
      contextKey: 'gbctx_v1_' + 'M'.repeat(43),
    });
    expect(state.importedData.agentAccess).toMatchObject({
      enabled: true,
      token: 'm'.repeat(64),
      contextKey: 'gbctx_v1_' + 'M'.repeat(43),
    });
    expect(localStorage.getItem('labcharts-messenger-enabled')).toBe('true');
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
  });

  it('clears legacy credential mirrors when setting series migrates Agent Access into profile state', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'k'.repeat(64));
    localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'K'.repeat(43));
    state.importedData.agentAccess = null;

    expect(setAgentAccessWearableSeriesDays(30)).toBe(30);
    expect(setAgentAccessWearableSeriesDays(45)).toBeNull();

    expect(localStorage.getItem('labcharts-messenger-enabled')).toBe('true');
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
    expect(state.importedData.agentAccess).toMatchObject({
      enabled: true,
      token: 'k'.repeat(64),
      contextKey: 'gbctx_v1_' + 'K'.repeat(43),
    });
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(30);
  });

  it('uses the active profile id when remotely revoking Agent Access tokens', async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);
    state.currentProfile = 'profile-runtime-alt';
    localStorage.setItem('labcharts-active-profile', 'profile-runtime-alt');
    configureSyncMessenger({
      getSyncRelay: () => 'wss://relay.example.test',
      getAppOwner: () => ({ id: 'MDEyMzQ1Njc4OWFiY2RlZg', writeKey: new Uint8Array(32).fill(7) }),
      debug: vi.fn(),
    });
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token: 'r'.repeat(64),
      contextKey: 'gbctx_v1_' + 'R'.repeat(43),
    };

    revokeMessengerToken();
    for (let i = 0; i < 20 && fetchSpy.mock.calls.length === 0; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://relay.example.test/api/context');
    expect(options.method).toBe('DELETE');
    expect(JSON.parse(options.body).profileId).toBe('profile-runtime-alt');
  });

  it('includes sanitized relay error details when context push fails', () => {
    const src = pushContextToGateway.toString();
    expect(src).toContain('await res.text()');
    expect(src).toContain('body.slice(0, 240)');
    expect(src).toContain('Gateway returned ${res.status}${detail}');
  });

  it('keeps preference-only writes from emitting stale credential scalar rows', async () => {
    const staleCredentialState = {
      version: 1,
      enabled: true,
      token: 'f'.repeat(64),
      contextKey: 'gbctx_v1_' + 'F'.repeat(43),
      migratedFromLocalStorageAt: 111,
      credentialCreatedAt: 222,
      revokedAt: null,
      updatedAt: 333,
    };
    state.importedData.agentAccess = { ...staleCredentialState };
    writeSnapshot(PROFILE_ID, 'agentAccess', {
      agentAccess: _djb2(JSON.stringify({ v: staleCredentialState })),
    });

    setAgentAccessWearableSeriesDays(30);
    const { deltaPlans } = await planProfileDeltas(PROFILE_ID, state.importedData);

    expect(state.importedData.agentAccess).toMatchObject(staleCredentialState);
    expect(state.importedData.agentAccess.wearableSeriesDays).toBeUndefined();
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(30);
    expect(deltaPlans.some(p => p.arrayName === 'agentAccess')).toBe(false);
    expect(deltaPlans.some(p => p.arrayName === 'agentAccessWearableSeriesDays')).toBe(true);
  });

  it('keeps generated credentials separate from wearable-series preference sync', async () => {
    const generated = generateMessengerToken();
    expect(generated.token).toHaveLength(64);
    expect(generated.previousToken).toBeNull();
    const token = state.importedData.agentAccess.token;
    const contextKey = state.importedData.agentAccess.contextKey;
    expect(state.importedData.agentAccess.enabled).toBe(true);
    expect(token).toHaveLength(64);
    expect(contextKey).toMatch(/^gbctx_v1_/);
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();

    setAgentAccessWearableSeriesDays(7);
    expect(state.importedData.agentAccess.token).toBe(token);
    expect(state.importedData.agentAccess.contextKey).toBe(contextKey);
    expect(state.importedData.agentAccess.wearableSeriesDays).toBeUndefined();
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(7);
    expect(getAgentWearableSeriesDays()).toBe(7);

    setAgentWearableSeriesDays(0);
    expect(state.importedData.agentAccess.token).toBe(token);
    expect(state.importedData.agentAccess.contextKey).toBe(contextKey);
    expect(state.importedData.agentAccess.wearableSeriesDays).toBeUndefined();
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(7);
    expect(getAgentWearableSeriesDays()).toBe(7);

    setAgentAccessWearableSeriesDays(0);
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(0);

    const fake = makeEvolu();
    configureRuntimeDeps(fake);
    const { deltaPlans } = await planProfileDeltas(PROFILE_ID, state.importedData);
    expect(deltaPlans.some(p => p.arrayName === 'agentAccess')).toBe(true);
    expect(deltaPlans.some(p => p.arrayName === 'agentAccessWearableSeriesDays')).toBe(true);
  });

  it('local disable returns the previous token without calling the relay or keeping local secret mirrors', () => {
    const first = generateMessengerToken();
    localStorage.setItem('labcharts-messenger-token', 'stale-local-token');
    localStorage.setItem('labcharts-agent-context-key', 'stale-local-context');

    const previousToken = disableMessengerTokenLocal();

    expect(previousToken).toBe(first.token);
    expect(state.importedData.agentAccess).toMatchObject({
      enabled: false,
      token: null,
      contextKey: null,
    });
    expect(state.importedData.agentAccess.revokedAt).toEqual(expect.any(Number));
    expect(localStorage.getItem('labcharts-messenger-enabled')).toBe('false');
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
  });

  it('clearLegacyAgentAccessSecrets removes only raw credential mirrors', () => {
    localStorage.setItem('labcharts-messenger-enabled', 'true');
    localStorage.setItem('labcharts-messenger-token', 'legacy-token');
    localStorage.setItem('labcharts-agent-context-key', 'legacy-context');

    clearLegacyAgentAccessSecrets();

    expect(localStorage.getItem('labcharts-messenger-enabled')).toBe('true');
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
  });
});
