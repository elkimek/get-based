import { expect, test } from './coverage-fixture.js';

for (const scenario of ['weight', 'discard', 'bp', 'waist', 'method', 'date', 'remove', 'depth'] as const) {
  test(`reviewed manual ${scenario} command reaches ordinary history after reload`, async ({ page }) => {
    await page.goto('/app');
    await page.evaluate(async scenario => {
      const { state } = await import('/js/state.js'), manual = await import('/js/wearables-manual.js');
      await manual.logManualMetric(state.currentProfile, 'weight', { date: '2026-10-20', value: 80, note: 'Morning measurements' });
      await manual.logManualBP(state.currentProfile, { date: '2026-10-20', systolic: 120, diastolic: 80, pulse: 60 });
      await manual.logBodyMeasurement(state.currentProfile, { kind: 'waist', date: '2026-10-20', value: 90, hip: 100, position: 'standing', site: 'midpoint', unit: 'cm' });
      await (await import('/js/wearables-manual-sync.js')).refreshRestoredManualSummary(state.currentProfile);
      const evidence = 'Correct my manual measurements as reported.', runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) });
      const recordId = `${scenario === 'bp' ? 'bp' : scenario === 'waist' || scenario === 'method' ? 'waist_standing_midpoint' : 'weight'}.2026-10-20`;
      const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'manualReadings', ...(scenario === 'depth' ? { create: true } : { recordId }) } });
      if (!read.success) throw new Error(read.contentItems[0].text);
      const patch = scenario === 'bp' ? { systolic: 122, diastolic: 82 } : scenario === 'waist' ? { value: 92, unit: 'cm' }
        : scenario === 'method' ? { position: 'supine', site: 'iliac' } : scenario === 'date' ? { date: '2026-10-19' }
          : scenario === 'remove' ? {} : scenario === 'depth' ? { kind: 'abdominalDepth', value: 20, unit: 'cm', date: '2026-10-20' } : { value: 81, unit: 'kg' };
      const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'manualReadings', operation: scenario === 'remove' ? 'remove' : scenario === 'depth' ? 'add' : 'update', snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, patch: JSON.stringify(patch), evidence, reason: 'An explicit user correction.' } });
      if (!result.success) throw new Error(result.contentItems[0].text);
      state.currentThreadId = 'manual-proposal'; state.chatThreads = [{ id: state.currentThreadId, name: 'Manual proposal', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 1 }];
      state.chatHistory = [{ role: 'assistant', content: 'Review the measurement.', agentDrafts: runtime.getDrafts().map(draft => ({ ...draft, profileId: state.currentProfile })) }];
      const fixture = document.createElement('div'); fixture.id = 'manual-proposal-fixture'; fixture.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white;color:black;overflow:auto'; document.body.append(fixture);
      const { renderAgentDraftCards } = await import('/js/agent-drafts.js'); const render = () => { fixture.innerHTML = renderAgentDraftCards(state.chatHistory[0], 0); };
      (await import('/js/chat-actions.js')).configureChatMessageActionDeps({ renderChatMessages: render }); render();
    }, scenario);
    const fixture = page.locator('#manual-proposal-fixture'); await expect(fixture).toContainText('Manual Body Readings'); await expect(fixture).toContainText('Current'); await expect(fixture).toContainText('Proposed');
    expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.manualBodyReadings!['weight.2026-10-20']!.value)).toBe(80);
    await fixture.locator(`[data-chat-message-action="${scenario === 'discard' ? 'discard' : 'apply'}-agent-draft"]`).click(); await expect(fixture).toContainText(scenario === 'discard' ? 'Discarded' : 'Applied to getbased');
    await page.reload();
    if (scenario === 'waist' || scenario === 'method' || scenario === 'depth') {
      await page.evaluate(async scenario => (await import('/js/body-measurement-modal.js')).openBodyMeasurementEditor(scenario === 'depth' ? 'abdominal_depth' : 'waist'), scenario);
      const editor = page.locator('[data-body-measurement-view]');
      await expect(editor).toContainText(scenario === 'waist' ? '92.0 cm' : scenario === 'depth' ? '20.0 cm' : '90.0 cm');
      if (scenario === 'method') { await expect(editor).toContainText('Lying down'); expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.manualBodyReadings!['waist_standing_midpoint.2026-10-20']!.value)).toBeNull(); }
    } else if (scenario === 'remove') {
      expect(await page.evaluate(async () => (await import('/js/wearables-store.js')).getDaily((await import('/js/state.js')).state.currentProfile, 'manual', '2026-10-20'))).toMatchObject({ bp_systolic: 120, rhr: 60 });
      expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.wearableSummary!.metrics)).not.toHaveProperty('weight');
    } else {
      await page.evaluate(async metric => (await import('/js/wearables-detail-modal.js')).openWearableDetail(metric), scenario === 'bp' ? 'bp_systolic' : 'weight');
      const row = page.locator(`.wearable-manual-entry[data-entry-date="${scenario === 'date' ? '2026-10-19' : '2026-10-20'}"]`);
      await expect(row).toContainText(scenario === 'bp' ? '122' : scenario === 'discard' || scenario === 'date' ? '80' : '81');
      if (scenario === 'bp') await expect(row).toContainText('82');
    }
  });
}

test('two renderers retain independent same-day manual corrections', async ({ page, context }) => {
  await page.goto('/app');
  await page.evaluate(async () => {
    const manual = await import('/js/wearables-manual.js'), id = (await import('/js/state.js')).state.currentProfile;
    await manual.logManualMetric(id, 'weight', { date: '2026-10-20', value: 80 }); await manual.logManualBP(id, { date: '2026-10-20', systolic: 120, diastolic: 80 });
  });
  const peer = await context.newPage(); await peer.goto('/app');
  async function propose(target: typeof page, bp: boolean) { return target.evaluate(async bp => {
    const { state } = await import('/js/state.js'), evidence = 'Correct the manual measurement.';
    const tools = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) });
    const read = await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'manualReadings', recordId: `${bp ? 'bp' : 'weight'}.2026-10-20` } });
    if (!read.success) throw new Error(read.contentItems[0].text);
    const result = await tools.execute({ tool: 'getbased_draft_data', arguments: { resource: 'manualReadings', operation: 'update', snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, patch: JSON.stringify(bp ? { systolic: 122 } : { value: 81, unit: 'kg' }), reason: 'User correction.', evidence } });
    if (!result.success) throw new Error(result.contentItems[0].text);
    return { ...tools.getDrafts()[0]!, profileId: state.currentProfile };
  }, bp); }
  const [first, second] = await Promise.all([propose(page, false), propose(peer, true)]);
  await Promise.all([page.evaluate(async draft => (await import('/js/agent-drafts.js')).applyAgentDraft(draft), first), peer.evaluate(async draft => (await import('/js/agent-drafts.js')).applyAgentDraft(draft), second)]);
  await page.reload();
  expect(await page.evaluate(async () => (await import('/js/wearables-store.js')).getDaily((await import('/js/state.js')).state.currentProfile, 'manual', '2026-10-20'))).toMatchObject({ weight: 81, bp_systolic: 122, bp_diastolic: 80 });
});
