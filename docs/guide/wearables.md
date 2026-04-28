# Wearable Integrations

getbased connects to five wearable / device platforms today and also treats your own **manual entries** as a first-class source. Everything surfaces on one dashboard strip alongside your blood-work data. (WHOOP and Ultrahuman support is built but hidden from the connect list while we validate partner credentials — see [Beta status](#beta-status).)

## What you get

A dashboard strip with a card per metric: HRV, resting heart rate, sleep score, readiness, activity, steps, weight, blood pressure, SpO₂, body-temperature delta, and more. Tap any card for the 90-day chart + statistics + the full list of readings (with per-row delete for manual entries you logged yourself).

If you have more than one source for a metric, tap the small *via {vendor}* badge on a card to choose which one drives the displayed value. You can also **reorder the strip** — tap the ⇄ button in the header → each card gets ◀ ▶ arrows → one click moves that card one slot. Order is saved per-profile.

## Vendors

| Vendor | Auth | Setup |
|---|---|---|
| **Oura** | OAuth 2.0 | One-click. Need an Oura account + ring. |
| **Fitbit** | OAuth 2.0 (PKCE) | One-click. Need a Fitbit account + device. Sleep score is approximated from `efficiency` (Fitbit's API doesn't expose the in-app Sleep Score). |
| **Withings** | OAuth 2.0 | One-click. Need a Withings account + scale / BPM / ScanWatch / Body Scan. Surfaces every metric your hardware produces — weight, BP, body composition (body fat %, fat mass, muscle, lean, bone, water, visceral fat), vascular health (PWV, vascular age, cardio fitness), temperature (body, skin), SpO₂, nerve health, and the full sleep architecture (deep/light/REM/awake durations, average HR + breathing rate, snoring, apnea-class disturbance). Cards auto-hide if your device doesn't measure that signal. |
| **Polar** | OAuth 2.0 | One-click. Need a Polar account and **at least one device sync to Polar Flow first** — Polar AccessLink uses a transactions model that returns nothing until the device has uploaded data. HRV is workout-only (recorded with a chest strap), not overnight. |
| **Apple Health** | File import (no OAuth) | Export from your iPhone Health app and drop the `.zip` here. |
| **WHOOP** | *Hidden until creds validated* | Code is shipped; the connect row is hidden from Settings until WHOOP partner credentials are validated. |
| **Ultrahuman** | *Hidden until creds validated* | Code is shipped; the connect row is hidden from Settings until Ultrahuman partner credentials land. |
| **Manual** | No auth — you type the value | Built-in. Tap any empty weight / blood pressure / resting HR card on the dashboard → inline form → Enter to save. Context chips (post-workout, morning-fasted, etc.) optional. See [Manual entry](#manual-entry) below. |

## How to connect

Settings → Wearables → click **Connect** on a vendor row.

The OAuth-based vendors open the vendor's authorise page. After you approve, you're redirected back and the integration syncs the last 90 days. Your raw daily rows live in your browser's IndexedDB (per-profile, source-tagged); a compact summary feeds the dashboard cards.

## Apple Health setup

1. iPhone → **Health** app → tap your profile photo (top right) → **Export All Health Data**
2. AirDrop or email the `export.zip` to your computer
3. Drop the zip onto the Apple Health row in Settings → Wearables

Parsing runs entirely in your browser — no server contact.

## Manual entry

Weight, blood pressure, and resting heart rate can be logged without any wearable. The dashboard strip shows an empty card for each of those metrics when nothing else provides them.

**To log a reading:**

1. Tap the empty card (e.g. the `Weight –` card with a `+ Log` affordance at the bottom)
2. Type the number into the inline input (weight in kg, BP as sys/dia/optional pulse, RHR in bpm)
3. Optionally tap one of the **context chips** — `resting`, `morning-fasted`, `post-workout`, `stress`. These help the AI interpret the number correctly (a BP of 140/90 resting is very different from 140/90 post-workout).
4. Hit **Enter** or tap **Save**. The card populates; the reading appears with a *via Manual* badge.

**To manage past readings:** tap any card to open its detail modal. Scroll down past the chart + stats — you'll see a **Manual entries** list showing every reading you've logged for that metric, with a **×** delete button on each row and a **+ Add reading** button at the top that accepts backfilled dates. Fix a typo by deleting the old reading and logging the correct value — edits are "delete + re-add" rather than in-place for simplicity.

**To delete everything:** Settings → Wearables → expand the **Manual** row → **Delete all manual entries**. Wearable data from Oura / Withings / etc. is untouched.

Manual entries sync to your other devices via the same Evolu CRDT summary layer as wearable data — the raw readings stay local, only a compact summary propagates.

## Privacy

- **Raw daily rows never leave your device.** Stored only in IndexedDB.
- **Compact summary** (the L2 dashboard data) syncs to your other devices via Evolu CRDT (E2E encrypted, mnemonic-based identity).
- **OAuth refresh tokens stay local.** They are *not* synced — you re-connect on each device.
- **AI chat context** includes a ~200-token wearable summary by default. Toggle it off in Settings → AI → AI Context.
- **Personal Agent (MCP)** receives the same compact summary by default. Optionally enable a 30-day pivoted daily series in Settings → Agent Access → "Push 30-day wearable series" for time-series reasoning ("did HRV drop the week before I got sick?"). See [Agent Access](agent-access.md).

## Multi-vendor metric ownership

When two vendors expose the same metric (Oura HRV vs Fitbit HRV vs WHOOP HRV), the dashboard picks the most-recent non-null value by default. You can override per-metric:

- Click the *via {vendor}* badge on the card → pick a different source
- Pinned per-metric (HRV from Oura, sleep from Fitbit, etc.)
- Stored per-profile, syncs across devices

Vendors that uniquely provide a metric (only Withings does weight) don't show a badge.

## Sync controls

Each connected vendor row in Settings → Wearables has two sync buttons:

- **Sync now (catches today)** — fast, refetches the last 7 days. Use this when you've added a new reading on your wearable and want it on the dashboard now. Bypasses the L2 write-minimization gate so the strip never appears stuck.
- **Backfill 90 days (slower, fills gaps)** — refetches the full 90-day window. Use this if you've been away from a device for a while, switched devices, or notice a gap in the chart. Slower (subject to vendor rate limits — 30s+ for some vendors).

Background sync runs every 6 hours when the tab is open and uses the same 7-day window — your dashboard typically catches up automatically; the manual buttons are for impatient cases.

For the "as of {date}" hint that sometimes appears on a card: it means that metric's most recent reading is older than other metrics from the same source — usually the vendor's processing pipeline hasn't finished writing the latest value yet (Oura's HRV often lags their sleep score by hours). Hover for the explanation; the value is honest, not stale-from-our-side.

## Troubleshooting

- **"Polar connected — waiting on first device sync"** — your Polar account exists and the OAuth handshake worked, but no device has uploaded data to Polar Flow yet (or all available data has been synced + committed already). Open the Polar app on your phone and sync your watch, then click **Sync now**.
- **"needs reconnection" pill** — refresh token expired or revoked. Click Reconnect.
- **Wearable not in the dropdown when picking a metric source** — the vendor doesn't expose that canonical metric (e.g. WHOOP doesn't do `weight`, Withings doesn't do `hrv_rmssd`).
- **Apple Health import is slow** — the XML can be 100 MB+ for multi-year history. Parsing happens in-browser; expect 30–60 seconds for large exports.
- **WHOOP / Ultrahuman not in the list** — both are hidden until production OAuth credentials are validated. Watch the changelog. Maintainers can un-hide locally with `localStorage.setItem('labcharts-show-beta-wearables', 'true')` and reload.

## Self-hosting

If you self-host getbased (running `node dev-server.js` on your own host, or deploying your own fork to Vercel), the OAuth `client_id` values bundled with `js/wearable-adapters.js` belong to the maintainer's apps — they are registered for `*.getbased.health` redirect URIs only and will return `invalid_client` from the provider when paired with your own `*_CLIENT_SECRET`.

To run any OAuth-based wearable on a self-hosted install, register your own OAuth app with each provider and add the matching `*_CLIENT_ID` to `.env.local` (or to your Vercel project's environment variables for hosted forks):

```bash
# Required when self-hosting any of these
OURA_CLIENT_ID=
WITHINGS_CLIENT_ID=
ULTRAHUMAN_CLIENT_ID=
POLAR_CLIENT_ID=
FITBIT_CLIENT_ID=     # PKCE — no secret needed, but client_id still required
WHOOP_CLIENT_ID=      # PKCE — no secret needed, but client_id still required
```

The matching `*_CLIENT_SECRET` values for the four confidential clients (Oura, Withings, Ultrahuman, Polar) go in the same `.env.local`. WHOOP and Fitbit use PKCE, so no secret is needed — only the `client_id`.

Each provider's developer portal expects you to register the redirect URI you'll actually use, character-for-character — typically `http://localhost:8000/app` for local dev plus your production hostname (e.g. `https://your-host.example/app`). The hardcoded defaults inside `js/wearable-adapters.js` (`https://app.getbased.health/`, etc.) are for the maintainer's deployment; your own redirect URIs need to be registered in each portal separately.

When the env values are set, the browser fetches them from `/api/proxy` at startup and uses your `client_id` for both the authorize URL and the token exchange. When unset (the default), the hardcoded maintainer values are used and hosted users see no change.

Apple Health is file-import only — no credentials, no portal registration. It works the same way on every self-hosted install.

## Beta status

The five live integrations are in beta. Please report issues on [GitHub](https://github.com/elkimek/get-based/issues) or in the [Discord](https://discord.gg/zJdVB9zgQB). WHOOP and Ultrahuman code paths exist and are tested but hidden from the connect list until partner credentials are validated.
