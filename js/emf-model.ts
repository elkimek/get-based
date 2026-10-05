// emf-model.js — Shared EMF assessment collection and display metadata.

import { state } from './state.js';

export const MEASUREMENT_TYPES = [
  { key: 'acElectric',       short: 'AC Electric' },
  { key: 'acMagnetic',       short: 'AC Magnetic' },
  { key: 'rfMicrowave',      short: 'RF/Microwave' },
  { key: 'dirtyElectricity', short: 'Dirty Elec.' },
  { key: 'dcMagnetic',       short: 'DC Magnetic' },
];

export const SLEEPING_ROOMS = new Set(['Bedroom', 'Children\'s Room', 'Nursery']);

export function ensureEMFAssessments() {
  if (!(state.importedData as { emfAssessment?: unknown }).emfAssessment) {
    (state.importedData as { emfAssessment?: unknown }).emfAssessment = { assessments: [] };
  }
  return (state.importedData as { emfAssessment: { assessments?: unknown } }).emfAssessment.assessments;
}

const SAFE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function safeEMFMediaType(type: unknown): string {
  return SAFE_IMAGE_TYPES.includes(type as string) ? type as string : 'image/png';
}
