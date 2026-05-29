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
import { escapeHTML, escapeAttr, showNotification, showPromptDialog, showConfirmDialog } from './utils.js';
import { saveImportedData } from './data.js';
import { getProfileLocation } from './profile.js';
import { COUNTRY_LATITUDES, COUNTRY_CENTROIDS } from './constants.js';
import { recordTombstone } from './data-merge.js';
import {
  BODY_REGIONS,
  renderBodySilhouette,
  bindBodySilhouette,
  resetBodySilhouetteState,
  _testLoadRegionMap,
  _testRegionAtSource,
  _testRegionColorRGB,
  _testStockImg,
  _testRegionBandLandmarks,
} from './sun-body-silhouette.js';
import {
  configureSunActiveSession,
  quickLogSunSession,
  openStartSunSessionDialog,
  _wireBackdropClose,
  trapModalFocus,
  _formatElapsed,
  liveDosesFor as _liveDosesFor,
  commitSunLiveSlice as _commitCurrentSlice,
  setSunLiveState as _setLiveState,
  clearSunLiveState as _clearLiveState,
  ensureActiveTicker as _ensureActiveTicker,
  resumeActiveTickerIfNeeded as _resumeActiveTickerIfNeeded,
  hydrateSunSessionFromProfileCoords as _hydrateFromProfileCoords,
  resetSunActiveSessionState,
  POSTURE_MULTIPLIERS,
  SURFACE_ALBEDO,
} from './sun-active-session.js';
import {
  configureSunSessionUI,
  renderSessionsList,
  renderSunSessionRow,
  openDetailedSessionDialog,
  openSunSessionDetail,
  deleteSunSession,
  editSunSessionDuration,
} from './sun-session-ui.js';
export { BODY_REGIONS, renderBodySilhouette, bindBodySilhouette };
export { renderSessionsList, renderSunSessionRow, openDetailedSessionDialog, openSunSessionDetail };
export { quickLogSunSession, openStartSunSessionDialog, _wireBackdropClose, trapModalFocus };
// NOTE: sun-ai-analysis.js is intentionally NOT imported here — it
// imports from this file (getSessions, formatChannelUnit, etc.), and a
// reciprocal import would create a circular dependency that risks TDZ
// errors at module-init time. Other features (rooms, screens, audits,
// burden) already access their AI modules via window.* lookups; sun
// follows the same pattern for consistency + cycle-safety. main.js
// imports both modules in a deterministic order so the window functions
// are available by the time sun.js's exports are first invoked.

// ─── Photosensitive medication tiers ───────────────────────────────────
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

// Standard quick-presets for the speed log. Fractions reflect a SINGLE
// position (front-only OR back-only at any one moment) — capped at the
// anatomical max of ~0.55. Use the in-session "🔄 Flip" button (or the
// `rotatedSides` toggle in the start dialog) to log that you exposed
// both sides over the session; that doubles the effective body dose
// the same way dminder's "100% naked" assumes alternating sides.
//
// Cite: fractions derive from the Wallace rule of nines + Lund-Browder
// (1944) chart, then halved (anterior face only). Face + hands ≈ 4.5%
// face + 2.5% hands = 7% total body, ~5% projected to one side.
// T-shirt + shorts exposes face/hands/forearms/lower legs ≈ 20%.
// Swimwear exposes everything except briefs (~45% one side per Holick
// 2007's "10% body surface = ~2 cm² per kg of pre-vit-D substrate").
// Sunbathing tops out at ~50% one side per the dminder convention.
// AI verdict math for synthesis ("you got 1500 IU because 20% of your
// skin saw 15 min of UVI 7") is rooted in these fractions.
export const EXPOSURE_PRESETS = [
  { key: 'face_hands', label: 'Face + hands',         fraction: 0.05 },
  { key: 'tshirt',     label: 'T-shirt + shorts',     fraction: 0.20 },
  { key: 'swimwear',   label: 'Swimwear',             fraction: 0.45 },
  { key: 'sunbathing', label: 'Sunbathing',           fraction: 0.50 },
];

