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
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const DEFAULT_UVDATA_UPSTREAM = 'https://uvdata.getbased.health';

// Self-host OAuth client_id overrides — extracted as an exported helper so
// tests can exercise the env→override mapping without spinning up the HTTP
// server. See issue #145. The same six VAR→adapter pairs are mirrored in
// api/proxy.js (Vercel Edge); keep both in sync.
export const WEARABLE_CLIENT_ID_VARS = [
  ['OURA_CLIENT_ID', 'oura'],
  ['WITHINGS_CLIENT_ID', 'withings'],
  ['ULTRAHUMAN_CLIENT_ID', 'ultrahuman'],
  ['POLAR_CLIENT_ID', 'polar'],
  ['WHOOP_CLIENT_ID', 'whoop'],
  ['FITBIT_CLIENT_ID', 'fitbit'],
];
export function collectWearableOverrides(env) {
  const out = {};
  if (!env || typeof env !== 'object') return out;
  for (const [key, id] of WEARABLE_CLIENT_ID_VARS) {
    const v = env[key];
    if (typeof v === 'string' && v.trim()) out[id] = v.trim();
  }
  return out;
}

const PORT = parseInt(process.argv[2], 10) || 8000;
// Bind address. Defaults to 127.0.0.1 (loopback only) so the dev server
// stays off the LAN unless explicitly opted in. Set HOST=0.0.0.0 to expose
// it to the local network — useful for testing on a phone over Wi-Fi.
const HOST = process.env.HOST || '127.0.0.1';
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);

// Mutex for /api/deploy-catalog so two concurrent POSTs can't race on
// the read-hash → writeFileSync critical section. Promise-chained queue:
// each request's _deployCatalog body waits for the prior one to finish.
let _deployLock = Promise.resolve();
function _deployCatalog(body, req, res) {
  _deployLock = _deployLock.then(async () => {
    try {
      JSON.parse(body); // validate JSON shape
      const parsed = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
          || !parsed.slots || !parsed.shops) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid catalog shape: missing required slots/shops keys');
        return;
      }
      const filePath = path.join(ROOT, 'data', 'recommendations.json');
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
          return;
        }
      }
      fs.writeFileSync(filePath, body);
      const newHash = crypto.createHash('sha256').update(body).digest('hex');

      // Post-write hooks: commit+push the catalog repo, then trigger Vercel.
      // Both gated on env config; failures don't unwind the disk write — the
      // file is already deployed locally and the user can retry the hooks
      // (re-deploying produces a no-op file write on the same content).
      const hooks = await _runPostDeployHooks(filePath).catch(e => ({
        git: { skipped: true, error: 'hook crash: ' + (e?.message || e) },
        vercel: { skipped: true },
      }));

      res.writeHead(200, { 'Content-Type': 'application/json', 'ETag': '"' + newHash + '"' });
      res.end(JSON.stringify({ ok: true, hash: newHash, ...hooks }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid JSON: ' + e.message);
    }
  }).catch(() => {});
  return _deployLock;
}

// Resolve which git repo to push the catalog from. The symlink at
// data/recommendations.json typically points into a sibling repo
// (getbased-tools); we want to commit there, not in Lab Charts. Resolution
// order:
//   1. CATALOG_GIT_REPO env override (absolute path) — explicit wins.
//   2. realpath the symlink → walk up via `git rev-parse --show-toplevel`.
//   3. If the resolved repo IS the Lab Charts repo (no symlink, fork stub
//      case), return null — auto-pushing the app repo on every catalog
//      edit would be surprising and is not what this hook is for.
// Returns { repoRoot, relPath } or null when no valid target.
export function _resolveCatalogRepo(filePath, opts = {}) {
  const override = opts.envRepo ?? process.env.CATALOG_GIT_REPO;
  const appRoot = opts.appRoot ?? ROOT;
  const fsImpl = opts.fs ?? fs;
  const execFileImpl = opts.execFile ?? execFile;
  const realpath = (p) => {
    try { return fsImpl.realpathSync(p); } catch { return p; }
  };
  return new Promise((resolve) => {
    let repoRoot;
    let target;
    if (override) {
      repoRoot = path.resolve(override);
      try { target = realpath(filePath); } catch { target = filePath; }
    } else {
      target = realpath(filePath);
      // Same realpath as appRoot → no symlink → fork stub. Skip.
      const targetDir = path.dirname(target);
      const appReal = realpath(appRoot);
      if (targetDir === path.join(appReal, 'data')) {
        resolve(null);
        return;
      }
      // Ask git for the toplevel of the target dir.
      execFileImpl('git', ['-C', targetDir, 'rev-parse', '--show-toplevel'], { timeout: 3000 }, (err, out) => {
        if (err) { resolve(null); return; }
        const root = String(out).trim();
        if (!root) { resolve(null); return; }
        const rel = path.relative(root, target);
        resolve({ repoRoot: root, relPath: rel });
      });
      return;
    }
    // Override branch — verify it's actually a git repo.
    execFileImpl('git', ['-C', repoRoot, 'rev-parse', '--show-toplevel'], { timeout: 3000 }, (err, out) => {
      if (err) { resolve(null); return; }
      const root = String(out).trim();
      const rel = path.relative(root, target);
      // If the file isn't inside the override repo, the override is wrong — skip.
      if (rel.startsWith('..') || path.isAbsolute(rel)) { resolve(null); return; }
      resolve({ repoRoot: root, relPath: rel });
    });
  });
}

