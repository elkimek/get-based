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
import { buildBody, buildLandmarks, buildDetails, SILHOUETTE_NATIVE } from './silhouette-paths.js';
// NOTE: sun-ai-analysis.js is intentionally NOT imported here — it
// imports from this file (getSessions, formatChannelUnit, etc.), and a
// reciprocal import would create a circular dependency that risks TDZ
// errors at module-init time. Other features (rooms, screens, audits,
// burden) already access their AI modules via window.* lookups; sun
// follows the same pattern for consistency + cycle-safety. main.js
// imports both modules in a deterministic order so the window functions
// are available by the time sun.js's exports are first invoked.

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
// Fractions sum to ~0.95 — the missing ~0.05 is scalp + anatomical seams
// (clavicle / shoulder transitions) that the picker doesn't expose as
// individually selectable regions.
export const BODY_REGIONS = [
  // `face` / `thyroid-throat` are kept as front-side keys (no `-front`
  // suffix) for backward-compat with sessions saved before the back-side
  // split. New back-side keys are explicit `*-back`.
  { key: 'face',                label: 'Face',                  fraction: 0.04 },
  { key: 'face-back',           label: 'Back of head',          fraction: 0.02 },
  { key: 'thyroid-throat',      label: 'Thyroid / throat',      fraction: 0.01 },
  { key: 'thyroid-throat-back', label: 'Nape',                  fraction: 0.01 },
  { key: 'breast-chest',        label: 'Upper chest',           fraction: 0.06 },
  { key: 'arms-front',          label: 'Arms (front)',          fraction: 0.05 },
  { key: 'arms-back',           label: 'Arms (back)',           fraction: 0.05 },
  { key: 'torso-front',         label: 'Torso (front)',         fraction: 0.13 },
  { key: 'torso-back',          label: 'Torso (back)',          fraction: 0.13 },
  { key: 'abdomen',             label: 'Abdomen',               fraction: 0.07 },
  { key: 'genitals',            label: 'Genitals',              fraction: 0.01 },
  { key: 'glutes',              label: 'Glutes',                fraction: 0.05 },
  { key: 'legs-front',          label: 'Legs (front)',          fraction: 0.15 },
  { key: 'legs-back',           label: 'Legs (back)',           fraction: 0.15 },
  { key: 'feet-front',          label: 'Feet (front)',          fraction: 0.01 },
  { key: 'feet-back',           label: 'Feet (back)',           fraction: 0.01 },
];

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
  { key: 'direct',         label: 'Eyes uncovered',     pickerLabel: 'Eyes uncovered — never look directly at the sun', warn: true },
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
      <div class="sun-silhouette-hint-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div class="sun-silhouette-hint" id="sun-start-hint">Tap any body region to toggle whether it's uncovered.</div>
        <button type="button" class="ctx-btn-option" id="sun-start-clear" style="padding:2px 10px;font-size:11px">Clear</button>
      </div>

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
              ${EYE_MODES.map(e => `<option value="${escapeAttr(e.key)}"${e.key === defaultEye ? ' selected' : ''}>${escapeHTML(e.pickerLabel || e.label)}</option>`).join('')}
            </select>
          </label>
          <label class="ctx-label">Lens tint
            <select id="start-lens-tint" class="ctx-select">
              ${LENS_TINTS.map(l => `<option value="${escapeAttr(l.key)}"${l.key === defaultLens ? ' selected' : ''}>${escapeHTML(l.label)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="ctx-label sun-detailed-glass" style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span style="flex:1;min-width:0">Behind glass (window / car / sunroom)</span>
          <label class="toggle-switch">
            <input type="checkbox" id="start-glass"${defaultGlass ? ' checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <p class="sun-detailed-glass-hint">Standard window glass blocks ~99% of UVB. Vitamin D synthesis stops; circadian and warmth signals still get through. We zero the burn dose accordingly. (Want to measure YOUR glass's transmission? Light tools → Window check.)</p>
        <div class="ctx-label sun-detailed-glass" style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span style="flex:1;min-width:0">Plan to flip front ↔ back during the session</span>
          <label class="toggle-switch">
            <input type="checkbox" id="start-rotated" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <p class="sun-detailed-glass-hint">Toggle on if you'll alternate sides — doubles the vitamin D estimate to reflect that fresh skin keeps synthesizing after the first side approaches saturation. You can also tap 🔄 Flip mid-session.</p>
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
      // See note in the speed-log handler above re: 0.95 ceiling.
      const pctLabel = fraction >= 0.94 ? 'full body' : `${(fraction * 100).toFixed(0)}% of skin`;
      hint.textContent = `${selected.size} region${selected.size === 1 ? '' : 's'} exposed (${pctLabel}) — ${labels}`;
    }
  };
  // Clear — single bulk-deselect affordance. The silhouette itself is
  // the picker; pre-2026-05-08 also had a 4-zone toggle row but it was
  // a redundant abstraction. See light-devices.js openDeviceSessionDialog
  // for the matching change on the PBM side.
  overlay.querySelector('#sun-start-clear')?.addEventListener('click', () => {
    selected.clear();
    slot.innerHTML = renderBodySilhouette(selected);
    updateHint();
  });
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
  }).catch(() => {});

  overlay.querySelector('#start-confirm').addEventListener('click', async () => {
    const eyeMode = overlay.querySelector('#start-eye-mode').value || 'direct';
    const lensTint = overlay.querySelector('#start-lens-tint').value || 'clear';
    const glassBetween = overlay.querySelector('#start-glass').checked;
    const posture = overlay.querySelector('#start-posture').value || 'standing';
    const surfaceAlbedo = overlay.querySelector('#start-surface').value || 'grass';
    const rotatedSides = !!overlay.querySelector('#start-rotated')?.checked;
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
    const id = await startSession({ regions, eyeMode, lensTint, glassBetween, posture, surfaceAlbedo, rotatedSides, location: coords });
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
// Owns three concerns for any overlay-style modal:
//   1. Auto-focus the first focusable element after first paint.
//   2. Restore focus on teardown (any path — `.remove()`, parent rebuild,
//      Escape close, backdrop click).
//   3. Lock body scroll while the overlay is mounted so the page behind
//      doesn't scroll under the modal on touch / wheel input.
//   4. Bind Escape-to-close so keyboard users can dismiss without mousing.
//
// Stacks correctly with nested overlays via a refcount on the body lock —
// only the outermost teardown restores `body.style.overflow`.
let _modalScrollLockCount = 0;
let _modalPriorOverflow = '';
export function trapModalFocus(overlay) {
  const previouslyFocused = document.activeElement;
  // Body scroll lock — refcount so nested modals don't unlock the outer.
  if (_modalScrollLockCount === 0) {
    _modalPriorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  _modalScrollLockCount++;
  let teardown = false;
  // Defer until after the browser paints — innerHTML may be set right
  // after appendChild, and querySelector before paint can race.
  setTimeout(() => {
    const focusables = overlay.querySelectorAll(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length > 0) try { focusables[0].focus(); } catch (e) {}
  }, 30);
  // Escape-to-close. Bound to document so it works regardless of where
  // focus actually landed (e.g. focus traps that escaped the overlay).
  const onKeydown = (e) => {
    if (e.key === 'Escape' && document.body.contains(overlay)) {
      e.preventDefault();
      // Prefer overlay's own .remove() so any close() callback the modal
      // wired (state cleanup, save-prompt, etc.) gets a chance to run via
      // the MutationObserver below, rather than us bypassing it.
      try { overlay.remove(); } catch (_) {}
    }
  };
  document.addEventListener('keydown', onKeydown);
  // Restore focus + release scroll-lock on overlay removal. MutationObserver
  // catches every teardown path — .remove(), parent rebuild, Escape close.
  const restore = () => {
    if (teardown) return;
    teardown = true;
    document.removeEventListener('keydown', onKeydown);
    _modalScrollLockCount = Math.max(0, _modalScrollLockCount - 1);
    if (_modalScrollLockCount === 0) {
      document.body.style.overflow = _modalPriorOverflow;
    }
    if (previouslyFocused && typeof previouslyFocused.focus === 'function'
        && document.contains(previouslyFocused)) {
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
    // Per-session cap (bodyFrac × 30k) when bodyFraction is known —
    // avoids over-stating high-output device sessions whose raw IU
    // would clamp at the 20k daily ceiling instead of the local
    // skin-patch saturation (Audit P1 #8).
    const bf = sess.bodyExposure?.fraction;
    const iu = (Number.isFinite(bf) && bf > 0 && typeof window.vitaminDIUPerSession === 'function')
      ? window.vitaminDIUPerSession(vitDAu, fitz, uvi, !!sess.bodyExposure?.rotatedSides, state.importedData?.genetics || null, bf)
      : window.vitaminDIU(vitDAu, fitz, uvi, !!sess.bodyExposure?.rotatedSides);
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
//
// Scroll preservation lives in views.js navigate() now (element-anchor
// pattern — captures the focused element's stable parent + restores its
// viewport-top after rebuild). Earlier draft did pixel-based scroll
// preservation here too, but pixel-based broke when content above the
// viewport changed height during rebuild — superseded by the navigate()
// path which handles all callers uniformly.
function _refreshSurfaces() {
  if (window.buildSidebar) try { window.buildSidebar(); } catch (e) {}
  const view = state.currentView || 'dashboard';
  if (window.navigate) try { window.navigate(view); } catch (e) {}
  // After re-render the active-session card is a fresh DOM node — make sure
  // the ticker is alive so it patches the new card on the next interval.
  setTimeout(() => _resumeActiveTickerIfNeeded(), 100);
}

// First-fire jargon explainer for in-session toasts. Returns a one-line
// definition the first time the user sees a piece of acronym-heavy copy
// ("MED", "ICNIRP"), then '' on every subsequent fire so the running
// session toasts stay terse. Persists per-key in localStorage so the
// explanation isn't repeated across reloads. The dictionary is small and
// scoped to the toasts that actually use jargon — we don't preface every
// notification.
const _JARGON_DEFINITIONS = {
  med: 'MED = the smallest UV dose that turns your skin slightly pink (Fitzpatrick-tuned). ',
  icnirp: 'ICNIRP = the body that publishes safe daily UV exposure limits for the eye. ',
};
function _jargonPrefix(key) {
  if (typeof localStorage === 'undefined') return '';
  const def = _JARGON_DEFINITIONS[key];
  if (!def) return '';
  const flag = `gb_jargon_seen_${key}`;
  try {
    if (localStorage.getItem(flag)) return '';
    localStorage.setItem(flag, '1');
  } catch (e) { return ''; }
  return def;
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
  // Retinal UV per minute — only nonzero when eye mode is 'direct' AND
  // the sun is above the ~5° elevation threshold (zenith ≤ 85°). Same
  // gate retinalUVdose() applies to hydrated sessions; without it the
  // live ticker accrues phantom J/m² before "UV-A on" (Bird-Riordan
  // emits non-zero weighted UV at high zenith that doesn't physically
  // reach the eye). Linear ramp 85° → 80° matches the firstUVA window.
  let retinalUVPerMin = 0;
  if (sess.eyeExposure?.mode === 'direct') {
    const elev = 90 - zenith;
    let gate = 1.0;
    if (elev <= 5) gate = 0;
    else if (elev < 10) gate = (elev - 5) / 5;
    retinalUVPerMin = _retinalUVPerMin(spectrum) * gate;
  }
  return { rate, sedPerMin, retinalUVPerMin };
}

// Posture orientation multipliers on bodyExposureFraction. Lying-supine
// makes the front of the body nearly horizontal at noon → near-full beam
// reception (~1.4× baseline standing). Lying-prone same for back. Sitting
// is between standing and lying. These are rough — proper modeling would
// require per-region cosine weighting based on actual body geometry.
//
// Cite: Diffey 1991 ("Solar UV exposure of the body" Phys. Med. Biol.
// 36:299) reports posture-weighted body-form factors of ~0.95 for
// standing, ~0.85 for sitting, and ~1.3-1.5 for supine at solar noon.
// Webb et al. 2011 (Br. J. Dermatol.) replicates the supine 1.4× boost
// in field measurements. The AI verdict for "I sunbathed lying down on
// the beach" rides on this multiplier — values are rounded conservatively.
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
  const channelChips = live?.doses ? renderChannelChips(live.doses, sess) : '';
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
    const rotated = !!sess.bodyExposure?.rotatedSides;
    // Live ticker prefers per-session cap when bodyFraction is set,
    // mirroring the detail-modal rendering (Audit P1 #8).
    const bf = sess.bodyExposure?.fraction;
    const iu = (Number.isFinite(bf) && bf > 0 && typeof window.vitaminDIUPerSession === 'function')
      ? window.vitaminDIUPerSession(live.doses.vitamin_d, fitz, uvi, rotated, state.importedData?.genetics || null, bf)
      : (window.vitaminDIU ? window.vitaminDIU(live.doses.vitamin_d, fitz, uvi, rotated) : live.doses.vitamin_d * 60 * (rotated ? 2 : 1));
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
//
// _lastChannelRefreshAt is a wall-time gate so pause/resume of the
// ticker doesn't desync the cadence — pre-2026-05-08 used a global mod
// counter (_tickCount % 5) which counted ticks regardless of whether
// they fired.
let _tickCount = 0;
let _lastChannelRefreshAt = 0;
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
        showNotification(_jargonPrefix('med') + 'Burn threshold reached. Move to shade or cover up. Hydrate, no more direct sun today — damage from here is cumulative.', 'error', 10000);
      } else if (med >= 0.7 && !cur.alerted70) {
        _setLiveState(sess.id, { alerted70: true });
        showNotification(_jargonPrefix('med') + '70% of your burn dose. Best move: head into shade for ~10 min, then decide. If you stay, watch for skin warmth or pinkness.', 'warning', 8000);
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
        showNotification(_jargonPrefix('icnirp') + 'Eye UV at the ICNIRP daily exposure limit. Put on UV-blocking sunglasses now — symptoms (gritty eyes, sensitivity to light) appear 6-12 hours after exposure.', 'error', 10000);
      } else if (ruv >= 15 && !cur.alertedRetinal500) {
        _setLiveState(sess.id, { alertedRetinal500: true });
        showNotification(_jargonPrefix('icnirp') + 'Eyes at half the daily ICNIRP UV limit — sunglasses or look-down breaks recommended. Cumulative eye exposure causes pterygium and cataract over years.', 'warning', 8000);
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

    // DOM patches are only meaningful when the user can actually see the
    // result. Bail when the tab is hidden (browser will pause rAF anyway,
    // but the 1s setInterval keeps firing) or when none of the views that
    // host live-session UI are active. Heat/UV alerts above still ran —
    // they're toast notifications that don't depend on visible cards.
    if (document.hidden) continue;
    if (state.currentView !== 'light'
        && state.currentView !== 'dashboard'
        && !document.querySelector('.modal-overlay [data-id], .modal-overlay [data-live-elapsed-for]')) {
      continue;
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

    // Patch a chip in place rather than `outerHTML = …` so the node
    // identity survives the tick. outerHTML rebuild discards focus +
    // any inflight tooltip/a11y state every second; that breaks
    // keyboard nav on the active card and makes screen readers
    // re-announce the chip every second. textContent + className +
    // title patches keep the existing element and only touch the
    // attributes that actually changed.
    const patchChip = (el, html) => {
      if (!html) { el.remove(); return; }
      const tmpl = document.createElement('template');
      tmpl.innerHTML = html.trim();
      const fresh = tmpl.content.firstElementChild;
      if (!fresh) return;
      if (el.className !== fresh.className) el.className = fresh.className;
      const newTitle = fresh.getAttribute('title') || '';
      if (el.getAttribute('title') !== newTitle) el.setAttribute('title', newTitle);
      const newText = fresh.textContent;
      if (el.textContent !== newText) el.textContent = newText;
    };
    cards.forEach(card => {
      const durEl = card.querySelector('.sun-session-duration');
      if (durEl) durEl.textContent = body.elapsed;
      const medEl = card.querySelector('.sun-session-med');
      if (medEl) patchChip(medEl, body.medStr);
      else if (body.medStr) {
        // Insert med chip into the head row if it doesn't exist yet
        const head = card.querySelector('.sun-session-head .sun-session-duration');
        if (head) head.insertAdjacentHTML('afterend', body.medStr);
      }
      const vitdEl = card.querySelector('.sun-session-vitd');
      if (vitdEl) patchChip(vitdEl, body.vitaminDStr);
      else if (body.vitaminDStr) {
        // Insert vit-D chip after med chip (or after duration if no med yet)
        const after = card.querySelector('.sun-session-med') || card.querySelector('.sun-session-duration');
        if (after) after.insertAdjacentHTML('afterend', body.vitaminDStr);
      }
      // Heat chip — replace if present, insert in head row if not.
      const heatEl = card.querySelector('.sun-session-heat');
      if (heatEl) patchChip(heatEl, body.heatStr);
      else if (body.heatStr) {
        const after = card.querySelector('.sun-session-vitd') || card.querySelector('.sun-session-med') || card.querySelector('.sun-session-duration');
        if (after) after.insertAdjacentHTML('afterend', body.heatStr);
      }
      // Retinal-UV chip — same pattern.
      const retinalEl = card.querySelector('.sun-session-retinal');
      if (retinalEl) patchChip(retinalEl, body.retinalStr);
      else if (body.retinalStr) {
        const after = card.querySelector('.sun-session-heat') || card.querySelector('.sun-session-vitd') || card.querySelector('.sun-session-med') || card.querySelector('.sun-session-duration');
        if (after) after.insertAdjacentHTML('afterend', body.retinalStr);
      }
      // Channel chips: outerHTML still appropriate here — the channel
      // wrapper rebuilds its child chip nodes (different rendered chips
      // when tier rankings change), and the user can't focus inside it.
      const oldChips = card.querySelector('.sun-channel-chips');
      if (oldChips) oldChips.outerHTML = body.channelChips || '';
      else if (body.channelChips) card.insertAdjacentHTML('beforeend', body.channelChips);
    });
  }
  // Every 5s, refresh the surrounding "Channels this week" grid + Light
  // Today dashboard strip. They read rollingChannelTotals which now mixes
  // in the live partial doses, so re-rendering them shows accumulated UV-D
  // / circadian / NIR rising in real time. Wall-time gate: 5000ms since
  // last refresh, robust to ticker pause/resume.
  const now = Date.now();
  if (now - _lastChannelRefreshAt >= 5000) {
    _lastChannelRefreshAt = now;
    _refreshLiveChannelSurfaces();
  }
}

// Re-render the channel grid + dashboard strip without forcing a full
// `navigate()` (that would tear down the active modal / setup card / etc).
function _refreshLiveChannelSurfaces() {
  // Light & Sun page: replace the channels-section innerHTML in place
  if (state.currentView === 'light' && window.renderLightChannelsLive) {
    try { window.renderLightChannelsLive(); } catch (e) {}
  }
  // Dashboard: redraw the Light Today strip in place — but ONLY when
  // the rendered HTML actually changed. The strip ticker fires every
  // 5s; without this guard, an unchanged render still triggered an
  // innerHTML swap, which re-instantiated every child element and
  // caused CSS transitions on the pills + AI chip to flicker visibly
  // ("blinking") even though no value had changed.
  if (state.currentView === 'dashboard' && window.renderLightTodayStrip) {
    const strip = document.querySelector('.light-today-strip');
    if (strip) {
      const html = window.renderLightTodayStrip();
      if (html) {
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        const fresh = wrap.firstElementChild;
        if (fresh) {
          for (const attr of fresh.getAttributeNames()) {
            const newVal = fresh.getAttribute(attr);
            if (strip.getAttribute(attr) !== newVal) strip.setAttribute(attr, newVal);
          }
          // Only swap children when the HTML genuinely differs. Strict
          // string compare is cheap relative to the layout cost of a
          // full subtree rebuild.
          const freshInner = fresh.innerHTML;
          if (strip.innerHTML !== freshInner) strip.innerHTML = freshInner;
        }
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
  const channelChips = renderChannelChips(sess.doses, sess);
  // Active-session controls: Pause/Resume + Sunscreen re-applied + Set
  // ozone. Stop propagation so the row's open-detail click handler
  // doesn't fire when these are tapped.
  let activeControls = '';
  if (isActive) {
    const isPaused = !!sess.paused;
    const pauseLabel = isPaused ? '▶ Resume' : '⏸ Pause';
    const pauseAction = isPaused ? `window.resumeSunSession('${escapeAttr(sess.id)}')` : `window.pauseSunSession('${escapeAttr(sess.id)}')`;
    const isRotated = !!sess.bodyExposure?.rotatedSides;
    const flipBtn = isRotated
      ? `<button class="sun-session-ctl" disabled title="Already logged as rotated — vit-D IU already counts both sides." aria-label="Rotated"><span aria-hidden="true">🔄</span> <span class="sun-session-ctl-label">Rotated ✓</span></button>`
      : `<button class="sun-session-ctl" onclick="event.stopPropagation();window.flipSidesMidSession('${escapeAttr(sess.id)}')" title="Tap when you flip front↔back. Doubles vit-D IU to reflect that both sides got exposure." aria-label="Flip front-back"><span aria-hidden="true">🔄</span> <span class="sun-session-ctl-label">Flip</span></button>`;
    activeControls = `<div class="sun-session-active-controls" onclick="event.stopPropagation()">
      <div class="sun-session-ctl-primary">
        <button class="sun-session-ctl sun-session-ctl-stop" onclick="event.stopPropagation();window.quickLogSunSession()" title="Stop and save the current session"><span aria-hidden="true">⏹</span> <span class="sun-session-ctl-label">Stop &amp; save</span></button>
        <button class="sun-session-ctl" onclick="event.stopPropagation();${pauseAction}" title="${isPaused ? 'Resume dose accrual' : 'Pause dose accrual (shade break, indoors)'}" aria-label="${isPaused ? 'Resume' : 'Pause'} session"><span aria-hidden="true">${isPaused ? '▶' : '⏸'}</span> <span class="sun-session-ctl-label">${isPaused ? 'Resume' : 'Pause'}</span></button>
      </div>
      <div class="sun-session-ctl-secondary">
        ${flipBtn}
        <button class="sun-session-ctl" onclick="event.stopPropagation();window.changeCoverageMidSession('${escapeAttr(sess.id)}')" title="Dressed or undressed — opens the body-region picker, commits the dose accrued so far, applies the new coverage from this moment forward" aria-label="Change coverage"><span aria-hidden="true">👕</span> <span class="sun-session-ctl-label">Coverage</span></button>
        <button class="sun-session-ctl" onclick="event.stopPropagation();window.applySunscreenMidSession('${escapeAttr(sess.id)}')" title="Reapplied sunscreen — commits current slice and starts a new one with the new SPF" aria-label="Reapply sunscreen"><span aria-hidden="true">🧴</span> <span class="sun-session-ctl-label">Sunscreen</span></button>
        <button class="sun-session-ctl" onclick="event.stopPropagation();window.setOzoneOverrideMidSession()" title="Calibrate ozone column from a meter / weather station" aria-label="Override ozone"><span aria-hidden="true">🛰</span> <span class="sun-session-ctl-label">Ozone</span></button>
      </div>
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
      ${escapeHTML(_summarizeBodyExposure(sess))} · ${sess.eyeExposure?.mode === 'direct' ? `<span class="sun-eye-warn" title="Never look directly at the sun">⚠</span> ` : ''}${escapeHTML(eyeLabels[sess.eyeExposure?.mode] || 'Eyes unset')}${sess.bodyExposure?.glassBetween ? ' · through glass' : ''}${sess.bodyExposure?.sunscreenSPF ? ` · SPF ${sess.bodyExposure.sunscreenSPF}` : ''}
    </div>
    ${forgotBanner}
    ${activeControls}
    ${channelChips}
    ${typeof window !== 'undefined' && window.renderSessionAIInline ? window.renderSessionAIInline(sess) : ''}
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
  // Modal title date: full month + day + year — avoids the "Sun session
  // — Sun, May 3" stutter and gives a clear timestamp at a glance.
  const fmtTitleDate = (d) => d ? d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  const dur = sess.durationMin ? `${Math.round(sess.durationMin)} min` : 'in progress';
  // Combined "When" string — a single cell beats three near-redundant ones
  // (Started / Ended / Duration). Renders "10:07–10:32 · 25 min" or
  // "10:07 · started 5 min ago" for in-progress sessions.
  const whenStr = end
    ? `${fmtTime(start)}–${fmtTime(end)} · ${dur}`
    : `${fmtTime(start)} · ${dur}`;

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
    // Non-breaking space between number and label keeps them on one line.
    medStr = `${pct}% · ${label}`;
  }

  // Per-channel breakdown. Real-world units (IU, J/cm², M-EDI lux)
  // surface where defensible; tier-only for channels without a clean
  // single SI unit. See sun-spectrum.js {vitaminDIU, pbmJoulesPerCm2,
  // circadianMelanopicLux} for the conversions and their sources.
  // Compute zenith at session midpoint once so vit-D's uncertainty band
  // can tighten when conditions are favorable (high noon clear sky).
  let sessZenith = null;
  try {
    if (sess.startedAt && sess.endedAt && sess.location && window.solarZenithAngle) {
      const midDate = new Date((sess.startedAt + sess.endedAt) / 2);
      sessZenith = window.solarZenithAngle(midDate, sess.location.lat, sess.location.lon);
    }
  } catch (e) {}
  const channelOrder = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  const channelRows = sess.doses ? channelOrder.map(k => {
    const meta = CHANNEL_DISPLAY[k] || {};
    const v = sess.doses[k] || 0;
    const t = channelTier(v, k);
    const tlabel = tierLabel(t);
    const target = meta.dailyTarget || 0;
    const pctOfTarget = (target > 0 && v > 0) ? Math.round(100 * v / target) : null;
    const unitText = formatChannelUnit(k, v, sess.durationMin || 0, sess.safety?.fitzpatrick || 'III', sess.atmosphere?.uvIndex, sessZenith, !!sess.bodyExposure?.rotatedSides, sess.bodyExposure?.fraction || null);
    const ariaLabel = `${meta.label || k} — ${tlabel}${unitText ? ', ' + unitText : ''}. Open channel details.`;
    return `<div class="sun-detail-channel-row sun-detail-channel-row-clickable sun-chip-tier-${t}" role="button" tabindex="0" aria-label="${escapeAttr(ariaLabel)}" onclick="this.closest('.modal-overlay')?.remove();window._openChannelOnLightPage && window._openChannelOnLightPage('${escapeAttr(k)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.closest('.modal-overlay')?.remove();window._openChannelOnLightPage && window._openChannelOnLightPage('${escapeAttr(k)}')}">
      <span class="sun-detail-channel-icon" aria-hidden="true">${meta.icon || '·'}</span>
      <span class="sun-detail-channel-label">${escapeHTML(meta.label || k)}</span>
      <span class="sun-detail-channel-value"${pctOfTarget != null && !unitText ? ` title="${escapeAttr(pctOfTarget + '% of typical-active-day target — calibrated to roughly 30-60 min of moderate-body-fraction midday exposure (skin channels) or 10-30 min eye-direct outdoor light (eye channels). Over 100% means you got more than typical, NOT more than safe — burn risk is the % MED chip, not this. Targets are dosing references, not exposure ceilings.')}"` : ''}>${unitText || (pctOfTarget != null ? `${pctOfTarget}%` : '')}</span>
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
    // Open-Meteo free tier doesn't expose stratospheric ozone DU; engine
    // substitutes 300 DU internally. Show a clear "—" + "(default 300)"
    // suffix instead of the awkward "— DU".
    const ozoneStr = atm.ozoneDU != null ? `${Math.round(atm.ozoneDU)} DU` : '— (default 300)';
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
    // UVA / UVB split — reconstruct the actual spectrum at session
    // midpoint and integrate over each band:
    //   UVB: 280–320 nm (vit-D synthesis + sunburn)
    //   UVA: 320–400 nm (NO release, POMC, photoaging)
    // Surfaces both the absolute irradiance (W/m²) and the percent split
    // so users can see the real numbers, not a hand-waved fallback. No
    // more `~5%` placeholder when ozoneDU is missing — Bird-Riordan
    // already substitutes 300 DU internally so the spectrum is computed
    // either way.
    let uvSplitStr = '';
    try {
      if (loc && window.reconstructSpectrum && window.solarZenithAngle && atm.uvIndex != null) {
        const mid = new Date((sess.startedAt + sess.endedAt) / 2);
        const z = window.solarZenithAngle(mid, loc.lat, loc.lon);
        if (z < 90) {
          const spec = window.reconstructSpectrum({
            zenithDeg: z,
            ozoneDU: atm.ozoneDU ?? 300,
            altitudeM: loc.altitudeM ?? 0,
            cloudCover: (atm.cloudCover ?? 0) / 100,
            aod: atm?.airQuality?.aod ?? null,
          });
          const dl = 5;
          let uvb = 0, uva = 0;
          for (let i = 0; i < spec.irradiance.length; i++) {
            const nm = spec.wavelengths[i];
            if (nm > 400) break;
            const e = spec.irradiance[i];
            if (nm < 320) uvb += e * dl;
            else uva += e * dl;
          }
          const total = uvb + uva;
          if (total > 0.001) {
            const uvbPct = (uvb / total * 100).toFixed(1);
            const uvaPct = (uva / total * 100).toFixed(1);
            uvSplitStr = `UVB ${uvbPct}% (${uvb.toFixed(1)} W/m²) · UVA ${uvaPct}% (${uva.toFixed(1)} W/m²)`;
          }
        }
      }
    } catch (e) {}
    // Source label: pretty-print the raw provider key.
    const sourceLabels = { open_meteo: 'Open-Meteo', cams: 'CAMS', noaa_nws: 'NOAA NWS', selfhost: 'Self-hosted', manual: 'Manual entry' };
    const sourceStr = sourceLabels[atm.source] || atm.source || 'unknown';
    atmHtml = `<div class="sun-detail-atm">
      <div title="WHO UV index at session midpoint${atm._uvOverridden ? ' (manual override active)' : ''}"><span>UVI${atm._uvOverridden ? ' (manual)' : ''}</span><strong>${uvi}</strong></div>
      <div title="Total stratospheric ozone column (Dobson Units). Lower DU → more UVB through. Engine defaults to 300 DU when source doesn't expose it."><span>Ozone</span><strong>${ozoneStr}</strong></div>
      <div title="Cloud-cover modifier on direct beam. Diffuse scatter still passes through."><span>Cloud</span><strong>${cloud}</strong></div>
      <div title="PM2.5 — fine particulate. Affects aerosol optical depth (AOD) and UV scattering."><span>PM2.5</span><strong>${aqPm25}</strong></div>
      <div title="Solar zenith angle at session midpoint — angle between sun and vertical. 0° = directly overhead, 90° = horizon."><span>Zenith</span><strong>${zenithStr}</strong></div>
      <div title="Altitude above sea level — UV climbs ~10% per 1000 m."><span>Altitude</span><strong>${altStr}</strong></div>
      ${uvSplitStr ? `<div class="sun-detail-atm-uvsplit" title="UVB-to-UVA ratio at ground level, computed from the reconstructed Bird-Riordan spectrum. Driven by zenith, ozone, cloud cover, and aerosols."><span>UV split</span><strong>${uvSplitStr}</strong></div>` : ''}
      <div class="sun-detail-atm-source"><span>Source</span><strong>${escapeHTML(sourceStr)}</strong></div>
    </div>`;
  }

  // Location summary string (uses `loc` declared above).
  const locStr = loc
    ? `${loc.lat.toFixed(2)}°, ${loc.lon.toFixed(2)}° · ${escapeHTML(loc.source || 'unknown')}`
    : 'Location not recorded';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  // Body summary — combine fraction + regions onto one line so the section
  // doesn't flag the percent as a label decoration. Also consolidate Eyes
  // + Modifiers into the same section when both fit cleanly.
  const eyeMode = eyeLabels[sess.eyeExposure?.mode] || 'Eyes unset';
  const lensTintStr = sess.eyeExposure?.lensTint && sess.eyeExposure.lensTint !== 'clear'
    ? ` · ${lensLabels[sess.eyeExposure.lensTint] || ''}` : '';
  const modifierBits = [];
  if (sess.bodyExposure?.glassBetween) modifierBits.push('Behind glass');
  if (sess.bodyExposure?.sunscreenSPF) modifierBits.push(`SPF ${sess.bodyExposure.sunscreenSPF}`);
  if (sess.posture && sess.posture !== 'standing') {
    const postureLabel = (POSTURE_OPTIONS.find(p => p.key === sess.posture) || {}).label;
    if (postureLabel) modifierBits.push(postureLabel);
  }
  if (sess.surfaceAlbedo && sess.surfaceAlbedo !== 'grass') {
    const surfLabel = (SURFACE_OPTIONS.find(s => s.key === sess.surfaceAlbedo) || {}).label;
    if (surfLabel) modifierBits.push(surfLabel.split(' (')[0]); // drop the "(~25%)" suffix
  }

  overlay.innerHTML = `<div class="modal sun-detail-modal" role="dialog" aria-label="Sun session details">
    <div class="modal-header">
      <h3>Sun session · ${escapeHTML(fmtTitleDate(start))}</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${typeof window !== 'undefined' && window.renderSessionAIDetail ? window.renderSessionAIDetail(sess) : ''}
      <div class="sun-detail-grid">
        <div title="Session start–end and duration"><span>When</span><strong>${escapeHTML(whenStr)}</strong></div>
        <div title="Cumulative erythemal dose as a fraction of your personal MED (Fitzpatrick-scaled). 70%+ recommends shade; 100% is sunburn threshold."><span>Burn dose</span><strong>${escapeHTML(medStr)}</strong></div>
        ${sess.doses?.vitamin_d ? (() => {
          const geneInfo = (typeof window.geneticVitaminDMultiplier === 'function')
            ? window.geneticVitaminDMultiplier(state.importedData?.genetics)
            : { mult: 1.0, contributors: [] };
          const geneNote = geneInfo.contributors.length > 0
            ? ` Genetics applied (${(geneInfo.mult * 100 - 100).toFixed(0)}% net): ${geneInfo.contributors.map(c => `${c.gene} ${c.genotype} ×${c.multiplier.toFixed(2)}`).join(', ')}.`
            : '';
          return `<div title="Approximate vitamin D₃ synthesis (effective serum response). Holick 2008 + Bogh &amp; Wulf 2010 conversion, scaled by Fitzpatrick ${sess.safety?.fitzpatrick || 'III'}, gated by UVI ≥ 2-3 (Webb 2018), saturates around 20,000 IU per session.${sess.bodyExposure?.rotatedSides ? ' Doubled because both sides were exposed (rotated during session).' : ' Assumes you stayed on one side — tap the 🔄 Flip control during the session if you flipped front↔back.'}${geneNote} Model accuracy ±20-45% by zenith. Inter-individual blood 25(OH)D response to the same UV dose varies an additional 2-3×."><span>Vitamin D</span><strong>${escapeHTML(formatChannelUnit('vitamin_d', sess.doses.vitamin_d, sess.durationMin || 0, sess.safety?.fitzpatrick || 'III', sess.atmosphere?.uvIndex, sessZenith, !!sess.bodyExposure?.rotatedSides, sess.bodyExposure?.fraction || null))}</strong></div>`;
        })() : ''}
      </div>

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Skin exposed · ${fractionPct}%</div>
        <div class="sun-detail-section-value">${escapeHTML(regionLabels)}</div>
      </div>

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Eyes</div>
        <div class="sun-detail-section-value">${escapeHTML(eyeMode + lensTintStr)}</div>
      </div>

      ${modifierBits.length ? `
        <div class="sun-detail-section">
          <div class="sun-detail-section-label">Modifiers</div>
          <div class="sun-detail-section-value">${escapeHTML(modifierBits.join(' · '))}</div>
        </div>
      ` : ''}

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Per-channel dose</div>
        <div class="sun-detail-channels">${channelRows}</div>
      </div>

      ${atmHtml ? `
        <div class="sun-detail-section">
          <div class="sun-detail-section-label">Conditions during this session</div>
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
        ${sess.endedAt ? `<button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove();window.editSunSessionDuration('${escapeAttr(sess.id)}')" title="Override the session duration. Use when a re-end on a second device set it wrong, or you forgot to stop on time.">Edit duration</button>` : ''}
        <button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red)" onclick="this.closest('.modal-overlay').remove();window.deleteSunSession('${escapeAttr(sess.id)}')">Delete session</button>
      </div>
    </div>
  </div>`;
  _wireBackdropClose(overlay);
  document.body.appendChild(overlay);
  trapModalFocus(overlay);
}

// Per-channel chip value — small inline real-unit number rendered on
// the chip. Channel-aware so units match what the user expects:
//   vitamin_d → IU
//   nir_solar → J/cm²
//   circadian → ~k M-EDI lux (peak melanopic during the session)
//   no_cv / pomc / violet_eye → percent of daily target
// Returns '' when the value is sub-meaningful so chips for low channels
// stay tight (icon + label only).
function _sessionChipValue(channelKey, channelAu, sess) {
  if (!Number.isFinite(channelAu) || channelAu <= 0) return '';
  const meta = CHANNEL_DISPLAY[channelKey] || {};
  const fitz = sess?.safety?.fitzpatrick || 'III';
  const uvi = sess?.atmosphere?.uvIndex ?? null;
  const dur = sess?.durationMin || 0;
  // Mirror formatChannelUnit's too-short gate: short sessions get the
  // icon + label only, no spurious value. Keeps the chip readable
  // without misleading numbers.
  if (dur > 0 && dur < TOO_SHORT_FOR_CHANNEL_VERDICT_MIN) return '';
  if (channelKey === 'vitamin_d' && typeof window.vitaminDIU === 'function') {
    // Session chip uses per-session cap when bodyFraction is set
    // (Audit P1 #8). Falls back to daily-cap helper for legacy chip
    // contexts where bodyFraction wasn't recorded.
    const bf = sess?.bodyExposure?.fraction;
    const iu = (Number.isFinite(bf) && bf > 0 && typeof window.vitaminDIUPerSession === 'function')
      ? window.vitaminDIUPerSession(channelAu, fitz, uvi, !!sess?.bodyExposure?.rotatedSides, state.importedData?.genetics || null, bf)
      : window.vitaminDIU(channelAu, fitz, uvi, !!sess?.bodyExposure?.rotatedSides);
    if (iu < 30) return '';
    if (iu >= 1000) return `~${(iu / 1000).toFixed(1).replace(/\.0$/, '')}k IU`;
    return `~${Math.round(iu / 10) * 10} IU`;
  }
  if (channelKey === 'nir_solar' && typeof window.pbmJoulesPerCm2 === 'function') {
    const j = window.pbmJoulesPerCm2(channelAu);
    if (j < 0.1) return '';
    if (j >= 10) return `${Math.round(j)} J/cm²`;
    return `${j.toFixed(1)} J/cm²`;
  }
  if (channelKey === 'circadian' && dur > 0 && typeof window.circadianMelanopicLux === 'function') {
    const lux = window.circadianMelanopicLux(channelAu, dur);
    if (lux < 100) return '';
    // Round aggressively at this magnitude — peak M-EDI lux is a big
    // number and chip-width-readable form beats decimal precision.
    if (lux >= 10000) return `~${Math.round(lux / 1000)}k lux`;
    if (lux >= 1000) return `~${(lux / 1000).toFixed(1)}k lux`;
    return `~${Math.round(lux / 10) * 10} lux`;
  }
  // Unitless channels — percent-of-daily-target. Past hit-target the
  // exact number is noise (the user got more than enough); collapse
  // anything ≥ 200% to "✓ over" so the chip stays informative without
  // a 4-digit percentage that adds nothing actionable.
  const target = meta.dailyTarget || 0;
  if (target > 0) {
    const pct = Math.round(100 * channelAu / target);
    if (pct < 5) return '';
    if (pct >= 200) return '✓ over';
    if (pct >= 100) return `✓ ${pct}%`;
    return `${pct}%`;
  }
  return '';
}

function renderChannelChips(doses, sess = null) {
  if (!doses) return '';
  const order = ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'nir_solar'];
  // Top-3 contributing channels for at-a-glance reading. Full grid lives on
  // the Light & Sun page; per-row noise is what the v1.7.0a UX review flagged.
  const ranked = order
    .map(key => ({ key, v: doses[key] || 0, tier: channelTier(doses[key] || 0, key) }))
    .sort((a, b) => b.tier - a.tier || b.v - a.v);
  const showAll = ranked.filter(r => r.tier > 0).length > 3;
  const visible = showAll ? ranked.slice(0, 3) : ranked;
  const chipFor = (r, extraClass = '') => {
    const meta = CHANNEL_DISPLAY[r.key];
    const label = meta?.label || r.key.replace('_', ' ');
    const valueStr = _sessionChipValue(r.key, r.v, sess);
    const tip = valueStr
      ? `${meta?.what || ''} — this session: ${valueStr}`
      : `${meta?.what || ''} (level: ${tierLabel(r.tier)})`;
    return `<span class="sun-chip sun-chip-tier-${r.tier}${extraClass}" data-channel="${r.key}" title="${escapeAttr(tip)}">
      <span class="sun-chip-icon">${meta?.icon || '·'}</span>
      <span class="sun-chip-label">${escapeHTML(label)}</span>
      ${valueStr ? `<span class="sun-chip-value">${escapeHTML(valueStr)}</span>` : ''}
    </span>`;
  };
  let html = `<div class="sun-channel-chips">`;
  for (const r of visible) html += chipFor(r);
  if (showAll) {
    html += `<button class="sun-chip-more" onclick="this.parentElement.classList.toggle('sun-chips-expanded')">+ ${ranked.length - 3} more</button>`;
    for (const r of ranked.slice(3)) html += chipFor(r, ' sun-chip-extra');
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
function _silhouetteRegionPaths(sex) {
  // Tap zones aligned to the er.svg figures (per-sex because female and
  // male silhouettes differ in shoulder/torso width). Coordinates in the
  // picker's 100×210 viewBox. The figure occupies a different x-range per
  // sex: female ≈ 22–78 (cellWScaled ~56), male ≈ 16–84 (~68). Per-region
  // bounds were measured from the tinted render at typical body landmarks
  // (face top, jawline, shoulders, ribcage, navel, iliac crest, knees).
  //
  // The parametric clipPath (from silhouette-paths.js) still hugs the gold
  // wash to a body shape, so these rects only need to cover roughly the
  // right anatomical zone — the clipPath does the visual cleanup.

  const isF = sex === 'female';

  // Per-sex band widths. Outer = outermost body silhouette (arms outline);
  // shoulder/chest = upper torso width; waist = narrowest mid-body;
  // hip = pelvis/glutes; legs split at center.
  const outerL = isF ? 22 : 16;     // outer arm-line, left
  const outerR = isF ? 78 : 84;     // outer arm-line, right
  const shoulderL = isF ? 32 : 27;  // shoulder cap inside the arm
  const shoulderR = isF ? 68 : 73;
  const torsoL = isF ? 36 : 30;
  const torsoR = isF ? 64 : 70;
  const waistL = isF ? 38 : 32;
  const waistR = isF ? 62 : 68;
  const hipL = isF ? 34 : 28;
  const hipR = isF ? 66 : 72;
  const center = 50;

  // Vertical landmarks in the 0–210 figure column. Proportions roughly
  // follow Vitruvian: head 0-13%, shoulders ~15%, nipple ~28%, navel ~42%,
  // pubic bone ~50%, crotch ~57%, knee ~75%, ankle ~95%. Female chin sits
  // higher than male; female bust band is also lower + taller than male
  // pec band, so chest landmarks are sex-specific.
  // Vertical landmarks measured directly off the rendered Shutterstock
  // licensed vector via the picker's 100×220 viewBox (overlaid grid).
  // Values supplied by the user reading the on-figure grid:
  //   face   6–31, throat 31–39, breast 42–66, torso 67–90,
  //   genitals 107–114, legs 115–189.
  // The 3-unit gap (39→42) is the clavicle/upper-chest band; intentionally
  // unselected to keep breast-chest tight on the bust band.
  const yHairTop  = 6;
  const yChinTop  = 31;     // face ends / throat begins
  const yShldrTop = 39;     // throat ends
  const yChestTop = 42;     // breast / pec band begins
  const yChestBot = 66;     // under-bust / under-pec
  const yNavel    = 90;     // torso ends / abdomen begins
  const yPubicTop = 107;    // abdomen ends / genitals begin
  const yCrotch   = 114;    // genitals end / legs begin
  const yKnee     = 150;
  const yAnkle    = 189;    // legs end
  const ySole     = 200;

  // Region templates as `M x1 y1 L x2 y1 L x2 y2 L x1 y2 Z`.
  const rect = (x1, y1, x2, y2) => `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;

  // Arms — both sides of figure. Upper arm is narrow (shoulder cap to
  // under-chest), lower arm/wrist widens because hands rest on the hips
  // in this pose, so the hand bump pokes inward of the upper arm line.
  const armsPath =
    // Upper arm (shoulder cap straight down to under-chest)
    rect(outerL, yShldrTop, shoulderL, yChestBot) + ' ' +
    rect(shoulderR, yShldrTop, outerR, yChestBot) + ' ' +
    // Lower arm + hand-on-hip — extends inward to body edge
    rect(outerL, yChestBot, torsoL, yCrotch) + ' ' +
    rect(torsoR, yChestBot, outerR, yCrotch);

  // Legs — split at center, crotch to ankle.
  const legsPath =
    rect(hipL, yCrotch, center, yAnkle) + ' ' +
    rect(center, yCrotch, hipR, yAnkle);

  // Feet — strip across the bottom of each foot. Independent front/back
  // keys so selecting tops-of-feet doesn't also select heels/soles.
  const feetPath =
    rect(hipL, yAnkle, center, ySole) + ' ' +
    rect(center, yAnkle, hipR, ySole);

  const front = {
    // Head sits centered around x=50 on both sexes; tighten so the face
    // rect doesn't extend past the visible head into hair / shoulder.
    'face':           rect(40, yHairTop, 60, yChinTop),
    'thyroid-throat': rect(waistL + 4, yChinTop, waistR - 4, yShldrTop),
    // Breast / chest sits on the bust / pec band only — clavicle area
    // (yShldrTop..yChestTop) intentionally unselected so the highlight
    // doesn't drift above the breasts.
    'breast-chest':   rect(shoulderL, yChestTop, shoulderR, yChestBot),
    'arms-front':     armsPath,
    'torso-front':    rect(torsoL, yChestBot, torsoR, yNavel),
    'abdomen':        rect(waistL, yNavel, waistR, yPubicTop),
    'genitals':       rect(waistL + 4, yPubicTop, waistR - 4, yCrotch),
    'legs-front':     legsPath,
    'feet-front':     feetPath,
  };
  const back = {
    'face-back':           rect(40, yHairTop, 60, yChinTop),
    'thyroid-throat-back': rect(waistL + 4, yChinTop, waistR - 4, yShldrTop),
    'arms-back':           armsPath,
    'torso-back':          rect(shoulderL, yShldrTop, shoulderR, yPubicTop),
    'glutes':              rect(hipL, yPubicTop, hipR, yCrotch),
    'legs-back':           legsPath,
    'feet-back':           feetPath,
  };
  return { front, back };
}

// View-specific anatomical landmark strokes — collarbone, breast curves,
// navel, knee dimples on front; spine, scapulae, sacral dimples, calf line
// on back. Sex-specific via the silhouette-paths builder.
function _silhouetteLandmarks(sex, view) {
  return buildLandmarks(sex, view);
}

// Sex-specific anatomical detail overlays — nipples (both sexes, front),
// genital contour (mons + cleft for F, penis + testes for M, front only),
// gluteal cleft (back only).
function _silhouetteDetails(sex, view) {
  return buildDetails(sex, view);
}

// Outer body silhouette path for the picker. View-specific so the female
// front view bulges at the bust line while the back view stays smooth.
function _silhouetteBody(sex, view) {
  return buildBody(sex, view);
}


// Backdrop renderer flag. When true, renders the licensed stock-illustration
// figure (`er.svg` — vector 6-figure F/M × front/side/back, background-
// stripped from a Shutterstock EPS) instead of the parametric Klimt-fresco
// silhouette in `silhouette-paths.js`.
//
// Kept as a flag rather than deleted because the parametric path is the
// fallback if the licensed asset ever needs to be pulled (license dispute,
// runtime fetch failure, or future fork wanting a fully-self-contained
// build). It's not a prototype anymore — it's the production renderer with
// a tested escape hatch. ~660 LoC of dead-on-paper-but-load-bearing code in
// silhouette-paths.js is the price of keeping that escape hatch warm.
const STOCK_FIGURE_PROTOTYPE = true;

// Source SVG grid (viewBox 3082.45 × 4890.47, 3 cols × 2 rows:
// front/side/back × F/M). Per-cell width/height because the female
// silhouettes are narrower than the male ones — a uniform cellW would
// either crop or undersize. Coordinates measured from the rendered SVG
// via connected-component bbox + ~15-unit padding.
// Picker viewBox is 100×220 per view; we letterbox the image cell to fit.
//
// `mask` is a raster pre-render of `src`. Browsers render true-vector SVG
// inside <mask>/<image> elements without honoring transparent backgrounds
// (treats them as opaque), so the mask needs to be raster for the
// figure-shape clipping to actually clip.
//
// The color-coded region map for hit-testing + selection-overlay is
// generated at runtime from `src` itself (`_loadRegionMap`), so there
// is no static `regionMap` PNG. Generating from the live SVG ensures
// region boundaries align 1:1 with the actual rendered figure pixels.
const STOCK_IMG = {
  src: '/er.svg',
  mask: '/er-mask.png',
  cells: {
    'female-front': { sx: 232, sy: 200, cw: 542, ch: 2089 },
    'female-side':  { sx: 1275, sy: 214, cw: 358, ch: 2076 },
    'female-back':  { sx: 2241, sy: 207, cw: 550, ch: 2120 },
    'male-front':   { sx: 162, sy: 2623, cw: 672, ch: 2108 },
    'male-side':    { sx: 1319, sy: 2653, cw: 373, ch: 2061 },
    'male-back':    { sx: 2135, sy: 2611, cw: 683, ch: 2127 },
  },
  imgW: 3082.45,
  imgH: 4890.47,
};

// Region color palette — MUST match scripts/gen-regionmap.py exactly.
// One unique RGB triple per region key; transparent means "no region".
const REGION_COLOR_RGB = {
  'face':                [255,   0,   0],
  'face-back':           [192,   0,  64],
  'thyroid-throat':      [  0, 255,   0],
  'thyroid-throat-back': [  0, 192,  64],
  'breast-chest':   [  0,   0, 255],
  'arms-front':     [255, 255,   0],
  'torso-front':    [255,   0, 255],
  'abdomen':        [  0, 255, 255],
  'genitals':       [255, 128,   0],
  'legs-front':     [128,   0, 255],
  'feet-front':     [255,   0, 128],
  'arms-back':      [128, 255,   0],
  'torso-back':     [  0, 128, 255],
  'glutes':         [128, 128, 255],
  'legs-back':      [255, 128, 255],
  'feet-back':      [128, 255, 255],
};
const _REGION_BY_RGB_INT = (() => {
  const m = new Map();
  for (const [key, [r, g, b]] of Object.entries(REGION_COLOR_RGB)) {
    m.set((r << 16) | (g << 8) | b, key);
  }
  return m;
})();

// Region map loader — generates the color-coded region map at runtime by
// rasterizing er.svg into a canvas and walking each row of the resulting
// alpha mask. This guarantees the region boundaries align 1:1 with the
// actual figure pixels (the `scripts/gen-regionmap.py` offline approach
// drifted by ~5 picker units because Chrome rendered the headless mask
// at a slightly different baseline than the in-app `<image>` element).
// Cached on first call; ~50–80ms one-shot cost on session-log open.
let _regionMapData = null;
let _regionMapPromise = null;
const _REGION_BAND_LANDMARKS = {
  yChinTop: 31, yShldrTop: 39, yChestTop: 42, yChestBot: 66,
  yNavel: 90, yPubicTop: 107, yCrotch: 114, yAnkle: 189, ySole: 200,
};
function _paintRegionMapCell(data, out, W, H, key, cell) {
  const [, view] = key.split('-');
  const isFront = view === 'front';
  const VB_W = STOCK_IMG.imgW, VB_H = STOCK_IMG.imgH;
  const L = _REGION_BAND_LANDMARKS;
  const COLORS = REGION_COLOR_RGB;
  const pad = 30;
  const y0 = Math.max(0, Math.round(cell.sy * H / VB_H) - pad);
  const y1 = Math.min(H, Math.round((cell.sy + cell.ch) * H / VB_H) + pad);
  const x0 = Math.max(0, Math.round(cell.sx * W / VB_W) - pad);
  const x1 = Math.min(W, Math.round((cell.sx + cell.cw) * W / VB_W) + pad);
  for (let my = y0; my < y1; my++) {
    let bodyLeft = -1, bodyRight = -1;
    for (let x = x0; x < x1; x++) {
      if (data[((my * W) + x) * 4 + 3] > 30) {
        if (bodyLeft < 0) bodyLeft = x;
        bodyRight = x;
      }
    }
    if (bodyLeft < 0) continue;
    const bodyWidth = bodyRight - bodyLeft + 1;
    const py = (my * VB_H / H - cell.sy) * 210 / cell.ch;
    if (py < -2 || py > 215) continue;
    const inC = (x, frac) => {
      const e = bodyWidth * frac;
      return bodyLeft + e <= x && x <= bodyRight - e;
    };
    let bandPaint;
    if      (py < L.yChinTop)  bandPaint = () => isFront ? 'face' : 'face-back';
    else if (py < L.yShldrTop) bandPaint = () => isFront ? 'thyroid-throat' : 'thyroid-throat-back';
    else if (py < L.yChestTop) bandPaint = (x) => inC(x, 0.40) ? (isFront ? 'breast-chest' : 'torso-back') : (isFront ? 'arms-front' : 'arms-back');
    else if (py < L.yChestBot) bandPaint = (x) => inC(x, 0.11) ? (isFront ? 'breast-chest' : 'torso-back') : (isFront ? 'arms-front' : 'arms-back');
    else if (py < L.yNavel)    bandPaint = isFront ? (x) => inC(x, 0.11) ? 'torso-front' : 'arms-front'
                                                   : (x) => inC(x, 0.10) ? 'torso-back' : 'arms-back';
    else if (py < L.yPubicTop) bandPaint = isFront ? (x) => inC(x, 0.13) ? 'abdomen' : 'arms-front'
                                                   : (x) => inC(x, 0.12) ? 'torso-back' : 'arms-back';
    else if (py < L.yCrotch)   bandPaint = isFront ? (x) => inC(x, 0.18) ? 'genitals' : 'arms-front'
                                                   : () => 'glutes';
    else if (py < L.yAnkle)    bandPaint = () => isFront ? 'legs-front' : 'legs-back';
    else if (py <= L.ySole + 8) bandPaint = () => isFront ? 'feet-front' : 'feet-back';
    else continue;
    for (let x = bodyLeft; x <= bodyRight; x++) {
      if (data[((my * W) + x) * 4 + 3] <= 30) continue;
      const region = bandPaint(x);
      if (!region) continue;
      const col = COLORS[region];
      const idx = (my * W + x) * 4;
      out[idx] = col[0]; out[idx + 1] = col[1]; out[idx + 2] = col[2]; out[idx + 3] = 255;
    }
  }
}
function _loadRegionMap() {
  if (_regionMapData) return Promise.resolve(_regionMapData);
  if (_regionMapPromise) return _regionMapPromise;
  _regionMapPromise = (async () => {
    const img = new Image();
    img.src = STOCK_IMG.src;
    await img.decode();
    // Render er.svg at 1700×2698 (same resolution as the legacy mask) so
    // body widths in pixels remain dense enough for thin-arm bands. The
    // viewBox aspect ratio is preserved; canvas dimensions are arbitrary.
    const W = 1700, H = 2698;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, W, H);
    const src = ctx.getImageData(0, 0, W, H);
    const out = ctx.createImageData(W, H);
    for (const [key, cell] of Object.entries(STOCK_IMG.cells)) {
      // Skip side views — they aren't selectable in the picker.
      if (/-side$/.test(key)) continue;
      _paintRegionMapCell(src.data, out.data, W, H, key, cell);
    }
    _regionMapData = out;
    return _regionMapData;
  })();
  return _regionMapPromise;
}

// Sample the region map at source-viewBox coords (sx, sy) → region key or null.
function _regionAtSource(src_x, src_y) {
  if (!_regionMapData) return null;
  const px = Math.round(src_x * (_regionMapData.width / STOCK_IMG.imgW));
  const py = Math.round(src_y * (_regionMapData.height / STOCK_IMG.imgH));
  if (px < 0 || px >= _regionMapData.width || py < 0 || py >= _regionMapData.height) return null;
  const idx = (py * _regionMapData.width + px) * 4;
  const r = _regionMapData.data[idx];
  const g = _regionMapData.data[idx + 1];
  const b = _regionMapData.data[idx + 2];
  const a = _regionMapData.data[idx + 3];
  if (a < 30) return null;
  return _REGION_BY_RGB_INT.get((r << 16) | (g << 8) | b) || null;
}

// Generate a selection-overlay PNG blob URL — pixels of selected regions
// recolored as semi-transparent accent blue, everything else transparent.
// Caches by serialized selected set so repeated renders don't regenerate.
// Returns null when nothing selected, or while async generation is pending
// (caller falls back to no overlay; we trigger a re-render once ready).
//
// Uses blob: URLs rather than data: URLs because Chrome silently drops
// large data URLs inside SVG <image> elements (they appear in the DOM
// but render as nothing).
let _overlayCache = { key: '', url: '' };
let _overlayPending = false;
function _selectedKey(selected) {
  return Array.from(selected).sort().join('|');
}
function _renderSelectionOverlay(selected, onReady) {
  if (!_regionMapData || !selected || selected.size === 0) return null;
  const key = _selectedKey(selected);
  if (key === _overlayCache.key) return _overlayCache.url;
  if (_overlayPending) return null;
  const selectedInts = new Set();
  for (const reg of selected) {
    const col = REGION_COLOR_RGB[reg];
    if (col) selectedInts.add((col[0] << 16) | (col[1] << 8) | col[2]);
  }
  if (selectedInts.size === 0) return null;
  const inData = _regionMapData.data;
  const W = _regionMapData.width;
  const H = _regionMapData.height;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const out = ctx.createImageData(W, H);
  const outData = out.data;
  for (let i = 0; i < inData.length; i += 4) {
    if (inData[i + 3] < 30) continue;
    const ci = (inData[i] << 16) | (inData[i + 1] << 8) | inData[i + 2];
    if (selectedInts.has(ci)) {
      outData[i]     = 79;
      outData[i + 1] = 140;
      outData[i + 2] = 255;
      outData[i + 3] = 200;
    }
  }
  ctx.putImageData(out, 0, 0);
  _overlayPending = true;
  c.toBlob((blob) => {
    _overlayPending = false;
    if (!blob) return;
    if (_overlayCache.url) URL.revokeObjectURL(_overlayCache.url);
    _overlayCache = { key, url: URL.createObjectURL(blob) };
    if (onReady) onReady(_overlayCache.url);
  }, 'image/png');
  return null;
}

// Render the two-view silhouette picker as an SVG. `selected` is a Set of
// region keys; each region path fills with accent when selected. Sex
// follows the active profile (Settings → Profile) — there is no in-modal
// toggle.
export function renderBodySilhouette(selected) {
  const sex = _activeProfileSex();
  const { front, back } = _silhouetteRegionPaths(sex);
  const bodyFront = _silhouetteBody(sex, 'front');
  const bodyBack = _silhouetteBody(sex, 'back');
  const frontLandmarks = _silhouetteLandmarks(sex, 'front');
  const backLandmarks = _silhouetteLandmarks(sex, 'back');
  const frontDetails = _silhouetteDetails(sex, 'front');
  const backDetails = _silhouetteDetails(sex, 'back');

  // Stock-figure prototype — compute the SVG <image> placement so each
  // view shows just the matching cell of the source grid, scaled to fit
  // a 100×210 figure area (top of the 100×220 view, leaving y 210–220 for
  // the italic-serif label).
  let renderStockImage = () => '';
  // Per-view alpha mask using the er.svg image itself — selection rects
  // are masked to figure-shape so the blue wash fills the body exactly,
  // no rectangular overflow past the silhouette.
  let renderFigureMask = () => '';
  if (STOCK_FIGURE_PROTOTYPE) {
    // Per-cell scale so each figure fits 210 high regardless of source
    // figure dimensions (female cells are narrower than male).
    const placement = (view) => {
      const cell = STOCK_IMG.cells[`${sex}-${view}`];
      if (!cell) return null;
      const scale = 210 / cell.ch;
      const fullW = STOCK_IMG.imgW * scale;
      const fullH = STOCK_IMG.imgH * scale;
      const cellWScaled = cell.cw * scale;
      const xOffset = (100 - cellWScaled) / 2;
      const imgX = xOffset - cell.sx * scale;
      const imgY = -cell.sy * scale;
      return { imgX, imgY, fullW, fullH };
    };
    renderStockImage = (view) => {
      const p = placement(view);
      if (!p) return '';
      return `<image href="${STOCK_IMG.src}" x="${p.imgX.toFixed(2)}" y="${p.imgY.toFixed(2)}" width="${p.fullW.toFixed(2)}" height="${p.fullH.toFixed(2)}" preserveAspectRatio="none" pointer-events="none"/>`;
    };
    renderFigureMask = (view, maskId) => {
      const p = placement(view);
      if (!p) return '';
      // Mask uses the image's own alpha — figure pixels = visible (alpha 1),
      // transparent background = hidden. The mask must match the figure's
      // exact placement so the cut-out aligns 1:1.
      return `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="210" mask-type="alpha"><image href="${STOCK_IMG.mask}" x="${p.imgX.toFixed(2)}" y="${p.imgY.toFixed(2)}" width="${p.fullW.toFixed(2)}" height="${p.fullH.toFixed(2)}" preserveAspectRatio="none"/></mask>`;
    };
    // Expose placement() so click handler / overlay rendering can use it.
    renderStockImage._placement = placement;
  }
  // Selection overlay generated from the region map — pixel-perfect tint
  // of selected regions. Returns null if region map hasn't loaded yet OR
  // the blob is still being encoded; in both cases we rely on the caller
  // to re-render when ready (renderBodySilhouette is sync; bind binds the
  // load promise + rebakes via dispatchEvent('sun-overlay-ready')).
  const selOverlayUrl = _renderSelectionOverlay(selected, () => {
    try { window.dispatchEvent(new CustomEvent('sun-overlay-ready')); } catch (e) {}
  });
  const renderSelectionImage = (view) => {
    if (!selOverlayUrl || !STOCK_FIGURE_PROTOTYPE) return '';
    const p = renderStockImage._placement && renderStockImage._placement(view);
    if (!p) return '';
    return `<image href="${selOverlayUrl}" x="${p.imgX.toFixed(2)}" y="${p.imgY.toFixed(2)}" width="${p.fullW.toFixed(2)}" height="${p.fullH.toFixed(2)}" preserveAspectRatio="none" pointer-events="none"/>`;
  };

  const renderRegion = (regions, viewKey) =>
    Object.entries(regions).map(([region, d]) => {
      const isSel = selected.has(region);
      const label = (BODY_REGIONS.find(r => r.key === region)?.label) || region;
      const cls = `sun-silhouette-region${isSel ? ' selected' : ''}`;
      // Avoid "Arms (front) (front)" — label already encodes the side
      // for split regions; only append (viewKey) for ambiguous regions
      // that exist on both views (face / thyroid / abdomen / etc).
      const labelHasSide = /\((front|back)\)/.test(label);
      const aria = labelHasSide ? label : `${label} (${viewKey})`;
      return `<path d="${d}" data-region="${region}" data-view="${viewKey}" class="${cls}" role="button" tabindex="0" aria-pressed="${isSel}" aria-label="${escapeAttr(aria)}"><title>${label}${isSel ? ' (selected)' : ''}</title></path>`;
    }).join('');

  const renderLandmarks = (paths) =>
    paths.map(d => `<path d="${d}" class="sun-silhouette-landmark" />`).join('');

  const renderDetails = (paths) =>
    paths.map(d => `<path d="${d}" class="sun-silhouette-detail" />`).join('');

  // Per-view clip paths so the female front silhouette (with bust bulge) and
  // the back silhouette (without) each clip their own region overlays
  // correctly. clipPathUnits defaults to userSpaceOnUse — the back-view
  // clipPath is referenced from inside the translated <g> so its coords
  // resolve against that group's local space.
  const clipFrontId = `sun-silhouette-clip-${sex}-front`;
  const clipBackId = `sun-silhouette-clip-${sex}-back`;

  // Two columns: front 0–100, back 100–200 (translated). Region tap targets
  // overlay the body silhouette and are clipped to its shape so the gold
  // selection wash hugs the figure. A small radial-gold gradient lives in
  // <defs> so we can paint individual selected regions with a soft sun-pool
  // effect via CSS class match — this is what gives the "sunlight on skin"
  // feel rather than a flat fill.
  const svg = `<svg viewBox="0 0 200 220" class="sun-silhouette" data-sex="${sex}" role="group" aria-label="Body region picker — tap or press Enter on each region you want to toggle">
    <defs>
      <clipPath id="${clipFrontId}"><path d="${bodyFront.d}" /></clipPath>
      <clipPath id="${clipBackId}"><path d="${bodyBack.d}" /></clipPath>
      <!-- Cell clip — restricts the stock image AND the region tap zones
           to a 100×210 rectangle. Used in place of the parametric body
           clipPath so the entire rect (including outer arm columns) is
           hit-testable, then a figure-shape alpha mask trims the visible
           selection fill to the actual silhouette. -->
      <clipPath id="sun-silhouette-cell-clip"><rect x="0" y="0" width="100" height="210"/></clipPath>
      ${STOCK_FIGURE_PROTOTYPE ? renderFigureMask('front', 'sun-fig-mask-front') : ''}
      ${STOCK_FIGURE_PROTOTYPE ? renderFigureMask('back', 'sun-fig-mask-back') : ''}
    </defs>

    <g class="sun-silhouette-view sun-silhouette-front">
      ${STOCK_FIGURE_PROTOTYPE
        ? `<g clip-path="url(#sun-silhouette-cell-clip)">${renderStockImage('front')}${renderSelectionImage('front')}</g>`
        : `<path d="${bodyFront.d}" class="sun-silhouette-outline"/>${renderLandmarks(frontLandmarks)}${renderDetails(frontDetails)}`}
      ${STOCK_FIGURE_PROTOTYPE
        ? `<rect x="0" y="0" width="100" height="210" fill="transparent" data-click-view="front" style="cursor:pointer"/>`
        : ''}
      <g clip-path="url(#sun-silhouette-cell-clip)" ${STOCK_FIGURE_PROTOTYPE ? 'mask="url(#sun-fig-mask-front)" style="opacity:0;pointer-events:none"' : ''}>${renderRegion(front, 'front')}</g>
      <text x="50" y="218" text-anchor="middle" class="sun-silhouette-label" aria-hidden="true">front</text>
    </g>
    <g class="sun-silhouette-view sun-silhouette-back" transform="translate(100 0)">
      ${STOCK_FIGURE_PROTOTYPE
        ? `<g clip-path="url(#sun-silhouette-cell-clip)">${renderStockImage('back')}${renderSelectionImage('back')}</g>`
        : `<path d="${bodyBack.d}" class="sun-silhouette-outline"/>${renderLandmarks(backLandmarks)}${renderDetails(backDetails)}`}
      ${STOCK_FIGURE_PROTOTYPE
        ? `<rect x="0" y="0" width="100" height="210" fill="transparent" data-click-view="back" style="cursor:pointer"/>`
        : ''}
      <g clip-path="url(#sun-silhouette-cell-clip)" ${STOCK_FIGURE_PROTOTYPE ? 'mask="url(#sun-fig-mask-back)" style="opacity:0;pointer-events:none"' : ''}>${renderRegion(back, 'back')}</g>
      <text x="50" y="218" text-anchor="middle" class="sun-silhouette-label" aria-hidden="true">back</text>
    </g>
  </svg>`;

  return svg;
}

// Bind silhouette tap + keyboard handlers — call once after inserting the
// SVG into the DOM. `onChange(selected)` fires after each toggle so the
// caller can re-render or update derived UI (e.g. exposure-fraction readout).
//
// Keyboard: each region has tabindex=0; Enter / Space toggle selection.
// Re-render preserves focus on the toggled region so SR users hear the
// new aria-pressed state without losing their place.
export function bindBodySilhouette(rootEl, selected, onChange) {
  const rerender = (focusRegion, focusView) => {
    rootEl.innerHTML = renderBodySilhouette(selected);
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

  // Kick off region map preload, re-render once it's available so the
  // selection overlay can appear (first render before load shows figures
  // only — subsequent toggles after load get the canvas-tinted overlay).
  // Guard the rerender so it only fires while this binding's rootEl is
  // still in the DOM — otherwise stale modal closures keep ticking after
  // close and the listener leak previously caused an overlay ping-pong
  // between concurrent selection sets (cache trample → ~10 Hz blob churn).
  const _alive = () => rootEl.isConnected;
  if (STOCK_FIGURE_PROTOTYPE && !_regionMapData) {
    _loadRegionMap().then(() => { if (_alive()) rerender(); }).catch(() => {});
  }
  // The blob-encoded overlay arrives async; rerender once ready so the
  // tint appears on the figure. Listener is removed both lazily (next
  // dispatch after rootEl detaches) AND eagerly via a MutationObserver
  // on the parent — so cleanup happens at modal-close time even if no
  // overlay-ready event fires before the next open. The lazy path is
  // kept as a fallback for cases where the parent observer loses track
  // (e.g., rootEl moved to a new parent).
  const _onOverlayReady = () => {
    if (!_alive()) {
      window.removeEventListener('sun-overlay-ready', _onOverlayReady);
      return;
    }
    rerender();
  };
  window.addEventListener('sun-overlay-ready', _onOverlayReady);
  if (typeof document !== 'undefined' && document.body && typeof MutationObserver === 'function') {
    // Subtree observation — modal-close typically removes a grandparent
    // overlay (rootEl's immediate parent stays attached to it), so we
    // need to watch the whole document for childList changes and check
    // connectivity on every fire. The callback is short — short-circuit
    // when still connected.
    const detachObs = new MutationObserver(() => {
      if (!rootEl.isConnected) {
        window.removeEventListener('sun-overlay-ready', _onOverlayReady);
        detachObs.disconnect();
      }
    });
    detachObs.observe(document.body, { childList: true, subtree: true });
  }

  // Map a click on the SVG to a region key via the region map. Falls
  // back to per-region path detection if the map hasn't loaded yet.
  const _resolveRegionFromEvent = (e) => {
    if (!_regionMapData) return null;
    const svg = rootEl.querySelector('svg.sun-silhouette');
    if (!svg) return null;
    // Convert clientX/Y into the SVG's local (viewBox) coordinate space.
    let pt;
    try { pt = svg.createSVGPoint(); } catch (err) { return null; }
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    // Determine view (front/back) and view-local picker coords.
    const view = local.x < 100 ? 'front' : 'back';
    const px = view === 'front' ? local.x : local.x - 100;
    const py = local.y;
    if (py < 0 || py > 210 || px < 0 || px > 100) return null;
    // Map view-local picker coords to source-viewBox coords via the cell.
    const sex = svg.getAttribute('data-sex') || 'male';
    const cell = STOCK_IMG.cells[`${sex}-${view}`];
    if (!cell) return null;
    const scale = 210 / cell.ch;
    const cellWScaled = cell.cw * scale;
    const xOffset = (100 - cellWScaled) / 2;
    const src_x = cell.sx + (px - xOffset) / scale;
    const src_y = cell.sy + py / scale;
    return _regionAtSource(src_x, src_y);
  };

  rootEl.addEventListener('click', (e) => {
    // Region-map sampling is the source of truth — try it first whenever
    // the click landed inside the figure SVG. Fall back to per-region
    // path matching for keyboard / a11y entry points.
    const fromMap = _resolveRegionFromEvent(e);
    if (fromMap) {
      const view = e.target.closest('[data-click-view]')?.dataset.clickView
        || (e.target.closest('.sun-silhouette-back') ? 'back' : 'front');
      toggleRegion(fromMap, view);
      return;
    }
    const t = e.target.closest('[data-region]');
    if (!t) return;
    toggleRegion(t.dataset.region, t.dataset.view);
  });
  rootEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
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
  const fmtLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const localNow = fmtLocal(now);
  // Started-at defaults to now − 15 min so the most-common quick-log
  // ("I just had a 15-min session") works with zero edits. Users
  // logging older sessions adjust both timestamps.
  const localStartDefault = fmtLocal(new Date(now.getTime() - 15 * 60 * 1000));

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
        <label class="ctx-label">Started at
          <input type="datetime-local" id="det-started-at" class="ctx-input" value="${escapeAttr(localStartDefault)}" max="${escapeAttr(localNow)}" />
        </label>
        <label class="ctx-label">Ended at
          <input type="datetime-local" id="det-ended-at" class="ctx-input" value="${escapeAttr(localNow)}" max="${escapeAttr(localNow)}" />
        </label>
      </div>
      <div class="sun-silhouette-hint" id="det-duration-hint" style="margin-top:-6px">Duration: 15 min</div>

      <div class="sun-detailed-row">
        <label class="ctx-label">Sunscreen SPF
          <input type="number" id="det-spf" class="ctx-input" min="0" max="100" placeholder="none" />
        </label>
        <div class="ctx-label sun-detailed-glass" style="margin-top:24px;display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span style="flex:1;min-width:0">Behind glass (window / car / sunroom)</span>
          <label class="toggle-switch">
            <input type="checkbox" id="det-glass" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="sun-detailed-row">
        <label class="ctx-label">Eyes
          <select id="det-eye-mode" class="ctx-select">
            ${EYE_MODES.map(e => `<option value="${escapeAttr(e.key)}"${e.key === eyeMode ? ' selected' : ''}>${escapeHTML(e.pickerLabel || e.label)}</option>`).join('')}
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

  // Live "Duration: N min" hint derived from the two timestamps. Doubles
  // as a validation channel — surfaces "Ended must be after Started"
  // and "over 4 hours" right under the inputs without a separate error
  // field. Clamps display only; save handler does the final validation.
  const startEl = overlay.querySelector('#det-started-at');
  const endEl = overlay.querySelector('#det-ended-at');
  const hintEl = overlay.querySelector('#det-duration-hint');
  const updateDurationHint = () => {
    if (!startEl || !endEl || !hintEl) return;
    const sMs = new Date(startEl.value).getTime();
    const eMs = new Date(endEl.value).getTime();
    if (!Number.isFinite(sMs) || !Number.isFinite(eMs)) {
      hintEl.textContent = 'Duration: —';
      return;
    }
    const min = Math.round((eMs - sMs) / 60000);
    if (min <= 0) hintEl.textContent = `Ended must be after Started (currently ${min} min)`;
    else if (min > 240) hintEl.textContent = `Duration: ${min} min — over 4 hours, double-check the times`;
    else hintEl.textContent = `Duration: ${min} min`;
  };
  startEl?.addEventListener('input', updateDurationHint);
  endEl?.addEventListener('input', updateDurationHint);
  updateDurationHint();

  overlay.querySelector('#det-save').addEventListener('click', async () => {
    const eyeModeVal = overlay.querySelector('#det-eye-mode').value || 'direct';
    const lensTintVal = overlay.querySelector('#det-lens-tint').value || 'clear';
    const spf = parseInt(overlay.querySelector('#det-spf').value, 10) || null;
    const glass = overlay.querySelector('#det-glass').checked;
    const notes = overlay.querySelector('#det-notes').value || '';

    // Resolve the two timestamps. Both fields default to a sensible
    // 15-min window ending now, so the empty-field fallback never fires
    // in practice — but we guard anyway in case a user clears one.
    const startedAtRaw = overlay.querySelector('#det-started-at').value;
    const endedAtRaw = overlay.querySelector('#det-ended-at').value;
    const endedMsRaw = endedAtRaw ? new Date(endedAtRaw).getTime() : Date.now();
    const startedMsRaw = startedAtRaw
      ? new Date(startedAtRaw).getTime()
      : (endedMsRaw - 15 * 60 * 1000);
    if (!Number.isFinite(startedMsRaw) || !Number.isFinite(endedMsRaw)) {
      showNotification('Invalid Started at / Ended at — check the times', 'error');
      return;
    }
    if (startedMsRaw >= endedMsRaw) {
      showNotification('Ended at must be after Started at', 'error');
      return;
    }
    const endedAt = Math.min(endedMsRaw, Date.now());
    const start = Math.min(startedMsRaw, endedAt - 60 * 1000);
    const durationMin = Math.max(1, Math.round((endedAt - start) / 60000));

    // Compute exposure fraction from selected regions
    const regions = Array.from(selected);
    const fraction = regions.reduce((sum, key) => {
      const r = BODY_REGIONS.find(b => b.key === key);
      return sum + (r?.fraction || 0);
    }, 0);
    const posture = overlay.querySelector('#det-posture')?.value || 'standing';
    const surfaceAlbedo = overlay.querySelector('#det-surface')?.value || 'grass';
    // Resolve coordinates so hydrateSession has somewhere to fetch
    // atmosphere from. Without this the past-session save records the
    // session but `useLat == null` short-circuits hydration → channels
    // and safety stay null forever and the detail modal opens to a
    // mostly-empty card. quickLogSunSession resolves coords before
    // calling startSession; the after-the-fact path needs the same step.
    const location = getSunCoords();
    const sessId = await logCompletedSession({
      startedAt: start,
      endedAt,
      location,
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

// Reset all sun.js module-singleton state. Called on profile switch so
// caches/timers from profile A don't bleed into profile B (e.g. region-
// map decoded canvas data is profile-agnostic but the overlay cache key
// is built from the previous profile's selection set; the active-card
// ticker keeps running with the prior profile's session list).
function _resetSunModuleState() {
  if (_activeTicker) { clearInterval(_activeTicker); _activeTicker = null; }
  _tickCount = 0;
  _lastChannelRefreshAt = 0;
  _overlayCache = { key: '', url: '' };
  _overlayPending = false;
  // _regionMapData decode is expensive (canvas + getImageData on a full
  // figure SVG) and the result is profile-agnostic, so we keep it warm.
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
    _testLoadRegionMap: _loadRegionMap,
    _testRegionAtSource: _regionAtSource,
    _testRegionColorRGB: REGION_COLOR_RGB,
    _testStockImg: STOCK_IMG,
    _testRegionBandLandmarks: _REGION_BAND_LANDMARKS,
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
