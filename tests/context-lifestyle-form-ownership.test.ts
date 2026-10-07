// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { readProfileForLoad } from '../js/profile-load-safety.js';
import { rememberProfileData, adoptProfileData, rebaseLiveProfileData } from '../js/profile-data-writes.js';
import { createLifestyleFormSession } from '../js/context-lifestyle-form-session.js';
import { lifestyleDraft, lifestyleFields, lifestyleFormModel, applyLifestyleDraft, toggleLifestyleChoice } from '../js/context-lifestyle-form-model.js';
import type { ProfileData } from '../types/app-state.js';
import type { ProfileSaveOptions } from '../js/data-core-types.js';
const mocks = vi.hoisted(() => ({ save: vi.fn(), contextChanged: vi.fn() }));
vi.mock('../js/data.js', async load => ({ ...await load<Record<string, unknown>>(),
  saveImportedDataForProfile: async (profile: string, draft: ProfileData, options: ProfileSaveOptions) => {
    const saved = await mocks.save(profile, draft, options);
    if (saved) {
      if (profile === state.currentProfile) {
        const result = rebaseLiveProfileData(options.baseData, state.importedData, draft);
        adoptProfileData(state.importedData, result.data); rememberProfileData(state.importedData, result.baseline);
      }
      rememberProfileData(draft);
    }
    return saved;
  }, notifyProfileDataContextChanged: mocks.contextChanged,
}));
let sequence = 0;
beforeEach(() => { vi.resetAllMocks(); mocks.save.mockResolvedValue(true); state.currentProfile = `form-origin-${++sequence}`; state.importedData = createDefaultProfileData(); rememberProfileData(state.importedData); });
afterEach(() => vi.restoreAllMocks());
function deferred() { let resolve!: (saved: boolean) => void; const promise = new Promise<boolean>(done => { resolve = done; }); return { promise, resolve }; }
for (const key of ['sleepRest', 'exercise', 'stress', 'loveLife'] as const) {
  it(`${key} round trips every field, preserves option values and empties to null`, () => {
    const model = lifestyleFormModel(key, state.importedData, 'female'), draft = lifestyleDraft(model, state.importedData);
    for (const field of lifestyleFields(model)) {
      for (const option of field.options) {
        toggleLifestyleChoice(field, draft, option.value);
        expect(field.multiple ? draft[field.key] : draft[field.key]).toEqual(field.multiple ? [option.value] : option.value);
        toggleLifestyleChoice(field, draft, option.value);
        expect(draft[field.key]).toEqual(field.multiple ? [] : null);
      }
      toggleLifestyleChoice(field, draft, field.options[0]!.value);
    }
    draft.note = '  Literal <draft> & text  ';
    applyLifestyleDraft(state.importedData, key, draft);
    const read = lifestyleDraft(model, state.importedData);
    expect(read).toEqual({ ...draft, note: 'Literal <draft> & text' });
    applyLifestyleDraft(state.importedData, key, lifestyleDraft(model, createDefaultProfileData()));
    expect(state.importedData[key]).toBeNull();
  });
  it(`${key} does not publish data or history until storage commits`, async () => {
    const pending = deferred(); mocks.save.mockReturnValueOnce(pending.promise);
    const session = createLifestyleFormSession(key), save = session.save({ note: 'Awaiting commit' });
    expect(state.importedData[key]).toBeNull(); expect(state.importedData.changeHistory).toEqual([]);
    expect(await session.save({ note: 'Duplicate' })).toBe('busy');
    pending.resolve(true); expect(await save).toBe('saved');
    expect(state.importedData[key]).toMatchObject({ note: 'Awaiting commit' });
    expect(state.importedData.changeHistory).toEqual([expect.objectContaining({ field: key, snapshot: expect.objectContaining({ note: 'Awaiting commit' }) })]);
    expect(await session.save({ note: 'Duplicate after commit' })).toBe('busy'); expect(mocks.save).toHaveBeenCalledTimes(1);
  });
}
it('keeps an accepted write on its originating profile after switching away', async () => {
  const origin = state.importedData, profile = state.currentProfile, pending = deferred(); mocks.save.mockReturnValueOnce(pending.promise);
  const session = createLifestyleFormSession('exercise'), saving = session.save({ note: 'Original' }); session.retire();
  state.currentProfile = 'form-other'; state.importedData = createDefaultProfileData(); state.importedData.contextNotes = 'Other'; rememberProfileData(state.importedData);
  pending.resolve(true); expect(await saving).toBe('saved');
  expect(mocks.save).toHaveBeenCalledWith(profile, expect.objectContaining({ exercise: expect.objectContaining({ note: 'Original' }) }), expect.objectContaining({ forceProfileScope: true }));
  expect(origin.exercise).toMatchObject({ note: 'Original' }); expect(state.importedData.exercise).toBeNull(); expect(state.importedData.contextNotes).toBe('Other'); expect(mocks.contextChanged).not.toHaveBeenCalled();
});
it('rejects unaccepted retired or replaced-profile controls', async () => {
  const retired = createLifestyleFormSession('stress'); retired.retire(); expect(await retired.save({ note: 'Old' })).toBe('retired');
  const replaced = createLifestyleFormSession('stress'); state.importedData = createDefaultProfileData(); expect(await replaced.save({ note: 'Old' })).toBe('retired'); expect(mocks.save).not.toHaveBeenCalled();
});
it('retains failed drafts and retries without publishing history or false success', async () => {
  const session = createLifestyleFormSession('sleepRest'), draft = { note: 'Retained draft' };
  mocks.save.mockResolvedValueOnce(false); expect(await session.save(draft)).toBe('failed'); expect(draft.note).toBe('Retained draft'); expect(state.importedData.sleepRest).toBeNull(); expect(state.importedData.changeHistory).toEqual([]);
  expect(await session.save(draft)).toBe('saved'); expect(state.importedData.sleepRest).toMatchObject({ note: 'Retained draft' });
});
it('retains retry state after a thrown storage operation', async () => {
  const session = createLifestyleFormSession('stress'); mocks.save.mockRejectedValueOnce(new Error('Storage unavailable'));
  expect(await session.save({ note: 'Retry' })).toBe('failed'); expect(await session.save({ note: 'Retry' })).toBe('saved');
});
it('saves only the edited context against its baseline and preserves unrelated unsaved values', async () => {
  const session = createLifestyleFormSession('exercise'); state.importedData.interpretiveLens = 'Unsaved lens';
  expect(await session.save({ note: 'Exercise' })).toBe('saved'); expect(mocks.save.mock.calls[0]![1].interpretiveLens).toBe(''); expect(state.importedData.interpretiveLens).toBe('Unsaved lens');
});
it('reports observed-field conflicts without adopting a draft', async () => {
  mocks.save.mockImplementationOnce((_profile, _draft, options: ProfileSaveOptions) => { options.onContextFieldConflict?.(); return false; });
  expect(await createLifestyleFormSession('loveLife').save({ note: 'Stale' })).toBe('conflict'); expect(state.importedData.loveLife).toBeNull(); expect(mocks.contextChanged).not.toHaveBeenCalled();
});
it('blocks saves after a failed profile read', async () => {
  const profile = state.currentProfile, session = createLifestyleFormSession('stress');
  await expect(readProfileForLoad(profile, () => { throw new Error('Failed read'); }, () => {})).rejects.toThrow('Failed read');
  try { expect(await session.save({ note: 'Retained' })).toBe('blocked'); expect(mocks.save).not.toHaveBeenCalled(); }
  finally { await readProfileForLoad(profile, () => true, () => {}); }
});
it('preserves none exclusivity and mutually exclusive sleep practices', () => {
  const model = lifestyleFormModel('sleepRest', state.importedData, null), draft = lifestyleDraft(model, state.importedData);
  const field = { key: 'practices', id: 'practices', label: 'Practices', multiple: true, options: ['screen in bed', 'no screens 1-2h before bed'].map(value => ({ value, label: value })) };
  toggleLifestyleChoice(field, draft, 'screen in bed'); toggleLifestyleChoice(field, draft, 'no screens 1-2h before bed');
  expect(draft.practices).toEqual(['no screens 1-2h before bed']);
  const issues = { ...field, key: 'issues', options: ['snoring', 'none'].map(value => ({ value, label: value })) };
  toggleLifestyleChoice(issues, draft, issues.options.find(option => option.value !== 'none')!.value); toggleLifestyleChoice(issues, draft, 'none'); expect(draft.issues).toEqual(['none']);
});
it('retains wearable mismatch information and sex-specific concerns', () => {
  state.importedData.sleepRest = { duration: '7-8h', quality: 'excellent' };
  state.importedData.wearableSummary = { metrics: { sleep_total_min: { rolling: { d7: 315 } }, sleep_score: { rolling: { d7: 61 } } } };
  expect(lifestyleFormModel('sleepRest', state.importedData, null).mismatch).toContain('5.3h'); expect(lifestyleFormModel('sleepRest', state.importedData, null).mismatch).toContain('61/100');
  const concerns = (sex: string) => lifestyleFields(lifestyleFormModel('loveLife', state.importedData, sex)).find(field => field.key === 'concerns')!.options.map(option => option.value);
  expect(concerns('female')).not.toContain('erectile issues'); expect(concerns('female')).toContain('vaginal dryness'); expect(concerns('male')).toContain('erectile issues'); expect(concerns('male')).not.toContain('vaginal dryness');
});

it('does not report a committed write as failed when a presentation hook throws', async () => {
  mocks.contextChanged.mockImplementationOnce(() => { throw new Error('Presentation unavailable'); });
  const session = createLifestyleFormSession('stress'); expect(await session.save({ note: 'Committed' })).toBe('saved');
  expect(state.importedData.stress).toMatchObject({ note: 'Committed' }); expect(await session.save({ note: 'Duplicate' })).toBe('busy');
});
