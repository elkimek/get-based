import fs from 'node:fs/promises';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'vitest';
import assert from 'node:assert/strict';
import {expectedNote,requireExactReceipt,noteText,currentNativeAuthored,retiredNativeAuthored,qualifyMarkerDetailNativeShell,type NativeProfileReceipt} from './helpers/marker-detail-pwa-receipt.js';
const stored=JSON.parse(await fs.readFile(path.resolve('tests/fixtures/marker-detail-complete/pwa-profile.json'),'utf8')) as Record<string,unknown>;
const profiles=JSON.parse(await fs.readFile(path.resolve('tests/fixtures/marker-detail-complete/pwa-registry.json'),'utf8')) as Array<Record<string,unknown>>;
const before:NativeProfileReceipt={live:structuredClone(stored),stored,rawCommitted:JSON.stringify(stored),profiles,rawProfiles:JSON.stringify(profiles),active:'default',current:'default'};
const bounds={minimum:1000,maximum:2000};const expected=expectedNote(before,1500,bounds);test('complete exact receipt accepts',()=>requireExactReceipt(expected,expected));test('only intended trimmed literal note commits',()=>assert.deepEqual(expected.stored.markerNotes,{'proteins.albumin':noteText}));
const mutations:Array<[string,(value:NativeProfileReceipt)=>void]>=[
 ['unrelated stored entry',v=>(v.stored.entries as unknown[]).pop()],
 ['unrelated live entry',v=>(v.live.entries as unknown[]).pop()],
 ['unrelated stored supplements',v=>v.stored.supplements=['foreign']],
 ['unrelated live genetics',v=>v.live.genetics={}],
 ['wrong note',v=>v.stored.markerNotes={'proteins.albumin':'foreign'}],
 ['extra note',v=>v.live.markerNotes={'proteins.albumin':noteText,'foreign.marker':'foreign'}],
 ['missing note',v=>v.stored.markerNotes={}],
 ['wire whitespace',v=>v.rawCommitted+=' '],
 ['wire old baseline',v=>v.rawCommitted=before.rawCommitted],
 ['registry',v=>v.profiles=[]],
 ['raw registry',v=>v.rawProfiles='[]'],
 ['active profile',v=>v.active='foreign'],
 ['live profile id',v=>v.current='foreign'],
 ['inactive registry mutation',v=>(v.profiles as Array<Record<string,unknown>>)[1]!.notes='foreign'],
 ['active registry unrelated mutation',v=>(v.profiles as Array<Record<string,unknown>>)[0]!.name='foreign'],
 ['registry timestamp mutation',v=>(v.profiles as Array<Record<string,unknown>>)[0]!.lastUpdated=1501],
 ['raw registry whitespace',v=>v.rawProfiles+=' '],
 ['extra receipt field',v=>Object.assign(v,{foreign:true})],
];
for(const [name,mutate] of mutations)test('reject '+name,()=>{const changed=structuredClone(expected);mutate(changed);assert.throws(()=>requireExactReceipt(changed,expected),name);});
test('reject changed baseline',()=>assert.throws(()=>expectedNote({...before,live:{...before.live,foreign:true}},1500,bounds)));
for(const bad of [999,2001,1500.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,1])test('reject timestamp corruption '+bad,()=>assert.throws(()=>expectedNote(before,bad,bounds)));
test('reject reversed bounds',()=>assert.throws(()=>expectedNote(before,1500,{minimum:2000,maximum:1000})));
test('reject invalid bounds',()=>assert.throws(()=>expectedNote(before,1500,{minimum:NaN,maximum:2000})));

const maintainedMarkerShell=readFileSync('service-worker-assets.ts','utf8');
const shellFor=(modules:readonly string[])=>'const APP_SHELL = '+JSON.stringify(modules.map(module=>'/'+module))+';';
test('current exact Marker Detail SW roster follows genuine imports while original private protocols remain archived',()=>qualifyMarkerDetailNativeShell(maintainedMarkerShell));
for(const module of currentNativeAuthored)test('reject omitted current Marker Detail SW module '+module,()=>assert.throws(()=>qualifyMarkerDetailNativeShell(shellFor(currentNativeAuthored.filter(file=>file!==module)))));
for(const retired of retiredNativeAuthored){
 test('reject resurrected private compiler SW URL '+retired,()=>assert.throws(()=>qualifyMarkerDetailNativeShell(shellFor([...currentNativeAuthored,retired]))));
 test('reject resurrected canonical private compiler '+retired,()=>assert.throws(()=>qualifyMarkerDetailNativeShell(maintainedMarkerShell,file=>readFileSync(file,'utf8'),file=>file===retired||existsSync(file))));
 test('reject changed original private compiler archive '+retired,()=>assert.throws(()=>qualifyMarkerDetailNativeShell(maintainedMarkerShell,file=>readFileSync(file,'utf8')+(file==='tests/fixtures/archived-native-ui/'+retired.slice(3).replace(/\.js$/,'.ts')?'foreign':''))));
 test('reject a live adapter importing retired private compiler '+retired,()=>assert.throws(()=>qualifyMarkerDetailNativeShell(maintainedMarkerShell,file=>readFileSync(file,'utf8')+(file==='js/marker-detail-complete-presentation.ts'?"\nimport './"+retired.slice(3)+"';":''))));
}
test('reject missing live genuine modal facade import',()=>assert.throws(()=>qualifyMarkerDetailNativeShell(maintainedMarkerShell,file=>readFileSync(file,'utf8').replace(file==='js/marker-detail-modal-presentation.ts'?"import {renderHTML} from './components/MarkerDetailModal.svelte.html.js';":'never-match-native-import',''))));
test('reject missing current modal projection import',()=>assert.throws(()=>qualifyMarkerDetailNativeShell(maintainedMarkerShell,file=>readFileSync(file,'utf8').replace(file==='js/marker-detail-modal-impl.ts'?"import {captureMarkerDetailText,projectMarkerDetailAction} from './marker-detail-projection.js';":'never-match-native-import',''))));
