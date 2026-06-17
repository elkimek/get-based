// @ts-check
// profile-context.js — lightweight profile modifiers for deterministic scoring.

import { state } from './state.js';

const LOW_MUSCLE_TERMS = ['low muscle mass', 'muscle wasting', 'muscle atrophy', 'sarcopenia', 'wheelchair', 'neuromuscular', 'cmt', 'charcot', 'neuropathy', 'myopathy', 'muscular dystrophy', 'cachexia', 'amputation'];
const LOW_SUNLIGHT_TERMS = ['wheelchair', 'bedbound', 'housebound', 'minimal sun', 'minimal outdoor', 'low sunlight', 'little sun', 'no sun', 'indoors', 'homebound', 'limited mobility', 'minimal uvb', 'low uvb'];
const TRT_TERMS = ['trt', 'testosterone replacement', 'testosterone therapy', 'testosterone gel', 'testosterone injection', 'nebido', 'sustanon', 'hcg', 'clomid', 'enclomiphene'];
const ACUTE_TERMS = ['acute illness', 'infection', 'fever', 'flu', 'covid', 'cold', 'virus', 'viral', 'bacterial', 'sick', 'injury', 'surgery'];
const HARD_TRAINING_TERMS = ['intense', 'hiit', 'heavy lifting', 'strength', 'marathon', 'race', 'overtraining', 'hard training', 'workout', 'training block'];

/** @param {unknown} text @param {string[]} terms */
function textMatchesAny(text, terms) { const value = String(text || '').toLowerCase(); return terms.some(term => value.includes(term)); }

export function getProfileAgeYears(date = new Date()) {
  if (!state.profileDob) return null;
  const dob = new Date(`${state.profileDob}T00:00:00`);
  if (!Number.isFinite(dob.getTime())) return null;
  const age = (date.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return age > 0 ? Math.floor(age) : null;
}

export function getBiologyProfileContext() {
  const data = /** @type {{diagnoses?: any, supplements?: Array<any>, exercise?: any, menstrualCycle?: any, contextNotes?: string, interpretiveLens?: string}} */ (state.importedData || {});
  const diagnoses = /** @type {{conditions?: Array<{name?: string, note?: string, severity?: string}>, note?: string, flags?: Record<string, boolean>}} */ (data.diagnoses || {});
  const conditions = Array.isArray(diagnoses.conditions) ? diagnoses.conditions : [];
  const flags = /** @type {Record<string, boolean>} */ (diagnoses.flags || {});
  const conditionText = conditions.map(c => `${c?.name || ''} ${c?.note || ''} ${c?.severity || ''}`).join(' ');
  const supplements = Array.isArray(data.supplements) ? data.supplements.map(s => `${s?.name || ''} ${s?.note || ''} ${s?.type || ''}`).join(' ') : '';
  const exercise = data.exercise || {};
  const exerciseText = `${exercise.frequency || ''} ${exercise.intensity || ''} ${(exercise.types || []).join(' ')} ${exercise.note || ''}`;
  const mc = data.menstrualCycle || null;
  const notes = [diagnoses.note, data.contextNotes, data.interpretiveLens, supplements, exerciseText].filter(Boolean).join(' ');
  const allText = `${conditionText} ${notes}`;
  const lowMuscleMass = !!flags.lowMuscleMass || textMatchesAny(allText, LOW_MUSCLE_TERMS);
  const lowSunlightExposure = !!flags.lowSunlight || textMatchesAny(allText, LOW_SUNLIGHT_TERMS);
  const acuteInflammationContext = !!flags.acuteIllnessNearDraw || textMatchesAny(allText, ACUTE_TERMS);
  const recentHardTraining = !!flags.intenseTrainingRecent || textMatchesAny(exerciseText, HARD_TRAINING_TERMS) || textMatchesAny(data.contextNotes, ['recent workout', 'trained yesterday', 'post-exercise']);
  const sex = state.profileSex === 'female' ? 'female' : state.profileSex === 'male' ? 'male' : null;
  const cycleStatus = sex === 'female' ? (flags.postmenopause ? 'postmenopause' : (mc ? (mc.cycleStatus || 'regular') : null)) : null;
  const hormoneTherapy = !!flags.hormoneTherapy || textMatchesAny(allText, TRT_TERMS) || (sex === 'female' && !!mc?.contraceptive);
  return {
    sex, ageYears: getProfileAgeYears(), cycleStatus, hormoneTherapy, acuteInflammationContext, recentHardTraining, lowMuscleMass,
    lowMuscleReason: lowMuscleMass ? 'Profile context suggests low muscle mass / neuromuscular disease, so creatinine-derived markers are treated as context rather than scored signal.' : '',
    lowSunlightExposure,
    lowSunlightReason: lowSunlightExposure ? 'Profile context suggests minimal sunlight/UVB exposure. Vitamin D target is raised to 100 nmol/L (40 ng/mL) as a sufficiency floor rather than a bare minimum.' : '',
  };
}
