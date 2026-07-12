// @ts-check
// sun-sessions-store.js — persisted Sun session lifecycle, hydration, and safety.
//
// This module owns importedData.sunSessions[] CRUD and dose hydration. UI flows
// stay in sun.js / sun-active-session.js and inject live-runtime hooks here.
import { state } from './state.js';
import { buildSunSessionCalculationCore, compareActiveFreshness, supersedeActiveSessionRecord } from './sun-session-record-utils.js';
import { saveImportedData } from './data.js';
import { deleteImportedArrayItem } from './data-merge.js';
import { BODY_REGIONS } from './sun-body-silhouette.js';
import {
  EXPOSURE_PRESETS,
  POSTURE_MULTIPLIERS,
  SURFACE_ALBEDO,
  SUN_SESSION_SCHEMA_VERSION,
  _normalizePSMTier,
  ocularEffectiveDoseFromSafety,
  photosensitiveMedScale,
  upgradeSunSessionRecord,
} from './sun-session-model.js';
/**
 * @typedef {object} SunSessionsStoreDeps
 * @property {(sess: any) => void} commitCurrentSlice
 * @property {(sess: any, atMs?: number) => any} getLiveDoses
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
 * @property {(opts?: any) => number} computeUVConfidence
 * @property {(date: Date, lat: number, lon: number) => number} solarZenithAngle
 * @property {(skinType: string) => string | null} skinTypeToFitzpatrick
 */
