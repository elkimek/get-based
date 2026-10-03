#!/usr/bin/env node
// Node-side test: dev-server /api/* same-origin guard rejects forged headers.
// Probes a running dev server. Issue #119.
// Run: node tests/test-dev-server-origin.js (server must be on :$PORT, default 8000)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 8000;
const HOST = '127.0.0.1';

function probe(method: string, pathStr: string, headers: import('node:http').OutgoingHttpHeaders) {
  return new Promise<{status: number | undefined; body: string}>((resolve, reject) => {
    const req = http.request({ host: HOST, port: PORT, path: pathStr, method, headers, timeout: 5000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

// The dev-server's origin guard emits `Forbidden` as a plain-text body.
// Upstream fetches through /proxy that happen to return 403 (Cloudflare
// WAF on example.com, etc.) return the upstream's HTML body. Use the
// body to tell them apart so external flakiness doesn't fail the guard test.
function isOurGuard403(r: Awaited<ReturnType<typeof probe>>) { return r.status === 403 && /^Forbidden$/i.test((r.body || '').trim()); }

(async () => {
  const results: string[] = [];
  let passed = 0, failed = 0;
  function assert(name: string, cond: unknown, detail?: unknown) {
    if (cond) { passed++; results.push(`  PASS: ${name}`); }
    else { failed++; results.push(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
  }

  console.log('=== dev-server origin guard tests ===\n');

  // 1. No Origin/Referer → 403
  try {
    const { status } = await probe('GET', '/api/check-url?url=https://example.com', {});
    assert('no headers → 403', status === 403, `got ${status}`);
  } catch (e) { assert('no headers → 403', false, (e as {message?: unknown}).message); }

  // 2. Forged foreign Referer with substring → must be 403 (the bug)
  try {
    const { status } = await probe('GET', '/api/check-url?url=https://example.com', {
      'Referer': `https://evil.example/?next=http://${HOST}:${PORT}/`,
    });
    assert('forged Referer substring → 403', status === 403, `got ${status} (substring bypass present)`);
  } catch (e) { assert('forged Referer substring → 403', false, (e as {message?: unknown}).message); }

  // 3. Forged foreign Origin with substring → must be 403
  try {
    const { status } = await probe('GET', '/api/check-url?url=https://example.com', {
      'Origin': `https://evil.example.${HOST}:${PORT}.attacker.io`,
    });
    assert('forged Origin substring → 403', status === 403, `got ${status}`);
  } catch (e) { assert('forged Origin substring → 403', false, (e as {message?: unknown}).message); }

  // 4. Legitimate Origin → 200 (request reaches handler; upstream may fail but guard passed)
  try {
    const { status } = await probe('GET', '/api/check-url?url=https://example.com', {
      'Origin': `http://${HOST}:${PORT}`,
    });
    assert('legitimate Origin → not 403', status !== 403, `got ${status}`);
  } catch (e) { assert('legitimate Origin → not 403', false, (e as {message?: unknown}).message); }

  // 5. Legitimate Referer → 200 (same)
  try {
    const { status } = await probe('GET', '/api/check-url?url=https://example.com', {
      'Referer': `http://${HOST}:${PORT}/app`,
    });
    assert('legitimate Referer → not 403', status !== 403, `got ${status}`);
  } catch (e) { assert('legitimate Referer → not 403', false, (e as {message?: unknown}).message); }

  // 6. Localhost Origin → 200
  try {
    const { status } = await probe('GET', '/api/check-url?url=https://example.com', {
      'Origin': `http://localhost:${PORT}`,
    });
    assert('localhost Origin → not 403', status !== 403, `got ${status}`);
  } catch (e) { assert('localhost Origin → not 403', false, (e as {message?: unknown}).message); }

  // 6b. IPv6 loopback Origin → 200
  try {
    const { status } = await probe('GET', '/api/check-url?url=https://example.com', {
      'Origin': `http://[::1]:${PORT}`,
    });
    assert('IPv6 [::1] Origin → not 403', status !== 403, `got ${status}`);
  } catch (e) { assert('IPv6 [::1] Origin → not 403', false, (e as {message?: unknown}).message); }

  // 6c. Lookalike origin with valid prefix but extra suffix → 403
  try {
    const { status } = await probe('GET', '/api/check-url?url=https://example.com', {
      'Origin': `http://localhost:${PORT}.evil.example`,
    });
    assert('lookalike "localhost:PORT.evil" Origin → 403', status === 403, `got ${status}`);
  } catch (e) { assert('lookalike "localhost:PORT.evil" Origin → 403', false, (e as {message?: unknown}).message); }

  // 6d. Malformed Referer → URL parse throws → 403
  try {
    const { status } = await probe('GET', '/api/check-url?url=https://example.com', {
      'Referer': 'not a valid url',
    });
    assert('malformed Referer → 403', status === 403, `got ${status}`);
  } catch (e) { assert('malformed Referer → 403', false, (e as {message?: unknown}).message); }

  // 7. Source inspection — substring check is gone, parsing is in
  const src = fs.readFileSync(path.join(__dirname, '..', 'dev-server.js'), 'utf8');
  assert('isSameOrigin no longer uses .includes() for origin', !/origin\.includes\(`localhost:/.test(src));
  assert('isSameOrigin parses Referer via new URL().origin', /new URL\(req\.headers\.referer\)\.origin/.test(src));
  assert('ALLOWED_ORIGINS Set defined', /ALLOWED_ORIGINS = new Set/.test(src));
  // Guard must cover /proxy too — this was missed in the original #119 fix and
  // re-reported by Robert as an SSRF bypass via the legacy /proxy route. The
  // behavior test below is the real check; this catches silent regressions
  // even if the server happens to be down when tests run.
  assert('same-origin guard covers /proxy at route level',
    /\/api\/.*\|\|.*pathname\s*===\s*['"]\/proxy['"]|pathname\s*===\s*['"]\/proxy['"].*\|\|.*\/api\//.test(src) &&
    /!isSameOrigin\(req\)/.test(src));

  // ─── /proxy SSRF guard (#119 follow-up) ───
  // Legacy GET /proxy?url=... was unguarded. Without the fix, an evil tab could
  // cross-origin fetch /proxy?url=http://192.168.1.1/admin and read the
  // response (Access-Control-Allow-Origin: *). The exact-origin guard must
  // reject foreign/forged headers here too.

  // 8. No headers on /proxy → 403
  try {
    const { status } = await probe('GET', '/proxy?url=http://example.com', {});
    assert('/proxy no headers → 403', status === 403, `got ${status}`);
  } catch (e) { assert('/proxy no headers → 403', false, (e as {message?: unknown}).message); }

  // 9. Forged foreign Origin containing local URL → 403 (the original repro)
  try {
    const { status } = await probe('GET', '/proxy?url=http://example.com', {
      'Origin': 'https://evil.example',
    });
    assert('/proxy forged foreign Origin → 403', status === 403, `got ${status} (SSRF bypass present)`);
  } catch (e) { assert('/proxy forged foreign Origin → 403', false, (e as {message?: unknown}).message); }

  // 10. Forged foreign Referer with substring → 403
  try {
    const { status } = await probe('GET', '/proxy?url=http://example.com', {
      'Referer': `https://evil.example/?next=http://${HOST}:${PORT}/`,
    });
    assert('/proxy forged Referer substring → 403', status === 403, `got ${status}`);
  } catch (e) { assert('/proxy forged Referer substring → 403', false, (e as {message?: unknown}).message); }

  // 11. Lookalike origin → 403
  try {
    const { status } = await probe('GET', '/proxy?url=http://example.com', {
      'Origin': `http://localhost:${PORT}.evil.example`,
    });
    assert('/proxy lookalike Origin → 403', status === 403, `got ${status}`);
  } catch (e) { assert('/proxy lookalike Origin → 403', false, (e as {message?: unknown}).message); }

  // 12. Legitimate same-origin Origin → not OUR guard's 403 (handler runs).
  // Upstream (example.com behind Cloudflare) may return 403 too, but that
  // means the request went through our guard and hit upstream — which is
  // what we're testing. Distinguish by body: our guard sends "Forbidden"
  // plain text; Cloudflare sends HTML.
  try {
    const r = await probe('GET', '/proxy?url=http://example.com', {
      'Origin': `http://${HOST}:${PORT}`,
    });
    assert('/proxy legitimate Origin → not blocked by our guard',
      !isOurGuard403(r),
      `status=${r.status} body=${(r.body || '').slice(0, 60)}`);
  } catch (e) { assert('/proxy legitimate Origin → not blocked by our guard', false, (e as {message?: unknown}).message); }

  console.log(results.join('\n'));
  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
})();
