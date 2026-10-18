// @vitest-environment node
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {afterAll,expect,it,vi} from 'vitest';
// Match the frozen optimized artifact: Svelte's optional development-only
// sanitized-HTML checksum comment is absent in production. Other test files
// retain their isolated environments and all assertions remain active.
const previousNodeEnv=vi.hoisted(()=>{const value=process.env.NODE_ENV;process.env.NODE_ENV='production';return value;});
afterAll(()=>{if(previousNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNodeEnv;});
import {buildEMFPWAAnnotatedExpectations,qualifyEMFPWACompilerAnnotations} from './helpers/emf-pwa-compiler-annotations.js';
import type {EMFComparisonNativeOracle,EMFComparisonReceipt} from './helpers/emf-comparison-pwa-receipt.js';
const bytes=readFileSync('tests/fixtures/emf-comparison-pwa-native.json'),tooltipBytes=readFileSync('tests/fixtures/emf-preview-tooltip-native.json');
const oracle=JSON.parse(bytes.toString()) as EMFComparisonNativeOracle,tooltip=JSON.parse(tooltipBytes.toString()) as {desktop:{raw:string;receipt:EMFComparisonReceipt};recentTouch:{raw:string;receipt:EMFComparisonReceipt}};
const expected=buildEMFPWAAnnotatedExpectations(oracle,tooltip);
it('qualifies every original EMF state and tooltip branch before adding exact same-props source compiler annotations',()=>{
 expect(Object.keys(expected)).toHaveLength(11);
 for(const[name,row]of Object.entries(expected)){
  const branch=name==='import-preview-desktop'?tooltip.desktop:name==='import-preview-recentTouch'?tooltip.recentTouch:null;
  expect(row.nativeReceipt,name).toEqual(branch?.receipt??oracle.receipts[name]);expect(row.nativeRaw,name).toBe(branch?.raw??oracle.raw[name]);expect(row.markers.length,name).toBeGreaterThan(0);
 }
 expect(expected['editor-collapsed']!.markers).toHaveLength(44);expect(expected['editor-after-bedroom']!.accessibilityChanges).toBe(3);expect(expected['editor-after-study']!.accessibilityChanges).toBe(3);expect(Object.values(expected).filter(row=>row.accessibilityChanges!==0)).toHaveLength(2);
 expect(createHash('sha256').update(readFileSync('tests/fixtures/emf-comparison-pwa-native.json')).digest('hex')).toBe('0e665a93e8aac4019491b38646722747c3c2421cb08a9dd13702addec1a2b6c9');
 expect(createHash('sha256').update(readFileSync('tests/fixtures/emf-preview-tooltip-native.json')).digest('hex')).toBe('434cdd595b76173a7b730273f00394539314e5ff262f51dc858886a89859bcde');
});
const native=oracle.raw['editor-after-bedroom']!,pristine=expected['editor-after-bedroom']!.raw;
function mutate(change:(root:HTMLElement,document:Document)=>void){const dom=new JSDOM('<main></main>');try{const root=dom.window.document.querySelector('main')!;root.innerHTML=pristine;change(root,dom.window.document);return root.innerHTML;}finally{dom.window.close();}}
it.each(['missing element','attribute value','attribute order','exact text','whitespace','control default','namespace','unknown comment','extra known comment','missing comment','comment value','comment coordinate'] as const)('retains original current/native acceptance sensitivity to %s corruption',kind=>{
 const broken=mutate((root,document)=>{
  const field=root.querySelector<HTMLInputElement>('input[data-emf-field="label"]')??root.querySelector<HTMLInputElement>('input[type="text"]')!;
  if(kind==='missing element')root.querySelector('[data-emf-action="add-assessment"]')!.remove();
  if(kind==='attribute value')root.querySelector('[data-emf-action="add-assessment"]')!.setAttribute('data-emf-action','foreign-action');
  if(kind==='attribute order'){const button=root.querySelector('[data-emf-action="add-assessment"]')!,attributes=[...button.attributes];for(const a of attributes)button.removeAttribute(a.name);for(const a of attributes.reverse())button.setAttribute(a.name,a.value);}
  if(kind==='exact text')root.querySelector('h3')!.textContent='Changed assessment';
  if(kind==='whitespace')root.querySelector('h3')!.append(document.createTextNode(' '));
  if(kind==='control default')field.setAttribute('value','Changed literal field');
  if(kind==='namespace'){const old=root.querySelector('h3')!,replacement=document.createElementNS('http://www.w3.org/1998/Math/MathML','math');for(const a of old.attributes)replacement.setAttribute(a.name,a.value);replacement.innerHTML=old.innerHTML;old.replaceWith(replacement);}
  if(kind==='unknown comment')root.append(document.createComment('foreign'));
  if(kind==='extra known comment')root.append(document.createComment('[0'));
  const walk=(node:Node):Comment[]=>[...node.childNodes].flatMap(child=>child.nodeType===8?[child as Comment]:walk(child));const comments=walk(root);
  if(kind==='missing comment')comments[0]!.remove();
  if(kind==='comment value')comments[0]!.data='[2';
  if(kind==='comment coordinate')root.append(comments[0]!);
 });expect(()=>qualifyEMFPWACompilerAnnotations(native,broken,pristine)).toThrow();
});
