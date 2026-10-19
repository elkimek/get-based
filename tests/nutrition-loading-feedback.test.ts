// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDefaultProfileData } from '../js/profile.js';
import { renderHTML } from '../js/components/NutritionDashboard.svelte.html.js';
import { projectNutritionDashboard } from '../js/nutrition-dashboard-model.js';
import { resolveNutritionTargets } from '../js/nutrition-targets.js';

const openers = vi.hoisted(() => ({openNutritionEditor: vi.fn(), openNutritionHistory: vi.fn(), openNutritionTargets: vi.fn(), openFluidLog: vi.fn()}));
const notices = vi.hoisted(() => ({notify: vi.fn()}));
vi.mock('../js/nutrition.js', () => openers);
vi.mock('../js/utils.js', async original => ({...await original<typeof import('../js/utils.js')>(), showNotification: notices.notify}));
let context: typeof import('../js/nutrition-context.js');
let state: typeof import('../js/state.js')['state'];
let stylesheet: HTMLLinkElement;
const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined]> = [];
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  const original = EventTarget.prototype.addEventListener;
  vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(function (this: EventTarget, name: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (listener) listeners.push([this, name, listener, options]);
    return original.call(this, name, listener, options);
  });
  const view = projectNutritionDashboard({totalMeals: 2}, resolveNutritionTargets({nutritionTargets: {widgetNutrients: ['proteinG', 'fluidMl']}}));
  document.body.innerHTML = `<main id="main-content">${renderHTML({view})}</main><div id="modal-overlay"><div id="detail-modal"><p>Retained modal</p></div></div><button id="other">Other focus</button>`;
  document.head.innerHTML = '';
  ({state} = await import('../js/state.js')); state.currentProfile = 'feedback'; state.currentView = 'body'; state.importedData = createDefaultProfileData(); state.nutritionSummary = null;
  context = await import('../js/nutrition-context.js');
  for (const open of Object.values(openers)) open.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  vi.restoreAllMocks(); for (const [target, name, listener, options] of listeners.splice(0)) target.removeEventListener(name, listener, options);
  document.head.innerHTML = ''; document.body.innerHTML = '';
});
function button(action = 'open') {return document.querySelector<HTMLButtonElement>(`[data-nutrition-action="${action}"]`)!;}
function status() {return document.querySelector<HTMLElement>('[data-nutrition-loading-status]')!;}
function click(action = 'open') {const control = button(action); control.focus(); control.click(); stylesheet = document.querySelector<HTMLLinkElement>('link[data-nutrition-stylesheet]')!; return control;}
function loaded() {Object.defineProperty(stylesheet, 'sheet', {value: {}, configurable: true}); stylesheet.dispatchEvent(new Event('load'));}
async function settled() {await new Promise(resolve => setTimeout(resolve, 0)); await new Promise(resolve => setTimeout(resolve, 0));}

