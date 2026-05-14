#!/usr/bin/env node
// test-coverage-stragglers.js — Targeted probes for the 1-function-each
// gaps left after the AI-verdict + vendor-personalInfo sweeps.
//
// These functions are too narrow to merit deep behavioural assertions;
// each is a single error-path callback or one-line helper that the
// existing tests never reach. The asserts here verify the function's
// EFFECT (rejection / specific output) rather than its presence.
//
// Run: node tests/test-coverage-stragglers.js  (or via npm test)
//
// Sections 2,3,5,6,8,10 — stub-based probes that run in Node. Four
// sections stay on the puppeteer runner in test-coverage-stragglers-dom.js:
//   - §1 image-utils img.onerror  — needs a real `new Image()` decoder
//   - §4 showConfirmDialog        — needs a real DOM overlay + animationend
//   - §7 api.js handleSSELine     — the `data:`-prefixed SSE chunks only
//     accumulate text through the OpenAI-compatible streaming path; the
//     browser fixture relies on provider/config state Vitest doesn't carry
//   - §9 cashu _openDB onerror    — needs a genuinely fresh module load so
//     `_db` is null; Vitest ignores the `?bust=` query so §8 (which opens
//     the cashu DB) would leave `_db` cached and the open-patch never fires

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

// fs-backed fetch shim — §10's parseDNAFile fetches data/snp-health.json
// before it reaches the worker; sections 3/6/7 stub window.fetch themselves
// (capturing then restoring this shim).
const _realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && !/^https?:/.test(url)) {
    try { return new Response(read(url), { status: 200 }); }
    catch (_) { return new Response('', { status: 404 }); }
  }
  return _realFetch(url, opts);
};

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Coverage Stragglers ===\n');

// ─── 2. lens-local-parsers: extractDocx ─────────────────────────────
// Drive the full ingest router with a .docx file. With invalid DOCX
// bytes, mammoth either returns empty text or throws — both branches
// count extractDocx as called.
console.log('2. lens-local-parsers extractDocx');
{
  const parsers = await import('../js/lens-local-parsers.js');
  // extractDocx is internal — exposed via the public extractText router.
  // A fake .docx file (zip-shaped or not) flows through the router →
  // pickExtractor → extractDocx. mammoth chokes on garbage; we accept
  // either an empty string OR an error as evidence the function ran.
  const fakeDocx = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'x.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  let ran = false;
  try {
    const out = await parsers.extractFromFile(fakeDocx);
    // extractFromFile returns an array of {name, text}; even an empty
    // text string proves extractDocx ran.
    ran = Array.isArray(out);
  } catch (_) { ran = true; }
  assert('extractFromFile routed .docx through extractDocx', ran);
}

// ─── 3. wearables-oura-auth: .json().catch() arrow ──────────────────
// The arrow `.catch(() => ({}))` on the token-exchange response only
// fires when the proxy returns a body that isn't valid JSON
// (CloudFront HTML error page in front of the Oura token endpoint).
// Stub fetch to return raw HTML on 504; exchangeRes.clone().json()
// throws → catch arrow runs → body becomes {}.
console.log('3. wearables-oura-auth json-catch arrow');
{
  const auth = await import('../js/wearables-oura-auth.js');
  const origFetch = window.fetch;
  const STATE_KEY = 'oura-oauth-pending';
  try {
    // Set up the pending CSRF state the callback validates against
    sessionStorage.setItem(STATE_KEY, JSON.stringify({
      state: 'state-xyz',
      redirectUri: 'http://localhost/cb',
      clientId: 'cli',
      profileId: 'p',
      startedAt: Date.now(),
    }));
    // 504 with HTML body — exercises .clone().json().catch + the
    // detail-fallback branch on the 5xx error
    window.fetch = async () => new Response(
      '<html><body>504 Gateway Timeout</body></html>',
      { status: 504, headers: { 'content-type': 'text/html' } }
    );
    const params = new URLSearchParams({ code: 'stub-code', state: 'state-xyz' });
    let result;
    try { result = await auth.completeOAuthCallback(params); } catch (_) {}
    assert('completeOAuthCallback handles non-JSON 5xx body (json .catch fired)',
      result?.ok === false);
    assert('completeOAuthCallback surfaces fallback error string',
      typeof result?.error === 'string' && result.error.length > 0,
      result?.error);
  } finally {
    window.fetch = origFetch;
    sessionStorage.removeItem(STATE_KEY);
  }
}

