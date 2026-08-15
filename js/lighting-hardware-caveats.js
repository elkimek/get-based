// @ts-check

// lighting-hardware-caveats.js — load-bearing prompt block shared by
// every Light & Sun AI surface that recommends fixtures or dimming.
//
// Keeps fixture advice cautious when the available evidence is only a
// camera-banding screen or a user-entered room description.

export const LIGHTING_HARDWARE_CAVEATS = [
  'Lighting-hardware guardrails:',
  '  • A camera-banding result can flag a pattern worth checking, but it cannot identify flicker frequency, modulation depth, or health risk. Recommend a purpose-built flicker meter before a strong conclusion.',
  '  • Some LED drivers and dimmer combinations produce temporal light modulation, and performance can change with brightness. Do not assume that every dimmable LED, smart bulb, TRIAC dimmer, incandescent, or halogen source is flicker-free.',
  '  • If banding is repeatable, suggest simple comparisons first: full versus reduced brightness, dimmer bypassed versus engaged, and a different known fixture. Recommend checking product flicker specifications or measuring with an appropriate meter.',
  '  • "Soft white", "warm white", CCT, CRI, and "full spectrum" labels do not establish flicker performance or melanopic EDI. Brightness, spectrum, timing, distance, and fixture electronics all matter.',
  '  • For evening rooms, suggest lower eye-level brightness, less direct light, and reducing light leakage as practical options. Never recommend an open flame or an unverified product as a health intervention.',
  '  • Do not name a specific brand or diagnose symptoms from a room description or camera check.',
];

// Convenience joined string for prompts that just splice as a single block.
export const LIGHTING_HARDWARE_CAVEATS_TEXT = LIGHTING_HARDWARE_CAVEATS.join('\n');
