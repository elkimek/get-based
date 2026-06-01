// test-chat-empty-state-dom.js - live DOM coverage for chat empty-state delegates.
//
// Run: fetch('tests/test-chat-empty-state-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Chat Empty State DOM ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

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
  const calls = [];
  const inputClicks = [];
  const container = document.createElement('div');
  const panel = document.createElement('div');
  const strayMtDnaInput = document.createElement('input');
  let bubbledClicks = 0;
  const chatMessages = document.getElementById('chat-messages');
  const savedChatMessagesHTML = chatMessages?.innerHTML;
  const savedInputClick = HTMLInputElement.prototype.click;

  try {
    // Previous chat DOM tests can leave onboarding controls with the same
    // document-level ids that chat-onboarding helpers query. Clear that host
    // so this fixture is the only onboarding form in the document.
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
    assert('renderEmptyChatState installs container delegates',
      container.dataset.chatEmptyDelegates === '1');
    assert('rendered profile onboarding has no inline event attributes',
      !container.querySelector('[onclick],[onchange],[oninput],[onkeydown],[onkeyup],[onsubmit]'));
    assert('profile onboarding marks panel active',
      panel.classList.contains('chat-onboarding-active'));

    const nameInput = container.querySelector('#chat-onboard-name');
    nameInput.value = 'Ada';
    nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    assert('Name change delegates to saveChatProfile',
      state.profiles[0]?.name === 'Ada');

    container.querySelector('[data-chat-empty-action="set-profile-sex"][data-sex="female"]')?.click();
    assert('Sex click delegates to setChatProfileSex',
      state.profileSex === 'female'
        && container.querySelector('[data-sex="female"]')?.classList.contains('active'));
    assert('Non-panel-closing actions keep normal click bubbling',
      bubbledClicks > 0);

    const heightInput = container.querySelector('#chat-onboard-height');
    const heightUnit = container.querySelector('#chat-onboard-height-unit');
    heightInput.value = '180';
    heightUnit.value = 'in';
    heightUnit.dispatchEvent(new Event('change', { bubbles: true }));
    assert('Height unit change delegates to onboardHeightUnitChanged',
      heightInput.value === '70.9');

    const countryInput = container.querySelector('#chat-onboard-country');
    countryInput.value = 'Germany';
    countryInput.dispatchEvent(new Event('input', { bubbles: true }));
    assert('Country input delegates to saveChatLocation',
      getProfileLocation('chat-empty-test').country === 'Germany');

    renderEmptyChatState(container, panel);
    const bubbledBeforeOptionalActions = bubbledClicks;
    container.querySelector('[data-chat-empty-action="open-cycle-editor"]')?.click();
    container.querySelector('[data-chat-empty-action="open-supplements-editor"]')?.click();
    container.querySelector('[data-chat-empty-action="import-dna"]')?.click();
    container.querySelector('[data-chat-empty-action="import-mtdna"]')?.click();
    container.querySelector('[data-chat-empty-action="open-wearables-settings"]')?.click();
    assert('Optional task buttons delegate through scoped actions',
      calls.includes('close-chat')
        && calls.includes('open-cycle')
        && calls.includes('open-supplements')
        && calls.includes('import-dna')
        && calls.includes('open-settings:wearables'));
    assert('mtDNA import delegates to the file input in the chat empty-state container',
      inputClicks.includes('scoped') && !inputClicks.includes('stray'));
    assert('Optional task buttons keep panel-closing clicks from bubbling',
      bubbledClicks === bubbledBeforeOptionalActions);
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

  console.log(`\n%c Chat Empty State DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-chat-empty-state-dom'] = { pass, fail };
})();
