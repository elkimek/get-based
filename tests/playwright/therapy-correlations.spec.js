import { expect, test } from './coverage-fixture.js';

async function fixture(page) {
  await page.route('**/dose-correlation-fixture', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/category-views.css"><link rel="stylesheet" href="/css/context-profile.css"><link rel="stylesheet" href="/css/modal-shared.css"><style>body { display:block; padding:20px; } #main-content { margin:0; padding:0; max-width:1000px; width:100%; } </style></head><body><main id="main-content"></main><div id="modal-overlay" class="modal-overlay"><div id="detail-modal" class="modal"></div></div></body></html>` }));
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
          { start: '2026-01-01', end: '2026-02-28', dose: '500 mg', schedule: { mode: 'daily' } },
          { start: '2026-03-01', end: '2026-04-30', dose: '2000 mg', schedule: { mode: 'daily' } },
          { start: '2026-06-01', end: null, dose: '1000 mg', schedule: { mode: 'daily' } },
        ] },
        { id: 'prn-demo', name: 'Example medication', type: 'medication', schedule: { mode: 'prn' }, periods: [{ start: '2026-01-01', end: '2026-04-30', dose: '20 mg', schedule: { mode: 'prn' } }] },
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
  await page.locator('.corr-analysis-disclosure > summary').click();
  await page.locator('#corr-pair-detail summary').click();
  await expect(page.locator('#corr-pair-detail details')).toContainText('lab-2026-01-10.pdf');
  await expect(page.locator('#corr-pair-detail details')).toContainText('Before first recorded use');
  await expect(page.locator('#corr-pair-detail details')).toContainText('Recorded break / stopped');
  await expect(page.locator('#corr-lag')).toHaveCount(0);
  await expect(page.getByRole('tablist', { name: 'Comparison' })).toHaveCount(0);
  const points = await page.evaluate(async () => (await import('/js/state.js')).state.chartInstances['correlation-therapy-0'].data.datasets[1].data);
  expect(points.find(p => p.y === 2000).x).toBe(Date.parse('2026-03-01') / 86400000);
  await page.screenshot({ path: '/tmp/getbased-dose-correlations-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('keeps PRN exposure unknown and remains usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Example medication', 'prn-demo', 'toggle-therapy');
  await expect(page.locator('.corr-stat')).toContainText('Coefficient unavailable');
  await page.locator('.corr-analysis-disclosure > summary').click();
  await page.locator('#corr-pair-detail summary').click();
  await expect(page.locator('#corr-pair-detail details')).toContainText('actual intake unknown');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/getbased-dose-correlations-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Remove Example medication', exact: true }).click();
  await expect(page.locator('#corr-chart-container')).toBeHidden();
  expect(await page.evaluate(async () => Object.keys((await import('/js/state.js')).state.chartInstances).filter(key => key.startsWith('correlation-therapy-')))).toEqual([]);
});

test('Change dose can recreate a deleted draft period and saves the new dose with history intact', async ({ page }) => {
  await fixture(page);
  const today = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { localDateKey } = await import('/js/supplement-medication-domain.js');
    state.importedData.supplements = [{ id: 'dose-retry', name: 'Dose retry', type: 'supplement',
      timesPerDay: 1, schedule: { mode: 'daily', timesPerDay: 1 },
      periods: [{ start: '2026-01-01', end: null, dose: '500 mg/day' }], currentDose: '500 mg/day' }];
    await (await import('/js/data.js')).saveImportedData();
    (await import('/js/supplements.js')).openSupplementsEditor(0);
    return localDateKey();
  });
  const rows = page.locator('#supp-periods .supp-period-row');
  const changeDose = page.getByRole('button', { name: 'New dose from today', exact: true });
  await changeDose.click();
  await expect(rows).toHaveCount(2);
  await rows.last().locator('[data-supp-action="remove-period"]').click();
  await expect(rows).toHaveCount(1);
  await changeDose.click();
  await expect(rows).toHaveCount(2);
  await expect(rows.last().locator('.supp-period-start')).toHaveValue(today);
  await expect(rows.last().locator('.supp-period-dose')).toBeFocused();
  await rows.last().locator('.supp-period-dose').fill('1000 mg/day');
  await changeDose.click();
  await expect(rows).toHaveCount(2);
  await expect(rows.last().locator('.supp-period-dose')).toBeFocused();
  await expect(rows.last().locator('.supp-period-dose')).toHaveValue('1000 mg/day');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('#supp-form-panel button:disabled')).toHaveCount(0);
  const saved = await page.evaluate(async () => (await import('/js/state.js')).state.importedData.supplements[0]);
  expect(saved.periods).toHaveLength(2);
  expect(saved.periods[0]).toMatchObject({ start: '2026-01-01', dose: '500 mg/day' });
  expect(saved.periods[0].end < today).toBe(true);
  expect(saved.periods[1]).toMatchObject({ start: today, end: null, dose: '1000 mg/day' });
  expect(saved.currentDose).toBe('1000 mg/day');
});

