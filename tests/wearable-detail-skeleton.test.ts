// Retired private codec controls only; current/native product acceptance lives in wearable-*-presentation.test.ts.
// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
const fault=vi.hoisted(()=>({change:(html:string)=>html}));
vi.mock('./fixtures/wearable-legacy/WearableManualEntries.js',async importOriginal=>{const real=await importOriginal<typeof import('./fixtures/wearable-legacy/WearableManualEntries.js')>();return{...real,renderHTML:(props:Parameters<typeof real.renderHTML>[0])=>fault.change(real.renderHTML(props))};});
vi.mock('./fixtures/wearable-legacy/WearableDetailChrome.js',async importOriginal=>{const real=await importOriginal<typeof import('./fixtures/wearable-legacy/WearableDetailChrome.js')>();return{...real,renderHTML:(props:Parameters<typeof real.renderHTML>[0])=>fault.change(real.renderHTML(props))};});
vi.mock('./fixtures/wearable-legacy/WearableDetailStats.js',async importOriginal=>{const real=await importOriginal<typeof import('./fixtures/wearable-legacy/WearableDetailStats.js')>();return{...real,renderHTML:(props:Parameters<typeof real.renderHTML>[0])=>fault.change(real.renderHTML(props))};});
vi.mock('./fixtures/wearable-legacy/WearableDetailFeedback.js',async importOriginal=>{const real=await importOriginal<typeof import('./fixtures/wearable-legacy/WearableDetailFeedback.js')>();return{...real,renderHTML:(props:Parameters<typeof real.renderHTML>[0])=>fault.change(real.renderHTML(props))};});
import {renderWearableDetailPresentation,type WearableDetailPresentationPorts} from './fixtures/wearable-legacy/wearable-detail-presentation.js';
import {wearableDetailPresentationAnchors} from './fixtures/wearable-legacy/wearable-detail-presentation-compiler-anchors.js';
type Branch={component:keyof WearableDetailPresentationPorts;kind:string;slots:{coordinate:string;port:string}[];nativeSkeleton:string};
const branches=JSON.parse(readFileSync(path.join(import.meta.dirname,'fixtures/wearable-detail-branches.json'),'utf8')) as Branch[];
afterEach(()=>{fault.change=html=>html;});
it.each(branches)('$component:$kind preserves native named expression order and never rescans inserted values',branch=>{
 const trace:string[]=[];const ports=Object.fromEntries(branch.slots.map((slot,i)=>[slot.port,()=>{trace.push(slot.port);return i===0?'native <&> '+slot.coordinate:'value-'+slot.port;}]));
 let expected='',cursor=0;branch.slots.forEach((slot,i)=>{const at=branch.nativeSkeleton.indexOf(slot.coordinate,cursor);expected+=branch.nativeSkeleton.slice(cursor,at)+(i===0?'native <&> '+slot.coordinate:'value-'+slot.port);cursor=at+slot.coordinate.length;});expected+=branch.nativeSkeleton.slice(cursor);
 expect(renderWearableDetailPresentation(branch.component,branch.kind as never,ports as never)).toBe(expected);expect(trace).toEqual(branch.slots.map(slot=>slot.port));
});
it.each(branches)('$component:$kind rejects changed complete frames before any callback',branch=>{
 const anchors=wearableDetailPresentationAnchors[branch.component] as Record<string,{production:{html:string}}>;const native=anchors[branch.kind]!.production.html;fault.change=html=>html+'<!-- foreign corruption -->';expect(fault.change(native)).not.toBe(native);const trace:string[]=[];const ports=Object.fromEntries(branch.slots.map(slot=>[slot.port,()=>trace.push(slot.port)]));expect(()=>renderWearableDetailPresentation(branch.component,branch.kind as never,ports as never)).toThrow('Unqualified complete wearable detail compiler frame');expect(trace).toEqual([]);
});
const populated=branches.filter(branch=>branch.slots.length>0);
it.each(populated)('$component:$kind preserves native Symbol interpolation rejection at the first port',branch=>{const trace:string[]=[];const ports=Object.fromEntries(branch.slots.map((slot,i)=>[slot.port,()=>{trace.push(slot.port);return i===0?Symbol('native'):'later';}]));expect(()=>renderWearableDetailPresentation(branch.component,branch.kind as never,ports as never)).toThrow(TypeError);expect(trace).toEqual([branch.slots[0]!.port]);});
it.each(populated)('$component:$kind rejects missing named ports',branch=>{const ports=Object.fromEntries(branch.slots.slice(1).map(slot=>[slot.port,()=>'' ]));expect(()=>renderWearableDetailPresentation(branch.component,branch.kind as never,ports as never)).toThrow('Unqualified wearable detail presentation ports');});
it('preserves the string hint and first throw chronology',()=>{const branch=branches.find(b=>b.kind==='modal'&&b.component==='WearableDetailChrome')!;const trace:string[]=[];const ports=Object.fromEntries(branch.slots.map((slot,j)=>[slot.port,()=>{trace.push(slot.port);if(j===1)return{[Symbol.toPrimitive](hint:string){trace.push('coercion:'+hint);throw new RangeError('native coercion');}};return 'first';}]));expect(()=>renderWearableDetailPresentation(branch.component,branch.kind as never,ports as never)).toThrow('native coercion');expect(trace).toEqual(['closeActionAttributes','label','coercion:string']);});
it('rejects wrong callback names even at the native count',()=>expect(()=>renderWearableDetailPresentation('WearableDetailStats','subLabel',{wrong:()=>''} as never)).toThrow('Unqualified named wearable detail port'));
it('rejects a modified private coordinate before callbacks',()=>{fault.change=html=>html.replace('gb-wearable-detail-wearabledetailstats-sublabel-sub-label-end','broken');const native=wearableDetailPresentationAnchors.WearableDetailStats.subLabel.production.html;expect(fault.change(native)).not.toBe(native);const trace:string[]=[];expect(()=>renderWearableDetailPresentation('WearableDetailStats','subLabel',{subLabel:()=>trace.push('called')})).toThrow('Unqualified complete wearable detail compiler frame');expect(trace).toEqual([]);});
