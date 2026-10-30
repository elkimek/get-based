import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'discard'] as const) {
  test(`${provider} ${protocol} measurement/checkpoint ${decision} preserves frozen evidence`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?measurement-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
    const statements = { value: 'My office meter reading was actually 250 lux.', checkpoint: 'Save a checkpoint of my current light environment called Baseline.', label: 'Rename that light checkpoint After correction.', remove: 'Remove my current office lux reading, keeping my saved audit checkpoints.', removeRoom: 'Remove my office room, keeping my saved audit checkpoints.' };
    let stage: keyof typeof statements = 'value', round = 0, checkpointId = '';
    const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://synthetic-measurement-provider.example/v1/chat/completions';
    await page.route(endpoint, async route => {
      const body = route.request().postDataJSON(); expect(body.model).toBe('glm-5-fixture'); expect(JSON.stringify(body)).not.toMatch(/measurement-private-sentinel|\/private\//);
      if (/^You (?:evaluate|interpret|summarize)/.test(String(body.messages[0]?.content || ''))) {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{"dot":"gray","tip":"Controlled light interpretation","detail":"Reported facts and frozen source evidence."}' }, finish_reason: 'stop' }] }) }); return;
      }
      if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
      const result = () => protocol === 'native' ? JSON.parse(body.messages.at(-1).content) : JSON.parse(body.messages.at(-1).content.slice(body.messages.at(-1).content.indexOf('{"id":'))).output;
      const resource = stage === 'checkpoint' || stage === 'label' ? 'lightAudits' : stage === 'removeRoom' ? 'lightRooms' : 'lightMeasurements'; let call: AIToolCall | undefined;
      if (round === 0) call = { id: `read-${stage}`, type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource, ...(stage === 'checkpoint' ? { create: true } : { recordId: stage === 'label' ? decision === 'apply' ? checkpointId : 'audit-before' : stage === 'removeRoom' ? 'room-office' : 'measure-office' }) }) } };
      if (round === 1) {
        const response = result(); expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text); if (stage === 'checkpoint') checkpointId = current.recordId;
        call = { id: `draft-${stage}`, type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource, operation: stage === 'checkpoint' ? 'add' : stage === 'remove' || stage === 'removeRoom' ? 'remove' : 'update', snapshotId: current.snapshotId,
          patch: stage === 'value' ? '{"value":250,"unit":"lux"}' : stage === 'checkpoint' ? '{"label":"Baseline"}' : stage === 'label' ? '{"label":"After correction"}' : '{}', evidence: statements[stage], reason: 'The user explicitly reported this correction or checkpoint operation.' }) } };
      }
      if (round === 2) {
        const response = result(); expect(response.success).toBe(true); const review = JSON.parse(response.contentItems[0].text).review; expect(review.applied).toBe(false);
        if (stage === 'checkpoint') expect(review.effects.capturedCounts).toEqual({ rooms: 1, screens: 0, measurements: 1 });
        if (stage === 'value' || stage === 'remove') expect(review.effects.preservedAuditCount).toBe(decision === 'apply' && stage === 'remove' ? 2 : 1);
      }
      round++; const reply = 'Review the reading or frozen checkpoint before applying.';
      if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.goto('/app');
    await page.evaluate(async provider => {
      const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic measurement proposal', { sex: 'female', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed');
      localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profiles.switchProfile(id);
      const { state } = await import('/js/state.js'); state.importedData.nutritionMeals = []; state.importedData.contextNotes = 'Keep this unrelated note';
      state.importedData.lightEnvironment = { rooms: [{ id: 'room-office', name: 'Office', primarySource: 'led-warm', hoursOccupiedPerDay: 8, annotation: '/private/room-source' }], screens: [] };
      state.importedData.lightMeasurements = [{ id: 'measure-office', tool: 'lux', value: 100, capturedAt: Date.now() - 3600000, roomId: 'room-office', confidence: 0.85, extra: { source: 'manual-entry', context: 'daytime', annotation: 'measurement-private-sentinel' } }];
      state.importedData.lightAudits = [{ id: 'audit-before', date: '2026-10-23', label: 'Original', notes: '', createdAt: 1792749600000, rooms: structuredClone(state.importedData.lightEnvironment.rooms), screens: [], measurements: structuredClone(state.importedData.lightMeasurements) }];
      const scopes = await import('/js/context-source-registry.js'); scopes.setContextSourceEnabled(scopes.CONTEXT_SOURCE_IDS.LIGHT_SUN, true);
      if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic measurement seed failed');
      await (await import('/js/nutrition-store.js')).hydrateNutritionSummary(id); const api = await import('/js/api.js');
      if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('glm-5-fixture'); api.setVeniceE2EE(false); }
      else { await api.saveCustomApiConnection('https://synthetic-measurement-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('glm-5-fixture'); }
      api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
    }, provider);
    const receipt = () => page.evaluate(async () => { const { state } = await import('/js/state.js'); return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!); });
    const before = await receipt();
    for (const [index, next] of (['value', 'checkpoint', 'label', 'remove', 'removeRoom'] as const).entries()) {
      stage = next; round = 0; const previous = await receipt(); await page.locator('#chat-input').fill(statements[stage]); await page.locator('#chat-send-btn').click();
      const pending = page.locator('.chat-agent-draft-pending'); await expect(pending).toContainText(stage === 'checkpoint' || stage === 'label' ? 'Light Audits' : stage === 'removeRoom' ? 'Light Rooms' : 'Light Measurements'); expect(await receipt()).toEqual(previous);
      if (stage === 'checkpoint') await expect(pending).toContainText('Frozen checkpoint'); else if (stage === 'value' || stage === 'remove') await expect(pending).toContainText('Preserved checkpoints');
      await pending.getByRole('button', { name: decision === 'apply' ? 'Apply' : 'Discard', exact: true }).click(); await expect(page.locator(`.chat-agent-draft-${decision === 'apply' ? 'applied' : 'discarded'}`)).toHaveCount(index + 1);
      if (stage === 'checkpoint' && decision === 'apply') await expect.poll(async () => (await receipt()).lightAudits.find((row: { id: string }) => row.id === checkpointId)?.aiAnalysis?.status).toBe('ok');
    }
    const saved = await receipt();
    if (decision === 'discard') expect(saved).toEqual(before);
    else {
      expect(saved.lightMeasurements).toEqual([]); expect(saved.lightEnvironment.rooms).toEqual([]); expect(saved.lightAudits).toHaveLength(2); expect(saved.lightAudits[0]).toEqual(before.lightAudits[0]);
      const checkpoint = saved.lightAudits.find((row: { id: string }) => row.id === checkpointId); expect(checkpoint.label).toBe('After correction'); expect(checkpoint.measurements[0].value).toBe(250); expect(checkpoint.measurements[0].readingHistory[0].record.value).toBe(100); expect(checkpoint.metadataHistory).toHaveLength(1);
      const protectedFields = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !['lightMeasurements', 'lightAudits', 'lightEnvironment', '_deleted', '_deletedAt', '_deletedClearedAt'].includes(key)));
      expect(saved.lightEnvironment).toEqual({ ...before.lightEnvironment, rooms: [] }); expect(protectedFields(saved)).toEqual(protectedFields(before));
    }
    await page.reload(); await page.waitForFunction(async () => !!(await import('/js/state.js')).state.currentProfile); expect(await receipt()).toEqual(saved);
    await page.evaluate(async () => { (await import('/js/api.js')).setAIPaused(true); const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies((await import('/js/state.js')).state.currentProfile) }); const result = await runtime.execute({ tool: 'getbased_navigate', arguments: { view: 'light' } }); if (!result.success) throw new Error(result.contentItems[0].text); });
    const closeChat = page.getByRole('button', { name: 'Close chat', exact: true }); if (await closeChat.isVisible()) await closeChat.click();
    await page.locator('#sidebar-nav').getByRole('button', { name: /^Light assessment/ }).click();
    await page.locator('[data-light-env-action="toggle-audits-block"]').click();
    await expect(page.locator('.light-audit-card').filter({ hasText: decision === 'apply' ? 'After correction' : 'Original' })).toBeVisible(); expect(errors).toEqual([]);
  });
}
