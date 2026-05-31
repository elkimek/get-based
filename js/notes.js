// notes.js — Standalone note editor
import { state } from './state.js';
import { escapeHTML, hasDirtyFormFields, showNotification, showConfirmDialog } from './utils.js';
import { saveImportedData } from './data.js';
import {
  appendImportedArrayItem,
  deleteImportedArrayItem,
  ensureImportedArray,
  replaceImportedArrayItem,
} from './data-merge.js';

function refreshOpenNoteEditorOnSync() {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('detail-modal');
  if (!overlay?.classList?.contains('show') || modal?.dataset?.syncRefreshKind !== 'note') return;
  if (hasDirtyFormFields(modal)) return;
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
    window.closeModal?.();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('labcharts-sync-applied', refreshOpenNoteEditorOnSync);
}

export function openNoteEditor(date, existingIdx) {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const isEditing = existingIdx !== undefined && existingIdx !== null;
  const existing = isEditing ? (state.importedData.notes || [])[existingIdx] : null;
  const defaultDate = existing ? existing.date : (date || new Date().toISOString().slice(0, 10));
  const currentText = existing ? existing.text : '';
  const title = isEditing ? 'Edit Note' : 'Add Note';
  modal.innerHTML = `<button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${title}</h3>
    <div class="modal-unit">Add context: medication changes, supplements, symptoms, lifestyle changes</div>
    <div style="margin:16px 0">
      <label style="font-size:13px;color:var(--text-secondary);display:block;margin-bottom:4px">Date</label>
      <input type="date" id="note-date-input" value="${defaultDate}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-primary);font-size:13px;font-family:inherit">
    </div>
    <textarea class="note-editor" id="note-textarea" placeholder="e.g. Started creatine supplement, switched to low-carb diet...">${escapeHTML(currentText)}</textarea>
    <div class="note-editor-actions">
      <button class="import-btn import-btn-primary" onclick="saveNote(${isEditing ? existingIdx : 'null'})">Save</button>
      <button class="import-btn import-btn-secondary" onclick="closeModal()">Cancel</button>
      ${isEditing ? `<button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red);margin-left:auto" onclick="deleteNote(${existingIdx})">Delete</button>` : ''}
    </div>`;
  modal.dataset.syncRefreshKind = 'note';
  modal.dataset.syncRefreshMode = isEditing ? 'edit' : 'add';
  modal.dataset.syncRefreshIndex = isEditing ? String(existingIdx) : '';
  modal.dataset.syncRefreshDate = defaultDate || '';
  overlay.classList.add("show");
  setTimeout(() => {
    const ta = document.getElementById('note-textarea');
    if (ta) ta.focus();
  }, 50);
}

export function saveNote(idx) {
  const dateInput = document.getElementById('note-date-input');
  const ta = document.getElementById('note-textarea');
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
  window.closeModal();
  const activeNav = document.querySelector(".nav-item.active");
  window.navigate(activeNav ? activeNav.dataset.category : "dashboard");
  showNotification('Note saved', 'success');
}

export async function deleteNote(idx) {
  if (!state.importedData.notes) return;
  if (await showConfirmDialog("Delete this note? This can't be undone.")) {
    deleteImportedArrayItem(state.importedData, 'notes', idx);
    saveImportedData();
    window.closeModal();
    const activeNav = document.querySelector(".nav-item.active");
    window.navigate(activeNav ? activeNav.dataset.category : "dashboard");
    showNotification('Note deleted', 'info');
  }
}

Object.assign(window, { openNoteEditor, saveNote, deleteNote });
