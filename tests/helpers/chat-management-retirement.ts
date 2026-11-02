import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../../js/state.js';
import { createAppControlSession } from '../../js/app-control-session.js';
import { executeAppControl } from '../../js/app-control-commands.js';
import { createAgentToolRuntime } from '../../js/agent-tool-runtime.js';
import { normalizeAppControls, assistantConnectionId, type AppControlRecord } from '../../shared/agent-control-contract.js';
import { renderHTML } from '../../js/components/ChatMessageActions.svelte.html.js';
import { chatReviewLifecycle } from '../../shared/chat-review-contract.js';
import { setChatControlsEnabled } from '../../js/chat-control-settings.js';

export function defineRetiredManagement(action: 'display.preferences' | 'assistant.selection' | 'assistant.connection' | 'profile.selection' | 'labs.overlays') {
  describe(`${action} remains native-only`, () => {
    let previous: { profile: string; thread: typeof state.currentThreadId; data: typeof state.importedData; history: typeof state.chatHistory };
    let permission: string | null;
    const selection = { backend: 'direct' as const, provider: 'custom', target: '', model: 'model-a', effort: '' };
    const proposed = { ...selection, model: 'model-b' };
    const footprint = () => Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]);
    function record(status: string): AppControlRecord {
      const fields = {
        'display.preferences': { parameters: { unitSystem: 'US' }, baseline: { unitSystem: 'EU' } },
        'assistant.selection': { parameters: { model: 'model-b' }, baseline: selection, proposed },
        'assistant.connection': { parameters: { connectionId: assistantConnectionId(proposed), model: 'model-b' }, baseline: selection, proposed },
        'profile.selection': { parameters: { profileId: 'target' }, baseline: { id: 'origin', name: 'Origin' }, proposed: { id: 'target', name: 'Target' } },
        'labs.overlays': { parameters: { notes: true, supplements: true, cycle: true }, baseline: { notes: false, supplements: false, cycle: false } },
      }[action];
      return { version: 1, id: 'historical-control', profileId: 'origin', threadId: 'origin-thread', leaseId: 'historical-lease', reason: 'Previously requested', evidence: 'My previous request', action, status, undoAvailable: true, ...fields } as AppControlRecord;
    }
    beforeEach(() => {
      previous = { profile: state.currentProfile, thread: state.currentThreadId, data: state.importedData, history: state.chatHistory };
      permission = localStorage.getItem('getbased-chat-controls'); localStorage.removeItem('getbased-chat-controls');
      state.currentProfile = 'origin'; state.currentThreadId = 'origin-thread'; state.chatHistory = [];
      state.importedData = { ...structuredClone(previous.data), contextNotes: 'Keep health data', healthGoals: [{ text: 'Keep existing goal', severity: 'minor' }] };
    });
    afterEach(() => {
      Object.assign(state, { currentProfile: previous.profile, currentThreadId: previous.thread, importedData: previous.data, chatHistory: previous.history });
      if (permission === null) localStorage.removeItem('getbased-chat-controls'); else localStorage.setItem('getbased-chat-controls', permission);
    });
    it('creates no snapshot or proposal and invokes no injected native handler', async () => {
      const native = vi.fn(), before = footprint(), health = structuredClone(state.importedData);
      const session = createAppControlSession('My previous request', () => true, new AbortController().signal);
      const runtime = createAgentToolRuntime({ readContext: () => 'Permitted health context', listAppActions: native, readAppState: native, prepareAppControl: native });
      for (const tool of ['getbased_app_actions','getbased_read_app','getbased_request_app']) {
        expect(runtime.tools.some(spec => spec.name === tool)).toBe(false);
        expect((await runtime.execute({ tool, arguments: { action, snapshotId: 'historical', parameters: '{}', evidence: 'My previous request', reason: 'Requested' } })).success).toBe(false);
      }
      expect(() => session.tools.readAppState({ action })).toThrow('native settings');
      expect(() => session.tools.prepareAppControl({ action, snapshotId: 'historical', parameters: '{}', reason: 'Requested', evidence: 'My previous request' })).toThrow('native settings');
      expect(session.tools.listAppActions().actions).toEqual([]); expect(session.finish()).toEqual([]);
      expect(runtime.getDrafts()).toEqual([]); expect(runtime.getOutcome().reviews).toEqual([]); expect(native).not.toHaveBeenCalled();
      expect(state.importedData).toEqual(health); expect(footprint()).toEqual(before);
    });
    it.each(['pending','applying','changed','undone','discarded','expired','conflict','unknown'])('cannot execute or grant Undo from a stored %s label', async status => {
      const old = record(status), before = footprint(), health = structuredClone(state.importedData), allowed = vi.fn(() => true);
      const normalized = normalizeAppControls([old], true); expect(normalized).toHaveLength(1);
      expect(normalized[0]!.undoAvailable).not.toBe(true); expect(normalized[0]!.status).not.toBe('pending'); expect(normalized[0]!.status).not.toBe('applying');
      const html = renderHTML({ view: { index: 0, kind: 'assistant', retry: null, resume: false, speech: false, context: [], reviews: normalized.map(control => ({ kind: 'app', control, lifecycle: chatReviewLifecycle(control.status, true) })) } });
      expect(html).toContain('Previous app-management request'); expect(html).not.toMatch(/(?:apply|undo|discard)-app-control/);
      for (const undo of [false,true]) await expect(executeAppControl(old, undo, allowed)).rejects.toThrow('native settings');
      expect(allowed).not.toHaveBeenCalled(); expect(state.currentProfile).toBe('origin'); expect(state.currentThreadId).toBe('origin-thread');
      expect(state.importedData).toEqual(health); expect(footprint()).toEqual(before);
    });
    it('does not restore management authority after off/on or a fresh native-looking lease', async () => {
      await setChatControlsEnabled(false); await setChatControlsEnabled(true);
      const before = footprint(), health = structuredClone(state.importedData), old = { ...record('pending'), leaseId: crypto.randomUUID() };
      for (const undo of [false,true]) await expect(executeAppControl(old, undo, () => true)).rejects.toThrow('native settings');
      expect(state.importedData).toEqual(health); expect(footprint()).toEqual(before);
    });
  });
}
