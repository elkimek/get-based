// lab-context.js — synchronous public lab-context facade.

import { buildLabContext as buildLabContextCore, formatLabDateAgeValue } from './lab-context-assembly.js';
import type { LabContextOptions } from './lab-context-runtime.js';

export { configureLabContext } from './lab-context-runtime.js';
export {
  buildWearableContext, buildWearableSeriesSection, getAgentWearableSeriesDays,
  getSleepContextMismatch, isAgentWearableSeriesEnabled, isWearableContextEnabled, setAgentWearableSeriesDays,
  setAgentWearableSeriesEnabled,
} from './lab-context-wearables.js';
export {
  invalidateLabContextCache, isGeneticsInventoryInAIContext, isGeneticsPriorityInAIContext,
  isGeneticsSummaryInAIContext, isGroupInAIContext, isInsightContextCardsEnabled,
  isLabMarkersContextEnabled, isLightSunContextEnabled, isSupplementsMedsContextEnabled,
  getNutritionContextDays, NUTRITION_CONTEXT_DAY_OPTIONS, setNutritionContextDays,
  setGeneticsInventoryInAIContext, setGeneticsPriorityInAIContext,
  setGeneticsSummaryInAIContext, setGroupInAIContext, setInsightContextCardsEnabled,
  setLabMarkersContextEnabled, setLightSunContextEnabled, setSupplementsMedsContextEnabled,
  setWearableContextEnabled,
  isNutritionContextEnabled, setNutritionContextEnabled,
} from './lab-context-settings.js';
export { injectLensChunks } from './lab-context-output.js';

export function formatLabDateAge(date: string, now = Date.now()) {
  return formatLabDateAgeValue(date, now);
}

export function buildLabContext({ skipGroupFilter, ignoreContextToggles, queryText, nutritionHistoryLabel }: LabContextOptions = {}) {
  return buildLabContextCore({ skipGroupFilter, ignoreContextToggles, queryText, nutritionHistoryLabel });
}
