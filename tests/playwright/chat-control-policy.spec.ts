import { expect, test } from './coverage-fixture.js';
import { seedDashboardControlProfile, dashboardHealth } from '../helpers/dashboard-control-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';

const retired = [
  { name: 'ordering read', tool: 'getbased_read_app', arguments: { action: 'labs.ordering' } },
  { name: 'privacy review', tool: 'getbased_request_app', arguments: { action: 'context.preferences', snapshotId: 'old', parameters: '{"sources":{"wearables":true}}', reason: 'Requested', evidence: 'Manage my settings for me.' } },
  { name: 'AI preference', tool: 'getbased_read_app', arguments: { action: 'assistant.preferences' } },
  { name: 'Dashboard layout', tool: 'getbased_navigate', arguments: { view: 'dashboard', snapshotId: 'old', dashboard: '{"hide":["wearables"]}' } },
  { name: 'meal route', tool: 'getbased_navigate', arguments: { view: 'aiSettings', snapshotId: 'old', mealRoute: 'old-choice' } },
  { name: 'clock preference', tool: 'getbased_request_app', arguments: { action: 'display.preferences', snapshotId: 'old', parameters: '{"timeFormat":"12h","unitSystem":"US"}', reason: 'Requested', evidence: 'Manage my settings for me.' } },
  { name: 'category layout', tool: 'getbased_navigate', arguments: { view: 'category', category: 'biochemistry', layout: 'table' } },
];
for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const request of retired) test('native-only controls: ' + provider + ' ' + protocol + ' rejects ' + request.name, async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await context.route('https://**/*', route => route.abort());
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?persona-retirement-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  let round = 0, rejected = false;
  const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://curated-policy.example/v1/chat/completions';
  await page.route(endpoint, async route => {
    const body = route.request().postDataJSON();
    if (body.tools) expect(JSON.stringify(body.tools)).not.toMatch(/labs\.ordering|context\.preferences|assistant\.preferences|dashboard\.presentation|nutrition\.route/);
    if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported by this model' } }) }); return; }
    const call = round === 0 ? { id: 'retired-persona-request', type: 'function', function: { name: request.tool, arguments: JSON.stringify(request.arguments) } } : null;
    if (!call) {
      const last = body.messages.at(-1);
      const output = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
      expect(output.success).toBe(false); expect(JSON.stringify(output)).not.toMatch(/PRIVATE_PERSONA_|PRIVATE_OTHER_/); rejected = true;
    }
    round++;
    const reply = 'Use native Settings and editors for these changes.';
    if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: call ? 'tool_calls' : 'stop' }] }) });
    else await route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n' });
  });
  await seedDashboardControlProfile(page);
  const health = await dashboardHealth(page);
  const before = await page.evaluate(async provider => {
    const api = await import('/js/api.js');
    if (provider === 'venice') { await api.saveVeniceKey('synthetic-retirement-key'); api.setVeniceModel('glm-fixture'); api.setVeniceE2EE(false); }
    else { await api.saveCustomApiConnection('https://curated-policy.example/v1', 'synthetic-retirement-key'); api.setCustomApiModel('fixture'); }
    api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js'), crypto = await import('/js/crypto.js'), storage = await import('/js/chat-personality-storage.js');
    const key = storage.customPersonalityStorageKey(state.currentProfile), deleted = storage.customPersonalityTombstoneStorageKey(state.currentProfile);
    await crypto.encryptedSetItem(key, JSON.stringify([{ id: 'custom_private', name: 'PRIVATE_PERSONA_NAME', promptText: 'PRIVATE_PERSONA_INSTRUCTIONS', opaque: { keep: true } }]));
    await crypto.encryptedSetItem(deleted, '{"custom_previous":100}');
    return { key, deleted, profile: state.currentProfile, catalog: localStorage.getItem(key), tombstones: localStorage.getItem(deleted), selected: state.currentChatPersonality, preference: localStorage.getItem('labcharts-' + state.currentProfile + '-chatPersonality') };
  }, provider);
  await page.locator('#chat-input').fill('Manage my settings for me.'); await page.locator('#chat-send-btn').click();
  await expect(page.locator('#chat-send-btn.streaming')).toHaveCount(0);
  if(request.tool === 'getbased_navigate') {
    await expect.poll(() => rejected).toBe(true);
    await expect(page.locator('#chat-messages')).toContainText('Use native Settings and editors');
    expect(round).toBe(2);
  } else {
    await expect(page.locator('#chat-messages')).toContainText("I couldn't complete this response. Check your provider connection and try again.");
    expect(await page.evaluate(async () => (await import('/js/state.js')).state.chatHistory.at(-1))).toMatchObject({error:true,errorDetail:'The model returned a duplicate or unavailable tool call.'});
    expect(round).toBe(1); expect(rejected).toBe(false);
  }
  await expect(page.locator('.chat-app-control,#chat-personality-editor-overlay,#confirm-dialog-overlay')).toHaveCount(0);
  const after = await page.evaluate(async before => { const { state } = await import('/js/state.js'); return { catalog: localStorage.getItem(before.key), tombstones: localStorage.getItem(before.deleted), selected: state.currentChatPersonality, preference: localStorage.getItem('labcharts-' + before.profile + '-chatPersonality') }; }, before);
  expect(after).toEqual({ catalog: before.catalog, tombstones: before.tombstones, selected: before.selected, preference: before.preference });
  expect(await dashboardHealth(page)).toBe(health); expect(errors).toEqual([]);
});
