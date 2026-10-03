import { beforeEach, describe, expect, it } from 'vitest';

import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { mergePulledImportedData } from '../js/sync-pull-merge.js';
import {
  buildBiologyScoreContextFingerprint,
  buildBiologyScoreContextFingerprintsByRange,
  buildBiologyScoreContextMaterialSignature,
  buildBiologyScoreContextMaterialSignaturesByRange,
  hasBiologyScoreContextReview,
} from '../js/biology-score-context-ai.js';

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
    localStorage.setItem('labcharts-active-profile', state.currentProfile);
    (state as {importedData: unknown}).importedData = null;
    state.dateRangeFilter = 'all';
  });

  it('preserves independently assessed range views when newer remote answers merge', async () => {
    const answer = (materialFingerprint: string, updatedAt: number) => ({ text: materialFingerprint, summary: materialFingerprint, materialFingerprint, updatedAt });
    (state as { importedData: unknown }).importedData = { ...createDefaultProfileData(), biologyScoreAI: { redoxStress: answer('optimal', 2000) } };
    const remote = { ...createDefaultProfileData(), biologyScoreAI: { redoxStress: answer('reference', 3000) } };
    const result = await mergePulledImportedData(state.currentProfile, remote);
    expect(result.merged.biologyScoreAI.redoxStress.materialFingerprint).toBe('reference');
    expect(result.merged.biologyScoreAI.redoxStress.variants).toEqual([answer('optimal', 2000)]);
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

    (state as { importedData: unknown }).importedData = local;
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

    (state as { importedData: unknown }).importedData = local;
    const result = await mergePulledImportedData(state.currentProfile, remoteCurrent);

    expect(result.merged.biologyScoreContextAI.summary).toBe('Fresh context checked on another device');
    expect(result.merged.biologyScoreContextAI.updatedAt).toBe(3000);
    expect(result.localDataChanged).toBe(true);
  });

  it('accepts an older all-range context review from sync over a newer local legacy row', async () => {
    const localLegacy = {
      ...createDefaultProfileData(),
      biologyScoreContextAI: {
        summary: 'Newer local legacy context check',
        suggestions: [],
        updatedAt: 3000,
        range: 'all',
        fingerprint: 'biology-context:legacy-local',
      },
    };
    const remoteComplete = {
      ...createDefaultProfileData(),
      biologyScoreContextAI: {
        ...ALL_RANGE_REVIEW,
        summary: 'Older complete context checked on another device',
        updatedAt: 2000,
      },
    };

    (state as { importedData: unknown }).importedData = localLegacy;
    const result = await mergePulledImportedData(state.currentProfile, remoteComplete);

    expect(result.merged.biologyScoreContextAI.summary).toBe('Older complete context checked on another device');
    expect(result.merged.biologyScoreContextAI.fingerprintsByRange).toEqual(ALL_RANGE_REVIEW.fingerprintsByRange);
    expect(result.merged.biologyScoreContextAI.unlockedRanges).toEqual(['all', '1y', '6m', '3m']);
    expect(result.localDataChanged).toBe(true);
  });

  it('uses synced Context source settings when validating a remote Biology Scores review', async () => {
    const scoreData = {
      dates: ['2026-06-01'],
      dateLabels: ['Jun 2026'],
      categories: {
        biochemistry: {
          label: 'Biochemistry',
          markers: {
            creatinine: { name: 'Creatinine', values: [88], unit: 'umol/L' },
          },
        },
      },
    };
    const remote = {
      ...createDefaultProfileData(),
      contextSourceSettings: { 'lab-markers': true, 'lab-group-Fatty Acids': false },
    };
    (state as { importedData: unknown }).importedData = remote;
    (remote as {biologyScoreContextAI?: unknown}).biologyScoreContextAI = {
      summary: 'Remote context checked with labs enabled',
      suggestions: [],
      updatedAt: 4000,
      range: 'all',
      fingerprint: (buildBiologyScoreContextFingerprint as unknown as (data: typeof scoreData) => ReturnType<typeof buildBiologyScoreContextFingerprint>)(scoreData),
      fingerprintsByRange: (buildBiologyScoreContextFingerprintsByRange as unknown as (data: typeof scoreData) => ReturnType<typeof buildBiologyScoreContextFingerprintsByRange>)(scoreData),
      contextSignature: (buildBiologyScoreContextMaterialSignature as unknown as (data: typeof scoreData) => ReturnType<typeof buildBiologyScoreContextMaterialSignature>)(scoreData),
      contextSignaturesByRange: (buildBiologyScoreContextMaterialSignaturesByRange as unknown as (data: typeof scoreData) => ReturnType<typeof buildBiologyScoreContextMaterialSignaturesByRange>)(scoreData),
      unlockedRanges: ['all', '1y', '6m', '3m'],
    };

    const local = {
      ...createDefaultProfileData(),
      contextSourceSettings: {},
    };
    localStorage.setItem('labcharts-bio-context-profile-ai-ctx-lab-markers', 'off');
    (state as { importedData: unknown }).importedData = local;
    const result = await mergePulledImportedData(state.currentProfile, remote);
    (state as { importedData: unknown }).importedData = result.merged;

    expect(result.merged.contextSourceSettings?.['lab-markers']).toBe(true);
    expect(result.merged.contextSourceSettings?.['lab-group-Fatty Acids']).toBe(false);
    expect((hasBiologyScoreContextReview as (data: unknown) => ReturnType<typeof hasBiologyScoreContextReview>)(scoreData)).toBe(true);
  });
});
