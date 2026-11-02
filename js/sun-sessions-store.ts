import type { ProfileData } from '../types/app-state.js';
// sun-sessions-store.js — persisted Sun session lifecycle, hydration, and safety.
//
// This module owns importedData.sunSessions[] CRUD and dose hydration. UI flows
// stay in sun.js / sun-active-session.js and inject live-runtime hooks here.

import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';
import { solarZenithAngle as solarZenith } from './sun-uvdata-atmosphere.js';
import { stageSunSessionChange } from './sun-session-record-store.js';
import { canApplySunLiveAction, transitionSunLiveSession, retainUnmeasuredSunInterval, createSunLiveSession, assertReportedSunStart } from './sun-session-lifecycle.js';
import type { SunLiveAction, SunLivePatch, SunLiveStartInput } from './sun-session-lifecycle.js';
import { editSunSessionInputs, resetSunSessionCalculation, retainSunSessionEvidence, sunSessionMissingInputs } from './sun-session-mutations.js';
import { deleteImportedArrayItem } from './data-merge.js';
import { requestSunSessionAnalysis } from './light-sun-analysis-runtime.js';
import { BODY_REGIONS } from './sun-body-regions.js';
import {
  EXPOSURE_PRESETS,
  _normalizePSMTier,
  photosensitiveMedScale,
  sunSessionInputKey,
  sunSessionExposure,
} from './sun-session-model.js';
import { createUniqueId } from './unique-id.js';

import type { AtmosphereSnapshot } from './sun-uvdata-atmosphere.js';
import type { UVDataClient } from './sun-uvdata-client-types.js';
import * as spectrumMath from './sun-spectrum.js';
import type { SpectrumEyeExposure } from './sun-spectrum.js';
import type { SpectralDistribution } from './sun-spectrum-device.js';
import type { SunSessionExposureInput } from './sun-session-model.js';

// Persisted records remain unvalidated. These are the fields the lifecycle
// consumes; imported records can omit derived outputs and exposure details.
type SessionAtmosphere = Partial<AtmosphereSnapshot> & {
  _uvOverridden?: boolean; _cloudOverridden?: boolean; _ozoneOverridden?: boolean;
};
type SessionDoses = Record<string, number>;
type SessionEyeExposure = { mode?: string; lensTint?: string; durationSec?: number | null };
interface ExposureSegment {
  startedAt?: number; endedAt?: number;
  durationMin?: number; sed?: number; ocularActinicUV?: number; retinalUV?: number;
  doses?: SessionDoses | null; atmosphere?: SessionAtmosphere | null;
  bodyExposure?: SunSessionRecord['bodyExposure'];
  eyeExposure?: SunSessionRecord['eyeExposure']; posture?: SunSessionRecord['posture']; surfaceAlbedo?: SunSessionRecord['surfaceAlbedo'];
  location?: SunSessionRecord['location']; modelInputs?: Pick<ProfileData, 'sunDefaults' | 'lightCircadian'>; calculationStatus?: string; reportedInputsVersion?: number;
}
export interface SunSessionRecord extends Omit<SunSessionExposureInput, 'bodyExposure' | 'eyeExposure'> {
  id: string; startedAt: number; endedAt?: number | null; durationMin?: number;
  updatedAt?: number; location?: { lat?: number; lon?: number; altitudeM?: number } | null;
  bodyExposure?: NonNullable<SunSessionExposureInput['bodyExposure']> & { preset?: string; regions?: string[] } | null;
  eyeExposure?: SessionEyeExposure | null;
  atmosphere?: SessionAtmosphere | null; doses?: SessionDoses | null;
  safety?: Partial<ReturnType<typeof sessionSafety>> | null;
  exposureSegments?: ExposureSegment[]; accumulatedPausedMs?: number;
  paused?: boolean; pausedAt?: number; resumedAt?: number; engineVersion?: number; calculationStatus?: string;
  reportedInputsVersion?: number;
  notes?: string; aiAnalysis?: unknown;
  [key: string]: unknown;
  _activeRate?: unknown; _activeRatePending?: unknown; _fractionOfMED?: unknown;
}
interface SunSessionsStoreDeps {
  commitCurrentSlice(session: SunSessionRecord): unknown;
  setLiveState(id: string, state: { ratePerMin: null }): void;
  clearLiveState(id: string): void;
  formatElapsed(ms: number): string;
  maybeAnalyzeSessionAfterFinish(session: SunSessionRecord): unknown;
  fetchAtmosphere(options: Parameters<UVDataClient['fetchAtmosphere']>[0]): Promise<SessionAtmosphere | null>;
  reconstructSpectrum(options: Parameters<typeof spectrumMath.reconstructSpectrum>[0]): SpectralDistribution | null;
  computeChannelDoses(options: Parameters<typeof spectrumMath.computeChannelDoses>[0]): SessionDoses;
  erythemalSED: typeof spectrumMath.erythemalSED;
  fractionOfMED: typeof spectrumMath.fractionOfMED;
  retinalUVdose: typeof spectrumMath.retinalUVdose;
  solarZenithAngle: UVDataClient['solarZenithAngle'];
  skinTypeToFitzpatrick(skinType: string): string | null;
}
interface StartSessionOptions {
  exposurePreset?: string; regions?: string[]; eyeMode?: string; lensTint?: string;
  glassBetween?: boolean; location?: SunSessionRecord['location']; posture?: string;
  surfaceAlbedo?: string; rotatedSides?: boolean;
}
type SessionCoordinates = { lat?: number | undefined; lon?: number | undefined };
type SessionPatch = Partial<Pick<SunSessionRecord, 'durationMin' | 'endedAt' | 'notes'>>;
export interface SunSessionWriteGuard { authorized: () => boolean; expected: ProfileData; onSaved?: () => void; }

