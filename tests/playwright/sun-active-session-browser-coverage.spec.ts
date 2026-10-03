import { createExpectAll } from '../helpers/browser-outcomes.js';
import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('sunActiveSessionCoverage');

const expectAll = createExpectAll(expect, 'individual');

test('sun active session covers default dependencies and live ticker card branches', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ activeUrl }) => {
    const [{ state }, active] = await Promise.all([
      import('/js/state.js'),
      (import(activeUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/sun-active-session.js'), "configureSunActiveSession" | "openStartSunSessionDialog" | "quickLogSunSession" | "resetSunActiveSessionState" | "setSunLiveState" | "ensureActiveTicker">>,
    ]);
    const outcomes: Record<string, unknown> = {};
    const saved = {
      importedData: (JSON.parse(JSON.stringify(state.importedData || {})) as unknown),
      currentView: state.currentView,
    };
    const waitFor = async (predicate: () => unknown | Promise<unknown>) => {
      for (let i = 0; i < 40; i += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      return false;
    };
    const toasts = () => Array.from(document.querySelectorAll<HTMLElement>('.notification-toast')).map(el => el.textContent || '');
    const clickRegion = (overlay: Element | null | undefined, region = 'face') => {
      overlay?.querySelector<HTMLElement>(`[data-region="${region}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };

    try {
      (state as {importedData: unknown}).importedData = {
        ...state.importedData,
        sunDefaults: {},
      };
      let setupOpenCount = 0;
      active.configureSunActiveSession({
        openLightSetup: () => { setupOpenCount += 1; },
      });
      const blockedStart = await active.openStartSunSessionDialog();
      outcomes.unconfirmedFitzpatrickBlocksNewSunSession = blockedStart === false
        && setupOpenCount === 1
        && !document.querySelector<HTMLElement>('.sun-start-modal')
        && toasts().some((text: string) => text.includes('Confirm your Fitzpatrick skin type'));
      document.querySelectorAll<HTMLElement>('.notification-toast').forEach(el => el.remove());

      (state as {importedData: unknown}).importedData = {
        ...state.importedData,
        genetics: { snps: [] },
        sunDefaults: { fitzpatrick: 'I', photosensitiveMeds: 'severe' },
      };
      active.configureSunActiveSession({
        getSunCoords: () => ({ lat: 49.8, lon: 15.5, source: 'country-band' }),
      });
      const broadLocationStart = await active.openStartSunSessionDialog();
      outcomes.countryLevelLocationCannotMasqueradeAsLiveUvSafety = broadLocationStart === false
        && setupOpenCount === 2
        && toasts().some((text: string) => text.includes('country-level location is too broad'));
      document.querySelectorAll<HTMLElement>('.notification-toast').forEach(el => el.remove());
      active.configureSunActiveSession({
        getSunCoords: () => ({ lat: 50.08, lon: 14.43, source: 'home-postal' }),
      });

      await active.quickLogSunSession();
      const defaultOverlay = document.querySelector<HTMLElement>('.sun-start-modal')?.closest('.modal-overlay');
      defaultOverlay?.querySelector<HTMLElement>('#start-confirm')?.click();
      outcomes.defaultStartDialogUsesGetActiveAndEmptyRegionFallbacks = defaultOverlay?.querySelector<HTMLElement>('#sun-start-hint')?.textContent.includes('Tap at least one region');
      defaultOverlay?.remove();

      active.configureSunActiveSession({
        getSunCoords: () => ({ lat: 50.08, lon: 14.43, source: 'profile' }),
        fetchAtmosphere: async () => ({ uvIndex: 9.1, ozoneDU: 285, cloudCover: 15, source: 'manual' }),
      });
      await active.openStartSunSessionDialog();
      await waitFor(() => document.querySelector<HTMLElement>('#sun-start-uvi-banner')?.hidden === false);
      const startOverlay = document.querySelector<HTMLElement>('.sun-start-modal')?.closest('.modal-overlay');
      const preflightText = startOverlay?.querySelector<HTMLElement>('#sun-start-uvi-banner')?.textContent || '';
      clickRegion(startOverlay);
      startOverlay?.querySelector<HTMLElement>('#start-confirm')?.click();
      await waitFor(() => !document.body.contains(startOverlay!));
      outcomes.defaultStartSessionUsesPreflightAndStartFallbacks = preflightText.includes('Very high UV')
        && toasts().some((text: string) => text.includes('high UV 9.1') && text.includes('severe photosensitivity caution'));
      document.querySelectorAll<HTMLElement>('.notification-toast').forEach(el => el.remove());
      active.resetSunActiveSessionState();

      const stoppingSession = {
        id: 'default-stop-session',
        startedAt: Date.now() - 6 * 60000,
        endedAt: null,
        durationMin: 6,
        bodyExposure: { fraction: 0.08, regions: ['face'], glassBetween: true },
        eyeExposure: { mode: 'indirect', lensTint: 'clear' },
        atmosphere: { uvIndex: 1.4 },
        doses: {},
        safety: { medFraction: 0.12, fitzpatrick: 'III' },
      };
      active.configureSunActiveSession({
        getActiveSession: () => stoppingSession,
        getSessions: () => [stoppingSession],
        getSunCoords: () => ({ lat: 49.2, lon: 16.6, source: 'profile' }),
      });
      await active.quickLogSunSession();
      outcomes.defaultStopPathUsesStopSaveHydrateAndRefreshFallbacks = (stoppingSession as typeof stoppingSession & {location?: {source?: unknown}}).location?.source === 'profile'
        && toasts().some((text: string) => text.includes('negligible modeled vitamin-D-effective UVB') && text.includes('generic glass model'));
      document.querySelectorAll<HTMLElement>('.notification-toast').forEach(el => el.remove());
      active.resetSunActiveSessionState();

      const tickerSession = {
        id: 'ticker-session',
        startedAt: Date.now() - 45 * 60000,
        endedAt: null,
        paused: true,
        bodyExposure: { fraction: 0.22, regions: ['face', 'arms-front'], rotatedSides: true },
        eyeExposure: { mode: 'direct', lensTint: 'clear' },
        atmosphere: { uvIndex: 8.8 },
        safety: { fitzpatrick: 'II' },
      };
      state.currentView = 'light';
      active.configureSunActiveSession({
        getSessions: () => [tickerSession],
        getActiveSession: () => tickerSession,
        vitaminDIU: () => 1400,
        vitaminDIUPerSession: () => 1400,
        renderLightChannelsLive: () => {
          outcomes.liveChannelRefreshCalled = true;
        },
      });
      active.setSunLiveState(tickerSession.id, {
        committedDoses: { vitamin_d: 20, circadian: 15, nir_solar: 10 },
        committedSED: 4,
        committedRetinalUV: 35,
        fractionOfMEDFn: () => 1.1,
        fitzpatrick: 'II',
        medScale: 1,
        psmTier: 'none',
        atm: { uvIndex: 8.8, temperatureC: 34, source: 'manual' },
        pending: false,
      });
      localStorage.removeItem('gb_jargon_seen_med');
      const card = document.createElement('div');
      card.dataset.id = tickerSession.id;
      card.innerHTML = '<div class="sun-session-head"><span class="sun-session-duration">old</span></div><div class="sun-channel-chips sun-chips-expanded"><span>old chips</span></div>';
      const elapsed = document.createElement('span');
      elapsed.dataset.liveElapsedFor = tickerSession.id;
      elapsed.textContent = 'old elapsed';
      document.body.append(card, elapsed);
      active.ensureActiveTicker();
      await waitFor(() => card.textContent.includes('burn dose') && card.textContent.includes('Vitamin D estimate'));
      outcomes.liveTickerPatchesActiveCardsAndJargonAlerts = card.textContent.includes('110% base burn dose')
        && card.textContent.includes('Vitamin D estimate')
        && card.textContent.includes('IU-eq/min')
        && !!card.querySelector('.sun-session-live-readouts > .sun-session-vitd:first-child')
        && !card.querySelector('.sun-session-head .sun-session-vitd')
        && card.querySelector('.sun-channel-chips')?.classList.contains('sun-chips-expanded')
        && card.textContent.includes('cool down')
        && card.textContent.includes('ocular actinic UV')
        && elapsed.textContent !== 'old elapsed'
        && toasts().some((text: string) => text.includes('MED ='))
        && toasts().some((text: string) => text.includes('Ocular actinic UV'));
      outcomes.liveChannelRefreshCalled = outcomes.liveChannelRefreshCalled === true;
    } finally {
      (state as {importedData: unknown}).importedData = saved.importedData;
      state.currentView = saved.currentView;
      active.resetSunActiveSessionState();
      active.configureSunActiveSession({
        getSessions: () => [],
        getActiveSession: () => null,
        startSession: async () => null,
        stopSession: async () => null,
        hydrateSession: async () => null,
        getSunCoords: () => null,
        saveImportedData: async () => {},
        applyAtmOverrides: (atm: unknown) => atm,
        refreshSurfaces: () => {},
        normalizePSMTier: (raw: unknown) => raw || 'none',
        photosensitiveMedScale: () => 1,
        eyeModes: [],
        lensTints: [],
        postureOptions: [],
        surfaceOptions: [],
        fetchAtmosphere: async () => null,
        reconstructSpectrum: () => null,
        computeChannelDoses: () => ({}),
        erythemalSED: () => 0,
        fractionOfMED: () => 0,
        solarZenithAngle: () => 90,
        interpolateAtmosphere: () => null,
        vitaminDIU: (channelAu: number, _fitzpatrick = 'III', _uvi = null, rotatedSides = false) => channelAu * 60 * (rotatedSides ? 2 : 1),
        vitaminDIUPerSession: null,
        skinTypeToFitzpatrick: (skinType: unknown) => (String(skinType || '').match(/^(I{1,3}|IV|VI?)\b/) || [])[1] || null,
        renderLightChannelsLive: () => {},
        renderLightTodayStrip: () => '',
        openLightSetup: () => {},
      });
      document.querySelectorAll<HTMLElement>('.modal-overlay,.notification-container,.notification-toast,[data-id="ticker-session"],[data-live-elapsed-for="ticker-session"]').forEach(el => el.remove());
    }

    return outcomes;
  }, { activeUrl: moduleUrl('/js/sun-active-session.js') });

  expectAll(results);
});
