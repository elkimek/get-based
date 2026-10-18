// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDefaultProfileData } from '../js/profile.js';
const held = vi.hoisted(() => ({restore: vi.fn(), catalog: vi.fn(), meals: vi.fn()}));
vi.mock('../js/nutrition-store.js', async original => ({...await original<typeof import('../js/nutrition-store.js')>(), listNutritionMeals: held.meals}));
vi.mock('../js/nutrition-comparison-ui.js', async original => ({...await original<typeof import('../js/nutrition-comparison-ui.js')>(), restoreNutritionComparison: held.restore}));
vi.mock('../js/nutrition-ai-settings.js', async original => ({...await original<typeof import('../js/nutrition-ai-settings.js')>(), hydrateNutritionLocalAICatalog: held.catalog}));
import { openNutritionEditor, openNutritionHistory } from '../js/nutrition.js';
import { state } from '../js/state.js';
import { closeModalOverlay } from '../js/modal-lifecycle.js';
import { resetNutritionRequestLifecycle } from '../js/nutrition-request-lifecycle.js';
let finish!: () => void;
let rejectRestore!: (error: Error) => void;
let data: typeof state.importedData;
beforeEach(() => {
  document.body.innerHTML = '<button id="origin">Origin</button><main id="main-content"></main><div id="modal-overlay"><div id="detail-modal"></div></div><div id="notification-container"></div>';
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/css/nutrition.css'; link.dataset.nutritionStylesheet = ''; Object.defineProperty(link, 'sheet', {value: {}}); document.head.append(link);
  localStorage.setItem('labcharts-ai-paused', 'true'); state.currentProfile = 'editor-owner'; state.currentView = 'body'; data = createDefaultProfileData(); state.importedData = data;
  held.restore.mockReset().mockImplementation(() => new Promise<void>((resolve, reject) => {finish = resolve; rejectRestore = reject;})); held.catalog.mockReset().mockResolvedValue([]); held.meals.mockReset().mockResolvedValue([]);
  document.getElementById('origin')!.focus();
});
afterEach(() => {finish?.(); resetNutritionRequestLifecycle(); const overlay = document.getElementById('modal-overlay'); if (overlay) closeModalOverlay(overlay, {restoreFocus: false}); document.head.innerHTML = ''; document.body.innerHTML = ''; localStorage.clear();});
it('the actual current editor awaits its retained draft and opens with the same accessible manual control', async () => {
  const opening = openNutritionEditor(); await vi.waitFor(() => expect(held.restore).toHaveBeenCalledOnce());
  expect(document.getElementById('modal-overlay')!.classList.contains('show')).toBe(false); finish(); await expect(opening).resolves.toBe(true);
  expect(document.getElementById('modal-overlay')!.classList.contains('show')).toBe(true); expect(document.querySelectorAll('[data-nutrition-editor-view]')).toHaveLength(1); expect(state.importedData).toBe(data);
});
it.each(['profile', 'data', 'content', 'modal', 'overlay', 'main', 'close'] as const)('actual draft restoration cannot reopen or focus a retired %s owner', async reason => {
  const opening = openNutritionEditor(); await vi.waitFor(() => expect(held.restore).toHaveBeenCalledOnce());
  if (reason === 'profile') state.currentProfile = 'replacement';
  if (reason === 'data') state.importedData = {...createDefaultProfileData(), contextNotes: 'replacement'};
  if (reason === 'content') document.getElementById('detail-modal')!.innerHTML = '<p>New owner</p>';
  if (reason === 'modal') document.getElementById('detail-modal')!.id = 'old-detail';
  if (reason === 'overlay') document.getElementById('modal-overlay')!.id = 'old-overlay';
  if (reason === 'main') document.getElementById('main-content')!.id = 'old-main';
  if (reason === 'close') document.getElementById('modal-overlay')!.classList.add('show');
  const before = document.body.innerHTML, owner = state.importedData, values = structuredClone(owner), focused = document.activeElement;
  finish(); await expect(opening).resolves.toBe(false); expect(document.body.innerHTML).toBe(before); expect(document.activeElement).toBe(focused); expect(state.importedData).toBe(owner); expect(state.importedData).toEqual(values);
});
it('a newer actual open owns the modal while an earlier draft restore resolves last', async () => {
  const first = openNutritionEditor(); await vi.waitFor(() => expect(held.restore).toHaveBeenCalledOnce()); const completeFirst = finish;
  const second = openNutritionEditor(); await vi.waitFor(() => expect(held.restore).toHaveBeenCalledTimes(2)); finish(); await expect(second).resolves.toBe(true);
  const content = document.getElementById('detail-modal')!.firstElementChild; completeFirst(); await expect(first).resolves.toBe(false);
  expect(document.getElementById('detail-modal')!.firstElementChild).toBe(content); expect(document.querySelectorAll('[data-nutrition-editor-view]')).toHaveLength(1); expect(state.importedData).toBe(data);
});

