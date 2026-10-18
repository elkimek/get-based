// @vitest-environment jsdom
import {describe,it,expect,vi} from 'vitest';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import * as quality from '../js/supplement-quality.js';
import * as draft from '../js/supplement-import-draft.js';
import type {SupplementImportReviewView} from '../js/supplement-import-review-view.js';
import fs from 'node:fs';import path from 'node:path';import {isDeepStrictEqual} from 'node:util';
import * as domain from '../js/supplement-medication-domain.js';
import {formPresentationCases,formPresentationWitness,nativeSupplementFormTree,type FormRenderer,type FormPresentationCase} from './helpers/supplement-form-witness.js';
const ports=vi.hoisted(()=>({photos:false,calls:[] as unknown[][],mutate:null as ((raw:string)=>string)|null,raw:[] as Array<{component:string,kind:string,raw:string}>}));
function escapeHTML(value:unknown){return value==null?'':String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
function formatSupplementTotal(total:ReturnType<typeof domain.ingredientDailyTotal>){if(!total)return '';const v=total.value%1===0?total.value.toString():total.value.toFixed(2).replace(/\.?0+$/,'');return `${v}${total.unit?' '+total.unit:''}/day`;}
function suppActionAttrs(action:string,extra=''){ports.calls.push(['action',action,extra]);return `data-supp-action="${action}"${extra?` ${extra}`:''}`;}
vi.mock('../js/state.js',()=>({state:{importedData:{supplements:[]}}}));
vi.mock('../js/utils.js',()=>({escapeHTML}));
vi.mock('../js/ai-feature-routing.js',()=>({hasAssistantFeatureProvider:()=>{ports.calls.push(['provider']);return ports.photos;},assistantFeatureSupports:(name:string)=>{ports.calls.push(['supports',name]);return ports.photos;}}));
vi.mock('../js/supplement-action-delegates.js',()=>({suppActionAttrs}));
vi.mock('../js/supplement-impact.js',()=>({ingredientDailyTotal:domain.ingredientDailyTotal,formatSupplementTotal}));
vi.mock('../js/supplement-medication-domain.js',async importActual=>({...await importActual<typeof domain>(),localDateKey:()=> '2024-04-15'}));
vi.mock('../js/components/SupplementIngredientRow.svelte.html.js',async importActual=>{const actual=await importActual<typeof import('../js/components/SupplementIngredientRow.svelte.html.js')>();return {renderHTML:(props:Parameters<typeof actual.renderHTML>[0])=>{const raw=actual.renderHTML(props);ports.raw.push({component:'SupplementIngredientRow',kind:props.kind,raw});if(process.env.SUPPLEMENT_FORM_RAW_DIR){fs.mkdirSync(process.env.SUPPLEMENT_FORM_RAW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.SUPPLEMENT_FORM_RAW_DIR,'compiled-'+ports.raw.length+'.json'),JSON.stringify(ports.raw.at(-1),null,2));}return ports.mutate?ports.mutate(raw):raw;}};});
vi.mock('../js/components/SupplementPeriodRow.svelte.html.js',async importActual=>{const actual=await importActual<typeof import('../js/components/SupplementPeriodRow.svelte.html.js')>();return {renderHTML:(props:Parameters<typeof actual.renderHTML>[0])=>{const raw=actual.renderHTML(props);ports.raw.push({component:'SupplementPeriodRow',kind:props.kind,raw});if(process.env.SUPPLEMENT_FORM_RAW_DIR){fs.mkdirSync(process.env.SUPPLEMENT_FORM_RAW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.SUPPLEMENT_FORM_RAW_DIR,'compiled-'+ports.raw.length+'.json'),JSON.stringify(ports.raw.at(-1),null,2));}return ports.mutate?ports.mutate(raw):raw;}};});
vi.mock('../js/components/SupplementQualityRow.svelte.html.js',async importActual=>{const actual=await importActual<typeof import('../js/components/SupplementQualityRow.svelte.html.js')>();return {renderHTML:(props:Parameters<typeof actual.renderHTML>[0])=>{const raw=actual.renderHTML(props);ports.raw.push({component:'SupplementQualityRow',kind:props.kind,raw});if(process.env.SUPPLEMENT_FORM_RAW_DIR){fs.mkdirSync(process.env.SUPPLEMENT_FORM_RAW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.SUPPLEMENT_FORM_RAW_DIR,'compiled-'+ports.raw.length+'.json'),JSON.stringify(ports.raw.at(-1),null,2));}return ports.mutate?ports.mutate(raw):raw;}};});
vi.mock('../js/components/SupplementForm.svelte.html.js',async importActual=>{const actual=await importActual<typeof import('../js/components/SupplementForm.svelte.html.js')>();return {renderHTML:(props:Parameters<typeof actual.renderHTML>[0])=>{const raw=actual.renderHTML(props);ports.raw.push({component:'SupplementForm',kind:props.kind,raw});if(process.env.SUPPLEMENT_FORM_RAW_DIR){fs.mkdirSync(process.env.SUPPLEMENT_FORM_RAW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.SUPPLEMENT_FORM_RAW_DIR,'compiled-'+ports.raw.length+'.json'),JSON.stringify(ports.raw.at(-1),null,2));}return ports.mutate?ports.mutate(raw):raw;}};});
import * as candidate from '../js/supplement-form-ui.js';
import * as currentPresentation from '../js/supplement-form-presentation.js';

