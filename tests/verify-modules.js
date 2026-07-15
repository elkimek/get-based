// verify-modules.js — Browser/static verification for modularized app
// Browser console: fetch('tests/verify-modules.js').then(r=>r.text()).then(s=>Function(s)())
// Static Node check: node tests/verify-modules.js
(async function() {
  'use strict';
  let passed = 0, failed = 0, errors = [];

  function assert(name, condition, detail) {
    if (condition) {
      passed++;
    } else {
      failed++;
      errors.push({ name, detail: detail || '' });
      console.error(`FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    }
  }

  const serviceWorkerCacheModules = [
    '/js/main.js',
    '/js/app-feature-modules.js',
    '/js/app-foundation-modules.js',
    '/js/app-health-data-modules.js',
    '/js/app-light-sun-modules.js',
    '/js/app-data-io-modules.js',
    '/js/app-ai-interaction-modules.js',
    '/js/app-ui-shell-modules.js',
    '/js/app-shell-hooks.js',
    '/js/app-event-listeners.js',
    '/js/crypto.js',
    '/js/startup-orchestrator.js',
    '/js/startup-foundation.js',
    '/js/startup-maintenance-runtime.js',
    '/js/startup-profile.js',
    '/js/startup-oauth-callbacks.js',
    '/js/startup-maintenance.js',
    '/js/startup-ui.js',
    '/js/emf-runtime.js',
    '/js/schema-environment.js',
    '/js/views.js',
    '/js/import-file-input.js',
    '/js/import-drop-zone.js',
    '/js/import-drop-zone-runtime.js',
    '/js/ai-verdict-engine-runtime.js',
    '/js/chat-runtime.js',
    '/js/chat-render-runtime.js',
    '/js/chat-send-runtime.js',
    '/js/recommendations-runtime.js',
    '/js/recommendations-products.js',
    '/js/recommendation-actions.js',
    '/js/context-card-dashboard-ai.js',
    '/js/context-card-dashboard-ai-actions.js',
    '/js/dashboard-recommendation-widget.js',
    '/js/supplement-impact.js',
    '/js/context-card-lifestyle-runtime.js',
    '/js/context-card-lifestyle-editors.js',
    '/js/wearables-detail-modal.js',
    '/js/wearables-detail-runtime.js',
    '/js/wearables-bp-detail-chart.js',
    '/js/wearables-formatters.js',
    '/js/wearables-manual-form-ui.js',
    '/js/wearables-apple-health-runtime.js',
    '/js/wearables-runtime.js',
    '/js/wearables-auth-runtime.js',
    '/js/wearables-settings-runtime.js',
    '/js/wearables-connect-runtime.js',
    '/js/dashboard-view-composition.js',
    '/js/dashboard-page-view.js',
    '/js/mobile-dashboard-runtime.js',
    '/js/lens-page-shell.js',
    '/js/biology-scores-runtime.js',
    '/js/chart-card-recs.js',
    '/js/category-customization-runtime.js',
    '/js/category-glyphs.js',
    '/js/category-page-runtime.js',
    '/js/category-page-view.js',
    '/js/category-customization.js',
    '/js/commit-hash.js',
    '/js/client-list-runtime.js',
    '/js/nav-runtime.js',
    '/js/views-router-runtime.js',
    '/js/views-runtime-bridge.js',
    '/js/focus-card.js',
    '/js/onboarding-view-runtime.js',
    '/js/onboarding-view.js',
    '/js/marker-detail-modal.js',
    '/js/marker-detail-runtime.js',
    '/js/marker-detail-editing.js',
    '/js/light-conditions-now.js',
    '/js/light-conditions-now-hooks.js',
    '/js/light-page-view.js',
    '/js/light-page-view-hooks.js',
    '/js/light-page-view-ui-hooks.js',
    '/js/light-devices-runtime.js',
    '/js/light-devices-actions.js',
    '/js/light-channel-view.js',
    '/js/light-channel-view-hooks.js',
    '/js/light-channel-view-ui-hooks.js',
    '/js/sun-runtime.js',
    '/js/sun-defaults-runtime.js',
    '/js/sun-body-silhouette-runtime.js',
    '/js/sun-channel-metrics.js',
    '/js/sun-context-hooks.js',
    '/js/light-sessions-view.js',
    '/js/compare-correlations.js',
    '/js/mobile-dashboard.js',
    '/js/dashboard-widget-runtime.js',
    '/js/provider-local-ai-runtime.js',
    '/js/provider-model-controls-runtime.js',
    '/js/provider-panel-renderers-runtime.js',
    '/js/api-runtime.js',
    '/js/api.js',
    '/js/api-models.js',
    '/js/api-provider-storage-runtime.js',
    '/js/api-provider-storage.js',
    '/js/api-transport.js',
    '/js/api-openai-compatible.js',
    '/js/api-local.js',
    '/js/api-venice.js',
    '/js/api-openrouter.js',
    '/js/api-openrouter-oauth.js',
    '/js/api-routstr.js',
    '/js/api-ppq.js',
    '/js/api-custom.js',
    '/js/charts-runtime.js',
    '/js/notes-runtime.js',
    '/js/pdf-import-review-runtime.js',
    '/js/theme-runtime.js',
    '/js/tour-runtime.js',
    '/js/touch-tooltip-runtime.js',
    '/js/utils-runtime.js',
    '/js/schema.js',
    '/js/dna-window-bindings.js',
    '/js/sync-diagnose-runtime.js',
    '/js/sync-pull-active-refresh-runtime.js',
  ];

  function assertServiceWorkerCache(sw) {
    assert('SW uses importScripts for version', sw.includes("importScripts('/version.js')"));
    assert('SW CACHE_NAME uses semver template', sw.includes('`labcharts-v${self.APP_VERSION}`'));
    assert('SW APP_SHELL includes version.js', sw.includes("'/version.js'"));
    for (const modulePath of serviceWorkerCacheModules) {
      assert(`Service worker caches ${modulePath.slice(1)}`, sw.includes(modulePath));
    }
    assert('Service worker does NOT cache app.js', !sw.includes('/app.js'));
  }

  async function runNodeVerification() {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const scriptPath = path.resolve(process.argv[1] || 'tests/verify-modules.js');
    const root = path.resolve(path.dirname(scriptPath), '..');
    const [indexHtml, sw, checkJsConfigText, appUiShellModules] = await Promise.all([
      fs.readFile(path.join(root, 'index.html'), 'utf8'),
      fs.readFile(path.join(root, 'service-worker.js'), 'utf8'),
      fs.readFile(path.join(root, 'tsconfig.checkjs.json'), 'utf8'),
      fs.readFile(path.join(root, 'js', 'app-ui-shell-modules.js'), 'utf8'),
    ]);
    const checkJsConfig = JSON.parse(checkJsConfigText);

    assert('Module script tag exists', indexHtml.includes('<script type="module" src="js/main.js"></script>'));
    assert('Old app.js script tag removed', !/<script[^>]+src=["']app\.js["']/.test(indexHtml));
    assert('checkJs includes js/app-shell-hooks.js',
      Array.isArray(checkJsConfig.include) && checkJsConfig.include.includes('js/app-shell-hooks.js'));
    assert('app-ui shell module imports app-shell-hooks.js',
      appUiShellModules.includes("./app-shell-hooks.js") || appUiShellModules.includes("'./app-shell-hooks.js'"));
    assertServiceWorkerCache(sw);
    printResults();
  }

  if (typeof document === 'undefined' &&
      typeof process !== 'undefined' &&
      process.versions?.node) {
    await runNodeVerification();
    return;
  }

  // ═══════════════════════════════════════════════
  // 1. MODULE LOADING — script tag and JS directory
  // ═══════════════════════════════════════════════
  const moduleScript = document.querySelector('script[type="module"][src="js/main.js"]');
  assert('Module script tag exists', !!moduleScript);

  const oldAppScript = document.querySelector('script[src="app.js"]');
  assert('Old app.js script tag removed', !oldAppScript);

  // ═══════════════════════════════════════════════
  // 2. WINDOW EXPORTS — all 300+ functions registered
  // ═══════════════════════════════════════════════

  // Module-only surfaces are verified through their ESM exports. Remaining UI
  // modules below still publish legacy window hooks while migration continues.
  const [apiModule, backupModule, cashuWalletModule, chartsModule, contextCardsModule, cryptoModule, cycleModule, dataModule, emfModule, emfRuntimeModule, exportModule, labContextModule, lensModule, lightToolsModule, pdfImportModule, piiModule, profileModule, providerPanelsModule, settingsSyncPanelModule, sunContextModule, sunSpectrumModule, supplementsModule, utilsModule, viewsModule] = await Promise.all([
    import('../js/api.js'),
    import('../js/backup.js'),
    import('../js/cashu-wallet.js'),
    import('../js/charts.js'),
    import('../js/context-cards.js'),
    import('../js/crypto.js'),
    import('../js/cycle.js'),
    import('../js/data.js'),
    import('../js/emf.js'),
    import('../js/emf-runtime.js'),
    import('../js/export.js'),
    import('../js/lab-context.js'),
    import('../js/lens.js'),
    import('../js/light-tools.js'),
    import('../js/pdf-import.js'),
    import('../js/pii.js'),
    import('../js/profile.js'),
    import('../js/provider-panels.js'),
    import('../js/settings-sync-panel.js'),
    import('../js/sun-context.js'),
    import('../js/sun-spectrum.js'),
    import('../js/supplements.js'),
    import('../js/utils.js'),
    import('../js/views.js'),
  ]);
  const apiExports = [
    'getVeniceKey','saveVeniceKey','hasVeniceKey',
    'getVeniceModel','setVeniceModel','getVeniceModelDisplay',
    'getOpenRouterKey','saveOpenRouterKey','hasOpenRouterKey',
    'getOpenRouterModel','setOpenRouterModel','getOpenRouterModelDisplay',
    'getRoutstrKey','saveRoutstrKey','hasRoutstrKey',
    'getRoutstrModel','setRoutstrModel','getRoutstrModelDisplay',
    'getPpqKey','savePpqKey','hasPpqKey',
    'getPpqModel','setPpqModel','getPpqModelDisplay',
    'getOllamaConfig','saveOllamaConfig',
    'getOllamaMainModel','setOllamaMainModel',
    'getOllamaPIIUrl','setOllamaPIIUrl','getOllamaPIIModel','setOllamaPIIModel',
    'fetchVeniceModels','fetchOpenRouterModels','fetchRoutstrModels','fetchPpqModels',
    'deduplicateModels','renderModelPricingHint',
    'getAIProvider','setAIProvider','hasAIProvider',
    'validateVeniceKey','validateOpenRouterKey','validateRoutstrKey','validatePpqKey',
    'callOllamaChat','callVeniceAPI','callOpenRouterAPI','callRoutstrAPI','callPpqAPI','callClaudeAPI'
  ];

  // charts.js (8, module-only)
  const chartsExports = [
    'refBandPlugin','optimalBandPlugin','noteAnnotationPlugin','supplementBarPlugin',
    'getNotesForChart','getSupplementsForChart',
    'createLineChart','getMarkerDescription'
  ];

  // lens.js (28, module-only)
  const lensExports = [
    'getLensConfig','saveLensConfig','getLensKey','saveLensKey',
    'hasLens','queryLens','queryLensMulti','buildLensSnippet','testLensConnection','clearLensCache',
    'openKnowledgeBaseModal','closeKnowledgeBaseModal',
    'subscribeLensStatus','getLensStatus','isValidLensUrl',
    'renderCustomLensSection','handleSaveLensConfig','handleToggleLens',
    'handleClearLensCache','handleRemoveLens','updateLensIndicator',
    'handleLensBackendChange',
    'handleLocalLensDeleteDoc','handleLocalLensClear',
    'handleLibraryActivate','handleLibraryNew','handleLibraryRename','handleLibraryDelete',
  ];

  // light-tools.js (17 selected exports, module-only)
  const lightToolsExports = [
    'configureLightTools','installLightToolsActionDelegates',
    'openLuxMeter','openFlickerDetector','openDarknessMeter','openCCTMeter',
    'openSpectrumClassifier','openGlassTransmission','openSunriseLogger','openEyeLevelAudit',
    'getMeasurements','getMeasurementsForRoom','saveMeasurement','deleteMeasurement',
    'renderLightTools','normalizeGoldenHourMinutes','closeEyeLevelAudit'
  ];
  const lightToolsLegacyGlobals = [
    'openLuxMeter','openFlickerDetector','openDarknessMeter','openCCTMeter',
    'openSpectrumClassifier','openGlassTransmission','openSunriseLogger','openEyeLevelAudit',
    'getMeasurements','getMeasurementsForRoom','saveMeasurement','deleteMeasurement','renderLightTools'
  ];

  // settings-sync-panel.js (6, module-only)
  const settingsSyncPanelExports = [
    'renderMessengerSection','renderSyncSection','showSyncSetupModal',
    'closeSyncSetup','closeRestoreMnemonicDialog','hydrateSettingsSyncPanel'
  ];
  const settingsSyncPanelLegacyGlobals = [
    'toggleSync','toggleMnemonicVisibility','copyMnemonic','copySyncIdentityCode',
    'openRestoreMnemonicDialog','closeRestoreMnemonicDialog','confirmRestoreMnemonic',
    'saveSyncRelay','closeSyncSetup','syncSetupNew','syncSetupRestore','syncSetupBack',
    'syncSetupDoRestore','syncSetupDone','showSyncSetupModal','toggleMessenger',
    'toggleMessengerToken','toggleMessengerContextKey','copyMessengerToken',
    'copyMessengerContextKey','regenerateMessengerToken','regenerateMessengerContextKey'
  ];

  // sun-context.js (6, module-only)
  const sunContextExports = [
    'configureSunContext','buildSunContext','getSunSessionsSlice','getSunSessionDetail',
    'isBodyRegionsInAIContext','setBodyRegionsInAIContext'
  ];
  const sunContextLegacyGlobals = [
    'buildSunContext','getSunSessionsSlice','getSunSessionDetail',
    'isBodyRegionsInAIContext','setBodyRegionsInAIContext'
  ];

  // sun-spectrum.js (21 former browser globals, now module-only)
  const sunSpectrumExports = [
    'reconstructSpectrum','synthesizeDeviceSpectrum','effectiveDeviceForMode','validateModeCoupling',
    'heuristicPeakShares','computeChannelDoses','erythemalSED','fractionOfMED',
    'vitaminDIU','vitaminDIURaw','vitaminDIUPerSession','VITD_DAILY_SATURATION_IU',
    'VITD_PER_SESSION_BODYFRAC_CAP_IU','vitaminDIURange','geneticVitaminDMultiplier',
    'pbmJoulesPerCm2','circadianMelanopicLux','retinalUVdose','glassTransmission',
    'sunscreenTransmission','SUN_CHANNELS'
  ];

  // lab-context.js (30, module-only)
  const labContextExports = [
    'configureLabContext','buildLabContext','invalidateLabContextCache','getContextSummary',
    'isGroupInAIContext','setGroupInAIContext',
    'isInsightContextCardsEnabled','setInsightContextCardsEnabled',
    'isSupplementsMedsContextEnabled','setSupplementsMedsContextEnabled',
    'isLabMarkersContextEnabled','setLabMarkersContextEnabled',
    'isGeneticsSummaryInAIContext','setGeneticsSummaryInAIContext',
    'isGeneticsPriorityInAIContext','setGeneticsPriorityInAIContext',
    'isGeneticsInventoryInAIContext','setGeneticsInventoryInAIContext',
    'isLightSunContextEnabled','setLightSunContextEnabled',
    'isWearableContextEnabled','setWearableContextEnabled',
    'isAgentWearableSeriesEnabled','setAgentWearableSeriesEnabled',
    'getAgentWearableSeriesDays','setAgentWearableSeriesDays',
    'buildWearableContext','buildWearableSeriesSection','injectLensChunks'
  ];
  const labContextLegacyGlobals = [
    'buildLabContext','invalidateLabContextCache','getContextSummary',
    'isGroupInAIContext','setGroupInAIContext',
    'isInsightContextCardsEnabled','setInsightContextCardsEnabled',
    'isSupplementsMedsContextEnabled','setSupplementsMedsContextEnabled',
    'isLabMarkersContextEnabled','setLabMarkersContextEnabled',
    'isGeneticsSummaryInAIContext','setGeneticsSummaryInAIContext',
    'isGeneticsPriorityInAIContext','setGeneticsPriorityInAIContext',
    'isGeneticsInventoryInAIContext','setGeneticsInventoryInAIContext',
    'isLightSunContextEnabled','setLightSunContextEnabled',
    'isWearableContextEnabled','setWearableContextEnabled',
    'isAgentWearableSeriesEnabled','setAgentWearableSeriesEnabled',
    'getAgentWearableSeriesDays','setAgentWearableSeriesDays',
    'buildWearableContext','buildWearableSeriesSection','injectLensChunks'
  ];

  // chat.js (23)
  const chatExports = [
    'getChatStorageKey',
    'getActivePersonality','getCustomPersonalityText',
    'setChatPersonality','loadChatPersonality',
    'updateChatHeaderTitle','updatePersonalityBar','togglePersonalityBar',
    'saveCustomPersonality',
    'loadChatHistory','saveChatHistory','clearChatHistory','renderChatMessages',
    'useChatPrompt',
    'applyInlineMarkdown','renderMarkdown',
    'toggleChatPanel','openChatPanel','closeChatPanel',
    'sendChatMessage','handleChatKeydown',
    'askAIAboutMarker','askAIAboutCorrelations'
  ];

  // context-cards.js (85 former browser globals, now module-only)
  const contextCardsExports = [
    'getConditionsSummary','getDietSummary','getExerciseSummary',
    'getSleepSummary','getLightCircadianSummary','getStressSummary',
    'getLoveLifeSummary','getEnvironmentSummary','getGoalsSummary',
    'isContextFilled',
    'renderProfileContextCards','debounceContextNotes',
    'applyDotColor','applyAISummary','getCardFingerprint','loadContextHealthDots','refreshAllHealthDots',
    'renderSelectField','selectCtxOption','getSelectedOption',
    'renderTagsField','toggleCtxTag','getSelectedTags',
    'renderNoteField','contextEditorActions','saveAndRefresh',
    'openDiagnosesEditor','renderDiagnosesModal',
    'filterConditionSuggestions','selectConditionSuggestion','closeSuggestionsOnClickOutside',
    'syncDiagnosesNote','addCondition','editCondition','cancelConditionEdit','deleteCondition',
    'addFamilyHistoryEntry','editFamilyHistoryEntry','cancelFamilyHistoryEdit','deleteFamilyHistoryEntry',
    'filterFamilyConditionSuggestions','selectFamilyConditionSuggestion',
    'saveDiagnoses','closeDiagnoses','clearDiagnoses',
    'openDietEditor','saveDiet','clearDiet',
    'openSleepRestEditor','saveSleepRest','clearSleepRest',
    'openLightCircadianEditor','saveLightCircadian','clearLightCircadian',
    'openExerciseEditor','saveExercise','clearExercise',
    'openStressEditor','saveStress','clearStress',
    'openLoveLifeEditor','saveLoveLife','clearLoveLife',
    'openEnvironmentEditor','saveEnvironment','clearEnvironment',
    'openHealthGoalsEditor','renderHealthGoalsModal',
    'addHealthGoal','deleteHealthGoal','closeHealthGoals','clearHealthGoals',
    'openInterpretiveLensEditor','saveInterpretiveLens','clearInterpretiveLens',
    'renderInterpretiveLensSection','renderKnowledgeBaseSection',
    'openContextModal','openPersonalizeAIPicker','openDataProtectionPicker','triggerDNAFilePicker',
    'recordChange','showDietContaminantsModal','openCardTipsModal','loadContextCardTips'
  ];

  // client-list.js (3)
  const clientListExports = [
    'openClientList','closeClientList','openClientForm','configureClientListRuntime'
  ];

  // cycle.js (15, module-only)
  const cycleExports = [
    'getCyclePhase','getNextBestDrawDate','getBloodDrawPhases',
    'calculateCycleStats','detectPerimenopausePattern','detectCycleIronAlerts',
    'renderMenstrualCycleSection',
    'openMenstrualCycleEditor','saveMenstrualCycle','clearMenstrualCycle',
    'syncMenstrualCycleProfileFromForm',
    'addPeriodEntry','deletePeriodEntry','toggleCycleSymptomTag','_toggleCycleEditorFields'
  ];
  const cycleLegacyGlobals = [
    'getCyclePhase','getNextBestDrawDate','getBloodDrawPhases',
    'detectPerimenopausePattern','detectCycleIronAlerts','renderMenstrualCycleSection',
    'openMenstrualCycleEditor','saveMenstrualCycle','clearMenstrualCycle',
    'syncMenstrualCycleProfileFromForm','addPeriodEntry','deletePeriodEntry',
    'toggleCycleSymptomTag','_toggleCycleEditorFields'
  ];

  // emf.js (23 exports, module-only; lazy runtime keeps feature startup deferred)
  const emfExports = [
    'configureEMFAIDeps','openEMFAssessmentEditor','addEMFAssessment','toggleEMFAssessment',
    'selectEMFRoom','handleEMFRoomDropdown','addEMFRoom','removeEMFRoom','deleteEMFAssessment',
    'updateEMFField','updateEMFRoom','updateEMFMeasurement','updateEMFMeter','handleEMFPDF',
    'toggleEMFCompare','closeEMFInterpretation','discussEMFInterpretation','interpretEMFAssessment',
    'interpretEMFComparison','addEMFPhotos','removeEMFPhoto','viewEMFPhoto','saveEMFExplicit'
  ];
  const emfLegacyGlobals = emfExports.filter(name => name !== 'configureEMFAIDeps');
  const emfRuntimeExports = ['loadEMFModule','openEMFAssessmentEditor','closeEMFInterpretation'];

  // data.js (30 former browser globals plus one test hook, now module-only)
  const dataExports = [
    'saveImportedData','getFocusCardFingerprint',
    'getActiveData','invalidateActiveDataCache','applyUnitConversion',
    'filterDatesByRange','recalculateHOMAIR',
    'renderDateRangeFilter','setDateRange',
    'renderChartLayersDropdown','toggleChartLayersDropdown','setSuppOverlay','setNoteOverlay',
    'setPhaseOverlay','destroyAllCharts',
    'countFlagged','getLatestValueIndex','getAllFlaggedMarkers',
    'statusIcon',
    'detectTrendAlerts','getKeyTrendMarkers',
    'switchUnitSystem','toggleAltUnits','getEffectiveRange','getEffectiveRangeForDate','getPhaseRefEnvelope','switchRangeMode',
    'updateHeaderDates','updateHeaderRangeToggle',
    'registerRefreshCallback','_runRegisteredRefreshCallback'
  ];

  // export.js (11 former browser globals, now module-only)
  const exportExports = [
    'openReportBuilder','closeReportBuilder','generateReportAISummary','exportPDFReport',
    'exportDataJSON','exportClientJSON','exportAllDataJSON','buildAllDataBundle',
    'importDataJSON','clearAllData','loadDemoData'
  ];

  // cashu-wallet.js (33 exports; 32 former browser aliases, now module-only)
  const cashuWalletExports = [
    'getMintUrl','setMintUrl','generateWalletSeed','getWalletMnemonic','hasWalletSeed',
    'extractTokenMintUrl','restoreWalletFromSeed','getWalletBalance','recoverPendingWalletOperation',
    'checkProofStates','createFundingInvoice','checkFundingStatus','recoverPendingFunding',
    'receiveToken','depositToNode','recoverPendingDeposit','clearPendingDeposit',
    'recoverPendingWithdraw','clearPendingWithdraw','savePendingWithdrawToken',
    'createWithdrawQuote','executeWithdraw','withdrawToAddress','getMaxWithdrawable',
    'retryFeeAutoMelt','sendAsToken','getFeeBalance','redeemFees','exportWallet',
    'importWallet','clearWallet','destroyWalletDB','getFeePct'
  ];
  const cashuWalletLegacyGlobals = [
    'cashuGetBalance','cashuCheckProofStates','cashuCreateFundingInvoice','cashuCheckFundingStatus',
    'cashuRecoverPendingFunding','cashuRecoverPendingWalletOperation','cashuReceiveToken',
    'cashuDepositToNode','cashuExportWallet','cashuImportWallet','cashuClearWallet',
    'cashuDestroyWalletDB','cashuRecoverPendingDeposit','cashuClearPendingDeposit',
    'cashuRecoverPendingWithdraw','cashuClearPendingWithdraw','cashuSavePendingWithdrawToken',
    'cashuSendAsToken','cashuCreateWithdrawQuote','cashuExecuteWithdraw','cashuWithdrawToAddress',
    'cashuGetMaxWithdrawable','cashuRetryFeeAutoMelt','cashuGetFeeBalance','cashuRedeemFees',
    'cashuGenerateWalletSeed','cashuGetWalletMnemonic','cashuHasWalletSeed',
    'cashuRestoreWalletFromSeed','cashuGetMintUrl','cashuSetMintUrl','cashuGetFeePct'
  ];

  // nav.js (5)
  const navExports = [
    'buildSidebar','filterSidebar','toggleNavGroup',
    'renderProfileDropdown','renderProfileButton','getAvatarColor'
  ];

  // notes.js (3)
  const notesExports = [
    'openNoteEditor','saveNote','deleteNote'
  ];

  // pdf-import.js (37 former browser globals, now module-only)
  const pdfImportExports = [
    'deleteImportSnapshot','openImportReviewFromSnapshot',
    'buildMarkerReference','reconcileImportMarkerMappings','extractPDFText','tryParseJSON',
    'parseLabPDFWithAI','showAINeededDialog','showImportPreview','applyManualImportDate',
    'mapUnmatchedMarker','mapUnmatchedMarkerInput','setImportReviewFilter',
    'applyImportReviewFilters','toggleImportRow','closeImportModal','confirmImport',
    'removeImportedEntry','renameImportedEntryDate','setupDropZone','classifyImportFiles',
    'isPdfByMagic','showImportProgress','hideImportProgress','assessTextQuality',
    'extractPDFImages','parseLabPDFWithAIImages','handlePDFFile','handleImageFile',
    'handleTextFile','handleCycleImportFile','handleBatchPDFs','showBatchImportProgress',
    'showImportPreviewAsync','syncImportStatusFab','handleImportStatusClick','isImportRunning'
  ];

  // pii.js (7, module-only)
  const piiExports = [
    'obfuscatePDFText','sanitizeWithOllama','checkOllamaPII',
    'reviewPIIBeforeSend',
    'checkOllama'
  ];

  // profile.js (28 former browser globals, now module-only)
  const profileExports = [
    'profileStorageKey',
    'getProfiles','saveProfiles','initProfilesCache','createDefaultProfileData','createProfile','deleteProfile','renameProfile','switchProfile',
    'migrateProfileData',
    'getProfileSex','setProfileSex','getProfileDob','setProfileDob',
    'getProfileLocation','setProfileLocation',
    'getProfileHeight','setProfileHeight',
    'getLocationCache',
    'latitudeToBand','getLatitudeFromLocation',
    'updateProfileMeta','getAllTags','touchProfileTimestamp',
    'loadProfile','getActiveProfileId','setActiveProfileId',
    'detectLatitudeWithAI'
  ];

  // settings.js (8)
  const settingsExports = [
    'openSettingsModal','closeSettingsModal',
    'renderPrivacySection',
    'togglePrivacyConfigure','updatePrivacyStatusCard',
    'updateSettingsUI',
    'renderDataEntriesSection','refreshDataEntriesSection','configureSettingsRuntime'
  ];

  // provider-panels.js (74 former browser globals, now module-only)
  const providerPanelsExports = [
    'renderAIProviderPanel','toggleAIPause','switchAIProvider',
    'initSettingsModelFetch','initSettingsOllamaCheck',
    'testOllamaConnection','testPIIOllamaConnection',
    'refreshVeniceBalance','updateVeniceModelPricing','toggleVeniceE2EE',
    'updateOpenRouterModelPricing','updateRoutstrModelPricing',
    'handleSaveVeniceKey','handleRemoveVeniceKey','renderVeniceModelDropdown',
    'handleSaveOpenRouterKey','handleRemoveOpenRouterKey','renderOpenRouterModelDropdown',
    'applyCustomOpenRouterModel','onOpenRouterDropdownChange',
    'handleSaveRoutstrKey','handleRemoveRoutstrKey','renderRoutstrModelDropdown',
    'refreshCashuWalletBalance','refreshRoutstrBalance',
    'showRoutstrWalletFund','rsWalletFundCustomInput','doRoutstrWalletFundCustom','doRoutstrWalletFund',
    'doRoutstrWalletReceiveCashu','showRoutstrMintEdit','doRoutstrMintChange',
    'showRoutstrWalletBackup','showRoutstrNodePicker','connectRoutstrNode',
    'doRoutstrNodeDeposit','doRoutstrNodeWithdraw','_setActiveNodeAction',
    'walletSeedAcknowledged','setupRoutstrWalletSeed','showWalletSeedPhrase',
    'showRoutstrWithdraw','showRoutstrWithdrawLightning','showRoutstrWithdrawToken',
    'doRoutstrSendToken','doRoutstrWithdrawQuote','doRoutstrWithdrawExecute','doRoutstrWalletRestore',
    'handleCreatePpqAccount','dismissPpqKeyReveal',
    'handleSavePpqKey','handleRemovePpqKey','renderPpqModelDropdown',
    'updatePpqModelPricing','refreshPpqBalance',
    'showPpqTopup','selectPpqMethod','doPpqTopup','ppqShowCustomInput','doPpqTopupCustom','cancelPpqTopup',
    'refreshOpenRouterBalance','showInsufficientBalanceDialog',
    'handleSaveCustomApi','handleRemoveCustomApi','renderCustomApiModelDropdown',
    'applyCustomApiManualModel','updateCustomModelPricing',
    'copyOllamaPullCmd','refreshModelAdvisor',
    'applyHardwareOverride','clearHardwareOverride',
  ];

  // backup.js (13)
  const backupExports = [
    'buildBackupSnapshot','exportEncryptedBackup','importEncryptedBackup',
    'scheduleAutoBackup','getAutoBackupSnapshots','restoreAutoBackup','openBackupDB',
    'initFolderBackup','pickFolderForBackup','reauthorizeFolderBackup',
    'removeFolderBackup','getFolderBackupState','renderFolderBackupSection',
  ];

  // crypto.js (20 former browser globals, now module-only)
  const cryptoExports = [
    'initEncryption','initBroadcastChannel','getEncryptionEnabled','isUnlocked',
    'encryptedSetItem','encryptedGetItem','showEnableEncryptionModal',
    'maybeShowEncryptionNudge','maybeShowBackupNudge','disableEncryption',
    'changePassphrase','broadcastDataChanged','renderEncryptionSection',
    'renderBackupSection','isSensitiveKey','getCachedKey','updateKeyCache',
    'decryptKeyCache','loadBackupSnapshots','toggleBackupSnapshots'
  ];

  // supplements.js (23, module-only)
  const supplementsExports = [
    'renderSupplementsSection','openSupplementsEditor','toggleSuppAccordion','showAddSuppForm',
    'saveSupplement','deleteSupplement','askAIMitoContext',
    'computeAllImpacts','computeSupplementImpact','effectiveTimesPerDay',
    'getSupplementPeriods','ingredientDailyTotal','parseAmount',
    'refreshSupplementImpact','renderSupplementImpact',
    'addIngredientRow','removeIngredientRow','addPeriodRow','removePeriodRow',
    'scanSupplementLabel','fetchSupplementFromURL','updateIngTotal','updateAllIngTotals'
  ];
  const supplementLegacyGlobals = [
    'renderSupplementsSection','openSupplementsEditor','toggleSuppAccordion','showAddSuppForm',
    'saveSupplement','deleteSupplement','askAIMitoContext','computeAllImpacts',
    'getSupplementPeriods','addIngredientRow','removeIngredientRow','addPeriodRow',
    'removePeriodRow','scanSupplementLabel','fetchSupplementFromURL',
    'refreshSupplementImpact','updateIngTotal','updateAllIngTotals','ingredientDailyTotal'
  ];

  // theme.js (8)
  const themeExports = [
    'getTheme','setTheme','toggleTheme',
    'getTimeFormat','setTimeFormat','formatTime','parseTimeInput',
    'getChartColors'
  ];

  // utils.js (15 former browser globals, now module-only)
  const utilsExports = [
    'showNotification','showConfirmDialog','showPromptDialog',
    'isDebugMode','setDebugMode','isPIIReviewEnabled','setPIIReviewEnabled',
    'isAnalyticsEnabled','setAnalyticsEnabled','maybeShowAnalyticsConsent',
    'dismissAnalyticsConsent','dismissAnalyticsConsentAndDisable',
    'hasCardContent','escapeAttr','loadScriptOnce'
  ];

  // views.js retains only the two core shell contracts on window.
  const viewsLegacyExports = ['navigate','closeModal'];
  const viewsFacadeModuleExports = [
    'getInitialView','showDashboard','showLabs','showBiologyScoresLens','showGenomeLens',
    'showBodyLens','showInsightLens','showRecommendations','openRecommendationDetail',
    'discussRecommendation','saveRecommendation','dismissRecommendation','showLight',
    '_expandLightToolsSection','_toggleChannelDetail','_openChannelOnLightPage',
    '_openAllSessionsModal','renderLightTodayStrip','renderLightChannelsLive',
    'renderConditionsNow','_refreshConditionsNow','_inspectConditionsNow','_setManualUvi',
    '_clearManualUvi','renderFocusCard','buildFocusContext','loadFocusCard','refreshFocusCard',
    'renderOnboardingBanner','renderAIConnectionReminder','dismissAIReminder',
    'openChatProviderQuiz','setOnboardingFocus','completeOnboardingSex',
    'completeOnboardingProfile','dismissOnboarding','showCategory','renameCategory',
    'renameMarker','revertMarkerName','changeCategoryIcon','switchView','renderChartCard',
    'renderTableView','renderHeatmapView','renderFattyAcidsView','renderFattyAcidsCharts',
    'fetchCustomMarkerDescription','showDetailModal','editRefRange','saveRefRange',
    'revertRefRange','openManualEntryForm','saveManualEntry','saveAndAddAnotherManualEntry',
    'openCreateMarkerModal','pickNewCatIcon','saveCustomMarker','deleteMarkerValue',
    'deleteCustomMarker','editMarkerValue','revertMarkerValue','editValueNote',
    'deleteValueNote','toggleMarkerNoteEditor','saveMarkerNote','deleteMarkerNote',
    'rememberModalTrigger','showCompare','setCompareDate1','setCompareDate2','updateCompare',
    'swapCompareDates','renderCompareTable','showCorrelations','populateCorrelationOptions',
    'showCorrelationDropdown','filterCorrelationOptions','toggleCorrelationMarker',
    'applyCorrelationPreset','renderCorrelationChips','renderCorrelationChart'
  ];
  const viewsDashboardWidgetExports = [
    'toggleDashboardOrganizeMode','moveDashboardWidget','moveLensPageWidget',
    'hideDashboardWidget','showDashboardWidget','addDashboardWidgetFromLens',
    'removeDashboardWidgetFromLens','addDashboardMarkerWidget','addDashboardBiometricMetric',
    'addDashboardBiometricWidget','removeDashboardBiometricMetric',
    'filterDashboardMarkerWidgetPicker','filterDashboardBiometricWidgetPicker',
    'resetDashboardWidgets','clearDashboardWidgets','toggleDashboardQuickMarkerPin',
    'openDashboardWidgetPicker','openDashboardBiometricPicker','closeDashboardWidgetPicker',
    'startDashboardWidgetDrag','allowDashboardWidgetDrop','dropDashboardWidget'
  ];

  for (const name of apiExports) {
    const val = apiModule[name];
    const isFunc = typeof val === 'function';
    assert(`api.${name} (api.js)`, val !== undefined, isFunc ? 'function' : typeof val);
  }
  console.log(`Checked ${apiExports.length} api.js module exports`);

  for (const [moduleName, moduleApi, exports] of [
    ['backup.js', backupModule, backupExports],
    ['cashu-wallet.js', cashuWalletModule, cashuWalletExports],
    ['charts.js', chartsModule, chartsExports],
    ['context-cards.js', contextCardsModule, contextCardsExports],
    ['crypto.js', cryptoModule, cryptoExports],
    ['cycle.js', cycleModule, cycleExports],
    ['data.js', dataModule, dataExports],
    ['emf.js', emfModule, emfExports],
    ['emf-runtime.js', emfRuntimeModule, emfRuntimeExports],
    ['export.js', exportModule, exportExports],
    ['lab-context.js', labContextModule, labContextExports],
    ['lens.js', lensModule, lensExports],
    ['light-tools.js', lightToolsModule, lightToolsExports],
    ['pdf-import.js', pdfImportModule, pdfImportExports],
    ['pii.js', piiModule, piiExports],
    ['profile.js', profileModule, profileExports],
    ['provider-panels.js', providerPanelsModule, providerPanelsExports],
    ['settings-sync-panel.js', settingsSyncPanelModule, settingsSyncPanelExports],
    ['sun-context.js', sunContextModule, sunContextExports],
    ['sun-spectrum.js', sunSpectrumModule, sunSpectrumExports],
    ['supplements.js', supplementsModule, supplementsExports],
    ['utils.js', utilsModule, utilsExports],
    ['views.js facade', viewsModule, viewsFacadeModuleExports],
    ['views.js dashboard widgets', viewsModule, viewsDashboardWidgetExports],
  ]) {
    for (const name of exports) {
      const val = moduleApi[name];
      const isFunc = typeof val === 'function';
      assert(`${moduleName}.${name} module export`, val !== undefined, isFunc ? 'function' : typeof val);
    }
    console.log(`Checked ${exports.length} ${moduleName} module exports`);
  }
  for (const name of supplementLegacyGlobals) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of backupExports) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of cryptoExports) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of cycleLegacyGlobals) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of emfLegacyGlobals) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of lightToolsLegacyGlobals) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of pdfImportExports) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of profileExports) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of settingsSyncPanelLegacyGlobals) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of labContextLegacyGlobals) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of sunContextLegacyGlobals) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of sunSpectrumExports) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of utilsExports) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of exportExports) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of cashuWalletLegacyGlobals) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of providerPanelsExports) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of contextCardsExports) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of dataExports) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of viewsDashboardWidgetExports) {
    assert(`window.${name} stays module-only`, !(name in window));
  }
  for (const name of viewsFacadeModuleExports) {
    assert(`window.${name} stays module-only`, !(name in window));
  }

  const allModules = {
    'chat.js': chatExports,
    'client-list.js': clientListExports,
    'nav.js': navExports,
    'notes.js': notesExports,
    'settings.js': settingsExports,
    'theme.js': themeExports,
    'views.js': viewsLegacyExports,
  };

  let totalExports = 0;
  for (const [mod, exports] of Object.entries(allModules)) {
    for (const name of exports) {
      totalExports++;
      const val = window[name];
      const isFunc = typeof val === 'function';
      // profileStorageKey is a function, rest should be functions too
      assert(`window.${name} (${mod})`, val !== undefined, isFunc ? 'function' : typeof val);
    }
  }
  console.log(`Checked ${totalExports} window exports`);

  // ═══════════════════════════════════════════════
  // 3. DOM STRUCTURE — core elements exist
  // ═══════════════════════════════════════════════
  assert('Header exists', !!document.querySelector('header.header'));
  assert('Logo text', document.querySelector('header h1')?.textContent.includes('getbased'));
  assert('Profile selector', !!document.getElementById('profile-selector'));
  assert('Header dates', !!document.getElementById('header-dates'));
  assert('Range toggle', !!document.getElementById('header-range-toggle'));
  assert('Settings button', !!document.querySelector('.settings-btn'));
  assert('Header icon button base', !!document.querySelector('.header-icon-btn'));
  assert('Chat FAB button', !!document.getElementById('chat-fab'));
  assert('Sidebar nav', !!document.getElementById('sidebar-nav'));
  assert('Main content', !!document.getElementById('main-content'));
  assert('Detail modal overlay', !!document.getElementById('modal-overlay'));
  assert('Import modal overlay', !!document.getElementById('import-modal-overlay'));
  assert('Settings modal overlay', !!document.getElementById('settings-modal-overlay'));
  assert('Chat panel', !!document.getElementById('chat-panel'));
  assert('Chat messages container', !!document.getElementById('chat-messages'));
  assert('Chat input', !!document.getElementById('chat-input'));
  assert('Chat send button', !!document.getElementById('chat-send-btn'));
  assert('PDF input', !!document.getElementById('pdf-input'));
  assert('Notification container', !!document.getElementById('notification-container'));

  // ═══════════════════════════════════════════════
  // 4. SIDEBAR — rendered with nav items
  // ═══════════════════════════════════════════════
  const sidebar = document.getElementById('sidebar-nav');
  assert('Sidebar has content', sidebar && sidebar.innerHTML.length > 50);
  const navItems = sidebar?.querySelectorAll('.nav-item');
  assert('Sidebar has nav items', navItems && navItems.length >= 1,
    `Found ${navItems?.length || 0} items`);
  const dashboardItem = sidebar?.querySelector('.nav-item[data-category="dashboard"]');
  assert('Dashboard nav item exists', !!dashboardItem);

  // Sidebar search
  const sidebarSearch = document.getElementById('sidebar-search');
  assert('Sidebar search exists', !!sidebarSearch);

  // ═══════════════════════════════════════════════
  // 5. DASHBOARD — main content rendered
  // ═══════════════════════════════════════════════
  const main = document.getElementById('main-content');
  assert('Main content has HTML', main && main.innerHTML.length > 100);

  // Profile dropdown rendered
  const profileDropdown = document.getElementById('profile-selector');
  assert('Profile dropdown has content', profileDropdown && profileDropdown.innerHTML.length > 10);

  // Header dates populated
  const headerDates = document.getElementById('header-dates');
  assert('Header dates has content', headerDates && headerDates.innerHTML.length > 10);

  // Range toggle populated
  const rangeToggle = document.getElementById('header-range-toggle');
  assert('Range toggle has content', rangeToggle && rangeToggle.innerHTML.length > 10);

  // ═══════════════════════════════════════════════
  // 6. DATA PIPELINE — getActiveData works
  // ═══════════════════════════════════════════════
  const data = dataModule.getActiveData();
  assert('getActiveData returns object', typeof data === 'object' && data !== null);
  assert('getActiveData has categories', data.categories && typeof data.categories === 'object');
  assert('getActiveData has dates array', Array.isArray(data.dates));
  const catKeys = Object.keys(data.categories);
  assert('Categories not empty (schema loaded)', catKeys.length > 0,
    `Found ${catKeys.length} categories`);
  // Verify a known category
  assert('Biochemistry category exists', !!data.categories.biochemistry);
  assert('Hormones category exists', !!data.categories.hormones);
  assert('Lipids category exists', !!data.categories.lipids);

  // ═══════════════════════════════════════════════
  // 7. SCHEMA/CONSTANTS LOADED — spot checks
  // ═══════════════════════════════════════════════
  // These are ES module exports but we can verify via data pipeline
  assert('Category has markers', data.categories.biochemistry?.markers &&
    Object.keys(data.categories.biochemistry.markers).length > 0);

  // Check via window functions that depend on schema
  const ref = pdfImportModule.buildMarkerReference();
  assert('buildMarkerReference returns object', typeof ref === 'object' && ref !== null && Object.keys(ref).length > 10,
    `Got ${typeof ref}, keys: ${ref ? Object.keys(ref).length : 0}`);

  // getChartColors depends on theme.js — returns object with CSS var values (may be empty strings in headless)
  const colors = window.getChartColors();
  assert('getChartColors returns object with expected keys', typeof colors === 'object' && 'tooltipBg' in colors && 'tickColor' in colors,
    colors ? Object.keys(colors).join(',') : 'null');

  // formatTime depends on theme.js
  const formatted = window.formatTime('14:30');
  assert('formatTime works', typeof formatted === 'string' && formatted.length > 0);

  // parseTimeInput round-trip
  assert('parseTimeInput("2:30 PM") → 14:30', window.parseTimeInput('2:30 PM') === '14:30');
  assert('parseTimeInput("14:30") → 14:30', window.parseTimeInput('14:30') === '14:30');

  // ═══════════════════════════════════════════════
  // 8. PROFILE SYSTEM — basic operations
  // ═══════════════════════════════════════════════
  const profiles = profileModule.getProfiles();
  assert('getProfiles returns array', Array.isArray(profiles));
  assert('At least one profile', profiles.length >= 1);
  const activeId = profileModule.getActiveProfileId();
  assert('Active profile ID is string', typeof activeId === 'string' && activeId.length > 0);
  const storageKey = profileModule.profileStorageKey(activeId, 'imported');
  assert('profileStorageKey works', typeof storageKey === 'string' && storageKey.includes(activeId));

  // ═══════════════════════════════════════════════
  // 9. THEME SYSTEM — toggle works
  // ═══════════════════════════════════════════════
  const currentTheme = window.getTheme();
  assert('getTheme returns string', currentTheme === 'dark' || currentTheme === 'light');
  const htmlEl = document.documentElement;
  // Dark theme removes data-theme attribute; light sets it to 'light'
  const themeAttr = htmlEl.getAttribute('data-theme');
  assert('Theme attribute consistent', currentTheme === 'dark' ? themeAttr === null : themeAttr === 'light',
    `theme=${currentTheme}, attr=${themeAttr}`);

  // ═══════════════════════════════════════════════
  // 10. SETTINGS MODAL — opens and closes
  // ═══════════════════════════════════════════════
  window.openSettingsModal();
  const settingsOverlay = document.getElementById('settings-modal-overlay');
  assert('Settings modal opens', settingsOverlay?.classList.contains('show'));
  const settingsContent = document.getElementById('settings-modal');
  assert('Settings modal has content', settingsContent && settingsContent.innerHTML.length > 200);
  // Check sections exist
  assert('Settings has Profile section', settingsContent?.innerHTML.includes('Profile') || settingsContent?.innerHTML.includes('profile'));
  assert('Settings has AI Provider section', settingsContent?.innerHTML.includes('AI Provider') || settingsContent?.innerHTML.includes('provider'));
  window.closeSettingsModal();
  assert('Settings modal closes', !settingsOverlay?.classList.contains('show'));

  // 11. GLOSSARY removed in v1.3.25 — feature retired. Section
  // intentionally empty so subsequent section numbers remain stable
  // for anyone diffing this file against older versions.

  // ═══════════════════════════════════════════════
  // 12. CHAT PANEL — opens and closes
  // ═══════════════════════════════════════════════
  // openChatPanel guards on hasAIProvider() — test the panel element directly
  const chatPanel = document.getElementById('chat-panel');
  if (apiModule.hasAIProvider()) {
    window.openChatPanel();
    assert('Chat panel opens (with AI provider)', chatPanel?.classList.contains('open'));
    window.closeChatPanel();
    assert('Chat panel closes', !chatPanel?.classList.contains('open'));
  } else {
    // No AI provider — toggle manually to test CSS class mechanism
    chatPanel?.classList.add('open');
    assert('Chat panel open class works', chatPanel?.classList.contains('open'));
    chatPanel?.classList.remove('open');
    assert('Chat panel close class works', !chatPanel?.classList.contains('open'));
  }

  // Chat personality system — returns personality object, not string
  const personality = window.getActivePersonality();
  assert('getActivePersonality returns object with id', typeof personality === 'object' && typeof personality.id === 'string',
    personality ? `id=${personality.id}` : 'null');

  // Markdown rendering
  const md = window.renderMarkdown('**bold** and *italic*');
  assert('renderMarkdown handles bold', md.includes('<strong>') || md.includes('<b>'));

  // ═══════════════════════════════════════════════
  // 13. CONTEXT CARDS — rendering
  // ═══════════════════════════════════════════════
  // Cards should be on dashboard
  const contextCards = main?.querySelectorAll('.profile-context-cards .context-card, .profile-context-card');
  // If on dashboard, check cards exist
  if (main?.innerHTML.includes('context-card') || main?.innerHTML.includes('profile-context')) {
    assert('Context cards rendered', contextCards && contextCards.length > 0,
      `Found ${contextCards?.length || 0} cards`);
  }

  // Summary functions work without crashing
  assert('getGoalsSummary works', typeof contextCardsModule.getGoalsSummary() === 'string' || contextCardsModule.getGoalsSummary() === '');
  assert('getConditionsSummary works', typeof contextCardsModule.getConditionsSummary() === 'string' || contextCardsModule.getConditionsSummary() === '');
  assert('getDietSummary works', typeof contextCardsModule.getDietSummary() === 'string' || contextCardsModule.getDietSummary() === '');
  assert('getExerciseSummary works', typeof contextCardsModule.getExerciseSummary() === 'string' || contextCardsModule.getExerciseSummary() === '');
  assert('getSleepSummary works', typeof contextCardsModule.getSleepSummary() === 'string' || contextCardsModule.getSleepSummary() === '');
  assert('getLightCircadianSummary works', typeof contextCardsModule.getLightCircadianSummary() === 'string' || contextCardsModule.getLightCircadianSummary() === '');
  assert('getStressSummary works', typeof contextCardsModule.getStressSummary() === 'string' || contextCardsModule.getStressSummary() === '');
  assert('getLoveLifeSummary works', typeof contextCardsModule.getLoveLifeSummary() === 'string' || contextCardsModule.getLoveLifeSummary() === '');
  assert('getEnvironmentSummary works', typeof contextCardsModule.getEnvironmentSummary() === 'string' || contextCardsModule.getEnvironmentSummary() === '');

  // isContextFilled
  assert('isContextFilled returns boolean', typeof contextCardsModule.isContextFilled('diet') === 'boolean');

  // ═══════════════════════════════════════════════
  // 14. NAVIGATION — category switching
  // ═══════════════════════════════════════════════
  // Navigate to a known category — sidebar only shows categories with data
  window.navigate('biochemistry');
  const bioNavItem = document.querySelector('.nav-item[data-category="biochemistry"]');
  if (bioNavItem) {
    assert('Navigation activates biochemistry nav item', bioNavItem.classList.contains('active'));
  } else {
    // No data loaded — biochemistry nav item doesn't exist, but navigate still renders content
    assert('Navigate to biochemistry renders view', main?.innerHTML.length > 100);
  }
  assert('Main content updated after navigate', main?.innerHTML.includes('biochemistry') || main?.innerHTML.includes('Biochemistry') || main?.innerHTML.includes('category'));

  // Navigate to compare
  window.navigate('compare');
  assert('Compare view loads', main?.innerHTML.includes('compare') || main?.innerHTML.includes('Compare'));

  // Navigate back to dashboard
  window.navigate('dashboard');
  assert('Dashboard renders after navigate', main?.innerHTML.includes('dashboard') || main?.innerHTML.includes('Dashboard') || main?.innerHTML.includes('drop-zone') || main?.innerHTML.includes('context-card'));

  // ═══════════════════════════════════════════════
  // 15. AI PROVIDER SYSTEM — basic checks
  // ═══════════════════════════════════════════════
  const provider = apiModule.getAIProvider();
  assert('getAIProvider returns valid provider', ['openrouter','ppq','routstr','venice','ollama'].includes(provider));
  const hasAI = apiModule.hasAIProvider();
  assert('hasAIProvider returns boolean', typeof hasAI === 'boolean');

  // ═══════════════════════════════════════════════
  // 16. UNIT/RANGE SYSTEM — works
  // ═══════════════════════════════════════════════
  const effectiveRange = dataModule.getEffectiveRange({ refMin: 3.5, refMax: 5.0, optMin: 3.8, optMax: 4.5 });
  assert('getEffectiveRange returns object', effectiveRange && typeof effectiveRange.min === 'number');

  // ═══════════════════════════════════════════════
  // 17. PII FUNCTIONS — exist and callable
  // ═══════════════════════════════════════════════
  const testPII = piiModule.obfuscatePDFText('John Smith born 1990-01-01 SSN 123-45-6789');
  assert('obfuscatePDFText returns object', testPII && typeof testPII === 'object');
  assert('obfuscatePDFText has obfuscated field', typeof testPII.obfuscated === 'string');

  // ═══════════════════════════════════════════════
  // 18. EXPORT FUNCTIONS — exist
  // ═══════════════════════════════════════════════
  assert('exportPDFReport is function', typeof exportModule.exportPDFReport === 'function');
  assert('openReportBuilder is function', typeof exportModule.openReportBuilder === 'function');
  assert('closeReportBuilder is function', typeof exportModule.closeReportBuilder === 'function');
  assert('exportDataJSON is function', typeof exportModule.exportDataJSON === 'function');
  assert('exportClientJSON is function', typeof exportModule.exportClientJSON === 'function');
  assert('exportAllDataJSON is function', typeof exportModule.exportAllDataJSON === 'function');
  assert('clearAllData is function', typeof exportModule.clearAllData === 'function');

  // ═══════════════════════════════════════════════
  // 19. CYCLE HELPERS — pure function checks
  // ═══════════════════════════════════════════════
  const phase = cycleModule.getCyclePhase('2026-02-15', {
    cycleLength: 28, periodLength: 5, regularity: 'regular',
    periods: [{ startDate: '2026-02-01' }]
  });
  assert('getCyclePhase returns object', phase && typeof phase === 'object');
  assert('getCyclePhase has phaseName', typeof phase.phaseName === 'string');

  // ═══════════════════════════════════════════════
  // 20. SERVICE WORKER — cache version check
  // ═══════════════════════════════════════════════
  fetch('service-worker.js').then(r => r.text()).then(sw => {
    assertServiceWorkerCache(sw);
    printResults();
  });

  // ═══════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════
  function printResults() {
    console.log('\n' + '═'.repeat(50));
    console.log(`VERIFICATION RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
    console.log('═'.repeat(50));
    if (failed > 0) {
      console.log('\nFailed tests:');
      errors.forEach(e => console.log(`  ✗ ${e.name}${e.detail ? ' — ' + e.detail : ''}`));
    } else {
      console.log('\n✓ All tests passed!');
    }
    console.log('═'.repeat(50) + '\n');
    if (failed > 0 &&
        typeof process !== 'undefined' &&
        process.versions?.node) {
      process.exitCode = 1;
    }
  }
})().catch(error => {
  console.error(error);
  if (typeof process !== 'undefined' &&
      process.versions?.node) {
    process.exitCode = 1;
  }
});
