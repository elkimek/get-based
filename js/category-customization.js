// category-customization.js — category/marker labels and category icon picker

import { state } from './state.js';
import { escapeHTML, showNotification } from './utils.js';
import { getActiveData, saveImportedData } from './data.js';
import { showDetailModal } from './marker-detail-modal.js';

let _navigate = (route, data) => window.navigate?.(route, data);

export function configureCategoryCustomization(deps = {}) {
  if (typeof deps.navigate === 'function') _navigate = deps.navigate;
}

function _refreshActiveView(fallbackRoute, opts = {}) {
  const data = getActiveData();
  window.buildSidebar?.(data);
  _navigate(opts.forceRoute || state.currentView || fallbackRoute, data);
}

export async function renameCategory(categoryKey) {
  const data = getActiveData();
  const cat = data.categories[categoryKey];
  if (!cat) return;
  const currentLabel = cat.label;
  const newLabel = await window.showPromptDialog('Rename category:', {
    defaultValue: currentLabel,
    okLabel: 'Rename',
  });
  if (!newLabel || newLabel === currentLabel) return;
  const trimmed = newLabel.trim();
  if (!trimmed) return;
  // Store label override
  if (!state.importedData.categoryLabels) state.importedData.categoryLabels = {};
  state.importedData.categoryLabels[categoryKey] = trimmed;
  // Also update custom marker defs so sidebar picks it up
  const cms = state.importedData.customMarkers || {};
  for (const [k, def] of Object.entries(cms)) {
    if (k.startsWith(categoryKey + '.')) def.categoryLabel = trimmed;
  }
  await saveImportedData();
  _refreshActiveView(categoryKey, { forceRoute: categoryKey });
  showNotification(`Category renamed to "${trimmed}"`, 'info');
}

export async function renameMarker(id) {
  const data = getActiveData();
  const idx = id.indexOf('_');
  const catKey = id.slice(0, idx), mKey = id.slice(idx + 1);
  const marker = data.categories[catKey]?.markers[mKey];
  if (!marker) return;
  const newName = await window.showPromptDialog('Rename marker:', {
    defaultValue: marker.name,
    okLabel: 'Rename',
  });
  if (!newName || newName === marker.name) return;
  const trimmed = newName.trim();
  if (!trimmed) return;
  const dotKey = catKey + '.' + mKey;
  if (!state.importedData.markerLabels) state.importedData.markerLabels = {};
  state.importedData.markerLabels[dotKey] = trimmed;
  await saveImportedData();
  _refreshActiveView(catKey);
  showDetailModal(id);
  showNotification(`Marker renamed to "${trimmed}"`, 'info');
}

export function revertMarkerName(id) {
  const idx = id.indexOf('_');
  const dotKey = id.slice(0, idx) + '.' + id.slice(idx + 1);
  if (!state.importedData.markerLabels?.[dotKey]) return;
  delete state.importedData.markerLabels[dotKey];
  if (Object.keys(state.importedData.markerLabels).length === 0) delete state.importedData.markerLabels;
  saveImportedData();
  _refreshActiveView(id.slice(0, idx));
  showDetailModal(id);
  showNotification('Marker name reverted', 'info');
}

const EMOJI_CATEGORIES = [
  { id: 'science', icon: '\uD83E\uDDEA', label: 'Science & Medical', emojis: ['\uD83E\uDDEA','\uD83E\uDDEC','\uD83E\uDD2C','\uD83D\uDD2C','\u2697\uFE0F','\uD83D\uDC89','\uD83D\uDC8A','\u2695\uFE0F','\uD83E\uDE7A','\uD83E\uDDB7','\uD83E\uDDB4','\uD83E\uDDE0','\uD83E\uDEC0','\uD83E\uDEC1','\uD83D\uDD2D','\uD83E\uDDA0','\uD83E\uDE78','\uD83E\uDDEB'] },
  { id: 'body', icon: '\uD83D\uDCAA', label: 'Body & Lifestyle', emojis: ['\uD83D\uDCAA','\uD83D\uDC41\uFE0F','\uD83D\uDC42','\uD83D\uDC45','\u2764\uFE0F','\uD83E\uDDE1','\uD83E\uDD71','\uD83D\uDE34','\uD83C\uDFC3','\uD83E\uDDD8','\uD83C\uDFCB\uFE0F','\uD83D\uDEB4','\uD83C\uDFCA','\uD83D\uDE4F','\uD83E\uDDCD','\uD83E\uDEC2'] },
  { id: 'food', icon: '\uD83C\uDF4E', label: 'Food & Nutrition', emojis: ['\uD83C\uDF4E','\uD83C\uDF4A','\uD83C\uDF4B','\uD83C\uDF47','\uD83E\uDD51','\uD83E\uDD66','\uD83C\uDF45','\uD83E\uDD55','\uD83E\uDD6C','\uD83C\uDF57','\uD83E\uDD5A','\uD83D\uDC1F','\uD83E\uDD5B','\uD83E\uDD57','\u2615','\uD83C\uDF75','\uD83E\uDD64','\uD83D\uDCA7'] },
  { id: 'nature', icon: '\uD83C\uDF3F', label: 'Nature & Environment', emojis: ['\uD83C\uDF3F','\uD83C\uDF31','\uD83C\uDF3B','\uD83C\uDF3E','\uD83C\uDF43','\uD83C\uDF40','\u2600\uFE0F','\uD83C\uDF19','\u2B50','\uD83D\uDD25','\uD83C\uDF0A','\u26A1','\uD83C\uDF08','\u2744\uFE0F','\uD83C\uDF0D','\uD83D\uDCA8','\uD83C\uDF32','\uD83E\uDEB5'] },
  { id: 'symbols', icon: '\uD83D\uDD36', label: 'Symbols & Colors', emojis: ['\uD83D\uDD36','\uD83D\uDD35','\uD83D\uDFE2','\uD83D\uDFE1','\uD83D\uDFE3','\uD83D\uDD34','\u26AA','\u26AB','\uD83D\uDFE0','\uD83D\uDFE4','\u2728','\uD83D\uDCAB','\u267B\uFE0F','\u269B\uFE0F','\u2699\uFE0F','\u267E\uFE0F','\u2B55','\uD83D\uDD16'] },
];

