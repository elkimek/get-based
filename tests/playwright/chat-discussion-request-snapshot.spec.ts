import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';

type RoundRequest = Awaited<ReturnType<typeof import('../../js/chat-discussion-round-request.js').buildDiscussionRoundRequest>>;
type ApiOptions = Parameters<typeof import('../../js/api.js').callClaudeAPI>[0];
interface RequestFixture {
  lookup: Promise<null>;
  finishLookup(): void;
  pending?: Promise<RoundRequest | { cancelled: true }>;
  controller: AbortController;
  round?: ReturnType<typeof import('../../js/chat-discussion-round-runner.js').runDiscussionRound>;
  finishReply?(): void;
  calls: { options: ApiOptions; provider: string }[];
  reply(options: ApiOptions, provider: string): Promise<unknown>;
  expected?: { name: string; prompt: string };
}
declare global { var discussionRequestFixture: RequestFixture; }

test.beforeEach(async ({ page }) => {
  // Only external knowledge/provider boundaries are synthetic. Use real prompt
  // projection, settings, request construction and automatic continuation.
  await routeJavaScript(page, '**/js/lens.js', `
    export * from '/js/lens.js?discussion-request-original';
    export function hasLens() { return true; }
    export function queryLensMulti() { return globalThis.discussionRequestFixture.lookup; }
  `);
  await routeJavaScript(page, '**/js/api.js', `
    export * from '/js/api.js?discussion-request-original';
    export function callClaudeAPI(options, provider) { return globalThis.discussionRequestFixture.reply(options, provider); }
  `);
  await page.goto('/app');
  await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).loadChatModule();
    const { state } = await import('/js/state.js');
    const api = await import('/js/api.js');
    api.setAIProvider('ollama');
    api.setOllamaMainModel('accepted-model');
    (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
    state.chatHistory = [{ role: 'user', content: 'Accepted question' }];
    let finishLookup!: () => void;
    const lookup = new Promise<null>(resolve => { finishLookup = () => resolve(null); });
    globalThis.discussionRequestFixture = {
      lookup, finishLookup, controller: new AbortController(), calls: [],
      async reply(options, provider) {
        this.calls.push({ options, provider });
        return this.calls.length === 1
          ? { text: 'First part ', finishReason: 'length' }
          : { text: 'complete.', finishReason: 'stop' };
      },
    };
  });
});

test('delayed discussion keeps accepted persona and history and sends the same model through continuation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { CHAT_PERSONALITIES } = await import('/js/constants.js');
    const personality = CHAT_PERSONALITIES.find(item => !!item.promptAddition)!;
    state.currentChatPersonality = personality.id;
    const fixture = globalThis.discussionRequestFixture;
    fixture.expected = { name: personality.name, prompt: personality.promptAddition! };
    fixture.pending = (await import('/js/chat-discussion-round-request.js')).buildDiscussionRoundRequest({
      msgText: 'Accepted question', roundHistory: state.chatHistory, signal: fixture.controller.signal,
    });
  });
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const api = await import('/js/api.js');
    const fixture = globalThis.discussionRequestFixture;
    state.currentChatPersonality = 'default';
    state.chatHistory[0]!.content = 'Changed question';
    state.chatHistory.push({ role: 'user', content: 'Later question' });
    api.setAIProvider('openrouter');
    api.setOllamaMainModel('different-model');
    fixture.finishLookup();
    const request = await fixture.pending! as RoundRequest;
    const reply = await (await import('/js/chat-discussion-round-request.js')).callDiscussionRoundAssistant({
      request, profileId: state.currentProfile, signal: fixture.controller.signal,
    });
    return {
      name: request.personality.name, expectedName: fixture.expected!.name,
      acceptedPersonaPrompt: request.systemPrompt.includes(fixture.expected!.prompt),
      history: request.apiMessages, model: request.modelId, provider: request.provider,
      calls: fixture.calls.map(call => ({ provider: call.provider, model: call.options.modelOverride, messages: call.options.messages })),
      text: reply.text,
    };
  });
  expect(result.name).toBe(result.expectedName);
  expect(result.acceptedPersonaPrompt).toBe(true);
  expect(result.history).toEqual([{ role: 'user', content: 'Accepted question' }]);
  expect(result.model).toBe('accepted-model');
  expect(result.provider).toBe('ollama');
  expect(result.calls).toHaveLength(2);
  for (const call of result.calls) {
    expect(call.provider).toBe('ollama');
    expect(call.model).toBe('accepted-model');
    expect(call.messages[0]).toEqual({ role: 'user', content: 'Accepted question' });
  }
  expect(result.text).toBe('First part complete.');
  expect(errors).toEqual([]);
});

