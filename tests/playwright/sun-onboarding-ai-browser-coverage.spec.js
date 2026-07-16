import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?sunOnboardingAiCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('sun onboarding AI browser coverage refreshes and auto-analyzes completed setup defaults', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ onboardingUrl }) => {
    const [onboarding, { state }, data, aiVerdictRuntime] = await Promise.all([
      import(onboardingUrl),
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/ai-verdict-engine-runtime.js'),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, label) => {
      for (let i = 0; i < 120; i += 1) {
        if (await predicate()) return true;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const saved = {
      importedData: clone(state.importedData),
      fetch: window.fetch,
      getOllamaConfig: window.getOllamaConfig,
      provider: localStorage.getItem('labcharts-ai-provider'),
      paused: localStorage.getItem('labcharts-ai-paused'),
      ollamaModel: localStorage.getItem('labcharts-ollama-model'),
    };
    const results = {};
    let aiCalls = 0;
    const previousAIVerdictRuntimeDeps = aiVerdictRuntime.configureAIVerdictRuntimeDeps({
      refreshSunSurfaces: () => {},
    });

    try {
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.removeItem('labcharts-ai-paused');
      localStorage.setItem('labcharts-ollama-model', 'sun-onboarding-coverage-model');
      window.getOllamaConfig = () => ({ url: 'http://ollama.test', apiKey: '' });
      window.fetch = async (url, options = {}) => {
        if (String(url).includes('/v1/chat/completions')) {
          aiCalls += 1;
          const isRefresh = aiCalls === 1;
          const content = isRefresh
            ? '{"dot":"yellow","tip":"refresh tip","detail":"refresh detail","actions":["Open curtains","Walk outside","Dim lamps"]}'
            : '{"dot":"green","tip":"auto tip","detail":"auto detail","actions":["Anchor morning light","Set warm lamps","Darken room"]}';
          return new Response(JSON.stringify({
            choices: [{ message: { content } }],
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return saved.fetch(url, options);
      };

      state.importedData = {
        ...state.importedData,
        healthGoals: [{ text: 'Improve sleep timing', severity: 'major' }],
        sleepRest: { qualityScore: 6, bedtime: '23:30', wakeup: '07:15' },
        profile: { location: { lat: 50.1, lon: 14.4 } },
        entries: [
          { date: '2026-05-20', values: { hormones: { '25-oh-vitamin-d': 29 } } },
        ],
        sunDefaults: {
          completedAt: Date.now(),
          fitzpatrick: 'III',
          photosensitiveMeds: 'mild',
          homeLight: 'led-cool',
          eyewear: 'clear-prescription',
          ottScore: 3,
          ott: {
            morningDeficit: true,
            dimWorkspace: true,
            brightAfterSunset: true,
          },
        },
      };
      data.invalidateActiveDataCache();

      const refreshed = await onboarding.refreshOnboardingAIAnalysis();
      results.refreshResolvesDefaultTargetAndStoresActions = refreshed?.status === 'ok'
        && state.importedData.sunDefaults.aiAnalysis?.tip === 'refresh tip'
        && state.importedData.sunDefaults.aiAnalysis?.actions?.length === 3;

      delete state.importedData.sunDefaults.aiAnalysis;
      onboarding.maybeAnalyzeOnboardingAfterSave();
      await waitFor(
        () => state.importedData.sunDefaults.aiAnalysis?.tip === 'auto tip',
        'onboarding auto analysis'
      );
      results.maybeAfterSaveAutoFiresCompletedDefaults = state.importedData.sunDefaults.aiAnalysis?.status === 'ok'
        && state.importedData.sunDefaults.aiAnalysis?.actions?.[0] === 'Anchor morning light'
        && aiCalls === 2;

      const completedDefaults = state.importedData.sunDefaults;
      delete state.importedData.sunDefaults;
      const missingRefresh = await onboarding.refreshOnboardingAIAnalysis();
      onboarding.maybeAnalyzeOnboardingAfterSave();
      await wait(40);
      results.missingDefaultsGateRefreshAndAutoFire = missingRefresh === null
        && aiCalls === 2
        && onboarding.getDefaultsFingerprint() === ''
        && onboarding.buildOnboardingContext() === ''
        && onboarding.renderOnboardingAIBlock() === '';
      state.importedData.sunDefaults = completedDefaults;
    } finally {
      state.importedData = saved.importedData;
      data.invalidateActiveDataCache();
      window.fetch = saved.fetch;
      window.getOllamaConfig = saved.getOllamaConfig;
      aiVerdictRuntime.configureAIVerdictRuntimeDeps(previousAIVerdictRuntimeDeps);
      if (saved.provider == null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', saved.provider);
      if (saved.paused == null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', saved.paused);
      if (saved.ollamaModel == null) localStorage.removeItem('labcharts-ollama-model');
      else localStorage.setItem('labcharts-ollama-model', saved.ollamaModel);
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return results;
  }, { onboardingUrl: moduleUrl('/js/sun-onboarding-ai.js') });

  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});
