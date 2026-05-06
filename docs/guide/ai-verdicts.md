# AI Verdicts

Every surface in the **Light & Sun** module has an AI verdict that synthesizes the data into a one-sentence read with a colored dot, a longer paragraph of context, and (when relevant) concrete next-step actions. Eleven verdict surfaces in total. Some fire automatically when you complete an action; others are one-click manual analyses.

## What you see

A verdict consists of:

- **A colored dot** — green / yellow / red / gray (more on these below)
- **A tip** — one sentence (≤14–18 words) summarizing the verdict
- **A detail** — 1–4 sentences of context citing your specific numbers and the biology behind them
- **A refresh button (↻)** — re-runs the analysis with a fresh API call

Dots:

| Dot | Meaning |
|---|---|
| 🟢 green | On-protocol — the surface is doing what your goals say it should |
| 🟡 yellow | Mostly OK with one or two specific gaps to address |
| 🔴 red | Counterproductive or unsafe in the context of your goals |
| ⚪ gray | Not enough data to judge |

## Where verdicts appear

### Auto-fire surfaces (verdict appears with no click)

These verdicts run when you complete a clear "I'm done" action — saving a session, finishing a setup, etc. — so the answer is there when you next look.

- **Sun session row** — fires when you tap *Stop & save* on a sun session, or log a completed session after the fact. Lives at the bottom of each session row + at the top of the session detail modal.
- **Light Device session row** — fires when you log a session on a therapy panel / SAD lamp / dawn simulator / UVB phototherapy. Same placement.
- **Light Tool measurement** — fires when you save any reading from a measurement tool (Lux Meter, Flicker Detector, CCT Meter, Spectrum Classifier, Sleep Darkness, Glass Transmission). Lives below the reading row in the room panel.
- **Audit verdict** — fires when you save a Light Audit (a frozen snapshot of your environment). Appears at the top of the audit detail. A small colored dot also appears in the audit card header for at-a-glance status across multiple audits.
- **Light Today daily hero** — fires the first time you visit the Light & Sun page each day. Synthesizes your day's full picture (sun + devices + tools + environment + recent biomarker context) into a single verdict at the top of the page. The same verdict also appears as a compact chip on the dashboard's Light Today strip.
- **Onboarding plan** — fires when you complete the Light & Sun setup card (skin type, eyewear, home lighting, Ott burden audit). Generates a personalized starting plan with three concrete first-week actions. Appears below the saved-setup chips.

### Manual-trigger surfaces (one-click button)

These surfaces aggregate or sit in flows where you might edit many fields in a row. Auto-firing on every chip click would burn API calls during initial setup, so they're explicit one-click instead.

- **Light Environment room** — analyzes a room's circadian-friendliness from its primary source + occupancy + measurements + screens. Click **Analyze room** in the room's expanded body.
- **Per-screen** — analyzes a screen's circadian impact (phone, tablet, laptop, monitor, TV, e-reader) based on hours, evening use, blue blocker, and room context. Click **Analyze screen** in the expanded screen card.
- **Indoor-burden summary** — synthesizes your live mix of rooms + screens + occupancy across all surfaces. Click **Get AI verdict** at the bottom of the Light Environment block.
- **Channel-mix synthesis** — reasons across all six biological channels (vitamin D, circadian, NIR, NO/CV, POMC, violet-eye) at once and recommends a single multi-channel-efficient action. Click **Get AI synthesis of your mix** in the "Your light, by what it does" section.

## Caching and force-refresh

Every verdict is cached against a fingerprint of the underlying data. If the data hasn't changed, the cached verdict is returned without a fresh API call — the refresh button (↻) is also a no-op in that case (preserves your verdict text + saves the API call).

When the data has changed (you edited a room, logged a new session, completed a measurement), the fingerprint mismatch invalidates the cache. The next render shows a "refresh AI verdict — your setup changed" CTA.

## Cross-device sync

Verdicts live on the same row as the data they describe — sun-session verdicts on the session row, room verdicts on the room row, and so on. They sync to your other devices via the same per-row CRDT path the rest of your data uses. Latency is typically sub-10 seconds (the engine pushes immediately after writing, skipping the usual debounce).

## What if the verdict seems wrong?

The AI is reasoning over your inputs, including measurement context. A few common failure modes worth knowing about:

- **Webcam at the monitor pointed at you** is fine for the lux meter (it sees the light hitting your face), but it underreads CCT, biases the spectrum classifier toward "warm LED" regardless of actual ceiling source, and attenuates flicker amplitude. The aiming guide inside each tool modal calls this out per-tool. For accurate measurements outside lux, point the camera *at the source* with a phone, not from a fixed position.
- **Cached vs current**: if you edited a room recently and the verdict still references old numbers, the fingerprint should have invalidated and the CTA should say "your setup changed". Click ↻ to regenerate.
- **Brand-name endorsement**: the AI is instructed to never name specific brand products, only categories ("DC-dimmable LED", "incandescent or halogen"). If a verdict mentions a specific product brand, that's a regression — please open an issue.

## Hardware advice

Verdicts that recommend lighting hardware all share a load-bearing prompt block of caveats. The most important: **do not recommend a generic "dimmable LED" as a fix for measured flicker** — most consumer LED dimming uses pulse-width modulation, which IS the flicker source. The recommendation has to qualify ("DC-dimmable", "high-frequency PWM ≥2 kHz", "filament at fixed low warmth") or pivot to a non-dimming fix (multiple low-wattage warm bulbs on separate switches, candles for the lowest evening setting, or true incandescent / halogen for bedside fixtures).

## Provider requirements

Verdicts require an AI provider configured in **Settings → AI**. Supported providers: OpenRouter, PPQ, Routstr, Venice, Local AI (Ollama / LM Studio / Jan), Custom. Cost per verdict is roughly $0.003–0.01 on commercial providers (about 600–1,500 input + 100–300 output tokens). Local AI is free.

## Disabling verdicts

If you want to keep your AI provider configured for the chat panel and Interpretive Lens but pause the per-row verdicts (e.g., during a budget-sensitive month):

```
window.DISABLE_AI_VERDICTS = true
```

Run that in DevTools Console. All eleven surfaces will short-circuit until you remove the flag (or reload — the flag doesn't persist).

## Related guides

- [Sun Sessions](./sun-sessions) — how outdoor light sessions work
- [Light Environment](./light-environment) — rooms + screens + audits
- [Light Tools](./light-tools) — the measurement tool ecosystem
- [AI Providers](./ai-providers) — how to configure a provider
- [AI Chat](./ai-chat) — the chat panel that complements the per-row verdicts