// Retired private-codec controls remain executable historical tests. These pinned
// procedures never enter production; current genuine acceptance is tested below.
const historicalSource: {anchors:string;presentation:string;ui:string} = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/supplement-form-historical-codec.json'),'utf8'));
expect(createHash('sha256').update(historicalSource.anchors+historicalSource.presentation+historicalSource.ui).digest('hex')).toBe('51017798a15244771cfa592f1fec4776a03539f4a53cced9a00bb76bc42a6a6d');
function eraseImports(source:string):string {
  return stripTypeScriptTypes(source).replace(/^import[\s\S]*?;\r?\n/gm,'').replace(/^export /gm,'');
}
const historicalCompiled = `
function SupplementIngredientRow(props) { return mutateHistorical(compilerReceipts[props.kind].raw); }
function SupplementPeriodRow(props) { return mutateHistorical(compilerReceipts[props.kind].raw); }
function SupplementQualityRow(props) { return mutateHistorical(compilerReceipts[props.kind].raw); }
function SupplementForm(props) { return mutateHistorical(compilerReceipts[props.kind].raw); }
`;
const historical:unknown=vm.runInNewContext(eraseImports(historicalSource.anchors)+historicalCompiled+eraseImports(historicalSource.presentation)+eraseImports(historicalSource.ui)+'\n({renderSupplementUnitOption,renderSupplementIngredient,renderSupplementPeriod,renderSupplementDoseSummary,renderSupplementQuality,renderSupplementCategoryOption,renderSupplementForm,renderSupplementPhotoControls,renderSupplementChangeDose,renderSupplementScheduleOption,renderSupplementRouteOption,renderSupplementEvidenceScopeOption,renderSupplementPauseStop,renderSupplementRestart,renderSupplementDeleteRecord,ingredientRowHtml,periodRowHtml,qualityTestRowHtml,suppFormHtml})', {
  ...domain,...quality,...draft,document,HTMLInputElement,HTMLSelectElement,HTMLTextAreaElement,
  state:{importedData:{supplements:[]}},escapeHTML,formatSupplementTotal,suppActionAttrs,
  hasAssistantFeatureProvider:()=>{ports.calls.push(['provider']);return ports.photos;},
  assistantFeatureSupports:(name:string)=>{ports.calls.push(['supports',name]);return ports.photos;},
  mutateHistorical:(raw:string)=>ports.mutate?ports.mutate(raw):raw,
});
function historicalString(name:string,args:readonly unknown[]):string {
  if(historical===null||typeof historical!=='object')throw new Error('Historical renderer missing');
  const renderer:unknown=Reflect.get(historical,name);
  if(typeof renderer!=='function')throw new Error('Historical renderer missing '+name);
  const result:unknown=renderer(...args);
  if(typeof result!=='string')throw new Error('Historical renderer did not return text');
  return result;
}
const historicalCandidate:FormRenderer={
  ingredientRowHtml:(...args)=>historicalString('ingredientRowHtml',args),
  periodRowHtml:(...args)=>historicalString('periodRowHtml',args),
  qualityTestRowHtml:(...args)=>historicalString('qualityTestRowHtml',args),
  suppFormHtml:(...args)=>historicalString('suppFormHtml',args),
};
const presentation={renderSupplementUnitOption:(view:object)=>historicalString('renderSupplementUnitOption',[view]),renderSupplementIngredient:(view:object)=>historicalString('renderSupplementIngredient',[view]),renderSupplementPeriod:(view:object)=>historicalString('renderSupplementPeriod',[view]),renderSupplementDoseSummary:(view:object)=>historicalString('renderSupplementDoseSummary',[view]),renderSupplementQuality:(view:object)=>historicalString('renderSupplementQuality',[view]),renderSupplementCategoryOption:(view:object)=>historicalString('renderSupplementCategoryOption',[view]),renderSupplementForm:(view:object)=>historicalString('renderSupplementForm',[view]),renderSupplementPhotoControls:(view:object)=>historicalString('renderSupplementPhotoControls',[view]),renderSupplementChangeDose:(view:object)=>historicalString('renderSupplementChangeDose',[view]),renderSupplementScheduleOption:(view:object)=>historicalString('renderSupplementScheduleOption',[view]),renderSupplementRouteOption:(view:object)=>historicalString('renderSupplementRouteOption',[view]),renderSupplementEvidenceScopeOption:(view:object)=>historicalString('renderSupplementEvidenceScopeOption',[view]),renderSupplementPauseStop:(view:object)=>historicalString('renderSupplementPauseStop',[view]),renderSupplementRestart:(view:object)=>historicalString('renderSupplementRestart',[view]),renderSupplementDeleteRecord:(view:object)=>historicalString('renderSupplementDeleteRecord',[view])};