// `label` is the row-meta display; `pickerLabel` is what the dropdown
// option shows (where the safety nudge belongs). Earlier the row-meta
// rendered "Eyes uncovered (do not look at sun)" verbatim, which read
// as if the user had been told off — the parenthetical was correct in
// the picker (where it informs the choice) but jarring on a static
// summary line. Row meta now shows just "Eyes uncovered ⚠" so the
// safety state is conveyed by the icon, not a redundant warning string.
export const EYE_MODES = [
  { key: 'direct',         label: 'Eyes uncovered',     pickerLabel: 'Eyes uncovered (never stare at sun)', warn: true },
  { key: 'sunglasses',     label: 'Sunglasses',         pickerLabel: 'Sunglasses' },
  { key: 'clear-glasses',  label: 'Clear glasses',      pickerLabel: 'Clear glasses' },
  { key: 'closed-eyes',    label: 'Closed eyes',        pickerLabel: 'Closed eyes' },
  { key: 'glass-window',   label: 'Through window glass', pickerLabel: 'Through window glass' },
  { key: 'indoor',         label: 'Not eye-exposed',    pickerLabel: 'Not eye-exposed' },
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
  // POMC uses the McKinlay-Diffey erythemal action spectrum (CIE S 007 /
  // ISO 17166:1999, UVB-heavy) — accumulates ~4× slower per minute than
  // vit-D. ~30 min noon at face+hands ≈ 60 channel-au. Target 80 = strong
  // daily UVA-UVB exposure.
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

// Tier classifier for 7-day rollups. The dashboard "what your light does"
// pills, the AI 7-day rollup, and the per-channel drill-down all surface a
// 7-day exposure total — same data, but they were all calling channelTier()
// with a daily target, so the same number scored "moderate" against daily
// and "low" against weekly. Use this where the value is a multi-day rollup;
// use channelTier where the value is a single day or a single session.
export function weeklyChannelTier(value, channelKey) {
  const target = (CHANNEL_DISPLAY[channelKey]?.dailyTarget ?? 1000) * 7;
  if (!Number.isFinite(value) || value <= 0) return 0;
  const ratio = value / target;
  if (ratio < 0.20) return 1;
  if (ratio < 0.55) return 2;
  if (ratio < 1.00) return 3;
  return 4;
}

const TIER_LABELS = ['none', 'low', 'moderate', 'good', 'strong'];
const TIER_DOTS = ['○○○○', '●○○○', '●●○○', '●●●○', '●●●●'];

export function tierLabel(tier) { return TIER_LABELS[tier] || 'none'; }

// Saturation flag threshold: when central IU ≥ 19,000 we're within 5%
// of the 20,000 cap baked into vitaminDIU (Holick photoisomerization
// plateau). Surface "saturated" copy at that point rather than the
// uncertainty band — the cap dominates so the band collapses anyway.
//
// Cite: Holick 2008 ("Vitamin D status: measurement, interpretation,
// and clinical application" Ann. Epidemiol. 19:73) — pre-vitamin D₃
// peaks at ~10-15% of total cutaneous 7-DHC then degrades to
// lumisterol/tachysterol on continued UV. MacLaughlin et al. 1982
// (Science 216:1001) puts the peak conversion ~10-25 minutes of
// equatorial summer noon sun at 20% body surface, which is the
// 20,000 IU/session ceiling we cap to. AI verdicts that nudge "you've
// hit your synthesis ceiling — covering up doesn't reduce it now"
// hinge on this threshold.
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
// Sessions shorter than this don't generate channel verdicts. At 60-sec
// (the demo case that triggered the v1.7.21 audit) the per-second peak
// recovered from `channelAu / seconds` is mathematically valid but
// experientially meaningless: a brief glance at a bright lamp on the way
// to a meeting becomes "Body clock ~99.3k M-EDI lux." The session log
// still shows the duration + atmosphere; channels just stay quiet.
const TOO_SHORT_FOR_CHANNEL_VERDICT_MIN = 2;

export function formatChannelUnit(channelKey, channelAu, durationMin, fitzpatrick = 'III', uvi = null, zenith = null, rotatedSides = false, bodyFraction = null) {
  if (!Number.isFinite(channelAu) || channelAu <= 0) return '';
  if (durationMin > 0 && durationMin < TOO_SHORT_FOR_CHANNEL_VERDICT_MIN) {
    return 'session too short';
  }
  if (channelKey === 'vitamin_d') {
    // Single approximate value — uncertainty lives in the tooltip.
    // "~1100 IU" is more readable than "700-1800 IU" for normal users;
    // power users open the row tooltip for the model band + biological
    // variance breakdown. Always numeric (not "minimal" for small values)
    // so the per-channel-dose row doesn't mix conventions across the
    // table — qualitative tier label is already in its own column.
    //
    // Per-session render uses vitaminDIUPerSession when bodyFraction is
    // available — the local skin-patch saturation cap (bodyFrac × 30k)
    // binds before the daily 20k photoisomerization ceiling on high-
    // output device sessions. Fall back to vitaminDIU when bodyFraction
    // is unknown (legacy callers, rollup paths). Audit P1 #8 fix.
    const useSessionCap = Number.isFinite(bodyFraction) && bodyFraction > 0
      && typeof window.vitaminDIUPerSession === 'function';
    const central = useSessionCap
      ? window.vitaminDIUPerSession(channelAu, fitzpatrick, uvi, rotatedSides, state.importedData?.genetics || null, bodyFraction)
      : (window.vitaminDIU
        ? window.vitaminDIU(channelAu, fitzpatrick, uvi, rotatedSides, state.importedData?.genetics || null)
        : channelAu * 60 * (rotatedSides ? 2 : 1));
    if (central === 0) return 'below UVI threshold';
    const fmt = (n) => {
      if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
      if (n >= 1000) return Math.round(n / 100) * 100;
      if (n >= 100) return Math.round(n / 10) * 10;
      return Math.round(n);
    };
    if (central >= VITD_SAT_FLAG) return `~${fmt(central)} IU (saturated)`;
    return `~${fmt(central)} IU`;
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
// effective body fraction (see POSTURE_MULTIPLIERS in sun-active-session.js).
export const POSTURE_OPTIONS = [
  { key: 'standing',     label: 'Standing / walking' },
  { key: 'sitting',      label: 'Sitting / reclined' },
  { key: 'lying-supine', label: 'Lying face-up' },
  { key: 'lying-prone',  label: 'Lying face-down' },
];

// Surface albedo dropdown values — UV reflection from below augments
// total received irradiance by ~(albedo × 0.5). See SURFACE_ALBEDO.
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
export async function startSession({ exposurePreset = 'face_hands', regions, eyeMode = 'direct', lensTint = 'clear', glassBetween = false, location, posture = 'standing', surfaceAlbedo = 'grass', rotatedSides = false } = {}) {
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
  sess.endedAt = Date.now();
  const durationMin = Math.max(0, (sess.endedAt - sess.startedAt) / 60000);
  sess.durationMin = durationMin;
  if (sess.eyeExposure && sess.eyeExposure.durationSec == null) {
    sess.eyeExposure.durationSec = Math.round(durationMin * 60);
  }
  _clearLiveState(id);
  // Freeze every live-elapsed element for this session immediately so the
  // dashboard CTA / cards visibly stop ticking even before _refreshSurfaces
  // re-renders (network-stalled awaits, backgrounded tab, sync-driven stops
  // from another device — all paths converge here).
  if (typeof document !== 'undefined') {
    document.querySelectorAll(`[data-live-elapsed-for="${CSS.escape(id)}"]`).forEach(el => {
      el.removeAttribute('data-live-elapsed-for');
      el.textContent = _formatElapsed(sess.endedAt - sess.startedAt);
    });
  }
  await saveImportedData();
  if (typeof window !== 'undefined' && window.maybeAnalyzeSessionAfterFinish) {
    try { window.maybeAnalyzeSessionAfterFinish(sess); } catch (_) {}
  }
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
    bodyExposure: payload.bodyExposure || { preset: 'face_hands', fraction: 0.05, regions: [], sunscreenSPF: null, glassBetween: false, rotatedSides: false },
    eyeExposure: payload.eyeExposure || { mode: 'indoor', lensTint: 'clear', durationSec: 0 },
    atmosphere: payload.atmosphere || null,
    doses: payload.doses || null,
    safety: payload.safety || null,
    notes: payload.notes || '',
  }, payload);
  if (!session.durationMin) session.durationMin = Math.max(0, (session.endedAt - session.startedAt) / 60000);
  getSessions().push(session);
  await saveImportedData();
  if (typeof window !== 'undefined' && window.maybeAnalyzeSessionAfterFinish) {
    try { window.maybeAnalyzeSessionAfterFinish(session); } catch (_) {}
  }
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

// Mid-session "I just flipped" hook. Sets rotatedSides=true on the
// session record so the vit-D IU readout doubles (matches dminder's
// "100% naked = both sides over the session" convention). Idempotent —
// tapping again on an already-rotated session is a no-op so users
// don't accidentally over-multiply.
export async function flipSidesMidSession(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt) return;
  if (!sess.bodyExposure) sess.bodyExposure = {};
  if (sess.bodyExposure.rotatedSides) {
    showNotification('Already logged as rotated — IU readout already accounts for both sides.', 'success', 3500);
    return;
  }
  sess.bodyExposure.rotatedSides = true;
  await saveImportedData();
  showNotification('Logged as rotated — vit-D IU now reflects both sides exposed over the session.', 'success', 3500);
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

// Mid-session "I just dressed / undressed" hook. Commits the slice
// computed under the OLD body regions (so the dose accrued so far at
// the previous coverage is preserved), opens a body-region picker
// pre-checked to what's currently selected, then on confirm updates
// the session record. The next tick re-snapshots the rate using the
// new bodyExposure.fraction. Mirrors applySunscreenMidSession's
// commit-then-mutate pattern.
//
// Use case: started shirtless, decided to put a t-shirt back on after
// 20 min — without this, the saved IU pretends the user kept the
// original coverage for the whole session. Same for device sessions
// where you start aimed at the torso and end aimed at the legs.
export async function changeCoverageMidSession(id) {
  const sess = getSessions().find(s => s.id === id);
  if (!sess || sess.endedAt) return;

  const currentRegions = new Set(sess.bodyExposure?.regions || []);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal sun-start-modal" role="dialog" aria-label="Change coverage">
    <div class="modal-header">
      <h3>Update coverage mid-session</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Tap each body region that's uncovered <strong>now</strong>. The dose accrued under the previous coverage stays — the change applies from this moment forward.</p>
      <div class="sun-silhouette-wrap" id="sun-coverage-silhouette-slot">${renderBodySilhouette(currentRegions)}</div>
      <div class="sun-silhouette-hint" id="sun-coverage-hint"></div>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-primary" id="coverage-confirm">Apply coverage</button>
      </div>
    </div>
  </div>`;
  _wireBackdropClose(overlay);
  document.body.appendChild(overlay);
  trapModalFocus(overlay);

  const selected = new Set(currentRegions);
  const slot = overlay.querySelector('#sun-coverage-silhouette-slot');
  const hint = overlay.querySelector('#sun-coverage-hint');
  const updateHint = () => {
    const fraction = Array.from(selected).reduce((sum, key) => {
      const r = BODY_REGIONS.find(b => b.key === key);
      return sum + (r?.fraction || 0);
    }, 0);
    if (selected.size === 0) {
      hint.textContent = 'No regions exposed — fully clothed for the rest of the session.';
    } else {
      const labels = Array.from(selected).map(k => BODY_REGIONS.find(b => b.key === k)?.label || k).join(', ');
      // Body-fraction sums to 0.95 across all 16 regions (scalp + anatomical
      // seams aren't individually selectable). "Full body" reads cleaner
      // than "95% of skin" once the user is at-or-near the picker ceiling.
      const pctLabel = fraction >= 0.94 ? 'full body' : `${(fraction * 100).toFixed(0)}% of skin`;
      hint.textContent = `${selected.size} region${selected.size === 1 ? '' : 's'} exposed (${pctLabel}) — ${labels}`;
    }
  };
  bindBodySilhouette(slot, selected, updateHint);
  updateHint();

  overlay.querySelector('#coverage-confirm').addEventListener('click', async () => {
    const regions = Array.from(selected);
    // Recompute fraction sum for the new selection. Floor at 0 — fully
    // clothed is a valid intermediate state (e.g. user puts on a coat
    // and walks to the next outdoor patch). Future ticks accrue zero
    // until the next coverage change re-exposes skin.
    const fraction = regions.reduce((sum, key) => {
      const r = BODY_REGIONS.find(b => b.key === key);
      return sum + (r?.fraction || 0);
    }, 0);

    // Commit the slice computed under the OLD regions so the historical
    // dose stays accurate. Same plumbing applySunscreenMidSession uses.
    _commitCurrentSlice(sess);
    if (!sess.bodyExposure) sess.bodyExposure = {};
    sess.bodyExposure.regions = regions;
    sess.bodyExposure.fraction = fraction;
    sess.bodyExposure.preset = regions.length === 0 ? 'face_hands' : 'detailed';
    // Force a fresh rate snapshot on the next tick so the new fraction
    // takes effect immediately rather than carrying stale rate forward.
    _setLiveState(id, { ratePerMin: null });
    await saveImportedData();
    overlay.remove();
    showNotification(
      regions.length === 0
        ? 'Coverage updated: fully clothed — dose accrual paused until you uncover skin again.'
        : `Coverage updated: ${(fraction * 100).toFixed(0)}% body — next tick re-samples at the new fraction.`,
      'success', 3500
    );
    _refreshSurfaces();
  });
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
  if (await showConfirmDialog(
    `End this session that's been running ${hours} hours? Best-guess end time: now. The recorded duration will still reflect this — please trim it from the session detail if you ended earlier.`
  )) {
    await stopSession(sess.id);
    await _hydrateFromProfileCoords(sess.id);
    _refreshSurfaces();
    showNotification('Session ended. Open the session detail to adjust the duration if needed.', 'success', 4500);
  }
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
//      wider window.
export const SUN_ENGINE_VERSION = 7;

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
      retinalUV: retinalUVdose({ spectrum, eyeExposure: sess.eyeExposure, zenithDeg: zenith }),
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
  // hydrateSession itself dedups by id, so two batches in parallel
  // don't double-fetch the same session.
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
  // Three caps layer in sequence (added 2026-05-08):
  //   1. Per-session: body_fraction × 30k (local skin-patch saturation)
  //   2. Per-day: 20k (Holick 2007 photoisomerization plateau)
  //   3. Sum capped days across the window
  // Pre-2026-05-08, only daily-cap was applied — a 1-min Maxi UVB
  // session at 37% body produced 250k raw → 20k clamped. With
  // per-session cap, that session is bounded at 11k (=0.37 × 30k),
  // so two such sessions on different days roll up to 22k correctly.
  const perSession = (typeof window !== 'undefined' && typeof window.vitaminDIUPerSession === 'function') ? window.vitaminDIUPerSession : null;
  if (!perSession) return 0;
  const dailyCap = (typeof window !== 'undefined' && Number.isFinite(window.VITD_DAILY_SATURATION_IU)) ? window.VITD_DAILY_SATURATION_IU : 20000;
  const cutoff = Date.now() - days * 86400 * 1000;
  const genetics = state.importedData?.genetics || null;
  const _localDayKey = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const dayTotals = {};
  const _add = (key, iu) => { dayTotals[key] = (dayTotals[key] || 0) + iu; };
  for (const sess of getSessions()) {
    if (!sess.endedAt) {
      if ((sess.startedAt || 0) < cutoff) continue;
      const live = _liveDosesFor(sess);
      if (live?.doses?.vitamin_d) {
        const fitz = live.fitzpatrick || sess.safety?.fitzpatrick || 'III';
        const uvi = live.atm?.uvIndex ?? sess.atmosphere?.uvIndex ?? null;
        const bodyFrac = sess.bodyExposure?.fraction;
        _add(_localDayKey(sess.startedAt), perSession(live.doses.vitamin_d, fitz, uvi, !!sess.bodyExposure?.rotatedSides, genetics, bodyFrac));
      }
      continue;
    }
    if (!sess.doses?.vitamin_d) continue;
    if (sess.endedAt < cutoff) continue;
    const fitz = sess.safety?.fitzpatrick || 'III';
    const uvi = sess.atmosphere?.uvIndex ?? null;
    const bodyFrac = sess.bodyExposure?.fraction;
    _add(_localDayKey(sess.endedAt), perSession(sess.doses.vitamin_d, fitz, uvi, !!sess.bodyExposure?.rotatedSides, genetics, bodyFrac));
  }
  // UVB device sessions. Devices pass uvi=null because the device IS
  // the UVB source (no atmospheric gate). Body fraction comes from
  // bodyAreas (precise) or legacy bodyArea broad-zone.
  const fitzForDevice = state.importedData?.sunDefaults?.fitzpatrick || 'III';
  const fracByKey = (typeof window !== 'undefined' && window.BODY_REGIONS)
    ? Object.fromEntries(window.BODY_REGIONS.map(r => [r.key, r.fraction]))
    : {};
  const _broadFracs = { face: 0.04, arms: 0.10, torso: 0.13, legs: 0.30, 'whole-body': 0.92, targeted: 0.05 };
  for (const sess of (state.importedData?.deviceSessions || [])) {
    if (!sess.endedAt || sess.endedAt < cutoff) continue;
    if (!sess.doses?.vitamin_d) continue;
    let bodyFrac = null;
    if (Array.isArray(sess.bodyAreas) && sess.bodyAreas.length > 0) {
      bodyFrac = sess.bodyAreas.reduce((acc, k) => acc + (fracByKey[k] || 0), 0);
    } else if (sess.bodyArea) {
      bodyFrac = _broadFracs[sess.bodyArea] ?? null;
    }
    _add(_localDayKey(sess.endedAt), perSession(sess.doses.vitamin_d, fitzForDevice, null, false, genetics, bodyFrac));
  }
  let total = 0;
  for (const iu of Object.values(dayTotals)) total += Math.min(iu, dailyCap);
  return total;
}

