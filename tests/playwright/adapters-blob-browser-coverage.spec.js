import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?adapterBlobCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('adapter browser coverage normalizes specialty lab markers through registry APIs', async ({ page }) => {
  await openBlankPage(page, '/adapter-browser-coverage');

  const results = await page.evaluate(async ({ adaptersUrl }) => {
    const adapters = await import(adaptersUrl);
    const outcomes = {};

    const fattyAcids = adapters.getAdapterByTestType('fattyAcids');
    const metabolomix = adapters.getAdapterByTestType('Metabolomix+');
    const oat = adapters.getAdapterByTestType('OAT');
    const biostarks = adapters.getAdapterByTestType('biostarks');
    const markers = adapters.getAllAdapterMarkers();

    outcomes.registryFindsExpectedAdaptersAndMarkers =
      fattyAcids?.id === 'fattyAcids'
      && metabolomix?.id === 'metabolomix'
      && oat?.id === 'oat'
      && biostarks?.id === 'biostarks'
      && markers['fattyAcids.omega3Index']?.group === 'Fatty Acids'
      && markers['biostarksMineral.magnesium']?.group === 'BioStarks'
      && adapters.getAdapterByTestType('unknown') === null;

    const detectedFA = adapters.detectProduct('spadia-fatty-acids.pdf', '');
    const detectedMetabolomix = adapters.detectProduct('plain.pdf', 'Genova Diagnostics 3200 Metabolomix FMV urine');
    const detectedBiostarks = adapters.detectProduct('plain.pdf', 'Bio Starks dried blood spot report');
    outcomes.detectProductFindsAllSpecialtyAdapters =
      detectedFA?.adapter?.id === 'fattyAcids'
      && detectedFA.product.prefix === 'spadiaFA'
      && detectedMetabolomix?.adapter?.id === 'metabolomix'
      && detectedMetabolomix.product.prefix === 'metabolomix'
      && detectedBiostarks?.adapter?.id === 'biostarks'
      && detectedBiostarks.product.prefix === 'biostarks';

    const faMarkers = [
      { rawName: 'DHA', mappedKey: 'fattyAcids.dhaC22_6' },
      { rawName: 'LDL Cholesterol', mappedKey: 'lipids.ldl', suggestedCategoryLabel: 'Fatty Acids' },
      { rawName: 'Custom ratio 1', suggestedCategoryLabel: 'Acme Balance Panel' },
      { rawName: 'Unlabeled ratio' },
    ];
    adapters.normalizeWithAdapter(fattyAcids, faMarkers, 'spadia-results.pdf', '', null);

    const faFallbackMarkers = [{ rawName: 'Alpha One', suggestedCategoryLabel: 'Cell Balance' }];
    adapters.normalizeWithAdapter(fattyAcids, faFallbackMarkers, 'unknown-results.pdf', '', null);

    const faDefaultMarkers = [{ rawName: 'No Label Marker' }];
    adapters.normalizeWithAdapter(fattyAcids, faDefaultMarkers, 'unknown-results.pdf', '', null);

    outcomes.fattyAcidsNormalizePrefixesNonStandardMarkersAndSkipsSchemaKeys =
      faMarkers[0].mappedKey === null
      && faMarkers[0].suggestedKey === 'spadiaFA.dhaC22_6'
      && faMarkers[0].suggestedGroup === 'Fatty Acids'
      && faMarkers[1].mappedKey === 'lipids.ldl'
      && faMarkers[2].suggestedKey === 'spadiaFA.Customratio1'
      && faMarkers[3].suggestedKey === 'spadiaFA.Unlabeledratio'
      && faFallbackMarkers[0].suggestedKey === 'cellbalanceFA.AlphaOne'
      && faDefaultMarkers[0].suggestedKey === 'fattyAcidsTest.NoLabelMarker';

    const metabolomixMarkers = [
      { rawName: 'Omega-3 Index', mappedKey: 'fattyAcids.omega3Index' },
      { rawName: 'Citramalic Acid', mappedKey: 'oatMicrobial.citramalic' },
      { rawName: 'Linoleic Acid', suggestedKey: 'custom.linoleicAcid' },
    ];
    adapters.normalizeWithAdapter(metabolomix, metabolomixMarkers, 'metabolomix.pdf', '', detectedMetabolomix.product);
    outcomes.metabolomixRoutesFattyAcidsThroughProductSpecificPrefix =
      metabolomixMarkers[0].mappedKey === null
      && metabolomixMarkers[0].suggestedKey === 'metabolomixFA.omega3Index'
      && metabolomixMarkers[0].suggestedCategoryLabel === 'Fatty Acids'
      && metabolomixMarkers[1].mappedKey === 'oatMicrobial.citramalic'
      && metabolomixMarkers[2].suggestedKey === 'metabolomixFA.linoleicAcid';

    const biostarksMarkers = [
      { rawName: 'DHA', mappedKey: 'biostarksFA.dha' },
      { rawName: 'Magnesium', mappedKey: 'electrolytes.magnesium', unit: '\u00b5g/gHb' },
      { rawName: 'Vitamin E', mappedKey: null },
      { rawName: 'Glucose', mappedKey: 'biochemistry.glucose', unit: 'mmol/l' },
      { rawName: 'T/C Ratio' },
    ];
    adapters.normalizeWithAdapter(biostarks, biostarksMarkers, 'biostarks.pdf', '', detectedBiostarks.product);
    outcomes.biostarksNormalizeHandlesExistingKeysMineralUnitsAndAliases =
      biostarksMarkers[0].mappedKey === 'biostarksFA.dha'
      && biostarksMarkers[1].mappedKey === null
      && biostarksMarkers[1].suggestedKey === 'biostarksMineral.magnesium'
      && biostarksMarkers[1].suggestedGroup === 'BioStarks'
      && biostarksMarkers[2].suggestedKey === 'biostarksVitamin.vitaminE'
      && biostarksMarkers[3].mappedKey === 'biochemistry.glucose'
      && biostarksMarkers[4].suggestedKey === 'biostarksHormone.testCortisolRatio';

    const unchanged = [{ rawName: 'No-op' }];
    adapters.normalizeWithAdapter(null, unchanged, '', '', null);
    outcomes.normalizeWithMissingAdapterIsNoop = unchanged[0].suggestedKey === undefined;

    outcomes.allOutcomesReached = true;
    return outcomes;
  }, {
    adaptersUrl: moduleUrl('/js/adapters.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('blob storage browser coverage exercises size diagnostics and IDB failure rails', async ({ page }) => {
  await openBlankPage(page, '/blob-storage-browser-coverage');

  const results = await page.evaluate(async ({ blobUrl }) => {
    const blobStorage = await import(blobUrl);
    const outcomes = {};
    const key = `coverage-${Date.now()}-${Math.random().toString(36).slice(2)}-imported`;
    const bufferKey = `${key}-buffer-imported`;

    try {
      await blobStorage.deleteBlob(key);
      await blobStorage.deleteBlob(bufferKey);
      const before = await blobStorage.getBlobStorageSize();
      await blobStorage.setBlob(key, 'abcdef');
      await blobStorage.setBlob(bufferKey, new Uint8Array([1, 2, 3, 4]).buffer);
      const storedText = await blobStorage.getBlob(key);
      const storedBuffer = await blobStorage.getBlob(bufferKey);
      const after = await blobStorage.getBlobStorageSize();

      outcomes.realIndexedDBStoresReadsSizesAndDeletes =
        blobStorage.shouldUseBlob(key) === true
        && blobStorage.shouldUseBlob('coverage-small') === false
        && storedText === 'abcdef'
        && storedBuffer instanceof ArrayBuffer
        && storedBuffer.byteLength === 4
        && after >= before + 10;

      await blobStorage.deleteBlob(key);
      await blobStorage.deleteBlob(bufferKey);
      outcomes.deleteBlobRemovesStoredValues = await blobStorage.getBlob(key) === null;
    } finally {
      await blobStorage.deleteBlob(key).catch(() => {});
      await blobStorage.deleteBlob(bufferKey).catch(() => {});
    }

    const withFakeIndexedDB = async (mode, callback) => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'indexedDB');
      const originalWarn = console.warn;
      const warnings = [];
      console.warn = (...args) => warnings.push(args.map(String).join(' '));
      const restore = () => {
        console.warn = originalWarn;
        if (originalDescriptor) Object.defineProperty(window, 'indexedDB', originalDescriptor);
        else delete window.indexedDB;
      };
      const failRequest = label => {
        const request = { error: new Error(label) };
        queueMicrotask(() => request.onerror?.());
        return request;
      };
      const fakeDb = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => {},
        transaction: () => ({
          objectStore: () => ({
            get: () => failRequest('get failed'),
            put: () => failRequest('put failed'),
            delete: () => failRequest('delete failed'),
            getAll: () => failRequest('getAll failed'),
          }),
        }),
      };
      const fakeIndexedDB = {
        open: () => {
          const request = {
            result: fakeDb,
            error: new Error(`${mode} failed`),
          };
          queueMicrotask(() => {
            if (mode === 'open-error') request.onerror?.();
            else if (mode === 'open-blocked') request.onblocked?.();
            else request.onsuccess?.();
          });
          return request;
        },
      };

      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: fakeIndexedDB,
      });

      try {
        const mod = await import(`/js/blob-storage.js?fakeBlobStorage=${mode}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        return await callback(mod, warnings);
      } finally {
        restore();
      }
    };

    const openError = await withFakeIndexedDB('open-error', async mod => ({
      value: await mod.getBlob('missing'),
      size: await mod.getBlobStorageSize(),
      shouldUseBlob: mod.shouldUseBlob('fake-imported'),
    }));
    const openBlocked = await withFakeIndexedDB('open-blocked', async mod => ({
      value: await mod.getBlob('missing'),
      size: await mod.getBlobStorageSize(),
    }));
    const requestErrors = await withFakeIndexedDB('request-errors', async (mod, warnings) => {
      let setError = '';
      try {
        await mod.setBlob('broken-imported', 'value');
      } catch (error) {
        setError = String(error?.message || error);
      }
      await mod.deleteBlob('broken-imported');
      return {
        getValue: await mod.getBlob('broken-imported'),
        setError,
        size: await mod.getBlobStorageSize(),
        warningCount: warnings.length,
      };
    });

    outcomes.fakeIndexedDBOpenFailuresReturnFallbacks =
      openError.value === null
      && openError.size === 0
      && openError.shouldUseBlob === true
      && openBlocked.value === null
      && openBlocked.size === 0;

    outcomes.fakeIndexedDBRequestFailuresUseCatchAndRejectPaths =
      requestErrors.getValue === null
      && requestErrors.setError.includes('put failed')
      && requestErrors.size === 0
      && requestErrors.warningCount >= 2;

    outcomes.allOutcomesReached = true;
    return outcomes;
  }, {
    blobUrl: moduleUrl('/js/blob-storage.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
