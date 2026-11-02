import { expect, type Page, type BrowserContext } from '@playwright/test';
import { seedDashboardControlProfile, dashboardHealth } from './dashboard-control-fixture.js';
import { routeJavaScript } from './browser-static-routes.js';
import { seedLocalKnowledgeCorpus, knowledgeCorpusReceipt } from './knowledge-browser-fixture.js';
export type KnowledgeManagementRequest = 'inventory' | 'pasted text' | 'replacement' | 'chosen files' | 'native UI help';
export async function runKnowledgeManagementBrowserCase({ page, context }: { page: Page; context: BrowserContext }, provider: 'custom' | 'venice', protocol: 'native' | 'structured', request: KnowledgeManagementRequest, forge = false) {
  const errors: string[] = [], managementReads: string[] = []; let choosers = 0, round = 0;
  page.on('request', request => { if (/\/js\/knowledge-(?:file-(?:review|preview)|import-records)\.js(?:[?#]|$)/.test(request.url())) managementReads.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message)); page.on('filechooser', () => choosers++);
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?kb-management-native-only'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  await context.addInitScript(() => { for (const key of ['tour', 'emptyTour']) localStorage.setItem('labcharts-default-' + key, 'completed'); });
  await seedDashboardControlProfile(page);
  await page.evaluate(async provider => {
    const api = await import('/js/api.js');
    if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('glm-5-fixture'); api.setVeniceE2EE(false); }
    else { await api.saveCustomApiConnection('https://knowledge-native-ui.example/v1', 'synthetic-key'); api.setCustomApiModel('synthetic-knowledge-policy'); }
    api.setAIProvider(provider); (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
  }, provider);
  const libraryId = await seedLocalKnowledgeCorpus(page), before = await knowledgeCorpusReceipt(page, libraryId), health = await dashboardHealth(page);
  const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://knowledge-native-ui.example/v1/chat/completions';
  await page.route(endpoint, async route => {
    const body = route.request().postDataJSON();
    if (body.tools) {
      expect(JSON.stringify(body.tools)).not.toContain('getbased_read_knowledge');
      for (const tool of body.tools) if (['getbased_read_data', 'getbased_draft_data'].includes(tool.function.name)) expect(tool.function.parameters.properties.resource.enum).not.toContain('knowledgeImports');
    }
    if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, json: { error: { message: 'tools not supported by this model' } } }); return; }
    if (round) {
      const last = body.messages.at(-1), result = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
      expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toMatch(/synthetic-notes|synthetic-report|private-corpus/);
    }
    const call = round++ === 0 && request !== 'native UI help' ? { id: 'retired-kb', type: 'function', function: request === 'inventory'
      ? { name: 'getbased_read_knowledge', arguments: '{}' }
      : { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'knowledgeImports', operation: 'start', snapshotId: 'old-import', patch: JSON.stringify(request === 'chosen files' ? { input: 'chooseFiles' } : { source: 'new.md', text: 'Synthetic source text.', ...(request === 'replacement' ? { replaceDocumentId: 'old-document' } : {}) }), reason: 'Requested', evidence: 'Manage my Knowledge Base.' }) } } : null;
    const reply = 'Use the native Knowledge Base UI to manage documents.';
    await route.fulfill(protocol === 'structured' ? { json: { choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) } }] } }
      : { contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  await page.evaluate(async () => { (await import('/js/api.js')).setAIPaused(false); await (await import('/js/chat-loader.js')).openChatPanel(); });
  await page.locator('#chat-input').fill('Manage my Knowledge Base.'); await page.locator('#chat-send-btn').click();
  if (request === 'inventory') {
    await expect(page.locator('.chat-ai').last()).toContainText("I couldn't complete this response. Check your provider connection and try again.");
    expect(round).toBe(1); // The unavailable tool is rejected by the transport before execution.
  } else {
    await expect(page.locator('.chat-ai').last()).toContainText('native Knowledge Base UI');
    expect(round).toBe(request === 'native UI help' ? 1 : 2);
  }
  await expect(page.locator('.chat-agent-draft-pending,.chat-app-control')).toHaveCount(0);
  expect(await knowledgeCorpusReceipt(page, libraryId)).toEqual(before); expect(await dashboardHealth(page)).toEqual(health);
  if (forge) {
    const readsBefore = [...managementReads];
    const index = await page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      const index = state.chatHistory.length;
      state.chatHistory.push({ role: 'assistant', content: 'Historical source request', agentDrafts: [{ id: 'retired-import', kind: 'data', status: 'pending', profileId: state.currentProfile, summary: 'Former file selection', payload: { resource: 'knowledgeImports', operation: 'start', recordId: 'old-library', baseline: '{}', patch: '{"input":"chooseFiles"}', reason: 'Old request', evidence: 'Import', effectiveDate: '2026-10-30', recordedAt: 1 } }] });
      return index;
    });
    for (const action of ['apply-agent-draft', 'preview-knowledge-files', 'check-agent-draft']) {
      const notifications = await page.locator('#notification-container .notification-toast').count();
      await page.evaluate(({ index, action }) => {
        const button = document.createElement('button'); button.textContent = 'Stale import control'; button.dataset.chatMessageAction = action; button.dataset.chatMessageIndex = String(index); button.dataset.chatMessageDraftId = 'retired-import'; document.getElementById('chat-messages')!.append(button); button.click();
      }, { index, action });
      await expect(page.locator('#notification-container .notification-toast')).toHaveCount(notifications + 1);
      await expect(page.locator('#notification-container .notification-toast').last()).toContainText('native settings or editor');
    }
    expect(managementReads).toEqual(readsBefore);
    expect(choosers).toBe(0); expect(await knowledgeCorpusReceipt(page, libraryId)).toEqual(before); expect(await dashboardHealth(page)).toEqual(health);
  }
  expect(errors).toEqual([]);
}
