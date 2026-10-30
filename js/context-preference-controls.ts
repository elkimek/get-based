// A human turn can prepare a disclosure review, never execute it.
import { parseContextPreferencePatch, contextPreferencesEqual, contextPreferenceControlSignature } from '../shared/context-preference-contract.js';
import type { ContextPreferenceControlIdentity } from '../shared/context-preference-contract.js';
import { readContextPreferenceState, contextPreferenceRevision, contextPreferenceBaseline } from './context-preference-state.js';
import { state } from './state.js';
import { isActiveProfileDataOwner } from './profile.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
interface Lease { profileId: string; threadId: string; root: typeof state.importedData; history: typeof state.chatHistory; revision: string; values: ReturnType<typeof readContextPreferenceState>; signature?: string; used?: boolean }
const leases = new Map<string, Lease>();
export function contextPreferenceConflict(message: string): never { throw Object.assign(new Error(message), { noChangeApplied: true }); }
function current(lease: Pick<Lease, 'profileId' | 'threadId' | 'root' | 'history'>) {
  return state.currentProfile === lease.profileId && state.currentThreadId === lease.threadId && state.importedData === lease.root && state.chatHistory === lease.history && isActiveProfileDataOwner(lease.profileId, lease.root);
}
export async function readContextPreferenceControl(profileId: string, options: { query?: string; offset?: number; limit?: number }) {
  const origin = { profileId, threadId: state.currentThreadId || '', root: state.importedData, history: state.chatHistory };
  if (!origin.threadId || !current(origin)) contextPreferenceConflict('The originating profile or chat changed.');
  const data = await readAgentProfileRecords(profileId), values = readContextPreferenceState(data, profileId), revision = contextPreferenceRevision(data, profileId);
  if (!current(origin) || contextPreferenceRevision(origin.root, profileId) !== revision) contextPreferenceConflict('Save or resolve pending context-source edits before preparing this review.');
  const query = (options.query || '').trim().toLowerCase(), offset = options.offset ?? 0, limit = options.limit ?? 25;
  const groups = values.groups.filter(row => !query || `${row.id} ${row.label}`.toLowerCase().includes(query));
  const leaseId = crypto.randomUUID(); if (leases.size >= 100) leases.delete(leases.keys().next().value!);
  leases.set(leaseId, { ...origin, values: { ...values, groups: groups.slice(offset, offset + limit) }, revision });
  return { leaseId, result: { action: 'context.preferences', status: 'read_only', saved: false, reviewCreated: false,
    nextStep: 'No review card has been created. For the explicit saved disclosure request, call getbased_request_app with action context.preferences, this snapshotId, and the exact minimal parameters. Only its successful pending_user_approval result means a review exists. Do not say a card is ready after this read alone.',
    sources: values.sources, groups: groups.slice(offset, offset + limit), totalGroups: groups.length,
    nextOffset: offset + limit < groups.length ? offset + limit : null, nutritionDays: values.nutritionDays, wearableSeriesDays: values.wearableSeriesDays,
    nutritionDayOptions: [7, 30, 90], wearableSeriesDayOptions: [0, 7, 30, 90], scope: 'active profile; future automatic context and tool reads', approval: 'Explicit request and native Apply required; enabling or extending access must be reviewed.',
    notice: 'Settings metadata only. Does not reveal whether disabled data exists. These preferences do not erase messages already shared. Source toggles preserve lab-group restrictions and both lookback windows. Wearable series is the saved optional daily-series window; the ordinary recovery summary has its own native format.' } };
}
export function previewContextPreferenceControl(leaseId: string, raw: unknown) {
  const lease = leases.get(leaseId), patch = parseContextPreferencePatch(raw);
  if (!lease || !patch || !current(lease) || lease.used || contextPreferenceRevision(lease.root, lease.profileId) !== lease.revision) contextPreferenceConflict('Read fresh context.preferences before requesting this change.');
  const baseline = contextPreferenceBaseline(lease.values, patch);
  if (contextPreferencesEqual(baseline, patch)) contextPreferenceConflict('These context preferences are already set. Nothing needs to change.');
  return { parameters: patch, baseline };
}
export function bindContextPreferenceControl(record: ContextPreferenceControlIdentity) {
  const lease = leases.get(record.leaseId), preview = previewContextPreferenceControl(record.leaseId, record.parameters);
  if (!lease || lease.signature || !contextPreferencesEqual(preview.baseline, record.baseline)) contextPreferenceConflict('Read a fresh disclosure review.');
  lease.signature = contextPreferenceControlSignature(record);
}
export function reviewedContextPreferenceControl(record: ContextPreferenceControlIdentity) {
  const lease = leases.get(record.leaseId);
  if (!lease || lease.used || !current(lease) || lease.signature !== contextPreferenceControlSignature(record)
    || contextPreferenceRevision(lease.root, lease.profileId) !== lease.revision) contextPreferenceConflict('This disclosure review expired or changed. Read a fresh review.');
  return lease;
}
