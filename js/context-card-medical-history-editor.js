// context-card-medical-history-editor.js - Medical History context card editor

import { state } from './state.js';
import { COMMON_CONDITIONS } from './constants.js';
import { escapeHTML } from './utils.js';
import { saveImportedData } from './data.js';
import {
  renderContextEditorModal,
  getSelectedOption,
  renderNoteField,
} from './context-card-editor-ui.js';

let recordContextChange = () => {};
let saveContextAndRefresh = () => {};
let editingConditionIndex = -1;
let editingFamilyHistoryIndex = -1;

export function configureMedicalHistoryEditor({ recordChange, saveAndRefresh } = {}) {
  if (typeof recordChange === 'function') recordContextChange = recordChange;
  if (typeof saveAndRefresh === 'function') saveContextAndRefresh = saveAndRefresh;
}

export function openDiagnosesEditor() {
  editingConditionIndex = -1;
  editingFamilyHistoryIndex = -1;
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.diagnoses || { conditions: [], note: '' };
  renderDiagnosesModal(modal, current);
  overlay.classList.add("show");
}

// Relatives surfaced in the Family History subsection. First-degree
// (mother/father/sibling/child) plus grandparents covers the bulk of
// clinically-relevant heritable risk without sprawling into the
// "aunt/uncle/cousin" tail where signal-to-noise drops fast.
const FAMILY_RELATIVES = [
  { key: 'mother',                 label: 'Mother' },
  { key: 'father',                 label: 'Father' },
  { key: 'sibling',                label: 'Sibling' },
  { key: 'child',                  label: 'Child' },
  { key: 'maternal_grandmother',   label: 'Maternal grandmother' },
  { key: 'maternal_grandfather',   label: 'Maternal grandfather' },
  { key: 'paternal_grandmother',   label: 'Paternal grandmother' },
  { key: 'paternal_grandfather',   label: 'Paternal grandfather' },
];

function _relativeLabel(key) {
  return FAMILY_RELATIVES.find(r => r.key === key)?.label || key;
}

function _selectedAttr(value, target) {
  return value === target ? ' selected' : '';
}

function _activeClass(value, target) {
  return value === target ? ' active' : '';
}

function _getDiagnoses() {
  if (!state.importedData.diagnoses) state.importedData.diagnoses = { conditions: [], note: '', familyHistory: [] };
  if (!Array.isArray(state.importedData.diagnoses.conditions)) state.importedData.diagnoses.conditions = [];
  if (!Array.isArray(state.importedData.diagnoses.familyHistory)) state.importedData.diagnoses.familyHistory = [];
  return state.importedData.diagnoses;
}

