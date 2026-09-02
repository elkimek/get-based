// @ts-check
// Persisted Sun session lifecycle; UI flows inject live-runtime hooks here.

import { getErrorMessage } from './caught-error.js';
import { encryptedGetItem } from './crypto.js';
import { state } from './state.js';
import { saveImportedData, saveImportedDataForProfile } from './data.js';
import { deleteImportedArrayItem } from './data-merge.js';
import { normalizeAgentProposals } from './profile-data-migrations.js';
import { migrateProfileData, profileStorageKey } from './profile.js';
import { requestSunSessionAnalysis } from './light-sun-analysis-runtime.js';
import { BODY_REGIONS } from './sun-body-silhouette.js';
import {
  EXPOSURE_PRESETS,
  POSTURE_MULTIPLIERS,
  SURFACE_ALBEDO,
  _normalizePSMTier,
  photosensitiveMedScale,
} from './sun-session-model.js';
import { createUniqueId } from './unique-id.js';

/**
 * @typedef {object} SunSessionsStoreDeps
 * @property {(sess: any) => void} commitCurrentSlice
 * @property {(id: any, state: any) => void} setLiveState
 * @property {(id: any) => void} clearLiveState
 * @property {(ms: number) => string} formatElapsed
 * @property {(session: any) => void} maybeAnalyzeSessionAfterFinish
 * @property {(opts: any) => Promise<any>} fetchAtmosphere
 * @property {(opts: any) => any} reconstructSpectrum
 * @property {(opts: any) => any} computeChannelDoses
 * @property {(opts: any) => number} erythemalSED
 * @property {(opts: any) => number} fractionOfMED
 * @property {(opts: any) => number} retinalUVdose
 * @property {(date: Date, lat: number, lon: number) => number} solarZenithAngle
 * @property {(skinType: string) => string | null} skinTypeToFitzpatrick
 * @property {(options?: any) => Promise<boolean>} persistImportedData
 * @property {(profileId: string, importedData: any, options?: any) => Promise<boolean>} persistImportedDataForProfile
 * @property {(profileId: string) => Promise<any>} loadProfileData
 */

/** @type {SunSessionsStoreDeps} */
const storeDeps = {
  commitCurrentSlice: () => {},
  setLiveState: () => {},
  clearLiveState: () => {},
  formatElapsed: (ms) => `${Math.max(0, Math.floor((ms || 0) / 60000))}m`,
  maybeAnalyzeSessionAfterFinish: requestSunSessionAnalysis,
  fetchAtmosphere: async () => null,
  reconstructSpectrum: () => null,
  computeChannelDoses: () => ({}),
  erythemalSED: () => 0,
  fractionOfMED: () => 0,
  retinalUVdose: () => 0,
  solarZenithAngle: () => 90,
  skinTypeToFitzpatrick: (skinType) => (String(skinType || '').match(/^(I{1,3}|IV|VI?)\b/) || [])[1] || null,
  persistImportedData: saveImportedData,
  persistImportedDataForProfile: saveImportedDataForProfile,
  loadProfileData: async (profileId) => {
    const raw = await encryptedGetItem(profileStorageKey(profileId, 'imported'));
    if (raw == null) return null;
    const profileData = JSON.parse(raw);
    if (!profileData || typeof profileData !== 'object') throw new Error('Stored profile data is invalid');
    migrateProfileData(profileData);
    return profileData;
  },
};

/** @param {Partial<SunSessionsStoreDeps>} [deps] */
export function configureSunSessionsStore(deps = {}) {
  const previous = { ...storeDeps };
  Object.assign(storeDeps, deps);
  return previous;
}

function runSessionAnalysis(session) {
  try { storeDeps.maybeAnalyzeSessionAfterFinish(session); } catch (_) {}
}

export function getSessions(importedData = state.importedData) {
  if (!importedData) return [];
  if (!Array.isArray(importedData.sunSessions)) importedData.sunSessions = [];
  // Strip runtime-only ticker fields accidentally persisted by earlier builds.
  for (const sess of importedData.sunSessions) {
    if (sess && (sess._activeRate || sess._activeRatePending || sess._fractionOfMED)) {
      delete sess._activeRate;
      delete sess._activeRatePending;
      delete sess._fractionOfMED;
    }
  }
  return importedData.sunSessions;
}

