import { expect, test } from './coverage-fixture.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeScriptPath = require.resolve('axe-core/axe.min.js');

function moduleUrl() {
  return `/js/context-card-editor-ui.js?contextEditorStylesheetCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openLoaderPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head>
      <link rel="stylesheet" href="/css/context-profile.css">
      <meta data-context-editor-stylesheet-anchor>
      <meta data-genetics-stylesheet-anchor>
    </head><body><div id="notification-container"></div></body></html>`,
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('context editor stylesheet loader single-flights and preserves cascade order', async ({ page }) => {
  let stylesheetRequests = 0;
  await page.route('**/css/context-editor.css*', route => {
    stylesheetRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '.ctx-editor-modal { overflow-x: hidden; }',
    });
  });
  await openLoaderPage(page, '/context-editor-stylesheet-cache-coverage');

  const outcomes = await page.evaluate(async ({ runtimeUrl }) => {
    const runtime = await import(runtimeUrl);
    const loadedBeforeRequest = runtime.isContextEditorStylesheetLoaded();
    const [first, second] = await Promise.all([
      runtime.loadContextEditorStylesheet(),
      runtime.loadContextEditorStylesheet(),
    ]);
    const third = await runtime.loadContextEditorStylesheet();
    const anchor = document.querySelector('[data-context-editor-stylesheet-anchor]');
    return {
      loadedBeforeRequest,
      loadedAfterRequest: runtime.isContextEditorStylesheetLoaded(),
      concurrentCallsShareTheSameLink: first === second,
      laterCallsReuseTheResolvedLink: first === third,
      oneStylesheetLink:
        document.querySelectorAll('link[data-context-editor-stylesheet]').length === 1,
      linkPrecedesAnchor: first.nextElementSibling === anchor,
      anchorPreservesCascade:
        anchor?.previousElementSibling === first
        && anchor?.nextElementSibling?.hasAttribute('data-genetics-stylesheet-anchor') === true,
    };
  }, { runtimeUrl: moduleUrl() });

  expect(outcomes).toEqual({
    loadedBeforeRequest: false,
    loadedAfterRequest: true,
    concurrentCallsShareTheSameLink: true,
    laterCallsReuseTheResolvedLink: true,
    oneStylesheetLink: true,
    linkPrecedesAnchor: true,
    anchorPreservesCascade: true,
  });
  expect(stylesheetRequests).toBe(1);
});

test('context editor stylesheet failure is contained and retries before running the action', async ({ page }) => {
  const stylesheetRequests = [];
  await page.route('**/css/context-editor.css*', route => {
    stylesheetRequests.push(route.request().url());
    return route.abort('failed');
  });
  await openLoaderPage(page, '/context-editor-stylesheet-retry-coverage');
  const runtimeUrl = moduleUrl();

  const firstAttempt = await page.evaluate(async ({ runtimeUrl: url }) => {
    const runtime = await import(url);
    let actions = 0;
    return {
      result: await runtime.runWithContextEditorStylesheet(() => { actions += 1; }),
      actions,
      links: document.querySelectorAll('link[data-context-editor-stylesheet]').length,
    };
  }, { runtimeUrl });

  expect(firstAttempt).toEqual({ result: false, actions: 0, links: 0 });
  expect(stylesheetRequests).toHaveLength(1);

  await page.unroute('**/css/context-editor.css*');
  const retry = await page.evaluate(async ({ runtimeUrl: url }) => {
    const runtime = await import(url);
    let actions = 0;
    await runtime.runWithContextEditorStylesheet(() => { actions += 1; });
    const link = document.querySelector('link[data-context-editor-stylesheet]');
    return {
      actions,
      href: link?.href || '',
      sheetLoaded: link?.sheet !== null,
    };
  }, { runtimeUrl });

  expect(retry.actions).toBe(1);
  expect(retry.sheetLoaded).toBe(true);
  expect(new URL(retry.href).searchParams.get('lazy-retry')).toBe('1');
});

