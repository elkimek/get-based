// test-correctness-phase2.js — regression tests for v1.5.1 correctness pass.
// Covers: per-profile sync debouncer, lab-context fingerprint, lens LRU,
// SW precache list, Polar OAuth callback, profile-swap guard, cycle clamp,
// SSE trailing buffer + parse error filter, PhenoAge CRP, profile recovery.
//
// Run: fetch('tests/test-correctness-phase2.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let passed = 0, failed = 0;
  const fails = [];
  function assert(name, cond, detail) {
    if (cond) { passed++; console.log(`  %c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { failed++; fails.push(name); console.error(`  %c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Phase 2 Correctness Tests ', 'background:#0ea5e9;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // ─── 1. Per-profile sync debouncer ───
  console.log('%c 1. Per-profile sync debouncer ', 'font-weight:bold;color:#f59e0b');
  const syncSrc = await fetch('/js/sync.js').then(r => r.text());
  assert('sync.js declares per-profile timer Map',
    syncSrc.includes('const _debounceTimers = new Map()'),
    'shared single timer dropped pending push when user swapped profile mid-debounce');
  assert('sync.js no longer has single _debounceTimer',
    !/\blet _debounceTimer\b/.test(syncSrc));
  assert('sync.js looks up timer by profileId',
    syncSrc.includes('_debounceTimers.get(profileId)') && syncSrc.includes('_debounceTimers.set(profileId'));
  assert('sync.js clears all timers on disable',
    syncSrc.includes('for (const t of _debounceTimers.values()) clearTimeout(t)'));

  // ─── 2. Lab-context fingerprint includes wearableSummary ───
  console.log('%c 2. Lab-context cache fingerprint ', 'font-weight:bold;color:#f59e0b');
  const lcSrc = await fetch('/js/lab-context.js').then(r => r.text());
  assert('lab-context fingerprint covers wearableSummary',
    lcSrc.includes("'wearableSummary'") && lcSrc.match(/cardPart\s*=.*wearableSummary/s),
    'AI context replayed stale wearable data after sync without this');

  // ─── 3. Lens LRU cache bumps on hit ───
  console.log('%c 3. Lens LRU cache ', 'font-weight:bold;color:#f59e0b');
  const lensSrc = await fetch('/js/lens.js').then(r => r.text());
  const cacheGetMatch = lensSrc.match(/function cacheGet\(k\) \{([\s\S]*?)\n\}/);
  assert('cacheGet re-inserts on hit',
    cacheGetMatch && cacheGetMatch[1].includes('_cache.delete(k)') && cacheGetMatch[1].includes('_cache.set(k, row)'),
    'Map iterates in insertion order — without re-insert, hot entries are evicted by FIFO');

  // ─── 4. Service worker precaches dynamic modules ───
  console.log('%c 4. SW precache ', 'font-weight:bold;color:#f59e0b');
  const swSrc = await fetch('/service-worker.js').then(r => r.text());
  for (const mod of ['chat-images.js', 'chat-threads.js', 'lens.js', 'lens-local.js', 'lens-local-worker.js', 'lens-local-utils.js', 'lens-local-parsers.js']) {
    assert(`SW precaches /js/${mod}`, swSrc.includes(`'/js/${mod}'`),
      'first-launch-offline (PWA install + go-offline) cannot dynamic-import this module');
  }

  // ─── 5. Polar OAuth callback returns true + clears connection ───
  console.log('%c 5. Polar OAuth callback ', 'font-weight:bold;color:#f59e0b');
  const wcSrc = await fetch('/js/wearables-connect.js').then(r => r.text());
  // The block: if (!result.tokens.userId) { removeConnection(adapterId); … return true; }
  // Source-level scan rather than regex (template literals contain `}` so a
  // braces-match regex bails early). Just check the four required bits all
  // appear within ~30 lines after the if-clause head.
  const headIdx = wcSrc.indexOf('if (!result.tokens.userId)');
  const window30 = headIdx >= 0 ? wcSrc.slice(headIdx, headIdx + 1200) : '';
  assert('userId-missing branch removes connection cleanly',
    headIdx >= 0 && window30.includes('removeConnection(adapterId)'),
    'previously left a needsReauth-flagged record that re-broke on every sync');
  assert('userId-missing branch returns true',
    headIdx >= 0 && window30.match(/removeConnection\(adapterId\)[\s\S]{0,400}return true/));

  // ─── 6. Profile-swap guard around fetchAccountInfo + postConnect ───
  console.log('%c 6. Profile-swap guard ', 'font-weight:bold;color:#f59e0b');
  // Two new guard lines after the awaited fetchAccountInfo and postConnect.
  const swapGuardCount = (wcSrc.match(/getActiveProfileId\(\) !== activeProfile/g) || []).length;
  assert('two profile-swap guards present (post-await)',
    swapGuardCount >= 2,
    `expected ≥2 guards, found ${swapGuardCount}`);
  assert('guard message references aborted connect',
    wcSrc.includes('connect aborted — profile changed'));

  // ─── 7. Cycle perimenopause clamp ───
  console.log('%c 7. Cycle clamp relax ', 'font-weight:bold;color:#f59e0b');
  const cycleSrc = await fetch('/js/cycle.js').then(r => r.text());
  assert('cycle.js no longer hard-clamps to 45 unconditionally',
    !cycleSrc.includes('Math.max(20, Math.min(45, avgCycle))'),
    'old clamp truncated 60–90 day perimenopause cycles to 45');
  assert('cycle.js uses a 90-day ceiling',
    cycleSrc.includes('Math.max(20, Math.min(90, avgCycle))'),
    'regular-and-long perimenopause cycles need to land at their real average, not 45');

  // ─── 8. SSE trailing buffer flush + parse error filter ───
  console.log('%c 8. SSE robustness ', 'font-weight:bold;color:#f59e0b');
  const apiSrc = await fetch('/js/api.js').then(r => r.text());
  assert('SSE handler flushes trailing buffer after done',
    apiSrc.match(/buffer\.startsWith\('data: '\)\) handleSSELine/),
    'final data: event without newline was silently dropped on truncation');
  assert('SSE parse-error filter checks SyntaxError + boundary, not string prefix',
    apiSrc.includes('parseErr instanceof SyntaxError') &&
    !apiSrc.includes("!parseErr.message.startsWith('Unexpected')"),
    'old "Unexpected" prefix check confused chunk boundaries with malformed events');
  assert('Venice E2EE stream also flushes trailing buffer',
    apiSrc.match(/buffer\.startsWith\('data: '\)\) await handleVeniceLine/));

  // ─── 9. PhenoAge requires hs-CRP only ───
  console.log('%c 9. PhenoAge CRP strictness ', 'font-weight:bold;color:#f59e0b');
  const dataSrc = await fetch('/js/data.js').then(r => r.text());
  // Old fallback used `hsCrp ?? standardCrp`. New: hs-CRP only.
  assert('PhenoAge no longer falls back to standard CRP',
    !dataSrc.match(/_getCRP[\s\S]{0,200}getVals\('proteins', 'crp'\)/),
    'standard CRP and hs-CRP differ in detection range — silent substitution corrupted estimates');
  assert('_getCRP reads only hsCRP',
    dataSrc.includes("getVals('proteins', 'hsCRP')?.[i] ?? null"));

  // ─── 10. Profile load preserves corrupted bytes ───
  console.log('%c 10. Profile parse recovery ', 'font-weight:bold;color:#f59e0b');
  const profSrc = await fetch('/js/profile.js').then(r => r.text());
  assert('loadProfile backs up corrupted JSON',
    profSrc.includes('imported-corrupt') && profSrc.includes('localStorage.setItem(corruptKey'),
    'previously discarded corrupted raw — user lost recovery path');
  assert('loadProfile surfaces a recovery toast',
    profSrc.includes('Profile data was corrupted'));

  // ─── Done ───
  console.log(`%c Phase 2 Correctness: ${passed} passed, ${failed} failed `,
    failed === 0 ? 'background:#22c55e;color:#fff;padding:4px 12px;border-radius:4px;font-weight:bold' : 'background:#ef4444;color:#fff;padding:4px 12px;border-radius:4px;font-weight:bold');
  if (failed > 0) console.error('Failures:', fails);
  return { passed, failed, fails };
})();
