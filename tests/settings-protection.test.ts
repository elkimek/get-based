// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureCryptoUi, renderEncryptionSection, renderBackupSection, hydrateProtectionSettings,
  loadBackupSnapshots, disableEncryption, toggleBackupSnapshots, showEnableEncryptionModal } from '../js/crypto-ui.js';
import { disposeSettingsProtection, refreshFolderBackupSettings } from '../js/settings-protection-component.js';
import { getFolderBackupSnapshot, getBackupSnapshotRows } from '../js/settings-protection-view.js';
import * as utils from '../js/utils.js';
import { disposePassphraseDialog } from '../js/passphrase-component.js';
const mocks = vi.hoisted(() => ({ download: vi.fn(), restore: vi.fn(), import: vi.fn(), snapshots: vi.fn(),
  folder: vi.fn(() => ({ supported: false, folderName: null, permissionLost: false, lastBackup: null })) }));
vi.mock('../js/backup.js', () => ({ exportEncryptedBackup: mocks.download, importEncryptedBackup: mocks.import,
  getAutoBackupSnapshots: mocks.snapshots, getFolderBackupState: mocks.folder, restoreAutoBackup: mocks.restore, MAX_SNAPSHOTS: 5 }));
let enabled = false;
let previous: ReturnType<typeof configureCryptoUi>;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); document.body.replaceChildren(); enabled = false;
  mocks.restore.mockResolvedValue(undefined); mocks.snapshots.mockResolvedValue([]); mocks.folder.mockReturnValue({ supported: false, folderName: null, permissionLost: false, lastBackup: null });
  previous = configureCryptoUi({ getEncryptionEnabled: () => enabled });
});
afterEach(() => { disposePassphraseDialog(); disposeSettingsProtection(); configureCryptoUi(previous); vi.restoreAllMocks(); document.body.replaceChildren(); localStorage.clear(); });
function render() {
  document.body.innerHTML = `<section id="encryption-section">${renderEncryptionSection()}</section><section id="backup-section">${renderBackupSection()}</section>`;
  hydrateProtectionSettings();
}
const summaries = [
  { id: 42, createdAt: '2026-01-01T00:00:00Z', encrypted: true, snapshot: { profiles: [{ id: 'a' }, { id: 'b' }] } },
  { id: 'snapshot-<img src=x onerror=alert(1)>', createdAt: '2026-01-02T00:00:00Z', encrypted: false, snapshot: null },
];
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
describe('owned Security and Backup settings', () => {
  it.each([false, true])('renders the encryption state, explanations and exact actions when enabled=%s', value => {
    enabled = value; render();
    const section = document.getElementById('encryption-section')!;
    expect(section.textContent).toContain(`Encryption is ${value ? 'ON' : 'OFF'}`);
    expect(section.querySelector(`.encryption-status-${value ? 'on' : 'off'}`)).not.toBeNull();
    const actions = Array.from(section.querySelectorAll('[data-crypto-action]')).map(el => el.getAttribute('data-crypto-action'));
    expect(actions).toEqual(value ? ['change-passphrase', 'disable-encryption'] : ['enable-encryption']);
    expect(section.textContent).toContain(value ? 'API keys are encrypted' : 'device-local key');
    expect(section.innerHTML).not.toMatch(/on(click|change)=/);
    expect(document.getElementById('backup-section')!.textContent).toContain(value ? 'same passphrase required' : 'omit provider credentials');
  });

  it('refreshes encryption and backup explanations together after confirmed disable', async () => {
    enabled = true; render(); vi.spyOn(utils, 'showConfirmDialog').mockResolvedValue(true);
    const disable = vi.fn(async () => { enabled = false; }); configureCryptoUi({ disableEncryptionStorage: disable });
    await disableEncryption(); expect(disable).toHaveBeenCalledOnce();
    expect(document.getElementById('encryption-section')!.textContent).toContain('Encryption is OFF');
    expect(document.getElementById('backup-section')!.textContent).toContain('Backups are unencrypted');
  });

  it('preserves the enabled view and reports a failed disable', async () => {
    enabled = true; render(); vi.spyOn(utils, 'showConfirmDialog').mockResolvedValue(true);
    const notify = vi.spyOn(utils, 'showNotification');
    configureCryptoUi({ disableEncryptionStorage: async () => { throw new Error('Synthetic disable failure'); } });
    await disableEncryption(); expect(document.getElementById('encryption-section')!.textContent).toContain('Encryption is ON');
    expect(notify).toHaveBeenCalledWith('Failed to disable encryption: Synthetic disable failure', 'error');
  });

  it('preserves download and restore-file delegation and makes the picker a button', () => {
    render(); click('[data-crypto-action="export-backup"]'); expect(mocks.download).toHaveBeenCalledOnce();
    const input = document.querySelector<HTMLInputElement>('[data-crypto-action="import-backup"]')!;
    const choose = vi.spyOn(input, 'click');
    Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Restore Backup')!.click();
    expect(choose).toHaveBeenCalledOnce(); expect(input.hidden).toBe(true); expect(input.accept).toBe('.json');
    const file = new File(['{}'], 'synthetic.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] }); input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(mocks.import).toHaveBeenCalledExactlyOnceWith(file); expect(input.value).toBe('');
  });

  it('shows empty and populated snapshot states, correct typed IDs, and existing restore actions', async () => {
    render(); await loadBackupSnapshots();
    const toggle = document.getElementById('backup-snapshots-toggle')!; const list = document.getElementById('backup-snapshot-list')!;
    expect(toggle.hidden).toBe(true); expect(list.hidden).toBe(true);
    mocks.snapshots.mockResolvedValue(summaries); await loadBackupSnapshots(); expect(toggle.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false'); click('#backup-snapshots-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('true'); expect(list.hidden).toBe(false);
    expect(list.querySelectorAll('.backup-snapshot-item')).toHaveLength(2);
    expect(list.textContent).toContain('2 profile(s) • encrypted'); expect(list.textContent).toContain('? profile(s)');
    const restore = list.querySelectorAll<HTMLButtonElement>('[data-crypto-action="restore-auto-backup"]');
    expect(restore[0]!.dataset.cryptoSnapshotIdType).toBe('number'); restore[0]!.click(); expect(mocks.restore).toHaveBeenCalledWith(42);
    expect(restore[1]!.dataset.cryptoSnapshotId).toBe(summaries[1]!.id); restore[1]!.click(); expect(mocks.restore).toHaveBeenCalledWith(summaries[1]!.id);
    expect(list.querySelector('img,script')).toBeNull();
    toggleBackupSnapshots(); expect(list.hidden).toBe(true); expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('backup-snapshots-arrow')!.textContent).toBe('▶');
  });

  it('keeps an expanded list expanded during same-view refresh and closes it when empty', async () => {
    render(); mocks.snapshots.mockResolvedValue(summaries); await loadBackupSnapshots(); toggleBackupSnapshots();
    localStorage.setItem('labcharts-last-autobackup', '2026-01-01T00:00:00Z'); await loadBackupSnapshots();
    expect(document.getElementById('backup-snapshot-list')!.hidden).toBe(false);
    expect(document.querySelector('.backup-auto-status')!.textContent).toContain('Last auto-backup:');
    mocks.snapshots.mockResolvedValue([]); await loadBackupSnapshots();
    expect(document.getElementById('backup-snapshot-list')!.hidden).toBe(true);
    expect(document.getElementById('backup-snapshots-toggle')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not apply an earlier snapshot read to a replaced Settings view', async () => {
    render(); let finish!: (rows: typeof summaries) => void;
    mocks.snapshots.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = loadBackupSnapshots(); disposeSettingsProtection(); render(); await loadBackupSnapshots();
    finish(summaries); await pending; expect(document.querySelectorAll('.backup-snapshot-item')).toHaveLength(0);
    expect(document.getElementById('backup-snapshots-toggle')!.hidden).toBe(true);
  });

  it.each([
    { supported: false, folderName: null, permissionLost: false, lastBackup: null, actions: [] },
    { supported: true, folderName: null, permissionLost: false, lastBackup: null, actions: ['pick-folder'] },
    { supported: true, folderName: 'Synthetic <folder> & backups', permissionLost: true, lastBackup: null, actions: ['reauthorize-folder', 'remove-folder'] },
    { supported: true, folderName: 'Synthetic <folder> & backups', permissionLost: false, lastBackup: '2026-01-01T00:00:00Z', actions: ['pick-folder', 'remove-folder'] },
  ])('renders every folder capability/permission state: $actions', value => {
    render(); refreshFolderBackupSettings(getFolderBackupSnapshot(value));
    const section = document.getElementById('backup-folder-section')!;
    expect(Array.from(section.querySelectorAll('[data-backup-action]')).map(el => el.getAttribute('data-backup-action'))).toEqual(value.actions);
    expect(!!section.querySelector('[data-folder-backup-view]')).toBe(value.supported);
    if (value.folderName) expect(section.textContent).toContain(value.folderName);
    if (value.permissionLost) expect(section.textContent).toContain('access lost');
    if (value.lastBackup) expect(section.textContent).toContain('Last folder backup:');
    expect(section.querySelector('folder,img,script')).toBeNull();
  });

  it('limits summaries to the existing maximum without exposing complete backup payloads', () => {
    const rows = getBackupSnapshotRows(Array.from({ length: 7 }, (_, id) => ({ id, createdAt: '2026-01-01T00:00:00Z', encrypted: true,
      snapshot: { profiles: [{ privateMedicalData: 'Never render this' }] } })), 5);
    expect(rows).toHaveLength(5); expect(rows.map(row => row.id)).toEqual([0, 1, 2, 3, 4]);
    expect(JSON.stringify(rows)).not.toContain('Never render this');
  });
});


it('does not let delayed passphrase autofocus steal a selected confirmation field', () => {
  vi.useFakeTimers();
  try {
    render(); showEnableEncryptionModal();
    const confirmation = document.getElementById('passphrase-confirm-input')!;
    confirmation.focus(); vi.advanceTimersByTime(50);
    expect(document.activeElement).toBe(confirmation);
  } finally { vi.useRealTimers(); }
});


it('autofocuses an untouched passphrase dialog and cancels stale focus after closing it', () => {
  vi.useFakeTimers();
  try {
    render(); showEnableEncryptionModal(); vi.advanceTimersByTime(50);
    expect(document.activeElement).toBe(document.getElementById('passphrase-set-input'));
    document.getElementById('passphrase-set-cancel')!.click();
    showEnableEncryptionModal(); document.getElementById('passphrase-set-cancel')!.click();
    const button = document.querySelector<HTMLButtonElement>('[data-crypto-action="enable-encryption"]')!;
    button.focus(); vi.advanceTimersByTime(50); expect(document.activeElement).toBe(button);
  } finally { vi.useRealTimers(); }
});
