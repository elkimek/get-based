# Testing and critical-workflow policy

Function execution coverage and protection of user workflows are separate
forms of evidence. A high global percentage does not prove that every input,
branch, race, device, or provider works correctly.

## PWA update acceptance

Update acceptance preserves the all-window ownership census and exact retained
build-cache checks. Check visible pending feedback, duplicate clicks, deferral,
message failures, timeout recovery, vanished waiting workers, unrelated replacements
and stale intent after page exit. Returning from the back/forward cache must restore
an installed version's manual Reload offer without automatically reloading; Later
must still dismiss it. [Banner tests](../tests/service-worker-update.test.ts)
and [browser transitions](../tests/pwa/update-acceptance.spec.ts) cover this boundary;
[worker ownership tests](../tests/service-worker-client-cache.test.ts) retain the
activation and cache protections. The small browser fixture is a protocol regression,
not whole-application release acceptance. Pre-protocol pages still require closing
all app windows because their old script cannot handle the new worker messages.

Same-build worker reinstall attempts must leave the active build cache intact
until deployment metadata, required resources and producer proofs pass. Failed
checks remove only the candidate; invalid existing producer proofs still reject
and invalidate their cache. Preserve resumable bodies, native ownership and
profile storage. [Unit regressions](../tests/service-worker-retry-aliases.test.ts)
and [real browser reinstall/reload cases](../tests/playwright/service-worker-install-ownership.spec.ts)
cover failed metadata checks before and after download, first-reload availability,
and unchanged synthetic localStorage/IndexedDB data.

## Choose checks for the change

Run relevant tests and lightweight compiler, architecture, quality, and build
checks locally. Use the commands in [CONTRIBUTING.md](../CONTRIBUTING.md).
Do not run the exhaustive browser or coverage matrix locally by default.

Pull requests use [the affected-test planner](../scripts/pr-test-scope.mts).
It follows imports and file references, transitive consumers, changed tests,
and deleted-module references. Shared dependencies and test-harness changes can
select a broader scope. A runtime module without selected test coverage blocks
the plan; unrelated tests cannot compensate for missing relevant tests.
The retained CI plan and job summary explain the selection.

Runnable test entries terminate dependency selection; a test listed by a planner
or source-audit tool is not an application input. Cached module URLs and the
bootstrap HTML are packaging references, so an indirect feature edit does not
pretend that the worker or HTML itself changed. Changed application modules
still select their actual transitive behavior consumers and the app-shell graph
and shipping-build contracts. Changes reaching application initialization also
retain actual AppShell hydration acceptance in shipping Chromium for the merge
gate and all four shipping browser projects in full verification. Unknown modules
and untested Svelte owners fail closed even when unrelated packaging checks are
selected.

The planner may qualify a precache inventory diff as additive only against its
actual Git base: the literal array must retain all existing entries in order,
only known local JavaScript module URLs may be added, and code outside the array
must be identical. It selects the added modules' behavior and exact graph checks.
Missing baselines, removals, reordered entries, unknown/non-module URLs, executable
array entries and worker changes retain complete offline lifecycle acceptance.

CI compiles canonical TypeScript, Tailwind and Svelte outputs on the producer and
runs all existing compiler, architecture, supply-chain and quality gates before
sealing generated siblings in a compressed stream. Virtual component facade
imports are checkout-independent so code and source maps remain reproducible.
Consumers restore the same catalog, qualify the exact
revision and authored-input inventory, and check every output body before reuse.
The rebuilt HTML travels with the generated output. Its input identity excludes
only the existing compiler-owned AppShell, early legal gate and two inline theme-style bodies;
unique boundaries, boot ordering and every other document byte remain verified,
as do all canonical component/style sources. Restoring a generated HTML payload
also checks that its authored document bytes match before any output is written.
Output writes qualify the same opened file descriptor before truncation and
reject symbolic or hard links.
The CI-only install mode verifies those hashes again inside npm prepare; absent,
stale, changed or linked payloads fail instead of silently skipping compilation.
Dependencies and their install scripts still run normally on each runner's OS.
Normal local npm installs continue to compile, and the shipping artifact keeps
its separate source/build-identity verification. No coverage or resource limit is
reduced by compiler reuse.

Positive Light device-library and device-options acceptance uses an explicit
catalog response from [the test fixture](../tests/helpers/light-device-catalog-fixture.ts).
Product availability can differ between the checked-in preview catalog and the
catalog fetched for a main build. The fixture supplies one known product through
the real HTTP server; the shipping bundles, catalog loader, affiliate policy,
service-worker caching, profile equality and cold-launch assertions remain real.
These positive journeys verify behavior for an available product, not membership
of a changing external production catalog. Artifact catalog identity is still
qualified separately before browser acceptance.

PR and main-push tests do not ordinarily collect whole-project coverage.
Nightly verification (02:17 UTC), manual full test runs, and explicit release
verification run the complete regression suite, critical coverage gates, and
combined production measurement.
A passing selective check is not a new whole-project coverage measurement.
The required PR `test` check owns affected acceptance. Its shipping matrix runs
only Chromium, with one to four nonempty file shards. Affected unit tests and
resource budgets remain required. In the merge tier, the same budget command runs
before tests on the first Chromium shipping shard, or the unit runner when no
shipping cases are selected. These executions use fresh browser profiles and keep
the existing budgets and retained artifact. Full verification keeps its separate
performance runner. Native-only behavior without a selected shipping
counterpart, directly edited native tests, and changed native browser harnesses
retain affected native execution. Other selected native regressions and shipping
Firefox, desktop WebKit and mobile WebKit cases are deferred to nightly/full
verification and listed in the retained plan. This changes when those regressions
run; it does not make their assertions optional in full verification. A successful
merge gate is narrower evidence than full or release acceptance.
Main pushes compare against the previous main SHA and use the same affected tier;
missing or initial history falls back to full verification. Superseded PR and main
runs are cancelled, while explicit full verification remains intact.
Full execution of the shared [test workflow](../.github/workflows/test.yml) includes the native Display
suite and all SvelteKit browser projects. [Release verification](../.github/workflows/release-evidence.yml)
reuses those full gates and adds separate real-model and container runtime checks.

The [native Knowledge Base acceptance](../tests/pwa/sveltekit-knowledge-base.spec.ts)
requires real Worker transport and OPFS persistence on Chromium, Firefox, desktop
WebKit and mobile WebKit. Its WebKit cases run on macOS Cocoa because the pinned
Linux WPE engine does not implement the required synchronous file-handle backend.
The Cocoa cases use isolated persistent profiles because the pinned private data
store exposes OPFS but cannot initialize its filesystem. A required native Worker
control verifies exact write, flush and read bytes across a complete browser
restart before the unchanged application acceptance runs; private-store behavior
is recorded only as a diagnostic. Standard UI shards for both shipping WebKit
projects also run on Cocoa; Chromium and Firefox shipping acceptance and all native
suites retain their Linux placement. The planner preserves the same global case
inventory and disjoint standard/OPFS partitions; the full aggregate rejects
missing or duplicate case receipts; the merge gate enforces the same exact-union
check against its selected Chromium collection. Broad Linux WPE shipping UI
acceptance is no longer a required gate. Its existing focused manual diagnostic covers only Lens
and Wearables and cannot establish complete WPE UI compatibility.

