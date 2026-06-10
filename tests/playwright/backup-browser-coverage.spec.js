import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?backupBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('backup browser coverage exercises export import auto backup and folder states', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ backupUrl }) => {
    const [backup, blobStorage] = await Promise.all([
      import(backupUrl),
      import('/js/blob-storage.js'),
    ]);
    const outcomes = {};
    const profileId = `backup-browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const restoredProfileId = `${profileId}-restored`;
    const threadId = 'thread-one';
    const importedKey = `labcharts-${profileId}-imported`;
    const restoredImportedKey = `labcharts-${restoredProfileId}-imported`;
    const originalSetTimeout = window.setTimeout.bind(window);
    const saved = {
      storage: Array.from({ length: localStorage.length }, (_, i) => {
        const key = localStorage.key(i);
        return [key, key == null ? null : localStorage.getItem(key)];
      }).filter(([key]) => key != null),
      createObjectURL: URL.createObjectURL,
      revokeObjectURL: URL.revokeObjectURL,
      anchorClick: HTMLAnchorElement.prototype.click,
      setTimeout: window.setTimeout,
      getEncryptionEnabled: window.getEncryptionEnabled,
      encryptedGetItem: window.encryptedGetItem,
      showDirectoryPicker: Object.getOwnPropertyDescriptor(window, 'showDirectoryPicker'),
    };
    const delay = ms => new Promise(resolve => originalSetTimeout(resolve, ms));
    const waitFor = async (predicate, attempts = 100) => {
      for (let i = 0; i < attempts; i += 1) {
        try {
          if (await predicate()) return true;
        } catch {}
        await delay(10);
      }
      return false;
    };
    const toasts = () => Array.from(document.querySelectorAll('.notification-toast')).map(el => el.textContent || '');
    const clearToasts = () => document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    const clearBackupStores = async () => {
      const db = await backup.openBackupDB();
      for (const storeName of ['snapshots', 'folder-handle']) {
        if (!db.objectStoreNames.contains(storeName)) continue;
        await new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).clear();
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      }
    };
    const captureTimeouts = () => {
      const timers = [];
      window.setTimeout = (fn, ms, ...args) => {
        timers.push({ fn, ms, args });
        return timers.length;
      };
      return timers;
    };
    const restoreTimers = () => {
      window.setTimeout = saved.setTimeout;
    };
    const backupPayload = {
      format: 'labcharts-backup',
      version: 1,
      createdAt: '2026-06-10T08:00:00.000Z',
      encrypted: true,
      encryptionSalt: 'restored-salt',
      settings: {
        'labcharts-theme': 'glass',
        'labcharts-active-profile': restoredProfileId,
      },
      profileList: JSON.stringify([{ id: restoredProfileId, name: 'Restored Profile' }]),
      profiles: [{
        profileId: restoredProfileId,
        name: 'Restored Profile',
        keys: {
          imported: JSON.stringify({ entries: [{ date: '2026-06-10', markers: { glucose: 88 } }] }),
          chat: JSON.stringify([{ role: 'user', content: 'restore me' }]),
          units: 'US',
        },
      }],
      wearableIDB: null,
    };
    const importBackupFile = payload => new File([JSON.stringify(payload)], 'restore.json', { type: 'application/json' });

    try {
      localStorage.clear();
      await clearBackupStores();
      await blobStorage.deleteBlob(importedKey);
      await blobStorage.deleteBlob(restoredImportedKey);

      window.getEncryptionEnabled = () => true;
      localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: profileId, name: 'Backup Profile' }]));
      localStorage.setItem(importedKey, JSON.stringify({ entries: [{ date: '2026-06-09', markers: { ferritin: 41 } }] }));
      localStorage.setItem(`labcharts-${profileId}-chat`, JSON.stringify([{ role: 'user', content: 'hello' }]));
      localStorage.setItem(`labcharts-${profileId}-chat-threads`, JSON.stringify([{ id: threadId, title: 'Thread' }]));
      localStorage.setItem(`labcharts-${profileId}-chat-t_${threadId}`, JSON.stringify([{ role: 'assistant', content: 'saved thread' }]));
      localStorage.setItem(`labcharts-${profileId}-units`, 'EU');
      localStorage.setItem(`labcharts-${profileId}-chatRailOpen`, 'true');
      localStorage.setItem('labcharts-theme', 'light');
      localStorage.setItem('labcharts-active-profile', profileId);
      localStorage.setItem('labcharts-encryption-salt', 'current-salt');

      const snapshot = backup.buildBackupSnapshot();
      outcomes.snapshotIncludesProfilesSettingsThreadsAndPrefs = snapshot?.format === 'labcharts-backup'
        && snapshot.encrypted === true
        && snapshot.encryptionSalt === 'current-salt'
        && snapshot.settings?.['labcharts-theme'] === 'light'
        && snapshot.settings?.['labcharts-active-profile'] === profileId
        && snapshot.profiles?.[0]?.profileId === profileId
        && snapshot.profiles?.[0]?.keys?.imported?.includes('ferritin')
        && snapshot.profiles?.[0]?.keys?.chat?.includes('hello')
        && snapshot.profiles?.[0]?.keys?.['chat-threads']?.includes(threadId)
        && snapshot.profiles?.[0]?.keys?.[`chat-t_${threadId}`]?.includes('saved thread')
        && snapshot.profiles?.[0]?.keys?.units === 'EU'
        && snapshot.profiles?.[0]?.keys?.chatRailOpen === 'true';

      const downloads = [];
      URL.createObjectURL = blob => {
        downloads.push({ blobType: blob.type, blobSize: blob.size });
        return 'blob:backup-browser-test';
      };
      URL.revokeObjectURL = url => downloads.push({ revoked: url });
      HTMLAnchorElement.prototype.click = function click() {
        downloads.push({ href: this.href, download: this.download });
      };
      await backup.exportEncryptedBackup();
      outcomes.exportBackupCreatesDownloadAndTimestamp = downloads.some(d =>
        d.download?.startsWith('labcharts-backup-') && d.download.endsWith('.json') && d.href === 'blob:backup-browser-test'
      )
        && downloads.some(d => d.revoked === 'blob:backup-browser-test')
        && downloads.some(d => d.blobType === 'application/json' && d.blobSize > 100)
        && !!localStorage.getItem('labcharts-last-manual-backup')
        && toasts().some(text => text.includes('Backup exported successfully'));
      clearToasts();

      backup.importEncryptedBackup(new File(['not json'], 'bad.json', { type: 'application/json' }));
      await waitFor(() => toasts().some(text => text.includes('Error reading backup')));
      outcomes.invalidJsonImportShowsError = toasts().some(text => text.includes('Error reading backup'));
      clearToasts();

      backup.importEncryptedBackup(importBackupFile({ format: 'other', profileList: '[]' }));
      await waitFor(() => toasts().some(text => text.includes('Invalid backup file format')));
      outcomes.invalidFormatImportShowsError = toasts().some(text => text.includes('Invalid backup file format'));
      clearToasts();

      backup.importEncryptedBackup(importBackupFile(backupPayload));
      await waitFor(() => document.getElementById('confirm-dialog-overlay')?.classList.contains('show'));
      const cancelMessage = document.querySelector('#confirm-dialog-overlay .confirm-message')?.textContent || '';
      document.getElementById('confirm-cancel')?.click();
      await waitFor(() => !document.getElementById('confirm-dialog-overlay')?.classList.contains('show'));
      outcomes.importCancelLeavesExistingProfileList = cancelMessage.includes('This backup is encrypted')
        && localStorage.getItem('labcharts-profiles') !== backupPayload.profileList;

      const restoreTimeouts = captureTimeouts();
      backup.importEncryptedBackup(importBackupFile(backupPayload));
      await waitFor(() => document.getElementById('confirm-dialog-overlay')?.classList.contains('show'));
      document.getElementById('confirm-ok')?.click();
      await waitFor(async () => (await blobStorage.getBlob(restoredImportedKey))?.includes('glucose'));
      const restoredImported = await blobStorage.getBlob(restoredImportedKey);
      outcomes.importConfirmRestoresSettingsProfileKeysAndDefersReload =
        localStorage.getItem('labcharts-encryption-enabled') === 'true'
        && localStorage.getItem('labcharts-encryption-salt') === 'restored-salt'
        && localStorage.getItem('labcharts-profiles') === backupPayload.profileList
        && localStorage.getItem('labcharts-theme') === 'glass'
        && localStorage.getItem(`labcharts-${restoredProfileId}-chat`)?.includes('restore me') === true
        && localStorage.getItem(`labcharts-${restoredProfileId}-units`) === 'US'
        && restoredImported?.includes('glucose') === true
        && restoreTimeouts.some(t => t.ms === 1000)
        && toasts().some(text => text.includes('Backup restored'));
      restoreTimers();
      clearToasts();

      await clearBackupStores();
      const autoTimeouts = captureTimeouts();
      backup.scheduleAutoBackup();
      const autoTimer = autoTimeouts.find(t => t.ms === 300000);
      if (autoTimer) await autoTimer.fn();
      restoreTimers();
      const snapshots = await backup.getAutoBackupSnapshots();
      outcomes.scheduleAutoBackupCreatesIndexedDbSnapshot = !!autoTimer
        && snapshots.length === 1
        && snapshots[0].snapshot?.format === 'labcharts-backup'
        && localStorage.getItem('labcharts-last-autobackup') === snapshots[0].createdAt;

      await backup.restoreAutoBackup('__missing__');
      await waitFor(() => toasts().some(text => text.includes('Snapshot not found')));
      outcomes.restoreMissingAutoBackupShowsError = toasts().some(text => text.includes('Snapshot not found'));
      clearToasts();

      localStorage.setItem('labcharts-profiles', '[]');
      const autoRestoreTimeouts = captureTimeouts();
      const restoreAuto = backup.restoreAutoBackup(snapshots[0].id);
      await waitFor(() => document.getElementById('confirm-dialog-overlay')?.classList.contains('show'));
      document.getElementById('confirm-ok')?.click();
      await restoreAuto;
      await waitFor(() => localStorage.getItem('labcharts-profiles') === backupPayload.profileList);
      await waitFor(() => toasts().some(text => text.includes('Backup restored'))
        && autoRestoreTimeouts.some(t => t.ms === 1000));
      outcomes.restoreAutoBackupRestoresSnapshotAndDefersReload =
        localStorage.getItem('labcharts-profiles') === backupPayload.profileList
        && autoRestoreTimeouts.some(t => t.ms === 1000)
        && toasts().some(text => text.includes('Backup restored'));
      restoreTimers();
      clearToasts();

      delete window.showDirectoryPicker;
      outcomes.folderBackupUnsupportedRendersEmpty = backup.getFolderBackupState().supported === false
        && backup.renderFolderBackupSection() === '';

      const folderWrites = [];
      Object.defineProperty(window, 'showDirectoryPicker', {
        configurable: true,
        value: async () => ({
          name: 'Backups',
          getFileHandle: async name => ({
            createWritable: async () => ({
              write: async content => folderWrites.push({ name, content }),
              close: async () => folderWrites.push({ name, closed: true }),
            }),
          }),
        }),
      });
      const folderHtml = backup.renderFolderBackupSection();
      await backup.pickFolderForBackup();
      await waitFor(() => toasts().some(text => text.includes('Could not set backup folder')));
      outcomes.folderBackupSupportedPickerAndCloneFailurePath =
        backup.getFolderBackupState().supported === true
        && folderHtml.includes('Set backup folder')
        && folderWrites.some(entry => entry.name === 'getbased-backup-latest.json' && String(entry.content || '').includes('labcharts-backup'))
        && toasts().some(text => text.includes('Could not set backup folder'));
      clearToasts();

      localStorage.setItem('labcharts-folder-backup-last', '2026-06-10T09:00:00.000Z');
      const removeFolder = backup.removeFolderBackup();
      await waitFor(() => document.getElementById('confirm-dialog-overlay')?.classList.contains('show'));
      document.getElementById('confirm-ok')?.click();
      await removeFolder;
      outcomes.removeFolderBackupClearsState = localStorage.getItem('labcharts-folder-backup-last') === null
        && toasts().some(text => text.includes('Folder backup removed'));
    } finally {
      restoreTimers();
      URL.createObjectURL = saved.createObjectURL;
      URL.revokeObjectURL = saved.revokeObjectURL;
      HTMLAnchorElement.prototype.click = saved.anchorClick;
      if (saved.getEncryptionEnabled === undefined) delete window.getEncryptionEnabled;
      else window.getEncryptionEnabled = saved.getEncryptionEnabled;
      if (saved.encryptedGetItem === undefined) delete window.encryptedGetItem;
      else window.encryptedGetItem = saved.encryptedGetItem;
      if (saved.showDirectoryPicker) Object.defineProperty(window, 'showDirectoryPicker', saved.showDirectoryPicker);
      else delete window.showDirectoryPicker;
      await blobStorage.deleteBlob(importedKey);
      await blobStorage.deleteBlob(restoredImportedKey);
      await clearBackupStores().catch(() => {});
      localStorage.clear();
      for (const [key, value] of saved.storage) {
        if (value != null) localStorage.setItem(key, value);
      }
      document.querySelectorAll('.notification-container,.notification-toast,#confirm-dialog-overlay').forEach(el => el.remove());
    }

    return outcomes;
  }, { backupUrl: moduleUrl('/js/backup.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
