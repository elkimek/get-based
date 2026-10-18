import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
const read=(path:string)=>readFileSync(path,'utf8');
const original=read('tests/fixtures/lens-page-shell-core-original.ts.txt');
const originalSHA='6ef936785471e20650f249188e90ecd218dbbcd1b1edbfcbc67e29bb7a75bdea';
function part(start:string,end:string):string{
  expect(original.split(start)).toHaveLength(2);const offset=original.indexOf(start),stop=original.indexOf(end,offset);expect(stop).toBeGreaterThan(offset);return original.slice(offset,stop).trimEnd()+'\n';
}
const header=part('export function renderLensHeader(','\nfunction lensPageOrderStorageKey(');
const grid=part('export function renderLensPageWidgets(','\nexport function moveLensPageWidget(');
const toggle=part('export function renderLensDashboardToggle(','\nfunction lensWidgetChromeFacts(');
const privateWidget=part('function lensWidgetView(','\nexport function renderLensWidget(');
const widget=part('export function renderLensWidget(','\ninstallLensPageShellDelegates();');
function expectedCore():string{
  expect(createHash('sha256').update(original).digest('hex')).toBe(originalSHA);
  let expected=original;
  const replacements=[
    ['// lens-page-shell.ts — shared lens page chrome, ordering, and widget helpers','// lens-page-shell-core.ts — shared lens state, ordering, delegates and typed chrome'],
    ["import {renderHTML as renderShell} from './components/LensShellPresentation.svelte.html.js';\n",''],
    ["import {renderHTML as renderDashboardToggle} from './components/LensDashboardToggle.svelte.html.js';\n",''],
    ['projectLensHeader, projectLensWidget, projectLensWidgetChrome,','projectLensWidgetChrome,'],
    ...[header,grid,toggle,privateWidget,widget].map(value=>[value+'\n',''] as const),
    ['function orderLensPageWidgets<','export function orderLensPageWidgets<'],
    ['function lensWidgetChromeFacts(','export function lensWidgetChromeFacts('],
  ] as const;
  for(const [before,after]of replacements){expect(expected.split(before)).toHaveLength(2);expected=expected.replace(before,after);}
  return expected;
}
function expectedFacade():string{
  return `// lens-page-shell.ts — synchronous compatibility rendering over the shared core.
import {renderHTML as renderShell} from './components/LensShellPresentation.svelte.html.js';
import {projectLensHeader, projectLensWidget} from './lens-shell-presentation.js';
import {renderHTML as renderDashboardToggle} from './components/LensDashboardToggle.svelte.html.js';
import {getLensDashboardToggleView, orderLensPageWidgets, lensWidgetChromeFacts} from './lens-page-shell-core.js';
import type {LensPageWidget, LensWidgetOptions} from './lens-page-shell-core.js';
export {configureLensPageShell, lensPageActionAttrs, getLensPageWidgetOrder, moveLensPageWidget,
  getLensDashboardToggleView, getLensWidgetChrome, getLensContentGrid} from './lens-page-shell-core.js';
export type {LensDashboardToggleView, LensPageShellDeps, LensWidgetOptions, LensPageWidget,
  LensContentWidget, LensContentGrid} from './lens-page-shell-core.js';

`+[header,grid,toggle,privateWidget,widget].join('\n');
}
const qualify=(core:string,facade:string)=>{expect(core).toBe(expectedCore());expect(facade).toBe(expectedFacade());};
it('extracts the exact original shared controller and preserves every compatibility renderer body without another state owner',()=>{
  qualify(read('js/lens-page-shell-core.ts'),read('js/lens-page-shell.ts'));
  expect(read('js/lens-page-shell-core.ts')).not.toMatch(/svelte|renderHTML|renderShell|renderDashboardToggle/);
});
it('keeps all actual core-only production consumers off the compatibility render umbrella',()=>{
  const consumers=['app-shell-hooks','dashboard-view-composition','views','biology-scores','biology-page-view','biology-score-render','light-page-view','lens-pages','recommendation-page-presentation','lens-data-page-presentation','biology-card-presentation','biology-overview-presentation','biology-summary-presentation','light-page-presentation','lens-shell-presentation'];
  for(const name of consumers){const source=read('js/'+name+'.ts');expect(source,name).toContain("'./lens-page-shell-core.js'");expect(source,name).not.toContain("'./lens-page-shell.js'");}
});
it('preserves exact public Svelte owners and their SDK branch coordinates',()=>{
  const pins={LensShellPresentation:'2d64f942e3557b832dbc707f71d0fd5602eec4b8f68dc5a2f23c3474478e209e',LensPageWidget:'849b9f7313d3b85979d9ab42efd273c1c865f16f996db000d246921494ab21c6',LensWidgetBody:'2f1cdf2f3b6a93c427f0cb1893e9c853f2e1b29363d514cfe217f47c11183560',LensWidgetFrame:'6c74d318197ff0d21ee6d86ceddec086316d5d19dbd604b57d8878e0c9ce4fdf',LensWidgetTools:'a66b5f9e7c25352bb8873d202dd3898ac4731a14c46229415dd33f1f4dddeab7'};
  for(const [name,sha]of Object.entries(pins))expect(createHash('sha256').update(read('js/components/'+name+'.svelte')).digest('hex'),name).toBe(sha);
});
it.each([
  ['eager renderer import',(source:string)=>"import {renderHTML} from './components/LensShellPresentation.svelte.html.js';\n"+source],
  ['different preference key',(source:string)=>source.replace('const LENS_PAGE_ORDER_VERSION = 1','const LENS_PAGE_ORDER_VERSION = 2')],
  ['missing delegated scope',(source:string)=>source.replace('.biology-coherence-hero','')],
  ['missing delegate installation',(source:string)=>source.replace(/\ninstallLensPageShellDelegates\(\);\n$/,'\n')],
  ['extra option read',(source:string)=>source.replace('!!opts.compactScore','!!opts.compactScore || !!opts.compactScore')],
  ['different route fallback',(source:string)=>source.replace("route || state.currentView || ''","route || ''")],
] as const)('rejects core extraction corruption: %s',(_name,mutate)=>{
  const source=read('js/lens-page-shell-core.ts'),changed=mutate(source);expect(changed).not.toBe(source);expect(()=>qualify(changed,read('js/lens-page-shell.ts'))).toThrow();
});
it('rejects a public compatibility dispatcher branch change',()=>{
  const source=read('js/lens-page-shell.ts'),changed=source.replace("kind: 'widget'","kind: 'header'");expect(changed).not.toBe(source);expect(()=>qualify(read('js/lens-page-shell-core.ts'),changed)).toThrow();
});
