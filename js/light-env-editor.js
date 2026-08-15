// @ts-check
// light-env-editor.js — Room/screen editing state and mutation-command owner.

import { showConfirmDialog, showNotification, showPromptDialog } from './utils.js';
import {
  addRoom,
  addScreen,
  deleteRoom,
  deleteScreen,
  getEnvironment,
  setTodayActive,
  updateRoom,
  updateScreen,
} from './light-env-store.js';
import {
  DAYLIGHT_LEVELS,
  EVENING_BUCKETS,
  HOURS_BUCKETS,
  SCREEN_DEVICES,
  SOURCE_ARCHETYPES,
} from './light-env-model.js';
import { SCREEN_HOURS_BUCKETS } from './light-env-screen-ui.js';

const DEFAULT_ROOM_NAMES = ['Bedroom', 'Living room', 'Kitchen', 'Office', 'Bathroom'];
const ACTIVE_ROOM_KEY = 'labcharts-light-env-active-room';
const COLLAPSED_ROOM_ID = '__none__';

/** @type {{ refreshUI: (options?: any) => void }} */
const lightEnvEditorDeps = {
  refreshUI: () => {},
};

/** @param {Partial<typeof lightEnvEditorDeps>} [deps] */
export function configureLightEnvEditor(deps = {}) {
  const previous = { ...lightEnvEditorDeps };
  Object.assign(lightEnvEditorDeps, deps);
  return previous;
}

function refreshUI(options = {}) {
  lightEnvEditorDeps.refreshUI(options);
}

// Pick the next default room name based on which common names haven't been
// used yet. Names are matched case-insensitively so "bedroom" and "Bedroom"
// don't collide. Falls back to "Room N" once the curated list is exhausted.
export function nextDefaultRoomName() {
  const env = getEnvironment();
  const usedLC = new Set((env?.rooms || []).map(room => (room.name || '').trim().toLowerCase()));
  for (const candidate of DEFAULT_ROOM_NAMES) {
    if (!usedLC.has(candidate.toLowerCase())) return candidate;
  }
  return `Room ${(env?.rooms?.length || 0) + 1}`;
}

function readActiveRoomId() {
  try {
    return localStorage.getItem(ACTIVE_ROOM_KEY);
  } catch {
    return null;
  }
}

function writeActiveRoomId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_ROOM_KEY, id);
    else localStorage.removeItem(ACTIVE_ROOM_KEY);
  } catch {
    // localStorage may be unavailable in private mode.
  }
}

function isRoomCollapseSentinel(id) {
  return id === COLLAPSED_ROOM_ID;
}

function cssAttrSelectorValue(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function lightEnvRoomAnchor(id) {
  return `.light-env-room-disclosure[data-id="${cssAttrSelectorValue(id)}"]`;
}

function lightEnvScreenAnchor(id) {
  return `.light-env-screen-card[data-id="${cssAttrSelectorValue(id)}"]`;
}

function defaultActiveRoomId(rooms) {
  if (!Array.isArray(rooms) || rooms.length === 0) return null;
  if (rooms.length === 1) return rooms[0]?.id || null;
  const sorted = rooms.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return sorted[0]?.id || null;
}

export function resolveActiveRoomId(rooms) {
  const storedActiveId = readActiveRoomId();
  if (isRoomCollapseSentinel(storedActiveId)) return null;
  if (storedActiveId && rooms.find(room => room.id === storedActiveId)) return storedActiveId;
  return defaultActiveRoomId(rooms);
}

let expandedScreenId = null;

export function isLightEnvScreenExpanded(id) {
  return expandedScreenId === id;
}

async function addLightEnvRoom() {
  const env = getEnvironment();
  const before = env?.rooms?.length || 0;
  await addRoom(nextDefaultRoomName());
  const after = env?.rooms || [];
  if (after.length > before) writeActiveRoomId(after[after.length - 1].id);
  refreshUI();
}

async function addLightEnvRoomNamed(name) {
  const env = getEnvironment();
  const before = env?.rooms?.length || 0;
  await addRoom(name);
  const after = env?.rooms || [];
  if (after.length > before) writeActiveRoomId(after[after.length - 1].id);
  refreshUI();
}

async function addLightEnvRoomCustom() {
  const name = await showPromptDialog('Room name', {
    defaultValue: '',
    okLabel: 'Add room',
    placeholder: 'e.g. Workshop, Garage, Studio',
  });
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const env = getEnvironment();
  const before = env?.rooms?.length || 0;
  await addRoom(trimmed);
  const after = env?.rooms || [];
  if (after.length > before) writeActiveRoomId(after[after.length - 1].id);
  refreshUI();
}

function toggleLightEnvRoomExpanded(id, event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
  }
  if (event?.target) {
    const target = event.target;
    if (target.closest('button, input, select, textarea, a, label')) {
      if (!target.classList.contains('light-env-room-disclosure-head')
          && !target.classList.contains('light-env-room-disclosure-name')
          && !target.classList.contains('light-env-room-disclosure-signals')
          && !target.classList.contains('light-env-room-signal')
          && !target.classList.contains('light-env-room-disclosure-chevron')
          && !target.classList.contains('light-env-room-disclosure-spacer')
          && !target.classList.contains('light-env-sev-dot')) {
        return;
      }
    }
  }
  const rooms = getEnvironment()?.rooms || [];
  const current = resolveActiveRoomId(rooms);
  writeActiveRoomId(current === id ? COLLAPSED_ROOM_ID : id);
  refreshUI({ scrollAnchor: lightEnvRoomAnchor(id) });
}

