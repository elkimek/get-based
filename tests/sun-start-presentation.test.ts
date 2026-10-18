// @vitest-environment jsdom
import { expect, it } from 'vitest';
import {projectBodySilhouette} from '../js/sun-body-silhouette.js';
import { renderHTML } from '../js/components/LightSessionPresentation.svelte.html.js';
import { projectStartSunSessionForm } from '../js/light-session-presentation.js';
const options = {
  eyeModes: [{ key: 'direct', label: 'Eyes uncovered', pickerLabel: 'Ambient <light>' }, { key: 'sunglasses', label: 'UV-blocking sunglasses' }],
  lensTints: [{ key: 'clear', label: 'Clear' }, { key: 'dark', label: 'Dark' }],
  postureOptions: [{ key: 'standing', label: 'Standing' }, { key: 'lying', label: 'Lying' }],
  surfaceOptions: [{ key: 'grass', label: 'Grass' }, { key: 'snow', label: 'Snow' }],
};
it('retains initial eye, lens, posture and surface defaults in source order', () => {
  const view = projectStartSunSessionForm(options);
  expect(view.glass).toBe(false);
  for (const items of [view.eyeModes, view.lensTints, view.postures, view.surfaces]) expect(items.map(item => item.selected)).toEqual([true,false]);
  expect(view.eyeModes[0]?.label).toBe('Ambient <light>');
});
it('retains last completed-session choices and the protected-eye label fallback', () => {
  const view = projectStartSunSessionForm({ ...options, lastUsed: { eyeExposure: { mode: 'sunglasses', lensTint: 'dark' }, posture: 'lying', surfaceAlbedo: 'snow', bodyExposure: { glassBetween: true } } });
  expect(view.glass).toBe(true);
  for (const items of [view.eyeModes, view.lensTints, view.postures, view.surfaces]) expect(items.map(item => item.selected)).toEqual([false,true]);
  expect(view.eyeModes[1]?.label).toBe('UV-blocking sunglasses');
});
it('keeps unknown imported choices unselected so the native select retains its existing first-option fallback', () => {
  const view = projectStartSunSessionForm({ ...options, lastUsed: { eyeExposure: { mode: 'unknown', lensTint: 'unknown' }, posture: 'unknown', surfaceAlbedo: 'unknown' } });
  for (const items of [view.eyeModes, view.lensTints, view.postures, view.surfaces]) expect(items.every(item => !item.selected)).toBe(true);
});
it('renders the start selectors, named silhouette slot and accessible glass control with literal metadata', () => {
  const host = document.createElement('div'); host.innerHTML = renderHTML({ kind: 'start', view: projectStartSunSessionForm(options), silhouetteView: projectBodySilhouette(new Set()) });
  expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Start sun session');
  expect(host.querySelectorAll('[data-sun-start-close]')).toHaveLength(2);
  expect(host.querySelectorAll('[data-sun-coverage-close]')).toHaveLength(0);
  expect(host.querySelector('#sun-start-silhouette-slot [data-sun-body-picker]')).toBeTruthy();
  expect(host.querySelector('#sun-start-clear')).toBeTruthy(); expect(host.querySelector('#start-confirm')).toBeTruthy();
  expect(host.querySelector<HTMLSelectElement>('#start-eye-mode')?.value).toBe('direct');
  expect(host.querySelector('option')?.textContent).toBe('Standing');
  expect(host.textContent).toContain('Ambient <light>'); expect(host.querySelector('light')).toBeNull();
  expect(host.querySelector('#start-glass')?.getAttribute('aria-labelledby')).toBe('start-glass-label');
  expect(host.querySelector('#sun-start-uvi-banner')?.hasAttribute('hidden')).toBe(true);
});
it('uses one shared shell with distinct coverage selectors, copy and action ownership', () => {
  const host = document.createElement('div'); host.innerHTML = renderHTML({ kind: 'coverage', silhouetteView: projectBodySilhouette(new Set()) });
  expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Change coverage');
  expect(host.querySelectorAll('[data-sun-coverage-close]')).toHaveLength(2);
  expect(host.querySelectorAll('[data-sun-start-close],#start-confirm,#sun-start-clear,details,select')).toHaveLength(0);
  expect(host.querySelector('#sun-coverage-silhouette-slot [data-sun-body-picker]')).toBeTruthy();
  expect(host.querySelector('#coverage-confirm')?.textContent).toBe('Apply coverage');
  expect(host.textContent).toContain('the change applies from this moment forward');
});
it('escapes all preflight metadata while preserving the warning tier and complete guidance', () => {
  const host = document.createElement('div'); host.innerHTML = renderHTML({ kind: 'preflight', view: { className: 'sun-uvi-extreme', icon: '⚠', title: '<img src=x>', text: '<literal> & uncertainty.' } });
  expect(host.querySelector('.sun-uvi-extreme')).toBeTruthy(); expect(host.querySelector('img,literal')).toBeNull();
  expect(host.textContent).toContain('⚠ <img src=x> <literal> & uncertainty. Use shade, clothing, and suitable sun protection; shorten or skip the session when warnings apply.');
});
