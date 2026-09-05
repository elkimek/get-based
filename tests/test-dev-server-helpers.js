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
//   - _isValidCatalogShape: deploy-catalog shape parity with fetch-catalog
//   - _runPostDeployHooks: end-to-end Deploy button hooks (git commit + push
//                       in catalog repo, Vercel deploy hook trigger). Each
//                       step gated on env config; downstream skipped when
//                       upstream didn't actually publish.
//
// These were extracted as exports so tests can import them without spinning
// up the HTTP server (the server-side SSRF guard would be end-to-end work).

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  parseEnvLocal,
  _proxyHostBlocked,
  _isAllowedProxyUrl,
  _resolveCatalogRepo,
  _runPostDeployHooks,
  collectWearableConfigured,
  collectWearableOverrides,
  WEARABLE_CLIENT_ID_VARS,
  DEFAULT_UVDATA_UPSTREAM,
  isSameOrigin,
  _isValidCatalogShape,
  _isLoopbackSocket,
  _isPrivateApiPeerAllowed,
  _isHostOriginMatch,
  corsHeaders,
  _browserLaunchDisabled,
  _browserLaunchCandidates,
  openDevBrowser,
  _sendProfileShareJSON,
  _sendCappedProxyResponse,
  _validateProfileShareEnvelope,
  _handleProfileShareDev,
} from '../dev-server.js';
import {
  PROXY_MAX_RESPONSE_BYTES,
  normalizeProxyMethod,
  sanitizeProxyHeaders,
} from '../lib/proxy-policy.js';
import {
  classifyDevProxyOperation,
  handleDevApiProxy,
} from '../lib/dev-api-proxy.js';

let passed = 0, failed = 0;
for (const peer of ['192.168.1.10', '10.0.0.5', '::ffff:192.168.1.10', '']) {
  const request = { socket: { remoteAddress: peer }, headers: { origin: 'http://localhost:8000', host: 'localhost:8000' } };
  if (_isPrivateApiPeerAllowed(request, '/api/local-agents')) throw new Error('LAN discovery credential leak');
}
if (!_isPrivateApiPeerAllowed({ socket: { remoteAddress: '127.0.0.1' } }, '/api/local-agents')) throw new Error('Loopback discovery blocked');
const DEV_SERVER_PORT = parseInt(process.argv[2], 10) || 8000;
const LOOPBACK_ORIGIN = `http://127.0.0.1:${DEV_SERVER_PORT}`;
const LOCALHOST_ORIGIN = `http://localhost:${DEV_SERVER_PORT}`;
function assert(name, cond, detail) {
  if (cond) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}
function assertThrows(name, fn, pattern) {
  try {
    fn();
    assert(name, false, 'expected throw');
  } catch (err) {
    const message = String(err?.message || err);
    assert(name, pattern ? pattern.test(message) : true, message);
  }
}
function makeMockResponse() {
  return {
    status: null,
    headers: null,
    chunks: [],
    headersSent: false,
    ended: false,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
      this.headersSent = true;
    },
    end(chunk = '') {
      if (chunk) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      this.ended = true;
    },
    text() {
      return Buffer.concat(this.chunks).toString();
    },
  };
}
function makeMockRequest(origin = LOOPBACK_ORIGIN) {
  return { headers: { origin } };
}

console.log('\n── parseEnvLocal ──');

assert('CAMS dev proxy recognizes the fixed upstream without selecting it implicitly',
  DEFAULT_UVDATA_UPSTREAM === 'https://uvdata.getbased.health');

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

console.log('\n── _isValidCatalogShape ──');

assert('catalog shape requires slots and products',
  _isValidCatalogShape({ slots: {}, products: {} }));
assert('catalog shape does not require legacy shops key',
  _isValidCatalogShape({ slots: {}, products: {}, vendors: {} }));
assert('catalog shape rejects missing products',
  !_isValidCatalogShape({ slots: {}, shops: [] }));
assert('catalog shape rejects arrays and null',
  !_isValidCatalogShape([]) && !_isValidCatalogShape(null));

console.log('\n── _proxyHostBlocked ──');

