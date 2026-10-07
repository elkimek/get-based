import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';

type CallOptions = Parameters<typeof import('../../js/chat-continuation.js').callChatAPIWithContinuation>[0];
type RoundResult = Awaited<ReturnType<typeof import('../../js/chat-discussion-turns.js').runDiscussionContinuation>>;
type ChatMessage = (typeof import('../../js/state.js').state.chatHistory)[number];
interface LiveFixture {
  calls: CallOptions[];
  replies: ((value: unknown) => void)[];
  reply(options: CallOptions): Promise<unknown>;
  round?: Promise<RoundResult>;
  originHistory: ChatMessage[];
  originKey: string;
  originRaw: string;
  participant: { id: string; name: string; icon: string; prompt: string };
  participants: { id: string; name: string; icon: string }[];
  live?: HTMLElement;
  replacement?: AbortController;
}
declare global { var discussionLiveFixture: LiveFixture; }

test.beforeEach(async ({ context, page }) => {
  await installDiscussionFixture(context);
  // Real request projection, callbacks, rendering and storage; only provider output
  // and external knowledge availability are controlled at their module boundary.
  await routeJavaScript(page, '**/js/lens.js', `
    export * from '/js/lens.js?discussion-live-original';
    export function hasLens() { return false; }
  `);
  await routeJavaScript(page, '**/js/chat-continuation.js', `
    export * from '/js/chat-continuation.js?discussion-live-original';
    export function callChatAPIWithContinuation(options) { return globalThis.discussionLiveFixture.reply(options); }
  `);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app');
  await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js');
    const api = await import('/js/api.js');
    api.setAIProvider('ollama'); api.setOllamaMainModel('accepted-model');
    (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
    state.currentThreadId = 'discussion-live-origin';
    state.currentChatPersonality = 'default';
    state.chatHistory = [{ role: 'user', content: 'Origin question' }];
    const timestamp = new Date().toISOString();
    state.chatThreads = [
      { id: state.currentThreadId, name: 'Origin', createdAt: timestamp, updatedAt: timestamp, messageCount: 1, personality: 'default' },
      { id: 'destination', name: 'Destination', createdAt: timestamp, updatedAt: timestamp, messageCount: 1, personality: 'default' },
    ];
    const { getChatThreadKey, saveChatThreadIndex } = await import('/js/chat-threads.js');
    const originKey = getChatThreadKey(state.currentThreadId);
    const originRaw = JSON.stringify(state.chatHistory);
    localStorage.setItem(originKey, originRaw);
    await saveChatThreadIndex();
    const persona = (await import('/js/constants.js')).CHAT_PERSONALITIES.find(item => !!item.promptAddition)!;
    globalThis.discussionLiveFixture = {
      participants: [{ id: persona.id, name: persona.name, icon: persona.icon }],
      calls: [], replies: [], originHistory: state.chatHistory, originKey, originRaw,
      participant: { id: persona.id, name: persona.name, icon: persona.icon, prompt: persona.promptAddition! },
      reply(options) {
        this.calls.push(options);
        options.onStream?.('Streamed partial');
        return new Promise(resolve => this.replies.push(resolve));
      },
    };
    (await import('/js/chat-render.js')).renderChatMessages();
    globalThis.discussionLiveFixture.round = (await import('/js/chat-discussion-turns.js')).runDiscussionContinuation(
      globalThis.discussionLiveFixture.participants, 'default', 'Origin question', { suppressAutoMsg: true },
    );
  });
  await expect(page.locator('#chat-messages [data-chat-live-view]')).toContainText('Streamed partial');
});

