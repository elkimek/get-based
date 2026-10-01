# TypeScript 7 migration

The accepted end state is the entire first-party JavaScript project migrated to
TypeScript 7, with complete functional parity and at least 30% less overall code.
Simplification must remove duplication and unnecessary code, preserve readable
formatting, and make module relationships easier to follow. Renaming files,
minifying source, suppressing diagnostics, weakening tests, or excluding difficult
modules does not satisfy this objective.

## Baseline and completion gates

The baseline is commit `371c00da0195c33f4c1d42e3c63b85c25746b086`.
`scripts/typescript-migration-baseline.json` records the original code totals by source group:
421,094 physical lines and 391,896 nonblank lines. The scope includes first-party
runtime, tests, build tools, types, styles, HTML, Python and shell; vendor code,
external documentation and generated JavaScript siblings are excluded. The same
scope applies before and after migration, including new helpers and tests.

`npm run migration:progress` reports current totals and remaining authored JS.
`npm run migration:check` requires zero authored JavaScript and at least 30%
reduction in both physical and nonblank lines. This is a completion gate, not an
intermediate CI gate. Complete parity additionally requires the entire existing
unit, browser, PWA, real-model and deployment verification appropriate to each
runtime; focused green tests do not prove repository-wide parity.

## Source and runtime contract

Migrated modules are authored only as `.ts`. TypeScript 7.0.2 emits ignored `.js`
siblings at existing public URLs. Import specifiers, worker URLs, service-worker
precache paths, server entry points and downstream HTTP contracts therefore stay
stable. `npm ci` runs the compiler through `prepare`. Development, test and
production commands also compile before use. Direct Node entry points require
`npm run typescript:build` after editing TypeScript.

`tsconfig.migration.json` enforces strict types, null checks, unchecked indexed
access, exact optional properties, unused declarations and erasable syntax on
migrated code. It never emits on errors. Existing JavaScript checks and the
zero-debt strict-null ratchet remain active while the rest of the migration is
in progress. No `any` escape types or diagnostic suppression were introduced in
the migrated modules.

Architecture and source inventories prefer the canonical TypeScript file and
exclude emitted siblings. Security policies retain their runtime URL identity,
so renames do not silently approve new sinks. Coverage measures emitted JavaScript
for both Node and browser collectors, preserving function offsets and including
never-imported modules without counting TypeScript and output as two modules.
The generated module map points reviewers to actual TypeScript sources.

The compiler is TypeScript 7. The separately named `typescript-api` dependency is
TypeScript 6.0.3, temporarily used only by existing AST tools and the original
JavaScript debt ratchet. Removing that transitional tooling dependency remains
part of completing the migration; it is not evidence of a fully migrated project.

## Shared contracts

`js/marker-schema/types.ts` defines the built-in authoring catalog contract;
category modules validate it with `satisfies` while retaining their inferred keys.
`js/marker-schema/index.ts` composes the catalog in its original order. The
runtime catalog generator continues producing the same marker and identity data.

`js/runtime-callbacks.ts` handles callback configuration for Notes, Supplements
and 18 other feature adapters. Omitted slots remain intact, explicitly invalid
callbacks clear their slots, unknown keys are ignored, and callers receive an
independent snapshot for restoration. Own-key configuration is the default;
adapters that originally accepted inherited keys request that behavior explicitly.
Validation still reads a functional getter twice, and a throwing getter preserves
preceding assignments. The consolidation matched the original state, snapshots,
exceptions and proxy access traces in 430 differential scenarios. Feature adapters
expose their own named actions. Different fallback and invalid-value policies
remain separate.

`js/biology-score-types.ts` shares named score input and definition contracts
across the catalog, computation contract and planner. All original weights,
paths, core groups, route rules and evidence labels are retained. Panel route
keys are checked against the catalog by `tests/biology-score-contract.test.ts`.

`tests/helpers/legacy-assertions.ts` replaces repeated reporting harnesses in 125
legacy suites. Assertion expressions remain in the individual tests; counters,
truthiness, evaluation order, detail coercion and each suite's message separators
retain their original behavior. The consolidation preserved 6,959 assertion calls.

