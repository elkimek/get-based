#!/usr/bin/env node
// test-light-devices-store.js - light-device mutation boundary coverage.

import './_node-shim.js';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Light Devices Store Tests ===\n');

const { state } = await import('../js/state.js');
const {
  DEVICE_SESSION_SCHEMA_VERSION,
  addCustomDevice,
  addDeviceFromPresetRecord,
  configureLightDevicesStore,
  deleteDevice,
  deleteDeviceSession,
  getActiveDeviceSession,
  getDeviceSessions,
  getDevices,
  hydrateDevicesFromPresetRecords,
  logDeviceSession,
  rollingDeviceTotals,
  startDeviceSession,
  stopDeviceSession,
  updateDeviceSession,
} = await import('../js/light-devices-store.js');

state.currentProfile = 'light-devices-store-test';
let analysisCalls = 0;
configureLightDevicesStore({
  maybeAnalyzeDeviceSessionAfterFinish: () => { analysisCalls++; },
});

function reset(seed = {}) {
  analysisCalls = 0;
  state.importedData = Object.assign({ entries: [], lightDevices: [], deviceSessions: [] }, seed);
}

console.log('%c 1. Device library mutations ', 'font-weight:bold;color:#f59e0b');
reset();
assert('getDevices lazily initializes lightDevices',
  Array.isArray(getDevices()) && getDevices().length === 0);
assert('getDeviceSessions lazily initializes deviceSessions',
  Array.isArray(getDeviceSessions()) && getDeviceSessions().length === 0);

const preset = {
  id: 'preset-test',
  brand: 'PresetCo',
  model: 'Panel',
  type: 'sad',
  peakWavelengths: [],
  lux: 10000,
  recommendedDistanceCm: 30,
  channels: ['circadian'],
  channelGroups: [{ id: 'white', peaks: [480] }],
  modes: [{ id: 'all-on', groups: ['white'], default: true }],
  coupling: [{ if: 'white', requires: [], reason: 'test' }],
  catalogSlug: 'preset-panel',
};
const presetDevice = await addDeviceFromPresetRecord(preset, { notes: 'desk' }, { now: 1_000 });
assert('addDeviceFromPresetRecord persists preset metadata',
  presetDevice?.id?.startsWith('dev_')
    && presetDevice.addedAt === 1_000
    && presetDevice.notes === 'desk'
    && presetDevice.catalogSlug === 'preset-panel'
    && getDevices()[0] === presetDevice);
assert('addDeviceFromPresetRecord copies mode schema',
  Array.isArray(presetDevice.modes)
    && Array.isArray(presetDevice.channelGroups)
    && Array.isArray(presetDevice.coupling));

presetDevice.channelGroups = undefined;
presetDevice.modes = undefined;
presetDevice.coupling = undefined;
const hydrated = await hydrateDevicesFromPresetRecords([preset]);
assert('hydrateDevicesFromPresetRecords backfills missing preset mode schema',
  hydrated === true
    && Array.isArray(presetDevice.modes)
    && Array.isArray(presetDevice.channelGroups)
    && Array.isArray(presetDevice.coupling));
assert('hydrateDevicesFromPresetRecords is idempotent',
  await hydrateDevicesFromPresetRecords([preset]) === false);

const custom = await addCustomDevice({
  brand: 'Bench',
  model: 'Hybrid',
  type: 'uvb',
  peakWavelengths: [295, 660, 850],
  mwPerCm2At15cm: 42,
  recommendedDistanceCm: 30,
  channelGroups: [{ id: 'uv', peaks: [295] }, { id: 'red', peaks: [660, 850] }],
  modes: [{ id: 'all-on', groups: ['uv', 'red'] }, { id: 'bad', groups: ['missing'] }],
  coupling: [{ if: 'uv', requires: ['red'], reason: 'test' }, { if: 'missing', requires: ['red'] }],
});
assert('addCustomDevice persists a sanitized custom device',
  custom?.presetId === null
    && custom.channels.includes('vitamin_d')
    && custom.modes.length === 1
    && custom.coupling.length === 1);

console.log('%c 2. Session lifecycle ', 'font-weight:bold;color:#f59e0b');
reset({ lightDevices: [{
  id: 'sad-1',
  brand: 'Bright',
  model: 'Desk',
  type: 'sad',
  peakWavelengths: [],
  mwPerCm2At15cm: null,
  lux: 10000,
  recommendedDistanceCm: 30,
  channels: ['circadian'],
}] });

