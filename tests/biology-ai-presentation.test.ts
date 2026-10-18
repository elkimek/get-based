// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import type {BiologySectionScore} from '../js/biology-score-sections.js';
import type {BiologyAIState} from '../js/biology-ai-presentation.js';
import {projectBiologyQuestion,projectBiologyAISummary,projectBiologyAIAnswer} from '../js/biology-ai-presentation.js';
import {renderHTML} from '../js/components/BiologyAIPresentation.svelte.html.js';
const original=JSON.parse(readFileSync('tests/fixtures/biology-ai-original.json','utf8')) as {samples:(BiologyAIState & {name:string;score:BiologySectionScore;question:string;summary:string;answer:string})[]};
// Original receipts were captured in Europe/Prague; keep their exact local-time inputs on every host.
beforeEach(() => {
  vi.stubEnv('TZ', 'Europe/Prague');
  expect(new Date('2026-08-07T12:00:00Z').getHours()).toBe(14);
});
afterEach(() => vi.unstubAllEnvs());
interface Structure {tag:string;text:string;attributes:Record<string,string>;children:Structure[]}
function structure(node:Element):Structure{return {tag:node.tagName,text:node.textContent!.replace(/\s+/g,' ').trim(),attributes:Object.fromEntries([...node.attributes].filter(a=>!['class','style','data-biology-ai-view'].includes(a.name)).map(a=>[a.name,a.value])),children:[...node.children].map(structure)};}
function host(html:string){const node=document.createElement('div');node.innerHTML=html;return node;}
for(const sample of original.samples){
 for(const kind of ['question','summary','answer'] as const)it(`preserves frozen ${kind} state: ${sample.name}`,()=>{
  const before=structuredClone(sample);
  const props=kind==='question'?{kind,view:projectBiologyQuestion(sample.score)}:kind==='summary'?{kind,view:projectBiologyAISummary(sample.score,sample)}:{kind,view:projectBiologyAIAnswer(sample.score,sample)};
  const actual=host(renderHTML(props));
  expect(structure(actual)).toEqual(structure(host(sample[kind])));
  expect(sample).toEqual(before);
  expect(actual.querySelector('script,img,[onerror],a[href^="javascript:"]')).toBeNull();
 });
}
it('retains independently authored short insight and sanitized full Markdown',()=>{
 const sample=original.samples.find(sample=>sample.name==='saved')!;
 const summary=host(renderHTML({kind:'summary',view:projectBiologyAISummary(sample.score,sample)}));
 expect(summary.querySelector('.biology-score-ai-teaser-text')!.textContent).toBe('Independent complete insight.');
 const answer=host(renderHTML({kind:'answer',view:projectBiologyAIAnswer(sample.score,sample)}));
 expect(answer.querySelectorAll('ul li')).toHaveLength(2);expect(answer.querySelectorAll('ol li')).toHaveLength(2);
 expect(answer.querySelector('a')!.href).toBe('https://example.com/evidence');
 expect(answer.querySelector('.biology-score-ai-answer')!.textContent).toContain('<script>alert(1)</script>');
});
it('removes native templates and confines raw HTML to the existing Markdown sanitizer',()=>{
 const source=readFileSync('js/biology-score-sections.ts','utf8');
 expect(source).not.toContain('<section');expect(source).not.toContain('<span');expect(source).not.toContain('function recordProvenance');
 for(const name of ['BiologyAIQuestion','BiologyAISummary','BiologyAIDot','BiologyAISkeleton','BiologyAIPresentation'])expect(readFileSync(`js/components/${name}.svelte`,'utf8')).not.toContain('{@html');
 expect(readFileSync('js/components/BiologyAIAnswer.svelte','utf8').match(/\{@html[^}]+\}/g)).toEqual(['{@html renderMarkdown(view.text)}']);
 expect(readFileSync('css/dashboard-widgets.base.css','utf8')).not.toMatch(/\.biology-score-(?:question|panel-levels|ai(?:\s|[{:.-](?!details)))/);
});
