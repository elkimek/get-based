// Shared setup mutations keep acquisition/analysis history private and source intact.
import type { ProfileData } from '../types/app-state.js';
import { SKIN_TYPE } from './constants.js';
import { FITZPATRICK_ROMAN } from './sun-defaults-model.js';
import { SUN_SETUP_HABITS, validateSunSetupPatch } from './sun-setup-proposals.js';
export function retainSunSetupHistory(next: ProfileData, source: ProfileData, at: number) {
  const before = source.sunDefaults || {}, { setupHistory, ...defaults } = before;
  if (setupHistory != null && !Array.isArray(setupHistory)) throw new Error('Review this setup history in its editor.');
  next.sunDefaults ||= {};
  next.sunDefaults.setupHistory = [...structuredClone(setupHistory || []), { recordedAt: at, defaults: structuredClone(defaults), skinType: source.lightCircadian?.skinType ?? null }];
  delete next.sunDefaults.aiAnalysis;
}
export function applySunSetupPatch(next: ProfileData, patch: Record<string, unknown>) {
  validateSunSetupPatch(patch); next.sunDefaults ||= {};
  for (const field of ['fitzpatrick', 'photosensitiveMeds', 'homeLight', 'eyewear']) if (field in patch) next.sunDefaults[field] = patch[field];
  if ('habits' in patch) {
    const ott = { ...(next.sunDefaults.ott || {}) };
    for (const [field, value] of Object.entries(patch.habits as Record<string, boolean | null>)) {
      const key = SUN_SETUP_HABITS[field as keyof typeof SUN_SETUP_HABITS];
      if (value === null) delete ott[key]; else ott[key] = value;
    }
    next.sunDefaults.ott = ott;
    next.sunDefaults.ottScore = Object.values(SUN_SETUP_HABITS).every(key => typeof ott[key] === 'boolean') ? Object.values(SUN_SETUP_HABITS).filter(key => ott[key] === true).length : null;
  }
  if ('fitzpatrick' in patch) {
    next.lightCircadian = structuredClone(next.lightCircadian || { amLight: null, daytime: null, uvExposure: null, skinType: null, evening: [], screenTime: null, techEnv: [], cold: null, grounding: null, mealTiming: [], note: '' });
    next.lightCircadian.skinType = patch.fitzpatrick === null ? null : SKIN_TYPE[FITZPATRICK_ROMAN.indexOf(patch.fitzpatrick as typeof FITZPATRICK_ROMAN[number])]!;
  }
}