test('cold startup defers context editor presentation until a real editor opens', async ({ page }) => {
  let stylesheetRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/css/context-editor.css') stylesheetRequests += 1;
  });

  await page.goto('/app', { waitUntil: 'networkidle' });
  expect(stylesheetRequests).toBe(0);
  await expect(page.locator('link[data-context-editor-stylesheet]')).toHaveCount(0);

  const opened = await page.evaluate(async () => {
    const contextCards = await import('/js/context-cards.js');
    await contextCards.openDietEditor();
    const modal = document.getElementById('detail-modal');
    const head = modal?.querySelector('.ctx-editor-head');
    return {
      label: modal?.getAttribute('aria-label') || '',
      overflowX: modal ? getComputedStyle(modal).overflowX : '',
      headerPosition: head ? getComputedStyle(head).position : '',
    };
  });

  expect(stylesheetRequests).toBe(1);
  await expect(page.locator('link[data-context-editor-stylesheet]')).toHaveCount(1);
  expect(opened).toEqual({
    label: 'Diet & Digestion',
    overflowX: 'hidden',
    headerPosition: 'sticky',
  });
});

test('long context editors use accessible progressive disclosure on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const [{ state }, contextCards] = await Promise.all([
      import('/js/state.js'),
      import('/js/context-cards.js'),
    ]);
    state.importedData.diet = null;
    await contextCards.openDietEditor();
  });

  const modal = page.locator('#detail-modal');
  await expect(page.locator('#tour-overlay')).toHaveCount(0);
  await expect(modal).toHaveAttribute('aria-label', 'Diet & Digestion');
  await expect(modal.locator('details.ctx-editor-section')).toHaveCount(3);
  await expect(modal.locator('details.ctx-editor-section[open]')).toHaveCount(0);
  const mealsSection = modal.locator('details.ctx-editor-section').filter({ hasText: 'Typical meals' });
  await mealsSection.locator('summary').click();
  await expect(mealsSection).toHaveAttribute('open', '');
  await expect(modal.locator('#diet-breakfast')).toBeVisible();

  const bounds = await modal.boundingBox();
  expect(bounds?.width).toBeLessThanOrEqual(390);

  await page.addScriptTag({ path: axeScriptPath });
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document.getElementById('detail-modal'), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return result.violations.map(violation => violation.id);
  });
  expect(violations).toEqual([]);
});

test('detailed meal logs pause Typical meals without turning partial logs into full-day intake', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });

  const result = await page.evaluate(async () => {
    const [{ state }, contextCards, summaries, nutritionContext, nutritionSummary, labContext] = await Promise.all([
      import('/js/state.js'),
      import('/js/context-cards.js'),
      import('/js/context-card-summaries.js'),
      import('/js/nutrition-context.js'),
      import('/js/nutrition-summary.js'),
      import('/js/lab-context.js'),
    ]);
    state.importedData.diet = {
      type: 'mediterranean',
      breakfast: 'Oats and berries',
      breakfastTime: '08:00',
      lunch: 'Chicken salad',
      lunchTime: '12:30',
      bloating: 'moderate',
      restrictions: ['gluten-free'],
    };
    const now = new Date();
    const meals = Array.from({ length: 5 }, (_, index) => {
      const eatenAt = new Date(now);
      eatenAt.setDate(eatenAt.getDate() - index);
      eatenAt.setHours(12, 30, 0, 0);
      return {
        eatenAt: eatenAt.toISOString(),
        mealType: 'lunch',
        reviewed: true,
        source: { kind: 'manual' },
        nutrients: { energyKcal: 500, proteinG: 30 },
      };
    });
    state.nutritionSummary = nutritionSummary.computeNutritionSummary(meals, { now });

    nutritionContext.setNutritionContextEnabled(true);
    const context = labContext.buildLabContext({ skipGroupFilter: true });
    const cardSummary = summaries.getDietSummary(state.importedData.diet);
    const dashboard = contextCards.renderProfileContextCards();

    nutritionContext.setNutritionContextEnabled(false);
    const fallbackContext = labContext.buildLabContext({ skipGroupFilter: true });
    const fallbackSummary = summaries.getDietSummary(state.importedData.diet);

    nutritionContext.setNutritionContextEnabled(true);
    await contextCards.openDietEditor();
    return { context, cardSummary, dashboard, fallbackContext, fallbackSummary };
  });

  expect(result.context).toContain('occasions: lunch 5');
  expect(result.context).toContain('Never infer skipped meals, under-eating');
  expect(result.context).toContain('Detailed logs replace, never supplement, Diet & Digestion Typical meals');
  expect(result.context).not.toContain('Oats and berries');
  expect(result.context).not.toContain('Chicken salad');
  expect(result.context).toContain('Bloating: moderate');
  expect(result.context).toContain('Restrictions: gluten-free');
  expect(result.cardSummary).not.toContain('Oats and berries');
  expect(result.dashboard).toContain('Detailed meal log active');
  expect(result.dashboard).toContain('Replaces Typical meals');

  expect(result.fallbackContext).toContain('Breakfast (08:00): Oats and berries');
  expect(result.fallbackContext).toContain('Lunch (12:30): Chicken salad');
  expect(result.fallbackContext).not.toContain('Detailed logs replace, never supplement');
  expect(result.fallbackSummary).toContain('B: Oats and berries');

  const modal = page.locator('#detail-modal');
  const mealsSection = modal.locator('details.ctx-editor-section').filter({ hasText: 'Typical meals' });
  await expect(mealsSection.locator('.ctx-editor-section-summary')).toContainText('Paused — detailed log active');
  await mealsSection.locator('summary').click();
  await expect(mealsSection.locator('#diet-meal-precedence')).toContainText('Saved examples stay here but are not sent to AI');
  await expect(mealsSection.locator('#diet-meal-precedence')).toContainText('unlogged meals stay unknown');
  await expect(mealsSection.locator('#diet-breakfast')).toBeDisabled();
  await expect(mealsSection.locator('#diet-breakfast')).toHaveValue('Oats and berries');
  await expect(mealsSection.locator('#diet-lunch')).toBeDisabled();
  await expect(mealsSection.locator('#diet-lunch')).toHaveValue('Chicken salad');
});

