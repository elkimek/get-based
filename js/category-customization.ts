// category-customization.js — category/marker labels and category icon picker

import { state } from './state.js';
import { showNotification } from './utils.js';
import { renderEmojiPicker } from './emoji-picker-presentation.js';
import { getActiveData, saveImportedData } from './data.js';
import { readNativeLabDisplay, commitNativeLabDisplay } from './lab-display-store.js';
import { showDetailModal } from './marker-detail-modal.js';
import { getMarkerStorageDotKey } from './marker-placement.js';
import {
  getCategoryCustomizationBuildSidebar,
  getCategoryCustomizationViewportSize,
  navigateCategoryCustomizationRuntime,
  showCategoryCustomizationPrompt,
} from './category-customization-runtime.js';

let _navigate: unknown = navigateCategoryCustomizationRuntime;
let _buildSidebar: unknown = null;

function getFallbackBuildSidebar() {
  return getCategoryCustomizationBuildSidebar();
}

export function configureCategoryCustomization(deps: unknown = {}) {
  if (typeof (deps as { navigate?: unknown }).navigate === 'function') _navigate = (deps as { navigate?: unknown }).navigate;
  if (typeof (deps as { buildSidebar?: unknown }).buildSidebar === 'function') _buildSidebar = (deps as { buildSidebar?: unknown }).buildSidebar;
}

function _refreshActiveView(fallbackRoute: string, opts: { forceRoute?: string } = {}) {
  const data = getActiveData();
  const buildSidebar = _buildSidebar || getFallbackBuildSidebar();
  (buildSidebar as ((data: ReturnType<typeof getActiveData>) => unknown) | null)?.(data);
  (_navigate as typeof navigateCategoryCustomizationRuntime)(opts.forceRoute || state.currentView || fallbackRoute, data);
}

const renameDrafts = new WeakMap<typeof state.importedData, Map<string, string>>();
function labelDrafts(root: typeof state.importedData) { let drafts = renameDrafts.get(root); if (!drafts) { drafts = new Map(); renameDrafts.set(root, drafts); } return drafts; }
function labelEditorOwner() {
  const profileId = state.currentProfile, root = state.importedData, view = state.currentView;
  const modal = document.getElementById('detail-modal'), content = modal?.firstElementChild;
  return { profileId, root, current: () => state.currentProfile === profileId && state.importedData === root && state.currentView === view && (!modal || modal.isConnected && modal.firstElementChild === content) };
}
function labelError(error: unknown, current: () => boolean) {
  if (current()) showNotification(error instanceof Error ? error.message : 'The lab label could not be saved. Your data is kept.', 'error');
}
export async function renameCategory(categoryKey: string) {
  const owner = labelEditorOwner(), drafts = labelDrafts(owner.root), key = `category:${categoryKey}`;
  try {
    while (owner.current()) {
      const expected = await readNativeLabDisplay(owner.profileId, 'labCategories', categoryKey, owner.current);
      const currentLabel = 'label' in expected.record ? expected.record.label : '';
      const newLabel = await showCategoryCustomizationPrompt('Rename category:', { defaultValue: drafts.get(key) ?? currentLabel, okLabel: 'Rename' });
      if (!newLabel || !newLabel.trim() || newLabel.trim() === currentLabel) { drafts.delete(key); return false; }
      drafts.set(key, newLabel);
      try { await commitNativeLabDisplay(owner.profileId, expected, { label: newLabel }, owner.current); }
      catch (error) { labelError(error, owner.current); if (owner.current()) continue; return false; }
      drafts.delete(key);
      if (owner.current()) { try { _refreshActiveView(categoryKey, { forceRoute: categoryKey }); } catch { /* Label is already durable. */ } showNotification(`Category renamed to "${newLabel.trim()}"`, 'info'); }
      return true;
    }
    return false;
  } catch (error) { labelError(error, owner.current); return false; }
}
export async function renameMarker(id: string) {
  const owner = labelEditorOwner(), data = getActiveData(), idx = id.indexOf('_');
  if (idx < 1) return false;
  const catKey = id.slice(0, idx), marker = data.categories[catKey]?.markers[id.slice(idx + 1)], dotKey = getMarkerStorageDotKey(marker, id);
  if (!marker || !dotKey) return false;
  const drafts = labelDrafts(owner.root), key = `marker:${dotKey}`;
  try {
    while (owner.current()) {
      const expected = await readNativeLabDisplay(owner.profileId, 'markerDisplay', dotKey, owner.current);
      const currentName = 'name' in expected.record ? expected.record.name : '';
      const newName = await showCategoryCustomizationPrompt('Rename marker:', { defaultValue: drafts.get(key) ?? currentName, okLabel: 'Rename' });
      if (!newName || !newName.trim() || newName.trim() === currentName) { drafts.delete(key); return false; }
      drafts.set(key, newName);
      try { await commitNativeLabDisplay(owner.profileId, expected, { name: newName }, owner.current); }
      catch (error) { labelError(error, owner.current); if (owner.current()) continue; return false; }
      drafts.delete(key);
      if (owner.current()) { try { _refreshActiveView(catKey); await showDetailModal(id); } catch { /* Label is already durable. */ } showNotification(`Marker renamed to "${newName.trim()}"`, 'info'); }
      return true;
    }
    return false;
  } catch (error) { labelError(error, owner.current); return false; }
}
export async function revertMarkerName(id: string) {
  const owner = labelEditorOwner(), idx = id.indexOf('_'), data = getActiveData();
  if (idx < 1) return false;
  const marker = data.categories[id.slice(0, idx)]?.markers[id.slice(idx + 1)], dotKey = getMarkerStorageDotKey(marker, id);
  if (!dotKey) return false;
  try {
    const expected = await readNativeLabDisplay(owner.profileId, 'markerDisplay', dotKey, owner.current);
    if (!('hasNameOverride' in expected.record) || !expected.record.hasNameOverride) return false;
    await commitNativeLabDisplay(owner.profileId, expected, { restore: ['name'] }, owner.current);
    if (owner.current()) { try { _refreshActiveView(id.slice(0, idx)); await showDetailModal(id); } catch { /* Label is already durable. */ } showNotification('Marker name reverted', 'info'); }
    return true;
  } catch (error) { labelError(error, owner.current); return false; }
}

