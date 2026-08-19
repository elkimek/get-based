import { expect, test } from './coverage-fixture.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
  });
});

async function preparePage(page) {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-debug', 'false');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    window.endTour?.();
    document.getElementById('tour-overlay')?.remove();
    const { state } = await import('/js/state.js');
    state.currentProfile = 'benchmark-ui-profile';
    localStorage.setItem(`labcharts-${state.currentProfile}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${state.currentProfile}-tour`, 'completed');
    state.profiles = [{ id: 'benchmark-ui-profile', name: 'Benchmark UI' }];
    state.importedData = {
      entries: [{ date: '2026-07-19', markers: { glucose: 91 } }],
      importSnapshots: [{
        id: 'snapshot-b',
        benchmarkId: 'bench-b',
        fileName: 'same-report.pdf',
        inputHash: 'same-report-hash',
        importedAt: 2_000,
        timings: { analysisMs: 6_000, piiMs: 2_500 },
        costInfo: { provider: 'ollama', modelId: 'model-b' },
      }],
      importBenchmarks: [{
        id: 'bench-a',
        benchmarkAt: 1_000,
        fileName: 'same-report.pdf',
        inputHash: 'same-report-hash',
        status: 'confirmed',
        provider: 'ollama',
        modelId: 'model-a',
        importMode: 'text',
        totalMs: 12_000,
        timings: { analysisMs: 8_000, piiMs: 2_000, modelLoadMs: 1_000, timeToFirstTokenMs: 500 },
        usage: { inputTokens: 1_000, outputTokens: 400 },
        generationTokensPerSecond: 20,
        markerCount: 34,
        importedMarkerCount: 30,
        cleanImportedMarkerCount: 26,
        correctedMarkerCount: 4,
        correctedMappingCount: 2,
        correctedValueCount: 2,
        correctedUnitCount: 1,
        excludedMarkerCount: 1,
        unmappedMarkerCount: 3,
      }, {
        id: 'bench-b',
        benchmarkAt: 2_000,
        fileName: 'same-report.pdf',
        inputHash: 'same-report-hash',
        status: 'confirmed',
        provider: 'ollama',
        modelId: 'model-b',
        importMode: 'text',
        totalMs: 9_000,
        timings: { analysisMs: 6_000, piiMs: 2_500, modelLoadMs: 500, timeToFirstTokenMs: 250 },
        usage: { inputTokens: 1_000, outputTokens: 500 },
        generationTokensPerSecond: 30,
        markerCount: 34,
        importedMarkerCount: 32,
        cleanImportedMarkerCount: 31,
        correctedMarkerCount: 1,
        correctedMappingCount: 1,
        correctedValueCount: 0,
        correctedUnitCount: 0,
        excludedMarkerCount: 0,
        unmappedMarkerCount: 2,
      }, {
        id: 'bench-c',
        benchmarkAt: 3_000,
        fileName: 'different-report.pdf',
        inputHash: 'different-report-hash',
        status: 'failed',
        provider: 'openrouter',
        modelId: 'model-c',
        importMode: 'image',
        totalMs: 18_000,
        timings: { analysisMs: 15_000, piiMs: 1_000 },
        usage: { inputTokens: 2_000, outputTokens: 200 },
        generationTokensPerSecond: 10,
        markerCount: 12,
      }],
    };
    await (await import('/js/settings-loader.js')).openSettingsModal('ai');
  });
}

