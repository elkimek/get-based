import { beforeEach, describe, expect, it } from 'vitest';

import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { mergePulledImportedData } from '../js/sync-pull-merge.js';

const ALL_RANGE_REVIEW = {
  summary: 'Context checked locally',
  suggestions: [],
  updatedAt: 1000,
  range: 'all',
  fingerprint: 'biology-context:all-current',
  fingerprintsByRange: {
    all: 'biology-context:all-current',
    '1y': 'biology-context:1y-current',
    '6m': 'biology-context:6m-current',
    '3m': 'biology-context:3m-current',
  },
  unlockedRanges: ['all', '1y', '6m', '3m'],
};

describe('Biology Score context sync merge', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    state.currentProfile = 'bio-context-profile';
    state.importedData = null;
  });

  it('preserves an all-range unlocked context review over a newer legacy single-range sync row', async () => {
    const local = {
      ...createDefaultProfileData(),
      biologyScoreContextAI: { ...ALL_RANGE_REVIEW },
    };
    const remoteLegacy = {
      ...createDefaultProfileData(),
      biologyScoreContextAI: {
        summary: 'Older-device single-range context check',
        suggestions: [],
        updatedAt: 2000,
        range: 'all',
        fingerprint: 'biology-context:legacy-only',
      },
    };

    state.importedData = local;
    const result = await mergePulledImportedData(state.currentProfile, remoteLegacy);

    expect(result.merged.biologyScoreContextAI.summary).toBe('Context checked locally');
    expect(result.merged.biologyScoreContextAI.fingerprintsByRange).toEqual(ALL_RANGE_REVIEW.fingerprintsByRange);
    expect(result.merged.biologyScoreContextAI.unlockedRanges).toEqual(['all', '1y', '6m', '3m']);
    expect(result.localDataChanged).toBe(false);
  });

  it('accepts a newer all-range context review from sync', async () => {
    const local = {
      ...createDefaultProfileData(),
      biologyScoreContextAI: { ...ALL_RANGE_REVIEW },
    };
    const remoteCurrent = {
      ...createDefaultProfileData(),
      biologyScoreContextAI: {
        ...ALL_RANGE_REVIEW,
        summary: 'Fresh context checked on another device',
        updatedAt: 3000,
        fingerprintsByRange: {
          all: 'biology-context:all-fresh',
          '1y': 'biology-context:1y-fresh',
          '6m': 'biology-context:6m-fresh',
          '3m': 'biology-context:3m-fresh',
        },
      },
    };

    state.importedData = local;
    const result = await mergePulledImportedData(state.currentProfile, remoteCurrent);

    expect(result.merged.biologyScoreContextAI.summary).toBe('Fresh context checked on another device');
    expect(result.merged.biologyScoreContextAI.updatedAt).toBe(3000);
    expect(result.localDataChanged).toBe(true);
  });
});