// Loopback / localhost
assert('blocks localhost',     _proxyHostBlocked('localhost'));
assert('blocks 127.0.0.1',     _proxyHostBlocked('127.0.0.1'));
assert('blocks ::1',           _proxyHostBlocked('::1'));
assert('blocks [::1]',         _proxyHostBlocked('[::1]'));
assert('blocks .local TLD',    _proxyHostBlocked('server.local'));
assert('blocks .localhost',    _proxyHostBlocked('foo.localhost'));
assert('blocks 127/8 edges',   _proxyHostBlocked('127.255.255.254') && _proxyHostBlocked('127.0.0.42'));
assert('blocks compressed IPv4-mapped private IPv6',
  _proxyHostBlocked('::ffff:c0a8:101') && _proxyHostBlocked('::ffff:ac10:1'));
assert('blocks 6to4 private IPv4 embeddings',
  _proxyHostBlocked('2002:c0a8:0101::1') && _proxyHostBlocked('2002:0a00:0001::1'));

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

// All live vendor hosts MUST be allowed (regression guard: never block prod)
const VENDOR_HOSTS = [
  'api.ouraring.com',
  'api.prod.whoop.com',
  'partner.ultrahuman.com',
  'wbsapi.withings.net',
  'api.fitbit.com',
  'www.polaraccesslink.com',
  'polarremote.com',
  'health.googleapis.com',
  'oauth2.googleapis.com',
  // apple_health is file-import, no host
  'openrouter.ai',
  'api.venice.ai',
  'nras.attestation.nvidia.com',
  'api.routstr.com',
  'api.ppq.ai',
];
for (const host of VENDOR_HOSTS) {
  assert(`allows vendor host ${host}`, !_proxyHostBlocked(host));
}

console.log('\n── _isAllowedProxyUrl ──');

assert('allows openrouter allowlist',  _isAllowedProxyUrl('https://openrouter.ai/api/v1/chat/completions'));
assert('allows NVIDIA NRAS GPU endpoint', _isAllowedProxyUrl('https://nras.attestation.nvidia.com/v3/attest/gpu'));
assert('allows oura allowlist',        _isAllowedProxyUrl('https://api.ouraring.com/v2/usercollection/sleep'));
assert('allows withings allowlist',    _isAllowedProxyUrl('https://wbsapi.withings.net/measure'));
assert('allows fitbit allowlist',      _isAllowedProxyUrl('https://api.fitbit.com/1/user/-/profile.json'));
assert('allows whoop allowlist',       _isAllowedProxyUrl('https://api.prod.whoop.com/developer/v1/recovery'));
assert('allows ultrahuman allowlist',  _isAllowedProxyUrl('https://partner.ultrahuman.com/api/partners/v1/user_data/metrics'));
assert('allows polar accesslink',      _isAllowedProxyUrl('https://www.polaraccesslink.com/v3/users/123/activity-transactions'));
assert('allows polar token endpoint',  _isAllowedProxyUrl('https://polarremote.com/v2/oauth2/token'));
assert('allows Google Health API',      _isAllowedProxyUrl('https://health.googleapis.com/v4/users/me/identity'));
assert('allows Google token endpoint',  _isAllowedProxyUrl('https://oauth2.googleapis.com/token'));

assert('allows custom HTTPS public host', _isAllowedProxyUrl('https://api.example.com/v1/chat'));
assert('blocks HTTP (no TLS)',         !_isAllowedProxyUrl('http://api.example.com/v1/chat'));
assert('blocks loopback',              !_isAllowedProxyUrl('https://localhost/admin'));
assert('blocks private IP',            !_isAllowedProxyUrl('https://192.168.1.1/admin'));
assert('blocks compressed IPv4-mapped private IP', !_isAllowedProxyUrl('https://[::ffff:c0a8:101]/admin'));
assert('blocks 6to4 private IP',       !_isAllowedProxyUrl('https://[2002:c0a8:0101::1]/admin'));
assert('blocks cloud metadata',        !_isAllowedProxyUrl('https://169.254.169.254/latest/meta-data/'));
assert('blocks .local',                !_isAllowedProxyUrl('https://box.local/admin'));
assert('blocks internal-only host suffixes',
  !_isAllowedProxyUrl('https://metadata.google.internal/computeMetadata/v1/') &&
  !_isAllowedProxyUrl('https://router.lan/admin') &&
  !_isAllowedProxyUrl('https://service.test/private'));
