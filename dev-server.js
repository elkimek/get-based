#!/usr/bin/env node
// Local dev server that mirrors production routing:
//   /        → landing page (from ../get-based-site or SITE_DIR)
//   /app     → the app (index.html)
//   /docs/*  → built VitePress docs
// Usage: node dev-server.js [port]
//        SITE_DIR=/path/to/get-based-site node dev-server.js

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';

const PORT = parseInt(process.argv[2], 10) || 8000;
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);

// Mutex for /api/deploy-catalog so two concurrent POSTs can't race on
// the read-hash → writeFileSync critical section. Promise-chained queue:
// each request's _deployCatalog body waits for the prior one to finish.
let _deployLock = Promise.resolve();
function _deployCatalog(body, req, res) {
  _deployLock = _deployLock.then(() => new Promise(resolve => {
    try {
      JSON.parse(body); // validate JSON shape
      // Surface-level shape check — protect the app against a successful
      // deploy of `[1,2,3]` (valid JSON, broken catalog).
      const parsed = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
          || !parsed.slots || !parsed.shops) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid catalog shape: missing required slots/shops keys');
        resolve();
        return;
      }
      const filePath = path.join(ROOT, 'data', 'recommendations.json');
      // Conflict detection: client sends If-Match with the SHA-256 hash of
      // the catalog as it last saw it; reject when the file changed since
      // (multi-tab / concurrent-write race).
      const ifMatch = req.headers['if-match'];
      if (ifMatch) {
        let currentHash = '';
        try {
          const buf = fs.readFileSync(filePath);
          currentHash = crypto.createHash('sha256').update(buf).digest('hex');
        } catch {}
        if (currentHash && currentHash !== ifMatch.replace(/"/g, '')) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'conflict', currentHash }));
          resolve();
          return;
        }
      }
      fs.writeFileSync(filePath, body);
      const newHash = crypto.createHash('sha256').update(body).digest('hex');
      res.writeHead(200, { 'Content-Type': 'application/json', 'ETag': '"' + newHash + '"' });
      res.end(JSON.stringify({ ok: true, hash: newHash }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid JSON: ' + e.message);
    }
    resolve();
  })).catch(() => {});
  return _deployLock;
}
const SITE_DIR = process.env.SITE_DIR || path.join(ROOT, '..', 'get-based-site');
const SITE_INDEX = path.join(SITE_DIR, 'index.html');
const hasSite = fs.existsSync(SITE_INDEX);

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

// ─── Proxy SSRF guard — mirrors api/proxy.js ALLOWED_ORIGINS + _isBlockedHost
// Keep in sync with api/proxy.js when adding new vendor hosts.
const _PROXY_ALLOWED_ORIGINS = [
  'https://openrouter.ai/',
  'https://api.venice.ai/',
  'https://api.routstr.com/',
  'https://api.ppq.ai/',
  'https://api.ouraring.com/',
  'https://api.prod.whoop.com/',
  'https://partner.ultrahuman.com/',
  'https://wbsapi.withings.net/',
  'https://api.fitbit.com/',
  'https://www.polaraccesslink.com/',
  'https://polarremote.com/',
];
export function _proxyHostBlocked(host) {
  if (!host) return true;
  const h = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (h.endsWith('.local') || h.endsWith('.localhost')) return true;
  if (h === '168.63.129.16') return true;
  // IPv6 literal: same allowlist-only-2000::/3 strategy as api/proxy.js
  if (h.includes(':')) {
    const lower = h.toLowerCase();
    if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;
    if (/^fc[0-9a-f]{2}:/.test(lower) || /^fd[0-9a-f]{2}:/.test(lower)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
    const v4Embed = lower.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4Embed) return _proxyHostBlocked(v4Embed[1]);
    if (lower.startsWith('::ffff:')) {
      const tail = lower.slice(7);
      const hex = tail.replace(/:/g, '');
      if (/^[0-9a-f]{1,8}$/.test(hex)) {
        const padded = hex.padStart(8, '0');
        const a = parseInt(padded.slice(0, 2), 16);
        const b = parseInt(padded.slice(2, 4), 16);
        const c = parseInt(padded.slice(4, 6), 16);
        const d = parseInt(padded.slice(6, 8), 16);
        return _proxyHostBlocked(`${a}.${b}.${c}.${d}`);
      }
    }
    return !/^[23][0-9a-f]{3}:/.test(lower);
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  for (let i = 1; i <= 4; i++) {
    const octet = m[i];
    if (octet.length > 1 && octet[0] === '0') return true;
    const n = +octet;
    if (n > 255) return true;
  }
  const a = +m[1], b = +m[2];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 0) return true;
  return false;
}
export function _isAllowedProxyUrl(url) {
  if (_PROXY_ALLOWED_ORIGINS.some(o => url.startsWith(o))) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (_proxyHostBlocked(u.hostname)) return false;
    return true;
  } catch { return false; }
}

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.xml': 'application/xml', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

