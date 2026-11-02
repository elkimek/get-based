// Pure shared region vocabulary; picker exports remain stable.
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
