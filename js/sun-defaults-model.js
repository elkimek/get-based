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
  { key: 'VI',  label: 'VI — rarely burns, deeply pigmented (UV damage is still possible)' },
];

export const FITZPATRICK_DESCRIPTOR = [
  'always burns, never tans',
  'usually burns, tans minimally',
  'sometimes burns, tans gradually',
  'rarely burns, tans easily',
  'very rarely burns, tans deeply',
  'rarely burns; UV damage is still possible',
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
  { key: 'unknown', label: 'Not reviewed', sub: 'Check medicine, supplement, and topical-product labels' },
  { key: 'none', label: 'No known warning', sub: 'No sunlight or photosensitivity warning known' },
  { key: 'mild', label: 'Possible warning', sub: 'A product may increase sunlight sensitivity' },
  { key: 'moderate', label: 'Known warning', sub: 'A label or clinician advises sun precautions' },
  { key: 'severe', label: 'Prior reaction', sub: 'Prior phototoxic/photoallergic reaction or strict avoidance advice' },
];

// Each "yes" records a timing or spectrum-context pattern. This is an
// educational context map, not a validated clinical scale: several items have
// strong circadian support, while the ocular-UV/POMC item remains preclinical.
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
  { key: 'morning-light-deficit',    text: 'Do you usually get little or no outdoor daylight in the first 1–2 hours after waking?',
    why: 'Morning light can help anchor circadian timing; the response depends on timing, intensity, duration, schedule, and individual sensitivity.' },
  { key: 'glass-mediated-daytime',   text: 'Do you spend most of your daytime hours behind window glass (office, home, car)?',
    why: 'Ordinary glass strongly reduces UVB and alters UVA and visible-light transmission; daylight at the eye is also usually much dimmer indoors than outdoors.' },
  { key: 'dim-workspace',            text: 'Is your daytime workspace dim, with little daylight, for much of the day?',
    why: 'Brighter daytime light supports day–night contrast. Ordinary lux and bulb color are only rough proxies for melanopic light at the eye.' },
  { key: 'cool-led-evening',         text: 'Is your evening light both bright and cool / blue-enriched for long periods?',
    why: 'Circadian response depends on intensity, spectrum, duration, and timing—not color temperature alone.' },
  { key: 'evening-screens',          text: 'Do you regularly use bright screens (phone, laptop, TV) in the 2 hours before bed?',
    why: 'Controlled studies show that prolonged, bright evening screen exposure can delay circadian timing; device, brightness, distance, and duration matter.' },
  { key: 'bright-after-sunset',      text: 'Do you keep bright room or overhead lights on during the 3 hours before intended sleep?',
    why: 'Bright evening light can delay biological night. The effect depends on melanopic light at the eye and personal timing.' },
  { key: 'sleep-not-dark',           text: 'Does light reach your eyes while you sleep (room light, streetlight, or a nearby screen)?',
    why: 'A dark sleep environment supports biological night; laboratory findings under room light do not mean every tiny indicator light causes metabolic harm.' },
  { key: 'sunscreen-blocks-uvb',     text: 'Do you apply sunscreen on most sun-exposed days, including brief outdoor time?',
    why: 'Sunscreen deliberately filters UV; spectrum and transmission vary by formulation and application. Record it for skin-dose modeling—not as a reason to extend exposure or remove protection.' },
  { key: 'sunglasses-outside',       text: 'Do you wear sunglasses outdoors more often than not?',
    why: 'Eyewear changes the spectrum reaching the eye. Ocular-UV activation of POMC / α-MSH has been shown in mice; a human skin-protection effect is unproven, so eye safety takes priority.' },
  { key: 'low-outdoor-time',         text: 'Is your total outdoor time under 30 minutes on a typical day?',
    why: 'Outdoor light is usually far brighter than indoor light. This cutoff is a simple habit screen, not a biological threshold or diagnosis.' },
];

export function photosensitiveTierOf(raw) {
  if (raw === true) return 'moderate';
  if (raw === false) return 'none';
  if (raw == null || raw === '') return 'unknown';
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

// Higher scores mean more context patterns selected. The tiers only organize
// the educational review; they are not a health, risk, or alignment grade.
export function ottScoreToLabel(score) {
  if (typeof score !== 'number') return { label: '—', tier: 0 };
  if (score === 0) return { label: 'no patterns selected', tier: 0 };
  if (score <= 3) return { label: 'a few patterns to explore', tier: 1 };
  if (score <= 5) return { label: 'several patterns to explore', tier: 2 };
  if (score <= 7) return { label: 'many patterns to review', tier: 3 };
  return { label: 'broad light-context mismatch', tier: 4 };
}

export const lightBurdenToLabel = ottScoreToLabel;
