// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { projectConditions } from '../js/light-conditions-presentation.js';
import { configureLightConditionsInterpretation } from '../js/light-conditions-interpretation.js';
import { renderHTML } from '../js/components/LightConditionsPresentation.svelte.html.js';
import type { ConditionsAtmosphere, ConditionsPresentationProps } from '../js/light-conditions-presentation.js';
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
it('suppresses reassuring UV inference for inconsistent data', () => {
  const v = projectConditions({ ...base, uvIndex: 17 }, coords, 'full'), el = host({ kind: 'conditions', view: v });
  expect(v.uviReliable).toBe(false); expect(v.sanityWarnings.length).toBeGreaterThan(0);
  expect(el.querySelector('.conditions-now-cell.is-unreliable')).not.toBeNull();
  expect(el.textContent).toContain('UVI data looks inconsistent'); expect(el.textContent).not.toContain('avoid unprotected exposure');
});
it('keeps model freshness, stale caches and offline geometry distinct', () => {
  expect(projectConditions(base, coords, 'full')).toMatchObject({ sourceStatusClass: 'is-fresh', sourceStatusLabel: 'current model', freshnessLabel: '2 min ago' });
  expect(projectConditions({ ...base, _stale: true }, coords, 'full').sourceStatusLabel).toBe('stale cached model');
  expect(projectConditions(base, coords, 'full', true).sourceStatusLabel).toBe('offline · cached model');
  expect(projectConditions({ ...base, source: 'zenith_offline' }, coords, 'full').sourceStatusLabel).toBe('offline modeled estimate');
});
it('retains chronologically ordered sun events, one current marker and accessible transition tooltips', () => {
  const v = projectConditions(base, coords, 'full'), el = host({ kind: 'conditions', view: v });
  expect(v.rail.map(e => e.heading)).toEqual(['Sunrise', 'UV-A on', 'Now', 'Peak', 'UV-A off', 'Sunset']);
  expect(v.rail.filter(e => e.isNow)).toHaveLength(1); expect(v.rail.map(e => e.ts)).toEqual([...v.rail.map(e => e.ts)].sort((a, b) => a - b));
  expect(el.querySelectorAll('[role=listitem]')).toHaveLength(6);
  expect(el.querySelector('.conditions-now-event-uva')?.getAttribute('data-conditions-tooltip')).toContain('switch-like');
  expect(el.querySelector('[role=region][aria-label="Scrollable sun timeline"]')?.getAttribute('tabindex')).toBe('0');
});
it('escapes provider labels, slot identities, fetch failures and raw inspection payloads', () => {
  const literal = '<img src=x onerror="bad()"><script>bad()</script>';
  const view = projectConditions({ ...base, source: literal }, coords, 'compact');
  for (const el of [host({ kind: 'conditions', view }), host({ kind: 'message', message: 'Offline', error: literal }), host({ kind: 'slot', slot: { id: literal, variant: 'full', view: null } }), host({ kind: 'inspect', view: { fields: [{ label: 'Source', value: literal }], warnings: [literal], raw: literal, cacheKeys: [literal] } })]) {
    expect(el.querySelector('img, script, [onerror]')).toBeNull();
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
it('keeps initial busy state and delegated widget/location actions explicit', () => {
  const el = host({ kind: 'widget', hasLocation: false, slot: { id: 'fixed-slot', variant: 'full', view: null } });
  expect(el.querySelector('#fixed-slot')?.getAttribute('aria-busy')).toBe('true');
  expect(el.textContent).toContain('Loading current conditions…'); expect(el.querySelector('[data-light-page-action=request-precise-location]')).not.toBeNull();
  expect([...el.querySelectorAll('[data-light-conditions-action]')].map(b => b.getAttribute('data-light-conditions-action'))).toEqual(['refresh', 'inspect']);
  expect([...el.querySelectorAll('button')].every(b => b.type === 'button')).toBe(true);
});
it('projects conditions without mutating the atmospheric payload', () => {
  const input = structuredClone(base), before = structuredClone(input); projectConditions(input, coords, 'full'); projectConditions(input, coords, 'compact', true); expect(input).toEqual(before);
});
