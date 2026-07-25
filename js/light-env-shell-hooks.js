// @ts-check
// light-env-shell-hooks.js - wire Light Environment shell actions without window lookups.

import { configureAppEventListeners } from './app-event-listeners.js';
import {
  configureLightEnvironmentLoaderDeps,
  loadLightSunUI,
} from './light-sun-loader.js';
import { getMeasurementsForRoom } from './light-tools.js';
import { closeModalOverlay } from './modal-lifecycle.js';
import { configureNavActions } from './nav.js';
import { navigate } from './views.js';

configureLightEnvironmentLoaderDeps({ getMeasurementsForRoom, navigate });

function closeLightEnvironmentAssessment() {
  const overlay = document.getElementById('light-env-assessment-overlay');
  if (!overlay) return;
  closeModalOverlay(overlay);
  overlay.remove();
}

configureNavActions({
  openLightEnvironmentAssessment() {
    void loadLightSunUI()
      .then(module => module.openLightEnvironmentAssessment())
      .catch(err => console.error('Failed to load Light & Sun modules', err));
  },
});

configureAppEventListeners({
  closeLightEnvironmentAssessment,
});
