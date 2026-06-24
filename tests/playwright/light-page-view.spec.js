import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lightPageViewCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('Light page view delegates session, link, channel, and prompt actions', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.navigate === 'function');

  const results = await page.evaluate(async () => {
    const { configureLightPageView, renderDashboardLightChannelPills, renderLightSessionLogActions } = await import('/js/light-page-view.js');
    const savedFns = {
      dailyChannelBreakdown: window.dailyChannelBreakdown,
    };
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
      window.dailyChannelBreakdown = () => Array.from({ length: 7 }, (_, i) => ({
        sun: i === 0 ? 10 : 0,
        device: 0,
      }));

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
      window.dailyChannelBreakdown = savedFns.dailyChannelBreakdown;
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
    const [{ state }, lightPage, lightEnv] = await Promise.all([
      import('/js/state.js'),
      import(lightPageUrl),
      import('/js/light-env.js'),
    ]);
    const outcomes = {};
    const RealDate = Date;
    const main = document.getElementById('main-content');
    let renderEnvironmentAssessmentSummary = lightEnv.renderEnvironmentAssessmentSummary;
    const saved = {
      importedData: state.importedData,
      mainHTML: main?.innerHTML,
      Date: window.Date,
      getSessions: window.getSessions,
      getDeviceSessions: window.getDeviceSessions,
      getDevices: window.getDevices,
      getActiveSession: window.getActiveSession,
      cumulativeMEDToday: window.cumulativeMEDToday,
      cumulativeMEDYesterday: window.cumulativeMEDYesterday,
      rollingVitaminDIU: window.rollingVitaminDIU,
      vitaminDBudgetStatus: window.vitaminDBudgetStatus,
      getSunCoords: window.getSunCoords,
      CHANNEL_DISPLAY: window.CHANNEL_DISPLAY,
      weeklyChannelTier: window.weeklyChannelTier,
      channelTier: window.channelTier,
      dailyChannelBreakdown: window.dailyChannelBreakdown,
      rollingChannelTotals: window.rollingChannelTotals,
      rollingDeviceTotals: window.rollingDeviceTotals,
      renderSunSetupCard: window.renderSunSetupCard,
      renderDevicesSection: window.renderDevicesSection,
      renderLightTools: window.renderLightTools,
    };
    let renderLightTodayDashboardChip = () => '';
    let renderLightTodayHero = () => '';
    const syncLightPageDeps = () => lightPage.configureLightPageView({
      channelDisplay: window.CHANNEL_DISPLAY || {},
      weeklyChannelTier: typeof window.weeklyChannelTier === 'function' ? window.weeklyChannelTier : () => 0,
      channelTier: typeof window.channelTier === 'function' ? window.channelTier : () => 0,
      getSessions: typeof window.getSessions === 'function' ? window.getSessions : () => [],
      getDevices: typeof window.getDevices === 'function' ? window.getDevices : () => [],
      getDeviceSessions: typeof window.getDeviceSessions === 'function' ? window.getDeviceSessions : () => [],
      getActiveSession: typeof window.getActiveSession === 'function' ? window.getActiveSession : () => null,
      rollingChannelTotals: typeof window.rollingChannelTotals === 'function' ? window.rollingChannelTotals : () => ({}),
      rollingDeviceTotals: typeof window.rollingDeviceTotals === 'function' ? window.rollingDeviceTotals : () => ({}),
      cumulativeMEDToday: typeof window.cumulativeMEDToday === 'function' ? window.cumulativeMEDToday : () => 0,
      cumulativeMEDYesterday: typeof window.cumulativeMEDYesterday === 'function' ? window.cumulativeMEDYesterday : () => 0,
      rollingVitaminDIU: typeof window.rollingVitaminDIU === 'function' ? window.rollingVitaminDIU : () => 0,
      vitaminDBudgetStatus: typeof window.vitaminDBudgetStatus === 'function' ? window.vitaminDBudgetStatus : () => null,
      getSunCoords: typeof window.getSunCoords === 'function' ? window.getSunCoords : () => null,
      renderLightTodayDashboardChip,
      renderLightTodayHero,
      renderSunSetupCard: typeof window.renderSunSetupCard === 'function' ? window.renderSunSetupCard : () => '',
      renderDevicesSection: typeof window.renderDevicesSection === 'function' ? window.renderDevicesSection : () => '',
      renderEnvironmentAssessmentSummary,
      renderLightTools: typeof window.renderLightTools === 'function' ? window.renderLightTools : () => '',
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
      window.CHANNEL_DISPLAY = channelMeta;
      window.weeklyChannelTier = value => value > 100 ? 2 : 0;
      window.channelTier = window.weeklyChannelTier;
      window.dailyChannelBreakdown = () => Array.from({ length: 7 }, (_, index) => ({
        sun: index === 0 ? 120 : 0,
        device: index === 1 ? 80 : 0,
      }));
      window.rollingChannelTotals = () => ({ vitamin_d: 250, circadian: 40 });
      window.rollingDeviceTotals = () => ({ nir_solar: 120 });
      window.getSessions = () => [];
      window.getDeviceSessions = () => [];
      window.getDevices = () => [];
      window.getActiveSession = () => null;
      window.cumulativeMEDToday = () => 0.72;
      window.cumulativeMEDYesterday = () => 0.4;
      window.rollingVitaminDIU = () => 1800;
      window.vitaminDBudgetStatus = () => ({
        supplementIU: 5000,
        sunIU: 1200,
        total: 6200,
        exceedsSupplementUL: true,
      });
      window.getSunCoords = () => ({ lat: 50, lon: 14, altitudeM: 1700, source: 'profile-precise' });
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
      window.getDevices = () => [{ brand: 'Joovv', model: 'Solo' }];
      syncLightPageDeps();
      const oneDevice = lightPage.renderLightTodayStrip();
      window.getDevices = () => [{ brand: 'Joovv', model: 'Solo' }, { brand: 'SAD', model: 'Desk' }];
      syncLightPageDeps();
      const manyDevices = lightPage.renderLightTodayStrip();
      window.getDevices = () => [];
      syncLightPageDeps();
      const noDevices = lightPage.renderLightTodayStrip();
      outcomes.nonSolarCtasAdaptToDeviceAndRoomState =
        oneDevice.includes('Joovv Solo')
        && manyDevices.includes('Device <span aria-hidden="true">▼</span>')
        && noDevices.includes('Log a sun session')
        && oneDevice.includes('Map a room');

      setHour(10);
      window.getActiveSession = () => ({ id: 'active-sun', startedAt: Date.now() - 95_000 });
      syncLightPageDeps();
      const activeStrip = lightPage.renderLightTodayStrip();
      outcomes.activeSessionStripShowsStopElapsed =
        activeStrip.includes('Stop session')
        && activeStrip.includes('data-live-elapsed-for="active-sun"');

      renderLightTodayHero = () => '';
      window.renderSunSetupCard = () => '<div class="setup-card-test">setup</div>';
      window.renderDevicesSection = () => '<div class="devices-section-test">devices</div>';
      renderEnvironmentAssessmentSummary = () => '';
      window.renderLightTools = () => '';
      window.getActiveSession = () => null;
      window.getDevices = () => [];
      window.getSessions = () => [];
      window.getDeviceSessions = () => [];
      window.getSunCoords = () => null;
      syncLightPageDeps();
      lightPage.showLight(state.importedData);
      outcomes.emptyLightPagePromptsForMissingCoords =
        main?.textContent.includes('set your country in the profile editor') === true
        && main?.querySelector('[data-light-page-action="request-precise-location"]') !== null;

      window.getSunCoords = () => ({ source: 'country-band', lat: 49.2, lon: 16.6 });
      syncLightPageDeps();
      lightPage.showLight(state.importedData);
      outcomes.emptyLightPageShowsCountryBandHint =
        main?.textContent.includes('Calculations use your country (~49.2° lat)') === true;
    } finally {
      state.importedData = saved.importedData;
      if (main && saved.mainHTML != null) main.innerHTML = saved.mainHTML;
      window.Date = saved.Date || RealDate;
      window.getSessions = saved.getSessions;
      window.getDeviceSessions = saved.getDeviceSessions;
      window.getDevices = saved.getDevices;
      window.getActiveSession = saved.getActiveSession;
      window.cumulativeMEDToday = saved.cumulativeMEDToday;
      window.cumulativeMEDYesterday = saved.cumulativeMEDYesterday;
      window.rollingVitaminDIU = saved.rollingVitaminDIU;
      window.vitaminDBudgetStatus = saved.vitaminDBudgetStatus;
      window.getSunCoords = saved.getSunCoords;
      window.CHANNEL_DISPLAY = saved.CHANNEL_DISPLAY;
      window.weeklyChannelTier = saved.weeklyChannelTier;
      window.channelTier = saved.channelTier;
      window.dailyChannelBreakdown = saved.dailyChannelBreakdown;
      window.rollingChannelTotals = saved.rollingChannelTotals;
      window.rollingDeviceTotals = saved.rollingDeviceTotals;
      window.renderSunSetupCard = saved.renderSunSetupCard;
      window.renderDevicesSection = saved.renderDevicesSection;
      renderEnvironmentAssessmentSummary = lightEnv.renderEnvironmentAssessmentSummary;
      window.renderLightTools = saved.renderLightTools;
      renderLightTodayDashboardChip = () => '';
      renderLightTodayHero = () => '';
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
