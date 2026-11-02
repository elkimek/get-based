// Chat uses transient native route commands; only metadata enters tool results.
import { state } from './state.js';
import { isActiveProfileDataOwner } from './profile.js';
import { getMealAISelection, listNutritionVisionModels, readNutritionAIRouteState } from './nutrition-ai-settings.js';
import { captureMealRouteCommand, commitMealRouteCommand, captureMealRouteRestoration, isMealRouteCommandCurrent, isMealRouteCommandEffectCurrent } from './nutrition-ai-route-commands.js';
import { MealRoutePreferenceError, readNutritionAIRouteRaw } from './nutrition-ai-route-store.js';
import { validateMealRouteNavigation } from '../shared/meal-route-control-contract.js';
import type { AppNavigationRequest } from '../shared/app-navigation-contract.js';
import type { AppNavigationReceipt } from './app-navigation-runtime.js';
interface Owner { profile: string; thread: string; root: typeof state.importedData; history: typeof state.chatHistory }
type Command = ReturnType<typeof captureMealRouteCommand>;
interface Lease extends Owner { raw: string | null; choices: Map<string, Command>; baseline: Command | null; authorized: () => boolean; used?: boolean }
interface Undo extends Owner { raw: string | null; forward: string; restore: string; used?: boolean }
const leases = new Map<string, Lease>(), undos = new Map<string, Undo>();
const owned = (owner: Owner) => state.currentProfile === owner.profile && state.currentThreadId === owner.thread && state.importedData === owner.root && state.chatHistory === owner.history && isActiveProfileDataOwner(owner.profile, owner.root);
function add<T>(map: Map<string, T>, value: T) { const id = crypto.randomUUID(); if (map.size >= 100) map.delete(map.keys().next().value!); map.set(id, value); return id; }
const undoCurrent = (proof: Undo) => { try { return !proof.used && owned(proof) && readNutritionAIRouteRaw() === proof.raw && isMealRouteCommandEffectCurrent(proof.forward) && isMealRouteCommandCurrent(proof.restore); } catch { return false; } };
export function readNutritionRoute(profile: string, options: { query?: string; offset?: number; limit?: number } = {}, isCurrent: () => boolean = () => true) {
  try { return readRoute(profile, options, isCurrent); }
  catch (error) { if (error instanceof MealRoutePreferenceError) throw error; throw new MealRoutePreferenceError('The meal-photo settings could not be read. Open native AI settings.'); }
}
function readRoute(profile: string, options: { query?: string; offset?: number; limit?: number }, isCurrent: () => boolean) {
  const origin = { profile, thread: state.currentThreadId || '', root: state.importedData, history: state.chatHistory };
  if (!origin.thread || !owned(origin) || !isCurrent()) throw new MealRoutePreferenceError('The originating meal-model profile or chat changed.');
  const saved = readNutritionAIRouteState(), selected = getMealAISelection(), choices = new Map<string, Command>();
  const publicChoices: Array<{ id: string; automatic: boolean; provider: string; providerDisplay: string; model: string; modelDisplay: string; available: boolean; fallback: boolean; agent?: string; target?: string }> = [];
  let baseline: Command | null = null;
  if (saved.recognized) {
    try { baseline = captureMealRouteCommand(saved.route ? JSON.stringify(saved.route) : ''); } catch { /* An unavailable previous destination cannot grant Undo authority. */ }
  }
  const models = listNutritionVisionModels().filter(row => !options.query || `${row.providerDisplay} ${row.modelDisplay} ${row.model}`.toLowerCase().includes(options.query.toLowerCase()));
  const offset = options.offset ?? 0, limit = options.limit ?? 25;
  for (const value of ['', ...models.slice(offset, offset + limit).map(row => row.value)]) {
    if (!saved.recognized) break;
    try { const command = captureMealRouteCommand(value), id = crypto.randomUUID(); choices.set(id, command); publicChoices.push({ id, ...command.proposed }); } catch { /* Native setup/refresh is required for unavailable choices. */ }
  }
  const snapshotId = add(leases, { ...origin, raw: saved.raw, choices, baseline, authorized: isCurrent });
  const undoChoices = [...undos].filter(([, proof]) => undoCurrent(proof)).map(([id]) => ({ id, view: 'aiSettings' }));
  return { action: 'nutrition.route', status: 'read_only', snapshotId, storedRecognized: saved.recognized, current: { automatic: selected.usesAutomatic, providerDisplay: selected.providerDisplay, modelDisplay: selected.modelDisplay, available: selected.available }, choices: publicChoices, totalModels: models.length, nextOffset: offset + limit < models.length ? offset + limit : null, undoChoices,
    scope: 'future meal photos and nutrition labels in this browser; chat model unchanged', settingsSaved: false, dataSaved: false,
    notice: 'For an explicit saved meal-model request use getbased_navigate(view:aiSettings,snapshotId,mealRoute:exact choices.id). This saves the preference directly and opens native AI settings when available. It does not change the chat model, send a photo, run inference or grant processing approval. Analyze still needs any native destination approval. Automatic follows the capable chat assistant or configured fallback. Choices are cached capability metadata, not a live model test. Unavailable/unrecognized saved choices need native setup or confirmation. Undo needs a fresh read and current undoChoices.id instead of mealRoute; it restores exact prior preference bytes only while both destinations and the saved effect remain current. Reload removes its authority.' };
}
export async function openNutritionRoute(request: AppNavigationRequest, canOpen: () => boolean, isOwnerCurrent = canOpen): Promise<AppNavigationReceipt> {
  validateMealRouteNavigation(request);
  const rejected = (reason: string): AppNavigationReceipt => ({ changed: false, opened: null, settingsSaved: false, dataSaved: false, reason });
  const lease = request.snapshotId && leases.get(request.snapshotId);
  const ready = () => { try { return !!lease && !lease.used && lease.authorized() && canOpen() && owned(lease) && readNutritionAIRouteRaw() === lease.raw; } catch { return false; } };
  if (!lease || !ready()) return rejected('This meal-model snapshot expired. Read nutrition.route again.');
  const proof = request.undoId ? undos.get(request.undoId) : undefined;
  if (request.undoId && (!proof || !undoCurrent(proof))) return rejected('This meal-model Undo expired. Read nutrition.route again.');
  const command = proof ? { leaseId: proof.restore } : lease.choices.get(request.mealRoute || '');
  if (!command) return rejected('Use a choice ID from this exact nutrition.route snapshot.');
  const current = () => { try { return isOwnerCurrent() && owned(lease); } catch { return false; } };
  lease.used = true; if (proof) proof.used = true;
  let result: Awaited<ReturnType<typeof commitMealRouteCommand>>;
  try { result = await commitMealRouteCommand(command.leaseId, { requireLocks: true, canCommit: () => lease.authorized() && canOpen() && owned(lease) && (!proof || isMealRouteCommandEffectCurrent(proof.forward)) }); }
  catch (error) { return { ...rejected(error instanceof MealRoutePreferenceError ? error.message : 'The meal-photo model could not be confirmed. Check native AI settings.'), ...(error instanceof MealRoutePreferenceError && error.persistenceUncertain ? { persistenceUncertain: true } : {}) }; }
  let undoId: string | null = null;
  if (!proof && result.settingsSaved && lease.baseline && current()) {
    try { const restore = captureMealRouteRestoration(lease.baseline.leaseId); if (isMealRouteCommandEffectCurrent(command.leaseId)) undoId = add(undos, { profile: lease.profile, thread: lease.thread, root: lease.root, history: lease.history, raw: readNutritionAIRouteRaw(), forward: command.leaseId, restore: restore.leaseId }); } catch { /* Optional Undo cannot erase an acknowledged save. */ }
  }
  let opened = false;
  try { if (current() && canOpen()) { const { getSettingsModuleFunction } = await import('./settings-runtime-bridge.js'), open = getSettingsModuleFunction('openSettingsForOwner'); if (open && current() && canOpen()) { await open('ai', () => current() && canOpen()); opened = current() && !!document.querySelector('#settings-modal-overlay.show #settings-tab-ai.active'); } } } catch { /* A confirmed preference save remains authoritative if optional rendering fails. */ }
  if (!current()) return { changed: result.settingsSaved, opened: null, settingsSaved: result.settingsSaved, dataSaved: false, reason: 'The meal-model preference completed before its originating chat changed. Check native AI settings.' };
  return { changed: result.settingsSaved || opened, opened: opened ? 'aiSettings' : null, settingsSaved: result.settingsSaved, dataSaved: false, ...(undoId ? { undoId } : {}), ...(proof ? { undone: true } : {}), scope: result.scope, ...(!opened ? { reason: 'The preference was processed, but native AI settings could not be confirmed open.' } : {}) };
}
