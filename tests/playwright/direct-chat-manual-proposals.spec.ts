import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

for (const protocol of ['native', 'structured'] as const) test(`direct ${protocol} manual tools correct weight after approval and retain its result after reload`, async ({ page }) => {
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?manual-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  let round = 0, feedback = false;
  await page.route('https://synthetic-manual-provider.example/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
    let call: AIToolCall | undefined;
    if (round === 0) call = { id: 'read-manual', type: 'function', function: { name: 'getbased_read_data', arguments: '{"resource":"manualReadings","recordId":"weight.2026-10-20"}' } };
    if (round === 1) {
      const last = body.messages.at(-1), result = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
      expect(result.success).toBe(true); const snapshot = JSON.parse(result.contentItems[0].text);
      call = { id: 'draft-weight', type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'manualReadings', operation: 'update', snapshotId: snapshot.snapshotId, patch: JSON.stringify({ value: 81, unit: 'kg' }), evidence: 'My weight reading on October 20, 2026 was 81 kg, not 80 kg.', reason: 'An explicitly reported weight correction.' }) } };
    }
    if (round === 3) feedback = body.messages[0].content.includes('"resource":"manualReadings"') && body.messages[0].content.includes('"status":"applied"');
    round++;
    const reply = round > 3 ? 'Your saved measurement is in the record.' : 'Please review the measurement.';
    if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
    else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  await page.addInitScript(() => { for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
  await page.goto('/app');
  await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async () => {
    const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic direct manual profile', { sex: 'male', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
    localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1');
    await profile.switchProfile(id);
    await (await import('/js/wearables-manual.js')).logManualMetric(id, 'weight', { date: '2026-10-20', value: 80 });
    const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://synthetic-manual-provider.example/v1', 'synthetic-key');
    api.setCustomApiModel('synthetic'); api.setAIProvider('custom'); api.setAIPaused(false);
    (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
  });
  await page.locator('#chat-input').fill('My weight reading on October 20, 2026 was 81 kg, not 80 kg.'); await page.locator('#chat-send-btn').click();
  const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText('Manual Body Readings'); await expect(card).toContainText('81 kg');
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.manualBodyReadings!['weight.2026-10-20']!.value)).toBe(80);
  await card.locator('[data-chat-message-action="apply-agent-draft"]').click(); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(1);
  await expect(page.locator('#main-content')).toContainText('Dashboard Overview');
  await expect(page.locator('#chat-input')).toBeVisible();
  await page.locator('#chat-input').fill('Thanks.'); await page.locator('#chat-send-btn').click(); await expect(page.locator('#chat-messages')).toContainText('Your saved measurement is in the record.'); expect(feedback).toBe(true);
  await page.reload();
  await page.evaluate(async () => (await import('/js/wearables-detail-modal.js')).openWearableDetail('weight'));
  await expect(page.locator('.wearable-manual-entry[data-entry-date="2026-10-20"]')).toContainText('81');
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.manualBodyReadings!['weight.2026-10-20']!.value)).toBe(81);
});
