// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { buildRoomContext, getRoomFingerprint } from '../js/light-env-ai-analysis.js';
import { buildScreenContext, getScreenFingerprint } from '../js/light-screen-ai-analysis.js';
import { buildMeasurementContext, getMeasurementFingerprint } from '../js/light-tools-ai-analysis.js';
import { buildAuditContext, getAuditFingerprint } from '../js/light-audit-ai-analysis.js';
import { lightEnvironmentBlock } from '../js/sun-context-environment.js';

const previous = state.importedData;
beforeEach(() => { state.importedData = createDefaultProfileData(); });
afterEach(() => { state.importedData = previous; });
it('keeps arbitrary measurement source labels local while retaining known acquisition classes', () => {
  const measurement = { id: 'reading', roomId: 'office', tool: 'lux', value: 100, capturedAt: 100, extra: { source: '/private/measurement-sentinel' } };
  state.importedData.lightMeasurements = [measurement];
  expect(buildRoomContext({ id: 'office', name: 'Office' })).toContain('legacy/unknown source');
  expect(buildRoomContext({ id: 'office', name: 'Office' }) + buildMeasurementContext(measurement)).not.toMatch(/private|sentinel/);
  expect(measurement.extra.source).toBe('/private/measurement-sentinel');
  measurement.extra.source = 'manual-entry'; expect(buildMeasurementContext(measurement)).toContain('manual-entry');
});
it('keeps unknown room timing distinct from a recorded zero in context and cache identity', () => {
  const room = { id: 'office', name: 'Office', hoursOccupiedPerDay: null, eveningHoursAfterSunset: null };
  expect(buildRoomContext(room)).toContain('Evening use after sunset: unknown'); expect(buildRoomContext(room)).toContain('Hours occupied per day: unknown');
  expect(getRoomFingerprint(room)).not.toBe(getRoomFingerprint({ ...room, eveningHoursAfterSunset: 0 }));
  expect(buildRoomContext({ ...room, eveningHoursAfterSunset: 0 })).toContain('not used after dark');
});
it('keeps unknown screen timing/filter status distinct from explicit no-use/no-filter facts', () => {
  const screen = { id: 'screen', device: 'laptop', hoursPerDay: null, eveningUseAfterSunset: null, blueBlockerEnabled: null };
  expect(buildScreenContext(screen)).toContain('Blue-reduction measure noted: unknown');
  expect(getScreenFingerprint(screen)).not.toBe(getScreenFingerprint({ ...screen, eveningUseAfterSunset: 0, blueBlockerEnabled: false }));
  state.importedData.lightEnvironment = { rooms: [], screens: [screen] };
  expect(lightEnvironmentBlock()).toContain('evening use unknown'); expect(lightEnvironmentBlock()).toContain('blue reduction unknown'); expect(lightEnvironmentBlock()).not.toContain('daytime only');
});
it('invalidates room analysis when reported notes, CCT, flicker or a linked screen change', () => {
  const room = { id: 'office', name: 'Office' }, initial = getRoomFingerprint(room);
  expect(getRoomFingerprint({ ...room, notes: 'Reported glare' })).not.toBe(initial);
  expect(getRoomFingerprint({ ...room, cct: 2700 })).not.toBe(initial); expect(getRoomFingerprint({ ...room, flickerScore: 2 })).not.toBe(initial);
  expect(buildRoomContext({ ...room, cct: 2700, flickerScore: 2, notes: 'Reported glare' })).toContain('Reported color temperature: 2700 K');
  state.importedData.lightEnvironment = { rooms: [room], screens: [{ id: 'screen', device: 'laptop', roomId: 'office', hoursPerDay: null, blueBlockerEnabled: null }] };
  const unknown = getRoomFingerprint(room); state.importedData.lightEnvironment.screens[0].hoursPerDay = 2; expect(getRoomFingerprint(room)).not.toBe(unknown);
});

it('does not invent measurement confidence and distinguishes unknown from zero in cache identity', () => {
  const reading = { id: 'r', tool: 'lux', value: 100, capturedAt: 100, confidence: null };
  expect(buildMeasurementContext(reading)).toContain('Confidence: not recorded');
  expect(buildMeasurementContext({ ...reading, confidence: 0 })).toContain('Confidence: 0%');
  expect(getMeasurementFingerprint(reading)).not.toBe(getMeasurementFingerprint({ ...reading, confidence: 0 }));
});
it('includes reported measurement notes and time corrections in context and cache identity', () => {
  const reading = { id: 'r', tool: 'lux', value: 100, capturedAt: 100, notes: 'Reported glare' };
  expect(buildMeasurementContext(reading)).toContain('Reported glare');
  expect(getMeasurementFingerprint(reading)).not.toBe(getMeasurementFingerprint({ ...reading, capturedAt: 200 }));
  expect(getMeasurementFingerprint(reading)).not.toBe(getMeasurementFingerprint({ ...reading, notes: 'No glare' }));
});
it('does not infer camera auto-exposure from a reported relative glass ratio', () => {
  const text = buildMeasurementContext({ tool: 'glass-transmission', value: 0.4, extra: { method: 'reported-relative-ratio' } });
  expect(text).toContain('acquisition method is not recorded'); expect(text).not.toContain('auto-exposure was active');
});
it('includes checkpoint notes in its interpretation and cache identity', () => {
  const audit = { id: 'a', date: '2026-10-23', label: 'Baseline', createdAt: 100, notes: 'Reported glare', rooms: [], screens: [], measurements: [] };
  expect(buildAuditContext(audit)).toContain('Reported glare'); expect(getAuditFingerprint(audit)).not.toBe(getAuditFingerprint({ ...audit, notes: 'After mitigation' }));
});
