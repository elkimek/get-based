// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {configureDataRuntimeDeps, installDataActionDelegates} from '../js/data-view-controls.js';
import {state} from '../js/state.js';

const initialState = Object.getOwnPropertyDescriptors(state);
const initialNodes = [...document.body.childNodes];
const initialActive = document.activeElement;
const initialStorage = [...Array(localStorage.length)].map((_, index) => {
  const key = localStorage.key(index)!;return [key, localStorage.getItem(key)!] as const;
});
let restoreRuntime: ReturnType<typeof configureDataRuntimeDeps>;
const navigate = vi.fn();
const nextTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));
function markup() {
  return `<div class="chart-layers-wrapper"><button type="button" class="chart-layers-trigger" data-lab-data-action="toggle-chart-layers" aria-expanded="false">Layers</button><div id="chart-layers-dropdown" class="chart-layers-dropdown"><label class="chart-layers-row" data-lab-data-action="chart-layers-row"><input type="checkbox" data-lab-data-change="set-note-overlay">Notes</label></div></div>`;
}
function controls() {
  const trigger = document.querySelector<HTMLButtonElement>('.chart-layers-trigger');
  const menu = document.getElementById('chart-layers-dropdown');
  if (!trigger || !menu) throw new Error('Required Chart Layers unit fixture');
  return {trigger, menu};
}
function escape() { document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); }
beforeEach(() => {
  document.body.innerHTML = '<main id="host">' + markup() + '</main><button id="outside">Outside</button>';
  state.currentProfile = 'chart-layers-dismiss-contract';state.noteOverlayMode = 'off';
  navigate.mockClear();restoreRuntime = configureDataRuntimeDeps({navigate});
  installDataActionDelegates();
});
afterEach(async () => {
  // Natural next task also drains the OLD implementation's deferred installs,
  // so a failing red run still removes listeners before restoring the fixture.
  await nextTask();document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  configureDataRuntimeDeps(restoreRuntime);vi.restoreAllMocks();
  for (const key of Reflect.ownKeys(state)) if (!Object.hasOwn(initialState, key)) Reflect.deleteProperty(state, key);
  Object.defineProperties(state, initialState);
  localStorage.clear();for (const [key, value] of initialStorage) localStorage.setItem(key, value);
  document.body.replaceChildren(...initialNodes);
  if (initialActive instanceof HTMLElement && initialActive.isConnected) initialActive.focus();
});

it('handles Escape in the same turn as the genuine delegated trigger click', () => {
  const {trigger, menu} = controls();
  trigger.click();expect(menu.classList.contains('open')).toBe(true);
  escape();
  expect(menu.classList.contains('open')).toBe(false);
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger);
});

it('cleans every toggle-close cycle so one Escape restores focus only once', async () => {
  const {trigger, menu} = controls();const focus = vi.spyOn(trigger, 'focus');
  for (let index = 0; index < 3; index++) {
    trigger.click();await nextTask();trigger.click();
    expect(menu.classList.contains('open')).toBe(false);
  }
  trigger.click();await nextTask();escape();
  expect(menu.classList.contains('open')).toBe(false);
  expect(focus).toHaveBeenCalledTimes(1);
});

it('dismisses a refreshed category immediately without calling detached old-trigger focus', async () => {
  const old = controls();old.trigger.click();await nextTask();
  const oldFocus = vi.spyOn(old.trigger, 'focus');
  document.getElementById('host')!.innerHTML = markup();
  const current = controls();const currentFocus = vi.spyOn(current.trigger, 'focus');
  current.trigger.click();escape();
  expect(current.menu.classList.contains('open')).toBe(false);
  expect(current.trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(current.trigger);
  expect(oldFocus).not.toHaveBeenCalled();
  expect(currentFocus).toHaveBeenCalledTimes(1);
});

it('keeps row containment, native checkbox persistence and outside-click focus ownership', () => {
  const {trigger, menu} = controls();trigger.click();
  const afterDelegates = vi.fn();document.addEventListener('click', afterDelegates);
  try {
    const input = menu.querySelector<HTMLInputElement>('input')!;input.click();
    expect(input.checked).toBe(true);
    expect(menu.classList.contains('open')).toBe(true);
    expect(afterDelegates).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('labcharts-chart-layers-dismiss-contract-noteOverlay')).toBe('on');
    const outside = document.getElementById('outside')!;outside.focus();outside.click();
    expect(menu.classList.contains('open')).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(outside);
    expect(afterDelegates).toHaveBeenCalledTimes(1);
  } finally { document.removeEventListener('click', afterDelegates); }
});
