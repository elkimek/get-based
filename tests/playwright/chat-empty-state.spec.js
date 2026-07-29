import { expect, test } from './coverage-fixture.js';

function expectAll(outcomes) {
  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
}

test('chat empty-state delegated actions update scoped profile UI', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const [chatEmptyState, { state }, { getProfileLocation }, contextCardsRuntime, settingsBridge] = await Promise.all([
      import('/js/chat-empty-state.js'),
      import('/js/state.js'),
      import('/js/profile.js'),
      import('/js/context-cards-runtime.js'),
      import('/js/settings-runtime-bridge.js'),
    ]);

    const saved = {
      currentProfile: state.currentProfile,
      profiles: state.profiles,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      importedData: state.importedData,
      profilesStorage: localStorage.getItem('labcharts-profiles'),
    };
    const savedInputClick = HTMLInputElement.prototype.click;
    const chatMessages = document.getElementById('chat-messages');
    const savedChatMessagesHTML = chatMessages?.innerHTML;

    const calls = [];
    const previousContextCardsRuntime = contextCardsRuntime.configureContextCardsRuntimeCallbacks({
      triggerDNAFilePicker: () => calls.push('import-dna'),
    });
    const previousSettingsBridge = settingsBridge.configureSettingsModuleBridge({
      openSettingsModal: tab => calls.push(`open-settings:${tab}`),
    });
    const previousChatEmptyStateDeps = chatEmptyState.configureChatEmptyStateDeps({
      closeChatPanel: () => calls.push('close-chat'),
    });
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 80; i += 1) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const inputClicks = [];
    const container = document.createElement('div');
    const panel = document.createElement('div');
    const strayMtDnaInput = document.createElement('input');
    let bubbledClicks = 0;

    try {
      if (chatMessages) chatMessages.innerHTML = '';

      HTMLInputElement.prototype.click = function() {
        inputClicks.push(this === strayMtDnaInput ? 'stray' : panel.contains(this) ? 'scoped' : 'other');
      };

      state.currentProfile = 'chat-empty-test';
      state.profiles = [{ id: 'chat-empty-test', name: 'Default', tags: [], notes: '', status: 'active' }];
      state.profileSex = null;
      state.profileDob = null;
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        healthGoals: [],
        diagnoses: null,
        diet: null,
        exercise: null,
        sleepRest: null,
        lightCircadian: null,
        stress: null,
        loveLife: null,
        environment: null,
        interpretiveLens: '',
        contextNotes: '',
        menstrualCycle: null,
        emfAssessment: null,
        genetics: null,
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        changeHistory: [],
      };

      strayMtDnaInput.type = 'file';
      strayMtDnaInput.id = 'mtdna-onboard-input';
      document.body.appendChild(strayMtDnaInput);
      document.body.appendChild(panel);
      panel.appendChild(container);
      panel.addEventListener('click', () => { bubbledClicks++; });

      chatEmptyState.renderEmptyChatState(container, panel);

      const nameInput = container.querySelector('#chat-onboard-name');
      nameInput.value = 'Ada';
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));

      container.querySelector('[data-chat-empty-action="set-profile-sex"][data-sex="female"]')?.click();
      await waitUntil(
        () => state.profileSex === 'female'
          && container.querySelector('[data-sex="female"]')?.classList.contains('active') === true,
        'durable chat profile sex',
      );
      const sexSavedAndActive = state.profileSex === 'female'
        && container.querySelector('[data-sex="female"]')?.classList.contains('active') === true;

      const heightInput = container.querySelector('#chat-onboard-height');
      const heightUnit = container.querySelector('#chat-onboard-height-unit');
      heightInput.value = '180';
      heightUnit.value = 'in';
      heightUnit.dispatchEvent(new Event('change', { bubbles: true }));

      const countryInput = container.querySelector('#chat-onboard-country');
      countryInput.value = 'Germany';
      countryInput.dispatchEvent(new Event('input', { bubbles: true }));
      await waitUntil(
        () => getProfileLocation('chat-empty-test').country === 'Germany',
        'durable chat profile location',
      );

      chatEmptyState.renderEmptyChatState(container, panel);
      const bubbledBeforeOptionalActions = bubbledClicks;
      container.querySelector('[data-chat-empty-action="open-cycle-editor"]')?.click();
      await new Promise(resolve => {
        const started = performance.now();
        const waitForEditor = () => {
          if (document.querySelector('#detail-modal .gb-modal-title')?.textContent === 'Menstrual Cycle'
            || performance.now() - started >= 2000) resolve();
          else requestAnimationFrame(waitForEditor);
        };
        waitForEditor();
      });
      const cycleEditorOpenedThroughModule = document.getElementById('modal-overlay')?.classList.contains('show') === true
        && document.querySelector('#detail-modal .gb-modal-title')?.textContent === 'Menstrual Cycle';
      container.querySelector('[data-chat-empty-action="open-supplements-editor"]')?.click();
      container.querySelector('[data-chat-empty-action="import-dna"]')?.click();
      container.querySelector('[data-chat-empty-action="import-mtdna"]')?.click();
      container.querySelector('[data-chat-empty-action="open-wearables-settings"]')?.click();

      return {
        delegatesInstalled: container.dataset.chatEmptyDelegates === '1',
        noInlineHandlers: !container.querySelector('[onclick],[onchange],[oninput],[onkeydown],[onkeyup],[onsubmit]'),
        panelActive: panel.classList.contains('chat-onboarding-active'),
        nameSaved: state.profiles[0]?.name === 'Ada',
        sexSavedAndActive,
        nonClosingActionsBubble: bubbledClicks > 0,
        heightConverted: heightInput.value === '70.9',
        countrySaved: getProfileLocation('chat-empty-test').country === 'Germany',
        optionalActionsCalled: calls.includes('close-chat')
          && calls.includes('import-dna')
          && calls.includes('open-settings:wearables'),
        cycleEditorOpenedThroughModule,
        supplementsEditorOpenedThroughModule: document.getElementById('modal-overlay')?.classList.contains('show') === true
          && document.querySelector('#detail-modal h3')?.textContent === 'Supplements & Medications',
        mtdnaInputScoped: inputClicks.includes('scoped') && !inputClicks.includes('stray'),
        optionalActionsStopPropagation: bubbledClicks === bubbledBeforeOptionalActions,
      };
    } finally {
      contextCardsRuntime.configureContextCardsRuntimeCallbacks(previousContextCardsRuntime);
      settingsBridge.configureSettingsModuleBridge(previousSettingsBridge);
      chatEmptyState.configureChatEmptyStateDeps(previousChatEmptyStateDeps);
      state.currentProfile = saved.currentProfile;
      state.profiles = saved.profiles;
      state.profileSex = saved.profileSex;
      state.profileDob = saved.profileDob;
      state.importedData = saved.importedData;
      if (saved.profilesStorage === null) localStorage.removeItem('labcharts-profiles');
      else localStorage.setItem('labcharts-profiles', saved.profilesStorage);
      document.getElementById('modal-overlay')?.classList.remove('show');
      HTMLInputElement.prototype.click = savedInputClick;
      strayMtDnaInput.remove();
      container.remove();
      panel.remove();
      if (chatMessages && savedChatMessagesHTML != null) chatMessages.innerHTML = savedChatMessagesHTML;
    }
  });

  expectAll(results);
});

