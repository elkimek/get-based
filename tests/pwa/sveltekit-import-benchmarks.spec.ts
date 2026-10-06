import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');

test('static model tests preserve device-local history and health records through offline deletion and cold launch', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.addInitScript(() => {
    if (!['http:','https:'].includes(location.protocol)) return;
    const original = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const url = new URL(input instanceof Request ? input.url : String(input),location.href);
      if (url.pathname === '/api/local-agents' || /^http:\/\/(?:127\.0\.0\.1|localhost):(?:83\d\d|11434|1234)/.test(url.origin)) return Promise.resolve(Response.json({}, { status:404 }));
      return original(input,options);
    };
    for (const name of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${name}`,'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed','true'); localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({ accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-06T00:00:00Z',appVersion:'test',location:'local-test' }));
    const violations: string[] = [];
    (window as unknown as { benchmarkCsp:string[] }).benchmarkCsp = violations;
    document.addEventListener('securitypolicyviolation',event => violations.push(event.violatedDirective));
    if (localStorage.getItem('static-benchmark-seeded')) return;
    localStorage.setItem('static-benchmark-seeded','1');
    localStorage.setItem('labcharts-profiles',JSON.stringify([{ id:'default',name:'Synthetic benchmark profile',createdAt:1 }]));
    localStorage.setItem('labcharts-active-profile','default');
    localStorage.setItem('labcharts-default-imported',JSON.stringify({
      entries:[{ date:'2026-01-01',markers:{ 'biochemistry.glucose':5 },markerSources:{ 'biochemistry.glucose':{ snapshotId:'health-report',file:'Retained health report.pdf' } } }],
      importSnapshots:[{ id:'health-report',date:'2026-01-01',fileName:'Retained health report.pdf',type:'pdf',markerCount:1,markers:[{ mappedKey:'biochemistry.glucose',value:5,unit:'mmol/l' }],importedAt:1767225600000 }],
      importBenchmarks:[
        { id:'static-first',benchmarkAt:1000,status:'confirmed',provider:'ollama',modelId:'first-model',fileName:'Same report.pdf',inputHash:'same-report',markerCount:34,importedMarkerCount:30,cleanImportedMarkerCount:26,totalMs:12000,timings:{ analysisMs:8000 },usage:{ inputTokens:1000,outputTokens:400 } },
        { id:'static-second',benchmarkAt:2000,status:'confirmed',provider:'ollama',modelId:'second-model',fileName:'Same report.pdf',inputHash:'same-report',markerCount:34,importedMarkerCount:32,cleanImportedMarkerCount:31,totalMs:9000,timings:{ analysisMs:6000 },usage:{ inputTokens:1000,outputTokens:500 } },
      ],
    }));
  });
  const server = await startKitServer(artifact), errors: string[] = [];
  context.on('page',target => target.on('pageerror',error => errors.push(error.message)));
  page.on('pageerror',error => errors.push(error.message));
  const ready = async (target: Page) => {
    await expect(target.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout:30000 });
    await target.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect.poll(() => target.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  };
  const open = async (target: Page) => {
    await target.locator('[data-shell-action="open-settings"]').click();
    await target.locator('#settings-nav-ai').click();
    await target.locator('[data-settings-action="open-import-benchmarks"]').click();
    await expect(target.locator('#import-benchmarks-overlay [data-import-benchmarks-view]')).toBeVisible();
  };
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page);
    server.state.offline = true;
    await open(page);
    const modal = page.locator('#import-benchmarks-overlay');
    await expect(modal.locator('[data-import-benchmark-card]')).toHaveCount(3);
    await expect(modal.locator('.import-benchmarks-summary')).toContainText('Tests saved2');
    await modal.locator('[data-import-benchmarks-action="select-latest"]').click();
    await expect(modal.locator('[data-benchmark-model="static-second"]')).toHaveText('second-model');
    await expect(modal.locator('[data-benchmark-model="static-first"]')).toHaveText('first-model');
    await expect(modal.locator('[data-benchmark-metric="totalMs"][data-benchmark-run-id="static-first"] .import-benchmark-diff')).toHaveText('+33.3%');
    const sample = await modal.getByRole('link',{ name:'Preview sample PDF' }).getAttribute('href');
    expect(await page.evaluate(async source => { const response = await fetch(source!); return { status:response.status,type:response.headers.get('content-type') }; },sample)).toMatchObject({ status:200,type:'application/pdf' });
    await modal.locator('[data-import-benchmark-delete="static-second"]').click();
    await expect(page.locator('#confirm-dialog-overlay')).toContainText('Your imported health data will not be changed');
    await page.locator('#confirm-ok').click();
    await expect(modal.locator('[data-import-benchmark-card]')).toHaveCount(2);
    await expect(modal.locator('[data-import-benchmark-card="static-first"]')).toBeAttached();
    await expect(modal.locator('[data-import-benchmark-delete^="gold_"]')).toHaveCount(0);
    await modal.locator('[data-import-benchmarks-action="close"]').focus();
    await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0);
    await expect(page.locator('[data-settings-action="open-import-benchmarks"]')).toBeFocused();
    await page.locator('#settings-nav-data').click();
    await expect(page.locator('#data-entries-section')).toContainText('Retained health report.pdf');
    await expect(page.locator('#data-entries-section .imported-entry')).toHaveCount(1);
    await page.locator('#settings-modal [data-settings-action="close"]').click(); await page.close();
    const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await open(cold);
    await expect(cold.locator('#import-benchmarks-overlay [data-import-benchmark-card]')).toHaveCount(2);
    await expect(cold.locator('#import-benchmarks-overlay')).toContainText('first-model');
    await expect(cold.locator('#import-benchmarks-overlay')).not.toContainText('second-model');
    await cold.locator('[data-import-benchmarks-action="close"]').click(); await cold.locator('#settings-nav-data').click();
    await expect(cold.locator('#data-entries-section')).toContainText('Retained health report.pdf');
    await expect(cold.locator('#data-entries-section .imported-entry')).toHaveCount(1);
    expect(errors).toEqual([]);
    expect(await cold.evaluate(() => (window as unknown as { benchmarkCsp:string[] }).benchmarkCsp)).toEqual([]);
    await cold.screenshot({ path:test.info().outputPath('benchmark-health-records-cold.png') });
  } finally { await server.close(); }
});
