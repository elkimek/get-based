// Read/prepare authority is ephemeral; the model never receives a commit method or private rules.
import { parseLabOrderingPatch, parseLabOrderingReview, labOrderingControlSignature as orderingControlSignature } from '../shared/lab-ordering-control-contract.js';
import type { LabOrderingPatch, LabOrderingReview, LabOrderingControlIdentity } from '../shared/lab-ordering-control-contract.js';
import { state } from './state.js';
import { isActiveProfileDataOwner } from './profile.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { nativeLabOrderScopes, applyNativeLabOrder } from './lab-ordering-native.js';
import { nativeLabOrderSnapshot } from './lab-ordering-store.js';
import type { NativeLabOrderSnapshot } from './lab-ordering-store.js';
import { labOrderingPolicy } from './lab-ordering-policy.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { labOrderingMap, replaceLabOrder } from './lab-ordering-core.js';
export type OrderingControlInput = LabOrderingControlIdentity;
interface Lease {
  profileId: string; threadId: string; root: typeof state.importedData; history: typeof state.chatHistory;
  snapshot: NativeLabOrderSnapshot; policy: string; patch?: LabOrderingPatch; review?: LabOrderingReview;
  signature?: string; used?: boolean;
}
const leases = new Map<string, Lease>();
export function orderingConflict(message: string): never { throw Object.assign(new Error(message), { noChangeApplied: true }); }
function owner(profileId: string) {
  const root = state.importedData, threadId = state.currentThreadId || '', history = state.chatHistory;
  const current = () => !!threadId && state.currentProfile === profileId && state.importedData === root && state.currentThreadId === threadId && state.chatHistory === history && isActiveProfileDataOwner(profileId, root);
  const check = () => { if (!current()) orderingConflict('The originating profile or chat changed. Nothing was applied.'); }; check(); return { root, threadId, history, current, check };
}
export async function readLabOrderingControl(profileId: string, options: { scopeId?: string; query?: string; offset?: number; limit?: number }) {
  const scope = owner(profileId), data = await readAgentProfileRecords(profileId), query = (options.query || '').trim().toLowerCase(), offset = options.offset ?? 0, limit = options.limit ?? 10;
  const native = nativeLabOrderScopes(data); scope.check();
  if (!options.scopeId) {
    const choices = native.flatMap(row => {
      const policy = labOrderingPolicy(data, row);
      return policy.items.length >= 2 ? [{ scopeId: row.id, label: row.label, kind: row.kind }] : [];
    }).filter(row => !query || `${row.scopeId} ${row.label}`.toLowerCase().includes(query));
    scope.check(); return { result: { action: 'labs.ordering', scopes: choices.slice(offset, offset + limit), total: choices.length,
      nextOffset: offset + limit < choices.length ? offset + limit : null, notice: 'Choose an exact scopeId and read its selectable item IDs before proposing a move.' } };
  }
  const selected = native.find(row => row.id === options.scopeId); if (!selected) orderingConflict('This ordering scope is unavailable.');
  const eligibility = labOrderingPolicy(data, selected); if (eligibility.items.length < 2) orderingConflict('This ordering scope is unavailable or disabled.');
  const snapshot = await nativeLabOrderSnapshot(data, selected.id); scope.check();
  const policy = labOrderingPolicy(data, snapshot.record);
  let resetAvailable = false;
  if (policy.allVisible && snapshot.record.hasHistory) try { replaceLabOrder(labOrderingMap(data.labOrdering)[selected.id], null, crypto.randomUUID()); resetAvailable = true; } catch { /* Unsupported future metadata stays private and intact. */ }
  const leaseId = crypto.randomUUID(); if (leases.size >= 100) leases.delete(leases.keys().next().value!);
  leases.set(leaseId, { profileId, threadId: scope.threadId, root: scope.root, history: scope.history, snapshot, policy: policy.stamp });
  const items = policy.items.filter(row => !query || `${row.id} ${row.label}`.toLowerCase().includes(query));
  return { leaseId, result: { action: 'labs.ordering', scopeId: selected.id, label: selected.label, kind: selected.kind,
    items: items.slice(offset, offset + limit), total: items.length, nextOffset: offset + limit < items.length ? offset + limit : null,
    resetAvailable, approval: 'Apply required',
    basis: 'Native catalog order projected through the saved moves; chart status defaults may differ for unmodified items.',
    ...(policy.allVisible ? { hasCustomMoves: snapshot.record.hasMoves } : {}),
    notice: 'Items show permitted preferred ordering, not a guarantee of every chart’s status-sorted positions. Explicit moves apply after each view’s defaults; other items keep their relative order.' } };
}
function leaseCurrent(lease: Lease) {
  return state.currentProfile === lease.profileId && state.currentThreadId === lease.threadId && state.importedData === lease.root && state.chatHistory === lease.history && isActiveProfileDataOwner(lease.profileId, lease.root);
}
export async function previewLabOrderingControl(leaseId: string, raw: unknown) {
  const lease = leases.get(leaseId), patch = parseLabOrderingPatch(raw);
  if (!lease || !patch || !leaseCurrent(lease) || patch.scopeId !== lease.snapshot.scopeId) orderingConflict('Read this exact ordering scope again before proposing a change.');
  const data = await readAgentProfileRecords(lease.profileId), fresh = await nativeLabOrderSnapshot(data, patch.scopeId), policy = labOrderingPolicy(data, fresh.record);
  if (!leaseCurrent(lease) || fresh.revision !== lease.snapshot.revision || policy.stamp !== lease.policy) orderingConflict('This lab order or source permission changed. Read a new review.');
  const item = 'move' in patch ? policy.items.find(row => row.id === patch.move.item) : null,
    anchor = 'move' in patch ? policy.items.find(row => row.id === (patch.move.before ?? patch.move.after)) : null;
  if ('reset' in patch ? !policy.allVisible || !fresh.record.hasHistory : !item || !anchor) orderingConflict('The requested ordering change is unavailable or already at its default.');
  applyNativeLabOrder(structuredClone(data), patch.scopeId, 'move' in patch ? { move: patch.move } : { reset: true });
  const review: LabOrderingReview = { scopeId: patch.scopeId, label: fresh.record.label, kind: fresh.record.kind, revision: fresh.revision,
    move: item && anchor && 'move' in patch ? { item, anchor, position: Object.hasOwn(patch.move, 'before') ? 'before' : 'after' } : null };
  if (!parseLabOrderingReview(review, patch)) orderingConflict('Review the saved lab labels in their native editor.');
  lease.patch = patch; lease.review = review; return { patch, review };
}
export function reviewedLabOrderingLease(record: OrderingControlInput) {
  const lease = leases.get(record.leaseId);
  if (!lease || !leaseCurrent(lease) || lease.profileId !== record.profileId || lease.threadId !== record.threadId
    || lease.used || lease.signature !== orderingControlSignature(record)
    || !profileDataValuesEqual(lease.patch, record.parameters) || !profileDataValuesEqual(lease.review, record.baseline)) orderingConflict('This ordering review expired or changed. Read a fresh review.');
  return lease;
}
export function bindLabOrderingControl(record: OrderingControlInput) {
  const lease = leases.get(record.leaseId);
  if (!lease || !leaseCurrent(lease) || lease.signature || !profileDataValuesEqual(lease.patch, record.parameters) || !profileDataValuesEqual(lease.review, record.baseline)) orderingConflict('Read a fresh ordering review.');
  lease.signature = orderingControlSignature(record);
}
