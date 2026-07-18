// @ts-check
// emf-runtime.js - module-only lazy access to the EMF assessment feature.

/** @type {Promise<typeof import('./emf.js')> | null} */
let emfModulePromise = null;
/** @type {typeof import('./emf.js') | null} */
let emfModule = null;

const emfRuntimeDeps = {
  closeModal: /** @type {null | (() => void)} */ (null),
};

export function configureEMFRuntimeDeps(deps = {}) {
  const previous = { ...emfRuntimeDeps };
  if (Object.hasOwn(deps, 'closeModal')) {
    emfRuntimeDeps.closeModal = typeof deps.closeModal === 'function' ? deps.closeModal : null;
  }
  emfModule?.configureEMFRuntimeDeps(emfRuntimeDeps);
  return previous;
}

export async function loadEMFModule() {
  if (!emfModulePromise) {
    emfModulePromise = import('./emf.js')
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
