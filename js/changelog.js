// changelog.js — What's New modal, version tracking, auto-trigger on update
// APP_VERSION comes from /version.js (loaded as classic script before modules)

import { escapeHTML } from './utils.js';

const CHANGELOG = [
  {
    version: '1.7.22', date: '2026-05-04', title: 'Sync — self-serve relay storage compact + real storage probe (no more SSH runbook)',
    items: [
      '<b>Compact storage is now a button, not a runbook.</b> When you hit the per-account relay storage cap, the Sync diagnose modal now has a Compact storage button that drops the older Evolu message log on the relay directly — no maintainer round-trip, no SSH access required. Every device re-establishes its CRDT state on the next push (a few seconds). Replaces the old "I just compacted" self-report flow that only made sense for someone with shell access to the relay VM.',
      '<b>The storage indicator is the relay\'s real number, not a local estimate.</b> A new Refresh button in the same panel probes the relay for the actual storedBytes — replaces what was previously a cumulative-bytes counter that drifted out of sync the moment compaction or relay-side cleanup ran. Works with any relay running getbased-relay 1.2.0 or later (older relays fall back to the local estimate, no breakage).',
      '<b>How the auth works.</b> Both endpoints (POST /self/compact-owner, GET /self/owner-storage) are HMAC-SHA256-signed with your own writeKey — the same Evolu secret the client already uses for pushes. No admin token leaves the relay VM, and one user can never act on another user\'s owner. 5-minute timestamp window for replay defence; uniform 401 on any auth failure to avoid an owner-existence oracle.',
      '<b>Self-host story unchanged.</b> Same Caddyfile pattern as the relay WebSocket — see relay README for the routing snippet. Operators who prefer to keep the runbook can disable /self/* with SELF_ENABLED=0 on the relay.',
    ]
  },
  {
    version: '1.7.21', date: '2026-05-04', title: 'Sync — Lean mode rename + lightEnvironment per-row CRDT, plus vit-D regression fixtures',
    items: [
      '<b>"Phase 2 cutover" → "Lean sync mode" in the Sync diagnose UI.</b> Same gating, same readiness check, friendlier name. The cutover button + readiness panel + ON badge all carry the new copy; the underlying flag stays per-profile, per-device opt-in.',
      '<b>lightEnvironment.rooms / lightEnvironment.screens now ride per-row CRDT.</b> Both nested arrays were previously caught by the whole-blob LWW path under DELTA_SCALARS — meaning a phone editing one room and a desktop editing another within the same window would lose the older edit. The push planner, pull merger, and cutover-readiness check all now walk dotted DELTA_ARRAYS entries (<code>lightEnvironment.rooms</code>, <code>lightEnvironment.screens</code>) via getAt/setAt. Without this, the Lean Sync flip would have silently regressed both surfaces.',
      '<b>Vit-D pipeline regression-locked against published references.</b> Six end-to-end fixtures (Holick 2008 NEJM, Bogh-Wulf 2010, dminder cross-checks, NIWA / Webb 2018, Fitzpatrick scaling table, saturation cap) plus dedicated coverage for the rotatedSides multiplier. A future spectrum-model or IU-constant tweak that drifts more than the band shows up here before users notice their old session numbers shifted.',
      '<b>Body-fraction preset for "tshirt" corrected to 0.20.</b> Test fixture was pinning 0.30 — production preset table had already been re-anchored as part of the v1.7.17 honesty pass; the test was stale.',
    ]
  },
  {
    version: '1.7.20', date: '2026-05-04', title: 'Audit fixes — sun correlations now actually work, chat-saved race closed, more confirms',
    items: [
      '<b>Sun-channel × biomarker correlations were silently empty.</b> Production code read `e.values?.[cat]?.[m]` against entries that store `e.markers["cat.m"]` — so the AI standard-tier correlation table never produced a row, even for users with months of bloodwork + sessions. Plus the target list used pre-schema names (vitamin_d_25oh, iron_metabolism, hs_crp). Both fixed; the calibration anchor I added in v1.7.19 had the same wrong path, also fixed.',
      '<b>Chat-saved profile-switch race.</b> Single module-scoped debounce timer captured profile + data at FIRE time, not QUEUE time — switching profiles within the 10s chat-streaming window pushed the new profile\'s data with the new profile\'s id, silently dropping original-profile chat changes. Now per-profile keyed Map mirroring the data-saved path.',
      '<b>chatSummaries + wearablePrimaryOverride were invisible to Phase 2 sync cutover.</b> Both top-level fields had no entry in DELTA_ARRAYS / DELTA_MAPS — Phase 2 (which drops the blob) would have stopped syncing them silently and the cutover-readiness gate would still report READY. Now wired (chatSummaries id-keyed, wearablePrimaryOverride map-keyed by metricId). Phase 2 is still gated; this is a pre-flight fix.',
      '<b>Destructive actions now confirm consistently.</b> deleteMarkerValue (× on a value chip), deleteNote (Delete in note editor), deleteDeviceSession (× on session row), and chat Clear all now go through showConfirmDialog. Sun sessions and thread delete were already confirmed; partial adoption is closed.',
      '<b>UV-data config now strips __proto__/constructor before Object.assign.</b> Defence-in-depth against a same-origin attacker reaching localStorage — a tampered raw value with `{"__proto__": {…}}` could spoof config fields like privacyRounding=0.',
      '<b>Copy nits.</b> "Import 1 Markers" → "Import 1 Marker"; feedback modal now lists Custom API as a 6th provider (was missing).',
      '<b>Test backfill.</b> pickTimestamp direct precedence test (the 7-field walk that drives every cross-device merge); calibration anchor single-source paths (vit-D-only, sleep-only); plus the test-sun-correlations fixtures now use the correct entry shape (they were broken in lockstep with the production bug above, so the test never caught it).',
    ]
  },
  {
    version: '1.7.19', date: '2026-05-04', title: 'Light & Sun second pass — calibration loop, agent API, intent-aware tier escalation',
    items: [
      '<b>Standard tier now auto-escalates on intent.</b> When you ask anything sun / light / sleep / vitamin D / circadian / winter / PBM-related, the chat assistant\'s context expands from the always-tier blob (~520 tok) to standard tier (+1200 tok) — adds the last 30 sessions as a table plus computed biomarker correlations. Other prompts stay on the cheap always-tier. Was dead code before; the +1200 budget was allocated but never spent.',
      '<b>Agent-callable API for sun sessions.</b> New <code>getSunSessionsSlice({days, fields})</code> and <code>getSunSessionDetail(id)</code> functions on window. MCP / Žofka / any local lens can now ask for what they need (cap 90d, projectable to date / channels / safety / atmosphere / body / eyes / location), instead of every prompt carrying full session detail. Body-region and location fields are off by default — privacy-by-default applies even on tools you authored locally.',
      '<b>Calibration anchor in always-tier.</b> Most recent 25-OH-D bloodwork (ng/mL + nmol/L) plus 7d sleep score with baseline + trend, surfaced as a single line. The AI was previously running blind on its own modeled vit-D estimates; now it can sanity-check "you log 600 IU/day modeled and your last 25-OH-D was 28" without a tool call. Only fires when the data exists.',
      '<b>Burden tier carries inline rubric.</b> "Indoor light burden: high (tier 3/4)" is meaningless without the scale; now reads "(0=well-aligned, 4=severe across screens/sleep/daylight)" so the model doesn\'t have to guess.',
      '<b>Tool-warning surface uses room names.</b> "after-sunset CCT 4200K · in living-room" is actionable. The previous "roomId=room_a4b2c8" wasn\'t. Names are no more sensitive than the rest of the always-tier — the user typed them.',
      '<b>Runtime token-budget guard.</b> Soft cap at 2500 chars / hard cap at 4000 on the always-tier blob. Stepwise drops calibration → trims warnings to 3 → drops deficit-axes → drops the entire indoor-environment block under hard pressure. Defensive code; today\'s realistic always-tier sits comfortably under the soft cap, but future surface additions can\'t bloat every chat.',
      '<b>Deep tier retired as a prompt block.</b> Per-session detail is the wrong shape for an always-on tier — it\'s a tool response. Deep-tier code path now collapses to standard, and the same data is reachable via the slice API for chat tool-calls and agent consumers alike.',
    ]
  },
  {
    version: '1.7.18', date: '2026-05-04', title: 'Light & Sun honesty pass — fewer false signals to the AI, more teaching to the user',
    items: [
      '<b>Deficit detection no longer lies to the AI about brand-new users.</b> The "Active light deficits" block (visible to the chat assistant in every prompt) used to fire 6 simultaneous "no exposure logged in 30d" claims for users with zero sessions — measurement gap dressed up as biological signal. Now gated behind ≥7 logged events of any kind so the deficit list only fires once we have a baseline to read against.',
      '<b>Per-Ott "why" sub-labels.</b> Each of the 10 light-environment audit questions now carries a one-line photobiology explainer below the prompt — "Window glass blocks UVB almost entirely — no vitamin D, no nitric-oxide release through the skin," "Even <5 lux at the pillow degrades overnight insulin sensitivity," etc. Teaches the model behind the question instead of just collecting yes/no.',
      '<b>First-fire jargon explainer for MED + ICNIRP toasts.</b> The first time a session fires a 70%-MED warning or an ICNIRP eye-UV alert, the toast now opens with a one-line definition ("MED = the smallest UV dose that turns your skin slightly pink"). Subsequent fires stay terse. Persisted in localStorage so the explainer doesn\'t repeat across reloads.',
      '<b>Channel-deficit device CTA.</b> When you\'ve logged ≥7 events but a device-fillable channel is still empty over 30 days (red 660 nm or near-IR 810/850 nm — solar exposure can\'t realistically fill those), the Light & Sun page now surfaces a "Fill the {channel} with a device" card pulling matching panels from the affiliate catalog. Region-filtered, capped at 3 products per channel, gated by the same Settings → Privacy product-recs toggle as the supplement and EMF surfaces.',
      '<b>~115 tokens per chat saved.</b> The always-tier sun context blob was carrying redundant 30-day channel totals (already captured by deficit detection internally), the full device-name list ("Joovv Mini 3.0, EMR-Tek..."), and a separately-counted Eye-Level walkthroughs line. Compressed to integer-formatted channel values, presence-only device count, and a single Light-audits line that folds before/after snapshots and walkthroughs together.',
    ]
  },
  {
    version: '1.7.17', date: '2026-05-04', title: 'CAMS atmosphere relay live + Light & Sun polish',
    items: [
      '<b>CAMS relay is live.</b> The new <code>getbased-uvdata</code> companion repo ships KNMI-validated total column ozone (DU), aerosol optical depth, and PM2.5 / PM10 from the same satellite-assimilated source Open-Meteo wraps for AQI. The Sun data source picker on the Light & Sun page now defaults to "Best accuracy" — CAMS for atmospheric composition + Open-Meteo for clouds and temperature, automatically merged. Pick "Open-Meteo only" or "Self-hosted" if you prefer.',
      '<b>UV source confidence is now computed, not hardcoded.</b> The static 95% / 65% per-source numbers were misleading at low sun under heavy cloud — exactly the conditions where you most need to know the data is uncertain. Confidence now weights snapshot age, cloud cover, sun elevation, UVI band, and stale-grid flag. A reading at sunset under heavy cloud honestly drops to ~40%, even from CAMS. Hover the readout to see which discounts are active.',
      '<b>Vit-D model recalibrated.</b> The body-fraction presets used to claim "Sunbathing = 0.90" — anatomically impossible, since you can\'t have both sides exposed at once. New presets cap at single-position max (Sunbathing = 0.50 = front-only). New 🔄 Flip mid-session button doubles vitamin D yield to acknowledge that fresh skin keeps synthesizing after the first side approaches saturation. The IU constant was bumped 40 → 60 to match dminder + NIWA at UVI 5–7. Existing sessions will read ~1.5× higher than before.',
      '<b>Active session pinned to the top of the Light & Sun page</b> with a Live badge above the Stop button — the live timer, channel chips, and Pause / Flip / Sunscreen / Ozone controls are the first thing you see when a session is running.',
      '<b>Eye-UV math no longer phantom-accumulates before sunrise.</b> Retinal UV is now gated on sun elevation ≥ 5° (matches the "UV-A on" sun-arc marker). A 30-min eyes-direct session at 6 am pre-sunrise no longer falsely reports 4.8 J/m² actinic dose.',
      '<b>Sun-arc fix.</b> The sunrise / sunset / UVI-peak markers were silently picking 2-day-old values because Open-Meteo\'s <code>daily.sunrise[0]</code> with <code>past_days=2</code> means day-before-yesterday. Now indexes by today\'s date string. The "now" indicator (⏵) lands in the right slot on the timeline.',
      '<b>Stop session freezes the timer immediately.</b> A cross-device race could leave the visible counter ticking on both phone and desktop after Stop. Now the timer DOM is blanked synchronously before the network round trip, regardless of sync state.',
      '<b>5-day forecast horizon.</b> CAMS pull now spans 120 hours instead of 24. App can render UVI / ozone / atmosphere up to 5 days ahead.',
      '<b>Picker simplification.</b> Removed the confusing "CAMS only" mode (it broke clouds/temp because CAMS is composition-only). Four honest options now: Default / Open-Meteo only / Self-hosted / Manual. Legacy <code>cams</code> and <code>noaa</code> stored configs auto-migrate to Default.',
    ]
  },
  {
    version: '1.7.16', date: '2026-05-03', title: 'Sync — concurrent-push snapshot clobber fix',
    items: [
      '<b>Stale onComplete can no longer clobber a fresher push\'s snapshot.</b> The 60-second <code>_syncing</code> in-flight guard plus delayed <code>onComplete</code> writing meant push A planned at T=0 could have its <code>onComplete</code> fire at T=70s — AFTER push B started at T=65s and already wrote its snapshot. A\'s late <code>onComplete</code> would clobber B\'s fresher view, and the next push would diff against A\'s stale state, silently skipping items B had already added.',
      '<b>How the fix works.</b> Each delta plan now carries a <code>plannedAt</code> stamp captured at planning start (not end — gzip is slow). On snapshot write, the gate compares against the existing snapshot\'s persisted <code>plannedAt</code> meta and refuses to overwrite when the existing is newer. <code>onComplete</code> now logs <code>{snapshotsAdvanced}/{deltaPlans.length}</code> so a stale push that loses the gate is visible in the activity log instead of silently dropping snapshots.',
    ]
  },
  {
    version: '1.7.15', date: '2026-05-03', title: 'Diagnose-modal silent drops + DST-safe peak finder + parse-equivalence test',
    items: [
      '<b>Sync diagnose now logs which rows it can\'t parse.</b> The modal\'s pre-pass over every relay row used to swallow parse exceptions silently — a malformed or bomb-rejected row would render as <code>0/0</code> in the table, indistinguishable from a real empty row. Now emits a <code>skip</code> activity-log line with the row id and a short error excerpt so triage can see what got dropped. Same fix on the receive-side malformed-shape branch.',
      '<b>Sun peak-finder is DST-safe.</b> The "today" anchor used to filter <code>hourly.uv_index</code> entries is now derived from <code>daily.time[0]</code> (Open-Meteo\'s authoritative date for the requested location) instead of <code>utc_offset_seconds + Date.now()</code>. The previous derivation drifted at DST boundaries — opening the app at 23:55 local time the day before a DST jump computed yesterday\'s date for the next morning\'s hourly entries.',
      '<b>Runtime parse-equivalence test.</b> Closes the test-coverage gap that would have caught the v1.6.5/v1.6.6 regression class: builds a payload via the same gzip envelope the producer emits, decodes it via the same path the consumer uses, asserts <code>profile.id</code> + <code>importedData.sunSessions.length</code> survive intact. Source-grep tests can\'t catch a divergence between two encoders that both look superficially correct.',
    ]
  },
  {
    version: '1.7.14', date: '2026-05-03', title: 'Pre-v1.7 audit pass — gzip-bomb defence + owner-scoped warnings',
    items: [
      '<b>Decompression-bomb defence on the blob pull path.</b> The per-row gunzip path was capped in v1.7.12, but <code>parseSyncPayload</code> (used for the fat-blob and for the diagnose modal\'s pre-pass over every relay row) still ran uncapped — the post-decompression size check fired only after the full gunzipped output had been buffered, so a 5 MB compressed gzip-bomb could decompress to GBs and OOM the tab before the cap triggered. Now routed through the same streaming-capped reader; bombs fail fast at the cap.',
      '<b>Owner change cleanups.</b> <code>disableSync</code> and <code>restoreFromMnemonic</code> now drop <code>-relay-bytes-</code> counter keys + the legacy global <code>labcharts-relay-quota-warned</code> marker alongside the v1.7.11 delta-snapshot/cutover-flag clear. Without this, restoring a previously-used mnemonic would inherit stale phantom storage usage from that owner\'s last session, and the threshold-warning toast wouldn\'t fire for the new owner because the marker still said "already warned".',
      '<b>Quota-warned marker is now per-owner.</b> Previously a single global key meant a user with two relays (or a mnemonic restore) could miss the first amber/red warning on the new owner because the legacy global marker still said "already warned". Now scoped to <code>{owner-id}-relay-quota-warned</code>; both old + new keys are cleared on reset for full re-arm.',
    ]
  },
  {
    version: '1.7.13', date: '2026-05-03', title: 'Sync audit P2 cleanup',
    items: [
      '<b>manualValues synth-id collision fix.</b> The v1.7.5 algorithm (`:` → `_`) could collapse two distinct keys to the same itemRow id when a marker key contained `_`. Switched to a doubling-escape (each `_` → `__`, then each `:` → `_`) so distinct rawKeys always produce distinct synths. Branch is unpushed so no migration concern — applied directly. Pull side still restores the original `:`-bearing key from `payload.k`.',
      '<b>Selfhost UV-data URL: lat/lon defence-in-depth.</b> Coordinates are now Number-coerced and clamped to ±90 / ±180 before URL interpolation, then formatted via `toFixed(6)`. The caller chain validates them as numbers, but a future code path with corrupted profile data couldn\'t inject `?` or `&` to split the URL.',
      '<b>Doc accuracy fixes.</b> The Phase 1 block-header comment in sync.js incorrectly described the pull order (it said "per-row first, then blob" — actual code is "blob first, per-row overlays on top"). Rewritten + extended to cover the v1.7.10 Phase 2 cutover. Removed a false history claim in the `_djb2` helper comment.',
    ]
  },
  {
    version: '1.7.12', date: '2026-05-03', title: 'Sync audit follow-up — 3 P1 fixes',
    items: [
      '<b>Decompression-bomb defence on per-row payloads.</b> The per-row gunzip path had no size cap on the decompressed result — a malicious relay (or a peer device sending a crafted row) could ship a tiny base64 envelope that decompresses to hundreds of MB and OOM the tab. Per-row payloads are individual items (one sun session, one marker note); 1 MB cap leaves comfortable headroom while killing the bomb fast via streaming abort.',
      '<b>Snapshot-poisoning fix on partial push failure.</b> <code>_applyArrayDelta</code> swallowed individual op failures with a console warning, then the caller advanced the snapshot anyway — next push diff\'d against state that didn\'t match the relay, so failed items got silently skipped forever. Now returns boolean success; snapshot only advances when every op landed.',
      '<b>changeHistory cap re-applied on v4 cutover overlay.</b> The 200-entry cap is enforced in <code>mergeImportedData</code>\'s blob path. v4 cutover skips that step and the per-row overlay used to grow <code>changeHistory</code> past 200 (because <code>noTombstones: true</code> means the relay accumulates rows forever and the pull replays all of them). Cap is now re-applied inside the per-row array overlay using <code>COMPOSITE_KEYED_ARRAYS</code> imported from data-merge.js — newest-first trim by <code>updatedAt</code> / <code>createdAt</code> / <code>date</code>.',
    ]
  },
  {
    version: '1.7.11', date: '2026-05-03', title: 'Sync arc audit pass — 4 critical fixes',
    items: [
      '<b>Prototype pollution defence on the per-row pull path.</b> The itemId allowlist regex (<code>[a-zA-Z0-9_.-]+</code>) accepts <code>__proto__</code>, <code>constructor</code>, and <code>prototype</code> — all three would set <code>Object.prototype</code> when used as a map write key, polluting every <code>{}</code> in the page. A malicious relay (or a peer device sending crafted rows) could exploit this. Fixed by adding an explicit reject-set on top of the regex (<code>_isAllowlistSafeId</code>) used everywhere itemIds are accepted, plus <code>Object.create(null)</code> for freshly-initialised map containers as defence-in-depth.',
      '<b>Re-add after delete now actually re-syncs.</b> When a user deleted an item then re-added it (e.g. accidentally removed a sun session, then re-logged it), the planner reused the same itemRow id but never reset <code>isDeleted=1</code> — peers kept seeing the resurrected item as a tombstone and dropped it from their local state. Fixed in all three planners (array / map / scalar) by explicitly clearing <code>isDeleted</code> when the existing row was tombstoned.',
      '<b>Phase 2 cutover scope expanded to cover all top-level fields.</b> Six importedData fields (<code>refOverrides</code> / <code>categoryLabels</code> / <code>categoryIcons</code> / <code>markerLabels</code> / <code>wearableSummary</code> / <code>wearableCardOrder</code>) had no per-row datapath, so flipping Phase 2 would have silently stopped syncing your reference-range overrides, custom UI labels, and wearable L2 state. Added to <code>DELTA_MAPS</code> / <code>DELTA_SCALARS</code> so cutover readiness can\'t report READY while these surfaces are still blob-only.',
      '<b>Snapshot rotation on owner change.</b> <code>restoreFromMnemonic</code> and <code>disableSync</code> now clear the per-array delta snapshots and cutover flag in localStorage. Without this, the new Evolu owner started with zero rows but the OLD snapshot told the planner "I already pushed these items" → next push silently skipped them, leaving the new owner\'s relay forever empty for pre-existing data.',
    ]
  },
  {
    version: '1.7.10', date: '2026-05-03', title: 'Phase 2 cutover behind a readiness-gated flag',
    items: [
      '<b>Phase 2 (drop the fat-blob writes entirely) is now a one-button flip in Sync diagnose, gated by the readiness check.</b> An "Enable Phase 2" button appears next to the readiness panel — disabled when blockers exist, green-bordered when READY. Enabling sets a per-profile per-device flag; from then on, outbound pushes carry only the small profile/AI/chat envelope plus per-row CRDT deltas. The full importedData blob stops shipping.',
      '<b>Reversible at any time.</b> A "Disable Phase 2" button (orange) is always available — the escape hatch. Use it if a peer device on the dual-write path appears to be missing data; the next push will re-include the blob and the peer will re-merge.',
      '<b>How the wire format evolves.</b> v3 dual-write payloads (current default) include `importedData`. v4 cutover payloads omit it (sentinel: `_v: 4` + no `importedData`). The receive path detects v4 and skips the blob-merge step, falling through to the per-row overlay alone — safe because every importedData surface has a per-row datapath since v1.7.6. Devices on v1.7.x or older still pull v4 rows correctly: they see `importedData` as missing → no-op blob merge → per-row pulls fill in the data they were going to update anyway. Mixed-version cohorts converge.',
      '<b>What this means in practice.</b> Per-push size on a Phase 2 device drops from ~150 KB (gzipped blob) to ~5–10 KB (envelope only) + a few hundred bytes per changed item. The relay\'s 50 MB per-owner cap, which used to fill in ~280 pushes (a few weeks of moderate use) and trigger the recurring "phone says committed, desktop sees stale" wedge, becomes a non-issue — months of constant editing before refill.',
      '<b>The bake clock still applies.</b> Don\'t enable Phase 2 until BOTH paired devices report READY for ≥2 weeks AND the dual-write delta:blob ratio sits &lt;5%. The button is your gate; the wait is yours.',
    ]
  },
  {
    version: '1.7.9', date: '2026-05-03', title: 'Phase 2 cutover-readiness check (in Sync diagnose)',
    items: [
      '<b>Sync diagnose now reports per-surface Phase 2 readiness.</b> A new "Phase 2 cutover readiness" panel surveys all 31 importedData surfaces (10 arrays + 3 keyed maps + 18 scalars) and classifies each as ok / no-data / missing-rows / rows-only. If any surface has local data but no per-row push (status: missing-rows), Phase 2 — dropping the fat-blob writes entirely — would silently lose it. The check is the hard gate before that flip.',
      '<b>What you\'ll see on a healthy device.</b> READY ✓ in green, with the surface count broken down (e.g. "31 surfaces tracked · 12 ok · 19 no-data · 0 blockers"). The "no-data" tally is fine — many surfaces are optional (genetics, EMF assessment, cycle data) and only relevant if the user has populated them.',
      '<b>What you\'ll see on a not-yet-baked device.</b> "BLOCKED — N surfaces" in orange, with a per-surface table showing the blockers. Triggering a save on each (editing the corresponding card / array) ships the per-row deltas and clears the blocker.',
      '<b>How this becomes the cutover gate.</b> When this reads READY across BOTH paired devices for ≥2 weeks AND the dual-write ratio (v1.7.1 telemetry) sits &lt;5%, the architectural gate is fully satisfied: every surface has a proven per-row datapath, the per-row payload is small, and dropping the blob is a safe one-line change.',
    ]
  },
  {
    version: '1.7.8', date: '2026-05-03', title: 'Selfhost CAMS — DNS-rebinding hardening',
    items: [
      '<b>Selfhost UV-data URLs that carry a bearer token now require HTTPS.</b> Closes the DNS-rebinding gap acknowledged in the v1.6.0 audit. The attack: an attacker controls a public domain you paste into Settings → Light & Sun → Sun Data Source. First DNS lookup returns a public IP (passes the existing SSRF allowlist); subsequent lookups return 169.254.169.254 (cloud metadata), 192.168.1.1 (your router), or any LAN IP. Browser fetch is opaque to us, so the bearer travels with the rebound request. With HTTPS required, the rebound endpoint must present a valid TLS certificate for the original hostname — LAN/metadata targets won\'t have one, so the handshake fails before the Authorization header is sent.',
      '<b>Plain HTTP without a bearer is still allowed</b> — legitimate local-dev path against unauthenticated LAN endpoints, no credential to leak.',
      '<b>Defence-in-depth: response-shape validation.</b> Even if a bearer-less HTTP request gets DNS-rebound to a non-Open-Meteo service that returns valid JSON, the new payload-shape check refuses to treat the result as authoritative atmosphere data. Selfhost responses must look like Open-Meteo (have an `hourly` object with at least one of `uv_index` / `cloud_cover` / `temperature_2m`) — anything else fails closed with a clear error.',
    ]
  },
  {
    version: '1.7.7', date: '2026-05-03', title: 'Sun spectrum — diffuse fix at low-sun (P1.3 audit)',
    items: [
      '<b>Sun-spectrum reconstruction now scales the diffuse-light component with airMass</b>, fixing the ~30-50% UVB underestimate the v1.6.0 audit flagged at extreme zenith (≥75°). The previous model multiplied the direct beam by a constant per-band diffuse fraction (0.55 in UVB), which silently dropped to zero alongside the direct beam at sunset / sunrise / high-latitude winter. The physical reality: direct light attenuates exponentially with airMass while diffuse only weakly does, so the diffuse-to-direct ratio grows as the sun gets lower.',
      '<b>What changes for users.</b> Vitamin-D and circadian estimates at low UVI (morning walks at 50°+ latitude, late-afternoon outdoor time, post-equinox sun) read higher than before — closer to TUV/NIWA reference values. Noon estimates are unchanged (airMass ≈ 1, scaling collapses to the v1.7.6 model). The scaling is capped at 3× to keep the model bounded as zenith → 90°.',
    ]
  },
  {
    version: '1.7.6', date: '2026-05-03', title: 'Scalar fields join the per-row datapath',
    items: [
      '<b>The remaining 18 singleton fields now sync as per-row deltas.</b> Until v1.7.5 these (menstrualCycle, the 8 context cards, genetics/DNA, biometrics, lightEnvironment, sunCorrelations, lifelightProfile, sunDefaults, emfAssessment, interpretiveLens, contextNotes) were the actual reason the fat blob couldn\'t fully drop in Phase 2 — they\'re not enumerable as items, so no array/map planner could touch them. Without this patch, Phase 2 would have silently stopped syncing all of them.',
      '<b>How the scalar planner works.</b> One <code>itemRow</code> per scalar per profile, itemId = the field name itself (<code>menstrualCycle</code>, <code>diet</code>, etc). Payload = <code>{v: value}</code> so the value can be any JSON shape. On edit, the row updates; on initial null→object transition, the row inserts; on object→null (you cleared a card), the row tombstones. Latest-write-wins between live and tombstone using <code>syncedAt</code>, so an old delete can\'t obliterate a fresh edit even with cross-device clock skew.',
      '<b>Conservative tombstoning.</b> A scalar that\'s never been set (default <code>null</code>) doesn\'t emit anything — only a non-null → null transition fires a tombstone. Same logic as the array path\'s "no row exists yet" guard, scaled to the scalar shape.',
      '<b>Phase 2 is now genuinely complete.</b> Every importedData field — 10 arrays + 3 keyed maps + 18 scalars — has a per-row datapath. Once the cross-device bake clock completes, dropping the fat-blob writes is a one-line change with no data-loss risk for any user surface.',
    ]
  },
  {
    version: '1.7.5', date: '2026-05-03', title: 'manualValues — Phase 2 cutover blocker cleared',
    items: [
      '<b>manualValues now sync as per-row deltas — last array on the blob path is gone.</b> manualValues holds membership flags for entry values you typed in by hand (vs imported from a PDF), keyed by <code>category.markerKey:date</code>. The colon in those keys failed the row-itemId allowlist regex; this patch adds optional per-map <code>keyIdFn</code> support so a map can synthesize an allowlist-safe itemId while the payload preserves the original colon-bearing key for pull-side reconstruction.',
      '<b>How synth-keyed maps work.</b> Push side: the keyIdFn maps `glucose:2026-05-03` → `glucose_2026-05-03` for the row\'s itemId column. Payload still carries `{k: "glucose:2026-05-03", v: true}`. Pull side: re-derives the synth from `parsed.k` and verifies it equals `row.itemId` (defence-in-depth — catches a relay swapping payloads), then writes the map entry under the original `:`-bearing key so consumers reading <code>state.importedData.manualValues[\'glucose:2026-05-03\']</code> keep working without code changes elsewhere.',
      '<b>Phase 2 is now functionally unblocked.</b> Every high-velocity surface (10 arrays + 3 keyed maps) has a per-row datapath. Once the cross-device bake clock completes, dropping the fat-blob writes is a one-flag-flip change. menstrualCycle stays on the blob (singular scalar, near-zero churn — per-row would be over-engineering).',
    ]
  },
  {
    version: '1.7.4', date: '2026-05-03', title: 'customMarkers join the per-row datapath',
    items: [
      '<b>customMarkers — your user-defined biomarkers (from PDF import + manual creation) — now sync as per-row deltas.</b> Identical keyed-map shape to markerNotes, so the keyed-map planner shipped in v1.7.3 covers it with a one-line addition. Adding a custom marker now ships only that marker, not your full custom-marker registry.',
      '<b>What\'s left on the blob.</b> Two arrays remain: <code>manualValues</code> (keys like <code>category.markerKey:date</code> contain a colon, which fails the allowlist regex — needs a synth-id pass like changeHistory got, queued for a follow-up) and <code>menstrualCycle</code> (singular scalar object, minimal per-row benefit, will likely stay on the blob path permanently). Phase 2 cutover blocker is now down to one fix-up.',
    ]
  },
  {
    version: '1.7.3', date: '2026-05-03', title: 'markerNotes now sync as per-row deltas too',
    items: [
      '<b>Adds keyed-map shapes to the Phase 1 per-row datapath.</b> markerNotes — the freeform notes you can attach to any biomarker — was the last high-velocity surface still riding the fat-blob path. Now each marker note is its own per-row CRDT message: editing the note on glucose ships the note for glucose, not your entire health record.',
      '<b>How the keyed-map shape works.</b> The itemRow table is shape-agnostic (just a name + id + payload), so the same on-disk schema covers both arrays (`sunSessions[i].id`) and keyed objects (`markerNotes[\'biochemistry.glucose\']`). A new `_planKeyedMapDelta` enumerates `Object.entries(map)` and uses each key as the row\'s itemId. The payload wraps `{k, v}` so the receiving side can verify the row\'s itemId column matches what the payload claims — same defence-in-depth as the array path.',
      '<b>Tombstones DO emit on map shapes.</b> Unlike changeHistory (where local cap-eviction would propagate as a phantom delete), markerNote keys are user-owned: deleting a note via the UI clears the key from the map, and that\'s a real intent that should propagate. The conservative "no row exists yet" guard from the array path still applies — fresh devices restoring from mnemonic don\'t accidentally delete data they\'ve never seen.',
      '<b>Phase 2 cutover gate update.</b> With markerNotes covered, only `menstrualCycle` (a singular scalar object) and `customMarkers` (also keyed-map; identical shape, easy follow-up) remain on the blob path. Once both are covered, Phase 2 can drop the blob writes entirely after the bake window completes.',
    ]
  },
  {
    version: '1.7.2', date: '2026-05-03', title: 'changeHistory now syncs as per-row deltas too',
    items: [
      '<b>Adds changeHistory to the Phase 1 per-row datapath.</b> Until v1.7.1 only nine arrays (sun sessions, light devices/sessions/audits/measurements, lab entries, notes, supplements, health goals) were shipping deltas; the change-history log (every AI-temporal-reasoning datapoint) was still re-shipped wholesale on every push. Now it ships as small per-row inserts/updates like everything else.',
      '<b>Composite-keyed without an `id`.</b> changeHistory entries are <code>{field, date, snapshot}</code> with no `id` field. The planner now supports a per-array itemId function: changeHistory derives a synthetic id from <code>field.dateMs</code> (numeric, allowlist-safe). Pull side uses the same function for replace-or-insert matching, so existing entries get updated rather than duplicated.',
      '<b>No tombstones for changeHistory.</b> The array is capped at 200 entries — when the cap kicks in locally, that\'s an eviction, not a user delete. A tombstone here would propagate that eviction to a peer device whose recent-200 window still includes the entry, destroying data. Per-array <code>noTombstones: true</code> flag suppresses delete events on the push side; the consumer-side cap in data-merge.js still enforces 200 after the union.',
      '<b>What\'s still on the blob path.</b> markerNotes (a keyed object, not an array) and menstrualCycle (a single scalar object) — both need a different planner shape than the array-keyed itemRow path. They stay on the fat-blob until the keyed-map and scalar planners land in a future patch. Phase 2 cutover gate still applies — both still need a per-row datapath before the blob can drop.',
    ]
  },
  {
    version: '1.7.1', date: '2026-05-03', title: 'Phase 1 dual-write health (in Sync diagnose)',
    items: [
      '<b>The Sync diagnose modal now shows whether the per-row datapath is actually carrying its weight.</b> A new "Phase 1 dual-write health" panel reports the delta-to-blob ratio over the last 50 pushes, a per-push breakdown (when, blob bytes, delta bytes, ops, which arrays + insert/update/tombstone counts), and the latest pull-side row counts per array. Read-only — no extra network calls, no telemetry leaves the device.',
      '<b>Why it exists.</b> Phase 2 of the sync refactor (dropping blob writes entirely) is gated on real cross-device traffic proving the per-row datapath is healthy. "Healthy" = ratio &lt;5% across devices for ≥2 weeks, and per-array row counts converging on every device. This panel is how we — and you, if you compare two devices side by side — read that signal.',
      '<b>Reset window button</b> drops the rolling log so you can start a fresh measurement (e.g. after a backfill push that would skew the average for days). The on-relay state and per-array snapshots are unaffected.',
    ]
  },
  {
    version: '1.7.0', date: '2026-05-03', title: 'Per-row sync deltas — Phase 1 of the real fix',
    items: [
      '<b>Sync now uses CRDT deltas, not full snapshots.</b> Until v1.6.x, every save re-uploaded your <i>entire</i> health record (~200 KB compressed) on every push. The relay\'s 50 MB per-owner cap meant ~280 pushes between compactions. Phase 1 of the architecture fix shipped here — adding a sun session, editing a note, or logging a supplement now also writes a per-row CRDT message (a few hundred bytes), and the receiving device merges those individual rows on top of whatever it already has.',
      '<b>Both formats ship in parallel.</b> The full-blob push still happens for back-compat with devices on older versions, so your data converges either way. Once the per-row datapath has baked under real cross-device traffic for ≥2 weeks, Phase 2 will drop the blob writes entirely. After that, the per-owner quota stops mattering in practice — pushes are small enough that you\'d need months of constant editing to refill it.',
      '<b>Per-row data is authoritative on pull.</b> If a per-row tombstone says "this sun session was deleted" and the blob still has it, the tombstone wins. This is the design — per-row state is up-to-the-moment, the blob may be a stale snapshot from before another device synced. Idempotent: when both agree, it\'s a no-op.',
      '<b>Arrays covered in Phase 1:</b> sun sessions, light devices + their session logs, light audits, light measurements, lab entries, notes, supplements, health goals. (Cycle data, marker notes, and change history follow in a later phase — they have specialized merge logic worth handling separately.)',
      '<b>Tombstones are conservative.</b> If we don\'t have a snapshot of what was previously pushed for an array (e.g. fresh device, recently restored from mnemonic), no tombstones get emitted — the system would rather skip a delete than push a phantom one that wipes data on receiving devices.',
      '<b>Snapshot-after-success.</b> The "what we last pushed" pointer only advances when the push actually commits. A wedged or failed push leaves the snapshot intact so the next attempt re-emits the same delta — no silent data drift between local state and what the relay has.',
      '<b>Backwards compatible.</b> Devices on v1.6.x and older still receive your data via the fat-blob path. They don\'t see per-row pushes, but the blob still ships, so nothing visibly changes for them.',
    ]
  },
  {
    version: '1.6.7', date: '2026-05-03', title: 'Relay storage indicator + warning toasts',
    items: [
      '<b>You can now see how full your relay storage is.</b> Click the sync indicator in the header — the popover shows <i>Storage: X.X / 50 MB · Y%</i> with a green/amber/red dot. Settings → Sync → Diagnose has the full breakdown with a progress bar.',
      '<b>Automatic warnings before the wall.</b> One toast at 80% ("plan a compaction in the next few days"), a louder one at 95% ("compact soon or pushes will start failing silently"). Each level fires once per crossing — no spam.',
      '<b>"I just compacted" reset.</b> The indicator is a local cumulative-bytes counter (close enough to the relay\'s actual storedBytes to warn before the wall, but it doesn\'t reset on its own). After your relay maintainer runs the compaction, click the button in Diagnose to reset the counter back to 0.',
      '<b>Why this isn\'t a self-service compact button yet.</b> Compaction needs a writeKey-signed endpoint on the relay so the app can call it without exposing the admin token. That endpoint is queued for the next relay deploy. For now, ping Hermes / your maintainer when the indicator goes red.',
    ]
  },
  {
    version: '1.6.6', date: '2026-05-03', title: 'Sync — fix post-compaction "ghost" rows',
    items: [
      '<b>Fixes the actual cross-device sync bug.</b> When the relay\'s storage gets compacted (a maintenance step that drops old CRDT log entries), the receiving device sometimes saw rows with an empty profileId column — even though the data itself was intact in the row\'s payload. The pull pipeline\'s safety regex (which exists to stop a compromised relay from injecting weird profileIds) was rejecting these blank-column rows, so genuinely-fresh data sat in the local Evolu DB but never made it into your in-memory state. That\'s why phone said "push committed sun=3" but desktop kept showing sun=2.',
      '<b>Two-pronged fix.</b> Going forward, every push (insert AND update) carries the profileId so future compactions can\'t strip it. And the receiving side now falls back to reading profileId from the row\'s payload when the column is empty — same data, just one indirection deeper. Tombstone propagation (cross-device profile deletes) gets the same treatment.',
      '<b>What you\'ll see.</b> Reload both devices after picking up this update and the missing data should appear within seconds of the next sync tick. The Sync diagnose modal\'s "fmt" + profileId-source columns will tell you whether your rows are still in the post-compact "payload-recovered" state (small orange * next to the profileId) or back to canonical "column" reads after the next push.',
    ]
  },
  {
    version: '1.6.5', date: '2026-05-03', title: 'Sync diagnose — readable rows + Copy button',
    items: [
      '<b>Sun + device counts in Sync diagnose now read correctly.</b> v1.6.4\'s gzip-compressed payloads were appearing as 0/0 in the diagnose table because the modal was JSON-parsing the raw blob — now it routes through the same decoder the sync engine uses.',
      '<b>profileId column has a fallback.</b> When the row\'s profileId column is empty (seen on some cross-device replicated rows), it\'s now recovered from the payload itself and marked with a small <span style="color:var(--orange)">*</span> so you can tell the difference.',
      '<b>New "fmt" column</b> shows whether a row is gzip-compressed (v1.6.4+) or plain JSON (older), useful when diagnosing mixed-version sync.',
      '<b>Copy button</b> on the Sync diagnose modal — one click writes the full snapshot (relay, owner, in-memory state, all rows) to your clipboard so you can paste it into a chat or issue without retyping.',
    ]
  },
  {
    version: '1.6.4', date: '2026-05-03', title: 'Sync storage — gzipped pushes + longer debounce',
    items: [
      '<b>Each sync push now ships compressed.</b> Your full health record was being uploaded uncompressed every time you saved a change (~500 KB per push). With gzip + base64 envelope it\'s ~150 KB — about 3× more pushes before the relay\'s per-owner storage cap.',
      '<b>Edit-burst coalescing improved.</b> Push debounce went from 2 seconds to 10 seconds, so a flurry of saves (typing a long note, logging multiple sun sessions, scrolling through context cards) now syncs as one push instead of 5–10. Your changes still arrive on other devices within a few seconds — just not <i>immediately</i> per keystroke.',
      '<b>Combined effect.</b> The relay storage cap that triggered "phone says push committed but desktop sees stale data" should now take roughly 10× longer to fill under typical use. We still need to give you a quota indicator in the sync UI + an in-app self-service compact button — coming in a follow-up release.',
      '<b>Backwards compatible.</b> Old uncompressed pushes from devices on older versions still parse cleanly; this device gracefully falls back to plain JSON if the browser somehow lacks gzip support (it won\'t — every browser since 2023 has it).',
    ]
  },
  {
    version: '1.6.3', date: '2026-05-03', title: 'Sync reliability fix',
    items: [
      '<b>Cross-device sync no longer strands rows behind a "content already applied" skip.</b> The skip path was misfiring when the local hash key matched the relay row\'s bytes but the actual local state had drifted (e.g. after manual data edits or upgrades from a prior version). Sync now always applies remote rows through the union-merge — re-applying matching bytes is a no-op, but stale state finally catches up. If you saw "Skip — content already applied" in the activity log while a phone-side session was missing on the desktop, this is the fix.',
    ]
  },
  {
    version: '1.6.0', date: '2026-05-02', title: '☀ Light & Sun — the lens for everything sunlight does to you',
    items: [
      '<b>Sun isn\'t just vitamin D.</b> Different parts of sunlight do different things — set your body clock, support circulation, charge your mitochondria, regulate mood-hormones. The new <b>☀ Light & Sun</b> lens tracks your light exposure across six biological channels (Vitamin D, Mood & hormones, Cardiovascular, Outdoor eye light, Body clock, Cellular repair) and lets you correlate them with your labs and wearable data over time.',
      '<b>One-tap sun session logging.</b> Tap when you go outside, tap again when you come back. We pull the actual UV and ozone for your location, reconstruct the solar spectrum at your zenith, and compute per-channel doses on the spot. Plain-English summary on stop: <i>"Saved · 22 min outside · ~600–1500 IU vitamin D · burn dose 35% — well within safe range."</i>',
      '<b>Sun-safety guardrails.</b> Live toast at 70% of your burn dose ("head into shade for ~10 min, then decide") and a hard alert at 100% ("burn threshold reached — cover up, hydrate, no more direct sun today"). Photosensitizing-medication checkbox in setup drops your threshold 2.5× across the board (tetracyclines, doxycycline, isotretinoin, amiodarone, thiazides, sulfa antibiotics, NSAIDs, St. John\'s Wort, others). Carry-over chip warns when yesterday + today combined exceeds your daily limit. High-altitude UV chip flags >1500m locations (~10% UV per 1000m). Eyes-uncovered mode triggers a clear "never look directly at the sun" reminder.',
      '<b>Light therapy devices, first-class.</b> Joovv panels, Mito Red, Sperti UVB lamps, Verilux SAD boxes, dawn simulators, full-spectrum bulbs — pick from a 24-device preset library or add a custom device. Therapy sessions feed the same channels as outdoor sun, so a Joovv user with no outdoor time still gets credit for the cellular-repair channel.',
      '<b>Indoor light environment matters too.</b> Map the rooms you spend time in (LED type, hours/day, after-sunset use) and the screens you stare at. The AI now sees the half of your day when you\'re indoors — not just the outdoor half — and the deficit signals (LED-only contamination, blue-after-sunset hours) flow into the same channels.',
      '<b>Eight on-device measurement tools.</b> Lux Meter · Flicker Detector (PWM banding via 240 fps camera + FFT) · Color Temperature meter · Light classifier (LED / fluorescent / incandescent / daylight) · Glass transmission test · Sleep darkness meter (long-exposure check at the pillow) · Sunrise/sunset session logger · Eye-Level Audit (walkthrough that auto-snapshots a reading per room). Camera frames never leave your device.',
      '<b>For biohackers: depth without lock-in.</b> Manual UVI override in Conditions Now feeds your own UV-meter reading into the math. Each channel pill expands to show its action spectrum + 2–3 PubMed/journal references (CIE 174:2006 for vit D, CIE S 026 for melanopic, etc.) and a 7-day per-day rhythm chart. Saved sessions show solar zenith, altitude, ozone column, UVB/UVA split — audit exactly what the engine saw. "How we estimate" expander defines MED / IU / ±50% range / channels in one place.',
      '<b>Sidebar got a quiet upgrade.</b> Conditional entries for ☀ Light & Sun · ⌚ Wearables · 💊 Supplements · 🌸 Cycle · 📡 EMF · 🧬 Genetics now appear when their module has data. Zero impact for users who don\'t use them; better discoverability for power users.',
      '<b>AI sees the full picture.</b> Every chat now carries a Light & Sun summary — your active deficits, your therapy device library, your week\'s per-channel exposure (sun + devices combined), and your daily burn-dose state. Once you have ≥4 weeks of overlapping sessions and labs, channel-by-biomarker correlations join the standard tier.',
      '<b>Privacy posture.</b> Location resolves from your country (set in profile) — no automatic geolocation prompt at session start. You can opt-in to precise location once for sharper estimates. UV/ozone fetches via Open-Meteo by default; self-host CAMS via the External-server panel. Camera frames and sensor readings stay on-device.',
      '<b>Five Lenses framing.</b> getbased is organized around five lenses on your biology — 🩸 <b>Labs</b>, 🧬 <b>Genome</b>, ⌚ <b>Body</b>, ☀ <b>Light</b>, 🧠 <b>Insight</b>. Anti-reductionist by design: every lens informs every other, the AI synthesizes across all of them.',
      '<b>Behind the scenes.</b> Cross-device sync, vitamin D math, IndexedDB storage for large blobs, accessibility (keyboard + screen-reader), and a stack of internal correctness fixes all hardened in this release.',
    ]
  },
  {
    version: '1.5.1', date: '2026-04-29', title: 'Bugfixes & improvements',
    items: [
      '<b>Genetics rows in the marker detail modal no longer duplicate.</b> When a SNP carried both a raw finding and an actionable hint pointing at the same marker, the same gene rendered twice with the same study link. Now collapses to a single row.',
      '<b>"Open App" link in the docs site works on every host.</b> Was producing https://app.getbased.health/app (which doesn\'t exist) on the app subdomain. Now host-aware — points to the right place from localhost, getbased.health, app.getbased.health, or anywhere else.',
    ]
  },
  {
    version: '1.5.0', date: '2026-04-29', title: 'Audit, bugfixes & improvements',
    items: [
      '<b>Security hardening.</b> PDF importer bumped to close a known font-handling vulnerability. AI-supplied marker keys are now validated before touching your data. OpenRouter login + every wearable OAuth callback gained CSRF + 10-minute pending-state expiry.',
      '<b>Sync + chat reliability.</b> Profile-swap no longer drops a pending sync push. Wearable data shows up in chat right after you sync (AI context cache now invalidates on summary changes). Streaming AI replies no longer drop the final chunk on missing trailing newline.',
      '<b>Wearable connect</b> handles the "missing user id" failure mode (Polar) cleanly instead of stranding sync in a reauth loop. OAuth callback during a profile swap is caught — the connection lands in the right profile.',
      '<b>PWA offline first-launch is fixed</b> — installing and going offline no longer breaks chat or the Knowledge Base.',
      '<b>Cycle + biological age fixes.</b> Long perimenopause cycles (60–90 days) no longer get truncated to 45. Biological age now requires hs-CRP, not standard CRP — the two assays measure very different ranges.',
      '<b>Corrupt profile recovery.</b> If your profile data ever gets corrupted (browser crash mid-write), the app preserves the original bytes for recovery instead of silently substituting an empty profile.',
      '<b>Accessibility pass.</b> Dashboard cards, trend alerts, heatmap cells, supplement rows — every clickable surface is now keyboard-reachable. Settings tabs and the Charts/Table/Heatmap toggle are proper tablists. The Layers dropdown closes on Escape.',
      '<b>Weight units</b> respect your chosen system everywhere (US users see "lb"). Light-mode mobile address bar picks up your theme on first paint instead of flashing dark.',
    ]
  },
  {
    version: '1.4.0', date: '2026-04-28', title: 'Smarter chat search, easier setup, more flexibility',
    items: [
      '<b>Chat now stays out of your way.</b> When you open chat, the dashboard automatically shifts left to fit alongside the panel — every chart and section stays visible, scroll and clicks work as normal. New <b>⛶ fullscreen toggle</b> in the chat header for when you want an immersive conversation; your preference is remembered between sessions.',
      '<b>The Knowledge Base finds more of your notes.</b> Your AI provider now rephrases each question before searching — a search for "Black Seed Oil" also finds notes titled "Nigella Sativa"; "insulin sensitivity" pulls in "metabolic flexibility". Adds about a second on the first matching question. Toggle off in <b>Knowledge Base → Improve recall with query rewriting</b> if you want pure local search.',
      '<b>Knowledge Base has its own dedicated panel</b> with a one-click entry from the dashboard. Modern laptops now default to a stronger embedding model when creating a new on-device library, for noticeably better recall.',
      '<b>The dashboard nudges you to set up things you might have missed.</b> Three quiet pills appear under the Interpretive Lens row when something is unconfigured: <b>Personalize how AI answers</b> (Lens + Knowledge Base), <b>Protect your data</b> (Encryption + cross-device Sync + auto-backup), and an <b>Add your DNA data</b> CTA in the genetics section. Each pill goes away once everything is set up.',
      '<b>Self-hosters can bring their own OAuth apps</b> for Oura / Withings / Ultrahuman / Polar / WHOOP / Fitbit. Set <code>OURA_CLIENT_ID</code>, <code>WITHINGS_CLIENT_ID</code>, etc. alongside the existing <code>*_CLIENT_SECRET</code> values in <code>.env.local</code> and the app uses your OAuth app instead of the maintainer\'s. Hosted users see no change. See the updated Wearables guide.',
      '<b>Marker Glossary retired</b> — it was redundant with the sidebar (browse + search), each marker\'s detail page (ranges + history), and the AI chat (plain-English explanations).',
      '<b>Accessibility:</b> dashboard rows + clickable cards are now keyboard-activatable (Enter/Space), icon-only buttons gained explicit labels, and modals move focus inside on open + dismiss on backdrop click + Escape.',
    ]
  },
  {
    version: '1.3.20', date: '2026-04-27', title: 'Region-aware recommendations + clearer privacy',
    items: [
      '<b>Set your country in the profile editor</b> and recommendations now show products and URLs available in your market — Czech users land on Czech storefronts, US users on .com sites, etc. Each rec section\'s footer reads "Showing for {country} · change" so you always know what\'s being filtered.',
      '<b>Privacy is now its own Settings tab.</b> The analytics opt-out is right there, with a transparency banner on first launch — counts only, no IP, no health data, cookieless. The PDF/image/chat obfuscation pipeline (now labeled "AI Privacy Protection") is in the same place.',
      '<b>EMF assessment</b> now also surfaces recommended meters (empty state) and mitigation products (after interpretation), tied to the issues actually flagged. Toggle Settings → Display → "Show product recommendations" off if you don\'t want them. Affiliate disclosure is built in; brands cannot pay for placement.',
    ]
  },
  {
    version: '1.3.9', date: '2026-04-27', title: 'App footer — trademark attribution + Privacy/Terms links',
    items: [
      'New <b>fineprint block</b> below the dashboard footer: trademark attribution for every wearable vendor whose logo we display (nominative fair use), <b>Privacy</b> and <b>Terms</b> links to the public site, and a Linktree anchor for the maintainer.',
    ]
  },
  {
    version: '1.3.8', date: '2026-04-26', title: 'Wearables — connect your devices, share with AI agents',
    items: [
      '<b>Five wearables, one dashboard.</b> Connect Oura, Fitbit, Withings, Polar, or Apple Health (file import). Or log weight / BP / resting HR by hand. HRV, sleep, recovery, body composition, blood pressure, steps — every signal your hardware produces surfaces in a single strip alongside your blood work. Withings users get the full Body Scan / ScanWatch / BPM picture: body fat %, muscle / bone / water mass, vascular age, PWV, SpO₂, body and skin temperature, sleep architecture (deep / light / REM / awake / breathing rate / snoring / apnea-class), nerve health — cards auto-hide when your device doesn\'t measure that signal. (WHOOP and Ultrahuman support is built but private-beta only while we validate partner credentials.)',
      '<b>Tap any card for detail.</b> 90-day chart, baselines, rolling averages, every individual reading, manual-entry CRUD. Multiple devices? Tap the <i>via Oura</i> / <i>via Fitbit</i> source badge to switch which one drives the card. Reorder the strip via the ⇄ button — hold per profile, sync across devices.',
      '<b>Overnight and daytime, separately.</b> HRV and heart rate split into recovery (overnight) and reactivity (daytime) so the AI can reason about both.',
      '<b>AI chat sees a compact summary</b> by default. External agents (Hermes, OpenClaw, Claude Code, anything MCP) connect via the new Agent Access tab — token, push controls, optional 7 / 30 / 90-day series for time-series reasoning.',
      '<b>Honest "as of {date}" dates.</b> If a metric\'s latest reading is older than its source\'s freshest reading (e.g. HRV from Oura\'s <code>/sleep</code> often lags daily_sleep by hours while the night\'s analysis finishes), the card surfaces the actual date so the value reads honestly. Hover for the explanation.',
      '<b>Privacy.</b> Raw daily samples never leave your device. Sync carries only the compact summary, encrypted end-to-end. OAuth tokens never sync — re-connect each device independently. Wearable storage is wrapped in AES-GCM when encryption-at-rest is enabled.',
      '<b>Settings reorganised.</b> Old Integrations tab split into <b>Wearables</b> (your devices) and <b>Agent Access</b> (read permission for AI). See the <a href="https://getbased.health/docs/guide/wearables">user guide</a> for the full setup walkthrough.',
    ]
  },
  {
    version: '1.23.0', date: '2026-04-24', title: 'DNA + mtDNA overhaul: 5 new SNPs, 11 sub-haplogroups, valence-aware UI',
    items: [
      '<b>5 new SNPs</b> across three new categories: ALDH2 (alcohol flush + cancer risk), CYP1A2 (caffeine metabolism), MTNR1B (late-eating glucose impact), FTO (obesity, exercise-attenuated), and CETP I405V (longevity variant). Curated set: 42 → 47.',
      '<b>11 new mtDNA sub-haplogroups</b> (H1, H3, J1, J2, K1, T1, T2, U5a, U5b, U6, A2) so consumer mtDNA tests resolve to the level they were measured at — not rolled up to the parent. Total: 28 → 39 haplogroups. Smarter matcher picks the more-specific sub-clade on equal scores.',
      '<b>Genetics dashboard tells you what is good news.</b> New orange dot for mild effects (previously invisible), green dot for beneficial variants (PCSK9, CETP, LIPC, PPARG protective), white dot for informational/lab-artifact findings (FUT2 secretor status). Legend explains the scheme at the top of the section.',
      '<b>DNA interpretation recalibrated</b> against 2020s literature: MTHFR A1298C, MTR, VDR FokI, ADIPOQ +45 effect labels tightened from <i>moderate</i> to <i>mild</i> where modern meta-analyses show only modest effects. FUT2 wild-type (GG) corrected from <i>moderate</i> to <i>none</i>. CETP TaqIB strand fix: table was keyed on old reverse-strand alleles (G/T) from 2002 papers; every modern DNA vendor reports forward-strand (G/A), so every heterozygous CETP TaqIB call silently mis-matched until today. TCF7L2 notes softened from verdict-language to tendency-language.',
      '<b>Illumina GenomeStudio (DNAEra) DNA format</b> now supported. Parser handles all the wrapped probe-name variants (<code>seq-rsXXX</code>, <code>GSA-rsXXX</code>, <code>ilmnseq_rsXXX</code>, <code>BOT-</code>, <code>TOP-</code>, etc.) so wrapped probes still hit the SNP lookup. First-non-missing call wins on duplicate probes.',
      '<b>Supplement mito-effect database refreshed:</b> added Urolithin A, Methylene Blue, Spermidine, Fisetin, Caffeine, and Ethanol — the most conspicuous omissions. Mechanism notes updated for Metformin (Complex I primacy contested by 2018-2024 mGPDH/AMPK research), Aspirin (uncoupling is high-dose only), Resveratrol (SIRT1 binding contested), and Melatonin (protective antioxidant, not direct activity boost). Total compounds: 108 → 114.',
      '<b>Recommended models bumped:</b> Claude Opus 4.7 and GPT-5.5 now surface in the recommended section across OpenRouter, PPQ, Routstr, and Venice as soon as each provider catches up.',
      '<b>Existing imports keep working,</b> but <b>re-import your DNA / mtDNA file once</b> to populate the 5 new autosomal SNPs, refresh CETP TaqIB heterozygous calls (silently mis-matched until today on existing imports), and resolve the 11 new mtDNA sub-haplogroups. Recalibrated effect labels and the dot-color refresh happen automatically.',
    ]
  },
  {
    version: '1.21.7–9', date: '2026-04-20', title: 'Code hygiene',
    items: [
      'Dead code removed, internal architecture doc trimmed, chat panel split into smaller modules. No user-visible change.',
    ]
  },
  {
    version: '1.21.6', date: '2026-04-20', title: 'Docs accuracy sweep',
    items: [
      'Custom API added to the provider list (it\'s been supported since v1.16.1 — the table just missed it).',
      'Personal-agents and Agent Access setup guides updated to the one-command installer.',
    ]
  },
  {
    version: '1.21.5', date: '2026-04-20', title: 'Security hardening',
    items: [
      'Attribute-safe HTML escaping across every user-authored field — closes a class of self-XSS when strings contained a bare double quote.',
      'Tightened the Vercel AI proxy so it can\'t be abused to reach private networks or cloud-metadata services.',
      'New tests covering the markdown renderer (every streamed AI response passes through it).',
    ]
  },
  {
    version: '1.21.4', date: '2026-04-20', title: 'Per-library embedding model',
    items: [
      'Pick from four embedding models when you create a new on-device Knowledge Base library — MiniLM (fast, small), BGE-small (balanced English), Multilingual-E5 (100+ languages), or BGE-base (best English quality).',
      'getbased benchmarks your hardware on first load and pre-selects the strongest model your device can run smoothly.',
      'The model is locked at creation — switching would mean re-indexing every document, so the choice is made upfront. Existing libraries continue on MiniLM with no forced migration.',
    ]
  },
  {
    version: '1.21.3', date: '2026-04-20', title: 'One-command Knowledge Base setup',
    items: [
      'External server setup is now a single terminal command: <code>curl -sSL https://getbased.health/install.sh | bash</code> (Linux). Installs the agent stack, starts the services, prints a one-click dashboard login URL.',
      '"Cautious?" footer with commands to review or verify the script before running — source is public, SHA256 is published.',
      'Linux-only for now. macOS and Windows install the package but can\'t auto-start services; the panel says so explicitly instead of silently leaving them stuck.',
    ]
  },
  {
    version: '1.21.2', date: '2026-04-20', title: 'Sync fix on Chrome for Android',
    items: [
      'Cross-device sync now works on Chrome for Android — a pre-flight check was wrongly blocking it.',
      'Updated stale Settings copy that still mentioned the retired Electron build.',
    ]
  },
  {
    version: '1.21.1', date: '2026-04-19', title: 'Knowledge Base setup polish',
    items: [
      'Simpler external-server setup flow in Settings → Knowledge Base.',
      'OpenClaw joins the list of supported MCP clients.',
    ]
  },
  {
    version: '1.21.0', date: '2026-04-18', title: 'Knowledge Base libraries',
    items: [
      'Multiple libraries — keep research papers, clinical guides, and personal notes in separate collections, switch between them from Settings.',
      'Faster retrieval on modern browsers (up to 3–10×), with a transparent fallback on older ones.',
      'More document types supported: PDF, Word, Markdown, plain text, and ZIP archives.',
      'Background indexing with cancel — close Settings and keep working while long runs process, stop early without losing what\'s already indexed.',
    ]
  },
  {
    version: '1.20.1', date: '2026-04-16', title: 'Bug fixes',
    items: [
      'Custom API key now works after page reload (#124).',
      'Context cards (diet, sleep, stress, and the rest) update on screen immediately after saving — no reload needed (#123).',
      'Closed a same-origin bypass on the dev-server proxy route (#119 follow-up).',
    ]
  },
  {
    version: '1.20.0', date: '2026-04-15', title: 'Custom Knowledge Source',
    items: [
      'Connect your own RAG knowledge endpoint to the Interpretive Lens — the AI grounds its analysis in research, clinical guides, or documents you provide.',
      'Works across chat, multi-persona discussions, and the focus card.',
      'Bug fixes: GPT-5 / o-series support in Custom API (#114), Custom API settings now persist across backup + sync (#116).',
    ]
  },
  {
    version: '1.19.2', date: '2026-04-14', title: 'Sync Context Fix',
    items: [
      'Specialty lab data (Fatty Acids, OAT, etc.) now syncs completely even when excluded from AI chat',
      'Fixed a bug where sync silently failed to push lab data to the gateway',
    ]
  },
  {
    version: '1.19.0', date: '2026-04-12', title: 'Precise Supplement Dosing',
    items: [
      'New "Doses/day" field on supplements \u2014 set once as the default multiplier for every ingredient in a combo product',
      'Per-ingredient \u00d7/day override \u2014 for stacks where different ingredients have different schedules (e.g. Mg Bisglycinate 1\u00d7 AM + Taurate 2\u00d7/day)',
      'Live daily total next to each ingredient as you type \u2014 catches entry mistakes before saving',
      'AI receives explicit daily totals (no more guessing the math from free-text dosing)',
      'Comma-decimal parsing fixed \u2014 "5,4 mg" now parses correctly instead of dropping the decimal',
      'Impact analysis cache is now per-supplement \u2014 editing one supp re-analyzes only that supp, not the whole batch',
    ]
  },
  {
    version: '1.18.4', date: '2026-04-11', title: 'Security Fixes + Codebase Refactoring',
    items: [
      'Fix Vitamin D mcg/L import \u2014 unit now correctly converts to nmol/L (#102)',
      'Custom API key now encrypted at rest when encryption is enabled (#103)',
      'Dev server locked to localhost, proxy endpoints require same-origin (#104, #105)',
      'Filename XSS fix in import preview (#106)',
      'Image import PII warning \u2014 confirmation dialog before sending images to AI (#107)',
      'Codebase refactoring \u2014 extracted markdown, backup, lab-context, provider-panels into separate modules',
    ]
  },
  {
    version: '1.18.0', date: '2026-04-10', title: 'Import Provenance + Supplement Intelligence',
    items: [
      'Import provenance \u2014 every value tracks which PDF or manual entry it came from, shown on hover in detail modal',
      'Supplement ingredients \u2014 add manually, scan a label photo, or paste a product URL to auto-extract with AI',
      'Supplement impact analysis \u2014 AI before/after biomarker comparison with health dot and cached results',
      'Focus card \u2014 respects AI context toggles, cleaner output with thinking models, bounded context',
      'Thinking model fix \u2014 reasoning content no longer leaks into chat or focus card',
    ]
  },
  {
    version: '1.16.3', date: '2026-04-08', title: 'BioStarks Adapter',
    items: [
      'BioStarks adapter \u2014 native support for BioStarks dried blood spot panels (amino acids, fatty acids, intracellular minerals, vitamins, hormones, metabolism)',
      '23 new specialty markers with BioStarks-specific reference ranges \u2014 12 amino acids, 5 serum fatty acids (\u00b5mol/L), 3 intracellular minerals (\u00b5g/gHb), cortisol, T/C ratio, vitamin E',
      'Hybrid import \u2014 standard blood markers (glucose, lipids, etc.) map to standard categories for trend tracking alongside other labs',
    ]
  },
  {
    version: '1.16.1', date: '2026-04-08', title: 'Custom API Provider',
    items: [
      'Custom API provider \u2014 connect to any OpenAI-compatible endpoint with your own base URL and API key',
      'Dynamic model list \u2014 models fetched automatically from your endpoint, with manual model ID fallback',
    ]
  },
  {
    version: '1.16.0', date: '2026-04-07', title: 'Decentralized Routstr',
    items: [
      'Decentralized AI \u2014 discover Routstr nodes via Nostr relays, connect to any node directly from your browser',
      'In-app Cashu wallet \u2014 BIP-39 seed, Lightning deposit/withdraw, Cashu token send/receive, mint selection',
      'Node picker \u2014 browse online nodes, deposit sats, withdraw back to wallet, auto-mint compatibility',
      'Wallet recovery \u2014 seed phrase restore, pending deposit/withdraw recovery, encrypted backup via sync',
    ]
  },
  {
    version: '1.15.1', date: '2026-04-07', title: 'AI Context Optimization',
    items: [
      'Memoize lab context \u2014 skip redundant rebuilds across chat messages, health dots, and focus card',
      'Trim health dot context \u2014 only send stale card sections to AI, reducing tokens per refresh',
      'Skip redundant data pipeline clone in health dot pre-check',
    ]
  },
  {
    version: '1.15.0', date: '2026-04-05', title: 'PPQ + Wallet Topups',
    items: [
      'New AI provider: PPQ \u2014 300+ models, no KYC. Bitcoin, crypto + Bitrefill topup',
      'In-app wallet topup \u2014 fund Routstr (Lightning QR + Cashu) and PPQ (Lightning, Bitcoin, Monero, Litecoin, Aqua) directly in getbased',
      'Balance display for OpenRouter, Routstr, PPQ, and Venice in settings',
      'Removed Anthropic direct provider \u2014 Claude models available via OpenRouter, PPQ, Venice, Routstr',
      'Bugfixes and improvements',
    ]
  },
  {
    version: '1.14.0', date: '2026-04-01', title: 'Routstr + Tor + Audit',
    items: [
      'New AI provider: Routstr \u2014 pay with Bitcoin eCash or Lightning. No account, no subscription',
      'Tor hidden service \u2014 full app accessible via .onion. Sync relay auto-switches to .onion. Tor Browser shows ".onion available" badge on clearnet',
      'Codebase audit \u2014 8 bug fixes, 6 accessibility fixes, 2 security hardening, dead code cleanup',
    ]
  },
  {
    version: '1.13.2', date: '2026-03-31', title: 'Agent Access',
    items: [
      'ISO timestamps on all lab values in AI context \u2014 precise dates instead of month/year for better trend analysis',
      'Delta indicators (\u2191/\u2193/\u2192) on all multi-reading markers \u2014 compares to previous reading for accurate recent-trend direction',
      'Rename OpenClaw to Agent Access \u2014 works with getbased-mcp on Hermes Agent, OpenClaw, or any MCP-compatible agent',
    ]
  },
  {
    version: '1.13.1', date: '2026-03-31', title: 'DEXA Scan Support',
    items: [
      'New Body Composition category \u2014 body fat %, lean mass, fat mass, BMI, android/gynoid fat, A/G ratio, visceral fat area',
      'New Bone Density category \u2014 BMD spine/femur, T-scores and Z-scores (total + neck) with WHO classification ranges',
      'Sex-specific reference and optimal ranges for body fat %',
      'Detail modal: hide no-data date cards, color-coded top border (green/red/yellow by status)',
    ]
  },
  {
    version: '1.13.0', date: '2026-03-29', title: 'Tips & Recommendations',
    items: [
      '80 tip slots across biomarkers and lifestyle — Nature \u2192 Whole Food \u2192 Tools \u2192 Supplements',
      'Every supplement form linked to a PubMed study (239 references). Community corrections via GitHub',
      'Fitzpatrick skin type (I\u2013VI) in Light & Circadian card',
      'Local AI CORS help now works on all browsers and shows OS-specific instructions',
    ]
  },
  {
    version: '1.12.0', date: '2026-03-27', title: 'Sync Status & Fixes',
    items: [
      'Sync status indicator in header — green/amber/red dot shows relay connectivity, push confirmation, and pull status',
      'Click the sync dot for details: relay status, last push/pull timestamps, "Sync now" button',
      'Manual mtDNA haplogroup entry in Edit Client form and chat onboarding — no mutation file needed',
      'Fix modal windows closing when drag-selecting text to outside the modal (#87)',
      'Fix 23andMe v5 raw data import — newer export header variant was unrecognized (#89)',
      'PDF report now includes "Additional notes for AI context" field (#92)',
      'PDF report shows precise dates (day + month + year) instead of month only (#93)',
    ]
  },
  {
    version: '1.11.0', date: '2026-03-26', title: 'mtDNA Haplogroup',
    items: [
      'Import mtDNA mutation files (CSV) — resolves maternal haplogroup from diagnostic mutations',
      'Mitochondrial coupling classification based on Doug Wallace\'s framework (coupled → uncoupled)',
      'Environment mismatch detection — compares your haplotype\'s climate adaptation against your latitude',
    ]
  },
  {
    version: '1.10.4', date: '2026-03-26', title: 'Biometrics',
    items: [
      'Track height, weight, blood pressure, and resting pulse in the Edit Client form',
      'Auto-calculated BMI from height + latest weight with category label',
      'Time-series entries with date, averages, and history list for weight, BP, and pulse',
      'Biometrics included in AI context, JSON export/import, and PDF report',
    ]
  },
  {
    version: '1.10.3', date: '2026-03-25', title: 'Food Contaminants',
    items: [
      'Diet card scanned for food contaminant signals — pesticide residues (EWG Dirty Dozen) and plastic chemicals (PlasticList)',
      'Clickable warning on diet card opens detail modal with sources and "Discuss with AI" prompt',
      'Both mito warnings and food contaminants now included in AI context for smarter analysis',
    ]
  },
  {
    version: '1.10.2', date: '2026-03-25', title: 'Mitochondrial Warnings',
    items: [
      'Supplements & medications scanned against independently compiled mitochondrial effects database (PubMed-cited)',
      'Warnings appear below the supplement timeline — only harmful effects flagged (inhibits, depletes, disrupts)',
      '"Ask AI for context" opens the chat with a pre-filled prompt about your specific compounds',
    ]
  },
  {
    version: '1.10.1', date: '2026-03-25', title: 'Chat Summaries',
    items: [
      'Summarize any conversation thread — generates structured notes with key findings, action items, and open questions',
      'Summary modal with copy, download (.md), and print',
      'Saved summaries persisted per-profile and listed in the thread rail',
    ]
  },
  {
    version: '1.10.0', date: '2026-03-25', title: 'Context Tags',
    items: [
      'Section tags in AI context output — machine-parsable [section:name] tags for OpenClaw bot integration',
      'Lab categories include updated:date attributes and an [index] block for selective parsing',
    ]
  },
  {
    version: '1.9.9', date: '2026-03-25', title: 'Sync reliability',
    items: [
      'Fixed sync relay quota — CRDT operations no longer silently fail when exceeding relay limits',
      'Chat messages now refresh live when synced from another device',
      'Added sync diagnostics and polling safety net for missed sync events',
    ]
  },
  {
    version: '1.9.7', date: '2026-03-23', title: 'OpenClaw',
    items: [
      'OpenClaw integration — connect your self-hosted AI bot to answer questions about your labs over any messenger (Settings → Data → OpenClaw)',
    ]
  },
  {
    version: '1.9.6', date: '2026-03-23', title: 'Sync fixes',
    items: [
      'Fixed sync relay connection — data now correctly routes to the self-hosted relay instead of the default Evolu relay',
      'Fixed mnemonic regeneration — disabling and re-enabling sync generates a fresh identity',
      'Fixed chat thread sync when encryption is enabled',
      'Fixed chat history loss when AI stream errors mid-response (#84, #85)',
    ]
  },
  {
    version: '1.9.5', date: '2026-03-22', title: 'Cross-device sync',
    items: [
      'Cross-device sync — E2E encrypted via Evolu CRDT. All profiles and AI settings sync automatically across your devices',
      'Self-hosted relay with live connectivity indicator — no third-party dependencies',
    ]
  },
  {
    version: '1.9.4', date: '2026-03-20', title: 'Proportional chart timelines',
    items: [
      'Chart x-axes now use proportional time spacing — a 1-month gap looks smaller than a 6-month gap, so trends are visually accurate',
      'Fixed phase-aware point colors and tooltips for markers that start later than your first lab draw (female profiles with cycle tracking)',
    ]
  },
  {
    version: '1.9.3', date: '2026-03-20', title: 'Context change history',
    items: [
      'AI now knows when your health context changed — diet switches, new exercise routines, stress changes, etc. are timestamped and included in AI context so it can reason about temporal correlations with your lab results (#76)',
      'Chart timelines extend to today when your last labs are more than 30 days old, so supplements and notes added since then are visible (#78)',
    ]
  },
  {
    version: '1.9.2', date: '2026-03-20', title: 'Supplements, notes & export improvements',
    items: [
      'Focus card now includes supplements with date-aware context — AI no longer attributes changes to supplements started after your last labs (#80)',
      'Add a note/reason to each supplement to track why you\'re taking it — shown in editor, chart tooltips, AI context, and PDF report (#74)',
      'Per-biomarker notes — add persistent notes to any marker from the detail modal, included in AI context (#79)',
      'Genetics section added to PDF export report — full table of findings grouped by category with effect severity (#73)',
      'Removed Sources (OpenAlex) feature — web search via OpenRouter provides better academic coverage',
    ]
  },
  {
    version: '1.9.1', date: '2026-03-19', title: 'Thinking model support + Ollama Cloud',
    items: [
      'Thinking models (Kimi K2.5, DeepSeek R1/V3, GLM-5, QwQ) no longer produce empty responses — max_tokens cap removed so reasoning and content both fit',
      'Focus card and context card health dots work with all thinking models on any provider',
      'Ollama Cloud :cloud models recognized in Model Advisor with cloud badge and fitness ratings',
    ]
  },
  {
    version: '1.9.0', date: '2026-03-19', title: 'Venice End-to-End Encryption',
    items: [
      'Venice E2EE — prompts encrypted in your browser, decrypted only inside a verified TEE. Toggle in Venice settings swaps to E2EE models',
      'Per-message lock indicator (🔒 e2ee) in chat footer when E2EE was used',
      'Web search context hints — model knows when it has web access and when to suggest enabling it',
      'Chat links in user messages now visible (white on accent gradient)',
      'Thread list no longer reorders when switching between conversations',
    ]
  },
  {
    version: '1.8.5', date: '2026-03-19', title: 'Fatty acid trends + smarter trend colors',
    items: [
      'Fatty acid panels now show trend charts across multiple tests — previously only the latest result was visible',
      'Trend arrow colors reflect whether the change is good or bad relative to reference ranges (not just direction)',
      'Raw URLs in chat responses are now clickable links',
      'Fix: importing fatty acid results alongside blood work on the same date no longer loses the FA data',
    ]
  },
  {
    version: '1.8.4', date: '2026-03-18', title: 'Web search in chat',
    items: [
      'Web search toggle in chat — AI can search the internet before responding, useful for recent studies, drug interactions, and current information',
      'Available with OpenRouter and Venice providers; toggle auto-hides for Anthropic and Local AI',
      'Cost footnote shows 🌐 web indicator when search was active; flag persists in message history',
    ]
  },
  {
    version: '1.8.3', date: '2026-03-17', title: 'Chat search + scroll fix',
    items: [
      'Search across chat messages — find any keyword across all conversations with highlighted snippets, click to jump directly to the message (#72)',
      'Smart auto-scroll during AI streaming — scroll up to read earlier text without the chat fighting you back to the bottom (thanks @NodeVonHydra)',
      'Fix: toggling AI provider no longer auto-opens the chat panel (#71)',
    ]
  },
  {
    version: '1.8.2', date: '2026-03-16', title: 'Image import + scanned PDF auto-detect',
    items: [
      'Import lab reports from photos/screenshots (JPG, PNG, WebP) — drop or browse, same AI pipeline as PDF image mode',
      'Scanned PDFs auto-switch to image mode — no manual step needed (#67)',
      'Model Advisor works with all Local AI backends — LM Studio, Jan, not just Ollama (#68)',
      'Focus card persists when AI is paused — shows cached insight instead of disappearing (#69)',
      'DNA import: detect raw data files by content, not just filename — fixes silent failure for renamed 23andMe exports (#70)',
    ]
  },
  {
    version: '1.8.1', date: '2026-03-15', title: 'Biological Age + hs-CRP/HDL',
    items: [
      'Biological Age — combines PhenoAge (Levine 2018, 9 markers) and Bortz Age (Bortz 2023, 22 markers) into a single estimate with chronological age reference line',
      'hs-CRP/HDL Ratio — composite inflammation-lipid cardiovascular risk marker (optimal < 0.24, ref < 0.94)',
      'PhenoAge now accepts standard CRP as fallback when hs-CRP is unavailable',
    ]
  },
  {
    version: '1.8.0', date: '2026-03-15', title: 'DNA Import',
    items: [
      'Drop a raw DNA file (Ancestry, 23andMe, MyHeritage, FTDNA, Living DNA) — parsed locally in a Web Worker, never transmitted',
      '42 curated SNPs across 10 categories (methylation, iron, lipids, vitamin D, B12, blood sugar, sex hormones, thyroid, bilirubin, fatty acids) mapped to your tracked biomarkers',
      'APOE haplotype auto-resolved to ε2/ε3/ε4 notation from the two component SNPs',
      'Genetics dashboard section — collapsible, grouped by category, sorted by severity, expandable to show all findings',
      'Inline SNPs in biomarker detail modals — open Vitamin D and see your VDR, GC, CYP2R1 variants right next to your lab values',
      'AI chat automatically receives your genetic context when interpreting lab results',
      'Each SNP links to its primary study (PubMed) and SNPedia for deeper reading',
      'Sidebar entry and DNA upload step in chat onboarding',
    ]
  },
  {
    version: '1.7.7', date: '2026-03-14', title: 'Local AI Model Advisor',
    items: [
      'Settings → Local AI now rates each installed model for lab analysis: ★ Recommended, Capable, Underpowered, or Inadequate',
      'GPU auto-detected — shows which models fit your VRAM (fits / tight / too large)',
      'Suggests a better model to pull when none of your installed models are recommended',
      'Model dropdown shows file size and quantization at a glance',
      'Remote Ollama servers detected — enter server VRAM manually for accurate recommendations',
    ]
  },
  {
    version: '1.7.6', date: '2026-03-14', title: 'Focus Card + Chat Polish',
    items: [
      'Focus card now considers your health goals, interpretive lens, medical conditions, and context notes',
      'Expanded from one sentence to a brief 2-3 sentence insight with a concrete next step',
      'Typewriter streaming effect — text trickles in smoothly instead of popping in after a wait',
      'Chat now renders markdown tables, blockquotes, headings, and styled callouts',
      'PhenoAge detail modal shows exactly why calculation failed — per-date gaps, CRP mismatch, unit issues',
      'Open-ended optimal ranges now display correctly on charts and in all views',
    ]
  },
  {
    version: '1.6.2', date: '2026-03-10', title: 'Create Custom Biomarkers',
    items: [
      'Manually create new biomarkers — "+" button next to Categories in the sidebar',
      'Define marker name, unit, category (existing or new), and reference range',
      'After creation, immediately prompts to add the first value',
      'Custom markers are included in the AI marker reference for future PDF imports',
    ]
  },
  {
    version: '1.6.1', date: '2026-03-10', title: 'Import Fixes, Usage Tracking & New Markers',
    items: [
      'AI usage tracking — see per-profile and total AI costs in Settings → AI tab',
      'Cost guide added to docs — real-world pricing estimates for recommended models',
      'Plateletcrit (PCT/Trombokrit) added as a built-in hematology marker',
      'Calcitriol (1,25-(OH)₂D) added as a built-in vitamin marker',
      'Hematocrit now displays with % unit (existing data auto-migrated)',
      '18 missing unit conversions added (thyroid, iron, proteins, lipids, hematology, bone, tumor markers)',
      'Insulin now syncs between Hormones and Diabetes categories regardless of how the AI mapped it',
      'Both-range mode shows reference + optimal ranges on dashboard cards',
      'Sidebar counts now match the active date range filter',
      'Sidebar date filter hides single-point categories (Fatty Acids, etc.) outside the range',
      'PDF filename shown in Settings data list',
      'Refresh all health dots button (↻) on context cards',
      'PII review: visible Edit button for obfuscated text',
      'Reference range badges from lab imports show "lab ×" instead of "edited ×"',
      'Import no longer stores redundant range overrides when lab ranges match defaults',
      'Context cards preserve open/collapsed state on save',
      'Focus card prompt improved for local models',
      'Import preview: wider modal, status badges no longer wrap',
      'Guided tour updated to 8 steps with import FAB and profile button',
      'Light theme scrollbar improved for better visibility',
    ]
  },
  {
    version: '1.5.3', date: '2026-03-08', title: 'Import & Editing Improvements',
    items: [
      'When importing a PDF, you can now exclude individual results and see the lab\'s reference ranges before confirming',
      'New import button in the bottom-right corner for quicker access to importing',
      'Changed a value? A revert button lets you go back to what the lab originally reported',
      'Use any AI model on OpenRouter by typing its ID directly',
      'AI discussions now pick up where you left off after refreshing the page',
      'Automatic backups saved daily and kept for 30 days',
    ]
  },
  {
    version: '1.5.2', date: '2026-03-08', title: 'Chat & Discuss Mode Improvements',
    items: [
      'Get a second opinion — pick which AI persona joins your chat discussion',
      'Marker charts and values display correctly in the detail view',
      'Create custom AI personas with a cleaner editor and auto-generated emoji',
      'New "Unconventional Views" option when creating AI personas',
      'Imported vs manually entered values are now labeled in Settings',
    ]
  },
  {
    version: '1.4.3', date: '2026-03-07', title: 'Improved Fatty Acids Support',
    items: [
      'Improved support for fatty acid panels — each lab appears as its own subcategory under a "Fatty Acids" sidebar group',
      'Auto-detects fatty acid lab from PDF content',
      'Re-importing a PDF now updates category labels instead of keeping stale ones from previous imports',
    ]
  },
  {
    version: '1.4.2', date: '2026-03-07', title: 'Bugfixes & Improvements',
    items: [
      'Edit any value — click a value in the detail modal to change it inline, with "edited" badge',
      'Fix: manually added values now store correctly in US unit mode',
      'Compact drop zone on dashboard after first import',
      'Auto-backup cooldown increased to 5 minutes to avoid snapshot churn',
      'PII review: retry button stays visible after successful obfuscation',
    ]
  },
  {
    version: '1.4.1', date: '2026-03-07', title: 'Bugfixes & Improvements',
    items: [
      'Fix: lab reference ranges from US-unit PDFs now import correctly',
      'Fix: PII review diff highlighting works properly with thinking models',
      'Improved PII review editing — cursor lands where you click, highlights persist after edits',
      'Better matching for US lab markers like BUN',
    ]
  },
  {
    version: '1.3.7', date: '2026-03-06', title: 'Reference Ranges & PII Improvements',
    items: [
      'Editable reference ranges — click any range in the detail modal to customize, with revert badge',
      'Import-time range adoption — toggle to use your lab\'s reference ranges from the PDF',
      'BUN/Creatinine ratio added as a calculated marker in the Kidney category',
      'PII review: green word-level diff highlighting on the right panel, click-to-edit',
      'PII review: model unloads from VRAM on Stop, Cancel, or Use Regex',
      'US lab PII patterns: Specimen ID, Accession No, Account No, MRN, phone, Member ID',
      'IU/L enzyme unit normalization (ALT, AST, ALP) — no more double-conversion on import',
      'Empty marker charts hidden in category views',
      'Background scroll locked on PII review modals',
    ]
  },
  {
    version: '1.3.6', date: '2026-03-05', title: 'Settings Cleanup',
    items: [
      'Profile tab removed from Settings — sex, date of birth, and location are now in the Client List',
      'Location field in Client List now shows live latitude with AI refinement (same as the old Settings)',
    ]
  },
  {
    version: '1.3.5', date: '2026-03-05', title: 'Security & Accessibility Audit',
    items: [
      'Fixed XSS vectors in PDF import preview and settings error messages',
      'Chat threads now encrypted at rest when encryption is enabled',
      'Orphaned CSS cleaned up, ARIA labels added to chat inputs and modals',
      'Avatar src validated, LAN IPs excluded from service worker caching',
    ]
  },
  {
    version: '1.3.4', date: '2026-03-05', title: 'Backup & Key Encryption',
    items: [
      'API keys are now encrypted at rest when encryption is enabled',
      'Folder backup writes timestamped snapshots and prunes to 5 files (matching IndexedDB)',
    ]
  },
  {
    version: '1.3.3', date: '2026-03-05', title: 'Local AI CORS Hints',
    items: [
      'HTTPS + LAN IP detection — immediate warning instead of a confusing timeout',
      'CORS-specific error message when Ollama blocks cross-origin requests',
      'Docs updated with localhost-only HTTPS limitation and OLLAMA_ORIGINS guidance',
    ]
  },
  {
    version: '1.3.2', date: '2026-03-05', title: 'Streaming PII Review',
    items: [
      'PII review modal now streams Local AI obfuscation in real-time \u2014 no more waiting blindly',
      'Regex fallback is an explicit button ("Use regex instead"), not a silent timeout',
      'Stop button to cancel mid-stream and edit partial results',
      'Fixed nested scrollbars in the PII review modal',
    ]
  },
  {
    version: '1.3.1', date: '2026-03-05', title: 'Unified Local AI',
    items: [
      'Provider tab renamed from "Ollama" to "Local" \u2014 one option for all local servers',
      'Removed Ollama/OpenAI mode toggle \u2014 uses the standard OpenAI-compatible API for everything (Ollama, LM Studio, Jan, etc.)',
      'PII obfuscation now works with any local server, not just Ollama',
      'API key field always visible (optional \u2014 most local servers don\u2019t need one)',
    ]
  },
  {
    version: '1.3.0', date: '2026-03-04', title: 'OpenAI-Compatible Local Servers',
    items: [
      'LM Studio, Jan, llama.cpp, LocalAI, and other OpenAI-compatible servers now supported',
      'Mode toggle in Local AI settings \u2014 switch between Ollama and OpenAI Compatible',
      'Optional API key field for servers that require authentication',
      'Auto-discovers models from any /v1/models endpoint',
      'Editable PII review \u2014 fix remaining personal info before sending to AI',
    ]
  },
  {
    version: '1.2.3', date: '2026-03-04', title: 'Folder Backup & Security',
    items: [
      'Auto-backup to a local folder (Proton Drive, Dropbox, NAS, etc.)',
      'Writes getbased-backup-latest.json + daily dated snapshots',
      'Periodic nudge reminds you to download a backup (every 30 days)',
      'Stronger passphrase requirements for encryption (8+ chars, mixed case, special)',
      'Live strength meter with rule checklist in encryption setup',
    ]
  },
  {
    version: '1.2.1', date: '2026-03-03', title: 'Export Upgrade',
    items: [
      'Per-client export from the Client List \u22ee menu',
      'Export All Clients \u2014 full database backup from Client List or Settings',
      'Exports include chat history, threads, and custom personalities',
      'Database bundle import with auto-merge across browsers',
    ]
  },
  {
    version: '1.2.0', date: '2026-03-03', title: 'Client Management',
    items: [
      'Client List modal \u2014 search, sort, filter, and manage all profiles',
      'Profile tags, notes, status (active/flagged/archived), and pinning',
      'Full client form replaces prompt dialogs (name, sex, DOB, location, avatar)',
      'Compact header button with avatar dot opens Client List',
    ]
  },
  {
    version: '1.1.4', date: '2026-03-01', title: 'Diet & Digestion',
    items: [
      '10 new digestion fields on the Diet card (bowel, bloating, reflux, etc.)',
      'Digestive health included in AI context',
    ]
  },
  {
    version: '1.1.3', date: '2026-02-28', title: 'Encryption Nudge',
    items: [
      'One-time prompt to enable encryption after first PDF import',
    ]
  },
  {
    version: '1.1.2', date: '2026-02-28', title: 'Documentation Update',
    items: [
      'New Specialty Labs guide (OAT, DUTCH, HTMA)',
      'Updated 6 guide pages with latest features',
    ]
  },
  {
    version: '1.1.1', date: '2026-02-28', title: 'Model Guidance',
    items: [
      'Model dropdowns split into Recommended / Other tiers',
      'Active model shown in chat header with per-message cost',
      'Cross-provider model mismatch warning fixed',
    ]
  },
  {
    version: '1.1.0', date: '2026-02-28', title: 'Specialty Labs & Brand Refresh',
    items: [
      'Specialty lab support (beta) \u2014 OAT, amino acids, fatty acids, toxic elements',
      'Brand refresh \u2014 getbased gradient wordmark, SVG icons, cleaner layout',
      'Batch import auto-retry and single dashboard refresh',
      'Ollama PII obfuscation now opt-in (Settings \u2192 Privacy)',
      '\u20bf Donate button in header',
    ]
  },
  {
    version: '1.0.5', date: '2026-02-27', title: 'One-Click OpenRouter',
    items: [
      'One-click OAuth connect \u2014 no more copying API keys',
      'OpenRouter is now the default provider tab',
    ]
  },
  {
    version: '1.0.4', date: '2026-02-27', title: 'Simplified First Visit',
    items: [
      'Welcome hero with drop zone and demo data',
      'Context cards collapsed by default for new users',
    ]
  },
  {
    version: '1.0.3', date: '2026-02-27', title: 'Chat Improvements',
    items: [
      'Floating chat bubble \u2014 always one tap away',
      'Setup guide when no API key is configured',
    ]
  },
  {
    version: '1.0.2', date: '2026-02-27', title: 'Pre-Lab Onboarding',
    items: [
      'No lab data? Fill context cards and get personalized test recommendations',
      'Chat prompts adapt to your state (pre-lab, onboarding, analysis)',
      'Health dots work on context alone, even without lab results',
    ]
  },
  {
    version: '1.0.1', date: '2026-02-27', title: 'Minor Tweaks',
    items: [
      'Minor tweaks and bug fixes',
    ]
  },
  {
    version: '1.0', date: '2026-02-25', title: 'Launch',
    items: [
      'AI-powered PDF import \u2014 any lab report, any language',
      '287+ biomarkers across 26 categories with interactive charts',
      'AI chat with customizable personalities',
      'Menstrual cycle-aware interpretation with phase-specific ranges',
      '9 lifestyle context cards that shape AI analysis',
      'Fully private \u2014 all data stays in your browser',
    ]
  },
];

