// @ts-check
// context-card-medical-history-editor-impl.js - lazy Medical History editor implementation

import { state } from './state.js';
import { COMMON_CONDITIONS } from './constants.js';
import { escapeAttr, escapeHTML } from './utils.js';
import { openModalOverlay } from './modal-lifecycle.js';
import {
  isContextEditorStylesheetLoaded,
  runWithContextEditorStylesheet,
  renderContextEditorModal,
  getSelectedOption,
  renderNoteField,
  renderSelectField,
} from './context-card-editor-ui.js';

/** @type {(msg: string, field?: string) => void} */
let saveContextAndRefresh = () => {};
let closeMedicalHistoryEditor = () => {};
let editingConditionIndex = -1;
let editingFamilyHistoryIndex = -1;
/** @type {any | null} */
let diagnosesDraft = null;
const INTERPRETATION_FLAGS = [
  ['lowMuscleMass', 'Low muscle mass / creatinine unreliable', 'Treat creatinine, creatinine eGFR, BUN/Cr, and creatinine-based biological age as context, not scored truth.'],
  ['hormoneTherapy', 'Hormone therapy / TRT / hormonal contraception', 'Flag sex-hormone markers as treatment/context-sensitive.'],
  ['postmenopause', 'Postmenopause / no active cycle', 'Do not interpret female hormones as ordinary cycling physiology.'],
  ['intenseTrainingRecent', 'Recent intense training near blood draw', 'Flag CK, AST/ALT, hs-CRP, urea, and recovery scores as training-load sensitive.'],
  ['acuteIllnessNearDraw', 'Acute illness / infection / injury near blood draw', 'Flag immune, inflammation, ferritin/iron, and recovery scores as transiently affected.'],
];
const CONDITION_IMPACT_LABELS = {
  major: 'High',
  mild: 'Moderate',
  minor: 'Low',
};
const CONDITION_STATUS = ['active', 'controlled', 'in remission', 'resolved'];

/**
 * @param {string} action
 * @param {string} [extra]
 * @returns {string}
 */
function medicalHistoryActionAttrs(action, extra = '') {
  return `data-medical-history-action="${action}"${extra ? ` ${extra}` : ''}`;
}

/**
 * @param {{ close?: () => void, recordChange?: (field: string) => void, saveAndRefresh?: (msg: string, field?: string) => void }} [deps]
 */
export function configureMedicalHistoryEditor({ close, saveAndRefresh } = {}) {
  if (typeof close === 'function') closeMedicalHistoryEditor = close;
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
  if (!isContextEditorStylesheetLoaded()) return runWithContextEditorStylesheet(openDiagnosesEditor);
  editingConditionIndex = -1;
  editingFamilyHistoryIndex = -1;
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  diagnosesDraft = cloneDiagnoses(state.importedData.diagnoses);
  const current = diagnosesDraft;
  renderDiagnosesModal(modal, current);
  openModalOverlay(overlay);
}

