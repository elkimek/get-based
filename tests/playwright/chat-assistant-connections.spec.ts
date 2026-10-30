import { expect, test } from './coverage-fixture.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import { AGENT_HOST_CAPABILITY_LIST, AGENT_HOST_PROTOCOL_VERSION } from '../../shared/agent-host-protocol.js';
import { AGENT_TOOL_CONTRACT_VERSION } from '../../shared/agent-tool-contract.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';

for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'decline', 'discard', 'reload', 'apply-fail', 'unavailable', 'removed-model'] as const) {
  test(`assistant connection: ${protocol} ${decision} requires review and destination approval before changing the next request`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const message = 'Switch to Venice using venice-target with high reasoning effort for future replies.';
    await page.route('https://api.venice.ai/api/v1/models', route => route.fulfill(decision === 'unavailable' ? { status: 401, json: { error: 'PRIVATE_ERROR_FROM_PROVIDER' } } : { json: { data: decision === 'removed-model' ? [] : [{ id: 'venice-target', type: 'text' }] } }));
    await page.route('https://connection-source.example/v1/models', route => route.fulfill({ json: { data: [{ id: 'source-model' }] } }));
    let round = 0; const requests: Array<{ provider: string; model: string }> = [];
    for (const provider of ['custom', 'venice'] as const) await page.route(provider === 'custom' ? 'https://connection-source.example/v1/chat/completions' : 'https://api.venice.ai/api/v1/chat/completions', async route => {
      const body = route.request().postDataJSON();
      if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, json: { error: { message: 'tools not supported by this model' } } }); return; }
      requests.push({ provider, model: body.model });
      expect(provider).toBe(round < 5 || decision !== 'apply' ? 'custom' : 'venice');
      let call: AIToolCall | undefined;
      if (round === 0) call = { id: 'connections', type: 'function', function: { name: 'getbased_read_app', arguments: '{"action":"assistant.connections"}' } };
      if (round === 1) call = { id: 'models', type: 'function', function: { name: 'getbased_read_app', arguments: '{"action":"assistant.models","connectionId":"direct:venice"}' } };
      if (round === 2) call = { id: 'connection', type: 'function', function: { name: 'getbased_read_app', arguments: '{"action":"assistant.connection","connectionId":"direct:venice"}' } };
      if (round === 3) {
        const content = body.messages.at(-1).content;
        const result = protocol === 'native' ? JSON.parse(content) : JSON.parse(content.slice(content.indexOf('{"id":'))).output;
        expect(result.success).toBe(true); const snapshot = JSON.parse(result.contentItems[0].text);
        expect(JSON.stringify(snapshot)).not.toMatch(/SYNTHETIC_KEY|PRIVATE_HEALTH|leaseId|connection-source/);
        expect(snapshot.catalog.models.find((model: { id: string }) => model.id === 'venice-target').reasoningChoices).toContain('high');
        call = { id: 'review', type: 'function', function: { name: 'getbased_request_app', arguments: JSON.stringify({ action: 'assistant.connection', snapshotId: snapshot.snapshotId, parameters: '{"connectionId":"direct:venice","model":"venice-target","effort":"high"}', reason: 'Explicit connection preference', evidence: message }) } };
      }
      const reply = round++ < 5 ? 'The connection review is ready. Choose Apply when ready.' : `Next reply from ${provider}.`;
      if (protocol === 'structured') await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] } });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
    await page.goto('/app');
    const baseline = await page.evaluate(async () => {
      const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic connection review', { sex: 'female', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed');
      for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1');
      await profiles.switchProfile(id); const api = await import('/js/api.js');
      await api.saveCustomApiConnection('https://connection-source.example/v1', 'SYNTHETIC_KEY_SOURCE'); await api.saveVeniceKey('SYNTHETIC_KEY_TARGET');
      api.setVeniceE2EE(false); api.setCustomApiModel('source-model'); api.setVeniceModel('venice-target'); api.setAIProvider('custom'); api.setAIPaused(false);
      localStorage.setItem('labcharts-custom-models', JSON.stringify([{ id: 'source-model', name: 'Source model' }]));
      localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'venice-target', name: 'Venice Target', reasoning: { supported_efforts: ['low', 'high'] } }]));
      const consent = await import('/js/cloud-ai-consent.js'), scope = consent.cloudAIConsentDetails('custom').scope;
      localStorage.setItem(consent.AI_TRANSPARENCY_KEY, JSON.stringify({ version: consent.AI_TRANSPARENCY_VERSION, acknowledged: true }));
      localStorage.setItem(consent.CLOUD_AI_CONSENT_KEY, JSON.stringify({ version: consent.CLOUD_AI_CONSENT_VERSION, approvals: { [scope]: { accepted: true } } }));
      (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
      await (await import('/js/nutrition-store.js')).reconcileNutritionMealsFromProfileData(id);
      await (await import('/js/chat-loader.js')).openChatPanel();
      return await (await import('/js/crypto.js')).encryptedGetItem(profiles.profileStorageKey(id, 'imported'));
    });
    await page.locator('#chat-input').fill(message); await page.locator('#chat-send-btn').click();
    const card = page.locator('.chat-app-control'); await expect(card).toContainText('Assistant connection');
    await expect(card).toContainText('custom → venice'); await expect(card).toContainText('source-model → venice-target');
    expect(await page.evaluate(async () => (await import('/js/assistant-selection.js')).readAssistantSelection().provider)).toBe('custom');
    if (decision === 'reload') {
      await page.reload(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); });
      await expect(card).toContainText('Connection review expired'); await expect(card.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
    } else if (decision === 'discard') {
      await card.getByRole('button', { name: 'Discard', exact: true }).click(); await expect(card).toContainText('Discarded');
    } else {
      if (decision === 'apply-fail') await page.evaluate(() => { const set = Storage.prototype.setItem; let failed = false; Storage.prototype.setItem = function (key, value) { if (!failed && key === 'labcharts-ai-provider' && value === 'venice') { failed = true; throw new DOMException('Synthetic full storage', 'QuotaExceededError'); } return set.call(this, key, value); }; });
      await card.getByRole('button', { name: 'Apply', exact: true }).click();
      const overlay = page.locator('#cloud-ai-consent-overlay'); await expect(overlay).toBeVisible();
      await expect(overlay).toContainText('Selecting a connection sends no conversation content');
      expect(await page.evaluate(async () => (await import('/js/assistant-selection.js')).readAssistantSelection().provider)).toBe('custom');
      expect(requests).toHaveLength(5);
      if (decision === 'decline') await overlay.locator('[data-ai-processing-action="cancel"]').click();
      else { await overlay.locator('input[type="checkbox"]').check(); await overlay.getByRole('button', { name: 'Approve & select' }).click(); }
      await expect(card).toContainText(decision === 'apply' ? 'Assistant selection saved' : 'Nothing was applied');
    }
    await page.locator('#chat-input').fill('Thanks.'); await page.locator('#chat-send-btn').click();
    await expect(page.locator('#chat-messages')).toContainText(`Next reply from ${decision === 'apply' ? 'venice' : 'custom'}.`);
    expect(await page.evaluate(async () => (await import('/js/state.js')).state.chatHistory.filter(message => message.role === 'assistant').map(message => message.provider))).toEqual(['custom', decision === 'apply' ? 'venice' : 'custom']);
    if (decision === 'apply') {
      await card.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(card).toContainText('Previous assistant selection restored');
      expect(await page.evaluate(async () => (await import('/js/assistant-selection.js')).readAssistantSelection())).toMatchObject({ provider: 'custom', model: 'source-model', effort: '' });
    }
    await page.reload(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); });
    expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')); })).toBe(baseline);
    expect(errors).toEqual([]);
  });
}

