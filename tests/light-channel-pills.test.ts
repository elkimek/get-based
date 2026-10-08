// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { configureLightChannelView, _channelDayCount, _channelSparkline, renderChannelPills } from '../js/light-channel-view.js';
import { configureLightPageView, renderDashboardLightChannelPills, renderLightChannelsLive } from '../js/light-page-view.js';
import { projectChannelDayCount, projectChannelSparkline } from '../js/light-channel-presentation.js';
interface Sample { pattern: string; meta: Record<string, {icon?: string; label?: string; what?: string}>; rows: {sun:number;device:number}[] | null; sun:Record<string,number>;device:Record<string,number>;lightHTML:string;dashboardHTML:string;sparklineHTML:string;dayCount:unknown }
const original=JSON.parse(readFileSync('tests/fixtures/light-channel-pills-original.json','utf8')) as {cases:Sample[]};
const previous=configureLightChannelView();
afterEach(()=>{configureLightChannelView(previous);vi.unstubAllGlobals();document.body.innerHTML='';});
function semantic(html:string){
  const root=document.createElement('div');root.innerHTML=html;
  const tree=(node:Element):unknown=>({tag:node.tagName,classes:[...node.classList].filter(name=>!name.startsWith('gb:')).sort(),
    attrs:Object.fromEntries([...node.attributes].filter(attr=>!['class','data-light-channel-pills'].includes(attr.name)).map(attr=>[attr.name,attr.value])),
    text:[...node.childNodes].filter(child=>child.nodeType===3).map(child=>child.textContent).join('').replace(/\s+/g,' ').trim(),children:[...node.children].map(tree)});
  return [...root.children].map(tree);
}
for(const sample of original.cases){
  for(const kind of ['light','dashboard','sparkline'] as const)it(`preserves original ${kind} pills: ${sample.pattern}`,()=>{
    configureLightChannelView({channelDisplay:sample.meta,dailyChannelBreakdown:sample.rows?()=>sample.rows:null});
    configureLightPageView({channelDisplay:sample.meta,rollingChannelTotals:()=>sample.sun,rollingDeviceTotals:()=>sample.device});
    const html=kind==='light'?renderChannelPills(sample.sun,sample.device):kind==='dashboard'?renderDashboardLightChannelPills():_channelSparkline('circadian');
    expect(semantic(html)).toEqual(semantic(sample[`${kind}HTML` as 'lightHTML'|'dashboardHTML'|'sparklineHTML']));
    expect(_channelDayCount('circadian')).toEqual(sample.dayCount);
  });
}
it('retains signal boundaries, absent/empty distinction and source-relative miniature scaling',()=>{
  configureLightChannelView({dailyChannelBreakdown:null});expect(_channelSparkline('circadian')).toBe('');
  expect(projectChannelSparkline([])).toEqual({bars:[]});
  const rows=[{sun:0.0001,device:0},{sun:0.0001001,device:0},{sun:14,device:7},{sun:0,device:14},{sun:NaN,device:0},{sun:Infinity,device:0}];
  expect(projectChannelDayCount(rows)).toEqual({txt:'3 days',n:3,sun:2,device:2});
  const chart=projectChannelSparkline(rows.slice(0,4))!;
  expect(chart.bars.map(bar=>bar.empty)).toEqual([true,false,false,false]);
  expect(chart.bars[2]).toEqual({x:14,empty:false,sunHeight:14,deviceHeight:7});
  expect(chart.bars[3]).toEqual({x:21,empty:false,sunHeight:0,deviceHeight:14});
});
it('escapes all channel metadata in the authored row, including icons',()=>{
  const text='<img src=x onerror=bad()> & "';configureLightChannelView({channelDisplay:{circadian:{icon:text,label:text,what:text}},dailyChannelBreakdown:null});
  const root=document.createElement('div');root.innerHTML=renderChannelPills({});
  const pill=root.querySelector<HTMLElement>('[data-channel="circadian"]')!;
  expect(pill.querySelector('.light-pill-icon')!.textContent).toBe(text);expect(pill.querySelector('.light-pill-label')!.textContent).toBe(text);expect(pill.title).toContain(text);
  expect(root.querySelector('img,script,[onerror]')).toBeNull();
});
it('live refresh replaces authored bars and reopens the same single detail with current source values',()=>{
  vi.stubGlobal('requestAnimationFrame',()=>0);let sun=0;
  configureLightChannelView({channelDisplay:{circadian:{label:'Body clock'}},dailyChannelBreakdown:()=>[{date:new Date(),sun,device:0}],rollingChannelTotals:()=>({circadian:sun}),rollingDeviceTotals:()=>({}),getDevices:()=>[]});
  configureLightPageView({rollingChannelTotals:()=>({circadian:sun}),rollingDeviceTotals:()=>({})});
  document.body.innerHTML=`<section class="light-channels-section">${renderChannelPills({})}</section>`;
  document.querySelector<HTMLButtonElement>('[data-channel="circadian"]')!.click();
  expect(document.querySelector('[data-channel-detail-slot]')!.getAttribute('data-open-channel')).toBe('circadian');
  sun=14;renderLightChannelsLive();
  expect(document.querySelectorAll('[data-light-channel-presentation]')).toHaveLength(1);
  expect(document.querySelector('[data-channel="circadian"]')!.getAttribute('aria-expanded')).toBe('true');
  expect(document.querySelector('.light-channel-hero-primary')!.textContent).toBe('Sunlight logged');
  expect(document.querySelector('[data-channel="circadian"] .light-pill-sparkline rect')!.getAttribute('height')).toBe('14');
});

it('retains the adapter distinction between an absent callback and invalid callback output',()=>{
  configureLightChannelView({dailyChannelBreakdown:false});
  expect(_channelSparkline('circadian')).toBe('');expect(_channelDayCount('circadian')).toEqual({txt:'Not logged',n:0,sun:0,device:0});
  for(const result of [null,undefined]){
    configureLightChannelView({dailyChannelBreakdown:()=>result});
    expect(()=>_channelSparkline('circadian')).toThrow(TypeError);
    expect(()=>_channelDayCount('circadian')).toThrow(TypeError);
  }
});