/** Extract major.minor from a semver string (e.g. '1.0.1' → '1.0') */
function getMajorMinor(ver) {
  const parts = String(ver).split('.');
  return parts.slice(0, 2).join('.');
}

function getSeenVersion() {
  return localStorage.getItem('labcharts-changelog-seen') || '';
}

function markChangelogSeen() {
  localStorage.setItem('labcharts-changelog-seen', String(window.APP_VERSION));
}

// Changelog items are authored in source code (CHANGELOG above) — trusted.
// We escape everything by default and then re-allow a small whitelist of
// inline emphasis tags + safe-href anchors. Anything else (script, img,
// arbitrary attributes, javascript: URLs, etc.) stays escaped — defense-
// in-depth in case an entry ever incorporates user content.
function renderChangelogItem(item) {
  let out = escapeHTML(item);
  // Inline emphasis: <b>/<i>/<em>/<strong>/<code> render as styling.
  out = out.replace(/&lt;(\/?)(b|i|em|strong|code)&gt;/g, '<$1$2>');
  // Anchors: <a href="…">text</a>. Validate the protocol — only http,
  // https, and mailto pass; anything else (javascript:, data:, etc.)
  // strips back to plain text. External links open in a new tab with
  // noopener/noreferrer so the opener can't be navigated.
  out = out.replace(
    /&lt;a href=&quot;(.+?)&quot;&gt;(.+?)&lt;\/a&gt;/g,
    (match, escapedUrl, inner) => {
      // The captured URL is HTML-escaped (& → &amp; etc.). Decode for the
      // protocol check, but emit the escaped form back into the href so
      // ampersand-bearing URLs (?foo=1&bar=2) round-trip correctly.
      const decoded = escapedUrl.replace(/&amp;/g, '&');
      if (!/^(https?:|mailto:)/i.test(decoded)) return inner; // unsafe → drop the wrapper, keep text
      const isExternal = /^https?:/i.test(decoded);
      const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escapedUrl}"${attrs}>${inner}</a>`;
    }
  );
  return out;
}

