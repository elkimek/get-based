// light-env-editor.js — Room/screen editing state and mutation-command owner.

import { state } from './state.js';
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


interface EditorRoomOperations { id?: unknown; updatedAt?: number; name?: string | null }
interface DisclosureEventOperations { preventDefault?: (() => unknown) | null; stopPropagation?: (() => unknown) | null; target?: HTMLElement | null }
interface EditorRefreshCalls extends Record<string, unknown> { refreshUI: (options?: unknown) => unknown }
// Private method/collection views preserve unchecked imported values and event
// operations. Configuration snapshots and selected persisted IDs stay opaque.

const DEFAULT_ROOM_NAMES = ['Bedroom', 'Living room', 'Kitchen', 'Office', 'Bathroom'];
const ACTIVE_ROOM_KEY = 'labcharts-light-env-active-room';
const COLLAPSED_ROOM_ID = '__none__';

const lightEnvEditorDeps: EditorRefreshCalls = {
  refreshUI: () => {},
};

export function configureLightEnvEditor(deps: unknown = {}): Record<string, unknown> {
  const previous = { ...lightEnvEditorDeps };
  Object.assign(lightEnvEditorDeps, deps);
  return previous;
}

function captureEditorOwner() {
  const profile = state.currentProfile, data = state.importedData;
  const overlay = typeof document === 'undefined' ? null : document.getElementById('light-env-assessment-overlay');
  return () => state.currentProfile === profile && state.importedData === data
    && (!overlay || overlay.isConnected && document.getElementById('light-env-assessment-overlay') === overlay);
}

