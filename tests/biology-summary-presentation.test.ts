// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {beforeEach, afterEach, expect, it, vi} from 'vitest';
import {renderHTML} from '../js/components/BiologySummaryPresentation.svelte.html.js';
import {projectBiologySummaryWidget, projectBiologyCompatibilityLens, type BiologyCompatibilityScore} from '../js/biology-summary-presentation.js';
import {projectBiologyContextLabels} from '../js/biology-context-presentation.js';
import {renderBiologyScoresWidget, renderBiologyScoresLens} from '../js/biology-score-render.js';
import {configureLensPageShell} from '../js/lens-page-shell.js';
import {state} from '../js/state.js';
import type {getBiologyProfileContext} from '../js/profile-context.js';
interface Sample {kind: 'widget' | 'lens'; name: string; records: (BiologyCompatibilityScore & {nonFiniteScore?: boolean})[]; profileContext: ReturnType<typeof getBiologyProfileContext>; html: string}
const fixture = JSON.parse(readFileSync('tests/fixtures/biology-summary-original.json', 'utf8')) as {classes: string[]; samples: Sample[]};
const samples = fixture.samples.map(sample => ({...sample, records: sample.records.map(record => ({...record, score: record.nonFiniteScore ? {...record.score, score: NaN} : record.score}))}));
const decode = (html: string) => html.replace(/class="@(\d+)"/g, (_, index: string) => {
  const value = fixture.classes[Number(index)]; if (value === undefined) throw new Error('Invalid frozen class'); return `class="${value}"`;
});
function host(html: string) {const element = document.createElement('div'); element.innerHTML = html; return element;}
function upgradeFrozenCardSemantics(element: Element) {
  for (const card of element.querySelectorAll('.biology-score-card')) {
    const title = card.querySelector('h4')!, button = document.createElement('button');
    button.type = 'button'; button.setAttribute('aria-label', card.getAttribute('aria-label')!);
    for (const name of ['data-biology-score-action', 'data-biology-score-id']) button.setAttribute(name, card.getAttribute(name)!);
    button.append(...title.childNodes); title.append(button);
    for (const name of ['role', 'tabindex', 'aria-label']) card.removeAttribute(name);
  }
}
interface Structure {tag: string; text: string; attributes: Record<string, string>; children: Structure[]}
function structure(element: Element): Structure {
  return {tag: element.tagName,
    text: [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').replace(/\s+/g, ' ').trim(),
    attributes: Object.fromEntries([...element.attributes].filter(attribute => attribute.name !== 'class' && !/^data-biology-(summary|context)-view$/.test(attribute.name))
      .map(attribute => [attribute.name, attribute.name === 'style' ? (element as HTMLElement).style.cssText : attribute.value])),
    children: [...element.children].map(structure)};
}
let restore: ReturnType<typeof configureLensPageShell>;
beforeEach(() => {
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(new Date('2026-08-07T12:00:00Z'));
  Object.assign(state, {currentProfile: 'summary-fixture', profileSex: 'male', profileDob: '1987-11-22', rangeMode: 'reference', unitSystem: 'EU'});
  state.importedData = JSON.parse(readFileSync('data/demo-male.json', 'utf8'));
  Reflect.deleteProperty(state.importedData!, 'biologyScoreAI');
  localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'summary-fixture', name: 'Summary fixture', tags: []}]));
  restore = configureLensPageShell({getAvailableDashboardFixedWidgetIds: () => [], getDashboardWidgetPrefs: () => ({hidden: []})});
});
afterEach(() => {configureLensPageShell(restore); vi.useRealTimers(); localStorage.clear();});
for (const sample of samples) {
  it(`preserves frozen ${sample.kind}/${sample.name} through pure typed composition`, () => {
    const before = structuredClone(sample.records);
    const html = sample.kind === 'widget' ? renderHTML({kind: 'widget', view: projectBiologySummaryWidget(sample.records.map(record => record.score))})
      : renderHTML({kind: 'lens', view: projectBiologyCompatibilityLens(sample.records, projectBiologyContextLabels(sample.profileContext))});
    const original = host(decode(sample.html)); upgradeFrozenCardSemantics(original);
    const current = host(html); expect(structure(current)).toEqual(structure(original));
    expect(sample.records).toEqual(before);
    expect(current.querySelector('script,img,[onerror],[onclick]')).toBeNull();
    expect(current.querySelector('[role="button"] button')).toBeNull();
  });
  it(`preserves the public ${sample.kind}/${sample.name} facade and injected computation contract`, () => {
    const list = structuredClone(sample.records.map(record => record.score));
    const compute = vi.fn(() => list);
    const current = host(sample.kind === 'widget' ? renderBiologyScoresWidget(null, compute) : renderBiologyScoresLens(null, compute));
    const original = host(decode(sample.html)); upgradeFrozenCardSemantics(original);
    expect(structure(current)).toEqual(structure(original)); expect(compute).toHaveBeenCalledExactlyOnceWith({});
  });
}
it('keeps historical display separate from the current rail and live counts, including non-finite values', () => {
  const stale = samples.find(sample => sample.kind === 'widget' && sample.name === 'stale')!;
  const view = projectBiologySummaryWidget(stale.records.map(record => record.score));
  expect(view.cards[0]!.value).toBe('53'); expect(view.cards[0]!.pin).toBeNull();
  expect(view.cards[0]!.statuses.find(status => status.kind === 'recency')!.value).toBeTruthy();
  const clamped = samples.find(sample => sample.name === 'clamped')!;
  expect(projectBiologySummaryWidget(clamped.records.map(record => record.score)).cards.map(card => card.pin)).toEqual([100, 0]);
  const unknown = samples.find(sample => sample.name === 'unknown')!;
  expect(projectBiologySummaryWidget(unknown.records.map(record => record.score)).hero.count).toBe('1/1 live');
});
it('removes every native Biology template without adding raw Svelte HTML slots', () => {
  expect(readFileSync('js/biology-score-render.ts', 'utf8')).not.toMatch(/`<(?:div|span|article|button)/);
  for (const name of ['BiologySummaryPresentation','BiologySummaryWidget','BiologySummaryHero','BiologySummaryCard','BiologySummaryStatus','BiologySummaryInputs','BiologyCompatibilityLens']) {
    expect(readFileSync(`js/components/${name}.svelte`, 'utf8')).not.toContain('{@html');
  }
});