const storeDeps: SunSessionsStoreDeps = {
  commitCurrentSlice: () => {},
  setLiveState: () => {},
  clearLiveState: () => {},
  formatElapsed: (ms) => `${Math.max(0, Math.floor((ms || 0) / 60000))}m`,
  maybeAnalyzeSessionAfterFinish: requestSunSessionAnalysis,
  fetchAtmosphere: async options => (await import('./sun-uvdata.js')).fetchAtmosphere(options) as ReturnType<SunSessionsStoreDeps['fetchAtmosphere']>,
  reconstructSpectrum: spectrumMath.reconstructSpectrum,
  computeChannelDoses: spectrumMath.computeChannelDoses,
  erythemalSED: spectrumMath.erythemalSED,
  fractionOfMED: spectrumMath.fractionOfMED,
  retinalUVdose: spectrumMath.retinalUVdose,
  solarZenithAngle: solarZenith,
  skinTypeToFitzpatrick: (skinType) => (String(skinType || '').match(/^(I{1,3}|IV|VI?)\b/) || [])[1] || null,
};
let liveSliceProducerConfigured = false;
export function hasSunLiveSliceProducer() { return liveSliceProducerConfigured; }

export function configureSunSessionsStore(deps: Partial<SunSessionsStoreDeps> = {}) {
  if (typeof deps.commitCurrentSlice === 'function') liveSliceProducerConfigured = true;
  const previous = { ...storeDeps }; Object.assign(storeDeps, deps); return previous;
}

function runSessionAnalysis(session: SunSessionRecord) {
  if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN)) return;
  try { Promise.resolve(storeDeps.maybeAnalyzeSessionAfterFinish(session)).catch(() => {}); } catch (_) {}
}

export function getSessions(data: Pick<ProfileData, 'sunSessions'> = state.importedData): SunSessionRecord[] {
  if (!data) return [];
  if (!Array.isArray(data.sunSessions)) data.sunSessions = [];
  // Strip runtime-only ticker fields that earlier dev builds may have
  // accidentally persisted onto session objects. One-time cleanup on
  // first read; no-op on records written after the fix.
  for (const sess of data.sunSessions as SunSessionRecord[]) {
    if (sess && (sess._activeRate || sess._activeRatePending || sess._fractionOfMED)) {
      delete sess._activeRate;
      delete sess._activeRatePending;
      delete sess._fractionOfMED;
    }
  }
  return data.sunSessions;
}

export function getActiveSession() {
  return getSessions().find(s => !s.endedAt) || null;
}