const EMOJI_CATEGORIES = [
  { id: 'science', icon: '\uD83E\uDDEA', label: 'Science & Medical', emojis: ['\uD83E\uDDEA','\uD83E\uDDEC','\uD83E\uDD2C','\uD83D\uDD2C','\u2697\uFE0F','\uD83D\uDC89','\uD83D\uDC8A','\u2695\uFE0F','\uD83E\uDE7A','\uD83E\uDDB7','\uD83E\uDDB4','\uD83E\uDDE0','\uD83E\uDEC0','\uD83E\uDEC1','\uD83D\uDD2D','\uD83E\uDDA0','\uD83E\uDE78','\uD83E\uDDEB'] },
  { id: 'body', icon: '\uD83D\uDCAA', label: 'Body & Lifestyle', emojis: ['\uD83D\uDCAA','\uD83D\uDC41\uFE0F','\uD83D\uDC42','\uD83D\uDC45','\u2764\uFE0F','\uD83E\uDDE1','\uD83E\uDD71','\uD83D\uDE34','\uD83C\uDFC3','\uD83E\uDDD8','\uD83C\uDFCB\uFE0F','\uD83D\uDEB4','\uD83C\uDFCA','\uD83D\uDE4F','\uD83E\uDDCD','\uD83E\uDEC2'] },
  { id: 'food', icon: '\uD83C\uDF4E', label: 'Food & Nutrition', emojis: ['\uD83C\uDF4E','\uD83C\uDF4A','\uD83C\uDF4B','\uD83C\uDF47','\uD83E\uDD51','\uD83E\uDD66','\uD83C\uDF45','\uD83E\uDD55','\uD83E\uDD6C','\uD83C\uDF57','\uD83E\uDD5A','\uD83D\uDC1F','\uD83E\uDD5B','\uD83E\uDD57','\u2615','\uD83C\uDF75','\uD83E\uDD64','\uD83D\uDCA7'] },
  { id: 'nature', icon: '\uD83C\uDF3F', label: 'Nature & Environment', emojis: ['\uD83C\uDF3F','\uD83C\uDF31','\uD83C\uDF3B','\uD83C\uDF3E','\uD83C\uDF43','\uD83C\uDF40','\u2600\uFE0F','\uD83C\uDF19','\u2B50','\uD83D\uDD25','\uD83C\uDF0A','\u26A1','\uD83C\uDF08','\u2744\uFE0F','\uD83C\uDF0D','\uD83D\uDCA8','\uD83C\uDF32','\uD83E\uDEB5'] },
  { id: 'symbols', icon: '\uD83D\uDD36', label: 'Symbols & Colors', emojis: ['\uD83D\uDD36','\uD83D\uDD35','\uD83D\uDFE2','\uD83D\uDFE1','\uD83D\uDFE3','\uD83D\uDD34','\u26AA','\u26AB','\uD83D\uDFE0','\uD83D\uDFE4','\u2728','\uD83D\uDCAB','\u267B\uFE0F','\u269B\uFE0F','\u2699\uFE0F','\u267E\uFE0F','\u2B55','\uD83D\uDD16'] },
];

