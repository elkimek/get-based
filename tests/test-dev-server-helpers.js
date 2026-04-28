#!/usr/bin/env node
// Node-side unit tests for dev-server helpers:
//   - parseEnvLocal:    quoted/unquoted values, inline comments, whitespace,
//                       malformed lines, mixed-case key rejection
//   - _proxyHostBlocked: private/loopback/link-local/metadata IP ranges, the
//                       6 live vendor hosts (must NOT be blocked), strict
//                       decimal octet parsing (no octal smuggling)
//   - _isAllowedProxyUrl: vendor-allowlist shortcuts + HTTPS-public-host fallback
//   - _resolveCatalogRepo: env-override path, symlink-to-other-repo path,
//                       refusal to push the app repo when there's no symlink
//   - _runPostDeployHooks: end-to-end Deploy button hooks (git commit + push
//                       in catalog repo, Vercel deploy hook trigger). Each
//                       step gated on env config; downstream skipped when
//                       upstream didn't actually publish.
//
// These were extracted as exports so tests can import them without spinning
// up the HTTP server (the server-side SSRF guard would be end-to-end work).

import { parseEnvLocal, _proxyHostBlocked, _isAllowedProxyUrl, _resolveCatalogRepo, _runPostDeployHooks, collectWearableOverrides, WEARABLE_CLIENT_ID_VARS } from '../dev-server.js';

