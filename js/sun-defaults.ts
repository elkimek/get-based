import type { SunSetupDefaults, SunSetupValues } from './sun-defaults-model.js';
import type { LightCircadianContext } from '../types/profile-context-data.js';
// sun-defaults.js — Stable facade for Light setup state and persistence.

type PersistedSunDefaults = SunSetupDefaults & { completedAt?: number };

import { SKIN_TYPE } from './constants.js';
import { saveImportedData } from './data.js';
import { state } from './state.js';
import { configureSunDefaultsSetupUI } from './sun-defaults-setup-ui.js';

export function getSunDefaults() {
  if (!state.importedData) return null;
  if (!state.importedData.sunDefaults) state.importedData.sunDefaults = {};
  return state.importedData.sunDefaults as PersistedSunDefaults;
}

export async function saveSunDefaults(patch: Partial<PersistedSunDefaults>) {
  const defaults = getSunDefaults();
  if (!defaults) return false;
  Object.assign(defaults, patch);
  await saveImportedData();
  return true;
}

export function isOnboardingComplete() {
  const defaults = state.importedData?.sunDefaults;
  return !!(defaults && defaults.fitzpatrick && defaults.completedAt);
}

function buildDefaultLightCircadianContext(): LightCircadianContext {
  return {
    amLight: null,
    daytime: null,
    uvExposure: null,
    skinType: null,
    evening: [],
    screenTime: null,
    techEnv: [],
    cold: null,
    grounding: null,
    mealTiming: [],
    note: '',
  };
}

export async function persistSunSetupValues(values: SunSetupValues | null | undefined, now = Date.now()) {
  if (!values || !state.importedData) return null;
  const defaults = getSunDefaults();
  if (!defaults) return null;
  Object.assign(defaults, {
    fitzpatrick: values.fitzpatrick,
    photosensitiveMeds: values.photosensitiveMeds,
    homeLight: values.homeLight,
    eyewear: values.eyewear,
    ott: values.ott || {},
    ottScore: Number(values.ottScore) || 0,
    completedAt: now,
  });
  delete defaults.skipped;
  delete defaults.setupPromptDismissedAt;
  if (!state.importedData.lightCircadian) {
    state.importedData.lightCircadian = buildDefaultLightCircadianContext();
  }
  state.importedData.lightCircadian.skinType = SKIN_TYPE[values.skinIdx]!;
  await saveImportedData();
  return defaults;
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
