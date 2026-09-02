// @vitest-environment node

import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  _handleAgentProposalDevProxy,
  _resolveAgentProposalProxyTarget,
} from '../dev-server.js';

let upstream;
let upstreamPort;
let received;
let devServer;
let devServerPort;

async function reserveLoopbackPort() {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function startDevServer() {
  devServerPort = await reserveLoopbackPort();
  devServer = spawn(process.execPath, ['dev-server.js', String(devServerPort)], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      AGENT_PROPOSAL_GATEWAY_URL: `http://127.0.0.1:${upstreamPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Dev server did not become ready: ${output}`)), 5000);
    const finish = (callback) => {
      clearTimeout(timeout);
      callback();
    };
    devServer.stdout.on('data', chunk => {
      output += chunk.toString();
      if (output.includes('Dev server running')) finish(resolve);
    });
    devServer.stderr.on('data', chunk => { output += chunk.toString(); });
    devServer.once('exit', code => finish(() => reject(new Error(`Dev server exited early (${code}): ${output}`))));
  });
}

function mockRequest(method, path, body = '', authorization = 'Bearer test-token') {
  const request = Readable.from(body ? [Buffer.from(body)] : []);
  request.method = method;
  request.url = path;
  request.headers = {
    authorization,
    'content-type': 'application/json',
  };
  return request;
}

function mockResponse() {
  return {
    statusCode: null,
    headers: null,
    body: Buffer.alloc(0),
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk = '') {
      this.body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    },
  };
}

beforeAll(async () => {
  upstream = createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      received = {
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
        body: Buffer.concat(chunks).toString(),
      };
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  upstreamPort = upstream.address().port;
  await startDevServer();
});

afterAll(async () => {
  if (devServer?.exitCode === null) {
    const exited = new Promise(resolve => devServer.once('exit', resolve));
    devServer.kill('SIGTERM');
    await exited;
  }
  await new Promise(resolve => upstream.close(resolve));
});

describe('disposable Agent proposal dev proxy', () => {
  it('accepts only a loopback gateway and exact proposal paths', () => {
    expect(_resolveAgentProposalProxyTarget(
      `http://127.0.0.1:${upstreamPort}`,
      '/api/agent-proposals/proposal_test_1',
    ).href).toBe(`http://127.0.0.1:${upstreamPort}/api/agent-proposals/proposal_test_1`);
    expect(() => _resolveAgentProposalProxyTarget(
      'https://sync.getbased.health',
      '/api/agent-proposals',
    )).toThrow(/loopback/i);
    expect(() => _resolveAgentProposalProxyTarget(
      `http://127.0.0.1:${upstreamPort}`,
      '/api/agent-proposals/../context',
    )).toThrow(/path/i);
  });

  it('pins localhost gateways to a literal loopback address', () => {
    expect(_resolveAgentProposalProxyTarget(
      `http://localhost:${upstreamPort}`,
      '/api/agent-proposals',
    ).href).toBe(`http://127.0.0.1:${upstreamPort}/api/agent-proposals`);
  });

  it('rejects raw gateway authorities containing empty userinfo', () => {
    for (const authority of ['@localhost', ':@localhost']) {
      expect(() => _resolveAgentProposalProxyTarget(
        `http://${authority}:${upstreamPort}`,
        '/api/agent-proposals',
      )).toThrow(/loopback/i);
    }
  });

  it('rejects non-canonical separators before URL normalization', () => {
    for (const gateway of [
      String.raw`http:\@localhost:${upstreamPort}`,
      String.raw`http:\\@localhost:${upstreamPort}`,
      `http:/@localhost:${upstreamPort}`,
      String.raw`http:\:@localhost:${upstreamPort}`,
      String.raw`http:\\:@localhost:${upstreamPort}`,
      `http:////@localhost:${upstreamPort}`,
      `http:////:@localhost:${upstreamPort}`,
    ]) {
      expect(() => _resolveAgentProposalProxyTarget(gateway, '/api/agent-proposals')).toThrow(
        /loopback HTTP URL/i,
      );
    }
  });

  it('rejects query-bearing proposal routes before proxying', async () => {
    received = null;
    const response = await fetch(
      `http://127.0.0.1:${devServerPort}/api/agent-proposals?unexpected=query`,
      { headers: { Origin: `http://127.0.0.1:${devServerPort}` } },
    );

    expect(response.status).toBe(404);
    expect(received).toBeNull();
  });

  it('forwards ciphertext requests without exposing or rewriting their body', async () => {
    const body = JSON.stringify({ envelope: { ciphertext: 'opaque-only' } });
    const req = mockRequest('POST', '/api/agent-proposals', body);
    const res = mockResponse();

    await _handleAgentProposalDevProxy(req, res, {
      gatewayUrl: `http://127.0.0.1:${upstreamPort}`,
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.toString()).toBe('{"ok":true}');
    expect(received).toEqual({
      method: 'POST',
      url: '/api/agent-proposals',
      authorization: 'Bearer test-token',
      body,
    });
  });

});
