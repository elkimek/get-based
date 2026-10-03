import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { buildFullBackupSnapshot, parseBackupSnapshot, serializeBackupSnapshot } from '../js/backup.js';
import { restoreCycleBackup } from '../js/backup-cycle.js';
import {
  CYCLE_IMPORT_ADAPTERS,
  buildCycleImportPlan,
  commitCycleImport,
  deleteCycleImportFromProfile,
  isCycleImportFile,
  parseAppleHealthCycleXml,
  parseCycleImportFile,
  renderCycleImportPickerControls,
  renderCycleImportSummarySection,
} from '../js/cycle-import.js';
import {
  renderCycleImportPickerControls as renderColdCycleImportPickerControls,
  renderCycleImportSummarySection as renderColdCycleImportSummarySection,
} from '../js/cycle-import-loader.js';
import { createDefaultProfileData } from '../js/profile.js';
import { state } from '../js/state.js';
import {
  clearCycleImport,
  countCycleSource,
  deleteCycleDB,
  getAllCycleObservationsRaw,
  getAllCycleImportMetaRaw,
  getCycleImportMeta,
  getCycleImportMetaRaw,
  getCycleObservationRange,
  saveCycleImportMeta,
  upsertCycleObservationBatch,
} from '../js/cycle-store.js';

const cycleFixture = (name: string) => readFileSync(new URL(`./spike-fixtures/${name}`, import.meta.url), 'utf8');
const APPLE_HEALTH_XML = cycleFixture('cycle-apple-health.xml');
const CLUE_BACKUP: unknown = JSON.parse(cycleFixture('cycle-clue-backup.json'));

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  sessionStorage.clear();
  state.currentProfile = 'default';
  (state as { importedData: unknown }).importedData = createDefaultProfileData();
  state.profileSex = null;
  (state as { profiles: unknown }).profiles = null;
});

