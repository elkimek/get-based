// Shared Node-side browser-global shim for the legacy test suite.
//
// Tests originally written to run via `node tests/foo.js` need a
// minimal set of browser globals (window, localStorage, addEventListener,
// CSS.escape, document) because the imported `js/*.js` modules touch
// them at module load. Each ported test used to inline ~25 lines of
// shim boilerplate; this file consolidates them.
//
// Usage — one line at the top of each test file (before any
// `import '../js/...'` that needs the shims):
//
//   import './_node-shim.js';
//
// Side-effect import is intentional: every install is guarded by a
// `typeof === 'undefined'` check so it's idempotent and a no-op when
// the real browser globals (or the Vitest setup file) already provided
// them. Safe to re-import.
//
// The Vitest setup file (_vitest-setup.js) is a near-superset of this
// — it adds `process.exit` interception and a richer document stub —
// but the duplication is intentional so tests still run standalone
// via `node tests/foo.js`. Keep the two in sync if you extend either.

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

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
      // Surface listener errors via console.error so the test runner
      // picks them up; don't re-throw (browser dispatchEvent doesn't).
      try { fn(ev); } catch (e) { console.error('listener error:', e); }
    }
    return true;
  };
}

if (typeof globalThis.CSS === 'undefined') {
  globalThis.CSS = { escape: (s) => String(s).replace(/[^\w-]/g, (c) => '\\' + c) };
}

if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = {};
}

function _stubEl() {
  return {
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
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    addEventListener: () => {}, removeEventListener: () => {},
    createElement: () => _stubEl(),
    createDocumentFragment: () => _stubEl(),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: _stubEl(),
    head: _stubEl(),
    documentElement: _stubEl(),
    createTextNode: (t) => ({ textContent: t }),
    styleSheets: [],
  };
}

// IndexedDB — wearables-store.js + blob-storage.js use plain IndexedDB
// (per CLAUDE.md). `fake-indexeddb/auto` is a faithful pure-JS impl that
// patches globalThis.indexedDB + IDBKeyRange + the IDB* constructors.
// Side-effect import, guarded so a real browser IDB (or the Vitest setup
// file) isn't clobbered. Top-level await is fine here — every test file
// already `import './_node-shim.js'` ahead of its own top-level awaits.
if (typeof globalThis.indexedDB === 'undefined') {
  await import('fake-indexeddb/auto');
}