/** @type {SunSessionsStoreDeps} */
const storeDeps = {
  commitCurrentSlice: () => {},
  getLiveDoses: () => null,
  setLiveState: () => {},
  clearLiveState: () => {},
  formatElapsed: (ms) => `${Math.max(0, Math.floor((ms || 0) / 60000))}m`,
  maybeAnalyzeSessionAfterFinish: () => {},
  fetchAtmosphere: async () => null,
  reconstructSpectrum: () => null,
  computeChannelDoses: () => ({}),
  erythemalSED: () => 0,
  fractionOfMED: () => 0,
  retinalUVdose: () => 0,
  computeUVConfidence: () => 0.5,
  solarZenithAngle: () => 90,
  skinTypeToFitzpatrick: (skinType) => (String(skinType || '').match(/^(I{1,3}|IV|VI?)\b/) || [])[1] || null,
};
let _schemaMigrationPending = false;
let _maintenanceSaveQueued = false;
function _queueMaintenanceSave() {
  if (_maintenanceSaveQueued) return;
  _maintenanceSaveQueued = true;
  Promise.resolve().then(async () => {
    _maintenanceSaveQueued = false;
    if (!_schemaMigrationPending) return;
    try {
      await saveImportedData();
      _schemaMigrationPending = false;
    } catch (error) {
      globalThis.console?.warn?.('sun session maintenance save failed', error);
    }
  });
}
export function buildSunSessionCalculation(options = {}) {
  return buildSunSessionCalculationCore(options, {
    computeUVConfidence: storeDeps.computeUVConfidence,
    engineVersion: SUN_ENGINE_VERSION,
  });
}
/** @param {any} session @param {Record<string, any>} [options] */
function stampSessionCalculation(session, options = {}) {
  session.schemaVersion = SUN_SESSION_SCHEMA_VERSION;
  session.calculation = buildSunSessionCalculation({ session, ...options });
}
/** @param {Partial<SunSessionsStoreDeps>} [deps] */
export function configureSunSessionsStore(deps = {}) {
  Object.assign(storeDeps, deps);
}
function runSessionAnalysis(session) {
  try { storeDeps.maybeAnalyzeSessionAfterFinish(session); } catch (_) {}
}
export function getSessions() {
  if (!state.importedData) return [];
  if (!Array.isArray(state.importedData.sunSessions)) state.importedData.sunSessions = [];
  // Strip runtime-only ticker fields that earlier dev builds may have
  // accidentally persisted onto session objects. One-time cleanup on
  // first read; no-op on records written after the fix.
  for (const sess of state.importedData.sunSessions) {
    if (upgradeSunSessionRecord(sess)) _schemaMigrationPending = true;
    if (sess?.endedAt && (sess.doses || sess.safety) && !sess.calculation) {
      let zenithDeg = null;
      try {
        if (sess.location?.lat != null && sess.location?.lon != null) {
          zenithDeg = storeDeps.solarZenithAngle(
            new Date((sess.startedAt + sess.endedAt) / 2),
            sess.location.lat,
            sess.location.lon
          );
        }
      } catch (_) {}
      stampSessionCalculation(sess, { zenithDeg, inferredDuringMigration: true });
      _schemaMigrationPending = true;
    }
    if (sess && (sess._activeRate || sess._activeRatePending || sess._fractionOfMED)) {
      delete sess._activeRate;
      delete sess._activeRatePending;
      delete sess._fractionOfMED;
    }
  }
  return state.importedData.sunSessions;
}
export function getActiveSession() {
  const sessions = getSessions();
  const active = sessions
    .filter(s => !s.endedAt)
    .sort(compareActiveFreshness);
  const canonical = active[0] || null;
  if (canonical && active.length > 1) {
    const resolvedAt = Date.now();
    for (const duplicate of active.slice(1)) {
      if (supersedeActiveSessionRecord(duplicate, canonical, resolvedAt)) _schemaMigrationPending = true;
    }
    _queueMaintenanceSave();
  }
  return canonical;
}
// Start a session — minimal entry with sensible defaults. Returns id.
// Accepts either an `exposurePreset` (legacy 4-preset coarse buckets) or a
// `regions` array (anatomical-region picker output). Regions take priority
// when both are supplied — fraction is computed by summing region fractions.
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
  if (getActiveSession()) {
    throw new Error('A sun session is already active. Stop it before starting another.');
  }
  const id = `sun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  let preset, fraction, regionsArr;
  // If the caller explicitly supplied a regions array, honor it strictly.
  // An empty array means "the user picked nothing" — silently substituting
  // a face_hands preset would record a phantom exposure.
  if (Array.isArray(regions)) {
    if (regions.length === 0) throw new Error('startSession: regions array was empty — pick at least one region or pass exposurePreset instead');
    regionsArr = regions;
    fraction = regions.reduce((sum, key) => {
      const r = BODY_REGIONS.find(b => b.key === key);
      return sum + (r?.fraction || 0);
    }, 0);
    fraction = Math.max(0.05, fraction);
    preset = { key: 'detailed' };
  } else {
    preset = EXPOSURE_PRESETS.find(p => p.key === exposurePreset) || EXPOSURE_PRESETS[0];
    fraction = preset.fraction;
    regionsArr = [];
  }
  const startedAt = Date.now();
  const session = {
    schemaVersion: SUN_SESSION_SCHEMA_VERSION,
    id,
    startedAt,
    updatedAt: startedAt,
    endedAt: null,
    location: location || null,
    // rotatedSides=true means the user flipped front↔back during the
    // session (or alternated). Doubles the effective body fraction in the
    // vit-D IU calc to match dminder's "100% naked = both sides over the
    // session" convention. Set at session start, OR mid-session via the
    // 🔄 Flip button (calls flipSidesMidSession).
    bodyExposure: { preset: preset.key, fraction, regions: regionsArr, sunscreenSPF: null, glassBetween, rotatedSides: !!rotatedSides },
    eyeExposure: { mode: eyeMode, lensTint, durationSec: null }, // durationSec assigned at stop
    posture,                  // body orientation multiplier — see POSTURE_MULTIPLIERS
    surfaceAlbedo,            // ground reflectance multiplier — see SURFACE_ALBEDO
    atmosphere: null, // populated at stop or fetched async
    doses: null,
    safety: null,
  };
  getSessions().push(session);
  await saveImportedData();
  return id;
}

// Stop an in-progress session and (optionally) compute doses.
export async function stopSession(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess) return null;
  if (sess.endedAt) return sess;
  const wasPaused = !!sess.paused;
  sess.endedAt = Date.now();
  if (wasPaused && Number.isFinite(sess.pausedAt)) {
    if (!Array.isArray(sess.pausePeriods)) sess.pausePeriods = [];
    sess.pausePeriods.push({ startedAt: sess.pausedAt, endedAt: sess.endedAt });
  }
  const pausedMs = (sess.pausePeriods || []).reduce((sum, period) => {
    const start = Number(period?.startedAt);
    const end = Number(period?.endedAt);
    return sum + (Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0);
  }, 0);
  const durationMin = Math.max(0, (sess.endedAt - sess.startedAt - pausedMs) / 60000);
  sess.durationMin = durationMin;
  sess.updatedAt = sess.endedAt;
  if (sess.eyeExposure && sess.eyeExposure.durationSec == null) {
    sess.eyeExposure.durationSec = Math.round(durationMin * 60);
  }
  const live = storeDeps.getLiveDoses(sess, sess.endedAt);
  if (live?.doses && typeof live.doses === 'object') {
    sess.doses = Object.fromEntries(
      Object.entries(live.doses).filter(([, value]) => Number.isFinite(value))
    );
    if (live.atm && typeof live.atm === 'object') {
      const { _uvOverridden, _cloudOverridden, _ozoneOverridden, ...persistedAtm } = live.atm;
      sess.atmosphere = persistedAtm;
    }
    const psmTier = live.psmTier || 'none';
    sess.safety = {
      sed: Number.isFinite(live.sed) ? live.sed : 0,
      medFraction: Number.isFinite(live.medFraction) ? live.medFraction : 0,
      ocularEffectiveDose: Number.isFinite(live.ocularEffectiveDose ?? live.retinalUV) ? (live.ocularEffectiveDose ?? live.retinalUV) : 0,
      retinalUV: Number.isFinite(live.retinalUV) ? live.retinalUV : 0,
      fitzpatrick: live.fitzpatrick || 'III',
      photosensitiveMedTier: psmTier,
      photosensitive: psmTier !== 'none',
    };
    sess.doseIntegration = {
      method: 'live-time-integrated',
      maxSliceMinutes: 5,
      completedAt: sess.endedAt,
    };
    if (Array.isArray(live.doseSegments)) sess.doseSegments = live.doseSegments;
    sess.engineVersion = SUN_ENGINE_VERSION;
    let zenithDeg = null;
    try {
      if (sess.location?.lat != null && sess.location?.lon != null) {
        zenithDeg = storeDeps.solarZenithAngle(new Date((sess.startedAt + sess.endedAt) / 2), sess.location.lat, sess.location.lon);
      }
    } catch (_) {}
    stampSessionCalculation(sess, { atmosphere: live.atm, zenithDeg });
  }
  sess.paused = false;
  delete sess.pausedAt;
  delete sess.liveCheckpoint;
  storeDeps.clearLiveState(id);
  // Freeze every live-elapsed element for this session immediately so the
  // dashboard CTA / cards visibly stop ticking even before surfaces re-render
  // (network-stalled awaits, backgrounded tab, sync-driven stops from another
  // device — all paths converge here).
  if (typeof document !== 'undefined') {
    document.querySelectorAll(`[data-live-elapsed-for="${CSS.escape(id)}"]`).forEach(el => {
      el.removeAttribute('data-live-elapsed-for');
      el.textContent = storeDeps.formatElapsed(sess.endedAt - sess.startedAt);
    });
  }
  await saveImportedData();
  runSessionAnalysis(sess);
  return sess;
}

// Log a completed session in one shot (after-the-fact entry).
export async function logCompletedSession(payload) {
  const id = `sun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const session = Object.assign({
    schemaVersion: SUN_SESSION_SCHEMA_VERSION,
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
  }, payload);
  if (!session.durationMin) session.durationMin = Math.max(0, (session.endedAt - session.startedAt) / 60000);
  if (!session.updatedAt) session.updatedAt = session.endedAt || Date.now();
  upgradeSunSessionRecord(session);
  if ((session.doses || session.safety) && !session.calculation) {
    stampSessionCalculation(session, { inferredDuringMigration: true });
  }
  getSessions().push(session);
  await saveImportedData();
  runSessionAnalysis(session);
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

