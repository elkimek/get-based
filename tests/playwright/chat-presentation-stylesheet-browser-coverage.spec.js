import { expect, test } from './coverage-fixture.js';

const CHAT_PRESENTATION_PATHS = [
  '/css/chat-panel-open.css',
  '/css/chat-personality.css',
  '/css/chat-messages.css',
  '/css/chat-composer.css',
  '/css/chat-onboarding.css',
  '/css/chat-responsive.css',
  '/css/chat-actions.css',
  '/css/chat-mobile.css',
  '/css/chat-redesign-open.css',
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
  const coldShell = await page.evaluate(() => {
    const fab = document.getElementById('chat-fab');
    const panel = document.getElementById('chat-panel');
    const main = document.querySelector('.main');
    document.body.classList.add('chat-autostart-reserved');
    const reservedPadding = main ? getComputedStyle(main).paddingRight : '';
    document.body.classList.remove('chat-autostart-reserved');
    return {
      fabPosition: fab ? getComputedStyle(fab).position : '',
      panelPosition: panel ? getComputedStyle(panel).position : '',
      panelWidth: panel ? getComputedStyle(panel).width : '',
      panelIsOffscreen: panel ? getComputedStyle(panel).transform !== 'none' : false,
      reservedPadding,
    };
  });
  expect(coldShell).toEqual({
    fabPosition: 'fixed',
    panelPosition: 'fixed',
    panelWidth: '600px',
    panelIsOffscreen: true,
    reservedPadding: '632px',
  });

  await page.evaluate(async () => {
    window.__chatOpenResult = (await import('/js/chat-panel.js')).openChatPanel();
  });
  await expect.poll(() => !!stylesheetRoute).toBe(true);
  await expect(page.locator('#chat-panel')).not.toHaveClass(/open/);
  await expect(page.locator('link[data-chat-presentation-stylesheet]')).toHaveCount(9);

  await page.evaluate(async () => (await import('/js/chat-panel.js')).closeChatPanel());
  await stylesheetRoute.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '.chat-panel { --coverage-chat-onboarding: ready; }',
  });
  const cancelledOpen = await page.evaluate(async () => window.__chatOpenResult);
  expect(cancelledOpen).toBe(false);
  await expect(page.locator('#chat-panel')).not.toHaveClass(/open/);

  const outcome = await page.evaluate(async () => {
    const opened = await (await import('/js/chat-panel.js')).openChatPanel();
    // The send button declares `transition: all`; under a busy parallel run
    // its 40px → 44px stylesheet transition can still be in flight here.
    await new Promise(resolve => setTimeout(resolve, 250));
    const links = Array.from(document.querySelectorAll('link[data-chat-presentation-stylesheet]'));
    const primaryAnchor = document.querySelector('[data-chat-presentation-stylesheet-anchor]');
    const redesignAnchor = document.querySelector('[data-chat-redesign-open-stylesheet-anchor]');
    const eagerRedesign = document.querySelector('link[href="css/chat-redesign.css"]');
    const redesignOpen = document.querySelector(
      'link[data-chat-presentation-stylesheet="redesign-open"]',
    );
    const conversation = document.querySelector('.chat-panel-conversation');
    const header = document.querySelector('.chat-header');
    const rail = document.querySelector('.chat-thread-rail');
    const messages = document.querySelector('.chat-messages');
    const sendButton = document.querySelector('.chat-send-btn');
    return {
      opened,
      panelOpen: document.getElementById('chat-panel')?.classList.contains('open'),
      token: getComputedStyle(document.getElementById('chat-panel')).getPropertyValue('--coverage-chat-onboarding').trim(),
      paths: links.map(link => new URL(link.href).pathname),
      primaryGroupPrecedesAnchor: links.at(-2)?.nextElementSibling === primaryAnchor,
      redesignCascadePreserved: eagerRedesign?.nextElementSibling === redesignOpen
        && redesignOpen?.nextElementSibling === redesignAnchor,
      conversationDisplay: conversation ? getComputedStyle(conversation).display : '',
      headerDisplay: header ? getComputedStyle(header).display : '',
      headerMinHeight: header ? getComputedStyle(header).minHeight : '',
      railDisplay: rail ? getComputedStyle(rail).display : '',
      messagesPaddingTop: messages ? getComputedStyle(messages).paddingTop : '',
      sendButtonWidth: sendButton ? getComputedStyle(sendButton).width : '',
    };
  });

  expect(stylesheetRequests).toBe(1);
  expect(outcome.opened).toBe(true);
  expect(outcome.panelOpen).toBe(true);
  expect(outcome.token).toBe('ready');
  expect(outcome.paths).toEqual(CHAT_PRESENTATION_PATHS);
  expect(outcome.primaryGroupPrecedesAnchor).toBe(true);
  expect(outcome.redesignCascadePreserved).toBe(true);
  expect(outcome.conversationDisplay).toBe('flex');
  expect(outcome.headerDisplay).toBe('flex');
  expect(outcome.headerMinHeight).toBe('64px');
  expect(outcome.railDisplay).toBe('flex');
  expect(outcome.messagesPaddingTop).toBe('18px');
  expect(outcome.sendButtonWidth).toBe('44px');

  await page.evaluate(async () => {
    const chatPanel = await import('/js/chat-panel.js');
    chatPanel.closeChatPanel();
    await chatPanel.openChatPanel();
  });
  expect(stylesheetRequests).toBe(1);
});

test('Chat presentation failure is contained and retries the group with fresh URLs', async ({ page }) => {
  const stylesheetRequests = [];
  const presentationPattern = /\/css\/chat-(?:panel-open|personality|messages|composer|onboarding|responsive|actions|mobile|redesign-open)\.css/;
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

  expect(stylesheetRequests).toHaveLength(9);
  expect(retry.opened).toBe(true);
  expect(retry.panelOpen).toBe(true);
  expect(retry.hrefs).toHaveLength(9);
  expect(retry.hrefs.every(href => new URL(href).searchParams.get('lazy-retry') === '1')).toBe(true);
});