const MAX_PROPOSAL_RECONCILE_ATTEMPTS = 3;

/** @param {string} profileId @param {any} sourceData */
async function latestProfileData(profileId, sourceData) {
  if (state.currentProfile === profileId && state.importedData) return state.importedData;
  const stored = await storeDeps.loadProfileData(profileId);
  if (state.currentProfile === profileId && state.importedData) return state.importedData;
  return stored || sourceData;
}

/** @param {any} profileData @param {string} proposalId */
function findAgentSession(profileData, proposalId) {
  return (Array.isArray(profileData?.sunSessions) ? profileData.sunSessions : [])
    .find(session => session?.createdBy?.type === 'agent'
      && session.createdBy.idempotencyKey === proposalId);
}

/** @param {any} sourceData @param {any} targetData @param {string} proposalId */
function copyAgentSession(sourceData, targetData, proposalId) {
  if (sourceData === targetData) return;
  const sourceSession = findAgentSession(sourceData, proposalId);
  if (!sourceSession) return;
  if (!Array.isArray(targetData.sunSessions)) targetData.sunSessions = [];
  if (!findAgentSession(targetData, proposalId)) {
    targetData.sunSessions.push(structuredClone(sourceSession));
  }
}

/** @param {{profileId:string,sourceData:any,sourceProposal:any,updates:Record<string,any>,reason:string,persist:(profileId:string,profileData:any,options:any)=>Promise<any>,copyActionEvidence?:boolean}} options */
export async function persistAgentProposalTransition({
  profileId,
  sourceData,
  sourceProposal,
  updates,
  reason,
  persist,
  copyActionEvidence = false,
}) {
  for (let attempt = 0; attempt < MAX_PROPOSAL_RECONCILE_ATTEMPTS; attempt += 1) {
    let targetData;
    try { targetData = await latestProfileData(profileId, sourceData); } catch (_) {
      return { persisted: false, profileStillActive: false };
    }
    if (!targetData || typeof targetData !== 'object') {
      return { persisted: false, profileStillActive: false };
    }

    const hadProposals = Object.prototype.hasOwnProperty.call(targetData, 'agentProposals');
    const previousProposals = structuredClone(targetData.agentProposals ?? []);
    if (copyActionEvidence) copyAgentSession(sourceData, targetData, sourceProposal.id);
    normalizeAgentProposals(targetData).push({ ...structuredClone(sourceProposal), ...structuredClone(updates) });
    normalizeAgentProposals(targetData);

    const saved = await persist(profileId, targetData, { immediate: true, reason });
    if (saved === false) {
      if (!copyActionEvidence) {
        if (hadProposals) targetData.agentProposals = previousProposals;
        else delete targetData.agentProposals;
      }
      // The action already persisted its session; retain Applied evidence so retry cannot duplicate it.
      const activeTarget = state.currentProfile === profileId && state.importedData === targetData;
      return { persisted: false, profileStillActive: copyActionEvidence && activeTarget };
    }
    if (state.currentProfile !== profileId) {
      return { persisted: true, profileStillActive: false };
    }
    if (state.importedData === targetData) {
      return { persisted: true, profileStillActive: true };
    }
  }
  return { persisted: false, profileStillActive: false };
}

export function getActiveSession() {
  return getSessions().find(s => !s.endedAt) || null;
}

// Start a session from a legacy exposure preset or anatomical regions; regions win.
/**
 * @param {{
 *   exposurePreset?: string,
 *   regions?: string[],
 *   eyeMode?: string,
 *   lensTint?: string,
 *   glassBetween?: boolean,
 *   location?: any,
 *   posture?: string,
 *   surfaceAlbedo?: string,
 *   rotatedSides?: boolean
 * }} [opts]
 */