test('import benchmarks compare multiple runs and delete diagnostics without deleting health data', async ({ page }) => {
  await preparePage(page);

  const entrypoint = page.locator('[data-settings-action="open-import-benchmarks"]');
  await expect(entrypoint).toBeVisible();
  await expect(page.locator('#import-benchmarks-section')).toContainText('Built-in 100% answer key');
  await expect(page.locator('#import-benchmarks-section')).toContainText('3 saved tests across 3 model setups');
  await expect(page.locator('[data-tab-panel="display"]')).not.toContainText(/import benchmarks/i);
  await entrypoint.click();

  const overlay = page.locator('#import-benchmarks-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('[data-import-benchmark-card]')).toHaveCount(4);
  await expect(overlay.locator('.import-benchmarks-summary')).toContainText('Tests saved3');
  await expect(overlay.locator('.import-benchmarks-summary')).toContainText('Successful2');
  await expect(overlay.locator('.import-benchmark-diagnostics summary')).toContainText('Tests that didn’t finish1');
  await expect(overlay.locator('[data-import-benchmark-select="bench-c"]')).toHaveCount(0);
  await overlay.locator('[data-import-benchmark-select="bench-a"]').check();
  await overlay.locator('[data-import-benchmark-select="bench-b"]').check();

  const comparison = overlay.locator('[data-import-benchmark-comparison]');
  await expect(comparison).toBeVisible();
  await expect(comparison.locator('[data-benchmark-metric="totalMs"][data-benchmark-run-id="bench-b"] .import-benchmark-diff')).toHaveText('-25.0%');
  await expect(comparison.locator('[data-benchmark-metric="totalMs"][data-benchmark-run-id="bench-b"] .import-benchmark-diff')).toHaveClass(/better/);
  await expect(comparison.locator('[data-benchmark-metric="piiMs"][data-benchmark-run-id="bench-b"] .import-benchmark-diff')).toHaveText('+25.0%');
  await expect(comparison.locator('[data-benchmark-metric="piiMs"][data-benchmark-run-id="bench-b"] .import-benchmark-diff')).toHaveClass(/worse/);
  await expect(comparison.locator('[data-benchmark-metric="throughput"][data-benchmark-run-id="bench-b"] .import-benchmark-diff')).toHaveText('+50.0%');
  await expect(comparison.locator('.import-benchmark-metric-group').first()).toContainText('Import review');
  await expect(comparison.locator('[data-benchmark-metric="acceptedRate"][data-benchmark-run-id="bench-b"] .import-benchmark-diff')).toHaveText('+5.9 pp');
  await expect(comparison.locator('[data-benchmark-metric="cleanImportRate"][data-benchmark-run-id="bench-b"] .import-benchmark-diff')).toHaveText('+14.7 pp');
  await expect(comparison.locator('[data-benchmark-metric="reviewIssueRate"][data-benchmark-run-id="bench-b"] .import-benchmark-diff')).toHaveText('-14.7 pp');
  await expect(comparison.locator('[data-benchmark-metric="correctedValueCount"][data-benchmark-run-id="bench-b"] .import-benchmark-diff')).toHaveText('-100%');
  await expect(comparison.locator('[data-benchmark-metric="excludedMarkerCount"][data-benchmark-run-id="bench-b"] .import-benchmark-diff')).toHaveText('-100%');
  await expect(comparison.locator('thead th')).toHaveCount(3);
  await expect(overlay.locator('[data-import-benchmark-selection-copy]')).toContainText('2 matching tests selected');

  await page.setViewportSize({ width: 1100, height: 700 });
  const comparisonScroll = comparison.locator('.import-benchmark-comparison-scroll');
  const tableHeader = comparison.locator('thead th').first();
  await expect(overlay.locator('.import-benchmarks-toolbar')).toHaveCSS('position', 'static');
  await expect(tableHeader).toHaveCSS('position', 'sticky');
  await comparisonScroll.hover();
  const headerTopBefore = await tableHeader.evaluate(element => element.getBoundingClientRect().top);
  await page.mouse.wheel(0, 700);
  await expect.poll(() => comparisonScroll.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  const headerTopAfter = await tableHeader.evaluate(element => element.getBoundingClientRect().top);
  expect(Math.abs(headerTopAfter - headerTopBefore)).toBeLessThanOrEqual(2);
  const comparisonScrollAfterDown = await comparisonScroll.evaluate(element => element.scrollTop);
  await page.mouse.wheel(0, -700);
  await expect.poll(() => comparisonScroll.evaluate(element => element.scrollTop)).toBeLessThan(comparisonScrollAfterDown);

  const benchmarkBody = overlay.locator('.import-benchmarks-body');
  await benchmarkBody.evaluate(element => { element.scrollTop = 0; });
  const bodyBox = await benchmarkBody.boundingBox();
  if (!bodyBox) throw new Error('Benchmark modal body is not visible');
  await page.mouse.move(bodyBox.x + 8, bodyBox.y + (bodyBox.height / 2));
  const scrollBeforeWheel = await benchmarkBody.evaluate(element => element.scrollTop);
  await page.mouse.wheel(0, 700);
  await expect.poll(() => benchmarkBody.evaluate(element => element.scrollTop)).toBeGreaterThan(scrollBeforeWheel);
  const scrollAfterDown = await benchmarkBody.evaluate(element => element.scrollTop);
  await page.mouse.wheel(0, -700);
  await expect.poll(() => benchmarkBody.evaluate(element => element.scrollTop)).toBeLessThan(scrollAfterDown);

  await overlay.locator('[data-import-benchmarks-action="clear-selection"]').click();
  await expect(comparison).toBeHidden();
  await overlay.locator('[data-import-benchmarks-action="select-latest"]').click();
  await expect(overlay.locator('[data-import-benchmark-card].selected')).toHaveCount(2);
  await expect(overlay.locator('[data-import-benchmark-selection-copy]')).toContainText('2 matching tests selected');

  await overlay.locator('[data-import-benchmarks-action="delete-selected"]').click();
  await expect(page.locator('#confirm-dialog-overlay')).toContainText('Your imported health data will not be changed');
  await page.locator('#confirm-ok').click();
  await expect(overlay.locator('[data-import-benchmark-card]')).toHaveCount(2);
  await expect(overlay).not.toContainText('model-b');
  await expect(overlay.locator('.import-benchmark-diagnostics')).toContainText('model-c');

  const persistedState = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return {
      benchmarkIds: state.importedData.importBenchmarks.map(item => item.id),
      deletedIds: state.importedData.deletedImportBenchmarkIds,
      entries: state.importedData.entries,
      importSnapshots: state.importedData.importSnapshots,
    };
  });
  expect(persistedState.benchmarkIds).toEqual(['bench-c']);
  expect(persistedState.deletedIds).toEqual(expect.arrayContaining(['bench-a', 'bench-b']));
  expect(persistedState.entries).toEqual([{ date: '2026-07-19', markers: { glucose: 91 } }]);
  expect(persistedState.importSnapshots).toHaveLength(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBounds = await overlay.locator('.import-benchmarks-modal').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewportWidth: window.innerWidth };
  });
  expect(mobileBounds.left).toBeGreaterThanOrEqual(0);
  expect(mobileBounds.right).toBeLessThanOrEqual(mobileBounds.viewportWidth);
});

test('comparison only offers runs produced from the same report', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    window.endTour?.();
    document.getElementById('tour-overlay')?.remove();
    const { state } = await import('/js/state.js');
    state.importedData = {
      entries: [],
      importSnapshots: [],
      importBenchmarks: [{
        id: 'shared-a', benchmarkAt: 1_000, status: 'confirmed', fileName: 'shared.pdf',
        inputHash: 'shared-content', provider: 'ollama', modelId: 'model-a', markerCount: 2,
      }, {
        id: 'shared-b', benchmarkAt: 2_000, status: 'confirmed', fileName: 'renamed.pdf',
        inputHash: 'shared-content', provider: 'ollama', modelId: 'model-b', markerCount: 2,
      }, {
        id: 'other', benchmarkAt: 3_000, status: 'confirmed', fileName: 'other.pdf',
        inputHash: 'other-content', provider: 'ollama', modelId: 'model-c', markerCount: 40,
      }],
    };
    (await import('/js/settings-import-benchmark-controller.js')).openImportBenchmarksModal();
  });

  const overlay = page.locator('#import-benchmarks-overlay');
  await overlay.locator('[data-import-benchmark-select="other"]').check();
  await expect(overlay.locator('[data-import-benchmark-select="shared-a"]')).toBeDisabled();
  await expect(overlay.locator('[data-import-benchmark-select="shared-b"]')).toBeDisabled();
  await overlay.locator('[data-import-benchmarks-action="clear-selection"]').click();
  await overlay.locator('[data-import-benchmarks-action="select-latest"]').click();
  await expect(overlay.locator('[data-import-benchmark-select="shared-a"]')).toBeChecked();
  await expect(overlay.locator('[data-import-benchmark-select="shared-b"]')).toBeChecked();
  await expect(overlay.locator('[data-import-benchmark-select="other"]')).not.toBeChecked();
  await expect(overlay.locator('[data-import-benchmark-comparison]')).toBeVisible();
});

