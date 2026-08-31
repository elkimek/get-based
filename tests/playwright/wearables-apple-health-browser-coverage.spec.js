import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?appleHealthCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function expectAll(results) {
  for (const [name, passed] of Object.entries(results)) {
    expect.soft(passed, name).toBe(true);
  }
}

test('Apple Health browser coverage parses streams and imports XML and ZIP files', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ appleUrl }) => {
    const [{ state }, apple, store] = await Promise.all([
      import('/js/state.js'),
      import(appleUrl),
      import('/js/wearables-store.js'),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const saved = {
      currentProfile: state.currentProfile,
      importedData: clone(state.importedData),
      profiles: clone(state.profiles),
      jszip: window.JSZip,
      hadJSZip: Object.prototype.hasOwnProperty.call(window, 'JSZip'),
    };
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const profileId = `apple-health-browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const results = {};
    const blobProgress = [];
    const importProgress = [];
    const zipProgress = [];
    const invalidErrors = [];
    const isoDayOffset = offset => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    };
    const dayOneDate = isoDayOffset(-2);
    const dayTwoDate = isoDayOffset(-1);
    const zipDate = isoDayOffset(0);

    const richXml = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData>
  <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" unit="ms" sourceName="Watch" startDate="${dayOneDate} 23:10:00 +0200" value="50"/>
  <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" unit="ms" sourceName="Watch" startDate="${dayOneDate} 01:10:00 +0200" value="70"/>
  <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" unit="ms" sourceName="Watch" startDate="${dayOneDate} 10:00:00 +0200" value="30"/>
  <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" unit="ms" sourceName="Watch" startDate="${dayTwoDate}" value="40"/>
  <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" unit="ms" sourceName="Watch" startDate="${dayTwoDate}" value="60"/>
  <Record type="HKQuantityTypeIdentifierRestingHeartRate" unit="count/min" sourceName="Watch" startDate="${dayOneDate} 07:00:00 +0200" value="62"/>
  <Record type="HKQuantityTypeIdentifierRestingHeartRate" unit="count/min" sourceName="ThirdParty" startDate="${dayOneDate} 08:00:00 +0200" value="58"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" unit="count/min" sourceName="Watch" startDate="${dayOneDate} 09:00:00 +0200" value="65"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" unit="count/min" sourceName="Watch" startDate="${dayOneDate} 14:00:00 +0200" value="85"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" unit="count/min" sourceName="Watch" startDate="${dayOneDate} 23:00:00 +0200" value="55"/>
  <Record type="HKQuantityTypeIdentifierStepCount" unit="count" sourceName="Watch" startDate="${dayOneDate} 12:00:00 +0200" value="100"/>
  <Record type="HKQuantityTypeIdentifierStepCount" unit="count" sourceName="Watch" startDate="${dayOneDate} 13:00:00 +0200" value="200"/>
  <Record type="HKQuantityTypeIdentifierStepCount" unit="count" sourceName="Phone" startDate="${dayOneDate} 12:00:00 +0200" value="1000"/>
  <Record type="HKQuantityTypeIdentifierOxygenSaturation" unit="1" sourceName="Watch" startDate="${dayOneDate} 06:00:00 +0200" value="0.97"/>
  <Record type="HKQuantityTypeIdentifierVO2Max" unit="mL/kg/min" sourceName="Watch" startDate="${dayOneDate} 09:00:00 +0200" value="42"/>
  <Record type="HKQuantityTypeIdentifierBodyMass" unit="lb" sourceName="Scale" startDate="${dayOneDate} 08:00:00 +0200" value="180"/>
  <Record type="HKQuantityTypeIdentifierBodyFatPercentage" unit="1" sourceName="Scale" startDate="${dayOneDate} 08:00:00 +0200" value="0.2"/>
  <Record type="HKQuantityTypeIdentifierLeanBodyMass" unit="kg" sourceName="Scale" startDate="${dayOneDate} 08:00:00 +0200" value="65"/>
  <Record type="HKQuantityTypeIdentifierBloodPressureSystolic" unit="mmHg" sourceName="Cuff" startDate="${dayOneDate} 08:00:00 +0200" value="120"/>
  <Record type="HKQuantityTypeIdentifierBloodPressureDiastolic" unit="mmHg" sourceName="Cuff" startDate="${dayOneDate} 08:00:00 +0200" value="80"/>
  <Record type="HKQuantityTypeIdentifierBodyTemperature" unit="degC" sourceName="Thermometer" startDate="${dayOneDate} 08:00:00 +0200" value="37"/>
  <Record type="HKQuantityTypeIdentifierStepCount" unit="furlongs" sourceName="Bad" startDate="${dayOneDate} 12:00:00 +0200" value="9999"/>
  <Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" sourceName="Bad" startDate="${dayOneDate} 08:00:00 +0200" value="not-number"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="${dayOneDate} 00:00:00 +0200" value="HKCategoryValueSleepAnalysisAsleep"/>
</HealthData>`;
    const zipXml = `<?xml version="1.0"?><HealthData>
  <Record type="HKQuantityTypeIdentifierStepCount" unit="count" sourceName="Watch" startDate="${zipDate} 12:00:00 +0200" value="333"/>
</HealthData>`;

    try {
      await store.deleteWearablesDB(profileId).catch(() => {});
      localStorage.setItem('labcharts-active-profile', profileId);
      state.currentProfile = profileId;
      state.importedData = {
        entries: [],
        wearableConnections: {},
        wearableSummary: null,
        changeHistory: [],
      };

      const parsedRows = apple.parseAppleHealthXml(richXml);
      const dayOne = parsedRows.find(row => row.date === dayOneDate);
      const dayTwo = parsedRows.find(row => row.date === dayTwoDate);
      results.xmlParserReturnsTwoDays = parsedRows.length === 2
        && parsedRows[0]?.date === dayOneDate
        && parsedRows[1]?.date === dayTwoDate;
      results.xmlParserSplitsHrvWindows = dayOne?.hrv_sdnn === 60
        && dayOne?.hrv_day === 30;
      results.xmlParserAggregatesHeartRateSignals = dayOne?.rhr === 58
        && dayOne?.hr_day === 75;
      results.xmlParserDeduplicatesStepsBySource = dayOne?.steps === 1000;
      results.xmlParserNormalisesOxygenAndVo2 = dayOne?.spo2_avg === 97
        && dayOne?.vo2max === 42;
      results.xmlParserConvertsWeight = dayOne?.weight === 81.65;
      results.xmlParserConvertsBodyComposition = dayOne?.body_fat_pct === 20
        && dayOne?.fat_mass_kg === 16.33
        && dayOne?.lean_mass_kg === 65;
      results.xmlParserConvertsBloodPressure = dayOne?.bp_systolic === 120
        && dayOne?.bp_diastolic === 80;
      results.xmlParserDropsAbsoluteBodyTemperature = dayOne?.body_temp_delta === null;
      results.xmlParserFallsBackWhenNoHourMetadata = dayTwo?.hrv_sdnn === 50
        && dayTwo?.hrv_day === null;

      const blobRows = await apple.parseAppleHealthBlob(new Blob([richXml], { type: 'application/xml' }), evt => blobProgress.push(evt));
      results.blobParserMatchesXmlParser = JSON.stringify(blobRows) === JSON.stringify(parsedRows);
      results.blobParserReportsProgress = blobProgress.some(evt => evt.stage === 'parsing' && evt.pct >= 40);

      try {
        await apple.importAppleHealthFile(new File(['not apple'], 'notes.txt', { type: 'text/plain' }));
      } catch (error) {
        invalidErrors.push(error?.message || String(error));
      }
      results.importRejectsUnknownFileTypes = invalidErrors.some(message => message.includes('Unrecognised file type'));

      const xmlResult = await apple.importAppleHealthFile(
        new File([richXml], 'export.xml', { type: 'application/xml' }),
        evt => importProgress.push(evt)
      );
      const importedRows = await store.getDailyRange(profileId, 'apple_health', dayOneDate, dayTwoDate);
      const importMeta = await store.getMeta(profileId, 'last-sync:apple_health');
      results.xmlImportReturnsDateRange = xmlResult.rows === 2
        && xmlResult.startDate === dayOneDate
        && xmlResult.endDate === dayTwoDate;
      results.xmlImportWritesIndexedDbRows = importedRows.length === 2;
      results.xmlImportWritesMeta = importMeta?.rows === 2
        && importMeta?.startDate === dayOneDate
        && importMeta?.endDate === dayTwoDate;
      results.xmlImportUpdatesConnection = state.importedData.wearableConnections.apple_health?.fileName === 'export.xml'
        && state.importedData.wearableConnections.apple_health?.coverageDays === 2;
      results.xmlImportUpdatesSummary = state.importedData.wearableSummary?.sources?.apple_health?.coverageDays === 2;
      results.xmlImportReportsAllStages = ['reading', 'parsing', 'writing', 'summarising', 'done']
        .every(stage => importProgress.some(evt => evt.stage === stage));

      window.JSZip = {
        loadAsync: async (_file, options = {}) => {
          options.onUpdate?.({ percent: 25 });
          options.onUpdate?.({ percent: 100 });
          return {
            files: {
              'apple_health_export/export.xml': {
                async: async type => {
                  if (type !== 'blob') throw new Error(`unexpected zip async type ${type}`);
                  return new Blob([zipXml], { type: 'application/xml' });
                },
              },
            },
          };
        },
      };
      const zipResult = await apple.importAppleHealthFile(
        new File(['fake zip bytes'], 'export.zip', { type: 'application/zip' }),
        evt => zipProgress.push(evt)
      );
      const zipRow = await store.getDaily(profileId, 'apple_health', zipDate);
      results.zipImportUsesJSZipAndImportedXmlEntry = zipResult.rows === 1
        && zipResult.startDate === zipDate
        && zipResult.endDate === zipDate
        && zipRow?.steps === 333
        && state.importedData.wearableConnections.apple_health?.fileName === 'export.zip'
        && zipProgress.some(evt => evt.stage === 'unzipping');

      window.JSZip = {
        loadAsync: async () => ({
          files: {
            'apple_health_export/other.xml': {},
            'readme.txt': {},
          },
        }),
      };
      try {
        await apple.importAppleHealthFile(new File(['fake'], 'missing-export.zip', { type: 'application/zip' }));
      } catch (error) {
        invalidErrors.push(error?.message || String(error));
      }
      results.zipImportExplainsMissingExportXml = invalidErrors.some(message =>
        message.includes('export.xml not found in ZIP')
        && message.includes('apple_health_export/other.xml')
      );
    } finally {
      await store.deleteWearablesDB(profileId).catch(() => {});
      state.currentProfile = saved.currentProfile;
      state.importedData = saved.importedData;
      state.profiles = saved.profiles;
      if (saved.hadJSZip) window.JSZip = saved.jszip;
      else delete window.JSZip;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return results;
  }, { appleUrl: moduleUrl('/js/wearables-apple-health.js') });

  expectAll(results);
});
