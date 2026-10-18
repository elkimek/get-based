// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {projectGenomeImportDetails,projectBodySources,projectLensActions} from '../js/lens-content-presentation.js';
import {createLensPageHandlers} from '../js/lens-pages.js';
import {state} from '../js/state.js';
import {getLensContentGrid} from '../js/lens-page-shell.js';
import {renderHTML} from '../js/components/LensPageContent.svelte.html.js';
interface Sample {name:string;kind:'genome'|'body'|'actions';input?:{genetics?:unknown;wearableConnections?:unknown;wearableSummary?:unknown};route?:string;hidden?:string[];html:string;actions?:string}
const fixture=JSON.parse(readFileSync('tests/fixtures/lens-content-original.json','utf8')) as {samples:Sample[]};
interface Structure {tag:string;text:string;attributes:Record<string,string>;children:Structure[]}
function host(html:string){const node=document.createElement('div');node.innerHTML=html;return node;}
function structure(node:Element):Structure{return {tag:node.tagName,text:[...node.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE).map(child=>child.textContent).join('').replace(/\s+/g,' ').trim(),attributes:Object.fromEntries([...node.attributes].filter(attr=>!['class','data-lens-content-view'].includes(attr.name)).map(attr=>[attr.name,attr.value])),children:[...node.children].map(structure)};}
for(const sample of fixture.samples)it(`preserves frozen literal lens content and actions: ${sample.kind}/${sample.name}`,()=>{
 const before=structuredClone(sample);
 const body=sample.kind==='genome'?renderHTML({kind:'genome-import',view:projectGenomeImportDetails(sample.input?.genetics)}):sample.kind==='body'?renderHTML({kind:'body-sources',view:projectBodySources(sample.input?.wearableConnections,sample.input?.wearableSummary)}):renderHTML({kind:'actions',view:projectLensActions(sample.route==='showInsightLens'?'insight':'tips',{recommendationsVisible:!sample.hidden?.includes('recommendations')})});
 expect(structure(host(body))).toEqual(structure(host(sample.html)));expect(sample).toEqual(before);
 expect(host(body).querySelector('script,img,[onclick],[onerror]')).toBeNull();
 if(sample.kind!=='actions'){
  const action=sample.kind==='body'?'body':'genome';const snps=(sample.input?.genetics as {snps?:object}|undefined)?.snps;
  const html=renderHTML({kind:'actions',view:projectLensActions(action,{hasSnps:Object.keys(snps||{}).length>0})});
  expect(structure(host(html))).toEqual(structure(host(sample.actions||'')));
 }
});
it('preserves source priority, empty-summary distinction, zero coverage and literal metadata without mutation',()=>{
 const input={wearableConnections:{oura:{coverageDays:0}},wearableSummary:{sources:{oura:{coverageDays:99},manual:{coverageDays:4}}}};
 const before=structuredClone(input),view=projectBodySources(input.wearableConnections,input.wearableSummary);
 expect(view.sources.map(source=>source.label)).toEqual(['oura','Manual logs']);expect(view.sources[0]!.coverage).toBe('coverage pending');expect(input).toEqual(before);
 expect(projectBodySources({},null).empty).toBe(true);expect(projectBodySources({},{sources:{}})).toEqual({empty:false,sources:[]});
 const genome=projectGenomeImportDetails({snps:{rs1:{}},importDate:'x',coverage:{found:0,total:0}})!;
 expect(genome.cards[1]!.sub).toBe('0 / 0 catalog SNPs matched');
});
it('components use escaped typed fields with no raw HTML slots or native controller templates',()=>{
 for(const name of ['LensPageContent','LensActionButtons','GenomeImportDetails','BodySources'])expect(readFileSync(`js/components/${name}.svelte`,'utf8')).not.toContain('{@html');
 const controller=readFileSync('js/lens-pages.ts','utf8');expect(controller).not.toMatch(/`<(?:div class="(?:genome-import-details|db-genome-import-note|dashboard-widget-picker-grid)|button type="button" class="db-correlation-empty)/);
 expect(controller).not.toContain('const genomeActions = `<');expect(controller).toContain("projectLensActions('genome', {hasSnps})");
});

it('the controller omits an absent import panel while retaining maternal-only import details',()=>{
 const original=state.importedData;document.body.innerHTML='<main id="main-content"></main>';
 let ids:string[]=[];
 const handlers=createLensPageHandlers({projectDashboardGenomeWidget:()=>({kind:'empty',contributionHref:null}),getLensContentGrid:(route:string,widgets:Parameters<typeof getLensContentGrid>[1])=>{ids=widgets.map(widget=>widget.id);return getLensContentGrid(route,widgets);}});
 try{
  (state as {importedData:unknown}).importedData={genetics:{snps:{}}};handlers.showGenomeLens();expect(ids).toEqual(['genome']);
  (state as {importedData:unknown}).importedData={genetics:{snps:{},mtdna:{haplogroup:'H1'}}};handlers.showGenomeLens();expect(ids).toEqual(['genome','genome-import']);
 }finally{state.importedData=original;document.body.replaceChildren();}
});
