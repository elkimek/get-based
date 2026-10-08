// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureLightChannelView, renderChannelPills, _toggleChannelDetail, installLightChannelActionDelegates } from '../js/light-channel-view.js';
import { projectChannelChart, projectChannelDetail, type ChannelDay } from '../js/light-channel-presentation.js';
import { renderHTML } from '../js/components/LightChannelDetail.svelte.html.js';
interface Sample { channel: string; pattern: string; meta: { icon?: string; label?: string; what?: string }; sun: number; device: number; breakdown: boolean; matchingDevice: boolean; html: string }
const original = JSON.parse(readFileSync('tests/fixtures/light-channel-original.json','utf8')) as { now: number; cases: Sample[] };
function semantic(html: string) {
  const root = document.createElement('div'); root.innerHTML = html;
  const tree = (node: Element): unknown => ({ tag: node.tagName,
    classes: [...node.classList].filter(name => /^(light-|lc-|import-)/.test(name)).sort(),
    attrs: Object.fromEntries([...node.attributes].filter(attr => !['class','data-light-channel-presentation'].includes(attr.name)).map(attr => [attr.name, attr.value])),
    text: [...node.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent).join('').replace(/\s+/g,' ').trim(),
    children: [...node.children].map(tree) });
  return [...root.children].map(tree);
}
function days(sample: Sample, count: number): ChannelDay[] {
  return Array.from({length:count},(_,index)=>{
    const date = new Date();date.setHours(0,0,0,0);date.setDate(date.getDate()-(count-1-index));
    return {date,sun:index%3===0?sample.sun:0,device:index%2===0?sample.device:0};
  });
}
let previous: Record<string, unknown>;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(original.now);vi.stubGlobal('requestAnimationFrame',()=>0);previous=configureLightChannelView();});
afterEach(()=>{configureLightChannelView(previous);vi.useRealTimers();vi.unstubAllGlobals();document.body.innerHTML='';});
for(const [index,sample] of original.cases.entries())it(`preserves original channel ${index}: ${sample.channel}/${sample.pattern}/breakdown=${sample.breakdown}`,()=>{
  configureLightChannelView({channelDisplay:{[sample.channel]:sample.meta},dailyChannelBreakdown:sample.breakdown?(_channel:unknown,n:number)=>days(sample,n):null,
    dailyVitaminDIUBreakdown:(n:number)=>days(sample,n),rollingChannelTotals:()=>({[sample.channel]:sample.sun}),rollingDeviceTotals:()=>({[sample.channel]:sample.device}),
    pbmJoulesPerCm2:(n:number)=>n/100,getDevices:()=>sample.matchingDevice?[{channels:[sample.channel]}]:[]});
  document.body.innerHTML=renderChannelPills({[sample.channel]:sample.sun},{[sample.channel]:sample.device});
  _toggleChannelDetail(sample.channel);
  const slot=document.querySelector('[data-channel-detail-slot]')!;
  expect(semantic(slot.innerHTML)).toEqual(semantic(sample.html));
  expect(slot.querySelector('[data-light-channel-presentation]')).not.toBeNull();
});
it('retains chart boundaries and independent real-unit labels without adding source doses',()=>{
  const date=new Date();
  const values=[0,0.1,0.5,99,100,999,1000];
  const rows=values.map(sun=>({date,sun,device:0}));
  expect(projectChannelChart('vitamin_d',rows,rows,null)!.bars.map(bar=>bar.label)).toEqual(['','','','99','100','1000','1.0k']);
  expect(projectChannelChart('nir_solar',rows,null,n=>n/100)!.bars.map(bar=>bar.label)).toEqual(['','','','0.99','1.0','10.0','10']);
  const both=projectChannelChart('vitamin_d',[{date,sun:1200,device:800}],[{date,sun:1200,device:800}],null)!;
  expect(both.bars[0]!.label).toBe('');expect(both.bars[0]!.sunHeight).toBe(66);expect(both.bars[0]!.deviceHeight).toBe(44);
  expect(both.summary).toContain('sunlight and device signal logged');
  expect(projectChannelChart('circadian',null,null,null)).toBeNull();
});
it('keeps UV peak time as escaped authored emphasis and literal metadata cannot create markup',()=>{
  const view=projectChannelDetail({channel:'vitamin_d',meta:{label:'<img src=x>',what:'<script>bad()</script>',icon:'<svg onload=bad()>'},sun:0,device:0,recentDays:[],chartDays:null,iuDays:null,pbmJoulesPerCm2:null,matchingDevice:false,peakAt:original.now,peakUV:3});
  const root=document.createElement('div');root.innerHTML=renderHTML({view});
  expect(root.querySelector('img,script,svg,[onload]')).toBeNull();
  expect(root.querySelector('.light-channel-nextmove-text strong')!.textContent).toBe(view.takeaway!.peakTime);
  expect(root.textContent).toContain('<script>bad()</script>');
  expect(root.querySelector('.light-channel-cit-suggest a')!.getAttribute('href')).toContain(encodeURIComponent('[Light & Sun] <img src=x>: better study / correction'));
});
it('routes authored nested action clicks once and updates the single expanded region',()=>{
  const sun=vi.fn(),device=vi.fn();
  configureLightChannelView({channelDisplay:{circadian:{label:'Circadian'},nir_solar:{label:'Near infrared'}},dailyChannelBreakdown:null,rollingChannelTotals:()=>({}),rollingDeviceTotals:()=>({}),getDevices:()=>[{channels:['circadian']}],quickLogSunSession:sun,quickLogDeviceSession:device});
  const root=document.createElement('section');document.body.append(root);installLightChannelActionDelegates(root);installLightChannelActionDelegates(root);
  root.innerHTML=renderChannelPills({});
  root.querySelector<HTMLButtonElement>('[data-channel=circadian]')!.click();
  root.querySelector<HTMLButtonElement>('[data-light-channel-action=quick-log-sun]')!.click();root.querySelector<HTMLButtonElement>('[data-light-channel-action=quick-log-device]')!.click();
  expect(sun).toHaveBeenCalledTimes(1);expect(device).toHaveBeenCalledTimes(1);
  root.querySelector<HTMLButtonElement>('[data-channel=nir_solar]')!.click();
  expect(root.querySelectorAll('[data-light-channel-presentation]')).toHaveLength(1);
  expect(root.querySelector('[data-light-channel-presentation]')!.getAttribute('data-channel')).toBe('nir_solar');
  root.querySelector<HTMLButtonElement>('.light-channel-detail-close')!.click();
  expect(root.querySelector('[data-channel-detail-slot]')!.childElementCount).toBe(0);
  expect([...root.querySelectorAll('.light-pill')].every(pill=>pill.getAttribute('aria-expanded')==='false')).toBe(true);
});