export async function startSession({ exposurePreset = 'face_hands', regions, eyeMode = 'direct', lensTint = 'clear', glassBetween = false, location, posture = 'standing', surfaceAlbedo = 'grass', rotatedSides = false } = {}) {
  const id = createUniqueId('sun_');

  let preset, fraction, regionsArr;
  // An explicit empty regions array means nothing selected; never substitute a preset.
  if (Array.isArray(regions)) {
    if (regions.length === 0) throw new Error('startSession: regions array was empty — pick at least one region or pass exposurePreset instead');
    regionsArr = normalizedRegionList(regions);
    if (regionsArr.length === 0) throw new Error('startSession: regions array contained no recognized body regions');
    fraction = bodyFractionForRegions(regionsArr);
    preset = { key: 'detailed' };
  } else {
    preset = EXPOSURE_PRESETS.find(p => p.key === exposurePreset) || EXPOSURE_PRESETS[0];
    fraction = preset.fraction;
    regionsArr = [];
  }

  const session = {
    id,
    startedAt: Date.now(),
    endedAt: null,
    location: location || null,
    // A front↔back flip closes the timed segment; it is not a dose multiplier.
    bodyExposure: { preset: preset.key, fraction, regions: regionsArr, sunscreenSPF: null, glassBetween, rotatedSides: !!rotatedSides },
    eyeExposure: { mode: glassBetween && eyeMode === 'direct' ? 'glass-window' : eyeMode, lensTint, durationSec: null }, // durationSec assigned at stop
    posture,                  // body orientation multiplier — see POSTURE_MULTIPLIERS
    surfaceAlbedo,            // ground reflectance multiplier — see SURFACE_ALBEDO
    atmosphere: null, // populated at stop or fetched async
    doses: null,
    safety: null,
    exposureSegments: [],
    accumulatedPausedMs: 0,
    calculationStatus: 'pending',
  };
  getSessions().push(session);
  await saveImportedData();
  return id;
}

// Stop an in-progress session and (optionally) compute doses.
export async function stopSession(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess) return null;
  const now = Date.now();
  if (!sess.paused) storeDeps.commitCurrentSlice(sess);
  if (sess.paused && Number.isFinite(sess.pausedAt)) {
    sess.accumulatedPausedMs = (sess.accumulatedPausedMs || 0) + Math.max(0, now - sess.pausedAt);
  }
  sess.endedAt = now;
  sess.paused = false;
  delete sess.pausedAt;
  const activeMs = Math.max(0, (sess.endedAt - sess.startedAt) - (sess.accumulatedPausedMs || 0));
  const durationMin = activeMs / 60000;
  sess.durationMin = durationMin;
  sess.calculationStatus = 'pending';
  if (sess.eyeExposure && sess.eyeExposure.durationSec == null) {
    sess.eyeExposure.durationSec = Math.round(durationMin * 60);
  }
  storeDeps.clearLiveState(id);
  // Freeze live elapsed fields before rerender, including stalled/background sync paths.
  if (typeof document !== 'undefined') {
    document.querySelectorAll(`[data-live-elapsed-for="${CSS.escape(id)}"]`).forEach(el => {
      el.removeAttribute('data-live-elapsed-for');
      el.textContent = storeDeps.formatElapsed(activeMs);
    });
  }
  await saveImportedData();
  return sess;
}

