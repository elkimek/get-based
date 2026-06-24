// @ts-check
// light-env-shell-hooks.js - wire Light Environment shell actions without window lookups.

import { configureAppEventListeners } from './app-event-listeners.js';
import { openLightEnvironmentAssessment, closeLightEnvironmentAssessment } from './light-env.js';
import { configureNavActions } from './nav.js';

configureNavActions({
  openLightEnvironmentAssessment,
});

configureAppEventListeners({
  closeLightEnvironmentAssessment,
});