function normalizedRegionList(regions: unknown) {
  if (!Array.isArray(regions)) return [];
  const allowed = new Set(BODY_REGIONS.map(region => region.key));
  return [...new Set(regions.filter((key): key is string => typeof key === 'string' && allowed.has(key)))];
}
function bodyFractionForRegions(regions: string[]) { return regions.reduce((sum, key) => sum + (BODY_REGIONS.find(region => region.key === key)?.fraction || 0), 0); }
function stagedSlice(row: SunSessionRecord) { const publish = storeDeps.commitCurrentSlice(row); return () => { if (typeof publish === 'function') publish(); }; }
async function changeSession(id: string, mutate: (row: SunSessionRecord, source: ProfileData) => { skip?: boolean; unavailable?: boolean; publish?: (() => void) | undefined }, guard?: SunSessionWriteGuard) {
  const original = getSessions().find(row => row.id === id); if (!original) return null;
  const owns = sessionOwnership(original), current = () => owns() && (!guard || guard.authorized());
  const result = await stageSunSessionChange((next, source) => {
    const row = getSessions(next).find(row => row.id === id); if (!row) return { value: null, skip: true };
    const result = mutate(row, source); return { value: result.unavailable ? null : id, ...result };
  }, current, current, guard?.expected, guard?.onSaved);
  return result && current() ? original : null;
}