function refreshUI(options: unknown = {}) {
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

function writeActiveRoomId(id: unknown) {
  try {
    if (id) localStorage.setItem(ACTIVE_ROOM_KEY, id as string);
    else localStorage.removeItem(ACTIVE_ROOM_KEY);
  } catch {
    // localStorage may be unavailable in private mode.
  }
}

function isRoomCollapseSentinel(id: unknown) {
  return id === COLLAPSED_ROOM_ID;
}

function cssAttrSelectorValue(value: unknown) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function lightEnvRoomAnchor(id: unknown) {
  return `.light-env-room-disclosure[data-id="${cssAttrSelectorValue(id)}"]`;
}

function lightEnvScreenAnchor(id: unknown) {
  return `.light-env-screen-card[data-id="${cssAttrSelectorValue(id)}"]`;
}

function defaultActiveRoomId(rooms: unknown): unknown {
  if (!Array.isArray(rooms) || rooms.length === 0) return null;
  if (rooms.length === 1) return rooms[0]?.id || null;
  const sorted = (rooms as EditorRoomOperations[]).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return sorted[0]?.id || null;
}

export function resolveActiveRoomId(rooms: unknown): unknown {
  const storedActiveId = readActiveRoomId();
  if (isRoomCollapseSentinel(storedActiveId)) return null;
  if (storedActiveId && (rooms as EditorRoomOperations[]).find(room => room.id === storedActiveId)) return storedActiveId;
  return defaultActiveRoomId(rooms);
}

let expandedScreenId: unknown = null;

export function isLightEnvScreenExpanded(id: unknown) {
  return expandedScreenId === id;
}

async function addLightEnvRoom() {
  const current = captureEditorOwner();
  const env = getEnvironment();
  const before = env?.rooms?.length || 0;
  const accepted = await addRoom(nextDefaultRoomName());
  if (!current() || !accepted) return;
  const after = getEnvironment()?.rooms || [];
  if (after.length > before) writeActiveRoomId(after[after.length - 1]!.id);
  refreshUI();
}

async function addLightEnvRoomNamed(name: unknown) {
  const current = captureEditorOwner();
  const env = getEnvironment();
  const before = env?.rooms?.length || 0;
  const accepted = await (addRoom as (name: unknown) => ReturnType<typeof addRoom>)(name);
  if (!current() || !accepted) return;
  const after = getEnvironment()?.rooms || [];
  if (after.length > before) writeActiveRoomId(after[after.length - 1]!.id);
  refreshUI();
}

async function addLightEnvRoomCustom() {
  const current = captureEditorOwner();
  const name = await showPromptDialog('Room name', {
    defaultValue: '',
    okLabel: 'Add room',
    placeholder: 'e.g. Workshop, Garage, Studio',
  });
  if (!current() || name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const env = getEnvironment();
  const before = env?.rooms?.length || 0;
  const accepted = await addRoom(trimmed);
  if (!current() || !accepted) return;
  const after = getEnvironment()?.rooms || [];
  if (after.length > before) writeActiveRoomId(after[after.length - 1]!.id);
  refreshUI();
}

function toggleLightEnvRoomExpanded(id: unknown, event: unknown) {
  if (event) {
    (event as DisclosureEventOperations).preventDefault?.();
    (event as DisclosureEventOperations).stopPropagation?.();
  }
  if ((event as DisclosureEventOperations | null | undefined)?.target) {
    const target = (event as DisclosureEventOperations).target!;
    if (target.closest('button, input, select, textarea, a, label')) {
      if (!target.classList.contains('light-env-room-disclosure-toggle')
          && !target.classList.contains('light-env-room-disclosure-head')
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

async function updateLightEnvRoom(id: unknown, patch: unknown) {
  const current = captureEditorOwner();
  const accepted = await (updateRoom as (id: unknown, patch: unknown) => Promise<unknown>)(id, patch);
  if (!current() || !accepted) return;
}

async function setLightEnvRoomSourceArchetype(id: unknown, archetypeKey: unknown) {
  const current = captureEditorOwner();
  const archetype = SOURCE_ARCHETYPES.find(item => item.key === archetypeKey);
  if (!archetype) return;
  const accepted = await updateRoom(id, { primarySource: archetype.storeAs });
  if (!current() || !accepted) return;
  refreshUI();
}

async function setLightEnvRoomHoursBucket(id: unknown, bucketKey: unknown) {
  const current = captureEditorOwner();
  const bucket = HOURS_BUCKETS.find(item => item.key === bucketKey);
  if (!bucket) return;
  const accepted = await updateRoom(id, { hoursOccupiedPerDay: bucket.midpoint });
  if (!current() || !accepted) return;
  refreshUI();
}

async function setLightEnvRoomDaylightLevel(id: unknown, levelKey: unknown) {
  const current = captureEditorOwner();
  if (!DAYLIGHT_LEVELS.some(item => item.key === levelKey)) return;
  const accepted = await updateRoom(id, { daylightLevel: levelKey });
  if (!current() || !accepted) return;
  refreshUI();
}

// Auto-fill a room's primarySource from the Spectrum tool's classification
// only while the source remains unknown.
export async function suggestRoomSourceFromSpectrum(roomId: unknown, spectrumLabel: unknown, metadata: unknown = {}) {
  const current = captureEditorOwner();
  const env = getEnvironment();
  const room = (env?.rooms || []).find(item => item.id === roomId);
  if (!room) return;
  if (room.primarySource && room.primarySource !== 'unknown') return;
  // Camera RGB cannot reliably identify LED construction, daylight, or a
  // full spectrum. Only a user's explicit manual classification can fill
  // the room field automatically.
  if ((metadata as { method?: unknown } | null | undefined)?.method !== 'manual-classification') return;
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
  const mapped = (spectrumToSource as Record<string, unknown>)[spectrumLabel as string] as { replace(search: string, replacement: string): unknown } | null | undefined;
  if (!mapped) return;
  const accepted = await updateRoom(roomId, { primarySource: mapped });
  if (!current() || !accepted) return;
  showNotification(`Auto-set ${room.name || 'this room'}'s light source to ${mapped.replace('-', ' ')} from spectrum reading.`);
}

async function setLightEnvRoomEveningBucket(id: unknown, bucketKey: unknown) {
  const current = captureEditorOwner();
  const bucket = EVENING_BUCKETS.find(item => item.key === bucketKey);
  if (!bucket) return;
  const accepted = await updateRoom(id, { eveningHoursAfterSunset: bucket.midpoint });
  if (!current() || !accepted) return;
  refreshUI();
}

async function updateLightEnvRoomAndRender(id: unknown, patch: unknown) {
  const current = captureEditorOwner();
  const accepted = await (updateRoom as (id: unknown, patch: unknown) => Promise<unknown>)(id, patch);
  if (!current() || !accepted) return;
  refreshUI();
}

async function deleteLightEnvRoom(id: unknown) {
  const current = captureEditorOwner();
  const accepted = await deleteRoom(id);
  if (!current() || !accepted) return;
  if (readActiveRoomId() === id) writeActiveRoomId(null);
  refreshUI();
}

async function deleteLightEnvRoomConfirm(id: unknown) {
  const current = captureEditorOwner();
  if (await showConfirmDialog('Delete this room? Its saved readings and audit snapshots will remain available as historical data.')) {
    if (!current()) return;
    const accepted = await deleteRoom(id);
    if (!current() || !accepted) return;
    if (readActiveRoomId() === id) writeActiveRoomId(null);
    refreshUI();
  }
}

function setActiveLightEnvRoom(id: unknown) {
  writeActiveRoomId(id);
  refreshUI();
}

async function addLightEnvScreenWithDevice(roomId: unknown, device: unknown) {
  const current = captureEditorOwner();
  const validDevices = SCREEN_DEVICES.map(item => item.key);
  const deviceKey = (validDevices.includes(device as string) ? device : 'phone') as string;
  const accepted = await (addScreen as (device: Parameters<typeof addScreen>[0], roomId: unknown) => ReturnType<typeof addScreen>)(deviceKey, roomId || null);
  if (!current() || !accepted) return;
  const screens = getEnvironment()?.screens || [];
  if (screens.length > 0) expandedScreenId = screens[screens.length - 1]!.id;
  refreshUI();
}

async function addLightEnvScreen(roomId: unknown = null) {
  const current = captureEditorOwner();
  let device = 'phone';
  if (roomId) {
    const room = (getEnvironment()?.rooms || []).find(item => item.id === roomId);
    const name = (room?.name || '').toLowerCase();
    if (/office|study|desk/.test(name)) device = 'laptop';
    else if (/living|family|tv/.test(name)) device = 'tv';
  }
  const accepted = await (addScreen as (device: Parameters<typeof addScreen>[0], roomId: unknown) => ReturnType<typeof addScreen>)(device, roomId);
  if (!current() || !accepted) return;
  refreshUI();
}

async function updateLightEnvScreen(id: unknown, patch: unknown) {
  const current = captureEditorOwner();
  const accepted = await (updateScreen as (id: unknown, patch: unknown) => Promise<unknown>)(id, patch);
  if (!current() || !accepted) return;
}

async function updateLightEnvScreenAndRender(id: unknown, patch: unknown) {
  const current = captureEditorOwner();
  const accepted = await (updateScreen as (id: unknown, patch: unknown) => Promise<unknown>)(id, patch);
  if (!current() || !accepted) return;
  refreshUI();
}

async function deleteLightEnvScreen(id: unknown) {
  const current = captureEditorOwner();
  const accepted = await deleteScreen(id);
  if (!current() || !accepted) return;
  if (expandedScreenId === id) expandedScreenId = null;
  refreshUI();
}

async function deleteLightEnvScreenConfirm(id: unknown) {
  const current = captureEditorOwner();
  if (await showConfirmDialog('Delete this screen?')) {
    if (!current()) return;
    const accepted = await deleteScreen(id);
    if (!current() || !accepted) return;
    if (expandedScreenId === id) expandedScreenId = null;
    refreshUI();
  }
}

function toggleLightEnvScreenExpanded(id: unknown, event: unknown) {
  if (event) {
    (event as DisclosureEventOperations).preventDefault?.();
    (event as DisclosureEventOperations).stopPropagation?.();
  }
  if ((event as DisclosureEventOperations | null | undefined)?.target) {
    const target = (event as DisclosureEventOperations).target!;
    if (target.closest('button, input, select, textarea, a, label')
        && !target.classList.contains('light-env-screen-disclosure')
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

async function setLightEnvScreenHoursBucket(id: unknown, bucketKey: unknown) {
  const current = captureEditorOwner();
  const bucket = SCREEN_HOURS_BUCKETS.find(item => item.key === bucketKey);
  if (!bucket) return;
  const accepted = await updateScreen(id, { hoursPerDay: bucket.midpoint });
  if (!current() || !accepted) return;
  refreshUI();
}

async function setLightEnvScreenEveningBucket(id: unknown, bucketKey: unknown) {
  const current = captureEditorOwner();
  const values = { none: 0, lt1: 0.5, mid: 2, gt3: 4 };
  if (!((bucketKey as PropertyKey) in values)) return;
  const accepted = await updateScreen(id, { eveningUseAfterSunset: (values as Record<PropertyKey, unknown>)[bucketKey as PropertyKey] });
  if (!current() || !accepted) return;
  refreshUI();
}

async function setLightEnvTodayActive(kind: unknown, id: unknown, active: unknown) {
  const current = captureEditorOwner();
  const accepted = await (setTodayActive as (kind: unknown, id: unknown, active: unknown) => ReturnType<typeof setTodayActive>)(kind, id, active);
  if (!current() || !accepted) return;
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
