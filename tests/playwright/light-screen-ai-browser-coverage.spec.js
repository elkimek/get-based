import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lightScreenAiCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('light screen AI browser coverage refreshes and auto-analyzes screen verdicts', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ screenUrl }) => {
    const [screenAI, { state }, data, aiVerdictRuntime] = await Promise.all([
      import(screenUrl),
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
      currentProfile: state.currentProfile,
      fetch: window.fetch,
      getOllamaConfig: window.getOllamaConfig,
      disableAIVerdicts: window.DISABLE_AI_VERDICTS,
      provider: localStorage.getItem('labcharts-ai-provider'),
      paused: localStorage.getItem('labcharts-ai-paused'),
      ollamaModel: localStorage.getItem('labcharts-ollama-model'),
    };
    const results = {};
    const refreshAnchors = [];
    const bedroom = { id: 'screen-room-sleep', name: 'Bedroom Coverage' };
    const phoneScreen = {
      id: 'screen-refresh',
      device: 'phone',
      roomId: bedroom.id,
      hoursPerDay: 4.2,
      eveningUseAfterSunset: 1.5,
      blueBlockerEnabled: false,
    };
    const monitorScreen = {
      id: 'screen-auto',
      device: 'monitor',
      roomId: bedroom.id,
      hoursPerDay: 7,
      eveningUseAfterSunset: 2,
      blueBlockerEnabled: false,
    };
    let aiCalls = 0;
    let releaseRefreshFetch = null;
    const previousAIVerdictRuntimeDeps = aiVerdictRuntime.configureAIVerdictRuntimeDeps({
      refreshSunSurfaces: anchor => { refreshAnchors.push(anchor || ''); },
    });

    try {
      state.currentProfile = 'light-screen-ai-browser-coverage';
      state.importedData = {
        ...state.importedData,
        lightEnvironment: {
          rooms: [bedroom],
          screens: [phoneScreen, monitorScreen],
        },
        healthGoals: [{ text: 'Improve sleep timing', severity: 'major' }],
        sleepRest: { qualityScore: 5, bedtime: '23:45' },
      };
      data.invalidateActiveDataCache();
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.removeItem('labcharts-ai-paused');
      localStorage.setItem('labcharts-ollama-model', 'screen-coverage-model');
      window.DISABLE_AI_VERDICTS = false;
      window.getOllamaConfig = () => ({ url: 'http://ollama.test', apiKey: '' });
      window.fetch = async (url, options = {}) => {
        if (String(url).includes('/v1/chat/completions')) {
          aiCalls += 1;
          if (aiCalls === 1) {
            await new Promise(resolve => { releaseRefreshFetch = resolve; });
          }
          const content = aiCalls === 1
            ? '{"dot":"yellow","tip":"refresh tip","detail":"refresh detail"}'
            : '{"dot":"red","tip":"auto tip","detail":"auto detail"}';
          return new Response(JSON.stringify({
            choices: [{ message: { content } }],
            usage: { prompt_tokens: 8, completion_tokens: 6 },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return saved.fetch(url, options);
      };

      const refreshPromise = screenAI.refreshScreenAIAnalysis(phoneScreen.id);
      await waitFor(() => typeof releaseRefreshFetch === 'function', 'screen refresh fetch');
      const analyzingHtml = screenAI.renderScreenAIBlock(phoneScreen);
      releaseRefreshFetch();
      const refreshed = await refreshPromise;
      results.refreshStoresVerdictThroughTargetAdapter = refreshed?.status === 'ok'
        && phoneScreen.aiAnalysis?.tip === 'refresh tip'
        && phoneScreen.aiAnalysis?.dot === 'yellow'
        && refreshAnchors.some(anchor => anchor.includes('screen-refresh'));
      results.inflightRenderShowsAnalyzingState = analyzingHtml.includes('Analyzing this screen');

      const cached = await screenAI.analyzeScreenAI(phoneScreen);
      results.cachedAnalyzeSkipsSecondApiCall = cached?.tip === 'refresh tip'
        && aiCalls === 1;

      const idleHtml = screenAI.renderScreenAIBlock(monitorScreen);
      results.renderAutoFireStartsFromIdleCta = idleHtml.includes('Analyze screen');
      await waitFor(
        () => monitorScreen.aiAnalysis?.tip === 'auto tip',
        'screen render auto-analysis'
      );
      results.renderAutoFireStoresVerdict = monitorScreen.aiAnalysis?.status === 'ok'
        && monitorScreen.aiAnalysis?.dot === 'red'
        && aiCalls === 2
        && refreshAnchors.some(anchor => anchor.includes('screen-auto'));

      const missingRefresh = await screenAI.refreshScreenAIAnalysis('missing-screen');
      results.missingRefreshReturnsNull = missingRefresh === null;
    } finally {
      state.currentProfile = saved.currentProfile;
      state.importedData = saved.importedData;
      data.invalidateActiveDataCache();
      window.fetch = saved.fetch;
      window.getOllamaConfig = saved.getOllamaConfig;
      aiVerdictRuntime.configureAIVerdictRuntimeDeps(previousAIVerdictRuntimeDeps);
      if (saved.disableAIVerdicts === undefined) delete window.DISABLE_AI_VERDICTS;
      else window.DISABLE_AI_VERDICTS = saved.disableAIVerdicts;
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
  }, { screenUrl: moduleUrl('/js/light-screen-ai-analysis.js') });

  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});
