// Native Light commands publish only after canonical storage accepts the change.
import type { ProfileData } from '../types/app-state.js';
import type { ProfileFieldExpectation } from './data-core-types.js';
import { state } from './state.js';
import { createUniqueId } from './unique-id.js';
import { LIGHT_MEASUREMENT_FIELDS } from './light-measurement-fields.js';
import type { LightMeasurementRecord } from './light-measurement-fields.js';
import * as mutations from './light-measurement-mutations.js';
import { captureLightEnvironmentWrite, commitLightEnvironmentWrite, queueLightEnvironmentWrite } from './light-env-record-store.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
export function captureLightMeasurementOwner() {
  const profile = state.currentProfile, data = state.importedData;
  const source = structuredClone(Object.fromEntries(LIGHT_MEASUREMENT_FIELDS.map(key => [key, data?.[key] ?? null])));
  const current = () => state.currentProfile === profile && state.importedData === data;
  return { current, unchanged: () => current() && LIGHT_MEASUREMENT_FIELDS.every(key => profileDataValuesEqual(data?.[key] ?? null, source[key])) };
}
async function change<T>(owned: readonly ProfileFieldExpectation['key'][], mutate: (next: ProfileData, source: ProfileData) => T, failure: T, canCommit = () => true): Promise<T> {
  const profile = state.currentProfile, observed = state.importedData;
  if (!profile || !observed) return failure;
  return queueLightEnvironmentWrite(profile, async () => {
    const authorized = () => state.currentProfile === profile && state.importedData === observed && canCommit();
    if (!authorized()) return failure;
    try {
      const { base, source, next } = captureLightEnvironmentWrite(observed, owned), result = mutate(next, source);
      if (result === null || result === false) return failure;
      if (!profileDataValuesEqual(next, base) && !(await commitLightEnvironmentWrite(profile, observed, base, source, next, authorized, LIGHT_MEASUREMENT_FIELDS, owned)).saved) return failure;
      return result;
    } catch { return failure; }
  });
}
export function nativeLightMeasurements() { return state.importedData ? mutations.latestMeasurementRecords(state.importedData) : []; }
export function normalizeLightMeasurements() { return change(['lightMeasurements'], next => mutations.normalizeMeasurementRecords(next, Date.now()), false); }
export function saveNativeLightMeasurement(tool: string, value: unknown, opts: Record<string, unknown> = {}, canCommit = () => true) {
  const at = Date.now(), entry: LightMeasurementRecord = { id: createUniqueId('lm_'), tool, value, capturedAt: at, confidence: opts.confidence == null ? 0.7 : Number(opts.confidence),
    label: opts.label ? String(opts.label) : null, notes: String(opts.notes || ''), extra: opts.extra as Record<string, unknown> || null, roomId: opts.roomId ? String(opts.roomId) : null };
  return change(['lightMeasurements'], next => mutations.addMeasurementRecord(next, entry, at), null, canCommit);
}
export function deleteNativeLightMeasurement(id: unknown, canCommit = () => true) { return typeof id === 'string' ? change(['lightMeasurements'], next => mutations.deleteMeasurementRecord(next, id), false, canCommit) : Promise.resolve(false); }
export function nativeLightAudits() { return state.importedData ? mutations.auditRecords(state.importedData) : []; }
export function saveNativeLightAudit(label: unknown = '', environment: unknown = state.importedData?.lightEnvironment, canCommit = () => true) {
  const owner = captureLightMeasurementOwner(), frozenEnvironment = structuredClone(environment);
  const at = Date.now(), date = new Date(at), day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`, id = createUniqueId('la_');
  return change(['lightAudits'], (next, source) => mutations.captureAuditRecord(next, id, String(label || `Audit ${mutations.auditRecords(next).length + 1}`).replace(/\s+/g, ' ').trim().slice(0, 80), '', at, day, frozenEnvironment == null ? source.lightEnvironment : frozenEnvironment, mutations.latestMeasurementRecords(source)), null, () => owner.unchanged() && canCommit());
}
export function updateNativeLightAudit(id: unknown, patch: unknown, canCommit = () => true) {
  return typeof id === 'string' && patch && typeof patch === 'object' ? change(['lightAudits'], next => mutations.updateAuditRecord(next, id, patch as Record<string, unknown>, Date.now()), null, canCommit) : Promise.resolve(null);
}
export function deleteNativeLightAudit(id: unknown, canCommit = () => true) { return typeof id === 'string' ? change(['lightAudits'], next => mutations.deleteAuditRecord(next, id), false, canCommit) : Promise.resolve(false); }

export function saveNativeLightWalkthrough(pauses: readonly mutations.LightWalkthroughPause[], canCommit = () => true) {
  const owner = captureLightMeasurementOwner(), captured = structuredClone(pauses), at = Date.now();
  return change(['lightEnvironment', 'lightMeasurements'], next => mutations.addLightWalkthroughRecords(next, captured, at, createUniqueId), null, () => owner.unchanged() && canCommit());
}