assert('blocks URL userinfo',          !_isAllowedProxyUrl('https://user:secret@api.example.com/v1/chat'));
assert('blocks malformed URL',         !_isAllowedProxyUrl('not a url'));
assert('blocks non-string URL values', !_isAllowedProxyUrl({ toString: () => 'https://api.example.com' }));

console.log('\n── shared proxy request policy ──');

assert('proxy method policy allows current app method set',
  normalizeProxyMethod('GET') === 'GET'
  && normalizeProxyMethod('post') === 'POST'
  && normalizeProxyMethod('PUT') === 'PUT');
assert('proxy method policy rejects unused tunnel methods',
  normalizeProxyMethod('DELETE') === null
  && normalizeProxyMethod('PATCH') === null);
{
  const sanitized = sanitizeProxyHeaders({
    Authorization: 'Bearer token',
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-api-key': 'custom-key',
  });
  assert('proxy header policy preserves allowed API headers',
    sanitized.ok
      && sanitized.headers.Authorization === 'Bearer token'
      && sanitized.headers.Accept === 'application/json'
      && sanitized.headers['Content-Type'] === 'application/json'
      && sanitized.headers['x-api-key'] === 'custom-key',
    JSON.stringify(sanitized));
}
assert('proxy header policy rejects hop-by-hop headers',
  sanitizeProxyHeaders({ Host: 'metadata.google.internal' }).ok === false
  && sanitizeProxyHeaders({ 'X-Forwarded-Host': 'metadata.google.internal' }).ok === false);
assert('proxy header policy rejects CRLF header injection',
  sanitizeProxyHeaders({ Authorization: 'Bearer ok\r\nX-Bad: yes' }).ok === false);
assert('dev proxy operation classifier accepts one fixed operation',
  classifyDevProxyOperation({ oura_token_exchange: { code: 'code' } }).operation === 'oura-exchange'
    && classifyDevProxyOperation({ whoop_token_exchange: { code: 'code' } }).operation === 'whoop-exchange'
    && classifyDevProxyOperation({ google_health_token_refresh: { refresh_token: 'token' } }).operation === 'google-health-refresh'
    && classifyDevProxyOperation({ meteo: 'postal_geocode' }).operation === 'postal-geocode'
    && classifyDevProxyOperation({ url: 'https://example.com' }).operation === 'generic');