describe('cycle import phase 1 primitives', () => {
  it('encrypts cycle observation details and import metadata at rest', async () => {
    const profileId = 'cycle-encryption-test';
    const cryptoModule = await import('../js/crypto.js');
    const previousTestFlag = (globalThis as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST;
    (globalThis as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST = true;
    localStorage.setItem('labcharts-encryption-enabled', 'true');

    try {
      await cryptoModule._setTestSessionKey('cycle-import-test-passphrase');
      await upsertCycleObservationBatch(profileId, [{
        source: 'drip',
        importId: 'encrypted-import',
        date: '2026-01-01',
        bleeding: { flow: 'heavy' },
        note: 'private observation',
      }]);
      await saveCycleImportMeta(profileId, {
        importId: 'encrypted-import',
        source: 'drip',
        sourceFile: 'private-cycle-export.csv',
        observationCount: 1,
      });

      const [rawRow] = await getAllCycleObservationsRaw(profileId);
      const rawMeta = await getCycleImportMetaRaw(profileId, 'encrypted-import');
      expect(rawRow).toMatchObject({ source: 'drip', date: '2026-01-01', importId: 'encrypted-import' });
      expect(rawRow).not.toHaveProperty('note');
      expect(rawRow!._payload?._enc).toBe('v1');
      expect(rawMeta).toMatchObject({ importId: 'encrypted-import', source: 'drip' });
      expect(rawMeta).not.toHaveProperty('sourceFile');
      expect(rawMeta!._payload?._enc).toBe('v1');

      const [readableRow] = await getCycleObservationRange(profileId, 'drip', '2026-01-01', '2026-01-01');
      const readableMeta = await getCycleImportMeta(profileId, 'encrypted-import');
      expect(readableRow!.note).toBe('private observation');
      expect(readableMeta).toMatchObject({
        sourceFile: 'private-cycle-export.csv',
        observationCount: 1,
      });
    } finally {
      await cryptoModule._setTestSessionKey(null).catch(() => {});
      localStorage.removeItem('labcharts-encryption-enabled');
      if (previousTestFlag === undefined) delete (globalThis as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST;
      else (globalThis as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST = previousTestFlag;
      await deleteCycleDB(profileId).catch(() => {});
    }
  });

  it('fails closed when wearable encryption is enabled without an unlocked provider', async () => {
    const profileId = 'wearable-encryption-provider-locked';
    const wearableStore = await import('../js/wearables-store.js');
    const previous = wearableStore.configureWearablesStoreCrypto({
      getEncryptionEnabled: () => true,
      encryptObject: async () => null,
      isEncryptedObject: value => (value as {_enc?: unknown} | null | undefined)?._enc === 'v1',
      decryptObject: async () => null,
    });

    try {
      await expect(wearableStore.upsertDaily(profileId, {
        source: 'manual',
        date: '2026-01-01',
        rhr: 61,
      })).rejects.toMatchObject({ code: 'session-locked' });
      expect(await wearableStore.getAllDailyRaw(profileId)).toEqual([]);
    } finally {
      wearableStore.configureWearablesStoreCrypto(previous);
      await wearableStore.deleteWearablesDB(profileId).catch(() => {});
    }
  });

  it('migrates cycle, wearable, blob, and hyphenated-profile storage across key changes', async () => {
    const profileId = 'cycle-encryption-migration-profile';
    const importedKey = `labcharts-${profileId}-imported`;
    const chatKey = `labcharts-${profileId}-chat`;
    const cryptoModule = await import('../js/crypto.js');
    const wearableStore = await import('../js/wearables-store.js');
    const blobStore = await import('../js/blob-storage.js');
    const previousTestFlag = (globalThis as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST;
    (globalThis as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST = true;
    state.currentProfile = profileId;
    (state as { profiles: unknown }).profiles = [{ id: profileId, name: 'Migration Profile', sex: 'female' }];
    localStorage.setItem('labcharts-active-profile', profileId);
    localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));
    localStorage.setItem(chatKey, JSON.stringify([{ role: 'user', content: 'private' }]));
    await blobStore.setBlob(importedKey, JSON.stringify({ menstrualCycle: { periods: [{ startDate: '2026-01-01' }] } }));
    await wearableStore.upsertDaily(profileId, { source: 'manual', date: '2026-01-01', rhr: 61 });
    await upsertCycleObservationBatch(profileId, [{
      source: 'clue', importId: 'migration-import', date: '2026-01-01', note: 'private cycle note', bleeding: { flow: 'heavy' },
    }]);
    await saveCycleImportMeta(profileId, {
      importId: 'migration-import', source: 'clue', sourceFile: 'ClueBackup.json', observationCount: 1,
    });
    localStorage.setItem('labcharts-encryption-enabled', 'true');

    try {
      await cryptoModule._setTestSessionKey('old-migration-passphrase');
      await cryptoModule._migrateAllStorageForTest('encrypted');
      const encryptedCycle = (await getAllCycleObservationsRaw(profileId))[0];
      const encryptedMeta = (await getAllCycleImportMetaRaw(profileId))[0];
      const encryptedWearable = (await wearableStore.getAllDailyRaw(profileId))[0];
      const oldCiphertext = Array.from(encryptedCycle!._payload!.ct as ArrayLike<number>).join(',');
      expect(cryptoModule.isEncryptedObject(encryptedCycle!._payload)).toBe(true);
      expect(cryptoModule.isEncryptedObject(encryptedMeta!._payload)).toBe(true);
      expect(cryptoModule.isEncryptedObject(encryptedWearable!._payload)).toBe(true);
      expect(localStorage.getItem(chatKey)).toMatch(/^v1:/);
      expect(await blobStore.getBlob(importedKey)).toMatch(/^v1:/);

      await cryptoModule._migrateAllStorageForTest('plain');
      expect((await getAllCycleObservationsRaw(profileId))[0]!.note).toBe('private cycle note');
      expect((await getAllCycleImportMetaRaw(profileId))[0]!.sourceFile).toBe('ClueBackup.json');
      expect((await wearableStore.getAllDailyRaw(profileId))[0]!.rhr).toBe(61);
      expect((JSON.parse as (text: unknown) => unknown)(await blobStore.getBlob(importedKey))).toHaveProperty('menstrualCycle');

      await cryptoModule._setTestSessionKey('new-migration-passphrase');
      await cryptoModule._migrateAllStorageForTest('encrypted');
      const rotatedCycle = (await getAllCycleObservationsRaw(profileId))[0];
      expect(Array.from(rotatedCycle!._payload!.ct as ArrayLike<number>).join(',')).not.toBe(oldCiphertext);
      expect((await getCycleObservationRange(profileId, 'clue', '2026-01-01', '2026-01-01'))[0]!.note).toBe('private cycle note');

      await cryptoModule._migrateAllStorageForTest('plain');
      expect((await getAllCycleObservationsRaw(profileId))[0]).not.toHaveProperty('_payload');
    } finally {
      await cryptoModule._setTestSessionKey(null).catch(() => {});
      localStorage.removeItem('labcharts-encryption-enabled');
      localStorage.removeItem(chatKey);
      await blobStore.deleteBlob(importedKey);
      await deleteCycleDB(profileId).catch(() => {});
      await wearableStore.deleteWearablesDB(profileId).catch(() => {});
      if (previousTestFlag === undefined) delete (globalThis as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST;
      else (globalThis as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST = previousTestFlag;
    }
  });

  it('routes Clue JSON through the cycle adapter without claiming getbased backups', async () => {
    const clueFile = new File([JSON.stringify({
      data: [{ day: '2026-01-01T00:00:00.000Z', period: 'medium' }],
    })], 'ClueBackup.json', { type: 'application/json' });
    const backupFile = new File([JSON.stringify({
      version: 2,
      type: 'database',
      profiles: [],
    })], 'getbased-backup.json', { type: 'application/json' });

    expect(CYCLE_IMPORT_ADAPTERS.map(adapter => adapter.id)).toEqual([
      'apple_health', 'clue', 'natural_cycles', 'drip',
    ]);
    expect(await isCycleImportFile(clueFile)).toBe(true);
    expect(await isCycleImportFile(backupFile)).toBe(false);
    expect(await parseCycleImportFile(clueFile)).toMatchObject({
      source: 'clue',
      sourceFile: 'ClueBackup.json',
    });
  });

  it('parses Apple Health cycle records without turning intermenstrual spotting into a period', () => {
    const parsed = parseAppleHealthCycleXml(APPLE_HEALTH_XML, 'export.xml');

    expect(parsed!.source).toBe('apple_health');
    expect(parsed!.observations).toHaveLength(5);
    expect(parsed!.observations.find(row => row.date === '2026-03-01')!.bleeding).toMatchObject({
      flow: 'light',
      excluded: false,
      intermenstrual: false,
    });
    expect(parsed!.observations.find(row => row.date === '2026-03-10')!.bleeding).toMatchObject({
      flow: 'spotting',
      excluded: true,
      intermenstrual: true,
    });
    expect(parsed!.observations.find(row => row.date === '2026-03-14')!.ovulationTest).toBe('positive');
    expect(parsed!.observations.find(row => row.date === '2026-03-13')!.cervicalMucus!.quality).toBe('eggwhite');
    expect(parsed!.periods).toHaveLength(1);
    expect(parsed!.periods[0]).toMatchObject({
      startDate: '2026-03-01',
      endDate: '2026-03-02',
      flow: 'heavy',
      source: 'apple_health',
    });
  });

  it('builds conflict plans for keeping or replacing overlapping periods', () => {
    const parsed = {
      periods: [
        { startDate: '2026-04-01', endDate: '2026-04-03', flow: 'heavy', source: 'drip' },
        { startDate: '2026-05-01', endDate: '2026-05-04', flow: 'moderate', source: 'drip' },
      ],
    };
    const existing = {
      periods: [
        { startDate: '2026-04-02', endDate: '2026-04-05', flow: 'light', source: 'manual' },
      ],
    };

    const keep = (buildCycleImportPlan as unknown as (input: typeof parsed, current: typeof existing, mode: string) => ReturnType<typeof buildCycleImportPlan>)(parsed, existing, 'keep-existing');
    expect(keep.conflicts).toHaveLength(1);
    expect(keep.importedToApply.map(period => period.startDate)).toEqual(['2026-05-01']);
    expect(keep.mergedPeriods.map(period => period.startDate)).toEqual(['2026-04-02', '2026-05-01']);

    const replace = (buildCycleImportPlan as unknown as (input: typeof parsed, current: typeof existing, mode: string) => ReturnType<typeof buildCycleImportPlan>)(parsed, existing, 'replace-overlapping');
    expect(replace.mergedPeriods.map(period => period.startDate)).toEqual(['2026-04-01', '2026-05-01']);
  });

  it('commits cycle imports into a cycle-visible profile context', async () => {
    const profileId = 'cycle-commit-test';
    state.currentProfile = profileId;
    localStorage.setItem('labcharts-active-profile', profileId);
    localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: profileId, name: 'Cycle Commit', sex: null }]));

    const result = await commitCycleImport({
      source: 'drip',
      importId: 'cycle-commit-import',
      sourceFile: 'drip.csv',
      observations: [],
      periods: [
        { startDate: '2026-05-01', endDate: '2026-05-04', flow: 'moderate', source: 'drip' },
      ],
    });

    const profiles = JSON.parse(localStorage.getItem('labcharts-profiles') || '[]') as {id?: unknown;sex?: unknown}[];
    expect(result.periods).toBe(1);
    expect(state.profileSex).toBe('female');
    expect(profiles.find(p => p.id === profileId)?.sex).toBe('female');
    expect(state.importedData.menstrualCycle!.periods).toHaveLength(1);

    await deleteCycleDB(profileId).catch(() => {});
  });

  it('requires approval before changing an explicitly male profile', async () => {
    const profileId = 'cycle-profile-sex-confirmation';
    state.currentProfile = profileId;
    state.profileSex = 'male';
    (state as { profiles: unknown }).profiles = [{ id: profileId, name: 'Explicit Male', sex: 'male' }];
    localStorage.setItem('labcharts-active-profile', profileId);
    localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));
    const parsed = {
      source: 'drip',
      importId: 'profile-sex-import',
      sourceFile: 'drip.csv',
      observations: [{ source: 'drip', date: '2026-05-01', bleeding: { flow: 'moderate' } }],
      periods: [{ startDate: '2026-05-01', endDate: '2026-05-01', flow: 'moderate', source: 'drip' }],
    };

    await expect(commitCycleImport(parsed)).rejects.toMatchObject({ code: 'profile-sex-confirmation-required' });
    expect(state.profileSex).toBe('male');
    expect(await getAllCycleObservationsRaw(profileId)).toHaveLength(0);

    await commitCycleImport(parsed, { allowProfileSexChange: true });
    expect(state.profileSex).toBe('female');
    expect(state.profiles![0].sex).toBe('female');
    await deleteCycleDB(profileId).catch(() => {});
  });

  it('preserves an earlier same-day batch when a re-import is removed', async () => {
    const profileId = 'cycle-reimport-preservation';
    state.currentProfile = profileId;
    state.profileSex = 'female';
    (state as { profiles: unknown }).profiles = [{ id: profileId, name: 'Repeated import', sex: 'female' }];
    localStorage.setItem('labcharts-active-profile', profileId);
    localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));
    const parsed = (importId: string, flow: string) => ({
      source: 'drip',
      importId,
      sourceFile: `${importId}.csv`,
      observations: [{ source: 'drip', date: '2026-05-01', bleeding: { flow }, note: importId }],
      periods: [{ startDate: '2026-05-01', endDate: '2026-05-01', flow, source: 'drip', importId }],
    });

    await commitCycleImport(parsed('import-a', 'moderate'));
    await commitCycleImport(parsed('import-b', 'heavy'));
    expect((await getAllCycleObservationsRaw(profileId)).map(row => row.importId).sort()).toEqual(['import-a', 'import-b']);
    expect(state.importedData.menstrualCycle!.coverage.sources.drip.importIds).toEqual(['import-a', 'import-b']);
    expect(renderCycleImportSummarySection(state.importedData.menstrualCycle)).toContain('data-cycle-import-import-id="import-b"');
    expect(renderColdCycleImportPickerControls()).toBe(renderCycleImportPickerControls());
    expect(renderColdCycleImportSummarySection(state.importedData.menstrualCycle))
      .toBe(renderCycleImportSummarySection(state.importedData.menstrualCycle));

    await deleteCycleImportFromProfile('import-b');
    expect(await getCycleObservationRange(profileId, 'drip', '2026-05-01', '2026-05-01')).toEqual([
      expect.objectContaining({ importId: 'import-a', note: 'import-a' }),
    ]);
    expect(state.importedData.menstrualCycle!.periods).toEqual([
      expect.objectContaining({ importId: 'import-a', flow: 'moderate' }),
    ]);
    expect(state.importedData.menstrualCycle!.coverage.sources.drip.importIds).toEqual(['import-a']);
    await deleteCycleDB(profileId);
  });

  it('deletes raw-only import batches and clears stale compact coverage', async () => {
    const profileId = 'cycle-raw-only-delete-test';
    state.currentProfile = profileId;
    localStorage.setItem('labcharts-active-profile', profileId);
    localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: profileId, name: 'Raw Cycle', sex: null }]));

    await commitCycleImport({
      source: 'drip',
      importId: 'raw-only-import',
      sourceFile: 'drip.csv',
      detectedRange: { firstDate: '2026-05-12', lastDate: '2026-05-12' },
      observations: [{ source: 'drip', date: '2026-05-12', ovulationTest: 'positive' }],
      periods: [],
    });

    expect(state.importedData.menstrualCycle!.coverage).toMatchObject({
      firstDate: '2026-05-12',
      lastDate: '2026-05-12',
      observationCount: 1,
    });
    expect(await deleteCycleImportFromProfile('raw-only-import')).toBe(true);
    expect(await countCycleSource(profileId, 'drip')).toBe(0);
    expect(state.importedData.menstrualCycle!.coverage).toMatchObject({
      firstDate: null,
      lastDate: null,
      observationCount: 0,
      sources: {},
    });

    await deleteCycleDB(profileId).catch(() => {});
  });

  it('includes all raw local cycle observations in full backups without source or date limits', async () => {
    const profileId = 'cycle-backup-test';
    await deleteCycleDB(profileId).catch(() => {});
    localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: profileId, name: 'Cycle Backup' }]));
    await upsertCycleObservationBatch(profileId, [
      { source: 'drip', importId: 'backup-imp', date: '2026-06-01', bleeding: { flow: 'moderate' } },
      { source: 'drip', importId: 'backup-imp', date: '2026-06-02', bleeding: { flow: 'heavy' } },
      { source: 'future_cycle_app', importId: 'backup-old', date: '1998-12-31', note: 'older history' },
    ]);
    await saveCycleImportMeta(profileId, {
      importId: 'backup-imp',
      source: 'drip',
      sourceFile: 'drip-backup.csv',
      observationCount: 2,
    });

    const snapshot = await buildFullBackupSnapshot();
    expect(snapshot!.cycleIDB![profileId]!.drip).toHaveLength(2);
    expect(snapshot!.cycleIDB![profileId]!.drip![0]).toMatchObject({
      source: 'drip',
      importId: 'backup-imp',
      date: '2026-06-01',
    });
    expect(snapshot!.cycleIDB![profileId]!.future_cycle_app).toEqual([
      expect.objectContaining({ date: '1998-12-31', note: 'older history' }),
    ]);
    expect(snapshot!.cycleImportMeta![profileId]).toEqual([
      expect.objectContaining({ importId: 'backup-imp', sourceFile: 'drip-backup.csv' }),
    ]);

    await deleteCycleDB(profileId).catch(() => {});
  });

  it('round-trips encrypted cycle rows and import metadata through backup JSON', async () => {
    const profileId = 'cycle-encrypted-backup-roundtrip';
    const cryptoModule = await import('../js/crypto.js');
    const previousTestFlag = (globalThis as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST;
    (globalThis as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST = true;
    localStorage.setItem('labcharts-encryption-enabled', 'true');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: profileId, name: 'Encrypted Backup' }]));
    try {
      await cryptoModule._setTestSessionKey('backup-roundtrip-passphrase');
      await upsertCycleObservationBatch(profileId, [{
        source: 'clue', importId: 'encrypted-backup-import', date: '2026-07-01', note: 'private note', bleeding: { flow: 'heavy' },
      }]);
      await saveCycleImportMeta(profileId, {
        importId: 'encrypted-backup-import', source: 'clue', sourceFile: 'ClueBackup.json', observationCount: 1,
      });

      const restored = (parseBackupSnapshot as (text: unknown) => {cycleIDB: Record<string, Record<string, { _payload: {_enc?: unknown;iv: object;ct: object} }[]>>;cycleImportMeta: Record<string, {_payload?: unknown}[]>})(serializeBackupSnapshot(await buildFullBackupSnapshot())!);
      const restoredRow = restored.cycleIDB[profileId]!.clue![0];
      const restoredMeta = restored.cycleImportMeta[profileId]![0];
      expect(cryptoModule.isEncryptedObject(restoredRow!._payload)).toBe(true);
      expect(cryptoModule.isEncryptedObject(restoredMeta!._payload)).toBe(true);
      const legacyEnvelope = parseBackupSnapshot(JSON.stringify({
        _enc: 'v1', iv: Object.assign({}, restoredRow!._payload.iv), ct: Object.assign({}, restoredRow!._payload.ct),
      }));
      expect(cryptoModule.isEncryptedObject(legacyEnvelope)).toBe(true);

      await deleteCycleDB(profileId);
      await restoreCycleBackup(restored.cycleIDB, restored.cycleImportMeta);
      expect((await getCycleObservationRange(profileId, 'clue', '2026-07-01', '2026-07-01'))[0]!.note).toBe('private note');
      expect(await getCycleImportMeta(profileId, 'encrypted-backup-import')).toMatchObject({ sourceFile: 'ClueBackup.json' });
      expect(await getAllCycleImportMetaRaw(profileId)).toHaveLength(1);
    } finally {
      await cryptoModule._setTestSessionKey(null).catch(() => {});
      localStorage.removeItem('labcharts-encryption-enabled');
      if (previousTestFlag === undefined) delete (globalThis as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST;
      else (globalThis as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST = previousTestFlag;
      await deleteCycleDB(profileId).catch(() => {});
    }
  });
});

export type PreservedOriginalImportSignatures = [typeof clearCycleImport, typeof CLUE_BACKUP];
