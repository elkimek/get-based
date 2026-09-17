import { expect, test } from './coverage-fixture.js';

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
    window.demoBiologyCalls = 0;
    configureBiologyScoreAIDeps({ hasAIProvider: () => true, isAIPaused: () => false, automaticEnabled: () => true,
      callClaudeAPI: async () => { window.demoBiologyCalls++; return { text: JSON.stringify({ summary: 'This is a saved test interpretation of the sample markers.', explanation: '## Main signal\nThe supplied markers describe this sample.\n\n## Context\nThis is a test response.\n\n## Next check\nReview the recorded collection context.' }) }; },
    });
    await (await import('/js/views.js')).navigate('biology-scores');
  }, sex);
  await expect(page.locator('body')).not.toHaveClass(/chat-autostart-reserved/);
  await expect(page.locator('#chat-panel')).not.toHaveClass(/\bopen\b/);
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
  expect(await page.evaluate(() => window.demoBiologyCalls)).toBe(0);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 650, height: 844 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
    const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      cards: [...document.querySelectorAll('.biology-score-compact:not([open])')].filter(el => el.getBoundingClientRect().width).map(el => ({ top: Math.round(el.getBoundingClientRect().top), height: Math.round(el.getBoundingClientRect().height) })),
      domainClipping: [...document.querySelectorAll('.biology-coherence-domain-row')].filter(el => el.scrollWidth > el.clientWidth + 1).length,
      clipped: [...document.querySelectorAll('.biology-score-ai-teaser-text')].filter(el => el.getBoundingClientRect().width && el.scrollHeight > el.clientHeight + 2).length,
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
  expect(await page.evaluate(() => window.demoBiologyCalls)).toBe(1);
  await page.reload();
  await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
  await expect(page.locator('[data-biology-score-ai-summary="metabolicFlexibility"]')).toContainText('This is a saved test interpretation');
  await expect(page.locator('[data-biology-score-ai-summary="metabolicFlexibility"]')).not.toContainText('refresh needed');
  await expect(page.locator('[data-biology-score-ai-summary="stressResilience"]')).toContainText('Demo insight');
});