// Pause an active session. Commits the current rate slice to
// committedDoses (so accumulated dose is preserved), then marks the
// session paused so future ticks contribute zero. Active ticker
// continues for elapsed display + UI state but stops accruing dose.
// Idempotent — calling on an already-paused session is a no-op.
export async function pauseSession(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt) return null;
  if (sess.paused) return sess;
  // Commit current slice with the currently-cached rate so the user-
  // visible cumulative dose persists across the pause boundary.
  storeDeps.commitCurrentSlice(sess);
  sess.paused = true;
  sess.pausedAt = Date.now();
  sess.updatedAt = sess.pausedAt;
  if (sess.liveCheckpoint) sess.liveCheckpoint.ratePerMin = null;
  // Clear rate so resume forces a fresh snapshot with current atm.
  storeDeps.setLiveState(id, { ratePerMin: null });
  await saveImportedData();
  return sess;
}

// Resume a paused session — clears paused flag and the ticker re-snapshots
// with current atmosphere on the next pass. New slice begins from now.
export async function resumeSession(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt || !sess.paused) return null;
  const resumedAt = Date.now();
  if (Number.isFinite(sess.pausedAt)) {
    if (!Array.isArray(sess.pausePeriods)) sess.pausePeriods = [];
    sess.pausePeriods.push({ startedAt: sess.pausedAt, endedAt: resumedAt });
  }
  sess.paused = false;
  delete sess.pausedAt;
  sess.updatedAt = resumedAt;
  if (sess.liveCheckpoint) {
    sess.liveCheckpoint.ratePerMin = null;
    sess.liveCheckpoint.snapshotAt = resumedAt;
    sess.liveCheckpoint.savedAt = resumedAt;
  }
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

