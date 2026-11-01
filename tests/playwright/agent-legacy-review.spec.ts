import { expect, test } from './coverage-fixture.js';

for (const scenario of ['note', 'bp', 'undated'] as const) test(`saved legacy ${scenario} refreshes safely before any Apply`, async ({ page }) => {
  await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); localStorage.setItem('labcharts-ai-paused', 'true'); });
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async scenario => {
    const { state } = await import('/js/state.js'); state.importedData.contextNotes = 'Original';
    await (await import('/js/data.js')).saveImportedData();
    if (scenario === 'bp') await (await import('/js/wearables-manual.js')).logManualBP(state.currentProfile, { date: '2026-10-20', systolic: 120, diastolic: 80, pulse: 60, note: 'Original reading' });
    state.currentThreadId = 'legacy-review'; state.chatThreads = [{ id: 'legacy-review', name: 'Legacy review', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 2 }];
    state.chatHistory = [{ role: 'user', content: scenario === 'bp' ? 'My seated pressure was 122/82 and pulse 62 on 20 October 2026.' : 'Add this reported profile note.' }, { role: 'assistant', content: 'Older proposal.', agentDrafts: [{ id: 'old-card', profileId: state.currentProfile, kind: scenario === 'note' ? 'note' : 'biometric', status: 'pending', payload: scenario === 'note' ? { scope: 'profile', text: 'New note', mode: 'append' } : scenario === 'bp' ? { metric: 'bp', date: '2026-10-20', systolic: 122, diastolic: 82, pulse: 62, note: 'Seated reading' } : { metric: 'weight', value: 81, unit: 'kg' } }] }];
    const fixture = document.createElement('div'); fixture.id = 'legacy-fixture'; fixture.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white;color:black;overflow:auto'; document.body.append(fixture);
    const { renderAgentDraftCards } = await import('/js/agent-drafts.js'), render = () => { fixture.innerHTML = renderAgentDraftCards(state.chatHistory[1], 1); };
    await (await import('/js/chat-loader.js')).loadChatModule();
    (await import('/js/chat-actions.js')).configureChatMessageActionDeps({ renderChatMessages: render }); render();
  }, scenario);
  const fixture = page.locator('#legacy-fixture'); await expect(fixture.getByRole('button', { name: 'Refresh review', exact: true })).toBeVisible();
  await fixture.getByRole('button', { name: 'Refresh review', exact: true }).click();
  if (scenario === 'undated') {
    await expect(page.locator('body')).toContainText('explicit measurement date');
    expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.manualBodyReadings || {})).toEqual({});
    expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return (await import('/js/crypto.js')).encryptedGetItem(`labcharts-${state.currentProfile}-agent-draft-claims`); })).toBeNull();
    await fixture.getByRole('button', { name: 'Discard', exact: true }).click(); await expect(fixture).toContainText('Discarded'); return;
  }
  await expect(fixture.locator('.chat-agent-draft-superseded')).toHaveCount(1); await expect(fixture.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(1);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.contextNotes)).toBe('Original');
  if (scenario === 'bp') {
    await expect(fixture).toContainText('60 bpm → 62 bpm'); expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return (await import('/js/wearables-store.js')).getDaily(state.currentProfile, 'manual', '2026-10-20'); })).toMatchObject({ bp_systolic: 120, rhr: 60 });
  }
  await page.reload(); await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    if (!await (await import('/js/chat-threads.js')).loadChatThreads() || !state.chatThreads.some(thread => thread.id === 'legacy-review')) throw new Error('Saved legacy conversation index was not restored');
    state.currentThreadId = 'legacy-review'; if (!await (await import('/js/chat-history.js')).loadChatHistory()) throw new Error('Saved legacy conversation body was not restored');
    const fixture = document.createElement('div'); fixture.id = 'legacy-fixture'; fixture.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white;color:black;overflow:auto'; document.body.append(fixture);
    const { renderAgentDraftCards } = await import('/js/agent-drafts.js'), render = () => { fixture.innerHTML = renderAgentDraftCards(state.chatHistory[1], 1); };
    await (await import('/js/chat-loader.js')).loadChatModule();
    (await import('/js/chat-actions.js')).configureChatMessageActionDeps({ renderChatMessages: render }); render();
  });
  await expect(fixture.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(1); await fixture.getByRole('button', { name: 'Apply', exact: true }).click(); await expect(fixture.locator('.chat-agent-draft-applied')).toHaveCount(1);
  await page.reload(); await page.locator('html[data-app-ready]').waitFor();
  if (scenario === 'note') expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.contextNotes)).toBe('Original\n\nNew note');
  else {
    await page.evaluate(async () => (await import('/js/wearables-detail-modal.js')).openWearableDetail('bp_systolic'));
    await expect(page.locator('.wearable-manual-entry[data-entry-date="2026-10-20"]')).toContainText('122'); await expect(page.locator('.wearable-manual-entry[data-entry-date="2026-10-20"]')).toContainText('82'); await expect(page.locator('.wearable-manual-entry[data-entry-date="2026-10-20"]')).toContainText('Seated reading');
    expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return (await import('/js/wearables-store.js')).getDaily(state.currentProfile, 'manual', '2026-10-20'); })).toMatchObject({ bp_systolic: 122, bp_diastolic: 82, rhr: 62, note: 'Seated reading' });
  }
});
