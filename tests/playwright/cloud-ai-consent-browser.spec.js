import { expect, test } from './coverage-fixture.js';

test('provider activation combines disclosure and approval before automatic AI requests', async ({ page }) => {
  let requestCount = 0;
  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    requestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: 'approved response' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 2, completion_tokens: 2 },
      }),
    });
  });
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const consent = await import('/js/cloud-ai-consent.js');
    localStorage.removeItem('labcharts-ai-transparency-acknowledgement');
    localStorage.removeItem('labcharts-cloud-ai-consent');
    api.setAIProvider('openrouter');
    await api.saveOpenRouterKey('browser-owned-test-key');
    api.setOpenRouterModel('openai/gpt-4.1-mini');
    globalThis.__cloudConsentResult = null;
    globalThis.__startCloudActivation = () => {
      globalThis.__cloudConsentResult = null;
      globalThis.__cloudConsentPromise = consent.requestAIProviderActivation('openrouter')
        .then(granted => { globalThis.__cloudConsentResult = { granted }; });
    };
    globalThis.__startCloudActivation();
  });

  const overlay = page.locator('#cloud-ai-consent-overlay');
  await expect(overlay).toBeVisible();
  await expect(page.locator('#ai-transparency-overlay')).toHaveCount(0);
  await expect(overlay).toContainText('OpenRouter');
  await expect(overlay).toContainText('The connection check succeeded');
  await expect(overlay).toContainText('directly from this browser');
  await expect(overlay).toContainText('automatic AI insight requests');
  await expect(overlay.locator('a')).toHaveCount(2);
  const checkbox = page.locator('#cloud-ai-consent-checkbox');
  const approve = page.locator('[data-cloud-ai-consent-action="approve"]');
  await expect(checkbox).not.toBeChecked();
  await expect(approve).toBeDisabled();
  expect(requestCount).toBe(0);

  await page.locator('[data-cloud-ai-consent-action="cancel"]').click();
  await page.waitForFunction(() => globalThis.__cloudConsentResult !== null);
  expect(await page.evaluate(() => globalThis.__cloudConsentResult)).toEqual({ granted: false });
  expect(requestCount).toBe(0);

  await page.evaluate(() => globalThis.__startCloudActivation());
  await expect(overlay).toBeVisible();
  await checkbox.check();
  await expect(approve).toBeEnabled();
  await approve.click();
  await page.waitForFunction(() => globalThis.__cloudConsentResult?.granted === true);
  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    globalThis.__cloudConsentResult = await api.callClaudeAPI({
      messages: [{ role: 'user', content: 'first automatic sensitive prompt' }],
      maxTokens: 16,
      forceNonStream: true,
      consentKind: 'automatic-insight',
    }).then(
      result => ({ ok: true, text: result.text }),
      error => ({ ok: false, name: error.name }),
    );
  });
  expect(requestCount).toBe(1);
  expect(await page.evaluate(() => globalThis.__cloudConsentResult)).toEqual({
    ok: true,
    text: 'approved response',
  });

  const approval = await page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem('labcharts-cloud-ai-consent'));
    return record.approvals.openrouter;
  });
  expect(approval).toMatchObject({
    accepted: true,
    provider: 'openrouter',
    recipient: 'OpenRouter',
    purpose: expect.stringContaining('automatic insights'),
  });
  expect(approval.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test('custom health checks can be retried before activation and decline stores no connection', async ({ page }) => {
  let healthRequestCount = 0;
  let failedHealthRequestCount = 0;
  await page.route('https://custom-health.example/v1/**', async route => {
    healthRequestCount += 1;
    if (route.request().url().endsWith('/models')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Synthetic compatibility probe received' } }),
    });
  });
  await page.route('https://bad-health.example/v1/**', async route => {
    failedHealthRequestCount += 1;
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'bad key' }) });
  });
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    localStorage.removeItem('labcharts-ai-transparency-acknowledgement');
    localStorage.removeItem('labcharts-cloud-ai-consent');
    localStorage.removeItem('labcharts-custom-url');
    document.body.insertAdjacentHTML('beforeend', `
      <div id="ai-provider-panel">
        <input id="custom-url-input" value="https://custom-health.example/v1">
        <input id="custom-key-input" value="test-key">
      </div>`);
    const panels = await import('/js/provider-panels.js');
    globalThis.__customConnectionPromise = panels.handleSaveCustomApi();
  });

  const overlay = page.locator('#cloud-ai-consent-overlay');
  await expect(overlay).toBeVisible();
  expect(healthRequestCount).toBe(2);
  await expect(overlay).toContainText('custom API at https://custom-health.example');
  await overlay.locator('[data-ai-processing-action="cancel"]').click();
  await page.evaluate(() => globalThis.__customConnectionPromise);

  expect(healthRequestCount).toBe(2);
  expect(await page.evaluate(() => localStorage.getItem('labcharts-custom-url'))).toBeNull();
  expect(await page.evaluate(async () => (await import('/js/api.js')).getCustomApiKey())).toBe('');

  await page.evaluate(async () => {
    document.getElementById('custom-url-input').value = 'https://bad-health.example/v1';
    globalThis.__customConnectionPromise = (await import('/js/provider-panels.js')).handleSaveCustomApi();
    await globalThis.__customConnectionPromise;
  });
  expect(failedHealthRequestCount).toBe(1);
  await expect(page.locator('#cloud-ai-consent-overlay')).toHaveCount(0);
  await expect(page.locator('#ai-transparency-overlay')).toHaveCount(0);
});

test('mobile consent keeps wheel and touch scrolling inside the dialog with reachable controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    localStorage.removeItem('labcharts-ai-transparency-acknowledgement');
    localStorage.removeItem('labcharts-cloud-ai-consent');
    const consent = await import('/js/cloud-ai-consent.js');
    globalThis.__mobileConsentPromise = consent.requestAIProviderActivation('openrouter');
  });

  const overlay = page.locator('#cloud-ai-consent-overlay');
  const modal = overlay.locator('.legal-consent-modal');
  await expect(overlay).toBeVisible();
  const initial = await modal.evaluate(element => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
    scrollTop: element.scrollTop,
    touchAction: getComputedStyle(element).touchAction,
  }));
  expect(initial.scrollHeight).toBeGreaterThan(initial.clientHeight);
  expect(initial.scrollWidth).toBeLessThanOrEqual(initial.clientWidth);
  expect(initial.scrollTop).toBe(0);
  expect(initial.touchAction).toBe('pan-y');

  await page.mouse.move(195, 430);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => modal.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop || 0)).toBe(0);
  await page.mouse.wheel(0, 1000);
  await page.mouse.wheel(0, 500);
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop || 0)).toBe(0);

  const checkbox = overlay.getByRole('checkbox');
  const cancel = overlay.getByRole('button', { name: 'Not now' });
  const approve = overlay.getByRole('button', { name: 'Allow & activate' });
  await expect(checkbox).toBeVisible();
  await expect(cancel).toBeVisible();
  await expect(approve).toBeVisible();
  expect((await cancel.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect((await approve.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const policyLinks = await overlay.locator('.cloud-ai-consent-links a').all();
  expect(policyLinks).toHaveLength(2);
  for (const link of policyLinks) {
    expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(32);
  }
  await checkbox.check();
  await expect(approve).toBeEnabled();
  await cancel.click();
  await page.evaluate(() => globalThis.__mobileConsentPromise);
});
