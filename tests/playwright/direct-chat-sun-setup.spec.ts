import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'discard'] as const) {
  test(`${provider} ${protocol} Sun setup ${decision} persists to the ordinary editor`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?sun-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
    const stages = [
      { statement: 'I now use warm LED lighting at home.', patch: { homeLight: 'led-warm' } },
      { statement: 'My Fitzpatrick skin type is IV.', patch: { fitzpatrick: 'IV' } },
      { statement: 'My daytime workspace is dim with little daylight.', patch: { habits: { dimWorkspace: true } } },
    ];
    let stage = 0, round = 0;
    const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://synthetic-sun-provider.example/v1/chat/completions';
    await page.route(endpoint, async route => {
      const body = route.request().postDataJSON(); expect(body.model).toBe('glm-5-fixture'); expect(JSON.stringify(body)).not.toMatch(/sun-private-sentinel|\/private\//);
      if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
      const result = () => protocol === 'native' ? JSON.parse(body.messages.at(-1).content) : JSON.parse(body.messages.at(-1).content.slice(body.messages.at(-1).content.indexOf('{"id":'))).output;
      let call: AIToolCall | undefined;
      if (round === 0) call = { id: `read-sun-${stage}`, type: 'function', function: { name: 'getbased_read_data', arguments: '{"resource":"sunSetup"}' } };
      if (round === 1) {
        const response = result(); expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text);
        call = { id: `draft-sun-${stage}`, type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'sunSetup', operation: 'update', snapshotId: current.snapshotId, patch: JSON.stringify(stages[stage]!.patch), evidence: stages[stage]!.statement, reason: 'The user explicitly reported this changed Light setup fact.' }) } };
      }
      if (round === 2) { const response = result(); expect(response.success).toBe(true); expect(JSON.parse(response.contentItems[0].text).review.applied).toBe(false); }
      round++; const reply = 'Review your Light setup change before applying.';
      if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.goto('/app');
    await page.evaluate(async provider => {
      const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic Sun setup proposal', { sex: 'female', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed');
      localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profiles.switchProfile(id);
      const { state } = await import('/js/state.js'); state.importedData.nutritionMeals = []; state.importedData.contextNotes = 'Keep unrelated context';
      state.importedData.sunDefaults = { completedAt: 1, fitzpatrick: 'II', homeLight: 'incandescent', eyewear: 'none', aiAnalysis: { detail: 'sun-private-sentinel' } };
      state.importedData.lightCircadian = { ...(state.importedData.lightCircadian || {}), skinType: 'II — fair' };
      state.importedData.sunSessions = [{ id: 'completed-sun', startedAt: 100, endedAt: 200, doses: { original: true } }];
      const scopes = await import('/js/context-source-registry.js'); scopes.setContextSourceEnabled(scopes.CONTEXT_SOURCE_IDS.LIGHT_SUN, true); scopes.setContextSourceEnabled(scopes.CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true);
      if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic Sun seed failed');
      await (await import('/js/nutrition-store.js')).hydrateNutritionSummary(id); const api = await import('/js/api.js');
      if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('glm-5-fixture'); api.setVeniceE2EE(false); }
      else { await api.saveCustomApiConnection('https://synthetic-sun-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('glm-5-fixture'); }
      api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
    }, provider);
    const receipt = () => page.evaluate(async () => { const { state } = await import('/js/state.js'); return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!); });
    const before = await receipt();
    for (stage = 0; stage < stages.length; stage++) {
      round = 0; const previous = await receipt(); await page.locator('#chat-input').fill(stages[stage]!.statement); await page.locator('#chat-send-btn').click();
      const pending = page.locator('.chat-agent-draft-pending'); await expect(pending).toContainText('Light & Sun Setup'); expect(await receipt()).toEqual(previous);
      if (stage === 1) await expect(pending).toContainText('IV — olive'); if (stage === 2) await expect(pending).toContainText('Unreported habits remain unknown');
      await pending.getByRole('button', { name: decision === 'apply' ? 'Apply' : 'Discard', exact: true }).click(); await expect(page.locator(`.chat-agent-draft-${decision === 'apply' ? 'applied' : 'discarded'}`)).toHaveCount(stage + 1);
    }
    const saved = await receipt();
    if (decision === 'discard') expect(saved).toEqual(before);
    else {
      expect(saved.sunDefaults.homeLight).toBe('led-warm'); expect(saved.sunDefaults.fitzpatrick).toBe('IV'); expect(saved.sunDefaults.ott).toEqual({ 'dim-workspace': true }); expect(saved.sunDefaults.ottScore).toBeNull();
      expect(saved.sunDefaults.completedAt).toBe(1); expect(saved.sunDefaults.setupHistory).toHaveLength(3); expect(saved.sunDefaults.setupHistory[0].defaults).toEqual(before.sunDefaults);
      expect(saved.lightCircadian).toEqual({ ...before.lightCircadian, skinType: 'IV — olive' });
      const protectedFields = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !['sunDefaults', 'lightCircadian'].includes(key)));
      expect(protectedFields(saved)).toEqual(protectedFields(before));
    }
    await page.reload(); await page.waitForFunction(async () => !!(await import('/js/state.js')).state.currentProfile); expect(await receipt()).toEqual(saved);
    await page.evaluate(async () => {
      (await import('/js/api.js')).setAIPaused(true); const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies((await import('/js/state.js')).state.currentProfile) });
      const result = await runtime.execute({ tool: 'getbased_navigate', arguments: { view: 'light' } }); if (!result.success) throw new Error(result.contentItems[0].text);
    });
    const closeChat = page.getByRole('button', { name: 'Close chat', exact: true }); if (await closeChat.isVisible()) await closeChat.click();
    await page.locator('[data-light-setup-action="reopen"]').first().click();
    await expect(page.locator('[data-choice-group="setup-homelight"][aria-pressed="true"]')).toContainText(decision === 'apply' ? 'warm white' : 'Incandescent');
    await expect(page.locator(`[data-light-setup-skin-idx="${decision === 'apply' ? '3' : '1'}"]`)).toHaveAttribute('aria-checked', 'true');
    expect(errors).toEqual([]);
  });
}
