import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'apply-reload', 'apply-fail', 'discard', 'reload'] as const) {
  test(`assistant selection: ${provider} ${protocol} ${decision} keeps history and uses the reviewed model on the next request`, async ({ page }) => {
    const applied = decision === 'apply' || decision === 'apply-reload';
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?assistant-selection-original';
      export async function requestAIProcessingApproval() { return true; }
      export async function requireAIProcessingApproval() {}`);
    const message = 'Use deepseek-target-model with high reasoning effort for future replies.';
    const source = 'glm-source-model', target = 'deepseek-target-model';
    const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://assistant-selection-provider.example/v1/chat/completions';
    let round = 0, feedback = false; const models: string[] = [];
    await page.route(endpoint, async route => {
      const body = route.request().postDataJSON();
      expect(body.model).toBe(round < 3 ? source : applied ? target : source);
      if (round >= 3) expect(body.reasoning_effort).toBe(applied ? 'high' : undefined);
      if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported by this model' } }) }); return; }
      models.push(body.model); let call: AIToolCall | undefined;
      if (round === 0) call = { id: 'read-assistant', type: 'function', function: { name: 'getbased_read_app', arguments: '{"action":"assistant.selection"}' } };
      if (round === 1) {
        const content = body.messages.at(-1).content;
        const result = protocol === 'native' ? JSON.parse(content) : JSON.parse(content.slice(content.indexOf('{"id":'))).output;
        expect(result.success).toBe(true); const snapshot = JSON.parse(result.contentItems[0].text);
        expect(JSON.stringify(snapshot)).not.toMatch(/synthetic-key|leaseId|assistant-selection-provider/);
        expect(snapshot.catalog.models.find((model: { id: string }) => model.id === target).reasoningChoices).toContain('high');
        call = { id: 'review-assistant', type: 'function', function: { name: 'getbased_request_app', arguments: JSON.stringify({ action: 'assistant.selection', snapshotId: snapshot.snapshotId, parameters: JSON.stringify({ model: target, effort: 'high' }), reason: 'Explicit model and effort preference', evidence: message }) } };
      }
      if (round === 3) feedback = body.messages[0].content.includes(`"status":"${applied ? 'changed' : decision === 'apply-fail' ? 'conflict' : decision === 'discard' ? 'discarded' : 'expired'}"`);
      const reply = round++ > 2 ? `Reply from ${body.model}.` : 'Review the requested assistant selection and choose Apply when ready.';
      if (protocol === 'structured') {
        const content = JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] });
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }) });
      } else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
    await page.goto('/app');
    const baseline = await page.evaluate(async ({ provider, source, target }) => {
      const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic model review', { sex: 'female', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed');
      for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1');
      await profiles.switchProfile(id); const api = await import('/js/api.js');
      if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceE2EE(false); api.setVeniceModel(source); }
      else { await api.saveCustomApiConnection('https://assistant-selection-provider.example/v1', 'synthetic-key'); api.setCustomApiModel(source); }
      localStorage.setItem(`labcharts-${provider}-models`, JSON.stringify([{ id: source, name: 'Source GLM', reasoning: { supported_efforts: ['low', 'high'] } }, { id: target, name: 'Target DeepSeek', reasoning: { supported_efforts: ['low', 'high'] } }]));
      api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
      await (await import('/js/nutrition-store.js')).reconcileNutritionMealsFromProfileData(id);
      await (await import('/js/chat-loader.js')).openChatPanel();
      return await (await import('/js/crypto.js')).encryptedGetItem(profiles.profileStorageKey(id, 'imported'));
    }, { provider, source, target });
    await page.locator('#chat-input').fill(message); await page.locator('#chat-send-btn').click();
    const card = page.locator('.chat-app-control'); await expect(card).toContainText('Assistant model and reasoning');
    await expect(card).toContainText(`${source} → ${target}`); await expect(card).toContainText('Default → high');
    expect(await page.evaluate(async () => (await import('/js/assistant-selection.js')).readAssistantSelection().model)).toBe(source);
    if (decision === 'apply') {
      const foreignHandled = await page.evaluate(async () => {
        const { state } = await import('/js/state.js'), index = state.chatHistory.length - 1, record = state.chatHistory[index]!.appControls![0]!;
        const button = document.createElement('button'); button.type = 'button'; button.dataset.chatMessageAction = 'apply-app-control'; button.dataset.chatMessageIndex = String(index); button.dataset.chatControlId = record.id;
        document.getElementById('chat-messages')!.append(button); const event = new MouseEvent('click', { bubbles: true, cancelable: true }); button.dispatchEvent(event); button.remove(); return event.defaultPrevented;
      });
      expect(foreignHandled).toBe(false);
    }
    if (decision === 'reload') {
      await page.reload(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); });
      await expect(card).toContainText('Connection review expired'); await expect(card.locator('[data-chat-message-action="apply-app-control"]')).toHaveCount(0);
    } else {
      if (decision === 'apply-fail') await page.evaluate(({ provider, target }) => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === `labcharts-chat-reasoning-effort-v1:${provider}:${target}`) throw new DOMException('Synthetic full storage', 'QuotaExceededError'); original.call(this, key, value); }; }, { provider, target });
      await card.locator(`[data-chat-message-action="${decision === 'apply-reload' || decision === 'apply-fail' ? 'apply' : decision}-app-control"]`).click();
      await expect(card).toContainText(applied ? 'Assistant selection saved' : decision === 'apply-fail' ? 'Nothing was applied' : 'Discarded');
    }
    if (decision === 'apply-reload') {
      await page.reload(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); });
      await expect(card).toContainText('Assistant selection saved'); await expect(card.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
    }
    await page.locator('#chat-input').fill('Thanks.'); await page.locator('#chat-send-btn').click();
    const selected = applied ? target : source;
    await expect(page.locator('#chat-messages')).toContainText(`Reply from ${selected}.`); expect(feedback).toBe(true);
    expect(models.slice(0, 3)).toEqual([source, source, source]); expect(models[3]).toBe(selected);
    const attribution = await page.evaluate(async () => (await import('/js/state.js')).state.chatHistory.filter(message => message.role === 'assistant').map(message => message.modelId));
    expect(attribution).toEqual([source, selected]);
    await expect(page.locator('#chat-model-menu-label')).toContainText(applied ? 'Target DeepSeek' : 'Source GLM');
    if (decision === 'apply') {
      expect(await page.evaluate(async () => (await import('/js/assistant-selection.js')).readAssistantSelection().effort)).toBe('high');
      await card.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(card).toContainText('Previous assistant selection restored');
      expect(await page.evaluate(async () => (await import('/js/assistant-selection.js')).readAssistantSelection())).toMatchObject({ model: source, effort: '' });
    }
    await page.reload(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); });
    expect(await page.evaluate(async () => (await import('/js/state.js')).state.chatHistory.filter(message => message.role === 'assistant').map(message => message.modelId))).toEqual([source, selected]);
    expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')); })).toBe(baseline);
    expect(errors).toEqual([]);
  });
}
