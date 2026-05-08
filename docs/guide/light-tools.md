# Light Tools

Eight on-device measurement utilities. All processing runs in your browser — camera frames and sensor data never leave your phone.

| Tool | What it does | Best for |
|---|---|---|
| 📏 Lux Meter | Live brightness in lux | Setting up a workspace, comparing rooms, verifying outdoor exposure |
| ⚡ Flicker Detector | PWM banding detection at 240 fps + risk score | Identifying problem bulbs and screens |
| 🎨 Color Temp | Live CCT estimate + solar coherence check | Catching evening blue-light contamination |
| 🔬 What is this light? | 5-category classifier | Auto-filling room surveys |
| 🪟 Glass Transmission | Inside-vs-outside ratio + UV transmission estimate | Auditing windows and windshields |
| 🌙 Sleep Darkness | Long-exposure pillow check | Bedtime sanity check before sleep |
| 🌅 Golden hour log | One-tap sunrise / sunset session | Capturing routine outdoor light |

## Tool 1 — Lux Meter

Measures ambient brightness in lux. Uses your phone's **AmbientLightSensor API** when available (Chrome on Android), with a camera-based fallback for everything else.

Zone color-coding:

- 0–10 lux: **darkness** (full night)
- 10–100: **low indoor** (dim room)
- 100–500: **office** (computer work, well-lit room)
- 500–1000: **bright indoor**
- 1000–10000: **overcast outdoor**
- 10000–100000: **outdoor daylight**
- 100000+: **direct sun**

Calibration: the camera fallback uses a multiplier stored in localStorage. Defaults to 1.0; readings within ±30% of a reference meter on most modern phones. Fix it later if you have a calibrated reference light meter.

## Tool 2 — Flicker Detector

Aim your camera at a light source. Live preview shows banding patterns if the light is flickering. Flicker comes from **pulse-width-modulation (PWM)** dimming common in LEDs and fluorescents.

After ~5 seconds of capture, you get:

- A **score** (0 = flicker-free, 3 = heavy flicker)
- An **estimated PWM frequency** in Hz (via zero-crossing on the detrended intensity signal)
- A plain-English label ("Flicker-free" / "Mild, likely OK for most" / "Visible flicker — eye-strain risk" / "Heavy flicker — replace this light")

Risk thresholds map to **IEEE Std 1789-2015** recommended-practice thresholds for LED current modulation.

## Tool 3 — Color Temp

Aim at a white wall, paper, or a printable grey card. Live CCT estimate in Kelvin — 1800K (candle) up to 6500K+ (overcast / daylight). Uses RGB white-balance ratios.

The **solar coherence indicator** compares your indoor CCT to the rough solar CCT for the current hour:

- ✓ **matches solar time** — within 800 K
- **slight mismatch**
- ⚠ **mismatch** — your indoor light is fighting the sun's signal (e.g. 4000K cool LED at 9 pm when the sun has set hours ago)

## Tool 4 — What is this light?

Single-tap classifier. RGB ratio + flicker variance signature → one of five categories:

- **Fluorescent / CFL** — high flicker variance + green spike
- **Incandescent / halogen** — red-rich, low blue
- **Cool LED (4000K+)** — blue-rich, near-flicker-free
- **Warm LED (2700–3000K)** — slight red lift, near-flicker-free
- **Daylight or full-spectrum** — balanced RGB

Confidence is shown alongside the result.

## Tool 5 — Glass Transmission

Measures how much light your window blocks. Two-step flow:

1. **Inside** — point your phone through the glass at the brightest part of the sky
2. **Outside** — same direction, no glass between you and the sky

The app computes the transmission ratio. Most modern Low-E coated glass blocks 80–90% of UV and 30–50% of visible light. Tinted automotive glass blocks even more.

This tool gives you a real number for the "windows kill the cellular-repair channel" claim — and lets the AI factor your specific glass into your indoor exposure estimates.

## Tool 6 — Sleep Darkness

Place your phone face-up where your eyes will be when you sleep. Lights as you'll sleep. Hit Start. The tool runs a 30-second long-exposure read.

Status:

- **<0.3 lux** — excellent, true darkness
- **0.3–1 lux** — good, minor light leak, melatonin mostly preserved
- **1–5 lux** — light leak detected, ~20–30% melatonin attenuation
- **>5 lux** — bright, melatonin amplitude significantly suppressed

If you're not sleeping well and you score high, your room is the first thing to fix.

## Tool 7 — Golden hour log

One-tap session log for sunrise / sunset. The most circadian-effective outdoor time most users get. Auto-labels the window (Sunrise / Sunset / Golden hour) by current hour. Pre-fills face+hands exposure with direct eye exposure for ~15 min.

## Tool 8 — Eye-level audit

A 10-minute room walkthrough that populates rooms in the Light Environment in one pass. The camera streams at 4 fps, detects when you've paused in a room (5 s of stillness), and captures a lux reading at eye level. Walk through every room, label each pause with the room name on the after-walk panel, and tap **Done** — labelled pauses are saved as `tool='lux'` measurements bound to a matching room (auto-creating one when no match exists). Unlabelled pauses are kept inside the bulk audit record so you can review them later.

Tool 8 captures **lux only** (not CCT or full spectrum) — the goal is fast room-coverage, not depth. For richer single-room data (CCT, flicker, sleep darkness) open the dedicated tool from the room card after the walkthrough lands.

## Calibration (lux meter)

The camera fallback's accuracy is good enough for relative comparisons (room A vs room B, today vs last week) but treat absolute lux readings as ±30% estimates unless you've replaced the localStorage `labcharts-lux-calibration` factor with a known reference (a real lux meter, a phone with a calibrated AmbientLightSensor, or a grey-card test against a published illuminance value).

## Privacy

Every tool is in-browser. `getUserMedia` requests camera permission, processes frames locally, and releases the camera when the tool closes. AmbientLightSensor readings are local-only. Saved measurements live in `importedData.lightMeasurements` on this device — they sync via Evolu CRDT only if you've enabled cross-device sync, and the sync payload is end-to-end encrypted.
