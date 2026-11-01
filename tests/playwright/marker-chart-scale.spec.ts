import {expect, test} from './coverage-fixture.js';
import {createBlankPage} from '../helpers/browser-blank-page.js';

const open = createBlankPage({path:'/marker-chart-scale-preview',body:`<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/category-views.css">
<style>body{padding:24px}main{max-width:1100px;margin:auto}.chart-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:20px}.chart-container{height:210px}h1{font-size:24px;margin-bottom:12px}</style>
</head><body><main><h1>Small readings remain visible</h1><div class="chart-grid" id="fixture"></div></main></body></html>`});

for (const mode of ['reference','optimal','both'] as const) test(`small fractions remain visible in ${mode} mode`,async({page},info)=>{
  await page.setViewportSize({width:1150,height:720});
  await open(page);
  const result = await page.evaluate(async mode=>{
    document.documentElement.dataset.theme='dark';
    const [{state},dataModule,renderers,charts] = await Promise.all([
      import('/js/state.js'),import('/js/data.js'),import('/js/category-view-renderers.js'),import('/js/charts.js'),
    ]);
    const dates=['2026-01-01','2026-02-01','2026-03-01','2026-04-01','2026-05-01','2026-10-01'];
    Object.assign(state,{unitSystem:'EU',rangeMode:mode,dateRangeFilter:'all',importedData:{
      customMarkers:{'customPanel.zero':{name:'Zero readings',unit:'u',refMin:0,refMax:5,categoryLabel:'Synthetic'}},
      refOverrides:{'differential.eosinophilsPct':{refMin:0,refMax:5,optimalMin:0,optimalMax:0.04,refSource:'import'},'differential.basophilsPct':{refMin:0,refMax:2,refSource:'import'}},
      entries:dates.map((date,index)=>({date,markers:{
        'differential.eosinophilsPct':[0.020,0.021,0.022,0.024,0.027,0.031][index],
        'differential.basophilsPct':[0.005,0.005,0.005,0.006,0.006,0.007][index],
        'customPanel.zero':0,
      }})),
    }});
    const original=JSON.stringify(state.importedData);
    dataModule.invalidateActiveDataCache();
    const data=dataModule.getActiveData(), keys=[['differential','eosinophilsPct'],['differential','basophilsPct'],['customPanel','zero']] as const;
    document.getElementById('fixture')!.innerHTML=keys.map(([category,key])=>renderers.renderChartCard(`${category}_${key}`,data.categories[category]!.markers[key]!,data.dateLabels,data.dates)).join('');
    const fills:Record<string,Array<{x:number;y:number;width:number;height:number}>>={};
    for(const canvas of document.querySelectorAll('canvas')) {
      const paint=canvas.getContext('2d')!, original=paint.fillRect.bind(paint);
      fills[canvas.id]=[];
      paint.fillRect=(x,y,width,height)=>{fills[canvas.id]!.push({x,y,width,height}); original(x,y,width,height);};
    }
    await charts.ensureChartJs();
    type Chart=import('../../js/charts-runtime.js').ChartInstance&{options:{animation:unknown;plugins:{readingScale:boolean}};stop:()=>void;update:(mode:string)=>void;getDatasetMeta:(index:number)=>{data:Array<{x:number;y:number}>}};
    for(const [category,key]of keys) {
      charts.createLineChart(`${category}_${key}`,data.categories[category]!.markers[key]!,data.dateLabels,data.dates);
      const chart=state.chartInstances[`${category}_${key}`] as unknown as Chart;
      chart.stop();chart.options.animation=false;chart.update('none');
    }
    const eos=state.chartInstances.differential_eosinophilsPct as unknown as Chart;
    const baso=state.chartInstances.differential_basophilsPct as unknown as Chart;
    const tickLabels=(baso.scales.y as typeof baso.scales.x&{ticks:Array<{label:string}>}).ticks.map(tick=>tick.label);
    const ys=eos.getDatasetMeta(0).data.map(point=>point.y);
    const zero=state.chartInstances.customPanel_zero as unknown as Chart;
    const zeroCanvas=document.getElementById('chart-customPanel_zero') as HTMLCanvasElement;
    const point=zero.getDatasetMeta(0).data[3]!, ratio=zeroCanvas.width/zeroCanvas.clientWidth;
    const zeroPixel=[...zeroCanvas.getContext('2d')!.getImageData(Math.round(point.x*ratio),Math.round((point.y+2)*ratio),1,1).data];
    const swatch=document.createElement('canvas'), paint=swatch.getContext('2d')!;
    paint.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--green').trim();paint.fillRect(0,0,1,1);
    const expectedZeroPixel=[...paint.getImageData(0,0,1,1).data];
    return {tickLabels,focused:eos.options.plugins.readingScale,spread:Math.max(...ys)-Math.min(...ys),area:eos.chartArea,
      fills:fills['chart-differential_eosinophilsPct']!.filter(rect=>rect.x===eos.chartArea.left&&rect.width===eos.chartArea.right-eos.chartArea.left),
      marker:data.categories.differential!.markers.eosinophilsPct!,unchanged:original===JSON.stringify(state.importedData),zeroPixel,expectedZeroPixel};
  },mode);
  expect(result.unchanged).toBe(true);
  expect(new Set(result.tickLabels).size).toBe(result.tickLabels.length);
  expect(result.marker.values).toEqual([0.020,0.021,0.022,0.024,0.027,0.031]);
  expect(result.marker.refMax).toBe(5);
  expect(result.marker.personalBaselines!.at(-1)!.median).toBe(0.022);
  expect(result.focused).toBe(mode!=='optimal');
  expect(result.spread/(result.area.bottom-result.area.top)).toBeGreaterThan(mode==='optimal'?0.2:0.7);
  expect(result.fills.length).toBeGreaterThan(0);
  for(const rect of result.fills){expect(rect.y).toBeGreaterThanOrEqual(result.area.top);expect(rect.y+rect.height).toBeLessThanOrEqual(result.area.bottom+0.001);}
  expect(result.zeroPixel).toEqual(result.expectedZeroPixel);
  await page.screenshot({path:info.outputPath(`small-readings-${mode}.png`),fullPage:true});
  await page.setViewportSize({width:390,height:1100});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`small-readings-${mode}-mobile.png`),fullPage:true});
});
