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
      outcomes.modelMismatchDialogShowsBothModels = document.getElementById('confirm-dialog-overlay')?.textContent.includes('llama-previous') === true
        && document.getElementById('confirm-dialog-overlay')?.textContent.includes('llama-current') === true;
      continueButton?.click();
      outcomes.modelMismatchContinueKeepsCurrentModel = await continuePromise === true
        && localStorage.getItem('labcharts-ollama-model') === 'llama-current';

      const switchPromise = preflight.runPreflightChecks('OmegaQuant fatty acid report', 'omegaquant.pdf');
      const switchButton = await waitFor(() => document.getElementById('confirm-switch'));
      switchButton?.click();
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
      outcomes.unsupportedLabDialogUsesClassifiedLabel = fetchCalls === 1
        && document.getElementById('confirm-dialog-overlay')?.textContent.includes('Diagnostic Solutions (comprehensive)') === true;
      unsupportedCancel?.click();
      outcomes.unsupportedLabCancelStopsImport = await unsupportedCancelPromise === false;

      const unsupportedProceedPromise = preflight.runPreflightChecks('unknown specialty report text', 'unknown.pdf');
      const unsupportedProceed = await waitFor(() => {
        const overlay = document.getElementById('confirm-dialog-overlay');
        return overlay?.classList.contains('show') === true
          && overlay.textContent.includes('Diagnostic Solutions (comprehensive)')
          && document.getElementById('confirm-ok');
      });
      unsupportedProceed?.click();
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
