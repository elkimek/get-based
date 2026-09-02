import http from 'node:http';

const AGENT_PROPOSAL_PROXY_MAX_BYTES = 80 * 1024;

export function _resolveAgentProposalProxyTarget(gatewayUrl, pathname) {
  let base;
  try { base = new URL(String(gatewayUrl || '')); } catch { throw new Error('Agent proposal gateway must be a loopback HTTP URL.'); }
  if (base.protocol !== 'http:'
      || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
      || base.username || base.password
      || (base.pathname !== '/' && base.pathname !== '')) {
    throw new Error('Agent proposal gateway must be a loopback HTTP URL.');
  }
  if (!/^\/api\/agent-proposals(?:\/proposal_[A-Za-z0-9_-]{6,112})?$/u.test(String(pathname || ''))) {
    throw new Error('Invalid Agent proposal proxy path.');
  }
  return new URL(pathname, base);
}

export function _handleAgentProposalDevProxy(req, res, { gatewayUrl = process.env.AGENT_PROPOSAL_GATEWAY_URL } = {}) {
  return new Promise((resolve) => {
    let target;
    try { target = _resolveAgentProposalProxyTarget(gatewayUrl, req.url); } catch {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end('{"error":"agent_proposal_proxy_disabled"}');
      resolve();
      return;
    }
    const method = String(req.method || 'GET').toUpperCase();
    if (!['GET', 'POST', 'DELETE'].includes(method)) {
      res.writeHead(405, { Allow: 'GET, POST, DELETE' });
      res.end();
      resolve();
      return;
    }
    const chunks = [];
    let size = 0;
    let finished = false;
    const finish = () => { if (!finished) { finished = true; resolve(); } };
    req.on('data', chunk => {
      size += chunk.length;
      if (size > AGENT_PROPOSAL_PROXY_MAX_BYTES) req.destroy(new Error('request_too_large'));
      else chunks.push(chunk);
    });
    req.on('error', () => {
      if (!res.headersSent) res.writeHead(size > AGENT_PROPOSAL_PROXY_MAX_BYTES ? 413 : 400, { 'Content-Type': 'application/json' });
      res.end(size > AGENT_PROPOSAL_PROXY_MAX_BYTES ? '{"error":"request_too_large"}' : '{"error":"invalid_request"}');
      finish();
    });
    req.on('end', () => {
      if (finished) return;
      const body = Buffer.concat(chunks);
      const upstream = http.request(target, {
        method,
        timeout: 5000,
        headers: {
          ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
          ...(method === 'POST' ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {}),
        },
      }, upstreamRes => {
        const responseChunks = [];
        let responseSize = 0;
        upstreamRes.on('data', chunk => {
          responseSize += chunk.length;
          if (responseSize > AGENT_PROPOSAL_PROXY_MAX_BYTES) upstreamRes.destroy(new Error('response_too_large'));
          else responseChunks.push(chunk);
        });
        upstreamRes.on('end', () => {
          if (finished) return;
          res.writeHead(upstreamRes.statusCode || 502, {
            'Content-Type': upstreamRes.headers['content-type'] || 'application/json',
            'Cache-Control': 'no-store',
          });
          res.end(Buffer.concat(responseChunks));
          finish();
        });
        upstreamRes.on('error', () => {
          if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end('{"error":"proposal_gateway_failed"}');
          finish();
        });
      });
      upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end('{"error":"proposal_gateway_unavailable"}');
        finish();
      });
      if (body.length) upstream.write(body);
      upstream.end();
    });
  });
}