// Native pickers supply their chosen defaults; chat adds use explicit source commands.
export async function startSession({ exposurePreset = 'face_hands', regions, eyeMode = 'direct', lensTint = 'clear', glassBetween = false, location, posture = 'standing', surfaceAlbedo = 'grass', rotatedSides = false }: StartSessionOptions = {}, guard?: SunSessionWriteGuard) {
  const id = createUniqueId('sun_');
  let preset: string, fraction: number, regionsArr: string[];
  if (Array.isArray(regions)) {
    regionsArr = normalizedRegionList(regions); if (!regionsArr.length) throw new Error('Empty regions: pick a body region or pass exposurePreset');
    fraction = bodyFractionForRegions(regionsArr); preset = 'detailed';
  } else { const selected = EXPOSURE_PRESETS.find(option => option.key === exposurePreset) || EXPOSURE_PRESETS[0]!; fraction = selected.fraction; preset = selected.key; regionsArr = []; }
  return insertLiveSunSession(id, () => createSunLiveSession(id, Date.now(), { location: location || null,
    bodyExposure: { preset, fraction, regions: regionsArr, sunscreenSPF: null, glassBetween, rotatedSides: !!rotatedSides },
    eyeExposure: { mode: glassBetween && eyeMode === 'direct' ? 'glass-window' : eyeMode, lensTint, durationSec: null }, posture, surfaceAlbedo }), guard);
}
export async function startReportedSunSession(id: string, input: SunLiveStartInput, locationSpecific: boolean, guard: SunSessionWriteGuard) {
  return insertLiveSunSession(id, source => { assertReportedSunStart(source, input, locationSpecific); return createSunLiveSession(id, Date.now(), input, true); }, guard);
}
async function insertLiveSunSession(id: string, create: (source: ProfileData) => SunSessionRecord, guard?: SunSessionWriteGuard) {
  const generation = _storeGeneration, current = () => generation === _storeGeneration && (!guard || guard.authorized()); let accepted = false;
  const result = await stageSunSessionChange((next, source) => {
    if (getSessions(next).some(row => !row.endedAt)) throw new Error('A Sun session is already active.');
    if (getSessions(next).some(row => row.id === id) || next._deleted?.sunSessions?.includes(id)) throw new Error('This Sun session identity is already recorded. Read it again.');
    getSessions(next).push(create(source)); return { value: id };
  }, current, current, guard?.expected, () => { accepted = true; guard?.onSaved?.(); });
  if (!result && !accepted) throw Object.assign(new Error('This Sun session owner is no longer current.'), { noChangeApplied: true }); return id;
}
export async function stopSession(id: string, guard?: SunSessionWriteGuard) { return applyLiveAction(id, 'stop', {}, guard); }
export async function logCompletedSession(payload: Partial<SunSessionRecord>) {
  const id = createUniqueId('sun_');
  const result = await stageSunSessionChange(next => {
    const row: SunSessionRecord = { startedAt: payload.startedAt || Date.now(), endedAt: payload.endedAt || Date.now(), location: payload.location || null,
      bodyExposure: { preset: 'face_hands', fraction: 0.05, regions: [], sunscreenSPF: null, glassBetween: false, rotatedSides: false },
      eyeExposure: { mode: 'indoor', lensTint: 'clear', durationSec: 0 }, atmosphere: null, doses: null, safety: null, notes: '', exposureSegments: [], accumulatedPausedMs: 0, ...structuredClone(payload), id };
    if (!row.durationMin) row.durationMin = Math.max(0, (row.endedAt! - row.startedAt) / 60000);
    row.calculationStatus = row.location ? 'pending' : 'needs-location'; getSessions(next).push(row); return { value: id };
  });
  if (!result) throw new Error('This Sun session owner is no longer current.'); return result;
}
export async function deleteSession(id: string) {
  const original = getSessions().find(row => row.id === id); if (!original) return false;
  const profile = state.currentProfile, data = state.importedData, generation = _storeGeneration;
  const result = await stageSunSessionChange(next => {
    const index = getSessions(next).findIndex(row => row.id === id); if (index < 0) return { value: false, skip: true };
    deleteImportedArrayItem(next, 'sunSessions', index); return { value: true, publish: () => storeDeps.clearLiveState(id) };
  }, sessionOwnership(original), () => state.currentProfile === profile && state.importedData === data && generation === _storeGeneration && !getSessions().some(row => row.id === id)); return result === true;
}
export async function pauseSession(id: string, guard?: SunSessionWriteGuard) { return applyLiveAction(id, 'pause', {}, guard); }
export async function persistActiveSunSlice(id: string) {
  return changeSession(id, row => {
    if (row.endedAt || row.paused) return { skip: true, unavailable: true };
    const publish = stagedSlice(row); return { publish: () => { publish(); storeDeps.setLiveState(id, { ratePerMin: null }); } };
  });
}
export async function resumeSession(id: string, guard?: SunSessionWriteGuard) { return applyLiveAction(id, 'resume', {}, guard); }
async function applyLiveAction(id: string, action: SunLiveAction, patch: SunLivePatch, guard?: SunSessionWriteGuard) {
  if (getSessions().find(row => row.id === id)?.endedAt && action !== 'stop') return null;
  return changeSession(id, (row, source) => {
    if (!canApplySunLiveAction(row, action)) {
      if (guard) throw Object.assign(new Error('This live Sun action changed. Read the timer again.'), { noChangeApplied: true });
      return { skip: true, unavailable: action === 'resume' || !!row.endedAt && action !== 'stop' };
    }
    const at = Date.now(); retainSunSessionEvidence(row, at, source);
    const count = row.exposureSegments?.length || 0;
    const publishSlice = !row.paused && action !== 'resume' ? stagedSlice(row) : () => {};
    if (!row.paused && action !== 'resume' && (row.exposureSegments?.length || 0) === count) retainUnmeasuredSunInterval(row, source, Date.now());
    transitionSunLiveSession(row, action, patch, Date.now());
    return { publish: () => {
      publishSlice();
      if (action !== 'stop') { storeDeps.setLiveState(id, { ratePerMin: null }); return; }
      storeDeps.clearLiveState(id);
      if (typeof document !== 'undefined') document.querySelectorAll('[data-live-elapsed-for]').forEach(element => {
        if (element.getAttribute('data-live-elapsed-for') === id) { element.removeAttribute('data-live-elapsed-for'); element.textContent = storeDeps.formatElapsed(row.durationMin! * 60000); }
      });
    } };
  }, guard);
}
export async function markSessionRotated(id: string, guard?: SunSessionWriteGuard) { return applyLiveAction(id, 'rotateSides', {}, guard); }
export async function setSessionSunscreen(id: string, spf: unknown, guard?: SunSessionWriteGuard) {
  const value = Number(spf); if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return applyLiveAction(id, 'setSunscreen', { sunscreenSPF: value }, guard);
}
export async function setSessionCoverage(id: string, regions: unknown, guard?: SunSessionWriteGuard) {
  const normalized = normalizedRegionList(regions);
  return applyLiveAction(id, 'setCoverage', { regions: normalized }, guard);
}
export async function updateSession(id: string, patch: SessionPatch) {
  const original = getSessions().find(row => row.id === id); if (!original) return null;
  const current = sessionOwnership(original); let recalculate = false;
  const allowed = Object.fromEntries(Object.entries(patch).filter(([key]) => ['durationMin', 'endedAt', 'notes'].includes(key)));
  const row = await changeSession(id, (draft, source) => {
    const result = editSunSessionInputs(draft, allowed, Date.now(), source); recalculate = result.recalculate; return { skip: !result.changed };
  });
  if (!row || !current()) return null;
  if (recalculate) { _hydrateRequests.delete(row); if (row.location) await _runHydrateSession(id, { lat: row.location.lat, lon: row.location.lon }, { queueAfterExisting: true, warnContext: 'hydrateSession after updateSession failed' }); }
  return current() ? row : null;
}

// Key work by record identity, so a new profile reusing an id cannot inherit it.
const _hydrateInFlight = new Map<SunSessionRecord, Promise<SunSessionRecord | null>>();
const _hydrateRequests = new WeakMap<SunSessionRecord, object>();
let _storeGeneration = 0;

