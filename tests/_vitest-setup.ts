/// <reference path="../node_modules/fake-indexeddb/auto.d.ts" />
// The installed package ships this declaration but omits it from its auto export.
import { ensureBrowserStorage } from './helpers/browser-storage.js';
import { installNodeWindow, installNodeEventBus, installNodeCSS, installNodeNavigator, installNodeDocument, installNodeWorker } from './helpers/node-browser-fixtures.js';

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

type PatchedTestExit = ((code?: number | string | null) => void) & {
  _vitestPatched?: boolean;
  _original?: typeof process.exit;
};

installNodeWindow();
ensureBrowserStorage('localStorage');
ensureBrowserStorage('sessionStorage');
installNodeCSS();
installNodeNavigator();
installNodeDocument();
installNodeEventBus();

if (!(process.exit as PatchedTestExit)._vitestPatched) {
  const _origExit = process.exit.bind(process);
  (process as unknown as { exit: PatchedTestExit }).exit = (code) => {
    if (code && code !== 0) {
      throw new Error(`Test file called process.exit(${code}) — at least one assertion failed`);
    }
    // code === 0 → no-op (don't kill the Vitest worker mid-suite)
  };
  (process.exit as PatchedTestExit)._vitestPatched = true;
  // Stash the original on the patched function in case some specific
  // test wants to bypass the shim (none do today, but defensive).
  (process.exit as PatchedTestExit)._original = _origExit;
}

if (typeof globalThis.indexedDB === 'undefined') {
  await import('fake-indexeddb/auto');
}

installNodeWorker();

// Per-test console.log capture for FAIL detection lives in
// _vitest-legacy.test.js — scoped to the dynamic import call rather
// than the global, so concurrent test workers don't trample each other.
