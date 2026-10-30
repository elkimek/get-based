import type { AgentDataResource, AgentDataOperation } from './agent-data-contract.js';
// Product scope for chat controls. Native UI owners keep their full capabilities.
export const CHAT_APP_READ_ACTIONS = ['conversations.search', 'wearables.sources', 'profiles', 'profile.selection', 'display.preferences', 'labs.comparison', 'labs.correlations', 'labs.overlays', 'history.views', 'assistant.models', 'assistant.selection', 'assistant.connections', 'assistant.connection'] as const;
export const CHAT_APP_REVIEW_ACTIONS = ['profile.selection', 'display.preferences', 'labs.overlays', 'assistant.selection', 'assistant.connection'] as const;
export const chatAppActionAllowed = (action: string) => CHAT_APP_READ_ACTIONS.some(id => id === action);
export function chatAppControlAllowed(action: string, parameters: object): boolean {
  return !!parameters && typeof parameters === 'object' && !Array.isArray(parameters) && CHAT_APP_REVIEW_ACTIONS.some(id => id === action)
    && (action !== 'display.preferences' || !Object.hasOwn(parameters, 'timeFormat'));
}
export function chatNavigationAllowed(request: { view?: string; snapshotId?: string; layout?: unknown; dashboard?: unknown; mealRoute?: unknown; personaDraft?: unknown }): boolean {
  return !['personaEditor', 'personaDelete', 'chatPersona'].includes(request.view || '')
    && request.layout === undefined && request.dashboard === undefined && request.mealRoute === undefined && request.personaDraft === undefined
    && !(request.snapshotId && ['dashboard', 'aiSettings'].includes(request.view || ''));
}
export const CHAT_NATIVE_UI_NOTICE = 'Use the native settings or editor for this change. Chat cannot apply or undo it.';

// New native identities/operations require explicit chat-scope review before exposure.
export const CHAT_DATA_READ_RESOURCES = Object.freeze(['supplements', 'nutritionTargets', 'datedNotes', 'profileNotes', 'profile', 'meals', 'manualReadings', 'markerNotes', 'markerValueNotes', 'labResults', 'labSamples', 'labReports', 'geneticVariants', 'maternalHaplogroup', 'lightRooms', 'lightScreens', 'lightDevices', 'lightDeviceSessions', 'lightMeasurements', 'lightAudits', 'sunSetup', 'sunSessions', 'emfAssessments', 'emfRooms', 'emfMeasurements'] as const satisfies readonly AgentDataResource[]);
export const CHAT_DATA_WRITE_RESOURCES = Object.freeze(CHAT_DATA_READ_RESOURCES.filter(resource => resource !== 'labReports'));
export const CHAT_DATA_OPERATIONS = Object.freeze(['add', 'update', 'remove', 'revert', 'reset', 'start', 'pause', 'resume', 'stop', 'restart', 'changeDose', 'setCoverage', 'setSunscreen', 'rotateSides'] as const satisfies readonly AgentDataOperation[]);
export const chatDataReadAllowed = (resource: string) => CHAT_DATA_READ_RESOURCES.some(id => id === resource);
export const chatDataChangeAllowed = (resource: string, operation: string) => CHAT_DATA_WRITE_RESOURCES.some(id => id === resource)
  && CHAT_DATA_OPERATIONS.some(id => id === operation) && !(resource === 'labSamples' && operation === 'remove');
