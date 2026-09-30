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

`js/runtime-callbacks.ts` handles the shared Notes and Supplements callback
configuration contract: omitted slots remain intact, explicitly invalid callbacks
clear their slots, inherited and unknown keys are ignored, and callers receive an
independent snapshot for restoration. Feature adapters expose their own named,
typed actions. Adapters with different configuration semantics remain separate.

## Remaining work

Migrate the remaining browser features, server/API and companion code, workers,
build tools, test harnesses and test cases; consolidate repeated contracts,
runtime dependency plumbing, schemas and fixtures; remove transitional JS/type
infrastructure once all sources are strict TypeScript. Verify persistence,
cryptography, fund recovery, clinical units, import/export, sync, worker lifetimes,
provider routing and consent, offline/update behavior, and production budgets
without changing their public behavior. Update architecture documentation and
regenerate metadata from sources after each migration group.
