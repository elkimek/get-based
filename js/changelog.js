// changelog.js — What's New modal, version tracking, auto-trigger on update
// APP_VERSION comes from /version.js (loaded as classic script before modules)

import { escapeHTML } from './utils.js';

const CHANGELOG = [
  {
    version: '1.7.7', date: '2026-05-13', title: 'Oura RHR matches the Oura app + zero-sentinel cleanup',
    items: [
      '<b>RHR now matches what your Oura app shows.</b> Resting Heart Rate on the dashboard used the night-long average from Oura\'s sleep payload, which runs 5–10 bpm higher than the true RHR. The Oura app\'s "Resting Heart Rate" card and trend graph use the lowest 5-min average during sleep (typically hit in deep sleep) — we now source from the same field. Existing rows refresh on the next sync.',
      '<b>Bad-night zeros render as gaps instead of floor dots.</b> Oura emits a literal <code>0</code> for HRV/HR scalars when a sleep session has no usable data (ring not worn, signal lost, sub-threshold session). Those zeros used to flow through to the history chart as a dot at the floor and drag the weekly mean down. Now treated as missing across HR, HRV, weight, body composition, and sleep durations — legitimate zeros (rest-day steps, no high-stress minutes, perfect-sleep awake time, body-temp deviation centered at 0) still display normally.',
      '<b>Oura Rest Mode still gets its dedicated hint.</b> When Rest Mode is on, activity_score is 0 every day by design — the card stays visible and the detail modal shows a short explanation pointing you to the Steps card for raw movement data.',
    ]
  },
  {
    version: '1.7.6', date: '2026-05-13', title: 'MyHeritage Low-pass WGS: strand-aware SNP matching',
    items: [
      '<b>The "Genotype not in lookup" group is gone.</b> MyHeritage\'s 2025 Low-pass WGS export reports every SNP on the build37 forward strand, but our catalog stored a handful of variants keyed on the opposite strand — so calls like <code>AC</code> for <b>PCSK9 R46L</b> or <code>TT</code> for <b>UGT1A1 G71R</b> silently missed the table and ended up labeled "not in lookup" even though they\'re standard, well-characterized genotypes. SNP lookups now try the reverse-complement as a fallback when the direct read misses, so MyHeritage forward-strand calls resolve to the right catalog entry across all eight affected loci (PCSK9, MTR, UGT1A1, MTRR, BHMT, FADS1 coding, LIPC -514, MC1R). Palindromic A/T and C/G SNPs (where strand flipping is ambiguous) keep the strict lookup to avoid false positives.',
      '<b>Mild-effect SNPs now appear in their own group.</b> Two protective heterozygotes — <b>CETP I405V (AG)</b> and <b>CYP1A2 *1F (AC)</b> — were correctly matched against the catalog but bucketed into "not in lookup" because the import preview only recognized three impact tiers. They\'re now rendered as <b>🟠 Mild findings</b>, between Moderate and Normal.',
      '<b>Honest coverage count.</b> Imputation-noise calls (alleles that aren\'t valid for the variant under either strand — e.g. a <code>CG</code> read at a C/T SNP) are now dropped at parse time instead of inflating the "not in lookup" group. The "X of Y health-relevant SNPs found" line reflects actually-curated matches.',
    ]
  },
  {
    version: '1.7.5', date: '2026-05-13', title: 'Accessibility polish across the dark theme',
    items: [
      '<b>Better readability in dark mode.</b> The muted grays used for footers, hints, and reference text were brightened to clear WCAG AA contrast on every background. A handful of small-text labels (footer trademarks, recommendation disclaimers) had a faint extra opacity layer that dragged them below threshold — that\'s gone now.',
      '<b>Form labels and screen reader names.</b> The chat onboarding fields, the Compare Dates picker, and several form selects now properly announce their purpose to screen readers. Marker-group expand/collapse buttons in the sidebar announce their open/closed state correctly as you toggle them.',
      '<b>Visible link cues.</b> The "primary study" / "more studies" links in the supplements card now carry a persistent underline so they\'re distinguishable without color alone.',
      '<b>Sidebar marker-group rows.</b> Mouse click-anywhere-on-row to toggle still works; keyboard navigation now lands on a real button rather than a div pretending to be one. The AI-context toggle stayed where it was, next to the flag count.',
    ]
  },
  {
    version: '1.7.4', date: '2026-05-12', title: 'See your values in both unit systems',
    items: [
      '<b>Alternate Units toggle (Settings → Display).</b> When on, the marker detail modal shows each value in both the active system AND the other one — <i>5.20 mmol/L · ≈ 93.7 mg/dL</i> for glucose, <i>140 mmol/L · ≈ 140 mEq/L</i> for sodium, <i>8.5 mU/L · ≈ 8.5 µIU/mL</i> for insulin. Off by default to keep the modal uncluttered for single-locale users. Reference + optimal ranges also render in both systems so a US user reading a Quest report (in <code>µIU/mL</code>) can match it against the app\'s EU SI numbers (in <code>mU/L</code>) without flipping the global toggle. Per-profile preference, persists across sessions.',
      '<b>Type values in either unit on manual entry.</b> The "+ Add Value Manually" form now offers a small unit picker next to the value field for markers with a known conversion. Default is the current display unit; flip it to type a value straight from a lab report printed in the other system, and the app converts to canonical SI before storage. Round-trip stays exact (5 mmol/L in, 5 mmol/L back out via the alt unit and home). The range sanity-check now uses alt-unit ranges so typing <i>90 mg/dL</i> in EU mode doesn\'t spuriously flag against the SI ref range.',
      '<b>Expanded unit coverage.</b> Added real conversions for <b>eGFR</b> (mL/s → mL/min), <b>GFR Cystatin</b>, <b>Cystatin C</b>, <b>hs-CRP</b>, and <b>CRP</b> (all now gain mg/dL displays alongside SI). Added label-only entries for markers where the number is the same but the printed label differs on US reports: <b>insulin</b> (mU/L = µIU/mL), <b>TSH</b>, <b>LH</b>, <b>FSH</b>, <b>sodium / potassium / chloride</b> (mmol/L = mEq/L), <b>WBC / RBC / platelets / differential absolute counts</b> (×10⁹/L = K/µL, ×10¹²/L = M/µL). Total coverage: 81 of 124 markers (was 66). Truly universal markers like homocysteine and percentages stay no-toggle since the label is the same in both systems.',
      '<b>MyHeritage Low-pass WGS imports work again.</b> MyHeritage\'s 2025 raw-data export prepends a <code>##fileformat=MyHeritage</code> comment block before the column header, which the detector was reading as the first line and failing on. The CSV now imports normally.',
      '<b>Bugfix: stale marker after switching unit systems.</b> If you flipped EU↔US while the manual-entry form was prepared, the form could carry the old display unit forward and convert your input through the wrong factor on save. The form now re-resolves every marker on open and on save, picking up the current display unit each time.',
    ]
  },
  {
    version: '1.7.2', date: '2026-05-12', title: 'Readable changelog links',
    items: [
      '<b>Hyperlinks in the What\'s New modal are now visible.</b> Links rendered as the browser-default blue and disappeared into the dark-theme background. They now use the same accent-blue + underline as chat-message and summary-modal links.',
    ]
  },
  {
    version: '1.7.1', date: '2026-05-12', title: 'Apple Health ZIP fix, encrypted-backup recovery, security hardening',
    // Carries a critical user action (re-export the encrypted backup), so
    // override the patch-skip in maybeShowChangelog and force the modal
    // even for users on the same major.minor (1.7.0 → 1.7.1).
    forceShow: true,
    items: [
      '<b>Apple Health ZIP imports work again.</b> Dropping an <code>export.zip</code> on Settings → Wearables → Apple Health was throwing "JSZip not loaded" — direct <code>.xml</code> drops were unaffected, but the ZIP path is the one most people use. The vendor unzip bundle now lazy-loads on first use. Thanks to <a href="https://github.com/Savi-1">@Savi-1</a> for the patch.',
      '<b>Encrypted backups, fixed — please re-export.</b> If you had encryption-at-rest turned on, every backup since v1.6.x silently exported <code>profiles: []</code> — a ~1 KB file with only your global settings, no profile data. Manual export, auto-backup, and folder-backup were all affected. Backups taken before today on encrypted installs are not recoverable; <b>strongly recommend re-exporting a fresh backup after updating.</b> Going forward, backups round-trip your profile data correctly. Thanks to <a href="https://github.com/Savi-1">@Savi-1</a> for the patch.',
      '<b>Security hardening.</b> Tightened the allowlist for marker keys interpolated into inline click handlers — defense-in-depth against a theoretical XSS via a maliciously-crafted lab PDF. PDF AI extraction was already sanitized at the parse boundary; this adds the same guard at the render boundary so legacy data and sync pulls can\'t slip through either.',
    ]
  },
  {
    version: '1.7.0', date: '2026-05-12', title: 'Medical History, per-value notes, smoother manual entry',
    items: [
      '<b>The Medical Conditions card is now Medical History</b> — same place, broader scope. Beneath your own diagnoses, a new <b>Family history</b> subsection captures first-degree relatives plus grandparents (mother, father, sibling, child, maternal/paternal grandmothers and grandfathers). Each entry takes a condition, optional age of onset, and an optional note. Family history reframes risk interpretation — a father\'s heart attack at 52 makes a borderline LDL more actionable, and the AI sees both your own diagnoses and what runs in the family.',
      '<b>The conditions list nearly tripled.</b> Was 27 entries (mostly metabolic / endocrine / GI). Now ~117, covering neuro (Alzheimer\'s, Parkinson\'s, Epilepsy, MS, migraine), 19 cancer categories (breast, prostate, colorectal, lung, melanoma, pancreatic, ovarian, lymphoma, leukemia, …), skin (Psoriasis, eczema, rosacea), mental health (bipolar, ADHD, autism, PTSD, OCD), additional autoimmune, musculoskeletal, eye, hearing, infectious / chronic, and several genetic / congenital conditions worth surfacing in family history. Autocomplete-clickable conditions with apostrophes (Alzheimer\'s, Hashimoto\'s, Crohn\'s, Graves\', Sjögren\'s, Cushing\'s, Parkinson\'s, Huntington\'s) — previously broken from the dropdown — are clickable again.',
      '<b>Notes on individual lab values.</b> Every reading in the marker detail modal now has a small <b>+ note</b> on hover. Attach context tied to a single date/marker: <i>"fasted 14h"</i>, <i>"retook because cuff felt loose"</i>, <i>"different lab"</i>, <i>"post-workout"</i>. Notes show as an italic line beneath the value; click to edit, × to remove. The AI sees these notes grouped by marker so a single reading\'s context can change how it\'s interpreted.',
      '<b>Manual entry is much faster for paper lab reports.</b> The marker modal\'s "+ Add Value" button moved above the Note section and is renamed <b>+ Add Value Manually</b> for clarity. The form gained: a <b>Save & Add Another</b> button that keeps the date and clears the value (enter a whole report top-to-bottom without re-picking dates), an optional <b>Note</b> field that saves to the per-value notes above, a <b>range sanity check</b> that flags values >10× the upper bound or <1/10 the lower bound (catches decimal/unit slips), a <b>duplicate-date confirm</b> that shows the existing value before overwriting, and a <b>session-remembered last date</b> so the next entry defaults to whatever date you just used. Plus: Enter to save, Esc to cancel, no future dates allowed.',
      '<b>Click any empty cell in Table view to add a value</b> with that column\'s date pre-filled. The view mode (Charts / Table / Heatmap) now sticks across navigation and survives saves.',
      '<b>Blood pressure renders as one card</b> ("120/80 mmHg") instead of two. Storage stays unchanged — sys and dia are still tracked separately under the hood — but the card face and detail view present them paired like every other BP app.',
      '<b>Manual BP entry, fixed.</b> Tapping the diastolic field no longer kicks the cursor back to systolic. The same idempotency fix also stops the form from rebuilding on every click inside it.',
      '<b>Table and Heatmap views hide markers you have no data for.</b> A 50-row category with values in 8 markers no longer scrolls past 42 rows of dashes — only markers with at least one reading render. Categories with no data at all show a one-line "import a PDF or use the sidebar" hint instead of an empty table.',
      '<b>Sticky header in Compare Dates.</b> Scroll long tables and the dates header stays on screen. Single page scrollbar (the old approach gave you two).',
      '<b>Inline value editing</b> now uses a full-width input instead of an 80px cell that clipped multi-digit values, refreshes the underlying table/heatmap on save (was showing stale values), and treats Escape as a real cancel (no longer flips your imported value to "manual" if you press Esc without changing anything).',
      '<b>PDF import accepts extensionless files</b> — magic-byte sniff catches files exported with no extension (common with OCRFeeder on Linux).',
      '<b>Wearable manual entry got chip + note parity.</b> The "+ Add reading" form in the detail modal now offers the same context chips (resting / morning-fasted / post-workout / stress for BP and RHR) and a freeform note field that the dashboard empty-card form has had. Notes show up under the reading in the entries list, and feed the AI alongside the numbers.',
      '<b>Category navigation no longer bounces to Dashboard.</b> Clicking 3M / 6M / 1Y range buttons, deleting a value, or saving a PDF import — anywhere the sidebar rebuilds in response — used to read a stale "active" state and redirect you to Dashboard. Fixed across all 10 places that had the pattern.',
      '<b>Bugfixes & improvements.</b> Family-history relative picker is grouped into Parents / Siblings & Children / Maternal grandparents / Paternal grandparents. Each family-history entry shows a small relative chip with emoji so a long list reads scannably by "who" before "what". The add-entry form stacks cleanly into two rows on mobile. Manual-entry value input width is now responsive (was clipping 6+ digit values like cholesterol or testosterone). Friendlier empty-state hints throughout Table / Heatmap / Family-history sections. Cross-device sync covers the new per-value notes and family history under the same per-row CRDT path everything else uses — no migration needed.',
    ]
  },
  {
    version: '1.6.19', date: '2026-05-11', title: 'Airplane-mode resilience + identity recovery',
    items: [
      '<b>"Push committed but never arrived"</b> — a small fraction of Evolu sync owners hit a state where the relay acked every push but never persisted anything, so a freshly-imported PDF would simply never show up on another device. Diagnose modal now flags this case explicitly (red dot, "your relay storage is empty despite recent pushes") and offers a one-click <b>Rotate identity</b> to recover. Server-side detection landed in the relay too.',
      '<b>Sun & weather data on airplane.</b> CAMS / Open-Meteo fetches now time out cleanly, fall back gracefully, and don\'t freeze the UV strip when you\'re offline. AI streams + requests gained timeouts so a wedged provider can\'t hang the chat panel.',
      '<b>Scroll-anchor stability.</b> Rapid navigation through AI-verdict cards no longer jumps around — the page restores to the element you focused, not a guessed pixel offset.',
      '<b>Measurement retention redesign.</b> Light & Sun room measurements now keep only the latest reading per (room, tool) instead of every historical sample. Walkthrough audits stay full-history.',
      '<b>Sessions list compaction</b> on the Light & Sun page — older sessions collapse so the page stays readable at 100+ sessions.',
    ]
  },
  {
    version: '1.6.2', date: '2026-05-11', title: 'Silent-reject detector foundation',
    items: [
      '<b>Chart-modal cleanup</b> — chart instances are now destroyed when the modal closes (small memory leak fix).',
      '<b>Foundation for the silent-reject detector</b> that landed in v1.6.19.',
    ]
  },
  {
    version: '1.6.1', date: '2026-05-10', title: 'Bugfixes & improvements',
    items: [
      '<b>PDF image import:</b> clicking Cancel on the AI-provider privacy warning aborts cleanly now (was hanging).',
    ]
  },
  {
    version: '1.6.0', date: '2026-05-04', title: '☀ Light & Sun — the lens for everything sunlight does to you',
    items: [
      '<b>☀ Light & Sun lens.</b> Sunlight does a lot more than make vitamin D. Track your exposure across six biological channels — Vitamin D, Body clock, Cardiovascular, Mood & hormones, Cellular repair, and Outdoor eye light — and correlate them with your labs and wearable data over time. One-tap session logging: tap when you go outside, tap again when you come back. Plain-English summary on stop with computed vit-D yield and burn-dose status.',
      '<b>Sun-safety guardrails.</b> Live alert at 70% + 100% of your daily burn dose. A photosensitizing-medication checkbox drops your threshold (tetracyclines, isotretinoin, NSAIDs, St John\'s Wort, others). Cumulative carry-over warning when yesterday + today push you over. High-altitude flag for locations above 1500m.',
      '<b>Light therapy devices, first-class.</b> Pick from a preset library (Joovv panels, Mito Red, Sperti UVB, Verilux dawn simulators, full-spectrum bulbs) or add a custom device. Therapy sessions feed the same channels as outdoor sun.',
      '<b>Indoor light + screens.</b> Map the rooms you spend time in and the screens you stare at. Each audit question carries a one-line photobiology explainer below it. Indoor light deficits feed back into your channel mix.',
      '<b>Eight on-device measurement tools.</b> Lux meter, flicker detector, color-temperature meter, light classifier, glass-transmission test, sleep darkness meter, sunrise/sunset logger, eye-level audit walkthrough. Camera frames stay on your device.',
      '<b>AI sees your sun.</b> Every chat now carries your active deficits, device library, week\'s per-channel exposure, and burn-dose state. After ≥4 weeks of overlapping sessions and labs, channel-by-biomarker correlations join the AI context automatically.',
      '<b>Faster, cleaner cross-device sync.</b> Each push ships only what changed (per-row deltas, gzipped) instead of one fat blob. Concurrent edits from phone and desktop merge cleanly. Self-serve relay-storage compaction lives in the Sync diagnose modal — no more "storage full, ping the maintainer."',
      '<b>Five Lenses framing.</b> getbased is now organized around five lenses on your biology — 🩸 <b>Labs</b>, 🧬 <b>Genome</b>, ⌚ <b>Body</b>, ☀ <b>Light</b>, 🧠 <b>Insight</b>. Every lens informs every other; the AI synthesizes across all of them.',
    ]
  },
  {
    version: '1.5.4', date: '2026-05-07', title: 'Bugfixes & improvements',
    items: [
      '<b>Don\'t want wearables?</b> Settings → Wearables → "Wearable integrations" toggles them off. The strip stays for your manual weight, BP, and pulse entries.',
      '<b>Edit a misread import date.</b> Settings → Data → "Edit date" on any imported entry — useful when the AI guessed wrong on an ambiguous numeric date like "12/7/2025".',
      '<b>Region-aware date parsing.</b> Set your country in the client editor and the PDF importer disambiguates DD/MM vs MM/DD correctly for new imports.',
    ]
  },
  {
    version: '1.5.2', date: '2026-05-02', title: 'Bugfixes & improvements',
    items: [
      'Internal hardening pass — small fixes across input sanitization and worker isolation.',
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
      '<b>Settings reorganised.</b> Old Integrations tab split into <b>Wearables</b> (your devices) and <b>Agent Access</b> (read permission for AI). See the <a href="https://docs.getbased.health/guides/wearables">user guide</a> for the full setup walkthrough.',
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

// Compare two semver strings — returns true when `a` is strictly newer
// than `b`. Tolerant of missing parts (treats "1.7" as "1.7.0").
function _semverGt(a, b) {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const ai = pa[i] || 0, bi = pb[i] || 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return false;
}

export function maybeShowChangelog() {
  const seen = getSeenVersion();
  // First visit — no changelog, just mark as seen
  if (!seen) { markChangelogSeen(); return; }
  // Only show What's New on minor/major bumps, not patch
  if (getMajorMinor(seen) !== getMajorMinor(window.APP_VERSION)) {
    openChangelog(false);
    return;
  }
  // Patch-level bumps normally don't auto-show, but a maintainer can flag
  // an entry as forceShow when it carries a critical user-action notice
  // (e.g. "re-export your encrypted backup" in v1.7.1). Scan all entries
  // newer than the user's seen version — a later non-forceShow patch must
  // not shadow an earlier critical entry. Idempotent because closeChangelog
  // advances seen to the current APP_VERSION.
  const hasForceShowAheadOfSeen = CHANGELOG.some(
    e => e && e.forceShow && _semverGt(e.version, seen)
  );
  if (hasForceShowAheadOfSeen) openChangelog(false);
}

Object.assign(window, { openChangelog, closeChangelog, maybeShowChangelog });
