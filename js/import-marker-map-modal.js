// @ts-check
// import-marker-map-modal.js - category/search picker for mapping imported rows.

import { MARKER_SCHEMA, SPECIALTY_MARKER_DEFS } from './schema.js';
import { getValidUnitsForMarker } from './pdf-import-marker-mapping.js';
import { escapeHTML } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';

let activeOverlay = null;
let activeItems = [];
let activeCategory = 'all';
let activeCurrentKey = '';
let activeOnSelect = null;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleizeKey(value) {
  return String(value || 'Other')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function categoryLabelForKey(key) {
  const [catKey] = String(key || '').split('.');
  return MARKER_SCHEMA[catKey]?.label
    || SPECIALTY_MARKER_DEFS[key]?.categoryLabel
    || titleizeKey(catKey);
}

function formatRange(def) {
  if (def?.refMin == null && def?.refMax == null) return '';
  const min = def.refMin == null ? '?' : String(def.refMin);
  const max = def.refMax == null ? '?' : String(def.refMax);
  return `${min}-${max}`;
}

function scoreMarkerItem(item, marker) {
  const raw = normalizeText(`${marker?.rawName || ''} ${marker?.suggestedName || ''}`);
  if (!raw) return 0;
  const name = normalizeText(item.name);
  const key = normalizeText(item.key.split('.').pop());
  if (name === raw || key === raw) return 100;
  if (name.includes(raw) || raw.includes(name) || key.includes(raw) || raw.includes(key)) return 80;
  const tokens = raw.split(' ').filter(token => token.length > 2);
  return tokens.reduce((score, token) => score + (item.searchText.includes(token) ? 12 : 0), 0);
}

function buildItems(marker, refLookup) {
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

function renderCategories(overlay) {
  const host = overlay.querySelector('.import-map-categories');
  if (!host) return;
  const counts = new Map();
  let suggested = 0;
  for (const item of activeItems) {
    counts.set(item.categoryKey, { label: item.categoryLabel, count: (counts.get(item.categoryKey)?.count || 0) + 1 });
    if (item.score > 0) suggested += 1;
  }
  const categoryButtons = [...counts.entries()]
    .sort((a, b) => a[1].label.localeCompare(b[1].label))
    .map(([key, data]) => renderCategoryButton(key, data.label, data.count));
  host.innerHTML = [
    renderCategoryButton('all', 'All', activeItems.length),
    suggested ? renderCategoryButton('suggested', 'Suggested', suggested) : '',
    ...categoryButtons,
  ].join('');
}

function renderCategoryButton(key, label, count) {
  const active = activeCategory === key ? ' active' : '';
  return `<button type="button" class="import-map-category${active}" data-import-map-category="${escapeHTML(key)}">
    <span>${escapeHTML(label)}</span><span>${count}</span>
  </button>`;
}

function filteredItems(query) {
  const needle = normalizeText(query);
  let items = activeItems;
  if (needle) return items.filter(item => item.searchText.includes(needle));
  if (activeCategory === 'suggested') items = items.filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  else if (activeCategory !== 'all') items = items.filter(item => item.categoryKey === activeCategory);
  return items;
}

function renderResults(overlay) {
  const host = overlay.querySelector('.import-map-results');
  const input = /** @type {HTMLInputElement | null} */ (overlay.querySelector('.import-map-modal-search'));
  if (!host) return;
  const items = filteredItems(input?.value || '');
  if (items.length === 0) {
    host.innerHTML = '<div class="import-map-empty">No markers match this search.</div>';
    return;
  }
  host.innerHTML = items.slice(0, 120).map(item => {
    const selected = item.key === activeCurrentKey;
    const units = item.units.length ? item.units.join(', ') : (item.unit || 'no unit');
    return `<button type="button" class="import-map-result${selected ? ' selected' : ''}" data-import-map-key="${escapeHTML(item.key)}">
      <span class="import-map-result-main">
        <strong>${escapeHTML(item.name)}</strong>
        <code>${escapeHTML(item.key)}</code>
      </span>
      <span class="import-map-result-meta">
        <span>${escapeHTML(item.categoryLabel)}</span>
        <span>${escapeHTML(units)}</span>
        ${item.range ? `<span>${escapeHTML(item.range)}</span>` : ''}
      </span>
    </button>`;
  }).join('');
}

function closeImportMarkerMapModal() {
  if (!activeOverlay) return;
  const overlay = activeOverlay;
  activeOverlay = null;
  activeItems = [];
  activeOnSelect = null;
  removeModalOverlay(overlay);
}

function selectKey(key) {
  if (typeof activeOnSelect === 'function') activeOnSelect(key);
  closeImportMarkerMapModal();
}

export function openImportMarkerMapModal({ marker, currentKey = '', refLookup = {}, onSelect }) {
  if (activeOverlay?.isConnected) closeImportMarkerMapModal();
  activeItems = buildItems(marker, refLookup);
  activeCurrentKey = currentKey || '';
  activeOnSelect = onSelect;
  activeCategory = activeItems.some(item => item.score > 0) ? 'suggested' : 'all';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay import-map-modal-overlay';
  overlay.innerHTML = `<div class="modal import-marker-map-modal" role="dialog" aria-modal="true" aria-labelledby="import-map-modal-title">
    <div class="gb-modal-head import-map-modal-head">
      <div>
        <div class="gb-modal-kicker">Import mapping</div>
        <div class="gb-modal-title" id="import-map-modal-title">Map to Existing Marker</div>
      </div>
      <button type="button" class="modal-close" data-import-map-action="close" aria-label="Close mapping">&times;</button>
    </div>
    <div class="import-map-modal-body">
      <div class="import-map-context">
        <span>${escapeHTML(marker?.rawName || 'Imported marker')}</span>
        <strong>${escapeHTML(marker?.value ?? '')} ${escapeHTML(marker?.unit || '')}</strong>
        ${marker?.refMin != null || marker?.refMax != null ? `<small>Range ${escapeHTML(formatRange(marker))}</small>` : ''}
      </div>
      <label class="import-map-search-wrap">
        <span class="sr-only">Search existing markers</span>
        <input type="search" class="import-map-modal-search" placeholder="Search markers, categories, units" autocomplete="off">
      </label>
      <div class="import-map-modal-grid">
        <div class="import-map-categories" aria-label="Marker categories"></div>
        <div class="import-map-results" aria-live="polite"></div>
      </div>
    </div>
    <div class="import-map-modal-actions">
      <button type="button" class="import-btn import-btn-secondary" data-import-map-action="clear">${marker?.suggestedKey ? 'Keep as new' : 'Clear mapping'}</button>
      <button type="button" class="import-btn import-btn-secondary" data-import-map-action="close">Cancel</button>
    </div>
  </div>`;
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
