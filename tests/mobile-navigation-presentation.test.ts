import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {JSDOM} from 'jsdom';
import {expect,it} from 'vitest';
import {camelCaseActionAttributes} from '../js/action-attributes.js';
import {renderMobileNavigation} from '../js/mobile-navigation-presentation.js';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/mobile-navigation-original.json',import.meta.url),'utf8')) as {source:string};
const native=stripTypeScriptTypes(fixture.source);
const emitted=fs.readFileSync(new URL('../js/mobile-dashboard.js',import.meta.url),'utf8');
const current=emitted.slice(emitted.indexOf('function renderMobileBottomTabs('),emitted.indexOf('function projectMobileDashboardWidgetStack('));
function run(source:string,activeTab:unknown,id:unknown){
 return vm.runInNewContext(source+';renderMobileBottomTabs(activeTab,{id})',{
  activeTab,id,renderMobileNavigation,
  mobileDashboardActionAttrs:(action:unknown,attrs:Record<string,unknown>)=>camelCaseActionAttributes('data-mobile-dashboard-action','mobile-dashboard',action,attrs),
 }) as string;
}
function tree(node:Node):unknown{
 if(node.nodeType===8){expect(['','[',']','[-1','[0','[1','[2']).toContain(node.nodeValue);return null;}
 if(node.nodeType===3)return node.textContent?.trim()?node.textContent:null;
 const el=node as Element;
 return {tag:el.tagName,attributes:[...el.attributes].map(a=>[a.name,a.value]),
  button:el.tagName==='BUTTON'?{type:(el as HTMLButtonElement).type,disabled:(el as HTMLButtonElement).disabled}:null,
  children:[...el.childNodes].map(tree).filter(child=>child!==null)};
}
function nav(html:string){return new JSDOM(html).window.document.querySelector('nav')!;}
function originalTabs(html:string){
 const node=nav(html);
 expect([...node.querySelectorAll('button')].map(button=>button.dataset.mobileDashboardRoute)).toEqual(['dashboard','labs','body','nutrition','supplements','light','insight']);
 node.querySelectorAll('[data-tab="nutrition"],[data-tab="supplements"]').forEach(button=>button.remove());
 const biometrics=node.querySelector('[data-tab="body"]')!;
 expect(biometrics.getAttribute('aria-label')).toBe('Biometrics');
 expect(biometrics.querySelector('small')?.textContent).toBe('Biometrics');
 biometrics.setAttribute('aria-label','Body');biometrics.querySelector('small')!.textContent='Body';
 return node;
}
it.each(['dashboard','labs','body','light','insight','genome',null,{},Symbol('unknown')])('preserves native navigation, SVG geometry and button defaults for %s',active=>{
 const before=nav(run(native,active,'mobile-bottom-tabs')),after=originalTabs(run(current,active,'mobile-bottom-tabs'));
 expect(tree(after)).toEqual(tree(before));
 expect([...after.querySelectorAll('button')].map(button=>button.dataset.mobileDashboardRoute)).toEqual(['dashboard','labs','body','light','insight']);
});
it.each(['',0,null,undefined])('omits optional ID under the same native truthiness rule: %s',id=>{
 expect(tree(originalTabs(run(current,'body',id)))).toEqual(tree(nav(run(native,'body',id))));
});
it('captures a nonprimitive ID exactly once with the native string hint',()=>{
 const before:string[]=[],after:string[]=[];
 const id=(trace:string[])=>({[Symbol.toPrimitive](hint:string){trace.push(hint);return 'id<&';}});
 expect(tree(originalTabs(run(current,'dashboard',id(after))))).toEqual(tree(nav(run(native,'dashboard',id(before)))));
 expect(after).toEqual(['string']);expect(after).toEqual(before);
});
it('retains exceptional Symbol ID conversion',()=>{
 expect(()=>run(native,'dashboard',Symbol('id'))).toThrow('Cannot convert a Symbol value to a string');
 expect(()=>run(current,'dashboard',Symbol('id'))).toThrow('Cannot convert a Symbol value to a string');
});
it('escapes an optional ID rather than creating markup attributes',()=>{
 const id='navigation" onclick="evil()';
 expect(nav(run(native,'dashboard',id)).hasAttribute('onclick')).toBe(true);
 const after=nav(run(current,'dashboard',id));expect(after.getAttribute('id')).toBe(id);expect(after.hasAttribute('onclick')).toBe(false);
});

it('keeps unexpected HTML comments observable',()=>{expect(()=>tree(nav('<nav><!--unexpected--></nav>'))).toThrow();});

it.each(['nutrition','supplements'] as const)('selects the standalone %s route with a labeled native button',route=>{
 const node=nav(run(current,route,'mobile-bottom-tabs'));
 expect(node.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
 const button=node.querySelector<HTMLButtonElement>(`[data-tab="${route}"]`)!;
 expect(button.getAttribute('aria-current')).toBe('page');
 expect(button.dataset.mobileDashboardRoute).toBe(route);
 expect(button.getAttribute('aria-label')).toBe(route==='nutrition'?'Nutrition':'Supplements & Medication');
 expect(button.type).toBe('button');expect(button.querySelector('svg path')).not.toBeNull();
});
