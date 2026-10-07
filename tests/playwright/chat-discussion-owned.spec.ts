import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture, installDiscussionProvider } from '../helpers/chat-discussion-fixture.js';
test.beforeEach(async ({ page, context }) => {
  await installDiscussionFixture(context); await page.goto('/app');
  await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js');
    (await import('/js/chat-discussion-lifecycle.js')).cleanupDiscussionState();
    state.currentChatPersonality = 'default';
    state.chatHistory = [{ role: 'user', content: 'Discussion question' }, { role: 'assistant', content: 'First perspective.', personalityName: 'AI Lab Analyst' }];
    (await import('/js/chat-render.js')).renderChatMessages();
    (await import('/js/chat-discussion-ui.js')).updateDiscussButton();
  });
  await expect(page.locator('[data-chat-discussion-view]')).toBeVisible();
});
test('owned discussion picker selects one additional perspective and keeps keyboard focus', async ({ page }) => {
  await page.getByRole('button', { name: 'Start a discussion', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Start a discussion', exact: true }); await expect(picker).toBeVisible();
  await expect(picker.locator('input[data-locked="1"]')).toBeChecked(); await expect(picker.locator('input[data-locked="1"]')).toBeDisabled();
  await expect(picker.locator('input:not(:disabled)').first()).toBeFocused();
  await picker.getByText('🦯 Dr. Gregory House', { exact: true }).click();
  await expect(picker.locator('.discuss-picker-start')).toBeEnabled(); await expect(picker.locator('.discuss-picker-usage')).toContainText('Future messages use 2 sequential responses');
  expect(await picker.locator('input:not(:checked):not([data-locked="1"]):enabled').count()).toBe(0);
  expect(await page.evaluate(async () => (await import('/js/chat-discussion-picker.js')).readDiscussPersonaPickerSelection())).toMatchObject({ allPersonas: [{ id: 'default' }, { id: 'house' }], newPersonas: [{ id: 'house' }], addingToExisting: false });
  await picker.locator('input[value="house"]').focus(); await page.keyboard.press('Escape');
  await expect(picker).toBeHidden(); await expect(page.locator('#chat-discuss-btn')).toBeFocused(); await expect(page.locator('.chat-panel-conversation')).toBeVisible();
});
test('owned discussion round preserves resume pause end actions and composer restrictions', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async () => {
    const { CHAT_PERSONALITIES } = await import('/js/constants.js');
    const personas = CHAT_PERSONALITIES.slice(0, 2).map(({ id, name, icon }) => ({ id, name, icon }));
    const { state } = await import('/js/state.js'); const thread = state.chatThreads.find(thread => thread.id === state.currentThreadId)!;
    thread.discussionPendingPersonas = [personas[1]!];
    (await import('/js/chat-discussion-lifecycle.js')).showDiscussContinuePrompt(personas, 'default');
    (await import('/js/chat-discussion-ui.js')).updateDiscussionProgress(personas[1], 1, 2);
  });
  await expect(page.locator('.chat-discussion-resume')).toHaveText('Resume 1'); await expect(page.locator('.chat-discussion-pause')).toBeVisible();
  await expect(page.locator('.chat-discussion-progress')).toContainText('Dr. Gregory House is responding · 2 of 2');
  await expect(page.locator('#chat-input')).toHaveAttribute('placeholder', 'Reply to the discussion…'); await expect(page.locator('#chat-input')).toHaveAttribute('aria-describedby', 'chat-discussion-composer-help');
  await expect(page.locator('#chat-add-photo-action')).toBeDisabled(); await expect(page.locator('#chat-add-photo-action')).toHaveAttribute('title', 'End the discussion to attach photos');
  await page.evaluate(async () => { (await import('/js/chat-discussion-ui.js')).updateDiscussionProgress(null, 0, 0); (await import('/js/chat-panel.js')).updateChatInputState(); });
  await expect(page.locator('.chat-discussion-pause')).toBeHidden(); await expect(page.locator('#chat-input')).toHaveAttribute('placeholder', 'Reply to the discussion…');
  await page.getByRole('button', { name: 'End', exact: true }).click(); await expect(page.locator('.chat-discussion-mode')).toHaveCount(0); await expect(page.locator('#chat-add-photo-action')).toBeEnabled();
  await expect(page.locator('#chat-input')).not.toHaveAttribute('aria-describedby'); await expect(page.locator('#chat-input')).toBeFocused();
  expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return state.chatThreads.find(thread => thread.id === state.currentThreadId)?.discussionEnded; })).toBe(true);
  expect(errors).toEqual([]);
});
for (const boundary of ['profile', 'thread'] as const) test(`owned discussion rejects retired ${boundary} selection and controls`, async ({ page }) => {
  await page.locator('#chat-discuss-btn').click(); await page.locator('.discuss-picker-item').filter({ hasText: 'Dr. Gregory House' }).click();
  await page.evaluate(async boundary => { const { state } = await import('/js/state.js'); if (boundary === 'profile') state.currentProfile = 'another-profile'; else state.currentThreadId = 'another-thread'; }, boundary);
  expect(await page.evaluate(async () => (await import('/js/chat-discussion-picker.js')).readDiscussPersonaPickerSelection())).toBeNull();
  await page.locator('.discuss-picker-start').click(); await expect(page.locator('.discuss-persona-picker')).toBeVisible(); await expect(page.locator('.chat-discussion-mode')).toHaveCount(0);
});
test('owned discussion renders imported text literally and keeps all themes accessible at narrow widths', async ({ page }) => {
  test.setTimeout(90000); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(async () => {
    (await import('/js/chat-discussion-ui.js')).showDiscussContinuePrompt([{ name: '<img src=x onerror=alert(1)>', icon: '🔬' }, { name: 'VeryLongUnbrokenParticipantName0123456789VeryLongUnbrokenParticipantName0123456789', icon: '🦯' }], 'default', { pendingPersonas: [{}] });
    (await import('/js/chat-discussion-picker.js')).showDiscussPersonaPicker();
  });
  await expect(page.locator('.chat-discussion-participants img')).toHaveCount(0); await expect(page.locator('.chat-discussion-participants')).toContainText('<img src=x onerror=alert(1)>');
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
    await page.evaluate(async theme => { const t = await import('/js/theme.js'); await t.loadExtraThemesStylesheet(); t.setTheme(theme); }, theme);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(async () => {
        const violations = await page.locator('[data-chat-discussion-view]').evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core'); }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, failure: n.failureSummary })) })));
        expect(violations, `${theme}/${width}`).toEqual([]);
      }).toPass({ timeout: 5000 });
      await expect(async () => {
        for (const selector of ['.chat-discussion-mode', '.discuss-persona-picker', '#chat-input']) {
          const box = await page.locator(selector).boundingBox(); expect(box!.x, selector).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width, selector).toBeLessThanOrEqual(width + 1);
          expect(await page.locator(selector).evaluate(element => element.scrollWidth <= element.clientWidth + 1), selector).toBe(true);
        }
      }).toPass({ timeout: 5000 });
    }
  }
  await page.screenshot({ path: test.info().outputPath('discussion-narrow.png') });
});

