import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?importReviewCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('import file input and drop zone route browser file types and busy states', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#pdf-input', { state: 'attached' });
  await page.waitForSelector('#drop-zone', { state: 'attached' });

  const results = await page.evaluate(async ({ fileInputUrl, dropZoneUrl }) => {
    const fileInput = await import(fileInputUrl);
    const dropZoneModule = await import(dropZoneUrl);
    const outcomes = {};
    const calls = [];
    const originals = {
      importDataJSON: window.importDataJSON,
      isImportRunning: window.isImportRunning,
      isDNAFileByContent: window.isDNAFileByContent,
      detectDNAFile: window.detectDNAFile,
      handleMtDNAFile: window.handleMtDNAFile,
      handleDNAFile: window.handleDNAFile,
      showNotification: window.showNotification,
    };
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
      window.importDataJSON = file => { calls.push(['json', file.name]); };
      window.isDNAFileByContent = async file => (await file.text()).includes('MTDNA');
      window.detectDNAFile = header => header.includes('MTDNA') ? 'mtdna' : 'autosomal';
      window.handleMtDNAFile = async file => { calls.push(['mtdna', file.name]); };
      window.handleDNAFile = async file => { calls.push(['dna', file.name]); };
      window.showNotification = (message, type) => { calls.push(['notify', type, message]); };

      window.isImportRunning = () => true;
      setInputFiles(new File(['{"ok":true}'], 'busy.json', { type: 'application/json' }));
      await fileInput.handleImportInputChange({ target: input });
      outcomes.busyInputSkipsRouting = calls.length === 0;

      window.isImportRunning = () => false;
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

      window.isImportRunning = () => true;
      const beforeBusyDrop = calls.length;
      dispatchDrop(new File(['{"ok":true}'], 'drop-busy.json', { type: 'application/json' }));
      await flush();
      outcomes.busyDropNotifiesAndSkips = calls.slice(beforeBusyDrop)
        .some(call => call[0] === 'notify' && call[2].includes('Import already in progress'))
        && !calls.slice(beforeBusyDrop).some(call => call[0] === 'json');

      window.isImportRunning = () => false;
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
      Object.assign(window, originals);
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
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#import-modal-overlay', { state: 'attached' });
  await page.waitForSelector('#drop-zone', { state: 'attached' });

  const results = await page.evaluate(async ({ reviewUrl }) => {
    const review = await import(reviewUrl);
    const state = window._labState;
    const outcomes = {};
    const originalProfile = state.currentProfile;
    const dropZone = document.getElementById('drop-zone');
    const originalDropDisplay = dropZone?.style.display || '';
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
        rawName: 'Ferritin',
        value: 88,
        unit: 'ug/l',
        matched: false,
        suggestedKey: 'iron.ferritin',
        suggestedName: 'Ferritin',
        suggestedCategoryLabel: 'Iron',
        refMin: 30,
        refMax: 400,
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

      review.applyManualImportDate('2026-06-01');
      outcomes.manualDateUpdatesPendingAndButton = review.getPendingImport()?.date === '2026-06-01'
        && confirmBtn?.disabled === false;

      review.setImportReviewFilter(document.querySelector('.import-filter-btn[data-filter="unmatched"]'));
      outcomes.unmatchedFilterCountsRows = document.getElementById('import-visible-count')?.textContent === '11/13 shown';

      const searchInput = document.getElementById('import-review-search');
      searchInput.value = 'mystery marker 7';
      review.applyImportReviewFilters();
      outcomes.searchNarrowsFilteredRows = document.getElementById('import-visible-count')?.textContent === '1/13 shown';

      searchInput.value = '';
      review.setImportReviewFilter(document.querySelector('.import-filter-btn[data-filter="all"]'));
      const mapInput = document.querySelector('tr[data-import-status="unmatched"] .import-map-input');
      mapInput.value = 'Glucose (biochemistry.glucose)';
      review.mapUnmatchedMarkerInput(mapInput);
      outcomes.mapUnmatchedByLabel = mapInput.value === 'biochemistry.glucose'
        && mapInput.closest('tr')?.dataset.importStatus === 'matched'
        && review.getPendingImport().markers[2].mappedKey === 'biochemistry.glucose';

      const invalidInput = document.querySelector('tr[data-import-status="unmatched"] .import-map-input');
      invalidInput.value = 'Not a real marker';
      review.mapUnmatchedMarkerInput(invalidInput);
      outcomes.invalidMappingClearsAndNotifies = invalidInput.value === ''
        && Array.from(document.querySelectorAll('.notification-toast.error'))
          .some(toast => toast.textContent.includes('Choose a marker from the list'));

      const excludeBtn = document.querySelector('tr[data-import-idx="0"] .import-exclude-btn');
      review.toggleImportRow(excludeBtn);
      outcomes.excludeUpdatesRowAndCount = excludeBtn.textContent === 'Include'
        && excludeBtn.closest('tr')?.classList.contains('import-excluded') === true
        && confirmBtn?.textContent === 'Import 2 Markers';

      review.setImportReviewFilter(document.querySelector('.import-filter-btn[data-filter="excluded"]'));
      outcomes.excludedFilterCountsRows = document.getElementById('import-visible-count')?.textContent === '1/13 shown';

      review.closeImportModal();
      outcomes.closeClearsPending = overlay?.classList.contains('show') === false
        && review.getPendingImport() === null;

      const batchPromise = review.showImportPreviewAsync({
        date: '2026-06-02',
        fileName: 'batch-review.pdf',
        markers: [baseMarkers[0]],
      }, 2, 5);
      outcomes.asyncPreviewHidesDropZone = dropZone?.style.display === 'none'
        && document.getElementById('import-modal')?.textContent.includes('File 2 of 5') === true;
      review.closeImportModal();
      outcomes.asyncCloseResolvesSkip = await batchPromise === 'skip'
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

test('PDF import persistence covers snapshots removal and date rename prompts', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ persistenceUrl }) => {
    const persistence = await import(persistenceUrl);
    const state = window._labState;
    const outcomes = {};
    const originals = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      currentView: state.currentView,
      buildSidebar: window.buildSidebar,
      updateHeaderDates: window.updateHeaderDates,
      navigate: window.navigate,
    };
    const viewCalls = [];
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
      window.buildSidebar = () => { viewCalls.push('buildSidebar'); };
      window.updateHeaderDates = () => { viewCalls.push('updateHeaderDates'); };
      window.navigate = view => { viewCalls.push(`navigate:${view}`); };
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
          .some(toast => toast.textContent.includes('Removed imported data from 2026-01-03'));

      outcomes.missingDateReturnsFalse = await persistence.removeImportedEntry('') === false
        && await persistence.renameImportedEntryDate('missing-date') === false;
    } finally {
      state.importedData = originals.importedData;
      state.currentView = originals.currentView;
      window.buildSidebar = originals.buildSidebar;
      window.updateHeaderDates = originals.updateHeaderDates;
      window.navigate = originals.navigate;
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
