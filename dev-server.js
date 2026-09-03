#!/usr/bin/env node
// Local dev server that mirrors production routing:
//   /        → landing page (from ../get-based-site or SITE_DIR)
//   /app     → the app (index.html)
//   /docs/*  → 301 to docs.getbased.health (Mintlify)
// Usage: node dev-server.js [port]
//        SITE_DIR=/path/to/get-based-site node dev-server.js

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {
  isAllowedProxyUrl,
  isProxyHostBlocked,
} from './lib/proxy-policy.js';
import {
  DEFAULT_UVDATA_UPSTREAM,
  WEARABLE_CLIENT_ID_VARS,
  collectWearableConfigured,
  collectWearableOverrides,
  _sendCappedProxyResponse as sendCappedProxyResponse,
  handleDevApiProxy,
} from './lib/dev-api-proxy.js';
import {
  _isValidCatalogShape,
  _resolveCatalogRepo,
  _runPostDeployHooks,
  handleCatalogDeployRequest,
} from './lib/dev-catalog.js';
import { handleDevFetchPage } from './lib/dev-url-fetch.js';
import { startDevAgentHost } from './lib/dev-agent-host.js';

export {
  DEFAULT_UVDATA_UPSTREAM,
  WEARABLE_CLIENT_ID_VARS,
  collectWearableConfigured,
  collectWearableOverrides,
  _isValidCatalogShape,
  _resolveCatalogRepo,
  _runPostDeployHooks,
};

export function _sendCappedProxyResponse(req, res, proxyRes) {
  return sendCappedProxyResponse(req, res, proxyRes, corsHeaders);
}

const PORT = parseInt(process.argv[2], 10) || 8000;
// Bind address. Defaults to 127.0.0.1 (loopback only) so the dev server
// stays off the LAN unless explicitly opted in. Set HOST=0.0.0.0 to expose
// it to the local network — useful for testing on a phone over Wi-Fi.
const HOST = process.env.HOST || '127.0.0.1';
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);

const SITE_DIR = process.env.SITE_DIR || path.join(ROOT, '..', 'get-based-site');
const SITE_INDEX = path.join(SITE_DIR, 'index.html');
const hasSite = fs.existsSync(SITE_INDEX);
let devAgentHost = null;

// Auto-load .env.local (gitignored) before anything else reads process.env.
// Keeps OAuth client secrets out of shell history and out of git. Values
// already set in the shell environment take precedence — env still wins.
export function parseEnvLocal(text) {
  // Returns {[name]: value} for well-formed KEY=VALUE lines. Supports:
  //   - leading/trailing whitespace around KEY, =, and VALUE
  //   - full-line comments (line starts with # after whitespace stripping)
  //   - inline quoting: "foo" or 'foo' (quotes stripped verbatim)
  // Intentionally does NOT support:
  //   - unquoted inline `# comment` (we keep it — quote the value if unwanted)
  //   - escape sequences inside quotes (no \n unescaping)
  // Keys must match /^[A-Z_][A-Z0-9_]*$/ — lowercase or numeric-leading keys
  // are treated as malformed and ignored. Return order = insertion order.
  const out = Object.create(null);
  for (const raw of text.split('\n')) {
    if (raw.trim().startsWith('#')) continue;
    const m = raw.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
        (val.startsWith("'") && val.endsWith("'") && val.length >= 2)) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}
const ENV_LOCAL = path.join(ROOT, '.env.local');
if (fs.existsSync(ENV_LOCAL)) {
  const parsed = parseEnvLocal(fs.readFileSync(ENV_LOCAL, 'utf8'));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k]) continue; // shell export wins
    process.env[k] = v;
  }
  console.log(`Loaded .env.local (${Object.keys(process.env).filter(k => k.endsWith('_CLIENT_SECRET')).length} secrets visible)`);
}

// ─── Proxy SSRF guard — shared with api/proxy.js
export const _proxyHostBlocked = isProxyHostBlocked;
export const _isAllowedProxyUrl = isAllowedProxyUrl;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.xml': 'application/xml', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