it('authors an empty polite atomic status without starting work on hover or keyboard focus', async () => {
  expect(status().getAttribute('role')).toBe('status'); expect(status().getAttribute('aria-live')).toBe('polite'); expect(status().getAttribute('aria-atomic')).toBe('true'); expect(status().textContent).toBe('');
  button().dispatchEvent(new MouseEvent('pointerover', {bubbles: true})); button().focus(); await settled();
  expect(context.isNutritionFeatureReady()).toBe(false); expect(document.querySelector('link[data-nutrition-stylesheet]')).toBeNull(); expect(button().hasAttribute('aria-busy')).toBe(false); for (const open of Object.values(openers)) expect(open).not.toHaveBeenCalled();
});
it.each([['open', 'Opening the meal editor…', 'openNutritionEditor'], ['open-history', 'Opening meal history…', 'openNutritionHistory'], ['open-targets', 'Opening Nutrition setup…', 'openNutritionTargets'], ['open-fluid-log', 'Opening the drink logger…', 'openFluidLog']] as const)('announces %s immediately while retaining the exact live control and label', async (action, message, method) => {
  const original = button(action), label = original.textContent, profile = state.importedData, before = structuredClone(profile);
  const control = click(action); expect(control).toBe(original); expect(control.getAttribute('aria-busy')).toBe('true'); expect(control.textContent).toBe(label); expect(control.disabled).toBe(false); expect(document.activeElement).toBe(control); expect(status().textContent).toBe(message);
  loaded(); await vi.waitFor(() => expect(control.hasAttribute('aria-busy')).toBe(false)); expect(status().textContent).toBe(''); expect(openers[method]).toHaveBeenCalledOnce(); expect(state.importedData).toBe(profile); expect(state.importedData).toEqual(before);
});
it.each([null, 'false', 'true', 'original'] as const)('restores original aria-busy=%s and prior authored status exactly', async busy => {
  if (busy !== null) button().setAttribute('aria-busy', busy); status().textContent = 'Prior status';
  const control = click(); expect(control.getAttribute('aria-busy')).toBe('true'); loaded(); await settled();
  expect(control.getAttribute('aria-busy')).toBe(busy); expect(status().textContent).toBe('Prior status');
});
it('Escape releases feedback in the same event and a delivered late load cannot open', async () => {
  const control = click(), escape = new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true});
  let delivered: Event | undefined;
  document.addEventListener('keydown', event => {delivered = event;}, {once: true});
  control.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(true); expect(delivered).toBe(escape);
  expect(control.hasAttribute('aria-busy')).toBe(false); expect(status().textContent).toBe(''); expect(document.activeElement).toBe(control);
  loaded(); await settled(); for (const open of Object.values(openers)) expect(open).not.toHaveBeenCalled();
});
it('idle Escape and unrelated keys preserve native/default behavior', async () => {
  const idle = new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true});
  button().focus(); button().dispatchEvent(idle); expect(idle.defaultPrevented).toBe(false);
  const control = click(), enter = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true});
  control.dispatchEvent(enter); expect(enter.defaultPrevented).toBe(false);
  expect(control.getAttribute('aria-busy')).toBe('true'); expect(status().textContent).toBe('Opening the meal editor…');
  loaded(); await settled(); expect(openers.openNutritionEditor).toHaveBeenCalledOnce();
});
it.each(['focus', 'busy', 'profile', 'data', 'root', 'route', 'modal'] as const)('cancels pending work without consuming a foreign or retired %s owner Escape', async reason => {
  const control = click(), oldStatus = status(), root = document.querySelector('[data-nutrition-dashboard-view]')!;
  if (reason === 'focus') document.getElementById('other')!.focus();
  if (reason === 'busy') control.setAttribute('aria-busy', 'foreign');
  if (reason === 'profile') state.currentProfile = 'replacement';
  if (reason === 'data') state.importedData = createDefaultProfileData();
  if (reason === 'root') root.replaceWith(root.cloneNode(true));
  if (reason === 'route') state.currentView = 'dashboard';
  if (reason === 'modal') document.getElementById('detail-modal')!.innerHTML = '<button>New dialog</button>';
  const active = document.activeElement, escape = new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true});
  document.dispatchEvent(escape); expect(escape.defaultPrevented).toBe(false); expect(document.activeElement).toBe(active);
  expect(control.getAttribute('aria-busy')).toBe(reason === 'busy' ? 'foreign' : null); expect(oldStatus.textContent).toBe('');
  loaded(); await settled(); for (const open of Object.values(openers)) expect(open).not.toHaveBeenCalled();
});
it('the previous request finally cannot clear a newer action waiting in its actual opener', async () => {
  let finish!: (value: boolean) => void; openers.openNutritionTargets.mockImplementationOnce(() => new Promise<boolean>(resolve => {finish = resolve;}));
  const old = click(); const current = click('open-targets'); expect(old.hasAttribute('aria-busy')).toBe(false); expect(current.getAttribute('aria-busy')).toBe('true');
  loaded(); await vi.waitFor(() => expect(openers.openNutritionTargets).toHaveBeenCalledOnce()); await settled();
  expect(openers.openNutritionEditor).not.toHaveBeenCalled(); expect(current.getAttribute('aria-busy')).toBe('true'); expect(status().textContent).toBe('Opening Nutrition setup…');
  finish(true); await vi.waitFor(() => expect(current.hasAttribute('aria-busy')).toBe(false)); expect(status().textContent).toBe('');
});
it('failed stylesheet fetch clears feedback and retry obtains a fresh owned receipt', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {}); const control = click(); stylesheet.dispatchEvent(new Event('error'));
  await vi.waitFor(() => expect(notices.notify).toHaveBeenCalledOnce()); expect(control.hasAttribute('aria-busy')).toBe(false); expect(status().textContent).toBe('');
  click(); expect(new URL(stylesheet.href).search).toBe('?lazy-retry=1'); expect(control.getAttribute('aria-busy')).toBe('true'); loaded();
  await vi.waitFor(() => expect(control.hasAttribute('aria-busy')).toBe(false)); expect(openers.openNutritionEditor).toHaveBeenCalledOnce(); expect(log).toHaveBeenCalledOnce();
});
it.each(['profile', 'data', 'root', 'focus'] as const)('retired %s owners release only the retained old feedback nodes', async reason => {
  const control = click(), oldStatus = status(), root = document.querySelector('[data-nutrition-dashboard-view]')!;
  if (reason === 'profile') state.currentProfile = 'replacement';
  if (reason === 'data') state.importedData = createDefaultProfileData();
  if (reason === 'focus') document.getElementById('other')!.focus();
  if (reason === 'root') {const replacement = root.cloneNode(true) as HTMLElement; replacement.querySelector('[data-nutrition-action="open"]')!.setAttribute('aria-busy', 'replacement'); replacement.querySelector('[data-nutrition-loading-status]')!.textContent = 'New owner'; root.replaceWith(replacement);}
  loaded(); await settled(); expect(control.hasAttribute('aria-busy')).toBe(false); expect(oldStatus.textContent).toBe(''); for (const open of Object.values(openers)) expect(open).not.toHaveBeenCalled();
  if (reason === 'root') {expect(button().getAttribute('aria-busy')).toBe('replacement'); expect(status().textContent).toBe('New owner');}
});
it('cleanup preserves a foreign busy attribute or status update on retained nodes', async () => {
  const control = click(); control.setAttribute('aria-busy', 'foreign'); status().textContent = 'Foreign status'; loaded(); await settled();
  expect(control.getAttribute('aria-busy')).toBe('foreign'); expect(status().textContent).toBe('Foreign status');
});
it('resident controls keep their original same-turn delegate ownership without cold feedback', async () => {
  context.registerNutritionEditorDelegates(); const seen: Event[] = []; document.addEventListener('click', event => {seen.push(event);});
  const event = new MouseEvent('click', {bubbles: true}); button().dispatchEvent(event); expect(seen).toEqual([event]); expect(button().hasAttribute('aria-busy')).toBe(false); expect(status().textContent).toBe(''); expect(document.querySelector('link[data-nutrition-stylesheet]')).toBeNull();
});

