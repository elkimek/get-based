import { chatDataReadAllowed, CHAT_NATIVE_UI_NOTICE } from '../shared/chat-control-policy.js';
import { isEMFResource, emfFields, emfChoices, displayEMFRecord } from './emf-record-fields.js';
import { projectEMFRecord } from './emf-record-proposals.js';
// Typed resource projections and mutations shared by tool preparation and Apply.
import { agentDataObject, parseAgentDataPatch, validAgentDate, validateFieldNames } from '../shared/agent-data-contract.js';
import type { AgentDataProposal, AgentDataResource } from '../shared/agent-data-contract.js';
import { normalizeNutritionTargets, NUTRITION_WIDGET_NUTRIENTS } from './nutrition-targets.js';
import { appendImportedArrayItem, replaceImportedArrayItem, deleteImportedArrayItem, clearTombstone, getConfiguredArrayItemId } from './data-merge.js';
import { projectSupplementCommand, supplementEditableFields } from './supplement-record-commands.js';
import { displayProfileRecord, profileEditableFields, projectProfileRecord } from './profile-record-commands.js';
import { displayMealRecord, mealEditableFields, parseMealRecordSnapshot, projectMealCommand } from './nutrition-record-commands.js';
import type { ProfileData } from '../types/app-state.js';
import { displayManualRecord, manualEditableFields, manualRecordRules, parseManualRecordSnapshot, projectManualRecord } from './manual-record-commands.js';
import { displayMarkerNote, markerNoteFields, projectMarkerNote } from './marker-note-commands.js';

import { displayLabResult, projectLabResult, labResultFields } from './lab-result-commands.js';

import { displayLabSample, projectLabSample, labSampleFields } from './lab-sample-proposals.js';

import { displayLabReport, projectLabReport, labReportRules } from './lab-report-proposals.js';

import { isGeneticsResource, geneticsCapabilities, displayGeneticsRecord, projectGeneticsRecord } from './genetics-proposals.js';

import { isLightEnvironmentResource, displayLightEnvironmentRecord, lightRoomFields, lightScreenFields } from './light-env-mutations.js';
import { projectLightEnvironmentRecord } from './light-env-proposals.js';

import { isLightDeviceResource } from './light-device-fields.js';
import { displayLightDeviceRecord, projectLightDeviceRecord, lightDeviceCapabilities } from './light-device-proposals.js';

import { isLightMeasurementResource, lightMeasurementFields, lightAuditFields } from './light-measurement-fields.js';
import { displayLightMeasurementRecord, projectLightMeasurementRecord } from './light-measurement-proposals.js';

import { sunSetupFields, sunSetupChoices, displaySunSetupRecord, projectSunSetupRecord } from './sun-setup-proposals.js';

import { sunSessionFields, sunSessionChoices, displaySunSessionRecord, projectSunSessionRecord } from './sun-session-proposals.js';