assert('dev proxy operation classifier rejects ambiguous envelopes',
  classifyDevProxyOperation({
    wearable_runtime_config: true,
    oura_token_refresh: { refresh_token: 'token' },
  }).ok === false
    && classifyDevProxyOperation({
      withings_token_exchange: { code: 'code' },
      url: 'https://example.com',
    }).ok === false);
{
  const req = new EventEmitter();
  req.method = 'OPTIONS';
  req.headers = {};
  const res = makeMockResponse();
  const handled = handleDevApiProxy(req, res, {
    corsHeaders: () => ({ 'Access-Control-Allow-Origin': LOOPBACK_ORIGIN }),
    env: {},
  });
  assert('extracted dev proxy handles CORS preflight',
    handled === true
      && res.status === 204
      && res.headers['Access-Control-Allow-Origin'] === LOOPBACK_ORIGIN
      && res.ended);
}
{
  const req = new EventEmitter();
  req.method = 'POST';
  req.headers = {};
  req.destroy = () => {};
  const res = makeMockResponse();
  handleDevApiProxy(req, res, {
    corsHeaders: () => ({ 'Access-Control-Allow-Origin': LOOPBACK_ORIGIN }),
    env: { OURA_CLIENT_ID: '  self-hosted-client  ' },
  });
  req.emit('data', Buffer.from('{"wearable_runtime_config":true}'));
  req.emit('end');
  assert('extracted dev proxy serves wearable runtime overrides',
    res.status === 200
      && res.headers['Access-Control-Allow-Origin'] === LOOPBACK_ORIGIN
      && res.text() === '{"overrides":{"oura":"self-hosted-client"},"configured":{"google_health":false,"ultrahuman":false,"whoop":false}}',
    `${res.status} ${JSON.stringify(res.headers)} ${res.text()}`);
}
{
  const req = new EventEmitter();
  req.method = 'POST';
  req.headers = {};
  req.destroy = () => {};
  const res = makeMockResponse();
  handleDevApiProxy(req, res, { corsHeaders: () => ({}), env: {} });
  req.emit('data', Buffer.from('{invalid'));
  req.emit('end');
  assert('extracted dev proxy rejects malformed JSON',
    res.status === 400 && res.text().includes('Invalid JSON'));
}
{
  const req = new EventEmitter();
  req.method = 'POST';
  req.headers = {};
  req.destroy = () => {};
  const res = makeMockResponse();
  handleDevApiProxy(req, res, {
    corsHeaders: () => ({}),
    env: { UVDATA_BEARER: 'operator-token-without-upstream' },
  });
  req.emit('data', Buffer.from('{"meteo":"cams","latitude":50.1,"longitude":14.4}'));
  req.emit('end');
  assert('dev proxy never selects the Company CAMS service from a bearer alone',
    res.status === 503 && res.text().includes('CAMS relay upstream is empty'),
    `${res.status} ${res.text()}`);
}
{
  const upstream = new EventEmitter();
  upstream.headers = { 'content-type': 'text/plain' };
  upstream.statusCode = 201;
  upstream.destroy = () => {};
  const res = makeMockResponse();
  _sendCappedProxyResponse(makeMockRequest(), res, upstream);
  upstream.emit('data', Buffer.from('hello'));
  assert('dev proxy waits to send unknown-length upstream headers until body cap is known',
    res.headersSent === false && res.ended === false);
  upstream.emit('end');
  assert('dev proxy forwards complete unknown-length upstream response',
    res.status === 201
      && res.headers['Content-Type'] === 'text/plain'
      && res.headers['Access-Control-Allow-Origin'] === LOOPBACK_ORIGIN
      && res.text() === 'hello',
    `${res.status} ${JSON.stringify(res.headers)} ${res.text()}`);
}
{
  let destroyed = false;
  const upstream = new EventEmitter();
  upstream.headers = { 'content-type': 'application/json' };
  upstream.statusCode = 200;
  upstream.destroy = () => { destroyed = true; };
  const res = makeMockResponse();
  _sendCappedProxyResponse(makeMockRequest(), res, upstream);
  upstream.emit('data', Buffer.alloc(PROXY_MAX_RESPONSE_BYTES));
  assert('dev proxy does not send a partial success response at exactly the cap',
    res.headersSent === false && res.ended === false);
  upstream.emit('data', Buffer.alloc(1));
  assert('dev proxy returns explicit 502 when unknown-length upstream exceeds cap',
    res.status === 502
      && destroyed
      && res.headers['Content-Type'] === 'application/json'
      && res.text() === '{"error":"Proxy response exceeds size cap"}',
    `${res.status} ${JSON.stringify(res.headers)} ${res.text()}`);
  upstream.emit('end');
  assert('dev proxy cap failure is not overwritten by upstream end',
    res.status === 502 && res.text() === '{"error":"Proxy response exceeds size cap"}');
}

console.log('\n── origin/CORS/profile share helpers ──');

function reqWith(headers = {}, remoteAddress = '') {
  return { headers, socket: { remoteAddress } };
}

assert('isSameOrigin accepts allowed Origin',
  isSameOrigin(reqWith({ origin: LOOPBACK_ORIGIN })));
assert('isSameOrigin accepts allowed Referer origin',
  isSameOrigin(reqWith({ referer: `${LOCALHOST_ORIGIN}/app?x=1` })));
assert('isSameOrigin rejects missing headers',
  !isSameOrigin(reqWith({})));
assert('isSameOrigin rejects malformed Referer',
  !isSameOrigin(reqWith({ referer: 'not a url' })));
assert('isSameOrigin rejects foreign Origin',
  !isSameOrigin(reqWith({ origin: 'https://evil.example' })));