function serveFile(res, filePath) {
  const resolved = path.resolve(filePath);
  fs.readFile(resolved, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    });
    res.end(data);
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
function isSameOrigin(req) {
  if (req.headers.origin) return ALLOWED_ORIGINS.has(req.headers.origin);
  if (req.headers.referer) {
    try { return ALLOWED_ORIGINS.has(new URL(req.headers.referer).origin); }
    catch { return false; }
  }
  return false;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  // Same-origin guard for proxy/API endpoints. Blocks SSRF via forged
  // Origin/Referer from browser tabs on malicious sites. See #119.
  if ((pathname.startsWith('/api/') || pathname === '/proxy') && !isSameOrigin(req)) {
    res.writeHead(403); res.end('Forbidden'); return;
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

  // API: HEAD-check a URL and return the real status code (bypasses browser CORS)
  if (pathname === '/api/check-url') {
    const target = url.searchParams.get('url');
    if (!target) { res.writeHead(400, { 'Access-Control-Allow-Origin': '*' }); res.end('{"error":"missing url param"}'); return; }
    const mod = target.startsWith('https') ? https : http;
    const headReq = mod.request(target, { method: 'HEAD', timeout: 6000 }, (headRes) => {
      // Follow one redirect
      if ([301, 302, 307, 308].includes(headRes.statusCode) && headRes.headers.location) {
        const loc = new URL(headRes.headers.location, target).href;
        const mod2 = loc.startsWith('https') ? https : http;
        mod2.request(loc, { method: 'HEAD', timeout: 6000 }, (r2) => {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ status: r2.statusCode, redirected: loc }));
        }).on('error', (e) => {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ status: 0, error: e.message }));
        }).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ status: headRes.statusCode }));
    });
    headReq.on('error', (e) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ status: 0, error: e.message }));
    });
    headReq.on('timeout', () => { headReq.destroy(); });
    headReq.end();
    return;
  }

  // API: GET-fetch a URL and return the HTML body (for Shop Fill search scraping)
  if (pathname === '/api/fetch-page') {
    const target = url.searchParams.get('url');
    if (!target) { res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end('{"error":"missing url param"}'); return; }
    const mod = target.startsWith('https') ? https : http;
    const fetchPage = (fetchUrl, depth) => {
      const fetchMod = fetchUrl.startsWith('https') ? https : http;
      fetchMod.get(fetchUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'cs,sk,en;q=0.5',
        },
      }, (pageRes) => {
        // Follow one redirect
        if (depth === 0 && [301, 302, 307, 308].includes(pageRes.statusCode) && pageRes.headers.location) {
          const loc = new URL(pageRes.headers.location, fetchUrl).href;
          return fetchPage(loc, 1);
        }
        let body = '';
        let bytes = 0;
        const MAX = 256 * 1024;
        pageRes.setEncoding('utf8');
        pageRes.on('data', (chunk) => {
          if (bytes < MAX) { body += chunk; bytes += Buffer.byteLength(chunk); }
        });
        pageRes.on('end', () => {
          if (bytes > MAX) body = body.slice(0, MAX);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ status: pageRes.statusCode, html: body }));
        });
      }).on('error', (e) => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 0, error: e.message }));
      }).on('timeout', function() { this.destroy(); });
    };
    fetchPage(target, 0);
    return;
  }

  // API: fetch page with headless Chrome (for SPA shops)
  if (pathname === '/api/fetch-page-rendered') {
    const target = url.searchParams.get('url');
    if (!target) { res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end('{"error":"missing url param"}'); return; }
    const scriptPath = path.join(ROOT, 'tools', 'fetch-rendered.mjs');
    execFile('node', [scriptPath, target], { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      if (err) { res.end(JSON.stringify({ status: 0, error: err.message })); return; }
      try { JSON.parse(stdout); res.end(stdout); } catch { res.end(JSON.stringify({ status: 0, error: 'Invalid response from renderer' })); }
    });
    return;
  }

  // API: deploy catalog JSON to data/recommendations.json
  if (pathname === '/api/deploy-catalog' && req.method === 'POST') {
    // Body-size cap. The catalog is ~100 KB today; 5 MB gives plenty of
    // headroom while preventing a runaway POST from OOM'ing the dev server.
    const MAX_BODY_BYTES = 5 * 1024 * 1024;
    let body = '';
    let bytes = 0;
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        aborted = true;
        res.writeHead(413, { 'Content-Type': 'text/plain' });
        res.end('Catalog body exceeds 5 MB limit');
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (aborted) return;
      // Serialize concurrent deploys with an in-process mutex. Without this,
      // two concurrent POSTs both pass the If-Match check against the same
      // pre-write hash, then race on writeFileSync — the second clobbers
      // the first. Lock spans the read-hash → write critical section.
      _deployCatalog(body, req, res);
    });
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

  // API: AI proxy — mirrors Vercel Edge Function for local CORS bypass
  if (pathname === '/api/proxy' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);

        // Oura OAuth2 token exchange/refresh — proxies secret-bearing request
        // to api.ouraring.com/oauth/token with OURA_CLIENT_SECRET from env.
        if (payload.oura_token_exchange || payload.oura_token_refresh) {
          const secret = process.env.OURA_CLIENT_SECRET;
          if (!secret) {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'OURA_CLIENT_SECRET not set — export it before `node dev-server.js`' }));
            return;
          }
          let form;
          if (payload.oura_token_exchange) {
            const { code, redirect_uri, client_id } = payload.oura_token_exchange;
            if (!code || !redirect_uri || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end('{"error":"oura_token_exchange requires code, redirect_uri, client_id"}'); return;
            }
            form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri, client_id, client_secret: secret });
          } else {
            const { refresh_token, client_id } = payload.oura_token_refresh;
            if (!refresh_token || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end('{"error":"oura_token_refresh requires refresh_token, client_id"}'); return;
            }
            form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token, client_id, client_secret: secret });
          }
          const tokenReq = https.request('https://api.ouraring.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          }, (tokenRes) => {
            const ct = tokenRes.headers['content-type'] || 'application/json';
            res.writeHead(tokenRes.statusCode, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
            tokenRes.pipe(res);
          });
          tokenReq.on('error', (e) => {
            res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Token endpoint unreachable: ' + e.message }));
          });
          tokenReq.write(form.toString());
          tokenReq.end();
          return;
        }

        // Ultrahuman OAuth2 token exchange/refresh — confidential client,
        // token endpoint at partner.ultrahuman.com/api/partners/oauth/token.
        if (payload.ultrahuman_token_exchange || payload.ultrahuman_token_refresh) {
          const secret = process.env.ULTRAHUMAN_CLIENT_SECRET;
          if (!secret) {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'ULTRAHUMAN_CLIENT_SECRET not set — add it to .env.local' }));
            return;
          }
          let form;
          if (payload.ultrahuman_token_exchange) {
            const { code, redirect_uri, client_id } = payload.ultrahuman_token_exchange;
            if (!code || !redirect_uri || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end('{"error":"ultrahuman_token_exchange requires code, redirect_uri, client_id"}'); return;
            }
            form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri, client_id, client_secret: secret });
          } else {
            const { refresh_token, client_id } = payload.ultrahuman_token_refresh;
            if (!refresh_token || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end('{"error":"ultrahuman_token_refresh requires refresh_token, client_id"}'); return;
            }
            form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token, client_id, client_secret: secret });
          }
          const tokenReq = https.request('https://partner.ultrahuman.com/api/partners/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          }, (tokenRes) => {
            const ct = tokenRes.headers['content-type'] || 'application/json';
            res.writeHead(tokenRes.statusCode, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
            tokenRes.pipe(res);
          });
          tokenReq.on('error', (e) => {
            res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Ultrahuman token endpoint unreachable: ' + e.message }));
          });
          tokenReq.write(form.toString());
          tokenReq.end();
          return;
        }

        // Withings OAuth2 token exchange/refresh — mirrors Oura pattern with
        // Withings's non-standard action=requesttoken body field.
        if (payload.withings_token_exchange || payload.withings_token_refresh) {
          const secret = process.env.WITHINGS_CLIENT_SECRET;
          if (!secret) {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'WITHINGS_CLIENT_SECRET not set — export it before `node dev-server.js`' }));
            return;
          }
          let form;
          if (payload.withings_token_exchange) {
            const { code, redirect_uri, client_id } = payload.withings_token_exchange;
            if (!code || !redirect_uri || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end('{"error":"withings_token_exchange requires code, redirect_uri, client_id"}'); return;
            }
            form = new URLSearchParams({
              action: 'requesttoken', grant_type: 'authorization_code',
              client_id, client_secret: secret, code, redirect_uri,
            });
          } else {
            const { refresh_token, client_id } = payload.withings_token_refresh;
            if (!refresh_token || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end('{"error":"withings_token_refresh requires refresh_token, client_id"}'); return;
            }
            form = new URLSearchParams({
              action: 'requesttoken', grant_type: 'refresh_token',
              client_id, client_secret: secret, refresh_token,
            });
          }
          const tokenReq = https.request('https://wbsapi.withings.net/v2/oauth2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          }, (tokenRes) => {
            const ct = tokenRes.headers['content-type'] || 'application/json';
            res.writeHead(tokenRes.statusCode, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
            tokenRes.pipe(res);
          });
          tokenReq.on('error', (e) => {
            res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Withings token endpoint unreachable: ' + e.message }));
          });
          tokenReq.write(form.toString());
          tokenReq.end();
          return;
        }

        // Polar AccessLink OAuth2 token exchange/refresh — Basic auth.
        if (payload.polar_token_exchange || payload.polar_token_refresh) {
          const secret = process.env.POLAR_CLIENT_SECRET;
          if (!secret) {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'POLAR_CLIENT_SECRET not set — add it to .env.local before `node dev-server.js`' }));
            return;
          }
          let form, clientId;
          if (payload.polar_token_exchange) {
            const { code, redirect_uri, client_id } = payload.polar_token_exchange;
            if (!code || !redirect_uri || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end('{"error":"polar_token_exchange requires code, redirect_uri, client_id"}'); return;
            }
            clientId = client_id;
            form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri });
          } else {
            const { refresh_token, client_id } = payload.polar_token_refresh;
            if (!refresh_token || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end('{"error":"polar_token_refresh requires refresh_token, client_id"}'); return;
            }
            clientId = client_id;
            form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token });
          }
          const basicAuth = 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64');
          const tokenReq = https.request('https://polarremote.com/v2/oauth2/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json;charset=UTF-8',
              'Authorization': basicAuth,
            },
          }, (tokenRes) => {
            const ct = tokenRes.headers['content-type'] || 'application/json';
            res.writeHead(tokenRes.statusCode, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
            tokenRes.pipe(res);
          });
          tokenReq.on('error', (e) => {
            res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Polar token endpoint unreachable: ' + e.message }));
          });
          tokenReq.write(form.toString());
          tokenReq.end();
          return;
        }

        const { url: targetUrl, headers: fwdHeaders, body: fwdBody, method: upMethod } = payload;
        if (!targetUrl) { res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end('{"error":"missing url"}'); return; }
        if (!_isAllowedProxyUrl(targetUrl)) {
          res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end('{"error":"URL not allowed"}'); return;
        }
        const parsedUrl = new URL(targetUrl);
        const mod = parsedUrl.protocol === 'https:' ? https : http;
        const fetchMethod = (upMethod || 'POST').toUpperCase();
        // Caller-provided headers win. We fall back to application/json ONLY
        // if the caller didn't supply a Content-Type — otherwise Fitbit / any
        // form-urlencoded token endpoint breaks (it gets our form body tagged
        // as JSON and can't parse the `client_id` out). Matches the spread
        // order already used in api/proxy.js.
        const reqHeaders = { ...fwdHeaders };
        const hasCT = Object.keys(reqHeaders).some(k => k.toLowerCase() === 'content-type');
        if (fetchMethod !== 'GET' && !hasCT) reqHeaders['Content-Type'] = 'application/json';
        const proxyReq = mod.request(targetUrl, { method: fetchMethod, headers: reqHeaders }, (proxyRes) => {
          const ct = proxyRes.headers['content-type'] || 'application/json';
          res.writeHead(proxyRes.statusCode, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
          proxyRes.pipe(res);
        });
        proxyReq.on('error', (e) => {
          res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'Upstream error: ' + e.message }));
        });
        if (fetchMethod !== 'GET' && fwdBody) {
          proxyReq.write(typeof fwdBody === 'string' ? fwdBody : JSON.stringify(fwdBody));
        }
        proxyReq.end();
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Invalid JSON: ' + e.message }));
      }
    });
    return;
  }
  if (pathname === '/api/proxy' && req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }

  // Route: / → landing page (if site repo found) or app
  if (pathname === '/') {
    if (hasSite) return serveFile(res, SITE_INDEX);
    return serveFile(res, path.join(ROOT, 'index.html'));
  }

  // Route: /app → index.html (redirect trailing slash to avoid broken relative paths)
  if (pathname === '/app/') {
    res.writeHead(301, { 'Location': '/app' }); res.end(); return;
  }
  if (pathname === '/app') {
    return serveFile(res, path.join(ROOT, 'index.html'));
  }

  // Route: /docs → dist-docs/
  if (pathname === '/docs' || pathname === '/docs/') {
    return serveFile(res, path.join(ROOT, 'dist-docs', 'index.html'));
  }
  if (pathname.startsWith('/docs/')) {
    let docPath = pathname.slice(6); // strip "/docs/"
    let filePath = path.join(ROOT, 'dist-docs', docPath);
    // Try exact file, then with .html, then index.html in directory
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return serveFile(res, filePath);
    }
    if (fs.existsSync(filePath + '.html')) {
      return serveFile(res, filePath + '.html');
    }
    if (fs.existsSync(path.join(filePath, 'index.html'))) {
      return serveFile(res, path.join(filePath, 'index.html'));
    }
    res.writeHead(404); res.end('Not found'); return;
  }

  // Route: /blog → blog.html, /blog/{slug} → blog/{slug}/index.html (mirrors Vercel rewrites)
  if (hasSite && pathname === '/blog') {
    return serveFile(res, path.join(SITE_DIR, 'blog.html'));
  }
  if (hasSite && /^\/blog\/[^/]+$/.test(pathname)) {
    let slugIndex = path.join(SITE_DIR, pathname, 'index.html');
    if (fs.existsSync(slugIndex)) return serveFile(res, slugIndex);
    return serveFile(res, path.join(SITE_DIR, 'blog.html'));
  }

  // Static files from site repo (e.g. /thank-you.html, /icon.svg)
  // Skip files that also exist in the app root to avoid shadowing (index.html, vercel.json, etc.)
  if (hasSite) {
    let siteFile = path.join(SITE_DIR, pathname);
    let appFile = path.join(ROOT, pathname);
    // Only serve from site if the file doesn't also exist in the app root
    if (fs.existsSync(siteFile) && fs.statSync(siteFile).isFile() && !(fs.existsSync(appFile) && fs.statSync(appFile).isFile())) {
      return serveFile(res, siteFile);
    }
    // Clean URL: try .html append (only for site-specific pages like /thank-you)
    if (fs.existsSync(siteFile + '.html') && !(fs.existsSync(appFile + '.html'))) {
      return serveFile(res, siteFile + '.html');
    }
  }

  // Proxy: /proxy?url=... — fetches external URLs (dev only, for test tools)
  if (pathname === '/proxy') {
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) { res.writeHead(400); res.end('Missing url param'); return; }
    const fetcher = targetUrl.startsWith('https') ? https : http;
    fetcher.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (proxyRes) => {
      // Follow redirects
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        const redirect = new URL(proxyRes.headers.location, targetUrl).href;
        const rFetcher = redirect.startsWith('https') ? https : http;
        rFetcher.get(redirect, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (rRes) => {
          res.writeHead(rRes.statusCode, { 'Content-Type': rRes.headers['content-type'] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
          rRes.pipe(res);
        }).on('error', e => { res.writeHead(502); res.end(e.message); });
        return;
      }
      res.writeHead(proxyRes.statusCode, { 'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      proxyRes.pipe(res);
    }).on('error', e => { res.writeHead(502); res.end(e.message); });
    return;
  }

  // Static files from root
  let filePath = path.join(ROOT, pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return serveFile(res, filePath);
  }

  res.writeHead(404); res.end('Not found');
});

// Only listen when run as a script, not when imported by tests. Compare the
// fileURL of this module to the fileURL of the entrypoint — equal means
// `node dev-server.js`, different means `import ... from './dev-server.js'`.
const _entryUrl = process.argv[1] ? new URL(`file://${path.resolve(process.argv[1])}`).href : '';
const _isDirectRun = import.meta.url === _entryUrl;
if (_isDirectRun) server.listen(PORT, '127.0.0.1', () => {
  console.log(`Dev server running at http://127.0.0.1:${PORT}`);
  if (hasSite) {
    console.log(`  /        → landing page (${SITE_DIR})`);
    console.log(`  /app     → index.html`);
  } else {
    console.log(`  /        → index.html (no site repo found at ${SITE_DIR})`);
  }
  console.log(`  /docs/*  → dist-docs/*`);
});
