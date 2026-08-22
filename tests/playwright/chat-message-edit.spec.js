import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      acceptedAt: '2026-08-08T00:00:00.000Z',
      appVersion: 'chat-edit-test',
      location: 'chat-edit-test',
    }));
  });
});

async function setupConversation(page) {
  return page.evaluate(async () => {
    await import('/js/chat-window-bindings.js');
    const [{ state }, hooks, render, cryptoStore, threads, composer, panel, edit, history] = await Promise.all([
      import('/js/state.js'),
      import('/js/app-chat-hooks.js'),
      import('/js/chat-render.js'),
      import('/js/crypto.js'),
      import('/js/chat-threads.js'),
      import('/js/chat-composer.js'),
      import('/js/chat-panel.js'),
      import('/js/chat-message-edit.js'),
      import('/js/chat-history.js'),
    ]);
    hooks.configureAppChatHooks({});
    await panel.openChatPanel();
    const profileId = `edit-fork-${Date.now()}`;
    const sourceId = 't_source';
    const now = new Date().toISOString();
    const original = [
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer', personalityName: 'AI Lab Analyst' },
      { role: 'user', content: 'Original follow-up' },
      { role: 'assistant', content: 'Original follow-up answer', personalityName: 'AI Lab Analyst' },
    ];
    state.currentProfile = profileId;
    state.currentThreadId = sourceId;
    state.currentChatPersonality = 'default';
    state.chatThreads = [{
      id: sourceId, name: 'Source conversation', createdAt: now, updatedAt: now,
      messageCount: original.length, personality: 'default', personalityName: 'AI Lab Analyst',
    }];
    state.chatHistory = original;
    await cryptoStore.encryptedSetItem(threads.getChatThreadsKey(), JSON.stringify(state.chatThreads));
    await cryptoStore.encryptedSetItem(threads.getChatThreadKey(sourceId), JSON.stringify(original));
    edit.configureChatMessageEditDeps({
      renderChatMessages: render.renderChatMessages,
      updateChatInputState: panel.updateChatInputState,
      sendChatMessage: async () => {
        const content = edit.getPendingChatMessageEditText();
        const prepared = edit.prepareChatMessageEditSend();
        if (!prepared || !content) return;
        state.chatHistory.push({ role: 'user', content });
        state.chatHistory.push({
          role: 'assistant', content: 'Revised answer', personalityName: 'AI Lab Analyst',
        });
        await history.saveChatHistory();
        render.renderChatMessages();
      },
    });
    render.renderChatMessages();
    composer.setChatInputValue('Keep this unsent draft');
    return { profileId, sourceId };
  });
}

test('latest-message edit retries in place while a fork starts a linked new chat', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const setup = await setupConversation(page);

  await expect(page.locator('#chat-msg-0 [data-chat-message-action="edit-user-message"]')).toHaveCount(0);
  await expect(page.locator('#chat-msg-0 [data-chat-message-action="fork-message"]')).toHaveCount(0);
  const editButton = page.locator('#chat-msg-2 [data-chat-message-action="edit-user-message"]');
  await expect(editButton).toContainText('Edit & retry');
  await expect(page.locator('#chat-msg-2 [data-chat-message-action="fork-message"]')).toHaveCount(0);

  await editButton.click();
  await expect(page.locator('#chat-message-edit-input')).toHaveValue('Original follow-up');
  await expect(page.locator('.chat-input-row')).toHaveAttribute('inert', '');
  await expect(page.locator('#chat-input')).toHaveValue('Keep this unsent draft');
  await page.locator('#chat-message-edit-input').fill('Cancelled revision');
  await page.locator('[data-chat-message-action="cancel-message-edit"]').click();
  await expect(page.locator('#chat-message-edit-input')).toHaveCount(0);
  await expect(page.locator('#chat-msg-2')).toContainText('Original follow-up');
  await expect(page.locator('#chat-input')).toHaveValue('Keep this unsent draft');

  await page.locator('#chat-msg-2 [data-chat-message-action="edit-user-message"]').click();
  await page.locator('#chat-message-edit-input').fill('Edited follow-up in this chat');
  await page.locator('[data-chat-message-action="submit-message-edit"]').click();
  await expect(page.locator('#chat-message-edit-input')).toHaveCount(0);
  await expect(page.locator('#chat-msg-2')).toContainText('Edited follow-up in this chat');
  await expect(page.locator('#chat-msg-3')).toContainText('Revised answer');
  await expect(page.locator('#chat-input')).toHaveValue('Keep this unsent draft');

  const editedState = await page.evaluate(async ({ profileId, sourceId }) => {
    const [{ state }, cryptoStore] = await Promise.all([
      import('/js/state.js'),
      import('/js/crypto.js'),
    ]);
    return {
      currentThreadId: state.currentThreadId,
      threadCount: state.chatThreads.length,
      stored: JSON.parse(await cryptoStore.encryptedGetItem(`labcharts-${profileId}-chat-t_${sourceId}`) || '[]'),
    };
  }, setup);
  expect(editedState.currentThreadId).toBe(setup.sourceId);
  expect(editedState.threadCount).toBe(1);
  expect(editedState.stored.map(message => message.content)).toEqual([
    'First question', 'First answer', 'Edited follow-up in this chat', 'Revised answer',
  ]);

  await page.locator('#chat-msg-1 [data-chat-message-action="fork-message"].chat-fork-action').click();
  await expect(page.locator('.chat-fork-notice')).toContainText('Forked from Source conversation');
  await expect(page.locator('.chat-fork-notice button')).toHaveText('View original');
  await expect(page.locator('#chat-input')).toHaveValue('');

  const forkState = await page.evaluate(async ({ profileId, sourceId }) => {
    const [{ state }, cryptoStore] = await Promise.all([
      import('/js/state.js'),
      import('/js/crypto.js'),
    ]);
    const fork = state.chatThreads.find(thread => thread.id === state.currentThreadId);
    return {
      fork,
      forkHistory: JSON.parse(await cryptoStore.encryptedGetItem(`labcharts-${profileId}-chat-t_${fork.id}`) || '[]'),
      sourceHistory: JSON.parse(await cryptoStore.encryptedGetItem(`labcharts-${profileId}-chat-t_${sourceId}`) || '[]'),
    };
  }, setup);
  expect(forkState.fork).toMatchObject({
    name: 'Source conversation · fork',
    forkedFromThreadId: setup.sourceId,
    forkedFromMessageIndex: 1,
  });
  expect(forkState.forkHistory.map(message => message.content)).toEqual(['First question', 'First answer']);
  expect(forkState.sourceHistory.map(message => message.content)).toEqual([
    'First question', 'First answer', 'Edited follow-up in this chat', 'Revised answer',
  ]);

  await page.locator('.chat-fork-notice button').click();
  await expect(page.locator('#chat-input')).toHaveValue('Keep this unsent draft');
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.currentThreadId)).toBe(setup.sourceId);
});

test('mobile keeps fork in the message overflow menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app', { waitUntil: 'load' });
  await setupConversation(page);

  const message = page.locator('#chat-msg-1');
  await expect(message.locator('.chat-fork-action')).toBeHidden();
  const more = message.locator('.chat-action-more');
  await expect(more).toBeVisible();
  await more.locator('summary').click();
  await expect(more.locator('[data-chat-message-action="fork-message"]')).toContainText('Fork to new chat');
});
