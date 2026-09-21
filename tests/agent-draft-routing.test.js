import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ save: vi.fn(), marker: vi.fn(), meal: vi.fn(), bp: vi.fn(), metric: vi.fn(), resolve: vi.fn() }));
vi.mock('../js/data.js', () => ({ saveImportedDataForProfile: mocks.save }));
vi.mock('../js/profile.js', () => ({ getActiveProfileId: () => 'a' }));
vi.mock('../js/marker-detail-store.js', () => ({ saveMarkerNoteText: mocks.marker }));
vi.mock('../js/nutrition-store.js', () => ({ saveActiveProfileMeal: mocks.meal }));
vi.mock('../js/wearables-manual.js', () => ({ logManualBP: mocks.bp, logManualMetric: mocks.metric }));
vi.mock('../js/agent-tool-bindings.js', () => ({ resolveAgentMarker: mocks.resolve }));
import { state } from '../js/state.js';
import { applyAgentDraft } from '../js/agent-drafts.js';

const proposal = (kind, payload) => ({ profileId: 'a', status: 'pending', kind, payload });
const writes = () => [mocks.save, mocks.marker, mocks.meal, mocks.bp, mocks.metric];
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-21T12:00:00Z'));
  state.importedData = { entries: [], contextNotes: 'Existing', markerNotes: { 'biochemistry.glucose': 'Existing marker note' }, supplements: [] };
  mocks.save.mockResolvedValue(true);
  mocks.marker.mockResolvedValue({});
  mocks.meal.mockImplementation(async meal => meal);
  mocks.resolve.mockReturnValue({ row: { key: 'biochemistry.glucose', name: 'Glucose' }, matches: [] });
});
afterEach(() => vi.useRealTimers());

