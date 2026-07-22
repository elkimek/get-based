// @ts-check
// emf-runtime.js - module-only lazy access to the EMF assessment feature.

/** @typedef {{
 * configureEMFRuntimeDeps: (deps?: object) => unknown,
 * openEMFAssessmentEditor: () => unknown,
 * closeEMFInterpretation: () => unknown,
 * }} EMFModule */

/** @type {Promise<EMFModule> | null} */
let emfModulePromise = null;
/** @type {EMFModule | null} */
let emfModule = null;

function rejectUnconfiguredEMFModuleLoad() {
  throw new Error('EMF module loader is not configured.');
}

const emfRuntimeDeps = {
  closeModal: /** @type {null | (() => void)} */ (null),
  loadModule: /** @type {() => Promise<EMFModule>} */ (rejectUnconfiguredEMFModuleLoad),
};

export function configureEMFRuntimeDeps(deps = {}) {
  const previous = { ...emfRuntimeDeps };
  if (Object.hasOwn(deps, 'closeModal')) {
    emfRuntimeDeps.closeModal = typeof deps.closeModal === 'function' ? deps.closeModal : null;
  }
  if (Object.hasOwn(deps, 'loadModule')) {
    emfRuntimeDeps.loadModule = typeof deps.loadModule === 'function'
      ? deps.loadModule
      : rejectUnconfiguredEMFModuleLoad;
  }
  emfModule?.configureEMFRuntimeDeps(emfRuntimeDeps);
  return previous;
}

export async function loadEMFModule() {
  if (!emfModulePromise) {
    emfModulePromise = Promise.resolve()
      .then(() => emfRuntimeDeps.loadModule())
      .then(mod => {
        emfModule = mod;
        mod.configureEMFRuntimeDeps(emfRuntimeDeps);
        return mod;
      })
      .catch(err => {
        emfModulePromise = null;
        emfModule = null;
        throw err;
      });
  }
  return await emfModulePromise;
}

export async function openEMFAssessmentEditor() {
  const mod = await loadEMFModule();
  return mod.openEMFAssessmentEditor();
}

export async function closeEMFInterpretation() {
  const mod = await loadEMFModule();
  return mod.closeEMFInterpretation();
}
