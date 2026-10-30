// A reviewed transition never exposes another profile's health data or copies a chat.
import type { ProfileSelection } from '../shared/agent-control-contract.js';
import { parseProfileSelectionPatch } from '../shared/agent-control-contract.js';
import { getProfileSelectionOwner } from './profile-selection-runtime.js';
import type { ProfileSelectionOwner } from './profile-selection-runtime.js';
import type { StoredProfileRecord } from './profile-list-store.js';
import { state } from './state.js';
import { profileDataBaseline, profileDataValuesEqual } from './profile-data-writes.js';
import { isProfileReadBlocked } from './profile-load-safety.js';
import { isChatRuntimeStreaming } from './chat-runtime.js';
import { hasChatAttachmentWork } from './chat-images.js';
import { runNativeCommandWithLocks } from './native-command-locks.js';
export class ProfileSelectionConflict extends Error { readonly noChangeApplied = true; }
function reject(message: string): never { throw new ProfileSelectionConflict(message); }
const project = (row: StoredProfileRecord): ProfileSelection => ({ id: row.id, name: String(row.name || 'Unnamed profile').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) });
interface Lease { owner: ProfileSelectionOwner; profile: string; thread: string | null; root: typeof state.importedData; history: typeof state.chatHistory; before: ProfileSelection; after: ProfileSelection }
const leases = new Map<string, Lease>();
function native() { return getProfileSelectionOwner() || reject('Native profile controls are not available yet.'); }
async function directory(owner: ProfileSelectionOwner) {
  try { return await owner.readProfiles(); } catch { return reject('The profile directory could not be read safely. Open the native profile picker and try again.'); }
}
function owns(lease: Lease) {
  return getProfileSelectionOwner() === lease.owner && state.currentProfile === lease.profile && state.currentThreadId === lease.thread
    && state.importedData === lease.root && state.chatHistory === lease.history && lease.owner.ownsData(lease.profile, lease.root);
}
function current(lease: Lease | undefined, allowed?: () => boolean): asserts lease is Lease {
  if (!lease || !owns(lease) || allowed?.() === false) reject('The profile review expired. Read the profiles again in the intended chat.');
}
export async function readProfileDirectory(options: { query?: string; offset?: number; limit?: number } = {}) {
  const owner = native(), profile = state.currentProfile, root = state.importedData;
  const rows = await directory(owner);
  if (owner !== getProfileSelectionOwner() || state.currentProfile !== profile || state.importedData !== root) reject('The active profile changed during this directory read.');
  const query = String(options.query || '').toLocaleLowerCase(), offset = Math.max(0, Math.min(100000, options.offset || 0)), limit = Math.max(1, Math.min(25, options.limit || 10));
  const matches = rows.filter(row => parseProfileSelectionPatch({ profileId: row.id })).map(project).filter(row => !query || row.name.toLocaleLowerCase().includes(query) || row.id.toLocaleLowerCase().includes(query));
  return { currentProfileId: profile, profiles: matches.slice(offset, offset + limit).map(row => ({ ...row, selected: row.id === profile })), total: matches.length, healthDataRead: false, nextOffset: offset + limit < matches.length ? offset + limit : null };
}
export async function captureProfileSelection(profileId: string, options: { userMessage?: string } = {}) {
  if (!parseProfileSelectionPatch({ profileId })) reject('Choose an exact profile ID from the directory.');
  const owner = native(), profile = state.currentProfile, root = state.importedData, thread = state.currentThreadId, history = state.chatHistory;
  const rows = await directory(owner), before = rows.find(row => row.id === profile), after = rows.find(row => row.id === profileId);
  if (!before || !after || rows.filter(row => row.id === profileId).length !== 1) reject('That exact profile is not available. Read the current directory.');
  if (profile === profileId) reject('That profile is already selected.');
  if (rows.filter(row => project(row).name.toLocaleLowerCase() === project(after).name.toLocaleLowerCase()).length > 1 && !options.userMessage?.includes(profileId)) reject('Several profiles have this name. Ask the user to choose an exact profile ID before preparing a switch.');
  const lease: Lease = { owner, profile, root, thread, history, before: project(before), after: project(after) }; current(lease);
  const leaseId = crypto.randomUUID(); if (leases.size >= 200) leases.delete(leases.keys().next().value!); leases.set(leaseId, lease);
  return { leaseId, before: project(before), proposed: project(after) };
}
export function previewProfileSelection(leaseId: string, profileId: string) {
  const lease = leases.get(leaseId); current(lease);
  if (profileId !== lease.after.id) reject('Read the exact destination profile before proposing it.');
  return { before: { ...lease.before }, proposed: { ...lease.after } };
}
function ready(lease: Lease, allowed: () => boolean) {
  current(lease, allowed);
  if (isChatRuntimeStreaming()) reject('Finish the current reply before switching profiles.');
  if (typeof document !== 'undefined' && document.querySelector('.modal-overlay.show,.confirm-overlay.show,dialog[open],[data-modal-focus-trap],[data-chat-message-editor-host] textarea')) reject('Close the current dialog or editor before switching profiles. Your input is kept.');
  const input = typeof document === 'undefined' ? null : document.getElementById('chat-input');
  if (typeof HTMLTextAreaElement !== 'undefined' && input instanceof HTMLTextAreaElement && input.value.length > 0 || hasChatAttachmentWork()) reject('Send or clear the current chat draft and attached photos before switching profiles. They have been kept.');
  const baseline = profileDataBaseline(lease.root);
  if (!baseline || !profileDataValuesEqual(lease.root, baseline) || isProfileReadBlocked(lease.profile)) reject('Save or resolve current profile edits before switching. Your data has been kept.');
}
export async function commitProfileSelection(leaseId: string, profileId: string, allowed: () => boolean) {
  const lease = leases.get(leaseId); current(lease, allowed); previewProfileSelection(leaseId, profileId); ready(lease, allowed);
  if (!navigator.locks?.request) reject('Use the native profile picker in this browser. Safe chat switching requires Web Locks.');
  return runNativeCommandWithLocks(navigator.locks, ['getbased-profile-selection'], async () => {
    ready(lease, allowed);
    let result: boolean | undefined;
    try { result = await lease.owner.switchProfile(profileId, async saved => {
      ready(lease, allowed);
      if (!lease.owner.validateSnapshot(saved)) reject('The target profile could not be read safely. Open its native profile controls; no profile was switched.');
      const rows = await directory(lease.owner); ready(lease, allowed);
      const before = rows.find(row => row.id === lease.before.id), after = rows.find(row => row.id === lease.after.id);
      if (!before || !after || !profileDataValuesEqual(project(before), lease.before)
        || !profileDataValuesEqual(project(after), lease.after)) reject('A reviewed profile changed or was removed. Read a fresh directory.');
      return true;
    }); } catch (error) {
      leases.delete(leaseId);
      if (error instanceof ProfileSelectionConflict) throw error;
      if (owns(lease)) reject('The destination could not be loaded safely. The original profile remains selected.');
      throw new Error('The profile transition could not be fully confirmed. Check the native profile picker before trying again.');
    }
    leases.delete(leaseId);
    if (result !== true || state.currentProfile !== profileId || !lease.owner.ownsData(profileId, state.importedData) || isProfileReadBlocked(profileId)) {
      if (owns(lease)) reject('The profile switch did not finish. The original profile remains selected.');
      throw new Error('The profile transition could not be fully confirmed. Check the native profile picker before trying again.');
    }
    return { before: { ...lease.before }, after: { ...lease.after }, profileId };
  });
}
