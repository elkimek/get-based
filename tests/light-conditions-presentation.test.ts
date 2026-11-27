// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { projectConditions } from '../js/light-conditions-presentation.js';
import { configureLightConditionsInterpretation } from '../js/light-conditions-interpretation.js';
import { renderHTML } from '../js/components/LightConditionsPresentation.svelte.html.js';
import type { ConditionsAtmosphere, ConditionsPresentationProps } from '../js/light-conditions-presentation.js';
import { expectNativeReview } from './helpers/native-review-dom.js';

const load = createRequire(import.meta.url);
async function checkNativeConditions(props: ConditionsPresentationProps) {
  const component = load('../js/components/LightConditionsPresentation.svelte.native.js') as typeof import('../js/components/LightConditionsPresentation.svelte.native.js');
  const html = renderHTML(props);
  await expectNativeReview(html, root => {
    const mounted = component.mount(component.default, {target: root, props});
    component.flushSync();
    return () => component.unmount(mounted);
  }, root => {
    expect(root.querySelector('img, script, [onerror]')).toBeNull();
    expect([...root.querySelectorAll('a[target="_blank"]')].every(link => link.getAttribute('rel') === 'noopener')).toBe(true);
  });
}

const now = Date.parse('2026-06-21T10:00:00Z');
const base: ConditionsAtmosphere = { uvIndex: 6.4, uvClearSky: 8.2, ozoneDU: 310, cloudCover: 35, source: 'cams_open_meteo', validAt: now - 120000, fetchedAt: now - 60000, daily: { sunrise: '2026-06-21T06:00', sunset: '2026-06-21T18:00', peakAt: '2026-06-21T12:00', uvIndexMax: 8 }, airQuality: { european_aqi: 45, european_aqi_ozone: 45, surfaceOzoneUgM3: 75 } };
const coords = { lat: 50, lon: 14 };
function host(props: ConditionsPresentationProps) { const el = document.createElement('div'); el.innerHTML = renderHTML(props); return el; }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); configureLightConditionsInterpretation({ solarZenithAngle: date => 90 - 60 * Math.sin(((date.getUTCHours() * 60 + date.getUTCMinutes()) - 360) / 720 * Math.PI) }); });
afterEach(() => { configureLightConditionsInterpretation({ solarZenithAngle: null }); vi.useRealTimers(); });
it('preserves provider classifications without reclassifying raw ground ozone', () => {
  const v = projectConditions({ ...base, airQuality: { european_aqi: 18, european_aqi_ozone: 120, surfaceOzoneUgM3: 245 } }, coords, 'full');
  expect(v.ozoneValue).toBe('Extremely poor'); expect(v.ozoneSub).toBe('O₃ 245 µg/m³ · EU index 120');
  expect(v.aqAgg?.label).toBe('Good'); expect(v.airQualitySub).toBe('EU index 18 · highest: O₃');
  expect(projectConditions({ ...base, airQuality: null }, coords, 'full')).toMatchObject({ ozoneLabel: 'Ozone column', ozoneValue: '310', ozoneSub: 'DU · UV model input' });
});
it('suppresses reassuring UV inference for inconsistent data', async () => {
  const v = projectConditions({ ...base, uvIndex: 17 }, coords, 'full'), el = host({ kind: 'conditions', view: v });
  expect(v.uviReliable).toBe(false); expect(v.sanityWarnings.length).toBeGreaterThan(0);
  expect(el.querySelector('.conditions-now-cell.is-unreliable')).not.toBeNull();
  expect(el.textContent).toContain('UVI data looks inconsistent'); expect(el.textContent).not.toContain('avoid unprotected exposure');
  await checkNativeConditions({kind: 'conditions', view: v});
});
it('keeps model freshness, stale caches and offline geometry distinct', () => {
  expect(projectConditions(base, coords, 'full')).toMatchObject({ sourceStatusClass: 'is-fresh', sourceStatusLabel: 'current model', freshnessLabel: '2 min ago' });
  expect(projectConditions({ ...base, _stale: true }, coords, 'full').sourceStatusLabel).toBe('stale cached model');
  expect(projectConditions(base, coords, 'full', true).sourceStatusLabel).toBe('offline · cached model');
  expect(projectConditions({ ...base, source: 'zenith_offline' }, coords, 'full').sourceStatusLabel).toBe('offline modeled estimate');
});
it('retains chronologically ordered sun events, one current marker and accessible transition tooltips', async () => {
  const v = projectConditions(base, coords, 'full'), el = host({ kind: 'conditions', view: v });
  expect(v.rail.map(e => e.heading)).toEqual(['Sunrise', 'UV-A on', 'Now', 'Peak', 'UV-A off', 'Sunset']);
  expect(v.rail.filter(e => e.isNow)).toHaveLength(1); expect(v.rail.map(e => e.ts)).toEqual([...v.rail.map(e => e.ts)].sort((a, b) => a - b));
  expect(el.querySelectorAll('[role=listitem]')).toHaveLength(6);
  expect(el.querySelector('.conditions-now-event-uva')?.getAttribute('data-conditions-tooltip')).toContain('switch-like');
  expect(el.querySelector('[role=region][aria-label="Scrollable sun timeline"]')?.getAttribute('tabindex')).toBe('0');
  await checkNativeConditions({kind: 'conditions', view: v});
});
it('escapes provider labels, slot identities, fetch failures and raw inspection payloads', async () => {
  const literal = '<img src=x onerror="bad()"><script>bad()</script>';
  const view = projectConditions({ ...base, source: literal }, coords, 'compact');
  const views: ConditionsPresentationProps[] = [
    {kind: 'conditions', view},
    {kind: 'message', message: 'Offline', error: literal},
    {kind: 'slot', slot: {id: literal, variant: 'full', view: null}},
    {kind: 'inspect', view: {fields: [{label: 'Source', value: literal}], warnings: [literal], raw: literal, cacheKeys: [literal]}},
  ];
  for (const props of views) {
    expect(host(props).querySelector('img, script, [onerror]')).toBeNull();
    await checkNativeConditions(props);
  }
  expect(host({ kind: 'conditions', view }).textContent).toContain(literal);
  const slot = host({ kind: 'slot', slot: { id: literal, variant: 'full', view: null } }).querySelector('.conditions-now')!;
  expect(slot.id).toBe(literal); expect(slot.hasAttribute('onerror')).toBe(false);
});
it('retains trusted attribution links and their external-link protection', () => {
  const el = host({ kind: 'conditions', view: projectConditions({ ...base, source: 'cams_open_meteo_noaa' }, coords, 'full') });
  expect([...el.querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href'), a.rel, a.target])).toEqual([
    ['CAMS', 'https://atmosphere.copernicus.eu/', 'noopener', '_blank'], ['Open-Meteo', 'https://open-meteo.com/', 'noopener', '_blank'], ['NOAA NWS', 'https://www.weather.gov/', 'noopener', '_blank'],
  ]);
});
it('keeps initial busy state and delegated widget/location actions explicit', async () => {
  const props: ConditionsPresentationProps = {kind: 'widget', hasLocation: false, slot: {id: 'fixed-slot', variant: 'full', view: null}};
  const el = host(props);
  expect(el.querySelector('#fixed-slot')?.getAttribute('aria-busy')).toBe('true');
  expect(el.textContent).toContain('Loading current conditions…'); expect(el.querySelector('[data-light-page-action=request-precise-location]')).not.toBeNull();
  expect([...el.querySelectorAll('[data-light-conditions-action]')].map(b => b.getAttribute('data-light-conditions-action'))).toEqual(['refresh', 'inspect']);
  expect([...el.querySelectorAll('button')].every(b => b.type === 'button')).toBe(true);
  await checkNativeConditions(props);
});
it('projects conditions without mutating the atmospheric payload', () => {
  const input = structuredClone(base), before = structuredClone(input); projectConditions(input, coords, 'full'); projectConditions(input, coords, 'compact', true); expect(input).toEqual(before);
});