function trimDoseSegments(segments, endedAt) {
  const out = [];
  for (const segment of segments || []) {
    const start = Number(segment?.startedAt);
    const end = Number(segment?.endedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start >= endedAt) continue;
    const clippedEnd = Math.min(end, endedAt);
    const scale = (clippedEnd - start) / (end - start);
    out.push({
      ...segment,
      endedAt: clippedEnd,
      doses: Object.fromEntries(Object.entries(segment.doses || {}).map(([key, value]) => [key, (Number(value) || 0) * scale])),
      erythemalSED: (Number(segment.erythemalSED) || 0) * scale,
      ocularEffectiveDose: (Number(segment.ocularEffectiveDose) || 0) * scale,
    });
  }
  return out;
}

function applyDoseSegmentsToSession(sess, segments) {
  const doses = {};
  let sed = 0;
  let ocularEffectiveDose = 0;
  for (const segment of segments) {
    for (const [key, value] of Object.entries(segment.doses || {})) {
      doses[key] = (doses[key] || 0) + (Number(value) || 0);
    }
    sed += Number(segment.erythemalSED) || 0;
    ocularEffectiveDose += Number(segment.ocularEffectiveDose) || 0;
  }
  sess.doseSegments = segments;
  sess.doses = doses;
  const fitzpatrick = sess.safety?.fitzpatrick || 'III';
  const psmTier = _normalizePSMTier(sess.safety?.photosensitiveMedTier ?? state.importedData?.sunDefaults?.photosensitiveMeds);
  const medScale = photosensitiveMedScale(psmTier);
  sess.safety = {
    ...(sess.safety || {}),
    sed,
    medFraction: storeDeps.fractionOfMED({ sed, fitzpatrick, medScale }),
    ocularEffectiveDose,
    retinalUV: ocularEffectiveDose,
    fitzpatrick,
    photosensitiveMedTier: psmTier,
    photosensitive: medScale < 1,
  };
}

export async function markSessionRotated(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt) return null;
  if (!sess.bodyExposure) sess.bodyExposure = {};
  if (sess.bodyExposure.rotatedSides) return sess;
  sess.bodyExposure.rotatedSides = true;
  markSessionEdited(sess);
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
  sess.bodyExposure.preset = nextRegions.length === 0 ? 'face_hands' : 'detailed';
  markSessionEdited(sess);
  storeDeps.setLiveState(id, { ratePerMin: null });
  await saveImportedData();
  return sess;
}

