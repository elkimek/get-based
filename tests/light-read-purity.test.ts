// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { state } from '../js/state.js';
import { getSunDefaults } from '../js/sun-defaults.js';
import { getLightTodayHeroView, getLightTodayDashboardView } from '../js/light-today-ai.js';
import { createDefaultProfileData } from '../js/profile.js';
const previous = state.importedData;
afterEach(() => { state.importedData = previous; });
it('does not initialize setup or verdict records while reading empty Light views', () => {
  state.importedData = createDefaultProfileData(); state.importedData.sunDefaults = null; delete state.importedData.lightDailyVerdicts;
  const before = structuredClone(state.importedData);
  expect(getSunDefaults()).toEqual({}); getLightTodayHeroView(); getLightTodayDashboardView();
  expect(state.importedData).toEqual(before); expect(state.importedData).not.toHaveProperty('lightDailyVerdicts'); expect(state.importedData.sunDefaults).toBeNull();
});
it('preserves existing setup and unknown verdict metadata when projecting Light views', () => {
  state.importedData = createDefaultProfileData(); state.importedData.sunDefaults = { fitzpatrick: 'IV', homeLight: 'mixed' };
  state.importedData.lightDailyVerdicts = { legacy: { unknown: 'Retain opaque evidence' } };
  const before = structuredClone(state.importedData);
  expect(getSunDefaults()).toBe(state.importedData.sunDefaults); getLightTodayHeroView(); getLightTodayDashboardView();
  expect(state.importedData).toEqual(before);
});
