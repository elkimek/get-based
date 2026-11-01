// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ confirm: vi.fn(), notify: vi.fn(), importClients: vi.fn() }));
vi.mock('../js/utils.js', () => ({
  showConfirmDialog: mocks.confirm, showNotification: mocks.notify,
  escapeAttr: (value: unknown) => value, escapeHTML: (value: unknown) => value,
}));
import { configureBackupRuntimeDeps, importEncryptedBackup } from '../js/backup.js';

const bundle = { version: 2, type: 'database', exportedAt: '2026-10-31T12:00:00Z', profiles: [{ id: 'one', name: 'First', data: { entries: [] } }] };
const serialized = JSON.stringify(bundle);
function file(body = serialized) { return new File([body], 'getbased-backup-2026-10-31.json', { type: 'application/json' }); }
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  localStorage.setItem('labcharts-profiles', 'existing-profile-list');
  localStorage.setItem('labcharts-encryption-enabled', 'true');
  localStorage.setItem('labcharts-encryption-salt', 'destination-salt');
  mocks.confirm.mockResolvedValue(true);
  mocks.importClients.mockResolvedValue(undefined);
  configureBackupRuntimeDeps({ importClientBundle: mocks.importClients });
});
it('confirms client merge before delegating without replacing destination settings', async () => {
  await importEncryptedBackup(file());
  expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Matching clients will be merged'), {
    confirmLabel: 'Import clients', ariaLabel: 'Import exported clients',
  });
  expect(mocks.importClients).toHaveBeenCalledExactlyOnceWith(serialized);
  expect(localStorage.getItem('labcharts-profiles')).toBe('existing-profile-list');
  expect(localStorage.getItem('labcharts-encryption-enabled')).toBe('true');
  expect(localStorage.getItem('labcharts-encryption-salt')).toBe('destination-salt');
  expect(mocks.notify).not.toHaveBeenCalled();
});
it('leaves the destination untouched when client import is cancelled', async () => {
  mocks.confirm.mockResolvedValue(false);
  await importEncryptedBackup(file());
  expect(mocks.importClients).not.toHaveBeenCalled();
  expect(localStorage.getItem('labcharts-profiles')).toBe('existing-profile-list');
  expect(localStorage.getItem('labcharts-encryption-enabled')).toBe('true');
  expect(localStorage.getItem('labcharts-encryption-salt')).toBe('destination-salt');
  expect(mocks.notify).not.toHaveBeenCalled();
});
it('waits for client import and reports a failed import without restore success', async () => {
  let rejectImport!: (error: Error) => void;
  mocks.importClients.mockImplementation(() => new Promise((_, reject) => { rejectImport = reject; }));
  let settled = false;
  const importing = importEncryptedBackup(file()).then(() => { settled = true; });
  await vi.waitFor(() => expect(mocks.importClients).toHaveBeenCalled());
  expect(settled).toBe(false);
  rejectImport(new Error('Client storage unavailable'));
  await importing;
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith('Error reading backup: Client storage unavailable', 'error');
});
it.each([3, undefined])('rejects an unsupported database bundle version %s', async version => {
  await importEncryptedBackup(file(JSON.stringify({ ...bundle, version })));
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.importClients).not.toHaveBeenCalled();
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith('Invalid backup file format', 'error');
});