// Log a completed session in one shot (after-the-fact entry).
export async function logCompletedSession(payload, target = {}) {
  const hasExplicitProfileTarget = typeof target.profileId === 'string'
    && target.profileId.length > 0
    && target.importedData
    && typeof target.importedData === 'object';
  const sourceData = hasExplicitProfileTarget ? target.importedData : state.importedData;
  const importedData = hasExplicitProfileTarget
    ? await latestProfileData(target.profileId, sourceData)
    : sourceData;
  const sessions = getSessions(importedData);
  const idempotencyKey = payload?.createdBy?.type === 'agent'
    && typeof payload.createdBy.idempotencyKey === 'string'
    ? payload.createdBy.idempotencyKey
    : null;
  if (idempotencyKey) {
    const existing = sessions.find(candidate => candidate?.createdBy?.type === 'agent'
      && candidate.createdBy.actionId === payload.createdBy.actionId
      && candidate.createdBy.idempotencyKey === idempotencyKey);
    if (existing?.id) {
      if (hasExplicitProfileTarget) copyAgentSession(importedData, sourceData, idempotencyKey);
      return existing.id;
    }
  }
  const id = createUniqueId('sun_');
  const session = Object.assign({
    id,
    startedAt: payload.startedAt || Date.now(),
    endedAt: payload.endedAt || Date.now(),
    location: payload.location || null,
    bodyExposure: payload.bodyExposure || { preset: 'face_hands', fraction: 0.05, regions: [], sunscreenSPF: null, glassBetween: false, rotatedSides: false },
    eyeExposure: payload.eyeExposure || { mode: 'indoor', lensTint: 'clear', durationSec: 0 },
    atmosphere: payload.atmosphere || null,
    doses: payload.doses || null,
    safety: payload.safety || null,
    notes: payload.notes || '',
    exposureSegments: payload.exposureSegments || [],
    accumulatedPausedMs: payload.accumulatedPausedMs || 0,
  }, payload);
  if (!session.durationMin) session.durationMin = Math.max(0, (session.endedAt - session.startedAt) / 60000);
  session.calculationStatus = session.location ? 'pending' : 'needs-location';
  sessions.push(session);
  let saved;
  try {
    saved = hasExplicitProfileTarget
      ? await storeDeps.persistImportedDataForProfile(
        target.profileId,
        importedData,
        { forceProfileScope: true, immediate: true, reason: 'agent-action-sun-session' },
      )
      : await storeDeps.persistImportedData();
  } catch (error) {
    const index = sessions.findIndex(candidate => candidate === session || candidate?.id === id);
    if (index >= 0) sessions.splice(index, 1);
    throw error;
  }
  if (saved !== true) {
    const index = sessions.findIndex(candidate => candidate === session || candidate?.id === id);
    if (index >= 0) sessions.splice(index, 1);
    throw new Error('Could not save completed sunlight session');
  }
  if (hasExplicitProfileTarget && idempotencyKey) copyAgentSession(importedData, sourceData, idempotencyKey);
  return id;
}

export async function deleteSession(id) {
  const sessions = getSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx < 0) return false;
  deleteImportedArrayItem(state.importedData, 'sunSessions', idx);
  storeDeps.clearLiveState(id);
  await saveImportedData();
  return true;
}

// Pause idempotently: commit the current rate slice, then stop dose accrual.
export async function pauseSession(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt) return null;
  if (sess.paused) return sess;
  // Preserve cumulative dose across the pause boundary.
  storeDeps.commitCurrentSlice(sess);
  sess.paused = true;
  sess.pausedAt = Date.now();
  // Clear rate so resume forces a fresh snapshot with current atm.
  storeDeps.setLiveState(id, { ratePerMin: null });
  await saveImportedData();
  return sess;
}

// Resume with a fresh atmosphere snapshot on the next ticker pass.
export async function resumeSession(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt || !sess.paused) return null;
  const now = Date.now();
  sess.accumulatedPausedMs = (sess.accumulatedPausedMs || 0)
    + Math.max(0, now - (sess.pausedAt || now));
  sess.paused = false;
  delete sess.pausedAt;
  await saveImportedData();
  return sess;
}

function markSessionEdited(sess) {
  sess.updatedAt = Date.now();
}

function normalizedRegionList(regions) {
  if (!Array.isArray(regions)) return [];
  const allowed = new Set(BODY_REGIONS.map(r => r.key));
  const out = [];
  for (const key of regions) {
    if (typeof key !== 'string' || !allowed.has(key) || out.includes(key)) continue;
    out.push(key);
  }
  return out;
}

function bodyFractionForRegions(regions) {
  return regions.reduce((sum, key) => {
    const r = BODY_REGIONS.find(b => b.key === key);
    return sum + (r?.fraction || 0);
  }, 0);
}

export async function markSessionRotated(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt) return null;
  if (!sess.bodyExposure) sess.bodyExposure = {};
  if (sess.bodyExposure.rotatedSides) return sess;
  storeDeps.commitCurrentSlice(sess);
  sess.bodyExposure.rotatedSides = true;
  markSessionEdited(sess);
  storeDeps.setLiveState(id, { ratePerMin: null });
  await saveImportedData();
  return sess;
}

