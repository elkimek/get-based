// lighting-hardware-caveats.js — load-bearing prompt block shared by
// every Light & Sun AI surface that recommends fixtures or dimming.
//
// Without this, the model cheerfully suggests "dimmable LED" as the fix
// for a room with measured flicker — except dimmable LEDs are the #1
// source of household PWM flicker, so the recommendation IS the cause.
// One block, one import, every prompt stays consistent.

export const LIGHTING_HARDWARE_CAVEATS = [
  'Lighting hardware caveats (load-bearing — never violate when recommending fixtures):',
  '  • DIMMABLE LEDs are the #1 source of household PWM flicker. The cheap path to LED dimming is pulse-width modulation, which is exactly what flicker scoring measures. NEVER recommend a generic "dimmable LED" — especially on a room or measurement where flicker is already flagged 1+. If dimming is truly required, the qualifier MUST be "flicker-free / DC-dimmable / high-frequency-PWM (>2 kHz)" — products in this category include: Waveform Lighting A19, Yuji VTC, Soraa Vivid, true CCR-dimmable drivers, or quality Edison-style filament LEDs at fixed low warmth (2000-2400K).',
  '  • TRIAC wall dimmers + LED bulb is the worst-case combination — the dimmer chops the AC waveform and the LED driver re-clamps it, often producing visible AND invisible flicker even on bulbs labelled "dimmable."',
  '  • Smart bulbs (Hue, LIFX, etc.) typically dim via PWM internally — measure before assuming they\'re flicker-free at low brightness. Hue White Ambiance + Filament are usually OK; many cheaper smart bulbs are not.',
  '  • If flicker is 1+, prefer NON-DIMMING fixes: swap a cool bulb for a warm fixed-output bulb, install multiple lower-wattage warm bulbs on separate switches (so "dim" is achieved by turning off some), use candles / salt lamps for the lowest evening setting, or specify INCANDESCENT / HALOGEN as the bedside fixture (no flicker, full spectrum, dimmable without PWM).',
  '  • "Soft white" / "warm white" labels are color-temperature claims (typically 2700-3000K) and say NOTHING about flicker, CRI, or melanopic content. Don\'t treat the label as a flicker fix.',
  '  • "Tunable" LEDs typically blend two LED dies (warm + cool) at the same brightness. Setting them to "warm" reduces blue but does NOT make them dim; pairing with a dimmer reintroduces PWM.',
  '  • For sleep rooms specifically, the strongest fix is usually source REPLACEMENT (warm + low-wattage + non-dimming) + LIGHT-BLOCKING (blackout curtains, taping LED indicators on chargers/clocks), not dimmer installation.',
];

// Convenience joined string for prompts that just splice as a single block.
export const LIGHTING_HARDWARE_CAVEATS_TEXT = LIGHTING_HARDWARE_CAVEATS.join('\n');
