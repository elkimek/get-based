import { expect, test } from './coverage-fixture.js';

test('note edits survive reload and aborted commits retain the editor and stored record', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
  });
  await page.goto('/app');
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.notes = [{ date: '2026-09-01', text: 'Original note' }];
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Fixture save failed');
    (await import('/js/changelog.js')).closeChangelog();
    (await import('/js/notes.js')).openNoteEditor(null, 0);
    const key = (await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported');
    const put = IDBObjectStore.prototype.put;
    globalThis.__restoreNoteStorage = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (args[1] === key) request.addEventListener('success', () => this.transaction.abort(), { once: true });
      return request;
    };
  });
  await page.locator('#note-textarea').fill('Revised note');
  await page.locator('[data-note-action=save]').click();
  await expect(page.locator('.notification-container')).toContainText('Could not save profile data');
  await expect(page.locator('#note-textarea')).toBeVisible();
  await expect(page.locator('#note-textarea')).toHaveValue('Revised note');
  const unchanged = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const key = (await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported');
    const stored = JSON.parse(await (await import('/js/crypto.js')).encryptedGetItem(key));
    globalThis.__restoreNoteStorage();
    return { memory: state.importedData.notes, stored: stored.notes, deleted: state.importedData._deleted?.notes };
  });
  expect(unchanged).toEqual({ memory: [{ date: '2026-09-01', text: 'Original note' }], stored: [{ date: '2026-09-01', text: 'Original note' }], deleted: undefined });
  await page.locator('[data-note-action=save]').click();
  await expect(page.locator('.notification-container')).toContainText('Note saved');
  await page.reload();
  const restored = await page.evaluate(async () => (await import('/js/state.js')).state.importedData.notes);
  expect(restored).toEqual([{ date: '2026-09-01', text: 'Revised note' }]);
});

test('a note commit merges with a concurrent unrelated profile save', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const data = await import('/js/data.js');
    const notes = await import('/js/notes.js');
    state.importedData.notes = [{ date: '2026-09-01', text: 'Original' }];
    if (!await data.saveImportedData()) throw new Error('Fixture save failed');
    notes.openNoteEditor(null, 0);
    document.getElementById('note-textarea').value = 'Concurrent revision';
    const noteSave = notes.saveNote(0);
    state.importedData.contextNotes = 'Keep this unrelated edit';
    const otherSave = data.saveImportedData();
    const saved = await Promise.all([noteSave, otherSave]);
    const key = (await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported');
    const disk = JSON.parse(await (await import('/js/crypto.js')).encryptedGetItem(key));
    return { saved, notes: disk.notes, context: disk.contextNotes, liveNotes: state.importedData.notes };
  });
  expect(result).toEqual({ saved: [true, true], notes: [{ date: '2026-09-01', text: 'Concurrent revision' }], context: 'Keep this unrelated edit', liveNotes: [{ date: '2026-09-01', text: 'Concurrent revision' }] });
});

test('aborted note deletion preserves the record and retry commits its tombstone', async ({ page }) => {
  await page.goto('/app');
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.notes = [{ date: '2026-09-01', text: 'Keep until committed' }];
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Fixture save failed');
    const key = (await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported');
    const original = IDBObjectStore.prototype.put;
    globalThis.restoreDeleteStorage = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      if (args[1] === key) request.addEventListener('success', () => this.transaction.abort(), { once: true });
      return request;
    };
    globalThis.noteDeletion = (await import('/js/notes.js')).deleteNote(0);
  });
  await page.locator('#confirm-dialog-overlay.show #confirm-ok').click();
  expect(await page.evaluate(() => globalThis.noteDeletion)).toBe(false);
  const failed = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const key = (await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported');
    const disk = JSON.parse(await (await import('/js/crypto.js')).encryptedGetItem(key));
    globalThis.restoreDeleteStorage();
    return { memory: state.importedData.notes, stored: disk.notes, deleted: disk._deleted?.notes || [] };
  });
  expect(failed).toEqual({ memory: [{ date: '2026-09-01', text: 'Keep until committed' }], stored: [{ date: '2026-09-01', text: 'Keep until committed' }], deleted: [] });
  await page.evaluate(async () => { globalThis.noteDeletion = (await import('/js/notes.js')).deleteNote(0); });
  await page.locator('#confirm-dialog-overlay.show #confirm-ok').click();
  expect(await page.evaluate(() => globalThis.noteDeletion)).toBe(true);
  await page.reload();
  const restored = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return { notes: state.importedData.notes, deleted: state.importedData._deleted?.notes || [] };
  });
  expect(restored.notes).toEqual([]);
  expect(restored.deleted).toHaveLength(1);
});
