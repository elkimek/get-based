type LifestyleContextEditorsModule = typeof import('./context-card-lifestyle-editors-impl.js');
import type { LifestyleEditorDependencies } from './context-card-editor-ui.js';
// context-card-lifestyle-editors.js - cold-safe facade for lifestyle context card editors

import { createRetryingModuleLoader, invokeCachedModule } from './retrying-module-loader.js';
import { state } from './state.js';
import { scanDietForContaminants } from './food-contaminants.js';
import { doesNutritionContextOverrideTypicalMeals } from './context-card-summaries.js';
import { showNotification } from './utils.js';



const lifestyleContextEditorsModuleLoader = createRetryingModuleLoader(
  retry => retry ? loadLifestyleContextEditorsRetryModule() : import('./context-card-lifestyle-editors-impl.js'),
  module => {
    module.configureLifestyleContextEditors(lifestyleContextEditorDeps);
    return module;
  },
);


const lifestyleContextEditorDeps: LifestyleEditorDependencies = {};

export function isLifestyleContextEditorsLoaded() {
  return lifestyleContextEditorsModuleLoader.module !== null;
}


function loadLifestyleContextEditorsRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./context-card-lifestyle-editors-impl.js?lazy-retry=1');
}


export function loadLifestyleContextEditors() {
  return lifestyleContextEditorsModuleLoader.load();
}


export function configureLifestyleContextEditors({ recordChange, saveAndRefresh }: LifestyleEditorDependencies = {}) {

  const update: typeof lifestyleContextEditorDeps = {};
  if (typeof recordChange === 'function') {
    lifestyleContextEditorDeps.recordChange = recordChange;
    update.recordChange = recordChange;
  }
  if (typeof saveAndRefresh === 'function') {
    lifestyleContextEditorDeps.saveAndRefresh = saveAndRefresh;
    update.saveAndRefresh = saveAndRefresh;
  }
  lifestyleContextEditorsModuleLoader.module?.configureLifestyleContextEditors(update);
}

function lifestyleActionAttrs(action: string, extra = '') {
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


function runLifestyleContextEditorAction(name: keyof LifestyleContextEditorsModule, args: unknown[], shouldLoad: boolean = true) {
  const run = (module: LifestyleContextEditorsModule) => {
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Lifestyle context editor action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args);
  };
  if (!lifestyleContextEditorsModuleLoader.module && !shouldLoad) return undefined;
  return invokeCachedModule(lifestyleContextEditorsModuleLoader, loadLifestyleContextEditors, run, (err, phase) => {
    console.error(`[context-cards] Could not run ${String(name)}:`, err);
    if (shouldLoad || phase === 'async') showNotification('Context editor could not be loaded. Try again.', 'error');
    return shouldLoad || phase === 'async' ? false : undefined;
  });
}

function closestColdDietContaminantsBadge(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const badge = target.closest('[data-lifestyle-action="show-diet-contaminants"]');
  return badge instanceof HTMLElement ? badge : null;
}


