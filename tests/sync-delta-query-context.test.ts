import { expect, it } from 'vitest';
import {
  configureSyncDeltaObservabilityContext,
  createDeltaQueryAccess,
  currentDeltaEvolu,
  currentDeltaItemRowQuery,
} from '../js/sync-delta-observability-context.js';
import type { DeltaQueryOptions } from '../js/sync-delta-observability-context.js';
import { configureSyncDeltaPlannerContext, getPlannerItemRows } from '../js/sync-delta-planner-context.js';

it('keeps planner and observability providers separate and returns original matching rows', () => {
  const query = {};
  const plannerRow = { profileId: 'profile', arrayName: 'entries', itemId: 'day', payload: '{}' };
  const otherRow = { ...plannerRow, profileId: 'other' };
  const client = { getQueryRows: (value: unknown) => value === query ? [otherRow, plannerRow] : [] };
  try {
    configureSyncDeltaPlannerContext({ getEvolu: () => client, getItemRowQuery: () => query });
    configureSyncDeltaObservabilityContext({ getEvolu: () => null, getItemRowQuery: () => 'observability' });
    expect(currentDeltaEvolu()).toBeNull();
    expect(currentDeltaItemRowQuery()).toBe('observability');
    expect(getPlannerItemRows('profile', 'entries')).toEqual([plannerRow]);
    expect(getPlannerItemRows('profile', 'entries')[0]).toBe(plannerRow);
    expect(getPlannerItemRows('profile', 'notes')).toEqual([]);
    configureSyncDeltaObservabilityContext({ getEvolu: () => client, getItemRowQuery: () => query });
    configureSyncDeltaPlannerContext({ getEvolu: () => { throw new Error('planner unavailable'); } });
    expect(getPlannerItemRows('profile', 'entries')).toEqual([]);
    expect(currentDeltaEvolu()).toBe(client);
  } finally {
    configureSyncDeltaObservabilityContext({ getEvolu: () => null, getItemRowQuery: () => null });
    configureSyncDeltaPlannerContext({ getEvolu: () => null, getItemRowQuery: () => null });
  }
});

it('reads inherited overrides once, retains invalid overrides and calls providers without a receiver', () => {
  const access = createDeltaQueryAccess();
  const receivers: unknown[] = [];
  const query = {};
  let reads = 0;
  const options = Object.create({ get getItemRowQuery() {
    reads++;
    return function (this: unknown) { receivers.push(this); return query; };
  } }) as DeltaQueryOptions;
  access.configure(options);
  access.configure({ getItemRowQuery: null } as unknown as DeltaQueryOptions);
  expect(access.currentItemRowQuery()).toBe(query);
  expect(reads).toBe(1);
  expect(receivers).toEqual([undefined]);
});

it('finishes destructuring before changing providers and isolates throwing/falsy reads', () => {
  const access = createDeltaQueryAccess();
  const client = { getQueryRows: () => [] };
  access.configure({ getEvolu: () => client, getItemRowQuery: () => 'original' });
  const failure = new Error('query getter');
  expect(() => access.configure({
    getEvolu: () => null,
    get getItemRowQuery(): () => unknown { throw failure; },
  })).toThrow(failure);
  expect(access.currentEvolu()).toBe(client);
  expect(access.currentItemRowQuery()).toBe('original');
  access.configure({ getEvolu: () => { throw failure; }, getItemRowQuery: () => false });
  expect(access.currentEvolu()).toBeNull();
  expect(access.currentItemRowQuery()).toBeNull();
});

it('snapshots actual callback references without reading providers and retains forwarded snapshots', () => {
  const access = createDeltaQueryAccess();
  let calls = 0;
  const getEvolu = () => { calls++; return { getQueryRows: () => [] }; };
  const getItemRowQuery = () => { calls++; return 'original'; };
  access.configure({ getEvolu, getItemRowQuery });
  const forwarded = access.providers();
  expect(forwarded.getEvolu).toBe(getEvolu);
  expect(forwarded.getItemRowQuery).toBe(getItemRowQuery);
  expect(calls).toBe(0);
  access.configure({ getItemRowQuery: () => 'replacement' });
  expect(access.currentItemRowQuery()).toBe('replacement');
  expect(forwarded.getItemRowQuery()).toBe('original');
  expect(calls).toBe(1);
  const independent = createDeltaQueryAccess();
  independent.configure(forwarded);
  expect(independent.currentItemRowQuery()).toBe('original');
});
