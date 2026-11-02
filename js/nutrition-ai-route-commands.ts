// Native selectors and chat reviews use the same validated, serialized meal-model change.
import { state } from './state.js';
import { markAISettingsLocal } from './api.js';
import { showNotification } from './utils.js';
import { getAgentHostAgent, getAgentHostTarget } from './agent-chat-settings.js';
import { captureAssistantConnectionConfiguration, assistantConfigurationsEqual } from './assistant-connection-configuration.js';
import { captureManagedConnection } from './app-extension-connection-control.js';
import { getAppExtensionAIConnectionState } from './app-extension-runtime.js';
import { getAutomaticMealAISelection, getMealAISelection, getMealAISelectionForRoute, listNutritionVisionModels, readNutritionAIRouteState } from './nutrition-ai-settings.js';
import type { MealAISelection, NutritionAIRoute } from './nutrition-ai-settings.js';
import { commitNutritionAIRouteRaw, readNutritionAIRouteRaw, MealRoutePreferenceError } from './nutrition-ai-route-store.js';
const conflict = (message: string): never => { throw new MealRoutePreferenceError(message); };
const signature = (selection: MealAISelection) => JSON.stringify([selection.adapter, selection.provider, 'target' in selection ? selection.target : '', selection.model, selection.available]);
const describe = (selection: MealAISelection) => ({ automatic: selection.usesAutomatic, provider: selection.adapter === 'codex' ? 'codex' : selection.provider, providerDisplay: selection.providerDisplay, model: selection.model, modelDisplay: selection.modelDisplay, available: selection.available, fallback: selection.fallback, ...(selection.adapter === 'codex' ? { agent: selection.provider, target: selection.target } : {}) });
function parseChoice(value: string): NutritionAIRoute | null {
  if (value === '') return null;
  let parsed: unknown; try { parsed = JSON.parse(value); } catch { return conflict('Choose a currently listed meal-photo model.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('provider' in parsed) || !('model' in parsed) || typeof parsed.provider !== 'string' || typeof parsed.model !== 'string') return conflict('Choose a currently listed meal-photo model.');
  if (parsed.provider === 'codex') {
    if (Object.keys(parsed).length !== 4 || !('agent' in parsed) || !('target' in parsed) || typeof parsed.agent !== 'string' || typeof parsed.target !== 'string') return conflict('Choose a freshly listed meal-photo CLI model with its agent and target.');
    return { provider: parsed.provider, model: parsed.model, agent: parsed.agent, target: parsed.target };
  }
  if (Object.keys(parsed).length !== 2) return conflict('Choose a currently listed meal-photo model.');
  return { provider: parsed.provider, model: parsed.model };
}
function selectionFor(route: NutritionAIRoute | null) {
  if (!route) return getAutomaticMealAISelection();
  const found = listNutritionVisionModels().some(choice => choice.provider === route.provider && choice.model === route.model);
  if (!found) return conflict('That exact meal-photo model is not currently available with confirmed image input. Refresh the native model list.');
  return getMealAISelectionForRoute(route);
}
function configuration(selection: MealAISelection) {
  return [...captureAssistantConnectionConfiguration({ backend: selection.adapter === 'codex' ? 'cli' : 'direct', provider: selection.provider, target: selection.adapter === 'codex' ? selection.target : '', model: selection.model, effort: '' }), ...(selection.adapter === 'codex' ? [getAgentHostAgent(), getAgentHostTarget()] : [])];
}
interface Lease {
  profile: string; thread: typeof state.currentThreadId; root: typeof state.importedData; history: typeof state.chatHistory;
  beforeRaw: string | null; afterRaw: string | null; route: NutritionAIRoute | null; proposed: MealAISelection; connection: unknown[];
  managed: ReturnType<typeof captureManagedConnection>; before: ReturnType<typeof describe>; used?: boolean;
}
const leases = new Map<string, Lease>();
const owned = (lease: Lease) => state.currentProfile === lease.profile && state.currentThreadId === lease.thread && state.importedData === lease.root && state.chatHistory === lease.history;
function destinationCurrent(lease: Lease) {
  try { const selection = selectionFor(lease.route); return selection.available && signature(selection) === signature(lease.proposed) && assistantConfigurationsEqual(configuration(selection), lease.connection) && (!lease.managed || lease.managed.current()); } catch { return false; }
}
/** The raw/configuration proof stays private; the returned preview contains display metadata only. */
export function captureMealRouteCommand(value: string, options: { allowUnrecognized?: boolean } = {}) {
  const before = readNutritionAIRouteState();
  if (!before.recognized && !options.allowUnrecognized) return conflict('The saved meal-model preference is unfamiliar. Choose its replacement in native AI settings.');
  const route = parseChoice(value), proposed = selectionFor(route);
  if (!proposed.available) return conflict('The requested meal-photo route is unavailable. Choose a configured model with confirmed image input.');
  const managed = proposed.adapter === 'direct' ? captureManagedConnection(proposed.provider) : null;
  const lease: Lease = { profile: state.currentProfile, thread: state.currentThreadId, root: state.importedData, history: state.chatHistory, beforeRaw: before.raw, afterRaw: route ? JSON.stringify(route) : null, route, proposed, connection: configuration(proposed), managed, before: describe(getMealAISelection()) };
  const leaseId = crypto.randomUUID(); if (leases.size >= 100) leases.delete(leases.keys().next().value!); leases.set(leaseId, lease);
  return { leaseId, before: lease.before, proposed: describe(proposed), scope: 'future meal photos and nutrition labels in this browser; chat model unchanged' };
}
/** A destination proof remains private, including its original credentials and managed owner. */
export function isMealRouteCommandCurrent(leaseId: string, destinationOnly = false) {
  const lease = leases.get(leaseId);
  try { return !!lease && owned(lease) && destinationCurrent(lease) && (destinationOnly || !lease.used && readNutritionAIRouteRaw() === lease.beforeRaw); } catch { return false; }
}
export function isMealRouteCommandEffectCurrent(leaseId: string) {
  const lease = leases.get(leaseId);
  try { return !!lease && isMealRouteCommandCurrent(leaseId, true) && readNutritionAIRouteRaw() === lease.afterRaw; } catch { return false; }
}
/** Restore only a previously captured, recognized choice, including its exact saved bytes. */
export function captureMealRouteRestoration(sourceLeaseId: string) {
  const source = leases.get(sourceLeaseId);
  if (!source || !isMealRouteCommandCurrent(sourceLeaseId, true)) return conflict('The previous meal-model destination changed. Choose it again in native AI settings.');
  const lease: Lease = { ...source, beforeRaw: readNutritionAIRouteRaw(), afterRaw: source.beforeRaw, before: describe(getMealAISelection()), used: false };
  const leaseId = crypto.randomUUID(); if (leases.size >= 100) leases.delete(leases.keys().next().value!); leases.set(leaseId, lease);
  return { leaseId, before: lease.before, proposed: describe(lease.proposed) };
}
export async function commitMealRouteCommand(leaseId: string, options: { canCommit?: () => boolean; requireLocks?: boolean } = {}) {
  const lease = leases.get(leaseId);
  const current = () => { try { return !!lease && owned(lease) && options.canCommit?.() !== false && readNutritionAIRouteRaw() === lease.beforeRaw && destinationCurrent(lease); } catch { return false; } };
  if (!lease || lease.used || !current()) return conflict('The meal-model review or its connection changed. Read it again before applying.');
  const check = lease.managed ? await lease.managed.check(lease.proposed.model, { isCurrent: current }) : null;
  if (lease.used || !current()) return conflict('The originating meal-model view changed before saving.');
  lease.used = true;
  const result = await commitNutritionAIRouteRaw(lease.afterRaw, {
    expectedRaw: lease.beforeRaw, requireLocks: options.requireLocks === true, canCommit: () => owned(lease) && options.canCommit?.() !== false,
    validate: () => { if (!current() || check && Date.now() - check.checkedAt > 15000 || lease.proposed.adapter === 'direct' && getAppExtensionAIConnectionState(lease.proposed.provider).managed && !lease.managed) conflict('The meal-model destination or its capability check changed before saving.'); },
    publish: markAISettingsLocal,
  });
  return { ...result, before: lease.before, after: describe(lease.proposed), scope: 'future meal photos and nutrition labels in this browser; chat model unchanged' };
}
const pending = new WeakSet<HTMLSelectElement>();
/** A real human selector can replace an unfamiliar preference; model commands cannot. */
export async function changeNativeMealRoute(select: HTMLSelectElement, refresh: () => unknown) {
  if (pending.has(select)) return null;
  const profile = state.currentProfile, thread = state.currentThreadId, root = state.importedData, history = state.chatHistory, parent = select.parentElement, value = select.value, disabled = select.disabled;
  const surface = select.closest('.modal-overlay') || parent, first = surface?.firstElementChild;
  const ownerCurrent = () => state.currentProfile === profile && state.currentThreadId === thread && state.importedData === root && state.chatHistory === history;
  const current = () => ownerCurrent() && select.isConnected && select.parentElement === parent && select.getClientRects().length > 0;
  const canPublish = () => ownerCurrent() && !!surface?.isConnected && surface.firstElementChild === first && surface.getClientRects().length > 0;
  pending.add(select); select.disabled = true;
  try {
    const command = captureMealRouteCommand(value, { allowUnrecognized: true }), result = await commitMealRouteCommand(command.leaseId, { canCommit: current });
    if (canPublish()) { refresh(); showNotification(result.presentationFailed ? 'Meal photo model saved. Reopen native AI settings to refresh the view.' : 'Meal photo model updated.', result.presentationFailed ? 'info' : 'success'); }
    return result;
  } catch (error) {
    if (current()) { refresh(); showNotification(error instanceof MealRoutePreferenceError ? error.message : 'The meal-photo model could not be confirmed. Check native AI settings.', 'error'); }
    return null;
  } finally { pending.delete(select); if (ownerCurrent() && select.isConnected && select.parentElement === parent) select.disabled = disabled; }
}
