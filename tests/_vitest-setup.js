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

// Minimal `document` shim. A few modules schedule setTimeout
// callbacks at module load that reference `document` (e.g. sun.js
// re-renders `state.currentView || document.querySelector('.nav-item.active')`
// after 200ms). Without a shim the callback throws ReferenceError
// after the test has finished, which Vitest reports as an unhandled
// exception. Real DOM tests should opt into the jsdom environment.
function _stubEl() {
  const el = {
    style: {}, dataset: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    appendChild: () => {}, removeChild: () => {}, replaceChild: () => {},
    insertBefore: () => {}, remove: () => {},
    setAttribute: () => {}, getAttribute: () => null, removeAttribute: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }),
    focus: () => {}, blur: () => {}, click: () => {},
    children: [], childNodes: [],
    innerHTML: '', textContent: '', value: '',
    parentElement: null, parentNode: null,
  };
  return el;
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => _stubEl(),
    createDocumentFragment: () => _stubEl(),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: _stubEl(),
    head: _stubEl(),
    documentElement: _stubEl(),
    createTextNode: (t) => ({ textContent: t }),
    // Match _node-shim.js — some standalone-runnable tests probe
    // `document.styleSheets.length`; absent here it would be undefined
    // in Vitest workers but [] in `node tests/foo.js`. Greptile #207 P2.
    styleSheets: [],
  };
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

// IndexedDB — kept in sync with _node-shim.js. wearables-store.js +
// blob-storage.js use plain IndexedDB; `fake-indexeddb/auto` patches
// globalThis.indexedDB + IDBKeyRange + the IDB* constructors. Guarded so
// a real browser IDB isn't clobbered. Top-level await in a Vitest setup
// file is supported.
if (typeof globalThis.indexedDB === 'undefined') {
  await import('fake-indexeddb/auto');
}

// Worker shim — kept in sync with _node-shim.js. Synchronous in-process
// runner for self-contained pure-JS workers whose source is a Blob (the
// DNA parser worker in js/dna.js). No importScripts/network/WASM support
// — test-lens-local-worker.js stays on puppeteer.
if (typeof globalThis.Worker === 'undefined') {
  const _blobRegistry = new Map();
  const _origCreateObjectURL = globalThis.URL.createObjectURL;
  globalThis.URL.createObjectURL = (blob) => {
    let url;
    try { url = _origCreateObjectURL.call(globalThis.URL, blob); }
    catch { url = `blob:nodeshim/${_blobRegistry.size}`; }
    _blobRegistry.set(url, blob);
    return url;
  };
  globalThis.Worker = class NodeWorker {
    constructor(url) {
      const blob = _blobRegistry.get(url);
      this._self = {
        postMessage: (data) => {
          queueMicrotask(() => { if (this.onmessage) this.onmessage({ data }); });
        },
      };
      this._ready = (async () => {
        if (!blob) throw new Error(`NodeWorker: no Blob registered for ${url}`);
        new Function('self', await blob.text())(this._self);
      })();
    }
    postMessage(data) {
      this._ready
        // Match browser semantics — a worker that never assigns
        // self.onmessage simply drops the message rather than throwing.
        .then(() => { if (this._self.onmessage) this._self.onmessage({ data }); })
        .catch((err) => { if (this.onerror) this.onerror({ message: err.message }); });
    }
    terminate() {}
  };
}

// Per-test console.log capture for FAIL detection lives in
// _vitest-legacy.test.js — scoped to the dynamic import call rather
// than the global, so concurrent test workers don't trample each other.
