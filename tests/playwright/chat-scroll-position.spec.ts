import { routeJavaScript } from '../helpers/browser-static-routes.js';
import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';

interface ScrollStreamFixture {
  __scrollReply?: (options: Parameters<typeof import('../../js/direct-chat-tools.js').callDirectChatWithTools>[0]) => Promise<{ text: string; finishReason: string }>;
  __scrollRequest?: Parameters<typeof import('../../js/direct-chat-tools.js').callDirectChatWithTools>[0];
  __scrollFinish?: (result: { text: string; finishReason: string }) => void;
  __scrollSending?: Promise<void>;
}

async function openLongConversation(page: Page, total = 12) {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-ai-paused', 'true');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-messages', { state: 'attached' });
  await page.evaluate(async total => {
    await (await import('/js/chat-loader.js')).loadChatModule();
    const [{ state }, panel, render, tour] = await Promise.all([
      import('/js/state.js'), import('/js/chat-panel.js'),
      import('/js/chat-render.js'), import('/js/tour.js'),
    ]);
    await panel.loadChatPresentationStylesheets();
    tour.endTour({ openEmptyChat: false });
    const history = Array.from({ length: total }, (_, index) => {
      const role: 'user' | 'assistant' = index % 2 ? 'assistant' : 'user';
      return { role, content: role === 'user' ? `Question ${index}` : Array.from({ length: 18 }, (_, paragraph) =>
        `Reading section ${index}.${paragraph}. This long response lets the reader stay in the middle of the transcript while background work refreshes it.`).join('\n\n') };
    });
    state.currentThreadId = 'scroll-position';
    state.chatThreads = [{ id: 'scroll-position', name: 'Scroll regression',
      createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z',
      messageCount: history.length, personality: 'default' }];
    state.chatHistory = history;
    localStorage.setItem(`labcharts-${state.currentProfile}-chat-t_scroll-position`, JSON.stringify(history));
    localStorage.setItem(`labcharts-${state.currentProfile}-chat-threads`, JSON.stringify(state.chatThreads));
    await panel.openChatPanel();
    render.renderChatMessages();
  }, total);
  await expect(page.locator('#chat-messages .chat-ai')).toHaveCount(Math.floor(Math.min(120, total) / 2));
  await expect.poll(() => page.locator('#chat-messages').evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(1000);
}

async function readEarlier(page: Page) {
  const position = await page.locator('#chat-messages').evaluate(node => {
    node.scrollTop = (node.scrollHeight - node.clientHeight) * 0.4;
    node.dispatchEvent(new Event('scroll'));
    return node.scrollTop;
  });
  await expect(page.locator('#chat-jump-latest')).toBeVisible();
  return position;
}