test('comparison headers distinguish the same model across cloud providers', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.currentProfile = 'provider-identity-profile';
    localStorage.setItem(`labcharts-${state.currentProfile}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${state.currentProfile}-tour`, 'completed');
    state.profiles = [{ id: state.currentProfile, name: 'Provider identity' }];
    const base = {
      benchmarkAt: Date.now(),
      fileName: 'same-report.pdf',
      inputHash: 'same-provider-comparison-input',
      status: 'confirmed',
      markerCount: 50,
      importedMarkerCount: 50,
      totalMs: 10_000,
      timings: { analysisMs: 9_000 },
      modelId: 'x-ai/grok-4.5',
    };
    state.importedData = {
      entries: [],
      importSnapshots: [],
      importBenchmarks: [{ ...base, id: 'openrouter-grok', provider: 'openrouter' }, {
        ...base, id: 'venice-grok', provider: 'venice', benchmarkAt: Date.now() + 1,
      }],
    };
    (await import('/js/settings-import-benchmark-controller.js')).openImportBenchmarksModal();
  });

  const overlay = page.locator('#import-benchmarks-overlay');
  await expect(overlay.locator('.import-benchmarks-summary')).toContainText('Model setups2');
  await overlay.locator('[data-import-benchmark-select="openrouter-grok"]').check();
  await overlay.locator('[data-import-benchmark-select="venice-grok"]').check();
  const comparison = overlay.locator('[data-import-benchmark-comparison]');
  await expect(comparison).toContainText('Each column shows the provider, model, and difference.');
  await expect(comparison.locator('[data-benchmark-provider="openrouter-grok"]')).toHaveText('OpenRouter');
  await expect(comparison.locator('[data-benchmark-provider="venice-grok"]')).toHaveText('Venice');
  await expect(comparison.locator('[data-benchmark-model="openrouter-grok"]')).toHaveText('x-ai/grok-4.5');
  await expect(comparison.locator('[data-benchmark-model="venice-grok"]')).toHaveText('x-ai/grok-4.5');
});

test('reference accuracy preserves raw model mapping errors separately from app corrections', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const score = await page.evaluate(async () => {
    const rawModelResult = {
      date: '2026-07-14',
      testType: 'blood',
      markers: [{
        rawName: 'Glucose',
        mappedKey: 'electrolytes.sodium',
        value: 90,
        unit: 'mg/dL',
        refMin: 70,
        refMax: 99,
      }],
    };
    const { normalizeParsedImportMarkers } = await import('/js/pdf-import-marker-normalization.js');
    const pipeline = normalizeParsedImportMarkers(structuredClone(rawModelResult), {
      fileName: 'reference.pdf',
      sourceText: '',
    });
    const { scoreReferenceModelAndPipeline } = await import('/js/import-reference-benchmark.js');
    return scoreReferenceModelAndPipeline(rawModelResult, {
      date: rawModelResult.date,
      testType: pipeline.testType,
      markers: pipeline.markers,
    }, {
      date: '2026-07-14',
      testType: 'blood',
      markers: [{
        section: 'Chemistry',
        rawName: 'Glucose',
        mappedKey: 'biochemistry.glucose',
        value: 90,
        unit: 'mg/dL',
        refMin: 70,
        refMax: 99,
      }],
    });
  });

  expect(score.referenceMappingAccuracyPercent).toBe(0);
  expect(score.referenceExactMarkerPercent).toBe(0);
  expect(score.referenceDiscrepancies[0].issues.map(issue => issue.field)).toContain('mapping');
  expect(score.referencePipelineMappingAccuracyPercent).toBe(100);
  expect(score.referencePipelineExactMarkerPercent).toBe(100);
});

test('only one bundled reference benchmark can run at a time', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { setAIProvider, setOllamaMainModel } = await import('/js/api.js');
    setAIProvider('ollama');
    setOllamaMainModel('model-under-test');
    const benchmark = await import('/js/import-reference-benchmark.js');
    const originalFetch = window.fetch;
    let releaseManifest;
    const manifestResponse = new Promise(resolve => { releaseManifest = resolve; });
    window.fetch = (url, options) => String(url).endsWith('.gold.json')
      ? manifestResponse
      : originalFetch(url, options);
    const first = benchmark.runBundledImportReferenceBenchmark().catch(error => error.message);
    await new Promise(resolve => setTimeout(resolve, 0));
    const runningDuring = benchmark.isBundledImportReferenceBenchmarkRunning();
    const secondError = await benchmark.runBundledImportReferenceBenchmark().catch(error => error.message);
    releaseManifest(new Response('', { status: 503 }));
    const firstError = await first;
    const runningAfter = benchmark.isBundledImportReferenceBenchmarkRunning();
    window.fetch = originalFetch;
    return { runningDuring, runningAfter, secondError, firstError };
  });

  expect(result.runningDuring).toBe(true);
  expect(result.secondError).toContain('already running');
  expect(result.firstError).toContain('503');
  expect(result.runningAfter).toBe(false);
});

test('model test modal can close while a test continues in the background', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const { setAIProvider, setOllamaMainModel } = await import('/js/api.js');
    setAIProvider('ollama');
    setOllamaMainModel('model-under-test');
    const originalFetch = window.fetch;
    let releaseManifest;
    const manifestResponse = new Promise(resolve => { releaseManifest = resolve; });
    window.__benchmarkOriginalFetch = originalFetch;
    window.__releaseBenchmarkManifest = releaseManifest;
    window.fetch = (url, options) => String(url).endsWith('.gold.json')
      ? manifestResponse
      : originalFetch(url, options);
    (await import('/js/settings-import-benchmark-controller.js')).openImportBenchmarksModal();
  });

  const overlay = page.locator('#import-benchmarks-overlay');
  await overlay.locator('[data-import-benchmarks-action="run-reference"]').click();
  await expect.poll(() => page.evaluate(async () => (
    (await import('/js/import-reference-benchmark.js')).isBundledImportReferenceBenchmarkRunning()
  ))).toBe(true);

  const closeButton = overlay.locator('[data-import-benchmarks-action="close"]');
  await expect(closeButton).toBeEnabled();
  await closeButton.click();
  await expect(overlay).toHaveCount(0);

  await page.evaluate(async () => {
    (await import('/js/settings-import-benchmark-controller.js')).openImportBenchmarksModal();
  });
  await expect(overlay).toBeVisible();
  const reopenedRunButton = overlay.locator('[data-import-benchmarks-action="run-reference"]');
  await expect(reopenedRunButton).toBeDisabled();
  await expect(reopenedRunButton).toHaveText('Model test running…');

  await page.evaluate(async () => {
    window.__releaseBenchmarkManifest(new Response('', { status: 503 }));
    const benchmark = await import('/js/import-reference-benchmark.js');
    while (benchmark.isBundledImportReferenceBenchmarkRunning()) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    window.fetch = window.__benchmarkOriginalFetch;
    delete window.__benchmarkOriginalFetch;
    delete window.__releaseBenchmarkManifest;
  });
  await expect(reopenedRunButton).toBeEnabled();
  await expect(reopenedRunButton).toHaveText(/Test current model/);
});

