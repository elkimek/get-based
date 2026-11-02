import { state } from './state.js';
import { getContextDisclosureFingerprint } from './lab-context-settings.js';

/** One accepted conversation owner; cancellation stops execution, not ownership. */
export function captureChatTurnScope(profileId: string, adapterCurrent: () => boolean = () => true) {
  const root = state.importedData, history = state.chatHistory, thread = state.currentThreadId, disclosure = getContextDisclosureFingerprint();
  const current = () => state.currentProfile === profileId && state.importedData === root && state.chatHistory === history
    && state.currentThreadId === thread && getContextDisclosureFingerprint() === disclosure && adapterCurrent();
  return { history, current, assert(signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!current()) throw new DOMException('The chat request is no longer current.', 'AbortError');
  } };
}