Authored TypeScript tests are checked with the same strict options through
`npm run typecheck:migration-tests`. Its no-emit configuration allows imports
from remaining JavaScript tooling while those tools are being migrated. Runtime
implementation checking remains separate and never enables `allowJs`.

Model catalogs, deployment metadata, CLI attribution and child-process lifecycle
now have named contracts. Process observation and bounded-file reads accept only
the methods they actually use. The test storage availability/replacement logic is
shared by standalone Node suites and Vitest without changing either harness's
other browser-global behavior. The affected-test planner is authored as
`scripts/pr-test-scope.mts`; its emitted CLI remains at the original `.mjs` path.

Core utilities, modal focus/scroll lifecycle, browser utility adapters, speech text,
privacy-safe diagnostics and marker/device display helpers now use native strict
TypeScript contracts. External browser libraries are described by the methods the
app consumes. Type-only conversions preserve the emitted runtime syntax trees;
modal and voice browser regressions verify their DOM and scheduling behavior.

Wearable OAuth and chart adapters, tooltip browser hooks, modal trigger memory,
EMF lazy loading and Sun session display helpers have named TypeScript contracts.
Session math, warning text, retry URLs, focus restoration and scheduling operations
are unchanged. Utility, privacy and session formatting tests are also authored and
checked as strict TypeScript.

Light setup catalogs now check their Fitzpatrick and photosensitivity keys.
`js/sun-session-model.ts` owns the shared exposure input and calculation-snapshot
contracts used by session display. Live and completed session calculations retain
their original fields, ordering, coefficients, defaults and safety labels.

Proxy policy, DNS pinning, bounded upstream transport, distributed rate limiting,
CAMS relay and postal geocoding now use strict TypeScript contracts. Minimal
transport interfaces describe injectable dependencies without changing abort,
redirect, byte-cap, cleanup or atomic lease behavior. OAuth providers share form
construction while retaining deployment gates, required fields, field order,
client matching and authentication differences. A differential comparison with
the original implementation matched 2,112 scenarios, including malformed fields
and deployment configurations. JSON replies share a response helper that preserves
serialization before CORS and optional-header evaluation; focused tests check that
ordering and rejected origins. Environment bounds share their original parser.

`lib/oauth-token-form.ts` now owns OAuth grant validation and ordered form
construction for both hosted and local proxies. Provider handlers retain their
original environment gates, endpoint labels and Polar authentication encodings.
The local proxy matched its original calls, form bytes, CORS, statuses and errors
in 2,600 differential scenarios. Native TypeScript regression tests retain wire
bytes, raw-value coercion and getter order. The local page fetcher and browser
proxy routing also use named contracts.

The wearable registry now checks canonical metric identifiers, provider mapping
fields, OAuth configuration and visibility metadata against shared types without
changing catalog values or ordering. Companion HTTP and listener recovery expose
only the methods they consume. Their strict TypeScript suites cover real loopback
requests, declared and streamed caps, disconnects, port fallback and cleanup.

All seven wearable OAuth modules now use strict TypeScript contracts. Shared
state helpers retain redirect selection, nonce sizes, callback query reads,
consume-before-parse CSRF handling and expiry checks. A synchronous refresh
coordinator retains existing async wrappers, lock names, rotated-token writes,
Polar's no-refresh path and Google's additional lock/credential checks. Token
normalization retains each provider's raw fields, defaults and user-ID handling.
The original and consolidated implementations matched 3,115 scenarios, including
storage/getter/fetch traces, object identity, property order and promise turns.
Withings deadline regressions are also authored as strict TypeScript. Its error
catalog is shared directly, removing the auth module's dependency on data fetching.

Browser suites share a strict TypeScript cache-URL factory. Eighty-seven identical
helpers were removed; their namespaces, URL bytes, clock/random evaluation order
and callable shape matched in 1,566 differential scenarios. Suite assertions and
coverage cases retain their original scope.