console.log('\n── browser launch helpers ──');

assert('browser auto-launch is disabled in CI',
  _browserLaunchDisabled({ CI: 'true' }));
assert('browser auto-launch treats CI=1 as disabled',
  _browserLaunchDisabled({ CI: '1' }));
assert('browser auto-launch allows explicit CI=false',
  !_browserLaunchDisabled({ CI: 'false' }));
assert('browser auto-launch respects OPEN_BROWSER=0',
  _browserLaunchDisabled({ OPEN_BROWSER: '0' }));
assert('browser auto-launch respects BROWSER=none',
  _browserLaunchDisabled({ BROWSER: 'none' }));
assert('Linux browser candidates prefer Google Chrome',
  _browserLaunchCandidates({}, 'linux')[0].command === 'google-chrome');
assert('macOS browser candidates fall back to default browser opener',
  _browserLaunchCandidates({}, 'darwin').some(c => c.command === 'open' && c.args.length === 0));
assert('BROWSER env overrides browser command',
  _browserLaunchCandidates({ BROWSER: 'brave-browser' }, 'linux')[0].command === 'brave-browser');
{
  const calls = [];
  const launched = openDevBrowser('http://127.0.0.1:8765', {
    env: {},
    candidates: [{ command: 'google-chrome', args: [] }],
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      return {
        once(event, callback) {
          if (event === 'spawn') callback();
          return this;
        },
        unref() { calls.push({ unref: true }); },
      };
    },
  });
  assert('openDevBrowser launches Chrome with URL and detaches',
    launched
      && calls[0]?.command === 'google-chrome'
      && calls[0]?.args?.[0] === 'http://127.0.0.1:8765'
      && calls[0]?.options?.detached === true
      && calls.some(c => c.unref === true),
    JSON.stringify(calls));
}
{
  const calls = [];
  const launched = openDevBrowser('http://127.0.0.1:8765', {
    env: {},
    candidates: [
      { command: 'bad-browser', args: [] },
      { command: 'good-browser', args: ['--new-window'] },
    ],
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      return {
        once(event, callback) {
          if (command === 'bad-browser' && event === 'spawn') callback();
          if (command === 'bad-browser' && event === 'exit') callback(1);
          if (command === 'good-browser' && event === 'spawn') callback();
          return this;
        },
        unref() { calls.push({ command, unref: true }); },
      };
    },
  });
  assert('openDevBrowser falls back after spawned opener exits non-zero',
    launched
      && calls.some(c => c.command === 'bad-browser')
      && calls.some(c => c.command === 'good-browser')
      && calls.some(c => c.command === 'good-browser' && c.unref === true),
    JSON.stringify(calls));
}
{
  const calls = [];
  const launched = openDevBrowser('http://127.0.0.1:8765', {
    env: { OPEN_BROWSER: '0' },
    candidates: [{ command: 'google-chrome', args: [] }],
    spawn: (command, args) => {
      calls.push({ command, args });
      return { once() { return this; }, unref() {} };
    },
  });
  assert('openDevBrowser does nothing when disabled',
    launched === false && calls.length === 0,
    JSON.stringify(calls));
}

assert('loopback socket helper accepts IPv4 and IPv6 loopback',
  _isLoopbackSocket(reqWith({}, '127.0.0.1')) &&
  _isLoopbackSocket(reqWith({}, '::1')) &&
  _isLoopbackSocket(reqWith({}, '::ffff:127.0.0.1')));
assert('loopback socket helper rejects LAN peers',
  !_isLoopbackSocket(reqWith({}, '192.168.1.40')));

assert('host origin match accepts http/https exact host',
  _isHostOriginMatch(reqWith({ host: 'phone.tailnet.ts.net:8000', origin: 'http://phone.tailnet.ts.net:8000' })) &&
  _isHostOriginMatch(reqWith({ host: 'phone.tailnet.ts.net:8000', origin: 'https://phone.tailnet.ts.net:8000' })));
assert('host origin match rejects missing and mismatched headers',
  !_isHostOriginMatch(reqWith({ origin: LOOPBACK_ORIGIN })) &&
  !_isHostOriginMatch(reqWith({ host: `127.0.0.1:${DEV_SERVER_PORT}`, origin: 'https://evil.example' })));

