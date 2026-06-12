import { expect, test } from './coverage-fixture.js';

test('chat thread rail and delegated thread actions work in the live DOM', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() =>
    typeof window.toggleThreadRail === 'function'
      && typeof window.renderThreadList === 'function'
      && typeof window.filterThreadList === 'function'
      && typeof window.autoNameThread === 'function'
      && !!window._labState
  );

  const results = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const profileId = state.currentProfile;
    const railKey = `labcharts-${profileId}-chatRailOpen`;
    const rail = document.getElementById('chat-thread-rail');
    const originalThreads = state.chatThreads.slice();
    const originalThreadId = state.currentThreadId;
    const originalRailState = localStorage.getItem(railKey);
    const savedFns = {
      saveChatHistory: window.saveChatHistory,
      loadChatHistory: window.loadChatHistory,
      cleanupDiscussionState: window.cleanupDiscussionState,
      restoreDiscussionContinuePrompt: window.restoreDiscussionContinuePrompt,
      showPromptDialog: window.showPromptDialog,
    };
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

      rail?.classList.remove('open');
      localStorage.removeItem(railKey);
      window.toggleThreadRail();
      outcomes.railOpensAndPersists = rail?.classList.contains('open') === true
        && localStorage.getItem(railKey) === 'true';
      window.toggleThreadRail();
      outcomes.railClosesAndPersists = rail?.classList.contains('open') === false
        && localStorage.getItem(railKey) === 'false';

      const threadFixtures = [
        { id: 't_a', name: 'Thyroid Panel Discussion', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 5, personality: 'default' },
        { id: 't_b', name: 'Vitamin D Levels', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 3, personality: 'default' },
        { id: 't_c', name: 'Cholesterol Overview', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 2, personality: 'default' },
      ];
      state.chatThreads = threadFixtures.map(thread => ({ ...thread }));
      window.saveChatThreadIndex();
      window.renderThreadList();
      outcomes.allThreadsRendered = document.querySelectorAll('.chat-thread-item').length === 3;

      const threadItem = document.querySelector('.chat-thread-item[data-thread-id="t_a"]');
      const renameBtn = document.querySelector('.chat-thread-item[data-thread-id="t_a"] .chat-thread-item-action');
      const deleteBtn = document.querySelector('.chat-thread-item[data-thread-id="t_a"] .chat-thread-item-action.delete');
      outcomes.threadItemUsesDelegatedSwitch = threadItem?.getAttribute('data-chat-thread-action') === 'switch'
        && !threadItem.hasAttribute('onclick');
      outcomes.renameButtonUsesDelegatedAction = renameBtn?.getAttribute('data-chat-thread-action') === 'rename'
        && !renameBtn.hasAttribute('onclick');
      outcomes.deleteButtonUsesDelegatedAction = deleteBtn?.getAttribute('data-chat-thread-action') === 'delete'
        && !deleteBtn.hasAttribute('onclick');

      window.saveChatHistory = async () => {};
      window.loadChatHistory = async () => {};
      window.cleanupDiscussionState = () => {};
      window.restoreDiscussionContinuePrompt = () => {};
      state.currentThreadId = 't_b';
      threadItem?.click();
      outcomes.threadItemClickSwitchesThread = await waitFor(() => state.currentThreadId === 't_a');

      window.showPromptDialog = async () => 'Renamed Thread';
      document.querySelector('.chat-thread-item[data-thread-id="t_a"] .chat-thread-item-action')?.click();
      outcomes.renameButtonRenamesThread = await waitFor(() =>
        state.chatThreads.find(thread => thread.id === 't_a')?.name === 'Renamed Thread'
      );

      state.chatThreads.find(thread => thread.id === 't_a').name = 'Thyroid Panel Discussion';
      window.renderThreadList();
      document.querySelector('.chat-thread-item[data-thread-id="t_c"] .chat-thread-item-action.delete')?.click();
      const confirmOk = await waitFor(() => document.getElementById('confirm-ok'));
      document.getElementById('confirm-ok')?.click();
      outcomes.deleteButtonRemovesThread = confirmOk
        && await waitFor(() => !state.chatThreads.some(thread => thread.id === 't_c'));

      state.chatThreads = threadFixtures.map(thread => ({ ...thread }));
      window.renderThreadList();
      window.filterThreadList('thyroid');
      outcomes.searchFilterShowsOne = document.querySelectorAll('.chat-thread-item').length === 1;
      window.filterThreadList('');
      outcomes.emptyFilterShowsAll = document.querySelectorAll('.chat-thread-item').length === 3;
      window.filterThreadList('nonexistent');
      outcomes.noMatchShowsEmptyState = document.querySelectorAll('.chat-thread-item').length === 0
        && document.querySelector('#chat-thread-list div')?.textContent.includes('No matching') === true;
      window.filterThreadList('');

      const existingThreadName = state.chatThreads.find(thread => thread.id === 't_b')?.name;
      window.autoNameThread('t_b', 'This should not rename an existing thread');
      state.chatThreads.unshift({
        id: 't_new',
        name: 'New Conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 1,
        personality: 'default',
      });
      window.autoNameThread('t_new', 'What are my vitamin D levels looking like over the past year?');
      const expectedAutoName = 'What are my vitamin D levels looking\u2026';
      outcomes.autoNameThreadRenamesOnlyNewConversations =
        state.chatThreads.find(thread => thread.id === 't_b')?.name === existingThreadName
        && state.chatThreads.find(thread => thread.id === 't_new')?.name === expectedAutoName
        && document.querySelector('.chat-thread-item[data-thread-id="t_new"] .chat-thread-item-name')?.textContent === expectedAutoName;
    } finally {
      state.chatThreads = originalThreads;
      state.currentThreadId = originalThreadId;
      Object.assign(window, savedFns);
      if (originalRailState == null) localStorage.removeItem(railKey);
      else localStorage.setItem(railKey, originalRailState);
      if (originalThreads.length > 0) window.saveChatThreadIndex();
      else localStorage.removeItem(window.getChatThreadsKey());
      window.renderThreadList?.();
    }

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
