// emf.js — Baubiologie EMF Assessment sub-module
// Room-by-room EMF measurements with SBM-2015 severity ratings

import { state } from './state.js';
import { SBM_2015_THRESHOLDS, getEMFSeverity, calculateCost, formatCost, trackUsage } from './schema.js';

const SAFE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
function safeMediaType(t) { return SAFE_IMAGE_TYPES.includes(t) ? t : 'image/png'; }
import { EMF_ROOM_PRESETS, EMF_SOURCES, EMF_MITIGATIONS, EMF_METER_PRESETS } from './constants.js';
import { escapeHTML, showNotification, showConfirmDialog, isPIIReviewEnabled } from './utils.js';
import { saveImportedData } from './data.js';
import { resizeImage, isValidImageType } from './image-utils.js';
import { callClaudeAPI, hasAIProvider, getAIProvider, getActiveModelId, getActiveModelDisplay } from './api.js';
import { renderMarkdown } from './markdown.js';
import { extractPDFText } from './pdf-import.js';
import { obfuscatePDFText, sanitizeWithOllama, sanitizeWithOllamaStreaming, checkOllamaPII, reviewPIIBeforeSend } from './pii.js';
import { loadEMFCatalog, renderEMFMeterRecs, renderEMFMitigationRecs, isProductRecsEnabled, detectMitigationsInText } from './recommendations.js';

// ═══════════════════════════════════════════════
// MEASUREMENT TYPES (display order)
// ═══════════════════════════════════════════════
const MEASUREMENT_TYPES = [
  { key: 'acElectric',       short: 'AC Electric' },
  { key: 'acMagnetic',       short: 'AC Magnetic' },
  { key: 'rfMicrowave',      short: 'RF/Microwave' },
  { key: 'dirtyElectricity', short: 'Dirty Elec.' },
  { key: 'dcMagnetic',       short: 'DC Magnetic' },
];

// ═══════════════════════════════════════════════
// DATA HELPERS
// ═══════════════════════════════════════════════
function ensureAssessments() {
  if (!state.importedData.emfAssessment) {
    state.importedData.emfAssessment = { assessments: [] };
  }
  return state.importedData.emfAssessment.assessments;
}

const SLEEPING_ROOMS = new Set(['Bedroom', 'Children\'s Room', 'Nursery']);

function newRoom(name) {
  return {
    name: name || 'Bedroom',
    location: '',
    sleeping: SLEEPING_ROOMS.has(name || 'Bedroom'),
    measurements: {},
    sources: [],
    mitigations: [],
    note: ''
  };
}

function newAssessment() {
  return {
    id: 'emf_' + Date.now(),
    date: new Date().toISOString().slice(0, 10),
    label: '',
    consultant: '',
    rooms: [newRoom('Bedroom')],
    note: ''
  };
}

function getRoomWorstSeverity(room) {
  let worst = null, worstIdx = -1;
  const sleeping = room.sleeping !== false;
  const tierOrder = ['green', 'yellow', 'orange', 'red'];
  for (const [type, m] of Object.entries(room.measurements || {})) {
    if (m && m.value != null) {
      const sev = getEMFSeverity(type, m.value, sleeping);
      if (sev) {
        const idx = tierOrder.indexOf(sev.color);
        if (idx > worstIdx) { worst = sev; worstIdx = idx; }
      }
    }
  }
  return worst;
}

/** Worst severity across all rooms in an assessment */
function getWorstSeverity(assessment) {
  let worst = null;
  let worstIdx = -1;
  const tierOrder = ['green', 'yellow', 'orange', 'red'];
  for (const room of assessment.rooms) {
    const sev = getRoomWorstSeverity(room);
    if (sev) {
      const idx = tierOrder.indexOf(sev.color);
      if (idx > worstIdx) { worst = sev; worstIdx = idx; }
    }
  }
  return worst;
}

// ═══════════════════════════════════════════════
// SEVERITY DOT
// ═══════════════════════════════════════════════
function severityDot(type, value, sleeping = true) {
  const sev = getEMFSeverity(type, value, sleeping);
  if (!sev) return '';
  return `<span class="emf-severity-dot" style="background:var(--${sev.color})" title="${sev.label}"></span>`;
}

function severityBadge(assessment) {
  const worst = getWorstSeverity(assessment);
  if (!worst) return '<span class="emf-badge emf-badge-none">No data</span>';
  return `<span class="emf-badge emf-badge-${worst.color}">${worst.label}</span>`;
}

// ═══════════════════════════════════════════════
// EDITOR UI
// ═══════════════════════════════════════════════
let _editingAssessmentId = null;
let _activeRoomIdx = 0;

export function openEMFAssessmentEditor() {
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  _editingAssessmentId = null;
  renderEMFEditor(modal);
  overlay.classList.add('show');
  // Save tags when modal closes (before DOM is torn down)
  const closeBtn = modal.querySelector('.modal-close');
  if (closeBtn) closeBtn.addEventListener('click', () => { collectActiveAssessmentState(); saveImportedData(); document.querySelectorAll('.emf-lightbox').forEach(el => el.remove()); }, { once: true });
}

