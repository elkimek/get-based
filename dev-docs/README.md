# Contributor Docs

getbased is a zero-build, native ES module web app — no install step, no compiler, no bundler.

**New here?** Start with [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for setup, running locally, tests, and PR guidelines.

## Primary reference

**[CLAUDE.md](../CLAUDE.md)** is the comprehensive architecture reference: every module, the full data flow, all localStorage keys, the AI pipeline, and marker schema conventions. Read it before any non-trivial change.

## Contributor docs map

| Page | What it covers |
|---|---|
| [Architecture](./architecture.md) | Zero-build philosophy, file layout, 6-layer dependency graph |
| [Module Reference](./module-reference.md) | All JS modules: exports, purpose, window bindings |
| [Cross-Module Patterns](./cross-module-patterns.md) | Window exports, circular dep avoidance, state access |
| [Context Assembly](./context-assembly.md) | How lab context is assembled for the AI |
| [Data Pipeline](./data-pipeline.md) | `getActiveData()` walkthrough, marker keys, values arrays |
| [Storage Schema](./storage-schema.md) | All localStorage keys, importedData structure, IndexedDB |
| [Testing](./testing.md) | Headless test runner, `./run-tests.sh`, writing new assertions |
| [Deployment](./deployment.md) | Vercel config, CSP, service worker cache, PWA |
| [Sun Spectrum Model](./sun-spectrum-model.md) | Bird-Riordan spectral reconstruction for Light sessions |
| [AI Surfaces Map](./ai-surfaces-map.md) | Canonical map of where AI runs vs deterministic math |
| [Lens Endpoint Contract](./lens-endpoint-contract.md) | Wire spec for a custom Knowledge Source server |
