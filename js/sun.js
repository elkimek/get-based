// sun.js — Sun Sessions: episodic outdoor light exposure logging.
// Layer between sun-uvdata.js (atmosphere fetch), sun-spectrum.js (dose
// computation), and the dashboard / dedicated Light & Sun page.
//
// Session entry flows:
//   quickLogSunSession()       — 1-tap "going outside now" + "save when done"
//   openSunSessionDialog(opts) — standard log with body/eye/glass/sunscreen
//
// All sessions persist to importedData.sunSessions[]. Schema initialised
// in profile.js migrateProfileData().

import { state } from './state.js';
import { escapeHTML, escapeAttr, formatDate, showNotification, showPromptDialog } from './utils.js';
import { saveImportedData } from './data.js';
import { getProfileLocation } from './profile.js';
import { COUNTRY_LATITUDES, COUNTRY_CENTROIDS } from './constants.js';
import { recordTombstone } from './data-merge.js';
import { MALE_BODY_PATH, FEMALE_BODY_PATH, SILHOUETTE_NATIVE } from './silhouette-paths.js';

// ─── Anatomical regions (for body silhouette picker) ───────────────────
// 11 regions per the design — each carries optional research notes for AI.
// Anatomical regions for the silhouette picker. Limbs split into front/back
// so front-of-legs and back-of-legs are independent — matters for
// realistic photobiology (e.g. sunbathing face-up exposes only front).
// Fractions sum to ~1.0 across the whole body when fully selected.
export const BODY_REGIONS = [
  { key: 'face',           label: 'Face',              fraction: 0.04 },
  { key: 'thyroid-throat', label: 'Thyroid / throat',  fraction: 0.01 },
  { key: 'breast-chest',   label: 'Breast / chest',    fraction: 0.06 },
  { key: 'arms-front',     label: 'Arms (front)',      fraction: 0.05 },
  { key: 'arms-back',      label: 'Arms (back)',       fraction: 0.05 },
  { key: 'torso-front',    label: 'Torso (front)',     fraction: 0.13 },
  { key: 'torso-back',     label: 'Torso (back)',      fraction: 0.13 },
  { key: 'abdomen',        label: 'Abdomen',           fraction: 0.07 },
  { key: 'genitals',       label: 'Genitals',          fraction: 0.01 },
  { key: 'glutes',         label: 'Glutes',            fraction: 0.05 },
  { key: 'legs-front',     label: 'Legs (front)',      fraction: 0.15 },
  { key: 'legs-back',      label: 'Legs (back)',       fraction: 0.15 },
  { key: 'soles-of-feet',  label: 'Soles of feet',     fraction: 0.02 },
];

// Standard quick-presets for the speed log
export const EXPOSURE_PRESETS = [
  { key: 'face_hands', label: 'Face + hands',         fraction: 0.05 },
  { key: 'tshirt',     label: 'T-shirt + shorts',     fraction: 0.30 },
  { key: 'swimwear',   label: 'Swimwear',             fraction: 0.65 },
  { key: 'sunbathing', label: 'Sunbathing',           fraction: 0.90 },
];

export const EYE_MODES = [
  { key: 'direct',         label: 'Eyes uncovered (do not look at sun)' },
  { key: 'sunglasses',     label: 'Sunglasses' },
  { key: 'clear-glasses',  label: 'Clear glasses' },
  { key: 'closed-eyes',    label: 'Closed eyes' },
  { key: 'glass-window',   label: 'Through window glass' },
  { key: 'indoor',         label: 'Not eye-exposed' },
];

export const LENS_TINTS = [
  { key: 'clear',         label: 'Clear (no tint)' },
  { key: 'polarized',     label: 'Polarized' },
  { key: 'photochromic',  label: 'Photochromic' },
  { key: 'blue-blocker',  label: 'Blue blocker' },
  { key: 'amber',         label: 'Amber / red' },
];

// ─── Channel display metadata ─────────────────────────────────────────
// Daily targets are deliberately rough — they represent "a meaningful
// healthy dose for one day" derived from typical noon-zenith integrals.
// We use them only to map raw doses → qualitative tiers for display.
// AI context still ships raw numbers; users never see them.
export const CHANNEL_DISPLAY = {
  vitamin_d:  { icon: '☀',  label: 'Vitamin D',          dailyTarget:    300, what: 'UVB on bare skin makes vitamin D. Stops increasing around the point your skin starts to redden — longer is not better.' },
  pomc:       { icon: '⚡',  label: 'Mood & hormones',    dailyTarget:    800, what: 'Sun on skin triggers a hormone cascade — α-MSH (the tan signal), β-endorphin (mood), ACTH (stress response). Part of why sun feels good.' },
  no_cv:      { icon: '❤',  label: 'Cardiovascular',     dailyTarget:    100, what: 'UVA from skin releases nitric oxide — supports blood-vessel function, lowers blood pressure, improves circulation, dampens inflammation.' },
  violet_eye: { icon: '👁',  label: 'Outdoor eye light',  dailyTarget:   6000, what: 'Outdoor 360–400 nm hits sensors in eye and skin. Linked to eye health and dopamine release — the difference between "outside" and "window light" even when both feel bright.' },
  circadian:  { icon: '🌅', label: 'Body clock',         dailyTarget:  20000, what: 'Bright light at the eye sets your circadian rhythm — earlier bedtime, faster wake-up, deeper sleep. Strongest effect in the first 2 hours after sunrise.' },
  nir_solar:  { icon: '🔥', label: 'Cellular repair',    dailyTarget: 100000, what: 'Solar 600–1400 nm penetrates deep into tissue and reaches mitochondria. Supports recovery, raises local melatonin in cells, reduces inflammation. The half of sunlight that windows block.' },
  pbm_red:    { icon: '🔴', label: 'Red light therapy',  dailyTarget:   8000, what: 'Narrowband red light (660 nm) from a therapy panel. Same target as solar red but more concentrated and indoor.' },
  pbm_nir:    { icon: '🟣', label: 'Near-IR therapy',    dailyTarget:  10000, what: 'Narrowband near-infrared (810/850 nm) from a therapy panel. Reaches deeper tissue than visible red.' },
};

// Map a raw dose value → qualitative tier 0-4 with plain-English labels.
// 0 = none, 1 = low, 2 = moderate, 3 = good, 4 = strong.
// (Saturation flagged separately in AI context — most users don't need it.)
export function channelTier(value, channelKey) {
  const target = CHANNEL_DISPLAY[channelKey]?.dailyTarget ?? 1000;
  if (!Number.isFinite(value) || value <= 0) return 0;
  const ratio = value / target;
  if (ratio < 0.20) return 1;   // low
  if (ratio < 0.55) return 2;   // moderate
  if (ratio < 1.00) return 3;   // good
  return 4;                     // strong
}

const TIER_LABELS = ['none', 'low', 'moderate', 'good', 'strong'];
const TIER_DOTS = ['○○○○', '●○○○', '●●○○', '●●●○', '●●●●'];

export function tierLabel(tier) { return TIER_LABELS[tier] || 'none'; }

// Saturation flag threshold: when central IU ≥ 19,000 we're within 5%
// of the 20,000 cap baked into vitaminDIU (Holick photoisomerization
// plateau). Surface "saturated" copy at that point rather than the
// uncertainty band — the cap dominates so the band collapses anyway.
const VITD_SAT_FLAG = 19000;

// Render a channel dose in its natural real-world unit when the
// conversion is defensible (IU for vit D, J/cm² for the PBM/NIR
// channels, M-EDI lux for circadian). Falls back to "" for channels
// without a single clean SI unit (no_cv / pomc / violet_eye); the
// caller substitutes "% of daily target" as a grounded alternative.
//
// Conversions live in sun-spectrum.js with citations. Unit choice
// here is the user-facing copy; if you tweak (e.g. IU → kIU when
// large), tweak only here, not the underlying math.
//
// `fitzpatrick` modulates the vitamin D conversion (melanin reduces
// yield at the keratinocyte layer). `uvi` gates synthesis below the
// clinical threshold (Webb 2018: no meaningful vit D below UVI ~2-3).
// Pass these from `sess.safety.fitzpatrick` and `sess.atmosphere.uvIndex`
// respectively; fallback to 'III' / null.
export function formatChannelUnit(channelKey, channelAu, durationMin, fitzpatrick = 'III', uvi = null) {
  if (!Number.isFinite(channelAu) || channelAu <= 0) return '';
  if (channelKey === 'vitamin_d') {
    // Display the uncertainty band rather than a single point estimate.
    // Bird-Riordan model is ~25% at noon / ~50% off-noon; biological
    // 25(OH)D response variance adds another 2-3×. Honest framing:
    // "~50-150 IU" instead of "~100 IU" — user understands the model
    // says "roughly this much, not exact."
    const range = window.vitaminDIURange
      ? window.vitaminDIURange(channelAu, fitzpatrick, uvi)
      : { central: channelAu * 40, low: 0, high: 0 };
    if (range.central === 0) return 'below UVI threshold';
    if (range.central < 30) return 'minimal';
    const fmt = (n) => {
      if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
      if (n >= 1000) return Math.round(n / 100) * 100;
      return Math.round(n / 10) * 10;
    };
    if (range.central >= VITD_SAT_FLAG) return `~${fmt(range.central)} IU (saturated)`;
    return `~${fmt(range.low)}-${fmt(range.high)} IU`;
  }
  if (channelKey === 'nir_solar' || channelKey === 'pbm_red' || channelKey === 'pbm_nir') {
    const j = window.pbmJoulesPerCm2 ? window.pbmJoulesPerCm2(channelAu) : channelAu / 10000;
    if (j >= 10) return j.toFixed(0) + ' J/cm²';
    if (j >= 1) return j.toFixed(1) + ' J/cm²';
    return j.toFixed(2) + ' J/cm²';
  }
  if (channelKey === 'circadian' && durationMin > 0) {
    const lux = window.circadianMelanopicLux ? window.circadianMelanopicLux(channelAu, durationMin) : 0;
    if (lux >= 1000) return '~' + (lux / 1000).toFixed(1).replace(/\.0$/, '') + 'k M-EDI lux';
    if (lux >= 100) return '~' + Math.round(lux / 10) * 10 + ' M-EDI lux';
    return '~' + Math.round(lux) + ' M-EDI lux';
  }
  return ''; // no_cv / pomc / violet_eye: no defensible single unit
}
export function tierDots(tier) { return TIER_DOTS[tier] || TIER_DOTS[0]; }

// ─── Public API ────────────────────────────────────────────────────────

export function getSessions() {
  if (!state.importedData) return [];
  if (!Array.isArray(state.importedData.sunSessions)) state.importedData.sunSessions = [];
  // Strip runtime-only ticker fields that earlier dev builds may have
  // accidentally persisted onto session objects. One-time cleanup on
  // first read; no-op on records written after the fix.
  for (const sess of state.importedData.sunSessions) {
    if (sess && (sess._activeRate || sess._activeRatePending || sess._fractionOfMED)) {
      delete sess._activeRate;
      delete sess._activeRatePending;
      delete sess._fractionOfMED;
    }
  }
  return state.importedData.sunSessions;
}

export function getActiveSession() {
  return getSessions().find(s => !s.endedAt) || null;
}

