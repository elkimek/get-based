import { _djb2 } from '../js/sync-delta-registry.js';
import { applyCommittedDeltas, planProfileDeltas } from '../js/sync-push-deltas.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { _applyArrayDelta, _planArrayDelta, _planKeyedMapDelta, _planScalarDelta, getDeltaTelemetry, resetDeltaTelemetry, configureSyncDelta } from '../js/sync-delta.js';
import { ITEM_ROW_QUERY, PROFILE_ID, deltaKey, makeEvolu, writeSnapshot } from './helpers/sync-runtime-fixture.js';

function configureRuntimeDeps(fake: ReturnType<typeof makeEvolu>) {
  configureSyncDelta({ getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY });
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); configureRuntimeDeps(makeEvolu()); });
afterEach(() => { configureSyncDelta({ getEvolu: () => null, getItemRowQuery: () => null }); vi.restoreAllMocks(); });

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
    expect(JSON.parse(mapPlan.ops.find(op => op.kind === 'update')?.args.payload!)).toEqual({
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
    expect(JSON.parse(scalarPlan.ops[0]!.args.payload!)).toEqual({ v: { cycleLength: 28 } });

    fake.itemRows.find(row => row.id === 'scalar-row-new')!.isDeleted = 0;
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

it('propagates explicit change-history privacy tombstones without tombstoning cap eviction', async () => {
    const event = {
      ts: Date.parse('2026-08-01T00:00:00.000Z'),
      type: 'wearable',
      kind: 'trend-flip',
      source: 'google_health',
      metricId: 'hrv_rmssd',
    };
    const eventId = `wh_${_djb2([
      event.source,
      event.metricId,
      event.kind,
      event.ts,
    ].join('|'))}`;
    configureRuntimeDeps(makeEvolu({
      itemRows: [{
        id: 'google-history-row',
        profileId: PROFILE_ID,
        arrayName: 'changeHistory',
        itemId: eventId,
      }],
    }));
    writeSnapshot(PROFILE_ID, 'changeHistory', { [eventId]: _djb2(JSON.stringify(event)) });

    const capEviction = await _planArrayDelta(PROFILE_ID, 'changeHistory', []);
    expect(capEviction.ops).toEqual([]);

    const explicitDeletion = await planProfileDeltas(PROFILE_ID, {
      changeHistory: [],
      _deleted: { changeHistory: [eventId] },
    });
    const historyPlan = explicitDeletion.deltaPlans
      .find(({ arrayName }) => arrayName === 'changeHistory')?.plan;
    expect(historyPlan?.ops).toEqual([expect.objectContaining({
      kind: 'tombstone',
      args: expect.objectContaining({ id: 'google-history-row', isDeleted: 1 }),
    })]);
    expect(historyPlan?.next).not.toHaveProperty(eventId);
  });

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
    expect(JSON.parse(geneticsPlan!.plan.ops[0]!.args.payload!).v).toEqual({
      coverage: { found: 1, total: 2 },
      source: 'fixture',
    });

    const debug = vi.fn();
    applyCommittedDeltas(PROFILE_ID, 'payload-json', deltaPlans, deltaOpCount, debug);

    expect(fake.calls.insert.filter(call => call.table === 'itemRow').length).toBe(deltaOpCount);
    expect(JSON.parse(localStorage.getItem(deltaKey(PROFILE_ID, 'sunSessions'))!)).toHaveProperty('sun-1');
    expect(getDeltaTelemetry(PROFILE_ID)!.summary).toMatchObject({
      count: 1,
      totalBlobBytes: 'payload-json'.length,
      totalOps: deltaOpCount,
    });
    expect(debug).toHaveBeenCalledWith(expect.stringContaining(`Applied ${deltaOpCount} delta ops`));
    expect(resetDeltaTelemetry(PROFILE_ID)).toBe(true);
  });

it('keeps a partially failed surface eligible for retry while continuing later mutations', async () => {
  const fake = makeEvolu();
  configureRuntimeDeps(fake);
  const items = [{ id: 'failed' }, { id: 'succeeded' }];
  const plan = await _planArrayDelta(PROFILE_ID, 'sunSessions', items);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(fake.evolu, 'insert').mockImplementationOnce(() => { throw new Error('first row failed'); });
  applyCommittedDeltas(PROFILE_ID, 'blob', [{ arrayName: 'sunSessions', plan }], plan.ops.length, vi.fn());
  expect(fake.itemRows.map(row => row.itemId)).toEqual(['succeeded']);
  expect(localStorage.getItem(deltaKey(PROFILE_ID, 'sunSessions'))).toBeNull();
  expect(localStorage.getItem(`${deltaKey(PROFILE_ID, 'sunSessions')}-meta`)).toBeNull();
  const retry = await _planArrayDelta(PROFILE_ID, 'sunSessions', items);
  expect(retry.ops.map(op => [op.kind, op.args.itemId])).toEqual([
    ['insert', 'failed'], ['update', 'succeeded'],
  ]);
  applyCommittedDeltas(PROFILE_ID, 'blob', [{ arrayName: 'sunSessions', plan: retry }], retry.ops.length, vi.fn());
  expect(JSON.parse(localStorage.getItem(deltaKey(PROFILE_ID, 'sunSessions'))!)).toEqual(retry.next);
});
