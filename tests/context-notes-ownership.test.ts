// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { readProfileForLoad } from '../js/profile-load-safety.js';
import { createDefaultProfileData } from '../js/profile.js';
import { rememberProfileData, rebaseLiveProfileData, adoptProfileData } from '../js/profile-data-writes.js';
import { debounceContextNotes, renderProfileContextCards } from '../js/context-cards.js';
import type { ProfileData } from '../types/app-state.js';
import type { ProfileSaveOptions } from '../js/data-core-types.js';
let profileSequence = 0;
let originProfile = '', otherProfile = '';
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
  originProfile = `notes-origin-${++profileSequence}`; otherProfile = `notes-other-${profileSequence}`;
  state.currentProfile = originProfile; state.importedData = createDefaultProfileData(); rememberProfileData(state.importedData);
  document.body.replaceChildren();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.replaceChildren(); });
describe('context notes origin and persistence', () => {
  it('saves an accepted edit to its original profile after the view and active profile change', async () => {
    const original = render(); edit(original, 'Origin draft'); original.remove();
    state.currentProfile = otherProfile; state.importedData = createDefaultProfileData(); state.importedData.contextNotes = 'Other notes'; rememberProfileData(state.importedData);
    const other = render(); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save).toHaveBeenCalledWith(originProfile, expect.objectContaining({ contextNotes: 'Origin draft' }), expect.objectContaining({ forceProfileScope: true }));
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
    const original = render(); state.currentProfile = otherProfile; state.importedData = createDefaultProfileData(); rememberProfileData(state.importedData);
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
    state.currentProfile = otherProfile; state.importedData = createDefaultProfileData(); render();
    state.currentProfile = originProfile; state.importedData = originalData; const returning = render();
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
    original.remove(); const replacement = render(); expect(replacement.querySelector('textarea')!.value).toBe('Original accepted draft');
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save.mock.calls[0]![1].contextNotes).toBe('Original accepted draft'); expect(status(replacement)).toBe('Saved');
    expect(replacement.querySelector('textarea')!.value).toBe('Original accepted draft'); expect(mocks.contextChanged).toHaveBeenCalledWith(originProfile);
  });
  it('retains retry text when the storage operation throws', async () => {
    mocks.save.mockRejectedValueOnce(new Error('storage unavailable')); const host = render(); edit(host, 'Failed draft'); await vi.advanceTimersByTimeAsync(500);
    expect(status(host)).toContain('Not saved'); expect(state.importedData.contextNotes).toBe('');
    edit(host, 'Retry succeeded'); await vi.advanceTimersByTimeAsync(500); expect(status(host)).toBe('Saved'); expect(state.importedData.contextNotes).toBe('Retry succeeded');
  });
  it('blocks writes after a failed profile read while retaining the draft', async () => {
    const host = render(); await expect(readProfileForLoad(originProfile, () => { throw new Error('read failed'); }, () => {})).rejects.toThrow('read failed');
    try {
      edit(host, 'Retained blocked draft'); await vi.advanceTimersByTimeAsync(500);
      expect(mocks.save).not.toHaveBeenCalled(); expect(status(host)).toBe('Not saved — reload profile'); expect(state.importedData.contextNotes).toBe('');
      expect(host.querySelector<HTMLButtonElement>('.ctx-notes-retry')!.hidden).toBe(true);
    } finally { await readProfileForLoad(originProfile, () => true, () => {}); }
    edit(host, 'Retained blocked draft'); await vi.advanceTimersByTimeAsync(500); expect(state.importedData.contextNotes).toBe('Retained blocked draft');
  });
  it('rechecks a failed read before dispatching an already accepted edit', async () => {
    const host = render(); edit(host, 'Accepted before failed read');
    await expect(readProfileForLoad(originProfile, () => { throw new Error('later read failed'); }, () => {})).rejects.toThrow('later read failed');
    try {
      await vi.advanceTimersByTimeAsync(500); expect(mocks.save).not.toHaveBeenCalled(); expect(status(host)).toBe('Not saved — reload profile');
      expect(host.querySelector('textarea')!.value).toBe('Accepted before failed read');
    } finally { await readProfileForLoad(originProfile, () => true, () => {}); }
  });
  it('advances queued originating-profile writes after switching away', async () => {
    const pending = deferred(); mocks.save.mockReturnValueOnce(pending.promise); const host = render();
    edit(host, 'Original first'); await vi.advanceTimersByTimeAsync(500); edit(host, 'Original second'); await vi.advanceTimersByTimeAsync(500);
    state.currentProfile = otherProfile; state.importedData = createDefaultProfileData(); rememberProfileData(state.importedData); const other = render(); host.remove();
    pending.resolve(true); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.save).toHaveBeenCalledTimes(2); expect(mocks.save.mock.calls[1]![0]).toBe(originProfile);
    expect(mocks.save.mock.calls[1]![1].contextNotes).toBe('Original second'); expect(mocks.save.mock.calls[1]![2].baseData.contextNotes).toBe('Original first');
    expect(state.importedData.contextNotes).toBe(''); expect(status(other)).toBe('Saved as you type');
  });
  it('recovers a failed draft after a fresh profile load and retries against the reloaded baseline', async () => {
    mocks.save.mockResolvedValueOnce(false); const original = render(); edit(original, 'Recovered <draft>'); await vi.advanceTimersByTimeAsync(500);
    original.remove(); state.currentProfile = otherProfile; state.importedData = createDefaultProfileData(); render();
    state.currentProfile = originProfile; state.importedData = createDefaultProfileData(); rememberProfileData(state.importedData); const reloaded = render();
    expect(reloaded.querySelector('textarea')!.value).toBe('Recovered <draft>'); expect(status(reloaded)).toContain('Not saved');
    reloaded.querySelector<HTMLButtonElement>('.ctx-notes-retry')!.click(); await vi.advanceTimersByTimeAsync(500);
    expect(state.importedData.contextNotes).toBe('Recovered <draft>'); expect(status(reloaded)).toBe('Saved');
  });
  it('shows the newer saved note beside a recovered draft and allows keeping the saved value', async () => {
    mocks.save.mockResolvedValueOnce(false); const original = render(); edit(original, 'Unsaved original'); await vi.advanceTimersByTimeAsync(500); original.remove();
    state.importedData = createDefaultProfileData(); state.importedData.contextNotes = 'Newer <saved> notes'; rememberProfileData(state.importedData); const reloaded = render();
    expect(reloaded.querySelector('textarea')!.value).toBe('Unsaved original');
    expect(reloaded.querySelector('.ctx-notes-conflict-saved')?.textContent).toBe('Newer <saved> notes');
    reloaded.querySelector<HTMLButtonElement>('.ctx-notes-use-saved')!.click();
    expect(reloaded.querySelector('textarea')!.value).toBe('Newer <saved> notes'); expect(state.importedData.contextNotes).toBe('Newer <saved> notes'); expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it('retains a pending draft across reload and only then publishes the confirmed result', async () => {
    const pending = deferred(); mocks.save.mockReturnValueOnce(pending.promise); const original = render(); edit(original, 'Pending recovery'); await vi.advanceTimersByTimeAsync(500); original.remove();
    state.importedData = createDefaultProfileData(); rememberProfileData(state.importedData); const reloaded = render();
    expect(reloaded.querySelector('textarea')!.value).toBe('Pending recovery'); expect(status(reloaded)).toBe('Saving…');
    pending.resolve(true); await vi.advanceTimersByTimeAsync(0); expect(status(reloaded)).toBe('Saved'); expect(state.importedData.contextNotes).toBe('Pending recovery');
  });
  it('presents an atomic conflict without reloading and uses its observed text for an explicit retry', async () => {
    mocks.save.mockImplementationOnce((_profile, _draft, options: ProfileSaveOptions) => { options.onContextNotesConflict?.('Saved elsewhere <literal>'); return false; });
    const host = render(); edit(host, 'Local pending draft'); await vi.advanceTimersByTimeAsync(500);
    expect(host.querySelector('.ctx-notes-conflict-saved')!.textContent).toBe('Saved elsewhere <literal>');
    expect(host.querySelector<HTMLButtonElement>('.ctx-notes-retry')!.textContent).toBe('Save draft instead');
    host.querySelector<HTMLButtonElement>('.ctx-notes-retry')!.click(); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save.mock.calls[1]![2].expectedContextNotes).toBe('Saved elsewhere <literal>'); expect(status(host)).toBe('Saved');
  });
  it('retains the original baseline through Sync between inputs until an explicit replacement commits', async () => {
    state.importedData.contextNotes = 'Original saved'; rememberProfileData(state.importedData);
    let stored = 'Original saved';
    mocks.save.mockImplementation((_profile: string, draft: ProfileData, options: ProfileSaveOptions) => {
      if (options.expectedContextNotes !== stored) { options.onContextNotesConflict?.(stored); return false; }
      stored = draft.contextNotes; return true;
    });
    const host = render(); edit(host, 'Local first input'); await vi.advanceTimersByTimeAsync(200);
    stored = 'Peer saved during draft'; state.importedData.contextNotes = stored;
    state.importedData.notes.push({ date: '2026-10-18', text: 'Independent synced record' }); rememberProfileData(state.importedData);
    const peer = structuredClone(state.importedData);
    edit(host, 'Local second input'); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0]![2].expectedContextNotes).toBe('Original saved');
    expect(stored).toBe('Peer saved during draft'); expect(state.importedData).toEqual(peer);
    expect(host.querySelector('textarea')!.value).toBe('Local second input'); expect(status(host)).toBe('Not saved — try again');
    expect(host.querySelector('.ctx-notes-conflict-saved')!.textContent).toBe('Peer saved during draft');
    edit(host, 'Local third input'); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save.mock.calls[1]![2].expectedContextNotes).toBe('Original saved');
    expect(stored).toBe('Peer saved during draft'); expect(state.importedData).toEqual(peer);
    const replace = host.querySelector<HTMLButtonElement>('.ctx-notes-retry')!;
    expect(replace.textContent).toBe('Save draft instead'); replace.click(); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save.mock.calls[2]![2].expectedContextNotes).toBe('Peer saved during draft');
    expect(stored).toBe('Local third input'); expect(status(host)).toBe('Saved');
    expect(state.importedData.notes).toEqual(peer.notes);
    edit(host, 'Normal subsequent edit'); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save.mock.calls[3]![2].expectedContextNotes).toBe('Local third input');
    expect(stored).toBe('Normal subsequent edit'); expect(status(host)).toBe('Saved');
  });
  it.each(['mounted', 'unhydrated'] as const)('a %s generic Retry cannot accept a peer saved after an I/O failure', async kind => {
    state.importedData.contextNotes = 'Original saved'; rememberProfileData(state.importedData);
    let stored = 'Original saved';
    mocks.save.mockResolvedValueOnce(false).mockImplementation((_profile: string, draft: ProfileData, options: ProfileSaveOptions) => {
      if (options.expectedContextNotes !== stored) { options.onContextNotesConflict?.(stored); return false; }
      stored = draft.contextNotes; return true;
    });
    let host = render(); edit(host, 'Retained local draft'); await vi.advanceTimersByTimeAsync(500);
    if (kind === 'unhydrated') { host.remove(); host = render(); }
    const retry = host.querySelector<HTMLButtonElement>('.ctx-notes-retry')!;
    expect(retry.textContent).toBe('Retry save'); expect(retry.hasAttribute('data-context-notes-reviewed-saved')).toBe(false);
    stored = 'Unseen peer after failure'; state.importedData.contextNotes = stored; rememberProfileData(state.importedData);
    const peer = structuredClone(state.importedData);
    retry.click(); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save.mock.calls[1]![2].expectedContextNotes).toBe('Original saved');
    expect(stored).toBe('Unseen peer after failure'); expect(state.importedData).toEqual(peer);
    expect(host.querySelector('textarea')!.value).toBe('Retained local draft'); expect(status(host)).toBe('Not saved — try again');
    expect(host.querySelector('.ctx-notes-conflict-saved')!.textContent).toBe('Unseen peer after failure');
  });
  it.each(['mounted', 'unhydrated'] as const)('a %s explicit replacement accepts only the displayed peer value', async kind => {
    state.importedData.contextNotes = 'Original saved'; rememberProfileData(state.importedData);
    let stored = 'Displayed first peer';
    mocks.save.mockImplementation((_profile: string, draft: ProfileData, options: ProfileSaveOptions) => {
      if (options.expectedContextNotes !== stored) { options.onContextNotesConflict?.(stored); return false; }
      stored = draft.contextNotes; return true;
    });
    let host = render(); edit(host, 'Retained local draft'); await vi.advanceTimersByTimeAsync(500);
    if (kind === 'unhydrated') { host.remove(); host = render(); }
    const replace = host.querySelector<HTMLButtonElement>('.ctx-notes-retry')!;
    expect(replace.textContent).toBe('Save draft instead'); expect(replace.getAttribute('data-context-notes-reviewed-saved')).toBe('Displayed first peer');
    stored = 'Unseen second peer'; state.importedData.contextNotes = stored; rememberProfileData(state.importedData);
    const peer = structuredClone(state.importedData);
    replace.click(); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save.mock.calls[1]![2].expectedContextNotes).toBe('Displayed first peer');
    expect(stored).toBe('Unseen second peer'); expect(state.importedData).toEqual(peer);
    expect(host.querySelector('textarea')!.value).toBe('Retained local draft'); expect(status(host)).toBe('Not saved — try again');
    expect(host.querySelector('.ctx-notes-conflict-saved')!.textContent).toBe('Unseen second peer');
    host.querySelector<HTMLButtonElement>('.ctx-notes-retry')!.click(); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save.mock.calls[2]![2].expectedContextNotes).toBe('Unseen second peer');
    expect(stored).toBe('Retained local draft'); expect(status(host)).toBe('Saved');
  });
  it('can explicitly replace a displayed empty saved value without treating it as an absent review', async () => {
    state.importedData.contextNotes = 'Original saved'; rememberProfileData(state.importedData);
    let stored = '';
    mocks.save.mockImplementation((_profile: string, draft: ProfileData, options: ProfileSaveOptions) => {
      if (options.expectedContextNotes !== stored) { options.onContextNotesConflict?.(stored); return false; }
      stored = draft.contextNotes; return true;
    });
    const host = render(); edit(host, 'Explicit replacement'); await vi.advanceTimersByTimeAsync(500);
    const replace = host.querySelector<HTMLButtonElement>('.ctx-notes-retry')!;
    expect(replace.textContent).toBe('Save draft instead'); expect(replace.getAttribute('data-context-notes-reviewed-saved')).toBe('');
    expect(host.querySelector('.ctx-notes-conflict-saved')!.textContent).toBe('Saved notes are empty.');
    replace.click(); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.save.mock.calls[1]![2].expectedContextNotes).toBe('');
    expect(stored).toBe('Explicit replacement'); expect(status(host)).toBe('Saved');
  });
  it('uses an observed saved value without a write while preserving unrelated unsaved data', async () => {
    mocks.save.mockImplementationOnce((_profile, _draft, options: ProfileSaveOptions) => { options.onContextNotesConflict?.('Observed saved note'); return false; });
    const host = render(); state.importedData.interpretiveLens = 'Unsaved lens'; edit(host, 'Discarded draft'); await vi.advanceTimersByTimeAsync(500);
    host.querySelector<HTMLButtonElement>('.ctx-notes-use-saved')!.click();
    expect(state.importedData.contextNotes).toBe('Observed saved note'); expect(state.importedData.interpretiveLens).toBe('Unsaved lens'); expect(mocks.save).toHaveBeenCalledTimes(1);
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