export function showEmojiPicker(anchorEl, callback, opts = {}) {
  // Remove existing picker
  document.querySelector('.emoji-picker')?.remove();
  const picker = document.createElement('div');
  picker.className = 'emoji-picker';

  // Position near anchor
  const rect = anchorEl.getBoundingClientRect();
  picker.style.left = Math.min(rect.left, window.innerWidth - 340) + 'px';
  picker.style.top = Math.min(rect.bottom + 4, window.innerHeight - 420) + 'px';

  let activeCat = null;
  let searchTerm = '';

  function render() {
    let html = `<div class="emoji-picker-search"><input type="text" placeholder="Search emoji..." value="${escapeHTML(searchTerm)}"></div>`;
    html += `<div class="emoji-picker-cats">`;
    if (opts.showReset) {
      html += `<button data-cat="__reset" title="Reset to default" style="font-size:12px;font-family:inherit">\u00d7</button>`;
    }
    for (const cat of EMOJI_CATEGORIES) {
      html += `<button data-cat="${cat.id}" title="${cat.label}" class="${activeCat === cat.id ? 'active' : ''}">${cat.icon}</button>`;
    }
    html += `</div><div class="emoji-picker-grid">`;

    const items = [];
    for (const cat of EMOJI_CATEGORIES) {
      if (activeCat && activeCat !== cat.id) continue;
      if (searchTerm && !cat.label.toLowerCase().includes(searchTerm.toLowerCase())) continue;
      items.push(`<div class="emoji-picker-label">${cat.label}</div>`);
      for (const e of cat.emojis) {
        items.push(`<span data-emoji="${e}">${e}</span>`);
      }
    }
    if (items.length === 0) items.push(`<div class="emoji-picker-label">No results</div>`);
    html += items.join('') + `</div>`;
    picker.innerHTML = html;

    // Bind events
    const input = picker.querySelector('input');
    input.addEventListener('input', e => { searchTerm = e.target.value; activeCat = null; render(); const el = picker.querySelector('input'); el.focus(); el.setSelectionRange(searchTerm.length, searchTerm.length); });
    picker.querySelectorAll('.emoji-picker-cats button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.cat === '__reset') { callback(null); picker.remove(); cleanup(); return; }
        activeCat = activeCat === btn.dataset.cat ? null : btn.dataset.cat; searchTerm = ''; render();
      });
    });
    picker.querySelectorAll('.emoji-picker-grid span[data-emoji]').forEach(span => {
      span.addEventListener('click', () => { callback(span.dataset.emoji); picker.remove(); cleanup(); });
    });
  }

  render();
  document.body.appendChild(picker);
  setTimeout(() => picker.querySelector('input')?.focus(), 50);

  // Close on outside click
  function onClickOutside(e) { if (!picker.contains(e.target) && e.target !== anchorEl) { picker.remove(); cleanup(); } }
  function onEsc(e) { if (e.key === 'Escape') { picker.remove(); cleanup(); } }
  function cleanup() { document.removeEventListener('mousedown', onClickOutside); document.removeEventListener('keydown', onEsc); }
  setTimeout(() => { document.addEventListener('mousedown', onClickOutside); document.addEventListener('keydown', onEsc); }, 10);
}

export function changeCategoryIcon(categoryKey) {
  const data = getActiveData();
  const cat = data.categories[categoryKey];
  if (!cat) return;
  const anchor = (typeof event !== 'undefined' && event?.target) || document.querySelector('.category-header h2 span') || document.body;
  const hasOverride = categoryKey in (state.importedData?.categoryIcons || {});
  showEmojiPicker(anchor, (emoji) => {
    if (emoji === null) {
      // Reset to default
      if (state.importedData.categoryIcons) delete state.importedData.categoryIcons[categoryKey];
    } else {
      if (!state.importedData.categoryIcons) state.importedData.categoryIcons = {};
      state.importedData.categoryIcons[categoryKey] = emoji;
    }
    const cms = state.importedData.customMarkers || {};
    for (const [k, def] of Object.entries(cms)) {
      if (k.startsWith(categoryKey + '.')) {
        if (emoji === null) delete def.icon;
        else def.icon = emoji;
      }
    }
    saveImportedData();
    _refreshActiveView(categoryKey, { forceRoute: categoryKey });
    showNotification(emoji === null ? 'Icon reset to default' : 'Icon updated', 'info');
  }, { showReset: !!hasOverride });
}