test('chat onboarding walks connected and disconnected funnels coherently', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const [
      { renderEmptyChatState },
      { state },
      data,
      chatOnboarding,
    ] = await Promise.all([
      import('/js/chat-empty-state.js'),
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/chat-onboarding.js'),
    ]);

    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const saved = {
      currentProfile: state.currentProfile,
      profiles: clone(state.profiles),
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      currentChatPersonality: state.currentChatPersonality,
      importedData: clone(state.importedData),
      chatHistory: clone(state.chatHistory),
    };
    const localSnapshot = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const sessionSnapshot = new Map(Array.from({ length: sessionStorage.length }, (_, i) => {
      const key = sessionStorage.key(i);
      return [key, sessionStorage.getItem(key)];
    }));
    const existingPanel = document.getElementById('chat-panel');
    const panel = existingPanel || document.createElement('div');
    const container = document.createElement('div');
    const savedPanelClass = panel.className;
    const savedPanelId = panel.id;
    const calls = [];
    const outcomes = {};

    const baseImportedData = () => ({
      entries: [],
      notes: [],
      supplements: [],
      healthGoals: [],
      diagnoses: null,
      diet: null,
      exercise: null,
      sleepRest: null,
      lightCircadian: null,
      stress: null,
      loveLife: null,
      environment: null,
      menstrualCycle: null,
      genetics: null,
      wearableConnections: {},
      interpretiveLens: '',
      contextNotes: '',
      customMarkers: {},
      markerNotes: {},
      markerValueNotes: {},
      changeHistory: [],
    });
    const restoreStorage = (storage, snapshot) => {
      storage.clear();
      for (const [key, value] of snapshot) {
        if (key && value != null) storage.setItem(key, value);
      }
    };
    const setProvider = connected => {
      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem('labcharts-ai-provider', connected ? 'ollama' : 'custom');
      if (!connected) {
        localStorage.removeItem('labcharts-custom-url');
        localStorage.removeItem('labcharts-custom-key');
      }
    };
    const setupProfile = (profileId, connected) => {
      localStorage.clear();
      sessionStorage.clear();
      setProvider(connected);
      state.currentProfile = profileId;
      state.profiles = [{ id: profileId, name: 'Default', tags: [], notes: '', status: 'active' }];
      state.profileSex = null;
      state.profileDob = null;
      state.currentChatPersonality = 'default';
      state.importedData = baseImportedData();
      state.chatHistory = [];
      data.invalidateActiveDataCache();
      container.innerHTML = '';
      panel.className = '';
      renderEmptyChatState(container, panel);
    };
    const text = () => container.textContent || '';
    const click = selector => {
      const el = container.querySelector(selector);
      if (!el) return false;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    };
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 80; i += 1) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const finishStep1 = async () => {
      const nameInput = container.querySelector('#chat-onboard-name');
      if (nameInput) nameInput.value = 'Ada';
      click('[data-chat-empty-action="set-profile-sex"][data-sex="female"]');
      await waitUntil(
        () => state.profileSex === 'female'
          && container.querySelector('#chat-onboard-next')?.disabled === false,
        'durable profile sex before advancing',
      );
      click('[data-chat-empty-action="save-profile-advance"]');
      await waitUntil(
        () => !text().includes('Basics'),
        'durable profile save and onboarding advance',
      );
    };
    const clickBack = () => click('.chat-onboard-back-btn[data-chat-onboarding-action="go-onboarding-step"]');
    const continueStep3 = () => click('[data-chat-empty-action="skip-extras"]');

    try {
      panel.id = 'chat-panel';
      if (!existingPanel) document.body.append(panel);
      panel.append(container);
      chatOnboarding.configureChatOnboarding({
        navigate: route => calls.push(`navigate:${route}`),
        renderChatMessages: () => renderEmptyChatState(container, panel),
        renderProfileButton: () => {},
        setChatNudge: () => {},
        updateChatNudge: () => {},
      });

      setupProfile('walk-connected', true);
      outcomes.connectedStartsAtProfile = text().includes('Step 1 of 3')
        && text().includes('Basics');
      await finishStep1();
      outcomes.connectedSkipsProviderToStep3 = text().includes('Step 2 of 3')
        && text().includes('Add-ons')
        && !text().includes('pick how you want to power the AI');
      clickBack();
      outcomes.connectedBackFromStep3ReturnsToProfile = text().includes('Step 1 of 3')
        && text().includes('Basics');
      await finishStep1();
      outcomes.connectedProfileContinueReturnsToStep3 = text().includes('Step 2 of 3')
        && text().includes('Add-ons');
      continueStep3();
      outcomes.connectedStep3ContinuesToCardsOnly = text().includes('Step 3 of 3')
        && text().includes('Context')
        && text().includes('Add optional context')
        && !!container.querySelector('.chat-context-cards')
        && !container.querySelector('[data-chat-empty-action="start-lab-import"]');
      click('[data-chat-empty-action="continue-after-context-cards"]');
      outcomes.connectedCardsContinueShowsImportHandoff = text().includes('Context cards are saved for later')
        && text().includes('Setup ready')
        && text().includes('import labs or ask what to test')
        && !text().includes('Step 4 of 4')
        && !!container.querySelector('[data-chat-empty-action="start-lab-import"]')
        && !!container.querySelector('[data-chat-empty-action="use-prompt"]')
        && !!container.querySelector('[data-chat-onboarding-action="go-onboarding-step"][data-chat-step="4"]');
      click('[data-chat-onboarding-action="go-onboarding-step"][data-chat-step="4"]');
      outcomes.connectedHandoffReturnShowsCards = text().includes('Step 3 of 3')
        && text().includes('Context')
        && !!container.querySelector('.chat-context-cards');

      setupProfile('walk-disconnected', false);
      await finishStep1();
      outcomes.disconnectedProfileContinuesToProvider = text().includes('Step 2 of 4')
        && text().includes('AI setup')
        && text().includes('Next, pick how you want to power the AI')
        && !text().includes('One more step');
      click('[data-chat-onboarding-action="skip-provider-setup"]');
      outcomes.disconnectedProviderSkipContinuesToStep3 = text().includes('Step 3 of 4')
        && text().includes('Add-ons')
        && text().includes('Continue to context cards');
      clickBack();
      outcomes.disconnectedBackFromStep3ReturnsToProvider = text().includes('Step 2 of 4')
        && text().includes('AI setup')
        && text().includes('pick how you want to power the AI');
      click('[data-chat-onboarding-action="skip-provider-setup"]');
      continueStep3();
      outcomes.disconnectedStep4KeepsCardsBeforeConnect = text().includes('Step 4 of 4')
        && text().includes('Context')
        && !!container.querySelector('.chat-context-cards')
        && container.querySelector('[data-chat-empty-action="continue-after-context-cards"]')?.textContent?.trim() === 'Continue'
        && !container.querySelector('[data-chat-empty-action="request-lab-import-provider"]');
      click('[data-chat-empty-action="continue-after-context-cards"]');
      outcomes.disconnectedHandoffHasSingleConnectAndContextReturn = text().includes('connect AI when you are ready')
        && text().includes('Setup ready')
        && !text().includes('Step 4 of 4')
        && container.querySelectorAll('[data-chat-empty-action="request-lab-import-provider"]').length === 1
        && container.querySelectorAll('[data-chat-empty-action="open-provider-quiz"]').length === 0
        && !!container.querySelector('[data-chat-onboarding-action="go-onboarding-step"][data-chat-step="4"]');
    } finally {
      state.currentProfile = saved.currentProfile;
      state.profiles = saved.profiles;
      state.profileSex = saved.profileSex;
      state.profileDob = saved.profileDob;
      state.currentChatPersonality = saved.currentChatPersonality;
      state.importedData = saved.importedData;
      state.chatHistory = saved.chatHistory;
      data.invalidateActiveDataCache();
      restoreStorage(localStorage, localSnapshot);
      restoreStorage(sessionStorage, sessionSnapshot);
      chatOnboarding.configureChatOnboarding({
        navigate: () => {},
        renderChatMessages: () => {},
        renderProfileButton: () => {},
        setChatNudge: () => {},
        updateChatNudge: () => {},
      });
      container.remove();
      panel.className = savedPanelClass;
      panel.id = savedPanelId;
      if (!existingPanel) panel.remove();
    }

    return outcomes;
  });

  expectAll(results);
});