// Best-effort post-deploy hooks: git commit+push, then Vercel deploy hook.
// Returns { git, vercel } describing each step's outcome — never throws.
// Each step is opt-in via env; missing config produces { skipped: true }
// with a human-readable reason so the editor can surface "not configured".
export async function _runPostDeployHooks(filePath, opts = {}) {
  const env = opts.env ?? process.env;
  const execFileImpl = opts.execFile ?? execFile;
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const fsImpl = opts.fs ?? fs;
  const appRoot = opts.appRoot ?? ROOT;

  const out = { git: { skipped: true }, vercel: { skipped: true } };

  // ── Git commit + push
  const target = await _resolveCatalogRepo(filePath, {
    envRepo: env.CATALOG_GIT_REPO,
    execFile: execFileImpl,
    fs: fsImpl,
    appRoot,
  });
  if (!target) {
    out.git = { skipped: true, reason: 'CATALOG_GIT_REPO not set and catalog file is not a symlink to another repo' };
  } else {
    out.git = await _gitCommitAndPush(target, execFileImpl, env);
  }

  // ── Vercel deploy hook
  const hookUrl = env.VERCEL_DEPLOY_HOOK_URL;
  if (!hookUrl) {
    out.vercel = { skipped: true, reason: 'VERCEL_DEPLOY_HOOK_URL not set' };
  } else if (!/^https:\/\/api\.vercel\.com\/v[0-9]+\/integrations\/deploy\//.test(hookUrl)) {
    out.vercel = { skipped: true, reason: 'VERCEL_DEPLOY_HOOK_URL does not look like a Vercel deploy hook' };
  } else if (out.git.skipped || out.git.error || out.git.pushed !== true) {
    // Don't trigger Vercel when the catalog wasn't actually pushed —
    // Vercel would just rebuild with the old getbased-tools HEAD.
    // Covers: skipped (no symlink/override), errored, committed-but-push-failed,
    // and idempotent no-op (committed === false because nothing was staged).
    const reason = out.git.error
      ? 'skipped because git push failed'
      : out.git.committed === false
        ? 'skipped because no catalog changes were committed'
        : 'skipped because catalog was not pushed';
    out.vercel = { skipped: true, reason };
  } else {
    try {
      const resp = await fetchImpl(hookUrl, { method: 'POST' });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        out.vercel = { triggered: false, error: `Vercel hook returned ${resp.status}: ${text.slice(0, 200)}` };
      } else {
        const j = await resp.json().catch(() => ({}));
        out.vercel = { triggered: true, jobId: j?.job?.id || null };
      }
    } catch (e) {
      out.vercel = { triggered: false, error: String(e?.message || e) };
    }
  }

  return out;
}

function _execGit(cwd, args, execFileImpl, opts = {}) {
  return new Promise((resolve) => {
    execFileImpl('git', ['-C', cwd, ...args], { timeout: opts.timeout ?? 30_000 }, (err, stdout, stderr) => {
      resolve({ code: err?.code ?? 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), err });
    });
  });
}

