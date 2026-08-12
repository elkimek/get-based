import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?importReviewCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openImportApp(page) {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    await (await import('/js/import-loader.js')).loadImportStylesheet();
  });
}

test('import file input and drop zone route browser file types and busy states', async ({ page }) => {
  await openImportApp(page);
  await page.waitForSelector('#pdf-input', { state: 'attached' });
  await page.waitForSelector('#drop-zone', { state: 'attached' });

  const results = await page.evaluate(async ({ fileInputUrl, dropZoneUrl }) => {
    const fileInput = await import(fileInputUrl);
    const dropZoneModule = await import(dropZoneUrl);
    const dropZoneRuntime = await import('/js/import-drop-zone-runtime.js');
    const dnaBridge = await import('/js/dna-runtime-bridge.js');
    const outcomes = {};
    const calls = [];
    let importRunning = false;
    const previousDropZoneRuntimeDeps = dropZoneRuntime.configureImportDropZoneRuntimeDeps({
      importDataJSON: file => { calls.push(['json', file.name]); },
      isImportRunning: () => importRunning,
      showNotification: (message, type) => { calls.push(['notify', type, message]); },
    });
    const previousDnaBridge = dnaBridge.configureDnaModuleBridge();
    const input = document.getElementById('pdf-input');
    const originalDropZone = document.getElementById('drop-zone');
    const dropZone = originalDropZone.cloneNode(true);
    let originalClick = null;
    originalDropZone.replaceWith(dropZone);
    const flush = () => new Promise(resolve => setTimeout(resolve, 40));
    const makeFiles = (...files) => {
      const dt = new DataTransfer();
      for (const file of files) dt.items.add(file);
      return dt.files;
    };
    const setInputFiles = (...files) => {
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: makeFiles(...files),
      });
    };
    const dispatchDrop = (...files) => {
      const event = new DragEvent('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', {
        configurable: true,
        value: { files: makeFiles(...files) },
      });
      dropZone.dispatchEvent(event);
    };

    try {
      await (await import('/js/import-loader.js')).loadPdfImport();
      dnaBridge.configureDnaModuleBridge({
        isDNAFileByContent: async file => (await file.text()).includes('MTDNA'),
        detectDNAFile: header => header.includes('MTDNA') ? 'mtdna' : 'autosomal',
        handleMtDNAFile: async file => { calls.push(['mtdna', file.name]); },
        handleDNAFile: async file => { calls.push(['dna', file.name]); },
      });

      importRunning = true;
      setInputFiles(new File(['{"ok":true}'], 'busy.json', { type: 'application/json' }));
      await fileInput.handleImportInputChange({ target: input });
      outcomes.busyInputSkipsRouting = calls.length === 0;

      importRunning = false;
      setInputFiles(
        new File(['{"ok":true}'], 'profile.json', { type: 'application/json' }),
        new File(['MTDNA raw data'], 'maternal.dna.txt', { type: 'text/plain' }),
      );
      await fileInput.handleImportInputChange({ target: input });
      outcomes.inputRoutesJsonAndMtDna = calls.some(call => call[0] === 'json' && call[1] === 'profile.json')
        && calls.some(call => call[0] === 'mtdna' && call[1] === 'maternal.dna.txt');

      const beforeUnsupported = calls.length;
      setInputFiles(new File(['not supported'], 'archive.bin', { type: 'application/octet-stream' }));
      await fileInput.handleImportInputChange({ target: input });
      outcomes.inputUnsupportedNotifies = calls.slice(beforeUnsupported)
        .some(call => call[0] === 'notify' && call[1] === 'error' && call[2].includes('Unsupported file type'));

      delete dropZone.dataset.lazyDropZoneBound;
      dropZoneModule.setupDropZone();
      originalClick = input.click;
      input.click = () => { calls.push(['picker']); };
      dropZone.click();
      outcomes.dropZoneClickOpensPicker = calls.some(call => call[0] === 'picker');

      importRunning = true;
      const beforeBusyDrop = calls.length;
      dispatchDrop(new File(['{"ok":true}'], 'drop-busy.json', { type: 'application/json' }));
      await flush();
      outcomes.busyDropNotifiesAndSkips = calls.slice(beforeBusyDrop)
        .some(call => call[0] === 'notify' && call[2].includes('Import already in progress'))
        && !calls.slice(beforeBusyDrop).some(call => call[0] === 'json');

      importRunning = false;
      const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true });
      dropZone.dispatchEvent(dragOver);
      outcomes.dragOverAddsClass = dropZone.classList.contains('drag-over');
      dropZone.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true }));
      outcomes.dragLeaveRemovesClass = !dropZone.classList.contains('drag-over');

      const beforeDropJson = calls.length;
      dispatchDrop(new File(['{"dropped":true}'], 'drop-profile.json', { type: 'application/json' }));
      await flush();
      outcomes.dropRoutesJson = calls.slice(beforeDropJson)
        .some(call => call[0] === 'json' && call[1] === 'drop-profile.json');
    } finally {
      if (originalClick) input.click = originalClick;
      dropZoneRuntime.configureImportDropZoneRuntimeDeps(previousDropZoneRuntimeDeps);
      dnaBridge.configureDnaModuleBridge({
        isDNAFileByContent: null,
        detectDNAFile: null,
        handleMtDNAFile: null,
        handleDNAFile: null,
        ...previousDnaBridge,
      });
      if (dropZone.isConnected) dropZone.replaceWith(originalDropZone);
    }

    return outcomes;
  }, {
    fileInputUrl: moduleUrl('/js/import-file-input.js'),
    dropZoneUrl: moduleUrl('/js/import-drop-zone.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('PDF import review modal covers filtering mapping exclusion and batch close paths', async ({ page }) => {
  await openImportApp(page);
  await page.waitForSelector('#import-modal-overlay', { state: 'attached' });
  await page.waitForSelector('#drop-zone', { state: 'attached' });

  const results = await page.evaluate(async ({ reviewUrl }) => {
    const review = await import(reviewUrl);
    const { state } = await import('/js/state.js');
    const outcomes = {};
    const originalProfile = state.currentProfile;
    const dropZone = document.getElementById('drop-zone');
    const originalDropDisplay = dropZone?.style.display || '';
    const dispatchChange = el => el?.dispatchEvent(new Event('change', { bubbles: true }));
    const dispatchInput = el => el?.dispatchEvent(new Event('input', { bubbles: true }));
    const openMapModal = row => {
      row.querySelector('.import-map-picker-btn')?.click();
      return document.querySelector('.import-marker-map-modal');
    };
    const selectMarkerFromMapModal = (row, query, key) => {
      const mapModal = openMapModal(row);
      const modalSearch = mapModal?.querySelector('.import-map-modal-search');
      if (modalSearch && query) {
        modalSearch.value = query;
        dispatchInput(modalSearch);
      }
      mapModal?.querySelector(`[data-import-map-key="${key}"]`)?.click();
      return mapModal;
    };
    const baseMarkers = [
      {
        rawName: 'Glucose <fasting>',
        value: 5.8,
        unit: 'mmol/l',
        matched: true,
        mappedKey: 'biochemistry.glucose',
        refMin: 3.9,
        refMax: 5.5,
      },
      {
        rawName: 'Custom signal',
        value: 1000,
        unit: 'mg/l',
        matched: false,
        suggestedKey: 'customLabs.customSignal',
        suggestedName: 'Custom signal',
        suggestedCategoryLabel: 'Custom Labs',
        refMin: 500,
        refMax: 1500,
      },
      ...Array.from({ length: 11 }, (_, index) => ({
        rawName: `Mystery marker ${index + 1}`,
        value: index + 1,
        unit: 'U/l',
        matched: false,
      })),
    ];

    try {
      state.currentProfile = 'import-review-coverage';
      review.showImportPreview({
        date: '',
        sampleTime: '09:15:00',
        fasting: false,
        fileName: '<cbc-review>.pdf',
        markers: baseMarkers.map(marker => ({ ...marker })),
        privacyMethod: 'regex',
        privacyReplacements: 2,
      });

      const modal = document.getElementById('import-modal');
      const overlay = document.getElementById('import-modal-overlay');
      const confirmBtn = document.getElementById('import-confirm-btn');
      outcomes.opensAndEscapesFilename = overlay?.classList.contains('show') === true
        && modal?.innerHTML.includes('&lt;cbc-review&gt;.pdf') === true;
      outcomes.rendersSummaryAndWarnings = modal?.textContent.includes('1 matched') === true
        && modal?.textContent.includes('1 new') === true
        && modal?.textContent.includes('11 unmatched') === true
        && !!modal.querySelector('.import-review-date-warning')
        && !!modal.querySelector('.import-review-warning:not(.import-review-date-warning)');
      outcomes.missingDateDisablesImport = confirmBtn?.disabled === true;
      outcomes.collectionContextIsReviewableAndWarnsAgainstProcessingTime =
        document.getElementById('import-sample-time')?.value === '09:15'
        && document.getElementById('import-fasting')?.value === 'not-fasting'
        && modal?.textContent.includes('not received, processed, or report time');
      outcomes.renderedControlsUseDelegatedActions = modal?.querySelectorAll('[onclick],[onchange],[oninput]').length === 0
        && modal?.querySelectorAll('[data-import-review-action]').length >= 13;

      const dateInput = document.getElementById('import-manual-date');
      dateInput.value = '2026-06-01';
      dispatchChange(dateInput);

      const sampleTimeInput = document.getElementById('import-sample-time');
      const fastingInput = document.getElementById('import-fasting');
      sampleTimeInput.value = '07:40';
      dispatchChange(sampleTimeInput);
      fastingInput.value = 'fasting';
      dispatchChange(fastingInput);
      outcomes.collectionContextEditsUpdatePendingImport =
        review.getPendingImport()?.sampleTime === '07:40'
        && review.getPendingImport()?.fasting === true;
      outcomes.manualDateUpdatesPendingAndButton = review.getPendingImport()?.date === '2026-06-01'
        && confirmBtn?.disabled === false;
      dateInput.value = '';
      dispatchChange(dateInput);
      outcomes.emptyManualDateDisablesImport = review.getPendingImport()?.date === ''
        && confirmBtn?.disabled === true;
      dateInput.value = '2026-06-01';
      dispatchChange(dateInput);

      const glucoseRow = document.querySelector('tr[data-import-idx="0"]');
      const glucoseUnit = glucoseRow.querySelector('.import-unit-input');
      glucoseUnit.click();
      const glucoseMgOption = Array.from(document.querySelectorAll('.import-unit-option'))
        .find(option => option.dataset.importUnitOption === 'mg/l');
      glucoseMgOption.click();
      const glucoseValue = Number(glucoseRow.querySelector('.import-value-input').value);
      const glucoseMarker = review.getPendingImport().markers[0];
      outcomes.unitChangeRecomputesDisplayedValue = Math.abs(glucoseValue - 1045.04) < 0.01
        && Math.abs(glucoseMarker.value - 1045.04) < 0.01
        && glucoseMarker.unit === 'mg/l'
        && glucoseUnit.textContent.includes('mg/l');
      outcomes.unitChangeRecomputesLabRange = glucoseRow.querySelector('.import-range-cell')?.textContent.includes('702.702') === true
        && Math.abs(glucoseMarker.refMin - 702.702) < 0.001
        && Math.abs(glucoseMarker.refMax - 990.99) < 0.001;
      outcomes.unitPickerClosesAfterSelection = document.querySelector('.import-unit-menu') === null
        && glucoseUnit.getAttribute('aria-expanded') === 'false';

      const customRow = document.querySelector('tr[data-import-idx="1"]');
      outcomes.newMarkerShowsGenericUnitAssist = customRow?.dataset.importStatus === 'new'
        && customRow.querySelector('.import-unit-text')?.value === 'mg/l'
        && !!customRow.querySelector('.import-unit-picker-btn')
        && customRow.querySelector('.import-suggested-key')?.textContent.includes('customLabs.customSignal')
        && customRow.querySelector('.import-map-input') === null;
      selectMarkerFromMapModal(customRow, 'glucose', 'biochemistry.glucose');
      const customMarker = review.getPendingImport().markers[1];
      outcomes.mapNewMarkerByModal = customRow.dataset.importStatus === 'matched'
        && customMarker.matched === true
        && customMarker.mappedKey === 'biochemistry.glucose'
        && customRow.querySelector('.import-unit-button')?.textContent.includes('mg/l');
      openMapModal(customRow)?.querySelector('[data-import-map-action="clear"]')?.click();
      outcomes.clearNewMarkerMappingRestoresNew = customRow.dataset.importStatus === 'new'
        && customMarker.matched === false
        && customMarker.mappedKey === null
        && customMarker.suggestedKey === 'customLabs.customSignal'
        && !!customRow.querySelector('.import-unit-picker-btn');

      customRow.querySelector('.import-map-picker-btn').click();
      const mapModal = document.querySelector('.import-marker-map-modal');
      const modalSearch = mapModal.querySelector('.import-map-modal-search');
      modalSearch.value = 'ferritin';
      dispatchInput(modalSearch);
      const hasIronCategory = Array.from(mapModal.querySelectorAll('.import-map-category'))
        .some(btn => btn.textContent.includes('Iron'));
      mapModal.querySelector('[data-import-map-key="iron.ferritin"]').click();
      outcomes.mapModalSearchesCategoriesAndSelects = hasIronCategory
        && customRow.dataset.importStatus === 'matched'
        && customMarker.mappedKey === 'iron.ferritin'
        && document.querySelector('.import-marker-map-modal') === null
        && customRow.querySelector('.import-unit-button')?.textContent.includes('mg/l');
      openMapModal(customRow)?.querySelector('[data-import-map-action="clear"]')?.click();
      outcomes.clearModalMappingRestoresNew = customRow.dataset.importStatus === 'new'
        && customMarker.mappedKey === null
        && customMarker.matched === false
        && !!customRow.querySelector('.import-map-picker-btn');

      customRow.querySelector('.import-unit-picker-btn').click();
      const customGramOption = Array.from(document.querySelectorAll('.import-unit-option'))
        .find(option => option.dataset.importUnitOption === 'g/l');
      customGramOption.click();
      const customValue = Number(customRow.querySelector('.import-value-input').value);
      outcomes.customUnitPickerConvertsGenericMass = Math.abs(customValue - 1) < 0.001
        && Math.abs(customMarker.value - 1) < 0.001
        && customMarker.unit === 'g/l'
        && Math.abs(customMarker.refMin - 0.5) < 0.001
        && Math.abs(customMarker.refMax - 1.5) < 0.001
        && customRow.querySelector('.import-range-cell')?.textContent.includes('0.5')
        && customRow.querySelector('.import-range-cell')?.textContent.includes('1.5');
      const customUnitText = customRow.querySelector('.import-unit-text');
      customUnitText.value = 'mg/l';
      dispatchChange(customUnitText);
      const customValueAfterTextUnit = Number(customRow.querySelector('.import-value-input').value);
      outcomes.customUnitTextEditRecomputesAllRowValues = customValueAfterTextUnit === 1000
        && customMarker.value === 1000
        && customMarker.unit === 'mg/l'
        && customMarker.refMin === 500
        && customMarker.refMax === 1500
        && customRow.querySelector('.import-range-cell')?.textContent.includes('500')
        && customRow.querySelector('.import-range-cell')?.textContent.includes('1500');
      customRow.querySelector('.import-unit-picker-btn').click();
      const customArbOption = Array.from(document.querySelectorAll('.import-unit-option'))
        .find(option => option.dataset.importUnitOption === 'arb.j.');
      customArbOption.click();
      outcomes.customUnitPickerSkipsIncompatibleConversion = Number(customRow.querySelector('.import-value-input').value) === 1000
        && customMarker.value === 1000
        && customMarker.refMin === 500
        && customMarker.refMax === 1500
        && customMarker.unit === 'arb.j.';

      document.querySelector('.import-filter-btn[data-filter="unmatched"]').click();
      outcomes.unmatchedFilterCountsRows = document.getElementById('import-visible-count')?.textContent === '11/13 shown';

      const searchInput = document.getElementById('import-review-search');
      searchInput.value = 'mystery marker 7';
      dispatchInput(searchInput);
      outcomes.searchNarrowsFilteredRows = document.getElementById('import-visible-count')?.textContent === '1/13 shown';

      searchInput.value = '';
      dispatchInput(searchInput);
      document.querySelector('.import-filter-btn[data-filter="all"]').click();
      const mapRow = document.querySelector('tr[data-import-status="unmatched"]');
      selectMarkerFromMapModal(mapRow, 'glucose', 'biochemistry.glucose');
      outcomes.mapUnmatchedByModal = mapRow?.dataset.importStatus === 'matched'
        && review.getPendingImport().markers[2].mappedKey === 'biochemistry.glucose';
      const remappedUnitControl = mapRow?.querySelector('.import-unit-input');
      remappedUnitControl?.click();
      outcomes.mapUnmatchedRebuildsUnitPicker = remappedUnitControl?.tagName === 'BUTTON'
        && Array.from(document.querySelectorAll('.import-unit-option'))
          .some(option => option.dataset.importUnitOption === 'mg/l');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      const stillUnmatchedRow = document.querySelector('tr[data-import-status="unmatched"]');
      const invalidModal = openMapModal(stillUnmatchedRow);
      const invalidSearch = invalidModal?.querySelector('.import-map-modal-search');
      invalidSearch.value = 'Not a real marker';
      dispatchInput(invalidSearch);
      outcomes.mapModalNoResultsKeepsUnmatched = invalidModal?.textContent.includes('No markers match this search.') === true
        && stillUnmatchedRow?.dataset.importStatus === 'unmatched';
      invalidModal?.querySelector('[data-import-map-action="close"]')?.click();

      const excludeBtn = document.querySelector('tr[data-import-idx="0"] .import-exclude-btn');
      outcomes.rowActionsUseIconButtons = excludeBtn?.querySelector('.import-exclude-icon')?.textContent === '×'
        && excludeBtn?.getAttribute('aria-label')?.includes('Exclude') === true
        && !!customRow.querySelector('.import-map-picker-icon');
      excludeBtn.click();
      outcomes.excludeUpdatesRowAndCount = excludeBtn.getAttribute('aria-label') === 'Include in import'
        && excludeBtn.querySelector('.import-exclude-icon')?.textContent === '+'
        && excludeBtn.closest('tr')?.classList.contains('import-excluded') === true
        && confirmBtn?.textContent === 'Import 2 Markers'
        && review.getExcludedImportIndices().has(0) === true;
      const draftAfterExclusion = JSON.parse(sessionStorage.getItem('labcharts-import-review-draft-v1') || '{}');
      outcomes.importReviewDraftTracksEdits = draftAfterExclusion.parseResult?.date === '2026-06-01'
        && draftAfterExclusion.parseResult?.markers?.[0]?.unit === 'mg/l'
        && Math.abs(draftAfterExclusion.parseResult?.markers?.[0]?.value - 1045.04) < 0.01
        && Math.abs(draftAfterExclusion.parseResult?.markers?.[0]?.refMin - 702.702) < 0.001
        && draftAfterExclusion.parseResult?.markers?.[1]?.unit === 'arb.j.'
        && draftAfterExclusion.parseResult?.markers?.[1]?.value === 1000
        && draftAfterExclusion.parseResult?.markers?.[1]?.refMin === 500
        && draftAfterExclusion.parseResult?._excludedImportIndices?.includes(0) === true;

      document.querySelector('.import-filter-btn[data-filter="excluded"]').click();
      outcomes.excludedFilterCountsRows = document.getElementById('import-visible-count')?.textContent === '1/13 shown';

      document.querySelector('.import-filter-btn[data-filter="all"]').click();
      const selectRow = document.querySelector('tr[data-import-status="unmatched"]');
      const select = document.createElement('select');
      select.dataset.markerIdx = selectRow.dataset.importIdx;
      select.innerHTML = '<option value="iron.ferritin">Ferritin</option>';
      select.value = 'iron.ferritin';
      selectRow.querySelector('.import-map-cell').append(select);
      review.mapUnmatchedMarker(select);
      outcomes.mapUnmatchedBySelect = selectRow.dataset.importStatus === 'matched'
        && review.getPendingImport().markers[Number(select.dataset.markerIdx)].mappedKey === 'iron.ferritin'
        && confirmBtn?.textContent === 'Import 3 Markers';

      document.querySelector('#import-modal .import-review-actions [data-import-review-action="close"]').click();
      outcomes.closeClearsPending = overlay?.classList.contains('show') === false
        && review.getPendingImport() === null
        && sessionStorage.getItem('labcharts-import-review-draft-v1') === null;

      outcomes.resolveWithoutBatchReturnsFalse = review.resolveImportPreviewBatch('import') === false;

      const batchPromise = review.showImportPreviewAsync({
        date: '2026-06-02',
        fileName: 'batch-review.pdf',
        markers: [baseMarkers[0]],
      }, 2, 5);
      outcomes.asyncPreviewHidesDropZone = dropZone?.style.display === 'none'
        && document.getElementById('import-modal')?.textContent.includes('File 2 of 5') === true;
      document.querySelector('#import-modal .import-review-actions [data-import-review-action="close"]').click();
      outcomes.asyncCloseResolvesSkip = await batchPromise === 'skip'
        && dropZone?.style.display === '';

      const importBatchPromise = review.showImportPreviewAsync({
        date: '2026-06-03',
        fileName: 'batch-import-review.pdf',
        markers: [baseMarkers[0]],
      }, 3, 5);
      const resolvedImport = review.resolveImportPreviewBatch('import');
      outcomes.asyncResolveImportClearsModal = resolvedImport === true
        && await importBatchPromise === 'import'
        && overlay?.classList.contains('show') === false
        && review.getPendingImport() === null
        && dropZone?.style.display === '';
    } finally {
      state.currentProfile = originalProfile;
      window._pendingImport = null;
      window._pendingImportRefLookup = null;
      window._batchImportResolve = null;
      window._batchImportContext = null;
      document.getElementById('import-modal-overlay')?.classList.remove('show');
      if (dropZone) dropZone.style.display = originalDropDisplay;
    }

    return outcomes;
  }, {
    reviewUrl: moduleUrl('/js/pdf-import-review.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('PDF import review mobile layout keeps actions compact and visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
  });
  await openImportApp(page);
  await page.waitForSelector('#import-modal-overlay', { state: 'attached' });

  const results = await page.evaluate(async ({ reviewUrl }) => {
    const review = await import(reviewUrl);
    const outcomes = {};

    try {
      review.showImportPreview({
        date: '2026-06-18',
        fileName: 'mobile-review.pdf',
        markers: [
          {
            rawName: 'Glucose',
            value: 5.8,
            unit: 'mmol/l',
            matched: true,
            mappedKey: 'biochemistry.glucose',
            refMin: 3.9,
            refMax: 5.5,
          },
          {
            rawName: 'Custom signal',
            value: 1000,
            unit: 'mg/l',
            matched: false,
            suggestedKey: 'customLabs.customSignal',
            suggestedName: 'Custom signal',
            suggestedCategoryLabel: 'Custom Labs',
            refMin: 500,
            refMax: 1500,
          },
          {
            rawName: 'Mystery marker',
            value: 4,
            unit: 'arb.j.',
            matched: false,
          },
        ],
      });

      const modal = document.querySelector('.import-preview-modal');
      const body = document.querySelector('.import-review-body');
      const firstRow = document.querySelector('tr[data-import-idx="0"]');
      const newRow = document.querySelector('tr[data-import-idx="1"]');
      const nameCell = firstRow?.querySelector('.import-name-cell');
      const statusCell = firstRow?.querySelector('.import-status-cell');
      const actionCell = firstRow?.querySelector('.import-row-action-btn');
      const excludeBtn = firstRow?.querySelector('.import-exclude-btn');
      const mapBtn = newRow?.querySelector('.import-map-picker-btn');
      const mapBtnRect = mapBtn?.getBoundingClientRect();
      const modalRect = modal?.getBoundingClientRect();
      const bodyStyle = body ? getComputedStyle(body) : null;
      const firstRowStyle = firstRow ? getComputedStyle(firstRow) : null;

      outcomes.mobileModalUsesAvailableWidth = modalRect?.width >= 370 && modalRect.width <= 390;
      outcomes.mobileBodyUsesCompactPadding = bodyStyle?.paddingTop === '14px'
        && bodyStyle?.paddingLeft === '12px';
      outcomes.mobileNameCellBecomesHeading = getComputedStyle(nameCell).display === 'block'
        && getComputedStyle(nameCell, '::before').display === 'none'
        && nameCell?.textContent.includes('Glucose') === true;
      outcomes.mobileStatusUsesRailInsteadOfRepeatedPills = getComputedStyle(statusCell).display === 'none'
        && document.querySelector('.import-status-pill') === null
        && firstRowStyle?.borderLeftWidth === '4px';
      outcomes.mobileActionsAreIconOnlyAndPinned = getComputedStyle(actionCell).position === 'absolute'
        && excludeBtn?.querySelector('.import-exclude-icon')?.textContent === '×'
        && excludeBtn?.getAttribute('aria-label')?.includes('Exclude') === true
        && mapBtn?.querySelector('.import-map-picker-icon') !== null
        && mapBtn?.title === 'Map marker'
        && mapBtnRect?.width <= 40;
    } finally {
      document.getElementById('import-modal-overlay')?.classList.remove('show');
      window._pendingImport = null;
      window._pendingImportRefLookup = null;
      window._batchImportResolve = null;
      window._batchImportContext = null;
    }

    return outcomes;
  }, {
    reviewUrl: moduleUrl('/js/pdf-import-review.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('PDF import review draft restores after refresh', async ({ page }) => {
  await openImportApp(page);
  await page.waitForSelector('#import-modal-overlay', { state: 'attached' });

  await page.evaluate(async ({ reviewUrl }) => {
    const review = await import(reviewUrl);
    const dispatchChange = el => el?.dispatchEvent(new Event('change', { bubbles: true }));
    sessionStorage.removeItem('labcharts-import-review-draft-v1');
    localStorage.setItem('labcharts-active-profile', 'default');
    const { state } = await import('/js/state.js');
    state.currentProfile = 'default';
    review.showImportPreview({
      date: '2026-06-05',
      fileName: 'refresh-review.pdf',
      markers: [
        {
          rawName: 'Glucose',
          value: 5.8,
          unit: 'mmol/l',
          matched: true,
          mappedKey: 'biochemistry.glucose',
          refMin: 3.9,
          refMax: 5.5,
        },
        {
          rawName: 'Custom signal',
          value: 1000,
          unit: 'mg/l',
          matched: false,
          suggestedKey: 'customLabs.customSignal',
          suggestedName: 'Custom signal',
          suggestedCategoryLabel: 'Custom Labs',
        },
      ],
    });
    const valueInput = document.querySelector('tr[data-import-idx="0"] .import-value-input');
    valueInput.value = '6.2';
    dispatchChange(valueInput);
    document.querySelector('tr[data-import-idx="1"] .import-exclude-btn')?.click();
  }, {
    reviewUrl: moduleUrl('/js/pdf-import-review.js'),
  });

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#import-modal-overlay.show');

  await expect(page.locator('#import-modal')).toContainText('refresh-review.pdf');
  await expect(page.locator('#import-manual-date')).toHaveValue('2026-06-05');
  await expect(page.locator('tr[data-import-idx="0"] .import-value-input')).toHaveValue('6.2');
  await expect(page.locator('tr[data-import-idx="1"]')).toHaveClass(/import-excluded/);

  await page.evaluate(() => {
    document.querySelector('#import-modal .import-review-actions [data-import-review-action="close"]')?.click();
  });
  await expect(page.locator('#import-modal-overlay')).not.toHaveClass(/show/);
});

test('PDF import review modal covers privacy cost and debug details', async ({ page }) => {
  await openImportApp(page);
  await page.waitForSelector('#import-modal-overlay', { state: 'attached' });

  const results = await page.evaluate(async ({ reviewUrl }) => {
    const review = await import(reviewUrl);
    const outcomes = {};
    const savedStorage = {};
    const savedPIIDiffViewer = window.showPIIDiffViewer;
    let piiDiffArgs = null;
    const storageKeys = [
      'labcharts-debug',
      'labcharts-ai-provider',
      'labcharts-ollama-model',
      'labcharts-ollama-pii-model',
    ];

    try {
      for (const key of storageKeys) savedStorage[key] = localStorage.getItem(key);
      localStorage.setItem('labcharts-debug', 'true');
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ollama-model', 'llama-debug');
      localStorage.setItem('labcharts-ollama-pii-model', 'pii-debug');
      window.showPIIDiffViewer = (originalText, obfuscatedText) => {
        piiDiffArgs = [originalText, obfuscatedText];
      };

      review.showImportPreview({
        date: '2026-06-04',
        fileName: 'debug-review.pdf',
        markers: [{
          rawName: 'Glucose',
          value: 5.4,
          unit: 'mmol/l',
          matched: true,
          mappedKey: 'biochemistry.glucose',
          refMin: 3.0,
          refMax: 6.0,
        }],
        privacyMethod: 'ollama+review',
        costInfo: {
          provider: 'ollama',
          modelId: 'llama-debug',
          inputTokens: 1000,
          outputTokens: 500,
          cost: 0,
        },
        timings: { pii: 2, analysis: 3 },
        privacyOriginal: 'Patient: Jane Example',
        privacyObfuscated: 'Patient: [NAME]',
      });

      const modal = document.getElementById('import-modal');
      outcomes.ollamaPrivacyNoticeRendersReviewedState = modal?.textContent.includes('Personal information scrubbed by local AI (reviewed)') === true;
      outcomes.costInfoRendersModelTokensAndCost = modal?.textContent.includes('llama-debug') === true
        && modal?.textContent.includes('1,500 tokens') === true
        && modal?.textContent.includes('Free') === true;
      outcomes.debugDetailsRenderTimingAndPrivacyButton = modal?.textContent.includes('PII: 2s (pii-debug)') === true
        && modal?.textContent.includes('Analysis: 3s (llama-debug)') === true
        && modal?.querySelector('.import-privacy-details-btn') !== null;
      modal?.querySelector('.import-privacy-details-btn')?.click();
      outcomes.privacyDetailsButtonDelegatesToViewer = piiDiffArgs?.[0] === 'Patient: Jane Example'
        && piiDiffArgs?.[1] === 'Patient: [NAME]';
      outcomes.rangeAdoptionOptionRendersWhenLabRangesDiffer = modal?.querySelector('#import-adopt-ranges') !== null;
      outcomes.rangeAdoptionDefaultsToLabRanges = modal?.querySelector('#import-adopt-ranges')?.checked === true;
    } finally {
      window.showPIIDiffViewer = savedPIIDiffViewer;
      for (const key of storageKeys) {
        if (savedStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, savedStorage[key]);
      }
      window._pendingImport = null;
      window._pendingImportRefLookup = null;
      document.getElementById('import-modal-overlay')?.classList.remove('show');
    }

    return outcomes;
  }, {
    reviewUrl: moduleUrl('/js/pdf-import-review.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('PDF import persistence covers snapshots removal and date rename prompts', async ({ page }) => {
  await openImportApp(page);
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ persistenceUrl }) => {
    const persistence = await import(persistenceUrl);
    const reviewRuntime = await import('/js/pdf-import-review-runtime.js');
    const { state } = await import('/js/state.js');
    const outcomes = {};
    const originals = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      currentView: state.currentView,
    };
    const viewCalls = [];
    const previousReviewRuntime = reviewRuntime.configurePdfImportReviewRuntimeDeps({
      buildSidebar: () => { viewCalls.push('buildSidebar'); },
      navigate: view => { viewCalls.push(`navigate:${view}`); },
      updateHeaderDates: () => { viewCalls.push('updateHeaderDates'); },
    });
    const waitForPrompt = async () => {
      for (let attempt = 0; attempt < 40; attempt++) {
        const input = document.getElementById('prompt-dialog-input');
        if (input) return input;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error('Prompt did not open');
    };
    const submitPrompt = async (value, inputType = null) => {
      const input = await waitForPrompt();
      if (inputType) input.type = inputType;
      input.value = value;
      document.getElementById('prompt-ok')?.click();
    };

    try {
      state.currentView = 'labs';
      state.importedData = {
        entries: [
          {
            date: '2026-01-01',
            markers: { 'biochemistry.glucose': { value: 5.1, updatedAt: 1 } },
            updatedAt: 1,
          },
          {
            date: '2026-01-03',
            markers: { 'iron.ferritin': { value: 80, updatedAt: 2 } },
            updatedAt: 2,
          },
        ],
        manualValues: {
          'biochemistry.glucose:2026-01-01': { value: 5.1 },
          'iron.ferritin:2026-01-03': { value: 80 },
        },
        customMarkers: {},
      };

      const snapshot = persistence.snapshotImportedData();
      state.importedData.entries = [];
      persistence.restoreImportedDataSnapshot(snapshot);
      outcomes.snapshotRestoresImportedData = state.importedData.entries.length === 2
        && state.importedData.entries[0].date === '2026-01-01';

      const renamePromise = persistence.renameImportedEntryDate('2026-01-01');
      await submitPrompt('2026-01-02');
      const renamed = await renamePromise;
      outcomes.renameChangesDateAndManualValueKeys = renamed === true
        && state.importedData.entries.some(entry => entry.date === '2026-01-02')
        && !state.importedData.entries.some(entry => entry.date === '2026-01-01')
        && !!state.importedData.manualValues['biochemistry.glucose:2026-01-02']
        && !state.importedData.manualValues['biochemistry.glucose:2026-01-01']
        && state.importedData._deleted?.entries?.includes('2026-01-01') === true;

      const duplicatePromise = persistence.renameImportedEntryDate('2026-01-02');
      await submitPrompt('2026-01-03');
      outcomes.duplicateDateIsRejected = await duplicatePromise === false
        && state.importedData.entries.some(entry => entry.date === '2026-01-02')
        && Array.from(document.querySelectorAll('.notification-toast.error'))
          .some(toast => toast.textContent.includes('Another entry already exists'));

      const invalidPromise = persistence.renameImportedEntryDate('2026-01-02');
      await submitPrompt('2026-02-30', 'text');
      outcomes.invalidCalendarDateIsRejected = await invalidPromise === false
        && Array.from(document.querySelectorAll('.notification-toast.error'))
          .some(toast => toast.textContent.includes("doesn't exist"));

      const removed = await persistence.removeImportedEntry('2026-01-03');
      outcomes.removeDeletesEntryTombstonesAndRefreshes = removed === true
        && !state.importedData.entries.some(entry => entry.date === '2026-01-03')
        && state.importedData._deleted?.entries?.includes('2026-01-03') === true
        && viewCalls.includes('buildSidebar')
        && viewCalls.includes('updateHeaderDates')
        && viewCalls.includes('navigate:labs')
        && Array.from(document.querySelectorAll('.notification-toast.info'))
          .some(toast => toast.textContent.includes('Removed 1 marker from 2026-01-03'));

      outcomes.missingDateReturnsFalse = await persistence.removeImportedEntry('') === false
        && await persistence.renameImportedEntryDate('missing-date') === false;
    } finally {
      state.importedData = originals.importedData;
      state.currentView = originals.currentView;
      reviewRuntime.configurePdfImportReviewRuntimeDeps(previousReviewRuntime);
      document.getElementById('prompt-dialog-overlay')?.classList.remove('show');
    }

    return outcomes;
  }, {
    persistenceUrl: moduleUrl('/js/pdf-import-persistence.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