export function renderDiagnosesModal(modal, current) {
  const conditions = Array.isArray(current.conditions) ? current.conditions : [];
  const familyHistory = Array.isArray(current.familyHistory) ? current.familyHistory : [];
  if (!conditions[editingConditionIndex]) editingConditionIndex = -1;
  if (!familyHistory[editingFamilyHistoryIndex]) editingFamilyHistoryIndex = -1;
  const editingCondition = editingConditionIndex >= 0 ? conditions[editingConditionIndex] : null;
  const editingFamily = editingFamilyHistoryIndex >= 0 ? familyHistory[editingFamilyHistoryIndex] : null;
  const conditionSeverity = editingCondition ? (editingCondition.severity || 'mild') : 'major';
  let html = '';
  if (conditions.length > 0) {
    html += `<div class="ctx-conditions-list" id="ctx-conditions-list">`;
    for (let i = 0; i < conditions.length; i++) {
      const c = conditions[i];
      html += `<div class="ctx-condition-item${i === editingConditionIndex ? ' is-editing' : ''}">
        <span class="ctx-condition-name" title="${escapeHTML(c.name)}">${escapeHTML(c.name)}</span>
        ${c.severity ? `<span class="goals-severity-badge severity-${c.severity}">${c.severity}</span>` : ''}
        ${c.since ? `<span class="ctx-condition-since">since ${escapeHTML(c.since)}</span>` : ''}
        <span class="ctx-condition-actions">
          <button class="ctx-row-action-btn ctx-row-edit-btn" onclick="editCondition(${i})" aria-label="Edit condition" title="Edit condition">✎</button>
          <button class="ctx-row-action-btn goals-delete-btn" onclick="deleteCondition(${i})" aria-label="Remove condition" title="Remove condition">&times;</button>
        </span>
      </div>`;
    }
    html += `</div>`;
  }
  html += `<div class="ctx-field-group"><label class="ctx-field-label">Add condition</label>
    <div class="ctx-add-condition">
      <div class="ctx-autocomplete-wrapper">
        <input type="text" class="ctx-note-input" id="condition-input" value="${escapeHTML(editingCondition?.name || '')}" placeholder="Type condition name..." oninput="filterConditionSuggestions()" onfocus="filterConditionSuggestions()">
        <div class="ctx-suggestions" id="condition-suggestions"></div>
      </div>
      <input type="text" class="ctx-note-input" id="condition-since" value="${escapeHTML(editingCondition?.since || '')}" placeholder="Since (e.g. 2020)" style="width:100px">
      <button class="import-btn import-btn-primary" onclick="addCondition()">${editingCondition ? 'Update' : 'Add'}</button>
      ${editingCondition ? '<button class="import-btn import-btn-secondary ctx-edit-cancel-btn" onclick="cancelConditionEdit()">Cancel edit</button>' : ''}
    </div>
    <div class="ctx-btn-group" id="condition-severity" style="margin-top:8px">
      <button type="button" class="ctx-btn-option${_activeClass(conditionSeverity, 'major')}" onclick="selectCtxOption(this,'condition-severity')">major</button>
      <button type="button" class="ctx-btn-option${_activeClass(conditionSeverity, 'mild')}" onclick="selectCtxOption(this,'condition-severity')">mild</button>
      <button type="button" class="ctx-btn-option${_activeClass(conditionSeverity, 'minor')}" onclick="selectCtxOption(this,'condition-severity')">minor</button>
    </div>
  </div>`;

  const RELATIVE_EMOJI = {
    mother: '👩', father: '👨', sibling: '👫', child: '🧒',
    maternal_grandmother: '👵', maternal_grandfather: '👴',
    paternal_grandmother: '👵', paternal_grandfather: '👴',
  };

  html += `<div class="ctx-family-history" id="ctx-family-section">
    <div class="ctx-family-head">
      <label class="ctx-field-label">Family history</label>
      <span class="ctx-family-count">${familyHistory.length || ''}</span>
    </div>
    <div class="ctx-modal-hint">Genetic + environmental signal. Affects risk interpretation — e.g. a father's MI at 52 reframes a borderline LDL.</div>`;
  if (familyHistory.length > 0) {
    const relOrder = new Map(FAMILY_RELATIVES.map((r, i) => [r.key, i]));
    const indexed = familyHistory.map((e, i) => ({ e, i }));
    indexed.sort((a, b) => (relOrder.get(a.e.relative) ?? 99) - (relOrder.get(b.e.relative) ?? 99));
    html += `<div class="ctx-family-list" id="ctx-family-list">`;
    for (const { e, i } of indexed) {
      const emoji = RELATIVE_EMOJI[e.relative] || '👤';
      html += `<div class="ctx-family-item${i === editingFamilyHistoryIndex ? ' is-editing' : ''}">
        <div class="ctx-family-main">
          <span class="ctx-family-relative" title="${escapeHTML(_relativeLabel(e.relative))}">${emoji} <span class="ctx-family-relative-label">${escapeHTML(_relativeLabel(e.relative))}</span></span>
          <span class="ctx-family-condition" title="${escapeHTML(e.condition || '')}">${escapeHTML(e.condition || '')}</span>
          ${e.onsetAge != null && e.onsetAge !== '' ? `<span class="ctx-family-age">age ${escapeHTML(String(e.onsetAge))}</span>` : ''}
          ${e.note ? `<span class="ctx-family-note" title="${escapeHTML(e.note)}">${escapeHTML(e.note)}</span>` : ''}
        </div>
        <span class="ctx-family-actions">
          <button class="ctx-row-action-btn ctx-row-edit-btn" onclick="editFamilyHistoryEntry(${i})" aria-label="Edit family history entry" title="Edit entry">✎</button>
          <button class="ctx-row-action-btn goals-delete-btn" onclick="deleteFamilyHistoryEntry(${i})" aria-label="Remove entry" title="Remove entry">&times;</button>
        </span>
      </div>`;
    }
    html += `</div>`;
  }
  html += `<div class="ctx-family-add">
    <div class="ctx-family-add-row">
      <select class="ctx-note-input ctx-family-select" id="fh-relative" aria-label="Relative">
        <optgroup label="Parents">
          <option value="mother"${_selectedAttr(editingFamily?.relative, 'mother')}>Mother</option>
          <option value="father"${_selectedAttr(editingFamily?.relative, 'father')}>Father</option>
        </optgroup>
        <optgroup label="Siblings & Children">
          <option value="sibling"${_selectedAttr(editingFamily?.relative, 'sibling')}>Sibling</option>
          <option value="child"${_selectedAttr(editingFamily?.relative, 'child')}>Child</option>
        </optgroup>
        <optgroup label="Maternal grandparents">
          <option value="maternal_grandmother"${_selectedAttr(editingFamily?.relative, 'maternal_grandmother')}>Maternal grandmother</option>
          <option value="maternal_grandfather"${_selectedAttr(editingFamily?.relative, 'maternal_grandfather')}>Maternal grandfather</option>
        </optgroup>
        <optgroup label="Paternal grandparents">
          <option value="paternal_grandmother"${_selectedAttr(editingFamily?.relative, 'paternal_grandmother')}>Paternal grandmother</option>
          <option value="paternal_grandfather"${_selectedAttr(editingFamily?.relative, 'paternal_grandfather')}>Paternal grandfather</option>
        </optgroup>
      </select>
      <div class="ctx-autocomplete-wrapper ctx-family-condition-wrap">
        <input type="text" class="ctx-note-input" id="fh-condition" value="${escapeHTML(editingFamily?.condition || '')}" placeholder="Condition (e.g. heart attack, Alzheimer's, breast cancer)" oninput="filterFamilyConditionSuggestions()" onfocus="filterFamilyConditionSuggestions()" aria-label="Condition">
        <div class="ctx-suggestions" id="fh-condition-suggestions"></div>
      </div>
    </div>
    <div class="ctx-family-add-row">
      <input type="number" min="0" max="120" class="ctx-note-input ctx-family-age-input" id="fh-age" value="${editingFamily?.onsetAge != null ? escapeHTML(String(editingFamily.onsetAge)) : ''}" placeholder="Age at onset" aria-label="Age at onset">
      <input type="text" class="ctx-note-input ctx-family-note-input" id="fh-note" value="${escapeHTML(editingFamily?.note || '')}" placeholder="Note — outcome, treatment, etc. (optional)" aria-label="Note">
      <button class="import-btn import-btn-primary" onclick="addFamilyHistoryEntry()">${editingFamily ? 'Update' : '+ Add'}</button>
      ${editingFamily ? '<button class="import-btn import-btn-secondary ctx-edit-cancel-btn" onclick="cancelFamilyHistoryEdit()">Cancel edit</button>' : ''}
    </div>
  </div></div>`;
  html += renderNoteField(current.note);
  const hasCurrent = conditions.length > 0 || familyHistory.length > 0 || current.note;
  html += `<div class="ctx-editor-actions">
    <button class="import-btn import-btn-primary" onclick="saveDiagnoses()">Save</button>
    <button class="import-btn import-btn-secondary" onclick="closeDiagnoses()">Cancel</button>
    ${hasCurrent ? '<button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red);margin-left:auto" onclick="clearDiagnoses()">Clear</button>' : ''}
  </div>`;
  renderContextEditorModal(modal, 'Medical History', 'Your diagnoses and family history. The AI considers both when interpreting your labs.', html, 'closeDiagnoses');
  setTimeout(() => {
    const input = document.getElementById('condition-input');
    if (input) {
      input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addCondition(); } };
    }
    const fhCond = document.getElementById('fh-condition');
    if (fhCond) {
      fhCond.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addFamilyHistoryEntry(); } };
    }
    document.removeEventListener('click', closeSuggestionsOnClickOutside);
    document.addEventListener('click', closeSuggestionsOnClickOutside);
  }, 50);
}