{
  const headers = corsHeaders(reqWith({ origin: LOOPBACK_ORIGIN }));
  assert('corsHeaders reflects allowed Origin',
    headers['Access-Control-Allow-Origin'] === LOOPBACK_ORIGIN && headers.Vary === 'Origin',
    JSON.stringify(headers));
}
{
  const headers = corsHeaders(reqWith({ referer: `${LOCALHOST_ORIGIN}/app` }));
  assert('corsHeaders reflects allowed Referer origin',
    headers['Access-Control-Allow-Origin'] === LOCALHOST_ORIGIN && headers.Vary === 'Origin',
    JSON.stringify(headers));
}
assert('corsHeaders omits foreign origins',
  Object.keys(corsHeaders(reqWith({ origin: 'https://evil.example' }))).length === 0);

function captureJsonResponse() {
  const out = {};
  return {
    res: {
      writeHead(status, headers) {
        out.status = status;
        out.headers = headers;
      },
      end(body) {
        out.body = body;
      },
    },
    out,
  };
}

{
  const { res, out } = captureJsonResponse();
  _sendProfileShareJSON(reqWith({ origin: LOOPBACK_ORIGIN }), res, 201, { ok: true });
  assert('profile share JSON helper writes JSON and CORS headers',
    out.status === 201 &&
    out.headers?.['Content-Type'] === 'application/json' &&
    out.headers?.['Cache-Control'] === 'no-store' &&
    out.headers?.['Access-Control-Allow-Origin'] === LOOPBACK_ORIGIN &&
    JSON.parse(out.body).ok === true,
    JSON.stringify(out));
}

function validProfileEnvelope(overrides = {}) {
  return {
    schema: 'getbased-profile-share',
    version: 1,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 100_000 },
    cipher: { name: 'AES-GCM' },
    ciphertext: 'encrypted-profile-payload',
    ...overrides,
  };
}

{
  const normalized = _validateProfileShareEnvelope(validProfileEnvelope());
  assert('valid encrypted profile envelope normalizes size and expiry',
    normalized.sizeBytes > 0 && normalized.expiresAt > Date.now(),
    JSON.stringify(normalized));
}
assertThrows('profile envelope rejects missing payload',
  () => _validateProfileShareEnvelope(null),
  /Missing encrypted profile payload/);
assertThrows('profile envelope rejects expired links',
  () => _validateProfileShareEnvelope(validProfileEnvelope({ expiresAt: new Date(Date.now() - 1000).toISOString() })),
  /future/);
assertThrows('profile envelope rejects expiry beyond 30 days',
  () => _validateProfileShareEnvelope(validProfileEnvelope({ expiresAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString() })),
  /cannot exceed 30 days/);
assertThrows('profile envelope rejects unsupported key derivation',
  () => _validateProfileShareEnvelope(validProfileEnvelope({ kdf: { name: 'scrypt', hash: 'SHA-256', iterations: 100_000 } })),
  /Unsupported key derivation/);
assertThrows('profile envelope rejects weak KDF iterations',
  () => _validateProfileShareEnvelope(validProfileEnvelope({ kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 99_999 } })),
  /PBKDF2 iterations/);
assertThrows('profile envelope rejects unsupported cipher',
  () => _validateProfileShareEnvelope(validProfileEnvelope({ cipher: { name: 'AES-CBC' } })),
  /Unsupported cipher/);
assertThrows('profile envelope rejects empty ciphertext',
  () => _validateProfileShareEnvelope(validProfileEnvelope({ ciphertext: '' })),
  /empty/);
assertThrows('profile envelope rejects oversized ciphertext',
  () => _validateProfileShareEnvelope(validProfileEnvelope({ ciphertext: 'x'.repeat(3_750_000) })),
  /too large/);

