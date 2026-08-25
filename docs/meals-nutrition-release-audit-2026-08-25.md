# Meals & Nutrition v1 pre-release audit — 2026-08-25

## Release decision

**Release candidate — no known local release blocker.** Meals & Nutrition,
Nutrition Setup, Fuel Mix Context, thumbnail-only meal Sync, and meal-specific
Local AI routing are ready for an initial production release and user feedback.
The feature remains photo-assisted and user-reviewed; it does not claim clinical
measurement or measured metabolism.

The exhaustive multi-browser and combined-coverage matrices remain GitHub Actions
release gates under the repository test policy.

## Path-complete product audit

| User path | Result | Release evidence |
| --- | --- | --- |
| Find the feature in Body or add Daily Nutrition to the Dashboard | Ready | Independent Daily Nutrition and Fuel Mix widgets; hard-reload hydration covered in the nutrition browser spec |
| Log a meal manually | Ready | Required meal type/time, editable nutrients and ingredients, reviewed save, and recent-meal display |
| Analyze one or several meal photos | Ready | Explicit Analyze action, provider consent, bounded uploads, progress, structured-output fallback, correction-aware recalculation, and editable review |
| Scan a nutrition label | Ready | Serving-basis extraction, deterministic consumed-amount scaling, source details, and editable review |
| Look up a barcode | Ready | Barcode-only Open Food Facts request, deterministic scaling, source/version metadata, encrypted cache, timeout/size defenses, and label fallback |
| Review uncertainty before saving | Ready | Assumptions, warnings, identity/portion evidence, source, request usage, and unknown values remain visible and editable |
| Open, edit, log again, or delete a saved meal | Ready | Deterministic portion edits, check-in preservation rules, new IDs for reused meals, durable deletion tombstones, and reload verification |
| Log a drink | Ready | Dedicated fast path; all beverage volume and plain water are stored separately and survive reload |
| Set nutrition targets and widget nutrients | Ready | Starter guides are distinct from personal settings, weight-aware protein options work, invalid values are rejected visibly, and the four-item widget limit is enforced at UI and data boundaries |
| Read Daily Nutrition | Ready | Seven-day complete-day averages, explicit logging coverage, unknown days kept distinct from zero, starter/personal guide wording, and up to four selected nutrients |
| Read Fuel Mix Context | Ready | Separate opt-in widget, carb/fat energy composition and amount, no overlap score, no universal optimum, and bounded personal check-in associations |
| Route meal analysis to another model | Ready | Regular meal-specific model control and AI Settings routing do not change the chat model or discard a meal draft; Local AI vision capability is restored automatically after refresh; Ollama, LM Studio, Unsloth Studio, and generic OpenAI-compatible endpoints receive provider-specific connection guidance |
| Compare models in Debug Mode | Ready | Same prepared photos, cross-provider defaults from configured connections, automatic discovery of a saved Local AI connection even when cloud AI is main, provider-specific credentials and endpoints, 2–4 model limit, sequential consent, partial retry, local reference scoring, token/cost display, encrypted device-local snapshot, and no claimed winner without a reference |
| Sync reviewed nutrition data | Ready | Meals use one deduplicated delta row per ID; targets use a small scalar; deletion tombstones prevent resurrection; compatibility blobs exclude repeated meal arrays |
| Protect photos and AI context | Ready | Original photos stay in memory only for a user-started analysis; storage, export, and Sync accept only bounded thumbnails; compact AI context contains aggregates, never photos or individual meals |
| Delete profiles or all local data | Ready | Dedicated nutrition databases and device keys participate in profile cleanup and full erasure; blocked cleanup keeps canonical data rather than pretending success |
| Keep demo/deleted profiles out of Sync | Ready | Tagged demos are blocked from save, push, pull, and reconciliation and legacy relay rows are retired; local profile deletion intent and pending tombstones block resurrection |
| Export and import profile data | Ready | Portable profile JSON includes validated reviewed meals and thumbnails but no original upload; nutrition archives round-trip through the encrypted local cache |
| Use the installed app offline | Ready | Every nutrition module and stylesheet is in the checked app shell; a cache-only cold PWA relaunch passes |
| Use the feature on a narrow screen or with assistive technology | Ready | Review, Debug comparison, Nutrition Setup, and drink logging fit the mobile modal; review focus handoff, 44 px controls, 16 px inputs, reduced motion, and automated WCAG A/AA checks pass |

## Release blockers closed in this audit

1. Nutrition Setup could save more nutrients than the widget displayed. The
   selection is now limited to four in both the UI and normalizer.
2. Unsaved defaults looked like personal targets. They are now labeled starter
   guides until the profile saves its setup.
3. Invalid target values could silently normalize to defaults. The editor now
   keeps focus, explains the invalid field, and saves only valid settings.
