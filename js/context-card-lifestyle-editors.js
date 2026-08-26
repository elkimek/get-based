// @ts-check
// context-card-lifestyle-editors.js - cold-safe facade for lifestyle context card editors

import { state } from './state.js';
import { scanDietForContaminants } from './food-contaminants.js';
import { doesNutritionContextOverrideTypicalMeals } from './nutrition-context.js';
import { showNotification } from './utils.js';

/** @typedef {typeof import('./context-card-lifestyle-editors-impl.js')} LifestyleContextEditorsModule */
/** @type {Promise<LifestyleContextEditorsModule> | null} */
let lifestyleContextEditorsPromise = null;
/** @type {LifestyleContextEditorsModule | null} */
let lifestyleContextEditorsModule = null;
let useLifestyleContextEditorsRetryUrl = false;

/** @type {{
 *   recordChange?: (field: string) => void,
 *   saveAndRefresh?: (msg: string, field?: string) => void,
 * }} */
const lifestyleContextEditorDeps = {};

export function isLifestyleContextEditorsLoaded() {
  return lifestyleContextEditorsModule !== null;
}

/** @returns {Promise<LifestyleContextEditorsModule>} */
function loadLifestyleContextEditorsRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./context-card-lifestyle-editors-impl.js?lazy-retry=1');
}

/** @returns {Promise<LifestyleContextEditorsModule>} */
export function loadLifestyleContextEditors() {
  if (!lifestyleContextEditorsPromise) {
    // Browsers cache failed module-map fetches by URL. Retry once with a
    // second fixed literal after a failed first request.
    const load = useLifestyleContextEditorsRetryUrl
      ? loadLifestyleContextEditorsRetryModule()
      : import('./context-card-lifestyle-editors-impl.js');
    lifestyleContextEditorsPromise = load
      .then(module => {
        lifestyleContextEditorsModule = module;
        module.configureLifestyleContextEditors(lifestyleContextEditorDeps);
        return module;
      })
      .catch(err => {
        lifestyleContextEditorsPromise = null;
        lifestyleContextEditorsModule = null;
        useLifestyleContextEditorsRetryUrl = true;
        throw err;
      });
  }
  return lifestyleContextEditorsPromise;
}

/**
 * Store configuration while the implementation is cold, and forward every
 * later update once it is resident.
 *
 * @param {{ recordChange?: (field: string) => void, saveAndRefresh?: (msg: string, field?: string) => void }} [deps]
 */
export function configureLifestyleContextEditors({ recordChange, saveAndRefresh } = {}) {
  /** @type {typeof lifestyleContextEditorDeps} */
  const update = {};
  if (typeof recordChange === 'function') {
    lifestyleContextEditorDeps.recordChange = recordChange;
    update.recordChange = recordChange;
  }
  if (typeof saveAndRefresh === 'function') {
    lifestyleContextEditorDeps.saveAndRefresh = saveAndRefresh;
    update.saveAndRefresh = saveAndRefresh;
  }
  lifestyleContextEditorsModule?.configureLifestyleContextEditors(update);
}

function lifestyleActionAttrs(action, extra = '') {
  return `data-lifestyle-action="${action}"${extra ? ` ${extra}` : ''}`;
}

// The badge is part of the dashboard's cold render, so keep only its small
// scanner/rendering path in the facade.
export function renderDietContaminantsBadge() {
  if (doesNutritionContextOverrideTypicalMeals()) return '';
  const warnings = scanDietForContaminants(state.importedData.diet);
  if (warnings.length === 0) return '';
  const flagged = warnings.filter(warning => warning.type !== 'clean').length;
  if (flagged === 0) return '';
  return `<div class="diet-contaminants" role="button" tabindex="0" ${lifestyleActionAttrs('show-diet-contaminants')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 10 18H2L12 3Z"></path><path d="M12 9v5M12 17h.01"></path></svg><span>${flagged} food contaminant signal${flagged > 1 ? 's' : ''} detected</span></div>`;
}

/** @param {keyof LifestyleContextEditorsModule} name @param {any[]} args @param {boolean} [shouldLoad] */
function runLifestyleContextEditorAction(name, args, shouldLoad = true) {
  const run = (/** @type {LifestyleContextEditorsModule} */ module) => {
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Lifestyle context editor action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args);
  };
  if (!lifestyleContextEditorsModule && !shouldLoad) return undefined;
  try {
    if (lifestyleContextEditorsModule) return run(lifestyleContextEditorsModule);
    return loadLifestyleContextEditors()
      .then(run)
      .catch(err => {
        console.error(`[context-cards] Could not run ${String(name)}:`, err);
        showNotification('Context editor could not be loaded. Try again.', 'error');
        return false;
      });
  } catch (err) {
    console.error(`[context-cards] Could not run ${String(name)}:`, err);
    if (shouldLoad) showNotification('Context editor could not be loaded. Try again.', 'error');
    return shouldLoad ? false : undefined;
  }
}

