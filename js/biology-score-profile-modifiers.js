// @ts-check
// biology-score-profile-modifiers.js — profile-aware score input modifiers.

const LOW_MUSCLE_CONTEXT_PATHS = new Set(['biochemistry.creatinine', 'biochemistry.egfr', 'biochemistry.eGFR', 'calculatedRatios.bunCreatRatio']);
const VITAMIN_D_PATHS = new Set(['vitamins.vitaminD', 'vitamins.vitaminD3', 'vitamins.vitaminD2']);
const FEMALE_PHASE_HORMONES = new Set(['hormones.estradiol', 'hormones.progesterone', 'hormones.lh', 'hormones.fsh']);
const HORMONE_THERAPY_CONTEXT_PATHS = new Set([
  'hormones.testosterone', 'hormones.freeTestosterone', 'hormones.bioactiveTestosterone',
  'hormones.estradiol', 'hormones.progesterone', 'hormones.lh', 'hormones.fsh',
  'hormones.dht', 'hormones.androstenedione', 'hormones.fai', 'hormones.shbg',
]);

function contextOnly(flag, weightScale = 1) {
  return { score: false, contextOnly: true, flag, weightScale };
}

function normalizeText(value) { return String(value || '').trim().toLowerCase(); }

function getEntryContext(hit) { return hit?.entryContext || {}; }

function getMenopauseState(profileContext, entryContext) {
  return normalizeText(entryContext.menopauseStatus || entryContext.cycleStatus || profileContext?.menopauseStatus || profileContext?.cycleStatus);
}

function isPostmenopause(profileContext, entryContext) {
  const state = getMenopauseState(profileContext, entryContext);
  return ['postmenopause', 'postmenopausal', 'menopause', 'menopausal', 'no cycle', 'absent-cycle', 'absent cycle'].includes(state);
}

function hasHormoneTherapy(profileContext, entryContext) {
  return !!profileContext?.hormoneTherapy || !!entryContext.hormoneTherapy || !!entryContext.contraception;
}

function parseSampleHour(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value >= 0 && value < 24 ? value : null;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (text.includes('morning') || text.includes('am')) {
    const m = text.match(/(\d{1,2})(?::(\d{2}))?/);
    if (m) {
      let h = Number(m[1]);
      if (text.includes('pm') && h < 12) h += 12;
      return h >= 0 && h < 24 ? h : null;
    }
    return 8;
  }
  if (text.includes('afternoon')) return 14;
  if (text.includes('evening')) return 20;
  const m = text.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  let h = Number(m[1]);
  if (text.includes('pm') && h < 12) h += 12;
  if (text.includes('am') && h === 12) h = 0;
  return h >= 0 && h < 24 ? h : null;
}

function cortisolRangeForSampleTime(sampleTime) {
  const hour = parseSampleHour(sampleTime);
  if (hour == null) return null;
  if (hour >= 5 && hour < 11) return { min: 140, max: 620 };
  if (hour >= 11 && hour < 17) return { min: 70, max: 300 };
  return { min: 0, max: 150 };
}

function isCyclingFemale(profileContext, entryContext) {
  if (profileContext?.sex !== 'female') return false;
  if (isPostmenopause(profileContext, entryContext)) return false;
  if (hasHormoneTherapy(profileContext, entryContext)) return false;
  const state = normalizeText(entryContext.cycleStatus || profileContext?.cycleStatus);
  if (!state) return true;
  return ['regular', 'natural', 'cycling', 'perimenopause', 'premenopause', 'premenopausal'].includes(state);
}

/**
 * @param {{dotKey?: string, label?: string, value?: number, range?: any, phaseLabel?: string | null, phaseRange?: any, entryContext?: any, sampleTime?: any}} hit
 * @param {any} input
 * @param {{lowMuscleMass?: boolean, lowMuscleReason?: string, sex?: string | null, lowSunlightExposure?: boolean, lowSunlightReason?: string, hormoneTherapy?: boolean, cycleStatus?: string | null, menopauseStatus?: string | null, recentHardTraining?: boolean, acuteInflammationContext?: boolean}} profileContext
 */