async function updateLightEnvRoom(id, patch) {
  await updateRoom(id, patch);
}

async function setLightEnvRoomSourceArchetype(id, archetypeKey) {
  const archetype = SOURCE_ARCHETYPES.find(item => item.key === archetypeKey);
  if (!archetype) return;
  await updateRoom(id, { primarySource: archetype.storeAs });
  refreshUI();
}

async function setLightEnvRoomHoursBucket(id, bucketKey) {
  const bucket = HOURS_BUCKETS.find(item => item.key === bucketKey);
  if (!bucket) return;
  await updateRoom(id, { hoursOccupiedPerDay: bucket.midpoint });
  refreshUI();
}

async function setLightEnvRoomDaylightLevel(id, levelKey) {
  if (!DAYLIGHT_LEVELS.some(item => item.key === levelKey)) return;
  await updateRoom(id, { daylightLevel: levelKey });
  refreshUI();
}

// Auto-fill a room's primarySource from the Spectrum tool's classification
// only while the source remains unknown.
export async function suggestRoomSourceFromSpectrum(roomId, spectrumLabel, metadata = {}) {
  const env = getEnvironment();
  const room = (env?.rooms || []).find(item => item.id === roomId);
  if (!room) return;
  if (room.primarySource && room.primarySource !== 'unknown') return;
  // Camera RGB cannot reliably identify LED construction, daylight, or a
  // full spectrum. Only a user's explicit manual classification can fill
  // the room field automatically.
  if (metadata?.method !== 'manual-classification') return;
  const spectrumToSource = {
    'Fluorescent / CFL': 'fluorescent',
    'Fluorescent': 'fluorescent',
    'Incandescent / halogen': 'incandescent',
    'Cool LED (4000K+)': 'led-cool',
    'Cool LED with PWM dimming': 'led-cool',
    'Warm LED (2700–3000K)': 'led-warm',
    'Warm LED with PWM dimming': 'led-warm',
    'Daylight or full-spectrum': 'natural-only',
    'Daylight': 'natural-only',
    'Mixed / unclassified': 'mixed',
  };
  const mapped = spectrumToSource[spectrumLabel];
  if (!mapped) return;
  await updateRoom(roomId, { primarySource: mapped });
  showNotification(`Auto-set ${room.name || 'this room'}'s light source to ${mapped.replace('-', ' ')} from spectrum reading.`);
}

async function setLightEnvRoomEveningBucket(id, bucketKey) {
  const bucket = EVENING_BUCKETS.find(item => item.key === bucketKey);
  if (!bucket) return;
  await updateRoom(id, { eveningHoursAfterSunset: bucket.midpoint });
  refreshUI();
}

async function updateLightEnvRoomAndRender(id, patch) {
  await updateRoom(id, patch);
  refreshUI();
}

async function deleteLightEnvRoom(id) {
  await deleteRoom(id);
  if (readActiveRoomId() === id) writeActiveRoomId(null);
  refreshUI();
}