export function filterConditionSuggestions() {
  const input = document.getElementById('condition-input');
  const container = document.getElementById('condition-suggestions');
  if (!input || !container) return;
  const val = input.value.toLowerCase().trim();
  const existing = (state.importedData.diagnoses && state.importedData.diagnoses.conditions || []).map(c => c.name.toLowerCase());
  const sexFiltered = COMMON_CONDITIONS.filter(c => {
    if (state.profileSex === 'male' && (c === 'PCOS' || c === 'Endometriosis')) return false;
    return true;
  });
  const matches = val ? sexFiltered.filter(c => c.toLowerCase().includes(val) && !existing.includes(c.toLowerCase())) : sexFiltered.filter(c => !existing.includes(c.toLowerCase()));
  if (matches.length === 0 || !val) { container.innerHTML = ''; return; }
  // JSON.stringify + escapeHTML so conditions with apostrophes (Alzheimer's,
  // Hashimoto's, Crohn's, etc.) survive both the JS-string-in-HTML-attribute
  // round-trip. escapeHTML alone would convert `'` -> `&#39;` which the HTML
  // parser then decodes before JS sees it, breaking the JS string literal.
  container.innerHTML = matches.slice(0, 8).map(m => `<div class="ctx-suggestion-item" onmousedown="selectConditionSuggestion(${escapeHTML(JSON.stringify(m))})">${escapeHTML(m)}</div>`).join('');
}

