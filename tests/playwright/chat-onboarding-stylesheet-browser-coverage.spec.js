import { expect, test } from './coverage-fixture.js';

test('Chat onboarding presentation stays cold until the panel opens and preserves cascade order', async ({ page }) => {
  let stylesheetRoute;
  let stylesheetRequests = 0;
  await page.route('**/css/chat-onboarding.css*', route => {
    stylesheetRequests += 1;
    stylesheetRoute = route;
  });
  await page.goto('/app', { waitUntil: 'load' });

  await expect(page.locator('link[data-chat-onboarding-stylesheet]')).toHaveCount(0);
  expect(stylesheetRequests).toBe(0);

  await page.evaluate(async () => {
    window.__chatOpenResult = (await import('/js/chat-panel.js')).openChatPanel();
  });
  await expect.poll(() => !!stylesheetRoute).toBe(true);
  await expect(page.locator('#chat-panel')).not.toHaveClass(/open/);
  await expect(page.locator('link[data-chat-onboarding-stylesheet]')).toHaveCount(1);

  await stylesheetRoute.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '.chat-panel { --coverage-chat-onboarding: ready; }',
  });

  const outcome = await page.evaluate(async () => {
    const opened = await window.__chatOpenResult;
    const link = document.querySelector('link[data-chat-onboarding-stylesheet]');
    const anchor = document.querySelector('[data-chat-onboarding-stylesheet-anchor]');
    return {
      opened,
      panelOpen: document.getElementById('chat-panel')?.classList.contains('open'),
      token: getComputedStyle(document.getElementById('chat-panel')).getPropertyValue('--coverage-chat-onboarding').trim(),
      linkPrecedesAnchor: link?.nextElementSibling === anchor,
    };
  });

  expect(stylesheetRequests).toBe(1);
  expect(outcome).toEqual({
    opened: true,
    panelOpen: true,
    token: 'ready',
    linkPrecedesAnchor: true,
  });

  await page.evaluate(async () => {
    const chatPanel = await import('/js/chat-panel.js');
    chatPanel.closeChatPanel();
    await chatPanel.openChatPanel();
  });
  expect(stylesheetRequests).toBe(1);
});

test('Chat onboarding stylesheet failure is contained and retries with a fresh URL', async ({ page }) => {
  const stylesheetRequests = [];
  await page.route('**/css/chat-onboarding.css*', route => {
    stylesheetRequests.push(route.request().url());
    return route.abort('failed');
  });
  await page.goto('/app', { waitUntil: 'load' });

  const firstOpened = await page.evaluate(async () => (await import('/js/chat-panel.js')).openChatPanel());
  expect(firstOpened).toBe(false);
  await expect(page.locator('#chat-panel')).not.toHaveClass(/open/);
  await expect(page.locator('link[data-chat-onboarding-stylesheet]')).toHaveCount(0);
  await expect(page.locator('.notification-toast')).toContainText('Chat could not be opened');

  await page.unroute('**/css/chat-onboarding.css*');
  const retry = await page.evaluate(async () => {
    const opened = await (await import('/js/chat-panel.js')).openChatPanel();
    const link = document.querySelector('link[data-chat-onboarding-stylesheet]');
    return {
      opened,
      panelOpen: document.getElementById('chat-panel')?.classList.contains('open'),
      href: link?.href || '',
    };
  });

  expect(stylesheetRequests).toHaveLength(1);
  expect(retry.opened).toBe(true);
  expect(retry.panelOpen).toBe(true);
  expect(new URL(retry.href).searchParams.get('lazy-retry')).toBe('1');
});
