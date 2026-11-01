import { expect, test } from './coverage-fixture.js';

test('native controls share browser preference locks and preserve newer values across tabs', async ({ page, context }) => {
  await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
  await page.goto('/app');
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); api.setAIProvider('venice'); api.setVeniceE2EE(false); api.setVeniceModel('plain-fixture');
    (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
    await (await import('/js/assistant-preferences.js')).commitAssistantPreferences({ paused: false, webSearch: false });
  });
  const second = await context.newPage(); await second.goto('/app');
  const before = await second.evaluate(async () => (await import('/js/assistant-preferences.js')).readAssistantPreferences());
  await page.evaluate(async () => { await (await import('/js/chat-panel.js')).setChatWebSearchEnabled(true); });
  expect(await second.evaluate(async before => {
    try { await (await import('/js/assistant-preferences.js')).commitAssistantPreferences({ webSearch: false }, { expected: { webSearch: before.webSearch }, requireLocks: true }); return false; }
    catch { return (await import('/js/assistant-preferences.js')).readAssistantPreferences().webSearch; }
  }, before)).toBe(true);
  await page.evaluate(async () => { await (await import('/js/ai-settings-actions.js')).setAiSettingsEnabled(false, () => {}); });
  expect(await second.evaluate(async before => {
    try { await (await import('/js/assistant-preferences.js')).commitAssistantPreferences({ paused: false }, { expected: { paused: before.paused }, requireLocks: true }); return false; }
    catch { return (await import('/js/assistant-preferences.js')).readAssistantPreferences().paused; }
  }, before)).toBe(true);
  await second.close();
});
