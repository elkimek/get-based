# getbased TS + Svelte 5 Migration Plan

## Codebase Summary

- **42 JS source modules** (30,054 lines)
- **42 test files** (12,062 lines)
- **1 CSS file** (3,741 lines)
- **1 HTML entry** (203 lines)
- **No bundler** — native ESM via `<script type="module">`
- **791 global functions** exported via `Object.assign(window, {...})`
- **44 inline event handlers** in HTML (onclick, onchange, oninput, onkeydown)

## Architecture (Current)

**Pattern**: Flat ESM modules that import each other AND export functions to `window` global scope. Every module is both an ES module and a global namespace. `main.js` imports and bootstraps everything.

**State**: Single mutable `state` object (26 properties) shared everywhere via import.

**Rendering**: All UI is built with `innerHTML` / `document.createElement` — no component framework.

**Key insight**: This is NOT a standard ESM architecture. It's a hybrid where:
1. Modules use `import { x } from './y.js'` for explicit dependencies
2. But also stuff 791 functions onto `window` for HTML onclick handlers and cross-module calls
3. The HTML has 44 inline event handlers calling `window.someFunction()`

## Dependency Tiers

### Tier 0 — Foundation (no local imports, imported by many)
These must be ported first. Everything depends on them.

| Module | Lines | Exports | Imported by |
|--------|-------|---------|-------------|
| state.js | 26 | 1 (_labState + state object) | 19 modules |
| schema.js | 630 | 1 (MARKER_SCHEMA etc) | 11 modules |
| utils.js | 131 | 7 | 21 modules |
| constants.js | 196 | 0 (window export) | 5 modules |
| theme.js | 70 | 7 | 6 modules |
| hardware.js | 397 | 0 | 2 modules (via window) |
| image-utils.js | 141 | 4 | 4 modules |
| supplement-warnings.js | 138 | 0 | 3 modules (via window) |
| food-contaminants.js | 173 | 0 | 2 modules (via window) |
| markdown.js | 139 | 0 | 2 modules |
| nostr-discovery.js | 216 | 4 | 1 module |

### Tier 1 — Data Layer (depends on Tier 0)
| Module | Lines | Key Dependencies |
|--------|-------|-----------------|
| profile.js | 655 | state, schema, constants, utils, crypto |
| data.js | 888 | state, schema, utils, profile, crypto, sync |
| crypto.js | 799 | state, utils, profile, backup |
| charts.js | 536 | state, utils, theme, data |
| adapters.js | 524 | schema, utils |

### Tier 2 — Services (depends on Tier 0+1)
| Module | Lines | Key Dependencies |
|--------|-------|-----------------|
| api.js | 1,198 | schema, utils, crypto, hardware, provider-panels |
| sync.js | 901 | state, utils, profile, crypto |
| backup.js | 543 | utils, profile |
| pii.js | 746 | utils, api, crypto, state |
| lab-context.js | 716 | state, schema, utils, theme, data, profile, cycle, supplement-warnings, food-contaminants |

### Tier 3 — Feature Modules (depends on Tier 0+1+2)
| Module | Lines | Key Dependencies |
|--------|-------|-----------------|
| views.js | 2,176 | state, schema, utils, theme, data, profile, charts, supplements, dna, cycle, context-cards, api, pdf-import, lab-context, markdown |
| chat.js | 3,333 | state, constants, schema, utils, data, crypto, profile, api, image-utils, sync, lab-context, markdown |
| context-cards.js | 1,333 | state, constants, utils, theme, data, profile, api, schema, food-contaminants |
| pdf-import.js | 1,809 | state, schema, constants, utils, data, api, pii, adapters |
| supplements.js | 760 | state, utils, data, api, image-utils, profile, supplement-warnings |
| provider-panels.js | 2,304 | utils, api, pii, crypto, hardware |
| settings.js | 883 | state, utils, theme, schema, api, pii, crypto, sync, provider-panels |
| client-list.js | 986 | state, utils, profile, constants, nav |
| export.js | 1,005 | state, utils, data, profile, cycle, crypto |
| emf.js | 1,049 | (lazy-loaded) state, schema, constants, utils, data, image-utils, api, markdown, pdf-import, pii |
| cycle.js | 599 | state, constants, utils, data |
| dna.js | 991 | state, utils, data |
| cashu-wallet.js | 878 | utils, crypto |

