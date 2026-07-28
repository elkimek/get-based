// @ts-check
// sun-defaults-model.js — Light setup option catalogs and pure mappings.

// Maps the stored Fitzpatrick Roman numeral to the context-card skin label.
export const FITZPATRICK_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export const FITZPATRICK_OPTIONS = [
  { key: 'I',   label: 'I — always burns, never tans (very fair, red/blond hair, freckles)' },
  { key: 'II',  label: 'II — usually burns, tans minimally (fair, light eyes)' },
  { key: 'III', label: 'III — sometimes burns, tans gradually (medium)' },
  { key: 'IV',  label: 'IV — rarely burns, tans easily (olive/Mediterranean)' },
  { key: 'V',   label: 'V — very rarely burns, tans deeply (brown)' },
  { key: 'VI',  label: 'VI — never burns (deeply pigmented)' },
];

export const FITZPATRICK_DESCRIPTOR = [
  'always burns, never tans',
  'usually burns, tans minimally',
  'sometimes burns, tans gradually',
  'rarely burns, tans easily',
  'very rarely burns, tans deeply',
  'never burns, deeply pigmented',
];

export const HOME_LIGHT_OPTIONS = [
  { key: 'led-cool',     label: 'Mostly LED — cool/daylight (4000K+)' },
  { key: 'led-warm',     label: 'Mostly LED — warm white (2700–3000K)' },
  { key: 'led-tunable',  label: 'LED — tunable / color-changing' },
  { key: 'fluorescent',  label: 'Fluorescent / CFL' },
  { key: 'incandescent', label: 'Incandescent (filament)' },
  { key: 'mixed',        label: 'Mixed / multiple types' },
  { key: 'candle',       label: 'Mostly candle / firelight in evening' },
  { key: 'unknown',      label: "I don't know" },
];

export const EYEWEAR_OPTIONS = [
  { key: 'none',          label: 'None (or rarely)' },
  { key: 'sunglasses',    label: 'Sunglasses outdoors' },
  { key: 'clear-glasses', label: 'Clear prescription glasses' },
  { key: 'both',          label: 'Both — sunglasses outside, prescription inside' },
  { key: 'contacts-uv',   label: 'Contacts with UV block' },
];

export const PHOTOSENSITIVE_OPTIONS = [
  { key: 'none', label: 'None', sub: 'No known photosensitizers' },
  { key: 'mild', label: 'Mild', sub: 'Antihistamines or light NSAID use' },
  { key: 'moderate', label: 'Moderate', sub: "NSAIDs, thiazides, sulfa, St. John's Wort, topical retinol" },
  { key: 'severe', label: 'Severe', sub: 'Tetracyclines, oral retinoids, amiodarone, citrus oils on skin' },
];

// Each "yes" is a documented light-environment gap and adds one burden point.
// Reference basis for the ten questions:
//   1. Morning light: Brown et al. 2022 CIE recommendations; Münch et al.
//      JCEM 2017 — outdoor light within about one hour of waking entrains SCN.
//   2. Glass-mediated day: Hattar 2002; window glass blocks nearly all UVB.
//   3. Workspace lux: WELL Building / IES TM-30 daytime melanopic guidance.
//   4. Cool LED at night: Spitschan & Cajochen on melatonin suppression.
//   5. Evening screens: Chang et al. AJCN 2015 on delayed melatonin onset.
//   6. Post-sunset overhead light: Cajochen on circadian phase shifting.
//   7. Light during sleep: Cain et al. JCSM 2020 on overnight sensitivity.
//   8. Sunscreen and UVB: Holick on vitamin-D synthesis wavelengths.
//   9. Outdoor sunglasses: Lambert / Hattar on eye-mediated signaling.
//  10. Outdoor time: Stein et al. on myopia, vitamin D, and circadian amplitude.
export const OTT_QUESTIONS = [
  { key: 'morning-light-deficit',    text: 'Do you get less than 5 minutes of outdoor daylight within an hour of waking?',
    why: 'Morning daylight at the eye sets your central body clock — without it, sleep timing drifts.' },
  { key: 'glass-mediated-daytime',   text: 'Do you spend most of your daytime hours behind window glass (office, home, car)?',
    why: 'Window glass blocks UVB almost entirely — no vitamin D, no nitric-oxide release through the skin.' },
  { key: 'dim-workspace',            text: 'Is your daytime workspace below office-bright (under ~500 lux at eye-level)?',
    why: 'Dim daytime light fails to reinforce the wake signal — the contrast with night collapses.' },
  { key: 'cool-led-evening',         text: 'Are most of your indoor lights after sunset cool / daylight-white (4000K+)?',
    why: 'Cool / blue-rich light after sunset suppresses melatonin even at modest indoor intensities.' },
  { key: 'evening-screens',          text: 'Do you regularly use bright screens (phone, laptop, TV) in the 2 hours before bed?',
    why: 'Backlit screen reading before bed delays melatonin onset by ~90 minutes (Chang et al. AJCN 2015).' },
  { key: 'bright-after-sunset',      text: 'Do you keep overhead room lights on at full brightness after sunset?',
    why: 'Overhead light after sunset shifts your circadian phase and shortens deep sleep.' },
  { key: 'sleep-not-dark',           text: 'Is your bedroom not fully dark while you sleep (LED indicators, streetlight, partner\'s screen)?',
    why: 'Even <5 lux at the pillow degrades overnight insulin sensitivity (Cain et al. JCSM 2020).' },
  { key: 'sunscreen-blocks-uvb',     text: 'Do you apply sunscreen on most sun-exposed days, including brief outdoor time?',
    why: 'Chemical sunscreen above ~SPF 8 blocks the UVB wavelengths required for vitamin D synthesis.' },
  { key: 'sunglasses-outside',       text: 'Do you wear sunglasses outdoors more often than not?',
    why: 'Sunglasses block the eye-mediated α-MSH cascade — your skin and mood lose a key signal.' },
  { key: 'low-outdoor-time',         text: 'Is your total outdoor time under 30 minutes on a typical day?',
    why: 'Under 30 min/day outdoors correlates with low vitamin D, myopia, and a blunted circadian amplitude.' },
];

export function photosensitiveTierOf(raw) {
  if (raw === true) return 'moderate';
  if (raw === false || raw == null) return 'none';
  return String(raw);
}

export function fitzpatrickToSkinTypeIndex(fitzpatrick) {
  return Math.max(0, FITZPATRICK_ROMAN.indexOf(fitzpatrick));
}

export function skinTypeToFitzpatrick(skinType) {
  if (!skinType) return null;
  const match = skinType.match(/^(I{1,3}|IV|VI?)\b/);
  return match ? match[1] : null;
}

// Higher scores mean more indoor-light burden.
export function ottScoreToLabel(score) {
  if (typeof score !== 'number') return { label: '—', tier: 0 };
  if (score <= 1) return { label: 'well-aligned light environment', tier: 0 };
  if (score <= 3) return { label: 'mostly aligned, minor gaps', tier: 1 };
  if (score <= 5) return { label: 'moderate light burden', tier: 2 };
  if (score <= 7) return { label: 'significant light burden', tier: 3 };
  return { label: 'severe indoor-light burden', tier: 4 };
}

export const lightBurdenToLabel = ottScoreToLabel;
