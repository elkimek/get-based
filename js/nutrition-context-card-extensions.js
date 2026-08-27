// @ts-check
// nutrition-context-card-extensions.js — lightweight Diet and Light card links.

import { state } from './state.js';
import { getNutritionContextDays, isNutritionContextEnabled } from './lab-context-settings.js';
import { doesNutritionContextOverrideTypicalMeals } from './context-card-summaries.js';
import { escapeHTML } from './utils.js';

export function renderNutritionDietExtension(actionAttributes) {
  const summary = state.nutritionSummary;
  const period = summary?.windows?.d7;
  const logged = period?.loggedDays || 0;
  const foodMeals = period?.foodMeals ?? period?.meals ?? 0;
  const hasDetailedMeals = summary?.totalMeals > 0;
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
  return `<button type="button" class="diet-nutrition-extension" ${actionAttributes('open-nutrition', { surface: 'meals' })}><span class="diet-nutrition-extension-title">${title}</span><span>${escapeHTML(detail)}</span><span aria-hidden="true">→</span></button>`;
}

export function renderNutritionCircadianExtension(actionAttributes) {
  const period = state.nutritionSummary?.windows?.d7;
  const timing = period?.timing;
  if (!period?.meals || !timing?.mealsWithTiming) return '';
  const first = timing.averageFirstMealLocalTime || '';
  const last = timing.averageLastMealLocalTime || '';
  const beforeSleep = timing.sleepRelative?.averageLastMealToSleepMinutes;
  const afterWake = timing.sleepRelative?.averageWakeToFirstMealMinutes;
  const duration = minutes => {
    const value = Number(minutes);
    if (!Number.isFinite(value)) return '';
    return `${Math.floor(value / 60)}h ${Math.round(value % 60)}m`;
  };
  const detail = [first && `first ${first}`, last && `last ${last}`, beforeSleep !== null && beforeSleep !== undefined && Number.isFinite(Number(beforeSleep)) && `${duration(beforeSleep)} before sleep`, afterWake !== null && afterWake !== undefined && Number.isFinite(Number(afterWake)) && `${duration(afterWake)} after wake`].filter(Boolean).join(' · ');
  if (!detail) return '';
  return `<button type="button" class="diet-nutrition-extension" ${actionAttributes('open-nutrition', { surface: 'timing' })}><span class="diet-nutrition-extension-title">Logged meal timing</span><span>7-day average · ${escapeHTML(detail)}</span><span aria-hidden="true">→</span></button>`;
}