test('confirmed benchmark quality counts distinct review corrections', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const patch = await page.evaluate(async () => {
    const { importBenchmarkReviewPatch } = await import('/js/import-benchmarks.js');
    return importBenchmarkReviewPatch({
      date: '2026-07-19',
      _benchmarkDateEdited: true,
      _benchmarkInitialMappings: ['a.one', 'a.two', 'a.three', 'a.four', null],
      markers: [
        { mappedKey: 'b.one', _benchmarkValueEdited: true },
        { mappedKey: 'a.two', _benchmarkUnitEdited: true },
        { mappedKey: 'a.three' },
        { mappedKey: 'a.four', _benchmarkValueEdited: true },
        { mappedKey: null, suggestedKey: null },
      ],
    }, new Set([3]));
  });

  expect(patch).toEqual({
    importedMarkerCount: 3,
    cleanImportedMarkerCount: 1,
    unmappedMarkerCount: 1,
    excludedMarkerCount: 1,
    correctedMarkerCount: 2,
    correctedMappingCount: 1,
    correctedValueCount: 1,
    correctedUnitCount: 1,
    dateCorrectionCount: 1,
  });
});

test('reference scoring retains exact lab-data and report-detail discrepancies', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const score = await page.evaluate(async () => {
    const { scoreReferenceImport } = await import('/js/import-reference-benchmark.js');
    return scoreReferenceImport({
      date: '2026-07-15',
      testType: 'urine',
      markers: [{
        rawName: 'Fasting Glucose',
        mappedKey: 'diabetes.hba1c',
        value: 9.1,
        unit: 'mmol/L',
        refMin: 3.9,
        refMax: 5.5,
      }, {
        rawName: 'Unexpected Marker',
        mappedKey: 'custom.unexpected',
        value: 7,
        unit: 'mg/L',
      }],
    }, {
      date: '2026-07-14',
      testType: 'blood',
      markers: [{
        section: 'Chemistry',
        rawName: 'Fasting Glucose',
        mappedKey: 'biochemistry.glucose',
        value: 102,
        unit: 'mg/dL',
        refMin: 74,
        refMax: 100,
      }, {
        section: 'Chemistry',
        rawName: 'Sodium',
        mappedKey: 'electrolytes.sodium',
        value: 139,
        unit: 'mEq/L',
        refMin: 136,
        refMax: 145,
      }],
    });
  });

  expect(score.referenceExactMatch).toBe(false);
  expect(score.referenceDiscrepanciesVersion).toBe(2);
  expect(score.referenceDiscrepancyCount).toBe(8);
  expect(score.referenceDataDiscrepancyCount).toBe(6);
  expect(score.referenceReportDiscrepancyCount).toBe(2);
  expect(score.referenceAffectedMarkerCount).toBe(3);
  expect(score.referenceDiscrepancies).toHaveLength(4);
  expect(score.referenceDiscrepancies[0]).toMatchObject({
    kind: 'mismatch',
    markerName: 'Fasting Glucose',
  });
  expect(score.referenceDiscrepancies[0].issues.map(issue => issue.field)).toEqual([
    'mapping',
    'value',
    'unit',
    'reference-range',
  ]);
  expect(score.referenceDiscrepancies[1]).toMatchObject({ kind: 'missing', markerName: 'Sodium' });
  expect(score.referenceDiscrepancies[2]).toMatchObject({ kind: 'unexpected', markerName: 'Unexpected Marker' });
  expect(score.referenceDiscrepancies[3].issues.map(issue => issue.field)).toEqual([
    'collection-date',
    'report-type',
  ]);
});

test('eGFR unit typography does not create false benchmark differences and repairs saved v1 runs', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const expected = {
      date: '2026-07-14',
      testType: 'blood',
      markers: [{
        section: 'Comprehensive Chemistry',
        rawName: 'eGFR (CKD-EPI)',
        mappedKey: 'biochemistry.egfr',
        value: 106,
        unit: 'mL/min/1.73m2',
        refMin: 60,
        refMax: 138,
      }],
    };
    const { scoreReferenceImport } = await import('/js/import-reference-benchmark.js');
    const score = scoreReferenceImport({
      date: expected.date,
      testType: expected.testType,
      markers: [{ ...expected.markers[0], unit: 'mL/min/1.73m²' }],
    }, expected);

    const { state } = await import('/js/state.js');
    state.currentProfile = 'reference-equivalence-repair-profile';
    localStorage.setItem(`labcharts-${state.currentProfile}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${state.currentProfile}-tour`, 'completed');
    state.importedData = {
      entries: [],
      importSnapshots: [],
      importBenchmarks: [{
        id: 'saved-v1-egfr-run',
        benchmarkKind: 'reference',
        referenceDiscrepanciesVersion: 1,
        referenceExpectedMarkerCount: 68,
        referenceReturnedMarkerCount: 68,
        referenceExactMarkerCount: 67,
        referenceExactMarkerPercent: 98.5,
        referenceValueAccuracyPercent: 98.5,
        referenceRangeAccuracyPercent: 98.5,
        referenceFieldAccuracyPercent: 99.3,
        referencePipelineExactMarkerCount: 67,
        referencePipelineExactMarkerPercent: 98.5,
        referencePipelineFieldAccuracyPercent: 99.3,
        referenceDateCorrect: true,
        referenceTestTypeCorrect: true,
        referenceExactMatch: false,
        referencePipelineExactMatch: false,
        referenceDiscrepancyCount: 2,
        referenceDataDiscrepancyCount: 2,
        referenceReportDiscrepancyCount: 0,
        referenceAffectedMarkerCount: 1,
        referenceDiscrepancies: [{
          kind: 'mismatch',
          scope: 'lab-data',
          markerName: 'eGFR (CKD-EPI)',
          issues: [{ field: 'value', expected: '106', actual: '106' }, {
            field: 'reference-range', expected: '60 to 138', actual: '60 to 138',
          }],
        }],
      }],
    };
    const { getImportBenchmarks } = await import('/js/import-benchmarks.js');
    const repaired = getImportBenchmarks()[0];
    return { score, repaired };
  });

  expect(result.score.referenceExactMatch).toBe(true);
  expect(result.score.referenceDiscrepancyCount).toBe(0);
  expect(result.score.referenceValueAccuracyPercent).toBe(100);
  expect(result.score.referenceRangeAccuracyPercent).toBe(100);
  expect(result.repaired.referenceDiscrepanciesVersion).toBe(2);
  expect(result.repaired.referenceDiscrepancyCount).toBe(0);
  expect(result.repaired.referenceDiscrepancies).toEqual([]);
  expect(result.repaired.referenceExactMarkerCount).toBe(68);
  expect(result.repaired.referenceExactMarkerPercent).toBe(100);
  expect(result.repaired.referenceValueAccuracyPercent).toBe(100);
  expect(result.repaired.referenceRangeAccuracyPercent).toBe(100);
  expect(result.repaired.referenceFieldAccuracyPercent).toBe(100);
  expect(result.repaired.referencePipelineExactMarkerPercent).toBe(100);
  expect(result.repaired.referencePipelineFieldAccuracyPercent).toBe(100);
  expect(result.repaired.referenceExactMatch).toBe(true);
  expect(result.repaired.referencePipelineExactMatch).toBe(true);
});

