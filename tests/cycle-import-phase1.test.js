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
  parseClueCycleJson,
  parseCycleImportFile,
  parseDripCycleCsv,
  parseNaturalCyclesCsv,
  parseNaturalCyclesCsvBundle,
} from '../js/cycle-import.js';
import {
  recentCyclePeriods,
  stitchCyclePeriodsFromObservations,
  upgradeMenstrualCycleProfile,
} from '../js/cycle-summary.js';
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

const cycleFixture = name => readFileSync(new URL(`./spike-fixtures/${name}`, import.meta.url), 'utf8');
const APPLE_HEALTH_XML = cycleFixture('cycle-apple-health.xml');
const DRIP_NATIVE_CSV = cycleFixture('cycle-drip-native.csv');
const NATURAL_CYCLES_CSV = cycleFixture('cycle-natural-cycles.csv');
const CLUE_BACKUP = JSON.parse(cycleFixture('cycle-clue-backup.json'));

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  sessionStorage.clear();
  state.currentProfile = 'default';
  state.importedData = createDefaultProfileData();
  state.profileSex = null;
  state.profiles = null;
});

describe('cycle import phase 1 primitives', () => {
  it('stitches bleeding observations into compact period episodes', () => {
    const periods = stitchCyclePeriodsFromObservations([
      { source: 'drip', date: '2026-01-01', bleeding: { flow: 'light' }, symptoms: ['Cramps'] },
      { source: 'drip', date: '2026-01-02', bleeding: { flow: 'heavy' }, symptoms: ['Fatigue'] },
      { source: 'drip', date: '2026-01-03', bleeding: { flow: 'heavy' }, symptoms: ['Cramps'] },
      { source: 'drip', date: '2026-01-07', bleeding: { flow: 'moderate', excluded: true } },
      { source: 'drip', date: '2026-02-01', bleeding: { flow: 'moderate' } },
    ], {
      source: 'drip',
      importId: 'drip-2026-07-08',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });

    expect(periods).toHaveLength(2);
    expect(periods[0]).toMatchObject({
      startDate: '2026-01-01',
      endDate: '2026-01-03',
      flow: 'heavy',
      source: 'drip',
      confidence: 'observed',
      importId: 'drip-2026-07-08',
    });
    expect(periods[0].symptoms).toEqual(['Cramps', 'Fatigue']);
    expect(periods[1].startDate).toBe('2026-02-01');
  });

  it('keeps spotting raw without using it as cycle day one', () => {
    const periods = stitchCyclePeriodsFromObservations([
      { source: 'drip', date: '2026-01-01', bleeding: { flow: 'spotting' } },
      { source: 'drip', date: '2026-01-02', bleeding: { flow: 'light' } },
      { source: 'drip', date: '2026-01-03', bleeding: { flow: 'spotting' } },
      { source: 'drip', date: '2026-02-01', bleeding: { flow: 'spotting' } },
    ], { source: 'drip' });

    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({
      startDate: '2026-01-02',
      endDate: '2026-01-02',
      flow: 'light',
    });
  });

  it('upgrades legacy menstrualCycle data into a compact schema v2 summary', () => {
    const endDateFor = (startDate) => {
      const d = new Date(startDate + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 4);
      return d.toISOString().slice(0, 10);
    };
    const periods = [
      '2025-07-01', '2025-07-30', '2025-08-28', '2025-09-27',
      '2025-10-27', '2025-11-26', '2025-12-26', '2026-01-25',
      '2026-02-24', '2026-03-27', '2026-04-27', '2026-05-28',
      '2026-06-29',
    ].map((startDate, idx) => ({
      startDate,
      endDate: endDateFor(startDate),
      flow: idx % 5 === 0 ? 'heavy' : 'moderate',
      symptoms: ['Cramps'],
    }));

    const upgraded = upgradeMenstrualCycleProfile({
      cycleLength: 28,
      periodLength: 5,
      regularity: 'regular',
      flow: 'moderate',
      periods,
    }, { now: '2026-07-08T00:00:00.000Z' });

    expect(upgraded.schemaVersion).toBe(2);
    expect(upgraded.coverage.periodCount).toBe(13);
    expect(upgraded.coverage.observationCount).toBe(0);
    expect(upgraded.coverage.sources.manual.periods).toBe(13);
    expect(upgradeMenstrualCycleProfile(upgraded).coverage.sources.manual.periods).toBe(13);
    expect(upgraded.historySummary.recent12.avgCycle).toBeGreaterThanOrEqual(29);
    expect(upgraded.historySummary.recent12.range).toEqual([29, 32]);
    expect(upgraded.historySummary.allTime.periodCount).toBe(13);
    expect(recentCyclePeriods(upgraded, 12)).toHaveLength(12);
    expect(JSON.stringify(upgraded)).not.toContain('daily-observations');
  });

  it('stores raw cycle observations locally by source and import id', async () => {
    const profileId = 'cycle-store-test';
    await deleteCycleDB(profileId).catch(() => {});

    await upsertCycleObservationBatch(profileId, [
      { source: 'drip', importId: 'imp1', date: '2026-01-01', bleeding: { flow: 'light' }, note: 'local note' },
      { source: 'drip', importId: 'imp1', date: '2026-01-02', bleeding: { flow: 'heavy' } },
      { source: 'apple_health', importId: 'imp2', date: '2026-01-02', bleeding: { flow: 'moderate' } },
    ]);
    await saveCycleImportMeta(profileId, {
      importId: 'imp1',
      source: 'drip',
      sourceFile: 'drip.csv',
      observationCount: 2,
    });

    const dripRows = await getCycleObservationRange(profileId, 'drip', '2026-01-01', '2026-01-31');
    expect(dripRows).toHaveLength(2);
    expect(dripRows[0].note).toBe('local note');
    expect(await countCycleSource(profileId, 'drip')).toBe(2);
    expect(await getCycleImportMeta(profileId, 'imp1')).toMatchObject({ source: 'drip', observationCount: 2 });

    await clearCycleImport(profileId, 'imp1');
    expect(await countCycleSource(profileId, 'drip')).toBe(0);
    expect(await countCycleSource(profileId, 'apple_health')).toBe(1);
    expect(await getCycleImportMeta(profileId, 'imp1')).toBeNull();

    await deleteCycleDB(profileId).catch(() => {});
  });

  it('encrypts cycle observation details and import metadata at rest', async () => {
    const profileId = 'cycle-encryption-test';
    const cryptoModule = await import('../js/crypto.js');
    const previousTestFlag = globalThis.__WEARABLES_TEST;
    globalThis.__WEARABLES_TEST = true;
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
      expect(rawRow._payload?._enc).toBe('v1');
      expect(rawMeta).toMatchObject({ importId: 'encrypted-import', source: 'drip' });
      expect(rawMeta).not.toHaveProperty('sourceFile');
      expect(rawMeta._payload?._enc).toBe('v1');

      const [readableRow] = await getCycleObservationRange(profileId, 'drip', '2026-01-01', '2026-01-01');
      const readableMeta = await getCycleImportMeta(profileId, 'encrypted-import');
      expect(readableRow.note).toBe('private observation');
      expect(readableMeta).toMatchObject({
        sourceFile: 'private-cycle-export.csv',
        observationCount: 1,
      });
    } finally {
      await cryptoModule._setTestSessionKey(null).catch(() => {});
      localStorage.removeItem('labcharts-encryption-enabled');
      if (previousTestFlag === undefined) delete globalThis.__WEARABLES_TEST;
      else globalThis.__WEARABLES_TEST = previousTestFlag;
      await deleteCycleDB(profileId).catch(() => {});
    }
  });

  it('migrates cycle, wearable, blob, and hyphenated-profile storage across key changes', async () => {
    const profileId = 'cycle-encryption-migration-profile';
    const importedKey = `labcharts-${profileId}-imported`;
    const chatKey = `labcharts-${profileId}-chat`;
    const cryptoModule = await import('../js/crypto.js');
    const wearableStore = await import('../js/wearables-store.js');
    const blobStore = await import('../js/blob-storage.js');
    const previousTestFlag = globalThis.__WEARABLES_TEST;
    globalThis.__WEARABLES_TEST = true;
    state.currentProfile = profileId;
    state.profiles = [{ id: profileId, name: 'Migration Profile', sex: 'female' }];
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
      const oldCiphertext = Array.from(encryptedCycle._payload.ct).join(',');
      expect(cryptoModule.isEncryptedObject(encryptedCycle._payload)).toBe(true);
      expect(cryptoModule.isEncryptedObject(encryptedMeta._payload)).toBe(true);
      expect(cryptoModule.isEncryptedObject(encryptedWearable._payload)).toBe(true);
      expect(localStorage.getItem(chatKey)).toMatch(/^v1:/);
      expect(await blobStore.getBlob(importedKey)).toMatch(/^v1:/);

      await cryptoModule._migrateAllStorageForTest('plain');
      expect((await getAllCycleObservationsRaw(profileId))[0].note).toBe('private cycle note');
      expect((await getAllCycleImportMetaRaw(profileId))[0].sourceFile).toBe('ClueBackup.json');
      expect((await wearableStore.getAllDailyRaw(profileId))[0].rhr).toBe(61);
      expect(JSON.parse(await blobStore.getBlob(importedKey))).toHaveProperty('menstrualCycle');

      await cryptoModule._setTestSessionKey('new-migration-passphrase');
      await cryptoModule._migrateAllStorageForTest('encrypted');
      const rotatedCycle = (await getAllCycleObservationsRaw(profileId))[0];
      expect(Array.from(rotatedCycle._payload.ct).join(',')).not.toBe(oldCiphertext);
      expect((await getCycleObservationRange(profileId, 'clue', '2026-01-01', '2026-01-01'))[0].note).toBe('private cycle note');

      await cryptoModule._migrateAllStorageForTest('plain');
      expect((await getAllCycleObservationsRaw(profileId))[0]).not.toHaveProperty('_payload');
    } finally {
      await cryptoModule._setTestSessionKey(null).catch(() => {});
      localStorage.removeItem('labcharts-encryption-enabled');
      localStorage.removeItem(chatKey);
      await blobStore.deleteBlob(importedKey);
      await deleteCycleDB(profileId).catch(() => {});
      await wearableStore.deleteWearablesDB(profileId).catch(() => {});
      if (previousTestFlag === undefined) delete globalThis.__WEARABLES_TEST;
      else globalThis.__WEARABLES_TEST = previousTestFlag;
    }
  });

  it('parses Drip CSV exports into observations and derived periods', () => {
    const parsed = parseDripCycleCsv([
      'date,bleeding,symptoms,temperature,mucus,ovulation,note',
      '2026-02-01,2,"Cramps; Fatigue",98.2,egg white,negative,start',
      '2026-02-02,4,Cramps,98.0,sticky,,heavy day',
      '2026-02-07,0,,97.8,,,no bleed',
    ].join('\n'), 'drip.csv');

    expect(parsed.source).toBe('drip');
    expect(parsed.observations).toHaveLength(3);
    expect(parsed.observations[0].bleeding.flow).toBe('light');
    expect(parsed.observations[0].bbtC).toBeCloseTo(36.78, 2);
    expect(parsed.periods).toHaveLength(1);
    expect(parsed.periods[0]).toMatchObject({
      startDate: '2026-02-01',
      endDate: '2026-02-02',
      flow: 'heavy',
      source: 'drip',
    });
  });

  it('parses native Drip dotted columns, exclusions, and symptom booleans', () => {
    const parsed = parseDripCycleCsv(DRIP_NATIVE_CSV, 'drip-export.csv');

    expect(parsed.observations.map(row => row.bleeding.flow)).toEqual([
      'light', 'heavy', 'moderate', 'spotting',
    ]);
    expect(parsed.observations[0]).toMatchObject({
      bbtC: 36.61,
      symptoms: ['Cramps', 'Fatigue'],
      note: 'start',
    });
    expect(parsed.observations[1]).toMatchObject({
      bbtC: 36.72,
      bbtExcluded: true,
      symptoms: ['Headache'],
      cervicalMucus: { quality: 'eggwhite / stretchy' },
    });
    expect(parsed.observations[2].bleeding.excluded).toBe(true);
    expect(parsed.periods).toHaveLength(1);
    expect(parsed.periods[0]).toMatchObject({
      startDate: '2026-02-01',
      endDate: '2026-02-02',
      flow: 'heavy',
      symptoms: ['Cramps', 'Fatigue', 'Headache'],
    });
  });

  it('parses Natural Cycles daily CSV exports and merges archive CSV bundles', () => {
    const parsed = parseNaturalCyclesCsv(NATURAL_CYCLES_CSV, 'tracking_data.csv');
    expect(parsed).toMatchObject({ source: 'natural_cycles', sourceLabel: 'Natural Cycles' });
    expect(parsed.observations).toHaveLength(5);
    expect(parsed.warnings.join(' ')).toContain('synthetic fixtures');
    expect(parsed.observations[0]).toMatchObject({
      bbtC: 36.4,
      bleeding: { flow: 'light', excluded: false },
      symptoms: ['Fatigue', 'Cramps'],
    });
    expect(parsed.observations[2]).toMatchObject({
      bleeding: { flow: 'spotting', excluded: true, intermenstrual: true },
      ovulationTest: 'positive',
      cervicalMucus: { quality: 'egg white' },
    });
    expect(parsed.periods.map(period => period.startDate)).toEqual(['2026-05-01', '2026-06-01']);

    const bundled = parseNaturalCyclesCsvBundle([
      { name: 'profile.csv', text: 'setting,value\nlocale,en' },
      { name: 'exports/tracking_data.csv', text: NATURAL_CYCLES_CSV },
    ], 'natural-cycles-export.zip');
    expect(bundled).toMatchObject({
      source: 'natural_cycles',
      sourceFile: 'natural-cycles-export.zip',
      detectedRange: { firstDate: '2026-05-01', lastDate: '2026-06-01' },
    });
    expect(bundled.observations).toHaveLength(5);
    expect(bundled.periods).toHaveLength(2);
  });

  it('parses Clue daily JSON exports with flow, symptoms, BBT, and fertility signs', () => {
    const parsed = parseClueCycleJson(CLUE_BACKUP, 'ClueBackup.json');

    expect(parsed).toMatchObject({ source: 'clue', sourceLabel: 'Clue' });
    expect(parsed.observations).toHaveLength(5);
    expect(parsed.warnings.join(' ')).toContain('synthetic fixtures');
    expect(parsed.observations[0]).toMatchObject({
      bbtC: 36.41,
      bleeding: { flow: 'light', excluded: false },
      symptoms: ['Cramps', 'Sensitive'],
    });
    expect(parsed.observations[1].symptoms).toEqual(['Headache', 'Fatigue']);
    expect(parsed.observations[2].bleeding).toMatchObject({
      flow: 'spotting',
      excluded: true,
      intermenstrual: true,
    });
    expect(parsed.observations[3]).toMatchObject({
      cervicalMucus: { quality: 'egg_white' },
      ovulationTest: 'positive',
    });
    expect(parsed.periods.map(period => period.startDate)).toEqual(['2026-07-01', '2026-08-01']);
  });

  it('keeps menstrual flow when Clue or Natural Cycles also marks spotting that day', () => {
    const natural = parseNaturalCyclesCsv([
      'Date,Temperature,Period,Period Flow,Spotting,Cycle Day',
      '2026-09-01,36.5,true,heavy,true,1',
    ].join('\n'), 'natural-cycles-tracking-data.csv');
    const clue = parseClueCycleJson({
      source: 'Clue',
      data: [{ day: '2026-09-01', period: 'heavy', spotting: true }],
    }, 'ClueBackup.json');

    expect(natural.observations[0].bleeding).toEqual({ flow: 'heavy', excluded: false });
    expect(clue.observations[0].bleeding).toEqual({ flow: 'heavy', excluded: false });
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

    expect(parsed.source).toBe('apple_health');
    expect(parsed.observations).toHaveLength(5);
    expect(parsed.observations.find(row => row.date === '2026-03-01').bleeding).toMatchObject({
      flow: 'light',
      excluded: false,
      intermenstrual: false,
    });
    expect(parsed.observations.find(row => row.date === '2026-03-10').bleeding).toMatchObject({
      flow: 'spotting',
      excluded: true,
      intermenstrual: true,
    });
    expect(parsed.observations.find(row => row.date === '2026-03-14').ovulationTest).toBe('positive');
    expect(parsed.observations.find(row => row.date === '2026-03-13').cervicalMucus.quality).toBe('eggwhite');
    expect(parsed.periods).toHaveLength(1);
    expect(parsed.periods[0]).toMatchObject({
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

    const keep = buildCycleImportPlan(parsed, existing, 'keep-existing');
    expect(keep.conflicts).toHaveLength(1);
    expect(keep.importedToApply.map(period => period.startDate)).toEqual(['2026-05-01']);
    expect(keep.mergedPeriods.map(period => period.startDate)).toEqual(['2026-04-02', '2026-05-01']);

    const replace = buildCycleImportPlan(parsed, existing, 'replace-overlapping');
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

    const profiles = JSON.parse(localStorage.getItem('labcharts-profiles') || '[]');
    expect(result.periods).toBe(1);
    expect(state.profileSex).toBe('female');
    expect(profiles.find(p => p.id === profileId)?.sex).toBe('female');
    expect(state.importedData.menstrualCycle.periods).toHaveLength(1);

    await deleteCycleDB(profileId).catch(() => {});
  });

  it('requires approval before changing an explicitly male profile', async () => {
    const profileId = 'cycle-profile-sex-confirmation';
    state.currentProfile = profileId;
    state.profileSex = 'male';
    state.profiles = [{ id: profileId, name: 'Explicit Male', sex: 'male' }];
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
    expect(state.profiles[0].sex).toBe('female');
    await deleteCycleDB(profileId).catch(() => {});
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

    expect(state.importedData.menstrualCycle.coverage).toMatchObject({
      firstDate: '2026-05-12',
      lastDate: '2026-05-12',
      observationCount: 1,
    });
    expect(await deleteCycleImportFromProfile('raw-only-import')).toBe(true);
    expect(await countCycleSource(profileId, 'drip')).toBe(0);
    expect(state.importedData.menstrualCycle.coverage).toMatchObject({
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
    expect(snapshot.cycleIDB[profileId].drip).toHaveLength(2);
    expect(snapshot.cycleIDB[profileId].drip[0]).toMatchObject({
      source: 'drip',
      importId: 'backup-imp',
      date: '2026-06-01',
    });
    expect(snapshot.cycleIDB[profileId].future_cycle_app).toEqual([
      expect.objectContaining({ date: '1998-12-31', note: 'older history' }),
    ]);
    expect(snapshot.cycleImportMeta[profileId]).toEqual([
      expect.objectContaining({ importId: 'backup-imp', sourceFile: 'drip-backup.csv' }),
    ]);

    await deleteCycleDB(profileId).catch(() => {});
  });

  it('round-trips encrypted cycle rows and import metadata through backup JSON', async () => {
    const profileId = 'cycle-encrypted-backup-roundtrip';
    const cryptoModule = await import('../js/crypto.js');
    const previousTestFlag = globalThis.__WEARABLES_TEST;
    globalThis.__WEARABLES_TEST = true;
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

      const restored = parseBackupSnapshot(serializeBackupSnapshot(await buildFullBackupSnapshot()));
      const restoredRow = restored.cycleIDB[profileId].clue[0];
      const restoredMeta = restored.cycleImportMeta[profileId][0];
      expect(cryptoModule.isEncryptedObject(restoredRow._payload)).toBe(true);
      expect(cryptoModule.isEncryptedObject(restoredMeta._payload)).toBe(true);
      const legacyEnvelope = parseBackupSnapshot(JSON.stringify({
        _enc: 'v1', iv: Object.assign({}, restoredRow._payload.iv), ct: Object.assign({}, restoredRow._payload.ct),
      }));
      expect(cryptoModule.isEncryptedObject(legacyEnvelope)).toBe(true);

      await deleteCycleDB(profileId);
      await restoreCycleBackup(restored.cycleIDB, restored.cycleImportMeta);
      expect((await getCycleObservationRange(profileId, 'clue', '2026-07-01', '2026-07-01'))[0].note).toBe('private note');
      expect(await getCycleImportMeta(profileId, 'encrypted-backup-import')).toMatchObject({ sourceFile: 'ClueBackup.json' });
      expect(await getAllCycleImportMetaRaw(profileId)).toHaveLength(1);
    } finally {
      await cryptoModule._setTestSessionKey(null).catch(() => {});
      localStorage.removeItem('labcharts-encryption-enabled');
      if (previousTestFlag === undefined) delete globalThis.__WEARABLES_TEST;
      else globalThis.__WEARABLES_TEST = previousTestFlag;
      await deleteCycleDB(profileId).catch(() => {});
    }
  });

  it('parses an eight-year daily Drip export without expanding the compact period model', () => {
    const rows = ['date,bleeding,temperature'];
    const cursor = new Date('2018-01-01T00:00:00Z');
    const end = new Date('2025-12-31T00:00:00Z');
    while (cursor <= end) {
      const date = cursor.toISOString().slice(0, 10);
      rows.push(`${date},${cursor.getUTCDate() <= 5 ? 2 : 0},36.5`);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const parsed = parseDripCycleCsv(rows.join('\n'), 'drip-eight-years.csv');
    expect(parsed.observations.length).toBeGreaterThan(2900);
    expect(parsed.periods).toHaveLength(96);
    expect(JSON.stringify(parsed.periods).length).toBeLessThan(30000);
  });
});
