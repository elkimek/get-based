import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lightAiAnalysisCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('sun and device session AI analysis covers contexts fingerprints and render states', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ sunUrl, deviceUrl, apiUrl }) => {
    const [{ state }, sun, device, api, aiVerdictRuntime] = await Promise.all([
      import('/js/state.js'),
      import(sunUrl),
      import(deviceUrl),
      import(apiUrl),
      import('/js/ai-verdict-engine-runtime.js'),
    ]);
    const outcomes = {};
    const saved = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      fetch: window.fetch,
      getOllamaConfig: window.getOllamaConfig,
      solarZenithAngle: window.solarZenithAngle,
      provider: localStorage.getItem('labcharts-ai-provider'),
      paused: localStorage.getItem('labcharts-ai-paused'),
      ollamaModel: localStorage.getItem('labcharts-ollama-model'),
    };
    const previousAIVerdictRuntimeDeps = aiVerdictRuntime.configureAIVerdictRuntimeDeps({
      refreshSunSurfaces: () => {},
    });

    const setPausedProvider = () => {
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'true');
    };
    const setLiveProvider = () => {
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.removeItem('labcharts-ai-paused');
      localStorage.setItem('labcharts-ollama-model', 'test-light-model');
      window.getOllamaConfig = () => ({ url: 'http://ollama.test', apiKey: '' });
    };

    try {
      const startedAt = Date.parse('2026-04-15T04:25:00Z');
      const endedAt = Date.parse('2026-04-15T05:10:00Z');
      const priorStart = startedAt - 2 * 86400000;
      const deviceStart = startedAt + 4 * 3600000;
      const lightDevice = {
        id: 'dev-combo',
        brand: 'Glow\nPanel'.repeat(6),
        model: 'Hybrid 900',
        type: 'uvb',
        peakWavelengths: [295, 660, 850],
        mwPerCm2At15cm: 38,
        recommendedDistanceCm: 18,
        lux: 9500,
        modes: [
          { id: 'uvb', label: 'UVB default', default: true, groups: ['uvb'] },
          { id: 'rednir', label: 'Red + NIR repair', groups: ['red', 'nir'] },
        ],
        channelGroups: [
          { id: 'uvb', label: 'UVB tubes', peaks: [295] },
          { id: 'red', label: 'Red LEDs', peaks: [660] },
          { id: 'nir', label: 'NIR LEDs', peaks: [850] },
        ],
      };
      const sunSession = {
        id: 'sun-session-ai',
        startedAt,
        endedAt,
        durationMin: 45,
        location: { lat: 50.08, lon: 14.42 },
        bodyExposure: { preset: 'arms-face', fraction: 0.22, glassBetween: true, sunscreenSPF: 15, rotatedSides: true },
        eyeExposure: { mode: 'direct', lensTint: 'amber', durationSec: 120 },
        atmosphere: { uvIndex: 3.8, cloudCover: 35, ozoneDU: 312 },
        safety: { fitzpatrick: 'II', medFraction: 0.32 },
        doses: {
          vitamin_d: 120,
          circadian: 260,
          nir_solar: 160,
          no_cv: 80,
          pomc: 42,
          violet_eye: 24,
        },
      };
      const priorSunSession = {
        ...sunSession,
        id: 'sun-prior',
        startedAt: priorStart,
        endedAt: priorStart + 18 * 60000,
        durationMin: 18,
        safety: { fitzpatrick: 'II', medFraction: 0.18 },
        doses: { vitamin_d: 50 },
      };
      const deviceSession = {
        id: 'device-session-ai',
        deviceId: lightDevice.id,
        startedAt: deviceStart,
        endedAt: deviceStart + 18 * 60000,
        durationMin: 18,
        distanceCm: 12,
        bodyArea: 'torso',
        bodyAreas: ['chest', 'abdomen'],
        eyesProtected: false,
        mode: 'rednir',
        doses: {
          circadian: 95,
          nir_solar: 220,
          pbm_red: 7.5,
          pbm_nir: 9.2,
        },
        safety: {
          hasUV: false,
          erythemalSED: 0,
          conservativeBaseMedFraction: 0,
          ocularActinicUV: 0,
          unsafeEyeExposure: false,
        },
      };
      const priorDeviceSession = {
        ...deviceSession,
        id: 'device-prior',
        startedAt: deviceStart - 3 * 86400000,
        endedAt: deviceStart - 3 * 86400000 + 12 * 60000,
        durationMin: 12,
        doses: { pbm_red: 4, pbm_nir: 5 },
      };

      state.importedData = {
        ...state.importedData,
        sunDefaults: {
          fitzpatrick: 'II',
          photosensitiveMeds: 'mild',
          dailyVitDTargetIU: 3000,
        },
        lightCircadian: { skinType: 'III olive' },
        healthGoals: [
          { text: 'Restore vitamin D', severity: 'major' },
          { text: 'Improve sleep timing', severity: 'minor' },
        ],
        entries: [
          { date: '2026-05-15', values: { hormones: { '25-oh-vitamin-d': 31 } } },
        ],
        genetics: { test: true },
        sunSessions: [sunSession, priorSunSession],
        lightDevices: [lightDevice],
        deviceSessions: [deviceSession, priorDeviceSession],
      };
      const sunContext = sun.buildSingleSessionContext(sunSession);
      outcomes.sunContextIncludesSolarPhase = sunContext.includes('Solar phase:')
        && sunContext.includes('sunrise window');
      outcomes.sunContextIncludesExposureSafetyWithoutWeeklyRollup = sunContext.includes('Through glass: yes')
        && sunContext.includes('Sunscreen: SPF 15')
        && sunContext.includes('Modeled burn dose: 32% of Fitzpatrick II base MED')
        && !sunContext.includes('Last 7 days')
        && !sunContext.includes('Sunlight vitamin-D comparison');
      outcomes.sunContextExcludesProfileGoalsAndLab = !sunContext.includes('Health goals:')
        && !sunContext.includes('Latest 25-OH-D:')
        && !sunContext.includes('3000 IU/day');
      const sunFpA = sun.getSessionFingerprint(sunSession);
      const sunFpB = sun.getSessionFingerprint({
        ...sunSession,
        safety: { ...sunSession.safety, medFraction: 0.42 },
      });
      outcomes.sunFingerprintChangesWithDoseSafety = !!sunFpA
        && sunFpA !== sunFpB
        && sun.getSessionFingerprint(null) === '';

      const deviceContext = device.buildDeviceSessionContext(deviceSession);
      outcomes.deviceContextIncludesSanitizedDeviceMode = deviceContext.includes('Brand · model: Glow PanelGlow Panel')
        && deviceContext.includes('Mode: Red + NIR repair (user-selected, off-default)')
        && deviceContext.includes('Firing LED groups: Red LEDs, NIR LEDs')
        && deviceContext.includes('Peaks actually firing this session: 660 nm, 850 nm');
      outcomes.deviceContextIncludesParametersDosesWithoutRollup = deviceContext.includes('Working distance: 12 cm')
        && deviceContext.includes('Eyes: no shielding recorded')
        && deviceContext.includes('Modeled light signals')
        && !deviceContext.includes('Last 7 days of device use')
        && !deviceContext.includes('Health goals:');
      const devFpA = device.getDeviceSessionFingerprint(deviceSession);
      const devFpB = device.getDeviceSessionFingerprint({
        ...deviceSession,
        eyesProtected: true,
      });
      outcomes.deviceFingerprintChangesWithSessionSafety = !!devFpA
        && devFpA !== devFpB
        && device.getDeviceSessionFingerprint(null) === '';

      setPausedProvider();
      outcomes.pausedProviderHidesUncachedSessionVerdicts =
        sun.renderSessionAIInline({ ...sunSession, aiAnalysis: null }) === ''
        && device.renderDeviceSessionAIInline({ ...deviceSession, aiAnalysis: null }) === '';
      const cachedSun = {
        ...sunSession,
        aiAnalysis: {
          status: 'ok',
          dot: 'green',
          tip: '<sun tip>',
          detail: '<sun detail>',
          fingerprint: sun.getSessionFingerprint(sunSession),
        },
      };
      const cachedDevice = {
        ...deviceSession,
        aiAnalysis: {
          status: 'ok',
          dot: 'yellow',
          tip: 'device tip',
          detail: '<device detail>',
          fingerprint: device.getDeviceSessionFingerprint(deviceSession),
        },
      };
      const cachedSunInline = sun.renderSessionAIInline(cachedSun);
      const cachedSunDetail = sun.renderSessionAIDetail(cachedSun);
      const cachedDeviceInline = device.renderDeviceSessionAIInline(cachedDevice);
      const cachedDeviceDetail = device.renderDeviceSessionAIDetail(cachedDevice);
      // `sun-session-ai-dot-*` is the shared verdict-dot class across Light/Sun AI surfaces.
      outcomes.cachedSessionVerdictsRenderWithoutProvider = cachedSunInline.includes('sun-session-ai-dot-green')
        && cachedSunDetail.includes('&lt;sun detail&gt;')
        && cachedDeviceInline.includes('sun-session-ai-dot-yellow')
        && cachedDeviceDetail.includes('&lt;device detail&gt;');

      setLiveProvider();
      outcomes.inProgressSessionsDoNotRender = sun.renderSessionAIInline({ ...sunSession, endedAt: null }) === ''
        && device.renderDeviceSessionAIInline({ ...deviceSession, endedAt: null }) === '';
      outcomes.incompleteModeledSessionsDoNotOfferAnalysis = sun.renderSessionAIDetail({
        ...sunSession,
        doses: null,
        safety: null,
        calculationStatus: 'calculation-error',
      }) === '' && device.renderDeviceSessionAIDetail({
        ...deviceSession,
        doses: null,
        safety: null,
      }) === '';
      const sunIdleHtml = sun.renderSessionAIDetail({ ...sunSession, aiAnalysis: null });
      const deviceIdleHtml = device.renderDeviceSessionAIDetail({ ...deviceSession, aiAnalysis: null });
      const sunErrorHtml = sun.renderSessionAIInline({
        ...sunSession,
        aiAnalysis: { status: 'error', errorMessage: 'sun unavailable', fingerprint: sunFpA },
      });
      const deviceErrorHtml = device.renderDeviceSessionAIDetail({
        ...deviceSession,
        aiAnalysis: { status: 'error', errorMessage: 'device unavailable', fingerprint: devFpA },
      });
      outcomes.liveProviderShowsIdleAndErrorStates = sunIdleHtml.includes('Analyze now')
        && deviceIdleHtml.includes('Analyze now')
        && sunErrorHtml.includes('sun unavailable')
        && deviceErrorHtml.includes('device unavailable');

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
            usage: { prompt_tokens: 8, completion_tokens: 6 },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return saved.fetch(url, options);
      };
      delete sunSession.aiAnalysis;
      const analyzingPromise = sun.analyzeSunSessionAI(sunSession, { force: true });
      await fetchStarted;
      const sunAnalyzingHtml = sun.renderSessionAIInline(sunSession);
      releaseFetch();
      await analyzingPromise;
      outcomes.sunAnalyzeShowsInflightThenStoresVerdict = sunAnalyzingHtml.includes('Analyzing')
        && sunSession.aiAnalysis?.status === 'ok'
        && sunSession.aiAnalysis.tip === 'pending tip';

      let sunRefreshCalls = 0;
      window.fetch = async (url, options = {}) => {
        if (String(url).includes('/v1/chat/completions')) {
          sunRefreshCalls++;
          return new Response(JSON.stringify({
            choices: [{ message: { content: '{"dot":"green","tip":"sun refresh tip","detail":"sun refresh detail"}' } }],
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return saved.fetch(url, options);
      };
      delete sunSession.aiAnalysis;
      const sunRefresh = await sun.refreshSessionAIAnalysis(sunSession.id);
      const sunRefreshCallCountAfterHit = sunRefreshCalls;
      let missingSunRefreshCrashed = false;
      try { await sun.refreshSessionAIAnalysis('missing-sun-session'); }
      catch (_) { missingSunRefreshCrashed = true; }
      outcomes.sunRefreshWritesVerdictBySessionId = sunRefresh?.status === 'ok'
        && sunSession.aiAnalysis?.tip === 'sun refresh tip'
        && sun.renderSessionAIInline(sunSession).includes('sun refresh tip')
        && sunRefreshCallCountAfterHit === 1;
      outcomes.sunRefreshMissingIdNoops = !missingSunRefreshCrashed
        && sunRefreshCalls === sunRefreshCallCountAfterHit;

      let sunAutoFireCalls = 0;
      window.fetch = async (url, options = {}) => {
        if (String(url).includes('/v1/chat/completions')) {
          sunAutoFireCalls++;
          return new Response(JSON.stringify({
            choices: [{ message: { content: '{"dot":"green","tip":"sun auto tip","detail":"sun auto detail"}' } }],
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return saved.fetch(url, options);
      };
      outcomes.sunAutoFireProviderGateIsLive = api.hasAIProvider() === true;
      sun.maybeAnalyzeSessionAfterFinish({ ...sunSession, id: 'sun-unfinished', endedAt: null });
      sun.maybeAnalyzeSessionAfterFinish({ ...sunSession, id: 'sun-complete-on-demand' });
      await new Promise(resolve => setTimeout(resolve, 0));
      outcomes.sunSessionAnalysisStaysOnDemand = outcomes.sunAutoFireProviderGateIsLive
        && sunAutoFireCalls === 0;

      window.fetch = async (url, options = {}) => {
        if (String(url).includes('/v1/chat/completions')) {
          return new Response(JSON.stringify({
            choices: [{ message: { content: '{"dot":"green","tip":"device refresh tip","detail":"device refresh detail"}' } }],
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return saved.fetch(url, options);
      };
      delete deviceSession.aiAnalysis;
      const deviceRefresh = await device.refreshDeviceSessionAIAnalysis(deviceSession.id);
      outcomes.deviceRefreshWritesVerdictBySessionId = deviceRefresh?.status === 'ok'
        && deviceSession.aiAnalysis?.tip === 'device refresh tip'
        && device.renderDeviceSessionAIInline(deviceSession).includes('device refresh tip');

      let deviceAuthCalls = 0;
      window.fetch = async (url, options = {}) => {
        if (String(url).includes('/v1/chat/completions')) {
          deviceAuthCalls++;
          return new Response(JSON.stringify({ error: { type: 'authentication_error', message: 'bad key' } }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return saved.fetch(url, options);
      };
      delete deviceSession.aiAnalysis;
      const authResult = await device.analyzeDeviceSessionAI(deviceSession, { force: true });
      outcomes.deviceAnalyzeNormalizesAuthError = authResult === null
        && deviceAuthCalls === 1
        && deviceSession.aiAnalysis?.status === 'error'
        && device.renderDeviceSessionAIDetail(deviceSession).includes('Provider rejected')
        && device.renderDeviceSessionAIDetail(deviceSession).includes('check Settings');
      device.maybeAnalyzeDeviceSessionAfterFinish({ ...deviceSession, id: 'device-unfinished', endedAt: null });
      device.maybeAnalyzeDeviceSessionAfterFinish({ ...deviceSession, id: 'device-complete-on-demand' });
      outcomes.deviceSessionAnalysisStaysOnDemand = deviceAuthCalls === 1;
    } finally {
      state.importedData = saved.importedData;
      window.fetch = saved.fetch;
      window.getOllamaConfig = saved.getOllamaConfig;
      window.solarZenithAngle = saved.solarZenithAngle;
      aiVerdictRuntime.configureAIVerdictRuntimeDeps(previousAIVerdictRuntimeDeps);
      if (saved.provider == null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', saved.provider);
      if (saved.paused == null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', saved.paused);
      if (saved.ollamaModel == null) localStorage.removeItem('labcharts-ollama-model');
      else localStorage.setItem('labcharts-ollama-model', saved.ollamaModel);
    }

    return outcomes;
  }, {
    sunUrl: moduleUrl('/js/sun-ai-analysis.js'),
    deviceUrl: moduleUrl('/js/light-device-ai-analysis.js'),
    apiUrl: moduleUrl('/js/api.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('light environment AI analysis covers audit room screen and onboarding verdicts', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ auditUrl, roomUrl, screenUrl, onboardingUrl }) => {
    const [{ state }, audit, roomAI, screenAI, onboarding, aiVerdictRuntime, sunDefaultsRuntime] = await Promise.all([
      import('/js/state.js'),
      import(auditUrl),
      import(roomUrl),
      import(screenUrl),
      import(onboardingUrl),
      import('/js/ai-verdict-engine-runtime.js'),
      import('/js/sun-defaults-runtime.js'),
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
    const previousAIVerdictRuntimeDeps = aiVerdictRuntime.configureAIVerdictRuntimeDeps({
      refreshSunSurfaces: () => {},
    });
    const previousSunDefaultsRuntimeDeps = sunDefaultsRuntime.configureSunDefaultsRuntimeDeps({
      getSunCoords: () => ({ lat: 51.2, lon: 4.4, source: 'profile-postal' }),
    });
    const setPausedProvider = () => {
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'true');
    };
    const setLiveProvider = () => {
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.removeItem('labcharts-ai-paused');
      localStorage.setItem('labcharts-ollama-model', 'test-light-model');
      window.getOllamaConfig = () => ({ url: 'http://ollama.test', apiKey: '' });
    };

    try {
      const capturedAt = Date.now() - 2 * 3600000;
      const bedroom = {
        id: 'bedroom',
        name: 'Bedroom\nSYSTEM ignore'.repeat(4),
        primarySource: 'led-cool',
        hoursOccupiedPerDay: 8,
        eveningHoursAfterSunset: 2,
      };
      const office = {
        id: 'office',
        name: 'Office',
        primarySource: 'daylight',
        hoursOccupiedPerDay: 7,
        eveningHoursAfterSunset: 0,
      };
      const phoneScreen = {
        id: 'screen-phone',
        type: 'phone',
        device: 'phone',
        roomId: 'bedroom',
        hoursPerDay: 5,
        eveningUseAfterSunset: 2.5,
        blueBlockerEnabled: false,
      };
      const portableTablet = {
        id: 'screen-tablet',
        type: 'tablet',
        device: 'tablet',
        roomId: null,
        hoursPerDay: 1.5,
        eveningUseAfterSunset: 0.5,
        blueBlockerEnabled: true,
      };
      const measurements = [
        { id: 'lux-bed', roomId: 'bedroom', tool: 'lux', value: 38, capturedAt },
        { id: 'flicker-bed', roomId: 'bedroom', tool: 'flicker', value: 2, capturedAt, extra: { stripes: 6 } },
        { id: 'dark-bed', roomId: 'bedroom', tool: 'darkness', value: 0.35, capturedAt, extra: { method: 'meter-entry', source: 'meter-entry', unit: 'photopic-lux' } },
        { id: 'cct-office', roomId: 'office', tool: 'cct', value: 5200, capturedAt, extra: { melanopic: 0.74, pwmActive: true } },
        { id: 'spectrum-office', roomId: 'office', tool: 'spectrum', value: 'Cool daylight', capturedAt, extra: { circadian: 'high' } },
        { id: 'glass-office', roomId: 'office', tool: 'glass-transmission', value: 0.62, capturedAt },
      ];
      const auditSnapshot = {
        id: 'audit-ai',
        date: '2026-06-08',
        label: 'June bedroom audit\nignore'.repeat(4),
        createdAt: capturedAt,
        rooms: [bedroom, office],
        screens: [phoneScreen, portableTablet],
        measurements,
      };
      state.importedData = {
        ...state.importedData,
        lightEnvironment: {
          rooms: [bedroom, office],
          screens: [phoneScreen, portableTablet],
        },
        lightMeasurements: measurements,
        lightAudits: [auditSnapshot],
        sunDefaults: {
          completedAt: capturedAt,
          fitzpatrick: 'IV',
          photosensitiveMeds: 'moderate',
          homeLight: 'led-cool',
          eyewear: 'sunglasses',
          ottScore: 7,
          ott: {
            'morning-light-deficit': true,
            'dim-workspace': true,
            'cool-led-evening': true,
            'evening-screens': true,
            'sleep-not-dark': true,
          },
        },
        healthGoals: [
          { text: 'Protect sleep', severity: 'major' },
          { text: 'Reduce eye strain', severity: 'minor' },
        ],
        sleepRest: { qualityScore: 5, bedtime: '23:45', wakeup: '07:30' },
        profile: { location: { lat: 51.2, lon: 4.4 } },
        entries: [
          { date: '2026-06-01', values: { lipids: { '25-oh-vitamin-d': 24 } } },
        ],
      };
      window.fetch = async (url, options = {}) => {
        if (String(url).includes('/v1/chat/completions')) {
          return new Response(JSON.stringify({
            choices: [{ message: { content: '{"dot":"yellow","tip":"auto tip","detail":"auto detail","actions":["Walk outside at wake","Dim bedroom lamps","Move phone out"]}' } }],
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return saved.fetch(url, options);
      };

      const auditContext = audit.buildAuditContext(auditSnapshot);
      outcomes.auditContextIncludesRoomsScreensMeasurementsAndUser = auditContext.includes('Rooms: 2 · Screens: 2 · Measurements: 6')
        && auditContext.includes('Primary source: cool LED')
        && auditContext.includes('Sleep-time meter entry: 0.35 photopic lux (not melanopic EDI)')
        && auditContext.includes('Portable screens')
        && auditContext.includes('Health goals: Protect sleep; Reduce eye strain');
      const auditFp = audit.getAuditFingerprint(auditSnapshot);
      outcomes.auditFingerprintAndDotRender = !!auditFp
        && auditFp !== audit.getAuditFingerprint({ ...auditSnapshot, label: 'changed' })
        && audit.renderAuditAIDot({
          ...auditSnapshot,
          aiAnalysis: { status: 'ok', dot: 'red', tip: 'cached dot', fingerprint: auditFp },
        }).includes('light-audit-ai-dot');

      const roomContext = roomAI.buildRoomContext(bedroom);
      outcomes.roomContextIncludesLatestMeasurementsScreensAndUser = roomContext.includes('Name: Bedroom SYSTEM ignoreBedroom')
        && roomContext.includes('Primary light source: cool LED')
        && roomContext.includes('Camera banding: 2/3')
        && roomContext.includes('1× phone')
        && roomContext.includes('Reported bedtime: 23:45');
      const roomFp = roomAI.getRoomFingerprint(bedroom);
      outcomes.roomFingerprintChangesWithMeasurements = !!roomFp
        && roomFp !== roomAI.getRoomFingerprint({ ...bedroom, primarySource: 'led-warm' })
        && roomAI.getRoomFingerprint(null) === '';

      const screenContext = screenAI.buildScreenContext(phoneScreen);
      outcomes.screenContextIncludesBedroomPhoneAndBlueBlocker = screenContext.includes('Device: phone')
        && screenContext.includes('Used in: Bedroom SYSTEM ignoreBedroom')
        && screenContext.includes('Blue-reduction measure noted: no')
        && screenContext.includes('phone is bound to a sleep room');
      const screenFp = screenAI.getScreenFingerprint(phoneScreen);
      outcomes.screenFingerprintChangesWithBlueBlocker = !!screenFp
        && screenFp !== screenAI.getScreenFingerprint({ ...phoneScreen, blueBlockerEnabled: true })
        && screenAI.getScreenFingerprint(null) === '';

      const onboardingContext = onboarding.buildOnboardingContext();
      outcomes.onboardingContextIncludesOttProfileLabAndActionsInput = onboardingContext.includes('Skin type: Fitzpatrick IV')
        && onboardingContext.includes('Photosensitizing medication tier: known sunlight warning')
        && onboardingContext.includes('Patterns selected: 7/10')
        && onboardingContext.includes('high latitude')
        && onboardingContext.includes('source: profile-postal')
        && onboardingContext.includes('Latest 25-OH-D: 24');
      const defaultsFp = onboarding.getDefaultsFingerprint();
      outcomes.onboardingFingerprintHandlesMissingDefaults = !!defaultsFp;
      const savedDefaults = state.importedData.sunDefaults;
      delete state.importedData.sunDefaults;
      outcomes.onboardingMissingDefaultsReturnEmpty = onboarding.getDefaultsFingerprint() === ''
        && onboarding.buildOnboardingContext() === ''
        && onboarding.renderOnboardingAIBlock() === '';
      state.importedData.sunDefaults = savedDefaults;

      setPausedProvider();
      outcomes.providerGateHidesUncachedBlocks = audit.renderAuditAIBlock({ ...auditSnapshot, aiAnalysis: null }) === ''
        && roomAI.renderRoomAIBlock({ ...bedroom, aiAnalysis: null }) === ''
        && screenAI.renderScreenAIBlock({ ...phoneScreen, aiAnalysis: null }) === ''
        && onboarding.renderOnboardingAIBlock() === '';
      auditSnapshot.aiAnalysis = { status: 'ok', dot: 'green', tip: '<audit>', detail: '<detail>', fingerprint: auditFp };
      bedroom.aiAnalysis = { status: 'ok', dot: 'yellow', tip: 'room tip', detail: 'room detail', fingerprint: roomFp };
      phoneScreen.aiAnalysis = { status: 'ok', dot: 'red', tip: 'screen tip', detail: '<screen detail>', fingerprint: screenFp };
      state.importedData.sunDefaults.aiAnalysis = {
        status: 'ok',
        dot: 'green',
        tip: 'setup tip',
        detail: 'setup detail',
        actions: ['Keep morning anchor', '<dim lamps>'],
        fingerprint: defaultsFp,
      };
      const cachedAuditHtml = audit.renderAuditAIBlock(auditSnapshot);
      const cachedRoomHtml = roomAI.renderRoomAIBlock(bedroom);
      const cachedScreenHtml = screenAI.renderScreenAIBlock(phoneScreen);
      const cachedOnboardingHtml = onboarding.renderOnboardingAIBlock();
      // `sun-session-ai-dot-*` is the shared verdict-dot class across Light/Sun AI surfaces.
      outcomes.cachedVerdictsRenderWhenProviderPaused = cachedAuditHtml.includes('sun-session-ai-dot-green')
        && cachedAuditHtml.includes('&lt;audit&gt;')
        && cachedRoomHtml.includes('sun-session-ai-dot-yellow')
        && cachedScreenHtml.includes('sun-session-ai-dot-red')
        && cachedScreenHtml.includes('&lt;screen detail&gt;')
        && cachedOnboardingHtml.includes('setup tip')
        && cachedOnboardingHtml.includes('&lt;dim lamps&gt;');

      setLiveProvider();
      delete auditSnapshot.aiAnalysis;
      delete bedroom.aiAnalysis;
      delete phoneScreen.aiAnalysis;
      delete state.importedData.sunDefaults.aiAnalysis;
      const idleAudit = audit.renderAuditAIBlock(auditSnapshot);
      const idleRoom = roomAI.renderRoomAIBlock({ id: 'empty-room', name: 'Empty room' });
      const idleScreen = screenAI.renderScreenAIBlock({ id: 'empty-screen', device: '' });
      const idleOnboarding = onboarding.renderOnboardingAIBlock();
      outcomes.liveProviderShowsIdleCtas = idleAudit.includes('Analyze audit')
        && idleRoom.includes('Circadian-friendliness check for this room')
        && idleScreen.includes('Analyze screen')
        && idleOnboarding.includes('Generate context');

      auditSnapshot.aiAnalysis = { status: 'error', errorMessage: 'audit failed', fingerprint: auditFp };
      bedroom.aiAnalysis = { status: 'error', errorMessage: 'room failed', fingerprint: roomFp };
      phoneScreen.aiAnalysis = { status: 'error', errorMessage: 'screen failed', fingerprint: screenFp };
      state.importedData.sunDefaults.aiAnalysis = { status: 'error', errorMessage: 'setup failed', fingerprint: defaultsFp };
      outcomes.liveProviderShowsErrorStates = audit.renderAuditAIBlock(auditSnapshot).includes('audit failed')
        && roomAI.renderRoomAIBlock(bedroom).includes('room failed')
        && screenAI.renderScreenAIBlock(phoneScreen).includes('screen failed')
        && onboarding.renderOnboardingAIBlock().includes('setup failed');

      delete auditSnapshot.aiAnalysis;
      const auditRefresh = await audit.refreshAuditAIAnalysis('audit-ai');
      let missingAuditRefreshCrashed = false;
      try { await audit.refreshAuditAIAnalysis('missing-audit'); }
      catch (_) { missingAuditRefreshCrashed = true; }
      outcomes.auditRefreshResolvesByIdAndWritesVerdict = auditRefresh?.status === 'ok'
        && auditSnapshot.aiAnalysis?.tip === 'auto tip';
      outcomes.auditRefreshMissingIdNoops = !missingAuditRefreshCrashed;

      delete bedroom.aiAnalysis;
      const roomRefresh = await roomAI.refreshRoomAIAnalysis('bedroom');
      let missingRoomRefreshCrashed = false;
      try { await roomAI.refreshRoomAIAnalysis('missing-room'); }
      catch (_) { missingRoomRefreshCrashed = true; }
      outcomes.roomRefreshResolvesByIdAndWritesVerdict = roomRefresh?.status === 'ok'
        && bedroom.aiAnalysis?.tip === 'auto tip';
      outcomes.roomRefreshMissingIdNoops = !missingRoomRefreshCrashed;

      delete state.importedData.sunDefaults.aiAnalysis;
      const analyzeResult = await onboarding.analyzeOnboardingAI({ force: true });
      outcomes.onboardingAnalyzeParsesActions = analyzeResult?.status === 'ok'
        && Array.isArray(state.importedData.sunDefaults.aiAnalysis?.actions)
        && state.importedData.sunDefaults.aiAnalysis.actions.length === 3;
    } finally {
      state.importedData = saved.importedData;
      window.fetch = saved.fetch;
      window.getOllamaConfig = saved.getOllamaConfig;
      aiVerdictRuntime.configureAIVerdictRuntimeDeps(previousAIVerdictRuntimeDeps);
      sunDefaultsRuntime.configureSunDefaultsRuntimeDeps(previousSunDefaultsRuntimeDeps);
      if (saved.provider == null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', saved.provider);
      if (saved.paused == null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', saved.paused);
      if (saved.ollamaModel == null) localStorage.removeItem('labcharts-ollama-model');
      else localStorage.setItem('labcharts-ollama-model', saved.ollamaModel);
    }

    return outcomes;
  }, {
    auditUrl: moduleUrl('/js/light-audit-ai-analysis.js'),
    roomUrl: moduleUrl('/js/light-env-ai-analysis.js'),
    screenUrl: moduleUrl('/js/light-screen-ai-analysis.js'),
    onboardingUrl: moduleUrl('/js/sun-onboarding-ai.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('light aggregate AI analysis covers channel burden and daily verdicts', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ channelUrl, burdenUrl, todayUrl }) => {
    const [{ state }, channelAI, burdenAI, todayAI, aiVerdictRuntime] = await Promise.all([
      import('/js/state.js'),
      import(channelUrl),
      import(burdenUrl),
      import(todayUrl),
      import('/js/ai-verdict-engine-runtime.js'),
    ]);
    const outcomes = {};
    const saved = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      fetch: window.fetch,
      getOllamaConfig: window.getOllamaConfig,
      solarZenithAngle: window.solarZenithAngle,
      disableAIVerdicts: window.DISABLE_AI_VERDICTS,
      provider: localStorage.getItem('labcharts-ai-provider'),
      paused: localStorage.getItem('labcharts-ai-paused'),
      ollamaModel: localStorage.getItem('labcharts-ollama-model'),
    };
    const localDateKey = date => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };
    const setPausedProvider = () => {
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'true');
    };
    const setLiveProvider = () => {
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.removeItem('labcharts-ai-paused');
      localStorage.setItem('labcharts-ollama-model', 'test-light-model');
      window.getOllamaConfig = () => ({ url: 'http://ollama.test', apiKey: '' });
    };
    const previousAIVerdictRuntimeDeps = aiVerdictRuntime.configureAIVerdictRuntimeDeps({
      refreshSunSurfaces: () => {},
    });
    let previousChannelAIAnalysisDeps = null;

    try {
      const today = new Date();
      today.setHours(11, 10, 0, 0);
      const todayKey = localDateKey(today);
      const sunStart = today.getTime() - 45 * 60000;
      const deviceStart = today.getTime() + 90 * 60000;
      const oldSunrise = new Date(today);
      oldSunrise.setDate(today.getDate() - 5);
      oldSunrise.setHours(6, 0, 0, 0);
      const oldDevice = new Date(today);
      oldDevice.setDate(today.getDate() - 10);
      oldDevice.setHours(12, 0, 0, 0);
      const currentSun = {
        id: 'today-sun',
        startedAt: sunStart,
        endedAt: sunStart + 30 * 60000,
        durationMin: 30,
        location: { lat: 50.1, lon: 14.4 },
        bodyExposure: { fraction: 0.28, rotatedSides: false },
        eyeExposure: { mode: 'direct' },
        atmosphere: { uvIndex: 4.2 },
        safety: { fitzpatrick: 'III', medFraction: 0.22 },
        doses: { vitamin_d: 140, circadian: 300, nir_solar: 220, no_cv: 85, pomc: 45, violet_eye: 35 },
      };
      const previousSunrise = {
        ...currentSun,
        id: 'old-sunrise',
        startedAt: oldSunrise.getTime(),
        endedAt: oldSunrise.getTime() + 20 * 60000,
        durationMin: 20,
        safety: { fitzpatrick: 'III', medFraction: 0.08 },
        doses: { circadian: 150 },
      };
      const currentDevice = {
        id: 'today-device',
        deviceId: 'dev-sad',
        startedAt: deviceStart,
        endedAt: deviceStart + 20 * 60000,
        durationMin: 20,
        distanceCm: 28,
        bodyArea: 'face',
        eyesProtected: false,
        doses: { circadian: 210 },
      };
      const previousDevice = {
        ...currentDevice,
        id: 'old-device',
        startedAt: oldDevice.getTime(),
        endedAt: oldDevice.getTime() + 20 * 60000,
      };
      const priorWeekSunSessions = Array.from({ length: 8 }, (_, index) => {
        const date = new Date(today);
        date.setDate(today.getDate() - 8 - (index % 5));
        date.setHours(12, index, 0, 0);
        return {
          ...currentSun,
          id: `prior-week-sun-${index}`,
          startedAt: date.getTime(),
          endedAt: date.getTime() + 15 * 60000,
          durationMin: 15,
          safety: { fitzpatrick: 'III', medFraction: 0.12 },
          doses: { vitamin_d: 80 },
        };
      });
      const lightMeasurement = {
        id: 'today-lux',
        tool: 'lux',
        roomId: 'office',
        value: 540,
        capturedAt: today.getTime(),
      };
      const deviceRecord = {
        id: 'dev-sad',
        brand: 'BrightCo',
        model: 'Morning Box',
        type: 'sad',
      };
      state.importedData = {
        ...state.importedData,
        sunDefaults: {
          fitzpatrick: 'III',
          dailyVitDTargetIU: 4000,
        },
        lightCircadian: { skinType: 'III olive' },
        healthGoals: [
          { text: 'SAD support', severity: 'major' },
          { text: 'Raise vitamin D', severity: 'major' },
        ],
        sleepRest: null,
        entries: [
          { date: '2026-05-20', values: { hormones: { '25-oh-vitamin-d': 29 } } },
        ],
        sunSessions: [currentSun, previousSunrise, ...priorWeekSunSessions],
        lightDevices: [deviceRecord],
        deviceSessions: [currentDevice, previousDevice],
        lightMeasurements: [lightMeasurement],
        lightEnvironment: {
          rooms: [
            { id: 'office', name: 'Office', primarySource: 'led-cool', hoursOccupiedPerDay: 8, eveningHoursAfterSunset: 1 },
            { id: 'bedroom', name: 'Bedroom', primarySource: 'led-warm', hoursOccupiedPerDay: 8, eveningHoursAfterSunset: 2 },
          ],
          screens: [
            { id: 'tv', device: 'tv', roomId: 'bedroom', hoursPerDay: 3, eveningUseAfterSunset: 2, blueBlockerEnabled: false },
          ],
        },
        lightDailyVerdicts: {},
      };
      window.solarZenithAngle = date => (date.getHours() < 7 ? 87 : 28);
      const rollingChannelTotals = days => days === 7
        ? { vitamin_d: 260, circadian: 180, nir_solar: 130, no_cv: 60, pomc: 55, violet_eye: 30 }
        : { vitamin_d: 540, circadian: 360, nir_solar: 320, no_cv: 140, pomc: 120, violet_eye: 45 };
      const rollingDeviceTotals = days => days === 7
        ? { circadian: 90, nir_solar: 50 }
        : { circadian: 180, nir_solar: 90 };
      const rollingVitaminDIU = () => 900;
      const weeklyChannelTier = (value, key) => {
        if (key === 'vitamin_d' && value >= 250) return 3;
        if (value >= 260) return 4;
        if (value >= 150) return 3;
        if (value >= 60) return 2;
        if (value > 0) return 1;
        return 0;
      };
      const tierLabel = tier => ['none', 'low', 'moderate', 'good', 'strong'][tier] || 'none';
      todayAI.configureLightTodayAI({
        solarZenithAngle: window.solarZenithAngle,
        rollingChannelTotals,
        rollingDeviceTotals,
        rollingVitaminDIU,
      });
      previousChannelAIAnalysisDeps = channelAI.configureLightChannelsAIAnalysisDeps({
        rollingChannelTotals,
        weeklyChannelTier,
        tierLabel,
        getSessions: () => state.importedData.sunSessions,
      });
      const queuedAIResponses = [];
      window.fetch = async (url, options = {}) => {
        if (String(url).includes('/v1/chat/completions')) {
          const verdict = queuedAIResponses.shift() || {
            dot: 'yellow',
            tip: 'aggregate tip',
            detail: 'aggregate detail',
          };
          return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(verdict) } }],
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return saved.fetch(url, options);
      };

      const channelContext = channelAI.buildChannelMixContext();
      outcomes.channelContextKeepsSignalsAndSourcesSeparate = channelContext.includes('Vitamin D (vitamin_d): sunlight logged; device not logged')
        && channelContext.includes('Outdoor sun: 2 session(s)')
        && channelContext.includes('Light-therapy devices: 1 session(s)')
        && channelContext.includes('### Comparison — previous 7 days')
        && channelContext.includes('Timing: morning')
        && channelContext.includes('Health goals: SAD support; Raise vitamin D')
        && !channelContext.includes('Latest 25-OH-D: 29')
        && !channelContext.match(/7d tier|deficient|percentage of a target/i);
      const channelFp = channelAI.getChannelMixFingerprint();
      channelAI.configureLightChannelsAIAnalysisDeps({ getSessions: () => [] });
      const channelFpChanged = channelAI.getChannelMixFingerprint();
      channelAI.configureLightChannelsAIAnalysisDeps({ getSessions: () => state.importedData.sunSessions });
      outcomes.channelFingerprintChangesWithSourceHistory = !!channelFp && channelFp !== channelFpChanged;

      const burdenContext = burdenAI.buildBurdenContext();
      outcomes.burdenContextIncludesAxesRoomsScreensAndUser = burdenContext.includes('Indoor light burden')
        && burdenContext.includes('Daytime opportunity screening score')
        && burdenContext.includes('After-sunset screening score')
        && burdenContext.includes('Evidence coverage')
        && burdenContext.includes('Office')
        && burdenContext.includes('TV (Bedroom): 3 hr/day, 2 hr after sunset')
        && burdenContext.includes('Reported bedtime') === false;
      state.importedData.sleepRest = { qualityScore: 4, bedtime: '00:10' };
      outcomes.burdenContextAddsSleepWhenPresent = burdenAI.buildBurdenContext().includes('Reported bedtime: 00:10');
      const burdenFp = burdenAI.getBurdenFingerprint();
      state.importedData.lightEnvironment.screens[0].blueBlockerEnabled = true;
      const burdenFpChanged = burdenAI.getBurdenFingerprint();
      state.importedData.lightEnvironment.screens[0].blueBlockerEnabled = false;
      outcomes.burdenFingerprintChangesWithSetup = !!burdenFp && burdenFp !== burdenFpChanged;

      const dayTarget = { key: todayKey, date: today, isLightTodayTarget: true };
      const dayContext = todayAI.buildDayContext(dayTarget);
      outcomes.dayContextIncludesSunDeviceMeasurementsWeeklyAndTrends = dayContext.includes(`### Day: ${todayKey}`)
        && dayContext.includes('### Sun sessions (1)')
        && dayContext.includes('### Device sessions (1)')
        && dayContext.includes('### Tool measurements (1)')
        && dayContext.includes('Last 7 days context')
        && dayContext.includes('Modeled sunlight vitamin-D comparison')
        && dayContext.includes('days since last sunrise session');
      const trends = todayAI.computeLightTrends(today);
      outcomes.trendsDetectSunriseGapDropAndLowVitD = trends.signals.some(s => s.includes('days since last sunrise session'))
        && trends.signals.some(s => s.includes('Light activity dropped'))
        && !trends.signals.some(s => s.includes('vit-D synthesis'));
      const dayFp = todayAI.getDayFingerprint(dayTarget);
      state.importedData.lightMeasurements.push({ ...lightMeasurement, id: 'today-cct', tool: 'cct', value: 4200 });
      const dayFpChanged = todayAI.getDayFingerprint(dayTarget);
      state.importedData.lightMeasurements.pop();
      outcomes.dayFingerprintChangesWithActivity = !!dayFp && dayFp !== dayFpChanged;

      setPausedProvider();
      outcomes.noProviderFallsBackOrHidesUncached = channelAI.renderChannelMixVerdict('<p>static channel</p>').includes('static channel')
        && burdenAI.renderBurdenInterp({ interp: 'static burden' }).includes('static burden')
        && todayAI.renderLightTodayHero() === ''
        && todayAI.renderLightTodayDashboardChip() === '';
      state.importedData.channelMixAI = {
        status: 'ok',
        dot: 'green',
        tip: 'channel cached',
        detail: '<channel detail>',
        fingerprint: channelAI.getChannelMixFingerprint(),
      };
      state.importedData.lightEnvironment.burdenAI = {
        status: 'ok',
        dot: 'yellow',
        tip: 'burden cached',
        detail: '<burden detail>',
        fingerprint: burdenAI.getBurdenFingerprint(),
      };
      state.importedData.lightDailyVerdicts[todayKey] = {
        status: 'ok',
        dot: 'green',
        tip: 'today cached',
        detail: '<today detail>',
        fingerprint: todayAI.getDayFingerprint(dayTarget),
      };
      const cachedChannelHtml = channelAI.renderChannelMixVerdict('<p>static channel</p>');
      const cachedBurdenHtml = burdenAI.renderBurdenInterp({ interp: 'static burden' });
      const cachedHeroHtml = todayAI.renderLightTodayHero();
      const cachedChipHtml = todayAI.renderLightTodayDashboardChip();
      outcomes.cachedAggregateVerdictsRenderWithoutProvider = cachedChannelHtml.includes('channel cached')
        && cachedChannelHtml.includes('&lt;channel detail&gt;')
        && cachedBurdenHtml.includes('burden cached')
        && cachedBurdenHtml.includes('&lt;burden detail&gt;')
        && cachedHeroHtml.includes('today cached')
        && cachedHeroHtml.includes('&lt;today detail&gt;')
        && cachedChipHtml.includes('today cached');

      setLiveProvider();
      delete state.importedData.channelMixAI;
      delete state.importedData.lightEnvironment.burdenAI;
      delete state.importedData.lightDailyVerdicts[todayKey];
      // Keep auto-fire macrotasks deterministic while still asserting live-provider idle rendering.
      window.DISABLE_AI_VERDICTS = true;
      const idleChannelHtml = channelAI.renderChannelMixVerdict('<p>static channel</p>');
      const idleBurdenHtml = burdenAI.renderBurdenInterp({ interp: 'static burden' });
      const idleHeroHtml = todayAI.renderLightTodayHero();
      const idleChipHtml = todayAI.renderLightTodayDashboardChip();
      outcomes.idleCtasRenderWhenNoCachedVerdictAndAnalysisGated = idleChannelHtml.includes('Generate weekly review')
        && idleChannelHtml.includes('dashboard-action-btn light-channel-mix-ai-cta')
        && idleBurdenHtml.includes('Get AI verdict')
        && idleHeroHtml.includes("Run today's verdict")
        && idleChipHtml.includes("Get today's AI verdict");
      await new Promise(resolve => setTimeout(resolve, 20));
      window.DISABLE_AI_VERDICTS = false;

      state.importedData.channelMixAI = { status: 'error', errorMessage: 'channel failed', fingerprint: channelFp };
      state.importedData.lightEnvironment.burdenAI = { status: 'error', errorMessage: 'burden failed', fingerprint: burdenFp };
      state.importedData.lightDailyVerdicts[todayKey] = { status: 'error', errorMessage: 'today failed', fingerprint: dayFp };
      outcomes.liveProviderShowsErrorAggregateStates = channelAI.renderChannelMixVerdict('<p>static channel</p>').includes('channel failed')
        && burdenAI.renderBurdenInterp({ interp: 'static burden' }).includes('AI verdict failed')
        && todayAI.renderLightTodayHero().includes('today failed')
        && todayAI.renderLightTodayDashboardChip().includes('today failed');

      queuedAIResponses.push(
        { dot: 'green', tip: 'channel analyze tip', detail: 'channel analyze detail' },
        { dot: 'yellow', tip: 'channel refresh tip', detail: 'channel refresh detail' },
        { dot: 'green', tip: 'burden analyze tip', detail: 'burden analyze detail' },
        { dot: 'red', tip: 'burden refresh tip', detail: 'burden refresh detail' },
      );
      delete state.importedData.channelMixAI;
      delete state.importedData.lightEnvironment.burdenAI;
      const channelAnalysis = await channelAI.analyzeChannelMixAI({ force: true });
      // engine.refresh() forces a fresh analyze, so same-fingerprint refreshes consume the queued verdicts below.
      const channelRefresh = await channelAI.refreshChannelMixAI();
      const burdenAnalysis = await burdenAI.analyzeBurdenAI({ force: true });
      const burdenRefresh = await burdenAI.refreshBurdenAIAnalysis();
      outcomes.aggregateSingletonAnalyzeAndRefreshWriteVerdicts = channelAnalysis?.tip === 'channel analyze tip'
        && channelRefresh?.tip === 'channel refresh tip'
        && state.importedData.channelMixAI?.tip === 'channel refresh tip'
        && burdenAnalysis?.tip === 'burden analyze tip'
        && burdenRefresh?.tip === 'burden refresh tip'
        && state.importedData.lightEnvironment.burdenAI?.tip === 'burden refresh tip'
        && queuedAIResponses.length === 0;

      queuedAIResponses.push({ dot: 'yellow', tip: 'aggregate tip', detail: 'aggregate detail' });
      delete state.importedData.lightDailyVerdicts[todayKey];
      const dayAnalysis = await todayAI.analyzeDayAI(today, { force: true });
      outcomes.dayAnalyzeWritesDailyVerdict = dayAnalysis?.status === 'ok'
        && state.importedData.lightDailyVerdicts[todayKey]?.tip === 'aggregate tip';

      queuedAIResponses.push({ dot: 'red', tip: 'today refresh tip', detail: 'today refresh detail' });
      const dayRefresh = await todayAI.refreshDayAIAnalysis(todayKey);
      let invalidDayRefreshCrashed = false;
      try { await todayAI.refreshDayAIAnalysis('not-a-date'); }
      catch (_) { invalidDayRefreshCrashed = true; }
      outcomes.dayRefreshUsesDateKeyAndWritesDailyVerdict = dayRefresh?.status === 'ok'
        && state.importedData.lightDailyVerdicts[todayKey]?.tip === 'today refresh tip';
      outcomes.dayRefreshInvalidKeyNoops = !invalidDayRefreshCrashed;
    } finally {
      state.importedData = saved.importedData;
      window.fetch = saved.fetch;
      window.getOllamaConfig = saved.getOllamaConfig;
      aiVerdictRuntime.configureAIVerdictRuntimeDeps(previousAIVerdictRuntimeDeps);
      window.solarZenithAngle = saved.solarZenithAngle;
      todayAI.configureLightTodayAI({});
      if (previousChannelAIAnalysisDeps) {
        channelAI.configureLightChannelsAIAnalysisDeps(previousChannelAIAnalysisDeps);
      }
      if (saved.disableAIVerdicts === undefined) delete window.DISABLE_AI_VERDICTS;
      else window.DISABLE_AI_VERDICTS = saved.disableAIVerdicts;
      if (saved.provider == null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', saved.provider);
      if (saved.paused == null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', saved.paused);
      if (saved.ollamaModel == null) localStorage.removeItem('labcharts-ollama-model');
      else localStorage.setItem('labcharts-ollama-model', saved.ollamaModel);
    }

    return outcomes;
  }, {
    channelUrl: moduleUrl('/js/light-channels-ai-analysis.js'),
    burdenUrl: moduleUrl('/js/light-burden-ai-analysis.js'),
    todayUrl: moduleUrl('/js/light-today-ai.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