The [static SvelteKit distribution](static-sveltekit.md) has a local focused acceptance
command, `npm run test:sveltekit`, covering static aliases, CSP, delegated Display
preferences, offline first use, cold launch, stored data and explicit worker updates.
The [main-route acceptance supplement](../tests/pwa/sveltekit-main-route-acceptance.spec.ts)
walks the main routes with the keyboard in Dark desktop Chromium and emulated
mobile WebKit, checks scoped accessibility and horizontal overflow, and retains
screenshots and exact profile receipts through stopped-origin and cold launches.
It also checks the four default empty manual-metric calls to action across six themes
and two widths: primary text ink is an intentional readability improvement.
The manual-card Remove control sits at the bottom right so its coarse-pointer
target cannot cover the metric label.
Any scoped axe violation fails the journey, even when collection continues to
record later routes. Finite animations settle before visual sampling; motion stays
enabled, and the checks do not certify every intermediate animation frame.
The [category contrast case](../tests/pwa/sveltekit-category.spec.ts) checks actual
high-status badges and settled adverse trends in six themes, including the
intentional reduction of the scoped badge tint while retaining semantic red.
For gradient backgrounds that axe cannot resolve, these focused contrast cases
require each affected text node to pass a [rendered-background pixel check](../tests/helpers/rendered-gradient-contrast.ts).
The check retains the gradient, foreground semantics and geometry; unsupported
indeterminate results still fail. [Normative contrast cases](../tests/rendered-gradient-contrast.test.ts)
verify the pixel calculation independently of the browser journey.
These cases do not certify OS speech or physical devices.
Headless launch environments cannot access the user's desktop session.
`production:check` validates the default SvelteKit distribution in a disposable
directory and enforces its committed offline-cache absolute and reference-growth
budgets. Build an artifact and run `npm run performance:check -- --artifact dist`
for its separate startup and first-use transfer gates; all measured samples must
pass, while timing remains diagnostic. These checks use synthetic data and preserve
UI, data, CSP and request qualification independently of resource limits. The
[static-build contract](static-sveltekit.md#build-identity-and-size-measurements)
defines conditions, headroom and retained-cache ownership.
`performance:native:check` and `native:compatibility:check` keep the original native
budget gates as separate compatibility measurements. The native cold-load
diagnostic has its own Playwright configuration; the four functional lazy-loading
cases remain in the default browser suite. Compiler and coverage safety remain intact.

`tests/production-build.test.ts` qualifies the shipping Kit artifact. With
`GETBASED_KIT_ARTIFACT` it rejects stale source inventories and changed public
assets before checking the complete generated graph and resource policy. Without
it, the test creates and cleans up one isolated build. CI resolves the catalog
before building once, then reuses those bytes for the contract and transfer gates.
Generated coverage reports do not change application identity; their maintained
producer sources and configuration remain authored build inputs.

The shared health-context catalog has focused component contracts in
[`context-card-catalog.test.ts`](../tests/context-card-catalog.test.ts), native
notes/AI/tips workflows in the context-card Playwright cases, and actual cached
static-PWA coverage in
[`sveltekit-chat-onboarding-optional.spec.ts`](../tests/pwa/sveltekit-chat-onboarding-optional.spec.ts).
[`context-notes-ownership.test.ts`](../tests/context-notes-ownership.test.ts)
checks captured-profile writes, commit confirmation, ordered revisions, retry drafts,
retired controls, missing baselines and failed reads. The actual-storage headless
[`context-notes-owned.spec.ts`](../tests/playwright/context-notes-owned.spec.ts)
checks profile changes, simultaneous authored catalogs, unique labels, textarea
identity/focus preservation during hydration and updates, rebuilds, actual IndexedDB write
failures, recovery across fresh profile loads, conflicting saved text and both
recovery choices. Recovery controls also receive focused accessibility and layout
checks. Atomic conflict checks and unrelated-field preservation are covered by
[`profile-write-concurrency.test.ts`](../tests/profile-write-concurrency.test.ts).
[`context-lifestyle-form-ownership.test.ts`](../tests/context-lifestyle-form-ownership.test.ts)
checks authored lifestyle fields, canonical values, empty contexts, commit confirmation,
retry, captured profiles, retired controls and unrelated drafts. The same atomic
storage suite checks observed context fields and reordered object keys.
[`context-lifestyle-forms-owned.spec.ts`](../tests/playwright/context-lifestyle-forms-owned.spec.ts)
checks real field interactions, persistence/history, reopen, clear confirmation,
profile retirement, actual IndexedDB failure/retry, keyboard controls, Diet clock/unit
formats, legacy estimates, nutrition precedence, clean modal handoff to the
contaminant tool and shared form styles in all six themes at narrow/wide widths.
Lifestyle loader cases cover retirement and overlapping opens.
[`context-environment-owned.spec.ts`](../tests/playwright/context-environment-owned.spec.ts)
checks both launcher states in every theme, hidden legacy values, actual EMF
stylesheet failure/retry, assessment creation/return, and retirement of delayed
opens and return callbacks. [`emf-runtime.test.ts`](../tests/emf-runtime.test.ts)
checks caller guards without discarding shared module caching.
[`context-light-owned.spec.ts`](../tests/playwright/context-light-owned.spec.ts)
checks setup metadata, retained skin type, clear isolation, all six themes and
keyboard entry to the actual Light setup. Deferred setup callbacks are retired
by profile changes, newer authored forms and native modal replacements.
[`sun-defaults-ownership.test.ts`](../tests/sun-defaults-ownership.test.ts) checks
staged defaults and mirrored skin as one guarded profile transaction, failed-read
blocking, captured-profile completion, retry and both local/peer conflicts.
The focused [`light-setup-owned.spec.ts`](../tests/playwright/light-setup-owned.spec.ts)
cases verify actual IndexedDB failure without live or stored publication, accessible
error/draft retention, retry, rejected persistence callbacks, old prompt retirement
and delayed save/location responses across reopened dialogs and profile changes.
[`sveltekit-light-setup.spec.ts`](../tests/pwa/sveltekit-light-setup.spec.ts) verifies
offline first use, actual canonical storage, cancellation and two cold launches
against the assembled static artifact.
[`light-onboarding-ai-presentation.test.ts`](../tests/light-onboarding-ai-presentation.test.ts)
checks providerless cached results, all verdict states and escaped literal values.
[`light-onboarding-ai-owned.spec.ts`](../tests/playwright/light-onboarding-ai-owned.spec.ts)
checks six-theme accessibility, narrow/wide layouts, keyboard/touch controls,
reduced motion and actual delegated loading, failure, retry and persisted results.
[`sveltekit-light-onboarding-ai.spec.ts`](../tests/pwa/sveltekit-light-onboarding-ai.spec.ts)
checks offline first use of cached results, setup-save preservation and two cold
launches with full stored-profile equality. These checks establish their named workflows;
they do not substitute for whole-application release acceptance.
[`ai-verdict-ownership.test.ts`](../tests/ai-verdict-ownership.test.ts) checks
late singleton responses/errors, same-ID work in another profile, queued context,
retry retirement, profile reload/switch epochs and removed/replaced targets.
[`light-ai-ownership.spec.ts`](../tests/playwright/light-ai-ownership.spec.ts)
uses actual profile switching, onboarding requests and canonical storage with
full unrelated-profile equality. Its static counterpart,
[`sveltekit-light-ai-ownership.spec.ts`](../tests/pwa/sveltekit-light-ai-ownership.spec.ts),
checks offline first use and two cold launches retaining both profiles' results.
[`ai-verdict-persistence.test.ts`](../tests/ai-verdict-persistence.test.ts) uses
actual profile storage to check failed and delayed verdict/error/purge writes,
accepted writes across profile switching and unrelated unsaved-field isolation.
[`ai-verdict-adapters.test.ts`](../tests/ai-verdict-adapters.test.ts) checks all ten
production adapters against a private snapshot while another profile is active,
including singleton containers and daily-cache trimming.
[`sveltekit-light-ai-persistence.spec.ts`](../tests/pwa/sveltekit-light-ai-persistence.spec.ts)
forces an actual IndexedDB profile-write failure through the shipped refresh UI,
then checks an unchanged saved/live verdict, successful retry, unrelated profile
equality and two offline cold launches. These focused checks do not establish
whole-application release acceptance.
[`ai-action-ownership.test.ts`](../tests/ai-action-ownership.test.ts) checks all ten
rendered actions against profile/root/epoch replacement and retained row controls.
[`light-session-ai-presentation.test.ts`](../tests/light-session-ai-presentation.test.ts)
compares 72 frozen original-renderer semantic trees through actual Sun/device
adapters, including provider gates, action attributes, literal escaping and incomplete
records. [`light-session-ai-owned.spec.ts`](../tests/playwright/light-session-ai-owned.spec.ts)
checks original geometry, separately specified accessible foregrounds, six themes,
two widths, keyboard actions, coarse targets and reduced motion.
[`sveltekit-light-session-ai.spec.ts`](../tests/pwa/sveltekit-light-session-ai.spec.ts)
opens actual Sun/device cached verdict details on offline first use and two cold
launches while retaining the entire canonical profile. The static profile-owner
check also exercises a retained A control after switching to B.
[`light-environment-ai-presentation.test.ts`](../tests/light-environment-ai-presentation.test.ts)
compares 90 frozen measurement/room/screen/audit trees through their actual
adapters. [`light-environment-ai-ownership.test.ts`](../tests/light-environment-ai-ownership.test.ts)
checks delayed analysis across profile/root/epoch changes and same-owner deduplication.
[`light-environment-ai-owned.spec.ts`](../tests/playwright/light-environment-ai-owned.spec.ts)
checks original geometry, declared accessible foreground/touch improvements,
keyboard behavior and reduced motion across six themes and two widths.
[`sveltekit-light-environment-ai.spec.ts`](../tests/pwa/sveltekit-light-environment-ai.spec.ts)
opens cached environment verdicts through the actual assessment/audit UI on offline
first use and two cold launches while checking complete canonical profile equality.
[`light-review-ai-presentation.test.ts`](../tests/light-review-ai-presentation.test.ts)
compares the captured daily/dashboard/Weekly/burden states and deterministic Weekly
summaries, including the dashboard fallback and literal escaping. The
[`review ownership checks`](../tests/light-review-ai-ownership.test.ts) cover
queued work across profile/root/epoch changes and shared daily deduplication.
[`light-review-ai-owned.spec.ts`](../tests/playwright/light-review-ai-owned.spec.ts)
checks original geometry, six themes, two widths, foreground contrast, focus and
coarse targets. [`sveltekit-light-review-ai.spec.ts`](../tests/pwa/sveltekit-light-review-ai.spec.ts)
opens actual cached reviews offline and checks full canonical profile equality
over two cold launches. These focused checks do not establish whole-app acceptance.
[`views-router-refresh.test.ts`](../tests/views-router-refresh.test.ts) checks
that background same-route refreshes preserve an open mobile menu while explicit
navigation and route changes still close it. The static persistence check also
returns through the actual mobile menu immediately after failed AI persistence.
[`sveltekit-context-forms.spec.ts`](../tests/pwa/sveltekit-context-forms.spec.ts)
checks the editors through real catalog actions with the assembled static PWA,
including offline first use, committed history, Light setup metadata/skin preservation
and actual setup entry, Environment-to-EMF creation/return, and two cold launches with full stored-profile equality. Its offline
boundary drops origin-server connections while the real worker/cache serves the app.
[`context-card-status-ownership.test.ts`](../tests/context-card-status-ownership.test.ts)
checks simultaneous authored assessment/tips publication, literal text, unique IDs,
assessment invalidation after changed facts/notes/demographics,
rebuilds, subscriptions, profile retirement and delayed/disabled/failed recommendation
loads. [`context-status-owned.spec.ts`](../tests/playwright/context-status-owned.spec.ts)
checks actual shared views, themed narrow/wide styles including extracted notes,
reduced motion, accessibility and keyboard tips across a delayed stylesheet. [`sveltekit-context-status.spec.ts`](../tests/pwa/sveltekit-context-status.spec.ts)
checks actual static assessment caching and two offline cold launches with literal
text and no new health inference. The same static case opens the real catalog tips
offline on first use and after each cold launch, including lazy CSS and keyboard close. Existing
request/cache browser cases mount the same authored slots rather than fabricated
global-ID spans. [`context-card-tips.test.ts`](../tests/context-card-tips.test.ts)
checks authored dialog projection, SNP filtering, APOE ownership, strand-aware
lookup, escaped metadata, study-link protocols and assessment reminder boundaries.
[`context-tips-owned.spec.ts`](../tests/playwright/context-tips-owned.spec.ts) checks
actual lazy modal rendering, all six themes at narrow/wide widths, accessibility,
keyboard close/EMF actions and reuse after another editor. Existing recommendation
browser contracts exercise the same authored tips renderer.
These checks do not prove complete migration of context editors
and nutrition fragments.

The five `knowledge-base-*-frozen.test.ts` / `knowledge-base-public-order.test.ts`
suites compare the complete authored panel/library structure, form defaults,
status and document content, dirty edits, carets, native node identities and
service/FIFO/timer traces against 97 immutable original cases, plus one public
service-order contract. Only documented Svelte anchors, reviewed formatting
contexts and an explicit utility-token allowlist are normalized. Literal text,
NBSP, meaningful inline separators and domain behavior remain exact. The separate
sequential-job lifecycle test covers the accepted cleanup and Stop-reset repair.
These deterministic synthetic Worker tests do not establish real model/store,
headless browser, offline persistence or install acceptance.

[`knowledge-base-comparator.test.ts`](../tests/knowledge-base-comparator.test.ts)
ensures normalization still rejects changed literal text, NBSP, inline separators,
unreviewed comments/classes and native input defaults.

[`lens-ingest-lifecycle.test.ts`](../tests/lens-ingest-lifecycle.test.ts)
checks sequential Knowledge Base indexing jobs across separate UI factories.
Each accepted job must restore its Stop control, and a previous job's delayed
cleanup must leave the current progress UI intact. The current job retains its
three-second completion lifetime. The test uses the actual public UI, text parser
and serialized local API with synthetic Worker replies, timers and a Node
FileList-like container; real browser file selection, store/model persistence
and PWA acceptance require separate checks. Saving still commits once, while
Stop cancels without replacing the previously saved corpus or clearing its cache.

[`sveltekit-knowledge-base.spec.ts`](../tests/pwa/sveltekit-knowledge-base.spec.ts)
checks the public Knowledge Base modal, native create cancellation, four-model
selector defaults, Markdown file selection, Worker FIFO and saving acknowledgement,
OPFS corpus checksums, nested rename cancellation and confirmed rename. It verifies
whole OPFS byte equality and unrelated profile preservation through two fresh
closed-client launches after the artifact HTTP server stops. Only the existing
Worker `?mock=1` embedder hook is enabled; parsing, transport, library transactions
and service-worker caching remain actual production code. The exact query Worker
is fetched by a second native Worker under service-worker control, and its cached
bytes must match the artifact. These checks do not establish real model downloads,
inference quality, physical OS installation or whole-application acceptance.

[`cycle-overview-frozen.test.ts`](../tests/cycle-overview-frozen.test.ts) compares
complete authored overview structure, controls and literal content against
immutable original output, including compact limits, phase sources, ordered
alerts, opaque values and original errors. The controller must leave caller
inputs and profile state unchanged. [`cycle-overview-owned.spec.ts`](../tests/playwright/cycle-overview-owned.spec.ts)
compares the original and authored styles and bounds in production full Body and
half/full dashboard wrappers across themes and breakpoints. These focused checks
preserve the separate editor, import and storage acceptance boundaries below.
[`sveltekit-cycle-overview.spec.ts`](../tests/pwa/sveltekit-cycle-overview.spec.ts)
exercises real full and compact controls, editor/import cancellation, tour and
dashboard preferences, complete profile and raw-record equality, and two fresh
closed-client launches with the static origin stopped.

[`cycle-shared-owned.spec.ts`](../tests/playwright/cycle-shared-owned.spec.ts)
checks shared Cycle icon controls, destructive actions, symptom pills, period notes
and section chrome against immutable original styles and real component wrappers.
The shared catalog must preserve exact declaration ownership, modal close
specificity, adjacent section spacing, inclusive phone sizing, keyboard focus and
actual pointer styles. Normal-motion media and the original transition durations
are asserted. Hover and post-delivery samples use the real computed
transition budget and consecutive stable frame reads; no transitions are suppressed.
WebKit pressed styles are captured during trusted native mouse-down; Chromium
and Firefox use atomic sampling after delivery. Every capture
requires the real pointer state and correct hit target before and after reading
styles; these checks do not establish sustained press behavior or physical Safari
acceptance. Original fixtures and domain/controller assertions remain unchanged.

[`cycle-editor-frozen.test.ts`](../tests/cycle-editor-frozen.test.ts) compares the
authored editor and unchanged controller with immutable original renderings and
operation traces, including native select predicates, automatic fields, immediate
Add/Delete persistence, pending Save, clear confirmation and loading gates.
[`cycle-editor-owned.spec.ts`](../tests/playwright/cycle-editor-owned.spec.ts) checks
original geometry, option properties, hidden fields, keyboard focus, sticky scrolling
and actual hover/active symptom states across themes and breakpoints.
[`sveltekit-cycle-editor.spec.ts`](../tests/pwa/sveltekit-cycle-editor.spec.ts) drives
actual Body/editor controls against the assembled static PWA, with complete
profile/history/raw-store equality, shared dialog reuse and closed-client cold
launches. These focused checks do not establish whole-application or physical
installation acceptance.

[`cycle-import-frozen.test.ts`](../tests/cycle-import-frozen.test.ts) and
[`tips-details-frozen.test.ts`](../tests/tips-details-frozen.test.ts) compare authored
presentation with immutable pre-migration outputs, including conflict choices,
product limits, literal values, disclosure and shared consumers.
[`cycle-import-owned.spec.ts`](../tests/playwright/cycle-import-owned.spec.ts) and
[`tips-details-owned.spec.ts`](../tests/playwright/tips-details-owned.spec.ts) compare
exact geometry, computed styles, keyboard focus and actual pointer states. Original
stylesheet rules retain their production cascade positions; the Tips supplement
recovers escaped utility selectors from verified original style snapshots without
changing captured samples.
[`sveltekit-cycle-import.spec.ts`](../tests/pwa/sveltekit-cycle-import.spec.ts)
exercises real import/cancel/conflict/removal controls, raw Cycle storage and complete
profile/history preservation. [`sveltekit-tips-details.spec.ts`](../tests/pwa/sveltekit-tips-details.spec.ts)
exercises catalog detail, disclosure, coupon feedback, saved/hidden cards, order,
dashboard visibility, settings and discussion prefill with complete profile and
local preference records. Both close every client before two cold launches and
seed initial data once. These focused cases do not establish whole-app or installed
PWA acceptance.

The DOM sink audit compares every discovered HTML-writing operation with its
committed count and source fingerprint, including raw Svelte HTML. Successful
migration removes native sinks, so security acceptance uses exact discovery and
fingerprint agreement rather than a historical minimum number of unsafe operations.
The scanner tests also reject omitted/stale entries, modified fingerprints and
changed discovery totals. A policy refresh requires review of the changed sinks.

## Behavioral requirements

Biology reading presentation has focused [frozen content checks](../tests/biology-reading-presentation.test.ts)
for all 18 score types and empty/context/zero-weight inputs, plus
[headless theme, geometry and keyboard checks](../tests/playwright/biology-reading-owned.spec.ts).
The [static reading scenario](../tests/pwa/sveltekit-biology-reading.spec.ts) opens
all score methodologies and weight tables, exercises marker dialogs, and checks
full canonical profile equality through two closed-client offline launches.
[Existing Biology lens scenarios](../tests/playwright/biology-scores-dashboard-lens.spec.ts)
cover adjacent context, planning and sparse-profile behavior. These focused
presentation checks do not establish clinical validity, whole-app accessibility,
installed-PWA acceptance or complete migration acceptance.

Biology AI presentation has [frozen state checks](../tests/biology-ai-presentation.test.ts)
for empty, loading, cached, stale, demo, failure, retry, encryption, historical and
legacy scalar inputs. [Headless parity checks](../tests/playwright/biology-ai-owned.spec.ts)
cover six themes and breakpoint boundaries, focus, touch targets and reduced motion.
[Static cached-answer acceptance](../tests/pwa/sveltekit-biology-ai.spec.ts) exercises
sanitized Markdown and stale provenance offline, then compares the complete stored
profile across two closed-client launches. Existing Biology integrity and lens
scenarios remain responsible for request, saving, navigation and refresh behavior.

Biology score cards have [frozen full-composition checks](../tests/biology-card-presentation.test.ts)
for all 18 score types plus empty, zero, escaped, historical, mixed-date snapshot,
pending and cached inputs. They verify dashboard action state and the existing
lens-shell insertion contract independently. [Headless card parity](../tests/playwright/biology-cards-owned.spec.ts)
compares collapsed and expanded geometry, palettes, dial pseudo-elements and
focus across six themes and breakpoint boundaries. Existing lens scenarios and
the static reading/AI scenarios exercise the complete card's actual delegates,
full-width panels, marker dialogs, persistence and offline launches.
[Static card controls](../tests/pwa/sveltekit-biology-cards.spec.ts) independently
verify dashboard preferences and exact page order across two closed-client
offline launches while preserving the complete lab profile. The historical
score integrity check verifies the exact numeric DOM text and unit independently
of presentation utility classes.

Biology overview and dashboard presentations have [frozen structure and state
checks](../tests/biology-overview-presentation.test.ts) for current, absent, zero,
escaped, historical, cached and unlinked domains. The original fixture is captured
before replacement, including its owned CSS. [Headless parity](../tests/playwright/biology-overview-owned.spec.ts)
compares overview and dashboard geometry, themes and disclosure states, and checks
focus and inert unlinked rows. The native-button improvement for linked dashboard
domains is explicit in the structural baseline. [Static overview acceptance](../tests/pwa/sveltekit-biology-overview.spec.ts)
exercises actual keyboard navigation, contributors, saved explanations and reading
facts with the origin offline, then repeats through two closed-client launches.
The complete stored profile must remain equal. Shared reading, AI and card-control
scenarios remain independent regression checks. These are focused presentation
checks, not clinical or whole-app release acceptance.

Biology profile and collection context has [frozen state and structure
checks](../tests/biology-context-presentation.test.ts) across male, female and
unspecified-sex profiles, current/stale/absent reviews, active flags and escaped
or legacy text values. The original source and owned CSS are captured before
replacement. [Headless context acceptance](../tests/playwright/biology-context-owned.spec.ts)
compares geometry and themes with open/closed disclosures, checks keyboard focus,
and exercises failed IndexedDB writes, retry, apply, dismiss and reload through
the unchanged delegates. The persistence fixture seeds lab records through normal
profile boot before preservation snapshots. [Static context acceptance](../tests/pwa/sveltekit-biology-context.spec.ts)
prepares current-schema fixtures through the existing deterministic migration, then
checks sex-specific fields and keyboard writes with the origin offline, preserving
unrelated records and the complete accepted profile through two closed-client
launches. These checks complement AI lifecycle, integrity and sync regressions;
they do not establish whole-app release acceptance.

Shared lens chrome has [frozen structure checks](../tests/lens-shell-presentation.test.ts)
for escaped literal fields, empty/body compatibility, sizes, dashboard states,
move limits, profile-scoped ordering and duplicate/stale stored IDs.
[Headless parity](../tests/playwright/lens-shell-owned.spec.ts) compares frozen
geometry and themes at both sides of the inclusive 640px and 1100px boundaries
and checks independent keyboard focus. Existing shell delegate scenarios cover
move and dashboard actions. [Static offline acceptance](../tests/pwa/sveltekit-lens-shell.spec.ts)
opens the actual Labs, Genome, Body, Insight and disabled-Tips routes, changes
Labs ordering with the keyboard, and verifies it and the complete accepted
profile through two closed-client launches. Adjacent Biology card acceptance
retains the compact score-tools contract. Named HTML body/action compatibility
inputs remain reviewed content boundaries. These scoped lens checks complement
the individual page contracts and whole-application release acceptance.

The actual Biology page has [frozen full-composition checks](../tests/biology-page-presentation.test.ts)
for male, female, sparse-data and persisted-order states, plus shared date option
and scope semantics. [Headless page acceptance](../tests/playwright/biology-page-owned.spec.ts)
compares owned chrome, grids and collapsed/expanded card geometry across themes,
viewport boundaries and container layouts. Frozen and current pages share one
layout origin to avoid precision loss in very tall stacked documents; the unchanged
row-measurement controller runs for both. Pure structure checks normalize only its
runtime `--biology-summary-height` property. All other styles and attributes remain
compared. Existing [date-scope workflows](../tests/playwright/dashboard-lab-date-range.spec.ts)
verify desktop/mobile restoration of older categories without mutating entries.
Adjacent static context, overview and card scenarios cover actual-route keyboard
controls, profile writes, ordering and closed-client offline persistence. Actual
page composition emits no score-tools marker; public compact HTML compatibility
still retains that bridge. These focused checks do not establish complete release
or whole-app accessibility acceptance.

Literal lens content has [frozen structure checks](../tests/lens-content-presentation.test.ts)
covering SNP-only and maternal-only imports, coverage coercion, escaped metadata,
missing/merged source records and header action states. The actual controller also
checks that an absent Genome panel stays absent. [Headless layout checks](../tests/playwright/lens-content-owned.spec.ts)
compare all child geometry and theme styles at the original viewport boundaries,
including the default theme and visible keyboard focus. [Static imported-metadata
checks](../tests/pwa/sveltekit-lens-content.spec.ts) exercise actual Genome/Body
navigation and closed-client offline launches with complete stored-profile equality.
[Focused action checks](../tests/playwright/lens-content-actions.spec.ts) exercise
actual Genome, Body and Tips controllers with harmless import/delete/settings
recorders and unchanged imported data. Insight uses its typed controls in the real
shell header without adjacent asynchronous loaders. Shared shell action/delegate
and route tests remain independent. These focused
checks do not establish complete Genome processing, wearable integrations or
whole-app release acceptance.

Dashboard and biometric pickers and import marker mapping have
[frozen baseline structure checks](../tests/widget-map-frozen.test.ts),
[literal dashboard projection checks](../tests/dashboard-picker-presentation.test.ts)
and [literal mapping projection checks](../tests/import-marker-map-presentation.test.ts).
[Headless parity checks](../tests/playwright/widget-map-owned.spec.ts) compare original
structure, styling and layout at theme and responsive boundaries. Existing
controller browser workflows retain preference, filtering, mapping and nested
lifecycle coverage. [Static PWA checks](../tests/pwa/sveltekit-widget-map.spec.ts)
exercise public picker controls and session-draft restoration, offline mapping and
clearing, nested cancellation focus, marker/fixed/biometric selection persistence
and closed-client cold launches while preserving accepted health records.
[Import review boundary checks](../tests/pdf-import-review-boundaries.test.ts) also
cover repeated opens and independent parent, child and concurrent modal scroll locks. Import validation reports original row numbers even when rows are grouped,
reveals every affected row across filters, and clears invalid state when a row is
corrected or excluded. Blank saved custom-marker units adopt the incoming unit;
incompatible established units still block the commit.
[Page-wide import checks](../tests/import-page-drop.test.ts) and
[populated Dashboard acceptance](../tests/playwright/import-page-drop.spec.ts)
cover file-only dragging, specialized target ownership, busy/profile guards and
cancellation before processing. Page drops show detected type counts; DNA and
mixed selections require confirmation, and unrecognized text/CSV requires an
explicit lab-report classification before it can enter an AI import pipeline.
These focused checks do not establish physical touch behavior, installed-PWA/update
acceptance or complete application acceptance.

Report setup and guided tours have [original structure checks](../tests/report-tour-frozen.test.ts)
covering all templates, AI availability, missing records, sorted note indexes,
first/middle/last steps and a single-step tour. [Report projection checks](../tests/report-builder-presentation.test.ts)
and [tour projection checks](../tests/tour-presentation.test.ts) cover literal
escaping and typed controls. Existing [report controller checks](../tests/report-builder-consistency.test.ts)
retain selection, immutable payload, AI consent/failure and reserved-preview
cancellation assertions, plus unchanged action-text identity across input/blur so
WebKit retains first-click activation. [Headless presentation checks](../tests/playwright/report-tour-owned.spec.ts)
compare frozen geometry, themes, disclosures, checked state, hover, visible focus
and coarse-pointer layouts. Existing report-export and tour DOM workflows retain
actual delegate/lifecycle coverage. Desktop wheel input remains covered; the
phone-width keyboard check verifies scrolling on the modal surface. Playwright
mobile WebKit cannot inject wheel events; that check does not simulate a physical
touch swipe. [Static offline checks](../tests/pwa/sveltekit-report-tour.spec.ts)
exercise real report/tour entry points, mobile drawer/backdrop dismissal and modal
scroll-lock restoration, a local preview and closed-client cold launches with
accepted-profile equality. These scoped checks do not establish
whole-app, installed-PWA/update or external provider acceptance.

Biology summary and compatibility views have [frozen structure and state
checks](../tests/biology-summary-presentation.test.ts) covering raw and historical
values, confidence thresholds, directional/stale scores, missing inputs, NaN,
clamping, ordering and escaped text. [Headless summary acceptance](../tests/playwright/biology-summary-owned.spec.ts)
compares the original geometry and theme colors at breakpoint boundaries and
checks independent title/marker keyboard navigation through real delegates.
Frozen native selectors retain their original specificity so composed Tailwind
children keep their established cascade. The classic Biology checks inspect DOM
contracts and emitted CSS declarations rather than exact serialized class order
or superseded ring markup. Existing static context, overview and card checks cover
the composed children and offline persistence; these focused checks do not replace
whole-app release acceptance.

Preserve independently failing assertions for these workflows:

| Workflow | Required behavior | Selected regression sources |
| --- | --- | --- |
| Manual body reading Sync | Sync only explicit manual weight/BP/pulse fields; preserve distinct same-day values, edit clocks, deletion/re-add, add-only local history, profile/owner guards and ordinary startup catch-up; keep vendor histories local | [Store and row codec](../tests/manual-body-readings-sync.test.ts), [ownership/failure](../tests/manual-body-readings-ownership.test.ts), [startup/detail browser](../tests/playwright/manual-readings-sync.spec.ts) |
| Lab import and restore | Reject invalid or duplicate mutations; retain report units, provenance, and unrelated data; recover from failed writes. C-peptide accepts pmol/L (331 per canonical µg/L), displays pmol/L in EU, and converts values and all ranges together; reapplying a saved review repairs affected entries without changing its raw report units or duplicating snapshots | [Import integrity](../tests/import-data-integrity.test.ts), [provenance](../tests/import-provenance.test.ts), [C-peptide units](../tests/cpeptide-units.test.ts), [saved-review repair](../tests/playwright/cpeptide-import.spec.ts) |
| Profiles and notes | Late work stays with its originating profile; failed reads block saves; drafts and records survive failed writes | [Profile races](../tests/chat-profile-races.test.ts), [profile persistence](../tests/profile-persistence.test.ts), [notes](../tests/notes-safety.test.ts) |
| PDF preflight presentation | Preserve literal labels, whitespace, native button defaults, model conversion order, duplicate date formatting, specialty link attributes and scoped style ownership; retain ordered checks, cancellation and explicit model switching; create an accessible scanned-warning host when absent, keep Escape active after Tab, settle and clean up once, and protect a visible native confirmation | [Frozen presentation contracts](../tests/pdf-preflight-presentation.test.ts), [public PDF workflows](../tests/playwright/pdf-import-browser-coverage.spec.ts), [real-parser image-warning lifecycle](../tests/playwright/pdf-image-mode-lifecycle.spec.ts), [static PDF first use and cold launches](../tests/pwa/sveltekit-pdf-preflight.spec.ts), [modal lifecycle contracts](../tests/test-modal-lifecycle-integrations.ts) |
| Standalone Note editor | Preserve original Add/Edit serialization, native form values and reset defaults, literal whitespace and coercion order; retain captured profile writes, aborted-write drafts, reload survival and both edit/delete sync tombstones; verify themes and stylesheet order, nested confirmation focus, first offline use and stopped-origin cold launches | [Frozen presentation contracts](../tests/note-editor-presentation.test.ts), [Note safety](../tests/notes-safety.test.ts), [native persistence](../tests/playwright/notes-persistence.spec.ts), [modal focus handoffs](../tests/modal-focus-handoff.test.ts), [static offline Note](../tests/pwa/sveltekit-note-editor.spec.ts) |
| Client List overview | Preserve filtering, sorting, pinning, profile selection, protected records, native menus and form handoffs; keep the focused search toolbar attached during rapid typing and caret edits, retire stale deferred focus, and retain keyboard dismissal and offline first use through two cold launches | [Presentation contracts](../tests/client-list-presentation.test.ts), [search ownership](../tests/client-list-runtime.test.ts), [delegated actions](../tests/test-client-list-delegated-actions.ts), [shared focus](../tests/modal-focusable.test.ts), [static PWA workflows](../tests/pwa/sveltekit-client-list.spec.ts) |
| Client List forms | Preserve native New/Edit defaults and validation, literal avatar/tag rendering, case-insensitive tag deduplication, canceled drafts, persisted metadata and tag edits, named controls and all unrelated profiles/preferences | [Form presentation](../tests/client-list-form-presentation.test.ts), [actual controller tag saves](../tests/client-list-form-tags.test.ts), [delegated runtime](../tests/client-list-runtime.test.ts), [offline form workflows](../tests/pwa/sveltekit-client-list.spec.ts) |
| Shared tooltip overlay | Load global tooltip styles before Light; preserve trusted hover/focus/Escape lifecycle, title restoration, one fixed overlay and reduced-motion behavior | [Cold shell regression](../tests/playwright/tooltip-cold-shell.spec.ts), [runtime adapter](../tests/touch-tooltip-runtime.test.ts) |
| Compact profile button | Preserve real profile selection and fallback, avatar/initial escaping, native coercion order and atomic failure, delegated activation, Client List focus restoration and responsive styles | [Projection contracts](../tests/profile-button-presentation.test.ts), [Nav source contracts](../tests/test-nav-delegated-actions.ts), [Runtime adapters](../tests/nav-runtime-adapters.test.ts), [Native nav workflows](../tests/playwright/nav-delegated-actions.spec.ts), [Static PWA offline and cold launch](../tests/pwa/sveltekit-profile-button.spec.ts) |
| Chart Layers menu | Read only available modes in native order; retain exact checkbox defaults, delegated changes, per-profile preferences, category reconstruction, trusted pointer and keyboard input, Escape focus, outside dismissal and first offline use through two cold launches | [Presentation contracts](../tests/chart-layers-presentation.test.ts), [stylesheet ownership](../tests/category-views-styles.test.ts), [dismissal lifecycle](../tests/chart-layers-dismissal.test.ts), [delegated wiring](../tests/data-delegated-actions.test.ts), [native menu workflows](../tests/playwright/chart-layers.spec.ts), [static offline and cold launches](../tests/pwa/sveltekit-chart-layers.spec.ts) |
| Header dates and range controls | Preserve formatter text, getter/coercion order and atomic failure; render supplied labels literally; keep empty no-clear behavior, native button defaults, in-place focus/listener identity, delegated persistence and deferred callback order | [Header public contracts](../tests/header-date-range.test.ts), [Delegated wiring](../tests/data-delegated-actions.test.ts), [Data browser coverage](../tests/playwright/data-browser-coverage.spec.ts), [Static PWA offline range persistence](../tests/pwa/sveltekit-header-date-range.spec.ts) |
| Changelog presentation | Preserve escaped metadata, ordered coercion and atomic failure, safe item markup, current/archive release selection, version gates, native close/focus/scroll and Settings handoff | [Public presentation contracts](../tests/changelog-presentation-contract.test.ts), [Source and release contracts](../tests/test-changelog.ts), [Native browser workflows](../tests/playwright/changelog.spec.ts), [Cold loader coverage](../tests/playwright/changelog-loader-browser-coverage.spec.ts), [Static PWA offline and cold launch](../tests/pwa/sveltekit-changelog.spec.ts) |
| Feedback draft | Preserve literal form markup, native defaults and validation, public header/mobile entry, type routing, complete long-report fallback and clipboard-denial selection; keep drafts in the current document, clear them on profile switch and cold launch, submit before SvelteKit navigation, and preserve unrelated stored profiles through offline first use and two cold launches | [Frozen presentation contracts](../tests/feedback-presentation.test.ts), [Notice rule restoration](../tests/feedback-native-rule.test.ts), [Native submit ownership](../tests/feedback-submit-delegation.test.ts), [Public browser workflows](../tests/playwright/feedback-flow.spec.ts), [Static offline Feedback](../tests/pwa/sveltekit-feedback.spec.ts) |
| Agent chat and proposals | Exercise the actual application and tools; keep retries bounded; retain uploads and journals; do not replay an uncertain mutation | [Agent workflow](../tests/playwright/agent-chat-workflow.spec.ts), [backend recovery](../tests/agent-chat-backend.test.ts), [draft persistence](../tests/agent-draft-persistence.test.ts) |
| Conversation navigation | Preserve pinned/project/date grouping, sorting, rename/delete/move semantics, encrypted message search, result limits and shifted-prefix jumps; reject late profile/view/query/read/frame replies; keep keyboard menus, pointer cancellation, mobile return-to-chat, scoped theme contrast and cached cold-launch records | [Owned navigation](../tests/chat-thread-navigation.test.ts), [search ownership](../tests/chat-thread-search-owned.test.ts), [original thread workflows](../tests/playwright/chat-threads-dom.spec.ts), [themes/layout/accessibility](../tests/playwright/chat-thread-navigation-owned.spec.ts), [static PWA persistence](../tests/pwa/sveltekit-chat-navigation.spec.ts) |
| Chat shell and composer | Keep one shared shell, hydrate without replacing focused controls or live hosts, retire replaced input owners and decrypted draft replies, preserve growing input, IME, encrypted local drafts, resize/keyboard/mobile geometry, drag cancellation at capture/blur/closure/fullscreen/rail/mobile boundaries, inert closed rails with focus return on dismissal, and reopen during generation | [Owned shell](../tests/chat-shell-owned.test.ts), [owned layout](../tests/chat-layout-owned.test.ts), [composer](../tests/playwright/chat-composer.spec.ts), [resize](../tests/playwright/chat-layout-resize.spec.ts), [live reopen](../tests/playwright/chat-reopen-streaming.spec.ts), [static composer](../tests/pwa/sveltekit-chat-shell.spec.ts), [static rail keyboard and persisted layout](../tests/pwa/sveltekit-chat-layout.spec.ts) |
| Chat profile onboarding | Preserve basic/optional fields, units, same-day weight replacement, latitude and connected/disconnected/paused continuation; capture accepted fields before writes, retain per-module callback isolation, serialize profile saves and reject retired profile/thread/history/data/root controls; retain draft/focus/disclosure and recover failed saves; verify themes, keyboard, touch targets, no narrow overflow and static offline first use/cold launch with IndexedDB-backed export | [Save ownership](../tests/chat-profile-onboarding-controller.test.ts), [existing helpers](../tests/playwright/chat-onboarding-browser-coverage.spec.ts), [headless form](../tests/playwright/chat-onboarding-profile-owned.spec.ts), [original funnels](../tests/playwright/chat-empty-state.spec.ts), [static offline profile](../tests/pwa/sveltekit-chat-onboarding-profile.spec.ts) |
| Light page presentation | Preserve session/action availability, live target IDs, rolling-week counts, UV notices, separate vitamin D quantities, methods/source disclosure, literal fields and delegate contracts; check themes, narrow widths, keyboard, touch targets, offline actual-route session commits, cold launches, unrelated profile equality and backup | [Presentation contracts](../tests/light-page-presentation.test.ts), [Delayed Chat cancellation](../tests/dashboard-onboarding-route.test.ts), [Existing browser contracts](../tests/playwright/light-page-view.spec.ts), [Authored acceptance](../tests/playwright/light-page-owned.spec.ts), [Static offline route](../tests/pwa/sveltekit-light-page.spec.ts) |
| Light current conditions | Preserve full/compact provider classifications, UV consistency warnings, ozone distinction, attribution, source/freshness and chronological sun events; retain coordinate-keyed fetch/cache bypass and raw inspection; check escaped payloads, six themes, narrow/wide layouts, AA foregrounds, named keyboard scroll regions, tooltip focus, coarse targets and reduced motion; verify real static offline first use, refresh/inspection, two cold launches and complete stored-profile equality | [Projection and escaped markup](../tests/light-conditions-presentation.test.ts), [Existing provider/cache contracts](../tests/playwright/light-conditions-now-browser-coverage.spec.ts), [Authored keyboard/themes](../tests/playwright/light-conditions-owned.spec.ts), [Static offline conditions](../tests/pwa/sveltekit-light-conditions.spec.ts) |
| Light session forms, active timers, details and history | Preserve option/default selection, local timestamps, mixed newest-first capped history, mode/snapshot fallback, safety priority, original delegated actions and modal refresh/scroll cleanup; verify native Enter/Space, mode radio navigation, UV confirmation, distance conversion, themes, narrow layout, actual offline Sun/device commits, cold launches and backup equality; retain live warning thresholds, paused-time accounting, cold-resume slice boundaries and saved dose totals, chip expansion/focus and single native action activation | [Projection contracts](../tests/light-session-presentation.test.ts), [Original modal contracts](../tests/playwright/modal-session-coverage-batch.spec.ts), [History edge contracts](../tests/playwright/light-sessions-view-edge-browser-coverage.spec.ts), [Authored acceptance](../tests/playwright/light-session-owned.spec.ts), [Detail projections](../tests/light-session-detail-presentation.test.ts), [Detail keyboard/layout](../tests/playwright/light-session-detail-owned.spec.ts), [Active ticker/layout](../tests/playwright/light-active-session-owned.spec.ts), [Sun entry projection](../tests/sun-start-presentation.test.ts), [Sun entry keyboard/themes](../tests/playwright/sun-entry-owned.spec.ts), [Static Sun start/coverage](../tests/pwa/sveltekit-sun-entry.spec.ts), [Static active timers](../tests/pwa/sveltekit-light-active.spec.ts), [Static device workflow](../tests/pwa/sveltekit-light-sessions.spec.ts) |
| Chat summaries | Preserve sorting, literal metadata and IDs, delegated actions, escaped Markdown, generation ownership, attribution, sync refresh and copy/download/print/delete; check keyboard focus, themes, narrow layouts, actual canonical commits, deletion tombstones, unrelated profile data, offline closed-client launches and backup | [Presentation contracts](../tests/chat-summary-presentation.test.ts), [Ownership regressions](../tests/chat-profile-races.test.ts), [Existing browser contracts](../tests/playwright/chat-summary-browser-coverage.spec.ts), [Authored acceptance](../tests/playwright/chat-summary-owned.spec.ts), [Static offline persistence](../tests/pwa/sveltekit-chat-summary.spec.ts) |
| Chat empty states | Preserve paused, initial/partial/full context, saved/skipped handoff, lab nudge and general prompt branches, literal names/prompts, provider-independent context navigation and delegated actions; verify supported themes, narrow layouts, keyboard, accessibility, read-only render parity and offline context-note/history commits through closed-client launches | [Presentation contracts](../tests/chat-empty-presentation.test.ts), [Existing branch and action checks](../tests/playwright/chat-empty-state.spec.ts), [Authored theme/layout acceptance](../tests/playwright/chat-empty-owned.spec.ts), [Static offline notes and navigation](../tests/pwa/sveltekit-chat-empty.spec.ts) |
| Chat optional onboarding | Preserve optional cycle, therapy history, SNP/mtDNA and wearable tasks, file pickers, re-import actions, affiliate contract and connected/disconnected continuation; reject retired controls and profile-switched parsing/previews, retain curated SNP overrides, save before publishing and recover storage failure; verify keyboard, themes, touch targets, fullscreen and real file imports with cached cold launch | [Projection](../tests/chat-optional-onboarding-presentation.test.ts), [headless tasks and ownership](../tests/playwright/chat-onboarding-optional-owned.spec.ts), [DNA workflows](../tests/playwright/dna-browser-coverage.spec.ts), [static offline imports](../tests/pwa/sveltekit-chat-onboarding-optional.spec.ts) |
| Chat provider onboarding | Preserve OAuth, manual-key, local AI, Bitcoin and CLI handoffs, extension HTML/actions and connected/skip/back step sequences; reject displaced, retired and late profile/thread/history/settings owners; keep literal names, keyboard focus, theme contrast and offline first use after a static cold launch | [Progress contract](../tests/chat-onboarding-presentation.test.ts), [existing helpers](../tests/playwright/chat-onboarding-browser-coverage.spec.ts), [headless provider ownership](../tests/playwright/chat-onboarding-provider-owned.spec.ts), [static offline first use](../tests/pwa/sveltekit-chat-onboarding-provider.spec.ts) |
| Provider model discovery | Offer Gemini 4 Argon and Gemini 3.8 Flash as distinct recommended tiers, alongside Muse Wonder and general Muse Spark 1.3 when the active provider lists them; exclude older Gemini Flash fallbacks and specialized Flash Cyber variants. Preserve DeepSeek dated revisions through discovery; Flash and Pro prefer available rolling aliases, falling back to the newest stable numeric version and dated revision across dotted, hyphenated, bare and namespaced IDs; keep contributor and coding routes outside general-analysis recommendations, retain availability/vision metadata, private-route policies and existing selections | [Provider runtime](../tests/api-provider-runtime.test.ts), [DeepSeek families](../tests/deepseek-recommendations.test.ts), [provider contracts](../tests/api-provider-contracts.test.ts) |
| Chat model picker | Preserve provider and target-isolated catalogs, recommendation groups, literal metadata, search, per-model reasoning, attached-image capability checks and cached cold-launch selection; reject obsolete profile/thread/provider/connection/view replies and reverse-order choices; keep open menus usable across themes and compact/coarse layouts, with Escape focus restoration | [Owned actions](../tests/chat-model-picker-owned.test.ts), [OpenRouter cache ownership](../tests/openrouter-catalog-owner.test.ts), [original model workflows](../tests/playwright/chat-model-controls.spec.ts), [open menu accessibility](../tests/playwright/chat-model-picker-owned.spec.ts), [static PWA choices](../tests/pwa/sveltekit-chat-model-picker.spec.ts) |
| Chat personalities | Preserve builtin/custom selection, literal metadata, generated/editable drafts, explicit hosted assent, encrypted storage and custom deletion; reject stale profile/thread/view/editor replies and preserve edits during generation, saves and confirmations; order profile writes, restore modal focus and retain offline cold-launch personas | [Owned actions](../tests/chat-personality-delegated-actions.test.ts), [write ordering](../tests/chat-personality-storage-order.test.ts), [original workflows](../tests/playwright/custom-personality-dom.spec.ts), [themes and accessibility](../tests/playwright/chat-personality-owned.spec.ts), [static encrypted PWA](../tests/pwa/sveltekit-chat-personality.spec.ts) |
| Chat message actions and editing | Preserve latest-turn eligibility, retry/resume, literal context/proposal review, copy feedback and focus, speech, mobile fork, edit cancellation/shortcuts/busy state, rollback and separate composer drafts; reject stale profile/thread/history/message controls and late clipboard replies; retain applied data and edited conversation through cached cold launches | [Action ownership](../tests/chat-message-actions-owned.test.ts), [edit reliability](../tests/chat-message-edit-reliability.test.ts), [composer ownership](../tests/chat-shell-owned.test.ts), [proposal claims](../tests/agent-draft-actions.test.ts), [original browser workflows](../tests/playwright/chat-message-edit.spec.ts), [headless themes and accessibility](../tests/playwright/chat-message-actions-owned.spec.ts), [static offline actions](../tests/pwa/sveltekit-chat-message-actions.spec.ts) |
| Chat message content | Preserve literal citation labels/excerpts, multiline text, safe stored thumbnails, count-only disclosure and keyboard image preview; retain thinking phrase timing, stable live nodes and reduced motion while retiring removed/profile/thread views; restore citations and process fresh responses with cached application assets | [Content and clock contracts](../tests/chat-message-content.test.ts), [original thinking/avatar contracts](../tests/chat-thinking-status.test.ts), [headless content and themes](../tests/playwright/chat-message-content-owned.spec.ts), [original transcript rendering](../tests/playwright/chat-render-browser-coverage.spec.ts), [static citations and delayed response](../tests/pwa/sveltekit-chat-message-content.spec.ts), [static stored images](../tests/pwa/sveltekit-chat-attachments.spec.ts) |
| Chat discussion controls | Preserve additional-perspective selection, locked participants, request-cost disclosures, sequential rounds, pause/resume/retry/end, composer restrictions and saved discussion metadata; reject retired controls and render imported names literally; retain pending and ended state through offline cold launch | [Owned selection and lifetime](../tests/chat-discussion-owned.test.ts), [original lifecycle](../tests/playwright/chat-ui-browser-coverage.spec.ts), [original round errors](../tests/playwright/chat-discussion-edge-browser-coverage.spec.ts), [headless controls and themes](../tests/playwright/chat-discussion-owned.spec.ts), [static offline discussion](../tests/pwa/sveltekit-chat-discussion.spec.ts) |
| Context overview and source settings | Preserve source order, availability, specialty groups, prompt/score mappings and all nutrition windows; commit before publication, migrate legacy choices durably, retain failed intents, expose peer conflicts and reject retired controls; verify themes, keyboard, offline first use and two cold launches | [Projection and captured autosave](../tests/context-hub-ownership.test.ts), [headless accessibility and storage failures](../tests/playwright/context-hub-owned.spec.ts), [prompt and score integration](../tests/playwright/dashboard-knowledge-base.spec.ts), [static offline persistence](../tests/pwa/sveltekit-context-hub.spec.ts) |
| Medical History | Preserve conditions, impacts/status/since, all relatives and original row indices, procedures, flags, notes and unknown stored metadata; keep edits local until an awaited guarded save, retain failed/conflicted drafts and reject retired opens/confirmations; verify literal suggestions, keyboard, six themes, narrow/wide layouts, offline first use and two cold launches | [Draft and captured transaction](../tests/context-medical-history.test.ts), [headless UI and actual storage](../tests/playwright/family-history-dom.spec.ts), [cold facade](../tests/playwright/context-card-medical-history-editor-loader-browser-coverage.spec.ts), [static offline persistence](../tests/pwa/sveltekit-medical-history.spec.ts) |
| Interpretive Lens | Preserve literal multiline text, trim on accepted save, empty-string clear, existing header/navigation and Back to Context; retain failed and conflicted drafts, commit history before success, reject retired confirmations and delayed/cold Back loads, and keep controls reachable after mobile navigation; verify themes, keyboard, offline first use and two cold launches | [Shared projection and captured session](../tests/context-lifestyle-form-ownership.test.ts), [atomic peer guard](../tests/profile-write-concurrency.test.ts), [headless themes and cold-load race](../tests/playwright/context-lens-owned.spec.ts), [loader contracts](../tests/playwright/context-card-dashboard-ai-loader-browser-coverage.spec.ts), [static offline persistence](../tests/pwa/sveltekit-context-lens.spec.ts) |
| Nutrition dashboard widgets | Preserve seven-day local calendar coverage, selected nutrient order, starter/personal guides, unknown values, drink/food distinctions, existing actions and unchanged profile data; verify Dashboard and Body, narrow containers, themes, accessibility and two offline cold launches | [Pure dashboard projections](../tests/nutrition-dashboard.test.ts), [direct summary component parity and import boundary](../tests/nutrition-dashboard-leaf-boundary.test.ts), [cold summary action ownership](../tests/nutrition-summary-loading.test.ts), [held module and storage cancellation](../tests/playwright/nutrition-summary-cold-owned.spec.ts), [headless widget acceptance](../tests/playwright/nutrition-dashboard-owned.spec.ts), [static offline widgets](../tests/pwa/sveltekit-nutrition-dashboard.spec.ts) |
| Nutrition benchmark workspace and results | Preserve domain ranking, original action indices, baseline/known-value distinctions, unknown/zero nutrients, cost visibility and retry/cancel/replace/use contracts; verify keyboard tables, reduced motion, six themes, narrow layouts, encrypted local restore and metadata-only clearing through offline cold launches without profile changes | [Projection contracts](../tests/nutrition-comparison-results-model.test.ts), [renderer semantics](../tests/nutrition-comparison-results.test.ts), [existing workflow](../tests/playwright/nutrition-module.spec.ts), [headless themes and layouts](../tests/playwright/nutrition-comparison-owned.spec.ts), [workspace reference, photo and draft ownership](../tests/playwright/nutrition-benchmark-owned.spec.ts), [modal focus handoffs](../tests/modal-focus-handoff.test.ts), [static offline restore](../tests/pwa/sveltekit-nutrition-comparison.spec.ts) |
| Meal editor and review | Preserve photo/label/manual entry, all nutrient fields and unknown/zero values, model routing, analysis/correction/cancel state, ingredient and historical evidence, draft suspension and save/edit/reuse contracts; verify six themes, narrow layouts, keyboard, touch targets, accessibility and actual offline writes through closed-client cold launches with exact unrelated profile and decrypted-cache parity | [Authored field and review contracts](../tests/nutrition-editor-review.test.ts), [Draft recovery](../tests/nutrition-editor-navigation.test.ts), [request ownership](../tests/nutrition-request-lifecycle.test.ts), [photo provenance](../tests/nutrition-photo-provenance.test.ts), [persistence contracts](../tests/nutrition-persistence-contracts.test.ts), [existing workflows](../tests/playwright/nutrition-module.spec.ts), [headless editor acceptance](../tests/playwright/nutrition-editor-owned.spec.ts), [static offline writes](../tests/pwa/sveltekit-nutrition-editor.spec.ts) |
| Saved meal details and check-ins | Preserve provenance, photos, reviewed portions, unknown/zero nutrients, saved notes and return/edit/reuse/delete contracts; support keyboard check-ins and clear, retain failed choices, reject retired or peer-changed meal owners, and finish accepted writes on their initiating profile; verify themes, narrow layouts, accessibility, first offline use and two cold launches with unrelated profile parity | [Projection contracts](../tests/nutrition-meal-detail.test.ts), [captured commits](../tests/nutrition-meal-detail-ownership.test.ts), [headless detail acceptance](../tests/playwright/nutrition-meal-detail-owned.spec.ts), [static offline details](../tests/pwa/sveltekit-nutrition-meal-detail.spec.ts) |
| Nutrition setup and drink entry | Preserve target bounds, all nutrient choices, weight-aware presets, unknown values, beverage/plain-water distinction and local timing; support keyboard submit, retain failed drafts, reject peer conflicts and retired controls, and finish accepted writes on their original profile; verify six themes, narrow layouts, accessibility and offline saves through two cold launches | [Pure projections](../tests/nutrition-entry-model.test.ts), [captured commits](../tests/nutrition-entry-ownership.test.ts), [draft/error contracts](../tests/nutrition-entry-components.test.ts), [headless form acceptance](../tests/playwright/nutrition-entry-owned.spec.ts), [static offline saves](../tests/pwa/sveltekit-nutrition-entry.spec.ts) |
| Nutrition History and shared displays | Preserve chronological/day-boundary pagination, all ranges, selected nutrients, configured target semantics, unknown values, timing/fuel explanations and AI consent; retire delayed opens and profile-switched confirmations; verify six themes, narrow layouts, keyboard, 44px targets, accessibility and read-only offline/cold-launch persistence | [Projection and authored contracts](../tests/nutrition-presentation.test.ts), [nonblocking storage permission](../tests/nutrition-storage-permission.test.ts), [pending route retirement](../tests/nutrition-history-routing.test.ts), [headless History acceptance](../tests/playwright/nutrition-history-owned.spec.ts), [static History first use and cold launches](../tests/pwa/sveltekit-nutrition-history.spec.ts) |
| Nutrition context links | Preserve meal-source precedence, timeframe and timing copy, food-only counts and delegated Body/History navigation; verify literal text, keyboard activation, 44px targets, all themes, narrow containment and offline first use plus two cold launches without profile writes | [Escaping and renderer contracts](../tests/nutrition-context-links.test.ts), [existing context calculations](../tests/nutrition-context.test.ts), [headless navigation and accessibility](../tests/playwright/nutrition-context-links.spec.ts), [static offline acceptance](../tests/pwa/sveltekit-nutrition-context-links.spec.ts) |
| Food contaminant signals | Preserve scanner output, source groups and detailed-nutrition precedence; use native keyboard badge/actions and safe source links, retire old dialogs and cold opens, and dispatch the original Chat prompt only for its captured profile/conversation; verify all themes, narrow layouts and offline first use plus two cold launches without profile writes | [Projection and handoff guards](../tests/context-food-contaminants.test.ts), [headless ownership and themes](../tests/playwright/context-food-owned.spec.ts), [scanner and facade contracts](../tests/playwright/food-contaminants-browser-coverage.spec.ts), [static offline read-only acceptance](../tests/pwa/sveltekit-context-food.spec.ts) |
| Health Goals | Preserve all starters, sorted priorities and original deletion indices, legacy metadata, literal text and keyboard entry; commit profile/history before success, retain failed input and sync-time draft/focus, reject retired controls and obsolete confirmations, and preserve explicit restores against stale deletion metadata even with tied/backward clocks; retain data and tombstones through offline first use and two cold launches | [Captured mutations](../tests/context-health-goals-ownership.test.ts), [array intent order](../tests/data-merge-event-order.test.ts), [atomic profile guard](../tests/profile-write-concurrency.test.ts), [headless themes and interactions](../tests/playwright/context-goals-owned.spec.ts), [static offline persistence](../tests/pwa/sveltekit-context-goals.spec.ts) |
| Shared context insight requests | Coalesce identical pending input; replace work after context edits or manual refresh; reject late profile/data/demographic/provider/model/source-settings/consent responses and failures; persist assessed fingerprints and attribute usage to the dispatched route and originating profile | [Usage attribution](../tests/ai-usage-origin.test.ts), [Request ownership](../tests/context-health-ownership.test.ts), [actual headless transport races](../tests/playwright/context-health-ownership.spec.ts), [cache and demo consent regressions](../tests/playwright/context-coverage-batch.spec.ts), [shared card structure and interactions](../tests/playwright/context-cards-browser-coverage.spec.ts) |
| Chat discussion requests | Capture persona and prompt history before asynchronous knowledge lookup; keep the accepted direct model through automatic continuations; reject cancelled lookup/replies and changed CLI routes before session mutation or dispatch | [Request and continuation units](../tests/chat-runtime.test.ts), [Headless request snapshots](../tests/playwright/chat-discussion-request-snapshot.spec.ts) |
| Chat discussion replies | Share authored live/restored message and label views; reconnect the same live node after repaint; isolate late replies from replacement profile/history/thread records and newer controllers; retain sequential background persona projection and transactional encrypted history without reviving deleted conversations | [Headless lifetime and facade checks](../tests/playwright/chat-discussion-live-owned.spec.ts), [Shared history writer](../tests/chat-history-reliability.test.ts), [Round state contracts](../tests/chat-runtime.test.ts), [Static offline discussion](../tests/pwa/sveltekit-chat-discussion.spec.ts) |
| Chat transcript | Preserve bounded history/reveal, sanitized rich content, literal labels, citations and recommendations, keyed editor focus/drafts/selection, live view reconnection and retired-conversation guards | [Owned transcript lifecycle](../tests/playwright/chat-transcript-owned.spec.ts), [rich transcript](../tests/playwright/chat-render-browser-coverage.spec.ts), [send and persistence boundaries](../tests/playwright/chat-send-profile-boundary.spec.ts), [reopen while streaming](../tests/playwright/chat-reopen-streaming.spec.ts) |
| Chat voice controls | Preserve first-use privacy and model guidance, cancellable preparation/transcription, progressive speech states, background playback on Chat closure and cached offline controls; reject late permission/transcript/speech replies across profile/thread/input/view retirement | [Owned voice lifetimes](../tests/chat-voice-owned.test.ts), [original voice runtime](../tests/voice-chat-runtime.test.ts), [headless voice UI](../tests/playwright/chat-voice-owned.spec.ts), [static cached voice](../tests/pwa/sveltekit-chat-voice.spec.ts) |
| Manual biometrics | Writes, deletions, and migration metadata remain scoped to the originating profile; failed deletion preserves rows | [Profile boundaries](../tests/manual-profile-boundaries.test.ts), [heart-rate deletion](../tests/manual-heart-rate-deletion.test.ts) |
| Agent Access migration | A failed encrypted profile write retains its original credential source through reload; another profile cannot consume it; cleanup follows confirmed persistence; new credentials never enter plaintext mirrors | [Encrypted storage recovery](../tests/agent-access-migration-recovery.test.ts), [origin ownership](../tests/settings-agent-access-origin.test.ts), [headless static PWA](../tests/pwa/sveltekit.spec.ts) |
| Security and Backup settings | Preserve encryption and backup explanations together; keep snapshot IDs and folder permissions; use keyboard-accessible restore controls; reject stale snapshot reads after remount; retain offline first use and encrypted cold-launch unlock | [Owned components](../tests/settings-protection.test.ts), [folder lifecycle](../tests/backup-folder-presentation.test.ts), [browser backup paths](../tests/playwright/backup-browser-coverage.spec.ts), [static PWA](../tests/pwa/sveltekit-protection.spec.ts) |
| PPQ accounts and funding | Preserve anonymous recovery credentials before encrypted storage, catalog or consent failures; reject stale account, invoice, QR and balance replies; keep keys and payment text out of nonsecret snapshots and clipboard attributes; enforce every payment-method minimum; preserve funded-account removal confirmation, private-model entitlement, cold launch and update consent | [Account lifecycle](../tests/ppq-account-controller.test.ts), [funding lifecycle](../tests/ppq-topup-controller.test.ts), [view ownership](../tests/ppq-settings-service-owner.test.ts), [private catalog](../tests/ppq-catalog-owner.test.ts), [owned browser UI](../tests/playwright/ppq-settings-owned.spec.ts), [static PWA](../tests/pwa/sveltekit-ppq-settings.spec.ts) |
| Wallet funding ownership | Preserve private invoice and token ports, original-mint quote identity, minimum whole-sat amounts, single-flight requests, paid/terminal QR guards, close/reopen recovery, cross-tab leadership, fee disclosures and encrypted cold launch; closing presentation must not stop wallet-wide reconciliation | [Owned component](../tests/wallet-funding-component.test.ts), [controller](../tests/wallet-funding-controller.test.ts), [invoice/recovery lifecycle](../tests/wallet-funding-service.test.ts), [background monitor](../tests/routstr-funding-monitor.test.ts), [theme/layout browser UI](../tests/playwright/wallet-funding-owned.spec.ts), [static PWA](../tests/pwa/sveltekit-wallet-funding.spec.ts) |
| CLI Settings ownership | Preserve setup/login/testing, agent and target-isolated model choices, direct/paused/outdated/linked/embedded companion management, bounded frame messages and credential-free UI; reject obsolete connection publication and late responses while allowing accepted writes and host actions to finish after close | [Owned panel](../tests/cli-agent-settings-component.test.ts), [action controller](../tests/cli-agent-settings-controller.test.ts), [connection publication](../tests/agent-connection-owner.test.ts), [management branches](../tests/cli-companion-ui.test.ts), [headless theme/layout controls](../tests/playwright/cli-agent-settings-owned.spec.ts), [static controls and cold launch](../tests/pwa/sveltekit-cli-agent-settings.spec.ts), [encrypted model choices](../tests/pwa/sveltekit-cli-agent-models.spec.ts) |
| Import Benchmarks ownership | Preserve report/protocol identity, raw versus corrected scoring, missing-value and percentage-point metrics, bounded difference review, locked answer keys and health records; accepted runs survive closure while obsolete confirmation/progress callbacks cannot update another view; native and static cached cold launch retain device-local history | [Owned runtime](../tests/settings-import-benchmark-controller-runtime.test.ts), [existing workflows and calculation parity](../tests/playwright/import-benchmarks.spec.ts), [headless theme/layout accessibility](../tests/playwright/import-benchmarks-owned.spec.ts), [static PWA history and health-data persistence](../tests/pwa/sveltekit-import-benchmarks.spec.ts) |
| Routstr shared actions and status | Preserve synchronous public controls, escaped attributes, first-click single dispatch and button identity through hydration; retain menu keyboard/outside behavior and reject removed/replaced/disposed owners; preserve node/mint/refund financial assertions, status typography, complete offline graph and both generated artifacts in coverage | [Action ownership](../tests/routstr-actions-component.test.ts), [status ownership](../tests/provider-status-component.test.ts), [build accounting](../tests/routstr-actions-build.test.ts), [real browser compatibility](../tests/playwright/routstr-actions-owned.spec.ts), [wallet and refund regression](../tests/playwright/cashu-wallet-browser-coverage.spec.ts), [static recovery](../tests/pwa/sveltekit-routstr-shell.spec.ts), [static node flow](../tests/pwa/sveltekit-wallet-node.spec.ts) |
| Routstr session connection | Keep draft tokens and session receipts behind private ports; preserve consent, original-node encrypted saves/removal, journal-before-payment, early recovery receipt, single-flight and 60-second clipboard clearing; reject stale views/accounts/drafts and malformed conversion keys without redeeming again; retain encrypted sessions and uncertain payment journals through cached cold launch | [Account ownership](../tests/routstr-account-controller.test.ts), [payment boundaries](../tests/routstr-security.test.ts), [original provider callbacks](../tests/playwright/provider-coverage-batch.spec.ts), [headless theme/layout accessibility](../tests/playwright/routstr-account-owned.spec.ts), [static account and recovery](../tests/pwa/sveltekit-routstr-account.spec.ts) |
| AI setup and balance notices | Preserve import-context copy, OAuth/Settings/sex-specific demo/credits actions and extension interception; callbacks close their current dialog before service entry; retain overlay identity while rejecting retired controls and style replies; release focus listeners and scroll locks on every dismissal; actual image import and chat 402 work from cached static assets through cold launch | [Owned dialog runtime](../tests/ai-action-dialog-runtime.test.ts), [original import actions](../tests/playwright/pdf-import-browser-coverage.spec.ts), [original provider actions](../tests/playwright/provider-coverage-batch.spec.ts), [headless themes/layout/accessibility and extensions](../tests/playwright/ai-action-dialog-owned.spec.ts), [static PWA acceptance](../tests/pwa/sveltekit-ai-action-dialog.spec.ts) |
| Node proxy transport | Keep the reviewed exact Undici version, validated DNS pinning, complete response lifetime, manual redirects and cancellation | [Policy and lookup](../tests/proxy-network.test.ts), [installed transport sockets](../tests/proxy-network-undici.test.ts), [upstream behavior](../tests/proxy-upstream.test.ts) |
| Wallet recovery | Preserve proofs, balances, and saved recovery through failures; retain mint and node ownership | [Wallet runtime](../tests/cashu-wallet-runtime.test.ts), [wallet UI](../tests/playwright/routstr-wallet-dom.spec.ts) |
| Data-protection setup picker | Preserve configured-card dismissal, unsupported folder capabilities and public callback configuration; reject obsolete profile, route, modal and lazy-load owners while retaining the dialog across responsive rerenders; keep strict six-theme accessibility, keyboard focus, dismissal and scroll restoration; static first use and two cold launches follow real encryption/sync setup dialogs without changing the profile | [Capability status](../tests/data-protection-status.test.ts), [headless picker ownership](../tests/playwright/data-protection-picker-owned.spec.ts), [cold facade](../tests/playwright/context-card-dashboard-ai-loader-browser-coverage.spec.ts), [static offline handoffs](../tests/pwa/sveltekit-data-protection-picker.spec.ts) |
| Offline updates | Failed installation preserves the working app and data; retry activates safely; tabs retain their local data | [PWA lifecycle](../tests/pwa/lifecycle.spec.ts) |
| Light context | Use canonical total vitamin D and units; reject another profile's stale values | [Vitamin D context](../tests/lab-vitamin-d-context.test.ts), [Light AI rendering](../tests/test-light-ai-renders.ts) |

These are selected pointers, not an exhaustive inventory or a claim that every
possible failure is covered. Retain temporary assertion reviews and progress
logs locally in `.local-notes/`; use PRs and revision-specific CI artifacts for
shared change and verification evidence.

## Coverage measurement and floors

The combined collector inventories first-party production roots, including
never-imported modules. It measures emitted JavaScript from the canonical
TypeScript sources, without counting both as separate modules. Function identity
uses source ranges rather than names. Unmapped collector ranges remain visible;
do not assign them through broad overlap to improve a result.

Svelte components are inventoried once at their emitted native-browser URL.
Their generated source maps identify bundled third-party framework functions;
only positively mapped library functions are separated from the first-party
function denominator. Unit collection uses a public native V8 provider and keeps these artifacts in
the same compiled coordinate space as browser collection. Its explicit
`coverage-functions.json` receipt contains function identities only: each positive
must retain its own native entry count, exact canonical source mapping, complete
public transform witness and collected-versus-finished test membership. The
consumer independently rederives these identities from the retained raw capture.
Large inspector source-map URLs are stored once as authenticated, content-addressed
JSON strings in the versioned capture transport. Readers restore their exact
logical metadata before validation and replay, accept earlier inline captures,
and require every referenced blob in the sealed receipt inventory. Raw entries,
anonymous scripts, source snapshots, test membership and the 64 MiB per-record
bound remain intact. Coverage transport uses Node's built-in filesystem directly
so application filesystem mocks cannot intercept evidence collection.
Unsupported function syntax and authenticated anonymous VM scripts remain visible
with zero credit; malformed ranges,
missing or ambiguous provenance, stale sources and altered transport fail.
External component maps retain the authoritative framework ownership split.
No native statement, branch or byte coverage is inferred. Native function coverage
currently supports one-shot runs; ordinary `test:watch` remains available without
`--coverage`. Focused component tests
do not replace the complete combined-coverage gate.

The retained `production-coverage` artifact includes per-file results, feature
summaries, unmapped ranges, and revision information. The authoritative global
and feature floors live in [coverage-baseline.json](../scripts/coverage-baseline.json).
The current global function floor is **89%**, with independent floors for all
17 feature groups. Feature floors retain measured reference counts and cannot
be weakened to obtain a green check. Review classification and baseline changes
explicitly; improvement in one feature cannot hide regression in another.

The dedicated producer contracts and `npm run test:critical-coverage` explicitly
retain Istanbul. The critical gate separately enforces line, statement, function,
and branch thresholds for selected critical modules. Its suite membership,
source inventory, and per-module thresholds are defined in
[vitest.critical.config.ts](../vitest.critical.config.ts), rather than a fixed
suite count in prose. Missing execution must fail the applicable floor.
This gate supplements the complete denominator; it does not replace it.
The service-worker portion includes [old-client and font-alias ownership](../tests/service-worker-client-cache.test.ts)
as well as [installation, version and offline failure paths](../tests/service-worker-runtime.test.ts)
and [proved retry-chunk behavior](../tests/service-worker-retry-aliases.test.ts).
Early activation requires direct identity replies from all live documents; missing
replies must defer activation without reloading an old document. Verify both that
legacy close-and-reopen boundary and normal identified-tab updates. Stylesheet
ownership tests must reject unknown or missing owned bodies, retain the same rule
for exact retry URLs, and bind startup CSS only to proven cached app navigations.
Their inclusion must retain the same module floors; additional selected execution
does not establish a fresh whole-project combined measurement.

## Release and integration evidence

Opening CLI Settings and an explicit rescan must refresh installed versions through the separately installed Companion. Ordinary discovery keeps its short unused-port deadline; only an identified Companion receives the longer bounded refresh request. Version probes run asynchronously and concurrently against each configured executable and its launcher arguments, without ACP/gateway arguments, authentication checks, client restarts or gateway enumeration. Failed probes clear stale version text. Browser refresh failures retain the already discovered agents and their original discovery credential with version text cleared; explicit caller cancellation still discards the result. Concurrent refreshes share work, and discovery origin/credential boundaries remain unchanged. [Version probes](../tests/local-agent-version-refresh.test.ts), [host discovery](../tests/agent-host-service.test.ts), [browser discovery](../tests/agent-chat-settings.test.ts) and [Settings presentation](../tests/cli-companion-ui.test.ts) cover this contract.

Codex turn failures must reach the browser as errors rather than empty or partial
successful answers. Preserve turn/thread isolation, let retryable app-server
errors recover, release pending tools and request reservations on terminal errors,
and keep raw provider messages, stacks, paths, credentials and prompt text out of
the browser. The client also rejects legacy `done` events with `failed` or
`interrupted` finish reasons, even after valid JSON text.
[Host and client failures](../tests/agent-host-turn-errors.test.ts),
[legacy client completions](../tests/agent-chat-client.test.ts) and
[error redaction](../tests/agent-host-errors.test.ts) cover this contract.

[Release evidence](../.github/workflows/release-evidence.yml) is requested by
manual dispatch or the `run-release-evidence` PR label. It runs full regression,
both selected real WASM model scenarios, and the two isolated service-image
build/runtime checks. Its acceptance job requires its declared dependencies to
pass. It does not deploy. The model checks validate the JSON execution report:
skipped tests, flaky retries, and report errors do not count as passing inference.

Knowledge verification uses a real MiniLM model for indexing, search, and cache
reuse. Voice verification uses Kokoro and small Whisper on WASM. CI model jobs
use bounded execution and an isolated browser; requesting release evidence
explicitly authorizes those model downloads. Avoid extra local downloads unless
needed for the requested work.

[Sync compatibility](../.github/workflows/sync-compat.yml) runs separately.
Real paid providers, live wallets, installed CLI agents, physical hardware,
WebGPU, and larger model tiers require their own acceptance evidence. Synthetic
transport and mint fixtures do not prove live billing or hardware behavior.
Use checks and retained artifacts for the exact selected revision when assessing
release readiness. Local working logs do not establish current release acceptance.

Channel drill-down contracts in
[`light-channel-presentation.test.ts`](../tests/light-channel-presentation.test.ts)
compare frozen original DOM/SVG trees, source-separated chart values, formatter
boundaries, literal metadata and real delegated actions. The headless
[`light-channel-owned.spec.ts`](../tests/playwright/light-channel-owned.spec.ts)
compares original computed geometry across six themes and narrow/wide layouts,
then exercises keyboard opening, research disclosure, quick-log actions and
single-region replacement. These focused checks do not replace final whole-app
or installed-PWA acceptance.

Channel pill contracts in
[`light-channel-pills.test.ts`](../tests/light-channel-pills.test.ts) compare
independently captured original row, dashboard and SVG trees, signal thresholds,
missing/empty service data, literal metadata and live refresh of an open detail.
[`light-channel-pills-owned.spec.ts`](../tests/playwright/light-channel-pills-owned.spec.ts)
compares original computed styles in compact strips and channel-card contexts
across six themes and three widths, checks axe AA, keyboard/touch targets and
actual delegated row/dashboard actions. Empty-card ink uses the secondary text
token as a declared contrast improvement; source scaling and counts stay exact.

Channel section ownership in
[`light-channel-section-owned.spec.ts`](../tests/playwright/light-channel-section-owned.spec.ts)
is compared with independently frozen container CSS and location markup across
six themes and four widths, including the inclusive 375px boundary. It covers
empty/country/precise-location visibility, both dashboard log states, exact
container resets, axe AA and real keyboard location/dashboard actions. The
static channel acceptance additionally covers the offline dashboard navigation
button before exercising all six pathway details and two cold launches.

Device library contracts in
[`light-device-library.test.ts`](../tests/light-device-library.test.ts) compare
independently captured original library/picker trees, ordered/deduplicated chips,
usage history, literal metadata and affiliate policy. The headless
[`light-device-library-owned.spec.ts`](../tests/playwright/light-device-library-owned.spec.ts)
compares representative embedded/widget cards and the picker across six themes
and five widths; every type band is checked separately. It checks real hover,
axe AA, visible keyboard focus and coarse 44px targets. Explicit reference
adjustments cover readable link/metadata ink, visible phone delete and larger
touch targets; assertions and compiler safety remain unchanged.
[`sveltekit-light-device-library.spec.ts`](../tests/pwa/sveltekit-light-device-library.spec.ts)
exercises the real owned-device list, picker-to-session path, dismissals and
complete stored profile through two closed-client offline cold launches.

Device setup contracts in
[`light-device-setup-presentation.test.ts`](../tests/light-device-setup-presentation.test.ts)
compare independently frozen original preset/custom markup for manual, text-AI
and vision-AI branches, both initial distance units, and full/empty curated lists.
[`light-device-setup-owned.spec.ts`](../tests/playwright/light-device-setup-owned.spec.ts)
compares original computed styles across six themes and five widths, including
selected preset states and hover, and checks AA, keyboard focus and coarse targets.
Readable ink, URL naming/sizing, explicit button types and touch sizing are declared
improvements. Existing controlled-provider browser tests retain URL extraction,
form readers, validation, conversion and fallback assertions.
[`sveltekit-light-device-setup.spec.ts`](../tests/pwa/sveltekit-light-device-setup.spec.ts)
creates actual preset and manual devices offline, checks full unrelated profile
preservation and canonical specifications, and verifies both records through two
closed-client cold launches. These checks do not establish live external AI
provider availability or whole-application release acceptance.

Channel-device-option contracts in
[`light-device-recommendations.test.ts`](../tests/light-device-recommendations.test.ts)
compare independent original output and preserve regional joins, ordering,
deduplication, cap-before-URL-rejection, toggle suppression, attribution and literal
metadata. [`light-device-recommendations-owned.spec.ts`](../tests/playwright/light-device-recommendations-owned.spec.ts)
compares original computed styles across six themes and five widths, with explicit
readable-ink, wrapping, native button and coarse-target improvements; it checks AA,
hover, focus and both Enter/Space on the real settings delegate.
[`sveltekit-light-device-recommendations.spec.ts`](../tests/pwa/sveltekit-light-device-recommendations.spec.ts)
locates the actual bundled public namespace from the exact artifact, renders its
maintained export with cached real catalog/preset data, and exercises actual
privacy/display opt-out controls offline and through two closed-client cold
launches with full stored-profile equality. This is public-contract acceptance;
it does not claim that the current Light page inserts the renderer automatically.

The shared Light Environment screen editor has independent pre-migration markup
contracts in [`light-environment-screen.test.ts`](../tests/light-environment-screen.test.ts)
and headless theme/layout/keyboard/touch coverage in
[`light-environment-screen-owned.spec.ts`](../tests/playwright/light-environment-screen-owned.spec.ts).
The existing Light Environment CRUD, grading, today-reset and delegated editor
checks continue to cover its domain and action contracts.
The corresponding static-PWA case,
[`sveltekit-light-environment-screen.spec.ts`](../tests/pwa/sveltekit-light-environment-screen.spec.ts),
uses real editor actions and committed IndexedDB profile reads for first-offline
creation/editing/reassignment and two closed-client cold launches. Cached room,
measurement, screen and audit verdicts retain their adjacent static acceptance.

The live environment summaries have independent pre-migration copy, counts,
severity and callback contracts in
[`light-environment-summary.test.ts`](../tests/light-environment-summary.test.ts).
[`light-environment-summary-owned.spec.ts`](../tests/playwright/light-environment-summary-owned.spec.ts)
compares frozen original geometry and severity across six themes and widths
including both sides of the inclusive 700/420px metric breakpoints. It verifies
current-theme foreground, readable-ink and coarse-target improvements, AA and keyboard focus in all four
headless browser profiles. The existing delegated editor and static environment
cases exercise assessment actions, saved data and adjacent cached verdicts;
they retain first-offline and two closed-client cold-launch acceptance.

The [startup banner contract](../tests/analytics-consent-lifecycle.test.ts) checks consent, retry lifetime and duplicate roots; the [update presentation contract](../tests/version-update-presentation.test.ts) retains button identity and native copy. [Styles contracts](../tests/startup-banner-styles.test.ts) preserve foreign declarations, shared keyframes and cascade positions. The [static banner acceptance](../tests/pwa/sveltekit-startup-banners.spec.ts) constructs Analytics for the first time offline, preserves consent and complete canonical profiles over two zero-page cold launches, and checks exact cached presentation sources. Its waiting-worker offer is synthetic; the unchanged [real update acceptance](../tests/pwa/sveltekit.spec.ts) separately checks failed installs, Later, explicit offline Reload, retained old-tab code and cache retirement. These focused checks do not establish physical installation or whole-application acceptance.

## CI artifact and execution qualification

The workflow separates artifact preparation, units, native browser coverage,
shipping SvelteKit acceptance, and isolated performance measurement. Every
consumer restores the producer's exact catalog before its one dependency-install
compilation, then verifies the complete artifact inventory and current authored
source fingerprint. Lifecycle suites remain serial within each runner; independent
Chromium tests use a bounded CPU-aware worker count. Four native Chromium shards
feed the unchanged combined-coverage collector. Four SvelteKit projects use up to
two file shards each, with complete selected-case identity and finite capability
skip checks at the final gate. Partial coverage inputs or missing selected jobs
fail the gate. PR runs cancel superseded scoped runs; full release evidence stays
separate. The required merge-check context remains `test`. Immutable Kit receipt artifacts keep each GitHub run attempt
in a separate directory. A failed-job rerun may reuse successful receipts from the
same source revision and workflow run, bounded between the collection and current
gate attempts. Only the newest receipt for an identical declared shard replaces
its predecessor; a failed newest receipt never falls back to an older pass.
Every selected case must still appear exactly once, with one native test attempt,
unchanged declarations and only the existing finite capability skips. Different
revisions/runs, future attempts, ambiguous receipts and overlapping shards fail
qualification.

Use focused local unit, collection and headless browser checks when changing this
orchestration. These checks validate the workflow contracts; only a real GitHub
Actions run establishes hosted-runner timing and exhaustive matrix acceptance.


Frozen native renderer oracles are historical test inputs. The TypeScript
migration check qualifies the two original archive manifests by fixed SHA-256
and checks all fifteen recorded renderer bodies as regular, unlinked files
before distinguishing those bytes from authored JavaScript. The manifests'
historical absolute paths are provenance and are never followed. Missing or
changed evidence fails qualification; additional JavaScript remains authored
and blocks completion. The complete source inventory and LOC baseline remain
unchanged, with the qualified archive reported separately as
`frozenHistoricalOracles`. These test fixtures are excluded from application
output; they must not be regenerated from migrated components.


The Wearables detail rendering contract compares all eighteen chronological
chart states (8 + 5 + 5) against the immutable original application rendered in
the same actual Playwright browser and public context conditions. The original
application archive and its independent source/observer snapshot live only in
`tests/fixtures/wearable-native-parity/`; they are excluded from the application
output and offline cache. Their compressed bytes, decoded frame, member inventory
and every original file are authenticated before temporary extraction and checked
again before owned cleanup. Reference failure fails the case; there is no fallback
to current components, a historical checkout, a network download or generated pins.

The active rendering gate requires exact raw RGBA bytes, dimensions, the complete
paint receipt and every native dataset point coordinate for every same-browser
original/current pair, with no tolerance or alternate SHA. Existing historical manifests and receipts remain byte-exact: mismatches
against their older renderer paint are reported explicitly as historical
mismatches, never as passing historical SHA assertions. Complete original and
current nonpaint Chart configuration, callbacks, DOM, profile, storage, cache,
device, focus, action and event/POST chronology remain checked against the
authenticated native receipts. The existing 240-second case deadline and 64 MiB
per-journey raw-pixel cap, eighteen unique ordered states and browser matrix
remain unchanged. Manual-reading Sync adds a separately authored exact expectation
for the twelve legacy mirror entries, accepted writes/deletion tombstones, per-field
clocks and one backfill metadata record. Complete profile objects, committed JSON
strings and device receipts still use full equality; unrelated historical fields
and all frozen fixture bytes remain unchanged. The expected additions come from
the fixed synthetic journey, never observed candidate output or runtime mirror
helpers. Portable fixture, ordering, one-byte pixel, geometry and paint corruption
controls exercise these boundaries.

Wearables historical dataset coordinates remain authenticated and are reported
when the current platform differs. Their active expectation is the independently
rendered original in that same browser, compared exactly before a successful pair
is recorded. Dataset identity, type, hidden state, point structure/count and all
other nonpaint fields retain exact historical checks. Historical coordinate
mismatches are not reported as passing the old coordinate gate.