// Keep the common relatives explicit, then use maternal/paternal catch-alls
// for useful extended-family history without turning the picker into a tree.
const FAMILY_RELATIVES = [
  { key: 'mother',                 label: 'Mother' },
  { key: 'father',                 label: 'Father' },
  { key: 'sibling',                label: 'Sibling' },
  { key: 'half_sibling',           label: 'Half-sibling' },
  { key: 'child',                  label: 'Child' },
  { key: 'maternal_grandmother',   label: 'Maternal grandmother' },
  { key: 'maternal_grandfather',   label: 'Maternal grandfather' },
  { key: 'maternal_relative',      label: 'Other maternal relative' },
  { key: 'paternal_grandmother',   label: 'Paternal grandmother' },
  { key: 'paternal_grandfather',   label: 'Paternal grandfather' },
  { key: 'paternal_relative',      label: 'Other paternal relative' },
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

function cloneDiagnoses(source) {
  const cloned = source ? JSON.parse(JSON.stringify(source)) : {};
  if (!Array.isArray(cloned.conditions)) cloned.conditions = [];
  if (!Array.isArray(cloned.familyHistory)) cloned.familyHistory = [];
  if (!cloned.flags || typeof cloned.flags !== 'object') cloned.flags = {};
  if (typeof cloned.note !== 'string') cloned.note = '';
  if (typeof cloned.proceduresNote !== 'string') cloned.proceduresNote = '';
  return cloned;
}

function _getDiagnoses() {
  if (!diagnosesDraft) diagnosesDraft = cloneDiagnoses(state.importedData.diagnoses);
  return diagnosesDraft;
}

export function renderDiagnosesModal(modal, current) {
  const conditions = Array.isArray(current.conditions) ? current.conditions : [];
  const familyHistory = Array.isArray(current.familyHistory) ? current.familyHistory : [];
  if (!conditions[editingConditionIndex]) editingConditionIndex = -1;
  if (!familyHistory[editingFamilyHistoryIndex]) editingFamilyHistoryIndex = -1;
  const editingCondition = editingConditionIndex >= 0 ? conditions[editingConditionIndex] : null;
  const editingFamily = editingFamilyHistoryIndex >= 0 ? familyHistory[editingFamilyHistoryIndex] : null;
  const conditionSeverity = editingCondition ? (editingCondition.severity || 'mild') : 'mild';
  const conditionStatus = editingCondition?.status || null;
  let html = '';
  if (conditions.length > 0) {
    html += `<div class="ctx-conditions-list" id="ctx-conditions-list">`;
    for (let i = 0; i < conditions.length; i++) {
      const c = conditions[i];
      html += `<div class="ctx-condition-item${i === editingConditionIndex ? ' is-editing' : ''}">
        <span class="ctx-condition-name" title="${escapeHTML(c.name)}">${escapeHTML(c.name)}</span>
        ${c.severity ? `<span class="goals-severity-badge severity-${c.severity}">${escapeHTML(CONDITION_IMPACT_LABELS[c.severity] || c.severity)}</span>` : ''}
        ${c.status ? `<span class="ctx-condition-since">${escapeHTML(c.status)}</span>` : ''}
        ${c.since ? `<span class="ctx-condition-since">since ${escapeHTML(c.since)}</span>` : ''}
        <span class="ctx-condition-actions">
          <button class="ctx-row-action-btn ctx-row-edit-btn" ${medicalHistoryActionAttrs('edit-condition', `data-medical-history-index="${i}"`)} aria-label="Edit condition" title="Edit condition">✎</button>
          <button class="ctx-row-action-btn goals-delete-btn" ${medicalHistoryActionAttrs('delete-condition', `data-medical-history-index="${i}"`)} aria-label="Remove condition" title="Remove condition">&times;</button>
        </span>
      </div>`;
    }
    html += `</div>`;
  }
  html += `<div class="ctx-field-group"><label class="ctx-field-label">Conditions</label>
    <div class="ctx-condition-impact">
      <span class="ctx-field-label" id="condition-impact-label">Impact on interpretation</span>
      <div class="ctx-btn-group" id="condition-severity" role="group" aria-labelledby="condition-impact-label">
        <button type="button" class="ctx-btn-option${_activeClass(conditionSeverity, 'major')}" aria-pressed="${conditionSeverity === 'major'}" data-context-value="major" ${medicalHistoryActionAttrs('select-condition-severity')}>High</button>
        <button type="button" class="ctx-btn-option${_activeClass(conditionSeverity, 'mild')}" aria-pressed="${conditionSeverity === 'mild'}" data-context-value="mild" ${medicalHistoryActionAttrs('select-condition-severity')}>Moderate</button>
        <button type="button" class="ctx-btn-option${_activeClass(conditionSeverity, 'minor')}" aria-pressed="${conditionSeverity === 'minor'}" data-context-value="minor" ${medicalHistoryActionAttrs('select-condition-severity')}>Low</button>
      </div>
    </div>
    ${renderSelectField('Status', 'condition-status', CONDITION_STATUS, conditionStatus)}
    <div class="ctx-add-condition">
      <div class="ctx-autocomplete-wrapper">
        <input type="text" class="ctx-note-input" id="condition-input" value="${escapeHTML(editingCondition?.name || '')}" placeholder="Type condition name...">
        <div class="ctx-suggestions" id="condition-suggestions"></div>
      </div>
      <input type="text" class="ctx-note-input" id="condition-since" value="${escapeHTML(editingCondition?.since || '')}" placeholder="Since (year)" style="width:112px">
      <button class="import-btn import-btn-primary" ${medicalHistoryActionAttrs('add-condition')}>${editingCondition ? 'Update' : 'Add'}</button>
      ${editingCondition ? `<button class="import-btn import-btn-secondary ctx-edit-cancel-btn" ${medicalHistoryActionAttrs('cancel-condition-edit')}>Cancel edit</button>` : ''}
    </div>
  </div>`;

  const RELATIVE_EMOJI = {
    mother: '👩', father: '👨', sibling: '👫', half_sibling: '👫', child: '🧒',
    maternal_grandmother: '👵', maternal_grandfather: '👴',
    maternal_relative: '👤', paternal_grandmother: '👵', paternal_grandfather: '👴',
    paternal_relative: '👤',
  };

  html += `<details class="ctx-editor-section">
    <summary><span class="ctx-editor-section-title">Major procedures & organ changes</span><span class="ctx-editor-section-summary">${current.proceduresNote ? escapeHTML(current.proceduresNote.slice(0, 90)) : 'Optional surgery, transplant, or removed-organ context'}</span></summary>
    <div class="ctx-editor-section-body">
      <label class="ctx-field-label" for="diagnosis-procedures-input">Procedures or organ changes</label>
      <textarea class="ctx-note-input ctx-note-textarea" id="diagnosis-procedures-input" placeholder="For example: bariatric surgery, thyroid removal, transplant, splenectomy">${escapeHTML(current.proceduresNote || '')}</textarea>
    </div>
  </details>`;

  html += `<details class="ctx-editor-section ctx-family-history" id="ctx-family-section"${editingFamily ? ' open' : ''}>
    <summary><span class="ctx-editor-section-title">Family history${familyHistory.length ? ` (${familyHistory.length})` : ''}</span><span class="ctx-editor-section-summary">${familyHistory.length ? `${familyHistory.length} saved relative${familyHistory.length === 1 ? '' : 's'}` : 'Optional inherited-risk context'}</span></summary>
    <div class="ctx-editor-section-body">
    <div class="ctx-modal-hint">Family history can change how borderline results are interpreted without implying that you have the same condition.</div>`;
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
          <option value="half_sibling"${_selectedAttr(editingFamily?.relative, 'half_sibling')}>Half-sibling</option>
          <option value="child"${_selectedAttr(editingFamily?.relative, 'child')}>Child</option>
        </optgroup>
        <optgroup label="Maternal grandparents">
          <option value="maternal_grandmother"${_selectedAttr(editingFamily?.relative, 'maternal_grandmother')}>Maternal grandmother</option>
          <option value="maternal_grandfather"${_selectedAttr(editingFamily?.relative, 'maternal_grandfather')}>Maternal grandfather</option>
          <option value="maternal_relative"${_selectedAttr(editingFamily?.relative, 'maternal_relative')}>Other maternal relative</option>
        </optgroup>
        <optgroup label="Paternal grandparents">
          <option value="paternal_grandmother"${_selectedAttr(editingFamily?.relative, 'paternal_grandmother')}>Paternal grandmother</option>
          <option value="paternal_grandfather"${_selectedAttr(editingFamily?.relative, 'paternal_grandfather')}>Paternal grandfather</option>
          <option value="paternal_relative"${_selectedAttr(editingFamily?.relative, 'paternal_relative')}>Other paternal relative</option>
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
  </div></div></details>`;
  const hasFlags = INTERPRETATION_FLAGS.some(([key]) => current.flags?.[key]);
  const flagCount = INTERPRETATION_FLAGS.filter(([key]) => current.flags?.[key]).length;
  html += `<details class="ctx-editor-section">
    <summary><span class="ctx-editor-section-title">Interpretation flags</span><span class="ctx-editor-section-summary">${flagCount ? `${flagCount} saved flag${flagCount === 1 ? '' : 's'}` : 'Only when a score needs special handling'}</span></summary>
    <div class="ctx-editor-section-body">
      <div class="ctx-modal-hint">Use these only when context changes what a lab marker means.</div>
      <div class="ctx-flag-list">${INTERPRETATION_FLAGS.map(([key, label, help]) => `<label class="ctx-checkbox-row" title="${escapeAttr(help)}"><input type="checkbox" id="diagnosis-flag-${escapeAttr(key)}" ${current.flags?.[key] ? 'checked' : ''}> <span><strong>${escapeHTML(label)}</strong><small>${escapeHTML(help)}</small></span></label>`).join('')}</div>
    </div>
  </details>`;
  html += renderNoteField(current.note);
  const hasCurrent = conditions.length > 0 || familyHistory.length > 0 || current.proceduresNote || current.note || hasFlags;
  html += `<div class="ctx-editor-actions">
    <button class="import-btn import-btn-primary" ${medicalHistoryActionAttrs('save')}>Save</button>
    <button class="import-btn import-btn-secondary" ${medicalHistoryActionAttrs('close')}>Cancel</button>
    ${hasCurrent ? `<button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red);margin-left:auto" ${medicalHistoryActionAttrs('clear')}>Clear</button>` : ''}
  </div>`;
  renderContextEditorModal(
    modal,
    'Medical History',
    'Add only what matters for interpretation. Nothing changes until you save.',
    html,
    medicalHistoryActionAttrs('close'),
  );
}

export function filterConditionSuggestions() {
  const input = getFormControl('condition-input');
  const container = document.getElementById('condition-suggestions');
  if (!input || !container) return;
  const val = input.value.toLowerCase().trim();
  const existing = _getDiagnoses().conditions.map(c => c.name.toLowerCase());
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

export function syncDiagnosesNote() {
  const noteEl = getFormControl('ctx-note-input');
  if (noteEl) _getDiagnoses().note = noteEl.value.trim();
  const proceduresEl = getFormControl('diagnosis-procedures-input');
  if (proceduresEl) _getDiagnoses().proceduresNote = proceduresEl.value.trim();
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
  const status = getSelectedOption('condition-status');
  const since = getFormControl('condition-since');
  const name = input ? input.value.trim() : '';
  if (!name) return;
  syncDiagnosesNote();
  const diagnoses = _getDiagnoses();
  syncDiagnosisFlags(diagnoses);
  /** @type {{ name: string, severity: string, status?: string, since?: string }} */
  const cond = { name, severity };
  if (status) cond.status = status;
  if (since && since.value.trim()) cond.since = since.value.trim();
  if (editingConditionIndex >= 0 && editingConditionIndex < diagnoses.conditions.length) {
    diagnoses.conditions[editingConditionIndex] = cond;
  } else {
    diagnoses.conditions.push(cond);
  }
  editingConditionIndex = -1;
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
  syncDiagnosesNote();
  syncDiagnosisFlags();
  editingConditionIndex = -1;
  renderDiagnosesModal(document.getElementById("detail-modal"), _getDiagnoses());
}

export function deleteCondition(idx) {
  const diagnoses = _getDiagnoses();
  if (!diagnoses.conditions[idx]) return;
  syncDiagnosesNote();
  diagnoses.conditions.splice(idx, 1);
  editingConditionIndex = -1;
  renderDiagnosesModal(document.getElementById("detail-modal"), diagnoses);
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
  syncDiagnosesNote();
  syncDiagnosisFlags();
  editingFamilyHistoryIndex = -1;
  renderDiagnosesModal(document.getElementById("detail-modal"), _getDiagnoses());
}

export function deleteFamilyHistoryEntry(idx) {
  const diagnoses = _getDiagnoses();
  if (!diagnoses.familyHistory[idx]) return;
  syncDiagnosesNote();
  diagnoses.familyHistory.splice(idx, 1);
  editingFamilyHistoryIndex = -1;
  renderDiagnosesModal(document.getElementById("detail-modal"), diagnoses);
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
  const diagnoses = _getDiagnoses();
  syncDiagnosesNote();
  syncDiagnosisFlags(diagnoses);
  const condLen = diagnoses.conditions.length;
  const fhLen = diagnoses.familyHistory.length;
  const hasFlags = INTERPRETATION_FLAGS.some(([key]) => diagnoses.flags?.[key]);
  if (condLen === 0 && !diagnoses.proceduresNote && !diagnoses.note && fhLen === 0 && !hasFlags) {
    state.importedData.diagnoses = null;
  } else {
    state.importedData.diagnoses = diagnoses;
  }
  diagnosesDraft = null;
  editingConditionIndex = -1;
  editingFamilyHistoryIndex = -1;
  saveContextAndRefresh('Medical history saved', 'diagnoses');
}

export function closeDiagnoses() {
  diagnosesDraft = null;
  editingConditionIndex = -1;
  editingFamilyHistoryIndex = -1;
  closeMedicalHistoryEditor();
}

export function clearDiagnoses() {
  state.importedData.diagnoses = null;
  diagnosesDraft = null;
  editingConditionIndex = -1;
  editingFamilyHistoryIndex = -1;
  saveContextAndRefresh('Medical history cleared', 'diagnoses');
}
