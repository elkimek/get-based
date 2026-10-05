type AnalysisDependencies = Record<'analyzeSunSession' | 'analyzeDeviceSession', (session: unknown) => unknown>;

// light-sun-analysis-runtime.js — tiny deferred bridge for session AI analysis.
//
// Session stores can be imported independently of the complete Light & Sun
// graph. This bridge lets their completion hooks request analysis without
// pulling the analyzers into the startup graph.

const analysisDeps: AnalysisDependencies = {
  analyzeSunSession: (_session: unknown) => {},
  analyzeDeviceSession: (_session: unknown) => {},
};

export function configureLightSunAnalysisRuntime(deps: Partial<{ [K in keyof AnalysisDependencies]: AnalysisDependencies[K] | null }> = {}) {
  const previous = { ...analysisDeps };
  for (const name of ['analyzeSunSession', 'analyzeDeviceSession'] as const) {
    if (name in deps) {
      analysisDeps[name] = typeof deps[name] === 'function' ? deps[name] : () => {};
    }
  }
  return previous;
}

export function requestSunSessionAnalysis(session: unknown) {
  return analysisDeps.analyzeSunSession(session);
}

export function requestDeviceSessionAnalysis(session: unknown) {
  return analysisDeps.analyzeDeviceSession(session);
}
