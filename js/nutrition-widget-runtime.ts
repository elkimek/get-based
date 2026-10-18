// Dashboard summaries own no editor, history, AI or persistence controller.
import { state } from './state.js';
import { resolveNutritionTargets } from './nutrition-targets.js';
import { projectNutritionDashboard, projectNutritionFuelDashboard } from './nutrition-dashboard-model.js';
import type { NutritionDashboardSummary } from './nutrition-dashboard-model.js';
import { renderHTML } from './components/NutritionDashboard.svelte.html.js';

let editorDelegatesRegistered = false;
/** The resident controller yields cold control ownership before installing delegates. */
export function registerNutritionEditorDelegates() { editorDelegatesRegistered = true; }
export function areNutritionEditorDelegatesRegistered() { return editorDelegatesRegistered; }

export function projectNutritionWidget() {
  return projectNutritionDashboard(state.nutritionSummary as NutritionDashboardSummary | null, resolveNutritionTargets());
}
export function projectNutritionFuelWidget() {
  return projectNutritionFuelDashboard(state.nutritionSummary as NutritionDashboardSummary | null, resolveNutritionTargets());
}
export function renderNutritionWidget() {
  return renderHTML({ view: projectNutritionWidget() });
}
export function renderNutritionFuelWidget() {
  return renderHTML({ view: projectNutritionFuelWidget() });
}
// These are the existing refresh sinks, shared by hydration and the full editor.
export function refreshNutritionWidgets() {
  document.querySelectorAll('.dashboard-widget[data-widget-id="nutrition"] .dashboard-widget-body')
    .forEach(body => { body.innerHTML = renderNutritionWidget(); });
  document.querySelectorAll('.dashboard-widget[data-widget-id="nutrition-fuel-mix"] .dashboard-widget-body')
    .forEach(body => { body.innerHTML = renderNutritionFuelWidget(); });
}
globalThis.addEventListener?.('labcharts-nutrition-summary-changed', refreshNutritionWidgets);
