// Native and chat commands share one serialized, durable EMF write boundary.
import type { ProfileData } from '../types/app-state.js';
import { createUniqueId } from './unique-id.js';
import { validAgentDate, agentDataObject } from '../shared/agent-data-contract.js';
import { SBM_2015_THRESHOLDS } from './schema-environment.js';
import { SLEEPING_ROOMS } from './emf-model.js';
import type { GeneratedInterpretation } from '../types/emf-interpretation.js';
import type { PreviewInput } from '../types/emf-editor.js';
import { state } from './state.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
export { onEMFRecordChanged } from './emf-record-store.js';
import { commitEMFRecordWrite, queueEMFRecordWrite } from './emf-record-store.js';
import { emfAssessments } from './emf-record-fields.js';
import { captureEMFEditorInputs, applyEMFEditorInputs, acceptEMFEditorInputs, emfEditorIdentity } from './emf-editor-inputs.js';
import type { EMFInputCapture } from './emf-editor-inputs.js';
import { showNotification } from './utils.js';
export interface EMFNativeOwner { profile: string; root: ProfileData; source: unknown; identity: ReturnType<typeof emfEditorIdentity>; visible: boolean; strict: boolean; guard?: () => boolean; }
const tasks = new Map<string, Set<Promise<boolean>>>();
const pending = new Map<string, number>(), accepted = new WeakMap<ProfileData, unknown>();
export const hasPendingEMFNativeWrites = (profile = state.currentProfile) => !!pending.get(profile);
export function captureEMFNativeOwner(strict = false): EMFNativeOwner {
  const identity = emfEditorIdentity();
  return { profile: state.currentProfile, root: state.importedData, source: structuredClone(state.importedData.emfAssessment ?? null), identity, strict, visible: !!identity.modal?.closest('#modal-overlay')?.classList.contains('show') };
}
export function isEMFNativeOwnerCurrent(owner: EMFNativeOwner) {
  const identity = emfEditorIdentity();
  return (!owner.guard || owner.guard()) && state.currentProfile === owner.profile && state.importedData === owner.root && identity.generation === owner.identity.generation
    && (!owner.identity.modal || identity.modal === owner.identity.modal && (!owner.strict || identity.content === owner.identity.content))
    && (!owner.visible || !!identity.modal?.closest('#modal-overlay')?.classList.contains('show'));
}
function retainChangedInputs(before: ProfileData, next: ProfileData, operation: string) {
  const original = emfAssessments(before), after = emfAssessments(next); let changed = original.length !== after.length;
  for (const row of after) {
    const previous = original.find(record => record.id === row.id);
    if (!previous) { changed = true; if (before.emfAssessment?.comparisonInterpretation != null) row.editHistory = [{ recordedAt: Date.now(), resource: 'nativeEMF', operation, snapshot: null, comparisonInterpretation: structuredClone(before.emfAssessment.comparisonInterpretation) }]; continue; }
    if (profileDataValuesEqual(previous, row)) continue;
    const { editHistory: _history, ...snapshot } = structuredClone(previous);
    if (row.editHistory != null && !Array.isArray(row.editHistory)) throw new Error('Review this older EMF history before changing its inputs.');
    const history = (row.editHistory || []) as unknown[];
    history.push({ recordedAt: Date.now(), resource: 'nativeEMF', operation, snapshot, ...(before.emfAssessment?.comparisonInterpretation != null ? { comparisonInterpretation: structuredClone(before.emfAssessment.comparisonInterpretation) } : {}) });
    row.editHistory = history; delete row.interpretation; changed = true;
  }
  if (changed && next.emfAssessment) delete next.emfAssessment.comparisonInterpretation;
}
export async function stageEMFNativeChange(mutate: (next: ProfileData) => void, operation: string, owner = captureEMFNativeOwner(), capture?: EMFInputCapture | null, derived = false): Promise<boolean> {
  const profile = owner.profile; pending.set(profile, (pending.get(profile) || 0) + 1);
  let running: Promise<boolean> | undefined;
  try {
    const inputs = capture === undefined ? captureEMFEditorInputs() : capture;
    running = queueEMFRecordWrite(profile, async () => {
      const current = () => isEMFNativeOwnerCurrent(owner); if (!current()) return false;
      const base = await readAgentProfileRecords(profile); if (!current()) return false;
      const source = structuredClone(owner.root), local = source.emfAssessment ?? null;
      const priorOwnWrite = !owner.strict && accepted.has(owner.root) && profileDataValuesEqual(local, accepted.get(owner.root));
      if (!profileDataValuesEqual(local, owner.source) && !priorOwnWrite || !profileDataValuesEqual(local, base.emfAssessment ?? null)) throw new Error('This EMF source changed. Reopen the editor to review it. No change was saved.');
      const next = structuredClone(base); applyEMFEditorInputs(next, inputs, priorOwnWrite); mutate(next);
      if (profileDataValuesEqual(next.emfAssessment ?? null, base.emfAssessment ?? null)) { acceptEMFEditorInputs(inputs); return true; }
      if (!derived) retainChangedInputs(base, next, operation);
      const saved = await commitEMFRecordWrite(profile, owner.root, base, source, next, current);
      if (!saved.saved) { if (!current()) return false; throw new Error(saved.conflict ? 'This EMF source changed. Reopen the editor to review it.' : 'Could not save this EMF change. Your draft remains open; try Save again.'); }
      accepted.set(owner.root, structuredClone((next.emfAssessment ?? null))); acceptEMFEditorInputs(inputs); return true;
    });
    const group = tasks.get(profile) || new Set<Promise<boolean>>(); group.add(running); tasks.set(profile, group); return await running;
  } catch (error) {
    if (isEMFNativeOwnerCurrent(owner)) showNotification(error instanceof Error ? error.message : 'Could not save the EMF change.', 'error'); return false;
  } finally { const group = tasks.get(profile); if (running) group?.delete(running); if (!group?.size) tasks.delete(profile); const count = (pending.get(profile) || 1) - 1; if (count) pending.set(profile, count); else pending.delete(profile); }
}
export async function waitForEMFNativeWrites(profile = state.currentProfile) {
  let saved = true;
  while (tasks.has(profile)) { const results = await Promise.all([...tasks.get(profile)!].map(task => task.catch(() => false))); saved = results.every(Boolean) && saved; }
  return saved;
}
export async function persistEMFEditorInputs() {
  const owner = captureEMFNativeOwner();
  try { if (!await waitForEMFNativeWrites(owner.profile) || !isEMFNativeOwnerCurrent(owner)) return false; const capture = captureEMFEditorInputs(); if (!capture?.changes.length) return true; return stageEMFNativeChange(() => {}, 'edit', captureEMFNativeOwner(), capture); }
  catch (error) { showNotification(error instanceof Error ? error.message : 'Review the EMF draft.', 'error'); return false; }
}

