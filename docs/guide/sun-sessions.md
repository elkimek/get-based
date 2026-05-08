# Sun Sessions — Track Your Photobiology

Sun isn't just vitamin D. Different parts of sunlight do different things — set your body clock, support circulation, charge your mitochondria, regulate mood-hormones. The **☀ Light & Sun** lens tracks your light exposure across six biological channels and lets you correlate them with your labs and wearable data over time.

## Six channels, one biology

| Channel | What it does | Spectrum |
|---|---|---|
| **Vitamin D** | UVB on bare skin makes vitamin D. Stops increasing around the point your skin starts to redden — longer is not better. | UVB 290–315 nm |
| **Mood & hormones** | Sun on skin triggers a hormone cascade — α-MSH (the tan signal), β-endorphin (mood), ACTH (stress response). Part of why sun feels good. | UVB + UVA |
| **Cardiovascular** | UVA from skin releases nitric oxide — supports blood-vessel function, lowers blood pressure, improves circulation, dampens inflammation. | UVA 315–400 nm |
| **Outdoor eye light** | Outdoor 360–400 nm hits sensors in eye and skin. Linked to eye health and dopamine release — the difference between "outside" and "window light" even when both feel bright. | Violet 360–400 nm |
| **Body clock** | Bright light at the eye sets your circadian rhythm — earlier bedtime, faster wake-up, deeper sleep. Strongest effect in the first 2 hours after sunrise. | Blue ~490 nm (melanopic peak) |
| **Cellular repair** | Solar 600–1400 nm penetrates deep into tissue and reaches mitochondria. Supports recovery, raises local melatonin in cells, reduces inflammation. The half of sunlight that windows block. | Red + IR-A 600–1400 nm |

Each channel is qualitative — **none / low / moderate / good / strong** — based on how your accumulated dose compares to a literature-rough target. The dashboard "Light Today" strip scores against the daily target; the "Your light, by what it does" section scores the 7-day rollup against a 7×daily target so a weekly view doesn't get unfairly downgraded. We deliberately don't show raw numbers; the AI sees them but you don't have to.

## Logging a session

**One-tap quick log** is the primary flow:

1. Going outside? Tap **☀ Log a sun session** (on the Light Today strip or the Light & Sun page).
2. Coming back inside? Tap the same button — now labelled "⏹ Stop session — N min".

That's it. The app pulls the actual UV index and ozone for your location, reconstructs the spectrum at your zenith angle, and computes your per-channel doses on the spot.

**Quick-log defaults** are inherited from your last session. Want different exposure or eyewear? See "Adjust before starting" below.

### Going for a 30-second setup first

When you open the Light & Sun page for the first time, an onboarding card asks four quick questions plus an optional 10-question malillumination baseline:

- **Skin type** (Fitzpatrick I–VI) — used to scale your personal sunburn threshold
- **Home lighting** — LED cool, LED warm, fluorescent, incandescent, mixed
- **Eyewear outside** — none, sunglasses, clear glasses, both, contacts-with-UV-block
- **Location precision** — your country (from profile) is the default; tap "Use precise location" for sharper UV math (one-time)
- **Photosensitizing medication checkbox** — if you take tetracyclines, isotretinoin, amiodarone, thiazides, NSAIDs, St. John's Wort, or similar, your burn threshold drops ~2.5×
- **Light-burden audit (optional, 10 yes/no questions)** — captures how indoor / glass-mediated / artificial-light-dominated your modern life is

Answers stay on your device. The AI uses them as a baseline ("your low body-clock channel makes sense given your light-burden score of 8/10").

## Burn-risk safety

The Light Today strip and the Light & Sun page show **today's burn risk** in plain English:

- **Safe** — under 30% of your skin's daily threshold
- **Moderate** — 30–70%
- **Approaching** — 70–100% (cover up if you go back out)
- **Reached** — over 100% (sunburn risk, no more direct sun today)

This is computed from each session's CIE-erythemal-weighted dose vs your Fitzpatrick threshold. We never recommend sun-gazing — direct retinal UV is tracked separately as a safety counter.

## Light therapy devices

Got a red-light therapy panel, a SAD lamp, a UVB lamp, a dawn simulator, or a full-spectrum bulb? Add it from the **My light devices** section on the Light & Sun page. We ship a 19-preset library (Chroma, EMR-Tek, Mitochondriak). For other brands (Joovv, Mito Red, Sperti, Verilux, Lumie, etc.) paste the spec sheet into the custom-device dialog and the AI extractor maps wavelength + irradiance into the same schema.

Therapy device sessions feed the same per-channel dose totals as outdoor sun. A user with no outdoor time but a daily PBM routine still sees the **Cellular repair** channel light up — and the AI sees them too (the always-tier prompt now includes device-only users, and the rolling correlation engine includes the two PBM channels (660 nm red / 810-850 nm NIR) so device-heavy users get device × biomarker correlations surfaced).

## Light environment