// Start a session — minimal entry with sensible defaults. Returns id.
// Accepts either an `exposurePreset` (legacy 4-preset coarse buckets) or a
// `regions` array (anatomical-region picker output). Regions take priority
// when both are supplied — fraction is computed by summing region fractions.
export async function startSession({ exposurePreset = 'face_hands', regions, eyeMode = 'direct', lensTint = 'clear', glassBetween = false, location } = {}) {
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

  const session = {
    id,
    startedAt: Date.now(),
    endedAt: null,
    location: location || null,
    bodyExposure: { preset: preset.key, fraction, regions: regionsArr, sunscreenSPF: null, glassBetween },
    eyeExposure: { mode: eyeMode, lensTint, durationSec: null }, // durationSec assigned at stop
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
  sess.endedAt = Date.now();
  const durationMin = Math.max(0, (sess.endedAt - sess.startedAt) / 60000);
  sess.durationMin = durationMin;
  if (sess.eyeExposure && sess.eyeExposure.durationSec == null) {
    sess.eyeExposure.durationSec = Math.round(durationMin * 60);
  }
  _clearLiveState(id);
  await saveImportedData();
  return sess;
}

// Log a completed session in one shot (after-the-fact entry).
export async function logCompletedSession(payload) {
  const id = `sun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const session = Object.assign({
    id,
    startedAt: payload.startedAt || Date.now(),
    endedAt: payload.endedAt || Date.now(),
    location: payload.location || null,
    bodyExposure: payload.bodyExposure || { preset: 'face_hands', fraction: 0.05, regions: [], sunscreenSPF: null, glassBetween: false },
    eyeExposure: payload.eyeExposure || { mode: 'indoor', lensTint: 'clear', durationSec: 0 },
    atmosphere: payload.atmosphere || null,
    doses: payload.doses || null,
    safety: payload.safety || null,
    notes: payload.notes || '',
  }, payload);
  if (!session.durationMin) session.durationMin = Math.max(0, (session.endedAt - session.startedAt) / 60000);
  getSessions().push(session);
  await saveImportedData();
  return id;
}

export async function deleteSession(id) {
  const sessions = getSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx < 0) return false;
  recordTombstone(state.importedData, 'sunSessions', id);
  sessions.splice(idx, 1);
  _clearLiveState(id);
  await saveImportedData();
  return true;
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
    sess.eyeExposure.durationSec = Math.round(sess.durationMin * 60);
  }
  sess.updatedAt = Date.now();
  await saveImportedData();
  // Re-hydrate doses asynchronously. Per-session in-flight promise serializes
  // concurrent edits — without it, two quick updateSession calls can race two
  // fetchAtmosphere awaits and write doses for the older duration after the
  // newer one shipped (the relay briefly holds stale doses).
  if (durationChanged && sess.location) {
    const prev = _hydrateInFlight.get(id) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(() => hydrateSession(id, { lat: sess.location.lat, lon: sess.location.lon }))
      .catch(e => { if (window.console) console.warn('hydrateSession after updateSession failed', e); });
    _hydrateInFlight.set(id, next);
    next.finally(() => { if (_hydrateInFlight.get(id) === next) _hydrateInFlight.delete(id); });
  }
  return sess;
}

// Per-session hydrate serialization queue. Map<sessionId, Promise>.
const _hydrateInFlight = new Map();

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
export const SUN_ENGINE_VERSION = 3;

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

export async function hydrateSession(id, { lat, lon } = {}) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || !sess.endedAt) return null;
  // Lazy-load engine modules — they are loaded by main.js at boot, so
  // window.* references will resolve. Kept dynamic to avoid hard import
  // in modules that may run before main.js wires window.
  const fetchAtmosphere = window.fetchAtmosphere;
  const reconstructSpectrum = window.reconstructSpectrum;
  const computeChannelDoses = window.computeChannelDoses;
  const erythemalSED = window.erythemalSED;
  const fractionOfMED = window.fractionOfMED;
  const retinalUVdose = window.retinalUVdose;
  const solarZenithAngle = window.solarZenithAngle;
  if (!fetchAtmosphere || !reconstructSpectrum) return null;
  const useLat = lat ?? sess.location?.lat;
  const useLon = lon ?? sess.location?.lon;
  if (useLat == null || useLon == null) return null;
  const midpoint = new Date((sess.startedAt + sess.endedAt) / 2).toISOString();
  const altitudeM = sess.location?.altitudeM ?? 0;
  try {
    let atm = await fetchAtmosphere({ lat: useLat, lon: useLon, isoTime: midpoint });
    if (!atm) {
      if (window.console) console.warn('hydrateSession: atmosphere fetch returned null for', id);
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
    });
    const bodyModifiers = {
      glassBetween: !!sess.bodyExposure?.glassBetween,
      sunscreenSPF: sess.bodyExposure?.sunscreenSPF || 0,
    };
    sess.doses = computeChannelDoses({
      spectrum,
      durationMin: sess.durationMin,
      bodyExposureFraction: sess.bodyExposure?.fraction ?? 0,
      eyeExposure: sess.eyeExposure,
      bodyModifiers,
    });
    const sed = erythemalSED({
      spectrum,
      durationMin: sess.durationMin,
      bodyExposureFraction: sess.bodyExposure?.fraction ?? 0,
      bodyModifiers,
    });
    // Read from one of two places, in priority order:
    //   1. sunDefaults.fitzpatrick (Light setup card)
    //   2. lightCircadian.skinType (Light & Circadian context card)
    // Falls back to 'III' (median) if none.
    const lcSkin = state.importedData?.lightCircadian?.skinType;
    const lcRoman = lcSkin && (window._skinTypeToFitzpatrick ? window._skinTypeToFitzpatrick(lcSkin) : (lcSkin.match(/^(I{1,3}|IV|VI?)\b/) || [])[1]);
    const fitzpatrick = state.importedData?.sunDefaults?.fitzpatrick || lcRoman || 'III';
    const photosensitive = !!state.importedData?.sunDefaults?.photosensitiveMeds;
    sess.safety = {
      sed,
      medFraction: fractionOfMED({ sed, fitzpatrick, photosensitive }),
      retinalUV: retinalUVdose({ spectrum, eyeExposure: sess.eyeExposure }),
      fitzpatrick,
      photosensitive,
    };
    // Stamp the engine version so rehydrateStaleSessions can detect
    // sessions computed under older (buggy) versions and recompute.
    sess.engineVersion = SUN_ENGINE_VERSION;
    await saveImportedData();
    return sess;
  } catch (e) {
    if (window.console && console.warn) console.warn('hydrateSession failed', e);
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
let _rehydrateInFlight = false;
export async function rehydrateStaleSessions() {
  if (_rehydrateInFlight) return { skipped: 'in flight' };
  _rehydrateInFlight = true;
  try {
    const sessions = getSessions();
    const stale = sessions.filter(s =>
      s.endedAt &&
      s.location?.lat != null &&
      (s.engineVersion ?? 0) < SUN_ENGINE_VERSION
    );
    if (stale.length === 0) return { rehydrated: 0 };
    // Serialize so we don't fan out N concurrent atmosphere fetches.
    let ok = 0;
    for (const s of stale) {
      try {
        const result = await hydrateSession(s.id, { lat: s.location.lat, lon: s.location.lon });
        if (result) ok++;
      } catch (e) {
        if (window.console && console.warn) console.warn('rehydrateStaleSessions:', s.id, e?.message || e);
      }
    }
    return { rehydrated: ok, ofTotal: stale.length };
  } finally {
    _rehydrateInFlight = false;
  }
}

// ─── Lifelight aggregates ──────────────────────────────────────────────

// Rolling N-day per-channel totals — used by the dashboard strip and AI context.
export function rollingChannelTotals(days = 7) {
  const now = Date.now();
  const cutoff = now - days * 86400 * 1000;
  const totals = {};
  for (const sess of getSessions()) {
    // Include in-progress sessions via live partial doses, but only when
    // the session's startedAt is within the rolling window. A session
    // forgotten-running for 25 hours should not perpetually inflate
    // the 7d total.
    if (!sess.endedAt) {
      if ((sess.startedAt || 0) < cutoff) continue;
      const live = _liveDosesFor(sess);
      if (live?.doses) {
        for (const [k, v] of Object.entries(live.doses)) {
          totals[k] = (totals[k] || 0) + (Number.isFinite(v) ? v : 0);
        }
      }
      continue;
    }
    if (!sess.doses) continue;
    if (sess.endedAt < cutoff) continue;
    for (const [k, v] of Object.entries(sess.doses)) {
      totals[k] = (totals[k] || 0) + (Number.isFinite(v) ? v : 0);
    }
  }
  return totals;
}

// Per-day channel breakdown for the rolling-N chart. Returns an array of
// length `days` (oldest → newest), each element { date: 'YYYY-MM-DD',
// sun: <au>, device: <au> } for the requested channelKey. Today is the
// last bucket. Used by the weekly bar chart in the channel drill-down.
export function dailyChannelBreakdown(channelKey, days = 7) {
  const buckets = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.push({ date: d, key: d.toISOString().slice(0, 10), sun: 0, device: 0 });
  }
  const startOf = (ts) => {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const idxFor = (ts) => {
    const day = startOf(ts);
    return buckets.findIndex(b => b.date.getTime() === day);
  };
  for (const sess of getSessions()) {
    const ts = sess.endedAt || sess.startedAt;
    if (!ts) continue;
    const i = idxFor(ts);
    if (i < 0) continue;
    if (!sess.endedAt) {
      // In-progress session — pull live partial dose so the chart reflects
      // an active session in progress (matches rollingChannelTotals).
      const live = _liveDosesFor(sess);
      const v = live?.doses?.[channelKey];
      if (Number.isFinite(v)) buckets[i].sun += v;
      continue;
    }
    if (!sess.doses) continue;
    const v = sess.doses[channelKey];
    if (Number.isFinite(v)) buckets[i].sun += v;
  }
  const devSessions = (typeof window !== 'undefined' && window.getDeviceSessions) ? window.getDeviceSessions() : [];
  for (const ds of devSessions || []) {
    const ts = ds.endedAt || ds.startedAt;
    if (!ts || !ds.doses) continue;
    const i = idxFor(ts);
    if (i < 0) continue;
    const v = ds.doses[channelKey];
    if (Number.isFinite(v)) buckets[i].device += v;
  }
  return buckets;
}

// Rolling N-day vitamin D synthesis in IU. Sums PER SESSION (with each
// session's 20k saturation cap from vitaminDIU) rather than summing
// channel-au and converting once — saturation is a within-session
// photoisomerization phenomenon (Holick 2007), so a user with three
// 30-min sessions across the week genuinely accumulates 3× per-session
// yields, even if each session individually saturates near the cap.
//
// Per-session Fitzpatrick is read from sess.safety.fitzpatrick (set by
// hydrateSession). Active sessions contribute their live channel-au
// converted via the same per-session vitaminDIU path.
export function rollingVitaminDIU(days = 7) {
  if (typeof window.vitaminDIU !== 'function') return 0;
  const cutoff = Date.now() - days * 86400 * 1000;
  let total = 0;
  for (const sess of getSessions()) {
    if (!sess.endedAt) {
      if ((sess.startedAt || 0) < cutoff) continue;
      const live = _liveDosesFor(sess);
      if (live?.doses?.vitamin_d) {
        const fitz = live.fitzpatrick || sess.safety?.fitzpatrick || 'III';
        const uvi = live.atm?.uvIndex ?? sess.atmosphere?.uvIndex ?? null;
        total += window.vitaminDIU(live.doses.vitamin_d, fitz, uvi);
      }
      continue;
    }
    if (!sess.doses?.vitamin_d) continue;
    if (sess.endedAt < cutoff) continue;
    const fitz = sess.safety?.fitzpatrick || 'III';
    const uvi = sess.atmosphere?.uvIndex ?? null;
    total += window.vitaminDIU(sess.doses.vitamin_d, fitz, uvi);
  }
  return total;
}

// Cumulative MED today (for the safety gauge and pre-session warnings).
// Includes the in-progress session's live partial burn-dose so the gauge
// fills as you sit in the sun.
export function cumulativeMEDToday() {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  let total = 0;
  for (const sess of getSessions()) {
    if (!sess.endedAt) {
      const live = _liveDosesFor(sess);
      if (live && Number.isFinite(live.medFraction)) total += live.medFraction;
      continue;
    }
    if (!sess.safety) continue;
    if (sess.endedAt < dayStart) continue;
    total += sess.safety.medFraction || 0;
  }
  return total;
}

// Cumulative MED for the prior day. Skin doesn't fully reset overnight —
// a yesterday-MED of 0.9 plus today-MED of 0.5 = ~1.4 cumulative,
// well into burn territory. Surfaced as a "carry-over" warning chip when
// yesterday + today exceeds 100%.
export function cumulativeMEDYesterday() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yStart = todayStart - 86400000;
  let total = 0;
  for (const sess of getSessions()) {
    // In-progress session that started yesterday and is still running today
    // contributes its dose proportionally (yesterday's portion to yesterday).
    if (!sess.endedAt) {
      const startedAt = sess.startedAt || 0;
      if (startedAt < yStart || startedAt >= todayStart) continue;
      const live = _liveDosesFor(sess);
      if (!live || !Number.isFinite(live.medFraction)) continue;
      const totalElapsedMs = Date.now() - startedAt;
      const yesterdayMs = Math.max(0, todayStart - startedAt);
      const yesterdayShare = totalElapsedMs > 0 ? yesterdayMs / totalElapsedMs : 0;
      total += live.medFraction * yesterdayShare;
      continue;
    }
    if (!sess.safety) continue;
    if (sess.endedAt < yStart || sess.endedAt >= todayStart) continue;
    total += sess.safety.medFraction || 0;
  }
  return total;
}

// ─── UI: Quick log ─────────────────────────────────────────────────────

// Single-tap "I'm outside now" — starts a session with last-used defaults.
// On stop: skips confirm dialog (user explicitly tapped stop). Notification
// includes duration + the channel that benefited most for instant feedback.
export async function quickLogSunSession() {
  const active = getActiveSession();
  if (active) {
    await stopSession(active.id);
    await _hydrateFromProfileCoords(active.id);
    const sess = getSessions().find(s => s.id === active.id);
    const dur = Math.round(sess?.durationMin || 0);
    const summary = _plainStopSummary(sess, dur);
    showNotification(summary, summary.includes('over your burn threshold') ? 'error' : 'success', 7000);
    _refreshSurfaces();
    return;
  }
  // No active session — open the silhouette picker so the user can pick
  // exposed regions before the session begins. Inherits from last session.
  return openStartSunSessionDialog();
}

// Show the "What's uncovered?" dialog with the body silhouette + a Start
// button. The picker pre-selects regions from the user's last completed
// session so habitual users hit Start without changes; first-time users
// pick everything fresh.
export async function openStartSunSessionDialog() {
  const last = getSessions().filter(s => s.endedAt).slice(-1)[0];
  const lastRegions = new Set(last?.bodyExposure?.regions || []);
  const defaultEye = last?.eyeExposure?.mode || 'direct';
  const defaultLens = last?.eyeExposure?.lensTint || 'clear';
  const defaultGlass = !!last?.bodyExposure?.glassBetween;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal sun-start-modal" role="dialog" aria-label="Start sun session">
    <div class="modal-header">
      <h3>Start a sun session</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Tap each body region that's uncovered right now. The session begins as soon as you hit Start.</p>
      <div class="sun-silhouette-wrap" id="sun-start-silhouette-slot">${renderBodySilhouette(lastRegions)}</div>
      <div class="sun-silhouette-hint" id="sun-start-hint">Tap any body region to toggle whether it's uncovered.</div>

      <details class="sun-start-details">
        <summary>Eyewear, sunscreen, glass — change defaults</summary>
        <div class="sun-detailed-row" style="margin-top:10px">
          <label class="ctx-label">Eyes
            <select id="start-eye-mode" class="ctx-select">
              ${EYE_MODES.map(e => `<option value="${escapeAttr(e.key)}"${e.key === defaultEye ? ' selected' : ''}>${escapeHTML(e.label)}</option>`).join('')}
            </select>
          </label>
          <label class="ctx-label">Lens tint
            <select id="start-lens-tint" class="ctx-select">
              ${LENS_TINTS.map(l => `<option value="${escapeAttr(l.key)}"${l.key === defaultLens ? ' selected' : ''}>${escapeHTML(l.label)}</option>`).join('')}
            </select>
          </label>
        </div>
        <label class="ctx-label sun-detailed-glass" style="margin-top:8px">
          <input type="checkbox" id="start-glass"${defaultGlass ? ' checked' : ''} />
          Behind glass (window / car / sunroom)
        </label>
        <p class="sun-detailed-glass-hint">Standard window glass blocks ~99% of UVB. Vitamin D synthesis stops; circadian and warmth signals still get through. We zero the burn dose accordingly.</p>
      </details>

      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-primary" id="start-confirm">☀ Start session</button>
      </div>
    </div>
  </div>`;
  _wireBackdropClose(overlay);
  document.body.appendChild(overlay);
  trapModalFocus(overlay);

  const selected = new Set(lastRegions);
  const slot = overlay.querySelector('#sun-start-silhouette-slot');
  const hint = overlay.querySelector('#sun-start-hint');
  const updateHint = () => {
    const fraction = Array.from(selected).reduce((sum, key) => {
      const r = BODY_REGIONS.find(b => b.key === key);
      return sum + (r?.fraction || 0);
    }, 0);
    if (selected.size === 0) {
      hint.textContent = 'Tap any body region to toggle whether it\'s uncovered.';
    } else {
      const labels = Array.from(selected).map(k => BODY_REGIONS.find(b => b.key === k)?.label || k).join(', ');
      hint.textContent = `${selected.size} region${selected.size === 1 ? '' : 's'} exposed (${(fraction * 100).toFixed(0)}% of skin) — ${labels}`;
    }
  };
  bindBodySilhouette(slot, selected, updateHint);
  updateHint();

  overlay.querySelector('#start-confirm').addEventListener('click', async () => {
    const eyeMode = overlay.querySelector('#start-eye-mode').value || 'direct';
    const lensTint = overlay.querySelector('#start-lens-tint').value || 'clear';
    const glassBetween = overlay.querySelector('#start-glass').checked;
    const regions = Array.from(selected);
    if (regions.length === 0) {
      hint.textContent = 'Tap at least one region before starting — what part of you is uncovered?';
      hint.classList.add('sun-silhouette-hint-error');
      setTimeout(() => hint.classList.remove('sun-silhouette-hint-error'), 2500);
      return;
    }
    // Stash coords on the new session so the ticker can compute doses
    // immediately without re-resolving location every tick.
    const coords = getSunCoords();
    const id = await startSession({ regions, eyeMode, lensTint, glassBetween, location: coords });
    overlay.remove();
    showNotification(`Outdoor session started · ${regions.length} region${regions.length === 1 ? '' : 's'} exposed`);
    if (state.importedData?.sunDefaults?.photosensitiveMeds) {
      showNotification('⚠ Photosensitizing medication active — your burn threshold is ~2.5× lower. Plan to wrap up at the first sign of pinkness.', 'warning', 7000);
    }
    if (eyeMode === 'direct') {
      showNotification('Eyes-uncovered mode: never look directly at the sun. "Uncovered" means eyes open toward the sky, not staring at the sun disc.', 'warning', 7000);
    }
    _refreshSurfaces();
    _ensureActiveTicker();
    return id;
  });
}

// Focus management for dynamically-injected modals. Captures the current
// focused element, lands focus on the first focusable inside the new
// overlay, and restores focus to the trigger when the overlay is removed.
// Wire backdrop click → close on a `.modal-overlay` element. Pairs the click
// handler with a mousedown guard so a drag-from-inside-the-modal that
// releases on the backdrop doesn't accidentally close (matches the global
// _mouseDownInsideModal pattern in main.js for keyed overlays).
//
// Optional `closeFn` runs instead of plain `overlay.remove()` — needed for
// modals with cleanup logic (camera streams in light-tools, focus restore,
// etc.). Falls back to overlay.remove() when not given.
export function _wireBackdropClose(overlay, closeFn) {
  const close = typeof closeFn === 'function' ? closeFn : () => overlay.remove();
  let mouseDownInside = false;
  overlay.addEventListener('mousedown', (e) => {
    mouseDownInside = !!e.target.closest('.modal');
  });
  overlay.addEventListener('click', (e) => {
    if (mouseDownInside) { mouseDownInside = false; return; }
    if (e.target === overlay) close();
  });
}

// Single export so sun.js / views.js / light-tools.js share one helper.
export function trapModalFocus(overlay) {
  const previouslyFocused = document.activeElement;
  // Defer until after the browser paints — innerHTML may be set right
  // after appendChild, and querySelector before paint can race.
  setTimeout(() => {
    const focusables = overlay.querySelectorAll(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length > 0) try { focusables[0].focus(); } catch (e) {}
  }, 30);
  // Restore focus on overlay removal. MutationObserver lets us catch any
  // teardown path (overlay.remove(), parent rebuild, escape handler).
  const restore = () => {
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      try { previouslyFocused.focus(); } catch (e) {}
    }
  };
  const obs = new MutationObserver(() => {
    if (!document.body.contains(overlay)) {
      obs.disconnect();
      restore();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

// Plain-English session-stop summary. Leads with what the body got out of
// the session (vit D in IU, top channel) and ends with the safety state —
// the framing a normie reads after coming inside.
function _plainStopSummary(sess, dur) {
  if (!sess) return `Session saved — ${dur} min`;
  const parts = [`Saved · ${dur} min outside`];
  const fitz = sess.safety?.fitzpatrick || 'III';
  const uvi = sess.atmosphere?.uvIndex;
  const vitDAu = sess.doses?.vitamin_d || 0;
  if (vitDAu > 0 && window.vitaminDIU) {
    const iu = window.vitaminDIU(vitDAu, fitz, uvi);
    if (iu >= 100) {
      const lo = Math.round(iu * 0.6 / 50) * 50;
      const hi = Math.round(iu * 1.5 / 50) * 50;
      parts.push(`~${lo}–${hi} IU vitamin D`);
    }
  } else if (sess.bodyExposure?.glassBetween) {
    parts.push('no vitamin D — glass blocks UVB');
  } else if (uvi != null && uvi < 2) {
    parts.push(`no vitamin D — UVI too low (${uvi.toFixed(1)})`);
  }
  const med = sess.safety?.medFraction || 0;
  if (med >= 1.0) {
    parts.push('over your burn threshold — no more sun today');
  } else if (med >= 0.7) {
    parts.push(`burn dose ${Math.round(med * 100)}% — close to limit, ease up`);
  } else if (med >= 0.3) {
    parts.push(`burn dose ${Math.round(med * 100)}% — well within safe range`);
  }
  return parts.join(' · ');
}

// Identify the strongest channel a session contributed to (for notification copy)
function _topChannel(sess) {
  if (!sess?.doses) return null;
  let bestKey = null, bestVal = 0;
  for (const [k, v] of Object.entries(sess.doses)) {
    if (Number.isFinite(v) && v > bestVal) { bestVal = v; bestKey = k; }
  }
  if (!bestKey) return null;
  const meta = CHANNEL_DISPLAY[bestKey];
  const t = channelTier(bestVal, bestKey);
  if (t === 0) return null;
  return { label: meta?.label || bestKey, tier: tierLabel(t) };
}

// Re-render dashboard sidebar + current view after a session change so the
// Light Today strip + sidebar entry appear / update without a manual reload.
function _refreshSurfaces() {
  if (window.buildSidebar) try { window.buildSidebar(); } catch (e) {}
  const view = state.currentView || 'dashboard';
  if (window.navigate) try { window.navigate(view); } catch (e) {}
  // After re-render the active-session card is a fresh DOM node — make sure
  // the ticker is alive so it patches the new card on the next interval.
  setTimeout(() => _resumeActiveTickerIfNeeded(), 100);
}

// ─── Live in-progress session ticker ───────────────────────────────────
//
// While a session is active we want the on-screen card to feel alive:
//   • elapsed time ticks every second (mm:ss, h:mm:ss past 1hr)
//   • channel doses accumulate visibly — each minute outside, the user sees
//     vit-D / circadian / NIR fill in
//   • a single shared setInterval drives every active-session card on the
//     page (dashboard strip + Light & Sun list both update)
//
// Strategy: compute a per-minute dose rate ONCE at session start (via the
// usual reconstructSpectrum + computeChannelDoses path on the session's
// midpoint) and cache it in the module-scoped _liveState map (NOT on the
// session object — that would persist runtime-only fields to localStorage
// and CRDT). The ticker then just multiplies by elapsed minutes — no
// per-tick spectral math.

let _activeTicker = null;

// Live-ticker per-session state (rate snapshot, atm, zenith, fitzpatrick,
// MED helper). Held in-memory only — NOT persisted on the session object,
// so saveImportedData() never serializes the heavy `atm` blob or function
// refs into localStorage / Evolu CRDT. Cleared on session end / delete.
const _liveState = new Map(); // session.id → { ratePerMin, sedPerMin, fitzpatrick, atm, zenith, snapshotAt, fractionOfMEDFn, pending }

function _getLiveState(id) { return _liveState.get(id) || null; }
function _setLiveState(id, patch) {
  const cur = _liveState.get(id) || {};
  _liveState.set(id, Object.assign(cur, patch));
}
function _clearLiveState(id) { _liveState.delete(id); }

function _formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

// Snapshot the per-minute channel rate for the active session. Lazy — runs
// once per session and caches in the module-scoped _liveState map. Returns
// null on first call (the ticker retries next interval); subsequent calls
// return the cached rate. NEVER mutates the session object — keeps the
// atm payload + function refs out of localStorage / CRDT.
async function _snapshotActiveRate(sess) {
  const cur = _getLiveState(sess.id);
  if (cur && cur.ratePerMin) return cur;
  if (cur && cur.pending) return null;
  _setLiveState(sess.id, { pending: true });
  try {
    const reconstructSpectrum = window.reconstructSpectrum;
    const computeChannelDoses = window.computeChannelDoses;
    const erythemalSED = window.erythemalSED;
    const fractionOfMED = window.fractionOfMED;
    const solarZenithAngle = window.solarZenithAngle;
    const fetchAtmosphere = window.fetchAtmosphere;
    if (!reconstructSpectrum || !computeChannelDoses || !solarZenithAngle || !fetchAtmosphere) return null;
    const coords = sess.location || getSunCoords();
    if (!coords) return null;
    const now = new Date();
    let atm = await fetchAtmosphere({ lat: coords.lat, lon: coords.lon, isoTime: now.toISOString() });
    atm = _applyAtmOverrides(atm);
    const zenith = solarZenithAngle(now, coords.lat, coords.lon);
    const spectrum = reconstructSpectrum({
      zenithDeg: zenith,
      ozoneDU: atm.ozoneDU ?? 300,
      altitudeM: coords.altitudeM ?? 0,
      cloudCover: (atm.cloudCover ?? 0) / 100,
    });
    const liveBodyModifiers = {
      glassBetween: !!sess.bodyExposure?.glassBetween,
      sunscreenSPF: sess.bodyExposure?.sunscreenSPF || 0,
    };
    const ratePerMin = computeChannelDoses({
      spectrum,
      durationMin: 1,
      bodyExposureFraction: sess.bodyExposure?.fraction ?? 0,
      eyeExposure: sess.eyeExposure,
      bodyModifiers: liveBodyModifiers,
    });
    const sedPerMin = erythemalSED({
      spectrum,
      durationMin: 1,
      bodyExposureFraction: sess.bodyExposure?.fraction ?? 0,
      bodyModifiers: liveBodyModifiers,
    });
    const lcSkin = state.importedData?.lightCircadian?.skinType;
    const lcRoman = lcSkin && (window._skinTypeToFitzpatrick ? window._skinTypeToFitzpatrick(lcSkin) : (lcSkin.match(/^(I{1,3}|IV|VI?)\b/) || [])[1]);
    const fitzpatrick = state.importedData?.sunDefaults?.fitzpatrick || lcRoman || 'III';
    const photosensitive = !!state.importedData?.sunDefaults?.photosensitiveMeds;
    // baselineZenith is sampled once per session and never overwritten on
    // 10-min spectrum refresh — keeps the zenithScale denominator stable
    // so cumulative doses don't jump every refresh cycle.
    const existing = _getLiveState(sess.id) || {};
    _setLiveState(sess.id, {
      ratePerMin, sedPerMin, fitzpatrick, photosensitive, atm, zenith,
      baselineZenith: existing.baselineZenith ?? zenith,
      snapshotAt: Date.now(),
      fractionOfMEDFn: fractionOfMED,
      pending: false,
    });
    return _getLiveState(sess.id);
  } catch (e) {
    if (window.console && console.warn) console.warn('snapshotActiveRate failed', e);
    _setLiveState(sess.id, { pending: false });
    return null;
  }
}

// Compute live doses from the cached spectrum, but apply a real-time
// zenith correction so a session started at 11am with rising sun isn't
// underestimating dose rates by the time it's noon.
//
// Zenith math is purely local (date + lat/lon → angle), so we can do it
// every tick at zero cost. UVI and cloud cover are locked to whatever the
// last fetch returned — those drift much slower than zenith and refetch
// on a separate 10-min cadence. The cumulative dose is the integral of
// rate(t) over the session, which is approximately:
//   ∫₀ᵉ rate_at_time(t) dt ≈ rate_at_midpoint × elapsedMin
// since the rate-vs-time curve is roughly symmetric across midpoint.
function _liveDosesFor(sess) {
  const live = _getLiveState(sess?.id);
  if (!live || !live.ratePerMin) return null;
  const elapsedMin = Math.max(0, (Date.now() - sess.startedAt) / 60000);
  const rate = live.ratePerMin || {};

  // Zenith correction: scale the cached rate by the ratio of average
  // zenith-cosine over the elapsed window vs the BASELINE zenith (sampled
  // once at session start, never overwritten on spectrum refresh). Without
  // a stable baseline the integral jumps every 10-min refresh cycle.
  let zenithScale = 1;
  try {
    const coords = sess.location;
    const fnZenith = window.solarZenithAngle;
    if (coords && fnZenith && elapsedMin > 1) {
      // Sample 5 points evenly across [start, now] for a midpoint integral.
      const samples = 5;
      let sumCos = 0, count = 0;
      for (let i = 0; i < samples; i++) {
        const t = sess.startedAt + (i + 0.5) * (Date.now() - sess.startedAt) / samples;
        const z = fnZenith(new Date(t), coords.lat, coords.lon);
        const cosZ = Math.max(0, Math.cos(z * Math.PI / 180));
        sumCos += cosZ; count++;
      }
      const avgCos = count ? sumCos / count : 0;
      const baselineZ = live.baselineZenith ?? live.zenith ?? 0;
      const startCos = Math.max(0.001, Math.cos(baselineZ * Math.PI / 180));
      zenithScale = avgCos / startCos;
    }
  } catch (e) {}

  const doses = {};
  for (const [k, v] of Object.entries(rate)) doses[k] = v * elapsedMin * zenithScale;
  const sed = (live.sedPerMin || 0) * elapsedMin * zenithScale;
  const medFraction = live.fractionOfMEDFn ? live.fractionOfMEDFn({ sed, fitzpatrick: live.fitzpatrick, photosensitive: live.photosensitive }) : 0;
  return { doses, sed, medFraction, fitzpatrick: live.fitzpatrick, photosensitive: live.photosensitive, atm: live.atm, _zenithScale: zenithScale };
}

// Render a compact live card body — elapsed time, burn-risk %, channel chips.
function _renderActiveCardBody(sess) {
  const elapsed = _formatElapsed(Date.now() - sess.startedAt);
  const live = _liveDosesFor(sess);
  let medStr = '';
  if (live && Number.isFinite(live.medFraction)) {
    const pct = Math.round(live.medFraction * 100);
    let label = 'safe', cls = '';
    if (live.medFraction >= 1) { label = 'over threshold'; cls = 'over'; }
    else if (live.medFraction >= 0.7) { label = 'high'; cls = 'warn'; }
    else if (live.medFraction >= 0.3) { label = 'moderate'; cls = ''; }
    medStr = `<span class="sun-session-med ${cls}" title="Burn dose so far — ${pct}% of your burn threshold (Fitzpatrick ${escapeAttr(live.fitzpatrick)})">${pct}% burn dose · ${escapeHTML(label)}</span>`;
  }
  const channelChips = live?.doses ? renderChannelChips(live.doses) : '';
  // Surface a live IU readout for vitamin D — the most user-resonant
  // unit in the channel set. Computed from the same channel-au integral
  // the chips render, just translated through vitaminDIU(). Hidden when
  // the rate is essentially zero (cloudy / low UVB / behind glass).
  let vitaminDStr = '';
  if (live?.doses?.vitamin_d > 0) {
    const elapsedMin = Math.max(0, (Date.now() - sess.startedAt) / 60000);
    const fitz = live.fitzpatrick || sess.safety?.fitzpatrick || 'III';
    const uvi = live.atm?.uvIndex ?? sess.atmosphere?.uvIndex ?? null;
    // Live ticker uses the central estimate (the chip's already small;
    // a range there gets too noisy). Detail modal surfaces the band.
    const iu = window.vitaminDIU ? window.vitaminDIU(live.doses.vitamin_d, fitz, uvi) : live.doses.vitamin_d * 40;
    const ratePerMin = elapsedMin > 0 ? iu / elapsedMin : 0;
    if (iu >= 50) {
      const iuLabel = iu >= 10000 ? '~' + (iu / 1000).toFixed(1).replace(/\.0$/, '') + 'k IU'
        : iu >= 1000 ? '~' + Math.round(iu / 100) * 100 + ' IU'
        : '~' + Math.round(iu / 10) * 10 + ' IU';
      const rateLabel = ratePerMin >= 100 ? `${Math.round(ratePerMin / 10) * 10} IU/min` : `${Math.round(ratePerMin)} IU/min`;
      vitaminDStr = `<span class="sun-session-vitd" title="Approximate vitamin D₃ synthesis so far (central estimate; ±50% band — see session detail). Saturates around 20k IU per Holick photoisomerization plateau.">☀ ~${iuLabel} vit D · ${rateLabel}</span>`;
    }
  }
  return { elapsed, medStr, vitaminDStr, channelChips };
}

// Update every active-session card on the page. Cheap — only DOM patches
// for the elements that exist; no full re-render. Every 5 seconds also
// refreshes the page-level channel grid + dashboard strip so the live
// accumulated doses propagate beyond the session card itself.
let _tickCount = 0;
function _tickActiveCards() {
  const sessions = getSessions().filter(s => !s.endedAt);
  if (sessions.length === 0) {
    if (_activeTicker) { clearInterval(_activeTicker); _activeTicker = null; }
    return;
  }
  _tickCount++;
  for (const sess of sessions) {
    const live = _getLiveState(sess.id);
    // Lazy snapshot of the rate (async — fires once per session, cached
    // in module-scoped _liveState map, never written to the session record)
    if ((!live || !live.ratePerMin) && (!live || !live.pending)) _snapshotActiveRate(sess);

    // Refresh the cached atmosphere snapshot every ~10 min so cloud cover
    // and UVI drift get reflected in the live rate. Re-runs the same
    // spectrum/dose math; baselineZenith is preserved across refreshes
    // so the zenith-correction integral stays continuous.
    if (live && live.ratePerMin && !live.pending) {
      const last = live.snapshotAt || 0;
      if (Date.now() - last > 10 * 60 * 1000) {
        // Preserve baselineZenith; clear ratePerMin to force re-snapshot
        _setLiveState(sess.id, { ratePerMin: null });
      }
    }

    // Fire once at 70% MED (warning) and 100% MED (stop). Dedup via _liveState flags.
    const liveDoses = _liveDosesFor(sess);
    if (liveDoses && Number.isFinite(liveDoses.medFraction)) {
      const med = liveDoses.medFraction;
      const cur = _getLiveState(sess.id) || {};
      if (med >= 1.0 && !cur.alertedOver) {
        _setLiveState(sess.id, { alertedOver: true });
        showNotification('Burn threshold reached. Move to shade or cover up. Hydrate, no more direct sun today — damage from here is cumulative.', 'error', 10000);
      } else if (med >= 0.7 && !cur.alerted70) {
        _setLiveState(sess.id, { alerted70: true });
        showNotification('70% of your burn dose. Best move: head into shade for ~10 min, then decide. If you stay, watch for skin warmth or pinkness.', 'warning', 8000);
      }
    }

    // Update any "live elapsed" text node on the page — dashboard Light
    // Today CTA uses [data-live-elapsed-for] so the timer ticks every
    // second from anywhere in the app.
    const elapsedFmt = _formatElapsed(Date.now() - sess.startedAt);
    document.querySelectorAll(`[data-live-elapsed-for="${CSS.escape(sess.id)}"]`).forEach(el => {
      el.textContent = elapsedFmt;
    });

    const cards = document.querySelectorAll(`[data-id="${CSS.escape(sess.id)}"]`);
    if (!cards.length) continue;

    const body = _renderActiveCardBody(sess);
    cards.forEach(card => {
      const durEl = card.querySelector('.sun-session-duration');
      if (durEl) durEl.textContent = body.elapsed;
      const medEl = card.querySelector('.sun-session-med');
      if (medEl) medEl.outerHTML = body.medStr || '';
      else if (body.medStr) {
        // Insert med chip into the head row if it doesn't exist yet
        const head = card.querySelector('.sun-session-head .sun-session-duration');
        if (head) head.insertAdjacentHTML('afterend', body.medStr);
      }
      const vitdEl = card.querySelector('.sun-session-vitd');
      if (vitdEl) vitdEl.outerHTML = body.vitaminDStr || '';
      else if (body.vitaminDStr) {
        // Insert vit-D chip after med chip (or after duration if no med yet)
        const after = card.querySelector('.sun-session-med') || card.querySelector('.sun-session-duration');
        if (after) after.insertAdjacentHTML('afterend', body.vitaminDStr);
      }
      const oldChips = card.querySelector('.sun-channel-chips');
      if (oldChips) oldChips.outerHTML = body.channelChips || '';
      else if (body.channelChips) card.insertAdjacentHTML('beforeend', body.channelChips);
    });
  }
  // Every 5s, refresh the surrounding "Channels this week" grid + Light
  // Today dashboard strip. They read rollingChannelTotals which now mixes
  // in the live partial doses, so re-rendering them shows accumulated UV-D
  // / circadian / NIR rising in real time.
  if (_tickCount % 5 === 0) _refreshLiveChannelSurfaces();
}

// Re-render the channel grid + dashboard strip without forcing a full
// `navigate()` (that would tear down the active modal / setup card / etc).
function _refreshLiveChannelSurfaces() {
  // Light & Sun page: replace the channels-section innerHTML in place
  if (state.currentView === 'light' && window.renderLightChannelsLive) {
    try { window.renderLightChannelsLive(); } catch (e) {}
  }
  // Dashboard: redraw the Light Today strip element only
  if (state.currentView === 'dashboard' && window.renderLightTodayStrip) {
    const strip = document.querySelector('.light-today-strip');
    if (strip) {
      const html = window.renderLightTodayStrip();
      if (html) {
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        if (wrap.firstElementChild) strip.replaceWith(wrap.firstElementChild);
      }
    }
  }
}

// Start the global ticker. Idempotent — safe to call from multiple places
// (session start, session resume after page reload, etc.).
function _ensureActiveTicker() {
  if (_activeTicker) return;
  // Tick once immediately to populate on first paint, then every second.
  _tickActiveCards();
  _activeTicker = setInterval(_tickActiveCards, 1000);
}

// Re-establish the ticker on page load if a session is already active. Wired
// into _refreshSurfaces + module init so navigation never leaves us silent.
function _resumeActiveTickerIfNeeded() {
  if (getActiveSession()) _ensureActiveTicker();
}

// Resolve session coordinates from the user's profile, country fallback, or a
// previously cached precise location upgrade. Browser geolocation is no longer
// asked at session-stop time — that ask lives in Settings → Light & Sun as an
// explicit "Use precise location" upgrade.
async function _hydrateFromProfileCoords(id) {
  const coords = getSunCoords();
  if (!coords) return;
  const sess = getSessions().find(s => s.id === id);
  if (!sess) return;
  sess.location = { lat: coords.lat, lon: coords.lon, altitudeM: 0, source: coords.source };
  await saveImportedData();
  await hydrateSession(id);
}

// Country band → centroid lat (0=tropical, 4=subarctic). Used as the lat
// fallback when a country lacks an explicit COUNTRY_CENTROIDS entry.
const BAND_CENTROID_LAT = [15, 32, 45, 55, 65];

export function getSunCoords() {
  // 1. Profile-cached precise coords (set via "Use precise location" upgrade)
  const profileLoc = state.importedData?.sunDefaults?.coords;
  if (profileLoc && Number.isFinite(profileLoc.lat) && Number.isFinite(profileLoc.lon)) {
    return { lat: profileLoc.lat, lon: profileLoc.lon, source: 'profile-precise' };
  }
  // 2. Profile country → deterministic centroid (lat + lon both keyed off the
  // country, never off the device's tz). Earlier versions derived lon from
  // `new Date().getTimezoneOffset()`, which produced different solar-position
  // results across devices in different OS timezones (or DST states) for the
  // same profile — surfaced as cross-device "last UV-A" / UVI mismatches.
  const country = (getProfileLocation()?.country || '').toLowerCase().trim();
  if (country && COUNTRY_LATITUDES[country] !== undefined) {
    const centroid = COUNTRY_CENTROIDS[country];
    if (centroid && Number.isFinite(centroid.lat) && Number.isFinite(centroid.lon)) {
      return { lat: centroid.lat, lon: centroid.lon, source: 'country-band' };
    }
    // Country listed in band table but missing centroid — degrade to band
    // centroid lat + Greenwich. Still device-independent.
    const bandIdx = COUNTRY_LATITUDES[country];
    const lat = BAND_CENTROID_LAT[bandIdx] ?? 45;
    return { lat, lon: 0, source: 'country-band' };
  }
  // No country, no precise coords — return null. The previous tz-only
  // fallback hardcoded lat=45 (NH temperate), which produces physically
  // wrong UV math for southern-hemisphere users (Sydney/Tokyo via UTC+9-10
  // mapped to lat 45° N → winter↔summer flipped). Callers (the strip,
  // session start, etc.) already render "set country" CTAs when this
  // returns null, so dropping the lying fallback is the honest move.
  return null;
}

// Explicit one-time geolocation upgrade. Surfaces in Settings → Light & Sun
// or via a "use precise location" button on the Light & Sun page.
export async function requestPreciseLocation() {
  if (!('geolocation' in navigator)) {
    showNotification('Browser geolocation not available — country-level estimate will be used.');
    return null;
  }
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 60_000 * 30, enableHighAccuracy: true });
    });
    if (!state.importedData.sunDefaults) state.importedData.sunDefaults = {};
    state.importedData.sunDefaults.coords = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      altitudeM: pos.coords.altitude || 0,
      capturedAt: Date.now(),
    };
    await saveImportedData();
    showNotification('Precise location saved — sun calculations will be more accurate.');
    return state.importedData.sunDefaults.coords;
  } catch (e) {
    showNotification('Location not shared — your country still gives a reasonable estimate.');
    return null;
  }
}

