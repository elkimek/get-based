import { expect, test } from './coverage-fixture.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

for (const protocol of ['native', 'structured'] as const) for (const action of ['assistant.connection', 'assistant.selection'] as const) for (const decision of ['apply', 'account-changed', 'validation-failed'] as const) {
  test(`managed assistant: ${protocol} ${action} ${decision} keeps hidden ownership private and requires native review`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const connection = action === 'assistant.connection', sourceModel = connection ? 'source-model' : 'managed-a';
    const message = connection ? 'Switch to the configured OpenRouter connection using managed-b with high effort.' : 'Use managed-b with high effort for future replies.';
    const requests: Array<{ provider: string; model: string }> = []; let round = 0, checks = 0, stockProbes = 0;
    await page.route('https://openrouter.ai/api/v1/models', async route => { stockProbes++; await route.fulfill({ status: 500 }); });
    await page.route('https://managed-source.example/v1/models', route => route.fulfill({ json: { data: [{ id: 'source-model' }] } }));
    await page.route('https://managed-owner.example/check?*', async route => {
      checks++; expect(route.request().method()).toBe('GET'); expect(route.request().postData()).toBeNull();
      await route.fulfill({ json: { ready: decision !== 'validation-failed' } });
    });
    for (const provider of ['custom', 'openrouter'] as const) await page.route(provider === 'custom' ? 'https://managed-source.example/v1/chat/completions' : 'https://managed-owner.example/v1/chat/completions', async route => {
      const body = route.request().postDataJSON();
      if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, json: { error: { message: 'tools not supported by this model' } } }); return; }
      expect(JSON.stringify(body)).not.toMatch(/PRIVATE_ACCOUNT|PRIVATE_EDITION|captureConnectionControls|isCurrent/);
      requests.push({ provider, model: body.model }); let call: AIToolCall | undefined;
      if (round === 0) call = { id: 'read', type: 'function', function: { name: 'getbased_read_app', arguments: JSON.stringify({ action, ...(connection ? { connectionId: 'direct:openrouter' } : {}) }) } };
      if (round === 1) {
        const content = body.messages.at(-1).content, result = protocol === 'native' ? JSON.parse(content) : JSON.parse(content.slice(content.indexOf('{"id":'))).output;
        expect(result.success).toBe(true); const snapshot = JSON.parse(result.contentItems[0].text);
        expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE_|leaseId|managed-owner|managed-source/);
        call = { id: 'review', type: 'function', function: { name: 'getbased_request_app', arguments: JSON.stringify({ action, snapshotId: snapshot.snapshotId, parameters: JSON.stringify({ ...(connection ? { connectionId: 'direct:openrouter' } : {}), model: 'managed-b', effort: 'high' }), reason: 'Explicit assistant preference', evidence: message }) } };
      }
      const reply = round++ < 3 ? 'Review the assistant change and choose Apply.' : `Next reply from ${body.model}.`;
      if (protocol === 'structured') await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] } });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
    await page.goto('/app');
    const baseline = await page.evaluate(async ({ connection, sourceModel }) => {
      const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic managed assistant', { sex: 'female', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed');
      for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1');
      await profiles.switchProfile(id); const api = await import('/js/api.js');
      await api.saveCustomApiConnection('https://managed-source.example/v1', 'SYNTHETIC_SOURCE_KEY'); api.setCustomApiModel('source-model'); api.setOpenRouterModel(sourceModel === 'source-model' ? 'managed-a' : sourceModel);
      const consent = await import('/js/cloud-ai-consent.js'), scope = consent.cloudAIConsentDetails('custom').scope;
      localStorage.setItem(consent.AI_TRANSPARENCY_KEY, JSON.stringify({ version: consent.AI_TRANSPARENCY_VERSION, acknowledged: true }));
      localStorage.setItem(consent.CLOUD_AI_CONSENT_KEY, JSON.stringify({ version: consent.CLOUD_AI_CONSENT_VERSION, approvals: { [scope]: { accepted: true } } }));
      const { callOpenAICompatibleAPI } = await import('/js/api-openai-compatible.js'), { showConfirmDialog } = await import('/js/utils.js');
      localStorage.setItem('fixture-managed-account', 'PRIVATE_ACCOUNT');
      (await import('/js/app-extension-runtime.js')).configureAppExtension({ id: 'PRIVATE_EDITION', ai: {
        isProviderActive: provider => provider === 'openrouter', isCredentialOwned: provider => provider === 'openrouter',
        getModelPolicy: ({ provider }) => provider === 'openrouter' ? { enforced: true, allowlist: ['managed-a', 'managed-b'] } : null,
        captureConnectionControls: provider => {
          if (provider !== 'openrouter') return null; const account = localStorage.getItem('fixture-managed-account');
          return { isCurrent: () => localStorage.getItem('fixture-managed-account') === account, check: async ({ model, signal }) => (await (await fetch(`https://managed-owner.example/check?model=${encodeURIComponent(model)}`, { signal })).json()).ready === true };
        },
        requestProcessingApproval: context => context.kind === 'connection-selection' ? showConfirmDialog('Select the configured managed recipient for future replies?', { confirmLabel: 'Select managed recipient' }) : true,
        authorizeRequest: () => true, isProviderCallOwned: () => true,
        callProvider: context => callOpenAICompatibleAPI('https://managed-owner.example/v1/chat/completions', 'SYNTHETIC_MANAGED_CREDENTIAL', String(context.model), 'Managed fixture', context.request as import('../../js/api-openai-compatible.js').OpenAICompatibleOptions),
      } });
      localStorage.setItem('labcharts-custom-models', JSON.stringify([{ id: 'source-model', name: 'Source model' }]));
      localStorage.setItem('labcharts-openrouter-models', JSON.stringify(['managed-a', 'managed-b'].map(id => ({ id, name: id, reasoning: { supported_efforts: ['low', 'high'] } }))));
      api.setAIProvider(connection ? 'custom' : 'openrouter'); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
      await (await import('/js/nutrition-store.js')).reconcileNutritionMealsFromProfileData(id); await (await import('/js/chat-loader.js')).openChatPanel();
      return await (await import('/js/crypto.js')).encryptedGetItem(profiles.profileStorageKey(id, 'imported'));
    }, { connection, sourceModel });
    await page.locator('#chat-input').fill(message); await page.locator('#chat-send-btn').click();
    const card = page.locator('.chat-app-control'); await expect(card).toContainText(connection ? 'Assistant connection' : 'Assistant model and reasoning');
    expect(checks).toBe(0); expect(requests).toHaveLength(3);
    expect(await page.evaluate(async () => (await import('/js/assistant-selection.js')).readAssistantSelection().model)).toBe(sourceModel);
    if (decision === 'account-changed') await page.evaluate(() => localStorage.setItem('fixture-managed-account', 'PRIVATE_ACCOUNT_CHANGED'));
    await card.getByRole('button', { name: 'Apply', exact: true }).click();
    if (connection && decision !== 'account-changed') {
      const select = page.getByRole('button', { name: 'Select managed recipient', exact: true }); await expect(select).toBeVisible();
      expect(requests).toHaveLength(3); expect(checks).toBe(0); await select.click();
    }
    await expect(card).toContainText(decision === 'apply' ? 'Assistant selection saved' : 'Nothing was applied');
    expect(checks).toBe(decision === 'account-changed' ? 0 : 1);
    await page.locator('#chat-input').fill('Thank you.'); await page.locator('#chat-send-btn').click();
    await expect(page.locator('#chat-messages')).toContainText(`Next reply from ${decision === 'apply' ? 'managed-b' : sourceModel}.`);
    expect(requests.at(-1)).toEqual({ provider: connection && decision !== 'apply' ? 'custom' : 'openrouter', model: decision === 'apply' ? 'managed-b' : sourceModel });
    if (decision === 'apply') {
      await card.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(card).toContainText('Previous assistant selection restored');
      expect(await page.evaluate(async () => (await import('/js/assistant-selection.js')).readAssistantSelection().model)).toBe(sourceModel);
    }
    await page.reload(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); });
    expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')); })).toBe(baseline);
    expect(stockProbes).toBe(0); expect(errors).toEqual([]);
  });
}
