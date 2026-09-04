import { expect, test } from './coverage-fixture.js';

test('chat thread rail and delegated thread actions work in the live DOM', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(async () => {
    const { state } = await import('/js/state.js');
    return !!state;
  });

  const results = await page.evaluate(async () => {
    const chatThreads = await import('/js/chat-threads.js');
    const { state } = await import('/js/state.js');
    const profileId = state.currentProfile;
    const railKey = `labcharts-${profileId}-chatRailOpen`;
    const rail = document.getElementById('chat-thread-rail');
    const originalThreads = state.chatThreads.slice();
    const originalThreadId = state.currentThreadId;
    const originalPersonality = state.currentChatPersonality;
    const personalityKey = `labcharts-${profileId}-chatPersonality`;
    const originalStoredPersonality = localStorage.getItem(personalityKey);
    const originalRailState = localStorage.getItem(railKey);
    let savedThreadDeps = null;
    const waitFor = async (fn, timeoutMs = 500) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (fn()) return true;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return false;
    };
    const outcomes = {};

    try {
      const chatPanel = document.getElementById('chat-panel');
      outcomes.threadRailExists = !!rail;
      outcomes.threadListExists = !!document.getElementById('chat-thread-list');
      outcomes.threadSearchExists = !!document.getElementById('chat-thread-search');
      outcomes.chatPanelConversationExists = !!document.querySelector('.chat-panel-conversation');
      outcomes.chatRailToggleExists = !!document.querySelector('.chat-rail-toggle');
      outcomes.chatThreadNewButtonExists = !!document.querySelector('.chat-thread-new-btn');
      outcomes.chatHeaderLeftExists = !!document.querySelector('.chat-header-left');
      outcomes.chatPanelIsRow = getComputedStyle(chatPanel).flexDirection === 'row';
      outcomes.chatThreadHelpersStayModuleOnly = [
        'getChatThreadsKey',
        'getChatThreadKey',
        'loadChatThreads',
        'saveChatThreadIndex',
        'ensureActiveThread',
        'createNewThread',
        'switchToThread',
        'deleteThread',
        'renameThread',
        'renameThreadPrompt',
        'installChatThreadDelegates',
        'autoNameThread',
        'pruneOldThreads',
        'renderThreadList',
        'invalidateThreadContentCache',
        'filterThreadList',
        'jumpToSearchResult',
        'toggleThreadRail',
      ].every(name => typeof window[name] === 'undefined');

      rail?.classList.remove('open');
      localStorage.removeItem(railKey);
      chatThreads.toggleThreadRail();
      outcomes.railOpensAndPersists = rail?.classList.contains('open') === true
        && localStorage.getItem(railKey) === 'true';
      chatThreads.toggleThreadRail();
      outcomes.railClosesAndPersists = rail?.classList.contains('open') === false
        && localStorage.getItem(railKey) === 'false';

      const threadFixtures = [
        { id: 't_a', name: 'Thyroid Panel Discussion', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 5, personality: 'default' },
        { id: 't_b', name: 'Vitamin D Levels', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 3, personality: 'house' },
        { id: 't_c', name: 'Cholesterol Overview', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 2, personality: 'default' },
      ];
      state.chatThreads = threadFixtures.map(thread => ({ ...thread }));
      chatThreads.saveChatThreadIndex();
      chatThreads.renderThreadList();
      outcomes.allThreadsRendered = document.querySelectorAll('.chat-thread-item').length === 3;

      const threadItem = document.querySelector('.chat-thread-item[data-thread-id="t_a"]');
      const threadSwitch = threadItem?.querySelector('.chat-thread-item-main');
      const renameBtn = document.querySelector('.chat-thread-item[data-thread-id="t_a"] [data-chat-thread-action="rename"]');
      const deleteBtn = document.querySelector('.chat-thread-item[data-thread-id="t_a"] [data-chat-thread-action="delete"]');
      outcomes.threadItemUsesNativeDelegatedSwitch = threadSwitch?.tagName === 'BUTTON'
        && threadSwitch?.getAttribute('data-chat-thread-action') === 'switch'
        && threadSwitch?.getAttribute('aria-current') === 'false'
        && !threadSwitch.hasAttribute('onclick');
      outcomes.renameButtonUsesDelegatedAction = renameBtn?.getAttribute('data-chat-thread-action') === 'rename'
        && !renameBtn.hasAttribute('onclick');
      outcomes.deleteButtonUsesDelegatedAction = deleteBtn?.getAttribute('data-chat-thread-action') === 'delete'
        && !deleteBtn.hasAttribute('onclick');

      let stoppedGenerations = 0;
      savedThreadDeps = chatThreads.configureChatThreadDeps({
        saveChatHistory: async () => {},
        loadChatHistory: async () => {},
        cleanupDiscussionState: () => {},
        restoreDiscussionContinuePrompt: () => {},
        renderChatMessages: () => {},
        renderSavedSummaries: () => {},
        updateChatHeaderTitle: () => {},
        updatePersonalityBar: () => {},
        getActivePersonality: () => ({ name: 'Default', icon: '' }),
        showPromptDialog: async () => 'Renamed Thread',
        stopChatGeneration: () => { stoppedGenerations += 1; },
      });
      state.currentThreadId = 't_b';
      state.currentChatPersonality = 'house';
      rail?.classList.add('open');
      localStorage.setItem(railKey, 'true');
      threadSwitch?.click();
      outcomes.threadItemClickSwitchesThread = await waitFor(() => state.currentThreadId === 't_a');
      outcomes.threadSwitchRestoresPersonalityAndStopsGeneration =
        state.currentChatPersonality === 'default'
        && localStorage.getItem(personalityKey) === 'default'
        && stoppedGenerations === 1;
      outcomes.activeThreadIsExposedToAssistiveTechnology =
        document.querySelector('.chat-thread-item[data-thread-id="t_a"] .chat-thread-item-main')?.getAttribute('aria-current') === 'true';
      outcomes.desktopThreadSelectionKeepsSplitRailOpen =
        rail?.classList.contains('open') === true
        && localStorage.getItem(railKey) === 'true';

      document.querySelector('.chat-thread-item[data-thread-id="t_a"] [data-chat-thread-action="rename"]')?.click();
      outcomes.renameButtonRenamesThread = await waitFor(() =>
        state.chatThreads.find(thread => thread.id === 't_a')?.name === 'Renamed Thread'
      );

      state.chatThreads.find(thread => thread.id === 't_a').name = 'Thyroid Panel Discussion';
      chatThreads.renderThreadList();
      document.querySelector('.chat-thread-item[data-thread-id="t_c"] [data-chat-thread-action="delete"]')?.click();
      const confirmOk = await waitFor(() => document.getElementById('confirm-ok'));
      document.getElementById('confirm-ok')?.click();
      outcomes.deleteButtonRemovesThread = confirmOk
        && await waitFor(() => !state.chatThreads.some(thread => thread.id === 't_c'));

      state.chatThreads = threadFixtures.map(thread => ({ ...thread }));
      chatThreads.renderThreadList();
      chatThreads.filterThreadList('thyroid');
      outcomes.searchFilterShowsOne = document.querySelectorAll('.chat-thread-item').length === 1;
      chatThreads.filterThreadList('');
      outcomes.emptyFilterShowsAll = document.querySelectorAll('.chat-thread-item').length === 3;
      chatThreads.filterThreadList('nonexistent');
      outcomes.noMatchShowsEmptyState = document.querySelectorAll('.chat-thread-item').length === 0
        && document.querySelector('#chat-thread-list div')?.textContent.includes('No matching') === true;
      chatThreads.filterThreadList('');

      const existingThreadName = state.chatThreads.find(thread => thread.id === 't_b')?.name;
      chatThreads.autoNameThread('t_b', 'This should not rename an existing thread');
      state.chatThreads.unshift({
        id: 't_new',
        name: 'New Conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 1,
        personality: 'default',
      });
      chatThreads.autoNameThread('t_new', 'What are my vitamin D levels looking like over the past year?');
      const expectedAutoName = 'What are my vitamin D levels looking\u2026';
      outcomes.autoNameThreadRenamesOnlyNewConversations =
        state.chatThreads.find(thread => thread.id === 't_b')?.name === existingThreadName
        && state.chatThreads.find(thread => thread.id === 't_new')?.name === expectedAutoName
        && document.querySelector('.chat-thread-item[data-thread-id="t_new"] .chat-thread-item-name')?.textContent === expectedAutoName;
    } finally {
      state.chatThreads = originalThreads;
      state.currentThreadId = originalThreadId;
      state.currentChatPersonality = originalPersonality;
      if (originalStoredPersonality == null) localStorage.removeItem(personalityKey);
      else localStorage.setItem(personalityKey, originalStoredPersonality);
      if (savedThreadDeps) chatThreads.configureChatThreadDeps(savedThreadDeps);
      if (originalRailState == null) localStorage.removeItem(railKey);
      else localStorage.setItem(railKey, originalRailState);
      if (originalThreads.length > 0) chatThreads.saveChatThreadIndex();
      else localStorage.removeItem(chatThreads.getChatThreadsKey());
      chatThreads.renderThreadList();
    }

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('conversation projects, pinning, and sorting persist through the thread index', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const outcomes = await page.evaluate(async () => {
    const [{ state }, threads] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-threads.js'),
    ]);
    const originalThreads = state.chatThreads;
    const originalThreadId = state.currentThreadId;
    const originalSort = localStorage.getItem('labcharts-chat-thread-sort');
    const now = new Date().toISOString();
    const earlier = new Date(Date.now() - 3 * 86400000).toISOString();
    let promptValue = 'Hormones';
    const previousDeps = threads.configureChatThreadDeps({
      saveChatHistory: async () => {},
      loadChatHistory: async () => {},
      cleanupDiscussionState: () => {},
      restoreDiscussionContinuePrompt: () => {},
      renderChatMessages: () => {},
      renderSavedSummaries: () => {},
      updateChatHeaderTitle: () => {},
      updatePersonalityBar: () => {},
      getActivePersonality: () => ({ name: 'Default', icon: '' }),
      showPromptDialog: async () => promptValue,
    });
    try {
      state.chatThreads = [
        { id: 'pinned', name: 'Pinned labs', createdAt: earlier, updatedAt: earlier, messageCount: 2, personality: 'default', pinned: true },
        { id: 'project', name: 'Metabolic review', createdAt: earlier, updatedAt: earlier, messageCount: 3, personality: 'default', projectName: 'Metabolic' },
        { id: 'zulu', name: 'Zulu', createdAt: now, updatedAt: now, messageCount: 1, personality: 'default' },
        { id: 'alpha', name: 'Alpha', createdAt: now, updatedAt: now, messageCount: 1, personality: 'default' },
      ];
      state.currentThreadId = 'alpha';
      threads.setChatThreadSort('recent');
      const recentGroups = [...document.querySelectorAll('.chat-thread-group-title')].map(node => node.textContent.trim());

      threads.setChatThreadSort('name');
      const alphabetical = [...document.querySelectorAll('.chat-thread-group:last-child .chat-thread-item-name')]
        .map(node => node.textContent);

      const pinned = threads.toggleThreadPinned('zulu') === true
        && state.chatThreads.find(thread => thread.id === 'zulu')?.pinned === true;
      await threads.moveThreadToProject('alpha', 'Hormones');
      const moved = state.chatThreads.find(thread => thread.id === 'alpha')?.projectName === 'Hormones';

      promptValue = 'Nutrition';
      const created = await threads.createThreadProject();
      return {
        groupsExist: recentGroups.includes('Pinned') && recentGroups.includes('Metabolic') && recentGroups.includes('Today'),
        alphabeticalSort: alphabetical.join('|') === 'Alpha|Zulu',
        sortPersisted: localStorage.getItem('labcharts-chat-thread-sort') === 'name',
        pinned,
        moved,
        projectCreationStartsConversation: created?.projectName === 'Nutrition'
          && state.currentThreadId === created.id,
      };
    } finally {
      threads.configureChatThreadDeps(previousDeps);
      state.chatThreads = originalThreads;
      state.currentThreadId = originalThreadId;
      if (originalSort === null) localStorage.removeItem('labcharts-chat-thread-sort');
      else localStorage.setItem('labcharts-chat-thread-sort', originalSort);
      threads.renderThreadList();
    }
  });

  for (const [name, passed] of Object.entries(outcomes)) expect(passed, name).toBe(true);
});