function handleColdDietContaminantsClick(event: MouseEvent) {
  if (lifestyleContextEditorsModuleLoader.module || !closestColdDietContaminantsBadge(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  void runLifestyleContextEditorAction('showDietContaminantsModal', []);
}


function handleColdDietContaminantsKeydown(event: KeyboardEvent) {
  if (
    lifestyleContextEditorsModuleLoader.module
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

export function openDietEditor(...args: Parameters<LifestyleContextEditorsModule['openDietEditor']>) { return runLifestyleContextEditorAction('openDietEditor', args); }
export function saveDiet(...args: Parameters<LifestyleContextEditorsModule['saveDiet']>) { return runLifestyleContextEditorAction('saveDiet', args); }
export function clearDiet(...args: Parameters<LifestyleContextEditorsModule['clearDiet']>) { return runLifestyleContextEditorAction('clearDiet', args); }
export function openSleepRestEditor(...args: Parameters<LifestyleContextEditorsModule['openSleepRestEditor']>) { return runLifestyleContextEditorAction('openSleepRestEditor', args); }
export function saveSleepRest(...args: Parameters<LifestyleContextEditorsModule['saveSleepRest']>) { return runLifestyleContextEditorAction('saveSleepRest', args); }
export function clearSleepRest(...args: Parameters<LifestyleContextEditorsModule['clearSleepRest']>) { return runLifestyleContextEditorAction('clearSleepRest', args); }
export function openLightCircadianEditor(...args: Parameters<LifestyleContextEditorsModule['openLightCircadianEditor']>) { return runLifestyleContextEditorAction('openLightCircadianEditor', args); }
export function saveLightCircadian(...args: Parameters<LifestyleContextEditorsModule['saveLightCircadian']>) { return runLifestyleContextEditorAction('saveLightCircadian', args); }
export function clearLightCircadian(...args: Parameters<LifestyleContextEditorsModule['clearLightCircadian']>) { return runLifestyleContextEditorAction('clearLightCircadian', args); }
export function openExerciseEditor(...args: Parameters<LifestyleContextEditorsModule['openExerciseEditor']>) { return runLifestyleContextEditorAction('openExerciseEditor', args); }
export function saveExercise(...args: Parameters<LifestyleContextEditorsModule['saveExercise']>) { return runLifestyleContextEditorAction('saveExercise', args); }
export function clearExercise(...args: Parameters<LifestyleContextEditorsModule['clearExercise']>) { return runLifestyleContextEditorAction('clearExercise', args); }
export function openStressEditor(...args: Parameters<LifestyleContextEditorsModule['openStressEditor']>) { return runLifestyleContextEditorAction('openStressEditor', args); }
export function saveStress(...args: Parameters<LifestyleContextEditorsModule['saveStress']>) { return runLifestyleContextEditorAction('saveStress', args); }
export function clearStress(...args: Parameters<LifestyleContextEditorsModule['clearStress']>) { return runLifestyleContextEditorAction('clearStress', args); }
export function openLoveLifeEditor(...args: Parameters<LifestyleContextEditorsModule['openLoveLifeEditor']>) { return runLifestyleContextEditorAction('openLoveLifeEditor', args); }
export function saveLoveLife(...args: Parameters<LifestyleContextEditorsModule['saveLoveLife']>) { return runLifestyleContextEditorAction('saveLoveLife', args); }
export function clearLoveLife(...args: Parameters<LifestyleContextEditorsModule['clearLoveLife']>) { return runLifestyleContextEditorAction('clearLoveLife', args); }
export function openEnvironmentEditor(...args: Parameters<LifestyleContextEditorsModule['openEnvironmentEditor']>) { return runLifestyleContextEditorAction('openEnvironmentEditor', args); }
export function saveEnvironment(...args: Parameters<LifestyleContextEditorsModule['saveEnvironment']>) { return runLifestyleContextEditorAction('saveEnvironment', args); }
export function clearEnvironment(...args: Parameters<LifestyleContextEditorsModule['clearEnvironment']>) { return runLifestyleContextEditorAction('clearEnvironment', args); }
export function openHealthGoalsEditor(...args: Parameters<LifestyleContextEditorsModule['openHealthGoalsEditor']>) { return runLifestyleContextEditorAction('openHealthGoalsEditor', args); }
export function renderHealthGoalsModal(...args: Parameters<LifestyleContextEditorsModule['renderHealthGoalsModal']>) { return runLifestyleContextEditorAction('renderHealthGoalsModal', args); }
export function addHealthGoal(...args: Parameters<LifestyleContextEditorsModule['addHealthGoal']>) { return runLifestyleContextEditorAction('addHealthGoal', args); }
export function deleteHealthGoal(...args: Parameters<LifestyleContextEditorsModule['deleteHealthGoal']>) { return runLifestyleContextEditorAction('deleteHealthGoal', args); }
export function closeHealthGoals(...args: Parameters<LifestyleContextEditorsModule['closeHealthGoals']>) { return runLifestyleContextEditorAction('closeHealthGoals', args, false); }
export function clearHealthGoals(...args: Parameters<LifestyleContextEditorsModule['clearHealthGoals']>) { return runLifestyleContextEditorAction('clearHealthGoals', args); }
export function openInterpretiveLensEditor(...args: Parameters<LifestyleContextEditorsModule['openInterpretiveLensEditor']>) { return runLifestyleContextEditorAction('openInterpretiveLensEditor', args); }
export function saveInterpretiveLens(...args: Parameters<LifestyleContextEditorsModule['saveInterpretiveLens']>) { return runLifestyleContextEditorAction('saveInterpretiveLens', args); }
export function clearInterpretiveLens(...args: Parameters<LifestyleContextEditorsModule['clearInterpretiveLens']>) { return runLifestyleContextEditorAction('clearInterpretiveLens', args); }
export function showDietContaminantsModal(...args: Parameters<LifestyleContextEditorsModule['showDietContaminantsModal']>) { return runLifestyleContextEditorAction('showDietContaminantsModal', args); }
