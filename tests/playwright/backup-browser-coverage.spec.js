import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?backupBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('backup browser coverage exercises export import auto backup and folder states', async ({ page }) => {
  let backupCycleRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/js/backup-cycle.js') {
      backupCycleRequests += 1;
    }
  });

  await page.goto('/app', { waitUntil: 'networkidle' });
  expect(backupCycleRequests).toBe(0);

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
    const originalProfileList = JSON.stringify([{ id: profileId, name: 'Backup Profile' }]);
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
      showDirectoryPicker: Object.getOwnPropertyDescriptor(window, 'showDirectoryPicker'),
    };
    const previousBackupRuntimeDeps = backup.configureBackupRuntimeDeps({
      encryptedGetItem: async key => {
        if (key === `labcharts-${profileId}-chat-threads`) {
          return JSON.stringify([{ id: threadId, title: 'Thread', projectName: 'Metabolic project' }]);
        }
        return localStorage.getItem(key);
      },
      getEncryptionEnabled: () => true,
    });
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
          chatPersonalityCustom: 'v1:restored-encrypted-personas',
          chatPersonalityDeleted: 'v1:restored-encrypted-persona-tombstones',
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

      localStorage.setItem('labcharts-profiles', originalProfileList);
      localStorage.setItem(importedKey, JSON.stringify({ entries: [{ date: '2026-06-09', markers: { ferritin: 41 } }] }));
      localStorage.setItem(`labcharts-${profileId}-chat`, JSON.stringify([{ role: 'user', content: 'hello' }]));
      localStorage.setItem(`labcharts-${profileId}-chat-threads`, JSON.stringify([{ id: threadId, title: 'Thread', projectName: 'Metabolic project' }]));
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
        && snapshot.profiles?.[0]?.keys?.['chat-threads']?.includes('Metabolic project')
        && snapshot.profiles?.[0]?.keys?.[`chat-t_${threadId}`]?.includes('saved thread')
        && snapshot.profiles?.[0]?.keys?.units === 'EU'
        && snapshot.profiles?.[0]?.keys?.chatRailOpen === 'true';

      const serializedBytes = backup.serializeBackupSnapshot({
        bytes: new Uint8Array([0, 127, 255]),
        encrypted: {
          _enc: 'v1',
          iv: { 0: 1, 1: 2 },
          ct: { 0: 3, 1: 4 },
        },
      });
      const parsedBytes = backup.parseBackupSnapshot(serializedBytes);
      outcomes.backupSerializationRoundTripsCurrentAndLegacyByteArrays =
        parsedBytes.bytes instanceof Uint8Array
        && parsedBytes.bytes.join(',') === '0,127,255'
        && parsedBytes.encrypted.iv instanceof Uint8Array
        && parsedBytes.encrypted.iv.join(',') === '1,2'
        && parsedBytes.encrypted.ct instanceof Uint8Array
        && parsedBytes.encrypted.ct.join(',') === '3,4';

      localStorage.removeItem(importedKey);
      await blobStorage.setBlob(importedKey, JSON.stringify({ entries: [{ date: '2026-06-11', markers: { cobalt: 3 } }] }));
      const fullSnapshot = await backup.buildFullBackupSnapshot();
      outcomes.fullSnapshotReadsRawImportedBlob = fullSnapshot?.profiles?.[0]?.keys?.imported?.includes('cobalt') === true;

      localStorage.setItem(`labcharts-${profileId}-chat-threads`, 'v1:encrypted-thread-index');
      localStorage.setItem(`labcharts-${profileId}-chat-t_${threadId}`, 'v1:encrypted-thread-messages');
      localStorage.setItem(`labcharts-${profileId}-chatPersonalityCustom`, 'v1:encrypted-custom-personas');
      localStorage.setItem(`labcharts-${profileId}-chatPersonalityDeleted`, 'v1:encrypted-persona-tombstones');
      const encryptedChatSnapshot = await backup.buildFullBackupSnapshot();
      outcomes.fullSnapshotPreservesEncryptedChatAndPersonaEnvelopes =
        encryptedChatSnapshot?.profiles?.[0]?.keys?.['chat-threads'] === 'v1:encrypted-thread-index'
        && encryptedChatSnapshot?.profiles?.[0]?.keys?.[`chat-t_${threadId}`] === 'v1:encrypted-thread-messages'
        && encryptedChatSnapshot?.profiles?.[0]?.keys?.chatPersonalityCustom === 'v1:encrypted-custom-personas'
        && encryptedChatSnapshot?.profiles?.[0]?.keys?.chatPersonalityDeleted === 'v1:encrypted-persona-tombstones';
      localStorage.setItem(`labcharts-${profileId}-chat-threads`, JSON.stringify([{ id: threadId, title: 'Thread', projectName: 'Metabolic project' }]));
      localStorage.setItem(`labcharts-${profileId}-chat-t_${threadId}`, JSON.stringify([{ role: 'assistant', content: 'saved thread' }]));

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
        && localStorage.getItem('labcharts-profiles') === originalProfileList;

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
        && localStorage.getItem(`labcharts-${restoredProfileId}-chatPersonalityCustom`) === 'v1:restored-encrypted-personas'
        && localStorage.getItem(`labcharts-${restoredProfileId}-chatPersonalityDeleted`) === 'v1:restored-encrypted-persona-tombstones'
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

      await blobStorage.deleteBlob(restoredImportedKey);
      localStorage.removeItem(restoredImportedKey);
      localStorage.setItem('labcharts-profiles', '[]');
      const autoRestoreTimeouts = captureTimeouts();
      const restoreAuto = backup.restoreAutoBackup(snapshots[0].id);
      await waitFor(() => document.getElementById('confirm-dialog-overlay')?.classList.contains('show'));
      document.getElementById('confirm-ok')?.click();
      await restoreAuto;
      await waitFor(() => localStorage.getItem('labcharts-profiles') === backupPayload.profileList);
      await waitFor(async () => (await blobStorage.getBlob(restoredImportedKey))?.includes('glucose'));
      const autoRestoredImported = await blobStorage.getBlob(restoredImportedKey);
      await waitFor(() => toasts().some(text => text.includes('Backup restored'))
        && autoRestoreTimeouts.some(t => t.ms === 1000));
      outcomes.restoreAutoBackupRestoresSnapshotAndDefersReload =
        localStorage.getItem('labcharts-profiles') === backupPayload.profileList
        && autoRestoredImported?.includes('glucose') === true
        && localStorage.getItem(restoredImportedKey) === null
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
      const folderHost = document.createElement('section');
      folderHost.innerHTML = folderHtml;
      document.body.appendChild(folderHost);
      backup.installBackupActionDelegates(folderHost);
      folderHost.querySelector('[data-backup-action="pick-folder"]')?.click();
      await waitFor(() => toasts().some(text => text.includes('Could not set backup folder')));
      outcomes.folderBackupSupportedPickerAndCloneFailurePath =
        backup.getFolderBackupState().supported === true
        && folderHtml.includes('Set backup folder')
        && folderHtml.includes('data-backup-action="pick-folder"')
        && !folderHtml.includes('onclick=')
        && folderWrites.some(entry => entry.name === 'getbased-backup-latest.json' && String(entry.content || '').includes('labcharts-backup'))
        && toasts().some(text => text.includes('Could not set backup folder'));
      folderHost.remove();
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
      backup.configureBackupRuntimeDeps(previousBackupRuntimeDeps);
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
  expect(backupCycleRequests).toBe(1);
});

