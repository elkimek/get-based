import { expect, test } from './coverage-fixture.js';
import { AGENT_HOST_CAPABILITY_LIST, AGENT_HOST_PROTOCOL_VERSION } from '../../shared/agent-host-protocol.js';

test('chat sends through the companion, executes a real marker tool, and persists an edited retry after reload', async ({ page }) => {
  const turns = [];
  const receipts = [];
  const token = 'synthetic-workflow-token';
  const companion = {
    service: 'getbased-agent-host', endpoint: 'http://127.0.0.1:8324', token,
    protocolVersion: AGENT_HOST_PROTOCOL_VERSION, capabilities: AGENT_HOST_CAPABILITY_LIST,
    agents: [{ id: 'codex', name: 'Codex CLI', status: 'available', compatible: true }],
  };
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-ai-paused', 'false');
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
  expect(turns[0].prompt).toContain('Read my saved glucose result.');
  expect(turns[0].tools.some(tool => tool.name === 'getbased_marker_history')).toBe(true);
  expect(receipts[0].success).toBe(true);
  const history = JSON.parse(receipts[0].contentItems[0].text);
  expect(history).toMatchObject({ available: true, values: [{ date: '2026-09-01', value: 5.8, unit: 'mmol/l' }] });
  await expect.poll(() => page.evaluate(async () => (await import('/js/chat-send.js')).isChatStreaming())).toBe(false);
  await page.locator('#chat-msg-0 [data-chat-message-action=edit-user-message]').click();
  await page.locator('#chat-message-edit-input').fill('Please read my latest saved glucose.');
  await page.locator('[data-chat-message-action=submit-message-edit]').click();
  await expect.poll(() => receipts.length).toBe(2);
  await expect.poll(() => page.evaluate(async () => (await import('/js/chat-send.js')).isChatStreaming())).toBe(false);
  expect(turns).toHaveLength(2);
  expect(turns[1].prompt).toBe('Please read my latest saved glucose.');
  const threadId = await page.evaluate(async () => (await import('/js/state.js')).state.currentThreadId);
  await page.reload();
  await page.evaluate(async threadId => {
    await (await import('/js/chat-loader.js')).loadChatModule();
    await (await import('/js/chat-panel.js')).openChatPanel();
    await (await import('/js/chat-threads.js')).switchToThread(threadId);
  }, threadId);
  await expect(page.locator('#chat-messages')).toContainText('Please read my latest saved glucose.');
  await expect(page.locator('#chat-messages')).not.toContainText('Read my saved glucose result.');
  await expect(page.locator('#chat-messages')).toContainText('Your saved glucose result is 5.8 mmol/l.');
  expect(turns).toHaveLength(2);
});
