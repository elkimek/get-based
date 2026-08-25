// @ts-check
// context-card-summaries.js - Context card metadata, summaries, and filled-state helpers

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { getEMFSeverity } from './schema.js';
import { sortHealthGoalsByPriority } from './health-goals-utils.js';

export const CONTEXT_CARD_KEYS = [
  'healthGoals',
  'diagnoses',
  'diet',
  'exercise',
  'sleepRest',
  'lightCircadian',
  'stress',
  'loveLife',
  'environment',
];

export function getEMFAssessments() {
  const assessments = state.importedData.emfAssessment?.assessments;
  return Array.isArray(assessments) ? assessments : [];
}

function getEMFSummary() {
  const assessments = getEMFAssessments();
  if (!assessments.length) return '';
  const sorted = [...assessments].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const latest = sorted[0];
  let worst = null, worstIdx = -1;
  const tierOrder = ['green', 'yellow', 'orange', 'red'];
  for (const room of latest.rooms || []) {
    const sleeping = room.sleeping !== false;
    for (const [type, m] of Object.entries(room.measurements || {})) {
      if (m && m.value != null) {
        const sev = getEMFSeverity(type, m.value, sleeping);
        if (sev) {
          const idx = tierOrder.indexOf(sev.color);
          if (idx > worstIdx) { worst = sev; worstIdx = idx; }
        }
      }
    }
  }
  const fmtDate = d => {
    const parsed = new Date(d + 'T00:00:00');
    if (Number.isNaN(parsed.getTime())) return String(d || 'saved');
    return parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  const latestText = latest.date ? fmtDate(latest.date) : 'saved';
  return `EMF: ${sorted.length} assessment${sorted.length > 1 ? 's' : ''} (latest: ${latestText}${worst ? ', ' + worst.label : ''})`;
}

export function renderEMFAssessmentLauncher({ inModal = false, surface = 'environment-editor' } = {}) {
  const assessments = getEMFAssessments();
  const hasAssessments = assessments.length > 0;
  const summary = hasAssessments
    ? getEMFSummary()
    : 'Room-by-room Baubiologie workflow with readings, photos, comparison, and AI interpretation.';
  const kicker = hasAssessments
    ? `${assessments.length} saved`
    : 'Environment tool';
  const title = hasAssessments ? 'Open EMF assessment' : 'Start EMF assessment';
  const cta = hasAssessments ? 'Open' : 'Start';
  return `<button type="button" class="ctx-emf-launcher${hasAssessments ? ' has-data' : ''}" data-context-card-action="open-emf-assessment" data-context-card-close-modal="${inModal ? 'true' : 'false'}" data-umami-event="${escapeAttr('emf-launcher-' + surface)}">
    <span class="ctx-emf-launcher-mark" aria-hidden="true">EMF</span>
    <span class="ctx-emf-launcher-copy">
      <span class="ctx-emf-launcher-kicker">${escapeHTML(kicker)}</span>
      <strong>${escapeHTML(title)}</strong>
      <span>${escapeHTML(summary)}</span>
    </span>
    <span class="ctx-emf-launcher-action">${escapeHTML(cta)}</span>
  </button>`;
}

export function getConditionsSummary(d) {
  if (!d) return '';
  const parts = [];
  if (d.conditions && d.conditions.length) parts.push(d.conditions.map(c => {
    let s = c.name;
    if (c.severity && c.severity !== 'mild') s += ` (${c.severity})`;
    if (c.status) s += ` · ${c.status}`;
    if (c.since) s += ` since ${c.since}`;
    return s;
  }).join(', '));
  if (Array.isArray(d.familyHistory) && d.familyHistory.length) {
    const fh = d.familyHistory.map(e => {
      // Compact form: "father MI@52" / "mother T2D" keeps the dashboard chip readable.
      const rel = e.relative ? e.relative.replace(/^maternal_/, 'mat. ').replace(/^paternal_/, 'pat. ').replace(/_/g, ' ') : '';
      const age = (e.onsetAge != null && e.onsetAge !== '') ? `@${e.onsetAge}` : '';
      return `${rel} ${e.condition || ''}${age}`.trim();
    }).join(', ');
    parts.push(`Family: ${fh}`);
  }
  if (d.proceduresNote) parts.push(`Procedures: ${d.proceduresNote}`);
  if (d.note) parts.push(d.note);
  return parts.join(' \u2014 ');
}

export function getDietSummary(d) {
  if (!d) return '';
  const parts = [];
  if (d.type) parts.push(d.type);
  if (d.pattern) parts.push(d.pattern);
  if (d.proteinIntake) parts.push(`usual self-report protein: ${d.proteinIntake}`);
  if (d.hydration) parts.push(`usual self-report fluids: ${d.hydration}`);
  if (d.restrictions && d.restrictions.length) parts.push(d.restrictions.join(', '));
  if (d.alcohol) parts.push(`alcohol: ${d.alcohol}`);
  if (d.caffeine) parts.push(`caffeine: ${d.caffeine}`);
  if (d.caffeineTiming) parts.push(d.caffeineTiming);
  if (d.recentChanges && d.recentChanges.length) parts.push(d.recentChanges.join(', '));
  if (d.breakfast) parts.push('B: ' + d.breakfast);
  if (d.lunch) parts.push('L: ' + d.lunch);
  if (d.dinner) parts.push('D: ' + d.dinner);
  if (d.snacks) parts.push('S: ' + d.snacks);
  if (d.bowelFrequency) parts.push(d.bowelFrequency);
  if (d.stoolConsistency) parts.push(d.stoolConsistency);
  if (d.bloating && d.bloating !== 'none') parts.push('bloating: ' + d.bloating);
  if (d.gas && d.gas !== 'none') parts.push('gas: ' + d.gas);
  if (d.acidReflux && d.acidReflux !== 'none') parts.push('reflux: ' + d.acidReflux);
  if (d.burping && d.burping !== 'none') parts.push('burping: ' + d.burping);
  if (d.nausea && d.nausea !== 'none') parts.push('nausea: ' + d.nausea);
  if (d.appetite && d.appetite !== 'normal') parts.push('appetite: ' + d.appetite);
  if (d.abdominalPain && d.abdominalPain !== 'none') parts.push('pain: ' + d.abdominalPain);
  if (d.foodSensitivities && d.foodSensitivities.length) parts.push('sensitivities: ' + d.foodSensitivities.join(', '));
  if (d.note) parts.push(d.note);
  return parts.join(', ');
}

export function getExerciseSummary(d) {
  if (!d) return '';
  const parts = [];
  if (d.frequency) parts.push(d.frequency);
  if (d.types && d.types.length) parts.push(d.types.join(', '));
  if (d.intensity) parts.push(d.intensity);
  if (d.duration) parts.push(`${d.duration} sessions`);
  if (d.dailyMovement) parts.push(d.dailyMovement);
  if (d.muscleContext) parts.push(d.muscleContext);
  if (d.limitations && d.limitations.length) parts.push(d.limitations.join(', '));
  if (d.note) parts.push(d.note);
  return parts.join(', ');
}

export function getSleepSummary(d) {
  if (!d) return '';
  const parts = [];
  if (d.duration) parts.push(d.duration);
  if (d.quality) parts.push(d.quality + ' quality');
  if (d.daytimeSleepiness) parts.push(`${d.daytimeSleepiness} daytime sleepiness`);
  if (d.apneaStatus) parts.push(`apnea: ${d.apneaStatus}`);
  if (d.papUse) parts.push(`PAP: ${d.papUse}`);
  if (d.naps) parts.push(`naps: ${d.naps}`);
  if (d.schedule) parts.push(d.schedule);
  if (d.roomTemp) parts.push(d.roomTemp);
  if (d.issues && d.issues.length) parts.push(d.issues.join(', '));
  if (d.environment && d.environment.length) parts.push(d.environment.join(', '));
  if (d.practices && d.practices.length) parts.push(d.practices.join(', '));
  if (d.note) parts.push(d.note);
  return parts.join(', ');
}

export function getLightCircadianSummary(d) {
  if (!d) return '';
  const parts = [];
  if (d.amLight) parts.push(d.amLight);
  if (d.daytime) parts.push(d.daytime);
  if (d.uvExposure) parts.push(d.uvExposure);
  if (d.skinType) parts.push('skin ' + d.skinType);
  if (d.evening && d.evening.length) parts.push(d.evening.join(', '));
  if (d.screenTime) parts.push(d.screenTime + ' screens');
  if (d.techEnv && d.techEnv.length) parts.push(d.techEnv.join(', '));
  if (d.cold) parts.push(d.cold);
  if (d.grounding) parts.push(d.grounding);
  if (d.mealTiming && d.mealTiming.length) parts.push(d.mealTiming.join(', '));
  if (d.note) parts.push(d.note);
  return parts.join(', ');
}

export function getStressSummary(d) {
  if (!d) return '';
  const parts = [];
  if (d.level) parts.push(d.level + ' stress');
  if (d.duration) parts.push(d.duration);
  if (d.trend) parts.push(d.trend);
  if (d.sources && d.sources.length) parts.push(d.sources.join(', '));
  if (d.management && d.management.length) parts.push('manages: ' + d.management.join(', '));
  if (d.note) parts.push(d.note);
  return parts.join(' \u2014 ');
}

export function getLoveLifeSummary(d) {
  if (!d) return '';
  const parts = [];
  if (d.status) parts.push(d.status);
  if (d.relationship) parts.push(d.relationship);
  if (d.satisfaction) parts.push(d.satisfaction);
  if (d.libido) parts.push(d.libido + ' libido');
  if (d.libidoChange) parts.push(`libido ${d.libidoChange}`);
  if (d.frequency) parts.push(d.frequency);
  if (d.orgasm) parts.push('orgasm: ' + d.orgasm);
  if (d.concerns && d.concerns.length) parts.push(d.concerns.join(', '));
  if (d.reproductiveGoals && d.reproductiveGoals.length) parts.push(d.reproductiveGoals.join(', '));
  if (d.note) parts.push(d.note);
  return parts.join(', ');
}

export function getEnvironmentSummary(d) {
  const parts = [];
  if (d) {
    if (d.setting) parts.push(d.setting);
    if (d.climate) parts.push(d.climate);
    if (d.altitude) parts.push(d.altitude);
    if (d.inhaledExposures && d.inhaledExposures.length) parts.push(d.inhaledExposures.join(', '));
    if (d.occupationalExposures && d.occupationalExposures.length) parts.push(d.occupationalExposures.join(', '));
    if (d.water) parts.push(d.water);
    if (d.waterConcerns && d.waterConcerns.length) parts.push(d.waterConcerns.join(', '));
    if (d.emf && d.emf.length) parts.push(d.emf.length + ' EMF source' + (d.emf.length > 1 ? 's' : ''));
    if (d.emfMitigation && d.emfMitigation.length) parts.push(d.emfMitigation.length + ' EMF mitigation');
    if (d.homeLight) parts.push(d.homeLight);
    if (d.air && d.air.length) parts.push(d.air.join(', '));
    if (d.toxins && d.toxins.length) parts.push(d.toxins.length + ' toxin exposure' + (d.toxins.length > 1 ? 's' : ''));
    if (d.building) parts.push(d.building);
    if (d.note) parts.push(d.note);
  }
  const emfSummary = getEMFSummary();
  if (emfSummary) parts.push(emfSummary);
  return parts.join(', ');
}

export function getGoalsSummary() {
  const healthGoals = state.importedData.healthGoals || [];
  if (healthGoals.length === 0) return '';
  const texts = sortHealthGoalsByPriority(healthGoals).slice(0, 3).map(g => g.text);
  const summary = texts.join(', ');
  if (healthGoals.length > 3) return summary + ` +${healthGoals.length - 3} more`;
  return summary;
}

export function isContextFilled(key) {
  if (key === 'healthGoals') return (state.importedData.healthGoals || []).length > 0;
  if (key === 'environment') return state.importedData.environment != null || getEMFAssessments().length > 0;
  return state.importedData[key] != null;
}

const CONTEXT_ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false"';

function contextIcon(body) {
  return `<svg ${CONTEXT_ICON_ATTRS} aria-hidden="true">${body}</svg>`;
}

const CONTEXT_ICONS = {
  healthGoals: contextIcon('<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path>'),
  diagnoses: contextIcon('<rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M9 3.5h6V7H9zM12 10v7M8.5 13.5h7"></path>'),
  diet: contextIcon('<path d="M6 3v6a3 3 0 0 0 6 0V3M9 3v18M17 3v18M17 3c2.5 2 3.5 4.5 3.5 8H17"></path>'),
  exercise: contextIcon('<path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12"></path>'),
  sleepRest: contextIcon('<path d="M20.5 14.5A8 8 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"></path>'),
  lightCircadian: contextIcon('<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>'),
  stress: contextIcon('<path d="M9.5 3a3.5 3.5 0 0 0-3 5.3M14.5 3a3.5 3.5 0 0 1 3 5.3M6.5 8.3A4 4 0 0 0 4 12c0 1.7.7 3.2 1.8 4.3M17.5 8.3A4 4 0 0 1 20 12c0 1.7-.7 3.2-1.8 4.3M9 21a2 2 0 0 1-2-2v-2M15 21a2 2 0 0 0 2-2v-2M12 6v15"></path>'),
  loveLife: contextIcon('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"></path>'),
  environment: contextIcon('<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path>'),
};

export function getContextCardDefs() {
  return [
    { key: 'healthGoals', icon: CONTEXT_ICONS.healthGoals, label: 'Health Goals', editor: 'openHealthGoalsEditor', tooltip: 'Define what you\'re trying to solve or improve. AI prioritizes analysis around your stated goals.', placeholder: 'Add health goals', summaryFn: getGoalsSummary },
    { key: 'diagnoses', icon: CONTEXT_ICONS.diagnoses, label: 'Medical History', editor: 'openDiagnosesEditor', tooltip: 'Your diagnoses + family history shape how lab markers should be interpreted. What\'s abnormal for most may be expected for you; a parent\'s heart attack at 52 reframes a borderline LDL.', placeholder: 'Add diagnoses or family history', summaryFn: () => getConditionsSummary(state.importedData.diagnoses) },
    { key: 'diet', icon: CONTEXT_ICONS.diet, label: 'Diet & Digestion', editor: 'openDietEditor', tooltip: 'Nutrition and digestion directly affect blood markers \u2014 diet type impacts lipids, B12, iron; GI symptoms correlate with inflammation and nutrient absorption.', placeholder: 'Describe your diet & digestion', summaryFn: () => getDietSummary(state.importedData.diet) },
    { key: 'exercise', icon: CONTEXT_ICONS.exercise, label: 'Exercise', editor: 'openExerciseEditor', tooltip: 'Training type and intensity affect CK, liver enzymes, cholesterol, and inflammatory markers.', placeholder: 'Describe your routine', summaryFn: () => getExerciseSummary(state.importedData.exercise) },
    { key: 'sleepRest', icon: CONTEXT_ICONS.sleepRest, label: 'Sleep & Rest', editor: 'openSleepRestEditor', tooltip: 'Sleep duration and quality directly affect inflammation, insulin sensitivity, cortisol, and immune function.', placeholder: 'Describe your sleep', summaryFn: () => getSleepSummary(state.importedData.sleepRest) },
    { key: 'lightCircadian', icon: CONTEXT_ICONS.lightCircadian, label: 'Light & Circadian', editor: 'openLightCircadianEditor', tooltip: 'Light, cold, grounding, screen time, and meal timing drive circadian rhythm, hormones, melatonin, cortisol, and metabolic health.', placeholder: 'Describe your light habits', summaryFn: () => getLightCircadianSummary(state.importedData.lightCircadian) },
    { key: 'stress', icon: CONTEXT_ICONS.stress, label: 'Stress', editor: 'openStressEditor', tooltip: 'Chronic stress elevates cortisol, disrupts thyroid function, raises inflammation, and impairs immune response.', placeholder: 'Rate your stress level', summaryFn: () => getStressSummary(state.importedData.stress) },
    { key: 'loveLife', icon: CONTEXT_ICONS.loveLife, label: 'Love Life & Relationships', editor: 'openLoveLifeEditor', tooltip: 'Sexual health and relationships directly affect hormones (testosterone, estrogen, oxytocin, cortisol), immune function, and cardiovascular markers.', placeholder: 'Share your status', summaryFn: () => getLoveLifeSummary(state.importedData.loveLife) },
    { key: 'environment', icon: CONTEXT_ICONS.environment, label: 'Environment', editor: 'openEnvironmentEditor', tooltip: 'Water quality, EMF exposure, air quality, toxins, and building materials shape mitochondrial function, inflammation, hormones, and oxidative stress.', placeholder: 'Describe your environment', summaryFn: () => getEnvironmentSummary(state.importedData.environment) },
  ];
}