for (const replacement of ['profile', 'history', 'thread'] as const) {
  test(`late discussion completion cannot modify a replacement ${replacement}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(async replacement => {
      const { state } = await import('/js/state.js');
      if (replacement === 'profile') state.currentProfile = 'discussion-destination-profile';
      if (replacement !== 'history') {
        const timestamp = new Date().toISOString();
        state.chatThreads = [{ id: state.currentThreadId!, name: 'Replacement', createdAt: timestamp, updatedAt: timestamp, messageCount: 1, personality: 'default' }];
      }
      state.chatHistory = [{ role: 'user', content: 'Replacement question' }];
      state.currentChatPersonality = 'destination-persona';
      if (replacement === 'profile') window.dispatchEvent(new Event('labcharts-profile-switched'));
      (await import('/js/chat-render.js')).renderChatMessages();
    }, replacement);
    await expect(page.locator('#chat-messages [data-chat-live-view]')).toHaveCount(0);
    const result = await page.evaluate(async () => {
      const fixture = globalThis.discussionLiveFixture;
      const { state } = await import('/js/state.js');
      const before = JSON.stringify({ history: state.chatHistory, threads: state.chatThreads });
      const storageBefore = JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
      fixture.replies[0]!({ text: 'Late full reply', finishReason: 'stop' });
      const round = await fixture.round;
      return {
        round, before, after: JSON.stringify({ history: state.chatHistory, threads: state.chatThreads }),
        storageBefore, storageAfter: JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]))),
        persona: state.currentChatPersonality, originLength: fixture.originHistory.length,
        controller: !!(await import('/js/chat-discussion-callbacks.js')).getChatAbortController(),
      };
    });
    expect(result.round).toMatchObject({ outcome: 'stopped', completedCount: 0 });
    expect(result.after).toBe(result.before);
    expect(result.storageAfter).toBe(result.storageBefore);
    expect(result.persona).toBe('destination-persona');
    expect(result.originLength).toBe(1);
    expect(result.controller).toBe(false);
    await expect(page.locator('#chat-send-btn')).toHaveAttribute('aria-label', 'Send message');
    await expect(page.locator('#chat-messages')).not.toContainText('Late full reply');
    expect(errors).toEqual([]);
  });
}

test('retiring an old discussion cannot clear a newer request controller or send state', async ({ page }) => {
  await page.evaluate(async () => {
    const callbacks = await import('/js/chat-discussion-callbacks.js');
    const replacement = new AbortController();
    globalThis.discussionLiveFixture.replacement = replacement;
    callbacks.setChatAbortController(replacement);
    callbacks.setSendButtonMode(document.getElementById('chat-send-btn'), 'streaming');
    (await import('/js/chat-stream-status.js')).setChatStreamStatus('New request is responding.', { busy: true });
    (await import('/js/chat-render.js')).renderChatMessages();
  });
  await expect(page.locator('#chat-messages [data-chat-live-view]')).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const fixture = globalThis.discussionLiveFixture;
    fixture.replies[0]!({ text: 'Late reply', finishReason: 'stop' });
    const round = await fixture.round;
    const { state } = await import('/js/state.js');
    return { round, active: (await import('/js/chat-discussion-callbacks.js')).getChatAbortController() === fixture.replacement,
      aborted: fixture.replacement!.signal.aborted, history: state.chatHistory, raw: localStorage.getItem(fixture.originKey), expected: fixture.originRaw };
  });
  expect(result.round).toMatchObject({ outcome: 'stopped', completedCount: 0 });
  expect(result.active).toBe(true); expect(result.aborted).toBe(false);
  expect(result.history).toEqual([{ role: 'user', content: 'Origin question' }]);
  expect(result.raw).toBe(result.expected);
  await expect(page.locator('#chat-send-btn')).toHaveAttribute('aria-label', 'Stop generating');
  await expect(page.locator('#chat-stream-status')).toContainText('New request is responding.');
});

test('repainting restores the same authored live view without requesting another reply', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async () => {
    globalThis.discussionLiveFixture.live = document.querySelector<HTMLElement>('#chat-messages [data-chat-transcript-message][data-chat-streaming]')!;
    (await import('/js/chat-render.js')).renderChatMessages();
  });
  await expect(page.locator('#chat-messages [data-chat-live-view]')).toContainText('Streamed partial');
  expect(await page.evaluate(() => document.querySelector('#chat-messages [data-chat-streaming]') === globalThis.discussionLiveFixture.live)).toBe(true);
  await expect(page.locator('#chat-messages [data-chat-live-view] [data-chat-persona-label]')).toHaveCount(1);
  const result = await page.evaluate(async () => {
    const fixture = globalThis.discussionLiveFixture;
    fixture.replies[0]!({ text: '**Complete** reply', finishReason: 'stop', usage: { inputTokens: 12, outputTokens: 5 } });
    const round = await fixture.round;
    const { state } = await import('/js/state.js');
    return { round, calls: fixture.calls.length, history: state.chatHistory, stored: JSON.parse(localStorage.getItem(fixture.originKey) || 'null'), name: fixture.participant.name };
  });
  expect(result.round).toMatchObject({ outcome: 'complete', completedCount: 1 });
  expect(result.calls).toBe(1);
  expect(result.history[1]).toMatchObject({ content: '**Complete** reply', personalityName: result.name, discussion: true, usage: { inputTokens: 12, outputTokens: 5 } });
  expect(result.stored).toEqual(result.history);
  await expect(page.locator('#chat-messages .chat-ai strong')).toHaveText('Complete');
  await expect(page.locator('#chat-messages .chat-cost-footnote')).toContainText('17 tokens');
  await expect(page.locator('#chat-messages [data-chat-persona-label]')).toHaveCount(1);
  await expect(page.locator('#chat-messages [data-chat-live-view]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('background discussion persists only its origin and projects each explicit persona', async ({ page }) => {
  await page.evaluate(async () => {
    const fixture = globalThis.discussionLiveFixture;
    const persona = (await import('/js/constants.js')).CHAT_PERSONALITIES.find(item => item.id === 'default')!;
    fixture.participants.push({ id: persona.id, name: persona.name, icon: persona.icon });
    const { state } = await import('/js/state.js');
    state.currentThreadId = 'destination';
    state.chatHistory = [{ role: 'user', content: 'Destination question' }];
    state.currentChatPersonality = 'destination-persona';
    const { getChatThreadKey } = await import('/js/chat-threads.js');
    localStorage.setItem(getChatThreadKey(state.currentThreadId), JSON.stringify(state.chatHistory));
    (await import('/js/chat-render.js')).renderChatMessages();
    fixture.replies[0]!({ text: 'Origin reply', finishReason: 'stop' });
  });
  await expect.poll(() => page.evaluate(() => globalThis.discussionLiveFixture.calls.length)).toBe(2);
  const result = await page.evaluate(async () => {
    const fixture = globalThis.discussionLiveFixture;
    const { state } = await import('/js/state.js');
    const destination = state.chatHistory;
    const { getChatThreadKey } = await import('/js/chat-threads.js');
    const destinationKey = getChatThreadKey(state.currentThreadId);
    fixture.replies[1]!({ text: 'Second origin reply', finishReason: 'stop' });
    const round = await fixture.round;
    return {
      round, sameDestination: state.chatHistory === destination, persona: state.currentChatPersonality,
      destination: state.chatHistory, destinationRaw: JSON.parse(localStorage.getItem(destinationKey) || 'null'),
      origin: fixture.originHistory, stored: JSON.parse(localStorage.getItem(fixture.originKey) || 'null'),
      prompt: fixture.calls[0]!.system, expectedPrompt: fixture.participant.prompt,
      secondMessages: fixture.calls[1]!.messages, secondSystem: fixture.calls[1]!.system,
      participantName: fixture.participant.name,
      secondName: (await import('/js/constants.js')).CHAT_PERSONALITIES.find(item => item.id === 'default')!.name,
      metadata: state.chatThreads.find(item => item.id === 'discussion-live-origin'),
      controller: !!(await import('/js/chat-discussion-callbacks.js')).getChatAbortController(),
    };
  });
  expect(result.round).toMatchObject({ outcome: 'complete', completedCount: 2 });
  expect(result.sameDestination).toBe(true); expect(result.persona).toBe('destination-persona');
  expect(result.destination).toEqual([{ role: 'user', content: 'Destination question' }]);
  expect(result.destinationRaw).toEqual(result.destination);
  expect(result.origin[1]).toMatchObject({ content: 'Origin reply', discussion: true });
  expect(result.stored).toEqual(result.origin); expect(result.prompt).toContain(result.expectedPrompt);
  expect(result.origin[2]).toMatchObject({ content: 'Second origin reply', personalityName: result.secondName });
  expect(result.secondMessages).toEqual([{ role: 'user', content: 'Origin question' }, { role: 'assistant', content: `[Response from ${result.participantName}]\nOrigin reply` }]);
  expect(result.secondSystem).not.toContain(result.expectedPrompt);
  expect(result.metadata).toMatchObject({ messageCount: 3, personality: 'default' });
  expect(result.controller).toBe(false);
  await expect(page.locator('#chat-send-btn')).toHaveAttribute('aria-label', 'Send message');
  await expect(page.locator('#chat-messages')).not.toContainText('Origin reply');
  await expect(page.locator('#chat-messages [data-chat-live-view]')).toHaveCount(0);
});


test('public discussion elements use shared authored content and reject late typewriter updates', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const fixture = globalThis.discussionLiveFixture;
    fixture.replies[0]!({ text: 'Completed setup', finishReason: 'stop' });
    await fixture.round;
    const view = await import('/js/chat-discussion-round-view.js');
    const live = await import('/js/chat-live-message-component.js');
    const { state } = await import('/js/state.js');
    const container = document.createElement('div'); document.body.appendChild(container);
    try {
      const label = view.createDiscussionPersonaLabel({ icon: 'A', name: '<literal participant>' });
      const ai = view.createDiscussionAiMessage({ name: 'Analyst' });
      const typing = view.createDiscussionTypingIndicator(); container.appendChild(typing);
      const rendered = view.renderFinalDiscussionMessage({ threadId: state.currentThreadId, container, labelEl: label, aiMsgEl: ai, typingEl: typing, fullText: '**Complete** reply', responseTruncated: true });
      const usage = view.appendDiscussionUsageFootnote({ threadId: state.currentThreadId, aiMsgEl: ai, provider: 'ollama', modelDisplay: 'Local model', usage: { inputTokens: '12', outputTokens: '5' }, webSearch: true, e2ee: true, attestation: { securityVerified: true, enclaveHost: '<literal host>' } });
      live.publishChatLiveText(ai, 'Late text must not replace final content');
      view.renderDiscussionRoundError({ threadId: state.currentThreadId, container, error: new Error('<unsafe>') });
      return {
        rendered, usage, authored: ai.hasAttribute('data-chat-transcript-message'), role: ai.getAttribute('role'),
        bold: ai.querySelector('strong')?.textContent, body: ai.textContent, label: label.textContent,
        authoredLabel: label.hasAttribute('data-chat-persona-label'), literal: !label.querySelector('literal'),
        footnotes: ai.querySelectorAll('.chat-cost-footnote').length, footnote: ai.querySelector('.chat-cost-footnote')?.textContent,
        receipt: !!ai.querySelector('[data-chat-attestation-view]'), error: container.lastElementChild?.querySelector('span')?.textContent,
        escaped: !container.querySelector('unsafe'), typing: typing.isConnected,
      };
    } finally { container.remove(); }
  });
  expect(result).toMatchObject({ rendered: true, usage: true, authored: true, role: 'article', bold: 'Complete', authoredLabel: true, literal: true, footnotes: 1, escaped: true, typing: false });
  expect(result.body).toContain('output limit reached');
  expect(result.body).not.toContain('Late text');
  expect(result.label).toContain('<literal participant>');
  expect(result.footnote).toContain('17 tokens'); expect(result.footnote).toContain('🌐 web');
  expect(result.receipt).toBe(true);
  expect(result.error).toBe('Error: <unsafe>');
});