export function isEMFNativeSourceCurrent(owner: EMFNativeOwner) { return isEMFNativeOwnerCurrent(owner) && profileDataValuesEqual(owner.source, owner.root.emfAssessment ?? null); }
export function freezeEMFImportPreview(parsed: PreviewInput): PreviewInput | null {
  const visited = new WeakSet<object>();
  const plain = (value: unknown): boolean => {
    if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)) return true;
    if (typeof value !== 'object' || visited.has(value)) return false;
    const proto = Object.getPrototypeOf(value); if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return false;
    visited.add(value); return Object.values(Object.getOwnPropertyDescriptors(value)).every(descriptor => 'value' in descriptor && plain(descriptor.value));
  };
  return plain(parsed) ? structuredClone(parsed) : null;
}
export function commitEMFImportPreview(parsed: PreviewInput | null, owner: EMFNativeOwner) {
  const id = createUniqueId('emf_');
  return stageEMFNativeChange(data => {
    if (!parsed || !validAgentDate(parsed.date) || !Array.isArray(parsed.rooms) || !parsed.rooms.length) throw new Error('Review the report date and room data before importing. No change was saved.');
    for (const key of ['consultant', 'note'] as const) if (parsed[key] != null && typeof parsed[key] !== 'string') throw new Error('Review the report text fields before importing.');
    const rooms = parsed.rooms.map(raw => {
      const input = agentDataObject(raw);
      if (input.name != null && typeof input.name !== 'string' || input.location != null && typeof input.location !== 'string') throw new Error('Review the room name and location before importing.');
      for (const key of ['sources', 'mitigations']) if (input[key] != null && (!Array.isArray(input[key]) || input[key].some(item => typeof item !== 'string'))) throw new Error('Review the reported source and mitigation tags before importing.');
      const measurements = input.measurements == null ? {} : structuredClone(agentDataObject(input.measurements));
      for (const [type, rawReading] of Object.entries(measurements)) {
        const definition = SBM_2015_THRESHOLDS[type], reading = agentDataObject(rawReading);
        if (reading.value === undefined && typeof reading.meter === 'string' && reading.meter) reading.value = null;
        if (reading.meter != null && typeof reading.meter !== 'string') throw new Error('Review the reported instrument before importing.');
        if (!definition || reading.unit !== definition.unit || reading.value !== null && (typeof reading.value !== 'number' || !Number.isFinite(reading.value) || reading.value < 0)) throw new Error('Review each reported reading and canonical unit before importing. No change was saved.');
      }
      return { id: createUniqueId('emfr_'), name: input.name || 'Unknown', location: input.location || '', sleeping: SLEEPING_ROOMS.has(String(input.name || 'Unknown')), measurements, sources: input.sources || [], mitigations: input.mitigations || [], note: '' };
    });
    data.emfAssessment ||= { assessments: [] };
    emfAssessments(data).push({ id, date: parsed.date, label: '', consultant: parsed.consultant || '', rooms, note: parsed.note || '', source: { kind: 'emf-import', parserOutput: structuredClone(parsed) } });
  }, 'import-assessment', owner, null).then(saved => ({ saved, id }));
}

export async function commitEMFInterpretation(id: unknown | null, result: GeneratedInterpretation, authorized: () => boolean) {
  const owner = captureEMFNativeOwner(); owner.guard = authorized;
  const saved = await stageEMFNativeChange(data => {
    if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('No interpretation text was generated.');
    const target = id === null ? data.emfAssessment : emfAssessments(data).find(row => row.id === id);
    if (!target) throw new Error('The EMF assessment changed before its interpretation could be saved.');
    const field = id === null ? 'comparisonInterpretation' : 'interpretation', previous = target[field], next = structuredClone(result) as GeneratedInterpretation & { history?: unknown[] };
    if (previous != null) {
      const { history, ...snapshot } = agentDataObject(previous); if (history != null && !Array.isArray(history)) throw new Error('Review the previous interpretation history before replacing it.');
      next.history = [...(history || []), structuredClone(snapshot)];
    }
    target[field] = next;
  }, 'interpretation', owner, null, true);
  if (!saved) throw new Error('Could not save this interpretation. Keep this window open and retry saving.');
}
