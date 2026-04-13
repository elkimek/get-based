#!/usr/bin/env node
// Local dev server that mirrors production routing:
//   /        → landing page (from ../get-based-site or SITE_DIR)
//   /app     → the app (index.html)
//   /docs/*  → built VitePress docs
// Usage: node dev-server.js [port]
//        SITE_DIR=/path/to/get-based-site node dev-server.js

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2], 10) || 8000;
const ROOT = __dirname;
const SITE_DIR = process.env.SITE_DIR || path.join(ROOT, '..', 'get-based-site');
const SITE_INDEX = path.join(SITE_DIR, 'index.html');
const hasSite = fs.existsSync(SITE_INDEX);

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

function isSameOrigin(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  return origin.includes(`localhost:${PORT}`) || origin.includes(`127.0.0.1:${PORT}`);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  // Same-origin guard for proxy/API endpoints
  if (pathname.startsWith('/api/') && !isSameOrigin(req)) {
    res.writeHead(403); res.end('Forbidden'); return;
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
    const { execFile } = require('child_process');
    const scriptPath = path.join(ROOT, 'tools', 'fetch-rendered.mjs');
    execFile('node', [scriptPath, target], { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      if (err) { res.end(JSON.stringify({ status: 0, error: err.message })); return; }
      try { JSON.parse(stdout); res.end(stdout); } catch { res.end(JSON.stringify({ status: 0, error: 'Invalid response from renderer' })); }
    });
    return;
  }

  // API: deploy catalog JSON from editor to data/
  if (pathname === '/api/deploy-catalog' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        JSON.parse(body); // validate
        fs.writeFileSync(path.join(ROOT, 'data', 'recommendations-czsk.json'), body);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid JSON: ' + e.message);
      }
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
        const { url: targetUrl, headers: fwdHeaders, body: fwdBody, method: upMethod } = payload;
        if (!targetUrl) { res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end('{"error":"missing url"}'); return; }
        const parsedUrl = new URL(targetUrl);
        const mod = parsedUrl.protocol === 'https:' ? https : http;
        const fetchMethod = (upMethod || 'POST').toUpperCase();
        const reqHeaders = {};
        if (fetchMethod !== 'GET') reqHeaders['Content-Type'] = 'application/json';
        Object.assign(reqHeaders, fwdHeaders);
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Dev server running at http://127.0.0.1:${PORT}`);
  if (hasSite) {
    console.log(`  /        → landing page (${SITE_DIR})`);
    console.log(`  /app     → index.html`);
  } else {
    console.log(`  /        → index.html (no site repo found at ${SITE_DIR})`);
  }
  console.log(`  /docs/*  → dist-docs/*`);
});
