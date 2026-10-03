// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {Mock} from 'vitest';

type RawSupplementFixture = Record<string, unknown> & {id?: unknown};
type ImportedRichFixture = Record<string, unknown> & {entries: {markers: unknown; sourceFiles?: unknown}[]; sleepRest: {issues?: unknown}; lightCircadian: {practices?: unknown}; menstrualCycle: {periods?: unknown}; emfAssessment: {assessments?: unknown}; biometrics: {weight?: unknown}; lightEnvironment: {rooms?: unknown}; lightDailyVerdicts: Record<string, unknown>; importSnapshots: {id?: unknown}[]};
type ParsedRestoreFixture = Record<string, unknown> & {entries: {markers: unknown}[]; supplements: RawSupplementFixture[]; diet: {type?: unknown}};
export type PreservedOriginalSaveParameter = {data: unknown};

const runtime = vi.hoisted(() => ({
  clearDemoLoadingProfile: vi.fn(),
  encryptedGetItem: vi.fn(),
  encryptedSetItem: vi.fn(),
  getEncryptionEnabled: vi.fn(() => false),
  getProfiles: vi.fn((): {id: string; name?: string}[] => [{ id: 'profile-1', name: 'Primary' }]),
  refreshImportRuntimeShell: vi.fn(async () => {}),
  saveImportedData: vi.fn<() => Promise<unknown>>(),
  onProfileSaved: vi.fn(),
  saveImportedDataForProfile: vi.fn<(profileId: string, importedData: unknown, options: {expectedData?: unknown}) => Promise<boolean>>(async (profileId, importedData) => {
    await runtime.encryptedSetItem(`${profileId}:imported`, JSON.stringify(importedData));
    return true;
  }),
  setSelectedNodeUrl: vi.fn(),
  showNotification: vi.fn(),
  showConfirmDialog: vi.fn(async () => true),
  state: { currentProfile: 'profile-1', importedData: {} as Record<string, unknown> },
}));

vi.mock('../js/state.js', () => ({ state: runtime.state }));
vi.mock('../js/utils.js', () => ({
  isDebugMode: () => false,
  showNotification: runtime.showNotification,
  showConfirmDialog: runtime.showConfirmDialog,
}));
vi.mock('../js/sync-save-hooks.js', () => ({ onProfileSaved: runtime.onProfileSaved }));
vi.mock('../js/data.js', () => ({
  saveImportedData: runtime.saveImportedData,
  invalidateActiveDataCache: vi.fn(),
  saveImportedDataForProfile: runtime.saveImportedDataForProfile,
}));
vi.mock('../js/profile.js', () => ({
  createProfile: vi.fn(),
  getProfiles: runtime.getProfiles,
  loadProfile: vi.fn(async () => {}),
  migrateProfileData: vi.fn(),
  profileStorageKey: (id: unknown, kind: unknown) => `${id}:${kind}`,
  updateProfileMeta: vi.fn(async () => true),
}));
vi.mock('../js/crypto.js', () => ({
  encryptedGetItem: runtime.encryptedGetItem,
  encryptedSetItem: runtime.encryptedSetItem,
  getEncryptionEnabled: runtime.getEncryptionEnabled,
}));
vi.mock('../js/data-merge.js', () => ({
  appendImportedArrayItem(data: Record<string, unknown[]>, field: string, item: unknown) {
    if (!Array.isArray(data[field])) data[field] = [];
    data[field]!.push(item);
  },
  clearTombstone: vi.fn(),
  ensureImportedArray(data: Record<string, unknown[]>, field: string) {
    if (!Array.isArray(data[field])) data[field] = [];
    return data[field];
  },
  replaceImportedArrayItem(data: Record<string, unknown[]>, field: string, index: number, item: unknown) {
    data[field]![index] = item;
  },
  sortImportedArray(data: Record<string, unknown[]>, field: string, compare: (a: unknown, b: unknown) => number) {
    data[field]!.sort(compare);
  },
  trimImportedArray(data: Record<string, unknown[]>, field: string, limit: number) {
    data[field] = data[field]!.slice(-limit);
  },
}));
vi.mock('../js/lab-entry-mutations.js', () => ({
  findOrCreateLabEntry(data: {entries: {date: unknown; markers: Record<string, unknown>}[]}, date: unknown) {
    let entry = data.entries.find(item => item.date === date);
    if (!entry) {
      entry = { date, markers: {} };
      data.entries.push(entry);
    }
    return entry;
  },
}));
vi.mock('../js/export-runtime.js', () => ({
  clearDemoLoadingProfile: runtime.clearDemoLoadingProfile,
  isDemoLoadingProfile: () => false,
  refreshImportRuntimeShell: runtime.refreshImportRuntimeShell,
}));
vi.mock('../js/nostr-discovery.js', () => ({ setSelectedNodeUrl: runtime.setSelectedNodeUrl }));

const { importDataJSON } = await import('../js/export-import.js');

