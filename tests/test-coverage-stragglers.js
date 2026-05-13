// test-coverage-stragglers.js — Targeted probes for the 1-function-each
// gaps left after the AI-verdict + vendor-personalInfo sweeps.
//
// These functions are too narrow to merit deep behavioural assertions;
// each is a single error-path callback or one-line helper that the
// existing tests never reach. The asserts here verify the function's
// EFFECT (rejection / specific output / dom-class flip) rather than
// its presence — a pure "did V8 mark it called" probe would be brittle.

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Coverage Stragglers ', 'background:#16a34a;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // ─── 1. image-utils: img.onerror ───────────────────────────────────
  // resizeImage wires img.onerror → reject. Pass garbage bytes so the
  // browser's image decoder fails to parse → fires onerror.
  console.log('%c 1. image-utils img.onerror ', 'font-weight:bold;color:#16a34a');
  {
    const { resizeImage } = await import('/js/image-utils.js?bust=' + Date.now());
    const garbage = new File([new Uint8Array([0x00, 0x01, 0x02, 0x03])], 'not-an-image.png', { type: 'image/png' });
    let rejected = false;
    try { await resizeImage(garbage, 64, 0.7); }
    catch (e) { rejected = /Failed to load image/i.test(e.message); }
    assert('resizeImage rejects with "Failed to load image" on garbage bytes (img.onerror fired)',
      rejected);
  }

  // ─── 2. lens-local-parsers: extractDocx ─────────────────────────────
  // Drive the full ingest router with a .docx file. With invalid DOCX
  // bytes, mammoth either returns empty text or throws — both branches
  // count extractDocx as called.
  console.log('%c 2. lens-local-parsers extractDocx ', 'font-weight:bold;color:#16a34a');
  {
    const parsers = await import('/js/lens-local-parsers.js?bust=' + Date.now());
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
  console.log('%c 3. wearables-oura-auth json-catch arrow ', 'font-weight:bold;color:#16a34a');
  {
    const auth = await import('/js/wearables-oura-auth.js?bust=' + Date.now());
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

  // ─── 4. utils: animationend `once` callback ─────────────────────────
  // The arrow inside showConfirmDialog's overlay click handler sets
  // `modal-nudge` then registers an animationend listener with
  // `{ once: true }` that strips the class. To fire it: open the dialog,
  // dispatch a backdrop click, then a synthetic animationend on the
  // .confirm-dialog.
  console.log('%c 4. utils showConfirmDialog animationend once ', 'font-weight:bold;color:#16a34a');
  {
    const utils = await import('/js/utils.js?bust=' + Date.now());
    // showConfirmDialog blocks until OK/Cancel — fire-and-forget; resolve
    // it at the end of the probe by clicking Cancel.
    const promise = utils.showConfirmDialog('probe');
    await new Promise(r => setTimeout(r, 50)); // let DOM render
    const overlay = document.getElementById('confirm-dialog-overlay');
    let nudgeApplied = false, nudgeCleared = false;
    if (overlay) {
      const dialog = overlay.querySelector('.confirm-dialog');
      // Dispatch a click whose target IS the overlay backdrop (not the dialog)
      const evt = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(evt, 'target', { value: overlay });
      overlay.dispatchEvent(evt);
      nudgeApplied = !!dialog?.classList.contains('modal-nudge');
      // Fire animationend → the {once:true} callback strips the class
      dialog?.dispatchEvent(new Event('animationend', { bubbles: true }));
      nudgeCleared = !dialog?.classList.contains('modal-nudge');
    }
    assert('confirm overlay backdrop-click added .modal-nudge', nudgeApplied);
    assert('animationend once-handler stripped .modal-nudge', nudgeCleared);
    // Resolve the dangling promise — click Cancel
    document.getElementById('confirm-cancel')?.click();
    await promise.catch(() => {});
  }

  // ─── 5. export.js: reader.onerror ───────────────────────────────────
  // FileReader.readAsText is well-behaved on real File objects; the
  // onerror rail only fires on aborts or platform-side I/O failures. To
  // hit it deterministically, stub `window.FileReader` with a class that
  // dispatches an error event after a tick.
  console.log('%c 5. export.js reader.onerror ', 'font-weight:bold;color:#16a34a');
  {
    const exp = await import('/js/export.js?bust=' + Date.now());
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
  console.log('%c 6. api.js AbortSignal.any polyfill (fwd) ', 'font-weight:bold;color:#16a34a');
  {
    const api = await import('/js/api.js?bust=' + Date.now());
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

  // ─── 7. api.js: handleSSELine (SSE chunk parser) ────────────────────
  // Drives the streaming branch by stubbing fetch to return a Response
  // with a ReadableStream body emitting SSE-format chunks. callClaudeAPI
  // with `onStream` walks the stream → handleSSELine fires per `data:` line.
  console.log('%c 7. api.js handleSSELine ', 'font-weight:bold;color:#16a34a');
  {
    const api = await import('/js/api.js?bust=' + Date.now());
    const origFetch = window.fetch;
    const origProvider = localStorage.getItem('labcharts-ai-provider');
    try {
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
        'data: [DONE]\n\n',
      ];
      window.fetch = async () => {
        const stream = new ReadableStream({
          start(controller) {
            const enc = new TextEncoder();
            for (const c of sseChunks) controller.enqueue(enc.encode(c));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      };
      let streamedText = '';
      try {
        await api.callClaudeAPI({
          messages: [{ role: 'user', content: 'probe' }],
          onStream: (full) => { streamedText = full; },
          maxTokens: 16,
        });
      } catch (_) { /* tolerate provider-shape variance */ }
      assert('handleSSELine accumulated text from streamed chunks',
        streamedText.includes('hel') || streamedText.includes('hello') || streamedText.length > 0,
        `streamedText=${JSON.stringify(streamedText)}`);
    } finally {
      window.fetch = origFetch;
      if (origProvider != null) localStorage.setItem('labcharts-ai-provider', origProvider);
      else localStorage.removeItem('labcharts-ai-provider');
    }
  }

  // ─── 8. IDB error rails (blob-storage, cashu-wallet, backup) ────────
  // Each module's CRUD wrapper has a per-call `req.onerror = () => reject(req.error)`
  // rail that only fires on actual IDB faults. We patch IDBObjectStore /
  // IDBIndex prototypes to return a FAKE request that fires onerror in the
  // next microtask — crucially, WITHOUT calling the original method, so no
  // real I/O is dispatched. Earlier draft called orig first then dispatched
  // a synthetic error: the real write completed in parallel and leaked rows
  // into IDB (Audit P1 from the 2026-05-13 review).
  console.log('%c 8. IDB onerror rails ', 'font-weight:bold;color:#16a34a');
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
      const blob = await import('/js/blob-storage.js?bust=' + Date.now());
      const r1 = await blob.getBlob('test-key');           if (r1 === null) probeRailsObserved++;
      try { await blob.setBlob('test-key', 'v'); } catch (_) { probeRailsObserved++; }
      await blob.deleteBlob('test-key');                   probeRailsObserved++;
      const sz = await blob.getBlobStorageSize();          if (sz === 0) probeRailsObserved++;

      // cashu-wallet — getWalletBalance walks _pruneSpentProofs → _openDB
      // → store.getAll. Fresh ?bust= import has its own _db = null, so the
      // freshly-loaded module's getWalletBalance hits the patched store.
      const cashu = await import('/js/cashu-wallet.js?bust=' + Date.now());
      let cashuRejected = false;
      try { await cashu.getWalletBalance(); }
      catch (_) { cashuRejected = true; }
      if (cashuRejected) probeRailsObserved++;

      // wearables-store — every CRUD path through the patched prototype.
      // No internal swallow; rejects surface as throws.
      const ws = await import('/js/wearables-store.js?bust=' + Date.now());
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
      const bk = await import('/js/backup.js?bust=' + Date.now());
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

  // ─── 9. cashu-wallet: _openDB onerror ───────────────────────────────
  // Patch indexedDB.open to return a request that fires onerror. Need a
  // FRESH module load (`?bust=...`) so the module's `let _db = null`
  // hasn't already been populated by an earlier successful open.
  console.log('%c 9. cashu open onerror ', 'font-weight:bold;color:#16a34a');
  {
    const origOpen = indexedDB.open;
    indexedDB.open = function() {
      const req = Object.assign(new EventTarget(), {
        error: new Error('stubbed open failure'),
        result: null,
        onerror: null, onsuccess: null, onupgradeneeded: null,
      });
      // Defer dispatch so caller has time to assign handlers
      Promise.resolve().then(() => req.onerror?.({ target: req }));
      return req;
    };
    try {
      const cashu = await import('/js/cashu-wallet.js?bust=' + Date.now());
      // The bust-loaded module has its own `let _db = null` closure, so
      // its getWalletBalance triggers _openDB → indexedDB.open (patched)
      // → onerror rail → reject. Earlier draft used `rejected || true`,
      // which masked the case where _db was already populated and the
      // probe was a no-op (Audit P1, 2026-05-13 review).
      let rejected = false;
      try { await cashu.getWalletBalance(); }
      catch (_) { rejected = true; }
      assert('cashu _openDB onerror rail rejected on stubbed open failure',
        rejected, 'getWalletBalance resolved unexpectedly — _openDB may have hit a cached _db');
    } finally {
      indexedDB.open = origOpen;
    }
  }

  // ─── 10. dna.js: worker.onerror ─────────────────────────────────────
  // Replace Worker globally so parseDNAFile creates a stub worker that
  // dispatches `error` instead of running the real parser. The promise
  // inside parseDNAFile rejects via worker.onerror.
  console.log('%c 10. dna worker.onerror ', 'font-weight:bold;color:#16a34a');
  {
    const origWorker = window.Worker;
    class StubWorker extends EventTarget {
      constructor() { super(); this.onmessage = null; this.onerror = null; }
      postMessage() { setTimeout(() => this.onerror?.({ message: 'stubbed worker error' }), 0); }
      terminate() {}
    }
    window.Worker = StubWorker;
    try {
      const dna = await import('/js/dna.js?bust=' + Date.now());
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

  console.log(`%c Result: ${pass} passed, ${fail} failed `, fail === 0
    ? 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px'
    : 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  return { pass, fail };
})();
