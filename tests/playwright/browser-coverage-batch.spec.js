import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?coverageBatch=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('feedback modal browser contract builds and submits GitHub issue URLs', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#feedback-modal-overlay', { state: 'attached' });

  const results = await page.evaluate(async ({ feedbackUrl }) => {
    const feedback = await import(feedbackUrl);
    const outcomes = {};
    const originalOpen = window.open;
    let openedUrl = '';

    try {
      window.open = (url) => {
        openedUrl = String(url || '');
        return null;
      };

      feedback.openFeedbackModal();
      const overlay = document.getElementById('feedback-modal-overlay');
      const modal = document.getElementById('feedback-modal');
      const form = document.querySelector('.feedback-form');
      const typeSelect = document.getElementById('feedback-type');
      const titleInput = document.getElementById('feedback-title');
      const descInput = document.getElementById('feedback-desc');

      outcomes.opensOverlay = overlay?.classList.contains('show') === true;
      outcomes.usesDelegatedFeedbackActions =
        modal?.querySelector('[data-feedback-action="close"]')
        && form?.getAttribute('data-feedback-action') === 'submit'
        && typeSelect?.getAttribute('data-feedback-action') === 'placeholder'
        && !modal.innerHTML.includes('onclick=')
        && !modal.innerHTML.includes('onsubmit=')
        && !modal.innerHTML.includes('onchange=');
      outcomes.rendersTypeChoices = typeSelect?.querySelectorAll('option').length === 4;
      outcomes.defaultPlaceholder = titleInput?.getAttribute('placeholder') === 'Brief description of the bug';

      typeSelect.value = 'feature';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      outcomes.placeholderFollowsType = titleInput.getAttribute('placeholder') === 'What feature would you like?';

      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      outcomes.emptyTitleKeepsModalOpen = overlay?.classList.contains('show') === true
        && document.activeElement === titleInput;

      titleInput.value = 'Batch coverage affordance';
      descInput.value = 'Please group browser coverage improvements.';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      const issueUrl = new URL(openedUrl);
      outcomes.issueUrlTargetsGitHub = issueUrl.origin === 'https://github.com'
        && issueUrl.pathname === '/elkimek/get-based/issues/new';
      outcomes.issueTitleIsPrefixed = issueUrl.searchParams.get('title') === '[Feature] Batch coverage affordance';
      outcomes.issueLabelMatchesType = issueUrl.searchParams.get('labels') === 'enhancement';
      outcomes.issueBodyIncludesSystemInfo = (issueUrl.searchParams.get('body') || '').includes('## System Info');
      outcomes.submitClosesOverlay = overlay?.classList.contains('show') === false;

      feedback.openFeedbackModal();
      document.querySelector('[data-feedback-action="close"]')?.click();
      outcomes.closeHidesOverlay = overlay?.classList.contains('show') === false;
    } finally {
      window.open = originalOpen;
      feedback.closeFeedbackModal();
    }

    return outcomes;
  }, { feedbackUrl: moduleUrl('/js/feedback.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('notes editor browser contract adds edits and deletes notes', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#detail-modal', { state: 'attached' });

  const results = await page.evaluate(async ({ notesRuntimeUrl, notesUrl }) => {
    const [notes, notesRuntime] = await Promise.all([
      import(notesUrl),
      import(notesRuntimeUrl),
    ]);
    const { state } = await import('/js/state.js');
    const outcomes = {};
    const originalNotes = Array.isArray(state.importedData?.notes)
      ? JSON.parse(JSON.stringify(state.importedData.notes))
      : undefined;
    const navCalls = [];
    let closeCalls = 0;
    const waitFor = async (predicate) => {
      for (let i = 0; i < 40; i++) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return false;
    };

    try {
      state.importedData ||= {};
      state.importedData.notes = [];
      const savedNotesRuntimeDeps = notesRuntime.configureNotesRuntimeDeps({
        closeModal: () => {
          closeCalls++;
          document.getElementById('modal-overlay')?.classList.remove('show');
        },
        navigate: category => { navCalls.push(category); },
        rememberModalTrigger: () => {},
      });

      try {
        notes.openNoteEditor('2026-06-07');
        const addModal = document.getElementById('detail-modal');
        outcomes.addEditorOpens = document.getElementById('modal-overlay')?.classList.contains('show') === true
          && document.getElementById('note-date-input')?.value === '2026-06-07'
          && document.getElementById('note-textarea')?.value === '';
        outcomes.usesDelegatedNoteActions =
          addModal?.querySelector('[data-note-action="close"]')
          && addModal?.querySelector('[data-note-action="save"]')
          && !addModal.innerHTML.includes('onclick=');

        document.getElementById('note-textarea').value = 'Started coverage batching';
        document.querySelector('[data-note-action="save"]')?.click();
        outcomes.saveAddsNote = state.importedData.notes.length === 1
          && state.importedData.notes[0].date === '2026-06-07'
          && state.importedData.notes[0].text === 'Started coverage batching'
          && navCalls.includes('dashboard');

        notes.openNoteEditor(null, 0);
        outcomes.editEditorLoadsExisting = document.getElementById('note-textarea')?.value === 'Started coverage batching'
          && document.getElementById('detail-modal')?.dataset.syncRefreshMode === 'edit'
          && document.getElementById('detail-modal')?.dataset.syncRefreshKind === 'note';

        document.getElementById('note-textarea').value = 'Edited coverage batch note';
        document.querySelector('[data-note-action="save"]')?.click();
        outcomes.saveEditsInPlace = state.importedData.notes.length === 1
          && state.importedData.notes[0].text === 'Edited coverage batch note';

        notes.openNoteEditor('2026-06-08');
        window.dispatchEvent(new Event('labcharts-sync-applied'));
        outcomes.syncRefreshAddModeReopensByDate =
          await waitFor(() => document.getElementById('note-date-input')?.value === '2026-06-08')
          && document.getElementById('detail-modal')?.dataset.syncRefreshMode === 'add';

        notes.openNoteEditor(null, 0);
        state.importedData.notes[0].text = 'Synced coverage batch note';
        window.dispatchEvent(new Event('labcharts-sync-applied'));
        outcomes.syncRefreshEditReopensSameIndex =
          await waitFor(() => document.getElementById('note-textarea')?.value === 'Synced coverage batch note')
          && document.getElementById('detail-modal')?.dataset.syncRefreshIndex === '0';

        notes.openNoteEditor(null, 0);
        state.importedData.notes.unshift({ date: '2026-06-06', text: 'Inserted remote note' });
        window.dispatchEvent(new Event('labcharts-sync-applied'));
        outcomes.syncRefreshFindsShiftedNote =
          await waitFor(() => document.getElementById('detail-modal')?.dataset.syncRefreshIndex === '1')
          && document.getElementById('note-textarea')?.value === 'Synced coverage batch note';

        const closeCallsBeforeMissingNote = closeCalls;
        notes.openNoteEditor(null, 1);
        state.importedData.notes = state.importedData.notes.filter(note => note.date !== '2026-06-07');
        window.dispatchEvent(new Event('labcharts-sync-applied'));
        outcomes.syncRefreshClosesWhenNoteMissing =
          closeCalls >= closeCallsBeforeMissingNote + 1
          && document.getElementById('modal-overlay')?.classList.contains('show') === false;

        state.importedData.notes = [{ date: '2026-06-09', text: 'Delete coverage note' }];
        notes.openNoteEditor(null, 0);
        document.querySelector('[data-note-action="delete"]')?.click();
        await Promise.resolve();
        document.getElementById('confirm-ok')?.click();
        await waitFor(() => state.importedData.notes.length === 0);
        outcomes.deleteRemovesNote = state.importedData.notes.length === 0;
      } finally {
        notesRuntime.configureNotesRuntimeDeps(savedNotesRuntimeDeps);
      }
    } finally {
      if (originalNotes === undefined) delete state.importedData.notes;
      else state.importedData.notes = originalNotes;
      document.getElementById('confirm-dialog-overlay')?.classList.remove('show');
      document.getElementById('modal-overlay')?.classList.remove('show');
    }

    return outcomes;
  }, {
    notesRuntimeUrl: '/js/notes-runtime.js',
    notesUrl: '/js/notes.js',
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('chat send controls cover button state typewriter runtime bridges and abort paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-input');

  const results = await page.evaluate(async ({ chatSendUrl, chatSendRuntimeUrl }) => {
    const [chatSend, chatSendRuntime, recommendationRuntime] = await Promise.all([
      import(chatSendUrl),
      import(chatSendRuntimeUrl),
      import('/js/recommendations-runtime.js'),
    ]);
    const outcomes = {};
    const originalProvider = localStorage.getItem('labcharts-ai-provider');
    const originalPaused = localStorage.getItem('labcharts-ai-paused');
    const attestationKeys = ['_ppqAttestation', '_routstrAttestation', '_veniceAttestation'];
    const originalAttestations = Object.fromEntries(attestationKeys.map(key => [
      key,
      {
        owned: Object.prototype.hasOwnProperty.call(window, key),
        value: window[key],
      },
    ]));
    const restoreRecommendationBridge = recommendationRuntime.configureRecommendationModuleBridge({
      isProductRecsEnabled: () => true,
      detectSupplementSlots: text => text.includes('magnesium') ? ['magnesium'] : [],
      detectEMFRelevance: text => text.includes('router'),
      renderRecommendationSection: async () => '<div>async rec</div>',
      renderRecommendationSectionSync: () => '<div>sync rec</div>',
      loadCatalog: async () => ({ products: [] }),
    });

    try {
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'false');
      window._ppqAttestation = 'ppq-attestation';
      window._routstrAttestation = 'routstr-attestation';
      window._veniceAttestation = 'venice-attestation';

      const recommendationBridge = chatSendRuntime.getChatSendRecommendationRuntime();
      outcomes.chatSendRuntimeReadsAttestationsAndRecommendationBridge =
        chatSendRuntime.getChatSendProviderAttestation('ppq') === 'ppq-attestation'
        && chatSendRuntime.getChatSendProviderAttestation('routstr') === 'routstr-attestation'
        && chatSendRuntime.getChatSendProviderAttestation('venice') === 'venice-attestation'
        && chatSendRuntime.isChatSendProductRecsEnabled() === true
        && chatSendRuntime.detectChatSendSupplementSlots('try magnesium')[0] === 'magnesium'
        && chatSendRuntime.isChatSendEMFRelevant('move the router') === true
        && typeof recommendationBridge?.renderRecommendationSection === 'function'
        && typeof recommendationBridge?.renderRecommendationSectionSync === 'function'
        && typeof recommendationBridge?.loadCatalog === 'function';

      const input = document.getElementById('chat-input');
      const sendBtn = document.getElementById('chat-send-btn');
      input.value = '';
      sendBtn.disabled = false;
      chatSend.updateSendButtonState();
      outcomes.emptyInputDisablesSend = sendBtn.disabled === true;

      input.value = 'hello';
      chatSend.updateSendButtonState();
      outcomes.textInputEnablesSend = sendBtn.disabled === false;

      chatSend.setSendButtonMode(sendBtn, 'streaming');
      outcomes.streamingModeShowsStop = sendBtn.classList.contains('streaming')
        && !!sendBtn.querySelector('rect');
      chatSend.setSendButtonMode(sendBtn, 'idle');
      outcomes.idleModeShowsSend = !sendBtn.classList.contains('streaming')
        && !!sendBtn.querySelector('path');

      const container = document.createElement('div');
      container.style.height = '32px';
      container.style.overflow = 'auto';
      const typingEl = document.createElement('div');
      typingEl.className = 'typing-indicator';
      container.appendChild(typingEl);
      const aiEl = document.createElement('div');
      document.body.appendChild(container);
      const typewriter = chatSend.createTypewriter(aiEl, typingEl, container);
      typewriter.update('streamed answer');
      for (let attempts = 0; attempts < 40 && aiEl.textContent !== 'streamed answer'; attempts++) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      typewriter.stop();
      outcomes.typewriterWritesText = aiEl.textContent === 'streamed answer'
        && !typingEl.parentNode;
      container.remove();

      const firstController = new AbortController();
      chatSend.setChatAbortController(firstController);
      chatSend.updateSendButtonState();
      outcomes.streamingStateEnablesEmptySend = sendBtn.disabled === false
        && chatSend.getChatAbortController() === firstController
        && chatSend.isChatStreaming() === true;

      await chatSend.sendChatMessage();
      outcomes.sendWhileStreamingAborts = firstController.signal.aborted === true
        && chatSend.isChatStreaming() === false;

      const secondController = new AbortController();
      let prevented = false;
      chatSend.setChatAbortController(secondController);
      chatSend.handleChatKeydown({
        key: 'Enter',
        shiftKey: false,
        preventDefault() { prevented = true; },
      });
      outcomes.enterKeyPreventsAndAborts = prevented
        && secondController.signal.aborted === true
        && chatSend.isChatStreaming() === false;

      prevented = false;
      chatSend.handleChatKeydown({
        key: 'Enter',
        shiftKey: true,
        preventDefault() { prevented = true; },
      });
      outcomes.shiftEnterDoesNotSend = prevented === false;
    } finally {
      chatSend.setChatAbortController(null);
      if (originalProvider == null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', originalProvider);
      if (originalPaused == null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', originalPaused);
      recommendationRuntime.configureRecommendationModuleBridge({
        isProductRecsEnabled: null,
        detectSupplementSlots: null,
        detectEMFRelevance: null,
        renderRecommendationSection: null,
        renderRecommendationSectionSync: null,
        loadCatalog: null,
        ...restoreRecommendationBridge,
      });
      for (const key of attestationKeys) {
        const original = originalAttestations[key];
        if (original.owned) window[key] = original.value;
        else delete window[key];
      }
    }

    return outcomes;
  }, {
    chatSendUrl: moduleUrl('/js/chat-send.js'),
    chatSendRuntimeUrl: moduleUrl('/js/chat-send-runtime.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('discussion round and sync diagnose render helpers cover active and empty states', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ roundViewUrl, syncRenderUrl }) => {
    const roundView = await import(roundViewUrl);
    const { state } = await import('/js/state.js');
    const syncRender = await import(syncRenderUrl);
    const outcomes = {};
    const originalThreadId = state.currentThreadId;

    try {
      state.currentThreadId = 'round-active';
      const container = document.createElement('div');
      document.body.appendChild(container);
      const label = roundView.createDiscussionPersonaLabel({ icon: 'A', name: 'Analyst' });
      const typing = roundView.createDiscussionTypingIndicator();
      const ai = roundView.createDiscussionAiMessage();
      container.appendChild(typing);

      roundView.appendRoundPersonaLabel('other-thread', container, label);
      outcomes.inactiveThreadSkipsPersonaLabel = !label.parentNode;
      roundView.appendRoundPersonaLabel('round-active', container, label);
      outcomes.activeThreadAppendsPersonaLabel = label.parentNode === container
        && label.textContent.includes('Analyst');

      const rendered = roundView.renderFinalDiscussionMessage({
        threadId: 'round-active',
        container,
        labelEl: label,
        aiMsgEl: ai,
        typingEl: typing,
        fullText: '**done**',
        responseTruncated: true,
      });
      outcomes.finalMessageRendersMarkdownAndLimit = rendered === true
        && !!ai.querySelector('strong')
        && ai.textContent.includes('output limit reached');

      const footnoted = roundView.appendDiscussionUsageFootnote({
        threadId: 'round-active',
        aiMsgEl: ai,
        provider: 'ollama',
        modelId: 'llama3.2',
        modelDisplay: 'Local model',
        usage: { inputTokens: 10, outputTokens: 15 },
        webSearch: true,
        e2ee: false,
      });
      outcomes.usageFootnoteRenders = footnoted === true
        && ai.querySelector('.chat-cost-footnote')?.textContent.includes('25 tokens');

      const errored = roundView.renderDiscussionRoundError({
        threadId: 'round-active',
        container,
        error: new Error('<unsafe>'),
      });
      outcomes.errorEscapesMessage = errored === true
        && container.textContent.includes('Error: <unsafe>')
        && !container.innerHTML.includes('<unsafe>');
      outcomes.inactiveFinalMessageReturnsFalse = roundView.renderFinalDiscussionMessage({
        threadId: 'other-thread',
        container,
        labelEl: document.createElement('div'),
        aiMsgEl: document.createElement('div'),
        typingEl: document.createElement('div'),
        fullText: 'hidden',
        responseTruncated: false,
      }) === false;
      container.remove();

      const fullHtml = syncRender.renderSyncDiagnoseModal({
        diagnostics: {
          syncEnabled: true,
          relay: 'https://relay.example.test',
          ownerId: 'owner-1',
          mnemonicConfigured: true,
          activeProfileId: 'profile-1',
          activeImported: { sunSessions: 2, lightDevices: 1 },
          rowParseFailureCount: 1,
          rowsReadFailed: true,
          rowsError: 'Patient Jane Example payload was malformed',
          rows: [{
            profileId: 'profile-1',
            profileIdSource: 'payload',
            format: 'gz',
            isDeleted: true,
            syncedAtMs: 123456,
            sun: 2,
            dev: 1,
            bytes: 512,
          }],
          deltaTelemetry: {
            summary: { count: 2, ratio: 0.1, totalBlobBytes: 1000, totalDeltaBytes: 100, totalOps: 3 },
            pushes: [{ at: Date.now(), blobBytes: 600, totalDeltaBytes: 60, totalOps: 2, perArray: { notes: { ins: 1, upd: 1, tom: 0 } } }],
            pull: { perArray: { notes: { live: 1, tombstones: 0 } }, mergedAt: Date.now() },
          },
          cutoverReadiness: {
            ready: false,
            blockerCount: 1,
            surfaceCount: 2,
            surfaces: {
              notes: { status: 'missing-rows', shape: 'array', localCount: 2, rowCount: 1 },
              supplements: { status: 'no-data', shape: 'array', localCount: 0, rowCount: 0 },
            },
          },
        },
        healthVerdict: { verdict: 'wedged', reason: 'relay did not advance', at: Date.now() },
        quota: { bytes: 3 * 1024 * 1024, cap: 10 * 1024 * 1024, pct: 30, level: 'amber' },
        isDebug: true,
        cutoverEnabled: false,
      });
      outcomes.syncDiagnoseRendersPanels = fullHtml.includes('Relay sync health')
        && fullHtml.includes('Wedged')
        && fullHtml.includes('Relay storage')
        && fullHtml.includes('Push efficiency')
        && fullHtml.includes('Lean sync mode')
        && fullHtml.includes('1 row payload could not be decoded.')
        && fullHtml.includes('Row query failed.')
        && !fullHtml.includes('Patient Jane Example')
        && fullHtml.includes('profileId column empty')
        && fullHtml.includes('notes(1/1/0)');
      outcomes.syncDiagnoseRendererUsesDelegatedActions =
        !/\son(?:click|change|input|keydown|submit)=["']/.test(fullHtml)
        && fullHtml.includes('data-sync-diagnose-action="refresh-relay-storage"')
        && fullHtml.includes('data-sync-diagnose-action="compact-relay"')
        && fullHtml.includes('data-sync-diagnose-action="rotate-identity"')
        && fullHtml.includes('data-sync-diagnose-action="reset-delta-telemetry"')
        && fullHtml.includes('data-sync-diagnose-action="backfill-blockers"')
        && fullHtml.includes('data-sync-diagnose-action="copy-snapshot"')
        && fullHtml.includes('title="Push the pending items below first."')
        && !fullHtml.includes('data-sync-diagnose-action="enable-phase2"');

      const emptyRowsHtml = syncRender.renderSyncDiagnoseModal({
        diagnostics: {
          syncEnabled: false,
          relay: '',
          ownerId: '',
          mnemonicConfigured: false,
          activeProfileId: '',
          activeImported: { sunSessions: 0, lightDevices: 0 },
          rowParseFailureCount: 0,
          rowsReadFailed: false,
          rows: [],
        },
        healthVerdict: { verdict: 'healthy', at: Date.now() },
        quota: { bytes: 1024, cap: 10 * 1024 * 1024, pct: 1, level: 'green' },
        isDebug: false,
        cutoverEnabled: true,
      });
      outcomes.syncDiagnoseRendersEmptyRows = emptyRowsHtml.includes('No rows in local Evolu DB')
        && emptyRowsHtml.includes('Healthy');
    } finally {
      state.currentThreadId = originalThreadId;
    }

    return outcomes;
  }, {
    roundViewUrl: moduleUrl('/js/chat-discussion-round-view.js'),
    syncRenderUrl: moduleUrl('/js/sync-diagnose-render.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('import preflight and marker normalization cover browser decision paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ preflightUrl, normalizationUrl, utilsUrl }) => {
    const preflight = await import(preflightUrl);
    const normalization = await import(normalizationUrl);
    const { state } = await import('/js/state.js');
    const { hashString } = await import(utilsUrl);
    const outcomes = {};
    const originalEntries = Array.isArray(state.importedData?.entries)
      ? JSON.parse(JSON.stringify(state.importedData.entries))
      : undefined;
    const originalPaused = localStorage.getItem('labcharts-ai-paused');

    try {
      outcomes.normalizesProviderModelIds = preflight.normalizeImportModelId('anthropic/claude-sonnet-4.6-20260101') === 'claude-sonnet-4-6';

      state.importedData ||= {};
      state.importedData.entries = [{ date: '2026-06-01', importHash: hashString('duplicate pdf text') }];
      localStorage.setItem('labcharts-ai-paused', 'true');

      const cancelPromise = preflight.runPreflightChecks('duplicate pdf text', 'blood.pdf');
      await Promise.resolve();
      document.getElementById('confirm-cancel')?.click();
      outcomes.duplicatePreflightCanCancel = await cancelPromise === false;

      const proceedPromise = preflight.runPreflightChecks('duplicate pdf text', 'blood.pdf');
      await Promise.resolve();
      document.getElementById('confirm-ok')?.click();
      outcomes.duplicatePreflightCanProceed = await proceedPromise === true;

      const blood = normalization.normalizeParsedImportMarkers({
        testType: 'blood',
        markers: [{ rawName: 'Glucose', value: '5,2', mappedKey: 'biochemistry.glucose', unit: 'mmol/l' }],
      });
      outcomes.bloodMarkerNormalizes = blood.testType === 'blood'
        && blood.markers.length === 1
        && blood.markers[0].value === 5.2
        && blood.markers[0].matched === true
        && blood.markers[0].mappedKey === 'biochemistry.glucose';

      const oat = normalization.normalizeParsedImportMarkers({
        testType: 'OAT',
        markers: [{ rawName: 'Glucose', value: '1.2', mappedKey: 'biochemistry.glucose' }],
      });
      outcomes.specialtyStandardMappingIsDemoted = oat.markers.length === 1
        && oat.markers[0].mappedKey === null
        && oat.markers[0].matched === false
        && oat.markers[0].suggestedKey === 'oatBiochemistry.glucose'
        && oat.markers[0].group === 'OAT';

      const image = normalization.normalizeParsedImportMarkers({
        testType: 'blood',
        markers: [{ rawName: 'Ferritin', value: '44.5', mappedKey: 'iron.ferritin', unit: 'ng/ml' }],
      }, { mode: 'image' });
      outcomes.imageMarkerShapeNormalizes = image.markers[0].value === 44.5
        && image.markers[0].unit === 'ng/ml'
        && Object.prototype.hasOwnProperty.call(image.markers[0], 'suggestedGroup');
    } finally {
      if (originalEntries === undefined) delete state.importedData.entries;
      else state.importedData.entries = originalEntries;
      if (originalPaused == null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', originalPaused);
      document.getElementById('confirm-dialog-overlay')?.classList.remove('show');
    }

    return outcomes;
  }, {
    preflightUrl: moduleUrl('/js/pdf-import-preflight.js'),
    normalizationUrl: moduleUrl('/js/pdf-import-marker-normalization.js'),
    utilsUrl: moduleUrl('/js/utils.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync diagnostics schema and snapshot helpers cover browser contracts', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ schemaUrl, textUrl, snapshotUrl }) => {
    const schema = await import(schemaUrl);
    const diagnosticsText = await import(textUrl);
    const snapshot = await import(snapshotUrl);
    const diagnosticsContext = await import('/js/sync-diagnostics-context.js');
    const { state } = await import('/js/state.js');
    const outcomes = {};
    const originalProfile = state.currentProfile;
    const originalImported = JSON.parse(JSON.stringify(state.importedData || {}));
    const originalSyncTs = localStorage.getItem('coverage-sync-ts');

    try {
      const syncSchema = schema.createSyncSchema({
        id: (name) => `id:${name}`,
        nullOr: (value) => ({ kind: 'nullable', value }),
        NonEmptyString: 'non-empty',
      });
      outcomes.schemaDefinesProfileAndItemRows = syncSchema.profileData.id === 'id:ProfileData'
        && syncSchema.profileData.syncedAt.kind === 'nullable'
        && syncSchema.itemRow.id === 'id:ItemRow'
        && syncSchema.itemRow.arrayName === 'non-empty';

      const queryCalls = [];
      const fakeEvoluForQueries = {
        createQuery(builder) {
          const calls = [];
          const chain = {
            selectAll() {
              calls.push(['selectAll']);
              return this;
            },
            where(...args) {
              calls.push(['where', ...args]);
              return this;
            },
          };
          const db = {
            selectFrom(table) {
              calls.push(['selectFrom', table]);
              return chain;
            },
          };
          builder(db);
          queryCalls.push(calls);
          return { calls };
        },
      };
      const queries = schema.createSyncQueries(fakeEvoluForQueries);
      const profileCalls = queries.profileQuery.calls;
      const tombstoneCalls = queries.tombstoneQuery.calls;
      const itemRowCalls = queries.itemRowQuery.calls;
      outcomes.queriesBuildExpectedFilters = !!queries.profileQuery
        && !!queries.tombstoneQuery
        && !!queries.itemRowQuery
        && profileCalls.some(c => c.join('|') === 'where|isDeleted|is not|1')
        && tombstoneCalls.some(c => c.join('|') === 'where|isDeleted|=|1')
        && itemRowCalls.some(c => c.join('|') === 'selectFrom|itemRow')
        && queryCalls.length === 3;

      const textPayload = {
        syncEnabled: true,
        relay: 'https://relay.example.test',
        ownerId: 'owner-1',
        mnemonicConfigured: true,
        activeProfileId: 'profile-1',
        activeImported: { sunSessions: 1, lightDevices: 2 },
        rowParseFailureCount: 1,
        rowsReadFailed: true,
        rowsError: 'Patient Jane Example payload was malformed',
        rows: [{
          profileId: 'profile-1',
          isDeleted: true,
          syncedAtMs: 1760000000000,
          sun: 1,
          dev: 2,
          bytes: 512,
          format: 'gz',
          profileIdSource: 'payload',
        }],
        deltaTelemetry: {
          summary: { count: 1, ratio: 0.04, totalBlobBytes: 1000, totalDeltaBytes: 40, totalOps: 1 },
          pushes: [{
            at: 1760000000000,
            blobBytes: 1000,
            totalDeltaBytes: 40,
            totalOps: 1,
            perArray: { notes: { ins: 1, upd: 0, tom: 0 }, empty: { ins: 0, upd: 0, tom: 0 } },
          }],
          pull: { perArray: { notes: { live: 2, tombstones: 1 } }, mergedAt: 1760000000000 },
        },
        cutoverReadiness: {
          ready: false,
          blockerCount: 1,
          surfaceCount: 2,
          surfaces: {
            entries: { status: 'missing-rows', shape: 'array', localCount: 1, rowCount: 0 },
            notes: { status: 'ok', shape: 'array', localCount: 1, rowCount: 1 },
          },
        },
      };
      const renderedText = diagnosticsText._evoluDiagnosticsText(textPayload);
      outcomes.diagnosticsTextIncludesRowsAndDelta = renderedText.includes('Sync enabled: yes')
        && renderedText.includes('profile-1')
        && renderedText.includes('Unreadable row payloads: 1')
        && renderedText.includes('Row query status: failed')
        && !renderedText.includes('Patient Jane Example')
        && renderedText.includes('Phase 1 dual-write health')
        && renderedText.includes('notes(1/0/0)')
        && renderedText.includes('entries');
      outcomes.diagnosticsTextHandlesEmptyRows = diagnosticsText._evoluDiagnosticsText({
        ...textPayload,
        rows: [],
        rowParseFailureCount: 0,
        rowsReadFailed: false,
        deltaTelemetry: null,
        cutoverReadiness: null,
      }).includes('  (none)');

      const profileQuery = { kind: 'profile' };
      const tombstoneQuery = { kind: 'tombstone' };
      const liveRows = [
        {
          id: 'row-live',
          profileId: 'profile-column',
          syncedAt: '2026-06-07T01:00:00.000Z',
          dataJson: JSON.stringify({
            _v: 3,
            profile: { id: 'profile-payload' },
            importedData: { sunSessions: [{ id: 'sun-1' }], lightDevices: [{ id: 'dev-1' }] },
          }),
        },
        {
          id: 'row-payload',
          profileId: '',
          syncedAt: '2026-06-07T02:00:00.000Z',
          dataJson: JSON.stringify({
            _v: 3,
            profile: { id: 'profile-from-payload' },
            importedData: { sunSessions: [], lightDevices: [{ id: 'dev-2' }, { id: 'dev-3' }] },
          }),
        },
        {
          id: 'row-bad',
          profileId: 'bad-profile',
          syncedAt: '',
          dataJson: 'not json',
        },
      ];
      const tombstoneRows = [{
        id: 'row-deleted',
        profileId: 'deleted-profile',
        syncedAt: '2026-06-07T03:00:00.000Z',
        dataJson: JSON.stringify({ _v: 3, importedData: { sunSessions: [{ id: 'sun-del' }], lightDevices: [] } }),
      }];
      const fakeEvolu = {
        getQueryRows(query) {
          if (query === profileQuery) return liveRows;
          if (query === tombstoneQuery) return tombstoneRows;
          return [];
        },
      };
      diagnosticsContext.configureSyncDiagnosticsContext({
        getEvolu: () => fakeEvolu,
        getProfileQuery: () => profileQuery,
        getTombstoneQuery: () => tombstoneQuery,
        getAppOwner: () => ({ id: 'ownerabcdef123456', mnemonic: 'alpha beta gamma delta' }),
        isSyncEnabled: () => true,
        getSubscriptionFireCount: () => 3,
        isSyncing: () => true,
        isPulling: () => false,
      });
      localStorage.setItem('coverage-sync-ts', '1760000000000');
      state.currentProfile = 'diag-profile';
      state.importedData = {
        sunSessions: [{ id: 'active-sun' }],
        lightDevices: [{ id: 'active-dev-1' }, { id: 'active-dev-2' }],
        notes: [{ text: 'snapshot note' }],
      };

      const syncInfo = snapshot._syncDiag();
      const evoluDiagnostics = await snapshot.getEvoluDiagnostics();
      outcomes.syncDiagCollectsContextAndTimestamps = syncInfo.enabled === true
        && syncInfo.evoluReady === true
        && syncInfo.evoluRows.length === 3
        && syncInfo.localTimestamps.some(item => item.key === 'coverage-sync-ts');
      outcomes.snapshotParsesRowsFallbacksAndDeletes = evoluDiagnostics.syncEnabled === true
        && String(evoluDiagnostics.ownerId).startsWith('ownerabcdef')
        && evoluDiagnostics.mnemonicConfigured === true
        && !Object.hasOwn(evoluDiagnostics, 'mnemonicPrefix')
        && evoluDiagnostics.rowParseFailureCount === 1
        && evoluDiagnostics.rowsReadFailed === false
        && !Object.hasOwn(evoluDiagnostics, 'rowsError')
        && evoluDiagnostics.rows.length === 4
        && evoluDiagnostics.rows.some(row => row.profileId === 'profile-from-payload' && row.profileIdSource === 'payload' && row.dev === 2)
        && evoluDiagnostics.rows.some(row => row.profileId === 'deleted-profile' && row.isDeleted === true)
        && evoluDiagnostics.rows.some(row => row.profileId === 'bad-profile' && row.sun === 0 && row.format === 'invalid');
      outcomes.snapshotCountsActiveImported = evoluDiagnostics.activeImported.sunSessions === 1
        && evoluDiagnostics.activeImported.lightDevices === 2
        && evoluDiagnostics.cutoverReadiness !== null;
    } finally {
      state.currentProfile = originalProfile;
      state.importedData = originalImported;
      if (originalSyncTs == null) localStorage.removeItem('coverage-sync-ts');
      else localStorage.setItem('coverage-sync-ts', originalSyncTs);
      diagnosticsContext.configureSyncDiagnosticsContext({
        getEvolu: () => null,
        getProfileQuery: () => null,
        getTombstoneQuery: () => null,
        getAppOwner: () => null,
        isSyncEnabled: () => false,
        getSubscriptionFireCount: () => 0,
        isSyncing: () => false,
        isPulling: () => false,
      });
    }

    return outcomes;
  }, {
    schemaUrl: moduleUrl('/js/sync-schema.js'),
    textUrl: moduleUrl('/js/sync-diagnostics-text.js'),
    snapshotUrl: moduleUrl('/js/sync-diagnostics-snapshot.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync scalar merge storage cleanup and QR loader cover browser contracts', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ scalarUrl, cleanupUrl, providerQrUrl }) => {
    const scalar = await import(scalarUrl);
    const cleanup = await import(cleanupUrl);
    const providerQr = await import(providerQrUrl);
    const syncState = await import('/js/sync-state.js');
    const { profileStorageKey } = await import('/js/profile.js');
    const blobStorage = await import('/js/blob-storage.js');
    const { state } = await import('/js/state.js');
    const outcomes = {};
    const originalImported = JSON.parse(JSON.stringify(state.importedData || {}));
    const importedStorageKey = profileStorageKey(state.currentProfile || 'default', 'imported');
    const originalImportedLocalValue = localStorage.getItem(importedStorageKey);
    const originalImportedBlobValue = await blobStorage.getBlob(importedStorageKey);
    const cacheKeys = [
      'labcharts-openrouter-models',
      'labcharts-venice-models',
      'labcharts-ppq-models',
      'labcharts-routstr-models',
      'labcharts-venice-e2ee-models',
    ];
    const originalCacheValues = Object.fromEntries(cacheKeys.map(key => [key, localStorage.getItem(key)]));
    const hadQRCode = Object.prototype.hasOwnProperty.call(window, 'qrcode');
    const originalQRCode = window.qrcode;

    try {
      const imported = {
        genetics: { ancestry: 'local', snps: { rs1: 'AA' } },
        lightEnvironment: { mode: 'bright' },
        mood: 'old',
      };
      await scalar.mergeScalarRowsIntoImported(imported, 'genetics', [
        { itemId: 'other', payload: JSON.stringify({ v: { ignored: true } }), syncedAt: '2026-02-01T00:00:00.000Z' },
        { itemId: 'genetics', payload: 'not json', syncedAt: '2026-02-02T00:00:00.000Z' },
        { itemId: 'genetics', payload: JSON.stringify({ v: { ancestry: 'older' } }), syncedAt: '2026-01-01T00:00:00.000Z' },
        { itemId: 'genetics', payload: JSON.stringify({ v: { ancestry: 'remote' } }), syncedAt: '2026-03-01T00:00:00.000Z' },
      ]);
      outcomes.scalarMergePreservesGeneticsMap = imported.genetics.ancestry === 'remote'
        && imported.genetics.snps.rs1 === 'AA';

      await scalar.mergeScalarRowsIntoImported(imported, 'lightEnvironment.mode', [
        { itemId: 'lightEnvironment.mode', payload: JSON.stringify({ v: 'dim' }), syncedAt: '2026-01-01T00:00:00.000Z' },
        { itemId: 'lightEnvironment.mode', isDeleted: true, syncedAt: '2026-03-01T00:00:00.000Z' },
      ]);
      outcomes.scalarTombstoneClearsNestedLeaf = imported.lightEnvironment.mode === null;

      await scalar.mergeScalarRowsIntoImported(imported, 'mood', [
        { itemId: 'mood', isDeleted: true, syncedAt: '2026-05-01T00:00:00.000Z' },
      ]);
      outcomes.scalarTombstoneClearsTopLevel = imported.mood === null;

      await scalar.mergeScalarRowsIntoImported(imported, 'genetics', [
        { itemId: 'genetics', isDeleted: true, syncedAt: '2026-06-01T00:00:00.000Z' },
      ]);
      outcomes.geneticsTombstonePreservesSnps = Object.keys(imported.genetics).length === 1
        && imported.genetics.snps.rs1 === 'AA';

      for (const key of cacheKeys) localStorage.setItem(key, `${key}-cache`);
      state.importedData = {
        ...originalImported,
        changeHistory: Array.from({ length: 205 }, (_, index) => ({
          field: `field-${index}`,
          date: `2026-06-${String((index % 28) + 1).padStart(2, '0')}`,
        })),
      };
      const cleanupResult = await cleanup.cleanStorage();
      outcomes.cleanStorageClearsCachesAndTrimsHistory = cleanupResult.cachesCleared === cacheKeys.length
        && cleanupResult.historyTrimmed === 5
        && state.importedData.changeHistory.length === 200
        && cacheKeys.every(key => localStorage.getItem(key) === null);
      outcomes.cleanStorageLogsCleanupEvent = syncState.getRecentSyncEvents()
        .some(event => event.kind === 'cleanup' && event.text.includes('Caches cleared: 5'));

      const fakeQRCodeFn = function fakeQRCode() {};
      window.qrcode = fakeQRCodeFn;
      const existingQRCode = await providerQr.ensureQRCode();
      outcomes.qrReturnsExistingGlobal = existingQRCode === fakeQRCodeFn;

      window.qrcode = undefined;
      const loadedQRCode = await providerQr.ensureQRCode();
      const loadedAgain = await providerQr.ensureQRCode();
      outcomes.qrLoadsVendorAndMemoizes = typeof loadedQRCode === 'function'
        && loadedAgain === loadedQRCode;
    } finally {
      state.importedData = originalImported;
      if (originalImportedBlobValue == null) await blobStorage.deleteBlob(importedStorageKey);
      else await blobStorage.setBlob(importedStorageKey, originalImportedBlobValue);
      if (originalImportedLocalValue == null) localStorage.removeItem(importedStorageKey);
      else localStorage.setItem(importedStorageKey, originalImportedLocalValue);
      for (const [key, value] of Object.entries(originalCacheValues)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      if (hadQRCode) window.qrcode = originalQRCode;
      else delete window.qrcode;
    }

    return outcomes;
  }, {
    scalarUrl: moduleUrl('/js/sync-delta-scalar-merge.js'),
    cleanupUrl: moduleUrl('/js/sync-storage-cleanup.js'),
    providerQrUrl: moduleUrl('/js/provider-qr.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('discussion round runner covers empty and missing container paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-send-btn');

  const results = await page.evaluate(async ({ runnerUrl }) => {
    const runner = await import(runnerUrl);
    const callbacks = await import('/js/chat-discussion-callbacks.js');
    const { state } = await import('/js/state.js');
    const outcomes = {};
    const originalThreadId = state.currentThreadId;
    const originalHistory = Array.isArray(state.chatHistory)
      ? state.chatHistory.slice()
      : state.chatHistory;
    const container = document.getElementById('chat-messages');
    const parent = container?.parentNode || null;
    const nextSibling = container?.nextSibling || null;
    let abortController = null;
    const modes = [];

    try {
      callbacks.configureChatDiscussion({
        getChatAbortController: () => abortController,
        setChatAbortController: (controller) => { abortController = controller; },
        setSendButtonMode: (_btn, mode) => { modes.push(mode); },
        renderChatMessages: () => {},
        createTypewriter: () => ({ update() {}, stop() {} }),
      });

      container?.remove();
      await runner.runDiscussionRound([], 'missing container');
      outcomes.missingContainerReturnsBeforeSideEffects = abortController === null
        && modes.length === 0;

      if (container && parent) {
        if (nextSibling) parent.insertBefore(container, nextSibling);
        else parent.appendChild(container);
      }
      state.currentThreadId = 'empty-round-thread';
      state.chatHistory = [];
      await runner.runDiscussionRound([], 'empty round', { threadId: 'empty-round-thread' });
      outcomes.emptyRoundSetsAndClearsCallbacks = abortController === null
        && modes.join(',') === 'streaming,idle'
        && state.chatHistory.length === 0;
    } finally {
      if (container && parent && !container.parentNode) {
        if (nextSibling) parent.insertBefore(container, nextSibling);
        else parent.appendChild(container);
      }
      state.currentThreadId = originalThreadId;
      state.chatHistory = originalHistory;
      callbacks.configureChatDiscussion({
        createTypewriter: null,
        getChatAbortController: () => null,
        renderChatMessages: () => {},
        setChatAbortController: () => {},
        setSendButtonMode: () => {},
      });
    }

    return outcomes;
  }, { runnerUrl: moduleUrl('/js/chat-discussion-round-runner.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync diagnose action helpers cover guarded UI branches', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ identityUrl, cutoverUrl, relayUrl }) => {
    const identityActions = await import(identityUrl);
    const cutoverActions = await import(cutoverUrl);
    const relayActions = await import(relayUrl);
    const actionContext = await import('/js/sync-diagnose-actions-context.js');
    const confirmRuntime = await import('/js/sync-diagnose-runtime.js');
    const relayHealth = await import('/js/sync-relay-health.js');
    const { state } = await import('/js/state.js');
    const outcomes = {};
    let confirmAnswer = false;
    const originalConfirmDeps = confirmRuntime.configureSyncDiagnoseRuntimeDeps({
      showConfirmDialog: async () => confirmAnswer,
    });
    const originalFetch = window.fetch;
    const hadBip39 = Object.prototype.hasOwnProperty.call(window, 'bip39');
    const originalBip39 = window.bip39;
    const hadQRCode = Object.prototype.hasOwnProperty.call(window, 'qrcode');
    const originalQRCode = window.qrcode;
    const originalProfile = state.currentProfile;
    const originalImported = JSON.parse(JSON.stringify(state.importedData || {}));
    const originalSelfUrl = localStorage.getItem('labcharts-self-url');
    const relayQuotaKey = 'labcharts-relay-bytes-owner-1';
    const originalRelayQuota = localStorage.getItem(relayQuotaKey);

    function makeModalButton(text = 'Action') {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay show';
      const btn = document.createElement('button');
      btn.textContent = text;
      overlay.appendChild(btn);
      document.body.appendChild(overlay);
      return { overlay, btn };
    }

    try {
      confirmAnswer = false;
      await identityActions.confirmRotateIdentity();
      outcomes.rotateCancelStopsBeforeModal = !document.querySelector('[aria-label="Rotate sync identity"]');

      const mnemonic = Array.from({ length: 24 }, (_, index) => `word${index + 1}`).join(' ');
      let enableSyncCalls = 0;
      let restoredMnemonic = '';
      let restoreOptions = null;
      actionContext.configureSyncDiagnoseActionContext({
        enableSync: async () => { enableSyncCalls++; return true; },
        restoreFromMnemonic: async (value, options) => {
          restoredMnemonic = value;
          restoreOptions = options;
          return true;
        },
        isSyncEnabled: () => false,
        pushProfile: async () => {},
        enablePhase2Cutover: () => ({ ok: false, reason: 'not-configured' }),
        disablePhase2Cutover: () => false,
        showSyncDiagnose: async () => {},
      });
      confirmAnswer = true;
      window.bip39 = { generateMnemonic: async () => mnemonic };
      window.qrcode = function fakeQRCode() {
        return {
          addData(value) { this.value = value; },
          make() { this.made = true; },
          createSvgTag() { return '<svg data-testid="rotate-qr"></svg>'; },
        };
      };

      await identityActions.confirmRotateIdentity();
      const rotateOverlay = Array.from(document.querySelectorAll('.modal-overlay'))
        .find(overlay => overlay.textContent?.includes('Rotate sync identity'));
      const rotateApply = rotateOverlay?.querySelector('#rotate-apply-btn');
      const rotateCheck = rotateOverlay?.querySelector('#rotate-saved-check');
      outcomes.rotateModalRendersAndGatesApply = !!rotateOverlay
        && rotateOverlay.querySelectorAll('#rotate-words span').length >= 24
        && rotateApply?.disabled === true
        && !!rotateOverlay.querySelector('[data-testid="rotate-qr"]');

      rotateCheck?.click();
      outcomes.rotateCheckboxEnablesApply = rotateApply?.disabled === false;
      rotateApply?.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      outcomes.rotateApplyUsesInjectedContext = enableSyncCalls === 1
        && restoredMnemonic === mnemonic
        && restoreOptions?.seedLocal === true;
      rotateOverlay?.remove();

      state.currentProfile = 'diag-actions-profile';
      state.importedData = {};
      let enabledPhaseProfile = '';
      let disabledPhaseProfile = '';
      let pushedProfile = '';
      let pushedOptions = null;
      let showDiagnoseCalls = 0;
      actionContext.configureSyncDiagnoseActionContext({
        enableSync: async () => true,
        restoreFromMnemonic: async () => true,
        isSyncEnabled: () => true,
        pushProfile: async (profileId, _importedData, options) => {
          pushedProfile = profileId;
          pushedOptions = options;
        },
        enablePhase2Cutover: (profileId) => {
          enabledPhaseProfile = profileId;
          return { ok: true };
        },
        disablePhase2Cutover: (profileId) => {
          disabledPhaseProfile = profileId;
          return true;
        },
        showSyncDiagnose: async () => { showDiagnoseCalls++; },
      });
      confirmAnswer = true;

      const resetModal = makeModalButton('Reset window');
      await cutoverActions.confirmResetDeltaTelemetry(resetModal.btn);
      outcomes.resetTelemetryClosesModal = !document.body.contains(resetModal.overlay);

      const enableModal = makeModalButton('Enable Phase 2');
      await cutoverActions.confirmEnablePhase2(enableModal.btn);
      outcomes.enablePhase2UsesContextAndCloses = enabledPhaseProfile === 'diag-actions-profile'
        && !document.body.contains(enableModal.overlay);

      state.importedData = { notes: [{ text: 'needs backfill' }] };
      await cutoverActions.confirmBackfillBlockers();
      outcomes.backfillBlockersForcesPush = pushedProfile === 'diag-actions-profile'
        && pushedOptions?.force === true;

      const disableModal = makeModalButton('Disable Phase 2');
      await cutoverActions.confirmDisablePhase2(disableModal.btn);
      outcomes.disablePhase2UsesContextAndCloses = disabledPhaseProfile === 'diag-actions-profile'
        && !document.body.contains(disableModal.overlay);

      const fetchCalls = [];
      relayHealth.configureRelayHealth({
        getAppOwner: () => ({ id: 'owner-1', writeKey: new TextEncoder().encode('owner-secret') }),
        getSyncRelay: () => 'wss://relay.example.test',
      });
      localStorage.setItem('labcharts-self-url', 'https://relay.example.test');
      window.fetch = async (url, options = {}) => {
        fetchCalls.push({ url: String(url), method: options.method || 'GET', body: options.body || '' });
        if (String(url).includes('/self/compact-owner')) {
          return {
            ok: true,
            json: async () => ({ deletedMessages: 7, afterStoredBytes: 0 }),
          };
        }
        if (String(url).includes('/self/owner-storage')) {
          return {
            ok: true,
            json: async () => ({ storedBytes: 2 * 1024 * 1024, messageCount: 4, lastWriteToken: 'token-1' }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      };

      confirmAnswer = false;
      const compactCancel = makeModalButton('Compact storage');
      await relayActions.confirmCompactRelay(compactCancel.btn);
      outcomes.compactCancelSkipsFetch = fetchCalls.length === 0
        && compactCancel.btn.disabled === false;
      compactCancel.overlay.remove();

      confirmAnswer = true;
      const compactModal = makeModalButton('Compact storage');
      await relayActions.confirmCompactRelay(compactModal.btn);
      outcomes.compactRelayPostsAndCloses = fetchCalls.some(call => call.method === 'POST'
        && call.url.endsWith('/self/compact-owner'))
        && !document.body.contains(compactModal.overlay);

      const refreshModal = makeModalButton('Refresh');
      await relayActions.refreshRelayStorage(refreshModal.btn);
      outcomes.refreshRelayFetchesAndReopensDiagnose = fetchCalls.some(call => call.url.includes('/self/owner-storage'))
        && !document.body.contains(refreshModal.overlay)
        && showDiagnoseCalls === 1;
    } finally {
      confirmRuntime.configureSyncDiagnoseRuntimeDeps(originalConfirmDeps);
      window.fetch = originalFetch;
      if (hadBip39) window.bip39 = originalBip39;
      else delete window.bip39;
      if (hadQRCode) window.qrcode = originalQRCode;
      else delete window.qrcode;
      state.currentProfile = originalProfile;
      state.importedData = originalImported;
      if (originalSelfUrl == null) localStorage.removeItem('labcharts-self-url');
      else localStorage.setItem('labcharts-self-url', originalSelfUrl);
      if (originalRelayQuota == null) localStorage.removeItem(relayQuotaKey);
      else localStorage.setItem(relayQuotaKey, originalRelayQuota);
      document.querySelectorAll('.modal-overlay').forEach(overlay => {
        if (overlay.textContent?.includes('Rotate sync identity')
          || overlay.textContent?.includes('Compact storage')
          || overlay.textContent?.includes('Enable Phase 2')
          || overlay.textContent?.includes('Disable Phase 2')
          || overlay.textContent?.includes('Reset window')) {
          overlay.remove();
        }
      });
      actionContext.configureSyncDiagnoseActionContext({
        enableSync: async () => false,
        restoreFromMnemonic: async () => false,
        isSyncEnabled: () => false,
        pushProfile: async () => {},
        enablePhase2Cutover: () => ({ ok: false, reason: 'unconfigured' }),
        disablePhase2Cutover: () => false,
        showSyncDiagnose: async () => {},
      });
      relayHealth.configureRelayHealth({
        getAppOwner: () => null,
        getSyncRelay: () => null,
      });
    }

    return outcomes;
  }, {
    identityUrl: moduleUrl('/js/sync-diagnose-identity-actions.js'),
    cutoverUrl: moduleUrl('/js/sync-diagnose-cutover-actions.js'),
    relayUrl: moduleUrl('/js/sync-diagnose-relay-actions.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
