// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { deleteNote, openNoteEditor, saveNote } from '../js/notes.js';
import { mergeImportedData } from '../js/data-merge.js';
import { configureNotesRuntimeDeps } from '../js/notes-runtime.js';
import { DELTA_ARRAY_CONFIG } from '../js/sync-delta-registry.js';
const mocks = vi.hoisted(() => ({ save: vi.fn(), confirm: vi.fn(), notify: vi.fn(), close: vi.fn() }));
vi.mock('../js/data.js', async load => ({ ...await load(), saveImportedDataForProfile: async (profile, draft, options) => {
  const saved = await mocks.save(profile, draft, options);
  if (saved && profile === state.currentProfile) Object.assign(state.importedData, draft);
  return saved;
} }));
vi.mock('../js/utils.js', async load => ({ ...await load(), showConfirmDialog: mocks.confirm, showNotification: mocks.notify }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.save.mockResolvedValue(true);
  configureNotesRuntimeDeps({ closeModal: mocks.close });
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
it('edits the opened note after reordering, even with a duplicate date', async () => {
  openNoteEditor(null, 0);
  state.importedData.notes.reverse();
  document.getElementById('note-textarea').value = 'Edited first';
  await saveNote(0);
  expect(state.importedData.notes.map(note => note.text)).toEqual(['Second', 'Edited first']);
});
it.each(['profile', 'sync', 'edit'])('rejects an editor save after a %s change', async change => {
  openNoteEditor(null, 0);
  if (change === 'profile') state.currentProfile = 'other-profile';
  if (change === 'sync') state.importedData = { notes: [{ date: '2026-04-01', text: 'Other data' }] };
  if (change === 'edit') state.importedData.notes[0].text = 'Updated during editing';
  document.getElementById('note-textarea').value = 'Stale edit';
  await saveNote(0);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(state.importedData.notes.some(note => note.text === 'Stale edit')).toBe(false);
});

it.each(['save', 'delete'])('keeps note data and editor intact when %s persistence fails', async action => {
  const before = structuredClone(state.importedData);
  mocks.save.mockResolvedValue(false);
  mocks.confirm.mockResolvedValue(true);
  openNoteEditor(null, 0);
  document.getElementById('note-textarea').value = 'Unsaved revision';
  if (action === 'save') await saveNote(0); else await deleteNote(0);
  expect(state.importedData).toEqual(before);
  expect(mocks.close).not.toHaveBeenCalled();
  expect(mocks.notify.mock.calls.some(([, kind]) => kind === 'success')).toBe(false);
  expect(document.getElementById('note-textarea').value).toBe('Unsaved revision');
});
it('does not announce success before a save commits', async () => {
  let finish;
  mocks.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  openNoteEditor(null, 0);
  document.getElementById('note-textarea').value = 'Pending edit';
  const pending = saveNote(0);
  expect(mocks.close).not.toHaveBeenCalled();
  expect(mocks.notify.mock.calls.some(([, kind]) => kind === 'success')).toBe(false);
  finish(true);
  await pending;
  expect(mocks.close).toHaveBeenCalledOnce();
});

it('does not close a newly opened editor when an older save finishes', async () => {
  let finish;
  mocks.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  openNoteEditor(null, 0);
  document.getElementById('note-textarea').value = 'Older save';
  const pending = saveNote(0);
  openNoteEditor(null, 1);
  finish(true);
  await pending;
  expect(mocks.close).not.toHaveBeenCalled();
  expect(document.getElementById('note-textarea').value).toBe('Second');
});
it('does not duplicate a note on double submission while storage is pending', async () => {
  let finish;
  mocks.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  openNoteEditor('2026-09-01');
  document.getElementById('note-textarea').value = 'New note';
  const pending = saveNote(null);
  await expect(saveNote(null)).resolves.toBe(false);
  finish(true);
  await pending;
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(state.importedData.notes.filter(note => note.text === 'New note')).toHaveLength(1);
});

it('leaves an unrelated modal open when a note save finishes', async () => {
  let finish;
  mocks.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  openNoteEditor(null, 0);
  document.getElementById('note-textarea').value = 'Saved in background';
  const pending = saveNote(0);
  document.getElementById('detail-modal').innerHTML = '<h3>Another detail</h3>';
  finish(true);
  await pending;
  expect(mocks.close).not.toHaveBeenCalled();
});

it.each(['date', 'text'])('rejects an empty %s while retaining the editor draft', async field => {
  openNoteEditor(null, 0);
  document.getElementById('note-date-input').value = field === 'date' ? '' : '2026-09-21';
  document.getElementById('note-textarea').value = field === 'text' ? '   ' : 'Keep this draft';
  await expect(saveNote(0)).resolves.toBe(false);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.close).not.toHaveBeenCalled();
  expect(mocks.notify).toHaveBeenCalledWith(expect.stringContaining(field === 'date' ? 'date' : 'text'), 'error');
});
it('rejects editing a note removed while its editor is open', async () => {
  openNoteEditor(null, 0);
  state.importedData.notes.shift();
  await expect(saveNote(0)).resolves.toBe(false);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(state.importedData.notes.map(note => note.text)).toEqual(['Second']);
});
it('rejects deletion when the selected note disappears during confirmation', async () => {
  mocks.confirm.mockImplementation(async () => { state.importedData.notes.shift(); return true; });
  await expect(deleteNote(0)).resolves.toBe(false);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(state.importedData.notes.map(note => note.text)).toEqual(['Second']);
});
it('does not close or navigate a replacement modal after a pending deletion commits', async () => {
  let finish;
  mocks.confirm.mockResolvedValue(true);
  mocks.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  openNoteEditor(null, 0);
  const pending = deleteNote(0);
  await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  document.getElementById('detail-modal').innerHTML = '<h3>Unrelated detail</h3>';
  finish(true);
  await expect(pending).resolves.toBe(true);
  expect(mocks.close).not.toHaveBeenCalled();
  expect(mocks.notify).not.toHaveBeenCalledWith('Note deleted', 'info');
});
it('delegated save commits the reviewed note and delegated cancel leaves data unchanged', async () => {
  openNoteEditor(null, 0);
  document.getElementById('note-textarea').value = 'Reviewed via click';
  document.querySelector('[data-note-action=save]').click();
  await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(state.importedData.notes[0].text).toBe('Reviewed via click');
  openNoteEditor(null, 0);
  document.getElementById('note-textarea').value = 'Cancelled draft';
  document.querySelector('[data-note-action=close]').click();
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(state.importedData.notes[0].text).toBe('Reviewed via click');
});
it('delegated delete refuses an editor made stale by sync', async () => {
  openNoteEditor(null, 0);
  state.importedData = { notes: [{ date: '2026-04-01', text: 'Synced replacement' }] };
  document.querySelector('[data-note-action=delete]').click();
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.notify).toHaveBeenCalledWith(expect.stringContaining('Reopen'), 'info');
});
it('permits retry after a failed commit without duplicating a new note', async () => {
  mocks.save.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  openNoteEditor('2026-09-21');
  document.getElementById('note-textarea').value = 'Retry me';
  await expect(saveNote(null)).resolves.toBe(false);
  await expect(saveNote(null)).resolves.toBe(true);
  expect(state.importedData.notes.filter(note => note.text === 'Retry me')).toHaveLength(1);
});