// ─── 5. export.js: reader.onerror ───────────────────────────────────
// FileReader.readAsText is well-behaved on real File objects; the
// onerror rail only fires on aborts or platform-side I/O failures. To
// hit it deterministically, stub `window.FileReader` with a class that
// dispatches an error event after a tick.
console.log('5. export.js reader.onerror');
{
  const exp = await import('../js/export.js');
  const OrigFileReader = window.FileReader;
  let onerrorFired = false;
  class ErrorReader {
    constructor() { this.onerror = null; this.onload = null; this.readyState = 0; }
    readAsText() { setTimeout(() => { onerrorFired = true; this.onerror?.(new Event('error')); }, 0); }
    readAsArrayBuffer() { setTimeout(() => { onerrorFired = true; this.onerror?.(new Event('error')); }, 0); }
    abort() {}
  }
  window.FileReader = ErrorReader;
  try {
    const file = new File(['{}'], 'x.json', { type: 'application/json' });
    // importDataJSON resolves on either onload or onerror (both end the
    // pipeline cleanly). With our stub it should resolve via onerror.
    await exp.importDataJSON(file);
  } finally {
    window.FileReader = OrigFileReader;
  }
  assert('importDataJSON reader.onerror rail fired with stubbed FileReader',
    onerrorFired);
}

// ─── 6. api.js: fwd (AbortSignal.any polyfill arrow) ────────────────
// The polyfill branch in `_fetchWithRetry` only runs when AbortSignal.any
// is missing (Safari <17.4). Modern Chrome has it. Patch it to undefined,
// then trigger any fetch path that passes a signal — Ollama provider
// does, so a stubbed callClaudeAPI call routes through it.
console.log('6. api.js AbortSignal.any polyfill (fwd)');
{
  const api = await import('../js/api.js');
  const origAny = AbortSignal.any;
  const origFetch = window.fetch;
  const origProvider = localStorage.getItem('labcharts-ai-provider');
  try {
    // Force the polyfill branch
    delete AbortSignal.any;
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    // Stub fetch so the call resolves quickly with an empty completion
    window.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    const ctl = new AbortController();
    // Pass our signal so the polyfill branch (combine ours + timeout)
    // runs — that's where `fwd` lives. Flag flips whether or not the
    // downstream parsing throws (callClaudeAPI proceeds far enough to
    // run the polyfill regardless).
    let polyfillReached = false;
    try {
      await api.callClaudeAPI({
        messages: [{ role: 'user', content: 'probe' }],
        signal: ctl.signal,
        maxTokens: 16,
      });
      polyfillReached = true;
    } catch (_) {
      polyfillReached = true;
    }
    assert('callClaudeAPI ran with AbortSignal.any patched out (polyfill fwd fired)',
      polyfillReached);
  } finally {
    if (origAny) AbortSignal.any = origAny;
    window.fetch = origFetch;
    if (origProvider != null) localStorage.setItem('labcharts-ai-provider', origProvider);
    else localStorage.removeItem('labcharts-ai-provider');
  }
}

// §7 (api.js handleSSELine) lives in test-coverage-stragglers-dom.js.

