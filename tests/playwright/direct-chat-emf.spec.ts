import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'discard'] as const) {
  test(`${provider} ${protocol} EMF ${decision} persists to the ordinary editor`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?emf-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
    const stages = [
      { statement: 'My bedroom AC electric reading is now 2 V/m.', resource: 'emfMeasurements', patch: { value: 2, unit: 'V/m' } },
      { statement: 'I now turn the bedroom WiFi off at night, keeping the existing custom mitigation.', resource: 'emfRooms', patch: { mitigations: ['custom mitigation', 'WiFi off at night'] } },
      { statement: 'The assessment label should be Corrected bedroom report.', resource: 'emfAssessments', patch: { label: 'Corrected bedroom report' } },
    ];
    let stage = 0, round = 0;
    const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://synthetic-emf-provider.example/v1/chat/completions';
    await page.route(endpoint, async route => {
      const body = route.request().postDataJSON(); expect(body.model).toBe('glm-5-fixture'); expect(JSON.stringify(body)).not.toMatch(/emf-private-sentinel|\/private\//);
      if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
      const result = () => protocol === 'native' ? JSON.parse(body.messages.at(-1).content) : JSON.parse(body.messages.at(-1).content.slice(body.messages.at(-1).content.indexOf('{"id":'))).output;
      let call: AIToolCall | undefined;
      if (round === 0) call = { id: `list-emf-${stage}`, type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource: stages[stage]!.resource }) } };
      if (round === 1) { const response = result(); expect(response.success).toBe(true); const rows = JSON.parse(response.contentItems[0].text); expect(rows.records).toHaveLength(1);
        call = { id: `read-emf-${stage}`, type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource: stages[stage]!.resource, recordId: rows.records[0].recordId }) } };
      }
      if (round === 2) {
        const response = result(); expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text);
        call = { id: `draft-emf-${stage}`, type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: stages[stage]!.resource, operation: 'update', snapshotId: current.snapshotId, patch: JSON.stringify(stages[stage]!.patch), evidence: stages[stage]!.statement, reason: 'The user reported a changed EMF record.' }) } };
      }
      if (round === 3) { const response = result(); expect(response.success).toBe(true); expect(JSON.parse(response.contentItems[0].text).review.applied).toBe(false); }
      round++; const reply = 'Review your EMF change before applying.';
      if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.addInitScript(() => { for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
    await page.goto('/app');
    await page.locator('html[data-app-ready]').waitFor();
    await page.evaluate(async provider => {
      const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic EMF proposal', { sex: 'female', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed');
      localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profiles.switchProfile(id);
      const { state } = await import('/js/state.js'); state.importedData.nutritionMeals = []; state.importedData.contextNotes = 'Keep unrelated context';
      state.importedData.emfAssessment = { assessments: [{ id: 'emf-assessment', date: '2026-10-20', label: 'Bedroom report', privateSource: '/private/emf-source', rooms: [{ name: 'Bedroom', sleeping: true, measurements: { acElectric: { value: 8, unit: 'V/m', meter: 'Meter', source: 'emf-private-sentinel' } }, sources: ['WiFi router'], mitigations: ['custom mitigation'] }] }] };
      const scopes = await import('/js/context-source-registry.js'); scopes.setContextSourceEnabled(scopes.CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true);
      if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic EMF seed failed');
      await (await import('/js/nutrition-store.js')).hydrateNutritionSummary(id); const api = await import('/js/api.js');
      if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('glm-5-fixture'); api.setVeniceE2EE(false); }
      else { await api.saveCustomApiConnection('https://synthetic-emf-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('glm-5-fixture'); }
      api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
    }, provider);
    const receipt = () => page.evaluate(async () => { const { state } = await import('/js/state.js'); return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!); });
    const before = await receipt();
    for (stage = 0; stage < stages.length; stage++) {
      round = 0; const previous = await receipt(); await page.locator('#chat-input').fill(stages[stage]!.statement); await page.locator('#chat-send-btn').click();
      const pending = page.locator('.chat-agent-draft-pending'); await expect(pending).toContainText('EMF'); await expect(pending).toContainText('Source history'); expect(await receipt()).toEqual(previous);
      await pending.getByRole('button', { name: decision === 'apply' ? 'Apply' : 'Discard', exact: true }).click(); await expect(page.locator(`.chat-agent-draft-${decision === 'apply' ? 'applied' : 'discarded'}`)).toHaveCount(stage + 1);
    }
    const saved = await receipt();
    if (decision === 'discard') expect(saved).toEqual(before);
    else {
      const assessment = saved.emfAssessment.assessments[0]; expect(assessment.label).toBe('Corrected bedroom report'); expect(assessment.rooms[0].measurements.acElectric.value).toBe(2);
      expect(assessment.rooms[0].mitigations).toEqual(['custom mitigation', 'WiFi off at night']); expect(assessment.editHistory).toHaveLength(3); expect(assessment.editHistory[0].snapshot).toEqual(before.emfAssessment.assessments[0]);
      const protectedFields = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'emfAssessment'));
      expect(protectedFields(saved)).toEqual(protectedFields(before));
    }
    await page.reload(); await page.waitForFunction(async () => !!(await import('/js/state.js')).state.currentProfile); expect(await receipt()).toEqual(saved);
    await page.evaluate(async () => {
      (await import('/js/api.js')).setAIPaused(true); const controller = await import('/js/emf.js'), editor = await import('/js/emf-editor.js');
      await controller.openEMFAssessmentEditor(); editor.emfEditorState.editingAssessmentId = 'emf-assessment'; editor.emfEditorState.activeRoomIdx = 0; editor.renderEMFEditor(document.getElementById('detail-modal'));
    });
    await expect(page.locator('[data-emf-measurement-type="acElectric"]')).toHaveValue(decision === 'apply' ? '2' : '8');
    await expect(page.locator('[data-emf-field="label"]')).toHaveValue(decision === 'apply' ? 'Corrected bedroom report' : 'Bedroom report');
    await expect(page.locator('.ctx-tag.active').filter({ hasText: 'custom mitigation' })).toBeVisible();
    if (decision === 'apply') await expect(page.locator('.ctx-tag.active').filter({ hasText: 'WiFi off at night' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
