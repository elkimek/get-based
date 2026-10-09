// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {projectDashboardPickerPresentation, type DashboardPickerInput} from '../js/dashboard-picker-presentation.js';
import {dashboardPickerClasses} from '../js/dashboard-picker-classes.js';
import {renderHTML} from '../js/components/DashboardPickerPresentation.svelte.html.js';

function render(input: DashboardPickerInput) {
  const root = document.createElement('div');
  root.innerHTML = renderHTML({view: projectDashboardPickerPresentation(input)});
  return root;
}

it('retains dashboard sections, nested source grids, searches and layout actions', () => {
  const root = render({kind: 'dashboard', hidden: [{id: 'labs', title: 'Labs', source: 'Labs'}], biometrics: [], markers: []});
  expect(root.querySelector('#dashboard-widget-picker-overlay')).not.toBeNull();
  const dialog = root.querySelector('[role="dialog"]')!;
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(dialog.getAttribute('aria-labelledby')).toBe('dashboard-widget-picker-title');
  expect(root.querySelector('h3')?.textContent).toBe('Add dashboard widget');
  expect(root.querySelectorAll('.dashboard-widget-picker-section')).toHaveLength(3);
  expect(root.querySelector('.dashboard-widget-picker-section > .dashboard-widget-picker-grid > .dashboard-widget-picker-source > .dashboard-widget-picker-grid > button')).not.toBeNull();
  expect([...root.querySelectorAll('input')].map(el => [el.id, el.type, el.getAttribute('data-dashboard-widget-input')])).toEqual([
    ['dashboard-biometric-widget-search', 'search', 'filter-biometric-picker'],
    ['dashboard-marker-widget-search', 'search', 'filter-marker-picker'],
  ]);
  expect([...root.querySelectorAll('.dashboard-widget-picker-actions button')].map(el => el.getAttribute('data-dashboard-widget-action'))).toEqual(['customize-layout', 'reset-layout']);
});

it('retains the focused biometric dialog and connect source action', () => {
  const root = render({kind: 'biometric', biometrics: []});
  expect(root.querySelector('.dashboard-biometric-picker')?.getAttribute('aria-labelledby')).toBe('dashboard-biometric-picker-title');
  expect(root.querySelector('h3')?.textContent).toBe('Add biometric metrics');
  expect(root.querySelector('label')?.textContent).toBe('Manual and wearable metrics');
  expect(root.querySelectorAll('.dashboard-widget-picker-section')).toHaveLength(1);
  expect(root.querySelector('#dashboard-marker-widget-search')).toBeNull();
  expect(root.querySelector('.dashboard-widget-picker-actions button')?.getAttribute('data-dashboard-widget-action')).toBe('connect-source');
  const controller = readFileSync('js/dashboard-widget-controls.ts', 'utf8');
  expect(controller).toContain("{ initialFocus: '#dashboard-biometric-widget-search', focusDelay: 50 }");
});

it('retains the configured group order followed by sorted unknown sources and input order within each group', () => {
  const view = projectDashboardPickerPresentation({kind: 'dashboard', hidden: [
    {id: 'z', title: 'Z', source: 'Zebra'}, {id: 'body1', title: 'Body 1', source: 'Body'},
    {id: 'other', title: 'Other'}, {id: 'labs', title: 'Labs', source: 'Labs'},
    {id: 'body2', title: 'Body 2', source: 'Body'}, {id: 'a', title: 'A', source: 'Alpha'},
  ], biometrics: [], markers: []});
  expect(view.fixedGroups.map(group => group.source)).toEqual(['Labs', 'Body', 'Alpha', 'Other', 'Zebra']);
  expect(view.fixedGroups[1]!.cards.map(card => card.id)).toEqual(['body1', 'body2']);
});

