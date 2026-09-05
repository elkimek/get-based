import { expect, test } from './coverage-fixture.js';

test('closing and reopening chat preserves an in-flight response', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-panel');

  const outcomes = await page.evaluate(async () => {
    // Load through the production lazy boundary so the shell X/Escape routes
    // point at the same live chat module used by the test.
    const chatLoader = await import('/js/chat-loader.js');
    await chatLoader.loadChatModule();
    const [{ state }, chatPanel, chatSend, tour] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-panel.js'),
      import('/js/chat-send.js'),
      import('/js/tour.js'),
    ]);
    const panel = document.getElementById('chat-panel');
    const backdrop = document.getElementById('chat-backdrop');
    const messages = document.getElementById('chat-messages');
    const sendButton = document.getElementById('chat-send-btn');
    const storage = new Map(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return [key, key == null ? null : localStorage.getItem(key)];
    }));
    const original = {
      history: state.chatHistory,
      panelClass: panel?.className || '',
      panelAriaHidden: panel?.getAttribute('aria-hidden'),
      backdropClass: backdrop?.className || '',
      messagesHTML: messages?.innerHTML || '',
      sendHTML: sendButton?.innerHTML || '',
      sendClass: sendButton?.className || '',
      sendDisabled: sendButton?.disabled,
      sendLabel: sendButton?.getAttribute('aria-label'),
      sendTitle: sendButton?.getAttribute('title'),
    };
    const controller = new AbortController();
    let discussionRestoreCalls = 0;
    const previousCallbacks = chatPanel.configureChatPanel({
      restoreDiscussionContinuePrompt: () => { discussionRestoreCalls += 1; },
    });

    try {
      // Escape dismisses the highest-priority overlay first. Remove the
      // empty-profile tour so this fixture exercises the chat Escape route
      // deterministically, even when CI reaches the test before onboarding
      // has settled.
      tour.endTour({ openEmptyChat: false });
      const liveHistory = [
        { role: 'user', content: 'Explain this result' },
      ];
      state.chatHistory = liveHistory;
      if (messages) {
        messages.innerHTML = `
          <div class="chat-msg chat-user">Explain this result
            <button class="chat-action-btn chat-edit-retry-action" data-chat-message-action="edit-user-message" aria-label="Edit and resend your latest message"></button>
          </div>
          <div class="chat-persona-label">AI Lab Analyst</div>
          <div class="chat-msg chat-ai" data-chat-streaming="true">Partial answer still arriving…</div>
        `;
        messages.setAttribute('aria-busy', 'true');
      }
      panel?.classList.add('open');
      backdrop?.classList.add('open');
      chatSend.setChatAbortController(controller);

      // The X and Escape routes both call closeChatPanel; exercise both entry
      // points while keeping the same request controller alive.
      document.querySelector('.chat-close-btn')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
      await new Promise(resolve => setTimeout(resolve, 0));
      const xClosedWithoutAbort = !panel?.classList.contains('open')
        && chatSend.getChatAbortController() === controller
        && !controller.signal.aborted;

      await chatPanel.openChatPanel();
      const xReopenPreservedLiveResponse = messages?.textContent.includes('Partial answer still arriving')
        && messages?.querySelector('[data-chat-streaming="true"]') != null
        && state.chatHistory === liveHistory
        && sendButton?.getAttribute('aria-label') === 'Stop generating';

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }));
      // Escape passes through asynchronous lazy shell handlers. Wait for the
      // expected close state instead of racing it after one event-loop tick.
      for (let attempt = 0; panel?.classList.contains('open') && attempt < 50; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      const escapeClosedWithoutAbort = !panel?.classList.contains('open')
        && chatSend.getChatAbortController() === controller
        && !controller.signal.aborted;

      await chatPanel.openChatPanel();
      return {
        xClosedWithoutAbort,
        xReopenPreservedLiveResponse,
        escapeClosedWithoutAbort,
        escapeReopenPreservedLiveResponse:
          messages?.textContent.includes('Partial answer still arriving')
          && messages?.querySelector('[data-chat-streaming="true"]') != null
          && state.chatHistory === liveHistory,
        doesNotRestoreIdleDiscussionPrompt: discussionRestoreCalls === 0,
        stopButtonRemainsAvailable: sendButton?.classList.contains('streaming')
          && sendButton?.getAttribute('aria-label') === 'Stop generating'
          && sendButton.disabled === false,
        retryActionSuppressedWhileResponseActive: (() => {
          const retry = messages?.querySelector('.chat-edit-retry-action');
          return retry?.hidden === true && retry?.disabled === true;
        })(),
        transcriptRemainsBusy: messages?.getAttribute('aria-busy') === 'true',
      };
    } finally {
      chatSend.setChatAbortController(null);
      chatPanel.configureChatPanel(previousCallbacks);
      state.chatHistory = original.history;
      if (messages) messages.innerHTML = original.messagesHTML;
      if (panel) {
        panel.className = original.panelClass;
        if (original.panelAriaHidden == null) panel.removeAttribute('aria-hidden');
        else panel.setAttribute('aria-hidden', original.panelAriaHidden);
      }
      if (backdrop) backdrop.className = original.backdropClass;
      if (sendButton) {
        sendButton.innerHTML = original.sendHTML;
        sendButton.className = original.sendClass;
        sendButton.disabled = Boolean(original.sendDisabled);
        if (original.sendLabel == null) sendButton.removeAttribute('aria-label');
        else sendButton.setAttribute('aria-label', original.sendLabel);
        if (original.sendTitle == null) sendButton.removeAttribute('title');
        else sendButton.setAttribute('title', original.sendTitle);
      }
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key != null && value != null) localStorage.setItem(key, value);
      }
    }
  });

  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});