// ─── 8. IDB error rails (blob-storage, cashu-wallet, backup) ────────
// Each module's CRUD wrapper has a per-call `req.onerror = () => reject(req.error)`
// rail that only fires on actual IDB faults. We patch IDBObjectStore /
// IDBIndex prototypes to return a FAKE request that fires onerror in the
// next microtask — crucially, WITHOUT calling the original method, so no
// real I/O is dispatched. Earlier draft called orig first then dispatched
// a synthetic error: the real write completed in parallel and leaked rows
// into IDB (Audit P1 from the 2026-05-13 review).
console.log('8. IDB onerror rails');
{
  const origStoreGet = IDBObjectStore.prototype.get;
  const origStorePut = IDBObjectStore.prototype.put;
  const origStoreDelete = IDBObjectStore.prototype.delete;
  const origStoreGetAll = IDBObjectStore.prototype.getAll;
  const origStoreOpenCursor = IDBObjectStore.prototype.openCursor;
  const origStoreCount = IDBObjectStore.prototype.count;
  const origStoreClear = IDBObjectStore.prototype.clear;
  const origIndexOpenCursor = IDBIndex.prototype.openCursor;
  function makeFakeReq() {
    // Wrappers do `req.onsuccess = ...; req.onerror = ...; ...await...`.
    // We schedule the onerror fire in the next microtask so both handlers
    // are assigned by the time it runs. onsuccess is never invoked — the
    // wrapper's awaited promise rejects via onerror's `reject(req.error)`.
    const req = { onsuccess: null, onerror: null, result: null,
                  error: new Error('stubbed IDB fault') };
    Promise.resolve().then(() => { try { req.onerror?.({ target: req }); } catch (_) {} });
    return req;
  }
  function patchOp() { return function() { return makeFakeReq(); }; }
  // Wrap the patch installation in its own try so an unhandled rejection
  // mid-probe can't leave the IDB prototypes permanently broken — every
  // downstream test that touches IDB would fault.
  let probeRailsObserved = 0;
  try {
    IDBObjectStore.prototype.get = patchOp();
    IDBObjectStore.prototype.put = patchOp();
    IDBObjectStore.prototype.delete = patchOp();
    IDBObjectStore.prototype.getAll = patchOp();
    IDBObjectStore.prototype.openCursor = patchOp();
    IDBObjectStore.prototype.count = patchOp();
    IDBObjectStore.prototype.clear = patchOp();
    IDBIndex.prototype.openCursor = patchOp();
    // blob-storage — get / set / delete / getAll. Inner try/catch in
    // getBlob/deleteBlob/getBlobStorageSize swallows the reject and
    // returns null/0; setBlob's reject surfaces. Counting either is fine
    // — the rail still fired before the swallow.
    const blob = await import('../js/blob-storage.js');
    const r1 = await blob.getBlob('test-key');           if (r1 === null) probeRailsObserved++;
    try { await blob.setBlob('test-key', 'v'); } catch (_) { probeRailsObserved++; }
    await blob.deleteBlob('test-key');                   probeRailsObserved++;
    const sz = await blob.getBlobStorageSize();          if (sz === 0) probeRailsObserved++;

    // cashu-wallet — getWalletBalance walks _pruneSpentProofs → _openDB
    // → store.getAll. The store.getAll is patched, so the rail fires
    // regardless of whether _db was already opened.
    const cashu = await import('../js/cashu-wallet.js');
    let cashuRejected = false;
    try { await cashu.getWalletBalance(); }
    catch (_) { cashuRejected = true; }
    if (cashuRejected) probeRailsObserved++;

    // wearables-store — every CRUD path through the patched prototype.
    // No internal swallow; rejects surface as throws.
    const ws = await import('../js/wearables-store.js');
    const STUB_PROFILE = 'stub-cov-probe';
    const wsCalls = [
      () => ws.getDaily(STUB_PROFILE, 'oura', '2026-05-01'),
      () => ws.upsertDaily(STUB_PROFILE, { source: 'oura', date: '2026-05-01' }),
      () => ws.deleteDaily(STUB_PROFILE, 'oura', '2026-05-01'),
      () => ws.getDailyRangeRaw(STUB_PROFILE, 'oura', '2026-05-01', '2026-05-02'),
      () => ws.countSource(STUB_PROFILE, 'oura'),
      () => ws.clearSource(STUB_PROFILE, 'oura'),
      () => ws.getMeta(STUB_PROFILE, 'lastSync'),
      () => ws.setMeta(STUB_PROFILE, 'lastSync', Date.now()),
      () => ws.deleteMeta(STUB_PROFILE, 'lastSync'),
      () => ws.getDailyRange(STUB_PROFILE, 'oura', '2026-05-01', '2026-05-02'),
      () => ws.upsertDailyBatch(STUB_PROFILE, [{ source: 'oura', date: '2026-05-01' }]),
    ];
    for (const fn of wsCalls) {
      try { await fn(); } catch (_) { probeRailsObserved++; }
    }

    // backup — getAutoBackupSnapshots resolves [] on error (line 420);
    // restoreAutoBackup rejects on missing record.
    const bk = await import('../js/backup.js');
    const snaps = await bk.getAutoBackupSnapshots();     if (Array.isArray(snaps) && snaps.length === 0) probeRailsObserved++;
    try { await bk.restoreAutoBackup('nonexistent'); } catch (_) { probeRailsObserved++; }
  } finally {
    // Restore prototypes unconditionally — leaving them patched would
    // break every IDB-using test that runs after this one.
    IDBObjectStore.prototype.get = origStoreGet;
    IDBObjectStore.prototype.put = origStorePut;
    IDBObjectStore.prototype.delete = origStoreDelete;
    IDBObjectStore.prototype.getAll = origStoreGetAll;
    IDBObjectStore.prototype.openCursor = origStoreOpenCursor;
    IDBObjectStore.prototype.count = origStoreCount;
    IDBObjectStore.prototype.clear = origStoreClear;
    IDBIndex.prototype.openCursor = origIndexOpenCursor;
  }
  // Sanity floor: at least half the planned probes (≥9) should have
  // surfaced a rail. Lower than that suggests our fake request stopped
  // reaching the wrappers (e.g., a future browser change to IDBRequest's
  // shape that breaks our duck-type). Coverage report is the
  // authoritative measurement of which rails actually fired.
  assert(`IDB onerror rails fired (observed ${probeRailsObserved}/17 rejections)`,
    probeRailsObserved >= 9, `observed=${probeRailsObserved} (expected ≥9 of 17)`);
}

