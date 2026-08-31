import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?syncIdentityCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openIdentityPage(page) {
  let bip39Requests = 0;
  let qrRequests = 0;
  await page.route('**/vendor/bip39-minimal.js', async route => {
    bip39Requests += 1;
    if (bip39Requests === 1) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: 'window.bip39 = { loadedFromRoute: true, generateMnemonic: async () => "seed phrase" };',
    });
  });
  await page.route('**/vendor/qrcode-generator.js', async route => {
    qrRequests += 1;
    if (qrRequests === 1) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: `window.qrcode = function routedQRCode() {
        return {
          addData() {},
          make() {},
          createSvgTag() { return '<svg data-routed-qr="1"></svg>'; },
        };
      };`,
    });
  });
  await page.route('**/sync-identity-browser-coverage', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><head></head><body><div id="notification-container"></div></body></html>',
    });
  });
  await page.goto('/sync-identity-browser-coverage', { waitUntil: 'load' });
}

test('sync identity browser coverage handles libraries getters pending restore and failures', async ({ page }) => {
  await openIdentityPage(page);

  const results = await page.evaluate(async ({ identityUrl }) => {
    const identity = await import(identityUrl);
    const expectedOutcomes = [
      'defaultInjectedDepsReturnEmpty',
      'defaultSeedLocalDependencyIsCallable',
      'ensureBip39UsesExistingGlobal',
      'ensureBip39RetriesAfterFailure',
      'ensureQRCodeUsesExistingGlobal',
      'ensureQRCodeRetriesAfterFailure',
      'mnemonicGettersUseInjectedOwner',
      'fingerprintIsStableAndOwnerSpecific',
      'mnemonicGettersHandleThrownDeps',
      'pendingFlagReadsAndClears',
      'restoreJoinClearsSyncStorageAndMarksPending',
      'restoreSeedLocalClearsPendingAndSeeds',
      'sameIdentityRestorePreservesPendingDelete',
      'restoreFailureNotifiesAndReturnsFalse',
      'restoreWithoutEvoluReturnsFalse',
    ];
    const outcomes = Object.fromEntries(expectedOutcomes.map(name => [name, false]));
    const storage = new Map(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter(key => key !== null)
        .map(key => [key, localStorage.getItem(key)])
    );
    const hadBip39 = Object.prototype.hasOwnProperty.call(window, 'bip39');
    const savedBip39 = window.bip39;
    const hadQRCode = Object.prototype.hasOwnProperty.call(window, 'qrcode');
    const savedQRCode = window.qrcode;
    const savedSetTimeout = window.setTimeout;
    const savedRestoreNotice = sessionStorage.getItem(identity.RESTORE_NOTICE_KEY);
    const savedBody = document.body.innerHTML;
    const savedScripts = Array.from(document.scripts).map(script => script.getAttribute('src')).filter(Boolean);
    const notifications = () => document.getElementById('notification-container')?.textContent || '';
    const clearNotifications = () => {
      document.getElementById('notification-container').innerHTML = '';
      document.querySelectorAll('.notification-toast').forEach(toast => toast.remove());
    };
    const scheduledDelays = [];

    try {
      localStorage.clear();
      document.body.innerHTML = '<div id="notification-container"></div>';
      window.setTimeout = (_fn, delay = 0) => {
        scheduledDelays.push(delay);
        return scheduledDelays.length;
      };

      outcomes.defaultInjectedDepsReturnEmpty = identity.getMnemonic() === null
        && identity.getMnemonicResolutionError() === null
        && await identity.restoreFromMnemonic('missing evolu') === false
        && notifications().includes('Sync is still starting');

      identity.configureSyncIdentity({
        getEvolu: () => ({ restoreAppOwner: async () => {} }),
      });
      clearNotifications();
      scheduledDelays.length = 0;
      const defaultSeedResult = await identity.restoreFromMnemonic('default seed mnemonic', { seedLocal: true });
      outcomes.defaultSeedLocalDependencyIsCallable = defaultSeedResult === true
        && identity.isRestoreJoinPending() === false
        && scheduledDelays.includes(500)
        && notifications().includes('seeded this device')
        && identity.consumeSyncRestoreNotice()?.includes('data was republished') === true;

      window.bip39 = { existing: true };
      outcomes.ensureBip39UsesExistingGlobal = await identity.ensureBip39() === window.bip39;
      delete window.bip39;
      let bip39LoadFailed = false;
      try {
        await identity.ensureBip39();
      } catch (error) {
        bip39LoadFailed = String(error?.message || error).includes('Failed to load');
      }
      document.querySelector('script[src="/vendor/bip39-minimal.js"]')?.remove();
      const loadedBip39 = await identity.ensureBip39();
      outcomes.ensureBip39RetriesAfterFailure = bip39LoadFailed
        && loadedBip39?.loadedFromRoute === true
        && window.bip39 === loadedBip39;

      window.qrcode = function existingQRCode() {};
      outcomes.ensureQRCodeUsesExistingGlobal = await identity.ensureQRCode() === window.qrcode;
      delete window.qrcode;
      let qrLoadFailed = false;
      try {
        await identity.ensureQRCode();
      } catch (error) {
        qrLoadFailed = String(error?.message || error).includes('Failed to load');
      }
      document.querySelector('script[src="/vendor/qrcode-generator.js"]')?.remove();
      const loadedQRCode = await identity.ensureQRCode();
      outcomes.ensureQRCodeRetriesAfterFailure = qrLoadFailed
        && typeof loadedQRCode === 'function'
        && loadedQRCode().createSvgTag().includes('data-routed-qr');

      identity.configureSyncIdentity({
        getAppOwner: () => ({ id: 'owner-alpha', mnemonic: 'alpha bravo charlie' }),
        getAppOwnerError: () => 'owner blocked',
      });
      outcomes.mnemonicGettersUseInjectedOwner = identity.getMnemonic() === 'alpha bravo charlie'
        && identity.getMnemonicResolutionError() === 'owner blocked';
      const firstFingerprint = await identity.getSyncIdentityFingerprint();
      const repeatedFingerprint = await identity.getSyncIdentityFingerprint();
      identity.configureSyncIdentity({ getAppOwner: () => ({ id: 'owner-beta' }) });
      const otherFingerprint = await identity.getSyncIdentityFingerprint();
      outcomes.fingerprintIsStableAndOwnerSpecific = /^[0-9A-F]{4}(?:-[0-9A-F]{4}){2}$/.test(firstFingerprint || '')
        && firstFingerprint === repeatedFingerprint
        && otherFingerprint !== firstFingerprint;

      identity.configureSyncIdentity({
        getAppOwner: () => { throw new Error('owner getter failed'); },
        getAppOwnerError: () => { throw new Error('error getter failed'); },
      });
      outcomes.mnemonicGettersHandleThrownDeps = identity.getMnemonic() === null
        && identity.getMnemonicResolutionError() === null;

      localStorage.setItem(identity.RESTORE_JOIN_PENDING_KEY, '1');
      outcomes.pendingFlagReadsAndClears = identity.isRestoreJoinPending() === true;
      identity.clearRestoreJoinPending();
      outcomes.pendingFlagReadsAndClears &&= identity.isRestoreJoinPending() === false;

      const cleanupKeys = [
        'coverage-profile-sync-ts',
        'coverage-profile-delta-snapshot',
        'coverage-profile-sync-cutover-v2',
        'coverage-profile-relay-bytes-owner',
        'labcharts-relay-quota-warned',
        identity.RESTORE_JOIN_PENDING_KEY,
      ];
      const identityDeleteKeys = [
        'labcharts-profile-delete-intent-old-owner-profile',
        'labcharts-tombstone-pending-old-owner-profile',
      ];
      const cleanupKeysClearedByJoinRestore = cleanupKeys
        .filter(key => key !== identity.RESTORE_JOIN_PENDING_KEY);
      for (const key of cleanupKeys) localStorage.setItem(key, 'remove-me');
      for (const key of identityDeleteKeys) localStorage.setItem(key, 'remove-me');
      localStorage.setItem('coverage-keep-key', 'keep-me');

      scheduledDelays.length = 0;
      const restoreCalls = [];
      let seedCalls = 0;
      const evolu = {
        restoreAppOwner: async (mnemonic, options) => { restoreCalls.push({ mnemonic, options }); },
      };
      identity.configureSyncIdentity({
        getEvolu: () => evolu,
        seedLocalProfiles: async () => { seedCalls += 1; },
      });

      clearNotifications();
      const joinResult = await identity.restoreFromMnemonic('  JOIN   OWNER\nMNEMONIC  ');
      outcomes.restoreJoinClearsSyncStorageAndMarksPending = joinResult === true
        && restoreCalls[0]?.mnemonic === 'join owner mnemonic'
        && restoreCalls[0]?.options?.reload === false
        && localStorage.getItem('labcharts-sync-enabled') === 'true'
        && seedCalls === 0
        && identity.isRestoreJoinPending() === true
        && cleanupKeysClearedByJoinRestore.every(key => localStorage.getItem(key) === null)
        && identityDeleteKeys.every(key => localStorage.getItem(key) === null)
        && localStorage.getItem(identity.RESTORE_JOIN_PENDING_KEY) !== null
        && localStorage.getItem(identity.RESTORE_JOIN_PENDING_KEY) !== 'remove-me'
        && localStorage.getItem('coverage-keep-key') === 'keep-me'
        && scheduledDelays.includes(500)
        && notifications().includes('Restored from mnemonic')
        && identity.consumeSyncRestoreNotice()?.includes('Joined existing sync identity') === true;

      clearNotifications();
      scheduledDelays.length = 0;
      for (const key of identityDeleteKeys) localStorage.setItem(key, 'remove-on-owner-change');
      const seededResult = await identity.restoreFromMnemonic('seed local mnemonic', { seedLocal: true });
      outcomes.restoreSeedLocalClearsPendingAndSeeds = seededResult === true
        && restoreCalls[1]?.mnemonic === 'seed local mnemonic'
        && restoreCalls[1]?.options?.reload === false
        && seedCalls === 1
        && identityDeleteKeys.every(key => localStorage.getItem(key) === null)
        && identity.isRestoreJoinPending() === false
        && scheduledDelays.includes(500)
        && notifications().includes('seeded this device')
        && identity.consumeSyncRestoreNotice()?.includes('data was republished') === true;

      identity.configureSyncIdentity({
        getAppOwner: () => ({ id: 'same-owner', mnemonic: 'same owner mnemonic' }),
      });
      for (const key of identityDeleteKeys) localStorage.setItem(key, 'preserve-on-same-owner');
      const sameOwnerResult = await identity.restoreFromMnemonic(' same   owner\nmnemonic ', { seedLocal: true });
      outcomes.sameIdentityRestorePreservesPendingDelete = sameOwnerResult === true
        && restoreCalls[2]?.mnemonic === 'same owner mnemonic'
        && restoreCalls[2]?.options?.reload === false
        && identityDeleteKeys.every(key => localStorage.getItem(key) === 'preserve-on-same-owner');
      for (const key of identityDeleteKeys) localStorage.removeItem(key);

      clearNotifications();
      identity.configureSyncIdentity({
        getEvolu: () => ({ restoreAppOwner: async () => { throw new Error('bad seed'); } }),
      });
      const failureResult = await identity.restoreFromMnemonic('bad mnemonic');
      outcomes.restoreFailureNotifiesAndReturnsFalse = failureResult === false
        && notifications().includes('Invalid mnemonic')
        && identity.consumeSyncRestoreNotice() === null;

      clearNotifications();
      identity.configureSyncIdentity({ getEvolu: () => null });
      outcomes.restoreWithoutEvoluReturnsFalse = await identity.restoreFromMnemonic('missing evolu') === false
        && notifications().includes('Sync is still starting');
    } finally {
      window.setTimeout = savedSetTimeout;
      if (hadBip39) window.bip39 = savedBip39;
      else delete window.bip39;
      if (hadQRCode) window.qrcode = savedQRCode;
      else delete window.qrcode;
      identity.configureSyncIdentity({
        getAppOwner: () => null,
        getAppOwnerError: () => null,
        getEvolu: () => null,
        seedLocalProfiles: async () => {},
      });
      localStorage.clear();
      if (savedRestoreNotice == null) sessionStorage.removeItem(identity.RESTORE_NOTICE_KEY);
      else sessionStorage.setItem(identity.RESTORE_NOTICE_KEY, savedRestoreNotice);
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      for (const script of Array.from(document.scripts)) {
        const src = script.getAttribute('src');
        if (src && !savedScripts.includes(src)) script.remove();
      }
      document.body.innerHTML = savedBody;
    }

    return outcomes;
  }, {
    identityUrl: moduleUrl('/js/sync-identity.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
