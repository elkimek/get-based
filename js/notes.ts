// notes.js — Standalone note editor
import { state } from './state.js';
import { bindDetailModalSyncRefresh, showNotification, showConfirmDialog } from './utils.js';
import { projectNoteEditorView } from './notes-presentation.js';
import { renderNoteEditor } from './notes-rendering.js';
import { saveImportedDataForProfile } from './data.js';
import {
  appendImportedArrayItem,
  deleteImportedArrayItem,
  ensureImportedArray,
  replaceImportedArrayItem,
} from './data-merge.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { configureDashboardNoteActions } from './dashboard-widget-runtime.js';
import {
  closeNoteModalRuntime,
  navigateAfterNoteChangeRuntime,
  rememberNoteModalTriggerRuntime,
} from './notes-runtime.js';

import type { NormalizedProfileData } from '../types/app-state.js';
interface NoteSession { profile: typeof state.currentProfile; data: NormalizedProfileData; note: unknown; fingerprint: string | undefined }
interface NoteReader { date?: unknown; text?: unknown }
interface NoteTarget { closest(selector: string): HTMLElement | null }

let _noteActionDelegatesInstalled = false;
let noteEditorSession: NoteSession | null = null;
const pendingNoteWrites = new WeakSet<object>();

/**
 * Persist an isolated mutation. The data layer merges it against the latest
 * stored revision and adopts it only after commit; failures leave live notes
 * and deletion tombstones untouched.
 * @param {string} profile
 * @param {import('../types/app-state.js').NormalizedProfileData} data
 * @param {(draft: import('../types/app-state.js').NormalizedProfileData) => void} mutate
 */
async function persistNoteMutation(profile: string, data: NormalizedProfileData, mutate: (draft: NormalizedProfileData) => void) {
  if (pendingNoteWrites.has(data)) return false;
  pendingNoteWrites.add(data);
  try {
    const baseData = structuredClone(data);
    const draft = structuredClone(baseData);
    mutate(draft);
    return await saveImportedDataForProfile(profile, draft, { baseData });
  } finally { pendingNoteWrites.delete(data); }
}

function currentEditorIndex() {
  const session = noteEditorSession;
  if (!session || session.profile !== state.currentProfile || session.data !== state.importedData) return undefined;
  if (!session.note) return null;
  const index = ((state.importedData.notes || []) as unknown[]).indexOf(session.note);
  return index >= 0 && JSON.stringify(session.note) === session.fingerprint ? index : undefined;
}

function notifyStaleNote() {
  showNotification('Profile or notes changed. Reopen the note before editing or deleting it.', 'info');
}

const NOTE_ACTION_ATTR = 'data-note-action';
const NOTE_ACTION_SELECTOR = `[${NOTE_ACTION_ATTR}]`;

function closestNoteAction(target: unknown) {
  return /** @type {HTMLElement | null} */ (
    target && typeof (target as NoteTarget).closest === 'function'
      ? (target as NoteTarget).closest(NOTE_ACTION_SELECTOR)
      : null
  );
}

function parseNoteIndex(actionEl: HTMLElement) {
  if (!actionEl.dataset.noteIndex) return null;
  const idx = Number.parseInt(actionEl.dataset.noteIndex, 10);
  return Number.isInteger(idx) ? idx : null;
}

function handleNoteActionClick(event: Event) {
  const actionEl = closestNoteAction(event.target);
  if (!actionEl) return;
  const action = actionEl.getAttribute(NOTE_ACTION_ATTR);
  if (action === 'close') {
    closeNoteModalRuntime();
  } else if (action === 'save') {
    saveNote(parseNoteIndex(actionEl));
  } else if (action === 'delete') {
    const idx = currentEditorIndex();
    if (idx === undefined || idx === null) { notifyStaleNote(); return; }
    deleteNote(idx);
  } else {
    return;
  }
  event.preventDefault();
}

export function installNoteActionDelegates(root: unknown = typeof document !== 'undefined' ? document : null) {
  if (!root || _noteActionDelegatesInstalled) return;
  _noteActionDelegatesInstalled = true;
  (root as Pick<EventTarget, 'addEventListener'>).addEventListener('click', handleNoteActionClick);
}

function refreshOpenNoteEditorOnSync() {
  // Keep the draft visible for copying; save/delete validate the captured record.
  if (currentEditorIndex() === undefined) notifyStaleNote();
}

