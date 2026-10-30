import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn(), marker: vi.fn() }));
vi.mock('../js/data.js', async load => ({ ...await load<typeof import('../js/data.js')>(), saveImportedData: mocks.save, saveImportedDataForProfile: mocks.save }));
vi.mock('../js/profile.js', async load => ({ ...await load<typeof import('../js/profile.js')>(), getActiveProfileId: () => 'a' }));
vi.mock('../js/marker-note-records.js', async load => ({ ...await load<typeof import('../js/marker-note-records.js')>(), commitReviewedMarkerNote: mocks.marker }));
vi.mock('../js/agent-profile-record-store.js', async () => { const { state } = await import('../js/state.js'); return { readAgentProfileRecords: async () => structuredClone(state.importedData) }; });
vi.mock('../js/agent-tool-bindings.js', () => ({ resolveAgentMarker: () => ({ row: { key: 'biochemistry.glucose', name: 'Glucose' } }) }));
import { state } from '../js/state.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
function dataDraft(resource: string, patch: object, baseline: unknown, operation = 'update', recordId = '') { return { profileId: 'a', kind: 'data', status: 'pending', payload: { resource, operation, recordId, baseline: JSON.stringify(baseline), patch: JSON.stringify(patch), evidence: 'Explicit report.', reason: 'A user correction.', effectiveDate: '2026-10-23', recordedAt: 1 } }; }
beforeEach(() => {
  vi.resetAllMocks();
  state.currentProfile = 'a';
  (state as { importedData: unknown }).importedData = { entries: [], contextNotes: 'Original', supplements: [] };
});
it.each([
  ['profileNotes', { text: 'Proposed note' }, 'Original', 'update', ''],
  ['supplements', { name: 'Synthetic supplement', type: 'supplement', startDate: '2026-09-01' }, null, 'add', 'new-therapy'],
] as const)('rejects failed %s persistence without leaving unsaved changes in live data', async (resource, patch, baseline, operation, recordId) => {
  mocks.save.mockResolvedValue(false); const before = structuredClone(state.importedData);
  await expect(applyAgentDraft(dataDraft(resource, patch, baseline, operation, recordId))).rejects.toThrow(/save/i);
  expect(state.importedData).toEqual(before);
});
it('does not report a marker note as saved when its guarded owner fails', async () => {
  mocks.marker.mockRejectedValue(new Error('Could not save the marker note.'));
  const baseline = { version: 1, revision: 'a'.repeat(64), record: { id: 'biochemistry.glucose', markerKey: 'biochemistry.glucose', markerName: 'Glucose', text: 'Old', category: 'Blood', scope: 'Across dates' } };
  await expect(applyAgentDraft(dataDraft('markerNotes', { text: 'Proposed' }, baseline, 'update', 'biochemistry.glucose'))).rejects.toThrow(/save/i);
});
it('supplies a profile, fresh baseline and expected text to a successful context-note mutation', async () => {
  mocks.save.mockResolvedValue(true);
  await expect(applyAgentDraft(dataDraft('profileNotes', { text: 'Original\n\nNew' }, 'Original'))).resolves.toContain('updated');
  expect(mocks.save).toHaveBeenCalledWith('a', expect.objectContaining({ contextNotes: 'Original\n\nNew' }), expect.objectContaining({ baseData: expect.objectContaining({ contextNotes: 'Original' }), expectedContextNotes: 'Original', forceProfileScope: true, canCommit: expect.any(Function) }));
});
it('rejects a proposal for another profile before any persistence', async () => {
  await expect(applyAgentDraft({ profileId: 'b', kind: 'note', status: 'pending', payload: {} })).rejects.toThrow('Switch back');
  expect(mocks.save).not.toHaveBeenCalled();
});