export async function setSessionSunscreen(id, spf) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt) return null;
  const nextSpf = Number(spf);
  if (!Number.isFinite(nextSpf) || nextSpf < 0 || nextSpf > 100) return null;
  storeDeps.commitCurrentSlice(sess);
  if (!sess.bodyExposure) sess.bodyExposure = {};
  sess.bodyExposure.sunscreenSPF = nextSpf || null;
  markSessionEdited(sess);
  storeDeps.setLiveState(id, { ratePerMin: null });
  await saveImportedData();
  return sess;
}

export async function setSessionCoverage(id, regions) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt) return null;
  const nextRegions = normalizedRegionList(regions);
  const fraction = bodyFractionForRegions(nextRegions);
  storeDeps.commitCurrentSlice(sess);
  if (!sess.bodyExposure) sess.bodyExposure = {};
  sess.bodyExposure.regions = nextRegions;
  sess.bodyExposure.fraction = fraction;
  sess.bodyExposure.preset = nextRegions.length === 0 ? 'covered' : 'detailed';
  markSessionEdited(sess);
  storeDeps.setLiveState(id, { ratePerMin: null });
  await saveImportedData();
  return sess;
}

// Edit a saved session, bumping updatedAt for merge priority. Duration edits
// re-derive dose and safety so downstream estimates never remain stale.
export async function updateSession(id, patch) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess) return null;
  // Apply allowed fields. Whitelist keeps a careless caller from blowing
  // away the immutable id / startedAt or injecting fields the dose
  // engine would choke on.
  const ALLOWED = ['durationMin', 'endedAt', 'notes'];
  let durationChanged = false;
  for (const k of Object.keys(patch)) {
    if (!ALLOWED.includes(k)) continue;
    if (k === 'durationMin' || k === 'endedAt') durationChanged = true;
    sess[k] = patch[k];
  }
  // Keep durationMin and endedAt consistent — the consumer of either
  // shouldn't have to compute the other. If only one was patched, derive
  // the other from startedAt.
  if (patch.durationMin != null && patch.endedAt == null) {
    sess.endedAt = sess.startedAt + patch.durationMin * 60000;
  } else if (patch.endedAt != null && patch.durationMin == null) {
    sess.durationMin = Math.max(0, (sess.endedAt - sess.startedAt) / 60000);
  }
  if (durationChanged) {
    // A manual whole-session duration edit cannot preserve the timing of
    // previously recorded slices. Fall back to one explicitly edited span
    // instead of silently retaining segment totals for the old duration.
    sess.exposureSegments = [];
    sess.accumulatedPausedMs = 0;
    // Duration is an input to every modeled light and safety value. Never
    // persist the edited time beside estimates derived from the old time,
    // even briefly: the network-backed recalculation may be slow or fail.
    sess.doses = null;
    sess.safety = null;
    sess.atmosphere = null;
    delete sess.aiAnalysis;
    delete sess.engineVersion;
    sess.calculationStatus = sess.location ? 'pending' : 'needs-location';
  }
  // Eye-exposure duration mirrors session duration when not explicitly
  // shorter (eye open the whole time vs eyes closed for some interval).
  if (durationChanged && sess.eyeExposure && sess.eyeExposure.durationSec != null) {
    sess.eyeExposure.durationSec = Math.round(sess.durationMin * 60);
  }
  markSessionEdited(sess);
  await saveImportedData();
  // Re-hydrate doses before resolving the edit. Per-session in-flight promise serializes
  // concurrent edits — without it, two quick updateSession calls can race two
  // fetchAtmosphere awaits and write doses for the older duration after the
  // newer one shipped (the relay briefly holds stale doses).
  if (durationChanged && sess.location) {
    await _runHydrateSession(id, { lat: sess.location.lat, lon: sess.location.lon }, {
      queueAfterExisting: true,
      warnContext: 'hydrateSession after updateSession failed',
    });
  }
  return sess;
}

// Per-session hydrate serialization queue. Map<sessionId, Promise>.
const _hydrateInFlight = new Map();

