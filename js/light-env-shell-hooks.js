// @ts-check
// light-env-shell-hooks.js - wire Light Environment shell actions without window lookups.

import { configureAppEventListeners } from './app-event-listeners.js';
import { closeLightEnvironmentAssessment, configureLightEnv, openLightEnvironmentAssessment } from './light-env.js';
import { configureNavActions } from './nav.js';
import { navigate } from './views.js';

configureLightEnv({ navigate });

configureNavActions({
  openLightEnvironmentAssessment,
});

configureAppEventListeners({
  closeLightEnvironmentAssessment,
});