test('the real editor saves dose and frequency changes without overwriting prior periods', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const supplements = await import('/js/supplements.js');
    const { localDateKey } = await import('/js/supplement-medication-domain.js');
    const today = localDateKey();
    state.importedData.supplements = [{ id: 'editor-demo', name: 'Editor example', type: 'medication', timesPerDay: 1, schedule: { mode: 'daily', timesPerDay: 1 }, periods: [{ start: '2026-01-01', end: null, dose: '500 mg' }], currentDose: '500 mg' }];
    await (await import('/js/data.js')).saveImportedData();
    supplements.openSupplementsEditor(0);
    supplements.beginSupplementDoseChange(0);
    document.querySelectorAll('.supp-period-dose')[1].value = '2000 mg';
    await supplements.saveSupplement(0);
    const changed = structuredClone(state.importedData.supplements[0]);
    // A separate older open period lets a frequency-only edit exercise splitting.
    state.importedData.supplements[0] = { ...changed, periods: [{ start: '2026-01-01', end: null, dose: '500 mg' }], currentDose: '500 mg' };
    await (await import('/js/data.js')).saveImportedData();
    supplements.openSupplementsEditor(0);
    document.getElementById('supp-times').value = '4';
    document.getElementById('supp-schedule-mode').value = 'multiple';
    await supplements.saveSupplement(0);
    const frequency = structuredClone(state.importedData.supplements[0]);
    await supplements.pauseSupplement(0);
    const paused = structuredClone(state.importedData.supplements[0]);
    await supplements.restartSupplement(0);
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


test('draws unknown-dose usage and pauses without treating product strength as intake', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const record = state.importedData.supplements[0];
    record.currentDose = '2000 mg';
    record.ingredients = [{ amount: '500 mg' }];
    record.periods = [
      { start: '2026-01-01', end: '2026-02-28' },
      { start: '2026-07-01', end: null },
    ];
  });
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await expect(page.locator('.corr-stat')).toContainText('Coefficient unavailable');
  await expect.poll(() => page.evaluate(async () => !!(await import('/js/state.js')).state.chartInstances['correlation-therapy-0'])).toBe(true);
  const result = await page.evaluate(async () => {
    const chart = (await import('/js/state.js')).state.chartInstances['correlation-therapy-0'];
    const track = document.querySelector('.corr-use-track');
    return { labels: chart.data.datasets.map(d => d.label), doseAxis: chart.options.scales.dose.display,
      last: chart.options.scales.x.max,
      recorded: track.querySelectorAll('.corr-use-recorded').length,
      paused: track.querySelectorAll('.corr-use-paused').length,
      unknown: track.querySelectorAll('.corr-use-unknown').length,
      trackLeft: track.getBoundingClientRect().left,
      plotLeft: chart.canvas.getBoundingClientRect().left + chart.chartArea.left };
  });
  expect(result.labels).toEqual(['LDL Cholesterol (mmol/l)']);
  expect(result.doseAxis).toBe(false);
  expect(result.recorded).toBe(2);
  expect(result.paused).toBe(1);
  expect(result.unknown).toBe(1);
  expect(Math.abs(result.trackLeft - result.plotLeft)).toBeLessThan(2);
  expect(result.last).toBeGreaterThan(Date.parse('2026-07-01') / 86400000);
  await expect(page.locator('.corr-therapy-card')).toContainText('No lab measurements have usable numeric dose information');
  await page.screenshot({ path: '/tmp/getbased-unknown-dose-chart.png', fullPage: true });
});


test('shows current ingredient dose and lets the user confirm its period before using it historically', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.supplements[0] = { id: 'dose-demo', name: 'Example supplement', type: 'supplement',
      timesPerDay: 1, schedule: { mode: 'daily', timesPerDay: 1 },
      ingredients: [{ name: 'TMG', amountValue: 500, amountUnit: 'mg', amount: '500 mg' }],
      periods: [{ start: '2026-01-01', end: null }],
    };
  });
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await expect(page.locator('.corr-current-dose')).toContainText('Example supplement');
  await expect(page.locator('.corr-current-dose')).toContainText('TMG');
  await expect(page.locator('.corr-current-dose')).toContainText('500 mg/day');
  await expect(page.locator('.corr-dose-notice')).toContainText('Current amount: 500 mg/day');
  await expect(page.locator('.corr-dose-notice')).toContainText('Confirm its dates');
  await expect(page.locator('#corr-grouping-separate')).toBeDisabled();
  await expect(page.locator('#corr-layout-status')).toContainText('Only one pair');
  await expect(page.locator('.corr-therapy-card')).toContainText('No lab measurements have usable numeric dose information');
  const presentation = await page.evaluate(async () => {
    const chart = (await import('/js/state.js')).state.chartInstances['correlation-therapy-0'];
    return { labels: chart.data.datasets.map(d => d.label), scales: Object.keys(chart.scales) };
  });
  expect(presentation.labels).toEqual(['LDL Cholesterol (mmol/l)']);
  expect(presentation.scales.some(key => key.startsWith('current-') || key === 'usage')).toBe(false);
  await expect(page.locator('.corr-stat')).toContainText('Confirm dose dates');
  await page.screenshot({ path: '/tmp/getbased-current-ingredient-dose.png', fullPage: true });
  await page.evaluate(async () => (await import('/js/data.js')).saveImportedData());
  await page.getByRole('button', { name: 'Edit supplement', exact: true }).click();
  await page.getByRole('button', { name: 'Use ingredient totals', exact: true }).click();
  await expect(page.locator('.supp-period-dose')).toHaveValue('500 mg/day');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('#supp-form-panel button:disabled')).toHaveCount(0);
  // An ingredient edit now creates a dose step from today, preserving the confirmed history.
  await page.locator('.supp-ing-amount').fill('2000');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('#supp-form-panel button:disabled')).toHaveCount(0);
  await expect(page.locator('#supp-form-panel button:disabled')).toHaveCount(0);
  const periods = await page.evaluate(async () => (await import('/js/state.js')).state.importedData.supplements[0].periods);
  expect(periods).toHaveLength(2);
  expect(periods[0].dose).toMatchObject({ ingredient: 'TMG', value: 500, basis: 'day' });
  expect(periods[1].dose).toMatchObject({ ingredient: 'TMG', value: 2000, basis: 'day' });
  await page.evaluate(async () => {
    document.getElementById('modal-overlay').classList.remove('show');
  });
  await expect.poll(() => page.evaluate(async () => {
    const chart = (await import('/js/state.js')).state.chartInstances['correlation-therapy-0'];
    return chart?.data.datasets.find(d => d.yAxisID === 'dose')?.data.map(p => p.y).filter(v => v !== null);
  })).toContain(2000);
  await expect(page.locator('.corr-dose-notice')).toHaveCount(0);
  await expect(page.locator('.corr-current-dose')).toContainText('Recorded since');
  await expect(page.locator('.corr-current-dose')).not.toContainText('Start date not confirmed');
  await page.screenshot({ path: '/tmp/getbased-confirmed-ingredient-step.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => (await import('/js/supplements.js')).openSupplementsEditor(0));
  await expect.poll(() => page.evaluate(() => { const modal = document.getElementById('detail-modal'); return modal.scrollWidth <= modal.clientWidth + 1; })).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.supp-period-dose-summary').first().scrollIntoViewIfNeeded();
  await page.locator('#detail-modal').screenshot({ path: '/tmp/getbased-ingredient-editor-mobile.png' });
});