WHOOP, Ultrahuman, Fitbit and Polar data normalization now use strict native
TypeScript. Wire fields remain opaque until the existing numeric checks; canonical
rows constrain metric names and preserve missing-value semantics. Three providers
share an independent row constructor with the original field order. Polar retains
raw non-JSON responses, non-enumerable pending transactions, retroactive records
and deferred commit behavior. Before consolidation, all four emitted runtime
syntax trees matched the originals; 84 provider comparisons also matched requests,
errors, dates, measurements and transaction descriptors/commit calls.

Fifty-four browser suites share a typed blank-page factory while retaining their
exact HTML, wildcard route patterns, optional HTTP statuses and callable shape.
The original and shared setups matched 1,512 scenarios, including getter order,
callback identity, failures and promise turns. Security source checks now follow
the shared OAuth expiry guard; native tests require all seven providers to consume
expired state without exchanging credentials. New runtime helpers are included
in the offline cache graph. DOM inventory updates preserve all reviewed sink
fingerprints and counts.


The Oura, Withings and Google Health data layers are also strict native TypeScript;
all seven OAuth providers and data adapters now have typed wire and canonical-row
contracts. Before consolidation, the three additional emitted runtime syntax trees
matched their originals. Google reconciled metric families share date attribution
and assignment through typed provider aliases/readers; Withings shares the existing
base-row constructor while retaining additional fields and order. A 297-scenario
comparison matched request bytes, property reads, errors, dates and conversions,
including missing data, pagination, denied scopes and raw numeric coercion.

Twenty-four runtime suites share descriptor-safe global snapshots and restoration;
21 also share the identical setter. Custom storage and application-state cleanup
stays in each suite. The extraction matched 480 scenarios involving accessors,
hidden/read-only/fixed descriptors, duplicate/mutated keys and repeated restoration.
The existing nine-case Google Health adapter/OAuth integration suite is authored
and checked as strict TypeScript. Its existing three-case privacy/source-precedence
suite is also strict TypeScript, using the native storage and pure summary contracts;
no original cases or assertions were removed.

Wearable row storage, the device-local credential vault and WHOOP profile protection
now use strict native TypeScript. Opaque provider and persisted fields cross named
row, envelope, crypto and version-guard contracts. The emitted storage modules
initially matched their original runtime syntax trees. Their identical range cursors
now share one synchronous helper; expanding its two call sites reproduces the
original complete storage syntax tree. Transaction completion, two-phase merging,
non-extractable key storage, restricted-row rechecks and atomic generation revocation
retain their behavior. Six native regressions abort transactions after successful
put requests and require rejection plus preservation of existing rows and metadata.

`js/wearables-summary-model.ts` owns pure summary derivation and significance gates.
The existing orchestrator re-exports those functions and retains profile persistence,
change history and meal-timing effects. All ten extracted function syntax trees match
the originals; 2,880 differential comparisons match source precedence, sparse values,
rolling windows and gate results. The pure runtime module is precached for offline
use. Legacy metadata readers now declare their existing shapes and nullability;
the strict-null ratchet stays at zero and DOM sink fingerprints remain unchanged.

Wearable display conversion, formatting, settings grouping and hosted relay consent
now use strict native TypeScript, together with their original unit suites. Both
emitted runtime syntax trees match their originals; provider/profile scoping,
explicit unticked consent, withdrawal, keyboard dismissal and prompt serialization
retain their behavior. Existing DOM sink fingerprints and production assets remain
unchanged.

Twenty-four browser suites share a typed outcome reporter while preserving their
collected, individual hard or individual soft assertion behavior. Reporting matched
1,008 differential scenarios, including property reads, circular values, serialization
failures and assertion exceptions. Seven runtime suites share a window descriptor
shim; 35 comparisons retain enumerability, accessors and fixed-property failures.
Ten legacy suites share typed relative-source fetch routing. The two original
response/read evaluation orders remain explicit; 4,680 comparisons retain URL
routing, 404 fallback, constructor/getter failures, remote failures and promise turns.
All 41 affected Chromium cases and all 3,383 unit tests pass.

