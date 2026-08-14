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
  melanopicDER: 0.8,
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
  melanopicDER: 0.8,
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
assert('logDeviceSession persists dose, lastSession, updatedAt, and analyzer hook',
  logged?.id?.startsWith('devsess_')
    && logged.doses.circadian > 0
    && logged.metrics.melanopicEdiLux === 8000
    && logged.notes === 'morning'
    && loggedDevice.lastSession.durationMin === 10
    && Number.isFinite(loggedDevice.updatedAt)
    && analysisCalls === 1);

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
    && analysisCalls === 2);

const loggedCircadianDose = logged.doses.circadian;
const edited = await updateDeviceSession(logged.id, { durationMin: 20, notes: 'edited' });
assert('updateDeviceSession recomputes duration-derived fields and stamps sync freshness',
  edited?.durationMin === 20
    && edited.notes === 'edited'
    && edited.endedAt === edited.startedAt + 20 * 60 * 1000
    && edited.doses.circadian > loggedCircadianDose
    && Number.isFinite(edited.updatedAt)
    && analysisCalls === 3);
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

reset({ lightDevices: [{
  id: 'uv-1', brand: 'UV', model: '311', type: 'uvb',
  peakWavelengths: [311], mwPerCm2At15cm: 50, recommendedDistanceCm: 30,
}] });
const unsafeHistorical = await logDeviceSession({
  deviceId: 'uv-1', durationMin: 1, distanceCm: 30, eyesProtected: false,
});
assert('Historical UV log is retained but explicitly flagged unsafe for eyes',
  unsafeHistorical?.safety?.hasUV === true
    && unsafeHistorical.safety.unsafeEyeExposure === true
    && unsafeHistorical.safety.ocularActinicUV > 0);
assert('Store boundary refuses to start a live UV timer without recorded UV eye protection',
  await startDeviceSession({ deviceId: 'uv-1', distanceCm: 30, eyesProtected: false }) === null);
const protectedUvId = await startDeviceSession({ deviceId: 'uv-1', distanceCm: 30, eyesProtected: true });
assert('Store boundary allows a UV timer with recorded eye protection',
  typeof protectedUvId === 'string' && getActiveDeviceSession()?.id === protectedUvId);

reset({ deviceSessions: [
  { id: 'recent', endedAt: Date.now(), doses: { circadian: 100, pbm_red: 5 } },
  { id: 'old', endedAt: Date.now() - 30 * 86400 * 1000, doses: { circadian: 999 } },
] });
const totals = rollingDeviceTotals(7);
assert('rollingDeviceTotals sums only in-window finite doses',
  totals.circadian === 100 && totals.pbm_red === 5);

console.log('%c 3. Boundary ownership ', 'font-weight:bold;color:#f59e0b');
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
    && storeSrc.includes('maybeAnalyzeDeviceSessionAfterFinish: requestDeviceSessionAnalysis')
    && !storeSrc.includes('window.maybeAnalyzeDeviceSessionAfterFinish'));
assert('light-sun AI hooks wire device analyzer into store deps',
  aiHooksSrc.includes("import { configureLightDevicesStore } from './light-devices-store.js';")
    && aiHooksSrc.includes("import { maybeAnalyzeDeviceSessionAfterFinish } from './light-device-ai-analysis.js';")
    && aiHooksSrc.includes('configureLightDevicesStore({ maybeAnalyzeDeviceSessionAfterFinish })')
    && appLightSunSrc.includes("import './light-sun-ai-hooks.js';"));

configureLightDevicesStore({ maybeAnalyzeDeviceSessionAfterFinish: () => {} });

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