function closestColdDietContaminantsBadge(target) {
  if (!(target instanceof Element)) return null;
  const badge = target.closest('[data-lifestyle-action="show-diet-contaminants"]');
  return badge instanceof HTMLElement ? badge : null;
}

/** @param {MouseEvent} event */
function handleColdDietContaminantsClick(event) {
  if (lifestyleContextEditorsModule || !closestColdDietContaminantsBadge(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  void runLifestyleContextEditorAction('showDietContaminantsModal', []);
}

/** @param {KeyboardEvent} event */
function handleColdDietContaminantsKeydown(event) {
  if (
    lifestyleContextEditorsModule
    || (event.key !== 'Enter' && event.key !== ' ')
    || !closestColdDietContaminantsBadge(event.target)
  ) return;
  event.preventDefault();
  event.stopPropagation();
  void runLifestyleContextEditorAction('showDietContaminantsModal', []);
}

if (typeof document !== 'undefined') {
  // Capture the first badge click before the dashboard card's click handler.
  // Once the implementation is loaded, its full delegated handlers take over.
  document.addEventListener('click', handleColdDietContaminantsClick, true);
  document.addEventListener('keydown', handleColdDietContaminantsKeydown);
}

export function openDietEditor(...args) { return runLifestyleContextEditorAction('openDietEditor', args); }
export function saveDiet(...args) { return runLifestyleContextEditorAction('saveDiet', args); }
export function clearDiet(...args) { return runLifestyleContextEditorAction('clearDiet', args); }
export function openSleepRestEditor(...args) { return runLifestyleContextEditorAction('openSleepRestEditor', args); }
export function saveSleepRest(...args) { return runLifestyleContextEditorAction('saveSleepRest', args); }
export function clearSleepRest(...args) { return runLifestyleContextEditorAction('clearSleepRest', args); }
export function openLightCircadianEditor(...args) { return runLifestyleContextEditorAction('openLightCircadianEditor', args); }
export function saveLightCircadian(...args) { return runLifestyleContextEditorAction('saveLightCircadian', args); }
export function clearLightCircadian(...args) { return runLifestyleContextEditorAction('clearLightCircadian', args); }
export function openExerciseEditor(...args) { return runLifestyleContextEditorAction('openExerciseEditor', args); }
export function saveExercise(...args) { return runLifestyleContextEditorAction('saveExercise', args); }
export function clearExercise(...args) { return runLifestyleContextEditorAction('clearExercise', args); }
export function openStressEditor(...args) { return runLifestyleContextEditorAction('openStressEditor', args); }
export function saveStress(...args) { return runLifestyleContextEditorAction('saveStress', args); }
export function clearStress(...args) { return runLifestyleContextEditorAction('clearStress', args); }
export function openLoveLifeEditor(...args) { return runLifestyleContextEditorAction('openLoveLifeEditor', args); }
export function saveLoveLife(...args) { return runLifestyleContextEditorAction('saveLoveLife', args); }
export function clearLoveLife(...args) { return runLifestyleContextEditorAction('clearLoveLife', args); }
export function openEnvironmentEditor(...args) { return runLifestyleContextEditorAction('openEnvironmentEditor', args); }
export function saveEnvironment(...args) { return runLifestyleContextEditorAction('saveEnvironment', args); }
export function clearEnvironment(...args) { return runLifestyleContextEditorAction('clearEnvironment', args); }
export function openHealthGoalsEditor(...args) { return runLifestyleContextEditorAction('openHealthGoalsEditor', args); }
export function renderHealthGoalsModal(...args) { return runLifestyleContextEditorAction('renderHealthGoalsModal', args); }
export function addHealthGoal(...args) { return runLifestyleContextEditorAction('addHealthGoal', args); }
export function deleteHealthGoal(...args) { return runLifestyleContextEditorAction('deleteHealthGoal', args); }
export function closeHealthGoals(...args) { return runLifestyleContextEditorAction('closeHealthGoals', args, false); }
export function clearHealthGoals(...args) { return runLifestyleContextEditorAction('clearHealthGoals', args); }
export function openInterpretiveLensEditor(...args) { return runLifestyleContextEditorAction('openInterpretiveLensEditor', args); }
export function saveInterpretiveLens(...args) { return runLifestyleContextEditorAction('saveInterpretiveLens', args); }
export function clearInterpretiveLens(...args) { return runLifestyleContextEditorAction('clearInterpretiveLens', args); }
export function showDietContaminantsModal(...args) { return runLifestyleContextEditorAction('showDietContaminantsModal', args); }
