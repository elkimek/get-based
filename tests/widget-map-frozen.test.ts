// @vitest-environment jsdom
import fs from 'node:fs';
import {expect, it} from 'vitest';
import {renderHTML as dashboardHTML} from '../js/components/DashboardPickerPresentation.svelte.html.js';
import {renderHTML as mapHTML} from '../js/components/ImportMarkerMapPresentation.svelte.html.js';
import {renderHTML as categoriesHTML} from '../js/components/ImportMarkerMapCategories.svelte.html.js';
import {renderHTML as resultsHTML} from '../js/components/ImportMarkerMapResults.svelte.html.js';
import {projectDashboardPickerPresentation, type DashboardPickerInput} from '../js/dashboard-picker-presentation.js';
import {projectImportMarkerMap, projectImportMarkerMapCategories, projectImportMarkerMapResults} from '../js/import-marker-map-presentation.js';
import {importMarkerMapClasses} from '../js/import-marker-map-classes.js';
type MapMarker = Parameters<typeof projectImportMarkerMap>[0];
type Categories = Parameters<typeof projectImportMarkerMapCategories>[0];
type Results = Parameters<typeof projectImportMarkerMapResults>[0];
type Sample = {name: string; html: string} & (
  {kind: 'dashboard-picker'; input: DashboardPickerInput}
  | {kind: 'import-map'; input: {marker: MapMarker; currentKey: string}; activeCategory: string; categories: Categories; results: Results}
);
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/widget-map-original.json', 'utf8')) as {revision: string; samples: Sample[]};
function authored(sample: Sample): string {
  if (sample.kind === 'dashboard-picker') return dashboardHTML({view: projectDashboardPickerPresentation(sample.input)});
  const overlay = document.createElement('div');
  overlay.className = importMarkerMapClasses('modal-overlay import-map-modal-overlay');
  overlay.dataset.importMarkerMapView = '';
  overlay.innerHTML = mapHTML({view: projectImportMarkerMap(sample.input.marker)});
  overlay.querySelector('.import-map-categories')!.innerHTML = categoriesHTML({categories: projectImportMarkerMapCategories(sample.categories, sample.activeCategory)});
  overlay.querySelector('.import-map-results')!.innerHTML = resultsHTML({results: projectImportMarkerMapResults(sample.results, sample.input.currentKey)});
  return overlay.outerHTML;
}
function structure(html: string): unknown {
  const root = document.createElement('div'); root.innerHTML = html;
  function element(node: Element): unknown {
    const attrs = Object.fromEntries([...node.attributes]
      .filter(attr => !['class', 'data-dashboard-picker-view', 'data-import-marker-map-view'].includes(attr.name))
      .map(attr => [attr.name, attr.value]).sort(([a], [b]) => a!.localeCompare(b!)));
    return {
      tag: node.tagName, attrs,
      text: [...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).map(child => child.textContent).join('').replace(/\s+/g, ' ').trim(),
      children: [...node.children].map(element),
    };
  }
  return [...root.children].map(element);
}
it.each(fixture.samples)('preserves complete frozen $kind/$name topology, literal text and control attributes', sample => {
  const before = JSON.stringify(sample);
  expect(structure(authored(sample))).toEqual(structure(sample.html));
  expect(JSON.stringify(sample)).toBe(before);
  const oldRoot = document.createElement('div'); oldRoot.innerHTML = sample.html;
  const newRoot = document.createElement('div'); newRoot.innerHTML = authored(sample);
  const original = [...oldRoot.querySelectorAll('*')], current = [...newRoot.querySelectorAll('*')];
  expect(current.length).toBe(original.length);
  original.forEach((node, index) => {
    for (const name of node.classList) expect(current[index]!.classList.contains(name), `${sample.name}/${index}/${name}`).toBe(true);
    if (node instanceof HTMLInputElement) {
      const next = current[index] as HTMLInputElement;
      expect({type: next.type, checked: next.checked, disabled: next.disabled, value: next.value}).toEqual({type: node.type, checked: node.checked, disabled: node.disabled, value: node.value});
    }
  });
});
it('freezes original Git source provenance and representative filtering boundaries', () => {
  expect(fixture.revision).toBe('3ea5aaef7746bdab5681db57aa2524d90ef364b7');
  const maps = fixture.samples.filter((sample): sample is Extract<Sample, {kind: 'import-map'}> => sample.kind === 'import-map');
  expect(maps.some(sample => sample.results.length === 120)).toBe(true);
  expect(maps.some(sample => sample.results.length === 0)).toBe(true);
  expect(maps.some(sample => sample.activeCategory === 'suggested')).toBe(true);
  expect(maps.some(sample => sample.results.some(result => result.key === sample.input.currentKey))).toBe(true);
});
it('owns all migrated markup in literal Svelte without obsolete native template helpers', () => {
  for (const name of ['DashboardPickerPresentation', 'ImportMarkerMapPresentation', 'ImportMarkerMapCategories', 'ImportMarkerMapResults']) {
    expect(fs.readFileSync(`js/components/${name}.svelte`, 'utf8')).not.toContain('{@html');
  }
  const dashboard = fs.readFileSync('js/dashboard-widget-controls.ts', 'utf8');
  for (const name of ['renderDashboardMarkerWidgetOption', 'renderDashboardBiometricWidgetOption', 'renderDashboardPickerFixedGroups']) expect(dashboard).not.toContain(`function ${name}(`);
  const mapping = fs.readFileSync('js/import-marker-map-modal.ts', 'utf8');
  expect(mapping).not.toContain('function renderCategoryButton(');
  expect(mapping).not.toContain('<span class="import-map-result-main">');
});
