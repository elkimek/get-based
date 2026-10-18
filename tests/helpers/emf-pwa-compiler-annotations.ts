import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../../scripts/native-typescript-ast.js';
import * as schema from '../../js/schema.js';
import * as constants from '../../js/constants.js';
import * as model from '../../js/emf-model.js';
import * as comparison from '../../js/emf-comparison-presentation.js';
import * as editorPresentation from '../../js/emf-editor-presentation.js';
import {renderEMFInterpretationModal} from '../../js/emf-interpretation-presentation.js';
import {state} from '../../js/state.js';
import {migrateProfileData} from '../../js/profile.js';
import type * as editor from '../../js/emf-editor.js';
import type {PreviewInput} from '../../types/emf-editor.js';
import type {EMFComparisonNativeOracle,EMFComparisonReceipt} from './emf-comparison-pwa-receipt.js';

type Marker=readonly[number[],string|null];
export interface EMFAnnotatedExpectation {readonly raw:string;readonly nativeRaw:string;readonly nativeReceipt:EMFComparisonReceipt;readonly receipt:EMFComparisonReceipt;readonly markers:readonly Marker[];readonly accessibilityChanges:number}
function markerSignature(root:Node,prefix:number[]=[]):Marker[]{return [...root.childNodes].flatMap((child,index)=>{const path=[...prefix,index];return child.nodeType===8?[[path,child.nodeValue]as const]:markerSignature(child,path);});}
function receipt(root:Element):EMFComparisonReceipt {
 const node=(value:Node):unknown=>{if(value.nodeType===1){const element=value as Element;return{type:value.nodeType,name:element.localName,namespace:element.namespaceURI,attributes:[...element.attributes].map(attribute=>[attribute.name,attribute.value]),children:[...element.childNodes].map(node)};}return{type:value.nodeType,text:value.nodeValue};};
 return{children:[...root.childNodes].map(node),actions:[...root.querySelectorAll('[data-emf-action],[data-emf-change-action],[data-emf-interp-action]')].map(element=>({tag:element.localName,attributes:[...element.attributes].map(attribute=>[attribute.name,attribute.value])})),controls:[...root.querySelectorAll('input,textarea,select')].map(element=>{const control=element as HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;return{tag:element.localName,attributes:[...element.attributes].map(attribute=>[attribute.name,attribute.value]),value:control.value,checked:element.localName==='input'?(element as HTMLInputElement).checked:null};})};
}
/** Expected-only annotation transport. The actual PWA observer is unchanged.
 * Candidate comment coordinates/values must match a separate pristine compile
 * for these same props. Only that finite signature is removed on the expected
 * side; exact adjacent text is rejoined without trimming or whitespace changes.
 * The complete native graph remains exact except the three independently
 * reviewed label-to-div non-control headings, guarded by exact text/attributes.
 * Original native receipts/raw remain unchanged and asserted before transport. */
export function qualifyEMFPWACompilerAnnotations(nativeHTML:string,candidateHTML:string,pristineHTML:string):EMFAnnotatedExpectation {
 const dom=new JSDOM('<!doctype html><body></body>');try{
  const box=(html:string)=>{const node=dom.window.document.createElement('main');node.innerHTML=html;return node;};
  const native=box(nativeHTML),candidate=box(candidateHTML),pristine=box(pristineHTML),markers=markerSignature(pristine);
  const nativeRaw=native.innerHTML,nativeReceipt=receipt(native),headings=[...native.querySelectorAll('label.emf-tags-label')];
  assert.ok(headings.length===0||headings.length===3,'Only the three reviewed non-control EMF tag headings');
  if(headings.length){assert.deepEqual(headings.map(node=>node.textContent),['Sources identified','Mitigations applied','Photos']);for(const label of headings){assert.deepEqual([...label.attributes].map(a=>[a.name,a.value]),[['class','emf-tags-label']]);const heading=dom.window.document.createElement('div');for(const attribute of label.attributes)heading.setAttribute(attribute.name,attribute.value);heading.append(...label.childNodes);label.replaceWith(heading);}}
  assert.equal(markerSignature(native).length,0,'Immutable native EMF state has no compiler comments');
  assert.ok(markers.length>0,'Reviewed genuine EMF owner must contribute compiler annotations');
  for(const[,value]of markers)assert.ok(value!==null&&['','[',']','[0','[1','[2','[-1'].includes(value),'Only reviewed EMF branch/fragment comment values');
  assert.deepEqual(markerSignature(candidate),markers,'Exact same-props pristine compiler comment coordinates and values');
  const annotatedReceipt=receipt(candidate),raw=candidate.innerHTML;
  const remove=(node:Node)=>{for(const child of [...node.childNodes]){if(child.nodeType===8)child.remove();else remove(child);}};remove(candidate);candidate.normalize();
  assert.deepEqual(receipt(candidate),receipt(native),'Complete ordered native EMF DOM, attributes, whitespace text, actions and control defaults');
  assert.equal(candidate.innerHTML,native.innerHTML,'Exact complete native browser serialization after qualified inert comments only');
  return{raw,nativeRaw,nativeReceipt,receipt:annotatedReceipt,markers,accessibilityChanges:headings.length};
 }finally{dom.window.close();}
}
/** This is the existing source-qualified native-owner VM pattern, used only to
 * obtain same-input pristine SSR annotations. Native correctness is independently
 * proved above against the immutable oracle, never against a live browser. */
