// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { emfAssessmentLauncherView } from '../js/context-emf-launcher-model.js';
import { renderEMFAssessmentLauncher } from '../js/context-card-summaries.js';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { readProfileForLoad } from '../js/profile-load-safety.js';
import { rememberProfileData, adoptProfileData, rebaseLiveProfileData } from '../js/profile-data-writes.js';
import { createLifestyleFormSession } from '../js/context-lifestyle-form-session.js';
import { lifestyleDraft, lifestyleFields, lifestyleFormModel, applyLifestyleDraft, toggleLifestyleChoice, lifestyleSectionSummary } from '../js/context-lifestyle-form-model.js';
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
for (const key of ['sleepRest', 'exercise', 'stress', 'loveLife', 'diet', 'environment', 'lightCircadian'] as const) {
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

// Meal descriptions and clock display are distinct from the canonical stored times.
it('preserves every meal, 12h/24h times, legacy estimates and canonical fluid values', () => {
  localStorage.setItem('labcharts-time-format', '12h');
  try {
    state.importedData.diet = { proteinIntake: 'old protein estimate', hydration: 'old fluid estimate', breakfast: 'eggs', breakfastTime: '00:15', lunch: 'salad', lunchTime: '12:00', dinner: 'fish', dinnerTime: '20:30', snacks: 'nuts', snacksTime: '15:45' };
    const model = lifestyleFormModel('diet', state.importedData, null, { unitSystem: 'US', mealsPaused: true });
    const draft = lifestyleDraft(model, state.importedData);
    expect(draft).toMatchObject({ proteinIntake: 'old protein estimate', hydration: 'old fluid estimate', breakfastTime: '12:15 AM', lunchTime: '12:00 PM', dinnerTime: '8:30 PM', snacksTime: '3:45 PM' });
    const hydration = lifestyleFields(model).find(field => field.key === 'hydration')!;
    expect(hydration.options).toContainEqual({ value: '2–3 L/day', label: '68–101 fl oz/day' });
    expect(hydration.options).toContainEqual({ value: 'old fluid estimate', label: 'Previous estimate: old fluid estimate' });
    expect(lifestyleSectionSummary(model.sections[1]!, draft)).toBe('Paused — detailed log active');
    expect(model.sections[1]!.meals?.timePlaceholder).toBe('H:MM AM');
    toggleLifestyleChoice(hydration, draft, '2–3 L/day'); draft.note = '  retained  ';
    applyLifestyleDraft(state.importedData, 'diet', draft);
    expect(state.importedData.diet).toMatchObject({ proteinIntake: 'old protein estimate', hydration: '2–3 L/day', breakfast: 'eggs', breakfastTime: '00:15', lunch: 'salad', lunchTime: '12:00', dinner: 'fish', dinnerTime: '20:30', snacks: 'nuts', snacksTime: '15:45', note: 'retained' });
    localStorage.setItem('labcharts-time-format', '24h');
    expect(lifestyleDraft(model, state.importedData).dinnerTime).toBe('20:30');
    expect(lifestyleSectionSummary(lifestyleFormModel('diet', state.importedData, null).sections[1]!, draft)).toBe('Breakfast · Lunch · Dinner · Snacks');
  } finally { localStorage.removeItem('labcharts-time-format'); }
});
it('keeps time-only diet drafts empty and rejects invalid time strings without losing meal descriptions', () => {
  applyLifestyleDraft(state.importedData, 'diet', { breakfastTime: '7:15 AM' }); expect(state.importedData.diet).toBeNull();
  applyLifestyleDraft(state.importedData, 'diet', { breakfast: '  eggs  ', breakfastTime: '25:99', dinnerTime: '8PM' });
  expect(state.importedData.diet).toMatchObject({ breakfast: 'eggs', breakfastTime: '', dinnerTime: '20:00' });
});

it('retains meaningful Diet disclosure summaries without describing absent symptoms as present', () => {
  const model = lifestyleFormModel('diet', state.importedData, null);
  expect(lifestyleSectionSummary(model.sections[0]!, { alcohol: 'rare', caffeine: '1 cup' })).toBe('alcohol: rare · caffeine: 1 cup');
  expect(lifestyleSectionSummary(model.sections[2]!, { bloating: 'none', gas: 'none', acidReflux: 'never' })).toBe('Optional symptoms and sensitivities');
  expect(lifestyleSectionSummary(model.sections[2]!, { bloating: 'mild', gas: 'moderate', foodSensitivities: ['dairy'] })).toBe('mild bloating · moderate gas · dairy');
});

it('keeps hidden legacy EMF values and assessment data through Environment save and clear', () => {
  state.importedData.environment = { emf: ['Legacy <source>'], emfMitigation: ['Legacy mitigation'], note: 'Old note' };
  state.importedData.emfAssessment = { assessments: [{ date: '2026-10-07', rooms: [{ sleeping: true, measurements: { acElectric: { value: 50 } } }] }] };
  const assessment = structuredClone(state.importedData.emfAssessment);
  const model = lifestyleFormModel('environment', state.importedData, null), draft = lifestyleDraft(model, state.importedData);
  expect(lifestyleFields(model).map(field => field.id)).not.toContain('env-emf');
  expect(draft).toMatchObject({ emf: ['Legacy <source>'], emfMitigation: ['Legacy mitigation'] });
  expect(model.sections[2]!.emf).toMatchObject({ count: 1, hasAssessments: true, title: 'Open EMF assessment' });
  expect(model.sections[2]!.emf?.summary).toContain('Extreme concern');
  expect(lifestyleSectionSummary(model.sections[2]!, draft)).toBe('1 saved assessment · Legacy <source> · Legacy mitigation');
  draft.note = '  New note  '; applyLifestyleDraft(state.importedData, 'environment', draft);
  expect(state.importedData.environment).toMatchObject({ emf: ['Legacy <source>'], emfMitigation: ['Legacy mitigation'], note: 'New note' });
  applyLifestyleDraft(state.importedData, 'environment', null);
  expect(state.importedData.environment).toBeNull(); expect(state.importedData.emfAssessment).toEqual(assessment);
});
it('uses one authored EMF launcher for the synchronous HTML contract, with escaped text and delegated actions', () => {
  expect(emfAssessmentLauncherView([])).toMatchObject({ count: 0, hasAssessments: false, title: 'Start EMF assessment' });
  state.importedData.emfAssessment = { assessments: [{ date: '<img src=x onerror=bad>' }] };
  const template = document.createElement('template'); template.innerHTML = renderEMFAssessmentLauncher({ inModal: true, surface: 'literal" onmouseover="bad' });
  const button = template.content.querySelector('button')!;
  expect(button.textContent).toContain('<img src=x onerror=bad>'); expect(template.content.querySelector('img, script')).toBeNull();
  expect(button.dataset.contextCardAction).toBe('open-emf-assessment'); expect(button.dataset.contextCardCloseModal).toBe('true');
  expect(button.dataset.umamiEvent).toBe('emf-launcher-literal" onmouseover="bad'); expect(button.hasAttribute('onclick')).toBe(false); expect(button.hasAttribute('onmouseover')).toBe(false);
});
it('Light retains its stored skin type without copying the read-only setup fallback into context', () => {
  state.importedData.sunDefaults = { fitzpatrick: 'III', homeLight: 'led-warm', eyewear: 'sunglasses', ottScore: 4 };
  const model = lifestyleFormModel('lightCircadian', state.importedData, null, { latitude: 'Temperate' });
  expect(model.latitude).toBe('Temperate');
  expect(model.lightSetup?.rows).toEqual([{ label: 'Skin type', value: 'III' }, { label: 'Home lighting', value: 'Mostly LED — warm white (2700–3000K)' }, { label: 'Eyewear outside', value: 'Sunglasses outdoors' }]);
  const draft = lifestyleDraft(model, state.importedData); expect(draft.skinType).toBeNull();
  applyLifestyleDraft(state.importedData, 'lightCircadian', draft); expect(state.importedData.lightCircadian).toBeNull();
  state.importedData.lightCircadian = { skinType: 'Legacy <skin> & type' };
  const stored = lifestyleDraft(lifestyleFormModel('lightCircadian', state.importedData, null), state.importedData);
  expect(stored.skinType).toBe('Legacy <skin> & type'); stored.note = 'Updated';
  applyLifestyleDraft(state.importedData, 'lightCircadian', stored);
  expect(state.importedData.lightCircadian).toMatchObject({ skinType: 'Legacy <skin> & type', note: 'Updated' });
  applyLifestyleDraft(state.importedData, 'lightCircadian', null);
  expect(state.importedData.lightCircadian).toBeNull(); expect(state.importedData.sunDefaults).toMatchObject({ fitzpatrick: 'III', ottScore: 4 });
});
it('Light setup projection preserves zero and all burden tiers, skipped state and unknown literal labels', () => {
  const project = () => lifestyleFormModel('lightCircadian', state.importedData, null).lightSetup!;
  expect(project().populated).toBe(false);
  for (const [score, tier, label] of [[0, 0, 'no patterns selected'], [1, 1, 'a few patterns to explore'], [2, 1, 'a few patterns to explore'], [4, 2, 'several patterns to explore'], [6, 3, 'many patterns to review'], [10, 4, 'broad light-context mismatch']] as const) {
    state.importedData.sunDefaults = { ottScore: score };
    expect(project().populated).toBe(true); expect(project().burden).toEqual({ label, tier });
  }
  state.importedData.sunDefaults = { skipped: true, homeLight: '<img src=x>', eyewear: 'Legacy & lens' };
  expect(project().burden).toEqual({ label: 'skipped', tier: null });
  expect(project().rows.map(row => row.value)).toEqual(['—', '<img src=x>', 'Legacy & lens']);
});

it('projects literal multiline interpretive lens text and serializes trimmed strings without extra note fields', () => {
  state.importedData.interpretiveLens = '  Framework <literal> & text\nSecond line  ';
  const model = lifestyleFormModel('interpretiveLens', state.importedData, null), draft = lifestyleDraft(model, state.importedData);
  expect(model).toMatchObject({ title: 'Interpretive Lens', backToContext: true, fields: [], sections: [], textField: { id: 'interpretive-lens-textarea', label: 'Interpretive lens' } });
  expect(draft).toEqual({ text: state.importedData.interpretiveLens });
  applyLifestyleDraft(state.importedData, 'interpretiveLens', draft); expect(state.importedData.interpretiveLens).toBe('Framework <literal> & text\nSecond line');
  applyLifestyleDraft(state.importedData, 'interpretiveLens', { text: '   ' }); expect(state.importedData.interpretiveLens).toBe('');
  applyLifestyleDraft(state.importedData, 'interpretiveLens', null); expect(state.importedData.interpretiveLens).toBe('');
});
it('commits accepted lens text and history to its originating profile after closure and switching', async () => {
  const origin = state.importedData, profile = state.currentProfile, pending = deferred(); mocks.save.mockReturnValueOnce(pending.promise);
  const session = createLifestyleFormSession('interpretiveLens'), saving = session.save({ text: '  Origin <lens>  ' });
  expect(origin.interpretiveLens).toBe(''); expect(origin.changeHistory).toEqual([]); expect(await session.save({ text: 'Duplicate' })).toBe('busy'); session.retire();
  state.currentProfile = 'other-lens'; state.importedData = createDefaultProfileData(); state.importedData.interpretiveLens = 'Other profile'; rememberProfileData(state.importedData);
  pending.resolve(true); expect(await saving).toBe('saved'); expect(origin.interpretiveLens).toBe('Origin <lens>'); expect(origin.changeHistory).toEqual([expect.objectContaining({ field: 'interpretiveLens', snapshot: 'Origin <lens>' })]);
  expect(state.importedData.interpretiveLens).toBe('Other profile'); expect(mocks.contextChanged).not.toHaveBeenCalled();
  expect(mocks.save).toHaveBeenCalledWith(profile, expect.anything(), expect.objectContaining({ expectedContextField: { key: 'interpretiveLens', value: '' } }));
});
it('retains failed lens input and reports peer conflicts without publishing draft text', async () => {
  const session = createLifestyleFormSession('interpretiveLens'), draft = { text: 'Retry lens' }; mocks.save.mockResolvedValueOnce(false);
  expect(await session.save(draft)).toBe('failed'); expect(state.importedData.interpretiveLens).toBe(''); expect(draft.text).toBe('Retry lens');
  mocks.save.mockImplementationOnce((_profile, _draft, options: ProfileSaveOptions) => { options.onContextFieldConflict?.(); return false; });
  expect(await session.save(draft)).toBe('conflict'); expect(state.importedData.changeHistory).toEqual([]);
  expect(await session.save(draft)).toBe('saved'); expect(state.importedData.interpretiveLens).toBe('Retry lens');
});
it('clears a saved lens as the existing empty-string contract and records its committed history', async () => {
  state.importedData.interpretiveLens = 'Saved framework'; rememberProfileData(state.importedData);
  expect(await createLifestyleFormSession('interpretiveLens').save(null)).toBe('saved'); expect(state.importedData.interpretiveLens).toBe('');
  expect(state.importedData.changeHistory).toEqual([expect.objectContaining({ field: 'interpretiveLens', snapshot: '' })]);
});
