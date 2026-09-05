import { expect, test } from './coverage-fixture.js';

test('chat action bars, clipboard, and context toggles work in the live DOM', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(async () => {
    const { state } = await import('/js/state.js');
    return !!state;
  });

  const results = await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const chatActions = await import('/js/chat-actions.js');
    const chatRender = await import('/js/chat-render.js');
    const { state } = await import('/js/state.js');
    const originalHistory = JSON.parse(JSON.stringify(state.chatHistory || []));
    const outcomes = {};

    try {
      state.chatHistory = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!', context: [{ label: 'Lab values', detail: '5 markers' }] },
        { role: 'user', content: 'More info' },
        { role: 'assistant', content: 'Sure, here is more.', context: [{ label: 'Diet', detail: 'filled' }, { label: 'Sleep & Rest', detail: 'filled' }] },
      ];

      const realContainer = document.getElementById('chat-messages');
      const hasProvider = api.hasAIProvider();
      if (realContainer && hasProvider) {
        chatRender.renderChatMessages();
        const aiMsgs = realContainer.querySelectorAll('.chat-msg.chat-ai');
        const userMsgs = realContainer.querySelectorAll('.chat-msg.chat-user');
        outcomes.aiMessagesHaveActionBars = aiMsgs.length > 0 && aiMsgs[0].querySelector('.chat-action-bar') !== null;
        outcomes.aiActionBarHasButtons = aiMsgs.length > 0 && aiMsgs[0].querySelectorAll('.chat-action-btn').length >= 1;
        outcomes.editStaysOnLatestUserWhileForkStaysOnAssistant = userMsgs.length === 2
          && userMsgs[0].querySelector('[data-chat-message-action="edit-user-message"]') === null
          && userMsgs[0].querySelector('[data-chat-message-action="copy-message"]') === null
          && userMsgs[0].querySelector('[data-chat-message-action="fork-message"]') === null
          && userMsgs[1].querySelector('[data-chat-message-action="edit-user-message"]')?.getAttribute('aria-label') === 'Edit and resend your latest message'
          && userMsgs[1].querySelector('[data-chat-message-action="copy-message"]') === null
          && userMsgs[1].querySelector('[data-chat-message-action="fork-message"]') === null
          && aiMsgs[0].querySelector('[data-chat-message-action="fork-message"]')?.textContent.includes('Fork to new chat');
      } else {
        const doc = new DOMParser().parseFromString(
          `<div class="chat-msg chat-ai">${chatActions.buildActionBar(1)}</div><div class="chat-msg chat-user old-user">Hello${chatActions.buildUserActionBar(0)}</div><div class="chat-msg chat-user latest-user">More${chatActions.buildUserActionBar(2)}</div>`,
          'text/html'
        );
        const aiMsg = doc.querySelector('.chat-msg.chat-ai');
        const oldUserMsg = doc.querySelector('.chat-msg.old-user');
        const latestUserMsg = doc.querySelector('.chat-msg.latest-user');
        outcomes.aiMessagesHaveActionBars = !!aiMsg?.querySelector('.chat-action-bar');
        outcomes.aiActionBarHasButtons = (aiMsg?.querySelectorAll('.chat-action-btn').length || 0) >= 1;
        outcomes.editStaysOnLatestUserWhileForkStaysOnAssistant =
          oldUserMsg?.querySelector('[data-chat-message-action="edit-user-message"]') === null
          && oldUserMsg?.querySelector('[data-chat-message-action="fork-message"]') === null
          && latestUserMsg?.querySelector('[data-chat-message-action="edit-user-message"]')?.getAttribute('aria-label') === 'Edit and resend your latest message'
          && latestUserMsg?.querySelector('[data-chat-message-action="copy-message"]') === null
          && latestUserMsg?.querySelector('[data-chat-message-action="fork-message"]') === null
          && aiMsg?.querySelector('[data-chat-message-action="fork-message"]')?.textContent.includes('Fork to new chat');
      }

      outcomes.clipboardAvailable = typeof navigator.clipboard !== 'undefined';
      outcomes.clipboardWriteTextAvailable = typeof navigator.clipboard?.writeText === 'function';

      const testDiv = document.createElement('div');
      testDiv.innerHTML = '<div id="chat-ctx-details-1" style="display:none">content</div><span id="chat-ctx-arrow-1">▸</span>';
      document.body.appendChild(testDiv);
      try {
        chatActions.toggleContextDetails(1);
        const details = document.getElementById('chat-ctx-details-1');
        const arrow = document.getElementById('chat-ctx-arrow-1');
        outcomes.toggleContextDetailsOpens = details?.style.display === 'flex';
        outcomes.toggleContextArrowOpens = arrow?.textContent === '▾';

        chatActions.toggleContextDetails(1);
        outcomes.toggleContextDetailsCloses = details?.style.display === 'none';
        outcomes.toggleContextArrowCloses = arrow?.textContent === '▸';
      } finally {
        testDiv.remove();
      }

      outcomes.chatActionsStayModuleOnly = [
        'buildActionBar',
        'copyMessage',
        'regenerateLastMessage',
        'toggleContextDetails',
      ].every(name => typeof window[name] === 'undefined');

      const keyDiv = document.createElement('div');
      keyDiv.innerHTML = '<div id="chat-ctx-details-42" style="display:none">content</div>' +
        '<span id="chat-ctx-arrow-42">▸</span>' +
        '<div id="chat-ctx-key-42" role="button" tabindex="0" data-chat-message-action="toggle-context-details" data-chat-message-index="42">Context</div>';
      document.body.appendChild(keyDiv);
      try {
        const keyToggle = document.getElementById('chat-ctx-key-42');
        const details = document.getElementById('chat-ctx-details-42');
        const enterPrevented = keyToggle
          ? !keyToggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
          : false;
        const opens = details?.style.display === 'flex';
        const spacePrevented = keyToggle
          ? !keyToggle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
          : false;
        outcomes.roleButtonContextKeyboardDelegates = enterPrevented
          && opens
          && spacePrevented
          && details?.style.display === 'none';
      } finally {
        keyDiv.remove();
      }

      const summaryButton = document.createElement('div');
      let viewedSummaryId = null;
      const savedChatActionDeps = chatActions.configureChatMessageActionDeps({
        viewSavedSummary: id => { viewedSummaryId = id; },
      });
      summaryButton.setAttribute('role', 'button');
      summaryButton.setAttribute('tabindex', '0');
      summaryButton.setAttribute('data-chat-message-action', 'view-summary');
      summaryButton.setAttribute('data-chat-message-summary-id', 'summary-keyboard');
      document.body.appendChild(summaryButton);
      try {
        const summaryPrevented = !summaryButton.dispatchEvent(
          new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
        );
        outcomes.roleButtonSummaryKeyboardDelegates = summaryPrevented
          && viewedSummaryId === 'summary-keyboard';
      } finally {
        chatActions.configureChatMessageActionDeps(savedChatActionDeps);
        summaryButton.remove();
      }

      if (realContainer) {
        let bubbled = 0;
        const onBubble = () => { bubbled += 1; };
        realContainer.addEventListener('click', onBubble);
        try {
          state.chatHistory = [{
            role: 'assistant',
            content: 'Answer',
            lensSources: [{ source: 'notes.md', score: 0.75, text: 'Relevant excerpt' }],
            lensSourceName: 'notes',
          }];
          chatRender.renderChatMessages();
          const lensSummary = realContainer.querySelector('.chat-lens-source-summary');
          lensSummary?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          outcomes.renderedContainClickStopsAtElement = !!lensSummary && bubbled === 0;
        } finally {
          realContainer.removeEventListener('click', onBubble);
        }
      }
    } finally {
      state.chatHistory = originalHistory;
    }

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('chat action browser coverage handles copy and regenerate branches', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(async () => {
    const { state } = await import('/js/state.js');
    return !!state;
  });

  const results = await page.evaluate(async () => {
    const [chatActions, chatRuntime, chatThreads] = await Promise.all([
      import('/js/chat-actions.js'),
      import('/js/chat-runtime.js'),
      import('/js/chat-threads.js'),
    ]);
    const { state } = await import('/js/state.js');
    const outcomes = {};
    const copied = [];
    const threadStorageKey = state.currentThreadId
      ? chatThreads.getChatThreadKey(state.currentThreadId)
      : null;
    let input = null;
    let createdInput = false;
    let originalInputValue = '';
    const saved = {
      chatHistory: JSON.parse(JSON.stringify(state.chatHistory || [])),
      currentThreadId: state.currentThreadId,
      clipboardOwn: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
      setTimeout: window.setTimeout,
      threadStorageKey,
      threadStorage: threadStorageKey ? localStorage.getItem(threadStorageKey) : null,
    };
    const timers = [];
    let previousChatRuntime = null;
    const flush = () => new Promise(resolve => saved.setTimeout.call(window, resolve, 0));
    const makeButton = (id) => {
      const button = document.createElement('button');
      button.id = id;
      button.textContent = 'Copy';
      document.body.appendChild(button);
      return button;
    };

    try {
      window.setTimeout = (fn, delay = 0) => {
        timers.push({ fn, delay });
        return timers.length;
      };

      state.chatHistory = [
        { role: 'user', content: 'Hello <there>' },
        {
          role: 'assistant',
          content: 'Assistant answer',
          context: [{ label: '<Labs>', detail: '5 > 3' }],
        },
      ];

      outcomes.buildActionBarEscapesContextAndAddsLastRegenerate = (() => {
        const html = chatActions.buildActionBar(1);
        return html.includes('Regenerate')
          && html.includes('data-chat-message-action="copy-message"')
          && html.includes('data-chat-message-index="1"')
          && !html.includes('onclick=')
          && html.includes('&lt;Labs&gt;')
          && html.includes('5 &gt; 3')
          && chatActions.buildActionBar(0) === ''
          && chatActions.buildActionBar(99) === '';
      })();

      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async text => { copied.push(text); } },
      });
      const successBtn = makeButton('chat-copy-btn-1');
      chatActions.copyMessage(1);
      await flush();
      outcomes.copyMessageSuccessWritesAndMarksCopied =
        copied[0] === 'Assistant answer'
        && successBtn.textContent.includes('Copied')
        && timers.some(timer => timer.delay === 1500);
      timers.pop()?.fn();
      outcomes.copyMessageSuccessResetTimerRestoresCopy = successBtn.textContent.includes('Copy');
      successBtn.remove();

      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => { throw new Error('blocked'); } },
      });
      const failBtn = makeButton('chat-copy-btn-1');
      chatActions.copyMessage(1);
      await flush();
      outcomes.copyMessageFailureMarksFailed = failBtn.textContent.includes('Failed');
      failBtn.remove();

      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: null,
      });
      const unsupportedBtn = makeButton('chat-copy-btn-1');
      chatActions.copyMessage(1);
      outcomes.copyMessageNoClipboardMarksUnsupported = unsupportedBtn.textContent.includes('Not supported');

      let renderCount = 0;
      let sendCount = 0;
      input = document.getElementById('chat-input');
      if (input) {
        originalInputValue = input.value;
      } else {
        input = document.createElement('textarea');
        input.id = 'chat-input';
        document.body.appendChild(input);
        createdInput = true;
      }
      previousChatRuntime = chatRuntime.configureChatRuntimeCallbacks({
        isChatStreaming: () => true,
        renderChatMessages: () => { renderCount += 1; },
        sendChatMessage: () => { sendCount += 1; },
      });
      state.currentThreadId = null;
      state.chatHistory = [
        { role: 'user', content: 'Streaming guard' },
        { role: 'assistant', content: 'Still streaming' },
      ];
      chatActions.regenerateLastMessage();
      outcomes.regenerateSkipsWhileStreaming = renderCount === 0
        && sendCount === 0
        && state.chatHistory.length === 2;

      chatRuntime.configureChatRuntimeCallbacks({ isChatStreaming: () => false });
      state.chatHistory = [
        { role: 'assistant', content: 'Earlier assistant' },
        { role: 'user', content: 'Repeat this prompt' },
        { role: 'assistant', content: 'Regenerate me' },
      ];
      chatActions.regenerateLastMessage();
      outcomes.regeneratePopsLastPairAndResends =
        renderCount === 1
        && sendCount === 1
        && input.value === 'Repeat this prompt'
        && state.chatHistory.length === 1
        && state.chatHistory[0].content === 'Earlier assistant';
    } finally {
      state.chatHistory = saved.chatHistory;
      state.currentThreadId = saved.currentThreadId;
      if (previousChatRuntime) chatRuntime.configureChatRuntimeCallbacks(previousChatRuntime);
      window.setTimeout = saved.setTimeout;
      if (saved.clipboardOwn) Object.defineProperty(navigator, 'clipboard', saved.clipboardOwn);
      else delete navigator.clipboard;
      if (saved.threadStorageKey) {
        if (saved.threadStorage == null) localStorage.removeItem(saved.threadStorageKey);
        else localStorage.setItem(saved.threadStorageKey, saved.threadStorage);
      }
      document.querySelectorAll('[id^="chat-copy-btn-"]').forEach(el => el.remove());
      if (input) {
        if (createdInput) input.remove();
        else input.value = originalInputValue;
      }
    }

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
