import { configureRuntimeFunctions } from './runtime-callbacks.js';
// emf.js — Baubiologie EMF Assessment sub-module
// Room-by-room EMF measurements with SBM-2015 severity ratings

import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { SBM_2015_THRESHOLDS } from './schema.js';
import {
  escapeHTML,
  showNotification,
  showConfirmDialog,
  showPromptDialog,
  isPIIReviewEnabled,
} from './utils.js';
import { saveImportedData } from './data.js';
import { resizeImage, isValidImageType } from './image-utils.js';
import { callAssistantFeatureAI, hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { extractPDFText } from './pdf-import.js';
import { obfuscatePDFText, sanitizeWithOllama, sanitizeWithOllamaStreaming, checkOllamaPII, reviewPIIBeforeSend } from './pii.js';
import { openModalOverlay, removeModalOverlay, trapModalFocus } from './modal-lifecycle.js';
import { createUniqueId } from './unique-id.js';
import {
  configureEMFEditor,
  emfEditorState,
  openEMFAssessmentEditor,
  renderEMFEditor,
  showEMFImportPreview,
} from './emf-editor.js';
import {
  MEASUREMENT_TYPES,
  SLEEPING_ROOMS,
  ensureEMFAssessments as ensureAssessments,
  safeEMFMediaType as safeMediaType,
} from './emf-model.js';
import {
  closeEMFInterpretation,
  discussEMFInterpretation,
  interpretEMFAssessment as interpretEMFAssessmentImpl,
  interpretEMFComparison as interpretEMFComparisonImpl,
} from './emf-interpretation.js';

import type { AssessmentMutationOperations, RoomMutationOperations, RawAIRegistry, AIInvocationOperations, ConfigureAIFunctionsReader, RawRuntimeRegistry, RuntimeUpdates, PDFResponseOperations, MatchOperations } from '../types/emf-controller.js';
import type { PreviewInput } from '../types/emf-editor.js';

const emfAIDeps: RawAIRegistry = {
  callClaudeAPI: callAssistantFeatureAI,
  hasAIProvider: hasAssistantFeatureProvider,
};

const emfRuntimeDeps: RawRuntimeRegistry = {
  closeModal: null,
};

export function configureEMFAIDeps(deps: unknown = {}) {
  return (configureRuntimeFunctions as ConfigureAIFunctionsReader)(emfAIDeps, deps, ["callClaudeAPI","hasAIProvider"]);
}

export function configureEMFRuntimeDeps(deps: unknown = {}) {
  const previous = { ...emfRuntimeDeps };
  if (Object.hasOwn(deps as object, 'closeModal')) {
    emfRuntimeDeps.closeModal = typeof (deps as RuntimeUpdates).closeModal === 'function' ? (deps as RuntimeUpdates).closeModal : null;
  }
  return previous;
}

export { openEMFAssessmentEditor };

function newRoom(name: unknown): RoomMutationOperations {
  return {
    name: name || 'Bedroom',
    location: '',
    sleeping: SLEEPING_ROOMS.has((name || 'Bedroom') as string),
    measurements: {},
    sources: [],
    mitigations: [],
    note: ''
  };
}

function newAssessment(): AssessmentMutationOperations {
  return {
    id: createUniqueId('emf_'),
    date: new Date().toISOString().slice(0, 10),
    label: '',
    consultant: '',
    rooms: [newRoom('Bedroom')],
    note: ''
  };
}

// ═══════════════════════════════════════════════
// CRUD OPERATIONS
// ═══════════════════════════════════════════════
export function addEMFAssessment() {
  const assessments = ensureAssessments() as AssessmentMutationOperations[];
  const a = newAssessment();
  assessments.push(a);
  emfEditorState.editingAssessmentId = a.id;
  renderEMFEditor(document.getElementById('detail-modal'));
}

export function toggleEMFAssessment(id: unknown) {
  collectActiveAssessmentState();
  emfEditorState.editingAssessmentId = emfEditorState.editingAssessmentId === id ? null : id;
  emfEditorState.activeRoomIdx = 0;
  renderEMFEditor(document.getElementById('detail-modal'));
}

export function selectEMFRoom(assessmentId: unknown, roomIdx: number) {
  // Ignore a stale delegated click after another assessment has become active.
  if (emfEditorState.editingAssessmentId !== assessmentId) return;
  collectActiveAssessmentState();
  emfEditorState.activeRoomIdx = roomIdx;
  renderEMFEditor(document.getElementById('detail-modal'));
}

export async function handleEMFRoomDropdown(assessmentId: unknown, currentRoomIdx: number, value: string, selectEl: {value: string}) {
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
    const assessments = ensureAssessments() as AssessmentMutationOperations[];
    const a = assessments.find(x => x.id === assessmentId);
    if (!a) return;
    a.rooms.push(newRoom(name));
    emfEditorState.activeRoomIdx = a.rooms.length - 1;
    saveImportedData();
    renderEMFEditor(document.getElementById('detail-modal'));
    return;
  }
  // Custom room
  if (value === '_custom') {
    const name = await showPromptDialog('Room name:', {
      placeholder: 'e.g. Master Bedroom',
      okLabel: 'Create',
    });
    if (name) {
      collectActiveAssessmentState();
      const assessments = ensureAssessments() as AssessmentMutationOperations[];
      const a = assessments.find(x => x.id === assessmentId);
      if (!a) return;
      a.rooms.push(newRoom(name));
      emfEditorState.activeRoomIdx = a.rooms.length - 1;
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

export function addEMFRoom(assessmentId: unknown) {
  collectActiveAssessmentState();
  const assessments = ensureAssessments() as AssessmentMutationOperations[];
  const a = assessments.find(x => x.id === assessmentId);
  if (!a) return;
  a.rooms.push(newRoom(''));
  emfEditorState.activeRoomIdx = a.rooms.length - 1;
  saveImportedData();
  renderEMFEditor(document.getElementById('detail-modal'));
}

export function removeEMFRoom(assessmentId: unknown, roomIdx: number) {
  collectActiveAssessmentState();
  const assessments = ensureAssessments() as AssessmentMutationOperations[];
  const a = assessments.find(x => x.id === assessmentId);
  if (!a || a.rooms.length <= 1) return;
  a.rooms.splice(roomIdx, 1);
  if (emfEditorState.activeRoomIdx >= a.rooms.length) {
    emfEditorState.activeRoomIdx = a.rooms.length - 1;
  }
  saveImportedData();
  renderEMFEditor(document.getElementById('detail-modal'));
}

export async function deleteEMFAssessment(id: unknown) {
  if (await showConfirmDialog('Delete this EMF assessment? This cannot be undone.')) {
    const assessments = ensureAssessments() as AssessmentMutationOperations[];
    const idx = assessments.findIndex(x => x.id === id);
    if (idx === -1) return;
    assessments.splice(idx, 1);
    emfEditorState.editingAssessmentId = null;
    if (assessments.length === 0) state.importedData.emfAssessment = null;
    saveImportedData();
    renderEMFEditor(document.getElementById('detail-modal'));
    showNotification('Assessment deleted', 'info');
  }
}

export function updateEMFField(assessmentId: unknown, field: string, value: unknown) {
  const assessments = ensureAssessments() as AssessmentMutationOperations[];
  const a = assessments.find(x => x.id === assessmentId);
  if (a) { applyEMFField(a, field, value); saveImportedData(); }
}

export function updateEMFRoom(assessmentId: unknown, roomIdx: number, field: string, value: unknown) {
  const assessments = ensureAssessments() as AssessmentMutationOperations[];
  const a = assessments.find(x => x.id === assessmentId);
  if (a && a.rooms[roomIdx]!) { a.rooms[roomIdx]![field] = value; saveImportedData(); }
  if (field === 'name' || field === 'sleeping') renderEMFEditor(document.getElementById('detail-modal'));
}

export function updateEMFMeasurement(assessmentId: unknown, roomIdx: number, type: string, value: unknown) {
  const assessments = ensureAssessments() as AssessmentMutationOperations[];
  const a = assessments.find(x => x.id === assessmentId);
  if (!a || !a.rooms[roomIdx]!) return;
  applyEMFMeasurementValue(a.rooms[roomIdx]!, type, value);
  saveImportedData();
  renderEMFEditor(document.getElementById('detail-modal'));
}

export function updateEMFMeter(assessmentId: unknown, roomIdx: number, type: string, value: unknown) {
  const assessments = ensureAssessments() as AssessmentMutationOperations[];
  const a = assessments.find(x => x.id === assessmentId);
  if (!a || !a.rooms[roomIdx]!) return;
  const m = (a.rooms[roomIdx]!.measurements || {})[type];
  if (m) { m.meter = value || null; saveImportedData(); }
}

function isISODate(value: unknown) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value || '') as string);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function applyEMFField(assessment: AssessmentMutationOperations, field: string, value: unknown) {
  if (field === 'date') {
    if (isISODate(value)) assessment.date = value;
    return;
  }
  assessment[field] = value;
}

function applyEMFMeasurementValue(room: RoomMutationOperations, type: string, value: unknown) {
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
  if (!emfEditorState.editingAssessmentId) return;
  const assessments = ensureAssessments() as AssessmentMutationOperations[];
  const a = assessments.find(x => x.id === emfEditorState.editingAssessmentId);
  const modal = document.getElementById('detail-modal');
  if (!a || !modal) return;

  for (const field of ['date', 'label', 'consultant', 'note']) {
    const input = modal.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-emf-field="${field}"]`);
    if (input) applyEMFField(a, field, input.value || '');
  }

  const room = a.rooms?.[emfEditorState.activeRoomIdx];
  if (!room) return;
  const locationInput = modal.querySelector<HTMLInputElement>('[data-emf-room-field="location"]');
  if (locationInput) room.location = locationInput.value || '';
  const noteInput = modal.querySelector<HTMLInputElement>('[data-emf-room-field="note"]');
  if (noteInput) room.note = noteInput.value || '';
  const sleepingInput = modal.querySelector<HTMLInputElement>('[data-emf-room-field="sleeping"]');
  if (sleepingInput) room.sleeping = !!sleepingInput.checked;

  for (const mt of MEASUREMENT_TYPES) {
    const valueInput = modal.querySelector<HTMLInputElement>(`[data-emf-measurement-type="${mt.key}"]`);
    if (valueInput) applyEMFMeasurementValue(room, mt.key, valueInput.value);
    const meterInput = modal.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-emf-meter-type="${mt.key}"]`);
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
  if (!emfEditorState.editingAssessmentId) return;
  const assessments = ensureAssessments() as AssessmentMutationOperations[];
  const a = assessments.find(x => x.id === emfEditorState.editingAssessmentId);
  if (!a) return;
  const ri = emfEditorState.activeRoomIdx;
  const srcEl = document.getElementById(`emf-sources-${a.id}-${ri}`);
  if (srcEl) a.rooms[ri]!.sources = Array.from(srcEl.querySelectorAll('.ctx-tag.active')).map(b => b.textContent);
  const mitEl = document.getElementById(`emf-mits-${a.id}-${ri}`);
  if (mitEl) a.rooms[ri]!.mitigations = Array.from(mitEl.querySelectorAll('.ctx-tag.active')).map(b => b.textContent);
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

export async function handleEMFPDF(file: Parameters<typeof extractPDFText>[0]) {
  if (!(emfAIDeps as AIInvocationOperations).hasAIProvider()) {
    showNotification('Configure an AI provider in Settings first', 'error');
    return;
  }

  showNotification('Extracting text from EMF report...', 'info', 3000);

  let pdfText: Awaited<ReturnType<typeof extractPDFText>>;
  try {
    pdfText = await extractPDFText(file);
  } catch (e) {
    showNotification('Failed to read PDF: ' + getErrorMessage(e), 'error');
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

  if (piiAvailable.available && reviewEnabled) {
    const { obfuscated } = obfuscatePDFText(pdfText);
    const result = await reviewPIIBeforeSend(pdfText, {
      obfuscatedText: obfuscated,
      streamFn: (onChunk, signal, onThinking) => sanitizeWithOllamaStreaming(pdfText, onChunk, signal, onThinking)
    });
    if (result === 'cancel') return;
    textToSend = result;
  } else if (piiAvailable.available) {
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
    const { text } = await (emfAIDeps as AIInvocationOperations).callClaudeAPI({
      system: EMF_PARSE_SYSTEM,
      messages: [{ role: 'user', content: textToSend }],
      maxTokens: 4096,
    }) as PDFResponseOperations;

    const jsonMatch = (text as MatchOperations).match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in AI response');
    const parsed: unknown = JSON.parse(jsonMatch[0]!);

    if (!(parsed as {rooms?: unknown}).rooms || !Array.isArray((parsed as {rooms?: unknown}).rooms) || ((parsed as {rooms?: unknown}).rooms as {length: number}).length === 0) {
      showNotification('AI could not find EMF measurements in this report', 'error');
      return;
    }

    showEMFImportPreview(parsed as PreviewInput);
  } catch (e) {
    showNotification('Failed to parse EMF report: ' + getErrorMessage(e), 'error');
  }
}

export function toggleEMFCompare() {
  collectActiveAssessmentState();
  emfEditorState.compareMode = !emfEditorState.compareMode;
  emfEditorState.editingAssessmentId = null;
  renderEMFEditor(document.getElementById('detail-modal'));
}

// ═══════════════════════════════════════════════
// AI INTERPRETATION WRAPPERS
// ═══════════════════════════════════════════════
export { closeEMFInterpretation, discussEMFInterpretation };

function getEMFInterpretationDeps() {
  return {
    collectActiveAssessmentState,
    getAssessments: ensureAssessments
  };
}

export function interpretEMFAssessment(assessmentId: unknown) {
  interpretEMFAssessmentImpl(assessmentId, getEMFInterpretationDeps());
}

export function interpretEMFComparison() {
  interpretEMFComparisonImpl(getEMFInterpretationDeps());
}

// ═══════════════════════════════════════════════
// ROOM PHOTOS
// ═══════════════════════════════════════════════
export async function addEMFPhotos(assessmentId: unknown, roomIdx: number, files: Iterable<File>) {
  const assessments = ensureAssessments() as AssessmentMutationOperations[];
  const a = assessments.find(x => x.id === assessmentId);
  if (!a || !a.rooms[roomIdx]!) return;
  const room = a.rooms[roomIdx]!;
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

export function removeEMFPhoto(assessmentId: unknown, roomIdx: number, photoIdx: number) {
  const assessments = ensureAssessments() as AssessmentMutationOperations[];
  const a = assessments.find(x => x.id === assessmentId);
  if (!a || !a.rooms[roomIdx]!) return;
  const photos = a.rooms[roomIdx]!.photos;
  if (photos && photos[photoIdx]) {
    photos.splice(photoIdx, 1);
    saveImportedData();
    renderEMFEditor(document.getElementById('detail-modal'));
  }
}

export function viewEMFPhoto(assessmentId: unknown, roomIdx: number, photoIdx: number) {
  const assessments = ensureAssessments() as AssessmentMutationOperations[];
  const a = assessments.find(x => x.id === assessmentId);
  if (!a || !a.rooms[roomIdx]!) return;
  const photo = (a.rooms[roomIdx]!.photos || [])[photoIdx];
  if (!photo) return;
  // Simple lightbox using the existing modal overlay pattern
  const overlay = document.createElement('div');
  overlay.className = 'emf-lightbox';
  overlay.addEventListener('click', () => removeModalOverlay(overlay));
  overlay.innerHTML = `<img src="data:${safeMediaType(photo.mediaType)};base64,${photo.base64}" alt="${escapeHTML(photo.name || 'Photo')}">`;
  document.body.appendChild(overlay);
  openModalOverlay(overlay);
  try { trapModalFocus(overlay); } catch (_) {}
}

export function saveEMFExplicit() {
  collectActiveAssessmentState();
  saveImportedData();
  showNotification('EMF assessment saved', 'success');
}

configureEMFEditor({
  addEMFAssessment,
  addEMFPhotos,
  addEMFRoom,
  closeModal: () => (emfRuntimeDeps as {closeModal?: (() => unknown) | null}).closeModal?.(),
  collectActiveAssessmentState,
  deleteEMFAssessment,
  handleEMFPDF,
  handleEMFRoomDropdown,
  hasAIProvider: () => (emfAIDeps as AIInvocationOperations).hasAIProvider(),
  interpretEMFAssessment,
  interpretEMFComparison,
  removeEMFPhoto,
  removeEMFRoom,
  saveEMFExplicit,
  selectEMFRoom,
  toggleEMFAssessment,
  toggleEMFCompare,
  updateEMFField,
  updateEMFMeasurement,
  updateEMFMeter,
  updateEMFRoom,
  viewEMFPhoto,
});