function renderEMFEditor(modal) {
  const assessments = ensureAssessments();
  const sorted = [...assessments].sort((a, b) => b.date.localeCompare(a.date));

  let html = `<button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
    <h3>Baubiologie EMF Assessment</h3>
    <div class="modal-unit">Room-by-room electromagnetic field measurements rated against SBM-2015 sleeping area standards.</div>
    <div class="emf-editor-actions">
      <button class="import-btn import-btn-primary" onclick="addEMFAssessment()">+ New Assessment</button>
      ${hasAIProvider() ? `<button class="import-btn import-btn-secondary" onclick="document.getElementById('emf-pdf-input').click()">Import PDF</button>
      <input type="file" id="emf-pdf-input" accept=".pdf" style="display:none" onchange="if(this.files[0])handleEMFPDF(this.files[0])">` : ''}
      <a href="data/emf-assessment-template.html" target="_blank" class="import-btn import-btn-secondary">Printable Template</a>
      ${sorted.length >= 2 ? `<button class="import-btn import-btn-secondary" onclick="toggleEMFCompare()">${_compareMode ? 'Exit Compare' : 'Compare'}</button>` : ''}
    </div>`;

  if (sorted.length === 0) {
    _compareMode = false;
    html += `<div class="emf-empty">No assessments yet. Add one manually or import a consultant's PDF report.</div>`;
  } else if (_compareMode && sorted.length >= 2) {
    html += renderComparisonView(sorted);
  } else {
    for (const a of sorted) {
      const isExpanded = _editingAssessmentId === a.id;
      const fmtDate = new Date(a.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      html += `<div class="emf-assessment-card${isExpanded ? ' expanded' : ''}">
        <div class="emf-assessment-header" onclick="toggleEMFAssessment('${a.id}')">
          <div class="emf-assessment-info">
            <span class="emf-assessment-date">${fmtDate}</span>
            ${a.label ? `<span class="emf-assessment-label">${escapeHTML(a.label)}</span>` : ''}
            ${a.consultant ? `<span class="emf-assessment-consultant">by ${escapeHTML(a.consultant)}</span>` : ''}
          </div>
          ${severityBadge(a)}
        </div>`;

      if (isExpanded) {
        html += renderAssessmentDetail(a);
      }
      html += `</div>`;
    }
  }

  // Meter recommendations always visible — empty state, list view, and compare view alike
  html += `<div id="emf-meter-recs-slot"></div>`;

  modal.innerHTML = html;

  // Populate meter recommendations on the empty state — async, never blocks render
  const meterSlot = document.getElementById('emf-meter-recs-slot');
  if (meterSlot && isProductRecsEnabled()) {
    loadEMFCatalog().then(cat => {
      if (cat && document.getElementById('emf-meter-recs-slot') === meterSlot) {
        meterSlot.innerHTML = renderEMFMeterRecs(cat);
      }
    });
  }
}

function renderAssessmentDetail(a) {
  if (_activeRoomIdx >= a.rooms.length) _activeRoomIdx = 0;
  const ri = _activeRoomIdx;

  let html = `<div class="emf-assessment-detail">
    <div class="emf-meta-row">
      <label>Date <input type="date" class="emf-input" data-emf-field="date" value="${a.date}" onchange="updateEMFField('${a.id}','date',this.value)"></label>
      <label>Label <input type="text" class="emf-input" data-emf-field="label" value="${escapeHTML(a.label)}" placeholder="e.g. Pre-mitigation" onchange="updateEMFField('${a.id}','label',this.value)"></label>
      <label>Consultant <input type="text" class="emf-input" data-emf-field="consultant" value="${escapeHTML(a.consultant)}" placeholder="Optional" onchange="updateEMFField('${a.id}','consultant',this.value)"></label>
    </div>`;

  // Room tabs
  html += `<div class="emf-room-tabs">`;
  for (let i = 0; i < a.rooms.length; i++) {
    const room = a.rooms[i];
    const worst = getRoomWorstSeverity(room);
    const dot = worst ? `<span class="emf-severity-dot" style="background:var(--${worst.color})"></span>` : '';
    html += `<button class="emf-room-tab${i === ri ? ' active' : ''}" onclick="selectEMFRoom('${a.id}',${i})">${escapeHTML(room.name || 'Room ' + (i + 1))} ${dot}</button>`;
  }
  html += `<button class="emf-room-tab emf-room-tab-add" onclick="addEMFRoom('${a.id}')" title="Add room">+</button>`;
  html += `</div>`;

  // Active room content
  html += renderRoomContent(a.id, ri, a.rooms[ri], a.rooms.length);

  html += `<div class="emf-meta-row" style="margin-top:12px">
      <label style="flex:1">Notes <input type="text" class="emf-input" data-emf-field="note" value="${escapeHTML(a.note)}" placeholder="General assessment notes" onchange="updateEMFField('${a.id}','note',this.value)"></label>
    </div>
    <div class="emf-assessment-footer">
      <button class="import-btn import-btn-primary" onclick="saveEMFExplicit()">Save</button>
      ${hasAIProvider() ? `<button class="import-btn import-btn-secondary" onclick="interpretEMFAssessment('${a.id}')">Interpret</button>` : ''}
      <span style="flex:1"></span>
      <button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red)" onclick="deleteEMFAssessment('${a.id}')">Delete Assessment</button>
    </div>
  </div>`;
  return html;
}

function renderRoomContent(assessmentId, roomIdx, room, roomCount) {
  // Build dropdown: existing rooms as a group, then available presets
  const a = ensureAssessments().find(x => x.id === assessmentId);
  const existingNames = new Set(a ? a.rooms.map(r => r.name) : []);
  const availablePresets = EMF_ROOM_PRESETS.filter(r => !existingNames.has(r));

  let options = '';
  // Current room's name is always selected
  if (!EMF_ROOM_PRESETS.includes(room.name) && room.name) {
    options += `<option value="_current" selected>${escapeHTML(room.name)}</option>`;
  }
  // Existing rooms (for switching)
  for (let i = 0; i < (a ? a.rooms.length : 0); i++) {
    const r = a.rooms[i];
    const isCurrent = i === roomIdx;
    options += `<option value="_room_${i}"${isCurrent ? ' selected' : ''}>${escapeHTML(r.name || 'Room ' + (i + 1))}${isCurrent ? '' : ' ↩'}</option>`;
  }
  // Available presets (for creating new rooms)
  if (availablePresets.length) {
    options += `<option disabled>──────────</option>`;
    for (const r of availablePresets) {
      options += `<option value="_new_${escapeHTML(r)}">+ ${escapeHTML(r)}</option>`;
    }
  }
  options += `<option value="_custom">+ Custom...</option>`;

  let html = `<div class="emf-room-content">
    <div class="emf-room-header">
      <select class="emf-input emf-room-select" onchange="handleEMFRoomDropdown('${assessmentId}',${roomIdx},this.value,this)">
        ${options}
      </select>
      <input type="text" class="emf-input emf-location" data-emf-room-field="location" value="${escapeHTML(room.location)}" placeholder="Location (e.g. bed pillow area)" onchange="updateEMFRoom('${assessmentId}',${roomIdx},'location',this.value)">
      <label class="emf-sleeping-toggle" title="Sleeping areas use stricter SBM-2015 thresholds">
        <input type="checkbox" data-emf-room-field="sleeping" ${room.sleeping !== false ? 'checked' : ''} onchange="updateEMFRoom('${assessmentId}',${roomIdx},'sleeping',this.checked)">
        Sleeping area
      </label>
      ${roomCount > 1 ? `<button class="emf-remove-room" onclick="removeEMFRoom('${assessmentId}',${roomIdx})" title="Remove room">&times;</button>` : ''}
    </div>
    <div class="emf-measurements">`;

  const sleeping = room.sleeping !== false;
  for (const mt of MEASUREMENT_TYPES) {
    const def = SBM_2015_THRESHOLDS[mt.key];
    const m = (room.measurements && room.measurements[mt.key]) || {};
    const val = m.value != null ? m.value : '';
    html += `<div class="emf-measurement-row">
      <span class="emf-measurement-label">${mt.short}</span>
      <input type="number" class="emf-input emf-value-input" value="${val}" step="any" placeholder="—"
        data-emf-measurement-type="${mt.key}"
        onchange="updateEMFMeasurement('${assessmentId}',${roomIdx},'${mt.key}',this.value)">
      <span class="emf-measurement-unit">${def.unit}</span>
      ${val !== '' ? severityDot(mt.key, parseFloat(val), sleeping) : '<span class="emf-severity-dot-placeholder"></span>'}
      <input type="text" class="emf-input emf-meter-input" value="${escapeHTML(m.meter || '')}" placeholder="Meter"
        list="emf-meters-${mt.key}"
        data-emf-meter-type="${mt.key}"
        onchange="updateEMFMeter('${assessmentId}',${roomIdx},'${mt.key}',this.value)">
    </div>`;
  }

  html += `</div>`;

  // Meter datalists (one per measurement type, filtered to matching meters)
  for (const mt of MEASUREMENT_TYPES) {
    const meters = EMF_METER_PRESETS.filter(p => p.types.includes(mt.key));
    html += `<datalist id="emf-meters-${mt.key}">${meters.map(p => `<option value="${escapeHTML(p.name)}">`).join('')}</datalist>`;
  }

  // Sources
  html += `<div class="emf-tags-section">
    <label class="emf-tags-label">Sources identified</label>
    <div class="ctx-tags" id="emf-sources-${assessmentId}-${roomIdx}">
      ${EMF_SOURCES.map(s => `<button type="button" class="ctx-tag${(room.sources || []).includes(s) ? ' active' : ''}" onclick="toggleCtxTag(this)">${escapeHTML(s)}</button>`).join('')}
    </div></div>`;

  // Mitigations
  html += `<div class="emf-tags-section">
    <label class="emf-tags-label">Mitigations applied</label>
    <div class="ctx-tags" id="emf-mits-${assessmentId}-${roomIdx}">
      ${EMF_MITIGATIONS.map(s => `<button type="button" class="ctx-tag${(room.mitigations || []).includes(s) ? ' active' : ''}" onclick="toggleCtxTag(this)">${escapeHTML(s)}</button>`).join('')}
    </div></div>`;

  html += `<input type="text" class="emf-input emf-room-note" data-emf-room-field="note" value="${escapeHTML(room.note)}" placeholder="Room notes" onchange="updateEMFRoom('${assessmentId}',${roomIdx},'note',this.value)">`;

  // Photos
  const photos = room.photos || [];
  html += `<div class="emf-photos-section">
    <label class="emf-tags-label">Photos</label>
    <div class="emf-photos-grid">
      ${photos.map((p, pi) => `<div class="emf-photo-thumb">
        <img src="data:${safeMediaType(p.mediaType)};base64,${p.base64}" alt="${escapeHTML(p.name || 'Photo')}" onclick="viewEMFPhoto('${assessmentId}',${roomIdx},${pi})">
        <button class="emf-photo-remove" onclick="removeEMFPhoto('${assessmentId}',${roomIdx},${pi})" title="Remove">&times;</button>
      </div>`).join('')}
      <label class="emf-photo-add" title="Add photo">
        <input type="file" accept="image/*" multiple style="display:none" onchange="addEMFPhotos('${assessmentId}',${roomIdx},this.files)">
        +
      </label>
    </div>
  </div>`;

  html += `</div>`;
  return html;
}

// ═══════════════════════════════════════════════
// CRUD OPERATIONS
// ═══════════════════════════════════════════════
export function addEMFAssessment() {
  const assessments = ensureAssessments();
  const a = newAssessment();
  assessments.push(a);
  _editingAssessmentId = a.id;
  renderEMFEditor(document.getElementById('detail-modal'));
}

export function toggleEMFAssessment(id) {
  collectActiveAssessmentState();
  _editingAssessmentId = _editingAssessmentId === id ? null : id;
  _activeRoomIdx = 0;
  renderEMFEditor(document.getElementById('detail-modal'));
}

export function selectEMFRoom(assessmentId, roomIdx) {
  collectActiveAssessmentState();
  _activeRoomIdx = roomIdx;
  renderEMFEditor(document.getElementById('detail-modal'));
}

export async function handleEMFRoomDropdown(assessmentId, currentRoomIdx, value, selectEl) {
  // Switch to existing room
  if (value.startsWith('_room_')) {
    const idx = parseInt(value.slice(6));
    if (idx !== currentRoomIdx) selectEMFRoom(assessmentId, idx);
    else selectEl.value = `_room_${currentRoomIdx}`; // reset dropdown
    return;
  }
  // Create new room from preset
  if (value.startsWith('_new_')) {
    const name = value.slice(5);
    collectActiveAssessmentState();
    const assessments = ensureAssessments();
    const a = assessments.find(x => x.id === assessmentId);
    if (!a) return;
    a.rooms.push(newRoom(name));
    _activeRoomIdx = a.rooms.length - 1;
    saveImportedData();
    renderEMFEditor(document.getElementById('detail-modal'));
    return;
  }
  // Custom room
  if (value === '_custom') {
    const name = await window.showPromptDialog('Room name:', {
      placeholder: 'e.g. Master Bedroom',
      okLabel: 'Create',
    });
    if (name) {
      collectActiveAssessmentState();
      const assessments = ensureAssessments();
      const a = assessments.find(x => x.id === assessmentId);
      if (!a) return;
      a.rooms.push(newRoom(name));
      _activeRoomIdx = a.rooms.length - 1;
      saveImportedData();
      renderEMFEditor(document.getElementById('detail-modal'));
    } else {
      selectEl.value = `_room_${currentRoomIdx}`;
    }
    return;
  }
  // Reset to current
  selectEl.value = `_room_${currentRoomIdx}`;
}

export function addEMFRoom(assessmentId) {
  collectActiveAssessmentState();
  const assessments = ensureAssessments();
  const a = assessments.find(x => x.id === assessmentId);
  if (!a) return;
  a.rooms.push(newRoom(''));
  _activeRoomIdx = a.rooms.length - 1;
  saveImportedData();
  renderEMFEditor(document.getElementById('detail-modal'));
}

export function removeEMFRoom(assessmentId, roomIdx) {
  collectActiveAssessmentState();
  const assessments = ensureAssessments();
  const a = assessments.find(x => x.id === assessmentId);
  if (!a || a.rooms.length <= 1) return;
  a.rooms.splice(roomIdx, 1);
  if (_activeRoomIdx >= a.rooms.length) _activeRoomIdx = a.rooms.length - 1;
  saveImportedData();
  renderEMFEditor(document.getElementById('detail-modal'));
}

export async function deleteEMFAssessment(id) {
  if (await showConfirmDialog('Delete this EMF assessment? This cannot be undone.')) {
    const assessments = ensureAssessments();
    const idx = assessments.findIndex(x => x.id === id);
    if (idx === -1) return;
    assessments.splice(idx, 1);
    _editingAssessmentId = null;
    if (assessments.length === 0) state.importedData.emfAssessment = null;
    saveImportedData();
    renderEMFEditor(document.getElementById('detail-modal'));
    showNotification('Assessment deleted', 'info');
  }
}

export function updateEMFField(assessmentId, field, value) {
  const assessments = ensureAssessments();
  const a = assessments.find(x => x.id === assessmentId);
  if (a) { applyEMFField(a, field, value); saveImportedData(); }
}

export function updateEMFRoom(assessmentId, roomIdx, field, value) {
  const assessments = ensureAssessments();
  const a = assessments.find(x => x.id === assessmentId);
  if (a && a.rooms[roomIdx]) { a.rooms[roomIdx][field] = value; saveImportedData(); }
  if (field === 'name' || field === 'sleeping') renderEMFEditor(document.getElementById('detail-modal'));
}

export function updateEMFMeasurement(assessmentId, roomIdx, type, value) {
  const assessments = ensureAssessments();
  const a = assessments.find(x => x.id === assessmentId);
  if (!a || !a.rooms[roomIdx]) return;
  applyEMFMeasurementValue(a.rooms[roomIdx], type, value);
  saveImportedData();
  renderEMFEditor(document.getElementById('detail-modal'));
}

export function updateEMFMeter(assessmentId, roomIdx, type, value) {
  const assessments = ensureAssessments();
  const a = assessments.find(x => x.id === assessmentId);
  if (!a || !a.rooms[roomIdx]) return;
  const m = (a.rooms[roomIdx].measurements || {})[type];
  if (m) { m.meter = value || null; saveImportedData(); }
}

function isISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function applyEMFField(assessment, field, value) {
  if (field === 'date') {
    if (isISODate(value)) assessment.date = value;
    return;
  }
  assessment[field] = value;
}

function applyEMFMeasurementValue(room, type, value) {
  if (!room.measurements) room.measurements = {};
  const raw = value == null ? '' : String(value).trim();
  const numVal = raw === '' ? null : parseFloat(raw);
  if (numVal === null || !Number.isFinite(numVal)) {
    delete room.measurements[type];
    return;
  }
  const def = SBM_2015_THRESHOLDS[type];
  if (!def) return;
  room.measurements[type] = {
    value: numVal,
    unit: def.unit,
    meter: (room.measurements[type] || {}).meter || null
  };
}

function collectActiveAssessmentInputs() {
  if (!_editingAssessmentId) return;
  const assessments = ensureAssessments();
  const a = assessments.find(x => x.id === _editingAssessmentId);
  const modal = document.getElementById('detail-modal');
  if (!a || !modal) return;

  for (const field of ['date', 'label', 'consultant', 'note']) {
    const input = modal.querySelector(`[data-emf-field="${field}"]`);
    if (input) applyEMFField(a, field, input.value || '');
  }

  const room = a.rooms?.[_activeRoomIdx];
  if (!room) return;
  const locationInput = modal.querySelector('[data-emf-room-field="location"]');
  if (locationInput) room.location = locationInput.value || '';
  const noteInput = modal.querySelector('[data-emf-room-field="note"]');
  if (noteInput) room.note = noteInput.value || '';
  const sleepingInput = modal.querySelector('[data-emf-room-field="sleeping"]');
  if (sleepingInput) room.sleeping = !!sleepingInput.checked;

  for (const mt of MEASUREMENT_TYPES) {
    const valueInput = modal.querySelector(`[data-emf-measurement-type="${mt.key}"]`);
    if (valueInput) applyEMFMeasurementValue(room, mt.key, valueInput.value);
    const meterInput = modal.querySelector(`[data-emf-meter-type="${mt.key}"]`);
    const measurement = room.measurements?.[mt.key];
    if (meterInput && measurement) measurement.meter = meterInput.value || null;
  }
}

function collectActiveAssessmentState() {
  collectActiveAssessmentInputs();
  collectTags();
}

/** Collect tags from DOM for the active room */
function collectTags() {
  if (!_editingAssessmentId) return;
  const assessments = ensureAssessments();
  const a = assessments.find(x => x.id === _editingAssessmentId);
  if (!a) return;
  const ri = _activeRoomIdx;
  const srcEl = document.getElementById(`emf-sources-${a.id}-${ri}`);
  if (srcEl) a.rooms[ri].sources = Array.from(srcEl.querySelectorAll('.ctx-tag.active')).map(b => b.textContent);
  const mitEl = document.getElementById(`emf-mits-${a.id}-${ri}`);
  if (mitEl) a.rooms[ri].mitigations = Array.from(mitEl.querySelectorAll('.ctx-tag.active')).map(b => b.textContent);
}

// ═══════════════════════════════════════════════
// PDF IMPORT
// ═══════════════════════════════════════════════
const EMF_PARSE_SYSTEM = `You are an EMF assessment report parser. Extract room-by-room electromagnetic field measurements from Building Biology (Baubiologie) assessment reports.

Reference measurement types and their standard units:
${JSON.stringify(Object.fromEntries(Object.entries(SBM_2015_THRESHOLDS).map(([k, v]) => [k, { name: v.name, unit: v.unit }])))}

Unit conversions to apply when needed:
- AC Magnetic: 1 mG = 100 nT (always return nT)
- RF: 1 mW/m² = 1000 µW/m² (always return µW/m²)
- RF: convert from V/m using P = E²/377 if needed

Your task:
1. Find the assessment date (YYYY-MM-DD)
2. Identify the consultant name if present
3. For each room/location measured, extract all available readings
4. Map measurements to the types above (acElectric, acMagnetic, rfMicrowave, dirtyElectricity, dcMagnetic)
5. List identified EMF sources per room
6. List recommended or completed mitigations per room

Return ONLY valid JSON:
{
  "date": "YYYY-MM-DD",
  "consultant": "Name or null",
  "rooms": [
    {
      "name": "Bedroom",
      "location": "bed pillow area",
      "measurements": {
        "acElectric": { "value": 28, "unit": "V/m", "meter": "NFA1000" }
      },
      "sources": ["WiFi router in adjacent room"],
      "mitigations": ["demand switch installed"]
    }
  ],
  "note": "General notes from the report"
}`;

export async function handleEMFPDF(file) {
  if (!hasAIProvider()) {
    showNotification('Configure an AI provider in Settings first', 'error');
    return;
  }

  showNotification('Extracting text from EMF report...', 'info', 3000);

  let pdfText;
  try {
    pdfText = await extractPDFText(file);
  } catch (e) {
    showNotification('Failed to read PDF: ' + e.message, 'error');
    return;
  }

  if (!pdfText || pdfText.trim().length < 20) {
    showNotification('Could not extract text from this PDF. Try a text-based report.', 'error');
    return;
  }

  // PII obfuscation — consultant reports contain client names/addresses
  let textToSend = pdfText;
  const piiAvailable = await checkOllamaPII();
  const reviewEnabled = isPIIReviewEnabled();

  if (piiAvailable && reviewEnabled) {
    const result = await reviewPIIBeforeSend(pdfText, {
      streamFn: (text, onChunk, signal) => sanitizeWithOllamaStreaming(text, onChunk, signal)
    });
    if (result === 'cancel') return;
    textToSend = result;
  } else if (piiAvailable) {
    try {
      textToSend = await sanitizeWithOllama(pdfText);
    } catch { /* fallback to regex */ }
    if (textToSend === pdfText) {
      const { obfuscated } = obfuscatePDFText(pdfText);
      textToSend = obfuscated;
    }
  } else {
    const { obfuscated } = obfuscatePDFText(pdfText);
    textToSend = obfuscated;
  }

  showNotification('AI is analyzing EMF report...', 'info', 5000);

  try {
    const { text } = await callClaudeAPI({
      system: EMF_PARSE_SYSTEM,
      messages: [{ role: 'user', content: textToSend }],
      maxTokens: 4096,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in AI response');
    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.rooms || !Array.isArray(parsed.rooms) || parsed.rooms.length === 0) {
      showNotification('AI could not find EMF measurements in this report', 'error');
      return;
    }

    showEMFImportPreview(parsed);
  } catch (e) {
    showNotification('Failed to parse EMF report: ' + e.message, 'error');
  }
}

function showEMFImportPreview(parsed) {
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  const fmtDate = parsed.date ? new Date(parsed.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date';

  let html = `<button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
    <h3>EMF Report Preview</h3>
    <div class="modal-unit">${fmtDate}${parsed.consultant ? ' — by ' + escapeHTML(parsed.consultant) : ''}</div>`;

  for (const room of parsed.rooms) {
    html += `<div class="emf-room-card">
      <div class="emf-room-header"><strong>${escapeHTML(room.name)}</strong>
        ${room.location ? `<span style="color:var(--text-muted);font-size:12px">${escapeHTML(room.location)}</span>` : ''}
      </div>
      <div class="emf-measurements">`;
    for (const mt of MEASUREMENT_TYPES) {
      const m = (room.measurements || {})[mt.key];
      if (!m) continue;
      const def = SBM_2015_THRESHOLDS[mt.key];
      const sleeping = SLEEPING_ROOMS.has(room.name);
      const sev = getEMFSeverity(mt.key, m.value, sleeping);
      html += `<div class="emf-measurement-row">
        <span class="emf-measurement-label">${mt.short}</span>
        <span style="font-weight:600">${m.value}</span>
        <span class="emf-measurement-unit">${def.unit}</span>
        ${sev ? `<span class="emf-severity-dot" style="background:var(--${sev.color})" title="${sev.label}"></span>
        <span style="font-size:11px;color:var(--${sev.color})">${sev.label}</span>` : ''}
      </div>`;
    }
    html += `</div>`;
    if (room.sources && room.sources.length) {
      html += `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">Sources: ${room.sources.map(s => escapeHTML(s)).join(', ')}</div>`;
    }
    if (room.mitigations && room.mitigations.length) {
      html += `<div style="font-size:12px;color:var(--text-muted)">Mitigations: ${room.mitigations.map(s => escapeHTML(s)).join(', ')}</div>`;
    }
    html += `</div>`;
  }

  html += `<div class="ctx-editor-actions">
    <button class="import-btn import-btn-primary" id="emf-confirm-btn">Confirm Import</button>
    <button class="import-btn import-btn-secondary" onclick="closeModal()">Cancel</button>
  </div>`;

  modal.innerHTML = html;
  overlay.classList.add('show');

  document.getElementById('emf-confirm-btn').addEventListener('click', () => {
    const assessments = ensureAssessments();
    const assessment = {
      id: 'emf_' + Date.now(),
      date: parsed.date || new Date().toISOString().slice(0, 10),
      label: '',
      consultant: parsed.consultant || '',
      rooms: parsed.rooms.map(r => ({
        name: r.name || 'Unknown',
        location: r.location || '',
        sleeping: SLEEPING_ROOMS.has(r.name || 'Unknown'),
        measurements: r.measurements || {},
        sources: r.sources || [],
        mitigations: r.mitigations || [],
        note: ''
      })),
      note: parsed.note || ''
    };
    // Ensure units are set on measurements
    for (const room of assessment.rooms) {
      for (const [type, m] of Object.entries(room.measurements || {})) {
        const def = SBM_2015_THRESHOLDS[type];
        if (def && m) m.unit = def.unit;
      }
    }
    assessments.push(assessment);
    saveImportedData();
    showNotification('EMF assessment imported', 'success');
    _editingAssessmentId = assessment.id;
    renderEMFEditor(modal);
  });
}

// ═══════════════════════════════════════════════
// BEFORE / AFTER COMPARISON
// ═══════════════════════════════════════════════
let _compareMode = false;

export function toggleEMFCompare() {
  collectActiveAssessmentState();
  _compareMode = !_compareMode;
  _editingAssessmentId = null;
  renderEMFEditor(document.getElementById('detail-modal'));
}

function renderComparisonView(sorted) {
  // Pick two most recent by default
  const a1 = sorted[sorted.length > 1 ? 1 : 0]; // older (Before)
  const a2 = sorted[0]; // newer (After)
  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Collect all unique room names across both assessments
  const roomNames = [...new Set([...a1.rooms.map(r => r.name), ...a2.rooms.map(r => r.name)])];

  let html = `<div class="emf-compare-header">
    <span class="emf-compare-label">Before: ${fmtDate(a1.date)}${a1.label ? ' — ' + escapeHTML(a1.label) : ''}</span>
    <span class="emf-compare-arrow">→</span>
    <span class="emf-compare-label">After: ${fmtDate(a2.date)}${a2.label ? ' — ' + escapeHTML(a2.label) : ''}</span>
  </div>`;

  if (sorted.length > 2) {
    html += `<div class="emf-compare-note">Comparing the two most recent assessments. ${sorted.length - 2} earlier assessment${sorted.length > 3 ? 's' : ''} not shown.</div>`;
  }

  html += `<div class="emf-compare-table"><table>
    <thead><tr><th>Room</th>`;
  for (const mt of MEASUREMENT_TYPES) {
    html += `<th>${mt.short}</th>`;
  }
  html += `</tr></thead><tbody>`;

  for (const name of roomNames) {
    const r1 = a1.rooms.find(r => r.name === name);
    const r2 = a2.rooms.find(r => r.name === name);
    const sleeping = (r2 || r1)?.sleeping !== false;

    html += `<tr><td class="emf-compare-room">${escapeHTML(name)}</td>`;
    for (const mt of MEASUREMENT_TYPES) {
      const m1 = r1?.measurements?.[mt.key];
      const m2 = r2?.measurements?.[mt.key];
      const v1 = m1?.value;
      const v2 = m2?.value;

      if (v1 == null && v2 == null) {
        html += `<td class="emf-compare-cell">—</td>`;
        continue;
      }

      const sev1 = v1 != null ? getEMFSeverity(mt.key, v1, sleeping) : null;
      const sev2 = v2 != null ? getEMFSeverity(mt.key, v2, sleeping) : null;

      let cellHtml = '';
      if (v1 != null && v2 != null) {
        const delta = v2 - v1;
        const arrow = delta < 0 ? '↓' : delta > 0 ? '↑' : '=';
        const arrowColor = delta < 0 ? 'var(--green)' : delta > 0 ? 'var(--red)' : 'var(--text-muted)';
        cellHtml = `<span style="color:var(--${sev1?.color || 'text-muted'})">${v1}</span>
          <span style="color:${arrowColor};font-weight:600">${arrow}</span>
          <span style="color:var(--${sev2?.color || 'text-muted'})">${v2}</span>`;
      } else if (v2 != null) {
        cellHtml = `<span style="color:var(--text-muted)">—</span> → <span style="color:var(--${sev2?.color || 'text-muted'})">${v2}</span>`;
      } else {
        cellHtml = `<span style="color:var(--${sev1?.color || 'text-muted'})">${v1}</span> → <span style="color:var(--text-muted)">—</span>`;
      }
      html += `<td class="emf-compare-cell">${cellHtml}</td>`;
    }
    html += `</tr>`;
  }

  html += `</tbody></table></div>`;

  if (hasAIProvider()) {
    html += `<div style="margin-top:12px">
      <button class="import-btn import-btn-secondary" onclick="interpretEMFComparison()">Interpret Changes</button>
    </div>`;
  }
  return html;
}

// ═══════════════════════════════════════════════
// AI INTERPRETATION
// ═══════════════════════════════════════════════
let _aiAbortController = null;

function serializeAssessment(a) {
  const fmtDate = new Date(a.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  let text = `Assessment: ${fmtDate}${a.label ? ' (' + a.label + ')' : ''}${a.consultant ? ' by ' + a.consultant : ''}\n`;
  for (const room of a.rooms) {
    const sleeping = room.sleeping !== false;
    text += `  ${room.name}${room.location ? ' (' + room.location + ')' : ''} [${sleeping ? 'sleeping area' : 'daytime area'}]:\n`;
    for (const [type, m] of Object.entries(room.measurements || {})) {
      if (m && m.value != null) {
        const def = SBM_2015_THRESHOLDS[type];
        const sev = getEMFSeverity(type, m.value, sleeping);
        text += `    ${def.name}: ${m.value} ${def.unit}${sev ? ' — ' + sev.label : ''}${m.meter ? ' (meter: ' + m.meter + ')' : ''}\n`;
      }
    }
    if (room.sources?.length) text += `    Sources: ${room.sources.join(', ')}\n`;
    if (room.mitigations?.length) text += `    Mitigations: ${room.mitigations.join(', ')}\n`;
  }
  if (a.note) text += `Notes: ${a.note}\n`;
  return text;
}

/** Strip OpenRouter-style <think>…</think> blocks */
function stripThinking(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '').trim();
}

const EMF_SYSTEM = `You are a Baubiologie (Building Biology) consultant interpreting EMF assessment data rated against SBM-2015 standards. Be specific about health implications, prioritize concerns by severity (sleeping areas are most critical), and suggest actionable mitigations in priority order. Keep the response concise and practical. Use markdown formatting with headers and bullet points.`;

function openInterpretationModal(title, existingInterp, onGenerate, onSave, mitigationTags = []) {
  // Create overlay that sits on top of the EMF editor (z-index above modal-overlay)
  let overlay = document.getElementById('emf-interp-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'emf-interp-overlay';
    overlay.className = 'emf-interp-overlay';
    document.body.appendChild(overlay);
  }

  const hasExisting = existingInterp && existingInterp.text;

  let html = `<div class="emf-interp-modal">
    <div class="emf-interp-header">
      <h3>${escapeHTML(title)}</h3>
      <button class="modal-close" aria-label="Close" onclick="closeEMFInterpretation()">&times;</button>
    </div>
    <div class="emf-interp-body" id="emf-interp-body">
      ${hasExisting ? renderMarkdown(existingInterp.text) : '<div class="emf-interp-placeholder">Click Interpret to get an AI interpretation of this assessment.</div>'}
    </div>
    <div id="emf-interp-recs"></div>
    <div class="emf-interp-footer">
      <div id="emf-interp-meta" class="emf-interp-meta">
        ${hasExisting ? buildMetaLine(existingInterp) : ''}
      </div>
      <div class="emf-interp-actions">
        <button class="import-btn import-btn-primary" id="emf-interp-generate">${hasExisting ? 'Re-interpret' : 'Interpret'}</button>
        ${hasExisting ? `<button class="import-btn import-btn-secondary" onclick="discussEMFInterpretation()">Discuss in Chat</button>` : ''}
        <button class="import-btn import-btn-secondary" onclick="closeEMFInterpretation()">Close</button>
      </div>
    </div>
  </div>`;

  overlay.innerHTML = html;
  overlay.classList.add('show');

  // Close on backdrop click (but not drag-from-inside, #87)
  let mdInside = false;
  overlay.onmousedown = (e) => { mdInside = e.target !== overlay; };
  overlay.onclick = (e) => {
    if (e.target === overlay && !mdInside) closeEMFInterpretation();
    mdInside = false;
  };

  // Store context for discuss button
  overlay._interpretText = hasExisting ? existingInterp.text : '';
  overlay._onSave = onSave;

  document.getElementById('emf-interp-generate').addEventListener('click', () => {
    const btn = document.getElementById('emf-interp-generate');
    btn.disabled = true;
    btn.textContent = 'Interpreting…';
    onGenerate(onSave);
  });

  // Populate mitigation product recs alongside the AI interpretation
  if (mitigationTags && mitigationTags.length && isProductRecsEnabled()) {
    const recSlot = document.getElementById('emf-interp-recs');
    if (recSlot) {
      loadEMFCatalog().then(cat => {
        if (cat && document.getElementById('emf-interp-recs') === recSlot) {
          recSlot.innerHTML = renderEMFMitigationRecs(cat, mitigationTags, { heading: 'Products to consider' });
        }
      });
    }
  }
}

function buildMetaLine(interp) {
  if (!interp) return '';
  const parts = [];
  if (interp.model) parts.push(interp.model);
  if (interp.inputTokens || interp.outputTokens) {
    const cost = calculateCost(interp.provider || '', interp.modelId || '', interp.inputTokens || 0, interp.outputTokens || 0);
    const total = (interp.inputTokens || 0) + (interp.outputTokens || 0);
    parts.push(`${formatCost(cost)} · ${total.toLocaleString()} tokens`);
  }
  if (interp.date) {
    parts.push(new Date(interp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
  }
  return parts.length ? escapeHTML(parts.join(' · ')) : '';
}

function streamInterpretation(prompt, onComplete) {
  if (_aiAbortController) _aiAbortController.abort();
  _aiAbortController = new AbortController();

  const body = document.getElementById('emf-interp-body');
  const meta = document.getElementById('emf-interp-meta');
  if (!body) return;

  body.innerHTML = '<div class="emf-interp-placeholder">Thinking…</div>';
  if (meta) meta.textContent = '';

  let lastRender = 0;
  const THROTTLE_MS = 150;

  const provider = getAIProvider();
  const modelId = getActiveModelId();
  const modelDisplay = getActiveModelDisplay();

  callClaudeAPI({
    messages: [{ role: 'user', content: prompt }],
    system: EMF_SYSTEM,
    signal: _aiAbortController.signal,
    onStream(fullText) {
      const now = Date.now();
      if (now - lastRender < THROTTLE_MS) return;
      lastRender = now;
      const clean = stripThinking(fullText);
      if (clean) body.innerHTML = renderMarkdown(clean);
    }
  }).then(response => {
    _aiAbortController = null;
    const finalText = stripThinking(response?.text || '');
    const usage = response?.usage || {};
    body.innerHTML = finalText ? renderMarkdown(finalText) : '<div class="emf-interp-placeholder">No response received.</div>';

    const interp = {
      text: finalText,
      model: modelDisplay,
      provider,
      modelId,
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      date: new Date().toISOString()
    };
    trackUsage(provider, modelId, usage.inputTokens || 0, usage.outputTokens || 0);

    if (meta) meta.innerHTML = buildMetaLine(interp);

    // Update generate button
    const btn = document.getElementById('emf-interp-generate');
    if (btn) { btn.disabled = false; btn.textContent = 'Re-interpret'; }

    // Add discuss button if not present
    const actions = document.querySelector('.emf-interp-actions');
    if (actions && !actions.querySelector('[onclick*="discussEMF"]')) {
      const discussBtn = document.createElement('button');
      discussBtn.className = 'import-btn import-btn-secondary';
      discussBtn.textContent = 'Discuss in Chat';
      discussBtn.onclick = () => window.discussEMFInterpretation();
      actions.appendChild(discussBtn);
    }

    // Store for discuss
    const overlay = document.getElementById('emf-interp-overlay');
    if (overlay) overlay._interpretText = finalText;

    if (onComplete) onComplete(interp);
  }).catch(err => {
    _aiAbortController = null;
    if (err.name === 'AbortError') return;
    body.innerHTML = `<div style="color:var(--red);padding:12px">Error: ${escapeHTML(err.message)}</div>`;
    const btn = document.getElementById('emf-interp-generate');
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  });
}

export function closeEMFInterpretation() {
  if (_aiAbortController) { _aiAbortController.abort(); _aiAbortController = null; }
  const overlay = document.getElementById('emf-interp-overlay');
  if (overlay) { overlay.classList.remove('show'); overlay.innerHTML = ''; }
}

export function discussEMFInterpretation() {
  const overlay = document.getElementById('emf-interp-overlay');
  const text = overlay?._interpretText;
  if (!text) return;
  closeEMFInterpretation();
  window.closeModal();
  window.openChatPanel(`I'd like to discuss this EMF assessment interpretation further. Here's the interpretation:\n\n${text}\n\nWhat questions should I prioritize, and what are the most important next steps?`);
}

function _collectMitigationTags(assessment) {
  if (!assessment?.rooms) return [];
  const seen = new Set();
  const out = [];
  // 1) User-tagged mitigation chips on each room (explicit signal)
  for (const room of assessment.rooms) {
    for (const t of (room.mitigations || [])) {
      if (!seen.has(t)) { seen.add(t); out.push(t); }
    }
  }
  // 2) Mitigations the AI interpretation text mentions, even if no chip was set —
  // catches the common case where a freshly-imported consultant PDF surfaces
  // recommended mitigations in the AI's prose but the room's chip array is empty.
  const interpText = assessment.interpretation?.text;
  if (interpText) {
    for (const t of detectMitigationsInText(interpText)) {
      if (!seen.has(t)) { seen.add(t); out.push(t); }
    }
  }
  return out;
}

export function interpretEMFAssessment(assessmentId) {
  collectActiveAssessmentState();
  const assessments = ensureAssessments();
  const a = assessments.find(x => x.id === assessmentId);
  if (!a) return;

  const fmtDate = new Date(a.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const title = `EMF Interpretation — ${fmtDate}${a.label ? ' (' + a.label + ')' : ''}`;
  const data = serializeAssessment(a);
  const tags = _collectMitigationTags(a);

  openInterpretationModal(title, a.interpretation, (onSave) => {
    const prompt = `Interpret this Baubiologie EMF assessment. Identify the most concerning readings, explain health implications (especially for sleeping areas), and recommend specific mitigations in priority order.\n\n${data}`;
    streamInterpretation(prompt, (interp) => {
      a.interpretation = interp;
      saveImportedData();
    });
  }, null, tags);
}

export function interpretEMFComparison() {
  collectActiveAssessmentState();
  const assessments = ensureAssessments();
  const sorted = [...assessments].sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length < 2) return;

  const emf = state.importedData.emfAssessment;
  const title = 'EMF Comparison — Before vs After';
  const before = serializeAssessment(sorted[1]);
  const after = serializeAssessment(sorted[0]);
  const tags = [..._collectMitigationTags(sorted[0]), ..._collectMitigationTags(sorted[1])];
  const dedup = [];
  const seen = new Set();
  for (const t of tags) { if (!seen.has(t)) { seen.add(t); dedup.push(t); } }

  openInterpretationModal(title, emf.comparisonInterpretation, (onSave) => {
    const prompt = `Compare these two Baubiologie EMF assessments (before and after). Evaluate what improved, what worsened, and what still needs attention. Prioritize remaining concerns and suggest next steps.\n\nBEFORE:\n${before}\nAFTER:\n${after}`;
    streamInterpretation(prompt, (interp) => {
      emf.comparisonInterpretation = interp;
      saveImportedData();
    });
  }, null, dedup);
}

// ═══════════════════════════════════════════════
// ROOM PHOTOS
// ═══════════════════════════════════════════════
export async function addEMFPhotos(assessmentId, roomIdx, files) {
  const assessments = ensureAssessments();
  const a = assessments.find(x => x.id === assessmentId);
  if (!a || !a.rooms[roomIdx]) return;
  const room = a.rooms[roomIdx];
  if (!room.photos) room.photos = [];

  for (const file of files) {
    if (!isValidImageType(file.type)) continue;
    if (room.photos.length >= 6) { showNotification('Max 6 photos per room', 'warning'); break; }
    try {
      const { base64, mediaType } = await resizeImage(file, 800, 0.8);
      room.photos.push({ name: file.name, base64, mediaType });
    } catch { /* skip unreadable */ }
  }
  saveImportedData();
  renderEMFEditor(document.getElementById('detail-modal'));
}

export function removeEMFPhoto(assessmentId, roomIdx, photoIdx) {
  const assessments = ensureAssessments();
  const a = assessments.find(x => x.id === assessmentId);
  if (!a || !a.rooms[roomIdx]) return;
  const photos = a.rooms[roomIdx].photos;
  if (photos && photos[photoIdx]) {
    photos.splice(photoIdx, 1);
    saveImportedData();
    renderEMFEditor(document.getElementById('detail-modal'));
  }
}

export function viewEMFPhoto(assessmentId, roomIdx, photoIdx) {
  const assessments = ensureAssessments();
  const a = assessments.find(x => x.id === assessmentId);
  if (!a || !a.rooms[roomIdx]) return;
  const photo = (a.rooms[roomIdx].photos || [])[photoIdx];
  if (!photo) return;
  // Simple lightbox using the existing modal overlay pattern
  const overlay = document.createElement('div');
  overlay.className = 'emf-lightbox';
  overlay.onclick = () => overlay.remove();
  overlay.innerHTML = `<img src="data:${safeMediaType(photo.mediaType)};base64,${photo.base64}" alt="${escapeHTML(photo.name || 'Photo')}">`;
  document.body.appendChild(overlay);
}

// ═══════════════════════════════════════════════
// WINDOW EXPORTS
// ═══════════════════════════════════════════════
export function saveEMFExplicit() {
  collectActiveAssessmentState();
  saveImportedData();
  showNotification('EMF assessment saved', 'success');
}

Object.assign(window, {
  openEMFAssessmentEditor,
  addEMFAssessment,
  toggleEMFAssessment,
  selectEMFRoom,
  handleEMFRoomDropdown,
  addEMFRoom,
  removeEMFRoom,
  deleteEMFAssessment,
  updateEMFField,
  updateEMFRoom,
  updateEMFMeasurement,
  updateEMFMeter,
  saveEMFExplicit,
  toggleEMFCompare,
  interpretEMFAssessment,
  interpretEMFComparison,
  closeEMFInterpretation,
  discussEMFInterpretation,
  addEMFPhotos,
  removeEMFPhoto,
  viewEMFPhoto,
  handleEMFPDF,
});
