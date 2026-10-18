// Drafts belong to profiles; accepted writes capture their exact data origin.
import { state } from './state.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged, invalidateActiveDataCache } from './data.js';
import { profileDataBaseline, adoptProfileData, rememberProfileData, rebaseLiveProfileData } from './profile-data-writes.js';
import { isProfileReadBlocked } from './profile-load-safety.js';
import { recordContextCardChange } from './context-cards-runtime.js';

type NotesData = typeof state.importedData;
export interface ContextNotesPresentation {
  ticket: string;
  notes: string;
  status: string;
  saved: string | null;
}
interface NotesIntent {
  revision: number;
  data: NotesData;
  base: NotesData | undefined;
  expected: string;
  commitRevision: number;
  notes: string;
}
interface NotesSession {
  profile: string;
  notes: string;
  status: string;
  expected: string;
  observed: string | null;
  revision: number;
  persistedRevision: number;
  commitRevision: number;
  committedNotes: string;
  committed: NotesData | undefined;
  intent: NotesIntent | null;
  saving: boolean;
  due: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
}
const sessions = new Map<string, NotesSession>();
const listeners = new Set<(value: ContextNotesPresentation) => void>();
let sequence = 0;
let scope: { session: NotesSession; data: NotesData; ticket: string } | null = null;
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-profile-switched', () => {
    scope = null;
    for (const [profile, session] of sessions) {
      if (session.revision === session.persistedRevision && !session.saving && session.timer === undefined) sessions.delete(profile);
    }
  });
}
function noteText(data: NotesData): string { return String(data.contextNotes || ''); }
function activeSession(): NotesSession {
  const data = state.importedData, profile = state.currentProfile;
  let session = sessions.get(profile);
  if (!session) {
    const notes = noteText(data);
    session = { profile, notes, expected: notes, observed: null, status: 'Saved as you type', revision: 0, persistedRevision: 0,
      commitRevision: 0, committedNotes: notes, committed: undefined, intent: null, saving: false, due: false, timer: undefined };
    sessions.set(profile, session);
  } else if (session.revision === session.persistedRevision && !session.saving && session.timer === undefined) {
    const notes = noteText(data);
    if (session.notes !== notes) { session.notes = notes; session.expected = notes; session.status = 'Saved as you type'; }
  }
  return session;
}
function presentation(session: NotesSession): ContextNotesPresentation {
  const data = state.importedData;
  if (scope?.session !== session || scope.data !== data) scope = { session, data, ticket: `context-notes-${++sequence}` };
  const saved = session.observed ?? noteText(profileDataBaseline(data) || data);
  const changed = session.revision !== session.persistedRevision && !isProfileReadBlocked(session.profile)
    && saved !== session.expected && saved !== session.notes;
  return { ticket: scope.ticket, notes: session.notes, status: session.status, saved: changed ? saved : null };
}
function publish(session: NotesSession): void {
  if (state.currentProfile !== session.profile || scope?.session !== session || scope.data !== state.importedData) return;
  const value = presentation(session);
  for (const listener of listeners) {
    try { listener(value); } catch { /* Removed views cannot invalidate an accepted edit. */ }
  }
}
export function contextNotesPresentation(): ContextNotesPresentation { return presentation(activeSession()); }
export function subscribeContextNotes(listener: (value: ContextNotesPresentation) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function adoptCommitted(source: NotesData, base: NotesData, committed: NotesData): void {
  const result = rebaseLiveProfileData(base, source, committed);
  adoptProfileData(source, result.data);
  rememberProfileData(source, result.baseline);
}
async function persist(session: NotesSession): Promise<void> {
  if (session.saving) { session.due = true; return; }
  const intent = session.intent;
  if (!intent) return;
  if (isProfileReadBlocked(session.profile)) {
    session.due = false;
    session.status = 'Not saved — reload profile';
    session.intent = null;
    publish(session);
    return;
  }
  session.due = false;
  session.saving = true;
  const advanced = intent.commitRevision < session.commitRevision;
  const base = advanced ? session.committed || intent.base : intent.base;
  const expected = advanced ? session.committedNotes : intent.expected;
  let saved = false;
  let conflict: string | undefined;
  try {
    // Baselines isolate notes/history from unrelated unsaved fields. Without
    // one, retain the storage API's explicit whole-profile restore semantics.
    const before = structuredClone(intent.data), draft = structuredClone(base || intent.data);
    draft.contextNotes = intent.notes;
    recordContextCardChange('contextNotes', draft);
    saved = await saveImportedDataForProfile(session.profile, draft, {
      forceProfileScope: true, expectedContextNotes: expected, onContextNotesConflict: value => { conflict = value; }, ...(base ? { baseData: base } : {}),
    });
    if (saved) {
      session.committed = profileDataBaseline(draft) || structuredClone(draft);
      session.commitRevision += 1;
      session.committedNotes = intent.notes;
      session.persistedRevision = intent.revision;
      if (session.intent && session.intent.revision > intent.revision) session.expected = intent.notes;
      session.observed = null;
      // The storage service adopts a current live object when it has a base.
      // Also advance an offscreen origin so later edits cannot reuse stale data.
      if (state.currentProfile !== session.profile || state.importedData !== intent.data || !base) {
        adoptCommitted(intent.data, base || before, session.committed);
      }
      if (!base && state.currentProfile === session.profile && state.importedData !== intent.data) {
        adoptCommitted(state.importedData, before, session.committed);
      }
      if (state.currentProfile === session.profile) notifyProfileDataContextChanged(session.profile);
    }
  } catch { /* The captured draft stays available for an explicit retry. */ }
  session.saving = false;
  if (session.revision === intent.revision) {
    session.status = saved ? 'Saved' : 'Not saved — try again';
    if (saved) session.expected = intent.notes;
    else if (conflict !== undefined) session.observed = conflict;
    session.intent = null;
    session.committed = undefined;
  }
  publish(session);
  if (session.due && session.revision !== intent.revision) void persist(session);
}
/** Retired controls cannot accept input; already accepted writes survive removal. */
export function acceptContextNotes(ticket: string, notes: string, reviewedSaved: string | null = null): boolean {
  const session = activeSession();
  if (presentation(session).ticket !== ticket || (reviewedSaved !== null && typeof reviewedSaved !== 'string')) return false;
  const data = state.importedData, base = profileDataBaseline(data);
  session.notes = notes;
  // Typing and a generic Retry never accept an unseen peer baseline. An
  // explicit replacement authorizes only the exact saved text displayed at click.
  if (reviewedSaved !== null) session.expected = reviewedSaved;
  session.revision += 1;
  session.intent = { data, base, revision: session.revision, notes, expected: session.expected, commitRevision: session.commitRevision };
  if (session.timer !== undefined) clearTimeout(session.timer);
  session.timer = undefined;
  if (isProfileReadBlocked(session.profile)) {
    session.status = 'Not saved — reload profile';
    session.intent = null;
    publish(session);
    return true;
  }
  session.status = 'Saving…';
  publish(session);
  session.timer = setTimeout(() => { session.timer = undefined; void persist(session); }, 500);
  return true;
}
/** Keeping the currently saved value discards only an idle draft, without a write. */
export function useSavedContextNotes(ticket: string): boolean {
  const session = activeSession();
  if (presentation(session).ticket !== ticket || session.saving || session.timer !== undefined || isProfileReadBlocked(session.profile)) return false;
  session.notes = session.observed ?? noteText(profileDataBaseline(state.importedData) || state.importedData);
  session.expected = session.notes;
  session.observed = null;
  state.importedData.contextNotes = session.notes;
  const baseline = profileDataBaseline(state.importedData);
  if (baseline) rememberProfileData(state.importedData, { ...baseline, contextNotes: session.notes });
  invalidateActiveDataCache();
  notifyProfileDataContextChanged(session.profile);
  session.persistedRevision = session.revision;
  session.status = 'Saved';
  session.intent = null;
  session.committed = undefined;
  publish(session);
  return true;
}
