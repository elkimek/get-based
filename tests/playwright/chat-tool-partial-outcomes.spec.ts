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
const surfaces = { context: ['chat', 'discussion'], app: ['chat'] } as const;
for (const reviewKind of ['context', 'app'] as const) for (const surface of surfaces[reviewKind]) for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const terminal of ['failure', 'stop'] as const) test(`${reviewKind} ${surface} ${provider} ${protocol} retains a native review after ${terminal} and reload`, async ({ page, context }) => {
  const accepted = reviewKind === 'app' ? 'Use US units from now on.' : statement;
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
    if (round === 0) call = reviewKind === 'context' ? { id: 'read-goals', type: 'function', function: { name: 'getbased_read_context_card', arguments: '{"card":"healthGoals"}' } } : { id: 'read-units', type: 'function', function: { name: 'getbased_read_app', arguments: '{"action":"display.preferences"}' } };
    else {
      const last = body.messages.at(-1), output = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
      expect(output.success).toBe(true); const snapshot = JSON.parse(output.contentItems[0].text);
      call = reviewKind === 'context' ? { id: 'draft-goal', type: 'function', function: { name: 'getbased_draft_context', arguments: JSON.stringify({ card: 'healthGoals', snapshotId: snapshot.snapshotId, changes: [{ field: 'goals', operation: 'add', record: { text: 'Improve digestion', severity: 'minor' } }], reason: 'Explicit health goal.', evidence: accepted }) } } : { id: 'draft-units', type: 'function', function: { name: 'getbased_request_app', arguments: JSON.stringify({ action: 'display.preferences', snapshotId: snapshot.snapshotId, parameters: '{"unitSystem":"US"}', reason: 'Explicit units request.', evidence: accepted }) } };
    }
    round++;
    if (protocol === 'structured') await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ reply: '', calls: [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] }) }, finish_reason: 'stop' }] } });
    else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, ...call }] }, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n` });
  });
  try {
    await seed(page, provider);
    if (reviewKind === 'app') await page.evaluate(async () => (await import('/js/display-preferences.js')).commitDisplayPreferences({ unitSystem: 'EU' }));
    const before = await saved(page), selector = reviewKind === 'context' ? '.chat-agent-draft-pending' : '.chat-app-control';
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
    if (reviewKind === 'context') await expect(page.locator(terminal === 'failure' ? '.chat-agent-draft-applied' : '.chat-agent-draft-discarded')).toHaveCount(1);
    else await expect(page.locator('.chat-app-control')).toContainText(terminal === 'failure' ? 'Display preference saved' : 'Discarded');
    const after = await saved(page);
    if (reviewKind === 'app') {
      expect(after).toEqual(before);
      expect(await page.evaluate(async () => (await import('/js/display-preferences.js')).readDisplayPreferences().unitSystem)).toBe(terminal === 'failure' ? 'US' : 'EU');
    } else if (terminal === 'stop') expect(after).toEqual(before);
    else {
      expect(after.healthGoals).toEqual([{ text: 'Improve digestion', severity: 'minor', updatedAt: expect.any(Number) }]);
      const protectedData = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !['healthGoals', 'changeHistory', '_deleted', '_deletedAt', '_deletedClearedAt'].includes(key)));
      expect(protectedData(after)).toEqual(protectedData(before));
      expect(after.changeHistory.filter((row: { field: string }) => row.field !== 'healthGoals')).toEqual((before.changeHistory || []).filter((row: { field: string }) => row.field !== 'healthGoals'));
    }
    expect(errors).toEqual([]);
  } finally { release(); }
});

test('a real saved history preference survives tool exhaustion with a truthful partial outcome', async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort()); let round = 0;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://partial-tools.example/v1/chat/completions', async route => {
    const body = route.request().postDataJSON(); let call: AIToolCall;
    if (round === 1) {
      const result = JSON.parse(body.messages.at(-1).content); expect(result.success).toBe(true); const read = JSON.parse(result.contentItems[0].text);
      call = { id: 'save-history', type: 'function', function: { name: 'getbased_navigate', arguments: JSON.stringify({ view: 'nutritionHistory', snapshotId: read.snapshotId, history: JSON.stringify({ nutritionRange: '1y', nutritionView: 'trends' }) }) } };
    } else {
      if (round === 2) {
        const result = JSON.parse(body.messages.at(-1).content); expect(result.success).toBe(true);
        expect(JSON.parse(result.contentItems[0].text)).toMatchObject({ settingsSaved: true, dataSaved: false, opened: 'nutritionHistory' });
      }
      call = { id: `history-${round}`, type: 'function', function: { name: 'getbased_read_app', arguments: '{"action":"history.views"}' } };
    }
    round++; await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, ...call }] }, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n` });
  });
  await seed(page, 'custom'); const before = await saved(page);
  await page.locator('#chat-input').fill('Show my nutrition history as Trends for the last year.'); await page.locator('#chat-send-btn').click();
  await expect(page.locator('#chat-messages')).toContainText('App preferences were saved before the response ended.');
  await expect(page.locator('#chat-messages')).not.toContainText('No change was applied');
  expect(round).toBe(10); await expect(page.locator('.chat-agent-draft')).toHaveCount(0); expect(await saved(page)).toEqual(before);
  await page.evaluate(async () => (await import('/js/api.js')).setAIPaused(true)); await page.reload(); await page.locator('html[data-app-ready]').waitFor();
  const preferences = await page.evaluate(async () => (await import('/js/history-view-preferences.js')).readHistoryViewPreferences((await import('/js/state.js')).state.currentProfile));
  expect(preferences.values).toMatchObject({ nutritionRange: '1y', nutritionView: 'trends' }); expect(await saved(page)).toEqual(before); expect(errors).toEqual([]);
});
