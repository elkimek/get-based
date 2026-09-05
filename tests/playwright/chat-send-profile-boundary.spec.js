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