async function deleteLightEnvRoomConfirm(id) {
  if (await showConfirmDialog('Delete this room? Its saved readings and audit snapshots will remain available as historical data.')) {
    await deleteRoom(id);
    if (readActiveRoomId() === id) writeActiveRoomId(null);
    refreshUI();
  }
}

function setActiveLightEnvRoom(id) {
  writeActiveRoomId(id);
  refreshUI();
}

async function addLightEnvScreenWithDevice(roomId, device) {
  const validDevices = SCREEN_DEVICES.map(item => item.key);
  const deviceKey = validDevices.includes(device) ? device : 'phone';
  await addScreen(deviceKey, roomId || null);
  const screens = getEnvironment()?.screens || [];
  if (screens.length > 0) expandedScreenId = screens[screens.length - 1].id;
  refreshUI();
}

async function addLightEnvScreen(roomId = null) {
  let device = 'phone';
  if (roomId) {
    const room = (getEnvironment()?.rooms || []).find(item => item.id === roomId);
    const name = (room?.name || '').toLowerCase();
    if (/office|study|desk/.test(name)) device = 'laptop';
    else if (/living|family|tv/.test(name)) device = 'tv';
  }
  await addScreen(device, roomId);
  refreshUI();
}

async function updateLightEnvScreen(id, patch) {
  await updateScreen(id, patch);
}

async function updateLightEnvScreenAndRender(id, patch) {
  await updateScreen(id, patch);
  refreshUI();
}

async function deleteLightEnvScreen(id) {
  await deleteScreen(id);
  if (expandedScreenId === id) expandedScreenId = null;
  refreshUI();
}

async function deleteLightEnvScreenConfirm(id) {
  if (await showConfirmDialog('Delete this screen?')) {
    await deleteScreen(id);
    if (expandedScreenId === id) expandedScreenId = null;
    refreshUI();
  }
}

function toggleLightEnvScreenExpanded(id, event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
  }
  if (event?.target) {
    const target = event.target;
    if (target.closest('button, input, select, textarea, a, label')
        && !target.classList.contains('light-env-screen-card-head')
        && !target.classList.contains('light-env-screen-card-name')
        && !target.classList.contains('light-env-screen-card-icon')
        && !target.classList.contains('light-env-screen-card-summary')
        && !target.classList.contains('light-env-room-disclosure-chevron')
        && !target.classList.contains('light-env-room-disclosure-spacer')
        && !target.classList.contains('light-env-sev-dot')) {
      return;
    }
  }
  expandedScreenId = expandedScreenId === id ? null : id;
  refreshUI({ scrollAnchor: lightEnvScreenAnchor(id) });
}

async function setLightEnvScreenHoursBucket(id, bucketKey) {
  const bucket = SCREEN_HOURS_BUCKETS.find(item => item.key === bucketKey);
  if (!bucket) return;
  await updateScreen(id, { hoursPerDay: bucket.midpoint });
  refreshUI();
}

async function setLightEnvScreenEveningBucket(id, bucketKey) {
  const values = { none: 0, lt1: 0.5, mid: 2, gt3: 4 };
  if (!(bucketKey in values)) return;
  await updateScreen(id, { eveningUseAfterSunset: values[bucketKey] });
  refreshUI();
}

async function setLightEnvTodayActive(kind, id, active) {
  await setTodayActive(kind, id, active);
  refreshUI();
}

export const lightEnvEditorActionHandlers = Object.freeze({
  addLightEnvRoom,
  addLightEnvRoomNamed,
  addLightEnvRoomCustom,
  toggleLightEnvRoomExpanded,
  updateLightEnvRoom,
  setLightEnvRoomSourceArchetype,
  setLightEnvRoomDaylightLevel,
  setLightEnvRoomHoursBucket,
  setLightEnvRoomEveningBucket,
  updateLightEnvRoomAndRender,
  deleteLightEnvRoom,
  deleteLightEnvRoomConfirm,
  setActiveLightEnvRoom,
  addLightEnvScreenWithDevice,
  addLightEnvScreen,
  updateLightEnvScreen,
  updateLightEnvScreenAndRender,
  deleteLightEnvScreen,
  deleteLightEnvScreenConfirm,
  toggleLightEnvScreenExpanded,
  setLightEnvScreenHoursBucket,
  setLightEnvScreenEveningBucket,
  setLightEnvTodayActive,
});
