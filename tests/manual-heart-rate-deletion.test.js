// @vitest-environment jsdom

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { state } from '../js/state.js';
import {
  deleteAllManualMetrics,
  deleteManualMetric,
  isManualMetricTombstoned,
  logManualMetric,
  reconcileManualMetricTombstones,
  refreshManualSummary,
} from '../js/wearables-manual.js';
import {
  deleteWearablesDB,
  getDaily,
  upsertDaily,
} from '../js/wearables-store.js';
import {
  configureWearableSummary,
  shouldWriteL2,
  syncWearableSummary,
} from '../js/wearables-summary.js';
import { reconcilePulledManualWearables } from '../js/profile-runtime.js';
import { DELTA_MAPS, _planKeyedMapDelta } from '../js/sync-delta.js';

const PROFILE_ID = 'manual-heart-rate-delete';
let previousProfile;
let previousImportedData;
let previousSummaryDeps;

function oldRhrSummary(date = '2026-08-12') {
  return {
    summaryUpdatedAt: new Date().toISOString(),
    sources: { manual: { connectedSince: date, coverageDays: 1 } },
    metrics: {
      rhr: {
        latest: 61,
        latestDate: date,
        primarySource: 'manual',
        baseline: 61,
        rolling: { d7: 61, d30: 61, d90: 61 },
        trend30d: 'flat',
        weekly: [61],
      },
    },
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  previousProfile = state.currentProfile;
  previousImportedData = state.importedData;
  state.currentProfile = PROFILE_ID;
  localStorage.setItem('labcharts-active-profile', PROFILE_ID);
  state.importedData = {
    entries: [],
    biometrics: {
      weight: [],
      bp: [],
      pulse: [{ date: '2026-08-12', value: 61, source: 'manual' }],
    },
    manualMetricTombstones: {},
    wearableConnections: {
      manual: { connectedAt: '2026-08-12T00:00:00.000Z', lastSyncAt: Date.now() },
    },
    wearableSummary: oldRhrSummary(),
  };
  previousSummaryDeps = configureWearableSummary({ saveImportedData: vi.fn(async () => true) });
});

afterEach(async () => {
  configureWearableSummary(previousSummaryDeps);
  await deleteWearablesDB(PROFILE_ID).catch(() => {});
  state.currentProfile = previousProfile;
  state.importedData = previousImportedData;
  localStorage.clear();
});