test('keeps a combination product together and shows only confirmed dose series in the legend', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const record = state.importedData.supplements[0];
    record.ingredients = [{ name: 'Ingredient A', amount: '500 mg', timesPerDay: 1 }, { name: 'Ingredient B', amount: '25 mcg', timesPerDay: 1 }];
    record.periods[1].dose = '';
  });
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await expect(page.locator('.corr-therapy-card')).toHaveCount(1);
  await expect(page.locator('.corr-current-dose li')).toHaveCount(2);
  await expect(page.locator('.corr-current-dose')).toContainText('25 mcg/day');
  const view = await page.evaluate(async () => {
    const chart = (await import('/js/state.js')).state.chartInstances['correlation-therapy-0'];
    return { labels: chart.data.datasets.map(d => d.label), axes: Object.keys(chart.scales),
      doses: chart.data.datasets[1].data.map(p => p.y),
      tracks: document.querySelectorAll('.corr-use-track').length,
      width: document.documentElement.scrollWidth, viewport: innerWidth };
  });
  expect(view.labels).toEqual(['LDL Cholesterol (mmol/l)', 'Example supplement dose (mg per dose)']);
  expect(view.axes).toEqual(['x', 'y', 'dose']);
  expect(view.doses).toContain(null);
  expect(view.tracks).toBe(0);
  expect(view.width).toBeLessThanOrEqual(view.viewport);
  await expect(page.locator('#corr-pair-detail details')).not.toHaveAttribute('open');
  await page.screenshot({ path: '/tmp/getbased-dose-unified-mobile.png', fullPage: true });
});


test('clears accepted searches and restores focus for the next marker or supplement', async ({ page }) => {
  await fixture(page);
  const search = page.locator('#corr-search');
  await select(page, 'LDL', 'lipids.ldl');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(page.locator('#corr-options')).not.toHaveClass(/show/);
  await search.pressSequentially('Example supplement');
  await page.locator('.corr-option[data-compare-key="dose-demo"]').click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await search.pressSequentially('Example medication');
  await page.locator('.corr-option[data-compare-key="prn-demo"]').press('Enter');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(1);
  await expect(page.locator('.corr-pair-tabs [role=tab]')).toHaveCount(2);
  await search.fill('unfinished query');
  await page.getByRole('button', { name: 'Remove Example medication', exact: true }).click();
  await expect(search).toHaveValue('unfinished query');
});

async function chartSnapshot(page) {
  return page.evaluate(async () => Object.entries((await import('/js/state.js')).state.chartInstances)
    .filter(([key]) => key.startsWith('correlation-therapy-')).map(([key, c]) => ({ key, min: c.options.scales.x.min, max: c.options.scales.x.max, datasets: c.data.datasets.map(d => ({ label: d.label, data: d.data, axis: d.yAxisID })) })));
}

test('combines two dose series, preserves state across layouts, and inspects real dates without interpolation', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.supplements[1] = { id: 'prn-demo', name: 'Example medication', type: 'medication', periods: [{ start: '2026-02-01', end: null, dose: '250 mg', schedule: { mode: 'daily' } }] };
  });
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await select(page, 'Example medication', 'prn-demo', 'toggle-therapy');
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(1);
  expect((await chartSnapshot(page))[0].datasets).toHaveLength(3);
  await page.locator('.corr-jump summary').click();
  await page.locator('#corr-inspect').fill('2026-01-15');
  await page.locator('#corr-inspect').dispatchEvent('change');
  await expect(page.locator('#corr-readout')).toContainText('No measurement on this date');
  await expect(page.locator('#corr-readout')).toContainText('500 mg per dose');
  await expect(page.locator('#corr-readout')).toContainText('Before first recorded use');
  await page.locator('#corr-grouping-separate').click();
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(2);
  const separate = await chartSnapshot(page);
  expect(separate[0].min).toBe(separate[1].min);
  expect(separate[0].max).toBe(separate[1].max);
  await page.locator('#corr-grouping-combined').click();
  await page.locator('#corr-layout-lanes').click();
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(3);
  const areas = await page.evaluate(async () => Object.values((await import('/js/state.js')).state.chartInstances).map(c => c.chartArea));
  expect(Math.max(...areas.map(a => a.left)) - Math.min(...areas.map(a => a.left))).toBeLessThan(2);
  expect(Math.max(...areas.map(a => a.right)) - Math.min(...areas.map(a => a.right))).toBeLessThan(2);
  await expect(page.locator('#corr-inspect')).toHaveValue('2026-01-15');
  await page.locator('#corr-layout-overlay').click();
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await page.locator('#corr-start').fill('2026-03-01');
  await page.locator('#corr-start').dispatchEvent('change');
  await page.locator('#corr-end').fill('2026-04-30');
  await page.locator('#corr-end').dispatchEvent('change');
  await expect(page.locator('#corr-analysis-panel')).toContainText('3 paired');
  expect((await chartSnapshot(page))[0].min).toBe(Date.parse('2026-03-01') / 86400000);
  await page.getByRole('button', { name: 'Scatter', exact: true }).click();
  await expect(page.locator('#corr-scatter')).toBeVisible();
  expect((await chartSnapshot(page))[0].datasets[0].data).toHaveLength(3);
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.locator('#corr-pair-detail details')).toHaveAttribute('open', '');
  await expect(page.locator('#corr-pair-detail')).not.toContainText('lab-2026-01-10.pdf');
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await page.locator('[data-corr-series="prn-demo"]').click();
  expect((await chartSnapshot(page))[0].datasets).toHaveLength(2);
  await expect(page.locator('.corr-pair-tabs [role=tab]')).toHaveCount(2);
  await page.locator('#corr-start').fill('2026-05-01');
  await page.locator('#corr-start').dispatchEvent('change');
  await expect(page.getByRole('alert')).toContainText('Start date');
  expect(await chartSnapshot(page)).toHaveLength(0);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.locator('#corr-start')).toHaveCount(0);
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await expect(page.locator('#corr-start')).toHaveValue('');
  await page.locator('#corr-end').fill('2020-01-01');
  await page.locator('#corr-end').dispatchEvent('change');
  expect((await chartSnapshot(page))[0].max).toBe(Date.parse('2020-01-02') / 86400000);
});