### Tier 4 — UI/Entry (depends on everything)
| Module | Lines | Notes |
|--------|-------|-------|
| nav.js | 207 | state, utils, data, profile |
| tour.js | 213 | state, profile |
| main.js | 301 | Imports ALL modules, bootstraps app |

## State Object (state.js)

```javascript
// 20+ mutable properties, all global state
state = {
  chartInstances, markerRegistry, importedData, unitSystem,
  selectedCorrelationMarkers, currentProfile, profiles, profileSex,
  profileDob, chatHistory, chatThreads, currentThreadId,
  currentChatPersonality, dateRangeFilter, rangeMode,
  suppOverlayMode, noteOverlayMode, phaseOverlayMode,
  compareDate1, compareDate2
}
```

This will become Svelte 5 `$state()` stores, split into domain-specific stores.

## Port Strategy

### Phase 1: Scaffolding
- Initialize SvelteKit project alongside existing code
- Configure Vite, TypeScript, Svelte 5
- Set up dual-mode: old JS runs alongside new TS/Svelte
- Keep `index.html` as fallback during migration

### Phase 2: Foundation → Data Layer (Tier 0 + 1)
Port in dependency order:
1. `state.js` → Svelte 5 stores (`$state`, `$derived`)
2. `schema.js` → TypeScript with proper interfaces
3. `utils.js` → Pure TS utility functions
4. `constants.js` → TS constants
5. `theme.js` → Svelte theme store
6. `profile.js` → Svelte store + TS types
7. `data.js` → Svelte store + TS data layer
8. `crypto.js` → TS module (Web Crypto API stays)
9. `charts.js` → Svelte Chart.js wrapper components

### Phase 3: Services (Tier 2)
10. `api.js` → TS API client
11. `sync.js` → TS Evolu integration
12. `pii.js` → TS privacy module
13. `lab-context.js` → TS context builder

### Phase 4: Feature Components (Tier 3, parallelizable)
These can be ported in parallel via subagents:
- **Agent A**: `views.js` → Svelte page components (dashboard, category, detail, compare)
- **Agent B**: `chat.js` → Svelte ChatPanel component
- **Agent C**: `context-cards.js` + `cycle.js` + `dna.js` → Svelte editor components
- **Agent D**: `supplements.js` + `recommendations.js` → Svelte supplement components
- **Agent E**: `provider-panels.js` + `settings.js` → Svelte settings components
- **Agent F**: `pdf-import.js` → Svelte import component
- **Agent G**: `emf.js` → Svelte EMF component (lazy-loaded)

### Phase 5: Integration
- Replace inline HTML onclick handlers with Svelte event bindings
- Migrate `index.html` → `+layout.svelte`
- Migrate `styles.css` → Svelte scoped styles + global theme
- Service worker update
- Test suite migration
- Final cleanup: remove `window` global exports

### Phase 6: Testing & Parity Verification
- Run existing 42 test files against Svelte version
- Visual regression testing
- Feature parity checklist per module

## Risk Areas

1. **791 window globals** — Biggest risk. Every `onclick` handler in HTML calls `window.someFunction()`. Must either keep window exports during transition or replace ALL handlers with Svelte event bindings.
2. **Mutable shared state** — `state` object is mutated everywhere. Svelte 5's reactivity requires `$state()` wrappers.
3. **innerHTML rendering** — All UI is `innerHTML = "..."`. Needs complete rewrite as Svelte components.
4. **Chat module (3,333 lines)** — Single largest module, deeply coupled to everything.
5. **Chart.js integration** — Needs Svelte lifecycle management (`onMount`/`onDestroy` for chart instances).
6. **Crypto/Sync** — Web Crypto + Evolu CRDT are browser APIs, not portable to Node.
7. **Lazy loading** — `emf.js` is already lazy-loaded. This pattern should extend to other heavy modules.

## Module Count by Tier

| Tier | Modules | Lines | Can Parallelize |
|------|---------|-------|-----------------|
| 0 | 11 | ~2,321 | Partially |
| 1 | 6 | ~4,402 | After Tier 0 |
| 2 | 5 | ~4,304 | After Tier 1 |
| 3 | 12 | ~15,927 | Yes (7 agents) |
| 4 | 3 | ~721 | Final |
| **Total** | **37** | **~27,675** | |