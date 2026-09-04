import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
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

test('chat shows profile, CLI, and persona identities with rotating pre-token copy', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-messages', { state: 'attached' });

  const results = await page.evaluate(async () => {
    const [{ state }, render, thinking, panel] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-render.js'),
      import('/js/chat-thinking-status.js'),
      import('/js/chat-panel.js'),
    ]);
    await panel.openChatPanel();
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
    container.appendChild(indicator);
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
      overflow: container.scrollWidth - container.clientWidth,
      userMargin: getComputedStyle(user).marginRight,
      assistantMargin: getComputedStyle(cli).marginLeft,
      cliTileColor: getComputedStyle(cli, '::before').backgroundColor,
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
});