// Per-day vit-D IU breakdown for the same N-day window. Mirrors
// rollingVitaminDIU exactly — per-session through vitaminDIUPerSession
// with the real Fitzpatrick / UVI / rotation / genetics / bodyFraction,
// summed per local day, then daily-cap applied. Returns [{date, key,
// sun, device}] aligned to the chart's "today on the right" layout.
//
// Existence rationale: the weekly-chart in views.js previously called
// vitaminDIU(channelAu, 'III', 7) per day — a hardcoded-Fitz-III,
// hardcoded-uvi-7, no-rotation, no-genetics, no-body-cap approximation
// that disagreed with the per-session row by 20-50% on real sessions.
// Charts now read IU from here and stay consistent with what the row
// shows.
export function dailyVitaminDIUBreakdown(days = 7) {
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
  const perSession = (typeof window !== 'undefined' && typeof window.vitaminDIUPerSession === 'function') ? window.vitaminDIUPerSession : null;
  if (!perSession) return buckets;
  const dailyCap = (typeof window !== 'undefined' && Number.isFinite(window.VITD_DAILY_SATURATION_IU)) ? window.VITD_DAILY_SATURATION_IU : 20000;
  const genetics = state.importedData?.genetics || null;
  for (const sess of getSessions()) {
    const ts = sess.endedAt || sess.startedAt;
    if (!ts) continue;
    const i = idxFor(ts);
    if (i < 0) continue;
    let au, fitz, uvi, rotated;
    if (!sess.endedAt) {
      const live = _liveDosesFor(sess);
      au = live?.doses?.vitamin_d;
      fitz = live?.fitzpatrick || sess.safety?.fitzpatrick || 'III';
      uvi = live?.atm?.uvIndex ?? sess.atmosphere?.uvIndex ?? null;
      rotated = !!sess.bodyExposure?.rotatedSides;
    } else {
      au = sess.doses?.vitamin_d;
      fitz = sess.safety?.fitzpatrick || 'III';
      uvi = sess.atmosphere?.uvIndex ?? null;
      rotated = !!sess.bodyExposure?.rotatedSides;
    }
    if (!Number.isFinite(au) || au <= 0) continue;
    const bodyFrac = sess.bodyExposure?.fraction;
    buckets[i].sun += perSession(au, fitz, uvi, rotated, genetics, bodyFrac);
  }
  const fitzForDevice = state.importedData?.sunDefaults?.fitzpatrick || 'III';
  const fracByKey = (typeof window !== 'undefined' && window.BODY_REGIONS)
    ? Object.fromEntries(window.BODY_REGIONS.map(r => [r.key, r.fraction]))
    : {};
  const _broadFracs = { face: 0.04, arms: 0.10, torso: 0.13, legs: 0.30, 'whole-body': 0.92, targeted: 0.05 };
  for (const sess of (state.importedData?.deviceSessions || [])) {
    if (!sess.endedAt) continue;
    const i = idxFor(sess.endedAt);
    if (i < 0) continue;
    const au = sess.doses?.vitamin_d;
    if (!Number.isFinite(au) || au <= 0) continue;
    let bodyFrac = null;
    if (Array.isArray(sess.bodyAreas) && sess.bodyAreas.length > 0) {
      bodyFrac = sess.bodyAreas.reduce((acc, k) => acc + (fracByKey[k] || 0), 0);
    } else if (sess.bodyArea) {
      bodyFrac = _broadFracs[sess.bodyArea] ?? null;
    }
    buckets[i].device += perSession(au, fitzForDevice, null, false, genetics, bodyFrac);
  }
  // Daily cap applied to combined sun+device per day.
  for (const b of buckets) {
    const total = b.sun + b.device;
    if (total > dailyCap) {
      const scale = dailyCap / total;
      b.sun *= scale;
      b.device *= scale;
    }
  }
  return buckets;
}

