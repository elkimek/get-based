import { expect, test } from './coverage-fixture.js';

test('chat header has one context status surface and no legacy KB pill', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await expect(page.locator('#chat-lens-indicator')).toHaveCount(0);
  await expect(page.locator('#chat-lens-dot')).toHaveCount(0);
  await expect(page.locator('#chat-context-live-status')).toHaveCount(1);
});

test('knowledge base modal renders lens controls and settings AI does not', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const { openKnowledgeBaseModal } = await import('/js/lens.js');
    localStorage.setItem('labcharts-lens-config', JSON.stringify({
      backend: 'external-server',
      url: 'https://kb.example.test',
      enabled: false,
      topK: 5,
      testProbe: 'vitamin D deficiency supplementation',
      multiQuery: true,
    }));
    await openKnowledgeBaseModal();
  });

  const lensSection = page.locator('#custom-lens-section');
  await expect(lensSection).toHaveCount(1);
  await expect(page.locator('#lens-url-input')).toHaveCount(1);
  await expect(page.locator('#lens-key-input')).toHaveCount(1);
  await expect(page.locator('#lens-topk-input')).toHaveCount(1);
  await expect(page.locator('#lens-enabled-toggle')).toHaveCount(1);
  await expect(page.locator('#kb-modal .context-back-btn')).toHaveCount(1);
  await expect(lensSection.locator('[data-lens-action="save-config"]')).toHaveCount(1);
  expect(await lensSection.evaluate((section) => !section.querySelector('[onclick], [onchange], [oninput]'))).toBe(true);

  await page.evaluate(async () => {
    const { closeKnowledgeBaseModal } = await import('/js/lens.js');
    const settings = await import('/js/settings.js');
    await closeKnowledgeBaseModal();
    settings.openSettingsModal('ai');
  });

  await expect(page.locator('.settings-tab-panel[data-tab-panel="ai"] #custom-lens-section')).toHaveCount(0);
});

test('direct Knowledge Base entry does not imply that Context is its parent', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const knowledgeBaseNav = page.locator('#sidebar-nav .nav-item[data-category="knowledge-base"]');
  await expect(knowledgeBaseNav).toHaveText(/Knowledge Base/);
  await knowledgeBaseNav.click();

  await expect(page.locator('#kb-modal-overlay')).toHaveClass(/\bshow\b/);
  await expect(page.locator('#kb-modal .gb-modal-title')).toHaveText('Knowledge Base');
  await expect(page.locator('#kb-modal .context-back-btn')).toHaveCount(0);
});
