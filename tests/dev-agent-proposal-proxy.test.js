// @vitest-environment node

import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  _handleAgentProposalDevProxy,
  _resolveAgentProposalProxyTarget,
} from '../dev-server.js';

let upstream;
let upstreamPort;
let received;

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
});

afterAll(async () => {
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
