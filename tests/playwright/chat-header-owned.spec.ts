import { expect, test } from './coverage-fixture.js';

test.beforeEach(async ({ page, context }) => {
  await context.route('https://openrouter.ai/**', route => route.abort());
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await context.addInitScript(() => {
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-analytics-consent-seen', '1'); localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-07T00:00:00Z', appVersion: 'test', location: 'local-test' }));
    localStorage.setItem('labcharts-ai-provider', 'openrouter'); localStorage.setItem('labcharts-openrouter-key', 'synthetic-header-key');
    localStorage.setItem('labcharts-openrouter-model', 'openai/header-test');
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify([{ id: 'openai/header-test', name: 'Header model', supportsWebSearch: true }]));
  });
  await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); });
  await expect(page.locator('[data-chat-header-view]')).toBeVisible();
});

test('header owns actions once, keyboard switch, menu focus and layout state', async ({ page, isMobile }) => {
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js'); state.chatHistory = [{ role: 'user', content: '1' }, { role: 'assistant', content: '2' }, { role: 'user', content: '3' }, { role: 'assistant', content: '4' }];
    (await import('/js/chat-personalities.js')).updateChatHeaderTitle();
    const shell = await import('/js/shell-actions.js'); shell.configureShellChatActionDeps({ summarizeThread: () => { document.body.dataset.headerSummaryCalls = String(Number(document.body.dataset.headerSummaryCalls || 0) + 1); } });
  });
  await page.locator('.chat-summary-btn').click(); await expect(page.locator('body')).toHaveAttribute('data-header-summary-calls', '1');
  const checkbox = page.locator('#chat-websearch-checkbox'), slider = page.locator('.chat-toggle-slider');
  const offColor = await slider.evaluate(element => getComputedStyle(element).backgroundColor);
  const thumbOffset = () => slider.evaluate(element => { const offset = getComputedStyle(element, '::before').translate; return offset === 'none' ? 0 : parseFloat(offset); });
  await expect.poll(thumbOffset).toBe(0);
  // Leave pointer modality from the preceding summary click before checking keyboard focus.
  await page.keyboard.press('Tab'); await checkbox.focus(); await page.keyboard.press('Space');
  await expect(checkbox).toBeFocused(); await expect(slider).toHaveCSS('outline-width', '2px');
  await expect(checkbox).toBeChecked(); await expect.poll(thumbOffset).toBe(12);
  expect(await slider.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(offColor);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('labcharts-chat-websearch'))).toBe('on');
  await page.locator('.chat-more-menu > summary').click(); await expect(page.locator('.chat-more-menu')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape'); await expect(page.locator('.chat-more-menu')).not.toHaveAttribute('open', ''); await expect(page.locator('.chat-more-menu > summary')).toBeFocused(); await expect(page.locator('#chat-panel')).toHaveClass(/open/);
  await page.locator('.chat-more-menu > summary').click();
  await page.locator('.chat-clear-btn').click();
  await expect(page.locator('.confirm-overlay')).toHaveClass(/show/);
  await page.locator('#confirm-cancel').click();
  await expect(page.locator('.chat-more-menu > summary')).toBeFocused();
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.chatHistory.length)).toBe(4);
  await page.locator('.chat-rail-toggle').click(); await expect(page.locator('.chat-rail-toggle')).toHaveAttribute('aria-expanded', 'true');
  if (isMobile) await page.locator('.chat-rail-back').click(); else await page.locator('.chat-rail-toggle').click();
  await expect(page.locator('.chat-rail-toggle')).toHaveAttribute('aria-expanded', 'false');
  if (!isMobile) { await page.locator('.chat-fullscreen-btn').click(); await expect(page.locator('.chat-fullscreen-btn')).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('.chat-fullscreen-btn')).toHaveAttribute('title', 'Exit fullscreen'); await page.locator('.chat-fullscreen-btn').click(); }
  await page.locator('.chat-close-btn').click(); await expect(page.locator('#chat-panel')).not.toHaveClass(/open/);
});

