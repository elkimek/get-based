import { expect, test } from './coverage-fixture.js';

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

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
