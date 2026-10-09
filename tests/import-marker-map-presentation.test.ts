// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {
  projectImportMarkerMap,
  projectImportMarkerMapCategories,
  projectImportMarkerMapResults,
} from '../js/import-marker-map-presentation.js';
import {renderHTML as renderShell} from '../js/components/ImportMarkerMapPresentation.svelte.html.js';
import {renderHTML as renderCategories} from '../js/components/ImportMarkerMapCategories.svelte.html.js';
import {renderHTML as renderResults} from '../js/components/ImportMarkerMapResults.svelte.html.js';

function parse(html: string): HTMLDivElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
}

it('keeps the nested dialog, search label and clear/cancel action contracts', () => {
  const host = parse(renderShell({view: projectImportMarkerMap(null)}));
  const dialog = host.querySelector('[role="dialog"]');
  expect(dialog?.getAttribute('aria-modal')).toBe('true');
  expect(dialog?.getAttribute('aria-labelledby')).toBe('import-map-modal-title');
  expect(host.querySelector('#import-map-modal-title')?.textContent).toBe('Map to Existing Marker');
  const search = host.querySelector('input');
  expect(search?.type).toBe('search');
  expect(search?.closest('label')?.querySelector('.sr-only')?.textContent).toBe('Search existing markers');
  expect(search?.placeholder).toBe('Search markers, categories, units');
  expect(search?.getAttribute('autocomplete')).toBe('off');
  expect(host.querySelector('.import-map-context-label')?.textContent).toBe('Imported marker');
  expect(host.querySelector('.import-map-context-range')).toBeNull();
  expect(host.querySelector('[data-import-map-action="clear"]')?.textContent).toBe('Clear mapping');
  expect(host.querySelectorAll('[data-import-map-action="close"]')).toHaveLength(2);
  expect(host.querySelector('.import-map-results')?.getAttribute('aria-live')).toBe('polite');
});

it.each([
  {refMin: 0, refMax: null, range: '0-?'},
  {refMin: undefined, refMax: 0, range: '?-0'},
  {refMin: 1.2, refMax: 4.5, range: '1.2-4.5'},
])('preserves zero values and partially supplied reference ranges: $range', sample => {
  const marker = {rawName: 'Ferritin', value: 0, unit: 'µg/L', suggestedKey: 'iron.ferritin', ...sample};
  const before = {...marker};
  const view = projectImportMarkerMap(marker);
  expect(view.value).toBe('0');
  expect(view.range).toBe(sample.range);
  expect(view.showRange).toBe(true);
  const host = parse(renderShell({view}));
  expect(host.querySelector('.import-map-context-value')?.textContent).toBe('0 µg/L');
  expect(host.querySelector('.import-map-context-range')?.textContent).toBe(`Range ${sample.range}`);
  expect(host.querySelector('[data-import-map-action="clear"]')?.textContent).toBe('Keep as new');
  expect(marker).toEqual(before);
});

it('preserves controller-supplied order, category counts and the exact active category', () => {
  const categories = [
    {key: 'all', label: 'All', count: 122},
    {key: 'suggested', label: 'Suggested', count: 2},
    {key: 'iron', label: 'Iron', count: 7},
  ];
  const before = structuredClone(categories);
  const host = parse(renderCategories({categories: projectImportMarkerMapCategories(categories, 'suggested')}));
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')];
  expect(buttons.map(button => button.dataset.importMapCategory)).toEqual(['all', 'suggested', 'iron']);
  expect(buttons.map(button => [...button.querySelectorAll('span')].map(span => span.textContent))).toEqual([
    ['All', '122'], ['Suggested', '2'], ['Iron', '7'],
  ]);
  expect(buttons.map(button => button.classList.contains('active'))).toEqual([false, true, false]);
  expect(buttons.map(button => button.type)).toEqual(['button', 'button', 'button']);
  expect(categories).toEqual(before);
});