export function _browserLaunchDisabled(env = process.env) {
  const ci = String(env.CI || '').trim().toLowerCase();
  const openBrowser = String(env.OPEN_BROWSER || '').trim().toLowerCase();
  const browser = String(env.BROWSER || '').trim().toLowerCase();
  return (ci && !['0', 'false', 'no', 'off'].includes(ci))
    || ['0', 'false', 'no', 'off'].includes(openBrowser)
    || ['0', 'false', 'none', 'no', 'off'].includes(browser);
}

export function _browserLaunchCandidates(env = process.env, platform = process.platform) {
  const requestedBrowser = String(env.BROWSER || '').trim();
  if (requestedBrowser && !['0', 'false', 'none', 'no', 'off'].includes(requestedBrowser.toLowerCase())) {
    return [{ command: requestedBrowser, args: [] }];
  }
  if (platform === 'darwin') {
    return [
      { command: 'open', args: ['-a', 'Google Chrome'] },
      { command: 'open', args: [] },
    ];
  }
  if (platform === 'win32') {
    return [{ command: 'cmd', args: ['/c', 'start', '', 'chrome'] }];
  }
  return [
    { command: 'google-chrome', args: [] },
    { command: 'google-chrome-stable', args: [] },
    { command: 'chromium', args: [] },
    { command: 'chromium-browser', args: [] },
    { command: 'xdg-open', args: [] },
  ];
}

export function openDevBrowser(url, opts = {}) {
  const env = opts.env || process.env;
  if (_browserLaunchDisabled(env)) return false;

  const spawnImpl = opts.spawn || spawn;
  const candidates = opts.candidates || _browserLaunchCandidates(env, opts.platform || process.platform);
  let index = 0;

  const tryNext = () => {
    const candidate = candidates[index++];
    if (!candidate) {
      console.warn(`Could not open a browser automatically. Open ${url} manually.`);
      return;
    }
    let child;
    try {
      child = spawnImpl(candidate.command, [...candidate.args, url], {
        detached: true,
        stdio: 'ignore',
      });
    } catch {
      tryNext();
      return;
    }
    let didFallback = false;
    const fallback = () => {
      if (didFallback) return;
      didFallback = true;
      tryNext();
    };
    child.once('error', fallback);
    child.once('spawn', () => {
      if (typeof child.unref === 'function') child.unref();
    });
    child.once('exit', (code) => {
      if (code) fallback();
    });
  };

  tryNext();
  return true;
}

const COMPRESSIBLE_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.xml', '.webmanifest',
]);

function serveFile(req, res, filePath) {
  const resolved = path.resolve(filePath);
  fs.readFile(resolved, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(resolved).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      // Dev-only — phones over Tailscale otherwise hit the PWA service
      // worker cache and never see code changes until the SW updates on
      // its own schedule. Forcing no-store makes every reload pick up
      // the freshest JS/CSS/HTML.
      'Cache-Control': 'no-store, must-revalidate',
    };
    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    const shouldCompress = data.length > 1024 && COMPRESSIBLE_EXTENSIONS.has(ext);
    const sendRaw = () => {
      res.writeHead(200, headers);
      res.end(data);
    };
    if (!shouldCompress) {
      sendRaw();
      return;
    }
    const finish = (body, encoding) => {
      res.writeHead(200, {
        ...headers,
        'Content-Encoding': encoding,
        'Vary': 'Accept-Encoding',
      });
      res.end(body);
    };
    if (acceptEncoding.includes('br')) {
      zlib.brotliCompress(data, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 },
      }, (e, body) => e ? sendRaw() : finish(body, 'br'));
      return;
    }
    if (acceptEncoding.includes('gzip')) {
      zlib.gzip(data, { level: 6 }, (e, body) => e ? sendRaw() : finish(body, 'gzip'));
      return;
    }
    sendRaw();
  });
}

