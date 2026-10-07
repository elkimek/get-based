import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';

test.beforeEach(async ({ page, context }) => {
  await installDiscussionFixture(context);
  await page.goto('/app');
  await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js');
    state.currentThreadId = 'transcript-lifetime';
    state.chatHistory = [
      { role: 'user', content: 'Original question' },
      { role: 'assistant', content: '**Original answer**', lensSources: [{ source: 'Private note', score: 0.8, text: 'Literal <evidence>' }] },
    ];
    (await import('/js/chat-render.js')).renderChatMessages();
  });
});

test('transcript refresh preserves disclosure nodes, editor draft, focus and selection', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const summary = page.locator('.chat-lens-sources > summary');
  await summary.click();
  await page.locator('.chat-lens-source > summary').click();
  const disclosure = await page.locator('.chat-lens-sources').elementHandle();
  await page.locator('[data-chat-message-action="edit-user-message"]').click();
  const input = page.locator('#chat-message-edit-input');
  await input.fill('Keep this independent edit draft');
  const textarea = await input.elementHandle();
  await input.evaluate(element => (element as HTMLTextAreaElement).setSelectionRange(5, 9));
  await page.evaluate(async () => (await import('/js/chat-render.js')).renderChatMessages({ preserveScroll: true }));
  await expect(input).toHaveValue('Keep this independent edit draft');
  await expect(input).toBeFocused();
  expect(await textarea!.evaluate(element => ({ same: element === document.getElementById('chat-message-edit-input'), start: (element as HTMLTextAreaElement).selectionStart, end: (element as HTMLTextAreaElement).selectionEnd }))).toEqual({ same: true, start: 5, end: 9 });
  expect(await disclosure!.evaluate(element => element === document.querySelector('.chat-lens-sources'))).toBe(true);
  await expect(page.locator('.chat-lens-sources')).toHaveAttribute('open', '');
  await expect(page.locator('.chat-lens-source')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('#chat-msg-0')).toContainText('Original question');
  await expect(page.locator('#chat-msg-1 strong')).toHaveText('Original answer');
  expect(errors).toEqual([]);
});

test('live message restores its authored view and retires on conversation replacement', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const results = await page.evaluate(async () => {
    const [{ state }, live] = await Promise.all([import('/js/state.js'), import('/js/chat-live-message-component.js')]);
    const container = document.getElementById('chat-messages')!;
    const profile = state.currentProfile, thread = state.currentThreadId, history = state.chatHistory;
    const current = () => profile === state.currentProfile && thread === state.currentThreadId && history === state.chatHistory;
    const handle = live.createChatLiveMessage(container, { personalityName: 'Reviewer', personalityIcon: 'R' }, current, 'R Reviewer');
    live.publishChatLiveText(handle.element, 'Streaming <literal> text');
    const streamed = handle.element.textContent;
    container.replaceChildren();
    handle.restore(container);
    const restored = handle.element.isConnected && handle.element.textContent === streamed;
    live.completeChatLiveMessage(handle.element, { role: 'assistant', content: '**Completed answer**', provider: 'openrouter', modelId: 'example/model', modelDisplay: 'Test model', usage: { inputTokens: 10, outputTokens: 20 } });
    const completed = handle.element.querySelector('strong')?.textContent === 'Completed answer'
      && handle.element.querySelector('.chat-cost-footnote')?.textContent?.includes('30 tokens');
    state.chatHistory = [{ role: 'user', content: 'Destination' }];
    (await import('/js/chat-render.js')).renderChatMessages();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    live.publishChatLiveText(handle.element, 'Late origin text');
    handle.restore(container);
    const retired = !handle.element.isConnected && !container.textContent?.includes('Late origin') && !handle.element.textContent?.includes('Late origin');
    handle.dispose();
    return { streamed, restored, completed, retired };
  });
  expect(results).toEqual({ streamed: 'Streaming <literal> text', restored: true, completed: true, retired: true });
  expect(errors).toEqual([]);
});
