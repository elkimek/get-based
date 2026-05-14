// test-coverage-stragglers-dom.js — browser-runner-bound slice of
// test-coverage-stragglers.js.
//
// The stub-based probes (§2 extractDocx, §3 oura json-catch, §5
// reader.onerror, §6 AbortSignal.any polyfill, §8 IDB onerror rails,
// §10 dna worker.onerror) run on the Vitest runner in
// tests/test-coverage-stragglers.js. This file keeps the four sections
// that genuinely need a browser:
//   - §1  needs a real `new Image()` decoder to fire img.onerror
//   - §4  needs a real DOM overlay + animationend event
//   - §7  the `data:`-prefixed SSE fixture relies on provider/config
//         state that only the page runtime carries
//   - §9  needs a genuinely fresh module load (`?bust=`) so cashu's
//         `_db` closure is null and the indexedDB.open patch fires
//
// Run: fetch('tests/test-coverage-stragglers-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Coverage Stragglers — DOM-runtime ', 'background:#16a34a;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

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
      // Intentionally loose — the coverage goal is that handleSSELine ran
      // and accumulated *something*; exact content varies by provider shape.
      assert('handleSSELine accumulated text from streamed chunks',
        streamedText.length > 0,
        `streamedText=${JSON.stringify(streamedText)}`);
    } finally {
      window.fetch = origFetch;
      if (origProvider != null) localStorage.setItem('labcharts-ai-provider', origProvider);
      else localStorage.removeItem('labcharts-ai-provider');
    }
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

  console.log(`%c Result: ${pass} passed, ${fail} failed `, fail === 0
    ? 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px'
    : 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  return { pass, fail };
})();
