// Completion labels and Undo availability require private native proof, never imported chat claims.
import type { LabOrderingControlIdentity as OrderingControlInput } from '../shared/lab-ordering-control-contract.js';
import { labOrderingControlSignature as orderingControlSignature } from '../shared/lab-ordering-control-contract.js';
import type { AppControlRecord } from '../shared/agent-control-contract.js';
import { encryptedGetItem, encryptedSetItem } from './crypto.js';
import { state } from './state.js';
import { labOrderingPolicy, canDiscloseLabOrdering } from './lab-ordering-policy.js';
import { nativeLabOrderState, nativeLabOrderScope } from './lab-ordering-native.js';
import { nativeRecordRevision } from './record-revision.js';
export interface Proof { version: 1; signature: string; outcome: 'changed' | 'undoing' | 'undone'; before: unknown; operationId: string | null; afterRevision: string; policy: string }
const key = (record: OrderingControlInput) => `labcharts-${record.profileId}-app-control-${record.id}`;
function parseProof(value: unknown, record: OrderingControlInput): Proof {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('signature' in value) || value.signature !== orderingControlSignature(record)
    || !('outcome' in value) || !['changed', 'undoing', 'undone'].includes(String(value.outcome)) || !('before' in value)
    || !('operationId' in value) || value.operationId !== null && (typeof value.operationId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.operationId))
    || !('afterRevision' in value) || typeof value.afterRevision !== 'string' || !/^[a-f0-9]{64}$/.test(value.afterRevision)
    || !('policy' in value) || typeof value.policy !== 'string') throw Object.assign(new Error('No matching native ordering receipt is available. Request a fresh review.'), { noChangeApplied: true });
  return value as Proof;
}
export async function readProof(record: OrderingControlInput) {
  const raw = await encryptedGetItem(key(record), { throwOnDecryptError: true }); return parseProof(raw ? JSON.parse(raw) : null, record);
}
export async function writeProof(record: OrderingControlInput, proof: Proof) { await encryptedSetItem(key(record), JSON.stringify(proof)); }
export async function restoreLabOrderingReceipts(messages: readonly { appControls?: AppControlRecord[] }[], profileId: string, threadId: string, current: () => boolean) {
  const records = messages.flatMap(message => message.appControls || []).filter((record): record is Extract<AppControlRecord, { action: 'labs.ordering' }> => record.action === 'labs.ordering');
  for (const record of records) if (['changed', 'undone'].includes(record.status)) { record.status = 'failed'; record.undoAvailable = false; }
  if (!records.length) return;
  const root = state.importedData;
  let claims: Record<string, unknown> | null = null;
  try { const raw = await encryptedGetItem(`labcharts-${profileId}-agent-draft-claims`, { throwOnDecryptError: true }), parsed: unknown = raw ? JSON.parse(raw) : null; if (parsed && typeof parsed === 'object' && 'claims' in parsed && parsed.claims && typeof parsed.claims === 'object' && !Array.isArray(parsed.claims)) claims = parsed.claims as Record<string, unknown>; } catch { /* Withhold Undo when native attempts cannot be checked. */ }
  const snapshots = new Map<string, Promise<string>>();
  for (const record of records.slice(-200)) {
    if (!current()) return;
    if (record.profileId !== profileId || record.threadId !== threadId || !canDiscloseLabOrdering(record)) continue;
    try {
      const proof = await readProof(record); if (!current()) return;
      if (proof.outcome === 'undoing') { record.status = 'failed'; record.undoAvailable = false; continue; }
      record.status = proof.outcome; record.undoAvailable = false;
      if (proof.outcome !== 'changed' || !claims || claims[`${record.id}-undo`]) continue;
      if (!snapshots.has(record.parameters.scopeId)) snapshots.set(record.parameters.scopeId, nativeRecordRevision(nativeLabOrderState(root, record.parameters.scopeId)));
      const snapshot = await snapshots.get(record.parameters.scopeId)!;
      if (current() && state.importedData === root && proof.afterRevision === snapshot && proof.policy === labOrderingPolicy(root, nativeLabOrderScope(root, record.parameters.scopeId)).stamp) record.undoAvailable = true;
    } catch { /* Imported or damaged histories cannot fabricate completion evidence. */ }
  }
}