const originals=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/supplement-form-original.json'),'utf8')) as Record<FormPresentationCase,{html:string|null;tree:unknown;trace:string[];calls:unknown[][];error:unknown}>;
function observe(kind:FormPresentationCase,renderer:FormRenderer){const fixture=formPresentationWitness(kind);ports.photos=fixture.photos;ports.calls=[];let html:string|null=null,error:unknown=null;try{html=fixture.render(renderer);}catch(e){error=e!==null&&typeof e==='object'&&'name' in e&&'message' in e?{name:e.name,message:e.message}:String(e);}
 const raw={kind,html,trace:fixture.trace,calls:ports.calls,error};
 // Genuine returned string is written before parser/facade comparison gates.
 if(process.env.SUPPLEMENT_FORM_RAW_DIR){fs.mkdirSync(process.env.SUPPLEMENT_FORM_RAW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.SUPPLEMENT_FORM_RAW_DIR,kind+'-'+'candidate'+'.json'),JSON.stringify(raw,null,2));}
 const tree=html===null?null:nativeSupplementFormTree(html,document);
 if(process.env.SUPPLEMENT_FORM_RAW_DIR)fs.writeFileSync(path.join(process.env.SUPPLEMENT_FORM_RAW_DIR,kind+'-'+'candidate'+'-tree.json'),JSON.stringify(tree,null,2));
 return {...raw,tree};}
