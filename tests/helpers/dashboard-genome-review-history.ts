import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../../scripts/native-typescript-ast.js';
import pins from '../fixtures/migration-review-dashboard-genome/source-pins.json' with {type:'json'};
const archive=path.join(import.meta.dirname,'../fixtures/migration-review-dashboard-genome');
const sha=(source:string)=>createHash('sha256').update(source).digest('hex');
function pinned(name:keyof typeof pins.historical):string {
 const source=readFileSync(path.join(archive,name),'utf8');assert.equal(sha(source),pins.historical[name],'Recovered original historical bytes: '+name);return source;
}
function executable(input:string,typescript=false):{code:string;renderName:string|null}{
 let code=typescript?stripTypeScriptTypes(input):input;
 return withParsedSource(code,'historical-genome.js',source=>{
  const edits:{start:number;end:number}[]=[];let renderName:string|null=null;
  for(const node of source.statements){
   if(ts.isImportDeclaration(node))edits.push({start:node.getStart(source),end:node.end});
   else if(ts.isExportDeclaration(node)){
    if(node.exportClause&&ts.isNamedExports(node.exportClause))for(const entry of node.exportClause.elements)if(entry.name.text==='renderHTML')renderName=(entry.propertyName??entry.name).text;
    edits.push({start:node.getStart(source),end:node.end});
   }else if(ts.isFunctionDeclaration(node)||ts.isVariableStatement(node))for(const modifier of node.modifiers??[])if(modifier.kind===ts.SyntaxKind.ExportKeyword)edits.push({start:modifier.getStart(source),end:modifier.end});
  }
  for(const edit of edits.reverse())code=code.slice(0,edit.start)+code.slice(edit.end);
  return{code,renderName};
 });
}
export function historicalGenomeController():string {
 return executable(pinned('dashboard-widget-renderers.ts.txt'),true).code;
}
/** The retired codec executes only against its independently frozen compiler
 * output in a test VM. No production module imports these evidence files. */
export function historicalGenomeRows(alter:(html:string)=>string):(view:unknown)=>string {
 pinned('DashboardGenomeRows.svelte.txt');
 const component=executable(pinned('DashboardGenomeRows.svelte.html.js.txt'));
 assert(component.renderName,'Historical exported renderer');
 const render=new vm.Script(component.code+'\n'+component.renderName).runInNewContext() as (props:unknown)=>string;
 const codec=executable(pinned('dashboard-genome-rows-presentation.ts.txt'),true);
 return new vm.Script(codec.code+'\nrenderDashboardGenomeRows').runInNewContext({renderHTML:(props:unknown)=>alter(render(props))}) as (view:unknown)=>string;
}
/** Source qualification is separate from the HTML and operation oracle. The
 * emitted source maps also bind actual SDK owners to their authored sources. */
/** Later quick-marker injection changes only its three owned boundary spans;
 * reconstruct the independently pinned complete Genome controller exactly. */
