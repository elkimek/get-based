import { expect, test } from './coverage-fixture.js';
import { AGENT_HOST_CAPABILITY_LIST, AGENT_HOST_PROTOCOL_VERSION } from '../../shared/agent-host-protocol.js';
import { AGENT_TOOL_CONTRACT_VERSION } from '../../shared/agent-tool-contract.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import { CHAT_PROPOSAL_REPAIR } from '../../shared/chat-tool-instructions.js';

test('a fresh OpenCode repair retains the user request and produces a real reviewed goal', async ({ page }) => {
  const prompt = 'I want to improve my sleep. Please prepare a proposal for my review.', token = 'synthetic-opencode-repair-token';
  const turns: Array<{ agent: string; prompt: string; instructions: string }> = [];
  let snapshotId = '';
  const descriptor = { service: 'getbased-agent-host', endpoint: 'http://127.0.0.1:8324', token, protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
    capabilities: AGENT_HOST_CAPABILITY_LIST, toolContractVersion: AGENT_TOOL_CONTRACT_VERSION, agents: [{ id: 'opencode', name: 'OpenCode', status: 'available', compatible: true }] };
  await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); if (localStorage.getItem('labcharts-ai-paused') === null) localStorage.setItem('labcharts-ai-paused', 'false'); });
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?opencode-repair-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  await page.route('**/api/local-agents*', route => route.fulfill({ json: { agents: [] } }));
  await page.route('**/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/v1/turns') {
      const turn = request.postDataJSON() as { agent: string; prompt: string; instructions: string }; turns.push(turn);
      expect(turn.agent).toBe('opencode'); expect(turn.prompt).toBe(prompt); expect(request.headers().authorization).toBe(`Bearer ${token}`);
      if (turns.length === 2) { expect(turn.instructions).toContain(CHAT_PROPOSAL_REPAIR); expect(snapshotId).not.toBe(''); }
      else expect(turn.instructions).not.toContain(CHAT_PROPOSAL_REPAIR);
      const tool = turns.length === 1
        ? { type: 'tool_call', responseId: 'repair-read', tool: 'getbased_read_context_card', arguments: { card: 'healthGoals' } }
        : { type: 'tool_call', responseId: 'repair-draft', tool: 'getbased_draft_context', arguments: { card: 'healthGoals', snapshotId, changes: [{ field: 'goals', operation: 'add', record: { text: 'Improve sleep' } }], reason: 'Explicit reported health goal.', evidence: prompt } };
      await route.fulfill({ contentType: 'application/x-ndjson', body: [
        { type: 'session', threadId: `fresh-opencode-${turns.length}`, model: 'synthetic-model' }, tool,
        { type: 'text_delta', delta: turns.length === 1 ? "I've prepared a draft for your getbased card." : 'Review the proposed goal.' }, { type: 'done', finishReason: 'stop' },
      ].map(event => JSON.stringify(event)).join('\n') + '\n' });
    } else if (path.startsWith('/v1/responses/')) {
      const receipt = request.postDataJSON() as { success: boolean; contentItems: Array<{ text: string }> }; expect(receipt.success).toBe(true);
      if (path.endsWith('/repair-read')) snapshotId = (JSON.parse(receipt.contentItems[0]!.text) as { snapshotId: string }).snapshotId;
      await route.fulfill({ json: { ok: true } });
    } else if (path === '/v1/models') await route.fulfill({ json: { models: [{ id: 'synthetic-model', inputModalities: ['text'], isDefault: true }] } });
    else if (path === '/v1/targets') await route.fulfill({ json: { targets: [{ id: 'local', label: 'Local CLI', status: 'available' }] } });
    else await route.fulfill({ json: descriptor });
  });
  await page.goto('/app');
  const before = await page.evaluate(async () => {
    const [{ state }, profile, settings] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/agent-chat-settings.js')]);
    const id = await profile.createProfile('OpenCode repair fixture', { sex: 'male', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
    for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1');
    await profile.switchProfile(id); (await import('/js/views.js')).navigate('labs');
    state.importedData.healthGoals = []; state.importedData.contextNotes = 'Retain unrelated health context';
    (await import('/js/context-source-registry.js')).setContextSourceEnabled('insight-cards', true);
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Could not seed repair profile');
    await settings.saveAgentChatSettings({ agent: 'opencode', endpoint: 'http://127.0.0.1:8324', token: 'synthetic-opencode-repair-token', model: 'synthetic-model' });
    (await import('/js/api-provider-storage.js')).setAIProvider('codex-agent');
    (await import('/js/agent-model-catalog.js')).cacheAgentModelCatalog([{ id: 'synthetic-model', inputModalities: ['text'], isDefault: true }], 'opencode'); settings.setChatBackend('codex');
    (await import('/js/changelog.js')).closeChangelog();
    await (await import('/js/chat-loader.js')).openChatPanel();
    return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported')))!) as Record<string, unknown>;
  });
  await page.locator('#chat-input').fill(prompt); await page.locator('#chat-send-btn').click();
  const card = page.locator('.chat-agent-draft-pending'); await expect(card).toHaveCount(1); await expect(card).toContainText('Improve sleep');
  await expect.poll(() => page.evaluate(() => import('/js/chat-send.js').then(module => module.isChatStreaming()))).toBe(false); expect(turns).toHaveLength(2);
  const saved = () => page.evaluate(async () => { const { state } = await import('/js/state.js'); return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!) as Record<string, unknown>; });
  expect(await saved()).toEqual(before);
  await card.getByRole('button', { name: 'Apply', exact: true }).click(); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(1);
  expect((await saved()).healthGoals).toMatchObject([{ text: 'Improve sleep' }]); expect((await saved()).contextNotes).toBe(before.contextNotes);
  await page.evaluate(() => localStorage.setItem('labcharts-ai-paused', 'true')); await page.reload();
  expect((await saved()).healthGoals).toMatchObject([{ text: 'Improve sleep' }]); expect(turns).toHaveLength(2);
});

