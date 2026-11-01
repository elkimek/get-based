import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'discard'] as const) {
  test(`direct ${provider} ${protocol} chat proposal survives ${decision} and reload`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    // Synthetic provider/consent only; real sender, transport, tools, review UI and persistence.
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?direct-tools-original';
      export async function requestAIProcessingApproval() { return true; }
      export async function requireAIProcessingApproval() {}`);
    let round = 0, feedback = false, rejectedNativeRequests = 0;
    const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://synthetic-provider.example/v1/chat/completions';
    await page.route(endpoint, async route => {
      const body = route.request().postDataJSON();
      expect(body.model).toBe(provider === 'venice' ? 'glm-5-fixture' : 'synthetic-tool-model');
      expect(route.request().headers().authorization).toBe('Bearer synthetic-key');
      if (protocol === 'structured' && body.tools) {
        rejectedNativeRequests++;
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported by this model' } }) }); return;
      }
      let call: AIToolCall | undefined;
      const last = body.messages.at(-1);
      if (round === 0) call = { id: 'read-goals', type: 'function', function: { name: 'getbased_read_context_card', arguments: '{"card":"healthGoals"}' } };
      if (round === 1) {
        const result = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
        expect(result.success).toBe(true);
        const snapshot = JSON.parse(result.contentItems[0].text);
        call = { id: 'draft-goal', type: 'function', function: { name: 'getbased_draft_context', arguments: JSON.stringify({
          card: 'healthGoals', snapshotId: snapshot.snapshotId,
          changes: [{ field: 'goals', operation: 'add', record: { text: 'Improve sleep' } }],
          reason: 'An explicitly stated goal.', evidence: 'I want to improve my sleep.',
        }) } };
      }
      if (round === 3) {
        feedback = body.messages[0].content.includes(`"status":"${decision === 'apply' ? 'applied' : 'discarded'}"`);
      }
      round++;
      const reply = round > 3 ? 'Understood.' : 'Please review your proposed goal.';
      if (protocol === 'structured') {
        const content = JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] });
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }) });
      } else {
        const response = { choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
        await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(response)}\n\ndata: [DONE]\n\n` });
      }
    });
    await page.addInitScript(() => { for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
    await page.goto('/app');
    await page.locator('html[data-app-ready]').waitFor();
    await page.evaluate(async provider => {
      const profile = await import('/js/profile.js');
      const id = await profile.createProfile('Direct tool fixture', { sex: 'male', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
      localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1');
      localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1');
      await profile.switchProfile(id);
      const api = await import('/js/api.js');
      if (provider === 'venice') {
        await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('glm-5-fixture'); api.setVeniceE2EE(false);
      } else {
        await api.saveCustomApiConnection('https://synthetic-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('synthetic-tool-model');
      }
      api.setAIProvider(provider); api.setAIPaused(false);
      (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
      await (await import('/js/chat-loader.js')).openChatPanel();
    }, provider);
    await page.locator('#chat-input').fill('I want to improve my sleep.');
    await page.locator('#chat-send-btn').click();
    const proposal = page.locator('.chat-agent-draft-pending');
    await expect(proposal).toContainText('Health Goals');
    await expect(proposal).toContainText('Medium');
    expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.healthGoals)).toEqual([]);
    await proposal.locator(`[data-chat-message-action="${decision}-agent-draft"]`).click();
    await expect(page.locator(`.chat-agent-draft-${decision === 'apply' ? 'applied' : 'discarded'}`)).toHaveCount(1);
    await page.locator('#chat-input').fill('Thanks.'); await page.locator('#chat-send-btn').click();
    await expect(page.locator('#chat-messages')).toContainText('Understood.');
    expect(feedback).toBe(true);
    await page.reload();
    await page.evaluate(async () => {
      await (await import('/js/chat-loader.js')).openChatPanel();
      await (await import('/js/context-card-lifestyle-editors.js')).openHealthGoalsEditor();
    });
    await expect(page.locator('[aria-label="Saved health goals"] .goals-text')).toHaveText(decision === 'apply' ? ['Improve sleep'] : []);
    const saved = await page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      await (await import('/js/chat-history.js')).loadChatHistory();
      return { notes: state.importedData.contextNotes, statuses: state.chatHistory.flatMap(message => (message.agentDrafts || []).map(draft => draft.status)) };
    });
    expect(saved.notes).toBe(''); expect(saved.statuses).toEqual([decision === 'apply' ? 'applied' : 'discarded']);
    if (decision === 'apply') {
      const priority = page.getByRole('combobox', { name: 'Priority for goal: Improve sleep', exact: true });
      await expect(priority).toHaveValue('mild'); await priority.selectOption('major'); await expect(page.locator('#detail-modal').getByRole('status')).toHaveText('Saved');
      await page.reload(); await page.evaluate(async () => { await (await import('/js/context-card-lifestyle-editors.js')).openHealthGoalsEditor(); });
      await expect(page.getByRole('combobox', { name: 'Priority for goal: Improve sleep', exact: true })).toHaveValue('major');
      expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.healthGoals.map(goal => ({ text: goal.text, severity: goal.severity })))).toEqual([{ text: 'Improve sleep', severity: 'major' }]);
    }
    expect(errors).toEqual([]);
    // Tool incompatibility is retried only for the original request; the next
    // user message negotiates independently against the same selected model.
    expect(rejectedNativeRequests).toBe(protocol === 'structured' ? 2 : 0);
  });
}

