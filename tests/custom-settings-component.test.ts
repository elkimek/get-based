// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { disposeCustomSettings, getCustomSettingsView, mountCustomSettings } from '../js/custom-settings-component.js';
import { buildCustomModelState } from '../js/custom-settings-view.js';
const snapshot = (connected = true) => ({ connected, models: buildCustomModelState([{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }], 'a') });
function mounted() {
  const host = document.createElement('div'); document.body.append(host);
  const actions = { save: vi.fn(), remove: vi.fn(), select: vi.fn(), apply: vi.fn() };
  return { host, actions, view: mountCustomSettings(host, snapshot(), actions) };
}
afterEach(() => { disposeCustomSettings(); document.body.replaceChildren(); });
it('keeps editable credentials out of markup/snapshots and scrubs held fields on owner disposal', () => {
  const { host, view } = mounted(); view.setConnection({ url: 'https://private.test/PRIVATE-ENDPOINT', key: 'PRIVATE-KEY' });
  const fields = [...host.querySelectorAll<HTMLInputElement>('#custom-url-input,#custom-key-input,#custom-manual-model')];
  expect(view.readConnection()).toEqual({ url: 'https://private.test/PRIVATE-ENDPOINT', key: 'PRIVATE-KEY' });
  expect(host.innerHTML).not.toContain('PRIVATE'); expect(JSON.stringify(view.getModels())).not.toContain('PRIVATE');
  disposeCustomSettings(); expect(fields.every(field => !field.value)).toBe(true); expect(view.readConnection()).toEqual({ url: '', key: '' }); expect(getCustomSettingsView()).toBeNull();
});
it('refreshes catalogs in place, preserves draft/focus and renders hostile labels as text', () => {
  const { host, view } = mounted(); const field = host.querySelector<HTMLInputElement>('#custom-manual-model')!; field.value = 'draft'; field.focus();
  view.setModels(buildCustomModelState([{ id: 'a', name: '<img src=x onerror=evil>' }, { id: 'a', name: 'Duplicate' }, { id: 'b' }], 'a'));
  expect(host.querySelector('#custom-manual-model')).toBe(field); expect(document.activeElement).toBe(field); expect(field.value).toBe('draft');
  expect(host.querySelector('img')).toBeNull(); expect(host.querySelectorAll('option')).toHaveLength(2); expect(host.querySelector('option')!.textContent).toContain('<img');
});
it('actions run exactly once and retained controls cannot target a replacement owner', () => {
  const a = mounted(), button = a.host.querySelector<HTMLButtonElement>('[data-provider-panel-action="save-custom-api"]')!;
  button.click(); expect(a.actions.save).toHaveBeenCalledTimes(1);
  const b = mounted(); button.click(); expect(a.actions.save).toHaveBeenCalledTimes(1); expect(b.actions.save).not.toHaveBeenCalled();
  const model = b.host.querySelector<HTMLSelectElement>('select')!; model.value = 'b'; model.dispatchEvent(new Event('change', { bubbles: true })); expect(b.actions.select).toHaveBeenCalledExactlyOnceWith('b');
});
it('supports connected empty catalogs, manual IDs, unavailable models and failure states without losing inputs', () => {
  const { host, view } = mounted(); view.setModels(buildCustomModelState([], 'manual-model'));
  expect(host.querySelector('select')).toBeNull(); expect(host.querySelector<HTMLInputElement>('#custom-manual-model')!.value).toBe('manual-model');
  view.setSaveState({ pending: true, text: 'Checking...', tone: 'secondary' }); expect(host.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
  view.setSaveState({ pending: false, text: 'Retry safely', tone: 'danger' }); expect(host.querySelector('[role="status"]')!.textContent).toBe('Retry safely');
  view.refresh(snapshot(false)); expect(host.querySelector('#custom-model-area')).toBeNull();
});