if (typeof window !== 'undefined') {
  bindDetailModalSyncRefresh('note', refreshOpenNoteEditorOnSync);
  installNoteActionDelegates();
}

export function openNoteEditor(date?: unknown, existingIdx?: unknown) {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  if (!modal || !overlay) return;
  const wasOpen = overlay.classList.contains('show');
  const isEditing = existingIdx !== undefined && existingIdx !== null;
  const existing = isEditing ? ((state.importedData.notes || []) as unknown[])[existingIdx as number] : null;
  if (isEditing && !existing) return;
  noteEditorSession = { profile: state.currentProfile, data: state.importedData, note: existing, fingerprint: JSON.stringify(existing) };
  const defaultDate = existing ? (existing as NoteReader).date : (date || new Date().toISOString().slice(0, 10));
  const currentText = existing ? (existing as NoteReader).text : '';
  modal.innerHTML = renderNoteEditor(projectNoteEditorView({
    isEditing,
    defaultDate,
    currentText,
    existingIdx,
  }));
  modal.dataset.syncRefreshKind = 'note';
  modal.dataset.syncRefreshMode = isEditing ? 'edit' : 'add';
  modal.dataset.syncRefreshIndex = isEditing ? String(existingIdx) : '';
  modal.dataset.syncRefreshDate = (defaultDate || '') as string;
  if (!wasOpen) rememberNoteModalTriggerRuntime();
  openModalOverlay(overlay, { initialFocus: '#note-textarea', focusDelay: 50 });
}

export async function saveNote(idx: number | null | undefined) {
  idx = currentEditorIndex();
  if (idx === undefined) { notifyStaleNote(); return false; }
  const dateInput = (document.getElementById('note-date-input') as HTMLInputElement | null);
  const ta = (document.getElementById('note-textarea') as HTMLTextAreaElement | null);
  const date = dateInput ? dateInput.value : '';
  const text = ta ? ta.value.trim() : '';
  if (!date) { showNotification('Please select a date', 'error'); return false; }
  if (!text) { showNotification('Please enter note text', 'error'); return false; }
  const data = state.importedData;
  const profile = state.currentProfile;
  const session = noteEditorSession;
  const saved = await persistNoteMutation(profile, data, draft => {
    ensureImportedArray(draft, 'notes');
    const nextNote = { date, text };
    if (idx !== null && idx !== undefined) replaceImportedArrayItem(draft, 'notes', idx, nextNote);
    else appendImportedArrayItem(draft, 'notes', nextNote);
  });
  if (!saved) return false;
  if (profile !== state.currentProfile || data !== state.importedData || session !== noteEditorSession || ta !== document.getElementById('note-textarea')) return true;
  closeNoteModalRuntime();
  const activeNav = (document.querySelector(".nav-item.active") as HTMLElement | null);
  navigateAfterNoteChangeRuntime(activeNav?.dataset.category ?? "dashboard");
  showNotification('Note saved', 'success');
  return true;
}

export async function deleteNote(idx: unknown) {
  const data = state.importedData;
  const profile = state.currentProfile;
  const note = (data.notes as unknown[] | null | undefined)?.[idx as number];
  if (!note) return false;
  const fingerprint = JSON.stringify(note);
  const session = noteEditorSession;
  const modalContent = document.getElementById('detail-modal')?.firstElementChild;
  if (await showConfirmDialog("Delete this note? This can't be undone.")) {
    const currentIndex = ((data.notes || []) as unknown[]).indexOf(note);
    if (state.currentProfile !== profile || state.importedData !== data || currentIndex < 0 || JSON.stringify(note) !== fingerprint) { notifyStaleNote(); return false; }
    const saved = await persistNoteMutation(profile, data, draft => { deleteImportedArrayItem(draft, 'notes', currentIndex); });
    if (!saved) return false;
    if (profile !== state.currentProfile || data !== state.importedData || session !== noteEditorSession || modalContent !== document.getElementById('detail-modal')?.firstElementChild) return true;
    closeNoteModalRuntime();
    const activeNav = (document.querySelector(".nav-item.active") as HTMLElement | null);
    navigateAfterNoteChangeRuntime(activeNav?.dataset.category ?? "dashboard");
    showNotification('Note deleted', 'info');
    return true;
  }
  return false;
}

configureDashboardNoteActions({ openNoteEditor, deleteNote });