test('a direct provider can stop an existing therapy through the shared record tools', async ({ page }) => {
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?direct-record-original';
    export async function requestAIProcessingApproval() { return true; }
    export async function requireAIProcessingApproval() {}`);
  let round = 0;
  await page.route('https://synthetic-provider.example/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    let call: AIToolCall | undefined;
    if (round === 0) call = { id: 'read-therapy', type: 'function', function: { name: 'getbased_read_data', arguments: '{"resource":"supplements","recordId":"therapy-a"}' } };
    if (round === 1) {
      const result = JSON.parse(body.messages.at(-1).content);
      expect(result.success).toBe(true);
      const snapshot = JSON.parse(result.contentItems[0].text);
      expect(snapshot.current.name).toBe('Example product');
      call = { id: 'stop-therapy', type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'supplements', operation: 'stop', snapshotId: snapshot.snapshotId, patch: '{"date":"2026-10-23"}', evidence: 'I stopped taking Example product today.', reason: 'Reported stop.' }) } };
    }
    round++;
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: 'Review the proposed stop date.' }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  await page.addInitScript(() => { for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
  await page.goto('/app');
  await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async () => {
    const profile = await import('/js/profile.js');
    const id = await profile.createProfile('Direct therapy fixture', { sex: 'male', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
    localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1');
    await profile.switchProfile(id);
    const { state } = await import('/js/state.js');
    state.importedData.supplements = [{ id: 'therapy-a', name: 'Example product', type: 'supplement', startDate: '2026-01-01', periods: [{ start: '2026-01-01', end: null, dose: 'one capsule' }], extension: 'retain' }];
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Fixture save failed');
    const api = await import('/js/api.js');
    await api.saveCustomApiConnection('https://synthetic-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('synthetic'); api.setAIProvider('custom'); api.setAIPaused(false);
    (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
  });
  await page.locator('#chat-input').fill('I stopped taking Example product today.'); await page.locator('#chat-send-btn').click();
  const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText('Supplements & Medications');
  await expect(card).toContainText('2026-10-23');
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.supplements[0]!.endDate)).toBeUndefined();
  await card.locator('[data-chat-message-action="apply-agent-draft"]').click();
  await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(1);
  await page.reload();
  await page.evaluate(async () => { (await import('/js/supplements.js')).openSupplementsEditor(0); });
  await expect(page.locator('.supp-period-end').first()).toHaveValue('2026-10-23');
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.supplements[0]!.extension)).toBe('retain');
  expect(round).toBe(3);
});