test('chat sends through the companion, executes a real marker tool, and persists an edited retry after reload', async ({ page }) => {
  const turns: {prompt: unknown; tools: {name?: unknown}[]}[] = [];
  const receipts: {success?: unknown; contentItems: {text: string}[]}[] = [];
  const token = 'synthetic-workflow-token';
  const companion = {
    service: 'getbased-agent-host', endpoint: 'http://127.0.0.1:8324', token,
    protocolVersion: AGENT_HOST_PROTOCOL_VERSION, capabilities: AGENT_HOST_CAPABILITY_LIST,
    toolContractVersion: AGENT_TOOL_CONTRACT_VERSION,
    agents: [{ id: 'codex', name: 'Codex CLI', status: 'available', compatible: true }],
  };
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    if (localStorage.getItem('labcharts-ai-paused') === null) localStorage.setItem('labcharts-ai-paused', 'false');
  });
  await page.route('**/api/local-agents*', route => route.fulfill({ json: { agents: [] } }));
  await page.route('**/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/v1/turns') {
      turns.push(request.postDataJSON());
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      await route.fulfill({ contentType: 'application/x-ndjson', body: [
        { type: 'session', threadId: 'synthetic-agent-session', model: 'synthetic-model' },
        { type: 'tool_call', responseId: 'marker-history', tool: 'getbased_marker_history', arguments: { marker: 'biochemistry.glucose' } },
        { type: 'text_delta', delta: 'Your saved glucose result is 5.8 mmol/l.' },
        { type: 'done', finishReason: 'stop' },
      ].map(event => JSON.stringify(event)).join('\n') + '\n' });
    } else if (path === '/v1/responses/marker-history') {
      receipts.push(request.postDataJSON());
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      await route.fulfill({ json: { ok: true } });
    } else if (path === '/v1/models') await route.fulfill({ json: { models: [{ id: 'synthetic-model', inputModalities: ['text'], isDefault: true }] } });
    else if (path === '/v1/targets') await route.fulfill({ json: { targets: [{ id: 'local', label: 'Local CLI', status: 'available' }] } });
    else await route.fulfill({ json: companion });
  });
  await page.goto('/app');
  await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).loadChatModule();
    const { state } = await import('/js/state.js');
    const profile = await import('/js/profile.js');
    await profile.renameProfile(state.currentProfile, 'Workflow fixture');
    await profile.setProfileSex(state.currentProfile, 'male');
    state.profileSex = profile.getProfileSex(state.currentProfile);
    localStorage.setItem(`labcharts-onboard-extras-done-${state.currentProfile}`, '1');
    localStorage.setItem(`labcharts-onboard-context-cards-skipped-${state.currentProfile}`, '1');
    state.importedData.entries = [{ date: '2026-09-01', markers: { 'biochemistry.glucose': 5.8 } }];
    await (await import('/js/data.js')).saveImportedData();
    const settings = await import('/js/agent-chat-settings.js');
    await settings.saveAgentChatSettings({ agent: 'codex', endpoint: 'http://127.0.0.1:8324', token: 'synthetic-workflow-token', model: 'synthetic-model' });
    (await import('/js/api-provider-storage.js')).setAIProvider('codex-agent');
    (await import('/js/agent-model-catalog.js')).cacheAgentModelCatalog([{ id: 'synthetic-model', inputModalities: ['text'], isDefault: true }], 'codex');
    settings.setChatBackend('codex');
    (await import('/js/changelog.js')).closeChangelog();
  });
  await page.evaluate(async () => (await import('/js/chat-panel.js')).openChatPanel());
  await page.locator('#chat-input').fill('Read my saved glucose result.');
  await page.locator('#chat-send-btn').click();
  const consent = page.locator('#cloud-ai-consent-overlay');
  await consent.locator('input[type=checkbox]').check();
  await consent.getByRole('button', { name: 'Approve & send' }).click();
  await expect(page.locator('#chat-messages')).toContainText('Your saved glucose result is 5.8 mmol/l.');
  await expect.poll(() => receipts.length).toBe(1);
  expect(turns).toHaveLength(1);
  expect(turns[0]!.prompt).toContain('Read my saved glucose result.');
  expect(turns[0]!.tools.some(tool => tool.name === 'getbased_marker_history')).toBe(true);
  expect(receipts[0]!.success).toBe(true);
  const history = JSON.parse(receipts[0]!.contentItems[0]!.text);
  expect(history).toMatchObject({ available: true, values: [{ date: '2026-09-01', value: 5.8, unit: 'mmol/l' }] });
  await expect.poll(() => page.evaluate(async () => (await import('/js/chat-send.js')).isChatStreaming())).toBe(false);
  await page.locator('#chat-msg-0 [data-chat-message-action=edit-user-message]').click();
  await page.locator('#chat-message-edit-input').fill('Please read my latest saved glucose.');
  await page.locator('[data-chat-message-action=submit-message-edit]').click();
  await expect.poll(() => receipts.length).toBe(2);
  await expect.poll(() => page.evaluate(async () => (await import('/js/chat-send.js')).isChatStreaming())).toBe(false);
  expect(turns).toHaveLength(2);
  expect(turns[1]!.prompt).toBe('Please read my latest saved glucose.');
  const threadId = await page.evaluate(async () => (await import('/js/state.js')).state.currentThreadId);
  // The persisted-chat assertion must not start background AI refreshes.
  await page.evaluate(() => localStorage.setItem('labcharts-ai-paused', 'true'));
  await page.reload();
  await page.evaluate(async threadId => {
    await (await import('/js/chat-loader.js')).loadChatModule();
    await (await import('/js/chat-panel.js')).openChatPanel();
    await (await import('/js/chat-threads.js')).switchToThread(threadId!);
  }, threadId);
  await expect(page.locator('#chat-messages')).toContainText('Please read my latest saved glucose.');
  await expect(page.locator('#chat-messages')).not.toContainText('Read my saved glucose result.');
  await expect(page.locator('#chat-messages')).toContainText('Your saved glucose result is 5.8 mmol/l.');
  expect(turns).toHaveLength(2);
});