`js/wearables-apple-health-parser.ts` now owns strict streaming/in-memory record
parsing, unit normalization and canonical day aggregation. The import orchestrator
retains ZIP loading, storage writes, profile metadata, summary persistence and cycle
review, and re-exports the original parser functions. Before simplification, all
eight extracted parser declarations and the complete typed runtime-hook module
matched the original runtime syntax trees. Eight repeated rounded-mean aggregators
now share an ordered loop. The original and native parsers matched 1,746 scenarios
covering units, day/night windows, source totals, malformed records, UTF-8 chunk
boundaries and progress. Six native regressions require Unicode source identity,
canonical rounding and error propagation across arbitrary chunk boundaries.

ZIP access and injected cycle parse/preview callbacks now have native contracts.
The original runtime regression script is checked as TypeScript; all eight original
assertion call sites remain, with seven executing on the successful path. The parser
is included in the offline cache graph. All 3,389 unit tests, four focused Chromium
cases, native/legacy type gates, zero strict-null debt, production budgets and
unchanged DOM sink fingerprints pass.

The encrypted profile-share backend now has native object-store and request-handler
contracts. The service owns envelope validation, rate limits and bounded expiry
cleanup; private Vercel REST storage, SQLite persistence and the Node HTTP adapter
remain separate. Both service Docker recipes compile the canonical TypeScript in
a build stage before copying runtime files, so a fresh clone can build without
pre-generated JavaScript. The SQLite, HTTP, transition and startup regression
suites are checked as native TypeScript, with their original assertions retained.

Companion process adapters now use native contracts for Codex JSON-RPC, ACP,
Claude stream events and OpenClaw file output. Shared state interfaces erase at
compile time, retaining constructor assignments and object layout. RPC results
remain opaque unless a caller declares a protocol-specific view. Pending-request
shutdown keeps live iteration and reads the current map again before clearing;
ACP retains numeric reply-ID coercion and a distinct close error per request.

Companion validation, private state, process isolation, MCP forwarding and CLI
resolution now have native contracts. Untrusted JSON stays opaque until the
existing field checks and coercions. Development discovery consumes the same
CLI definitions as the standalone companion, while retaining its POSIX probing
and Windows launcher paths. Seven existing foundation/lifecycle suites are
checked as native TypeScript, with executable assertions retained. The compatibility
service build includes the shared source graph required by the native library modules.

The companion's HTTP turn service now connects typed Codex, ACP and stream
adapter contracts to uploads, discovery credentials, MCP sessions, active turns
and pending tool replies. Shared cancellation preserves live map reads, deletion
before callbacks and result identity. ACP session binding and fresh Codex thread
policy construction share their previously duplicated paths. Management HTML
and existing-instance detection retain their complete emitted runtime behavior.

Companion installation and update controls now use native platform and injected
I/O contracts. CLI preparation, POSIX validation, executable resolution and file
installation share exact common operations; systemd, LaunchAgent and scheduled
task commands remain explicit. macOS no longer imports its executable resolver
from the Linux installer. Four existing platform/update suites are checked as
native TypeScript with their original cases and assertions retained.

The standalone companion runtime graph, CLI entry point and distribution builder
are now native TypeScript. Hermes gateway requests, sessions, event payloads,
registry profiles and credential-owned clients have explicit contracts; raw wire
values retain their original checks and coercions. Gateway RPC shutdown shares
the existing live-map settlement operation. The original streaming, registry,
connection, bootstrap and distribution cases remain executable native tests.

AI retry and timeout transport, browser location/dialog adapters, local model
normalization and Ollama discovery/context/inference/unload now have native
contracts. Response headers still end the initial-response timer; caller abort
and stream stall protection remain active. Raw model/event fields retain their
existing checks and coercions. Retry/stall unit cases are separate from the
remaining provider integration graph; validation retry tables and shared Venice
setup retain every original fixture value, operation and assertion.