test('two successful imports persist as two distinct comparable model runs', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
  });
  await page.goto('/app', { waitUntil: 'load' });
  const saved = await page.evaluate(async () => {
    window.endTour?.();
    document.getElementById('tour-overlay')?.remove();
    const { state } = await import('/js/state.js');
    const { setAIProvider, setOllamaMainModel } = await import('/js/api.js');
    const { finishImportBenchmark, startImportBenchmark } = await import('/js/import-benchmarks.js');
    const { setPendingImportRuntime } = await import('/js/pdf-import-review-runtime.js');
    const { confirmImport } = await import('/js/pdf-import-commit.js');
    state.currentProfile = 'two-model-benchmark-profile';
    localStorage.setItem(`labcharts-${state.currentProfile}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${state.currentProfile}-tour`, 'completed');
    state.profiles = [{ id: state.currentProfile, name: 'Two model benchmark' }];
    state.importedData = {
      entries: [],
      importSnapshots: [],
      importBenchmarks: [],
      manualValues: {},
      customMarkers: {},
    };
    setAIProvider('ollama');

    const importWithModel = async (modelId, value) => {
      setOllamaMainModel(modelId);
      const benchmarkId = startImportBenchmark({
        fileName: 'same-reference.pdf',
        fileSize: 44_219,
        importMode: 'text',
        pageCount: 3,
        inputHash: 'same-reference-content',
      });
      finishImportBenchmark(benchmarkId, 'preview', {
        stage: 'review',
        markerCount: 1,
        totalMs: 10_000,
        timings: { analysisMs: 9_000, piiMs: 500 },
        usage: { inputTokens: 1_000, outputTokens: 400 },
      }, { persist: false });
      setPendingImportRuntime({
        benchmarkId,
        _importProfileId: state.currentProfile,
        _benchmarkInitialMappings: ['biochemistry.glucose'],
        fileName: 'same-reference.pdf',
        date: '2026-07-19',
        testType: 'blood',
        provider: 'ollama',
        costInfo: {
          provider: 'ollama',
          modelId,
          inputTokens: 1_000,
          outputTokens: 400,
          cost: 0,
        },
        timings: { analysis: 9, pii: 0.5, analysisMs: 9_000, piiMs: 500 },
        markers: [{
          rawName: 'Glucose',
          value,
          unit: 'mg/dL',
          refMin: 70,
          refMax: 99,
          mappedKey: 'biochemistry.glucose',
          matched: true,
        }],
      }, {});
      await confirmImport();
    };

    await importWithModel('local-model-a', 91);
    await importWithModel('local-model-b', 92);
    const records = state.importedData.importBenchmarks.map(run => ({
      id: run.id,
      modelId: run.modelId,
      status: run.status,
    }));
    await (await import('/js/settings-loader.js')).openSettingsModal('ai');
    return { records, snapshotCount: state.importedData.importSnapshots.length };
  });

  expect(saved.snapshotCount).toBe(2);
  expect(saved.records).toHaveLength(2);
  expect(saved.records.map(run => run.modelId)).toEqual(['local-model-a', 'local-model-b']);
  expect(saved.records.map(run => run.status)).toEqual(['confirmed', 'confirmed']);
  await expect(page.locator('#import-benchmarks-section')).toContainText('2 saved tests across 2 model setups');
  await page.evaluate(() => {
    window.endTour?.();
    document.getElementById('tour-overlay')?.remove();
  });
  await page.locator('[data-settings-action="open-import-benchmarks"]').click();
  const overlay = page.locator('#import-benchmarks-overlay');
  await expect(overlay.locator('.import-benchmarks-summary')).toContainText('Tests saved2');
  await expect(overlay.locator('.import-benchmarks-summary')).toContainText('Model setups2');
  await expect(overlay.locator('.import-benchmarks-summary')).toContainText('Successful2');
  await expect(overlay.locator('.import-benchmarks-gold-list [data-import-benchmark-card]')).toHaveCount(1);
  await expect(overlay.locator('.import-benchmarks-model-runs-label + .import-benchmarks-list [data-import-benchmark-card]')).toHaveCount(2);
});

