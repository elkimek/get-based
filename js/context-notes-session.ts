// Accepted notes edits retain their originating data/profile until storage commits.
import { state } from './state.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { profileDataBaseline, adoptProfileData, rememberProfileData, rebaseLiveProfileData } from './profile-data-writes.js';
import { isProfileReadBlocked } from './profile-load-safety.js';
import { recordContextCardChange } from './context-cards-runtime.js';
type NotesData = typeof state.importedData;
export interface ContextNotesPresentation { ticket: string; notes: string; status: string }
interface NotesSession {
  profile: string; data: NotesData; notes: string; status: string;
  revision: number; persistedRevision: number; saving: boolean; due: boolean;
  timer: ReturnType<typeof setTimeout> | undefined; committed: NotesData | undefined;
}
const sessions = new WeakMap<NotesData, Map<string, NotesSession>>();
const listeners = new Set<(presentation: ContextNotesPresentation) => void>();
let sequence = 0;
let scope: { session: NotesSession; ticket: string } | null = null;
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-profile-switched', () => { scope = null; });
}
function current(session: NotesSession): boolean { return state.currentProfile === session.profile && state.importedData === session.data; }
function activeSession(): NotesSession {
  const data = state.importedData, profile = state.currentProfile;
  let profiles = sessions.get(data);
  if (!profiles) { profiles = new Map(); sessions.set(data, profiles); }
  let session = profiles.get(profile);
  if (!session) {
    session = { profile, data, notes: String(data.contextNotes || ''), status: 'Saved as you type', revision: 0, persistedRevision: 0, saving: false, due: false, timer: undefined, committed: undefined };
    profiles.set(profile, session);
  } else if (session.revision === session.persistedRevision && !session.saving && session.timer === undefined) {
    const notes = String(data.contextNotes || '');
    if (session.notes !== notes) { session.notes = notes; session.status = 'Saved as you type'; }
  }
  return session;
}
function presentation(session: NotesSession): ContextNotesPresentation {
  if (scope?.session !== session) scope = { session, ticket: `context-notes-${++sequence}` };
  return { ticket: scope.ticket, notes: session.notes, status: session.status };
}
function publish(session: NotesSession): void {
  if (!current(session)) return;
  for (const listener of listeners) { try { listener(presentation(session)); } catch { /* A removed view cannot invalidate an accepted edit. */ } }
}
export function contextNotesPresentation(): ContextNotesPresentation { return presentation(activeSession()); }
export function subscribeContextNotes(listener: (value: ContextNotesPresentation) => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
async function persist(session: NotesSession): Promise<void> {
  if (session.saving) { session.due = true; return; }
  if (isProfileReadBlocked(session.profile)) { session.due = false; session.status = 'Not saved — reload profile'; publish(session); return; }
  session.due = false; session.saving = true;
  const revision = session.revision, notes = session.notes;
  // Only the known persisted baseline supplies unrelated fields. A missing
  // baseline retains the storage API's explicit whole-profile semantics.
  const base = (current(session) ? profileDataBaseline(session.data) : undefined) || session.committed || profileDataBaseline(session.data);
  const before = structuredClone(session.data), draft = structuredClone(base || session.data);
  draft.contextNotes = notes; recordContextCardChange('contextNotes', draft);
  let saved = false;
  try { saved = await saveImportedDataForProfile(session.profile, draft, { forceProfileScope: true, ...(base ? { baseData: base } : {}) }); } catch { /* The captured draft remains retryable. */ }
  if (saved) {
    session.committed = profileDataBaseline(draft) || structuredClone(draft);
    if (!base && current(session)) {
      const result = rebaseLiveProfileData(before, session.data, session.committed);
      adoptProfileData(session.data, result.data); rememberProfileData(session.data, result.baseline);
    }
    session.persistedRevision = revision;
    if (current(session)) notifyProfileDataContextChanged(session.profile);
  }
  session.saving = false;
  if (session.revision === revision) session.status = saved ? 'Saved' : 'Not saved — try again';
  publish(session);
  // An edit whose debounce elapsed during the preceding write follows it;
  // otherwise its own remaining debounce interval still applies.
  if (session.due && session.revision !== revision) void persist(session);
}
/** Reject a stale view before accepting input; accepted writes survive view removal. */
export function acceptContextNotes(ticket: string, notes: string): boolean {
  const session = activeSession();
  if (presentation(session).ticket !== ticket) return false;
  session.notes = notes; session.revision += 1;
  if (session.timer !== undefined) clearTimeout(session.timer);
  session.timer = undefined;
  if (isProfileReadBlocked(session.profile)) { session.status = 'Not saved — reload profile'; publish(session); return true; }
  session.status = 'Saving…'; publish(session);
  session.timer = setTimeout(() => { session.timer = undefined; void persist(session); }, 500);
  return true;
}
