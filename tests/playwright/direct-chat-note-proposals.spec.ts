import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

for (const protocol of ['native', 'structured'] as const) for (const mode of ['shortcut', 'dated'] as const) {
  test(`direct ${protocol} ${mode} note tools require approval and reach ordinary editors`, async ({ page }) => {
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?notes-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
    const evidence = mode === 'shortcut' ? 'Please add this profile context note: Reported note.' : 'Please change the note for my glucose result on 20 October 2026 to Fasted sample.';
    let round = 0, feedback = false, recordId = '';
    await page.route('https://synthetic-note-provider.example/v1/chat/completions', async route => {
      const body = route.request().postDataJSON();
      if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
      const thanks = body.messages.some((message: { role: string; content: unknown }) => message.role === 'user' && message.content === 'Thanks.');
      let call: AIToolCall | undefined;
      if (thanks) feedback = body.messages[0].content.includes(`"resource":"${mode === 'shortcut' ? 'profileNotes' : 'markerValueNotes'}"`) && body.messages[0].content.includes('"status":"applied"');
      else if (round === 0) call = { id: 'read-note', type: 'function', function: mode === 'shortcut' ? { name: 'getbased_read_data', arguments: JSON.stringify({ resource: 'profileNotes' }) } : { name: 'getbased_read_data', arguments: JSON.stringify({ resource: 'markerValueNotes', recordId }) } };
      else if (round === 1) {
        const last = body.messages.at(-1), result = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
        expect(result.success).toBe(true); const snapshot = JSON.parse(result.contentItems[0].text);
        call = { id: 'draft-note', type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: mode === 'shortcut' ? 'profileNotes' : 'markerValueNotes', operation: 'update', snapshotId: snapshot.snapshotId, patch: JSON.stringify(mode === 'shortcut' ? { appendText: 'Reported note' } : { text: 'Fasted sample' }), evidence, reason: 'An explicit note correction.' }) } };
      }
      round++; const reply = thanks ? 'Your note is saved.' : 'Please review the note.';
      if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.addInitScript(() => { for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
    await page.goto('/app');
    await page.locator('html[data-app-ready]').waitFor();
    recordId = await page.evaluate(async () => {
      const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic direct notes', { sex: 'male', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
      localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profile.switchProfile(id);
      const { state } = await import('/js/state.js'), { MARKER_SCHEMA } = await import('/js/marker-schema.js'), markerKey = `${Object.keys(MARKER_SCHEMA).find(key => MARKER_SCHEMA[key]!.markers.glucose)!}.glucose`;
      state.importedData.entries = [{ date: '2026-10-20', markers: { [markerKey]: 5 }, sourceFile: 'original.pdf' }]; state.importedData.contextNotes = 'Original'; state.importedData.markerValueNotes = { [`${markerKey}:2026-10-20`]: 'Original dated note' };
      await (await import('/js/data.js')).saveImportedData();
      const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://synthetic-note-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('synthetic'); api.setAIProvider('custom'); api.setAIPaused(false);
      (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
      return `2026-10-20.${markerKey}`;
    });
    await page.locator('#chat-input').fill(evidence); await page.locator('#chat-send-btn').click();
    const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText(mode === 'shortcut' ? 'Profile Context Note' : 'Dated Marker Notes'); await expect(card).toContainText(mode === 'shortcut' ? 'Reported note' : 'Fasted sample');
    expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.contextNotes)).toBe('Original');
    if (mode === 'dated') expect(await page.evaluate(async () => Object.values((await import('/js/state.js')).state.importedData.markerValueNotes))).toEqual(['Original dated note']);
    await card.getByRole('button', { name: 'Apply', exact: true }).click(); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(1);
    await expect(page.locator('#chat-input')).toBeVisible(); await page.locator('#chat-input').fill('Thanks.'); await page.locator('#chat-send-btn').click(); await expect(page.locator('#chat-messages')).toContainText('Your note is saved.'); expect(feedback).toBe(true);
    await page.reload(); await page.locator('html[data-app-ready]').waitFor();
    if (mode === 'shortcut') { expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.contextNotes)).toBe('Original\n\nReported note'); await expect(page.getByRole('textbox', { name: 'Additional context', exact: true })).toHaveValue('Original\n\nReported note'); }
    else {
      const opened = await page.evaluate(async recordId => {
        const { state } = await import('/js/state.js');
        const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) });
        return runtime.execute({ tool: 'getbased_navigate', arguments: { marker: recordId.slice(11) } });
      }, recordId);
      expect(opened.success, opened.contentItems[0].text).toBe(true);
      await expect(page.locator('.mv-value-note-text')).toBeVisible();
      await expect(page.locator('.mv-value-note-text')).toHaveText('Fasted sample');
      expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.entries[0]!.sourceFile)).toBe('original.pdf');
    }
  });
}
