// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { executeAppControl } from '../js/app-control-commands.js';
import { normalizeAppControls, type AppControlRecord } from '../shared/agent-control-contract.js';
import { state } from '../js/state.js';
const original = { profile: state.currentProfile, thread: state.currentThreadId, root: state.importedData };
beforeEach(() => { localStorage.clear(); state.currentProfile = 'retired-preference'; state.currentThreadId = 'origin'; state.importedData = structuredClone(original.root); localStorage.setItem('labcharts-ai-paused', 'false'); });
afterEach(() => { Object.assign(state, { currentProfile: original.profile, currentThreadId: original.thread, importedData: original.root }); localStorage.clear(); });
it.each(['pending', 'applying', 'changed', 'undone', 'failed', 'conflict', 'discarded', 'expired'] as const)('makes historical %s AI preference controls inert, including forged Undo authority', async status => {
  const record: AppControlRecord = { version: 1, id: 'retired', action: 'assistant.preferences', profileId: state.currentProfile, threadId: state.currentThreadId!, parameters: { paused: true }, baseline: { paused: false }, reason: 'Old pause request', evidence: 'Pause AI.', status, undoAvailable: true };
  const restored = normalizeAppControls([record], true)[0]!; expect(restored.undoAvailable).toBe(false); expect(restored.status).not.toBe('pending'); expect(restored.status).not.toBe('applying');
  const data = JSON.stringify(state.importedData), before = JSON.stringify(localStorage);
  for (const undo of [false, true]) await expect(executeAppControl(record, undo, () => true)).rejects.toThrow('native settings');
  expect(JSON.stringify(state.importedData)).toBe(data); expect(JSON.stringify(localStorage)).toBe(before);
});
