// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDefaultProfileData } from '../js/profile.js';

const editor = vi.hoisted(() => ({ openNutritionEditor: vi.fn(), openNutritionHistory: vi.fn(), openNutritionTargets: vi.fn(), openFluidLog: vi.fn(), openNutritionHistoryView: vi.fn() }));
const notices = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../js/nutrition.js', () => editor);
vi.mock('../js/utils.js', async original => ({...await original<typeof import('../js/utils.js')>(), showNotification: notices.notify}));
let context: typeof import('../js/nutrition-context.js');
let state: typeof import('../js/state.js')['state'];
const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined]> = [];
let link: HTMLLinkElement;
let data: typeof state.importedData;

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  const original = EventTarget.prototype.addEventListener;
  vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(function (this: EventTarget, name: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (listener) listeners.push([this, name, listener, options]);
    return original.call(this, name, listener, options);
  });
  document.body.innerHTML = '<main id="main-content"><div data-nutrition-dashboard-view="intake"><button data-nutrition-action="open">Meal</button><button data-nutrition-action="open-history">History</button><button data-nutrition-action="open-targets">Targets</button><button data-nutrition-action="open-fluid-log">Drink</button></div></main><div id="modal-overlay"><div id="detail-modal"><p>Retained modal</p></div></div><button id="other">Other focus</button>';
  document.head.innerHTML = '';
  ({ state } = await import('../js/state.js')); state.currentProfile = 'nutrition-loading'; state.currentView = 'body';
  data = createDefaultProfileData(); state.importedData = data; state.nutritionSummary = null;
  context = await import('../js/nutrition-context.js');
  for (const open of Object.values(editor)) open.mockResolvedValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const [target, name, listener, options] of listeners.splice(0)) target.removeEventListener(name, listener, options);
  document.head.innerHTML = ''; document.body.innerHTML = '';
});
function button(action: string) { return document.querySelector<HTMLButtonElement>(`[data-nutrition-action="${action}"]`)!; }
async function clickHeld(action = 'open') {
  button(action).focus(); button(action).click();
  await vi.waitFor(() => { expect(document.querySelector('link[data-nutrition-stylesheet]')).not.toBeNull(); });
  link = document.querySelector<HTMLLinkElement>('link[data-nutrition-stylesheet]')!;
}
function loaded(value = link) { Object.defineProperty(value, 'sheet', { value: {}, configurable: true }); value.dispatchEvent(new Event('load')); }
async function settled() { await new Promise(resolve => setTimeout(resolve, 0)); await new Promise(resolve => setTimeout(resolve, 0)); }
function noOpens() { for (const open of Object.values(editor)) expect(open).not.toHaveBeenCalled(); }

