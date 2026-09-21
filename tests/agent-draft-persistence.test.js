import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn(), marker: vi.fn() }));
vi.mock('../js/data.js', async load => ({ ...await load(), saveImportedData: mocks.save, saveImportedDataForProfile: mocks.save }));
vi.mock('../js/profile.js', async load => ({ ...await load(), getActiveProfileId: () => 'a' }));
vi.mock('../js/marker-detail-store.js', () => ({ saveMarkerNoteText: mocks.marker }));
vi.mock('../js/agent-tool-bindings.js', () => ({ resolveAgentMarker: () => ({ row: { key: 'biochemistry.glucose', name: 'Glucose' } }) }));
import { state } from '../js/state.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
beforeEach(() => {
  vi.resetAllMocks();
  state.currentProfile = 'a';
  state.importedData = { entries: [], contextNotes: 'Original', supplements: [] };
});
it.each([
  ['note', { scope: 'profile', text: 'Proposed note', mode: 'append' }],
  ['supplement', { name: 'Synthetic supplement', type: 'supplement', startDate: '2026-09-01' }],
])('rejects failed %s persistence without leaving unsaved changes in live data', async (kind, payload) => {
  mocks.save.mockResolvedValue(false);
  const before = structuredClone(state.importedData);
  await expect(applyAgentDraft({ profileId: 'a', kind, payload, status: 'pending' })).rejects.toThrow(/save/i);
  expect(state.importedData).toEqual(before);
});
it('does not report a marker note as saved when the storage boundary fails', async () => {
  mocks.marker.mockResolvedValue(null);
  await expect(applyAgentDraft({ profileId: 'a', kind: 'note', status: 'pending', payload: { scope: 'marker', marker: 'Glucose', text: 'Proposed', mode: 'replace' } })).rejects.toThrow(/save/i);
});
it('supplies an explicit profile and baseline for a successful context-note mutation', async () => {
  mocks.save.mockResolvedValue(true);
  await expect(applyAgentDraft({ profileId: 'a', kind: 'note', status: 'pending', payload: { scope: 'profile', text: 'New', mode: 'append' } })).resolves.toContain('saved');
  expect(mocks.save).toHaveBeenCalledWith('a', expect.objectContaining({ contextNotes: 'Original\n\nNew' }), { baseData: expect.objectContaining({ contextNotes: 'Original' }) });
});
it('rejects a proposal for another profile before any persistence', async () => {
  await expect(applyAgentDraft({ profileId: 'b', kind: 'note', status: 'pending', payload: {} })).rejects.toThrow('Switch back');
  expect(mocks.save).not.toHaveBeenCalled();
});
