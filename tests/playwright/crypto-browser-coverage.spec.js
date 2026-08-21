import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?cryptoBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test.describe.configure({ mode: 'serial' });

test('crypto storage wrappers cover encryption cache blob and enable disable flows', async ({ page }, testInfo) => {
  testInfo.setTimeout(60_000);
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ cryptoUrl }) => {
    const cryptoStore = await import(cryptoUrl);
    const outcomes = {};
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (predicate()) return;
        await wait(50);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const typeValue = (selector, value) => {
      const input = document.querySelector(selector);
      if (!input) throw new Error(`Missing input ${selector}`);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const click = selector => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`Missing element ${selector}`);
      el.click();
    };
    const profileId = `crypto-browser-${Date.now()}`;
    const importedKey = `labcharts-${profileId}-imported`;
    const customPersonaKey = `labcharts-${profileId}-chatPersonalityCustom`;
    const keys = [
      'labcharts-encryption-enabled',
      'labcharts-encryption-salt',
      'labcharts-api-key',
      'labcharts-venice-key',
      'labcharts-openrouter-key',
      importedKey,
      customPersonaKey,
    ];
    const saved = {
      wearablesTest: window.__WEARABLES_TEST,
      storage: Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])),
    };
    let previousCryptoProfileDeps;

    try {
      for (const key of keys) localStorage.removeItem(key);
      document.getElementById('passphrase-overlay')?.remove();
      document.body.insertAdjacentHTML('beforeend', '<section id="encryption-section"></section>');
      cryptoStore.installCryptoActionDelegates(document.getElementById('encryption-section'));
      window.__WEARABLES_TEST = true;

      outcomes.startsLocked = cryptoStore.isUnlocked() === false
        && cryptoStore.getEncryptionEnabled() === false
        && cryptoStore.isEncryptedValue('v1:a:b') === true
        && cryptoStore.isEncryptedValue('plain') === false;

      const wearablesStore = await import('/js/wearables-store.js');
      const originalIndexedDbOpen = indexedDB.open;
      localStorage.setItem('labcharts-api-key', 'volatile-legacy-secret');
      cryptoStore.updateKeyCache('labcharts-api-key', null);
      wearablesStore.resetWearablesDB('credential-vault');
      let startupSurvivedVaultFailure = false;
      try {
        indexedDB.open = () => { throw new Error('simulated credential vault failure'); };
        await cryptoStore.initEncryption();
        startupSurvivedVaultFailure = true;
      } finally {
        indexedDB.open = originalIndexedDbOpen;
        wearablesStore.resetWearablesDB('credential-vault');
      }
      outcomes.startupSurvivesVaultFailureWithoutPlaintext =
        startupSurvivedVaultFailure
        && localStorage.getItem('labcharts-api-key') === null
        && cryptoStore.getCachedKey('labcharts-api-key') === 'volatile-legacy-secret';
      await cryptoStore.encryptedRemoveItem('labcharts-api-key');

      localStorage.setItem('labcharts-openrouter-key', 'legacy-plaintext-secret');
      cryptoStore.updateKeyCache('labcharts-openrouter-key', null);
      await cryptoStore.initEncryption();
      const migratedLegacyCredential = localStorage.getItem('labcharts-openrouter-key');
      outcomes.startupMigratesLegacyPlaintextCredentials =
        migratedLegacyCredential?.startsWith('d1:') === true
        && !migratedLegacyCredential.includes('legacy-plaintext-secret')
        && await cryptoStore.encryptedGetItem('labcharts-openrouter-key') === 'legacy-plaintext-secret'
        && cryptoStore.getCachedKey('labcharts-openrouter-key') === 'legacy-plaintext-secret';
      await cryptoStore.encryptedRemoveItem('labcharts-openrouter-key');

      await cryptoStore.encryptedSetItem('labcharts-api-key', 'device-protected-secret');
      const deviceProtectedRaw = localStorage.getItem('labcharts-api-key');
      outcomes.credentialsUseDeviceEncryptionWhenProfileEncryptionIsOff =
        deviceProtectedRaw?.startsWith('d1:') === true
        && !deviceProtectedRaw.includes('device-protected-secret')
        && await cryptoStore.encryptedGetItem('labcharts-api-key') === 'device-protected-secret'
        && cryptoStore.getCachedKey('labcharts-api-key') === 'device-protected-secret';
      await cryptoStore.encryptedRemoveItem('labcharts-api-key');

      localStorage.setItem(importedKey, JSON.stringify({ entries: [{ date: '2026-06-09' }] }));
      const migratedBlobValue = await cryptoStore.encryptedGetItem(importedKey);
      await cryptoStore.encryptedRemoveItem(importedKey);
      outcomes.blobMigrationAndRemoval =
        JSON.parse(migratedBlobValue || '{}').entries?.[0]?.date === '2026-06-09'
        && localStorage.getItem(importedKey) === null
        && await cryptoStore.encryptedGetItem(importedKey) === null;

      localStorage.setItem('labcharts-encryption-enabled', 'true');
      await cryptoStore._setTestSessionKey('CachePass1!');
      await cryptoStore.encryptedSetItem('labcharts-api-key', 'secret-api-key');
      const rawApiKey = localStorage.getItem('labcharts-api-key');
      const decryptedApiKey = await cryptoStore.encryptedGetItem('labcharts-api-key');
      await cryptoStore.decryptKeyCache();
      outcomes.encryptedStorageAndCache =
        rawApiKey?.startsWith('v1:') === true
        && decryptedApiKey === 'secret-api-key'
        && cryptoStore.getCachedKey('labcharts-api-key') === 'secret-api-key';

      cryptoStore.updateKeyCache('labcharts-openrouter-key', 'cached-router-key');
      const cachedValue = cryptoStore.getCachedKey('labcharts-openrouter-key');
      cryptoStore.updateKeyCache('labcharts-openrouter-key', null);
      outcomes.cacheManualUpdateAndDelete =
        cachedValue === 'cached-router-key'
        && cryptoStore.getCachedKey('labcharts-openrouter-key') === null;

      const envelope = await cryptoStore.encryptObject({ score: 42, source: 'browser' });
      const plainEnvelope = await cryptoStore.decryptObject(envelope);
      await cryptoStore._setTestSessionKey('WrongPass1!');
      const wrongKeyValue = await cryptoStore.encryptedGetItem('labcharts-api-key');
      await cryptoStore.decryptKeyCache();
      outcomes.objectEncryptionAndWrongKey =
        cryptoStore.isEncryptedObject(envelope) === true
        && plainEnvelope.score === 42
        && wrongKeyValue === null
        && cryptoStore.getCachedKey('labcharts-api-key') === null;

      const clearedSessionKey = await cryptoStore._setTestSessionKey(null);
      outcomes.sessionKeyClearReturnsNull = clearedSessionKey === null;
      localStorage.removeItem('labcharts-encryption-enabled');
      localStorage.removeItem('labcharts-encryption-salt');
      localStorage.removeItem('labcharts-api-key');
      localStorage.setItem('labcharts-venice-key', 'plain-venice-key');
      localStorage.setItem(customPersonaKey, JSON.stringify([{
        id: 'custom_existing',
        name: 'Existing Persona',
        promptText: 'Encrypt this existing persona during migration.',
      }]));
      document.getElementById('encryption-section').innerHTML = cryptoStore.renderEncryptionSection();
      outcomes.renderEncryptionSectionUsesDelegatedActions =
        !!document.querySelector('[data-crypto-action="enable-encryption"]')
        && !document.getElementById('encryption-section').innerHTML.includes('onclick=');
      click('[data-crypto-action="enable-encryption"]');
      await waitFor(() => !!document.getElementById('passphrase-set-btn'), 'enable modal');

      click('#passphrase-set-btn');
      outcomes.enableRequiresPassphrase =
        document.getElementById('passphrase-set-error')?.textContent === 'Please enter a passphrase';

      typeValue('#passphrase-set-input', 'short');
      typeValue('#passphrase-confirm-input', 'short');
      click('#passphrase-set-btn');
      outcomes.enableRejectsWeakPassphrase =
        document.getElementById('passphrase-set-error')?.textContent === 'At least 8 characters'
        && document.querySelectorAll('.passphrase-rules li.met').length === 1;

      typeValue('#passphrase-set-input', 'StrongPass1!');
      typeValue('#passphrase-confirm-input', 'MismatchPass1!');
      click('#passphrase-set-btn');
      outcomes.enableRejectsMismatch =
        document.getElementById('passphrase-set-error')?.textContent === 'Passphrases do not match'
        && document.querySelectorAll('.passphrase-rules li.met').length === 4;

      typeValue('#passphrase-confirm-input', 'StrongPass1!');
      click('#passphrase-set-btn');
      await waitFor(() => document.getElementById('passphrase-overlay')?.style.display === 'none', 'enable success');
      const encryptedVenice = localStorage.getItem('labcharts-venice-key');
      const encryptedPersonas = localStorage.getItem(customPersonaKey);
      const decryptedPersonas = await cryptoStore.encryptedGetItem(customPersonaKey);
      outcomes.enableEncryptsSensitiveKeysAndRefreshesUi =
        cryptoStore.getEncryptionEnabled() === true
        && cryptoStore.isUnlocked() === true
        && encryptedVenice?.startsWith('v1:') === true
        && encryptedPersonas?.startsWith('v1:') === true
        && JSON.parse(decryptedPersonas || '[]')[0]?.promptText.includes('existing persona')
        && cryptoStore.getCachedKey('labcharts-venice-key') === 'plain-venice-key'
        && document.getElementById('encryption-section')?.textContent.includes('Encryption is ON') === true
        && document.getElementById('notification-container')?.textContent.includes('Encryption enabled') === true;

      const disablePromise = cryptoStore.disableEncryption();
      await waitFor(() => !!document.getElementById('confirm-ok'), 'disable confirmation');
      click('#confirm-ok');
      await disablePromise;
      const deviceEncryptedVenice = localStorage.getItem('labcharts-venice-key');
      outcomes.disableDecryptsAndClearsSession =
        cryptoStore.getEncryptionEnabled() === false
        && cryptoStore.isUnlocked() === false
        && localStorage.getItem('labcharts-encryption-salt') === null
        && deviceEncryptedVenice?.startsWith('d1:') === true
        && !deviceEncryptedVenice.includes('plain-venice-key')
        && await cryptoStore.encryptedGetItem('labcharts-venice-key') === 'plain-venice-key'
        && JSON.parse(localStorage.getItem(customPersonaKey) || '[]')[0]?.id === 'custom_existing'
        && document.getElementById('encryption-section')?.textContent.includes('Encryption is OFF') === true
        && document.getElementById('notification-container')?.textContent.includes('Encryption disabled') === true;
    } finally {
      window.__WEARABLES_TEST = true;
      try { await cryptoStore._setTestSessionKey(null); } catch {}
      if (saved.wearablesTest === undefined) delete window.__WEARABLES_TEST;
      else window.__WEARABLES_TEST = saved.wearablesTest;
      for (const [key, value] of Object.entries(saved.storage)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      document.getElementById('passphrase-overlay')?.remove();
      document.getElementById('confirm-dialog-overlay')?.remove();
      document.getElementById('encryption-section')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  }, {
    cryptoUrl: moduleUrl('/js/crypto.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('crypto passphrase modals cover unlock forgot and change flows', async ({ page }, testInfo) => {
  testInfo.setTimeout(60_000);
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ cryptoUrl }) => {
    const cryptoStore = await import(cryptoUrl);
    const outcomes = {};
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 140; attempt += 1) {
        if (predicate()) return;
        await wait(50);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const typeValue = (selector, value) => {
      const input = document.querySelector(selector);
      if (!input) throw new Error(`Missing input ${selector}`);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const pressEnter = selector => {
      const input = document.querySelector(selector);
      if (!input) throw new Error(`Missing input ${selector}`);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    };
    const click = selector => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`Missing element ${selector}`);
      el.click();
    };
    const profile = {
      id: `crypto-passphrase-${Date.now()}`,
      name: 'Crypto Passphrase Profile',
      sex: 'female',
      dob: '1990-01-01',
      tags: [],
      notes: '',
      status: 'active',
      pinned: false,
      height: null,
      heightUnit: 'cm',
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };
    const keys = [
      'labcharts-encryption-enabled',
      'labcharts-encryption-salt',
      'labcharts-profiles',
      'labcharts-api-key',
    ];
    const saved = {
      wearablesTest: window.__WEARABLES_TEST,
      storage: Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])),
    };

    try {
      for (const key of keys) localStorage.removeItem(key);
      document.getElementById('passphrase-overlay')?.remove();
      window.__WEARABLES_TEST = true;
      localStorage.setItem('labcharts-profiles', JSON.stringify([profile]));
      localStorage.setItem('labcharts-api-key', 'old-api-secret');

      cryptoStore.showEnableEncryptionModal();
      await waitFor(() => !!document.getElementById('passphrase-set-btn'), 'initial enable modal');
      typeValue('#passphrase-set-input', 'OldPass1!');
      typeValue('#passphrase-confirm-input', 'OldPass1!');
      click('#passphrase-set-btn');
      await waitFor(() => document.getElementById('passphrase-overlay')?.style.display === 'none', 'initial encryption');
      outcomes.setupEncryptedProfile =
        localStorage.getItem('labcharts-profiles')?.startsWith('v1:') === true
        && localStorage.getItem('labcharts-api-key')?.startsWith('v1:') === true;

      cryptoStore.changePassphrase();
      await waitFor(() => !!document.getElementById('passphrase-change-btn'), 'change passphrase modal');
      click('#passphrase-change-btn');
      outcomes.changeRequiresCurrentPassphrase =
        document.getElementById('passphrase-change-error')?.textContent === 'Enter current passphrase';

      typeValue('#passphrase-old-input', 'OldPass1!');
      typeValue('#passphrase-new1-input', 'weak');
      typeValue('#passphrase-new2-input', 'weak');
      click('#passphrase-change-btn');
      outcomes.changeRejectsWeakPassphrase =
        document.getElementById('passphrase-change-error')?.textContent === 'At least 8 characters';

      typeValue('#passphrase-new1-input', 'NewPass1!');
      typeValue('#passphrase-new2-input', 'NoMatch1!');
      click('#passphrase-change-btn');
      outcomes.changeRejectsMismatch =
        document.getElementById('passphrase-change-error')?.textContent === 'New passphrases do not match';

      typeValue('#passphrase-old-input', 'WrongPass1!');
      typeValue('#passphrase-new1-input', 'NewPass1!');
      typeValue('#passphrase-new2-input', 'NewPass1!');
      click('#passphrase-change-btn');
      await waitFor(() => document.getElementById('passphrase-change-error')?.textContent === 'Current passphrase is incorrect', 'wrong current passphrase');
      outcomes.changeRejectsWrongCurrentPassphrase = true;

      typeValue('#passphrase-old-input', 'OldPass1!');
      typeValue('#passphrase-new1-input', 'NewPass1!');
      typeValue('#passphrase-new2-input', 'NewPass1!');
      click('#passphrase-change-btn');
      await waitFor(() => document.getElementById('passphrase-overlay')?.style.display === 'none', 'passphrase changed');
      outcomes.changePassphraseReencrypts =
        document.getElementById('notification-container')?.textContent.includes('Passphrase changed successfully') === true
        && localStorage.getItem('labcharts-profiles')?.startsWith('v1:') === true
        && localStorage.getItem('labcharts-api-key')?.startsWith('v1:') === true
        && cryptoStore.getCachedKey('labcharts-api-key') === 'old-api-secret';

      await cryptoStore._setTestSessionKey(null);
      const unlockPromise = cryptoStore.initEncryption();
      await waitFor(() => !!document.getElementById('passphrase-unlock-btn'), 'unlock modal');
      click('#passphrase-unlock-btn');
      outcomes.unlockRequiresPassphrase =
        document.getElementById('passphrase-error')?.textContent === 'Please enter your passphrase';

      click('#passphrase-forgot-btn');
      await waitFor(() => !!document.getElementById('passphrase-forgot-cancel'), 'forgot passphrase confirm');
      outcomes.forgotPassphraseShowsEraseWarning =
        document.getElementById('passphrase-overlay')?.textContent.includes('Erase All Data?') === true;
      click('#passphrase-forgot-cancel');
      await waitFor(() => !!document.getElementById('passphrase-unlock-btn'), 'forgot cancel restore');

      typeValue('#passphrase-unlock-input', 'WrongPass1!');
      click('#passphrase-unlock-btn');
      await waitFor(() => document.getElementById('passphrase-error')?.textContent.includes('Wrong passphrase'), 'wrong unlock');
      outcomes.unlockRejectsWrongPassphrase = true;

      typeValue('#passphrase-unlock-input', 'NewPass1!');
      pressEnter('#passphrase-unlock-input');
      await unlockPromise;
      outcomes.unlockAcceptsChangedPassphrase =
        cryptoStore.isUnlocked() === true
        && await cryptoStore.encryptedGetItem('labcharts-api-key') === 'old-api-secret'
        && document.getElementById('passphrase-overlay')?.style.display === 'none';
    } finally {
      window.__WEARABLES_TEST = true;
      try { await cryptoStore._setTestSessionKey(null); } catch {}
      if (saved.wearablesTest === undefined) delete window.__WEARABLES_TEST;
      else window.__WEARABLES_TEST = saved.wearablesTest;
      for (const [key, value] of Object.entries(saved.storage)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      document.getElementById('passphrase-overlay')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  }, {
    cryptoUrl: moduleUrl('/js/crypto.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('crypto nudges broadcast and backup snapshot browser paths run', async ({ page }, testInfo) => {
  testInfo.setTimeout(60_000);
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ cryptoUrl }) => {
    const outcomes = {};
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (predicate()) return;
        await wait(50);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const originalBroadcastDescriptor = Object.getOwnPropertyDescriptor(window, 'BroadcastChannel');
    const calls = { migrated: 0, sidebar: 0, navigated: [] };
    let lastChannel = null;
    class FakeBroadcastChannel {
      constructor(name) {
        this.name = name;
        this.messages = [];
        lastChannel = this;
      }
      postMessage(message) {
        this.messages.push(message);
      }
      close() {}
    }
    Object.defineProperty(window, 'BroadcastChannel', {
      configurable: true,
      writable: true,
      value: FakeBroadcastChannel,
    });

    const cryptoStore = await import(cryptoUrl);
    const [{ state }, profileModule] = await Promise.all([
      import('/js/state.js'),
      import('/js/profile.js'),
    ]);
    const profileId = `crypto-broadcast-${Date.now()}`;
    const importedKey = profileModule.profileStorageKey(profileId, 'imported');
    const keys = [
      'labcharts-encryption-enabled',
      'labcharts-encryption-nudge-dismissed',
      'labcharts-backup-nudge-snoozed-until',
      'labcharts-last-manual-backup',
      'labcharts-folder-backup-last',
      'labcharts-profiles',
      importedKey,
    ];
    let savedBackupSnapshots = null;
    const saved = {
      profile: state.currentProfile,
      view: state.currentView,
      importedData: state.importedData,
      storage: Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])),
    };

    try {
      for (const key of keys) localStorage.removeItem(key);
      document.getElementById('passphrase-overlay')?.remove();
      state.currentProfile = profileId;
      state.currentView = 'settings';
      previousCryptoProfileDeps = cryptoStore.configureCryptoProfileDeps({
        buildSidebar: () => { calls.sidebar += 1; },
        migrateProfileData: data => {
          calls.migrated += 1;
          data.migratedByTest = true;
        },
        navigate: view => { calls.navigated.push(view); },
      });
      await cryptoStore.encryptedSetItem(importedKey, JSON.stringify({
        entries: [{ date: '2026-06-09', markers: { metabolic: { glucose: 5.2 } } }],
      }));

      cryptoStore.initBroadcastChannel();
      await lastChannel.onmessage({ data: { type: 'noop', profileId } });
      await lastChannel.onmessage({ data: { type: 'data-changed', profileId: `${profileId}-other` } });
      await lastChannel.onmessage({ data: { type: 'data-changed', profileId } });
      cryptoStore.broadcastDataChanged(profileId);
      outcomes.broadcastReloadsCurrentProfile =
        lastChannel?.name === 'labcharts-sync'
        && calls.migrated === 1
        && calls.sidebar === 1
        && calls.navigated[0] === 'settings'
        && state.importedData.entries?.[0]?.date === '2026-06-09'
        && Array.isArray(state.importedData.notes)
        && Array.isArray(state.importedData.supplements)
        && lastChannel.messages[0]?.profileId === profileId;

      localStorage.removeItem('labcharts-encryption-enabled');
      localStorage.removeItem('labcharts-encryption-nudge-dismissed');
      cryptoStore.maybeShowEncryptionNudge();
      await waitFor(() => !!document.getElementById('encryption-nudge-dismiss'), 'encryption nudge');
      document.getElementById('encryption-nudge-dismiss').click();
      outcomes.encryptionNudgeDismisses =
        localStorage.getItem('labcharts-encryption-nudge-dismissed') === 'true'
        && document.getElementById('passphrase-overlay')?.style.display === 'none';

      localStorage.removeItem('labcharts-encryption-nudge-dismissed');
      cryptoStore.maybeShowEncryptionNudge();
      await waitFor(() => !!document.getElementById('encryption-nudge-enable'), 'encryption nudge enable');
      document.getElementById('encryption-nudge-enable').click();
      await waitFor(() => !!document.getElementById('passphrase-set-input'), 'enable modal from nudge');
      outcomes.encryptionNudgeOpensEnableModal =
        document.getElementById('passphrase-overlay')?.textContent.includes('Enable Encryption') === true;
      document.getElementById('passphrase-set-cancel')?.click();

      localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: profileId, name: 'Backup Profile' }]));
      localStorage.setItem(importedKey, JSON.stringify({ entries: [{ date: '2026-06-09' }] }));
      localStorage.removeItem('labcharts-backup-nudge-snoozed-until');
      localStorage.removeItem('labcharts-last-manual-backup');
      localStorage.removeItem('labcharts-folder-backup-last');
      document.getElementById('tour-overlay')?.remove();
      cryptoStore.maybeShowBackupNudge();
      await waitFor(() => !!document.getElementById('backup-nudge-snooze'), 'backup nudge');
      document.getElementById('backup-nudge-snooze').click();
      outcomes.backupNudgeSnoozes =
        Number(localStorage.getItem('labcharts-backup-nudge-snoozed-until')) > Date.now()
        && document.getElementById('passphrase-overlay')?.style.display === 'none';

      const backupDb = await cryptoStore.openBackupDB();
      savedBackupSnapshots = await new Promise((resolve, reject) => {
        const tx = backupDb.transaction('snapshots', 'readonly');
        const req = tx.objectStore('snapshots').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      await new Promise((resolve, reject) => {
        const tx = backupDb.transaction('snapshots', 'readwrite');
        tx.objectStore('snapshots').clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });

      const backupHost = document.createElement('section');
      backupHost.id = 'crypto-backup-coverage-host';
      backupHost.innerHTML = cryptoStore.renderBackupSection();
      document.body.appendChild(backupHost);
      cryptoStore.installCryptoActionDelegates(backupHost);
      outcomes.renderBackupSectionUsesDelegatedActions =
        !!backupHost.querySelector('[data-crypto-action="export-backup"]')
        && !!backupHost.querySelector('[data-crypto-action="import-backup"]')
        && !!backupHost.querySelector('[data-crypto-action="toggle-backup-snapshots"]')
        && !/on(click|change)=/.test(backupHost.innerHTML);
      await cryptoStore.loadBackupSnapshots();
      outcomes.emptySnapshotsHideList =
        document.getElementById('backup-snapshot-list')?.style.display === 'none';

      const tx = backupDb.transaction('snapshots', 'readwrite');
      const store = tx.objectStore('snapshots');
      store.add({
        createdAt: new Date('2026-06-09T10:00:00.000Z').toISOString(),
        encrypted: true,
        snapshot: { profiles: [{ id: profileId }] },
      });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      await cryptoStore.loadBackupSnapshots();
      document.getElementById('backup-snapshots-toggle')?.click();
      const openedDisplay = document.getElementById('backup-snapshot-list')?.style.display;
      const openedArrow = document.getElementById('backup-snapshots-arrow')?.innerHTML;
      document.getElementById('backup-snapshots-toggle')?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      const restoreBtn = document.querySelector('[data-crypto-action="restore-auto-backup"]');
      outcomes.snapshotsRenderDelegatedRestoreButton =
        document.querySelectorAll('.backup-snapshot-item').length === 1
        && !!restoreBtn?.dataset.cryptoSnapshotId
        && ['number', 'string'].includes(restoreBtn?.dataset.cryptoSnapshotIdType || '')
        && document.querySelector('.backup-snapshot-meta')?.textContent.includes('1 profile(s)') === true
        && document.querySelector('.backup-snapshot-meta')?.textContent.includes('encrypted') === true;
      outcomes.snapshotsDelegatedClickToggleOpens =
        openedDisplay === 'flex'
        && openedArrow === '\u25bc';
      outcomes.snapshotsDelegatedKeyboardToggleCloses =
        document.getElementById('backup-snapshot-list')?.style.display === 'none'
        && document.getElementById('backup-snapshots-arrow')?.innerHTML === '\u25b6';
    } finally {
      state.currentProfile = saved.profile;
      state.currentView = saved.view;
      state.importedData = saved.importedData;
      if (previousCryptoProfileDeps) cryptoStore.configureCryptoProfileDeps(previousCryptoProfileDeps);
      if (originalBroadcastDescriptor) {
        Object.defineProperty(window, 'BroadcastChannel', originalBroadcastDescriptor);
      } else {
        delete window.BroadcastChannel;
      }
      await cryptoStore.encryptedRemoveItem(importedKey);
      if (savedBackupSnapshots) {
        const db = await cryptoStore.openBackupDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('snapshots', 'readwrite');
          const store = tx.objectStore('snapshots');
          store.clear();
          for (const snapshot of savedBackupSnapshots) store.put(snapshot);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      }
      for (const [key, value] of Object.entries(saved.storage)) {
        if (key === importedKey) continue;
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      document.getElementById('passphrase-overlay')?.remove();
      document.getElementById('crypto-backup-coverage-host')?.remove();
    }

    return outcomes;
  }, {
    cryptoUrl: moduleUrl('/js/crypto.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
