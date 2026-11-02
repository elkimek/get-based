// Frozen, bounded public EMF effect review; no source data or image bytes.
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { agentDataObject, parseAgentDataPatch } from '../shared/agent-data-contract.js';
import { isEMFResource, validateEMFPatch } from './emf-record-fields.js';
import type { EMFResource, EMFRow } from './emf-record-fields.js';
import type { EMFEffects } from './emf-record-commands.js';
export interface EMFPlan { after: EMFRow | null; effects: EMFEffects; }
export interface EMFSnapshot { version: 1; resource: EMFResource; id: string; record: EMFRow | null; revision: string; plan?: EMFPlan; }
export function parseEMFSnapshot(proposal: AgentDataProposal): EMFSnapshot {
  const value = agentDataObject(JSON.parse(proposal.baseline));
  if (!isEMFResource(proposal.resource) || value.version !== 1 || value.resource !== proposal.resource || value.id !== proposal.recordId || typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/.test(value.revision)
    || value.record !== null && (!value.record || typeof value.record !== 'object' || Array.isArray(value.record))) throw new Error('Read this EMF record again.');
  return value as unknown as EMFSnapshot;
}
export function projectEMFRecord(proposal: AgentDataProposal) {
  const snapshot = parseEMFSnapshot(proposal); validateEMFPatch(snapshot.resource, proposal.operation, parseAgentDataPatch(proposal.patch));
  if (!snapshot.plan || typeof snapshot.plan.effects?.retainedHistory !== 'boolean' || typeof snapshot.plan.effects?.removedAssessment !== 'boolean') throw new Error('Prepare a fresh EMF effect review.');
  return { before: snapshot.record, after: snapshot.plan.after, effects: snapshot.plan.effects };
}