async function _gitCommitAndPush(target, execFileImpl, env) {
  const { repoRoot, relPath } = target;
  const message = env.CATALOG_COMMIT_MSG || 'catalog: deploy from editor';

  // Stage just the catalog file (don't sweep up stray edits in the repo).
  const add = await _execGit(repoRoot, ['add', '--', relPath], execFileImpl);
  if (add.err) return { skipped: false, error: 'git add failed: ' + (add.stderr || add.err.message) };

  // Idempotent: nothing staged → no commit, no push, no error.
  const diff = await _execGit(repoRoot, ['diff', '--cached', '--quiet', '--', relPath], execFileImpl);
  if (diff.code === 0) {
    // Already-clean — return current HEAD so the UI can still link to it.
    const head = await _execGit(repoRoot, ['rev-parse', 'HEAD'], execFileImpl);
    return { skipped: false, committed: false, pushed: false, sha: head.stdout.trim() || null, reason: 'no catalog changes to commit' };
  }

  const commit = await _execGit(repoRoot, ['commit', '-m', message, '--', relPath], execFileImpl);
  if (commit.err) return { skipped: false, error: 'git commit failed: ' + (commit.stderr || commit.err.message) };

  const sha = (await _execGit(repoRoot, ['rev-parse', 'HEAD'], execFileImpl)).stdout.trim();

  // Push current branch to its upstream. Use HEAD so feature-branch workflows
  // still work; if there's no upstream, surface the error.
  const push = await _execGit(repoRoot, ['push', 'origin', 'HEAD'], execFileImpl, { timeout: 60_000 });
  if (push.err) {
    return { skipped: false, committed: true, pushed: false, sha, error: 'git push failed: ' + (push.stderr || push.err.message).slice(0, 400) };
  }
  return { skipped: false, committed: true, pushed: true, sha };
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
function isSameOrigin(req) {
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
function _isLoopbackSocket(req) {
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
function _isHostOriginMatch(req) {
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
function corsHeaders(req) {
  const origin = req.headers.origin && ALLOWED_ORIGINS.has(req.headers.origin)
    ? req.headers.origin
    : (req.headers.referer ? (() => { try { return ALLOWED_ORIGINS.has(new URL(req.headers.referer).origin) ? new URL(req.headers.referer).origin : null; } catch { return null; } })() : null);
  return origin ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {};
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
    if (!_isAllowedProxyUrl(target)) {
      res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) });
      res.end(JSON.stringify({ status: 0, error: 'URL blocked by SSRF guard' }));
      return;
    }
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
        // Follow one redirect — re-check destination through SSRF guard so an
        // allowlisted host can't 30x into a private IP.
        if (depth === 0 && [301, 302, 307, 308].includes(pageRes.statusCode) && pageRes.headers.location) {
          const loc = new URL(pageRes.headers.location, fetchUrl).href;
          if (!_isAllowedProxyUrl(loc)) {
            res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders(req) });
            res.end(JSON.stringify({ status: 0, error: 'Redirect destination blocked by SSRF guard' }));
            return;
          }
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
          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders(req) });
          res.end(JSON.stringify({ status: pageRes.statusCode, html: body }));
        });
      }).on('error', (e) => {
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders(req) });
        res.end(JSON.stringify({ status: 0, error: e.message }));
      }).on('timeout', function() { this.destroy(); });
    };
    fetchPage(target, 0);
    return;
  }

  // API: fetch page with headless Chrome (for SPA shops)
  if (pathname === '/api/fetch-page-rendered') {
    const target = url.searchParams.get('url');
    if (!target) { res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) }); res.end('{"error":"missing url param"}'); return; }
    if (!_isAllowedProxyUrl(target)) {
      res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) });
      res.end(JSON.stringify({ status: 0, error: 'URL blocked by SSRF guard' }));
      return;
    }
    const scriptPath = path.join(ROOT, 'tools', 'fetch-rendered.mjs');
    execFile('node', [scriptPath, target], { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders(req) });
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

        // Self-host OAuth client_id overrides — surfaces *_CLIENT_ID env values
        // to the browser so self-hosters can run their own OAuth apps without
        // patching js/wearable-adapters.js. Hosted users get an empty map and
        // keep the hardcoded maintainer values. See issue #145.
        if (payload.wearable_runtime_config) {
          const overrides = collectWearableOverrides(process.env);
          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders(req) });
          res.end(JSON.stringify({ overrides }));
          return;
        }

        // Oura OAuth2 token exchange/refresh — proxies secret-bearing request
        // to api.ouraring.com/oauth/token with OURA_CLIENT_SECRET from env.
        if (payload.oura_token_exchange || payload.oura_token_refresh) {
          const secret = process.env.OURA_CLIENT_SECRET;
          if (!secret) {
            res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders(req) });
            res.end(JSON.stringify({ error: 'OURA_CLIENT_SECRET not set — export it before `node dev-server.js`' }));
            return;
          }
          let form;
          if (payload.oura_token_exchange) {
            const { code, redirect_uri, client_id } = payload.oura_token_exchange;
            if (!code || !redirect_uri || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) });
              res.end('{"error":"oura_token_exchange requires code, redirect_uri, client_id"}'); return;
            }
            form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri, client_id, client_secret: secret });
          } else {
            const { refresh_token, client_id } = payload.oura_token_refresh;
            if (!refresh_token || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) });
              res.end('{"error":"oura_token_refresh requires refresh_token, client_id"}'); return;
            }
            form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token, client_id, client_secret: secret });
          }
          const tokenReq = https.request('https://api.ouraring.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          }, (tokenRes) => {
            const ct = tokenRes.headers['content-type'] || 'application/json';
            res.writeHead(tokenRes.statusCode, { 'Content-Type': ct, ...corsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
            tokenRes.pipe(res);
          });
          tokenReq.on('error', (e) => {
            res.writeHead(502, { 'Content-Type': 'application/json', ...corsHeaders(req) });
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
            res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders(req) });
            res.end(JSON.stringify({ error: 'ULTRAHUMAN_CLIENT_SECRET not set — add it to .env.local' }));
            return;
          }
          let form;
          if (payload.ultrahuman_token_exchange) {
            const { code, redirect_uri, client_id } = payload.ultrahuman_token_exchange;
            if (!code || !redirect_uri || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) });
              res.end('{"error":"ultrahuman_token_exchange requires code, redirect_uri, client_id"}'); return;
            }
            form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri, client_id, client_secret: secret });
          } else {
            const { refresh_token, client_id } = payload.ultrahuman_token_refresh;
            if (!refresh_token || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) });
              res.end('{"error":"ultrahuman_token_refresh requires refresh_token, client_id"}'); return;
            }
            form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token, client_id, client_secret: secret });
          }
          const tokenReq = https.request('https://partner.ultrahuman.com/api/partners/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          }, (tokenRes) => {
            const ct = tokenRes.headers['content-type'] || 'application/json';
            res.writeHead(tokenRes.statusCode, { 'Content-Type': ct, ...corsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
            tokenRes.pipe(res);
          });
          tokenReq.on('error', (e) => {
            res.writeHead(502, { 'Content-Type': 'application/json', ...corsHeaders(req) });
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
            res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders(req) });
            res.end(JSON.stringify({ error: 'WITHINGS_CLIENT_SECRET not set — export it before `node dev-server.js`' }));
            return;
          }
          let form;
          if (payload.withings_token_exchange) {
            const { code, redirect_uri, client_id } = payload.withings_token_exchange;
            if (!code || !redirect_uri || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) });
              res.end('{"error":"withings_token_exchange requires code, redirect_uri, client_id"}'); return;
            }
            form = new URLSearchParams({
              action: 'requesttoken', grant_type: 'authorization_code',
              client_id, client_secret: secret, code, redirect_uri,
            });
          } else {
            const { refresh_token, client_id } = payload.withings_token_refresh;
            if (!refresh_token || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) });
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
            res.writeHead(tokenRes.statusCode, { 'Content-Type': ct, ...corsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
            tokenRes.pipe(res);
          });
          tokenReq.on('error', (e) => {
            res.writeHead(502, { 'Content-Type': 'application/json', ...corsHeaders(req) });
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
            res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders(req) });
            res.end(JSON.stringify({ error: 'POLAR_CLIENT_SECRET not set — add it to .env.local before `node dev-server.js`' }));
            return;
          }
          let form, clientId;
          if (payload.polar_token_exchange) {
            const { code, redirect_uri, client_id } = payload.polar_token_exchange;
            if (!code || !redirect_uri || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) });
              res.end('{"error":"polar_token_exchange requires code, redirect_uri, client_id"}'); return;
            }
            clientId = client_id;
            form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri });
          } else {
            const { refresh_token, client_id } = payload.polar_token_refresh;
            if (!refresh_token || !client_id) {
              res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) });
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
            res.writeHead(tokenRes.statusCode, { 'Content-Type': ct, ...corsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
            tokenRes.pipe(res);
          });
          tokenReq.on('error', (e) => {
            res.writeHead(502, { 'Content-Type': 'application/json', ...corsHeaders(req) });
            res.end(JSON.stringify({ error: 'Polar token endpoint unreachable: ' + e.message }));
          });
          tokenReq.write(form.toString());
          tokenReq.end();
          return;
        }

        // CAMS atmosphere relay → getbased-uvdata. Mirrors the
        // handleCamsRelay block in api/proxy.js so localhost dev can
        // exercise the same flow against a real upstream. Uses the
        // maintainer-hosted relay by default; UVDATA_UPSTREAM can override
        // it for self-host/dev testing, and UVDATA_BEARER is injected when
        // present.
        if (payload.meteo === 'cams') {
          const configuredUpstream = process.env.UVDATA_UPSTREAM ? process.env.UVDATA_UPSTREAM.replace(/\/+$/, '') : '';
          const upstream = configuredUpstream || DEFAULT_UVDATA_UPSTREAM;
          const bearer = process.env.UVDATA_BEARER || '';
          if (!upstream) {
            res.writeHead(503, { 'Content-Type': 'application/json', ...corsHeaders(req) });
            res.end(JSON.stringify({
              error: 'CAMS relay upstream is empty. Set UVDATA_UPSTREAM or switch Sun Data Source to Open-Meteo/manual.',
            }));
            return;
          }
          if (!configuredUpstream && !bearer) {
            res.writeHead(503, { 'Content-Type': 'application/json', ...corsHeaders(req) });
            res.end(JSON.stringify({
              error: 'CAMS hosted relay requires UVDATA_BEARER. Set UVDATA_BEARER for the hosted default, set UVDATA_UPSTREAM for your own relay, or switch Sun Data Source to Open-Meteo/manual.',
            }));
            return;
          }
          const lat = Number(payload.latitude);
          const lon = Number(payload.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) });
            res.end(JSON.stringify({ error: 'Invalid latitude/longitude' }));
            return;
          }
          const time = typeof payload.time === 'string' ? payload.time : '';
          const qs = new URLSearchParams({ latitude: String(lat), longitude: String(lon) });
          if (time) qs.set('time', time);
          const upstreamUrl = `${upstream}/uv?${qs.toString()}`;
          const upstreamHeaders = { 'Accept': 'application/json' };
          if (bearer) upstreamHeaders['Authorization'] = `Bearer ${bearer}`;
          // Mirror the 256 KB streaming cap from api/proxy.js (Greptile P2
          // closeout `5869341`). A misbehaving upstream that streams an
          // unbounded body would otherwise OOM the dev server.
          const CAMS_RESPONSE_CAP_BYTES = 256 * 1024;
          const camsReq = https.request(upstreamUrl, { method: 'GET', headers: upstreamHeaders }, (camsRes) => {
            const ct = camsRes.headers['content-type'] || 'application/json';
            res.writeHead(camsRes.statusCode, { 'Content-Type': ct, ...corsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
            let bytesPiped = 0;
            let aborted = false;
            camsRes.on('data', (chunk) => {
              if (aborted) return;
              bytesPiped += chunk.length;
              if (bytesPiped > CAMS_RESPONSE_CAP_BYTES) {
                aborted = true;
                try { camsRes.destroy(); } catch (_) {}
                try { res.end(); } catch (_) {}
                return;
              }
              try { res.write(chunk); } catch (_) {}
            });
            camsRes.on('end', () => { if (!aborted) try { res.end(); } catch (_) {} });
            camsRes.on('error', () => { if (!aborted) try { res.end(); } catch (_) {} });
          });
          camsReq.on('error', (e) => {
            res.writeHead(502, { 'Content-Type': 'application/json', ...corsHeaders(req) });
            res.end(JSON.stringify({ error: 'CAMS upstream unreachable: ' + e.message }));
          });
          camsReq.end();
          return;
        }

        const { url: targetUrl, headers: fwdHeaders, body: fwdBody, method: upMethod } = payload;
        if (!targetUrl) { res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) }); res.end('{"error":"missing url"}'); return; }
        if (!_isAllowedProxyUrl(targetUrl)) {
          res.writeHead(403, { 'Content-Type': 'application/json', ...corsHeaders(req) });
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
          res.writeHead(proxyRes.statusCode, { 'Content-Type': ct, ...corsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
          proxyRes.pipe(res);
        });
        proxyReq.on('error', (e) => {
          res.writeHead(502, { 'Content-Type': 'application/json', ...corsHeaders(req) });
          res.end(JSON.stringify({ error: 'Upstream error: ' + e.message }));
        });
        if (fetchMethod !== 'GET' && fwdBody) {
          proxyReq.write(typeof fwdBody === 'string' ? fwdBody : JSON.stringify(fwdBody));
        }
        proxyReq.end();
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: 'Invalid JSON: ' + e.message }));
      }
    });
    return;
  }
  if (pathname === '/api/proxy' && req.method === 'OPTIONS') {
    res.writeHead(204, { ...corsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }

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
if (_isDirectRun) server.listen(PORT, HOST, () => {
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
});
