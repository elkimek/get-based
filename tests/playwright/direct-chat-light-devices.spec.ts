import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'discard'] as const) {
  test(`${provider} ${protocol} device/session ${decision} reviews recalculation and retained history`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?device-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
    const statements = { duration: 'My recorded panel session was actually 20 minutes, not 10.', specification: 'My panel reference irradiance is actually 40 mW per square centimetre at its recorded 15 cm reference distance.', removeDevice: 'Remove my panel from my saved Light devices, keeping its recorded sessions.' };
    let stage: keyof typeof statements = 'duration', round = 0, sessionId = '';
    const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://synthetic-device-provider.example/v1/chat/completions';
    await page.route(endpoint, async route => {
      const body = route.request().postDataJSON(); expect(body.model).toBe('glm-5-fixture');
      expect(JSON.stringify(body)).not.toMatch(/device-private-sentinel|\/private\//);
      if (String(body.messages[0]?.content || '').includes('You evaluate a single')) {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{"dot":"gray","tip":"Controlled device verdict","detail":"Synthetic recorded-session fixture."}' }, finish_reason: 'stop' }] }) }); return;
      }
      if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
      const result = () => protocol === 'native' ? JSON.parse(body.messages.at(-1).content) : JSON.parse(body.messages.at(-1).content.slice(body.messages.at(-1).content.indexOf('{"id":'))).output;
      const resource = stage === 'duration' ? 'lightDeviceSessions' : 'lightDevices'; let call: AIToolCall | undefined;
      if (round === 0) call = { id: `read-${stage}`, type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource, recordId: stage === 'duration' ? sessionId : 'dev-panel' }) } };
      else if (round === 1) {
        const response = result(); expect(response.success).toBe(true); const snapshot = JSON.parse(response.contentItems[0].text);
        call = { id: `draft-${stage}`, type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource, operation: stage === 'removeDevice' ? 'remove' : 'update', snapshotId: snapshot.snapshotId, patch: stage === 'duration' ? '{"durationMin":20}' : stage === 'specification' ? '{"mwPerCm2At15cm":40}' : '{}', evidence: statements[stage], reason: 'The user explicitly reported this correction or removal.' }) } };
      } else if (round === 2) {
        const response = result(); expect(response.success).toBe(true); const review = JSON.parse(response.contentItems[0].text).review; expect(review.applied).toBe(false);
        if (stage === 'removeDevice') expect(review.effects.retainedSessionCount).toBe(1);
        else { expect(review.effects.recalculatedSessions).toHaveLength(1); expect(review.effects.recalculatedSessions[0].afterDoses.pbm_red).toBeCloseTo(review.effects.recalculatedSessions[0].beforeDoses.pbm_red * 2, 8); }
      }
      round++; const reply = 'Review the device/session change and retained history before applying.';
      if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.goto('/app');
    sessionId = await page.evaluate(async provider => {
      const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic device proposal', { sex: 'female', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed');
      localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profiles.switchProfile(id);
      const { state } = await import('/js/state.js'); state.importedData.nutritionMeals = [];
      state.importedData.lightDevices = [{ id: 'dev-panel', brand: 'Synthetic', model: 'Panel', type: 'combined', peakWavelengths: [660, 850], peakShares: [0.5, 0.5], peakShareBasis: 'reported', mwPerCm2At15cm: 20, recommendedDistanceCm: 15, distanceModel: 'reference-only', irradianceBasis: 'user-entered', annotation: 'device-private-sentinel', specSourceUrl: '/private/device-spec.pdf' }];
      state.importedData.contextNotes = 'Keep this unrelated note';
      const scopes = await import('/js/context-source-registry.js'); scopes.setContextSourceEnabled(scopes.CONTEXT_SOURCE_IDS.LIGHT_SUN, true);
      if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic device seed failed');
      const session = await (await import('/js/light-devices-store.js')).logDeviceSession({ deviceId: 'dev-panel', durationMin: 10, distanceCm: 15, bodyArea: 'torso', eyesProtected: true });
      if (!session?.endedAt) throw new Error('Synthetic completed session failed'); session.startedAt -= 3600000; session.endedAt -= 3600000;
      if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic historical timing failed');
      await (await import('/js/nutrition-store.js')).hydrateNutritionSummary(id); const api = await import('/js/api.js');
      if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('glm-5-fixture'); api.setVeniceE2EE(false); }
      else { await api.saveCustomApiConnection('https://synthetic-device-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('glm-5-fixture'); }
      api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel(); return session.id;
    }, provider);
    const receipt = () => page.evaluate(async () => { const { state } = await import('/js/state.js'); return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!); });
    const before = await receipt();
    for (const [index, next] of (['duration', 'specification', 'removeDevice'] as const).entries()) {
      stage = next; round = 0; const previous = await receipt(); await page.locator('#chat-input').fill(statements[stage]); await page.locator('#chat-send-btn').click();
      const pending = page.locator('.chat-agent-draft-pending'); await expect(pending).toContainText(stage === 'duration' ? 'Light Device Sessions' : 'Light Devices');
      await expect(pending).toContainText(stage === 'removeDevice' ? 'Preserved sessions' : 'Recalculated sessions'); expect(await receipt()).toEqual(previous);
      await pending.getByRole('button', { name: decision === 'apply' ? 'Apply' : 'Discard', exact: true }).click(); await expect(page.locator(`.chat-agent-draft-${decision === 'apply' ? 'applied' : 'discarded'}`)).toHaveCount(index + 1);
    }
    const saved = await receipt();
    if (decision === 'discard') expect(saved).toEqual(before);
    else {
      expect(saved.lightDevices).toEqual([]); expect(saved.deviceSessions).toHaveLength(1); const session = saved.deviceSessions[0];
      expect(session.durationMin).toBe(20); expect(session.endedAt).toBe(session.startedAt + 20 * 60000); expect(session.deviceSnapshot.mwPerCm2At15cm).toBe(40); expect(session.doses.pbm_red).toBeCloseTo(before.deviceSessions[0].doses.pbm_red * 4, 8); expect(session.editHistory).toHaveLength(2); expect(session.editHistory[0].record.durationMin).toBe(10); expect(session.editHistory[1].record.deviceSnapshot.mwPerCm2At15cm).toBe(20);
      const protectedFields = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !['lightDevices', 'deviceSessions', '_deleted', '_deletedAt', '_deletedClearedAt'].includes(key)));
      expect(protectedFields(saved)).toEqual(protectedFields(before));
    }
    await page.reload(); await page.waitForFunction(async () => !!(await import('/js/state.js')).state.currentProfile); expect(await receipt()).toEqual(saved);
    await page.evaluate(async () => { const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies((await import('/js/state.js')).state.currentProfile) }); const result = await runtime.execute({ tool: 'getbased_navigate', arguments: { view: 'light' } }); if (!result.success) throw new Error(result.contentItems[0].text); });
    const row = page.locator(`[data-light-history-row][data-id="${sessionId}"]`); await expect(row).toContainText('Synthetic Panel'); await expect(row).toContainText(decision === 'apply' ? '20 min' : '10 min');
    await expect(page.locator('.light-device-card')).toHaveCount(decision === 'apply' ? 0 : 1); expect(errors).toEqual([]);
  });
}
