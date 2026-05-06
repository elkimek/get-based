// lighting-hardware-caveats.js — load-bearing prompt block shared by
// every Light & Sun AI surface that recommends fixtures or dimming.
//
// Without this, the model cheerfully suggests "dimmable LED" as the fix
// for a room with measured flicker — except dimmable LEDs are the #1
// source of household PWM flicker, so the recommendation IS the cause.
// One block, one import, every prompt stays consistent.

export const LIGHTING_HARDWARE_CAVEATS = [
  'Lighting hardware caveats (load-bearing — never violate when recommending fixtures):',
  '  • DIMMABLE LEDs are the #1 source of household PWM flicker. The cheap path to LED dimming is pulse-width modulation, which is exactly what flicker scoring measures. NEVER recommend a generic "dimmable LED" — especially on a room or measurement where flicker is already flagged 1+. If dimming is truly required, recommend the CATEGORY (e.g. "DC-dimmable LED" or "high-frequency-PWM driver, >2 kHz") or describe the qualifier the user should look for ("flicker-free, CCR-dimmable, or filament-style at fixed low warmth 2000–2400K"). NEVER name a specific brand or product in your tip or detail — categories only.',
  '  • TRIAC wall dimmers + LED bulb is the worst-case combination — the dimmer chops the AC waveform and the LED driver re-clamps it, often producing visible AND invisible flicker even on bulbs labelled "dimmable."',
  '  • Smart bulbs typically dim via PWM internally — measure before assuming they\'re flicker-free at low brightness. Some premium tunable lines from established lighting brands handle low brightness without visible flicker; many cheaper smart bulbs do not.',
  '  • If flicker is 1+, prefer NON-DIMMING fixes: swap a cool bulb for a warm fixed-output bulb, install multiple lower-wattage warm bulbs on separate switches (so "dim" is achieved by turning off some), use candles / salt lamps for the lowest evening setting, or specify INCANDESCENT / HALOGEN as the bedside fixture (no flicker, full spectrum, dimmable without PWM).',
  '  • "Soft white" / "warm white" labels are color-temperature claims (typically 2700-3000K) and say NOTHING about flicker, CRI, or melanopic content. Don\'t treat the label as a flicker fix.',
  '  • "Tunable" LEDs typically blend two LED dies (warm + cool) at the same brightness. Setting them to "warm" reduces blue but does NOT make them dim; pairing with a dimmer reintroduces PWM.',
  '  • For sleep rooms specifically, the strongest fix is usually source REPLACEMENT (warm + low-wattage + non-dimming) + LIGHT-BLOCKING (blackout curtains, taping LED indicators on chargers/clocks), not dimmer installation.',
];

// Convenience joined string for prompts that just splice as a single block.
export const LIGHTING_HARDWARE_CAVEATS_TEXT = LIGHTING_HARDWARE_CAVEATS.join('\n');
