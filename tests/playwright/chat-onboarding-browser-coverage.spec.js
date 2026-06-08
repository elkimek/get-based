import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?chatOnboardingCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('chat onboarding provider import and profile helpers cover browser paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-input');

  const results = await page.evaluate(async ({ onboardingUrl }) => {
    const [onboarding, { state }, profile] = await Promise.all([
      import(onboardingUrl),
      import('/js/state.js'),
      import('/js/profile.js'),
    ]);
    const outcomes = {};
    const localSnapshot = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const sessionSnapshot = new Map(Array.from({ length: sessionStorage.length }, (_, i) => {
      const key = sessionStorage.key(i);
      return [key, sessionStorage.getItem(key)];
    }));
    const savedState = {
      currentProfile: state.currentProfile,
      profiles: state.profiles,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      importedData: state.importedData,
      chatHistory: state.chatHistory,
    };
    const savedWindow = {
      openChatProviderQuiz: window.openChatProviderQuiz,
      openSettingsModal: window.openSettingsModal,
      setProfileHeight: window.setProfileHeight,
      renderProfileButton: window.renderProfileButton,
    };
    const host = document.createElement('div');
    const calls = [];
    const profileId = `chat_onboard_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const chatInput = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('chat-input'));
    const pdfInput = /** @type {HTMLInputElement | null} */ (document.getElementById('pdf-input'));
    const savedChatInputValue = chatInput?.value;
    const onPdfClick = () => { calls.push('pdf-click'); };
    const profileRecord = {
      id: profileId,
      name: 'Default',
      sex: null,
      dob: null,
      location: { country: '', zip: '' },
      tags: [],
      notes: '',
      status: 'active',
      avatar: null,
      height: null,
      heightUnit: 'cm',
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      pinned: false,
    };
    const defaultData = profile.createDefaultProfileData();
    const restoreStorage = (storage, snapshot) => {
      storage.clear();
      for (const [key, value] of snapshot) {
        if (key && value != null) storage.setItem(key, value);
      }
    };

    try {
      host.innerHTML = `
        <div class="chat-onboard-form">
          <button class="welcome-sex-btn" type="button">Male</button>
          <button class="welcome-sex-btn" type="button">Female</button>
        </div>
        <button id="chat-onboard-next" type="button"></button>
        <input id="chat-onboard-name" type="text">
        <input id="chat-onboard-dob" type="date">
        <input id="chat-onboard-height" type="text">
        <select id="chat-onboard-height-unit">
          <option value="cm">cm</option>
          <option value="in">in</option>
        </select>
        <input id="chat-onboard-weight" type="text">
        <select id="chat-onboard-weight-unit">
          <option value="kg">kg</option>
          <option value="lb">lb</option>
        </select>
        <input id="chat-onboard-country" type="text">
        <div id="chat-onboard-lat"></div>
      `;
      document.body.appendChild(host);
      outcomes.pdfInputMounted = pdfInput instanceof HTMLInputElement;
      if (!outcomes.pdfInputMounted) return outcomes;

      state.currentProfile = profileId;
      state.profiles = [profileRecord];
      state.profileSex = null;
      state.profileDob = null;
      state.importedData = defaultData;
      state.chatHistory = [];
      localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));
      localStorage.setItem('labcharts-location-cache', JSON.stringify({ 'germany|': 52 }));
      localStorage.setItem('labcharts-ai-paused', 'false');

      onboarding.configureChatOnboarding({
        closeChatPanel: () => { calls.push('close'); },
        renderChatMessages: () => { calls.push('render'); },
        sendChatMessage: () => { calls.push('send'); },
        setChatNudge: mode => { calls.push(`nudge:${mode || ''}`); },
        updateChatNudge: () => { calls.push('update-nudge'); },
      });
      window.openSettingsModal = tab => { calls.push(`settings:${tab}`); };
      window.setProfileHeight = (id, height, unit) => { calls.push(`height:${id}:${height}:${unit}`); };
      window.renderProfileButton = () => { calls.push('render-profile-button'); };
      pdfInput?.addEventListener('click', onPdfClick);

      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      localStorage.removeItem('labcharts-openrouter-key');
      onboarding.useChatPrompt('Explain my ferritin');
      outcomes.promptNeedsProviderBeforeSending = !calls.includes('send')
        && chatInput?.value === savedChatInputValue;

      localStorage.setItem('labcharts-ai-provider', 'ollama');
      onboarding.useChatPrompt('Explain my ferritin');
      outcomes.promptSendsWithProvider = calls.includes('send')
        && chatInput?.value === 'Explain my ferritin';

      window.openChatProviderQuiz = () => { calls.push('provider-quiz'); };
      onboarding.requestOnboardingLabImportProvider();
      outcomes.providerRequestUsesQuizWhenAvailable = calls.includes('provider-quiz');

      window.openChatProviderQuiz = undefined;
      onboarding.requestOnboardingLabImportProvider();
      outcomes.providerRequestFallsBackToSessionFlag =
        sessionStorage.getItem(`chat-onboard-provider-requested-${profileId}`) === '1'
        && calls.filter(call => call === 'render').length >= 1;

      localStorage.setItem('labcharts-ai-paused', 'true');
      onboarding.startOnboardingLabImport();
      outcomes.pausedImportOpensAiSettings = calls.includes('close')
        && calls.includes('settings:ai');

      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      localStorage.removeItem('labcharts-openrouter-key');
      onboarding.startOnboardingLabImport();
      outcomes.importWithoutProviderRequestsProvider = calls.filter(call => call === 'render').length >= 2
        && sessionStorage.getItem(`chat-onboard-provider-requested-${profileId}`) === '1';

      localStorage.setItem('labcharts-ai-provider', 'ollama');
      onboarding.startOnboardingLabImport();
      outcomes.importWithProviderClicksFileInput = calls.includes('pdf-click')
        && calls.filter(call => call === 'close').length >= 2;

      const nameInput = document.getElementById('chat-onboard-name');
      const nextButton = document.getElementById('chat-onboard-next');
      onboarding.setChatProfileSex('female');
      outcomes.sexButtonStateAndNextGate = state.profileSex === 'female'
        && host.querySelectorAll('.welcome-sex-btn')[1].classList.contains('active')
        && nextButton.disabled === true;

      nameInput.value = 'Ada Lovelace';
      onboarding._updateOnboardNextBtn();
      outcomes.nextButtonEnablesWhenNameAndSexExist = nextButton.disabled === false;

      const heightInput = document.getElementById('chat-onboard-height');
      const heightUnit = document.getElementById('chat-onboard-height-unit');
      heightInput.value = '180';
      heightUnit.value = 'in';
      onboarding.onboardHeightUnitChanged();
      const convertedToInches = heightInput.value === '70.9' && heightInput.placeholder === 'inches';
      heightUnit.value = 'cm';
      onboarding.onboardHeightUnitChanged();
      outcomes.heightUnitConversionRunsBothDirections = convertedToInches
        && heightInput.value === '180.1'
        && heightInput.placeholder === 'cm';

      document.getElementById('chat-onboard-dob').value = '1990-01-02';
      heightInput.value = '70';
      heightUnit.value = 'in';
      document.getElementById('chat-onboard-weight').value = '150';
      document.getElementById('chat-onboard-weight-unit').value = 'lb';
      document.getElementById('chat-onboard-country').value = 'Germany';
      localStorage.setItem('labcharts-ai-paused', 'true');
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      localStorage.removeItem('labcharts-openrouter-key');
      onboarding.saveChatProfile(true);
      await Promise.resolve();
      await Promise.resolve();
      const loc = profile.getProfileLocation(profileId);
      outcomes.saveProfilePersistsProfileFieldsAndBiometrics = state.profiles[0].name === 'Ada Lovelace'
        && state.profileDob === '1990-01-02'
        && calls.some(call => call.startsWith(`height:${profileId}:177.8:in`))
        && state.importedData.biometrics.weight.length === 1
        && state.importedData.biometrics.weight[0].unit === 'lb'
        && loc.country === 'Germany'
        && calls.includes('render-profile-button')
        && calls.includes('update-nudge');
      outcomes.cachedLocationDisplaysLatitudeBand =
        document.getElementById('chat-onboard-lat').textContent.includes('52')
        && document.getElementById('chat-onboard-lat').textContent.includes('N');
    } finally {
      await Promise.resolve();
      await Promise.resolve();
      state.currentProfile = savedState.currentProfile;
      state.profiles = savedState.profiles;
      state.profileSex = savedState.profileSex;
      state.profileDob = savedState.profileDob;
      state.importedData = savedState.importedData;
      state.chatHistory = savedState.chatHistory;
      restoreStorage(localStorage, localSnapshot);
      restoreStorage(sessionStorage, sessionSnapshot);
      Object.assign(window, savedWindow);
      if (chatInput && savedChatInputValue != null) chatInput.value = savedChatInputValue;
      pdfInput?.removeEventListener('click', onPdfClick);
      onboarding.configureChatOnboarding({
        closeChatPanel: () => {},
        renderChatMessages: () => {},
        sendChatMessage: () => {},
        setChatNudge: () => {},
        updateChatNudge: () => {},
      });
      host.remove();
    }

    return outcomes;
  }, { onboardingUrl: moduleUrl('/js/chat-onboarding.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('chat onboarding cycle supplement and provider quiz helpers cover browser paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-input');

  const results = await page.evaluate(async ({ onboardingUrl }) => {
    const [onboarding, { state }, profile] = await Promise.all([
      import(onboardingUrl),
      import('/js/state.js'),
      import('/js/profile.js'),
    ]);
    const outcomes = {};
    const localSnapshot = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const sessionSnapshot = new Map(Array.from({ length: sessionStorage.length }, (_, i) => {
      const key = sessionStorage.key(i);
      return [key, sessionStorage.getItem(key)];
    }));
    const savedState = {
      currentProfile: state.currentProfile,
      profiles: state.profiles,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      importedData: state.importedData,
      chatHistory: state.chatHistory,
    };
    const savedWindow = {
      recordChange: window.recordChange,
      renderMenstrualCycleSection: window.renderMenstrualCycleSection,
      getActiveData: window.getActiveData,
      renderSupplementsSection: window.renderSupplementsSection,
      navigate: window.navigate,
    };
    const host = document.createElement('div');
    const calls = [];
    const profileId = `chat_onboard_cycle_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const chatPanel = document.getElementById('chat-panel');
    const savedChatPanelClass = chatPanel?.className;
    const restoreStorage = (storage, snapshot) => {
      storage.clear();
      for (const [key, value] of snapshot) {
        if (key && value != null) storage.setItem(key, value);
      }
    };

    try {
      host.innerHTML = `
        <div id="chat-onboard-cycle-options" style="display:block"></div>
        <div id="chat-onboard-cycle-no-menses" style="display:none"></div>
        <div id="chat-onboard-cycle-entry" style="display:none"></div>
        <input id="chat-onboard-period-start" type="number">
        <input id="chat-onboard-period-end" type="number">
        <button id="chat-onboard-period-btn" type="button"></button>
        <div id="chat-onboard-period-preview"></div>
        <input id="chat-onboard-supp-name" type="text">
        <input id="chat-onboard-supp-dose" type="text">
        <select id="chat-onboard-supp-type">
          <option value="supplement">Supplement</option>
          <option value="medication">Medication</option>
        </select>
        <details class="welcome-context-details"></details>
        <div class="cycle-section"></div>
        <div class="supp-timeline-section"></div>
      `;
      document.body.appendChild(host);
      chatPanel?.classList.add('open');

      state.currentProfile = profileId;
      state.profiles = [{
        id: profileId,
        name: 'Ada',
        sex: 'female',
        dob: null,
        location: { country: '', zip: '' },
        tags: [],
        notes: '',
        status: 'active',
        avatar: null,
        height: null,
        heightUnit: 'cm',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        pinned: false,
      }];
      state.profileSex = 'female';
      state.profileDob = null;
      state.importedData = profile.createDefaultProfileData();
      state.chatHistory = [];
      localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));

      onboarding.configureChatOnboarding({
        closeChatPanel: () => { calls.push('close'); },
        renderChatMessages: () => { calls.push('render'); },
        sendChatMessage: () => { calls.push('send'); },
        setChatNudge: mode => { calls.push(`nudge:${mode || ''}`); },
        updateChatNudge: () => { calls.push('update-nudge'); },
      });
      window.recordChange = key => { calls.push(`record:${key}`); };
      window.renderMenstrualCycleSection = (_data, options = {}) => {
        calls.push(options.variant === 'dashboard' ? 'render-cycle-dashboard' : 'render-cycle');
        return '<div class="cycle-section">cycle refreshed</div>';
      };
      window.getActiveData = () => state.importedData;
      window.renderSupplementsSection = () => {
        calls.push('render-supps');
        return '<div class="supp-timeline-section">supps refreshed</div>';
      };
      window.navigate = view => { calls.push(`navigate:${view}`); };

      const crumbs = onboarding._renderOnboardCrumbs(3, 5);
      const quizRoot = onboarding._renderProviderQuiz(null, '<Ada>');
      const quizCard = onboarding._renderProviderQuiz('card', 'Ada');
      const quizLocal = onboarding._renderProviderQuiz('local', 'Ada');
      const quizBitcoin = onboarding._renderProviderQuiz('bitcoin', 'Ada');
      outcomes.renderHelpersEscapeAndBranch = crumbs.includes('Step 3 of 5')
        && (crumbs.match(/chat-onboard-crumb active/g) || []).length === 3
        && quizRoot.includes('Welcome, &lt;Ada&gt;')
        && quizRoot.includes('chat-quiz-recommended')
        && quizCard.includes('or-oauth-btn')
        && quizLocal.includes('Local AI setup')
        && quizBitcoin.includes('Routstr')
        && quizBitcoin.includes('PPQ');

      onboarding.setProviderQuizBranch('bitcoin');
      outcomes.providerBranchPersistsInSession =
        sessionStorage.getItem(`chat-onboard-provider-requested-${profileId}`) === '1'
        && sessionStorage.getItem(`chat-onboard-provider-branch-${profileId}`) === 'bitcoin'
        && calls.includes('render');

      onboarding.backToProviderQuiz();
      outcomes.backToProviderQuizClearsBranch =
        sessionStorage.getItem(`chat-onboard-provider-requested-${profileId}`) === '1'
        && sessionStorage.getItem(`chat-onboard-provider-branch-${profileId}`) === null;

      onboarding.skipProviderSetup();
      outcomes.skipProviderSetupMarksLocalAndClearsSession =
        localStorage.getItem(`labcharts-onboard-provider-skipped-${profileId}`) === '1'
        && sessionStorage.getItem(`chat-onboard-provider-requested-${profileId}`) === null;

      onboarding.skipOnboardingExtras();
      outcomes.skipExtrasMarksDoneAndNavigates =
        localStorage.getItem(`labcharts-onboard-extras-done-${profileId}`) === '1'
        && sessionStorage.getItem('welcome-details-open') === '1'
        && calls.includes('navigate:dashboard');

      onboarding.showCycleNoMensesOptions();
      outcomes.noMensesOptionsSwitchViews =
        document.getElementById('chat-onboard-cycle-options').style.display === 'none'
        && document.getElementById('chat-onboard-cycle-no-menses').style.display === 'block';

      document.getElementById('chat-onboard-cycle-options').style.display = 'block';
      onboarding.showCyclePeriodEntry();
      outcomes.periodEntrySwitchesViews =
        document.getElementById('chat-onboard-cycle-options').style.display === 'none'
        && document.getElementById('chat-onboard-cycle-entry').style.display === 'block';

      onboarding.saveCycleStatus('pregnant');
      outcomes.saveCycleStatusRefreshesDashboard = state.importedData.menstrualCycle.cycleStatus === 'pregnant'
        && Array.isArray(state.importedData.menstrualCycle.periods)
        && calls.includes('record:menstrualCycle')
        && calls.includes('render-cycle')
        && calls.includes('render');

      const startInput = document.getElementById('chat-onboard-period-start');
      const endInput = document.getElementById('chat-onboard-period-end');
      const periodBtn = document.getElementById('chat-onboard-period-btn');
      const preview = document.getElementById('chat-onboard-period-preview');
      startInput.value = '1';
      endInput.value = '5';
      onboarding._updatePeriodBtn();
      const shortPreview = preview.textContent.includes('day') && periodBtn.disabled === false;
      endInput.value = '20';
      onboarding._updatePeriodBtn();
      outcomes.periodPreviewHandlesShortAndLongRanges = shortPreview
        && preview.textContent.includes('double-check')
        && preview.style.color === 'var(--yellow)';

      endInput.value = '5';
      onboarding.saveChatPeriod();
      outcomes.saveChatPeriodAddsRegularPeriod = state.importedData.menstrualCycle.cycleStatus === 'regular'
        && state.importedData.menstrualCycle.periods.some(period => period.flow === 'moderate')
        && state.importedData.menstrualCycle.periodLength >= 1
        && calls.filter(call => call === 'record:menstrualCycle').length >= 2;

      const suppName = document.getElementById('chat-onboard-supp-name');
      const suppDose = document.getElementById('chat-onboard-supp-dose');
      const suppType = document.getElementById('chat-onboard-supp-type');
      let focused = false;
      suppName.focus = () => { focused = true; };
      onboarding.addChatSupplement();
      const emptyNameFocuses = focused === true && state.importedData.supplements.length === 0;
      suppName.value = 'Magnesium';
      suppDose.value = '200 mg';
      suppType.value = 'supplement';
      onboarding.addChatSupplement();
      const addedSupplement = state.importedData.supplements.length === 1
        && state.importedData.supplements[0].name === 'Magnesium'
        && calls.includes('render-supps');
      onboarding.removeChatSupplement(0);
      outcomes.supplementAddRemovePaths = emptyNameFocuses
        && addedSupplement
        && state.importedData.supplements.length === 0;

      state.importedData = {
        ...profile.createDefaultProfileData(),
        healthGoals: [{ text: 'Energy', severity: 'medium' }],
        diagnoses: { condition: 'Hashimoto' },
        diet: { pattern: 'Mediterranean' },
        exercise: { frequency: 'daily' },
        sleepRest: { sleep: '8h' },
        lightCircadian: { morningLight: 'yes' },
        stress: { level: 'medium' },
        loveLife: { status: 'connected' },
        environment: { air: 'filtered' },
      };
      outcomes.countFilledCardsSeesAllContextCards = onboarding._countFilledCards() === 9;
      onboarding.onContextCardSaved();
      outcomes.contextCardSavedNudgesReadyAndRendersOpenPanel =
        calls.includes('nudge:ready')
        && calls.filter(call => call === 'render').length >= 5;

      state.importedData = {
        ...profile.createDefaultProfileData(),
        diet: { pattern: 'Mediterranean' },
      };
      onboarding.onContextCardSaved();
      outcomes.partialContextNudgesContext = calls.includes('nudge:context');

      state.importedData = {
        ...profile.createDefaultProfileData(),
        entries: [{ date: '2026-06-08', markers: {} }],
      };
      const nudgeCountBeforeData = calls.filter(call => call.startsWith('nudge:')).length;
      onboarding.onContextCardSaved();
      outcomes.existingLabDataSkipsContextNudge =
        calls.filter(call => call.startsWith('nudge:')).length === nudgeCountBeforeData;
    } finally {
      await Promise.resolve();
      await Promise.resolve();
      state.currentProfile = savedState.currentProfile;
      state.profiles = savedState.profiles;
      state.profileSex = savedState.profileSex;
      state.profileDob = savedState.profileDob;
      state.importedData = savedState.importedData;
      state.chatHistory = savedState.chatHistory;
      restoreStorage(localStorage, localSnapshot);
      restoreStorage(sessionStorage, sessionSnapshot);
      Object.assign(window, savedWindow);
      if (chatPanel && savedChatPanelClass != null) chatPanel.className = savedChatPanelClass;
      onboarding.configureChatOnboarding({
        closeChatPanel: () => {},
        renderChatMessages: () => {},
        sendChatMessage: () => {},
        setChatNudge: () => {},
        updateChatNudge: () => {},
      });
      host.remove();
    }

    return outcomes;
  }, { onboardingUrl: moduleUrl('/js/chat-onboarding.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
