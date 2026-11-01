// Native device/session commands publish only a canonical committed result.
import type { ProfileData } from '../types/app-state.js';
import { state } from './state.js';
import * as mutations from './light-device-mutations.js';
import { LIGHT_DEVICE_FIELDS, LIGHT_DEVICE_PAYLOAD_FIELDS } from './light-device-fields.js';
import { captureLightEnvironmentWrite, commitLightEnvironmentWrite, queueLightEnvironmentWrite } from './light-env-record-store.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { DEVICE_ENGINE_VERSION } from './light-device-session-engine.js';
import { requestDeviceSessionAnalysis } from './light-sun-analysis-runtime.js';
export type { LightDeviceRecord, DeviceSessionRecord, DeviceSessionInput, CustomDeviceInput } from './light-device-mutations.js';
import type { LightDeviceRecord, DeviceSessionRecord, DeviceSessionInput, CustomDeviceInput } from './light-device-mutations.js';

interface LightDevicesStoreDeps { maybeAnalyzeDeviceSessionAfterFinish(session: DeviceSessionRecord): unknown }
const storeDeps: LightDevicesStoreDeps = { maybeAnalyzeDeviceSessionAfterFinish: requestDeviceSessionAnalysis };
export function configureLightDevicesStore(deps: Partial<LightDevicesStoreDeps> = {}) { const previous = { ...storeDeps }; Object.assign(storeDeps, deps); return previous; }
function analyze(session: DeviceSessionRecord | null) { if (session) try { storeDeps.maybeAnalyzeDeviceSessionAfterFinish(session); } catch { /* Saved data remains authoritative. */ } }
async function change<T>(mutate: (next: ProfileData) => T, failure: T, after?: (result: T) => void, canCommit: () => boolean = () => true): Promise<T> {
  const profileId = state.currentProfile, observed = state.importedData;
  if (!profileId || !observed) return failure;
  return queueLightEnvironmentWrite(profileId, async () => {
    const current = () => state.currentProfile === profileId && state.importedData === observed;
    const allowed = () => current() && canCommit();
    if (!allowed()) return failure;
    const { base, source, next } = captureLightEnvironmentWrite(observed, LIGHT_DEVICE_PAYLOAD_FIELDS), result = profileDataValuesEqual(source.sunDefaults ?? null, base.sunDefaults ?? null) ? mutate(next) : failure;
    if (result === null || result === false) return failure;
    if (!profileDataValuesEqual(next, source) && !(await commitLightEnvironmentWrite(profileId, observed, base, source, next, allowed, LIGHT_DEVICE_FIELDS, LIGHT_DEVICE_PAYLOAD_FIELDS)).saved) return failure;
    if (current()) after?.(result);
    return result;
  });
}
const currentSession = (record: DeviceSessionRecord | null, data = state.importedData) => record && getDeviceSessions(data).find(row => row.id === record.id) || record;
const currentDevice = (record: LightDeviceRecord | null, data = state.importedData) => record && mutations.getDevices(data).find(row => row.id === record.id) || record;
export function getDevices(): LightDeviceRecord[] { return state.importedData ? mutations.getDevices(state.importedData) : []; }
export function getDeviceSessions(data: Pick<ProfileData, 'deviceSessions'> = state.importedData): DeviceSessionRecord[] { return data ? mutations.getDeviceSessions(data) : []; }
export async function addDeviceFromPresetRecord(preset: LightDeviceRecord | null | undefined, overrides: Partial<LightDeviceRecord> = {}, { now = Date.now() } = {}) {
  const data = state.importedData; return currentDevice(await change(next => mutations.addDeviceFromPresetRecord(next, preset, overrides, { now }), null), data);
}
export async function hydrateDevicesFromPresetRecords(presets: readonly LightDeviceRecord[] | null | undefined) { return change(next => mutations.hydrateDevicesFromPresetRecords(next, presets), false); }
export async function deleteDevice(id: string) { return change(next => mutations.deleteDevice(next, id), false); }
export async function logDeviceSession(input: DeviceSessionInput = {}) {
  const data = state.importedData; return currentSession(await change(next => mutations.logDeviceSession(next, input), null, record => analyze(currentSession(record, data))), data);
}
export function getActiveDeviceSession() { return state.importedData ? mutations.getActiveDeviceSession(state.importedData) : null; }
export async function startDeviceSession(input: Omit<DeviceSessionInput, 'durationMin' | 'notes'> = {}) { return change(next => mutations.startDeviceSession(next, input), null); }
export async function stopDeviceSession(id?: string | null) {
  const data = state.importedData; return currentSession(await change(next => mutations.stopDeviceSession(next, id), null, record => analyze(currentSession(record, data))), data);
}
export async function updateDeviceSession(id: string, patch: Record<string, unknown> = {}, options: { canCommit?: () => boolean } = {}) {
  const data = state.importedData; return currentSession(await change(next => mutations.updateDeviceSession(next, id, patch), null, record => analyze(currentSession(record, data)), options.canCommit), data);
}
export async function deleteDeviceSession(id: string) { return change(next => mutations.deleteDeviceSession(next, id), false); }
export function rollingDeviceTotals(days = 7) { return state.importedData ? mutations.rollingDeviceTotals(state.importedData, days) : {}; }
export async function rehydrateStaleDeviceSessions() {
  return change(next => mutations.rehydrateStaleDeviceSessions(next), { rehydrated: 0, engineVersion: DEVICE_ENGINE_VERSION });
}
export async function addCustomDevice(spec: CustomDeviceInput | null | undefined) { const data = state.importedData; return currentDevice(await change(next => mutations.addCustomDevice(next, spec), null), data); }

export async function updateDeviceRecord(id: string, patch: CustomDeviceInput) { const data = state.importedData; return currentDevice(await change(next => mutations.updateDeviceRecord(next, id, patch), null), data); }
