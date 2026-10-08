// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderHTML } from '../js/components/LightSessionPresentation.svelte.html.js';
import { detailField, detailChannel, deviceDetailNotices, deviceDetailLightMetric, sessionCalculationNotice } from '../js/light-session-detail-presentation.js';
import type { DeviceSessionRecord } from '../js/light-devices-store.js';

it('projects literal fields and channel units without changing signal precedence', () => {
  expect(detailField('Source', '<Panel>', 'Original title', true)).toEqual({ label: 'Source', value: '<Panel>', title: 'Original title', wide: true });
  expect(detailChannel('pbm_red', {}, 0, '', 'device')).toMatchObject({ label: 'pbm_red', value: 'Not modeled', source: 'No signal', hasSignal: false });
  expect(detailChannel('vitamin_d', { label: 'Vitamin D', icon: '☀' }, 10, '100 IU-eq', 'sun')).toMatchObject({ value: '100 IU-eq', source: 'Sunlight', hasSignal: true, ariaLabel: 'Vitamin D — 100 IU-eq, Sunlight. Open channel details.' });
  expect(detailChannel('pbm_red', {}, 10, '', 'device').value).toBe('Device signal logged');
  expect(detailChannel('circadian', {}, Number.NaN, 'Unavailable', 'sun').source).toBe('No signal');
});
for (const status of ['needs-location', 'atmosphere-unavailable', 'calculation-error']) it(`preserves retry and error state for ${status}`, () => {
  const notice = sessionCalculationNotice(status);
  expect(notice?.retry).toBe(true); expect(notice?.error).toBe(status === 'calculation-error');
  expect(notice?.message).toBeTruthy();
});
it('does not offer retries for pending, computed or unknown statuses', () => {
  expect(sessionCalculationNotice('pending')?.retry).toBe(false);
  expect(sessionCalculationNotice({ toString: () => 'needs-location' })?.retry).toBe(false);
  expect(sessionCalculationNotice('computed')).toBeNull(); expect(sessionCalculationNotice('unknown')).toBeNull();
});
it('preserves modeled UV quantities, unsafe-eye priority and estimate warnings', () => {
  const session: DeviceSessionRecord = { id: 'one', startedAt: 1, safety: { hasUV: true, uvDoseStatus: 'modeled', erythemalSED: 0.12, conservativeBaseMedFraction: 0.24, ocularActinicUV: 2, ocularUvaJPerM2: 3, unsafeEyeExposure: true }, calculation: { warnings: ['One <limit>', 'Second limit'] } };
  expect(deviceDetailNotices(session)).toEqual([
    { title: '⚠ UV eye protection was not recorded', danger: true, text: 'Local erythemal dose: 0.12 SED · 24% of a conservative Type I base MED · ocular actinic UV: 2.0 J/m² · ocular UVA: 3.0 J/m². This is a model, not a personal threshold. Closed eyelids are not UV protection.' },
    { title: 'Estimate limits', text: 'One <limit> Second limit' },
  ]);
  session.safety!.uvDoseStatus = 'unavailable';
  expect(deviceDetailNotices(session)[0]?.text).toContain('Burn dose, ocular dose, and vitamin-D output are not calculated.');
});
it('reports zero photopic values and a missing melanopic basis without inventing EDI', () => {
  const session: DeviceSessionRecord = { id: 'one', startedAt: 1, metrics: { photopicLux: 0 } };
  expect(deviceDetailLightMetric(session)?.text).toBe('0 photopic lux · Melanopic EDI unavailable without a measured spectrum or declared melanopic DER.');
  session.metrics = { photopicLux: 1000, melanopicEdiLux: 450, melanopicStatus: 'device-der' };
  expect(deviceDetailLightMetric(session)?.text).toBe('1,000 photopic lux · 450 lx melanopic EDI estimated from the device DER.');
  expect(deviceDetailLightMetric({ id: 'none', startedAt: 1 })).toBeNull();
});
it('escapes mode-editor metadata and retains original option keys and selection', () => {
  const host = document.createElement('div'); host.innerHTML = renderHTML({ kind: 'mode-editor', name: '<Panel> & One', modes: [{ key: 'red"<&', label: '<Red>', selected: false }, { key: 'nir', label: 'NIR', selected: true }] });
  expect(host.querySelector('h3')?.textContent).toBe('Edit mode — <Panel> & One');
  const select = host.querySelector<HTMLSelectElement>('#dev-edit-mode')!;
  expect(select.value).toBe('nir'); expect(select.options[0]?.value).toBe('red"<&'); expect(select.options[0]?.text).toBe('<Red>');
  expect(host.querySelector('script,img,[onerror]')).toBeNull();
});
