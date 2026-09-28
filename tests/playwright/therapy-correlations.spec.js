import { expect, test } from './coverage-fixture.js';

async function fixture(page) {
  await page.route('**/dose-correlation-fixture', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/category-views.css"><style>body { display:block; padding:20px; } #main-content { margin:0; padding:0; max-width:1000px; width:100%; } </style></head><body><main id="main-content"></main><div id="modal-overlay"><div id="detail-modal"></div></div></body></html>` }));
  await page.goto('/dose-correlation-fixture');
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { invalidateActiveDataCache } = await import('/js/data.js');
    const dates = ['2025-12-01', '2026-01-10', '2026-01-20', '2026-02-10', '2026-03-10', '2026-03-20', '2026-04-10', '2026-05-15', '2026-06-15'];
    const values = [2, 2.2, 2.3, 2.1, 3.5, 3.6, 3.4, 2.5, 2.8];
    state.importedData = {
      entries: dates.map((date, i) => ({ date, markers: { 'lipids.ldl': values[i] }, sourceFile: `lab-${date}.pdf` })),
      supplements: [
        { id: 'dose-demo', name: 'Example supplement', type: 'supplement', schedule: { mode: 'daily', timesPerDay: 1 }, periods: [
          { start: '2026-01-01', end: '2026-02-28', dose: '500 mg' },
          { start: '2026-03-01', end: '2026-04-30', dose: '2000 mg' },
          { start: '2026-06-01', end: null, dose: '1000 mg' },
        ] },
        { id: 'prn-demo', name: 'Example medication', type: 'medication', schedule: { mode: 'prn' }, periods: [{ start: '2026-01-01', end: '2026-04-30', dose: '20 mg' }] },
      ], notes: [], customMarkers: {}, markerNotes: {}, markerValueNotes: {}, changeHistory: [],
    };
    state.selectedCorrelationMarkers = [];
    state.selectedCorrelationSupplements = [];
    invalidateActiveDataCache();
    const { showCorrelations } = await import('/js/compare-correlations.js');
    showCorrelations();
  });
}

async function select(page, query, key, action = 'toggle-marker') {
  await page.locator('#corr-search').fill(query);
  await page.locator(`.corr-option[data-compare-action="${action}"][data-compare-key="${key}"]`).click();
}

test('selects historical therapies and renders real dose increases, pauses and decreases with lab provenance', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await fixture(page);
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await expect(page.locator('.corr-therapy-card')).toHaveCount(1);
  await expect(page.locator('.corr-stat')).toContainText('Exploratory Pearson');
  await expect.poll(() => page.evaluate(async () => !!(await import('/js/state.js')).state.chartInstances['correlation-therapy-0'])).toBe(true);
  const chart = await page.evaluate(async () => {
    const chart = (await import('/js/state.js')).state.chartInstances['correlation-therapy-0'];
    return { type: chart.options.scales.x.type, doses: [...new Set(chart.data.datasets[1].data.map(p => p.y))], min: chart.options.scales.x.min, max: chart.options.scales.x.max };
  });
  expect(chart.type).toBe('linear');
  expect(chart.doses).toEqual([null, 500, 2000, 0, 1000]);
  expect(chart.max - chart.min).toBeGreaterThan(190);
  await page.locator('summary').click();
  await expect(page.locator('details')).toContainText('lab-2026-01-10.pdf');
  await expect(page.locator('details')).toContainText('Before first recorded use');
  await expect(page.locator('details')).toContainText('Recorded break / stopped');
  await page.locator('#corr-lag').selectOption('30');
  await expect(page.locator('#corr-therapy-results')).toContainText('30 days earlier');
  const lag = await page.evaluate(async () => {
    const chart = (await import('/js/state.js')).state.chartInstances['correlation-therapy-0'];
    return chart.data.datasets[1].label;
  });
  expect(lag).toContain('shifted 30 days');
  await page.screenshot({ path: '/tmp/getbased-dose-correlations-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('keeps PRN exposure unknown and remains usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Example medication', 'prn-demo', 'toggle-therapy');
  await expect(page.locator('.corr-stat')).toContainText('Coefficient unavailable');
  await page.locator('summary').click();
  await expect(page.locator('details')).toContainText('actual intake unknown');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/getbased-dose-correlations-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Remove Example medication', exact: true }).click();
  await expect(page.locator('#corr-chart-container')).toBeHidden();
  expect(await page.evaluate(async () => Object.keys((await import('/js/state.js')).state.chartInstances).filter(key => key.startsWith('correlation-therapy-')))).toEqual([]);
});

test('the real editor saves dose and frequency changes without overwriting prior periods', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const supplements = await import('/js/supplements.js');
    const { localDateKey } = await import('/js/supplement-medication-domain.js');
    const today = localDateKey();
    state.importedData.supplements = [{ id: 'editor-demo', name: 'Editor example', type: 'medication', timesPerDay: 1, schedule: { mode: 'daily', timesPerDay: 1 }, periods: [{ start: '2026-01-01', end: null, dose: '500 mg' }], currentDose: '500 mg' }];
    supplements.openSupplementsEditor(0);
    supplements.beginSupplementDoseChange(0);
    document.querySelectorAll('.supp-period-dose')[1].value = '2000 mg';
    supplements.saveSupplement(0);
    const changed = structuredClone(state.importedData.supplements[0]);
    // A separate older open period lets a frequency-only edit exercise splitting.
    state.importedData.supplements[0] = { ...changed, periods: [{ start: '2026-01-01', end: null, dose: '500 mg' }], currentDose: '500 mg' };
    supplements.openSupplementsEditor(0);
    document.getElementById('supp-times').value = '4';
    document.getElementById('supp-schedule-mode').value = 'multiple';
    supplements.saveSupplement(0);
    const frequency = structuredClone(state.importedData.supplements[0]);
    supplements.pauseSupplement(0);
    const paused = structuredClone(state.importedData.supplements[0]);
    supplements.restartSupplement(0);
    return { today, changed, frequency, paused, restarted: state.importedData.supplements[0] };
  });
  expect(result.changed.periods).toHaveLength(2);
  expect(result.changed.periods[0].dose).toBe('500 mg');
  expect(result.changed.periods[1]).toMatchObject({ start: result.today, dose: '2000 mg', schedule: { timesPerDay: 1 } });
  expect(result.changed.currentDose).toBe('2000 mg');
  expect(result.frequency.periods).toHaveLength(2);
  expect(result.frequency.periods[0].schedule).toBeUndefined();
  expect(result.frequency.periods[1].schedule.timesPerDay).toBe(4);
  expect(result.paused.periods[1].end).toBe(result.today);
  expect(result.paused.lifecycle.state).toBe('paused');
  expect(result.restarted.periods).toHaveLength(2);
  expect(result.restarted.periods[1].end).toBeNull();
});
