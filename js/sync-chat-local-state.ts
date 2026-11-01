// Local chat freshness markers stay available before sync transport loads.
import { state } from './state.js';

const CHAT_LOCAL_LOCK_UNTIL_KEY = 'labcharts-chat-local-lock-until';
const CHAT_PERSONA_LOCAL_LOCK_UNTIL_KEY = 'labcharts-chat-persona-local-lock-until';
const CHAT_LOCAL_LOCK_MS = 90 * 1000;

export function markChatDataLocal() {
  try {
    sessionStorage.setItem(CHAT_LOCAL_LOCK_UNTIL_KEY, String(Date.now() + CHAT_LOCAL_LOCK_MS));
  } catch {}
}

export function markCustomPersonalityDataLocal() {
  // Item timestamps and tombstones protect local persona edits during pulls.
  try { sessionStorage.removeItem(CHAT_PERSONA_LOCAL_LOCK_UNTIL_KEY); } catch {}
}

function getLocalChatLockUntil(profileId: string | null | undefined) {
  if (profileId !== state.currentProfile) return 0;
  try {
    const until = Number(sessionStorage.getItem(CHAT_LOCAL_LOCK_UNTIL_KEY) || '0');
    return Number.isFinite(until) ? until : 0;
  } catch {
    return 0;
  }
}

export function getChatDataLocalLockRemainingMs(profileId: string | null | undefined) {
  if (profileId !== state.currentProfile) return 0;
  return Math.max(
    0,
    getLocalChatLockUntil(profileId) - Date.now(),
  );
}
