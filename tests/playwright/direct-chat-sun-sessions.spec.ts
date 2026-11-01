import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import { installSunWeatherFixture } from '../helpers/sun-weather-fixture.js';
for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'discard'] as const) {
  test(`${provider} ${protocol} Sun session ${decision} persists to the ordinary editor`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?sun-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
    const reportedStart = new Date(Date.now() - 7200000).toISOString();
    const stages = [
      { statement: 'That recorded outdoor Sun session lasted twenty minutes.', patch: { durationMin: 20 }, operation: 'update' },
      { statement: 'My eyes were exposed for five minutes during that Sun session.', patch: { eyeDurationMin: 5 }, operation: 'update' },
      { statement: 'Remove that recorded Sun session and its local history.', patch: {}, operation: 'remove' },
      { statement: `Record fifteen minutes outdoors starting at ${reportedStart}. I have not reported other exposure details.`, patch: { startedAt: reportedStart, durationMin: 15 }, operation: 'add' },
    ];
    let createdId = '';
    let stage = 0, round = 0;
    const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://synthetic-sun-session-provider.example/v1/chat/completions';
    await page.route('**/*', route => { const url = new URL(route.request().url()); return ['localhost', '127.0.0.1'].includes(url.hostname) || url.href === endpoint ? route.fallback() : route.abort(); });
    const weatherCalls = await installSunWeatherFixture(page);
    await page.route(endpoint, async route => {
      const body = route.request().postDataJSON(); expect(body.model).toBe('glm-5-fixture'); expect(JSON.stringify(body)).not.toMatch(/sun-session-private-sentinel|\/private\/|12\.34567|45\.12345/);
      if (/^You (?:evaluate|interpret|summarize)/.test(String(body.messages[0]?.content || ''))) { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{\"dot\":\"gray\",\"tip\":\"Controlled Sun interpretation\",\"detail\":\"Recorded source facts.\"}' }, finish_reason: 'stop' }] }) }); return; }
      if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
      const result = () => protocol === 'native' ? JSON.parse(body.messages.at(-1).content) : JSON.parse(body.messages.at(-1).content.slice(body.messages.at(-1).content.indexOf('{"id":'))).output;
      let call: AIToolCall | undefined;
      if (round === 0) call = { id: `read-sun-${stage}`, type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource: 'sunSessions', ...(stage === 3 ? { create: true } : { recordId: 'sun-recorded' }) }) } };
      if (round === 1) {
        const response = result(); expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text); if (stage === 3) createdId = current.recordId;
        call = { id: `draft-sun-${stage}`, type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'sunSessions', operation: stages[stage]!.operation, snapshotId: current.snapshotId, patch: JSON.stringify(stages[stage]!.patch), evidence: stages[stage]!.statement, reason: 'The user explicitly reported this changed Sun session fact.' }) } };
      }
      if (round === 2) { const response = result(); expect(response.success).toBe(true); expect(JSON.parse(response.contentItems[0].text).review.applied).toBe(false); }
      round++; const reply = 'Review your Sun session change before applying.';
      if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.addInitScript(() => { for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
    await page.goto('/app');
    await page.locator('html[data-app-ready]').waitFor();
    await page.evaluate(async provider => {
      const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic Sun session proposal', { sex: 'female', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed');
      localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profiles.switchProfile(id);
      const { state } = await import('/js/state.js'); state.importedData.nutritionMeals = []; state.importedData.contextNotes = 'Keep unrelated context';
      const now = Date.now(); state.importedData.sunDefaults = { fitzpatrick: 'III' };
      state.importedData.sunSessions = [{ id: 'sun-recorded', startedAt: now - 3600000, endedAt: now - 3000000, durationMin: 10,
        location: { lat: 12.34567, lon: 45.12345, source: '/private/location' }, bodyExposure: { fraction: 0.05, glassBetween: false, sunscreenSPF: 0, rotatedSides: false },
        eyeExposure: { mode: 'direct', durationSec: 120 }, posture: 'standing', surfaceAlbedo: 'grass', notes: 'Original note', doses: { vitamin_d: 2 }, safety: { sed: 1 },
        exposureSegments: [{ durationMin: 10, doses: { vitamin_d: 2 } }], aiAnalysis: { detail: 'sun-session-private-sentinel' }, calculationStatus: 'computed', engineVersion: 9 }];
      const scopes = await import('/js/context-source-registry.js'); scopes.setContextSourceEnabled(scopes.CONTEXT_SOURCE_IDS.LIGHT_SUN, true); scopes.setContextSourceEnabled(scopes.CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true);
      if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic Sun seed failed');
      await (await import('/js/nutrition-store.js')).hydrateNutritionSummary(id); const api = await import('/js/api.js');
      if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('glm-5-fixture'); api.setVeniceE2EE(false); }
      else { await api.saveCustomApiConnection('https://synthetic-sun-session-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('glm-5-fixture'); }
      api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
    }, provider);
    const receipt = () => page.evaluate(async () => { const { state } = await import('/js/state.js'); return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!); });
    const before = await receipt();
    for (stage = 0; stage < stages.length; stage++) {
      round = 0; const previous = await receipt(); await page.locator('#chat-input').fill(stages[stage]!.statement); await page.locator('#chat-send-btn').click();
      const pending = page.locator('.chat-agent-draft-pending'); await expect(pending).toContainText('Sun Sessions'); expect(await receipt()).toEqual(previous);
      if (stage < 2) await expect(pending).toContainText('Recalculation'); if (stage === 3) await expect(pending).toContainText('Unknown exposure details');
      await pending.getByRole('button', { name: decision === 'apply' ? 'Apply' : 'Discard', exact: true }).click(); await expect(page.locator(`.chat-agent-draft-${decision === 'apply' ? 'applied' : 'discarded'}`)).toHaveCount(stage + 1);
      if (decision === 'apply' && stage < 2) {
        const row = (await receipt()).sunSessions[0]; expect(row.durationMin).toBe(20); expect(row.eyeExposure.durationSec).toBe(stage === 0 ? 120 : 300);
        expect(row.editHistory[0].record).toEqual(before.sunSessions[0]); expect(row.calculationStatus).toBe('computed'); expect(Object.keys(row.doses)).toContain('vitamin_d'); expect(Object.values(row.doses).every(value => typeof value === 'number' && Number.isFinite(value))).toBe(true); expect(weatherCalls()).toBeGreaterThan(0);
      }
    }
    const saved = await receipt();
    if (decision === 'discard') expect(saved).toEqual(before);
    else {
      expect(saved.sunSessions).toHaveLength(1); const row = saved.sunSessions[0]; expect(row.id).toBe(createdId); expect(row.startedAt).toBe(Date.parse(reportedStart)); expect(row.durationMin).toBe(15);
      expect(row.bodyExposure?.fraction ?? null).toBeNull(); expect(row.eyeExposure?.mode ?? null).toBeNull(); expect(row.posture ?? null).toBeNull(); expect(row.calculationStatus).toBe('needs-inputs'); expect(row.doses).toBeNull(); expect(saved._deleted.sunSessions).toContain('sun-recorded');
      const protectedFields = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !['sunSessions', '_deleted', '_deletedAt', '_deletedClearedAt'].includes(key)));
      expect(protectedFields(saved)).toEqual(protectedFields(before));
    }
    await page.reload(); await page.locator('html[data-app-ready]').waitFor(); await page.waitForFunction(async () => !!(await import('/js/state.js')).state.currentProfile); expect(await receipt()).toEqual(saved);
    await page.evaluate(async () => {
      (await import('/js/api.js')).setAIPaused(true); const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies((await import('/js/state.js')).state.currentProfile) });
      const result = await runtime.execute({ tool: 'getbased_navigate', arguments: { view: 'light' } }); if (!result.success) throw new Error(result.contentItems[0].text);
    });
    const closeChat = page.getByRole('button', { name: 'Close chat', exact: true }); if (await closeChat.isVisible()) await closeChat.click();
    const row = page.locator(`[data-light-history-row][data-id="${decision === 'apply' ? createdId : 'sun-recorded'}"]`); await expect(row).toBeVisible();
    await expect(row).toContainText(decision === 'apply' ? '15 min' : '10 min');
    if (decision === 'apply') { await expect(row).toContainText('Exposure details needed'); await row.click(); const detail = page.getByRole('dialog').filter({ hasText: 'Sun session' }); await expect(detail).toContainText('Skin · Not recorded'); }
    expect(errors).toEqual([]);
  });
}