test('stopping a discussion while knowledge lookup is pending prevents provider dispatch', async ({ page }) => {
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const fixture = globalThis.discussionRequestFixture;
    fixture.pending = (await import('/js/chat-discussion-round-request.js')).buildDiscussionRoundRequest({
      msgText: 'question', roundHistory: state.chatHistory, signal: fixture.controller.signal,
    }).catch(error => {
      if (error.name !== 'AbortError') throw error;
      return { cancelled: true as const };
    });
  });
  const result = await page.evaluate(async () => {
    const fixture = globalThis.discussionRequestFixture;
    fixture.controller.abort();
    fixture.finishLookup();
    return { result: await fixture.pending, requests: fixture.calls.length };
  });
  expect(result).toEqual({ result: { cancelled: true }, requests: 0 });
});


test('stopping a real discussion retains the streamed partial and excludes an unstreamed late completion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js');
    state.chatHistory = [{ role: 'user', content: 'Accepted question' }];
    state.currentThreadId = 'discussion-request-abort';
    state.chatThreads = [{ id: state.currentThreadId, name: 'Abort acceptance', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 1, personality: 'default' }];
    state.currentChatPersonality = 'default';
    (await import('/js/chat-render.js')).renderChatMessages();
    const fixture = globalThis.discussionRequestFixture;
    fixture.finishLookup();
    fixture.reply = async function (options, provider) {
      this.calls.push({ options, provider });
      options.onStream?.('Only the streamed part');
      return new Promise(resolve => { this.finishReply = () => resolve({ text: 'Late unstreamed full answer', finishReason: 'stop' }); });
    };
    fixture.round = (await import('/js/chat-discussion-round-runner.js')).runDiscussionRound(
      [{ id: 'default', name: 'AI Lab Analyst', icon: '🧬' }], 'Accepted question', { suppressAutoMsg: true },
    );
  });
  await expect(page.locator('#chat-messages .chat-ai').last()).toContainText('Only the streamed part');
  const result = await page.evaluate(async () => {
    const callbacks = await import('/js/chat-discussion-callbacks.js');
    const controller = callbacks.getChatAbortController();
    if (!controller) throw new Error('Expected real active discussion controller');
    controller.abort();
    globalThis.discussionRequestFixture.finishReply!();
    const round = await globalThis.discussionRequestFixture.round;
    const { state } = await import('/js/state.js');
    const key = (await import('/js/chat-threads.js')).getChatThreadKey(state.currentThreadId);
    return { round, messages: state.chatHistory, stored: JSON.parse(localStorage.getItem(key) || 'null'), active: !!callbacks.getChatAbortController() };
  });
  expect(result.round).toEqual({ completedCount: 1, outcome: 'stopped', remainingPersonas: [] });
  expect(result.messages).toHaveLength(2);
  expect(result.messages[1]).toMatchObject({ role: 'assistant', content: 'Only the streamed part', stopped: true, discussion: true });
  expect(result.stored).toEqual(result.messages);
  expect(result.active).toBe(false);
  await expect(page.locator('#chat-messages')).not.toContainText('Late unstreamed full answer');
  expect(await page.locator('#chat-send-btn').evaluate(element => element.classList.contains('streaming'))).toBe(false);
  await expect(page.locator('#chat-send-btn')).toHaveAttribute('aria-label', 'Send message');
});
