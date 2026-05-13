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