// Origins allowed to hit /api/* and /proxy. Includes:
//   - Our own dev server on PORT (browser tab loaded directly)
//   - Sibling local dev tools (default :5173, fallback :5174). All allowed
//     hosts here must be loopback-only — widening this set assumes the
//     same trust boundary (no cross-network requests).
// LOCAL_TOOL_PORTS env var lets a user override if a tool picked a different port.
const _localToolPorts = (process.env.LOCAL_TOOL_PORTS || process.env.EDITOR_PORTS || '5173,5174').split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = new Set([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
  `http://[::1]:${PORT}`,
  ..._localToolPorts.flatMap(p => [
    `http://127.0.0.1:${p}`,
    `http://localhost:${p}`,
    `http://[::1]:${p}`,
  ]),
]);
export function isSameOrigin(req) {
  if (req.headers.origin) return ALLOWED_ORIGINS.has(req.headers.origin);
  if (req.headers.referer) {
    try { return ALLOWED_ORIGINS.has(new URL(req.headers.referer).origin); }
    catch { return false; }
  }
  return false;
}

// Loopback check on the actual TCP socket — the only authentication that
// can't be forged by a LAN peer setting `Origin: http://localhost:PORT`.
// Used as a hard gate in front of /api/* when HOST=0.0.0.0 (phone testing).
export function _isLoopbackSocket(req) {
  const ra = req.socket?.remoteAddress || '';
  // Node reports IPv4 via "::ffff:127.0.0.1" on dual-stack listeners.
  return ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1';
}

// Canonical same-origin check using the request's own Host header.
// A browser only sets Origin equal to Host on same-page fetches; a
// cross-site request always carries the requester's origin instead.
// So Origin === scheme://Host means the request was issued by the same
// page the dev server is hosting — exactly the meaning of "same-origin"
// for security purposes. Used as an escape hatch for tailscale-served
// phone tabs where the host the user typed isn't in the static
// ALLOWED_ORIGINS allowlist.
export function _isHostOriginMatch(req) {
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (!host || !origin) return false;
  // Two valid forms: http://<host> and https://<host>. tailscale serve
  // terminates TLS so phone tabs use https; localhost dev uses http.
  return origin === `http://${host}` || origin === `https://${host}`;
}

// Reflect the request's allowlisted origin instead of emitting `*`. Mismatch
// between `isSameOrigin` (allowlist) and the response header (wildcard) is
// only safe today because the guard runs first; reflecting keeps the two
// halves in sync if the guard's pathname check is ever loosened.
export function corsHeaders(req) {
  const origin = req.headers.origin && ALLOWED_ORIGINS.has(req.headers.origin)
    ? req.headers.origin
    : (req.headers.referer ? (() => { try { return ALLOWED_ORIGINS.has(new URL(req.headers.referer).origin) ? new URL(req.headers.referer).origin : null; } catch { return null; } })() : null);
  return origin ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {};
}

