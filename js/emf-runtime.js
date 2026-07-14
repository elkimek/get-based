// @ts-check
// emf-runtime.js - module-only lazy access to the EMF assessment feature.

/** @type {Promise<typeof import('./emf.js')> | null} */
let emfModulePromise = null;

export async function loadEMFModule() {
  if (!emfModulePromise) {
    emfModulePromise = import('./emf.js').catch(err => {
      emfModulePromise = null;
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
