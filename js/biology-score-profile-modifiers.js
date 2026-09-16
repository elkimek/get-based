// @ts-check
// biology-score-profile-modifiers.js — profile-aware score input modifiers.

import { cortisolReferenceForSampleTime, parseSampleHour } from './marker-context-ranges.js';

const LOW_MUSCLE_CONTEXT_PATHS = new Set(['biochemistry.creatinine', 'biochemistry.egfr', 'biochemistry.eGFR', 'biochemistry.egfrCombined', 'biochemistry.egfrCreatinineCystatinC', 'calculatedRatios.bunCreatRatio']);
const VITAMIN_D_PATHS = new Set(['vitamins.vitaminD', 'vitamins.vitaminD3', 'vitamins.vitaminD2']);
const METHYLATION_CONTEXT_PATHS = new Set(['coagulation.homocysteine', 'vitamins.vitaminB12', 'vitamins.activeB12', 'vitamins.folate']);
const IRON_CONTEXT_PATHS = new Set(['iron.ferritin', 'iron.transferrinSat', 'iron.transferrinSaturation', 'iron.tsat', 'iron.iron', 'iron.tibc', 'iron.transferrin']);
const LIPID_CONTEXT_PATHS = new Set(['lipids.apoB', 'lipids.ldl', 'lipids.hdl', 'lipids.lpA', 'lipids.triglycerides', 'calculatedRatios.apoBapoAIRatio', 'calculatedRatios.cholHdlRatio', 'calculatedRatios.tgHdlRatio']);
const FATTY_ACID_CONTEXT_PATHS = new Set(['fattyAcids.omega3Index', 'fattyAcids.aaEpaRatio', 'spadiaFA.omega3Index', 'omegaquantFA.omega3Index', 'zinzinoFA.omega3Index', 'metabolomixFA.omega3Index', 'fattyAcidsTest.omega3Index', 'biostarksFA.omega3Index']);
const BILIRUBIN_CONTEXT_PATHS = new Set(['biochemistry.bilirubinTotal', 'biochemistry.bilirubinDirect', 'biochemistry.bilirubinIndirect']);
const FEMALE_PHASE_HORMONES = new Set(['hormones.estradiol', 'hormones.progesterone', 'hormones.lh', 'hormones.fsh']);
const HORMONE_THERAPY_CONTEXT_PATHS = new Set([
  'hormones.testosterone', 'hormones.freeTestosterone', 'hormones.bioactiveTestosterone',
  'hormones.estradiol', 'hormones.progesterone', 'hormones.lh', 'hormones.fsh',
  'hormones.dht', 'hormones.androstenedione', 'hormones.fai', 'hormones.shbg',
]);
const HORMONAL_CONTRACEPTION_TERMS = ['ocp', 'pill', 'patch', 'ring', 'implant', 'mirena', 'hormonal iud', 'depo', 'injection', 'contraceptive pill', 'birth control pill'];
const NON_HORMONAL_CONTRACEPTION_TERMS = ['copper', 'copper iud', 'non-hormonal', 'non hormonal'];

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
  return !!profileContext?.hormoneTherapy || !!entryContext.hormoneTherapy || isHormonalContraception(entryContext.contraception);
}

