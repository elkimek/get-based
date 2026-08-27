// @ts-check
// emf-editor.js — EMF assessment modal rendering and delegated interaction owner.

import { SBM_2015_THRESHOLDS, getEMFSeverity } from './schema.js';
import {
  EMF_ROOM_PRESETS,
  EMF_SOURCES,
  EMF_MITIGATIONS,
  EMF_METER_PRESETS,
} from './constants.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { toggleCtxTag } from './context-card-editor-ui.js';
import { loadEMFCatalog, renderEMFMeterRecs, isProductRecsEnabled } from './recommendations.js';
import { openModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { createUniqueId } from './unique-id.js';
import {
  MEASUREMENT_TYPES,
  SLEEPING_ROOMS,
  ensureEMFAssessments,
  safeEMFMediaType,
} from './emf-model.js';

/** @type {Record<string, any>} */
const emfEditorDeps = {
  addEMFAssessment: null,
  addEMFPhotos: null,
  addEMFRoom: null,
  closeModal: null,
  collectActiveAssessmentState: null,
  deleteEMFAssessment: null,
  handleEMFPDF: null,
  handleEMFRoomDropdown: null,
  hasAIProvider: () => false,
  interpretEMFAssessment: null,
  interpretEMFComparison: null,
  removeEMFPhoto: null,
  removeEMFRoom: null,
  saveEMFExplicit: null,
  selectEMFRoom: null,
  toggleEMFAssessment: null,
  toggleEMFCompare: null,
  updateEMFField: null,
  updateEMFMeasurement: null,
  updateEMFMeter: null,
  updateEMFRoom: null,
  viewEMFPhoto: null,
};

export function configureEMFEditor(deps = {}) {
  const previous = { ...emfEditorDeps };
  for (const [key, value] of Object.entries(deps || {})) {
    if (Object.hasOwn(emfEditorDeps, key) && (typeof value === 'function' || value === null)) {
      emfEditorDeps[key] = value;
    }
  }
  return previous;
}

export const emfEditorState = {
  editingAssessmentId: /** @type {string | null} */ (null),
  activeRoomIdx: 0,
  compareMode: false,
};

/** @type {{ label: string, callback: (() => void) | null } | null} */
let emfEditorReturnRoute = null;

let emfEditorDelegatesInstalled = false;

function emfAttrString(attrs) {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => `${name}="${escapeAttr(String(value))}"`)
    .join(' ');
}

function emfActionAttrs(action, attrs = {}) {
  return emfAttrString({ 'data-emf-action': action, ...attrs });
}

function emfChangeAttrs(action, attrs = {}) {
  return emfAttrString({ 'data-emf-change-action': action, ...attrs });
}

function isEMFEditorTarget(element) {
  return !!element.closest('#detail-modal');
}

function removeEMFEditorDelegates() {
  if (!emfEditorDelegatesInstalled) return;
  emfEditorDelegatesInstalled = false;
  document.removeEventListener('click', handleEMFEditorClick);
  document.removeEventListener('change', handleEMFEditorChange);
  document.removeEventListener('keydown', handleEMFEditorKeydown);
}

function closeEMFPreviewModal() {
  const modal = document.getElementById('detail-modal');
  if (!modal) return;
  renderEMFEditor(modal);
  const focusTarget = /** @type {HTMLElement | null} */ (
    modal.querySelector('[data-emf-action="trigger-pdf-import"], [data-emf-action="add-assessment"]')
  );
  requestAnimationFrame(() => focusTarget?.focus());
}

function closeEMFEditorModal() {
  emfEditorDeps.collectActiveAssessmentState?.();
  saveImportedData();
  document.querySelectorAll('.emf-lightbox').forEach(element => removeModalOverlay(element));
  removeEMFEditorDelegates();
  emfEditorReturnRoute = null;
  emfEditorDeps.closeModal?.();
}

function returnFromEMFEditor() {
  const route = emfEditorReturnRoute;
  emfEditorDeps.collectActiveAssessmentState?.();
  saveImportedData();
  document.querySelectorAll('.emf-lightbox').forEach(element => removeModalOverlay(element));
  removeEMFEditorDelegates();
  emfEditorReturnRoute = null;
  emfEditorDeps.closeModal?.();
  if (route?.callback) setTimeout(route.callback, 0);
}