Application state and the trusted edition extension boundary now use native
TypeScript. Shared rendering, action, notification and sync-key operations retain
their original receiver, exception, Promise and authorization behavior. The five
extension unit cases are native; two credential-storage integration cases still
exercise the remaining crypto graph. The secondary clinical unit registry uses
typed factories and shared definitions for enzyme, cholesterol, protein-mass and
cell-count units; all 83 entries retain exact values, order and independent mutable
arrays and records. Existing canonical-unit import and conversion checks remain.

The complete schema facade, generated catalog and its generator, environment
ranges, display-unit profiles, PDF unit conversion and catalog-only range
suggestions now use native TypeScript. The generator renders readable typed
source and the existing runtime URL is emitted by the compiler. Tier factories
retain independent mutable arrays and records. Original schema/identity/profile
and suggestion contracts are native tests; profile migration integration retains
its existing cases. All arithmetic, precision, unit labels, stable IDs, catalog
checksums, pricing, usage-storage order and public suggestion text are preserved.

Browser adapters for verdict events, category customization, lab context, session
analysis, mobile viewports, guided tours and active sync refresh now use native
TypeScript. Mixed dependency setters share one operation: nullable hooks clear
invalid explicit overrides, required hooks keep defaults, and omitted hooks stay
intact. Snapshot identity, inherited properties, getter reads and partial updates
on exceptions retain their original behavior. Four legacy adapter scripts and the
verdict suite are strict native tests with their original fixtures and assertions.

Sun facade callbacks, geolocation, camera-tool modal delegation and dashboard
context status now use native TypeScript. Validated nullable setters share their
own-key, null-first update rule; profile refresh and recommendations reuse the
mixed-hook operation. The original Sun fixtures retain stored-session identity,
geolocation options, failures and browser-absent behavior in a strict native suite.
Camera measurement writers declare tool/value/options without widening callers
or changing delegated-close identity and event containment checks.

Oura, Polar, Ultrahuman, Whoop and Withings share typed authorization URL and
startup operations in the existing OAuth-state module. Provider scopes, delimiter,
redirect selection, profile pinning, CSRF generation, storage ordering and public
sync/async behavior remain explicit at their boundaries. Callback parsing, token
exchange and refresh contracts retain their original provider-specific paths.

Lab-entry mutation, per-date reconciliation and cross-device array/map merge now
use strict native TypeScript. Timestamp parsing has one implementation; generic
dotted-path APIs preserve caller row types. Collection-context provenance declares
the snapshot ID strings actually persisted by the existing setter. Tombstones,
freshness ties, marker provenance, insulin aliases and HOMA-IR arithmetic retain
their complete executable behavior. Four delegated-action source suites share
the assertion harness as native tests with every original assertion retained.

Specialty parser adapters and the complete marker-repair graph now use native
TypeScript. The 225 legacy catalog entries retain their values and identities.
Canonical/named aliases and unit-suffix repairs share label normalization and
global metadata remapping; reference repairs share fresh field-pair arrays.
Snapshot matching, manual-range protection, urine compatibility, percent storage
conventions and product-scoped fatty-acid provenance remain explicit. The original
60 BioStarks assertions are retained in a strict native suite; profile migration
integration still checks the remaining profile graph.

Imported-data lab mutations and explicit entry restoration now use native
TypeScript. Fresh rows declare the canonical persisted lab contract; date-keyed
lookup retains existing row types and identity. Same-date restores keep unrelated
markers, provenance, context and tombstones. Validated import callers declare
the non-null row they already require. The complete original mutation suite is
a strict native integration test, with its fixtures and assertions unchanged.

Marker identity, category placement, unique-report provenance recovery and cold-safe
context-card history now use strict native TypeScript. Placement views preserve
caller category and marker types; mutation results expose their existing success
discriminant. Context callbacks share the inherited-property update operation.
The pure identity, placement and context callback suites are native tests; profile
and UI integration cases retain their existing fixtures and assertions. Legacy
IDs, collision resolution, slot reservation, metadata, normalized-value matching
and history replacement/capping retain their executable behavior.

