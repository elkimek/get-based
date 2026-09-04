import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?chatHistoryDiagnoseCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><body>
      <div id="notification-container"></div>
      <div id="chat-thread-list"></div>
      <div id="chat-saved-summaries"></div>
      <div class="chat-header-title"></div>
      <button class="chat-summary-btn" type="button"></button>
    </body></html>`,
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('chat history browser coverage saves loads clears and updates thread state', async ({ page }) => {
  await openBlankPage(page, '/chat-history-browser-coverage');

  const results = await page.evaluate(async ({ chatHistoryUrl }) => {
    const [{ state }, chatHistory, threads, profile, cryptoStore, blobStorage, chatRuntime] = await Promise.all([
      import('/js/state.js'),
      import(chatHistoryUrl),
      import('/js/chat-threads.js'),
      import('/js/profile.js'),
      import('/js/crypto.js'),
      import('/js/blob-storage.js'),
      import('/js/chat-runtime.js'),
    ]);
    const storage = new Map(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter(key => key !== null)
        .map(key => [key, localStorage.getItem(key)])
    );
    const original = {
      currentProfile: state.currentProfile,
      chatHistory: state.chatHistory,
      chatThreads: state.chatThreads,
      currentThreadId: state.currentThreadId,
      currentChatPersonality: state.currentChatPersonality,
      importedData: state.importedData,
      bodyHTML: document.body.innerHTML,
    };
    const profileId = 'coverage-chat-history-profile';
    const importedKey = profile.profileStorageKey(profileId, 'imported');
    const outcomes = {};
    let renderCalls = 0;
    let discussCalls = 0;
    const previousChatRuntime = chatRuntime.configureChatRuntimeCallbacks({
      renderChatMessages: () => { renderCalls += 1; },
      updateDiscussButton: () => { discussCalls += 1; },
    });
    const waitFor = async (predicate, label, timeoutMs = 1000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const result = await predicate();
        if (result) return result;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    try {
      localStorage.clear();
      document.body.innerHTML = `
        <div id="notification-container"></div>
        <div id="chat-thread-list"></div>
        <div id="chat-saved-summaries"></div>
        <div class="chat-header-title"></div>
        <button class="chat-summary-btn" type="button"></button>
      `;
      state.currentProfile = profileId;
      state.currentChatPersonality = 'default';
      state.currentThreadId = null;
      state.chatHistory = [{ role: 'user', content: 'orphan message' }];
      await chatHistory.saveChatHistory();
      outcomes.saveWithoutThreadIsNoop = !Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
        .some(key => key?.includes('-chat-t_'));

      const firstUpdatedAt = '2026-06-01T00:00:00.000Z';
      state.currentThreadId = 'thread-a';
      state.chatThreads = [{
        id: 'thread-a',
        name: 'Coverage Thread',
        createdAt: firstUpdatedAt,
        updatedAt: firstUpdatedAt,
        messageCount: 1,
        personality: 'default',
        summary: 'old summary',
        summaryDate: '2026-06-01T00:00:00.000Z',
        summaryModel: 'Old Model',
        summaryCost: { inputTokens: 1, outputTokens: 1 },
      }];
      state.chatHistory = [
        { role: 'user', content: 'How is ferritin?' },
        { role: 'assistant', personalityName: 'Analyst', content: 'Ferritin is improving.' },
      ];

      await chatHistory.saveChatHistory();
      const threadKey = threads.getChatThreadKey('thread-a');
      const savedMessages = JSON.parse(localStorage.getItem(threadKey) || '[]');
      const savedThread = state.chatThreads[0];
      outcomes.storageKeyUsesActiveProfile = chatHistory.getChatStorageKey() === `labcharts-${profileId}-chat`;
      outcomes.saveWritesThreadMessages = savedMessages.length === 2
        && savedMessages[1].content === 'Ferritin is improving.';
      outcomes.saveUpdatesThreadMetadata = savedThread.messageCount === 2
        && savedThread.updatedAt !== firstUpdatedAt
        && savedThread.personalityName === 'AI Lab Analyst'
        && savedThread.personalityIcon === '\uD83D\uDD2C';
      outcomes.saveRendersThreadList = document.querySelector('.chat-thread-item[data-thread-id="thread-a"]')
        ?.textContent.includes('2 msgs') === true;

      state.chatHistory = [{ role: 'user', content: 'stale' }];
      await chatHistory.loadChatHistory();
      outcomes.loadRestoresSavedMessages = state.chatHistory.length === 2
        && state.chatHistory[0].content === 'How is ferritin?'
        && renderCalls > 0;

      localStorage.setItem(threadKey, '{bad json');
      const malformedLoad = await chatHistory.loadChatHistory();
      outcomes.loadHandlesMalformedStorage = Array.isArray(state.chatHistory)
        && state.chatHistory.length === 0
        && malformedLoad === false;
      state.chatHistory = [{ role: 'user', content: 'must not replace corrupt storage' }];
      outcomes.malformedStorageBlocksOverwrite = await chatHistory.saveChatHistory() === false
        && localStorage.getItem(threadKey) === '{bad json';

      localStorage.setItem(threadKey, JSON.stringify([{ role: 'user', content: 'recovered' }]));
      outcomes.validReloadClearsWriteBlock = await chatHistory.loadChatHistory() === true
        && chatHistory.canSaveChatHistory() === true
        && state.chatHistory[0]?.content === 'recovered';

      state.currentThreadId = '';
      state.chatHistory = [{ role: 'assistant', content: 'should clear' }];
      await chatHistory.loadChatHistory();
      outcomes.loadWithoutActiveThreadClearsState = state.chatHistory.length === 0;

      state.currentThreadId = 'thread-a';
      state.chatHistory = [{ role: 'user', content: 'clear me' }];
      localStorage.setItem(threadKey, JSON.stringify(state.chatHistory));
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        healthGoals: [],
        diagnoses: null,
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        changeHistory: [],
        chatSummaries: [
          { id: 'summary-a', threadId: 'thread-a', threadName: 'Coverage Thread', content: 'Remove me', createdAt: '2026-06-01T00:00:00.000Z' },
          { id: 'summary-b', threadId: 'thread-b', threadName: 'Keep Thread', content: 'Keep me', createdAt: '2026-06-02T00:00:00.000Z' },
        ],
      };
      const clearPromise = chatHistory.clearChatHistory();
      await new Promise(resolve => setTimeout(resolve, 0));
      document.getElementById('confirm-ok')?.click();
      await clearPromise;
      const persistedImported = await waitFor(async () => {
        const raw = await cryptoStore.encryptedGetItem(importedKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed.chatSummaries?.length === 1 && parsed.chatSummaries[0].id === 'summary-b'
          ? parsed
          : null;
      }, 'persisted chat summary cleanup');

      outcomes.clearRemovesThreadMessages = state.chatHistory.length === 0
        && localStorage.getItem(threadKey) === null;
      outcomes.clearResetsThreadSummary = savedThread.messageCount === 0
        && !('summary' in savedThread)
        && !('summaryDate' in savedThread)
        && !('summaryModel' in savedThread)
        && !('summaryCost' in savedThread)
        && !('summaryAttribution' in savedThread);
      outcomes.clearDeletesOnlyMatchingSavedSummary = state.importedData.chatSummaries.length === 1
        && state.importedData.chatSummaries[0].id === 'summary-b'
        && persistedImported.chatSummaries?.length === 1
        && persistedImported.chatSummaries[0].id === 'summary-b';
      outcomes.clearRefreshesUiAndNotifies = renderCalls >= 3
        && discussCalls === 1
        && document.querySelector('.chat-header-title')?.textContent === 'AI Lab Analyst'
        && document.getElementById('notification-container')?.textContent.includes('Chat history cleared') === true;
    } finally {
      state.currentProfile = original.currentProfile;
      state.chatHistory = original.chatHistory;
      state.chatThreads = original.chatThreads;
      state.currentThreadId = original.currentThreadId;
      state.currentChatPersonality = original.currentChatPersonality;
      state.importedData = original.importedData;
      chatRuntime.configureChatRuntimeCallbacks(previousChatRuntime);
      await blobStorage.deleteBlob(importedKey);
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      document.body.innerHTML = original.bodyHTML;
    }

    return outcomes;
  }, {
    chatHistoryUrl: moduleUrl('/js/chat-history.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync diagnose browser coverage renders modal and copy fallbacks', async ({ page }) => {
  await openBlankPage(page, '/sync-diagnose-ui-browser-coverage');

  const results = await page.evaluate(async ({ diagnoseUrl }) => {
    const [{ state }, diagnoseUi, diagnosticsContext, relayHealth] = await Promise.all([
      import('/js/state.js'),
      import(diagnoseUrl),
      import('/js/sync-diagnostics-context.js'),
      import('/js/sync-relay-health.js'),
    ]);
    const storage = new Map(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter(key => key !== null)
        .map(key => [key, localStorage.getItem(key)])
    );
    const original = {
      currentProfile: state.currentProfile,
      importedData: state.importedData,
      bodyHTML: document.body.innerHTML,
      execCommand: document.execCommand,
      clipboard: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
    };
    const outcomes = {};
    const owner = {
      id: 'owner-coverage-abcdef123456',
      mnemonic: 'alpha bravo charlie delta',
      writeKey: new Uint8Array(32),
    };
    const liveRows = [{
      id: 'live-row',
      profileId: 'coverage-sync-profile',
      syncedAt: '2026-06-09T08:00:00.000Z',
      dataJson: JSON.stringify({
        profile: { id: 'coverage-sync-profile' },
        importedData: {
          sunSessions: [{ id: 'sun-1' }],
          lightDevices: [{ id: 'dev-1' }],
        },
      }),
    }];
    const tombstoneRows = [{
      id: 'deleted-row',
      profileId: '',
      syncedAt: '2026-06-09T09:00:00.000Z',
      dataJson: '{malformed',
    }];
    const evolu = {
      getQueryRows(query) {
        if (query === 'live-query') return liveRows;
        if (query === 'tombstone-query') return tombstoneRows;
        return [];
      },
    };
    const notificationText = () => document.getElementById('notification-container')?.textContent || '';
    const setClipboard = value => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value,
      });
    };
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    try {
      localStorage.clear();
      document.body.innerHTML = '<div id="notification-container"></div>';
      state.currentProfile = 'coverage-sync-profile';
      state.importedData = {
        ...(state.importedData || {}),
        sunSessions: [{ id: 'local-sun' }],
        lightDevices: [{ id: 'local-device' }],
      };
      // The cutover panel is debug-only, so seed debug before both modal renders.
      localStorage.setItem('labcharts-debug', 'true');
      localStorage.setItem('labcharts-sync-relay', 'wss://relay.coverage.example');
      diagnosticsContext.configureSyncDiagnosticsContext({
        getEvolu: () => evolu,
        getProfileQuery: () => 'live-query',
        getTombstoneQuery: () => 'tombstone-query',
        getAppOwner: () => owner,
        isSyncEnabled: () => true,
        getSubscriptionFireCount: () => 4,
        isSyncing: () => false,
        isPulling: () => true,
      });
      relayHealth.configureRelayHealth({ getAppOwner: () => owner });
      relayHealth.trackPushBytes(4096);
      await diagnoseUi.showSyncDiagnose();
      const defaultOverlay = document.querySelector('.modal-overlay');
      outcomes.defaultCutoverRendererUsesOffState = defaultOverlay?.textContent.includes('Lean sync mode') === true
        && defaultOverlay.textContent.includes('Enable') === true
        && !defaultOverlay.textContent.includes('ON');
      defaultOverlay?.remove();

      diagnoseUi.configureSyncDiagnoseUI({
        isPhase2CutoverEnabled: profileId => profileId === 'coverage-sync-profile',
      });

      await diagnoseUi.showSyncDiagnose();
      const overlay = document.querySelector('.modal-overlay');
      const copyButton = overlay?.querySelector('button[title^="Copy"]');
      outcomes.modalRendersDiagnostics = overlay?.textContent.includes('Sync status') === true
        && overlay.textContent.includes('Technical details')
        && overlay.textContent.includes('coverage-sync-profile')
        && overlay.textContent.includes('wss://relay.coverage.example')
        && overlay.querySelector('.sync-diagnose-technical')?.open === false;
      outcomes.modalStoresMatchingCopySnapshot = overlay?.dataset.copyText.includes('Sync diagnose @') === true
        && overlay.dataset.copyText.includes('coverage-sync-profile')
        && overlay.dataset.copyText.includes('sunSessions=1 lightDevices=1');
      outcomes.cutoverConfigFlowsIntoModal = overlay?.textContent.includes('Lean sync mode') === true
        && overlay.textContent.includes('ON') === true
        && overlay.textContent.includes('Disable') === true;
      outcomes.modalUsesDelegatedDiagnoseActions =
        !overlay.querySelector('[onclick],[onchange],[oninput],[onkeydown],[onsubmit]')
        && !!overlay.querySelector('[data-sync-diagnose-action="refresh-relay-storage"]')
        && !!overlay.querySelector('[data-sync-diagnose-action="compact-relay"]')
        && !overlay.querySelector('[data-sync-diagnose-action="rotate-identity"]')
        && !!overlay.querySelector('[data-sync-diagnose-action="disable-phase2"]')
        && !!overlay.querySelector('[data-sync-diagnose-action="copy-snapshot"]')
        && !overlay.querySelector('[data-sync-diagnose-action="enable-phase2"]')
        && !overlay.querySelector('[data-sync-diagnose-action="reset-delta-telemetry"]');

      const copied = [];
      setClipboard({ writeText: async text => { copied.push(text); } });
      copyButton.click();
      await waitFor(() => copied.length === 1, 'delegated diagnose copy');
      outcomes.clipboardCopyUsesOverlayText = copied[0] === overlay.dataset.copyText
        && copyButton.textContent === 'Copied';

      let fallbackCopied = false;
      setClipboard(undefined);
      document.execCommand = command => {
        fallbackCopied = command === 'copy';
        return fallbackCopied;
      };
      copyButton.textContent = 'Copy';
      await diagnoseUi.copySyncDiagnose(copyButton);
      outcomes.execCommandFallbackCopiesAndCleansUp = fallbackCopied
        && !document.querySelector('textarea')
        && copyButton.textContent === 'Copied';

      document.getElementById('notification-container').innerHTML = '';
      setClipboard({ writeText: async () => { throw new Error('denied'); } });
      copyButton.textContent = 'Copy';
      await diagnoseUi.copySyncDiagnose(copyButton);
      outcomes.copyFailureShowsNotification = notificationText().includes('Copy failed: denied');

      document.getElementById('notification-container').innerHTML = '';
      await diagnoseUi.copySyncDiagnose(document.createElement('button'));
      outcomes.emptyCopyShowsNotification = notificationText().includes('Nothing to copy');

      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      outcomes.overlayClickDismissesModal = document.querySelector('.modal-overlay') === null;
    } finally {
      diagnosticsContext.configureSyncDiagnosticsContext({
        getEvolu: () => null,
        getProfileQuery: () => null,
        getTombstoneQuery: () => null,
        getAppOwner: () => null,
        isSyncEnabled: () => false,
        getSubscriptionFireCount: () => 0,
        isSyncing: () => false,
        isPulling: () => false,
      });
      diagnoseUi.configureSyncDiagnoseUI({ isPhase2CutoverEnabled: () => false });
      relayHealth.configureRelayHealth({ getAppOwner: () => null, getSyncRelay: () => null });
      state.currentProfile = original.currentProfile;
      state.importedData = original.importedData;
      document.execCommand = original.execCommand;
      if (original.clipboard) Object.defineProperty(navigator, 'clipboard', original.clipboard);
      else delete navigator.clipboard;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      document.body.innerHTML = original.bodyHTML;
    }

    return outcomes;
  }, {
    diagnoseUrl: moduleUrl('/js/sync-diagnose-ui.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
