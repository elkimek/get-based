// @vitest-environment jsdom
import {describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import {historicalPlacement,nativePlacementFragment,qualifyCurrentPlacementSources,requireCurrentPlacementSource} from './helpers/migration-review-marker-placement.js';
import original from './fixtures/marker-placement-original.json' with {type:'json'};
import type {MarkerPlacementChoice} from '../js/marker-detail-placement.js';
import {renderPlacementForm,renderPlacementOptions,renderPlacementSummary,projectPlacementOptions} from '../js/marker-placement-presentation.js';

const compiled = vi.hoisted(()=>({alter:(_owner:string,html:string)=>html}));
vi.mock('../js/components/MarkerPlacementForm.svelte.html.js',async original=>{
  const actual=await original<typeof import('../js/components/MarkerPlacementForm.svelte.html.js')>();
  return {renderHTML:(props:Parameters<typeof actual.renderHTML>[0])=>compiled.alter('form',actual.renderHTML(props))};
});
vi.mock('../js/components/MarkerPlacementSummary.svelte.html.js',async original=>{
  const actual=await original<typeof import('../js/components/MarkerPlacementSummary.svelte.html.js')>();
  return {renderHTML:(props:Parameters<typeof actual.renderHTML>[0])=>compiled.alter('summary',actual.renderHTML(props))};
});
vi.mock('../js/components/MarkerPlacementOptions.svelte.html.js',async original=>{
  const actual=await original<typeof import('../js/components/MarkerPlacementOptions.svelte.html.js')>();
  return {renderHTML:(props:Parameters<typeof actual.renderHTML>[0])=>compiled.alter('options',actual.renderHTML(props))};
});
interface NativeNode {type:number;name:string;value:string|null;namespace:string|null;attrs:(string|null)[][];defaults:Record<string,unknown>|null;children:NativeNode[]}
function native(node:Node):NativeNode {
  const element=node instanceof Element?node:null;
  return {type:node.nodeType,name:node.nodeName,value:node.nodeValue,namespace:element?.namespaceURI??null,
    attrs:element?Array.from(element.attributes,a=>[a.namespaceURI,a.name,a.value]):[],
    defaults:element?Object.fromEntries(['type','value','defaultValue','defaultSelected','selected','selectedIndex','disabled','multiple','required'].filter(key=>key in element).map(key=>[key,Reflect.get(element,key)])):null,
    children:Array.from(node.childNodes,native)};
}
function parse(html:string,select=false):NativeNode {const box=document.createElement(select?'select':'div');box.innerHTML=html;return native(box);}
const hostile='gb-placement-summary-current gb-placement-form-marker-name gb-placement-options data-marker-placement-private-action="open" <!--[0--> & " <script>';

describe('marker placement authored presentation',()=>{
  it('qualifies exact current owners, compiler source-map bindings and immutable recovered inputs',()=>qualifyCurrentPlacementSources());
  it('retains every original ordered node, attribute, text and native control default across all grouped choices and branches',()=>{
    let ordinal=0;
    const same=(html:string,select=false)=>{const expected=original[ordinal++];expect(expected).toBeDefined();expect(parse(html,select),expected!.name).toEqual(parse(expected!.originalHTML,select));};
    for(const moved of [false,true])for(const name of ['',null,'Glucose',hostile])same(nativePlacementFragment('summary',renderPlacementSummary('bio_glucose','Current<&','Original<&',moved,()=>name),moved));
    for(const size of [0,1,2,5])for(const split of [false,true])for(const selected of [false,true]){
      const choices=Array.from({length:size},(_,i)=>({categoryKey:i===1?hostile:'category'+i,label:i===1?hostile:'Category'+i,inProfile:split?i%2===0:true,selected:selected&&i===size-1}));
      const groups=projectPlacementOptions(choices);
      same(nativePlacementFragment('options',renderPlacementOptions(choices),false,groups),true);
      for(const moved of [false,true])for(const unavailableCount of [0,1,2])same(nativePlacementFragment('form',renderPlacementForm('bio_glucose',{marker:{name:hostile},choices,unavailableCount},'Current<&','Original<&',moved),moved,groups));
    }
    expect(ordinal).toBe(original.length);
  });
  it('treats dollar replacement syntax in a marker name as escaped text, exactly like the original template',()=>{
    const name="$& $` $' $$";
    const box=document.createElement('div');box.innerHTML=renderPlacementSummary('bio_glucose','Current','Original',false,()=>name);
    expect(box.querySelector('button')?.getAttribute('aria-label')).toBe('Change category for '+name);
  });
  it('keeps the original two filter passes followed by value, selected, and label reads in group order',()=>{
    const reads:string[]=[];
    const choice=(id:number,inProfile:boolean):MarkerPlacementChoice=>({
      get inProfile(){reads.push(`profile${id}`);return inProfile;},
      get categoryKey(){reads.push(`value${id}`);return 'category'+id;},
      get selected(){reads.push(`selected${id}`);return id===1;},
      get label(){reads.push(`label${id}`);return 'Category'+id;},
    });
    renderPlacementOptions([choice(0,false),choice(1,true)]);
    expect(reads).toEqual(['profile0','profile1','profile0','profile1','value1','selected1','label1','value0','selected0','label0']);
  });
  it('does not read marker.name before current-label coercion or later fields after an original coercion throws',()=>{
    const reads:string[]=[];
    renderPlacementSummary('bio_glucose',{toString(){reads.push('current');return 'Current';}},{toString(){reads.push('native');return 'Original';}},true,()=>{reads.push('name');return 'Glucose';});
    expect(reads).toEqual(['current','name','native']);
    const error=new Error('controlled coercion');reads.length=0;
    expect(()=>renderPlacementSummary('bio_glucose',{toString(){throw error;}},'Original',true,()=>{reads.push('name');return 'Glucose';})).toThrow(error);
    expect(reads).toEqual([]);
  });
  it.each([
    ['root',(raw:string)=>raw.slice(8)],
    ['unknown comment',(raw:string)=>raw.replace('</div>','<!--foreign--></div>')],
    ['conditional marker',(raw:string)=>raw.replace('<!--[0-->','<!--[9-->')],
    ['missing slot',(raw:string)=>raw.replace('gb-placement-form-current','foreign')],
    ['duplicate slot',(raw:string)=>raw.replace('gb-placement-form-current','gb-placement-form-currentgb-placement-form-current')],
    ['wrong delegated action',(raw:string)=>raw.replace('data-marker-placement-private-action="back"','data-marker-placement-private-action="foreign"')],
    ['missing select boundary',(raw:string)=>raw.replace('<!></select>','</select>')],
    ['missing child envelope',(raw:string)=>raw.replace('gb-placement-options<!---->','gb-placement-options')],
  ])('preserves historical private-codec rejection of %s before returning markup',(_name,alter)=>{
    const historical=historicalPlacement((owner,raw)=>owner==='form'?alter(raw):raw);
    expect(()=>historical.renderPlacementForm('bio_glucose',{marker:{name:'Glucose'},choices:[],unavailableCount:1},'Current','Original',true)).toThrow();
  });
});

// Genuine current output remains plain typed Svelte rendering. Corruptions must
// fail the complete native oracle rather than depend on a retired private codec.
describe('marker placement current native oracle corruption guards',()=>{
 const verify=()=>{
  const html=renderPlacementForm('bio_glucose',{marker:{name:hostile},choices:[],unavailableCount:1},'Current<&','Original<&',true);
  expect(parse(nativePlacementFragment('form',html,true,[]))).toEqual(parse(original[13]!.originalHTML));
 };
 it.each([
  ['extra comment',(raw:string)=>raw.replace('</div>','<!--foreign--></div>')],
  ['wrong conditional boundary',(raw:string)=>raw.replace('<!--[0-->','<!--[9-->')],
  ['missing child boundary',(raw:string)=>raw.replace('<!---->\n          <!></select>','\n          </select>')],
  ['wrong public save action',(raw:string)=>raw.replace('data-marker-detail-action="save-marker-placement"','data-marker-detail-action="show-detail-modal"')],
  ['changed native safety text',(raw:string)=>raw.replace('Only where this marker appears will change.','Values may change.')],
  ['changed unavailable count',(raw:string)=>raw.replace('1 calculated, incompatible','2 calculated, incompatible')],
  ['changed native control default',(raw:string)=>raw.replace('<select id="marker-placement-category"','<select disabled id="marker-placement-category"')],
 ])('rejects %s without filtering foreign output',(_label,alter)=>{
  verify();compiled.alter=(owner,html)=>owner==='form'?alter(html):html;
  try{expect(()=>verify()).toThrow();}finally{compiled.alter=(_owner,html)=>html;}
 });
 it('rejects a change in real action projection or option coercion source',()=>{
  const file='js/marker-placement-presentation.ts',source=fs.readFileSync(file,'utf8');
  requireCurrentPlacementSource(file,source);
  for(const changed of [source.replace("save=action('save-marker-placement',id)","save=action('show-detail-modal',id)"),source.replace('selected=!!choice.selected','selected=false')]){
   expect(changed).not.toBe(source);expect(()=>requireCurrentPlacementSource(file,changed)).toThrow();
  }
 });
});
