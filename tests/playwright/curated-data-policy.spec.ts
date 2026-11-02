import { expect, test } from './coverage-fixture.js';
import { seedDashboardControlProfile, dashboardHealth } from '../helpers/dashboard-control-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';

const resources = ['knowledgeImports', 'knowledgeSettings', 'knowledgeLibraries', 'knowledgeDocuments', 'markerRanges', 'customMarkers', 'markerDisplay', 'labCategories', 'genome'] as const;
const retired = [
  ...resources.map(resource => ({ name: resource, calls: [
    { tool: 'getbased_read_data', arguments: { resource, recordId: 'former-record' } },
    { tool: 'getbased_draft_data', arguments: { resource, operation: 'remove', snapshotId: 'former-snapshot', patch: '{}', reason: 'Requested', evidence: 'Manage my settings for me.' } },
  ] })),
  ...['labReports', 'labSamples'].map(resource => ({ name: resource + ' whole-source removal', calls: [
    { tool: 'getbased_draft_data', arguments: { resource, operation: 'remove', snapshotId: 'former-snapshot', patch: '{}', reason: 'Requested', evidence: 'Manage my settings for me.' } },
  ] })),
];
for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const request of retired) test('native-only data: ' + provider + ' ' + protocol + ' rejects ' + request.name, async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await context.route('https://**/*', route => route.abort());
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?persona-retirement-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  let round = 0, rejected = false;
  const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://curated-data-policy.example/v1/chat/completions';
  await page.route(endpoint, async route => {
    const body = route.request().postDataJSON();
    if (body.tools) expect(JSON.stringify(body.tools)).not.toContain('getbased_read_knowledge');
    if (body.tools) for (const definition of body.tools) {
      const fn = definition.function || definition;
      if (['getbased_read_data', 'getbased_draft_data'].includes(fn.name)) {
        const choices = (fn.parameters || fn.inputSchema).properties.resource.enum;
        for (const resource of resources) expect(choices).not.toContain(resource);
      }
    }
    if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported by this model' } }) }); return; }
    if (round > 0) {
      const last = body.messages.at(-1), output = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
      expect(output.success).toBe(false); expect(JSON.stringify(output)).not.toMatch(/PRIVATE_PERSONA_|PRIVATE_OTHER_/); rejected = true;
    }
    const requested = request.calls[round], call = requested ? { id: 'retired-data-request-' + round, type: 'function', function: { name: requested.tool, arguments: JSON.stringify(requested.arguments) } } : null;
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
    else { await api.saveCustomApiConnection('https://curated-data-policy.example/v1', 'synthetic-retirement-key'); api.setCustomApiModel('fixture'); }
    api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js'), crypto = await import('/js/crypto.js'), storage = await import('/js/chat-personality-storage.js');
    const key = storage.customPersonalityStorageKey(state.currentProfile), deleted = storage.customPersonalityTombstoneStorageKey(state.currentProfile);
    await crypto.encryptedSetItem(key, JSON.stringify([{ id: 'custom_private', name: 'PRIVATE_PERSONA_NAME', promptText: 'PRIVATE_PERSONA_INSTRUCTIONS', opaque: { keep: true } }]));
    await crypto.encryptedSetItem(deleted, '{"custom_previous":100}');
    return { key, deleted, profile: state.currentProfile, catalog: localStorage.getItem(key), tombstones: localStorage.getItem(deleted), selected: state.currentChatPersonality, preference: localStorage.getItem('labcharts-' + state.currentProfile + '-chatPersonality') };
  }, provider);
  await page.locator('#chat-input').fill('Manage my settings for me.'); await page.locator('#chat-send-btn').click();
  await expect.poll(() => rejected && round === request.calls.length + 1).toBe(true);
  await expect(page.locator('#chat-messages')).toContainText('Use native Settings and editors');
  await expect(page.locator('.chat-app-control,#chat-personality-editor-overlay,#confirm-dialog-overlay')).toHaveCount(0);
  const after = await page.evaluate(async before => { const { state } = await import('/js/state.js'); return { catalog: localStorage.getItem(before.key), tombstones: localStorage.getItem(before.deleted), selected: state.currentChatPersonality, preference: localStorage.getItem('labcharts-' + before.profile + '-chatPersonality') }; }, before);
  expect(after).toEqual({ catalog: before.catalog, tombstones: before.tombstones, selected: before.selected, preference: before.preference });
  expect(await dashboardHealth(page)).toBe(health); expect(errors).toEqual([]);
});


test('historical data proposals survive save/reload as read-only cards without changing health data', async ({ page }) => {
  await page.route('https://**/*', route => route.abort()); await seedDashboardControlProfile(page); const health = await dashboardHealth(page);
  const saved = await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js');
    const payload = { resource: 'knowledgeLibraries', operation: 'remove', recordId: 'old-library', baseline: '{"private":"PRIVATE_OLD_SOURCE"}', patch: '{}', reason: 'Previous review', evidence: 'Previous request.', effectiveDate: '2026-10-29', recordedAt: Date.now() };
    state.chatHistory = ['pending', 'applied'].map((status, index) => ({ role: 'assistant' as const, content: 'Previous review ' + index, agentDrafts: [{ id: crypto.randomUUID(), kind: 'data', status, profileId: state.currentProfile, summary: 'Previous proposal', payload }] }));
    (await import('/js/chat-render.js')).renderChatMessages(); await (await import('/js/chat-history.js')).saveChatHistory();
    return JSON.stringify(payload);
  });
  await expect(page.locator('.chat-agent-draft')).toHaveCount(2); await expect(page.locator('.chat-agent-draft button')).toHaveCount(0);
  await page.reload(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); });
  await expect(page.locator('.chat-agent-draft')).toHaveCount(2); await expect(page.locator('.chat-agent-draft').first()).toContainText('Managed in native UI'); await expect(page.locator('.chat-agent-draft button')).toHaveCount(0);
  expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return JSON.stringify((state.chatHistory[0]?.agentDrafts?.[0] as { payload?: unknown })?.payload); })).toBe(saved);
  expect(await dashboardHealth(page)).toBe(health);
});
