import historicalControllers from './fixtures/wearable-controller-before.json' with {type:'json'};
// @vitest-environment jsdom
import {expect,it} from 'vitest';import {readFileSync} from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {stripTypeScriptTypes} from 'node:module';import {Script} from 'node:vm';
import inverse from './fixtures/wearable-strip-controller-inverse.json' with {type:'json'};
import {historicalWearableStripControllerSource} from './helpers/wearable-strip-stub-owned-receipts.js';
import {historicalWearableEmptyControllerSource} from './helpers/wearable-strip-empty-owned-receipts.js';
import {historicalWearableSparklineControllerSource,expectedWearableSparklineReceipt,expectedWearableSparklineHTML} from './helpers/wearable-strip-sparkline-owned-receipts.js';
import {renderWearableSparklinePresentation} from '../js/wearable-strip-sparkline-presentation.js';
import {state} from '../js/state.js';
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');const source=readFileSync(path.join(process.cwd(),'js/wearables.ts'),'utf8');
let original=historicalWearableStripControllerSource(historicalWearableEmptyControllerSource(historicalWearableSparklineControllerSource(historicalControllers['wearables.ts'])));expect(sha(original)).toBe(inverse.sourceAfterSHA256);
for(const edit of [...inverse.edits].sort((a,b)=>b.candidateStart-a.candidateStart)){expect(original.slice(edit.candidateStart,edit.candidateEnd)).toBe(edit.after);original=original.slice(0,edit.candidateStart)+edit.before+original.slice(edit.candidateEnd);}expect(sha(original)).toBe(inverse.sourceBeforeSHA256);
function functionBody(source:string,name='sparklineSVG'):string{const start=source.indexOf('function '+name+'(');expect(start).toBeGreaterThan(0);return source.slice(start,source.indexOf('\n}',start)+2);}
const nativeBody=functionBody(original);expect(Buffer.byteLength(nativeBody)).toBe(1502);expect(sha(nativeBody)).toBe('f6088dcd3c6a6ed3b10275945a450a8b28531c0355c7926af846fe8a33709a53');
type Renderer=(series:number[]|null|undefined,baseline:number,worseWhen:unknown)=>string;
// Type erasure only after whole immutable native SHA qualification. No copied math/renderer fixture.
const native=new Script('('+stripTypeScriptTypes(nativeBody,{mode:'strip'})+')',{filename:'qualified-original-native-sparkline.ts'}).runInNewContext({Math,isFinite})as Renderer;
const projectCurrent=new Script('('+stripTypeScriptTypes(functionBody(source,'projectWearableSparkline'),{mode:'strip'})+')',{filename:'actual-current-source-sparkline.ts'}).runInNewContext({Math,isFinite}) as (series:number[]|null|undefined,baseline:number,worseWhen:unknown)=>Parameters<typeof renderWearableSparklinePresentation>[0]|null;
const actual:Renderer=(series,baseline,worseWhen)=>{const view=projectCurrent(series,baseline,worseWhen);return view?renderWearableSparklinePresentation(view):'';};
type Factory=(trace:string[])=>number[]|null|undefined;
const fixtures:Record<string,Factory>={
 'leading sparse':()=>{const series=[40,52];delete series[0];return series;},
 'middle sparse':()=>{const series=[40,45,52];delete series[1];return series;},
 'trailing sparse':()=>{const series=[40,52,55];delete series[2];return series;},
 'one hole':()=>new Array<number>(1),
 'four holes':()=>new Array<number>(4),
 'explicit undefined differs from hole':()=>[40,undefined,52]as unknown as number[],
 'empty array':()=>[], 'null series':()=>null,
 'custom sparse map/join receiver':trace=>{const series=[40,45,52];delete series[1];Object.defineProperty(series,'map',{value:function(this:number[],callback:(value:number,index:number)=>unknown){trace.push('map:'+String(this===series));const mapped=Array.prototype.map.call(this,(value:number,index:number)=>{trace.push('callback:'+index);return callback(value,index);});const result={join(separator:string){trace.push('join:'+String(this===result)+':'+separator);return mapped.join(separator);}};return result;}});return series;},
};
function snapshot(series:number[]|null|undefined):unknown{if(series==null)return series;return Reflect.ownKeys(series).map(key=>{const descriptor=Object.getOwnPropertyDescriptor(series,key)!;return[String(key),descriptor.enumerable,descriptor.configurable,'value'in descriptor?[typeof descriptor.value==='function'?['function',descriptor.value.name,descriptor.value.length]:descriptor.value,descriptor.writable]:['accessor',descriptor.get?.name,descriptor.set?.name]];});}
function dom(node:Node):unknown{return node instanceof Element?{type:node.nodeType,name:node.localName,namespace:node.namespaceURI,attributes:[...node.attributes].map(attr=>[attr.namespaceURI,attr.name,attr.value]),children:[...node.childNodes].map(dom)}:{type:node.nodeType,text:node.nodeValue};}
function receipt(renderer:Renderer,factory:Factory){const trace:string[]=[];const series=factory(trace);const before=snapshot(series);const data=JSON.stringify(state.importedData),storage=JSON.stringify(Object.entries(localStorage));const raw=renderer(series,45,'down'),host=document.createElement('main');host.innerHTML=raw;return{raw,assignments:[raw],dom:dom(host),trace,before,after:snapshot(series),dataBefore:data,dataAfter:JSON.stringify(state.importedData),storageBefore:storage,storageAfter:JSON.stringify(Object.entries(localStorage)),points:host.querySelector('polyline')?.getAttribute('points')??null};}
it.each(Object.entries(fixtures))('%s compares actual source to whole SHA-qualified original raw/DOM/operations/protected state without sparse normalization',(name,factory)=>{state.currentProfile='synthetic-sparse-sparkline';(state as {importedData:unknown}).importedData={opaque:{keep:['all',3]},otherProfile:{protected:true}};localStorage.clear();localStorage.setItem('protected-other-profile','{"keep":true}');const old=receipt(native,factory),next=receipt(actual,factory);expect(next).toEqual(expectedWearableSparklineReceipt(old));expect(next.after).toEqual(next.before);expect(next.dataAfter).toBe(next.dataBefore);expect(next.storageAfter).toBe(next.storageBefore);if(name==='middle sparse')expect(next.points).toBe('2.0,NaN  98.0,NaN');if(name==='leading sparse')expect(next.points).toBe(' 98.0,NaN');if(name==='trailing sparse')expect(next.points).toBe('2.0,NaN 50.0,NaN ');if(name==='one hole')expect(next.points).toBe('');if(name==='four holes')expect(next.points).toBe('   ');if(name==='custom sparse map/join receiver')expect(next.trace).toEqual(['map:true','callback:0','callback:2','join:true: ']);});
for(const malformed of ['2,3 bad','2,3\t4,5','2,3" data-foreign="x','2,3,,4','NaN,NaN script'])it('sparse empty slots do not admit malformed nonempty slots '+JSON.stringify(malformed),()=>{const raw=native([40,52],45,'down');const changed=raw.replace(/points="[^"]*"/,()=>`points="${malformed}"`);expect(changed).not.toBe(raw);expect(()=>expectedWearableSparklineHTML(changed)).toThrow();});
