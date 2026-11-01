import {expect, test} from './coverage-fixture.js';
import {createBlankPage} from '../helpers/browser-blank-page.js';

const open = createBlankPage({path:'/marker-baseline-preview',body:`<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/category-views.css">
<style>body{padding:24px}main{max-width:1100px;margin:auto}.chart-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:20px}.chart-card{cursor:default}.chart-container{height:210px}h1{font-size:24px;margin:0 0 8px}.intro{color:var(--text-secondary);margin-bottom:24px}</style>
</head><body><main><h1>Personal baseline</h1><p class="intro">Dashed boundaries show selected ranges. The dotted ◆ guide shows your previous median.</p><div class="chart-grid" id="fixture"></div></main></body></html>`});

for (const theme of ['light','dark']) test(`marker baselines share chart, text and chat evidence (${theme})`, async ({page}, info) => {
  await page.setViewportSize({width:1150,height:900});
  await open(page);
  const result = await page.evaluate(async theme => {
    document.documentElement.dataset.theme = theme;
    const [{state},dataModule,renderers,charts,analysis] = await Promise.all([
      import('/js/state.js'),import('/js/data.js'),import('/js/category-view-renderers.js'),
      import('/js/charts.js'),import('/js/marker-analysis.js'),
    ]);
    const dates = ['2026-01-01','2026-02-01','2026-03-01','2026-04-01','2026-05-01','2026-06-01'];
    Object.assign(state,{unitSystem:'EU',rangeMode:'both',dateRangeFilter:'all',profileSex:'male',
      importedData:{entries:dates.map((date,i)=>({date,markers:{
        'hematology.wbc':[4.8,5,5.1,5.3,5.5,9][i],
        'differential.neutrophils':[8,8.2,8.4,8.6,8.8,8.4][i],
        'differential.lymphocytes':i===5?1.9:null,
      }}))}});
    dataModule.invalidateActiveDataCache();
    const data = dataModule.getActiveData();
    const keys = [['hematology','wbc'],['differential','neutrophils'],['differential','lymphocytes']] as const;
    document.getElementById('fixture')!.innerHTML = keys.map(([category,key]) =>
      renderers.renderChartCard(`${category}_${key}`,data.categories[category]!.markers[key]!,data.dateLabels,data.dates)).join('');
    await charts.ensureChartJs();
    for (const [category,key] of keys) charts.createLineChart(`${category}_${key}`,data.categories[category]!.markers[key]!,data.dateLabels,data.dates);
    type ConfiguredChart = {options:{plugins:{personalBaseline:{median:number}|false;refBand:unknown;optimalBand:unknown};animation:unknown};update:(mode:string)=>void;stop:()=>void};
    const chart = state.chartInstances.hematology_wbc as unknown as ConfiguredChart;
    for (const instance of Object.values(state.chartInstances)) {
      const active = instance as unknown as ConfiguredChart;
      active.stop(); active.options.animation = false; active.update('none');
    }
    const marker = data.categories.hematology!.markers.wbc!;
    return {baseline:chart.options.plugins.personalBaseline,reference:chart.options.plugins.refBand,optimal:chart.options.plugins.optimalBand,
      context:analysis.formatMarkerValuesForChat(marker,data),
      sparse:(state.chartInstances.differential_lymphocytes as unknown as ConfiguredChart).options.plugins.personalBaseline,
      prior:marker.personalBaselines![3],
    };
  },theme);
  expect(result.baseline).toEqual({median:5.1});
  expect(result.reference).toMatchObject({refMin:4,refMax:10});
  expect(result.optimal).toMatchObject({optimalMin:5,optimalMax:7});
  expect(result.sparse).toBe(false);
  expect(result.prior).toMatchObject({median:5,count:3,comparedDate:'2026-04-01'});
  expect(result.context).toContain('Personal baseline: 5.1');
  expect(result.context).toContain('76.5% above baseline');
  await expect(page.locator('.marker-baseline-summary')).toHaveCount(0);
  expect(result.context).toContain('n=5 prior draws');
  await expect(page.locator('.chart-card').nth(1).locator('.chart-card-status')).toHaveText('▲ High');
  expect(result.context).toContain('2026-01-01 to 2026-05-01');
  await expect(page.locator('.chart-card').nth(2).locator('.marker-baseline-summary')).toHaveCount(0);
  const wide = await page.screenshot({path:info.outputPath(`baseline-${theme}-wide.png`),fullPage:true});
  await info.attach(`baseline-${theme}-wide`,{body:wide,contentType:'image/png'});
  await page.setViewportSize({width:390,height:1100});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`baseline-${theme}-mobile.png`),fullPage:true});
});
