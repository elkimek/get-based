import { expect, test } from './coverage-fixture.js';

for (const scenario of ['therapy', 'targets', 'note'] as const) {
  test(`approved ${scenario} record edits appear in the normal editor after reload`, async ({ page }) => {
    await page.goto('/app');
    await page.evaluate(async scenario => {
      const { state } = await import('/js/state.js');
      const { saveImportedData } = await import('/js/data.js');
      state.importedData.supplements = [{ id: 'therapy-a', name: 'Example product', type: 'supplement', startDate: '2026-01-01', periods: [{ start: '2026-01-01', end: null, dose: 'one capsule' }], extension: 'retain' }];
      state.importedData.notes = [{ date: '2026-01-01', text: 'Original note', extension: 'retain' }];
      state.importedData.nutritionTargets = null;
      if (!await saveImportedData()) throw new Error('Fixture save failed');
      const { createBrowserAgentToolDependencies } = await import('/js/agent-tool-bindings.js');
      const { createAgentToolRuntime } = await import('/js/agent-tool-runtime.js');
      const { getConfiguredArrayItemId } = await import('/js/data-merge.js');
      const evidence = scenario === 'therapy' ? 'I stopped taking this today.' : scenario === 'targets' ? 'Set my protein target to 1.6 grams per kg.' : 'Correct my note to Corrected note.';
      const runtime = createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(state.currentProfile) });
      const resource = scenario === 'therapy' ? 'supplements' : scenario === 'targets' ? 'nutritionTargets' : 'datedNotes';
      const recordId = scenario === 'therapy' ? 'therapy-a' : scenario === 'note' ? getConfiguredArrayItemId('notes', state.importedData.notes[0])! : '';
      const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource, recordId } });
      if (!read.success) throw new Error(read.contentItems[0].text);
      const snapshot = JSON.parse(read.contentItems[0].text);
      const proposed = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource, snapshotId: snapshot.snapshotId,
        operation: scenario === 'therapy' ? 'stop' : 'update', patch: JSON.stringify(scenario === 'therapy' ? { date: '2026-10-23' } : scenario === 'targets' ? { proteinGPerKg: 1.6 } : { text: 'Corrected note' }), reason: 'Explicit user correction.', evidence } });
      if (!proposed.success) throw new Error(proposed.contentItems[0].text);
      state.currentThreadId = 'data-proposal';
      state.chatThreads = [{ id: state.currentThreadId, name: 'Record proposal', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 1 }];
      state.chatHistory = [{ role: 'assistant', content: 'Review the record change.', agentDrafts: runtime.getDrafts().map(draft => ({ ...draft, profileId: state.currentProfile })) }];
      const fixture = document.createElement('div'); fixture.id = 'data-proposal-fixture';
      fixture.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white;color:black;overflow:auto'; document.body.append(fixture);
      const { renderAgentDraftCards } = await import('/js/agent-drafts.js');
      const render = () => { fixture.innerHTML = renderAgentDraftCards(state.chatHistory[0], 0); };
      (await import('/js/chat-actions.js')).configureChatMessageActionDeps({ renderChatMessages: render }); render();
    }, scenario);
    const fixture = page.locator('#data-proposal-fixture');
    await expect(fixture).toContainText('Current'); await expect(fixture).toContainText('Proposed');
    const before = await page.evaluate(async () => {
      const { state } = await import('/js/state.js'); return { text: state.importedData.notes[0]!.text, end: state.importedData.supplements[0]!.endDate, targets: state.importedData.nutritionTargets };
    });
    expect(before).toEqual({ text: 'Original note', end: undefined, targets: null });
    await fixture.locator('[data-chat-message-action="apply-agent-draft"]').click();
    await expect(fixture).toContainText('Applied to getbased');
    await page.reload();
    if (scenario === 'therapy') {
      await page.evaluate(async () => { (await import('/js/supplements.js')).openSupplementsEditor(0); });
      await expect(page.locator('.supp-period-end').first()).toHaveValue('2026-10-23');
      expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.supplements[0]!.extension)).toBe('retain');
    } else if (scenario === 'targets') {
      await page.evaluate(async () => { await (await import('/js/nutrition.js')).openNutritionTargets(); });
      await expect(page.locator('#nutrition-target-protein-basis')).toHaveValue('custom');
      await expect(page.locator('#nutrition-target-protein-factor')).toHaveValue('1.6');
    } else {
      await page.evaluate(async () => { (await import('/js/notes.js')).openNoteEditor(undefined, 0); });
      await expect(page.locator('#note-textarea')).toHaveValue('Corrected note');
      expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.notes[0]!.extension)).toBe('retain');
    }
  });
}

test('a stale peer edit is rejected inside the save while unrelated therapy additions survive', async ({ page, context }) => {
  await page.goto('/app');
  // The unit suite exercises locked peer-write injection. Here use two real renderers
  // sharing durable storage: do not rely on the first tab's in-memory profile cache.
  const peer = await context.newPage(); await peer.goto('/app');
  const profile = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.supplements = [{ id: 'therapy-a', name: 'Example product', type: 'supplement', startDate: '2026-01-01', periods: [{ start: '2026-01-01', end: null }] }];
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Fixture save failed');
    return state.currentProfile;
  });
  const draft = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { createBrowserAgentToolDependencies } = await import('/js/agent-tool-bindings.js');
    const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', userMessage: 'I stopped this.', ...createBrowserAgentToolDependencies(state.currentProfile) });
    const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'supplements', recordId: 'therapy-a' } });
    const { snapshotId } = JSON.parse(read.contentItems[0].text);
    const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'supplements', snapshotId, operation: 'stop', patch: '{"date":"2026-10-23"}', reason: 'Reported stop.', evidence: 'I stopped this.' } });
    if (!result.success) throw new Error(result.contentItems[0].text);
    return { ...runtime.getDrafts()[0]!, profileId: state.currentProfile };
  });
  await peer.evaluate(async profile => {
    await (await import('/js/profile.js')).loadProfile(profile);
    const { state } = await import('/js/state.js'); state.importedData.supplements[0]!.note = 'Peer correction';
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Peer save failed');
  }, profile);
  const result = await page.evaluate(async draft => {
    try { await (await import('/js/agent-drafts.js')).applyAgentDraft(draft); return 'unexpected success'; }
    catch (error) { return error instanceof Error ? error.message : String(error); }
  }, draft);
  expect(result).toContain('changed');
  await page.reload();
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.supplements[0]!.note)).toBe('Peer correction');
});
