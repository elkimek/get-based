// Pure reported setup schema and immutable review; no location or analysis disclosure.
import type { ProfileData } from '../types/app-state.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { agentDataObject, parseAgentDataPatch, validateFieldNames } from '../shared/agent-data-contract.js';
import { FITZPATRICK_ROMAN, HOME_LIGHT_OPTIONS, EYEWEAR_OPTIONS, PHOTOSENSITIVE_OPTIONS } from './sun-defaults-model.js';
import { SKIN_TYPE } from './constants.js';
export const SUN_SETUP_HABITS = {
  morningLightDeficit: 'morning-light-deficit', glassMediatedDaytime: 'glass-mediated-daytime', dimWorkspace: 'dim-workspace',
  coolLedEvening: 'cool-led-evening', eveningScreens: 'evening-screens', brightAfterSunset: 'bright-after-sunset',
  sleepNotDark: 'sleep-not-dark', sunscreenBlocksUvb: 'sunscreen-blocks-uvb', sunglassesOutside: 'sunglasses-outside', lowOutdoorTime: 'low-outdoor-time',
} as const;
export const sunSetupFields = {
  fitzpatrick: [...FITZPATRICK_ROMAN, null], photosensitiveMeds: [...PHOTOSENSITIVE_OPTIONS.map(option => option.key), null],
  homeLight: [...HOME_LIGHT_OPTIONS.map(option => option.key), null], eyewear: [...EYEWEAR_OPTIONS.map(option => option.key), null],
  habits: Object.fromEntries(Object.keys(SUN_SETUP_HABITS).map(key => [key, 'Reported boolean; null clears this answer. Unreported answers remain unknown.'])),
};
export const sunSetupChoices = { photosensitiveMeds: PHOTOSENSITIVE_OPTIONS.map(({ key, label }) => ({ key, label })), homeLight: HOME_LIGHT_OPTIONS, eyewear: EYEWEAR_OPTIONS };
export interface SunSetupEffects { mirroredSkinType: string | null; mirrorsSkin: boolean; safetyDefaultsChanged: boolean; analysisCleared: boolean; historyRetained: boolean; }
export interface SunSetupPlan { after: Record<string, unknown>; effects: SunSetupEffects; }
export interface SunSetupSnapshot { version: 1; record: Record<string, unknown>; revision: string; insightEnabled: boolean; plan?: SunSetupPlan; }
function validatePublicRecord(value: unknown, insightEnabled: boolean): Record<string, unknown> {
  const record = agentDataObject(value);
  validateFieldNames(record, ['fitzpatrick', 'photosensitiveMeds', 'homeLight', 'eyewear', 'habits', 'answeredHabitCount', 'habitScore', 'setupComplete', 'previousSetupCount', ...(insightEnabled ? ['mirroredSkinType'] : [])]);
  for (const key of ['fitzpatrick', 'photosensitiveMeds', 'homeLight', 'eyewear'] as const) if (!(sunSetupFields[key] as readonly unknown[]).includes(record[key])) throw new Error('Invalid setup review value.');
  const habits = agentDataObject(record.habits); validateFieldNames(habits, Object.keys(SUN_SETUP_HABITS));
  if (Object.keys(habits).length !== 10 || Object.values(habits).some(value => value !== null && typeof value !== 'boolean')) throw new Error('Invalid setup answer review.');
  const answers = Object.values(habits), score = answers.every(value => typeof value === 'boolean') ? answers.filter(value => value === true).length : null;
  if (record.answeredHabitCount !== answers.filter(value => typeof value === 'boolean').length || record.habitScore !== score
    || typeof record.setupComplete !== 'boolean' || !Number.isSafeInteger(record.previousSetupCount) || Number(record.previousSetupCount) < 0
    || insightEnabled && record.mirroredSkinType !== null && !(SKIN_TYPE as readonly unknown[]).includes(record.mirroredSkinType)) throw new Error('Invalid setup review summary.');
  return structuredClone(record);
}
export function validateSunSetupPatch(patch: Record<string, unknown>) {
  validateFieldNames(patch, Object.keys(sunSetupFields));
  if (!Object.keys(patch).length) throw new Error('Supply at least one reported setup fact.');
  for (const key of ['fitzpatrick', 'photosensitiveMeds', 'homeLight', 'eyewear'] as const) {
    if (key in patch && !(sunSetupFields[key] as readonly unknown[]).includes(patch[key])) throw new Error(`Choose a supported ${key} value, or clear it with null.`);
  }
  if ('habits' in patch) {
    const habits = agentDataObject(patch.habits); validateFieldNames(habits, Object.keys(SUN_SETUP_HABITS));
    if (!Object.keys(habits).length || Object.values(habits).some(value => value !== null && typeof value !== 'boolean')) throw new Error('Report each habit as true, false or null to clear it.');
  }
}
export function sunSetupPublic(data: ProfileData, insightEnabled: boolean): Record<string, unknown> {
  const defaults = data.sunDefaults;
  if (defaults != null) agentDataObject(defaults);
  const result: Record<string, unknown> = {};
  for (const key of ['fitzpatrick', 'photosensitiveMeds', 'homeLight', 'eyewear'] as const) {
    const raw: unknown = defaults?.[key] ?? null, value = key === 'photosensitiveMeds' && typeof raw === 'boolean' ? raw ? 'moderate' : 'none' : raw;
    if (!(sunSetupFields[key] as readonly unknown[]).includes(value)) throw new Error('Review this older setup value in the Light setup editor.');
    result[key] = value;
  }
  const ott = defaults?.ott == null ? {} : agentDataObject(defaults.ott);
  result.habits = Object.fromEntries(Object.entries(SUN_SETUP_HABITS).map(([field, key]) => {
    if (ott[key] != null && typeof ott[key] !== 'boolean') throw new Error('Review this older survey answer in the Light setup editor.');
    return [field, ott[key] ?? null];
  }));
  const answers = Object.values(result.habits as Record<string, unknown>);
  result.answeredHabitCount = answers.filter(value => typeof value === 'boolean').length;
  result.habitScore = answers.every(value => typeof value === 'boolean') ? answers.filter(value => value === true).length : null;
  result.setupComplete = !!(defaults?.fitzpatrick && defaults.completedAt);
  if (defaults?.setupHistory != null && !Array.isArray(defaults.setupHistory)) throw new Error('Review this older setup history in its editor.');
  result.previousSetupCount = defaults?.setupHistory?.length ?? 0;
  if (insightEnabled) {
    const skin: unknown = data.lightCircadian?.skinType ?? null;
    if (skin !== null && !(SKIN_TYPE as readonly unknown[]).includes(skin)) throw new Error('Review the older skin-type context in its editor.');
    result.mirroredSkinType = skin;
  }
  return result;
}
export function parseSunSetupSnapshot(proposal: AgentDataProposal): SunSetupSnapshot {
  const source = agentDataObject(JSON.parse(proposal.baseline));
  if (proposal.resource !== 'sunSetup' || proposal.operation !== 'update' || proposal.recordId !== '' || source.version !== 1
    || typeof source.revision !== 'string' || !/^[a-f0-9]{64}$/.test(source.revision) || typeof source.insightEnabled !== 'boolean') throw new Error('Read the current Light setup before proposing an update.');
  validatePublicRecord(source.record, source.insightEnabled); return source as unknown as SunSetupSnapshot;
}
export function displaySunSetupRecord(value: unknown): unknown {
  const source = agentDataObject(value);
  return 'revision' in source ? validatePublicRecord(source.record, source.insightEnabled === true) : validatePublicRecord(source, Object.hasOwn(source, 'mirroredSkinType'));
}
export function describeSunSetupRecord(value: unknown): string {
  const record = displaySunSetupRecord(value) as Record<string, unknown>;
  const label = (options: readonly { key: string; label: string }[], value: unknown) => options.find(option => option.key === value)?.label || 'Not reported';
  const skin = record.fitzpatrick == null ? 'Not reported' : SKIN_TYPE[FITZPATRICK_ROMAN.indexOf(record.fitzpatrick as typeof FITZPATRICK_ROMAN[number])];
  const names: Record<keyof typeof SUN_SETUP_HABITS, string> = { morningLightDeficit: 'Little morning daylight', glassMediatedDaytime: 'Daytime mostly behind glass', dimWorkspace: 'Dim daytime workspace',
    coolLedEvening: 'Bright cool evening light', eveningScreens: 'Bright screens before bed', brightAfterSunset: 'Bright room light before sleep', sleepNotDark: 'Light during sleep',
    sunscreenBlocksUvb: 'Sunscreen on most sun-exposed days', sunglassesOutside: 'Sunglasses most outdoor time', lowOutdoorTime: 'Under 30 minutes outdoors daily' };
  const habits = record.habits as Record<keyof typeof SUN_SETUP_HABITS, boolean | null>;
  const reported = (Object.keys(SUN_SETUP_HABITS) as Array<keyof typeof SUN_SETUP_HABITS>).filter(key => habits[key] !== null).map(key => `${names[key]}: ${habits[key] ? 'Yes' : 'No'}`);
  return [`Skin type: ${skin}`, `Sunlight warning: ${label(PHOTOSENSITIVE_OPTIONS, record.photosensitiveMeds)}`, `Home lighting: ${label(HOME_LIGHT_OPTIONS, record.homeLight)}`,
    `Eyewear: ${label(EYEWEAR_OPTIONS, record.eyewear)}`, ...reported, `Unanswered habit questions: ${10 - Number(record.answeredHabitCount)}`,
    ...(record.habitScore === null ? [] : [`Habit patterns selected: ${record.habitScore}/10`])].join('\n');
}
export function projectSunSetupRecord(proposal: AgentDataProposal) {
  const source = parseSunSetupSnapshot(proposal), patch = parseAgentDataPatch(proposal.patch); validateSunSetupPatch(patch);
  if ('fitzpatrick' in patch && !source.insightEnabled) throw new Error('Enable Insight cards to review the mirrored skin-type change.');
  if (!source.plan) throw new Error('This setup review is incomplete. Read it again.');
  const plan = agentDataObject(source.plan); validateFieldNames(plan, ['after', 'effects']);
  const effects = agentDataObject(plan.effects); validateFieldNames(effects, ['mirroredSkinType', 'mirrorsSkin', 'safetyDefaultsChanged', 'analysisCleared', 'historyRetained']);
  if (['mirrorsSkin', 'safetyDefaultsChanged', 'analysisCleared', 'historyRetained'].some(key => typeof effects[key] !== 'boolean')
    || effects.mirroredSkinType !== null && !(SKIN_TYPE as readonly unknown[]).includes(effects.mirroredSkinType)) throw new Error('Invalid setup effect review.');
  return { before: source.record, after: validatePublicRecord(plan.after, source.insightEnabled), effects: effects as unknown as SunSetupEffects };
}
