import { expect, test } from './coverage-fixture.js';

function expectAll(outcomes) {
  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
}

test('chat empty-state delegated actions update scoped profile UI', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const [{ renderEmptyChatState }, { state }, { getProfileLocation }] = await Promise.all([
      import('/js/chat-empty-state.js'),
      import('/js/state.js'),
      import('/js/profile.js'),
    ]);

    const saved = {
      currentProfile: state.currentProfile,
      profiles: state.profiles,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      importedData: state.importedData,
      profilesStorage: localStorage.getItem('labcharts-profiles'),
    };
    const savedFns = {
      closeChatPanel: window.closeChatPanel,
      openMenstrualCycleEditor: window.openMenstrualCycleEditor,
      openSupplementsEditor: window.openSupplementsEditor,
      triggerDNAFilePicker: window.triggerDNAFilePicker,
      openSettingsModal: window.openSettingsModal,
    };
    const savedInputClick = HTMLInputElement.prototype.click;
    const chatMessages = document.getElementById('chat-messages');
    const savedChatMessagesHTML = chatMessages?.innerHTML;

    const calls = [];
    const inputClicks = [];
    const container = document.createElement('div');
    const panel = document.createElement('div');
    const strayMtDnaInput = document.createElement('input');
    let bubbledClicks = 0;

    try {
      if (chatMessages) chatMessages.innerHTML = '';

      window.closeChatPanel = () => calls.push('close-chat');
      window.openMenstrualCycleEditor = () => calls.push('open-cycle');
      window.openSupplementsEditor = () => calls.push('open-supplements');
      window.triggerDNAFilePicker = () => calls.push('import-dna');
      window.openSettingsModal = tab => calls.push(`open-settings:${tab}`);
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

      renderEmptyChatState(container, panel);

      const nameInput = container.querySelector('#chat-onboard-name');
      nameInput.value = 'Ada';
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));

      container.querySelector('[data-chat-empty-action="set-profile-sex"][data-sex="female"]')?.click();
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

      renderEmptyChatState(container, panel);
      const bubbledBeforeOptionalActions = bubbledClicks;
      container.querySelector('[data-chat-empty-action="open-cycle-editor"]')?.click();
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
          && calls.includes('open-cycle')
          && calls.includes('open-supplements')
          && calls.includes('import-dna')
          && calls.includes('open-settings:wearables'),
        mtdnaInputScoped: inputClicks.includes('scoped') && !inputClicks.includes('stray'),
        optionalActionsStopPropagation: bubbledClicks === bubbledBeforeOptionalActions,
      };
    } finally {
      state.currentProfile = saved.currentProfile;
      state.profiles = saved.profiles;
      state.profileSex = saved.profileSex;
      state.profileDob = saved.profileDob;
      state.importedData = saved.importedData;
      if (saved.profilesStorage === null) localStorage.removeItem('labcharts-profiles');
      else localStorage.setItem('labcharts-profiles', saved.profilesStorage);
      Object.assign(window, savedFns);
      HTMLInputElement.prototype.click = savedInputClick;
      strayMtDnaInput.remove();
      container.remove();
      panel.remove();
      if (chatMessages && savedChatMessagesHTML != null) chatMessages.innerHTML = savedChatMessagesHTML;
    }
  });

  expectAll(results);
});

test('chat empty-state renders remaining prompt states and actions', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const [
      { renderEmptyChatState, _getNoDataPrompts },
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
      resumeAI: window._resumeAI,
      openChatProviderQuiz: window.openChatProviderQuiz,
      setOnboardingFocus: window.setOnboardingFocus,
      showNotification: window.showNotification,
      inputClick: HTMLInputElement.prototype.click,
      scrollIntoView: Element.prototype.scrollIntoView,
    };
    const outcomes = {};
    const calls = [];
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
      window._resumeAI = () => calls.push(['resume-ai']);
      window.openChatProviderQuiz = () => calls.push(['provider-quiz']);
      window.setOnboardingFocus = focus => calls.push(['focus', focus]);
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
      container.querySelector('[data-chat-empty-action="use-prompt"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const promptInputValue = document.getElementById('chat-input')?.value || '';
      outcomes.fullContextNoDataStateMarksPanelActive = panel.classList.contains('chat-onboarding-active');
      outcomes.fullContextNoDataStateRendersCopy = fullText.includes('filled everything in');
      outcomes.fullContextNoDataPromptFillsInput = promptInputValue.includes('what blood tests should I get');
      outcomes.fullContextNoDataPromptTriggersSend = calls.some(call => call[0] === 'send-chat');

      setFixture(partialContextData(), { extrasDone: true });
      const partialText = renderText();
      container.querySelector('[data-chat-empty-action="scroll-context-cards"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      outcomes.partialContextNoDataStateMarksPanelActive = panel.classList.contains('chat-onboarding-active');
      outcomes.partialContextNoDataStateRendersProgress = partialText.includes("You've filled 2 of 9 context areas");
      outcomes.partialContextNoDataStateRendersCards = !!container.querySelector('.chat-context-cards');
      outcomes.partialContextNoDataStateScrollsCards = calls.some(call => call[0] === 'scroll');

      setFixture(baseImportedData({}), { extrasDone: true });
      const initialText = renderText();
      container.querySelector('[data-chat-empty-action="start-lab-import"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      outcomes.initialNoDataStateMarksPanelActive = panel.classList.contains('chat-onboarding-active');
      outcomes.initialNoDataStateRendersCopy = initialText.includes("You're ready to go");
      outcomes.initialNoDataStateStartsLabImport = calls.some(call => call[0] === 'input-click' && call[1] === 'pdf-input');

      setFixture(labData({}), { extrasDone: true });
      const nudgeText = renderText();
      container.querySelector('[data-chat-empty-action="set-onboarding-focus"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      outcomes.dataContextNudgeStateRendersCopy = nudgeText.includes('I can see your lab results');
      outcomes.dataContextNudgeStateRunsFocusAction = calls.some(call => call[0] === 'focus' && call[1] === 'cards');

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
      Object.assign(window, {
        _resumeAI: savedFns.resumeAI,
        openChatProviderQuiz: savedFns.openChatProviderQuiz,
        setOnboardingFocus: savedFns.setOnboardingFocus,
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
