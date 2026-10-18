// nutrition-context-card-extensions.js — lightweight Diet and Light card links.

import { state } from './state.js';
import { getNutritionContextDays, isNutritionContextEnabled } from './lab-context-settings.js';
import { doesNutritionContextOverrideTypicalMeals } from './context-card-summaries.js';
import { renderHTML } from './components/ContextNutritionLink.svelte.html.js';
import {captureNutritionContextActionAttributes} from './nutrition-context-card-view.js';
import type {NutritionContextLinkView, NutritionContextActionFactory} from './nutrition-context-card-view.js';

type NutritionActionAttributes = NutritionContextActionFactory;
interface NutritionCardWindow {
  loggedDays?: unknown;
  foodMeals?: unknown;
  meals?: unknown;
  timing?: {
    mealsWithTiming?: unknown;
    averageFirstMealLocalTime?: unknown;
    averageLastMealLocalTime?: unknown;
    sleepRelative?: {
      averageLastMealToSleepMinutes?: unknown;
      averageWakeToFirstMealMinutes?: unknown;
    } | null;
  } | null;
}
interface NutritionCardSummary {
  totalMeals?: unknown;
  windows?: { d7?: NutritionCardWindow | null } | null;
}

export function projectNutritionDietExtension(actionAttributes: NutritionActionAttributes): NutritionContextLinkView {
  const summary = state.nutritionSummary as NutritionCardSummary | null;
  const period = summary?.windows?.d7;
  const logged = period?.loggedDays || 0;
  const foodMeals = period?.foodMeals ?? period?.meals ?? 0;
  const hasDetailedMeals = (summary?.totalMeals as number) > 0;
  const overridesTypicalMeals = doesNutritionContextOverrideTypicalMeals(summary);
  const title = overridesTypicalMeals ? 'Detailed meal log active' : 'Meals & Nutrition';
  let detail = 'Add variable meals and photo estimates';
  if (hasDetailedMeals && !overridesTypicalMeals) {
    detail = isNutritionContextEnabled()
      ? `No entries in the ${getNutritionContextDays(state.importedData)}-day AI timeframe · Typical meals active`
      : 'AI source off · Typical meals active';
  } else if (period?.meals) {
    detail = `Replaces Typical meals · ${foodMeals} logged meal${foodMeals === 1 ? '' : 's'} · ${logged}/7 days`;
  } else if (overridesTypicalMeals) {
    detail = 'Replaces Typical meals · no entries in 7 days';
  }
  const attributes = captureNutritionContextActionAttributes(actionAttributes('open-nutrition', {surface: 'meals'}));
  return {title, detail, surface: 'meals', attributes};
}

export function projectNutritionCircadianExtension(actionAttributes: NutritionActionAttributes): NutritionContextLinkView | null {
  const period = (state.nutritionSummary as NutritionCardSummary | null)?.windows?.d7;
  const timing = period?.timing;
  if (!period?.meals || !timing?.mealsWithTiming) return null;
  const first = timing.averageFirstMealLocalTime || '';
  const last = timing.averageLastMealLocalTime || '';
  const beforeSleep = timing.sleepRelative?.averageLastMealToSleepMinutes;
  const afterWake = timing.sleepRelative?.averageWakeToFirstMealMinutes;
  const duration = (minutes: unknown) => {
    const value = Number(minutes);
    if (!Number.isFinite(value)) return '';
    return `${Math.floor(value / 60)}h ${Math.round(value % 60)}m`;
  };
  const detail = [first && `first ${first}`, last && `last ${last}`, beforeSleep !== null && beforeSleep !== undefined && Number.isFinite(Number(beforeSleep)) && `${duration(beforeSleep)} before sleep`, afterWake !== null && afterWake !== undefined && Number.isFinite(Number(afterWake)) && `${duration(afterWake)} after wake`].filter(Boolean).join(' · ');
  if (!detail) return null;
  const attributes = captureNutritionContextActionAttributes(actionAttributes('open-nutrition', {surface: 'timing'}));
  return {title: 'Logged meal timing', detail: `7-day average · ${detail}`, surface: 'timing', attributes};
}

/** Stable synchronous HTML URL; the catalog composes the same genuine child. */
export function renderNutritionDietExtension(actionAttributes: NutritionActionAttributes): string {
  return renderHTML({view: projectNutritionDietExtension(actionAttributes)});
}
export function renderNutritionCircadianExtension(actionAttributes: NutritionActionAttributes): string {
  const view = projectNutritionCircadianExtension(actionAttributes);
  return view === null ? '' : renderHTML({view});
}
