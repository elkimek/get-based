import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?syncChatApplyCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('sync chat apply covers browser storage merge tombstone lock and encryption paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ applyUrl, collectorsUrl, cryptoUrl }) => {
    const [chatApply, collectors, cryptoModule, { state }, syncState] = await Promise.all([
      import(applyUrl),
      import(collectorsUrl),
      import(cryptoUrl),
      import('/js/state.js'),
      import('/js/sync-state.js'),
    ]);
    const outcomes = {};
    const profileId = `syncchatbrowser${Date.now()}`;
    const lockKey = 'labcharts-chat-local-lock-until';
    const personaLockKey = 'labcharts-chat-persona-local-lock-until';
    const threadsKey = `labcharts-${profileId}-chat-threads`;
    const deletedKey = collectors.chatDeletedThreadsKey(profileId);
    const customPersonalityKey = `labcharts-${profileId}-chatPersonalityCustom`;
    const customPersonalityDeletedKey = `labcharts-${profileId}-chatPersonalityDeleted`;
    const activePersonalityKey = `labcharts-${profileId}-chatPersonality`;
    const msgKey = id => `labcharts-${profileId}-chat-t_${id}`;
    const readJson = key => JSON.parse(localStorage.getItem(key) || 'null');
    const ids = [
      'collector',
      'collector-empty',
      'corrupt-remote',
      'keep',
      'gone',
      'old-gone',
      'stale',
      'remote-new',
      'empty-remote',
      'locked-keep',
      'locked-gone',
      'locked-remote',
      'secret',
      'locked-secret',
    ];
    const storageKeys = [
      'labcharts-encryption-enabled',
      threadsKey,
      deletedKey,
      customPersonalityKey,
      customPersonalityDeletedKey,
      activePersonalityKey,
      ...ids.map(msgKey),
    ];
    const oldStorage = Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)]));
    const oldLock = sessionStorage.getItem(lockKey);
    const oldPersonaLock = sessionStorage.getItem(personaLockKey);
    const oldProfile = state.currentProfile;
    const oldWearablesTest = window.__WEARABLES_TEST;

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      sessionStorage.removeItem(lockKey);
      sessionStorage.removeItem(personaLockKey);
      state.currentProfile = profileId;
      syncState.resetSyncStatus();

      outcomes.invalidInputIgnored =
        await chatApply.applyChatData(profileId, null) === false
        && await chatApply.applyChatData(profileId, { threads: 'not-array' }) === false;

      localStorage.setItem(threadsKey, JSON.stringify([
        {
          id: 'collector',
          messageCount: 1,
          updatedAt: '2026-06-08T08:00:00.000Z',
          discussionPersonas: [
            { id: 'default', name: 'Analyst', icon: 'A' },
            { id: 'collector_voice', name: 'Collector Voice', icon: 'C' },
          ],
          discussionOriginalPersonality: 'default',
        },
        { id: 'collector-empty', messageCount: 0, updatedAt: '2026-06-08T08:05:00.000Z' },
      ]));
      localStorage.setItem(msgKey('collector'), JSON.stringify([{
        role: 'assistant',
        content: 'collect me',
        discussion: true,
        recSlots: ['sleep'],
        recNew: true,
      }]));
      localStorage.setItem(customPersonalityKey, JSON.stringify([{ id: 'collector_voice', name: 'Collector Voice' }]));
      localStorage.setItem(activePersonalityKey, 'collector_voice');
      const collectedChat = await collectors.collectChatData(profileId);
      outcomes.collectChatDataParsesCustomPersonalities =
        collectedChat?.threads?.length === 2
        && collectedChat?.messages?.collector?.[0]?.content === 'collect me'
        && collectedChat?.messages?.collector?.[0]?.recNew === true
        && collectedChat?.threads?.[0]?.discussionPersonas?.[1]?.id === 'collector_voice'
        && Array.isArray(collectedChat?.messages?.['collector-empty'])
        && collectedChat.customPersonalities?.[0]?.name === 'Collector Voice'
        && collectedChat.activePersonality === 'collector_voice';

      localStorage.setItem(customPersonalityKey, '{not json');
      const invalidCustomChat = await collectors.collectChatData(profileId);
      outcomes.collectChatDataIgnoresInvalidCustomPersonalities =
        invalidCustomChat?.customPersonalities === undefined
        && invalidCustomChat?.activePersonality === 'collector_voice';

      localStorage.removeItem(threadsKey);
      localStorage.setItem(customPersonalityKey, JSON.stringify([
        { id: 'custom_local_only', name: 'Local-only Voice' },
      ]));
      const customOnlyChat = await collectors.collectChatData(profileId);
      outcomes.collectChatDataKeepsCustomPersonalitiesWithoutThreads =
        customOnlyChat?.threads?.length === 0
        && customOnlyChat?.messages
        && customOnlyChat.customPersonalities?.[0]?.name === 'Local-only Voice';

      chatApply.markCustomPersonalityDataLocal();
      await chatApply.applyChatData(profileId, {
        threads: [],
        customPersonalities: [{ id: 'custom_stale_remote', name: 'Stale Remote Voice' }],
      });
      const perItemMergedPersonas = readJson(customPersonalityKey);
      outcomes.perItemPersonaMergePreservesLocalAndRemoteWithoutThreads =
        perItemMergedPersonas?.some(personality => personality.name === 'Local-only Voice')
        && perItemMergedPersonas?.some(personality => personality.name === 'Stale Remote Voice');
      sessionStorage.removeItem(personaLockKey);

      localStorage.setItem(threadsKey, 'not-json');
      const corruptApplied = await chatApply.applyChatData(profileId, {
        threads: [{ id: 'corrupt-remote', messageCount: 1, updatedAt: '2026-06-08T09:00:00.000Z' }],
        messages: { 'corrupt-remote': [{ role: 'assistant', content: 'recovered from corrupt index' }] },
      });
      outcomes.corruptLocalIndexRecovers =
        corruptApplied === true
        && readJson(threadsKey).some(thread => thread.id === 'corrupt-remote')
        && readJson(msgKey('corrupt-remote'))?.[0]?.content === 'recovered from corrupt index';

      localStorage.setItem(threadsKey, JSON.stringify([
        { id: 'keep', messageCount: 1, updatedAt: '2026-06-08T10:00:00.000Z' },
        { id: 'gone', messageCount: 1, updatedAt: '2026-06-08T10:00:00.000Z' },
        { id: 'old-gone', messageCount: 1, updatedAt: '2026-06-08T09:30:00.000Z' },
        { id: 'stale', messageCount: 2, updatedAt: '2026-06-08T11:00:00.000Z' },
      ]));
      localStorage.setItem(msgKey('keep'), JSON.stringify([{ role: 'user', content: 'old keep' }]));
      localStorage.setItem(msgKey('gone'), JSON.stringify([{ role: 'user', content: 'delete me' }]));
      localStorage.setItem(msgKey('old-gone'), JSON.stringify([{ role: 'user', content: 'already deleted locally' }]));
      localStorage.setItem(msgKey('stale'), JSON.stringify([{ role: 'assistant', content: 'newer local' }]));
      localStorage.setItem(deletedKey, JSON.stringify({
        'old-gone': Date.parse('2026-06-08T09:45:00.000Z'),
        constructor: Date.parse('2026-06-08T12:00:00.000Z'),
        invalid: 'nope',
      }));

      const mergedApplied = await chatApply.applyChatData(profileId, {
        threads: [
          { id: 'keep', messageCount: 2, updatedAt: '2026-06-08T10:30:00.000Z' },
          { id: 'gone', messageCount: 2, updatedAt: '2026-06-08T10:30:00.000Z' },
          { id: 'stale', messageCount: 1, updatedAt: '2026-06-08T10:15:00.000Z' },
          { id: 'remote-new', messageCount: 1, updatedAt: '2026-06-08T12:00:00.000Z' },
        ],
        messages: {
          keep: [{ role: 'assistant', content: 'fresh remote keep' }],
          gone: [{ role: 'assistant', content: 'should not survive' }],
          stale: [{ role: 'assistant', content: 'older remote' }],
          'remote-new': [{ role: 'user', content: 'new remote thread' }],
        },
        deletedThreads: [
          { id: 'gone', deletedAt: Date.parse('2026-06-08T10:45:00.000Z') },
          'array-deleted',
          { id: '__proto__', deletedAt: Date.parse('2026-06-08T12:00:00.000Z') },
          { id: 'bad-ts', deletedAt: 'not-a-number' },
        ],
        customPersonalities: [{ id: 'custom_sync', name: 'Sync Voice' }],
        activePersonality: 'custom_sync',
      });
      const mergedThreads = readJson(threadsKey);
      const deletedThreads = readJson(deletedKey);
      outcomes.remoteMergeAppliesMessagesTombstonesAndPersonality =
        mergedApplied === true
        && mergedThreads[0]?.id === 'remote-new'
        && mergedThreads.some(thread => thread.id === 'keep')
        && mergedThreads.some(thread => thread.id === 'stale')
        && !mergedThreads.some(thread => thread.id === 'gone')
        && !mergedThreads.some(thread => thread.id === 'old-gone')
        && readJson(msgKey('keep'))?.[0]?.content === 'fresh remote keep'
        && readJson(msgKey('remote-new'))?.[0]?.content === 'new remote thread'
        && readJson(msgKey('stale'))?.[0]?.content === 'newer local'
        && localStorage.getItem(msgKey('gone')) === null
        && localStorage.getItem(msgKey('old-gone')) === null
        && Number.isFinite(Number(deletedThreads.gone))
        && Number.isFinite(Number(deletedThreads['array-deleted']))
        && !Object.prototype.hasOwnProperty.call(deletedThreads, 'constructor')
        && JSON.parse(localStorage.getItem(`labcharts-${profileId}-chatPersonalityCustom`) || '[]')
          .some(personality => personality.name === 'Sync Voice')
        && localStorage.getItem(`labcharts-${profileId}-chatPersonality`) === 'custom_sync';

      chatApply.markChatDataLocal();
      localStorage.setItem(threadsKey, JSON.stringify([
        { id: 'empty', messageCount: 0, updatedAt: '2026-06-08T13:00:00.000Z' },
      ]));
      const emptyShellApplied = await chatApply.applyChatData(profileId, {
        threads: [{ id: 'empty-remote', messageCount: 1, updatedAt: '2026-06-08T13:05:00.000Z' }],
        messages: { 'empty-remote': [{ role: 'assistant', content: 'empty shell did not block' }] },
      });
      outcomes.emptyLocalShellDoesNotBlockRemote =
        emptyShellApplied === true
        && readJson(msgKey('empty-remote'))?.[0]?.content === 'empty shell did not block';

      chatApply.markChatDataLocal();
      localStorage.setItem(threadsKey, JSON.stringify([
        { id: 'locked-keep', messageCount: 1, updatedAt: '2026-06-08T14:00:00.000Z' },
        { id: 'locked-gone', messageCount: 1, updatedAt: '2026-06-08T14:00:00.000Z' },
      ]));
      localStorage.setItem(msgKey('locked-keep'), JSON.stringify([{ role: 'user', content: 'local unsynced' }]));
      localStorage.setItem(msgKey('locked-gone'), JSON.stringify([{ role: 'user', content: 'delete while locked' }]));
      const lockRemaining = chatApply.getChatDataLocalLockRemainingMs(profileId);
      const wrongProfileLockRemaining = chatApply.getChatDataLocalLockRemainingMs(`${profileId}-other`);
      const lockedApplied = await chatApply.applyChatData(profileId, {
        threads: [{ id: 'locked-remote', messageCount: 1, updatedAt: '2026-06-08T14:15:00.000Z' }],
        messages: { 'locked-remote': [{ role: 'assistant', content: 'blocked by local lock' }] },
        deletedThreads: { 'locked-gone': Date.parse('2026-06-08T14:10:00.000Z') },
      });
      const lockedThreads = readJson(threadsKey);
      outcomes.localLockSkipsRemoteMergeButAppliesTombstones =
        lockRemaining > 0
        && wrongProfileLockRemaining === 0
        // In the local-lock path, applyChatData returns whether tombstones changed.
        && lockedApplied === true
        && lockedThreads.some(thread => thread.id === 'locked-keep')
        && !lockedThreads.some(thread => thread.id === 'locked-gone')
        && !lockedThreads.some(thread => thread.id === 'locked-remote')
        && localStorage.getItem(msgKey('locked-gone')) === null
        && localStorage.getItem(msgKey('locked-remote')) === null;

      sessionStorage.removeItem(lockKey);
      window.__WEARABLES_TEST = true;
      localStorage.setItem('labcharts-encryption-enabled', 'true');
      await cryptoModule._setTestSessionKey('sync-chat-apply-browser');
      const encryptedApplied = await chatApply.applyChatData(profileId, {
        threads: [{
          id: 'secret',
          messageCount: 1,
          updatedAt: '2026-06-08T15:00:00.000Z',
          discussionPersonas: [
            { id: 'default', name: 'Analyst', icon: 'A' },
            { id: 'custom_secret', name: 'Encrypted Voice', icon: 'E' },
          ],
          discussionPendingPersonas: [{ id: 'custom_secret', name: 'Encrypted Voice', icon: 'E' }],
          discussionOriginalPersonality: 'default',
        }],
        messages: { secret: [{
          role: 'assistant',
          content: 'encrypted remote message',
          discussion: true,
          recSlots: ['sleep'],
          recNew: true,
        }] },
        activePersonality: 'custom_secret',
        customPersonalities: [{
          id: 'custom_secret',
          name: 'Encrypted Voice',
          icon: 'E',
          promptText: 'Keep this persona instruction encrypted.',
          personaAgreement: {
            accepted: true,
            version: 1,
            acceptedAt: '2026-08-08T10:00:00.000Z',
            host: 'app.getbased.health',
            statement: 'Accepted for personal use.',
          },
        }],
      });
      const storedSecret = localStorage.getItem(msgKey('secret'));
      const decryptedSecret = await cryptoModule.encryptedGetItem(msgKey('secret'));
      const storedSecretThreads = localStorage.getItem(threadsKey);
      const decryptedSecretThreads = await cryptoModule.encryptedGetItem(threadsKey);
      const storedSecretPersonas = localStorage.getItem(customPersonalityKey);
      const decryptedSecretPersonas = await cryptoModule.encryptedGetItem(customPersonalityKey);
      const encryptedCollectedChat = await collectors.collectChatData(profileId);
      outcomes.encryptionEnabledWritesSensitiveChatDataEncrypted =
        encryptedApplied === true
        && storedSecret?.startsWith('v1:')
        && storedSecretThreads?.startsWith('v1:')
        && storedSecretPersonas?.startsWith('v1:')
        && JSON.parse(decryptedSecret || '[]')?.[0]?.content === 'encrypted remote message'
        && JSON.parse(decryptedSecret || '[]')?.[0]?.recNew === true
        && JSON.parse(decryptedSecretThreads || '[]')?.some(thread => thread.id === 'secret')
        && JSON.parse(decryptedSecretThreads || '[]')?.find(thread => thread.id === 'secret')
          ?.discussionPendingPersonas?.[0]?.id === 'custom_secret'
        && JSON.parse(decryptedSecretPersonas || '[]')
          .some(personality => personality.promptText?.includes('encrypted'))
        && encryptedCollectedChat?.customPersonalities
          ?.some(personality => personality.personaAgreement?.accepted === true)
        && encryptedCollectedChat?.activePersonality === 'custom_secret';

      await cryptoModule._setTestSessionKey(null);
      const lockedEncryptedApplied = await chatApply.applyChatData(profileId, {
        threads: [{ id: 'locked-secret', messageCount: 1, updatedAt: '2026-06-08T15:30:00.000Z' }],
        messages: { 'locked-secret': [{ role: 'assistant', content: 'must wait for unlock' }] },
      });
      outcomes.encryptionLockedSkipsChatApplyWithoutPlaintextRewrite =
        lockedEncryptedApplied === false
        && localStorage.getItem(threadsKey) === storedSecretThreads
        && localStorage.getItem(msgKey('locked-secret')) === null;
    } finally {
      // Ensure the test-only crypto cleanup can run even if setup failed early.
      window.__WEARABLES_TEST = true;
      try { await cryptoModule._setTestSessionKey(null); } catch {}
      if (oldWearablesTest === undefined) delete window.__WEARABLES_TEST;
      else window.__WEARABLES_TEST = oldWearablesTest;
      state.currentProfile = oldProfile;
      syncState.resetSyncStatus();
      for (const [key, value] of Object.entries(oldStorage)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      if (oldLock == null) sessionStorage.removeItem(lockKey);
      else sessionStorage.setItem(lockKey, oldLock);
      if (oldPersonaLock == null) sessionStorage.removeItem(personaLockKey);
      else sessionStorage.setItem(personaLockKey, oldPersonaLock);
    }

    return outcomes;
  }, {
    applyUrl: moduleUrl('/js/sync-chat-apply.js'),
    collectorsUrl: moduleUrl('/js/sync-payload-collectors.js'),
    cryptoUrl: '/js/crypto.js',
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
