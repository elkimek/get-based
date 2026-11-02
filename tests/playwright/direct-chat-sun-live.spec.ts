import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import { CHAT_NATIVE_UI_NOTICE } from '../../shared/chat-control-policy.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import { installSunWeatherFixture } from '../helpers/sun-weather-fixture.js';
for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) {
  test(`${provider} ${protocol} live Sun timer actions remain native-only without changing saved timed inputs`, async ({ page }) => {
    const fixedNow = Date.now(); await page.clock.setFixedTime(new Date(fixedNow));
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
    const weatherCalls = await installSunWeatherFixture(page, fixedNow);
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
      if (round === 2) { const response = result(); expect(response.success).toBe(false); expect(response.contentItems[0].text).toBe(`Error: ${CHAT_NATIVE_UI_NOTICE}`); }
      round++; const reply = `Use the native Sun controls (${stage}).`;
      if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.addInitScript(() => { for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
    await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
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
    // Finish the native initial accrual before measuring chat's refusal boundary.
    // Fixed wall time keeps the live ticker from accruing unrelated new slices.
    await page.evaluate(async () => {
      await import('/js/sun.js');
      await (await import('/js/sun-active-session.js')).prepareSunLiveAction('sun-active');
      await (await import('/js/sun-sessions-store.js')).persistActiveSunSlice('sun-active');
    });
    const before = await receipt();
    expect(before.sunSessions[0]).toMatchObject({ id: 'sun-active', endedAt: null, accumulatedPausedMs: 0,
      location: { lat: 12.34567, lon: 45.12345, source: '/private/location' },
      bodyExposure: { preset: 'face_hands', fraction: 0.05, glassBetween: false, sunscreenSPF: 0, rotatedSides: false },
      aiAnalysis: { detail: 'sun-session-private-sentinel' } });
    expect(before.sunSessions[0].exposureSegments).toHaveLength(1);
    const weatherBefore = weatherCalls();
    for (stage = 0; stage < stages.length; stage++) {
      round = 0;
      await page.locator('#chat-input').fill(stages[stage]!.statement); await page.locator('#chat-send-btn').click();
      await expect(page.locator('#chat-messages')).toContainText(`Use the native Sun controls (${stage}).`);
      expect(round).toBe(3); await expect(page.locator('.chat-agent-draft-pending, .chat-agent-draft-applied')).toHaveCount(0);
      expect(await receipt()).toEqual(before); expect(weatherCalls()).toBe(weatherBefore);
    }
    await page.evaluate(async () => { (await import('/js/api.js')).setAIPaused(true); (await import('/js/sun-active-session.js')).resetSunActiveSessionState(); });
    await page.reload(); await page.locator('html[data-app-ready]').waitFor();
    expect(await receipt()).toEqual(before);
    await page.evaluate(async () => {
      const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies((await import('/js/state.js')).state.currentProfile) });
      const result = await runtime.execute({ tool: 'getbased_navigate', arguments: { view: 'light' } }); if (!result.success) throw new Error(result.contentItems[0].text);
    });
    const closeChat = page.getByRole('button', { name: 'Close chat', exact: true }); if (await closeChat.isVisible()) await closeChat.click();
    expect(await receipt()).toEqual(before);
    expect(errors).toEqual([]);
  });
}