const PROFILE_SHARE_DEV_STORE = new Map();
const PROFILE_SHARE_ID_RE = /^[A-Za-z0-9_-]{20,80}$/;
const PROFILE_SHARE_MAX_BYTES = 3_750_000;
const PROFILE_SHARE_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PROFILE_SHARE_MIN_KDF_ITERATIONS = 100_000;
const PROFILE_SHARE_MANAGE_TOKEN_HASH_RE = /^[a-f0-9]{64}$/;
export function _sendProfileShareJSON(req, res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(req) });
  res.end(JSON.stringify(body));
}
export function _validateProfileShareEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error('Missing encrypted profile payload.');
  if (envelope.schema !== 'getbased-profile-share' || envelope.version !== 1) throw new Error('Unsupported encrypted profile payload.');
  const expiresAt = Date.parse(envelope.expiresAt || '');
  const now = Date.now();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) throw new Error('Share expiry must be in the future.');
  if (expiresAt - now > PROFILE_SHARE_MAX_TTL_MS) throw new Error('Share expiry cannot exceed 30 days.');
  if (envelope.kdf?.name !== 'PBKDF2' || envelope.kdf?.hash !== 'SHA-256') throw new Error('Unsupported key derivation.');
  const iterations = Number(envelope.kdf?.iterations);
  if (!Number.isInteger(iterations) || iterations < PROFILE_SHARE_MIN_KDF_ITERATIONS) throw new Error(`PBKDF2 iterations must be at least ${PROFILE_SHARE_MIN_KDF_ITERATIONS}.`);
  if (envelope.cipher?.name !== 'AES-GCM') throw new Error('Unsupported cipher.');
  if (typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length < 16) throw new Error('Encrypted profile payload is empty.');
  const sizeBytes = Buffer.byteLength(JSON.stringify(envelope));
  if (sizeBytes > PROFILE_SHARE_MAX_BYTES) throw new Error('Encrypted profile payload is too large for link sharing.');
  return { sizeBytes, expiresAt };
}
export function _handleProfileShareDev(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...corsHeaders(req), 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }
  if (req.method === 'GET') {
    const id = url.searchParams.get('id') || '';
    if (!PROFILE_SHARE_ID_RE.test(id)) { _sendProfileShareJSON(req, res, 400, { error: 'Invalid share id.' }); return; }
    const record = PROFILE_SHARE_DEV_STORE.get(id);
    if (!record) { _sendProfileShareJSON(req, res, 404, { error: 'Shared profile not found.' }); return; }
    if (Date.parse(record.expiresAt || '') <= Date.now()) {
      PROFILE_SHARE_DEV_STORE.delete(id);
      _sendProfileShareJSON(req, res, 410, { error: 'Shared profile link has expired.' });
      return;
    }
    _sendProfileShareJSON(req, res, 200, { id, expiresAt: record.expiresAt, envelope: record.envelope });
    return;
  }
  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id') || '';
    if (!PROFILE_SHARE_ID_RE.test(id)) { _sendProfileShareJSON(req, res, 400, { error: 'Invalid share id.' }); return; }
    const record = PROFILE_SHARE_DEV_STORE.get(id);
    if (!record) { _sendProfileShareJSON(req, res, 200, { ok: true, missing: true }); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let parsed = {};
      try { parsed = body ? JSON.parse(body) : {}; } catch {}
      const manageToken = String(parsed?.manageToken || req.headers['x-profile-share-manage-token'] || '');
      const manageTokenHash = manageToken ? crypto.createHash('sha256').update(manageToken).digest('hex') : '';
      if (record.manageTokenHash && (!manageToken || manageTokenHash !== record.manageTokenHash)) {
        _sendProfileShareJSON(req, res, 403, { error: 'This link can only be stopped from the browser that created it.' });
        return;
      }
      PROFILE_SHARE_DEV_STORE.delete(id);
      _sendProfileShareJSON(req, res, 200, { ok: true });
    });
    return;
  }
  if (req.method !== 'POST') {
    _sendProfileShareJSON(req, res, 405, { error: 'Method not allowed.' });
    return;
  }
  let body = '';
  let bytes = 0;
  let aborted = false;
  req.on('data', chunk => {
    if (aborted) return;
    bytes += chunk.length;
    if (bytes > PROFILE_SHARE_MAX_BYTES + 8192) {
      aborted = true;
      _sendProfileShareJSON(req, res, 413, { error: 'Encrypted profile payload is too large for link sharing.' });
      req.destroy();
      return;
    }
    body += chunk;
  });
  req.on('end', () => {
    if (aborted) return;
    let parsed;
    try { parsed = JSON.parse(body); } catch { _sendProfileShareJSON(req, res, 400, { error: 'Invalid JSON body.' }); return; }
    const id = parsed?.id || '';
    if (!PROFILE_SHARE_ID_RE.test(id)) { _sendProfileShareJSON(req, res, 400, { error: 'Invalid share id.' }); return; }
    const manageTokenHash = String(parsed?.manageTokenHash || '');
    if (!PROFILE_SHARE_MANAGE_TOKEN_HASH_RE.test(manageTokenHash)) { _sendProfileShareJSON(req, res, 400, { error: 'Invalid share management token.' }); return; }
    if (PROFILE_SHARE_DEV_STORE.has(id)) { _sendProfileShareJSON(req, res, 409, { error: 'Share id already exists.' }); return; }
    let normalized;
    try { normalized = _validateProfileShareEnvelope(parsed.envelope); } catch { _sendProfileShareJSON(req, res, 400, { error: 'Invalid encrypted profile payload.' }); return; }
    const record = {
      id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(normalized.expiresAt).toISOString(),
      manageTokenHash,
      envelope: parsed.envelope,
    };
    PROFILE_SHARE_DEV_STORE.set(id, record);
    _sendProfileShareJSON(req, res, 201, { id, expiresAt: record.expiresAt, sizeBytes: normalized.sizeBytes });
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  // Same-origin guard for proxy/API endpoints. Blocks SSRF via forged
  // Origin/Referer from browser tabs on malicious sites. See #119.
  //
  // Two escape hatches:
  // - /api/commit always passes (read-only, returns public git HEAD sha;
  //   the SW relies on it to derive a per-commit cache key).
  // - Cross-origin Origins still pass IF they exactly match the request's
  //   own `Host` header. This is the canonical same-origin definition: the
  //   browser only sets Origin = Host on a same-page fetch, never on a
  //   cross-site request. tailscale-served phone tabs naturally pass —
  //   Host = `mickey.tailnet.ts.net:port`, Origin = `http(s)://mickey.tailnet.ts.net:port`.
  //   A malicious site can't forge this: when evil.com fetches our /api/proxy,
  //   the browser sends Host = `localhost:8000` (the target) and Origin =
  //   `https://evil.com` (the requester) — mismatch.
  if ((pathname.startsWith('/api/') || pathname === '/proxy')
      && pathname !== '/api/commit'
      && !isSameOrigin(req)
      && !_isHostOriginMatch(req)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  // Hard loopback gate when bound to 0.0.0.0 (LAN-exposed for phone
  // testing). Origin/Referer headers are forgeable by any LAN peer; the
  // TCP socket address is not. The /api/* endpoints (deploy-catalog,
  // git-status, proxy, fetch-page, check-url) write to disk / fetch
  // arbitrary URLs — none are needed for phone-testing the app's UX,
  // so refusing them outright on LAN is the safe default.
  //
  // EXCEPT /api/commit — read-only, returns the git HEAD sha + branch
  // (data already public in any git clone of the repo). The service
  // worker uses it to derive a per-commit cache key (`labcharts-v…-sha8`),
  // and without it the SW falls back to a sha-less key that NEVER
  // changes across commits on LAN-tested devices. That bug pinned phones
  // to whatever bundle they first cached, so phone testing silently
  // missed every code change after the initial visit. Allowlist it
  // explicitly here.
  const LAN_SAFE_API_PATHS = new Set(['/api/commit']);
  if (HOST === '0.0.0.0'
      && (pathname.startsWith('/api/') || pathname === '/proxy')
      && !LAN_SAFE_API_PATHS.has(pathname)
      && !_isLoopbackSocket(req)) {
    res.writeHead(403); res.end('Forbidden — /api/* disabled for non-loopback peers when HOST=0.0.0.0'); return;
  }

  // API: return current git HEAD + branch so Settings → Display shows the
  // worktree's actual SHA in local dev (mirrors api/commit.js on Vercel).
  if (pathname === '/api/commit') {
    execFile('git', ['-C', ROOT, 'rev-parse', 'HEAD'], (e1, sha) => {
      if (e1) { res.writeHead(404); res.end('not-a-git-checkout'); return; }
      execFile('git', ['-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'], (e2, ref) => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ sha: sha.trim(), ref: e2 ? '' : ref.trim() }));
      });
    });
    return;
  }

  if (pathname === '/api/local-agents' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    const inventory = url.searchParams.get('refresh') === '1'
      ? devAgentHost?.refresh?.()
      : devAgentHost?.describe();
    res.end(JSON.stringify(inventory || { agents: [] }));
    return;
  }

  // API: encrypted profile share mirror for local development. Production
  // uses api/share.js with private Vercel Blob storage; localhost keeps the
  // encrypted records in memory only.
  if (pathname === '/api/share') {
    _handleProfileShareDev(req, res, url);
    return;
  }

  // API: HEAD-check a URL and return the real status code (bypasses browser CORS)
  if (pathname === '/api/check-url') {
    const target = url.searchParams.get('url');
    if (!target) { res.writeHead(400, { ...corsHeaders(req) }); res.end('{"error":"missing url param"}'); return; }
    if (!_isAllowedProxyUrl(target)) {
      res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) });
      res.end(JSON.stringify({ status: 0, error: 'URL blocked by SSRF guard' }));
      return;
    }
    const mod = target.startsWith('https') ? https : http;
    const headReq = mod.request(target, { method: 'HEAD', timeout: 6000 }, (headRes) => {
      // Follow one redirect — but re-check the destination through the SSRF
      // guard. An allowlisted host could otherwise 30x to a private IP.
      if ([301, 302, 307, 308].includes(headRes.statusCode) && headRes.headers.location) {
        const loc = new URL(headRes.headers.location, target).href;
        if (!_isAllowedProxyUrl(loc)) {
          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders(req) });
          res.end(JSON.stringify({ status: 0, error: 'Redirect destination blocked by SSRF guard' }));
          return;
        }
        const mod2 = loc.startsWith('https') ? https : http;
        mod2.request(loc, { method: 'HEAD', timeout: 6000 }, (r2) => {
          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders(req) });
          res.end(JSON.stringify({ status: r2.statusCode, redirected: loc }));
        }).on('error', (e) => {
          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders(req) });
          res.end(JSON.stringify({ status: 0, error: e.message }));
        }).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders(req) });
      res.end(JSON.stringify({ status: headRes.statusCode }));
    });
    headReq.on('error', (e) => {
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders(req) });
      res.end(JSON.stringify({ status: 0, error: e.message }));
    });
    headReq.on('timeout', () => { headReq.destroy(); });
    headReq.end();
    return;
  }

  // API: GET-fetch a URL and return the HTML body (for Shop Fill search scraping)
  if (pathname === '/api/fetch-page') {
    const target = url.searchParams.get('url');
    if (!target) { res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) }); res.end('{"error":"missing url param"}'); return; }
    handleDevFetchPage(req, res, target, { corsHeaders });
    return;
  }

  // The legacy rendered-fetch route referenced a tool that is not shipped.
  // Keep an explicit response instead of accepting an unpinned browser fetch.
  if (pathname === '/api/fetch-page-rendered') {
    res.writeHead(410, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(req) });
    res.end(JSON.stringify({ status: 0, error: 'Rendered page fetching is unavailable.' }));
    return;
  }

  // API: deploy catalog JSON to data/recommendations.json
  if (pathname === '/api/deploy-catalog' && req.method === 'POST') {
    handleCatalogDeployRequest(req, res);
    return;
  }

  // API: git status of a tracked file. A client surfaces this in a diff
  // preview so users see whether they're about to overwrite uncommitted work.
  if (pathname === '/api/git-status' && req.method === 'GET') {
    const filePath = String(url.searchParams.get('path') || 'data/recommendations.json');
    // Path-traversal guard runs on the QUERY ARG ITSELF — that's the
    // attacker-controllable input. Reject `..` and absolute paths so the
    // resolved path is guaranteed inside ROOT. Maintainer-placed symlinks
    // whose targets resolve outside ROOT are explicitly allowed; the
    // realpath check that previously rejected them was over-restrictive.
    if (filePath.split(/[/\\]/).some(seg => seg === '..') || path.isAbsolute(filePath)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid path' }));
      return;
    }
    const resolved = path.resolve(ROOT, filePath);
    let real;
    try { real = fs.realpathSync(resolved); } catch { real = resolved; }
    // Detect when the symlink resolves outside ROOT — when it does, we
    // suppress git metadata (last-commit SHA / message / dirty flag) to
    // avoid fingerprinting whatever the maintainer linked to. The
    // contentHash is still computed (it's just a hash of bytes the user
    // already controls) so If-Match conflict detection keeps working.
    let rel = path.relative(ROOT, real);
    const symlinksOutsideRoot = rel.startsWith('..') || path.isAbsolute(rel);
    if (symlinksOutsideRoot) rel = filePath;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    let contentHash = null;
    try { contentHash = crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex'); } catch {}
    // Skip git lookups entirely for symlinks resolving outside the repo —
    // we don't want to expose another repo's HEAD SHA / commit message via
    // an endpoint anyone in the same browser can hit.
    if (symlinksOutsideRoot) {
      res.end(JSON.stringify({ path: rel, dirty: false, lastCommit: null, contentHash }));
      return;
    }
    // Run two cheap git commands in parallel: status (for dirty/clean) and
    // log (for last commit metadata).
    let statusOut = '', logOut = '', errored = false;
    let pending = 2;
    function done() {
      if (--pending !== 0) return;
      if (errored) { res.end(JSON.stringify({ error: 'git unavailable', dirty: false, contentHash })); return; }
      const dirty = statusOut.trim().length > 0;
      const lastCommit = (() => {
        const line = (logOut || '').trim();
        if (!line) return null;
        const [sha, date, ...rest] = line.split('\x1f');
        return { sha, date, message: rest.join('\x1f') };
      })();
      res.end(JSON.stringify({ path: rel, dirty, lastCommit, contentHash }));
    }
    execFile('git', ['-C', ROOT, 'status', '--porcelain', '--', rel], { timeout: 3000 }, (err, out) => {
      if (err) errored = true;
      else statusOut = out;
      done();
    });
    execFile('git', ['-C', ROOT, 'log', '-1', '--pretty=format:%h\x1f%cI\x1f%s', '--', rel], { timeout: 3000 }, (err, out) => {
      if (err) errored = true;
      else logOut = out;
      done();
    });
    return;
  }

  // API: AI proxy — mirrors the Vercel Function for local CORS bypass.
  if (pathname === '/api/proxy' && handleDevApiProxy(req, res, { corsHeaders })) return;

  // Route: / → landing page (if site repo found) or app
  if (pathname === '/') {
    if (hasSite) return serveFile(req, res, SITE_INDEX);
    return serveFile(req, res, path.join(ROOT, 'index.html'));
  }

  // Route: /app → index.html (redirect trailing slash to avoid broken relative paths)
  if (pathname === '/app/') {
    res.writeHead(301, { 'Location': '/app' }); res.end(); return;
  }
  if (pathname === '/app') {
    return serveFile(req, res, path.join(ROOT, 'index.html'));
  }

  // Route: /docs/* → 301 to docs.getbased.health (docs moved to Mintlify;
  // mirrors the redirects in the app's vercel.json).
  if (pathname === '/docs' || pathname === '/docs/' || pathname.startsWith('/docs/')) {
    const m = pathname.match(/^\/docs\/guide\/(.+?)(?:\.html)?\/?$/);
    const dest = m ? `https://docs.getbased.health/guides/${m[1]}` : 'https://docs.getbased.health/';
    res.writeHead(301, { Location: dest });
    res.end();
    return;
  }

  // Route: /blog → blog.html, /blog/{slug} → blog/{slug}/index.html (mirrors Vercel rewrites)
  if (hasSite && pathname === '/blog') {
    return serveFile(req, res, path.join(SITE_DIR, 'blog.html'));
  }
  if (hasSite && /^\/blog\/[^/]+$/.test(pathname)) {
    let slugIndex = path.join(SITE_DIR, pathname, 'index.html');
    if (fs.existsSync(slugIndex)) return serveFile(req, res, slugIndex);
    return serveFile(req, res, path.join(SITE_DIR, 'blog.html'));
  }

  // Static files from site repo (e.g. /thank-you.html, /icon.svg)
  // Skip files that also exist in the app root to avoid shadowing (index.html, vercel.json, etc.)
  if (hasSite) {
    let siteFile = path.join(SITE_DIR, pathname);
    let appFile = path.join(ROOT, pathname);
    // Only serve from site if the file doesn't also exist in the app root
    if (fs.existsSync(siteFile) && fs.statSync(siteFile).isFile() && !(fs.existsSync(appFile) && fs.statSync(appFile).isFile())) {
      return serveFile(req, res, siteFile);
    }
    // Clean URL: try .html append (only for site-specific pages like /thank-you)
    if (fs.existsSync(siteFile + '.html') && !(fs.existsSync(appFile + '.html'))) {
      return serveFile(req, res, siteFile + '.html');
    }
  }

  // Proxy: /proxy?url=... — fetches external URLs (dev only, for test tools)
  if (pathname === '/proxy') {
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) { res.writeHead(400); res.end('Missing url param'); return; }
    if (!_isAllowedProxyUrl(targetUrl)) { res.writeHead(400); res.end('URL blocked by SSRF guard'); return; }
    const fetcher = targetUrl.startsWith('https') ? https : http;
    fetcher.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (proxyRes) => {
      // Follow redirects — re-check destination through SSRF guard.
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        const redirect = new URL(proxyRes.headers.location, targetUrl).href;
        if (!_isAllowedProxyUrl(redirect)) { res.writeHead(400); res.end('Redirect destination blocked by SSRF guard'); return; }
        const rFetcher = redirect.startsWith('https') ? https : http;
        rFetcher.get(redirect, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (rRes) => {
          res.writeHead(rRes.statusCode, { 'Content-Type': rRes.headers['content-type'] || 'application/octet-stream', ...corsHeaders(req) });
          rRes.pipe(res);
        }).on('error', e => { res.writeHead(502); res.end(e.message); });
        return;
      }
      res.writeHead(proxyRes.statusCode, { 'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream', ...corsHeaders(req) });
      proxyRes.pipe(res);
    }).on('error', e => { res.writeHead(502); res.end(e.message); });
    return;
  }

  // Static files from root
  let filePath = path.join(ROOT, pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return serveFile(req, res, filePath);
  }

  res.writeHead(404); res.end('Not found');
});

