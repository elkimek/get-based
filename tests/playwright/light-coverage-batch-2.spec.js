import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lightCoverageBatch2=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('light device setup covers preset pick custom form validation unit conversion and AI URL parse', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ setupUrl }) => {
    const [{ state }, setup] = await Promise.all([
      import('/js/state.js'),
      import(setupUrl),
    ]);
    const outcomes = {};
    const calls = [];
    const saved = {
      unitSystem: state.unitSystem,
      fetch: window.fetch,
      getOllamaConfig: window.getOllamaConfig,
      provider: localStorage.getItem('labcharts-ai-provider'),
      paused: localStorage.getItem('labcharts-ai-paused'),
      ollamaModel: localStorage.getItem('labcharts-ollama-model'),
    };

    const closeOverlays = () => {
      document.querySelectorAll('.modal-overlay,.notification-container').forEach(el => el.remove());
    };

    try {
      state.unitSystem = 'US';
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.removeItem('labcharts-ai-paused');
      localStorage.setItem('labcharts-ollama-model', 'test-light-model');
      window.getOllamaConfig = () => ({ url: 'http://ollama.test', apiKey: '' });
      window.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        if (requestUrl.startsWith('/api/fetch-page')) {
          return new Response(JSON.stringify({
            html: `<html><body>
              <script type="application/ld+json">{"brand":"PhotonLab","model":"URL ignored"}</script>
              <main>PhotonLab Aurora UVB red light panel 295 nm 660 nm 850 nm 90 mW/cm2 at 20 cm specifications</main>
            </body></html>`,
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (requestUrl.includes('/v1/chat/completions')) {
          calls.push(['ai-url', requestUrl, JSON.parse(options.body || '{}').messages?.length || 0]);
          return new Response(JSON.stringify({
            choices: [{
              message: {
                content: JSON.stringify({
                  brand: 'PhotonLab',
                  model: 'Aurora UVB',
                  type: 'uvb',
                  peakWavelengths: [295, 660, 850],
                  mwPerCm2At15cm: 90,
                  recommendedDistanceCm: 20,
                  lux: null,
                }),
              },
            }],
            usage: { prompt_tokens: 12, completion_tokens: 8 },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return saved.fetch(url, options);
      };

      setup.configureLightDeviceSetup({
        loadPresets: async () => ({
          types: {
            uvb: { icon: 'UV', label: 'UVB panels' },
            combined: { icon: 'R', label: 'Red + NIR' },
          },
          presets: [
            {
              id: 'preset-uvb',
              type: 'uvb',
              brand: 'Mitochondriak',
              model: 'Mini UVB',
              peakWavelengths: [295, 660],
              mwPerCm2At15cm: 12,
              recommendedDistanceCm: 18,
            },
            {
              id: 'preset-red',
              type: 'combined',
              brand: 'Chroma',
              model: 'Panel 450',
              peakWavelengths: [660, 850],
              recommendedDistanceCm: 15,
            },
          ],
        }),
        addDeviceFromPreset: async id => {
          calls.push(['preset', id]);
          return { id };
        },
        addCustomDevice: async spec => {
          calls.push(['custom', spec]);
          return { id: 'custom-device' };
        },
        wireModal: overlay => document.body.appendChild(overlay),
        refreshLightView: () => calls.push(['refresh']),
      });

      await setup.openAddDeviceDialog();
      const presetOverlay = document.querySelector('[aria-label="Add light device"]')?.closest('.modal-overlay');
      const presetRows = presetOverlay ? Array.from(presetOverlay.querySelectorAll('.light-device-preset-row')) : [];
      const confirmPreset = presetOverlay?.querySelector('#add-device-confirm');
      outcomes.presetModalGroupsMetaAndDisabledConfirm = !!presetOverlay
        && presetOverlay.textContent.includes('UVB panels')
        && presetOverlay.textContent.includes('295/660 nm')
        && presetOverlay.textContent.includes('12 mW/cm')
        && presetOverlay.textContent.includes('18 cm')
        && presetRows.length === 2
        && confirmPreset?.disabled === true;
      if (presetOverlay && confirmPreset && presetRows[0]) {
        presetRows[0].click();
        outcomes.presetSelectionEnablesButton = confirmPreset.disabled === false
          && presetRows[0].classList.contains('active')
          && presetRows[0].getAttribute('aria-pressed') === 'true';
        confirmPreset.click();
        await Promise.resolve();
        outcomes.presetSaveCallsDepsAndRefreshes = calls.some(call => call[0] === 'preset' && call[1] === 'preset-uvb')
          && calls.some(call => call[0] === 'refresh')
          && !document.body.contains(presetOverlay);
      } else {
        outcomes.presetSelectionEnablesButton = false;
        outcomes.presetSaveCallsDepsAndRefreshes = false;
      }

      await setup.openAddDeviceDialog();
      const customLauncher = document.querySelector('#add-device-custom');
      customLauncher?.click();
      let customOverlay = document.querySelector('[aria-label="Add custom light device"]')?.closest('.modal-overlay');
      const customSave = customOverlay?.querySelector('#custom-dev-save');
      if (customSave) {
        customSave.click();
        await Promise.resolve();
      }
      outcomes.customValidationBlocksMissingBrandModel = !!customOverlay
        && document.body.contains(customOverlay)
        && !calls.some(call => call[0] === 'custom');

      const distanceInput = customOverlay?.querySelector('#custom-dev-distance');
      const cmButton = customOverlay?.querySelector('.dev-unit-btn[data-unit="cm"]');
      const inchButton = customOverlay?.querySelector('.dev-unit-btn[data-unit="in"]');
      if (customOverlay && distanceInput && cmButton && inchButton) {
        customOverlay.querySelector('#custom-dev-brand').value = 'ManualBrand';
        customOverlay.querySelector('#custom-dev-model').value = 'ManualModel';
        customOverlay.querySelector('#custom-dev-type').value = 'sad';
        customOverlay.querySelector('#custom-dev-peaks').value = '660, 850, 75, 3100, bad';
        customOverlay.querySelector('#custom-dev-irradiance').value = '55';
        customOverlay.querySelector('#custom-dev-lux').value = '10000';
        distanceInput.value = '6';
        cmButton.click();
        const cmValue = Number(distanceInput.value);
        inchButton.click();
        const inchValue = Number(distanceInput.value);
        outcomes.unitToggleConvertsDistanceBothWays = distanceInput.dataset.unit === 'in'
          && Math.abs(cmValue - 15.2) < 0.05
          && Math.abs(inchValue - 6) < 0.05
          && inchButton.classList.contains('active')
          && cmButton.getAttribute('aria-selected') === 'false';
        customSave?.click();
        await Promise.resolve();
        const customSpec = calls.find(call => call[0] === 'custom')?.[1];
        outcomes.manualCustomSaveHasSpec = !!customSpec;
        outcomes.manualCustomSavePreservesBrand = customSpec?.brand === 'ManualBrand';
        outcomes.manualCustomSavePreservesModel = customSpec?.model === 'ManualModel';
        outcomes.manualCustomSavePreservesType = customSpec?.type === 'sad';
        outcomes.manualCustomSaveFiltersValidPeakWavelengths = customSpec?.peakWavelengths?.join(',') === '660,850';
        outcomes.manualCustomSaveStoresIrradiance = customSpec?.mwPerCm2At15cm === 55;
        outcomes.manualCustomSaveConvertsDistanceToCm = Math.abs((customSpec?.recommendedDistanceCm || 0) - 15.24) < 0.05;
        outcomes.manualCustomSaveStoresLux = customSpec?.lux === 10000;
        outcomes.manualCustomSaveClosesOverlay = !document.body.contains(customOverlay);
      } else {
        outcomes.unitToggleConvertsDistanceBothWays = false;
        outcomes.manualCustomSaveHasSpec = false;
        outcomes.manualCustomSavePreservesBrand = false;
        outcomes.manualCustomSavePreservesModel = false;
        outcomes.manualCustomSavePreservesType = false;
        outcomes.manualCustomSaveFiltersValidPeakWavelengths = false;
        outcomes.manualCustomSaveStoresIrradiance = false;
        outcomes.manualCustomSaveConvertsDistanceToCm = false;
        outcomes.manualCustomSaveStoresLux = false;
        outcomes.manualCustomSaveClosesOverlay = false;
      }

      await setup.openCustomDeviceDialog();
      customOverlay = document.querySelector('[aria-label="Add custom light device"]')?.closest('.modal-overlay');
      const urlInput = customOverlay?.querySelector('#custom-dev-url');
      const fetchButton = customOverlay?.querySelector('#custom-dev-fetch');
      const scanButton = customOverlay?.querySelector('#custom-dev-scan');
      outcomes.aiCustomDialogShowsFetchAndVisionControls = !!customOverlay
        && !!urlInput
        && !!fetchButton
        && !!scanButton;
      if (customOverlay && urlInput && fetchButton) {
        urlInput.value = 'https://example.test/device';
        fetchButton.click();
        for (let i = 0; i < 30 && customOverlay.querySelector('#custom-dev-brand')?.value !== 'PhotonLab'; i++) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        outcomes.aiUrlFetchAppliesBrand = customOverlay.querySelector('#custom-dev-brand')?.value === 'PhotonLab';
        outcomes.aiUrlFetchAppliesModel = customOverlay.querySelector('#custom-dev-model')?.value === 'Aurora UVB';
        outcomes.aiUrlFetchAppliesType = customOverlay.querySelector('#custom-dev-type')?.value === 'uvb';
        outcomes.aiUrlFetchAppliesPeakList = customOverlay.querySelector('#custom-dev-peaks')?.value === '295, 660, 850';
        outcomes.aiUrlFetchAppliesIrradiance = customOverlay.querySelector('#custom-dev-irradiance')?.value === '90';
        outcomes.aiUrlFetchAppliesConvertedDistance = customOverlay.querySelector('#custom-dev-distance')?.value === '7.9';
        outcomes.aiUrlFetchCallsAiEndpoint = calls.some(call => call[0] === 'ai-url');
        customOverlay.querySelector('#custom-dev-save')?.click();
        await Promise.resolve();
        const parsedSpec = calls.filter(call => call[0] === 'custom').at(-1)?.[1];
        outcomes.aiParsedDeviceCanBeSaved = !!parsedSpec
          && parsedSpec.brand === 'PhotonLab'
          && parsedSpec.type === 'uvb'
          && parsedSpec.peakWavelengths.length === 3
          && Math.abs(parsedSpec.recommendedDistanceCm - 20.066) < 0.1;
      } else {
        outcomes.aiUrlFetchAppliesBrand = false;
        outcomes.aiUrlFetchAppliesModel = false;
        outcomes.aiUrlFetchAppliesType = false;
        outcomes.aiUrlFetchAppliesPeakList = false;
        outcomes.aiUrlFetchAppliesIrradiance = false;
        outcomes.aiUrlFetchAppliesConvertedDistance = false;
        outcomes.aiUrlFetchCallsAiEndpoint = false;
        outcomes.aiParsedDeviceCanBeSaved = false;
      }
    } finally {
      setup.configureLightDeviceSetup({
        loadPresets: async () => ({ presets: [], types: {} }),
        addDeviceFromPreset: async () => null,
        addCustomDevice: async () => null,
        wireModal: overlay => document.body.appendChild(overlay),
        refreshLightView: () => {},
      });
      state.unitSystem = saved.unitSystem;
      window.fetch = saved.fetch;
      window.getOllamaConfig = saved.getOllamaConfig;
      if (saved.provider == null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', saved.provider);
      if (saved.paused == null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', saved.paused);
      if (saved.ollamaModel == null) localStorage.removeItem('labcharts-ollama-model');
      else localStorage.setItem('labcharts-ollama-model', saved.ollamaModel);
      closeOverlays();
    }

    return outcomes;
  }, { setupUrl: moduleUrl('/js/light-device-setup-modal.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('light channel view covers pills detail panels suggestions and light-page routing', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ channelUrl }) => {
    const [{ state }, channel] = await Promise.all([
      import('/js/state.js'),
      import(channelUrl),
    ]);
    const outcomes = {};
    const calls = [];
    const host = document.createElement('section');
    const saved = { currentView: state.currentView };
    let restoreDeps = null;
    const order = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];

    const makeDays = (channelKey, count) => Array.from({ length: count }, (_, i) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (count - 1 - i));
      const currentWindow = count === 7 || i >= count - 7;
      const base = currentWindow ? 55 : 18;
      const offset = order.indexOf(channelKey);
      return {
        date,
        sun: base + Math.max(offset, 0) * 4 + (i % 2 ? 8 : 0),
        device: currentWindow && i % 3 === 0 ? 22 : 4,
      };
    });

    try {
      document.body.appendChild(host);
      host.innerHTML = `<div class="light-pills-row">
        <button type="button" data-light-channel-action="quick-log-sun">Sun</button>
        <button type="button" data-light-channel-action="quick-log-device">Device</button>
      </div><div data-channel-detail-slot></div>`;
      channel.installLightChannelActionDelegates(host);
      channel._toggleChannelDetail('vitamin_d');
      host.querySelector('[data-light-channel-action="quick-log-sun"]')?.click();
      host.querySelector('[data-light-channel-action="quick-log-device"]')?.click();
      state.currentView = 'dashboard';
      channel._openChannelOnLightPage('circadian');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      outcomes.defaultDependenciesRenderAndHandleActionsSafely =
        !!host.querySelector('#light-pill-detail-circadian');

      const channelDisplay = {
        vitamin_d: { label: 'Vitamin D', icon: 'D', what: 'UVB synthesis', dailyTarget: 100 },
        circadian: { label: 'Circadian', icon: 'C', what: 'Melanopic entrainment', dailyTarget: 100 },
        nir_solar: { label: 'NIR', icon: 'N', what: 'Mitochondrial red/NIR signal', dailyTarget: 100 },
        no_cv: { label: 'Nitric oxide', icon: 'NO', what: 'UVA nitric oxide release', dailyTarget: 100 },
        pomc: { label: 'POMC', icon: 'P', what: 'Skin POMC pathway', dailyTarget: 100 },
        violet_eye: { label: 'Violet eye', icon: 'V', what: 'Outdoor violet at the eye', dailyTarget: 100 },
      };
      const dailyVitaminDIUBreakdown = count => makeDays('vitamin_d', count).map(day => ({
        date: day.date,
        sun: day.sun * 12,
        device: day.device * 3,
      }));
      const rollingChannelTotals = () => ({
        vitamin_d: 260,
        circadian: 180,
        nir_solar: 240,
        no_cv: 210,
        pomc: 190,
        violet_eye: 120,
      });
      const rollingDeviceTotals = () => ({
        vitamin_d: 80,
        circadian: 15,
        nir_solar: 70,
        no_cv: 20,
        pomc: 10,
        violet_eye: 8,
      });
      const weeklyChannelTier = value => {
        if (value >= 300) return 4;
        if (value >= 200) return 3;
        if (value >= 100) return 2;
        if (value > 0) return 1;
        return 0;
      };
      const navigate = route => {
        calls.push(['navigate', route]);
        state.currentView = route;
      };
      restoreDeps = channel.configureLightChannelView({
        channelDisplay,
        dailyChannelBreakdown: makeDays,
        dailyVitaminDIUBreakdown,
        getDevices: () => [{ brand: 'TestLight', model: 'Panel', channels: ['vitamin_d', 'nir_solar'] }],
        navigate,
        pbmJoulesPerCm2: value => value / 40,
        quickLogDeviceSession: () => calls.push(['quick-device']),
        quickLogSunSession: () => calls.push(['quick-sun']),
        rollingChannelTotals,
        rollingDeviceTotals,
        rollingVitaminDIU: () => 2480,
        tierLabel: tier => ['none', 'low', 'moderate', 'good', 'strong'][tier] || 'none',
        weeklyChannelTier,
      });

      const merged = channel.mergeTotals({ vitamin_d: 10, circadian: 5 }, { vitamin_d: 7, nir_solar: 3 });
      outcomes.mergeTotalsAddsAndPreservesKeys = merged.vitamin_d === 17
        && merged.circadian === 5
        && merged.nir_solar === 3;

      const totals7d = { vitamin_d: 260, circadian: 25, nir_solar: 140, no_cv: 120, pomc: 110, violet_eye: 0 };
      const totals30d = { vitamin_d: 500, circadian: 900, nir_solar: 300, no_cv: 100, pomc: 100, violet_eye: 10 };
      host.innerHTML = channel.renderChannelPills(totals7d, totals30d);
      channel.installLightChannelActionDelegates(host);
      const pills = Array.from(host.querySelectorAll('.light-pill'));
      outcomes.pillsRenderSixSourceAwareSparklines = pills.length === 6
        && !!host.querySelector('.light-pill-sparkline')
        && pills.some(pill => pill.dataset.channel === 'vitamin_d' && pill.textContent.includes('days'))
        && !host.textContent.includes('/7')
        && !host.textContent.includes('%');
      outcomes.channelPillsUseDelegatedActions = pills.every(pill => pill.getAttribute('data-light-channel-action') === 'toggle-detail')
        && !host.innerHTML.includes('onclick=');

      const dayCount = channel._channelDayCount('circadian');
      outcomes.dayCountUsesLoggedDaysAndConsistentLabel = /^\d+ days?$/.test(dayCount.txt)
        && Number.isInteger(dayCount.n);

      const suggestion = channel.renderSuggestion({ vitamin_d: 0, circadian: 200, nir_solar: 200, no_cv: 200, pomc: 200, violet_eye: 200 });
      const sourceSuggestion = channel.renderSuggestion(
        { vitamin_d: 400, circadian: 400 },
        { nir_solar: 400 },
      );
      outcomes.suggestionDescribesSourcesWithoutTargets = suggestion.includes('light-responsive pathway')
        && sourceSuggestion.includes('stay separate')
        && !`${suggestion}${sourceSuggestion}`.match(/target|deficient|strong/i);

      pills.find(pill => pill.dataset.channel === 'vitamin_d')?.click();
      await new Promise(resolve => requestAnimationFrame(resolve));
      const detail = host.querySelector('#light-pill-detail-vitamin_d');
      outcomes.detailPanelShowsSourceHeroWeekChartCitationsAndActions = !!detail
        && detail.textContent.includes('Vitamin D')
        && detail.textContent.includes('How to read it')
        && detail.textContent.includes('Spectrum')
        && detail.textContent.includes('Simple takeaway')
        && !!detail.querySelector('.light-channel-sources')
        && !!detail.querySelector('.light-channel-weekchart svg')
        && !detail.textContent.match(/daily target|strong|good|complete/i)
        && host.querySelector('.light-pill[data-channel="vitamin_d"]')?.getAttribute('aria-expanded') === 'true';
      outcomes.detailActionsUseDelegatedActions = !!detail?.querySelector('[data-light-channel-action="quick-log-sun"]')
        && !!detail?.querySelector('[data-light-channel-action="quick-log-device"]')
        && !!detail?.querySelector('.light-channel-detail-close[data-light-channel-action="toggle-detail"]')
        && !detail.innerHTML.includes('onclick=');
      detail?.querySelector('.light-channel-cta-btn.import-btn-primary')?.click();
      detail?.querySelector('.light-channel-cta-btn.import-btn-secondary')?.click();
      outcomes.detailActionButtonsCallSunAndDeviceLoggers = calls.some(call => call[0] === 'quick-sun')
        && calls.some(call => call[0] === 'quick-device');

      channel._toggleChannelDetail('vitamin_d');
      outcomes.toggleSameChannelCollapsesPanel = host.querySelector('[data-channel-detail-slot]')?.innerHTML === ''
        && host.querySelector('.light-pill[data-channel="vitamin_d"]')?.getAttribute('aria-expanded') === 'false';

      state.currentView = 'dashboard';
      channel._openChannelOnLightPage('circadian');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const routedDetail = host.querySelector('#light-pill-detail-circadian');
      outcomes.openChannelNavigatesToLightAndExpandsAfterFrames = calls.some(call => call[0] === 'navigate' && call[1] === 'light')
        && !!routedDetail
        && host.querySelector('.light-pill[data-channel="circadian"]')?.getAttribute('aria-expanded') === 'true';
    } finally {
      if (restoreDeps) channel.configureLightChannelView(restoreDeps);
      state.currentView = saved.currentView;
      host.remove();
    }

    return outcomes;
  }, { channelUrl: moduleUrl('/js/light-channel-view.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('light tools AI analysis covers per-tool contexts fingerprints and inline states', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ analysisUrl }) => {
    const [{ state }, analysis] = await Promise.all([
      import('/js/state.js'),
      import(analysisUrl),
    ]);
    const outcomes = {};
    const saved = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      fetch: window.fetch,
      getOllamaConfig: window.getOllamaConfig,
      provider: localStorage.getItem('labcharts-ai-provider'),
      paused: localStorage.getItem('labcharts-ai-paused'),
      ollamaModel: localStorage.getItem('labcharts-ollama-model'),
    };

    try {
      state.importedData = {
        ...state.importedData,
        lightMeasurements: [],
        lightEnvironment: {
          rooms: [{ id: 'bedroom', name: 'Bedroom\nwith very long injected name '.repeat(5) }],
        },
        healthGoals: [
          { text: 'Stabilize sleep timing', severity: 'major' },
          { text: 'Reduce eye strain', severity: 'minor' },
        ],
        sleepRest: { qualityScore: 72 },
      };
      const capturedAt = new Date('2026-06-07T20:30:00').getTime();
      const samples = [
        { id: 'lux-one', tool: 'lux', value: 350, roomId: 'bedroom', confidence: 0.82, capturedAt, extra: { source: 'manual-entry', calibrationFactor: 1.25 } },
        { id: 'flicker-one', tool: 'flicker', value: 2, confidence: 0.75, extra: { label: 'moderate', peakBanding: 0.42, stripes: 5, frameRatio: 0.018 } },
        { id: 'dark-one', tool: 'darkness', value: 0.18, confidence: 0.91, extra: { method: 'meter-entry', source: 'meter-entry', unit: 'photopic-lux' } },
        { id: 'cct-one', tool: 'cct', value: 4300, confidence: 0.7, extra: { melanopic: 0.62, temperatureTone: 'cool', pwmActive: true } },
        { id: 'spec-one', tool: 'spectrum', value: 'Warm LED', confidence: 0.64, extra: { reason: 'manual selection', melanopic: 0.21, circadian: 'low', r: 0.7, g: 0.2, b: 0.1 } },
        { id: 'glass-one', tool: 'glass-transmission', value: 0.72, confidence: 0.88, extra: { outside: 10000, inside: 7200, lockMode: 'manual' } },
        { id: 'audit-one', tool: 'audit', value: 3, confidence: 0.5, extra: { rooms: [{ index: 1, label: 'Office', cameraLevel: 70, levelLabel: 'Brighter' }, { index: 2, label: 'Bedroom', cameraLevel: 15, levelLabel: 'Dimmer' }], method: 'relative-camera-walkthrough' } },
        { id: 'unknown-one', tool: 'mystery-tool', value: 'raw', confidence: 0.5 },
      ];
      state.importedData.lightMeasurements = samples;
      const contexts = Object.fromEntries(samples.map(sample => [sample.id, analysis.buildMeasurementContext(sample)]));
      outcomes.contextLuxToolLine = contexts['lux-one'].includes('Tool: lux meter');
      outcomes.contextLuxCalibrationLine = contexts['lux-one'].includes('Calibration factor applied');
      outcomes.contextRoomNameSanitized = contexts['lux-one'].includes('Room: Bedroom with very long injected name')
        && !contexts['lux-one'].includes('\nwith very long');
      outcomes.contextUserGoalsIncluded = contexts['lux-one'].includes('User goals: Stabilize sleep timing; Reduce eye strain');
      outcomes.contextSleepScoreIncluded = contexts['lux-one'].includes('Sleep quality score: 72');
      outcomes.contextFlickerBranch = contexts['flicker-one'].includes('Flicker score: 2/3');
      outcomes.contextDarknessBranch = contexts['dark-one'].includes('Meter entry: 0.18 photopic lux')
        && contexts['dark-one'].includes('not melanopic EDI');
      outcomes.contextCctPwmBranch = contexts['cct-one'].includes('Rolling-shutter banding detected');
      outcomes.contextSpectrumRgbBranch = contexts['spec-one'].includes('RGB ratios');
      outcomes.contextGlassTransmissionBranch = contexts['glass-one'].includes('Relative camera-visible response: about 72%');
      outcomes.contextAuditRoomsBranch = contexts['audit-one'].includes('Room 1 (Office): Brighter camera brightness');
      outcomes.contextUnknownToolBranch = contexts['unknown-one'].includes('Tool: mystery-tool');

      const fpA = analysis.getMeasurementFingerprint(samples[0]);
      const fpB = analysis.getMeasurementFingerprint({ ...samples[0], extra: { ...samples[0].extra, calibrationFactor: 1.5 } });
      outcomes.fingerprintChangesWithSortedExtraData = fpA
        && fpB
        && fpA !== fpB
        && analysis.getMeasurementFingerprint(null) === '';

      localStorage.setItem('labcharts-ai-paused', 'true');
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      outcomes.pausedProviderHidesUncachedVerdict = analysis.renderMeasurementAIInline(samples[0]) === '';
      const pausedCachedOkSample = {
        ...samples[0],
        aiAnalysis: {
          status: 'ok',
          dot: 'green',
          tip: 'cached ok tip',
          detail: 'cached ok detail',
          fingerprint: analysis.getMeasurementFingerprint(samples[0]),
        },
      };
      const pausedCachedOkHtml = analysis.renderMeasurementAIInline(pausedCachedOkSample);
      outcomes.pausedProviderStillRendersCachedOkVerdict = pausedCachedOkHtml.includes('sun-session-ai-dot-green')
        && pausedCachedOkHtml.includes('cached ok tip')
        && pausedCachedOkHtml.includes('cached ok detail');

      localStorage.removeItem('labcharts-ai-paused');
      const idleHtml = analysis.renderMeasurementAIInline(samples[0]);
      localStorage.setItem('labcharts-ollama-model', 'test-light-model');
      window.getOllamaConfig = () => ({ url: 'http://ollama.test', apiKey: '' });
      let releaseFetch;
      let signalFetchStarted;
      const fetchStarted = new Promise(resolve => { signalFetchStarted = resolve; });
      window.fetch = async (url, options = {}) => {
        if (String(url).includes('/v1/chat/completions')) {
          await new Promise(resolve => {
            releaseFetch = resolve;
            signalFetchStarted();
          });
          return new Response(JSON.stringify({
            choices: [{ message: { content: '{"dot":"yellow","tip":"pending tip","detail":"pending detail"}' } }],
            usage: { prompt_tokens: 5, completion_tokens: 4 },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return saved.fetch(url, options);
      };
      const analyzingPromise = analysis.analyzeMeasurementAI(samples[1]);
      await fetchStarted;
      const analyzingHtml = analysis.renderMeasurementAIInline(samples[1]);
      releaseFetch();
      await analyzingPromise;
      let refreshFetchCalls = 0;
      window.fetch = async (url, options = {}) => {
        if (String(url).includes('/v1/chat/completions')) {
          refreshFetchCalls += 1;
          return new Response(JSON.stringify({
            choices: [{ message: { content: '{"dot":"red","tip":"refresh tip","detail":"refresh detail"}' } }],
            usage: { prompt_tokens: 4, completion_tokens: 3 },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return saved.fetch(url, options);
      };
      const refreshedMeasurement = await analysis.refreshMeasurementAIAnalysis('lux-one');
      const callsAfterRefresh = refreshFetchCalls;
      let missingMeasurementRefreshCrashed = false;
      try { await analysis.refreshMeasurementAIAnalysis('missing-measurement'); }
      catch (_) { missingMeasurementRefreshCrashed = true; }
      const callsAfterMissingRefresh = refreshFetchCalls;
      analysis.maybeAnalyzeMeasurementAfterSave(samples[6]);
      await new Promise(resolve => setTimeout(resolve, 20));
      const okSample = { ...samples[2], aiAnalysis: { status: 'ok', dot: 'green', tip: '<bright>', detail: '<script>x</script>', fingerprint: analysis.getMeasurementFingerprint(samples[2]) } };
      const okHtml = analysis.renderMeasurementAIInline(okSample);
      const errorSample = { ...samples[3], aiAnalysis: { status: 'error', error: 'bad', fingerprint: analysis.getMeasurementFingerprint(samples[3]) } };
      const errorHtml = analysis.renderMeasurementAIInline(errorSample);
      const auditHtml = analysis.renderMeasurementAIInline(samples[6]);
      outcomes.refreshMeasurementResolvesByIdAndWritesVerdict = refreshedMeasurement?.status === 'ok'
        && samples[0].aiAnalysis?.tip === 'refresh tip';
      outcomes.refreshMeasurementUsesSingleApiCall = callsAfterRefresh === 1;
      outcomes.refreshMeasurementMissingIdNoops = !missingMeasurementRefreshCrashed;
      outcomes.refreshMeasurementMissingIdSkipsApiCall = callsAfterMissingRefresh === callsAfterRefresh;
      outcomes.auditMeasurementAutoFireSkipsAggregateRows = refreshFetchCalls === callsAfterMissingRefresh;
      outcomes.inlineIdleShowsAnalyzeButton = idleHtml.includes('Get AI verdict');
      outcomes.inlineAnalyzingShowsProgress = analyzingHtml.includes('Analyzing');
      outcomes.inlineOkShowsGreenDot = okHtml.includes('sun-session-ai-dot-green');
      outcomes.inlineOkEscapesTip = okHtml.includes('&lt;bright&gt;');
      outcomes.inlineOkEscapesScriptDetail = !okHtml.includes('<script>');
      outcomes.inlineErrorShowsFailure = errorHtml.includes('Analysis failed');
      outcomes.inlineAuditRowsSkip = auditHtml === '';
    } finally {
      state.importedData = saved.importedData;
      window.fetch = saved.fetch;
      window.getOllamaConfig = saved.getOllamaConfig;
      if (saved.provider == null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', saved.provider);
      if (saved.paused == null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', saved.paused);
      if (saved.ollamaModel == null) localStorage.removeItem('labcharts-ollama-model');
      else localStorage.setItem('labcharts-ollama-model', saved.ollamaModel);
    }

    return outcomes;
  }, { analysisUrl: moduleUrl('/js/light-tools-ai-analysis.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
