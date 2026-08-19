import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-19',
      privacyVersion: '2026-08-19',
      acceptedAt: '2026-08-08T00:00:00.000Z',
      appVersion: 'chat-a11y-test',
      location: 'chat-a11y-test',
    }));
  });
});

test('mobile chat exposes concise live status, reduced motion, and touch targets', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const results = await page.evaluate(async () => {
    const [{ state }, panel, render, chatSend, scroll, status] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-panel.js'),
      import('/js/chat-render.js'),
      import('/js/chat-send.js'),
      import('/js/chat-scroll.js'),
      import('/js/chat-stream-status.js'),
    ]);
    await panel.openChatPanel();
    state.chatHistory = [
      { role: 'user', content: 'Accessible question' },
      { role: 'assistant', content: 'Stopped answer', stopped: true, personalityName: 'Analyst' },
      { role: 'user', content: 'A follow-up with a long unbroken value abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz' },
      { role: 'assistant', content: 'A detailed follow-up answer.', personalityName: 'Analyst' },
    ];
    render.renderChatMessages();
    status.setChatStreamStatus('Analyst is responding.', { busy: true });
    const host = document.createElement('div');
    const typing = document.createElement('div');
    host.appendChild(typing);
    const response = document.createElement('div');
    chatSend.createTypewriter(response, typing, host).update('Rendered without trickle animation');
    return {
      logLive: document.getElementById('chat-messages')?.getAttribute('aria-live'),
      logBusy: document.getElementById('chat-messages')?.getAttribute('aria-busy'),
      statusText: document.getElementById('chat-stream-status')?.textContent,
      statusAtomic: document.getElementById('chat-stream-status')?.getAttribute('aria-atomic'),
      reducedScroll: scroll.preferredChatScrollBehavior(),
      typewriterText: response.textContent,
      typingRemoved: !typing.isConnected,
    };
  });

  expect(results).toEqual({
    logLive: 'off',
    logBusy: 'true',
    statusText: 'Analyst is responding.',
    statusAtomic: 'true',
    reducedScroll: 'auto',
    typewriterText: 'Rendered without trickle animation',
    typingRemoved: true,
  });
  await expect(page.locator('#chat-input')).toHaveCSS('font-size', '16px');
  const actionHeight = await page.locator('.chat-action-btn').first().evaluate(element =>
    element.getBoundingClientRect().height);
  expect(actionHeight).toBeGreaterThanOrEqual(44);

  const inspectMobileGeometry = () => page.evaluate(() => {
    const panel = document.getElementById('chat-panel');
    const selectors = [
      '.chat-rail-toggle',
      '.chat-summary-btn',
      '.chat-more-menu > summary',
      '.chat-close-btn',
      '.chat-personality-current',
      '.chat-discuss-btn',
      '.chat-voice-btn',
      '.chat-send-btn',
    ];
    const targets = selectors.map(selector => {
      const element = /** @type {HTMLElement | null} */ (document.querySelector(selector));
      if (!element || getComputedStyle(element).display === 'none') return null;
      const rect = element.getBoundingClientRect();
      return { selector, width: rect.width, height: rect.height };
    }).filter(Boolean);
    return {
      targets,
      panelOverflow: panel ? panel.scrollWidth - panel.clientWidth : 0,
      headerOverflow: (() => {
        const header = /** @type {HTMLElement | null} */ (document.querySelector('.chat-header'));
        return header ? header.scrollWidth - header.clientWidth : 0;
      })(),
      composerOverflow: (() => {
        const composer = /** @type {HTMLElement | null} */ (document.querySelector('.chat-input-area'));
        return composer ? composer.scrollWidth - composer.clientWidth : 0;
      })(),
    };
  });

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 700 });
    const geometry = await inspectMobileGeometry();
    expect(geometry.panelOverflow, `${width}px panel overflow`).toBeLessThanOrEqual(1);
    expect(geometry.headerOverflow, `${width}px header overflow`).toBeLessThanOrEqual(1);
    expect(geometry.composerOverflow, `${width}px composer overflow`).toBeLessThanOrEqual(1);
    for (const target of geometry.targets) {
      expect(target.width, `${width}px ${target.selector} width`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${width}px ${target.selector} height`).toBeGreaterThanOrEqual(44);
    }
  }

  const threadGeometry = await page.evaluate(async () => {
    const [{ state }, threads] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-threads.js'),
    ]);
    const originalThreads = state.chatThreads;
    const originalThreadId = state.currentThreadId;
    const now = new Date().toISOString();
    state.chatThreads = [{
      id: 'mobile-geometry-thread',
      name: 'A very long conversation title that must not sit beneath edit and delete controls',
      createdAt: now,
      updatedAt: now,
      messageCount: 4,
      personality: 'default',
    }];
    state.currentThreadId = 'mobile-geometry-thread';
    threads.renderThreadList();
    const rail = /** @type {HTMLElement | null} */ (document.getElementById('chat-thread-rail'));
    const originalTransition = rail?.style.transition || '';
    if (rail) {
      rail.style.transition = 'none';
      rail.classList.add('open');
      rail.getBoundingClientRect();
    }
    const name = document.querySelector('.chat-thread-item-name')?.getBoundingClientRect();
    const actions = document.querySelector('.chat-thread-item-actions')?.getBoundingClientRect();
    const actionRects = Array.from(document.querySelectorAll('.chat-thread-item-action'))
      .map(action => action.getBoundingClientRect());
    const back = document.querySelector('.chat-rail-back')?.getBoundingClientRect();
    const search = /** @type {HTMLElement | null} */ (document.querySelector('.chat-thread-search'));
    const result = {
      actionTargets: actionRects.every(rect => rect.width >= 44 && rect.height >= 44),
      titleAvoidsActions: !!name && !!actions && name.right <= actions.left,
      backTarget: !!back && back.width >= 44 && back.height >= 44,
      searchFontSize: search ? getComputedStyle(search).fontSize : '',
      railOverflow: rail ? rail.scrollWidth - rail.clientWidth : 999,
    };
    rail?.classList.remove('open');
    if (rail) rail.style.transition = originalTransition;
    state.chatThreads = originalThreads;
    state.currentThreadId = originalThreadId;
    threads.renderThreadList();
    return result;
  });
  expect(threadGeometry.actionTargets).toBe(true);
  expect(threadGeometry.titleAvoidsActions).toBe(true);
  expect(threadGeometry.backTarget).toBe(true);
  expect(threadGeometry.searchFontSize).toBe('16px');
  expect(threadGeometry.railOverflow).toBeLessThanOrEqual(1);
});

test('discussion controls disclose usage, pause, and retry one failed participant', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const outcomes = await page.evaluate(async () => {
    const [{ state }, ui, picker, actions, panel] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-discussion-ui.js'),
      import('/js/chat-discussion-picker.js'),
      import('/js/chat-actions.js'),
      import('/js/chat-panel.js'),
    ]);
    await panel.openChatPanel();
    const personas = [
      { id: 'default', name: 'AI Lab Analyst', icon: 'A' },
      { id: 'house', name: 'Dr. Gregory House', icon: 'H' },
      { id: 'longevity', name: 'Longevity Researcher', icon: 'L' },
    ];
    state.currentThreadId = 't_discussion_controls';
    state.currentChatPersonality = 'default';
    state.chatThreads = [{
      id: state.currentThreadId,
      discussionPersonas: personas,
      discussionPendingPersonas: personas.slice(1),
      discussionOriginalPersonality: 'default',
    }];
    let pauses = 0;
    let retried = '';
    const previous = actions.configureChatMessageActionDeps({
      pauseDiscussion: () => { pauses += 1; },
      retryDiscussionParticipant: id => { retried = id; },
    });
    try {
      ui.showDiscussContinuePrompt(personas, 'default', { pendingPersonas: personas.slice(1) });
      ui.updateDiscussionProgress(personas[1], 0, 2);
      document.querySelector('.chat-discussion-pause')?.click();
      const expectation = document.querySelector('.chat-discussion-expectation')?.textContent || '';
      const pauseVisible = !document.querySelector('.chat-discussion-pause')?.hidden;

      state.chatHistory = [{
        role: 'assistant',
        content: 'Could not respond',
        error: true,
        discussion: true,
        discussionError: true,
        discussionPersonaId: 'house',
        personalityName: 'Dr. Gregory House',
      }];
      const host = document.createElement('div');
      host.innerHTML = actions.buildActionBar(0);
      document.body.appendChild(host);
      host.querySelector('[data-chat-message-action="retry-discussion-participant"]')?.click();

      ui.removeDiscussContinuePrompt();
      state.chatThreads[0] = { id: state.currentThreadId };
      state.chatHistory = [{ role: 'assistant', content: 'Ready' }];
      picker.showDiscussPersonaPicker();
      const house = /** @type {HTMLInputElement | null} */ (
        document.querySelector('.discuss-persona-picker input[value="house"]')
      );
      house?.click();
      const usage = document.querySelector('.discuss-picker-usage')?.textContent || '';
      const pickerRect = document.querySelector('.discuss-persona-picker')?.getBoundingClientRect();
      const closeRect = document.querySelector('.discuss-picker-close')?.getBoundingClientRect();
      const itemRects = Array.from(document.querySelectorAll('.discuss-picker-item'))
        .map(item => item.getBoundingClientRect());
      return {
        pauses,
        retried,
        pauseVisible,
        pausedCopy: expectation.includes('2 responses remaining'),
        usageDisclosed: usage.includes('Future messages use 2 sequential responses')
          && usage.includes('charged for each'),
        retryLabel: host.textContent.includes('Retry Dr. Gregory House'),
        resumeAllLabel: host.textContent.includes('Resume round'),
        pickerFitsViewport: !!pickerRect && pickerRect.left >= 0 && pickerRect.right <= innerWidth,
        pickerCloseTarget: !!closeRect && closeRect.width >= 44 && closeRect.height >= 44,
        pickerItemsAreTouchSized: itemRects.length > 0 && itemRects.every(rect => rect.height >= 44),
      };
    } finally {
      actions.configureChatMessageActionDeps(previous);
      ui.removeDiscussContinuePrompt();
      picker.removeDiscussPersonaPicker();
    }
  });

  expect(outcomes).toEqual({
    pauses: 1,
    retried: 'house',
    pauseVisible: true,
    pausedCopy: true,
    usageDisclosed: true,
    retryLabel: true,
    resumeAllLabel: true,
    pickerFitsViewport: true,
    pickerCloseTarget: true,
    pickerItemsAreTouchSized: true,
  });
});