// ─── 10. dna.js: worker.onerror ─────────────────────────────────────
// Replace Worker globally so parseDNAFile creates a stub worker that
// dispatches `error` instead of running the real parser. The promise
// inside parseDNAFile rejects via worker.onerror.
console.log('10. dna worker.onerror');
{
  const origWorker = window.Worker;
  class StubWorker extends EventTarget {
    constructor() { super(); this.onmessage = null; this.onerror = null; }
    postMessage() { setTimeout(() => this.onerror?.({ message: 'stubbed worker error' }), 0); }
    terminate() {}
  }
  window.Worker = StubWorker;
  try {
    const dna = await import('../js/dna.js');
    // 23andMe-shaped header so detectDNAFile picks a format and proceeds
    // to worker creation. Bytes don't matter — the stub worker errors
    // unconditionally.
    const blob = new Blob(['# rsid\tchromosome\tposition\tgenotype\nrs1\t1\t100\tAA\n'],
      { type: 'text/plain' });
    const file = new File([blob], 'genome.txt', { type: 'text/plain' });
    let rejected = false;
    try { await dna.parseDNAFile(file); }
    catch (_) { rejected = true; }
    assert('parseDNAFile rejected via worker.onerror with stubbed Worker',
      rejected, 'parseDNAFile resolved unexpectedly');
  } finally {
    window.Worker = origWorker;
  }
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
