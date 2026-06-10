import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?syncActionsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('sync save hooks and messenger cover debounce and gateway paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ saveHooksUrl, messengerUrl }) => {
    const [{ state }, saveHooks, messenger] = await Promise.all([
      import('/js/state.js'),
      import(saveHooksUrl),
      import(messengerUrl),
    ]);
    const outcomes = {};
    const pushes = [];
    const fetches = [];
    const debugCalls = [];
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const profileId = 'sync-hooks-active';
    const storageKeys = [
      'labcharts-messenger-enabled',
      'labcharts-messenger-token',
    ];
    const saved = {
      currentProfile: state.currentProfile,
      importedData: clone(state.importedData),
      setTimeout: window.setTimeout,
      clearTimeout: window.clearTimeout,
      fetch: window.fetch,
      storage: Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)])),
      chatLock: sessionStorage.getItem('labcharts-chat-local-lock-until'),
    };
    let enabled = true;
    let ready = true;
    let timerId = 1;
    const timers = new Map();
    const runPendingTimers = async (cycles = 1) => {
      for (let cycle = 0; cycle < cycles; cycle += 1) {
        const pending = Array.from(timers.entries()).filter(([, timer]) => !timer.cleared);
        if (!pending.length) return;
        for (const [id, timer] of pending) {
          if (!timers.has(id) || timer.cleared) continue;
          timers.delete(id);
          await timer.fn();
          await Promise.resolve();
        }
      }
    };

    try {
      window.setTimeout = (fn, ms) => {
        const id = timerId++;
        timers.set(id, { fn, ms, cleared: false });
        return id;
      };
      window.clearTimeout = id => {
        const timer = timers.get(id);
        if (timer) timer.cleared = true;
        timers.delete(id);
      };
      window.fetch = async (url, options = {}) => {
        fetches.push({ url: String(url), options: clone(options) });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };
      state.currentProfile = profileId;
      state.importedData = { entries: [{ date: '2026-06-09', markers: { metabolic: { glucose: 4.9 } } }] };
      localStorage.setItem('labcharts-messenger-enabled', 'false');
      localStorage.removeItem('labcharts-messenger-token');
      sessionStorage.removeItem('labcharts-chat-local-lock-until');

      saveHooks.clearSyncSaveTimers();
      saveHooks.onDataSaved({ immediate: true });
      saveHooks.onChatSaved();
      saveHooks.onProfileSaved('default-gated', { entries: [] });
      outcomes.defaultSaveHookDependenciesGateWork = pushes.length === 0 && timers.size === 0;

      saveHooks.configureSyncSaveHooks({
        pushProfile: async (id, data, options) => {
          pushes.push({ id, data: clone(data), options: clone(options || null) });
        },
        isSyncEnabled: () => enabled,
        isEvoluReady: () => ready,
      });

      saveHooks.onDataSaved({ immediate: true });
      outcomes.immediateDataSavePushesActiveProfile = pushes.length === 1
        && pushes[0].id === profileId
        && pushes[0].data.entries?.[0]?.markers?.metabolic?.glucose === 4.9;

      saveHooks.onChatSaved();
      await runPendingTimers();
      outcomes.chatSaveMarksLocalAndDebouncesPush = pushes.length === 2
        && pushes[1].id === profileId
        && Number(sessionStorage.getItem('labcharts-chat-local-lock-until') || '0') > Date.now();

      saveHooks.onProfileSaved('profile-fallback', { notes: [{ text: 'fallback data' }] });
      await runPendingTimers();
      outcomes.profileSaveUsesProvidedFallbackData = pushes.length === 3
        && pushes[2].id === 'profile-fallback'
        && pushes[2].data.notes?.[0]?.text === 'fallback data';

      ready = false;
      saveHooks.onProfileSaved('profile-retry', { notes: [{ text: 'retry data' }] });
      await runPendingTimers();
      outcomes.profileSaveRetriesUntilEvoluReady = pushes.length === 3
        && Array.from(timers.values()).some(timer => timer.ms === 1000);
      ready = true;
      await runPendingTimers();
      outcomes.profileRetryFlushPushesAfterReady = pushes.length === 4
        && pushes[3].id === 'profile-retry'
        && pushes[3].data.notes?.[0]?.text === 'retry data';

      saveHooks.bindSyncSaveHookEvents();
      saveHooks.bindSyncSaveHookEvents();
      window.dispatchEvent(new Event('labcharts-ai-settings-local-changed'));
      await runPendingTimers();
      outcomes.aiSettingsEventDebouncesSingleProfilePush = pushes.length === 5
        && pushes[4].id === profileId
        && pushes[4].data.entries?.[0]?.date === '2026-06-09';

      localStorage.setItem('labcharts-messenger-enabled', 'true');
      localStorage.setItem('labcharts-messenger-token', 'token-a');
      messenger.configureSyncMessenger({});
      messenger.pushContextToGateway();
      await runPendingTimers();
      const defaultGateway = fetches.at(-1);
      outcomes.messengerDefaultRelayPushesContext = defaultGateway?.url === 'https://sync.getbased.health/api/context'
        && defaultGateway.options?.headers?.Authorization === 'Bearer token-a'
        && JSON.parse(defaultGateway.options?.body || '{}').profileId === profileId;

      messenger.configureSyncMessenger({
        getSyncRelay: () => 'ws://relay.local',
        debug: (...args) => { debugCalls.push(args.map(String).join(' ')); },
      });
      messenger.pushContextToGateway();
      await runPendingTimers();
      const customGateway = fetches.at(-1);
      outcomes.messengerCustomRelayNormalizesWsAndDebugs = customGateway?.url === 'http://relay.local/api/context'
        && debugCalls.some(message => message.includes('Context pushed to gateway'));

      messenger.revokeMessengerToken();
      const beforeDisabledPush = fetches.length;
      messenger.pushContextToGateway();
      outcomes.messengerDisabledTokenDoesNotSchedule = fetches.length === beforeDisabledPush
        && messenger.isMessengerEnabled() === false
        && messenger.getMessengerToken() === null;
    } finally {
      saveHooks.configureSyncSaveHooks({
        pushProfile: async () => {},
        isSyncEnabled: () => false,
        isEvoluReady: () => false,
        isSyncing: () => false,
      });
      saveHooks.clearSyncSaveTimers();
      messenger.configureSyncMessenger({ getSyncRelay: () => 'wss://sync.getbased.health', debug: () => {} });
      state.currentProfile = saved.currentProfile;
      state.importedData = saved.importedData;
      window.setTimeout = saved.setTimeout;
      window.clearTimeout = saved.clearTimeout;
      window.fetch = saved.fetch;
      for (const [key, value] of Object.entries(saved.storage)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      if (saved.chatLock == null) sessionStorage.removeItem('labcharts-chat-local-lock-until');
      else sessionStorage.setItem('labcharts-chat-local-lock-until', saved.chatLock);
    }

    return outcomes;
  }, {
    saveHooksUrl: moduleUrl('/js/sync-save-hooks.js'),
    messengerUrl: moduleUrl('/js/sync-messenger.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync action delegates push force pull and all-profile paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ actionsUrl }) => {
    const [{ state }, actions, profile] = await Promise.all([
      import('/js/state.js'),
      import(actionsUrl),
      import('/js/profile.js'),
    ]);
    const outcomes = {};
    const pushes = [];
    const pulls = [];
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const profileId = 'sync-actions-active';
    const otherProfileId = 'sync-actions-other';
    const otherDataKey = profile.profileStorageKey(otherProfileId, 'imported');
    const storageKeys = [
      'labcharts-active-profile',
      'labcharts-profiles',
      otherDataKey,
      'labcharts-messenger-enabled',
      'labcharts-messenger-token',
    ];
    const saved = {
      profiles: clone(state.profiles),
      currentProfile: state.currentProfile,
      importedData: clone(state.importedData),
      storage: Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)])),
    };

    try {
      state.currentProfile = profileId;
      state.importedData = { entries: [{ date: '2026-06-07', markers: { metabolic: { glucose: 5.2 } } }] };
      state.profiles = [
        { id: profileId, name: 'Sync Active', createdAt: Date.now(), lastUpdated: Date.now() },
        { id: otherProfileId, name: 'Sync Other', createdAt: Date.now(), lastUpdated: Date.now() },
      ];
      localStorage.setItem('labcharts-active-profile', profileId);
      localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));
      localStorage.setItem(otherDataKey, JSON.stringify({ notes: [{ text: 'other profile' }] }));
      localStorage.setItem('labcharts-messenger-enabled', 'false');
      localStorage.removeItem('labcharts-messenger-token');

      await actions.pushCurrentProfile();
      await actions.syncNow();
      await actions.forceResendCurrentProfile();
      outcomes.defaultActionDependenciesAreSafeNoops = pushes.length === 0 && pulls.length === 0;

      let enabled = false;
      let ready = false;
      actions.configureSyncActions({
        pushProfile: async (id, data, options) => {
          pushes.push({ id, data: clone(data), options: clone(options || null) });
        },
        forcePull: () => { pulls.push('pull'); },
        isSyncEnabled: () => enabled,
        isEvoluReady: () => ready,
        isSyncing: () => false,
      });

      await actions.forceResendCurrentProfile();
      outcomes.forceResendDisabledDoesNotPush = pushes.length === 0
        && Array.from(document.querySelectorAll('.notification-toast.warning'))
          .some(toast => toast.textContent.includes('Sync is not enabled'));

      enabled = true;
      ready = true;
      await actions.pushCurrentProfile();
      outcomes.pushCurrentProfileUsesActiveState = pushes.length === 1
        && pushes[0].id === profileId
        && pushes[0].data.entries?.[0]?.markers?.metabolic?.glucose === 5.2;

      await actions.forceResendCurrentProfile();
      outcomes.forceResendUsesForceOption = pushes.some(call => call.id === profileId && call.options?.force === true);

      await actions.syncNow();
      outcomes.syncNowPushesThenPulls = pushes.filter(call => call.id === profileId).length === 3
        && pulls.length === 1;

      await actions.pushAllProfiles({ force: true });
      const allProfilePushes = pushes.slice(-2);
      const activeProfilePush = allProfilePushes.find(call => call.id === profileId);
      const otherProfilePush = allProfilePushes.find(call => call.id === otherProfileId);
      outcomes.pushAllProfilesReadsCurrentAndStoredData = allProfilePushes.length === 2
        && activeProfilePush?.data.entries?.[0]?.date === '2026-06-07'
        && otherProfilePush?.data.notes?.[0]?.text === 'other profile'
        && allProfilePushes.every(call => call.options?.force === true);

      actions.bindSyncActionEvents();
      actions.clearSyncActionTimers();
      outcomes.bindAndClearActionEventsReturn = true;
    } finally {
      actions.configureSyncActions({
        pushProfile: async () => {},
        forcePull: () => {},
        isSyncEnabled: () => false,
        isEvoluReady: () => false,
        isSyncing: () => false,
      });
      actions.clearSyncActionTimers();
      state.profiles = saved.profiles;
      state.currentProfile = saved.currentProfile;
      state.importedData = saved.importedData;
      for (const [key, value] of Object.entries(saved.storage)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      document.querySelectorAll('.notification-container,.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  }, { actionsUrl: moduleUrl('/js/sync-actions.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync indicator popover renders debug actions and copies activity', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ uiUrl }) => {
    const [syncUi, syncState] = await Promise.all([
      import(uiUrl),
      import('/js/sync-state.js'),
    ]);
    const outcomes = {};
    const copied = [];
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const saved = {
      debug: localStorage.getItem('labcharts-debug'),
      clipboardOwn: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
    };
    let enabled = false;
    const slot = document.getElementById('sync-indicator-slot') || document.createElement('div');

    try {
      slot.id = 'sync-indicator-slot';
      if (!slot.parentNode) document.body.appendChild(slot);
      localStorage.setItem('labcharts-debug', 'true');
      syncState.resetSyncStatus();
      syncUi.configureSyncUI({ isSyncEnabled: () => enabled });

      syncUi.renderSyncIndicator();
      outcomes.disabledRenderClearsSlot = slot.innerHTML === '';

      enabled = true;
      syncState.updateSyncStatus({ relay: 'connected', push: 'confirmed', pushConfirmedAt: Date.now() - 2_000 });
      syncUi.renderSyncIndicator();
      outcomes.enabledRenderShowsSyncedDot = !!slot.querySelector('#sync-indicator-btn .sync-dot-synced');

      syncState.updateSyncStatus({ push: 'pending', pushStartedAt: Date.now() });
      syncUi.updateSyncIndicator();
      outcomes.updateReflectsSyncingState = !!slot.querySelector('#sync-indicator-btn .sync-dot-syncing');

      syncState.logSyncEvent('push', 'profile abc pushed');
      syncState.logSyncEvent('skip', 'stale profile skipped');
      syncState.updateSyncStatus({
        relay: 'unreachable',
        push: 'error',
        lastError: { type: 'PushStuck', at: Date.now() - 30_000 },
      });

      syncUi.toggleSyncDetail();
      const popover = document.getElementById('sync-popover');
      if (!popover) throw new Error('sync popover did not render');
      outcomes.popoverShowsDebugEventsAndActions = popover?.textContent.includes('Recent activity') === true
        && popover?.textContent.includes('Force resend') === true
        && popover?.textContent.includes('Reload') === true
        && popover?.textContent.includes('Diagnose') === true;

      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async value => copied.push(String(value || '')) },
      });
      const copyBtn = popover.querySelector('button[title="Copy events to clipboard"]');
      if (!copyBtn) throw new Error('sync activity copy button did not render');
      await syncUi.copySyncEvents(copyBtn);
      await waitFor(() => copied.length === 1, 'clipboard write');
      outcomes.copySyncEventsUsesClipboard = copied[0].includes('Sync activity')
        && copied[0].includes('profile abc pushed')
        && copyBtn.textContent.includes('Copied');

      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: null });
      await syncUi.copySyncEvents(null);
      outcomes.copyFallbackRendersTextarea = !!document.querySelector('textarea')
        && Array.from(document.querySelectorAll('.notification-toast.warning'))
          .some(toast => toast.textContent.includes('Auto-copy blocked'));
      document.querySelector('textarea')?.dispatchEvent(new Event('blur'));

      syncUi.toggleSyncDetail();
      outcomes.secondToggleClosesPopover = !document.getElementById('sync-popover');

      syncUi.toggleSyncDetail();
      if (!document.getElementById('sync-popover')) throw new Error('sync popover did not reopen');
      const originalAppendChild = Element.prototype.appendChild;
      let popoverAppendCount = 0;
      Element.prototype.appendChild = function(node) {
        if (node?.id === 'sync-popover') popoverAppendCount += 1;
        return originalAppendChild.call(this, node);
      };
      try {
        syncState.updateSyncStatus({ push: 'confirmed', pushConfirmedAt: Date.now(), lastError: null, relay: 'connected' });
        const baselinePopoverAppendCount = popoverAppendCount;
        popoverAppendCount = 0;
        syncUi.bindSyncUIStatusUpdates();
        syncUi.bindSyncUIStatusUpdates();
        syncState.updateSyncStatus({ push: 'pending', pushStartedAt: Date.now(), lastError: null, relay: 'connected' });
        await waitFor(() => popoverAppendCount >= baselinePopoverAppendCount + 1, 'status-bound popover repaint');
        outcomes.bindStatusUpdatesIsIdempotent = popoverAppendCount === baselinePopoverAppendCount + 1
          && !!document.getElementById('sync-popover')
          && !!slot.querySelector('#sync-indicator-btn .sync-dot-syncing');
      } finally {
        Element.prototype.appendChild = originalAppendChild;
      }
    } finally {
      syncUi.configureSyncUI({ isSyncEnabled: () => false });
      syncState.resetSyncStatus();
      if (saved.debug == null) localStorage.removeItem('labcharts-debug');
      else localStorage.setItem('labcharts-debug', saved.debug);
      if (saved.clipboardOwn) Object.defineProperty(navigator, 'clipboard', saved.clipboardOwn);
      else delete navigator.clipboard;
      document.getElementById('sync-popover')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      document.querySelectorAll('.notification-container').forEach(el => el.remove());
      slot.innerHTML = '';
    }

    return outcomes;
  }, { uiUrl: moduleUrl('/js/sync-ui.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync identity rotation modal covers cancel copy malformed and apply paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ identityUrl }) => {
    // The cache-busted identity module statically imports this canonical
    // singleton, so configuring it here injects deps into that fresh instance.
    const [identityActions, context] = await Promise.all([
      import(identityUrl),
      import('/js/sync-diagnose-actions-context.js'),
    ]);
    const outcomes = {};
    const calls = [];
    const copied = [];
    const words = Array.from({ length: 24 }, (_, index) => `word${index + 1}`).join(' ');
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const saved = {
      confirm: window.showConfirmDialog,
      bip39: window.bip39,
      qrcode: window.qrcode,
      clipboardOwn: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
    };

    try {
      window.showConfirmDialog = async message => {
        calls.push(['confirm', message]);
        return false;
      };
      await identityActions.confirmRotateIdentity(document.body);
      outcomes.cancelStopsBeforeMnemonic = calls.some(call => call[0] === 'confirm')
        && !document.querySelector('[aria-label="Rotate sync identity"]');

      window.showConfirmDialog = async () => true;
      window.bip39 = { generateMnemonic: async () => 'too few words' };
      await identityActions.confirmRotateIdentity(document.body);
      outcomes.malformedMnemonicNotifies = Array.from(document.querySelectorAll('.notification-toast.error'))
        .some(toast => toast.textContent.includes('Generated mnemonic is malformed'));

      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      window.bip39 = { generateMnemonic: async strength => {
        calls.push(['generate', strength]);
        return words;
      } };
      window.qrcode = () => ({
        addData(value) { calls.push(['qr-data', value.split(/\s+/).length]); },
        make() { calls.push(['qr-make']); },
        createSvgTag() { return '<svg data-qr="1"></svg>'; },
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async value => copied.push(String(value || '')) },
      });
      let syncEnabled = false;
      context.configureSyncDiagnoseActionContext({
        isSyncEnabled: () => syncEnabled,
        enableSync: async options => {
          calls.push(['enable', options?.skipPush === true]);
          syncEnabled = true;
          return true;
        },
        restoreFromMnemonic: async (mnemonic, options) => {
          calls.push(['restore', mnemonic.split(/\s+/).length, options?.seedLocal === true]);
          return true;
        },
      });

      await identityActions.confirmRotateIdentity(document.body);
      const overlay = document.querySelector('[aria-label="Rotate sync identity"]')?.closest('.modal-overlay');
      const applyBtn = overlay?.querySelector('#rotate-apply-btn');
      const check = overlay?.querySelector('#rotate-saved-check');
      if (!overlay || !applyBtn || !check) throw new Error('rotate identity modal controls did not render');
      outcomes.rotateModalRendersQrAndGatesApply = overlay?.classList.contains('show') === true
        && !!overlay.querySelector('svg[data-qr="1"]')
        && applyBtn?.disabled === true
        && calls.some(call => call[0] === 'generate' && call[1] === 256)
        && calls.some(call => call[0] === 'qr-data' && call[1] === 24);

      overlay.querySelector('#rotate-copy-btn')?.click();
      await waitFor(() => copied.length === 1, 'mnemonic clipboard copy');
      outcomes.copyMnemonicWritesAllWords = copied[0].split(/\s+/).length === 24
        && overlay.querySelector('#rotate-copy-btn')?.textContent.includes('Copied');

      check.checked = true;
      check.dispatchEvent(new Event('change', { bubbles: true }));
      outcomes.savedCheckboxEnablesApply = applyBtn.disabled === false;

      applyBtn.click();
      await waitFor(() => calls.some(call => call[0] === 'restore'), 'restore after apply');
      outcomes.applyEnablesSyncAndRestoresMnemonic = calls.some(call => call[0] === 'enable' && call[1] === true)
        && calls.some(call => call[0] === 'restore' && call[1] === 24 && call[2] === true)
        && applyBtn.textContent.includes('Applying');
    } finally {
      context.configureSyncDiagnoseActionContext({
        enableSync: async () => false,
        restoreFromMnemonic: async () => false,
        isSyncEnabled: () => false,
      });
      window.showConfirmDialog = saved.confirm;
      if (saved.bip39 === undefined) delete window.bip39;
      else window.bip39 = saved.bip39;
      if (saved.qrcode === undefined) delete window.qrcode;
      else window.qrcode = saved.qrcode;
      if (saved.clipboardOwn) Object.defineProperty(navigator, 'clipboard', saved.clipboardOwn);
      else delete navigator.clipboard;
      document.querySelectorAll('.modal-overlay,.notification-container,.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  }, { identityUrl: moduleUrl('/js/sync-diagnose-identity-actions.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
