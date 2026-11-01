// Track only changed controls. Rendering and reading never modify profile data.
import type { ProfileData } from '../types/app-state.js';
import { state } from './state.js';
import { agentDataObject, validAgentDate } from '../shared/agent-data-contract.js';
import { SBM_2015_THRESHOLDS } from './schema-environment.js';
import { emfRecords } from './emf-record-fields.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
export interface EMFEditorLocation { assessmentId?: string; roomId?: string; }
type Value = string | boolean | string[];
type Kind = 'field' | 'room' | 'measurement' | 'meter' | 'tags';
interface Control { element: HTMLElement; kind: Kind; field: string; initial: Value; }
interface Frame { generation: number; profile: string; root: ProfileData; modal: HTMLElement; content: Element | null; location: EMFEditorLocation; controls: Control[]; }
export interface EMFInputCapture { frame: Frame; changes: Array<{ control: Control; before: Value; value: Value }>; }
let frame: Frame | null = null, generation = 0;
function value(element: HTMLElement, kind: Kind): Value {
  if (kind === 'tags') return [...element.querySelectorAll('.ctx-tag.active')].map(node => node.textContent || '');
  if (element instanceof HTMLInputElement && element.type === 'checkbox') return element.checked;
  return (element as HTMLInputElement | HTMLTextAreaElement).value;
}
const equal = (left: Value, right: Value) => profileDataValuesEqual(Array.isArray(left) ? [...left].sort() : left, Array.isArray(right) ? [...right].sort() : right);
export function retireEMFEditorInputs() { frame = null; generation++; }
export function rememberEMFEditorInputs(modal: HTMLElement, location: EMFEditorLocation) {
  if (!frame || frame.modal !== modal || frame.profile !== state.currentProfile || frame.root !== state.importedData) generation++;
  const controls: Control[] = [];
  for (const [kind, attr] of [['field', 'emfField'], ['room', 'emfRoomField'], ['measurement', 'emfMeasurementType'], ['meter', 'emfMeterType']] as const) {
    const selector = { field: '[data-emf-field]', room: '[data-emf-room-field]', measurement: '[data-emf-measurement-type]', meter: '[data-emf-meter-type]' }[kind];
    for (const element of modal.querySelectorAll<HTMLElement>(selector)) controls.push({ element, kind, field: element.dataset[attr]!, initial: value(element, kind) });
  }
  for (const field of ['sources', 'mitigations']) {
    const element = modal.querySelector<HTMLElement>(field === 'sources' ? '[id^="emf-sources-"]' : '[id^="emf-mits-"]');
    if (element) controls.push({ element, kind: 'tags', field, initial: value(element, 'tags') });
  }
  frame = { generation, profile: state.currentProfile, root: state.importedData, modal, content: modal.firstElementChild, location, controls };
}
function currentFrame(): Frame | null {
  return frame && typeof document !== 'undefined' && frame.profile === state.currentProfile && frame.root === state.importedData && document.getElementById('detail-modal') === frame.modal && frame.modal.firstElementChild === frame.content ? frame : null;
}
export function emfEditorIdentity() { const current = currentFrame(); return { generation, modal: current?.modal ?? null, content: current?.content ?? null }; }
export function captureEMFEditorInputs(): EMFInputCapture | null {
  const current = currentFrame(); if (!current) return null;
  return { frame: current, changes: current.controls.flatMap(control => {
    const next = value(control.element, control.kind); if (equal(next, control.initial)) return [];
    if (control.kind === 'measurement' && control.element instanceof HTMLInputElement && control.element.validity.badInput) throw new Error('Enter a valid nonnegative EMF reading. Your draft remains open.');
    return [{ control, before: structuredClone(control.initial), value: structuredClone(next) }];
  }) };
}
export function hasEMFEditorDraft() { try { return !!captureEMFEditorInputs()?.changes.length; } catch { return true; } }
export function acceptEMFEditorInputs(capture: EMFInputCapture | null) {
  if (!capture || currentFrame() !== capture.frame) return;
  for (const change of capture.changes) change.control.initial = structuredClone(change.value);
}
export function applyEMFEditorInputs(data: ProfileData, capture: EMFInputCapture | null, allowNativePrior = false) {
  if (!capture?.changes.length) return;
  const assessment = emfRecords(data, 'emfAssessments').find(row => row.id === capture.frame.location.assessmentId)?.assessment;
  const room = emfRecords(data, 'emfRooms').find(row => row.id === capture.frame.location.roomId)?.room;
  if (!assessment) throw new Error('This EMF assessment changed. Reopen its editor.');
  for (const { control, before, value: next } of capture.changes) {
    const { field, kind } = control; if (kind !== 'field' && !room) throw new Error('This EMF room changed. Reopen its editor.');
    const measurements = room?.measurements == null ? {} : agentDataObject(room.measurements), measurement = measurements[field] == null ? {} : agentDataObject(measurements[field]);
    const current: Value = kind === 'field' ? String(assessment[field] ?? '') : kind === 'room' ? field === 'sleeping' ? room!.sleeping !== false : String(room![field] ?? '')
      : kind === 'measurement' ? String(measurement.value ?? '') : kind === 'meter' ? String(measurement.meter || '') : Array.isArray(room![field]) ? (room![field] as unknown[]).map(item => { if (typeof item !== 'string') throw new Error('Review the older EMF tags before changing them.'); return item; }) : [];
    if (!allowNativePrior && !equal(current, before) && !equal(current, next)) throw new Error('These EMF inputs changed since this form was shown. Your typed draft remains open. Reopen and review the current data.');
    if (kind === 'field') {
      if (!['date', 'label', 'consultant', 'note'].includes(field) || field === 'date' && !validAgentDate(next)) throw new Error('Enter the actual valid assessment date.');
      assessment[field] = next;
    } else if (kind === 'room') {
      if (!['location', 'note', 'sleeping'].includes(field)) throw new Error('Unsupported EMF room field.'); room![field] = next;
    } else if (kind === 'tags') room![field] = next;
    else if (kind === 'meter') {
      const definition = SBM_2015_THRESHOLDS[field]; if (!definition) throw new Error('Unsupported EMF reading type.');
      if (measurements[field] != null) measurement.meter = next || null;
      else if (next) { measurements[field] = { value: null, unit: definition.unit, meter: next }; room!.measurements = measurements; }
    }
    else {
      const definition = SBM_2015_THRESHOLDS[field]; if (!definition) throw new Error('Unsupported EMF reading type.');
      if (next === '') { if (Object.keys(measurement).length) measurements[field] = { ...measurement, value: null }; }
      else {
        const numeric = Number(next); if (!Number.isFinite(numeric) || numeric < 0) throw new Error('Enter a valid nonnegative EMF reading.');
        if (measurement.unit != null && measurement.unit !== definition.unit) throw new Error('This older reading uses a different unit. Correct its value and canonical unit together before editing it here.');
        measurements[field] = { ...measurement, value: numeric, unit: definition.unit, meter: measurement.meter || null };
      }
      room!.measurements = measurements;
    }
  }
}
