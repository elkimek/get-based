// @ts-check
// light-env-shell-hooks.js - wire Light Environment shell actions without window lookups.

import { configureAppEventListeners } from './app-event-listeners.js';
import { closeLightEnvironmentAssessment, configureLightEnv, openLightEnvironmentAssessment } from './light-env.js';
import { loadLightSunModules } from './light-sun-loader.js';
import { getMeasurementsForRoom } from './light-tools.js';
import { configureNavActions } from './nav.js';
import { navigate } from './views.js';

configureLightEnv({ getMeasurementsForRoom, navigate });

configureNavActions({
  openLightEnvironmentAssessment() {
    void loadLightSunModules()
      .then(() => openLightEnvironmentAssessment())
      .catch(err => console.error('Failed to load Light & Sun modules', err));
  },
});

configureAppEventListeners({
  closeLightEnvironmentAssessment,
});
