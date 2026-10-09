import type { ImportReviewMarker, ImportMarkerReference } from './pdf-import-review-runtime.js';

// import-marker-map-modal.js - category/search picker for mapping imported rows.

import { MARKER_SCHEMA } from './schema.js';
import { SPECIALTY_MARKER_DEFS } from './adapters.js';
import { getValidUnitsForMarker } from './pdf-import-marker-mapping.js';
import { renderHTML as renderImportMarkerMap } from './components/ImportMarkerMapPresentation.svelte.html.js';
import { renderHTML as renderImportMarkerMapCategories } from './components/ImportMarkerMapCategories.svelte.html.js';
import { renderHTML as renderImportMarkerMapResults } from './components/ImportMarkerMapResults.svelte.html.js';
import { projectImportMarkerMap, projectImportMarkerMapCategories, projectImportMarkerMapResults } from './import-marker-map-presentation.js';
import { importMarkerMapClasses } from './import-marker-map-classes.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';

let activeOverlay: HTMLElement | null = null;
let activeItems: ReturnType<typeof buildItems> = [];
let activeCategory = 'all';
let activeCurrentKey = '';
let activeOnSelect: ((key: string) => unknown) | null | undefined = null;

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleizeKey(value: unknown) {
  return String(value || 'Other')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function categoryLabelForKey(key: string) {
  const [catKey] = String(key || '').split('.');
  return MARKER_SCHEMA[catKey!]?.label
    || SPECIALTY_MARKER_DEFS[key]?.categoryLabel
    || titleizeKey(catKey);
}

function formatRange(def: Pick<ImportMarkerReference, 'refMin' | 'refMax'> | null | undefined) {
  if (def?.refMin == null && def?.refMax == null) return '';
  const min = def.refMin == null ? '?' : String(def.refMin);
  const max = def.refMax == null ? '?' : String(def.refMax);
  return `${min}-${max}`;
}

function scoreMarkerItem(item: ReturnType<typeof buildItems>[number], marker: ImportReviewMarker | null | undefined) {
  const raw = normalizeText(`${marker?.rawName || ''} ${marker?.suggestedName || ''}`);
  if (!raw) return 0;
  const name = normalizeText(item.name);
  const key = normalizeText(item.key.split('.').pop());
  if (name === raw || key === raw) return 100;
  if (name.includes(raw) || raw.includes(name) || key.includes(raw) || raw.includes(key)) return 80;
  const tokens = raw.split(' ').filter(token => token.length > 2);
  return tokens.reduce((score, token) => score + (item.searchText.includes(token) ? 12 : 0), 0);
}

function buildItems(marker: ImportReviewMarker | null | undefined, refLookup: Record<string, ImportMarkerReference> | null | undefined) {
  return Object.entries(refLookup || {}).map(([key, def]) => {
    const categoryLabel = categoryLabelForKey(key);
    const units = getValidUnitsForMarker(key);
    const item = {
      key,
      name: def?.name || key,
      unit: def?.unit || '',
      range: formatRange(def),
      categoryLabel,
      categoryKey: normalizeText(categoryLabel) || 'other',
      units,
      searchText: normalizeText(`${key} ${def?.name || ''} ${categoryLabel} ${def?.unit || ''} ${units.join(' ')}`),
      score: 0,
    };
    item.score = scoreMarkerItem(item, marker);
    return item;
  }).sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel) || a.name.localeCompare(b.name));
}

function renderCategories(overlay: HTMLElement) {
  const host = overlay.querySelector('.import-map-categories');
  if (!host) return;
  const counts = new Map<string, { label: string; count: number }>();
  let suggested = 0;
  for (const item of activeItems) {
    counts.set(item.categoryKey, { label: item.categoryLabel, count: (counts.get(item.categoryKey)?.count || 0) + 1 });
    if (item.score > 0) suggested += 1;
  }
  const categories = [...counts.entries()]
    .sort((a, b) => a[1].label.localeCompare(b[1].label))
    .map(([key, data]) => ({key, label: data.label, count: data.count}));
  host.innerHTML = renderImportMarkerMapCategories({categories: projectImportMarkerMapCategories([
    {key: 'all', label: 'All', count: activeItems.length},
    ...(suggested ? [{key: 'suggested', label: 'Suggested', count: suggested}] : []),
    ...categories,
  ], activeCategory)});
}

function filteredItems(query: string) {
  const needle = normalizeText(query);
  let items = activeItems;
  if (needle) return items.filter(item => item.searchText.includes(needle));
  if (activeCategory === 'suggested') items = items.filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  else if (activeCategory !== 'all') items = items.filter(item => item.categoryKey === activeCategory);
  return items;
}

function renderResults(overlay: HTMLElement) {
  const host = overlay.querySelector('.import-map-results');
  const input = overlay.querySelector('.import-map-modal-search') as HTMLInputElement | null;
  if (!host) return;
  const items = filteredItems(input?.value || '');
  host.innerHTML = renderImportMarkerMapResults({results: projectImportMarkerMapResults(items.slice(0, 120), activeCurrentKey)});
}

function closeImportMarkerMapModal() {
  if (!activeOverlay) return;
  const overlay = activeOverlay;
  activeOverlay = null;
  activeItems = [];
  activeOnSelect = null;
  removeModalOverlay(overlay);
}

function selectKey(key: string) {
  if (typeof activeOnSelect === 'function') activeOnSelect(key);
  closeImportMarkerMapModal();
}

export function openImportMarkerMapModal({ marker, currentKey = '', refLookup = {}, onSelect }: {
  marker?: ImportReviewMarker | null; currentKey?: string; refLookup?: Record<string, ImportMarkerReference>;
  onSelect?: ((key: string) => unknown) | null;
}) {
  if (activeOverlay?.isConnected) closeImportMarkerMapModal();
  activeItems = buildItems(marker, refLookup);
  activeCurrentKey = currentKey || '';
  activeOnSelect = onSelect;
  activeCategory = activeItems.some(item => item.score > 0) ? 'suggested' : 'all';

  const overlay = document.createElement('div');
  overlay.className = importMarkerMapClasses('modal-overlay import-map-modal-overlay');
  overlay.setAttribute('data-import-marker-map-view', '');
  overlay.innerHTML = renderImportMarkerMap({view: projectImportMarkerMap(marker)});
  activeOverlay = overlay;
  overlay.addEventListener('input', event => {
    if (event.target instanceof HTMLInputElement && event.target.classList.contains('import-map-modal-search')) renderResults(overlay);
  });
  overlay.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const category = target?.closest('[data-import-map-category]');
    if (category instanceof HTMLElement) {
      activeCategory = category.dataset.importMapCategory || 'all';
      renderCategories(overlay);
      renderResults(overlay);
      return;
    }
    const result = target?.closest('[data-import-map-key]');
    if (result instanceof HTMLElement) {
      selectKey(result.dataset.importMapKey || '');
      return;
    }
    const action = target?.closest('[data-import-map-action]');
    if (!(action instanceof HTMLElement)) return;
    if (action.dataset.importMapAction === 'clear') selectKey('');
    else closeImportMarkerMapModal();
  });
  renderCategories(overlay);
  renderResults(overlay);
  openAppendedModalOverlay(overlay, closeImportMarkerMapModal, { initialFocus: '.import-map-modal-search', focusDelay: 30 });
}
