# Contributor Quick Start

Welcome. getbased is a zero-build, native ES module web app. There is no install step, no compiler, and no package manager required to run it locally.

## Prerequisites

| Requirement | Purpose |
|---|---|
| Modern browser (Chrome or Firefox recommended) | Running the app and the test suite |
| Python 3 | Local development server |
| Node.js + Puppeteer | Headless test runner (`./run-tests.sh`) — optional |
| AI API key or local AI server | PDF import and AI chat — optional |

## Get running in 3 steps

```bash
git clone https://github.com/elkimek/get-based
cd get-based
node dev-server.js
```

Open `http://localhost:8000`. The app loads immediately — no compilation, no `npm install`.

## The primary reference

**[CLAUDE.md](https://github.com/elkimek/get-based/blob/main/CLAUDE.md)** is the comprehensive architecture reference for this project. It documents every module, the full data flow, all localStorage keys, the AI pipeline, marker schema conventions, and every feature in detail. Read it before making any non-trivial change.

## Contributor docs map

| Page | What it covers |
|---|---|
| [Architecture](./architecture) | Zero-build philosophy, file layout, 6-layer dependency graph |
| [Module Reference](./module-reference) | All 38 JS modules: exports, purpose, window bindings |
| [Cross-Module Patterns](./cross-module-patterns) | Window exports, circular dep avoidance, state access |
| [Data Pipeline](./data-pipeline) | `getActiveData()` walkthrough, marker keys, values arrays |
| [Testing](./testing) | 30 test files, `./run-tests.sh`, writing new assertions |
| [Deployment](./deployment) | Vercel config, CSP, service worker cache, PWA |
| [Storage Schema](./storage-schema) | All localStorage keys, importedData structure, IndexedDB |

## Code patterns at a glance

**HTML onclick handlers** — exposed on `window` at the bottom of each module:

```js
// bottom of cycle.js
Object.assign(window, { openMenstrualCycleEditor, saveMenstrualCycle });
```

**Cross-module calls** — use `window.fn()` when a direct import would create a circular dependency:

```js
// views.js calls data functions without importing data.js directly
window.refreshDashboard();
```

**HTML interpolation** — always use `escapeHTML()` for user-controlled strings:

```js
el.innerHTML = `<span class="marker-name">${escapeHTML(marker.name)}</span>`;
```

**State access** — import the shared mutable `state` object from `state.js`:

```js
import { state } from './state.js';
const currentProfile = state.currentProfile;
```

## Pull request checklist

- Run `./run-tests.sh` — all 30 test files must pass
- Bump the SW cache version in `service-worker.js` if any app file changed
- Update `CLAUDE.md` if you changed architecture, added a module, or changed how a system-level feature works
