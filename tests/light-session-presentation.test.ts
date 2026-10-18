// @vitest-environment jsdom
import { expect, it } from 'vitest';
import {projectBodySilhouette} from '../js/sun-body-silhouette.js';
import { renderHTML } from '../js/components/LightSessionPresentation.svelte.html.js';
import { projectCompletedSunSession, projectCompletedDeviceSession, projectPastSessionForm, projectDeviceSessionForm } from '../js/light-session-presentation.js';
import type { DeviceSessionRecord, LightDeviceRecord } from '../js/light-devices-store.js';
const stamp = { date: '10 Jun 2026', time: '09:30' };
for (const [status, label, danger] of [['pending', 'Updating estimates…', false], ['needs-location', 'Location needed for estimates', false], ['atmosphere-unavailable', 'Conditions unavailable — retry', false], ['calculation-error', 'Calculation failed — retry', true], ['unknown', 'Estimates unavailable', false]] as const) {
  it(`preserves completed Sun calculation status ${status} ahead of safety estimates`, () => {
    const view = projectCompletedSunSession({ id: 'sun', calculationStatus: status, safety: { medFraction: 2 } }, stamp, '15 min', '300 IU');
    expect(view.warning).toEqual({ label, danger });
    expect(view.ariaLabel).toBe('Open 10 Jun 2026 at 09:30 outdoor sun session details');
  });
}
for (const [med, label] of [[0.2, null], [0.7, 'High modeled burn dose'], [1, 'Base burn threshold reached']] as const) {
  it(`preserves completed Sun burn notice at ${med}`, () => {
    expect(projectCompletedSunSession({ safety: { medFraction: med } }, stamp, '15 min', '').warning?.label || null).toBe(label);
    expect(projectCompletedSunSession({ safety: { medFraction: med, fitzpatrickAssumed: true } }, stamp, '15 min', '').warning?.label).toBe(label || 'Review safety assumptions');
  });
}
it('renders history as a native button with literal IDs, metadata and no injected markup', () => {
  const literal = '<img src=x onerror=alert(1)> & "';
  const view = projectCompletedSunSession({ id: literal }, { date: literal, time: literal }, literal, literal);
  const host = document.createElement('div'); host.innerHTML = renderHTML({ kind: 'row', view });
  const button = host.querySelector('button')!;
  expect(button.type).toBe('button'); expect(button.dataset.sunSessionAction).toBe('open-detail'); expect(button.dataset.sunSessionId).toBe(literal);
  expect(button.getAttribute('aria-label')).toBe(view.ariaLabel);
  expect(button.querySelector('.sun-session-duration')?.textContent).toBe(literal);
  expect(button.querySelector('.light-session-outcome')?.textContent).toBe('Vitamin D est. '+literal);
  expect(host.querySelector('img,script,[onerror]')).toBeNull();
});
it('resolves the device mode in stored, declared default and first-mode order, with snapshot/fallback names', () => {
  const device: LightDeviceRecord = { id: 'panel', brand: '<Brand>', model: 'A & B', modes: [{ id: 'red', label: 'Red' }, { id: 'nir', label: 'NIR', default: true }] };
  const session: DeviceSessionRecord = { id: 'dev', startedAt: 1, durationMin: 9.65, mode: 'red' };
  const selected = projectCompletedDeviceSession(session, device, stamp);
  expect(selected.mode).toEqual({ label: 'Red', accent: false }); expect(selected.duration).toBe('9.7 min');
  expect(projectCompletedDeviceSession({ ...session, mode: 'missing' }, device, stamp).mode).toEqual({ label: 'NIR', accent: false });
  expect(projectCompletedDeviceSession(session, null, stamp).name).toBe('Device details unavailable');
  const host = document.createElement('div'); host.innerHTML = renderHTML({ kind: 'row', view: selected });
  expect(host.querySelector('button')?.dataset.lightSessionId).toBe('dev');
  expect(host.querySelector('.light-session-title')?.textContent).toContain('<Brand> A & B');
  expect(host.querySelector('img')).toBeNull();
});
it('preserves device safety warning priority: unsafe eyes, high burn, unavailable UV dose', () => {
  const session: DeviceSessionRecord = { id: 'dev', startedAt: 1, safety: { erythemalSED: null, ocularActinicUV: null, ocularUvaJPerM2: null, unsafeEyeExposure: true, conservativeBaseMedFraction: 1, hasUV: true, uvDoseStatus: 'unavailable' } };
  expect(projectCompletedDeviceSession(session, null, stamp).warning).toEqual({ label: 'UV eye exposure — review', danger: true });
  session.safety!.unsafeEyeExposure = false;
  expect(projectCompletedDeviceSession(session, null, stamp).warning?.label).toBe('High modeled burn dose');
  session.safety!.conservativeBaseMedFraction = 0;
  expect(projectCompletedDeviceSession(session, null, stamp).warning?.label).toBe('UV dose unavailable');
});
it('keeps option selection based on original keys, picker labels and past-session defaults', () => {
  const view = projectPastSessionForm({ lastRegions: new Set(), eyeMode: 2, lensTint: 'clear', localStartDefault: '<date>', localNow: '2026-06-10T10:00', eyeModes: [{ key: 2, label: 'fallback', pickerLabel: '<Eyes>' }, { key: '2', label: 'not selected' }], lensTints: [{ key: 'clear', label: 'Clear' }], postureOptions: [{ key: 'standing', label: 'Standing' }], surfaceOptions: [{ key: 'grass', label: 'Grass' }] });
  expect(view.eyeModes.map(item => item.selected)).toEqual([true, false]); expect(view.eyeModes[0]?.label).toBe('<Eyes>');
  expect(view.postures[0]?.selected).toBe(true); expect(view.surfaces[0]?.selected).toBe(true);
  const host = document.createElement('div'); host.innerHTML = renderHTML({ kind: 'past', view, silhouetteView: projectBodySilhouette(new Set(['face'])) });
  expect(host.querySelector<HTMLInputElement>('#det-started-at')?.getAttribute('value')).toBe('<date>');
  expect(host.querySelector('#det-eye-mode option:checked')?.textContent).toBe('<Eyes>');
  expect(host.querySelector('#det-glass')?.getAttribute('aria-labelledby')).toBe('det-glass-label');
  expect(host.querySelectorAll('[data-region]')).toHaveLength(16);expect(host.querySelectorAll('[data-region][aria-pressed="true"]')).toHaveLength(1); expect(host.querySelector('img')).toBeNull();
});
for (const useUS of [false, true]) it(`projects device distance defaults and measured-model hint in ${useUS ? 'US' : 'SI'} units`, () => {
  const device: LightDeviceRecord = { id: 'panel', brand: '<Brand>', model: 'Panel', recommendedDistanceCm: 15, lastSession: { distanceCm: 30 }, irradianceByDistanceCm: [{ distanceCm: 15, mwPerCm2: 10 }, { distanceCm: 30, mwPerCm2: 5 }] };
  const view = projectDeviceSessionForm({ device, validModes: [{ id: 'all', label: 'All' }, { id: 'red', label: '<Red>' }], defaultMode: 'all', defaultDuration: 8, defaultDistanceCm: 30, useUS, isUVDevice: true, isEyeLightDevice: false, defaultEyeControlChecked: false });
  expect(view.distance).toBe(useUS ? 11.8 : 30); expect(view.unit).toBe(useUS ? 'in' : 'cm');
  expect(view.distanceHint).toBe("Vendor reference: 15 cm (5.9 in). You usually log at 30 cm — prefilled below. Dose uses the device's measured distance table.");
  expect(view.eyeLabel).toBe('UV-rated goggles worn (closed eyelids are not protection)');
  const host = document.createElement('div'); host.innerHTML = renderHTML({ kind: 'device', view, silhouetteView: null });
  expect(host.querySelector<HTMLInputElement>('#dev-session-mode')?.value).toBe('all');
  expect(host.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute('tabindex')).toBe('0');
  expect(host.querySelector('[data-unit="'+view.unit+'"][aria-pressed="true"]')).not.toBeNull();
  expect(host.querySelector('#dev-session-eyes')?.getAttribute('aria-labelledby')).toBe('dev-session-eye-label');
  expect(host.querySelector('img,script')).toBeNull();
});
