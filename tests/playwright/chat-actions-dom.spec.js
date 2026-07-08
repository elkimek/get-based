import { expect, test } from './coverage-fixture.js';

test('chat action bars, clipboard, and context toggles work in the live DOM', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() =>
    typeof window.renderChatMessages === 'function'
      && typeof window.toggleContextDetails === 'function'
      && !!window._labState
  );

  const results = await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const { buildActionBar } = await import('/js/chat-actions.js');
    const state = window._labState;
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
        window.renderChatMessages();
        const aiMsgs = realContainer.querySelectorAll('.chat-msg.chat-ai');
        const userMsgs = realContainer.querySelectorAll('.chat-msg.chat-user');
        outcomes.aiMessagesHaveActionBars = aiMsgs.length > 0 && aiMsgs[0].querySelector('.chat-action-bar') !== null;
        outcomes.aiActionBarHasButtons = aiMsgs.length > 0 && aiMsgs[0].querySelectorAll('.chat-action-btn').length >= 1;
        outcomes.userMessagesHaveNoActionBars = userMsgs.length > 0 && userMsgs[0].querySelector('.chat-action-bar') === null;
      } else {
        const doc = new DOMParser().parseFromString(
          `<div class="chat-msg chat-ai">${buildActionBar(1)}</div><div class="chat-msg chat-user">Hello</div>`,
          'text/html'
        );
        const aiMsg = doc.querySelector('.chat-msg.chat-ai');
        const userMsg = doc.querySelector('.chat-msg.chat-user');
        outcomes.aiMessagesHaveActionBars = !!aiMsg?.querySelector('.chat-action-bar');
        outcomes.aiActionBarHasButtons = (aiMsg?.querySelectorAll('.chat-action-btn').length || 0) >= 1;
        outcomes.userMessagesHaveNoActionBars = userMsg?.querySelector('.chat-action-bar') === null;
      }

      outcomes.clipboardAvailable = typeof navigator.clipboard !== 'undefined';
      outcomes.clipboardWriteTextAvailable = typeof navigator.clipboard?.writeText === 'function';

      const testDiv = document.createElement('div');
      testDiv.innerHTML = '<div id="chat-ctx-details-1" style="display:none">content</div><span id="chat-ctx-arrow-1">▸</span>';
      document.body.appendChild(testDiv);
      try {
        window.toggleContextDetails(1);
        const details = document.getElementById('chat-ctx-details-1');
        const arrow = document.getElementById('chat-ctx-arrow-1');
        outcomes.toggleContextDetailsOpens = details?.style.display === 'flex';
        outcomes.toggleContextArrowOpens = arrow?.textContent === '▾';

        window.toggleContextDetails(1);
        outcomes.toggleContextDetailsCloses = details?.style.display === 'none';
        outcomes.toggleContextArrowCloses = arrow?.textContent === '▸';
      } finally {
        testDiv.remove();
      }

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

      const savedViewSavedSummary = window.viewSavedSummary;
      const summaryButton = document.createElement('div');
      let viewedSummaryId = null;
      summaryButton.setAttribute('role', 'button');
      summaryButton.setAttribute('tabindex', '0');
      summaryButton.setAttribute('data-chat-message-action', 'view-summary');
      summaryButton.setAttribute('data-chat-message-summary-id', 'summary-keyboard');
      document.body.appendChild(summaryButton);
      try {
        window.viewSavedSummary = id => { viewedSummaryId = id; };
        const summaryPrevented = !summaryButton.dispatchEvent(
          new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
        );
        outcomes.roleButtonSummaryKeyboardDelegates = summaryPrevented
          && viewedSummaryId === 'summary-keyboard';
      } finally {
        window.viewSavedSummary = savedViewSavedSummary;
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
          window.renderChatMessages();
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
  await page.waitForFunction(() => !!window._labState);

  const results = await page.evaluate(async () => {
    const [chatActions, chatThreads] = await Promise.all([
      import('/js/chat-actions.js'),
      import('/js/chat-threads.js'),
    ]);
    const state = window._labState;
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
      isChatStreaming: window.isChatStreaming,
      renderChatMessages: window.renderChatMessages,
      sendChatMessage: window.sendChatMessage,
      setTimeout: window.setTimeout,
      threadStorageKey,
      threadStorage: threadStorageKey ? localStorage.getItem(threadStorageKey) : null,
    };
    const timers = [];
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
      window.renderChatMessages = () => { renderCount += 1; };
      window.sendChatMessage = () => { sendCount += 1; };
      window.isChatStreaming = () => true;
      state.currentThreadId = null;
      state.chatHistory = [
        { role: 'user', content: 'Streaming guard' },
        { role: 'assistant', content: 'Still streaming' },
      ];
      chatActions.regenerateLastMessage();
      outcomes.regenerateSkipsWhileStreaming = renderCount === 0
        && sendCount === 0
        && state.chatHistory.length === 2;

      window.isChatStreaming = () => false;
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
      window.isChatStreaming = saved.isChatStreaming;
      window.renderChatMessages = saved.renderChatMessages;
      window.sendChatMessage = saved.sendChatMessage;
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
