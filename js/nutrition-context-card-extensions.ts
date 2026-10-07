// nutrition-context-card-extensions.js — lightweight Diet and Light card links.

import { state } from './state.js';
import { getNutritionContextDays, isNutritionContextEnabled } from './lab-context-settings.js';
import { doesNutritionContextOverrideTypicalMeals } from './context-card-summaries.js';
import { renderHTML } from './components/ContextNutritionLink.svelte.html.js';

type NutritionActionAttributes = (action: 'open-nutrition', options: { surface: 'meals' | 'timing' }) => string;
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

/** Preserve the trusted internal action-attribute callback at the synchronous HTML boundary.
 * Svelte owns all markup and escapes summary text; this slot carries only caller-built
 * delegated-action attributes, as in the original public renderer contract.
 */
function renderLink(title: string, detail: string, attributes: string): string {
  return renderHTML({ title, detail }).replace('data-nutrition-action-slot="open"', () => attributes);
}

export function renderNutritionDietExtension(actionAttributes: NutritionActionAttributes) {
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
  return renderLink(title, detail, actionAttributes('open-nutrition', { surface: 'meals' }));
}

export function renderNutritionCircadianExtension(actionAttributes: NutritionActionAttributes) {
  const period = (state.nutritionSummary as NutritionCardSummary | null)?.windows?.d7;
  const timing = period?.timing;
  if (!period?.meals || !timing?.mealsWithTiming) return '';
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
  if (!detail) return '';
  return renderLink('Logged meal timing', `7-day average · ${detail}`, actionAttributes('open-nutrition', { surface: 'timing' }));
}
