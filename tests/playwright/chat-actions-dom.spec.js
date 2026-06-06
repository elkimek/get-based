import { expect, test } from './coverage-fixture.js';

test('chat action bars, clipboard, and context toggles work in the live DOM', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() =>
    typeof window.renderChatMessages === 'function'
      && typeof window.toggleContextDetails === 'function'
      && !!window._labState
  );

  const results = await page.evaluate(async () => {
    const { buildActionBar } = await import('/js/chat-actions.js');
    const state = window._labState;
    const originalHistory = JSON.parse(JSON.stringify(state.chatHistory || []));
    const outcomes = {};

    try {
      state.chatHistory = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!', context: [{ label: 'Lab values', detail: '5 markers' }] },
        { role: 'user', content: 'More info' },
        { role: 'assistant', content: 'Sure, here is more.', context: [{ label: 'Diet', detail: 'filled' }, { label: 'Sleep & Rest', detail: 'filled' }] },
      ];

      const realContainer = document.getElementById('chat-messages');
      const hasProvider = typeof window.hasAIProvider === 'function' ? window.hasAIProvider() : true;
      if (realContainer && hasProvider) {
        window.renderChatMessages();
        const aiMsgs = realContainer.querySelectorAll('.chat-msg.chat-ai');
        const userMsgs = realContainer.querySelectorAll('.chat-msg.chat-user');
        outcomes.aiMessagesHaveActionBars = aiMsgs.length > 0 && aiMsgs[0].querySelector('.chat-action-bar') !== null;
        outcomes.aiActionBarHasButtons = aiMsgs.length > 0 && aiMsgs[0].querySelectorAll('.chat-action-btn').length >= 1;
        outcomes.userMessagesHaveNoActionBars = userMsgs.length > 0 && userMsgs[0].querySelector('.chat-action-bar') === null;
      } else {
        const doc = new DOMParser().parseFromString(
          `<div class="chat-msg chat-ai">${buildActionBar(1)}</div><div class="chat-msg chat-user">Hello</div>`,
          'text/html'
        );
        const aiMsg = doc.querySelector('.chat-msg.chat-ai');
        const userMsg = doc.querySelector('.chat-msg.chat-user');
        outcomes.aiMessagesHaveActionBars = !!aiMsg?.querySelector('.chat-action-bar');
        outcomes.aiActionBarHasButtons = (aiMsg?.querySelectorAll('.chat-action-btn').length || 0) >= 1;
        outcomes.userMessagesHaveNoActionBars = userMsg?.querySelector('.chat-action-bar') === null;
      }

      outcomes.clipboardAvailable = typeof navigator.clipboard !== 'undefined';
      outcomes.clipboardWriteTextAvailable = typeof navigator.clipboard?.writeText === 'function';

      const testDiv = document.createElement('div');
      testDiv.innerHTML = '<div id="chat-ctx-details-1" style="display:none">content</div><span id="chat-ctx-arrow-1">▸</span>';
      document.body.appendChild(testDiv);
      try {
        window.toggleContextDetails(1);
        const details = document.getElementById('chat-ctx-details-1');
        const arrow = document.getElementById('chat-ctx-arrow-1');
        outcomes.toggleContextDetailsOpens = details?.style.display === 'flex';
        outcomes.toggleContextArrowOpens = arrow?.textContent === '▾';

        window.toggleContextDetails(1);
        outcomes.toggleContextDetailsCloses = details?.style.display === 'none';
        outcomes.toggleContextArrowCloses = arrow?.textContent === '▸';
      } finally {
        testDiv.remove();
      }
    } finally {
      state.chatHistory = originalHistory;
    }

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
