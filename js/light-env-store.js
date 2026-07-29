// @ts-check
// light-env-store.js - persisted Light Environment room/screen mutations.
//
// UI modules own rendering, modal state, prompts, and notifications. This
// module owns importedData.lightEnvironment room/screen writes, today
// overrides, sync freshness stamps, cascading room cleanup, tombstones, and
// saveImportedData().

import { state } from './state.js';
import { saveImportedData } from './data.js';
import { deleteImportedArrayItems } from './data-merge.js';
import {
  normalizeLightEnvironmentEveningFields,
  normalizeRoomEveningFields,
  normalizeRoomEveningPatch,
} from './light-env-evening.js';
import { defaultHoursForName } from './light-env-model.js';
import { createUniqueId } from './unique-id.js';

export function getEnvironment() {
  if (!state.importedData) return null;
  if (!state.importedData.lightEnvironment) {
    state.importedData.lightEnvironment = { rooms: [], screens: [] };
  }
  normalizeLightEnvironmentEveningFields(state.importedData.lightEnvironment);
  return state.importedData.lightEnvironment;
}

export async function addRoom(name) {
  const env = getEnvironment();
  if (!env) return null;
  if (!Array.isArray(env.rooms)) env.rooms = [];

  const homeLight = state.importedData?.sunDefaults?.homeLight;
  const presetHours = defaultHoursForName(name);
  const id = createUniqueId('room_');
  env.rooms.push({
    id,
    name: name || 'Room',
    primarySource: homeLight || 'unknown',
    cct: null,
    flickerScore: null,
    hoursOccupiedPerDay: presetHours,
    eveningHoursAfterSunset: null,
    notes: '',
  });
  await saveImportedData();
  return id;
}

export async function updateRoom(id, patch = {}) {
  const env = getEnvironment();
  const room = (env?.rooms || []).find(r => r.id === id);
  if (!room) return null;
  Object.assign(room, normalizeRoomEveningPatch(patch));
  normalizeRoomEveningFields(room);
  room.updatedAt = Date.now();
  await saveImportedData();
  return room;
}

export async function deleteRoom(id) {
  const env = getEnvironment();
  if (!env) return false;
  const removedRooms = deleteImportedArrayItems(state.importedData, 'lightEnvironment.rooms', r => r.id === id);
  if (removedRooms.length === 0) return false;
  deleteImportedArrayItems(state.importedData, 'lightMeasurements', m => m && m.roomId === id);
  if (Array.isArray(env.screens)) {
    for (const sc of env.screens) {
      if (sc && sc.roomId === id) sc.roomId = null;
    }
  }
  await saveImportedData();
  return true;
}

export async function addScreen(device, roomId = null) {
  const env = getEnvironment();
  if (!env) return null;
  if (!Array.isArray(env.screens)) env.screens = [];
  const id = createUniqueId('scr_');
  env.screens.push({
    id,
    device: device || 'phone',
    roomId: roomId || null,
    hoursPerDay: null,
    eveningUseAfterSunset: null,
    blueBlockerEnabled: false,
    flickerScore: null,
  });
  await saveImportedData();
  return id;
}

export function getScreensForRoom(roomId) {
  const env = getEnvironment();
  return (env?.screens || []).filter(s => (s.roomId || null) === (roomId || null));
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isActiveToday(item) {
  if (!item) return false;
  const ov = item.todayOverride;
  if (!ov || ov.date !== todayKey()) return true;
  return ov.active !== false;
}

export async function setTodayActive(kind, id, active) {
  const env = getEnvironment();
  const list = kind === 'room' ? (env?.rooms || []) : (env?.screens || []);
  const item = list.find(x => x.id === id);
  if (!item) return null;
  item.todayOverride = { date: todayKey(), active: !!active };
  item.updatedAt = Date.now();
  await saveImportedData();
  return item;
}

export async function updateScreen(id, patch = {}) {
  const env = getEnvironment();
  const scr = (env?.screens || []).find(s => s.id === id);
  if (!scr) return null;
  Object.assign(scr, patch);
  scr.updatedAt = Date.now();
  await saveImportedData();
  return scr;
}

export async function deleteScreen(id) {
  const env = getEnvironment();
  if (!env) return false;
  const removed = deleteImportedArrayItems(state.importedData, 'lightEnvironment.screens', s => s.id === id);
  if (removed.length === 0) return false;
  await saveImportedData();
  return true;
}