// Only listen when run as a script, not when imported by tests. Compare the
// fileURL of this module to the fileURL of the entrypoint — equal means
// `node dev-server.js`, different means `import ... from './dev-server.js'`.
const _entryUrl = process.argv[1] ? new URL(`file://${path.resolve(process.argv[1])}`).href : '';
const _isDirectRun = import.meta.url === _entryUrl;
if (_isDirectRun) {
  devAgentHost = startDevAgentHost({ root: ROOT });
  server.listen(PORT, HOST, () => {
    const localUrl = `http://127.0.0.1:${PORT}`;
    // A unique development navigation bypasses an older service worker's exact
    // cached document while switching branches or worktrees on the same origin.
    const appUrl = `${localUrl}/app?dev=${Date.now()}`;
    console.log(`Dev server running at http://${HOST === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1'}:${PORT}`);
    if (HOST === '0.0.0.0') {
      console.log(`  → reachable on your LAN at http://<your-lan-ip>:${PORT}`);
    }
    if (hasSite) {
      console.log(`  /        → landing page (${SITE_DIR})`);
      console.log(`  /app     → index.html`);
    } else {
      console.log(`  /        → index.html (no site repo found at ${SITE_DIR})`);
    }
    console.log(`  /docs/*  → 301 docs.getbased.health`);
    openDevBrowser(appUrl);
  });
  const shutdown = () => {
    devAgentHost?.close();
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