test('desktop conversations move into projects with drag and drop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.goto('/app', { waitUntil: 'load' });
  const original = await page.evaluate(async () => {
    const [{ state }, threads, panelModule] = await Promise.all([import('/js/state.js'), import('/js/chat-threads.js'), import('/js/chat-panel.js')]);
    await panelModule.loadChatPresentationStylesheets();
    const panel = document.getElementById('chat-panel');
    panel?.classList.add('open');
    panel?.removeAttribute('inert');
    document.getElementById('chat-thread-rail')?.classList.add('open');
    document.getElementById('tour-overlay')?.remove();
    const snapshot = { chatThreads: state.chatThreads, currentThreadId: state.currentThreadId };
    const now = new Date().toISOString();
    state.chatThreads = [
      { id: 'drag-me', name: 'Move me', createdAt: now, updatedAt: now, messageCount: 1, personality: 'default' },
      { id: 'project-home', name: 'Metabolic overview', createdAt: now, updatedAt: now, messageCount: 2, personality: 'default', projectName: 'Metabolic' },
    ];
    state.currentThreadId = 'drag-me';
    threads.renderThreadList();
    return snapshot;
  });

  await expect(page.locator('[data-chat-thread-action="move"]')).toHaveCount(0);
  const projectTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page.locator('.chat-thread-item[data-thread-id="drag-me"]').dispatchEvent('dragstart', { dataTransfer: projectTransfer });
  await page.locator('[data-chat-project-drop="Metabolic"] .chat-thread-group-title').dispatchEvent('dragover', { dataTransfer: projectTransfer });
  await page.locator('[data-chat-project-drop="Metabolic"] .chat-thread-group-title').dispatchEvent('drop', { dataTransfer: projectTransfer });
  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return state.chatThreads.find(thread => thread.id === 'drag-me')?.projectName || '';
  })).toBe('Metabolic');
  await expect(page.locator('[data-chat-project-drop="Metabolic"] .chat-thread-item')).toHaveCount(2);

  const unfiledTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page.locator('.chat-thread-item[data-thread-id="drag-me"]').dispatchEvent('dragstart', { dataTransfer: unfiledTransfer });
  await expect(page.locator('.chat-thread-unfiled-drop')).toBeVisible();
  await page.locator('.chat-thread-unfiled-drop').dispatchEvent('dragover', { dataTransfer: unfiledTransfer });
  await page.locator('.chat-thread-unfiled-drop').dispatchEvent('drop', { dataTransfer: unfiledTransfer });
  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return state.chatThreads.find(thread => thread.id === 'drag-me')?.projectName || '';
  })).toBe('');

  await page.evaluate(async snapshot => {
    const [{ state }, threads] = await Promise.all([import('/js/state.js'), import('/js/chat-threads.js')]);
    state.chatThreads = snapshot.chatThreads;
    state.currentThreadId = snapshot.currentThreadId;
    threads.renderThreadList();
  }, original);
});

