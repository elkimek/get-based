import {renderEMFPhoto, type EMFPhotoView} from './emf-photo-presentation.js';
import { configureRuntimeFunctions } from './runtime-callbacks.js';
// emf.js — Baubiologie EMF Assessment sub-module
// Room-by-room EMF measurements with SBM-2015 severity ratings

import type { EMFNativeOwner } from './emf-native-records.js';
import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { SBM_2015_THRESHOLDS } from './schema.js';
import {
  showNotification,
  showConfirmDialog,
  showPromptDialog,
  isPIIReviewEnabled,
} from './utils.js';
import type { ProfileData } from '../types/app-state.js';
import { validAgentDate } from '../shared/agent-data-contract.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { agentDataObject } from '../shared/agent-data-contract.js';
import { emfAssessments, emfRecords, emfRoomId } from './emf-record-fields.js';
import { captureEMFNativeOwner, isEMFNativeOwnerCurrent, stageEMFNativeChange, persistEMFEditorInputs, isEMFNativeSourceCurrent, onEMFRecordChanged } from './emf-native-records.js';
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
  refreshEMFEditorAfterChange,
  showEMFImportPreview,
} from './emf-editor.js';
import {
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
    id: createUniqueId('emfr_'),
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
function assessment(data: ProfileData, id: unknown) {
  const row = emfAssessments(data).find(value => value.id === id); if (!row) throw new Error('This EMF assessment is no longer available.'); return row;
}
function roomId(id: unknown, index: number) {
  return emfRecords(state.importedData, 'emfRooms').find(row => row.assessment.id === id && row.roomIndex === index)?.id;
}
function room(data: ProfileData, id: string | undefined) {
  const row = emfRecords(data, 'emfRooms').find(value => value.id === id); if (!row?.room) throw new Error('This EMF room is no longer available.'); return row.room;
}
async function change(mutate: (data: ProfileData) => void, operation: string, owner = captureEMFNativeOwner(), publish?: () => void) {
  const saved = await stageEMFNativeChange(mutate, operation, owner);
  if (saved && isEMFNativeOwnerCurrent(owner)) { publish?.(); refreshEMFEditorAfterChange(); } return saved;
}
export async function addEMFAssessment() {
  const next = newAssessment();
  return change(data => { data.emfAssessment ||= { assessments: [] }; emfAssessments(data).push(next); }, 'add-assessment', undefined, () => { emfEditorState.editingAssessmentId = next.id; emfEditorState.activeRoomIdx = 0; });
}
export async function toggleEMFAssessment(id: unknown) {
  const owner = captureEMFNativeOwner(); if (!await persistEMFEditorInputs() || !isEMFNativeOwnerCurrent(owner)) return false;
  emfEditorState.editingAssessmentId = emfEditorState.editingAssessmentId === id ? null : id; emfEditorState.activeRoomIdx = 0; refreshEMFEditorAfterChange(); return true;
}
export async function selectEMFRoom(assessmentId: unknown, index: number) {
  if (emfEditorState.editingAssessmentId !== assessmentId) return false;
  const owner = captureEMFNativeOwner(); if (!await persistEMFEditorInputs() || !isEMFNativeOwnerCurrent(owner)) return false;
  const rooms = assessment(state.importedData, assessmentId).rooms; if (!Array.isArray(rooms) || !Number.isInteger(index) || index < 0 || index >= rooms.length) return false;
  emfEditorState.activeRoomIdx = index; refreshEMFEditorAfterChange(); return true;
}
export async function handleEMFRoomDropdown(assessmentId: unknown, currentRoomIdx: number, value: string, selectEl: { value: string }) {
  if (value.startsWith('_room_')) { const index = Number(value.slice(6)); if (index !== currentRoomIdx) return selectEMFRoom(assessmentId, index); selectEl.value = `_room_${currentRoomIdx}`; return true; }
  const initialOwner = captureEMFNativeOwner(); if (!await persistEMFEditorInputs() || !isEMFNativeOwnerCurrent(initialOwner)) return false;
  const owner = captureEMFNativeOwner(true);
  let name: unknown;
  if (value.startsWith('_new_')) name = value.slice(5);
  else if (value === '_custom') name = await showPromptDialog('Room name:', { placeholder: 'e.g. Master Bedroom', okLabel: 'Create' });
  if (!name || !isEMFNativeOwnerCurrent(owner)) { if (isEMFNativeOwnerCurrent(owner)) selectEl.value = `_room_${currentRoomIdx}`; return false; }
  return change(data => { const row = assessment(data, assessmentId); if (!Array.isArray(row.rooms)) throw new Error('Review this room collection first.'); row.rooms.push(newRoom(name)); }, 'add-room', owner, () => { emfEditorState.activeRoomIdx = (assessment(state.importedData, assessmentId).rooms as unknown[]).length - 1; });
}
export async function addEMFRoom(assessmentId: unknown) {
  return change(data => { const row = assessment(data, assessmentId); if (!Array.isArray(row.rooms)) throw new Error('Review this room collection first.'); row.rooms.push(newRoom('')); }, 'add-room', undefined, () => { emfEditorState.activeRoomIdx = (assessment(state.importedData, assessmentId).rooms as unknown[]).length - 1; });
}
export async function removeEMFRoom(assessmentId: unknown, index: number) {
  const target = roomId(assessmentId, index);
  return change(data => {
    const row = assessment(data, assessmentId); if (!Array.isArray(row.rooms) || row.rooms.length <= 1) throw new Error('Remove the assessment to remove its last room.');
    const rooms = row.rooms.map(agentDataObject); for (const [position, value] of rooms.entries()) value.id = emfRoomId(String(row.id), value, position);
    const at = rooms.findIndex(value => value.id === target); if (at < 0) throw new Error('This EMF room changed.'); row.rooms.splice(at, 1);
  }, 'remove-room', undefined, () => { const length = (assessment(state.importedData, assessmentId).rooms as unknown[]).length; emfEditorState.activeRoomIdx = Math.min(emfEditorState.activeRoomIdx, length - 1); });
}
export async function deleteEMFAssessment(id: unknown) {
  const initialOwner = captureEMFNativeOwner(); if (!await persistEMFEditorInputs() || !isEMFNativeOwnerCurrent(initialOwner)) return false;
  const owner = captureEMFNativeOwner(true);
  if (!await showConfirmDialog('Delete this EMF assessment and its local rooms, readings, photos and edit history? Original files and backups remain.') || !isEMFNativeOwnerCurrent(owner)) return false;
  return change(data => { const rows = emfAssessments(data), row = assessment(data, id); rows.splice(rows.indexOf(row), 1); }, 'remove-assessment', owner, () => { emfEditorState.editingAssessmentId = null; showNotification('Assessment deleted', 'info'); });
}
export async function updateEMFField(id: unknown, field: string, value: unknown) {
  return change(data => {
    if (!['date', 'label', 'consultant', 'note'].includes(field) || typeof value !== 'string' || field === 'date' && !validAgentDate(value)) throw new Error('Enter a valid EMF assessment field and date.');
    assessment(data, id)[field] = value;
  }, 'edit-assessment');
}
export async function updateEMFRoom(id: unknown, index: number, field: string, value: unknown) {
  const target = roomId(id, index);
  return change(data => {
    if (!['name', 'location', 'sleeping', 'note'].includes(field) || (field === 'sleeping' ? typeof value !== 'boolean' : typeof value !== 'string')) throw new Error('Enter a valid EMF room field.');
    room(data, target)[field] = value;
  }, 'edit-room');
}
export async function updateEMFMeasurement(id: unknown, index: number, type: string, value: unknown) {
  const target = roomId(id, index);
  return change(data => {
    const row = room(data, target), definition = SBM_2015_THRESHOLDS[type]; if (!definition) throw new Error('Choose a supported EMF measurement type.');
    const raw = value == null ? '' : String(value).trim(), numeric = Number(raw), measurements = row.measurements == null ? {} : agentDataObject(row.measurements);
    const previous = measurements[type] == null ? {} : agentDataObject(measurements[type]);
    if (raw === '') { if (Object.keys(previous).length) measurements[type] = { ...previous, value: null }; } else {
      if (!Number.isFinite(numeric) || numeric < 0) throw new Error('Enter a valid nonnegative EMF reading.');
      if (previous.unit != null && previous.unit !== definition.unit) throw new Error('Correct this older reading and its canonical unit together first.');
      measurements[type] = { ...previous, value: numeric, unit: definition.unit, meter: previous.meter || null };
    }
    row.measurements = measurements;
  }, 'edit-reading');
}
export async function updateEMFMeter(id: unknown, index: number, type: string, value: unknown) {
  const target = roomId(id, index);
  return change(data => {
    const row = room(data, target), definition = SBM_2015_THRESHOLDS[type]; if (!definition) throw new Error('Choose a supported EMF measurement type.');
    if (value != null && typeof value !== 'string') throw new Error('Enter a reported EMF instrument name.');
    const measurements = row.measurements == null ? {} : agentDataObject(row.measurements), meter = typeof value === 'string' && value ? value : null;
    if (measurements[type] != null) agentDataObject(measurements[type]).meter = meter;
    else if (meter) measurements[type] = { value: null, unit: definition.unit, meter };
    row.measurements = measurements;
  }, 'edit-meter');
}
const collectActiveAssessmentState = persistEMFEditorInputs;

// ═══════════════════════════════════════════════
// PDF IMPORT
// ═══════════════════════════════════════════════
let pdfRequest = 0, pdfController: AbortController | null = null, pdfOwner: EMFNativeOwner | null = null;
onEMFRecordChanged(() => { if (pdfOwner && !isEMFNativeSourceCurrent(pdfOwner)) pdfController?.abort(); });
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
  const request = ++pdfRequest; pdfController?.abort(); const controller = new AbortController(); pdfController = controller; pdfOwner = null;
  const initialOwner = captureEMFNativeOwner();
  if (!await persistEMFEditorInputs() || !isEMFNativeOwnerCurrent(initialOwner) || request !== pdfRequest) return;
  const owner = captureEMFNativeOwner(true); pdfOwner = owner;
  const current = () => request === pdfRequest && !controller.signal.aborted && isEMFNativeSourceCurrent(owner);
  if (!(emfAIDeps as AIInvocationOperations).hasAIProvider()) {
    showNotification('Configure an AI provider in Settings first', 'error');
    return;
  }

  showNotification('Extracting text from EMF report...', 'info', 3000);

  let pdfText: Awaited<ReturnType<typeof extractPDFText>>;
  try {
    pdfText = await extractPDFText(file);
  } catch (e) {
    if (current()) showNotification('Failed to read PDF: ' + getErrorMessage(e), 'error');
    return;
  }

  if (!current()) return;
  if (!pdfText || pdfText.trim().length < 20) {
    showNotification('Could not extract text from this PDF. Try a text-based report.', 'error');
    return;
  }

  // PII obfuscation — consultant reports contain client names/addresses
  let textToSend = pdfText;
  const piiAvailable = await checkOllamaPII();
  if (!current()) return;
  const reviewEnabled = isPIIReviewEnabled();

  if (piiAvailable.available && reviewEnabled) {
    const { obfuscated } = obfuscatePDFText(pdfText);
    const result = await reviewPIIBeforeSend(pdfText, {
      obfuscatedText: obfuscated,
      streamFn: (onChunk, signal, onThinking) => sanitizeWithOllamaStreaming(pdfText, onChunk, signal, onThinking)
    });
    if (!current() || result === 'cancel') return;
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

  if (!current()) return;
  showNotification('AI is analyzing EMF report...', 'info', 5000);

  try {
    const { text } = await (emfAIDeps as AIInvocationOperations).callClaudeAPI({
      system: EMF_PARSE_SYSTEM,
      signal: controller.signal,
      messages: [{ role: 'user', content: textToSend }],
      maxTokens: 4096,
    }) as PDFResponseOperations;

    if (!current()) return;
    const jsonMatch = (text as MatchOperations).match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in AI response');
    const parsed: unknown = JSON.parse(jsonMatch[0]!);

    if (!(parsed as {rooms?: unknown}).rooms || !Array.isArray((parsed as {rooms?: unknown}).rooms) || ((parsed as {rooms?: unknown}).rooms as {length: number}).length === 0) {
      showNotification('AI could not find EMF measurements in this report', 'error');
      return;
    }

    await showEMFImportPreview(parsed as PreviewInput, current);
  } catch (e) {
    if (current()) showNotification('Failed to parse EMF report: ' + getErrorMessage(e), 'error');
  }
}

export async function toggleEMFCompare() {
  const owner = captureEMFNativeOwner(); if (!await persistEMFEditorInputs() || !isEMFNativeOwnerCurrent(owner)) return false;
  emfEditorState.compareMode = !emfEditorState.compareMode; emfEditorState.editingAssessmentId = null; refreshEMFEditorAfterChange(); return true;
}
export { closeEMFInterpretation, discussEMFInterpretation };
export async function interpretEMFAssessment(id: unknown) {
  const owner = captureEMFNativeOwner(); if (!await persistEMFEditorInputs() || !isEMFNativeOwnerCurrent(owner)) return false;
  interpretEMFAssessmentImpl(id, { getAssessments: ensureAssessments }); return true;
}
export async function interpretEMFComparison() {
  const owner = captureEMFNativeOwner(); if (!await persistEMFEditorInputs() || !isEMFNativeOwnerCurrent(owner)) return false;
  interpretEMFComparisonImpl({ getAssessments: ensureAssessments }); return true;
}

// ═══════════════════════════════════════════════
// ROOM PHOTOS
// ═══════════════════════════════════════════════
export async function addEMFPhotos(assessmentId: unknown, index: number, files: Iterable<File>) {
  const initialOwner = captureEMFNativeOwner(), target = roomId(assessmentId, index), selected = [...files];
  if (!await persistEMFEditorInputs() || !isEMFNativeOwnerCurrent(initialOwner)) return false;
  if (!emfRecords(state.importedData, 'emfRooms').some(row => row.id === target)) return false;
  const owner = captureEMFNativeOwner(true);
  const current = room(state.importedData, target), oldPhotos = Array.isArray(current.photos) ? current.photos : [];
  const photos: Array<{ name: string; base64: string; mediaType: string }> = [];
  for (const file of selected) {
    if (!isEMFNativeOwnerCurrent(owner)) return false; if (!isValidImageType(file.type)) continue;
    if (oldPhotos.length + photos.length >= 6) { showNotification('Max 6 photos per room', 'warning'); break; }
    try { const resized = await resizeImage(file, 800, 0.8); if (!isEMFNativeOwnerCurrent(owner)) return false; photos.push({ name: file.name, ...resized }); } catch { /* A failed chosen file leaves saved photos intact. */ }
  }
  if (!photos.length) return false;
  return change(data => { const row = room(data, target); if (row.photos != null && !Array.isArray(row.photos)) throw new Error('Review the older photos first.'); const saved = (row.photos || []) as unknown[]; if (saved.length + photos.length > 6) throw new Error('The room photos changed; choose the files again.'); row.photos = [...saved, ...photos]; }, 'add-photos', owner);
}
export async function removeEMFPhoto(id: unknown, index: number, photoIdx: number) {
  const target = roomId(id, index), original = structuredClone((room(state.importedData, target).photos as unknown[] | undefined)?.[photoIdx]);
  return change(data => { const row = room(data, target); if (!Array.isArray(row.photos) || original === undefined || !profileDataValuesEqual(row.photos[photoIdx], original)) throw new Error('This EMF photo changed.'); row.photos.splice(photoIdx, 1); }, 'remove-photo');
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
  const source = `data:${safeMediaType(photo.mediaType)};base64,${photo.base64}`;
  const view: EMFPhotoView = {source, name: String(photo.name || 'Photo')};
  overlay.innerHTML = renderEMFPhoto(view);
  document.body.appendChild(overlay);
  openModalOverlay(overlay);
  try { trapModalFocus(overlay); } catch (_) {}
}

export async function saveEMFExplicit() {
  const owner = captureEMFNativeOwner(), saved = await persistEMFEditorInputs();
  if (saved && isEMFNativeOwnerCurrent(owner)) { refreshEMFEditorAfterChange(); showNotification('EMF assessment saved', 'success'); } return saved;
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
