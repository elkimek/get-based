# AI Verdicts

Every surface in the **Light & Sun** module has an AI verdict that synthesizes the data into a one-sentence read with a colored dot, a longer paragraph of context, and (when relevant) concrete next-step actions. Ten verdict surfaces auto-fire when you have data; the verdicts elsewhere in the app are described in [AI elsewhere in the app](#ai-elsewhere-in-the-app) below.

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

All ten Light & Sun verdicts auto-fire when you have data — no buttons to remember. Each one has a manual ↻ refresh on the verdict block if you want a fresh read.

### Per-event verdicts (fire after a discrete action)

- **Sun session row** — fires when you tap *Stop & save* on a sun session, or log a completed session after the fact. Lives at the bottom of each session row + at the top of the session detail modal.
- **PBM device-session row** — fires when you stop a live therapy timer or log a finished session on a panel / SAD lamp / dawn simulator / UVB phototherapy. Same placement as sun-session verdicts.
- **Light Tool measurement** — fires when you save any reading from a measurement tool (Lux Meter, Flicker Detector, CCT Meter, Spectrum Classifier, Sleep Darkness, Glass Transmission). Lives below the reading row in the room panel.
- **Audit verdict** — fires when you save a Light Audit (a frozen snapshot of your environment). Appears at the top of the audit detail. A small colored dot also appears in the audit card header for at-a-glance status across multiple audits.
- **Onboarding plan** — fires when you complete the Light & Sun setup card (skin type, eyewear, home lighting, Ott burden audit). Generates a personalized starting plan with three concrete first-week actions. Appears below the saved-setup chips.

### Per-state verdicts (fire on render when you have enough data)

These surfaces don't have a clean "I'm done" trigger — the user is editing chip-pickers, adding rooms, the daily rollup shifts as new sessions land. Pre-2026-05-08 they had a manual *Analyze* button to avoid burning API calls during edit sessions; the per-render auto-fire now uses a fingerprint of the underlying state plus a per-tab-session guard so it fires once per meaningful state shift, not on every keystroke.

- **Light Today daily hero (+ dashboard chip)** — fires the first time you visit the Light & Sun page each day, and re-fires when the cache is stale. Synthesizes your day's full picture (sun + devices + tools + environment + recent biomarker context) into a single verdict at the top of the page. The same verdict appears as a compact chip on the dashboard's Light Today strip.
- **Light Environment room** — auto-fires when a room has a primary source set OR at least one measurement. Empty rooms skip auto-fire so a freshly-added blank room doesn't burn an API call before you finish editing. Lives inside the room's expanded body.
- **Per-screen** — auto-fires when a device type is set (default 'phone'). Lives inside the expanded screen card.
- **Indoor-burden summary** — auto-fires when you have at least one room or screen mapped. Lives at the top of the Light Environment block (above the audit list).
- **Channel-mix synthesis** — auto-fires when at least one channel has non-zero exposure in the rolling 7 days. Brand-new users with no logs skip until they have data worth interpreting. Lives in the "Your light, by what it does" section.

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

## AI elsewhere in the app

The ten Light & Sun verdicts above are one corner of the app's AI surface. Other places AI runs (each requires a configured provider):

| Surface | Where | What it does |
|---|---|---|
| **AI chat panel** | Bottom-right slide-out, every page | Free-form conversation grounded in your full lab data, context cards, supplements, wearables, sun + light, genetics. Streaming, with personalities + thread history. |
| **Interpretive Lens** | Dashboard top, "Lens" pill | Routes a focused query through your knowledge base (research papers, notes, books) — uses the on-device transformers.js RAG by default, or an external server you configure. |
| **Context-card AI dots** | Dashboard cards (Health Goals, Diet, Exercise, Sleep, Light & Circadian, Stress, Love Life, Environment, Medical Conditions) | One-shot health-dot + 8-word tip per card, summarizing whether the card's filled-in content is supporting or undermining your stated health goals. Manual ↻ refresh. |
| **Onboarding chat wizard** | First-time visitors, before any data | A 5-stage AI-driven setup flow (profile → API key → extras → context cards → has-data nudge). Uses a small system prompt; runs on whatever provider the user just configured. |
| **PDF lab import** | Import flow when you drop a PDF | Extracts text → obfuscates PII (regex or local-AI streaming sanitizer) → AI parses lab values + maps to schema markers. Custom markers auto-suggested for unknowns. |
| **Custom-marker suggestion** | Sidebar "+ Add marker" → from-PDF path | When a parsed value can't be matched to an existing marker, AI suggests a key + name + unit + reference range based on the PDF context. |
| **Light & Sun setup AI** | Setup card on first /light visit | Generates a personalized starting plan from your skin type / eyewear / home-lighting answers (technically the same as the "Onboarding plan" verdict listed above — included here for cross-reference). |

## Caching, privacy, and what the AI sees

- All ten verdicts cache against a fingerprint of the underlying data; if nothing's changed, the cached verdict is returned without a fresh API call.
- The chat panel + Interpretive Lens both pull from `buildLabContext()` — the assembled section block of your full data minus anything you've gated off (e.g., the per-profile "Share body regions in Sun & Light context" toggle in **Settings → AI**, which keeps coverage % and presets in but strips the anatomical region list).
- Custom-marker creation, manual-value entry, sidebar edits, and chip-picker changes do NOT trigger AI calls — they update local data and the AI sees the changes on the next chat turn or the next per-state verdict render.

## Related guides

- [Sun Sessions](./sun-sessions) — how outdoor light sessions work
- [Light Environment](./light-environment) — rooms + screens + audits
- [Light Tools](./light-tools) — the measurement tool ecosystem
- [AI Providers](./ai-providers) — how to configure a provider
- [AI Chat](./ai-chat) — the chat panel that complements the per-row verdicts