test('native model selection starts a fresh CLI session with retained transcript, then resumes the matching model', async ({ page }) => {
  await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
  const turns: Array<{ model: string; effort?: string; threadId?: string; history?: Array<{ role: string; content: string }> }> = [];
  const models = ['model-a', 'model-b'].map(id => ({ id, displayName: id, inputModalities: ['text'], isDefault: id === 'model-a', supportedReasoningEfforts: ['low', 'high'].map(reasoningEffort => ({ reasoningEffort, description: '' })) }));
  const companion = { service: 'getbased-agent-host', endpoint: 'http://127.0.0.1:8324', token: 'synthetic-model-session-token',
    protocolVersion: AGENT_HOST_PROTOCOL_VERSION, capabilities: AGENT_HOST_CAPABILITY_LIST, toolContractVersion: AGENT_TOOL_CONTRACT_VERSION,
    agents: [{ id: 'codex', name: 'Codex CLI', status: 'available', compatible: true }] };
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?model-session-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  await page.route('**/api/local-agents*', route => route.fulfill({ json: { agents: [] } }));
  await page.route('**/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/v1/turns') {
      const turn = request.postDataJSON(); turns.push(turn);
      await route.fulfill({ contentType: 'application/x-ndjson', body: [
        { type: 'session', threadId: `native-${turn.model}`, model: turn.model },
        { type: 'text_delta', delta: `Reply from ${turn.model}.` }, { type: 'done', finishReason: 'stop' },
      ].map(value => JSON.stringify(value)).join('\n') + '\n' });
    } else if (path === '/v1/models') await route.fulfill({ json: { models } });
    else if (path === '/v1/targets') await route.fulfill({ json: { targets: [{ id: 'local', label: 'Local CLI', status: 'available' }] } });
    else await route.fulfill({ json: companion });
  });
  await page.goto('/app');
  await page.evaluate(async models => {
    const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic CLI model session', { sex: 'female', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed');
    for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1');
    await profiles.switchProfile(id); const settings = await import('/js/agent-chat-settings.js');
    await settings.saveAgentChatSettings({ agent: 'codex', endpoint: 'http://127.0.0.1:8324', token: 'synthetic-model-session-token', model: 'model-a' });
    (await import('/js/agent-model-catalog.js')).cacheAgentModelCatalog(models, 'codex'); settings.setChatBackend('codex');
    (await import('/js/api.js')).setAIPaused(false); await (await import('/js/chat-loader.js')).openChatPanel();
  }, models);
  await page.locator('#chat-input').fill('Hello Alpha.'); await page.locator('#chat-send-btn').click();
  await expect(page.locator('#chat-messages')).toContainText('Reply from model-a.');
  await expect.poll(() => page.evaluate(async () => (await import('/js/chat-send.js')).isChatStreaming())).toBe(false);
  await page.locator('#chat-model-menu summary').click(); await page.locator('[data-chat-model-value="model-b"]').click();
  await expect(page.locator('#chat-model-menu-label')).toHaveText('model-b');
  await page.locator('#chat-model-menu summary').click();
  await page.locator('#chat-model-effort').focus(); await page.locator('#chat-model-effort').press('End');
  await expect.poll(() => page.evaluate(async () => (await import('/js/assistant-selection.js')).readAssistantSelection().effort)).toBe('high');
  await expect(page.locator('#chat-model-effort-value')).toHaveText('High');
  await page.locator('#chat-model-menu summary').click();
  await page.locator('#chat-input').fill('Hello Beta.'); await page.locator('#chat-send-btn').click();
  await expect(page.locator('#chat-messages')).toContainText('Reply from model-b.');
  await expect.poll(() => page.evaluate(async () => (await import('/js/chat-send.js')).isChatStreaming())).toBe(false);
  await page.locator('#chat-input').fill('Continue Beta.'); await page.locator('#chat-send-btn').click();
  await expect.poll(() => turns.length).toBe(3); await expect.poll(() => page.evaluate(async () => (await import('/js/chat-send.js')).isChatStreaming())).toBe(false);
  expect(turns.map(turn => turn.model)).toEqual(['model-a', 'model-b', 'model-b']);
  expect(turns[1]!.effort).toBe('high'); expect(turns[2]!.effort).toBe('high');
  expect(turns[1]!.threadId).toBeUndefined(); expect(turns[2]!.threadId).toBe('native-model-b');
  expect(turns[1]!.history).toContainEqual({ role: 'user', content: 'Hello Alpha.' });
  expect(turns[1]!.history).toContainEqual({ role: 'assistant', content: 'Reply from model-a.' });
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.chatHistory.filter(message => message.role === 'assistant').map(message => message.modelId))).toEqual(['model-a', 'model-b', 'model-b']);
});