test('connection commands start new CLI sessions across adapters, targets and an intervening API reply with retained history', async ({ page }) => {
  await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?route-sessions-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const turns: Array<{ agent: string; target: string; model: string; threadId?: string; history?: Array<{ role: string; content: string }> }> = [];
  const models = [{ id: 'shared-model', displayName: 'Shared model', inputModalities: ['text'], isDefault: true }];
  const companion = { service: 'getbased-agent-host', endpoint: 'http://127.0.0.1:8324', token: 'synthetic-route-session-token', protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
    capabilities: AGENT_HOST_CAPABILITY_LIST, toolContractVersion: AGENT_TOOL_CONTRACT_VERSION, agents: ['codex', 'hermes'].map(id => ({ id, status: 'available', compatible: true })) };
  await page.route('**/api/local-agents*', route => route.fulfill({ json: { agents: [] } }));
  await page.route('**/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/v1/turns') {
      const turn = route.request().postDataJSON(); turns.push(turn);
      await route.fulfill({ contentType: 'application/x-ndjson', body: [
        { type: 'session', threadId: `session-${turn.agent}-${turn.target}`, model: 'shared-model' },
        { type: 'text_delta', delta: `Reply ${turns.length} from ${turn.agent} ${turn.target}.` }, { type: 'done', finishReason: 'stop' },
      ].map(event => JSON.stringify(event)).join('\n') + '\n' });
    } else if (path === '/v1/models') await route.fulfill({ json: new URL(route.request().url()).hostname === 'route-sessions-api.example' ? { data: [{ id: 'api-model' }] } : { models } });
    else if (path === '/v1/targets') await route.fulfill({ json: { targets: [{ id: 'local', status: 'available' }, { id: 'gateway-home', status: 'available' }] } });
    else await route.fulfill({ json: companion });
  });
  await page.route('https://route-sessions-api.example/v1/chat/completions', route => route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content: 'Intervening API reply.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n` }));
  await page.goto('/app');
  const baseline = await page.evaluate(async models => {
    const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic route sessions', { sex: 'female', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed');
    for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1');
    await profiles.switchProfile(id); const api = await import('/js/api.js'), settings = await import('/js/agent-chat-settings.js');
    await api.saveCustomApiConnection('https://route-sessions-api.example/v1', 'synthetic-api-key'); api.setCustomApiModel('api-model'); api.setAIProvider('custom'); api.setAIPaused(false);
    localStorage.setItem('labcharts-custom-models', JSON.stringify([{ id: 'api-model', name: 'API Model' }]));
    await settings.saveAgentChatSettings({ endpoint: 'http://127.0.0.1:8324', token: 'synthetic-route-session-token', agent: 'codex', target: 'local', model: 'shared-model', effort: '' });
    (await import('/js/agent-model-catalog.js')).cacheAgentModelCatalog(models, 'codex'); settings.setChatBackend('codex');
    await (await import('/js/nutrition-store.js')).reconcileNutritionMealsFromProfileData(id); await (await import('/js/chat-loader.js')).openChatPanel();
    return await (await import('/js/crypto.js')).encryptedGetItem(profiles.profileStorageKey(id, 'imported'));
  }, models);
  const send = async (text: string) => { await page.locator('#chat-input').fill(text); await page.locator('#chat-send-btn').click(); await expect.poll(() => page.evaluate(async () => (await import('/js/chat-send.js')).isChatStreaming())).toBe(false); };
  const change = async (connectionId: string, model = 'shared-model') => page.evaluate(async ({ connectionId, model }) => {
    const owner = await import('/js/assistant-connections.js'), snapshot = await owner.captureAssistantConnection(connectionId);
    return owner.commitAssistantConnection(snapshot.leaseId, { connectionId, model, effort: '' }, { requireLocks: true });
  }, { connectionId, model });
  await send('Hello from Codex.'); await expect(page.locator('#chat-messages')).toContainText('Reply 1 from codex local.');
  await change('cli:hermes:local'); await send('Continue on Hermes.'); await expect(page.locator('#chat-messages')).toContainText('Reply 2 from hermes local.');
  await send('Stay on Hermes.'); await expect(page.locator('#chat-messages')).toContainText('Reply 3 from hermes local.');
  await change('cli:hermes:gateway-home'); await send('Continue at home.'); await expect(page.locator('#chat-messages')).toContainText('Reply 4 from hermes gateway-home.');
  await change('direct:custom', 'api-model'); await send('Hello from API.'); await expect(page.locator('#chat-messages')).toContainText('Intervening API reply.');
  await change('cli:hermes:gateway-home'); await send('Continue after API.'); await expect(page.locator('#chat-messages')).toContainText('Reply 5 from hermes gateway-home.');
  expect(turns.map(turn => turn.threadId)).toEqual([undefined, undefined, 'session-hermes-local', undefined, undefined]);
  expect(turns[1]!.history).toContainEqual({ role: 'user', content: 'Hello from Codex.' });
  expect(turns[4]!.history).toContainEqual({ role: 'assistant', content: 'Intervening API reply.' });
  const provenance = await page.evaluate(async () => (await import('/js/state.js')).state.chatHistory.filter(message => message.role === 'assistant').map(message => ({ agent: message.agentId, provider: message.provider, model: message.modelId })));
  expect(provenance.map(message => message.agent)).toEqual(['codex', 'hermes', 'hermes', 'hermes', '', 'hermes']);
  expect(provenance[4]).toMatchObject({ provider: 'custom', model: 'api-model' });
  await page.reload(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); });
  expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')); })).toBe(baseline);
  expect(errors).toEqual([]);
});

