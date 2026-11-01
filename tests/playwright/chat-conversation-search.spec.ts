import type { Page } from '@playwright/test';
import { expect, test } from './coverage-fixture.js';
import { seedDashboardControlProfile, dashboardHealth } from '../helpers/dashboard-control-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
const historical = 'Last month I wanted to improve my sleep by moving bedtime earlier.';
async function seedConversations(page: Page) {
  await seedDashboardControlProfile(page);
  return page.evaluate(async content => {
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js'), threads = await import('/js/chat-threads.js'), history = await import('/js/chat-history.js');
    threads.ensureActiveThread(); const source = state.chatThreads.find(thread => thread.id === state.currentThreadId)!; source.name = 'Earlier sleep conversation';
    state.chatHistory = [{ role: 'user', content }, { role: 'assistant', content: 'That was a historical discussion only.' }, { role: 'assistant', content: 'PRIVATE_HIDDEN_SLEEP', hidden: true }];
    if (!await history.saveChatHistory()) throw new Error('Synthetic source conversation did not save');
    const sourceKey = threads.getChatThreadKey(source.id), sourceRaw = localStorage.getItem(sourceKey);
    const origin = threads.createNewThread({ sync: false }); if (!origin) throw new Error('Synthetic origin conversation missing');
    await threads.saveChatThreadIndex({ sync: false }); if (!await history.saveChatHistory()) throw new Error('Synthetic origin conversation did not save');
    return { profile: state.currentProfile, source: source.id, sourceKey, sourceRaw, origin: origin.id };
  }, historical);
}
for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) test(`${provider} ${protocol} searches historical quotes and opens the exact native source only on a human click`, async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort());
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?conversation-search-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  const fixture = await seedConversations(page), health = await dashboardHealth(page);
  await page.evaluate(async provider => {
    const api = await import('/js/api.js');
    if (provider === 'venice') { await api.saveVeniceKey('synthetic-history-key'); api.setVeniceModel('glm-fixture'); api.setVeniceE2EE(false); }
    else { await api.saveCustomApiConnection('https://conversation-search.example/v1', 'synthetic-history-key'); api.setCustomApiModel('fixture'); }
    api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
  }, provider);
  let round = 0, sourceLink = '';
  await page.route(provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://conversation-search.example/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    if (protocol === 'structured' && body.tools) return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":{"message":"tools not supported by this model"}}' });
    expect(round).toBeLessThan(2);
    if (round > 0) {
      const last = body.messages.at(-1), output = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
      expect(output.success).toBe(true); const result = JSON.parse(output.contentItems[0].text);
      expect(result).toMatchObject({ action: 'conversations.search', dataSaved: false, settingsSaved: false }); expect(result.results).toHaveLength(1); expect(result.results[0].excerpt).toContain(historical);
      expect(JSON.stringify(result)).not.toContain('PRIVATE_HIDDEN_SLEEP'); sourceLink = result.results[0].sourceLink;
    }
    const call = round++ === 0 ? { id: 'search-prior', type: 'function', function: { name: 'getbased_search_conversations', arguments: '{"query":"sleep"}' } } : null;
    const reply = `You previously discussed moving bedtime earlier. [Open the earlier conversation](${sourceLink}). This is a historical quote, with no goal change.`;
    if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: call ? 'tool_calls' : 'stop' }] }) });
    else await route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n' });
  });
  await page.locator('#chat-input').fill('Find what I said about sleep in an earlier conversation. Keep saved goals and health unchanged.'); await page.locator('#chat-send-btn').click();
  const link = page.locator('#chat-messages a[data-chat-message-action="open-conversation-result"]'); await expect(link).toBeVisible(); expect(round).toBe(2);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.currentThreadId)).toBe(fixture.origin); expect(await dashboardHealth(page)).toBe(health);
  await expect(page.locator('#chat-messages')).toContainText('Prior conversations'); await expect(page.locator('[data-chat-agent-draft]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (await import('/js/chat-runtime.js')).isChatRuntimeStreaming())).toBe(false);
  const popups: string[] = []; page.on('popup', popup => popups.push(popup.url())); await link.click();
  await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.currentThreadId)).toBe(fixture.source);
  await expect(page.locator('#chat-msg-0')).toContainText(historical); await expect(page.locator('#chat-msg-0')).toHaveClass(/chat-msg-highlight/);
  expect(await page.evaluate(key => localStorage.getItem(key), fixture.sourceKey)).toBe(fixture.sourceRaw); expect(await dashboardHealth(page)).toBe(health); expect(popups).toEqual([]); expect(round).toBe(2);
});

for (const boundary of ['changed-source', 'forged-link'] as const) test(`native conversation source links refuse ${boundary} without switching or changing health`, async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort()); const fixture = await seedConversations(page), health = await dashboardHealth(page);
  const href = await page.evaluate(async boundary => {
    const { state } = await import('/js/state.js'); const tools = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', userMessage: 'Find my earlier sleep conversation.', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) });
    const response = await tools.execute({ tool: 'getbased_search_conversations', arguments: { query: 'sleep' } }); if (!response.success) throw new Error(response.contentItems[0]!.text); const result = JSON.parse(response.contentItems[0]!.text) as { results: { sourceLink: string }[] };
    const href = boundary === 'forged-link' ? '#getbased-chat-source-v1/' + state.currentProfile + '/missing/0/user/' + '0'.repeat(64) : result.results[0]!.sourceLink;
    state.chatHistory.push({ role: 'assistant', content: `[Open historical source](${href})` }); await (await import('/js/chat-history.js')).saveChatHistory(); (await import('/js/chat-render.js')).renderChatMessages(); return href;
  }, boundary);
  if (boundary === 'changed-source') await page.evaluate(key => localStorage.setItem(key, '[{"role":"user","content":"Newer source text"}]'), fixture.sourceKey);
  await page.locator('#chat-messages a').filter({ hasText: 'Open historical source' }).click(); await expect(page.locator('#notification-container')).toContainText('unavailable or its quote changed');
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.currentThreadId)).toBe(fixture.origin); expect(await dashboardHealth(page)).toBe(health); expect(href).toMatch(/^#getbased-chat-source-v1\//);
});

