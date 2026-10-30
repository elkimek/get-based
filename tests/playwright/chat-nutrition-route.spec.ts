import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import { seedDashboardControlProfile, dashboardHealth } from '../helpers/dashboard-control-fixture.js';
import type { Page } from '@playwright/test';
const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; browserErrors.set(page, errors); page.on('pageerror', error => errors.push(error.message));
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?meal-route-original';export async function requestAIProcessingApproval(){return true;}export async function requireAIProcessingApproval(){}`);
  await page.route('https://**/*', async route => { if (route.request().url().includes('/chat/completions')) await route.fulfill({ json: { choices: [{ message: { content: 'Synthetic auxiliary response.' } }] } }); else await route.abort(); });
  await page.route('https://**/models*', route => route.fulfill({ json: { data: ['chat-vision', 'meal-vision'].map(id => ({ id, name: id === 'chat-vision' ? 'Chat vision' : 'Meal vision', type: 'text', input_modalities: ['text', 'image'], model_spec: { capabilities: { supportsVision: true } } })) } }));
  await seedDashboardControlProfile(page); await page.evaluate(async () => { const { state } = await import('/js/state.js'); state.currentThreadId = 'synthetic-meal-route-thread'; state.chatHistory = []; });
});
test.afterEach(async ({ page }) => { expect(browserErrors.get(page) || []).toEqual([]); });
async function configure(page: Page, provider: 'custom' | 'venice' = 'custom') { await page.evaluate(async provider => {
  const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://meal-route-provider.example/v1', 'synthetic-private-custom-key'); api.setCustomApiModel('chat-vision');
  localStorage.setItem('labcharts-custom-models', '[{"id":"chat-vision","name":"Chat vision"},{"id":"meal-vision","name":"Meal vision"}]'); localStorage.setItem('labcharts-custom-vision-models', '["chat-vision","meal-vision"]');
  if (provider === 'venice') { await api.saveVeniceKey('synthetic-private-venice-key'); api.setVeniceModel('chat-vision'); api.setVeniceE2EE(false); localStorage.setItem('labcharts-venice-models', '[{"id":"chat-vision","name":"Chat vision"}]'); localStorage.setItem('labcharts-venice-vision-models', '["chat-vision"]'); }
  api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
}, provider); }
const raw = (page: Page) => page.evaluate(async () => (await import('/js/nutrition-ai-route-store.js')).readNutritionAIRouteRaw());
test('the actual meal editor can recover an unavailable explicit model by selecting an available Automatic route', async ({ page }) => { await configure(page); await page.evaluate(async () => { (await import('/js/nutrition-ai-settings.js')).setNutritionAIRoute({ provider: 'custom', model: 'unavailable-old-model' }); await (await import('/js/nutrition-context.js')).loadNutritionFeature(); await (await import('/js/nutrition.js')).openNutritionEditor({ mode: 'manual' }); }); await page.getByRole('tab', { name: 'Photo', exact: true }).click(); const health = await dashboardHealth(page), picker = page.locator('[data-nutrition-model-route]'); await expect(picker.locator('option[value=""]')).toBeEnabled(); await picker.selectOption(''); await expect.poll(() => raw(page)).toBeNull(); await expect(picker).toHaveValue(''); expect(await dashboardHealth(page)).toBe(health); });
