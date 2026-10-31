// Browser-wide, UI-only permission. A new epoch permanently expires older reviews.
import { runNativeCommandWithLocks } from './native-command-locks.js';
export const CHAT_CONTROLS_KEY = 'getbased-chat-controls';
export const CHAT_CONTROLS_NOTICE = 'Chat controls are off or this review has expired. Enable chat controls in Settings → AI and request a fresh review.';
export const CHAT_CONTROLS_OFF_INSTRUCTIONS = 'Chat controls are disabled in Settings → AI. Answer normally using the supplied context. Do not call getbased tools or propose app changes. Only if the user asks to change the app, explain that they can enable Chat controls in Settings → AI. You cannot enable it yourself.';
function stored(): string | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(CHAT_CONTROLS_KEY); }
  catch { return 'unavailable'; }
}
const enabled = (raw: string | null) => raw === null || /^1:[a-f0-9-]{36}$/.test(raw);
export const isChatControlEnabled = () => enabled(stored());
export function captureChatControlAuthorization(id?: unknown) {
  const raw = stored(), prefix = raw === null ? '' : `cc.${raw.slice(2)}.`;
  const admitted = enabled(raw) && (id === undefined || typeof id === 'string' && (!prefix || id.startsWith(prefix)));
  const current = () => admitted && stored() === raw;
  const assert = () => { if (!current()) throw Object.assign(new Error(CHAT_CONTROLS_NOTICE), { noChangeApplied: true }); };
  return { current, assert, createId: () => { assert(); return prefix + crypto.randomUUID(); } };
}
export async function setChatControlsEnabled(value: boolean, canCommit: () => boolean = () => true) {
  if (typeof value !== 'boolean') throw new Error('Choose an enabled or disabled chat control setting.');
  const write = () => {
    if (!canCommit()) return;
    const before = stored();
    if (before === 'unavailable') throw new Error('Chat control settings are unavailable.');
    if (enabled(before) === value) return;
    const next = `${value ? '1' : '0'}:${crypto.randomUUID()}`;
    try {
      localStorage.setItem(CHAT_CONTROLS_KEY, next);
      if (stored() !== next) throw new Error('Chat control settings were not saved.');
    } catch (error) {
      if (stored() === next) { if (before === null) localStorage.removeItem(CHAT_CONTROLS_KEY); else localStorage.setItem(CHAT_CONTROLS_KEY, before); }
      throw error;
    }
    try { globalThis.dispatchEvent?.(new Event('getbased:chat-controls-changed')); } catch { /* The setting is already saved. */ }
  };
  const locks = globalThis.navigator?.locks;
  if (locks) await runNativeCommandWithLocks(locks, ['getbased-chat-controls'], write);
  else write();
}
