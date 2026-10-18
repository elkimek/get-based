import type { SunSetupDefaults, SunSetupValues } from './sun-defaults-model.js';
// sun-defaults.js — Stable facade for Light setup state and persistence.

type PersistedSunDefaults = SunSetupDefaults & { completedAt?: number };

import { createSunSetupSession } from './sun-defaults-session.js';
import type { SunSetupSession } from './sun-defaults-session.js';
import { state } from './state.js';
import { configureSunDefaultsSetupUI } from './sun-defaults-setup-ui.js';

export function getSunDefaults() {
  if (!state.importedData) return null;
  if (!state.importedData.sunDefaults) state.importedData.sunDefaults = {};
  return state.importedData.sunDefaults as PersistedSunDefaults;
}

export async function saveSunDefaults(patch: Partial<PersistedSunDefaults>, session: SunSetupSession = createSunSetupSession()) {
  return await session.patchDefaults(patch) === 'saved';
}

export function isOnboardingComplete() {
  const defaults = state.importedData?.sunDefaults;
  return !!(defaults && defaults.fitzpatrick && defaults.completedAt);
}

export async function persistSunSetupValues(values: SunSetupValues | null | undefined, now = Date.now(), session: SunSetupSession = createSunSetupSession()) {
  return await session.saveValues(values, now) === 'saved' ? session.defaults() : null;
}

configureSunDefaultsSetupUI({
  getSunDefaults,
  isOnboardingComplete,
  persistSunSetupValues,
  saveSunDefaults,
});

export {
  EYEWEAR_OPTIONS,
  FITZPATRICK_OPTIONS,
  HOME_LIGHT_OPTIONS,
  lightBurdenToLabel,
  OTT_QUESTIONS,
  ottScoreToLabel,
} from './sun-defaults-model.js';
export {
  collectSunSetupValues,
  configureSunDefaults,
  installLightSetupDelegates,
  renderSetupCard,
  reopenSunSetup,
} from './sun-defaults-setup-ui.js';

export{getSunSetupCardView}from'./sun-defaults-setup-renderer.js';