function _runHydrateSession(id, coords, { queueAfterExisting = false, warnContext = 'hydrateSession failed' } = {}) {
  const existing = _hydrateInFlight.get(id);
  if (existing && !queueAfterExisting) return existing;
  const base = queueAfterExisting && existing ? existing.catch(() => {}) : Promise.resolve();
  const next = base
    .then(() => hydrateSession(id, coords))
    .catch(e => {
      globalThis.console?.warn?.(warnContext, e);
      return null;
    });
  _hydrateInFlight.set(id, next);
  next.finally(() => { if (_hydrateInFlight.get(id) === next) _hydrateInFlight.delete(id); });
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
export function _applyAtmOverrides(atm) {
  if (!atm) return atm;
  const ov = state.importedData?.sunDefaults?.overrides;
  const out = { ...atm };
  delete out._uvOverridden;
  if (!ov) return out;
  if (Number.isFinite(ov.cloudCover)) { out.cloudCover = ov.cloudCover; out._cloudOverridden = true; }
  if (Number.isFinite(ov.ozoneDU)) { out.ozoneDU = ov.ozoneDU; out._ozoneOverridden = true; }
  return out;
}

async function finalizeSegmentedSession(sess, fractionOfMED) {
  const segments = Array.isArray(sess.exposureSegments)
    ? sess.exposureSegments.filter(segment => segment && Number(segment.durationMin) > 0)
    : [];
  if (segments.length === 0) return null;
  const doses = {};
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
  sess.durationMin = durationMin;
  sess.doses = doses;
  const lastAtmosphere = [...segments].reverse().find(segment => segment.atmosphere)?.atmosphere;
  if (lastAtmosphere) sess.atmosphere = { ...lastAtmosphere };
  const lcSkin = state.importedData?.lightCircadian?.skinType;
  const lcRoman = lcSkin && storeDeps.skinTypeToFitzpatrick(lcSkin);
  const configuredFitzpatrick = state.importedData?.sunDefaults?.fitzpatrick || lcRoman || null;
  const fitzpatrick = configuredFitzpatrick || 'I';
  const psmTier = _normalizePSMTier(state.importedData?.sunDefaults?.photosensitiveMeds);
  const medScale = photosensitiveMedScale(psmTier);
  sess.safety = {
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
  sess.engineVersion = SUN_ENGINE_VERSION;
  sess.calculationStatus = 'computed';
  await saveImportedData();
  return sess;
}

/** @param {{ lat?: number, lon?: number }} [coords] */
export async function hydrateSession(id, coords = {}) {
  const { lat, lon } = coords;
  const sess = getSessions().find(s => s.id === id);
  if (!sess || !sess.endedAt) return null;
  const {
    fetchAtmosphere,
    reconstructSpectrum,
    computeChannelDoses,
    erythemalSED,
    fractionOfMED,
    retinalUVdose,
    solarZenithAngle,
  } = storeDeps;
  const segmented = await finalizeSegmentedSession(sess, fractionOfMED);
  if (segmented) {
    runSessionAnalysis(segmented);
    return segmented;
  }
  const useLat = lat ?? sess.location?.lat;
  const useLon = lon ?? sess.location?.lon;
  if (useLat == null || useLon == null) {
    sess.doses = null;
    sess.safety = null;
    sess.atmosphere = null;
    sess.calculationStatus = 'needs-location';
    await saveImportedData();
    return null;
  }
  // A hydrate call means the existing derived snapshot is no longer trusted.
  // Hide it while atmosphere + spectrum inputs are recomputed so the UI can
  // never pair a new input with an old dose or burn estimate.
  sess.doses = null;
  sess.safety = null;
  sess.atmosphere = null;
  sess.calculationStatus = 'pending';
  await saveImportedData();
  const midpoint = new Date((sess.startedAt + sess.endedAt) / 2).toISOString();
  const altitudeM = sess.location?.altitudeM ?? 0;
  try {
    let atm = await fetchAtmosphere({ lat: useLat, lon: useLon, isoTime: midpoint });
    if (!atm) {
      globalThis.console?.warn?.('hydrateSession: atmosphere fetch returned null for', id);
      sess.calculationStatus = 'atmosphere-unavailable';
      await saveImportedData();
      return null;
    }
    atm = _applyAtmOverrides(atm);
    // Strip private override flags before persisting.
    // are presentation-layer markers, not session data; persisting them
    // wastes bytes in localStorage/CRDT and surfaces in exports.
    const { _cloudOverridden, _ozoneOverridden, ...persistedAtm } = atm;
    sess.atmosphere = persistedAtm;
    const zenith = solarZenithAngle(new Date(midpoint), useLat, useLon);
    const spectrum = reconstructSpectrum({
      zenithDeg: zenith,
      ozoneDU: atm.ozoneDU ?? 300,
      altitudeM,
      cloudCover: (atm.cloudCover ?? 0) / 100,
      aod: atm?.airQuality?.aod ?? null,
      targetUVI: atm.uvIndex ?? null,
    });
    const bodyModifiers = {
      glassBetween: !!sess.bodyExposure?.glassBetween,
      sunscreenSPF: sess.bodyExposure?.sunscreenSPF || 0,
    };
    // Apply posture + surface-albedo multipliers to body fraction so
    // hydrated doses match the live engine's accounting.
    const baseFraction = sess.bodyExposure?.fraction ?? 0;
    const postureMult = POSTURE_MULTIPLIERS[sess.posture] ?? 1.0;
    const albedoMult = 1 + (SURFACE_ALBEDO[sess.surfaceAlbedo] ?? 0) * 0.5;
    const skinIrradianceMultiplier = Math.max(0, Math.min(2, postureMult * albedoMult));
    const modeledEyeExposure = bodyModifiers.glassBetween && sess.eyeExposure?.mode === 'direct'
      ? { ...sess.eyeExposure, mode: 'glass-window' }
      : sess.eyeExposure;
    sess.doses = computeChannelDoses({
      spectrum,
      durationMin: sess.durationMin,
      bodyExposureFraction: baseFraction,
      skinIrradianceMultiplier,
      eyeExposure: modeledEyeExposure,
      bodyModifiers,
    });
    const sed = erythemalSED({
      spectrum,
      durationMin: sess.durationMin,
      bodyExposureFraction: baseFraction,
      skinIrradianceMultiplier,
      bodyModifiers,
    });
    // Read from one of two places, in priority order:
    //   1. sunDefaults.fitzpatrick (Light setup card)
    //   2. lightCircadian.skinType (Light & Circadian context card)
    // Falls back to Type I for a conservative burn-safety counter if the user
    // has not configured a skin type. The UI marks this as an assumption.
    const lcSkin = state.importedData?.lightCircadian?.skinType;
    const lcRoman = lcSkin && storeDeps.skinTypeToFitzpatrick(lcSkin);
    const configuredFitzpatrick = state.importedData?.sunDefaults?.fitzpatrick || lcRoman || null;
    const fitzpatrick = configuredFitzpatrick || 'I';
    const psmTier = _normalizePSMTier(state.importedData?.sunDefaults?.photosensitiveMeds);
    const medScale = photosensitiveMedScale(psmTier);
    const ocularActinicUV = retinalUVdose({
      spectrum,
      eyeExposure: modeledEyeExposure,
      zenithDeg: zenith,
      glassBetween: bodyModifiers.glassBetween,
    });
    sess.safety = {
      sed,
      medFraction: fractionOfMED({ sed, fitzpatrick, medScale }),
      ocularActinicUV,
      retinalUV: ocularActinicUV,
      fitzpatrick,
      fitzpatrickAssumed: !configuredFitzpatrick,
      photosensitiveMedTier: psmTier,
      medicationThresholdUnknown: psmTier !== 'none',
      // Legacy boolean kept for backward compat with consumers that
      // haven't migrated to the tier field yet.
      photosensitive: psmTier !== 'none',
    };
    // Stamp the engine version so rehydrateStaleSessions can detect
    // sessions computed under older (buggy) versions and recompute.
    sess.engineVersion = SUN_ENGINE_VERSION;
    sess.calculationStatus = 'computed';
    await saveImportedData();
    runSessionAnalysis(sess);
    return sess;
  } catch (e) {
    globalThis.console?.warn?.('hydrateSession failed', e);
    sess.calculationStatus = 'calculation-error';
    await saveImportedData();
    return null;
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
    try {
      const result = await _runHydrateSession(s.id, { lat: s.location.lat, lon: s.location.lon }, {
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
  _hydrateInFlight.clear();
}
