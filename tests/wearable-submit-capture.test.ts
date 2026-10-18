// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../scripts/native-typescript-ast.js';
const source=fs.readFileSync(path.join(process.cwd(),'js/wearables.ts'),'utf8');
const procedures=withParsedSource(source,'wearables.ts',file=>{
 const names=new Set(['handleWearableFormSubmit','installWearableDelegates']);
 const text=file.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name&&names.has(node.name.text)).map(node=>node.getText(file));
 expect(text).toHaveLength(2);return stripTypeScriptTypes(text.join('\n'),{mode:'strip'});
});
const cleanups:Array<()=>void>=[];afterEach(()=>{for(const cleanup of cleanups.splice(0))cleanup();document.body.replaceChildren();});
function mount(scope='detail',formKind='detail-manual-add',oldBubble=false){
 document.body.innerHTML='<div id="kit-root"><div id="detail-modal"></div><div id="outside"></div></div>';
 const container=document.getElementById('kit-root')!,host=document.getElementById(scope==='detail'?'detail-modal':'outside')!;
 const form=document.createElement('form');form.dataset.wearableForm=formKind;form.dataset.wearableMetric='bp_systolic';form.dataset.wearableKind='bp';host.append(form);
 const saved:Array<[string,string]>=[],kit:Event[]=[];
 const onKit=(event:Event)=>{if(event.defaultPrevented)return;kit.push(event);event.preventDefault();event.stopPropagation();};container.addEventListener('submit',onKit);
 const body=oldBubble?procedures.replace("document.addEventListener('submit', handleWearableFormSubmit, true);","document.addEventListener('submit', handleWearableFormSubmit);"):procedures;
 const install=new Function('document','saveManualEntryFromDetail',`let wearableDelegatesInstalled=false;function handleWearableActionClick(){}function handleWearableActionKeydown(){}${body};return {install:installWearableDelegates,dispose(){document.removeEventListener('click',handleWearableActionClick);document.removeEventListener('keydown',handleWearableActionKeydown);document.removeEventListener('submit',handleWearableFormSubmit,true);document.removeEventListener('submit',handleWearableFormSubmit);}}`)(document,(metric:string,kind:string)=>saved.push([metric,kind])) as {install():void;dispose():void};
 install.install();cleanups.push(()=>{install.dispose();container.removeEventListener('submit',onKit);});return{form,saved,kit,install:install.install};
}
it('runs the actual scoped wearable delegate before the Kit bubbling GET-form interceptor',()=>{const current=mount();const event=new Event('submit',{bubbles:true,cancelable:true});expect(current.form.dispatchEvent(event)).toBe(false);expect(current.saved).toEqual([['bp_systolic','bp']]);expect(current.kit).toHaveLength(0);});
it('retains idempotent delegate installation and one save per submit',()=>{const current=mount();current.install();current.install();current.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));expect(current.saved).toEqual([['bp_systolic','bp']]);expect(current.kit).toHaveLength(0);});
it.each([['outside','detail-manual-add'],['detail','unrelated']] as const)('leaves unrelated form scope %s/%s to its existing owner', (scope,kind)=>{const current=mount(scope,kind);current.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));expect(current.saved).toHaveLength(0);expect(current.kit).toHaveLength(1);});
it('reproduces the former lost-submit defect with the exact old bubbling registration',()=>{expect(procedures).toContain("document.addEventListener('submit', handleWearableFormSubmit, true);");const old=mount('detail','detail-manual-add',true);old.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));expect(old.saved).toHaveLength(0);expect(old.kit).toHaveLength(1);});
