#!/usr/bin/env node
// test-blob-storage.js — IDB-backed key/value store + the localStorage→IDB
// migration path that runs on first read of an `*-imported` key.
//
// Run: node tests/test-blob-storage.js  (or via npm test)
//
// Full port — no DOM, no network. IndexedDB runs via fake-indexeddb (wired
// into the shim in batch 31).

import './_node-shim.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Blob Storage Tests ===\n');

const blob = await import('../js/blob-storage.js');
const { getBlob, setBlob, deleteBlob, getBlobStorageSize, shouldUseBlob } = blob;

// ─── 1. shouldUseBlob routing ─────────────────────────────────────────
console.log('1. shouldUseBlob');
assert('routes labcharts-foo-imported', shouldUseBlob('labcharts-foo-imported'));
assert('routes labcharts-default-imported', shouldUseBlob('labcharts-default-imported'));
assert('does NOT route -chat', !shouldUseBlob('labcharts-foo-chat'));
assert('does NOT route -threads', !shouldUseBlob('labcharts-foo-chat-threads'));
assert('does NOT route api keys', !shouldUseBlob('labcharts-api-key'));
assert('does NOT route undefined', !shouldUseBlob(undefined));

// ─── 2. set / get / delete round-trip ─────────────────────────────────
console.log('2. set/get/delete round-trip');
const testKey = `labcharts-_test_${Date.now()}-imported`;
const testValue = JSON.stringify({ entries: [{ id: 1, v: 'x'.repeat(1000) }] });

await setBlob(testKey, testValue);
const got = await getBlob(testKey);
assert('getBlob returns the stored value', got === testValue);

// Round-trip a 2 MB string — way past the localStorage 5 MB cap when
// accumulated across keys, well within IDB.
const bigValue = 'a'.repeat(2 * 1024 * 1024);
const bigKey = `labcharts-_bigtest_${Date.now()}-imported`;
await setBlob(bigKey, bigValue);
const bigGot = await getBlob(bigKey);
assert('round-trips 2 MB string', bigGot === bigValue, `expected ${bigValue.length} bytes, got ${bigGot?.length ?? 0}`);

await deleteBlob(testKey);
await deleteBlob(bigKey);
assert('deleteBlob removes the value', (await getBlob(testKey)) === null);

// ─── 3. getBlobStorageSize ────────────────────────────────────────────
console.log('3. getBlobStorageSize');
const before = await getBlobStorageSize();
const sizeKey = `labcharts-_sizetest_${Date.now()}-imported`;
await setBlob(sizeKey, 'x'.repeat(50000));
const after = await getBlobStorageSize();
assert('size grows by stored payload', after - before >= 50000, `before=${before}, after=${after}, delta=${after - before}`);
await deleteBlob(sizeKey);

// ─── 4. encryptedGetItem migration from localStorage → IDB ────────────
console.log('4. localStorage→IDB migration');
const crypto = await import('../js/crypto.js');
const { encryptedGetItem, encryptedSetItem, encryptedRemoveItem } = crypto;
const migKey = `labcharts-_migtest_${Date.now()}-imported`;
const migValue = JSON.stringify({ entries: [{ id: 'mig-1' }] });

// Seed localStorage as if from a pre-IDB install
localStorage.setItem(migKey, migValue);
// First read should detect the localStorage value, copy to IDB, clear localStorage
const got1 = await encryptedGetItem(migKey);
assert('first read returns the seeded value', got1 === migValue);
assert('localStorage value cleared after migration', localStorage.getItem(migKey) === null);
const idbAfter = await getBlob(migKey);
assert('IDB has the migrated value', idbAfter === migValue);

// Subsequent reads come from IDB only
const got2 = await encryptedGetItem(migKey);
assert('second read still returns same value (from IDB)', got2 === migValue);

// encryptedSetItem of an `-imported` key should land in IDB, not localStorage
const newValue = JSON.stringify({ entries: [{ id: 'new' }] });
await encryptedSetItem(migKey, newValue);
assert('after encryptedSetItem, IDB has the new value', (await getBlob(migKey)) === newValue);
assert('after encryptedSetItem, localStorage stays empty', localStorage.getItem(migKey) === null);

// encryptedRemoveItem wipes both backends
localStorage.setItem(migKey, 'leftover'); // simulate a stale localStorage residue
await encryptedRemoveItem(migKey);
assert('encryptedRemoveItem clears IDB', (await getBlob(migKey)) === null);
assert('encryptedRemoveItem clears localStorage', localStorage.getItem(migKey) === null);

// ─── 5. non-blob keys still go through localStorage unchanged ─────────
console.log('5. non-blob keys stay in localStorage');
const lsKey = `labcharts-_lstest_${Date.now()}-prefs`;
await encryptedSetItem(lsKey, 'plain-value');
assert('non-blob value is in localStorage', localStorage.getItem(lsKey) === 'plain-value');
assert('non-blob value NOT in IDB', (await getBlob(lsKey)) === null);
localStorage.removeItem(lsKey);

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
