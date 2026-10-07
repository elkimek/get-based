// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { readProfileForLoad } from '../js/profile-load-safety.js';
import { createDefaultProfileData } from '../js/profile.js';
import { rememberProfileData, rebaseLiveProfileData, adoptProfileData } from '../js/profile-data-writes.js';
import { debounceContextNotes, renderProfileContextCards } from '../js/context-cards.js';
import type { ProfileData } from '../types/app-state.js';
import type { ProfileSaveOptions } from '../js/data-core-types.js';
const mocks = vi.hoisted(() => ({ save: vi.fn(), legacy: vi.fn(), contextChanged: vi.fn() }));
vi.mock('../js/data.js', async load => ({ ...await load<Record<string, unknown>>(),
  saveImportedData: mocks.legacy,
  saveImportedDataForProfile: async (profile: string, draft: ProfileData, options: ProfileSaveOptions) => {
    const result = await mocks.save(profile, draft, options);
    if (result) {
      if (profile === state.currentProfile && options.baseData) {
        const rebased = rebaseLiveProfileData(options.baseData, state.importedData, draft);
        adoptProfileData(state.importedData, rebased.data); rememberProfileData(state.importedData, rebased.baseline);
      }
      rememberProfileData(draft);
    }
    return result;
  }, notifyProfileDataContextChanged: mocks.contextChanged,
}));
function render() {
  const host = document.createElement('div'); host.innerHTML = renderProfileContextCards(); document.body.append(host); return host;
}
function edit(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLTextAreaElement>('textarea')!; input.value = value;
  input.dispatchEvent(new InputEvent('input', { bubbles: true })); return input;
}
const status = (host: HTMLElement) => host.querySelector('.ctx-notes-status')!.textContent;
function deferred() { let resolve!: (value: boolean) => void; const promise = new Promise<boolean>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks(); mocks.save.mockResolvedValue(true); mocks.legacy.mockResolvedValue(true);
  state.currentProfile = 'notes-origin'; state.importedData = createDefaultProfileData(); rememberProfileData(state.importedData);
  document.body.replaceChildren();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.replaceChildren(); });
