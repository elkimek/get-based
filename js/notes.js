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
  isNoteActionDelegatesBoundRuntime,
  markNoteActionDelegatesBoundRuntime,
  navigateAfterNoteChangeRuntime,
  rememberNoteModalTriggerRuntime,
} from './notes-runtime.js';

let _noteActionDelegatesInstalled = false;

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
    const idx = parseNoteIndex(actionEl);
    if (idx === null) return;
    deleteNote(idx);
  } else {
    return;
  }
  event.preventDefault();
}

export function installNoteActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || _noteActionDelegatesInstalled || isNoteActionDelegatesBoundRuntime()) return;
  _noteActionDelegatesInstalled = true;
  markNoteActionDelegatesBoundRuntime();
  root.addEventListener('click', handleNoteActionClick);
}

/** @param {{ modal: HTMLElement }} context */
function refreshOpenNoteEditorOnSync({ modal }) {
  if (modal.dataset.syncRefreshMode !== 'edit') {
    openNoteEditor(modal.dataset.syncRefreshDate || undefined);
    return;
  }
  const idx = Number.parseInt(modal.dataset.syncRefreshIndex || '', 10);
  const date = modal.dataset.syncRefreshDate || '';
  const noteAtIdx = state.importedData.notes?.[idx];
  if (Number.isInteger(idx) && noteAtIdx && (!date || noteAtIdx.date === date)) {
    openNoteEditor(null, idx);
    return;
  }
  const nextIdx = (state.importedData.notes || []).findIndex(n => n?.date === date);
  if (nextIdx >= 0) {
    openNoteEditor(null, nextIdx);
  } else {
    closeNoteModalRuntime();
  }
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
  if (!state.importedData.notes) return;
  if (await showConfirmDialog("Delete this note? This can't be undone.")) {
    deleteImportedArrayItem(state.importedData, 'notes', idx);
    saveImportedData();
    closeNoteModalRuntime();
    const activeNav = /** @type {HTMLElement | null} */ (document.querySelector(".nav-item.active"));
    navigateAfterNoteChangeRuntime(activeNav?.dataset.category ?? "dashboard");
    showNotification('Note deleted', 'info');
  }
}

configureDashboardNoteActions({ openNoteEditor, deleteNote });
