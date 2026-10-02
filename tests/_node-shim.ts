/// <reference path="../node_modules/fake-indexeddb/auto.d.ts" />
// The installed package ships this declaration but omits it from its auto export.
import { ensureBrowserStorage } from './helpers/browser-storage.js';
import { installNodeWindow, installNodeEventBus, installNodeCSS, installNodeNavigator, installNodeDocument, installNodeWorker } from './helpers/node-browser-fixtures.js';

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
// Vitest adds process.exit interception. Both entry points use the same
// fixture installers and browser-storage.ts availability rules.

installNodeWindow();

ensureBrowserStorage('localStorage');
ensureBrowserStorage('sessionStorage');

installNodeEventBus();

installNodeCSS();

installNodeNavigator();

installNodeDocument();

// IndexedDB — wearables-store.js + blob-storage.js use plain IndexedDB.
// `fake-indexeddb/auto` is a faithful pure-JS impl that
// patches globalThis.indexedDB + IDBKeyRange + the IDB* constructors.
// Side-effect import, guarded so a real browser IDB (or the Vitest setup
// file) isn't clobbered. Top-level await is fine here — every test file
// already `import './_node-shim.js'` ahead of its own top-level awaits.
if (typeof globalThis.indexedDB === 'undefined') {
  await import('fake-indexeddb/auto');
}

// Synchronous Worker shim — for self-contained pure-JS workers whose
// source is passed as a Blob (e.g. the DNA parser worker in js/dna.js,
// created via `new Worker(URL.createObjectURL(blob))`). Runs the worker
// source in-process: `worker.postMessage` invokes the worker's
// `self.onmessage` handler and routes its `self.postMessage` back to the
// main-side `worker.onmessage`. Does NOT support importScripts, network,
// or WASM workers — test-lens-local-worker.js stays on Playwright.
installNodeWorker();
