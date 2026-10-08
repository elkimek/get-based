// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import postcss from 'postcss';
import type {BiologyRenderScore} from '../js/biology-score-render.js';
import {projectBiologyFacts, projectBiologyMarkerSections, projectBiologyMethodology} from '../js/biology-reading-presentation.js';
import {renderHTML} from '../js/components/BiologyReadingPresentation.svelte.html.js';
const original = JSON.parse(readFileSync('tests/fixtures/biology-reading-original.json', 'utf8')) as {
  samples: {name: string; score: BiologyRenderScore; markers: string; methodology: string}[];
  facts: {facts: [unknown, unknown][]; html: string};
  notes: {flags: string[]; html: string}[];
};
interface Structure {tag: string; text: string; attributes: Record<string, string>; children: Structure[]}
function host(html: string) {const node = document.createElement('div'); node.innerHTML = html; return node;}
function structure(node: Element): Structure {
  return {tag: node.tagName, text: node.textContent!.replace(/\s+/g, ' ').trim(),
    attributes: Object.fromEntries([...node.attributes].filter(a => !['class', 'style', 'data-biology-reading-view'].includes(a.name)).map(a => [a.name, a.value])),
    children: [...node.children].map(structure)};
}
for (const sample of original.samples) {
  it(`preserves marker results, ranges, links and contributions: ${sample.name}`, () => {
    const before = structuredClone(sample.score);
    const actual = host(renderHTML({kind: 'markers', sections: projectBiologyMarkerSections(sample.score)}));
    expect(structure(actual)).toEqual(structure(host(sample.markers)));
    expect(sample.score).toEqual(before);
  });
  it(`preserves methodology, evidence, zero weights and core share: ${sample.name}`, () => {
    const before = structuredClone(sample.score);
    expect(structure(host(renderHTML({kind: 'methodology', view: projectBiologyMethodology(sample.score)})))).toEqual(structure(host(sample.methodology)));
    expect(sample.score).toEqual(before);
  });
}
it('preserves fact labels and numeric zero', () => {
  expect(structure(host(renderHTML({kind: 'facts', facts: projectBiologyFacts(original.facts.facts)})))).toEqual(structure(host(original.facts.html)));
});
for (const sample of original.notes) it(`preserves ${sample.flags.length} interpretation notes`, () => {
  expect(structure(host(renderHTML({kind: 'notes', flags: sample.flags})))).toEqual(structure(host(sample.html)));
});
it('escapes user-controlled labels, values, ids and notes', () => {
  const edge = original.samples.find(sample => sample.name === 'edge') || original.samples[19]!;
  const html = host(renderHTML({kind: 'markers', sections: projectBiologyMarkerSections(edge.score)}));
  expect(html.querySelector('img,script,[onerror]')).toBeNull();
  for (const [index, button] of [...html.querySelectorAll('button')].entries()) {
    expect(button.getAttribute('data-biology-marker-id')).toBe(edge.score.available.filter(item => item.id)[index]!.id);
  }
});
it('removes superseded native reading templates and avoids raw markup slots', () => {
  const renderer = readFileSync('js/biology-score-render.ts', 'utf8');
  expect(renderer).not.toContain('function renderMarkerTableLink');
  expect(renderer).not.toContain('<table');
  for (const name of ['BiologyReadingTable', 'BiologyMarkerResults', 'BiologyMethodology', 'BiologyReadingFacts', 'BiologyInterpretationNotes', 'BiologyReadingPresentation']) {
    expect(readFileSync(`js/components/${name}.svelte`, 'utf8')).not.toContain('{@html');
  }
  expect(readFileSync('css/dashboard-widgets.base.css', 'utf8')).not.toMatch(/\.biology-(?:score-(?:table|marker-section|marker-link|methodology)|reading-(?:facts|notes|lead)|fit-badge|table-scroll-hint)/);
});
it('scopes reading utilities without resets, empty selectors or important overrides', () => {
  const css = readFileSync('css/dashboard-widgets.css', 'utf8');
  const selectors: string[] = [];
  postcss.parse(css).walkRules(rule => {
    expect(rule.selector.trim()).not.toBe('');
    for (const selector of rule.selectors) if (selector.includes('.gb\\:reading-ui')) selectors.push(selector);
  });
  expect(selectors.length).toBeGreaterThan(80);
  expect(selectors.every(selector => selector.includes(':is([data-biology-reading-view],[data-biology-reading-view] *)'))).toBe(true);
  expect(css.slice(css.indexOf('/*! tailwindcss'))).not.toContain('!important');
});
