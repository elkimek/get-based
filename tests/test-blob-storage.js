// test-blob-storage.js — IDB-backed key/value store + the localStorage→IDB
// migration path that runs on first read of an `*-imported` key.
// Run: fetch('tests/test-blob-storage.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Blob Storage Tests ', 'background:#f59e0b;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const blob = await import('/js/blob-storage.js?bust=' + Date.now());
  const { getBlob, setBlob, deleteBlob, getBlobStorageSize, shouldUseBlob } = blob;

  // ─── 1. shouldUseBlob routing ─────────────────────────────────────────
  console.log('%c 1. shouldUseBlob ', 'font-weight:bold;color:#f59e0b');
  assert('routes labcharts-foo-imported', shouldUseBlob('labcharts-foo-imported'));
  assert('routes labcharts-default-imported', shouldUseBlob('labcharts-default-imported'));
  assert('does NOT route -chat', !shouldUseBlob('labcharts-foo-chat'));
  assert('does NOT route -threads', !shouldUseBlob('labcharts-foo-chat-threads'));
  assert('does NOT route api keys', !shouldUseBlob('labcharts-api-key'));
  assert('does NOT route undefined', !shouldUseBlob(undefined));

  // ─── 2. set / get / delete round-trip ─────────────────────────────────
  console.log('%c 2. set/get/delete round-trip ', 'font-weight:bold;color:#f59e0b');
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
  console.log('%c 3. getBlobStorageSize ', 'font-weight:bold;color:#f59e0b');
  const before = await getBlobStorageSize();
  const sizeKey = `labcharts-_sizetest_${Date.now()}-imported`;
  await setBlob(sizeKey, 'x'.repeat(50000));
  const after = await getBlobStorageSize();
  assert('size grows by stored payload', after - before >= 50000, `before=${before}, after=${after}, delta=${after - before}`);
  await deleteBlob(sizeKey);

  // ─── 4. encryptedGetItem migration from localStorage → IDB ────────────
  console.log('%c 4. localStorage→IDB migration ', 'font-weight:bold;color:#f59e0b');
  const crypto = await import('/js/crypto.js?bust=' + Date.now());
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
  console.log('%c 5. non-blob keys stay in localStorage ', 'font-weight:bold;color:#f59e0b');
  const lsKey = `labcharts-_lstest_${Date.now()}-prefs`;
  await encryptedSetItem(lsKey, 'plain-value');
  assert('non-blob value is in localStorage', localStorage.getItem(lsKey) === 'plain-value');
  assert('non-blob value NOT in IDB', (await getBlob(lsKey)) === null);
  localStorage.removeItem(lsKey);

  console.log(`%c Blob Storage: ${pass} passed, ${fail} failed `,
    `background:${fail ? '#ef4444' : '#22c55e'};color:#fff;font-weight:bold;padding:4px 12px;border-radius:3px`);
})();
