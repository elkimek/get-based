// light-env-evening.js — canonical evening-hours helpers for Light Environment rooms.
//
// Rooms now store after-sunset exposure as numeric `eveningHoursAfterSunset`.
// Older rows used boolean `eveningUseAfterSunset`; keep read compatibility
// here so UI, AI prompts, and sync pulls do not each invent their own fallback.

export const LEGACY_ROOM_EVENING_HOURS = 2;

export function normalizeEveningHours(value) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(24, n));
}

export function getRoomEveningHoursAfterSunset(room) {
  if (!room) return 0;
  if (room.eveningHoursAfterSunset != null && room.eveningHoursAfterSunset !== '') {
    return normalizeEveningHours(room.eveningHoursAfterSunset);
  }
  const legacy = room.eveningUseAfterSunset;
  if (legacy === true) return LEGACY_ROOM_EVENING_HOURS;
  if (legacy === false || legacy == null || legacy === '') return 0;
  return normalizeEveningHours(legacy);
}

export function hasRoomEveningAnswer(room) {
  if (!room) return false;
  return room.eveningHoursAfterSunset != null || room.eveningUseAfterSunset != null;
}

export function roomUsesEveningAfterSunset(room) {
  return getRoomEveningHoursAfterSunset(room) > 0;
}

export function normalizeRoomEveningFields(room) {
  if (!room || typeof room !== 'object') return false;
  let changed = false;
  if (room.eveningHoursAfterSunset != null) {
    const normalized = normalizeEveningHours(room.eveningHoursAfterSunset);
    if (room.eveningHoursAfterSunset !== normalized) {
      room.eveningHoursAfterSunset = normalized;
      changed = true;
    }
  } else if (room.eveningUseAfterSunset != null) {
    room.eveningHoursAfterSunset = getRoomEveningHoursAfterSunset(room);
    changed = true;
  }
  if ('eveningUseAfterSunset' in room) {
    delete room.eveningUseAfterSunset;
    changed = true;
  }
  return changed;
}

export function normalizeLightEnvironmentEveningFields(lightEnvironment) {
  if (!lightEnvironment || !Array.isArray(lightEnvironment.rooms)) return false;
  let changed = false;
  for (const room of lightEnvironment.rooms) {
    if (normalizeRoomEveningFields(room)) changed = true;
  }
  return changed;
}

export function normalizeRoomEveningPatch(patch = {}) {
  if (!patch || typeof patch !== 'object') return patch;
  const next = { ...patch };
  if ('eveningUseAfterSunset' in next && !('eveningHoursAfterSunset' in next)) {
    next.eveningHoursAfterSunset = getRoomEveningHoursAfterSunset(next);
  }
  if ('eveningHoursAfterSunset' in next) {
    next.eveningHoursAfterSunset = normalizeEveningHours(next.eveningHoursAfterSunset);
  }
  delete next.eveningUseAfterSunset;
  return next;
}
