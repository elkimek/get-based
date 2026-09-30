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
suite remains intact in a separate JavaScript file while its storage and summary
implementations are awaiting migration; no cases or assertions were removed.

## Remaining work

Migrate the remaining browser features, server/API and companion code, workers,
build tools, test harnesses and test cases; consolidate repeated contracts,
runtime dependency plumbing, schemas and fixtures; remove transitional JS/type
infrastructure once all sources are strict TypeScript. Verify persistence,
cryptography, fund recovery, clinical units, import/export, sync, worker lifetimes,
provider routing and consent, offline/update behavior, and production budgets
without changing their public behavior. Update architecture documentation and
regenerate metadata from sources after each migration group.
