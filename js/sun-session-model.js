// sun-session-model.js — shared Sun session option and safety model.
//
// Keep these constants out of UI/store modules so the active-session ticker,
// persisted session store, and public sun.js facade all use one source.

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
