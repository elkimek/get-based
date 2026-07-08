import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?pdfImportCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('PDF import progress and AI-needed dialog cover browser UI states', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('.header-import-btn', { state: 'attached' });

  const results = await page.evaluate(async ({ progressUrl, pdfImportUrl }) => {
    const [progress, pdfImport] = await Promise.all([
      import(progressUrl),
      import(pdfImportUrl),
    ]);
    const state = window._labState;
    const outcomes = {};
    const saved = {
      profileSex: state.profileSex,
      openSettingsModal: window.openSettingsModal,
      loadDemoData: window.loadDemoData,
      navigate: window.navigate,
    };
    const calls = [];
    const previousPdfImportDeps = pdfImport.configurePdfImportDeps({
      startOpenRouterOAuth: () => calls.push(['oauth']),
    });

    try {
      window.openSettingsModal = tab => calls.push(['settings', tab]);
      window.loadDemoData = sex => calls.push(['demo', sex]);
      window.navigate = view => calls.push(['navigate', view]);
      state.profileSex = 'female';

      await progress.showImportProgress(2, '<cbc>.pdf');
      const dropZone = document.getElementById('drop-zone');
      const importBtn = document.querySelector('.header-import-btn');
      outcomes.showProgressCreatesHiddenDropZone = dropZone?.classList.contains('drop-zone-hidden') === true;
      outcomes.progressStartsAtStepPercent = dropZone?.querySelector('.import-progress-bar')?.getAttribute('aria-valuenow') === '12'
        && dropZone?.querySelector('.import-progress-pct')?.textContent === '12%'
        && importBtn?.classList.contains('is-import-running') === true
        && importBtn?.querySelector('.import-button-status-label')?.textContent === '12%';
      outcomes.progressEscapesFileName = dropZone?.textContent.includes('<cbc>.pdf') === true
        && !dropZone?.querySelector('cbc');

      progress.updateImportProgressPct(42);
      outcomes.progressUpdateSyncsBarAndImportButton = dropZone?.querySelector('.import-progress-bar')?.getAttribute('aria-valuenow') === '42'
        && dropZone?.querySelector('.import-progress-bar-fill')?.style.width === '42%'
        && importBtn?.classList.contains('is-import-running') === true
        && importBtn?.querySelector('.import-button-status-label')?.textContent === '42%'
        && importBtn?.getAttribute('aria-label') === 'Import in progress: 42%'
        && getComputedStyle(importBtn).animationName === 'importButtonPulse'
        && document.getElementById('import-status-fab') === null;

      const progressBar = dropZone?.querySelector('.import-progress-bar');
      let progressScrolled = false;
      if (progressBar) {
        const originalScrollIntoView = progressBar.scrollIntoView;
        try {
          progressBar.scrollIntoView = options => {
            progressScrolled = options?.behavior === 'smooth' && options?.block === 'center';
          };
          progress.handleImportStatusClick();
        } finally {
          progressBar.scrollIntoView = originalScrollIntoView;
        }
      }
      outcomes.importStatusClickScrollsRunningProgress = progressScrolled;

      await progress.showBatchImportProgress(1, 'batch-two.pdf', 2, 5);
      outcomes.batchProgressShowsCounterAndImportButtonLabel = dropZone?.querySelector('.batch-progress-counter')?.textContent === 'Processing file 2 of 5'
        && importBtn?.querySelector('.import-button-status-label')?.textContent.includes('2/5') === true
        && importBtn?.querySelector('.import-button-status-label')?.textContent.includes('8%') === true;

      const importOverlay = document.getElementById('import-modal-overlay');
      let previewScrolled = false;
      if (importOverlay) {
        const originalScrollIntoView = importOverlay.scrollIntoView;
        try {
          importOverlay.scrollIntoView = options => {
            previewScrolled = options?.behavior === 'smooth';
          };
          importOverlay.classList.add('show');
          progress.handleImportStatusClick();
        } finally {
          importOverlay.classList.remove('show');
          importOverlay.scrollIntoView = originalScrollIntoView;
        }
      }
      outcomes.importStatusClickScrollsOpenPreview = previewScrolled;

      importOverlay?.classList.add('show');
      progress.syncImportStatusFab();
      outcomes.previewOverlayKeepsHeaderStatusAndHidesFloatingProgress = importBtn?.classList.contains('is-import-running') === true
        && dropZone?.style.display === 'none';
      importOverlay?.classList.remove('show');

      dropZone?.querySelector('.import-progress-bar')?.remove();
      progress.handleImportStatusClick();
      outcomes.importStatusClickNavigatesWhenProgressBarIsMissing = calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard');

      progress.hideImportProgress('cancel');
      outcomes.cancelResetsImportButtonStatus = importBtn?.classList.contains('is-import-active') === false
        && importBtn?.querySelector('.import-button-status-label')?.textContent === ''
        && importBtn?.getAttribute('aria-label') === 'Import lab results';

      pdfImport.showAINeededDialog('image');
      const aiOverlay = document.getElementById('ai-needed-overlay');
      outcomes.aiNeededDialogRendersImageCopy = aiOverlay?.classList.contains('show') === true
        && aiOverlay?.textContent.includes('Reading lab values from an image') === true
        && document.getElementById('ai-needed-or') !== null;
      document.getElementById('ai-needed-key')?.click();
      outcomes.aiNeededKeyOpensSettingsAI = calls.some(call => call[0] === 'settings' && call[1] === 'ai')
        && aiOverlay?.classList.contains('show') === false;

      pdfImport.showAINeededDialog('import');
      document.getElementById('ai-needed-demo')?.click();
      outcomes.aiNeededDemoLoadsSexSpecificDemo = calls.some(call => call[0] === 'demo' && call[1] === 'female')
        && aiOverlay?.classList.contains('show') === false;

      pdfImport.showAINeededDialog('import');
      document.getElementById('ai-needed-or')?.click();
      outcomes.aiNeededOpenRouterStartsOAuth = calls.some(call => call[0] === 'oauth')
        && aiOverlay?.classList.contains('show') === false;

      pdfImport.showAINeededDialog('import');
      document.getElementById('ai-needed-cancel')?.click();
      outcomes.aiNeededCancelClosesDialog = aiOverlay?.classList.contains('show') === false;
    } finally {
      state.profileSex = saved.profileSex;
      pdfImport.configurePdfImportDeps(previousPdfImportDeps);
      window.openSettingsModal = saved.openSettingsModal;
      window.loadDemoData = saved.loadDemoData;
      window.navigate = saved.navigate;
      progress.hideImportProgress('cancel');
      document.getElementById('import-modal-overlay')?.classList.remove('show');
      document.getElementById('ai-needed-overlay')?.classList.remove('show');
    }

    return outcomes;
  }, {
    progressUrl: moduleUrl('/js/pdf-import-progress.js'),
    pdfImportUrl: moduleUrl('/js/pdf-import.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('PDF import helpers cover JSON repair, text quality, and file classification', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#drop-zone', { state: 'attached' });

  const results = await page.evaluate(async ({ pdfImportUrl }) => {
    const pdfImport = await import(pdfImportUrl);
    const outcomes = {};
    const originals = {
      isDNAFile: window.isDNAFile,
      isDNAFileByContent: window.isDNAFileByContent,
    };

    try {
      const trailingJson = pdfImport.tryParseJSON('{"date":"2026-06-01"} extra model prose');
      const repairedJson = pdfImport.tryParseJSON('{"date":"2026-06-02","markers":[{"rawName":"Glucose","value":5.2}');
      const repairedString = pdfImport.tryParseJSON('{"date":"2026-06-');
      let invalidJsonThrows = false;
      try {
        pdfImport.tryParseJSON('not json');
      } catch (err) {
        invalidJsonThrows = String(err?.message || err).includes('invalid JSON');
      }

      outcomes.jsonParserTrimsTrailingText = trailingJson.date === '2026-06-01';
      outcomes.jsonParserRepairsTruncatedObjects = repairedJson.date === '2026-06-02'
        && repairedJson.markers?.[0]?.rawName === 'Glucose';
      outcomes.jsonParserRepairsOpenStrings = repairedString.date === '2026-06-';
      outcomes.jsonParserRejectsUnrepairableInput = invalidJsonThrows;

      const goodText = Array.from({ length: 31 }, () => 'glucose').join(' ');
      const garbledText = Array.from({ length: 31 }, () => '1234567890').join(' ');
      outcomes.textQualityClassifiesEmptyPoorAndGood = pdfImport.assessTextQuality('') === 'empty'
        && pdfImport.assessTextQuality('glucose ferritin') === 'poor'
        && pdfImport.assessTextQuality(garbledText) === 'poor'
        && pdfImport.assessTextQuality(goodText) === 'good';

      window.isDNAFile = file => file.name.endsWith('.dna');
      window.isDNAFileByContent = async file => (await file.text()).includes('DNA RAW');

      const magicPdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'extensionless', {
        type: 'application/octet-stream',
      });
      const classified = await pdfImport.classifyImportFiles([
        new File(['{"ok":true}'], 'profile.json', { type: 'application/json' }),
        new File(['pdf by name'], 'report.pdf', { type: '' }),
        new File(['pdf by type'], 'report.bin', { type: 'application/pdf' }),
        magicPdf,
        new File(['image'], 'photo.webp', { type: '' }),
        new File(['dna hook'], 'genome.dna', { type: 'text/plain' }),
        new File(['DNA RAW content'], 'ancestry.csv', { type: 'text/csv' }),
        new File(['date,marker,value\n2026-06-01,Glucose,5.4'], 'lab-results.csv', { type: 'text/csv' }),
        new File(['xlsx bytes'], 'lab-results.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        new File(['plain notes'], 'notes.txt', { type: 'text/plain' }),
        new File(['unsupported'], 'archive.bin', { type: 'application/octet-stream' }),
      ]);
      outcomes.classifierBucketsKnownFileTypes = classified.jsonFiles.length === 1
        && classified.pdfFiles.length === 3
        && classified.imageFiles.length === 1
        && classified.dnaFiles.length === 2
        && classified.textFiles.length === 3
        && classified.unsupportedCount === 1;
      outcomes.pdfMagicSniffChecksHeader = await pdfImport.isPdfByMagic(magicPdf) === true
        && await pdfImport.isPdfByMagic(new File(['NOPE'], 'not-pdf.bin')) === false;
    } finally {
      window.isDNAFile = originals.isDNAFile;
      window.isDNAFileByContent = originals.isDNAFileByContent;
    }

    return outcomes;
  }, {
    pdfImportUrl: moduleUrl('/js/pdf-import.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('PDF import runtime handlers cover AI parse fallback text and image routes', async ({ page }) => {
  let jszipVendorRequests = 0;
  await page.route('**/vendor/jszip.min.js', route => {
    jszipVendorRequests += 1;
    if (jszipVendorRequests === 1) {
      route.abort('failed');
      return;
    }
    route.fulfill({
      contentType: 'text/javascript',
      body: `
        window.JSZip = {
          loadAsync: async () => ({
            files: {},
            file() { return null; },
          }),
        };
      `,
    });
  });

  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#drop-zone', { state: 'attached' });
  await page.waitForSelector('#import-modal-overlay', { state: 'attached' });

  const results = await page.evaluate(async ({ pdfImportUrl, reviewUrl }) => {
    const [pdfImport, review] = await Promise.all([
      import(pdfImportUrl),
      import(reviewUrl),
    ]);
    const state = window._labState;
    const outcomes = {};
    const storageKeys = [
      'labcharts-ai-provider',
      'labcharts-ai-paused',
      'labcharts-ollama-model',
      'labcharts-pii-review',
      'labcharts-ollama-pii-enabled',
      'labcharts-debug',
    ];
    const savedStorage = Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)]));
    const original = {
      fetch: window.fetch,
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      currentProfile: state.currentProfile,
      profileSex: state.profileSex,
      jszip: window.JSZip,
      hadJSZip: Object.prototype.hasOwnProperty.call(window, 'JSZip'),
    };
    const encoder = new TextEncoder();
    const fetchCalls = [];
    let fallbackStreamAborts = 0;

    const parsedPayload = JSON.stringify({
      testType: 'blood',
      date: '2026-06-01',
      markers: [
        {
          rawName: 'Glucose',
          value: 5.4,
          mappedKey: 'biochemistry.glucose',
          unit: 'mmol/L',
          refMin: 3.9,
          refMax: 5.5,
        },
        {
          rawName: 'Novel Peptide',
          value: 8.1,
          mappedKey: null,
          suggestedKey: 'runtimeImport.novelPeptide',
          suggestedName: 'Novel Peptide',
          suggestedCategoryLabel: 'Runtime Import',
          suggestedGroup: 'Coverage',
          unit: 'U/L',
          refMin: 0,
          refMax: 10,
        },
      ],
    });
    const wrappedPayload = `<think>scratchpad</think>\n\`\`\`json\n${parsedPayload}\n\`\`\``;
    const labText = Array.from({ length: 36 }, (_, index) => (
      index % 6 === 0
        ? 'Patient Jane Example collection 2026-06-01 glucose 5.4 mmol/L ferritin marker'
        : 'routine chemistry report value reference interval serum plasma validated'
    )).join(' ');

    const jsonResponse = content => new Response(JSON.stringify({
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 21, completion_tokens: 9 },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const streamResponse = content => {
      const event = JSON.stringify({
        choices: [{ delta: { content }, finish_reason: null }],
        usage: { prompt_tokens: 31, completion_tokens: 11 },
      });
      const done = JSON.stringify({
        choices: [{ finish_reason: 'stop' }],
        usage: { prompt_tokens: 31, completion_tokens: 11 },
      });
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${done}\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n'));
          controller.close();
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    };
    const requestText = body => (body.messages || []).map(message => {
      if (Array.isArray(message.content)) {
        return message.content.map(block => block.text || block.type || '').join(' ');
      }
      return String(message.content || '');
    }).join('\n');

    try {
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem('labcharts-ollama-model', 'llama-import-coverage');
      localStorage.setItem('labcharts-pii-review', 'false');
      localStorage.setItem('labcharts-ollama-pii-enabled', 'false');
      localStorage.removeItem('labcharts-debug');
      state.currentProfile = 'pdf-import-runtime-coverage';
      state.profileSex = 'female';
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        customMarkers: {},
      };

      window.fetch = async (_url, options = {}) => {
        const body = JSON.parse(String(options.body || '{}'));
        const text = requestText(body);
        fetchCalls.push({ stream: body.stream === true, text });
        if (text.includes('What type of lab test')) return jsonResponse('{"testType":"blood"}');
        if (body.stream && text.includes('fallback-stream.pdf') && fallbackStreamAborts === 0) {
          fallbackStreamAborts += 1;
          throw new Error('bodyStreamBuffer was aborted by user');
        }
        return body.stream ? streamResponse(wrappedPayload) : jsonResponse(wrappedPayload);
      };

      const fallbackParsed = await pdfImport.parseLabPDFWithAI(
        labText,
        'fallback-stream.pdf',
        () => {},
      );
      outcomes.streamAbortFallbackRetriesWithoutStreaming = fallbackStreamAborts === 1
        && fallbackParsed.date === '2026-06-01'
        && fallbackParsed.markers.length === 2
        && fallbackParsed.provider === 'ollama';

      const imageProgress = [];
      const imageParsed = await pdfImport.parseLabPDFWithAIImages(
        [{ base64: 'aW1hZ2UtYnl0ZXM=', mediaType: 'image/png', page: 1 }],
        'direct-image.png',
        pct => imageProgress.push(pct),
      );
      outcomes.imageParserBuildsVisionPayloadAndProgress = imageParsed.imageMode === true
        && imageParsed.markers[0].mappedKey === 'biochemistry.glucose'
        && imageProgress.length > 0
        && fetchCalls.some(call => call.stream && call.text.includes('image_url'));

      await pdfImport.handlePDFFile(
        new File(['unused'], 'runtime-report.pdf', { type: 'application/pdf' }),
        false,
        labText,
      );
      const textPending = review.getPendingImport();
      const textModal = document.getElementById('import-modal');
      outcomes.textHandlerRunsFullPipelineToPreview = textPending?.fileName === 'runtime-report.pdf'
        && textPending.privacyMethod === 'regex'
        && textPending.costInfo?.modelId === 'llama-import-coverage'
        && textPending.importHash
        && textPending._importProfileId === 'pdf-import-runtime-coverage'
        && textModal?.textContent.includes('runtime-report.pdf') === true;
      review.closeImportModal();

      await pdfImport.handleTextFile(new File(['   \n'], 'blank.txt', { type: 'text/plain' }));
      outcomes.emptyTextFileShowsError = Array.from(document.querySelectorAll('.notification-toast.error'))
        .some(toast => toast.textContent.includes('Text file is empty'));

      await pdfImport.handleTextFile(new File([labText], 'notes.txt', { type: 'text/plain' }));
      const textFilePending = review.getPendingImport();
      outcomes.nonEmptyTextFileRoutesThroughPdfHandler = textFilePending?.fileName === 'notes.txt'
        && textFilePending.markers.length === 2;
      review.closeImportModal();

      await pdfImport.handleTextFile(new File([labText], 'lab-results.csv', { type: 'text/csv' }));
      const csvFilePending = review.getPendingImport();
      outcomes.csvFileRoutesThroughTextImportPipeline = csvFilePending?.fileName === 'lab-results.csv'
        && csvFilePending.markers.length === 2
        && csvFilePending.privacyMethod === 'regex';
      review.closeImportModal();

      delete window.JSZip;
      const retryXlsxFile = new File(
        [new Uint8Array([0x50, 0x4b, 0x03, 0x04])],
        'retry.xlsx',
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      );
      let firstLoaderError = '';
      let secondLoaderError = '';
      try {
        await pdfImport.extractXLSXText(retryXlsxFile);
      } catch (err) {
        firstLoaderError = err?.message || String(err);
      }
      try {
        await pdfImport.extractXLSXText(retryXlsxFile);
      } catch (err) {
        secondLoaderError = err?.message || String(err);
      }
      outcomes.xlsxJsZipLoaderRetriesAfterScriptFailure = firstLoaderError.includes('Failed to load /vendor/jszip.min.js')
        && secondLoaderError.includes('Workbook metadata is missing');

      const xlsxEntries = {
        'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?>
          <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
            <sheets><sheet name="Results" sheetId="1" r:id="rId1"/></sheets>
          </workbook>`,
        'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?>
          <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
            <Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/>
          </Relationships>`,
        'xl/sharedStrings.xml': `<?xml version="1.0" encoding="UTF-8"?>
          <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
            <si><t>Date</t></si><si><t>Marker</t></si><si><t>Value</t></si>
            <si><t>2026-06-01</t></si><si><t>Glucose</t></si><si><t>5.4</t></si><si><t>Flag</t></si>
          </sst>`,
        'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8"?>
          <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
            <numFmts count="1"><numFmt numFmtId="164" formatCode="body"/></numFmts>
            <cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs>
          </styleSheet>`,
        'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?>
          <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
            <sheetData>
              <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>6</v></c></row>
              <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c><c r="D2" s="1"><v>7</v></c></row>
            </sheetData>
          </worksheet>`,
      };
      window.JSZip = {
        loadAsync: async () => ({
          files: Object.fromEntries(Object.keys(xlsxEntries).map(path => [path, {}])),
          file(path) {
            return xlsxEntries[path] == null ? null : { async: async () => xlsxEntries[path] };
          },
        }),
      };
      const xlsxFile = new File(
        [new Uint8Array([0x50, 0x4b, 0x03, 0x04])],
        'lab-results.xlsx',
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      );
      const extractedXlsxText = await pdfImport.extractXLSXText(xlsxFile);
      outcomes.xlsxExtractorReadsWorkbookCells = extractedXlsxText.includes('Workbook: lab-results.xlsx')
        && extractedXlsxText.includes('Sheet: Results')
        && extractedXlsxText.includes('Glucose')
        && extractedXlsxText.includes('\t7')
        && !extractedXlsxText.includes('1900-01');
      await pdfImport.handleTextFile(xlsxFile);
      const xlsxFilePending = review.getPendingImport();
      outcomes.xlsxFileRoutesThroughTextImportPipeline = xlsxFilePending?.fileName === 'lab-results.xlsx'
        && xlsxFilePending.markers.length === 2
        && xlsxFilePending.privacyMethod === 'regex';
      review.closeImportModal();

      await pdfImport.handleImageFile(new File(['image bytes'], 'scan.png', { type: 'image/png' }));
      const imagePending = review.getPendingImport();
      outcomes.imageFileHandlerOpensPreview = imagePending?.fileName === 'scan.png'
        && imagePending.markers.length === 2;
      outcomes.imageFileHandlerCarriesImageMetadata = imagePending?.fileName === 'scan.png'
        && imagePending.imageMode === true
        && imagePending.privacyMethod === 'none (image mode)';
      outcomes.imageFileHandlerRecordsCostHashAndProfile = imagePending?.fileName === 'scan.png'
        && imagePending.costInfo?.inputTokens > 0
        && imagePending.costInfo?.outputTokens > 0
        && !!imagePending.importHash
        && imagePending._importProfileId === 'pdf-import-runtime-coverage';
      review.closeImportModal();

      outcomes.fetchMockCoveredClassificationStreamAndRetry = fetchCalls.some(call => !call.stream && call.text.includes('What type of lab test'))
        && fetchCalls.filter(call => call.stream).length >= 3
        && fetchCalls.some(call => !call.stream && call.text.includes('fallback-stream.pdf'));
    } finally {
      window.fetch = original.fetch;
      state.importedData = original.importedData;
      state.currentProfile = original.currentProfile;
      state.profileSex = original.profileSex;
      if (original.hadJSZip) window.JSZip = original.jszip;
      else delete window.JSZip;
      for (const [key, value] of Object.entries(savedStorage)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      review.closeImportModal();
      document.getElementById('ai-needed-overlay')?.classList.remove('show');
      document.getElementById('confirm-dialog-overlay')?.classList.remove('show');
      window.hideImportProgress?.('cancel');
    }

    return outcomes;
  }, {
    pdfImportUrl: moduleUrl('/js/pdf-import.js'),
    reviewUrl: moduleUrl('/js/pdf-import-review.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('PDF import scanned PDF dialog covers image mode choices', async ({ page }) => {
  await page.route('**/js/pdfjs-loader.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      export function loadPdfJs() { return Promise.resolve({}); }
      export async function getPdfDocument() {
        return {
          numPages: 1,
          async getPage() {
            return {
              async getTextContent() { return { items: [] }; },
              getViewport() { return { width: 10, height: 10 }; },
              render() { return { promise: Promise.resolve() }; },
            };
          },
        };
      }
    `,
  }));
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#drop-zone', { state: 'attached' });

  const results = await page.evaluate(async ({ pdfImportUrl }) => {
    const pdfImport = await import(pdfImportUrl);
    const outcomes = {};
    const original = {
      setTimeout: window.setTimeout,
      aiProvider: localStorage.getItem('labcharts-ai-provider'),
      aiPaused: localStorage.getItem('labcharts-ai-paused'),
    };
    let createdConfirmOverlay = false;
    let createdConfirmDialog = false;

    const waitFor = async (predicate, label) => {
      for (let i = 0; i < 120; i += 1) {
        const value = predicate();
        if (value) return value;
        await new Promise(resolve => original.setTimeout.call(window, resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const ensureConfirmDialog = () => {
      let overlay = document.getElementById('confirm-dialog-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'confirm-dialog-overlay';
        overlay.className = 'confirm-overlay';
        document.body.appendChild(overlay);
        createdConfirmOverlay = true;
      }
      let dialog = document.getElementById('confirm-dialog');
      if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = 'confirm-dialog';
        dialog.className = 'confirm-dialog';
        overlay.appendChild(dialog);
        createdConfirmDialog = true;
      }
    };
    const notificationsText = () => Array.from(document.querySelectorAll('.notification-toast'))
      .map(toast => toast.textContent || '')
      .join('\n');
    const runChoice = async (choice) => {
      ensureConfirmDialog();
      document.querySelectorAll('.notification-toast').forEach(toast => toast.remove());
      document.getElementById('ai-needed-overlay')?.classList.remove('show');
      window.hideImportProgress?.('cancel');

      const file = new File(['%PDF-1.4 scanned'], `scanned-${choice}.pdf`, { type: 'application/pdf' });
      const pending = pdfImport.handlePDFFile(file);
      const dialogState = await waitFor(() => {
        const overlay = document.getElementById('confirm-dialog-overlay');
        const dialog = document.getElementById('confirm-dialog');
        const buttons = dialog ? Array.from(dialog.querySelectorAll('button')) : [];
        if (overlay?.classList.contains('show') && buttons.length === 3) return { overlay, buttons };
        return null;
      }, `${choice} scanned PDF dialog`);

      if (choice === 'escape') {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      } else {
        const label = choice === 'cancel' ? 'Cancel' : choice === 'text' ? 'Try text anyway' : 'Use image mode';
        dialogState.buttons.find(btn => btn.textContent.trim() === label)?.click();
      }
      await pending;

      return {
        hidden: dialogState.overlay.classList.contains('show') === false,
        notifications: notificationsText(),
        aiNeeded: document.getElementById('ai-needed-overlay')?.classList.contains('show') === true,
        aiNeededText: document.getElementById('ai-needed-overlay')?.textContent || '',
      };
    };

    try {
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'true');

      const cancel = await runChoice('cancel');
      outcomes.cancelChoiceClosesScannedPdfDialog = cancel.hidden
        && !cancel.notifications.includes('PDF appears empty')
        && cancel.aiNeeded === false;

      const text = await runChoice('text');
      outcomes.textChoiceContinuesToEmptyPdfError = text.hidden
        && text.notifications.includes('PDF appears empty');

      const image = await runChoice('image');
      outcomes.imageChoiceShowsImageAiNeededDialog = image.hidden
        && image.aiNeeded
        && image.aiNeededText.includes('Reading lab values from an image');

      const escape = await runChoice('escape');
      outcomes.escapeKeyCancelsScannedPdfDialog = escape.hidden
        && escape.aiNeeded === false
        && !escape.notifications.includes('PDF appears empty');
    } finally {
      if (original.aiProvider == null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', original.aiProvider);
      if (original.aiPaused == null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', original.aiPaused);
      window.hideImportProgress?.('cancel');
      document.getElementById('ai-needed-overlay')?.classList.remove('show');
      document.getElementById('confirm-dialog-overlay')?.classList.remove('show');
      document.querySelectorAll('.notification-toast').forEach(toast => toast.remove());
      if (createdConfirmDialog && !createdConfirmOverlay) document.getElementById('confirm-dialog')?.remove();
      if (createdConfirmOverlay) document.getElementById('confirm-dialog-overlay')?.remove();
    }

    return outcomes;
  }, {
    pdfImportUrl: moduleUrl('/js/pdf-import.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('PDF import confirm flow covers preview persistence', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#import-modal-overlay', { state: 'attached' });

  const results = await page.evaluate(async ({ pdfImportUrl, reviewUrl }) => {
    const [pdfImport, review] = await Promise.all([
      import(pdfImportUrl),
      import(reviewUrl),
    ]);
    const state = window._labState;
    const outcomes = {};
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, key === null || key === undefined ? null : localStorage.getItem(key)];
    }));
    const original = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      currentProfile: state.currentProfile,
      profileSex: state.profileSex,
      maybeShowEncryptionNudge: window.maybeShowEncryptionNudge,
    };
    const resetNotifications = () => document.querySelectorAll('.notification-toast').forEach(el => el.remove());

    try {
      state.currentProfile = 'pdf-import-confirm-coverage';
      state.profileSex = 'male';
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        manualValues: {},
        refOverrides: {},
      };
      window.maybeShowEncryptionNudge = () => {};

      review.showImportPreview({
        date: '2026-06-07',
        fileName: 'confirm-import.pdf',
        testType: 'blood',
        importHash: 'confirm-import-hash',
        costInfo: {
          provider: 'ollama',
          modelId: 'llama-confirm',
          inputTokens: 10,
          outputTokens: 5,
          cost: 0,
        },
        markers: [{
          rawName: 'Glucose',
          value: 5.4,
          unit: 'mmol/L',
          refMin: 3.9,
          refMax: 5.5,
          matched: true,
          mappedKey: 'biochemistry.glucose',
        }],
      });
      await pdfImport.confirmImport();
      const imported = state.importedData.entries.find(entry => entry.date === '2026-06-07');
      outcomes.confirmImportPersistsMatchedPreview =
        imported?.markers?.['biochemistry.glucose'] === 5.4
        && imported.importedWith?.provider === 'ollama'
        && imported.importedWith?.modelId === 'llama-confirm'
        && imported.importHash === 'confirm-import-hash'
        && imported.sourceFiles?.includes('confirm-import.pdf') === true
        && review.getPendingImport() === null;
    } finally {
      state.importedData = original.importedData;
      state.currentProfile = original.currentProfile;
      state.profileSex = original.profileSex;
      if (original.maybeShowEncryptionNudge) window.maybeShowEncryptionNudge = original.maybeShowEncryptionNudge;
      else delete window.maybeShowEncryptionNudge;
      review.closeImportModal();
      document.getElementById('confirm-dialog-overlay')?.classList.remove('show');
      document.getElementById('ai-needed-overlay')?.classList.remove('show');
      pdfImport.hideImportProgress('cancel');
      resetNotifications();
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    pdfImportUrl: moduleUrl('/js/pdf-import.js'),
    reviewUrl: moduleUrl('/js/pdf-import-review.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('PDF import preflight covers model mismatch and unsupported lab dialogs', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('.header-import-btn', { state: 'attached' });

  const results = await page.evaluate(async ({ preflightUrl }) => {
    const preflight = await import(preflightUrl);
    const state = window._labState;
    const outcomes = {};
    const originalEntries = Array.isArray(state.importedData?.entries)
      ? JSON.parse(JSON.stringify(state.importedData.entries))
      : undefined;
    const savedStorage = {};
    const storageKeys = [
      'labcharts-ai-provider',
      'labcharts-ai-paused',
      'labcharts-ollama-model',
    ];
    const originalFetch = window.fetch;
    const waitFor = async predicate => {
      for (let i = 0; i < 80; i += 1) {
        const value = predicate();
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return null;
    };

    try {
      for (const key of storageKeys) savedStorage[key] = localStorage.getItem(key);
      state.importedData ||= {};
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem('labcharts-ollama-model', 'llama-current');

      state.importedData.entries = [{
        date: '2026-05-20',
        importedWith: { provider: 'ollama', modelId: 'llama-previous' },
      }];
      const continuePromise = preflight.runPreflightChecks('OmegaQuant fatty acid report', 'omegaquant.pdf');
      const continueButton = await waitFor(() => document.getElementById('confirm-continue'));
      if (!continueButton) throw new Error('model-mismatch confirm-continue not found');
      outcomes.modelMismatchDialogShowsBothModels = document.getElementById('confirm-dialog-overlay')?.textContent.includes('llama-previous') === true
        && document.getElementById('confirm-dialog-overlay')?.textContent.includes('llama-current') === true;
      continueButton.click();
      outcomes.modelMismatchContinueKeepsCurrentModel = await continuePromise === true
        && localStorage.getItem('labcharts-ollama-model') === 'llama-current';

      const switchPromise = preflight.runPreflightChecks('OmegaQuant fatty acid report', 'omegaquant.pdf');
      const switchButton = await waitFor(() => document.getElementById('confirm-switch'));
      if (!switchButton) throw new Error('model-mismatch confirm-switch not found');
      switchButton.click();
      outcomes.modelMismatchSwitchRestoresPreviousModel = await switchPromise === true
        && localStorage.getItem('labcharts-ollama-model') === 'llama-previous';

      state.importedData.entries = [];
      localStorage.setItem('labcharts-ollama-model', 'llama-current');
      let fetchCalls = 0;
      window.fetch = async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: '{"testType":"comprehensive","labName":"Diagnostic Solutions"}',
            },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 12, completion_tokens: 6 },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const unsupportedCancelPromise = preflight.runPreflightChecks('unknown specialty report text', 'unknown.pdf');
      const unsupportedCancel = await waitFor(() => {
        const overlay = document.getElementById('confirm-dialog-overlay');
        return overlay?.classList.contains('show') === true
          && overlay.textContent.includes('Diagnostic Solutions (comprehensive)')
          && document.getElementById('confirm-cancel');
      });
      if (!unsupportedCancel) throw new Error('unsupported-lab confirm-cancel not found');
      outcomes.unsupportedLabDialogUsesClassifiedLabel = fetchCalls === 1
        && document.getElementById('confirm-dialog-overlay')?.textContent.includes('Diagnostic Solutions (comprehensive)') === true;
      unsupportedCancel.click();
      outcomes.unsupportedLabCancelStopsImport = await unsupportedCancelPromise === false;

      const unsupportedProceedPromise = preflight.runPreflightChecks('unknown specialty report text', 'unknown.pdf');
      const unsupportedProceed = await waitFor(() => {
        const overlay = document.getElementById('confirm-dialog-overlay');
        return overlay?.classList.contains('show') === true
          && overlay.textContent.includes('Diagnostic Solutions (comprehensive)')
          && document.getElementById('confirm-ok');
      });
      if (!unsupportedProceed) throw new Error('unsupported-lab confirm-ok not found');
      unsupportedProceed.click();
      outcomes.unsupportedLabCanProceed = await unsupportedProceedPromise === true
        && fetchCalls === 2;
    } finally {
      if (originalEntries === undefined) delete state.importedData.entries;
      else state.importedData.entries = originalEntries;
      for (const key of storageKeys) {
        if (savedStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, savedStorage[key]);
      }
      window.fetch = originalFetch;
      document.getElementById('confirm-dialog-overlay')?.classList.remove('show');
    }

    return outcomes;
  }, {
    preflightUrl: moduleUrl('/js/pdf-import-preflight.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('PDF import preflight covers duplicate prompts, cancellation, and supported classifications', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('.header-import-btn', { state: 'attached' });

  const results = await page.evaluate(async ({ preflightUrl, utilsUrl }) => {
    const [preflight, utils] = await Promise.all([
      import(preflightUrl),
      import(utilsUrl),
    ]);
    const state = window._labState;
    const outcomes = {};
    const originals = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      fetch: window.fetch,
    };
    const savedStorage = {};
    const storageKeys = [
      'labcharts-ai-provider',
      'labcharts-ai-paused',
      'labcharts-ollama-model',
      'labcharts-openrouter-model',
      'labcharts-venice-model',
      'labcharts-routstr-model',
      'labcharts-ppq-model',
      'labcharts-custom-model',
    ];
    const waitForButton = async id => {
      for (let i = 0; i < 80; i += 1) {
        const button = document.getElementById(id);
        const overlay = document.getElementById('confirm-dialog-overlay');
        if (button && overlay?.classList.contains('show')) return button;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`${id} not found`);
    };

    try {
      for (const key of storageKeys) savedStorage[key] = localStorage.getItem(key);
      state.importedData = { ...state.importedData, entries: [] };
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem('labcharts-ollama-model', 'llama-current');

      outcomes.modelNormalizationMatchesAcrossProviders = preflight.normalizeImportModelId('anthropic/claude-sonnet-4.6-20260201') === 'claude-sonnet-4-6'
        && preflight.normalizeImportModelId('claude.sonnet.4.6') === 'claude-sonnet-4-6';

      const duplicateText = 'OmegaQuant Complete fatty acid report with EPA DHA';
      state.importedData.entries = [{
        date: '2026-06-01',
        importHash: utils.hashString(duplicateText),
      }];
      const duplicateCancelPromise = preflight.runPreflightChecks(duplicateText, 'omegaquant.pdf');
      const duplicateCancel = await waitForButton('confirm-cancel');
      outcomes.duplicateDialogShowsImportedDate = document.getElementById('confirm-dialog-overlay')?.textContent.includes('Jun 1, 2026') === true;
      duplicateCancel.click();
      outcomes.duplicateCancelStopsImport = await duplicateCancelPromise === false;

      const duplicateEscapePromise = preflight.runPreflightChecks(duplicateText, 'omegaquant.pdf');
      await waitForButton('confirm-cancel');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      outcomes.duplicateEscapeCancelsImport = await duplicateEscapePromise === false
        && document.getElementById('confirm-dialog-overlay')?.classList.contains('show') === false;

      const duplicateProceedPromise = preflight.runPreflightChecks(duplicateText, 'omegaquant.pdf');
      const duplicateProceed = await waitForButton('confirm-ok');
      duplicateProceed.click();
      outcomes.duplicateProceedContinuesImport = await duplicateProceedPromise === true;

      state.importedData.entries = [{
        date: '2026-05-20',
        importedWith: { provider: 'ollama', modelId: 'llama-previous' },
      }];
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ollama-model', 'llama-current');
      const mismatchCancelPromise = preflight.runPreflightChecks(duplicateText, 'omegaquant.pdf');
      const mismatchCancel = await waitForButton('confirm-cancel');
      mismatchCancel.click();
      outcomes.modelMismatchCancelStopsImport = await mismatchCancelPromise === false
        && localStorage.getItem('labcharts-ollama-model') === 'llama-current';

      state.importedData.entries = [{
        date: '2026-05-21',
        importedWith: { provider: 'openrouter', modelId: 'anthropic/claude-sonnet-4.6' },
      }];
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ollama-model', 'llama-current');
      localStorage.setItem('labcharts-openrouter-model', 'anthropic/claude-opus-4.7');
      const switchProviderPromise = preflight.runPreflightChecks(duplicateText, 'omegaquant.pdf');
      const switchProvider = await waitForButton('confirm-switch');
      switchProvider.click();
      outcomes.modelMismatchSwitchCanRestorePreviousProvider = await switchProviderPromise === true
        && localStorage.getItem('labcharts-ai-provider') === 'openrouter'
        && localStorage.getItem('labcharts-openrouter-model') === 'anthropic/claude-sonnet-4.6';

      state.importedData.entries = [];
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ollama-model', 'llama-current');
      const classificationResponses = [
        '{"testType":"blood"}',
        '{"testType":"OAT"}',
        'not JSON',
      ];
      let fetchCalls = 0;
      window.fetch = async () => {
        fetchCalls += 1;
        const content = classificationResponses.shift();
        return new Response(JSON.stringify({
          choices: [{
            message: { content },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 4 },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      outcomes.bloodClassificationSkipsUnsupportedDialog = await preflight.runPreflightChecks('plain mystery report text', 'mystery.pdf') === true
        && fetchCalls === 1
        && document.getElementById('confirm-dialog-overlay')?.classList.contains('show') === false;
      outcomes.adapterClassificationSkipsUnsupportedDialog = await preflight.runPreflightChecks('specialty urine metabolite report text', 'specialty.pdf') === true
        && fetchCalls === 2
        && document.getElementById('confirm-dialog-overlay')?.classList.contains('show') === false;
      outcomes.invalidClassificationResponseFailsOpen = await preflight.runPreflightChecks('unclassified report text', 'unclassified.pdf') === true
        && fetchCalls === 3
        && document.getElementById('confirm-dialog-overlay')?.classList.contains('show') === false;
    } finally {
      state.importedData = originals.importedData;
      window.fetch = originals.fetch;
      for (const key of storageKeys) {
        if (savedStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, savedStorage[key]);
      }
      document.getElementById('confirm-dialog-overlay')?.classList.remove('show');
    }

    return outcomes;
  }, {
    preflightUrl: moduleUrl('/js/pdf-import-preflight.js'),
    utilsUrl: moduleUrl('/js/utils.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('PDF import covers extraction errors drop zone setup and batch retry', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#drop-zone', { state: 'attached' });

  const results = await page.evaluate(async ({ pdfImportUrl }) => {
    const pdfImport = await import(pdfImportUrl);
    const outcomes = {};
    const dropZone = document.getElementById('drop-zone');
    const pdfInput = document.getElementById('pdf-input');
    const original = {
      pdfInputClick: pdfInput?.click,
      setTimeout: window.setTimeout,
      aiProvider: localStorage.getItem('labcharts-ai-provider'),
      aiPaused: localStorage.getItem('labcharts-ai-paused'),
      ollamaModel: localStorage.getItem('labcharts-ollama-model'),
      ollamaPiiEnabled: localStorage.getItem('labcharts-ollama-pii-enabled'),
      piiReview: localStorage.getItem('labcharts-pii-review'),
    };
    const waitFor = async (predicate, label) => {
      for (let i = 0; i < 80; i += 1) {
        const value = predicate();
        if (value) return value;
        await new Promise(resolve => original.setTimeout.call(window, resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const setOrRemove = (key, value) => {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    };
    const notificationsText = () => Array.from(document.querySelectorAll('.notification-toast'))
      .map(toast => toast.textContent || '')
      .join('\n');

    try {
      const invalidPdf = new File(['this is not a PDF'], 'broken.pdf', { type: 'application/pdf' });
      let textError = '';
      try {
        await pdfImport.extractPDFText(invalidPdf);
      } catch (err) {
        textError = String(err?.message || err);
      }
      let imageError = '';
      try {
        await pdfImport.extractPDFImages(invalidPdf, 1);
      } catch (err) {
        imageError = String(err?.message || err);
      }

      const fallbackPdf = new File(['also not a PDF'], 'fallback.pdf', { type: 'application/pdf' });
      Object.defineProperty(fallbackPdf, 'arrayBuffer', {
        value: () => Promise.reject(new Error('forced arrayBuffer failure')),
      });
      let fallbackError = '';
      try {
        await pdfImport.extractPDFText(fallbackPdf);
      } catch (err) {
        fallbackError = String(err?.message || err);
      }
      outcomes.invalidPdfExtractionAndFileReaderFallbackRejectThroughPdfLoader = textError.length > 0
        && imageError.length > 0
        && fallbackError.length > 0
        && !fallbackError.includes('forced arrayBuffer failure');

      await pdfImport.handlePDFFile(invalidPdf);
      await waitFor(() => notificationsText().includes('Error parsing PDF:'), 'PDF parsing error notification');
      outcomes.handlePDFFileFormatsParsingErrorNotification = notificationsText().includes('Error parsing PDF:')
        && notificationsText().includes('Invalid PDF');

      let inputClicks = 0;
      if (!dropZone || !pdfInput) throw new Error('Expected drop zone and PDF input to exist.');
      pdfInput.click = () => { inputClicks += 1; };
      pdfImport.setupDropZone();
      dropZone.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      outcomes.setupDropZoneClickRoutesToPdfInput = inputClicks >= 1;

      dropZone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
      const dragClassAdded = dropZone.classList.contains('drag-over');
      dropZone.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true }));
      outcomes.setupDropZoneDragEventsToggleClass = dragClassAdded
        && !dropZone.classList.contains('drag-over');

      const unsupportedTransfer = new DataTransfer();
      unsupportedTransfer.items.add(new File(['binary'], 'unsupported.bin', { type: 'application/octet-stream' }));
      dropZone.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: unsupportedTransfer,
      }));
      await waitFor(() => notificationsText().includes('Unsupported file type'), 'unsupported drop notification');
      outcomes.dropUnsupportedFileShowsNotification = notificationsText().includes('Unsupported file type');

      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem('labcharts-ollama-model', 'coverage-batch-model');
      localStorage.setItem('labcharts-ollama-pii-enabled', 'false');
      localStorage.setItem('labcharts-pii-review', 'false');
      const immediateDelays = [];
      window.setTimeout = (callback, delay, ...args) => {
        if (delay === 5000) {
          immediateDelays.push(delay);
          return original.setTimeout.call(window, () => callback(...args), 0);
        }
        return original.setTimeout.call(window, callback, delay, ...args);
      };
      await pdfImport.handleBatchPDFs([invalidPdf]);
      await waitFor(() => notificationsText().includes('Batch import complete'), 'batch completion notification');
      outcomes.batchInvalidPdfRetriesOnceAndCompletes = immediateDelays.includes(5000)
        && notificationsText().includes('Retrying 1 failed file')
        && notificationsText().includes('Batch import complete: 1 failed');
    } finally {
      window.setTimeout = original.setTimeout;
      if (pdfInput && original.pdfInputClick) pdfInput.click = original.pdfInputClick;
      setOrRemove('labcharts-ai-provider', original.aiProvider);
      setOrRemove('labcharts-ai-paused', original.aiPaused);
      setOrRemove('labcharts-ollama-model', original.ollamaModel);
      setOrRemove('labcharts-ollama-pii-enabled', original.ollamaPiiEnabled);
      setOrRemove('labcharts-pii-review', original.piiReview);
      document.getElementById('confirm-dialog-overlay')?.classList.remove('show');
      document.getElementById('ai-needed-overlay')?.classList.remove('show');
      window.hideImportProgress?.('cancel');
    }

    return outcomes;
  }, {
    pdfImportUrl: moduleUrl('/js/pdf-import.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
