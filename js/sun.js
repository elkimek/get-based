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
import { escapeHTML, escapeAttr, formatDate, showNotification, showPromptDialog, showConfirmDialog } from './utils.js';
import { saveImportedData } from './data.js';
import { getProfileLocation } from './profile.js';
import { COUNTRY_LATITUDES, COUNTRY_CENTROIDS } from './constants.js';
import { recordTombstone } from './data-merge.js';
import { MALE_BODY_PATH, FEMALE_BODY_PATH, SILHOUETTE_NATIVE } from './silhouette-paths.js';

// ─── Anatomical regions (for body silhouette picker) ───────────────────
// 11 regions per the design — each carries optional research notes for AI.
// Photosensitizing medication scale tiers — used by fractionOfMED() in
// place of the legacy boolean flag. MED multipliers from AAD/Mayo Clinic
// guidance: severe drugs (tetracyclines, retinoids systemic, amiodarone)
// shift erythemal threshold ~4×; moderate (NSAIDs, thiazides, sulfa) ~2.5×;
// mild (some antihistamines) ~1.5×.
export const PHOTOSENSITIVE_MED_TIERS = [
  { key: 'none',     label: 'None',      medScale: 1.0,  examples: '' },
  { key: 'mild',     label: 'Mild',      medScale: 0.7,  examples: 'antihistamines (most), some NSAIDs' },
  { key: 'moderate', label: 'Moderate',  medScale: 0.4,  examples: 'NSAIDs, thiazide diuretics, sulfa antibiotics, St. John\'s Wort, topical retinol' },
  { key: 'severe',   label: 'Severe',    medScale: 0.25, examples: 'tetracyclines (doxycycline), oral retinoids (isotretinoin), amiodarone, citrus essential oils on skin' },
];

// Map tier key to multiplier; default to none (no scaling) on unknown.
export function photosensitiveMedScale(tier) {
  const t = PHOTOSENSITIVE_MED_TIERS.find(x => x.key === tier);
  return t ? t.medScale : 1.0;
}

// Normalize legacy boolean photosensitiveMeds storage into a tier key.
// boolean true → 'moderate' (the previous fixed-0.4 multiplier semantically
// matches moderate); boolean false / null / undefined → 'none'.
export function _normalizePSMTier(raw) {
  if (raw === true) return 'moderate';
  if (raw === false || raw == null) return 'none';
  if (typeof raw === 'string' && PHOTOSENSITIVE_MED_TIERS.some(t => t.key === raw)) return raw;
  return 'none';
}

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
// Daily targets calibrated against a "good outdoor day" reference: roughly
// 30-60 minutes of moderate-body-fraction (~30%) midday exposure for
// skin channels, or 10-30 minutes of eye-direct outdoor light for eye
// channels. Raw channel-au scales with body fraction × duration × spectral
// integration — a fully-exposed sunbather will hit several hundred percent
// of these targets in a long session, which is the correct mathematical
// outcome (they got a lot of that signal), not a UI bug.
//
// Calibration basis per channel noted inline. Targets are "ceiling for a
// typical active outdoor day", not "minimum for benefit" — most users
// will see 30-100% on most days.
export const CHANNEL_DISPLAY = {
  vitamin_d:  { icon: '☀',  label: 'Vitamin D',          dailyTarget:    300, what: 'UVB on bare skin makes vitamin D. Stops increasing around the point your skin starts to redden — longer is not better.' },
  // POMC uses CIE-erythemal action spectrum (UVB-heavy) — accumulates
  // ~4× slower per minute than vit-D. ~30 min noon at face+hands ≈ 60
  // channel-au. Target 80 = strong daily UVA-UVB exposure.
  pomc:       { icon: '⚡',  label: 'Mood & hormones',    dailyTarget:     80, what: 'Sun on skin triggers a hormone cascade — α-MSH (the tan signal), β-endorphin (mood), ACTH (stress response). Part of why sun feels good.' },
  // NO/cardiovascular uses UVA action spectrum (Liu/Oplander 2014).
  // BP-reducing dose ~30 min midday on 30-50% body ≈ 5000 channel-au.
  // Set to 5000 — matches the empirical threshold in the literature.
  no_cv:      { icon: '❤',  label: 'Cardiovascular',     dailyTarget:   5000, what: 'UVA from skin releases nitric oxide — supports blood-vessel function, lowers blood pressure, improves circulation, dampens inflammation.' },
  // Violet-eye (Opn5 360-440nm at eye). Hattar/Huberman recommend
  // 10-30 min outdoor morning light for dopamine + eye health. 30 min
  // morning walk eye-direct ≈ 8000 channel-au; target 8000.
  violet_eye: { icon: '👁',  label: 'Outdoor eye light',  dailyTarget:   8000, what: 'Outdoor 360–400 nm hits sensors in eye and skin. Linked to eye health and dopamine release — the difference between "outside" and "window light" even when both feel bright.' },
  // Circadian/melanopic at eye. ~30-60 min outdoor light entrains the
  // SCN. Per CIE S 026 melanopic luminous efficacy K_mel,v ≈ 614 lx/(W/m²).
  // 30 min direct outdoor = ~20000 channel-au. Keep target.
  circadian:  { icon: '🌅', label: 'Body clock',         dailyTarget:  20000, what: 'Bright light at the eye sets your circadian rhythm — earlier bedtime, faster wake-up, deeper sleep. Strongest effect in the first 2 hours after sunrise.' },
  // NIR-solar broadband (600-1400nm). Wunsch/Jeffery optical tissue
  // window — solar NIR is ~250-400 W/m² at noon. 60 min @ 30% body =
  // ~30000 channel-au. Target 30000.
  nir_solar:  { icon: '🔥', label: 'Cellular repair',    dailyTarget:  30000, what: 'Solar 600–1400 nm penetrates deep into tissue and reaches mitochondria. Supports recovery, raises local melatonin in cells, reduces inflammation. The half of sunlight that windows block.' },
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

// Posture options surfaced in pickers + applied as a multiplier on the
// effective body fraction (see _POSTURE_MULTIPLIERS in _rateAtInstant).
export const POSTURE_OPTIONS = [
  { key: 'standing',     label: 'Standing / walking' },
  { key: 'sitting',      label: 'Sitting / reclined' },
  { key: 'lying-supine', label: 'Lying face-up' },
  { key: 'lying-prone',  label: 'Lying face-down' },
];

// Surface albedo dropdown values — UV reflection from below augments
// total received irradiance by ~(albedo × 0.5). See _SURFACE_ALBEDO.
export const SURFACE_OPTIONS = [
  { key: 'grass',    label: 'Grass / dirt (~3% reflect)' },
  { key: 'concrete', label: 'Concrete / pavement (~10%)' },
  { key: 'sand',     label: 'Sand (~25%)' },
  { key: 'water',    label: 'Water / pool (~25%)' },
  { key: 'snow',     label: 'Snow / ice (~80%)' },
];

// Start a session — minimal entry with sensible defaults. Returns id.
// Accepts either an `exposurePreset` (legacy 4-preset coarse buckets) or a
// `regions` array (anatomical-region picker output). Regions take priority
// when both are supplied — fraction is computed by summing region fractions.
export async function startSession({ exposurePreset = 'face_hands', regions, eyeMode = 'direct', lensTint = 'clear', glassBetween = false, location, posture = 'standing', surfaceAlbedo = 'grass' } = {}) {
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
    posture,                  // body orientation multiplier — see _POSTURE_MULTIPLIERS
    surfaceAlbedo,            // ground reflectance multiplier — see _SURFACE_ALBEDO
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
  _commitCurrentSlice(sess);
  sess.paused = true;
  sess.pausedAt = Date.now();
  // Clear rate so resume forces a fresh snapshot with current atm.
  _setLiveState(id, { ratePerMin: null });
  await saveImportedData();
  return sess;
}

// Resume a paused session — clears paused flag and the ticker re-snapshots
// with current atmosphere on the next pass. New slice begins from now.
export async function resumeSession(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt || !sess.paused) return null;
  sess.paused = false;
  delete sess.pausedAt;
  await saveImportedData();
  return sess;
}

