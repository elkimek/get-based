import { expect, test } from './coverage-fixture.js';

test('legacy Biology context review survives real JSON import, export and reload', async ({ page }) => {
  const review = {
    summary: 'Previously saved context review.', suggestions: [{ text: 'Verify collection time.' }],
    fingerprint: 'legacy-panel', fingerprintsByRange: { all: 'legacy-all', '3m': 'legacy-3m' },
    unlockedRanges: ['all', '3m'], range: 'all', updatedAt: 1786104000000,
  };
  await page.goto('/app');
  const imported = await page.evaluate(async review => {
    const profile = await import('/js/profile.js');
    const id = await profile.createProfile('Legacy review restore', { tags: ['test'], skipInitialSync: true });
    await profile.switchProfile(id);
    const { state } = await import('/js/state.js');
    const { importDataJSON, buildClientExportObject } = await import('/js/export.js');
    const backup = { version: 2, entries: [{ date: '2026-07-01', markers: { 'biochemistry.glucose': 5.1 } }], biologyScoreContextAI: review };
    await importDataJSON(new File([JSON.stringify(backup)], 'legacy-review.json', { type: 'application/json' }));
    return { id, live: state.importedData.biologyScoreContextAI, exported: (await buildClientExportObject(id, false, false)).biologyScoreContextAI };
  }, review);
  expect(imported.live).toEqual(review);
  expect(imported.exported).toEqual(review);
  await page.reload();
  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return { id: state.currentProfile, review: state.importedData.biologyScoreContextAI };
  })).toEqual({ id: imported.id, review });
});

