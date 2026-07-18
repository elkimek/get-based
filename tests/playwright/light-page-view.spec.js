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
    const { configureLightPageView, renderDashboardLightChannelPills, renderLightSessionLogActions } = await import('/js/light-page-view.js');
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
      };
    } finally {
      configureLightPageView({
        channelDisplay: {},
        weeklyChannelTier: () => 0,
        getSessions: () => [],
        getDevices: () => [],
        getDeviceSessions: () => [],
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

test('Light page today strip and empty-state hints cover adaptive branches', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#main-content');

  const results = await page.evaluate(async ({ lightPageUrl }) => {
    const [{ state }, lightPage, lightEnv, lightTools, sunDefaults] = await Promise.all([
      import('/js/state.js'),
      import(lightPageUrl),
      import('/js/light-env.js'),
      import('/js/light-tools.js'),
      import('/js/sun-defaults.js'),
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
    const syncLightPageDeps = () => lightPage.configureLightPageView({
      channelDisplay,
      weeklyChannelTier,
      channelTier,
      getSessions,
      getDevices,
      getDeviceSessions,
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
      cumulativeMEDToday = () => 0.72;
      cumulativeMEDYesterday = () => 0.4;
      rollingVitaminDIU = () => 1800;
      vitaminDBudgetStatus = () => ({
        supplementIU: 5000,
        sunIU: 1200,
        total: 6200,
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
      outcomes.noSetupStripShowsBurnRisk = morning.includes('approaching burn threshold');
      outcomes.noSetupStripShowsAltitudeChip = morning.includes('+17% UV');
      outcomes.noSetupStripShowsWeeklyVitD = morning.includes('~1800 IU vitamin D this week');
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
      getDevices = () => [];
      getSessions = () => [];
      getDeviceSessions = () => [];
      getSunCoords = () => null;
      syncLightPageDeps();
      lightPage.showLight(state.importedData);
      outcomes.emptyLightPagePromptsForMissingCoords =
        main?.textContent.includes('set your country in the profile editor') === true
        && main?.querySelector('[data-light-page-action="request-precise-location"]') !== null;

      getSunCoords = () => ({ source: 'country-band', lat: 49.2, lon: 16.6 });
      syncLightPageDeps();
      lightPage.showLight(state.importedData);
      outcomes.emptyLightPageShowsCountryBandHint =
        main?.textContent.includes('Calculations use your country (~49.2° lat)') === true;

      // Guidance should interpret logged exposure, not present unused PBM
      // channels as deficiencies or mix product discovery into health advice.
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
        main?.textContent.includes('Guidance') === true
        && main?.textContent.includes('Burn risk and a high-leverage next step') === true
        && main?.textContent.includes('Fill the red 660 nm') === false
        && main?.textContent.includes('Fill the near-IR 810/850 nm') === false
        && main?.querySelector('.rec-channel-deficit') === null
        && main?.querySelector('[id^="light-deficit-rec-slot-"]') === null
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