test('the setup handoff opens the native AI panel and refuses to replace an open editor', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('labcharts-ai-paused', 'true'); for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
  await page.goto('/app');
  const blocked = await page.evaluate(async () => {
    const editor = document.createElement('div'); editor.dataset.chatMessageEditorHost = ''; editor.innerHTML = '<textarea>Unsaved text</textarea>'; document.body.append(editor);
    const module = await import('/js/agent-tool-bindings.js'), result = await module.navigateFromAgent({ view: 'aiSettings', marker: '' });
    const retained = editor.querySelector('textarea')!.value; editor.remove(); return { result, retained };
  });
  expect(blocked.result).toMatchObject({ changed: false }); expect(blocked.retained).toBe('Unsaved text');
  const opened = await page.evaluate(async () => {
    const { state } = await import('/js/state.js'), { createAgentToolRuntime } = await import('/js/agent-tool-runtime.js'), { createBrowserAgentToolDependencies } = await import('/js/agent-tool-bindings.js');
    return createAgentToolRuntime({ readContext: () => '', ...createBrowserAgentToolDependencies(state.currentProfile) }).execute({ tool: 'getbased_navigate', arguments: { view: 'aiSettings' } });
  });
  expect(opened.success).toBe(true); expect(JSON.parse(opened.contentItems[0]!.text)).toMatchObject({ changed: true, opened: 'aiSettings', settingsSaved: false, credentialsEntered: false });
  await expect(page.locator('#settings-modal-overlay')).toBeVisible(); await expect(page.locator('#settings-tab-ai')).toBeVisible();
});
