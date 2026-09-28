import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?compareCorrelationsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openBlankPage(page) {
  await page.route('**/compare-correlations-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head><style>
      :root {
        --bg-card: #111827;
        --text-primary: #f8fafc;
        --text-secondary: #cbd5e1;
        --text-muted: #94a3b8;
        --border: #334155;
        --chart-grid: #475569;
        --accent: #38bdf8;
        --accent-fill: rgba(56, 189, 248, 0.12);
        --chart-tooltip-bg: #020617;
        --green: #22c55e;
        --red: #ef4444;
        --yellow: #eab308;
      }
      .corr-chart { height: 240px; }
    </style></head><body><main id="main-content"></main></body></html>`,
  }));
  await page.goto('/compare-correlations-browser-coverage', { waitUntil: 'load' });
}

test('compare dates browser contract renders date controls table and updates state', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ compareUrl }) => {
    const compare = await import(compareUrl);
    const [dataModule, stateModule] = await Promise.all([
      import('/js/data.js'),
      import('/js/state.js'),
    ]);
    const { state } = stateModule;
    const outcomes = {};
    const originalImportedData = state.importedData;
    const originalCompareDate1 = state.compareDate1;
    const originalCompareDate2 = state.compareDate2;
    const originalRangeMode = state.rangeMode;

    try {
      state.importedData = {
        entries: [
          {
            date: '2026-01-01',
            markers: {
              'biochemistry.glucose': 4.5,
              'lipids.ldl': 2.8,
              'lipids.hdl': 1.2,
              'proteins.hsCRP': 1.0,
            },
          },
          {
            date: '2026-02-01',
            markers: {
              'biochemistry.glucose': 6.2,
              'lipids.ldl': 2.3,
              'lipids.hdl': 1.5,
              'proteins.hsCRP': 0.8,
            },
          },
          {
            date: '2026-03-01',
            markers: {
              'biochemistry.glucose': 5.0,
              'lipids.ldl': 3.4,
              'lipids.hdl': 1.1,
              'proteins.hsCRP': 2.4,
            },
          },
        ],
        notes: [],
        supplements: [],
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        changeHistory: [],
      };
      state.compareDate1 = null;
      state.compareDate2 = null;
      state.rangeMode = 'both';
      dataModule.invalidateActiveDataCache();

      compare.configureCompareCorrelationViews({
        renderTableColgroup: cols => `<colgroup data-cols="${cols.join('|')}"></colgroup>`,
        renderScrollableTableShell: (kind, wrapperClass, tableClass, colgroup, headHtml, bodyHtml) =>
          `<div class="${wrapperClass}" data-kind="${kind}"><table class="${tableClass}">${colgroup}<thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table></div>`,
        renderCategoryGlyph: (categoryKey, label = '') =>
          `<span data-glyph="${categoryKey}">${label}</span>`,
      });

      compare.showCompare();
      const select1 = document.getElementById('compare-select-1');
      const select2 = document.getElementById('compare-select-2');
      const rows = Array.from(document.querySelectorAll('#compare-results tbody tr'));

      outcomes.initialCompareControlsAndDefaults =
        document.querySelector('.category-header h2')?.textContent === 'Compare Dates'
        && select1?.value === '2026-01-01'
        && select2?.value === '2026-03-01'
        && document.querySelectorAll('#compare-select-1 option').length === 3
        && document.querySelector('.compare-swap-btn')?.getAttribute('aria-label') === 'Swap dates';
      outcomes.compareControlsEmitDelegatedAttributesOnly =
        document.querySelectorAll('#main-content [onclick], #main-content [onchange], #main-content [oninput], #main-content [onfocus]').length === 0
        && select1?.getAttribute('data-compare-change-action') === 'set-date'
        && document.querySelector('.compare-swap-btn')?.getAttribute('data-compare-action') === 'swap-dates';
      outcomes.compareTableUsesInjectedShellAndRendersMarkers =
        document.querySelector('[data-kind="compare"] .compare-table')
        && document.querySelector('colgroup')?.getAttribute('data-cols')?.includes('gb-col-marker')
        && rows.some(row => row.textContent.includes('Glucose'))
        && rows.some(row => row.textContent.includes('LDL Cholesterol'))
        && !!document.querySelector('[data-glyph="biochemistry"]')
        && !!document.querySelector('.compare-worsened');
      const firstRangesCell = document.querySelector('.compare-ranges-cell');
      outcomes.compareTableExplainsDisplayedAndJudgingRanges =
        Array.from(document.querySelectorAll('#compare-results th')).some(th => th.textContent === 'Ranges')
        && firstRangesCell?.textContent.includes('Reference')
        && firstRangesCell?.textContent.includes('Optimal')
        && firstRangesCell?.querySelector('.compare-range-used')?.textContent.trim() === 'used';

      select1.value = '2026-02-01';
      select1.dispatchEvent(new Event('change', { bubbles: true }));
      select2.value = '2026-01-01';
      select2.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('.compare-swap-btn')?.click();
      outcomes.delegatedCompareControlsUpdateStateSelectsAndTable =
        state.compareDate1 === '2026-01-01'
        && state.compareDate2 === '2026-02-01'
        && select1.value === '2026-01-01'
        && select2.value === '2026-02-01'
        && document.getElementById('compare-results')?.textContent.includes('+1.7');

      compare.setCompareDate1('2026-02-01');
      outcomes.setCompareDate1RebuildsTable =
        state.compareDate1 === '2026-02-01'
        && document.getElementById('compare-results')?.textContent.includes('6.2');
      compare.setCompareDate2('2026-01-01');
      outcomes.setCompareDate2RebuildsTable =
        state.compareDate2 === '2026-01-01'
        && document.getElementById('compare-results')?.textContent.includes('-1.7');

      compare.swapCompareDates();
      outcomes.swapUpdatesStateSelectsAndTable =
        state.compareDate1 === '2026-01-01'
        && state.compareDate2 === '2026-02-01'
        && select1?.value === '2026-01-01'
        && select2?.value === '2026-02-01'
        && document.getElementById('compare-results')?.textContent.includes('+1.7');

      state.compareDate1 = 'missing';
      compare.updateCompare();
      outcomes.invalidDateClearsResults = document.getElementById('compare-results')?.innerHTML === '';

      compare.showCompare({ dates: ['2026-01-01'], dateLabels: ['Jan 2026'], categories: {} });
      outcomes.notEnoughDataRendersEmptyState =
        document.querySelector('.empty-state h3')?.textContent === 'Not Enough Data';
    } finally {
      state.importedData = originalImportedData;
      state.compareDate1 = originalCompareDate1;
      state.compareDate2 = originalCompareDate2;
      state.rangeMode = originalRangeMode;
      dataModule.invalidateActiveDataCache();
      document.getElementById('main-content').innerHTML = '';
    }

    return outcomes;
  }, {
    compareUrl: moduleUrl('/js/compare-correlations.js'),
  });

  const expectedOutcomeKeys = [
    'initialCompareControlsAndDefaults',
    'compareControlsEmitDelegatedAttributesOnly',
    'compareTableUsesInjectedShellAndRendersMarkers',
    'compareTableExplainsDisplayedAndJudgingRanges',
    'delegatedCompareControlsUpdateStateSelectsAndTable',
    'setCompareDate1RebuildsTable',
    'setCompareDate2RebuildsTable',
    'swapUpdatesStateSelectsAndTable',
    'invalidDateClearsResults',
    'notEnoughDataRendersEmptyState',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('correlations presets keep treatments, use available markers, enforce limits and delegate AI', async ({ page }) => {
  await openBlankPage(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { invalidateActiveDataCache } = await import('/js/data.js');
    const compare = await import('/js/compare-correlations.js');
    state.importedData = { entries: ['2026-01-01', '2026-02-01'].map(date => ({ date, markers: { 'lipids.cholesterol': 4.5, 'lipids.hdl': 1.2, 'lipids.ldl': 2.8, 'lipids.triglycerides': 1.1, 'proteins.hsCRP': 1, 'vitamins.vitaminD': 70, 'electrolytes.calciumTotal': 2.3, 'biochemistry.glucose': 4.5 } })), supplements: [{ id: 'preset-therapy', name: 'Preset therapy', periods: [{ start: '2026-01-01', dose: '500 mg' }] }], notes: [], customMarkers: {}, markerNotes: {}, markerValueNotes: {}, changeHistory: [] };
    state.selectedCorrelationMarkers = [];
    state.selectedCorrelationSupplements = [];
    state.correlationView = {};
    invalidateActiveDataCache();
    compare.configureCompareCorrelationViews({ askAIAboutCorrelations: () => { document.getElementById('main-content').dataset.asked = 'yes'; } });
    compare.showCorrelations();
  });
  await page.locator('#corr-search').fill('Preset therapy');
  await page.locator('.corr-option[data-compare-key="preset-therapy"]').click();
  await page.getByText('Marker presets', { exact: true }).click();
  await page.getByRole('button', { name: 'Lipid Panel', exact: true }).click();
  await expect(page.locator('.corr-chip')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Remove Preset therapy', exact: true })).toBeVisible();
  await expect(page.locator('#corr-workspace-chart-0')).toBeAttached();
  await page.locator('.corr-ask-ai-btn').click();
  await expect(page.locator('#main-content')).toHaveAttribute('data-asked', 'yes');
  for (const key of ['proteins.hsCRP', 'vitamins.vitaminD', 'electrolytes.calciumTotal']) {
    await page.locator('#corr-search').fill('');
    await page.locator('#corr-search').focus();
    await page.locator(`.corr-option[data-compare-key="${key}"]`).click();
  }
  await expect(page.locator('.corr-chip')).toHaveCount(8);
  await page.locator('#corr-search').fill('glucose');
  await page.locator('.corr-option[data-compare-key="biochemistry.glucose"]').click();
  await expect(page.locator('#corr-selection-status')).toContainText('Up to 8');
  await expect(page.locator('#corr-search')).toHaveValue('glucose');
  await expect(page.locator('.corr-chip')).toHaveCount(8);
  await page.locator('#corr-search').press('Escape');
  await page.getByRole('button', { name: 'Remove Preset therapy', exact: true }).click();
  expect(await page.locator('#main-content [onclick], #main-content [onchange], #main-content [oninput]').count()).toBe(0);
  await expect(page.getByRole('button', { name: 'Liver Enzymes', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Liver Enzymes', exact: true })).toContainText('0/4 available');
  await expect(page.locator('.corr-chip')).toHaveCount(7);
  await page.getByRole('button', { name: 'Blood Sugar', exact: true }).click();
  await expect(page.locator('.corr-chip')).toHaveCount(1);
  await expect(page.locator('.corr-chip')).toContainText('Glucose');
});
