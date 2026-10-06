// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { disposeNutritionAISettings, getNutritionAISettingsView, mountNutritionAISettings } from '../js/nutrition-ai-settings-component.js';
import type { NutritionAISettingsSnapshot } from '../js/nutrition-ai-settings-contract.js';

const initial: NutritionAISettingsSnapshot = {
  selectedValue: '', automaticLabel: 'Follow chat assistant — Vision A', automaticDisabled: false, providerDisplay: 'Local AI',
  groups: [{ label: 'Local AI vision models', options: [{ value: 'route-b', label: 'Vision B — Local · no token charge' }] }],
};
function mounted(snapshot = initial) {
  const host = document.createElement('div');
  document.body.append(host);
  return { host, view: mountNutritionAISettings(host, snapshot) };
}
afterEach(() => { disposeNutritionAISettings(); document.body.replaceChildren(); });

it('escapes catalog names and route values and retains public action/link contracts', () => {
  mounted({ ...initial, providerDisplay: '<svg onload=alert(1)>', groups: [{ label: '<img src=x>', options: [{ value: 'route" onclick="unsafe', label: '<img src=x onerror=alert(1)>' }] }] });
  expect(document.querySelector('option[value]')!.textContent).toBe(initial.automaticLabel);
  const option = document.querySelector('optgroup option') as HTMLOptionElement;
  expect(option.value).toBe('route" onclick="unsafe');
  expect(option.textContent).toBe('<img src=x onerror=alert(1)>');
  expect(document.querySelector('img,svg,[onclick]')).toBeNull();
  expect(document.querySelector('select')!.dataset.settingsAction).toBe('set-nutrition-ai-route');
  for (const link of document.querySelectorAll('a')) expect(link.rel).toBe('noopener noreferrer');
});
it('refreshes selected route and capability gates without replacing focused controls or open details', () => {
  const { view } = mounted();
  const select = document.querySelector('select')!;
  const details = document.querySelector('details')!;
  details.open = true; details.dispatchEvent(new Event('toggle'));
  select.focus();
  view.refresh({ ...initial, selectedValue: 'route-b', automaticDisabled: true });
  expect(document.querySelector('select')).toBe(select);
  expect(document.activeElement).toBe(select);
  expect(select.value).toBe('route-b');
  expect(select.options[0]!.disabled).toBe(true);
  expect(document.querySelector('details')).toBe(details);
  expect(details.open).toBe(true);
});
it('keeps a saved unavailable route visible and allows catalog recovery in place', () => {
  const saved = { value: 'missing-route', label: 'Previously chosen model' };
  const { view } = mounted({ ...initial, selectedValue: saved.value, automaticDisabled: true, groups: [{ label: 'Saved choice unavailable', options: [saved] }] });
  const select = document.querySelector('select')!;
  expect(select.value).toBe(saved.value);
  view.refresh({ ...initial, selectedValue: saved.value, groups: [{ label: 'Configured vision models', options: [saved] }] });
  expect(select.value).toBe(saved.value);
  expect(select.querySelector('optgroup')!.label).toBe('Configured vision models');
});
it('rejects replies for a replaced root and unmounted view', () => {
  const { host, view } = mounted();
  host.replaceChildren();
  expect(view.isCurrent()).toBe(false);
  const current = mountNutritionAISettings(host, initial);
  view.refresh({ ...initial, automaticLabel: 'Stale catalog' });
  expect(host.textContent).not.toContain('Stale catalog');
  expect(current.isCurrent()).toBe(true);
  disposeNutritionAISettings();
  expect(current.isCurrent()).toBe(false);
  expect(getNutritionAISettingsView()).toBeNull();
  expect(host.children).toHaveLength(0);
});
it('retains the selected value when unrelated pricing and copy change', () => {
  const { view } = mounted();
  const select = document.querySelector('select')!;
  select.value = 'route-b'; select.dispatchEvent(new Event('change', { bubbles: true }));
  view.refresh({ ...initial, selectedValue: 'route-b', providerDisplay: 'Updated local route' });
  expect(select.value).toBe('route-b');
  expect(document.querySelector('details')!.textContent).toContain('Updated local route');
});
