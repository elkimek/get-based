import { emfEditorIdentity, hasEMFEditorDraft } from './emf-editor-inputs.js';
import { hasPendingEMFNativeWrites } from './emf-native-records.js';
// Durable EMF snapshots and guarded commits; canonical source is hashed privately.
import type { ProfileData } from '../types/app-state.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { parseAgentDataPatch } from '../shared/agent-data-contract.js';
import { state } from './state.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { EMF_RECORD_FIELDS, commitEMFRecordWrite, queueEMFRecordWrite } from './emf-record-store.js';
import { emfRecords, isEMFResource, projectEMFRow } from './emf-record-fields.js';
import type { EMFResource } from './emf-record-fields.js';
import { mutateEMFRecord } from './emf-record-commands.js';
import { parseEMFSnapshot } from './emf-record-proposals.js';
import type { EMFSnapshot, EMFPlan } from './emf-record-proposals.js';
const conflict = (): never => { throw Object.assign(new Error('This EMF assessment, room, reading or private source changed since review. Read it again. No change was applied.'), { noChangeApplied: true }); };
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value;
async function snapshot(data: ProfileData, resource: EMFResource, id: string): Promise<EMFSnapshot> {
  const record = projectEMFRow(resource, emfRecords(data, resource).find(row => row.id === id) || null);
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(data.emfAssessment ?? null))), digest = await crypto.subtle.digest('SHA-256', bytes);
  return { version: 1, resource, id, record, revision: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
}
function compute(data: ProfileData, proposal: AgentDataProposal): { next: ProfileData; plan: EMFPlan } {
  if (!isEMFResource(proposal.resource)) throw new Error('Invalid EMF command.');
  const next = structuredClone(data), plan = mutateEMFRecord(next, proposal.resource, proposal.recordId, proposal.operation, parseAgentDataPatch(proposal.patch), proposal.recordedAt);
  return { next, plan };
}
export async function readCurrentEMFRecord(profile: string, resource: EMFResource, id: string, create = false) {
  const result = await snapshot(await readAgentProfileRecords(profile), resource, id); return result.record || create ? result : null;
}
export async function listCurrentEMFRecords(profile: string, resource: EMFResource) {
  return emfRecords(await readAgentProfileRecords(profile), resource).map(row => projectEMFRow(resource, row)!);
}
export async function prepareReviewedEMFRecord(profile: string, proposal: AgentDataProposal) {
  const expected = parseEMFSnapshot(proposal), data = await readAgentProfileRecords(profile);
  if (!profileDataValuesEqual(expected, await snapshot(data, expected.resource, expected.id))) conflict();
  proposal.baseline = JSON.stringify({ ...expected, plan: compute(data, proposal).plan });
}
export function commitReviewedEMFRecord(profile: string, proposal: AgentDataProposal, authorized: () => boolean) {
  const origin = state.importedData;
  return queueEMFRecordWrite(profile, async () => {
    const authorizedCurrent = () => authorized() && state.currentProfile === profile && state.importedData === origin;
    const current = () => authorizedCurrent() && !hasEMFEditorDraft() && !hasPendingEMFNativeWrites(profile);
    const denied = (): never => { throw Object.assign(new Error('EMF context or profile access changed. No change was applied.'), { noChangeApplied: true }); };
    if (!authorizedCurrent()) denied();
    if (hasEMFEditorDraft() || hasPendingEMFNativeWrites(profile)) throw Object.assign(new Error('Save the current EMF editor draft before applying this proposal, then read it again.'), { noChangeApplied: true });
    const expected = parseEMFSnapshot(proposal), data = await readAgentProfileRecords(profile), { plan: _plan, ...read } = expected;
    if (!profileDataValuesEqual(read, await snapshot(data, expected.resource, expected.id))) conflict();
    const { next, plan } = compute(data, proposal);
    if (!profileDataValuesEqual(plan, expected.plan)) conflict();
    if (!current()) denied();
    if (!EMF_RECORD_FIELDS.every(key => profileDataValuesEqual(origin[key] ?? null, data[key] ?? null))) conflict();
    const result = await commitEMFRecordWrite(profile, origin, data, structuredClone(origin), next, current);
    if (!result.saved) {
      if (!current()) denied(); if (result.conflict) conflict(); throw new Error('Could not save this EMF change. Try Apply again.');
    }
    try { if (state.currentProfile === profile && state.importedData === origin && emfEditorIdentity().modal) (await import('./emf-editor.js')).refreshEMFEditorAfterChange(); } catch { /* The durable write remains accepted; reopening recovers the view. */ }
    return `EMF record updated (${proposal.operation}).`;
  });
}
