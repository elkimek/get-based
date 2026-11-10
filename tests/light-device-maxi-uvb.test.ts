import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { ProfileData } from '../types/app-state.js';
import {
  addDeviceFromPresetRecord, hydrateDevicesFromPresetRecords, logDeviceSession, logDeviceSessionRange,
  rehydrateStaleDeviceSessions, startDeviceSession, updateDeviceRecord,
} from '../js/light-device-mutations.js';
import type { LightDeviceRecord } from '../js/light-device-mutations.js';
import { computeDeviceSessionDoses } from '../js/light-device-session-engine.js';

const { presets } = JSON.parse(readFileSync(new URL('../data/light-device-presets.json', import.meta.url), 'utf8')) as { presets: LightDeviceRecord[] };
const preset = presets.find(record => record.id === 'mitochondriak-maxi-uvb')!;
const program = { device: preset, mode: 'vitamin-d', durationMin: 5, distanceCm: 50, bodyAreas: ['torso-front'] };

describe('Maxi UVB measured bands and Vitamin D timing', () => {
  test('uses three minutes of UV and five minutes of red/NIR', () => {
    const dose = computeDeviceSessionDoses(program);
    const middle = computeDeviceSessionDoses({ ...program, mode: 'all-on', durationMin: 3 });
    const redNir = computeDeviceSessionDoses({ ...program, mode: 'red-nir-only' });
    expect(dose.safety.erythemalSED).toBeCloseTo(0.81);
    expect(dose.doses).toMatchObject({ circadian: 0, violet_eye: 0 });
    for (const channel of ['vitamin_d', 'pomc', 'no_cv']) {
      expect(dose.doses[channel]).toBeGreaterThan(0);
      expect(dose.doses[channel]).toBeCloseTo(middle.doses[channel]!);
    }
    for (const channel of ['pbm_red', 'pbm_nir', 'nir_solar']) {
      expect(dose.doses[channel]).toBeGreaterThan(0);
      expect(dose.doses[channel]).toBeCloseTo(redNir.doses[channel]!);
    }
    expect(computeDeviceSessionDoses({ ...program, durationMin: 1 }).safety.hasUV).toBe(false);
    expect(computeDeviceSessionDoses({ ...program, durationMin: 2 }).safety.erythemalSED).toBeCloseTo(0.27);
    expect(computeDeviceSessionDoses({ ...program, durationMin: 4 }).safety.erythemalSED).toBeCloseTo(0.81);
  });

  test('interpolates the bands separately and withholds UV beyond measured distances', () => {
    const at50 = computeDeviceSessionDoses(program);
    const at60 = computeDeviceSessionDoses({ ...program, distanceCm: 60 });
    const at70 = computeDeviceSessionDoses({ ...program, distanceCm: 70 });
    expect(at60.safety.erythemalSED).toBeCloseTo(0.72);
    expect(at70.safety.erythemalSED).toBeCloseTo(0.63);
    expect(at70.doses.vitamin_d! / at50.doses.vitamin_d!).toBeCloseTo(0.056 / 0.074);
    // Expected weighted J/cm² from the 1 nm OHSP spectra, normalized to the
    // lab protocol's red and NIR band totals. The app integrates 5 nm bins.
    expect(Math.abs(at50.doses.pbm_red! / 10000 - 2.67643)).toBeLessThan(0.01);
    expect(Math.abs(at50.doses.pbm_nir! / 10000 - 3.98524)).toBeLessThan(0.01);
    expect(Math.abs(at70.doses.pbm_red! / 10000 - 2.20640)).toBeLessThan(0.01);
    expect(Math.abs(at70.doses.pbm_nir! / 10000 - 3.49683)).toBeLessThan(0.01);
    expect(at60.doses.pbm_red).toBeCloseTo((at50.doses.pbm_red! + at70.doses.pbm_red!) / 2);
    expect(at60.doses.pbm_nir).toBeCloseTo((at50.doses.pbm_nir! + at70.doses.pbm_nir!) / 2);
    const uvOnly = computeDeviceSessionDoses({ ...program, mode: 'uvb-only' });
    expect(uvOnly.doses.pbm_red).toBe(0);
    expect(uvOnly.doses.pbm_nir).toBe(0);
    const outside = computeDeviceSessionDoses({ ...program, distanceCm: 110 });
    expect(outside.safety.uvDoseStatus).toBe('unavailable');
    expect(outside.doses.vitamin_d).toBeUndefined();
  });

  test('adds overlapping local doses without adding doses from different patches', () => {
    const single = computeDeviceSessionDoses(program);
    const disjoint = computeDeviceSessionDoses({
      ...program, durationMin: 20,
      bodyPlacements: [['torso-front'], ['legs-front'], ['torso-back'], ['legs-back']],
    });
    const overlap = computeDeviceSessionDoses({
      ...program, durationMin: 20,
      bodyPlacements: [['torso-front'], ['torso-front', 'legs-front'], ['torso-back'], ['legs-back']],
    });
    expect(disjoint.safety.erythemalSED).toBeCloseTo(0.81);
    expect(overlap.safety.erythemalSED).toBeCloseTo(1.62);
    expect(disjoint.doses.pbm_red).toBeCloseTo(single.doses.pbm_red!);
    expect(overlap.doses.pbm_red).toBeCloseTo(2 * single.doses.pbm_red!);
    expect(overlap.doses.vitamin_d).toBeCloseTo(disjoint.doses.vitamin_d! + single.doses.vitamin_d!);
    expect(overlap.bodyExposureFraction).toBeCloseTo(disjoint.bodyExposureFraction);
  });

  test('refreshes existing preset devices while retaining recorded manual modes', () => {
    const profile = { lightDevices: [], deviceSessions: [] } as unknown as ProfileData;
    const legacy = { ...preset, modes: preset.modes!.filter(mode => mode.id !== 'vitamin-d'), irradianceByDistanceCm: null };
    const device = addDeviceFromPresetRecord(profile, legacy)!;
    const session = logDeviceSession(profile, { deviceId: device.id, mode: 'all-on', durationMin: 5, distanceCm: 50 })!;
    session.engineVersion = 6;
    expect(hydrateDevicesFromPresetRecords(profile, [preset])).toBe(true);
    expect(rehydrateStaleDeviceSessions(profile).rehydrated).toBe(1);
    expect(session.mode).toBe('all-on');
    expect(session.safety!.erythemalSED).toBeCloseTo(1.35);
    expect(session.editHistory).toHaveLength(1);
    expect(updateDeviceRecord(profile, device.id, { mwPerCm2At15cm: 40 })).toBe(device);
    expect(session.safety!.uvDoseStatus).toBe('unavailable');
    expect(session.doses!.vitamin_d).toBeUndefined();
  });

  test('rejects device edits that would leave a program with an unresolved phase', () => {
    const profile = { lightDevices: [], deviceSessions: [] } as unknown as ProfileData;
    const device = addDeviceFromPresetRecord(profile, preset)!;
    const modes = device.modes!.filter(mode => mode.id !== 'red-nir-only');
    expect(updateDeviceRecord(profile, device.id, { modes })).toBeNull();
    expect(device.modes!.some(mode => mode.id === 'red-nir-only')).toBe(true);
  });
});

