// Pure timer transitions shared by native controls and chat review projection.
import type { SunSessionRecord } from './sun-sessions-store.js';
import type { ProfileData } from '../types/app-state.js';
import { BODY_REGIONS } from './sun-body-regions.js';
import { sunSessionMissingInputs } from './sun-session-mutations.js';
import type { SunSessionInputPatch } from './sun-session-mutations.js';
export type SunLiveStartInput = Omit<SunSessionInputPatch, 'startedAt' | 'endedAt' | 'durationMin'>;
export function sunLiveStartChecks(data: ProfileData, savedLocationSpecific: boolean) {
  return { skinTypeConfigured: /^(I|II|III|IV|V|VI)$/.test(String(data.sunDefaults?.fitzpatrick || '')), savedLocationSpecific,
    activeSessionId: data.sunSessions?.find(row => !row.endedAt)?.id || null };
}
export function assertReportedSunStart(data: ProfileData, input: SunLiveStartInput, locationSpecific: boolean) {
  const checks = sunLiveStartChecks(data, locationSpecific);
  if (!checks.skinTypeConfigured) throw new Error('Confirm your Fitzpatrick skin type in Light setup before starting a Sun timer.');
  if (!locationSpecific || input.location?.lat == null || input.location.lon == null) throw new Error('A location more specific than a country is needed. Choose a saved home/current location or report coordinates.');
  if (checks.activeSessionId) throw new Error('A Sun timer is already active. Read that timer instead.');
  if (!(input.bodyExposure?.fraction != null && input.bodyExposure.fraction > 0 && input.bodyExposure.fraction <= 1)) throw new Error('Report which body regions are uncovered before starting the timer.');
}
export function createSunLiveSession(id: string, at: number, input: SunLiveStartInput, reported = false): SunSessionRecord {
  const row: SunSessionRecord = { ...structuredClone(input), id, startedAt: at, endedAt: null, location: structuredClone(input.location || null),
    atmosphere: null, doses: null, safety: null, exposureSegments: [], accumulatedPausedMs: 0, calculationStatus: 'pending' };
  if (reported) {
    row.reportedInputsVersion = 1; row.updatedAt = at;
    if (row.eyeExposure) row.eyeExposure.durationSec = null;
    if (sunSessionMissingInputs(row).length) row.calculationStatus = 'needs-inputs';
  }
  return row;
}
export const SUN_LIVE_ACTIONS = ['pause', 'resume', 'stop', 'setCoverage', 'setSunscreen', 'rotateSides'] as const;
export type SunLiveAction = typeof SUN_LIVE_ACTIONS[number];
export interface SunLivePatch { regions?: string[]; sunscreenSPF?: number; }
export function isSunLiveAction(value: string): value is SunLiveAction { return (SUN_LIVE_ACTIONS as readonly string[]).includes(value); }
export function canApplySunLiveAction(row: SunSessionRecord, action: SunLiveAction) {
  return !row.endedAt && !(action === 'pause' && row.paused) && !(action === 'resume' && !row.paused)
    && !(action === 'rotateSides' && row.bodyExposure?.rotatedSides);
}
export function retainUnmeasuredSunInterval(row: SunSessionRecord, source: ProfileData, at: number) {
  const segments = row.exposureSegments || [], last = segments.at(-1);
  const lastEnd = last?.endedAt ?? row.startedAt + segments.reduce((total, segment) => total + (Number(segment.durationMin) || 0) * 60000, 0);
  const start = Math.max(row.startedAt, row.resumedAt || 0, lastEnd);
  if (!(at > start)) return;
  row.exposureSegments ||= [];
  row.exposureSegments.push({ startedAt: start, endedAt: at, durationMin: (at - start) / 60000,
    bodyExposure: structuredClone(row.bodyExposure ?? null), eyeExposure: { ...structuredClone(row.eyeExposure), durationSec: (at - start) / 1000 },
    posture: row.posture ?? null, surfaceAlbedo: row.surfaceAlbedo ?? null, location: structuredClone(row.location ?? null),
    modelInputs: structuredClone({ sunDefaults: source.sunDefaults ?? null, lightCircadian: source.lightCircadian }),
    ...(row.reportedInputsVersion === 1 ? { reportedInputsVersion: 1 } : {}),
    doses: null, atmosphere: null, calculationStatus: 'pending' });
}
export function transitionSunLiveSession(row: SunSessionRecord, action: SunLiveAction, patch: SunLivePatch, at: number) {
  if (!canApplySunLiveAction(row, action)) throw new Error('This live Sun action is no longer available. Read the timer again.');
  if (!Number.isFinite(at) || !Number.isFinite(row.startedAt) || at < row.startedAt) throw new Error('The timer start is after this action time.');
  if (action === 'pause') { row.paused = true; row.pausedAt = at; }
  if (action === 'resume') {
    row.accumulatedPausedMs = (row.accumulatedPausedMs || 0) + Math.max(0, at - (row.pausedAt || at));
    row.paused = false; row.resumedAt = at; delete row.pausedAt;
  }
  if (action === 'stop') {
    if (row.paused && Number.isFinite(row.pausedAt)) row.accumulatedPausedMs = (row.accumulatedPausedMs || 0) + Math.max(0, at - row.pausedAt!);
    row.endedAt = at; row.paused = false; delete row.pausedAt;
    row.durationMin = Math.max(0, at - row.startedAt - (row.accumulatedPausedMs || 0)) / 60000; row.calculationStatus = 'pending';
    if (row.eyeExposure && row.eyeExposure.durationSec == null) row.eyeExposure.durationSec = row.reportedInputsVersion === 1 ? row.durationMin * 60 : Math.round(row.durationMin * 60);
  }
  if (action === 'setCoverage') {
    const regions = patch.regions!; row.bodyExposure ||= {};
    Object.assign(row.bodyExposure, { regions: [...regions], fraction: regions.reduce((sum, key) => sum + BODY_REGIONS.find(region => region.key === key)!.fraction, 0), preset: regions.length ? 'detailed' : 'covered' });
  }
  if (action === 'setSunscreen') { row.bodyExposure ||= {}; row.bodyExposure.sunscreenSPF = patch.sunscreenSPF!; }
  if (action === 'rotateSides') { row.bodyExposure ||= {}; row.bodyExposure.rotatedSides = true; }
  row.updatedAt = at; delete row.aiAnalysis;
  if (row.reportedInputsVersion === 1) row.calculationStatus = sunSessionMissingInputs(row).length ? 'needs-inputs' : 'pending';
}