for (const sex of ['male', 'female']) test(`${sex} demo has explorable Biology Scores on desktop and mobile without automatic AI`, async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-default-tour', 'completed');
  });
  await page.goto('/app');
  if (sex === 'male') {
    // Let the real 800 ms welcome timer fire while the demo download is slow.
    await expect(page.locator('body')).toHaveClass(/chat-autostart-reserved/);
    await page.route('**/data/demo-male.json', async route => {
      await new Promise(resolve => setTimeout(resolve, 1200));
      await route.continue();
    });
  }
  await page.evaluate(async sex => {
    (await import('/js/tour.js')).endTour({ openEmptyChat: false });
    await (await import('/js/export.js')).loadDemoData(sex);
    const { configureBiologyScoreAIDeps } = await import('/js/biology-score-ai.js');
    (window as unknown as { demoBiologyCalls: number }).demoBiologyCalls = 0;
    configureBiologyScoreAIDeps({ hasAIProvider: () => true, isAIPaused: () => false, automaticEnabled: () => true,
      callClaudeAPI: async () => { (window as unknown as { demoBiologyCalls: number }).demoBiologyCalls++; return { text: JSON.stringify({ summary: 'This is a saved test interpretation of the sample markers.', explanation: '## Main signal\nThe supplied markers describe this sample.\n\n## Context\nThis is a test response.\n\n## Next check\nReview the recorded collection context.' }) }; },
    });
    await (await import('/js/views.js')).navigate('biology-scores');
  }, sex);
  await expect(page.locator('body')).not.toHaveClass(/chat-autostart-reserved/);
  await expect(page.locator('#chat-panel')).not.toHaveClass(/\bopen\b/);
  const treatment = await page.evaluate(async sex => {
    const { state } = await import('/js/state.js');
    const { buildLabContext } = await import('/js/lab-context.js');
    const { buildClientExportObject } = await import('/js/export.js');
    const medication = state.importedData.supplements!.find(item => item.type === 'medication')!;
    const name = sex === 'female' ? 'Levothyroxine' : 'Atorvastatin';
    const context = buildLabContext({ queryText: `Could ${name} explain my results?` });
    const exported = await buildClientExportObject(state.currentProfile, false, false);
    if (!Array.isArray(exported.supplements)) throw new Error('Export omitted therapy records.');
    const exportedMedication = exported.supplements.find((item: unknown) => !!item && typeof item === 'object' && 'type' in item && item.type === 'medication');
    return { name: medication.name, periods: medication.periods, currentDose: medication.currentDose,
      inContext: context.includes(name) && medication.periods!.every(period => context.includes(period.start)),
      exported: exportedMedication };
  }, sex);
  expect(treatment.name).toBe(sex === 'female' ? 'Levothyroxine' : 'Atorvastatin');
  expect(treatment.periods).toHaveLength(sex === 'female' ? 3 : 1);
  expect(treatment.inContext).toBe(true);
  expect(treatment.currentDose).toMatchObject({ value: sex === 'female' ? 50 : 20, unit: sex === 'female' ? 'µg' : 'mg' });
  expect(treatment.exported).toMatchObject({ name: treatment.name, periods: treatment.periods, currentDose: treatment.currentDose });
  await page.evaluate(async () => (await import('/js/views.js')).navigate('supplements'));
  await expect(page.getByText(treatment.name, { exact: true }).first()).toBeVisible();
  await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
  await expect(page.locator('[data-biology-score-ai-summary]').first()).toContainText('Demo insight');
  const matrix = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { getActiveData, filterDatesByRange } = await import('/js/data.js');
    const { computeBiologyScores } = await import('/js/biology-scores.js');
    const { getScoreAIRefreshReason } = await import('/js/biology-score-sections.js');
    const output = [];
    for (const window of ['all', '1y', '6m', '3m']) for (const mode of ['reference', 'optimal']) {
      state.dateRangeFilter = window; state.rangeMode = mode;
      const data = filterDatesByRange(getActiveData(), { fallbackToAll: false });
      const scores = computeBiologyScores(data);
      output.push({ window, mode, draws: data.dates.length, scored: scores.filter(s => Number.isFinite(s.score) && s.coverage === 1).length, stale: scores.filter(s => getScoreAIRefreshReason(s)).length });
    }
    state.dateRangeFilter = 'all'; state.rangeMode = 'optimal';
    return output;
  });
  expect(matrix).toHaveLength(8);
  expect(matrix.every(view => view.scored === 19 && view.stale === 0 && view.draws >= 2)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { demoBiologyCalls: number }).demoBiologyCalls)).toBe(0);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 650, height: 844 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
    const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      cards: [...document.querySelectorAll<HTMLElement>('.biology-score-compact:not([open])')].filter(el => el.getBoundingClientRect().width).map(el => ({ top: Math.round(el.getBoundingClientRect().top), height: Math.round(el.getBoundingClientRect().height) })),
      domainClipping: [...document.querySelectorAll<HTMLElement>('.biology-coherence-domain-row')].filter(el => el.scrollWidth > el.clientWidth + 1).length,
      clipped: [...document.querySelectorAll<HTMLElement>('.biology-score-ai-teaser-text')].filter(el => el.getBoundingClientRect().width && el.scrollHeight > el.clientHeight + 2).length,
    }));
    expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1); expect(layout.clipped).toBe(0); expect(layout.domainClipping).toBe(0);
    if (viewport.width <= 650) {
      const columns = await page.locator('[data-biology-group=baseline] .lens-page-widgets').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      expect(columns).toBe(1);
    }
    for (const top of new Set(layout.cards.map(c => c.top))) {
      const heights = layout.cards.filter(c => c.top === top).map(c => c.height);
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
    }
    await page.screenshot({ path: `/tmp/getbased-demo-${sex}-${viewport.width}.png` });
    await page.locator('[data-biology-group=baseline]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/getbased-demo-cards-${sex}-${viewport.width}.png` });
    await page.getByRole('button', { name: 'Details for Metabolic Flexibility', exact: true }).click();
    const details = page.locator('#biology-score-panel-metabolicFlexibility');
    await expect(details).toBeVisible();
    await expect(details).toContainText('Demo explanation');
    await expect(details).toContainText('Core markers');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await details.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/getbased-demo-details-${sex}-${viewport.width}.png` });
    await page.getByRole('button', { name: 'Details for Metabolic Flexibility', exact: true }).click();
  }
  await page.locator('[data-biology-score-ai-summary="metabolicFlexibility"] button').click();
  await expect(page.locator('[data-biology-score-ai-summary="metabolicFlexibility"]')).toContainText('This is a saved test interpretation');
  expect(await page.evaluate(() => (window as unknown as { demoBiologyCalls: number }).demoBiologyCalls)).toBe(1);
  await page.reload();
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.supplements!.find(item => item.type === 'medication')!.periods)).toEqual(treatment.periods);
  await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
  await expect(page.locator('[data-biology-score-ai-summary="metabolicFlexibility"]')).toContainText('This is a saved test interpretation');
  await expect(page.locator('[data-biology-score-ai-summary="metabolicFlexibility"]')).not.toContainText('refresh needed');
  await expect(page.locator('[data-biology-score-ai-summary="stressResilience"]')).toContainText('Demo insight');
});