export function showEmojiPicker(anchorEl: Element, callback: (emoji: string | null | undefined) => unknown, opts: { showReset?: boolean } = {}) {
  // Remove existing picker
  document.querySelector('.emoji-picker')?.remove();
  const picker = document.createElement('div');
  picker.className = 'emoji-picker';

  // Position near anchor
  const rect = anchorEl.getBoundingClientRect();
  const viewport = getCategoryCustomizationViewportSize();
  picker.style.left = Math.min(rect.left, viewport.width - 340) + 'px';
  picker.style.top = Math.min(rect.bottom + 4, viewport.height - 420) + 'px';

  let activeCat: string | null | undefined = null;
  let searchTerm = '';

  function render() {
    picker.innerHTML = renderEmojiPicker(searchTerm, activeCat, EMOJI_CATEGORIES, () => opts.showReset);

    // Bind events
    const input = (picker.querySelector('input') as HTMLInputElement | null);
    input?.addEventListener('input', e => {
      const target = (e.target as HTMLInputElement);
      searchTerm = target.value;
      activeCat = null;
      render();
      const el = (picker.querySelector('input') as HTMLInputElement | null);
      el?.focus();
      el?.setSelectionRange(searchTerm.length, searchTerm.length);
    });
    picker.querySelectorAll('.emoji-picker-cats button').forEach(btn => {
      const button = (btn as HTMLElement);
      btn.addEventListener('click', () => {
        if (button.dataset.cat === '__reset') { callback(null); picker.remove(); cleanup(); return; }
        activeCat = activeCat === button.dataset.cat ? null : button.dataset.cat; searchTerm = ''; render();
      });
    });
    picker.querySelectorAll('.emoji-picker-grid span[data-emoji]').forEach(span => {
      const emojiEl = (span as HTMLElement);
      span.addEventListener('click', () => { callback(emojiEl.dataset.emoji); picker.remove(); cleanup(); });
    });
  }

  render();
  document.body.appendChild(picker);
  setTimeout(() => picker.querySelector('input')?.focus(), 50);

  // Close on outside click
  function onClickOutside(e: MouseEvent) {
    if (!(e.target instanceof Node)) return;
    if (!picker.contains(e.target) && e.target !== anchorEl) { picker.remove(); cleanup(); }
  }
  function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') { picker.remove(); cleanup(); } }
  function cleanup() { document.removeEventListener('mousedown', onClickOutside); document.removeEventListener('keydown', onEsc); }
  setTimeout(() => { document.addEventListener('mousedown', onClickOutside); document.addEventListener('keydown', onEsc); }, 10);
}

export function changeCategoryIcon(categoryKey: string) {
  const data = getActiveData();
  const cat = data.categories[categoryKey];
  if (!cat) return;
  const eventTarget = typeof event !== 'undefined' && event?.target instanceof Element ? event.target : null;
  const anchor = eventTarget || document.querySelector('.category-header h2 span') || document.body;
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