export { AGENT_DATA_LABELS } from '../shared/agent-data-contract.js';
export const agentDataField = (resource: AgentDataResource) => resource === 'lightDeviceSessions' ? 'deviceSessions' : resource === 'labReports' ? 'importSnapshots' : resource === 'datedNotes' ? 'notes' : resource === 'profileNotes' ? 'contextNotes' : resource === 'meals' ? 'nutritionMeals' : resource === 'manualReadings' ? 'manualBodyReadings' : resource;
export function agentDataRows(data: Partial<ProfileData>, resource: AgentDataResource): unknown[] {
  const value: unknown = data[agentDataField(resource)];
  if (resource === 'profileNotes') return [typeof value === 'string' ? value : ''];
  if (resource === 'nutritionTargets') return [value ?? null];
  if (value != null && !Array.isArray(value)) throw new Error('These records need review in their normal editor.');
  return value || [];
}
export function agentDataIdentity(resource: AgentDataResource, row: unknown): string {
  if (!chatDataReadAllowed(resource)) throw new Error(CHAT_NATIVE_UI_NOTICE);
  if (isEMFResource(resource)) return String(displayEMFRecord(resource, row)?.id || '');
  if (resource === 'sunSessions') return String(displaySunSessionRecord(row)?.id || '');
  if (isLightMeasurementResource(resource)) return String(displayLightMeasurementRecord(row)?.id || '');
  if (isLightDeviceResource(resource)) return String(displayLightDeviceRecord(row)?.id || '');
  if (isLightEnvironmentResource(resource)) return String(displayLightEnvironmentRecord(resource, row)?.id || '');
  if (isGeneticsResource(resource)) return displayGeneticsRecord(row).id;
  if (resource === 'labReports') return displayLabReport(row).id;
  if (resource === 'labSamples') return displayLabSample(row)?.id || '';
  if (resource === 'labResults') return displayLabResult(row).id;
  if (resource === 'markerNotes' || resource === 'markerValueNotes') return displayMarkerNote(row).id;
  if (resource === 'manualReadings') return displayManualRecord(row)?.id || '';
  return resource === 'profileNotes' || resource === 'nutritionTargets' ? '' : getConfiguredArrayItemId(agentDataField(resource), row) || '';
}
export function findAgentDataRecord(data: Partial<ProfileData>, resource: AgentDataResource, id: string): unknown {
  const matches = agentDataRows(data, resource).filter(row => agentDataIdentity(resource, row) === id);
  if (matches.length > 1) throw new Error('This record identity is ambiguous. Review duplicates in the normal editor.');
  return matches[0] ?? null;
}
const targetBounds = { energyKcal: [500, 10000], proteinGPerKg: [0.4, 3.5], proteinFixedG: [10, 500], carbohydrateG: [0, 1500], fatG: [0, 500], fiberG: [0, 150], fluidMl: [0, 10000], sugarG: [0, 500], sodiumMg: [0, 10000] } as const;
export function agentDataCapabilities(resource: AgentDataResource, sampleCycleEnabled = true) {
  if (!chatDataReadAllowed(resource)) throw new Error(CHAT_NATIVE_UI_NOTICE);
  if (isEMFResource(resource)) return { operations: ['add', 'update', 'remove'], fields: emfFields[resource], choices: emfChoices, rules: { scope: 'EMF uses Insight disclosure. List exact assessment, room and measurement IDs. Read a create snapshot before add. Assessment add needs the actual date, first room name and explicitly reported sleeping/daytime boolean. Room add needs its exact parent ID, name and explicit use; never infer use from the name. Reading add needs an exact room ID, type, value and canonical unit. Value corrections require value and unit together; null records an unknown reading and can preserve a reported instrument without inventing a number. Do not reinterpret unsupported units. Use listed native tag labels for the same reported meaning; custom tags are supported for other reported facts. Tags replace the selected list and must retain unremoved existing tags. Photo removal uses existing indices only; original photos and readings remain privately in assessment edit history. Corrections clear stale assessment/comparison interpretation. Removing an assessment removes its local rooms, readings, photos and edit history. Original files, conversations, exports and backups remain. File acquisition, interpretation generation and environment quick choices use their declared native flows.' } };
  if (resource === 'sunSessions') return { operations: ['add', 'update', 'remove', 'start', 'pause', 'resume', 'stop', 'setCoverage', 'setSunscreen', 'rotateSides'], fields: sunSessionFields, choices: sunSessionChoices, rules: { scope: 'List exact Sun session IDs; read the selected record or create a new-record snapshot. Completed adds need actual start time with UTC offset and duration/end. Unreported exposure details remain unknown and block estimates until supplied. Eye-mode choices retain their native UV-blocking meaning; do not infer a lens UV rating from generic glasses. Existing completed inputs can be corrected, including exposure/eye time and location. Corrections retain source/segment/calculation history and recalculate after approval. Precise saved coordinates and private history stay local. useSavedLocation deliberately selects the current app location; false clears it. Explicit latitude/longitude must be reported together. For a new live timer read create:true and use start with reported uncovered regions or an exposure preset, and an explicitly chosen specific saved location or reported coordinates. requirements.start reports skin configuration, saved location suitability and any active timer. Confirmed Fitzpatrick type and location more specific than country are required. Do not supply start/end/duration or eye duration: the timer starts when Apply is processed. Unknown other inputs stay unknown and block estimates; a known eye mode is tracked over the live interval. Do not invent picker defaults. For an existing active timer use pause/resume/stop/rotateSides with empty patch, setCoverage with only regions (empty means covered), or setSunscreen with only sunscreenSPF (0 explicitly means none). These actions take effect when Apply is processed, not at the message time. They retain previous timed slices and source history. Do not use a timer action to backdate a reported past event. Other live input changes still require their declared native flows. Removal clears only this session and its local source/edit/calculation history.' } };
  if (resource === 'sunSetup') return { operations: ['update'], fields: sunSetupFields, choices: sunSetupChoices, rules: { scope: 'Read the current singleton with no record ID. Only explicitly reported facts; partial habits stay unknown. A skin-type change also updates the Light & Circadian card and requires Insight disclosure. Stop an active Sun session before changing safety defaults. Updates preserve source history and saved session calculations, clear prior setup interpretation, and do not mark a partial setup complete. Location, advanced overrides and live Sun sessions use separate application flows.' } };
  if (isLightMeasurementResource(resource)) return { operations: ['add', 'update', 'remove'], fields: resource === 'lightMeasurements' ? lightMeasurementFields : lightAuditFields, rules: { identity: 'Read exact current IDs first. Report reading, unit, actual time with UTC offset and acquisition method. A new current room/tool reading replaces prior readings with reviewed local source history; older readings cannot silently displace newer ones. Existing camera acquisition cannot become a meter entry. Audit add freezes the current environment today; update changes checkpoint date/label/notes, preserving frozen evidence. Remove reviews source/history loss. Camera acquisition uses its dedicated flow; never fabricate hardware facts or derived metadata.' } };
  if (isLightDeviceResource(resource)) return lightDeviceCapabilities(resource);
  if (isLightEnvironmentResource(resource)) return { operations: ['add', 'update', 'remove'], fields: resource === 'lightRooms' ? lightRoomFields : lightScreenFields, rules: { identity: 'List exact room/screen IDs. New rooms need a reported name and new screens need a reported device. Unknown facts stay unknown. Read lightRooms before assigning roomId. Room removal unlinks screens and retains historical measurements and their original room name. todayActive applies only to localDate.' } };
  if (isGeneticsResource(resource)) return geneticsCapabilities(resource);
  if (resource === 'labReports') return { operations: ['remove'], fields: {}, rules: labReportRules };
  if (resource === 'labSamples') return { operations: ['add', 'update', 'remove'], fields: Object.fromEntries(Object.entries(labSampleFields).filter(([key]) => sampleCycleEnabled || !key.startsWith('cycle'))), rules: { scope: 'Collection fields and date apply to EVERY result on the selected sample. Add deliberately creates a separate sample. Update results adds missing markers only. A date correction moves unshared dated notes; notes still used by another source-date sample stay there. Conflicting destination notes require resolution first. Raw report evidence cannot be patched. Active whole-date removals require separate restoration. Cycle fields require enabled Insight context; explicit sample cycle facts do not create or edit periods. Clearing a recorded phase allows ordinary profile-based predictions again.' } };
  if (resource === 'labResults') return { operations: ['update', 'remove', 'revert'], fields: labResultFields, rules: { identity: 'List samples and read the exact result ID. A date alone cannot select a specimen. Revert restores a known original imported value. New samples, missing results, date moves and collection changes use labSamples. Linked calculated values are reviewed and saved together.' } };
  if (resource === 'markerNotes' || resource === 'markerValueNotes') return { operations: ['update', 'remove'], fields: markerNoteFields, rules: { identity: 'List IDs, then read an exact note, including an empty note. Update writes replacement text; remove clears it. Dated marker notes share one address across same-day panels.' } };
  if (resource === 'manualReadings') return { operations: ['add', 'update', 'remove'], fields: manualEditableFields, rules: manualRecordRules };
  if (resource === 'meals') return { operations: ['add', 'update', 'remove'], fields: mealEditableFields };
  if (resource === 'profile') return { operations: ['update'], fields: profileEditableFields };
  if (resource === 'supplements') return { operations: ['add', 'update', 'remove', 'pause', 'stop', 'restart', 'changeDose'], fields: supplementEditableFields };
  if (resource === 'nutritionTargets') return { operations: ['update', 'reset'], fields: { ...targetBounds, proteinBasis: ['general', 'active', 'high', 'custom', 'fixed'], widgetNutrients: NUTRITION_WIDGET_NUTRIENTS } };
  return { operations: resource === 'datedNotes' ? ['add', 'update', 'remove'] : ['update', 'remove'], fields: resource === 'datedNotes' ? { date: 'YYYY-MM-DD', text: 'Required text (max 4000 characters)' } : { text: 'Replacement text (max 4000 characters)' } };
}
export function agentDataDisplay(resource: AgentDataResource, value: unknown): unknown {
  if (!chatDataReadAllowed(resource)) throw new Error(CHAT_NATIVE_UI_NOTICE);
  if (value == null || typeof value !== 'object') return value;
  if (isEMFResource(resource)) return displayEMFRecord(resource, value);
  if (resource === 'sunSessions') return displaySunSessionRecord(value);
  if (resource === 'sunSetup') return displaySunSetupRecord(value);
  if (isLightMeasurementResource(resource)) return displayLightMeasurementRecord(value);
  if (isLightDeviceResource(resource)) return displayLightDeviceRecord(value);
  if (isLightEnvironmentResource(resource)) return displayLightEnvironmentRecord(resource, value);
  if (isGeneticsResource(resource)) return displayGeneticsRecord(value);
  if (resource === 'labReports') return displayLabReport(value);
  if (resource === 'labSamples') return displayLabSample(value);
  if (resource === 'labResults') return displayLabResult(value);
  if (resource === 'meals') return displayMealRecord(value);
  if (resource === 'manualReadings') return displayManualRecord(value);
  if (resource === 'markerNotes' || resource === 'markerValueNotes') return displayMarkerNote(value);
  if (resource === 'profile') return displayProfileRecord(value);
  const allowed = Object.keys(agentDataCapabilities(resource).fields);
  if (resource === 'supplements') allowed.push('endDate', 'currentDose', 'lifecycle');
  if (resource === 'nutritionTargets') return normalizeNutritionTargets(value);
  const result = Object.fromEntries(Object.entries(value).filter(([key]) => allowed.includes(key)));
  if (resource === 'supplements') {
    for (const [key, fields] of Object.entries({ periods: ['start', 'end', 'dose', 'endReason', 'schedule', 'ingredientDoses'], ingredients: ['name', 'amount', 'amountValue', 'amountUnit', 'timesPerDay'], qualityTests: ['category', 'analyte', 'resultText', 'comparator', 'value', 'unit', 'basis', 'status', 'includeInAIContext'] })) {
      if (Array.isArray(result[key])) result[key] = result[key].map((row: unknown, index: number) => ({ index, ...Object.fromEntries(Object.entries(agentDataObject(row)).filter(([field]) => fields.includes(field))) }));
    }
    const select = (value: unknown, fields: string[]) => Object.fromEntries(Object.entries(agentDataObject(value)).filter(([key]) => fields.includes(key)));
    const scheduleFields = ['mode', 'timesPerDay', 'details', 'daysOfWeek', 'intervalDays', 'maxPerDay'];
    const doseFields = ['ingredient', 'source', 'basis', 'value', 'unit', 'text'];
    if (result.schedule) result.schedule = select(result.schedule, scheduleFields);
    if (result.servingSize) result.servingSize = select(result.servingSize, ['value', 'unit']);
    if (result.currentDose && typeof result.currentDose === 'object') result.currentDose = select(result.currentDose, doseFields);
    if (Array.isArray(result.periods)) for (const row of result.periods as Record<string, unknown>[]) {
      if (row.schedule) row.schedule = select(row.schedule, scheduleFields);
      if (row.dose && typeof row.dose === 'object') row.dose = select(row.dose, doseFields);
      if (Array.isArray(row.ingredientDoses)) row.ingredientDoses = row.ingredientDoses.map(value => select(value, doseFields));
    }
    if (result.lifecycle && typeof result.lifecycle === 'object') result.lifecycle = { state: (result.lifecycle as { state?: unknown }).state };
  }
  return result;
}
export function projectAgentDataChange(proposal: AgentDataProposal): { before: unknown; after: unknown } {
  const before: unknown = JSON.parse(proposal.baseline), patch = parseAgentDataPatch(proposal.patch);
  if (!validAgentDate(proposal.effectiveDate) || !agentDataCapabilities(proposal.resource).operations.includes(proposal.operation)) throw new Error('Unsupported data operation or date.');
  if (isEMFResource(proposal.resource)) return projectEMFRecord(proposal);
  if (proposal.resource === 'sunSessions') return projectSunSessionRecord(proposal);
  if (proposal.resource === 'sunSetup') return projectSunSetupRecord(proposal);
  if (isLightMeasurementResource(proposal.resource)) return projectLightMeasurementRecord(proposal);
  if (isLightDeviceResource(proposal.resource)) return projectLightDeviceRecord(proposal);
  if (isLightEnvironmentResource(proposal.resource)) return projectLightEnvironmentRecord(proposal);
  if (isGeneticsResource(proposal.resource)) return projectGeneticsRecord(proposal);
  if (proposal.resource === 'labReports') return projectLabReport(proposal);
  if (proposal.resource === 'labSamples') return projectLabSample(proposal);
  if (proposal.resource === 'labResults') return projectLabResult(proposal, patch);
  if (proposal.resource === 'meals') {
    const snapshot = parseMealRecordSnapshot(before);
    return { before: snapshot.record, after: projectMealCommand(snapshot.record, proposal, patch) };
  }
  if (proposal.resource === 'manualReadings') { parseManualRecordSnapshot(before); return projectManualRecord(proposal, patch); }
  if (proposal.resource === 'markerNotes' || proposal.resource === 'markerValueNotes') return projectMarkerNote(proposal, patch);
  if (proposal.resource === 'profile') {
    if (proposal.recordId !== '') throw new Error('Profile details are a single setting for the current profile.');
    return { before, after: projectProfileRecord(before, patch, proposal.effectiveDate).after };
  }
  if (proposal.resource === 'supplements') return { before, after: projectSupplementCommand(before, proposal, patch) };
  if (proposal.resource === 'nutritionTargets') {
    if (proposal.recordId !== '') throw new Error('Nutrition targets are a single profile setting.');
    if (before !== null) agentDataObject(before);
    if (proposal.operation === 'reset') { validateFieldNames(patch, []); return { before, after: null }; }
    if (!Object.keys(patch).length) throw new Error('Supply at least one target to change.');
    if (patch.proteinBasis === undefined) {
      if (patch.proteinGPerKg !== undefined && patch.proteinFixedG !== undefined) throw new Error('Choose one protein basis.');
      if (patch.proteinGPerKg !== undefined) patch.proteinBasis = 'custom';
      if (patch.proteinFixedG !== undefined) patch.proteinBasis = 'fixed';
    }
    if (patch.proteinGPerKg !== undefined && patch.proteinBasis !== 'custom' || patch.proteinFixedG !== undefined && patch.proteinBasis !== 'fixed') throw new Error('Match the amount to its protein basis.');
    validateFieldNames(patch, [...Object.keys(targetBounds), 'proteinBasis', 'widgetNutrients']);
    for (const [key, bounds] of Object.entries(targetBounds)) if (Object.hasOwn(patch, key) && (typeof patch[key] !== 'number' || !Number.isFinite(patch[key]) || patch[key] < bounds[0] || patch[key] > bounds[1])) throw new Error(`Enter ${key} in its allowed range.`);
    if (Object.hasOwn(patch, 'proteinBasis') && !['general', 'active', 'high', 'custom', 'fixed'].includes(String(patch.proteinBasis))) throw new Error('Choose a supported protein basis.');
    if (Object.hasOwn(patch, 'widgetNutrients') && (!Array.isArray(patch.widgetNutrients) || patch.widgetNutrients.some(key => !NUTRITION_WIDGET_NUTRIENTS.includes(key)))) throw new Error('Choose supported widget nutrients.');
    return { before, after: { ...before as object, ...normalizeNutritionTargets({ ...before as object, ...patch, configured: true }) } };
  }
  if (proposal.resource === 'profileNotes') {
    if (proposal.recordId !== '') throw new Error('Profile context notes are a single setting.');
    validateFieldNames(patch, proposal.operation === 'remove' ? [] : ['text']);
    if (proposal.operation === 'remove') return { before, after: '' };
    if (typeof patch.text !== 'string' || !patch.text.trim()) throw new Error('Supply the replacement text or use remove to clear it.');
    return { before, after: patch.text.trim() };
  }
  validateFieldNames(patch, proposal.operation === 'remove' ? [] : ['date', 'text']);
  if (proposal.operation === 'remove') { if (!before) throw new Error('This note is no longer available.'); return { before, after: null }; }
  if (proposal.operation === 'add' ? before !== null : !before) throw new Error('Read the intended note first.');
  const after = { ...(before == null ? {} : agentDataObject(before)), ...patch };
  if (!validAgentDate(after.date) || typeof after.text !== 'string' || !after.text.trim()) throw new Error('A note needs a real date and nonempty text.');
  after.text = after.text.trim(); after.updatedAt = proposal.recordedAt;
  return { before, after };
}
export function applyAgentDataChange(data: ProfileData, proposal: AgentDataProposal) {
  if (proposal.resource === 'customMarkers') throw new Error('Custom markers must be saved through their native owner.');
  if (proposal.resource === 'markerRanges') throw new Error('Marker ranges must be saved through their native range owner.');
  if (proposal.resource === 'knowledgeImports' || proposal.resource === 'knowledgeDocuments' || proposal.resource === 'knowledgeLibraries' || proposal.resource === 'knowledgeSettings' || isEMFResource(proposal.resource) || proposal.resource === 'sunSessions' || proposal.resource === 'sunSetup' || isLightMeasurementResource(proposal.resource) || isLightDeviceResource(proposal.resource) || isLightEnvironmentResource(proposal.resource) || isGeneticsResource(proposal.resource) || ['profile', 'meals', 'manualReadings', 'markerNotes', 'markerValueNotes', 'labResults', 'labSamples', 'labReports'].includes(proposal.resource)) throw new Error('These records must be saved through their domain owner.');
  const { after } = projectAgentDataChange(proposal), field = agentDataField(proposal.resource);
  if (proposal.resource === 'profileNotes') { data.contextNotes = String(after); return; }
  if (proposal.resource === 'nutritionTargets') { data.nutritionTargets = after as Record<string, unknown> | null; return; }
  const rows = agentDataRows(data, proposal.resource), index = rows.findIndex(row => agentDataIdentity(proposal.resource, row) === proposal.recordId);
  if (proposal.operation === 'add') appendImportedArrayItem(data, field, after);
  else if (index < 0) throw new Error('The selected record is no longer available.');
  else if (after === null) deleteImportedArrayItem(data, field, index);
  else replaceImportedArrayItem(data, field, index, after);
  if (after !== null) clearTombstone(data, field, agentDataIdentity(proposal.resource, after));
}
