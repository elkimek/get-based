import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { updateKeyCache } from '../js/crypto.js';
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
import { maybeScheduleRebroadcast } from '../js/sync-pull-rebroadcast.js';
import { applyCommittedDeltas, planProfileDeltas } from '../js/sync-push-deltas.js';
import { configureSyncPush, isSyncPushInFlight, pushProfile } from '../js/sync-push.js';
import { getRecentSyncEvents, resetSyncStatus, updateSyncStatus } from '../js/sync-state.js';
import { state } from '../js/state.js';

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
  configureRuntimeDeps(makeEvolu());
  configureSyncDiagnosticsContext();
});

afterEach(() => {
  vi.useRealTimers();
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