export function getInputProfileModifier(hit, input, profileContext) {
  const sexScale = input.sexWeightScale?.[profileContext?.sex] ?? 1;
  const dotKey = hit?.dotKey || '';
  const entryContext = getEntryContext(hit);
  if (input.profileContext === 'always-score') return { score: true, flag: '', weightScale: sexScale };

  if (profileContext?.lowMuscleMass && LOW_MUSCLE_CONTEXT_PATHS.has(dotKey)) {
    return contextOnly(`${hit.label || input.label} shown as context only: ${profileContext.lowMuscleReason}`, sexScale);
  }
  if (profileContext?.lowSunlightExposure && VITAMIN_D_PATHS.has(dotKey)) {
    const overrideRange = { ...hit?.range };
    const currentMin = Number.isFinite(overrideRange?.min) ? Number(overrideRange.min) : null;
    if (currentMin == null || currentMin < 100) overrideRange.min = 100;
    return { score: true, flag: profileContext.lowSunlightReason, weightScale: sexScale, rangeOverride: overrideRange };
  }

  if (hasHormoneTherapy(profileContext, entryContext) && HORMONE_THERAPY_CONTEXT_PATHS.has(dotKey)) {
    return contextOnly(`${hit.label || input.label} shown as therapy/contraception context only; this result may not reflect endogenous axis tone.`, sexScale);
  }

  if (profileContext?.sex === 'female' && FEMALE_PHASE_HORMONES.has(dotKey)) {
    if (isPostmenopause(profileContext, entryContext)) {
      return contextOnly(`${hit.label || input.label} shown as postmenopause context only; ordinary cycling ranges would mis-score this biology.`, sexScale);
    }
    if (isCyclingFemale(profileContext, entryContext)) {
      if (!hit?.phaseRange && !entryContext.cyclePhase && !entryContext.cycleDay) {
        return contextOnly(`${hit.label || input.label} needs cycle day or phase before it can be scored reliably.`, sexScale);
      }
      if (hit?.phaseRange) {
        return { score: true, flag: `${hit.label || input.label} scored against ${hit.phaseLabel || 'cycle-phase'} range.`, weightScale: sexScale, rangeOverride: hit.phaseRange };
      }
    }
  }

  if (dotKey === 'hormones.cortisol' || dotKey === 'biostarksHormone.cortisol') {
    const range = cortisolRangeForSampleTime(entryContext.sampleTime || entryContext.drawTime || entryContext.collectionTime || hit?.sampleTime);
    if (!range) return contextOnly(`${hit.label || input.label} needs sample time before a single-point cortisol value can be scored reliably.`, sexScale);
    return { score: true, flag: `${hit.label || input.label} scored against sample-time range (${entryContext.sampleTime || entryContext.drawTime || entryContext.collectionTime}).`, weightScale: sexScale, rangeOverride: range };
  }

  if (dotKey === 'biochemistry.creatineKinase' && (profileContext?.recentHardTraining || entryContext.recentHardTraining)) {
    return contextOnly(`${hit.label || input.label} shown as context only because recent hard training can dominate CK.`, sexScale);
  }

  if ((dotKey === 'hormones.testosterone' || dotKey === 'hormones.freeTestosterone') && profileContext?.sex === 'male') {
    const hasTime = parseSampleHour(entryContext.sampleTime || entryContext.drawTime || entryContext.collectionTime) != null;
    if (!hasTime) return { score: true, flag: `${hit.label || input.label} is best interpreted from a morning draw; sample time missing lowers confidence.`, weightScale: sexScale };
  }

  return { score: true, flag: '', weightScale: sexScale };
}

/**
 * @param {string} scoreId
 * @param {any} profileContext
 */
export function getScoreProfileFlags(scoreId, profileContext) {
  const flags = [];
  if (scoreId === 'hormoneAxis') {
    if (!profileContext.sex) flags.push('Hormone-axis context: set profile sex before treating this score as reliable; hormone meaning changes strongly by sex.');
    if (!Number.isFinite(profileContext.ageYears)) flags.push('Hormone-axis context: set date of birth before treating this score as reliable; hormone ranges and feedback patterns are age-sensitive.');
    if (profileContext.sex === 'female') {
      if (profileContext.cycleStatus) flags.push(`Female hormone context: cycle status is ${profileContext.cycleStatus}; estradiol, progesterone, LH, and FSH are scored only when the relevant phase/state is known.`);
      else flags.push('Female hormone context: add menstrual-cycle or menopause status so estradiol, progesterone, LH, and FSH are interpreted in the right biological phase.');
    }
    if (profileContext.hormoneTherapy) flags.push('Hormone-medication context detected; sex-hormone markers may reflect therapy, contraception, or stimulation rather than endogenous axis tone.');
    if (Number.isFinite(profileContext.ageYears) && profileContext.ageYears >= 50) flags.push(`Age context: ${profileContext.ageYears}y profile; sex-hormone and pituitary feedback patterns need age/menopause/therapy context.`);
    return flags;
  }
  if (scoreId !== 'anabolicRecoverySignal') return [];
  if (profileContext.sex === 'female' && profileContext.cycleStatus && !['regular', 'perimenopause'].includes(profileContext.cycleStatus)) {
    flags.push(`Female hormone context: cycle status is ${profileContext.cycleStatus}; interpret sex-hormone recovery markers with that state, not ordinary cycling assumptions.`);
  }
  if (profileContext.hormoneTherapy) flags.push('Hormone-medication context detected; androgen/estrogen markers may reflect therapy or contraception rather than endogenous recovery tone.');
  if (profileContext.recentHardTraining) flags.push('Recent/intense training context detected; CK, AST/ALT, hs-CRP, urea, and anabolic-recovery drag may reflect training load rather than baseline recovery.');
  if (profileContext.acuteInflammationContext) flags.push('Acute illness/injury context detected; inflammation and immune markers can transiently suppress recovery scoring. Retest baseline after recovery if this was near the blood draw.');
  if (Number.isFinite(profileContext.ageYears) && profileContext.ageYears >= 50) flags.push(`Age context: ${profileContext.ageYears}y profile; DHEA-S, IGF-1, sex hormones, hemoglobin, and CK are interpreted as age-sensitive recovery context, not youth-range targets.`);
  return flags;
}
