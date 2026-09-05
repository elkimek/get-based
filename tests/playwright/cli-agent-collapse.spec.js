import { expect, test } from '@playwright/test';

test('active CLI options collapse by mouse and keyboard without deselecting the agent', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
    accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22',
    policyScope: 'self-hosted-notice', acceptedAt: '2026-09-05T00:00:00Z',
    appVersion: 'cli-collapse-test', location: 'cli-collapse-test',
  })));
  await page.route('**/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === '/v1/discovery' ? {
      service: 'getbased-agent-host', endpoint: 'http://127.0.0.1:8324', token: '1234567890123456',
      protocolVersion: 5, capabilities: ['chat-stream', 'model-catalog', 'execution-targets'],
      agents: [{ id: 'codex', name: 'Codex CLI', status: 'available', compatible: true }],
    } : path === '/v1/targets' ? { targets: [{ id: 'local', label: 'Local CLI', status: 'available' }] }
      : { models: [] };
    await route.fulfill({ json: data });
  });
  await page.route('**/api/local-agents*', route => route.fulfill({ json: { agents: [] } }));
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    window.endTour?.();
    for (const id of ['tour-overlay', 'tour-spotlight', 'tour-tooltip']) document.getElementById(id)?.remove();
    (await import('/js/api-provider-storage.js')).setAIProvider('codex-agent');
    (await import('/js/agent-chat-settings.js')).setChatBackend('codex');
    await (await import('/js/settings.js')).openSettingsModal('ai');
  });
  const header = page.locator('[data-settings-action="toggle-cli-agent-options"]');
  const options = page.locator('#cli-agent-options');
  const toggle = page.locator('[data-settings-action="toggle-cli-codex"][data-agent="codex"]');
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  await expect(options).toBeVisible();
  await header.click();
  await expect(options).toBeHidden();
  await expect(toggle).toBeChecked();
  await expect(page.locator('[data-settings-action="test-cli-codex"]')).toBeVisible();
  await page.evaluate(async () => (await import('/js/settings-cli-agent-panel.js')).refreshDetectedAgentList());
  await expect(options).toBeHidden();
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  await header.focus();
  await header.press('Enter');
  await expect(options).toBeVisible();
  await header.press('Space');
  await expect(options).toBeHidden();
  await expect(toggle).toBeChecked();
});