The recommendation module bridge and strand-aware genotype lookup now use native
TypeScript. Named module hooks expose their actual catalog/render/detection
contracts; generic genotype maps retain caller value types. Recommendation,
Biology Scores and tour task facades share one timer operation, preserving
browser receiver binding, inherited hooks, getter reads, global fallback and
immediate execution. Every original recommendation runtime assertion is retained
in a strict native suite; focused timer regressions cover exceptions and fallback
behavior. Catalog data, strand resolution, references and public copy are unchanged.

Git inventory determines which authored files contribute to the LOC measure.
Ignored emitted siblings are absent; retained authored JS/TS siblings both count.
Pure marker identity tests use a separate filename from their retained profile
integration suite. A regression verifies that both authored suites are measured.

Sync wire compression/parsing, row decoding, array/map/scalar overlays, pull
snapshots, push telemetry and cutover readiness now use strict native TypeScript.
Decoded fields remain opaque until existing reader/merge guards apply; nominal
row, operation and telemetry contracts describe the actual stored shapes. Planner
and observability dependency access share independently scoped provider slots
with the original override, receiver, getter and exception behavior. The original
streaming decompression-cap fixtures/assertions are a native suite; remaining
sync integration cases are unchanged. Tombstones, freshness ties, provenance,
prototype-pollution checks, nested-path handling, caps and wire versions retain
their executable behavior.


Push-side array/map/scalar planners, snapshot advancement, the row-merge facade,
the delta application facade and profile delta orchestration now use strict
native TypeScript. One wire-row constructor replaces repeated insert/update
construction. Independently scoped query access now also supplies the merge and
application facades; forwarding snapshots retain actual provider references.
Deletion, resurrection, compression timing, SNP hydration, mutation ordering,
partial-failure retries and same-millisecond snapshot protection retain their
executable behavior. Repeated audit narratives now state the current invariants
concisely. Five original planner/profile-delta tests are native and share their
unchanged fake-client operations with remaining sync integration tests. New
regressions cover provider-reference snapshots and retry after partial mutation
failure. Three legacy source checks normalize compiler whitespace while keeping
their original patterns and bounds.


Sync state, dirty-generation tracking, origin attribution, settings, restore
admission, profile field selection, environment probes and diagnostic snapshots
now use strict native TypeScript. Named dependency ports retain stored-value
coercion, callback receivers, getters, default providers and exception ordering.
Save scheduling lives in an independently scoped native core; its transitional
JavaScript facade preserves legacy service initialization and live bindings.
Cutover flags share the existing snapshot storage module. Four original state
and restore suites are native tests with their executable assertions unchanged;
new regressions cover callback snapshots, failed configuration and independent
timer cancellation. The core is included in the offline dependency graph.


Subscription/poll scheduling, rebroadcast admission, hash-key cleanup, relay
quota/signing/health and Diagnose action dependencies now use strict native
TypeScript. Three dependency contexts share the existing update operation while
retaining inherited getters, invalid overrides, callback order and unbound calls.
Persisted chat validation and thread/persona conflict handling declare normalized
fields separately from opaque extensions. App state accepts both authored and
normalized messages; context display keeps its original reader behavior.
Thirteen optional-metadata cleanup branches share one typed operation. Four
original chat/subscription/quota suites are native with their original fixtures
and assertions preserved; a new regression covers stale metadata deletion and
opaque extension retention. A 1,210-scenario comparison matched the original
normalizer's values, errors and property-read order. Deletion clocks, clear/edit
conflicts, missing-body recovery, caps and storage ordering remain unchanged.

## Remaining work

Migrate the remaining browser features, server/API and companion code, workers,
build tools, test harnesses and test cases; consolidate repeated contracts,
runtime dependency plumbing, schemas and fixtures; remove transitional JS/type
infrastructure once all sources are strict TypeScript. Verify persistence,
cryptography, fund recovery, clinical units, import/export, sync, worker lifetimes,
provider routing and consent, offline/update behavior, and production budgets
without changing their public behavior. Update architecture documentation and
regenerate metadata from sources after each migration group.