function sourceOwner(){
 const source=readFileSync('js/emf-editor.ts','utf8');const declarations=withParsedSource(source,'emf-editor.ts',ast=>ast.statements.filter(node=>!ts.isImportDeclaration(node)).map(node=>node.getText(ast)).join('\n'));
 const program=stripTypeScriptTypes(declarations.replace(/\bexport /g,''));
 return vm.runInNewContext(program+'\n;({renderEMFEditor,configureEMFEditor,emfEditorState,projectImportPreview})',{...schema,...constants,...model,...comparison,...editorPresentation,text:editorPresentation.emfEditorText,attr:editorPresentation.emfEditorAttribute,document:{getElementById:()=>null}}) as Pick<typeof editor,'renderEMFEditor'|'configureEMFEditor'|'emfEditorState'>&{projectImportPreview(parsed:PreviewInput):editorPresentation.EMFImportPreviewView};
}
export function buildEMFPWAAnnotatedExpectations(oracle:EMFComparisonNativeOracle,tooltip:{desktop:{raw:string};recentTouch:{raw:string}}):Record<string,EMFAnnotatedExpectation> {
 const before=state.importedData,seed=migrateProfileData(structuredClone(oracle.seed));assert.deepEqual(seed,oracle.seed);state.importedData=seed;
 try{
  const source=sourceOwner(),out:Record<string,EMFAnnotatedExpectation>={};source.configureEMFEditor({hasAIProvider:()=>true});
  for(const[name,native]of Object.entries(oracle.raw)){
   if(name==='import-preview'||name==='cached-interpretation')continue;
   source.emfEditorState.editingAssessmentId=name==='editor-after-bedroom'||name==='editor-after-study'?'emf-after':null;
   source.emfEditorState.activeRoomIdx=name==='editor-after-study'?1:0;
   source.emfEditorState.compareMode=name.startsWith('comparison');let pristine='';source.renderEMFEditor({set innerHTML(value:string){pristine=value;}});
   out[name]=qualifyEMFPWACompilerAnnotations(native,pristine,pristine);
  }
  const preview=editorPresentation.renderEMFImportPreviewPresentation(source.projectImportPreview(oracle.parsedPreview));
  out['import-preview-recentTouch']=qualifyEMFPWACompilerAnnotations(tooltip.recentTouch.raw,preview,preview);
  const dom=new JSDOM('<!doctype html><body></body>');try{
   const native=dom.window.document.createElement('main');native.innerHTML=tooltip.recentTouch.raw;const button=native.querySelector('.context-back-btn');assert.ok(button);assert.equal(button.getAttribute('title'),'Back to EMF assessments');button.removeAttribute('title');button.setAttribute('aria-describedby','app-tooltip');assert.equal(native.innerHTML,tooltip.desktop.raw,'Exact independently frozen desktop tooltip effect');
   const candidate=dom.window.document.createElement('main');candidate.innerHTML=preview;const current=candidate.querySelector('.context-back-btn');assert.ok(current);assert.equal(current.getAttribute('title'),'Back to EMF assessments');current.removeAttribute('title');current.setAttribute('aria-describedby','app-tooltip');out['import-preview-desktop']=qualifyEMFPWACompilerAnnotations(tooltip.desktop.raw,candidate.innerHTML,candidate.innerHTML);
   native.innerHTML=oracle.raw['cached-interpretation']!;const title=native.querySelector('h3'),body=native.querySelector('#emf-interp-body'),meta=native.querySelector('#emf-interp-meta');assert.ok(title&&body&&meta);const bodyPrefix='\n      ',bodySuffix='\n    ',metaPrefix='\n        ',metaSuffix='\n      ';assert.ok(body.innerHTML.startsWith(bodyPrefix)&&body.innerHTML.endsWith(bodySuffix));assert.ok(meta.textContent?.startsWith(metaPrefix)&&meta.textContent.endsWith(metaSuffix));
   const pristine=renderEMFInterpretationModal(title.textContent,true,()=>({kind:'markdown',sanitizedHTML:body.innerHTML.slice(bodyPrefix.length,-bodySuffix.length)}),()=>meta.textContent!.slice(metaPrefix.length,-metaSuffix.length));
   out['cached-interpretation']=qualifyEMFPWACompilerAnnotations(oracle.raw['cached-interpretation']!,pristine,pristine);
  }finally{dom.window.close();}
  assert.deepEqual(state.importedData,oracle.seed,'Pristine annotation qualification cannot mutate seed data');return out;
 }finally{state.importedData=before;}
}
