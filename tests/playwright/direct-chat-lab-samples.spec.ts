import { openLabSampleEditorForTest } from '../helpers/open-lab-sample-editor.js';
import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

for (const protocol of ['native', 'structured'] as const) for (const mode of ['move', 'create', 'discard'] as const) {
  test(`direct ${protocol} lab sample ${mode} preserves exact collection ownership`, async ({ page }) => {
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?sample-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
    const evidence = mode === 'move' ? 'My morning sample from 20 October was actually collected on 21 October 2026 at 09:30, not fasting, using plasma. Add sodium 140 mmol/l to it. Keep my separate evening sample unchanged.' : 'I have a separate new sample from 22 October 2026: glucose 108 mg/dL and insulin 10 mU/l. Its collection time, specimen and fasting status are unknown.';
    let round = 0, feedback = false, sodium = '';
    await page.route('https://synthetic-sample-provider.example/v1/chat/completions', async route => {
      const body = route.request().postDataJSON();
      if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
      const thanks = body.messages.some((message: { role: string; content: unknown }) => message.role === 'user' && message.content === 'Thanks.');
      let call: AIToolCall | undefined;
      if (thanks) { expect(body.messages[0].content).not.toMatch(/Fasting Insulin on 2026-10-20: (null|undefined)/); feedback = body.messages[0].content.includes('"resource":"labSamples"') && body.messages[0].content.includes('"status":"applied"'); }
      else if (round === 0) call = { id: 'read-sample', type: 'function', function: mode === 'move' ? { name: 'getbased_search_markers', arguments: JSON.stringify({ query: 'sodium', includeUnrecorded: true }) } : { name: 'getbased_read_data', arguments: JSON.stringify({ resource: 'labSamples', create: true }) } };
      else if (mode === 'move' && round === 1) {
        const last = body.messages.at(-1), result = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
        expect(result.success).toBe(true); const definitions = JSON.parse(result.contentItems[0].text); expect(definitions.catalogOnly).toBe(true); expect(definitions.matches.some((row: { key: string }) => row.key === sodium)).toBe(true); expect(JSON.stringify(definitions)).not.toContain('latestValue');
        call = { id: 'read-exact-sample', type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource: 'labSamples', recordId: 'morning' }) } };
      }
      else if (round === (mode === 'move' ? 2 : 1)) {
        const last = body.messages.at(-1), result = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
        expect(result.success).toBe(true); expect(JSON.stringify(result)).not.toMatch(/private-.*pdf|snapshot-secret/);
        const snapshot = JSON.parse(result.contentItems[0].text), patch = mode === 'move' ? { date: '2026-10-21', sampleTime: '09:30', fasting: false, specimen: 'plasma', results: [{ markerKey: sodium, value: 140, unit: 'mmol/l' }] } : { newSample: true, date: '2026-10-22', results: [{ markerKey: 'biochemistry.glucose', value: 108, unit: 'mg/dL' }, { markerKey: 'diabetes.insulin', value: 10, unit: 'mU/l' }] };
        call = { id: 'draft-sample', type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'labSamples', operation: mode === 'move' ? 'update' : 'add', snapshotId: snapshot.snapshotId, patch: JSON.stringify(patch), evidence, reason: 'Explicitly reported collection facts and numeric results.' }) } };
      }
      round++; const reply = thanks ? 'Your sample is saved.' : 'Please review the whole sample change.';
      if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.goto('/app');
    sodium = await page.evaluate(async () => {
      const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic sample operations', { sex: 'male', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
      localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profile.switchProfile(id);
      const { state } = await import('/js/state.js'), { MARKER_SCHEMA } = await import('/js/marker-schema.js');
      state.importedData.nutritionMeals = [];
      state.importedData.entries = [
        { panelId: 'morning', date: '2026-10-20', specimen: 'serum', markers: { 'biochemistry.glucose': 5, 'diabetes.insulin': 10, 'diabetes.homaIR': 2.22 }, context: { sampleTime: '08:00', fasting: true },
          markerSources: { 'biochemistry.glucose': { file: 'private-morning.pdf', snapshotId: 'snapshot-secret', at: 100 } }, sourceFile: 'private-morning.pdf' },
        { panelId: 'evening', date: '2026-10-20', specimen: 'saliva', markers: { 'biochemistry.glucose': 7 }, context: { sampleTime: '16:00' }, sourceFile: 'private-evening.pdf' },
      ]; state.importedData.markerValueNotes = { 'biochemistry.glucose:2026-10-20': 'Shared glucose note', 'diabetes.insulin:2026-10-20': 'Unshared insulin note' };
      if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Could not save synthetic samples');
      await (await import('/js/nutrition-store.js')).hydrateNutritionSummary(id);
      const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://synthetic-sample-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('synthetic'); api.setAIProvider('custom'); api.setAIPaused(false);
      (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
      return `${Object.keys(MARKER_SCHEMA).find(key => MARKER_SCHEMA[key]!.markers.sodium)!}.sodium`;
    });
    const saved = () => page.evaluate(async () => { const { state } = await import('/js/state.js'), crypto = await import('/js/crypto.js'), { profileStorageKey } = await import('/js/profile.js'); return JSON.parse((await crypto.encryptedGetItem(profileStorageKey(state.currentProfile, 'imported')))!); });
    const before = await saved(); await page.locator('#chat-input').fill(evidence); await page.locator('#chat-send-btn').click();
    const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText('Lab Samples'); await expect(card).toContainText('every result');
    if (mode === 'move') { await expect(card).toContainText('09:30'); await expect(card).toContainText('Unshared insulin note'); await expect(card).toContainText('140 mmol/l'); }
    else { await expect(card).toContainText('separate manually reported sample'); await expect(card).toContainText('Time unknown'); await expect(card).toContainText('Fasting unknown'); await expect(card).toContainText('5.99401 mmol/l'); }
    expect(await saved()).toEqual(before); await card.getByRole('button', { name: mode === 'discard' ? 'Discard' : 'Apply', exact: true }).click();
    await expect(page.locator(mode === 'discard' ? '.chat-agent-draft-discarded' : '.chat-agent-draft-applied')).toHaveCount(1);
    if (mode === 'discard') { await page.reload(); expect(await saved()).toEqual(before); return; }
    const accepted = await saved();
    if (mode === 'move') { expect(accepted.entries).toHaveLength(2); expect(accepted.entries.find((row: { panelId: string }) => row.panelId === 'morning')).toMatchObject({ date: '2026-10-21', specimen: 'plasma', markers: { [sodium]: 140 }, context: { sampleTime: '09:30', fasting: false } }); expect(accepted.entries.find((row: { panelId: string }) => row.panelId === 'evening')).toEqual(before.entries[1]); expect(accepted.markerValueNotes['diabetes.insulin:2026-10-21']).toBe('Unshared insulin note'); expect(accepted.markerValueNotes['biochemistry.glucose:2026-10-20']).toBe('Shared glucose note'); }
    else { expect(accepted.entries).toHaveLength(3); expect(accepted.entries.slice(0, 2)).toEqual(before.entries); expect(accepted.entries[2].markers).toMatchObject({ 'biochemistry.glucose': 5.99401, 'diabetes.homaIR': 2.66 }); expect(accepted.entries[2].context?.fasting).toBeUndefined(); }
    await page.locator('#chat-input').fill('Thanks.'); await page.locator('#chat-send-btn').click(); await expect(page.locator('#chat-messages')).toContainText('Your sample is saved.'); expect(feedback).toBe(true);
    await page.reload();
    await page.evaluate(async () => { const { state } = await import('/js/state.js'); const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) }); const opened = await runtime.execute({ tool: 'getbased_navigate', arguments: { marker: 'biochemistry.glucose' } }); if (!opened.success) throw new Error(opened.contentItems[0].text); });
    await expect(page.locator('.marker-history-row')).toHaveCount(mode === 'move' ? 2 : 3);
    if (mode !== 'move') return;
    const row = page.locator('.marker-history-row').filter({ has: page.locator('[data-marker-detail-action="edit-marker-value"][data-marker-detail-panel-id="morning"]') });
    await expect(row).toContainText('plasma'); await expect(row).toContainText('09:30'); await expect(row).toContainText('not fasting');
    await expect(page.getByRole('button', { name: 'Edit sample', exact: true })).toHaveCount(0); await openLabSampleEditorForTest(page, 'biochemistry_glucose', 'morning'); await expect(page.locator('#lab-sample-form')).toBeVisible();
    await expect(page.getByLabel('Collection date', { exact: true })).toHaveValue('2026-10-21'); await expect(page.getByLabel('Collection time', { exact: true })).toHaveValue('09:30'); await expect(page.getByLabel('Specimen', { exact: true })).toHaveValue('plasma');
    await page.getByLabel('Collection date', { exact: true }).fill('2026-10-20'); await page.getByLabel('Collection time', { exact: true }).fill('10:00'); await page.getByLabel('Fasting', { exact: true }).selectOption('yes'); await page.getByRole('button', { name: 'Save sample', exact: true }).click();
    await expect(page.locator('#lab-sample-form')).toHaveCount(0); const edited = await saved(); expect(edited.entries.find((entry: { panelId: string }) => entry.panelId === 'morning')).toMatchObject({ date: '2026-10-20', context: { sampleTime: '10:00', fasting: true } }); expect(edited.entries.find((entry: { panelId: string }) => entry.panelId === 'evening')).toEqual(before.entries[1]); expect(edited.markerValueNotes['diabetes.insulin:2026-10-20']).toBe('Unshared insulin note');
    await page.reload(); expect((await saved()).entries).toEqual(edited.entries);
  });
}
