// Pure review projection; persistence stays in the lazy record adapter.
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { agentDataObject, parseAgentDataPatch } from '../shared/agent-data-contract.js';
import { isLightEnvironmentResource, validateLightEnvironmentPatch } from './light-env-mutations.js';
import type { LightEnvironmentResource, LightEnvironmentEffects } from './light-env-mutations.js';

export interface LightEnvironmentPlan { after: Record<string, unknown> | null; effects: LightEnvironmentEffects; }
export interface LightEnvironmentSnapshot { version: 1; resource: LightEnvironmentResource; id: string; record: Record<string, unknown> | null; revision: string; plan?: LightEnvironmentPlan; }
export function parseLightEnvironmentSnapshot(proposal: AgentDataProposal): LightEnvironmentSnapshot {
  const value = agentDataObject(JSON.parse(proposal.baseline));
  if (!isLightEnvironmentResource(proposal.resource) || value.version !== 1 || value.resource !== proposal.resource || value.id !== proposal.recordId || typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/.test(value.revision)
    || value.record !== null && (!value.record || typeof value.record !== 'object' || Array.isArray(value.record))) throw new Error('Read this Light record again before proposing a change.');
  return value as unknown as LightEnvironmentSnapshot;
}
export function projectLightEnvironmentRecord(proposal: AgentDataProposal) {
  const snapshot = parseLightEnvironmentSnapshot(proposal), patch = parseAgentDataPatch(proposal.patch);
  if (!['add', 'update', 'remove'].includes(proposal.operation)) throw new Error('Unsupported Light operation.');
  validateLightEnvironmentPatch(snapshot.resource, proposal.operation, patch);
  if (!snapshot.plan || !Array.isArray(snapshot.plan.effects?.unlinkedScreens) || !Number.isInteger(snapshot.plan.effects.preservedMeasurementCount)) throw new Error('Prepare a fresh Light effect review.');
  return { before: snapshot.record, after: snapshot.plan.after, effects: snapshot.plan.effects };
}
