import { expect, test } from './coverage-fixture.js';
import { routeHtml } from '../helpers/browser-static-routes.js';

test('owned model-test dialog remains accessible across themes and narrow layouts', async ({ page, context }) => {
  test.setTimeout(150_000);
  await context.addInitScript({ path:'node_modules/axe-core/axe.min.js' });
  await routeHtml(page,'**/import-benchmarks-owned-test','<!doctype html><html lang="en"><head><title>Model test layout</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main><div id="import-benchmarks-overlay" class="modal-overlay show"></div></main></body></html>');
  await page.goto('/import-benchmarks-owned-test');
  await page.evaluate(async () => {
    const { mountImportBenchmarks } = await import('/js/import-benchmark-component.js');
    const { buildBenchmarkSnapshot } = await import('/js/import-benchmark-presentation.js');
    const { createImportBenchmarksController } = await import('/js/import-benchmark-controller.js');
    const { createBenchmarkRun } = await import('/js/import-benchmark-run.js');
    const { IMPORT_REFERENCE_FIXTURE,IMPORT_REFERENCE_PROTOCOL_VERSION,getBundledImportReferenceGoldBenchmark } = await import('/js/import-reference-benchmark.js');
    const gold = getBundledImportReferenceGoldBenchmark();
    const raw = [gold,{ ...gold,id:'current',benchmarkLocked:false,benchmarkKind:'reference',modelId:'long-model-name-for-responsive-test-27b-q4-k-m',fileName:'A report with a long file name.pdf',provider:'ollama',status:'reference-scored',referenceExactMatch:false,referenceExactMarkerCount:67,totalMs:12000,timings:{ analysisMs:10000 },referenceDiscrepanciesVersion:1,referenceDiscrepancies:[{ scope:'lab-data',section:'Blood',markerName:'Fasting Glucose',issues:[{ label:'Value',expected:'90',actual:'95' }] }] }];
    const context = () => ({ model:'test model',provider:'Local AI',sampleUrl:IMPORT_REFERENCE_FIXTURE.sourcePath,running:false });
    let controller: ReturnType<typeof createImportBenchmarksController>;
    const view = mountImportBenchmarks(document.getElementById('import-benchmarks-overlay')!,buildBenchmarkSnapshot(raw,context(),{ selected:new Set() }),{
      close:() => view.dispose(),run:() => controller.run(),select:(id,checked) => controller.select(id,checked),latest:() => controller.latest(),clear:() => controller.clear(),remove:id => controller.remove(id),review:id => controller.review(id),closeReview:() => controller.closeReview(),
    });
    controller = createImportBenchmarksController(view,{
      read:() => raw,context,fixtureId:IMPORT_REFERENCE_FIXTURE.id,
      run:createBenchmarkRun({ run:async () => { throw new Error('The layout fixture does not run inference'); },notify() {},errorMessage:() => 'fixture',now:() => performance.now() }),
      confirm:async () => false,remove:async () => 0,notify() {},now:() => performance.now(),close:() => view.dispose(),
    });
    if (raw[1]!.referenceProtocolVersion !== IMPORT_REFERENCE_PROTOCOL_VERSION) throw new Error('Fixture protocol drifted');
  });
  const panel = page.locator('[data-import-benchmarks-view]');
  await panel.locator('[data-import-benchmark-review="current"]').click();
  for (const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
    await page.evaluate(async theme => { const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(theme); },theme);
    for (const width of [1280,700,390,320]) {
      await page.setViewportSize({ width,height:900 });
      const label = `${theme}/${width}`;
      expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1),label).toBe(true);
      expect(await panel.locator('.import-benchmarks-body').evaluate(element => element.scrollWidth <= element.clientWidth + 1),label).toBe(true);
      for (const control of await panel.locator('button:visible,input:visible,a:visible,summary:visible').all()) {
        const bounds = await control.boundingBox();
        expect(Number(bounds?.height.toFixed(3)),label).toBeGreaterThanOrEqual(44);
        expect(Number(bounds?.width.toFixed(3)),label).toBeGreaterThanOrEqual(44);
      }
      const violations = await panel.evaluate(async element => (await (window as unknown as { axe:typeof import('axe-core') }).axe.run(element,{ runOnly:{ type:'tag',values:['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(v => ({ id:v.id,nodes:v.nodes.map(n => ({ target:n.target,summary:n.failureSummary })) })));
      expect(violations,label).toEqual([]);
    }
  }
  await page.evaluate(async () => (await import('/js/theme.js')).setTheme('dark'));
  await page.setViewportSize({ width:390,height:900 });
  await page.screenshot({ path:test.info().outputPath('benchmarks-mobile.png'),fullPage:true });
  await page.setViewportSize({ width:1280,height:900 });
  await page.screenshot({ path:test.info().outputPath('benchmarks-desktop.png'),fullPage:true });
  const select = panel.locator('[data-import-benchmark-select="current"]');
  await select.focus(); await select.press('Space'); await expect(select).not.toBeChecked();
  await select.press('Space'); await expect(select).toBeChecked();
});

test('model-test entry preserves extension interception and rejects superseded or closed replies', async ({ page }) => {
  await page.addInitScript(() => {
    for (const name of ['tour','emptyTour']) localStorage.setItem(`labcharts-default-${name}`,'completed');
    localStorage.setItem('labcharts-analytics-consent-seen','1');
  });
  await page.goto('/app');
  await page.evaluate(async () => {
    (window as unknown as { endTour?:() => unknown }).endTour?.();
    await (await import('/js/settings-loader.js')).openSettingsModal('ai');
    const { configureAppExtension } = await import('/js/app-extension-runtime.js');
    configureAppExtension({ id:'benchmark-entry-test',settings:{ handleAction:context => {
      if (context.action !== 'open-import-benchmarks') return false;
      document.body.dataset.benchmarkHookButton = context.actionEl === document.querySelector('[data-settings-action="open-import-benchmarks"]') ? 'actual' : 'wrong';
      return true;
    } } });
  });
  const entry = page.locator('[data-settings-action="open-import-benchmarks"]');
  await entry.click(); await expect(page.locator('body')).toHaveAttribute('data-benchmark-hook-button','actual');
  await expect(page.locator('#import-benchmarks-overlay')).toHaveCount(0);
  await page.evaluate(async () => {
    const target = window as unknown as { benchmarkReplies:Array<(value:boolean) => void> };
    target.benchmarkReplies = [];
    (await import('/js/app-extension-runtime.js')).configureAppExtension({ id:'benchmark-entry-test',settings:{ handleAction:context => {
      if (context.action !== 'open-import-benchmarks') return false;
      return new Promise<boolean>(resolve => target.benchmarkReplies.push(resolve));
    } } });
  });
  await entry.click(); await entry.click();
  await page.evaluate(() => (window as unknown as { benchmarkReplies:Array<(value:boolean)=>void> }).benchmarkReplies[1]!(false));
  await expect(page.locator('#import-benchmarks-overlay')).toBeVisible();
  await page.evaluate(() => {
    const target = window as unknown as { benchmarkReplies:Array<(value:boolean)=>void>; benchmarkCurrent:HTMLElement | null };
    target.benchmarkCurrent = document.getElementById('import-benchmarks-overlay'); target.benchmarkReplies[0]!(false);
  });
  expect(await page.evaluate(() => (window as unknown as { benchmarkCurrent:HTMLElement }).benchmarkCurrent === document.getElementById('import-benchmarks-overlay'))).toBe(true);
  await page.locator('[data-import-benchmarks-action="close"]').click();
  await entry.click(); await page.locator('#settings-modal [data-settings-action="close"]').click();
  await page.evaluate(() => (window as unknown as { benchmarkReplies:Array<(value:boolean)=>void> }).benchmarkReplies[2]!(false));
  await expect(page.locator('#import-benchmarks-overlay')).toHaveCount(0);
});
