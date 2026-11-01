import { CHAT_TOOL_INSTRUCTIONS } from '../../shared/chat-tool-instructions.js';
import { openLabSampleEditorForTest } from '../helpers/open-lab-sample-editor.js';
import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'discard'] as const) test(`direct ${protocol} sample cycle ${decision} preserves observations and separate draws`, async ({ page }, info) => {
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?cycle-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  const statement = 'For my morning sample from 20 October 2026, I was on cycle day 21 in the reported mid-luteal phase. My separate evening sample and observed periods stay unchanged.';
  const clear = 'Clear the recorded cycle phase override for that morning sample. Keep its reported cycle day 22 and my observed periods unchanged.';
  let round = 0, lastMessage = '', clearing = false;
  await page.route('https://synthetic-cycle-provider.example/v1/chat/completions', async route => {
    const body = route.request().postDataJSON(), system = String(body.messages[0]?.content || '');
    if (!system.includes('getbased_read_context_card')) { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'Synthetic background summary.' } }] }) }); return; }
    expect(system).toContain(CHAT_TOOL_INSTRUCTIONS);
    if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
    const message = body.messages.filter((row: { role: string }) => row.role === 'user').map((row: { content: string }) => row.content).findLast((text: string) => text === statement || text === clear)!;
    if (lastMessage !== message) { lastMessage = message; clearing = message === clear; round = 0; }
    let call: AIToolCall | undefined;
    if (round === 0) call = { id: 'read-cycle-sample', type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource: 'labSamples', recordId: 'morning' }) } };
    else if (round === 1) {
      const last = body.messages.at(-1), result = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
      expect(result.success).toBe(true); const snapshot = JSON.parse(result.contentItems[0].text);
      expect(snapshot.fields.cyclePhase).toContain('never infer from a cycle day');
      expect(snapshot.current.cycle).toMatchObject(clearing ? { cycleDay: 22, cyclePhase: 'follicular', cyclePhaseSource: 'recorded' } : { cycleDay: 14, cyclePhase: 'follicular', cyclePhaseSource: 'predicted' });
      expect(JSON.stringify(result)).not.toMatch(/private-cycle|secret-source/);
      call = { id: 'draft-cycle-sample', type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'labSamples', operation: 'update', snapshotId: snapshot.snapshotId,
        patch: JSON.stringify(clearing ? { cyclePhase: null } : { cycleDay: 21, cyclePhase: 'luteal', cyclePhaseDetail: 'mid_luteal' }), evidence: message, reason: 'Explicitly reported sample cycle context.' }) } };
    }
    round++; const reply = 'Review the sample cycle context.';
    if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
    else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  await page.goto('/app');
  await page.evaluate(async () => {
    const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic draw cycle', { sex: 'female', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
    localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profile.switchProfile(id);
    const { state } = await import('/js/state.js'); state.importedData.nutritionMeals = [];
    state.importedData.menstrualCycle = { periods: [{ startDate: '2026-10-01', endDate: '2026-10-05' }] };
    state.importedData.entries = [
      { panelId: 'morning', date: '2026-10-20', specimen: 'serum', markers: { 'biochemistry.glucose': 5 }, context: { sampleTime: '08:00', fasting: true, cycleDay: 14, cyclePhase: 'follicular', cyclePhaseSource: 'predicted' },
        collectionContextSources: { cyclePhase: 'secret-source' }, markerSources: { 'biochemistry.glucose': { file: 'private-cycle.pdf', at: 100 } }, updatedAt: 100 },
      { panelId: 'evening', date: '2026-10-20', specimen: 'plasma', markers: { 'biochemistry.glucose': 7 }, context: { sampleTime: '16:00', cycleDay: 14, cyclePhase: 'ovulatory', cyclePhaseSource: 'recorded' }, updatedAt: 100 },
    ];
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Could not seed synthetic samples');
    await (await import('/js/nutrition-store.js')).hydrateNutritionSummary(id);
    const source = await import('/js/context-source-registry.js'); source.setContextSourceEnabled(source.CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true);
    const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://synthetic-cycle-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('synthetic'); api.setAIProvider('custom'); api.setAIPaused(false);
    (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
  });
  const saved = () => page.evaluate(async () => { const { state } = await import('/js/state.js'), crypto = await import('/js/crypto.js'), { profileStorageKey } = await import('/js/profile.js'); return JSON.parse((await crypto.encryptedGetItem(profileStorageKey(state.currentProfile, 'imported')))!); });
  const send = async (text: string) => { await page.locator('#chat-input').fill(text); await page.locator('#chat-send-btn').click(); await expect(page.locator('.chat-agent-draft-pending')).toContainText('Cycle context'); };
  const openHistory = async () => {
    await page.evaluate(async () => { const { state } = await import('/js/state.js'), runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) });
      const result = await runtime.execute({ tool: 'getbased_navigate', arguments: { marker: 'biochemistry.glucose' } }); if (!result.success) throw new Error(result.contentItems[0].text); });
    return page.locator('.marker-history-row').filter({ has: page.locator('[data-marker-detail-action="edit-marker-value"][data-marker-detail-panel-id="morning"]') });
  };
  const before = await saved(); await send(statement); const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText('Mid-luteal'); await expect(card).not.toContainText('mid_luteal'); await expect(card).toContainText('Observed periods stay unchanged'); expect(await saved()).toEqual(before);
  if (protocol === 'native' && decision === 'apply') await page.screenshot({ path: info.outputPath('cycle-review.png'), fullPage: true });
  await card.getByRole('button', { name: decision === 'apply' ? 'Apply' : 'Discard', exact: true }).click();
  await expect(page.locator(decision === 'apply' ? '.chat-agent-draft-applied' : '.chat-agent-draft-discarded')).toHaveCount(1);
  if (decision === 'discard') { await page.reload(); expect(await saved()).toEqual(before); return; }
  const accepted = await saved(); expect(accepted.entries[0].context).toEqual({ ...before.entries[0].context, cycleDay: 21, cyclePhase: 'luteal', cyclePhaseDetail: 'mid_luteal', cyclePhaseSource: 'recorded' });
  expect(accepted.entries[1]).toEqual(before.entries[1]); expect(accepted.menstrualCycle).toEqual(before.menstrualCycle); expect(accepted.entries[0].markerSources).toEqual(before.entries[0].markerSources);
  await page.reload(); let row = await openHistory(); await expect(row).toContainText('Mid-luteal'); await expect(row).toContainText('cycle day 21');
  await expect(page.getByRole('button', { name: 'Edit sample', exact: true })).toHaveCount(0); await openLabSampleEditorForTest(page, 'biochemistry_glucose', 'morning'); await expect(page.getByLabel('Cycle day', { exact: true })).toHaveValue('21'); await expect(page.getByLabel('Cycle phase', { exact: true })).toHaveValue('luteal');
  await page.getByLabel('Cycle day', { exact: true }).fill('22'); await page.getByLabel('Cycle phase', { exact: true }).selectOption('follicular'); await page.getByRole('button', { name: 'Save sample', exact: true }).click(); await expect(page.locator('#lab-sample-form')).toHaveCount(0);
  expect((await saved()).entries[0].context).toMatchObject({ cycleDay: 22, cyclePhase: 'follicular', cyclePhaseDetail: null, cyclePhaseSource: 'recorded' });
  await page.locator('[data-marker-detail-action="close-modal"]').click();
  await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); }); await send(clear); await page.locator('.chat-agent-draft-pending').getByRole('button', { name: 'Apply', exact: true }).click(); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(2);
  const cleared = await saved(); expect(cleared.entries[0].context).toMatchObject({ cycleDay: 22, cyclePhase: null, cyclePhaseDetail: null, cyclePhaseSource: null }); expect(cleared.entries[1]).toEqual(before.entries[1]); expect(cleared.menstrualCycle).toEqual(before.menstrualCycle);
  await page.reload(); row = await openHistory(); await expect(row).toContainText('Cycle day 22'); await expect(row).not.toContainText('Mid-luteal'); await expect(page.getByRole('button', { name: 'Edit sample', exact: true })).toHaveCount(0); await openLabSampleEditorForTest(page, 'biochemistry_glucose', 'morning');
  const retiredForm = await page.locator('#lab-sample-form').elementHandle(); await page.getByLabel('Cycle day', { exact: true }).fill('42'); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await retiredForm!.evaluate(form => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return form.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled; })).toBe(false);
  expect((await saved()).entries).toEqual(cleared.entries);
});
