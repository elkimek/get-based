// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {parse} from 'svelte/compiler';
import {renderWearableStripView,type WearableStripView} from '../js/wearable-strip-presentation.js';
import {renderWearableDetailView,type WearableDetailView} from '../js/wearable-detail-presentation.js';
import {wearableHTMLTree} from './helpers/wearable-genuine-dom.js';
const components=['WearableMetricCard','WearableStripHeader','WearableStripBody','WearableDetailChrome','WearableManualEntries','WearableDetailStats','WearableDetailFeedback'];
it.each(components)('%s owns actual nodes through readonly feature data, without raw children or compiler expansion',name=>{
 const source=readFileSync(new URL('../js/components/'+name+'.svelte',import.meta.url),'utf8');
 expect(source).not.toMatch(/gb-wearable|\{@html|NativePort|nativeSkeleton|compilerAnchors|\.svelte\.html\.js/);
 function visit(value:unknown):void{if(!value||typeof value!=='object')return;if('type'in value){expect(value.type).not.toBe('HtmlTag');expect(value.type).not.toBe('EventDirective');}for(const child of Object.values(value))if(Array.isArray(child))child.forEach(visit);else visit(child);}
 visit(parse(source,{modern:true}));
});
it('composes typed empty and populated strip cards and native reorder defaults without serializing children',()=>{
 const view:WearableStripView={header:{manualOnly:false,sourceNames:'Oura <&>',coverage:' · 30d',showDemo:true,reorderMode:true,lastSync:'just now',sync:true,collapsed:false,collapseLabel:'Collapse wearables strip'},cards:[
  {metric:'weight',leftLabel:'Weight <&>',rightLabel:'Weight <&>',canLeft:false,canRight:true,card:{kind:'empty',view:{metric:'weight',interactive:false,accessibleLabel:'weight <&>',label:'Weight <&>',sub:null}}},
  {metric:'rhr',leftLabel:'Pulse',rightLabel:'Pulse',canLeft:true,canRight:false,card:{kind:'metric',view:{metric:'rhr',interactive:false,accessibleLabel:'Pulse 60',label:'Pulse',subLabel:'☀️',delta:{className:'wearable-delta-good',text:'↓ 2%'},value:'60',unit:'bpm',unitTight:false,baselineValue:'62',baselineUnit:' bpm',staleness:{date:'2026-06-01',label:'Jun 1'},sparkline:null,trendClass:'wearable-trend-good',trendLabel:'declining 30d',sourceBadge:null}}},
 ],waitingNote:'Polar <&> connected — waiting on first device sync.',hrvNote:null};
 const host=document.createElement('main');host.innerHTML=renderWearableStripView(view);
 expect(host.querySelector('.wearable-source-label')?.textContent).toBe('Oura <&> · 30d');
 expect(host.querySelector('.wearable-metric-name')?.textContent).toBe('Weight <&>');
 expect(host.querySelector('.wearable-source-label')?.children).toHaveLength(0);
 expect([...host.querySelectorAll<HTMLButtonElement>('.wearable-reorder-arrow')].map(b=>[b.type,b.disabled,b.dataset.wearableMetric,b.dataset.wearableDelta])).toEqual([['button',true,'weight','-1'],['button',false,'weight','1'],['button',false,'rhr','-1'],['button',true,'rhr','1']]);
 expect(host.querySelector('.wearable-card-empty')?.getAttribute('aria-disabled')).toBe('true');
 expect(host.querySelector('.wearable-value')?.textContent).toBe('–');
 expect(host.querySelectorAll('.wearable-card')).toHaveLength(2);
});
it('composes manual rows, stats and feedback directly while preserving native button and field defaults',()=>{
 const view:WearableDetailView={label:'Weight <&>',subLabel:'scale',sourceName:'Manual',delta:'',trend:'flat',sourceSwap:{kind:'single',metric:'weight',name:'Manual'},ranges:[{active:true,metric:'weight',range:'all',label:'All'}],emptyHint:{kind:'emptyChartWithManual',window:'this range',olderHint:'; switch to All to chart older manual readings'},stats:[{tooltip:'Quoted " <&>',label:'Latest',value:'74 kg',sub:'median'}],manualEntries:{kind:'list',metric:'weight',count:1,rows:[{date:'2026-06-30',shortDate:'Jun 30',value:'74',unit:'kg',tags:['resting <&>'],note:'note <button> literal',deleteLabel:'Delete reading',deleteDate:'2026-06-30',metric:'weight'}]},emfHint:{kind:'emfHint'}};
 const host=document.createElement('main');host.innerHTML=renderWearableDetailView(view);
 expect(host.querySelector('h3')?.textContent).toBe('Weight <&> scale');
 expect(host.querySelector<HTMLButtonElement>('.modal-close')?.type).toBe('submit');
 expect(host.querySelector('.wearable-detail-stat')?.getAttribute('title')).toBe('Quoted " <&>');
 expect(host.querySelector('.wearable-manual-entry-note')?.textContent).toBe('note <button> literal');
 expect(host.querySelector('.wearable-manual-entry-note button')).toBeNull();
 expect(host.querySelector('.wearable-manual-entry-tag')?.textContent).toBe('resting <&>');
 expect(host.querySelector<HTMLButtonElement>('.wearable-manual-entry-del')?.dataset.wearableDate).toBe('2026-06-30');
 expect(host.querySelector('.wearable-detail-emf-hint a')?.getAttribute('href')).toBe('#');
 expect(host.querySelectorAll('canvas#chart-modal')).toHaveLength(1);
});
it.each(['text','attribute','attribute order','namespace','unknown comment','whitespace'])('keeps real %s corruption observable across compiler-only DOM coordinate changes',kind=>{
 const native='<div class="a" title="b"><svg><circle r="2"></circle></svg> text </div>';
 const corrupted=kind==='text'?native.replace(' text ',' wrong '):kind==='attribute'?native.replace('title="b"','title="wrong"'):kind==='attribute order'?native.replace('class="a" title="b"','title="b" class="a"'):kind==='namespace'?native.replace('<svg>','<div>').replace('</svg>','</div>'):kind==='unknown comment'?native+'<!--[99-->':native.replace(' text ','text');
 expect(wearableHTMLTree(corrupted)).not.toEqual(wearableHTMLTree(native));
 expect(wearableHTMLTree('<!--[-->'+native+'<!--]-->')).toEqual(wearableHTMLTree(native));
});