Most users spend 8–14 hours/day under indoor lights. The **Light environment** section maps your rooms (LED type, hours/day, after-sunset use) and your screens (device, hours/day, evening use, blue-blocker). Indoor light is the dominant exposure for many; tracking it lets the AI see your full day.

## Light tools (on-device)

Eight measurement utilities, all running fully in your browser:

- **📏 Lux Meter** — uses your phone's ambient-light sensor when available, camera-based estimate otherwise
- **⚡ Flicker Detector** — your camera at 240 fps catches LED PWM banding; we compute a 0–3 risk score
- **🎨 Color Temp** — tells you your indoor CCT and whether it matches the solar time
- **🔬 What is this light?** — classifies the source as fluorescent / cool LED / warm LED / incandescent / daylight
- **🪟 Glass Transmission** — measure inside and outside, see how much your window blocks
- **🌙 Sleep Darkness** — long-exposure read at the pillow, tells you if the bedroom is dark enough for full melatonin
- **🌅 Golden hour log** — one-tap session entry for sunrise / sunset
- **👁 Eye-level audit** — continuous capture as you walk through your home; one tap per room populates the entire Light Environment

Camera frames never leave your device.

## Where the data flows

- **AI chat** — every chat carries a Light & Sun summary: your active deficits, your devices, your week's per-channel exposure (sun + devices combined), and your skin's daily sunburn budget. Once you have ≥4 weeks of overlapping sessions and labs, channel-by-biomarker correlations join the standard tier.
- **Detail-modal overlays** *(in development)* — toggle a sun-channel layer on biomarker detail charts to see the dose-vs-marker relationship visually.
- **Wearables strip** — sun and wearables sit side-by-side on the dashboard; the AI sees both.
- **Genetics** — your DNA-aware AI prompts already factor in VDR, MC1R, CYP2R1, GC, NPAS2, CRY2, PER3 polymorphisms when relevant.

## Privacy posture

- Lat/lon defaults to your **country** from your profile — no automatic geolocation prompt at session start
- Optional one-time precise-location upgrade is stored locally in this device's profile; never synced
- UV/ozone data — pick your **Sun data source** on the Light & Sun page itself. Four options:
  - **Default** — CAMS atmospheric forecast (real KNMI-validated total column ozone + AOD + PM₂.₅/PM₁₀) merged with Open-Meteo for clouds, temperature, and a baseline UVI
  - **Open-Meteo only** — skip CAMS entirely; one fewer upstream sees your lat/lon
  - **Self-hosted** — run your own `getbased-uvdata` server (the CAMS relay code is open source) and point the app at it; lat/lon never leaves your infrastructure
  - **Manual / UV meter** — type the UV index per session; no network calls at all
- **Source confidence** is computed per request: snapshot age, cloud cover, sun elevation, UVI band, and stale flag all discount the displayed percentage. A reading at low sun under heavy cloud honestly drops to ~40%, even from CAMS — no false precision
- All measurements (lux, flicker, CCT, etc.) live in `importedData.lightMeasurements` on this device
- Camera frames and sensor readings are processed in-browser and discarded — they never reach a server

## Honest caveats

- **Channel doses are proxies, not measurements.** We integrate published action spectra (CIE 174:2006 previtamin-D3, CIE S 007 / ISO 17166 erythemal (McKinlay-Diffey 1987), CIE S 026:2018 melanopic, cytochrome-c-oxidase bands from Karu/Hamblin, etc.) over a clear-sky-reconstructed solar spectrum (Bird-Riordan 1986). Real-world variance is ±25% relative.
- **Lux meter is calibrated approximately.** AmbientLightSensor readings are accurate; camera-based readings have a one-time calibration multiplier in localStorage and label themselves as "estimate" in AI confidence.
- **Burn-risk model is conservative** and uses a 1.5× hard cap with explicit override warnings. We never recommend exceeding your personal threshold.
- **No medical advice.** This is measurement, not prescription. Consult a healthcare professional for any concern.

## In-session controls

When a session is running, the Light & Sun page pins a **Live** card at the top with these controls:

- **⏸ Pause** — freezes dose accrual during a shade break (timer keeps ticking; toggle to resume)
- **🔄 Flip** — tap when you turn over front↔back. The region picker is anatomically scoped to a single side at a time (selecting every region is ~50% of total skin since front + back are exclusive); flipping doubles the vit-D yield to acknowledge that fresh skin keeps synthesizing after the first side approaches saturation. Same convention dminder uses for "both sides over the session"
- **🧴 Sunscreen** — log a mid-session reapplication; commits the slice computed under the OLD SPF, then continues with the new value
- **🛰 Ozone** — manual override of the total-column DU figure if you have a meter or local advisory

Detailed sessions also support a **per-region silhouette picker** — toggle individual anatomical regions for targeted-UV protocols (face only, abdomen only, etc.).

## What's coming

- **Spectral overlay on biomarker charts** — see channel × marker visually, not just in chat
- **Phase-2 air-quality fields from CAMS** — NO₂ / SO₂ / CO / surface ozone via the regional CAMS-Europe dataset (currently sourced from Open-Meteo's AQI endpoint, which already wraps CAMS for these)