function emfNumberAttr(element, name, fallback = 0) {
  const raw = element.dataset[name];
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function handleEMFEditorClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const actionElement = target.closest('[data-emf-action]');
  if (!(actionElement instanceof HTMLElement) || !isEMFEditorTarget(actionElement)) return;

  const action = actionElement.dataset.emfAction || '';
  const assessmentId = actionElement.dataset.emfAssessmentId || '';
  const roomIdx = emfNumberAttr(actionElement, 'emfRoomIdx');
  const photoIdx = emfNumberAttr(actionElement, 'emfPhotoIdx');

  if (actionElement.matches('button, a')) event.preventDefault();

  if (action === 'close-editor') { closeEMFEditorModal(); return; }
  if (action === 'return-to-origin') { returnFromEMFEditor(); return; }
  if (action === 'close-preview') { closeEMFPreviewModal(); return; }
  if (action === 'add-assessment') { emfEditorDeps.addEMFAssessment?.(); return; }
  if (action === 'trigger-pdf-import') {
    document.getElementById('emf-pdf-input')?.click();
    return;
  }
  if (action === 'toggle-compare') { emfEditorDeps.toggleEMFCompare?.(); return; }
  if (action === 'toggle-assessment') {
    if (assessmentId) emfEditorDeps.toggleEMFAssessment?.(assessmentId);
    return;
  }
  if (action === 'select-room') {
    if (assessmentId) emfEditorDeps.selectEMFRoom?.(assessmentId, roomIdx);
    return;
  }
  if (action === 'add-room') {
    if (assessmentId) emfEditorDeps.addEMFRoom?.(assessmentId);
    return;
  }
  if (action === 'remove-room') {
    if (assessmentId) emfEditorDeps.removeEMFRoom?.(assessmentId, roomIdx);
    return;
  }
  if (action === 'save') { emfEditorDeps.saveEMFExplicit?.(); return; }
  if (action === 'interpret-assessment') {
    if (assessmentId) emfEditorDeps.interpretEMFAssessment?.(assessmentId);
    return;
  }
  if (action === 'delete-assessment') {
    if (assessmentId) void emfEditorDeps.deleteEMFAssessment?.(assessmentId);
    return;
  }
  if (action === 'toggle-tag') { toggleCtxTag(actionElement); return; }
  if (action === 'view-photo') {
    if (assessmentId) emfEditorDeps.viewEMFPhoto?.(assessmentId, roomIdx, photoIdx);
    return;
  }
  if (action === 'remove-photo') {
    if (assessmentId) emfEditorDeps.removeEMFPhoto?.(assessmentId, roomIdx, photoIdx);
    return;
  }
  if (action === 'interpret-comparison') { emfEditorDeps.interpretEMFComparison?.(); }
}

function handleEMFEditorChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const actionElement = target.closest('[data-emf-change-action]');
  if (!(actionElement instanceof HTMLElement) || !isEMFEditorTarget(actionElement)) return;

  const action = actionElement.dataset.emfChangeAction || '';
  const assessmentId = actionElement.dataset.emfAssessmentId || '';
  const roomIdx = emfNumberAttr(actionElement, 'emfRoomIdx');

  if (action === 'pdf-input') {
    const input = actionElement instanceof HTMLInputElement ? actionElement : null;
    const file = input?.files?.[0];
    if (file) void emfEditorDeps.handleEMFPDF?.(file);
    return;
  }

  if (!assessmentId) return;

  if (action === 'field') {
    const input = actionElement instanceof HTMLInputElement || actionElement instanceof HTMLTextAreaElement
      ? actionElement
      : null;
    const field = actionElement.dataset.emfField || '';
    if (input && field) emfEditorDeps.updateEMFField?.(assessmentId, field, input.value);
    return;
  }

  if (action === 'room-dropdown') {
    const select = actionElement instanceof HTMLSelectElement ? actionElement : null;
    if (select) void emfEditorDeps.handleEMFRoomDropdown?.(assessmentId, roomIdx, select.value, select);
    return;
  }

  if (action === 'room-field') {
    const field = actionElement.dataset.emfRoomField || '';
    let value;
    if (actionElement instanceof HTMLInputElement && actionElement.type === 'checkbox') {
      value = actionElement.checked;
    } else if (actionElement instanceof HTMLInputElement || actionElement instanceof HTMLTextAreaElement) {
      value = actionElement.value;
    }
    if (field && value !== undefined) emfEditorDeps.updateEMFRoom?.(assessmentId, roomIdx, field, value);
    return;
  }

  if (action === 'measurement') {
    const input = actionElement instanceof HTMLInputElement ? actionElement : null;
    const type = actionElement.dataset.emfMeasurementType || '';
    if (input && type) emfEditorDeps.updateEMFMeasurement?.(assessmentId, roomIdx, type, input.value);
    return;
  }

  if (action === 'meter') {
    const input = actionElement instanceof HTMLInputElement ? actionElement : null;
    const type = actionElement.dataset.emfMeterType || '';
    if (input && type) emfEditorDeps.updateEMFMeter?.(assessmentId, roomIdx, type, input.value);
    return;
  }

  if (action === 'photos') {
    const input = actionElement instanceof HTMLInputElement ? actionElement : null;
    if (input?.files?.length) void emfEditorDeps.addEMFPhotos?.(assessmentId, roomIdx, input.files);
  }
}

function handleEMFEditorKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const actionElement = target.closest('[data-emf-action]');
  if (!(actionElement instanceof HTMLElement) || !isEMFEditorTarget(actionElement)) return;
  if (target.closest('input, textarea, select')) return;
  if (actionElement.matches('button, a')) return;
  event.preventDefault();
  actionElement.click();
}

function installEMFEditorDelegates() {
  if (emfEditorDelegatesInstalled) return;
  emfEditorDelegatesInstalled = true;
  document.addEventListener('click', handleEMFEditorClick);
  document.addEventListener('change', handleEMFEditorChange);
  document.addEventListener('keydown', handleEMFEditorKeydown);
}

export function openEMFAssessmentEditor(options = {}) {
  installEMFEditorDelegates();
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  emfEditorReturnRoute = typeof options.onReturn === 'function'
    ? { label: String(options.returnLabel || 'Back'), callback: options.onReturn }
    : null;
  emfEditorState.editingAssessmentId = null;
  renderEMFEditor(modal);
  openModalOverlay(overlay);
}

function getRoomWorstSeverity(room) {
  let worst = null;
  let worstIdx = -1;
  const sleeping = room.sleeping !== false;
  const tierOrder = ['green', 'yellow', 'orange', 'red'];
  for (const [type, measurement] of Object.entries(room.measurements || {})) {
    if (measurement && measurement.value != null) {
      const severity = getEMFSeverity(type, measurement.value, sleeping);
      if (severity) {
        const index = tierOrder.indexOf(severity.color);
        if (index > worstIdx) {
          worst = severity;
          worstIdx = index;
        }
      }
    }
  }
  return worst;
}

function getWorstSeverity(assessment) {
  let worst = null;
  let worstIdx = -1;
  const tierOrder = ['green', 'yellow', 'orange', 'red'];
  for (const room of assessment.rooms) {
    const severity = getRoomWorstSeverity(room);
    if (severity) {
      const index = tierOrder.indexOf(severity.color);
      if (index > worstIdx) {
        worst = severity;
        worstIdx = index;
      }
    }
  }
  return worst;
}

function severityDot(type, value, sleeping = true) {
  const severity = getEMFSeverity(type, value, sleeping);
  if (!severity) return '';
  return `<span class="emf-severity-dot" style="background:var(--${severity.color})" title="${severity.label}"></span>`;
}

function severityBadge(assessment) {
  const worst = getWorstSeverity(assessment);
  if (!worst) return '<span class="emf-badge emf-badge-none">No data</span>';
  return `<span class="emf-badge emf-badge-${worst.color}">${worst.label}</span>`;
}