function sessionOwnership(sess: SunSessionRecord) {
  const data = state.importedData;
  const profile = state.currentProfile;
  const generation = _storeGeneration;
  return () => generation === _storeGeneration
    && state.currentProfile === profile && state.importedData === data
    && !!data?.sunSessions?.includes(sess);
}

function _runHydrateSession(id: string, coords: SessionCoordinates, { queueAfterExisting = false, warnContext = 'hydrateSession failed' } = {}) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess) return Promise.resolve(null);
  const isCurrent = sessionOwnership(sess);
  const existing = _hydrateInFlight.get(sess);
  if (existing && !queueAfterExisting) return existing;
  const base = queueAfterExisting && existing ? existing.catch(() => {}) : Promise.resolve();
  const next = base
    .then(() => isCurrent() ? hydrateSession(id, coords) : null)
    .catch(e => {
      globalThis.console?.warn?.(warnContext, e);
      return null;
    });
  _hydrateInFlight.set(sess, next);
  next.finally(() => { if (_hydrateInFlight.get(sess) === next) _hydrateInFlight.delete(sess); });
  return next;
}

// Hydrate a session record with computed atmosphere + channel doses.
// Idempotent — reruns after edits.
// Bump this whenever the dose/safety math changes incompatibly so
// `rehydrateStaleSessions` knows to re-run hydrate on existing sessions
// computed under the old engine. Versions:
//   1: original v1.7.0 ship
//   2: 2026-05-02 fix — Bird-Riordan Rayleigh formula was inverted,
//      collapsing UVB irradiance to ~1e-8 W/m²/nm.
//   3: 2026-05-02 second fix — proper Bass-Paur ozone cross-sections
//      (was ~3× too transmissive in UVB), added diffuse scatter term
//      (was ~50% under in UVB / 30% under in UVA), corrected aerosol
//      baseline to clean-sky default β=0.10 (was 0.27 / polluted),
//      added cosZ to direct-beam horizontal flux. Implied UVI at
//      zenith=30° now matches real-world (7.4 vs 7-8 reference);
//      vit D synthesis at low sun naturally falls to ~zero per
//      Bird-Riordan + JPL 19-5 cross-sections without the hand-tuned
//      threshold gate carrying the load alone.
//   4: 2026-05-03 — added posture multiplier (lying-supine ×1.4 etc),
//      surface albedo reception multiplier (sand/water/snow), AOD-driven
//      Bird-Riordan β when atm provides aerosol_optical_depth, and
//      switched retinalUVdose from unweighted UV (280-400 sum) to
//      actinic-weighted (CIE erythemal) — old sessions had retinalUV
//      stored at 30-100× the correct ICNIRP-comparable value.
//   5: 2026-05-03 — fix Open-Meteo past_days=0 bug. Forecast endpoint
//      was queried with `forecast_days=1` and no `past_days`, so any
//      session hydrated for a midpoint outside today (yesterday or
//      earlier) snapped to today's 00:00 hour → atmosphere UVI 0 and
//      the vit-D channel read "below UVI threshold" for sessions that
//      were actually fine. URL now requests past_days=2; existing
//      sessions stamped at v4 re-hydrate to pick up correct atm.
//   6: 2026-05-05 — fix shapeOpenMeteoResponse anchoring `todayPrefix`
//      on Date.now() instead of the session midpoint. Real-time logs
//      worked, but retro-logged + pre-dawn sessions pinned daily.peakAt
//      and the peak-finder scan to the wrong day in `past_days=2`. Some
//      v5 sessions also persisted a single-day hourly array (24 entries
//      instead of 72) when Open-Meteo returned just today's slice; bump
//      forces rehydrate so those replay against the corrected anchor.
//   7: 2026-05-05 — widen past_days from 2 to 7 in the Open-Meteo URL
//      so retro-logged sessions up to a week old hydrate against the
//      actual session day rather than snapping to today's 00:00 hour.
//      Bump forces v6 sessions older than 2d to replay against the
//      wider interval.
//   8: local SED/PBM separation, UVI-calibrated UV, ICNIRP actinic ocular
//      weighting, and segment-preserving pause/coverage/sunscreen handling.
//   9: behind-glass sessions now apply glass to both skin and eye paths;
//      ocular actinic UV is attenuated wavelength-by-wavelength rather than
//      being falsely zeroed, and legacy direct-eye/glass records are normalized.
export const SUN_ENGINE_VERSION = 9;

