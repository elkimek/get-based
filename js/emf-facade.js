// emf-facade.js - lazy window facade for the EMF assessment module

export const EMF_LAZY_WINDOW_FUNCTIONS = [
  'openEMFAssessmentEditor',
  'addEMFAssessment',
  'toggleEMFAssessment',
  'selectEMFRoom',
  'handleEMFRoomDropdown',
  'addEMFRoom',
  'removeEMFRoom',
  'deleteEMFAssessment',
  'updateEMFField',
  'updateEMFRoom',
  'updateEMFMeasurement',
  'updateEMFMeter',
  'saveEMFExplicit',
  'toggleEMFCompare',
  'interpretEMFAssessment',
  'interpretEMFComparison',
  'closeEMFInterpretation',
  'discussEMFInterpretation',
  'addEMFPhotos',
  'removeEMFPhoto',
  'viewEMFPhoto',
  'handleEMFPDF',
];

let emfModulePromise = null;

async function loadEMFModule() {
  if (!emfModulePromise) {
    emfModulePromise = import('./emf.js').catch(err => {
      emfModulePromise = null;
      throw err;
    });
  }
  const mod = await emfModulePromise;
  for (const fn of EMF_LAZY_WINDOW_FUNCTIONS) {
    window[fn] = mod[fn];
  }
  return mod;
}

export function installEMFLazyFacade() {
  for (const fn of EMF_LAZY_WINDOW_FUNCTIONS) {
    window[fn] = async function(...args) {
      const mod = await loadEMFModule();
      return mod[fn](...args);
    };
  }
}
