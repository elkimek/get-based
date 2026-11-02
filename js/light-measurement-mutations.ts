// Portable mutations shared by native Light tools/checkpoints and chat Apply.
import type { ProfileData } from '../types/app-state.js';
import { deleteImportedArrayItem } from './data-merge.js';
import type { LightMeasurementRecord, LightAuditRecord } from './light-measurement-fields.js';
import { mutateLightEnvironment } from './light-env-mutations.js';
import { validAgentDate } from '../shared/agent-data-contract.js';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function measurementRecords(data: ProfileData): LightMeasurementRecord[] {
  if (data.lightMeasurements == null) return [];
  if (!Array.isArray(data.lightMeasurements)) throw new Error('Review the older measurement storage in its editor.');
  return data.lightMeasurements;
}
export function auditRecords(data: ProfileData): LightAuditRecord[] {
  if (data.lightAudits == null) return [];
  if (!Array.isArray(data.lightAudits)) throw new Error('Review the older audit storage in its editor.');
  return data.lightAudits;
}
const key = (row: LightMeasurementRecord) => JSON.stringify([row.roomId || null, row.tool]);
const time = (row: LightMeasurementRecord) => typeof row.capturedAt === 'number' ? row.capturedAt : Number(row.capturedAt || row.takenAt || 0);
export function latestMeasurementRecords(data: ProfileData): LightMeasurementRecord[] {
  const rows = measurementRecords(data), winners = new Map<string, LightMeasurementRecord>();
  for (const row of rows) {
    if (!object(row) || !row.tool || row.tool === 'audit') continue;
    const prior = winners.get(key(row)); if (!prior || time(row) > time(prior)) winners.set(key(row), row);
  }
  return rows.filter(row => !object(row) || !row.tool || row.tool === 'audit' || winners.get(key(row)) === row);
}
function history(row: Record<string, unknown>, field: string): unknown[] {
  if (row[field] != null && !Array.isArray(row[field])) throw new Error('Review this older source history before changing the record.');
  return row[field] as unknown[] || [];
}
function retainReading(target: LightMeasurementRecord, source: LightMeasurementRecord, at: number) {
  const { readingHistory: _history, ...record } = structuredClone(source);
  const prior = history(source, 'readingHistory');
  target.readingHistory = [...history(target, 'readingHistory'), ...prior, { at, record }];
}
function removeReading(data: ProfileData, row: LightMeasurementRecord) {
  const index = measurementRecords(data).indexOf(row); if (index >= 0) deleteImportedArrayItem(data, 'lightMeasurements', index);
}
export function normalizeMeasurementRecords(data: ProfileData, at: number) {
  const rows = measurementRecords(data), keep = latestMeasurementRecords(data); let changed = false;
  for (const row of rows.slice()) if (!keep.includes(row) && object(row)) {
    const winner = keep.find(candidate => object(candidate) && key(candidate) === key(row));
    if (!winner || typeof row.id !== 'string' || !row.id) throw new Error('Review older measurement identities before replacing them.');
    retainReading(winner, row, at); winner.updatedAt = Math.max(at, Number(winner.updatedAt || 0) + 1); removeReading(data, row); changed = true;
  }
  return changed;
}
export function addMeasurementRecord(data: ProfileData, entry: LightMeasurementRecord, at: number) {
  const rows = measurementRecords(data);
  if (rows.some(row => row?.id === entry.id)) throw new Error('This measurement identity already exists.');
  if (entry.tool !== 'audit') for (const prior of rows.slice()) if (object(prior) && key(prior) === key(entry)) {
    if (typeof prior.id !== 'string' || !prior.id) throw new Error('Review older measurement identities before replacing them.');
    retainReading(entry, prior, at); removeReading(data, prior);
  }
  (data.lightMeasurements ??= []).push(entry); return entry;
}
export function updateMeasurementRecord(data: ProfileData, id: string, patch: Record<string, unknown>, at: number) {
  const row = measurementRecords(data).find(row => row?.id === id); if (!row) return null;
  const before = structuredClone(row), after = { ...row, ...structuredClone(patch) };
  if (JSON.stringify(before) === JSON.stringify(after)) return row;
  history(row, 'readingHistory');
  // Keep the original acquisition and earlier corrected inputs as evidence.
  const { readingHistory: _history, ...record } = before;
  Object.assign(row, patch); row.readingHistory = [...history(before, 'readingHistory'), { at, record }];
  delete row.aiAnalysis; row.updatedAt = Math.max(at, Number(before.updatedAt || 0) + 1);
  if (row.tool !== 'audit') for (const peer of measurementRecords(data).slice()) if (peer !== row && object(peer) && key(peer) === key(row)) {
    if (typeof peer.id !== 'string' || !peer.id) throw new Error('Review older measurement identities before replacing them.');
    retainReading(row, peer, at); removeReading(data, peer);
  }
  return row;
}
export function deleteMeasurementRecord(data: ProfileData, id: string) {
  const row = measurementRecords(data).find(row => row?.id === id); if (!row) return false; removeReading(data, row); return true;
}
export function captureAuditRecord(data: ProfileData, id: string, label: string, notes: string, at: number, date: string, environment: unknown = data.lightEnvironment, readings = latestMeasurementRecords(data)) {
  if (!object(environment)) return null;
  const rooms = environment.rooms ?? [], screens = environment.screens ?? [];
  if (!Array.isArray(rooms) || !Array.isArray(screens)) throw new Error('Review the environment before saving a checkpoint.');
  const ids = new Set(rooms.filter(object).map(room => room.id).filter(Boolean));
  const audit: LightAuditRecord = { id, date, label, notes, rooms: structuredClone(rooms), screens: structuredClone(screens),
    measurements: structuredClone(readings.filter(row => object(row) && !!row.roomId && ids.has(row.roomId))), createdAt: at };
  if (auditRecords(data).some(row => row?.id === id)) throw new Error('This checkpoint identity already exists.');
  (data.lightAudits ??= []).push(audit); return audit;
}
export function updateAuditRecord(data: ProfileData, id: string, patch: Record<string, unknown>, at: number) {
  const row = auditRecords(data).find(row => row?.id === id); if (!row) return null;
  const normalized: Record<string, unknown> = {};
  if ('label' in patch) normalized.label = String(patch.label || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if ('notes' in patch) normalized.notes = String(patch.notes || '').slice(0, 1000);
  if ('date' in patch) { if (!validAgentDate(patch.date)) throw new Error('Supply a valid checkpoint date.'); normalized.date = patch.date; }
  if (!Object.entries(normalized).some(([key, value]) => JSON.stringify(row[key]) !== JSON.stringify(value))) return row;
  const previous = { date: row.date, label: row.label, notes: row.notes, ...(row.aiAnalysis ? { aiAnalysis: structuredClone(row.aiAnalysis) } : {}) };
  row.metadataHistory = [...history(row, 'metadataHistory'), { at, record: previous }];
  Object.assign(row, normalized); delete row.aiAnalysis; row.updatedAt = Math.max(at, Number(row.updatedAt || 0) + 1); return row;
}
export function deleteAuditRecord(data: ProfileData, id: string) {
  const index = auditRecords(data).findIndex(row => row?.id === id); if (index < 0) return false;
  deleteImportedArrayItem(data, 'lightAudits', index); return true;
}

export interface LightWalkthroughPause { label: string; cameraLevel: number; lux: number | null; levelLabel: string; }
export function addLightWalkthroughRecords(data: ProfileData, pauses: readonly LightWalkthroughPause[], at: number, nextId: (prefix: string) => string) {
  if (!pauses.length || pauses.some(pause => !pause || typeof pause.label !== 'string' || typeof pause.levelLabel !== 'string' || !Number.isFinite(pause.cameraLevel) || pause.cameraLevel < 0 || pause.cameraLevel > 100 || pause.lux !== null)) throw new Error('Review the captured relative-brightness walkthrough before saving.');
  const bulk = addMeasurementRecord(data, { id: nextId('lm_'), tool: 'audit', value: pauses.length, capturedAt: at, confidence: 0.5, roomId: null, label: null, notes: '', extra: {
    rooms: pauses.map((pause, index) => ({ index: index + 1, lux: null, cameraLevel: pause.cameraLevel, levelLabel: pause.levelLabel, label: pause.label.trim() || `Room ${index + 1}` })), method: 'relative-camera-walkthrough' } }, at);
  const measurements: LightMeasurementRecord[] = []; let bound = 0;
  const date = new Date(at), day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  for (const [index, pause] of pauses.entries()) {
    const label = pause.label.trim(); if (!label) continue;
    const rooms = data.lightEnvironment?.rooms || [], matching = rooms.filter((room: { name?: unknown }) => typeof room?.name === 'string' && room.name.toLowerCase().trim() === label.toLowerCase());
    if (matching.length > 1) throw new Error('Several rooms share this label. Resolve their identities before attaching a walkthrough.');
    let roomId = matching[0]?.id;
    if (!roomId) { roomId = nextId('room_'); mutateLightEnvironment(data, 'lightRooms', roomId, 'add', { name: label }, at, day, true); }
    measurements.push(addMeasurementRecord(data, { id: nextId('lm_'), tool: 'brightness-proxy', value: pause.cameraLevel, capturedAt: at, roomId, confidence: 0.25, label: null, notes: '', extra: { method: 'relative-camera-walkthrough', levelLabel: pause.levelLabel, auditPauseIndex: index + 1 } }, at)); bound++;
  }
  return { bulk, measurements, bound, labeled: pauses.filter(pause => pause.label.trim()).length, count: pauses.length };
}
