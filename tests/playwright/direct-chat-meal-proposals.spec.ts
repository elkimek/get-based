import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

for (const protocol of ['native', 'structured'] as const) test(`direct ${protocol} meal tools log water after approval and retain its result after reload`, async ({ page }) => {
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?meal-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  let round = 0, feedback = false;
  await page.route('https://synthetic-meal-provider.example/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
    let call: AIToolCall | undefined;
    if (round === 0) call = { id: 'read-meal', type: 'function', function: { name: 'getbased_read_data', arguments: '{"resource":"meals","create":true}' } };
    if (round === 1) {
      const last = body.messages.at(-1), result = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
      expect(result.success).toBe(true); const snapshot = JSON.parse(result.contentItems[0].text);
      call = { id: 'draft-water', type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'meals', operation: 'add', snapshotId: snapshot.snapshotId, patch: JSON.stringify({ drink: { kind: 'water', amountMl: 350 } }), evidence: 'I drank 350 mL of water now.', reason: 'An explicitly reported drink.' }) } };
    }
    if (round === 3) feedback = body.messages[0].content.includes('"resource":"meals"') && body.messages[0].content.includes('"status":"applied"');
    round++;
    const reply = round > 3 ? 'Your saved drink is in the record.' : 'Please review the drink.';
    if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
    else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  await page.goto('/app');
  await page.evaluate(async () => {
    const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic direct meal profile', { sex: 'male', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
    localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1');
    await profile.switchProfile(id);
    const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://synthetic-meal-provider.example/v1', 'synthetic-key');
    api.setCustomApiModel('synthetic'); api.setAIProvider('custom'); api.setAIPaused(false);
    (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
  });
  await page.locator('#chat-input').fill('I drank 350 mL of water now.'); await page.locator('#chat-send-btn').click();
  const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText('Meals & Drinks'); await expect(card).toContainText('Beverage volume: 350 mL');
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.nutritionMeals || [])).toEqual([]);
  await card.locator('[data-chat-message-action="apply-agent-draft"]').click(); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(1);
  await expect(page.locator('#main-content')).toContainText('Dashboard Overview');
  await expect(page.locator('#chat-input')).toBeVisible();
  await page.locator('#chat-input').fill('Thanks.'); await page.locator('#chat-send-btn').click(); await expect(page.locator('#chat-messages')).toContainText('Your saved drink is in the record.'); expect(feedback).toBe(true);
  await page.reload();
  await page.evaluate(async () => { await (await import('/js/nutrition-store.js')).hydrateNutritionSummary(); await (await import('/js/nutrition.js')).openNutritionHistory(); });
  await page.getByRole('button', { name: 'Open Water details', exact: true }).click();
  await expect(page.locator('#detail-modal')).toContainText('Water'); await expect(page.locator('#detail-modal')).toContainText('350');
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.nutritionMeals)).toEqual([expect.objectContaining({ name: 'Water', mealType: 'drink', nutrients: { fluidMl: 350, plainWaterMl: 350 } })]);
});