test('benchmark history remains device-local across saves and inbound sync merges', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const syncDelta = await import('/js/sync-delta.js');
    const syncHooks = await import('/js/sync-save-hooks.js');
    const { mergePulledImportedData } = await import('/js/sync-pull-merge.js');
    const { stripLocalOnlyProfileData } = await import('/js/sync-payload.js');
    const { persistImportBenchmarks } = await import('/js/import-benchmarks.js');
    const profileId = `local-benchmark-${Date.now()}`;
    let pushed = 0;
    syncDelta.configureSyncDelta({
      getEvolu: () => ({ getQueryRows: () => [] }),
      getItemRowQuery: () => ({}),
    });
    syncHooks.clearSyncSaveTimers();
    syncHooks.configureSyncSaveHooks({
      pushProfile: async () => { pushed += 1; },
      isSyncEnabled: () => true,
      isEvoluReady: () => true,
      isSyncing: () => false,
    });
    state.currentProfile = profileId;
    localStorage.setItem(`labcharts-${state.currentProfile}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${state.currentProfile}-tour`, 'completed');
    state.importedData = {
      entries: [],
      notes: [{ id: 'local-note', text: 'kept locally' }],
      importBenchmarks: [{
        id: 'local-model-test',
        benchmarkAt: 2_000,
        status: 'reference-scored',
        provider: 'ollama',
        modelId: 'local-model',
      }],
      deletedImportBenchmarkIds: ['deleted-model-test'],
    };

    const saved = await persistImportBenchmarks();
    await new Promise(resolve => setTimeout(resolve, 25));
    const outbound = stripLocalOnlyProfileData(state.importedData);
    const merged = await mergePulledImportedData(profileId, {
      entries: [{ date: '2026-07-18', markers: { glucose: 90 } }],
      notes: [],
    });

    syncHooks.clearSyncSaveTimers();
    syncHooks.configureSyncSaveHooks({
      isSyncEnabled: () => false,
      isEvoluReady: () => false,
      isSyncing: () => false,
    });
    return {
      saved,
      pushed,
      outboundHasBenchmarks: Object.prototype.hasOwnProperty.call(outbound, 'importBenchmarks'),
      outboundHasDeletedIds: Object.prototype.hasOwnProperty.call(outbound, 'deletedImportBenchmarkIds'),
      mergedBenchmarkIds: merged.merged.importBenchmarks?.map(item => item.id) || [],
      mergedDeletedIds: merged.merged.deletedImportBenchmarkIds || [],
      remoteEntryKept: merged.merged.entries?.some(entry => entry.date === '2026-07-18') || false,
    };
  });

  expect(result.saved).toBe(true);
  expect(result.pushed).toBe(0);
  expect(result.outboundHasBenchmarks).toBe(false);
  expect(result.outboundHasDeletedIds).toBe(false);
  expect(result.mergedBenchmarkIds).toEqual(['local-model-test']);
  expect(result.mergedDeletedIds).toEqual(['deleted-model-test']);
  expect(result.remoteEntryKept).toBe(true);
});

test('LM Studio is shown as the local backend instead of the internal Ollama provider id', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const labels = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { getImportBenchmarkProviderLabel } = await import('/js/import-benchmarks.js');
    state.currentProfile = 'lm-studio-benchmark-profile';
    localStorage.setItem(`labcharts-${state.currentProfile}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${state.currentProfile}-tour`, 'completed');
    state.profiles = [{ id: state.currentProfile, name: 'LM Studio test' }];
    state.importedData = {
      entries: [],
      importSnapshots: [],
      importBenchmarks: [{
        id: 'lm-studio-test',
        benchmarkAt: Date.now(),
        fileName: 'sample-report.pdf',
        status: 'reference-scored',
        benchmarkKind: 'reference',
        referenceFixtureId: 'getbased-reference-us-v2',
        referenceFixtureVersion: 2,
        referenceProtocolVersion: 2,
        provider: 'ollama',
        modelId: 'qwen-local',
        runtime: { provider: 'lmstudio', executionLocation: 'local' },
        markerCount: 68,
        totalMs: 22_000,
        timings: { analysisMs: 20_000 },
        referenceExpectedMarkerCount: 68,
        referenceExactMarkerCount: 65,
        referenceExactMarkerPercent: 95.6,
      }],
    };
    (await import('/js/settings-import-benchmark-controller.js')).openImportBenchmarksModal();
    return {
      lmStudio: getImportBenchmarkProviderLabel({ provider: 'ollama', modelId: 'qwen-local', runtime: { provider: 'lmstudio' } }),
      ollama: getImportBenchmarkProviderLabel({ provider: 'ollama', modelId: 'qwen-local', runtime: { provider: 'ollama' } }),
    };
  });

  expect(labels).toEqual({ lmStudio: 'LM Studio', ollama: 'Ollama' });
  const card = page.locator('[data-import-benchmark-card="lm-studio-test"]');
  await expect(card).toContainText('LM Studio · sample report test');
  await expect(card).not.toContainText('Ollama');
});

test('comparison model header opens exact expected-versus-returned differences', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.currentProfile = 'difference-review-profile';
    localStorage.setItem(`labcharts-${state.currentProfile}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${state.currentProfile}-tour`, 'completed');
    state.profiles = [{ id: state.currentProfile, name: 'Difference review' }];
    state.importedData = {
      entries: [],
      importSnapshots: [],
      importBenchmarks: [{
        id: 'difference-review-run',
        benchmarkAt: Date.now(),
        fileName: 'getbased-reference-us-v2.pdf',
        status: 'reference-scored',
        benchmarkKind: 'reference',
        referenceFixtureId: 'getbased-reference-us-v2',
        referenceFixtureVersion: 2,
        referenceProtocolVersion: 2,
        provider: 'ollama',
        modelId: 'thinkingcap-qwen3.6-27b@q4_k_m',
        markerCount: 68,
        totalMs: 22_000,
        timings: { analysisMs: 20_000 },
        referenceExpectedMarkerCount: 68,
        referenceExactMarkerCount: 67,
        referenceExactMarkerPercent: 98.5,
        referenceFieldAccuracyPercent: 98.9,
        referenceExactMatch: false,
        referenceDiscrepanciesVersion: 1,
        referenceDiscrepancyCount: 3,
        referenceDataDiscrepancyCount: 2,
        referenceReportDiscrepancyCount: 1,
        referenceAffectedMarkerCount: 1,
        referenceDiscrepancies: [{
          kind: 'mismatch',
          scope: 'lab-data',
          markerName: 'Fasting Glucose',
          section: 'Comprehensive Chemistry',
          issues: [{
            field: 'value',
            label: 'Result value',
            expected: '102',
            actual: '10.2',
          }, {
            field: 'unit',
            label: 'Result unit',
            expected: 'mg/dL',
            actual: 'mmol/L',
          }],
        }, {
          kind: 'report-details',
          scope: 'report-details',
          markerName: 'Report details',
          section: 'Report information',
          issues: [{
            field: 'collection-date',
            label: 'Collection date',
            expected: '2026-07-14',
            actual: '2026-07-15',
          }],
        }],
      }],
    };
    (await import('/js/settings-import-benchmark-controller.js')).openImportBenchmarksModal();
  });

  const overlay = page.locator('#import-benchmarks-overlay');
  const reviewButton = overlay.locator('[data-import-benchmark-review="difference-review-run"]');
  await expect(reviewButton).toHaveText('Review 3 differences');
  await reviewButton.click();
  await expect(reviewButton).toHaveAttribute('aria-expanded', 'true');
  const review = overlay.locator('[data-import-benchmark-difference-review]');
  await expect(review).toBeVisible();
  await expect(review).toContainText('What thinkingcap-qwen3.6-27b@q4_k_m got differently');
  await expect(review).toContainText('2 lab-data differences across 1 result');
  await expect(review).toContainText('1 report-detail difference');
  await expect(review).toContainText('Fasting Glucose');
  await expect(review).toContainText('Result value');
  await expect(review).toContainText('Expected102');
  await expect(review).toContainText('Model returned10.2');
  await expect(review).toContainText('Collection date');
  await review.locator('[data-import-benchmark-differences-close]').click();
  await expect(review).toBeHidden();

  const cardDisclosure = overlay.locator('[data-import-benchmark-card="difference-review-run"] .import-benchmark-difference-disclosure');
  await expect(cardDisclosure.locator('summary')).toHaveText('Review 3 differences');
  await cardDisclosure.locator('summary').click();
  await expect(cardDisclosure).toContainText('Fasting Glucose');
  await expect(cardDisclosure).toContainText('mg/dL');
  await expect(cardDisclosure).toContainText('mmol/L');
});

