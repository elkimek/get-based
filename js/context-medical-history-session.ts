// Medical History is one atomic draft; condition/family rows remain local until Save.
import { createContextFieldSession } from './context-field-session.js';
import { medicalHistoryValue } from './context-medical-history-model.js';
import type { MedicalHistoryDraft } from './context-medical-history-model.js';
export function createMedicalHistorySession() {
  return createContextFieldSession<MedicalHistoryDraft | null>('diagnoses', (draft, value) => {
    draft.diagnoses = value === null ? null : medicalHistoryValue(value);
  });
}