test('encrypted conversation search never reuses decrypted source content after the profile key is locked', async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort()); const fixture = await seedConversations(page);
  const result = await page.evaluate(async fixture => {
    const crypto = await import('/js/crypto.js'); Reflect.set(window, '__WEARABLES_TEST', true); await crypto._setTestSessionKey('Synthetic conversation-only test passphrase'); localStorage.setItem('labcharts-encryption-enabled', 'true');
    const plain = localStorage.getItem(fixture.sourceKey)!; await crypto.encryptedSetItem(fixture.sourceKey, plain); const encrypted = localStorage.getItem(fixture.sourceKey);
    if (!crypto.isEncryptedValue(encrypted)) throw new Error('Synthetic source did not encrypt');
    const { state } = await import('/js/state.js'), owner = await import('/js/conversation-search.js'); const first = await owner.searchPriorConversations(state.currentProfile, { query: 'sleep' }, () => true);
    await crypto._setTestSessionKey(null); const second = await owner.searchPriorConversations(state.currentProfile, { query: 'sleep' }, () => true);
    const opened = await owner.openConversationSearchLink(first.results[0]!.sourceLink);
    return { first, second, opened, encrypted, after: localStorage.getItem(fixture.sourceKey), thread: state.currentThreadId };
  }, fixture);
  expect(result.first.results).toHaveLength(1); expect(result.first.results[0]!.excerpt).toContain(historical); expect(result.encrypted).not.toContain(historical);
  expect(result.second).toMatchObject({ results: [], skippedThreads: 1, truncated: true }); expect(result.opened).toBe(false); expect(result.thread).toBe(fixture.origin); expect(result.after).toBe(result.encrypted);
});

test('a source link waits for a real active reply to finish before native conversation navigation', async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort());
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?conversation-search-stream-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  const fixture = await seedConversations(page), health = await dashboardHealth(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js'); const tools = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', userMessage: 'Find my earlier sleep conversation.', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) });
    const response = await tools.execute({ tool: 'getbased_search_conversations', arguments: { query: 'sleep' } }); if (!response.success) throw new Error(response.contentItems[0]!.text); const result = JSON.parse(response.contentItems[0]!.text) as { results: { sourceLink: string }[] };
    state.chatHistory.push({ role: 'assistant', content: `[Earlier source](${result.results[0]!.sourceLink})` }); await (await import('/js/chat-history.js')).saveChatHistory();
    const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://conversation-stream.example/v1', 'synthetic-stream-key'); api.setCustomApiModel('fixture'); api.setAIProvider('custom'); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel(); (await import('/js/chat-render.js')).renderChatMessages();
  });
  let reached = false, release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://conversation-stream.example/v1/chat/completions', async route => { reached = true; await pending; await route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ choices: [{ delta: { content: 'This ordinary reply is finished.' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n' }); });
  try {
    await page.locator('#chat-input').fill('Explain what a search result is in one sentence. Keep saved health unchanged.'); await page.locator('#chat-send-btn').click(); await expect.poll(() => reached).toBe(true);
    const link = page.locator('#chat-messages a[data-chat-message-action="open-conversation-result"]'); await link.click(); await expect(page.locator('#notification-container')).toContainText('Wait for the current reply');
    expect(await page.evaluate(async () => (await import('/js/state.js')).state.currentThreadId)).toBe(fixture.origin); expect(await dashboardHealth(page)).toBe(health);
    release(); await expect(page.locator('#chat-messages')).toContainText('This ordinary reply is finished.'); await expect.poll(() => page.evaluate(async () => (await import('/js/chat-runtime.js')).isChatRuntimeStreaming())).toBe(false);
    await link.click(); await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.currentThreadId)).toBe(fixture.source); expect(await dashboardHealth(page)).toBe(health);
  } finally { release(); }
});

test('saved native conversation source links survive a full reload within the same profile', async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort()); const fixture = await seedConversations(page), health = await dashboardHealth(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js'); const tools = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', userMessage: 'Find my earlier sleep conversation.', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) });
    const response = await tools.execute({ tool: 'getbased_search_conversations', arguments: { query: 'sleep' } }); if (!response.success) throw new Error(response.contentItems[0]!.text); const result = JSON.parse(response.contentItems[0]!.text) as { results: { sourceLink: string }[] };
    state.chatHistory.push({ role: 'assistant', content: `[Saved historical source](${result.results[0]!.sourceLink})` }); if (!await (await import('/js/chat-history.js')).saveChatHistory()) throw new Error('Synthetic source link did not save');
  });
  await page.reload(); await page.locator('html[data-app-ready]').waitFor(); await page.evaluate(async () => (await import('/js/chat-loader.js')).openChatPanel());
  await page.getByRole('link', { name: 'Saved historical source', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.currentThreadId)).toBe(fixture.source);
  await expect(page.locator('#chat-msg-0')).toHaveClass(/chat-msg-highlight/); expect(await page.evaluate(key => localStorage.getItem(key), fixture.sourceKey)).toBe(fixture.sourceRaw); expect(await dashboardHealth(page)).toBe(health);
});
