// Exact disclosure-safe Light snapshots, effect reviews and canonical commits.
import type { ProfileData } from '../types/app-state.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { parseAgentDataPatch, validAgentDate } from '../shared/agent-data-contract.js';
import { state } from './state.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { LIGHT_ENVIRONMENT_FIELDS, commitLightEnvironmentWrite, queueLightEnvironmentWrite } from './light-env-record-store.js';
import { displayLightEnvironmentRecord, isLightEnvironmentResource, lightEnvironmentRows, mutateLightEnvironment, sanitizeLightEnvironmentPatch, validateLightEnvironmentPatch } from './light-env-mutations.js';
import type { LightEnvironmentResource } from './light-env-mutations.js';

import { parseLightEnvironmentSnapshot } from './light-env-proposals.js';
import type { LightEnvironmentSnapshot, LightEnvironmentPlan } from './light-env-proposals.js';

const conflict = (): never => { throw Object.assign(new Error('This Light record, room link or measurement history changed since review. Read it again. No change was applied.'), { noChangeApplied: true }); };
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value;
async function snapshot(data: ProfileData, resource: LightEnvironmentResource, id: string): Promise<LightEnvironmentSnapshot> {
  const raw = lightEnvironmentRows(data, resource).find(row => row.id === id) || null;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(Object.fromEntries(LIGHT_ENVIRONMENT_FIELDS.map(key => [key, data[key] ?? null])))));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return { version: 1, resource, id, record: displayLightEnvironmentRecord(resource, raw), revision: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
}
function compute(data: ProfileData, proposal: AgentDataProposal): { next: ProfileData; plan: LightEnvironmentPlan } {
  if (!isLightEnvironmentResource(proposal.resource) || !['add', 'update', 'remove'].includes(proposal.operation) || !validAgentDate(proposal.effectiveDate)) throw new Error('Invalid Light command.');
  const patch = parseAgentDataPatch(proposal.patch);
  validateLightEnvironmentPatch(proposal.resource, proposal.operation, patch);
  const next = structuredClone(data), normalized = sanitizeLightEnvironmentPatch(proposal.resource, patch, next);
  // A reviewed room ID is never silently converted into an unassigned screen.
  if (patch.roomId != null && patch.roomId !== normalized.roomId) throw new Error('The selected room is no longer available. Read the room list again.');
  const result = mutateLightEnvironment(next, proposal.resource, proposal.recordId, proposal.operation as 'add' | 'update' | 'remove', normalized, proposal.recordedAt, proposal.effectiveDate);
  return { next, plan: { after: displayLightEnvironmentRecord(proposal.resource, result.after), effects: result.effects } };
}
export async function readCurrentLightEnvironmentRecord(profileId: string, resource: LightEnvironmentResource, id: string, create = false) {
  const result = await snapshot(await readAgentProfileRecords(profileId), resource, id);
  return result.record || create ? result : null;
}
export async function listCurrentLightEnvironmentRecords(profileId: string, resource: LightEnvironmentResource) {
  return lightEnvironmentRows(await readAgentProfileRecords(profileId), resource).map(row => displayLightEnvironmentRecord(resource, row)!);
}
export async function prepareReviewedLightEnvironmentRecord(profileId: string, proposal: AgentDataProposal) {
  const expected = parseLightEnvironmentSnapshot(proposal), data = await readAgentProfileRecords(profileId);
  if (!profileDataValuesEqual(expected, await snapshot(data, expected.resource, expected.id))) conflict();
  const { plan } = compute(data, proposal);
  proposal.baseline = JSON.stringify({ ...expected, plan });
}
export function commitReviewedLightEnvironmentRecord(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  return queueLightEnvironmentWrite(profileId, async () => {
    const denied = (): never => { throw Object.assign(new Error('Light context or profile access changed. No change was applied.'), { noChangeApplied: true }); };
    if (!authorized()) denied();
    const expected = parseLightEnvironmentSnapshot(proposal), data = await readAgentProfileRecords(profileId), { plan: _plan, ...read } = expected;
    if (!profileDataValuesEqual(read, await snapshot(data, expected.resource, expected.id))) conflict();
    const { next, plan } = compute(data, proposal);
    if (!profileDataValuesEqual(plan, expected.plan)) conflict();
    const observed = state.importedData;
    if (!authorized()) denied();
    if (!LIGHT_ENVIRONMENT_FIELDS.every(key => profileDataValuesEqual(observed[key] ?? null, data[key] ?? null))) conflict();
    const result = await commitLightEnvironmentWrite(profileId, observed, data, structuredClone(observed), next, authorized);
    if (!result.saved) {
      if (!authorized()) denied();
      if (result.conflict) conflict();
      throw new Error('Could not save this Light change. Try Apply again.');
    }
    return `${expected.resource === 'lightRooms' ? 'Light room' : 'Light screen'} updated (${proposal.operation}).`;
  });
}