// Override advanced scenario inputs when present in sunDefaults. Manual UVI
// was retired: old saved `overrides.uvIndex` values are intentionally ignored
// so a hidden legacy value cannot alter current UV or session dose math.
export function _applyAtmOverrides<T extends SessionAtmosphere | null | undefined>(atm: T, data: Pick<ProfileData, 'sunDefaults'> = state.importedData) {
  if (!atm) return atm;
  const ov = data?.sunDefaults?.overrides;
  const out = { ...atm };
  delete out._uvOverridden;
  if (!ov) return out;
  if (Number.isFinite(ov.cloudCover)) { out.cloudCover = ov.cloudCover; out._cloudOverridden = true; }
  if (Number.isFinite(ov.ozoneDU)) { out.ozoneDU = ov.ozoneDU; out._ozoneOverridden = true; }
  return out;
}

function sessionSafety(sed: number, ocularActinicUV: number, fractionOfMED: SunSessionsStoreDeps['fractionOfMED'], data: Pick<ProfileData, 'sunDefaults' | 'lightCircadian'> = state.importedData) {
  const lcSkin = data?.lightCircadian?.skinType;
  const lcRoman = lcSkin && storeDeps.skinTypeToFitzpatrick(lcSkin);
  const configuredFitzpatrick: string | null = data?.sunDefaults?.fitzpatrick || lcRoman || null;
  const fitzpatrick = configuredFitzpatrick || 'I';
  const psmTier = _normalizePSMTier(data?.sunDefaults?.photosensitiveMeds);
  const medScale = photosensitiveMedScale(psmTier);
  return {
    sed,
    medFraction: fractionOfMED({ sed, fitzpatrick, medScale }),
    ocularActinicUV,
    retinalUV: ocularActinicUV,
    fitzpatrick,
    fitzpatrickAssumed: !configuredFitzpatrick,
    photosensitiveMedTier: psmTier,
    medicationThresholdUnknown: psmTier !== 'none',
    photosensitive: psmTier !== 'none',
  };
}

function finalizeSegmentedSession(sess: SunSessionRecord, fractionOfMED: SunSessionsStoreDeps['fractionOfMED'], source: ProfileData) {
  const segments = Array.isArray(sess.exposureSegments)
    ? sess.exposureSegments.filter(segment => segment && Number(segment.durationMin) > 0)
    : [];
  if (segments.length === 0) return null;
  const doses: SessionDoses = {};
  let sed = 0;
  let ocularActinicUV = 0;
  let durationMin = 0;
  for (const segment of segments) {
    durationMin += Number(segment.durationMin) || 0;
    sed += Number(segment.sed) || 0;
    ocularActinicUV += Number(segment.ocularActinicUV ?? segment.retinalUV) || 0;
    for (const [key, value] of Object.entries(segment.doses || {})) {
      if (Number.isFinite(value)) doses[key] = (doses[key] || 0) + value;
    }
  }
  if (sess.doses || sess.atmosphere || sess.safety) retainSunSessionEvidence(sess, Date.now(), source, 'calculation');
  sess.durationMin = durationMin;
  sess.doses = doses;
  const lastAtmosphere = [...segments].reverse().find(segment => segment.atmosphere)?.atmosphere;
  if (lastAtmosphere) sess.atmosphere = { ...lastAtmosphere };
  sess.safety = sessionSafety(sed, ocularActinicUV, fractionOfMED, source);
  sess.engineVersion = SUN_ENGINE_VERSION;
  sess.calculationStatus = 'computed';
  return sess;
}

