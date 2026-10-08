// Pure projections for both dashboard widgets; unknown intake stays unknown.
import { NUTRIENT_DEFINITIONS } from './nutrition-nutrient-registry.js';
import { projectNutritionGoal, projectNutritionRing, projectNutritionFuel } from './nutrition-presentation-model.js';
import type { GoalField, PeriodReader, TargetReader } from './nutrition-render.js';
import type { NutritionGoalView, NutritionRingView, NutritionFuelView } from './nutrition-presentation-model.js';
export type NutritionDashboardSummary = { totalMeals?: unknown; windows?: { d7?: PeriodReader | null } | null };
const NUTRIENT_DETAILS = NUTRIENT_DEFINITIONS.map(field => [field.key, field.label, field.unit] as const);
const WIDGET_TARGETS = new Map<string, [string, string, string]>([
  ['proteinG', ['proteinG', 'goal', 'Protein']],
  ['carbohydrateG', ['carbohydrateG', 'goal', 'Carbohydrate']],
  ['fatG', ['fatG', 'goal', 'Fat']],
  ['fiberG', ['fiberG', 'minimum', 'Fiber']],
  ['fluidMl', ['fluidMl', 'fluid', 'Logged drinks']],
  ['sugarG', ['sugarG', 'limit', 'Sugar guide']],
  ['sodiumMg', ['sodiumMg', 'limit', 'Sodium guide']],
]);
const DASHBOARD_GOAL_FIELDS: readonly GoalField[] = Object.freeze(NUTRIENT_DETAILS
  .filter(([key]) => key !== 'energyKcal')
  .map(([key, label, unit]) => {
    const [targetKey = '', kind = 'observe', widgetLabel = label] = WIDGET_TARGETS.get(key) || [];
    return (
      [key, widgetLabel, unit, targetKey, kind] as const
    );
  }));

export function nutritionDashboardGoalFields(nutrients: readonly string[]): readonly GoalField[] {
  const selected = new Set(nutrients);
  return DASHBOARD_GOAL_FIELDS.filter(([key]) => selected.has(key));
}
export interface NutritionCoverageDay { key: string; label: string; title: string; logged: boolean; }
export interface NutritionIntakeDashboard {
  kind: 'intake'; hasMeals: boolean; configured: boolean; loggedDays: string;
  days: NutritionCoverageDay[]; ring: NutritionRingView; goals: NutritionGoalView[];
}
export type NutritionDashboardView = NutritionIntakeDashboard | { kind: 'fuel'; fuel: NutritionFuelView | null };
export function projectNutritionDashboard(summary: NutritionDashboardSummary | null | undefined, targets: TargetReader, now = new Date()): NutritionIntakeDashboard {
  const period = summary?.windows?.d7;
  const logged = new Set(Array.isArray(period?.loggedDayKeys) ? period.loggedDayKeys as unknown[] : []);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const active = logged.has(key);
    return { key, logged: active, label: date.toLocaleDateString([], { weekday: 'narrow' }),
      title: `${date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}: ${active ? 'intake logged' : 'not logged'}` };
  });
  return { kind: 'intake', hasMeals: Number(summary?.totalMeals || 0) > 0, configured: !!targets.configured,
    loggedDays: String(period?.loggedDays || 0), days,
    ring: projectNutritionRing('Energy', period?.dailyAverages?.energyKcal, targets.energyKcal, 'kcal', false, targets.configured),
    goals: nutritionDashboardGoalFields(targets.widgetNutrients || []).map(field => projectNutritionGoal(period, targets, field)) };
}
export function projectNutritionFuelDashboard(summary: NutritionDashboardSummary | null | undefined, targets: TargetReader): NutritionDashboardView {
  const period = summary?.windows?.d7;
  const foodMeals = Number.isFinite(Number(period?.foodMeals)) ? Number(period!.foodMeals) : Number(period?.meals || 0);
  return { kind: 'fuel', fuel: projectNutritionFuel(period?.fuelOverlap, { scope: 'window', fallbackTotalMeals: foodMeals, period, targets }) };
}