describe('context notes origin and persistence', () => {
  it('saves an accepted edit to its original profile after the view and active profile change', async () => {
    const original = render(); edit(original, 'Origin draft'); original.remove();
    state.currentProfile = 'notes-other'; state.importedData = createDefaultProfileData(); state.importedData.contextNotes = 'Other notes'; rememberProfileData(state.importedData);
    const other = render(); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save).toHaveBeenCalledWith('notes-origin', expect.objectContaining({ contextNotes: 'Origin draft' }), expect.objectContaining({ forceProfileScope: true }));
    expect(state.importedData.contextNotes).toBe('Other notes'); expect(status(other)).toBe('Saved as you type');
    expect(mocks.contextChanged).not.toHaveBeenCalled(); expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it('publishes Saved and history only after storage commits', async () => {
    const pending = deferred(); mocks.save.mockReturnValueOnce(pending.promise);
    const host = render(); edit(host, 'Awaiting commit'); await vi.advanceTimersByTimeAsync(500);
    expect(status(host)).toBe('Saving…'); expect(state.importedData.contextNotes).toBe(''); expect(state.importedData.changeHistory).toEqual([]);
    pending.resolve(true); await vi.advanceTimersByTimeAsync(0);
    expect(status(host)).toBe('Saved'); expect(state.importedData.contextNotes).toBe('Awaiting commit');
    expect(state.importedData.changeHistory).toEqual([expect.objectContaining({ field: 'contextNotes', snapshot: 'Awaiting commit' })]);
  });
  it('retains a failed draft across rerender and retries without a false success', async () => {
    mocks.save.mockResolvedValueOnce(false); const host = render(); edit(host, 'Retry <literal> & draft'); await vi.advanceTimersByTimeAsync(500);
    expect(status(host)).toContain('Not saved'); expect(state.importedData.contextNotes).toBe(''); expect(state.importedData.changeHistory).toEqual([]);
    host.remove(); const replacement = render(); expect(replacement.querySelector('textarea')!.value).toBe('Retry <literal> & draft'); expect(status(replacement)).toContain('Not saved');
    const retry = replacement.querySelector<HTMLButtonElement>('.ctx-notes-retry')!; expect(retry.hidden).toBe(false); retry.click(); await vi.advanceTimersByTimeAsync(500);
    expect(retry.hidden).toBe(true);
    expect(status(replacement)).toBe('Saved'); expect(state.importedData.contextNotes).toBe('Retry <literal> & draft'); expect(mocks.save).toHaveBeenCalledTimes(2);
  });
  it('uses the actual event textarea and synchronizes simultaneous catalogs', async () => {
    const first = render(), second = render(); edit(second, 'Second catalog');
    expect(first.querySelector('textarea')!.value).toBe('Second catalog'); expect(status(first)).toBe('Saving…');
    await vi.advanceTimersByTimeAsync(500);
    expect(state.importedData.contextNotes).toBe('Second catalog'); expect(status(first)).toBe('Saved'); expect(status(second)).toBe('Saved');
  });
  it('rejects detached or retired-profile controls before accepting a new draft', async () => {
    const original = render(); state.currentProfile = 'notes-other'; state.importedData = createDefaultProfileData(); rememberProfileData(state.importedData);
    edit(original, 'Stale control'); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.legacy).not.toHaveBeenCalled(); expect(state.importedData.contextNotes).toBe('');
  });
  it('orders edits during a pending write and advances the successful baseline', async () => {
    const pending = deferred(); mocks.save.mockReturnValueOnce(pending.promise); const host = render();
    edit(host, 'First accepted'); await vi.advanceTimersByTimeAsync(500); edit(host, 'Latest accepted'); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save).toHaveBeenCalledTimes(1); pending.resolve(true); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[1]![1].contextNotes).toBe('Latest accepted'); expect(mocks.save.mock.calls[1]![2].baseData.contextNotes).toBe('First accepted');
    expect(state.importedData.contextNotes).toBe('Latest accepted'); expect(status(host)).toBe('Saved');
  });
  it('preserves unrelated unsaved changes while writing only notes against the known baseline', async () => {
    const host = render(); state.importedData.interpretiveLens = 'Unrelated unsaved lens'; edit(host, 'Only notes'); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save.mock.calls[0]![1].interpretiveLens).toBe(''); expect(state.importedData.interpretiveLens).toBe('Unrelated unsaved lens');
  });
  it('does not revive old controls when returning to the same profile/data object', async () => {
    const originalData = state.importedData, original = render();
    state.currentProfile = 'notes-other'; state.importedData = createDefaultProfileData(); render();
    state.currentProfile = 'notes-origin'; state.importedData = originalData; const returning = render();
    edit(original, 'Retired original control'); await vi.advanceTimersByTimeAsync(500); expect(mocks.save).not.toHaveBeenCalled();
    edit(returning, 'Returning profile'); await vi.advanceTimersByTimeAsync(500); expect(state.importedData.contextNotes).toBe('Returning profile');
  });
  it('retires old tickets on a profile-switch event even when the same object is reused', async () => {
    const original = render(); globalThis.dispatchEvent(new CustomEvent('labcharts-profile-switched'));
    edit(original, 'Retired event control'); await vi.advanceTimersByTimeAsync(500); expect(mocks.save).not.toHaveBeenCalled();
    const current = render(); edit(current, 'Fresh view'); await vi.advanceTimersByTimeAsync(500); expect(state.importedData.contextNotes).toBe('Fresh view');
  });
  it('keeps an accepted draft and its scoped write after same-profile data replacement', async () => {
    const original = render(); edit(original, 'Original accepted draft'); state.importedData = createDefaultProfileData(); state.importedData.contextNotes = 'Reloaded data'; rememberProfileData(state.importedData);
    original.remove(); const replacement = render(); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save.mock.calls[0]![1].contextNotes).toBe('Original accepted draft'); expect(status(replacement)).toBe('Saved as you type');
    expect(replacement.querySelector('textarea')!.value).toBe('Reloaded data'); expect(mocks.contextChanged).not.toHaveBeenCalled();
  });
  it('retains retry text when the storage operation throws', async () => {
    mocks.save.mockRejectedValueOnce(new Error('storage unavailable')); const host = render(); edit(host, 'Failed draft'); await vi.advanceTimersByTimeAsync(500);
    expect(status(host)).toContain('Not saved'); expect(state.importedData.contextNotes).toBe('');
    edit(host, 'Retry succeeded'); await vi.advanceTimersByTimeAsync(500); expect(status(host)).toBe('Saved'); expect(state.importedData.contextNotes).toBe('Retry succeeded');
  });
  it('blocks writes after a failed profile read while retaining the draft', async () => {
    const host = render(); await expect(readProfileForLoad('notes-origin', () => { throw new Error('read failed'); }, () => {})).rejects.toThrow('read failed');
    try {
      edit(host, 'Retained blocked draft'); await vi.advanceTimersByTimeAsync(500);
      expect(mocks.save).not.toHaveBeenCalled(); expect(status(host)).toBe('Not saved — reload profile'); expect(state.importedData.contextNotes).toBe('');
      expect(host.querySelector<HTMLButtonElement>('.ctx-notes-retry')!.hidden).toBe(true);
    } finally { await readProfileForLoad('notes-origin', () => true, () => {}); }
    edit(host, 'Retained blocked draft'); await vi.advanceTimersByTimeAsync(500); expect(state.importedData.contextNotes).toBe('Retained blocked draft');
  });
  it('rechecks a failed read before dispatching an already accepted edit', async () => {
    const host = render(); edit(host, 'Accepted before failed read');
    await expect(readProfileForLoad('notes-origin', () => { throw new Error('later read failed'); }, () => {})).rejects.toThrow('later read failed');
    try {
      await vi.advanceTimersByTimeAsync(500); expect(mocks.save).not.toHaveBeenCalled(); expect(status(host)).toBe('Not saved — reload profile');
      expect(host.querySelector('textarea')!.value).toBe('Accepted before failed read');
    } finally { await readProfileForLoad('notes-origin', () => true, () => {}); }
  });
  it('advances queued originating-profile writes after switching away', async () => {
    const pending = deferred(); mocks.save.mockReturnValueOnce(pending.promise); const host = render();
    edit(host, 'Original first'); await vi.advanceTimersByTimeAsync(500); edit(host, 'Original second'); await vi.advanceTimersByTimeAsync(500);
    state.currentProfile = 'notes-other'; state.importedData = createDefaultProfileData(); rememberProfileData(state.importedData); const other = render(); host.remove();
    pending.resolve(true); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.save).toHaveBeenCalledTimes(2); expect(mocks.save.mock.calls[1]![0]).toBe('notes-origin');
    expect(mocks.save.mock.calls[1]![1].contextNotes).toBe('Original second'); expect(mocks.save.mock.calls[1]![2].baseData.contextNotes).toBe('Original first');
    expect(state.importedData.contextNotes).toBe(''); expect(status(other)).toBe('Saved as you type');
  });
  it('handles a profile with no known persisted baseline without inventing one', async () => {
    state.importedData = createDefaultProfileData(); const host = render(); edit(host, 'Initial notes'); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save.mock.calls[0]![2]).not.toHaveProperty('baseData'); expect(state.importedData.contextNotes).toBe('Initial notes'); expect(status(host)).toBe('Saved');
  });
  it('keeps the public no-argument helper and clearing notes functional', async () => {
    state.importedData.contextNotes = 'Before'; rememberProfileData(state.importedData); const host = render(); host.querySelector('textarea')!.value = ''; debounceContextNotes();
    await vi.advanceTimersByTimeAsync(500); expect(state.importedData.contextNotes).toBe(''); expect(status(host)).toBe('Saved');
  });
});