export function selectConditionSuggestion(name) {
  const input = document.getElementById('condition-input');
  if (input) input.value = name;
  const container = document.getElementById('condition-suggestions');
  if (container) container.innerHTML = '';
}

export function closeSuggestionsOnClickOutside(e) {
  const container = document.getElementById('condition-suggestions');
  const input = document.getElementById('condition-input');
  if (container && input && !input.contains(e.target) && !container.contains(e.target)) {
    container.innerHTML = '';
  }
  const fhContainer = document.getElementById('fh-condition-suggestions');
  const fhInput = document.getElementById('fh-condition');
  if (fhContainer && fhInput && !fhInput.contains(e.target) && !fhContainer.contains(e.target)) {
    fhContainer.innerHTML = '';
  }
}

export function syncDiagnosesNote() {
  const noteEl = document.getElementById('ctx-note-input');
  if (noteEl && state.importedData.diagnoses) state.importedData.diagnoses.note = noteEl.value.trim();
}

export function addCondition() {
  const input = document.getElementById('condition-input');
  const severity = getSelectedOption('condition-severity') || 'mild';
  const since = document.getElementById('condition-since');
  const name = input ? input.value.trim() : '';
  if (!name) return;
  syncDiagnosesNote();
  const diagnoses = _getDiagnoses();
  const cond = { name, severity };
  if (since && since.value.trim()) cond.since = since.value.trim();
  if (editingConditionIndex >= 0 && editingConditionIndex < diagnoses.conditions.length) {
    diagnoses.conditions[editingConditionIndex] = cond;
  } else {
    diagnoses.conditions.push(cond);
  }
  editingConditionIndex = -1;
  recordContextChange('diagnoses');
  saveImportedData();
  renderDiagnosesModal(document.getElementById("detail-modal"), diagnoses);
}

export function editCondition(idx) {
  const diagnoses = _getDiagnoses();
  if (!diagnoses.conditions[idx]) return;
  syncDiagnosesNote();
  editingConditionIndex = idx;
  editingFamilyHistoryIndex = -1;
  renderDiagnosesModal(document.getElementById("detail-modal"), diagnoses);
  setTimeout(() => document.getElementById('condition-input')?.focus(), 0);
}

export function cancelConditionEdit() {
  editingConditionIndex = -1;
  renderDiagnosesModal(document.getElementById("detail-modal"), _getDiagnoses());
}

export function deleteCondition(idx) {
  if (!state.importedData.diagnoses || !state.importedData.diagnoses.conditions) return;
  syncDiagnosesNote();
  state.importedData.diagnoses.conditions.splice(idx, 1);
  editingConditionIndex = -1;
  recordContextChange('diagnoses');
  saveImportedData();
  renderDiagnosesModal(document.getElementById("detail-modal"), state.importedData.diagnoses);
}

