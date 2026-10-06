// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderFolderBackupSection } from '../js/backup.js';
import { disposeFolderBackupPresentation, refreshFolderBackupPresentation } from '../js/backup-folder-presentation.js';
import { getFolderBackupSnapshot } from '../js/settings-protection-view.js';

beforeEach(() => { document.body.replaceChildren(); vi.stubGlobal('showDirectoryPicker', vi.fn()); });
afterEach(() => { disposeFolderBackupPresentation(); document.body.replaceChildren(); vi.unstubAllGlobals(); });

it('hydrates the standalone runtime contract and refreshes connected hosts through display-only state', async () => {
  document.body.innerHTML = renderFolderBackupSection();
  await vi.waitFor(() => expect(document.querySelector('[data-backup-action="pick-folder"]')).not.toBeNull());
  const folderName = 'Synthetic <folder> & backups';
  refreshFolderBackupPresentation(getFolderBackupSnapshot({ supported: true, folderName, permissionLost: true, lastBackup: null }));
  expect(document.body.textContent).toContain(`${folderName} — access lost`);
  expect(document.querySelector('[data-backup-action="reauthorize-folder"]')).not.toBeNull();
  refreshFolderBackupPresentation(getFolderBackupSnapshot({ supported: true, folderName, permissionLost: false, lastBackup: '2026-01-01T00:00:00Z' }));
  expect(document.querySelector('[data-backup-action="reauthorize-folder"]')).toBeNull();
  expect(document.body.textContent).toContain('Last folder backup:');
  expect(document.body.querySelector('folder,img,script')).toBeNull();
});

it('sweeps disconnected hosts, disposes their contents and remounts a cached standalone adapter', async () => {
  document.body.innerHTML = renderFolderBackupSection();
  await vi.waitFor(() => expect(document.querySelector('[data-backup-action="pick-folder"]')).not.toBeNull());
  const first = document.querySelector<HTMLElement>('[data-folder-backup-root]')!; first.remove();
  document.body.innerHTML = renderFolderBackupSection();
  await vi.waitFor(() => expect(document.querySelector('[data-backup-action="pick-folder"]')).not.toBeNull());
  const second = document.querySelector<HTMLElement>('[data-folder-backup-root]')!;
  refreshFolderBackupPresentation(getFolderBackupSnapshot({ supported: true, folderName: 'New folder', permissionLost: false, lastBackup: null }));
  expect(second.textContent).toContain('New folder'); expect(first.textContent).not.toContain('New folder');
  disposeFolderBackupPresentation(); expect(second.childElementCount).toBe(0);
  document.body.innerHTML = renderFolderBackupSection();
  await vi.waitFor(() => expect(document.querySelector('[data-backup-action="pick-folder"]')).not.toBeNull());
});
