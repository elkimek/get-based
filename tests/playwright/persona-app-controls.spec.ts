import { expect, test } from './coverage-fixture.js';
import { seedDashboardControlProfile, dashboardHealth } from '../helpers/dashboard-control-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import { CHAT_NATIVE_UI_NOTICE } from '../../shared/chat-control-policy.js';

const retired = [
  { name: 'directory', tool: 'getbased_read_app', arguments: { action: 'assistant.personas' } },
  { name: 'editor', tool: 'getbased_navigate', arguments: { view: 'personaEditor', snapshotId: 'stale', recordId: 'custom_private' } },
  { name: 'selection', tool: 'getbased_navigate', arguments: { view: 'chatPersona', snapshotId: 'stale', recordId: 'custom_private' } },
  { name: 'deletion', tool: 'getbased_navigate', arguments: { view: 'personaDelete', snapshotId: 'stale', recordId: 'custom_private' } },
];
for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const request of retired) test('manual-only personas: ' + provider + ' ' + protocol + ' rejects ' + request.name, async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await context.route('https://**/*', route => route.abort());
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?persona-retirement-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  let round = 0, rejected = false;
  const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://persona-retirement.example/v1/chat/completions';
  await page.route(endpoint, async route => {
    const body = route.request().postDataJSON();
    if (body.tools) expect(JSON.stringify(body.tools)).not.toMatch(/assistant\.personas|personaEditor|personaDelete|chatPersona|personaDraft/);
    if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported by this model' } }) }); return; }
    const call = round === 0 ? { id: 'retired-persona-request', type: 'function', function: { name: request.tool, arguments: JSON.stringify(request.arguments) } } : null;
    if (!call) {
      const last = body.messages.at(-1);
      const output = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
      expect(output.success).toBe(false); expect(JSON.stringify(output)).not.toMatch(/PRIVATE_PERSONA_|PRIVATE_OTHER_/); rejected = true;
    }
    round++;
    const reply = 'Use the persona picker and editor to manage personas manually.';
    if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: call ? 'tool_calls' : 'stop' }] }) });
    else await route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n' });
  });
  await seedDashboardControlProfile(page);
  const health = await dashboardHealth(page);
  const before = await page.evaluate(async provider => {
    const api = await import('/js/api.js');
    if (provider === 'venice') { await api.saveVeniceKey('synthetic-retirement-key'); api.setVeniceModel('glm-fixture'); api.setVeniceE2EE(false); }
    else { await api.saveCustomApiConnection('https://persona-retirement.example/v1', 'synthetic-retirement-key'); api.setCustomApiModel('fixture'); }
    api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js'), crypto = await import('/js/crypto.js'), storage = await import('/js/chat-personality-storage.js');
    const key = storage.customPersonalityStorageKey(state.currentProfile), deleted = storage.customPersonalityTombstoneStorageKey(state.currentProfile);
    await crypto.encryptedSetItem(key, JSON.stringify([{ id: 'custom_private', name: 'PRIVATE_PERSONA_NAME', promptText: 'PRIVATE_PERSONA_INSTRUCTIONS', opaque: { keep: true } }]));
    await crypto.encryptedSetItem(deleted, '{"custom_previous":100}');
    return { key, deleted, profile: state.currentProfile, catalog: localStorage.getItem(key), tombstones: localStorage.getItem(deleted), selected: state.currentChatPersonality, preference: localStorage.getItem('labcharts-' + state.currentProfile + '-chatPersonality') };
  }, provider);
  await page.locator('#chat-input').fill('Manage my custom persona for me.'); await page.locator('#chat-send-btn').click();
  if (request.name === 'directory') {
    // The removed tool name fails batch preflight before any tool dispatch or
    // follow-up request. Registered navigation calls receive a normal denial.
    await expect(page.locator('#chat-messages')).toContainText("I couldn't complete this response. Check your provider connection and try again.");
    expect(round).toBe(1); expect(rejected).toBe(false);
  } else {
    await expect.poll(() => rejected).toBe(true);
    await expect(page.locator('#chat-messages')).toContainText('Use the persona picker and editor');
  }
  await expect(page.locator('.chat-app-control,#chat-personality-editor-overlay,#confirm-dialog-overlay')).toHaveCount(0);
  const after = await page.evaluate(async before => { const { state } = await import('/js/state.js'); return { catalog: localStorage.getItem(before.key), tombstones: localStorage.getItem(before.deleted), selected: state.currentChatPersonality, preference: localStorage.getItem('labcharts-' + before.profile + '-chatPersonality') }; }, before);
  expect(after).toEqual({ catalog: before.catalog, tombstones: before.tombstones, selected: before.selected, preference: before.preference });
  expect(await dashboardHealth(page)).toBe(health); expect(errors).toEqual([]);
});

test('historical persona cards show manual guidance without Apply or Undo', async ({ page }) => {
  await page.route('https://**/*', route => route.abort()); await seedDashboardControlProfile(page);
  const before = await dashboardHealth(page);
  await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js');
    state.chatHistory = [{ role: 'assistant', content: 'Historical persona request', appControls: [{ version: 1, id: 'retired-card', profileId: state.currentProfile, threadId: state.currentThreadId!, action: 'assistant.persona', automatic: true, parameters: { personaId: 'custom_previous' }, baseline: { id: 'default', name: 'Default', icon: 'D' }, proposed: { id: 'custom_previous', name: 'Previous persona', icon: 'P' }, leaseId: 'retired-lease', status: 'changed', reason: 'Historical selection', evidence: 'Use my previous persona', undoAvailable: true }] }];
    (await import('/js/chat-render.js')).renderChatMessages();
  });
  await expect(page.locator('.chat-app-control')).toContainText(CHAT_NATIVE_UI_NOTICE);
  await expect(page.locator('.chat-app-control button')).toHaveCount(0);
  expect(await dashboardHealth(page)).toBe(before);
});