it.each([null, { status: 'applied' }, { status: 'applying' }, { status: 'failed' }, { status: 'discarded' }, { ...proposal('note', {}), profileId: '' }, proposal('unknown', {})])('rejects an ineligible proposal before all mutation boundaries: %j', async draft => {
  await expect(applyAgentDraft(draft)).rejects.toThrow();
  for (const write of writes()) expect(write).not.toHaveBeenCalled();
});
it.each([
  [[], 'no longer available'],
  [[{ key: 'one' }, { key: 'two' }], 'unambiguous'],
])('rejects an unavailable or ambiguous marker without writing: %j', async (matches, error) => {
  mocks.resolve.mockReturnValue({ row: null, matches });
  await expect(applyAgentDraft(proposal('note', { scope: 'marker', marker: 'ambiguous', text: 'New' }))).rejects.toThrow(error);
  for (const write of writes()) expect(write).not.toHaveBeenCalled();
});
it.each([['append', 'Existing marker note\n\nNew'], ['replace', 'New']])('preserves marker-note %s semantics', async (mode, expected) => {
  await expect(applyAgentDraft(proposal('note', { scope: 'marker', marker: 'Glucose', mode, text: 'New' }))).resolves.toContain('Glucose');
  expect(mocks.marker).toHaveBeenCalledExactlyOnceWith('biochemistry.glucose', expected);
  expect(mocks.save).not.toHaveBeenCalled();
});
it('replaces profile context on an isolated draft while preserving the merge baseline', async () => {
  const before = structuredClone(state.importedData);
  await applyAgentDraft(proposal('note', { scope: 'profile', mode: 'replace', text: 'Replacement' }));
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith('a', { ...before, contextNotes: 'Replacement' }, { baseData: before });
  expect(state.importedData).toEqual(before);
});
it('rejects an invalid meal timestamp without attempting storage', async () => {
  await expect(applyAgentDraft(proposal('meal', { name: 'Lunch', eatenAt: 'invalid' }))).rejects.toThrow('time is invalid');
  expect(mocks.meal).not.toHaveBeenCalled();
});
it('retains reviewed meal nutrients, provenance, and local time derived from the same instant', async () => {
  const payload = { name: 'Lunch', mealType: 'lunch', eatenAt: '2026-09-20T18:15:00+02:00', nutrients: { protein: 24, calories: 400 }, note: 'User reviewed' };
  await expect(applyAgentDraft(proposal('meal', payload))).resolves.toContain('Lunch');
  const saved = mocks.meal.mock.calls[0][0];
  const instant = new Date(payload.eatenAt);
  expect(saved).toMatchObject({ name: 'Lunch', mealType: 'lunch', eatenAt: instant.toISOString(), nutrients: payload.nutrients, note: payload.note, reviewed: true, localTimeMinutes: instant.getHours() * 60 + instant.getMinutes(), timezoneOffsetMinutes: instant.getTimezoneOffset(), source: { kind: 'manual-agent-draft', nutrientBasis: 'user-entered', review: { reviewedAt: '2026-09-21T12:00:00.000Z' } } });
  expect(saved.nutrients).not.toBe(payload.nutrients);
});
it('uses the current instant for an undated meal and propagates storage rejection', async () => {
  mocks.meal.mockRejectedValue(new Error('Meal transaction aborted'));
  await expect(applyAgentDraft(proposal('meal', { name: 'Snack' }))).rejects.toThrow('transaction aborted');
  expect(mocks.meal.mock.calls[0][0]).toMatchObject({ eatenAt: '2026-09-21T12:00:00.000Z', mealType: 'other', nutrients: {} });
});
it('routes the full blood-pressure reading to its origin profile', async () => {
  await expect(applyAgentDraft(proposal('biometric', { metric: 'bp', date: '2026-09-20', systolic: 120, diastolic: 80, pulse: 62, note: 'Seated' }))).resolves.toBe('Blood pressure saved.');
  expect(mocks.bp).toHaveBeenCalledExactlyOnceWith('a', { date: '2026-09-20', systolic: 120, diastolic: 80, pulse: 62, note: 'Seated', tags: undefined });
  expect(mocks.metric).not.toHaveBeenCalled();
});
it.each([['weight', undefined, 'kg', 'Weight'], ['weight', 'lb', 'lb', 'Weight'], ['rhr', undefined, 'bpm', 'Resting pulse']])('routes %s with the correct unit %s', async (metric, unit, expectedUnit, label) => {
  await expect(applyAgentDraft(proposal('biometric', { metric, value: 72, unit }))).resolves.toBe(`${label} saved.`);
  expect(mocks.metric).toHaveBeenCalledExactlyOnceWith('a', metric, { date: undefined, value: 72, unit: expectedUnit, tags: undefined, note: undefined });
  expect(mocks.bp).not.toHaveBeenCalled();
});
it.each(['bp', 'weight'])('does not report success when %s persistence fails', async metric => {
  mocks.bp.mockRejectedValue(new Error('Row transaction aborted'));
  mocks.metric.mockRejectedValue(new Error('Row transaction aborted'));
  await expect(applyAgentDraft(proposal('biometric', { metric, value: 72, systolic: 120, diastolic: 80 }))).rejects.toThrow('transaction aborted');
});
it.each([['supplement', '2026-09-01', 'active'], ['medication', '2026-10-01', 'planned']])('preserves the %s schedule and lifecycle without mutating live data', async (type, startDate, lifecycle) => {
  const before = structuredClone(state.importedData);
  await expect(applyAgentDraft(proposal('supplement', { type, name: 'Reviewed item', startDate, dosage: 'One daily', note: 'Reviewed directions' }))).resolves.toContain(type === 'medication' ? 'Medication' : 'Supplement');
  const [profileId, draft, options] = mocks.save.mock.calls[0];
  expect(profileId).toBe('a');
  expect(options).toEqual({ baseData: before });
  expect(draft.supplements).toHaveLength(1);
  expect(draft.supplements[0]).toMatchObject({ type, name: 'Reviewed item', dosage: 'One daily', note: 'Reviewed directions', startDate, endDate: null, periods: [{ start: startDate, end: null }], schedule: { mode: 'daily', timesPerDay: null }, lifecycle: { state: lifecycle } });
  expect(state.importedData).toEqual(before);
});
