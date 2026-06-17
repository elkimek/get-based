// @ts-check
// context-card-medical-history-editor.js - Medical History context card editor

import { state } from './state.js';
import { COMMON_CONDITIONS } from './constants.js';
import { escapeAttr, escapeHTML } from './utils.js';
import { saveImportedData } from './data.js';
import { openModalOverlay } from './modal-lifecycle.js';
import {
  renderContextEditorModal,
  getSelectedOption,
  renderNoteField,
  selectCtxOption,
} from './context-card-editor-ui.js';

/** @type {(field: string) => void} */
let recordContextChange = () => {};
/** @type {(msg: string, field?: string) => void} */
let saveContextAndRefresh = () => {};
let editingConditionIndex = -1;
let editingFamilyHistoryIndex = -1;
const INTERPRETATION_FLAGS = [
  ['lowMuscleMass', 'Low muscle mass / creatinine unreliable', 'Treat creatinine, creatinine eGFR, BUN/Cr, and creatinine-based biological age as context, not scored truth.'],
  ['hormoneTherapy', 'Hormone therapy / TRT / hormonal contraception', 'Flag sex-hormone markers as treatment/context-sensitive.'],
  ['postmenopause', 'Postmenopause / no active cycle', 'Do not interpret female hormones as ordinary cycling physiology.'],
  ['intenseTrainingRecent', 'Recent intense training near blood draw', 'Flag CK, AST/ALT, hs-CRP, urea, and recovery scores as training-load sensitive.'],
  ['acuteIllnessNearDraw', 'Acute illness / infection / injury near blood draw', 'Flag immune, inflammation, ferritin/iron, and recovery scores as transiently affected.'],
];

const MEDICAL_HISTORY_ROOT = '#detail-modal';

/**
 * @param {string} action
 * @param {string} [extra]
 * @returns {string}
 */
function medicalHistoryActionAttrs(action, extra = '') {
  return `data-medical-history-action="${action}"${extra ? ` ${extra}` : ''}`;
}

/**
 * @param {EventTarget | null} target
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
function closestMedicalHistoryElement(target, selector) {
  if (!(target instanceof Element)) return null;
  const el = target.closest(selector);
  if (!(el instanceof HTMLElement)) return null;
  return el.closest(MEDICAL_HISTORY_ROOT) ? el : null;
}

/**
 * @param {HTMLElement} el
 * @returns {number}
 */
function getMedicalHistoryIndex(el) {
  const idx = Number.parseInt(el.dataset.medicalHistoryIndex || '', 10);
  return Number.isInteger(idx) ? idx : -1;
}