test('keeps one relative chart for incompatible dose bases and supports keyboard search and removal', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await fixture(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.supplements[1] = { id: 'prn-demo', name: 'Example medication', type: 'medication', periods: [{ start: '2026-02-01', end: null, dose: '250 mg/day', schedule: { mode: 'daily' } }] };
  });
  const search = page.locator('#corr-search');
  await search.fill('LDL');
  await search.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', /corr-option-/);
  await search.press('Enter');
  await expect(search).toHaveValue('');
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await search.fill('does not exist');
  await expect(page.locator('#corr-no-results')).toBeVisible();
  await search.press('Escape');
  await expect(page.locator('#corr-options')).toBeHidden();
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await select(page, 'Example medication', 'prn-demo', 'toggle-therapy');
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(1);
  await expect(page.locator('#corr-therapy-results')).toContainText('Relative trends');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Remove LDL Cholesterol', exact: true }).press('Enter');
  await expect(search).toBeFocused();
  await expect(page.locator('#corr-chart-container')).toBeHidden();
});

test('plots raw marker values on calendar dates even without reference ranges', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { invalidateActiveDataCache } = await import('/js/data.js');
    state.importedData.entries.forEach((e, i) => { e.markers['lipids.hdl'] = 1 + i / 10; });
    invalidateActiveDataCache();
    const data = (await import('/js/data.js')).getActiveData();
    for (const marker of [data.categories.lipids.markers.ldl, data.categories.lipids.markers.hdl]) { marker.refMin = null; marker.refMax = null; }
    const { showCorrelations } = await import('/js/compare-correlations.js');
    showCorrelations();
  });
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'HDL', 'lipids.hdl');
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(1);
  const snapshot = (await chartSnapshot(page))[0];
  expect(snapshot.datasets[0].data.map(p => p.y)).toEqual([2, 2.2, 2.3, 2.1, 3.5, 3.6, 3.4, 2.5, 2.8]);
  expect(snapshot.datasets[0].data[1].x - snapshot.datasets[0].data[0].x).toBe(40);
  expect(snapshot.datasets[0].data[2].x - snapshot.datasets[0].data[1].x).toBe(10);
  await page.getByRole('button', { name: 'Scatter', exact: true }).click();
  expect((await chartSnapshot(page))[0].datasets[0].data).toHaveLength(9);
});

test('does not combine incompatible historical dose quantities in a scatter axis', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    (await import('/js/state.js')).state.importedData.supplements[0].periods[1].dose = '2000 IU';
  });
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await page.getByRole('button', { name: 'Scatter', exact: true }).click();
  await expect(page.locator('#corr-scatter')).toBeHidden();
  await expect(page.locator('#corr-therapy-results')).toContainText('Scatter unavailable');
  expect(await chartSnapshot(page)).toEqual([]);
});

test('combines different marker units on two axes without empty supplement plots', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await fixture(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.entries.forEach((e, i) => {
      e.markers['biochemistry.glucose'] = 4.2 + i / 10;
      e.markers['diabetes.hba1c'] = 32 + (i % 3) * 2 + Math.floor(i / 3);
    });
    state.importedData.supplements.forEach(s => { s.periods = [{ start: '2026-03-01', end: null, dose: '' }]; });
    (await import('/js/data.js')).invalidateActiveDataCache();
    (await import('/js/compare-correlations.js')).showCorrelations();
  });
  await select(page, 'Glucose', 'biochemistry.glucose');
  await select(page, 'HbA1c', 'diabetes.hba1c');
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(1);
  await expect(page.locator('.corr-use-timeline')).toHaveCount(1);
  const snapshot = (await chartSnapshot(page))[0];
  expect(snapshot.datasets).toHaveLength(2);
  expect(snapshot.datasets.map(d => d.axis)).toEqual(['y', 'y2']);
  expect(snapshot.datasets[0].data[0].y).toBe(4.2);
  expect(snapshot.datasets[1].data[0].y).toBe(32);
  const axes = await page.evaluate(async () => {
    const c = (await import('/js/state.js')).state.chartInstances['correlation-therapy-0'];
    return ['y', 'y2'].map(id => ({ title: c.options.scales[id].title.text, side: c.options.scales[id].position }));
  });
  expect(axes).toEqual([{ title: 'mmol/l', side: 'left' }, { title: 'mmol/mol', side: 'right' }]);
  await expect(page.locator('#corr-workspace-plots')).toContainText('Left: mmol/l');
  await expect(page.locator('#corr-workspace-plots')).toContainText('Right: mmol/mol');
  await expect(page.locator('#corr-layout-status')).toContainText('Combined selection · 1 chart');
  await page.locator('#corr-grouping-separate').click();
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(3);
  await expect(page.locator('#corr-layout-status')).toContainText('Separate pairs · 3 charts');
  const separate = await chartSnapshot(page);
  expect(separate.map(c => c.datasets.map(d => d.label))).toEqual([['Glucose (mmol/l)'], ['HbA1c (mmol/mol)'], ['Glucose (mmol/l)', 'HbA1c (mmol/mol)']]);
  await expect(page.locator('.corr-pair-panel h4')).toHaveText(['Glucose + Example supplement', 'HbA1c + Example supplement', 'Glucose + HbA1c']);
  await page.locator('#corr-grouping-combined').click();
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(1);
  await page.locator('#corr-layout-lanes').click();
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(2);
  await expect(page.locator('.corr-use-timeline')).toHaveCount(1);
  await page.locator('#corr-layout-overlay').click();
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.screenshot({ path: '/tmp/getbased-two-marker-chart.png', fullPage: true });
  await page.locator('[data-corr-series="biochemistry.glucose"]').click();
  await page.locator('[data-corr-series="diabetes.hba1c"]').click();
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(0);
  await expect(page.locator('.corr-use-timeline')).toHaveCount(1);
  expect(await chartSnapshot(page)).toHaveLength(0);
  expect(errors).toEqual([]);
});


