// One browser-wide preference owner for native controls and chat-reviewed meal routes.
import { state } from './state.js';
import { runNativeCommandWithLocks } from './native-command-locks.js';
export const NUTRITION_AI_ROUTE_KEY = 'labcharts-nutrition-ai-route';
export class MealRoutePreferenceError extends Error {
  readonly noChangeApplied: boolean;
  readonly persistenceUncertain: boolean;
  constructor(message: string, uncertain = false) { super(message); this.noChangeApplied = !uncertain; this.persistenceUncertain = uncertain; }
}
export const readNutritionAIRouteRaw = () => localStorage.getItem(NUTRITION_AI_ROUTE_KEY);
/** Existing synchronous setters retain their contract; actual UI uses the guarded command. */
export function writeNutritionAIRouteRaw(raw: string | null) { if (raw === null) localStorage.removeItem(NUTRITION_AI_ROUTE_KEY); else localStorage.setItem(NUTRITION_AI_ROUTE_KEY, raw); }
const conflict = (message: string): never => { throw new MealRoutePreferenceError(message); };
interface Options { expectedRaw?: string | null; requireLocks?: boolean; canCommit?: () => boolean; validate?: () => void; publish?: () => unknown }
export async function commitNutritionAIRouteRaw(next: string | null, options: Options = {}) {
  if (options.validate?.constructor.name === 'AsyncFunction') throw new Error('Meal-route validation must be synchronous.');
  const origin = { profile: state.currentProfile, thread: state.currentThreadId, root: state.importedData, history: state.chatHistory };
  const current = () => { try { return state.currentProfile === origin.profile && state.currentThreadId === origin.thread && state.importedData === origin.root && state.chatHistory === origin.history && options.canCommit?.() !== false; } catch { return false; } };
  const write = () => {
    if (!current()) conflict('The originating meal-model view changed. Nothing was saved.');
    const before = readNutritionAIRouteRaw();
    if (Object.hasOwn(options, 'expectedRaw') && options.expectedRaw !== before) conflict('The meal-photo model changed. Read a fresh snapshot before trying again.');
    options.validate?.();
    if (!current() || readNutritionAIRouteRaw() !== before) conflict('The meal-photo model or its connection changed before saving.');
    const changed = next !== before;
    if (changed) {
      try {
        writeNutritionAIRouteRaw(next);
        if (readNutritionAIRouteRaw() !== next) throw new Error('Meal-model storage was not confirmed.');
      } catch {
        let restored = false;
        try { if (readNutritionAIRouteRaw() === next) writeNutritionAIRouteRaw(before); restored = readNutritionAIRouteRaw() === before; } catch { /* An unproved rollback stays explicit. */ }
        if (!restored) throw new MealRoutePreferenceError('The meal-photo model outcome is unconfirmed. Check native AI settings before trying again.', true);
        conflict('The meal-photo model could not be saved. Its previous preference was restored.');
      }
    }
    let presentationFailed = false, effectsApplied = false;
    if (current()) { effectsApplied = true; try { options.publish?.(); } catch { presentationFailed = true; } }
    return { before, after: next, changed, settingsSaved: changed, dataSaved: false as const, effectsApplied, presentationFailed };
  };
  if (!navigator.locks?.request) { if (options.requireLocks) conflict('Safe meal-model changes need Web Locks. Use the native controls.'); return write(); }
  return runNativeCommandWithLocks(navigator.locks, ['getbased-nutrition-ai-route'], write);
}