function invokeProfileShareDev(method, search = '', body, headers = {}) {
  return new Promise(resolve => {
    const req = new EventEmitter();
    req.method = method;
    req.headers = headers;
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => { req.destroyed = true; };
    const out = {};
    const res = {
      writeHead(status, responseHeaders = {}) {
        out.status = status;
        out.headers = responseHeaders;
      },
      end(responseBody = '') {
        out.body = String(responseBody);
        resolve(out);
      },
    };
    _handleProfileShareDev(req, res, new URL(`${LOCALHOST_ORIGIN}/api/share${search}`));
    if (body !== undefined) {
      req.emit('data', Buffer.from(String(body)));
    }
    if (body !== undefined || method === 'POST' || method === 'DELETE') {
      req.emit('end');
    }
  });
}

function jsonBody(out) {
  return JSON.parse(out.body || '{}');
}

{
  const out = await invokeProfileShareDev('OPTIONS');
  assert('profile share dev OPTIONS returns CORS preflight headers',
    out.status === 204 &&
    /GET, POST, DELETE, OPTIONS/.test(out.headers?.['Access-Control-Allow-Methods'] || ''),
    JSON.stringify(out));
}

{
  const out = await invokeProfileShareDev('POST', '', 'not json');
  assert('profile share dev POST rejects invalid JSON',
    out.status === 400 && jsonBody(out).error === 'Invalid JSON body.',
    JSON.stringify(out));
}

{
  const out = await invokeProfileShareDev('POST', '', 'x'.repeat(3_750_000 + 8193));
  assert('profile share dev POST rejects oversized request bodies before parsing',
    out.status === 413 && /too large/.test(jsonBody(out).error || ''),
    JSON.stringify({ status: out.status, body: out.body }));
}

{
  const out = await invokeProfileShareDev('PATCH');
  assert('profile share dev rejects unsupported methods',
    out.status === 405 && /Method not allowed/.test(jsonBody(out).error || ''),
    JSON.stringify(out));
}

{
  const id = 'coverage-share-flow-001';
  const manageToken = 'coverage-manage-token';
  const manageTokenHash = crypto.createHash('sha256').update(manageToken).digest('hex');
  const envelope = validProfileEnvelope();
  const createOut = await invokeProfileShareDev('POST', '', JSON.stringify({
    id,
    manageTokenHash,
    envelope,
  }), { origin: LOOPBACK_ORIGIN });
  const createBody = jsonBody(createOut);
  assert('profile share dev POST stores valid encrypted share',
    createOut.status === 201 &&
    createBody.id === id &&
    createBody.sizeBytes > 0 &&
    createOut.headers?.['Access-Control-Allow-Origin'] === LOOPBACK_ORIGIN,
    JSON.stringify(createOut));

  const duplicateOut = await invokeProfileShareDev('POST', '', JSON.stringify({
    id,
    manageTokenHash,
    envelope,
  }));
  assert('profile share dev POST rejects duplicate share ids',
    duplicateOut.status === 409 && /already exists/.test(jsonBody(duplicateOut).error || ''),
    JSON.stringify(duplicateOut));

  const getOut = await invokeProfileShareDev('GET', `?id=${id}`);
  const getBody = jsonBody(getOut);
  assert('profile share dev GET returns stored envelope',
    getOut.status === 200 &&
    getBody.id === id &&
    getBody.envelope?.ciphertext === envelope.ciphertext,
    JSON.stringify(getOut));

  const wrongDelete = await invokeProfileShareDev('DELETE', `?id=${id}`, JSON.stringify({ manageToken: 'wrong-token' }));
  assert('profile share dev DELETE rejects wrong manage token',
    wrongDelete.status === 403 &&
    /only be stopped/.test(jsonBody(wrongDelete).error || ''),
    JSON.stringify(wrongDelete));

  const omittedBodyDelete = await invokeProfileShareDev('DELETE', `?id=${id}`);
  assert('profile share dev DELETE without body returns forbidden instead of hanging',
    omittedBodyDelete.status === 403 &&
    /only be stopped/.test(jsonBody(omittedBodyDelete).error || ''),
    JSON.stringify(omittedBodyDelete));

  const deleteOut = await invokeProfileShareDev('DELETE', `?id=${id}`, '', {
    'x-profile-share-manage-token': manageToken,
  });
  assert('profile share dev DELETE removes share with header token',
    deleteOut.status === 200 && jsonBody(deleteOut).ok === true,
    JSON.stringify(deleteOut));

  const missingOut = await invokeProfileShareDev('GET', `?id=${id}`);
  assert('profile share dev GET returns 404 after delete',
    missingOut.status === 404 && /not found/.test(jsonBody(missingOut).error || ''),
    JSON.stringify(missingOut));
}