// Cumulative vitamin D IU synthesized from sun TODAY (local-day window).
// Mirrors rollingVitaminDIU logic but bounds by local midnight instead of
// a rolling-N-day cutoff. Used by the vit-D budget cross-check.
export function cumulativeVitaminDIUToday() {
  // Today = one local day. Each session contributes its per-session-
  // capped IU (Holick 2008 MED-saturation per skin patch); the daily
  // cap (Holick 2007 photoisomerization plateau) clamps the sum.
  const perSession = (typeof window !== 'undefined' && typeof window.vitaminDIUPerSession === 'function') ? window.vitaminDIUPerSession : null;
  if (!perSession) return 0;
  const cap = (typeof window !== 'undefined' && Number.isFinite(window.VITD_DAILY_SATURATION_IU)) ? window.VITD_DAILY_SATURATION_IU : 20000;
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const genetics = state.importedData?.genetics || null;
  let total = 0;
  for (const sess of getSessions()) {
    if (!sess.endedAt) {
      if ((sess.startedAt || 0) < dayStart) continue;
      const live = _liveDosesFor(sess);
      if (live?.doses?.vitamin_d) {
        const fitz = live.fitzpatrick || sess.safety?.fitzpatrick || 'III';
        const uvi = live.atm?.uvIndex ?? sess.atmosphere?.uvIndex ?? null;
        const bodyFrac = sess.bodyExposure?.fraction;
        total += perSession(live.doses.vitamin_d, fitz, uvi, !!sess.bodyExposure?.rotatedSides, genetics, bodyFrac);
      }
      continue;
    }
    if (!sess.doses?.vitamin_d) continue;
    if (sess.endedAt < dayStart) continue;
    const fitz = sess.safety?.fitzpatrick || 'III';
    const uvi = sess.atmosphere?.uvIndex ?? null;
    const bodyFrac = sess.bodyExposure?.fraction;
    total += perSession(sess.doses.vitamin_d, fitz, uvi, !!sess.bodyExposure?.rotatedSides, genetics, bodyFrac);
  }
  const fitzForDevice = state.importedData?.sunDefaults?.fitzpatrick || 'III';
  const fracByKey = (typeof window !== 'undefined' && window.BODY_REGIONS)
    ? Object.fromEntries(window.BODY_REGIONS.map(r => [r.key, r.fraction]))
    : {};
  const _broadFracs = { face: 0.04, arms: 0.10, torso: 0.13, legs: 0.30, 'whole-body': 0.92, targeted: 0.05 };
  for (const sess of (state.importedData?.deviceSessions || [])) {
    if (!sess.endedAt || sess.endedAt < dayStart) continue;
    if (!sess.doses?.vitamin_d) continue;
    let bodyFrac = null;
    if (Array.isArray(sess.bodyAreas) && sess.bodyAreas.length > 0) {
      bodyFrac = sess.bodyAreas.reduce((acc, k) => acc + (fracByKey[k] || 0), 0);
    } else if (sess.bodyArea) {
      bodyFrac = _broadFracs[sess.bodyArea] ?? null;
    }
    total += perSession(sess.doses.vitamin_d, fitzForDevice, null, false, genetics, bodyFrac);
  }
  return Math.min(total, cap);
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

// Re-render dashboard sidebar + current view after a session change so the
// Light Today strip + sidebar entry appear / update without a manual reload.
//
// Scroll preservation lives in views.js navigate() now (element-anchor
// pattern — captures the focused element's stable parent + restores its
// viewport-top after rebuild). Earlier draft did pixel-based scroll
// preservation here too, but pixel-based broke when content above the
// viewport changed height during rebuild — superseded by the navigate()
// path which handles all callers uniformly.
// Debounce window for _refreshSurfaces — the AI verdict engine fires
// _refresh 3-5 times during a single measurement save (retrying.add,
// inflight.add, inflight.delete, retrying.delete, plus saveMeasurement's
// own setTimeout-navigate). Each rebuild destroys charts and re-renders
// the entire view, and the destroy/recreate cycle shifts content above
// the user's anchor (charts paint async, then are torn down again on
// the next rebuild). That thrashing produced visible scroll jumps even
// with the anchor-restore loop active. Coalescing multiple refresh
// requests into a single rebuild eliminates the thrash.
//
// Trailing edge: we want the FINAL state (after the verdict lands) to
// render, not the in-flight "analyzing" intermediate. The first refresh
// in a burst schedules a navigate ~150ms out; subsequent refreshes
// within that window reset the timer (keeping the latest scrollAnchor).
// The user sees a slightly delayed "Analyzing..." indicator (acceptable
// trade for no jump) and the final result with no thrash.
let _refreshSurfacesTimer = null;
let _refreshSurfacesPendingAnchor = null;
function _refreshSurfaces(scrollAnchor) {
  // Always keep the most recent anchor — if any caller in the burst
  // requested a specific anchor, use it.
  if (scrollAnchor) _refreshSurfacesPendingAnchor = scrollAnchor;
  if (_refreshSurfacesTimer) clearTimeout(_refreshSurfacesTimer);
  _refreshSurfacesTimer = setTimeout(() => {
    _refreshSurfacesTimer = null;
    const anchor = _refreshSurfacesPendingAnchor;
    _refreshSurfacesPendingAnchor = null;
    if (window.buildSidebar) try { window.buildSidebar(); } catch (e) {}
    // Boot-time guard: state.currentView is undefined until the first
    // navigate() runs. If a sync pull or AI verdict tick fires during
    // that window, fall back to the DOM's active nav-item rather than
    // defaulting to 'dashboard' (which would yank a user mid-init off
    // whatever page they're on per the URL fragment / launcher target).
    const view = state.currentView
      || document.querySelector('.nav-item.active')?.dataset?.category
      || 'dashboard';
    const navOpts = anchor ? { scrollAnchor: anchor } : undefined;
    if (window.navigate) try { window.navigate(view, navOpts); } catch (e) {}
    setTimeout(() => _resumeActiveTickerIfNeeded(), 100);
  }, 150);
}

// Country band → centroid lat (0=tropical, 4=subarctic). Used as the lat
// fallback when a country lacks an explicit COUNTRY_CENTROIDS entry.
//
// Bands follow the Holick UV-availability scheme (Holick 2007 NEJM,
// "Vitamin D Deficiency"): tropical 0-23.5°, subtropical 23.5-35°,
// temperate 35-50°, cold-temperate 50-60°, subarctic 60°+. Centroid
// values picked at band-midpoint, capped at 65° because cutaneous
// vit-D synthesis below 5° solar elevation is negligible (Webb 2018).
// Drives the lat-only fallback for synthesis math when a country lacks
// a precise centroid; the AI verdict for "should I be supplementing in
// winter?" depends on this lat resolving correctly.
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

configureSunActiveSession({
  getSessions,
  getActiveSession,
  startSession,
  stopSession,
  hydrateSession,
  getSunCoords,
  saveImportedData,
  applyAtmOverrides: _applyAtmOverrides,
  refreshSurfaces: _refreshSurfaces,
  normalizePSMTier: _normalizePSMTier,
  photosensitiveMedScale,
  eyeModes: EYE_MODES,
  lensTints: LENS_TINTS,
  postureOptions: POSTURE_OPTIONS,
  surfaceOptions: SURFACE_OPTIONS,
});

configureSunSessionUI({
  getSessions,
  deleteSession,
  updateSession,
  logCompletedSession,
  hydrateSession,
  getSunCoords,
  refreshSurfaces: _refreshSurfaces,
  wireBackdropClose: _wireBackdropClose,
  trapModalFocus,
  summarizeBodyExposure: _summarizeBodyExposure,
  formatElapsed: _formatElapsed,
  exposurePresets: EXPOSURE_PRESETS,
  eyeModes: EYE_MODES,
  lensTints: LENS_TINTS,
  postureOptions: POSTURE_OPTIONS,
  surfaceOptions: SURFACE_OPTIONS,
  channelDisplay: CHANNEL_DISPLAY,
  channelTier,
  tierLabel,
  formatChannelUnit,
  tooShortForChannelVerdictMin: TOO_SHORT_FOR_CHANNEL_VERDICT_MIN,
});

// Reset all sun.js module-singleton state. Called on profile switch so
// caches/timers from profile A don't bleed into profile B (e.g. region-
// map decoded canvas data is profile-agnostic but the overlay cache key
// is built from the previous profile's selection set; the active-card
// ticker keeps running with the prior profile's session list).
function _resetSunModuleState() {
  resetSunActiveSessionState();
  resetBodySilhouetteState();
  _hydrateInFlight.clear();
}

if (typeof window !== 'undefined') {
  window.SUN_ENGINE_VERSION = SUN_ENGINE_VERSION;
  // Exposed so sun-ai-analysis.js can request a re-render after an async
  // analyzeSunSessionAI() completes — keeps that module from importing
  // sun.js's internal _refreshSurfaces directly (would be a back-edge).
  window._refreshSunSurfaces = _refreshSurfaces;
  window.addEventListener('labcharts-profile-switched', _resetSunModuleState);
  Object.assign(window, {
    quickLogSunSession,
    startSession,
    stopSession,
    pauseSession, resumeSession,
    pauseSunSession, resumeSunSession,
    applySunscreenMidSession,
    changeCoverageMidSession,
    flipSidesMidSession,
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
    dailyVitaminDIUBreakdown,
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
    // Test-only: region-map internals exposed for assertion in
    // tests/test-silhouette-region-map.js. Not for app code — the
    // public API for click→region resolution is the silhouette
    // picker's click handler in bindBodySilhouette.
    _testLoadRegionMap,
    _testRegionAtSource,
    _testRegionColorRGB,
    _testStockImg,
    _testRegionBandLandmarks,
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
    weeklyChannelTier,
    tierLabel,
    formatChannelUnit,
    tierDots,
  });
}