test('a successfully imported snapshot recovers an older benchmark stuck in preview', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const recovered = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData = {
      entries: [],
      importSnapshots: [{
        id: 'saved-import',
        benchmarkId: 'stuck-preview',
        importedAt: 2_000,
        markerCount: 64,
        excludedIndices: [64],
      }],
      importBenchmarks: [{
        id: 'stuck-preview',
        benchmarkAt: 1_000,
        status: 'preview',
        stage: 'review',
        modelId: 'local-model-recovered',
        markerCount: 68,
      }],
    };
    const { recoverConfirmedImportBenchmarks } = await import('/js/import-benchmarks.js');
    const count = recoverConfirmedImportBenchmarks(state.importedData.importSnapshots);
    return { count, record: state.importedData.importBenchmarks[0] };
  });

  expect(recovered.count).toBe(1);
  expect(recovered.record.status).toBe('confirmed');
  expect(recovered.record.importedMarkerCount).toBe(64);
  expect(recovered.record.excludedMarkerCount).toBe(1);
  expect(recovered.record.unmappedMarkerCount).toBe(3);
  expect(recovered.record.recoveredFromImportSnapshot).toBe(true);
});

test('bundled English reference fixture is internally exact and fully mapped', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const manifest = await fetch('/data/import-benchmark-reference-us-v2.gold.json').then(response => response.json());
    const sourceBuffer = await fetch(manifest.sourcePath).then(response => response.arrayBuffer());
    const sourceFile = new File([sourceBuffer], manifest.fileName, { type: 'application/pdf' });
    const { extractPDFText } = await import('/js/pdf-import.js');
    const sourceText = await extractPDFText(sourceFile);
    const { scoreReferenceImport } = await import('/js/import-reference-benchmark.js');
    const { buildMarkerReference } = await import('/js/pdf-import-marker-mapping.js');
    const markerReference = buildMarkerReference();
    const score = scoreReferenceImport({
      date: manifest.expected.date,
      testType: manifest.expected.testType,
      markers: structuredClone(manifest.expected.markers),
    }, manifest.expected);
    return {
      score,
      markerCount: manifest.expected.markers.length,
      pageCount: manifest.pageCount,
      pdfSource: manifest.sourcePath.endsWith('.pdf'),
      allNamesInReport: manifest.expected.markers.every(marker => sourceText.includes(marker.rawName)),
      allMappingsExist: manifest.expected.markers.every(marker => !!markerReference[marker.mappedKey]),
      syntheticDisclosure: sourceText.includes('NOT A REAL PATIENT OR LABORATORY REPORT'),
    };
  });

  expect(result.markerCount).toBe(68);
  expect(result.pageCount).toBe(3);
  expect(result.pdfSource).toBe(true);
  expect(result.allNamesInReport).toBe(true);
  expect(result.allMappingsExist).toBe(true);
  expect(result.syntheticDisclosure).toBe(true);
  expect(result.score.referenceExactMatch).toBe(true);
  expect(result.score.referenceExactMarkerCount).toBe(68);
  expect(result.score.referencePrecisionPercent).toBe(100);
  expect(result.score.referenceRecallPercent).toBe(100);
  expect(result.score.referenceF1Percent).toBe(100);
  expect(result.score.referenceMappingAccuracyPercent).toBe(100);
  expect(result.score.referenceValueAccuracyPercent).toBe(100);
  expect(result.score.referenceUnitAccuracyPercent).toBe(100);
  expect(result.score.referenceRangeAccuracyPercent).toBe(100);
  expect(result.score.referenceDiscrepancyCount).toBe(0);
  expect(result.score.referenceDiscrepancies).toEqual([]);
});

