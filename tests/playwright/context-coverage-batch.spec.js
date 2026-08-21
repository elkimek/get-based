import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?contextCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

test('context editor select option helper toggles active buttons', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ editorUrl }) => {
    const [editor, contextRuntime] = await Promise.all([
      import(editorUrl),
      import('/js/context-cards-runtime.js'),
    ]);
    const editorSrc = await fetch(editorUrl).then(response => response.text());
    const outcomes = {};
    const host = document.createElement('div');
    const calls = [];
    const previousContextRuntime = contextRuntime.configureContextCardsRuntimeCallbacks({
      closeModal: () => calls.push(['close']),
    });

    try {
      document.body.appendChild(host);
      host.innerHTML = editor.renderSelectField('Severity', 'ctx-select-coverage', [
        { value: 'major', label: 'Major impact' },
        { value: 'mild', label: 'Mild impact' },
        { value: 'minor', label: 'Minor impact' },
      ], 'major');
      const buttons = Array.from(host.querySelectorAll('#ctx-select-coverage .ctx-btn-option'));

      outcomes.initialSelectionComesFromRenderedField =
        buttons.length === 3
        && editor.getSelectedOption('ctx-select-coverage') === 'major'
        && buttons[0].classList.contains('active')
        && buttons[0].textContent === 'Major impact'
        && buttons[0].dataset.contextValue === 'major'
        && buttons[0].getAttribute('aria-pressed') === 'true';

      outcomes.renderSelectFieldUsesDelegatedActions =
        !host.querySelector('[onclick]')
        && buttons.every(button => button.dataset.ctxEditorAction === 'select-option');

      buttons[1]?.click();
      outcomes.selectCtxOptionMovesActiveState =
        editor.getSelectedOption('ctx-select-coverage') === 'mild'
        && !buttons[0].classList.contains('active')
        && buttons[1].classList.contains('active')
        && !buttons[2].classList.contains('active')
        && buttons[0].getAttribute('aria-pressed') === 'false'
        && buttons[1].getAttribute('aria-pressed') === 'true';

      buttons[1]?.click();
      outcomes.selectCtxOptionTogglesActiveButtonOff =
        editor.getSelectedOption('ctx-select-coverage') === null
        && buttons.every(button => !button.classList.contains('active'))
        && buttons.every(button => button.getAttribute('aria-pressed') === 'false');

      buttons[2].classList.add('active');
      editor.selectCtxOption(buttons[2], 'missing-select-group');
      outcomes.selectCtxOptionMissingGroupNoops =
        editor.getSelectedOption('missing-select-group') === null
        && buttons[2].classList.contains('active');

      host.innerHTML = editor.renderTagsField('Sources', 'ctx-tags-coverage', [
        { value: 'work', label: 'Práce' },
        { value: 'family', label: 'Rodina' },
      ], ['work']);
      const tags = Array.from(host.querySelectorAll('#ctx-tags-coverage .ctx-tag'));
      tags[1]?.click();
      outcomes.translatedTagLabelsKeepCanonicalStoredValues =
        tags[0]?.textContent === 'Práce'
        && tags[0]?.dataset.contextValue === 'work'
        && tags[0]?.getAttribute('aria-pressed') === 'true'
        && tags[1]?.getAttribute('aria-pressed') === 'true'
        && editor.getSelectedTags('ctx-tags-coverage').join(',') === 'work,family';

      host.innerHTML = editor.renderContextEditorSection(
        'More details',
        'Optional fields',
        '<input id="inside-context-section">',
      );
      outcomes.optionalEditorSectionUsesNativeDisclosure =
        host.querySelector('details.ctx-editor-section')?.open === false
        && host.querySelector('summary')?.textContent.includes('More details')
        && !!host.querySelector('#inside-context-section');

      host.innerHTML = editor.renderNoteField('First line\nSecond line');
      const noteField = host.querySelector('#ctx-note-input');
      outcomes.contextNotesUseExpandableTextareas =
        noteField?.tagName === 'TEXTAREA'
        && noteField.value === 'First line\nSecond line'
        && noteField.getAttribute('rows') === '2';

      editor.renderContextEditorModal(
        host,
        'Runtime actions',
        '',
        editor.contextEditorActions(
          true,
          'data-test-context-action="save"',
          'data-test-context-action="clear"',
        ),
      );
      outcomes.contextEditorUsesOwnedActionAttrsWithoutDynamicFunctionNames =
        host.querySelector('[data-test-context-action="save"]')?.textContent === 'Save'
        && host.querySelector('[data-test-context-action="clear"]')?.textContent === 'Clear'
        && !host.querySelector('[data-ctx-editor-fn]')
        && !editorSrc.includes('getViewRuntimeFunction')
        && !editorSrc.includes('ctxEditorFn')
        && !/\bwindow(?:\.|\s*\[)/.test(editorSrc);
      host.querySelector('.modal-close')?.click();
      outcomes.contextEditorCloseUsesContextCardsRuntime = calls.some(call => call[0] === 'close');
    } finally {
      contextRuntime.configureContextCardsRuntimeCallbacks(previousContextRuntime);
      host.remove();
    }

    return outcomes;
  }, { editorUrl: moduleUrl('/js/context-card-editor-ui.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('category customization covers rename icon and emoji picker browser paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ categoryUrl }) => {
    const [{ state }, category, categoryRuntime] = await Promise.all([
      import('/js/state.js'),
      import(categoryUrl),
      import('/js/category-customization-runtime.js'),
    ]);
    const categorySrc = await fetch(categoryUrl).then(response => response.text());
    const categoryRuntimeSrc = await fetch('/js/category-customization-runtime.js').then(response => response.text());
    const outcomes = {};
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const saved = {
      importedData: clone(state.importedData),
      currentView: state.currentView,
    };
    const calls = [];
    let promptValue = null;
    const navigate = (route, data) => calls.push(['navigate', route, !!data?.categories?.lipids]);
    const previousCategoryRuntimeDeps = categoryRuntime.configureCategoryCustomizationRuntimeDeps({
      buildSidebar: data => calls.push(['fallbackSidebar', !!data?.categories?.lipids]),
      navigate,
      showPromptDialog: async () => promptValue,
    });

    try {
      const demo = await fetch('data/demo-male.json').then(r => r.json());
      state.importedData = demo;
      state.importedData.categoryLabels = {};
      state.importedData.markerLabels = { 'lipids.apoB': 'Old ApoB' };
      state.importedData.categoryIcons = { lipids: 'L' };
      state.importedData.customMarkers = {
        'lipids.contextCustom': {
          name: 'Context Custom',
          categoryLabel: 'Lipids',
          icon: 'L',
          unit: 'mg/dL',
          refMin: 1,
          refMax: 2,
        },
      };
      state.currentView = 'dashboard';

      promptValue = '  Fallback Lipids  ';
      await category.renameCategory('lipids');
      outcomes.renameCategoryKeepsSidebarFallback = state.importedData.categoryLabels?.lipids === 'Fallback Lipids'
        && calls.some(call => call[0] === 'fallbackSidebar' && call[1] === true);

      category.configureCategoryCustomization({
        buildSidebar: data => calls.push(['sidebar', !!data?.categories?.lipids]),
        navigate,
      });

      promptValue = '  Better Lipids  ';
      await category.renameCategory('lipids');
      outcomes.renameCategoryStoresTrimmedLabel = state.importedData.categoryLabels?.lipids === 'Better Lipids';
      outcomes.renameCategoryUpdatesCustomMarkerLabel = state.importedData.customMarkers['lipids.contextCustom']?.categoryLabel === 'Better Lipids';
      outcomes.renameCategoryRefreshesSidebarThroughConfiguredCallback = calls.some(call => call[0] === 'sidebar' && call[1] === true);
      outcomes.renameCategoryRefreshesForcedRoute = calls.some(call => call[0] === 'navigate' && call[1] === 'lipids' && call[2] === true);
      outcomes.categoryCustomizationDoesNotUseWindowBuildSidebar = categorySrc.includes('buildSidebar?:')
        && categorySrc.includes("from './category-customization-runtime.js'")
        && categorySrc.includes('showCategoryCustomizationPrompt')
        && categorySrc.includes('getCategoryCustomizationViewportSize')
        && categorySrc.includes('getFallbackBuildSidebar')
        && categorySrc.includes('buildSidebar?.(data)')
        && !categoryRuntimeSrc.includes('getViewRuntimeFunction')
        && !/\bwindow(?:\.|\s*\[)/.test(categorySrc);
      outcomes.renameMissingCategoryNoops = await category.renameCategory('missing-category') === undefined;

      promptValue = '  ApoB Better Name  ';
      await category.renameMarker('lipids_apoB');
      outcomes.renameMarkerStoresDotKeyLabel = state.importedData.markerLabels?.['lipids.apoB'] === 'ApoB Better Name';
      category.revertMarkerName('lipids_apoB');
      outcomes.revertMarkerNameDeletesOverride = !state.importedData.markerLabels?.['lipids.apoB'];
      category.revertMarkerName('lipids_missing');
      outcomes.revertMissingMarkerNoops = !state.importedData.markerLabels?.['lipids.missing'];

      const anchor = document.createElement('button');
      anchor.id = 'emoji-anchor';
      anchor.getBoundingClientRect = () => ({ left: 12, right: 42, top: 20, bottom: 52, width: 30, height: 32, x: 12, y: 20, toJSON: () => ({}) });
      document.body.appendChild(anchor);
      let pickedValue = 'unset';
      category.showEmojiPicker(anchor, value => { pickedValue = value; }, { showReset: true });
      await delay(80);
      const picker = document.querySelector('.emoji-picker');
      const resetButton = picker?.querySelector('[data-cat="__reset"]');
      const bodyButton = picker?.querySelector('[data-cat="body"]');
      outcomes.emojiPickerRendersSearchResetAndCategories = !!picker
        && !!picker.querySelector('input')
        && !!resetButton
        && !!bodyButton
        && picker.querySelectorAll('.emoji-picker-grid span[data-emoji]').length > 0;
      bodyButton?.click();
      await delay(0);
      outcomes.emojiPickerFiltersByCategory = document.querySelector('.emoji-picker [data-cat="body"]')?.classList.contains('active') === true;
      const search = document.querySelector('.emoji-picker input');
      search.value = 'not-a-real-category';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await delay(0);
      outcomes.emojiPickerShowsEmptySearch = document.querySelector('.emoji-picker')?.textContent.includes('No results') === true;
      document.querySelector('.emoji-picker [data-cat="__reset"]')?.click();
      outcomes.emojiPickerResetReturnsNullAndCloses = pickedValue === null && !document.querySelector('.emoji-picker');

      category.showEmojiPicker(anchor, value => { pickedValue = value; });
      await delay(80);
      const emoji = document.querySelector('.emoji-picker .emoji-picker-grid span[data-emoji]');
      const expectedEmoji = emoji?.dataset.emoji;
      emoji?.click();
      outcomes.emojiPickerReturnsClickedEmoji = !!expectedEmoji && pickedValue === expectedEmoji && !document.querySelector('.emoji-picker');

      const header = document.createElement('div');
      header.className = 'category-header';
      header.innerHTML = '<h2><span>Category icon anchor</span></h2>';
      document.body.appendChild(header);
      category.changeCategoryIcon('lipids');
      await delay(80);
      document.querySelector('.emoji-picker [data-cat="__reset"]')?.click();
      outcomes.changeCategoryIconResetClearsOverride = !('lipids' in (state.importedData.categoryIcons || {}))
        && !('icon' in state.importedData.customMarkers['lipids.contextCustom']);
      category.changeCategoryIcon('lipids');
      await delay(80);
      const iconPick = document.querySelector('.emoji-picker .emoji-picker-grid span[data-emoji]');
      const expectedIcon = iconPick?.dataset.emoji;
      iconPick?.click();
      outcomes.changeCategoryIconStoresOverride = !!expectedIcon
        && state.importedData.categoryIcons?.lipids === expectedIcon
        && state.importedData.customMarkers['lipids.contextCustom']?.icon === expectedIcon;
      outcomes.changeCategoryIconMissingNoops = category.changeCategoryIcon('missing-category') === undefined;

      anchor.remove();
      header.remove();
    } finally {
      state.importedData = saved.importedData;
      state.currentView = saved.currentView;
      categoryRuntime.configureCategoryCustomizationRuntimeDeps(previousCategoryRuntimeDeps);
      category.configureCategoryCustomization({
        buildSidebar: previousCategoryRuntimeDeps.buildSidebar || (() => {}),
        navigate: previousCategoryRuntimeDeps.navigate || (() => {}),
      });
      document.querySelector('.emoji-picker')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      document.getElementById('emoji-anchor')?.remove();
    }

    return outcomes;
  }, { categoryUrl: moduleUrl('/js/category-customization.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('lifestyle context editors cover save clear health goals lens and contaminant modals', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ lifestyleUrl }) => {
    const [{ state }, lifestyle, lifestyleRuntime] = await Promise.all([
      import('/js/state.js'),
      import(lifestyleUrl),
      import('/js/context-card-lifestyle-runtime.js'),
    ]);
    const outcomes = {};
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const overlay = document.getElementById('modal-overlay') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'modal-overlay' }));
    const modal = document.getElementById('detail-modal') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'detail-modal' }));
    const saved = {
      importedData: clone(state.importedData),
      profileSex: state.profileSex,
      unitSystem: state.unitSystem,
    };
    const calls = [];
    const previousLifestyleRuntimeDeps = lifestyleRuntime.configureContextCardLifestyleRuntimeDeps({
      closeModal: () => { calls.push(['close']); overlay.classList.remove('show'); },
      navigate: route => calls.push(['navigate', route]),
      openChatPanel: () => calls.push(['chat']),
      useChatPrompt: prompt => calls.push(['prompt', prompt]),
    });
    const controlOutcomeName = (kind, id, index) =>
      `${kind}_${id}_${index}_renders`.replace(/[^a-zA-Z0-9_]/g, '_');
    const setOption = (id, index = 0) => {
      const btn = document.querySelectorAll(`#${id} .ctx-btn-option`)[index];
      const label = btn?.textContent?.trim() || '';
      outcomes[controlOutcomeName('option', id, index)] = !!btn && !!label;
      btn?.click();
      return btn?.dataset.contextValue || label;
    };
    const setTag = (id, index = 0) => {
      const btn = document.querySelectorAll(`#${id} .ctx-tag`)[index];
      const label = btn?.textContent?.trim() || '';
      outcomes[controlOutcomeName('tag', id, index)] = !!btn && !!label;
      btn?.click();
      return btn?.dataset.contextValue || label;
    };

    try {
      state.profileSex = 'male';
      state.unitSystem = 'EU';
      state.importedData = {
        entries: [],
        notes: [],
        diet: null,
        exercise: null,
        sleepRest: null,
        lightCircadian: null,
        stress: null,
        loveLife: null,
        environment: null,
        healthGoals: [],
        interpretiveLens: '',
        emfAssessment: { assessments: [] },
      };
      await lifestyle.openExerciseEditor();
      const defaultExerciseFrequency = setOption('exercise-freq');
      const defaultExerciseSave = modal.querySelector('[data-lifestyle-action="save-exercise"]');
      defaultExerciseSave?.click();
      outcomes.defaultSaveContextAndRefreshStoresAndNotifies = state.importedData.exercise?.frequency === defaultExerciseFrequency
        && Array.from(document.querySelectorAll('.notification-toast')).some(el => el.textContent.includes('Exercise saved'))
        && !!defaultExerciseSave;
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      state.importedData.exercise = null;

      state.importedData.healthGoals = [{ text: 'Initial sync goal', severity: 'major' }];
      await lifestyle.openHealthGoalsEditor();
      outcomes.healthGoalsModalStartsWithInitialSyncGoal = modal.textContent.includes('Initial sync goal');
      outcomes.healthGoalsModalUsesDelegatedActions = !modal.querySelector('[onclick], [onkeydown]');
      state.importedData.healthGoals = [{ text: 'Synced goal from sync', severity: 'minor' }];
      window.dispatchEvent(new CustomEvent('labcharts-sync-applied'));
      await delay(0);
      outcomes.healthGoalsModalRefreshesOnSync = modal.textContent.includes('Synced goal from sync')
        && !modal.textContent.includes('Initial sync goal');
      state.importedData.healthGoals = [
        { text: 'Low priority goal', severity: 'minor' },
        { text: 'High priority goal', severity: 'major' },
        { text: 'Medium priority goal', severity: 'mild' },
      ];
      lifestyle.renderHealthGoalsModal(modal);
      outcomes.healthGoalsSortHighToLowWithoutMutatingStorage =
        Array.from(modal.querySelectorAll('.goals-text')).map(el => el.textContent).join(',') === 'High priority goal,Medium priority goal,Low priority goal'
        && state.importedData.healthGoals.map(goal => goal.text).join(',') === 'Low priority goal,High priority goal,Medium priority goal';
      state.importedData.healthGoals = [];

      lifestyle.configureLifestyleContextEditors({
        recordChange: field => calls.push(['record', field]),
        saveAndRefresh: (msg, field) => calls.push(['save', msg, field || '']),
      });

      await lifestyle.openDietEditor();
      const dietType = setOption('diet-type');
      const dietPattern = setOption('diet-pattern', 1);
      const dietProtein = setOption('diet-protein', 2);
      const dietHydration = setOption('diet-hydration', 1);
      const dietRestriction = setTag('diet-restrictions');
      const dietAlcohol = setOption('diet-alcohol', 1);
      const dietRecentChange = setTag('diet-recent-changes');
      outcomes.dietUsesInterpretableProteinAndUnitAwareFluidRanges = dietProtein.includes('g/kg/day')
        && dietHydration.includes('L/day')
        && modal.querySelector('#diet-protein')?.textContent.includes('g/kg/day')
        && modal.querySelector('#diet-hydration')?.textContent.includes('L/day');
      document.getElementById('diet-breakfast').value = 'strawberries and yogurt';
      document.getElementById('diet-lunch').value = 'canned tuna with avocado';
      document.getElementById('ctx-note-input').value = 'track digestion';
      const dietSave = modal.querySelector('[data-lifestyle-action="save-diet"]');
      dietSave?.click();
      outcomes.saveDietStoresSelectionsMealsAndNote = state.importedData.diet?.type === dietType
        && state.importedData.diet?.pattern === dietPattern
        && state.importedData.diet?.proteinIntake === dietProtein
        && state.importedData.diet?.hydration === dietHydration
        && state.importedData.diet?.restrictions?.includes(dietRestriction)
        && state.importedData.diet?.alcohol === dietAlcohol
        && state.importedData.diet?.recentChanges?.includes(dietRecentChange)
        && state.importedData.diet?.breakfast === 'strawberries and yogurt'
        && state.importedData.diet?.lunch === 'canned tuna with avocado'
        && state.importedData.diet?.note === 'track digestion'
        && !!dietSave;
      state.unitSystem = 'US';
      await lifestyle.openDietEditor();
      outcomes.dietFluidRangeUsesUSDisplayWithoutChangingStoredCanonicalValue = modal.querySelector('#diet-hydration')?.textContent.includes('fl oz/day') === true
        && modal.querySelector('#diet-hydration .ctx-btn-option.active')?.dataset.contextValue === dietHydration
        && state.importedData.diet?.hydration === dietHydration;
      state.unitSystem = 'EU';
      const contaminantBadge = lifestyle.renderDietContaminantsBadge();
      outcomes.dietContaminantsBadgeCountsFlaggedSignals = contaminantBadge.includes('food contaminant signal')
        && contaminantBadge.includes('detected');
      outcomes.dietContaminantsBadgeUsesDelegatedActions = contaminantBadge.includes('data-lifestyle-action="show-diet-contaminants"')
        && !contaminantBadge.includes('onclick=')
        && !contaminantBadge.includes('onkeydown=');
      lifestyle.showDietContaminantsModal();
      outcomes.dietContaminantsModalGroupsWarnings = modal.textContent.includes('Pesticide Residues')
        && modal.textContent.includes('Plastic Chemicals')
        && modal.textContent.includes('Low Contamination');
      outcomes.dietContaminantsModalUsesDelegatedActions = !modal.querySelector('[onclick]');
      modal.querySelector('.contaminant-actions .import-btn-primary')?.click();
      await delay(350);
      outcomes.dietContaminantsDiscussesWithAI = calls.some(call => call[0] === 'chat')
        && calls.some(call => call[0] === 'prompt' && call[1].includes('food contaminants'));
      await lifestyle.openDietEditor();
      const dietClear = modal.querySelector('[data-lifestyle-action="clear-diet"]');
      dietClear?.click();
      await delay(0);
      outcomes.clearDietRequiresConfirmation = state.importedData.diet !== null
        && document.getElementById('confirm-dialog-overlay')?.classList.contains('show') === true;
      document.getElementById('confirm-cancel')?.click();
      await delay(0);
      outcomes.cancelClearDietPreservesDiet = state.importedData.diet !== null;
      dietClear?.click();
      await delay(0);
      document.getElementById('confirm-ok')?.click();
      await delay(0);
      outcomes.clearDietNullsDiet = state.importedData.diet === null && !!dietClear;

      state.importedData.sleepRest = { duration: '7-8h', quality: 'excellent', issues: [] };
      state.importedData.wearableSummary = {
        metrics: {
          sleep_total_min: { rolling: { d7: 315 } },
          sleep_score: { rolling: { d7: 61 } },
        },
      };
      await lifestyle.openSleepRestEditor();
      outcomes.sleepEditorFlagsStrongProfileTrackedMismatch = modal.querySelector('.ctx-data-mismatch')?.textContent.includes('Profile and tracked sleep differ') === true
        && modal.querySelector('.ctx-data-mismatch')?.textContent.includes('5.3h') === true
        && modal.querySelector('.ctx-data-mismatch')?.textContent.includes('61/100') === true;
      const sleepDuration = setOption('sleep-duration');
      const sleepIssue = setTag('sleep-issues');
      const daytimeSleepiness = setOption('sleep-daytime', 2);
      const apneaStatus = setOption('sleep-apnea-status', 2);
      const papUse = setOption('sleep-pap-use', 1);
      document.getElementById('ctx-note-input').value = 'cool room';
      lifestyle.saveSleepRest();
      outcomes.saveSleepRestStoresSelections = state.importedData.sleepRest?.duration === sleepDuration
        && state.importedData.sleepRest?.issues?.includes(sleepIssue)
        && state.importedData.sleepRest?.daytimeSleepiness === daytimeSleepiness
        && state.importedData.sleepRest?.apneaStatus === apneaStatus
        && state.importedData.sleepRest?.papUse === papUse
        && state.importedData.sleepRest?.note === 'cool room';
      lifestyle.clearSleepRest();
      outcomes.clearSleepRestNullsSleep = state.importedData.sleepRest === null;
      delete state.importedData.wearableSummary;

      state.importedData.sunDefaults = { fitzpatrick: 'III', homeLight: 'led-warm', eyewear: 'sunglasses', ottScore: 4 };
      state.importedData.lightCircadian = { skinType: 'III' };
      await lifestyle.openLightCircadianEditor();
      outcomes.lightCircadianMirrorRendersSetup = modal.textContent.includes('Mostly LED — warm white')
        && modal.textContent.includes('Sunglasses outdoors')
        && modal.textContent.includes('several patterns to explore');
      const amLight = setOption('light-am');
      const evening = setTag('light-evening');
      const tech = setTag('light-tech');
      lifestyle.saveLightCircadian();
      outcomes.saveLightCircadianPreservesSkinAndStoresTags = state.importedData.lightCircadian?.skinType === 'III'
        && state.importedData.lightCircadian?.amLight === amLight
        && state.importedData.lightCircadian?.evening?.includes(evening)
        && state.importedData.lightCircadian?.techEnv?.includes(tech);
      lifestyle.clearLightCircadian();
      outcomes.clearLightCircadianNullsValue = state.importedData.lightCircadian === null;

      await lifestyle.openExerciseEditor();
      outcomes.exerciseTypesIncludeFocusedRehabAndBroaderMovementOptions = modal.querySelector('#exercise-types')?.textContent.includes('physiotherapy / rehab') === true
        && modal.querySelector('#exercise-types')?.textContent.includes('Pilates') === true
        && modal.querySelector('#exercise-types')?.textContent.includes('team / racket sports') === true;
      const exerciseFrequency = setOption('exercise-freq');
      const exerciseType = setTag('exercise-types');
      const exerciseDuration = setOption('exercise-duration', 1);
      const exerciseMuscle = setOption('exercise-muscle', 2);
      const exerciseLimitation = setTag('exercise-limitations');
      lifestyle.saveExercise();
      outcomes.saveExerciseStoresFrequencyAndType = state.importedData.exercise?.frequency === exerciseFrequency
        && state.importedData.exercise?.types?.includes(exerciseType)
        && state.importedData.exercise?.duration === exerciseDuration
        && state.importedData.exercise?.muscleContext === exerciseMuscle
        && state.importedData.exercise?.limitations?.includes(exerciseLimitation);
      lifestyle.clearExercise();
      outcomes.clearExerciseNullsExercise = state.importedData.exercise === null;

      await lifestyle.openStressEditor();
      outcomes.stressManagementKeepsFriendlyWording = modal.textContent.includes('Stress management (what helps)');
      const stressLevel = setOption('stress-level');
      const stressDuration = setOption('stress-duration', 2);
      const stressSource = setTag('stress-sources');
      const stressTrend = setOption('stress-trend', 2);
      lifestyle.saveStress();
      outcomes.saveStressStoresLevelAndSource = state.importedData.stress?.level === stressLevel
        && state.importedData.stress?.duration === stressDuration
        && state.importedData.stress?.trend === stressTrend
        && state.importedData.stress?.sources?.includes(stressSource);
      lifestyle.clearStress();
      outcomes.clearStressNullsStress = state.importedData.stress === null;

      await lifestyle.openLoveLifeEditor();
      outcomes.loveLifeFiltersSexSpecificConcern = modal.textContent.includes('erectile issues')
        && !modal.textContent.includes('vaginal dryness');
      const loveStatus = setOption('love-status');
      const libidoChange = setOption('love-libido-change', 2);
      const reproductiveGoal = setTag('love-reproductive-goals');
      const loveConcern = setTag('love-concerns');
      lifestyle.saveLoveLife();
      outcomes.saveLoveLifeStoresStatusAndConcern = state.importedData.loveLife?.status === loveStatus
        && state.importedData.loveLife?.libidoChange === libidoChange
        && state.importedData.loveLife?.reproductiveGoals?.includes(reproductiveGoal)
        && state.importedData.loveLife?.concerns?.includes(loveConcern);
      lifestyle.clearLoveLife();
      outcomes.clearLoveLifeNullsValue = state.importedData.loveLife === null;

      await lifestyle.openEnvironmentEditor();
      outcomes.environmentIncludesGlacierWaterAndAgriculturalAirContext = modal.querySelector('#env-water')?.textContent.includes('glacier water') === true
        && modal.querySelector('#env-air')?.textContent.includes('agricultural area / crop spraying nearby') === true;
      const setting = setOption('env-setting');
      const altitude = setOption('env-altitude', 1);
      const inhaledExposure = setTag('env-inhaled');
      const occupationalExposure = setTag('env-occupational');
      const waterConcern = setTag('env-water-concerns');
      const emfTag = setTag('env-emf');
      lifestyle.saveEnvironment();
      outcomes.saveEnvironmentStoresFallbackEmfFields = state.importedData.environment?.setting === setting
        && state.importedData.environment?.altitude === altitude
        && state.importedData.environment?.inhaledExposures?.includes(inhaledExposure)
        && state.importedData.environment?.occupationalExposures?.includes(occupationalExposure)
        && state.importedData.environment?.waterConcerns?.includes(waterConcern)
        && state.importedData.environment?.emf?.includes(emfTag);
      state.importedData.emfAssessment = { assessments: [{ id: 'emf-one', date: '2026-06-07', rooms: [] }] };
      state.importedData.environment = { emf: ['existing emf'], emfMitigation: ['existing mitigation'] };
      await lifestyle.openEnvironmentEditor();
      outcomes.environmentWithAssessmentUsesLauncherInsteadOfFallbackTags = !!modal.querySelector('.ctx-emf-launcher.has-data')
        && !document.getElementById('env-emf');
      lifestyle.saveEnvironment();
      outcomes.environmentWithAssessmentPreservesExistingEmfFields = state.importedData.environment?.emf?.includes('existing emf')
        && state.importedData.environment?.emfMitigation?.includes('existing mitigation');
      lifestyle.clearEnvironment();
      outcomes.clearEnvironmentNullsValue = state.importedData.environment === null;

      await lifestyle.openHealthGoalsEditor();
      const starter = document.querySelector('[data-lifestyle-action="suggest-health-goal"]');
      starter?.click();
      outcomes.healthGoalStarterPrefillsEditableGoal = document.getElementById('goal-text-input')?.value === starter?.dataset.lifestyleValue;
      const goalPriorityButtons = Array.from(document.querySelectorAll('#goal-severity-select .ctx-btn-option'));
      outcomes.healthGoalPrioritiesUseFriendlyLabelsAndSafeDefault =
        goalPriorityButtons.map(btn => btn.textContent.trim()).join(',') === 'High,Medium,Low'
        && goalPriorityButtons[1]?.classList.contains('active') === true
        && goalPriorityButtons[1]?.dataset.contextValue === 'mild'
        && Boolean(goalPriorityButtons[0]?.compareDocumentPosition(
          document.querySelector('[data-lifestyle-action="add-health-goal"]'),
        ) & Node.DOCUMENT_POSITION_FOLLOWING);
      document.getElementById('goal-text-input').value = 'Improve sleep timing';
      document.querySelectorAll('#goal-severity-select .ctx-btn-option').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('#goal-severity-select .ctx-btn-option')[1]?.click();
      document.querySelector('[data-lifestyle-action="add-health-goal"]')?.click();
      outcomes.addHealthGoalAppendsSeverity = state.importedData.healthGoals?.[0]?.text === 'Improve sleep timing'
        && state.importedData.healthGoals?.[0]?.severity === 'mild';
      document.querySelector('[data-lifestyle-action="delete-health-goal"][data-lifestyle-index="0"]')?.click();
      outcomes.deleteHealthGoalRemovesByIndex = state.importedData.healthGoals?.length === 0;
      document.getElementById('goal-text-input').value = 'Reduce eye strain';
      document.getElementById('goal-text-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      document.querySelector('[data-lifestyle-action="close-health-goals"]')?.click();
      outcomes.closeHealthGoalsClosesAndNavigates = calls.some(call => call[0] === 'close')
        && calls.some(call => call[0] === 'navigate');
      await lifestyle.openHealthGoalsEditor();
      document.querySelector('[data-lifestyle-action="clear-health-goals"]')?.click();
      await delay(0);
      outcomes.clearHealthGoalsRequiresConfirmation = state.importedData.healthGoals.length === 1
        && document.getElementById('confirm-dialog-overlay')?.classList.contains('show') === true;
      document.getElementById('confirm-ok')?.click();
      await delay(0);
      outcomes.clearHealthGoalsEmptiesArray = Array.isArray(state.importedData.healthGoals)
        && state.importedData.healthGoals.length === 0;

      await lifestyle.openInterpretiveLensEditor();
      document.getElementById('interpretive-lens-textarea').value = 'Functional endocrinology';
      document.querySelector('[data-lifestyle-action="save-interpretive-lens"]')?.click();
      outcomes.saveInterpretiveLensStoresTrimmedText = state.importedData.interpretiveLens === 'Functional endocrinology';
      await lifestyle.openInterpretiveLensEditor();
      document.querySelector('[data-lifestyle-action="clear-interpretive-lens"]')?.click();
      outcomes.clearInterpretiveLensBlanksText = state.importedData.interpretiveLens === '';

      await lifestyle.openHealthGoalsEditor();
      document.getElementById('goal-text-input').value = 'Callback coverage goal';
      lifestyle.addHealthGoal();
      outcomes.configureCallbacksWereUsed = calls.some(call => call[0] === 'save' && call[2] === 'sleepRest')
        && calls.some(call => call[0] === 'record' && call[1] === 'healthGoals');
    } finally {
      state.importedData = saved.importedData;
      state.profileSex = saved.profileSex;
      state.unitSystem = saved.unitSystem;
      lifestyleRuntime.configureContextCardLifestyleRuntimeDeps(previousLifestyleRuntimeDeps);
      lifestyle.configureLifestyleContextEditors({ recordChange: () => {}, saveAndRefresh: () => {} });
      overlay.classList.remove('show');
      modal.innerHTML = '';
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      document.getElementById('confirm-dialog-overlay')?.remove();
    }

    return outcomes;
  }, { lifestyleUrl: moduleUrl('/js/context-card-lifestyle-editors.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('context health dots and focus card cover cache fallback and empty states', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ healthUrl, focusUrl }) => {
    const [{ state }, health, focus, summaries, profile, data, labContext, cryptoStore, cloudConsent] = await Promise.all([
      import('/js/state.js'),
      import(healthUrl),
      import(focusUrl),
      import('/js/context-card-summaries.js'),
      import('/js/profile.js'),
      import('/js/data.js'),
      import('/js/lab-context.js'),
      import('/js/crypto.js'),
      import('/js/cloud-ai-consent.js'),
    ]);
    const outcomes = {};
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      activeProfile: localStorage.getItem('labcharts-active-profile'),
      provider: localStorage.getItem('labcharts-ai-provider'),
      paused: localStorage.getItem('labcharts-ai-paused'),
      openRouterKey: localStorage.getItem('labcharts-openrouter-key'),
      openRouterKeyCache: cryptoStore.getCachedKey('labcharts-openrouter-key'),
      openRouterModel: localStorage.getItem('labcharts-openrouter-model'),
      ollamaConfig: localStorage.getItem('labcharts-ollama'),
      ollamaConfigCache: cryptoStore.getCachedKey('labcharts-ollama'),
      ollamaModel: localStorage.getItem('labcharts-ollama-model'),
      cloudAIConsent: localStorage.getItem('labcharts-cloud-ai-consent'),
      fetch: window.fetch,
    };
    const originalHealthDotDeps = health.configureContextCardHealthDots();
    const cacheKeys = [];
    const host = document.createElement('div');

    try {
      state.currentProfile = 'context-coverage-profile';
      state.profileSex = 'female';
      state.profileDob = '1990-06-01';
      state.importedData = {
        entries: [{ date: '2026-06-01', markers: { 'vitamins.vitaminD': 22, 'lipids.apoB': 115 } }],
        healthGoals: [{ text: 'Improve sleep', severity: 'major' }],
        diet: { type: 'omnivore', breakfast: 'eggs' },
        exercise: { frequency: 'daily' },
        sleepRest: { duration: '7-8 hours' },
        lightCircadian: { amLight: 'daily' },
        stress: { level: 'moderate' },
        loveLife: { status: 'partnered' },
        environment: { setting: 'urban' },
        diagnoses: { conditions: [{ name: 'Hashimoto', severity: 'mild' }], note: '', familyHistory: [] },
      };
      data.invalidateActiveDataCache();
      document.body.appendChild(host);
      host.innerHTML = summaries.CONTEXT_CARD_KEYS.map(key => `
        <span id="ctx-dot-${key}" class="ctx-health-dot"></span>
        <span id="ctx-summary-${key}" data-summary-source="local" data-local-summary="${key} local fallback">${key} local fallback</span>
        <span id="ctx-ai-${key}"></span>
      `).join('') + '<div id="focus-card-body"></div>';

      const healthCacheKey = profile.profileStorageKey(state.currentProfile, 'contextHealth');
      cacheKeys.push(healthCacheKey);
      const cachedHealth = { dots: {}, summaries: {}, cardSummaries: {}, fingerprints: {} };
      for (const key of summaries.CONTEXT_CARD_KEYS) {
        cachedHealth.dots[key] = key === 'diet' ? 'yellow' : 'green';
        cachedHealth.summaries[key] = `${key} cached tip`;
        cachedHealth.cardSummaries[key] = `${key} cached profile summary`;
        cachedHealth.fingerprints[key] = health.getCardFingerprint(key);
      }
      localStorage.setItem(healthCacheKey, JSON.stringify(cachedHealth));
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.removeItem('labcharts-ai-paused');
      await health.loadContextHealthDots();
      outcomes.healthDotsUseMatchingCache = document.getElementById('ctx-dot-diet')?.classList.contains('ctx-health-dot-yellow') === true
        && document.getElementById('ctx-summary-diet')?.textContent === 'diet cached profile summary'
        && document.getElementById('ctx-summary-diet')?.dataset.summarySource === 'ai'
        && document.getElementById('ctx-ai-diet')?.textContent.includes('diet cached tip')
        && document.getElementById('ctx-ai-diet')?.classList.contains('ctx-ai-summary-yellow');

      const fixedDemoHealth = {
        fixedDemo: true,
        dots: { diet: 'yellow' },
        summaries: { diet: 'Bundled demo tip' },
        cardSummaries: { diet: 'Bundled demo profile summary' },
        fingerprints: { diet: 'deliberately-stale' },
        sources: { diet: 'demo' },
      };
      localStorage.setItem(healthCacheKey, JSON.stringify(fixedDemoHealth));
      health.configureContextCardHealthDots({ isActiveDemoProfile: () => true });
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      localStorage.setItem('labcharts-openrouter-model', 'openai/gpt-5.4');
      cryptoStore.updateKeyCache('labcharts-openrouter-key', 'demo-cost-guard-key');
      let demoInferenceCalls = 0;
      window.fetch = async url => {
        demoInferenceCalls += 1;
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            diet: { summary: 'Live demo diet summary', dot: 'green', tip: 'Updated from edited context' },
          }) } }],
          usage: { prompt_tokens: 8, completion_tokens: 5 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };
      await health.loadContextHealthDots();
      health.refreshAllHealthDots();
      await delay(0);
      outcomes.paidDemoStaysPrecomputedUntilExplicitConsent = demoInferenceCalls === 0
        && localStorage.getItem(healthCacheKey) === JSON.stringify(fixedDemoHealth)
        && health.getDemoContextAIMode().mode === 'paid-off'
        && document.getElementById('ctx-dot-diet')?.classList.contains('ctx-health-dot-gray') === true
        && document.getElementById('ctx-summary-diet')?.textContent === 'diet local fallback'
        && document.getElementById('ctx-ai-diet')?.textContent.includes('not recalculated');
      localStorage.setItem(cloudConsent.CLOUD_AI_CONSENT_KEY, JSON.stringify({
        version: cloudConsent.CLOUD_AI_CONSENT_VERSION,
        approvals: { openrouter: { accepted: true } },
      }));
      health.enableDemoContextLiveAI();
      await health.loadContextHealthDots();
      const liveDemoCache = JSON.parse(localStorage.getItem(healthCacheKey) || '{}');
      outcomes.paidDemoInfersAfterProviderAndModelSpecificConsent = demoInferenceCalls === 1
        && health.getDemoContextAIMode().mode === 'paid-live'
        && liveDemoCache.sources?.diet === 'ai'
        && liveDemoCache.cardSummaries?.diet === 'Live demo diet summary';
      localStorage.setItem('labcharts-openrouter-model', 'anthropic/claude-sonnet-5');
      outcomes.demoPaidConsentResetsWhenModelChanges = health.getDemoContextAIMode().mode === 'paid-off'
        && localStorage.getItem(profile.profileStorageKey(state.currentProfile, 'demoContextLiveAI')) === null;

      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ollama-model', 'vendor/model-cloud');
      outcomes.cloudTaggedLocalAIModelsStillRequireCostConsent = health.getDemoContextAIMode().mode === 'paid-off'
        && health.getDemoContextAIMode().providerLabel === 'Local AI cloud model';
      localStorage.setItem('labcharts-ollama-model', 'context-test-model');
      state.importedData.diet = { ...state.importedData.diet, breakfast: 'Edited for local AI' };
      await health.loadContextHealthDots();
      outcomes.localDemoAIUpdatesAutomaticallyWithoutPaidConsent = demoInferenceCalls === 2
        && health.getDemoContextAIMode().mode === 'local-live';
      window.fetch = saved.fetch;
      health.configureContextCardHealthDots(originalHealthDotDeps);

      localStorage.removeItem(healthCacheKey);
      state.importedData = { entries: [], healthGoals: [] };
      await health.loadContextHealthDots();
      outcomes.healthDotsGrayWhenNoAssessableData = summaries.CONTEXT_CARD_KEYS.every(key =>
        document.getElementById(`ctx-dot-${key}`)?.classList.contains('ctx-health-dot-gray')
      );

      localStorage.setItem(healthCacheKey, JSON.stringify({ dots: { diet: 'red' }, summaries: {}, fingerprints: {} }));
      localStorage.setItem('labcharts-ai-paused', 'true');
      health.refreshAllHealthDots();
      outcomes.refreshAllHealthDotsRequiresProvider = localStorage.getItem(healthCacheKey) !== null;

      localStorage.removeItem(healthCacheKey);
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.removeItem('labcharts-ai-paused');
      localStorage.setItem('labcharts-ollama-model', 'context-test-model');
      state.importedData = {
        entries: [{ date: '2026-06-01', markers: { 'vitamins.vitaminD': 22, 'lipids.apoB': 115 } }],
        healthGoals: [{ text: 'Improve sleep', severity: 'major' }],
        diagnoses: { conditions: [{ name: 'Hashimoto', severity: 'mild' }] },
        diet: { type: 'omnivore', breakfast: 'eggs' },
        exercise: { frequency: 'daily' },
        sleepRest: { duration: '7-8 hours' },
        lightCircadian: { amLight: 'daily' },
        stress: { level: 'moderate' },
        loveLife: { status: 'partnered' },
        environment: { setting: 'urban' },
      };
      data.invalidateActiveDataCache();
      let aiResponse = JSON.stringify({
        healthGoals: { summary: 'Focused on improving sleep quality and consistency.', dot: 'green', tip: 'goals covered' },
        diet: 'yellow',
        exercise: { summary: 'Exercises daily with a consistent routine.', dot: 'purple', tip: 'invalid color' },
        environment: { summary: Array(40).fill('reported').join(' '), dot: 'yellow', tip: 'environment reviewed' },
      });
      const aiCalls = [];
      cryptoStore.updateKeyCache('labcharts-ollama', JSON.stringify({ url: 'http://ollama.test', model: 'context-test-model', mode: 'ollama', apiKey: '' }));
      health.configureContextCardHealthDots({
        buildLabContext: () => summaries.CONTEXT_CARD_KEYS.map(key => `[section:${key}]\n${key} section\n[/section:${key}]`).join('\n'),
      });
      window.fetch = async (url, options = {}) => {
        const href = typeof url === 'string' ? url : url?.url || '';
        if (href === 'http://ollama.test/v1/chat/completions') {
          const body = JSON.parse(options.body || '{}');
          aiCalls.push({ url: href, body });
          return new Response(JSON.stringify({
            choices: [{ message: { content: aiResponse }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 7, completion_tokens: 5 },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return saved.fetch(url, options);
      };
      const firstHealthLoad = health.loadContextHealthDots();
      const duplicateHealthLoad = health.loadContextHealthDots();
      await Promise.all([firstHealthLoad, duplicateHealthLoad]);
      const parsedHealthCache = JSON.parse(localStorage.getItem(healthCacheKey) || '{}');
      outcomes.concurrentHealthDotHydrationCoalescesToOneInference = firstHealthLoad === duplicateHealthLoad
        && aiCalls.length === 1;
      outcomes.healthDotsCallsLocalCompatibleEndpoint = aiCalls.length === 1
        && aiCalls[0].url === 'http://ollama.test/v1/chat/completions'
        && aiCalls[0].body.model === 'context-test-model'
        && aiCalls[0].body.messages.some(msg => msg.role === 'system' && msg.content.includes('"healthGoals"'))
        && aiCalls[0].body.messages.some(msg => msg.role === 'system' && msg.content.includes('"summary"'))
        && aiCalls[0].body.messages.some(msg => msg.role === 'system' && msg.content.includes('ONLY the person\'s explicitly reported information'))
        && aiCalls[0].body.messages.some(msg => msg.role === 'user' && msg.content.includes('[section:diet]'));
      outcomes.healthDotsCachesParsedObjectAndStringEntries = document.getElementById('ctx-dot-healthGoals')?.classList.contains('ctx-health-dot-green') === true
        && document.getElementById('ctx-summary-healthGoals')?.textContent === 'Focused on improving sleep quality and consistency.'
        && document.getElementById('ctx-summary-healthGoals')?.dataset.summarySource === 'ai'
        && document.getElementById('ctx-ai-healthGoals')?.textContent.includes('goals covered')
        && document.getElementById('ctx-dot-diet')?.classList.contains('ctx-health-dot-yellow') === true
        && document.getElementById('ctx-summary-diet')?.textContent === 'diet local fallback'
        && document.getElementById('ctx-summary-diet')?.dataset.summarySource === 'local'
        && document.getElementById('ctx-dot-exercise')?.classList.contains('ctx-health-dot-gray') === true
        && parsedHealthCache.dots?.healthGoals === 'green'
        && parsedHealthCache.summaries?.healthGoals === 'goals covered'
        && parsedHealthCache.cardSummaries?.healthGoals === 'Focused on improving sleep quality and consistency.'
        && parsedHealthCache.cardSummaries?.diet === ''
        && parsedHealthCache.cardSummaries?.environment?.length <= 160
        && parsedHealthCache.cardSummaries?.environment?.endsWith('\u2026')
        && parsedHealthCache.dots?.diet === 'yellow'
        && typeof parsedHealthCache.fingerprints?.healthGoals === 'string';

      aiResponse = 'not json';
      localStorage.removeItem(healthCacheKey);
      aiCalls.length = 0;
      await health.loadContextHealthDots();
      outcomes.healthDotsGrayAndWritesCacheOnInvalidAIResponse = aiCalls.length === 1
        && document.getElementById('ctx-dot-healthGoals')?.classList.contains('ctx-health-dot-gray') === true
        && localStorage.getItem(healthCacheKey) !== null;

      window.fetch = saved.fetch;
      health.configureContextCardHealthDots(originalHealthDotDeps);

      const demo = await fetch('data/demo-male.json').then(r => r.json());
      state.importedData = demo;
      state.importedData.healthGoals = [{ text: 'Improve insulin sensitivity', severity: 'major' }];
      state.importedData.contextNotes = 'Prioritize fatigue and training recovery.';
      state.profileSex = 'male';
      state.profileDob = '1988-01-01';
      state.currentProfile = 'context-focus-profile';
      localStorage.setItem('labcharts-active-profile', state.currentProfile);
      labContext.setLabMarkersContextEnabled(true);
      data.invalidateActiveDataCache();
      const focusCacheKey = profile.profileStorageKey(state.currentProfile, 'focusCard');
      cacheKeys.push(focusCacheKey);
      const focusFp = data.getFocusCardFingerprint();
      localStorage.setItem(focusCacheKey, JSON.stringify({ fingerprint: focusFp, text: '**ApoB** is the priority.' }));
      outcomes.renderFocusCardUsesCachedMarkdown = focus.renderFocusCard().includes('<strong>ApoB</strong>');
      outcomes.renderFocusCardUsesDelegatedRefresh =
        focus.renderFocusCard().includes('data-focus-card-action="refresh"')
        && !focus.renderFocusCard().includes('onclick=');
      const focusShell = document.createElement('div');
      focusShell.innerHTML = focus.renderFocusCard();
      const renderedFocusBody = focusShell.querySelector('#focus-card-body');
      outcomes.focusCardBodyParsedFromRenderedCard = !!renderedFocusBody;
      if (renderedFocusBody) document.getElementById('focus-card-body')?.replaceWith(renderedFocusBody);
      await focus.loadFocusCard({ refreshStale: false });
      outcomes.loadFocusCardKeepsFreshCachedText = document.getElementById('focus-card-body')?.textContent.includes('ApoB is the priority') === true;
      labContext.setLabMarkersContextEnabled(false);
      const focusContextOff = focus.buildFocusContext();
      labContext.setLabMarkersContextEnabled(true);
      const focusContext = focus.buildFocusContext();
      outcomes.buildFocusContextIncludesProfileGoalsAndFlags = typeof focusContext === 'string'
        && focusContext.includes('Profile: male')
        && focusContext.includes('Goals: major: Improve insulin sensitivity')
        && focusContext.includes('Flagged');
      outcomes.buildFocusContextRespectsLabSourceToggle = focusContextOff === null
        && typeof focusContext === 'string'
        && focusContext.includes('Flagged');

      localStorage.removeItem(focusCacheKey);
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.removeItem('labcharts-ai-paused');
      localStorage.setItem('labcharts-ollama-model', 'context-test-model');
      const focusAiCalls = [];
      let focusResponseMode = 'success';
      window.fetch = async (url, options = {}) => {
        const href = typeof url === 'string' ? url : url?.url || '';
        if (href === 'http://ollama.test/v1/chat/completions') {
          const body = JSON.parse(options.body || '{}');
          focusAiCalls.push(body);
          if (focusResponseMode === 'failure') {
            return new Response(JSON.stringify({
              error: { message: '<img src=x onerror=alert(1)> model rejected request' },
            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
          }
          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Vitamin D is low."}}]}\n\n'));
              controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" Recheck with ApoB."},"finish_reason":"stop"}],"usage":{"prompt_tokens":9,"completion_tokens":6}}\n\n'));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            },
          });
          return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
        }
        return saved.fetch(url, options);
      };
      document.getElementById('focus-card-body').innerHTML = '';
      await focus.loadFocusCard();
      await delay(30);
      const streamedFocusCache = JSON.parse(localStorage.getItem(focusCacheKey) || '{}');
      outcomes.loadFocusCardStreamsAndCachesLocalAI = focusAiCalls.length === 1
        && focusAiCalls[0].stream === true
        && focusAiCalls[0].max_tokens === 500
        && focusAiCalls[0].reasoning_effort === 'none'
        && document.getElementById('focus-card-body')?.textContent.includes('Vitamin D is low. Recheck with ApoB') === true
        && streamedFocusCache.text === 'Vitamin D is low. Recheck with ApoB.';

      localStorage.removeItem(focusCacheKey);
      focusResponseMode = 'failure';
      document.getElementById('focus-card-body').innerHTML = '';
      await focus.loadFocusCard();
      const failedFocusBody = document.getElementById('focus-card-body');
      outcomes.loadFocusCardSafelySurfacesProviderFailure =
        failedFocusBody?.textContent.includes('model rejected request') === true
        && failedFocusBody.querySelector('img') === null;
      window.fetch = saved.fetch;

      localStorage.removeItem(focusCacheKey);
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      localStorage.removeItem('labcharts-ai-paused');
      localStorage.removeItem('labcharts-openrouter-key');
      cryptoStore.updateKeyCache('labcharts-openrouter-key', '');
      document.getElementById('focus-card-body').innerHTML = '';
      await focus.loadFocusCard();
      outcomes.loadFocusCardShowsEnableAIWithoutConnectedProvider = document.getElementById('focus-card-body')?.textContent.includes('Enable AI') === true;
      localStorage.setItem(focusCacheKey, JSON.stringify({ fingerprint: focusFp, text: 'Temporary focus cache' }));
      document.getElementById('focus-card-body').innerHTML = '<span>Temporary focus cache</span>';
      const focusRefreshBtn = document.createElement('button');
      focusRefreshBtn.setAttribute('data-focus-card-action', 'refresh');
      document.body.appendChild(focusRefreshBtn);
      focusRefreshBtn.click();
      await delay(0);
      outcomes.refreshFocusCardClearsCacheAndReloadsProviderGate = localStorage.getItem(focusCacheKey) === null
        && document.getElementById('focus-card-body')?.textContent.includes('Enable AI') === true;
      focusRefreshBtn.remove();

      state.importedData = { entries: [] };
      data.invalidateActiveDataCache();
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.removeItem('labcharts-ai-paused');
      document.getElementById('focus-card-body').innerHTML = '';
      await focus.loadFocusCard();
      outcomes.loadFocusCardShowsNoInsightWithoutLabs = document.getElementById('focus-card-body')?.textContent.includes('No insight available') === true;
    } finally {
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      state.profileSex = saved.profileSex;
      state.profileDob = saved.profileDob;
      if (saved.provider == null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', saved.provider);
      if (saved.paused == null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', saved.paused);
      if (saved.openRouterKey == null) localStorage.removeItem('labcharts-openrouter-key');
      else localStorage.setItem('labcharts-openrouter-key', saved.openRouterKey);
      cryptoStore.updateKeyCache('labcharts-openrouter-key', saved.openRouterKeyCache);
      if (saved.openRouterModel == null) localStorage.removeItem('labcharts-openrouter-model');
      else localStorage.setItem('labcharts-openrouter-model', saved.openRouterModel);
      if (saved.ollamaConfig == null) localStorage.removeItem('labcharts-ollama');
      else localStorage.setItem('labcharts-ollama', saved.ollamaConfig);
      if (saved.ollamaModel == null) localStorage.removeItem('labcharts-ollama-model');
      else localStorage.setItem('labcharts-ollama-model', saved.ollamaModel);
      if (saved.cloudAIConsent == null) localStorage.removeItem('labcharts-cloud-ai-consent');
      else localStorage.setItem('labcharts-cloud-ai-consent', saved.cloudAIConsent);
      if (saved.activeProfile == null) localStorage.removeItem('labcharts-active-profile');
      else localStorage.setItem('labcharts-active-profile', saved.activeProfile);
      cryptoStore.updateKeyCache('labcharts-ollama', saved.ollamaConfigCache);
      window.fetch = saved.fetch;
      health.configureContextCardHealthDots(originalHealthDotDeps);
      for (const key of cacheKeys) localStorage.removeItem(key);
      host.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      data.invalidateActiveDataCache();
    }

    return outcomes;
  }, {
    healthUrl: moduleUrl('/js/context-card-health-dots.js'),
    focusUrl: moduleUrl('/js/focus-card.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