// User-facing wrappers — called from inline onclick handlers in
// renderSunSessionRow's active controls. Both call the surface refresh
// to update the dashboard strip + Light page state immediately.
export async function pauseSunSession(id) {
  await pauseSession(id);
  showNotification('Session paused — dose accrual frozen until you resume.', 'success', 3500);
  _refreshSurfaces();
}
export async function resumeSunSession(id) {
  await resumeSession(id);
  showNotification('Session resumed — fresh atmosphere snapshot on the next tick.', 'success', 3500);
  _refreshSurfaces();
}

// Mid-session "I just reapplied sunscreen" hook. Commits the slice
// computed under the OLD SPF, prompts for the new value, then updates
// the session record. The next tick snapshots a fresh rate with the
// new SPF baked in via _rateAtInstant's bodyModifiers path.
export async function applySunscreenMidSession(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt) return;
  const cur = sess.bodyExposure?.sunscreenSPF || 0;
  const raw = await showPromptDialog(
    `Reapply sunscreen — what SPF? (Currently SPF ${cur || 'none'})`,
    { defaultValue: cur ? String(cur) : '30', okLabel: 'Apply', placeholder: 'SPF (15-100)' }
  );
  if (raw == null) return;
  const spf = parseInt(raw, 10);
  if (!Number.isFinite(spf) || spf < 0 || spf > 100) {
    showNotification('SPF must be 0-100.', 'error', 3000);
    return;
  }
  // Commit current slice with OLD SPF before the change, then update +
  // clear rate so the next tick snapshots fresh under the NEW SPF.
  _commitCurrentSlice(sess);
  if (!sess.bodyExposure) sess.bodyExposure = {};
  sess.bodyExposure.sunscreenSPF = spf || null;
  _setLiveState(id, { ratePerMin: null });
  await saveImportedData();
  showNotification(`SPF updated to ${spf || 'none'} — next dose-rate sample uses the new value.`, 'success', 3500);
  _refreshSurfaces();
}

// Quick ozone-DU override surfaced from the active card — saves to
// sunDefaults.overrides.ozoneDU which _applyAtmOverrides reads on every
// _rateAtInstant. Clears live ratePerMin so the new override applies on
// the next tick.
export async function setOzoneOverrideMidSession() {
  const cur = state.importedData?.sunDefaults?.overrides?.ozoneDU;
  const raw = await showPromptDialog(
    `Stratospheric ozone column (Dobson Units). Typical 220-450 DU. Leave empty to clear and use the source value.`,
    { defaultValue: cur ? String(cur) : '', okLabel: 'Apply', placeholder: 'e.g. 320' }
  );
  if (raw == null) return;
  const trimmed = String(raw).trim();
  if (!state.importedData.sunDefaults) state.importedData.sunDefaults = {};
  if (!state.importedData.sunDefaults.overrides) state.importedData.sunDefaults.overrides = {};
  if (trimmed === '') {
    state.importedData.sunDefaults.overrides.ozoneDU = null;
    showNotification('Ozone override cleared — using source value.', 'success', 3000);
  } else {
    const du = parseFloat(trimmed);
    if (!Number.isFinite(du) || du < 100 || du > 600) {
      showNotification('Ozone DU must be 100-600.', 'error', 3000);
      return;
    }
    state.importedData.sunDefaults.overrides.ozoneDU = du;
    showNotification(`Ozone override set: ${du} DU. Active session re-snapshots on next tick.`, 'success', 3500);
  }
  // Force re-snapshot for any active session.
  for (const s of getSessions().filter(x => !x.endedAt)) {
    _commitCurrentSlice(s);
    _setLiveState(s.id, { ratePerMin: null });
  }
  await saveImportedData();
  _refreshSurfaces();
}

