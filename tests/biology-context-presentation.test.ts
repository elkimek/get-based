// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {beforeEach, afterEach, expect, it, vi} from 'vitest';
import type {AppState} from '../types/app-state.js';
import type {BiologyContextReviewInput} from '../js/biology-context-presentation.js';
import {projectBiologyContextReview, projectBiologyContextLabels} from '../js/biology-context-presentation.js';
import {renderHTML} from '../js/components/BiologyContextPresentation.svelte.html.js';
import {renderBiologyScoreContextAI} from '../js/biology-score-context-ai.js';
import {renderBiologyContextSection} from '../js/biology-context-view.js';
import {getBiologyProfileContext} from '../js/profile-context.js';
import {invalidateActiveDataCache} from '../js/data.js';
import {state} from '../js/state.js';

type ReviewData = Parameters<typeof renderBiologyScoreContextAI>[0];
interface FrozenSample {
  sex: string | null;
  name: string;
  profileIndex: number;
  overrides: Partial<AppState['importedData']>;
  dataIndex: number | null;
  profileContext: ReturnType<typeof getBiologyProfileContext>;
  input: BiologyContextReviewInput;
  html: string;
  section: string;
}
const fixture = JSON.parse(readFileSync('tests/fixtures/biology-context-original.json', 'utf8')) as {
  profiles: AppState['importedData'][];
  dataSets: ReviewData[];
  classes: string[];
  samples: FrozenSample[];
};
function decode(html: string) {
  return html.replace(/class="@(\d+)"/g, (_, index: string) => {
    const value = fixture.classes[Number(index)];
    if (value === undefined) throw new Error('Invalid frozen class reference');
    return `class="${value}"`;
  });
}
function host(html: string) {
  const node = document.createElement('div'); node.innerHTML = html; return node;
}
interface Structure {tag: string; text: string; attributes: Record<string, string>; children: Structure[]}
function structure(node: Element): Structure {
  return {
    tag: node.tagName,
    text: [...node.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent).join('').replace(/\s+/g, ' ').trim(),
    attributes: Object.fromEntries([...node.attributes]
      .filter(attr => !['class', 'data-biology-context-view'].includes(attr.name))
      .map(attr => [attr.name, attr.value])),
    children: [...node.children].map(structure),
  };
}
beforeEach(() => {
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(new Date('2026-08-07T12:00:00Z'));
  localStorage.clear();
  localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'context-fixture', name: 'Context fixture'}]));
  Object.assign(state, {currentProfile: 'context-fixture', profileDob: '1987-11-22', rangeMode: 'reference', dateRangeFilter: 'all', unitSystem: 'EU'});
});
afterEach(() => {vi.useRealTimers(); invalidateActiveDataCache(); localStorage.clear();});

for (const sample of fixture.samples) {
  it(`preserves the frozen context composition without mutating inputs: ${sample.sex}/${sample.name}`, () => {
    const before = structuredClone(sample);
    const view = projectBiologyContextReview(sample.input);
    const panel = host(renderHTML({kind: 'panel', view}));
    const section = host(renderHTML({kind: 'section', view: {review: view, labels: projectBiologyContextLabels(sample.profileContext)}}));
    expect(structure(panel)).toEqual(structure(host(decode(sample.html))));
    expect(structure(section)).toEqual(structure(host(decode(sample.section))));
    expect(sample).toEqual(before);
    expect(section.querySelector('script,img,[onerror],[onclick]')).toBeNull();
  });
  it(`preserves state selection and the public rendering facade: ${sample.sex}/${sample.name}`, () => {
    state.profileSex = sample.sex;
    state.importedData = {...structuredClone(fixture.profiles[sample.profileIndex]!), ...structuredClone(sample.overrides)} as AppState['importedData'];
    invalidateActiveDataCache();
    const before = structuredClone(state.importedData);
    const data = sample.dataIndex === null ? null : fixture.dataSets[sample.dataIndex];
    expect(structure(host(renderBiologyScoreContextAI(data)))).toEqual(structure(host(decode(sample.html))));
    expect(structure(host(renderBiologyContextSection(data)))).toEqual(structure(host(decode(sample.section))));
    expect(state.importedData).toEqual(before);
  });
}
it('keeps active suggestions readable while exposing actions only for inactive applicable flags', () => {
  const sample = fixture.samples.find(sample => sample.sex === 'female' && sample.name === 'active')!;
  const view = projectBiologyContextReview(sample.input);
  expect(view.fields).toHaveLength(5); expect(view.suggestions).toHaveLength(3);
  expect(view.suggestions.every(suggestion => suggestion.active)).toBe(true);
  const panel = host(renderHTML({kind: 'panel', view}));
  expect(panel.querySelectorAll('[data-biology-score-action="apply-context-ai"],[data-biology-score-action="dismiss-context-ai"]')).toHaveLength(0);
  expect(panel.querySelectorAll('[data-biology-context-flag]')).toHaveLength(5);
});
it('preserves legacy scalar text, null evidence and an explicitly present empty affects list', () => {
  const sample = fixture.samples.find(sample => sample.name === 'legacy-values')!;
  const view = projectBiologyContextReview(sample.input);
  expect(view.summary).toBe('23'); expect(view.suggestions[0]!.reason).toBe('23');
  expect(view.suggestions[0]!.evidence).toEqual(['', '23', 'false', '[object Object]', '<literal>']);
  expect(view.suggestions[0]!.affects).toBe('');
  expect(host(renderHTML({kind: 'panel', view})).querySelector('small')!.textContent).toBe('Affects: ');
});
it('preserves finite zero age and omits a regular cycle from the profile banner', () => {
  const context = {...fixture.samples[0]!.profileContext, lowMuscleMass: false, hormoneTherapy: false, cycleStatus: 'regular', recentHardTraining: false, acuteInflammationContext: false, ageYears: 0};
  expect(projectBiologyContextLabels(context)).toEqual(['Age: 0y']);
  expect(projectBiologyContextLabels({...context, ageYears: NaN})).toEqual([]);
});
it('removes native context templates and introduces no presentation HTML slots', () => {
  const service = readFileSync('js/biology-score-context-ai.ts', 'utf8');
  const lens = readFileSync('js/lens-pages.ts', 'utf8');
  expect(service).not.toContain('function renderSuggestion(');
  expect(service).not.toContain('return `<section');
  expect(lens).not.toContain('function renderBiologyScoreContextBanner(');
  expect(lens).not.toContain('${renderBiologyScoreContextAI(');
  for (const name of ['BiologyContextPresentation', 'BiologyContextReview', 'BiologyContextSuggestion', 'BiologyContextManualFields', 'BiologyContextBanner']) {
    expect(readFileSync(`js/components/${name}.svelte`, 'utf8')).not.toContain('{@html');
  }
});
