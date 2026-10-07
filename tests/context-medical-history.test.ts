// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { rememberProfileData, adoptProfileData, rebaseLiveProfileData } from '../js/profile-data-writes.js';
import { createMedicalHistorySession } from '../js/context-medical-history-session.js';
import { medicalHistoryDraft, medicalHistoryValue, conditionValue, familyHistoryValue, familyHistoryRows, conditionSuggestions, INTERPRETATION_FLAGS, FAMILY_RELATIVES } from '../js/context-medical-history-model.js';
import type { ProfileData } from '../types/app-state.js';
import type { ProfileSaveOptions } from '../js/data-core-types.js';
const mocks = vi.hoisted(() => ({ save: vi.fn(), contextChanged: vi.fn() }));
vi.mock('../js/data.js', async load => ({ ...await load<Record<string, unknown>>(), saveImportedDataForProfile: async (profile: string, draft: ProfileData, options: ProfileSaveOptions) => {
  const result = await mocks.save(profile, draft, options);
  if (result) {
    if (profile === state.currentProfile) { const rebased = rebaseLiveProfileData(options.baseData, state.importedData, draft); adoptProfileData(state.importedData, rebased.data); rememberProfileData(state.importedData, rebased.baseline); }
    rememberProfileData(draft);
  }
  return result;
}, notifyProfileDataContextChanged: mocks.contextChanged }));
let sequence = 0;
beforeEach(() => { vi.resetAllMocks(); mocks.save.mockResolvedValue(true); state.currentProfile = `medical-unit-${++sequence}`; state.importedData = createDefaultProfileData(); rememberProfileData(state.importedData); });
it('normalizes empty/legacy shapes without mutating input or losing extensions', () => {
  expect(medicalHistoryValue(medicalHistoryDraft(null))).toBeNull();
  const original = { conditions: [{ name: '<literal>', source: { id: 'legacy' } }], extra: ['retained'], flags: { futureFlag: false }, note: '  note  ', proceduresNote: '  procedure  ' };
  const draft = medicalHistoryDraft(original); draft.conditions[0]!.name = 'Changed';
  expect(original.conditions[0]!.name).toBe('<literal>'); expect(medicalHistoryValue(draft)).toEqual({ ...original, conditions: [{ ...original.conditions[0], name: 'Changed' }], note: 'note', proceduresNote: 'procedure', familyHistory: [] });
});
it('retains family-only, notes-only, procedures-only and every interpretation flag', () => {
  for (const partial of [{ familyHistory: [{ relative: 'father', condition: 'MI' }] }, { note: ' note ' }, { proceduresNote: ' procedure ' }, ...INTERPRETATION_FLAGS.map(([key]) => ({ flags: { [key]: true } }))]) expect(medicalHistoryValue(medicalHistoryDraft(partial))).not.toBeNull();
});
it('validates condition names and edits known fields while retaining row metadata', () => {
  expect(conditionValue({ name: ' ', severity: '', status: '', since: '' })).toBeNull();
  expect(conditionValue({ name: ' <literal> ', severity: 'major', status: 'controlled', since: ' 2020 ' }, { name: 'old', source: { id: 'original' }, since: '2019' })).toEqual({ name: '<literal>', severity: 'major', status: 'controlled', since: '2020', source: { id: 'original' } });
  expect(conditionValue({ name: 'new', severity: '', status: '', since: '' }, { name: 'old', since: '2019', status: 'active' })).toEqual({ name: 'new', severity: 'mild' });
});
it('allows every relative, rejects tampering, clamps onset age, and preserves legacy row metadata', () => {
  for (const relative of FAMILY_RELATIVES) expect(familyHistoryValue({ relative: relative.key, condition: "Alzheimer's Disease", age: '130', note: ' note ' })).toEqual({ relative: relative.key, condition: "Alzheimer's Disease", onsetAge: 120, note: 'note' });
  expect(familyHistoryValue({ relative: 'mother', condition: 'MI', age: '-1', note: '' })?.onsetAge).toBe(0);
  expect(familyHistoryValue({ relative: 'mother', condition: 'MI', age: 'invalid', note: '' })?.onsetAge).toBeUndefined();
  expect(familyHistoryValue({ relative: '__tampered', condition: 'MI', age: '', note: '' })).toBeNull();
  expect(familyHistoryValue({ relative: 'mother', condition: ' ', age: '', note: '' })).toBeNull();
  expect(familyHistoryValue({ relative: 'legacy_relative', condition: 'new', age: '', note: '' }, { relative: 'legacy_relative', condition: 'old', source: 'peer' })).toEqual({ relative: 'legacy_relative', condition: 'new', source: 'peer' });
});
it('sorts relatives for display without changing their storage indices', () => {
  const draft = medicalHistoryDraft({ familyHistory: [{ relative: 'paternal_relative', condition: 'A' }, { relative: 'mother', condition: 'B' }, { relative: 'unknown', condition: 'C' }] });
  expect(familyHistoryRows(draft).map(row => row.index)).toEqual([1, 0, 2]); expect(draft.familyHistory[0]!.relative).toBe('paternal_relative');
});
it('filters patient suggestions by sex and duplicates while keeping family suggestions inclusive', () => {
  const draft = medicalHistoryDraft({ conditions: [{ name: "Alzheimer's Disease" }] });
  expect(conditionSuggestions('alzheimer', draft, 'female')).not.toContain("Alzheimer's Disease"); expect(conditionSuggestions('alzheimer', draft, 'male', true)).toContain("Alzheimer's Disease");
  expect(conditionSuggestions('PCOS', draft, 'male')).toEqual([]); expect(conditionSuggestions('PCOS', draft, 'female')).toContain('PCOS'); expect(conditionSuggestions('PCOS', draft, 'male', true)).toContain('PCOS');
  expect(conditionSuggestions('', draft, 'female')).toEqual([]); expect(conditionSuggestions('a', draft, 'female').length).toBeLessThanOrEqual(8);
});
it('awaits captured storage before publishing diagnoses and history, and refuses duplicate commits', async () => {
  let resolve!: (value: boolean) => void; mocks.save.mockReturnValueOnce(new Promise<boolean>(done => { resolve = done; }));
  const session = createMedicalHistorySession(), draft = medicalHistoryDraft({ note: 'Pending' }), pending = session.save(draft);
  expect(state.importedData.diagnoses).toBeNull(); expect(state.importedData.changeHistory).toEqual([]); expect(await session.save(draft)).toBe('busy');
  resolve(true); expect(await pending).toBe('saved'); expect(state.importedData.diagnoses?.note).toBe('Pending'); expect(state.importedData.changeHistory).toEqual([expect.objectContaining({ field: 'diagnoses', snapshot: expect.objectContaining({ note: 'Pending' }) })]); expect(await session.save(draft)).toBe('busy');
  expect(mocks.save.mock.calls[0]![2].expectedContextField).toEqual({ key: 'diagnoses', value: null });
});
it('retains a failed draft for retry and preserves unrelated unsaved changes', async () => {
  const session = createMedicalHistorySession(), draft = medicalHistoryDraft({ note: 'Retry' }); state.importedData.interpretiveLens = 'Unsaved'; mocks.save.mockResolvedValueOnce(false);
  expect(await session.save(draft)).toBe('failed'); expect(state.importedData.changeHistory).toEqual([]); expect(state.importedData.diagnoses).toBeNull();
  expect(await session.save(draft)).toBe('saved'); expect(state.importedData.interpretiveLens).toBe('Unsaved'); expect(mocks.save.mock.calls[1]![1].interpretiveLens).toBe('');
});
it('reports locked peer conflicts without adopting the unsaved draft', async () => {
  mocks.save.mockImplementationOnce((_profile, _draft, options: ProfileSaveOptions) => { options.onContextFieldConflict?.(); return false; });
  expect(await createMedicalHistorySession().save(medicalHistoryDraft({ note: 'stale' }))).toBe('conflict'); expect(state.importedData.diagnoses).toBeNull(); expect(mocks.contextChanged).not.toHaveBeenCalled();
});
it('finishes an accepted write on its origin after retirement and a profile switch', async () => {
  let resolve!: (value: boolean) => void; mocks.save.mockReturnValueOnce(new Promise<boolean>(done => { resolve = done; }));
  const origin = state.importedData, profile = state.currentProfile, session = createMedicalHistorySession(), pending = session.save(medicalHistoryDraft({ note: 'Original' })); session.retire();
  state.currentProfile = 'another-medical-profile'; state.importedData = createDefaultProfileData(); rememberProfileData(state.importedData); resolve(true);
  expect(await pending).toBe('saved'); expect(origin.diagnoses?.note).toBe('Original'); expect(state.importedData.diagnoses).toBeNull(); expect(mocks.save.mock.calls[0]![0]).toBe(profile); expect(mocks.contextChanged).not.toHaveBeenCalled();
});
it('refuses unaccepted retired and replaced-profile controls', async () => {
  const session = createMedicalHistorySession(); session.retire(); expect(await session.save(null)).toBe('retired');
  const replaced = createMedicalHistorySession(); state.importedData = createDefaultProfileData(); expect(await replaced.save(null)).toBe('retired'); expect(mocks.save).not.toHaveBeenCalled();
});