test('backup browser coverage exercises IDB errors and folder reauthorization', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ backupUrl }) => {
    const backup = await import(backupUrl);
    const outcomes = {};
    const saved = {
      indexedDB: Object.getOwnPropertyDescriptor(window, 'indexedDB'),
      showDirectoryPicker: Object.getOwnPropertyDescriptor(window, 'showDirectoryPicker'),
    };
    const originalSetTimeout = window.setTimeout.bind(window);
    const delay = ms => new Promise(resolve => originalSetTimeout(resolve, ms));
    const toasts = () => Array.from(document.querySelectorAll('.notification-toast')).map(el => el.textContent || '');
    const clearToasts = () => document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    let mode = 'open-error';
    let requestPermissionResult = 'granted';
    let requestPermissionCalls = 0;
    const folderHandle = {
      name: 'Coverage Backups',
      queryPermission: async () => 'prompt',
      requestPermission: async () => {
        requestPermissionCalls += 1;
        if (requestPermissionResult === 'throw') throw new Error('permission prompt blocked');
        return requestPermissionResult;
      },
    };

    const requestError = message => {
      const req = { error: new Error(message), result: undefined, onsuccess: null, onerror: null };
      originalSetTimeout(() => req.onerror?.({ target: req }), 0);
      return req;
    };
    const successRequest = result => {
      const req = { error: null, result, onsuccess: null, onerror: null };
      originalSetTimeout(() => req.onsuccess?.({ target: req }), 0);
      return req;
    };
    const makeStore = storeName => ({
      getAll: () => (mode === 'snapshots-getall-error'
        ? requestError('snapshot list failed')
        : successRequest([])),
      get: () => {
        if (storeName === 'folder-handle') {
          if (mode === 'folder-get-error') return requestError('folder handle failed');
          if (mode === 'folder-handle-denied') return successRequest(folderHandle);
          return successRequest(null);
        }
        if (mode === 'snapshot-get-error') return requestError('snapshot get failed');
        return successRequest(null);
      },
      put: () => successRequest(undefined),
      delete: () => successRequest(undefined),
      clear: () => successRequest(undefined),
      add: () => successRequest(undefined),
      count: () => successRequest(0),
      openCursor: () => successRequest(null),
    });
    const fakeDb = {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => ({}),
      transaction: storeName => {
        const tx = {
          error: null,
          objectStore: () => makeStore(storeName),
          oncomplete: null,
          onerror: null,
        };
        originalSetTimeout(() => tx.oncomplete?.({ target: tx }), 0);
        return tx;
      },
    };
    const openSuccess = () => {
      const req = { error: null, result: fakeDb, onupgradeneeded: null, onsuccess: null, onerror: null };
      originalSetTimeout(() => req.onsuccess?.({ target: req }), 0);
      return req;
    };

    try {
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: {
        open: () => (mode === 'open-error' ? requestError('backup db open failed') : openSuccess()),
        },
      });
      Object.defineProperty(window, 'showDirectoryPicker', {
        configurable: true,
        value: async () => folderHandle,
      });

      const openError = await backup.openBackupDB().then(
        () => '',
        error => error?.message || String(error)
      );
      outcomes.openBackupDBRejectsOpenErrors = openError.includes('backup db open failed');

      mode = 'snapshots-getall-error';
      const snapshots = await backup.getAutoBackupSnapshots();
      outcomes.getAutoBackupSnapshotsResolvesEmptyOnRequestError = Array.isArray(snapshots)
        && snapshots.length === 0;

      mode = 'snapshot-get-error';
      const restoreError = await backup.restoreAutoBackup(42).then(
        () => '',
        error => error?.message || String(error)
      );
      outcomes.restoreAutoBackupRejectsRequestErrors = restoreError.includes('snapshot get failed');

      mode = 'folder-get-error';
      await backup.initFolderBackup();
      outcomes.initFolderBackupIgnoresStoredHandleReadErrors = backup.getFolderBackupState().folderName === null;

      mode = 'folder-handle-denied';
      await backup.initFolderBackup();
      await delay(20);
      outcomes.initFolderBackupMarksPermissionLost = backup.getFolderBackupState().permissionLost === true
        && backup.renderFolderBackupSection().includes('Restore access');

      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await delay(20);
      outcomes.deferredFolderReauthRestoresAccess = requestPermissionCalls === 1
        && backup.getFolderBackupState().permissionLost === false
        && backup.renderFolderBackupSection().includes('Coverage Backups');

      requestPermissionResult = 'denied';
      await backup.reauthorizeFolderBackup();
      outcomes.reauthorizeFolderBackupReportsDeniedPermission = requestPermissionCalls === 2
        && toasts().some(text => text.includes('Permission denied'));
      clearToasts();

      requestPermissionResult = 'throw';
      await backup.reauthorizeFolderBackup();
      outcomes.reauthorizeFolderBackupReportsPromptErrors = requestPermissionCalls === 3
        && toasts().some(text => text.includes('Could not restore access'));
    } finally {
      if (saved.indexedDB) Object.defineProperty(window, 'indexedDB', saved.indexedDB);
      else delete window.indexedDB;
      if (saved.showDirectoryPicker) Object.defineProperty(window, 'showDirectoryPicker', saved.showDirectoryPicker);
      else delete window.showDirectoryPicker;
      clearToasts();
      document.querySelectorAll('#backup-folder-section').forEach(el => el.remove());
    }

    return outcomes;
  }, { backupUrl: moduleUrl('/js/backup.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