describe('durable manual heart-rate deletion', () => {
  it('removes local and legacy copies, then rejects a stale-device resurrection', async () => {
    await upsertDaily(PROFILE_ID, {
      source: 'manual',
      date: '2026-08-12',
      weight: 72,
      rhr: 61,
    });

    await deleteManualMetric(PROFILE_ID, 'rhr', '2026-08-12');

    expect(await getDaily(PROFILE_ID, 'manual', '2026-08-12')).toMatchObject({ weight: 72 });
    expect((await getDaily(PROFILE_ID, 'manual', '2026-08-12')).rhr).toBeUndefined();
    expect(state.importedData.biometrics.pulse).toEqual([]);
    expect(isManualMetricTombstoned('rhr', '2026-08-12')).toBe(true);

    // Simulate an old peer/local restore putting both historical copies back.
    await upsertDaily(PROFILE_ID, {
      source: 'manual',
      date: '2026-08-12',
      weight: 72,
      rhr: 61,
    });
    state.importedData.biometrics.pulse.push({ date: '2026-08-12', value: 61 });

    const reconciled = await reconcileManualMetricTombstones(PROFILE_ID);

    expect(reconciled).toEqual({ prunedRows: 1, prunedLegacy: 1 });
    expect(await getDaily(PROFILE_ID, 'manual', '2026-08-12')).toMatchObject({ weight: 72 });
    expect((await getDaily(PROFILE_ID, 'manual', '2026-08-12')).rhr).toBeUndefined();
    expect(state.importedData.biometrics.pulse).toEqual([]);
  });

  it('allows an intentional re-add to clear the synced deletion marker', async () => {
    await upsertDaily(PROFILE_ID, { source: 'manual', date: '2026-08-12', rhr: 61 });
    await deleteManualMetric(PROFILE_ID, 'rhr', '2026-08-12');
    state.importedData.manualMetricTombstones['rhr.all'] = Date.now();

    await logManualMetric(PROFILE_ID, 'rhr', { date: '2026-08-12', value: 64 });

    expect(isManualMetricTombstoned('rhr', '2026-08-12')).toBe(false);
    expect(state.importedData.manualMetricTombstones['rhr.2026-08-12']).toBe(0);
    expect(await getDaily(PROFILE_ID, 'manual', '2026-08-12')).toMatchObject({ rhr: 64 });
  });

  it('applies a pulled deletion before rebuilding the receiving device summary', async () => {
    await upsertDaily(PROFILE_ID, { source: 'manual', date: '2026-08-12', rhr: 61 });
    const merged = {
      ...state.importedData,
      biometrics: { weight: [], bp: [], pulse: [{ date: '2026-08-12', value: 61 }] },
      manualMetricTombstones: { 'rhr.2026-08-12': Date.now() },
      wearableSummary: oldRhrSummary(),
    };

    expect(await reconcilePulledManualWearables(PROFILE_ID, merged)).toBe(true);

    expect(await getDaily(PROFILE_ID, 'manual', '2026-08-12')).toBeNull();
    expect(merged.biometrics.pulse).toEqual([]);
    expect(merged.wearableSummary.metrics.rhr).toBeUndefined();
  });

  it('delete-all clears the final source and its stale synced summary', async () => {
    await upsertDaily(PROFILE_ID, { source: 'manual', date: '2026-08-12', rhr: 61 });

    await deleteAllManualMetrics(PROFILE_ID);
    // Simulate an unknown older reading arriving from a peer after this
    // device performed delete-all. The metric-wide marker must cover it too.
    await upsertDaily(PROFILE_ID, { source: 'manual', date: '2025-01-01', rhr: 59 });
    await reconcileManualMetricTombstones(PROFILE_ID);
    await refreshManualSummary(PROFILE_ID);

    expect(await getDaily(PROFILE_ID, 'manual', '2026-08-12')).toBeNull();
    expect(await getDaily(PROFILE_ID, 'manual', '2025-01-01')).toBeNull();
    expect(state.importedData.manualMetricTombstones['rhr.all']).toBeGreaterThan(0);
    expect(state.importedData.wearableConnections.manual).toBeUndefined();
    expect(state.importedData.wearableSummary.metrics).toEqual({});
    expect(state.importedData.wearableSummary.sources).toEqual({});
  });

  it('ships deletion clocks through the per-map CRDT surface', async () => {
    expect(DELTA_MAPS).toContain('manualMetricTombstones');

    const plan = await _planKeyedMapDelta(PROFILE_ID, 'manualMetricTombstones', {
      'rhr.2026-08-12': 123456,
      'rhr.all': 123456,
    });

    expect(plan.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'insert',
        args: expect.objectContaining({ arrayName: 'manualMetricTombstones', itemId: 'rhr.2026-08-12' }),
      }),
      expect.objectContaining({
        kind: 'insert',
        args: expect.objectContaining({ arrayName: 'manualMetricTombstones', itemId: 'rhr.all' }),
      }),
    ]));
  });
});

describe('wearable summary deletion gates', () => {
  it('persists a latest-date regression caused by deleting the newest reading', () => {
    const oldSummary = oldRhrSummary('2026-08-12');
    const newSummary = oldRhrSummary('2026-08-11');

    expect(shouldWriteL2(newSummary, oldSummary)).toMatchObject({
      write: true,
      reason: 'latest-regressed:rhr',
    });
  });

  it('force-clears a stale summary when no sources remain', async () => {
    const saveImportedData = vi.fn(async () => true);
    configureWearableSummary({ saveImportedData });
    state.importedData.wearableSummary = oldRhrSummary();

    const result = await syncWearableSummary(PROFILE_ID, {}, { force: true });

    expect(result).toMatchObject({ wrote: true, reason: 'force-no-sources' });
    expect(state.importedData.wearableSummary.metrics).toEqual({});
    expect(saveImportedData).toHaveBeenCalledOnce();
  });
});
