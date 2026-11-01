// Ordinary Light Environment editing shares staged commands with chat approval.
import type { LightItem, LightRoom, LightScreen } from './light-env-model.js';
import { state } from './state.js';
import { createUniqueId } from './unique-id.js';
import { lightEnvironmentRows, mutateLightEnvironment, sanitizeLightEnvironmentPatch } from './light-env-mutations.js';
import type { LightEnvironmentResource } from './light-env-mutations.js';
import { captureLightEnvironmentWrite, commitLightEnvironmentWrite, queueLightEnvironmentWrite } from './light-env-record-store.js';

type StoredEnvironment = { rooms?: LightRoom[] | null | undefined; screens?: LightScreen[] | null | undefined };
export function getEnvironment() {
  if (!state.importedData) return null;
  // Legacy evening values have pure read fallbacks. Native commands normalize
  // their staged copies; rendering must not initialize or rewrite the profile.
  return (state.importedData.lightEnvironment || { rooms: [], screens: [] }) as StoredEnvironment;
}
function todayKey(at = Date.now()) {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
async function change(resource: LightEnvironmentResource, id: unknown, operation: 'add' | 'update' | 'remove', patch: Record<string, unknown> = {}) {
  const profileId = state.currentProfile, observed = state.importedData;
  if (!profileId || !observed || typeof id !== 'string' || !id) return null;
  return queueLightEnvironmentWrite(profileId, async () => {
    const authorized = () => state.currentProfile === profileId && state.importedData === observed;
    if (!authorized()) return null;
    if (operation !== 'add' && !lightEnvironmentRows(observed, resource).some(row => row.id === id)) return null;
    const { base, source, next } = captureLightEnvironmentWrite(observed), at = Date.now();
    const normalized = sanitizeLightEnvironmentPatch(resource, patch, next);
    mutateLightEnvironment(next, resource, id, operation, normalized, at, todayKey(at), true);
    if (!(await commitLightEnvironmentWrite(profileId, observed, base, source, next, authorized)).saved) return null;
    return operation === 'remove' ? { id } : lightEnvironmentRows(observed, resource).find(row => row.id === id) || null;
  });
}
export async function addRoom(name?: string | null) {
  const id = createUniqueId('room_');
  return await change('lightRooms', id, 'add', { name }) ? id : null;
}
export async function updateRoom(id: unknown, patch: Record<string, unknown> = {}) {
  return await change('lightRooms', id, 'update', patch) as LightRoom | null;
}
export async function deleteRoom(id: unknown) { return !!await change('lightRooms', id, 'remove'); }
export async function addScreen(device: string, roomId: string | null = null) {
  const id = createUniqueId('scr_');
  return await change('lightScreens', id, 'add', { device, roomId }) ? id : null;
}
export function getScreensForRoom(roomId: unknown) {
  return (getEnvironment()?.screens || []).filter(screen => (screen.roomId || null) === (roomId || null));
}
export function isActiveToday(item?: LightItem | null) {
  if (!item) return false;
  const override = item.todayOverride;
  return !override || override.date !== todayKey() || override.active !== false;
}
export async function setTodayActive(kind: string, id: unknown, active: unknown) {
  return await change(kind === 'room' ? 'lightRooms' : 'lightScreens', id, 'update', { todayActive: !!active });
}
export async function updateScreen(id: unknown, patch: Record<string, unknown> = {}) {
  return await change('lightScreens', id, 'update', patch) as LightScreen | null;
}
export async function deleteScreen(id: unknown) { return !!await change('lightScreens', id, 'remove'); }
