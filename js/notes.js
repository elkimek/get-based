// @ts-check
// notes.js — Standalone note editor
import { state } from './state.js';
import { bindDetailModalSyncRefresh, escapeAttr, escapeHTML, showNotification, showConfirmDialog } from './utils.js';
import { saveImportedData } from './data.js';
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

let _noteActionDelegatesInstalled = false;
let noteEditorSession = null;

function currentEditorIndex() {
  const session = noteEditorSession;
  if (!session || session.profile !== state.currentProfile || session.data !== state.importedData) return undefined;
  if (!session.note) return null;
  const index = (state.importedData.notes || []).indexOf(session.note);
  return index >= 0 && JSON.stringify(session.note) === session.fingerprint ? index : undefined;
}

function notifyStaleNote() {
  showNotification('Profile or notes changed. Reopen the note before editing or deleting it.', 'info');
}

const NOTE_ACTION_ATTR = 'data-note-action';
const NOTE_ACTION_SELECTOR = `[${NOTE_ACTION_ATTR}]`;

function noteActionAttrs(action, attrs = {}) {
  let html = `${NOTE_ACTION_ATTR}="${escapeAttr(action)}"`;
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    const attr = key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    html += ` data-note-${attr}="${escapeAttr(String(value))}"`;
  }
  return html;
}

function closestNoteAction(target) {
  return /** @type {HTMLElement | null} */ (
    target && typeof target.closest === 'function'
      ? target.closest(NOTE_ACTION_SELECTOR)
      : null
  );
}

function parseNoteIndex(actionEl) {
  if (!actionEl.dataset.noteIndex) return null;
  const idx = Number.parseInt(actionEl.dataset.noteIndex, 10);
  return Number.isInteger(idx) ? idx : null;
}

function handleNoteActionClick(event) {
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

export function installNoteActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || _noteActionDelegatesInstalled) return;
  _noteActionDelegatesInstalled = true;
  root.addEventListener('click', handleNoteActionClick);
}

function refreshOpenNoteEditorOnSync() {
  // Keep the draft visible for copying; save/delete validate the captured record.
  if (currentEditorIndex() === undefined) notifyStaleNote();
}

if (typeof window !== 'undefined') {
  bindDetailModalSyncRefresh('note', refreshOpenNoteEditorOnSync);
  installNoteActionDelegates();
}

/**
 * @param {string | null | undefined} [date]
 * @param {number | null | undefined} [existingIdx]
 */
export function openNoteEditor(date, existingIdx) {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  if (!modal || !overlay) return;
  const wasOpen = overlay.classList.contains('show');
  const isEditing = existingIdx !== undefined && existingIdx !== null;
  const existing = isEditing ? (state.importedData.notes || [])[existingIdx] : null;
  if (isEditing && !existing) return;
  noteEditorSession = { profile: state.currentProfile, data: state.importedData, note: existing, fingerprint: JSON.stringify(existing) };
  const defaultDate = existing ? existing.date : (date || new Date().toISOString().slice(0, 10));
  const currentText = existing ? existing.text : '';
  const title = isEditing ? 'Edit Note' : 'Add Note';
  modal.innerHTML = `<button type="button" class="modal-close" ${noteActionAttrs('close')}>&times;</button>
    <h3>${title}</h3>
    <div class="modal-unit">Add context: medication changes, supplements, symptoms, lifestyle changes</div>
    <div style="margin:16px 0">
      <label style="font-size:13px;color:var(--text-secondary);display:block;margin-bottom:4px">Date</label>
      <input type="date" id="note-date-input" value="${escapeAttr(defaultDate)}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-primary);font-size:13px;font-family:inherit">
    </div>
    <textarea class="note-editor" id="note-textarea" placeholder="e.g. Started creatine supplement, switched to low-carb diet...">${escapeHTML(currentText)}</textarea>
    <div class="note-editor-actions">
      <button type="button" class="import-btn import-btn-primary" ${noteActionAttrs('save', { index: isEditing ? existingIdx : null })}>Save</button>
      <button type="button" class="import-btn import-btn-secondary" ${noteActionAttrs('close')}>Cancel</button>
      ${isEditing ? `<button type="button" class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red);margin-left:auto" ${noteActionAttrs('delete', { index: existingIdx })}>Delete</button>` : ''}
    </div>`;
  modal.dataset.syncRefreshKind = 'note';
  modal.dataset.syncRefreshMode = isEditing ? 'edit' : 'add';
  modal.dataset.syncRefreshIndex = isEditing ? String(existingIdx) : '';
  modal.dataset.syncRefreshDate = defaultDate || '';
  if (!wasOpen) rememberNoteModalTriggerRuntime();
  openModalOverlay(overlay, { initialFocus: '#note-textarea', focusDelay: 50 });
}

/** @param {number | null | undefined} idx */
export function saveNote(idx) {
  idx = currentEditorIndex();
  if (idx === undefined) { notifyStaleNote(); return; }
  const dateInput = /** @type {HTMLInputElement | null} */ (document.getElementById('note-date-input'));
  const ta = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('note-textarea'));
  const date = dateInput ? dateInput.value : '';
  const text = ta ? ta.value.trim() : '';
  if (!date) { showNotification('Please select a date', 'error'); return; }
  if (!text) { showNotification('Please enter note text', 'error'); return; }
  ensureImportedArray(state.importedData, 'notes');
  const nextNote = { date, text };
  if (idx !== null && idx !== undefined) {
    replaceImportedArrayItem(state.importedData, 'notes', idx, nextNote);
  } else {
    appendImportedArrayItem(state.importedData, 'notes', nextNote);
  }
  saveImportedData();
  closeNoteModalRuntime();
  const activeNav = /** @type {HTMLElement | null} */ (document.querySelector(".nav-item.active"));
  navigateAfterNoteChangeRuntime(activeNav?.dataset.category ?? "dashboard");
  showNotification('Note saved', 'success');
}

/** @param {number} idx */
export async function deleteNote(idx) {
  const data = state.importedData;
  const profile = state.currentProfile;
  const note = data.notes?.[idx];
  if (!note) return;
  const fingerprint = JSON.stringify(note);
  if (await showConfirmDialog("Delete this note? This can't be undone.")) {
    const currentIndex = (data.notes || []).indexOf(note);
    if (state.currentProfile !== profile || state.importedData !== data || currentIndex < 0 || JSON.stringify(note) !== fingerprint) { notifyStaleNote(); return; }
    deleteImportedArrayItem(data, 'notes', currentIndex);
    saveImportedData();
    closeNoteModalRuntime();
    const activeNav = /** @type {HTMLElement | null} */ (document.querySelector(".nav-item.active"));
    navigateAfterNoteChangeRuntime(activeNav?.dataset.category ?? "dashboard");
    showNotification('Note deleted', 'info');
  }
}

configureDashboardNoteActions({ openNoteEditor, deleteNote });
