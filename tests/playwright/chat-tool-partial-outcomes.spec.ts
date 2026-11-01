import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { Page } from '@playwright/test';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

async function saved(page: Page) {
  return page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!);
  });
}
async function seed(page: Page, provider: 'custom' | 'venice') {
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?partial-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
  await page.goto('/app');
  await page.evaluate(async provider => {
    const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic partial tool outcome', { sex: 'male', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed');
    localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profiles.switchProfile(id);
    const api = await import('/js/api.js'); api.setAIPaused(true);
    const { state } = await import('/js/state.js'); state.importedData.contextNotes = 'Preserve unrelated context.';
    state.importedData.diet = { type: 'vegetarian', bowelFrequency: 'irregular', note: 'Preserve diet.' }; state.importedData.healthGoals = [];
    (await import('/js/context-source-registry.js')).setContextSourceEnabled('insight-cards', true);
    if (!await (await import('/js/data.js')).saveImportedDataForProfile(id, state.importedData, { forceProfileScope: true })) throw new Error('Seed failed');
    if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('fixture-model'); api.setVeniceE2EE(false); }
    else { await api.saveCustomApiConnection('https://partial-tools.example/v1', 'synthetic-key'); api.setCustomApiModel('fixture-model'); }
    api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
  }, provider);
}
const statement = 'I want to improve digestion as a low-priority goal.';
for (const surface of ['chat', 'discussion'] as const) for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const terminal of ['failure', 'stop'] as const) test(`context ${surface} ${provider} ${protocol} retains a native review after ${terminal} and reload`, async ({ page, context }) => {
  const accepted = statement;
  await context.route('https://**/*', route => route.abort()); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let round = 0, waiting = false, release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://partial-tools.example/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, json: { error: { message: 'tools not supported' } } }); return; }
    if (round >= 2) {
      const last = body.messages.at(-1), output = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
      expect(output.success).toBe(true); expect(JSON.parse(output.contentItems[0].text).status).toBe('pending_user_approval'); waiting = true;
      if (terminal === 'stop') { await held; await route.abort().catch(() => {}); }
      else await route.fulfill({ status: 400, json: { error: { message: 'PRIVATE_PROVIDER_FAILURE_AFTER_REVIEW' } } });
      return;
    }
    let call: AIToolCall;
    if (round === 0) call = { id: 'read-goals', type: 'function', function: { name: 'getbased_read_context_card', arguments: '{"card":"healthGoals"}' } };
    else {
      const last = body.messages.at(-1), output = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
      expect(output.success).toBe(true); const snapshot = JSON.parse(output.contentItems[0].text);
      call = { id: 'draft-goal', type: 'function', function: { name: 'getbased_draft_context', arguments: JSON.stringify({ card: 'healthGoals', snapshotId: snapshot.snapshotId, changes: [{ field: 'goals', operation: 'add', record: { text: 'Improve digestion', severity: 'minor' } }], reason: 'Explicit health goal.', evidence: accepted }) } };
    }
    round++;
    if (protocol === 'structured') await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ reply: '', calls: [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] }) }, finish_reason: 'stop' }] } });
    else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, ...call }] }, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n` });
  });
  try {
    await seed(page, provider);
    const before = await saved(page), selector = '.chat-agent-draft-pending';
    if (surface === 'chat') { await page.locator('#chat-input').fill(accepted); await page.locator('#chat-send-btn').click(); }
    else await page.evaluate(async statement => {
      const { state } = await import('/js/state.js'); state.chatHistory.push({ role: 'user', content: statement });
      (await import('/js/chat-render.js')).renderChatMessages();
      const persona = (await import('/js/chat-personalities.js')).getActivePersonality();
      const completion = (await import('/js/chat-discussion-turns.js')).runDiscussionContinuation([persona], 'default', statement, { suppressAutoMsg: true });
      Object.assign(globalThis, { partialDiscussionCompletion: completion });
    }, accepted);
    if (terminal === 'stop') { await expect.poll(() => waiting).toBe(true); await page.locator('#chat-send-btn.streaming').click(); release(); }
    await expect(page.locator(selector)).toHaveCount(1); await expect(page.locator('#chat-messages')).toContainText('1 proposal remains available for review');
    await expect(page.locator('#chat-messages')).not.toContainText('PRIVATE_PROVIDER_FAILURE'); expect(await saved(page)).toEqual(before);
    await expect(page.locator('#chat-send-btn.streaming')).toHaveCount(0); await page.evaluate(async () => (await import('/js/api.js')).setAIPaused(true));
    await page.reload(); await page.locator('html[data-app-ready]').waitFor(); await page.evaluate(async () => (await import('/js/chat-loader.js')).openChatPanel());
    const card = page.locator(selector); await expect(card).toHaveCount(1); expect(await saved(page)).toEqual(before);
    await card.getByRole('button', { name: terminal === 'failure' ? 'Apply' : 'Discard', exact: true }).click();
    await expect(page.locator(terminal === 'failure' ? '.chat-agent-draft-applied' : '.chat-agent-draft-discarded')).toHaveCount(1);
    const after = await saved(page);
    if (terminal === 'stop') expect(after).toEqual(before);
    else {
      expect(after.healthGoals).toEqual([{ text: 'Improve digestion', severity: 'minor', updatedAt: expect.any(Number) }]);
      const protectedData = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !['healthGoals', 'changeHistory', '_deleted', '_deletedAt', '_deletedClearedAt'].includes(key)));
      expect(protectedData(after)).toEqual(protectedData(before));
      expect(after.changeHistory.filter((row: { field: string }) => row.field !== 'healthGoals')).toEqual((before.changeHistory || []).filter((row: { field: string }) => row.field !== 'healthGoals'));
    }
    expect(errors).toEqual([]);
  } finally { release(); }
});


test('opening a health view never saves history preferences, even when the tool loop exhausts', async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort()); let round = 0;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://partial-tools.example/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    if (round === 1) {
      const result = JSON.parse(body.messages.at(-1).content); expect(result.success).toBe(true);
      expect(JSON.parse(result.contentItems[0].text)).toMatchObject({ dataSaved: false, settingsSaved: false, opened: 'nutritionHistory' });
    }
    const call = { id: `health-${round}`, type: 'function', function: round === 0 ? { name: 'getbased_navigate', arguments: '{"view":"nutritionHistory"}' } : { name: 'getbased_lab_context', arguments: '{}' } };
    round++; await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, ...call }] }, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n` });
  });
  await seed(page, 'custom'); const before = await saved(page);
  const preferences = await page.evaluate(async () => (await import('/js/history-view-preferences.js')).readHistoryViewPreferences((await import('/js/state.js')).state.currentProfile).values);
  await page.locator('#chat-input').fill('Show my nutrition history.'); await page.locator('#chat-send-btn').click();
  await expect(page.locator('#chat-messages')).toContainText('An app view was opened.');
  await expect(page.locator('#chat-messages')).not.toContainText('App preferences were saved');
  expect(round).toBe(10); await expect(page.locator('.chat-agent-draft')).toHaveCount(0); expect(await saved(page)).toEqual(before);
  await page.evaluate(async () => (await import('/js/api.js')).setAIPaused(true)); await page.reload(); await page.locator('html[data-app-ready]').waitFor();
  const after = await page.evaluate(async () => (await import('/js/history-view-preferences.js')).readHistoryViewPreferences((await import('/js/state.js')).state.currentProfile).values);
  expect(after).toEqual(preferences); expect(await saved(page)).toEqual(before); expect(errors).toEqual([]);
});
