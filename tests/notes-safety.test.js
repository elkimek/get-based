// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { deleteNote, openNoteEditor, saveNote } from '../js/notes.js';
import { mergeImportedData } from '../js/data-merge.js';
import { DELTA_ARRAY_CONFIG } from '../js/sync-delta-registry.js';
const mocks = vi.hoisted(() => ({ save: vi.fn(), confirm: vi.fn(), notify: vi.fn() }));
vi.mock('../js/data.js', async load => ({ ...await load(), saveImportedData: mocks.save }));
vi.mock('../js/utils.js', async load => ({ ...await load(), showConfirmDialog: mocks.confirm, showNotification: mocks.notify }));
beforeEach(() => {
  vi.clearAllMocks();
  state.currentProfile = 'notes-profile';
  state.importedData = { notes: [{ date: '2026-04-01', text: 'First' }, { date: '2026-04-01', text: 'Second' }] };
  document.body.innerHTML = '<div id="modal-overlay"><div id="detail-modal"></div></div>';
});
it('deletes the selected note after reordering and prevents stale remote restoration', async () => {
  const selected = state.importedData.notes[0];
  const id = DELTA_ARRAY_CONFIG.notes.itemIdFn(selected);
  mocks.confirm.mockImplementation(async () => { state.importedData.notes.reverse(); return true; });
  await deleteNote(0);
  expect(state.importedData.notes.map(note => note.text)).toEqual(['Second']);
  expect(state.importedData._deleted.notes).toContain(id);
  expect(mergeImportedData(state.importedData, { notes: [selected] }).notes.map(note => note.text)).toEqual(['Second']);
  expect(mocks.save).toHaveBeenCalledOnce();
});
it.each(['profile', 'sync', 'edit'])('refuses deletion when %s changes during confirmation', async change => {
  mocks.confirm.mockImplementation(async () => {
    if (change === 'profile') state.currentProfile = 'other-profile';
    if (change === 'sync') state.importedData = { notes: [{ date: '2026-04-01', text: 'Other data' }] };
    if (change === 'edit') state.importedData.notes[0].text = 'Updated during confirmation';
    return true;
  });
  await deleteNote(0);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(state.importedData.notes.length).toBeGreaterThan(0);
  expect(mocks.notify).toHaveBeenCalled();
});
it('keeps notes on cancelled deletion', async () => {
  mocks.confirm.mockResolvedValue(false);
  await deleteNote(0);
  expect(state.importedData.notes).toHaveLength(2);
  expect(mocks.save).not.toHaveBeenCalled();
});
it('edits the opened note after reordering, even with a duplicate date', () => {
  openNoteEditor(null, 0);
  state.importedData.notes.reverse();
  document.getElementById('note-textarea').value = 'Edited first';
  saveNote(0);
  expect(state.importedData.notes.map(note => note.text)).toEqual(['Second', 'Edited first']);
});
it.each(['profile', 'sync', 'edit'])('rejects an editor save after a %s change', change => {
  openNoteEditor(null, 0);
  if (change === 'profile') state.currentProfile = 'other-profile';
  if (change === 'sync') state.importedData = { notes: [{ date: '2026-04-01', text: 'Other data' }] };
  if (change === 'edit') state.importedData.notes[0].text = 'Updated during editing';
  document.getElementById('note-textarea').value = 'Stale edit';
  saveNote(0);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(state.importedData.notes.some(note => note.text === 'Stale edit')).toBe(false);
});