test('reference model tests use deterministic prompts and explicit protocol identities', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { setAIProvider, setOpenRouterModel } = await import('/js/api.js');
    const { updateKeyCache } = await import('/js/crypto.js');
    const cloudConsent = await import('/js/cloud-ai-consent.js');
    const { parseLabPDFWithAI } = await import('/js/pdf-import.js');
    const { importBenchmarksUseSameInput } = await import('/js/settings-data.js');
    state.currentProfile = 'deterministic-benchmark-profile';
    localStorage.setItem(`labcharts-${state.currentProfile}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${state.currentProfile}-tour`, 'completed');
    localStorage.setItem('labcharts-active-profile', state.currentProfile);
    state.profileSex = 'female';
    state.profiles = [{
      id: state.currentProfile,
      name: 'Deterministic benchmark',
      location: { country: 'Czech Republic', zip: '' },
    }];
    state.importedData = {
      entries: [],
      importSnapshots: [],
      importBenchmarks: [],
      customMarkers: {
        'custom.firstMarker': { name: 'First Marker', unit: 'mg/L' },
      },
    };
    setAIProvider('openrouter');
    setOpenRouterModel('openai/gpt-4o');
    updateKeyCache('labcharts-openrouter-key', 'benchmark-test-key');
    localStorage.setItem(cloudConsent.CLOUD_AI_CONSENT_KEY, JSON.stringify({
      version: cloudConsent.CLOUD_AI_CONSENT_VERSION,
      approvals: { openrouter: { accepted: true } },
    }));
    const requestBodies = [];
    const originalFetch = window.fetch;
    window.fetch = async (_url, init = {}) => {
      if (init.method === 'POST') requestBodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"testType":"blood","date":"2026-07-14","markers":[]}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const options = { captureRawModelOutput: true, deterministicBenchmark: true };
      await parseLabPDFWithAI('fixed benchmark report', 'fixed.pdf', undefined, options);
      state.profileSex = 'male';
      state.profiles[0].location.country = 'Australia';
      state.importedData.customMarkers = {
        'custom.secondMarker': { name: 'Second Marker', unit: 'nmol/L' },
      };
      await parseLabPDFWithAI('fixed benchmark report', 'fixed.pdf', undefined, options);
      await parseLabPDFWithAI('fixed benchmark report', 'fixed.pdf', undefined);
    } finally {
      window.fetch = originalFetch;
      updateKeyCache('labcharts-openrouter-key', '');
    }
    const protocolTwo = {
      benchmarkKind: 'reference',
      referenceFixtureId: 'getbased-reference-us-v2',
      referenceFixtureVersion: 2,
      referenceProtocolVersion: 2,
    };
    return {
      deterministicRequestsMatch: JSON.stringify(requestBodies[0]) === JSON.stringify(requestBodies[1]),
      deterministicSystem: requestBodies[0].messages[0].content,
      profileAwareSystem: requestBodies[2].messages[0].content,
      sameProtocolMatches: importBenchmarksUseSameInput(protocolTwo, { ...protocolTwo }),
      differentProtocolMatches: importBenchmarksUseSameInput(protocolTwo, {
        ...protocolTwo,
        referenceProtocolVersion: 3,
      }),
    };
  });

  expect(result.deterministicRequestsMatch).toBe(true);
  expect(result.deterministicSystem).toContain("user's region is United States");
  expect(result.deterministicSystem).not.toContain('custom.secondMarker');
  expect(result.profileAwareSystem).toContain("user's region is Australia");
  expect(result.profileAwareSystem).toContain('custom.secondMarker');
  expect(result.sameProtocolMatches).toBe(true);
  expect(result.differentProtocolMatches).toBe(false);
});

test('gold-reference baseline is permanent and auto-compares the latest matching run', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    localStorage.setItem('labcharts-reference-benchmark-profile-emptyTour', 'completed');
    localStorage.setItem('labcharts-reference-benchmark-profile-tour', 'completed');
    const { state } = await import('/js/state.js');
    state.currentProfile = 'reference-benchmark-profile';
    state.profiles = [{ id: 'reference-benchmark-profile', name: 'Reference Benchmark' }];
    const base = {
      benchmarkKind: 'reference',
      referenceFixtureId: 'getbased-reference-us-v2',
      referenceFixtureVersion: 2,
      referenceProtocolVersion: 2,
      referenceExpectedMarkerCount: 68,
      referencePrecisionPercent: 100,
      referenceRecallPercent: 100,
      referenceF1Percent: 100,
      referenceMappingAccuracyPercent: 100,
      referenceValueAccuracyPercent: 100,
      referenceUnitAccuracyPercent: 100,
      referenceRangeAccuracyPercent: 100,
      referenceDateCorrect: true,
      referenceTestTypeCorrect: true,
      markerCount: 68,
      importMode: 'reference',
      provider: 'ollama',
      totalMs: 5000,
      timings: { analysisMs: 5000 },
      usage: { inputTokens: 1000, outputTokens: 500 },
      status: 'reference-scored',
      fileName: 'getbased-reference-us-v2.pdf',
    };
    state.importedData = {
      entries: [],
      importSnapshots: [],
      importBenchmarks: [{
        ...base,
        id: 'reference-a',
        benchmarkAt: 1000,
        modelId: 'model-a',
        referenceExactMarkerCount: 60,
        referenceExactMarkerPercent: 88.2,
        referenceFieldAccuracyPercent: 94.1,
      }, {
        ...base,
        id: 'reference-b',
        benchmarkAt: 2000,
        modelId: 'model-b',
        referenceExactMarkerCount: 64,
        referenceExactMarkerPercent: 94.1,
        referenceFieldAccuracyPercent: 97.1,
      }],
    };
    (await import('/js/settings-import-benchmark-controller.js')).openImportBenchmarksModal();
  });

  const overlay = page.locator('#import-benchmarks-overlay');
  await expect(overlay.locator('.import-reference-benchmark')).toContainText('68-result sample lab report');
  await expect(overlay.locator('.import-reference-benchmark')).toContainText('verified every result');
  await expect(overlay.locator('[data-import-benchmarks-action="run-reference"]')).toHaveText(/Test current model/);
  await expect(overlay.locator('.import-reference-current-model')).toContainText('Using ');
  await expect(overlay.locator('.import-reference-benchmark a')).toHaveAttribute('href', '/data/import-benchmark-reference-us-v2.pdf');
  await expect(overlay.locator('[data-import-reference-progress]')).toBeHidden();
  await expect(overlay.locator('[role="progressbar"]')).toHaveAttribute('aria-valuemax', '100');
  const goldCard = overlay.locator('[data-import-benchmark-card="gold_getbased-reference-us-v2"]');
  await expect(goldCard).toContainText('68 / 68 \u00b7 100.0%');
  await expect(goldCard).toContainText('Verified answer key');
  await expect(goldCard.locator('[data-import-benchmark-delete]')).toHaveCount(0);
  await expect(overlay.locator('[data-import-benchmark-card].selected')).toHaveCount(2);
  await expect(overlay.locator('[data-import-benchmark-comparison]')).toContainText('Accuracy against the answer key');
  await expect(overlay.locator('[data-import-benchmark-card="reference-b"]')).toContainText('Detailed differences were not saved for this older test');
  await expect(overlay.locator('.import-benchmark-header-review-unavailable')).toContainText('Rerun to inspect differences');
  await expect(overlay.locator('[data-import-benchmark-card="reference-b"]')).toContainText('64 / 68 \u00b7 94.1%');
  const exactDiff = overlay.locator('[data-benchmark-metric="referenceExactMarkerPercent"][data-benchmark-run-id="reference-b"] .import-benchmark-diff');
  await expect(exactDiff).toHaveText('-5.9 pp');
  await expect(exactDiff).toHaveClass(/worse/);
  await overlay.locator('[data-import-benchmark-select="reference-a"]').check();
  await expect(overlay.locator('[data-import-benchmark-card].selected')).toHaveCount(3);
});