it('a retired cold handoff cannot finish the actual held restoration while ordinary warm opens remain usable', async () => {
  let owned = true; const opening = openNutritionEditor({}, () => owned);
  await vi.waitFor(() => expect(held.restore).toHaveBeenCalledOnce()); owned = false;
  const before = document.body.innerHTML, focus = document.activeElement; finish(); await expect(opening).resolves.toBe(false);
  expect(document.body.innerHTML).toBe(before); expect(document.activeElement).toBe(focus); expect(document.getElementById('modal-overlay')!.classList.contains('show')).toBe(false);
  const warm = openNutritionEditor(); await vi.waitFor(() => expect(held.restore).toHaveBeenCalledTimes(2)); finish(); await expect(warm).resolves.toBe(true);
});

it('retiring the cold History owner during an actual held meal read cannot publish or focus the returned history', async () => {
  let release!: (value: []) => void, owned = true;
  held.meals.mockReturnValueOnce(new Promise<[]>(resolve => {release = resolve;}));
  const opening = openNutritionHistory(undefined, {}, () => owned);
  await vi.waitFor(() => expect(held.meals).toHaveBeenCalledOnce());
  // Preferences are accepted by the current public opener before its read;
  // retirement prevents subsequent UI/data work, not those accepted preferences.
  expect(localStorage.getItem('nutrition-history-range')).toBe('30d'); expect(localStorage.getItem('nutrition-history-view')).toBe('meals');
  owned = false; const before = document.body.innerHTML, focus = document.activeElement, original = state.importedData;
  release([]); await expect(opening).resolves.toBe(false); expect(document.body.innerHTML).toBe(before); expect(document.activeElement).toBe(focus); expect(state.importedData).toBe(original);
});

it('preserves a current-owner draft restoration exception rather than silently hiding it', async () => {
  const opening = openNutritionEditor(), error = new Error('Current draft restore failed');
  const rejected = expect(opening).rejects.toBe(error);
  await vi.waitFor(() => expect(held.restore).toHaveBeenCalledOnce()); rejectRestore(error); await rejected;
});
it.each(['data', 'content', 'modal', 'overlay'] as const)('ignores a held actual draft restore error after %s retirement', async reason => {
  const opening = openNutritionEditor(); await vi.waitFor(() => expect(held.restore).toHaveBeenCalledOnce());
  if (reason === 'data') state.importedData = createDefaultProfileData();
  if (reason === 'content') document.getElementById('detail-modal')!.innerHTML = '<p>New modal owner</p>';
  if (reason === 'modal') document.getElementById('detail-modal')!.id = 'retired-detail';
  if (reason === 'overlay') document.getElementById('modal-overlay')!.id = 'retired-overlay';
  const before = document.body.innerHTML, focus = document.activeElement; rejectRestore(new Error('Retired restore failed'));
  await expect(opening).resolves.toBe(false); expect(document.body.innerHTML).toBe(before); expect(document.activeElement).toBe(focus);
});