it('renders literal untrusted copy and action IDs without introducing markup', () => {
  const literal = '<img src=x onerror="throw 1"> & "quoted"';
  const root = render({kind: 'dashboard', hidden: [{id: literal, title: literal, description: literal, source: literal}],
    biometrics: [{id: literal, label: literal, sub: literal, value: literal, unit: literal, change: literal}],
    markers: [{id: literal, name: literal, category: literal, value: literal, unit: literal, status: 'normal'}],
  });
  expect(root.querySelector('img,script,[onerror],[onclick]')).toBeNull();
  expect([...root.querySelectorAll('.dashboard-widget-picker-card')].map(el => el.getAttribute('data-dashboard-widget-id'))).toEqual([literal, literal, literal]);
  expect(root.querySelector('.dashboard-biometric-widget-option small')?.textContent).toBe(literal);
  expect(root.querySelector('.dashboard-biometric-widget-option .dashboard-widget-picker-title')?.textContent).toBe(`${literal} ${literal}`);
  expect(root.querySelector('.dashboard-marker-widget-option .dashboard-widget-picker-title')?.textContent).toBe(literal);
});

it('preserves biometric subtitle fallbacks and raw interpolation search semantics', () => {
  const root = render({kind: 'biometric', biometrics: [{id: 0, label: null, sub: undefined, value: 0, unit: '', change: false}]});
  const card = root.querySelector('.dashboard-biometric-widget-option')!;
  expect(card.getAttribute('data-dashboard-widget-id')).toBe('0');
  expect(card.getAttribute('data-biometric-search')).toBe('null undefined 0  false');
  expect(card.querySelector('.dashboard-widget-picker-title')?.textContent).toBe('');
  expect(card.querySelector('small')).toBeNull();
  expect(card.querySelector('.dashboard-widget-picker-sub')?.textContent).toBe('0 · latest');
});

it('omits only missing or empty action IDs and preserves false IDs', () => {
  const root = render({kind: 'dashboard', hidden: [{id: null}, {id: undefined}, {id: ''}, {id: false}], biometrics: [], markers: []});
  expect([...root.querySelectorAll('.dashboard-widget-picker-card')].map(el => el.getAttribute('data-dashboard-widget-id'))).toEqual([null, null, null, 'false']);
});

it('keeps exact empty messages and conditional hidden states without changing input records', () => {
  const input: DashboardPickerInput = {kind: 'dashboard', hidden: [], biometrics: [{id: 'weight', label: 'Weight', sub: '', value: 70, unit: 'kg', change: '+1'}], markers: []};
  const before = JSON.stringify(input);
  const root = render(input);
  expect(root.querySelector('.dashboard-widget-picker-section .dashboard-widget-picker-empty')?.textContent).toBe('All dashboard widgets are visible.');
  expect(root.querySelector('#dashboard-biometric-widget-empty')?.hasAttribute('hidden')).toBe(true);
  expect(root.querySelector('#dashboard-marker-widget-empty')?.hasAttribute('hidden')).toBe(false);
  expect(root.querySelector('#dashboard-biometric-widget-empty')?.textContent).toBe('All available biometrics are already in the overview.');
  expect(root.querySelector('#dashboard-marker-widget-empty')?.textContent).toBe('No available markers to add.');
  expect(JSON.stringify(input)).toBe(before);
});

it('uses typed authored presentation with scoped unconditional hover and explicit inherited card typography', () => {
  const component = readFileSync('js/components/DashboardPickerPresentation.svelte', 'utf8');
  const controller = readFileSync('js/dashboard-widget-controls.ts', 'utf8');
  const stylesheet = readFileSync('css/dashboard-picker.tailwind.css', 'utf8');
  expect(component).not.toContain('{@html');
  expect(component).not.toMatch(/style=/);
  expect(controller).not.toContain('function renderDashboardPickerFixedGroups');
  expect(controller).not.toContain('function renderDashboardBiometricWidgetOption');
  expect(controller).not.toContain('function renderDashboardMarkerWidgetOption');
  expect(stylesheet).toContain('@custom-variant picker-ui (&:where(');
  expect(stylesheet).toContain('@custom-variant picker-compound (&:is(');
  expect(stylesheet).toContain('@custom-variant picker-hover (&:hover)');
  expect(dashboardPickerClasses('dashboard-widget-picker-card')).toContain('gb:picker-ui:[font-size:inherit]');
  expect(dashboardPickerClasses('dashboard-widget-picker-card')).toContain('gb:picker-ui:[font-weight:inherit]');
  expect(dashboardPickerClasses('dashboard-widget-picker-card')).toContain('gb:picker-ui:picker-hover:');
});