test('header renders literal perspectives, context and private receipts across themes and narrow layouts', async ({ page }) => {
  test.setTimeout(120000);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js'); state.importedData.interpretiveLens = 'A focused Lens'; state.chatHistory = [{ role: 'assistant', content: 'one', personalityName: '<img src=x>', personalityIcon: '🌿' }, { role: 'assistant', content: 'two', personalityName: 'Second' }];
    (await import('/js/chat-personalities.js')).updateChatHeaderTitle();
    (await import('/js/chat-attestation.js')).installAttestationTooltips();
    (await import('/js/chat-header-view.js')).renderChatHeader({ model: 'Literal <model>', privateMode: true, attestation: { nonceVerified: true, signingKeyBound: true, dcapVerified: true, gpuVerified: true, gpu: { tokensVerified: true, arch: '<GPU>' } } });
  });
  const header = page.locator('[data-chat-header-view]'); await expect(header.locator('.chat-header-title')).toContainText('<img src=x> + 1 perspective'); await expect(header.locator('img')).toHaveCount(0);
  await expect(page.locator('.chat-context-status')).toContainText('AI Context: Lens');
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
    await page.evaluate(async theme => { const t = await import('/js/theme.js'); await t.loadExtraThemesStylesheet(); t.setTheme(theme); }, theme);
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const attestation of [{}, { securityVerified: true }, { nonceVerified: true, signingKeyBound: true }, { nonceVerified: true, signingKeyBound: true, dcapVerified: true }, { nonceVerified: true, signingKeyBound: true, dcapVerified: true, gpuVerified: true, gpu: { tokensVerified: true } }]) {
      await page.evaluate(async attestation => { (await import('/js/chat-header-view.js')).renderChatHeader({ attestation }); }, attestation);
      await expect.poll(() => header.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core'); }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => v.id))).toEqual([]);
    }
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => header.evaluate(element => { const box = element.getBoundingClientRect(); return box.left >= -1 && box.right <= innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1; }), { message: `${theme}/${width}` }).toBe(true);
      expect(await page.locator('.chat-context-status').evaluate(element => {
        const box = element.getBoundingClientRect();
        const label = element.lastElementChild!;
        return box.width >= 90 && box.right <= innerWidth + 1 && label.scrollWidth <= label.clientWidth + 1 && element.textContent?.includes('AI Context: Lens');
      }), `${theme}/${width} readable context`).toBe(true);
      const violations = await header.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core'); }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.failureSummary) })));
      expect(violations, `${theme}/${width}`).toEqual([]);
    }
  }
  await page.screenshot({ path: test.info().outputPath('chat-header-narrow.png') });
});

test('shared attestation tooltip survives focus, Escape and receipt replacement', async ({ page }) => {
  await page.evaluate(async () => {
    const receipt = await import('/js/chat-attestation.js'); const host = document.createElement('div'); host.id = 'header-receipt-fixture'; host.style.cssText = 'position:fixed;left:40px;top:100px;z-index:1300'; host.innerHTML = receipt.e2eeLockFootnote({ nonceVerified: true, signingKeyBound: true, dcapVerified: true, gpuVerified: true, gpu: { tokensVerified: true, arch: '<GPU>' } }); document.body.appendChild(host);
  });
  const badge = page.locator('#header-receipt-fixture .e2ee-attestation-badge'), tooltip = page.locator('#e2ee-attestation-tooltip');
  await badge.focus(); await expect(tooltip).toBeVisible(); await expect(tooltip).toContainText('not proven to run together'); await expect(tooltip).toContainText('<GPU>'); await expect(tooltip.locator('gpu')).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(tooltip).toBeHidden(); await expect(badge).toHaveAttribute('aria-expanded', 'false'); await expect(page.locator('#chat-panel')).toHaveClass(/open/);
  await page.keyboard.press('Enter'); await expect(tooltip).toBeVisible();
  await page.evaluate(() => document.getElementById('header-receipt-fixture')!.remove()); await expect(tooltip).toBeHidden();
});
