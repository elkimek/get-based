// Typed presentation and serialization for the ordinary lifestyle forms.
import type { ProfileData } from '../types/app-state.js';
import * as options from './constants.js';
import { getSleepContextMismatch } from './lab-context-wearables.js';
export type LifestyleFormKey = 'sleepRest' | 'exercise' | 'stress' | 'loveLife';
export type LifestyleDraft = Record<string, string | string[] | null>;
export interface LifestyleOption {
  value: string;
  label: string;
}
export interface LifestyleField {
  key: string;
  id: string;
  label: string;
  multiple: boolean;
  options: readonly LifestyleOption[];
}
export interface LifestyleSection {
  title: string;
  fallback: string;
  fields: LifestyleField[];
}
export interface LifestyleFormModel {
  key: LifestyleFormKey;
  title: string;
  subtitle: string;
  message: string;
  fields: LifestyleField[];
  sections: LifestyleSection[];
  mismatch: string | null;
}
const single = (key: string, id: string, label: string, values: readonly (string | LifestyleOption)[]): LifestyleField => ({
  key, id, label, options: values.map(value => typeof value === 'string' ? {
    value, label: value
  } : value), multiple: false
});
const tags = (key: string, id: string, label: string, values: readonly (string | LifestyleOption)[]): LifestyleField => ({
  key, id, label, options: values.map(value => typeof value === 'string' ? {
    value, label: value
  } : value), multiple: true
});
export function lifestyleFormModel(key: LifestyleFormKey, data: ProfileData, sex: string | null): LifestyleFormModel {
  switch (key) {
    case 'sleepRest': return {
      key, title: 'Sleep & Rest', message: 'Sleep', subtitle: 'Sleep duration, quality, and routine add useful context to recovery and metabolic markers.',
      mismatch: getSleepContextMismatch(typeof data.sleepRest === 'object' ? data.sleepRest : null, data.wearableSummary)?.reasons.join('. ') || null,
      fields: [
        single('duration', 'sleep-duration', 'Duration', options.SLEEP_DURATIONS),
        single('quality', 'sleep-quality', 'Quality', options.SLEEP_QUALITY),
        tags('issues', 'sleep-issues', 'Sleep issues', options.SLEEP_ISSUES),
        single('daytimeSleepiness', 'sleep-daytime', 'Daytime sleepiness', options.SLEEP_DAYTIME_SLEEPINESS)
      ],
      sections: [{
          title: 'Sleep breathing and daytime rest', fallback: 'Optional apnea, treatment, and naps', fields: [
            single('apneaStatus', 'sleep-apnea-status', 'Sleep apnea status', options.SLEEP_APNEA_STATUS),
            single('papUse', 'sleep-pap-use', 'PAP / CPAP use', options.SLEEP_PAP_USE),
            single('naps', 'sleep-naps', 'Naps', options.SLEEP_NAPS)
          ]
        },
        {
          title: 'Environment and routine', fallback: 'Optional schedule, room, and sleep practices', fields: [
            single('schedule', 'sleep-schedule', 'Schedule', options.SLEEP_SCHEDULE),
            single('roomTemp', 'sleep-temp', 'Room temperature', options.SLEEP_ROOM_TEMP),
            tags('environment', 'sleep-env', 'Sleep environment', options.SLEEP_ENVIRONMENT),
            tags('practices', 'sleep-practices', 'Sleep practices', options.SLEEP_PRACTICES)
          ]
        }]
    };
    case 'exercise': return {
      key, title: 'Exercise', message: 'Exercise', subtitle: 'Your routine can affect recovery, inflammation, and several lab markers.', mismatch: null,
      fields: [
        single('frequency', 'exercise-freq', 'Frequency', options.EXERCISE_FREQ),
        tags('types', 'exercise-types', 'Types', options.EXERCISE_TYPES),
        single('intensity', 'exercise-intensity', 'Intensity', options.EXERCISE_INTENSITY)
      ],
      sections: [{
          title: 'Training details', fallback: 'Optional duration, movement, muscle, and recovery context', fields: [
            single('duration', 'exercise-duration', 'Typical session duration', options.EXERCISE_DURATION),
            single('dailyMovement', 'exercise-movement', 'Daily movement', options.DAILY_MOVEMENT),
            single('muscleContext', 'exercise-muscle', 'Muscle context', options.EXERCISE_MUSCLE_CONTEXT),
            tags('limitations', 'exercise-limitations', 'Limitations and recovery', options.EXERCISE_LIMITATIONS)
          ]
        }]
    };
    case 'stress': return {
      key, title: 'Stress', message: 'Stress profile', subtitle: 'Add only the stress patterns that feel relevant to your health context.', mismatch: null,
      fields: [single('level', 'stress-level', 'Stress level', options.STRESS_LEVELS),
      single('duration', 'stress-duration', 'Duration', options.STRESS_DURATION)],
      sections: [{
          title: 'Sources and response', fallback: 'Optional sources, trend, and stress management', fields: [
            tags('sources', 'stress-sources', 'Sources', options.STRESS_SOURCES),
            single('trend', 'stress-trend', 'Current trend', options.STRESS_TREND),
            tags('management', 'stress-mgmt', 'Stress management (what helps)', options.STRESS_MGMT)
          ]
        }]
    };
    case 'loveLife': return {
      key, title: 'Love Life & Relationships', message: 'Love life', subtitle: 'Private and optional. Share only what feels relevant to your health context.', mismatch: null,
      fields: [
        single('status', 'love-status', 'Relationship status', options.LOVE_STATUS),
        single('relationship', 'love-relationship', 'Relationship quality', options.LOVE_RELATIONSHIP),
        single('satisfaction', 'love-satisfaction', 'Overall satisfaction', options.LOVE_SATISFACTION)
      ],
      sections: [{
          title: 'Sexual health details', fallback: 'Private and optional', fields: [
            single('libido', 'love-libido', 'Libido', options.LOVE_LIBIDO),
            single('libidoChange', 'love-libido-change', 'Change from usual', options.LOVE_LIBIDO_CHANGE),
            single('frequency', 'love-frequency', 'Sexual frequency', options.LOVE_FREQUENCY),
            single('orgasm', 'love-orgasm', 'Orgasm', options.LOVE_ORGASM),
            tags('reproductiveGoals', 'love-reproductive-goals', 'Reproductive goals', options.LOVE_REPRODUCTIVE_GOALS),
            tags('concerns', 'love-concerns', 'Concerns', options.LOVE_CONCERNS.filter(value => !(sex === 'female' && value === 'erectile issues') && !(sex === 'male' && value === 'vaginal dryness')))
          ]
        }]
    };
  }
}
export function lifestyleFields(model: LifestyleFormModel): LifestyleField[] { return [...model.fields, ...model.sections.flatMap(section => section.fields)]; }
export function lifestyleDraft(model: LifestyleFormModel, data: ProfileData): LifestyleDraft {
  const current = data[model.key];
  const values: Record<string, unknown> = current && typeof current === 'object' ? current : {};
  const draft: LifestyleDraft = {
    note: typeof values.note === 'string' ? values.note : ''
  };
  for (const field of lifestyleFields(model)) {
    const value = values[field.key];
    draft[field.key] = field.multiple ? field.options.filter(option => Array.isArray(value) && (value.includes(option.value) || value.includes(option.label))).map(option => option.value) : field.options.find(option => option.value === value || option.label === value)?.value || null;
  }
  return draft;
}
const exclusions = [
  ['no screens 1-2h before bed', 'screen in bed'], ['dim lights after sunset', 'bright lights until bed'], ['early dinner (before 6pm)', 'late dinner (after 8pm)']
];
export function toggleLifestyleChoice(field: LifestyleField, draft: LifestyleDraft, value: string): void {
  if (!field.options.some(option => option.value === value))
    return;
  if (!field.multiple) {
    draft[field.key] = draft[field.key] === value ? null : value;
    return;
  }
  const answer = draft[field.key];
  const selected = Array.isArray(answer) ? answer : [];
  const removing = selected.includes(value);
  const incompatible = new Set(exclusions.filter(pair => pair.includes(value)).flat().filter(item => item !== value));
  const next = removing ? selected.filter(item => item !== value) : [...selected.filter(item => value.toLowerCase() !== 'none' && item.toLowerCase() !== 'none' && !incompatible.has(item)), value];
  // Keep the canonical option order, matching the previous form serialization.
  draft[field.key] = field.options.filter(option => next.includes(option.value)).map(option => option.value);
}
export function lifestyleSectionSummary(section: LifestyleSection, draft: LifestyleDraft): string {
  const answers = [...new Set(section.fields.flatMap(field => draft[field.key] || []).filter(Boolean))];
  return answers.length ? `${answers.slice(0, 3).join(' · ')}${answers.length > 3 ? ` · +${answers.length - 3} more` : ''}` : section.fallback;
}
/** An explicit projection keeps UI-only state out of stored profile data. */
export function applyLifestyleDraft(data: ProfileData, key: LifestyleFormKey, draft: LifestyleDraft | null): void {
  const text = (key: string): string => typeof draft?.[key] === 'string' ? draft[key].trim() : '';
  const one = (key: string): string | null => text(key) || null;
  const many = (key: string): string[] => Array.isArray(draft?.[key]) ? [...draft[key]] : [];
  const empty = draft === null || Object.values(draft).every(value => Array.isArray(value) ? !value.length : !value?.trim());
  const note = text('note');
  switch (key) {
    case 'sleepRest':
      data.sleepRest = empty ? null : {
        duration: one('duration'), quality: one('quality'), issues: many('issues'), daytimeSleepiness: one('daytimeSleepiness'), apneaStatus: one('apneaStatus'), papUse: one('papUse'), naps: one('naps'), schedule: one('schedule'), roomTemp: one('roomTemp'), environment: many('environment'), practices: many('practices'), note
      };
      break;
    case 'exercise':
      data.exercise = empty ? null : {
        frequency: one('frequency'), types: many('types'), intensity: one('intensity'), duration: one('duration'), dailyMovement: one('dailyMovement'), muscleContext: one('muscleContext'), limitations: many('limitations'), note
      };
      break;
    case 'stress':
      data.stress = empty ? null : {
        level: one('level'), duration: one('duration'), trend: one('trend'), sources: many('sources'), management: many('management'), note
      };
      break;
    case 'loveLife':
      data.loveLife = empty ? null : {
        status: one('status'), relationship: one('relationship'), satisfaction: one('satisfaction'), libido: one('libido'), libidoChange: one('libidoChange'), frequency: one('frequency'), orgasm: one('orgasm'), reproductiveGoals: many('reproductiveGoals'), concerns: many('concerns'), note
      };
      break;
  }
}
