// Validates storage shim install when globals use throwing accessors.
// Run: node tests/validate-storage-shim-throwing-getters.mjs [_node-shim.js|_vitest-setup.js]

import { pathToFileURL } from 'node:url';

const setupFile = process.argv[2] || 'tests/_node-shim.js';

function installThrowingGetter(name) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: true,
    get() {
      throw new Error(`throwing getter: ${name}`);
    },
  });
}

function assertStorageWorks(name) {
  const storage = globalThis[name];
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new Error(`${name} shim missing Storage API after importing ${setupFile}`);
  }
  storage.setItem('__throwing_getter_probe__', 'ok');
  if (storage.getItem('__throwing_getter_probe__') !== 'ok') {
    throw new Error(`${name} round-trip failed after importing ${setupFile}`);
  }
}

installThrowingGetter('localStorage');
installThrowingGetter('sessionStorage');

await import(pathToFileURL(setupFile).href);

assertStorageWorks('localStorage');
assertStorageWorks('sessionStorage');

console.log(`ok: ${setupFile} replaced throwing storage getters (Node ${process.version})`);