function isHormonalContraception(value) {
  if (value === true) return true;
  const text = String(value || '').toLowerCase();
  if (!text) return false;
  if (NON_HORMONAL_CONTRACEPTION_TERMS.some(term => text.includes(term))) return false;
  return HORMONAL_CONTRACEPTION_TERMS.some(term => text.includes(term));
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
 * @param {{dotKey?: string, label?: string, value?: number, range?: any, rangeLabel?: string, phaseLabel?: string | null, phaseRange?: any, entryContext?: any, sampleTime?: any, unit?: string, specimen?: string, referenceRangeSource?: string, referenceRange?: any, optimalRangeSource?: string, referenceSampleTime?: string}} hit
 * @param {any} input
 * @param {{lowMuscleMass?: boolean, lowMuscleReason?: string, sex?: string | null, lowSunlightExposure?: boolean, lowSunlightReason?: string, hormoneTherapy?: boolean, cycleStatus?: string | null, menopauseStatus?: string | null, recentHardTraining?: boolean, acuteInflammationContext?: boolean, genetic?: any, body?: any, light?: any, contextFlags?: string[]}} profileContext
 */
export function getInputProfileModifier(hit, input, profileContext) {
  const profileSex = profileContext?.sex;
  const sexScale = profileSex ? input.sexWeightScale?.[profileSex] ?? 1 : 1;
  const dotKey = hit?.dotKey || '';
  const entryContext = getEntryContext(hit);
  if (input.profileContext === 'always-score') return { score: true, flag: '', weightScale: sexScale };

  if (input.fastingRequired) {
    if (entryContext.fasting === false) return contextOnly(`${hit.label || input.label} was collected non-fasting; use a fasting draw for this fasting-regulation pattern.`, sexScale);
    if (entryContext.fasting !== true) return { score: true, limited: true, flag: `${hit.label || input.label}: fasting status is unknown. Confirm collection context before interpreting fasting regulation.`, weightScale: sexScale };
  }

  if (profileContext?.lowMuscleMass && LOW_MUSCLE_CONTEXT_PATHS.has(dotKey)) {
    return contextOnly(`${hit.label || input.label} shown as context only: ${profileContext.lowMuscleReason}`, sexScale);
  }
  if (profileContext?.lowMuscleMass && (/creatinine|\bcreat\b/i.test(hit.unit || '') || ['urinalysis.albuminCreatinineRatio', 'urinalysis.proteinCreatinineRatio'].includes(dotKey))) {
    return { score: true, limited: true, flag: `${hit.label || input.label} is normalized to urine creatinine. Low muscle mass can alter the denominator; interpret this ratio with collection and muscle context.`, weightScale: sexScale };
  }
  if (profileContext?.lowSunlightExposure && VITAMIN_D_PATHS.has(dotKey)) {
    return { score: true, flag: `${profileContext.lowSunlightReason || 'Low sunlight exposure.'} Vitamin D uses the selected range; sunlight exposure does not set a different numeric target.`, weightScale: sexScale };
  }
  if (profileContext?.genetic?.vitaminDRisk && VITAMIN_D_PATHS.has(dotKey)) {
    return { score: true, flag: 'Genetic context: vitamin-D pathway variants are present; interpret 25-OH vitamin D with sunlight/intake response context.', weightScale: sexScale };
  }
  if (profileContext?.genetic?.methylationRisk && dotKey === 'coagulation.homocysteine') {
    return { score: true, flag: 'Methylation variants add context; they do not establish a different homocysteine target.', weightScale: sexScale };
  }
  if (profileContext?.genetic?.methylationRisk && METHYLATION_CONTEXT_PATHS.has(dotKey)) {
    return { score: true, flag: 'Genetic context: methylation/B-vitamin variants are present; B12, folate, and homocysteine patterns deserve extra confidence review.', weightScale: sexScale };
  }
  if (profileContext?.genetic?.ironRisk && IRON_CONTEXT_PATHS.has(dotKey)) {
    return { score: true, flag: 'Genetic context: iron-regulation variants are present; iron markers should be interpreted with overload/deficiency predisposition context.', weightScale: sexScale };
  }
  if (profileContext?.genetic?.lipidRisk && LIPID_CONTEXT_PATHS.has(dotKey)) {
    return { score: true, flag: 'Genetic context: lipid/APOE-related variants are present; lipoprotein risk may be higher than the lab pattern alone suggests.', weightScale: sexScale };
  }
  if (profileContext?.genetic?.fattyAcidRisk && FATTY_ACID_CONTEXT_PATHS.has(dotKey)) {
    return { score: true, flag: 'Genetic context: fatty-acid conversion variants are present; omega fatty-acid markers should be interpreted as response/context, not only intake.', weightScale: sexScale };
  }
  if (profileContext?.genetic?.bilirubinRisk && BILIRUBIN_CONTEXT_PATHS.has(dotKey)) {
    return { score: true, flag: 'Genetic context: bilirubin-handling variants are present; isolated bilirubin elevation may reflect UGT1A1/Gilbert-style biology.', weightScale: sexScale };
  }

  if (hasHormoneTherapy(profileContext, entryContext) && HORMONE_THERAPY_CONTEXT_PATHS.has(dotKey)) {
    return contextOnly(`${hit.label || input.label} shown as therapy/contraception context only; this result may not reflect endogenous axis tone.`, sexScale);
  }

  if (profileContext?.sex === 'female' && FEMALE_PHASE_HORMONES.has(dotKey)) {
    if (isPostmenopause(profileContext, entryContext)) {
      return contextOnly(`${hit.label || input.label} shown as postmenopause context only; ordinary cycling ranges would mis-score this biology.`, sexScale);
    }
    if (isCyclingFemale(profileContext, entryContext)) {
      if (hit?.phaseRange) {
        return { score: true, flag: `${hit.label || input.label} scored against ${hit.phaseLabel || 'cycle-phase'} range.`, weightScale: sexScale, rangeOverride: hit.phaseRange };
      }
      if (entryContext.cyclePhase || entryContext.cycleDay) {
        return contextOnly(`${hit.label || input.label} has cycle timing but no phase-specific range available; shown as context only rather than scored against generic population ranges.`, sexScale);
      }
      return contextOnly(`${hit.label || input.label} needs cycle day or phase before it can be scored reliably.`, sexScale);
    }
  }

  if (dotKey === 'hormones.cortisol' || dotKey === 'biostarksHormone.cortisol') {
    const time = entryContext.sampleTime || entryContext.drawTime || entryContext.collectionTime || hit?.sampleTime;
    const hour = parseSampleHour(time);
    if (hour == null) return contextOnly(`${hit.label || input.label} needs sample time before this cortisol result can be scored.`, sexScale);
    const specimen = String(hit.specimen || (dotKey.startsWith('biostarks') ? 'dried blood' : 'serum'));
    const supplied = hit.referenceRangeSource && (Number.isFinite(hit.range?.min) || Number.isFinite(hit.range?.max));
    if (supplied) {
      if (hit.referenceSampleTime && parseSampleHour(hit.referenceSampleTime) !== hour) return contextOnly('Cortisol needs a laboratory range matching this collection time.', sexScale);
      return { score: true, flag: `${hit.label || input.label}: ${specimen}, ${time}; using the supplied range.`, weightScale: sexScale,
        rangeOverride: hit.optimalRangeSource ? hit.range : hit.referenceRange, referenceRangeOverride: hit.referenceRange,
        rangeLabel: hit.optimalRangeSource ? hit.rangeLabel || 'Supplied scoring range' : 'Supplied reference range' };
    }
    if (!/^(serum|plasma|blood)$/i.test(specimen)) return contextOnly(`Cortisol from ${specimen} needs a laboratory range for that specimen and collection time; serum ranges do not apply.`, sexScale);
    const guidance = cortisolReferenceForSampleTime(time, hit?.unit);
    if (!guidance) return contextOnly('Cortisol needs a laboratory range for this collection time and unit.', sexScale);
    return { score: true, flag: `${hit.label || input.label}: ${specimen}, ${time}; representative ${guidance.label.toLowerCase()}.`, weightScale: sexScale, rangeOverride: guidance.range, rangeLabel: `Representative ${guidance.label.toLowerCase()}` };
  }

  if (dotKey === 'biochemistry.creatineKinase' && (profileContext?.recentHardTraining || entryContext.recentHardTraining)) {
    return contextOnly(`${hit.label || input.label} shown as context only because recent hard training can dominate CK.`, sexScale);
  }

  if ((dotKey === 'hormones.testosterone' || dotKey === 'hormones.freeTestosterone') && profileContext?.sex === 'male') {
    const hour = parseSampleHour(entryContext.sampleTime || entryContext.drawTime || entryContext.collectionTime);
    const hasTime = hour != null;
    if (hasTime && (hour < 7 || hour > 10)) return { score: true, limited: true, flag: `${hit.label || input.label} was collected outside the usual morning window; confirm draw timing before interpreting a low result.`, weightScale: sexScale };
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
  const add = (condition, text) => { if (condition && !flags.includes(text)) flags.push(text); };
  if (Array.isArray(profileContext?.contextFlags)) {
    for (const flag of profileContext.contextFlags) {
      const text = String(flag || '');
      if (!text) continue;
      if (scoreId === 'biologicalCoherence'
        || (scoreId === 'cardiovascularLipoprotein' && /lipid|APOE|Light context|Body context/i.test(text))
        || (scoreId === 'oneCarbonCoherence' && /methylation|B-vitamin|B12/i.test(text))
        || (scoreId === 'boneMineralSignal' && /vitamin-D|Light context/i.test(text))
        || (scoreId === 'redoxStress' && /Light context|Body context|inflammation|vitamin-D|iron/i.test(text))
        || (scoreId === 'ironHandling' && /iron-regulation/i.test(text))
        || (scoreId === 'lipidMembrane' && /fatty-acid/i.test(text))
        || (scoreId === 'liverBileSignal' && /bilirubin/i.test(text))
        || (scoreId === 'hormoneAxis' && /sex-hormone|Light context|Body context/i.test(text))
        || (scoreId === 'anabolicRecoverySignal' && /Body context|Light context|sex-hormone/i.test(text))
        || (scoreId === 'stressResilience' && /Body context|Light context/i.test(text))) {
        flags.push(text);
      }
    }
  }
  add(profileContext?.body?.lowRecovery && ['anabolicRecoverySignal', 'stressResilience', 'redoxStress'].includes(scoreId), 'Body context: low HRV/high resting HR suggests recovery pressure; do not read lab scores without current recovery state.');
  add(profileContext?.body?.sleepStrain && ['anabolicRecoverySignal', 'stressResilience', 'hormoneAxis', 'metabolicFlexibility'].includes(scoreId), 'Body context: low recent sleep can worsen glucose, inflammation, recovery, and hormone patterns.');
  add(profileContext?.light?.lowCircadianLight && ['stressResilience', 'hormoneAxis', 'metabolicFlexibility', 'anabolicRecoverySignal'].includes(scoreId), 'Light context: low morning/circadian light can affect sleep, cortisol rhythm, glucose handling, and hormone signaling.');
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
  if (scoreId !== 'anabolicRecoverySignal') return flags;
  if (profileContext.sex === 'female' && profileContext.cycleStatus && !['regular', 'perimenopause'].includes(profileContext.cycleStatus)) {
    flags.push(`Female hormone context: cycle status is ${profileContext.cycleStatus}; interpret sex-hormone recovery markers with that state, not ordinary cycling assumptions.`);
  }
  if (profileContext.hormoneTherapy) flags.push('Hormone-medication context detected; androgen/estrogen markers may reflect therapy or contraception rather than endogenous recovery tone.');
  if (profileContext.recentHardTraining) flags.push('Recent/intense training context detected; CK, AST/ALT, hs-CRP, urea, and anabolic-recovery drag may reflect training load rather than baseline recovery.');
  if (profileContext.acuteInflammationContext) flags.push('Acute illness/injury context detected; inflammation and immune markers can transiently suppress recovery scoring. Retest baseline after recovery if this was near the blood draw.');
  if (Number.isFinite(profileContext.ageYears) && profileContext.ageYears >= 50) flags.push(`Age context: ${profileContext.ageYears}y profile; DHEA-S, IGF-1, sex hormones, hemoglobin, and CK are interpreted as age-sensitive recovery context, not youth-range targets.`);
  return flags;
}