it('shows allowed units, fallback units, reference badges and only the current exact key', () => {
  const items = [
    {key: 'iron.ferritin', name: 'Ferritin', categoryLabel: 'Iron', units: ['µg/L', 'ng/mL'], unit: 'unused', range: '1-2'},
    {key: 'other.zero', name: 'Zero', categoryLabel: 'Other', units: [], unit: 'mmol/L', range: ''},
    {key: 'other.none', name: 'No unit', categoryLabel: 'Other', units: [], unit: '', range: ''},
  ];
  const before = structuredClone(items);
  const host = parse(renderResults({results: projectImportMarkerMapResults(items, 'other.zero')}));
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')];
  expect(buttons.map(button => button.dataset.importMapKey)).toEqual(items.map(item => item.key));
  expect(buttons.map(button => button.classList.contains('selected'))).toEqual([false, true, false]);
  expect(buttons.map(button => [...button.querySelectorAll('.import-map-result-meta span')].map(span => span.textContent))).toEqual([
    ['Iron', 'µg/L, ng/mL', '1-2'], ['Other', 'mmol/L'], ['Other', 'no unit'],
  ]);
  expect(items).toEqual(before);
  const empty = parse(renderResults({results: projectImportMarkerMapResults([], '')}));
  expect(empty.querySelector('button')).toBeNull();
  expect(empty.querySelector('.import-map-empty')?.textContent).toBe('No markers match this search.');
});

it('renders imported text, labels, keys and units literally without creating markup or attributes', () => {
  const hostile = '<img src=x onerror="throw 1"> & "quoted"';
  const key = '\" onclick=\"throw 1\"><script>throw 1</script>';
  const host = parse(renderShell({view: projectImportMarkerMap({rawName: hostile, value: hostile, unit: hostile, refMin: hostile})}));
  host.querySelector('.import-map-categories')!.innerHTML = renderCategories({categories: projectImportMarkerMapCategories([
    {key, label: hostile, count: 1},
  ], key)});
  host.querySelector('.import-map-results')!.innerHTML = renderResults({results: projectImportMarkerMapResults([
    {key, name: hostile, categoryLabel: hostile, units: [hostile], unit: hostile, range: hostile},
  ], key)});
  expect(host.querySelector('.import-map-context-label')?.textContent).toBe(hostile);
  expect(host.querySelector('.import-map-context-value')?.textContent).toBe(`${hostile} ${hostile}`);
  expect(host.querySelector('.import-map-result strong')?.textContent).toBe(hostile);
  expect(host.querySelector('.import-map-result code')?.textContent).toBe(key);
  expect(host.querySelector<HTMLElement>('[data-import-map-category]')?.dataset.importMapCategory).toBe(key);
  expect(host.querySelector<HTMLElement>('[data-import-map-key]')?.dataset.importMapKey).toBe(key);
  expect(host.querySelectorAll('img,script,[onerror],[onclick]')).toHaveLength(0);
});

it('keeps matching, slicing and callback ownership in the controller without raw HTML slots', () => {
  for (const name of ['Presentation', 'Categories', 'Results']) {
    const source = readFileSync(`js/components/ImportMarkerMap${name}.svelte`, 'utf8');
    expect(source).not.toContain('{@html');
    expect(source).not.toMatch(/on:(?:click|input)|onclick=|oninput=/);
  }
  const source = readFileSync('js/import-marker-map-modal.ts', 'utf8');
  expect(source).toContain('items.slice(0, 120)');
  expect(source).toContain("if (needle) return items.filter(item => item.searchText.includes(needle));");
  expect(source).toContain("if (typeof activeOnSelect === 'function') activeOnSelect(key);");
  expect(source).toContain("{ initialFocus: '.import-map-modal-search', focusDelay: 30 }");
  expect(source).not.toContain('renderCategoryButton');
  expect(source).not.toContain('escapeHTML');
});
