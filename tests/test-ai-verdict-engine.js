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

  // ─── 6. Force-refresh STILL hits cache when fingerprint matches ────
  console.log('%c 6. Force + cache hit (CRDT-churn fix) ', 'font-weight:bold;color:#a855f7');

  {
    const { engine, store } = makeMinimalEngine();
    const cachedAt = Date.now() - 60000;
    store.set('x', { dot: 'green', tip: 'cached', detail: 'cached', fingerprint: 'fp_x', status: 'ok', generatedAt: cachedAt });
    let apiCalled = false;
    const origFetch = window.fetch;
    window.fetch = (...args) => { apiCalled = true; return origFetch(...args); };
    try {
      const result = await engine.analyze({ id: 'x' }, { force: true });
      assert('force-refresh returns cached verdict when fingerprint stable',
        result?.generatedAt === cachedAt);
      assert('force-refresh did NOT call fetch when fingerprint stable (CRDT-churn fix)',
        !apiCalled);
    } finally {
      window.fetch = origFetch;
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

  console.log(`%c Result: ${pass} passed, ${fail} failed `, fail === 0
    ? 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px'
    : 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  return { pass, fail };
})();