export async function hydrateSession(id: string, coords: SessionCoordinates = {}, options: { canAnalyze?: () => boolean } = {}) {
  const sess = getSessions().find(row => row.id === id); if (!sess || !sess.endedAt) return null;
  const ownsSession = sessionOwnership(sess), request = {}; _hydrateRequests.set(sess, request);
  let inputKey = sunSessionInputKey(sess, state.importedData);
  const isCurrent = () => ownsSession() && _hydrateRequests.get(sess) === request && sunSessionInputKey(sess, state.importedData) === inputKey;
  const physical = structuredClone({ sunDefaults: state.importedData.sunDefaults ?? null, lightCircadian: state.importedData.lightCircadian });
  const { fetchAtmosphere, reconstructSpectrum, computeChannelDoses, erythemalSED, fractionOfMED, retinalUVdose, solarZenithAngle } = storeDeps;
  const persist = async (edit: (draft: SunSessionRecord, source: ProfileData) => void) => {
    const saved = await stageSunSessionChange((next, source) => {
      const row = getSessions(next).find(candidate => candidate.id === id); if (!row) return { value: false, skip: true };
      edit(row, source); return { value: true };
    }, isCurrent); return saved === true;
  };
  if (sunSessionMissingInputs(sess).length) {
    await persist(draft => { resetSunSessionCalculation(draft); draft.calculationStatus = 'needs-inputs'; }); return null;
  }
  const calculate = async (interval: SunSessionRecord, inputs: Pick<ProfileData, 'sunDefaults' | 'lightCircadian'>) => {
    const midpoint = new Date((interval.startedAt + interval.endedAt!) / 2).toISOString();
    let atm = await fetchAtmosphere({ lat: interval.location!.lat!, lon: interval.location!.lon!, isoTime: midpoint });
    if (!isCurrent() || !atm) return null;
    atm = _applyAtmOverrides(atm, inputs);
    const { _cloudOverridden, _ozoneOverridden, ...persistedAtm } = atm;
    const zenith = solarZenithAngle(new Date(midpoint), interval.location!.lat!, interval.location!.lon!);
    const spectrum = reconstructSpectrum({ zenithDeg: zenith, ozoneDU: atm.ozoneDU ?? 300, altitudeM: interval.location?.altitudeM ?? 0,
      cloudCover: (atm.cloudCover ?? 0) / 100, aod: atm.airQuality?.aod ?? null, targetUVI: atm.uvIndex ?? null });
    const exposure = sunSessionExposure(interval);
    const doses = computeChannelDoses({ spectrum, durationMin: interval.durationMin!, ...exposure } as Parameters<typeof spectrumMath.computeChannelDoses>[0]);
    const sed = erythemalSED({ spectrum, durationMin: interval.durationMin!, ...exposure } as Parameters<typeof spectrumMath.erythemalSED>[0]);
    const ocularActinicUV = retinalUVdose({ spectrum, eyeExposure: exposure.eyeExposure as SpectrumEyeExposure | null, zenithDeg: zenith, glassBetween: exposure.bodyModifiers.glassBetween });
    return { atmosphere: persistedAtm, doses, sed, ocularActinicUV, safety: sessionSafety(sed, ocularActinicUV, fractionOfMED, inputs) };
  };
  if (sess.exposureSegments?.some(segment => segment && Number(segment.durationMin) > 0)) {
    const segments = structuredClone(sess.exposureSegments);
    if (segments.some(segment => segment.calculationStatus === 'pending')) {
      if (!await persist(draft => { resetSunSessionCalculation(draft); draft.calculationStatus = 'pending'; })) return null;
      try {
        for (const segment of segments) {
          if (segment.calculationStatus !== 'pending') continue;
          if (segment.location?.lat == null || segment.location.lon == null) { await persist(draft => { draft.calculationStatus = 'needs-location'; }); return null; }
          if (!Number.isFinite(segment.startedAt) || !Number.isFinite(segment.endedAt) || !Number.isFinite(segment.durationMin) || segment.durationMin! <= 0
            || Math.abs(segment.endedAt! - segment.startedAt! - segment.durationMin! * 60000) > 1) throw new Error('Invalid saved Sun interval.');
          const interval: SunSessionRecord = { id: sess.id, startedAt: segment.startedAt!, endedAt: segment.endedAt!, durationMin: segment.durationMin!,
            location: segment.location, bodyExposure: segment.bodyExposure ?? null, eyeExposure: segment.eyeExposure ?? null, posture: segment.posture ?? null, surfaceAlbedo: segment.surfaceAlbedo ?? null };
          if (segment.reportedInputsVersion === 1) interval.reportedInputsVersion = 1;
          if (sunSessionMissingInputs(interval).length) { await persist(draft => { resetSunSessionCalculation(draft); draft.calculationStatus = 'needs-inputs'; }); return null; }
          const result = await calculate(interval, segment.modelInputs || physical); if (!isCurrent()) return null;
          if (!result) { await persist(draft => { draft.calculationStatus = 'atmosphere-unavailable'; }); return null; }
          Object.assign(segment, { doses: result.doses, atmosphere: result.atmosphere, sed: result.sed, ocularActinicUV: result.ocularActinicUV, calculationStatus: 'computed' });
        }
      } catch (error) {
        if (isCurrent()) await persist(draft => { resetSunSessionCalculation(draft); draft.calculationStatus = 'calculation-error'; });
        return null;
      }
    }
    let acceptedKey = inputKey;
    if (!await persist((draft, source) => { draft.exposureSegments = segments; finalizeSegmentedSession(draft, fractionOfMED, source); acceptedKey = sunSessionInputKey(draft, source); })) return null;
    inputKey = acceptedKey; if (!isCurrent() || sess.calculationStatus !== 'computed') return null;
    if (!options.canAnalyze || options.canAnalyze()) runSessionAnalysis(sess); return sess;
  }
  const useLat = coords.lat ?? sess.location?.lat, useLon = coords.lon ?? sess.location?.lon;
  if (!await persist((draft, source) => {
    if (draft.doses || draft.atmosphere || draft.safety) retainSunSessionEvidence(draft, Date.now(), source, 'calculation');
    resetSunSessionCalculation(draft); draft.calculationStatus = useLat == null || useLon == null ? 'needs-location' : 'pending';
  })) return null;
  if (!isCurrent() || useLat == null || useLon == null) return null;
  try {
    const interval = { ...sess, location: { ...sess.location, lat: useLat, lon: useLon } };
    const result = await calculate(interval, physical); if (!isCurrent()) return null;
    if (!result) { await persist(draft => { draft.calculationStatus = 'atmosphere-unavailable'; }); return null; }
    if (!await persist(draft => { Object.assign(draft, { atmosphere: result.atmosphere, doses: result.doses, safety: result.safety, engineVersion: SUN_ENGINE_VERSION, calculationStatus: 'computed' }); })) return null;
    if (!isCurrent()) return null; if (!options.canAnalyze || options.canAnalyze()) runSessionAnalysis(sess); return sess;
  } catch (error) {
    if (!isCurrent()) return null;
    globalThis.console?.warn?.('hydrateSession failed', error);
    await persist(draft => { resetSunSessionCalculation(draft); draft.calculationStatus = 'calculation-error'; }); return null;
  }
}

