import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../js/backup.js', () => ({ getFolderBackupState: vi.fn() }));
vi.mock('../js/crypto.js', () => ({ getEncryptionEnabled: vi.fn() }));
vi.mock('../js/sync.js', () => ({ isSyncEnabled: vi.fn() }));
import { getFolderBackupState } from '../js/backup.js';
import { getEncryptionEnabled } from '../js/crypto.js';
import { isSyncEnabled } from '../js/sync.js';
import { getDataProtectionStatus } from '../js/data-protection-status.js';
import { protectionCards } from '../js/data-protection-picker-model.js';
afterEach(() => vi.resetAllMocks());
it('shares actual feature states and hides backup where folder access is unavailable', () => {
  vi.mocked(getFolderBackupState).mockReturnValue({ supported: false, folderName: 'Existing folder', permissionLost: true, lastBackup: null });
  vi.mocked(getEncryptionEnabled).mockReturnValue(true); vi.mocked(isSyncEnabled).mockReturnValue(false);
  const status = getDataProtectionStatus(); expect(status).toEqual({ encryption: true, sync: false, backup: true, backupSupported: false });
  expect(protectionCards(status).map(card => [card.key, card.configured])).toEqual([['encryption', true], ['sync', false]]);
});
it('retains the existing backup prompt if folder status has not initialised', () => {
  vi.mocked(getFolderBackupState).mockImplementation(() => { throw new Error('Not initialised'); });
  vi.mocked(getEncryptionEnabled).mockReturnValue(false); vi.mocked(isSyncEnabled).mockReturnValue(true);
  expect(getDataProtectionStatus()).toEqual({ encryption: false, sync: true, backup: false, backupSupported: true });
});
it('preserves supported configured backups including temporarily lost permissions', () => {
  vi.mocked(getFolderBackupState).mockReturnValue({ supported: true, folderName: 'Backup', permissionLost: true, lastBackup: 'original' });
  const status = getDataProtectionStatus(); expect(status.backup).toBe(true); expect(protectionCards(status)[2]).toMatchObject({ key: 'backup', configured: true });
});
