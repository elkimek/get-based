// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Actual controller/domain/runtime/modal/event-target/renderer. Only the chart
// renderer boundary is replaced; frames/timers below are isolated unit stimuli.
const chart = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('../js/charts.js', () => ({ refreshChartThemeColors: chart.refresh }));

type Controller = typeof import('../js/settings-tweaks.js');
type Theme = typeof import('../js/theme.js');
const fields = ['requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'refreshSettingsWearables'] as const;
let controller: Controller;
let theme: Theme;
let queue: Map<number, FrameRequestCallback>;
let nextFrame: number;
let descriptors: Map<string, PropertyDescriptor | undefined>;
let rootAttrs: Array<readonly [string, string]>;
let head: string;
let calls: string[];
let themeEvents: unknown[];
let themeListener: EventListener;

function property(name: string, value: unknown): void {
  Object.defineProperty(window, name, { configurable: true, writable: true, value });
}
function flushFrame(): void {
  // Snapshot IDs, not callbacks. A real cancellation can still remove an ID
  // during this flush; new callbacks wait for the next disclosed unit frame.
  for (const id of [...queue.keys()]) {
    const callback = queue.get(id);
    queue.delete(id);
    callback?.(0);
  }
}
function timers(): void { vi.advanceTimersByTime(0); }
function chartTurn(): void { flushFrame(); timers(); }
function activeTheme(): string | null {
  return document.querySelector('.tweaks-theme-btn.active')?.getAttribute('data-theme-id') ?? null;
}
function input(id: string): HTMLInputElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLInputElement)) throw new Error('Missing native input ' + id);
  return node;
}
function action(name: string): HTMLElement {
  const node = document.querySelector('#tweaks-panel [data-tweaks-action="' + name + '"]');
  if (!(node instanceof HTMLElement)) throw new Error('Missing public action ' + name);
  return node;
}
function open(): void {
  controller.openTweaksPanel();
  timers(); // Only the original modal focus-delay timer, not stylesheet readiness.
}
function resetLog(): void { calls.length = 0; themeEvents.length = 0; chart.refresh.mockClear(); }

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  descriptors = new Map(fields.map(field => [field, Object.getOwnPropertyDescriptor(window, field)]));
  rootAttrs = [...document.documentElement.attributes].map(a => [a.name, a.value] as const);
  head = document.head.innerHTML;
  document.body.innerHTML = '<button id="tweaks-controller-launcher">Open</button>';
  localStorage.clear();
  queue = new Map(); nextFrame = 1; calls = []; themeEvents = [];
  property('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrame++; queue.set(id, callback); return id;
  });
  property('cancelAnimationFrame', (id: number) => queue.delete(id));
  property('matchMedia', (media: string): MediaQueryList => ({ matches: false, media, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } }));
  property('refreshSettingsWearables', undefined);
  theme = await import('../js/theme.js');
  controller = await import('../js/settings-tweaks.js');
  theme.setTheme('dark');
  theme.setAccentOverride('');
  theme.setSunsetMode(false);
  theme.setCrtEffectsEnabled(false);
  controller.configureSettingsTweaksRuntime({ updateSettingsUI: () => calls.push('settings') });
  themeListener = event => themeEvents.push((event as CustomEvent<unknown>).detail);
  window.addEventListener('labcharts-themechange', themeListener);
  document.getElementById('tweaks-controller-launcher')!.focus();
  open(); resetLog();
});
afterEach(async () => {
  controller?.closeTweaksPanel();
  window.removeEventListener('labcharts-themechange', themeListener);
  queue?.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
  for (const field of fields) {
    const original = descriptors.get(field);
    if (original) Object.defineProperty(window, field, original);
    else Reflect.deleteProperty(window, field);
  }
  localStorage.clear();
  document.body.innerHTML = '';
  document.head.innerHTML = head;
  for (const a of [...document.documentElement.attributes]) document.documentElement.removeAttribute(a.name);
  for (const [name, value] of rootAttrs) document.documentElement.setAttribute(name, value);
  await Promise.resolve(); // Let native mutation cleanup observe removed owners.
});

