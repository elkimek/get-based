// @ts-check
// light-sun-loader.js — lazy initialization for Light & Sun analysis hooks

import { configureLightDevicesStore } from './light-devices-store.js';
import { configureSunSessionsStore } from './sun-sessions-store.js';

/** @type {Promise<typeof import('./app-light-sun-modules.js')> | null} */
let _lightSunModulesLoad = null;
let _lightSunModulesLoaded = false;

export function isLightSunModulesLoaded() {
  return _lightSunModulesLoaded;
}

/** @returns {Promise<typeof import('./app-light-sun-modules.js')>} */
export function loadLightSunModules() {
  if (!_lightSunModulesLoad) {
    _lightSunModulesLoad = import('./app-light-sun-modules.js')
      .then(module => {
        _lightSunModulesLoaded = true;
        return module;
      })
      .catch(err => {
        _lightSunModulesLoad = null;
        throw err;
      });
  }
  return _lightSunModulesLoad;
}

// A session can finish from a dashboard ticker before the user opens the
// Light route. Load the analysis hooks on demand and analyze that completion;
// app-light-sun-modules.js replaces these temporary callbacks for later saves.
configureSunSessionsStore({
  maybeAnalyzeSessionAfterFinish(session) {
    void loadLightSunModules()
      .then(() => import('./sun-ai-analysis.js'))
      .then(({ maybeAnalyzeSessionAfterFinish }) => maybeAnalyzeSessionAfterFinish(session))
      .catch(() => {});
  },
});

configureLightDevicesStore({
  maybeAnalyzeDeviceSessionAfterFinish(session) {
    void loadLightSunModules()
      .then(() => import('./light-device-ai-analysis.js'))
      .then(({ maybeAnalyzeDeviceSessionAfterFinish }) => maybeAnalyzeDeviceSessionAfterFinish(session))
      .catch(() => {});
  },
});
