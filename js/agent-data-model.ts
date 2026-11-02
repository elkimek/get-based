// Full native-domain projection facade; chat imports only agent-health-data-model.
import { isLabDisplayResource } from './lab-display-core.js';
import { displayLabDisplay, projectLabDisplay, labDisplayFields } from './lab-display-proposals.js';
import { displayCustomMarker, projectCustomMarker, customMarkerFields } from './custom-marker-proposals.js';
import { displayMarkerRange, projectMarkerRange, markerRangeFields } from './marker-range-commands.js';
import { displayKnowledgeImport, projectKnowledgeImport, knowledgeImportFields } from './knowledge-import-model.js';
import { displayKnowledgeDocument, projectKnowledgeDocument, knowledgeDocumentFields } from './knowledge-document-model.js';
import { knowledgeLibraryFields, knowledgeLibraryModels, displayKnowledgeLibrary, projectKnowledgeLibrary } from './knowledge-library-proposals.js';
import { knowledgeSettingsFields, displayKnowledgeSettings, projectKnowledgeSettings } from './knowledge-settings-proposals.js';
import * as health from './agent-health-data-model.js';
import { parseAgentDataPatch, validAgentDate } from '../shared/agent-data-contract.js';
import type { AgentDataProposal, AgentDataResource } from '../shared/agent-data-contract.js';
import type { ProfileData } from '../types/app-state.js';
export { AGENT_DATA_LABELS, agentDataField, agentDataRows } from './agent-health-data-model.js';
export function agentDataIdentity(resource: AgentDataResource, row: unknown): string {
  if (resource === 'knowledgeImports') return String(displayKnowledgeImport(row)?.libraryId || '');
  if (resource === 'knowledgeDocuments') return displayKnowledgeDocument(row)?.documentId || '';
  if (resource === 'knowledgeLibraries') return displayKnowledgeLibrary(row)?.libraryId || '';
  if (isLabDisplayResource(resource)) return displayLabDisplay(row)?.id || '';
  if (resource === 'customMarkers') return displayCustomMarker(row)?.markerKey || '';
  if (resource === 'markerRanges') return displayMarkerRange(row).id;
  return health.agentDataIdentity(resource, row);
}
export function findAgentDataRecord(data: Partial<ProfileData>, resource: AgentDataResource, id: string): unknown {
  const matches = health.agentDataRows(data, resource).filter(row => agentDataIdentity(resource, row) === id);
  if (matches.length > 1) throw new Error('This record identity is ambiguous. Review duplicates in the normal editor.');
  return matches[0] ?? null;
}
export function agentDataCapabilities(resource: AgentDataResource, sampleCycleEnabled = true) {
  if (resource === 'knowledgeImports') return { operations: ['start'], fields: knowledgeImportFields, rules: 'List library IDs, then read the exact target library (no create flag). Start imports exact user-pasted text, with a reviewed filename and selected library embedding model. Text must occur verbatim in the current user message. Never invent or reconstruct source contents. Existing filenames require explicit replaceDocumentId. Apply can download model weights and indexes locally; Stop indexing works before saving. Original files and recovery snapshots remain. For local files or larger documents use input:chooseFiles with no text/source field; optionally supply an exact replaceDocumentId. The user chooses files locally, gets a separate metadata review and then applies it. Never supply selectedFiles or file tokens. Text, Markdown, PDF and DOCX are supported; archives use the native importer until archive review is available. Unknown outcomes use read-only Check saved change, never replay.' };
  if (resource === 'knowledgeDocuments') return { operations: ['update', 'remove'], fields: knowledgeDocumentFields, rules: 'Indexed document metadata shared by all profiles. List/read exact IDs and resolve ambiguous filenames or libraries. Update changes only the indexed filename; original files, contents and vectors are unchanged. Remove deindexes the current document and its verified excerpts; recovery snapshots, originals, conversations, exports and backups remain. Names must be unique within the library. Model/loading/active library are unchanged. Imports, content replacement and reindexing require their dedicated chosen-content workflows. Unknown Apply outcomes use read-only Check saved change, never replay.' };
  if (resource === 'knowledgeLibraries') return { operations: ['add', 'update', 'remove'], fields: knowledgeLibraryFields, models: knowledgeLibraryModels, rules: 'Local libraries shared by every profile in this browser. Read an exact library or create snapshot. Adding requires name, modelKey and explicit active choice. Update name or active:true; models are fixed at creation. Removal reviews verified document/excerpt counts and the active replacement; stored file cleanup can fail and is reported separately. No model is downloaded by management. Imports/indexing and credentials are separate workflows.' };
  if (resource === 'knowledgeSettings') return { operations: ['update'], fields: knowledgeSettingsFields, rules: 'Browser-wide retrieval preferences, shared by all profiles. Only enabled, topK and multiQuery are editable. Enabling allows configured Knowledge Base excerpts in chat; search rewriting can make an extra AI request. Connections, credentials, library names, documents, models and files use their own workflows.' };
  if (isLabDisplayResource(resource)) return { operations: ['update', 'revert'], fields: labDisplayFields[resource], rules: 'List and read the exact canonical marker/category ID. Only explicitly requested display labels or placement; never reinterpret a marker’s clinical meaning. Marker update accepts name and/or exact compatible category key from choices. Marker revert requires fields containing only the explicitly requested name/category fields. Category update accepts label; category revert has an empty patch and restores its saved base label. These do not change marker IDs, observations, units, calculations, notes, original definitions or AI permission groups. Ordering and decorative icons are separate workflows.' };
  if (resource === 'customMarkers') return { operations: ['add', 'remove'], fields: customMarkerFields, rules: 'Create only when explicitly requested, with the stated name, exact existing category key or explicit new category name, and explicit canonical/input unit. Empty unit means deliberately dimensionless. Ask when a unit or category is missing. Do not infer bounds or conversions. A creation snapshot lists enabled categories. Creation adds a definition without inventing results. For removal read the exact custom marker key; the review shows affected results, notes, manual edits, settings and empty samples. Apply opens a separate native destructive confirmation. Other markers, original reports, exports and backups remain. Built-in markers cannot be deleted this way. Restoration requires the native chosen-backup flow. Existing ranges, labels and placement use their declared workflows.' };
  if (resource === 'markerRanges') return { operations: ['update', 'revert'], fields: markerRangeFields, rules: 'List the marker, then read its exact reference or optimal range ID. Supply only stated bounds and an explicit supported unit. Never infer a new range from a result, diagnosis or recommendation. Omitted bounds stay unchanged; null means an open bound. Update changes this profile-wide base range only. Revert restores the preserved original for a manual override; it cannot delete imported ranges. Context-specific ranges retain their native precedence. Recorded results, samples, sources and calculations are unchanged.' };
  return health.agentDataCapabilities(resource, sampleCycleEnabled);
}
export function agentDataDisplay(resource: AgentDataResource, value: unknown): unknown {
  if (resource === 'knowledgeImports') return displayKnowledgeImport(value);
  if (resource === 'knowledgeDocuments') return displayKnowledgeDocument(value);
  if (resource === 'knowledgeLibraries') return displayKnowledgeLibrary(value);
  if (resource === 'knowledgeSettings') return displayKnowledgeSettings(value);
  if (isLabDisplayResource(resource)) return displayLabDisplay(value);
  if (resource === 'customMarkers') return displayCustomMarker(value);
  if (resource === 'markerRanges') return displayMarkerRange(value);
  return health.agentDataDisplay(resource, value);
}
export function projectAgentDataChange(proposal: AgentDataProposal): { before: unknown; after: unknown } {
  JSON.parse(proposal.baseline);
  const patch = parseAgentDataPatch(proposal.patch);
  if (!validAgentDate(proposal.effectiveDate) || !agentDataCapabilities(proposal.resource).operations.includes(proposal.operation)) throw new Error('Unsupported data operation or date.');
  if (proposal.resource === 'knowledgeImports') return projectKnowledgeImport(proposal);
  if (proposal.resource === 'knowledgeDocuments') return projectKnowledgeDocument(proposal);
  if (proposal.resource === 'knowledgeLibraries') return projectKnowledgeLibrary(proposal);
  if (proposal.resource === 'knowledgeSettings') return projectKnowledgeSettings(proposal);
  if (isLabDisplayResource(proposal.resource)) return projectLabDisplay(proposal);
  if (proposal.resource === 'customMarkers') return projectCustomMarker(proposal);
  if (proposal.resource === 'markerRanges') return projectMarkerRange(proposal, patch);
  return health.projectAgentDataChange(proposal);
}
import { isEMFResource } from './emf-record-fields.js';
import { isLightMeasurementResource } from './light-measurement-fields.js';
import { isLightDeviceResource } from './light-device-fields.js';
import { isLightEnvironmentResource } from './light-env-mutations.js';
import { isGeneticsResource } from './genetics-proposals.js';
export function applyAgentDataChange(data: ProfileData, proposal: AgentDataProposal) {
  if (isLabDisplayResource(proposal.resource)) throw new Error('Lab display metadata must be saved through its native owner.');
  if (proposal.resource === 'customMarkers') throw new Error('Custom markers must be saved through their native owner.');
  if (proposal.resource === 'markerRanges') throw new Error('Marker ranges must be saved through their native range owner.');
  if (proposal.resource === 'knowledgeImports' || proposal.resource === 'knowledgeDocuments' || proposal.resource === 'knowledgeLibraries' || proposal.resource === 'knowledgeSettings' || isEMFResource(proposal.resource) || proposal.resource === 'sunSessions' || proposal.resource === 'sunSetup' || isLightMeasurementResource(proposal.resource) || isLightDeviceResource(proposal.resource) || isLightEnvironmentResource(proposal.resource) || isGeneticsResource(proposal.resource) || ['profile', 'meals', 'manualReadings', 'markerNotes', 'markerValueNotes', 'labResults', 'labSamples', 'labReports'].includes(proposal.resource)) throw new Error('These records must be saved through their domain owner.');
  return health.applyAgentDataChange(data, proposal);
}