it('marks the final choice immediately and commits only after two actual runtime adapter frames', () => {
  controller.scheduleSettingsThemeChange('light');
  controller.scheduleSettingsThemeChange('dark');
  controller.scheduleSettingsThemeChange('light');
  expect(activeTheme()).toBe('light'); expect(theme.getTheme()).toBe('dark');
  expect(themeEvents).toEqual([]); expect(calls).toEqual([]); expect(chart.refresh).not.toHaveBeenCalled();
  flushFrame();
  expect(theme.getTheme()).toBe('dark'); expect(themeEvents).toEqual([]);
  flushFrame();
  expect(theme.getTheme()).toBe('light'); expect(themeEvents).toEqual([{ theme: 'light' }]);
  expect(calls).toEqual(['settings']); expect(chart.refresh).not.toHaveBeenCalled();
  flushFrame(); expect(chart.refresh).not.toHaveBeenCalled();
  timers(); expect(chart.refresh).toHaveBeenCalledExactlyOnceWith({ batchSize: 4 });
});
it('cancels the old second-stage frame when another choice arrives', () => {
  controller.scheduleSettingsThemeChange('light'); flushFrame();
  controller.scheduleSettingsThemeChange('dark');
  expect(activeTheme()).toBe('dark'); flushFrame();
  expect(themeEvents).toEqual([]); expect(calls).toEqual([]);
  flushFrame();
  expect(theme.getTheme()).toBe('dark'); expect(themeEvents).toEqual([{ theme: 'dark' }]);
  chartTurn(); expect(chart.refresh).toHaveBeenCalledExactlyOnceWith({ batchSize: 4 });
});
it.each(['first-frame', 'second-frame', 'timer-fallback'] as const)('direct selection cancels stale deferred work at %s', stage => {
  if (stage === 'timer-fallback') property('requestAnimationFrame', undefined);
  controller.scheduleSettingsThemeChange('light');
  if (stage === 'second-frame') flushFrame();
  controller.selectTweaksTheme('dark');
  expect(theme.getTheme()).toBe('dark'); expect(activeTheme()).toBe('dark');
  flushFrame(); flushFrame(); timers();
  expect(themeEvents).toEqual([{ theme: 'dark' }]); expect(calls).toEqual(['settings']);
  expect(chart.refresh).toHaveBeenCalledExactlyOnceWith({ batchSize: 4 });
});
it('uses the native runtime absence fallback asynchronously and still keeps only the latest choice', () => {
  property('requestAnimationFrame', undefined); property('cancelAnimationFrame', undefined);
  controller.scheduleSettingsThemeChange('light'); controller.scheduleSettingsThemeChange('dark'); controller.scheduleSettingsThemeChange('light');
  expect(activeTheme()).toBe('light'); expect(theme.getTheme()).toBe('dark'); expect(themeEvents).toEqual([]);
  timers(); expect(theme.getTheme()).toBe('light'); expect(themeEvents).toEqual([{ theme: 'light' }]);
  expect(calls).toEqual(['settings']); expect(chart.refresh).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(chart.refresh).toHaveBeenCalledExactlyOnceWith({ batchSize: 4 });
});
it.each([true, false])('coalesces chart changes before and after the frame (RAF=%s)', raf => {
  if (!raf) property('requestAnimationFrame', undefined);
  controller.selectTweaksAccent('blue'); controller.toggleTweaksSunsetMode(true); controller.selectTweaksAccent('green');
  expect(chart.refresh).not.toHaveBeenCalled();
  if (raf) flushFrame();
  expect(chart.refresh).not.toHaveBeenCalled();
  controller.toggleTweaksSunsetMode(false); // Cancel the first frame's pending chart timeout.
  expect(chart.refresh).not.toHaveBeenCalled();
  if (raf) flushFrame();
  expect(chart.refresh).not.toHaveBeenCalled(); timers();
  expect(chart.refresh).toHaveBeenCalledExactlyOnceWith({ batchSize: 4 });
});
it.each([false, true])('refreshes real Settings/Tweaks before conditional wearables (Settings shown=%s)', shown => {
  const settings = document.createElement('div'); settings.id = 'settings-modal';
  if (shown) settings.classList.add('show'); document.body.appendChild(settings);
  const native = input('tweaks-sunset-mode');
  controller.configureSettingsTweaksRuntime({ updateSettingsUI: () => { calls.push('settings'); expect(native.checked).toBe(false); } });
  property('refreshSettingsWearables', () => { calls.push('wearables'); expect(native.checked).toBe(true); });
  controller.toggleTweaksSunsetMode(true);
  expect(native.checked).toBe(true); expect(calls).toEqual(shown ? ['settings', 'wearables'] : ['settings']);
  expect(chart.refresh).not.toHaveBeenCalled(); chartTurn();
  expect(chart.refresh).toHaveBeenCalledExactlyOnceWith({ batchSize: 4 });
});
it('routes actual authored theme and accent buttons through the real domain', () => {
  const light = [...document.querySelectorAll<HTMLButtonElement>('.tweaks-theme-btn')].find(button => button.dataset.themeId === 'light')!;
  light.querySelector('span:last-child')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(theme.getTheme()).toBe('light'); expect(activeTheme()).toBe('light');
  const blue = [...document.querySelectorAll<HTMLButtonElement>('.tweaks-accent-btn')].find(button => button.dataset.accentId === 'blue')!;
  blue.click(); expect(theme.getAccentOverride()).toBe('blue');
  expect(document.querySelector('.tweaks-accent-btn.active')).toBe(blue);
});
it('flips real proxy toggles once and native change follows the checked property without reinverting', () => {
  controller.selectTweaksTheme(theme.THEMES.find(world => theme.supportsCrtEffects(world.id))!.id);
  for (const id of ['tweaks-sunset-mode', 'tweaks-crt-effects']) {
    const native = input(id), label = native.closest('label')!, slider = label.querySelector('.toggle-slider')!;
    expect(native.checked).toBe(false); expect(native.defaultChecked).toBe(false);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true }); slider.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); expect(native.checked).toBe(true);
    label.click(); expect(native.checked).toBe(false);
    native.checked = true; native.dispatchEvent(new Event('change', { bubbles: true }));
    expect(native.checked).toBe(true); expect(native.defaultChecked).toBe(false);
    expect(id === 'tweaks-sunset-mode' ? theme.isSunsetMode() : theme.isCrtEffectsEnabled()).toBe(true);
  }
  controller.selectTweaksTheme('dark');
  expect(input('tweaks-crt-effects').checked).toBe(true);
  expect(input('tweaks-crt-effects').disabled).toBe(true);
  expect(document.getElementById('tweaks-crt-effects-row')!.hidden).toBe(true);
});
it('ignores a disabled unsupported CRT proxy without changing native/domain state', () => {
  const native = input('tweaks-crt-effects'); expect(native.disabled).toBe(true);
  native.closest('label')!.querySelector('.toggle-slider')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(native.checked).toBe(false); expect(theme.isCrtEffectsEnabled()).toBe(false);
  expect(calls).toEqual([]); expect(themeEvents).toEqual([]);
});
it.each([
  ['reset-dashboard', 'resetDashboardWidgets', true],
  ['clear-dashboard', 'clearDashboardWidgets', true],
  ['organize-dashboard', 'toggleDashboardOrganizeMode', true],
  ['send-feedback', 'openFeedbackModal', false],
] as const)('keeps public %s callback and cleanup order', (name, callback, presentAtCallback) => {
  const spies = { clearDashboardWidgets: vi.fn(), resetDashboardWidgets: vi.fn(), toggleDashboardOrganizeMode: vi.fn(), openFeedbackModal: vi.fn() };
  spies[callback].mockImplementation((...args: unknown[]) => {
    expect(!!document.getElementById('tweaks-panel-overlay')).toBe(presentAtCallback);
    expect(args).toEqual(name === 'organize-dashboard' ? [true] : []);
  });
  controller.configureSettingsTweaksRuntime(spies);
  const target = action(name), nested = document.createElement('span'); target.appendChild(nested);
  nested.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(document.getElementById('tweaks-panel-overlay')).toBeNull();
  expect(spies[callback]).toHaveBeenCalledTimes(1);
  for (const key of Object.keys(spies) as Array<keyof typeof spies>) if (key !== callback) expect(spies[key]).not.toHaveBeenCalled();
});
it('scopes unknown/outside/non-action targets while preserving Close and native backdrop cleanup', () => {
  const feedback = vi.fn(); controller.configureSettingsTweaksRuntime({ openFeedbackModal: feedback });
  const panel = document.getElementById('tweaks-panel')!;
  const outside = document.createElement('button'); outside.dataset.tweaksAction = 'send-feedback'; document.body.appendChild(outside); outside.click();
  const unknown = document.createElement('button'); unknown.dataset.tweaksAction = 'unknown'; panel.appendChild(unknown); unknown.click();
  panel.querySelector('.tweaks-section-title')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(document.getElementById('tweaks-panel')).toBe(panel); expect(feedback).not.toHaveBeenCalled();
  const close = new MouseEvent('click', { bubbles: true, cancelable: true }); action('close').dispatchEvent(close);
  expect(close.defaultPrevented).toBe(true); expect(document.getElementById('tweaks-panel-overlay')).toBeNull();
  open(); document.getElementById('tweaks-panel-overlay')!.click();
  expect(document.getElementById('tweaks-panel-overlay')).toBeNull(); expect(feedback).not.toHaveBeenCalled();
});
it('replaces an open owner once, restores scroll and prevents detached delegates affecting the new panel', () => {
  controller.closeTweaksPanel(); document.body.style.overflow = 'clip';
  property('matchMedia', (media: string): MediaQueryList => ({ matches: media === '(max-width: 768px)', media,
    onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } }));
  open(); const first = document.getElementById('tweaks-panel-overlay')!;
  expect(document.body.style.overflow).toBe('hidden');
  const stale = first.querySelector<HTMLButtonElement>('[data-tweaks-action="send-feedback"]')!;
  const feedback = vi.fn(); controller.configureSettingsTweaksRuntime({ openFeedbackModal: feedback });
  open(); const second = document.getElementById('tweaks-panel-overlay')!;
  expect(first.isConnected).toBe(false); expect(second).not.toBe(first);
  expect(document.querySelectorAll('#tweaks-panel-overlay')).toHaveLength(1);
  expect(second.dataset.delegatedActions).toBe('1');
  stale.click(); expect(feedback).not.toHaveBeenCalled(); expect(second.isConnected).toBe(true);
  action('send-feedback').click(); expect(feedback).toHaveBeenCalledTimes(1);
  expect(second.isConnected).toBe(false); expect(document.body.style.overflow).toBe('clip');
});