it('legacy controls without an authored status port preserve every original attribute during cold loading', async () => {
  status().remove(); const control = button(), attributes = control.outerHTML;
  click(); expect(control.outerHTML).toBe(attributes); loaded(); await settled(); expect(control.outerHTML).toBe(attributes); expect(openers.openNutritionEditor).toHaveBeenCalledOnce();
});


it.each([['open', 'openNutritionEditor'], ['open-history', 'openNutritionHistory'], ['open-targets', 'openNutritionTargets'], ['open-fluid-log', 'openFluidLog']] as const)('owns %s focus without scroll when native click did not focus its button', async (action, method) => {
  const control = button(action), previous = document.getElementById('other')!, label = control.textContent, profile = state.importedData, before = structuredClone(profile);
  previous.focus(); expect(document.activeElement).toBe(previous);
  const focus = vi.spyOn(control, 'focus'), delivered: Event[] = [];
  control.addEventListener('click', event => delivered.push(event), {once: true});
  const event = new MouseEvent('click', {bubbles: true, cancelable: true}); control.dispatchEvent(event);
  stylesheet = document.querySelector<HTMLLinkElement>('link[data-nutrition-stylesheet]')!;
  expect(delivered).toEqual([event]); expect(event.defaultPrevented).toBe(true);
  expect(focus).toHaveBeenCalledExactlyOnceWith({preventScroll: true}); expect(document.activeElement).toBe(control);
  expect(button(action)).toBe(control); expect(control.textContent).toBe(label); expect(control.disabled).toBe(false); expect(control.getAttribute('aria-busy')).toBe('true');
  loaded(); await vi.waitFor(() => expect(control.hasAttribute('aria-busy')).toBe(false)); expect(openers[method]).toHaveBeenCalledOnce();
  expect(control.hasAttribute('aria-busy')).toBe(false); expect(status().textContent).toBe(''); expect(document.activeElement).toBe(control);
  expect(state.importedData).toBe(profile); expect(state.importedData).toEqual(before);
});
