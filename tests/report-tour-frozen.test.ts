// @vitest-environment jsdom
import fs from 'node:fs';
import {expect,it} from 'vitest';
import {renderHTML as reportHTML} from '../js/components/ReportBuilderPresentation.svelte.html.js';
import {renderHTML as tourHTML} from '../js/components/TourPresentation.svelte.html.js';
import {projectReportBuilder} from '../js/report-builder-presentation.js';
import {projectTourPresentation} from '../js/tour-presentation.js';
import * as report from '../js/export-report.js';
interface ReportInput {
  presetId:string; rangeMode:string; aiAvailable:boolean;
  categoryOptions:{key:string;label:string;markerCount:number;flaggedCount:number}[];
  contextSections:{title:string}[];notes:{date:string;text:string}[];
}
interface TourInput {title:string;text:string;index:number;total:number}
type Sample={name:string;html:string}&({kind:'report';input:ReportInput}|{kind:'tour';input:TourInput});
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/report-tour-original.json','utf8')) as {samples:Sample[]};
const labels:Record<string,string>={categories:'Lab results',genetics:'Genome',context:'Personal context',nutrition:'Nutrition and hydration',wearables:'Body and wearables',light:'Sun and light sessions',environment:'Environment',notes:'Timeline notes'};
function authored(sample:Sample):string {
  if(sample.kind==='tour')return tourHTML(projectTourPresentation(sample.input,sample.input.index,sample.input.total));
  const input=sample.input;
  return reportHTML({view:projectReportBuilder({
    overlayId:report.REPORT_BUILDER_OVERLAY_ID,presetId:input.presetId,preset:report.getReportPreset(input.presetId),
    presets:Object.entries(report.REPORT_PRESETS).map(([id,preset])=>({id,label:preset.label,subtitle:preset.subtitle})),
    dateOptions:report.REPORT_DATE_RANGE_OPTIONS,rangeOptions:report.REPORT_RANGE_MODE_OPTIONS,rangeMode:input.rangeMode,
    sections:report.REPORT_SECTION_DEFS.filter(section=>!['flagged','summary','trends'].includes(section.id)).map(section=>({...section,label:labels[section.id]||section.label})),
    categories:input.categoryOptions,selectedCategoryKeys:input.categoryOptions.map(option=>option.key),
    contextTitles:input.contextSections.map(section=>section.title),notes:input.notes,aiAvailable:input.aiAvailable,
  })});
}
function structure(html:string) {
  const root=document.createElement('div');root.innerHTML=html;
  function element(node:Element):unknown {
    const attrs=Object.fromEntries([...node.attributes].filter(attr=>!['class','data-report-builder-view','data-tour-view'].includes(attr.name)).map(attr=>[attr.name,attr.value]).sort(([a],[b])=>a!.localeCompare(b!)));
    if(node.matches('.report-note-review > p')&&attrs.style==='white-space:pre-wrap;overflow-wrap:anywhere')delete attrs.style;
    return {tag:node.tagName,attrs,text:node.childElementCount?[...node.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE).map(child=>child.textContent).join('').replace(/\s+/g,' ').trim():node.textContent,children:[...node.children].map(element)};
  }
  return [...root.children].map(element);
}
it.each(fixture.samples)('preserves complete frozen $kind/$name structure and control attributes',sample=>{
  const before=JSON.stringify(sample.input);expect(structure(authored(sample))).toEqual(structure(sample.html));
  expect(JSON.stringify(sample.input)).toBe(before);
});
it('has no native template or raw HTML slot in the two migrated presentation owners',()=>{
  for(const name of ['TourPresentation','ReportBuilderPresentation','ReportBuilderSetup','ReportBuilderSections','ReportBuilderAI'])expect(fs.readFileSync(`js/components/${name}.svelte`,'utf8')).not.toContain('{@html');
  const tour=fs.readFileSync('js/tour.ts','utf8');expect(tour).not.toContain('dotsHtml');
  const builder=fs.readFileSync('js/export-report-builder.ts','utf8');expect(builder).not.toContain('function renderReportNoteReview(');
});