// Forgot-to-stop banner action — closes a session that's been running
// > 12h. Sets endedAt to now (or the previous sunset, whichever is
// earlier and still after startedAt) so the dose math is bounded.
export async function _forgotStopPrompt(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt) return;
  const hours = ((Date.now() - sess.startedAt) / 3600000).toFixed(1);
  showConfirmDialog(
    `End this session that's been running ${hours} hours? Best-guess end time: now. The recorded duration will still reflect this — please trim it from the session detail if you ended earlier.`,
    async () => {
      await stopSession(sess.id);
      await _hydrateFromProfileCoords(sess.id);
      _refreshSurfaces();
      showNotification('Session ended. Open the session detail to adjust the duration if needed.', 'success', 4500);
    }
  );
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
export const SUN_ENGINE_VERSION = 5;

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
      aod: atm?.airQuality?.aod ?? null,
    });
    const bodyModifiers = {
      glassBetween: !!sess.bodyExposure?.glassBetween,
      sunscreenSPF: sess.bodyExposure?.sunscreenSPF || 0,
    };
    // Apply posture + surface-albedo multipliers to body fraction so
    // hydrated doses match the live engine's accounting.
    const baseFraction = sess.bodyExposure?.fraction ?? 0;
    const postureMult = _POSTURE_MULTIPLIERS[sess.posture] ?? 1.0;
    const albedoMult = 1 + (_SURFACE_ALBEDO[sess.surfaceAlbedo] ?? 0) * 0.5;
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
      bodyExposureFraction: effFraction,
      bodyModifiers,
    });
    // Read from one of two places, in priority order:
    //   1. sunDefaults.fitzpatrick (Light setup card)
    //   2. lightCircadian.skinType (Light & Circadian context card)
    // Falls back to 'III' (median) if none.
    const lcSkin = state.importedData?.lightCircadian?.skinType;
    const lcRoman = lcSkin && (window._skinTypeToFitzpatrick ? window._skinTypeToFitzpatrick(lcSkin) : (lcSkin.match(/^(I{1,3}|IV|VI?)\b/) || [])[1]);
    const fitzpatrick = state.importedData?.sunDefaults?.fitzpatrick || lcRoman || 'III';
    const psmTier = _normalizePSMTier(state.importedData?.sunDefaults?.photosensitiveMeds);
    const medScale = photosensitiveMedScale(psmTier);
    sess.safety = {
      sed,
      medFraction: fractionOfMED({ sed, fitzpatrick, medScale }),
      retinalUV: retinalUVdose({ spectrum, eyeExposure: sess.eyeExposure }),
      fitzpatrick,
      photosensitiveMedTier: psmTier,
      // Legacy boolean kept for backward compat with consumers that
      // haven't migrated to the tier field yet.
      photosensitive: medScale < 1.0,
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

// Cumulative vitamin D IU synthesized from sun TODAY (local-day window).
// Mirrors rollingVitaminDIU logic but bounds by local midnight instead of
// a rolling-N-day cutoff. Used by the vit-D budget cross-check.
export function cumulativeVitaminDIUToday() {
  if (typeof window.vitaminDIU !== 'function') return 0;
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  let total = 0;
  for (const sess of getSessions()) {
    if (!sess.endedAt) {
      if ((sess.startedAt || 0) < dayStart) continue;
      const live = _liveDosesFor(sess);
      if (live?.doses?.vitamin_d) {
        const fitz = live.fitzpatrick || sess.safety?.fitzpatrick || 'III';
        const uvi = live.atm?.uvIndex ?? sess.atmosphere?.uvIndex ?? null;
        total += window.vitaminDIU(live.doses.vitamin_d, fitz, uvi);
      }
      continue;
    }
    if (!sess.doses?.vitamin_d) continue;
    if (sess.endedAt < dayStart) continue;
    const fitz = sess.safety?.fitzpatrick || 'III';
    const uvi = sess.atmosphere?.uvIndex ?? null;
    total += window.vitaminDIU(sess.doses.vitamin_d, fitz, uvi);
  }
  return total;
}

// Today's vitamin D from active supplements. Walks importedData.supplements
// looking for ingredients whose name matches vitamin D variants
// (D / D3 / cholecalciferol / D2 / ergocalciferol). Converts mcg→IU
// (1 mcg = 40 IU). Returns total IU/day. Active period defined as no
// endDate or endDate >= today.
function _dailySupplementVitaminDIU() {
  const supps = state.importedData?.supplements || [];
  const today = new Date().toISOString().slice(0, 10);
  let total = 0;
  for (const supp of supps) {
    // Filter to currently-active supplement records — same logic the
    // timeline + supplement-impact uses (start <= today, end empty/future).
    if (supp.startDate && supp.startDate > today) continue;
    if (supp.endDate && supp.endDate < today) continue;
    for (const ing of (supp.ingredients || [])) {
      const name = (ing.name || '').toLowerCase();
      if (!/vit(?:amin)?[\s-]*d[23]?\b|cholecalciferol|ergocalciferol/.test(name)) continue;
      // Skip topical/cream forms (don't add to systemic budget).
      if (/cream|topical|serum/.test(name)) continue;
      const total24h = (window.ingredientDailyTotal && window.ingredientDailyTotal(ing, supp))
        || (typeof ingredientDailyTotal === 'function' ? ingredientDailyTotal(ing, supp) : null);
      if (!total24h) continue;
      const u = (total24h.unit || '').toLowerCase();
      let iu = total24h.value;
      if (/mcg|µg|μg/.test(u)) iu *= 40; // 1 mcg = 40 IU
      total += iu;
    }
  }
  return total;
}

// Vitamin D daily-budget assessment — combines supplement + sun-derived
// totals. Returns a structured object so views.js can render whatever
// surface fits (chip, banner, banner-with-detail).
//
// Reference: IOM 2010 sets 4000 IU/d as the Tolerable Upper Intake Level
// (UL) from supplements alone. Sun-derived vit D doesn't count toward
// this limit because skin photoisomerization plateaus at ~20,000 IU per
// session — the body self-regulates. We surface the supplement total
// against UL, and the combined total as informational context.
export function vitaminDBudgetStatus() {
  const supplementIU = _dailySupplementVitaminDIU();
  const sunIU = cumulativeVitaminDIUToday();
  const total = supplementIU + sunIU;
  const supplementUL = 4000;
  return {
    supplementIU,
    sunIU,
    total,
    supplementUL,
    exceedsSupplementUL: supplementIU > supplementUL,
  };
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

// Lookup current UVI from the configured atm provider. Returns the scalar
// uvIndex or null on any failure (no coords / fetch error / missing field).
// Used for the pre-session high-UV warning banner.
async function _fetchCurrentUVI() {
  if (!window.fetchAtmosphere) return null;
  const coords = getSunCoords();
  if (!coords) return null;
  try {
    const atm = await window.fetchAtmosphere({
      lat: coords.lat, lon: coords.lon, isoTime: new Date().toISOString(),
    });
    const overridden = _applyAtmOverrides(atm);
    return overridden?.uvIndex ?? null;
  } catch (e) { return null; }
}

// Estimated minutes-to-MED for a given UVI + Fitzpatrick + photosensitive
// status. The CIE-erythemal action spectrum + UVI definition give us
// MED time = baseMED_J_per_m2 / (UVI × ~25 mW/m²). Photosensitive meds
// scale the MED denominator down via PHOTOSENSITIVE_MED_TIERS.
function _estimateMedMinutes(uvi, fitzpatrick, psmTier) {
  if (!Number.isFinite(uvi) || uvi <= 0) return null;
  const fitzMED = { I: 200, II: 250, III: 300, IV: 450, V: 600, VI: 1000 };
  const baseMED = fitzMED[fitzpatrick] ?? fitzMED.III;
  const med = baseMED * (photosensitiveMedScale(psmTier) || 1.0);
  // 1 UVI unit = 25 mW/m² CIE-erythemal-weighted irradiance.
  const irradiance = uvi * 25; // mW/m²
  const seconds = (med * 1000) / irradiance; // J/m² ÷ mW/m² → seconds (×1000 for unit alignment)
  return Math.round(seconds / 60);
}

// Render the pre-session UVI banner HTML. Returns '' when conditions
// don't warrant a warning (UVI < 8 OR Fitz IV-VI without photosensitive
// meds). Always shows when photosensitiveMeds is moderate/severe even
// at lower UVI because their MED is sharply lowered.
function _renderUVIPreflightBanner(uvi, fitzpatrick, psmTier) {
  if (!Number.isFinite(uvi)) return '';
  const fairSkin = ['I', 'II', 'III'].includes(fitzpatrick);
  const psmHigh = psmTier === 'moderate' || psmTier === 'severe';
  // Don't pester at low UVI for non-fair, non-photosensitive users.
  if (uvi < 8 && !psmHigh) return '';
  if (uvi < 5 && !psmHigh) return '';
  const medMin = _estimateMedMinutes(uvi, fitzpatrick, psmTier);
  let cls = 'sun-uvi-warn';
  let icon = '☀';
  let title = '';
  if (uvi >= 11) { cls = 'sun-uvi-extreme'; icon = '⚠'; title = `Extreme UV (UVI ${uvi.toFixed(1)})`; }
  else if (uvi >= 8) { cls = 'sun-uvi-veryhigh'; icon = '☀'; title = `Very high UV (UVI ${uvi.toFixed(1)})`; }
  else { title = `UV ${uvi.toFixed(1)} — burn risk elevated by photosensitizer`; }
  const medLine = medMin ? `Estimated MED for Fitzpatrick ${fitzpatrick}${psmHigh ? ` + ${psmTier} photosensitizer` : ''}: ~${medMin} min uncovered.` : '';
  return `<div class="${cls}"><strong>${icon} ${escapeHTML(title)}</strong> ${escapeHTML(medLine)} Sunscreen + cover up + a shorter session strongly suggested.</div>`;
}

// Show the "What's uncovered?" dialog with the body silhouette + a Start
// button. The picker pre-selects regions from the user's last completed
// session so habitual users hit Start without changes; first-time users
// pick everything fresh.
//
// Pre-flight UVI warning: when current UVI is in the high range (≥8) and
// the user is a fair skin type (Fitzpatrick I-III), prepend an alert
// banner with the estimated MED time for plain-text comprehension.
export async function openStartSunSessionDialog() {
  const last = getSessions().filter(s => s.endedAt).slice(-1)[0];
  const lastRegions = new Set(last?.bodyExposure?.regions || []);
  const defaultEye = last?.eyeExposure?.mode || 'direct';
  const defaultLens = last?.eyeExposure?.lensTint || 'clear';
  const defaultGlass = !!last?.bodyExposure?.glassBetween;
  const defaultPosture = last?.posture || 'standing';
  const defaultSurface = last?.surfaceAlbedo || 'grass';
  // Pull current UVI for the high-UV pre-flight banner. Fire-and-forget;
  // dialog opens immediately even if the fetch lags. Banner lights up
  // when the promise resolves (slot in the modal).
  const fitz = state.importedData?.sunDefaults?.fitzpatrick || 'III';
  const psm = state.importedData?.sunDefaults?.photosensitiveMeds || 'none';
  const uviPromise = _fetchCurrentUVI();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal sun-start-modal" role="dialog" aria-label="Start sun session">
    <div class="modal-header">
      <h3>Start a sun session</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <div id="sun-start-uvi-banner" class="sun-start-uvi-banner" hidden></div>
      <p class="modal-body-hint">Tap each body region that's uncovered right now. The session begins as soon as you hit Start.</p>
      <div class="sun-silhouette-wrap" id="sun-start-silhouette-slot">${renderBodySilhouette(lastRegions)}</div>
      <div class="sun-silhouette-hint" id="sun-start-hint">Tap any body region to toggle whether it's uncovered.</div>

      <details class="sun-start-details">
        <summary>Posture, surface, eyewear, sunscreen, glass — change defaults</summary>
        <div class="sun-detailed-row" style="margin-top:10px">
          <label class="ctx-label">Posture
            <select id="start-posture" class="ctx-select">
              ${POSTURE_OPTIONS.map(o => `<option value="${escapeAttr(o.key)}"${o.key === defaultPosture ? ' selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
            </select>
          </label>
          <label class="ctx-label">Surface
            <select id="start-surface" class="ctx-select">
              ${SURFACE_OPTIONS.map(o => `<option value="${escapeAttr(o.key)}"${o.key === defaultSurface ? ' selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
            </select>
          </label>
        </div>
        <p class="sun-detailed-glass-hint">Lying flat catches more sun than standing (~40%). Reflective surfaces (sand, water, snow) bounce UV onto your skin from below.</p>
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

  // Resolve the UVI lookup; render the pre-flight banner if conditions
  // warrant it. Async — the dialog is already shown so we don't block.
  uviPromise.then((uvi) => {
    if (!Number.isFinite(uvi)) return;
    const banner = overlay.querySelector('#sun-start-uvi-banner');
    if (!banner) return;
    const html = _renderUVIPreflightBanner(uvi, fitz, psm);
    if (html) {
      banner.innerHTML = html;
      banner.hidden = false;
    }
  });

  overlay.querySelector('#start-confirm').addEventListener('click', async () => {
    const eyeMode = overlay.querySelector('#start-eye-mode').value || 'direct';
    const lensTint = overlay.querySelector('#start-lens-tint').value || 'clear';
    const glassBetween = overlay.querySelector('#start-glass').checked;
    const posture = overlay.querySelector('#start-posture').value || 'standing';
    const surfaceAlbedo = overlay.querySelector('#start-surface').value || 'grass';
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
    const id = await startSession({ regions, eyeMode, lensTint, glassBetween, posture, surfaceAlbedo, location: coords });
    overlay.remove();
    showNotification(`Outdoor session started · ${regions.length} region${regions.length === 1 ? '' : 's'} exposed`);
    const psmTierActive = _normalizePSMTier(state.importedData?.sunDefaults?.photosensitiveMeds);
    if (psmTierActive !== 'none') {
      const factor = { mild: '~1.4×', moderate: '~2.5×', severe: '~4×' }[psmTierActive] || '~2.5×';
      showNotification(`⚠ ${psmTierActive.charAt(0).toUpperCase() + psmTierActive.slice(1)} photosensitizer active — your burn threshold is ${factor} lower. Plan to wrap up at the first sign of pinkness.`, 'warning', 7000);
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

// Snapshot the per-minute channel rate for the active session.
//
// Sliced model: each snapshot defines a "rate slice" that applies from
// snapshotAt to the next snapshot (or to session end). committedDoses
// accumulates the contribution of all closed slices; the current slice's
// contribution is computed live in _liveDosesFor and added on top.
//
// First snapshot of a session: snapshotAt = sess.startedAt so the slice
// covers from session start (handles page reload — first snapshot after
// reload covers from start).
// Re-snapshot (committedDoses already exists): snapshotAt = Date.now(),
// the previous slice was committed by _commitCurrentSlice() before the
// caller cleared ratePerMin.
//
// NEVER mutates the session object — keeps the atm payload + function
// refs out of localStorage / CRDT.
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
    const psmTier = _normalizePSMTier(state.importedData?.sunDefaults?.photosensitiveMeds);
    const medScale = photosensitiveMedScale(psmTier);
    // baselineZenith is sampled once per session and never overwritten —
    // keeps the per-slice zenithScale denominator stable so cumulative
    // doses don't jump every refresh cycle.
    const existing = _getLiveState(sess.id) || {};
    // First snapshot: slice begins at sess.startedAt so all elapsed time
    // counts. Re-snapshot (committedDoses already populated by the
    // commit step): slice begins now.
    const isReSnapshot = !!existing.committedDoses;
    const sliceStart = isReSnapshot ? Date.now() : sess.startedAt;
    _setLiveState(sess.id, {
      ratePerMin, sedPerMin, fitzpatrick, medScale, psmTier, atm, zenith,
      baselineZenith: existing.baselineZenith ?? zenith,
      snapshotAt: sliceStart,
      committedDoses: existing.committedDoses || {},
      committedSED: existing.committedSED || 0,
      committedRetinalUV: existing.committedRetinalUV || 0,
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

// Compute the per-minute channel rate + erythemal SED rate for a session
// at a specific instant. Pulls interpolated atm fields from the cached
// atmosphere's hourly arrays (so values smoothly cross hour boundaries
// instead of step-changing) and computes a fresh spectrum using the live
// solar zenith. Returns { rate, sedPerMin } in dose-per-minute units, or
// null if any required engine module isn't wired yet.
//
// This is the inner kernel used by Simpson integration in _liveDosesFor /
// _commitCurrentSlice — replaces the previous single-rate-times-elapsed
// approximation with proper sub-slice spectral resolution.
function _rateAtInstant(sess, instantMs) {
  const live = _getLiveState(sess?.id);
  if (!live || !live.atm) return null;
  const reconstructSpectrum = window.reconstructSpectrum;
  const computeChannelDoses = window.computeChannelDoses;
  const erythemalSED = window.erythemalSED;
  const solarZenithAngle = window.solarZenithAngle;
  const interpolateAtmosphere = window.interpolateAtmosphere;
  if (!reconstructSpectrum || !computeChannelDoses || !erythemalSED || !solarZenithAngle) return null;

  const coords = sess.location;
  if (!coords) return null;
  const when = new Date(instantMs);
  const isoTime = when.toISOString();

  // Interpolate atm fields between hourly buckets when arrays available;
  // otherwise fall back to the snapshot's scalar values.
  let atmAtT = live.atm;
  if (interpolateAtmosphere) {
    const interp = interpolateAtmosphere(live.atm, isoTime);
    if (interp) {
      atmAtT = {
        ...live.atm,
        uvIndex: interp.uvIndex ?? live.atm.uvIndex,
        cloudCover: interp.cloudCover ?? live.atm.cloudCover,
        temperatureC: interp.temperatureC ?? live.atm.temperatureC,
      };
    }
  }
  // Re-apply user overrides on top of interpolated values so manual UVI
  // takes precedence over both forecast + interpolation.
  atmAtT = _applyAtmOverrides(atmAtT);

  // Surface-orientation + albedo boost on the effective body fraction.
  // Posture: standing/sitting/lying-supine/lying-prone. Albedo: surfaces
  // (sand 25%, water 25%, snow 80%) reflect UV onto the body — modeled
  // as a +(albedo × 0.5) multiplier (rough — half the reflected light
  // reaches the body geometry from below).
  const baseFraction = sess.bodyExposure?.fraction ?? 0;
  const postureMult = _POSTURE_MULTIPLIERS[sess.posture] ?? 1.0;
  const albedoMult = 1 + (_SURFACE_ALBEDO[sess.surfaceAlbedo] ?? 0) * 0.5;
  const effFraction = baseFraction * postureMult * albedoMult;

  const zenith = solarZenithAngle(when, coords.lat, coords.lon);
  const spectrum = reconstructSpectrum({
    zenithDeg: zenith,
    ozoneDU: atmAtT.ozoneDU ?? 300,
    altitudeM: coords.altitudeM ?? 0,
    cloudCover: (atmAtT.cloudCover ?? 0) / 100,
    aod: atmAtT?.airQuality?.aod ?? null,
  });
  const bodyModifiers = {
    glassBetween: !!sess.bodyExposure?.glassBetween,
    sunscreenSPF: sess.bodyExposure?.sunscreenSPF || 0,
  };
  const rate = computeChannelDoses({
    spectrum,
    durationMin: 1,
    bodyExposureFraction: effFraction,
    eyeExposure: sess.eyeExposure,
    bodyModifiers,
  });
  const sedPerMin = erythemalSED({
    spectrum,
    durationMin: 1,
    bodyExposureFraction: effFraction,
    bodyModifiers,
  });
  // Retinal UV per minute — only nonzero when eye mode is 'direct'.
  // Integrates 280-400 nm spectrum × 1 minute (60 s) for a J/m² rate.
  const retinalUVPerMin = (sess.eyeExposure?.mode === 'direct') ? _retinalUVPerMin(spectrum) : 0;
  return { rate, sedPerMin, retinalUVPerMin };
}

// Posture orientation multipliers on bodyExposureFraction. Lying-supine
// makes the front of the body nearly horizontal at noon → near-full beam
// reception (~1.4× baseline standing). Lying-prone same for back. Sitting
// is between standing and lying. These are rough — proper modeling would
// require per-region cosine weighting based on actual body geometry.
const _POSTURE_MULTIPLIERS = {
  standing:    1.0,
  sitting:     0.85,
  'lying-supine': 1.4,
  'lying-prone':  1.4,
};

// Surface albedo (UV reflectance). 0.25 = sand/water; 0.80 = fresh snow.
// Source: WHO INTERSUN guidance + CIE 174:2006.
const _SURFACE_ALBEDO = {
  grass:    0.03,
  concrete: 0.10,
  sand:     0.25,
  water:    0.25,
  snow:     0.80,
};

// Helper: integrate UV-band irradiance to get J/m² per minute at the eye.
// Mirrors retinalUVdose() math but returns a rate (per-minute) instead of
// total. Used by Simpson integration in _rateAtInstant.
function _retinalUVPerMin(spectrum) {
  if (!spectrum) return 0;
  const dlambda = 5;
  let uv = 0;
  for (let i = 0; i < spectrum.irradiance.length; i++) {
    const nm = spectrum.wavelengths[i];
    if (nm > 400) break;
    uv += spectrum.irradiance[i] * dlambda;
  }
  return uv * 60; // per-minute (60 s)
}

// Simpson's 1/3 rule integration of channel doses + SED + retinal UV
// across [a, b] using 3 sample points (start, midpoint, end). Second-order
// accurate vs the previous midpoint approximation, captures sub-slice
// spectral shifts at low sun (where pure cosine zenith scaling
// underestimates UVB drop). Cost: 3 spectrum + dose computes per call
// (~15K JS ops, negligible).
function _integrateSlice(sess, startMs, endMs) {
  const durationMin = Math.max(0, (endMs - startMs) / 60000);
  if (durationMin <= 0) return { doses: {}, sed: 0, retinalUV: 0 };
  const midMs = (startMs + endMs) / 2;
  const r0 = _rateAtInstant(sess, startMs);
  const r1 = _rateAtInstant(sess, midMs);
  const r2 = _rateAtInstant(sess, endMs);
  if (!r0 || !r1 || !r2) return { doses: {}, sed: 0, retinalUV: 0 };
  // Simpson: ∫ ≈ (b - a) × (f(a) + 4f(m) + f(b)) / 6
  const doses = {};
  for (const k of Object.keys(r1.rate)) {
    const a = r0.rate[k] ?? 0;
    const m = r1.rate[k] ?? 0;
    const b = r2.rate[k] ?? 0;
    doses[k] = durationMin * (a + 4 * m + b) / 6;
  }
  const sed = durationMin * (r0.sedPerMin + 4 * r1.sedPerMin + r2.sedPerMin) / 6;
  const retinalUV = durationMin * (r0.retinalUVPerMin + 4 * r1.retinalUVPerMin + r2.retinalUVPerMin) / 6;
  return { doses, sed, retinalUV };
}

// Commit the current rate slice's contribution into committedDoses. Called
// just before re-snapshotting so the user-visible cumulative dose stays
// correct across rate changes (cloud cover shifts, hour rollover, etc.).
// Uses Simpson integration for sub-slice accuracy.
function _commitCurrentSlice(sess) {
  const live = _getLiveState(sess?.id);
  if (!live || !live.ratePerMin || !live.snapshotAt) return;
  const sliceStart = live.snapshotAt;
  const sliceEnd = Date.now();
  if (sliceEnd <= sliceStart) return;
  const { doses, sed, retinalUV } = _integrateSlice(sess, sliceStart, sliceEnd);
  const committedDoses = { ...(live.committedDoses || {}) };
  for (const [k, v] of Object.entries(doses)) {
    committedDoses[k] = (committedDoses[k] || 0) + v;
  }
  const committedSED = (live.committedSED || 0) + sed;
  const committedRetinalUV = (live.committedRetinalUV || 0) + retinalUV;
  _setLiveState(sess.id, { committedDoses, committedSED, committedRetinalUV });
}

// Compute live doses = committedDoses (sum of past, fully-closed slices) +
// current-slice contribution integrated via Simpson's rule.
//
// Each Simpson sample reconstructs the spectrum at its instant using the
// live solar zenith and INTERPOLATED atmosphere (linearly between the two
// hourly forecast buckets surrounding the sample). This captures both
// solar-angle drift AND sub-hourly atmospheric variation properly per
// channel — vs the previous cosine-scaled-rate which underestimated UVB
// attenuation at low sun (where Air Mass climbs non-linearly).
//
// Cost: 3 spectrum + dose computes per call. _liveDosesFor is invoked
// from several places per tick — if profiling shows hotspots we can add
// per-tick memoization keyed by tickCount.
function _liveDosesFor(sess) {
  const live = _getLiveState(sess?.id);
  if (!live) return null;
  // Paused sessions: surface committed totals only — current slice
  // contributes zero. Skips the Simpson integration entirely.
  if (sess?.paused) {
    const committed = live.committedDoses || {};
    const sed = live.committedSED || 0;
    const retinalUV = live.committedRetinalUV || 0;
    const medFraction = live.fractionOfMEDFn ? live.fractionOfMEDFn({ sed, fitzpatrick: live.fitzpatrick, medScale: live.medScale ?? 1.0 }) : 0;
    return { doses: { ...committed }, sed, retinalUV, medFraction, fitzpatrick: live.fitzpatrick, psmTier: live.psmTier, atm: live.atm, paused: true };
  }
  if (!live.ratePerMin) return null;
  const sliceStart = live.snapshotAt || sess.startedAt;
  const now = Date.now();

  const { doses: sliceDoses, sed: sliceSed, retinalUV: sliceRetinalUV } = _integrateSlice(sess, sliceStart, now);

  const committed = live.committedDoses || {};
  const doses = { ...committed };
  for (const [k, v] of Object.entries(sliceDoses)) {
    doses[k] = (doses[k] || 0) + v;
  }
  const sed = (live.committedSED || 0) + sliceSed;
  const retinalUV = (live.committedRetinalUV || 0) + sliceRetinalUV;
  const medFraction = live.fractionOfMEDFn ? live.fractionOfMEDFn({ sed, fitzpatrick: live.fitzpatrick, medScale: live.medScale ?? 1.0 }) : 0;
  return { doses, sed, retinalUV, medFraction, fitzpatrick: live.fitzpatrick, psmTier: live.psmTier, atm: live.atm };
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
  // Heat-stress chip — temperatureC > 30 + elapsed > 30 min. Visual
  // affordance for the same condition that fires the showNotification
  // alert (so users who dismissed the toast still see the cue).
  let heatStr = '';
  const tempC = live?.atm?.temperatureC ?? null;
  const elapsedMin = (Date.now() - sess.startedAt) / 60000;
  if (Number.isFinite(tempC) && tempC > 30 && elapsedMin > 30) {
    heatStr = `<span class="sun-session-heat" title="Ambient ${tempC.toFixed(0)}°C — heat-stress risk rises with duration. Drink water, take a 10-min shade break.">🌡 ${Math.round(tempC)}°C · take a break</span>`;
  }

  // Retinal-UV chip — only meaningful when eye mode is 'direct'. Shows
  // current cumulative ACTINIC-weighted UV at the eye (matches ICNIRP
  // S(λ) basis). Daily limit 30 J/m²; warn at 15 J/m².
  let retinalStr = '';
  if (sess.eyeExposure?.mode === 'direct' && Number.isFinite(live?.retinalUV) && live.retinalUV > 3) {
    const ruv = live.retinalUV;
    const ruvDisplay = ruv >= 10 ? Math.round(ruv) : ruv.toFixed(1);
    const cls = ruv >= 15 ? ' warn' : '';
    const label = ruv >= 30 ? 'at ICNIRP daily limit' : ruv >= 15 ? 'half the daily limit' : 'building';
    retinalStr = `<span class="sun-session-retinal${cls}" title="Actinic-weighted UV at the eye (≈ICNIRP S(λ)). Daily limit 30 J/m²; photokeratitis appears above ~50 J/m². At ${ruvDisplay} J/m² you're ${label}.">👁 ${ruvDisplay} J/m² eye UV</span>`;
  }

  return { elapsed, medStr, vitaminDStr, channelChips, heatStr, retinalStr };
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
    // Skip rate-related work entirely while paused — the slice is committed
    // and we want zero dose accrual from pausedAt → resume time.
    if (sess.paused) {
      // Paused cards still tick for display state; refresh DOM below but
      // bypass snapshot/refresh + alerts.
    } else {
      // Lazy snapshot of the rate (async — fires once per session, cached
      // in module-scoped _liveState map, never written to the session record)
      if ((!live || !live.ratePerMin) && (!live || !live.pending)) _snapshotActiveRate(sess);
    }

    // Refresh the cached atmosphere snapshot every 5 min so cloud cover
    // and UVI drift get reflected in the live rate. Commit the current
    // slice's accumulated dose first (so the cumulative readout doesn't
    // jump when the new rate replaces the old), then clear ratePerMin to
    // force the next tick to re-snapshot. baselineZenith + committedDoses
    // are preserved across refreshes by _snapshotActiveRate.
    if (live && live.ratePerMin && !live.pending && !sess.paused) {
      const last = live.snapshotAt || 0;
      if (Date.now() - last > 5 * 60 * 1000) {
        _commitCurrentSlice(sess);
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

    // Retinal-UV alerts — only fire when eye mode is 'direct' (eyes
    // uncovered + open toward sky). Sunglass / closed-eyes / behind-glass
    // sessions accumulate zero retinal UV. retinalUV is now actinic-
    // weighted (≈ ICNIRP S(λ)); ICNIRP daily exposure limit is 30 J/m²
    // actinic, photokeratitis appears above ~50 J/m². 15 J/m² used as a
    // half-way warning so the user can still react.
    if (liveDoses && Number.isFinite(liveDoses.retinalUV) && sess.eyeExposure?.mode === 'direct') {
      const ruv = liveDoses.retinalUV;
      const cur = _getLiveState(sess.id) || {};
      if (ruv >= 30 && !cur.alertedRetinalOver) {
        _setLiveState(sess.id, { alertedRetinalOver: true });
        showNotification('Eye UV at the ICNIRP daily exposure limit. Put on UV-blocking sunglasses now — symptoms (gritty eyes, sensitivity to light) appear 6-12 hours after exposure.', 'error', 10000);
      } else if (ruv >= 15 && !cur.alertedRetinal500) {
        _setLiveState(sess.id, { alertedRetinal500: true });
        showNotification('Eyes at half the daily ICNIRP UV limit — sunglasses or look-down breaks recommended. Cumulative eye exposure causes pterygium and cataract over years.', 'warning', 8000);
      }
    }

    // Heat-stress chip alert — fires once at 30 min into a session when
    // temperatureC > 30. Heat exhaustion risk rises faster with duration
    // than UV burn at high ambient; UV alerts alone don't catch this.
    const tempC = liveDoses?.atm?.temperatureC ?? null;
    const elapsedMinNow = (Date.now() - sess.startedAt) / 60000;
    if (Number.isFinite(tempC) && tempC > 30 && elapsedMinNow > 30) {
      const cur = _getLiveState(sess.id) || {};
      if (!cur.alertedHeat) {
        _setLiveState(sess.id, { alertedHeat: true });
        showNotification(`${tempC.toFixed(0)}°C ambient — drink water, take a 10-min shade break. Heat exhaustion ramps faster than UV burn at this temperature.`, 'warning', 8000);
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
      // Heat chip — replace if present, insert in head row if not.
      const heatEl = card.querySelector('.sun-session-heat');
      if (heatEl) heatEl.outerHTML = body.heatStr || '';
      else if (body.heatStr) {
        const after = card.querySelector('.sun-session-vitd') || card.querySelector('.sun-session-med') || card.querySelector('.sun-session-duration');
        if (after) after.insertAdjacentHTML('afterend', body.heatStr);
      }
      // Retinal-UV chip — same pattern.
      const retinalEl = card.querySelector('.sun-session-retinal');
      if (retinalEl) retinalEl.outerHTML = body.retinalStr || '';
      else if (body.retinalStr) {
        const after = card.querySelector('.sun-session-heat') || card.querySelector('.sun-session-vitd') || card.querySelector('.sun-session-med') || card.querySelector('.sun-session-duration');
        if (after) after.insertAdjacentHTML('afterend', body.retinalStr);
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
  // Active-session controls: Pause/Resume + Sunscreen re-applied + Set
  // ozone. Stop propagation so the row's open-detail click handler
  // doesn't fire when these are tapped.
  let activeControls = '';
  if (isActive) {
    const isPaused = !!sess.paused;
    const pauseLabel = isPaused ? '▶ Resume' : '⏸ Pause';
    const pauseAction = isPaused ? `window.resumeSunSession('${escapeAttr(sess.id)}')` : `window.pauseSunSession('${escapeAttr(sess.id)}')`;
    activeControls = `<div class="sun-session-active-controls" onclick="event.stopPropagation()">
      <button class="sun-session-ctl" onclick="event.stopPropagation();${pauseAction}" title="${isPaused ? 'Resume dose accrual' : 'Pause dose accrual (shade break, indoors)'}">${pauseLabel}</button>
      <button class="sun-session-ctl" onclick="event.stopPropagation();window.applySunscreenMidSession('${escapeAttr(sess.id)}')" title="Reapplied sunscreen — commits current slice and starts a new one with the new SPF">🧴 Sunscreen</button>
      <button class="sun-session-ctl" onclick="event.stopPropagation();window.setOzoneOverrideMidSession()" title="Calibrate ozone column from a meter / weather station">🛰 Ozone</button>
    </div>`;
  }
  const pausedBadge = isActive && sess.paused ? `<span class="sun-session-paused" title="Dose accrual paused — elapsed time still ticks but channel + burn totals stay frozen.">⏸ paused</span>` : '';
  const forgotBanner = isActive && (Date.now() - sess.startedAt > 12 * 3600 * 1000)
    ? `<div class="sun-session-forgot" onclick="event.stopPropagation();window._forgotStopPrompt && window._forgotStopPrompt('${escapeAttr(sess.id)}')" role="button" tabindex="0">⚠ This session has been running for ${Math.round((Date.now() - sess.startedAt) / 3600000)}h. Tap to end it.</div>`
    : '';
  // Click anywhere on the card (except the × delete) to open the detail
  // modal. Each delete button stops propagation so it only deletes.
  return `<div class="sun-session" data-id="${escapeAttr(sess.id)}" role="button" tabindex="0" aria-label="Open ${start} session details" onclick="window.openSunSessionDetail && window.openSunSessionDetail('${escapeAttr(sess.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openSunSessionDetail && window.openSunSessionDetail('${escapeAttr(sess.id)}')}" style="cursor:pointer">
    <div class="sun-session-head">
      <span class="light-session-icon" aria-hidden="true">☀</span>
      <span class="sun-session-date">${start}</span>
      <span class="sun-session-duration"${isActive ? ' aria-live="off"' : ''}>${dur}</span>
      ${pausedBadge}
      ${medStr}
      <button class="sun-session-delete" onclick="event.stopPropagation();window.deleteSunSession('${escapeAttr(sess.id)}')" title="Delete session" aria-label="Delete session">×</button>
    </div>
    <div class="sun-session-meta">
      ${escapeHTML(_summarizeBodyExposure(sess))} · ${escapeHTML(eyeLabels[sess.eyeExposure?.mode] || 'Eyes unset')}${sess.bodyExposure?.glassBetween ? ' · through glass' : ''}${sess.bodyExposure?.sunscreenSPF ? ` · SPF ${sess.bodyExposure.sunscreenSPF}` : ''}
    </div>
    ${forgotBanner}
    ${activeControls}
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
      <span class="sun-detail-channel-value"${pctOfTarget != null && !unitText ? ` title="${escapeAttr('% of typical-active-day target — calibrated to roughly 30-60 min of moderate-body-fraction midday exposure (skin channels) or 10-30 min eye-direct outdoor light (eye channels). Over 100% means you got more than typical, NOT more than safe — burn risk is the % MED chip, not this. Targets are dosing references, not exposure ceilings.')}"` : ''}>${unitText || (pctOfTarget != null ? `${pctOfTarget}% of daily target` : '')}</span>
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

  // Body silhouette renders in <g transform="..."> which scales the freesvg
  // path into the picker. We reuse that exact same transformed path in a
  // <clipPath> so any region overlay's hover/selection fill is masked to
  // the body shape — without the clip, accent fills would spill outside
  // the silhouette into transparent space and look like floating boxes.
  // clipPathUnits defaults to userSpaceOnUse, so the same clipPath works
  // for both front + back groups (each applies it in their own local space).
  const clipId = `sun-silhouette-body-clip-${sex}`;

  // Two columns: front 0–100, back 100–200 (translated). Region tap-targets
  // sit on top in the 100×210 picker space (transparent until selected) and
  // are clipped to the silhouette shape so highlights hug the body.
  const svg = `<svg viewBox="0 0 200 215" class="sun-silhouette" data-sex="${sex}" role="group" aria-label="Body region picker — tap or press Enter on each region you want to toggle">
    <defs>
      <clipPath id="${clipId}">
        <path d="${body.d}" transform="${body.transform}" />
      </clipPath>
    </defs>
    <g class="sun-silhouette-view sun-silhouette-front">
      <g transform="${body.transform}"><path d="${body.d}" class="sun-silhouette-outline"/></g>
      ${renderLandmarks(frontLandmarks)}
      <g clip-path="url(#${clipId})">${renderRegion(front, 'front')}</g>
      <text x="50" y="214" text-anchor="middle" class="sun-silhouette-label" aria-hidden="true">Front</text>
    </g>
    <g class="sun-silhouette-view sun-silhouette-back" transform="translate(100 0)">
      <g transform="${body.transform}"><path d="${body.d}" class="sun-silhouette-outline"/></g>
      ${renderLandmarks(backLandmarks)}
      <g clip-path="url(#${clipId})">${renderRegion(back, 'back')}</g>
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

      <div class="sun-detailed-row">
        <label class="ctx-label">Posture
          <select id="det-posture" class="ctx-select">
            ${POSTURE_OPTIONS.map(o => `<option value="${escapeAttr(o.key)}"${o.key === (lastUsed?.posture || 'standing') ? ' selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
          </select>
        </label>
        <label class="ctx-label">Surface
          <select id="det-surface" class="ctx-select">
            ${SURFACE_OPTIONS.map(o => `<option value="${escapeAttr(o.key)}"${o.key === (lastUsed?.surfaceAlbedo || 'grass') ? ' selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
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
    const posture = overlay.querySelector('#det-posture')?.value || 'standing';
    const surfaceAlbedo = overlay.querySelector('#det-surface')?.value || 'grass';
    const sessId = await logCompletedSession({
      startedAt: start,
      endedAt,
      bodyExposure: { preset: regions.length === 0 ? 'face_hands' : 'detailed', fraction: Math.max(0.05, fraction), regions, sunscreenSPF: spf, glassBetween: glass },
      eyeExposure: { mode: eyeModeVal, lensTint: lensTintVal, durationSec: durationMin * 60 },
      posture, surfaceAlbedo,
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
    pauseSession, resumeSession,
    pauseSunSession, resumeSunSession,
    applySunscreenMidSession,
    setOzoneOverrideMidSession,
    _forgotStopPrompt,
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
    cumulativeVitaminDIUToday,
    vitaminDBudgetStatus,
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
