import { expect, test } from './coverage-fixture.js';

test('Context hub opens from Personalize AI alias and dismisses', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await expect(page.locator('#context-hub-overlay.show')).toHaveCount(0);

  await page.evaluate(async () => {
    const cards = await import('/js/context-cards.js');
    cards.openPersonalizeAIPicker();
  });

  const overlay = page.locator('#context-hub-overlay');
  await expect(overlay).toHaveClass(/show/);
  await expect(overlay.locator('.ai-picker-card')).toHaveCount(2);
  await expect(overlay).toContainText('Context');
  await expect(overlay).toContainText('Personalize how AI answers');
  await expect(overlay).toContainText('Interpretive Lens');
  await expect(overlay.locator('.ai-picker-kicker')).toHaveCount(2);
  await expect(overlay.locator('.ai-picker-icon')).toHaveCount(0);
  await expect(overlay).toContainText('Knowledge Base');
  await expect(overlay).not.toContainText('DNA Data');
  await expect(overlay).not.toContainText('Protect your data');

  await expect(overlay.locator('#context-hub-cancel')).toBeVisible();
  await overlay.locator('#context-hub-cancel').click();
  await expect(overlay).not.toHaveClass(/show/);
});

test('chat header shows clickable green AI Context status chip', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { openChatPanel } = await import('/js/chat-panel.js');
    const chat = await import('/js/chat-personalities.js');
    localStorage.removeItem('labcharts-lens-config');
    localStorage.removeItem('labcharts-lens-local-count');
    state.importedData.interpretiveLens = 'Functional endocrinology';
    await openChatPanel();
    chat.updateChatHeaderModel();
  });

  const chip = page.locator('.chat-context-status');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('AI Context: Lens');
  await expect(chip.locator('.chat-context-dot')).toBeVisible();
  await expect(chip).toHaveAttribute('aria-label', /Click to manage Context/);

  await chip.evaluate(el => el.click());
  const overlay = page.locator('#context-hub-overlay');
  await expect(overlay).toHaveClass(/show/);
  await expect(overlay).toContainText('Personalize how AI answers');
  await expect(overlay).toContainText('Interpretive Lens is enabled');
});

test('chat header shows pending KB state when Knowledge Base is enabled but empty', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { saveLensConfig } = await import('/js/lens.js');
    const { openChatPanel } = await import('/js/chat-panel.js');
    const chat = await import('/js/chat-personalities.js');
    localStorage.removeItem('labcharts-lens-local-count');
    state.importedData.interpretiveLens = '';
    saveLensConfig({ backend: 'in-browser', enabled: true, name: 'Research Notes', topK: 5, multiQuery: true });
    await openChatPanel();
    chat.updateChatHeaderModel();
  });

  const chip = page.locator('.chat-context-status');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('AI Context: KB empty');
  await expect(chip).toHaveClass(/chat-context-status-pending/);
  await expect(chip).toHaveAttribute('aria-label', /no library is indexed yet/);

  await chip.evaluate(el => el.click());
  const overlay = page.locator('#context-hub-overlay');
  await expect(overlay).toHaveClass(/show/);
  await expect(overlay).toContainText('Knowledge Base is enabled, but no documents are indexed yet');
  await expect(overlay).toContainText('Add documents');
});

test('clearing Interpretive Lens immediately clears chat header context chip', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { openChatPanel } = await import('/js/chat-panel.js');
    const chat = await import('/js/chat-personalities.js');
    localStorage.removeItem('labcharts-lens-config');
    localStorage.removeItem('labcharts-lens-local-count');
    state.importedData.interpretiveLens = 'Functional endocrinology';
    await openChatPanel();
    chat.updateChatHeaderModel();
  });

  const chip = page.locator('.chat-context-status');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('AI Context: Lens');

  await chip.evaluate(el => el.click());
  const contextOverlay = page.locator('#context-hub-overlay');
  await expect(contextOverlay).toHaveClass(/show/);
  await contextOverlay.locator('.ai-picker-card[data-pick="lens"]').click();

  const editorOverlay = page.locator('#modal-overlay');
  await expect(editorOverlay).toHaveClass(/show/);
  await page.locator('[data-lifestyle-action="clear-interpretive-lens"]').evaluate(el => el.click());

  await expect(editorOverlay).not.toHaveClass(/show/);
  await expect(chip).toBeHidden();
  await page.evaluate(() => {
    if (document.querySelector('.chat-context-status:not([hidden])')) throw new Error('Context chip stayed visible after clearing Lens');
  });
});