test('bulk logging creates one grouped completed record per local day, with safe retries', () => {
  const profile = { lightDevices: [], deviceSessions: [] } as unknown as ProfileData;
  const device = addDeviceFromPresetRecord(profile, preset)!;
  const input = {
    deviceId: device.id, mode: 'vitamin-d', distanceCm: 50, durationMin: 20,
    bodyPlacements: [['torso-front'], ['torso-front', 'legs-front'], ['torso-back'], ['legs-back']],
  };
  const range = { startDate: '2026-10-24', endDate: '2026-10-27', startTime: '12:30' };
  const now = new Date(2026, 9, 27, 18).getTime();
  expect(startDeviceSession(profile, { deviceId: device.id, mode: input.mode })).toBeNull();
  expect(logDeviceSession(profile, { ...input, durationMin: 24 })).toBeNull();
  expect(logDeviceSessionRange(profile, input, { ...range, endDate: '2026-10-28' }, now)).toBeNull();
  expect(profile.deviceSessions).toHaveLength(0);
  expect(logDeviceSessionRange(profile, input, range, now)).toEqual({ saved: 4, skipped: 0 });
  expect(logDeviceSessionRange(profile, input, range, now)).toEqual({ saved: 0, skipped: 4 });
  expect(new Set(profile.deviceSessions!.map(session => session.id)).size).toBe(4);
  for (const [index, session] of profile.deviceSessions!.entries()) {
    expect(session.startedAt).toBe(new Date(2026, 9, 24 + index, 12, 30).getTime());
    expect(session.endedAt).toBe(session.startedAt + 20 * 60000);
    expect(session.bodyAreas).toEqual(['torso-front', 'legs-front', 'torso-back', 'legs-back']);
    expect(session.bodyPlacements).toEqual(input.bodyPlacements);
    expect(session.safety!.erythemalSED).toBeCloseTo(1.62);
  }
});
