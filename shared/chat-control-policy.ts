import type { AgentDataResource, AgentDataOperation } from './agent-data-contract.js';
// Chat maintains health information. Application management belongs in native UI.
export const CHAT_APP_READ_ACTIONS: readonly string[] = Object.freeze([]);
export const CHAT_APP_REVIEW_ACTIONS: readonly string[] = Object.freeze([]);
export const chatAppActionAllowed = (_action: string): boolean => false;
export const chatAppControlAllowed = (_action: string, _parameters: object): boolean => false;
export const CHAT_HEALTH_NAVIGATION_VIEWS = ['labs', 'biologyScores', 'genome', 'body', 'nutrition', 'supplements', 'light', 'insight', 'recommendations', 'correlations', 'compare', 'category', 'contextEditor', 'nutritionHistory', 'wearableDetail', 'nutritionEditor', 'nutritionTargets', 'fluidLog', 'lightDevice', 'sunSession', 'deviceSession', 'lightAssessment', 'emfAssessment'] as const;
export const CHAT_HEALTH_NAVIGATION_FIELDS: readonly string[] = Object.freeze(['view', 'marker', 'category', 'card', 'recordId']);
export function chatNavigationAllowed<T extends { view?: string }>(request: T): boolean {
  return (!request.view || CHAT_HEALTH_NAVIGATION_VIEWS.some(view => view === request.view))
    && Object.entries(request).every(([field, value]) => value === undefined || CHAT_HEALTH_NAVIGATION_FIELDS.includes(field));
}
export const CHAT_NATIVE_UI_NOTICE = 'Use the native settings or editor for this change. Chat cannot apply or undo it.';

export const CHAT_DATA_READ_RESOURCES = Object.freeze(['supplements', 'nutritionTargets', 'datedNotes', 'profileNotes', 'profile', 'meals', 'manualReadings', 'markerNotes', 'markerValueNotes', 'labResults', 'labSamples', 'labReports', 'geneticVariants', 'maternalHaplogroup', 'lightRooms', 'lightScreens', 'lightDevices', 'lightDeviceSessions', 'lightMeasurements', 'lightAudits', 'sunSetup', 'sunSessions', 'emfAssessments', 'emfRooms', 'emfMeasurements'] as const satisfies readonly AgentDataResource[]);
export const CHAT_DATA_WRITE_RESOURCES = Object.freeze(CHAT_DATA_READ_RESOURCES.filter(resource => !['labReports', 'lightDevices', 'lightAudits'].includes(resource)));
export const CHAT_DATA_OPERATIONS = Object.freeze(['add', 'update', 'remove', 'revert', 'pause', 'stop', 'restart', 'changeDose'] as const satisfies readonly AgentDataOperation[]);
export const CHAT_PROFILE_FIELDS: readonly string[] = Object.freeze(['name', 'sex', 'dob', 'height', 'location']);
export const chatDataReadAllowed = (resource: string) => CHAT_DATA_READ_RESOURCES.some(id => id === resource);
export const chatDataChangeAllowed = (resource: string, operation: string) => CHAT_DATA_WRITE_RESOURCES.some(id => id === resource)
  && CHAT_DATA_OPERATIONS.some(id => id === operation) && !(resource === 'labSamples' && operation === 'remove')
  && (resource !== 'sunSessions' || ['add', 'update', 'remove'].includes(operation));
export function chatDataFieldAllowed(resource: string, field: string): boolean {
  return resource === 'profile' ? CHAT_PROFILE_FIELDS.includes(field)
    : resource !== 'nutritionTargets' || !['widgetNutrients', 'proteinBasis'].includes(field);
}
export function chatDataPatchAllowed(resource: string, operation: string, patch: unknown): boolean {
  return chatDataChangeAllowed(resource, operation) && !!patch && typeof patch === 'object' && !Array.isArray(patch)
    && (operation !== 'update' || Object.keys(patch).length > 0)
    && Object.keys(patch).every(field => chatDataFieldAllowed(resource, field));
}
