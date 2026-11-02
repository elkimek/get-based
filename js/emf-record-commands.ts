// Pure EMF commands: preserve input evidence and invalidate stale interpretation.
import type { ProfileData } from '../types/app-state.js';
import { agentDataObject } from '../shared/agent-data-contract.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { SBM_2015_THRESHOLDS } from './schema-environment.js';
import { emfAssessments, emfRecords, emfRoomId, projectEMFRow, validateEMFPatch } from './emf-record-fields.js';
import type { EMFResource, EMFRow } from './emf-record-fields.js';
export interface EMFEffects { retainedHistory: boolean; interpretationCleared: boolean; comparisonCleared: boolean; removedPhotos: number; removedRooms: number; removedMeasurements: number; removedHistory: number; removedAssessment: boolean; }
export function mutateEMFRecord(data: ProfileData, resource: EMFResource, id: string, operation: string, patch: EMFRow, at: number) {
  validateEMFPatch(resource, operation, patch);
  const existing = emfRecords(data, resource).find(row => row.id === id) || null;
  if (operation === 'add' ? existing !== null : existing === null) throw new Error('This EMF record changed. Read it again.');
  const effects: EMFEffects = { retainedHistory: false, interpretationCleared: false, comparisonCleared: false, removedPhotos: 0, removedRooms: 0, removedMeasurements: 0, removedHistory: 0, removedAssessment: false };
  if (!data.emfAssessment) data.emfAssessment = { assessments: [] };
  const container = data.emfAssessment, assessments = emfAssessments(data);
  let assessment = existing?.assessment;
  if (operation === 'add' && resource === 'emfAssessments') {
    const room = { name: patch.roomName, sleeping: patch.sleeping, location: '', note: '', measurements: {}, sources: [], mitigations: [] };
    assessment = { id, date: patch.date, label: patch.label ?? '', consultant: patch.consultant ?? '', note: patch.note ?? '', rooms: [room] };
    (room as EMFRow).id = emfRoomId(id, room, 0);
    if (container.comparisonInterpretation != null) { assessment.editHistory = [{ recordedAt: at, resource, operation, snapshot: null, comparisonInterpretation: structuredClone(container.comparisonInterpretation) }]; effects.retainedHistory = true; }
    assessments.push(assessment);
  } else {
    if (operation === 'add') assessment = resource === 'emfRooms' ? assessments.find(row => row.id === patch.assessmentId) : emfRecords(data, 'emfRooms').find(row => row.id === patch.roomId)?.assessment;
    if (!assessment) throw new Error('The selected EMF assessment or room is no longer available.');
    const old = structuredClone(assessment), { editHistory: _history, ...original } = old;
    if (!Array.isArray(assessment.rooms)) throw new Error('Review this older room collection in its editor.');
    const rooms = assessment.rooms as EMFRow[], originalRooms = [...rooms];
    // Persist legacy identities before a splice so surviving rooms retain their ID.
    const roomIds = rooms.map((room, index) => emfRoomId(assessment!.id as string, agentDataObject(room), index));
    if (resource === 'emfAssessments') {
      if (operation === 'remove') {
        effects.removedAssessment = true; effects.removedRooms = rooms.length; effects.removedHistory = Array.isArray(assessment.editHistory) ? assessment.editHistory.length : 0;
        for (const room of rooms) { effects.removedPhotos += Array.isArray(room.photos) ? room.photos.length : 0; effects.removedMeasurements += Object.keys(room.measurements == null ? {} : agentDataObject(room.measurements)).length; }
        assessments.splice(assessments.indexOf(assessment), 1);
      } else Object.assign(assessment, patch);
    } else if (resource === 'emfRooms') {
      if (operation === 'add') rooms.push({ id, name: patch.name, sleeping: patch.sleeping, location: patch.location ?? '', note: patch.note ?? '', measurements: {}, sources: patch.sources ?? [], mitigations: patch.mitigations ?? [] });
      else if (operation === 'remove') {
        if (rooms.length <= 1) throw new Error('Remove the assessment to remove its last room.');
        const room = existing!.room!; effects.removedRooms = 1; effects.removedPhotos = Array.isArray(room.photos) ? room.photos.length : 0; effects.removedMeasurements = Object.keys(room.measurements == null ? {} : agentDataObject(room.measurements)).length;
        rooms.splice(existing!.roomIndex!, 1);
      } else {
        const room = existing!.room!, { keepPhotoIndices, ...fields } = patch;
        Object.assign(room, fields);
        if (keepPhotoIndices !== undefined) {
          if (room.photos != null && !Array.isArray(room.photos)) throw new Error('Review these photos in the native editor.');
          const photos = (room.photos || []) as unknown[], indices = keepPhotoIndices as number[];
          if (indices.some(index => index >= photos.length)) throw new Error('The selected photo is no longer available.');
          room.photos = indices.map(index => photos[index]); effects.removedPhotos = photos.length - indices.length;
        }
      }
    } else {
      const parent = operation === 'add' ? emfRecords(data, 'emfRooms').find(row => row.id === patch.roomId) : existing;
      if (!parent?.room) throw new Error('The selected EMF room is no longer available.');
      const room = parent.room, type = operation === 'add' ? patch.type as string : existing!.type!;
      const measurements = room.measurements == null ? {} : agentDataObject(room.measurements);
      if (operation === 'add' && measurements[type] != null) throw new Error('A reading of this type already exists in this room. Read it before correcting it.');
      if (patch.unit !== undefined && patch.unit !== SBM_2015_THRESHOLDS[type]?.unit) throw new Error(`Use the canonical ${SBM_2015_THRESHOLDS[type]?.unit} unit for ${type}; do not reinterpret a different unit.`);
      if (operation === 'remove') { delete measurements[type]; effects.removedMeasurements = 1; }
      else { const { roomId: _roomId, type: _type, ...fields } = patch; measurements[type] = { ...(measurements[type] == null ? {} : agentDataObject(measurements[type])), ...fields, ...(operation === 'add' ? { id } : {}) }; }
      room.measurements = measurements;
    }
    if (profileDataValuesEqual(old, assessment) && !effects.removedAssessment) throw new Error('These values are already recorded.');
    if (!effects.removedAssessment) {
      for (const room of rooms) if (room.id == null) {
        const originalIndex = originalRooms.indexOf(room);
        if (originalIndex >= 0) room.id = roomIds[originalIndex];
      }
      if (assessment.editHistory != null && !Array.isArray(assessment.editHistory)) throw new Error('Review this older EMF edit history in its editor.');
      const history = (assessment.editHistory || []) as unknown[];
      history.push({ recordedAt: at, resource, operation, snapshot: original, ...(container.comparisonInterpretation != null ? { comparisonInterpretation: structuredClone(container.comparisonInterpretation) } : {}) });
      assessment.editHistory = history; effects.retainedHistory = true;
      effects.interpretationCleared = assessment.interpretation != null; delete assessment.interpretation;
    }
  }
  effects.comparisonCleared = container.comparisonInterpretation != null;
  delete container.comparisonInterpretation;
  const after = projectEMFRow(resource, emfRecords(data, resource).find(row => row.id === id) || null);
  return { after, effects };
}
