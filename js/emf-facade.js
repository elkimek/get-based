// @ts-check
// emf-facade.js - lazy window facade for the EMF assessment module

import { registerUtilsRuntimeExports } from './utils-runtime.js';

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

/** @type {Promise<any> | null} */
let emfModulePromise = null;

async function loadEMFModule() {
  if (!emfModulePromise) {
    emfModulePromise = import('./emf.js').catch(err => {
      emfModulePromise = null;
      throw err;
    });
  }
  const mod = await emfModulePromise;
  const exportsByName = {};
  for (const fn of EMF_LAZY_WINDOW_FUNCTIONS) {
    exportsByName[fn] = mod[fn];
  }
  registerUtilsRuntimeExports(exportsByName);
  return mod;
}

export function installEMFLazyFacade() {
  const exportsByName = {};
  for (const fn of EMF_LAZY_WINDOW_FUNCTIONS) {
    exportsByName[fn] = async function(...args) {
      const mod = await loadEMFModule();
      return mod[fn](...args);
    };
  }
  registerUtilsRuntimeExports(exportsByName);
}
