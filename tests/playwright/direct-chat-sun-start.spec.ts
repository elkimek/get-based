import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import { installSunWeatherFixture } from '../helpers/sun-weather-fixture.js';
for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'discard'] as const) {
  test(`${provider} ${protocol} Sun timer start ${decision} preserves reported and unknown inputs`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?sun-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
    const full = { regions: ['face'], useSavedLocation: true, sunscreenSPF: 0, glassBetween: false, eyeMode: 'direct', posture: 'standing', surfaceAlbedo: 'grass' };
    const partial = { regions: ['face'], useSavedLocation: true };
    const stages = [
      { statement: 'Start a Sun timer using my saved location. Only my face is uncovered, no sunscreen or glass, eyes uncovered, standing on grass.', patch: full, operation: 'start' },
      { statement: 'Stop my Sun timer now.', patch: {}, operation: 'stop' },
      { statement: 'Start another Sun timer using my saved location and only my face uncovered. Other exposure details are unreported.', patch: partial, operation: 'start' },
      { statement: 'Stop my Sun timer now.', patch: {}, operation: 'stop' },
    ];
    let createdId = '', fullId = '';
    let stage = 0, round = 0;
    const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://synthetic-sun-timer-provider.example/v1/chat/completions';
    await page.route('**/*', route => { const url = new URL(route.request().url()); return ['localhost', '127.0.0.1'].includes(url.hostname) || url.href === endpoint ? route.fallback() : route.abort(); });
    const weatherCalls = await installSunWeatherFixture(page);
    await page.route(endpoint, async route => {
      const body = route.request().postDataJSON(); expect(body.model).toBe('glm-5-fixture'); expect(JSON.stringify(body)).not.toMatch(/sun-session-private-sentinel|\/private\/|12\.34567|45\.12345/);
      if (/^You (?:evaluate|interpret|summarize)/.test(String(body.messages[0]?.content || ''))) { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{\"dot\":\"gray\",\"tip\":\"Controlled Sun interpretation\",\"detail\":\"Recorded source facts.\"}' }, finish_reason: 'stop' }] }) }); return; }
      if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
      const result = () => protocol === 'native' ? JSON.parse(body.messages.at(-1).content) : JSON.parse(body.messages.at(-1).content.slice(body.messages.at(-1).content.indexOf('{"id":'))).output;
      let call: AIToolCall | undefined;
      if (round === 0) call = { id: `read-sun-${stage}`, type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource: 'sunSessions', ...(stage % 2 === 0 ? { create: true } : { recordId: createdId }) }) } };
      if (round === 1) {
        const response = result(); expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text); if (stage % 2 === 0) { createdId = current.recordId; if (!stage) fullId = createdId; expect(current.requirements.start).toEqual({ skinTypeConfigured: true, savedLocationSpecific: true, activeSessionId: null }); }
        call = { id: `draft-sun-${stage}`, type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'sunSessions', operation: stages[stage]!.operation, snapshotId: current.snapshotId, patch: JSON.stringify(stages[stage]!.patch), evidence: stages[stage]!.statement, reason: 'The user explicitly reported this changed Sun session fact.' }) } };
      }
      if (round === 2) { const response = result(); expect(response.success).toBe(true); expect(JSON.parse(response.contentItems[0].text).review.applied).toBe(false); }
      round++; const reply = 'Review your Sun session change before applying.';
      if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.goto('/app');
    await page.evaluate(async provider => {
      const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic Sun timer proposal', { sex: 'female', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed');
      localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profiles.switchProfile(id);
      const { state } = await import('/js/state.js'); state.importedData.nutritionMeals = []; state.importedData.contextNotes = 'Keep unrelated context';
      state.importedData.sunDefaults = { fitzpatrick: 'III', coords: { lat: 12.34567, lon: 45.12345 } }; state.importedData.sunSessions = [];
      const scopes = await import('/js/context-source-registry.js'); scopes.setContextSourceEnabled(scopes.CONTEXT_SOURCE_IDS.LIGHT_SUN, true); scopes.setContextSourceEnabled(scopes.CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true);
      if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic Sun seed failed');
      await (await import('/js/nutrition-store.js')).hydrateNutritionSummary(id); const api = await import('/js/api.js');
      if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('glm-5-fixture'); api.setVeniceE2EE(false); }
      else { await api.saveCustomApiConnection('https://synthetic-sun-timer-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('glm-5-fixture'); }
      api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
    }, provider);
    const receipt = () => page.evaluate(async () => { const { state } = await import('/js/state.js'); return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!); });
    const before = await receipt();
    const protect = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !['sunSessions', '_deleted', '_deletedAt', '_deletedClearedAt'].includes(key)));
    let weatherBeforePartial = 0;
    for (stage = 0; stage < stages.length; stage++) {
      if (decision === 'discard' && stage % 2 === 1) continue;
      round = 0; const previous = await receipt(); if (stage === 2) weatherBeforePartial = weatherCalls();
      await page.locator('#chat-input').fill(stages[stage]!.statement); await page.locator('#chat-send-btn').click();
      const pending = page.locator('.chat-agent-draft-pending'); await expect(pending).toContainText('Sun Sessions'); await expect(pending).toContainText('Action timing'); await expect(pending).toContainText('when you Apply'); expect(await receipt()).toEqual(previous);
      if (stage % 2 === 0) await expect(pending).toContainText('Start timer');
      const applying = Date.now(); await pending.getByRole('button', { name: decision === 'apply' ? 'Apply' : 'Discard', exact: true }).click();
      await expect(page.locator(`.chat-agent-draft-${decision === 'apply' ? 'applied' : 'discarded'}`)).toHaveCount(decision === 'apply' ? stage + 1 : stage / 2 + 1);
      const saved = await receipt(); expect(protect(saved)).toEqual(protect(before));
      if (decision === 'discard') { expect(saved).toEqual(previous); continue; }
      const row = saved.sunSessions.find((row: { id: string }) => row.id === createdId); expect(row.reportedInputsVersion).toBe(1); expect(row.bodyExposure.regions).toEqual(['face']);
      if (stage % 2 === 0) { expect(row.startedAt).toBeGreaterThanOrEqual(applying); expect(row.endedAt).toBeNull(); expect(row.durationMin).toBeUndefined(); }
      else { expect(row.endedAt).toBeGreaterThanOrEqual(applying); expect(row.durationMin).toBeGreaterThan(0); }
      if (stage < 2) { expect(row.bodyExposure.sunscreenSPF).toBe(0); expect(row.eyeExposure.mode).toBe('direct'); expect(row.eyeExposure.lensTint).toBeUndefined(); if (stage === 1) { expect(row.calculationStatus).toBe('computed'); expect(Object.keys(row.doses)).toContain('vitamin_d'); expect(weatherCalls()).toBeGreaterThan(0); } }
      else { expect(row.bodyExposure.sunscreenSPF ?? null).toBeNull(); expect(row.bodyExposure.glassBetween ?? null).toBeNull(); expect(row.eyeExposure?.mode ?? null).toBeNull(); expect(row.posture ?? null).toBeNull(); expect(row.calculationStatus).toBe('needs-inputs'); expect(row.doses).toBeNull(); expect(weatherCalls()).toBe(weatherBeforePartial); }
    }
    await page.evaluate(async () => { (await import('/js/api.js')).setAIPaused(true); (await import('/js/sun-active-session.js')).resetSunActiveSessionState(); });
    const saved = await receipt();
    await page.reload(); await page.waitForFunction(async () => !!(await import('/js/state.js')).state.currentProfile); expect(await receipt()).toEqual(saved);
    await page.evaluate(async () => {
      (await import('/js/api.js')).setAIPaused(true); const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies((await import('/js/state.js')).state.currentProfile) });
      const result = await runtime.execute({ tool: 'getbased_navigate', arguments: { view: 'light' } }); if (!result.success) throw new Error(result.contentItems[0].text);
    });
    const closeChat = page.getByRole('button', { name: 'Close chat', exact: true }); if (await closeChat.isVisible()) await closeChat.click();
    if (decision === 'apply') {
      const row = page.locator(`[data-light-history-row][data-id="${createdId}"]`); await expect(row).toBeVisible(); await expect(row).toContainText('Exposure details needed');
      await row.click(); const detail = page.getByRole('dialog').filter({ hasText: 'Sun session' }); await expect(detail).toContainText('Unknown inputs have not been replaced');
      const full = (await receipt()).sunSessions.find((row: { id: string }) => row.id === fullId); expect(full.calculationStatus).toBe('computed');
    } else expect((await receipt()).sunSessions).toEqual([]);
    expect(errors).toEqual([]);
  });
}
