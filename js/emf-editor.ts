import {disposeEMFMeterRecommendations,mountEMFMeterRecommendations} from './emf-meter-recommendations-component.js';
import {getEMFMeterSectionView} from './recommendations-products.js';
import {renderEMFEditorPresentation,renderEMFImportPreviewPresentation,emfEditorText as text,emfEditorAttribute as attr,type EMFEditorView,type EMFAssessmentCardView,type EMFAssessmentDetailView,type EMFRoomView,type EMFMeasurementView,type EMFRoomOption,type EMFPhotoView,type EMFImportPreviewView,type EMFPreviewRoomView,type EMFPreviewMeasurementView} from './emf-editor-presentation.js';
import {emfComparisonText,type EMFComparisonCell,type EMFComparisonRow,type EMFComparisonView} from './emf-comparison-presentation.js';
// emf-editor.js — EMF assessment modal rendering and delegated interaction owner.

import { SBM_2015_THRESHOLDS, getEMFSeverity } from './schema.js';
import {
  EMF_ROOM_PRESETS,
  EMF_SOURCES,
  EMF_MITIGATIONS,
  EMF_METER_PRESETS,
} from './constants.js';
import { showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { toggleCtxTag } from './context-card-editor-ui.js';
import { loadEMFCatalog, isProductRecsEnabled } from './recommendations.js';
import { openModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { createUniqueId } from './unique-id.js';
import {
  MEASUREMENT_TYPES,
  SLEEPING_ROOMS,
  ensureEMFAssessments,
  safeEMFMediaType,
} from './emf-model.js';

import type { AssessmentOperations, RoomOperations, MeasurementOperations, EditorDependencyOperations, PreviewInput, EditorOptions, ReturnRoute, SeverityReader } from '../types/emf-editor.js';

// Private invocation view; configuration/snapshots stay raw and nullable callbacks retain original errors.
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
} as EditorDependencyOperations;

export function configureEMFEditor(deps: unknown = {}): Record<string, unknown> {
  const previous = { ...emfEditorDeps };
  for (const [key, value] of Object.entries(deps || {})) {
    if (Object.hasOwn(emfEditorDeps, key) && (typeof value === 'function' || value === null)) {
      (emfEditorDeps as Record<string, unknown>)[key] = value;
    }
  }
  return previous;
}

export const emfEditorState = {
  editingAssessmentId: null as unknown,
  activeRoomIdx: 0,
  compareMode: false,
};

let emfEditorReturnRoute: ReturnRoute | null = null;

let emfEditorDelegatesInstalled = false;

function isEMFEditorTarget(element: Element) {
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
  const focusTarget = (
    modal.querySelector<HTMLElement>('[data-emf-action="trigger-pdf-import"], [data-emf-action="add-assessment"]')
  );
  requestAnimationFrame(() => focusTarget?.focus());
}

function closeEMFEditorModal() {
  emfEditorDeps.collectActiveAssessmentState?.();
  saveImportedData();
  document.querySelectorAll('.emf-lightbox').forEach(element => removeModalOverlay(element));
  const owner=document.getElementById('detail-modal');if(owner)disposeEMFMeterRecommendations(owner);
  removeEMFEditorDelegates();
  emfEditorReturnRoute = null;
  emfEditorDeps.closeModal?.();
}

function returnFromEMFEditor() {
  const route = emfEditorReturnRoute;
  const modal = document.getElementById('detail-modal'), content = modal?.firstElementChild;
  emfEditorDeps.collectActiveAssessmentState?.();
  saveImportedData();
  document.querySelectorAll('.emf-lightbox').forEach(element => removeModalOverlay(element));
  const owner=document.getElementById('detail-modal');if(owner)disposeEMFMeterRecommendations(owner);
  removeEMFEditorDelegates();
  emfEditorReturnRoute = null;
  emfEditorDeps.closeModal?.();
  if (route?.callback) {
    setTimeout(() => {
      if (modal?.isConnected && document.getElementById('detail-modal') === modal && modal.firstElementChild === content) (route.callback as () => void)();
    }, 0);
  }
}

function emfNumberAttr(element: HTMLElement, name: string, fallback = 0) {
  const raw = element.dataset[name];
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function handleEMFEditorClick(event: MouseEvent) {
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

function handleEMFEditorChange(event: Event) {
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
    let value: string | boolean | undefined;
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

function handleEMFEditorKeydown(event: KeyboardEvent) {
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

export function openEMFAssessmentEditor(options: EditorOptions = {}) {
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

function getRoomWorstSeverity(room: RoomOperations) {
  let worst: ReturnType<typeof getEMFSeverity> = null;
  let worstIdx = -1;
  const sleeping = room.sleeping !== false;
  const tierOrder = ['green', 'yellow', 'orange', 'red'];
  for (const [type, measurement] of Object.entries(room.measurements || {})) {
    if (measurement && measurement.value != null) {
      const severity = (getEMFSeverity as SeverityReader)(type, measurement.value, sleeping);
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

function getWorstSeverity(assessment: AssessmentOperations) {
  let worst: ReturnType<typeof getEMFSeverity> = null;
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

export function renderEMFEditor(modal: {innerHTML: string} | null) {
  if (typeof HTMLElement !== 'undefined' && modal instanceof HTMLElement) {
    modal.className = 'modal';
    modal.setAttribute('aria-label', 'Baubiologie EMF Assessment');
    modal.removeAttribute('aria-labelledby');
  }
  const assessments = ensureEMFAssessments() as AssessmentOperations[];
  const sorted = [...assessments].sort((a, b) => (b.date as {localeCompare(value: unknown): number}).localeCompare(a.date));
  const returnLabel=emfEditorReturnRoute?text(emfEditorReturnRoute.label):null;
  const ai=!!emfEditorDeps.hasAIProvider();
  const compareLabel=sorted.length>=2?(emfEditorState.compareMode?'Exit Compare':'Compare'):null;
  let body:EMFEditorView['body'];
  if(sorted.length===0){emfEditorState.compareMode=false;body={kind:'empty'};}
  else if(emfEditorState.compareMode&&sorted.length>=2)body={kind:'compare',view:projectComparisonView(sorted)};
  else {
    const cards:EMFAssessmentCardView[]=[];
    for(const assessment of sorted){
      const expanded=emfEditorState.editingAssessmentId===assessment.id;
      const date=new Date((assessment.date as string)+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      const toggleId=attr(assessment.id);
      const label=assessment.label?text(assessment.label):null;
      const consultant=assessment.consultant?text(assessment.consultant):null;
      const severity=getWorstSeverity(assessment)??null;
      const detail=expanded?projectAssessmentDetail(assessment):null;
      cards.push({expanded,toggleId,date,label,consultant,severity,detail});
    }
    body={kind:'assessments',cards};
  }
  const html=renderEMFEditorPresentation({returnLabel,ai,compareLabel,body});
  if(typeof HTMLElement!=='undefined'&&modal instanceof HTMLElement)disposeEMFMeterRecommendations(modal);
  modal!.innerHTML=html;
  const meterSlot = document.getElementById('emf-meter-recs-slot');
  if (meterSlot && isProductRecsEnabled()) {
    loadEMFCatalog().then(catalog => {
      if (catalog && document.getElementById('emf-meter-recs-slot') === meterSlot) {
        mountEMFMeterRecommendations(meterSlot,getEMFMeterSectionView(catalog));
      }
    });
  }
}

function projectAssessmentDetail(assessment:AssessmentOperations):EMFAssessmentDetailView {
  if(emfEditorState.activeRoomIdx>=assessment.rooms.length)emfEditorState.activeRoomIdx=0;
  const roomIdx=emfEditorState.activeRoomIdx;
  const fields:EMFAssessmentDetailView['fields']=[
    {field:'date',value:text(assessment.date),assessmentId:attr(assessment.id)},
    {field:'label',value:text(assessment.label),assessmentId:attr(assessment.id)},
    {field:'consultant',value:text(assessment.consultant),assessmentId:attr(assessment.id)},
  ];
  const tabs:EMFAssessmentDetailView['tabs'][number][]=[];
  for(let index=0;index<assessment.rooms.length;index++){
    const room=assessment.rooms[index]!,severity=getRoomWorstSeverity(room)??null,assessmentId=attr(assessment.id);
    const name=text(room.name||'Room '+(index+1));tabs.push({name,active:index===roomIdx,assessmentId,index,severity});
  }
  const addRoomId=attr(assessment.id);
  const room=projectRoomContent(assessment.id,roomIdx,assessment.rooms[roomIdx]!,assessment.rooms.length);
  const note={field:'note' as const,value:text(assessment.note),assessmentId:attr(assessment.id)};
  const interpret=!!emfEditorDeps.hasAIProvider();
  const interpretId=interpret?attr(assessment.id):null;
  const deleteId=attr(assessment.id);
  return{fields,tabs,addRoomId,room,note,interpret,interpretId,deleteId};
}

function projectRoomContent(assessmentId:unknown,roomIdx:number,room:RoomOperations,roomCount:number):EMFRoomView {
  const assessment=(ensureEMFAssessments() as AssessmentOperations[]).find(candidate=>candidate.id===assessmentId);
  const existingNames=new Set(assessment?assessment.rooms.map(candidate=>candidate.name):[]);
  const availablePresets=EMF_ROOM_PRESETS.filter(name=>!existingNames.has(name));
  const options:EMFRoomOption[]=[];
  if(!EMF_ROOM_PRESETS.includes(room.name as string)&&room.name)options.push({value:'_current',selected:true,disabled:false,label:text(room.name)});
  for(let index=0;index<(assessment?assessment.rooms.length:0);index++){
    const candidate=assessment!.rooms[index]!,isCurrent=index===roomIdx;
    options.push({value:'_room_'+index,selected:isCurrent,disabled:false,label:text(candidate.name||'Room '+(index+1))+(isCurrent?'':' ↩')});
  }
  if(availablePresets.length){options.push({value:null,selected:false,disabled:true,label:'──────────'});for(const name of availablePresets)options.push({value:'_new_'+text(name),selected:false,disabled:false,label:'+ '+text(name)});}
  options.push({value:'_custom',selected:false,disabled:false,label:'+ Custom...'});
  const dropdownId=attr(assessmentId),location=text(room.location),locationId=attr(assessmentId),sleeping=room.sleeping!==false,sleepingId=attr(assessmentId);
  const removable=roomCount>1,removeId=removable?attr(assessmentId):null;
  const measurementSleeping=room.sleeping!==false;
  const measurements:EMFMeasurementView[]=[];
  for(const measurementType of MEASUREMENT_TYPES){
    const definition=SBM_2015_THRESHOLDS[measurementType.key]!;
    const measurement:MeasurementOperations=(room.measurements&&room.measurements[measurementType.key])||{};
    const raw=(measurement.value!=null?measurement.value:'') as string;
    const value=String(raw),measurementId=attr(assessmentId),unit=definition.unit;
    const placeholder=raw==='';
    const dot=placeholder?null:(getEMFSeverity as SeverityReader)(measurementType.key,parseFloat(raw),measurementSleeping)??null;
    const meter=text(measurement.meter||''),meterId=attr(assessmentId);
    measurements.push({key:measurementType.key,label:measurementType.short,value,measurementId,unit,dot,placeholder,meter,meterId});
  }
  const meters=MEASUREMENT_TYPES.map(type=>({key:type.key,names:EMF_METER_PRESETS.filter(preset=>preset.types.includes(type.key)).map(preset=>text(preset.name))}));
  const sourcesId=`emf-sources-${assessmentId}-${roomIdx}`,sources=EMF_SOURCES.map(source=>({label:text(source),active:(room.sources||[]).includes(source)}));
  const mitigationsId=`emf-mits-${assessmentId}-${roomIdx}`,mitigations=EMF_MITIGATIONS.map(mitigation=>({label:text(mitigation),active:(room.mitigations||[]).includes(mitigation)}));
  const note=text(room.note),noteId=attr(assessmentId),rawPhotos=room.photos||[];
  const photos:EMFPhotoView[]=rawPhotos.map((photo,index)=>{
    const src=`data:${safeEMFMediaType(photo.mediaType)};base64,${photo.base64}`,name=text(photo.name||'Photo'),viewId=attr(assessmentId),removeId=attr(assessmentId);
    return{src,name,viewId,removeId,index};
  });
  const photosId=attr(assessmentId);
  return{index:roomIdx,options,dropdownId,location,locationId,sleeping,sleepingId,removeId,removable,measurements,meters,sourcesId,sources,mitigationsId,mitigations,note,noteId,photos,photosId};
}

export function showEMFImportPreview(parsed: PreviewInput) {
  installEMFEditorDelegates();
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;
  // The preview replaces the editor DOM. Capture any in-progress field edits
  // first so Cancel/Back can reconstruct the exact assessment state.
  emfEditorDeps.collectActiveAssessmentState?.();
  const view=projectImportPreview(parsed);
  const html=renderEMFImportPreviewPresentation(view);
  disposeEMFMeterRecommendations(modal);
  modal.innerHTML=html;
  const confirmButton = modal.querySelector('#emf-confirm-btn');
  if (!confirmButton) return;
  openModalOverlay(overlay);

  confirmButton.addEventListener('click', () => {
    const assessments = ensureEMFAssessments() as AssessmentOperations[];
    const assessment = {
      id: createUniqueId('emf_'),
      date: parsed.date || new Date().toISOString().slice(0, 10),
      label: '',
      consultant: parsed.consultant || '',
      rooms: (parsed.rooms as RoomOperations[]).map(room => ({
        name: room.name || 'Unknown',
        location: room.location || '',
        sleeping: SLEEPING_ROOMS.has((room.name || 'Unknown') as string),
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

function projectImportPreview(parsed:PreviewInput):EMFImportPreviewView {
 const date=parsed.date?new Date((parsed.date as string)+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Unknown date';
 const consultant=parsed.consultant?text(parsed.consultant):null;
 const rooms:EMFPreviewRoomView[]=[];
 for(const room of parsed.rooms as RoomOperations[]){
  const name=text(room.name),location=room.location?text(room.location):null;
  const measurements:EMFPreviewMeasurementView[]=[];
  for(const type of MEASUREMENT_TYPES){
   const measurement=(room.measurements||{})[type.key];if(!measurement)continue;
   const definition=SBM_2015_THRESHOLDS[type.key]!,sleeping=SLEEPING_ROOMS.has(room.name as string);
   const severity=(getEMFSeverity as SeverityReader)(type.key,measurement.value,sleeping)??null;
   const value=`${measurement.value}`;
   measurements.push({label:type.short,value,unit:definition.unit,severity});
  }
  const sources=room.sources&&room.sources.length?room.sources.map(source=>text(source)).join(', '):null;
  const mitigations=room.mitigations&&room.mitigations.length?room.mitigations.map(mitigation=>text(mitigation)).join(', '):null;
  rooms.push({name,location,measurements,sources,mitigations});
 }
 return{date,consultant,rooms};
}

function projectComparisonView(sorted: AssessmentOperations[]):EMFComparisonView {
  const before = sorted[sorted.length > 1 ? 1 : 0]!;
  const after = sorted[0]!;
  const formatDate = (date: unknown) => new Date((date as string) + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const roomNames = [...new Set([
    ...before.rooms.map(room => room.name),
    ...after.rooms.map(room => room.name),
  ])];

  const beforeDate = `${formatDate(before.date)}`;
  const beforeLabel = before.label ? ' — ' + emfComparisonText(before.label) : '';
  const afterDate = `${formatDate(after.date)}`;
  const afterLabel = after.label ? ' — ' + emfComparisonText(after.label) : '';
  const earlier = sorted.length > 2
    ? {count:`${sorted.length - 2}`,suffix:`${sorted.length > 3 ? 's' : ''}`} : null;
  const columns:string[] = [];
  for (const measurementType of MEASUREMENT_TYPES) columns.push(`${measurementType.short}`);

  const rows:EMFComparisonRow[] = [];
  for (const name of roomNames) {
    const beforeRoom = before.rooms.find(room => room.name === name);
    const afterRoom = after.rooms.find(room => room.name === name);
    const sleeping = (afterRoom || beforeRoom)?.sleeping !== false;
    const label = emfComparisonText(name);
    const cells:EMFComparisonCell[] = [];
    for (const measurementType of MEASUREMENT_TYPES) {
      const beforeValue = beforeRoom?.measurements?.[measurementType.key]?.value;
      const afterValue = afterRoom?.measurements?.[measurementType.key]?.value;
      if (beforeValue == null && afterValue == null) {
        cells.push({kind:'empty'});
        continue;
      }
      const beforeSeverity = beforeValue != null
        ? (getEMFSeverity as SeverityReader)(measurementType.key, beforeValue, sleeping) : null;
      const afterSeverity = afterValue != null
        ? (getEMFSeverity as SeverityReader)(measurementType.key, afterValue, sleeping) : null;
      if (beforeValue != null && afterValue != null) {
        const delta = (afterValue as number) - (beforeValue as number);
        const arrow = delta < 0 ? '↓' : delta > 0 ? '↑' : '=';
        const arrowColor = delta < 0
          ? 'var(--green)' : delta > 0 ? 'var(--red)' : 'var(--text-muted)';
        cells.push({kind:'paired',beforeColor:`${beforeSeverity?.color || 'text-muted'}`,beforeText:`${beforeValue}`,
          arrowColor:`${arrowColor}`,arrow:`${arrow}`,afterColor:`${afterSeverity?.color || 'text-muted'}`,afterText:`${afterValue}`});
      } else if (afterValue != null) {
        cells.push({kind:'added',afterColor:`${afterSeverity?.color || 'text-muted'}`,afterText:`${afterValue}`});
      } else {
        cells.push({kind:'removed',beforeColor:`${beforeSeverity?.color || 'text-muted'}`,beforeText:`${beforeValue}`});
      }
    }
    rows.push({label,cells});
  }
  const interpret = !!emfEditorDeps.hasAIProvider();
  return {before:beforeDate+beforeLabel,after:afterDate+afterLabel,earlier,columns,rows,interpret};
}