describe('complete Supplement form authored ownership',()=>{
 it.each(formPresentationCases)('matches original full ordered native tree/defaults and getter/helper/throw chronology: %s',kind=>{const before=originals[kind],after=observe(kind,historicalCandidate);expect(after.html,'complete original raw string '+kind).toBe(before.html);expect(isDeepStrictEqual(after.tree,before.tree),'complete native tree '+kind+' (raw retained)').toBe(true);expect(after.trace).toEqual(before.trace);expect(after.calls).toEqual(before.calls);expect(after.error).toEqual(before.error);});
 it('preserves literal private tokens and local review comments without rescanning child data',()=>{const html=historicalCandidate.suppFormHtml(-1,{name:'getbased-supplement-form-name-private',ingredients:[],periods:[],schedule:{mode:'daily'}},'<!--getbased-supplement-form-name-private-->');expect(html).toContain('<!--getbased-supplement-form-name-private-->');expect(document.createRange().createContextualFragment(html).querySelector('#supp-name')?.getAttribute('value')).toBe('getbased-supplement-form-name-private');});
 it('retains complete no-handler ownership and every private component branch',()=>{for(const name of ['SupplementIngredientRow','SupplementPeriodRow','SupplementQualityRow','SupplementForm']){const source=fs.readFileSync(path.join(__dirname,'../js/components/'+name+'.svelte'),'utf8');expect(source).not.toMatch(/\son[a-z]+\s*=|\bon:[a-z]+|\{on[a-z]+\}/);expect(source).not.toContain('{@html');}});
 const brokenSkeletons=[
  ['static visible label',(raw:string)=>raw.replace('title="Remove"','title="Foreign"')],
  ['static control contract',(raw:string)=>raw.replace('inputmode="decimal"','inputmode="numeric"')],
  ['root envelope',(raw:string)=>raw.replace('<!--[-->','<!--foreign-->')],
  ['branch marker',(raw:string)=>raw.replace('<!--[1-->','<!--[99-->')],
  ['closing envelope',(raw:string)=>raw.slice(0,-1)],
  ['interior comment',(raw:string)=>raw.replace('<div class="supp-ingredient-row"','<!--foreign--><div class="supp-ingredient-row"')],
  ['rich-select marker',(raw:string)=>raw.replace('</select>','<!></select>')],
  ['missing action receiver',(raw:string)=>raw.replace('data-supplement-private-removeaction','data-foreign-removeaction')],
  ['duplicate action receiver',(raw:string)=>raw.replace(/(<button class="supp-ing-remove"[^>]*>)/,'$1</button>$1')],
  ['missing option list',(raw:string)=>raw.replace('data-supplement-private-options','data-foreign-options')],
 ] as const;
 it.each(brokenSkeletons)('rejects mutated private compiler skeleton: %s',(_name,mutate)=>{ports.mutate=raw=>raw.includes('class="supp-ingredient-row"')?mutate(raw):raw;try{expect(()=>historicalCandidate.ingredientRowHtml(0,'Mg','25 mg')).toThrow(/Unqualified/);}finally{ports.mutate=null;}});
 it('detects substantive native tree/default corruption without accepting compiler aliases',()=>{const raw=candidate.qualityTestRowHtml(0,{analyte:'Lead',resultText:'ND',includeInAIContext:true});const expected=nativeSupplementFormTree(raw,document);for(const altered of [raw.replace('value="Lead"','value="Arsenic"'),raw.replace(' checked',''),raw.replace('data-supp-action="remove-quality-test"','data-supp-action="save"'),raw+'<!--unknown-->',raw+'<input>',raw.replace('aria-label="Laboratory result category"','aria-label="Wrong"')])expect(isDeepStrictEqual(nativeSupplementFormTree(altered,document),expected)).toBe(false);});
 it('keeps native form defaults and original WeakMap dirty tracking after actual authored insertion',()=>{document.body.innerHTML=candidate.suppFormHtml(-1,null);candidate.rememberSupplementForm();expect(candidate.supplementFormHasChanges()).toBe(false);expect(candidate.supplementFieldsChanged('#supp-name')).toBe(false);const input=document.querySelector<HTMLInputElement>('#supp-name')!;input.value='New supplement';expect(candidate.supplementFormHasChanges()).toBe(true);expect(candidate.supplementFieldsChanged('#supp-name')).toBe(true);document.body.innerHTML='';});
 it('keeps original custom unit focus and daily-total update on authored controls',()=>{document.body.innerHTML='<input id="supp-times" value="2">'+candidate.ingredientRowHtml(0,'Mg','25 mg');const select=document.querySelector<HTMLSelectElement>('.supp-ing-unit')!;select.value='__custom__';candidate.updateIngredientUnit(select);const custom=document.querySelector<HTMLInputElement>('.supp-ing-unit-custom')!;expect(custom.hidden).toBe(false);expect(document.activeElement).toBe(custom);custom.value='mg';candidate.updateIngTotal(select);expect(document.querySelector('.supp-ing-total')!.textContent).toBe('50 mg/day');document.body.innerHTML='';});
});

