// Vitest setup — runs before every test file.
//
// Two shims so that the existing node-side test files (which were
// written to be runnable directly via `node tests/foo.js`) work
// inside Vitest's worker without modification:
//
//   1. globalThis.window — js/utils.js and js/state.js do
//      Object.assign(window, ...) at module load. In Node `window`
//      is undefined; this makes top-level browser globals into
//      no-ops so imports succeed.
//
//   2. process.exit — legacy files end with
//      `process.exit(fail > 0 ? 1 : 0)`. Vitest tolerates neither
//      success-exit (kills the worker mid-suite) nor failure-exit
//      (silent). Re-raise non-zero as a thrown error so Vitest
//      surfaces it as a test failure; swallow zero so the suite
//      proceeds to the next file.

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

// Minimal in-memory localStorage / sessionStorage polyfill. Some
// modules (views.js, lens.js) read storage at module load to restore
// per-profile config; the real implementation is browser-only. A
// Map-backed shim is enough for tests that exercise read/write API
// surfaces without caring about cross-tab persistence.
function _makeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null,
  };
}
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = _makeStorage();
}
if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = _makeStorage();
}

// CSS.escape is a browser global used by js/ai-verdict-engine.js when
// building scroll anchors. Tiny polyfill covers the chars used in
// our `[data-id="..."]` selectors.
if (typeof globalThis.CSS === 'undefined') {
  globalThis.CSS = { escape: (s) => String(s).replace(/[^\w-]/g, (c) => '\\' + c) };
}

// `navigator` is a global in Node 21+ but absent in Node 18/20. CI
// runs an older Node so js/hardware.js (which reads
// navigator.deviceMemory and navigator.hardwareConcurrency) throws a
// ReferenceError. detectHardware already tolerates undefined fields;
// it just needs the object to exist.
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = {};
}

// Window event-bus stubs — broadcasts via window.dispatchEvent /
// addEventListener show up across many modules (e.g. the AI verdict
// engine fires `labcharts-ai-verdict-updated`). No-op stubs are
// enough so the call sites don't throw; tests that depend on the
// fired event capture it through their own indirection.
if (typeof globalThis.addEventListener !== 'function') {
  const _listeners = new Map();
  globalThis.addEventListener = (type, fn) => {
    if (!_listeners.has(type)) _listeners.set(type, new Set());
    _listeners.get(type).add(fn);
  };
  globalThis.removeEventListener = (type, fn) => {
    _listeners.get(type)?.delete(fn);
  };
  globalThis.dispatchEvent = (ev) => {
    const fns = _listeners.get(ev?.type);
    if (fns) for (const fn of fns) {
      // Surface listener errors via console.error so Vitest's
      // per-test output picks them up — silently swallowing was a
      // landmine flagged in pre-PR review. Don't re-throw (would
      // break dispatcher contract — browser dispatchEvent doesn't),
      // but make the error loud.
      try { fn(ev); } catch (e) { console.error('listener error:', e); }
    }
    return true;
  };
}

if (!process.exit._vitestPatched) {
  const _origExit = process.exit.bind(process);
  process.exit = (code) => {
    if (code && code !== 0) {
      throw new Error(`Test file called process.exit(${code}) — at least one assertion failed`);
    }
    // code === 0 → no-op (don't kill the Vitest worker mid-suite)
  };
  process.exit._vitestPatched = true;
  // Stash the original on the patched function in case some specific
  // test wants to bypass the shim (none do today, but defensive).
  process.exit._original = _origExit;
}

// Per-test console.log capture for FAIL detection lives in
// _vitest-legacy.test.js — scoped to the dynamic import call rather
// than the global, so concurrent test workers don't trample each other.