let passed = 0, failed = 0;
function assert(name, cond, detail) {
  if (cond) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\n── parseEnvLocal ──');

// Basic key=value
{
  const p = parseEnvLocal('FOO=bar\nBAZ=qux');
  assert('parses two unquoted values', p.FOO === 'bar' && p.BAZ === 'qux');
}

// Double-quoted values stripped
{
  const p = parseEnvLocal('TOKEN="abc def"');
  assert('strips double quotes', p.TOKEN === 'abc def', JSON.stringify(p));
}

// Single-quoted values stripped
{
  const p = parseEnvLocal("SECRET='hello world'");
  assert('strips single quotes', p.SECRET === 'hello world');
}

// Full-line comment ignored
{
  const p = parseEnvLocal('# this is a comment\nFOO=bar');
  assert('ignores # comment lines', !('comment' in p) && p.FOO === 'bar');
}

// Leading whitespace on comment
{
  const p = parseEnvLocal('   # indented comment\nFOO=bar');
  assert('ignores indented # comment', p.FOO === 'bar' && Object.keys(p).length === 1);
}

// Whitespace around = tolerated
{
  const p = parseEnvLocal('FOO = bar\nBAZ=qux\nSPACED  =  value');
  assert('tolerates whitespace around =', p.FOO === 'bar' && p.SPACED === 'value');
}

// Trailing whitespace on value stripped
{
  const p = parseEnvLocal('FOO=bar   ');
  assert('strips trailing whitespace on value', p.FOO === 'bar', JSON.stringify(p.FOO));
}

// Empty value
{
  const p = parseEnvLocal('EMPTY=\nFOO=bar');
  assert('handles empty value', p.EMPTY === '' && p.FOO === 'bar');
}

// Equal sign inside value (after first =)
{
  const p = parseEnvLocal('URL=https://example.com/?a=1&b=2');
  assert('preserves = inside value', p.URL === 'https://example.com/?a=1&b=2');
}

// Malformed lines ignored (no =)
{
  const p = parseEnvLocal('NOT_AN_ASSIGNMENT\nFOO=bar\nalso bad');
  assert('ignores malformed lines', Object.keys(p).length === 1 && p.FOO === 'bar');
}

// Lowercase keys rejected (enforce uppercase-only convention)
{
  const p = parseEnvLocal('lowercase=no\nFOO=yes');
  assert('rejects lowercase keys', !('lowercase' in p) && p.FOO === 'yes');
}

// Numeric-leading keys rejected
{
  const p = parseEnvLocal('9ABC=no\nFOO=yes');
  assert('rejects numeric-leading keys', !('9ABC' in p) && p.FOO === 'yes');
}

// Underscore-leading key allowed
{
  const p = parseEnvLocal('_INTERNAL=value');
  assert('allows underscore-leading key', p._INTERNAL === 'value');
}

// Mixed: comment + blank + value
{
  const p = parseEnvLocal('# comment\n\n  \nFOO=bar\n\n# another\nBAZ=qux');
  assert('handles blank lines + comments', p.FOO === 'bar' && p.BAZ === 'qux' && Object.keys(p).length === 2);
}

// Realistic OAuth secrets
{
  const p = parseEnvLocal(
    '# getbased local OAuth secrets — DO NOT COMMIT\n' +
    'OURA_CLIENT_SECRET="S3cr3tVal"\n' +
    'WITHINGS_CLIENT_SECRET=unquoted-value-with-dashes\n' +
    'ULTRAHUMAN_CLIENT_SECRET=\'single-quoted\'\n'
  );
  assert('real-world .env.local round-trips',
    p.OURA_CLIENT_SECRET === 'S3cr3tVal' &&
    p.WITHINGS_CLIENT_SECRET === 'unquoted-value-with-dashes' &&
    p.ULTRAHUMAN_CLIENT_SECRET === 'single-quoted',
    JSON.stringify(p));
}

console.log('\n── _proxyHostBlocked ──');

// Loopback / localhost
assert('blocks localhost',     _proxyHostBlocked('localhost'));
assert('blocks 127.0.0.1',     _proxyHostBlocked('127.0.0.1'));
assert('blocks ::1',           _proxyHostBlocked('::1'));
assert('blocks [::1]',         _proxyHostBlocked('[::1]'));
assert('blocks .local TLD',    _proxyHostBlocked('server.local'));
assert('blocks .localhost',    _proxyHostBlocked('foo.localhost'));
assert('blocks 127/8 edges',   _proxyHostBlocked('127.255.255.254') && _proxyHostBlocked('127.0.0.42'));

// Private RFC1918
assert('blocks 10.0.0.0/8',     _proxyHostBlocked('10.0.0.1') && _proxyHostBlocked('10.255.255.254'));
assert('blocks 172.16.0.0/12',  _proxyHostBlocked('172.16.0.1') && _proxyHostBlocked('172.31.255.254'));
assert('allows 172.15/172.32',  !_proxyHostBlocked('172.15.0.1') && !_proxyHostBlocked('172.32.0.1'));
assert('blocks 192.168.0.0/16', _proxyHostBlocked('192.168.1.1'));

// Link-local + AWS/GCP metadata
assert('blocks 169.254.0.0/16', _proxyHostBlocked('169.254.169.254'));
assert('blocks Azure metadata', _proxyHostBlocked('168.63.129.16'));

// CGNAT
assert('blocks 100.64.0.0/10',  _proxyHostBlocked('100.64.0.1') && _proxyHostBlocked('100.127.255.254'));
assert('allows 100.63 / 100.128', !_proxyHostBlocked('100.63.0.1') && !_proxyHostBlocked('100.128.0.1'));

// 0.0.0.0/8
assert('blocks 0.0.0.0/8', _proxyHostBlocked('0.0.0.0') && _proxyHostBlocked('0.42.42.42'));

// Octal smuggling — leading zeros should be rejected
assert('blocks leading-zero octets', _proxyHostBlocked('010.0.0.1'));
assert('blocks leading-zero octets mid-IP', _proxyHostBlocked('8.8.08.8'));

// Out-of-range octet — defensive stance: invalid-IP literals are blocked
// rather than passed through. Fine because new URL() would reject them too.
assert('blocks out-of-range IPv4 literals', _proxyHostBlocked('999.999.999.999'));
assert('blocks single-octet-overflow', _proxyHostBlocked('256.0.0.1'));

// Empty host blocked
assert('blocks empty host', _proxyHostBlocked(''));

// All 6 live vendor hosts MUST be allowed (regression guard: never block prod)
const VENDOR_HOSTS = [
  'api.ouraring.com',
  'api.prod.whoop.com',
  'partner.ultrahuman.com',
  'wbsapi.withings.net',
  'api.fitbit.com',
  'www.polaraccesslink.com',
  'polarremote.com',
  // apple_health is file-import, no host
  'openrouter.ai',
  'api.venice.ai',
  'api.routstr.com',
  'api.ppq.ai',
];
for (const host of VENDOR_HOSTS) {
  assert(`allows vendor host ${host}`, !_proxyHostBlocked(host));
}

console.log('\n── _isAllowedProxyUrl ──');

assert('allows openrouter allowlist',  _isAllowedProxyUrl('https://openrouter.ai/api/v1/chat/completions'));
assert('allows oura allowlist',        _isAllowedProxyUrl('https://api.ouraring.com/v2/usercollection/sleep'));
assert('allows withings allowlist',    _isAllowedProxyUrl('https://wbsapi.withings.net/measure'));
assert('allows fitbit allowlist',      _isAllowedProxyUrl('https://api.fitbit.com/1/user/-/profile.json'));
assert('allows whoop allowlist',       _isAllowedProxyUrl('https://api.prod.whoop.com/developer/v1/recovery'));
assert('allows ultrahuman allowlist',  _isAllowedProxyUrl('https://partner.ultrahuman.com/api/partners/v1/user_data/metrics'));
assert('allows polar accesslink',      _isAllowedProxyUrl('https://www.polaraccesslink.com/v3/users/123/activity-transactions'));
assert('allows polar token endpoint',  _isAllowedProxyUrl('https://polarremote.com/v2/oauth2/token'));

assert('allows custom HTTPS public host', _isAllowedProxyUrl('https://api.example.com/v1/chat'));
assert('blocks HTTP (no TLS)',         !_isAllowedProxyUrl('http://api.example.com/v1/chat'));
assert('blocks loopback',              !_isAllowedProxyUrl('https://localhost/admin'));
assert('blocks private IP',            !_isAllowedProxyUrl('https://192.168.1.1/admin'));
assert('blocks cloud metadata',        !_isAllowedProxyUrl('https://169.254.169.254/latest/meta-data/'));
assert('blocks .local',                !_isAllowedProxyUrl('https://box.local/admin'));
assert('blocks malformed URL',         !_isAllowedProxyUrl('not a url'));

// ── _resolveCatalogRepo ──
console.log('\n── _resolveCatalogRepo ──');

// Helper: build a fake execFile that resolves git rev-parse --show-toplevel
// by lookup table, rejecting unknown cwds.
function fakeExecFile(table) {
  return function(cmd, args, opts, cb) {
    const cwdIdx = args.indexOf('-C');
    const cwd = cwdIdx >= 0 ? args[cwdIdx + 1] : null;
    const sub = args.slice(cwdIdx + 2);
    const key = cwd + ' ' + sub.join(' ');
    const handler = table[key];
    if (!handler) return cb(new Error('exec not stubbed: ' + key));
    if (handler instanceof Error) return cb(handler);
    cb(null, handler + '\n', '');
  };
}
function fakeFs(realpathTable) {
  return {
    realpathSync(p) {
      if (p in realpathTable) return realpathTable[p];
      return p;
    },
  };
}

// 1. CATALOG_GIT_REPO override resolves correctly when file is inside it
{
  const result = await _resolveCatalogRepo('/links/cat.json', {
    envRepo: '/repos/tools',
    appRoot: '/app',
    fs: fakeFs({ '/links/cat.json': '/repos/tools/data/cat.json' }),
    execFile: fakeExecFile({ '/repos/tools rev-parse --show-toplevel': '/repos/tools' }),
  });
  assert('override resolves to repo + relative path',
    result?.repoRoot === '/repos/tools' && result?.relPath === 'data/cat.json',
    JSON.stringify(result));
}

// 2. CATALOG_GIT_REPO override rejected when file lives outside that repo
{
  const result = await _resolveCatalogRepo('/elsewhere/cat.json', {
    envRepo: '/repos/tools',
    appRoot: '/app',
    fs: fakeFs({ '/elsewhere/cat.json': '/elsewhere/cat.json' }),
    execFile: fakeExecFile({ '/repos/tools rev-parse --show-toplevel': '/repos/tools' }),
  });
  assert('override rejected when file outside repo', result === null,
    'expected null, got ' + JSON.stringify(result));
}

// 3. No override + file is symlinked into a different repo → resolves via realpath
{
  const result = await _resolveCatalogRepo('/app/data/cat.json', {
    appRoot: '/app',
    fs: fakeFs({
      '/app/data/cat.json': '/repos/tools/data/cat.json',
      '/app': '/app',
    }),
    execFile: fakeExecFile({ '/repos/tools/data rev-parse --show-toplevel': '/repos/tools' }),
  });
  assert('resolves via symlink → other repo',
    result?.repoRoot === '/repos/tools' && result?.relPath === 'data/cat.json',
    JSON.stringify(result));
}

// 4. No override + no symlink (file lives inside Lab Charts) → null
//    (we don't want to auto-push the app repo on every catalog edit)
{
  const result = await _resolveCatalogRepo('/app/data/cat.json', {
    appRoot: '/app',
    fs: fakeFs({
      '/app/data/cat.json': '/app/data/cat.json',
      '/app': '/app',
    }),
    execFile: fakeExecFile({}),  // never queried
  });
  assert('no symlink → null (refuses to push app repo)', result === null,
    'expected null, got ' + JSON.stringify(result));
}

// 5. Git not available / not a repo → null
{
  const result = await _resolveCatalogRepo('/app/data/cat.json', {
    appRoot: '/app',
    fs: fakeFs({
      '/app/data/cat.json': '/random/cat.json',
      '/app': '/app',
    }),
    execFile: fakeExecFile({}),  // unstubbed → throws
  });
  assert('git unavailable → null', result === null,
    'expected null, got ' + JSON.stringify(result));
}

// ── _runPostDeployHooks ──
console.log('\n── _runPostDeployHooks ──');

function gitTable(opts = {}) {
  // Default: clean execFile that handles every step of a successful push.
  return {
    '/repos/tools rev-parse --show-toplevel': '/repos/tools',
    '/repos/tools add -- data/cat.json': '',
    '/repos/tools diff --cached --quiet -- data/cat.json': new Error(Object.assign(new Error('diff'), { code: 1 })),
    '/repos/tools commit -m catalog: deploy from editor -- data/cat.json': '',
    '/repos/tools rev-parse HEAD': 'abc123def4567890',
    '/repos/tools push origin HEAD': '',
    ...opts,
  };
}

// 6. Both hooks skipped when no env config + file is in app repo
{
  const out = await _runPostDeployHooks('/app/data/cat.json', {
    env: {},
    execFile: fakeExecFile({}),
    fetch: async () => { throw new Error('should not fetch'); },
  });
  // _resolveCatalogRepo returns null here (no override, no symlink)
  // → git skipped. Vercel skipped because no URL.
  assert('no env → both hooks skipped',
    out.git?.skipped === true && out.vercel?.skipped === true,
    JSON.stringify(out));
}

// 7. Successful git push + Vercel trigger
{
  // diff --cached --quiet exits non-zero when there ARE staged changes
  const exec = function(cmd, args, opts, cb) {
    const key = args.slice(args.indexOf('-C') + 2).join(' ');
    if (key === 'rev-parse --show-toplevel') return cb(null, '/repos/tools\n', '');
    if (key === 'add -- data/cat.json') return cb(null, '', '');
    if (key === 'diff --cached --quiet -- data/cat.json') {
      // simulate "has staged changes" — git exits 1
      const e = new Error('diff'); e.code = 1; return cb(e, '', '');
    }
    if (key === 'commit -m catalog: deploy from editor -- data/cat.json') return cb(null, '', '');
    if (key === 'rev-parse HEAD') return cb(null, 'abc123def4567890\n', '');
    if (key === 'push origin HEAD') return cb(null, '', '');
    cb(new Error('unstubbed: ' + key));
  };
  const fetchCalls = [];
  const fakeFetch = async (url, init) => {
    fetchCalls.push({ url, method: init?.method });
    return { ok: true, status: 200, async json() { return { job: { id: 'dep_xyz' } }; } };
  };
  const out = await _runPostDeployHooks('/app/data/cat.json', {
    env: {
      CATALOG_GIT_REPO: '/repos/tools',
      VERCEL_DEPLOY_HOOK_URL: 'https://api.vercel.com/v1/integrations/deploy/abc',
    },
    appRoot: '/app',
    fs: fakeFs({ '/app/data/cat.json': '/repos/tools/data/cat.json' }),
    execFile: exec,
    fetch: fakeFetch,
  });
  assert('successful path: git committed + pushed',
    out.git?.committed === true && out.git?.pushed === true && out.git?.sha === 'abc123def4567890',
    JSON.stringify(out.git));
  assert('successful path: Vercel triggered with jobId',
    out.vercel?.triggered === true && out.vercel?.jobId === 'dep_xyz',
    JSON.stringify(out.vercel));
  assert('Vercel hook called with POST', fetchCalls.length === 1 && fetchCalls[0].method === 'POST',
    JSON.stringify(fetchCalls));
}

// 8. No staged changes → idempotent skip (no commit, no push, but valid sha)
{
  const exec = function(cmd, args, opts, cb) {
    const key = args.slice(args.indexOf('-C') + 2).join(' ');
    if (key === 'rev-parse --show-toplevel') return cb(null, '/repos/tools\n', '');
    if (key === 'add -- data/cat.json') return cb(null, '', '');
    if (key === 'diff --cached --quiet -- data/cat.json') return cb(null, '', '');  // exit 0 = no changes
    if (key === 'rev-parse HEAD') return cb(null, 'oldsha1234567890\n', '');
    cb(new Error('should not have run: ' + key));
  };
  const out = await _runPostDeployHooks('/app/data/cat.json', {
    env: {
      CATALOG_GIT_REPO: '/repos/tools',
      VERCEL_DEPLOY_HOOK_URL: 'https://api.vercel.com/v1/integrations/deploy/abc',
    },
    appRoot: '/app',
    fs: fakeFs({ '/app/data/cat.json': '/repos/tools/data/cat.json' }),
    execFile: exec,
    fetch: async () => { throw new Error('should not fetch — git was a no-op'); },
  });
  assert('no diff → no commit, no push, sha returned',
    out.git?.committed === false && out.git?.pushed === false && out.git?.sha === 'oldsha1234567890',
    JSON.stringify(out.git));
  assert('no diff → Vercel skipped (would rebuild stale)',
    out.vercel?.skipped === true,
    JSON.stringify(out.vercel));
}

// 9. Push fails → committed=true but pushed=false, error surfaced
{
  const exec = function(cmd, args, opts, cb) {
    const key = args.slice(args.indexOf('-C') + 2).join(' ');
    if (key === 'rev-parse --show-toplevel') return cb(null, '/repos/tools\n', '');
    if (key === 'add -- data/cat.json') return cb(null, '', '');
    if (key === 'diff --cached --quiet -- data/cat.json') {
      const e = new Error('diff'); e.code = 1; return cb(e, '', '');
    }
    if (key === 'commit -m catalog: deploy from editor -- data/cat.json') return cb(null, '', '');
    if (key === 'rev-parse HEAD') return cb(null, 'newsha1234567890\n', '');
    if (key === 'push origin HEAD') return cb(Object.assign(new Error('push'), { code: 1 }), '', 'fatal: protected branch');
    cb(new Error('unstubbed: ' + key));
  };
  const out = await _runPostDeployHooks('/app/data/cat.json', {
    env: {
      CATALOG_GIT_REPO: '/repos/tools',
      VERCEL_DEPLOY_HOOK_URL: 'https://api.vercel.com/v1/integrations/deploy/abc',
    },
    appRoot: '/app',
    fs: fakeFs({ '/app/data/cat.json': '/repos/tools/data/cat.json' }),
    execFile: exec,
    fetch: async () => { throw new Error('should not fetch — git push failed'); },
  });
  assert('push failure: committed but not pushed, error surfaced',
    out.git?.committed === true && out.git?.pushed === false && /protected branch/.test(out.git?.error || ''),
    JSON.stringify(out.git));
  assert('push failure: Vercel skipped (catalog not on origin)',
    out.vercel?.skipped === true,
    JSON.stringify(out.vercel));
}

// 10. Vercel hook URL rejected when not a Vercel deploy hook (paranoia)
{
  const exec = function(cmd, args, opts, cb) {
    const key = args.slice(args.indexOf('-C') + 2).join(' ');
    if (key === 'rev-parse --show-toplevel') return cb(null, '/repos/tools\n', '');
    if (key === 'add -- data/cat.json') return cb(null, '', '');
    if (key === 'diff --cached --quiet -- data/cat.json') {
      const e = new Error('diff'); e.code = 1; return cb(e, '', '');
    }
    if (key === 'commit -m catalog: deploy from editor -- data/cat.json') return cb(null, '', '');
    if (key === 'rev-parse HEAD') return cb(null, 'abc123def4567890\n', '');
    if (key === 'push origin HEAD') return cb(null, '', '');
    cb(new Error('unstubbed: ' + key));
  };
  const out = await _runPostDeployHooks('/app/data/cat.json', {
    env: {
      CATALOG_GIT_REPO: '/repos/tools',
      VERCEL_DEPLOY_HOOK_URL: 'https://evil.example.com/steal',
    },
    execFile: exec,
    fetch: async () => { throw new Error('should not fetch — URL rejected'); },
  });
  assert('non-Vercel URL rejected before fetch',
    out.vercel?.skipped === true && /does not look like a Vercel/.test(out.vercel?.reason || ''),
    JSON.stringify(out.vercel));
}

console.log('\n── collectWearableOverrides (issue #145) ──');

// Empty / missing env → empty overrides map
{
  assert('empty env yields empty overrides', JSON.stringify(collectWearableOverrides({})) === '{}');
  assert('null env yields empty overrides', JSON.stringify(collectWearableOverrides(null)) === '{}');
  assert('non-object env yields empty overrides', JSON.stringify(collectWearableOverrides('nope')) === '{}');
}

// Single override picked up, others skipped
{
  const out = collectWearableOverrides({ OURA_CLIENT_ID: 'oura-self-123' });
  assert('single override surfaces under adapter id', out.oura === 'oura-self-123');
  assert('absent vars do not appear in overrides', !('withings' in out) && !('whoop' in out));
}

// Whitespace handling — empty/whitespace dropped, real values trimmed
{
  const out = collectWearableOverrides({
    OURA_CLIENT_ID: '   ',
    WITHINGS_CLIENT_ID: '',
    POLAR_CLIENT_ID: '  polar-self-xyz  ',
  });
  assert('whitespace-only override is dropped', !('oura' in out));
  assert('empty-string override is dropped', !('withings' in out));
  assert('override values are trimmed', out.polar === 'polar-self-xyz');
}

// Non-string values rejected
{
  const out = collectWearableOverrides({ FITBIT_CLIENT_ID: 12345, WHOOP_CLIENT_ID: { foo: 'bar' } });
  assert('non-string env value is dropped', !('fitbit' in out) && !('whoop' in out));
}

// All six adapters covered — guards against typo regressions
{
  const env = {
    OURA_CLIENT_ID: 'a', WITHINGS_CLIENT_ID: 'b', ULTRAHUMAN_CLIENT_ID: 'c',
    POLAR_CLIENT_ID: 'd', WHOOP_CLIENT_ID: 'e', FITBIT_CLIENT_ID: 'f',
  };
  const out = collectWearableOverrides(env);
  const ids = Object.keys(out).sort();
  assert('all six adapters mapped', ids.join(',') === 'fitbit,oura,polar,ultrahuman,whoop,withings');
}

// Var/adapter pairing matches what api/proxy.js mirrors
{
  const expected = ['OURA_CLIENT_ID', 'WITHINGS_CLIENT_ID', 'ULTRAHUMAN_CLIENT_ID',
    'POLAR_CLIENT_ID', 'WHOOP_CLIENT_ID', 'FITBIT_CLIENT_ID'].sort();
  const got = WEARABLE_CLIENT_ID_VARS.map(([k]) => k).sort();
  assert('WEARABLE_CLIENT_ID_VARS exposes the same six env vars', JSON.stringify(got) === JSON.stringify(expected));
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed === 0 ? 0 : 1);
