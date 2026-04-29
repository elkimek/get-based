// test-security-phase1.js — regression tests for the v1.5.0 security pass.
// Covers: pdf.js vendor file presence, isEvalSupported defense-in-depth,
// AI-supplied marker key sanitization, OAuth state param + expiry checks.
//
// Run: fetch('tests/test-security-phase1.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let passed = 0, failed = 0;
  const fails = [];
  function assert(name, cond, detail) {
    if (cond) { passed++; console.log(`  %c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { failed++; fails.push(name); console.error(`  %c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Phase 1 Security Tests ', 'background:#dc2626;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // ─── 1. pdf.js vendor file present at the new ESM path ───
  console.log('%c 1. pdf.js ESM bundle ', 'font-weight:bold;color:#f59e0b');
  const mjsHead = await fetch('/vendor/pdf.min.mjs', { method: 'HEAD' });
  assert('vendor/pdf.min.mjs exists', mjsHead.ok, `status=${mjsHead.status}`);
  const oldUmd = await fetch('/vendor/pdf.min.js', { method: 'HEAD' });
  assert('vendor/pdf.min.js (old UMD) is gone', !oldUmd.ok, `status=${oldUmd.status}`);

  const loaderSrc = await fetch('/js/pdfjs-loader.js').then(r => r.text());
  assert('pdfjs-loader pins isEvalSupported: false', loaderSrc.includes("isEvalSupported: false"),
    'CVE-2024-4367 defense-in-depth — every getDocument call must disable eval');
  // Greptile: ensure isEvalSupported lands AFTER the spread so extraOpts can't override.
  assert('isEvalSupported wins over extraOpts (via spread order)',
    loaderSrc.includes('...extraOpts, isEvalSupported: false }') &&
    !loaderSrc.includes('isEvalSupported: false, ...extraOpts'),
    'pin must apply after spread or a caller passing { isEvalSupported: true } reopens the CVE');

  const importSrc = await fetch('/js/pdf-import.js').then(r => r.text());
  assert('pdf-import.js routes through getPdfDocument',
    importSrc.includes('getPdfDocument') && !importSrc.includes('pdfjsLib.getDocument'),
    'no direct pdfjsLib.getDocument calls — they bypass the eval guard');
  const lensParsersSrc = await fetch('/js/lens-local-parsers.js').then(r => r.text());
  assert('lens-local-parsers.js routes through getPdfDocument',
    lensParsersSrc.includes('getPdfDocument') && !lensParsersSrc.includes('pdfjs.getDocument'));

  // ─── 2. AI suggestedKey / mappedKey sanitization ───
  console.log('%c 2. AI key sanitization ', 'font-weight:bold;color:#f59e0b');
  // The sanitizer is internal but exposed via behavior in parseLabPDFWithAI.
  // We assert the regex pattern is present and the call sites wire to it.
  assert('pdf-import.js defines _SAFE_MARKER_KEY pattern',
    importSrc.includes('_SAFE_MARKER_KEY') && importSrc.includes('/^[a-zA-Z][a-zA-Z0-9]*\\.[a-zA-Z][a-zA-Z0-9_]*$/'));
  assert('_sanitizeAIMarker called before adapter runs',
    importSrc.includes('parsed.markers.forEach(_sanitizeAIMarker)'),
    'must run before normalizeWithAdapter to prevent adapter-derived keys from inheriting unsafe halves');
  // Behavioral check: a marker with a quote-injection key should be nulled
  const exposedSanitizer = importSrc.match(/function _sanitizeAIMarker\(m\) \{([^}]+)\}/);
  assert('_sanitizeAIMarker drops both mappedKey and suggestedKey on bad input',
    exposedSanitizer && exposedSanitizer[1].includes('m.mappedKey = null') && exposedSanitizer[1].includes('m.suggestedKey = null'));

  // ─── 3. OpenRouter OAuth state param ───
  console.log('%c 3. OAuth state hardening ', 'font-weight:bold;color:#f59e0b');
  const apiSrc = await fetch('/js/api.js').then(r => r.text());
  assert('startOpenRouterOAuth sends state param',
    apiSrc.includes("&state=' + encodeURIComponent(state)"),
    'login-CSRF needs state, PKCE alone is insufficient');
  assert('startOpenRouterOAuth stores state in sessionStorage',
    apiSrc.includes("sessionStorage.setItem('or_oauth_state', state)"));
  assert('exchangeOpenRouterCode verifies returned state',
    apiSrc.includes('returnedState !== expectedState'));
  assert('exchangeOpenRouterCode clears state on success and on mismatch',
    (apiSrc.match(/sessionStorage\.removeItem\('or_oauth_state'\)/g) || []).length >= 2);
  const mainSrc = await fetch('/js/main.js').then(r => r.text());
  assert('main.js forwards state to exchangeOpenRouterCode',
    mainSrc.includes('exchangeOpenRouterCode(oauthCode, oauthState)'));

  // ─── 4. Wearable OAuth pending-state expiry ───
  console.log('%c 4. Wearable OAuth expiry ', 'font-weight:bold;color:#f59e0b');
  const adapters = ['oura', 'polar', 'ultrahuman', 'whoop', 'withings', 'fitbit'];
  for (const id of adapters) {
    const src = await fetch(`/js/wearables-${id}-auth.js`).then(r => r.text());
    assert(`${id}-auth: expiry check present`,
      src.includes("Date.now() - pending.startedAt > 10 * 60 * 1000"),
      'reject any pending state older than 10 minutes');
    assert(`${id}-auth: expiry returns ok:false`,
      src.includes("error: 'OAuth flow expired"));
  }

  // ─── 5. dev-server CORS reflection helper ───
  // (Server-side test — light-touch source-only assertion.)
  console.log('%c 5. dev-server CORS reflection ', 'font-weight:bold;color:#f59e0b');
  const devSrvHead = await fetch('/dev-server.js', { method: 'HEAD' });
  if (devSrvHead.ok) {
    const devSrc = await fetch('/dev-server.js').then(r => r.text());
    assert('dev-server.js defines corsHeaders helper',
      devSrc.includes('function corsHeaders(req)') && devSrc.includes("'Vary': 'Origin'"));
    assert('dev-server.js no longer emits wildcard ACAO',
      !devSrc.includes("'Access-Control-Allow-Origin': '*'"),
      'must reflect allowlisted origin, not wildcard');
    assert('dev-server.js gates SSRF-prone /api endpoints',
      devSrc.match(/_isAllowedProxyUrl\(target\)/g)?.length >= 3,
      '/api/check-url, /api/fetch-page, /api/fetch-page-rendered all gated');
    // Greptile: redirect destinations must be re-checked through the SSRF guard
    // so an allowlisted host can't 30x to 169.254.169.254 / private IPs.
    assert('dev-server.js re-checks redirect destinations',
      devSrc.match(/_isAllowedProxyUrl\(loc\)|_isAllowedProxyUrl\(redirect\)/g)?.length >= 3,
      '/api/check-url + /api/fetch-page + /proxy redirect-follow paths each need their own guard');
  } else {
    // Production deploy — no dev-server in the bundle. Skip silently.
    console.log('  (dev-server.js not served — production build, skipping CORS source asserts)');
  }

  // ─── Done ───
  console.log(`%c Phase 1 Security: ${passed} passed, ${failed} failed `,
    failed === 0 ? 'background:#22c55e;color:#fff;padding:4px 12px;border-radius:4px;font-weight:bold' : 'background:#ef4444;color:#fff;padding:4px 12px;border-radius:4px;font-weight:bold');
  if (failed > 0) console.error('Failures:', fails);
  return { passed, failed, fails };
})();