/** @param {MouseEvent} event */
function handleMedicalHistoryClick(event) {
  const actionEl = closestMedicalHistoryElement(event.target, '[data-medical-history-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.medicalHistoryAction || '';
  const idx = getMedicalHistoryIndex(actionEl);
  switch (action) {
    case 'edit-condition':
      if (idx >= 0) editCondition(idx);
      break;
    case 'delete-condition':
      if (idx >= 0) deleteCondition(idx);
      break;
    case 'add-condition':
      addCondition();
      break;
    case 'cancel-condition-edit':
      cancelConditionEdit();
      break;
    case 'select-condition-severity':
      selectCtxOption(actionEl, 'condition-severity');
      break;
    case 'edit-family-history':
      if (idx >= 0) editFamilyHistoryEntry(idx);
      break;
    case 'delete-family-history':
      if (idx >= 0) deleteFamilyHistoryEntry(idx);
      break;
    case 'add-family-history':
      addFamilyHistoryEntry();
      break;
    case 'cancel-family-history-edit':
      cancelFamilyHistoryEdit();
      break;
    case 'save':
      saveDiagnoses();
      break;
    case 'close':
      closeDiagnoses();
      break;
    case 'clear':
      clearDiagnoses();
      break;
    default:
      break;
  }
}

/** @param {Event} event */
function handleMedicalHistoryFieldActivity(event) {
  const input = closestMedicalHistoryElement(event.target, '#condition-input, #fh-condition');
  if (!input) return;
  if (input.id === 'condition-input') {
    filterConditionSuggestions();
  } else {
    filterFamilyConditionSuggestions();
  }
}

/** @param {InputEvent} event */
function handleMedicalHistoryInput(event) {
  handleMedicalHistoryFieldActivity(event);
}

/** @param {FocusEvent} event */
function handleMedicalHistoryFocusIn(event) {
  handleMedicalHistoryFieldActivity(event);
}

/** @param {KeyboardEvent} event */
function handleMedicalHistoryKeydown(event) {
  const input = closestMedicalHistoryElement(event.target, '#condition-input, #fh-condition');
  if (!input || event.key !== 'Enter') return;
  event.preventDefault();
  if (input.id === 'condition-input') {
    addCondition();
  } else {
    addFamilyHistoryEntry();
  }
}

/** @param {MouseEvent} event */
function handleMedicalHistoryMouseDown(event) {
  const item = closestMedicalHistoryElement(event.target, '[data-medical-history-suggestion]');
  if (!item) return;
  event.preventDefault();
  const value = item.dataset.medicalHistoryValue || '';
  if (item.dataset.medicalHistorySuggestion === 'family-condition') {
    selectFamilyConditionSuggestion(value);
  } else {
    selectConditionSuggestion(value);
  }
}

let medicalHistoryDelegatesBound = false;

function initMedicalHistoryActionDelegates() {
  if (medicalHistoryDelegatesBound || typeof document === 'undefined') return;
  medicalHistoryDelegatesBound = true;
  document.addEventListener('click', handleMedicalHistoryClick);
  document.addEventListener('click', closeSuggestionsOnClickOutside);
  document.addEventListener('input', handleMedicalHistoryInput);
  document.addEventListener('focusin', handleMedicalHistoryFocusIn);
  document.addEventListener('keydown', handleMedicalHistoryKeydown);
  document.addEventListener('mousedown', handleMedicalHistoryMouseDown);
}

initMedicalHistoryActionDelegates();

/**
 * @param {{ recordChange?: (field: string) => void, saveAndRefresh?: (msg: string, field?: string) => void }} [deps]
 */
export function configureMedicalHistoryEditor({ recordChange, saveAndRefresh } = {}) {
  if (typeof recordChange === 'function') recordContextChange = recordChange;
  if (typeof saveAndRefresh === 'function') saveContextAndRefresh = saveAndRefresh;
}

/**
 * @param {string} id
 * @returns {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null}
 */
function getFormControl(id) {
  return /** @type {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null} */ (document.getElementById(id));
}

export function openDiagnosesEditor() {
  editingConditionIndex = -1;
  editingFamilyHistoryIndex = -1;
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.diagnoses || { conditions: [], note: '' };
  renderDiagnosesModal(modal, current);
  openModalOverlay(overlay);
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
  if (!state.importedData.diagnoses) state.importedData.diagnoses = { conditions: [], note: '', familyHistory: [], flags: {} };
  if (!Array.isArray(state.importedData.diagnoses.conditions)) state.importedData.diagnoses.conditions = [];
  if (!Array.isArray(state.importedData.diagnoses.familyHistory)) state.importedData.diagnoses.familyHistory = [];
  if (!state.importedData.diagnoses.flags || typeof state.importedData.diagnoses.flags !== 'object') state.importedData.diagnoses.flags = {};
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
          <button class="ctx-row-action-btn ctx-row-edit-btn" ${medicalHistoryActionAttrs('edit-condition', `data-medical-history-index="${i}"`)} aria-label="Edit condition" title="Edit condition">✎</button>
          <button class="ctx-row-action-btn goals-delete-btn" ${medicalHistoryActionAttrs('delete-condition', `data-medical-history-index="${i}"`)} aria-label="Remove condition" title="Remove condition">&times;</button>
        </span>
      </div>`;
    }
    html += `</div>`;
  }
  html += `<div class="ctx-field-group"><label class="ctx-field-label">Add condition</label>
    <div class="ctx-add-condition">
      <div class="ctx-autocomplete-wrapper">
        <input type="text" class="ctx-note-input" id="condition-input" value="${escapeHTML(editingCondition?.name || '')}" placeholder="Type condition name...">
        <div class="ctx-suggestions" id="condition-suggestions"></div>
      </div>
      <input type="text" class="ctx-note-input" id="condition-since" value="${escapeHTML(editingCondition?.since || '')}" placeholder="Since (e.g. 2020)" style="width:100px">
      <button class="import-btn import-btn-primary" ${medicalHistoryActionAttrs('add-condition')}>${editingCondition ? 'Update' : 'Add'}</button>
      ${editingCondition ? `<button class="import-btn import-btn-secondary ctx-edit-cancel-btn" ${medicalHistoryActionAttrs('cancel-condition-edit')}>Cancel edit</button>` : ''}
    </div>
    <div class="ctx-btn-group" id="condition-severity" style="margin-top:8px">
      <button type="button" class="ctx-btn-option${_activeClass(conditionSeverity, 'major')}" ${medicalHistoryActionAttrs('select-condition-severity')}>major</button>
      <button type="button" class="ctx-btn-option${_activeClass(conditionSeverity, 'mild')}" ${medicalHistoryActionAttrs('select-condition-severity')}>mild</button>
      <button type="button" class="ctx-btn-option${_activeClass(conditionSeverity, 'minor')}" ${medicalHistoryActionAttrs('select-condition-severity')}>minor</button>
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
          <button class="ctx-row-action-btn ctx-row-edit-btn" ${medicalHistoryActionAttrs('edit-family-history', `data-medical-history-index="${i}"`)} aria-label="Edit family history entry" title="Edit entry">✎</button>
          <button class="ctx-row-action-btn goals-delete-btn" ${medicalHistoryActionAttrs('delete-family-history', `data-medical-history-index="${i}"`)} aria-label="Remove entry" title="Remove entry">&times;</button>
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
        <input type="text" class="ctx-note-input" id="fh-condition" value="${escapeHTML(editingFamily?.condition || '')}" placeholder="Condition (e.g. heart attack, Alzheimer's, breast cancer)" aria-label="Condition">
        <div class="ctx-suggestions" id="fh-condition-suggestions"></div>
      </div>
    </div>
    <div class="ctx-family-add-row">
      <input type="number" min="0" max="120" class="ctx-note-input ctx-family-age-input" id="fh-age" value="${editingFamily?.onsetAge != null ? escapeHTML(String(editingFamily.onsetAge)) : ''}" placeholder="Age at onset" aria-label="Age at onset">
      <input type="text" class="ctx-note-input ctx-family-note-input" id="fh-note" value="${escapeHTML(editingFamily?.note || '')}" placeholder="Note — outcome, treatment, etc. (optional)" aria-label="Note">
      <button class="import-btn import-btn-primary" ${medicalHistoryActionAttrs('add-family-history')}>${editingFamily ? 'Update' : '+ Add'}</button>
      ${editingFamily ? `<button class="import-btn import-btn-secondary ctx-edit-cancel-btn" ${medicalHistoryActionAttrs('cancel-family-history-edit')}>Cancel edit</button>` : ''}
    </div>
  </div></div>`;
  html += `<div class="ctx-field-group"><label class="ctx-field-label">Interpretation flags</label>
    <div class="ctx-modal-hint">Structured flags make Biology Scores deterministic when context changes marker meaning.</div>
    <div class="ctx-flag-list">${INTERPRETATION_FLAGS.map(([key, label, help]) => `<label class="ctx-checkbox-row" title="${escapeAttr(help)}"><input type="checkbox" id="diagnosis-flag-${escapeAttr(key)}" ${current.flags?.[key] ? 'checked' : ''}> <span><strong>${escapeHTML(label)}</strong><small>${escapeHTML(help)}</small></span></label>`).join('')}</div>
  </div>`;
  html += renderNoteField(current.note);
  const hasFlags = INTERPRETATION_FLAGS.some(([key]) => current.flags?.[key]);
  const hasCurrent = conditions.length > 0 || familyHistory.length > 0 || current.note || hasFlags;
  html += `<div class="ctx-editor-actions">
    <button class="import-btn import-btn-primary" ${medicalHistoryActionAttrs('save')}>Save</button>
    <button class="import-btn import-btn-secondary" ${medicalHistoryActionAttrs('close')}>Cancel</button>
    ${hasCurrent ? `<button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red);margin-left:auto" ${medicalHistoryActionAttrs('clear')}>Clear</button>` : ''}
  </div>`;
  renderContextEditorModal(modal, 'Medical History', 'Your diagnoses and family history. The AI considers both when interpreting your labs.', html, 'closeDiagnoses');
}

export function filterConditionSuggestions() {
  const input = getFormControl('condition-input');
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
  container.innerHTML = matches.slice(0, 8).map(m => `<div class="ctx-suggestion-item" data-medical-history-suggestion="condition" data-medical-history-value="${escapeHTML(m)}">${escapeHTML(m)}</div>`).join('');
}

export function selectConditionSuggestion(name) {
  const input = getFormControl('condition-input');
  if (input) input.value = name;
  const container = document.getElementById('condition-suggestions');
  if (container) container.innerHTML = '';
}

/** @param {MouseEvent} e */
export function closeSuggestionsOnClickOutside(e) {
  const container = document.getElementById('condition-suggestions');
  const input = getFormControl('condition-input');
  const target = /** @type {Node | null} */ (e.target);
  if (target && container && input && !input.contains(target) && !container.contains(target)) {
    container.innerHTML = '';
  }
  const fhContainer = document.getElementById('fh-condition-suggestions');
  const fhInput = getFormControl('fh-condition');
  if (target && fhContainer && fhInput && !fhInput.contains(target) && !fhContainer.contains(target)) {
    fhContainer.innerHTML = '';
  }
}

export function syncDiagnosesNote() {
  const noteEl = getFormControl('ctx-note-input');
  if (noteEl && state.importedData.diagnoses) state.importedData.diagnoses.note = noteEl.value.trim();
}

function syncDiagnosisFlags(diagnoses = _getDiagnoses()) {
  const flags = {};
  for (const [key] of INTERPRETATION_FLAGS) {
    const el = /** @type {HTMLInputElement | null} */ (document.getElementById(`diagnosis-flag-${key}`));
    if (el?.checked) flags[key] = true;
  }
  diagnoses.flags = flags;
  return flags;
}

export function addCondition() {
  const input = getFormControl('condition-input');
  const severity = getSelectedOption('condition-severity') || 'mild';
  const since = getFormControl('condition-since');
  const name = input ? input.value.trim() : '';
  if (!name) return;
  syncDiagnosesNote();
  const diagnoses = _getDiagnoses();
  syncDiagnosisFlags(diagnoses);
  /** @type {{ name: string, severity: string, since?: string }} */
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
  const relativeEl = getFormControl('fh-relative');
  const conditionEl = getFormControl('fh-condition');
  const ageEl = getFormControl('fh-age');
  const noteEl = getFormControl('fh-note');
  const relative = relativeEl?.value || '';
  const condition = (conditionEl?.value || '').trim();
  if (!relative || !condition) return;
  if (!FAMILY_RELATIVES.some(r => r.key === relative)) return;
  const ageRaw = (ageEl?.value || '').trim();
  const onsetAge = ageRaw === '' ? null : Math.max(0, Math.min(120, parseInt(ageRaw, 10)));
  const note = (noteEl?.value || '').trim();
  syncDiagnosesNote();
  const diagnoses = _getDiagnoses();
  syncDiagnosisFlags(diagnoses);
  /** @type {{ relative: string, condition: string, onsetAge?: number, note?: string }} */
  const entry = { relative, condition };
  if (onsetAge != null && Number.isFinite(onsetAge)) entry.onsetAge = onsetAge;
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
  const input = getFormControl('fh-condition');
  const container = document.getElementById('fh-condition-suggestions');
  if (!input || !container) return;
  const val = input.value.toLowerCase().trim();
  const matches = val ? COMMON_CONDITIONS.filter(c => c.toLowerCase().includes(val)) : COMMON_CONDITIONS;
  if (matches.length === 0 || !val) { container.innerHTML = ''; return; }
  container.innerHTML = matches.slice(0, 8).map(m => `<div class="ctx-suggestion-item" data-medical-history-suggestion="family-condition" data-medical-history-value="${escapeHTML(m)}">${escapeHTML(m)}</div>`).join('');
}

export function selectFamilyConditionSuggestion(name) {
  const input = getFormControl('fh-condition');
  if (input) input.value = name;
  const container = document.getElementById('fh-condition-suggestions');
  if (container) container.innerHTML = '';
}

export function saveDiagnoses() {
  const note = getFormControl('ctx-note-input')?.value || '';
  const diagnoses = _getDiagnoses();
  diagnoses.note = note.trim();
  syncDiagnosisFlags(diagnoses);
  const condLen = diagnoses.conditions.length;
  const fhLen = diagnoses.familyHistory.length;
  const hasFlags = INTERPRETATION_FLAGS.some(([key]) => diagnoses.flags?.[key]);
  if (condLen === 0 && !diagnoses.note && fhLen === 0 && !hasFlags) {
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
