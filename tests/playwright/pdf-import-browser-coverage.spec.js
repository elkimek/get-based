import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?pdfImportCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('PDF import progress and AI-needed dialog cover browser UI states', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#import-status-fab', { state: 'attached' });

  const results = await page.evaluate(async ({ progressUrl, pdfImportUrl }) => {
    const [progress, pdfImport] = await Promise.all([
      import(progressUrl),
      import(pdfImportUrl),
    ]);
    const state = window._labState;
    const outcomes = {};
    const saved = {
      profileSex: state.profileSex,
      startOpenRouterOAuth: window.startOpenRouterOAuth,
      openSettingsModal: window.openSettingsModal,
      loadDemoData: window.loadDemoData,
    };
    const calls = [];

    try {
      window.startOpenRouterOAuth = () => calls.push(['oauth']);
      window.openSettingsModal = tab => calls.push(['settings', tab]);
      window.loadDemoData = sex => calls.push(['demo', sex]);
      state.profileSex = 'female';

      await progress.showImportProgress(2, '<cbc>.pdf');
      const dropZone = document.getElementById('drop-zone');
      const fab = document.getElementById('import-status-fab');
      outcomes.showProgressCreatesHiddenDropZone = dropZone?.classList.contains('drop-zone-hidden') === true;
      outcomes.progressStartsAtStepPercent = dropZone?.querySelector('.import-progress-bar')?.getAttribute('aria-valuenow') === '12'
        && dropZone?.querySelector('.import-progress-pct')?.textContent === '12%';
      outcomes.progressEscapesFileName = dropZone?.textContent.includes('<cbc>.pdf') === true
        && !dropZone?.querySelector('cbc');

      progress.updateImportProgressPct(42);
      outcomes.progressUpdateSyncsBarAndFab = dropZone?.querySelector('.import-progress-bar')?.getAttribute('aria-valuenow') === '42'
        && dropZone?.querySelector('.import-progress-bar-fill')?.style.width === '42%'
        && fab?.classList.contains('hidden') === false
        && fab?.querySelector('.import-status-label')?.textContent === '42%';

      await progress.showBatchImportProgress(1, 'batch-two.pdf', 2, 5);
      outcomes.batchProgressShowsCounterAndFabLabel = dropZone?.querySelector('.batch-progress-counter')?.textContent === 'Processing file 2 of 5'
        && fab?.querySelector('.import-status-label')?.textContent.includes('2/5') === true
        && fab?.querySelector('.import-status-label')?.textContent.includes('8%') === true;

      const importOverlay = document.getElementById('import-modal-overlay');
      importOverlay?.classList.add('show');
      progress.syncImportStatusFab();
      outcomes.previewOverlayHidesStatusFab = fab?.classList.contains('hidden') === true
        && dropZone?.style.display === 'none';
      importOverlay?.classList.remove('show');
      progress.hideImportProgress('cancel');
      outcomes.cancelHidesStatusFab = fab?.classList.contains('hidden') === true;

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
      window.startOpenRouterOAuth = saved.startOpenRouterOAuth;
      window.openSettingsModal = saved.openSettingsModal;
      window.loadDemoData = saved.loadDemoData;
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
        new File(['plain notes'], 'notes.txt', { type: 'text/plain' }),
        new File(['unsupported'], 'archive.bin', { type: 'application/octet-stream' }),
      ]);
      outcomes.classifierBucketsKnownFileTypes = classified.jsonFiles.length === 1
        && classified.pdfFiles.length === 3
        && classified.imageFiles.length === 1
        && classified.dnaFiles.length === 2
        && classified.textFiles.length === 1
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

test('PDF import preflight covers model mismatch and unsupported lab dialogs', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#import-status-fab', { state: 'attached' });

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
  await page.waitForSelector('#import-status-fab', { state: 'attached' });

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
