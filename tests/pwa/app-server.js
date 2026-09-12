import http from 'node:http';

// Give each test an isolated origin and controllable releases without rewriting
// the checkout or routing through Playwright (which cannot intercept SW updates).
export async function startPwaServer(upstream) {
  const state = { version: '99.0.1', buildId: 'build-a', holdPath: '', held: 0, offline: false, failPath: '', production: true };
  const sockets = new Set();
  const heldResponses = [];
  const server = http.createServer((req, res) => {
    if (state.offline) { req.socket.destroy(); return; }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === state.failPath) { res.writeHead(503); res.end('Unavailable'); return; }
    if (pathname === '/api/commit') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ cacheKey: `pwa-${state.version}` }));
      return;
    }
    const target = new URL(req.url, upstream);
    const hold = pathname === state.holdPath;
    const rewrite = pathname === '/service-worker.js' || pathname === '/version.js';
    const headers = { ...req.headers, host: target.host };
    if (rewrite) headers['accept-encoding'] = 'identity';
    const outgoing = http.request(target, { method: req.method, headers }, incoming => {
      const headers = { ...incoming.headers, 'cache-control': 'no-store' };
      delete headers['content-length'];
      res.writeHead(incoming.statusCode, headers);
      if (rewrite) {
        let source = '';
        incoming.setEncoding('utf8');
        incoming.on('data', chunk => { source += chunk; });
        incoming.on('end', () => {
          if (pathname === '/version.js') source = source.replace(/self\.APP_VERSION = '[^']+'/, `self.APP_VERSION = '${state.version}'`) + `\nself.APP_BUILD_ID = '${state.buildId}';\n`;
          else {
            if (state.production) source = source.replace('IS_PROD = PROD_HOSTS.has(self.location.hostname)', 'IS_PROD = true');
            source = source.replace("const BUILD_ID = '';", `const BUILD_ID = '${state.buildId}';`);
          }
          res.end(source);
        });
      } else if (hold) {
        state.held += 1;
        heldResponses.push(() => incoming.pipe(res));
      } else incoming.pipe(res);
    });
    outgoing.on('error', () => res.destroy());
    req.pipe(outgoing);
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    state,
    release() { state.holdPath = ''; for (const resume of heldResponses.splice(0)) resume(); },
    origin: `http://127.0.0.1:${server.address().port}`,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
