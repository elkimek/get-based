// Native browser preferences shared by Settings, chat chrome and reviewed tools.
import { getAIProvider, isAIPaused, setAIPaused, supportsWebSearch } from './api.js';
import { getChatBackend } from './agent-chat-settings.js';
import { refreshChatWebSearchToggleRuntime, updateChatHeaderModelRuntime, isChatRuntimeStreaming } from './chat-runtime.js';
import { state } from './state.js';
import { parseAssistantPreferencePatch, type AssistantPreferencePatch } from '../shared/agent-control-contract.js';
import { runNativeCommandWithLocks } from './native-command-locks.js';

export class AssistantPreferenceConflict extends Error { readonly noChangeApplied = true; }
export function readAssistantPreferences() { return { paused: isAIPaused(), webSearch: localStorage.getItem('labcharts-chat-websearch') === 'on' }; }
export function assistantWebSearchAvailable() {
  try { return getChatBackend() !== 'codex' && supportsWebSearch(getAIProvider()) === true; } catch { return false; }
}
export interface AssistantPreferenceOptions { expected?: AssistantPreferencePatch; canCommit?: () => boolean; requireLocks?: boolean; idle?: boolean }
export function validateAssistantPreferences(value: unknown): AssistantPreferencePatch {
  const patch = parseAssistantPreferencePatch(value);
  if (!patch) throw new AssistantPreferenceConflict('Use only paused and/or webSearch with true or false.');
  if (patch.webSearch === true && !assistantWebSearchAvailable()) throw new AssistantPreferenceConflict('The selected connection does not support the app’s web-search toggle. CLI search remains controlled by its agent.');
  return patch;
}
export async function commitAssistantPreferences(value: unknown, options: AssistantPreferenceOptions = {}) {
  validateAssistantPreferences(value);
  const profile = state.currentProfile, thread = state.currentThreadId, root = state.importedData;
  const current = () => state.currentProfile === profile && state.currentThreadId === thread && state.importedData === root && options.canCommit?.() !== false && (!options.idle || !isChatRuntimeStreaming());
  const write = () => {
    if (!current()) throw new AssistantPreferenceConflict('The originating view changed or a reply is active. No preference was changed.');
    const patch = validateAssistantPreferences(value), before = readAssistantPreferences();
    const expected = options.expected === undefined ? null : parseAssistantPreferencePatch(options.expected);
    if (options.expected !== undefined && !expected || expected && Object.entries(expected).some(([field, entry]) => before[field as keyof typeof before] !== entry)) throw new AssistantPreferenceConflict('These preferences changed. Read a fresh snapshot before applying or undoing them.');
    const after = { ...before, ...patch }, changed = (Object.keys(patch) as Array<keyof AssistantPreferencePatch>).filter(field => before[field] !== after[field]);
    const keys = { paused: 'labcharts-ai-paused', webSearch: 'labcharts-chat-websearch' };
    const saved = new Map(changed.map(field => [keys[field], localStorage.getItem(keys[field])]));
    try {
      if (changed.includes('paused')) setAIPaused(after.paused);
      if (changed.includes('webSearch')) localStorage.setItem(keys.webSearch, after.webSearch ? 'on' : 'off');
    } catch (cause) {
      try { for (const [key, prior] of saved) { if (prior === null) localStorage.removeItem(key); else localStorage.setItem(key, prior); } }
      catch { throw new Error('The preference outcome could not be fully confirmed. Check native AI settings and chat controls.', { cause }); }
      throw Object.assign(new Error('The assistant preferences could not be saved. Nothing was changed.', { cause }), { noChangeApplied: true });
    }
    // Publishing and repainting happen only after both durable writes succeed.
    try { globalThis.dispatchEvent?.(new CustomEvent('getbased:assistant-preferences-changed')); refreshChatWebSearchToggleRuntime(); updateChatHeaderModelRuntime(); } catch { /* Saved preferences remain authoritative. */ }
    return { before, after, changed, scope: 'this browser', webSearchAvailable: assistantWebSearchAvailable() };
  };
  if (!navigator.locks?.request) { if (options.requireLocks) throw new AssistantPreferenceConflict('Use native AI settings in this browser. Safe chat preference changes require Web Locks.'); return write(); }
  return runNativeCommandWithLocks(navigator.locks, ['getbased-assistant-preferences'], write);
}
