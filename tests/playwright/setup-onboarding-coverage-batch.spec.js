import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?setupOnboardingCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('Light setup overlay covers location refresh, score, save, edit, and skip paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ sunDefaultsUrl }) => {
    const [sunDefaults, sunDefaultsRuntime, { state }, data] = await Promise.all([
      import(sunDefaultsUrl),
      import('/js/sun-defaults-runtime.js'),
      import('/js/state.js'),
      import('/js/data.js'),
    ]);
    const sunDefaultsRuntimeSrc = await fetch('/js/sun-defaults-runtime.js').then(response => response.text());
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (selector, label = selector) => {
      for (let i = 0; i < 80; i += 1) {
        const el = document.querySelector(selector);
        if (el) return el;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 80; i += 1) {
        if (predicate()) return;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const sessionSnapshot = new Map(Array.from({ length: sessionStorage.length }, (_, i) => {
      const key = sessionStorage.key(i);
      return [key, sessionStorage.getItem(key)];
    }));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
    };
    const calls = [];
    const outcomes = {};
    let precise = false;
    const previousSunDefaultsRuntimeDeps = sunDefaultsRuntime.configureSunDefaultsRuntimeDeps({
      getProfileLocation: () => ({ country: 'Czechia', zip: '' }),
      navigate: route => calls.push(['navigate', route]),
      openProfileLocationEditor: () => calls.push(['profile-location']),
      openClientList: () => calls.push(['client-list']),
      getSunCoords: () => precise
        ? { source: 'profile-precise', lat: 50.087 }
        : { source: 'country-band', lat: 49.2 },
      requestPreciseLocation: async () => {
        calls.push(['precise-location']);
        await wait(0);
        precise = true;
        return { lat: 50.087, lon: 14.421 };
      },
    });

    try {
      state.currentProfile = 'setup-onboarding-coverage';
      state.profileSex = null;
      state.profileDob = null;
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        lightCircadian: null,
        sunDefaults: {},
      };
      data.invalidateActiveDataCache();

      sunDefaults.configureSunDefaults({
        maybeAnalyzeOnboardingAfterSave: () => calls.push(['onboarding-ai']),
        renderOnboardingAIBlock: () => '<div id="setup-ai-block">AI setup block</div>',
      });

      const promptHost = document.createElement('div');
      promptHost.id = 'setup-prompt-render-host';
      promptHost.innerHTML = sunDefaults.renderSetupCard();
      document.body.appendChild(promptHost);
      outcomes.initialSetupPromptRendersActions =
        promptHost.querySelector('.light-setup-prompt')?.textContent.includes('Set up your light assumptions')
        && !!promptHost.querySelector('.light-widget-prompt-cta')
        && !!promptHost.querySelector('.dashboard-action-btn');
      outcomes.sunDefaultsRuntimeUsesInjectedNavigation =
        sunDefaultsRuntimeSrc.includes('sunDefaultsRuntimeDeps.navigate?.(route)')
        && !sunDefaultsRuntimeSrc.includes('getViewRuntimeFunction');
      promptHost.querySelector('.light-widget-prompt-cta')?.click();
      await waitFor('#light-setup-focus-overlay');
      promptHost.remove();
      outcomes.overlayShowsProfileLocationEstimate =
        document.querySelector('.light-setup-location-status')?.textContent.includes('Profile estimate')
        && document.querySelector('.light-setup-location-status')?.textContent.includes('Czechia');

      document.querySelector('.light-setup-location-actions button:nth-child(2)')?.click();
      await waitUntil(
        () => document.querySelector('.light-setup-location-status')?.textContent.includes('Precise location saved'),
        'precise location status'
      );
      outcomes.preciseLocationRefreshUpdatesStatus =
        calls.some(call => call[0] === 'precise-location')
        && document.querySelector('.light-setup-location-status')?.textContent.includes('highest accuracy');

      document.querySelector('.light-setup-save-btn')?.click();
      await wait(0);
      outcomes.emptySaveBlocksOnSkinType =
        document.querySelector('.light-setup-focus-modal')?.dataset.setupStep === 'core'
        && state.importedData.sunDefaults.completedAt == null
        && Array.from(document.querySelectorAll('.notification-toast'))
          .some(toast => toast.textContent.includes('Tap a face'));

      const defaultFace = /** @type {HTMLElement | null} */ (document.querySelector('.ctx-skin-face[data-idx="2"]'));
      defaultFace?.focus();
      defaultFace?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      const nextFace = /** @type {HTMLElement | null} */ (document.querySelector('.ctx-skin-face[data-idx="3"]'));
      nextFace?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      await wait(0);
      document.querySelector('[data-choice-group="setup-photosensitive"][data-value="severe"]')?.click();
      document.querySelector('[data-choice-group="setup-homelight"][data-value="led-warm"]')?.click();
      document.querySelector('[data-choice-group="setup-eyewear"][data-value="sunglasses"]')?.click();
      outcomes.coreChoicesUpdateProgressAndAria =
        document.getElementById('setup-skin-range')?.dataset.set === '1'
        && document.querySelector('.light-setup-progress')?.textContent.trim() === '3/3 done'
        && document.querySelector('[data-choice-group="setup-eyewear"][data-value="sunglasses"]')?.getAttribute('aria-pressed') === 'true';

      document.querySelector('.light-setup-next-btn')?.click();
      await wait(0);
      outcomes.stepTabsSwitchToScorePane =
        document.querySelector('.light-setup-focus-modal')?.dataset.setupStep === 'score'
        && document.querySelector('[data-setup-tab="score"]')?.getAttribute('aria-selected') === 'true'
        && document.querySelector('[data-setup-pane="core"]')?.hasAttribute('hidden');

      document.querySelector('input[data-ott="morning-light-deficit"]')?.click();
      document.querySelector('input[data-ott="dim-workspace"]')?.click();
      await wait(0);
      outcomes.scoreMeterUpdatesFromCheckedCards =
        document.getElementById('ott-running-value')?.textContent.trim() === '2/10'
        && document.getElementById('ott-summary-score')?.textContent.trim() === '8/10 aligned'
        && document.querySelector('input[data-ott="dim-workspace"]')?.closest('.light-setup-ott-card')?.classList.contains('is-flagged');

      document.querySelector('.light-setup-save-btn')?.click();
      await waitUntil(() => !document.getElementById('light-setup-focus-overlay'), 'saved overlay close');
      outcomes.savePersistsSetupAndMirrorsContext =
        state.importedData.sunDefaults.fitzpatrick === 'IV'
        && state.importedData.sunDefaults.photosensitiveMeds === 'severe'
        && state.importedData.sunDefaults.homeLight === 'led-warm'
        && state.importedData.sunDefaults.eyewear === 'sunglasses'
        && state.importedData.sunDefaults.ottScore === 2
        && state.importedData.sunDefaults.ott?.['morning-light-deficit'] === true
        && state.importedData.lightCircadian?.skinType?.startsWith('IV')
        && calls.some(call => call[0] === 'onboarding-ai')
        && calls.some(call => call[0] === 'navigate' && call[1] === 'light');

      const host = document.createElement('div');
      host.id = 'setup-card-render-host';
      host.innerHTML = sunDefaults.renderSetupCard();
      document.body.appendChild(host);
      outcomes.savedSummaryIncludesBannerAndAiBlock =
        host.querySelector('.light-setup-summary')?.textContent.includes('Your light setup')
        && host.querySelector('.light-setup-photo-banner')?.textContent.includes('Severe photosensitizer')
        && !!host.querySelector('#setup-ai-block');

      host.querySelector('.light-setup-summary-edit')?.click();
      await waitFor('#light-setup-focus-overlay', 'edit setup overlay');
      outcomes.summaryEditReopensCompletedOverlay =
        document.querySelector('.light-setup-save-btn')?.textContent.trim() === 'Save changes';
      document.querySelector('.modal-close')?.click();
      await waitUntil(() => !document.getElementById('light-setup-focus-overlay'), 'cancel edit overlay close');
      host.remove();

      sunDefaults.reopenSunSetup();
      await waitFor('#light-setup-focus-overlay');
      document.querySelector('.light-setup-location-actions button:first-child')?.click();
      await wait(0);
      outcomes.profileLocationActionClosesOverlayAndOpensProfile =
        !document.getElementById('light-setup-focus-overlay')
        && calls.some(call => call[0] === 'profile-location');

      state.importedData.sunDefaults = {};
      sunDefaults.reopenSunSetup();
      await waitFor('#light-setup-focus-overlay');
      document.querySelector('.light-setup-skip-btn')?.click();
      await waitUntil(() => !document.getElementById('light-setup-focus-overlay'), 'skip overlay close');
      outcomes.skipPersistsDefaultAndNavigatesLight =
        state.importedData.sunDefaults.fitzpatrick === 'III'
        && state.importedData.sunDefaults.skipped === true
        && calls.filter(call => call[0] === 'navigate' && call[1] === 'light').length >= 2;
    } finally {
      document.getElementById('light-setup-focus-overlay')?.remove();
      document.getElementById('setup-prompt-render-host')?.remove();
      document.getElementById('setup-card-render-host')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      state.profileSex = saved.profileSex;
      state.profileDob = saved.profileDob;
      data.invalidateActiveDataCache();
      sunDefaults.configureSunDefaults({
        maybeAnalyzeOnboardingAfterSave: () => {},
        renderOnboardingAIBlock: () => '',
      });
      sunDefaultsRuntime.configureSunDefaultsRuntimeDeps(previousSunDefaultsRuntimeDeps);
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      sessionStorage.clear();
      for (const [key, value] of sessionSnapshot) {
        if (key && value != null) sessionStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, { sunDefaultsUrl: '/js/sun-defaults.js' });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('dashboard onboarding covers profile save, dismissal, focus modes, and AI reminder actions', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ onboardingUrl }) => {
    const [onboarding, { state }, profile, data, crypto, chatRuntime, onboardingRuntime] = await Promise.all([
      import(onboardingUrl),
      import('/js/state.js'),
      import('/js/profile.js'),
      import('/js/data.js'),
      import('/js/crypto.js'),
      import('/js/chat-runtime.js'),
      import('/js/onboarding-view-runtime.js'),
    ]);
    const onboardingRuntimeSrc = await fetch('/js/onboarding-view-runtime.js').then(response => response.text());
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 80; i += 1) {
        if (predicate()) return;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const sessionSnapshot = new Map(Array.from({ length: sessionStorage.length }, (_, i) => {
      const key = sessionStorage.key(i);
      return [key, sessionStorage.getItem(key)];
    }));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
      profiles: clone(state.profiles),
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      scrollIntoView: Element.prototype.scrollIntoView,
    };
    const outcomes = {};
    const calls = [];
    const previousChatRuntime = chatRuntime.configureChatRuntimeCallbacks({
      renderChatMessages: () => calls.push(['render-chat']),
    });
    const previousOnboardingRuntime = onboardingRuntime.configureOnboardingViewRuntimeDeps({
      buildSidebar: payload => calls.push(['sidebar', !!payload]),
      navigate: (route, payload) => calls.push(['navigate', route, !!payload]),
      openChatPanel: () => calls.push(['open-chat']),
    });
    const host = document.createElement('div');
    host.id = 'onboarding-coverage-host';
    let cards = null;
    let importTarget = null;

    try {
      document.body.appendChild(host);
      state.currentProfile = 'onboarding-coverage';
      state.profiles = [{
        id: state.currentProfile,
        name: 'Onboarding coverage',
        sex: null,
        dob: null,
        location: { country: '', zip: '' },
        tags: [],
        notes: '',
        status: 'active',
        createdAt: 1,
        lastUpdated: 1,
        pinned: false,
      }];
      state.profileSex = null;
      state.profileDob = null;
      state.importedData = profile.createDefaultProfileData();
      data.invalidateActiveDataCache();
      onboarding.configureOnboardingView({ navigate: null });

      const onboardedKey = profile.profileStorageKey(state.currentProfile, 'onboarded');
      localStorage.removeItem(onboardedKey);
      host.innerHTML = onboarding.renderOnboardingBanner();
      outcomes.bannerRendersProfileStep =
        !!host.querySelector('#onboarding-banner')
        && host.querySelector('.onboarding-title')?.textContent.includes('Set up your profile');
      outcomes.bannerUsesDelegatedActions =
        host.querySelector('.onboarding-sex-btn[data-onboarding-sex="female"]')?.getAttribute('data-onboarding-action') === 'set-sex'
        && host.querySelector('.onboarding-save-btn')?.getAttribute('data-onboarding-action') === 'save-profile'
        && host.querySelector('.onboarding-skip-btn')?.getAttribute('data-onboarding-action') === 'dismiss-profile'
        && !host.querySelector('.onboarding-sex-btn')?.hasAttribute('onclick')
        && !host.querySelector('.onboarding-save-btn')?.hasAttribute('onclick')
        && !host.innerHTML.includes('onclick=');

      host.querySelector('.onboarding-sex-btn[data-onboarding-sex="female"]')?.click();
      host.querySelector('#onboarding-dob').value = '1990-04-05';
      host.querySelector('.onboarding-save-btn')?.click();
      await waitUntil(
        () => localStorage.getItem(onboardedKey) === 'profile-set'
          && calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard'),
        'durable onboarding profile save',
      );
      outcomes.profileSavePersistsAndNavigates =
        localStorage.getItem(onboardedKey) === 'profile-set'
        && state.profileSex === 'female'
        && state.profileDob === '1990-04-05'
        && calls.some(call => call[0] === 'sidebar' && call[1])
        && calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard' && call[2])
        && Array.from(document.querySelectorAll('.notification-toast'))
          .some(toast => toast.textContent.includes('Profile set up'));
      outcomes.onboardingRuntimeUsesInjectedViewCallbacks =
        onboardingRuntimeSrc.includes('onboardingViewRuntimeDeps.buildSidebar?.(data)')
        && onboardingRuntimeSrc.includes('onboardingViewRuntimeDeps.navigate')
        && !onboardingRuntimeSrc.includes('getViewRuntimeFunction');
      outcomes.bannerSuppressesAfterProfileSet = onboarding.renderOnboardingBanner() === '';

      localStorage.removeItem(onboardedKey);
      state.profileSex = null;
      state.profileDob = null;
      host.innerHTML = onboarding.renderOnboardingBanner();
      host.querySelector('.onboarding-skip-btn')?.click();
      outcomes.dismissOnboardingStoresChoiceAndAnimates =
        localStorage.getItem(onboardedKey) === 'dismissed'
        && host.querySelector('#onboarding-banner')?.style.opacity === '0';
      await waitUntil(() => !host.querySelector('#onboarding-banner'), 'onboarding banner removal');

      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      localStorage.removeItem('labcharts-openrouter-key');
      crypto.updateKeyCache('labcharts-openrouter-key', '');
      const providerSkipKey = `labcharts-onboard-provider-skipped-${state.currentProfile}`;
      const reminderDismissKey = profile.profileStorageKey(state.currentProfile, 'ai-reminder-dismissed');
      localStorage.setItem(providerSkipKey, '1');
      localStorage.removeItem(reminderDismissKey);
      host.innerHTML = onboarding.renderAIConnectionReminder();
      outcomes.aiReminderRendersWhenProviderSkipped =
        !!host.querySelector('#ai-reminder-banner')
        && host.querySelector('.ai-reminder-cta')?.textContent.includes('Connect now')
        && host.querySelector('.ai-reminder-cta')?.getAttribute('data-onboarding-action') === 'open-provider-quiz'
        && host.querySelector('.ai-reminder-dismiss')?.getAttribute('data-onboarding-action') === 'dismiss-ai-reminder'
        && !host.querySelector('.ai-reminder-cta')?.hasAttribute('onclick')
        && !host.innerHTML.includes('onclick=');

      sessionStorage.setItem(`chat-onboard-provider-branch-${state.currentProfile}`, 'manual');
      host.querySelector('.ai-reminder-cta')?.click();
      outcomes.providerQuizClearsSkipAndOpensChat =
        localStorage.getItem(providerSkipKey) == null
        && sessionStorage.getItem(`chat-onboard-provider-requested-${state.currentProfile}`) === '1'
        && sessionStorage.getItem(`chat-onboard-provider-branch-${state.currentProfile}`) == null
        && calls.some(call => call[0] === 'open-chat')
        && calls.some(call => call[0] === 'render-chat');

      localStorage.setItem(providerSkipKey, '1');
      localStorage.removeItem(reminderDismissKey);
      host.innerHTML = onboarding.renderAIConnectionReminder();
      host.querySelector('.ai-reminder-dismiss')?.click();
      outcomes.dismissAiReminderStoresDismissal =
        localStorage.getItem(reminderDismissKey) === '1'
        && host.querySelector('#ai-reminder-banner')?.style.opacity === '0';
      await waitUntil(() => !host.querySelector('#ai-reminder-banner'), 'AI reminder removal');

      const scrolled = [];
      Element.prototype.scrollIntoView = function scrollIntoViewStub(options) {
        scrolled.push([this.className || this.id || this.tagName, options?.block || null]);
      };
      document.body.classList.add('chat-fullscreen');
      localStorage.setItem('labcharts-chat-fullscreen', 'true');
      cards = document.createElement('div');
      cards.className = 'profile-context-cards';
      importTarget = document.createElement('button');
      importTarget.className = 'welcome-direct-import-btn';
      document.body.append(cards, importTarget);

      onboarding.setOnboardingFocus('cards');
      await waitUntil(
        () => scrolled.some(call => String(call[0]).includes('profile-context-cards') && call[1] === 'start'),
        'cards focus scroll'
      );
      outcomes.cardsFocusSetsClassStorageAndScroll =
        document.body.classList.contains('cards-focus')
        && !document.body.classList.contains('chat-fullscreen')
        && localStorage.getItem('labcharts-chat-fullscreen') === 'false'
        && sessionStorage.getItem(`chat-onboard-force-context-cards-${state.currentProfile}`) === '1'
        && scrolled.some(call => String(call[0]).includes('profile-context-cards') && call[1] === 'start');

      onboarding.setOnboardingFocus('import');
      await waitUntil(
        () => scrolled.some(call => (
          String(call[0]).includes('welcome-direct-import-btn')
          || String(call[0]).includes('welcome-primary-panel')
        ) && call[1] === 'center'),
        'import focus scroll'
      );
      outcomes.importFocusReplacesClassAndScrollsImportTarget =
        !document.body.classList.contains('cards-focus')
        && document.body.classList.contains('import-focus')
        && scrolled.some(call => (
          String(call[0]).includes('welcome-direct-import-btn')
          || String(call[0]).includes('welcome-primary-panel')
        ) && call[1] === 'center');

      onboarding.setOnboardingFocus('');
      outcomes.blankFocusClearsFocusClasses =
        !document.body.classList.contains('cards-focus')
        && !document.body.classList.contains('import-focus');
    } finally {
      cards?.remove();
      importTarget?.remove();
      host.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      document.body.classList.remove('cards-focus', 'import-focus', 'chat-fullscreen');
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      state.profiles = saved.profiles;
      state.profileSex = saved.profileSex;
      state.profileDob = saved.profileDob;
      data.invalidateActiveDataCache();
      onboarding.configureOnboardingView({ navigate: null });
      chatRuntime.configureChatRuntimeCallbacks(previousChatRuntime);
      onboardingRuntime.configureOnboardingViewRuntimeDeps(previousOnboardingRuntime);
      Element.prototype.scrollIntoView = saved.scrollIntoView;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      sessionStorage.clear();
      for (const [key, value] of sessionSnapshot) {
        if (key && value != null) sessionStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, { onboardingUrl: moduleUrl('/js/onboarding-view.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('dashboard welcome hero uses delegated actions for chat import settings and demos', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#main-content', { state: 'attached' });

  const results = await page.evaluate(async ({ dashboardPageUrl }) => {
    const [dashboardPage, { state }, profile, data, settingsBridge] = await Promise.all([
      import(dashboardPageUrl),
      import('/js/state.js'),
      import('/js/profile.js'),
      import('/js/data.js'),
      import('/js/settings-runtime-bridge.js'),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
      chatHistory: clone(state.chatHistory),
      demoLoadingProfileId: window._demoLoadingProfileId,
      mainHtml: document.getElementById('main-content')?.innerHTML || '',
    };
    const calls = [];
    const outcomes = {};
    let hadPdfInput = false;
    let previousDashboardPageRuntimeDeps = null;
    const previousSettingsBridge = settingsBridge.configureSettingsModuleBridge({
      openSettingsModal: tab => calls.push(['settings', tab]),
    });

    try {
      state.currentProfile = 'dashboard-welcome-delegates';
      state.importedData = profile.createDefaultProfileData();
      state.chatHistory = [{ role: 'user', content: 'existing setup thread' }];
      data.invalidateActiveDataCache();
      delete window._demoLoadingProfileId;

      localStorage.setItem(profile.profileStorageKey(state.currentProfile, 'emptyTour'), 'completed');
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'false');

      previousDashboardPageRuntimeDeps = dashboardPage.configureDashboardPageRuntimeDeps({
        closeChatPanel: () => calls.push(['close-chat']),
        loadDemoData: sex => calls.push(['demo', sex]),
        openChatPanel: () => calls.push(['open-chat']),
      });

      let pdfInput = document.getElementById('pdf-input');
      hadPdfInput = !!pdfInput;
      if (!pdfInput) {
        pdfInput = document.createElement('input');
        pdfInput.id = 'pdf-input';
        pdfInput.type = 'file';
        pdfInput.hidden = true;
        document.body.appendChild(pdfInput);
      }
      pdfInput.addEventListener('click', () => calls.push(['pdf-input']));

      const view = dashboardPage.createDashboardPageView({
        setupDropZone: () => calls.push(['setup-drop-zone']),
        markerHasData: () => false,
        buildDashboardWidgetContext: activeData => ({ data: activeData }),
        getDashboardWidgetPrefs: () => ({}),
        getVisibleDashboardWidgetEntries: () => [],
        renderOnboardingBanner: () => '',
        renderAIConnectionReminder: () => '',
        renderDashboardStickyControls: () => '',
        renderDashboardControlButtons: () => '',
        renderDashboardWidget: () => '',
        isDashboardOrganizeMode: () => false,
        loadFocusCard: () => calls.push(['focus-card']),
        startEmptyTour: () => calls.push(['tour']),
      });

      view.showDashboard({ dates: [], categories: {} });
      const main = document.getElementById('main-content');
      const primary = main.querySelector('.welcome-action-primary');
      const directImport = main.querySelector('.welcome-direct-import-btn');
      const demoCards = main.querySelectorAll('.demo-card');

      primary?.click();
      directImport?.click();
      demoCards[0]?.click();
      demoCards[1]?.click();

      outcomes.importReadyWelcomeActionsDelegate =
        primary?.getAttribute('data-dashboard-welcome-action') === 'open-chat'
        && directImport?.getAttribute('data-dashboard-welcome-action') === 'direct-import'
        && demoCards[0]?.getAttribute('data-dashboard-welcome-action') === 'load-demo'
        && demoCards[0]?.getAttribute('data-dashboard-welcome-demo') === 'female'
        && demoCards[1]?.getAttribute('data-dashboard-welcome-demo') === 'male'
        && calls.some(call => call[0] === 'open-chat')
        && calls.some(call => call[0] === 'pdf-input')
        && calls.some(call => call[0] === 'demo' && call[1] === 'female')
        && calls.some(call => call[0] === 'demo' && call[1] === 'male')
        && !primary?.hasAttribute('onclick')
        && !directImport?.hasAttribute('onclick')
        && !Array.from(demoCards).some(card => card.hasAttribute('onclick'))
        && !main.innerHTML.includes('onclick=');

      localStorage.setItem('labcharts-ai-paused', 'true');
      view.showDashboard({ dates: [], categories: {} });
      const reenable = main.querySelector('.welcome-action-btn:not(.welcome-action-primary)');
      reenable?.click();
      outcomes.pausedWelcomeActionDelegatesSettings =
        reenable?.getAttribute('data-dashboard-welcome-action') === 'open-ai-settings'
        && calls.some(call => call[0] === 'close-chat')
        && calls.some(call => call[0] === 'settings' && call[1] === 'ai')
        && !reenable?.hasAttribute('onclick')
        && !main.innerHTML.includes('onclick=');
    } finally {
      const main = document.getElementById('main-content');
      if (main) main.innerHTML = saved.mainHtml;
      if (!hadPdfInput) document.getElementById('pdf-input')?.remove();
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      state.chatHistory = saved.chatHistory;
      data.invalidateActiveDataCache();
      if (saved.demoLoadingProfileId === undefined) delete window._demoLoadingProfileId;
      else window._demoLoadingProfileId = saved.demoLoadingProfileId;
      if (previousDashboardPageRuntimeDeps) {
        dashboardPage.configureDashboardPageRuntimeDeps(previousDashboardPageRuntimeDeps);
      }
      settingsBridge.configureSettingsModuleBridge(previousSettingsBridge);
      document.body.classList.remove('empty-dashboard-active', 'chat-autostart-reserved');
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, { dashboardPageUrl: moduleUrl('/js/dashboard-page-view.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
