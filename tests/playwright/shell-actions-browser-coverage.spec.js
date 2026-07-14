import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?shellActionsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openBlankPage(page) {
  await page.route('**/shell-actions-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/shell-actions-browser-coverage', { waitUntil: 'load' });
}

test('shell action delegates cover shell chat file input and keyboard actions', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ shellActionsUrl }) => {
    const shellActions = await import(shellActionsUrl);
    const outcomes = {};
    const calls = [];
    let importRunning = false;
    const previousShellImportDeps = shellActions.configureShellImportDeps({
      isImportRunning: () => importRunning,
      handleImportStatusClick: () => calls.push(['handleImportStatusClick']),
    });
    const originalFns = {
      toggleMobileSidebar: window.toggleMobileSidebar,
      closeMobileSidebar: window.closeMobileSidebar,
      openProfileShareModal: window.openProfileShareModal,
      openTweaksPanel: window.openTweaksPanel,
      openSettingsModal: window.openSettingsModal,
      openFeedbackModal: window.openFeedbackModal,
      toggleChatPanel: window.toggleChatPanel,
      closeChatPanel: window.closeChatPanel,
      toggleThreadRail: window.toggleThreadRail,
      createNewThread: window.createNewThread,
      summarizeThread: window.summarizeThread,
      clearChatHistory: window.clearChatHistory,
      toggleChatFullscreen: window.toggleChatFullscreen,
      togglePersonalityBar: window.togglePersonalityBar,
      setChatPersonality: window.setChatPersonality,
      toggleHDMode: window.toggleHDMode,
      startDiscussion: window.startDiscussion,
      sendChatMessage: window.sendChatMessage,
      filterThreadList: window.filterThreadList,
      setChatWebSearchEnabled: window.setChatWebSearchEnabled,
      handleChatKeydown: window.handleChatKeydown,
    };
    const bind = (name) => {
      window[name] = (...args) => calls.push([name, ...args]);
    };
    const click = (selector) => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      const result = document.querySelector(selector)?.dispatchEvent(event);
      return result === false;
    };

    try {
      document.body.innerHTML = `
        <input id="pdf-input" type="file">
        <input id="chat-image-input" type="file">
        <button id="menu" data-shell-action="toggle-mobile-sidebar"><span id="menu-child">Menu</span></button>
        <button id="close-sidebar" data-shell-action="close-mobile-sidebar"></button>
        <button id="trigger-import" data-shell-action="trigger-import"></button>
        <button id="share-profile" data-shell-action="share-profile"></button>
        <button id="open-tweaks" data-shell-action="open-tweaks"></button>
        <button id="open-settings" data-shell-action="open-settings"></button>
        <button id="open-ai-settings" data-shell-action="open-ai-settings"></button>
        <button id="open-feedback" data-shell-action="open-feedback"></button>
        <button id="import-status" data-shell-action="import-status"></button>
        <button id="unknown-shell" data-shell-action="unknown"></button>
        <button id="chat-toggle" data-chat-action="toggle-panel"></button>
        <button id="chat-close" data-chat-action="close-panel"></button>
        <button id="thread-rail" data-chat-action="toggle-thread-rail"></button>
        <button id="new-thread" data-chat-action="create-thread"></button>
        <button id="summarize" data-chat-action="summarize-thread"></button>
        <button id="clear-history" data-chat-action="clear-history"></button>
        <button id="fullscreen" data-chat-action="toggle-fullscreen"></button>
        <button id="toggle-personality" data-chat-action="toggle-personality" data-chat-key-action="toggle-personality"></button>
        <button id="set-personality" data-chat-action="set-personality" data-personality="house"></button>
        <button id="attach-image" data-chat-action="attach-image"></button>
        <button id="toggle-hd" data-chat-action="toggle-hd"></button>
        <button id="start-discussion" data-chat-action="start-discussion"></button>
        <button id="send-message" data-chat-action="send-message"></button>
        <button id="unknown-chat" data-chat-action="unknown"></button>
        <input id="thread-search" data-chat-input-action="filter-thread-list">
        <input id="websearch" type="checkbox" data-chat-change-action="set-websearch">
        <textarea id="message-input" data-chat-key-action="message-input"></textarea>
      `;
      for (const name of Object.keys(originalFns)) bind(name);
      document.getElementById('pdf-input').addEventListener('click', () => calls.push(['pdf-input-click']));
      document.getElementById('chat-image-input').addEventListener('click', () => calls.push(['chat-image-input-click']));

      shellActions.installShellActionDelegates();
      shellActions.installShellActionDelegates();

      const shellPrevented = [
        click('#menu-child'),
        click('#close-sidebar'),
        click('#trigger-import'),
        click('#share-profile'),
        click('#open-tweaks'),
        click('#open-settings'),
        click('#open-ai-settings'),
        click('#open-feedback'),
        click('#import-status'),
      ];
      const unknownShellPrevented = click('#unknown-shell');
      outcomes.shellActionsDelegateAndPreventDefault =
        shellPrevented.every(Boolean)
        && unknownShellPrevented === false
        && calls.filter(call => call[0] === 'toggleMobileSidebar').length === 1
        && calls.some(call => call[0] === 'closeMobileSidebar')
        && calls.some(call => call[0] === 'pdf-input-click')
        && calls.some(call => call[0] === 'openProfileShareModal')
        && calls.some(call => call[0] === 'openTweaksPanel')
        && calls.some(call => call[0] === 'openSettingsModal' && call[1] === undefined)
        && calls.some(call => call[0] === 'openSettingsModal' && call[1] === 'ai')
        && calls.some(call => call[0] === 'openFeedbackModal')
        && calls.some(call => call[0] === 'handleImportStatusClick');

      const pickerClicksBeforeRunningImport = calls.filter(call => call[0] === 'pdf-input-click').length;
      const statusClicksBeforeRunningImport = calls.filter(call => call[0] === 'handleImportStatusClick').length;
      importRunning = true;
      const runningImportPrevented = click('#trigger-import');
      outcomes.runningImportClickOpensStatusInsteadOfPicker = runningImportPrevented === true
        && calls.filter(call => call[0] === 'pdf-input-click').length === pickerClicksBeforeRunningImport
        && calls.filter(call => call[0] === 'handleImportStatusClick').length === statusClicksBeforeRunningImport + 1;

      const chatPrevented = [
        click('#chat-toggle'),
        click('#chat-close'),
        click('#thread-rail'),
        click('#new-thread'),
        click('#summarize'),
        click('#clear-history'),
        click('#fullscreen'),
        click('#toggle-personality'),
        click('#set-personality'),
        click('#attach-image'),
        click('#toggle-hd'),
        click('#start-discussion'),
        click('#send-message'),
      ];
      const unknownChatPrevented = click('#unknown-chat');
      outcomes.chatActionsDelegateAndPreventDefault =
        chatPrevented.every(Boolean)
        && unknownChatPrevented === false
        && calls.some(call => call[0] === 'toggleChatPanel')
        && calls.some(call => call[0] === 'closeChatPanel')
        && calls.some(call => call[0] === 'toggleThreadRail')
        && calls.some(call => call[0] === 'createNewThread')
        && calls.some(call => call[0] === 'summarizeThread')
        && calls.some(call => call[0] === 'clearChatHistory')
        && calls.some(call => call[0] === 'toggleChatFullscreen')
        && calls.some(call => call[0] === 'togglePersonalityBar')
        && calls.some(call => call[0] === 'setChatPersonality' && call[1] === 'house')
        && calls.some(call => call[0] === 'chat-image-input-click')
        && calls.some(call => call[0] === 'toggleHDMode')
        && calls.some(call => call[0] === 'startDiscussion')
        && calls.some(call => call[0] === 'sendChatMessage');

      const search = document.getElementById('thread-search');
      search.value = 'ferritin';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      search.value = 'vitamin d';
      search.dispatchEvent(new Event('search', { bubbles: true }));
      const websearch = document.getElementById('websearch');
      websearch.checked = true;
      websearch.dispatchEvent(new Event('change', { bubbles: true }));
      outcomes.inputSearchAndChangeActionsDelegate =
        calls.some(call => call[0] === 'filterThreadList' && call[1] === 'ferritin')
        && calls.some(call => call[0] === 'filterThreadList' && call[1] === 'vitamin d')
        && calls.some(call => call[0] === 'setChatWebSearchEnabled' && call[1] === true);

      const messageKey = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      document.getElementById('message-input').dispatchEvent(messageKey);
      const personalityEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      document.getElementById('toggle-personality').dispatchEvent(personalityEnter);
      const personalitySpace = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      document.getElementById('toggle-personality').dispatchEvent(personalitySpace);
      const personalityEscape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      document.getElementById('toggle-personality').dispatchEvent(personalityEscape);
      outcomes.keyboardActionsDelegateAndGuardKeys =
        calls.some(call => call[0] === 'handleChatKeydown' && call[1]?.key === 'Enter')
        && calls.filter(call => call[0] === 'togglePersonalityBar').length === 3
        && personalityEnter.defaultPrevented === true
        && personalitySpace.defaultPrevented === true
        && personalityEscape.defaultPrevented === false;
    } finally {
      shellActions.configureShellImportDeps(previousShellImportDeps);
      for (const [name, value] of Object.entries(originalFns)) {
        if (value === undefined) delete window[name];
        else window[name] = value;
      }
      document.body.innerHTML = '';
    }

    return outcomes;
  }, {
    shellActionsUrl: moduleUrl('/js/shell-actions.js'),
  });

  const expectedOutcomeKeys = [
    'shellActionsDelegateAndPreventDefault',
    'runningImportClickOpensStatusInsteadOfPicker',
    'chatActionsDelegateAndPreventDefault',
    'inputSearchAndChangeActionsDelegate',
    'keyboardActionsDelegateAndGuardKeys',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('app refresh callback uses configured shell dependencies', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async () => {
    const [{ state }, data, appEvents] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/app-event-listeners.js'),
      import('/js/app-shell-hooks.js'),
    ]);
    const calls = [];
    const saved = {
      currentView: state.currentView,
      importedData: state.importedData,
    };
    const previous = appEvents.configureAppEventListeners({
      navigate: route => calls.push(['navigate', route]),
      updateChatNudge: () => calls.push(['updateChatNudge']),
    });

    try {
      document.body.innerHTML = '<nav id="sidebar-nav"></nav>';
      state.currentView = 'labs';
      state.importedData = { entries: [], customMarkers: {} };
      data.invalidateActiveDataCache();
      appEvents.registerAppRefreshCallback();
      data._runRegisteredRefreshCallback();
      return {
        navigatesCurrentView: calls.some(call => call[0] === 'navigate' && call[1] === 'labs'),
        updatesChatNudge: calls.some(call => call[0] === 'updateChatNudge'),
        buildsSidebarAgainstSameDataModule: document.querySelectorAll('#sidebar-nav .nav-item').length > 0,
      };
    } finally {
      appEvents.configureAppEventListeners(previous);
      state.currentView = saved.currentView;
      state.importedData = saved.importedData;
      data.invalidateActiveDataCache();
      document.body.innerHTML = '';
    }
  });

  expect(results).toEqual({
    navigatesCurrentView: true,
    updatesChatNudge: true,
    buildsSidebarAgainstSameDataModule: true,
  });
});
