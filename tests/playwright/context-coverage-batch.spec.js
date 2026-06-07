import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?contextCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

test('category customization covers rename icon and emoji picker browser paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ categoryUrl }) => {
    const [{ state }, category] = await Promise.all([
      import('/js/state.js'),
      import(categoryUrl),
    ]);
    const outcomes = {};
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const saved = {
      importedData: clone(state.importedData),
      currentView: state.currentView,
      prompt: window.showPromptDialog,
      buildSidebar: window.buildSidebar,
      navigate: window.navigate,
    };
    const calls = [];

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
      window.buildSidebar = data => calls.push(['sidebar', !!data?.categories?.lipids]);
      window.navigate = (route, data) => calls.push(['navigate', route, !!data?.categories?.lipids]);
      category.configureCategoryCustomization({ navigate: window.navigate });

      window.showPromptDialog = async () => '  Better Lipids  ';
      await category.renameCategory('lipids');
      outcomes.renameCategoryStoresTrimmedLabel = state.importedData.categoryLabels?.lipids === 'Better Lipids';
      outcomes.renameCategoryUpdatesCustomMarkerLabel = state.importedData.customMarkers['lipids.contextCustom']?.categoryLabel === 'Better Lipids';
      outcomes.renameCategoryRefreshesForcedRoute = calls.some(call => call[0] === 'navigate' && call[1] === 'lipids' && call[2] === true);
      outcomes.renameMissingCategoryNoops = await category.renameCategory('missing-category') === undefined;

      window.showPromptDialog = async () => '  ApoB Better Name  ';
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
      window.showPromptDialog = saved.prompt;
      window.buildSidebar = saved.buildSidebar;
      window.navigate = saved.navigate;
      category.configureCategoryCustomization({ navigate: saved.navigate || (() => {}) });
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
    const [{ state }, lifestyle] = await Promise.all([
      import('/js/state.js'),
      import(lifestyleUrl),
    ]);
    const outcomes = {};
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const overlay = document.getElementById('modal-overlay') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'modal-overlay' }));
    const modal = document.getElementById('detail-modal') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'detail-modal' }));
    const saved = {
      importedData: clone(state.importedData),
      profileSex: state.profileSex,
      closeModal: window.closeModal,
      navigate: window.navigate,
      openChatPanel: window.openChatPanel,
      useChatPrompt: window.useChatPrompt,
      openEMFAssessmentEditor: window.openEMFAssessmentEditor,
      sunHomeLightOptions: window._sunHomeLightOptions,
      sunEyewearOptions: window._sunEyewearOptions,
      ottScoreToLabel: window.ottScoreToLabel,
    };
    const calls = [];
    const controlOutcomeName = (kind, id, index) =>
      `${kind}_${id}_${index}_renders`.replace(/[^a-zA-Z0-9_]/g, '_');
    const setOption = (id, index = 0) => {
      const btn = document.querySelectorAll(`#${id} .ctx-btn-option`)[index];
      const label = btn?.textContent?.trim() || '';
      outcomes[controlOutcomeName('option', id, index)] = !!btn && !!label;
      btn?.classList.add('active');
      return label;
    };
    const setTag = (id, index = 0) => {
      const btn = document.querySelectorAll(`#${id} .ctx-tag`)[index];
      const label = btn?.textContent?.trim() || '';
      outcomes[controlOutcomeName('tag', id, index)] = !!btn && !!label;
      btn?.classList.add('active');
      return label;
    };

    try {
      state.profileSex = 'male';
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
      window.closeModal = () => { calls.push(['close']); overlay.classList.remove('show'); };
      window.navigate = route => calls.push(['navigate', route]);
      window.openChatPanel = () => calls.push(['chat']);
      window.useChatPrompt = prompt => calls.push(['prompt', prompt]);
      window.openEMFAssessmentEditor = () => calls.push(['emf-editor']);
      lifestyle.configureLifestyleContextEditors({
        recordChange: field => calls.push(['record', field]),
        saveAndRefresh: (msg, field) => calls.push(['save', msg, field || '']),
      });

      lifestyle.openDietEditor();
      const dietType = setOption('diet-type');
      const dietPattern = setOption('diet-pattern', 1);
      const dietRestriction = setTag('diet-restrictions');
      document.getElementById('diet-breakfast').value = 'strawberries and yogurt';
      document.getElementById('diet-lunch').value = 'canned tuna with avocado';
      document.getElementById('ctx-note-input').value = 'track digestion';
      lifestyle.saveDiet();
      outcomes.saveDietStoresSelectionsMealsAndNote = state.importedData.diet?.type === dietType
        && state.importedData.diet?.pattern === dietPattern
        && state.importedData.diet?.restrictions?.includes(dietRestriction)
        && state.importedData.diet?.breakfast === 'strawberries and yogurt'
        && state.importedData.diet?.lunch === 'canned tuna with avocado'
        && state.importedData.diet?.note === 'track digestion';
      const contaminantBadge = lifestyle.renderDietContaminantsBadge();
      outcomes.dietContaminantsBadgeCountsFlaggedSignals = contaminantBadge.includes('food contaminant signal')
        && contaminantBadge.includes('detected');
      lifestyle.showDietContaminantsModal();
      outcomes.dietContaminantsModalGroupsWarnings = modal.textContent.includes('Pesticide Residues')
        && modal.textContent.includes('Plastic Chemicals')
        && modal.textContent.includes('Low Contamination');
      modal.querySelector('.contaminant-actions .import-btn-primary')?.click();
      await delay(350);
      outcomes.dietContaminantsDiscussesWithAI = calls.some(call => call[0] === 'chat')
        && calls.some(call => call[0] === 'prompt' && call[1].includes('food contaminants'));
      lifestyle.clearDiet();
      outcomes.clearDietNullsDiet = state.importedData.diet === null;

      lifestyle.openSleepRestEditor();
      const sleepDuration = setOption('sleep-duration');
      const sleepIssue = setTag('sleep-issues');
      document.getElementById('ctx-note-input').value = 'cool room';
      lifestyle.saveSleepRest();
      outcomes.saveSleepRestStoresSelections = state.importedData.sleepRest?.duration === sleepDuration
        && state.importedData.sleepRest?.issues?.includes(sleepIssue)
        && state.importedData.sleepRest?.note === 'cool room';
      lifestyle.clearSleepRest();
      outcomes.clearSleepRestNullsSleep = state.importedData.sleepRest === null;

      window._sunHomeLightOptions = [{ key: 'warm-leds', label: 'Warm LEDs' }];
      window._sunEyewearOptions = [{ key: 'sunglasses', label: 'Sunglasses' }];
      window.ottScoreToLabel = () => ({ label: 'Strong light hygiene', tier: 'green' });
      state.importedData.sunDefaults = { fitzpatrick: 'III', homeLight: 'warm-leds', eyewear: 'sunglasses', ottScore: 4 };
      state.importedData.lightCircadian = { skinType: 'III' };
      lifestyle.openLightCircadianEditor();
      outcomes.lightCircadianMirrorRendersSetup = modal.textContent.includes('Warm LEDs')
        && modal.textContent.includes('Sunglasses')
        && modal.textContent.includes('Strong light hygiene');
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

      lifestyle.openExerciseEditor();
      const exerciseFrequency = setOption('exercise-freq');
      const exerciseType = setTag('exercise-types');
      lifestyle.saveExercise();
      outcomes.saveExerciseStoresFrequencyAndType = state.importedData.exercise?.frequency === exerciseFrequency
        && state.importedData.exercise?.types?.includes(exerciseType);
      lifestyle.clearExercise();
      outcomes.clearExerciseNullsExercise = state.importedData.exercise === null;

      lifestyle.openStressEditor();
      const stressLevel = setOption('stress-level');
      const stressSource = setTag('stress-sources');
      lifestyle.saveStress();
      outcomes.saveStressStoresLevelAndSource = state.importedData.stress?.level === stressLevel
        && state.importedData.stress?.sources?.includes(stressSource);
      lifestyle.clearStress();
      outcomes.clearStressNullsStress = state.importedData.stress === null;

      lifestyle.openLoveLifeEditor();
      outcomes.loveLifeFiltersSexSpecificConcern = modal.textContent.includes('erectile issues')
        && !modal.textContent.includes('vaginal dryness');
      const loveStatus = setOption('love-status');
      const loveConcern = setTag('love-concerns');
      lifestyle.saveLoveLife();
      outcomes.saveLoveLifeStoresStatusAndConcern = state.importedData.loveLife?.status === loveStatus
        && state.importedData.loveLife?.concerns?.includes(loveConcern);
      lifestyle.clearLoveLife();
      outcomes.clearLoveLifeNullsValue = state.importedData.loveLife === null;

      lifestyle.openEnvironmentEditor();
      const setting = setOption('env-setting');
      const waterConcern = setTag('env-water-concerns');
      const emfTag = setTag('env-emf');
      lifestyle.saveEnvironment();
      outcomes.saveEnvironmentStoresFallbackEmfFields = state.importedData.environment?.setting === setting
        && state.importedData.environment?.waterConcerns?.includes(waterConcern)
        && state.importedData.environment?.emf?.includes(emfTag);
      state.importedData.emfAssessment = { assessments: [{ id: 'emf-one', date: '2026-06-07', rooms: [] }] };
      state.importedData.environment = { emf: ['existing emf'], emfMitigation: ['existing mitigation'] };
      lifestyle.openEnvironmentEditor();
      outcomes.environmentWithAssessmentUsesLauncherInsteadOfFallbackTags = !!modal.querySelector('.ctx-emf-launcher.has-data')
        && !document.getElementById('env-emf');
      lifestyle.saveEnvironment();
      outcomes.environmentWithAssessmentPreservesExistingEmfFields = state.importedData.environment?.emf?.includes('existing emf')
        && state.importedData.environment?.emfMitigation?.includes('existing mitigation');
      lifestyle.clearEnvironment();
      outcomes.clearEnvironmentNullsValue = state.importedData.environment === null;

      lifestyle.openHealthGoalsEditor();
      document.getElementById('goal-text-input').value = 'Improve sleep timing';
      document.querySelectorAll('#goal-severity-select .ctx-btn-option').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('#goal-severity-select .ctx-btn-option')[1]?.classList.add('active');
      lifestyle.addHealthGoal();
      outcomes.addHealthGoalAppendsSeverity = state.importedData.healthGoals?.[0]?.text === 'Improve sleep timing'
        && state.importedData.healthGoals?.[0]?.severity === 'mild';
      lifestyle.deleteHealthGoal(0);
      outcomes.deleteHealthGoalRemovesByIndex = state.importedData.healthGoals?.length === 0;
      document.getElementById('goal-text-input').value = 'Reduce eye strain';
      lifestyle.addHealthGoal();
      lifestyle.closeHealthGoals();
      outcomes.closeHealthGoalsClosesAndNavigates = calls.some(call => call[0] === 'close')
        && calls.some(call => call[0] === 'navigate');
      lifestyle.openHealthGoalsEditor();
      lifestyle.clearHealthGoals();
      outcomes.clearHealthGoalsEmptiesArray = Array.isArray(state.importedData.healthGoals)
        && state.importedData.healthGoals.length === 0;

      lifestyle.openInterpretiveLensEditor();
      document.getElementById('interpretive-lens-textarea').value = 'Functional endocrinology';
      lifestyle.saveInterpretiveLens();
      outcomes.saveInterpretiveLensStoresTrimmedText = state.importedData.interpretiveLens === 'Functional endocrinology';
      lifestyle.openInterpretiveLensEditor();
      lifestyle.clearInterpretiveLens();
      outcomes.clearInterpretiveLensBlanksText = state.importedData.interpretiveLens === '';

      outcomes.configureCallbacksWereUsed = calls.some(call => call[0] === 'save' && call[2] === 'diet')
        && calls.some(call => call[0] === 'record' && call[1] === 'healthGoals');
    } finally {
      state.importedData = saved.importedData;
      state.profileSex = saved.profileSex;
      window.closeModal = saved.closeModal;
      window.navigate = saved.navigate;
      window.openChatPanel = saved.openChatPanel;
      window.useChatPrompt = saved.useChatPrompt;
      window.openEMFAssessmentEditor = saved.openEMFAssessmentEditor;
      window._sunHomeLightOptions = saved.sunHomeLightOptions;
      window._sunEyewearOptions = saved.sunEyewearOptions;
      window.ottScoreToLabel = saved.ottScoreToLabel;
      lifestyle.configureLifestyleContextEditors({ recordChange: () => {}, saveAndRefresh: () => {} });
      overlay.classList.remove('show');
      modal.innerHTML = '';
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
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
    const [{ state }, health, focus, summaries, profile, data] = await Promise.all([
      import('/js/state.js'),
      import(healthUrl),
      import(focusUrl),
      import('/js/context-card-summaries.js'),
      import('/js/profile.js'),
      import('/js/data.js'),
    ]);
    const outcomes = {};
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      provider: localStorage.getItem('labcharts-ai-provider'),
      paused: localStorage.getItem('labcharts-ai-paused'),
      openRouterKey: localStorage.getItem('labcharts-openrouter-key'),
    };
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
        <span id="ctx-ai-${key}"></span>
      `).join('') + '<div id="focus-card-body"></div>';

      const healthCacheKey = profile.profileStorageKey(state.currentProfile, 'contextHealth');
      cacheKeys.push(healthCacheKey);
      const cachedHealth = { dots: {}, summaries: {}, fingerprints: {} };
      for (const key of summaries.CONTEXT_CARD_KEYS) {
        cachedHealth.dots[key] = key === 'diet' ? 'yellow' : 'green';
        cachedHealth.summaries[key] = `${key} cached tip`;
        cachedHealth.fingerprints[key] = health.getCardFingerprint(key);
      }
      localStorage.setItem(healthCacheKey, JSON.stringify(cachedHealth));
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.removeItem('labcharts-ai-paused');
      await health.loadContextHealthDots();
      outcomes.healthDotsUseMatchingCache = document.getElementById('ctx-dot-diet')?.classList.contains('ctx-health-dot-yellow') === true
        && document.getElementById('ctx-ai-diet')?.textContent.includes('diet cached tip')
        && document.getElementById('ctx-ai-diet')?.classList.contains('ctx-ai-summary-yellow');

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

      const demo = await fetch('data/demo-male.json').then(r => r.json());
      state.importedData = demo;
      state.importedData.healthGoals = [{ text: 'Improve insulin sensitivity', severity: 'major' }];
      state.importedData.contextNotes = 'Prioritize fatigue and training recovery.';
      state.profileSex = 'male';
      state.profileDob = '1988-01-01';
      state.currentProfile = 'context-focus-profile';
      data.invalidateActiveDataCache();
      const focusCacheKey = profile.profileStorageKey(state.currentProfile, 'focusCard');
      cacheKeys.push(focusCacheKey);
      const focusFp = data.getFocusCardFingerprint();
      localStorage.setItem(focusCacheKey, JSON.stringify({ fingerprint: focusFp, text: '**ApoB** is the priority.' }));
      outcomes.renderFocusCardUsesCachedMarkdown = focus.renderFocusCard().includes('<strong>ApoB</strong>');
      const focusShell = document.createElement('div');
      focusShell.innerHTML = focus.renderFocusCard();
      const renderedFocusBody = focusShell.querySelector('#focus-card-body');
      outcomes.focusCardBodyParsedFromRenderedCard = !!renderedFocusBody;
      if (renderedFocusBody) document.getElementById('focus-card-body')?.replaceWith(renderedFocusBody);
      await focus.loadFocusCard({ refreshStale: false });
      outcomes.loadFocusCardKeepsFreshCachedText = document.getElementById('focus-card-body')?.textContent.includes('ApoB is the priority') === true;
      const focusContext = focus.buildFocusContext();
      outcomes.buildFocusContextIncludesProfileGoalsAndFlags = typeof focusContext === 'string'
        && focusContext.includes('Profile: male')
        && focusContext.includes('Goals: major: Improve insulin sensitivity')
        && focusContext.includes('Flagged');

      localStorage.removeItem(focusCacheKey);
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      localStorage.removeItem('labcharts-ai-paused');
      localStorage.removeItem('labcharts-openrouter-key');
      window.updateKeyCache?.('labcharts-openrouter-key', '');
      document.getElementById('focus-card-body').innerHTML = '';
      await focus.loadFocusCard();
      outcomes.loadFocusCardShowsEnableAIWithoutConnectedProvider = document.getElementById('focus-card-body')?.textContent.includes('Enable AI') === true;

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
      window.updateKeyCache?.('labcharts-openrouter-key', saved.openRouterKey || '');
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