test('owned discussion adds only the new perspective then sends future messages to both participants', async ({ page, context }) => {
  await installDiscussionProvider(context); await page.reload();
  await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js'); state.currentChatPersonality = 'default';
    state.chatHistory = [{ role: 'user', content: 'Original question' }, { role: 'assistant', content: 'Original answer', personalityName: 'AI Lab Analyst' }];
    (await import('/js/chat-render.js')).renderChatMessages(); (await import('/js/chat-discussion-ui.js')).updateDiscussButton();
  });
  await page.locator('#chat-discuss-btn').click(); await page.locator('.discuss-picker-item').filter({ hasText: 'Dr. Gregory House' }).click();
  await page.locator('.discuss-picker-start').click();
  await expect(page.locator('.chat-discussion-participants')).toContainText('Dr. Gregory House');
  await expect(page.locator('#chat-messages')).toContainText('Synthetic discussion reply.');
  await expect.poll(() => page.evaluate(() => (window as unknown as { discussionRequests: unknown[]; }).discussionRequests.length)).toBe(1);
  await page.locator('#chat-input').fill('Compare both perspectives'); await page.locator('#chat-send-btn').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { discussionRequests: unknown[]; }).discussionRequests.length)).toBe(3);
  await expect(page.locator('.chat-discussion-pause')).toBeHidden();
  expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return state.chatHistory.filter(message => message.role === 'assistant').map(message => message.personalityName); })).toEqual(['AI Lab Analyst', 'Dr. Gregory House', 'AI Lab Analyst', 'Dr. Gregory House']);
});