test('saved long-form details stay summarized and reopened editors start at the top', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app', { waitUntil: 'load' });

  const result = await page.evaluate(async () => {
    const [{ state }, contextCards, modalLifecycle] = await Promise.all([
      import('/js/state.js'),
      import('/js/context-cards.js'),
      import('/js/modal-lifecycle.js'),
    ]);
    state.importedData.diet = {
      type: 'mediterranean',
      lunch: 'Salad',
      dinner: 'Salmon',
      bowelFrequency: '1x/day',
      bloating: 'occasional',
      note: 'A longer note that should remain fully editable.',
    };
    state.importedData.environment = {
      setting: 'suburban',
      climate: 'temperate',
      water: 'reverse osmosis',
      waterConcerns: ['fluoridated'],
      emf: ['WiFi router nearby'],
      emfMitigation: [],
      homeLight: 'mostly LED lighting',
      air: ['HEPA air purifier'],
      toxins: [],
      building: 'new construction (<5yr)',
      note: 'Environment note',
    };

    await contextCards.openDietEditor();
    const modal = document.getElementById('detail-modal');
    modal.scrollTop = 500;
    const scrolledDiet = modal.scrollTop > 0;
    modalLifecycle.closeModalOverlay('modal-overlay', { restoreFocus: false });
    await contextCards.openEnvironmentEditor();

    return {
      scrolledDiet,
      reopenedAtTop: modal.scrollTop === 0,
      collapsedSections: modal.querySelectorAll('details.ctx-editor-section[open]').length,
      sectionSummaries: Array.from(modal.querySelectorAll('.ctx-editor-section-summary'))
        .map(el => el.textContent.trim()),
      noteTag: modal.querySelector('#ctx-note-input')?.tagName,
      noteValue: modal.querySelector('#ctx-note-input')?.value,
    };
  });

  expect(result.scrolledDiet).toBe(true);
  expect(result.reopenedAtTop).toBe(true);
  expect(result.collapsedSections).toBe(0);
  expect(result.sectionSummaries).toEqual(expect.arrayContaining([
    expect.stringContaining('reverse osmosis'),
    expect.stringContaining('WiFi router nearby'),
    expect.stringContaining('mostly LED lighting'),
  ]));
  expect(result.noteTag).toBe('TEXTAREA');
  expect(result.noteValue).toBe('Environment note');
});
