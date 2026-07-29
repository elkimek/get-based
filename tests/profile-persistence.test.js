// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  configureProfileDeps,
  createProfile,
  getProfiles,
  renameProfile,
  saveProfiles,
  setProfileSex,
} from '../js/profile.js';
import { state } from '../js/state.js';

function profile(id, overrides = {}) {
  return {
    id,
    name: id,
    sex: null,
    dob: null,
    location: { country: '', zip: '' },
    tags: [],
    notes: '',
    status: 'active',
    avatar: null,
    height: null,
    heightUnit: 'cm',
    createdAt: 1,
    lastUpdated: 1,
    pinned: false,
    ...overrides,
  };
}

let previousDeps;
let previousProfiles;

beforeEach(() => {
  previousProfiles = state.profiles;
  state.profiles = [profile('original')];
});

afterEach(() => {
  if (previousDeps) configureProfileDeps(previousDeps);
  previousDeps = null;
  state.profiles = previousProfiles;
});

describe('durable profile persistence', () => {
  it('does not publish a failed profile-list snapshot to the cache', async () => {
    const failure = new Error('quota exceeded');
    const showNotification = vi.fn();
    previousDeps = configureProfileDeps({
      encryptedSetItem: vi.fn().mockRejectedValue(failure),
      showNotification,
    });

    await expect(saveProfiles([profile('replacement')])).rejects.toBe(failure);

    expect(getProfiles().map(item => item.id)).toEqual(['original']);
    expect(showNotification).toHaveBeenCalledWith(
      'Storage limit reached — could not save profile changes.',
      'error',
    );
  });

  it('resolves profile creation only after the write is durable', async () => {
    let finishWrite;
    const encryptedSetItem = vi.fn(() => new Promise(resolve => {
      finishWrite = resolve;
    }));
    previousDeps = configureProfileDeps({ encryptedSetItem });

    const creation = createProfile('New profile', { skipInitialSync: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(encryptedSetItem).toHaveBeenCalledOnce();
    expect(getProfiles().map(item => item.id)).toEqual(['original']);

    finishWrite();
    const id = await creation;

    expect(id).toMatch(/^p_[a-z0-9]+$/i);
    expect(getProfiles().map(item => item.id)).toEqual(['original', id]);
  });

  it('serializes concurrent mutations without losing an earlier change', async () => {
    const writeResolvers = [];
    const encryptedSetItem = vi.fn(() => new Promise(resolve => {
      writeResolvers.push(resolve);
    }));
    previousDeps = configureProfileDeps({ encryptedSetItem });

    const rename = renameProfile('original', 'Renamed');
    const setSex = setProfileSex('original', 'female');
    await Promise.resolve();
    await Promise.resolve();

    expect(encryptedSetItem).toHaveBeenCalledOnce();
    writeResolvers.shift()();
    await rename;
    await Promise.resolve();
    await Promise.resolve();

    expect(encryptedSetItem).toHaveBeenCalledTimes(2);
    writeResolvers.shift()();
    await setSex;

    expect(getProfiles()[0]).toMatchObject({ name: 'Renamed', sex: 'female' });
    const finalWrite = JSON.parse(encryptedSetItem.mock.calls[1][1]);
    expect(finalWrite[0]).toMatchObject({ name: 'Renamed', sex: 'female' });
  });

  it('creates distinct profile ids for back-to-back writes', async () => {
    previousDeps = configureProfileDeps({
      encryptedSetItem: vi.fn().mockResolvedValue(undefined),
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(12345);

    try {
      const [first, second] = await Promise.all([
        createProfile('First', { skipInitialSync: true }),
        createProfile('Second', { skipInitialSync: true }),
      ]);

      expect(first).not.toBe(second);
      expect(new Set(getProfiles().map(item => item.id)).size).toBe(3);
    } finally {
      now.mockRestore();
    }
  });
});
