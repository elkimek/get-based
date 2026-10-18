// Archived original private codec contracts. Current genuine owners are exercised by native/current presentation and browser tests.
// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
const fault=vi.hoisted(()=>({change:(html:string)=>html}));
vi.mock('./fixtures/archived-native-ui/components/DashboardLabMarkers.svelte.html.js',async importOriginal=>{const real=await importOriginal<typeof import('./fixtures/archived-native-ui/components/DashboardLabMarkers.svelte.html.js')>();return{...real,renderHTML:(props:Parameters<typeof real.renderHTML>[0])=>fault.change(real.renderHTML(props))};});
import {renderDashboardLabMarkersPresentation,type DashboardLabMarkersPresentationPorts} from './fixtures/archived-native-ui/dashboard-lab-markers-presentation.js';
type Branch={owner:keyof DashboardLabMarkersPresentationPorts;kind:string;slots:{coordinate:string;port:string}[];nativeSkeleton:string};
const branches=JSON.parse(readFileSync(path.join(import.meta.dirname,'fixtures/dashboard-lab-markers-branches.json'),'utf8')) as Branch[];
afterEach(()=>{fault.change=html=>html;});
it.each(branches)('$owner / $kind inserts all native values once in original port order',branch=>{
 const trace:string[]=[];const ports=Object.fromEntries(branch.slots.map((s,n)=>[s.port,()=>{trace.push(s.port);return n===0?'private data <&> '+s.coordinate:'native-'+s.port;}]));
 let cursor=0,out='';branch.slots.forEach((s,n)=>{const at=branch.nativeSkeleton.indexOf(s.coordinate,cursor);out+=branch.nativeSkeleton.slice(cursor,at)+(n===0?'private data <&> '+s.coordinate:'native-'+s.port);cursor=at+s.coordinate.length;});out+=branch.nativeSkeleton.slice(cursor);
 expect(renderDashboardLabMarkersPresentation(branch.owner,branch.kind as never,ports as never)).toBe(out);expect(trace).toEqual(branch.slots.map(s=>s.port));
});
it.each(branches)('$owner / $kind retains native string-hint and Symbol throw chronology',branch=>{
 const trace:string[]=[];const ports=Object.fromEntries(branch.slots.map((s,n)=>[s.port,()=>{trace.push(s.port);return n===0?{[Symbol.toPrimitive](hint:string){trace.push(hint);return Symbol('native');}}:'later';}]));
 expect(()=>renderDashboardLabMarkersPresentation(branch.owner,branch.kind as never,ports as never)).toThrow(TypeError);expect(trace).toEqual([branch.slots[0]!.port,'string']);
});
const corruptions:[string,(html:string)=>string][]=[['complete suffix',s=>s+'<!-- altered -->'],['button type',s=>s.replace('type="button"','type="submit"')],['accessible label',s=>s.replace('aria-label=','title=')],['spark coordinate',s=>s.replace('sparkline-end','removed-spark-end')],['status coordinate',s=>s.replace('status-class-end','removed-status-end')],['static layout class',s=>s.replace('db-stat-head','foreign-head')]];
it.each(corruptions)('rejects %s compiler corruption before any callback',(_name,change)=>{const branch=branches[0]!,trace:string[]=[],ports=Object.fromEntries(branch.slots.map(s=>[s.port,()=>{trace.push(s.port);return 'native';}]));fault.change=change;expect(()=>renderDashboardLabMarkersPresentation(branch.owner,branch.kind as never,ports as never)).toThrow('Unqualified complete Dashboard Labs Markers compiler frame');expect(trace).toEqual([]);});
it('rejects missing ports before callback evaluation',()=>{expect(()=>renderDashboardLabMarkersPresentation('renderDashboardSingleMarkerWidget','single-marker',{} as never)).toThrow('presentation ports');});
it('rejects wrong named ports with the original complete count',()=>{const branch=branches[0]!,ports=Object.fromEntries(branch.slots.map(s=>[s.port,()=> 'native']));delete ports['statusClass'];ports['unknown']=()=> 'native';expect(()=>renderDashboardLabMarkersPresentation(branch.owner,branch.kind as never,ports as never)).toThrow('named Dashboard Labs Markers port');});
it('preserves the exact first throwing port and excludes later callbacks',()=>{const branch=branches[0]!,trace:string[]=[],ports=Object.fromEntries(branch.slots.map((s,n)=>[s.port,()=>{trace.push(s.port);if(n===1)throw new RangeError('native detail');return 'native';}]));expect(()=>renderDashboardLabMarkersPresentation(branch.owner,branch.kind as never,ports as never)).toThrow('native detail');expect(trace).toEqual(branch.slots.slice(0,2).map(s=>s.port));});
it('rejects an unknown unqualified branch',()=>{expect(()=>renderDashboardLabMarkersPresentation('renderDashboardSingleMarkerWidget','unqualified' as never,{} as never)).toThrow('presentation branch');});