test('only changed ingredient regimens start history today and ingredient selection stays consistent', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.supplements[0] = { id: 'dose-demo', name: 'Example supplement', timesPerDay: 1,
      schedule: { mode: 'daily', timesPerDay: 1 }, ingredients: [{ name: 'TMG', amount: '500 mg' }, { name: 'B12', amount: '25 mcg' }],
      periods: [{ start: '2026-01-01', end: null }],
    };
    await (await import('/js/data.js')).saveImportedData();
    (await import('/js/supplements.js')).openSupplementsEditor(0);
  });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('#supp-form-panel button:disabled')).toHaveCount(0);
  const saved = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { localDateKey } = await import('/js/supplement-medication-domain.js');
    return { today: localDateKey(), periods: state.importedData.supplements[0].periods };
  });
  expect(saved.periods).toHaveLength(1);
  expect(saved.periods[0].dose).toBeUndefined();
  expect(saved.periods[0].ingredientDoses).toBeUndefined();
  await page.locator('#supp-times').fill('4');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('#supp-form-panel button:disabled')).toHaveCount(0);
  await expect(page.locator('#supp-form-panel button:disabled')).toHaveCount(0);
  const periods = await page.evaluate(async () => (await import('/js/state.js')).state.importedData.supplements[0].periods);
  expect(periods).toHaveLength(2);
  expect(periods[1].ingredientDoses.map(d => d.value)).toEqual([2000, 100]);
  await page.evaluate(() => document.getElementById('modal-overlay').classList.remove('show'));
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await expect(page.locator('[data-corr-ingredient="dose-demo"]')).toHaveValue('TMG');
  expect((await chartSnapshot(page))[0].datasets[1].data.map(p => p.y)).toContain(2000);
  await page.locator('[data-corr-ingredient="dose-demo"]').selectOption('B12');
  const dose = (await chartSnapshot(page))[0].datasets[1];
  expect(dose.label).toContain('B12');
  expect(dose.data.map(p => p.y)).toContain(0.1);
  expect(dose.data.map(p => p.y)).not.toContain(2000);
  await page.locator('.corr-jump summary').click();
  await page.locator('#corr-inspect').fill(saved.today);
  await page.locator('#corr-inspect').dispatchEvent('change');
  await expect(page.locator('#corr-readout')).toContainText('B12');
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.locator('#corr-pair-detail')).toContainText('Dose not recorded');
});


