// Pure bounded schemas and immutable review projection.
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { agentDataObject, parseAgentDataPatch, validateFieldNames, validAgentDate } from '../shared/agent-data-contract.js';
import { isLightMeasurementResource, LIGHT_READING_TOOLS, lightMeasurementFields, lightAuditFields } from './light-measurement-fields.js';
import type { LightMeasurementResource, LightMeasurementRecord } from './light-measurement-fields.js';
export interface LightMeasurementEffects {
  replacedMeasurements: Array<Record<string, unknown>>; preservedAuditCount: number;
  capturedCounts: { rooms: number; screens: number; measurements: number } | null;
  retainedHistory: boolean; removedHistoryCount: number; removedSnapshot: boolean; analysisCleared: boolean;
}
export interface LightMeasurementPlan { after: Record<string, unknown> | null; effects: LightMeasurementEffects; }
export interface LightMeasurementSnapshot { version: 1; resource: LightMeasurementResource; id: string; record: Record<string, unknown> | null; revision: string; plan?: LightMeasurementPlan; }
export function measurementUnit(row: Pick<LightMeasurementRecord, 'tool' | 'extra'>): string {
  if (row.tool === 'darkness') return row.extra?.method === 'meter-entry' || row.extra?.source === 'meter-entry' ? 'lux' : 'camera-percent';
  return ({ lux: 'lux', cct: 'K', flicker: 'banding-score', spectrum: 'classification', 'brightness-proxy': 'camera-percent', 'glass-transmission': 'ratio', audit: 'pause-count' } as Record<string, string>)[row.tool] || 'unknown';
}
export function validateLightMeasurementPatch(resource: LightMeasurementResource, operation: string, patch: Record<string, unknown>) {
  if (!['add', 'update', 'remove'].includes(operation)) throw new Error('Unsupported reading/checkpoint command.');
  validateFieldNames(patch, operation === 'remove' ? [] : Object.keys(resource === 'lightMeasurements' ? lightMeasurementFields : lightAuditFields));
  if (operation === 'remove') return;
  if (!Object.keys(patch).length) throw new Error('Supply at least one reported field.');
  for (const field of ['label', 'notes']) if (field in patch) {
    const max = resource === 'lightAudits' ? field === 'label' ? 80 : 1000 : field === 'label' ? 120 : 2000;
    if (typeof patch[field] !== 'string' || patch[field].length > max) throw new Error(`Supply ${field} as text up to ${max} characters.`);
  }
  if (resource === 'lightAudits') {
    if ('date' in patch && (operation === 'add' || !validAgentDate(patch.date))) throw new Error('A new checkpoint captures the current environment today. Correct an existing checkpoint date explicitly.');
    return;
  }
  if (operation === 'add' && ['tool', 'value', 'unit', 'capturedAt'].some(field => !Object.hasOwn(patch, field))) throw new Error('Report the tool, reading, unit and actual time with UTC offset; do not invent missing measurement facts.');
  if (operation !== 'add' && ('tool' in patch || 'method' in patch)) throw new Error('An existing reading keeps its acquisition type. Add a new reported reading to change its method.');
  if ('tool' in patch && !LIGHT_READING_TOOLS.includes(patch.tool as typeof LIGHT_READING_TOOLS[number])) throw new Error('Choose a supported reported reading. Camera walkthroughs use their dedicated capture flow.');
  if ('value' in patch !== ('unit' in patch)) throw new Error('Supply the reported value and its unit together.');
  if ('value' in patch && !(typeof patch.value === 'number' && Number.isFinite(patch.value) || typeof patch.value === 'string' && patch.value.trim().length > 0 && patch.value.length <= 120)) throw new Error('Supply a finite reported reading or a bounded classification.');
  if ('unit' in patch && !lightMeasurementFields.unit.includes(String(patch.unit))) throw new Error('Use an explicit supported unit.');
  if ('method' in patch && !lightMeasurementFields.method.includes(String(patch.method))) throw new Error('Use a supported reported acquisition method.');
  if ('capturedAt' in patch && (typeof patch.capturedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(patch.capturedAt) || !validAgentDate(patch.capturedAt.slice(0, 10)) || !Number.isFinite(Date.parse(patch.capturedAt)))) throw new Error('Report the actual measurement time with an explicit UTC offset.');
  if ('roomId' in patch && patch.roomId !== null && (typeof patch.roomId !== 'string' || !patch.roomId)) throw new Error('Choose an exact room ID or null.');
  if ('context' in patch && patch.context !== null && !['daytime', 'evening', 'sleep'].includes(String(patch.context))) throw new Error('Choose a reported time context or null.');
}
export function parseLightMeasurementSnapshot(proposal: AgentDataProposal): LightMeasurementSnapshot {
  const row = agentDataObject(JSON.parse(proposal.baseline));
  if (row.version !== 1 || !isLightMeasurementResource(proposal.resource) || row.resource !== proposal.resource || row.id !== proposal.recordId || typeof row.revision !== 'string' || !/^[a-f0-9]{64}$/.test(row.revision) || row.record !== null && (!row.record || typeof row.record !== 'object' || Array.isArray(row.record))) throw new Error('Read this reading/checkpoint again before proposing a change.');
  return row as unknown as LightMeasurementSnapshot;
}
export function displayLightMeasurementRecord(value: unknown): Record<string, unknown> | null {
  if (value == null) return null; const row = agentDataObject(value);
  return row.version === 1 && isLightMeasurementResource(String(row.resource)) && Object.hasOwn(row, 'record') ? row.record as Record<string, unknown> | null : row;
}
export function projectLightMeasurementRecord(proposal: AgentDataProposal) {
  const snapshot = parseLightMeasurementSnapshot(proposal); validateLightMeasurementPatch(snapshot.resource, proposal.operation, parseAgentDataPatch(proposal.patch));
  if (!snapshot.plan || !Array.isArray(snapshot.plan.effects?.replacedMeasurements)) throw new Error('Prepare a fresh reading/checkpoint review.');
  return { before: snapshot.record, after: snapshot.plan.after, effects: snapshot.plan.effects };
}