export function renderEMFEditor(modal) {
  const assessments = ensureEMFAssessments();
  const sorted = [...assessments].sort((a, b) => b.date.localeCompare(a.date));

  let html = `${emfEditorReturnRoute ? `<button type="button" class="context-back-btn" aria-label="${escapeAttr(emfEditorReturnRoute.label)}" title="${escapeAttr(emfEditorReturnRoute.label)}" ${emfActionAttrs('return-to-origin')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg></button>` : ''}<button type="button" class="modal-close" aria-label="Close" ${emfActionAttrs('close-editor')}>&times;</button>
    <h3>Baubiologie EMF Assessment</h3>
    <div class="modal-unit">Room-by-room electromagnetic field measurements rated against SBM-2015 sleeping area standards.</div>
    <div class="emf-editor-actions">
      <button type="button" class="import-btn import-btn-primary" ${emfActionAttrs('add-assessment')}>+ New Assessment</button>
      ${emfEditorDeps.hasAIProvider() ? `<button type="button" class="import-btn import-btn-secondary" ${emfActionAttrs('trigger-pdf-import')}>Import PDF</button>
      <input type="file" id="emf-pdf-input" accept=".pdf" style="display:none" ${emfChangeAttrs('pdf-input')}>` : ''}
      <a href="data/emf-assessment-template.html" target="_blank" class="import-btn import-btn-secondary">Printable Template</a>
      ${sorted.length >= 2 ? `<button type="button" class="import-btn import-btn-secondary" ${emfActionAttrs('toggle-compare')}>${emfEditorState.compareMode ? 'Exit Compare' : 'Compare'}</button>` : ''}
    </div>`;

  if (sorted.length === 0) {
    emfEditorState.compareMode = false;
    html += `<div class="emf-empty">No assessments yet. Add one manually or import a consultant's PDF report.</div>`;
  } else if (emfEditorState.compareMode && sorted.length >= 2) {
    html += renderComparisonView(sorted);
  } else {
    for (const assessment of sorted) {
      const isExpanded = emfEditorState.editingAssessmentId === assessment.id;
      const formattedDate = new Date(assessment.date + 'T00:00:00')
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      html += `<div class="emf-assessment-card${isExpanded ? ' expanded' : ''}">
        <div class="emf-assessment-header" role="button" tabindex="0" ${emfActionAttrs('toggle-assessment', { 'data-emf-assessment-id': assessment.id })}>
          <div class="emf-assessment-info">
            <span class="emf-assessment-date">${formattedDate}</span>
            ${assessment.label ? `<span class="emf-assessment-label">${escapeHTML(assessment.label)}</span>` : ''}
            ${assessment.consultant ? `<span class="emf-assessment-consultant">by ${escapeHTML(assessment.consultant)}</span>` : ''}
          </div>
          ${severityBadge(assessment)}
        </div>`;

      if (isExpanded) html += renderAssessmentDetail(assessment);
      html += `</div>`;
    }
  }

  html += `<div id="emf-meter-recs-slot"></div>`;
  modal.innerHTML = html;

  const meterSlot = document.getElementById('emf-meter-recs-slot');
  if (meterSlot && isProductRecsEnabled()) {
    loadEMFCatalog().then(catalog => {
      if (catalog && document.getElementById('emf-meter-recs-slot') === meterSlot) {
        meterSlot.innerHTML = renderEMFMeterRecs(catalog);
      }
    });
  }
}

function renderAssessmentDetail(assessment) {
  if (emfEditorState.activeRoomIdx >= assessment.rooms.length) emfEditorState.activeRoomIdx = 0;
  const roomIdx = emfEditorState.activeRoomIdx;

  let html = `<div class="emf-assessment-detail">
    <div class="emf-meta-row">
      <label>Date <input type="date" class="emf-input" data-emf-field="date" value="${escapeAttr(assessment.date)}" ${emfChangeAttrs('field', { 'data-emf-assessment-id': assessment.id })}></label>
      <label>Label <input type="text" class="emf-input" data-emf-field="label" value="${escapeAttr(assessment.label)}" placeholder="e.g. Pre-mitigation" ${emfChangeAttrs('field', { 'data-emf-assessment-id': assessment.id })}></label>
      <label>Consultant <input type="text" class="emf-input" data-emf-field="consultant" value="${escapeAttr(assessment.consultant)}" placeholder="Optional" ${emfChangeAttrs('field', { 'data-emf-assessment-id': assessment.id })}></label>
    </div>`;

  html += `<div class="emf-room-tabs">`;
  for (let index = 0; index < assessment.rooms.length; index++) {
    const room = assessment.rooms[index];
    const worst = getRoomWorstSeverity(room);
    const dot = worst ? `<span class="emf-severity-dot" style="background:var(--${worst.color})"></span>` : '';
    html += `<button type="button" class="emf-room-tab${index === roomIdx ? ' active' : ''}" ${emfActionAttrs('select-room', { 'data-emf-assessment-id': assessment.id, 'data-emf-room-idx': index })}>${escapeHTML(room.name || 'Room ' + (index + 1))} ${dot}</button>`;
  }
  html += `<button type="button" class="emf-room-tab emf-room-tab-add" ${emfActionAttrs('add-room', { 'data-emf-assessment-id': assessment.id })} title="Add room">+</button>`;
  html += `</div>`;

  html += renderRoomContent(assessment.id, roomIdx, assessment.rooms[roomIdx], assessment.rooms.length);

  html += `<div class="emf-meta-row" style="margin-top:12px">
      <label style="flex:1">Notes <input type="text" class="emf-input" data-emf-field="note" value="${escapeAttr(assessment.note)}" placeholder="General assessment notes" ${emfChangeAttrs('field', { 'data-emf-assessment-id': assessment.id })}></label>
    </div>
    <div class="emf-assessment-footer">
      <button type="button" class="import-btn import-btn-primary" ${emfActionAttrs('save')}>Save</button>
      ${emfEditorDeps.hasAIProvider() ? `<button type="button" class="import-btn import-btn-secondary" ${emfActionAttrs('interpret-assessment', { 'data-emf-assessment-id': assessment.id })}>Interpret</button>` : ''}
      <span style="flex:1"></span>
      <button type="button" class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red)" ${emfActionAttrs('delete-assessment', { 'data-emf-assessment-id': assessment.id })}>Delete Assessment</button>
    </div>
  </div>`;
  return html;
}

function renderRoomContent(assessmentId, roomIdx, room, roomCount) {
  const assessment = ensureEMFAssessments().find(candidate => candidate.id === assessmentId);
  const existingNames = new Set(assessment ? assessment.rooms.map(candidate => candidate.name) : []);
  const availablePresets = EMF_ROOM_PRESETS.filter(name => !existingNames.has(name));

  let options = '';
  if (!EMF_ROOM_PRESETS.includes(room.name) && room.name) {
    options += `<option value="_current" selected>${escapeHTML(room.name)}</option>`;
  }
  for (let index = 0; index < (assessment ? assessment.rooms.length : 0); index++) {
    const candidate = assessment.rooms[index];
    const isCurrent = index === roomIdx;
    options += `<option value="_room_${index}"${isCurrent ? ' selected' : ''}>${escapeHTML(candidate.name || 'Room ' + (index + 1))}${isCurrent ? '' : ' ↩'}</option>`;
  }
  if (availablePresets.length) {
    options += `<option disabled>──────────</option>`;
    for (const name of availablePresets) {
      options += `<option value="_new_${escapeAttr(name)}">+ ${escapeHTML(name)}</option>`;
    }
  }
  options += `<option value="_custom">+ Custom...</option>`;

  let html = `<div class="emf-room-content">
    <div class="emf-room-header">
      <select class="emf-input emf-room-select" ${emfChangeAttrs('room-dropdown', { 'data-emf-assessment-id': assessmentId, 'data-emf-room-idx': roomIdx })}>
        ${options}
      </select>
      <input type="text" class="emf-input emf-location" data-emf-room-field="location" value="${escapeAttr(room.location)}" placeholder="Location (e.g. bed pillow area)" ${emfChangeAttrs('room-field', { 'data-emf-assessment-id': assessmentId, 'data-emf-room-idx': roomIdx })}>
      <label class="emf-sleeping-toggle" title="Sleeping areas use stricter SBM-2015 thresholds">
        <input type="checkbox" data-emf-room-field="sleeping" ${room.sleeping !== false ? 'checked' : ''} ${emfChangeAttrs('room-field', { 'data-emf-assessment-id': assessmentId, 'data-emf-room-idx': roomIdx })}>
        Sleeping area
      </label>
      ${roomCount > 1 ? `<button type="button" class="emf-remove-room" ${emfActionAttrs('remove-room', { 'data-emf-assessment-id': assessmentId, 'data-emf-room-idx': roomIdx })} title="Remove room">&times;</button>` : ''}
    </div>
    <div class="emf-measurements">`;

  const sleeping = room.sleeping !== false;
  for (const measurementType of MEASUREMENT_TYPES) {
    const definition = SBM_2015_THRESHOLDS[measurementType.key];
    const measurement = (room.measurements && room.measurements[measurementType.key]) || {};
    const value = measurement.value != null ? measurement.value : '';
    html += `<div class="emf-measurement-row">
      <span class="emf-measurement-label">${measurementType.short}</span>
      <input type="number" class="emf-input emf-value-input" value="${escapeAttr(String(value))}" step="any" placeholder="—"
        data-emf-measurement-type="${measurementType.key}"
        ${emfChangeAttrs('measurement', { 'data-emf-assessment-id': assessmentId, 'data-emf-room-idx': roomIdx })}>
      <span class="emf-measurement-unit">${definition.unit}</span>
      ${value !== '' ? severityDot(measurementType.key, parseFloat(value), sleeping) : '<span class="emf-severity-dot-placeholder"></span>'}
      <input type="text" class="emf-input emf-meter-input" value="${escapeAttr(measurement.meter || '')}" placeholder="Meter"
        list="emf-meters-${measurementType.key}"
        data-emf-meter-type="${measurementType.key}"
        ${emfChangeAttrs('meter', { 'data-emf-assessment-id': assessmentId, 'data-emf-room-idx': roomIdx })}>
    </div>`;
  }

  html += `</div>`;

  for (const measurementType of MEASUREMENT_TYPES) {
    const meters = EMF_METER_PRESETS.filter(preset => preset.types.includes(measurementType.key));
    html += `<datalist id="emf-meters-${measurementType.key}">${meters.map(preset => `<option value="${escapeHTML(preset.name)}">`).join('')}</datalist>`;
  }

  html += `<div class="emf-tags-section">
    <label class="emf-tags-label">Sources identified</label>
    <div class="ctx-tags" id="emf-sources-${assessmentId}-${roomIdx}">
      ${EMF_SOURCES.map(source => `<button type="button" class="ctx-tag${(room.sources || []).includes(source) ? ' active' : ''}" ${emfActionAttrs('toggle-tag')}>${escapeHTML(source)}</button>`).join('')}
    </div></div>`;

  html += `<div class="emf-tags-section">
    <label class="emf-tags-label">Mitigations applied</label>
    <div class="ctx-tags" id="emf-mits-${assessmentId}-${roomIdx}">
      ${EMF_MITIGATIONS.map(mitigation => `<button type="button" class="ctx-tag${(room.mitigations || []).includes(mitigation) ? ' active' : ''}" ${emfActionAttrs('toggle-tag')}>${escapeHTML(mitigation)}</button>`).join('')}
    </div></div>`;

  html += `<input type="text" class="emf-input emf-room-note" data-emf-room-field="note" value="${escapeAttr(room.note)}" placeholder="Room notes" ${emfChangeAttrs('room-field', { 'data-emf-assessment-id': assessmentId, 'data-emf-room-idx': roomIdx })}>`;

  const photos = room.photos || [];
  html += `<div class="emf-photos-section">
    <label class="emf-tags-label">Photos</label>
    <div class="emf-photos-grid">
      ${photos.map((photo, photoIdx) => `<div class="emf-photo-thumb">
        <img src="data:${safeEMFMediaType(photo.mediaType)};base64,${photo.base64}" alt="${escapeAttr(photo.name || 'Photo')}" role="button" tabindex="0" ${emfActionAttrs('view-photo', { 'data-emf-assessment-id': assessmentId, 'data-emf-room-idx': roomIdx, 'data-emf-photo-idx': photoIdx })}>
        <button type="button" class="emf-photo-remove" ${emfActionAttrs('remove-photo', { 'data-emf-assessment-id': assessmentId, 'data-emf-room-idx': roomIdx, 'data-emf-photo-idx': photoIdx })} title="Remove">&times;</button>
      </div>`).join('')}
      <label class="emf-photo-add" title="Add photo">
        <input type="file" accept="image/*" multiple style="display:none" ${emfChangeAttrs('photos', { 'data-emf-assessment-id': assessmentId, 'data-emf-room-idx': roomIdx })}>
        +
      </label>
    </div>
  </div>`;

  html += `</div>`;
  return html;
}

export function showEMFImportPreview(parsed) {
  installEMFEditorDelegates();
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;
  // The preview replaces the editor DOM. Capture any in-progress field edits
  // first so Cancel/Back can reconstruct the exact assessment state.
  emfEditorDeps.collectActiveAssessmentState?.();
  const formattedDate = parsed.date
    ? new Date(parsed.date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    : 'Unknown date';

  let html = `<button type="button" class="context-back-btn" aria-label="Back to EMF assessments" title="Back to EMF assessments" ${emfActionAttrs('close-preview')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg></button><button type="button" class="modal-close" aria-label="Back to EMF assessments" ${emfActionAttrs('close-preview')}>&times;</button>
    <h3>EMF Report Preview</h3>
    <div class="modal-unit">${formattedDate}${parsed.consultant ? ' — by ' + escapeHTML(parsed.consultant) : ''}</div>`;

  for (const room of parsed.rooms) {
    html += `<div class="emf-room-card">
      <div class="emf-room-header"><strong>${escapeHTML(room.name)}</strong>
        ${room.location ? `<span style="color:var(--text-muted);font-size:12px">${escapeHTML(room.location)}</span>` : ''}
      </div>
      <div class="emf-measurements">`;
    for (const measurementType of MEASUREMENT_TYPES) {
      const measurement = (room.measurements || {})[measurementType.key];
      if (!measurement) continue;
      const definition = SBM_2015_THRESHOLDS[measurementType.key];
      const sleeping = SLEEPING_ROOMS.has(room.name);
      const severity = getEMFSeverity(measurementType.key, measurement.value, sleeping);
      html += `<div class="emf-measurement-row">
        <span class="emf-measurement-label">${measurementType.short}</span>
        <span style="font-weight:600">${measurement.value}</span>
        <span class="emf-measurement-unit">${definition.unit}</span>
        ${severity ? `<span class="emf-severity-dot" style="background:var(--${severity.color})" title="${severity.label}"></span>
        <span style="font-size:11px;color:var(--${severity.color})">${severity.label}</span>` : ''}
      </div>`;
    }
    html += `</div>`;
    if (room.sources && room.sources.length) {
      html += `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">Sources: ${room.sources.map(source => escapeHTML(source)).join(', ')}</div>`;
    }
    if (room.mitigations && room.mitigations.length) {
      html += `<div style="font-size:12px;color:var(--text-muted)">Mitigations: ${room.mitigations.map(mitigation => escapeHTML(mitigation)).join(', ')}</div>`;
    }
    html += `</div>`;
  }

  html += `<div class="ctx-editor-actions">
    <button type="button" class="import-btn import-btn-primary" id="emf-confirm-btn">Confirm Import</button>
    <button type="button" class="import-btn import-btn-secondary" ${emfActionAttrs('close-preview')}>Cancel</button>
  </div>`;

  modal.innerHTML = html;
  const confirmButton = modal.querySelector('#emf-confirm-btn');
  if (!confirmButton) return;
  openModalOverlay(overlay);

  confirmButton.addEventListener('click', () => {
    const assessments = ensureEMFAssessments();
    const assessment = {
      id: createUniqueId('emf_'),
      date: parsed.date || new Date().toISOString().slice(0, 10),
      label: '',
      consultant: parsed.consultant || '',
      rooms: parsed.rooms.map(room => ({
        name: room.name || 'Unknown',
        location: room.location || '',
        sleeping: SLEEPING_ROOMS.has(room.name || 'Unknown'),
        measurements: room.measurements || {},
        sources: room.sources || [],
        mitigations: room.mitigations || [],
        note: '',
      })),
      note: parsed.note || '',
    };
    for (const room of assessment.rooms) {
      for (const [type, measurement] of Object.entries(room.measurements || {})) {
        const definition = SBM_2015_THRESHOLDS[type];
        if (definition && measurement) measurement.unit = definition.unit;
      }
    }
    assessments.push(assessment);
    saveImportedData();
    showNotification('EMF assessment imported', 'success');
    emfEditorState.editingAssessmentId = assessment.id;
    renderEMFEditor(modal);
  });
}

function renderComparisonView(sorted) {
  const before = sorted[sorted.length > 1 ? 1 : 0];
  const after = sorted[0];
  const formatDate = date => new Date(date + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const roomNames = [...new Set([
    ...before.rooms.map(room => room.name),
    ...after.rooms.map(room => room.name),
  ])];

  let html = `<div class="emf-compare-header">
    <span class="emf-compare-label">Before: ${formatDate(before.date)}${before.label ? ' — ' + escapeHTML(before.label) : ''}</span>
    <span class="emf-compare-arrow">→</span>
    <span class="emf-compare-label">After: ${formatDate(after.date)}${after.label ? ' — ' + escapeHTML(after.label) : ''}</span>
  </div>`;

  if (sorted.length > 2) {
    html += `<div class="emf-compare-note">Comparing the two most recent assessments. ${sorted.length - 2} earlier assessment${sorted.length > 3 ? 's' : ''} not shown.</div>`;
  }

  html += `<div class="emf-compare-table"><table>
    <thead><tr><th>Room</th>`;
  for (const measurementType of MEASUREMENT_TYPES) {
    html += `<th>${measurementType.short}</th>`;
  }
  html += `</tr></thead><tbody>`;

  for (const name of roomNames) {
    const beforeRoom = before.rooms.find(room => room.name === name);
    const afterRoom = after.rooms.find(room => room.name === name);
    const sleeping = (afterRoom || beforeRoom)?.sleeping !== false;

    html += `<tr><td class="emf-compare-room">${escapeHTML(name)}</td>`;
    for (const measurementType of MEASUREMENT_TYPES) {
      const beforeValue = beforeRoom?.measurements?.[measurementType.key]?.value;
      const afterValue = afterRoom?.measurements?.[measurementType.key]?.value;

      if (beforeValue == null && afterValue == null) {
        html += `<td class="emf-compare-cell">—</td>`;
        continue;
      }

      const beforeSeverity = beforeValue != null
        ? getEMFSeverity(measurementType.key, beforeValue, sleeping)
        : null;
      const afterSeverity = afterValue != null
        ? getEMFSeverity(measurementType.key, afterValue, sleeping)
        : null;

      let cellHtml = '';
      if (beforeValue != null && afterValue != null) {
        const delta = afterValue - beforeValue;
        const arrow = delta < 0 ? '↓' : delta > 0 ? '↑' : '=';
        const arrowColor = delta < 0
          ? 'var(--green)'
          : delta > 0 ? 'var(--red)' : 'var(--text-muted)';
        cellHtml = `<span style="color:var(--${beforeSeverity?.color || 'text-muted'})">${beforeValue}</span>
          <span style="color:${arrowColor};font-weight:600">${arrow}</span>
          <span style="color:var(--${afterSeverity?.color || 'text-muted'})">${afterValue}</span>`;
      } else if (afterValue != null) {
        cellHtml = `<span style="color:var(--text-muted)">—</span> → <span style="color:var(--${afterSeverity?.color || 'text-muted'})">${afterValue}</span>`;
      } else {
        cellHtml = `<span style="color:var(--${beforeSeverity?.color || 'text-muted'})">${beforeValue}</span> → <span style="color:var(--text-muted)">—</span>`;
      }
      html += `<td class="emf-compare-cell">${cellHtml}</td>`;
    }
    html += `</tr>`;
  }

  html += `</tbody></table></div>`;

  if (emfEditorDeps.hasAIProvider()) {
    html += `<div style="margin-top:12px">
      <button type="button" class="import-btn import-btn-secondary" ${emfActionAttrs('interpret-comparison')}>Interpret Changes</button>
    </div>`;
  }
  return html;
}
