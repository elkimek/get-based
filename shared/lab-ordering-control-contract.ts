// Provider-portable ordering reviews contain exact presentation identities only.
export const validLabOrderAddress = (value: unknown): value is string => typeof value === 'string'
  && /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,2047}$/.test(value) && !value.split('.').some(part => ['constructor', 'prototype', '__proto__'].includes(part));
export interface LabOrderingMove { item: string; before?: string; after?: string }
export type LabOrderingPatch = { scopeId: string; move: LabOrderingMove } | { scopeId: string; reset: true };
export interface LabOrderingChoice { id: string; label: string }
export interface LabOrderingReview {
  scopeId: string; label: string; kind: 'sidebar' | 'categories' | 'markers'; revision: string;
  move: { item: LabOrderingChoice; anchor: LabOrderingChoice; position: 'before' | 'after' } | null;
}
export interface LabOrderingControlIdentity {
  id: string; action: 'labs.ordering'; profileId: string; threadId: string; leaseId: string;
  parameters: LabOrderingPatch; baseline: LabOrderingReview; reason: string; evidence: string;
}
export function labOrderingControlSignature(record: LabOrderingControlIdentity) {
  return JSON.stringify({ id: record.id, action: record.action, profileId: record.profileId, threadId: record.threadId, leaseId: record.leaseId,
    parameters: record.parameters, baseline: record.baseline, reason: record.reason.trim(), evidence: record.evidence.trim() },
  (_key, entry: unknown) => object(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function parseLabOrderingPatch(value: unknown): LabOrderingPatch | null {
  if (!object(value) || Object.keys(value).length !== 2 || !validLabOrderAddress(value.scopeId)) return null;
  if (value.reset === true && Object.hasOwn(value, 'reset')) return { scopeId: value.scopeId, reset: true };
  if (!object(value.move) || Object.keys(value.move).length !== 2 || !validLabOrderAddress(value.move.item)
    || Object.hasOwn(value.move, 'before') === Object.hasOwn(value.move, 'after')) return null;
  const anchor = value.move.before ?? value.move.after;
  if (!validLabOrderAddress(anchor) || anchor === value.move.item) return null;
  return { scopeId: value.scopeId, move: Object.hasOwn(value.move, 'before') ? { item: value.move.item, before: anchor } : { item: value.move.item, after: anchor } };
}
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 4000 && !/[\u0000-\u001f\u007f]/.test(value);
function choice(value: unknown): LabOrderingChoice | null {
  return object(value) && Object.keys(value).sort().join() === 'id,label' && validLabOrderAddress(value.id) && text(value.label) ? { id: value.id, label: value.label } : null;
}
export function parseLabOrderingReview(value: unknown, patch: LabOrderingPatch): LabOrderingReview | null {
  if (!object(value) || Object.keys(value).sort().join() !== 'kind,label,move,revision,scopeId' || value.scopeId !== patch.scopeId
    || !text(value.label) || !['sidebar', 'categories', 'markers'].includes(String(value.kind)) || typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/.test(value.revision)) return null;
  const common = { scopeId: patch.scopeId, label: value.label, kind: value.kind as LabOrderingReview['kind'], revision: value.revision };
  if ('reset' in patch) return value.move === null ? { ...common, move: null } : null;
  if (!object(value.move) || Object.keys(value.move).sort().join() !== 'anchor,item,position') return null;
  const item = choice(value.move.item), anchor = choice(value.move.anchor), position = Object.hasOwn(patch.move, 'before') ? 'before' : 'after';
  if (!item || !anchor || item.id !== patch.move.item || anchor.id !== (patch.move.before ?? patch.move.after) || value.move.position !== position) return null;
  return { ...common, move: { item, anchor, position } };
}