it('prepares exact synchronous summaries and CSS without opening or loading the editor owner', async () => {
  expect(context.isNutritionWidgetFeatureReady()).toBe(false); expect(context.projectNutritionWidget()).toBeNull();
  const pending = context.loadNutritionWidgetFeature();
  link = document.querySelector<HTMLLinkElement>('link[data-nutrition-stylesheet]')!;
  expect(context.isNutritionWidgetFeatureReady()).toBe(false); loaded(); await pending;
  expect(context.isNutritionWidgetFeatureReady()).toBe(true); expect(context.isNutritionFeatureReady()).toBe(false);
  expect(context.projectNutritionWidget()).toMatchObject({kind: 'intake', hasMeals: false});
  expect(context.renderNutritionWidget()).toContain('No intake logged yet'); expect(context.projectFuelWidget()).toMatchObject({kind: 'fuel'});
  noOpens(); expect(state.importedData).toBe(data); expect(notices.notify).not.toHaveBeenCalled();
});
it.each([['open', 'openNutritionEditor'], ['open-history', 'openNutritionHistory'], ['open-targets', 'openNutritionTargets'], ['open-fluid-log', 'openFluidLog']] as const)('hands cold %s directly to its actual public opener exactly once', async (action, method) => {
  await clickHeld(action); noOpens(); loaded();
  await vi.waitFor(() => expect(editor[method]).toHaveBeenCalledOnce());
  const args = editor[method].mock.calls[0]!; expect(args.at(-1)).toEqual(expect.any(Function));
  expect((args.at(-1) as () => boolean)()).toBe(true);
  for (const [name, open] of Object.entries(editor)) if (name !== method) expect(open).not.toHaveBeenCalled();
  expect(state.importedData).toBe(data); expect(notices.notify).not.toHaveBeenCalled();
});
it.each(['profile', 'data', 'root', 'button', 'main', 'modal', 'content', 'overlay', 'shown', 'route', 'focus', 'escape'] as const)('retires cold opening after %s changes without writing data or touching a newer owner', async reason => {
  await clickHeld();
  if (reason === 'profile') state.currentProfile = 'replacement';
  if (reason === 'data') state.importedData = createDefaultProfileData();
  if (reason === 'root') document.querySelector('[data-nutrition-dashboard-view]')!.replaceWith(document.createElement('section'));
  if (reason === 'button') button('open').remove();
  if (reason === 'main') document.getElementById('main-content')!.id = 'retired-main';
  if (reason === 'modal') document.getElementById('detail-modal')!.id = 'retired-detail';
  if (reason === 'content') document.getElementById('detail-modal')!.innerHTML = '<p>New owner</p>';
  if (reason === 'overlay') document.getElementById('modal-overlay')!.id = 'retired-overlay';
  if (reason === 'shown') document.getElementById('modal-overlay')!.classList.add('show');
  if (reason === 'route') state.currentView = 'insight';
  if (reason === 'focus') document.getElementById('other')!.focus();
  if (reason === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
  const before = document.body.innerHTML, current = state.importedData, stored = structuredClone(current);
  const preferences = [localStorage.getItem('nutrition-history-range'), localStorage.getItem('nutrition-history-view')];
  loaded(); await settled(); noOpens(); expect(document.body.innerHTML).toBe(before); expect(state.importedData).toBe(current); expect(state.importedData).toEqual(stored); expect([localStorage.getItem('nutrition-history-range'), localStorage.getItem('nutrition-history-view')]).toEqual(preferences); expect(notices.notify).not.toHaveBeenCalled();
});
it.each(['escape', 'root', 'data', 'focus'] as const)('keeps %s retirement active after dispatch until the actual opener finishes', async reason => {
  let complete!: (value: boolean) => void;
  editor.openNutritionEditor.mockImplementationOnce(() => new Promise<boolean>(resolve => {complete = resolve;}));
  await clickHeld(); loaded(); await vi.waitFor(() => expect(editor.openNutritionEditor).toHaveBeenCalledOnce());
  const current = editor.openNutritionEditor.mock.calls[0]![1] as () => boolean; expect(current()).toBe(true);
  if (reason === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
  if (reason === 'root') document.querySelector('[data-nutrition-dashboard-view]')!.remove();
  if (reason === 'data') state.importedData = createDefaultProfileData();
  if (reason === 'focus') document.getElementById('other')!.focus();
  expect(current()).toBe(false); complete(false); await settled(); expect(notices.notify).not.toHaveBeenCalled();
});

it('a second cold control retires the older action even when they share the same pending module and stylesheet', async () => {
  await clickHeld('open'); await clickHeld('open-targets'); loaded();
  await vi.waitFor(() => expect(editor.openNutritionTargets).toHaveBeenCalledOnce()); expect(editor.openNutritionEditor).not.toHaveBeenCalled();
});
it('double-clicking a pending control dispatches only once', async () => {
  await clickHeld(); button('open').click(); loaded();
  await vi.waitFor(() => expect(editor.openNutritionEditor).toHaveBeenCalledOnce());
});
it('failed stylesheet loading keeps summaries unready and retries the existing fixed retry URL', async () => {
  const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
  await clickHeld(); link.dispatchEvent(new Event('error')); await vi.waitFor(() => expect(notices.notify).toHaveBeenCalledOnce()); noOpens();
  expect(context.isNutritionWidgetFeatureReady()).toBe(false); expect(link.isConnected).toBe(false);
  await clickHeld(); expect(new URL(link.href).search).toBe('?lazy-retry=1'); loaded();
  await vi.waitFor(() => expect(editor.openNutritionEditor).toHaveBeenCalledOnce()); expect(notices.notify).toHaveBeenCalledOnce(); warning.mockRestore();
});
it('resident delegated actions retain same-turn event handling with no second cold dispatch', async () => {
  context.registerNutritionEditorDelegates(); const seen: Event[] = [];
  document.addEventListener('click', event => { if ((event.target as Element).closest('[data-nutrition-action]')) seen.push(event); });
  const event = new MouseEvent('click', {bubbles: true, cancelable: true}); button('open').dispatchEvent(event);
  expect(seen).toEqual([event]); expect(event.defaultPrevented).toBe(false); expect(document.querySelector('link[data-nutrition-stylesheet]')).toBeNull(); await settled(); noOpens();
});
it('a retained control outside an actual connected Dashboard owner never starts the editor', async () => {
  const retained = button('open'); document.querySelector('[data-nutrition-dashboard-view]')!.remove(); retained.click();
  const unrelated = document.createElement('button'); unrelated.dataset.nutritionAction = 'open'; document.body.append(unrelated); unrelated.click();
  await settled(); noOpens(); expect(document.querySelector('link[data-nutrition-stylesheet]')).toBeNull();
});

it('reports an owned opener failure after its legitimate mount without suppressing the original error', async () => {
  const error = new Error('Current opener failed'), warning = vi.spyOn(console, 'error').mockImplementation(() => {});
  editor.openNutritionEditor.mockImplementationOnce(async () => {document.getElementById('detail-modal')!.innerHTML = '<div data-nutrition-editor-view>Owned mount</div>'; throw error;});
  await clickHeld(); loaded(); await vi.waitFor(() => expect(notices.notify).toHaveBeenCalledExactlyOnceWith('Meals & Nutrition could not be loaded. Try again.', 'error'));
  expect(warning).toHaveBeenCalledExactlyOnceWith('Meals & Nutrition could not be loaded', error);
});
it.each(['data', 'modal', 'overlay'] as const)('does not report an opener rejection after its %s owner is replaced', async reason => {
  let fail!: (error: Error) => void;
  editor.openNutritionEditor.mockImplementationOnce(() => {document.getElementById('detail-modal')!.innerHTML = '<div data-nutrition-editor-view>Owned mount</div>'; return new Promise<boolean>((_, reject) => {fail = reject;});});
  const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
  await clickHeld(); loaded(); await vi.waitFor(() => expect(editor.openNutritionEditor).toHaveBeenCalledOnce());
  if (reason === 'data') state.importedData = createDefaultProfileData();
  if (reason === 'modal') document.getElementById('detail-modal')!.id = 'retired-modal';
  if (reason === 'overlay') document.getElementById('modal-overlay')!.id = 'retired-overlay';
  const before = document.body.innerHTML; fail(new Error('Retired opener failed')); await settled();
  expect(notices.notify).not.toHaveBeenCalled(); expect(warning).not.toHaveBeenCalled(); expect(document.body.innerHTML).toBe(before);
});