// Malformed-object casts are confined to the test adapter; every valid view is compiler-checked.
function preparedCase<T extends object>(name:string,render:(view:T)=>string,view:T){
 return {name,view,render:(input:object)=>render(input as T)};
}
const preparedBranches=[
  preparedCase("unitOption",presentation.renderSupplementUnitOption,{value: "prepared-value", selected: "prepared-selected", label: "prepared-label"}),
  preparedCase("ingredient",presentation.renderSupplementIngredient,{index: "prepared-index", originalIndex: "prepared-originalIndex", name: "prepared-name", amount: "prepared-amount", unitOptions: "prepared-unitOptions", otherSelected: "prepared-otherSelected", customUnit: "prepared-customUnit", customHidden: "prepared-customHidden", timesPerDay: "prepared-timesPerDay", dailyTotal: "prepared-dailyTotal", removeAction: "prepared-removeAction"}),
  preparedCase("period",presentation.renderSupplementPeriod,{index: "prepared-index", originalIndex: "prepared-originalIndex", start: "prepared-start", end: "prepared-end", dose: "prepared-dose", useDoseAction: "prepared-useDoseAction", doseSummary: "prepared-doseSummary", removeAction: "prepared-removeAction", removeStyle: "prepared-removeStyle"}),
  preparedCase("doseSummary",presentation.renderSupplementDoseSummary,{text: "prepared-text"}),
  preparedCase("quality",presentation.renderSupplementQuality,{index: "prepared-index", originalIndex: "prepared-originalIndex", importIndex: "prepared-importIndex", categories: "prepared-categories", analyte: "prepared-analyte", result: "prepared-result", unit: "prepared-unit", basis: "prepared-basis", aiChecked: "prepared-aiChecked", removeAction: "prepared-removeAction"}),
  preparedCase("categoryOption",presentation.renderSupplementCategoryOption,{value: "prepared-value", selected: "prepared-selected", label: "prepared-label"}),
  preparedCase("form",presentation.renderSupplementForm,{editIndex: "prepared-editIndex", sourceUrl: "prepared-sourceUrl", fetchAction: "prepared-fetchAction", photoControls: "prepared-photoControls", importReview: "prepared-importReview", name: "prepared-name", supplementSelected: "prepared-supplementSelected", medicationSelected: "prepared-medicationSelected", servingSize: "prepared-servingSize", servingUnit: "prepared-servingUnit", timesPerDay: "prepared-timesPerDay", ingredients: "prepared-ingredients", addIngredientAction: "prepared-addIngredientAction", periods: "prepared-periods", changeDose: "prepared-changeDose", addPeriodAction: "prepared-addPeriodAction", directions: "prepared-directions", scheduleOptions: "prepared-scheduleOptions", routeOptions: "prepared-routeOptions", maxPerDay: "prepared-maxPerDay", scheduleDetails: "prepared-scheduleDetails", brand: "prepared-brand", genericName: "prepared-genericName", dosageForm: "prepared-dosageForm", labelDirections: "prepared-labelDirections", inactiveIngredients: "prepared-inactiveIngredients", evidenceScopeOptions: "prepared-evidenceScopeOptions", qualityTests: "prepared-qualityTests", addQualityAction: "prepared-addQualityAction", reason: "prepared-reason", prescriber: "prepared-prescriber", endReason: "prepared-endReason", note: "prepared-note", saveAction: "prepared-saveAction", saveLabel: "prepared-saveLabel", pauseStop: "prepared-pauseStop", restart: "prepared-restart", deleteRecord: "prepared-deleteRecord", cancelAction: "prepared-cancelAction"}),
  preparedCase("photoControls",presentation.renderSupplementPhotoControls,{action: "prepared-action"}),
  preparedCase("changeDose",presentation.renderSupplementChangeDose,{action: "prepared-action"}),
  preparedCase("scheduleOption",presentation.renderSupplementScheduleOption,{value: "prepared-value", selected: "prepared-selected", label: "prepared-label"}),
  preparedCase("routeOption",presentation.renderSupplementRouteOption,{value: "prepared-value", selected: "prepared-selected", label: "prepared-label"}),
  preparedCase("evidenceScopeOption",presentation.renderSupplementEvidenceScopeOption,{value: "prepared-value", selected: "prepared-selected", label: "prepared-label"}),
  preparedCase("pauseStop",presentation.renderSupplementPauseStop,{pauseAction: "prepared-pauseAction", stopAction: "prepared-stopAction"}),
  preparedCase("restart",presentation.renderSupplementRestart,{action: "prepared-action"}),
  preparedCase("deleteRecord",presentation.renderSupplementDeleteRecord,{action: "prepared-action"}),
];
describe('historical Supplement private primitive field schema',()=>{
 it.each(preparedBranches)('accepts reversed plain-object insertion order: $name',({view,render})=>{
  const entries=Object.entries(view),reversed=Object.fromEntries([...entries].reverse());
  expect(Object.keys(reversed)).toEqual(Object.keys(view).reverse());
  const expected=render(view),actual=render(reversed);
  expect(actual).toBe(expected);
  expect(nativeSupplementFormTree(actual,document)).toEqual(nativeSupplementFormTree(expected,document));
 });
 it.each(preparedBranches)('rejects missing prepared field: $name',({view,render})=>{
  const missing=Object.fromEntries(Object.entries(view).slice(1));
  expect(()=>render(missing)).toThrow('Unqualified supplement field schema');
 });
 it.each(preparedBranches)('rejects extra prepared field: $name',({view,render})=>{
  expect(()=>render({...view,foreign:'value'})).toThrow('Unqualified supplement field schema');
 });
 it.each(preparedBranches)('rejects non-string prepared value: $name',({view,render})=>{
  const field=Object.keys(view)[0]!;
  expect(()=>render({...view,[field]:42})).toThrow('Supplement slot must be prepared text');
 });
 it.each(preparedBranches)('rejects accessor prepared value without evaluating it: $name',({view,render})=>{
  const field=Object.keys(view)[0]!,calls:string[]=[],accessor={...view};
  Object.defineProperty(accessor,field,{enumerable:true,get(){calls.push(field);return 'value';}});
  expect(()=>render(accessor)).toThrow('Supplement slot must be prepared text');
  expect(calls).toEqual([]);
 });
 it.each(preparedBranches)('rejects a hidden or symbol extra field: $name',({view,render})=>{
  const hidden={...view};Object.defineProperty(hidden,'foreign',{value:'value',enumerable:false});
  expect(()=>render(hidden)).toThrow('Unqualified supplement field schema');
  expect(()=>render({...view,[Symbol('foreign')]:'value'})).toThrow('Unqualified supplement field schema');
 });
});