// Edit fields on a saved session. Bumps `updatedAt` so the cross-device
// merge (data-merge.js pickTimestamp) picks this version on conflict —
// without that, a careless re-end on a second device would silently
// stick because endedAt-based timestamps favored the later end. With
// updatedAt set, an edit anywhere becomes the canonical version.
//
// When the patch changes session duration (durationMin or endedAt),
// re-derive doses + safety via hydrateSession so the per-channel
// breakdown reflects the new duration. Doses are downstream of duration,
// so leaving them stale would silently misrepresent the session.
export async function updateSession(id, patch) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess) return null;
  const priorEndedAt = Number(sess.endedAt);
  const priorDurationSec = Number(sess.durationMin) * 60;
  const priorEyeDurationSec = Number(sess.eyeExposure?.durationSec);
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
  // Eye-exposure duration mirrors session duration when not explicitly
  // shorter (eye open the whole time vs eyes closed for some interval).
  if (durationChanged && sess.eyeExposure && sess.eyeExposure.durationSec != null) {
    const nextDurationSec = Math.max(0, Math.round(sess.durationMin * 60));
    const eyeCoveredWholePriorSession = !Number.isFinite(priorEyeDurationSec)
      || !Number.isFinite(priorDurationSec)
      || Math.abs(priorEyeDurationSec - priorDurationSec) <= 1;
    sess.eyeExposure.durationSec = eyeCoveredWholePriorSession
      ? nextDurationSec
      : Math.min(priorEyeDurationSec, nextDurationSec);
  }
  let hydratedEditNeeded = durationChanged && !!sess.location;
  if (durationChanged && Array.isArray(sess.doseSegments) && sess.doseSegments.length) {
    if (Number.isFinite(priorEndedAt) && sess.endedAt <= priorEndedAt) {
      const trimmed = trimDoseSegments(sess.doseSegments, sess.endedAt);
      applyDoseSegmentsToSession(sess, trimmed);
      sess.doseIntegration = {
        ...(sess.doseIntegration || {}),
        method: 'live-time-integrated-trimmed',
        completedAt: sess.endedAt,
      };
      hydratedEditNeeded = false;
    } else {
      // We cannot reconstruct weather/coverage for an extension that was never
      // observed. Recompute as an explicit midpoint estimate instead of
      // silently claiming the original live integration still applies.
      delete sess.doseSegments;
      sess.doseIntegration = {
        method: 'midpoint-estimate-after-duration-edit',
        completedAt: Date.now(),
      };
    }
  }
  if (durationChanged && (sess.doses || sess.safety)) stampSessionCalculation(sess);
  markSessionEdited(sess);
  await saveImportedData();
  // Re-hydrate doses asynchronously. Per-session in-flight promise serializes
  // concurrent edits — without it, two quick updateSession calls can race two
  // fetchAtmosphere awaits and write doses for the older duration after the
  // newer one shipped (the relay briefly holds stale doses).
  if (hydratedEditNeeded) {
    _runHydrateSession(id, { lat: sess.location.lat, lon: sess.location.lon }, {
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
//      the vit-D channel read as no modeled synthesis for sessions that
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
//   8: 2026-07-12 — audited spectral reconstruction, physical-vs-weighted
//      dose accounting, UVI anchoring, M-EDI, and ICNIRP eye-UV handling.
//   9: 2026-07-12 — preserve the active engine's time-integrated doses at
//      stop instead of replacing them with a single midpoint estimate.
//  10: 2026-07-12 — version calculation provenance/confidence and migrate
//      ocular effective dose to its accurately named canonical schema field.
export const SUN_ENGINE_VERSION = 10;

// Override the fetched atmosphere with user-set values (manual UVI, manual
// cloud cover, manual ozone) when present in sunDefaults. Set null to clear.
// Lets advanced users dial in a meter reading or stress-test scenarios.
export function _applyAtmOverrides(atm) {
  if (!atm) return atm;
  const ov = state.importedData?.sunDefaults?.overrides;
  if (!ov) return atm;
  const out = { ...atm };
  if (Number.isFinite(ov.uvIndex)) { out.uvIndex = ov.uvIndex; out._uvOverridden = true; }
  if (Number.isFinite(ov.cloudCover)) { out.cloudCover = ov.cloudCover; out._cloudOverridden = true; }
  if (Number.isFinite(ov.ozoneDU)) { out.ozoneDU = ov.ozoneDU; out._ozoneOverridden = true; }
  return out;
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
  const useLat = lat ?? sess.location?.lat;
  const useLon = lon ?? sess.location?.lon;
  if (useLat == null || useLon == null) return null;
  const midpoint = new Date((sess.startedAt + sess.endedAt) / 2).toISOString();
  const altitudeM = sess.location?.altitudeM ?? 0;
  try {
    let atm = await fetchAtmosphere({ lat: useLat, lon: useLon, isoTime: midpoint });
    if (!atm) {
      globalThis.console?.warn?.('hydrateSession: atmosphere fetch returned null for', id);
      return null;
    }
    atm = _applyAtmOverrides(atm);
    // Strip private flags before persisting — _uvOverridden/_cloudOverridden/_ozoneOverridden
    // are presentation-layer markers, not session data; persisting them
    // wastes bytes in localStorage/CRDT and surfaces in exports.
    const { _uvOverridden, _cloudOverridden, _ozoneOverridden, ...persistedAtm } = atm;
    sess.atmosphere = persistedAtm;
    const zenith = solarZenithAngle(new Date(midpoint), useLat, useLon);
    const spectrum = reconstructSpectrum({
      zenithDeg: zenith,
      ozoneDU: atm.ozoneDU ?? 300,
      altitudeM,
      cloudCover: (atm.cloudCover ?? 0) / 100,
      aod: atm?.airQuality?.aod ?? null,
      uvIndex: atm.uvIndex ?? null,
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
    const effFraction = baseFraction * postureMult * albedoMult;
    sess.doses = computeChannelDoses({
      spectrum,
      durationMin: sess.durationMin,
      bodyExposureFraction: effFraction,
      eyeExposure: sess.eyeExposure,
      bodyModifiers,
    });
    const sed = erythemalSED({
      spectrum,
      durationMin: sess.durationMin,
      incidenceMultiplier: postureMult * albedoMult,
      bodyModifiers,
    });
    // Read from one of two places, in priority order:
    //   1. sunDefaults.fitzpatrick (Light setup card)
    //   2. lightCircadian.skinType (Light & Circadian context card)
    // Falls back to 'III' (median) if none.
    const lcSkin = state.importedData?.lightCircadian?.skinType;
    const lcRoman = lcSkin && storeDeps.skinTypeToFitzpatrick(lcSkin);
    const fitzpatrick = state.importedData?.sunDefaults?.fitzpatrick || lcRoman || 'III';
    const psmTier = _normalizePSMTier(state.importedData?.sunDefaults?.photosensitiveMeds);
    const medScale = photosensitiveMedScale(psmTier);
    const ocularEffectiveDose = retinalUVdose({ spectrum, eyeExposure: sess.eyeExposure, zenithDeg: zenith });
    sess.safety = {
      sed,
      medFraction: fractionOfMED({ sed, fitzpatrick, medScale }),
      ocularEffectiveDose,
      retinalUV: ocularEffectiveDose,
      fitzpatrick,
      photosensitiveMedTier: psmTier,
      // Legacy boolean kept for backward compat with consumers that
      // haven't migrated to the tier field yet.
      photosensitive: medScale < 1.0,
    };
    if (!String(sess.doseIntegration?.method || '').startsWith('midpoint-estimate-after-duration-edit')) {
      sess.doseIntegration = {
        method: 'midpoint-estimate',
        completedAt: Date.now(),
      };
    }
    // Stamp the engine version so rehydrateStaleSessions can detect
    // sessions computed under older (buggy) versions and recompute.
    sess.engineVersion = SUN_ENGINE_VERSION;
    stampSessionCalculation(sess, { atmosphere: atm, zenithDeg: zenith });
    await saveImportedData();
    return sess;
  } catch (e) {
    globalThis.console?.warn?.('hydrateSession failed', e);
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
    !String(s.doseIntegration?.method || '').startsWith('live-time-integrated') &&
    (s.engineVersion ?? 0) < SUN_ENGINE_VERSION
  );
  if (stale.length === 0) {
    const migrated = _schemaMigrationPending;
    if (migrated) {
      await saveImportedData();
      _schemaMigrationPending = false;
    }
    return { rehydrated: 0, migrated: migrated ? sessions.length : 0 };
  }
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
      globalThis.console?.warn?.('rehydrateStaleSessions:', s.id, e?.message || e);
    }
  }
  if (_schemaMigrationPending) {
    await saveImportedData();
    _schemaMigrationPending = false;
  }
  return { rehydrated: ok, ofTotal: stale.length };
}

export function resetSunSessionsStoreState() {
  _hydrateInFlight.clear();
  _schemaMigrationPending = false;
  _maintenanceSaveQueued = false;
}
