// Typed presentation and serialization for the ordinary lifestyle forms.
import type { ProfileData } from '../types/app-state.js';
import * as options from './constants.js';
import { EYEWEAR_OPTIONS, HOME_LIGHT_OPTIONS, ottScoreToLabel } from './sun-defaults-model.js';
import { formatTime, getTimeFormat, parseTimeInput } from './theme.js';
import { emfAssessmentLauncherView } from './context-emf-launcher-model.js';
import type { EMFLauncherView } from './context-emf-launcher-model.js';
import { getSleepContextMismatch } from './lab-context-wearables.js';
export type LifestyleFormKey = 'sleepRest' | 'exercise' | 'stress' | 'loveLife' | 'diet' | 'environment' | 'lightCircadian' | 'interpretiveLens';
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
  meals?: { disabled: boolean; timePlaceholder: string };
  emf?: EMFLauncherView;
  summaryPrefix?: string;
  summaryFields?: Array<{ key: string; prefix?: string; suffix?: string; omit?: string }>;
}
export const lifestyleMeals = [
  { key: 'breakfast', label: 'Breakfast', placeholder: 'Breakfast — e.g. eggs, avocado, coffee' },
  { key: 'lunch', label: 'Lunch', placeholder: 'Lunch — e.g. salad with grilled chicken' },
  { key: 'dinner', label: 'Dinner', placeholder: 'Dinner — e.g. salmon, rice, vegetables' },
  { key: 'snacks', label: 'Snacks', placeholder: 'Snacks — e.g. nuts, fruit, dark chocolate' },
] as const;
export interface LifestyleLightSetup {
  populated: boolean;
  rows: Array<{ label: string; value: string }>;
  burden: { label: string; tier: number | null } | null;
}
export function lifestyleLightSetup(data: ProfileData): LifestyleLightSetup {
  const defaults = data.sunDefaults;
  const skin = data.lightCircadian?.skinType || (defaults?.fitzpatrick ? String(defaults.fitzpatrick) : null);
  const burden = typeof defaults?.ottScore === 'number' ? ottScoreToLabel(defaults.ottScore)
    : defaults?.skipped ? { label: 'skipped', tier: null } : null;
  return {
    populated: !!(skin || defaults?.homeLight || defaults?.eyewear || burden), burden,
    rows: [
      { label: 'Skin type', value: skin || '—' },
      { label: 'Home lighting', value: HOME_LIGHT_OPTIONS.find(option => option.key === defaults?.homeLight)?.label || defaults?.homeLight || '—' },
      { label: 'Eyewear outside', value: EYEWEAR_OPTIONS.find(option => option.key === defaults?.eyewear)?.label || defaults?.eyewear || '—' }
    ]
  };
}
export interface LifestyleFormModel {
  key: LifestyleFormKey;
  title: string;
  subtitle: string;
  message: string;
  fields: LifestyleField[];
  sections: LifestyleSection[];
  mismatch: string | null;
  textField?: { key: string; id: string; label: string; placeholder: string };
  backToContext?: boolean;
  lightSetup?: LifestyleLightSetup;
  latitude?: string | null;
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
export function lifestyleFormModel(key: LifestyleFormKey, data: ProfileData, sex: string | null, preferences: { unitSystem?: string; mealsPaused?: boolean; latitude?: string | null } = {}): LifestyleFormModel {
  switch (key) {
    case 'interpretiveLens': return {
      key, title: 'Interpretive Lens', message: 'Interpretive lens', mismatch: null,
      subtitle: 'List researchers, clinicians, or scientific paradigms whose frameworks you follow. The AI will consider their perspectives when interpreting your results.',
      fields: [], sections: [], backToContext: true,
      textField: { key: 'text', id: 'interpretive-lens-textarea', label: 'Interpretive lens', placeholder: 'e.g. Longevity medicine, quantum biology, functional endocrinology framework...' }
    };
    case 'lightCircadian': return {
      key, title: 'Light & Circadian', message: 'Light & circadian', mismatch: null,
      subtitle: 'Light, screen, and meal-timing habits help frame circadian and metabolic patterns.',
      lightSetup: lifestyleLightSetup(data), latitude: preferences.latitude || null,
      fields: [
        single('amLight', 'light-am', 'Morning light', options.LIGHT_AM),
        single('daytime', 'light-daytime', 'Daytime outdoor exposure', options.LIGHT_DAYTIME),
        single('uvExposure', 'light-uv', 'UV / sun exposure', options.LIGHT_UV)
      ],
      sections: [
        { title: 'Evening and technology', fallback: 'Optional screens, lighting, and device environment', fields: [
          tags('evening', 'light-evening', 'Evening light discipline', options.LIGHT_EVENING),
          single('screenTime', 'light-screen', 'Daily screen time', options.LIGHT_SCREEN_TIME),
          tags('techEnv', 'light-tech', 'Technology environment', options.LIGHT_TECH_ENV)
        ] },
        { title: 'Other circadian signals', fallback: 'Optional cold, grounding, and meal timing', fields: [
          single('cold', 'light-cold', 'Cold exposure', options.LIGHT_COLD),
          single('grounding', 'light-grounding', 'Grounding / earthing', options.LIGHT_GROUNDING),
          tags('mealTiming', 'light-meal', 'Meal timing signals', options.LIGHT_MEAL_TIMING)
        ] }
      ]
    };
    case 'environment': {
      const assessments = data.emfAssessment?.assessments;
      const emf = emfAssessmentLauncherView(Array.isArray(assessments) ? assessments : []);
      return {
        key, title: 'Environment & Exposures', message: 'Environment', mismatch: null,
        subtitle: 'Your location, air, water, work, and home environment can add context to health and lab patterns.',
        fields: [
          single('setting', 'env-setting', 'Living setting', options.ENV_SETTING),
          single('climate', 'env-climate', 'Climate', options.ENV_CLIMATE),
          single('altitude', 'env-altitude', 'Altitude exposure', options.ENV_ALTITUDE),
          tags('inhaledExposures', 'env-inhaled', 'Smoking and inhaled exposure', options.ENV_INHALED_EXPOSURES)
        ],
        sections: [
          { title: 'Work and hobby exposures', fallback: 'Optional dusts, fumes, chemicals, metals, and radiation', fields: [
            tags('occupationalExposures', 'env-occupational', 'Known exposures', options.ENV_OCCUPATIONAL_EXPOSURES)
          ] },
          { title: 'Water', fallback: 'Optional source and concerns', fields: [
            single('water', 'env-water', 'Primary water source', options.ENV_WATER),
            tags('waterConcerns', 'env-water-concerns', 'Water concerns', options.ENV_WATER_CONCERNS)
          ] },
          { title: 'EMF', fallback: 'Optional exposure assessment', emf,
            summaryPrefix: emf.count ? `${emf.count} saved assessment${emf.count === 1 ? '' : 's'}` : '',
            summaryFields: [{ key: 'emf' }, { key: 'emfMitigation' }],
            fields: emf.hasAssessments ? [] : [
              tags('emf', 'env-emf', 'EMF exposure', options.ENV_EMF),
              tags('emfMitigation', 'env-emf-mit', 'EMF mitigation', options.ENV_EMF_MITIGATION)
            ] },
          { title: 'Home and exposures', fallback: 'Optional lighting, air, toxins, and building', fields: [
            single('homeLight', 'env-light', 'Home/work lighting', options.ENV_HOME_LIGHT),
            tags('air', 'env-air', 'Air quality', options.ENV_AIR),
            tags('toxins', 'env-toxins', 'Toxin exposure', options.ENV_TOXINS),
            single('building', 'env-building', 'Building', options.ENV_BUILDING)
          ] }
        ]
      };
    }
    case 'diet': {
      const current = data.diet && typeof data.diet === 'object' ? data.diet : null;
      const legacy = (values: readonly (string | LifestyleOption)[], selected: string | null | undefined) =>
        !selected || values.some(value => (typeof value === 'string' ? value : value.value) === selected)
          ? values : [...values, { value: selected, label: `Previous estimate: ${selected}` }];
      const usLabels: Record<string, string> = {
        '<1.5 L/day': '<51 fl oz/day', '1.5–2 L/day': '51–68 fl oz/day',
        '2–3 L/day': '68–101 fl oz/day', '>3 L/day': '>101 fl oz/day',
      };
      const hydration = options.DIET_HYDRATION.map(value => ({ value, label: preferences.unitSystem === 'US' ? usLabels[value] || value : value }));
      return {
        key, title: 'Diet & Digestion', message: 'Diet & Digestion', mismatch: null,
        subtitle: 'Your usual eating pattern and digestive symptoms can help explain lab trends.',
        fields: [
          single('type', 'diet-type', 'Diet type', options.DIET_TYPES),
          single('pattern', 'diet-pattern', 'Eating pattern', options.DIET_PATTERNS),
          single('proteinIntake', 'diet-protein', 'Protein intake (g/kg/day)', legacy(options.DIET_PROTEIN_INTAKE, current?.proteinIntake)),
          single('hydration', 'diet-hydration', `Daily fluid intake (${preferences.unitSystem === 'US' ? 'fl oz/day' : 'L/day'})`, legacy(hydration, current?.hydration))
        ],
        sections: [
          { title: 'Intake and recent changes', fallback: 'Optional restrictions, alcohol, caffeine, and recent changes',
            summaryFields: [{ key: 'restrictions' }, { key: 'alcohol', prefix: 'alcohol: ' }, { key: 'caffeine', prefix: 'caffeine: ' }, { key: 'recentChanges' }], fields: [
            tags('restrictions', 'diet-restrictions', 'Restrictions', options.DIET_RESTRICTIONS),
            single('alcohol', 'diet-alcohol', 'Alcohol', options.DIET_ALCOHOL),
            single('caffeine', 'diet-caffeine', 'Caffeine', options.DIET_CAFFEINE),
            single('caffeineTiming', 'diet-caffeine-timing', 'Latest caffeine', options.DIET_CAFFEINE_TIMING),
            tags('recentChanges', 'diet-recent-changes', 'Changes in the past 3 months', options.DIET_RECENT_CHANGES)
          ] },
          { title: 'Typical meals', fallback: 'Optional meal timing and examples', fields: [],
            meals: { disabled: preferences.mealsPaused === true, timePlaceholder: getTimeFormat() === '24h' ? 'HH:MM' : 'H:MM AM' } },
          { title: 'Digestion details', fallback: 'Optional symptoms and sensitivities',
            summaryFields: [{ key: 'bowelFrequency' }, { key: 'stoolConsistency' }, { key: 'bloating', suffix: ' bloating', omit: 'none' }, { key: 'gas', suffix: ' gas', omit: 'none' }, { key: 'foodSensitivities' }], fields: [
            single('bowelFrequency', 'diet-bowel', 'Bowel frequency', options.BOWEL_FREQUENCY),
            single('stoolConsistency', 'diet-stool', 'Stool consistency', options.STOOL_CONSISTENCY),
            single('bloating', 'diet-bloating', 'Bloating', options.BLOATING_SEVERITY),
            single('gas', 'diet-gas', 'Gas', options.GAS_SEVERITY),
            single('acidReflux', 'diet-reflux', 'Acid reflux', options.ACID_REFLUX),
            single('burping', 'diet-burping', 'Burping', options.BURPING),
            single('nausea', 'diet-nausea', 'Nausea', options.NAUSEA),
            single('appetite', 'diet-appetite', 'Appetite', options.APPETITE),
            single('abdominalPain', 'diet-abdpain', 'Abdominal pain', options.ABDOMINAL_PAIN),
            tags('foodSensitivities', 'diet-sensitivities', 'Food sensitivities', options.FOOD_SENSITIVITIES)
          ] }
        ]
      };
    }
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
  if (model.textField) return { [model.textField.key]: typeof current === 'string' ? current : '' };
  const values: Record<string, unknown> = current && typeof current === 'object' ? current : {};
  const draft: LifestyleDraft = {
    note: typeof values.note === 'string' ? values.note : ''
  };
  for (const field of lifestyleFields(model)) {
    const value = values[field.key];
    draft[field.key] = field.multiple ? field.options.filter(option => Array.isArray(value) && (value.includes(option.value) || value.includes(option.label))).map(option => option.value) : field.options.find(option => option.value === value || option.label === value)?.value || null;
  }
  if (model.key === 'lightCircadian') draft.skinType = typeof values.skinType === 'string' ? values.skinType : null;
  if (model.key === 'environment' && model.sections.some(section => section.emf?.hasAssessments)) {
    // Assessment readings supersede quick choices; hidden legacy values remain stored verbatim.
    for (const key of ['emf', 'emfMitigation']) {
      const value = values[key];
      draft[key] = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    }
  }
  if (model.key === 'diet') for (const meal of lifestyleMeals) {
    const description = values[meal.key];
    draft[meal.key] = typeof description === 'string' ? description : '';
    const time = values[`${meal.key}Time`];
    draft[`${meal.key}Time`] = formatTime(typeof time === 'string' ? time : '');
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
  if (section.meals) {
    if (section.meals.disabled) return 'Paused — detailed log active';
    return lifestyleMeals.filter(meal => draft[meal.key]).map(meal => meal.label).join(' · ') || section.fallback;
  }
  const summaryFields: NonNullable<LifestyleSection['summaryFields']> = section.summaryFields || section.fields;
  const answers = [...new Set([...(section.summaryPrefix ? [section.summaryPrefix] : []), ...summaryFields.flatMap(field => {
    const answer = draft[field.key], values = Array.isArray(answer) ? answer : answer ? [answer] : [];
    return values.filter(value => value && value !== field.omit).map(value => `${field.prefix || ''}${value}${field.suffix || ''}`);
  })])];
  return answers.length ? `${answers.slice(0, 3).join(' · ')}${answers.length > 3 ? ` · +${answers.length - 3} more` : ''}` : section.fallback;
}
/** An explicit projection keeps UI-only state out of stored profile data. */
export function applyLifestyleDraft(data: ProfileData, key: LifestyleFormKey, draft: LifestyleDraft | null): void {
  const text = (key: string): string => typeof draft?.[key] === 'string' ? draft[key].trim() : '';
  const one = (key: string): string | null => text(key) || null;
  const many = (key: string): string[] => Array.isArray(draft?.[key]) ? [...draft[key]] : [];
  const empty = draft === null || Object.entries(draft).filter(([field]) => key !== 'diet' || !field.endsWith('Time')).every(([, value]) => Array.isArray(value) ? !value.length : !value?.trim());
  const note = text('note');
  switch (key) {
    case 'interpretiveLens':
      data.interpretiveLens = text('text');
      break;
    case 'lightCircadian':
      data.lightCircadian = empty ? null : {
        amLight: one('amLight'), daytime: one('daytime'), uvExposure: one('uvExposure'), skinType: one('skinType'),
        evening: many('evening'), screenTime: one('screenTime'), techEnv: many('techEnv'), cold: one('cold'), grounding: one('grounding'), mealTiming: many('mealTiming'), note
      };
      break;
    case 'environment':
      data.environment = empty ? null : {
        setting: one('setting'), climate: one('climate'), altitude: one('altitude'), inhaledExposures: many('inhaledExposures'),
        occupationalExposures: many('occupationalExposures'), water: one('water'), waterConcerns: many('waterConcerns'),
        emf: many('emf'), emfMitigation: many('emfMitigation'), homeLight: one('homeLight'), air: many('air'), toxins: many('toxins'), building: one('building'), note
      };
      break;
    case 'diet':
      data.diet = empty ? null : {
        type: one('type'), pattern: one('pattern'), proteinIntake: one('proteinIntake'), hydration: one('hydration'),
        restrictions: many('restrictions'), alcohol: one('alcohol'), caffeine: one('caffeine'), caffeineTiming: one('caffeineTiming'), recentChanges: many('recentChanges'),
        breakfast: text('breakfast'), breakfastTime: parseTimeInput(text('breakfastTime')),
        lunch: text('lunch'), lunchTime: parseTimeInput(text('lunchTime')),
        dinner: text('dinner'), dinnerTime: parseTimeInput(text('dinnerTime')),
        snacks: text('snacks'), snacksTime: parseTimeInput(text('snacksTime')),
        bowelFrequency: one('bowelFrequency'), stoolConsistency: one('stoolConsistency'), bloating: one('bloating'), gas: one('gas'),
        acidReflux: one('acidReflux'), burping: one('burping'), nausea: one('nausea'), appetite: one('appetite'), abdominalPain: one('abdominalPain'), foodSensitivities: many('foodSensitivities'), note
      };
      break;
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
