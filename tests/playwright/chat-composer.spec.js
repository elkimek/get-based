import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      acceptedAt: '2026-08-08T00:00:00.000Z',
      appVersion: 'chat-composer-test',
      location: 'chat-composer-test',
    }));
  });
});

test('long prompts grow across the full composer and drafts follow their conversation', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const [{ state }, panel, render] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-panel.js'),
      import('/js/chat-render.js'),
    ]);
    await panel.openChatPanel();
    state.chatHistory = [
      { role: 'user', content: 'Help me understand this trend.' },
      { role: 'assistant', content: 'Let’s compare the values over time.' },
    ];
    render.renderChatMessages();
  });

  const input = page.locator('#chat-input');
  const send = page.locator('#chat-send-btn');
  const longPrompt = 'Compare the last twelve months of results with sleep, training, diet, and supplement changes. '.repeat(9);
  await input.fill(longPrompt);

  const layout = await page.evaluate(() => {
    const inputEl = document.getElementById('chat-input');
    const toolbar = document.querySelector('.chat-composer-toolbar');
    const area = document.querySelector('.chat-input-area');
    const rect = element => element?.getBoundingClientRect();
    return {
      input: rect(inputEl),
      toolbar: rect(toolbar),
      area: rect(area),
      scrollHeight: inputEl?.scrollHeight,
      overflowY: inputEl ? getComputedStyle(inputEl).overflowY : '',
    };
  });

  expect(layout.input?.width).toBeGreaterThan(340);
  expect(layout.input?.height).toBeGreaterThan(100);
  expect(layout.input?.height).toBeLessThanOrEqual(180);
  expect(layout.toolbar?.width).toBe(layout.input?.width);
  expect(layout.area?.bottom).toBeLessThanOrEqual(844);
  expect(layout.scrollHeight).toBeGreaterThanOrEqual(layout.input.height);
  expect(layout.overflowY).toBe('auto');
  await expect(send).toBeEnabled();
  await expect(input).toHaveAttribute('aria-describedby', 'chat-composer-hint');

  const outcomes = await page.evaluate(async () => {
    const [{ state }, composer, threads, chatSend] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-composer.js'),
      import('/js/chat-threads.js'),
      import('/js/chat-send.js'),
    ]);
    const now = new Date().toISOString();
    const originalThreads = state.chatThreads;
    const originalThreadId = state.currentThreadId;
    const previousDeps = threads.configureChatThreadDeps({
      saveChatHistory: async () => {},
      loadChatHistory: async () => {},
      cleanupDiscussionState: () => {},
      restoreDiscussionContinuePrompt: () => {},
      renderChatMessages: () => {},
      updateChatHeaderTitle: () => {},
      updatePersonalityBar: () => {},
    });
    try {
      state.chatThreads = [
        { id: 'draft-a', name: 'First', createdAt: now, updatedAt: now, messageCount: 1, personality: 'default' },
        { id: 'draft-b', name: 'Second', createdAt: now, updatedAt: now, messageCount: 1, personality: 'default' },
      ];
      state.currentThreadId = 'draft-a';
      composer.setChatInputValue('First conversation draft');
      await threads.switchToThread('draft-b');
      const secondStartsEmpty = document.getElementById('chat-input')?.value === '';
      composer.setChatInputValue('Second conversation draft');
      await threads.switchToThread('draft-a');
      const firstRestored = document.getElementById('chat-input')?.value === 'First conversation draft';

      let prevented = false;
      chatSend.handleChatKeydown({
        key: 'Enter',
        shiftKey: false,
        isComposing: true,
        keyCode: 229,
        preventDefault: () => { prevented = true; },
      });
      return {
        secondStartsEmpty,
        firstRestored,
        composingEnterIsNotIntercepted: prevented === false,
        conversationIsLog: document.getElementById('chat-messages')?.getAttribute('role') === 'log',
        messagesAreLabelledArticles: [...document.querySelectorAll('.chat-msg')].every(message =>
          message.getAttribute('role') === 'article' && !!message.getAttribute('aria-label')
        ),
      };
    } finally {
      threads.configureChatThreadDeps(previousDeps);
      state.chatThreads = originalThreads;
      state.currentThreadId = originalThreadId;
    }
  });

  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});

test('jump to latest preserves reading position and announces new response content', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const [{ state }, panel, render] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-panel.js'),
      import('/js/chat-render.js'),
    ]);
    await panel.openChatPanel();
    state.chatHistory = Array.from({ length: 18 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `Message ${index + 1}: ${'A longer transcript line for scrolling. '.repeat(4)}`,
    }));
    render.renderChatMessages();
    const messages = document.getElementById('chat-messages');
    messages.scrollTop = 0;
    messages.dispatchEvent(new Event('scroll'));
  });

  const jump = page.locator('#chat-jump-latest');
  await expect(jump).toBeVisible();
  await expect(jump).toContainText('Jump to latest');

  await page.evaluate(async () => {
    const scroll = await import('/js/chat-scroll.js');
    scroll.notifyChatContentAdded(document.getElementById('chat-messages'));
  });
  await expect(jump).toContainText('New response');
  await expect(jump).toHaveAttribute('aria-label', /New response available/);

  const placement = await page.evaluate(() => {
    const buttonRect = document.getElementById('chat-jump-latest')?.getBoundingClientRect();
    const composerRect = document.querySelector('.chat-input-area')?.getBoundingClientRect();
    return { buttonBottom: buttonRect?.bottom, composerTop: composerRect?.top };
  });
  expect(placement.buttonBottom).toBeLessThan(placement.composerTop);

  await jump.click();
  await expect(jump).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const messages = document.getElementById('chat-messages');
    return messages.scrollHeight - messages.scrollTop - messages.clientHeight;
  })).toBeLessThan(80);
});

test('device-local drafts are encrypted and can be cold-loaded without entering sync payloads', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const [{ state }, cryptoStore, composer, collectors] = await Promise.all([
      import('/js/state.js'),
      import('/js/crypto.js'),
      import('/js/chat-composer.js'),
      import('/js/sync-payload-collectors.js'),
    ]);
    const profileId = `draft-encrypted-${Date.now()}`;
    const threadId = 't_draft';
    const draftText = 'Private draft that remains on this device';
    state.currentProfile = profileId;
    state.currentThreadId = threadId;
    localStorage.setItem('labcharts-encryption-enabled', 'true');
    window.__WEARABLES_TEST = true;
    await cryptoStore._setTestSessionKey('DraftEncryptionPass1!');
    composer.setChatInputValue(draftText);
    await new Promise(resolve => setTimeout(resolve, 360));
    const key = `labcharts-${profileId}-chatDraft_${threadId}`;
    const raw = localStorage.getItem(key);
    const coldStore = await import(`/js/chat-draft-storage.js?cold=${Date.now()}`);
    const coldLoaded = await coldStore.loadChatDraft(profileId, threadId);
    const syncPayload = await collectors.collectChatData(profileId);
    await composer.clearChatDraft();
    await cryptoStore._setTestSessionKey(null);
    localStorage.removeItem('labcharts-encryption-enabled');
    delete window.__WEARABLES_TEST;
    return {
      raw,
      coldLoaded,
      syncPayload: JSON.stringify(syncPayload),
      removed: localStorage.getItem(key) === null,
    };
  });

  expect(result.raw).toMatch(/^v1:/);
  expect(result.raw).not.toContain('Private draft');
  expect(result.coldLoaded).toBe('Private draft that remains on this device');
  expect(result.syncPayload).not.toContain('Private draft');
  expect(result.removed).toBe(true);
});
