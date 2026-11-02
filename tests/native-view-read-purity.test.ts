// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { state } from '../js/state.js';
import { getEnvironment } from '../js/light-env-store.js';
import { getRoomEveningHoursAfterSunset } from '../js/light-env-evening.js';
import { getImportBenchmarks } from '../js/import-benchmarks.js';
const original = state.importedData;
afterEach(() => { state.importedData = original; });
it('renders an absent Light Environment without creating a profile field', () => {
  state.importedData = structuredClone(original); delete state.importedData.lightEnvironment;
  const before = structuredClone(state.importedData); expect(getEnvironment()).toEqual({ rooms: [], screens: [] }); expect(state.importedData).toEqual(before);
});
it('retains legacy evening data while presenting the same native hours', () => {
  state.importedData = structuredClone(original); state.importedData.lightEnvironment = { rooms: [{ id: 'legacy', eveningUseAfterSunset: true }], screens: [] };
  const before = structuredClone(state.importedData), room = getEnvironment()!.rooms![0]!;
  expect(getRoomEveningHoursAfterSunset(room)).toBe(2); expect(state.importedData).toEqual(before);
});
it('lists an absent benchmark history without creating or saving one', () => {
  state.importedData = structuredClone(original); delete state.importedData.importBenchmarks;
  const before = structuredClone(state.importedData); expect(getImportBenchmarks()).toEqual([]); expect(state.importedData).toEqual(before);
});
it('isolates benchmark presentation from the stored history', () => {
  state.importedData = structuredClone(original); state.importedData.importBenchmarks = [{ id: 'benchmark', status: 'preview', benchmarkAt: 1, diagnostics: { retained: true } }];
  const before = structuredClone(state.importedData), rows = getImportBenchmarks(); rows[0]!.status = 'failed';
  expect(state.importedData).toEqual(before);
});
