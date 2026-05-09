// test-ai-verdict-engine.js — engine contract coverage.
//
// The engine is feature-agnostic — it accepts a config and produces an
// analyze/refresh/maybeAfterFinish/getStatus/purgeOrphaned API. These
// tests build minimal synthetic configs and verify each contract guarantee
// without touching real per-feature modules.
//
// Network is stubbed via window.fetch override so no real OpenRouter
// traffic happens; the engine routes through callClaudeAPI (api.js)
// which we let through to fetch.

return (async function () {
  let pass = 0, fail = 0;
  function assert(name, cond, detail) {
    if (cond) {
      pass++;
      console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || '');
    } else {
      fail++;
      console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || '');
    }
  }

  console.log('%c AI Verdict Engine Tests ', 'background:#a855f7;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const eng = await import('/js/ai-verdict-engine.js?bust=' + Date.now());
  const { createAIVerdict, hashString, dotPrefix, VERDICT_DOT_VALUES } = eng;

  // ─── 1. hashString — deterministic + djb2 properties ──────────────
  console.log('%c 1. hashString ', 'font-weight:bold;color:#a855f7');

  assert('hashString is deterministic', hashString('foo|bar') === hashString('foo|bar'));
  assert('hashString differs for different inputs', hashString('abc') !== hashString('xyz'));
  assert('hashString accepts empty string', typeof hashString('') === 'string');
  assert('hashString accepts null without throwing',
    typeof hashString(null) === 'string');

  // ─── 2. dotPrefix ─────────────────────────────────────────────────
  console.log('%c 2. dotPrefix ', 'font-weight:bold;color:#a855f7');

  assert('dotPrefix(green) → ✓', dotPrefix('green') === '✓');
  assert('dotPrefix(yellow) → ⚠', dotPrefix('yellow') === '⚠');
  assert('dotPrefix(red) → ▲', dotPrefix('red') === '▲');
  assert('dotPrefix(gray) → ·', dotPrefix('gray') === '·');
  assert('dotPrefix(unknown) → · fallback', dotPrefix('purple') === '·');
  assert('VERDICT_DOT_VALUES is the canonical 4-set',
    JSON.stringify(VERDICT_DOT_VALUES) === JSON.stringify(['green', 'yellow', 'red', 'gray']));

  // ─── 3. createAIVerdict — contract validation ─────────────────────
  console.log('%c 3. createAIVerdict ', 'font-weight:bold;color:#a855f7');

  let threw = false;
  try { createAIVerdict(); } catch (e) { threw = true; }
  assert('createAIVerdict throws when cfg missing', threw);

  threw = false;
  try { createAIVerdict({}); } catch (e) { threw = true; }
  assert('createAIVerdict throws when getId missing', threw);

  threw = false;
  try {
    createAIVerdict({
      getId: () => '1',
      // missing getAIAnalysis
      setAIAnalysis: () => {},
      getFingerprint: () => '',
      buildContext: () => '',
      systemPrompt: 'test',
    });
  } catch (e) { threw = true; }
  assert('createAIVerdict throws when getAIAnalysis missing', threw);

  // Minimal valid config
  function makeMinimalEngine(opts = {}) {
    const store = new Map(); // id → analysis object
    return {
      store,
      engine: createAIVerdict(Object.assign({
        getTarget: (id) => ({ id }),
        getId: (t) => t?.id,
        getAIAnalysis: (t) => store.get(t.id) || null,
        setAIAnalysis: (t, v) => { if (v == null) store.delete(t.id); else store.set(t.id, v); },
        getFingerprint: (t) => 'fp_' + t.id,
        buildContext: (t) => `### Target ${t.id}`,
        systemPrompt: 'Test system prompt. Return {"dot":"green","tip":"ok","detail":"ok"}.',
        maxTokens: 100,
        getAllTargets: () => [...store.entries()].map(([id]) => ({ id })),
      }, opts)),
    };
  }

  // ─── 4. getStatus state machine ────────────────────────────────────
  console.log('%c 4. getStatus ', 'font-weight:bold;color:#a855f7');

  {
    const { engine, store } = makeMinimalEngine();
    const t = { id: 'a' };
    assert('getStatus(no aiAnalysis) → idle', engine.getStatus(t) === 'idle');
    store.set('a', { dot: 'green', status: 'ok' });
    assert('getStatus(ok+dot) → ok', engine.getStatus({ id: 'a' }) === 'ok');
    store.set('a', { status: 'error' });
    assert('getStatus(error) → error', engine.getStatus({ id: 'a' }) === 'error');
    store.set('a', { status: 'analyzing' }); // legacy persisted state from pre-fix
    assert('getStatus(persisted analyzing, no inflight) → idle (orphan recovery)',
      engine.getStatus({ id: 'a' }) === 'idle');
  }

  // ─── 5. Fingerprint cache hit ──────────────────────────────────────
  console.log('%c 5. Fingerprint cache hit ', 'font-weight:bold;color:#a855f7');

  {
    const { engine, store } = makeMinimalEngine();
    // Pre-seed an OK verdict with the fingerprint we'd compute
    store.set('x', { dot: 'green', tip: 'cached', detail: 'cached', fingerprint: 'fp_x', status: 'ok' });
    // Stub fetch to detect any API call
    let apiCalled = false;
    const origFetch = window.fetch;
    window.fetch = (...args) => { apiCalled = true; return origFetch(...args); };
    try {
      const result = await engine.analyze({ id: 'x' });
      assert('analyze returns cached verdict on fingerprint match',
        result?.tip === 'cached' && result?.dot === 'green');
      assert('analyze did NOT call fetch when fingerprint matched',
        !apiCalled);
    } finally {
      window.fetch = origFetch;
    }
  }

  // ─── 6. Force-refresh BYPASSES cache even when fingerprint matches ─
  // Earlier draft kept the cache hit on force=true to avoid CRDT-churn
  // from cross-device sync, but the ↻ button is an explicit user signal
  // ("re-analyze, even if data hasn't changed") and a silent no-op was
  // a worse UX than the occasional extra API call. Greptile PR #175
  // review caught this. Force is only set by the public refresh() entry,
  // never by auto-fire — so CRDT-churn is bounded by user clicks.
  console.log('%c 6. Force-refresh bypasses cache ', 'font-weight:bold;color:#a855f7');

  {
    const { engine, store } = makeMinimalEngine();
    const cachedAt = Date.now() - 60000;
    store.set('x', { dot: 'green', tip: 'cached', detail: 'cached', fingerprint: 'fp_x', status: 'ok', generatedAt: cachedAt });
    // Provider gate: hasAIProvider returns true on `ollama` (optimistic
    // — errors caught at call time). Without setting a provider, analyze()
    // short-circuits at the gate and never reaches fetch.
    const origProvider = localStorage.getItem('labcharts-ai-provider');
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    let apiCalled = false;
    const origFetch = window.fetch;
    window.fetch = async () => {
      apiCalled = true;
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"dot":"yellow","tip":"refreshed","detail":"refreshed-detail"}' } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const result = await engine.analyze({ id: 'x' }, { force: true });
      assert('force-refresh DID call fetch even with fingerprint match',
        apiCalled);
      assert('force-refresh returned the fresh verdict, not the cached one',
        result?.tip === 'refreshed' && result?.generatedAt !== cachedAt,
        `tip=${result?.tip}, gen diff=${(result?.generatedAt || 0) - cachedAt}`);
    } finally {
      window.fetch = origFetch;
      if (origProvider == null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', origProvider);
    }
  }

  // ─── 7. Inflight tracker prevents concurrent analyses ──────────────
  console.log('%c 7. Inflight tracker ', 'font-weight:bold;color:#a855f7');

  {
    const { engine, store } = makeMinimalEngine();
    // Block fetch indefinitely so the first analyze stays in-flight
    const origFetch = window.fetch;
    let resolveFetch;
    window.fetch = () => new Promise(r => { resolveFetch = r; });
    try {
      const p1 = engine.analyze({ id: 'y' });
      // Tiny await so analyze() can mark the inflight Set
      await new Promise(r => setTimeout(r, 20));
      const p2Result = await engine.analyze({ id: 'y' });
      assert('second concurrent analyze returns null (inflight guard)',
        p2Result === null);
      // Cancel the hung first call
      resolveFetch && resolveFetch(new Response('{"choices":[{"message":{"content":"{\\"dot\\":\\"green\\",\\"tip\\":\\"x\\",\\"detail\\":\\"x\\"}"}}]}'));
      await p1;
    } finally {
      window.fetch = origFetch;
    }
  }

  // ─── 8. canAnalyze gate ────────────────────────────────────────────
  console.log('%c 8. canAnalyze gate ', 'font-weight:bold;color:#a855f7');

  {
    const { engine } = makeMinimalEngine({
      canAnalyze: (t) => t.id !== 'blocked',
    });
    let apiCalled = false;
    const origFetch = window.fetch;
    window.fetch = (...args) => { apiCalled = true; return origFetch(...args); };
    try {
      const r = await engine.analyze({ id: 'blocked' });
      assert('canAnalyze=false short-circuits to null', r === null);
      assert('canAnalyze=false does NOT call fetch', !apiCalled);
    } finally {
      window.fetch = origFetch;
    }
  }

  // ─── 9. shouldAutoFire gate (maybeAfterFinish) ─────────────────────
  console.log('%c 9. maybeAfterFinish gate ', 'font-weight:bold;color:#a855f7');

  {
    let analyzeCalled = false;
    const { engine } = makeMinimalEngine({
      shouldAutoFire: (t) => t.id !== 'no-auto',
    });
    const origFetch = window.fetch;
    window.fetch = (...args) => { analyzeCalled = true; return origFetch(...args); };
    try {
      engine.maybeAfterFinish({ id: 'no-auto' });
      // setTimeout(0) gives the auto-fire path a chance to run
      await new Promise(r => setTimeout(r, 50));
      assert('maybeAfterFinish does not auto-fire when shouldAutoFire=false',
        !analyzeCalled);
    } finally {
      window.fetch = origFetch;
    }
  }

  // ─── 10. Global feature flag (DISABLE_AI_VERDICTS) ─────────────────
  console.log('%c 10. Global feature flag ', 'font-weight:bold;color:#a855f7');

  {
    const { engine } = makeMinimalEngine();
    let apiCalled = false;
    const origFetch = window.fetch;
    window.fetch = (...args) => { apiCalled = true; return origFetch(...args); };
    window.DISABLE_AI_VERDICTS = true;
    try {
      const r = await engine.analyze({ id: 'flag' });
      assert('DISABLE_AI_VERDICTS=true short-circuits analyze to null', r === null);
      assert('DISABLE_AI_VERDICTS=true does NOT call fetch', !apiCalled);
    } finally {
      window.fetch = origFetch;
      delete window.DISABLE_AI_VERDICTS;
    }
  }

  // ─── 11. Custom event broadcast on state change ────────────────────
  console.log('%c 11. Custom event ', 'font-weight:bold;color:#a855f7');

  {
    let eventFired = false;
    const handler = () => { eventFired = true; };
    window.addEventListener('labcharts-ai-verdict-updated', handler);
    const { engine, store } = makeMinimalEngine();
    // Pre-cache so analyze short-circuits to cached but still calls _refresh
    store.set('z', { dot: 'green', tip: 't', detail: 'd', fingerprint: 'fp_z', status: 'ok' });
    await engine.analyze({ id: 'z' }); // cache-hit path doesn't fire event
    // For event check, do an actual analyze that goes through _refresh
    // The cache-hit path returns early so no event. We need a fingerprint
    // miss to exercise the full path — use a different id.
    const origFetch = window.fetch;
    window.fetch = () => Promise.resolve(new Response(
      '{"choices":[{"message":{"content":"{\\"dot\\":\\"green\\",\\"tip\\":\\"new\\",\\"detail\\":\\"new\\"}"}}]}',
      { headers: { 'Content-Type': 'application/json' } }
    ));
    try {
      // No provider configured in test — skip if so
      if (typeof window.hasAIProvider === 'function' && window.hasAIProvider()) {
        await engine.analyze({ id: 'event-test' });
        assert('engine dispatches labcharts-ai-verdict-updated on state change', eventFired);
      } else {
        assert('event test skipped — no AI provider in test env', true,
          '(install a provider to exercise this path)');
      }
    } finally {
      window.fetch = origFetch;
      window.removeEventListener('labcharts-ai-verdict-updated', handler);
    }
  }

  // ─── 12. parseExtraFields hook ─────────────────────────────────────
  console.log('%c 12. parseExtraFields ', 'font-weight:bold;color:#a855f7');

  {
    const { engine, store } = makeMinimalEngine({
      parseExtraFields: (parsed, target) => ({ extraField: 'computed-' + target.id }),
    });
    const origFetch = window.fetch;
    window.fetch = () => Promise.resolve(new Response(
      JSON.stringify({ choices: [{ message: { content: '{"dot":"green","tip":"t","detail":"d"}' } }] }),
      { headers: { 'Content-Type': 'application/json' } }
    ));
    try {
      if (typeof window.hasAIProvider === 'function' && window.hasAIProvider()) {
        await engine.analyze({ id: 'extra' });
        const stored = store.get('extra');
        assert('parseExtraFields output merged into saved verdict',
          stored?.extraField === 'computed-extra',
          JSON.stringify(stored));
      } else {
        assert('parseExtraFields test skipped — no AI provider', true);
      }
    } finally {
      window.fetch = origFetch;
    }
  }

  // ─── 12b. maybeAfterFinish retries transient errors ────────────────
  // Auto-fire after save was failing visibly more often than manual
  // refresh — JSON-parse blips, rate-limit jitter, cold-start timeouts.
  // Manual click usually succeeded on the second try; we now automate
  // that retry. Auth/quota errors are NOT retried (user-actionable).
  console.log('%c 12b. maybeAfterFinish retry on transient error ', 'font-weight:bold;color:#a855f7');

  if (typeof window.hasAIProvider === 'function' && window.hasAIProvider()) {
    // Helper that builds a fetch stub which fails the first N calls then succeeds.
    function makeFlakyFetch(failCount, errorBody) {
      let calls = 0;
      const stub = () => {
        calls++;
        if (calls <= failCount) {
          return Promise.resolve(new Response(
            errorBody || 'Here is my analysis without JSON',
            { headers: { 'Content-Type': 'text/plain' } }
          ));
        }
        return Promise.resolve(new Response(
          '{"choices":[{"message":{"content":"{\\"dot\\":\\"green\\",\\"tip\\":\\"recovered\\",\\"detail\\":\\"recovered after retry\\"}"}}]}',
          { headers: { 'Content-Type': 'application/json' } }
        ));
      };
      stub._getCalls = () => calls;
      return stub;
    }

    // Fail-once-succeed-on-retry: verdict ends in 'ok' state with the
    // retry-supplied content, not the first-call error.
    {
      const { engine, store } = makeMinimalEngine({ autoFireRetryDelaysMs: [50, 50] });
      const stub = makeFlakyFetch(1);
      const origFetch = window.fetch;
      window.fetch = stub;
      try {
        engine.maybeAfterFinish({ id: 'flaky-1' });
        // Wait long enough for: initial attempt → error → 50ms backoff → retry → success
        await new Promise(r => setTimeout(r, 1500));
        const stored = store.get('flaky-1');
        assert('maybeAfterFinish retries on transient JSON-parse error',
          stored?.status === 'ok' && stored?.tip === 'recovered',
          `status=${stored?.status} tip=${stored?.tip} fetchCalls=${stub._getCalls()}`);
        assert('Retry was actually attempted (≥2 fetch calls)',
          stub._getCalls() >= 2);
      } finally {
        window.fetch = origFetch;
      }
    }

    // Auth-style error → no retry. Verdict stays in error state and the
    // fetch is called only once (no retry burns user's auth attempts).
    {
      const { engine, store } = makeMinimalEngine({ autoFireRetryDelaysMs: [50, 50] });
      let calls = 0;
      const origFetch = window.fetch;
      window.fetch = () => {
        calls++;
        return Promise.resolve(new Response(
          JSON.stringify({ error: { message: 'Unauthorized: invalid api key' } }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        ));
      };
      try {
        engine.maybeAfterFinish({ id: 'auth-fail' });
        await new Promise(r => setTimeout(r, 1500));
        const stored = store.get('auth-fail');
        assert('maybeAfterFinish does NOT retry on auth/quota errors',
          stored?.status === 'error' && calls === 1,
          `status=${stored?.status} fetchCalls=${calls} msg=${stored?.errorMessage}`);
      } finally {
        window.fetch = origFetch;
      }
    }

    // All retries exhausted → final state is error. No infinite loop.
    {
      const { engine, store } = makeMinimalEngine({ autoFireRetryDelaysMs: [30, 30] });
      let calls = 0;
      const origFetch = window.fetch;
      window.fetch = () => {
        calls++;
        return Promise.resolve(new Response(
          'no JSON anywhere',
          { headers: { 'Content-Type': 'text/plain' } }
        ));
      };
      try {
        engine.maybeAfterFinish({ id: 'exhaust' });
        await new Promise(r => setTimeout(r, 1500));
        const stored = store.get('exhaust');
        assert('Exhausted retries: final state is error (no infinite loop)',
          stored?.status === 'error');
        assert('Exhausted retries: total calls = 1 initial + 2 retries = 3',
          calls === 3, `actual fetchCalls=${calls}`);
      } finally {
        window.fetch = origFetch;
      }
    }

    // Retry-in-progress: getStatus reports 'analyzing' throughout the
    // entire retry sequence — between attempts (during backoff sleep)
    // status MUST stay 'analyzing', not flip to 'error'. Without this,
    // the UI flashes "Analysis failed" mid-retry which feels like a
    // real failure.
    {
      const { engine } = makeMinimalEngine({ autoFireRetryDelaysMs: [200, 200] });
      let calls = 0;
      const origFetch = window.fetch;
      // Always fail for this test — we want to observe the in-flight
      // status during the long sequence, not the final outcome.
      window.fetch = () => {
        calls++;
        return Promise.resolve(new Response('not json', { headers: { 'Content-Type': 'text/plain' } }));
      };
      const target = { id: 'sticky-analyzing' };
      try {
        engine.maybeAfterFinish(target);
        // Sample status mid-sequence — during the 200ms backoff between
        // initial attempt and first retry.
        await new Promise(r => setTimeout(r, 100));
        const midStatus = engine.getStatus(target);
        assert('getStatus stays "analyzing" during backoff between retry attempts',
          midStatus === 'analyzing', `mid-sequence status=${midStatus}`);
        // Now wait for the full sequence to complete.
        await new Promise(r => setTimeout(r, 1500));
        const finalStatus = engine.getStatus(target);
        assert('After all retries exhausted, status flips to error',
          finalStatus === 'error', `final status=${finalStatus}`);
      } finally {
        window.fetch = origFetch;
      }
    }
  } else {
    assert('Retry tests skipped — no AI provider in test env', true);
  }

  // ─── 12c. Global concurrency cap — third concurrent call waits ─────
  // Saving a session triggers 3 engines (Light Today, Channel mix,
  // Session analysis). Without a global cap, all 3 hit the provider
  // simultaneously — most providers cap at 2 concurrent calls and the
  // 3rd silently fails. Cap of 2 means the 3rd call waits its turn.
  console.log('%c 12c. Global AI concurrency cap ', 'font-weight:bold;color:#a855f7');

  if (typeof window.hasAIProvider === 'function' && window.hasAIProvider()) {
    const prevCap = window._aiConcurrencyCap;
    window._aiConcurrencyCap = 2;
    let inFlightObserved = 0;
    let maxInFlight = 0;
    const origFetch = window.fetch;
    // Each fetch holds for 200ms so concurrency overlap is observable.
    window.fetch = async (...args) => {
      inFlightObserved++;
      if (inFlightObserved > maxInFlight) maxInFlight = inFlightObserved;
      try {
        await new Promise(r => setTimeout(r, 200));
        return new Response(
          '{"choices":[{"message":{"content":"{\\"dot\\":\\"green\\",\\"tip\\":\\"ok\\",\\"detail\\":\\"ok\\"}"}}]}',
          { headers: { 'Content-Type': 'application/json' } }
        );
      } finally {
        inFlightObserved--;
      }
    };
    try {
      const e1 = makeMinimalEngine().engine;
      const e2 = makeMinimalEngine().engine;
      const e3 = makeMinimalEngine().engine;
      // Fire 3 analyze calls concurrently across 3 different engines
      const p = Promise.all([
        e1.analyze({ id: 'a' }),
        e2.analyze({ id: 'b' }),
        e3.analyze({ id: 'c' }),
      ]);
      // Sample mid-flight — should see at most 2 fetches active concurrently
      await new Promise(r => setTimeout(r, 100));
      const slots = window._aiSlotsDebug?.();
      assert('Concurrency cap holds: at most 2 concurrent fetches',
        maxInFlight <= 2, `maxInFlight=${maxInFlight} slots=${JSON.stringify(slots)}`);
      assert('Third concurrent call waits in queue',
        slots?.waiting >= 1, `slots=${JSON.stringify(slots)}`);
      await p;
      assert('After all 3 finish: zero active, zero waiting',
        window._aiSlotsDebug?.().active === 0 && window._aiSlotsDebug?.().waiting === 0);
    } finally {
      window.fetch = origFetch;
      if (prevCap === undefined) delete window._aiConcurrencyCap;
      else window._aiConcurrencyCap = prevCap;
    }
  } else {
    assert('Concurrency cap test skipped — no AI provider in test env', true);
  }

  // ─── 13. purgeOrphaned clears legacy analyzing state ───────────────
  console.log('%c 13. purgeOrphaned ', 'font-weight:bold;color:#a855f7');

  {
    const { engine, store } = makeMinimalEngine();
    store.set('orphan-1', { status: 'analyzing', fingerprint: 'old' });
    store.set('clean-1',  { status: 'ok', dot: 'green', fingerprint: 'fp_clean-1', tip: 't', detail: 'd' });
    await engine.purgeOrphaned();
    assert('purgeOrphaned wipes status:analyzing rows',
      !store.has('orphan-1'));
    assert('purgeOrphaned preserves status:ok rows',
      store.get('clean-1')?.status === 'ok');
  }

  // ─── 14. Error normalization for non-JSON response bodies ──────────
  // Catches the case where the upstream returns an HTML error page
  // (502 from a relay, captive-portal redirect, etc) instead of JSON.
  // Without normalization the catch block surfaces raw "Unexpected token
  // '<' in JSON at position 0" into the verdict UI, which is horrendous.
  console.log('%c 14. Error normalization (non-JSON response bodies) ', 'font-weight:bold;color:#a855f7');

  if (typeof window.hasAIProvider === 'function' && window.hasAIProvider()) {
    const cases = [
      { name: 'HTML 502 page', body: '<html><body><h1>502 Bad Gateway</h1></body></html>',
        expectMsg: /unexpected response|try again/i },
      { name: 'plain-text "service unavailable"', body: 'service unavailable',
        expectMsg: /unexpected response|try again/i },
      { name: 'empty body', body: '',
        expectMsg: /unexpected response|try again|failed/i },
    ];
    for (const c of cases) {
      const { engine, store } = makeMinimalEngine();
      const origFetch = window.fetch;
      window.fetch = () => Promise.resolve(new Response(c.body, {
        headers: { 'Content-Type': 'text/html' },
      }));
      try {
        await engine.analyze({ id: `nonjson-${c.name.replace(/\s+/g, '-')}` });
        const stored = store.get(`nonjson-${c.name.replace(/\s+/g, '-')}`);
        assert(`non-JSON response (${c.name}) normalizes to user-readable error`,
          stored?.status === 'error' && c.expectMsg.test(stored.errorMessage || ''),
          `status=${stored?.status} msg="${stored?.errorMessage}"`);
      } finally {
        window.fetch = origFetch;
      }
    }
  } else {
    assert('non-JSON error normalization test skipped — no AI provider in test env', true);
  }

  // ─── 15. DISABLE_AI_VERDICTS short-circuits maybeAfterFinish too ──
  // The kill switch documented in the engine doc-block must apply to
  // BOTH analyze() AND maybeAfterFinish() — otherwise auto-fire on
  // session save would still burn provider calls after a user toggled
  // the flag in DevTools. Verify by setting the flag, calling
  // maybeAfterFinish, and asserting zero fetches.
  console.log('%c 15. DISABLE_AI_VERDICTS gate covers maybeAfterFinish ', 'font-weight:bold;color:#a855f7');

  if (typeof window.hasAIProvider === 'function' && window.hasAIProvider()) {
    const { engine, store } = makeMinimalEngine({ autoFireRetryDelaysMs: [30] });
    let calls = 0;
    const origFetch = window.fetch;
    window.fetch = () => { calls++; return Promise.resolve(new Response('{}')); };
    const prevFlag = window.DISABLE_AI_VERDICTS;
    window.DISABLE_AI_VERDICTS = true;
    try {
      engine.maybeAfterFinish({ id: 'kill-switch' });
      await new Promise(r => setTimeout(r, 600));
      const stored = store.get('kill-switch');
      assert('DISABLE_AI_VERDICTS=true short-circuits maybeAfterFinish (zero fetches)',
        calls === 0,
        `unexpected ${calls} fetches with kill-switch on`);
      assert('DISABLE_AI_VERDICTS=true does not write any verdict',
        stored == null,
        `unexpected stored verdict: ${JSON.stringify(stored)}`);
    } finally {
      window.fetch = origFetch;
      if (prevFlag === undefined) delete window.DISABLE_AI_VERDICTS;
      else window.DISABLE_AI_VERDICTS = prevFlag;
    }
  } else {
    assert('DISABLE_AI_VERDICTS gate test skipped — no AI provider in test env', true);
  }

  console.log(`%c Result: ${pass} passed, ${fail} failed `, fail === 0
    ? 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px'
    : 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  return { pass, fail };
})();