// The old witness injected arbitrary HTML into an internal third argument. Core
// Form composition now takes a typed review child. For these same30 native
// field/domain witnesses omit that synthetic injection equally in both owners;
// preserve their fields, native defaults, source reads, actions and throw order.
const nativeForm:FormRenderer={...historicalCandidate,suppFormHtml:(index,supplement)=>historicalCandidate.suppFormHtml(index,supplement)};
const genuineForm:FormRenderer={
  ingredientRowHtml:candidate.ingredientRowHtml,periodRowHtml:candidate.periodRowHtml,
  qualityTestRowHtml:candidate.qualityTestRowHtml,
  suppFormHtml:(index,supplement)=>candidate.suppFormHtml(index,supplement),
};
function genuineTree(html:string|null):unknown {
  if(html===null)return null;
  const host=document.createElement('template');host.innerHTML=html;
  const anchors=new Set(['','[',']','[0','[1','[2','[3','[4','[5','[6','[7','[8','[-1','[!']);
  const walker=document.createTreeWalker(host.content,NodeFilter.SHOW_COMMENT),removed:Node[]=[];
  for(let node=walker.nextNode();node;node=walker.nextNode())if(anchors.has(node.nodeValue??''))removed.push(node);
  for(const node of removed)node.parentNode?.removeChild(node);host.content.normalize();
  return nativeSupplementFormTree(host.innerHTML,document);
}
describe('current genuine Supplement Form native acceptance',()=>{
  it.each(formPresentationCases)('preserves complete native fields/defaults and getter/helper/throw chronology: %s',kind=>{
    const before=observe(kind,nativeForm),after=observe(kind,genuineForm);
    expect(genuineTree(after.html)).toEqual(genuineTree(before.html));
    expect(after.trace).toEqual(before.trace);expect(after.calls).toEqual(before.calls);expect(after.error).toEqual(before.error);
  });
  it('composes a genuine typed review with escaped text, native selection defaults and delegated actions',()=>{
    ports.photos=false;
    const review:SupplementImportReviewView={applied:false,combined:true,sources:['Source <&'],facts:['Fact <&'],issues:['Issue <&'],showFacts:true,showIssues:true,
      hasIngredients:true,ingredients:[{index:'0',name:'Ingredient <&',amount:'25 mg',source:'Label <&'}],
      showInactive:true,inactive:[{index:'0',name:'Capsule <&'}],showQuality:true,
      quality:[{index:'0',categoryValue:'contaminant',category:'Contaminant',analyte:'Lead <&',result:'ND',selected:true}],
      directions:'Direction <&',warnings:'Warning <&',editAction:'Add supplement'};
    const view=candidate.projectSupplementFormView(-1,null,review);
    const html=currentPresentation.renderSupplementForm(view);const host=document.createElement('div');host.innerHTML=html;
    expect(host.querySelector('.supp-import-review-sources')?.textContent).toBe('Source <&');
    expect(host.querySelector('.supp-import-review-facts:not(.supp-import-review-sources)')?.textContent).toBe('Fact <&');
    expect(host.querySelector('script,img')).toBeNull();
    expect([...host.querySelectorAll<HTMLInputElement>('[data-supp-import-kind]')].map(input=>({kind:input.dataset.suppImportKind,index:input.dataset.suppImportIndex,checked:input.checked,defaultChecked:input.defaultChecked}))).toEqual([
      {kind:'ingredient',index:'0',checked:true,defaultChecked:true},{kind:'inactive',index:'0',checked:true,defaultChecked:true},{kind:'quality',index:'0',checked:true,defaultChecked:true},
    ]);
    expect([...host.querySelectorAll('.supp-import-review [data-supp-action]')].map(button=>button.getAttribute('data-supp-action'))).toEqual(['quality-safety-only','apply-import','discard-import']);
    expect(host.querySelector<HTMLInputElement>('#supp-name')?.value).toBe('');
    expect(host.querySelector<HTMLButtonElement>('[data-supp-action="save"]')?.type).toBe('submit');
  });
});
