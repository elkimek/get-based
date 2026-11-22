// @vitest-environment jsdom
import {createRequire} from 'node:module';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createLensPageHandlers} from '../js/lens-pages.js';
import {getLensContentGrid} from '../js/lens-page-shell.js';
import type {LensDataPageView} from '../js/lens-data-page-presentation.js';
import {state} from '../js/state.js';
import {createDefaultProfileData} from '../js/profile.js';
import type {DashboardPriorityView} from '../types/dashboard-lab-marker-views.js';
import {expectNativeReview} from './helpers/native-review-dom.js';

const load = createRequire(import.meta.url);
const captured = vi.hoisted(() => ({view: null as LensDataPageView | null}));
vi.mock('../js/components/LensDataPage.svelte.html.js', async original => {
  const actual = await original<typeof import('../js/components/LensDataPage.svelte.html.js')>();
  return {...actual, renderHTML: ({view}: {view: LensDataPageView}) => {
    captured.view = view;
    return actual.renderHTML({view});
  }};
});

const recordedMarker = '<em>Saved marker</em>';
const defaultProfile = state.currentProfile;
const saved = state.importedData;
let main: HTMLElement;
beforeEach(() => {
  captured.view = null;
  state.currentProfile = 'synthetic-native-lens';
  state.importedData = createDefaultProfileData();
  main = document.createElement('main');
  main.id = 'main-content';
  document.body.appendChild(main);
  localStorage.clear();
});
afterEach(() => {
  state.currentProfile = defaultProfile;
  state.importedData = saved;
  main.remove();
  localStorage.clear();
});

const priority: DashboardPriorityView = {
  kind: 'priority', id: 'fixture.recorded', name: recordedMarker, accessibleLabel: 'View recorded marker',
  statusClass: 'normal', dotStatus: 'normal', priority: 'Synthetic collection',
  value: '5', unit: 'mmol/L', sparkline: {kind: 'empty', status: 'normal', points: '', width: 10, height: 10, cx: '', cy: ''},
};

it.each(['empty labs', 'saved labs', 'genome', 'biometrics'] as const)(
  'mounts native %s with the same labels and typed actions as the public lens handler',
  async scenario => {
    const setupDropZone = vi.fn();
    const handlers = createLensPageHandlers({
      setupDropZone, getLensContentGrid, buildDashboardWidgetContext: (input: unknown) => input,
      projectLabsPriorityBanner: () => priority,
      projectDashboardQuickMarkersWidget: () => ({kind: 'quick-markers', rows: []}),
      projectDashboardKeyTrendsWidget: () => ({rows: []}),
      projectDashboardGenomeWidget: () => ({kind: 'empty', contributionHref: null}),
      projectDashboardWearableTilesWidget: () => ({kind: 'wearables', count: '1', pluralSuffix: '', sync: null, rows: [
        {kind: 'populated', id: 'weight', label: 'Weight', accessibleLabel: 'Review saved weight',
          value: '71', unit: 'kg', change: '', remove: {id: 'weight', label: 'Remove weight tile'}},
      ]}),
    });
    if (scenario === 'genome') {
      (state.importedData as {genetics: unknown}).genetics = {
        snps: {}, mtdna: {haplogroup: 'H1'}, source: 'Maternal import <b>fixture</b>',
      };
      handlers.showGenomeLens();
    } else if (scenario === 'biometrics') {
      handlers.showBodyLens();
    } else {
      handlers.showLabs({dates: scenario === 'saved labs' ? ['2026-06-01'] : [], categories: {}});
    }
    const view = captured.view as LensDataPageView | null;
    expect(view).not.toBeNull();
    const original = main.innerHTML;
    expect(setupDropZone).toHaveBeenCalledTimes(scenario.endsWith('labs') ? 1 : 0);
    expect(document.getElementById('main-content')).toBe(main);
    const before = JSON.stringify(state.importedData);

    const component = load('../js/components/LensDataPage.svelte.native.js') as typeof import('../js/components/LensDataPage.svelte.native.js');
    await expectNativeReview(original, root => {
      const mounted = component.mount(component.default, {target: root, props: {view: view!}});
      component.flushSync();
      return () => component.unmount(mounted);
    }, root => {
      const ids = [...root.querySelectorAll('[data-widget-id]')].map(widget => widget.getAttribute('data-widget-id'));
      if (scenario === 'empty labs') {
        expect(root.querySelector('#drop-zone')?.textContent).toContain('Drop a lab PDF');
        expect(ids).toEqual([]);
      } else if (scenario === 'saved labs') {
        expect(ids).toEqual(['quick-markers', 'key-trends']);
        expect(root.textContent).toContain(recordedMarker);
        expect(root.querySelector('em')).toBeNull();
      } else if (scenario === 'genome') {
        expect(ids).toEqual(['genome', 'genome-import']);
        expect(root.textContent).toContain('H1');
        expect(root.querySelector('b')).toBeNull();
      } else {
        expect(ids).toEqual(['wearables', 'body-sources']);
        expect(root.textContent).toContain('71');
      }
    });
    expect(main.innerHTML).toBe(original);
    expect(JSON.stringify(state.importedData)).toBe(before);
    expect(localStorage.length).toBe(0);
  },
);
