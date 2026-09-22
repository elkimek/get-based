import { expect, test } from './coverage-fixture.js';

test.beforeEach(async ({ page }) => {
  // Exercise the real chat/controller/storage path; only the billable boundary
  // and consent interaction are replaced with controllable synthetic promises.
  await page.route('**/js/chat-continuation.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export * from '/js/chat-continuation.js?audit-original';
      export function callChatAPIWithContinuation(options) { return globalThis.__auditReply(options); }`,
  }));
  await page.route('**/js/cloud-ai-consent.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export * from '/js/cloud-ai-consent.js?audit-original';
      export function requestAIProcessingApproval() { return globalThis.__auditApproval?.() ?? Promise.resolve(true); }`,
  }));
  await page.route('**/js/chat-history.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export * from '/js/chat-history.js?audit-original';
      import { saveChatHistory as save } from '/js/chat-history.js?audit-original';
      export async function saveChatHistory() { await globalThis.__auditBeforeSave?.(); return save(); }`,
  }));
  await page.goto('/app');
  await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).loadChatModule();
    const { state } = await import('/js/state.js');
    const api = await import('/js/api.js');
    api.setAIProvider('ollama');
    api.setAIPaused(false);
    state.currentProfile = 'audit-a';
    state.currentThreadId = 't_a';
    state.importedData = { entries: [], chatSummaries: [] };
    state.chatThreads = [{ id: 't_a', name: 'Audit A', updatedAt: new Date().toISOString(), messageCount: 0 }];
    state.chatHistory = [];
    document.getElementById('chat-input').value = 'Synthetic audit question';
    globalThis.__auditReply = options => new Promise(resolve => {
      globalThis.__auditRequest = options;
      globalThis.__auditFinishReply = resolve;
    });
  });
});

for (const change of ['profile', 'thread', 'none']) {
  test(`late chat response respects ${change === 'none' ? 'the unchanged conversation' : `a changed ${change}`}`, async ({ page }) => {
    await page.evaluate(() => {
      globalThis.__auditSending = import('/js/chat-send.js').then(module => module.sendChatMessage());
    });
    await page.waitForFunction(() => Boolean(globalThis.__auditRequest));
    const result = await page.evaluate(async change => {
      const { state } = await import('/js/state.js');
      if (change !== 'none') {
        if (change === 'profile') state.currentProfile = 'audit-b';
        state.currentThreadId = 't_b';
        state.chatThreads = [{ id: 't_b', name: 'Audit B', updatedAt: new Date().toISOString(), messageCount: 1 }];
        state.chatHistory = [{ role: 'user', content: 'Keep B unchanged' }];
        document.getElementById('chat-messages').textContent = 'Keep B unchanged';
      }
      globalThis.__auditRequest.onStream('Synthetic private A response.');
      globalThis.__auditFinishReply({ text: 'Synthetic private A response.', finishReason: 'stop' });
      await globalThis.__auditSending;
      return { history: state.chatHistory, transcript: document.getElementById('chat-messages').textContent,
        streaming: (await import('/js/chat-send.js')).isChatStreaming() };
    }, change);
    expect(result.streaming).toBe(false);
    if (change === 'none') {
      expect(result.history.at(-1).content).toBe('Synthetic private A response.');
      expect(result.transcript).toContain('Synthetic private A response.');
    } else {
      expect(result.history).toEqual([{ role: 'user', content: 'Keep B unchanged' }]);
      expect(result.transcript).not.toContain('private A');
    }
  });
}

test('a stale silent generation releases controls before it settles', async ({ page }) => {
  await page.evaluate(() => {
    globalThis.__auditSending = import('/js/chat-send.js').then(module => module.sendChatMessage());
  });
  await page.waitForFunction(() => Boolean(globalThis.__auditRequest));
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.currentProfile = 'audit-b';
    state.currentThreadId = 't_b';
    const chat = await import('/js/chat-send.js');
    const streaming = chat.isChatStreaming();
    const restored = chat.restoreChatGenerationUI();
    const aborted = globalThis.__auditRequest.signal.aborted;
    const title = document.getElementById('chat-send-btn').title;
    globalThis.__auditFinishReply({ text: 'Discard stale reply', finishReason: 'stop' });
    await globalThis.__auditSending;
    return { streaming, restored, aborted, title };
  });
  expect(result).toEqual({ streaming: false, restored: false, aborted: true, title: 'Send message' });
});

test('a profile switch during consent never starts a provider request', async ({ page }) => {
  await page.evaluate(() => {
    globalThis.__auditApproval = () => new Promise(resolve => { globalThis.__auditFinishApproval = resolve; });
    globalThis.__auditSending = import('/js/chat-send.js').then(module => module.sendChatMessage());
  });
  await page.waitForFunction(() => Boolean(globalThis.__auditFinishApproval));
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.currentProfile = 'audit-b';
    state.chatHistory = [];
    globalThis.__auditFinishApproval(true);
    await globalThis.__auditSending;
    return { requested: Boolean(globalThis.__auditRequest), messages: state.chatHistory.length };
  });
  expect(result).toEqual({ requested: false, messages: 0 });
});

for (const failure of ['messages', 'index']) {
  test(`a ${failure} storage failure keeps the prompt and prevents a provider request`, async ({ page }) => {
    const result = await page.evaluate(async failure => {
      const { state } = await import('/js/state.js');
      const chat = await import('/js/chat-send.js');
      const threads = await import('/js/chat-threads.js');
      const key = failure === 'messages' ? threads.getChatThreadKey(state.currentThreadId) : threads.getChatThreadsKey();
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key) throw new DOMException('Synthetic disk full', 'QuotaExceededError');
        return originalSet.call(this, name, value);
      };
      try {
        await chat.sendChatMessage();
        return { requested: Boolean(globalThis.__auditRequest), history: state.chatHistory,
          input: document.getElementById('chat-input').value, streaming: chat.isChatStreaming() };
      } finally { Storage.prototype.setItem = originalSet; }
    }, failure);
    expect(result).toEqual({ requested: false, history: [], input: 'Synthetic audit question', streaming: false });
  });
}

test('refusing retry consent preserves the original response', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const original = [{ role: 'user', content: 'Original question' }, { role: 'assistant', content: 'Original reply' }];
    state.chatHistory = original.slice(); globalThis.__auditApproval = async () => false;
    await (await import('/js/chat-actions.js')).regenerateLastMessage();
    return { requested: Boolean(globalThis.__auditRequest), history: state.chatHistory };
  });
  expect(result).toEqual({ requested: false, history: [{ role: 'user', content: 'Original question' }, { role: 'assistant', content: 'Original reply' }] });
});

for (const action of ['duplicate', 'new-draft']) {
  test(`a pending history save protects against ${action}`, async ({ page }) => {
    await page.evaluate(() => {
      globalThis.__auditBeforeSave = () => new Promise(resolve => { globalThis.__auditFinishSave = resolve; });
      globalThis.__auditSending = import('/js/chat-send.js').then(module => module.sendChatMessage());
    });
    await page.waitForFunction(() => Boolean(globalThis.__auditFinishSave));
    await page.evaluate(async action => {
      if (action === 'duplicate') await (await import('/js/chat-send.js')).sendChatMessage();
      else document.getElementById('chat-input').value = 'My next unsent question';
      globalThis.__auditBeforeSave = undefined;
      globalThis.__auditFinishSave();
    }, action);
    await page.waitForFunction(() => Boolean(globalThis.__auditRequest));
    const result = await page.evaluate(async () => {
      globalThis.__auditFinishReply({ text: 'Saved reply', finishReason: 'stop' });
      await globalThis.__auditSending;
      return { history: (await import('/js/state.js')).state.chatHistory, input: document.getElementById('chat-input').value };
    });
    expect(result.history.filter(message => message.role === 'user')).toHaveLength(1);
    expect(result.history.at(-1).content).toBe('Saved reply');
    expect(result.input).toBe(action === 'new-draft' ? 'My next unsent question' : '');
  });
}

test('switching conversations during retry consent cannot persist a shortened original', async ({ page }) => {
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.chatHistory = [{ role: 'user', content: 'Original question' }, { role: 'assistant', content: 'Original reply' }];
    globalThis.__auditApproval = () => new Promise(resolve => { globalThis.__auditFinishApproval = resolve; });
    globalThis.__auditSending = (await import('/js/chat-actions.js')).regenerateLastMessage();
  });
  await page.waitForFunction(() => Boolean(globalThis.__auditFinishApproval));
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const history = await import('/js/chat-history.js');
    await history.saveChatHistory(); // The same save performed by thread switching.
    const stored = JSON.parse(await (await import('/js/crypto.js')).encryptedGetItem('labcharts-audit-a-chat-t_t_a'));
    state.currentThreadId = 'other'; state.chatHistory = [];
    globalThis.__auditFinishApproval(true); await globalThis.__auditSending;
    return { stored, requested: Boolean(globalThis.__auditRequest), destination: state.chatHistory };
  });
  expect(result).toEqual({ stored: [{ role: 'user', content: 'Original question' }, { role: 'assistant', content: 'Original reply' }], requested: false, destination: [] });
});
