import { describe, expect, it, vi } from 'vitest';
import { createChatProfileOnboardingController } from '../js/chat-profile-onboarding-controller.js';
import type { ChatProfileDraft, ChatProfileOrigin, ChatProfileSavePorts } from '../js/chat-profile-onboarding-contract.js';
import { createDefaultProfileData } from '../js/profile.js';

function fixture() {
  let current = true;
  const draft: ChatProfileDraft = { name: 'Ada', sex: 'female', dob: '1990-01-02', height: '70', heightUnit: 'in', weight: '150', weightUnit: 'lbs', country: 'Germany' };
  const view = { readDraft: () => draft, setPending: vi.fn(), setError: vi.fn(), setSex: vi.fn(), setLatitude: vi.fn(), setContinueEnabled: vi.fn(), setHeight: vi.fn() };
  const data = createDefaultProfileData();
  data.biometrics = { weight: [{ date: '2026-10-07', value: 60, unit: 'kg', source: 'manual' }], bp: [], pulse: [] };
  const ports: ChatProfileSavePorts = { rename: vi.fn(async () => true), dob: vi.fn(async () => true), sex: vi.fn(async () => true), height: vi.fn(async () => true), location: vi.fn(async () => true), data: vi.fn(async () => true), weight: vi.fn(async () => true), latitude: vi.fn(() => '✓ 52°N'), publishDob: vi.fn(), publishSex: vi.fn(), saved: vi.fn(), today: () => '2026-10-07' };
  const origin: ChatProfileOrigin = { profileId: 'original', data, view, current: () => current };
  return { draft, data, ports, view, origin, retire: () => { current = false; }, controller: createChatProfileOnboardingController(ports) };
}
function deferred() { let resolve!: (result: boolean) => void; const promise = new Promise<boolean>(done => { resolve = done; }); return { promise, resolve }; }

