import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lightPageViewCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('Light page view delegates session, link, channel, and prompt actions', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(async () => {
    const { state } = await import('/js/state.js');
    return !!state;
  });

  const results = await page.evaluate(async () => {
    const { configureLightPageView, renderDashboardLightChannelPills, renderLightLiveSession, renderLightSessionLogActions } = await import('/js/light-page-view.js');
    const calls = [];
    const host = document.createElement('div');
    const channelDisplay = {
      vitamin_d: { label: 'Vitamin D', icon: 'D', what: 'Vitamin D', dailyTarget: 100 },
      circadian: { label: 'Circadian', icon: 'C', what: 'Circadian', dailyTarget: 100 },
      nir_solar: { label: 'NIR', icon: 'N', what: 'NIR', dailyTarget: 100 },
      no_cv: { label: 'NO', icon: 'NO', what: 'Nitric oxide', dailyTarget: 100 },
      pomc: { label: 'POMC', icon: 'P', what: 'POMC', dailyTarget: 100 },
      violet_eye: { label: 'Violet', icon: 'V', what: 'Violet', dailyTarget: 100 },
    };

    try {
      configureLightPageView({
        channelDisplay,
        weeklyChannelTier: () => 0,
        getSessions: () => [],
        getDevices: () => [],
        getDeviceSessions: () => [],
        getActiveDeviceSession: () => null,
        getActiveSession: () => null,
        rollingChannelTotals: () => ({}),
        rollingDeviceTotals: () => ({}),
        openChannelOnLightPage: channel => calls.push(['open-channel', channel]),
        quickLogSunSession: () => calls.push(['quick-log-sun']),
        quickLogDeviceSession: () => calls.push(['quick-log-device']),
        openAddDeviceDialog: () => calls.push(['open-add-device']),
        openDetailedSessionDialog: () => calls.push(['open-detailed-session']),
        navigate: route => calls.push(['navigate', route]),
        requestPreciseLocation: () => calls.push(['request-precise-location']),
        openLightEnvironmentAssessment: () => calls.push(['open-light-environment']),
        renderLightTools: () => '<section id="light-tools-expanded-test">Expanded tools</section>',
      });
      document.body.appendChild(host);
      host.innerHTML = `
        ${renderLightSessionLogActions()}
        ${renderLightLiveSession({ includeEmptyState: true })}
        ${renderDashboardLightChannelPills()}
        <a href="#light-test" data-light-page-action="navigate-light">Open Light</a>
        <a href="#precise-test" data-light-page-action="request-precise-location">Use precise location</a>
        <button type="button" data-light-page-action="quick-log-device">Device</button>
        <button type="button" data-light-page-action="open-light-environment">Environment</button>
        <button type="button" data-light-page-action="expand-light-tools">Tools</button>
        <div class="light-widget-prompt light-tools-section-collapsed">Collapsed tools</div>
      `;

      host.querySelector('[data-light-page-action="quick-log-sun"]')?.click();
      host.querySelector('[data-light-page-action="quick-log-device"]')?.click();
      host.querySelector('[data-light-page-action="open-add-device"]')?.click();
      host.querySelector('[data-light-page-action="open-detailed-session"]')?.click();
      host.querySelector('[data-light-page-action="open-channel"][data-channel]')?.click();
      host.querySelector('[data-light-page-action="open-light-environment"]')?.click();

      const navLink = host.querySelector('a[data-light-page-action="navigate-light"]');
      const navEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      navLink?.dispatchEvent(navEvent);
      const preciseLink = host.querySelector('a[data-light-page-action="request-precise-location"]');
      const preciseEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      preciseLink?.dispatchEvent(preciseEvent);

      host.querySelector('[data-light-page-action="expand-light-tools"]')?.click();

      configureLightPageView({
        getDevices: () => [{ id: 'panel-1' }],
        getActiveDeviceSession: () => ({ id: 'active-device' }),
        getActiveSession: () => null,
      });
      const deviceActiveActions = renderLightSessionLogActions();

      return {
        noInlineHandlers: !host.querySelector('[onclick],[onchange],[oninput],[onkeydown],[onkeyup],[onsubmit]'),
        usesDataActions: !!host.querySelector('[data-light-page-action="quick-log-sun"]')
          && !!host.querySelector('[data-light-page-action="open-channel"][data-channel]'),
        sessionAndDashboardActions: calls.some(c => c[0] === 'quick-log-sun')
          && calls.some(c => c[0] === 'quick-log-device')
          && calls.some(c => c[0] === 'open-add-device')
          && calls.some(c => c[0] === 'open-detailed-session')
          && calls.some(c => c[0] === 'open-channel' && c[1]),
        linkActions: navEvent.defaultPrevented
          && preciseEvent.defaultPrevented
          && calls.some(c => c[0] === 'navigate' && c[1] === 'light')
          && calls.some(c => c[0] === 'request-precise-location'),
        promptActions: calls.some(c => c[0] === 'open-light-environment')
          && !!document.getElementById('light-tools-expanded-test'),
        liveWidgetEmptyStateNavigatesToLight: host.textContent.includes('No light session is running')
          && !!host.querySelector('.light-live-session-empty [data-light-page-action="navigate-light"]'),
        activeDeviceDoesNotOfferImpossibleSecondTimer: deviceActiveActions.includes('Start sun session')
          && !deviceActiveActions.includes('Start device session'),
      };
    } finally {
      configureLightPageView({
        channelDisplay: {},
        weeklyChannelTier: () => 0,
        getSessions: () => [],
        getDevices: () => [],
        getDeviceSessions: () => [],
        getActiveDeviceSession: () => null,
        getActiveSession: () => null,
        rollingChannelTotals: () => ({}),
        rollingDeviceTotals: () => ({}),
        openChannelOnLightPage: () => {},
        quickLogSunSession: () => {},
        quickLogDeviceSession: () => {},
        openAddDeviceDialog: () => {},
        openDetailedSessionDialog: () => {},
        navigate: () => {},
        requestPreciseLocation: () => {},
        openLightEnvironmentAssessment: () => {},
        renderLightTools: () => '',
      });
      host.remove();
      document.getElementById('light-tools-expanded-test')?.remove();
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Light live-session renderer shares the full active card with dashboard placement', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const lightPage = await import('/js/light-page-view.js');
    const activeSun = {
      id: 'shared-live-sun',
      startedAt: Date.now() - 90_000,
      endedAt: null,
      safety: { fitzpatrick: 'III' },
      bodyExposure: { fraction: 0.12, regions: ['face'] },
      eyeExposure: { mode: 'indirect' },
    };
    lightPage.configureLightPageView({
      getActiveSession: () => activeSun,
      renderSunSessionRow: session => `<section class="shared-live-card" data-id="${session.id}"><span class="sun-session-vitd">Vitamin D estimate</span></section>`,
      renderActiveDeviceSessionCard: () => '',
    });
    const pageHtml = lightPage.renderLightLiveSession();
    const dashboardHtml = lightPage.renderLightLiveSession({ includeEmptyState: true });
    lightPage.configureLightPageView({
      getActiveSession: () => null,
      renderSunSessionRow: () => '',
      renderActiveDeviceSessionCard: () => '',
    });
    return {
      activeCardIsIdenticalAcrossPlacements: pageHtml === dashboardHtml,
      activeCardKeepsLiveSessionId: pageHtml.includes('data-id="shared-live-sun"'),
      vitaminDEstimateIsPresent: pageHtml.includes('Vitamin D estimate'),
    };
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Live sun card keeps vitamin D visible without horizontal overflow at dashboard widths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const [{ loadLightSunUI }, sunUI] = await Promise.all([
      import('/js/light-sun-loader.js'),
      import('/js/sun-session-ui.js'),
    ]);
    await loadLightSunUI();
    sunUI.configureSunSessionUI({
      eyeModes: [{ key: 'indirect', label: 'Indirect daylight' }],
      summarizeBodyExposure: () => 'Face, arms · 22% skin',
      formatElapsed: () => '18:42',
      channelDisplay: {
        vitamin_d: { label: 'Vitamin D', icon: 'D' },
        pomc: { label: 'POMC', icon: 'P' },
        no_cv: { label: 'Nitric oxide', icon: 'N' },
        violet_eye: { label: 'Violet eye', icon: 'V' },
        circadian: { label: 'Circadian', icon: 'C' },
        nir_solar: { label: 'Near infrared', icon: 'IR' },
      },
      channelTier: value => value > 0 ? 2 : 0,
      tierLabel: tier => tier > 0 ? 'building' : 'none',
      renderSessionAIInline: () => '',
    });
    const sessionHtml = sunUI.renderSunSessionRow({
      id: 'responsive-live-sun',
      startedAt: Date.now() - 1_122_000,
      endedAt: null,
      bodyExposure: { fraction: 0.22, regions: ['face', 'arms-front'] },
      eyeExposure: { mode: 'indirect' },
      safety: { medFraction: 0.28, fitzpatrick: 'III' },
      doses: { vitamin_d: 80, pomc: 55, no_cv: 50, violet_eye: 40, circadian: 35, nir_solar: 30 },
    });
    const host = document.createElement('section');
    host.className = 'dashboard-widget dashboard-widget-full';
    host.dataset.widgetId = 'light-live-session';
    host.innerHTML = `<div class="dashboard-widget-body"><div class="light-active-session-pinned">${sessionHtml}</div></div>`;
    document.body.appendChild(host);

    const widths = [1100, 720, 360];
    const measurements = [];
    for (const width of widths) {
      host.style.width = `${width}px`;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const card = host.querySelector('.sun-session');
      const readouts = host.querySelector('.sun-session-live-readouts');
      const vitaminD = host.querySelector('.sun-session-vitd');
      const cardRect = card.getBoundingClientRect();
      const vitaminRect = vitaminD.getBoundingClientRect();
      measurements.push({
        cardFits: card.scrollWidth <= card.clientWidth + 1,
        readoutsFit: readouts.scrollWidth <= readouts.clientWidth + 1,
        vitaminInsideCard: vitaminRect.left >= cardRect.left - 1 && vitaminRect.right <= cardRect.right + 1,
      });
    }
    const readouts = host.querySelector('.sun-session-live-readouts');
    const result = {
      allDashboardWidthsFit: measurements.every(item => Object.values(item).every(Boolean)),
      readoutsWrap: getComputedStyle(readouts).flexWrap === 'wrap',
      vitaminDHasPriority: readouts.firstElementChild?.classList.contains('sun-session-vitd') === true,
      activeCardHasNoDeleteAction: !host.querySelector('.sun-session-delete'),
    };
    host.remove();
    return result;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Light page today strip and empty-state hints cover adaptive branches', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#main-content');

  const results = await page.evaluate(async ({ lightPageUrl }) => {
    const [{ state }, lightPage, lightEnv, lightTools, sunDefaults, settingsPrivacy] = await Promise.all([
      import('/js/state.js'),
      import(lightPageUrl),
      import('/js/light-env.js'),
      import('/js/light-tools.js'),
      import('/js/sun-defaults.js'),
      import('/js/settings-privacy.js'),
    ]);
    const outcomes = {};
    const RealDate = Date;
    const main = document.getElementById('main-content');
    let renderEnvironmentAssessmentSummary = lightEnv.renderEnvironmentAssessmentSummary;
    let renderLightTools = lightTools.renderLightTools;
    const saved = {
      importedData: state.importedData,
      mainHTML: main?.innerHTML,
      Date: window.Date,
    };
    let channelDisplay = {};
    let weeklyChannelTier = () => 0;
    let channelTier = () => 0;
    let getSessions = () => [];
    let getActiveSession = () => null;
    let getActiveDeviceSession = () => null;
    let rollingChannelTotals = () => ({});
    let cumulativeMEDToday = () => 0;
    let cumulativeMEDYesterday = () => 0;
    let rollingVitaminDIU = () => 0;
    let vitaminDBudgetStatus = () => null;
    let getSunCoords = () => null;
    let getDevices = () => [];
    let getDeviceSessions = () => [];
    let rollingDeviceTotals = () => ({});
    let renderDevicesSection = () => '';
    let renderLightTodayDashboardChip = () => '';
    let renderLightTodayHero = () => '';
    let renderSunSetupCard = sunDefaults.renderSetupCard;
    let renderSunDataSourceSettings = settingsPrivacy.renderSunDataSourceSettings;
    const syncLightPageDeps = () => lightPage.configureLightPageView({
      channelDisplay,
      weeklyChannelTier,
      channelTier,
      getSessions,
      getDevices,
      getDeviceSessions,
      getActiveDeviceSession,
      getActiveSession,
      rollingChannelTotals,
      rollingDeviceTotals,
      cumulativeMEDToday,
      cumulativeMEDYesterday,
      rollingVitaminDIU,
      vitaminDBudgetStatus,
      getSunCoords,
      renderLightTodayDashboardChip,
      renderLightTodayHero,
      renderSunSetupCard,
      renderSunDataSourceSettings,
      renderDevicesSection,
      renderEnvironmentAssessmentSummary,
      renderLightTools,
    });
    const setHour = (hour) => {
      const fixed = new RealDate(`2026-06-11T${String(hour).padStart(2, '0')}:15:00`);
      class FixedDate extends RealDate {
        constructor(...args) {
          if (args.length) return super(...args);
          return new RealDate(fixed);
        }

        static now() { return fixed.getTime(); }
      }
      FixedDate.UTC = RealDate.UTC;
      FixedDate.parse = RealDate.parse;
      window.Date = FixedDate;
    };
    const channelMeta = {
      vitamin_d: { label: 'Vitamin D', icon: 'D', what: 'Vitamin D', dailyTarget: 100 },
      circadian: { label: 'Circadian', icon: 'C', what: 'Circadian', dailyTarget: 100 },
      nir_solar: { label: 'NIR', icon: 'N', what: 'Near infrared', dailyTarget: 100 },
      no_cv: { label: 'NO', icon: 'NO', what: 'Nitric oxide', dailyTarget: 100 },
      pomc: { label: 'POMC', icon: 'P', what: 'POMC', dailyTarget: 100 },
      violet_eye: { label: 'Violet', icon: 'V', what: 'Violet eye', dailyTarget: 100 },
    };

    try {
      state.importedData = {
        ...(state.importedData || {}),
        sunDefaults: null,
        lightEnvironment: null,
      };
      channelDisplay = channelMeta;
      weeklyChannelTier = value => value > 100 ? 2 : 0;
      channelTier = weeklyChannelTier;
      rollingChannelTotals = () => ({ vitamin_d: 250, circadian: 40 });
      rollingDeviceTotals = () => ({ nir_solar: 120 });
      getSessions = () => [];
      getDeviceSessions = () => [];
      getDevices = () => [];
      getActiveSession = () => null;
      getActiveDeviceSession = () => null;
      cumulativeMEDToday = () => 0.72;
      cumulativeMEDYesterday = () => 0.4;
      rollingVitaminDIU = () => 1800;
      vitaminDBudgetStatus = () => ({
        supplementIU: 5000,
        sunIU: 1200,
        sunIUEquivalent: 1200,
        totalIntakeIU: 5000,
        total: 5000,
        exceedsSupplementUL: true,
      });
      getSunCoords = () => ({ lat: 50, lon: 14, altitudeM: 1700, source: 'profile-precise' });
      renderLightTodayDashboardChip = () => '<div class="light-dashboard-chip-test">chip</div>';
      syncLightPageDeps();

      setHour(6);
      const morning = lightPage.renderLightTodayStrip();
      setHour(12);
      const midday = lightPage.renderLightTodayStrip();
      setHour(18);
      const evening = lightPage.renderLightTodayStrip();
      outcomes.solarWindowLabelsRenderByTime =
        morning.includes('Morning sun window')
        && midday.includes('Midday window')
        && evening.includes('Evening sun window');
      outcomes.noSetupStripShowsSetupCta = morning.includes('Set up Light');
      outcomes.noSetupStripShowsBurnRisk = morning.includes('approaching the base MED reference');
      outcomes.noSetupStripShowsAltitudeChip = morning.includes('+17% UV');
      outcomes.noSetupStripShowsWeeklyVitD = morning.includes('~1800 IU-eq vitamin D estimate this week');
      outcomes.vitaminDDisplayDoesNotAddSunlightToOralIntake =
        morning.includes('Logged vitamin D supplements: 5k IU')
        && morning.includes('6.2k') === false;
      outcomes.noSetupStripShowsDashboardChip = morning.includes('light-dashboard-chip-test');

      state.importedData = {
        ...(state.importedData || {}),
        sunDefaults: { completedAt: '2026-06-11T00:00:00.000Z', fitzpatrick: 'II' },
        lightEnvironment: { rooms: [] },
      };
      setHour(22);
      getDevices = () => [{ brand: 'Joovv', model: 'Solo' }];
      syncLightPageDeps();
      const oneDevice = lightPage.renderLightTodayStrip();
      getDevices = () => [{ brand: 'Joovv', model: 'Solo' }, { brand: 'SAD', model: 'Desk' }];
      syncLightPageDeps();
      const manyDevices = lightPage.renderLightTodayStrip();
      getDevices = () => [];
      syncLightPageDeps();
      const noDevices = lightPage.renderLightTodayStrip();
      outcomes.nonSolarCtasAdaptToDeviceAndRoomState =
        oneDevice.includes('Joovv Solo')
        && manyDevices.includes('Device <span aria-hidden="true">▼</span>')
        && noDevices.includes('Log a sun session')
        && oneDevice.includes('Map a room');

      setHour(10);
      getActiveSession = () => ({ id: 'active-sun', startedAt: Date.now() - 95_000 });
      syncLightPageDeps();
      const activeStrip = lightPage.renderLightTodayStrip();
      outcomes.activeSessionStripShowsStopElapsed =
        activeStrip.includes('Stop session')
        && activeStrip.includes('data-live-elapsed-for="active-sun"');

      renderLightTodayHero = () => '';
      renderSunSetupCard = () => '<div class="setup-card-test">setup</div>';
      renderDevicesSection = () => '<div class="devices-section-test">devices</div>';
      renderEnvironmentAssessmentSummary = () => '';
      renderLightTools = () => '';
      getActiveSession = () => null;
      getActiveDeviceSession = () => null;
      getDevices = () => [];
      getSessions = () => [];
      getDeviceSessions = () => [];
      getSunCoords = () => null;
      syncLightPageDeps();
      lightPage.showLight(state.importedData);
      outcomes.emptyLightPagePromptsForMissingCoords =
        main?.textContent.includes('set your country in the profile editor') === true
        && main?.querySelector('[data-light-page-action="request-precise-location"]') !== null;
      const emptyWeeklyReview = main?.querySelector('[data-widget-id="light-guidance"]');
      outcomes.emptyLightPageKeepsWeeklyReviewWithoutTreatingNoLogsAsNoExposure =
        emptyWeeklyReview?.textContent.includes('No outdoor or device sessions were logged in the past 7 days') === true
        && emptyWeeklyReview?.textContent.includes('We can’t tell whether you received little light or simply didn’t record it') === true
        && emptyWeeklyReview?.querySelector('[data-light-page-action="quick-log-sun"]') !== null;
      outcomes.doseMethodLivesInMethodsAndConditionsStaySituational =
        main?.querySelector('.light-safety-basis') === null
        && main?.querySelector('[data-widget-id="light-conditions-now"] .light-dose-method') === null
        && main?.querySelector('[data-widget-id="light-conditions-now"] .conditions-now-footnote') === null
        && main?.querySelector('[data-widget-id="light-conditions-now"] #manual-uvi-input') === null
        && main?.querySelector('[data-widget-id="light-methods"] .light-explainer')?.hasAttribute('open') === false
        && main?.querySelector('[data-widget-id="light-methods"] #manual-uvi-input') === null
        && main?.querySelector('[data-widget-id="light-methods"]')?.textContent.includes('useful transition window') === true
        && main?.querySelector('[data-widget-id="light-methods"]')?.textContent.includes('Fitzpatrick II') === true
        && main?.querySelector('[data-widget-id="light-methods"]')?.textContent.includes('does not make the dose safer') === true
        && main?.querySelector('[data-widget-id="light-methods"]')?.textContent.includes('not a personal safe exposure time') === true
        && main?.querySelector('[data-widget-id="light-methods"]')?.textContent.includes('never stay longer just to raise an estimate') === true;
      outcomes.methodsSeparateResearchContextFromSafetyMath =
        main?.querySelector('[data-widget-id="light-methods"]')?.textContent.includes('published photobiology') === true
        && main?.querySelector('[data-widget-id="light-methods"]')?.textContent.includes('cited primary or institutional sources') === true
        && main?.querySelector('[data-widget-id="light-methods"]')?.textContent.includes('remain labeled as modeled or under study') === true;

      renderDevicesSection = () => Promise.reject(new Error('devices failed'));
      renderEnvironmentAssessmentSummary = () => { throw new Error('environment failed'); };
      renderLightTools = () => { throw new Error('tools failed'); };
      getDevices = () => [{ id: 'saved-device' }];
      syncLightPageDeps();
      lightPage.showLight(state.importedData);
      await new Promise(resolve => setTimeout(resolve, 0));
      outcomes.lazyWidgetFailuresReplaceLoadingStatesWithoutClaimingDataLoss =
        main?.textContent.includes('Devices could not load') === true
        && main?.textContent.includes('Assessment could not load') === true
        && main?.textContent.includes('Measurement tools could not load') === true
        && main?.textContent.includes('Your saved device data was not removed') === true
        && main?.querySelectorAll('.light-widget-loading').length === 0;
      renderDevicesSection = () => '<div class="devices-section-test">devices</div>';
      renderEnvironmentAssessmentSummary = () => '';
      renderLightTools = () => '';
      getDevices = () => [];

      getSunCoords = () => ({ source: 'country-band', lat: 49.2, lon: 16.6 });
      syncLightPageDeps();
      lightPage.showLight(state.importedData);
      outcomes.emptyLightPageShowsCountryBandHint =
        main?.textContent.includes('Calculations use your country (~49.2° lat)') === true;

      // The weekly review should interpret logged exposure, not present
      // unused channels as deficiencies or mix product discovery into advice.
      getSessions = () => Array.from({ length: 7 }, (_, index) => ({
        id: `sun-${index}`,
        startedAt: Date.now() - (index + 1) * 86_400_000,
        endedAt: Date.now() - (index + 1) * 86_400_000 + 600_000,
      }));
      rollingChannelTotals = () => ({ vitamin_d: 250, circadian: 40 });
      rollingDeviceTotals = () => ({ pbm_red: 0, pbm_nir: 0 });
      syncLightPageDeps();
      lightPage.showLight(state.importedData);
      const guidance = main?.querySelector('[data-widget-id="light-guidance"], #light-guidance');
      outcomes.guidanceKeepsProductsOutOfExposureAdvice =
        main?.textContent.includes('Weekly Light Review') === true
        && main?.textContent.includes('What your past 7 days show, what changed, and one conservative next step') === true
        && main?.textContent.includes('Fill the red 660 nm') === false
        && main?.textContent.includes('Fill the near-IR 810/850 nm') === false
        && main?.querySelector('.rec-channel-deficit') === null
        && main?.querySelector('[id^="light-deficit-rec-slot-"]') === null
        && guidance?.querySelector('.light-med-banner') === null
        && main?.querySelector('[data-widget-id="light-today"] .light-med-banner') !== null
        && guidance !== null;
    } finally {
      state.importedData = saved.importedData;
      if (main && saved.mainHTML != null) main.innerHTML = saved.mainHTML;
      window.Date = saved.Date || RealDate;
      channelDisplay = {};
      weeklyChannelTier = () => 0;
      channelTier = () => 0;
      getSessions = () => [];
      getActiveSession = () => null;
      rollingChannelTotals = () => ({});
      cumulativeMEDToday = () => 0;
      cumulativeMEDYesterday = () => 0;
      rollingVitaminDIU = () => 0;
      vitaminDBudgetStatus = () => null;
      getSunCoords = () => null;
      getDevices = () => [];
      getDeviceSessions = () => [];
      rollingDeviceTotals = () => ({});
      renderDevicesSection = () => '';
      renderEnvironmentAssessmentSummary = lightEnv.renderEnvironmentAssessmentSummary;
      renderLightTools = lightTools.renderLightTools;
      renderLightTodayDashboardChip = () => '';
      renderLightTodayHero = () => '';
      renderSunSetupCard = sunDefaults.renderSetupCard;
      syncLightPageDeps();
    }

    return outcomes;
  }, {
    lightPageUrl: moduleUrl('/js/light-page-view.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