// Compact body-exposure summary for the session-list row. Detailed
// (region-driven) sessions report region count, not the misleading
// "Body unset" fallback that the bare preset-label lookup gives.
function _summarizeBodyExposure(sess) {
  const presetKey = sess?.bodyExposure?.preset;
  const presetLabel = EXPOSURE_PRESETS.find(p => p.key === presetKey)?.label;
  if (presetLabel) return presetLabel;
  const regionCount = (sess?.bodyExposure?.regions || []).length;
  if (regionCount > 0) {
    const fractionPct = Math.round((sess.bodyExposure?.fraction || 0) * 100);
    return `${regionCount} region${regionCount === 1 ? '' : 's'} (${fractionPct}%)`;
  }
  return 'Body unset';
}

// ─── UI: Sessions list (used by the dedicated Light & Sun page) ────────

// Render a single sun-session row. Extracted so the unified
// sun+device sessions list (views.js renderUnifiedSessionsList) can
// reuse the same rich treatment instead of rebuilding a stripped-down
// row from scratch — channel chips + burn-risk meta + click-to-open
// detail modal stay consistent whether the user owns devices or not.
export function renderSunSessionRow(sess) {
  const eyeLabels = Object.fromEntries(EYE_MODES.map(e => [e.key, e.label]));
  const start = formatDate(new Date(sess.startedAt).toISOString().slice(0, 10));
  const isActive = !sess.endedAt;
  const dur = isActive
    ? _formatElapsed(Date.now() - sess.startedAt)
    : (sess.durationMin ? `${Math.round(sess.durationMin)} min` : 'in progress');
  const med = sess.safety?.medFraction;
  let medStr = '';
  if (med != null) {
    const pct = Math.round(med * 100);
    let label = 'safe', cls = '';
    if (med >= 1) { label = 'over threshold'; cls = 'over'; }
    else if (med >= 0.7) { label = 'high'; cls = 'warn'; }
    else if (med >= 0.3) { label = 'moderate'; cls = ''; }
    medStr = `<span class="sun-session-med ${cls}" title="Burn dose: ${pct}% of your burn threshold (Fitzpatrick ${escapeAttr(sess.safety.fitzpatrick || 'III')})">Burn dose: ${escapeHTML(label)}</span>`;
  }
  const channelChips = renderChannelChips(sess.doses);
  // Click anywhere on the card (except the × delete) to open the detail
  // modal. Each delete button stops propagation so it only deletes.
  return `<div class="sun-session" data-id="${escapeAttr(sess.id)}" role="button" tabindex="0" aria-label="Open ${start} session details" onclick="window.openSunSessionDetail && window.openSunSessionDetail('${escapeAttr(sess.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openSunSessionDetail && window.openSunSessionDetail('${escapeAttr(sess.id)}')}" style="cursor:pointer">
    <div class="sun-session-head">
      <span class="light-session-icon" aria-hidden="true">☀</span>
      <span class="sun-session-date">${start}</span>
      <span class="sun-session-duration"${isActive ? ' aria-live="off"' : ''}>${dur}</span>
      ${medStr}
      <button class="sun-session-delete" onclick="event.stopPropagation();window.deleteSunSession('${escapeAttr(sess.id)}')" title="Delete session" aria-label="Delete session">×</button>
    </div>
    <div class="sun-session-meta">
      ${escapeHTML(_summarizeBodyExposure(sess))} · ${escapeHTML(eyeLabels[sess.eyeExposure?.mode] || 'Eyes unset')}${sess.bodyExposure?.glassBetween ? ' · through glass' : ''}${sess.bodyExposure?.sunscreenSPF ? ` · SPF ${sess.bodyExposure.sunscreenSPF}` : ''}
    </div>
    ${channelChips}
  </div>`;
}