const logged = await logDeviceSession({
  deviceId: 'sad-1',
  durationMin: 10,
  distanceCm: 30,
  bodyArea: 'face',
  eyesProtected: false,
  notes: 'morning',
});
const loggedDevice = getDevices()[0];
const expectedCircadian10 = 10000 * 0.75 * 0.0013262 * 10 * 60;
assert('logDeviceSession persists dose, lastSession, updatedAt, and analyzer hook',
  logged?.id?.startsWith('devsess_')
    && Math.abs(logged.doses.circadian - expectedCircadian10) < 1e-9
    && logged.notes === 'morning'
    && loggedDevice.lastSession.durationMin === 10
    && Number.isFinite(loggedDevice.updatedAt)
    && analysisCalls === 1);
assert('device session stores versioned provenance and input quality',
  logged.schemaVersion === DEVICE_SESSION_SCHEMA_VERSION
    && logged.calculation?.provenance?.source === 'lux-proxy'
    && logged.calculation?.confidence?.level === 'low'
    && logged.calculation?.precision?.allowsExactSafety === false);
assert('store rejects an invalid zero-duration session',
  await logDeviceSession({ deviceId: 'sad-1', durationMin: 0 }) === null);
const normalized = await logDeviceSession({
  deviceId: 'sad-1', durationMin: 5, distanceCm: -2, bodyAreas: ['face', 'not-a-region', 'face'], eyesProtected: false,
});
assert('store normalizes distance and anatomical regions at its boundary',
  normalized?.distanceCm === 30
    && JSON.stringify(normalized.bodyAreas) === JSON.stringify(['face']));

const startedId = await startDeviceSession({ deviceId: 'sad-1', distanceCm: 30, eyesProtected: false });
const active = getActiveDeviceSession();
assert('startDeviceSession creates one active session',
  startedId && active?.id === startedId && active.endedAt === null);
assert('startDeviceSession rejects a second active timer',
  await startDeviceSession({ deviceId: 'sad-1' }) === null);
active.startedAt = Date.now() - 5 * 60_000;
const stopped = await stopDeviceSession(startedId);
assert('stopDeviceSession finalizes active session and recomputes dose',
  stopped?.endedAt
    && stopped.durationMin >= 4.9
    && stopped.doses.circadian > 0
    && getDevices()[0].lastSession.durationMin >= 4.9
    && analysisCalls === 3);

getDeviceSessions().push(
  { id: 'sync-device-old', deviceId: 'sad-1', startedAt: 100, updatedAt: 110, endedAt: null },
  { id: 'sync-device-new', deviceId: 'sad-1', startedAt: 200, updatedAt: 220, endedAt: null },
);
assert('getActiveDeviceSession resolves synced duplicate timers deterministically',
  getActiveDeviceSession()?.id === 'sync-device-new'
    && getDeviceSessions().find(session => session.id === 'sync-device-old')?.syncResolution?.canonicalSessionId === 'sync-device-new');
getDeviceSessions().splice(getDeviceSessions().findIndex(session => session.id === 'sync-device-new'), 1);

const edited = await updateDeviceSession(logged.id, { durationMin: 20, notes: 'edited' });
assert('updateDeviceSession recomputes duration-derived fields and stamps sync freshness',
  edited?.durationMin === 20
    && edited.notes === 'edited'
    && edited.endedAt === edited.startedAt + 20 * 60 * 1000
    && Math.abs(edited.doses.circadian - expectedCircadian10 * 2) < 1e-9
    && Number.isFinite(edited.updatedAt)
    && analysisCalls === 4);
assert('updateDeviceSession returns null for missing session',
  await updateDeviceSession('missing', { durationMin: 1 }) === null);

const beforeDelete = getDeviceSessions().length;
assert('deleteDeviceSession removes session and records tombstone',
  await deleteDeviceSession(logged.id) === true
    && getDeviceSessions().length === beforeDelete - 1
    && state.importedData._deleted.deviceSessions.includes(logged.id));
assert('deleteDevice removes device and records tombstone',
  await deleteDevice('sad-1') === true
    && !getDevices().some(d => d.id === 'sad-1')
    && state.importedData._deleted.lightDevices.includes('sad-1'));
assert('delete miss paths return false',
  await deleteDevice('missing') === false
    && await deleteDeviceSession('missing') === false);

