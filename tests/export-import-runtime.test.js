// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  clearDemoLoadingProfile: vi.fn(),
  encryptedGetItem: vi.fn(),
  encryptedSetItem: vi.fn(),
  getEncryptionEnabled: vi.fn(() => false),
  getProfiles: vi.fn(() => [{ id: 'profile-1', name: 'Primary' }]),
  refreshImportRuntimeShell: vi.fn(async () => {}),
  saveImportedData: vi.fn(),
  setSelectedNodeUrl: vi.fn(),
  showNotification: vi.fn(),
  state: { currentProfile: 'profile-1', importedData: {} },
}));

vi.mock('../js/state.js', () => ({ state: runtime.state }));
vi.mock('../js/utils.js', () => ({
  isDebugMode: () => false,
  showNotification: runtime.showNotification,
}));
vi.mock('../js/data.js', () => ({ saveImportedData: runtime.saveImportedData }));
vi.mock('../js/profile.js', () => ({
  createProfile: vi.fn(),
  getProfiles: runtime.getProfiles,
  loadProfile: vi.fn(async () => {}),
  migrateProfileData: vi.fn(),
  profileStorageKey: (id, kind) => `${id}:${kind}`,
  updateProfileMeta: vi.fn(),
}));
vi.mock('../js/crypto.js', () => ({
  encryptedGetItem: runtime.encryptedGetItem,
  encryptedSetItem: runtime.encryptedSetItem,
  getEncryptionEnabled: runtime.getEncryptionEnabled,
}));
vi.mock('../js/data-merge.js', () => ({
  appendImportedArrayItem(data, field, item) {
    if (!Array.isArray(data[field])) data[field] = [];
    data[field].push(item);
  },
  clearTombstone: vi.fn(),
  ensureImportedArray(data, field) {
    if (!Array.isArray(data[field])) data[field] = [];
    return data[field];
  },
  replaceImportedArrayItem(data, field, index, item) {
    data[field][index] = item;
  },
  sortImportedArray(data, field, compare) {
    data[field].sort(compare);
  },
  trimImportedArray(data, field, limit) {
    data[field] = data[field].slice(-limit);
  },
}));
vi.mock('../js/lab-entry-mutations.js', () => ({
  findOrCreateLabEntry(data, date) {
    let entry = data.entries.find(item => item.date === date);
    if (!entry) {
      entry = { date, markers: {} };
      data.entries.push(entry);
    }
    return entry;
  },
}));
vi.mock('../js/lab-entry.js', () => ({
  setLabEntryMarker(entry, key, value) {
    entry.markers[key] = value;
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
    expect(JSON.parse(localStorage.getItem('labcharts-profile-1-chatPersonalityCustom')))
      .toEqual([expect.objectContaining({
        id: 'custom_portable',
        promptText: 'Use a calm systems-thinking style.',
        personaAgreement: expect.objectContaining({ accepted: true, version: 1 }),
      })]);
    expect(runtime.refreshImportRuntimeShell).toHaveBeenCalledWith({ chat: true });
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

    const imported = runtime.state.importedData;
    expect(imported.entries).toHaveLength(1);
    expect(imported.entries[0].markers).toEqual({
      glucose: 90,
      insulin: 5,
      triglycerides: 80,
    });
    expect(imported.entries[0].sourceFiles).toEqual(['panel-a.pdf', 'panel-b.pdf']);
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
    expect(JSON.parse(localStorage.getItem('labcharts-profile-1-chat-threads'))).toHaveLength(2);
    const restoredMessages = JSON.parse(localStorage.getItem('labcharts-profile-1-chat-t_thread-new'));
    expect(restoredMessages[0].thumbnails).toEqual([]);
    expect(restoredMessages[0].imageCount).toBe(0);
    expect(JSON.parse(localStorage.getItem('labcharts-profile-1-chatPersonalityCustom'))[0])
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
});
