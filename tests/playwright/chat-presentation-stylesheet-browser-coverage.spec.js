import { expect, test } from './coverage-fixture.js';

const CHAT_PRESENTATION_PATHS = [
  '/css/chat-personality.css',
  '/css/chat-messages.css',
  '/css/chat-composer.css',
  '/css/chat-onboarding.css',
  '/css/chat-responsive.css',
  '/css/chat-actions.css',
  '/css/chat-mobile.css',
];

test('Chat presentation stays cold until the panel opens and preserves cascade order', async ({ page }) => {
  let stylesheetRoute;
  let stylesheetRequests = 0;
  await page.route('**/css/chat-onboarding.css*', route => {
    stylesheetRequests += 1;
    stylesheetRoute = route;
  });
  await page.goto('/app', { waitUntil: 'load' });

  await expect(page.locator('link[data-chat-presentation-stylesheet]')).toHaveCount(0);
  expect(stylesheetRequests).toBe(0);

  await page.evaluate(async () => {
    window.__chatOpenResult = (await import('/js/chat-panel.js')).openChatPanel();
  });
  await expect.poll(() => !!stylesheetRoute).toBe(true);
  await expect(page.locator('#chat-panel')).not.toHaveClass(/open/);
  await expect(page.locator('link[data-chat-presentation-stylesheet]')).toHaveCount(7);

  await stylesheetRoute.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '.chat-panel { --coverage-chat-onboarding: ready; }',
  });

  const outcome = await page.evaluate(async () => {
    const opened = await window.__chatOpenResult;
    const links = Array.from(document.querySelectorAll('link[data-chat-presentation-stylesheet]'));
    const anchor = document.querySelector('[data-chat-presentation-stylesheet-anchor]');
    return {
      opened,
      panelOpen: document.getElementById('chat-panel')?.classList.contains('open'),
      token: getComputedStyle(document.getElementById('chat-panel')).getPropertyValue('--coverage-chat-onboarding').trim(),
      paths: links.map(link => new URL(link.href).pathname),
      finalLinkPrecedesAnchor: links.at(-1)?.nextElementSibling === anchor,
    };
  });

  expect(stylesheetRequests).toBe(1);
  expect(outcome.opened).toBe(true);
  expect(outcome.panelOpen).toBe(true);
  expect(outcome.token).toBe('ready');
  expect(outcome.paths).toEqual(CHAT_PRESENTATION_PATHS);
  expect(outcome.finalLinkPrecedesAnchor).toBe(true);

  await page.evaluate(async () => {
    const chatPanel = await import('/js/chat-panel.js');
    chatPanel.closeChatPanel();
    await chatPanel.openChatPanel();
  });
  expect(stylesheetRequests).toBe(1);
});

test('Chat presentation failure is contained and retries the group with fresh URLs', async ({ page }) => {
  const stylesheetRequests = [];
  const presentationPattern = /\/css\/chat-(?:personality|messages|composer|onboarding|responsive|actions|mobile)\.css/;
  await page.route(presentationPattern, route => {
    stylesheetRequests.push(route.request().url());
    return route.abort('failed');
  });
  await page.goto('/app', { waitUntil: 'load' });

  const firstOpened = await page.evaluate(async () => (await import('/js/chat-panel.js')).openChatPanel());
  expect(firstOpened).toBe(false);
  await expect(page.locator('#chat-panel')).not.toHaveClass(/open/);
  await expect(page.locator('link[data-chat-presentation-stylesheet]')).toHaveCount(0);
  await expect(page.locator('.notification-toast')).toContainText('Chat could not be opened');

  await page.unroute(presentationPattern);
  const retry = await page.evaluate(async () => {
    const opened = await (await import('/js/chat-panel.js')).openChatPanel();
    const links = Array.from(document.querySelectorAll('link[data-chat-presentation-stylesheet]'));
    return {
      opened,
      panelOpen: document.getElementById('chat-panel')?.classList.contains('open'),
      hrefs: links.map(link => link.href),
    };
  });

  expect(stylesheetRequests).toHaveLength(7);
  expect(retry.opened).toBe(true);
  expect(retry.panelOpen).toBe(true);
  expect(retry.hrefs).toHaveLength(7);
  expect(retry.hrefs.every(href => new URL(href).searchParams.get('lazy-retry') === '1')).toBe(true);
});
