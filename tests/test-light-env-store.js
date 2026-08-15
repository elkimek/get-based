#!/usr/bin/env node
// test-light-env-store.js - Light Environment mutation boundary coverage.

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

console.log('=== Light Environment Store Tests ===\n');

const { state } = await import('../js/state.js');
const {
  addRoom,
  addScreen,
  deleteRoom,
  deleteScreen,
  getEnvironment,
  getScreensForRoom,
  isActiveToday,
  setTodayActive,
  updateRoom,
  updateScreen,
} = await import('../js/light-env-store.js');

const originalCurrentProfile = state.currentProfile;
state.currentProfile = 'light-env-store-test';
const originalImportedData = state.importedData;

function reset(seed = {}) {
  state.importedData = Object.assign({ entries: [] }, seed);
}

console.log('%c 1. Environment and room mutations ', 'font-weight:bold;color:#f59e0b');
reset();
const env = getEnvironment();
assert('getEnvironment lazily initializes rooms and screens',
  env && Array.isArray(env.rooms) && Array.isArray(env.screens));

state.importedData = null;
assert('getEnvironment returns null without importedData',
  getEnvironment() === null);

reset({ sunDefaults: { homeLight: 'led-warm' } });
const roomId = await addRoom('Bedroom');
const room = getEnvironment().rooms[0];
assert('addRoom persists defaults and returns id',
  typeof roomId === 'string'
    && roomId.startsWith('room_')
    && room.id === roomId
    && room.name === 'Bedroom'
    && room.primarySource === 'led-warm'
    && room.daylightLevel === 'unknown'
    && room.hoursOccupiedPerDay === 8
    && room.eveningHoursAfterSunset === null);

await updateRoom(roomId, {
  name: '  Bedroom   workspace  ',
  primarySource: 'fluorescent',
  daylightLevel: 'some',
  hoursOccupiedPerDay: 99,
  cct: 99999,
  id: 'corrupt-id',
  unexpected: 'discard me',
  eveningUseAfterSunset: true,
});
assert('updateRoom normalizes and bounds persisted room fields',
  room.name === 'Bedroom workspace'
    && room.id === roomId
    && !('unexpected' in room)
    && room.primarySource === 'fluorescent'
    && room.daylightLevel === 'some'
    && room.hoursOccupiedPerDay === 24
    && room.cct === 40000
    && room.eveningHoursAfterSunset === 2
    && !('eveningUseAfterSunset' in room)
    && Number.isFinite(room.updatedAt));
assert('updateRoom returns null for missing room',
  await updateRoom('missing-room', { primarySource: 'led-cool' }) === null);

await setTodayActive('room', roomId, false);
assert('setTodayActive stamps today override and freshness',
  isActiveToday(room) === false
    && room.todayOverride?.active === false
    && Number.isFinite(room.updatedAt));
assert('setTodayActive returns null for missing item',
  await setTodayActive('room', 'missing-room', true) === null);

console.log('%c 2. Screen mutations ', 'font-weight:bold;color:#f59e0b');
const portableScreenId = await addScreen('phone');
const roomScreenId = await addScreen('laptop', roomId);
assert('addScreen persists portable and room-bound screens',
  getEnvironment().screens.length === 2
    && getScreensForRoom(null).some(s => s.id === portableScreenId)
    && getScreensForRoom(roomId).some(s => s.id === roomScreenId));

const portable = getScreensForRoom(null)[0];
await updateScreen(portable.id, { hoursPerDay: 4, eveningUseAfterSunset: 2, blueBlockerEnabled: true });
assert('updateScreen patches fields and stamps freshness',
  portable.hoursPerDay === 4
    && portable.eveningUseAfterSunset === 2
    && portable.blueBlockerEnabled === true
    && Number.isFinite(portable.updatedAt));
assert('updateScreen returns null for missing screen',
  await updateScreen('missing-screen', { hoursPerDay: 1 }) === null);

await updateScreen(portable.id, { device: 'made-up-device', roomId: 'missing-room', hoursPerDay: -3, id: 'corrupt-screen', unexpected: true });
assert('updateScreen rejects unknown devices and room links and bounds hours',
  portable.device === 'phone'
    && portable.id !== 'corrupt-screen'
    && !('unexpected' in portable)
    && portable.roomId === null
    && portable.hoursPerDay === 0);

assert('deleteScreen removes screen and records tombstone',
  await deleteScreen(portable.id) === true
    && !getEnvironment().screens.some(s => s.id === portable.id)
    && state.importedData._deleted['lightEnvironment.screens'].includes(portable.id));
assert('deleteScreen missing path returns false',
  await deleteScreen('missing-screen') === false);

console.log('%c 3. Room deletion preserves history ', 'font-weight:bold;color:#f59e0b');
state.importedData.lightMeasurements = [
  { id: 'lm-room', roomId, tool: 'lux', value: 100, capturedAt: Date.now() },
  { id: 'lm-other', roomId: 'other-room', tool: 'lux', value: 200, capturedAt: Date.now() },
];
assert('deleteRoom removes the live room, preserves linked measurements, and makes screens portable',
  await deleteRoom(roomId) === true
    && !getEnvironment().rooms.some(r => r.id === roomId)
    && state.importedData.lightMeasurements.some(m => m.id === 'lm-room')
    && state.importedData.lightMeasurements.some(m => m.id === 'lm-other')
    && getEnvironment().screens.find(s => s.id === roomScreenId)?.roomId === null);
assert('deleteRoom snapshots the room name and tombstones only the removed room',
  state.importedData._deleted['lightEnvironment.rooms'].includes(roomId)
    && state.importedData.lightMeasurements.find(m => m.id === 'lm-room')?.roomSnapshot?.id === roomId
    && state.importedData.lightMeasurements.find(m => m.id === 'lm-room')?.roomSnapshot?.name === 'Bedroom workspace'
    && !(state.importedData._deleted.lightMeasurements || []).includes('lm-room'));
assert('deleteRoom missing path returns false',
  await deleteRoom('missing-room') === false);

console.log('%c 4. Boundary ownership ', 'font-weight:bold;color:#f59e0b');
const uiSrc = read('js/light-env.js');
const storeSrc = read('js/light-env-store.js');
assert('light-env imports the store boundary',
  uiSrc.includes("from './light-env-store.js'"));
assert('light-env no longer persists room/screen mutations directly',
  !/saveImportedData\(/.test(uiSrc)
    && !/deleteImportedArrayItems\(/.test(uiSrc)
    && !/state\.importedData\.lightEnvironment\s*=/.test(uiSrc));
assert('light-env-store owns synced persistence for rooms and screens',
  /saveImportedData\(/.test(storeSrc)
    && /deleteImportedArrayItems\(state\.importedData, 'lightEnvironment\.rooms'/.test(storeSrc)
    && /deleteImportedArrayItems\(state\.importedData, 'lightEnvironment\.screens'/.test(storeSrc));

state.importedData = originalImportedData;
state.currentProfile = originalCurrentProfile;

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
