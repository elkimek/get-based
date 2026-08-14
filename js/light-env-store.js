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
import { DAYLIGHT_LEVELS, PRIMARY_SOURCES, SCREEN_DEVICES, defaultHoursForName } from './light-env-model.js';
import { createUniqueId } from './unique-id.js';

export function getEnvironment() {
  if (!state.importedData) return null;
  if (!state.importedData.lightEnvironment) {
    state.importedData.lightEnvironment = { rooms: [], screens: [] };
  }
  normalizeLightEnvironmentEveningFields(state.importedData.lightEnvironment);
  return state.importedData.lightEnvironment;
}

const ROOM_SOURCES = new Set(PRIMARY_SOURCES.map(item => item.key));
const DAYLIGHT_KEYS = new Set(['unknown', ...DAYLIGHT_LEVELS.map(item => item.key)]);
const SCREEN_KEYS = new Set(SCREEN_DEVICES.map(item => item.key));
const ROOM_PATCH_KEYS = new Set(['name', 'primarySource', 'daylightLevel', 'cct', 'flickerScore', 'hoursOccupiedPerDay', 'eveningHoursAfterSunset', 'notes']);
const SCREEN_PATCH_KEYS = new Set(['device', 'roomId', 'hoursPerDay', 'eveningUseAfterSunset', 'blueBlockerEnabled', 'flickerScore']);

function clampHours(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(24, Math.max(0, Math.round(number * 2) / 2));
}

function cleanName(value, fallback) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return name || fallback;
}

function clampCct(value) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(40000, Math.max(1000, Math.round(number / 100) * 100));
}

function clampFlickerScore(value) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(3, Math.max(0, Math.round(number)));
}

function sanitizeRoomPatch(patch = {}) {
  const normalized = normalizeRoomEveningPatch(patch);
  const next = {};
  for (const key of ROOM_PATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(normalized, key)) next[key] = normalized[key];
  }
  if ('name' in next) next.name = cleanName(next.name, 'Room');
  if ('hoursOccupiedPerDay' in next) next.hoursOccupiedPerDay = clampHours(next.hoursOccupiedPerDay);
  if ('eveningHoursAfterSunset' in next) next.eveningHoursAfterSunset = clampHours(next.eveningHoursAfterSunset);
  if ('primarySource' in next && !ROOM_SOURCES.has(next.primarySource)) next.primarySource = 'unknown';
  if ('daylightLevel' in next && !DAYLIGHT_KEYS.has(next.daylightLevel)) next.daylightLevel = 'unknown';
  if ('cct' in next) next.cct = clampCct(next.cct);
  if ('flickerScore' in next) next.flickerScore = clampFlickerScore(next.flickerScore);
  if ('notes' in next) next.notes = String(next.notes || '').slice(0, 1000);
  return next;
}

function sanitizeScreenPatch(patch = {}, env = null) {
  const next = {};
  for (const key of SCREEN_PATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
  }
  if ('device' in next && !SCREEN_KEYS.has(next.device)) next.device = 'phone';
  if ('hoursPerDay' in next) next.hoursPerDay = next.hoursPerDay == null ? null : clampHours(next.hoursPerDay);
  if ('eveningUseAfterSunset' in next) next.eveningUseAfterSunset = next.eveningUseAfterSunset == null ? null : clampHours(next.eveningUseAfterSunset);
  if ('blueBlockerEnabled' in next) next.blueBlockerEnabled = !!next.blueBlockerEnabled;
  if ('flickerScore' in next) next.flickerScore = clampFlickerScore(next.flickerScore);
  if ('roomId' in next) {
    const validRoom = next.roomId && (env?.rooms || []).some(room => room.id === next.roomId);
    next.roomId = validRoom ? next.roomId : null;
  }
  return next;
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
    name: cleanName(name, 'Room'),
    primarySource: ROOM_SOURCES.has(homeLight) ? homeLight : 'unknown',
    daylightLevel: 'unknown',
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
  Object.assign(room, sanitizeRoomPatch(patch));
  normalizeRoomEveningFields(room);
  room.updatedAt = Date.now();
  await saveImportedData();
  return room;
}

export async function deleteRoom(id) {
  const env = getEnvironment();
  if (!env) return false;
  const room = (env.rooms || []).find(item => item.id === id);
  const removedRooms = deleteImportedArrayItems(state.importedData, 'lightEnvironment.rooms', r => r.id === id);
  if (removedRooms.length === 0) return false;
  // Preserve measurements and their original room id so audit/history data
  // is not destroyed just because the live room card is removed.
  for (const measurement of state.importedData?.lightMeasurements || []) {
    if (measurement?.roomId === id && !measurement.roomSnapshot) {
      measurement.roomSnapshot = { id, name: room?.name || 'Deleted room' };
    }
  }
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
    device: SCREEN_KEYS.has(device) ? device : 'phone',
    roomId: roomId && (env.rooms || []).some(room => room.id === roomId) ? roomId : null,
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
  Object.assign(scr, sanitizeScreenPatch(patch, env));
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