export function openChangelog(showAll) {
  const overlay = document.getElementById('changelog-modal-overlay');
  const modal = document.getElementById('changelog-modal');
  if (!overlay || !modal) return;

  const entries = showAll ? CHANGELOG : CHANGELOG.slice(0, 3);

  let html = `<button class="modal-close" aria-label="Close" onclick="closeChangelog()">&times;</button>`;
  html += `<h3>What's New</h3>`;

  for (const entry of entries) {
    html += `<div class="changelog-entry">`;
    html += `<div class="changelog-header"><span class="changelog-version">v${escapeHTML(entry.version)} — ${escapeHTML(entry.title)}</span><span class="changelog-date">${escapeHTML(entry.date)}</span></div>`;
    html += '<ul class="changelog-items">';
    for (const item of entry.items) {
      html += `<li class="changelog-item">${renderChangelogItem(item)}</li>`;
    }
    html += '</ul></div>';
  }

  modal.innerHTML = html;
  overlay.classList.add('show');
}

export function closeChangelog() {
  const overlay = document.getElementById('changelog-modal-overlay');
  if (overlay) overlay.classList.remove('show');
  markChangelogSeen();
}

export function maybeShowChangelog() {
  const seen = getSeenVersion();
  // First visit — no changelog, just mark as seen
  if (!seen) { markChangelogSeen(); return; }
  // Only show What's New on minor/major bumps, not patch
  if (getMajorMinor(seen) !== getMajorMinor(window.APP_VERSION)) {
    openChangelog(false);
  }
}

Object.assign(window, { openChangelog, closeChangelog, maybeShowChangelog });
