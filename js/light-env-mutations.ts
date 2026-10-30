// Pure room/screen commands shared by the ordinary editor and reviewed chat.
import type { ProfileData } from '../types/app-state.js';
import { PRIMARY_SOURCES, DAYLIGHT_LEVELS, SCREEN_DEVICES, defaultHoursForName } from './light-env-model.js';
import { normalizeRoomEveningFields, normalizeRoomEveningPatch } from './light-env-evening.js';
import { appendImportedArrayItem, deleteImportedArrayItems } from './data-merge.js';

export type LightEnvironmentResource = 'lightRooms' | 'lightScreens';
export type LightEnvironmentRow = Record<string, unknown> & { id: string; eveningHoursAfterSunset?: unknown; eveningUseAfterSunset?: unknown };
export const isLightEnvironmentResource = (value: string): value is LightEnvironmentResource => value === 'lightRooms' || value === 'lightScreens';
export const lightEnvironmentField = (resource: LightEnvironmentResource) => resource === 'lightRooms' ? 'rooms' : 'screens';
const sources = PRIMARY_SOURCES.map(row => row.key), daylight = ['unknown', ...DAYLIGHT_LEVELS.map(row => row.key)], devices = SCREEN_DEVICES.map(row => row.key);
export const lightRoomFields = { name: 'Room name, 1–80 characters', primarySource: sources, daylightLevel: daylight, cct: 'Kelvin: 1000–40000 in steps of 100, or null for unknown', flickerScore: 'Integer 0–3, or null for unknown', hoursOccupiedPerDay: 'Hours 0–24 in half-hour increments, or null for unknown', eveningHoursAfterSunset: 'Hours 0–24 in half-hour increments, or null for unknown', notes: 'Text, max 1000 characters', todayActive: 'Boolean for localDate only; null clears the override' };
export const lightScreenFields = { device: devices, roomId: 'Exact listed room ID, or null for portable/unassigned', hoursPerDay: 'Hours 0–24 in half-hour increments, or null for unknown', eveningUseAfterSunset: 'Hours 0–24 in half-hour increments, or null for unknown', blueBlockerEnabled: 'Boolean, or null for unknown', flickerScore: 'Integer 0–3, or null for unknown', todayActive: 'Boolean for localDate only; null clears the override' };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function lightEnvironmentRows(data: Partial<ProfileData>, resource: LightEnvironmentResource): LightEnvironmentRow[] {
  const env: unknown = data.lightEnvironment;
  if (env == null) return [];
  if (!object(env)) throw new Error('Review this Light Environment in its normal editor.');
  const rows = env[lightEnvironmentField(resource)];
  if (rows == null) return [];
  if (!Array.isArray(rows) || rows.some(row => !object(row) || typeof row.id !== 'string' || !row.id)) throw new Error('Review these Light record identities in their normal editor.');
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate Light record identities need review in the normal editor.');
  return rows as LightEnvironmentRow[];
}
export function displayLightEnvironmentRecord(resource: LightEnvironmentResource, value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (!object(value)) throw new Error('Invalid Light record.');
  const row = value.version === 1 && value.resource === resource && typeof value.revision === 'string' && (object(value.record) || value.record === null) ? value.record : value;
  if (row === null) return null;
  const fields = resource === 'lightRooms' ? lightRoomFields : lightScreenFields;
  const selected: Record<string, unknown> = { id: row.id };
  const copy = { ...row }; if (resource === 'lightRooms') normalizeRoomEveningFields(copy);
  for (const key of Object.keys(fields).filter(key => key !== 'todayActive')) {
    const item = copy[key];
    if (item == null || typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)) selected[key] = item ?? null;
    else throw new Error('Review this older Light field in its normal editor.');
  }
  const override = row.todayOverride;
  if (override != null) {
    if (!object(override) || typeof override.date !== 'string' || typeof override.active !== 'boolean') throw new Error('Review this older Light day override in its normal editor.');
    selected.todayOverride = { date: override.date, active: override.active };
  }
  return selected;
}
const clampHours = (value: unknown) => value == null ? null : !Number.isFinite(Number(value)) ? 0 : Math.min(24, Math.max(0, Math.round(Number(value) * 2) / 2));
const cleanName = (value: unknown, fallback: string) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || fallback;
const clampCct = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? null : Math.min(40000, Math.max(1000, Math.round(Number(value) / 100) * 100));
const clampFlicker = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? null : Math.min(3, Math.max(0, Math.round(Number(value))));
export function sanitizeLightEnvironmentPatch(resource: LightEnvironmentResource, patch: Record<string, unknown>, data: Partial<ProfileData>) {
  const input = resource === 'lightRooms' ? normalizeRoomEveningPatch(patch) : patch;
  if (resource === 'lightRooms' && patch.eveningHoursAfterSunset === null) input.eveningHoursAfterSunset = null;
  const fields = resource === 'lightRooms' ? lightRoomFields : lightScreenFields;
  const next = Object.fromEntries(Object.entries(input).filter(([key]) => Object.hasOwn(fields, key)));
  if ('name' in next) next.name = cleanName(next.name, 'Room');
  for (const key of ['hoursOccupiedPerDay', 'hoursPerDay', 'eveningHoursAfterSunset', 'eveningUseAfterSunset']) if (key in next) next[key] = input[key] == null ? null : clampHours(input[key]);
  if ('primarySource' in next && !sources.includes(String(next.primarySource))) next.primarySource = 'unknown';
  if ('daylightLevel' in next && !daylight.includes(String(next.daylightLevel))) next.daylightLevel = 'unknown';
  if ('device' in next && !devices.includes(String(next.device))) next.device = 'phone';
  if ('cct' in next) next.cct = clampCct(next.cct);
  if ('flickerScore' in next) next.flickerScore = clampFlicker(next.flickerScore);
  if ('notes' in next) next.notes = String(next.notes || '').slice(0, 1000);
  if ('blueBlockerEnabled' in next && next.blueBlockerEnabled != null) next.blueBlockerEnabled = !!next.blueBlockerEnabled;
  if ('roomId' in next) next.roomId = lightEnvironmentRows(data, 'lightRooms').some(row => row.id === next.roomId) ? next.roomId : null;
  return next;
}
export function validateLightEnvironmentPatch(resource: LightEnvironmentResource, operation: string, patch: Record<string, unknown>) {
  const fields = resource === 'lightRooms' ? lightRoomFields : lightScreenFields;
  if (Object.keys(patch).some(key => operation === 'remove' || !Object.hasOwn(fields, key))) throw new Error('Supply only supported Light fields; removal uses an empty patch.');
  if (operation !== 'remove' && !Object.keys(patch).length) throw new Error('Supply at least one reported Light field.');
  if (operation === 'add' && (resource === 'lightRooms' ? typeof patch.name !== 'string' || !patch.name.trim() : !devices.includes(String(patch.device)))) throw new Error('A new room needs its reported name; a new screen needs its reported device type.');
  for (const [key, value] of Object.entries(patch)) {
    const rule = fields[key as keyof typeof fields];
    if (Array.isArray(rule) && !rule.includes(value as never)) throw new Error(`Choose a listed ${key}.`);
    if (key === 'name' && (typeof value !== 'string' || !value.trim() || value.length > 80) || key === 'notes' && (typeof value !== 'string' || value.length > 1000)) throw new Error(`Supply valid ${key}.`);
    if (['hoursOccupiedPerDay', 'hoursPerDay', 'eveningHoursAfterSunset', 'eveningUseAfterSunset'].includes(key) && value !== null && (typeof value !== 'number' || value < 0 || value > 24 || !Number.isFinite(value) || !Number.isInteger(value * 2))) throw new Error('Light hours must be 0–24 in half-hour increments, or null for unknown.');
    if (key === 'cct' && value !== null && (typeof value !== 'number' || !Number.isInteger(value / 100) || value < 1000 || value > 40000)) throw new Error('CCT must be 1000–40000 K in steps of 100, or null.');
    if (key === 'flickerScore' && value !== null && (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 3)) throw new Error('Flicker score must be an integer 0–3, or null.');
    if (['blueBlockerEnabled', 'todayActive'].includes(key) && value !== null && typeof value !== 'boolean') throw new Error(`Supply a boolean or null for ${key}.`);
    if (key === 'roomId' && value !== null && (typeof value !== 'string' || !value)) throw new Error('Choose an exact listed room ID or null.');
  }
}
const clock = (row: Record<string, unknown>, at: number) => Math.max(at, typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt + 1 : 0);
export interface LightEnvironmentEffects { unlinkedScreens: Array<{ id: string; device: string }>; preservedMeasurementCount: number; }
export function mutateLightEnvironment(data: ProfileData, resource: LightEnvironmentResource, id: string, operation: 'add' | 'update' | 'remove', patch: Record<string, unknown>, at: number, date: string, nativeDefaults = false) {
  const rows = lightEnvironmentRows(data, resource), before = rows.find(row => row.id === id) || null, original = structuredClone(before);
  if (operation === 'add' ? before !== null : before === null) throw new Error('This Light record changed. Read it again.');
  if (!data.lightEnvironment) data.lightEnvironment = { rooms: [], screens: [] };
  const path = `lightEnvironment.${lightEnvironmentField(resource)}`;
  const deletedAt = data._deletedAt?.[path]?.[id], restoredAt = data._deletedClearedAt?.[path]?.[id];
  if (operation !== 'remove' && (data._deleted?.[path]?.includes(id) || typeof deletedAt === 'number' && deletedAt > 0 && deletedAt > (typeof restoredAt === 'number' ? restoredAt : 0))) throw new Error('This Light identity was removed. Read the current records or add a new record.');
  const effects: LightEnvironmentEffects = { unlinkedScreens: [], preservedMeasurementCount: 0 };
  if (operation === 'remove') {
    deleteImportedArrayItems(data, path, row => (row as LightEnvironmentRow).id === id);
    if (resource === 'lightRooms') {
      for (const screen of lightEnvironmentRows(data, 'lightScreens')) if (screen.roomId === id) {
        effects.unlinkedScreens.push({ id: screen.id, device: typeof screen.device === 'string' ? screen.device : 'Unknown screen' }); screen.roomId = null; screen.updatedAt = clock(screen, at);
      }
      const measurements: unknown = data.lightMeasurements;
      if (measurements != null && !Array.isArray(measurements)) throw new Error('Review the room measurement history before removing this room.');
      for (const measurement of measurements || []) if (object(measurement) && measurement.roomId === id) {
        effects.preservedMeasurementCount++;
        if (!measurement.roomSnapshot) { measurement.roomSnapshot = { id, name: typeof before?.name === 'string' ? before.name : 'Deleted room' }; measurement.updatedAt = clock(measurement, at); }
      }
    }
    return { before: original, after: null, effects };
  }
  if (resource === 'lightScreens' && patch.roomId != null && !lightEnvironmentRows(data, 'lightRooms').some(row => row.id === patch.roomId)) throw new Error('That Light room is no longer available. Read the room list again.');
  const defaults = resource === 'lightRooms' ? { name: 'Room', primarySource: nativeDefaults && sources.includes(String(data.sunDefaults?.homeLight)) ? data.sunDefaults!.homeLight : 'unknown', daylightLevel: 'unknown', cct: null, flickerScore: null, hoursOccupiedPerDay: nativeDefaults ? defaultHoursForName(typeof patch.name === 'string' ? patch.name : '') : null, eveningHoursAfterSunset: null, notes: '' }
    : { device: 'phone', roomId: null, hoursPerDay: null, eveningUseAfterSunset: null, blueBlockerEnabled: nativeDefaults ? false : null, flickerScore: null };
  const { todayActive, ...fields } = patch;
  const after: LightEnvironmentRow = { ...(before || defaults), ...fields, id, updatedAt: clock(before || {}, at) };
  if (Object.hasOwn(patch, 'todayActive')) { if (todayActive === null) delete after.todayOverride; else after.todayOverride = { date, active: todayActive }; }
  if (resource === 'lightRooms') normalizeRoomEveningFields(after);
  if (operation === 'add') appendImportedArrayItem(data, path, after);
  else Object.assign(before!, after);
  if (todayActive === null && before) delete before.todayOverride;
  return { before: original, after, effects };
}
