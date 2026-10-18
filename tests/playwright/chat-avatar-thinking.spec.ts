import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for(const key of ['emptyTour','tour'])localStorage.setItem(`labcharts-default-${key}`,'completed');
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      policyScope: 'self-hosted-notice',
      acceptedAt: '2026-08-08T00:00:00.000Z',
      appVersion: 'chat-avatar-test',
      location: 'chat-avatar-test',
    }));
  });
});

test('the composer opens AI context before dashboard context hooks are registered', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.locator('html[data-app-ready]').waitFor({state:'attached'});
  await page.evaluate(async () => {
    await (await import('/js/chat-panel.js')).openChatPanel();
    (await import('/js/state.js')).state.chatHistory = [{ role: 'user', content: 'Context menu fixture' }];
    (await import('/js/chat-render.js')).renderChatMessages();
    const runtime = await import('/js/context-cards-runtime.js');
    runtime.configureContextCardsRuntimeCallbacks({ openContextModal: null });
  });
  await page.locator('#chat-attach-btn').click();
  await page.locator('[data-chat-composer-view] [data-chat-action="open-chat-context"]').click();
  await expect(page.locator('#context-hub-overlay')).toBeVisible();
});

test('chat shows profile, CLI, and persona identities with rotating pre-token copy', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-messages', { state: 'attached' });
  // Complete the real startup profile and neutral conversation before seeding identities.
  await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await expect(page.locator('body')).not.toHaveClass(/\bchat-autostart-reserved\b/);
  await expect(page.locator('#chat-thread-list .chat-thread-item.active .chat-thread-item-name')).toHaveText('New Conversation');
  const closeChat = page.getByRole('button', { name: 'Close chat', exact: true });
  if (await closeChat.isVisible()) await closeChat.click();
  await expect(page.locator('body')).not.toHaveClass(/\bchat-open\b/);
  await expect(page.locator('#chat-backdrop')).toBeHidden();

  const results = await page.evaluate(async () => {
    const [{ state }, render, thinking, panel] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-render.js'),
      import('/js/chat-thinking-status.js'),
      import('/js/chat-panel.js'),
    ]);
    if (await panel.openChatPanel() !== true) throw new Error('The settled Chat owner could not open');
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    state.currentProfile = 'avatar-profile';
    state.profiles = [{ id: 'avatar-profile', name: 'Ada', avatar: tinyPng }];
    state.currentThreadId = 'avatar-thread';
    state.chatHistory = [
      { role: 'user', content: 'Check this result' },
      {
        role: 'assistant', content: 'I will take a look.', personalityName: 'AI Lab Analyst',
        personalityIcon: '🔬', provider: 'codex-agent', agentId: 'codex',
      },
      { role: 'assistant', content: 'Interesting.', personalityName: 'Dr. Gregory House', personalityIcon: '🦯', agentId: 'codex' },
    ];
    render.renderChatMessages();

    const container = document.getElementById('chat-messages');
    const user = document.getElementById('chat-msg-0');
    const cli = document.getElementById('chat-msg-1');
    const persona = document.getElementById('chat-msg-2');
    const indicator = thinking.createChatThinkingIndicator({
      personalityName: 'AI Lab Analyst', personalityIcon: '🔬', agentId: 'codex',
    });
    thinking.stopChatThinkingStatus(indicator);
    thinking.startChatThinkingStatus(indicator, { phrases: ['Checking the evidence', 'Connecting the dots'], durations: [500] });
    container!.appendChild(indicator);
    const initialPhrase = indicator.querySelector('.chat-thinking-text')?.textContent;
    await new Promise(resolve => setTimeout(resolve, 550));
    const rotatedPhrase = indicator.querySelector('.chat-thinking-text')?.textContent;
    thinking.stopChatThinkingStatus(indicator);

    return {
      userPhoto: user?.style.getPropertyValue('--chat-avatar-image') || '',
      cliMark: cli?.style.getPropertyValue('--chat-avatar-image') || '',
      personaText: persona?.dataset.chatAvatarText || '',
      personaMark: persona?.style.getPropertyValue('--chat-avatar-image') || '',
      thinkingMark: indicator.style.getPropertyValue('--chat-avatar-image') || '',
      initialPhrase,
      rotatedPhrase,
      dotCount: indicator.querySelectorAll('.chat-thinking-dots i').length,
      indicatorHidden: indicator.getAttribute('aria-hidden'),
      overflow: container!.scrollWidth - container!.clientWidth,
      userMargin: getComputedStyle(user!).marginRight,
      assistantMargin: getComputedStyle(cli!).marginLeft,
      cliTileColor: getComputedStyle(cli!, '::before').backgroundColor,
      personaLabels: [...container!.querySelectorAll('.chat-persona-label')].map(label => label.textContent!.trim()),
    };
  });

  expect(results.userPhoto).toContain('data:image/png');
  expect(results.cliMark).toContain('/brands/cli-agent-codex.svg');
  expect(results.personaText).toBe('🦯');
  expect(results.personaMark).toBe('');
  expect(results.thinkingMark).toContain('/brands/cli-agent-codex.svg');
  expect(results.initialPhrase).toBe('Checking the evidence');
  expect(results.rotatedPhrase).toBe('Connecting the dots');
  expect(results.dotCount).toBe(3);
  expect(results.indicatorHidden).toBe('true');
  expect(results.overflow).toBeLessThanOrEqual(1);
  expect(results.userMargin).toBe('36px');
  expect(results.assistantMargin).toBe('36px');
  expect(results.cliTileColor).toBe('rgb(255, 255, 255)');
  expect(results.personaLabels).toEqual(['🦯 Dr. Gregory House']);
});
