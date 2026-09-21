import { afterEach, expect, it } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { buildBiologyProfileContext } from '../js/profile-context.js';
const original = { importedData: state.importedData, profileSex: state.profileSex, profileDob: state.profileDob };
afterEach(() => Object.assign(state, original));
function profile() {
  return { importedData: createDefaultProfileData(), profileSex: 'female', profileDob: '1980-01-01' };
}
it('computes from the supplied profile independently of the active profile', () => {
  const snapshot = profile();
  snapshot.importedData.diagnoses = { flags: { lowMuscleMass: true } };
  state.importedData = createDefaultProfileData();
  state.profileSex = 'male'; state.profileDob = '2000-01-01';
  const context = buildBiologyProfileContext(snapshot, { now: new Date('2026-09-21T12:00:00Z') });
  expect(context).toMatchObject({ sex: 'female', ageYears: 46, lowMuscleMass: true });
  expect(state.importedData.diagnoses).toBeNull();
});
it('honors only the supplied profile context toggles', () => {
  const snapshot = profile();
  snapshot.importedData.contextSourceSettings = { 'insight-cards': false, 'light-sun': false, wearables: false };
  snapshot.importedData.diagnoses = { flags: { lowMuscleMass: true } };
  state.importedData = createDefaultProfileData();
  const context = buildBiologyProfileContext(snapshot);
  expect(context.lowMuscleMass).toBe(false);
  expect(context.light.includeLight).toBe(false);
  expect(context.body.includeBody).toBe(false);
});
it('uses supplied light totals and time without touching the input snapshot', () => {
  const snapshot = profile();
  const now = new Date('2026-09-21T12:00:00Z');
  snapshot.importedData.sunSessions = [{ endedAt: now.getTime(), doses: {} }];
  const before = structuredClone(snapshot);
  const context = buildBiologyProfileContext(snapshot, { now, lightDeps: { rollingVitaminDIU: () => 5000, rollingChannelTotals: () => ({ circadian: 100 }) } });
  expect(context.light).toMatchObject({ vitD7: 5000, circadian7: 100, lowVitaminDSynthesis: false });
  expect(snapshot).toEqual(before);
});
it('retains explicit toggle override behavior for deterministic score review', () => {
  const snapshot = profile();
  snapshot.importedData.contextSourceSettings = { 'insight-cards': false };
  snapshot.importedData.diagnoses = { flags: { lowMuscleMass: true } };
  expect(buildBiologyProfileContext(snapshot, { ignoreContextToggles: true }).lowMuscleMass).toBe(true);
});