export function restoreReviewedGenomeQuickMarkerBoundary(source:string):string {
 // Authenticate the complete new controller, then remove only the added waist boundary.
 assert.equal(sha(source),'20ad9d20392c833ddacbc6e2439fbf773c51b270927d826e857c5d4842e412d2','Complete reviewed waist-injected controller');
 const waistEdits=[["import {bodyMeasurementRecords, bodyPositionLabel, isBodyMeasurementId, measurementDateLabel, measurementNumber, waistToHeightRatio} from './body-measurement-model.js';\nimport {getProfileHeight} from './profile.js';\n", ""], ["      'abdominal_depth',\n", ""], ["    if (isBodyMeasurementId(metricId)) {\n      const latest = bodyMeasurementRecords(state.importedData, metricId)[0];\n      const label = metricId === 'waist' ? 'Waist' : 'Abdominal depth';\n      if (!latest) return allowEmptyManual ? {id: metricId, label, value: '—', unit: 'cm', change: '+ Log', empty: true} : null;\n      const unit = state.unitSystem === 'US' ? 'in' : 'cm';\n      const heightRatio = metricId === 'waist' ? waistToHeightRatio(latest.valueCm, getProfileHeight(state.currentProfile).height) : null;\n      return {id: metricId, label, value: measurementNumber(latest.valueCm, unit), unit,\n        change: `${bodyPositionLabel(latest.position)} · ${measurementDateLabel(latest.date)}${heightRatio !== null ? ` · Waist/height ${heightRatio.toFixed(2)}` : ''}`, empty: false};\n    }\n", ""]] as const;
 for(const [current,previous] of waistEdits){assert.equal(source.split(current).length,2,'Exactly one reviewed waist boundary span');source=source.replace(current,previous);}
 assert.equal(sha(source),'8df96b996aef9734e879dfcddf5d2b91e415d8f0465680f7e79792ff2ccdddcd','Complete reviewed quick-marker-injected controller');
 const edits=[
  ["import type {createDashboardQuickMarkerCore} from './dashboard-quick-marker-core.js';\n",''],
  ['export function createDashboardWidgetRenderers(deps: unknown, quickMarkers: ReturnType<typeof createDashboardQuickMarkerCore> | undefined = undefined) {','export function createDashboardWidgetRenderers(deps: unknown) {'],
  ['  const labRenderers = createDashboardLabWidgetRenderers({\n    markerHasData,\n    rerenderDashboardFromWidgetChange,\n  }, quickMarkers);','  const labRenderers = createDashboardLabWidgetRenderers({\n    markerHasData,\n    rerenderDashboardFromWidgetChange,\n  });'],
 ] as const;
 for(const [current,previous] of edits){
  assert.equal(source.split(current).length,2,'Exactly one reviewed quick-marker boundary span');
  source=source.replace(current,previous);
 }
 assert.equal(sha(source),pins.current['js/dashboard-widget-renderers.ts'],'Every prior Genome controller byte remains exact');
 return source;
}
export function qualifyCurrentGenomeSources():void {
 for(const [file,hash] of Object.entries(pins.original))assert.equal(sha(readFileSync(file,'utf8')),hash,'Immutable original Genome/child input: '+file);
 for(const [file,hash] of Object.entries(pins.current)){
  const current=readFileSync(file,'utf8');
  const qualified=file==='js/dashboard-widget-renderers.ts'?restoreReviewedGenomeQuickMarkerBoundary(current):current;
  assert.equal(sha(qualified),hash,'Reviewed actual Genome composition source: '+file);
 }
 for(const owner of ['DashboardGenomeWidget','DashboardGenomeRows','DashboardGenomeLoading','DashboardMtdnaPanel']){
  const source=readFileSync('js/components/'+owner+'.svelte','utf8');
  const map=JSON.parse(readFileSync('js/components/'+owner+'.svelte.html.js.map','utf8')) as {sources:string[];sourcesContent:string[]};
  const matches=map.sources.flatMap((file,index)=>file===owner+'.svelte'||file.endsWith('/'+owner+'.svelte')?[map.sourcesContent[index]]:[]);
  assert.deepEqual(matches,[source],'Actual SDK facade owns exact authored component: '+owner);
 }
 const current=readFileSync('js/dashboard-widget-renderers.ts','utf8');
 assert.equal(current.includes('dashboardWidgetActionAttrs'),false,'Typed owner directly emits its two literal public Ask action attributes');
 assert(current.includes('return renderDashboardGenomeWidgetView(projectDashboardGenomeWidget());'));
 assert(current.includes('return projectDashboardMtdnaPanel(mtdna, haplogroupTable,'));
}
/** Expected trace transport removes only source-proven retired formatting
 * calls. The entire actual trace is compared unchanged by every caller. */
export function expectedCurrentGenomeTrace(original:readonly string[],counts:{actions:number;panels:number;loading:number}):string[]{
 const actions=original.filter(value=>value==='action:ask-genome-snp');
 const panels=original.filter(value=>value==='panel');
 const loading=original.filter(value=>/^loading:[0-9]+$/.test(value));
 assert.equal(actions.length,counts.actions,'Exact independent native Ask formatting count');
 assert.equal(panels.length,counts.panels,'Exact independent native child formatting count');
 assert.equal(loading.length,counts.loading,'Exact independent native loading formatting count');
 return original.filter(value=>value!=='action:ask-genome-snp'&&value!=='panel'&&!/^loading:[0-9]+$/.test(value));
}
