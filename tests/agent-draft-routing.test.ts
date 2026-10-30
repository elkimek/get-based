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

const proposal = (kind: unknown, payload: unknown) => ({ profileId: 'a', status: 'pending', kind, payload });
const writes = () => [mocks.save, mocks.marker, mocks.meal, mocks.bp, mocks.metric];
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-21T12:00:00Z'));
  (state as { importedData: unknown }).importedData = { entries: [], contextNotes: 'Existing', markerNotes: { 'biochemistry.glucose': 'Existing marker note' }, supplements: [] };
  mocks.save.mockResolvedValue(true);
  mocks.marker.mockResolvedValue({});
  mocks.meal.mockImplementation(async (meal: unknown) => meal);
  mocks.resolve.mockReturnValue({ row: { key: 'biochemistry.glucose', name: 'Glucose' }, matches: [] });
});
afterEach(() => vi.useRealTimers());

it.each([null, { status: 'applied' }, { status: 'applying' }, { status: 'failed' }, { status: 'discarded' }, { ...proposal('note', {}), profileId: '' }, proposal('unknown', {})])('rejects an ineligible proposal before all mutation boundaries: %j', async draft => {
  await expect(applyAgentDraft(draft)).rejects.toThrow();
  for (const write of writes()) expect(write).not.toHaveBeenCalled();
});
it.each([
  ['note', { scope: 'marker', marker: 'Glucose', mode: 'append', text: 'New' }],
  ['note', { scope: 'marker', marker: 'ambiguous', mode: 'replace', text: 'New' }],
  ['note', { scope: 'profile', mode: 'replace', text: 'Replacement' }],
  ['meal', { name: 'Lunch', eatenAt: 'invalid' }],
  ['meal', { name: 'Lunch', eatenAt: '2026-09-20T18:15:00+02:00', nutrients: { proteinG: 24 }, note: 'Reviewed' }],
  ['meal', { name: 'Undated snack' }],
  ['biometric', { metric: 'bp', date: '2026-09-20', systolic: 120, diastolic: 80, pulse: 62 }],
  ['biometric', { metric: 'weight', date: '2026-09-20', value: 72, unit: 'kg' }],
  ['biometric', { metric: 'weight', value: 72, unit: 'lb' }],
  ['biometric', { metric: 'rhr', value: 72 }],
  ['supplement', { type: 'supplement', name: 'Example', startDate: '2026-09-01', dosage: 'One daily' }],
  ['supplement', { type: 'medication', name: 'Example', startDate: '2026-10-01' }],
])('requires a refreshed exact review for an older %s proposal before any mutation', async (kind, payload) => {
  const before = structuredClone(state.importedData);
  await expect(applyAgentDraft(proposal(kind, payload))).rejects.toMatchObject({ noChangeApplied: true, requiresReview: true });
  expect(state.importedData).toEqual(before);
  for (const write of writes()) expect(write).not.toHaveBeenCalled();
});
