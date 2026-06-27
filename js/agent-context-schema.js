// @ts-check
// agent-context-schema.js — strict schema validation for AI-extracted context-card proposals.

import {
  ABDOMINAL_PAIN,
  ACID_REFLUX,
  APPETITE,
  BLOATING_SEVERITY,
  BOWEL_FREQUENCY,
  BURPING,
  DAILY_MOVEMENT,
  DIET_PATTERNS,
  DIET_RESTRICTIONS,
  DIET_TYPES,
  EXERCISE_FREQ,
  EXERCISE_INTENSITY,
  EXERCISE_TYPES,
  FOOD_SENSITIVITIES,
  GAS_SEVERITY,
  LIGHT_AM,
  LIGHT_COLD,
  LIGHT_DAYTIME,
  LIGHT_EVENING,
  LIGHT_GROUNDING,
  LIGHT_MEAL_TIMING,
  LIGHT_SCREEN_TIME,
  LIGHT_TECH_ENV,
  LIGHT_UV,
  NAUSEA,
  SLEEP_DURATIONS,
  SLEEP_ENVIRONMENT,
  SLEEP_ISSUES,
  SLEEP_PRACTICES,
  SLEEP_QUALITY,
  SLEEP_ROOM_TEMP,
  SLEEP_SCHEDULE,
  STOOL_CONSISTENCY,
} from './constants.js';

export const CONTEXT_CARD_SCHEMAS = {
  diet: {
    label: 'Diet & Digestion',
    enums: {
      type: DIET_TYPES,
      pattern: DIET_PATTERNS,
      bowelFrequency: BOWEL_FREQUENCY,
      stoolConsistency: STOOL_CONSISTENCY,
      bloating: BLOATING_SEVERITY,
      gas: GAS_SEVERITY,
      acidReflux: ACID_REFLUX,
      burping: BURPING,
      nausea: NAUSEA,
      appetite: APPETITE,
      abdominalPain: ABDOMINAL_PAIN,
    },
    arrays: {
      restrictions: DIET_RESTRICTIONS,
      foodSensitivities: FOOD_SENSITIVITIES,
    },
    strings: ['breakfast', 'breakfastTime', 'lunch', 'lunchTime', 'dinner', 'dinnerTime', 'snacks', 'snacksTime', 'note'],
  },
  sleepRest: {
    label: 'Sleep & Rest',
    enums: { duration: SLEEP_DURATIONS, quality: SLEEP_QUALITY, schedule: SLEEP_SCHEDULE, roomTemp: SLEEP_ROOM_TEMP },
    arrays: { issues: SLEEP_ISSUES, environment: SLEEP_ENVIRONMENT, practices: SLEEP_PRACTICES },
    strings: ['note'],
  },
  exercise: {
    label: 'Exercise & Movement',
    enums: { frequency: EXERCISE_FREQ, intensity: EXERCISE_INTENSITY, dailyMovement: DAILY_MOVEMENT },
    arrays: { types: EXERCISE_TYPES },
    strings: ['note'],
  },
  lightCircadian: {
    label: 'Light & Circadian',
    enums: { amLight: LIGHT_AM, daytime: LIGHT_DAYTIME, uvExposure: LIGHT_UV, screenTime: LIGHT_SCREEN_TIME, cold: LIGHT_COLD, grounding: LIGHT_GROUNDING },
    arrays: { evening: LIGHT_EVENING, techEnv: LIGHT_TECH_ENV, mealTiming: LIGHT_MEAL_TIMING },
    strings: ['note'],
  },
};

function contextExtractionSchemaForPrompt() {
  const lines = [];
  for (const [field, schema] of Object.entries(CONTEXT_CARD_SCHEMAS)) {
    lines.push(`${field} (${schema.label})`);
    for (const [key, values] of Object.entries(schema.enums || {})) lines.push(`- ${key}: one of ${values.join(' | ')}`);
    for (const [key, values] of Object.entries(schema.arrays || {})) lines.push(`- ${key}: array using only ${values.join(' | ')}`);
    if (schema.strings?.length) lines.push(`- text fields: ${schema.strings.join(', ')}`);
  }
  lines.push('healthGoals: add items as {"field":"healthGoals","item":{"text":"...","severity":"major"}}');
  return lines.join('\n');
}

export function getAgentContextExtractionPrompt() {
  return `Extract profile context updates from the user's message in any language/localization. Return STRICT JSON only, no prose. Use only these real getbased fields/options. If a fact does not fit an enum exactly, preserve it in note instead of inventing a value. Do not diagnose, prescribe, or add safety advice. Do not write data; this is only a confirmation-gated draft.\n\nAllowed schema:\n${contextExtractionSchemaForPrompt()}\n\nJSON shape:\n{"changes":[{"field":"diet|sleepRest|exercise|lightCircadian","patch":{}},{"field":"healthGoals","item":{"text":"...","severity":"major"}}]}`;
}

function normalizeEnumValue(value, allowed) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return allowed.find(option => option === raw) || allowed.find(option => option.toLowerCase() === raw.toLowerCase()) || null;
}

function normalizeStringValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return raw.slice(0, 500);
}

export function normalizeContextPatch(field, patch) {
  const schema = CONTEXT_CARD_SCHEMAS[field];
  if (!schema || !patch || typeof patch !== 'object') return null;
  const next = {};
  for (const [key, value] of Object.entries(patch)) {
    if (schema.enums?.[key]) {
      const normalized = normalizeEnumValue(value, schema.enums[key]);
      if (normalized) next[key] = normalized;
      continue;
    }
    if (schema.arrays?.[key]) {
      const rawItems = Array.isArray(value) ? value : [value];
      const normalized = rawItems.map(item => normalizeEnumValue(item, schema.arrays[key])).filter(Boolean);
      if (normalized.length) next[key] = Array.from(new Set(normalized));
      continue;
    }
    if (schema.strings?.includes(key)) {
      const normalized = normalizeStringValue(value);
      if (normalized) next[key] = normalized;
    }
  }
  return Object.keys(next).length ? next : null;
}

export function normalizeContextString(value) {
  return normalizeStringValue(value);
}
