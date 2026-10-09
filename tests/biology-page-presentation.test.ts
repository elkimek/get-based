// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {projectBiologyPage,type BiologyPageInput} from '../js/biology-page-presentation.js';
import {renderHTML} from '../js/components/BiologyScoresPage.svelte.html.js';
import {projectLabDateRange} from '../js/lab-date-range-presentation.js';
import {renderHTML as renderRange} from '../js/components/LabDateRange.svelte.html.js';
const frozen=JSON.parse(readFileSync('tests/fixtures/biology-page-original.json','utf8')) as {classes:string[];samples:(BiologyPageInput & {name:string;html:string})[]};
function decode(html:string){return html.replace(/class="@(\d+)"/g,(_,index:string)=>`class="${frozen.classes[Number(index)]}"`);}
function host(html:string){const element=document.createElement('div');element.innerHTML=html;
 // Row height is measured by the unchanged runtime controller, not the renderer.
 for(const summary of element.querySelectorAll<HTMLElement>('.biology-score-summary')){summary.style.removeProperty('--biology-summary-height');if(!summary.getAttribute('style'))summary.removeAttribute('style');}
 return element;}
interface Structure {tag:string;text:string;attributes:Record<string,string>;children:Structure[]}
function structure(element:Element):Structure{return {tag:element.tagName,text:[...element.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('').replace(/\s+/g,' ').trim(),attributes:Object.fromEntries([...element.attributes].filter(attr=>!['class','data-biology-page-view','data-lab-date-range-view'].includes(attr.name)).map(attr=>[attr.name,attr.value])),children:[...element.children].map(structure)};}
for(const sample of frozen.samples)it(`preserves frozen complete page structure, controls and reading order: ${sample.name}`,()=>{
 const before=structuredClone(sample);const html=renderHTML({view:projectBiologyPage(sample)});
 expect(structure(host(html))).toEqual(structure(host(decode(sample.html))));
 expect(html).not.toContain('<!--score-tools-->');expect(sample).toEqual(before);
 expect(host(html).querySelector('script,img,[onerror],a[href^="javascript:"]')).toBeNull();
});
for(const range of ['3m','6m','1y','all','unknown'])for(const scope of [false,true])it(`keeps date options and current range semantics: ${range}/${scope}`,()=>{
 const view=projectLabDateRange(range,scope),dom=host(renderRange({view}));
 expect([...dom.querySelectorAll('button')].map(button=>({key:button.getAttribute('data-lab-data-range'),active:button.getAttribute('aria-pressed'),action:button.getAttribute('data-lab-data-action'),type:button.type,text:button.textContent}))).toEqual(['3m','6m','1y','all'].map((key,index)=>({key,active:String(key===range),action:'set-date-range',type:'button',text:['3M','6M','1Y','All'][index]})));
 expect(dom.querySelector('.dashboard-lab-date-range')!==null).toBe(scope);
 if(scope)expect(dom.querySelector('p')?.textContent).toBe(range==='all'?'Filters lab trends and sidebar categories. All saved dates are included.':'Filters lab trends and sidebar categories. Older results and categories may be hidden.');
});
it('composes the actual page and date controls without raw presentation slots',()=>{
 for(const component of ['BiologyScoresPage','BiologyScoreGroup','LabDateRange'])expect(readFileSync(`js/components/${component}.svelte`,'utf8')).not.toContain('{@html');
 const source=readFileSync('js/lens-pages.ts','utf8');const page=source.slice(source.indexOf('  function showBiologyScores'),source.indexOf('  function showGenomeLens'));
 expect(page).toContain('renderBiologyPage(ctx,scoreData)');expect(page).not.toMatch(/`<|renderLensPageWidgets|renderDateRangeFilter|getBiologyScoreLensGroups/);
});
