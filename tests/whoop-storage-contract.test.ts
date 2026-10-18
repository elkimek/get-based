import {expect, it, vi} from 'vitest';
import {DEVICE_PROTECTED_WEARABLE_MARKER, hasWhoopStorageDataToken} from '../js/wearables-whoop-storage-contract.js';
import {transformWhoopStorageValue} from '../js/wearables-whoop-storage.js';

for (const [label, value, expected] of [
  ['null', null, false], ['number', 42, false], ['boolean', true, false],
  ['empty', '', false], ['plain profile', '{"entries":[],"notes":[]}', false],
  ['unquoted source', 'whoop', false], ['uppercase source', '"WHOOP"', false],
  ['escaped letters', '{"source":"\\u0077hoop"}', false],
  ['quoted source', '{"source":"whoop"}', true],
  ['source as unrelated key', '{"whoop":null}', true],
  ['malformed source text', 'not JSON "whoop"', true],
  ['quoted marker', '{"_deviceProtectedWearableProfile":"v1"}', true],
  ['marker with other version', '{"_deviceProtectedWearableProfile":"other"}', true],
] as const) it(`preserves literal token eligibility: ${label}`, () => {
  expect(hasWhoopStorageDataToken(value)).toBe(expected);
});

it('never coerces opaque foreign inputs or changes their unchanged result identities', async () => {
  const value = {toString: vi.fn(() => '"whoop"')};
  expect(hasWhoopStorageDataToken(value)).toBe(false);
  const result = await transformWhoopStorageValue('labcharts-contract-imported', value, 'hydrate');
  expect(result.value).toBe(value); expect(result.storedValue).toBe(value); expect(result.migrated).toBe(false);
  expect(value.toString).not.toHaveBeenCalled();
});

it('retains byte-exact unrecognized/malformed payloads without requesting device storage', async () => {
  for (const value of [' {"entries": [ ], "n": 1e2}\n', 'not JSON', 'not JSON "whoop"', `"${DEVICE_PROTECTED_WEARABLE_MARKER}"`]) {
    for (const mode of ['hydrate', 'protect']) {
      const result = await transformWhoopStorageValue('labcharts-contract-imported', value, mode);
      expect(result).toEqual({value, storedValue: value, migrated: false});
    }
  }
});

it('an encrypted legacy source without the marker retains the original no-transform rule', async () => {
  const value = '{"wearableConnections":{"whoop":{"connectedAt":1}}}';
  expect(await transformWhoopStorageValue('labcharts-contract-imported', value, 'hydrate', true))
    .toEqual({value, storedValue: value, migrated: false});
});