export function renderSessionsList() {
  const sessions = [...getSessions()].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  if (sessions.length === 0) {
    return `<div class="sun-empty">
      <p>No sun sessions logged yet.</p>
      <button class="import-btn import-btn-primary" onclick="window.quickLogSunSession()">Log your first session</button>
    </div>`;
  }
  let html = `<div class="sun-sessions-list">`;
  for (const sess of sessions) html += renderSunSessionRow(sess);
  html += `</div>`;
  return html;
}

// ─── UI: per-session detail modal ──────────────────────────────────────
//
// Click any saved session row to inspect: full duration, regions exposed,
// eyewear + sunscreen + glass, atmosphere snapshot at session midpoint
// (UVI / ozone / cloud), and per-channel dose breakdown with tier labels.
export function openSunSessionDetail(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess) return;
  const start = new Date(sess.startedAt);
  const end = sess.endedAt ? new Date(sess.endedAt) : null;
  const fmtTime = (d) => d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtDate = (d) => d ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
  const dur = sess.durationMin ? `${Math.round(sess.durationMin)} min` : 'in progress';

  const presetLabels = Object.fromEntries(EXPOSURE_PRESETS.map(p => [p.key, p.label]));
  const eyeLabels = Object.fromEntries(EYE_MODES.map(e => [e.key, e.label]));
  const lensLabels = Object.fromEntries(LENS_TINTS.map(l => [l.key, l.label]));

  // Body exposure summary
  const regions = sess.bodyExposure?.regions || [];
  const regionLabels = regions.length
    ? regions.map(k => BODY_REGIONS.find(r => r.key === k)?.label || k).join(', ')
    : (presetLabels[sess.bodyExposure?.preset] || 'Body unset');
  const fractionPct = Math.round((sess.bodyExposure?.fraction || 0) * 100);

  // Burn-risk
  const med = sess.safety?.medFraction;
  let medStr = '—';
  if (med != null) {
    const pct = Math.round(med * 100);
    let label = 'safe';
    if (med >= 1) label = 'over threshold';
    else if (med >= 0.7) label = 'high';
    else if (med >= 0.3) label = 'moderate';
    medStr = `${pct}% — ${label}`;
  }

  // Per-channel breakdown. Real-world units (IU, J/cm², M-EDI lux)
  // surface where defensible; tier-only for channels without a clean
  // single SI unit. See sun-spectrum.js {vitaminDIU, pbmJoulesPerCm2,
  // circadianMelanopicLux} for the conversions and their sources.
  const channelOrder = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  const channelRows = sess.doses ? channelOrder.map(k => {
    const meta = CHANNEL_DISPLAY[k] || {};
    const v = sess.doses[k] || 0;
    const t = channelTier(v, k);
    const tlabel = tierLabel(t);
    const target = meta.dailyTarget || 0;
    const pctOfTarget = (target > 0 && v > 0) ? Math.round(100 * v / target) : null;
    const unitText = formatChannelUnit(k, v, sess.durationMin || 0, sess.safety?.fitzpatrick || 'III', sess.atmosphere?.uvIndex);
    const ariaLabel = `${meta.label || k} — ${tlabel}${unitText ? ', ' + unitText : ''}. Open channel details.`;
    return `<div class="sun-detail-channel-row sun-detail-channel-row-clickable sun-chip-tier-${t}" role="button" tabindex="0" aria-label="${escapeAttr(ariaLabel)}" onclick="this.closest('.modal-overlay')?.remove();window._openChannelOnLightPage && window._openChannelOnLightPage('${escapeAttr(k)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.closest('.modal-overlay')?.remove();window._openChannelOnLightPage && window._openChannelOnLightPage('${escapeAttr(k)}')}">
      <span class="sun-detail-channel-icon" aria-hidden="true">${meta.icon || '·'}</span>
      <span class="sun-detail-channel-label">${escapeHTML(meta.label || k)}</span>
      <span class="sun-detail-channel-value">${unitText || (pctOfTarget != null ? `${pctOfTarget}% of daily target` : '')}</span>
      <span class="sun-detail-channel-tier">${escapeHTML(tlabel)}</span>
      <span class="sun-detail-channel-chevron" aria-hidden="true">›</span>
    </div>`;
  }).join('') : '<p class="sun-detail-empty">No channel doses computed for this session yet.</p>';

  // Location summary (declared above the atmosphere block so derived metrics
  // can read sess.location for zenith + altitude).
  const loc = sess.location;

  // Atmosphere snapshot + derived geometry. Surfaces zenith, altitude, and
  // a UVA/UVB split so biohackers can audit the math behind the channels.
  const atm = sess.atmosphere;
  let atmHtml = '';
  if (atm) {
    const uvi = atm.uvIndex != null ? Math.round(atm.uvIndex * 10) / 10 : '—';
    const ozone = atm.ozoneDU != null ? Math.round(atm.ozoneDU) : '—';
    const cloud = atm.cloudCover != null ? `${Math.round(atm.cloudCover)}%` : '—';
    const aqPm25 = atm.airQuality?.pm25 != null ? Math.round(atm.airQuality.pm25) : '—';
    let zenithStr = '—', elevStr = '';
    try {
      if (sess.startedAt && sess.endedAt && loc && window.solarZenithAngle) {
        const mid = new Date((sess.startedAt + sess.endedAt) / 2);
        const z = window.solarZenithAngle(mid, loc.lat, loc.lon);
        zenithStr = `${z.toFixed(1)}°`;
        elevStr = `${Math.max(0, 90 - z).toFixed(1)}° above horizon`;
      }
    } catch (e) {}
    const altStr = (loc?.altitudeM ?? 0) > 0 ? `${Math.round(loc.altitudeM)} m` : 'sea level';
    // UVA / UVB split — integrates the reconstructed spectrum across each
    // band. Defensive: if the engine hasn't reconstructed (no zenith yet),
    // fall back to the Bird-Riordan approximation: UVB ≈ ~5% of total UV
    // at midday, UVA ≈ ~95%. Real ratio shifts with zenith + ozone.
    let uvSplitStr = '';
    if (atm.uvIndex != null && atm.uvIndex > 0) {
      const uvbPct = atm.ozoneDU ? Math.max(2, Math.min(8, 6 - (atm.ozoneDU - 300) * 0.02)).toFixed(1) : '~5';
      const uvaPct = (100 - parseFloat(uvbPct)).toFixed(1);
      uvSplitStr = `UVB ~${uvbPct}% / UVA ~${uvaPct}%`;
    }
    atmHtml = `<div class="sun-detail-atm">
      <div title="WHO UV index at session midpoint${atm._uvOverridden ? ' (manual override active)' : ''}"><span>UVI${atm._uvOverridden ? ' (manual)' : ''}</span><strong>${uvi}</strong></div>
      <div title="Total stratospheric ozone column (Dobson Units). Lower DU → more UVB through."><span>Ozone</span><strong>${ozone} DU</strong></div>
      <div title="Cloud-cover modifier on direct beam. Diffuse scatter still passes through."><span>Cloud</span><strong>${cloud}</strong></div>
      <div title="PM2.5 — fine particulate. Affects aerosol optical depth (AOD) and UV scattering."><span>PM2.5</span><strong>${aqPm25}</strong></div>
      <div title="Solar zenith angle at session midpoint — angle between sun and vertical. 0° = directly overhead, 90° = horizon."><span>Zenith</span><strong>${zenithStr}</strong></div>
      <div title="Altitude above sea level — UV climbs ~10% per 1000 m."><span>Altitude</span><strong>${altStr}</strong></div>
      ${uvSplitStr ? `<div title="UVB-to-UVA ratio at ground level. Driven by zenith + ozone column."><span>UV split</span><strong>${uvSplitStr}</strong></div>` : ''}
      <div class="sun-detail-atm-source"><span>Source</span><strong>${escapeHTML(atm.source || 'unknown')}</strong></div>
    </div>`;
  }

  // Location summary string (uses `loc` declared above).
  const locStr = loc
    ? `${loc.lat.toFixed(2)}°, ${loc.lon.toFixed(2)}° · ${escapeHTML(loc.source || 'unknown')}`
    : 'Location not recorded';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal sun-detail-modal" role="dialog" aria-label="Sun session details">
    <div class="modal-header">
      <h3>Sun session — ${escapeHTML(fmtDate(start))}</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <div class="sun-detail-grid">
        <div><span>Started</span><strong>${escapeHTML(fmtTime(start))}</strong></div>
        <div><span>Ended</span><strong>${escapeHTML(end ? fmtTime(end) : '—')}</strong></div>
        <div><span>Duration</span><strong>${escapeHTML(dur)}</strong></div>
        <div><span>Burn dose</span><strong>${escapeHTML(medStr)}</strong></div>
        ${sess.doses?.vitamin_d ? `<div title="Holick 2008 + Bogh & Wulf 2010 conversion, scaled by Fitzpatrick ${sess.safety?.fitzpatrick || 'III'}. Gated by UVI threshold (Webb 2018: no meaningful synthesis below UVI ~2-3). Saturates around 20k IU per session."><span>Vitamin D</span><strong>${escapeHTML(formatChannelUnit('vitamin_d', sess.doses.vitamin_d, sess.durationMin || 0, sess.safety?.fitzpatrick || 'III', sess.atmosphere?.uvIndex))}</strong></div>` : ''}
      </div>

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Body exposed (${fractionPct}% of skin)</div>
        <div class="sun-detail-section-value">${escapeHTML(regionLabels)}</div>
      </div>

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Eyes</div>
        <div class="sun-detail-section-value">${escapeHTML(eyeLabels[sess.eyeExposure?.mode] || 'Unset')}${sess.eyeExposure?.lensTint && sess.eyeExposure.lensTint !== 'clear' ? ` · ${escapeHTML(lensLabels[sess.eyeExposure.lensTint] || '')}` : ''}</div>
      </div>

      ${sess.bodyExposure?.glassBetween || sess.bodyExposure?.sunscreenSPF ? `
        <div class="sun-detail-section">
          <div class="sun-detail-section-label">Modifiers</div>
          <div class="sun-detail-section-value">${sess.bodyExposure?.glassBetween ? 'Behind glass' : ''}${sess.bodyExposure?.glassBetween && sess.bodyExposure?.sunscreenSPF ? ' · ' : ''}${sess.bodyExposure?.sunscreenSPF ? `SPF ${sess.bodyExposure.sunscreenSPF}` : ''}</div>
        </div>
      ` : ''}

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Channels</div>
        <div class="sun-detail-channels">${channelRows}</div>
      </div>

      ${atmHtml ? `
        <div class="sun-detail-section">
          <div class="sun-detail-section-label">Atmosphere at session midpoint</div>
          ${atmHtml}
        </div>
      ` : ''}

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Location</div>
        <div class="sun-detail-section-value">${locStr}</div>
      </div>

      ${sess.notes ? `
        <div class="sun-detail-section">
          <div class="sun-detail-section-label">Notes</div>
          <div class="sun-detail-section-value">${escapeHTML(sess.notes)}</div>
        </div>
      ` : ''}

      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
        ${sess.endedAt ? `<button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove();window.editSunSessionDuration('${escapeAttr(sess.id)}')" title="Override the session duration. Use when a re-end on a second device set it wrong, or you forgot to stop on time.">Edit duration</button>` : ''}
        <button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red)" onclick="this.closest('.modal-overlay').remove();window.deleteSunSession('${escapeAttr(sess.id)}')">Delete</button>
      </div>
    </div>
  </div>`;
  _wireBackdropClose(overlay);
  document.body.appendChild(overlay);
  trapModalFocus(overlay);
}

function renderChannelChips(doses) {
  if (!doses) return '';
  const order = ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'nir_solar'];
  // Top-3 contributing channels for at-a-glance reading. Full grid lives on
  // the Light & Sun page; per-row noise is what the v1.7.0a UX review flagged.
  const ranked = order
    .map(key => ({ key, v: doses[key] || 0, tier: channelTier(doses[key] || 0, key) }))
    .sort((a, b) => b.tier - a.tier || b.v - a.v);
  const showAll = ranked.filter(r => r.tier > 0).length > 3;
  const visible = showAll ? ranked.slice(0, 3) : ranked;
  let html = `<div class="sun-channel-chips">`;
  for (const r of visible) {
    const meta = CHANNEL_DISPLAY[r.key];
    const label = meta?.label || r.key.replace('_', ' ');
    const tip = `${meta?.what || ''} (level: ${tierLabel(r.tier)})`;
    html += `<span class="sun-chip sun-chip-tier-${r.tier}" data-channel="${r.key}" title="${escapeAttr(tip)}">
      <span class="sun-chip-icon">${meta?.icon || '·'}</span>
      <span class="sun-chip-label">${escapeHTML(label)}</span>
      <span class="sun-chip-dots">${tierDots(r.tier)}</span>
    </span>`;
  }
  if (showAll) {
    html += `<button class="sun-chip-more" onclick="this.parentElement.classList.toggle('sun-chips-expanded')">+ ${ranked.length - 3} more</button>`;
    for (const r of ranked.slice(3)) {
      const meta = CHANNEL_DISPLAY[r.key];
      const label = meta?.label || r.key.replace('_', ' ');
      const tip = `${meta?.what || ''} (level: ${tierLabel(r.tier)})`;
      html += `<span class="sun-chip sun-chip-tier-${r.tier} sun-chip-extra" data-channel="${r.key}" title="${escapeAttr(tip)}">
        <span class="sun-chip-icon">${meta?.icon || '·'}</span>
        <span class="sun-chip-label">${escapeHTML(label)}</span>
        <span class="sun-chip-dots">${tierDots(r.tier)}</span>
      </span>`;
    }
  }
  html += `</div>`;
  return html;
}

// ─── Body silhouette picker ────────────────────────────────────────────
//
// Two-view (front + back) anatomical silhouette with tappable regions.
// Selects between male and female outlines based on profile.sex (nominal —
// users can pick whichever they identify with via Settings → Profile).
//
// The viewBox is 200×200 split into two 100×200 columns: front view on
// the left, back view on the right. Each anatomical region is rendered
// as a transparent <path> with a `data-region` attribute matching a key
// in BODY_REGIONS. The path receives a fill when selected.

// Resolve the active profile's sex; defaults to 'male' if unset so we
// don't render an empty picker for first-time users.
function _activeProfileSex() {
  try {
    const id = (typeof window !== 'undefined' && window.getActiveProfileId) ? window.getActiveProfileId() : null;
    if (!id) return 'male';
    const profiles = (typeof window !== 'undefined' && window.getProfiles) ? window.getProfiles() : [];
    const p = profiles.find(p => p.id === id);
    const s = (p?.sex || '').toString().toLowerCase();
    if (s.startsWith('f')) return 'female';
    return 'male';
  } catch (e) {
    return 'male';
  }
}

// Path geometry — anatomically grouped tap targets. Each entry returns the
// SVG `d=` for that region. Coordinates are within a 100×200 viewBox.
// Region paths are NOT filled by default; the silhouette body provides the
// visual outline, regions only color when selected.
//
// Front and back arms / legs use the same SVG geometry but are mapped to
// distinct keys (arms-front vs arms-back, legs-front vs legs-back) so the
// two silhouette views can be toggled independently — clicking front-legs
// no longer also selects the back of the legs.
function _silhouetteRegionPaths(_sex) {
  // Generous tap-target zones sized to cover both the male (~74 wide
  // rendered) and female (~92 wide rendered) freesvg silhouettes. Each
  // path is a rounded rectangle approximating the body part — the freesvg
  // outline beneath provides the visual character; the region tap-target
  // simply tints accent where it overlaps when selected.

  // Arms — outer strips down both sides, generous to catch wider female
  // shoulders. y 38–135 covers shoulder cap → wrist.
  const armsPath =
    'M 4 40 L 28 40 L 28 132 L 4 132 Z ' +
    'M 72 40 L 96 40 L 96 132 L 72 132 Z';

  // Legs — split per side at the centerline, y 138–202.
  const legsPath =
    'M 28 140 L 50 140 L 50 202 L 28 202 Z ' +
    'M 50 140 L 72 140 L 72 202 L 50 202 Z';

  // Soles — bottom strip per foot.
  const solesPath = 'M 28 202 L 50 202 L 50 212 L 28 212 Z M 50 202 L 72 202 L 72 212 L 50 212 Z';

  const front = {
    'face':           'M 38 5 L 62 5 L 62 30 L 38 30 Z',
    'thyroid-throat': 'M 43 30 L 57 30 L 57 40 L 43 40 Z',
    'breast-chest':   'M 28 40 L 72 40 L 72 72 L 28 72 Z',
    'arms-front':     armsPath,
    'torso-front':    'M 32 72 L 68 72 L 68 96 L 32 96 Z',
    'abdomen':        'M 36 96 L 64 96 L 64 122 L 36 122 Z',
    'genitals':       'M 44 122 L 56 122 L 56 138 L 44 138 Z',
    'legs-front':     legsPath,
    'soles-of-feet':  solesPath,
  };
  const back = {
    'arms-back':     armsPath,
    'torso-back':    'M 32 40 L 68 40 L 68 110 L 32 110 Z',
    'glutes':        'M 28 110 L 72 110 L 72 138 L 28 138 Z',
    'legs-back':     legsPath,
    'soles-of-feet': solesPath,
  };
  return { front, back };
}

// Anatomical landmark hints — kept as a no-op extension point. The
// freesvg silhouettes already carry their own anatomical character
// (collarbone shape, navel, knees, calf curves), so we don't overlay
// extra stroke marks. Future use: highlight selected regions with
// landmark callouts, or differentiate front/back via spine/scapula
// strokes if a fork wants stricter front/back differentiation.
// eslint-disable-next-line no-unused-vars
function _silhouetteLandmarks(_sex, _view) { return []; }

// Anatomical outline path for the silhouette body. Sourced from OpenClipart
// via freesvg.org (CC0 / Public Domain) — see js/silhouette-paths.js for
// origin URLs and license. The freesvg paths are at native sizes
// (male 604×1628, female 837×1819); _silhouetteTransform() returns the
// (translate, scale) values to fit each body into our 100×210 picker
// viewBox so the existing region tap-targets line up.
//
// Returns { d, transform } so renderBodySilhouette can wrap each path in
// a <g transform="..."> for inline scaling. Front + back share the same
// outer profile — landmark differences (spine, scapulae, gluteal cleft on
// the back view) come from _silhouetteLandmarks.
function _silhouetteTransform(sex) {
  const native = SILHOUETTE_NATIVE[sex] || SILHOUETTE_NATIVE.male;
  const targetH = 200;
  const scale = targetH / native.vbH;
  const renderedW = native.vbW * scale;
  const tx = (100 - renderedW) / 2;  // center horizontally in the 100-wide column
  const ty = 5;                      // top margin so the head doesn't touch the viewBox edge
  return `translate(${tx.toFixed(2)} ${ty}) scale(${scale.toFixed(5)})`;
}

function _silhouetteBody(sex) {
  const d = sex === 'female' ? FEMALE_BODY_PATH : MALE_BODY_PATH;
  const transform = _silhouetteTransform(sex);
  return { d, transform };
}


// Render the two-view silhouette picker as an SVG with an integrated
// physique toggle (♂ / ♀). `selected` is a Set of region keys; each
// region path fills with accent when selected. Visual style: anatomical
// line drawing with subtle landmark hints (collarbone, navel, knee dimples
// on front; spine, scapulae, gluteal cleft on back) so the silhouette
// reads as a body, not a programmer-drawn blob.
//
// `opts.sex` overrides the default (profile sex). The toggle re-renders
// the SVG inline via the data-sex-toggle attribute, picked up in
// bindBodySilhouette so taps swap the body without losing selections.
export function renderBodySilhouette(selected, opts = {}) {
  const sex = opts.sex || _activeProfileSex();
  const { front, back } = _silhouetteRegionPaths(sex);
  const body = _silhouetteBody(sex);
  const frontLandmarks = _silhouetteLandmarks(sex, 'front');
  const backLandmarks = _silhouetteLandmarks(sex, 'back');

  const renderRegion = (regions, viewKey) =>
    Object.entries(regions).map(([region, d]) => {
      const isSel = selected.has(region);
      const label = (BODY_REGIONS.find(r => r.key === region)?.label) || region;
      const cls = `sun-silhouette-region${isSel ? ' selected' : ''}`;
      return `<path d="${d}" data-region="${region}" data-view="${viewKey}" class="${cls}" role="button" tabindex="0" aria-pressed="${isSel}" aria-label="${escapeAttr(label + ' (' + viewKey + ')')}"><title>${label}${isSel ? ' (selected)' : ''}</title></path>`;
    }).join('');

  const renderLandmarks = (paths) =>
    paths.map(d => `<path d="${d}" class="sun-silhouette-landmark" />`).join('');

  // Physique toggle — small ♂ / ♀ pill above the silhouette. data-sex-toggle
  // attribute is wired in bindBodySilhouette to swap the rendered body.
  const toggle = `<div class="sun-silhouette-toggle" role="radiogroup" aria-label="Body type">
    <button type="button" class="sun-silhouette-toggle-btn${sex === 'male' ? ' active' : ''}" data-sex-toggle="male" role="radio" aria-checked="${sex === 'male'}" aria-label="Male physique">♂ Male</button>
    <button type="button" class="sun-silhouette-toggle-btn${sex === 'female' ? ' active' : ''}" data-sex-toggle="female" role="radio" aria-checked="${sex === 'female'}" aria-label="Female physique">♀ Female</button>
  </div>`;

  // Two columns: front 0–100, back 100–200 (translated). The freesvg outline
  // is wrapped in <g body.transform> for scale + center; region tap-targets
  // sit on top in the 100×210 picker space (invisible until selected);
  // landmark strokes are drawn over the outline for anatomical hints.
  const svg = `<svg viewBox="0 0 200 215" class="sun-silhouette" data-sex="${sex}" role="group" aria-label="Body region picker — tap or press Enter on each region you want to toggle">
    <g class="sun-silhouette-view sun-silhouette-front">
      <g transform="${body.transform}"><path d="${body.d}" class="sun-silhouette-outline"/></g>
      ${renderLandmarks(frontLandmarks)}
      ${renderRegion(front, 'front')}
      <text x="50" y="214" text-anchor="middle" class="sun-silhouette-label" aria-hidden="true">Front</text>
    </g>
    <g class="sun-silhouette-view sun-silhouette-back" transform="translate(100 0)">
      <g transform="${body.transform}"><path d="${body.d}" class="sun-silhouette-outline"/></g>
      ${renderLandmarks(backLandmarks)}
      ${renderRegion(back, 'back')}
      <text x="50" y="214" text-anchor="middle" class="sun-silhouette-label" aria-hidden="true">Back</text>
    </g>
  </svg>`;

  return toggle + svg;
}

// Bind silhouette tap + keyboard handlers — call once after inserting the
// SVG into the DOM. `onChange(selected)` fires after each toggle so the
// caller can re-render or update derived UI (e.g. exposure-fraction readout).
//
// Keyboard: each region has tabindex=0; Enter / Space toggle selection.
// Re-render preserves focus on the toggled region so SR users hear the
// new aria-pressed state without losing their place.
export function bindBodySilhouette(rootEl, selected, onChange) {
  // Track the active physique inside the closure so toggle taps re-render
  // with the right sex without losing the user's region selections.
  let activeSex = rootEl.querySelector('.sun-silhouette')?.dataset?.sex || _activeProfileSex();

  const rerender = (focusRegion, focusView) => {
    rootEl.innerHTML = renderBodySilhouette(selected, { sex: activeSex });
    if (focusRegion) {
      const next = rootEl.querySelector(`[data-region="${CSS.escape(focusRegion)}"][data-view="${CSS.escape(focusView)}"]`);
      if (next) try { next.focus(); } catch (e) {}
    }
  };

  const toggleRegion = (regionKey, focusAfter) => {
    if (!regionKey) return;
    if (selected.has(regionKey)) selected.delete(regionKey); else selected.add(regionKey);
    rerender(regionKey, focusAfter);
    if (onChange) onChange(selected);
  };

  const switchSex = (newSex) => {
    if (newSex !== 'male' && newSex !== 'female') return;
    if (activeSex === newSex) return;
    activeSex = newSex;
    rerender();
  };

  rootEl.addEventListener('click', (e) => {
    const sexBtn = e.target.closest('[data-sex-toggle]');
    if (sexBtn) { switchSex(sexBtn.dataset.sexToggle); return; }
    const t = e.target.closest('[data-region]');
    if (!t) return;
    toggleRegion(t.dataset.region, t.dataset.view);
  });
  rootEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const sexBtn = e.target.closest('[data-sex-toggle]');
    if (sexBtn) { e.preventDefault(); switchSex(sexBtn.dataset.sexToggle); return; }
    const t = e.target.closest('[data-region]');
    if (!t) return;
    e.preventDefault();
    toggleRegion(t.dataset.region, t.dataset.view);
  });
}

// ─── UI: detailed session log (anatomical regions + sunscreen + glass) ─

export function openDetailedSessionDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  const lastUsed = getSessions().filter(s => s.endedAt).slice(-1)[0];
  const eyeMode = lastUsed?.eyeExposure?.mode || 'direct';
  const lensTint = lastUsed?.eyeExposure?.lensTint || 'clear';
  const lastRegions = new Set(lastUsed?.bodyExposure?.regions || []);

  // Default the "Ended at" picker to now so quick "log the session that just
  // ended" stays one-click. Users backfilling earlier sessions can pick any
  // moment up to the present. <input type="datetime-local"> needs a local-tz
  // string; build it manually so we don't rely on the browser's locale guess.
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const localNow = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // Region picker as a checkable chip grid — clearer than a tap-target SVG
  // silhouette per the v1.7.0a UX review. Each chip shows the region label
  // and toggles on click. Free-form, accessible, mobile-friendly.

  overlay.innerHTML = `<div class="modal sun-detailed-modal" role="dialog" aria-label="Past session log">
    <div class="modal-header">
      <h3>Log a past session</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">For sessions that already happened. Tap each body region that was uncovered.${lastUsed ? ' Body regions, eyewear, and lens tint default to your last session.' : ''}</p>

      <label class="ctx-label">Body regions exposed</label>
      <div class="sun-silhouette-wrap" id="sun-silhouette-slot">${renderBodySilhouette(lastRegions)}</div>
      <div class="sun-silhouette-hint" id="sun-silhouette-hint">Tap any body region to toggle whether it was uncovered.</div>

      <div class="sun-detailed-row">
        <label class="ctx-label">Ended at
          <input type="datetime-local" id="det-ended-at" class="ctx-input" value="${escapeAttr(localNow)}" max="${escapeAttr(localNow)}" />
        </label>
        <label class="ctx-label">Duration (min)
          <input type="number" id="det-duration" class="ctx-input" min="1" max="240" value="15" />
        </label>
      </div>

      <div class="sun-detailed-row">
        <label class="ctx-label">Sunscreen SPF
          <input type="number" id="det-spf" class="ctx-input" min="0" max="100" placeholder="none" />
        </label>
        <label class="ctx-label sun-detailed-glass" style="margin-top:24px">
          <input type="checkbox" id="det-glass" />
          Behind glass (window / car / sunroom)
        </label>
      </div>

      <div class="sun-detailed-row">
        <label class="ctx-label">Eyes
          <select id="det-eye-mode" class="ctx-select">
            ${EYE_MODES.map(e => `<option value="${escapeAttr(e.key)}"${e.key === eyeMode ? ' selected' : ''}>${escapeHTML(e.label)}</option>`).join('')}
          </select>
        </label>
        <label class="ctx-label">Lens tint
          <select id="det-lens-tint" class="ctx-select">
            ${LENS_TINTS.map(l => `<option value="${escapeAttr(l.key)}"${l.key === lensTint ? ' selected' : ''}>${escapeHTML(l.label)}</option>`).join('')}
          </select>
        </label>
      </div>

      <label class="ctx-label">Notes
        <textarea id="det-notes" class="ctx-input" rows="2" placeholder="Optional"></textarea>
      </label>

      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-primary" id="det-save">Save session</button>
      </div>
    </div>
  </div>`;
  _wireBackdropClose(overlay);
  document.body.appendChild(overlay);
  trapModalFocus(overlay);

  const selected = new Set(lastRegions);
  const slot = overlay.querySelector('#sun-silhouette-slot');
  const hint = overlay.querySelector('#sun-silhouette-hint');
  const updateHint = () => {
    if (!hint) return;
    const fraction = Array.from(selected).reduce((sum, key) => {
      const r = BODY_REGIONS.find(b => b.key === key);
      return sum + (r?.fraction || 0);
    }, 0);
    if (selected.size === 0) {
      hint.textContent = 'Tap any body region to toggle whether it was uncovered.';
    } else {
      const labels = Array.from(selected).map(k => BODY_REGIONS.find(b => b.key === k)?.label || k).join(', ');
      hint.textContent = `${selected.size} region${selected.size === 1 ? '' : 's'} exposed (${(fraction * 100).toFixed(0)}% of skin) — ${labels}`;
    }
  };
  bindBodySilhouette(slot, selected, updateHint);
  updateHint();

  overlay.querySelector('#det-save').addEventListener('click', async () => {
    const durationMin = parseInt(overlay.querySelector('#det-duration').value, 10) || 15;
    const eyeModeVal = overlay.querySelector('#det-eye-mode').value || 'direct';
    const lensTintVal = overlay.querySelector('#det-lens-tint').value || 'clear';
    const spf = parseInt(overlay.querySelector('#det-spf').value, 10) || null;
    const glass = overlay.querySelector('#det-glass').checked;
    const notes = overlay.querySelector('#det-notes').value || '';

    // Resolve "Ended at" — falls back to now if the user cleared the field.
    const endedAtRaw = overlay.querySelector('#det-ended-at').value;
    const endedMs = endedAtRaw ? new Date(endedAtRaw).getTime() : Date.now();
    const endedAt = Number.isFinite(endedMs) ? Math.min(endedMs, Date.now()) : Date.now();

    // Compute exposure fraction from selected regions
    const regions = Array.from(selected);
    const fraction = regions.reduce((sum, key) => {
      const r = BODY_REGIONS.find(b => b.key === key);
      return sum + (r?.fraction || 0);
    }, 0);

    const start = endedAt - durationMin * 60 * 1000;
    const sessId = await logCompletedSession({
      startedAt: start,
      endedAt,
      bodyExposure: { preset: regions.length === 0 ? 'face_hands' : 'detailed', fraction: Math.max(0.05, fraction), regions, sunscreenSPF: spf, glassBetween: glass },
      eyeExposure: { mode: eyeModeVal, lensTint: lensTintVal, durationSec: durationMin * 60 },
      notes,
    });
    if (sessId && window.hydrateSession) await window.hydrateSession(sessId);
    overlay.remove();
    showNotification(`Detailed session saved: ${durationMin} min, ${regions.length} regions.`);
    if (window.navigate && state.currentView === 'light') window.navigate('light');
  });
}

// Delete from window for inline onclick
async function deleteSunSession(id) {
  showConfirmDialog('Delete this sun session?', async () => {
    await deleteSession(id);
    _refreshSurfaces();
  });
}

// ─── Window export ─────────────────────────────────────────────────────

// User-facing edit-duration entry point — prompts for a new minutes
// value, validates the range, calls updateSession (which bumps
// updatedAt + re-hydrates doses on duration change), then re-renders.
async function editSunSessionDuration(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess) {
    showNotification('Session not found', 'error');
    return;
  }
  const current = Math.max(0, Math.round(sess.durationMin || 0));
  const raw = await showPromptDialog('New duration (in minutes)', {
    defaultValue: String(current),
    okLabel: 'Save',
    placeholder: 'e.g. 26',
  });
  if (raw === null) return; // user cancelled
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 600) {
    showNotification('Enter a duration between 0 and 600 minutes.', 'error');
    return;
  }
  const next = Math.round(parsed);
  if (next === current) return; // nothing to do
  await updateSession(id, { durationMin: next });
  showNotification(`Session duration set to ${next} min. Other devices will pull this on next sync.`, 'success');
  if (window.navigate && state.currentView === 'light') window.navigate('light');
}

if (typeof window !== 'undefined') {
  window.SUN_ENGINE_VERSION = SUN_ENGINE_VERSION;
  Object.assign(window, {
    quickLogSunSession,
    startSession,
    stopSession,
    logCompletedSession,
    updateSession,
    editSunSessionDuration,
    deleteSunSession,
    hydrateSession,
    rehydrateStaleSessions,
    getSessions,
    getActiveSession,
    rollingChannelTotals,
    dailyChannelBreakdown,
    rollingVitaminDIU,
    cumulativeMEDToday,
    cumulativeMEDYesterday,
    _applyAtmOverrides,
    renderSessionsList,
    renderSunSessionRow,
    getSunCoords,
    requestPreciseLocation,
    openDetailedSessionDialog,
    openStartSunSessionDialog,
    openSunSessionDetail,
    renderBodySilhouette,
    bindBodySilhouette,
    trapModalFocus,
    _wireBackdropClose,
    _resumeActiveTickerIfNeeded,
    _ensureActiveTicker,
    BODY_REGIONS,
    EXPOSURE_PRESETS,
    EYE_MODES,
    LENS_TINTS,
    CHANNEL_DISPLAY,
    channelTier,
    tierLabel,
    formatChannelUnit,
    tierDots,
  });
}
