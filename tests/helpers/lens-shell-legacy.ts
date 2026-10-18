/** Historical raw-HTML fixture API, retained only to keep the original receipts/assertions. */
import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {state} from '../../js/state.js';
import {getWidgetHeaderDescription} from '../../js/dashboard-widget-copy.js';
import {actionAttributes} from '../../js/action-attributes.js';
import {profileStorageKey} from '../../js/profile.js';
import {renderHTML as renderDashboardToggle} from '../../js/components/LensDashboardToggle.svelte.html.js';
interface LegacyLens {
 configureLensPageShell:typeof import('../../js/lens-page-shell.js')['configureLensPageShell'];
 renderLensHeader:(...args:unknown[])=>string;
 renderLensWidget:(...args:unknown[])=>string;
 renderLensPageWidgets:(...args:unknown[])=>string;
}
function withoutModuleSyntax(source:string):string{return source.replace(/^import[\s\S]*?;\n/gm,'').replace(/\bexport /g,'');}
export async function evaluateLegacyLensShell():Promise<LegacyLens>{
 const root=path.resolve('tests/fixtures/lens-shell-legacy');
 const read=(name:string)=>fs.readFile(path.join(root,name),'utf8');
 const [model,controller,renderer]=await Promise.all([read('lens-shell-presentation.js.txt'),read('lens-page-shell.js.txt'),read('LensShellPresentation.svelte.html.js.txt')]);
 const classes=pathToFileURL(path.resolve('js/lens-shell-classes.js')).href;
 const qualified=renderer.replaceAll('"../lens-shell-classes.js"',JSON.stringify(classes));
 const module=await import('data:text/javascript;base64,'+Buffer.from(qualified).toString('base64')) as {renderHTML:(props:unknown)=>string};
 return vm.runInNewContext(withoutModuleSyntax(model)+'\n'+withoutModuleSyntax(controller)+'\n;({configureLensPageShell,renderLensHeader,renderLensWidget,renderLensPageWidgets});',{
  state,getWidgetHeaderDescription,actionAttributes,profileStorageKey,renderDashboardToggle,renderShell:module.renderHTML,
  openEMFAssessmentEditor:()=>{},triggerContextCardDNAFilePickerRuntime:()=>{},getDnaModuleFunction:()=>null,getSettingsModuleFunction:()=>null,
  document:{addEventListener:()=>{}},Element:typeof Element==='undefined'?undefined:Element,HTMLElement:typeof HTMLElement==='undefined'?undefined:HTMLElement,
  localStorage:typeof localStorage==='undefined'?undefined:localStorage,
 }) as LegacyLens;
}
