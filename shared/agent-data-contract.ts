// Bounded semantic operations, never arbitrary storage paths or object patches.
export const AGENT_DATA_RESOURCES = ['knowledgeImports', 'knowledgeSettings', 'knowledgeLibraries', 'knowledgeDocuments', 'supplements', 'nutritionTargets', 'datedNotes', 'profileNotes', 'profile', 'meals', 'manualReadings', 'markerNotes', 'markerValueNotes', 'markerRanges', 'customMarkers', 'markerDisplay', 'labCategories', 'labResults', 'labSamples', 'labReports', 'geneticVariants', 'maternalHaplogroup', 'genome', 'lightRooms', 'lightScreens', 'lightDevices', 'lightDeviceSessions', 'lightMeasurements', 'lightAudits', 'sunSetup', 'sunSessions', 'emfAssessments', 'emfRooms', 'emfMeasurements'] as const;
export const AGENT_DATA_LABELS = { knowledgeImports: 'Knowledge Base Import', knowledgeDocuments: 'Knowledge Base Documents', knowledgeLibraries: 'Knowledge Base Libraries', knowledgeSettings: 'Knowledge Base Preferences', supplements: 'Supplements & Medications', nutritionTargets: 'Nutrition Targets', datedNotes: 'Dated Notes', profileNotes: 'Profile Context Note', profile: 'Profile Details', meals: 'Meals & Drinks', manualReadings: 'Manual Body Readings', markerNotes: 'Marker Notes', markerValueNotes: 'Dated Marker Notes', markerRanges: 'Marker Ranges', customMarkers: 'Custom Markers', markerDisplay: 'Marker Names & Placement', labCategories: 'Lab Category Names', labResults: 'Lab Results', labSamples: 'Lab Samples', labReports: 'Lab Reports', geneticVariants: 'Genetic Variants', maternalHaplogroup: 'Maternal Haplogroup', genome: 'Genome Data', lightRooms: 'Light Rooms', lightScreens: 'Light Screens', lightDevices: 'Light Devices', lightDeviceSessions: 'Light Device Sessions', lightMeasurements: 'Light Measurements', lightAudits: 'Light Audits', sunSetup: 'Light & Sun Setup', sunSessions: 'Sun Sessions', emfAssessments: 'EMF Assessments', emfRooms: 'EMF Rooms', emfMeasurements: 'EMF Measurements' } as const;
export type AgentDataResource = typeof AGENT_DATA_RESOURCES[number];
export const AGENT_DATA_OPERATIONS = ['add', 'update', 'remove', 'revert', 'reset', 'start', 'pause', 'resume', 'stop', 'restart', 'changeDose', 'setCoverage', 'setSunscreen', 'rotateSides'] as const;
export type AgentDataOperation = typeof AGENT_DATA_OPERATIONS[number];
export const LEGACY_AGENT_DRAFT_KINDS = ['note', 'meal', 'biometric', 'supplement'] as const;
export type AgentLegacyDraftKind = typeof LEGACY_AGENT_DRAFT_KINDS[number];
export interface AgentDataProposal {
  resource: AgentDataResource; operation: AgentDataOperation; recordId: string;
  baseline: string; patch: string; reason: string; evidence: string;
  effectiveDate: string; recordedAt: number;
}
export function agentDataObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Supply an object with supported fields.');
  return value as Record<string, unknown>;
}
export function parseAgentDataPatch(value: string): Record<string, unknown> {
  if (value.length > 16000) throw new Error('The proposed fields are too large.');
  const parsed: unknown = JSON.parse(value);
  const check = (value: unknown, depth: number): void => {
    if (depth > 6) throw new Error('The proposed fields are too deeply nested.');
    if (Array.isArray(value)) {
      if (value.length > 100) throw new Error('Too many proposed records.');
      value.forEach(item => check(item, depth + 1));
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (!/^[A-Za-z][A-Za-z0-9]{0,79}$/.test(key) || ['constructor', 'prototype'].includes(key)) throw new Error('Invalid proposed field.');
        check(item, depth + 1);
      }
    } else if (!(value === null || typeof value === 'boolean' || typeof value === 'string' && value.length <= 4000 || typeof value === 'number' && Number.isFinite(value))) throw new Error('Invalid proposed value.');
  };
  check(parsed, 0);
  return agentDataObject(parsed);
}
export function normalizeAgentDataProposal(value: unknown): AgentDataProposal | null {
  try {
    const source = agentDataObject(value);
    if (!AGENT_DATA_RESOURCES.includes(source.resource as AgentDataResource) || !AGENT_DATA_OPERATIONS.includes(source.operation as AgentDataOperation)
      || typeof source.recordId !== 'string' || !/^[A-Za-z0-9_.-]{0,160}$/.test(source.recordId)
      || typeof source.baseline !== 'string' || source.baseline.length > 64000
      || typeof source.patch !== 'string' || typeof source.reason !== 'string' || !source.reason.trim() || source.reason.length > 500
      || typeof source.evidence !== 'string' || !source.evidence.trim() || source.evidence.length > 1000
      || typeof source.effectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(source.effectiveDate)
      || typeof source.recordedAt !== 'number' || !Number.isFinite(source.recordedAt) || source.recordedAt < 0) return null;
    JSON.parse(source.baseline); parseAgentDataPatch(source.patch);
    return { resource: source.resource as AgentDataResource, operation: source.operation as AgentDataOperation, recordId: source.recordId,
      baseline: source.baseline, patch: source.patch, reason: source.reason.trim(), evidence: source.evidence.trim(), effectiveDate: source.effectiveDate, recordedAt: source.recordedAt };
  } catch { return null; }
}

export function supersedePendingDataProposals(messages: readonly { agentDrafts?: unknown }[]) {
  const newer = new Set<string>();
  for (const message of [...messages].reverse()) for (const raw of [...(Array.isArray(message.agentDrafts) ? message.agentDrafts : [])].reverse()) {
    if (!raw || typeof raw !== 'object') continue;
    const draft = raw as Record<string, unknown>, proposal = draft.kind === 'data' ? normalizeAgentDataProposal(draft.payload) : null;
    if (!proposal || typeof draft.profileId !== 'string') continue;
    let targets=[''];
    if(proposal.resource==='knowledgeImports'){
      const patch=parseAgentDataPatch(proposal.patch);
      if(patch.input==='chooseFiles')targets=[`/request/${String(patch.replaceDocumentId||draft.id||'files')}`];
      else if(patch.input==='selectedFiles'){
        try{const base=agentDataObject(JSON.parse(proposal.baseline)),source=agentDataObject(base.source),selection=agentDataObject(base.selection);if(!Array.isArray(selection.documents)||!Array.isArray(source.documents)||!Array.isArray(patch.replacementIds))throw new Error('Invalid input');const ids=patch.replacementIds,documents=source.documents;targets=selection.documents.map((raw,index)=>{const doc=agentDataObject(raw),replacement=documents.find(row=>agentDataObject(row).documentId===ids[index]);return `/${String(replacement?agentDataObject(replacement).source:doc.source).trim()}`;});}catch{targets=['/unavailable-source'];}
      }else targets=[`/${String(patch.source||'').trim()}`];
    }
    const keys=targets.map(target=>`${draft.profileId}/${proposal.resource}/${proposal.recordId}${target}`);
    if(keys.some(key=>newer.has(key))&&draft.status==='pending')draft.status='superseded';
    for(const key of keys)newer.add(key);
  }
}

export function validAgentDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateFieldNames(value: Record<string, unknown>, allowed: readonly string[]) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`This field is not editable: ${key}.`);
}
