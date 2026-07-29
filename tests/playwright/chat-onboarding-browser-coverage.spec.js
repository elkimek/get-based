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
        openChatProviderQuiz: () => { calls.push('provider-quiz'); },
        openSettingsModal: tab => { calls.push(`settings:${tab}`); },
        renderChatMessages: () => { calls.push('render'); },
        renderProfileButton: () => { calls.push('render-profile-button'); },
        sendChatMessage: () => { calls.push('send'); },
        setChatNudge: mode => { calls.push(`nudge:${mode || ''}`); },
        setProfileHeight: (id, height, unit) => { calls.push(`height:${id}:${height}:${unit}`); },
        updateChatNudge: () => { calls.push('update-nudge'); },
      });
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

      onboarding.requestOnboardingLabImportProvider();
      outcomes.providerRequestUsesQuizWhenAvailable = calls.includes('provider-quiz');

      onboarding.configureChatOnboarding({ openChatProviderQuiz: null });
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
      await onboarding.setChatProfileSex('female');
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
      const countryInput = document.getElementById('chat-onboard-country');
      countryInput.value = '';
      localStorage.setItem('labcharts-ai-paused', 'true');
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      localStorage.removeItem('labcharts-openrouter-key');
      await onboarding.saveChatProfile(true);
      countryInput.value = 'Germany';
      await onboarding.saveChatLocation();
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
      if (chatInput && savedChatInputValue != null) chatInput.value = savedChatInputValue;
      pdfInput?.removeEventListener('click', onPdfClick);
      onboarding.configureChatOnboarding({
        closeChatPanel: () => {},
        openChatProviderQuiz: null,
        openSettingsModal: () => {},
        renderChatMessages: () => {},
        renderProfileButton: () => {},
        sendChatMessage: () => {},
        setChatNudge: () => {},
        setProfileHeight: null,
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

test('chat onboarding browser coverage keeps default callbacks safe before chat wiring', async ({ page }) => {
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
    const savedState = {
      currentProfile: state.currentProfile,
      profiles: state.profiles,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      importedData: state.importedData,
      chatHistory: state.chatHistory,
    };
    const host = document.createElement('div');
    const profileId = `chat_onboard_defaults_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
    const restoreStorage = () => {
      localStorage.clear();
      for (const [key, value] of localSnapshot) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    };
    let thrownError = null;

    try {
      host.innerHTML = `
        <button id="chat-onboard-next" type="button"></button>
        <input id="chat-onboard-name" type="text" value="Callback Safe">
        <input id="chat-onboard-dob" type="date" value="1985-04-12">
        <input id="chat-onboard-country" type="text">
        <div id="chat-onboard-lat"></div>
        <div id="chat-panel" class="open"></div>
      `;
      document.body.appendChild(host);
      localStorage.removeItem('labcharts-chat-nudge');
      state.currentProfile = profileId;
      state.profiles = [profileRecord];
      state.profileSex = 'female';
      state.profileDob = null;
      state.importedData = profile.createDefaultProfileData();
      state.chatHistory = [];
      localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));

      await onboarding.saveChatProfile(true);
      outcomes.defaultUpdateNudgeCallbackAllowsProfileAdvance =
        state.profiles[0].name === 'Callback Safe'
        && state.profileDob === '1985-04-12'
        && localStorage.getItem('labcharts-chat-nudge') === null;

      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      sessionStorage.setItem(`chat-onboard-force-step-${profileId}`, 'profile');
      localStorage.setItem(`labcharts-onboard-extras-done-${profileId}`, '1');
      localStorage.setItem(`labcharts-onboard-context-cards-skipped-${profileId}`, '1');
      await onboarding.saveChatProfile(true);
      outcomes.forcedProfileContinueSkipsConnectedProviderToExtras =
        sessionStorage.getItem(`chat-onboard-force-step-${profileId}`) === 'extras'
        && sessionStorage.getItem(`chat-onboard-provider-requested-${profileId}`) === null
        && sessionStorage.getItem(`chat-onboard-force-context-cards-${profileId}`) === null;

      localStorage.setItem('labcharts-ai-provider', 'custom');
      localStorage.removeItem('labcharts-custom-url');
      localStorage.removeItem('labcharts-custom-key');
      sessionStorage.setItem(`chat-onboard-force-step-${profileId}`, 'profile');
      await onboarding.saveChatProfile(true);
      outcomes.forcedProfileContinueUsesProviderStepWhenDisconnected =
        sessionStorage.getItem(`chat-onboard-force-step-${profileId}`) === 'provider'
        && sessionStorage.getItem(`chat-onboard-provider-requested-${profileId}`) === '1'
        && sessionStorage.getItem(`chat-onboard-provider-branch-${profileId}`) === null;

      state.importedData = {
        ...profile.createDefaultProfileData(),
        entries: [],
        diet: { pattern: 'Mediterranean' },
      };
      onboarding.onContextCardSaved();
      outcomes.defaultSetNudgeCallbackDoesNotMutateNudgeStorage =
        localStorage.getItem('labcharts-chat-nudge') === null;
    } catch (error) {
      thrownError = error;
    } finally {
      state.currentProfile = savedState.currentProfile;
      state.profiles = savedState.profiles;
      state.profileSex = savedState.profileSex;
      state.profileDob = savedState.profileDob;
      state.importedData = savedState.importedData;
      state.chatHistory = savedState.chatHistory;
      restoreStorage();
      host.remove();
    }
    if (thrownError) throw thrownError;

    outcomes.allDefaultCallbackOutcomesReached = Object.keys(outcomes).length === 4;
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
    const [onboarding, appOnboarding, { state }, profile] = await Promise.all([
      import(onboardingUrl),
      import('/js/chat-onboarding.js'),
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
    const waitForProviderTimer = () => new Promise(resolve => setTimeout(resolve, 350));
    const configureOnboardingForTest = target => {
      target.configureChatOnboarding({
        closeChatPanel: () => { calls.push('close'); },
        getActiveData: () => state.importedData,
        navigate: view => { calls.push(`navigate:${view}`); },
        openSettingsModal: tab => { calls.push(`settings:${tab}`); },
        recordChange: key => { calls.push(`record:${key}`); },
        renderChatMessages: () => { calls.push('render'); },
        renderMenstrualCycleSection: (_data, options = {}) => {
          calls.push(options.variant === 'dashboard' ? 'render-cycle-dashboard' : 'render-cycle');
          return '<div class="cycle-section">cycle refreshed</div>';
        },
        renderSupplementsSection: () => {
          calls.push('render-supps');
          return '<div class="supp-timeline-section">supps refreshed</div>';
        },
        sendChatMessage: () => { calls.push('send'); },
        setChatNudge: mode => { calls.push(`nudge:${mode || ''}`); },
        startOpenRouterOAuth: () => { calls.push('oauth'); },
        switchAIProvider: provider => { calls.push(`provider:${provider}`); },
        updateChatNudge: () => { calls.push('update-nudge'); },
      });
    };
    const resetOnboardingForTest = target => {
      target.configureChatOnboarding({
        closeChatPanel: () => {},
        getActiveData: () => state.importedData,
        navigate: () => {},
        openSettingsModal: () => {},
        recordChange: () => {},
        renderChatMessages: () => {},
        renderMenstrualCycleSection: null,
        renderSupplementsSection: null,
        sendChatMessage: () => {},
        setChatNudge: () => {},
        startOpenRouterOAuth: () => {},
        switchAIProvider: () => {},
        updateChatNudge: () => {},
      });
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

      configureOnboardingForTest(onboarding);
      configureOnboardingForTest(appOnboarding);

      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem('labcharts-ai-provider', 'custom');
      localStorage.removeItem('labcharts-custom-url');
      localStorage.removeItem('labcharts-custom-key');
      const crumbs = onboarding._renderOnboardCrumbs(3);
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      const connectedCrumbs = onboarding._renderOnboardCrumbs(3);
      const connectedContextCrumbs = onboarding._renderOnboardCrumbs(4);
      const quizRoot = onboarding._renderProviderQuiz(null, '<Ada>');
      const quizCard = onboarding._renderProviderQuiz('card', 'Ada');
      const quizLocal = onboarding._renderProviderQuiz('local', 'Ada');
      const quizBitcoin = onboarding._renderProviderQuiz('bitcoin', 'Ada');
      outcomes.renderHelpersEscapeAndBranch = crumbs.includes('Step 3 of 4')
        && crumbs.includes('Add-ons')
        && (crumbs.match(/chat-onboard-crumb active/g) || []).length === 3
        && crumbs.includes('data-chat-onboarding-action="go-onboarding-step"')
        && crumbs.includes('data-chat-step="2"')
        && connectedCrumbs.includes('Step 2 of 3')
        && connectedCrumbs.includes('Add-ons')
        && connectedCrumbs.includes('data-chat-step="1"')
        && (connectedCrumbs.match(/chat-onboard-crumb active/g) || []).length === 2
        && connectedContextCrumbs.includes('Step 3 of 3')
        && connectedContextCrumbs.includes('Context')
        && crumbs.includes('chat-onboard-back-btn')
        && quizRoot.includes('Welcome, &lt;Ada&gt;')
        && quizRoot.includes('Next, pick how you want to power the AI')
        && !quizRoot.includes('One more step')
        && quizRoot.includes('chat-quiz-recommended')
        && quizCard.includes('or-oauth-btn')
        && quizLocal.includes('Local AI setup')
        && quizBitcoin.includes('Routstr')
        && quizBitcoin.includes('PPQ');

      const quizHost = document.createElement('div');
      host.appendChild(quizHost);
      quizHost.innerHTML = quizRoot + quizCard + quizLocal + quizBitcoin;
      const delegatedMarkup = !quizHost.querySelector('[onclick], [onkeydown], [onchange], [oninput]')
        && quizHost.querySelectorAll('[data-chat-onboarding-action]').length >= 13;
      quizHost.innerHTML = quizRoot;
      quizHost.querySelector('[data-chat-onboarding-action="set-provider-branch"][data-chat-provider-branch="card"]')?.click();
      const delegatedBranchClick = sessionStorage.getItem(`chat-onboard-provider-branch-${profileId}`) === 'card';
      quizHost.innerHTML = quizCard;
      quizHost.querySelector('[data-chat-onboarding-action="back-to-provider-quiz"]')?.click();
      const delegatedBackClick = sessionStorage.getItem(`chat-onboard-provider-branch-${profileId}`) === null;
      quizHost.querySelector('[data-chat-onboarding-action="start-openrouter-oauth"]')?.click();
      quizHost.querySelector('[data-chat-onboarding-action="open-provider-settings"][data-chat-provider="openrouter"]')?.click();
      await waitForProviderTimer();
      quizHost.innerHTML = quizLocal;
      quizHost.querySelector('[data-chat-onboarding-action="open-provider-settings"][data-chat-provider="ollama"]')?.click();
      await waitForProviderTimer();
      quizHost.innerHTML = quizBitcoin;
      quizHost.querySelector('[data-chat-onboarding-action="open-provider-settings"][data-chat-provider="routstr"]')?.click();
      await waitForProviderTimer();
      quizHost.querySelector('[data-chat-onboarding-action="open-provider-settings"][data-chat-provider="ppq"]')?.click();
      await waitForProviderTimer();
      quizHost.innerHTML = quizRoot;
      quizHost.querySelector('[data-chat-onboarding-action="open-ai-settings"]')?.click();
      await waitForProviderTimer();
      quizHost.querySelector('[data-chat-onboarding-action="skip-provider-setup"]')?.click();
      outcomes.providerQuizDelegatesAllActions = delegatedMarkup
        && delegatedBranchClick
        && delegatedBackClick
        && calls.includes('oauth')
        && calls.includes('provider:openrouter')
        && calls.includes('provider:ollama')
        && calls.includes('provider:routstr')
        && calls.includes('provider:ppq')
        && calls.filter(call => call === 'settings:ai').length >= 5
        && localStorage.getItem(`labcharts-onboard-provider-skipped-${profileId}`) === '1';

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
        && sessionStorage.getItem(`chat-onboard-provider-requested-${profileId}`) === null
        && sessionStorage.getItem(`chat-onboard-provider-branch-${profileId}`) === null
        && sessionStorage.getItem(`chat-onboard-force-step-${profileId}`) === 'extras';

      sessionStorage.setItem(`chat-onboard-force-step-${profileId}`, 'provider');
      sessionStorage.setItem(`chat-onboard-provider-requested-${profileId}`, '1');
      localStorage.setItem(`labcharts-onboard-context-cards-skipped-${profileId}`, '1');
      onboarding.skipProviderSetup();
      outcomes.skipProviderSetupFromSkippedCardsStillAdvancesToExtras =
        sessionStorage.getItem(`chat-onboard-force-step-${profileId}`) === 'extras'
        && sessionStorage.getItem(`chat-onboard-provider-requested-${profileId}`) === null
        && sessionStorage.getItem(`chat-onboard-force-context-cards-${profileId}`) === null;

      onboarding.skipOnboardingExtras();
      outcomes.skipExtrasMarksDoneAndNavigates =
        localStorage.getItem(`labcharts-onboard-extras-done-${profileId}`) === '1'
        && sessionStorage.getItem('welcome-details-open') === '1'
        && calls.includes('navigate:dashboard');
      outcomes.skipExtrasFromForcedWizardShowsContextCardsAgain =
        sessionStorage.getItem(`chat-onboard-force-step-${profileId}`) === 'cards'
        && sessionStorage.getItem(`chat-onboard-force-context-cards-${profileId}`) === '1'
        && localStorage.getItem(`labcharts-onboard-context-cards-skipped-${profileId}`) === '1';

      sessionStorage.setItem(`chat-onboard-force-context-cards-${profileId}`, '1');
      onboarding.skipContextCards();
      outcomes.skipContextCardsMarksLocalClearsForceAndRefreshes =
        localStorage.getItem(`labcharts-onboard-extras-done-${profileId}`) === '1'
        && localStorage.getItem(`labcharts-onboard-context-cards-skipped-${profileId}`) === '1'
        && sessionStorage.getItem(`chat-onboard-force-context-cards-${profileId}`) === null
        && sessionStorage.getItem('welcome-details-open') === '1'
        && calls.includes('update-nudge')
        && calls.filter(call => call === 'render').length >= 2;

      const forceStepKey = `chat-onboard-force-step-${profileId}`;
      onboarding.goToOnboardingStep(1);
      const forcedProfile = sessionStorage.getItem(forceStepKey) === 'profile';
      onboarding.goToOnboardingStep(2);
      const forcedProvider = sessionStorage.getItem(forceStepKey) === 'provider'
        && sessionStorage.getItem(`chat-onboard-provider-requested-${profileId}`) === '1'
        && sessionStorage.getItem(`chat-onboard-provider-branch-${profileId}`) === null;
      sessionStorage.setItem(`chat-onboard-force-context-cards-${profileId}`, '1');
      onboarding.goToOnboardingStep(3);
      const forcedExtras = sessionStorage.getItem(forceStepKey) === 'extras'
        && sessionStorage.getItem(`chat-onboard-provider-requested-${profileId}`) === null
        && sessionStorage.getItem(`chat-onboard-provider-branch-${profileId}`) === null
        && sessionStorage.getItem(`chat-onboard-force-context-cards-${profileId}`) === null;
      onboarding.goToOnboardingStep(4);
      outcomes.goToOnboardingStepSetsExpectedSessionTargets =
        forcedProfile
        && forcedProvider
        && forcedExtras
        && sessionStorage.getItem(forceStepKey) === 'cards'
        && sessionStorage.getItem(`chat-onboard-force-context-cards-${profileId}`) === '1'
        && localStorage.getItem(`labcharts-onboard-extras-done-${profileId}`) === '1';

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
      localStorage.setItem(`labcharts-onboard-context-cards-skipped-${profileId}`, '1');
      outcomes.countFilledCardsSeesAllContextCards = onboarding._countFilledCards() === 9;
      onboarding.onContextCardSaved();
      outcomes.contextCardSavedNudgesReadyAndRendersOpenPanel =
        calls.includes('nudge:ready')
        && calls.filter(call => call === 'render').length >= 5;
      outcomes.contextCardSavedClearsCardSkip =
        localStorage.getItem(`labcharts-onboard-context-cards-skipped-${profileId}`) === null;

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
      if (chatPanel && savedChatPanelClass != null) chatPanel.className = savedChatPanelClass;
      resetOnboardingForTest(onboarding);
      resetOnboardingForTest(appOnboarding);
      host.remove();
    }

    return outcomes;
  }, { onboardingUrl: moduleUrl('/js/chat-onboarding.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
