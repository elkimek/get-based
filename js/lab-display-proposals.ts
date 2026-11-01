import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { LabDisplayCommand, LabDisplayResource, LabDisplaySnapshot, LabDisplayRecord, LabCategoryDisplay, LabCategoryRecord, LabMarkerDisplayRecord } from './lab-display-core.js';
import { agentDataObject, parseAgentDataPatch, validateFieldNames } from '../shared/agent-data-contract.js';
import { isLabDisplayResource, labDisplayLabel } from './lab-display-core.js';

export const labDisplayFields = {
  markerDisplay: { name: 'Explicit display name, max 160 characters. Does not rename canonical IDs or change marker meaning.', category: 'Exact compatible category key from choices. Changes display placement only.', fields: 'For revert only: nonempty array containing name and/or category; revert only these explicitly requested fields.' },
  labCategories: { label: 'Explicit category display label, max 120 characters. Does not rename keys or change AI disclosure permissions.' },
};
function category(value: unknown): LabCategoryDisplay {
  const row = agentDataObject(value);
  if (typeof row.key !== 'string' || typeof row.label !== 'string' || typeof row.group !== 'string') throw new Error('Read a fresh category identity.');
  return { key: row.key, label: row.label, group: row.group };
}
export function parseLabDisplaySnapshot(value: unknown): LabDisplaySnapshot {
  const source = agentDataObject(value), row = agentDataObject(source.record);
  if (source.version !== 1 || typeof source.resource !== 'string' || !isLabDisplayResource(source.resource) || typeof source.revision !== 'string' || !/^[a-f0-9]{64}$/.test(source.revision)
    || !Array.isArray(source.choices) || typeof row.id !== 'string') throw new Error('Read the exact native label or placement first.');
  let record: LabDisplayRecord;
  if (source.resource === 'labCategories') {
    if (typeof row.baseLabel !== 'string' || typeof row.hasOverride !== 'boolean' || row.key !== row.id) throw new Error('Invalid category review.');
    record = { id: row.id, ...category(row), baseLabel: row.baseLabel, hasOverride: row.hasOverride };
  } else {
    if (typeof row.markerId !== 'string' || typeof row.name !== 'string' || typeof row.baseName !== 'string' || typeof row.hasNameOverride !== 'boolean' || typeof row.hasPlacementOverride !== 'boolean' || typeof row.placementReason !== 'string') throw new Error('Invalid marker display review.');
    record = { id: row.id, markerId: row.markerId, name: row.name, baseName: row.baseName, nativeCategory: category(row.nativeCategory), category: category(row.category), hasNameOverride: row.hasNameOverride, hasPlacementOverride: row.hasPlacementOverride, placementReason: row.placementReason };
  }
  return { version: 1, resource: source.resource, record, choices: source.choices.map(category), revision: source.revision };
}
export function labDisplayCommand(resource: LabDisplayResource, operation: string, patch: Record<string, unknown>): LabDisplayCommand {
  if (operation === 'revert') {
    if (resource === 'labCategories') { validateFieldNames(patch, []); return { restore: ['label'] }; }
    validateFieldNames(patch, ['fields']);
    if (!Array.isArray(patch.fields) || !patch.fields.length || patch.fields.length > 2 || new Set(patch.fields).size !== patch.fields.length || patch.fields.some(key => key !== 'name' && key !== 'category')) throw new Error('Choose the exact display fields to revert: name and/or category.');
    return { restore: patch.fields as Array<'name' | 'category'> };
  }
  if (operation !== 'update') throw new Error('Lab display metadata supports update or revert.');
  if (resource === 'labCategories') { validateFieldNames(patch, ['label']); return { label: labDisplayLabel(patch.label, 120) }; }
  validateFieldNames(patch, ['name', 'category']); if (!Object.keys(patch).length) throw new Error('Supply a name or compatible category to change.');
  const command: LabDisplayCommand = {};
  if (Object.hasOwn(patch, 'name')) command.name = labDisplayLabel(patch.name, 160);
  if (Object.hasOwn(patch, 'category')) { if (typeof patch.category !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(patch.category)) throw new Error('Choose an exact compatible category key.'); command.category = patch.category; }
  return command;
}
export function displayLabDisplay(value: unknown): LabDisplayRecord | null {
  if (value === null) return null;
  const row = agentDataObject(value);
  if (row.version === 1) return parseLabDisplaySnapshot(value).record;
  // Projected before/after values are finite records, not arbitrary native metadata.
  return parseLabDisplaySnapshot({ version: 1, resource: 'name' in row ? 'markerDisplay' : 'labCategories', record: row, choices: [], revision: '0'.repeat(64) }).record;
}
export function projectLabDisplay(proposal: AgentDataProposal) {
  const before = parseLabDisplaySnapshot(JSON.parse(proposal.baseline));
  if (before.resource !== proposal.resource || before.record.id !== proposal.recordId) throw new Error('Read this exact label or placement first.');
  const command = labDisplayCommand(before.resource, proposal.operation, parseAgentDataPatch(proposal.patch));
  if (before.resource === 'labCategories') {
    const record = before.record as LabCategoryRecord;
    return { before: record, after: { ...record, label: command.restore ? record.baseLabel : command.label!, hasOverride: !command.restore } };
  }
  const record = before.record as LabMarkerDisplayRecord, after = { ...record };
  if (Object.hasOwn(command, 'name')) { after.name = command.name!; after.hasNameOverride = true; }
  if (command.restore?.includes('name')) { after.name = record.baseName; after.hasNameOverride = false; }
  if (command.category) {
    const destination = before.choices.find(row => row.key === command.category); if (!destination) throw new Error('Choose an enabled compatible destination from the read snapshot.');
    after.category = destination; after.hasPlacementOverride = destination.key !== after.nativeCategory.key; after.placementReason = after.hasPlacementOverride ? 'placed' : 'native';
  }
  if (command.restore?.includes('category')) { if (!before.choices.some(row => row.key === record.nativeCategory.key)) throw new Error('The native category is unavailable for this review.'); after.category = record.nativeCategory; after.hasPlacementOverride = false; after.placementReason = 'native'; }
  return { before: record, after };
}
export function describeLabDisplay(value: unknown) {
  const record = displayLabDisplay(value); if (!record) return 'Unavailable';
  if ('name' in record) return [`${record.name} · ${record.category.label}`, `Canonical marker: ${record.id}`, `Saved base name: ${record.baseName}`, `Native category: ${record.nativeCategory.label}`, 'Only display metadata changes. Results, dates, units, notes and calculations retain their canonical addresses.'].join('\n');
  return [`${record.label} · ${record.key}`, `Saved base label: ${record.baseLabel}`, 'Category keys, original marker definitions and AI disclosure groups stay linked.'].join('\n');
}
