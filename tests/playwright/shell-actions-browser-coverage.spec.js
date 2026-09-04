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
    const settingsBridge = await import('/js/settings-runtime-bridge.js');
    const outcomes = {};
    const calls = [];
    let importRunning = false;
    const previousShellImportDeps = shellActions.configureShellImportDeps({
      isImportRunning: () => importRunning,
      handleImportStatusClick: () => calls.push(['handleImportStatusClick']),
    });
    const previousShellFeedbackDeps = shellActions.configureShellFeedbackDeps({
      openFeedbackModal: () => calls.push(['openFeedbackModal']),
    });
    const previousShellProfileShareDeps = shellActions.configureShellProfileShareDeps({
      openProfileShareModal: (...args) => calls.push(['openProfileShareModal', ...args]),
    });
    const previousShellChatActionDeps = shellActions.configureShellChatActionDeps({
      closeChatPanel: () => calls.push(['closeChatPanel']),
      clearChatHistory: () => calls.push(['clearChatHistory']),
      handleChatKeydown: event => calls.push(['handleChatKeydown', event]),
      sendChatMessage: () => calls.push(['sendChatMessage']),
      setChatBackendFromUI: backend => calls.push(['setChatBackendFromUI', backend]),
      setChatPersonality: personality => calls.push(['setChatPersonality', personality]),
      setChatWebSearchEnabled: enabled => calls.push(['setChatWebSearchEnabled', enabled]),
      startDiscussion: () => calls.push(['startDiscussion']),
      summarizeThread: () => calls.push(['summarizeThread']),
      toggleChatPanel: () => calls.push(['toggleChatPanel']),
      toggleChatFullscreen: () => calls.push(['toggleChatFullscreen']),
      togglePersonalityBar: () => calls.push(['togglePersonalityBar']),
    });
    const previousShellChatThreadDeps = shellActions.configureShellChatThreadDeps({
      createThreadProject: () => calls.push(['createThreadProject']),
      createNewThread: () => calls.push(['createNewThread']),
      filterThreadList: value => calls.push(['filterThreadList', value]),
      setChatThreadSort: value => calls.push(['setChatThreadSort', value]),
      toggleThreadRail: () => calls.push(['toggleThreadRail']),
    });
    const previousShellNavDeps = shellActions.configureShellNavDeps({
      toggleMobileSidebar: () => calls.push(['toggleMobileSidebar']),
      closeMobileSidebar: () => calls.push(['closeMobileSidebar']),
    });
    const previousSettingsBridge = settingsBridge.configureSettingsModuleBridge({
      openTweaksPanel: (...args) => calls.push(['openTweaksPanel', ...args]),
      openSettingsModal: (...args) => calls.push(['openSettingsModal', ...args]),
    });
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
        <button id="open-feedback" data-shell-action="open-feedback"></button>
        <button id="import-status" data-shell-action="import-status"></button>
        <button id="unknown-shell" data-shell-action="unknown"></button>
        <button id="chat-toggle" data-chat-action="toggle-panel"></button>
        <button id="chat-close" data-chat-action="close-panel"></button>
        <button id="thread-rail" data-chat-action="toggle-thread-rail"></button>
        <button id="new-thread" data-chat-action="create-thread"></button>
        <button id="new-project" data-chat-action="create-project"></button>
        <button id="summarize" data-chat-action="summarize-thread"></button>
        <button id="clear-history" data-chat-action="clear-history"></button>
        <button id="fullscreen" data-chat-action="toggle-fullscreen"></button>
        <button id="toggle-personality" data-chat-action="toggle-personality" data-chat-key-action="toggle-personality"></button>
        <button id="set-personality" data-chat-action="set-personality" data-personality="house"></button>
        <details id="composer-menu" open><button id="attach-image" data-chat-action="attach-image"></button></details>
        <details id="import-menu" open><button id="import-health-file" data-chat-action="import-health-file"></button></details>
        <button id="open-chat-context" data-chat-action="open-chat-context"></button>
        <button id="start-discussion" data-chat-action="start-discussion"></button>
        <button id="send-message" data-chat-action="send-message"></button>
        <button id="unknown-chat" data-chat-action="unknown"></button>
        <input id="thread-search" data-chat-input-action="filter-thread-list">
        <input id="websearch" type="checkbox" data-chat-change-action="set-websearch">
        <select id="chat-backend" data-chat-change-action="set-backend"><option value="codex">Codex</option></select>
        <select id="thread-sort" data-chat-change-action="sort-thread-list"><option value="name">Name</option></select>
        <textarea id="message-input" data-chat-key-action="message-input"></textarea>
      `;
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
        click('#new-project'),
        click('#summarize'),
        click('#clear-history'),
        click('#fullscreen'),
        click('#toggle-personality'),
        click('#set-personality'),
        click('#attach-image'),
        click('#import-health-file'),
        click('#open-chat-context'),
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
        && calls.some(call => call[0] === 'createThreadProject')
        && calls.some(call => call[0] === 'summarizeThread')
        && calls.some(call => call[0] === 'clearChatHistory')
        && calls.some(call => call[0] === 'toggleChatFullscreen')
        && calls.some(call => call[0] === 'togglePersonalityBar')
        && calls.some(call => call[0] === 'setChatPersonality' && call[1] === 'house')
        && calls.some(call => call[0] === 'chat-image-input-click')
        && calls.filter(call => call[0] === 'pdf-input-click').length >= 2
        && document.getElementById('composer-menu')?.open === false
        && document.getElementById('import-menu')?.open === false
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
      const chatBackend = document.getElementById('chat-backend');
      chatBackend.value = 'codex';
      chatBackend.dispatchEvent(new Event('change', { bubbles: true }));
      const threadSort = document.getElementById('thread-sort');
      threadSort.value = 'name';
      threadSort.dispatchEvent(new Event('change', { bubbles: true }));
      outcomes.inputSearchAndChangeActionsDelegate =
        calls.some(call => call[0] === 'filterThreadList' && call[1] === 'ferritin')
        && calls.some(call => call[0] === 'filterThreadList' && call[1] === 'vitamin d')
        && calls.some(call => call[0] === 'setChatWebSearchEnabled' && call[1] === true)
        && calls.some(call => call[0] === 'setChatBackendFromUI' && call[1] === 'codex')
        && calls.some(call => call[0] === 'setChatThreadSort' && call[1] === 'name');

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
      shellActions.configureShellNavDeps(previousShellNavDeps);
      shellActions.configureShellImportDeps(previousShellImportDeps);
      shellActions.configureShellFeedbackDeps(previousShellFeedbackDeps);
      shellActions.configureShellProfileShareDeps(previousShellProfileShareDeps);
      shellActions.configureShellChatActionDeps(previousShellChatActionDeps);
      shellActions.configureShellChatThreadDeps(previousShellChatThreadDeps);
      settingsBridge.configureSettingsModuleBridge(previousSettingsBridge);
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
  await page.route('**/js/pdf-import-commit.js', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      export function confirmImport() {
        window.__shellHookPdfImportConfirmed = true;
        return 'confirmed';
      }
    `,
  }));
  await page.route('**/js/pdf-import-review.js', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      export function closeImportModal() {
        window.__shellHookImportModalClosed = true;
      }
    `,
  }));
  await openBlankPage(page);

  const results = await page.evaluate(async () => {
    const [{ state }, data, appEvents, apiRuntime, pdfImportReviewRuntime] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/app-event-listeners.js'),
      import('/js/api-runtime.js'),
      import('/js/pdf-import-review-runtime.js'),
    ]);
    await import('/js/app-shell-hooks.js');
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
      const dialogDelegated = apiRuntime.showOpenRouterInsufficientBalanceDialogRuntime();
      const importConfirmed = await pdfImportReviewRuntime.confirmImportFromRuntime();
      document.body.insertAdjacentHTML('beforeend', `
        <div id="import-modal-overlay" class="show">
          <div id="import-modal"></div>
        </div>
      `);
      appEvents.installGlobalEventListeners();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      for (let attempt = 0; attempt < 50 && !document.getElementById('or-no-balance-overlay'); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      for (let attempt = 0; attempt < 50 && !window.__shellHookImportModalClosed; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return {
        navigatesCurrentView: calls.some(call => call[0] === 'navigate' && call[1] === 'labs'),
        updatesChatNudge: calls.some(call => call[0] === 'updateChatNudge'),
        buildsSidebarAgainstSameDataModule: document.querySelectorAll('#sidebar-nav .nav-item').length > 0,
        apiRuntimeUsesComposedBalanceDialog: dialogDelegated
          && document.getElementById('or-no-balance-overlay')?.getAttribute('aria-hidden') !== 'true',
        pdfImportActionsUseComposedLazyDelegates:
          importConfirmed === 'confirmed'
          && window.__shellHookPdfImportConfirmed === true
          && window.__shellHookImportModalClosed === true,
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
    apiRuntimeUsesComposedBalanceDialog: true,
    pdfImportActionsUseComposedLazyDelegates: true,
  });
});
