// Recipient/configuration proofs live only for the request and never enter meal data or prompts.
import { state } from './state.js';
import { isAIPaused } from './api.js';
import { getAgentHostAgent, getAgentHostEndpoint, getAgentHostTarget, getAgentHostToken } from './agent-chat-settings.js';
import { captureAssistantConnectionConfiguration, assistantConfigurationsEqual } from './assistant-connection-configuration.js';
import { getMealAISelection, getMealAISelectionForRoute } from './nutrition-ai-settings.js';
import type { MealAISelection, NutritionAIRoute } from './nutrition-ai-settings.js';
const identity = (selection: MealAISelection) => JSON.stringify([selection.adapter, selection.provider, selection.model, selection.adapter === 'codex' ? selection.target : '', selection.available]);
const retired = () => new DOMException('The meal-photo request or its recipient changed. Nothing further will be sent.', 'AbortError');
export function captureMealAnalysisRequest(selection: MealAISelection, options: { selection?: NutritionAIRoute | undefined; signal?: AbortSignal | undefined; isCurrent?: (() => boolean) | undefined } = {}) {
  const profile = state.currentProfile, root = state.importedData, selected = identity(selection);
  const connection = selection.adapter === 'codex' ? null : captureAssistantConnectionConfiguration({ backend: 'direct', provider: selection.provider, target: '', model: selection.model, effort: '' });
  const execution = selection.adapter === 'codex' ? { agent: selection.provider, target: selection.target, endpoint: getAgentHostEndpoint() } : undefined;
  const controller = new AbortController(), signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  let disposed = false;
  const current = () => {
    try {
      if (disposed || signal.aborted || isAIPaused() || state.currentProfile !== profile || state.importedData !== root || options.isCurrent?.() === false) return false;
      const latest = options.selection ? getMealAISelectionForRoute(options.selection) : getMealAISelection();
      if (identity(latest) !== selected) return false;
      if (execution) return getAgentHostAgent() === execution.agent && getAgentHostTarget() === execution.target && getAgentHostEndpoint() === execution.endpoint && !!getAgentHostToken();
      return assistantConfigurationsEqual(connection!, captureAssistantConnectionConfiguration({ backend: 'direct', provider: selection.provider, target: '', model: selection.model, effort: '' }));
    } catch { return false; }
  };
  const check = () => { if (!current() && !signal.aborted) controller.abort(retired()); };
  const assertCurrent = () => { check(); signal.throwIfAborted(); if (!current()) throw retired(); };
  const events = ['storage', 'labcharts-ai-settings-local-changed', 'getbased:agent-host-settings-changed', 'getbased:chat-backend-changed', 'getbased:agent-model-catalog-changed'];
  const target = typeof window === 'undefined' ? null : window;
  for (const event of events) target?.addEventListener(event, check);
  const timer = setInterval(check, 25);
  const dispose = () => { if (disposed) return; disposed = true; clearInterval(timer); for (const event of events) target?.removeEventListener(event, check); if (!controller.signal.aborted) controller.abort(new DOMException('Meal-photo request finished.', 'AbortError')); };
  try { assertCurrent(); } catch (error) { dispose(); throw error; }
  return { signal, current, assertCurrent, execution, dispose };
}