test('chat empty-state renders remaining prompt states and actions', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const [
      { configureChatEmptyStateDeps, renderEmptyChatState, _getNoDataPrompts },
      { state },
      data,
      chatOnboarding,
      chatRuntime,
    ] = await Promise.all([
      import('/js/chat-empty-state.js'),
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/chat-onboarding.js'),
      import('/js/chat-runtime.js'),
    ]);

    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const profileId = 'chat-empty-state-branches';
    const saved = {
      currentProfile: state.currentProfile,
      profiles: clone(state.profiles),
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      currentChatPersonality: state.currentChatPersonality,
      importedData: clone(state.importedData),
    };
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const sessionSnapshot = new Map(Array.from({ length: sessionStorage.length }, (_, i) => {
      const key = sessionStorage.key(i);
      return [key, sessionStorage.getItem(key)];
    }));
    const savedFns = {
      showNotification: window.showNotification,
      inputClick: HTMLInputElement.prototype.click,
      scrollIntoView: Element.prototype.scrollIntoView,
    };
    const outcomes = {};
    const calls = [];
    const previousChatEmptyStateDeps = configureChatEmptyStateDeps({
      openChatProviderQuiz: () => calls.push(['provider-quiz']),
      setOnboardingFocus: focus => calls.push(['focus', focus]),
    });
    const previousChatRuntime = chatRuntime.configureChatRuntimeCallbacks({
      resumeAI: () => calls.push(['resume-ai']),
    });
    const container = document.createElement('div');
    const panel = document.createElement('div');
    const existingChatInput = /** @type {HTMLTextAreaElement | HTMLInputElement | null} */ (document.getElementById('chat-input'));
    const existingPdfInput = /** @type {HTMLInputElement | null} */ (document.getElementById('pdf-input'));
    const chatInput = existingChatInput || document.createElement('textarea');
    const pdfInput = existingPdfInput || document.createElement('input');
    const createdChatInput = !existingChatInput;
    const createdPdfInput = !existingPdfInput;
    const savedChatInputValue = existingChatInput?.value || '';
    const savedPdfInputValue = existingPdfInput?.value || '';

    const baseImportedData = overrides => ({
      entries: [],
      notes: [],
      supplements: [],
      healthGoals: [],
      diagnoses: null,
      diet: null,
      exercise: null,
      sleepRest: null,
      lightCircadian: null,
      stress: null,
      loveLife: null,
      environment: null,
      menstrualCycle: null,
      genetics: null,
      wearableConnections: {},
      interpretiveLens: '',
      contextNotes: '',
      customMarkers: {},
      markerNotes: {},
      markerValueNotes: {},
      changeHistory: [],
      ...overrides,
    });
    const partialContextData = () => baseImportedData({
      healthGoals: ['better energy'],
      sleepRest: { quality: 'fragmented' },
    });
    const fullContextData = () => baseImportedData({
      healthGoals: ['better energy'],
      diagnoses: { conditions: [{ name: 'hypothyroid' }] },
      diet: { style: 'omnivore' },
      exercise: { frequency: '3x/week' },
      sleepRest: { quality: 'fragmented' },
      lightCircadian: { morningLight: 'daily' },
      stress: { level: 'medium' },
      loveLife: { status: 'partnered' },
      environment: { air: 'city' },
    });
    const labData = overrides => baseImportedData({
      entries: [{ date: '2026-06-01', markers: { 'biochemistry.glucose': 5.2 } }],
      ...overrides,
    });
    const clearBranchStorage = () => {
      localStorage.removeItem(`labcharts-onboard-extras-done-${profileId}`);
      localStorage.removeItem(`labcharts-onboard-context-cards-skipped-${profileId}`);
      localStorage.removeItem(`labcharts-onboard-context-cards-done-${profileId}`);
      sessionStorage.removeItem(`chat-onboard-force-step-${profileId}`);
      sessionStorage.removeItem(`chat-onboard-force-context-cards-${profileId}`);
      sessionStorage.removeItem(`chat-onboard-provider-requested-${profileId}`);
      sessionStorage.removeItem(`chat-onboard-provider-branch-${profileId}`);
    };
    const setProviderState = ({ connected = true, paused = false } = {}) => {
      localStorage.setItem('labcharts-ai-provider', connected ? 'ollama' : 'custom');
      localStorage.setItem('labcharts-ai-paused', paused ? 'true' : 'false');
      if (!connected) {
        localStorage.removeItem('labcharts-custom-url');
        localStorage.removeItem('labcharts-custom-key');
      }
    };
    const setFixture = (importedData, opts = {}) => {
      state.currentProfile = profileId;
      state.profiles = [{ id: profileId, name: 'Ada Lovelace', tags: [], notes: '', status: 'active' }];
      state.profileSex = opts.profileSex ?? 'female';
      state.profileDob = '1815-12-10';
      state.currentChatPersonality = 'default';
      state.importedData = importedData;
      data.invalidateActiveDataCache();
      clearBranchStorage();
      setProviderState({ connected: opts.connected !== false, paused: !!opts.paused });
      if (opts.extrasDone) localStorage.setItem(`labcharts-onboard-extras-done-${profileId}`, '1');
      if (opts.contextCardsSkipped) localStorage.setItem(`labcharts-onboard-context-cards-skipped-${profileId}`, '1');
      if (opts.forceContextCards) sessionStorage.setItem(`chat-onboard-force-context-cards-${profileId}`, '1');
      if (opts.providerRequested) sessionStorage.setItem(`chat-onboard-provider-requested-${profileId}`, '1');
      if (opts.providerBranch) sessionStorage.setItem(`chat-onboard-provider-branch-${profileId}`, opts.providerBranch);
      container.innerHTML = '';
      panel.className = '';
      chatInput.value = '';
      calls.length = 0;
    };
    const renderText = () => {
      renderEmptyChatState(container, panel);
      return container.textContent || '';
    };

    try {
      document.body.append(container, panel);
      if (createdChatInput) {
        chatInput.id = 'chat-input';
        document.body.append(chatInput);
      } else {
        chatInput.value = '';
      }
      if (createdPdfInput) {
        pdfInput.id = 'pdf-input';
        pdfInput.type = 'file';
        document.body.append(pdfInput);
      } else {
        pdfInput.value = '';
      }
      window.showNotification = (message, tone) => calls.push(['notification', message, tone]);
      chatOnboarding.configureChatOnboarding({
        closeChatPanel: () => calls.push(['close-chat']),
        renderChatMessages: () => calls.push(['render-chat']),
        sendChatMessage: () => calls.push(['send-chat']),
        setChatNudge: mode => calls.push(['nudge', mode]),
        updateChatNudge: () => calls.push(['update-nudge']),
      });
      HTMLInputElement.prototype.click = function() {
        calls.push(['input-click', this.id || this.type]);
      };
      Element.prototype.scrollIntoView = function() {
        calls.push(['scroll', this.className || this.id]);
      };

      setFixture(baseImportedData({}));
      const starterPrompts = _getNoDataPrompts();
      setFixture(partialContextData());
      const profilePrompts = _getNoDataPrompts();
      setFixture(labData({}));
      outcomes.noDataPromptHelperShowsStarterPrompts = Array.isArray(starterPrompts)
        && starterPrompts.some(prompt => prompt.includes('start'));
      outcomes.noDataPromptHelperUsesProfilePrompts = Array.isArray(profilePrompts)
        && profilePrompts.some(prompt => prompt.includes('Based on my profile'));
      outcomes.noDataPromptHelperReturnsNullWithLabs = _getNoDataPrompts() === null;

      setFixture(baseImportedData({}), { paused: true });
      const pausedText = renderText();
      container.querySelector('[data-chat-empty-action="resume-ai"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      outcomes.aiPausedStateMarksPanelActive = panel.classList.contains('chat-onboarding-active');
      outcomes.aiPausedStateRendersCopy = pausedText.includes('AI features are currently paused');
      outcomes.aiPausedStateResumeActionRuns = calls.some(call => call[0] === 'resume-ai');

      setFixture(baseImportedData({}), { connected: false, providerRequested: true, providerBranch: 'local' });
      const providerText = renderText();
      outcomes.providerSetupStateMarksPanelActive = panel.classList.contains('chat-onboarding-active');
      outcomes.providerSetupStateRendersStoredBranch = providerText.includes('Runs on your computer');
      outcomes.providerSetupStateNamesLocalAi = providerText.includes('Local AI');

      setFixture(fullContextData(), { extrasDone: true });
      const fullText = renderText();
      container.querySelector('[data-chat-empty-action="start-lab-import"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      container.querySelector('[data-chat-empty-action="use-prompt"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const promptInputValue = document.getElementById('chat-input')?.value || '';
      outcomes.fullContextNoDataStateLeavesPanelInactive = !panel.classList.contains('chat-onboarding-active');
      outcomes.fullContextNoDataStateRendersHandoffCopy = fullText.includes('Context complete')
        && fullText.includes('context cards are complete')
        && fullText.includes('import labs or ask what to test')
        && !fullText.includes('Step 4 of 4');
      outcomes.fullContextNoDataStateOffersImportAndReview =
        calls.some(call => call[0] === 'input-click' && call[1] === 'pdf-input')
        && !!container.querySelector('.chat-prompt-btn[data-chat-onboarding-action="go-onboarding-step"][data-chat-step="4"]');
      outcomes.fullContextNoDataPromptFillsInput = promptInputValue.includes('what blood tests should I get');
      outcomes.fullContextNoDataPromptTriggersSend = calls.some(call => call[0] === 'send-chat');

      setFixture(fullContextData(), { extrasDone: true, connected: false });
      const fullDisconnectedText = renderText();
      outcomes.fullContextNoDataDisconnectedHasSingleConnectAction =
        fullDisconnectedText.includes('connect AI when you are ready')
        && fullDisconnectedText.includes('Context complete')
        && !fullDisconnectedText.includes('Step 4 of 4')
        && container.querySelectorAll('[data-chat-empty-action="request-lab-import-provider"]').length === 1
        && container.querySelectorAll('[data-chat-empty-action="open-provider-quiz"]').length === 0
        && !!container.querySelector('.chat-prompt-btn[data-chat-onboarding-action="go-onboarding-step"][data-chat-step="4"]');

      setFixture(partialContextData(), { extrasDone: true });
      const partialText = renderText();
      container.querySelector('[data-chat-empty-action="skip-context-cards"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      outcomes.partialContextNoDataStateMarksPanelActive = panel.classList.contains('chat-onboarding-active');
      outcomes.partialContextNoDataStateRendersProgress = partialText.includes("You've filled 2 of 9 context areas");
      outcomes.partialContextNoDataStateRendersCards = !!container.querySelector('.chat-context-cards');
      outcomes.partialContextNoDataStateKeepsHandoffBelowCards =
        !!container.querySelector('.chat-context-cards + .chat-onboard-actions')
        && !!container.querySelector('[data-chat-empty-action="continue-after-context-cards"]');
      outcomes.partialContextNoDataStateSkipsCards = localStorage.getItem(`labcharts-onboard-context-cards-skipped-${profileId}`) === '1'
        && sessionStorage.getItem(`chat-onboard-force-context-cards-${profileId}`) === null
        && calls.some(call => call[0] === 'render-chat');

      setFixture(baseImportedData({}), { extrasDone: true });
      const initialText = renderText();
      outcomes.initialNoDataStateMarksPanelActive = panel.classList.contains('chat-onboarding-active');
      outcomes.initialNoDataStateRendersCopy = initialText.includes('Add optional context');
      outcomes.initialNoDataStateDoesNotPushImportBeforeCards =
        !!container.querySelector('.chat-context-cards')
        && !!container.querySelector('.chat-context-cards + .chat-onboard-actions')
        && !container.querySelector('[data-chat-empty-action="start-lab-import"]');
      outcomes.initialNoDataStateOffersCardSkip = !!container.querySelector('[data-chat-empty-action="skip-context-cards"]');
      outcomes.initialNoDataStateUsesCompactActionHierarchy =
        container.querySelectorAll('.chat-onboard-step4-actions .chat-onboard-cta').length === 1
        && container.querySelectorAll('.chat-onboard-step4-actions .chat-onboard-text-action').length === 1
        && !!container.querySelector('.chat-onboard-primary-actions')
        && !!container.querySelector('.chat-onboard-primary-actions-single')
        && !!container.querySelector('.chat-onboard-tertiary-actions');
      container.querySelector('[data-chat-empty-action="continue-after-context-cards"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const handoffText = renderText();
      container.querySelector('[data-chat-empty-action="start-lab-import"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      outcomes.contextHandoffAppearsAfterContinueAndStartsLabImport =
        localStorage.getItem(`labcharts-onboard-context-cards-done-${profileId}`) === '1'
        && handoffText.includes('Context cards are saved for later')
        && handoffText.includes('Setup ready')
        && handoffText.includes('import labs or ask what to test')
        && !handoffText.includes('Step 4 of 4')
        && calls.some(call => call[0] === 'input-click' && call[1] === 'pdf-input');

      setFixture(baseImportedData({}), { extrasDone: true, connected: false });
      renderText();
      container.querySelector('[data-chat-empty-action="continue-after-context-cards"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const disconnectedHandoffText = renderText();
      outcomes.contextHandoffDisconnectedUsesSingleConnectAction =
        disconnectedHandoffText.includes('connect AI when you are ready')
        && disconnectedHandoffText.includes('Setup ready')
        && !disconnectedHandoffText.includes('Step 4 of 4')
        && container.querySelectorAll('[data-chat-empty-action="request-lab-import-provider"]').length === 1
        && container.querySelectorAll('[data-chat-empty-action="open-provider-quiz"]').length === 0
        && !!container.querySelector('.chat-prompt-btn[data-chat-onboarding-action="go-onboarding-step"][data-chat-step="4"]');

      setFixture(baseImportedData({}), { extrasDone: true, contextCardsSkipped: true });
      const skippedText = renderText();
      outcomes.skippedContextNoDataStateLeavesPanelInactive = !panel.classList.contains('chat-onboarding-active');
      outcomes.skippedContextNoDataStateOmitsCards = skippedText.includes('Context cards are skipped for now')
        && skippedText.includes('Setup ready')
        && !skippedText.includes('Step 4 of 4')
        && !container.querySelector('.chat-onboard-back-btn[data-chat-onboarding-action="go-onboarding-step"]')
        && !!container.querySelector('.chat-prompt-btn[data-chat-onboarding-action="go-onboarding-step"][data-chat-step="4"]')
        && !container.querySelector('.chat-context-cards');

      setFixture(baseImportedData({}), { extrasDone: true });
      sessionStorage.setItem(`chat-onboard-force-step-${profileId}`, 'provider');
      const forcedProviderText = renderText();
      outcomes.forcedProviderStepShowsConnectedStateWhenProviderExists = forcedProviderText.includes('AI is connected')
        && forcedProviderText.includes('AI connected')
        && !forcedProviderText.includes('Step 2 of 4')
        && forcedProviderText.includes('Continue')
        && !!container.querySelector('[data-chat-onboarding-action="go-onboarding-step"][data-chat-step="3"]')
        && panel.classList.contains('chat-onboarding-active');

      setFixture(baseImportedData({}), { extrasDone: true, connected: false });
      sessionStorage.setItem(`chat-onboard-force-step-${profileId}`, 'provider');
      const forcedDisconnectedProviderText = renderText();
      outcomes.forcedProviderStepShowsPickerWithoutProvider = forcedDisconnectedProviderText.includes('pick how you want to power the AI')
        && panel.classList.contains('chat-onboarding-active');

      setFixture(baseImportedData({}), { extrasDone: true, contextCardsSkipped: true });
      sessionStorage.setItem(`chat-onboard-force-step-${profileId}`, 'extras');
      const forcedExtrasText = renderText();
      outcomes.forcedExtrasStepOverridesDoneFlags = forcedExtrasText.includes('These optional context pieces')
        && panel.classList.contains('chat-onboarding-active');

      setFixture(baseImportedData({}), { extrasDone: true, contextCardsSkipped: true });
      sessionStorage.setItem(`chat-onboard-force-step-${profileId}`, 'cards');
      const forcedCardsText = renderText();
      outcomes.forcedCardsStepOverridesSkippedFlag = forcedCardsText.includes('Add optional context')
        && !!container.querySelector('.chat-context-cards');

      setFixture(labData({}), { extrasDone: true });
      const nudgeText = renderText();
      container.querySelector('[data-chat-empty-action="set-onboarding-focus"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      outcomes.dataContextNudgeStateRendersCopy = nudgeText.includes('I can see your lab results');
      outcomes.dataContextNudgeStateRunsFocusAction = calls.some(call => call[0] === 'focus' && call[1] === 'cards');

      setFixture(labData({}), { extrasDone: true, contextCardsSkipped: true });
      const skippedDataText = renderText();
      outcomes.skippedContextWithLabDataUsesGeneralPrompts =
        !skippedDataText.includes('I can see your lab results')
        && skippedDataText.includes('What are my most concerning results?');

      setFixture(labData({ diagnoses: { conditions: [{ name: 'baseline' }] }, diet: { style: 'high protein' }, exercise: { frequency: 'daily' } }), { extrasDone: true });
      const generalText = renderText();
      outcomes.generalPromptStateLeavesPanelInactive = !panel.classList.contains('chat-onboarding-active');
      outcomes.generalPromptStateUsesDefaultPromptCopy = generalText.includes('What are my most concerning results?');
      outcomes.generalPromptStateRendersPromptButtons = container.querySelectorAll('.chat-prompt-btn').length >= 5;
    } finally {
      state.currentProfile = saved.currentProfile;
      state.profiles = saved.profiles;
      state.profileSex = saved.profileSex;
      state.profileDob = saved.profileDob;
      state.currentChatPersonality = saved.currentChatPersonality;
      state.importedData = saved.importedData;
      data.invalidateActiveDataCache();
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      sessionStorage.clear();
      for (const [key, value] of sessionSnapshot) {
        if (key && value != null) sessionStorage.setItem(key, value);
      }
      chatRuntime.configureChatRuntimeCallbacks(previousChatRuntime);
      configureChatEmptyStateDeps(previousChatEmptyStateDeps);
      Object.assign(window, {
        showNotification: savedFns.showNotification,
      });
      chatOnboarding.configureChatOnboarding({
        closeChatPanel: () => {},
        renderChatMessages: () => {},
        sendChatMessage: () => {},
        setChatNudge: () => {},
        updateChatNudge: () => {},
      });
      HTMLInputElement.prototype.click = savedFns.inputClick;
      Element.prototype.scrollIntoView = savedFns.scrollIntoView;
      container.remove();
      panel.remove();
      if (createdChatInput) chatInput.remove();
      else chatInput.value = savedChatInputValue;
      if (createdPdfInput) pdfInput.remove();
      else pdfInput.value = savedPdfInputValue;
    }

    return outcomes;
  });

  expectAll(results);
});
