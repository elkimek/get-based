import { expect, test } from './coverage-fixture.js';

for (const scenario of ['portion', 'discard', 'water', 'checkin', 'checkin-unlinked', 'remove', 'photos', 'timezone', 'identity'] as const) {
  test(`reviewed ${scenario} meal operation persists to the normal nutrition UI`, async ({ page, context, browserName }) => {
    test.skip(scenario === 'timezone' && browserName !== 'chromium', 'The timezone handoff case uses Chromium timezone emulation.');
    const emulation = scenario === 'timezone' ? await context.newCDPSession(page) : null;
    await emulation?.send('Emulation.setTimezoneOverride', { timezoneId: 'America/Los_Angeles' });
    await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
    await page.evaluate(async scenario => {
      const { state } = await import('/js/state.js');
      const { saveActiveProfileMeal } = await import('/js/nutrition-store.js');
      const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 240;
      const ctx = canvas.getContext('2d')!, image = ctx.createImageData(240, 240); let seed = 123;
      for (let index = 0; index < image.data.length; index++) { seed = (1664525 * seed + 1013904223) >>> 0; image.data[index] = index % 4 === 3 ? 255 : seed >>> 24; }
      ctx.putImageData(image, 0, 0); const thumbnail = canvas.toDataURL('image/webp', 0.95);
      if (thumbnail.length <= 64000) throw new Error('Photo fixture did not exercise the large-record boundary');
      await saveActiveProfileMeal({ id: 'meal-a', name: 'Synthetic lunch', mealType: 'lunch', eatenAt: '2026-10-20T12:00:00Z', nutrients: scenario === 'checkin-unlinked' ? {} : { energyKcal: 600, proteinG: 30, carbohydrateG: 60, fatG: 20 },
        components: scenario === 'checkin-unlinked' ? [] : [{ name: 'Known food', quantityG: 100, nutrients: { energyKcal: 600, proteinG: 30, carbohydrateG: 60, fatG: 20 }, nutrientsPer100g: { energyKcal: 600, proteinG: 30, carbohydrateG: 60, fatG: 20 }, privateOrigin: 'keep' }],
        images: [{ thumbnailUrl: thumbnail, fileName: 'synthetic.webp' }], source: { kind: 'ai-photo-estimate', model: 'original-model', privateSource: 'keep' }, extension: 'keep' });
      const evidence = scenario === 'water' ? 'I drank 350 mL of water now.' : scenario.startsWith('checkin') ? 'I felt satisfied and energized after lunch.' : scenario === 'remove' ? 'Remove that lunch record.' : scenario === 'photos' ? 'Remove the photo from that lunch.' : scenario === 'timezone' ? 'Lunch was at noon on 20 October 2026.' : scenario === 'identity' ? 'That was a different meal; correct its identity.' : 'The lunch portion was 200 grams.';
      const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) });
      const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'meals', ...(scenario === 'water' ? { create: true } : { recordId: 'meal-a' }) } });
      if (!read.success) throw new Error(read.contentItems[0].text);
      if (read.contentItems[0].text.includes(thumbnail)) throw new Error('Photo bytes disclosed');
      const { snapshotId } = JSON.parse(read.contentItems[0].text);
      const patch = scenario === 'water' ? { drink: { kind: 'water', amountMl: 350 } } : scenario.startsWith('checkin') ? { responseCheckIn: { satiety2h: 3, energy2h: 3 } } : scenario === 'remove' ? {} : scenario === 'photos' ? { keepImageIndices: [] } : scenario === 'timezone' ? { localDateTime: '2026-10-20T12:00' } : scenario === 'identity' ? { name: 'Corrected meal identity', analysisContext: 'Different meal details' } : { componentChanges: [{ operation: 'update', index: 0, record: { quantityG: 200 } }] };
      const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'meals', snapshotId, operation: scenario === 'water' ? 'add' : scenario === 'remove' ? 'remove' : 'update', patch: JSON.stringify(patch), reason: 'An explicit user update.', evidence } });
      if (!result.success) throw new Error(result.contentItems[0].text);
      state.currentThreadId = 'meal-proposal'; state.chatThreads = [{ id: state.currentThreadId, name: 'Meal proposal', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 1 }];
      state.chatHistory = [{ role: 'assistant', content: 'Review the meal change.', agentDrafts: runtime.getDrafts().map(draft => ({ ...draft, profileId: state.currentProfile })) }];
      const fixture = document.createElement('div'); fixture.id = 'meal-proposal-fixture'; fixture.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white;color:black;overflow:auto'; document.body.append(fixture);
      const { renderAgentDraftCards } = await import('/js/agent-drafts.js'); const render = () => { fixture.innerHTML = renderAgentDraftCards(state.chatHistory[0], 0); };
      await (await import('/js/chat-loader.js')).loadChatModule();
      (await import('/js/chat-actions.js')).configureChatMessageActionDeps({ renderChatMessages: render }); render();
    }, scenario);
    const fixture = page.locator('#meal-proposal-fixture');
    await expect(fixture).toContainText('Meals & Drinks'); await expect(fixture).toContainText('Current'); await expect(fixture).toContainText('Proposed');
    expect(await page.evaluate(async () => ((await import('/js/state.js')).state.importedData.nutritionMeals!.find(row => row.id === 'meal-a')!.nutrients as Record<string, unknown>).energyKcal ?? null)).toBe(scenario === 'checkin-unlinked' ? null : 600);
    await emulation?.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' });
    await fixture.locator(`[data-chat-message-action="${scenario === 'discard' ? 'discard' : 'apply'}-agent-draft"]`).click();
    await expect(fixture).toContainText(scenario === 'discard' ? 'Discarded' : 'Applied to getbased');
    await page.reload(); await page.locator('html[data-app-ready]').waitFor();
    await page.evaluate(async () => { await (await import('/js/nutrition-store.js')).hydrateNutritionSummary(); });
    if (scenario === 'remove') {
      expect(await page.evaluate(async () => (await import('/js/nutrition-store.js')).getActiveProfileMeal('meal-a'))).toBeNull();
      expect(await page.evaluate(async () => (await import('/js/state.js')).state.nutritionSummary?.totalMeals)).toBe(0);
    } else if (scenario === 'water') {
      const saved = await page.evaluate(async () => (await import('/js/state.js')).state.importedData.nutritionMeals!.find(row => row.name === 'Water')!);
      expect(saved).toMatchObject({ mealType: 'drink', nutrients: { fluidMl: 350, plainWaterMl: 350 } });
      await page.evaluate(async id => { await (await import('/js/nutrition.js')).openNutritionHistory(); await (await import('/js/nutrition-entry-forms.js')).openMealDetail(id); }, String(saved.id));
      await expect(page.locator('#detail-modal')).toContainText('Water'); await expect(page.locator('#detail-modal')).toContainText('350');
    } else if (scenario.startsWith('checkin')) {
      await page.evaluate(async () => { await (await import('/js/nutrition.js')).openNutritionHistory(); await (await import('/js/nutrition-entry-forms.js')).openMealDetail('meal-a'); });
      await expect(page.locator('input[name="nutrition-response-satiety"][value="3"]')).toBeChecked();
      await expect(page.locator('input[name="nutrition-response-energy"][value="3"]')).toBeChecked();
    } else {
      await page.evaluate(async () => {
        const store = await import('/js/nutrition-store.js'), nutrition = await import('/js/nutrition.js');
        await nutrition.openNutritionEditor({ mode: 'edit', seedMeal: await store.getActiveProfileMeal('meal-a') });
      });
      await expect(page.locator('#nutrition-energyKcal')).toHaveValue(scenario === 'portion' ? '1200' : scenario === 'identity' ? '' : '600');
      if (scenario === 'identity') await expect(page.locator('#detail-modal')).toContainText('Previous estimate cleared after correction');
      if (scenario === 'portion') await expect(page.locator('[data-nutrition-component-grams="0"]')).toHaveValue('200');
      if (scenario === 'timezone') {
        expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('Asia/Tokyo');
        await expect(page.locator('#nutrition-eaten-at')).toHaveValue('2026-10-20T12:00');
        expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.nutritionMeals!.find(row => row.id === 'meal-a'))).toMatchObject({ eatenAt: '2026-10-20T19:00:00.000Z', localDate: '2026-10-20', localTimeMinutes: 720, timeZone: 'America/Los_Angeles', timezoneOffsetMinutes: 420 });
      }
      expect(await page.evaluate(async () => {
        const row = (await import('/js/state.js')).state.importedData.nutritionMeals!.find(row => row.id === 'meal-a')!;
        return { extension: row.extension, photos: (row.images as unknown[]).length, source: row.source };
      })).toMatchObject({ extension: 'keep', photos: scenario === 'photos' ? 0 : 1, source: { model: 'original-model', privateSource: 'keep' } });
    }
  });
}

