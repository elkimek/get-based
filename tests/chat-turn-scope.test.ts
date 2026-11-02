import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ disclosure: 'accepted' }));
vi.mock('../js/lab-context-settings.js', () => ({ getContextDisclosureFingerprint: () => fixture.disclosure }));
import { state } from '../js/state.js';
import { captureChatTurnScope } from '../js/chat-turn-scope.js';
const original = { currentProfile: state.currentProfile, importedData: state.importedData, chatHistory: state.chatHistory, currentThreadId: state.currentThreadId };
beforeEach(() => { fixture.disclosure = 'accepted'; state.currentProfile = 'origin'; state.currentThreadId = 'thread'; state.importedData = structuredClone(original.importedData); state.chatHistory = []; });
afterEach(() => Object.assign(state, original));
it.each(['profile', 'root', 'history', 'thread', 'disclosure', 'adapter'] as const)('retires the accepted turn when its %s owner changes', key => {
  let adapter = true; const scope = captureChatTurnScope('origin', () => adapter); expect(scope.current()).toBe(true);
  if (key === 'profile') state.currentProfile = 'other';
  if (key === 'root') state.importedData = { ...state.importedData };
  if (key === 'history') state.chatHistory = [];
  if (key === 'thread') state.currentThreadId = 'other';
  if (key === 'disclosure') fixture.disclosure = 'changed';
  if (key === 'adapter') adapter = false;
  expect(scope.current()).toBe(false); expect(() => scope.assert()).toThrow('no longer current');
});
it('stops execution on cancellation without moving already-created review records to another owner', () => {
  const controller = new AbortController(), scope = captureChatTurnScope('origin'); controller.abort();
  expect(() => scope.assert(controller.signal)).toThrow(); expect(scope.current()).toBe(true);
});