describe('profile onboarding save ownership', () => {
  it('captures form fields before its first write and upserts only the current day', async () => {
    const f = fixture(), waiting = deferred(); vi.mocked(f.ports.rename).mockReturnValueOnce(waiting.promise);
    f.data.biometrics!.weight!.unshift({ date: '2026-10-06', value: 61, unit: 'kg', source: 'manual' });
    const save = f.controller.saveProfile(f.origin, f.draft, true);
    await Promise.resolve(); Object.assign(f.draft, { name: 'Replacement', dob: '2000-01-01', height: '200', weight: '300', country: 'France' });
    waiting.resolve(true); expect(await save).toBe(true);
    expect(f.ports.rename).toHaveBeenCalledWith('original', 'Ada');
    expect(f.ports.dob).toHaveBeenCalledWith('original', '1990-01-02');
    expect(f.ports.height).toHaveBeenCalledWith('original', 177.8, 'in');
    expect(f.ports.location).toHaveBeenCalledWith('original', 'Germany');
    expect(f.ports.weight).toHaveBeenCalledWith('original', '2026-10-07', 150, 'lbs');
    expect(f.data.biometrics!.weight).toEqual([{ date: '2026-10-06', value: 61, unit: 'kg', source: 'manual' }, { date: '2026-10-07', value: 150, unit: 'lbs', source: 'manual' }]);
    expect(f.ports.data).toHaveBeenCalledWith('original', f.data, expect.objectContaining({ biometrics: expect.objectContaining({ weight: expect.arrayContaining([expect.objectContaining({ value: 60 })]) }) }));
    expect(f.ports.saved).toHaveBeenCalledWith(true);
    expect(f.view.setPending.mock.calls).toEqual([[true], [false]]);
  });
  it.each(['rename', 'dob', 'height', 'data', 'weight', 'location'] as const)('stops after a rejected %s write, retains the draft and allows retry', async field => {
    const f = fixture(); vi.mocked(f.ports[field]).mockResolvedValueOnce(false);
    expect(await f.controller.saveProfile(f.origin, f.draft, true)).toBe(false);
    expect(f.ports.saved).not.toHaveBeenCalled(); expect(f.view.setError).toHaveBeenLastCalledWith(expect.stringContaining('entries are still here'));
    expect(f.draft.name).toBe('Ada');
    expect(await f.controller.saveProfile(f.origin, f.draft, true)).toBe(true);
    expect(f.ports.saved).toHaveBeenCalledWith(true);
    expect(f.view.setError).toHaveBeenLastCalledWith('');
  });
  it.each(['rename', 'dob', 'height', 'data', 'weight', 'location'] as const)('retirement during %s prevents later writes and publication', async field => {
    const f = fixture(), waiting = deferred(); vi.mocked(f.ports[field]).mockReturnValueOnce(waiting.promise);
    const save = f.controller.saveProfile(f.origin, f.draft, true);
    await vi.waitFor(() => expect(f.ports[field]).toHaveBeenCalled());
    f.retire(); waiting.resolve(true); expect(await save).toBe(false);
    expect(f.ports.saved).not.toHaveBeenCalled(); expect(f.view.setLatitude).not.toHaveBeenCalled();
    if (field === 'rename') expect(f.ports.dob).not.toHaveBeenCalled();
    if (field === 'dob') expect(f.ports.publishDob).not.toHaveBeenCalled();
    if (field === 'height') expect(f.ports.data).not.toHaveBeenCalled();
    if (field === 'data') expect(f.ports.weight).not.toHaveBeenCalled();
    if (field === 'weight') expect(f.ports.location).not.toHaveBeenCalled();
    expect(f.view.setPending.mock.calls).toEqual([[true]]);
  });
  it('rolls back a failed weight save without restoring unrelated biometrics', async () => {
    const f = fixture(), previous = f.data.biometrics!.weight, waiting = deferred();
    vi.mocked(f.ports.data).mockReturnValueOnce(waiting.promise);
    const save = f.controller.saveProfile(f.origin, f.draft, true);
    await vi.waitFor(() => expect(f.ports.data).toHaveBeenCalled());
    f.data.biometrics!.pulse = [{ date: '2026-10-07', value: 70, source: 'manual' }];
    waiting.resolve(false); expect(await save).toBe(false);
    expect(f.data.biometrics!.weight).toBe(previous); expect(f.data.biometrics!.pulse[0]!.value).toBe(70);
  });
  it('serializes country updates and profile saves for the same profile', async () => {
    const f = fixture(), waiting = deferred(); vi.mocked(f.ports.location).mockReturnValueOnce(waiting.promise);
    const first = f.controller.saveLocation(f.origin, 'Ger');
    const second = f.controller.saveProfile(f.origin, f.draft, true);
    await Promise.resolve(); expect(f.ports.rename).not.toHaveBeenCalled();
    waiting.resolve(true); expect(await first).toBe(true); expect(await second).toBe(true);
    expect(vi.mocked(f.ports.location).mock.calls).toEqual([['original', 'Ger'], ['original', 'Germany']]);
    expect(f.view.setPending.mock.calls).toEqual([[true], [true], [true], [false]]);
  });
  it('does not start queued work after retirement', async () => {
    const f = fixture(), waiting = deferred(); vi.mocked(f.ports.location).mockReturnValueOnce(waiting.promise);
    const first = f.controller.saveLocation(f.origin, 'Ger'), second = f.controller.saveProfile(f.origin, f.draft, true);
    await Promise.resolve(); f.retire(); waiting.resolve(true);
    expect(await first).toBe(false); expect(await second).toBe(false); expect(f.ports.rename).not.toHaveBeenCalled();
  });
  it('does not publish a delayed sex write to a replacement view', async () => {
    const f = fixture(), waiting = deferred(); vi.mocked(f.ports.sex).mockReturnValueOnce(waiting.promise);
    const save = f.controller.setSex(f.origin, 'male'); await Promise.resolve(); f.retire(); waiting.resolve(true);
    expect(await save).toBe(false); expect(f.ports.publishSex).not.toHaveBeenCalled(); expect(f.view.setSex).not.toHaveBeenCalled();
  });
  it('reports exceptions and leaves failed fields editable', async () => {
    const f = fixture(); vi.mocked(f.ports.rename).mockRejectedValueOnce(new Error('storage unavailable'));
    expect(await f.controller.saveProfile(f.origin, f.draft, true)).toBe(false);
    expect(f.view.setPending).toHaveBeenLastCalledWith(false); expect(f.view.setError).toHaveBeenLastCalledWith(expect.stringContaining('Try again'));
  });
});
