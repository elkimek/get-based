import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import { installSunWeatherFixture } from '../helpers/sun-weather-fixture.js';
for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'discard'] as const) {
  test(`${provider} ${protocol} live Sun timer ${decision} persists to ordinary controls`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?sun-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
    const stages = [
      { statement: 'Pause my active Sun timer now.', patch: {}, operation: 'pause' },
      { statement: 'Resume my Sun timer now.', patch: {}, operation: 'resume' },
      { statement: 'I just applied SPF 30 during this active Sun timer. Record the change when I Apply.', patch: { sunscreenSPF: 30 }, operation: 'setSunscreen' },
      { statement: 'My face is the only uncovered body region now. Record this coverage change when I Apply.', patch: { regions: ['face'] }, operation: 'setCoverage' },
      { statement: 'I changed sides. Record that boundary when I Apply, keeping the exposed regions unchanged.', patch: {}, operation: 'rotateSides' },
      { statement: 'Stop my active Sun timer now.', patch: {}, operation: 'stop' },
    ];
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
      if (round === 0) call = { id: `read-sun-${stage}`, type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource: 'sunSessions', recordId: 'sun-active' }) } };
      if (round === 1) {
        const response = result(); expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text);
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
      const now = Date.now(); state.importedData.sunDefaults = { fitzpatrick: 'III' };
      state.importedData.sunSessions = [{ id: 'sun-active', startedAt: now - 600000, endedAt: null,
        location: { lat: 12.34567, lon: 45.12345, source: '/private/location' }, bodyExposure: { preset: 'face_hands', fraction: 0.05, glassBetween: false, sunscreenSPF: 0, rotatedSides: false },
        eyeExposure: { mode: 'direct', durationSec: null }, posture: 'standing', surfaceAlbedo: 'grass', notes: 'Original note', exposureSegments: [], accumulatedPausedMs: 0,
        aiAnalysis: { detail: 'sun-session-private-sentinel' }, calculationStatus: 'pending' }];
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
    for (stage = 0; stage < stages.length; stage++) {
      if (decision === 'discard') await page.evaluate(async stage => {
        const { state } = await import('/js/state.js'); const row = state.importedData.sunSessions![0]!;
        row.paused = stage === 1; if (row.paused) row.pausedAt = Date.now() - 1000; else delete row.pausedAt;
        if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic paused-state seed failed');
      }, stage);
      round = 0; const previous = await receipt(); await page.locator('#chat-input').fill(stages[stage]!.statement); await page.locator('#chat-send-btn').click();
      const pending = page.locator('.chat-agent-draft-pending'); await expect(pending).toContainText('Sun Sessions'); await expect(pending).toContainText('Action timing'); await expect(pending).toContainText('when you Apply'); expect(await receipt()).toEqual(previous);
      const applying = Date.now(); await pending.getByRole('button', { name: decision === 'apply' ? 'Apply' : 'Discard', exact: true }).click();
      await expect(page.locator(`.chat-agent-draft-${decision === 'apply' ? 'applied' : 'discarded'}`)).toHaveCount(stage + 1);
      const saved = await receipt(); expect(protect(saved)).toEqual(protect(before));
      if (decision === 'discard') { expect(saved).toEqual(previous); continue; }
      const row = saved.sunSessions[0]; expect(row.editHistory).toHaveLength(stage + 1); expect(row.editHistory[0].record).toEqual(before.sunSessions[0]);
      if (stage === 0) { expect(row.paused).toBe(true); expect(row.pausedAt).toBeGreaterThanOrEqual(applying); expect(row.exposureSegments).toHaveLength(1); }
      if (stage === 1) { expect(row.paused).toBe(false); expect(row.resumedAt).toBeGreaterThanOrEqual(applying); expect(row.accumulatedPausedMs).toBeGreaterThan(0); }
      if (stage === 2) { expect(row.bodyExposure.sunscreenSPF).toBe(30); expect(row.exposureSegments.at(-1).bodyExposure.sunscreenSPF).toBe(0); }
      if (stage === 3) { expect(row.bodyExposure.regions).toEqual(['face']); expect(row.exposureSegments.at(-1).bodyExposure.regions).toEqual([]); }
      if (stage === 4) { expect(row.bodyExposure.rotatedSides).toBe(true); expect(row.bodyExposure.regions).toEqual(['face']); }
      if (stage === 5) { expect(row.endedAt).toBeGreaterThanOrEqual(applying); expect(row.calculationStatus).toBe('computed'); expect(row.durationMin).toBeGreaterThan(10); expect(row.durationMin).toBeLessThan(11); expect(Object.keys(row.doses)).toContain('vitamin_d'); }
      expect(weatherCalls()).toBeGreaterThan(0);
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
      const row = page.locator('[data-light-history-row][data-id="sun-active"]'); await expect(row).toBeVisible(); await expect(row).toContainText('10 min');
      await row.click(); await expect(page.getByRole('dialog').filter({ hasText: 'Sun session' })).toContainText('Original note');
    } else {
      await expect(page.locator('[data-id="sun-active"]').first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}