4. A failed target save could leave changed runtime state behind. The previous
   settings are restored on persistence failure.
5. Meal deletion removed the local record before its cross-device tombstone was
   durable. The tombstone now saves first, rolls back safely on failure, and the
   positive path is verified across reload.
6. Fuel Mix explanations and model/debug controls carried too much nested or
   duplicate copy. Their first-read surfaces are now compact, with technical
   detail kept behind optional disclosures or Debug Mode.
7. Repeated ingredient-portion edits could lose or freeze extended nutrients
   when a provider returned only meal totals. Single-item results now retain a
   complete component profile, label components retain all supported nutrients,
   and hidden multipliers avoid cumulative rounding drift.
8. Fresh meal-photo analysis exposed an empty **More nutrients** grid. The editor
   now separates **Energy & macros** from grouped detailed nutrition and enriches
   fully matched meals from a local, release-pinned USDA FNDDS pack. Ambiguous
   ingredients expose reviewable candidates; unsupported values stay unknown.
9. A partial FNDDS match still made the detailed nutrient tiles look empty.
   Reviewed matches now show clearly labeled matched-food partials without
   persisting them as unsupported whole-meal totals.
10. Legacy demo rows, duplicate profile rows, and interrupted profile deletes
    could recreate or repeatedly announce local-only profiles. Demo admission is
    now blocked across every Sync path, duplicate relay rows are retired, remote
    delete batches notify once, and durable delete intent prevents resurrection.
11. Replacing a photo or removing a corrected ingredient could retain stale
    ingredient-review metadata. The editor now clears or removes that metadata
    with the corresponding user action.
12. Local AI connection failures used one mixed Ollama/LM Studio help message.
    Help is now endpoint-specific, and Unsloth Studio is detected as a first-class
    provider with loaded-model and vision-state support where its API reports it.
13. The nutrition orchestrator crossed the repository's near-cap threshold and
    the generated module map was stale. Stored-image reconstruction moved into
    the analysis boundary, returning the orchestrator below the cap; the module
    map now records the final graph with no cycles.
14. A comparison could list cloud and Local AI models but preselect two models
    from the main provider. It now starts with the meal model and the active
    vision model from another configured provider; each run uses that provider's
    own credentials, consent scope, endpoint, and model ID.
15. Refreshing the application cleared the in-memory Local AI capability catalog,
    leaving the Log Meal photo model unavailable until Settings checked the
    connection. Opening Log Meal now restores the catalog in the background and
    refreshes the model and Analyze controls as soon as vision support is known.
16. With cloud AI selected as main, comparison did not restore a saved Local AI
    catalog until a local analysis had run. Opening comparison now checks the
    saved Local AI connection directly, bypasses stale discovery results, and
    refreshes the picker even when an earlier comparison is visible. It adds the
    Local vision models without changing the main provider or requiring an
    analysis first.

## Deliberate v1 limits

- Meal-photo identity and portions remain estimates that require review. Hidden
  ingredients cannot be inferred reliably, and micronutrients are calculated
  only when every material ingredient has compatible reviewed food-composition
  data.
- There is no duplicate-meal detector, named recipe builder, or user-confirmed
  complete-day marker in v1.
- Fuel Mix is logged intake composition, not Randle-cycle activation, insulin
  resistance, substrate oxidation, or metabolic flexibility.
- Original photos do not sync. This is a privacy and relay-size boundary, not a
  missing feature.

## Change-scoped verification

- 188/188 focused unit tests passed across analysis, calculation, food data and
  FNDDS enrichment, comparison, context, Fuel Mix, storage, summaries, Sync,
  targets, model routing, Local AI transport, consent, erasure, profile cleanup,
  demo exclusion, sync actions, and tombstones.
- 1,102/1,102 directly related repository contract tests passed: Sync 854,
  profile sharing 37, changelog 102, and changed wearable timing inputs 109.
- 46/46 focused Chromium journeys passed: 25 nutrition paths, 20 Local AI/Sync/
  dashboard/changelog paths, and one installed-PWA cache-only cold relaunch.
  These include automated WCAG A/AA checks and narrow-mobile layout assertions.
- TypeScript, check-JS, server and service-worker types, the zero-diagnostic
  strict-null ratchet, supply-chain check, 17 quality guardrails, architecture
  checks, and `git diff --check` passed.
- Architecture: 689 modules, zero dependency cycles. The nutrition orchestrator
  is 788 lines, below the repository's near-cap threshold.
- Production check: 2 startup JS files (1,142.2 KiB decoded), 156 lazy JS files
  (4,782.8 KiB decoded), and 328 precached resources (15,163.0 KiB decoded). The
  1,066,347-byte FNDDS pack is fetched and runtime-cached only after use; it is
  not part of profile storage or Synth Relay.
