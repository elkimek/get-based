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

  const results = await page.evaluate(async ({ adaptersUrl, normalizationUrl }) => {
    const adapters = await import(adaptersUrl);
    const normalization = await import(normalizationUrl);
    const outcomes = {};

    const fattyAcids = adapters.getAdapterByTestType('fattyAcids');
    const metabolomix = adapters.getAdapterByTestType('Metabolomix+');
    const mosaicOat = adapters.getAdapterByTestType('Mosaic OAT');
    const oat = adapters.getAdapterByTestType('OAT');
    const biostarks = adapters.getAdapterByTestType('biostarks');
    const markers = adapters.getAllAdapterMarkers();

    outcomes.registryFindsExpectedAdaptersAndMarkers =
      fattyAcids?.id === 'fattyAcids'
      && metabolomix?.id === 'metabolomix'
      && mosaicOat?.id === 'mosaicOat'
      && oat?.id === 'oat'
      && biostarks?.id === 'biostarks'
      && markers['fattyAcids.omega3Index']?.group === 'Fatty Acids'
      && markers['biostarksMineral.magnesium']?.group === 'BioStarks'
      && adapters.getAdapterByTestType('unknown') === null;

    const detectedFA = adapters.detectProduct('spadia-fatty-acids.pdf', '');
    const detectedMetabolomix = adapters.detectProduct('plain.pdf', 'Genova Diagnostics 3200 Metabolomix FMV urine');
    const detectedMosaic = adapters.detectProduct('plain.pdf', 'Mosaic Diagnostics Organic Acids Test - Nutritional and Metabolic Profile');
    const detectedMoat = adapters.detectProduct('plain.pdf', 'MosaicDX Microbial Organic Acids Test (MOAT)');
    const genericGenova = adapters.detectProduct('plain.pdf', 'Genova Diagnostics GI Effects Comprehensive');
    const unrelated3200 = adapters.detectProduct('plain.pdf', 'Other Laboratory 3200 FMV urine panel');
    const detectedBiostarks = adapters.detectProduct('plain.pdf', 'Bio Starks dried blood spot report');
    outcomes.detectProductFindsAllSpecialtyAdapters =
      detectedFA?.adapter?.id === 'fattyAcids'
      && detectedFA.product.prefix === 'spadiaFA'
      && detectedMetabolomix?.adapter?.id === 'metabolomix'
      && detectedMetabolomix.product.prefix === 'metabolomix'
      && detectedMosaic?.adapter?.id === 'mosaicOat'
      && detectedMosaic.product.prefix === 'mosaicOat'
      && detectedMoat?.adapter?.id === 'mosaicOat'
      && detectedMoat.product.prefix === 'mosaicMoat'
      && genericGenova === null
      && unrelated3200 === null
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
      { rawName: 'Pyruvic Acid', mappedKey: 'oatMetabolic.pyruvic' },
      { rawName: 'Methylmalonic Acid', mappedKey: 'oatNutritional.methylmalonic' },
      { rawName: 'Pyroglutamic Acid', mappedKey: 'oatNutritional.pyroglutamic' },
      { rawName: 'Arginine', mappedKey: 'urineAmino.arginine' },
      { rawName: 'Lead', mappedKey: 'toxicElements.lead' },
      { rawName: 'Linoleic Acid', suggestedKey: 'custom.linoleicAcid' },
    ];
    normalization.normalizeProductScopedAdapterMarkers(metabolomix, metabolomixMarkers, detectedMetabolomix.product, 'Genova Diagnostics');
    outcomes.metabolomixScopesEveryPanelToOfficialProductSections =
      metabolomixMarkers[0].mappedKey === null
      && metabolomixMarkers[0].suggestedKey === 'metabolomixFA.omega3Index'
      && metabolomixMarkers[0].suggestedCategoryLabel === 'Metabolomix+: Essential & Metabolic Fatty Acids'
      && metabolomixMarkers[1].suggestedKey === 'metabolomixDysbiosis.citramalic'
      && metabolomixMarkers[2].suggestedKey === 'metabolomixMitochondrial.pyruvic'
      && metabolomixMarkers[3].suggestedKey === 'metabolomixVitamins.methylmalonic'
      && metabolomixMarkers[4].suggestedKey === 'metabolomixDetox.pyroglutamic'
      && metabolomixMarkers[5].suggestedKey === 'metabolomixAminoAcids.arginine'
      && metabolomixMarkers[6].suggestedKey === 'metabolomixToxicElements.lead'
      && metabolomixMarkers[7].suggestedKey === 'metabolomixFA.linoleicAcid'
      && metabolomixMarkers.every(marker => marker.suggestedGroup === 'Metabolomix+');

    const mosaicMarkers = [
      { rawName: 'Citramalic Acid', mappedKey: 'oatMicrobial.citramalic' },
      { rawName: 'Pyruvic Acid', mappedKey: 'oatMetabolic.pyruvic' },
    ];
    normalization.normalizeProductScopedAdapterMarkers(mosaicOat, mosaicMarkers, detectedMosaic.product, 'Mosaic Diagnostics');
    const moatMarkers = [{ rawName: 'Citramalic Acid', mappedKey: 'oatMicrobial.citramalic' }];
    normalization.normalizeProductScopedAdapterMarkers(mosaicOat, moatMarkers, detectedMoat.product, 'Mosaic MOAT');
    outcomes.mosaicOatAndMoatUseSeparateProductHistories =
      mosaicMarkers[0].suggestedKey === 'mosaicOatMicrobial.citramalic'
      && mosaicMarkers[0].suggestedCategoryLabel === 'Mosaic OAT: Microbial Overgrowth'
      && mosaicMarkers[1].suggestedKey === 'mosaicOatMitochondrial.pyruvic'
      && moatMarkers[0].suggestedKey === 'mosaicMoat.citramalic'
      && moatMarkers[0].suggestedGroup === 'Mosaic MOAT';

    const acmeMarkers = [
      { rawName: 'Pyruvic Acid', mappedKey: 'oatMetabolic.pyruvic' },
      { rawName: '2-Hydroxy Example' },
      { rawName: '3-Hydroxy Example' },
    ];
    normalization.normalizeProductScopedAdapterMarkers(oat, acmeMarkers, null, 'Acme Functional Lab');
    outcomes.otherOatLabsReceiveStableLabScopedKeys =
      acmeMarkers[0].suggestedKey === 'acmeFunctionalLabOatMitochondrial.pyruvic'
      && acmeMarkers[0].suggestedGroup === 'Acme Functional Lab OAT'
      && acmeMarkers[1].suggestedKey === 'acmeFunctionalLabOatOrganicAcids.n2HydroxyExample'
      && acmeMarkers[2].suggestedKey === 'acmeFunctionalLabOatOrganicAcids.n3HydroxyExample';

    const pipelineMetabolomix = normalization.normalizeParsedImportMarkers({
      testType: 'OAT',
      labName: 'Genova Diagnostics',
      markers: [{ rawName: 'Pyruvic Acid', value: 7, mappedKey: 'oatMetabolic.pyruvic', unit: 'mmol/mol creatinine' }],
    }, {
      fileName: 'report.pdf',
      sourceText: 'Genova Diagnostics 3200 Metabolomix+ - FMV Urine',
      existingKeys: new Set(),
    });
    const pipelineMosaic = normalization.normalizeParsedImportMarkers({
      testType: 'OAT',
      labName: 'Mosaic Diagnostics',
      markers: [{ rawName: 'Pyruvic Acid', value: 7, mappedKey: 'oatMetabolic.pyruvic', unit: 'mmol/mol creatinine' }],
    }, {
      fileName: 'report.pdf',
      sourceText: 'Mosaic Diagnostics Organic Acids Test',
      existingKeys: new Set(),
    });
    const pipelineOtherOat = normalization.normalizeParsedImportMarkers({
      testType: 'OAT',
      labName: 'Acme Functional Lab',
      markers: [{ rawName: 'Pyruvic Acid', value: 7, mappedKey: 'oatMetabolic.pyruvic', unit: 'mmol/mol creatinine' }],
    }, {
      fileName: 'report.pdf',
      sourceText: '',
      existingKeys: new Set(),
    });
    const pipelineMetabolomixReimport = normalization.normalizeParsedImportMarkers({
      testType: 'Metabolomix+',
      labName: 'Genova Diagnostics',
      markers: [{ rawName: 'Pyruvic Acid', value: 8, mappedKey: 'metabolomixMitochondrial.pyruvic', unit: 'mmol/mol creatinine' }],
    }, {
      fileName: 'metabolomix.pdf',
      sourceText: '',
      existingKeys: new Set(['metabolomixMitochondrial.pyruvic']),
    });
    const pipelineBloodMisclassification = normalization.normalizeParsedImportMarkers({
      testType: 'blood',
      labName: 'Genova Diagnostics',
      markers: [{ rawName: 'Pyruvic Acid', value: 9, mappedKey: 'biochemistry.pyruvate', unit: 'mmol/mol creatinine' }],
    }, {
      fileName: 'report.pdf',
      sourceText: 'Genova Diagnostics 3200 Metabolomix+ - FMV Urine',
      existingKeys: new Set(),
    });
    outcomes.fullPipelineDoesNotAliasProductKeysBackToGenericOat =
      pipelineMetabolomix.markers[0].mappedKey === null
      && pipelineMetabolomix.markers[0].suggestedKey === 'metabolomixMitochondrial.pyruvic'
      && pipelineMosaic.markers[0].mappedKey === null
      && pipelineMosaic.markers[0].suggestedKey === 'mosaicOatMitochondrial.pyruvic'
      && pipelineOtherOat.markers[0].suggestedKey === 'acmeFunctionalLabOatMitochondrial.pyruvic'
      && pipelineMetabolomixReimport.markers[0].matched === true
      && pipelineMetabolomixReimport.markers[0].mappedKey === 'metabolomixMitochondrial.pyruvic'
      && pipelineBloodMisclassification.markers[0].suggestedKey === 'metabolomixMitochondrial.pyruvic'
      && pipelineMetabolomix.markers[0].suggestedKey !== pipelineMosaic.markers[0].suggestedKey;

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
    normalizationUrl: moduleUrl('/js/pdf-import-marker-normalization.js'),
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
