// @ts-check
// sun-session-model.js — shared Sun session option and safety model.
//
// Keep these constants out of UI/store modules so the active-session ticker,
// persisted session store, and public sun.js facade all use one source.

// Photosensitizing medication flags. Drug, dose, formulation, reaction type,
// and individual response differ too much for a universal MED multiplier.
// Tiers control caution prominence only; numeric burn estimates remain the
// base skin-type estimate and explicitly exclude medication effects.
export const PHOTOSENSITIVE_MED_TIERS = [
  { key: 'unknown',  label: 'Not reviewed', medScale: null, examples: 'medicine, supplement, and topical-product warnings have not been reviewed' },
  { key: 'none',     label: 'None',      medScale: 1.0,  examples: '' },
  { key: 'mild',     label: 'Possible',  medScale: null, examples: 'a medicine or topical product with a possible sunlight warning' },
  { key: 'moderate', label: 'Known warning', medScale: null, examples: 'a medicine labeled for photosensitivity or sun precautions' },
  { key: 'severe',   label: 'Prior reaction / strong warning', medScale: null, examples: 'a prior phototoxic/photoallergic reaction or clinician-directed strict avoidance' },
];

// Map tier key to a multiplier. Non-numeric caution tiers intentionally
// return null so callers keep the base estimate and explain the uncertainty.
export function photosensitiveMedScale(tier) {
  const t = PHOTOSENSITIVE_MED_TIERS.find(x => x.key === tier);
  return t ? t.medScale : null;
}

// Normalize legacy boolean photosensitiveMeds storage into a tier key.
// boolean true → 'moderate' for legacy caution display; it no longer implies
// a universal numeric threshold reduction.
export function _normalizePSMTier(raw) {
  if (raw === true) return 'moderate';
  if (raw === false) return 'none';
  if (raw == null || raw === '') return 'unknown';
  if (typeof raw === 'string' && PHOTOSENSITIVE_MED_TIERS.some(t => t.key === raw)) return raw;
  return 'unknown';
}

// Standard quick-presets for the speed log. Fractions reflect a SINGLE
// position (front-only OR back-only at any one moment) — capped at the
// anatomical max of ~0.55. Use the in-session Side change button at the
// moment of turning to record a boundary between timed segments; rotation
// itself never multiplies a dose.
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

// Posture options surfaced in pickers + applied as a multiplier on the
// effective body fraction.
export const POSTURE_OPTIONS = [
  { key: 'standing',     label: 'Standing / walking' },
  { key: 'sitting',      label: 'Sitting / reclined' },
  { key: 'lying-supine', label: 'Lying face-up' },
  { key: 'lying-prone',  label: 'Lying face-down' },
];

// Posture orientation multipliers on bodyExposureFraction. Lying-supine
// makes the front of the body nearly horizontal at noon; lying-prone same
// for back. These are rough but match the hydrated-session dose path.
export const POSTURE_MULTIPLIERS = {
  standing: 1.0,
  sitting: 0.85,
  'lying-supine': 1.4,
  'lying-prone': 1.4,
};

// Surface albedo dropdown values — UV reflection from below augments
// total received irradiance by ~(albedo × 0.5). See SURFACE_ALBEDO.
export const SURFACE_OPTIONS = [
  { key: 'grass',    label: 'Grass / dirt (~3% reflect)' },
  { key: 'concrete', label: 'Concrete / pavement (~10%)' },
  { key: 'sand',     label: 'Sand (~25%)' },
  { key: 'water',    label: 'Water / pool (~25%)' },
  { key: 'snow',     label: 'Snow / ice (~80%)' },
];

// Surface albedo (UV reflectance). 0.25 = sand/water; 0.80 = fresh snow.
export const SURFACE_ALBEDO = {
  grass: 0.03,
  concrete: 0.10,
  sand: 0.25,
  water: 0.25,
  snow: 0.80,
};
