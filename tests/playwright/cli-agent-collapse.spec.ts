import { expect, test } from '@playwright/test';
import {startTestCompanion} from '../pwa/cli-companion-fixture.js';

test('active CLI options collapse by mouse and keyboard without deselecting the agent', async ({ page, context, baseURL }) => {
  const companion = await startTestCompanion(baseURL!);
  try {
  await companion.restrictConnections(context);
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
    accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22',
    policyScope: 'self-hosted-notice', acceptedAt: '2026-09-05T00:00:00Z',
    appVersion: 'cli-collapse-test', location: 'cli-collapse-test',
    }));
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.addStyleTag({ url: '/css/settings.css' });
  await page.evaluate(async code => {
    (window as unknown as Window & {endTour?: typeof import('../../js/tour.js').endTour}).endTour?.();
    for (const id of ['tour-overlay', 'tour-spotlight', 'tour-tooltip']) document.getElementById(id)?.remove();
    (await import('/js/api-provider-storage.js')).setAIProvider('codex-agent');
    const settings = await import('/js/agent-chat-settings.js');
    await settings.pairLocalCompanion(code);
    const [codex] = await settings.discoverLocalChatAgents();
    await settings.saveAgentChatSettings({endpoint:codex!.endpoint,token:codex!.token,agent:'codex',target:'local',model:''});
    settings.setChatBackend('codex');
    await (await import('/js/settings.js')).openSettingsModal('ai');
  },companion.code);
  const header = page.locator('[data-settings-action="toggle-cli-agent-options"]');
  const options = page.locator('#cli-agent-options');
  const toggle = page.locator('[data-settings-action="toggle-cli-codex"][data-agent="codex"]');
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  await expect(options).toBeVisible();
  const dotLayout = await header.locator('.local-agent-state').evaluate(state => {
    const dot = state.querySelector('.local-agent-dot');
    const text = [...state.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent!.trim());
    const range = document.createRange();
    range.selectNode(text!);
    return { display: getComputedStyle(state).display, gap: range.getBoundingClientRect().left - dot!.getBoundingClientRect().right, width: dot!.getBoundingClientRect().width };
  });
  expect(dotLayout.display).toBe('flex');
  expect(dotLayout.gap).toBeGreaterThanOrEqual(5);
  expect(dotLayout.width).toBe(7);
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
  } finally { await companion.close(); }
});
