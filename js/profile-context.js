// @ts-check
// profile-context.js — lightweight profile modifiers for deterministic scoring.

import { state } from './state.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';
import { sortHealthGoalsByPriority } from './health-goals-utils.js';
import { getCurrentSupplements } from './supplement-medication-domain.js';

/** @typedef {{
 * rollingChannelTotals: null | ((days?: number) => any),
 * rollingVitaminDIU: null | ((days?: number) => number),
 * }} ProfileContextLightDeps */

/** @type {ProfileContextLightDeps} */
const profileContextLightDeps = {
  rollingChannelTotals: null,
  rollingVitaminDIU: null,
};

/** @param {Partial<ProfileContextLightDeps>} [deps] */
export function configureProfileContextLightDeps(deps = {}) {
  const previous = { ...profileContextLightDeps };
  if ('rollingChannelTotals' in deps) {
    profileContextLightDeps.rollingChannelTotals = typeof deps.rollingChannelTotals === 'function'
      ? deps.rollingChannelTotals
      : null;
  }
  if ('rollingVitaminDIU' in deps) {
    profileContextLightDeps.rollingVitaminDIU = typeof deps.rollingVitaminDIU === 'function'
      ? deps.rollingVitaminDIU
      : null;
  }
  return previous;
}

const LOW_MUSCLE_TERMS = ['low muscle mass', 'muscle wasting', 'muscle atrophy', 'sarcopenia', 'wheelchair', 'neuromuscular', 'cmt', 'charcot', 'neuropathy', 'myopathy', 'muscular dystrophy', 'cachexia', 'amputation'];
const LOW_SUNLIGHT_TERMS = ['wheelchair', 'bedbound', 'housebound', 'minimal sun', 'minimal outdoor', 'low sunlight', 'little sun', 'no sun', 'indoors', 'homebound', 'limited mobility', 'minimal uvb', 'low uvb'];
const TRT_TERMS = ['trt', 'testosterone replacement', 'testosterone therapy', 'testosterone gel', 'testosterone injection', 'nebido', 'sustanon', 'hcg', 'clomid', 'enclomiphene', 'hrt', 'hormone replacement', 'menopausal hormone therapy', 'estrogen patch', 'estradiol patch', 'estradiol gel', 'progesterone therapy', 'micronized progesterone'];
const ACUTE_TERMS = ['acute illness', 'infection', 'fever', 'flu', 'covid', 'cold', 'virus', 'viral', 'bacterial', 'sick', 'injury', 'surgery'];
const HARD_TRAINING_TERMS = ['intense', 'hiit', 'heavy lifting', 'strength', 'marathon', 'race', 'overtraining', 'hard training', 'workout', 'training block'];
const HORMONAL_CONTRACEPTION_TERMS = ['ocp', 'pill', 'patch', 'ring', 'implant', 'mirena', 'hormonal iud', 'depo', 'injection', 'contraceptive pill', 'birth control pill'];
const NON_HORMONAL_CONTRACEPTION_TERMS = ['copper', 'copper iud', 'non-hormonal', 'non hormonal'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** @param {unknown} text @param {string[]} terms */
function textMatchesAny(text, terms) { const value = String(text || '').toLowerCase(); return terms.some(term => value.includes(term)); }

function profileContextSetting(slug, importedValue = true, ignoreContextToggles = false) {
  if (ignoreContextToggles) return true;
  return isContextSourceEnabled(slug, { defaultValue: importedValue !== false });
}

function hasMeaningfulSnp(stored) {
  const effect = String(stored?.effect || '').toLowerCase();
  const valence = String(stored?.valence || '').toLowerCase();
  return !!stored && ((effect !== 'none' && effect !== '') || valence === 'protective');
}

function isHormonalContraception(value) {
  if (value === true) return true;
  const text = String(value || '').toLowerCase();
  if (!text) return false;
  if (NON_HORMONAL_CONTRACEPTION_TERMS.some(term => text.includes(term))) return false;
  return HORMONAL_CONTRACEPTION_TERMS.some(term => text.includes(term));
}

function collectGeneticModifiers(data, options = {}) {
  const includeSummary = profileContextSetting('genetics-summary', true, options.ignoreContextToggles);
  const includePriority = profileContextSetting('genetics-priority', true, options.ignoreContextToggles);
  const genetics = data?.genetics || null;
  const snps = includePriority ? (genetics?.snps || {}) : {};
  const flags = [];
  const genes = new Set();
  const categories = new Set();
  const markerLinks = new Set();
  if (!includeSummary && !includePriority) {
    return {
      includeSummary, includePriority, hasGenetics: false, snpCount: 0, genes, categories, markerLinks,
      apoe: '', methylationRisk: false, b12Risk: false, vitaminDRisk: false, ironRisk: false,
      lipidRisk: false, fattyAcidRisk: false, bilirubinRisk: false, hormoneRisk: false, flags,
    };
  }
  for (const stored of Object.values(snps)) {
    if (!hasMeaningfulSnp(stored)) continue;
    const gene = String(stored?.gene || '').toUpperCase();
    const category = String(stored?.category || '').trim();
    if (gene) genes.add(gene);
    if (category) categories.add(category);
    for (const marker of stored?.markers || []) markerLinks.add(marker);
  }
  const apoe = (includeSummary && genetics?.apoe) || (includePriority && genes.has('APOE') ? 'APOE variant present' : '');
  const methylationRisk = ['MTHFR', 'MTR', 'MTRR', 'CBS'].some(g => genes.has(g)) || categories.has('methylation');
  const b12Risk = ['TCN2', 'FUT2', 'MTR', 'MTRR'].some(g => genes.has(g)) || categories.has('vitaminB12');
  const vitaminDRisk = ['CYP2R1', 'GC', 'VDR', 'DHCR7', 'CYP24A1'].some(g => genes.has(g)) || categories.has('vitaminD');
  const ironRisk = ['HFE', 'TMPRSS6', 'HAMP', 'TFR2'].some(g => genes.has(g)) || categories.has('iron');
  const lipidRisk = !!apoe || categories.has('lipids') || ['APOB', 'LDLR', 'LPA', 'PCSK9', 'CETP'].some(g => genes.has(g));
  const fattyAcidRisk = categories.has('fattyAcids') || ['FADS1', 'FADS2', 'ELOVL2'].some(g => genes.has(g));
  const bilirubinRisk = categories.has('bilirubin') || genes.has('UGT1A1');
  const hormoneRisk = categories.has('sexHormones') || ['SHBG', 'SRD5A2', 'CYP19A1', 'AR'].some(g => genes.has(g));
  if (methylationRisk) flags.push('Genetic context: methylation variants are present, so homocysteine and B-vitamin markers deserve tighter confidence review.');
  if (vitaminDRisk) flags.push('Genetic context: vitamin-D pathway variants are present, so 25-OH vitamin D may need stronger sunlight/intake context before calling sufficiency.');
  if (ironRisk) flags.push('Genetic context: iron-regulation variants are present; ferritin, transferrin saturation, and TIBC patterns deserve extra context.');
  if (lipidRisk) {
    const apoeLabel = apoe ? (String(apoe).toLowerCase().startsWith('apoe') ? apoe : `APOE ${apoe}`) : 'lipid-related variants';
    flags.push(`Genetic context: ${apoeLabel} may change cardiovascular/lipoprotein risk interpretation.`);
  }
  if (fattyAcidRisk) flags.push('Genetic context: fatty-acid desaturase/elongation variants may affect omega-3/omega-6 marker interpretation.');
  if (bilirubinRisk) flags.push('Genetic context: bilirubin-handling variants may explain isolated bilirubin elevation without treating it as generic liver strain.');
  if (hormoneRisk) flags.push('Genetic context: sex-hormone pathway variants may affect SHBG/androgen/estrogen interpretation.');
  const hasGenetics = !!genetics && (includeSummary || Object.keys(snps).length > 0);
  return { includeSummary, includePriority, hasGenetics, snpCount: Object.keys(snps).length, genes, categories, markerLinks, apoe, methylationRisk, b12Risk, vitaminDRisk, ironRisk, lipidRisk, fattyAcidRisk, bilirubinRisk, hormoneRisk, flags };
}

function latestMetricValue(metric, field = 'd7') {
  const v = metric?.rolling?.[field];
  return Number.isFinite(v) ? Number(v) : null;
}

function collectBodyModifiers(data, options = {}) {
  const settings = data?.biologyScoreContextSettings || {};
  const includeBody = profileContextSetting('wearables', settings.includeBodyContext, options.ignoreContextToggles);
  const summary = data?.wearableSummary || null;
  const metrics = summary?.metrics || {};
  const flags = [];
  if (!includeBody) return { includeBody, hasBodyData: false, flags };
  const hrv7 = latestMetricValue(metrics.hrv_rmssd);
  const hrvP25 = Number.isFinite(metrics.hrv_rmssd?.baselineP25) ? Number(metrics.hrv_rmssd.baselineP25) : null;
  const rhr7 = latestMetricValue(metrics.rhr);
  const rhrP75 = Number.isFinite(metrics.rhr?.baselineP75) ? Number(metrics.rhr.baselineP75) : null;
  const sleep7 = latestMetricValue(metrics.sleep_score);
  const sleepBaseline = Number.isFinite(metrics.sleep_score?.baseline) ? Number(metrics.sleep_score.baseline) : null;
  const lowRecovery = (hrv7 != null && hrvP25 != null && hrv7 < hrvP25) || (rhr7 != null && rhrP75 != null && rhr7 > rhrP75);
  const sleepStrain = sleep7 != null && sleep7 < 70 && (sleepBaseline == null || sleep7 < sleepBaseline);
  if (lowRecovery) flags.push('Body context: wearable recovery is strained (low HRV and/or high resting HR versus personal baseline).');
  if (sleepStrain) flags.push('Body context: recent sleep score is low versus target/baseline; recovery, inflammation, glucose, and hormone interpretation should account for sleep pressure.');
  return { includeBody, hasBodyData: !!summary && Object.keys(metrics).length > 0, hrv7, rhr7, sleep7, lowRecovery, sleepStrain, flags };
}

function collectLightModifiers(data, options = {}) {
  const settings = data?.biologyScoreContextSettings || {};
  const includeLight = profileContextSetting('light-sun', settings.includeLightContext, options.ignoreContextToggles);
  const flags = [];
  if (!includeLight) return { includeLight, hasLightData: false, flags };
  const now = Date.now();
  const sunSessions = Array.isArray(data?.sunSessions) ? data.sunSessions : [];
  const deviceSessions = Array.isArray(data?.deviceSessions) ? data.deviceSessions : [];
  const measurements = Array.isArray(data?.lightMeasurements) ? data.lightMeasurements : [];
  const hasLightData = sunSessions.length > 0 || deviceSessions.length > 0 || measurements.length > 0 || !!data?.sunDefaults?.completedAt || !!data?.lightCircadian;
  const recentSun = sunSessions.filter(s => Number(s?.endedAt || s?.startedAt || 0) >= now - 14 * DAY_MS);
  const recentAny = [...sunSessions, ...deviceSessions].filter(s => Number(s?.endedAt || s?.startedAt || 0) >= now - 14 * DAY_MS);
  let vitD7 = null, circadian7 = null;
  try {
    if (profileContextLightDeps.rollingVitaminDIU) {
      const total = Number(profileContextLightDeps.rollingVitaminDIU(7));
      if (Number.isFinite(total)) vitD7 = total;
    }
    if (profileContextLightDeps.rollingChannelTotals) {
      const totals = profileContextLightDeps.rollingChannelTotals(7) || {};
      if (Number.isFinite(totals.circadian)) circadian7 = Number(totals.circadian);
    }
  } catch {}
  const lowLoggedSunlight = hasLightData && recentSun.length === 0;
  const lowCircadianLight = hasLightData && ((circadian7 != null && circadian7 <= 0) || recentAny.length === 0);
  const lowVitaminDSynthesis = vitD7 != null && vitD7 < 4000;
  if (lowLoggedSunlight) flags.push('Light context: no recent outdoor sun sessions are logged; if accurate, vitamin D, inflammation, sleep, recovery, and hormone patterns may be light-constrained.');
  if (lowCircadianLight) flags.push('Light context: recent circadian-channel exposure appears absent/low; morning-light habits may be relevant to stress, sleep, glucose, and hormone patterns.');
  if (lowVitaminDSynthesis && vitD7 != null) flags.push(`Light context: logged 7-day vitamin-D synthesis is low (~${Math.round(vitD7)} IU), so low 25-OH vitamin D should be interpreted with sunlight exposure, not only supplementation.`);
  if (!hasLightData) flags.push('Light context: Light tracking is enabled by default for Biology Scores, but no light data is logged yet; scores can only infer light exposure from profile notes/labs.');
  return { includeLight, hasLightData, recentSunDays: recentSun.length, vitD7, circadian7, lowLoggedSunlight, lowCircadianLight, lowVitaminDSynthesis, flags };
}

export function getProfileAgeYears(date = new Date()) {
  if (!state.profileDob) return null;
  const dob = new Date(`${state.profileDob}T00:00:00`);
  if (!Number.isFinite(dob.getTime())) return null;
  const age = (date.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return age > 0 ? Math.floor(age) : null;
}

export function getBiologyProfileContext(options = {}) {
  const data = /** @type {{diagnoses?: any, supplements?: Array<any>, exercise?: any, sleepRest?: any, lightCircadian?: any, stress?: any, diet?: any, loveLife?: any, environment?: any, healthGoals?: Array<any>, menstrualCycle?: any, contextNotes?: string, interpretiveLens?: string, genetics?: any, wearableSummary?: any, biologyScoreContextSettings?: any, sunSessions?: Array<any>, deviceSessions?: Array<any>, lightMeasurements?: Array<any>, sunDefaults?: any}} */ (state.importedData || {});
  const includeInsightCards = profileContextSetting(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true, options.ignoreContextToggles);
  const includeSupplementsMeds = profileContextSetting(CONTEXT_SOURCE_IDS.SUPPLEMENTS_MEDS, true, options.ignoreContextToggles);
  const diagnoses = /** @type {{conditions?: Array<{name?: string, note?: string, severity?: string, status?: string}>, familyHistory?: Array<{relative?: string, condition?: string, onsetAge?: number, note?: string}>, proceduresNote?: string, note?: string, flags?: Record<string, boolean>}} */ (includeInsightCards ? (data.diagnoses || {}) : {});
  const conditions = Array.isArray(diagnoses.conditions) ? diagnoses.conditions : [];
  const flags = /** @type {Record<string, boolean>} */ (diagnoses.flags || {});
  const conditionText = conditions.map(c => `${c?.name || ''} ${c?.note || ''} ${c?.severity || ''} ${c?.status || ''}`).join(' ');
  const supplements = includeSupplementsMeds && Array.isArray(data.supplements) ? getCurrentSupplements(data.supplements).map(s => `${s?.name || ''} ${s?.note || s?.notes || ''} ${s?.type || ''}`).join(' ') : '';
  const exercise = includeInsightCards ? (data.exercise || {}) : {};
  const sleepRest = includeInsightCards ? (data.sleepRest || {}) : {};
  const stress = includeInsightCards ? (data.stress || {}) : {};
  const diet = includeInsightCards ? (data.diet || {}) : {};
  const loveLife = includeInsightCards ? (data.loveLife || {}) : {};
  const environment = includeInsightCards ? (data.environment || {}) : {};
  const light = collectLightModifiers(data, options);
  const lightCircadian = light.includeLight ? (data.lightCircadian || {}) : {};
  const healthGoalsText = includeInsightCards && Array.isArray(data.healthGoals) ? sortHealthGoalsByPriority(data.healthGoals).map(g => typeof g === 'object' ? `${g?.text || g?.goal || g?.name || ''} ${g?.severity || g?.priority || ''} ${g?.note || ''}` : String(g || '')).join(' ') : '';
  const exerciseText = `${exercise.frequency || ''} ${exercise.intensity || ''} ${exercise.duration || ''} ${exercise.dailyMovement || ''} ${exercise.muscleContext || ''} ${exercise.activityLevel || ''} ${exercise.trainingLoad || ''} ${(exercise.types || []).join(' ')} ${(exercise.limitations || []).join(' ')} ${exercise.note || exercise.notes || ''}`;
  const sleepText = `${sleepRest.quality || ''} ${sleepRest.duration || ''} ${sleepRest.daytimeSleepiness || ''} ${sleepRest.apneaStatus || ''} ${sleepRest.papUse || ''} ${sleepRest.naps || ''} ${sleepRest.schedule || ''} ${sleepRest.roomTemp || ''} ${(sleepRest.issues || []).join(' ')} ${(sleepRest.environment || []).join(' ')} ${(sleepRest.practices || []).join(' ')} ${sleepRest.notes || sleepRest.note || ''}`;
  const lightText = `${lightCircadian.amLight || lightCircadian.morningLight || ''} ${lightCircadian.daytime || lightCircadian.daylight || ''} ${lightCircadian.uvExposure || ''} ${(lightCircadian.evening || []).join(' ')} ${lightCircadian.eveningLight || ''} ${lightCircadian.screenTime || lightCircadian.screenUse || ''} ${(lightCircadian.techEnv || []).join(' ')} ${lightCircadian.cold || ''} ${lightCircadian.grounding || ''} ${(lightCircadian.mealTiming || []).join(' ')} ${lightCircadian.notes || lightCircadian.note || ''}`;
  const stressText = `${stress.level || ''} ${stress.duration || ''} ${stress.trend || ''} ${stress.workload || ''} ${stress.recovery || ''} ${(stress.sources || []).join(' ')} ${(stress.management || []).join(' ')} ${stress.notes || stress.note || ''}`;
  const dietText = `${diet.type || ''} ${diet.pattern || ''} ${diet.proteinIntake || ''} ${diet.hydration || ''} ${diet.alcohol || ''} ${diet.caffeine || ''} ${diet.caffeineTiming || ''} ${(diet.recentChanges || []).join(' ')} ${(diet.restrictions || []).join(' ')} ${diet.breakfast || ''} ${diet.lunch || ''} ${diet.dinner || ''} ${diet.snacks || ''} ${diet.bowelFrequency || ''} ${diet.stoolConsistency || ''} ${diet.bloating || ''} ${diet.gas || ''} ${diet.acidReflux || ''} ${diet.burping || ''} ${diet.nausea || ''} ${diet.appetite || ''} ${diet.abdominalPain || ''} ${(diet.foodSensitivities || []).join(' ')} ${diet.notes || diet.note || ''}`;
  const loveLifeText = `${loveLife.status || ''} ${loveLife.relationship || ''} ${loveLife.satisfaction || ''} ${loveLife.libido || ''} ${loveLife.libidoChange || ''} ${loveLife.frequency || ''} ${loveLife.orgasm || ''} ${(loveLife.reproductiveGoals || []).join(' ')} ${(loveLife.concerns || []).join(' ')} ${loveLife.notes || loveLife.note || ''}`;
  const environmentText = `${environment.setting || ''} ${environment.climate || ''} ${environment.altitude || ''} ${(environment.inhaledExposures || []).join(' ')} ${(environment.occupationalExposures || []).join(' ')} ${environment.water || ''} ${(environment.waterConcerns || []).join(' ')} ${(environment.emf || []).join(' ')} ${(environment.emfMitigation || []).join(' ')} ${environment.homeLight || ''} ${(environment.air || []).join(' ')} ${(environment.toxins || []).join(' ')} ${environment.building || ''} ${environment.sun || ''} ${environment.outdoorTime || ''} ${environment.notes || environment.note || ''}`;
  const mc = includeInsightCards ? (data.menstrualCycle || null) : null;
  const menopauseStatus = flags.postmenopause ? 'postmenopause' : (mc?.menopauseStatus || mc?.cycleStatus || null);
  const notes = [conditionText, diagnoses.proceduresNote, diagnoses.note, includeInsightCards ? data.contextNotes : '', data.interpretiveLens, supplements, exerciseText, sleepText, lightText, stressText, dietText, loveLifeText, environmentText, healthGoalsText].filter(Boolean).join(' ');
  const genetic = collectGeneticModifiers(data, options);
  const body = collectBodyModifiers(data, options);
  const allText = notes;
  // Only the explicit Medical History interpretation flag may change
  // deterministic creatinine scoring. Free-text mentions remain available as
  // advisory context, but must not silently re-enable a switch the user turned off.
  const lowMuscleMassInferred = textMatchesAny(allText, LOW_MUSCLE_TERMS);
  const lowMuscleMass = flags.lowMuscleMass === true;
  const lightContextEnabled = light.includeLight !== false;
  const lowSunlightExposure = lightContextEnabled && (
    !!flags.lowSunlight || textMatchesAny(allText, LOW_SUNLIGHT_TERMS) || !!light.lowLoggedSunlight || !!light.lowVitaminDSynthesis
  );
  const acuteInflammationContext = !!flags.acuteIllnessNearDraw || textMatchesAny(allText, ACUTE_TERMS);
  const recentHardTraining = !!flags.intenseTrainingRecent || textMatchesAny(exerciseText, HARD_TRAINING_TERMS) || textMatchesAny(includeInsightCards ? data.contextNotes : '', ['recent workout', 'trained yesterday', 'post-exercise']);
  const sex = state.profileSex === 'female' ? 'female' : state.profileSex === 'male' ? 'male' : null;
  const cycleStatus = sex === 'female' ? (flags.postmenopause ? 'postmenopause' : (mc ? (mc.cycleStatus || 'regular') : null)) : null;
  const hormoneTherapy = !!flags.hormoneTherapy || textMatchesAny(allText, TRT_TERMS) || (sex === 'female' && isHormonalContraception(mc?.contraceptive));
  return {
    sex, ageYears: getProfileAgeYears(), cycleStatus, menopauseStatus, hormoneTherapy, acuteInflammationContext, recentHardTraining, lowMuscleMass,
    lowMuscleMassInferred,
    lowMuscleReason: lowMuscleMass ? 'The Medical History low muscle mass interpretation flag is enabled, so creatinine-derived markers are treated as context rather than scored signal.' : '',
    lowSunlightExposure,
    lowSunlightReason: lowSunlightExposure ? (light.lowVitaminDSynthesis || light.lowLoggedSunlight
      ? 'Light context suggests low recent UVB/sunlight exposure. Vitamin D target is raised to 100 nmol/L (40 ng/mL) as a sufficiency floor and inflammation/recovery scores should mention light context.'
      : 'Profile context suggests minimal sunlight/UVB exposure. Vitamin D target is raised to 100 nmol/L (40 ng/mL) as a sufficiency floor rather than a bare minimum.') : '',
    genetic,
    body,
    light,
    contextFlags: [...genetic.flags, ...body.flags, ...light.flags],
  };
}