test('mobile thread selection and creation return directly to the chat', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const chatThreads = await import('/js/chat-threads.js');
    const { state } = await import('/js/state.js');
    const rail = document.getElementById('chat-thread-rail');
    const railKey = `labcharts-${state.currentProfile}-chatRailOpen`;
    const originalThreads = state.chatThreads;
    const originalThreadId = state.currentThreadId;
    const originalRailState = localStorage.getItem(railKey);
    const outcomes = {};
    const waitFor = async (fn, timeoutMs = 500) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (fn()) return true;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return false;
    };
    const previousDeps = chatThreads.configureChatThreadDeps({
      saveChatHistory: async () => {},
      loadChatHistory: async () => {},
      cleanupDiscussionState: () => {},
      restoreDiscussionContinuePrompt: () => {},
      renderChatMessages: () => {},
      renderSavedSummaries: () => {},
      updateChatHeaderTitle: () => {},
      updatePersonalityBar: () => {},
      getActivePersonality: () => ({ name: 'Default', icon: '' }),
    });

    try {
      const now = new Date().toISOString();
      state.chatThreads = [
        { id: 'mobile-a', name: 'First conversation', createdAt: now, updatedAt: now, messageCount: 2, personality: 'default' },
        { id: 'mobile-b', name: 'Second conversation', createdAt: now, updatedAt: now, messageCount: 1, personality: 'default' },
      ];
      state.currentThreadId = 'mobile-b';
      chatThreads.renderThreadList();
      rail?.classList.add('open');
      localStorage.setItem(railKey, 'true');

      document.querySelector('.chat-thread-item[data-thread-id="mobile-a"] .chat-thread-item-main')?.click();
      outcomes.selectingThreadClosesMobileRail =
        await waitFor(() => state.currentThreadId === 'mobile-a')
        && rail?.classList.contains('open') === false
        && localStorage.getItem(railKey) === 'false';

      rail?.classList.add('open');
      localStorage.setItem(railKey, 'true');
      document.querySelector('.chat-thread-item[data-thread-id="mobile-a"] .chat-thread-item-main')?.click();
      outcomes.selectingActiveThreadAlsoClosesMobileRail =
        rail?.classList.contains('open') === false
        && localStorage.getItem(railKey) === 'false';

      rail?.classList.add('open');
      localStorage.setItem(railKey, 'true');
      chatThreads.createNewThread({ sync: false });
      outcomes.creatingThreadClosesMobileRail =
        rail?.classList.contains('open') === false
        && localStorage.getItem(railKey) === 'false';
    } finally {
      chatThreads.configureChatThreadDeps(previousDeps);
      state.chatThreads = originalThreads;
      state.currentThreadId = originalThreadId;
      if (originalRailState == null) localStorage.removeItem(railKey);
      else localStorage.setItem(railKey, originalRailState);
      chatThreads.renderThreadList();
    }

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