test('uses today-based presets across timeline, data and scatter without hiding an empty range', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-28T12:00:00Z'));
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await expect(page.locator('#corr-lag')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '3M', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'No lab results' })).toBeVisible();
  expect((await chartSnapshot(page))[0].min).toBe(Date.parse('2026-06-28') / 86400000);
  await page.getByRole('button', { name: '6M', exact: true }).click();
  await expect(page.locator('#corr-analysis-panel')).toContainText('3 paired');
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.locator('#corr-pair-detail')).not.toContainText('lab-2026-03-20.pdf');
  await expect(page.locator('#corr-pair-detail')).toContainText('lab-2026-04-10.pdf');
  await page.getByRole('button', { name: 'Scatter', exact: true }).click();
  expect((await chartSnapshot(page))[0].datasets[0].data).toHaveLength(3);
  await page.getByRole('button', { name: '1Y', exact: true }).click();
  await expect(page.getByRole('button', { name: '1Y', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  expect((await chartSnapshot(page))[0].min).toBe(Date.parse('2025-09-28') / 86400000);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  expect((await chartSnapshot(page))[0].min).toBe(Date.parse('2025-12-01') / 86400000);
  await expect(page.getByText('Advanced analysis', { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/getbased-correlation-controls-mobile.png', fullPage: true });
});


test('inspects actual chart dates and switches comparison tabs with the keyboard', async ({ page }) => {
  await fixture(page);
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await expect(page.locator('#corr-inspect')).not.toBeVisible();
  await expect.poll(() => page.evaluate(async () => !!(await import('/js/state.js')).state.chartInstances['correlation-therapy-0'])).toBe(true);
  const position = await page.evaluate(async () => {
    const chart = (await import('/js/state.js')).state.chartInstances['correlation-therapy-0'];
    chart.canvas.scrollIntoView();
    const box = chart.canvas.getBoundingClientRect();
    return { x: box.left + chart.scales.x.getPixelForValue(Date.parse('2026-03-10') / 86400000), y: box.top + chart.chartArea.top + 20 };
  });
  await page.mouse.click(position.x, position.y);
  await expect(page.locator('#corr-inspect-label')).toHaveText('2026-03-10');
  await expect(page.locator('#corr-readout')).toContainText('2000 mg');
  await expect(page.locator('#corr-readout')).toContainText('3.50 mmol/l');
  await select(page, 'Example medication', 'prn-demo', 'toggle-therapy');
  const tabs = page.locator('.corr-pair-tabs [role=tab]');
  await expect(tabs).toHaveCount(2);
  await page.locator('.corr-analysis-disclosure > summary').click();
  await tabs.first().focus();
  await tabs.first().press('ArrowRight');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(page.getByRole('tabpanel').locator('.corr-therapy-card')).toHaveAttribute('aria-label', 'LDL Cholesterol × Example medication');
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#corr-pair-detail')).toContainText('actual intake unknown');
  await expect(page.getByText('Aligned lanes are used because', { exact: false })).toHaveCount(0);
  await tabs.nth(1).press('Home');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#corr-pair-detail')).toContainText('2000');
});


test('glucose, HbA1c and numeric TMG stay on one chart with raw values preserved everywhere', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-28T12:00:00Z'));
  await fixture(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.entries = ['2026-01-10', '2026-02-10', '2026-03-10'].map((date, i) => ({ date, markers: { 'biochemistry.glucose': [4.4, 5.2, 5][i], 'diabetes.hba1c': [31, 34, 33][i] } }));
    state.importedData.supplements[0] = { id: 'dose-demo', name: 'TMG Powder', periods: [{ start: '2026-01-01', end: '2026-02-28', dose: '500 mg/day', schedule: { mode: 'daily' } }, { start: '2026-03-01', end: null, dose: '2000 mg/day', schedule: { mode: 'daily' } }] };
    (await import('/js/data.js')).invalidateActiveDataCache();
    (await import('/js/compare-correlations.js')).showCorrelations();
  });
  await select(page, 'Glucose', 'biochemistry.glucose');
  await select(page, 'HbA1c', 'diabetes.hba1c');
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(1);
  await select(page, 'TMG', 'dose-demo', 'toggle-therapy');
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(1);
  await expect(page.locator('.corr-scale-label')).toContainText('Relative trends');
  const chart = await page.evaluate(async () => {
    const c = (await import('/js/state.js')).state.chartInstances['correlation-therapy-0'];
    const d = c.data.datasets[0];
    return { data: c.data.datasets.map(d => d.data), label: c.options.plugins.tooltip.callbacks.label({ dataset: d, raw: d.data[0], parsed: { y: d.data[0].y } }) };
  });
  expect(chart.data).toHaveLength(3);
  expect(chart.data[0].map(p => p.rawValue)).toEqual([4.4, 5.2, 5]);
  [0, 100, 75].forEach((value, i) => expect(chart.data[0][i].y).toBeCloseTo(value));
  expect(chart.data[2].filter(p => p.rawValue !== null).map(p => p.rawValue)).toContain(2000);
  expect(chart.label).toContain('4.40');
  await expect(page.locator('.corr-use-timeline')).toHaveCount(0);
  await expect(page.locator('.corr-analysis-disclosure')).not.toHaveAttribute('open');
  await expect(page.locator('#corr-readout')).toContainText('2000 mg/day');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/correlations-audit-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.evaluate(() => document.documentElement.dataset.theme = 'light');
  await page.locator('#corr-layout-lanes').click();
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(3);
  await page.locator('#corr-layout-overlay').click();
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(1);
  await page.screenshot({ path: '/tmp/correlations-audit-light.png', fullPage: true });
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  const tabs = page.getByRole('tablist', { name: 'Comparison' }).getByRole('tab');
  await expect(tabs).toHaveCount(3);
  await page.getByRole('tab', { name: 'Glucose × HbA1c', exact: true }).click();
  await expect(page.locator('#corr-pair-detail')).toContainText('4.40');
  await expect(page.locator('#corr-pair-detail')).toContainText('31');
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await page.locator('[data-corr-series="diabetes.hba1c"]').click();
  await expect(page.locator('.corr-scale-label')).not.toContainText('Relative trends');
  expect((await chartSnapshot(page))[0].datasets[0].data.map(p => p.y)).toEqual([4.4, 5.2, 5]);
});


test('correcting a continuous period does not recreate today or lose confirmed ingredient history', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-28T12:00:00Z'));
  await fixture(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const dose = { ingredient: 'TMG', value: 500, unit: 'mg', basis: 'day', source: 'ingredient' };
    state.importedData.supplements[0] = { id: 'dose-demo', name: 'TMG Powder', timesPerDay: 1,
      schedule: { mode: 'daily', timesPerDay: 1 }, ingredients: [{ name: 'TMG', amount: '500 mg' }],
      periods: [{ start: '2026-03-24', end: '2026-09-27' }, { start: '2026-09-28', end: null, dose, ingredientDoses: [dose] }],
    };
    await (await import('/js/data.js')).saveImportedData();
    (await import('/js/supplements.js')).openSupplementsEditor(0);
  });
  await page.locator('.supp-period-remove').nth(1).click();
  await page.locator('.supp-period-end').fill('');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('#supp-form-panel button:disabled')).toHaveCount(0);
  await expect(page.locator('.supp-period-row')).toHaveCount(1);
  await expect(page.locator('.supp-period-end')).toHaveValue('');
  // A second unchanged save must also leave the correction alone.
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('#supp-form-panel button:disabled')).toHaveCount(0);
  await expect(page.locator('.supp-period-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Use ingredient totals', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('#supp-form-panel button:disabled')).toHaveCount(0);
  await expect(page.locator('.supp-period-row')).toHaveCount(1);
  const saved = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { prepareTherapyHistory, therapyExposure } = await import('/js/therapy-correlations.js');
    const record = state.importedData.supplements[0];
    return { periods: record.periods, exposure: therapyExposure(prepareTherapyHistory(record, '2026-09-28'), '2026-05-22') };
  });
  expect(saved.periods[0]).toMatchObject({ start: '2026-03-24', end: null, ingredientDoses: [{ value: 500, basis: 'day' }] });
  expect(saved.exposure.value).toBe(500);
});

