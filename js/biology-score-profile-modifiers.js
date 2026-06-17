// @ts-check
// biology-score-profile-modifiers.js — profile-aware score input modifiers.

const LOW_MUSCLE_CONTEXT_PATHS = new Set(['biochemistry.creatinine', 'biochemistry.egfr', 'biochemistry.eGFR', 'calculatedRatios.bunCreatRatio']);
const VITAMIN_D_PATHS = new Set(['vitamins.vitaminD', 'vitamins.vitaminD3', 'vitamins.vitaminD2']);

/**
 * @param {{dotKey?: string, label?: string, value?: number, range?: any}} hit
 * @param {any} input
 * @param {{lowMuscleMass?: boolean, lowMuscleReason?: string, sex?: string | null, lowSunlightExposure?: boolean, lowSunlightReason?: string}} profileContext
 */
export function getInputProfileModifier(hit, input, profileContext) {
  const sexScale = input.sexWeightScale?.[profileContext?.sex] ?? 1;
  if (input.profileContext === 'always-score') return { score: true, flag: '', weightScale: sexScale };
  if (profileContext?.lowMuscleMass && LOW_MUSCLE_CONTEXT_PATHS.has(hit?.dotKey || '')) {
    return { score: false, contextOnly: true, flag: `${hit.label || input.label} shown as context only: ${profileContext.lowMuscleReason}` };
  }
  if (profileContext?.lowSunlightExposure && VITAMIN_D_PATHS.has(hit?.dotKey || '')) {
    const overrideRange = { ...hit?.range };
    const currentMin = Number.isFinite(overrideRange?.min) ? Number(overrideRange.min) : null;
    if (currentMin == null || currentMin < 100) overrideRange.min = 100;
    return { score: true, flag: profileContext.lowSunlightReason, weightScale: sexScale, rangeOverride: overrideRange };
  }
  return { score: true, flag: '', weightScale: sexScale };
}

/**
 * @param {string} scoreId
 * @param {any} profileContext
 */
export function getScoreProfileFlags(scoreId, profileContext) {
  if (scoreId !== 'anabolicRecoverySignal') return [];
  const flags = [];
  if (profileContext.sex === 'female' && profileContext.cycleStatus && !['regular', 'perimenopause'].includes(profileContext.cycleStatus)) {
    flags.push(`Female hormone context: cycle status is ${profileContext.cycleStatus}; interpret sex-hormone recovery markers with that state, not ordinary cycling assumptions.`);
  }
  if (profileContext.hormoneTherapy) flags.push('Hormone-medication context detected; androgen/estrogen markers may reflect therapy or contraception rather than endogenous recovery tone.');
  if (profileContext.recentHardTraining) flags.push('Recent/intense training context detected; CK, AST/ALT, hs-CRP, urea, and anabolic-recovery drag may reflect training load rather than baseline recovery.');
  if (profileContext.acuteInflammationContext) flags.push('Acute illness/injury context detected; inflammation and immune markers can transiently suppress recovery scoring. Retest baseline after recovery if this was near the blood draw.');
  if (Number.isFinite(profileContext.ageYears) && profileContext.ageYears >= 50) flags.push(`Age context: ${profileContext.ageYears}y profile; DHEA-S, IGF-1, sex hormones, hemoglobin, and CK are interpreted as age-sensitive recovery context, not youth-range targets.`);
  return flags;
}
