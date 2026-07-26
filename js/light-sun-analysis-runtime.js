// @ts-check
// light-sun-analysis-runtime.js — tiny deferred bridge for session AI analysis.
//
// Session stores can be imported independently of the complete Light & Sun
// graph. This bridge lets their completion hooks request analysis without
// pulling the analyzers into the startup graph.

const analysisDeps = {
  analyzeSunSession: (/** @type {any} */ _session) => {},
  analyzeDeviceSession: (/** @type {any} */ _session) => {},
};

/**
 * @param {{
 *   analyzeSunSession?: ((session: any) => any) | null,
 *   analyzeDeviceSession?: ((session: any) => any) | null,
 * }} [deps]
 */
export function configureLightSunAnalysisRuntime(deps = {}) {
  const previous = { ...analysisDeps };
  for (const name of ['analyzeSunSession', 'analyzeDeviceSession']) {
    if (name in deps) {
      analysisDeps[name] = typeof deps[name] === 'function' ? deps[name] : () => {};
    }
  }
  return previous;
}

/** @param {any} session */
export function requestSunSessionAnalysis(session) {
  return analysisDeps.analyzeSunSession(session);
}

/** @param {any} session */
export function requestDeviceSessionAnalysis(session) {
  return analysisDeps.analyzeDeviceSession(session);
}
