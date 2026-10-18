// Archived original private codec contracts. Current genuine owners are exercised by native/current presentation and browser tests.
// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
const fault=vi.hoisted(()=>({change:(html:string)=>html}));
vi.mock('./fixtures/archived-native-ui/components/DashboardInsights.svelte.html.js',async importOriginal=>{const real=await importOriginal<typeof import('./fixtures/archived-native-ui/components/DashboardInsights.svelte.html.js')>();return{...real,renderHTML:(props:Parameters<typeof real.renderHTML>[0])=>fault.change(real.renderHTML(props))};});
import {renderDashboardInsightsPresentation,type DashboardInsightsPresentationPorts} from './fixtures/archived-native-ui/dashboard-insights-presentation.js';
import {dashboardInsightsPresentationAnchors} from './fixtures/archived-native-ui/dashboard-insights-presentation-compiler-anchors.js';
type Branch={owner:keyof DashboardInsightsPresentationPorts;kind:string;slots:{coordinate:string;port:string}[];nativeSkeleton:string};
const branches=JSON.parse(readFileSync(path.join(import.meta.dirname,'fixtures/dashboard-insights-branches.json'),'utf8')) as Branch[];
afterEach(()=>{fault.change=html=>html;});
it.each(branches)('$kind preserves named callback order and inserts coordinate-containing payloads once',branch=>{
 const trace:string[]=[];const ports=Object.fromEntries(branch.slots.map((slot,i)=>[slot.port,()=>{trace.push(slot.port);return i===0?'native <&> '+slot.coordinate:'native-'+slot.port;}]));
 let cursor=0,expected='';for(let j=0;j<branch.slots.length;j++){const slot=branch.slots[j]!;const at=branch.nativeSkeleton.indexOf(slot.coordinate,cursor);expected+=branch.nativeSkeleton.slice(cursor,at)+(j===0?'native <&> '+slot.coordinate:'native-'+slot.port);cursor=at+slot.coordinate.length;}expected+=branch.nativeSkeleton.slice(cursor);
 expect(renderDashboardInsightsPresentation(branch.owner,branch.kind as never,ports as never)).toBe(expected);expect(trace).toEqual(branch.slots.map(slot=>slot.port));
});
it.each([
 ['appended node',(html:string)=>html+'<!-- changed -->'],
 ['native class',(html:string)=>html.replace('db-insight db-insight-','changed db-insight-')],
 ['button type',(html:string)=>html.replace('type="button"','type="submit"')],
 ['private coordinate',(html:string)=>html.replace('gb-dashboard-insights-card-title-end','changed-coordinate')],
 ['compiler branch marker',(html:string)=>html.replace('<!--[','<!--changed[')],
])('rejects %s before card callbacks',(_label,change)=>{
 const branch=branches.find(row=>row.kind==='card')!;const trace:string[]=[];const ports=Object.fromEntries(branch.slots.map(slot=>[slot.port,()=>{trace.push(slot.port);return 'native';}]));
 const frame=dashboardInsightsPresentationAnchors.renderDashboardInsightsListWidget.card.production.html;expect(change(frame)).not.toBe(frame);fault.change=change;
 expect(()=>renderDashboardInsightsPresentation(branch.owner,'card',ports as never)).toThrow('Unqualified complete Dashboard Insights compiler frame');expect(trace).toEqual([]);
});
it('rejects a missing port before interpolation',()=>{expect(()=>renderDashboardInsightsPresentation('renderDashboardInsightsListWidget','list',{} as never)).toThrow('Unqualified Dashboard Insights presentation ports');});
it('rejects the wrong named callback at the same count',()=>{expect(()=>renderDashboardInsightsPresentation('renderDashboardInsightsListWidget','list',{wrong:()=>''}as never)).toThrow('Unqualified named Dashboard Insights port');});
it('retains native string-hint Symbol failure',()=>{const trace:string[]=[];expect(()=>renderDashboardInsightsPresentation('renderDashboardInsightsListWidget','list',{itemsHTML:()=>({[Symbol.toPrimitive](hint:string){trace.push(hint);return Symbol('native');}})})).toThrow(TypeError);expect(trace).toEqual(['string']);});
it('retains the first callback throw and excludes later evaluations',()=>{const trace:string[]=[];expect(()=>renderDashboardInsightsPresentation('renderDashboardInsightsListWidget','card',{toneClass:()=>{trace.push('tone');return 'good';},optionalDetailAttributes:()=>{trace.push('attributes');throw new RangeError('native attribute');},eyebrow:()=>trace.push('eyebrow'),title:()=>trace.push('title'),body:()=>trace.push('body')})).toThrow('native attribute');expect(trace).toEqual(['tone','attributes']);});
