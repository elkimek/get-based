// @vitest-environment jsdom
import {afterEach, expect, it} from 'vitest';
import {state} from '../js/state.js';
import {disposeDashboardPage, ownDashboardPage} from '../js/dashboard-page-owner.js';
import {hydrateDesktopDashboardPage, hydrateMobileDashboardPage} from '../js/dashboard-page-hydration.js';
import {renderDesktopDashboardPage, type DesktopDashboardPageView} from '../js/desktop-dashboard-presentation.js';
import {renderMobileDashboardPage, type MobileDashboardPageView} from '../js/mobile-dashboard-presentation.js';
import {projectDashboardWidgetFrame} from '../js/dashboard-widget-presentation.js';
const initialProfile = state.currentProfile, initialData = state.importedData;
afterEach(() => {disposeDashboardPage(); document.body.innerHTML = ''; state.currentProfile = initialProfile; state.importedData = initialData;});
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
function desktop(): DesktopDashboardPageView {
  const entry = {def: {id: 'notes', title: 'Notes'}, content: {kind: 'notes' as const, view: {kind: 'notes' as const, rows: [{index: 0, dateLabel: 'January 1', preview: 'Captured note'}]}}};
  return {greeting: {title: 'Dashboard Overview', name: 'Tester', subtitle: '1 widget active'}, dateRange: null,
    onboarding: {mode: 'banner', maleClass: '', femaleClass: '', dob: ''}, reminder: {mode: 'reminder'},
    stickyControls: {organizeLabel: 'Customize', showReset: false}, organizing: false,
    widgets: [projectDashboardWidgetFrame(entry, {hidden: [], order: ['notes']}, 0, [entry], false)], empty: null, footerControls: null};
}
function mobile(): MobileDashboardPageView {
  return {firstName: 'Tester', greetingSub: '1 marker', range: null, stack: {count: '1', actions: {organizeLabel: 'Customize', showReset: false}, hasEntries: true, widgets: desktop().widgets}};
}
function setup(): HTMLElement {
  document.body.innerHTML = '<aside><input id="outside" value="retained"></aside><main></main>';
  return document.querySelector('main')!;
}
function nodes(main: HTMLElement): Node[] {
  const result: Node[] = [], walker = document.createTreeWalker(main, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) result.push(node);
  return result;
}
function replace(main: HTMLElement, view = desktop()): void {
  const html = renderDesktopDashboardPage(view); disposeDashboardPage(); main.innerHTML = html; hydrateDesktopDashboardPage(main, view);
}
it.each(['desktop', 'mobile'] as const)('hydrates %s without replacing SSR elements/text, focus or native listeners', kind => {
  const main = setup(); const view = kind === 'desktop' ? desktop() : mobile();
  main.innerHTML = kind === 'desktop' ? renderDesktopDashboardPage(view as DesktopDashboardPageView) : renderMobileDashboardPage(view as MobileDashboardPageView);
  const before = nodes(main), button = main.querySelector<HTMLButtonElement>('button')!, outside = document.getElementById('outside');
  let clicks = 0; button.addEventListener('click', () => clicks++); button.focus();
  if (kind === 'desktop') hydrateDesktopDashboardPage(main, view as DesktopDashboardPageView); else hydrateMobileDashboardPage(main, view as MobileDashboardPageView);
  expect(nodes(main)).toEqual(before); expect(document.activeElement).toBe(button); button.click(); expect(clicks).toBe(1); expect(document.getElementById('outside')).toBe(outside);
});
it('keeps the page and focused form through a same-profile no-op data replacement and sidebar mutation', async () => {
  const main = setup(); replace(main); const button = main.querySelector<HTMLButtonElement>('button')!; button.focus(); const before = nodes(main);
  (state as {importedData: unknown}).importedData = {notes: []}; document.querySelector('aside')!.append(document.createElement('span')); await tick();
  expect(nodes(main)).toEqual(before); expect(document.activeElement).toBe(button);
});
it.each(['onboarding-banner', 'ai-reminder-banner'])('permits native %s dismissal without clearing the widget grid', async id => {
  const main = setup(); replace(main); const grid = main.querySelector('.dashboard-widgets'), note = main.querySelector('.note-card');
  main.querySelector('#' + id)!.remove(); await tick(); expect(main.querySelector('.dashboard-widgets')).toBe(grid); expect(main.querySelector('.note-card')).toBe(note); expect(main.querySelector('h1')?.textContent).toBe('Hey Tester.');
});
it('replaces the same main repeatedly and keeps fresh owners on the completed profile-switch event', async () => {
  const main = setup(); replace(main); const first = main.querySelector('.note-card')!;
  state.currentProfile = 'next-profile'; replace(main, {...desktop(), greeting: {title: 'Dashboard', name: 'Next', subtitle: ''}});
  const before = nodes(main); globalThis.dispatchEvent(new Event('labcharts-profile-switched')); await tick();
  expect(first.isConnected).toBe(false); expect(nodes(main)).toEqual(before); expect(main.querySelector('h1')?.textContent).toBe('Hey Next.');
});
it('releases the old page when its grid is removed and reinserted', async () => {
  const main = setup(); replace(main); const grid = main.querySelector('.dashboard-widgets')!; grid.remove(); main.append(grid); await tick();
  expect(main.querySelector('.note-card')).toBeNull(); expect(document.getElementById('outside')?.isConnected).toBe(true);
});
it('does not remove a new native route inserted before the old owner observer runs', async () => {
  const main = setup(); replace(main); main.innerHTML = '<section id="next-route"><input value="new route"></section>'; const next = main.querySelector('#next-route'); await tick();
  expect(main.querySelector('#next-route')).toBe(next); expect(main.querySelector('input')?.value).toBe('new route');
});
it('retires a disconnected page while preserving outside controls', async () => {
  const main = setup(); replace(main); main.remove(); await tick(); expect(main.querySelector('.note-card')).toBeNull(); expect(document.getElementById('outside')?.isConnected).toBe(true);
});
it('rejects a foreign ownership root before disturbing the current page', () => {
  const main = setup(); replace(main); const before = nodes(main);
  expect(() => ownDashboardPage(main, document.querySelector('aside')!, () => () => {})).toThrow('Dashboard page root must belong'); expect(nodes(main)).toEqual(before);
});
it('propagates initialization failures and leaves no observer that can clear unrelated markup', async () => {
  const main = setup(); main.innerHTML = '<div id="grid"></div>'; const grid = main.firstElementChild!;
  expect(() => ownDashboardPage(main, grid, () => {throw new Error('hydrate fault');})).toThrow('hydrate fault');
  main.innerHTML = '<p id="fallback">Fallback</p>'; await tick(); expect(main.querySelector('#fallback')?.textContent).toBe('Fallback');
});
