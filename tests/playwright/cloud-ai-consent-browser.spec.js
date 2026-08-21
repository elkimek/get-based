import { expect, test } from './coverage-fixture.js';

test('first cloud prompt is held until provider-specific approval', async ({ page }) => {
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
    api.setAIProvider('openrouter');
    await api.saveOpenRouterKey('browser-owned-test-key');
    api.setOpenRouterModel('openai/gpt-4.1-mini');
    globalThis.__cloudConsentResult = null;
    globalThis.__startCloudConsentCall = () => {
      globalThis.__cloudConsentResult = null;
      globalThis.__cloudConsentPromise = api.callClaudeAPI({
        messages: [{ role: 'user', content: 'first sensitive prompt' }],
        maxTokens: 16,
        forceNonStream: true,
      }).then(
        result => { globalThis.__cloudConsentResult = { ok: true, text: result.text }; },
        error => { globalThis.__cloudConsentResult = { ok: false, name: error.name }; },
      );
    };
    globalThis.__startCloudConsentCall();
  });

  const overlay = page.locator('#cloud-ai-consent-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('OpenRouter');
  await expect(overlay).toContainText('directly from this browser');
  const checkbox = page.locator('#cloud-ai-consent-checkbox');
  const approve = page.locator('[data-cloud-ai-consent-action="approve"]');
  await expect(checkbox).not.toBeChecked();
  await expect(approve).toBeDisabled();
  expect(requestCount).toBe(0);

  await page.locator('[data-cloud-ai-consent-action="cancel"]').click();
  await page.waitForFunction(() => globalThis.__cloudConsentResult !== null);
  expect(await page.evaluate(() => globalThis.__cloudConsentResult)).toEqual({
    ok: false,
    name: 'CloudAIConsentDeclinedError',
  });
  expect(requestCount).toBe(0);

  await page.evaluate(() => globalThis.__startCloudConsentCall());
  await expect(overlay).toBeVisible();
  await checkbox.check();
  await expect(approve).toBeEnabled();
  await approve.click();
  await page.waitForFunction(() => globalThis.__cloudConsentResult?.ok === true);
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
  });
  expect(approval.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});