for (const mobile of [false, true]) {
  test.describe(mobile ? 'mobile chat scroll' : 'desktop chat scroll', () => {
    test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1365, height: 900 },
      isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });

    test('repeated background history reloads preserve the reader position', async ({ page }) => {
      await openLongConversation(page);
      const position = await readEarlier(page);
      for (let refresh = 0; refresh < 3; refresh++) {
        await page.evaluate(async () => { await (await import('/js/chat-history.js')).loadChatHistory(); });
        await expect.poll(() => page.locator('#chat-messages').evaluate((node, top) => Math.abs(node.scrollTop - top), position)).toBeLessThanOrEqual(2);
        await expect(page.locator('#chat-jump-latest')).toBeVisible();
        await expect(page.locator('.chat-jump-latest-label')).toHaveText('Jump to latest');
      }
    });

    test('routine renders preserve reading and explicit latest and conversation changes still follow', async ({ page }) => {
      await openLongConversation(page);
      const position = await readEarlier(page);
      for (let refresh = 0; refresh < 3; refresh++) {
        await page.evaluate(async () => { (await import('/js/chat-render.js')).renderChatMessages(); });
        await expect.poll(() => page.locator('#chat-messages').evaluate((node, top) => Math.abs(node.scrollTop - top), position)).toBeLessThanOrEqual(2);
      }
      await page.evaluate(async () => {
        const [{ state }, render] = await Promise.all([import('/js/state.js'), import('/js/chat-render.js')]);
        state.chatHistory = [...state.chatHistory, { role: 'assistant', content: 'A new reply while reading earlier content.' }];
        render.renderChatMessages({ preserveScroll: true });
      });
      await expect(page.locator('.chat-jump-latest-label')).toHaveText('New response');
      await expect.poll(() => page.locator('#chat-messages').evaluate((node, top) => Math.abs(node.scrollTop - top), position)).toBeLessThanOrEqual(2);
      await page.locator('#chat-jump-latest').click();
      await expect.poll(() => page.locator('#chat-messages').evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(3);
      await page.evaluate(async () => {
        const [{ state }, render] = await Promise.all([import('/js/state.js'), import('/js/chat-render.js')]);
        state.chatHistory = [...state.chatHistory, { role: 'assistant', content: 'New content while following.\n\n'.repeat(12) }];
        render.renderChatMessages({ preserveScroll: true });
      });
      await expect.poll(() => page.locator('#chat-messages').evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(3);
      await readEarlier(page);
      await page.evaluate(async () => { (await import('/js/chat-render.js')).renderChatMessages({ preserveScroll: false }); });
      await expect.poll(() => page.locator('#chat-messages').evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(3);
      await readEarlier(page);
      await page.evaluate(async () => {
        const [{ state }, render] = await Promise.all([import('/js/state.js'), import('/js/chat-render.js')]);
        state.currentThreadId = 'another-conversation';
        state.chatHistory = structuredClone(state.chatHistory);
        render.renderChatMessages();
      });
      await expect.poll(() => page.locator('#chat-messages').evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(3);
    });
    test('a completed streamed reply preserves a reader inside that reply', async ({ page }) => {
      await routeJavaScript(page, '**/js/direct-chat-tools.js', `export * from '/js/direct-chat-tools.js?scroll-original';
        export function callDirectChatWithTools(options) { return globalThis.__scrollReply(options); }`);
      await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?scroll-original';
        export function requestAIProcessingApproval() { return Promise.resolve(true); }`);
      await openLongConversation(page);
      await page.evaluate(async () => {
        const api = await import('/js/api.js');
        api.setAIProvider('ollama'); api.setAIPaused(false);
        const fixture = globalThis as unknown as ScrollStreamFixture;
        fixture.__scrollReply = options => new Promise(resolve => {
          fixture.__scrollRequest = options; fixture.__scrollFinish = resolve;
        });
        (document.getElementById('chat-input') as HTMLTextAreaElement).value = 'Show a long response for this scroll regression.';
        fixture.__scrollSending = (await import('/js/chat-send.js')).sendChatMessage();
      });
      await page.waitForFunction(() => Boolean((globalThis as unknown as ScrollStreamFixture).__scrollRequest));
      const response = Array.from({ length: 70 }, (_, index) => `Reply section ${index}. This reply is long enough to read in the middle while the final response is being saved.`).join('\n\n');
      await page.evaluate(response => (globalThis as unknown as ScrollStreamFixture).__scrollRequest!.onStream!(response), response);
      await expect(page.locator('[data-chat-streaming="true"]')).toBeVisible();
      const position = await page.locator('#chat-messages').evaluate(node => {
        const reply = node.querySelector<HTMLElement>('[data-chat-streaming="true"]')!;
        node.scrollTop += reply.getBoundingClientRect().top - node.getBoundingClientRect().top + 600;
        node.dispatchEvent(new Event('scroll'));
        return node.scrollTop;
      });
      await expect(page.locator('#chat-jump-latest')).toBeVisible();
      await page.evaluate(async response => {
        const fixture = globalThis as unknown as ScrollStreamFixture;
        fixture.__scrollFinish!({ text: response, finishReason: 'stop' });
        await fixture.__scrollSending;
      }, response);
      await expect(page.locator('[data-chat-streaming="true"]')).toHaveCount(0);
      await expect.poll(() => page.locator('#chat-messages').evaluate((node, top) => Math.abs(node.scrollTop - top), position)).toBeLessThanOrEqual(2);
      await expect(page.locator('#chat-jump-latest')).toBeVisible();
    });

    test('incoming messages do not shift the visible text in a conversation beyond 120 messages', async ({ page }) => {
      await openLongConversation(page, 145);
      await page.locator('#chat-msg-81').evaluate(node => node.scrollIntoView({ block: 'start' }));
      await page.locator('#chat-messages').evaluate(node => { node.scrollTop += 150; });
      await expect(page.locator('#chat-jump-latest')).toBeVisible();
      const offset = await page.locator('#chat-msg-81').evaluate(node => node.getBoundingClientRect().top - document.getElementById('chat-messages')!.getBoundingClientRect().top);
      for (let refresh = 0; refresh < 3; refresh++) {
        await page.evaluate(async () => {
          const { state } = await import('/js/state.js');
          localStorage.setItem(`labcharts-${state.currentProfile}-chat-t_scroll-position`, JSON.stringify([
            ...state.chatHistory, { role: 'assistant', content: 'New saved content while the earlier reply is being read.' },
          ]));
          await (await import('/js/chat-history.js')).loadChatHistory();
        });
        await expect.poll(() => page.locator('#chat-msg-81').evaluate((node, top) => Math.abs(node.getBoundingClientRect().top - document.getElementById('chat-messages')!.getBoundingClientRect().top - top), offset)).toBeLessThanOrEqual(2);
      }
      await page.locator('#chat-jump-latest').click();
      await expect.poll(() => page.locator('#chat-messages').evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(3);
      await page.evaluate(async () => { (await import('/js/chat-render.js')).renderChatMessages(); });
      await expect(page.locator('#chat-messages .chat-msg')).toHaveCount(120);
    });
  });
}
