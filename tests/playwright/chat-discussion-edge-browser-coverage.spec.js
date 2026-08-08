import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?chatDiscussionEdgeCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('chat discussion callbacks cover default and configured bridge paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-input');

  const results = await page.evaluate(async ({ callbacksUrl }) => {
    const callbacks = await import(callbacksUrl);
    const outcomes = {};
    const el = document.createElement('div');
    const typingEl = document.createElement('div');
    const container = document.createElement('div');
    const controller = new AbortController();
    const calls = [];

    const defaultWriter = callbacks.createDiscussionTypewriter(el, typingEl, container);
    defaultWriter.update('ignored');
    defaultWriter.stop();
    callbacks.setChatAbortController(controller);
    callbacks.renderChatMessages();
    callbacks.setSendButtonMode(null, 'idle');
    outcomes.defaultCallbacksAreNoops =
      callbacks.getChatAbortController() === null
      && typeof defaultWriter.update === 'function'
      && typeof defaultWriter.stop === 'function';

    callbacks.configureChatDiscussion({
      createTypewriter(receivedEl, receivedTyping, receivedContainer) {
        calls.push(['typewriter', receivedEl === el, receivedTyping === typingEl, receivedContainer === container]);
        return {
          update(text) { calls.push(['update', text]); },
          stop() { calls.push(['stop']); },
        };
      },
      getChatAbortController: () => controller,
      renderChatMessages: () => { calls.push(['render']); },
      setChatAbortController(nextController) { calls.push(['controller', nextController === controller]); },
      setSendButtonMode(btn, mode) { calls.push(['mode', btn === el, mode]); },
    });

    const configuredWriter = callbacks.createDiscussionTypewriter(el, typingEl, container);
    configuredWriter.update('streaming text');
    configuredWriter.stop();
    callbacks.setChatAbortController(controller);
    callbacks.renderChatMessages();
    callbacks.setSendButtonMode(el, 'streaming');

    outcomes.configuredCallbacksForwardArguments =
      callbacks.getChatAbortController() === controller
      && calls.some(call => call[0] === 'typewriter' && call[1] && call[2] && call[3])
      && calls.some(call => call[0] === 'update' && call[1] === 'streaming text')
      && calls.some(call => call[0] === 'stop')
      && calls.some(call => call[0] === 'controller' && call[1] === true)
      && calls.some(call => call[0] === 'render')
      && calls.some(call => call[0] === 'mode' && call[1] === true && call[2] === 'streaming');

    callbacks.configureChatDiscussion({
      createTypewriter: null,
      getChatAbortController: () => null,
      renderChatMessages: () => {},
      setChatAbortController: () => {},
      setSendButtonMode: () => {},
    });

    return outcomes;
  }, {
    callbacksUrl: moduleUrl('/js/chat-discussion-callbacks.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('chat discussion turns cover single-turn join and error cleanup paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-send-btn');

  const results = await page.evaluate(async ({ turnsUrl }) => {
    const [{ state }, callbacks, turns] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-discussion-callbacks.js'),
      import(turnsUrl),
    ]);
    const outcomes = {};
    const storage = new Map(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return [key, key ? localStorage.getItem(key) : null];
    }));
    const messages = document.getElementById('chat-messages');
    const original = {
      currentProfile: state.currentProfile,
      currentThreadId: state.currentThreadId,
      currentChatPersonality: state.currentChatPersonality,
      chatHistory: state.chatHistory,
      chatThreads: state.chatThreads,
      messagesHTML: messages?.innerHTML,
    };
    const modes = [];
    const controllerStates = [];
    let currentController = null;

    try {
      state.currentProfile = 'discussion-turns-edge-profile';
      state.currentThreadId = 'discussion-turns-edge-thread';
      state.currentChatPersonality = 'default';
      state.chatHistory = [];
      state.chatThreads = [{
        id: 'discussion-turns-edge-thread',
        name: 'Discussion Edge Thread',
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
        messageCount: 0,
        personality: 'default',
      }];
      if (messages) messages.innerHTML = '';
      localStorage.setItem('labcharts-ai-provider', 'coverage-unknown');
      localStorage.setItem('labcharts-ai-paused', 'false');

      callbacks.configureChatDiscussion({
        getChatAbortController: () => currentController,
        setChatAbortController(controller) {
          currentController = controller;
          controllerStates.push(controller ? 'set' : 'clear');
        },
        setSendButtonMode(_btn, mode) {
          modes.push(mode);
        },
        renderChatMessages() {
          if (messages) {
            messages.innerHTML = state.chatHistory.map((message, index) =>
              `<div id="chat-msg-${index}" class="chat-msg">${message.content || ''}</div>`
            ).join('');
          }
        },
        createTypewriter() {
          return {
            update() {},
            stop() { controllerStates.push('typewriter-stop'); },
          };
        },
      });

      await turns.runSingleDiscussionTurn(
        { id: 'house', name: 'Reviewer', icon: 'R' },
        [
          { id: 'default', name: 'Analyst', icon: 'A' },
          { id: 'house', name: 'Reviewer', icon: 'R' },
        ]
      );

      const thread = state.chatThreads.find(item => item.id === 'discussion-turns-edge-thread');
      outcomes.singleTurnPushesJoinAndHiddenAutoMessage =
        state.chatHistory.length >= 2
        && state.chatHistory[0].joined === true
        && state.chatHistory[0].joinName === 'Reviewer'
        && state.chatHistory[1].hidden === true;
      outcomes.singleTurnPersistsDiscussionMetadata =
        thread?.discussionOriginalPersonality === 'default'
        && Array.isArray(thread.discussionPersonas)
        && thread.discussionPersonas.length === 2;
      outcomes.singleTurnCleansCallbacksAndPersonality =
        currentController === null
        && controllerStates.includes('set')
        && controllerStates.includes('clear')
        && modes[0] === 'streaming'
        && modes.at(-1) === 'idle'
        && state.currentChatPersonality === 'default';
      outcomes.singleTurnRendersLocalErrorWithoutNetwork =
        messages?.textContent.includes("Couldn't get Reviewer\'s response") === true
        && document.querySelector('.chat-discussion-mode') !== null
        && thread?.discussionPendingPersonas?.[0]?.id === 'house';
    } finally {
      callbacks.configureChatDiscussion({
        createTypewriter: null,
        getChatAbortController: () => null,
        renderChatMessages: () => {},
        setChatAbortController: () => {},
        setSendButtonMode: () => {},
      });
      state.currentProfile = original.currentProfile;
      state.currentThreadId = original.currentThreadId;
      state.currentChatPersonality = original.currentChatPersonality;
      state.chatHistory = original.chatHistory;
      state.chatThreads = original.chatThreads;
      if (messages && original.messagesHTML != null) messages.innerHTML = original.messagesHTML;
      document.querySelector('.chat-discussion-mode')?.remove();
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    turnsUrl: moduleUrl('/js/chat-discussion-turns.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('chat thread search default callbacks cover no-op filter and jump paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-thread-search');

  const results = await page.evaluate(async ({ threadSearchUrl }) => {
    const [{ state }, threadSearch] = await Promise.all([
      import('/js/state.js'),
      import(threadSearchUrl),
    ]);
    const input = document.getElementById('chat-thread-search');
    const list = document.getElementById('chat-thread-list');
    const messages = document.getElementById('chat-messages');
    const original = {
      currentProfile: state.currentProfile,
      currentThreadId: state.currentThreadId,
      chatThreads: state.chatThreads,
      chatHistory: state.chatHistory,
      inputValue: input?.value,
      listHTML: list?.innerHTML,
      messagesHTML: messages?.innerHTML,
    };
    const waitForSearch = () => new Promise(resolve => setTimeout(resolve, 320));

    try {
      state.currentProfile = 'chat-search-default-profile';
      state.currentThreadId = 'default-thread-a';
      state.chatThreads = [
        { id: 'default-thread-a', name: 'Default A' },
        { id: 'default-thread-b', name: 'Default B' },
      ];
      state.chatHistory = [
        { role: 'user', content: 'Needle default message for no-op switch coverage' },
      ];
      if (messages) {
        messages.innerHTML = '<div id="chat-msg-0" class="chat-msg"><span>Needle default message for no-op switch coverage</span></div>';
      }

      const staleMark = document.createElement('mark');
      staleMark.className = 'chat-search-mark';
      staleMark.textContent = 'old';
      messages?.appendChild(staleMark);
      const staleHighlight = document.getElementById('chat-msg-0');
      staleHighlight?.classList.add('chat-msg-highlight');
      if (input) input.value = '';
      threadSearch.filterThreadList('');
      const clearSearchNoopsAndRemovesMarks =
        document.querySelector('.chat-search-mark') === null
        && staleHighlight?.classList.contains('chat-msg-highlight') === false;

      if (list) list.innerHTML = '<div>No matching conversations</div>';
      if (input) input.value = 'needle';
      threadSearch.invalidateThreadContentCache();
      threadSearch.filterThreadList('needle');
      await waitForSearch();
      const defaultKeyNoResultsBranch =
        list?.textContent.includes('No matches in conversations or messages') === true;

      await threadSearch.jumpToSearchResult(
        'default-thread-b',
        0,
        state.chatHistory[0].content.slice(0, 50)
      );
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const defaultSwitchNoopKeepsThreadAndHighlights =
        state.currentThreadId === 'default-thread-a'
        && document.getElementById('chat-msg-0')?.classList.contains('chat-msg-highlight') === true
        && document.querySelector('.chat-search-mark')?.textContent.toLowerCase() === 'needle';

      return {
        clearSearchNoopsAndRemovesMarks,
        defaultKeyNoResultsBranch,
        defaultSwitchNoopKeepsThreadAndHighlights,
      };
    } finally {
      state.currentProfile = original.currentProfile;
      state.currentThreadId = original.currentThreadId;
      state.chatThreads = original.chatThreads;
      state.chatHistory = original.chatHistory;
      if (input && original.inputValue != null) input.value = original.inputValue;
      if (list && original.listHTML != null) list.innerHTML = original.listHTML;
      if (messages && original.messagesHTML != null) messages.innerHTML = original.messagesHTML;
    }
  }, {
    threadSearchUrl: moduleUrl('/js/chat-thread-search.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('chat thread search covers stale results limits and shifted highlight branches', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-thread-search');

  const results = await page.evaluate(async ({ threadSearchUrl }) => {
    const [{ state }, threadSearch] = await Promise.all([
      import('/js/state.js'),
      import(threadSearchUrl),
    ]);
    const outcomes = {};
    const storage = new Map(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return [key, key ? localStorage.getItem(key) : null];
    }));
    const input = document.getElementById('chat-thread-search');
    const list = document.getElementById('chat-thread-list');
    const messages = document.getElementById('chat-messages');
    const original = {
      currentProfile: state.currentProfile,
      currentThreadId: state.currentThreadId,
      chatThreads: state.chatThreads,
      chatHistory: state.chatHistory,
      inputValue: input?.value,
      listHTML: list?.innerHTML,
      messagesHTML: messages?.innerHTML,
    };
    const renderCalls = [];
    const waitForSearch = () => new Promise(resolve => setTimeout(resolve, 320));
    const renderMessages = () => {
      if (!messages) return;
      messages.innerHTML = state.chatHistory.map((message, index) =>
        `<div id="chat-msg-${index}" class="chat-msg"><span>${message.content}</span></div>`
      ).join('');
    };

    try {
      state.currentProfile = 'chat-search-edge-profile';
      state.currentThreadId = 'thread-0';
      state.chatThreads = Array.from({ length: 35 }, (_, index) => ({
        id: `thread-${index}`,
        name: `Thread ${index}`,
      }));
      state.chatHistory = [
        { role: 'user', content: 'First message without the target' },
        { role: 'assistant', content: 'Needle shifted into the second message' },
      ];
      for (const thread of state.chatThreads) {
        localStorage.setItem(`chat-search-edge-${thread.id}`, JSON.stringify([
          {
            role: Number(thread.id.split('-')[1]) % 2 === 0 ? 'user' : 'assistant',
            content: `Needle match from ${thread.name} with enough surrounding context to build a snippet.`,
          },
        ]));
      }
      renderMessages();

      threadSearch.configureChatThreadSearch({
        getChatThreadKey: threadId => `chat-search-edge-${threadId}`,
        renderThreadList(filter) {
          renderCalls.push(filter || '');
          if (list) list.innerHTML = `<div class="thread-filter">${filter || ''}</div>`;
        },
        async switchToThread(threadId) {
          state.currentThreadId = threadId;
          renderMessages();
        },
      });

      input.value = 'needle';
      threadSearch.filterThreadList('needle');
      input.value = 'changed-before-debounce';
      await waitForSearch();
      outcomes.staleSearchResultsAreIgnored =
        list?.querySelector('.chat-search-result') === null
        && list?.querySelector('.thread-filter')?.textContent === 'needle';

      input.value = 'needle';
      threadSearch.invalidateThreadContentCache();
      threadSearch.filterThreadList('needle');
      await waitForSearch();
      outcomes.searchResultsAreLimitedAndShowTruncation =
        document.querySelectorAll('.chat-search-result').length === 30
        && list?.textContent.includes('Showing first 30 matches') === true
        && renderCalls.includes('needle');

      await threadSearch.jumpToSearchResult(
        'thread-0',
        0,
        state.chatHistory[1].content.slice(0, 50)
      );
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      outcomes.shiftedMessagePrefixFindsCorrectIndex =
        document.getElementById('chat-msg-1')?.classList.contains('chat-msg-highlight') === true
        && document.getElementById('chat-msg-1')?.querySelector('.chat-search-mark')?.textContent.toLowerCase() === 'needle';

      await threadSearch.jumpToSearchResult('thread-0', 0, 'missing prefix');
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      outcomes.missingShiftedPrefixSkipsHighlight =
        document.querySelectorAll('.chat-msg-highlight').length === 1
        && document.getElementById('chat-msg-1')?.classList.contains('chat-msg-highlight') === true;
    } finally {
      threadSearch.configureChatThreadSearch({
        getChatThreadKey: () => '',
        renderThreadList: () => {},
        switchToThread: async () => {},
      });
      state.currentProfile = original.currentProfile;
      state.currentThreadId = original.currentThreadId;
      state.chatThreads = original.chatThreads;
      state.chatHistory = original.chatHistory;
      if (input && original.inputValue != null) input.value = original.inputValue;
      if (list && original.listHTML != null) list.innerHTML = original.listHTML;
      if (messages && original.messagesHTML != null) messages.innerHTML = original.messagesHTML;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    threadSearchUrl: moduleUrl('/js/chat-thread-search.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
