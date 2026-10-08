// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderHTML } from '../js/components/LightSessionPresentation.svelte.html.js';
import { activeSunSessionView, initialSessionReadouts, liveSessionReadouts, sessionChannelChip } from '../js/light-active-session-presentation.js';
import type { LiveDosesOperations } from '../types/sun-active-session.js';
const live = (patch: Partial<LiveDosesOperations> = {}): LiveDosesOperations => ({ doses: { vitamin_d: 2 }, sed: 0, retinalUV: 0, medFraction: 0, fitzpatrick: 'II', fitzpatrickAssumed: false, psmTier: 'none', atm: null, ...patch });
it('retains initial burn bands, skin assumptions and medication caution', () => {
  expect(initialSessionReadouts({ safety: { medFraction: 0.7, fitzpatrickAssumed: true, medicationThresholdUnknown: true } })[1]).toEqual({ kind: 'burn', tone: 'warning', title: 'Base skin-type burn dose: 70% of Fitzpatrick I MED. Conservative Type I is assumed because skin type was unset. Medication effects are not included.', values: ['Base burn dose: high ⚠'] });
  expect(initialSessionReadouts({ safety: { medFraction: 1 } })[1]?.tone).toBe('danger');
  expect(initialSessionReadouts({ safety: { medFraction: 0.3 } })[1]?.values).toEqual(['Base burn dose: moderate']);
  expect(initialSessionReadouts({})).toHaveLength(1);
});
it('distinguishes pending, no modeled UVB and invalid conversion without inventing an estimate', () => {
  expect(liveSessionReadouts(null, null, 0)[0]?.values).toEqual(['Calculating…']);
  expect(liveSessionReadouts(live({ doses: {} }), null, 0)[0]?.values).toEqual(['No modeled UVB dose yet']);
  for (const iu of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(liveSessionReadouts(live(), { iu, ratePerMin: 1 }, 5)[0]?.values).toEqual(['Estimate unavailable']);
});
for (const [iu, ratePerMin, values] of [
  [9, 0.5, ['<10 IU-eq', '<1 IU-eq/min avg']], [10, 1, ['~10 IU-eq', '~1 IU-eq/min avg']],
  [155, 105, ['~160 IU-eq', '~110 IU-eq/min avg']], [1544, 0, ['~1500 IU-eq', 'rate pending']],
  [10000, 99, ['~10k IU-eq', '~99 IU-eq/min avg']], [14999, 999, ['~15k IU-eq', '~1000 IU-eq/min avg']],
] as const) it(`retains live IU and average-rate rounding at ${iu}`, () => expect(liveSessionReadouts(live(), { iu, ratePerMin }, 5)[0]?.values).toEqual(values));
it('retains ocular threshold wording and a separate heat warning, in the original order', () => {
  const rows = liveSessionReadouts(live({ medFraction: 1.1, retinalUV: 30, fitzpatrickAssumed: true, psmTier: 'severe', atm: { temperatureC: 34 } }), { iu: 1400, ratePerMin: 35 }, 40);
  expect(rows.map(item => item.kind)).toEqual(['vitamin-d','burn','retinal','heat']);
  expect(rows[1]?.values).toEqual(['110% base burn dose · over threshold ⚠']);
  expect(rows[1]?.title).toContain('your actual threshold may be lower');
  expect(rows[2]).toMatchObject({ tone: 'danger', values: ['👁 30 J/m² ocular actinic UV'] });
  expect(rows[2]?.title).toContain('at the ICNIRP 8-hour reference');
  expect(rows[3]?.values).toEqual(['🌡 34°C · cool down']);
  expect(liveSessionReadouts(live({ retinalUV: 3, atm: { temperatureC: 30 } }), null, 31)).toHaveLength(2);
  expect(liveSessionReadouts(live({ retinalUV: 3.1, atm: { temperatureC: 31 } }), null, 30)).toHaveLength(3);
});
it('preserves paused/rotation, the strict twelve-hour reminder and literal exposure metadata', () => {
  const session = { id: '<id>', startedAt: 1, paused: true, bodyExposure: { rotatedSides: true, glassBetween: true, sunscreenSPF: 12 }, eyeExposure: { mode: 'direct' } };
  const view = activeSunSessionView(session, 'Today', '7:03', '<Body>', 'Eyes <open>', [], 1 + 12 * 3600000);
  expect(view).toMatchObject({ id: '<id>', body: '<Body>', eyes: 'Eyes <open>', directEye: true, paused: true, rotated: true, suffix: ' · through glass · SPF 12', forgotHours: null });
  expect(activeSunSessionView(session,'Today','7:03','Body','Eyes',[],1+13*3600000).forgotHours).toBe(13);
});
it('renders independently named native actions with escaped metadata and stable live targets', () => {
  const host = document.createElement('div'); host.innerHTML = renderHTML({ kind: 'active', view: activeSunSessionView({ id: 'id"<&', startedAt: 1, paused: true, bodyExposure: { rotatedSides: true } }, '<Date>', '7:03', '<Body>', '<Eyes>', [sessionChannelChip('vitamin_d', { label: '<Vitamin>', icon: '<svg>' }, '<30 IU-eq')], 1 + 13 * 3600000) });
  expect(host.querySelector('section[role="button"]')).toBeNull();
  expect(host.querySelector('button.sun-session-head')?.getAttribute('data-sun-session-id')).toBe('id"<&');
  expect(host.querySelector('[data-sun-session-action="resume-session"]')).toBeTruthy();
  expect(host.querySelector('button[disabled]')?.textContent).toContain('Changed ✓');
  expect(host.querySelector('button.sun-session-forgot')).toBeTruthy();
  expect(host.querySelectorAll('img,svg,script,[onerror]')).toHaveLength(0);
  expect(host.textContent).toContain('<Date>'); expect(host.textContent).toContain('<Body>');
  expect(host.querySelector('.sun-chip')?.getAttribute('aria-label')).toBe('<Vitamin>, this session <30 IU-eq. Open channel details.');
});