reset({ deviceSessions: [
  { id: 'recent', endedAt: Date.now(), doses: { circadian: 100, pbm_red: 5 } },
  { id: 'old', endedAt: Date.now() - 30 * 86400 * 1000, doses: { circadian: 999 } },
] });
const totals = rollingDeviceTotals(7);
assert('rollingDeviceTotals sums only in-window finite doses',
  totals.circadian === 100 && totals.pbm_red === 5);

console.log('%c 3. UV device physics and safety ', 'font-weight:bold;color:#f59e0b');
const { computeDeviceSessionDoses } = await import('../js/light-device-session-engine.js');
const uvDevice = {
  type: 'uvb',
  peakWavelengths: [295],
  peakShares: [1],
  mwPerCm2At15cm: 1,
  recommendedDistanceCm: 15,
};
const uvSmallArea = computeDeviceSessionDoses({
  device: uvDevice,
  durationMin: 10,
  distanceCm: 15,
  bodyAreas: ['face'],
  eyesProtected: false,
});
const uvLargeArea = computeDeviceSessionDoses({
  device: uvDevice,
  durationMin: 10,
  distanceCm: 15,
  bodyArea: 'whole-body',
  eyesProtected: true,
});
assert('UV device stores physical fluence in J/cm²',
  Math.abs(uvSmallArea.physicalDoses.totalJPerCm2 - 0.6) < 1e-9
    && Math.abs(uvSmallArea.physicalDoses.uvbJPerCm2 - 0.6) < 1e-9);
assert('UV-device local SED is independent of total body area',
  uvSmallArea.safety.sed > 0
    && Math.abs(uvSmallArea.safety.sed - uvLargeArea.safety.sed) < 1e-9);
assert('UV-device eye hazard uses eye-protection state',
  uvSmallArea.safety.retinalUV > 0 && uvLargeArea.safety.retinalUV === 0);
assert('Declared peak shares are labeled as declared, not heuristic',
  uvSmallArea.safety.source === 'declared-spectrum');
const unnormalizedDevice = computeDeviceSessionDoses({
  device: { ...uvDevice, peakWavelengths: [295, 660], peakShares: [-1, 3] },
  durationMin: 10,
  distanceCm: 15,
  bodyAreas: ['face'],
  eyesProtected: true,
});
assert('Declared physical peak shares are clamped and normalized once',
  unnormalizedDevice.physicalDoses.uvbJPerCm2 === 0
    && Math.abs(unnormalizedDevice.physicalDoses.redJPerCm2 - unnormalizedDevice.physicalDoses.totalJPerCm2) < 1e-9);

console.log('%c 4. Boundary ownership ', 'font-weight:bold;color:#f59e0b');
const uiSrc = read('js/light-devices.js');
const storeSrc = read('js/light-devices-store.js');
const appLightSunSrc = read('js/app-light-sun-modules.js');
const aiHooksSrc = read('js/light-sun-ai-hooks.js');
assert('light-devices imports the store boundary',
  uiSrc.includes("from './light-devices-store.js'"));
assert('light-devices no longer persists device/session mutations directly',
  !/saveImportedData\(/.test(uiSrc)
    && !/deleteImportedArrayItem\(/.test(uiSrc)
    && !/state\.importedData\.(?:lightDevices|deviceSessions)\s*(?:\[|=|\.)/.test(uiSrc));
assert('light-devices-store owns synced persistence for devices and sessions',
  /saveImportedData\(/.test(storeSrc)
    && /deleteImportedArrayItem\(state\.importedData, 'lightDevices'/.test(storeSrc)
    && /deleteImportedArrayItem\(state\.importedData, 'deviceSessions'/.test(storeSrc)
    && /computeDeviceSessionDoses/.test(storeSrc));
assert('light-devices-store routes analyzer hook through injected deps',
  storeSrc.includes('configureLightDevicesStore')
    && storeSrc.includes('maybeAnalyzeDeviceSessionAfterFinish: () => {}')
    && !storeSrc.includes('window.maybeAnalyzeDeviceSessionAfterFinish'));
assert('light-sun AI hooks wire device analyzer into store deps',
  aiHooksSrc.includes("import { configureLightDevicesStore } from './light-devices-store.js';")
    && aiHooksSrc.includes("import { maybeAnalyzeDeviceSessionAfterFinish } from './light-device-ai-analysis.js';")
    && aiHooksSrc.includes('configureLightDevicesStore({ maybeAnalyzeDeviceSessionAfterFinish })')
    && appLightSunSrc.includes("import './light-sun-ai-hooks.js';"));

configureLightDevicesStore({ maybeAnalyzeDeviceSessionAfterFinish: () => {} });

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
