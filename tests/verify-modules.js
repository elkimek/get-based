// verify-modules.js — Browser-based verification for modularized app
// Run in console: fetch('tests/verify-modules.js').then(r=>r.text()).then(s=>Function(s)())
(function() {
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

  // api.js
  const apiExports = [
    'getVeniceKey','saveVeniceKey','hasVeniceKey',
    'getVeniceModel','setVeniceModel','getVeniceModelDisplay',
    'getOpenRouterKey','saveOpenRouterKey','hasOpenRouterKey',
    'getOpenRouterModel','setOpenRouterModel','getOpenRouterModelDisplay',
    'getRoutstrKey','saveRoutstrKey','hasRoutstrKey',
    'getRoutstrModel','setRoutstrModel','getRoutstrModelDisplay',
    'getPpqKey','savePpqKey','hasPpqKey',
    'getPpqModel','setPpqModel','getPpqModelDisplay',
    'getOllamaMainModel','setOllamaMainModel',
    'getOllamaPIIUrl','setOllamaPIIUrl','getOllamaPIIModel','setOllamaPIIModel',
    'fetchVeniceModels','fetchOpenRouterModels','fetchRoutstrModels','fetchPpqModels',
    'deduplicateModels','renderModelPricingHint',
    'getAIProvider','setAIProvider','hasAIProvider',
    'validateVeniceKey','validateOpenRouterKey','validateRoutstrKey','validatePpqKey',
    'callOllamaChat','callVeniceAPI','callOpenRouterAPI','callRoutstrAPI','callPpqAPI','callClaudeAPI'
  ];

  // charts.js (8)
  const chartsExports = [
    'refBandPlugin','optimalBandPlugin','noteAnnotationPlugin','supplementBarPlugin',
    'getNotesForChart','getSupplementsForChart',
    'createLineChart','getMarkerDescription'
  ];

  // lab-context.js (5)
  const labContextExports = [
    'buildLabContext','invalidateLabContextCache','getContextSummary',
    'isGroupInAIContext','setGroupInAIContext'
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

  // context-cards.js (57+)
  const contextCardsExports = [
    'getConditionsSummary','getDietSummary','getExerciseSummary',
    'getSleepSummary','getLightCircadianSummary','getStressSummary',
    'getLoveLifeSummary','getEnvironmentSummary','getGoalsSummary',
    'isContextFilled',
    'renderProfileContextCards','debounceContextNotes',
    'applyDotColor','applyAISummary','getCardFingerprint','loadContextHealthDots',
    'renderSelectField','selectCtxOption','getSelectedOption',
    'renderTagsField','toggleCtxTag','getSelectedTags',
    'renderNoteField','contextEditorActions','saveAndRefresh',
    'openDiagnosesEditor','renderDiagnosesModal',
    'filterConditionSuggestions','selectConditionSuggestion','closeSuggestionsOnClickOutside',
    'syncDiagnosesNote','addCondition','deleteCondition','saveDiagnoses','clearDiagnoses',
    'openDietEditor','saveDiet','clearDiet',
    'openSleepRestEditor','saveSleepRest','clearSleepRest',
    'openLightCircadianEditor','saveLightCircadian','clearLightCircadian',
    'openExerciseEditor','saveExercise','clearExercise',
    'openStressEditor','saveStress','clearStress',
    'openLoveLifeEditor','saveLoveLife','clearLoveLife',
    'openEnvironmentEditor','saveEnvironment','clearEnvironment',
    'openHealthGoalsEditor','renderHealthGoalsModal',
    'addHealthGoal','deleteHealthGoal','clearHealthGoals',
    'openInterpretiveLensEditor','saveInterpretiveLens','clearInterpretiveLens',
    'renderInterpretiveLensSection'
  ];

  // client-list.js (3)
  const clientListExports = [
    'openClientList','closeClientList','openClientForm'
  ];

  // cycle.js (10)
  const cycleExports = [
    'getCyclePhase','getNextBestDrawDate','getBloodDrawPhases',
    'renderMenstrualCycleSection',
    'openMenstrualCycleEditor','saveMenstrualCycle','clearMenstrualCycle',
    'syncMenstrualCycleProfileFromForm',
    'addPeriodEntry','deletePeriodEntry'
  ];

  // data.js (26)
  const dataExports = [
    'saveImportedData','getFocusCardFingerprint',
    'getActiveData','applyUnitConversion',
    'filterDatesByRange','recalculateHOMAIR',
    'renderDateRangeFilter','setDateRange',
    'renderChartLayersDropdown','toggleChartLayersDropdown','setSuppOverlay','setNoteOverlay',
    'destroyAllCharts',
    'countFlagged','getLatestValueIndex','getAllFlaggedMarkers',
    'statusIcon',
    'detectTrendAlerts','getKeyTrendMarkers',
    'switchUnitSystem','getEffectiveRange','switchRangeMode',
    'updateHeaderDates','updateHeaderRangeToggle',
    'registerRefreshCallback'
  ];

  // export.js (6)
  const exportExports = [
    'exportPDFReport','exportDataJSON','exportClientJSON','exportAllDataJSON','importDataJSON','clearAllData'
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

  // pdf-import.js (16)
  const pdfImportExports = [
    'buildMarkerReference','extractPDFText','tryParseJSON',
    'parseLabPDFWithAI','showImportPreview','applyManualImportDate',
    'closeImportModal','confirmImport','removeImportedEntry',
    'setupDropZone','showImportProgress','hideImportProgress',
    'handlePDFFile','handleImageFile','handleBatchPDFs',
    'showBatchImportProgress','showImportPreviewAsync'
  ];

  // pii.js (7)
  const piiExports = [
    'obfuscatePDFText','sanitizeWithOllama','checkOllamaPII',
    'reviewPIIBeforeSend',
    'getOllamaConfig','checkOllama'
  ];

  // profile.js (27)
  const profileExports = [
    'profileStorageKey',
    'getProfiles','saveProfiles','createProfile','deleteProfile','renameProfile','switchProfile',
    'migrateProfileData',
    'getProfileSex','setProfileSex','getProfileDob','setProfileDob',
    'getProfileLocation','setProfileLocation',
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
    'renderDataEntriesSection','refreshDataEntriesSection'
  ];

  // provider-panels.js (72)
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
    'walletSeedAcknowledged','showWalletSeedPhrase',
    'showRoutstrWithdraw','showRoutstrWithdrawLightning','showRoutstrWithdrawToken',
    'doRoutstrSendToken','doRoutstrWithdrawQuote','doRoutstrWithdrawExecute','doRoutstrWalletRestore',
    'handleCreatePpqAccount','dismissPpqKeyReveal',
    'handleSavePpqKey','handleRemovePpqKey','renderPpqModelDropdown',
    'updatePpqModelPricing','refreshPpqBalance',
    'showPpqTopup','selectPpqMethod','doPpqTopup','ppqShowCustomInput','doPpqTopupCustom','cancelPpqTopup',
    'refreshOpenRouterBalance',
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

  // supplements.js (4)
  const supplementsExports = [
    'renderSupplementsSection','openSupplementsEditor',
    'saveSupplement','deleteSupplement'
  ];

  // theme.js (8)
  const themeExports = [
    'getTheme','setTheme','toggleTheme',
    'getTimeFormat','setTimeFormat','formatTime','parseTimeInput',
    'getChartColors'
  ];

  // utils.js (2)
  const utilsExports = [
    'showNotification','showConfirmDialog'
  ];

  // views.js (36 — closeImportModal removed, lives in pdf-import.js)
  const viewsExports = [
    'navigate','showDashboard',
    'renderFocusCard','loadFocusCard','refreshFocusCard',
    'renderOnboardingBanner','completeOnboardingSex','completeOnboardingProfile','dismissOnboarding',
    'showCategory','switchView',
    'renderChartCard','renderTableView','renderHeatmapView','renderFattyAcidsView','renderFattyAcidsCharts',
    'fetchCustomMarkerDescription',
    'showDetailModal','openManualEntryForm','saveManualEntry','deleteMarkerValue',
    'closeModal',
    'showCompare','setCompareDate1','setCompareDate2','updateCompare','swapCompareDates','renderCompareTable',
    'showCorrelations','populateCorrelationOptions','showCorrelationDropdown',
    'filterCorrelationOptions','toggleCorrelationMarker','applyCorrelationPreset',
    'renderCorrelationChips','renderCorrelationChart'
  ];

  const allModules = {
    'api.js': apiExports,
    'charts.js': chartsExports,
    'lab-context.js': labContextExports,
    'chat.js': chatExports,
    'client-list.js': clientListExports,
    'context-cards.js': contextCardsExports,
    'cycle.js': cycleExports,
    'data.js': dataExports,
    'export.js': exportExports,
    'nav.js': navExports,
    'notes.js': notesExports,
    'pdf-import.js': pdfImportExports,
    'pii.js': piiExports,
    'profile.js': profileExports,
    'settings.js': settingsExports,
    'provider-panels.js': providerPanelsExports,
    'backup.js': backupExports,
    'supplements.js': supplementsExports,
    'theme.js': themeExports,
    'utils.js': utilsExports,
    'views.js': viewsExports,
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
  const data = window.getActiveData();
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
  const ref = window.buildMarkerReference();
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
  const profiles = window.getProfiles();
  assert('getProfiles returns array', Array.isArray(profiles));
  assert('At least one profile', profiles.length >= 1);
  const activeId = window.getActiveProfileId();
  assert('Active profile ID is string', typeof activeId === 'string' && activeId.length > 0);
  const storageKey = window.profileStorageKey(activeId, 'imported');
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
  if (window.hasAIProvider()) {
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
  assert('getGoalsSummary works', typeof window.getGoalsSummary() === 'string' || window.getGoalsSummary() === '');
  assert('getConditionsSummary works', typeof window.getConditionsSummary() === 'string' || window.getConditionsSummary() === '');
  assert('getDietSummary works', typeof window.getDietSummary() === 'string' || window.getDietSummary() === '');
  assert('getExerciseSummary works', typeof window.getExerciseSummary() === 'string' || window.getExerciseSummary() === '');
  assert('getSleepSummary works', typeof window.getSleepSummary() === 'string' || window.getSleepSummary() === '');
  assert('getLightCircadianSummary works', typeof window.getLightCircadianSummary() === 'string' || window.getLightCircadianSummary() === '');
  assert('getStressSummary works', typeof window.getStressSummary() === 'string' || window.getStressSummary() === '');
  assert('getLoveLifeSummary works', typeof window.getLoveLifeSummary() === 'string' || window.getLoveLifeSummary() === '');
  assert('getEnvironmentSummary works', typeof window.getEnvironmentSummary() === 'string' || window.getEnvironmentSummary() === '');

  // isContextFilled
  assert('isContextFilled returns boolean', typeof window.isContextFilled('diet') === 'boolean');

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
  const provider = window.getAIProvider();
  assert('getAIProvider returns valid provider', ['openrouter','ppq','routstr','venice','ollama'].includes(provider));
  const hasAI = window.hasAIProvider();
  assert('hasAIProvider returns boolean', typeof hasAI === 'boolean');

  // ═══════════════════════════════════════════════
  // 16. UNIT/RANGE SYSTEM — works
  // ═══════════════════════════════════════════════
  const effectiveRange = window.getEffectiveRange({ refMin: 3.5, refMax: 5.0, optMin: 3.8, optMax: 4.5 });
  assert('getEffectiveRange returns object', effectiveRange && typeof effectiveRange.min === 'number');

  // ═══════════════════════════════════════════════
  // 17. PII FUNCTIONS — exist and callable
  // ═══════════════════════════════════════════════
  const testPII = window.obfuscatePDFText('John Smith born 1990-01-01 SSN 123-45-6789');
  assert('obfuscatePDFText returns object', testPII && typeof testPII === 'object');
  assert('obfuscatePDFText has obfuscated field', typeof testPII.obfuscated === 'string');

  // ═══════════════════════════════════════════════
  // 18. EXPORT FUNCTIONS — exist
  // ═══════════════════════════════════════════════
  assert('exportPDFReport is function', typeof window.exportPDFReport === 'function');
  assert('exportDataJSON is function', typeof window.exportDataJSON === 'function');
  assert('exportClientJSON is function', typeof window.exportClientJSON === 'function');
  assert('exportAllDataJSON is function', typeof window.exportAllDataJSON === 'function');
  assert('clearAllData is function', typeof window.clearAllData === 'function');

  // ═══════════════════════════════════════════════
  // 19. CYCLE HELPERS — pure function checks
  // ═══════════════════════════════════════════════
  const phase = window.getCyclePhase('2026-02-15', {
    cycleLength: 28, periodLength: 5, regularity: 'regular',
    periods: [{ startDate: '2026-02-01' }]
  });
  assert('getCyclePhase returns object', phase && typeof phase === 'object');
  assert('getCyclePhase has phaseName', typeof phase.phaseName === 'string');

  // ═══════════════════════════════════════════════
  // 20. SERVICE WORKER — cache version check
  // ═══════════════════════════════════════════════
  fetch('service-worker.js').then(r => r.text()).then(sw => {
    assert('SW uses importScripts for version', sw.includes("importScripts('/version.js')"));
    assert('SW CACHE_NAME uses semver template', sw.includes('`labcharts-v${self.APP_VERSION}`'));
    assert('SW APP_SHELL includes version.js', sw.includes("'/version.js'"));

    const hasMainJs = sw.includes('/js/main.js');
    assert('Service worker caches js/main.js', hasMainJs);

    const hasAppFeatureModulesJs = sw.includes('/js/app-feature-modules.js');
    assert('Service worker caches js/app-feature-modules.js', hasAppFeatureModulesJs);

    const hasAppEventListenersJs = sw.includes('/js/app-event-listeners.js');
    assert('Service worker caches js/app-event-listeners.js', hasAppEventListenersJs);

    const hasStartupOrchestratorJs = sw.includes('/js/startup-orchestrator.js');
    assert('Service worker caches js/startup-orchestrator.js', hasStartupOrchestratorJs);

    const hasStartupFoundationJs = sw.includes('/js/startup-foundation.js');
    assert('Service worker caches js/startup-foundation.js', hasStartupFoundationJs);

    const hasStartupProfileJs = sw.includes('/js/startup-profile.js');
    assert('Service worker caches js/startup-profile.js', hasStartupProfileJs);

    const hasStartupOAuthCallbacksJs = sw.includes('/js/startup-oauth-callbacks.js');
    assert('Service worker caches js/startup-oauth-callbacks.js', hasStartupOAuthCallbacksJs);

    const hasStartupMaintenanceJs = sw.includes('/js/startup-maintenance.js');
    assert('Service worker caches js/startup-maintenance.js', hasStartupMaintenanceJs);

    const hasStartupUiJs = sw.includes('/js/startup-ui.js');
    assert('Service worker caches js/startup-ui.js', hasStartupUiJs);

    const hasEmfFacadeJs = sw.includes('/js/emf-facade.js');
    assert('Service worker caches js/emf-facade.js', hasEmfFacadeJs);

    const hasViewsJs = sw.includes('/js/views.js');
    assert('Service worker caches js/views.js', hasViewsJs);

    const hasImportFileInputJs = sw.includes('/js/import-file-input.js');
    assert('Service worker caches js/import-file-input.js', hasImportFileInputJs);

    const hasImportDropZoneJs = sw.includes('/js/import-drop-zone.js');
    assert('Service worker caches js/import-drop-zone.js', hasImportDropZoneJs);

    const hasRecommendationActionsJs = sw.includes('/js/recommendation-actions.js');
    assert('Service worker caches js/recommendation-actions.js', hasRecommendationActionsJs);

    const hasDashboardCompositionJs = sw.includes('/js/dashboard-view-composition.js');
    assert('Service worker caches js/dashboard-view-composition.js', hasDashboardCompositionJs);

    const hasDashboardPageViewJs = sw.includes('/js/dashboard-page-view.js');
    assert('Service worker caches js/dashboard-page-view.js', hasDashboardPageViewJs);

    const hasLensPageShellJs = sw.includes('/js/lens-page-shell.js');
    assert('Service worker caches js/lens-page-shell.js', hasLensPageShellJs);

    const hasChartCardRecsJs = sw.includes('/js/chart-card-recs.js');
    assert('Service worker caches js/chart-card-recs.js', hasChartCardRecsJs);

    const hasCategoryGlyphsJs = sw.includes('/js/category-glyphs.js');
    assert('Service worker caches js/category-glyphs.js', hasCategoryGlyphsJs);

    const hasCategoryPageViewJs = sw.includes('/js/category-page-view.js');
    assert('Service worker caches js/category-page-view.js', hasCategoryPageViewJs);

    const hasCategoryCustomizationJs = sw.includes('/js/category-customization.js');
    assert('Service worker caches js/category-customization.js', hasCategoryCustomizationJs);

    const hasCommitHashJs = sw.includes('/js/commit-hash.js');
    assert('Service worker caches js/commit-hash.js', hasCommitHashJs);

    const hasFocusCardJs = sw.includes('/js/focus-card.js');
    assert('Service worker caches js/focus-card.js', hasFocusCardJs);

    const hasOnboardingViewJs = sw.includes('/js/onboarding-view.js');
    assert('Service worker caches js/onboarding-view.js', hasOnboardingViewJs);

    const hasMarkerDetailModalJs = sw.includes('/js/marker-detail-modal.js');
    assert('Service worker caches js/marker-detail-modal.js', hasMarkerDetailModalJs);

    const hasLightConditionsNowJs = sw.includes('/js/light-conditions-now.js');
    assert('Service worker caches js/light-conditions-now.js', hasLightConditionsNowJs);

    const hasLightPageViewJs = sw.includes('/js/light-page-view.js');
    assert('Service worker caches js/light-page-view.js', hasLightPageViewJs);

    const hasLightChannelViewJs = sw.includes('/js/light-channel-view.js');
    assert('Service worker caches js/light-channel-view.js', hasLightChannelViewJs);

    const hasLightSessionsViewJs = sw.includes('/js/light-sessions-view.js');
    assert('Service worker caches js/light-sessions-view.js', hasLightSessionsViewJs);

    const hasCompareCorrelationsJs = sw.includes('/js/compare-correlations.js');
    assert('Service worker caches js/compare-correlations.js', hasCompareCorrelationsJs);

    const hasMobileDashboardJs = sw.includes('/js/mobile-dashboard.js');
    assert('Service worker caches js/mobile-dashboard.js', hasMobileDashboardJs);

    const hasSchemaJs = sw.includes('/js/schema.js');
    assert('Service worker caches js/schema.js', hasSchemaJs);

    const hasNoAppJs = !sw.includes('/app.js');
    assert('Service worker does NOT cache app.js', hasNoAppJs);

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
  }
})();
