// Stable lazy URL and public helper contracts delegate to one authored owner.
import { medicalHistoryAction, openDiagnosesEditor as openMedicalHistory }  from './context-medical-history-view.js';
export { configureMedicalHistoryEditor, renderDiagnosesModal, saveDiagnoses, closeDiagnoses, clearDiagnoses, hideMedicalHistorySuggestions } from './context-medical-history-view.js';
export type { MedicalHistoryEditorDependencies } from './context-medical-history-view.js';
export function filterConditionSuggestions(): void { medicalHistoryAction('filterConditionSuggestions'); }
export function selectConditionSuggestion(name: string): void { medicalHistoryAction('selectConditionSuggestion', name); }
export function syncDiagnosesNote(): void { medicalHistoryAction('syncDiagnosesNote'); }
export function addCondition(): void { medicalHistoryAction('addCondition'); }
export function editCondition(index: number): void { medicalHistoryAction('editCondition', index); }
export function cancelConditionEdit(): void { medicalHistoryAction('cancelConditionEdit'); }
export function deleteCondition(index: number): void { medicalHistoryAction('deleteCondition', index); }
export function filterFamilyConditionSuggestions(): void { medicalHistoryAction('filterFamilyConditionSuggestions'); }
export function selectFamilyConditionSuggestion(name: string): void { medicalHistoryAction('selectFamilyConditionSuggestion', name); }
export function addFamilyHistoryEntry(): void { medicalHistoryAction('addFamilyHistoryEntry'); }
export function editFamilyHistoryEntry(index: number): void { medicalHistoryAction('editFamilyHistoryEntry', index); }
export function cancelFamilyHistoryEdit(): void { medicalHistoryAction('cancelFamilyHistoryEdit'); }
export function deleteFamilyHistoryEntry(index: number): void { medicalHistoryAction('deleteFamilyHistoryEntry', index); }

export function openDiagnosesEditor(): void | Promise<unknown> { return openMedicalHistory(); }