{
  const out = await invokeProfileShareDev('DELETE', '?id=missing-share-flow-001');
  assert('profile share dev DELETE missing share is idempotent',
    out.status === 200 && jsonBody(out).ok === true && jsonBody(out).missing === true,
    JSON.stringify(out));
}

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

{
  const fullyConfigured = collectWearableConfigured({
      GOOGLE_HEALTH_ENABLED: 'true',
      GOOGLE_HEALTH_CLIENT_ID: 'google-id',
      GOOGLE_HEALTH_CLIENT_SECRET: 'google-secret',
      ULTRAHUMAN_ENABLED: 'true',
      ULTRAHUMAN_CLIENT_ID: 'ultrahuman-id',
      ULTRAHUMAN_CLIENT_SECRET: 'ultrahuman-secret',
      WHOOP_ENABLED: 'true',
      WHOOP_CLIENT_ID: 'whoop-id',
      WHOOP_CLIENT_SECRET: 'whoop-secret',
    });
  assert('Google Health capability requires explicit opt-in and both credentials',
    fullyConfigured.google_health === true
    && collectWearableConfigured({ GOOGLE_HEALTH_CLIENT_ID: 'google-id' }).google_health === false
    && collectWearableConfigured({ GOOGLE_HEALTH_CLIENT_SECRET: 'google-secret' }).google_health === false
    && collectWearableConfigured({
      GOOGLE_HEALTH_CLIENT_ID: 'google-id',
      GOOGLE_HEALTH_CLIENT_SECRET: 'google-secret',
    }).google_health === false);
  assert('Ultrahuman capability requires explicit opt-in and both credentials',
    fullyConfigured.ultrahuman === true
      && collectWearableConfigured({
        ULTRAHUMAN_CLIENT_ID: 'ultrahuman-id',
        ULTRAHUMAN_CLIENT_SECRET: 'ultrahuman-secret',
      }).ultrahuman === false
      && collectWearableConfigured({ ULTRAHUMAN_ENABLED: 'true' }).ultrahuman === false);
  assert('WHOOP capability requires explicit opt-in and both credentials',
    fullyConfigured.whoop === true
      && collectWearableConfigured({
        WHOOP_CLIENT_ID: 'whoop-id',
        WHOOP_CLIENT_SECRET: 'whoop-secret',
      }).whoop === false
      && collectWearableConfigured({ WHOOP_ENABLED: 'true' }).whoop === false);
}

// All confidential/PKCE adapters covered — guards against typo regressions
{
  const env = {
    OURA_CLIENT_ID: 'a', WITHINGS_CLIENT_ID: 'b', ULTRAHUMAN_CLIENT_ID: 'c',
    POLAR_CLIENT_ID: 'd', WHOOP_CLIENT_ID: 'e', FITBIT_CLIENT_ID: 'f',
    GOOGLE_HEALTH_CLIENT_ID: 'g',
  };
  const out = collectWearableOverrides(env);
  const ids = Object.keys(out).sort();
  assert('all seven adapters mapped', ids.join(',') === 'fitbit,google_health,oura,polar,ultrahuman,whoop,withings');
}

// Var/adapter pairing matches what api/proxy.js mirrors
{
  const expected = ['OURA_CLIENT_ID', 'WITHINGS_CLIENT_ID', 'ULTRAHUMAN_CLIENT_ID',
    'POLAR_CLIENT_ID', 'WHOOP_CLIENT_ID', 'FITBIT_CLIENT_ID', 'GOOGLE_HEALTH_CLIENT_ID'].sort();
  const got = WEARABLE_CLIENT_ID_VARS.map(([k]) => k).sort();
  assert('WEARABLE_CLIENT_ID_VARS exposes the same seven env vars', JSON.stringify(got) === JSON.stringify(expected));
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed === 0 ? 0 : 1);