export function addFamilyHistoryEntry() {
  const relativeEl = document.getElementById('fh-relative');
  const conditionEl = document.getElementById('fh-condition');
  const ageEl = document.getElementById('fh-age');
  const noteEl = document.getElementById('fh-note');
  const relative = relativeEl?.value || '';
  const condition = (conditionEl?.value || '').trim();
  if (!relative || !condition) return;
  if (!FAMILY_RELATIVES.some(r => r.key === relative)) return;
  const ageRaw = (ageEl?.value || '').trim();
  const onsetAge = ageRaw === '' ? null : Math.max(0, Math.min(120, parseInt(ageRaw, 10)));
  const note = (noteEl?.value || '').trim();
  syncDiagnosesNote();
  const diagnoses = _getDiagnoses();
  const entry = { relative, condition };
  if (Number.isFinite(onsetAge)) entry.onsetAge = onsetAge;
  if (note) entry.note = note;
  if (editingFamilyHistoryIndex >= 0 && editingFamilyHistoryIndex < diagnoses.familyHistory.length) {
    diagnoses.familyHistory[editingFamilyHistoryIndex] = entry;
  } else {
    diagnoses.familyHistory.push(entry);
  }
  editingFamilyHistoryIndex = -1;
  recordContextChange('diagnoses');
  saveImportedData();
  renderDiagnosesModal(document.getElementById("detail-modal"), diagnoses);
}

export function editFamilyHistoryEntry(idx) {
  const diagnoses = _getDiagnoses();
  if (!diagnoses.familyHistory[idx]) return;
  syncDiagnosesNote();
  editingFamilyHistoryIndex = idx;
  editingConditionIndex = -1;
  renderDiagnosesModal(document.getElementById("detail-modal"), diagnoses);
  setTimeout(() => document.getElementById('fh-condition')?.focus(), 0);
}

export function cancelFamilyHistoryEdit() {
  editingFamilyHistoryIndex = -1;
  renderDiagnosesModal(document.getElementById("detail-modal"), _getDiagnoses());
}

export function deleteFamilyHistoryEntry(idx) {
  if (!state.importedData.diagnoses || !Array.isArray(state.importedData.diagnoses.familyHistory)) return;
  syncDiagnosesNote();
  state.importedData.diagnoses.familyHistory.splice(idx, 1);
  editingFamilyHistoryIndex = -1;
  recordContextChange('diagnoses');
  saveImportedData();
  renderDiagnosesModal(document.getElementById("detail-modal"), state.importedData.diagnoses);
}

export function filterFamilyConditionSuggestions() {
  const input = document.getElementById('fh-condition');
  const container = document.getElementById('fh-condition-suggestions');
  if (!input || !container) return;
  const val = input.value.toLowerCase().trim();
  const matches = val ? COMMON_CONDITIONS.filter(c => c.toLowerCase().includes(val)) : COMMON_CONDITIONS;
  if (matches.length === 0 || !val) { container.innerHTML = ''; return; }
  container.innerHTML = matches.slice(0, 8).map(m => `<div class="ctx-suggestion-item" onmousedown="selectFamilyConditionSuggestion(${escapeHTML(JSON.stringify(m))})">${escapeHTML(m)}</div>`).join('');
}

export function selectFamilyConditionSuggestion(name) {
  const input = document.getElementById('fh-condition');
  if (input) input.value = name;
  const container = document.getElementById('fh-condition-suggestions');
  if (container) container.innerHTML = '';
}

export function saveDiagnoses() {
  const note = (document.getElementById('ctx-note-input') || {}).value || '';
  const diagnoses = _getDiagnoses();
  diagnoses.note = note.trim();
  const condLen = diagnoses.conditions.length;
  const fhLen = diagnoses.familyHistory.length;
  if (condLen === 0 && !diagnoses.note && fhLen === 0) {
    state.importedData.diagnoses = null;
  }
  editingConditionIndex = -1;
  editingFamilyHistoryIndex = -1;
  saveContextAndRefresh('Medical history saved', 'diagnoses');
}

export function closeDiagnoses() {
  editingConditionIndex = -1;
  editingFamilyHistoryIndex = -1;
  window.closeModal();
}

export function clearDiagnoses() {
  state.importedData.diagnoses = null;
  editingConditionIndex = -1;
  editingFamilyHistoryIndex = -1;
  saveContextAndRefresh('Medical history cleared', 'diagnoses');
}
