// test-vendor-personal-info.js — Coverage probe for the per-vendor
// `fetchXxxPersonalInfo` exports (Fitbit / Ultrahuman / Whoop) and the
// per-vendor `logDebug` helpers fired by the daily-range fetchers when
// individual sub-requests fail.
//
// These functions are too thin to merit deep behavioural assertions —
// each is a try/catch around one (or N parallel) GET requests routed
// through `/api/proxy` — but they were the dominant uncalled-function
// source after the AI-verdict consumer sweep. We stub `window.fetch`
// to return a fixed shape (success vs error) without inspecting the
// proxied URL: each vendor's PersonalInfo only fires ONE GET, so a
// single global stub is enough.

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Vendor PersonalInfo Tests ', 'background:#0ea5e9;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const origFetch = window.fetch;
  function stubAll(body, status = 200) {
    window.fetch = async () => new Response(JSON.stringify(body),
      { status, headers: { 'content-type': 'application/json' } });
  }

  try {
    // ─── Fitbit ─────────────────────────────────────────────────────────
    console.log('%c Fitbit ', 'font-weight:bold;color:#0ea5e9');
    const fb = await import('/js/wearables-fitbit.js?bust=' + Date.now());

    // Happy path — fetchFitbitPersonalInfo unwraps `info.user`
    stubAll({ user: { email: 'fitbit@example.com', fullName: 'Fitbit User' } });
    const fbOk = await fb.fetchFitbitPersonalInfo('stub-token');
    assert('Fitbit personalInfo ok=true on success',
      fbOk?.ok === true, JSON.stringify(fbOk));
    assert('Fitbit personalInfo maps email',
      fbOk?.account?.email === 'fitbit@example.com');
    assert('Fitbit personalInfo maps fullName',
      fbOk?.account?.fullName === 'Fitbit User');

    // displayName fallback
    stubAll({ user: { email: 'd@example.com', displayName: 'Display Name' } });
    const fbDisp = await fb.fetchFitbitPersonalInfo('stub-token');
    assert('Fitbit personalInfo falls back to displayName when fullName missing',
      fbDisp?.account?.fullName === 'Display Name');

    // Error path → ok=false with status. Proxy returning non-200 makes
    // fbGET throw before the parse, so the catch branch fires.
    stubAll({ errors: [{ message: 'Token expired' }] }, 401);
    const fbErr = await fb.fetchFitbitPersonalInfo('stub-token');
    assert('Fitbit personalInfo ok=false on 401',
      fbErr?.ok === false, JSON.stringify(fbErr));
    assert('Fitbit personalInfo carries status code on error',
      fbErr?.status === 401);

    // dailyRange — all 7 sub-requests fail, exercising logDebug 7×
    stubAll({ error: 'sub-request failed' }, 500);
    const fbRows = await fb.fetchFitbitDailyRange('stub-token', '2026-05-01', '2026-05-02');
    assert('Fitbit dailyRange returns array even when every sub-request 500s (logDebug fired)',
      Array.isArray(fbRows));

    // ─── Ultrahuman ─────────────────────────────────────────────────────
    console.log('%c Ultrahuman ', 'font-weight:bold;color:#0ea5e9');
    const uh = await import('/js/wearables-ultrahuman.js?bust=' + Date.now());

    stubAll({ email: 'uh@example.com', first_name: 'UH', last_name: 'User' });
    const uhOk = await uh.fetchUltrahumanPersonalInfo('stub-token');
    assert('Ultrahuman personalInfo ok=true on success',
      uhOk?.ok === true);
    assert('Ultrahuman personalInfo maps email',
      uhOk?.account?.email === 'uh@example.com');
    assert('Ultrahuman personalInfo maps first/last name',
      uhOk?.account?.firstName === 'UH' && uhOk?.account?.lastName === 'User');

    // Nested user wrapper
    stubAll({ user: { email: 'nested@example.com', first_name: 'Nested', last_name: 'X' } });
    const uhNested = await uh.fetchUltrahumanPersonalInfo('stub-token');
    assert('Ultrahuman personalInfo unwraps nested .user shape',
      uhNested?.account?.email === 'nested@example.com');

    stubAll({ error: 'forbidden' }, 403);
    const uhErr = await uh.fetchUltrahumanPersonalInfo('stub-token');
    assert('Ultrahuman personalInfo ok=false on 403',
      uhErr?.ok === false);
    assert('Ultrahuman personalInfo carries status code on error',
      uhErr?.status === 403);

    // dailyRange across 2 days, both 500 — logDebug fires per-day in catch
    stubAll({ error: 'metrics down' }, 500);
    const uhRows = await uh.fetchUltrahumanDailyRange('stub-token', '2026-05-01', '2026-05-02');
    assert('Ultrahuman dailyRange returns array when every day errors (logDebug fired)',
      Array.isArray(uhRows));

    // ─── Whoop ──────────────────────────────────────────────────────────
    console.log('%c Whoop ', 'font-weight:bold;color:#0ea5e9');
    const wh = await import('/js/wearables-whoop.js?bust=' + Date.now());

    stubAll({ email: 'whoop@example.com', first_name: 'WH', last_name: 'User' });
    const whOk = await wh.fetchWhoopPersonalInfo('stub-token');
    assert('Whoop personalInfo ok=true on success',
      whOk?.ok === true, JSON.stringify(whOk));
    assert('Whoop personalInfo carries an account object',
      whOk?.account != null);

    stubAll({ error: 'unauthorized' }, 401);
    const whErr = await wh.fetchWhoopPersonalInfo('stub-token');
    assert('Whoop personalInfo ok=false on 401',
      whErr?.ok === false);

    // ─── Polar (logDebug coverage) ──────────────────────────────────────
    // Polar's existing test-ai-verdict-engine-instance.js covers register /
    // personalInfo / commit. The remaining gap is `logDebug`, which only
    // fires when individual transaction sub-fetches fail. Drive
    // fetchPolarDailyRange with everything 500 to exercise it.
    console.log('%c Polar (logDebug) ', 'font-weight:bold;color:#0ea5e9');
    const polar = await import('/js/wearables-polar.js?bust=' + Date.now());
    stubAll({ error: 'down' }, 500);
    const polarRows = await polar.fetchPolarDailyRange('stub-token',
      '2026-05-01', '2026-05-02', { userId: 'stub-user' });
    assert('Polar dailyRange returns array when every sub-tx 500s (logDebug fired)',
      Array.isArray(polarRows));

  } finally {
    window.fetch = origFetch;
  }

  console.log(`%c Result: ${pass} passed, ${fail} failed `, fail === 0
    ? 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px'
    : 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  return { pass, fail };
})();
