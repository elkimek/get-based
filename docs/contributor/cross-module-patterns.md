# Cross-Module Patterns

getbased is a zero-build ES module app. Because there is no bundler, circular imports fail at runtime. These patterns are how the codebase avoids them.

---

## Window exports — for HTML onclick handlers

Inline HTML `onclick` attributes can only call functions on `window`. Each module exposes its handler functions at the bottom using `Object.assign`:

```js
// bottom of cycle.js
Object.assign(window, {
  openMenstrualCycleEditor,
  saveMenstrualCycle,
  addPeriod,
  deletePeriod,
  startCycleTour,
});
```

The HTML then just uses the function name directly:

```html
<button onclick="openMenstrualCycleEditor()">Edit Cycle</button>
```

**Rule:** Every function referenced in an `onclick` attribute anywhere in `index.html` must be in a `window` export in exactly one module. Never put the same function in two modules' window exports.

---

## Cross-module calls — `window.fn()` for circular dep avoidance

When module A needs to call a function from module B, but B also imports from A (creating a cycle), use `window.fn()` instead of a static import:

```js
// views.js needs to call refreshDashboard after a data change,
// but data.js also imports from views.js — circular!
// Solution in data.js:
window.refreshDashboard();

// And in views.js, expose it on window:
Object.assign(window, { refreshDashboard });
```

The key rule: **`window.fn()` is only for calls that would create a cycle.** For everything else, use normal ES module imports.

```js
// Normal import — fine, no cycle risk
import { showNotification } from './utils.js';
import { state } from './state.js';
import { getActiveData } from './data.js';

// window call — only when necessary
window.showDetailModal(markerKey);   // views.js from chat.js (would be circular)
window.refreshDashboard();           // views.js from data.js (would be circular)
```

---

## `registerRefreshCallback()` — decoupled refresh triggering

`data.js` exports `registerRefreshCallback(fn)` so that modules in lower layers can trigger a full dashboard re-render without importing `views.js` directly.

`main.js` wires this up at init time, after all modules have loaded:

```js
// main.js
import { registerRefreshCallback } from './data.js';
import { refreshDashboard } from './views.js';

// Register so data.js can call refreshDashboard without importing views.js
registerRefreshCallback(() => refreshDashboard());
```

Then anywhere in `data.js` or modules that `data.js` calls:

```js
// data.js — internally stored and called when needed
if (_refreshCallback) _refreshCallback();
```

This is the only mechanism for lower-layer modules to trigger a view update.

---

## HTML interpolation — always `escapeHTML()`

Any user-controlled or data-derived string inserted into `innerHTML` must be escaped. This is the project's primary XSS defense:

```js
import { escapeHTML } from './utils.js';

// Always escape — even values that "look safe"
el.innerHTML = `
  <div class="marker-name">${escapeHTML(marker.name)}</div>
  <div class="marker-value">${escapeHTML(String(value))}</div>
`;
```

Safe values (hardcoded strings, enum results, numbers from your own code) do not need escaping, but when in doubt, escape it.

**Never use `innerHTML` with concatenated user input without `escapeHTML`.** The `renderMarkdown()` function in `chat.js` validates URLs against an allowlist (`http`, `https`, `mailto`) before rendering link tags.

---

## State access — import `state` from `state.js`

`state.js` exports a single shared mutable object. Any module that needs to read or write application state imports it directly:

```js
import { state } from './state.js';

// Read
const activeProfile = state.currentProfile;
const entries = state.importedData.entries;

// Write
state.unitSystem = 'US';
state.importedData.notes.push({ date: today, text: 'New note' });
```

`state` is never copied — always pass references or re-read from it. The object is also available as `window._labState` for debugging in the browser console.

---

## The `data` parameter pattern — avoid redundant pipeline calls

`getActiveData()` is not cheap — it deep-clones the full marker schema and processes all entries. Rendering functions that might be called from multiple contexts accept an optional `data` parameter:

```js
// views.js
export function showCategory(catKey, data) {
  // Reuse passed data if available, otherwise compute once
  const d = data || getActiveData();
  filterDatesByRange(d);
  // ... render with d
}
```

Toggle functions always compute `data` once and pass it through to all sub-renderers:

```js
function toggleNoteOverlay() {
  state.noteOverlayMode = state.noteOverlayMode === 'on' ? 'off' : 'on';
  const data = getActiveData();
  showDashboard(data);
  showCategory(state.currentCategory, data); // same data object
}
```

This prevents redundant pipeline runs when multiple views refresh simultaneously.

---

## Debug mode

`isDebugMode()` in `utils.js` reads the `labcharts-debug` localStorage flag. All `console.warn` and `console.error` calls in production are gated behind this:

```js
if (isDebugMode()) console.warn('PII diff:', replacements);
```

Toggle in Settings → Display → "Verbose console logging" (moved from Privacy in v1.7.x — debug mode also reveals diagnostic UI in the sync popover + Push-efficiency / Lean-sync-mode panels in the Diagnose modal, not a privacy posture).