test('confirms an existing ongoing dose directly from the chart and persists it without extra periods', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-28T12:00:00Z'));
  await fixture(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.currentProfile = 'dose-confirmation-test';
    state.importedData.supplements[0] = { id: 'dose-demo', name: 'TMG Powder', timesPerDay: 1,
      ingredients: [{ name: 'TMG', amount: '500 mg' }], periods: [{ start: '2026-03-24', end: null }] };
    await (await import('/js/data.js')).saveImportedData();
  });
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'TMG', 'dose-demo', 'toggle-therapy');
  await expect(page.locator('.corr-use-timeline')).toHaveCount(1);
  await page.locator('.corr-confirm-dose > summary').click();
  await expect(page.locator('.corr-confirm-dose')).toContainText('TMG: 500 mg/day');
  await expect(page.locator('.corr-confirm-dose')).toContainText('2026-03-24 → ongoing');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.corr-dose-notice').screenshot({ path: '/tmp/correlation-dose-confirmation.png' });
  await page.getByRole('button', { name: 'Confirm & save this period', exact: true }).click();
  await expect(page.locator('.corr-use-timeline')).toHaveCount(0);
  await expect(page.locator('.corr-dose-notice')).toHaveCount(0);
  await expect.poll(async () => (await chartSnapshot(page))[0]?.datasets[1]?.data.map(p => p.y) || []).toContain(500);
  const saved = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { profileStorageKey } = await import('/js/profile.js');
    const { encryptedGetItem } = await import('/js/crypto.js');
    return { live: state.importedData.supplements[0], stored: JSON.parse(await encryptedGetItem(profileStorageKey(state.currentProfile, 'imported'))) };
  });
  expect(saved.live.periods).toHaveLength(1);
  expect(saved.live.periods[0]).toMatchObject({ start: '2026-03-24', end: null, dose: { value: 500, basis: 'day' } });
  expect(saved.stored.supplements[0].periods).toEqual(saved.live.periods);
  await page.reload();
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { profileStorageKey } = await import('/js/profile.js');
    const { encryptedGetItem } = await import('/js/crypto.js');
    state.currentProfile = 'dose-confirmation-test';
    state.importedData = JSON.parse(await encryptedGetItem(profileStorageKey(state.currentProfile, 'imported')));
    (await import('/js/data.js')).invalidateActiveDataCache();
    (await import('/js/compare-correlations.js')).showCorrelations();
  });
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'TMG', 'dose-demo', 'toggle-therapy');
  await expect(page.locator('.corr-use-timeline')).toHaveCount(0);
  await expect.poll(async () => (await chartSnapshot(page))[0]?.datasets[1]?.data.map(p => p.y) || []).toContain(500);
});


test('does not confirm a stale ingredient amount after the record changes', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.currentProfile = 'dose-stale-test';
    state.importedData.supplements[0] = { id: 'dose-demo', name: 'TMG Powder', timesPerDay: 1,
      ingredients: [{ name: 'TMG', amount: '500 mg' }], periods: [{ start: '2026-03-24', end: null }] };
    await (await import('/js/data.js')).saveImportedData();
  });
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'TMG', 'dose-demo', 'toggle-therapy');
  await page.locator('.corr-confirm-dose > summary').click();
  await page.evaluate(async () => {
    (await import('/js/state.js')).state.importedData.supplements[0].ingredients[0].amount = '2000 mg';
  });
  await page.getByRole('button', { name: 'Confirm & save this period', exact: true }).click();
  await expect(page.locator('.corr-confirm-status')).toContainText('Dose dates were not saved');
  await expect(page.locator('.corr-use-timeline')).toHaveCount(1);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.supplements[0].periods)).toEqual([{ start: '2026-03-24', end: null }]);
});