// Self-healing on load: walk the saved sessions, re-hydrate any whose
// stamped engineVersion is older than the current SUN_ENGINE_VERSION.
// Cheap (one network call per stale session, debounced; all-fresh
// sessions just iterate the array). Lazy: caller invokes from main.js
// after the engine module is loaded. Skips active sessions and ones
// without a location (atmosphere fetch needs coords).
//
// Idempotent: subsequent calls find no stale sessions and bail in O(N).
//
// Memory note for future engine-version bumps — anything that changes
// the computed values incompatibly (Rayleigh formula, channel action
// spectra, MED thresholds, fitzpatrick mapping) should bump the
// constant so users on the old data get a fresh recompute on reload.
// Pre-2026-05-08: gated by a global `_rehydrateInFlight` boolean which
// rejected the second caller outright. Now relies on per-session
// `_hydrateInFlight` (declared above near hydrateSession) so two
// batches arriving concurrently (e.g., dashboard + light page on cold
// load) share work — each id rehydrates at most once but both callers
// get the promise back.
export async function rehydrateStaleSessions() {
  const sessions = getSessions();
  const data = state.importedData;
  const profile = state.currentProfile;
  const generation = _storeGeneration;
  const stale = sessions.filter(s =>
    s.endedAt &&
    s.location?.lat != null &&
    (s.engineVersion ?? 0) < SUN_ENGINE_VERSION
  );
  if (stale.length === 0) return { rehydrated: 0 };
  // Serialize so we don't fan out N concurrent atmosphere fetches.
  // _runHydrateSession dedups by id, so two batches in parallel don't
  // double-fetch the same session.
  let ok = 0;
  for (const s of stale) {
    if (state.importedData !== data || state.currentProfile !== profile || generation !== _storeGeneration) break;
    if (!sessions.includes(s)) continue;
    try {
      const result = await _runHydrateSession(s.id, { lat: s.location!.lat, lon: s.location!.lon }, {
        warnContext: `rehydrateStaleSessions: ${s.id}`,
      });
      if (result) ok++;
    } catch (e) {
      globalThis.console?.warn?.('rehydrateStaleSessions:', s.id, getErrorMessage(e, e));
    }
  }
  return { rehydrated: ok, ofTotal: stale.length };
}

export function resetSunSessionsStoreState() {
  _storeGeneration++;
  _hydrateInFlight.clear();
}

export function clearSunSessionRuntime(id: string) { storeDeps.clearLiveState(id); }