describe('JSON restore runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.saveImportedData.mockResolvedValue(true);
    runtime.showConfirmDialog.mockResolvedValue(true);
    localStorage.clear();
    runtime.encryptedGetItem.mockImplementation(async key => localStorage.getItem(key));
    runtime.encryptedSetItem.mockImplementation(async (key, value) => localStorage.setItem(key, value));
    runtime.state.currentProfile = 'profile-1';
    runtime.state.importedData = {
      entries: [{ date: '2026-01-10', markers: { glucose: 90 } }],
      healthGoals: [{ text: 'Sleep better', severity: 'medium' }],
      menstrualCycle: {
        cycleLength: 28,
        periods: [{ startDate: '2025-12-01' }],
      },
      emfAssessment: { assessments: [{ id: 'emf-existing' }] },
      biometrics: {
        weight: [{ date: '2026-01-01', value: 70 }],
        pulse: [],
        bp: [],
      },
      manualMetricTombstones: { 'rhr.2026-01-01': 200 },
      sunSessions: [{ id: 'sun-existing' }],
      deviceSessions: [],
      lightDevices: [],
      lightAudits: [],
      lightMeasurements: [],
      lightEnvironment: {
        rooms: [{ id: 'room-existing' }],
        screens: [],
      },
      lightDailyVerdicts: { '2026-01-01': { status: 'existing' } },
      changeHistory: [{ field: 'diet', date: '2026-01-01', value: 'old' }],
      chatSummaries: [{ threadId: 'thread-existing', summary: 'old' }],
      supplements: [{ name: 'Magnesium', startDate: '2026-01-01' }],
      notes: [{ date: '2026-01-01', text: 'Existing note' }],
      importSnapshots: [{ id: 'snap-existing', importedAt: 10 }],
    };
  });

  it('rolls back a JSON import and does not announce success when saving fails', async () => {
    const before = structuredClone(runtime.state.importedData);
    runtime.saveImportedData.mockResolvedValueOnce(false);
    await importDataJSON(new File([JSON.stringify({ entries: [{ date: '2026-01-10', markers: { glucose: 120 } }] })], 'failed.json'));
    expect(runtime.state.importedData).toEqual(before);
    expect(runtime.showNotification.mock.calls.some(([, kind]) => kind === 'success')).toBe(false);
    expect(runtime.showNotification).toHaveBeenCalledWith(expect.stringContaining('could not be saved'), 'error');
  });

  it('keeps chat restoration bound to the origin when navigation occurs during save', async () => {
    let release: ((value: unknown) => void) | undefined;
    runtime.saveImportedData.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = importDataJSON(new File([JSON.stringify({entries:[],chat:{threads:[],messages:{},personality:'portable'}})], 'origin.json'));
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    runtime.state.currentProfile = 'destination';
    runtime.state.importedData = {entries:[],notes:[{text:'Destination'}]};
    release!(true); await pending;
    expect(localStorage.getItem('labcharts-destination-chatPersonality')).toBeNull();
    expect(localStorage.getItem('labcharts-profile-1-chatPersonality')).toBe('portable');
    expect(runtime.refreshImportRuntimeShell).not.toHaveBeenCalled();
  });
  it.each([false, 'reject'])('does not roll back replacement data after a failed save (%s)', async failure => {
    let release: ((value: unknown) => void) | undefined, reject: ((reason?: unknown) => void) | undefined;
    runtime.saveImportedData.mockImplementationOnce(() => new Promise((resolve, fail) => { release = resolve; reject = fail; }));
    const pending = importDataJSON(new File([JSON.stringify({entries:[{date:'2026-01-10',markers:{glucose:120}}]})], 'failed.json'));
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const replacement = {entries:[],notes:[{text:'Newly loaded data'}]};
    runtime.state.importedData = replacement;
    if (failure === 'reject') reject!(new Error('Storage failed')); else release!(false);
    await pending;
    expect(runtime.state.importedData).toEqual({entries:[],notes:[{text:'Newly loaded data'}]});
    expect(runtime.showNotification.mock.calls.some(([,kind]) => kind === 'success')).toBe(false);
  });

  it('restores a persona-only chat backup without requiring a conversation thread', async () => {
    const backup = {
      entries: [],
      chat: {
        threads: [],
        messages: {},
        personality: 'custom_portable',
        customPersonalities: [{
          id: 'custom_portable',
          name: 'Portable Coach',
          icon: 'P',
          promptText: 'Use a calm systems-thinking style.',
          personaAgreement: {
            accepted: true,
            version: 1,
            acceptedAt: '2026-08-08T10:00:00.000Z',
            host: 'app.getbased.health',
            statement: 'Accepted for personal use.',
          },
        }],
      },
    };

    await importDataJSON(new File([JSON.stringify(backup)], 'persona-only.json', { type: 'application/json' }));

    expect(localStorage.getItem('labcharts-profile-1-chatPersonality')).toBe('custom_portable');
    expect((JSON.parse as (text: string | null) => unknown)(localStorage.getItem('labcharts-profile-1-chatPersonalityCustom')))
      .toEqual([expect.objectContaining({
        id: 'custom_portable',
        promptText: 'Use a calm systems-thinking style.',
        personaAgreement: expect.objectContaining({ accepted: true, version: 1 }),
      })]);
    expect(runtime.refreshImportRuntimeShell).toHaveBeenCalledWith({ chat: true });
  });

  it('revives and syncs an existing profile only after the guarded bundle save succeeds', async () => {
    localStorage.setItem('labcharts-profile-delete-intent-profile-1', '{"at":1}');
    localStorage.setItem('labcharts-tombstone-pending-profile-1', '{"at":2}');
    const { updateProfileMeta } = await import('../js/profile.js');
    runtime.saveImportedDataForProfile.mockImplementationOnce(async (profileId, importedData) => {
      expect(localStorage.getItem('labcharts-profile-delete-intent-profile-1')).toBe('{"at":1}');
      expect(localStorage.getItem('labcharts-tombstone-pending-profile-1')).toBe('{"at":2}');
      expect(updateProfileMeta).not.toHaveBeenCalled();
      await runtime.encryptedSetItem(`${profileId}:imported`, JSON.stringify(importedData));
      return true;
    });
    (updateProfileMeta as unknown as Mock<() => Promise<boolean>>).mockImplementationOnce(async () => {
      expect(localStorage.getItem('labcharts-profile-delete-intent-profile-1')).toBeNull();
      expect(localStorage.getItem('labcharts-tombstone-pending-profile-1')).toBeNull();
      expect((JSON.parse as (text: string | null) => ParsedRestoreFixture)(localStorage.getItem('profile-1:imported')).diet.type).toBe('whole-food');
      return true;
    });
    const backup = {
      type: 'database',
      profiles: [{
        id: 'profile-1',
        name: 'Primary',
        data: { diet: { type: 'whole-food' } },
      }],
    };

    await importDataJSON(new File([JSON.stringify(backup)], 'database.json', { type: 'application/json' }));

    expect(localStorage.getItem('labcharts-profile-delete-intent-profile-1')).toBeNull();
    expect(localStorage.getItem('labcharts-tombstone-pending-profile-1')).toBeNull();
    expect(runtime.saveImportedDataForProfile).toHaveBeenCalledWith(
      'profile-1',
      expect.objectContaining({ diet: { type: 'whole-food' } }),
      { forceProfileScope: true, expectedData: null, skipSync: true },
    );
    expect((JSON.parse as (text: string | null) => unknown)(localStorage.getItem('profile-1:imported')))
      .toMatchObject({ diet: { type: 'whole-food' } });
  });

  it('stops before overwriting a later profile changed after bundle preflight', async () => {
    const profiles = [{ id: 'profile-1', name: 'Primary' }, { id: 'profile-2', name: 'Second' }];
    runtime.getProfiles.mockReturnValueOnce(profiles);
    const before = { entries: [{ date: '2026-01-01', markers: { glucose: 90 } }],
      supplements: [{ id: 'tmg', name: 'TMG', startDate: '2026-03-24', dosage: '500 mg' }] };
    localStorage.setItem('profile-2:imported', JSON.stringify(before));
    localStorage.setItem('labcharts-profile-delete-intent-profile-2', '{"at":1}');
    localStorage.setItem('labcharts-tombstone-pending-profile-2', '{"at":2}');
    const latest = structuredClone(before);
    (latest.entries[0]!.markers as Record<string, unknown>).hba1c = 5;
    latest.supplements[0]!.dosage = '2000 mg';
    runtime.saveImportedDataForProfile.mockImplementationOnce(async (id, data) => {
      localStorage.setItem(`${id}:imported`, JSON.stringify(data));
      localStorage.setItem('profile-2:imported', JSON.stringify(latest));
      return true;
    }).mockImplementationOnce(async (id: string, data: PreservedOriginalSaveParameter['data'], options: {expectedData?: unknown; preservedData?: typeof data}) => {
      expect(options.expectedData).toBe(JSON.stringify(before));
      return localStorage.getItem(`${id}:imported`) === options.expectedData;
    });
    const backup = { type: 'database', profiles: profiles.map(p => ({ ...p,
      data: { entries: [{ date: '2026-01-01', markers: { insulin: 6 } }] } })) };
    await importDataJSON(new File([JSON.stringify(backup)], 'concurrent.json'));
    const restored = (JSON.parse as (text: string | null) => ParsedRestoreFixture)(localStorage.getItem('profile-2:imported'));
    expect(restored.entries[0]!.markers).toEqual({ glucose: 90, hba1c: 5 });
    expect(restored.supplements).toEqual(latest.supplements);
    const { updateProfileMeta } = await import('../js/profile.js');
    expect(updateProfileMeta).toHaveBeenCalledExactlyOnceWith('profile-1', { name: 'Primary' });
    expect(runtime.onProfileSaved).toHaveBeenCalledExactlyOnceWith('profile-1', (JSON.parse as (text: string | null) => unknown)(localStorage.getItem('profile-1:imported')));
    expect(localStorage.getItem('labcharts-profile-delete-intent-profile-2')).toBe('{"at":1}');
    expect(localStorage.getItem('labcharts-tombstone-pending-profile-2')).toBe('{"at":2}');
    expect(runtime.showNotification).toHaveBeenLastCalledWith(expect.stringContaining('Saved profiles: 1. Import stopped'), 'error');
  });

  it('reports saved profiles if a later bundle write cannot be combined safely', async () => {
    runtime.getProfiles.mockReturnValueOnce([{ id: 'profile-1' }, { id: 'profile-2' }]);
    runtime.saveImportedDataForProfile.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const backup = { type: 'database', profiles: ['profile-1', 'profile-2'].map(id => ({ id, data: { diet: { type: 'imported' } } })) };
    await importDataJSON(new File([JSON.stringify(backup)], 'conflict.json'));
    expect(runtime.showNotification).toHaveBeenLastCalledWith(expect.stringContaining('Saved profiles: 1. Import stopped'), 'error');
    const { updateProfileMeta } = await import('../js/profile.js');
    expect(updateProfileMeta).toHaveBeenCalledExactlyOnceWith('profile-1', {});
    expect(runtime.showNotification.mock.calls.some(([, kind]) => kind === 'success')).toBe(false);
  });

  it.each(['reject', 'false'])('queues committed restore data when metadata saving fails (%s)', async failure => {
    const { updateProfileMeta } = await import('../js/profile.js');
    if (failure === 'reject') (updateProfileMeta as unknown as Mock<() => Promise<boolean>>).mockRejectedValueOnce(new Error('Storage full'));
    else (updateProfileMeta as unknown as Mock<() => Promise<boolean>>).mockResolvedValueOnce(false);
    localStorage.setItem('labcharts-profile-delete-intent-profile-1', '{"at":1}');
    const backup = { type: 'database', profiles: [{ id: 'profile-1', name: 'Renamed', data: { diet: { type: 'restored' } } }] };
    await importDataJSON(new File([JSON.stringify(backup)], 'metadata-failure.json'));
    const committed = (JSON.parse as (text: string | null) => ParsedRestoreFixture)(localStorage.getItem('profile-1:imported'));
    expect(committed.diet.type).toBe('restored');
    expect(runtime.onProfileSaved).toHaveBeenCalledExactlyOnceWith('profile-1', committed);
    expect(localStorage.getItem('labcharts-profile-delete-intent-profile-1')).toBeNull();
    expect(runtime.showNotification).toHaveBeenLastCalledWith(expect.stringContaining('Saved profiles: 1. Import stopped'), 'error');
    expect(runtime.showNotification.mock.calls.some(([, kind]) => kind === 'success')).toBe(false);
  });

  it.each(['customMarkers', 'refOverrides'])('preserves existing %s definitions while adding imported ones', async field => {
    localStorage.setItem('profile-1:imported', JSON.stringify({ [field]: { saved: { unit: 'mg' } } }));
    const backup = { type: 'database', profiles: [{ id: 'profile-1', data: { [field]: { saved: { unit: 'g' }, added: { unit: 'mmol/L' } } } }] };
    await importDataJSON(new File([JSON.stringify(backup)], 'definitions.json'));
    expect((JSON.parse as (text: string | null) => Record<string, unknown>)(localStorage.getItem('profile-1:imported'))[field]).toEqual({ saved: { unit: 'mg' }, added: { unit: 'mmol/L' } });
  });

  it('restores Biology Score insights from JSON and keeps newer local interpretations', async () => {
    runtime.state.importedData.biologyScoreAI = { thyroidCoherence: { text: 'New local explanation', summary: 'New local insight.', updatedAt: 20 } };
    const backup = { entries: [{ date: '2026-01-10', markers: { glucose: 90 } }], biologyScoreAI: {
      thyroidCoherence: { text: 'Older backup', summary: 'Older insight.', updatedAt: 10 },
      metabolicFlexibility: { text: 'Saved full explanation', summary: 'Saved short insight.', materialFingerprint: 'evidence', updatedAt: 30 },
    } };
    await importDataJSON(new File([JSON.stringify(backup)], 'biology.json', { type: 'application/json' }));
    expect((runtime.state.importedData.biologyScoreAI as Record<string, {text?: unknown}>).thyroidCoherence!.text).toBe('New local explanation');
    expect((runtime.state.importedData.biologyScoreAI as Record<string, {text?: unknown}>).metabolicFlexibility).toEqual(backup.biologyScoreAI.metabolicFlexibility);
  });

  it('merges a rich backup without duplicating same-date or stable-id data', async () => {
    localStorage.setItem('labcharts-profile-1-chat-threads', JSON.stringify([
      { id: 'thread-existing', title: 'Existing' },
    ]));
    const backup = {
      entries: [
        {
          date: '2026-01-10',
          file: 'panel-a.pdf',
          sourceFiles: ['panel-a.pdf'],
          markers: { insulin: 5 },
          markerSources: { insulin: { file: 'panel-a.pdf' } },
        },
        {
          date: '2026-01-10',
          sourceFile: 'panel-b.pdf',
          sourceFiles: ['panel-b.pdf'],
          markers: { triglycerides: 80 },
        },
        { markers: { ignored: 1 } },
      ],
      diagnoses: 'Seasonal allergies',
      diet: { type: 'whole-food', restrictions: [] },
      exercise: 'Strength three times weekly',
      sleepCircadian: {
        duration: 8,
        issues: ['blue light blockers', 'restless sleep'],
        note: 'Migrated combined field',
      },
      healthGoals: [
        { text: 'Sleep better', severity: 'medium' },
        { text: 'Improve recovery', severity: 'high' },
      ],
      customMarkers: { 'custom.one': { label: 'One' } },
      markerPlacements: {
        'custom:one': { categoryKey: 'metabolic', futureField: true },
      },
      refOverrides: { glucose: { min: 70, max: 99 } },
      categoryLabels: { metabolic: 'Metabolic' },
      categoryIcons: { metabolic: '⚡' },
      markerLabels: { glucose: 'Glucose' },
      menstrualCycle: {
        cycleLength: 30,
        periods: [
          { startDate: '2025-12-01' },
          { startDate: '2026-01-01' },
        ],
      },
      emfAssessment: {
        assessments: [
          { id: 'emf-existing' },
          { id: 'emf-new' },
        ],
      },
      genetics: { snps: { rs1: 'AA' } },
      biometrics: {
        weight: [
          { date: '2026-01-01', value: 70 },
          { date: '2026-01-10', value: 69 },
        ],
        pulse: [{ date: '2026-01-10', value: 55 }],
        bp: [{ date: '2026-01-10', systolic: 110, diastolic: 70 }],
      },
      markerNotes: { glucose: 'fasted' },
      markerValueNotes: { 'glucose:2026-01-10': 'morning' },
      manualValues: { 'glucose:2026-01-10': true },
      manualMetricTombstones: {
        'rhr.2026-01-01': 100,
        'rhr.2026-01-10': 300,
      },
      sunSessions: [
        { id: 'sun-existing' },
        { id: 'sun-new' },
        null,
      ],
      deviceSessions: [{ id: 'device-new' }],
      lightDevices: [{ id: 'light-device-new' }],
      lightAudits: [{ id: 'audit-new' }],
      lightMeasurements: [{ id: 'measurement-new' }],
      lightEnvironment: {
        rooms: [
          { id: 'room-existing' },
          { id: 'room-new' },
        ],
        screens: [{ id: 'screen-new' }],
        burdenAI: { status: 'complete' },
      },
      sunDefaults: { skinType: 2 },
      sunCorrelations: { enabled: true },
      lifelightProfile: { chronotype: 'early' },
      lightDailyVerdicts: {
        '2026-01-01': { status: 'replacement-ignored' },
        '2026-01-02': { status: 'new' },
      },
      channelMixAI: { status: 'complete' },
      biologyScoreContextAI: { status: 'complete' },
      contextSourceSettings: { labs: true },
      nutritionContextDays: 90,
      nutritionTargets: { energyKcal: 2100, proteinG: 120 },
      changeHistory: [
        { field: 'diet', date: '2026-01-01', value: 'updated' },
        { field: 'exercise', date: '2026-01-02', value: 'new' },
      ],
      wearableSummary: {
        sources: { garmin: { connected: true } },
      },
      wearableCardOrder: ['sleep', 'recovery'],
      wearablePrimaryOverride: {
        sleep: 'garmin',
        recovery: 'missing-source',
      },
      chatSummaries: [
        { threadId: 'thread-existing', summary: 'updated' },
        { threadId: 'thread-new', summary: 'new' },
      ],
      supplements: [
        { name: 'Magnesium', startDate: '2026-01-01' },
        {
          name: 'Vitamin D',
          dosage: '2000 IU',
          startDate: '2026-01-02',
          sourceUrl: 'https://example.com/product',
        },
      ],
      notes: [
        { date: '2026-01-01', text: 'Existing note' },
        { date: '2026-01-02', text: 'New note' },
      ],
      importSnapshots: [
        { id: 'snap-existing', importedAt: 20, fileName: 'newer.pdf' },
        { id: 'snap-new', importedAt: 15, fileName: 'new.pdf' },
      ],
      chat: {
        threads: [
          { id: 'thread-existing', title: 'Existing' },
          {
            id: 'thread-new',
            title: 'New',
            personalityIcon: '<img src=x onerror=\"window.__chatXss=1\">',
            messageCount: '<svg onload=alert(1)>',
          },
          { id: '__proto__', title: 'Rejected' },
        ],
        messages: {
          'thread-new': [{
            role: 'user',
            content: 'Hello',
            joinIcon: '<img src=x onerror=\"window.__chatXss=1\">',
            thumbnails: ['data:image/svg+xml,<svg onload=alert(1)>'],
            hasImages: true,
          }],
        },
        personality: 'coach',
        customPersonalities: [{
          id: 'custom_coach',
          name: 'Coach',
          icon: '<img src=x onerror=\"window.__chatXss=1\">',
          promptText: 'Help',
        }],
      },
    };

    const file = new File(
      [JSON.stringify(backup)],
      'getbased-backup.json',
      { type: 'application/json' },
    );
    await importDataJSON(file);

    const imported = runtime.state.importedData as ImportedRichFixture;
    expect(imported.entries).toHaveLength(1);
    expect(imported.entries[0]!.markers).toEqual({
      glucose: 90,
      insulin: 5,
      triglycerides: 80,
    });
    expect(imported.entries[0]!.sourceFiles).toEqual(['panel-a.pdf', 'panel-b.pdf']);
    expect(imported.sleepRest.issues).toEqual(['restless sleep']);
    expect(imported.lightCircadian.practices).toEqual(['blue light blockers']);
    expect(imported.healthGoals).toHaveLength(2);
    expect(imported.markerPlacements).toEqual({
      'custom:one': { categoryKey: 'metabolic', futureField: true },
    });
    expect(imported.menstrualCycle.periods).toHaveLength(2);
    expect(imported.emfAssessment.assessments).toHaveLength(2);
    expect(imported.biometrics.weight).toHaveLength(2);
    expect(imported.manualMetricTombstones).toEqual({
      'rhr.2026-01-01': 200,
      'rhr.2026-01-10': 300,
    });
    expect(imported.sunSessions).toEqual([
      { id: 'sun-existing' },
      { id: 'sun-new' },
    ]);
    expect(imported.lightEnvironment.rooms).toHaveLength(2);
    expect(imported.lightDailyVerdicts['2026-01-01']).toEqual({ status: 'existing' });
    expect(imported.lightDailyVerdicts['2026-01-02']).toEqual({ status: 'new' });
    expect(imported.nutritionContextDays).toBe(90);
    expect(imported.nutritionTargets).toEqual({ energyKcal: 2100, proteinG: 120 });
    expect(imported.changeHistory).toEqual([
      { field: 'diet', date: '2026-01-01', value: 'updated' },
      { field: 'exercise', date: '2026-01-02', value: 'new' },
    ]);
    expect(imported.wearablePrimaryOverride).toEqual({ sleep: 'garmin' });
    expect(imported.chatSummaries).toHaveLength(2);
    expect(imported.supplements).toHaveLength(2);
    expect(imported.notes).toHaveLength(2);
    expect(imported.importSnapshots.map(snapshot => snapshot.id)).toEqual([
      'snap-existing',
      'snap-new',
    ]);
    expect((JSON.parse as (text: string | null) => unknown)(localStorage.getItem('labcharts-profile-1-chat-threads'))).toHaveLength(2);
    const restoredMessages = (JSON.parse as (text: string | null) => Record<string, unknown>[])(localStorage.getItem('labcharts-profile-1-chat-t_thread-new'));
    expect(restoredMessages[0]!.thumbnails).toEqual([]);
    expect(restoredMessages[0]!.imageCount).toBe(0);
    expect((JSON.parse as (text: string | null) => unknown[])(localStorage.getItem('labcharts-profile-1-chatPersonalityCustom'))[0])
      .toMatchObject({
        id: 'custom_coach',
        icon: 'img src=x onerror=window.__chatXss=1',
      });
    expect(runtime.saveImportedData).toHaveBeenCalledOnce();
    expect(runtime.refreshImportRuntimeShell).toHaveBeenCalledWith({ chat: true });
    expect(runtime.showNotification).toHaveBeenLastCalledWith(
      'Imported 2 date entries',
      'success',
    );
  });
  it('preserves ingredient frequency, identity and a single ongoing dose period from a client export', async () => {
    const dose = { ingredient: 'TMG', value: 500, unit: 'mg', basis: 'day', source: 'ingredient' };
    const tmg = { id: 'sm_import_tmg', schemaVersion: 2, name: 'TMG Powder', type: 'supplement',
      startDate: '2026-03-24', endDate: null, dosage: 'scoop', note: '', timesPerDay: 1,
      schedule: { mode: 'daily', timesPerDay: 1 }, lifecycle: { state: 'active' },
      ingredients: [{ name: 'TMG', amountValue: 500, amountUnit: 'mg' }],
      periods: [{ start: '2026-03-24', end: null, dose, ingredientDoses: [dose], schedule: { mode: 'daily' } }],
      currentDose: dose, sourceUrl: 'https://example.test/tmg', brand: 'Test',
      servingSize: { value: 1, unit: 'scoop' }, importProvenance: { reviewed: true }, futureField: { keep: true },
    };
    await importDataJSON(new File([JSON.stringify({ version: 2, entries: [{ date: '2026-05-22', markers: { 'biochemistry.glucose': 4.56 } }], supplements: [tmg] })], 'regimen.json'));
    const imported = (runtime.state.importedData as {supplements: RawSupplementFixture[]}).supplements.find(s => s.id === tmg.id);
    expect(imported).toEqual(tmg);
    const { prepareTherapyHistory, therapyExposure } = await import('../js/therapy-correlations.js');
    const history = (prepareTherapyHistory as (input: unknown, date: Parameters<typeof prepareTherapyHistory>[1]) => ReturnType<typeof prepareTherapyHistory>)(imported, '2026-09-28');
    expect(history.currentDoses[0]).toMatchObject({ value: 500, confirmedSince: '2026-03-24' });
    expect(therapyExposure(history, '2026-09-28')).toMatchObject({ value: 500, usage: 1 });
  });

  it.each(['profile', 'database'])('restores updated regimens by stable identity in a %s import', async format => {
    const saved = { id: 'stable-id', name: 'Original', startDate: '2026-01-01', periods: [{ start: '2026-01-01', end: null }] };
    const unrelated = { ...saved, id: 'unrelated', name: 'Keep me' };
    (runtime.state.importedData as {supplements: RawSupplementFixture[]}).supplements = [saved, unrelated];
    localStorage.setItem('profile-1:imported', JSON.stringify(runtime.state.importedData));
    const edited = { ...saved, name: 'Renamed', startDate: '2026-02-01', sourceUrl: 'javascript:alert(1)',
      periods: [{ start: '2026-02-01', end: '2026-03-01', dose: '500 mg' }, { start: '2026-03-02', end: null, dose: '2000 mg' }] };
    const added = { ...edited, id: 'new-id', name: 'New' };
    const data = { entries: [{ date: '2026-05-22', markers: { 'biochemistry.glucose': 4.56 } }], supplements: [edited, added, { ...added, name: 'Latest name' }] };
    const backup = format === 'profile' ? data : { type: 'database', profiles: [{ id: 'profile-1', name: 'Primary', data }] };
    await importDataJSON(new File([JSON.stringify(backup)], 'identities.json'));
    const records = format === 'profile' ? (runtime.state.importedData as {supplements: RawSupplementFixture[]}).supplements : (JSON.parse as (text: string | null) => {supplements: RawSupplementFixture[]})(localStorage.getItem('profile-1:imported')).supplements;
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ id: saved.id, name: edited.name, startDate: edited.startDate, periods: edited.periods });
    expect(records[0]!.sourceUrl).toBeUndefined();
    expect(records[1]).toEqual(unrelated);
    expect(records[2]).toMatchObject({ id: 'new-id', name: 'Latest name', periods: edited.periods });
  });

  it.each(['profile', 'database'])('asks before replacing a conflicting regimen in a %s import', async format => {
    const saved = { id: 'stable', name: 'TMG', startDate: '2026-03-24', updatedAt: 200,
      periods: [{ start: '2026-03-24', end: null, dose: '500 mg', schedule: { mode: 'daily' } }],
      ingredients: [{ name: 'TMG', amount: '500 mg' }], schedule: { mode: 'daily' },
      lifecycle: { state: 'active' }, sourceUrl: 'https://example.test/tmg', futureField: { keep: true } };
    (runtime.state.importedData as {supplements: RawSupplementFixture[]}).supplements = [saved];
    localStorage.setItem('profile-1:imported', JSON.stringify(runtime.state.importedData));
    async function restore(record: unknown) {
      const data = { entries: [{ date: '2026-05-22', markers: { glucose: 90 } }], supplements: [record] };
      const backup = format === 'profile' ? data : { type: 'database', profiles: [{ id: 'profile-1', name: 'Primary', data }] };
      await importDataJSON(new File([JSON.stringify(backup)], 'partial.json'));
      return format === 'profile' ? (runtime.state.importedData as {supplements: RawSupplementFixture[]}).supplements : (JSON.parse as (text: string | null) => {supplements: RawSupplementFixture[]})(localStorage.getItem('profile-1:imported')).supplements;
    }
    const incoming = { id: saved.id, name: 'Updated TMG', startDate: saved.startDate,
      updatedAt: 100, periods: [{ start: saved.startDate, end: null, dose: '2000 mg' }] };
    runtime.showConfirmDialog.mockResolvedValueOnce(false);
    expect(await restore(incoming)).toEqual([saved]);
    expect(runtime.showConfirmDialog).toHaveBeenCalledWith(expect.stringContaining('remove omitted fields'), expect.objectContaining({ confirmLabel: 'Use imported', cancelLabel: 'Keep saved' }));
    const applied = await restore(incoming);
    expect(applied).toEqual([{ dosage: '', endDate: null, type: 'supplement', note: '', ...incoming }]);
    expect(applied[0]!.ingredients).toBeUndefined();
    expect(applied[0]!.sourceUrl).toBeUndefined();
    const undated = { id: saved.id, name: incoming.name, startDate: saved.startDate, periods: saved.periods };
    expect((await restore(undated))[0]!.periods).toEqual(saved.periods);
  });

  it('aborts a profile import if data changes while resolving regimen conflicts', async () => {
    (runtime.state.importedData as {supplements: RawSupplementFixture[]}).supplements = [{ id: 'stable', name: 'TMG', startDate: '2026-03-24' }];
    runtime.showConfirmDialog.mockImplementationOnce(async () => {
      (runtime.state.importedData as {supplements: RawSupplementFixture[]}).supplements[0]!.note = 'Concurrent edit';
      return true;
    });
    await importDataJSON(new File([JSON.stringify({ entries: [], supplements: [{ id: 'stable', name: 'Changed', startDate: '2026-03-24' }] })], 'conflict.json'));
    expect((runtime.state.importedData as {supplements: RawSupplementFixture[]}).supplements[0]).toMatchObject({ name: 'TMG', note: 'Concurrent edit' });
    expect(runtime.saveImportedData).not.toHaveBeenCalled();
  });

  it('preserves concurrent stored edits while a bundle conflict is open', async () => {
    const saved = { supplements: [{ id: 'stable', name: 'TMG', startDate: '2026-03-24' }] };
    localStorage.setItem('profile-1:imported', JSON.stringify(saved));
    runtime.showConfirmDialog.mockImplementationOnce(async () => {
      localStorage.setItem('profile-1:imported', JSON.stringify({ ...saved, note: 'Concurrent edit' }));
      return true;
    });
    await importDataJSON(new File([JSON.stringify({ type: 'database', profiles: [{ id: 'profile-1', data: { supplements: [{ ...saved.supplements[0], name: 'Changed' }] } }] })], 'bundle.json'));
    expect(runtime.saveImportedDataForProfile).not.toHaveBeenCalled();
    expect((JSON.parse as (text: string | null) => unknown)(localStorage.getItem('profile-1:imported'))).toEqual({ ...saved, note: 'Concurrent edit' });
  });

  it('preflights every bundle conflict before saving or updating any profile', async () => {
    runtime.getProfiles.mockReturnValueOnce([{ id: 'profile-1', name: 'First' }, { id: 'profile-2', name: 'Second' }]);
    const first = { supplements: [{ id: 'a', name: 'First regimen', startDate: '2026-03-24' }] };
    const second = { supplements: [{ id: 'b', name: 'Second regimen', startDate: '2026-03-24' }] };
    localStorage.setItem('profile-1:imported', JSON.stringify(first));
    localStorage.setItem('profile-2:imported', JSON.stringify(second));
    runtime.showConfirmDialog.mockResolvedValueOnce(true).mockImplementationOnce(async () => {
      localStorage.setItem('profile-2:imported', JSON.stringify({ ...second, note: 'Concurrent change' }));
      return true;
    });
    const profiles = [first, second].map((data, index) => ({ id: `profile-${index + 1}`, name: 'Renamed profile', data: { supplements: [{ ...data.supplements[0], note: 'Imported change' }] } }));
    await importDataJSON(new File([JSON.stringify({ type: 'database', profiles })], 'two-profiles.json'));
    expect(runtime.saveImportedDataForProfile).not.toHaveBeenCalled();
    const { updateProfileMeta, createProfile } = await import('../js/profile.js');
    expect(updateProfileMeta).not.toHaveBeenCalled();
    expect(createProfile).not.toHaveBeenCalled();
    expect((JSON.parse as (text: string | null) => unknown)(localStorage.getItem('profile-1:imported'))).toEqual(first);
    expect((JSON.parse as (text: string | null) => unknown)(localStorage.getItem('profile-2:imported'))).toEqual({ ...second, note: 'Concurrent change' });
  });

  it('keeps an unlinked daily regimen intact without inventing historical dose dates', async () => {
    const tmg = { id: 'sm_unlinked', name: 'Unlinked TMG', startDate: '2026-03-24', timesPerDay: 1,
      ingredients: [{ name: 'TMG', amount: '500 mg' }], periods: [{ start: '2026-03-24', end: null }],
      sourceUrl: 'javascript:alert(1)',
    };
    await importDataJSON(new File([JSON.stringify({ entries: [{ date: '2026-05-22', markers: { 'biochemistry.glucose': 4.56 } }], supplements: [tmg] })], 'unlinked.json'));
    const imported = (runtime.state.importedData as {supplements: RawSupplementFixture[]}).supplements.find(s => s.id === tmg.id);
    expect(imported!.timesPerDay).toBe(1);
    expect(imported!.periods).toEqual(tmg.periods);
    expect(imported!.sourceUrl).toBeUndefined();
    const { prepareTherapyHistory, therapyExposure } = await import('../js/therapy-correlations.js');
    const history = (prepareTherapyHistory as (input: unknown, date: Parameters<typeof prepareTherapyHistory>[1]) => ReturnType<typeof prepareTherapyHistory>)(imported, '2026-09-28');
    expect(history.currentDoses[0]!.value).toBe(500);
    expect(therapyExposure(history, '2026-09-28').value).toBeNull();
  });

});