test('restores the correlation workspace after reload and keeps each profile separate', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.currentProfile = 'workspace-alice';
    await (await import('/js/data.js')).saveImportedData();
  });
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await page.locator('#corr-rangePreset-custom').click();
  await page.locator('#corr-start').fill('2026-01-01');
  await page.locator('#corr-start').dispatchEvent('change');
  await page.locator('#corr-end').fill('2026-06-30');
  await page.locator('#corr-end').dispatchEvent('change');
  await page.locator('#corr-layout-lanes').click();
  await page.locator('.corr-jump > summary').click();
  await page.locator('#corr-inspect').fill('2026-03-10');
  await page.locator('#corr-inspect').dispatchEvent('change');
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { encryptedGetItem } = await import('/js/crypto.js');
    return JSON.parse(await encryptedGetItem('labcharts-workspace-alice-correlation-workspace'))?.view?.tab;
  })).toBe('data');
  await page.reload();
  await page.evaluate(async () => {
    await (await import('/js/profile.js')).loadProfile('workspace-alice');
    (await import('/js/compare-correlations.js')).showCorrelations();
  });
  await expect(page.getByRole('button', { name: 'Remove LDL Cholesterol', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Example supplement', exact: true })).toBeVisible();
  await expect(page.locator('#corr-start')).toHaveValue('2026-01-01');
  await expect(page.locator('#corr-end')).toHaveValue('2026-06-30');
  await expect(page.getByRole('button', { name: 'Data', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.locator('#corr-layout-lanes')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#corr-inspect-label')).toHaveText('2026-03-10');
  await page.evaluate(async () => {
    await (await import('/js/profile.js')).loadProfile('workspace-bob');
    (await import('/js/compare-correlations.js')).showCorrelations();
  });
  await expect(page.locator('.corr-chip')).toHaveCount(0);
  await page.evaluate(async () => {
    await (await import('/js/profile.js')).loadProfile('workspace-alice');
    (await import('/js/compare-correlations.js')).showCorrelations();
  });
  await expect(page.locator('.corr-chip')).toHaveCount(2);
  await expect(page.locator('#corr-layout-lanes')).toHaveAttribute('aria-pressed', 'true');
});

test('clearing the final marker saves an empty workspace instead of restoring an old selection', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    (await import('/js/state.js')).state.currentProfile = 'empty-workspace-review';
    await (await import('/js/data.js')).saveImportedData();
  });
  await select(page, 'LDL', 'lipids.ldl');
  await page.getByRole('button', { name: 'Remove LDL Cholesterol', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => JSON.parse(await (await import('/js/crypto.js')).encryptedGetItem('labcharts-empty-workspace-review-correlation-workspace'))?.markers)).toEqual([]);
  await page.reload();
  await page.evaluate(async () => {
    await (await import('/js/profile.js')).loadProfile('empty-workspace-review');
    (await import('/js/compare-correlations.js')).showCorrelations();
  });
  await expect(page.locator('.corr-chip')).toHaveCount(0);
  await expect(page.locator('#corr-chart-container')).toBeHidden();
});

test('re-added items are visible and analysis views do not expand the timeline', async ({ page }) => {
  await fixture(page);
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await expect(page.locator('#corr-grouping')).toBeHidden();
  await expect(page.locator('#corr-selection-status')).toHaveClass(/sr-only/);
  await page.locator('[data-corr-series="lipids.ldl"]').click();
  await page.getByRole('button', { name: 'Remove LDL Cholesterol', exact: true }).click();
  await select(page, 'LDL', 'lipids.ldl');
  await expect(page.locator('[data-corr-series="lipids.ldl"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-corr-series="dose-demo"]').click();
  await page.getByRole('button', { name: 'Remove Example supplement', exact: true }).click();
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await expect(page.locator('[data-corr-series="dose-demo"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.corr-analysis-disclosure')).not.toHaveAttribute('open');
  for (const name of ['Data', 'Scatter']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.corr-analysis-disclosure > summary')).toBeHidden();
    if (name === 'Data') {
      await expect(page.locator('th').filter({ hasText: /^Dose date$/ })).toHaveCount(0);
      await expect(page.locator('#corr-pair-detail table').last()).toBeVisible();
    } else await expect(page.locator('#corr-scatter')).toBeVisible();
    await page.getByRole('button', { name: 'Timeline', exact: true }).click();
    await expect(page.locator('.corr-analysis-disclosure')).not.toHaveAttribute('open');
  }
});

test('dose-change boundary tooltips agree with the inspector and pinned dates can be released', async ({ page }) => {
  await fixture(page);
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await expect.poll(() => page.evaluate(async () => !!(await import('/js/state.js')).state.chartInstances['correlation-therapy-0'])).toBe(true);
  const label = await page.evaluate(async () => {
    const chart = (await import('/js/state.js')).state.chartInstances['correlation-therapy-0'];
    const dataset = chart.data.datasets[1];
    const raw = dataset.data.find(p => p.x === Date.parse('2026-03-01') / 86400000 && p.y === 500);
    return chart.options.plugins.tooltip.callbacks.label({ dataset, raw, parsed: { x: raw.x, y: raw.y } });
  });
  expect(label).toContain('2000');
  expect(label).not.toContain('500');
  await page.locator('.corr-jump > summary').click();
  await page.locator('#corr-inspect').fill('2026-03-01');
  await page.locator('#corr-inspect').dispatchEvent('change');
  await expect(page.locator('#corr-readout')).toContainText('2000');
  await page.getByRole('button', { name: 'Unpin date', exact: true }).click();
  await expect(page.locator('#corr-unpin')).toBeHidden();
  const target = await page.evaluate(async () => {
    const c = (await import('/js/state.js')).state.chartInstances['correlation-therapy-0'];
    const rect = c.canvas.getBoundingClientRect();
    return { x: rect.x + c.scales.x.getPixelForValue(Date.parse('2026-05-15') / 86400000), y: rect.y + c.chartArea.top + 30 };
  });
  await page.mouse.move(target.x, target.y);
  await expect(page.locator('#corr-inspect-label')).toHaveText('2026-05-15');
  await expect(page.locator('#corr-readout')).toContainText('Recorded break');
});


test('a matched marker prevents a false no-matching-labs notice for the treatment', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.entries[0].markers['biochemistry.glucose'] = 5;
    (await import('/js/data.js')).invalidateActiveDataCache();
    (await import('/js/compare-correlations.js')).showCorrelations();
  });
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Glucose', 'biochemistry.glucose');
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await expect(page.locator('.corr-dose-notice')).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove LDL Cholesterol', exact: true }).click();
  await expect(page.locator('.corr-dose-notice')).toContainText('no matching lab dates');
});


test('full app startup restores the saved correlation workspace after F5', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
  });
  await page.goto('/app');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', '');
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.entries = [
      { date: '2026-01-10', markers: { 'biochemistry.glucose': 5, 'lipids.ldl': 2 } },
      { date: '2026-05-10', markers: { 'biochemistry.glucose': 4.5, 'lipids.ldl': 3 } },
    ];
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Fixture save failed');
    (await import('/js/data.js')).invalidateActiveDataCache();
  });
  await page.getByRole('button', { name: 'Correlations', exact: true }).click();
  await select(page, 'Glucose', 'biochemistry.glucose');
  await select(page, 'LDL', 'lipids.ldl');
  await page.getByRole('button', { name: '1Y', exact: true }).click();
  await page.getByRole('button', { name: 'Aligned lanes', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const raw = await (await import('/js/crypto.js')).encryptedGetItem(`labcharts-${state.currentProfile}-correlation-workspace`);
    return JSON.parse(raw)?.view.layout;
  })).toBe('lanes');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', '');
  await expect(page.locator('.corr-chip')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '1Y', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Aligned lanes', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#corr-workspace-plots canvas')).toHaveCount(2);
});


test('treatment names and report sources are rendered as text, not HTML', async ({ page }) => {
  await fixture(page);
  const payload = '<img src=x onerror="document.body.dataset.injected=1">';
  await page.evaluate(async payload => {
    const { state } = await import('/js/state.js');
    state.importedData.supplements[0].name = `Example supplement ${payload}`;
    for (const entry of state.importedData.entries) entry.sourceFile = payload;
    (await import('/js/data.js')).invalidateActiveDataCache();
    (await import('/js/compare-correlations.js')).showCorrelations();
  }, payload);
  await select(page, 'LDL', 'lipids.ldl');
  await select(page, 'Example supplement', 'dose-demo', 'toggle-therapy');
  await expect(page.locator('.corr-chip').last()).toContainText(payload);
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.locator('#corr-pair-detail')).toContainText(payload);
  await expect(page.locator('#main-content img')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveAttribute('data-injected');
});
