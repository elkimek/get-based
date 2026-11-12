import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {configureMigrationDraftFlush, configureMigrationAttachmentCheck, configureMigrationUnsavedWork,
  captureMigrationUnsavedWork, openMigrationRecovery, openMigrationAfterSavedWork} from '../js/migration-navigation.js';
const assign = vi.fn();
beforeEach(() => {assign.mockReset(); vi.stubGlobal('location', {assign}); configureMigrationDraftFlush(async () => {}); configureMigrationAttachmentCheck(() => {});});
afterEach(() => vi.unstubAllGlobals());
it('saves text work before refusing to leave unsent images behind', async () => {
  const saved = vi.fn(async () => {}); configureMigrationDraftFlush(saved);
  configureMigrationAttachmentCheck(() => {throw new Error('Unsent images');});
  await expect(openMigrationRecovery()).rejects.toThrow('Unsent images'); expect(saved).toHaveBeenCalledOnce(); expect(assign).not.toHaveBeenCalled();
});
it('retains the page after failed saves and accepts unchanged copies only after explicit confirmation', async () => {
  configureMigrationDraftFlush(async () => {throw new Error('Storage full');});
  await expect(openMigrationRecovery()).rejects.toThrow('Storage full'); expect(assign).not.toHaveBeenCalled();
  let current = true;
  configureMigrationUnsavedWork('synthetic', () => ({files: [{name: 'draft.txt', blob: new Blob(['synthetic work'])}], pending: false, isCurrent: () => current}));
  const snapshot = captureMigrationUnsavedWork(); expect(await snapshot.files[0]!.blob.text()).toBe('synthetic work');
  current = false; expect(() => openMigrationAfterSavedWork(snapshot)).toThrow('changed'); expect(assign).not.toHaveBeenCalled();
  current = true; openMigrationAfterSavedWork(captureMigrationUnsavedWork()); expect(assign).toHaveBeenCalledWith('/app/migration.html');
});
it('rejects images still being prepared and owners that arrived after capture', () => {
  configureMigrationUnsavedWork('synthetic', () => ({files: [], pending: true, isCurrent: () => true}));
  expect(() => openMigrationAfterSavedWork(captureMigrationUnsavedWork())).toThrow('changed');
  configureMigrationUnsavedWork('synthetic', () => ({files: [], pending: false, isCurrent: () => true}));
  const snapshot = captureMigrationUnsavedWork();
  configureMigrationUnsavedWork('new owner', () => ({files: [], pending: false, isCurrent: () => true}));
  expect(() => openMigrationAfterSavedWork(snapshot)).toThrow('changed'); expect(assign).not.toHaveBeenCalled();
});