test('concurrent renderers commit independent meal edits without losing either record', async ({ page, context }) => {
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async () => {
    const { saveActiveProfileMeal } = await import('/js/nutrition-store.js');
    await saveActiveProfileMeal({ id: 'first', name: 'First meal', mealType: 'lunch', eatenAt: '2026-10-20T12:00Z' });
    await saveActiveProfileMeal({ id: 'second', name: 'Second meal', mealType: 'dinner', eatenAt: '2026-10-20T18:00Z' });
  });
  const peer = await context.newPage(); await peer.goto('/app'); await peer.locator('html[data-app-ready]').waitFor();
  async function proposal(target: typeof page, recordId: string) { return target.evaluate(async recordId => {
    const { state } = await import('/js/state.js');
    const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', userMessage: 'Correct the meal note.', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) });
    const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'meals', recordId } });
    if (!read.success) throw new Error(read.contentItems[0].text);
    const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'meals', snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, operation: 'update', patch: JSON.stringify({ note: `${recordId} corrected` }), reason: 'User correction.', evidence: 'Correct the meal note.' } });
    if (!result.success) throw new Error(result.contentItems[0].text);
    return { ...runtime.getDrafts()[0]!, profileId: state.currentProfile };
  }, recordId); }
  const [first, second] = await Promise.all([proposal(page, 'first'), proposal(peer, 'second')]);
  await Promise.all([
    page.evaluate(async draft => (await import('/js/agent-drafts.js')).applyAgentDraft(draft), first),
    peer.evaluate(async draft => (await import('/js/agent-drafts.js')).applyAgentDraft(draft), second),
  ]);
  await page.reload(); await page.locator('html[data-app-ready]').waitFor();
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.nutritionMeals)).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'first', note: 'first corrected' }), expect.objectContaining({ id: 'second', note: 'second corrected' })]));
});
