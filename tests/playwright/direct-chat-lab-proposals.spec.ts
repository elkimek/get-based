import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

for (const protocol of ['native', 'structured'] as const) for (const decision of ['Apply', 'Discard'] as const) {
  test(`direct ${protocol} lab correction ${decision} selects the exact sample and ordinary history`, async ({ page }) => {
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?lab-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
    const evidence = 'Correct my morning glucose on 20 October 2026 to 108 mg/dL.';
    let round = 0, feedback = false;
    await page.route('https://synthetic-lab-provider.example/v1/chat/completions', async route => {
      const body = route.request().postDataJSON();
      if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
      const thanks = body.messages.some((message: { role: string; content: unknown }) => message.role === 'user' && message.content === 'Thanks.');
      let call: AIToolCall | undefined;
      if (thanks) feedback = body.messages[0].content.includes('"resource":"labResults"') && body.messages[0].content.includes('"status":"applied"');
      else if (round === 0) call = { id: 'list-labs', type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource: 'labResults', query: 'glucose' }) } };
      else if (round <= 2) {
        const last = body.messages.at(-1), result = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
        expect(result.success).toBe(true); const snapshot = JSON.parse(result.contentItems[0].text);
        expect(JSON.stringify(result)).not.toMatch(/private-|snapshot-secret/);
        if (round === 1) {
          expect(snapshot.records.filter((row: { markerKey: string }) => row.markerKey === 'biochemistry.glucose')).toHaveLength(2);
          call = { id: 'read-lab', type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource: 'labResults', recordId: 'morning.biochemistry.glucose' }) } };
        } else call = { id: 'draft-lab', type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'labResults', operation: 'update', snapshotId: snapshot.snapshotId, patch: JSON.stringify({ value: 108, unit: 'mg/dL' }), evidence, reason: 'An explicit correction of the morning sample.' }) } };
      }
      round++; const reply = thanks ? 'Your sample correction is saved.' : 'Please review the sample correction.';
      if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.addInitScript(() => { for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
    await page.goto('/app');
    await page.locator('html[data-app-ready]').waitFor();
    await page.evaluate(async () => {
      const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic sample correction', { sex: 'male', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
      localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profile.switchProfile(id);
      const { state } = await import('/js/state.js'); state.importedData.entries = [
        { panelId: 'morning', date: '2026-10-20', specimen: 'serum', markers: { 'biochemistry.glucose': 5, 'diabetes.insulin': 10, 'diabetes.homaIR': 2.22 }, context: { sampleTime: '08:00', fasting: true },
          markerSources: { 'biochemistry.glucose': { file: 'private-morning.pdf', snapshotId: 'snapshot-secret', at: 100 } }, sourceFile: 'private-morning.pdf' },
        { panelId: 'evening', date: '2026-10-20', specimen: 'serum', markers: { 'biochemistry.glucose': 7 }, context: { sampleTime: '16:00', fasting: false },
          markerSources: { 'biochemistry.glucose': { file: 'private-evening.pdf', at: 200 } }, sourceFile: 'private-evening.pdf' },
      ]; state.importedData.markerValueNotes = { 'biochemistry.glucose:2026-10-20': 'Keep the shared note' };
      if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Could not save the fixture');
      const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://synthetic-lab-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('synthetic'); api.setAIProvider('custom'); api.setAIPaused(false);
      (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
    });
    const saved = () => page.evaluate(async () => { const { state } = await import('/js/state.js'), crypto = await import('/js/crypto.js'), { profileStorageKey } = await import('/js/profile.js'); return JSON.parse((await crypto.encryptedGetItem(profileStorageKey(state.currentProfile, 'imported')))!); });
    const before = await saved(); await page.locator('#chat-input').fill(evidence); await page.locator('#chat-send-btn').click();
    const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText('Lab Results'); await expect(card).toContainText('5.99401 mmol/l'); await expect(card).toContainText('2.22 → 2.66'); await expect(card).toContainText('08:00');
    expect(await saved()).toEqual(before); await card.getByRole('button', { name: decision, exact: true }).click();
    await expect(page.locator(decision === 'Apply' ? '.chat-agent-draft-applied' : '.chat-agent-draft-discarded')).toHaveCount(1);
    if (decision === 'Discard') { expect(await saved()).toEqual(before); return; }
    await page.locator('#chat-input').fill('Thanks.'); await page.locator('#chat-send-btn').click(); await expect(page.locator('#chat-messages')).toContainText('Your sample correction is saved.'); expect(feedback).toBe(true);
    await page.reload();
    expect((await saved()).entries[0].markers['biochemistry.glucose']).toBe(5.99401); expect((await saved()).entries[1]).toEqual(before.entries[1]);
    await page.evaluate(async () => { const { state } = await import('/js/state.js'); const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) }); await runtime.execute({ tool: 'getbased_navigate', arguments: { marker: 'biochemistry.glucose' } }); });
    const rows = page.locator('.marker-history-row'); await expect(rows).toHaveCount(2); await expect(rows.nth(0)).toContainText('Sample 1'); await expect(rows.nth(0)).toContainText('08:00'); await expect(rows.nth(1)).toContainText('16:00');
    const morning = page.locator('[data-marker-detail-action="edit-marker-value"][data-marker-detail-panel-id="morning"]');
    const evening = page.locator('[data-marker-detail-action="edit-marker-value"][data-marker-detail-panel-id="evening"]');
    await expect(morning).toContainText('5.99'); await expect(evening).toHaveText('7');
    await evening.click(); const edit = evening.locator('input'); await edit.fill('8'); await edit.press('Enter'); await expect(evening).toContainText('8');
    expect((await saved()).entries[0].markers['biochemistry.glucose']).toBe(5.99401); expect((await saved()).entries[1].markers['biochemistry.glucose']).toBe(8);
    await page.locator('[data-marker-detail-action="revert-marker-value"][data-marker-detail-panel-id="evening"]').click(); await expect(evening).toHaveText('7');
    await page.locator('[data-marker-detail-action="revert-marker-value"][data-marker-detail-panel-id="morning"]').click(); await expect(morning).toHaveText('5');
    const final = await saved(); expect(final.entries.map((row: { markers: Record<string, number> }) => row.markers['biochemistry.glucose'])).toEqual([5, 7]); expect(final.markerValueNotes).toEqual(before.markerValueNotes);
    await page.locator('[data-marker-detail-action="delete-marker-value"][data-marker-detail-panel-id="evening"]').click(); await page.locator('#confirm-ok').click(); await expect(rows).toHaveCount(1);
    const removed = await saved(); expect(removed.entries).toHaveLength(2); expect(removed.entries[1].markers).not.toHaveProperty('biochemistry.glucose'); expect(removed.entries[1].deletedMarkers['biochemistry.glucose']).toBeGreaterThan(0); expect(removed.entries[1].sourceFile).toBe('private-evening.pdf'); expect(removed.entries[0].panelId).toBe('morning'); expect(removed.entries[0].markers['biochemistry.glucose']).toBe(5); expect(removed.markerValueNotes).toEqual(before.markerValueNotes);
  });
}
