// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadAgentProposalDogfoodAccess,
} from '../js/agent-proposal-dogfood-bootstrap.js';
import {
  _handleAgentProposalDogfoodBootstrap,
} from '../lib/dev-agent-proposal-dogfood.js';

const TEST_TOKEN = 'a'.repeat(64);
const TEST_CONTEXT_KEY = `gbctx_v1_${'A'.repeat(43)}`;
const tempDirs = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function mockRequest({ method = 'GET', header = 'agent-proposals-v1' } = {}) {
  return {
    method,
    headers: { 'x-getbased-dogfood-bootstrap': header },
  };
}

function mockResponse() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = '') {
      this.body = String(body);
    },
  };
}

function createCredentialsFile(mode = 0o600) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-dogfood-'));
  tempDirs.push(dir);
  const envFile = path.join(dir, 'agent-access.env');
  fs.writeFileSync(envFile, [
    `GETBASED_TOKEN=${TEST_TOKEN}`,
    `GETBASED_AGENT_CONTEXT_KEY=${TEST_CONTEXT_KEY}`,
    'GETBASED_GATEWAY=https://example.invalid',
  ].join('\n'));
  fs.chmodSync(envFile, mode);
  return envFile;
}

describe('disposable proposal dogfood bootstrap endpoint', () => {
  it('stays disabled unless explicitly configured', () => {
    const res = mockResponse();

    _handleAgentProposalDogfoodBootstrap(mockRequest(), res, { env: {} });

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain(TEST_TOKEN);
  });

  it('rejects requests without the explicit same-app bootstrap header', () => {
    const res = mockResponse();

    _handleAgentProposalDogfoodBootstrap(mockRequest({ header: '' }), res, {
      env: {
        AGENT_PROPOSAL_DOGFOOD_ENABLED: '1',
        AGENT_PROPOSAL_DOGFOOD_ENV_FILE: createCredentialsFile(),
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain(TEST_TOKEN);
  });

  it('returns validated disposable credentials only from a private env file', () => {
    const res = mockResponse();

    _handleAgentProposalDogfoodBootstrap(mockRequest(), res, {
      env: {
        AGENT_PROPOSAL_DOGFOOD_ENABLED: '1',
        AGENT_PROPOSAL_DOGFOOD_ENV_FILE: createCredentialsFile(),
        AGENT_PROPOSAL_DOGFOOD_PROFILE_ID: 'default',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    expect(JSON.parse(res.body)).toEqual({
      version: 1,
      profileId: 'default',
      token: TEST_TOKEN,
      contextKey: TEST_CONTEXT_KEY,
    });
  });

  it('refuses a credentials file readable by other users', () => {
    const res = mockResponse();

    _handleAgentProposalDogfoodBootstrap(mockRequest(), res, {
      env: {
        AGENT_PROPOSAL_DOGFOOD_ENABLED: '1',
        AGENT_PROPOSAL_DOGFOOD_ENV_FILE: createCredentialsFile(0o644),
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain(TEST_TOKEN);
  });
});

describe('loopback proposal dogfood client bootstrap', () => {
  it('does nothing without explicit mode or outside a loopback origin', async () => {
    const fetchImpl = vi.fn();

    await expect(loadAgentProposalDogfoodAccess({
      pageUrl: 'http://127.0.0.1:8198/app?agentProposalGateway=/api',
      currentProfileId: 'default',
      fetchImpl,
    })).resolves.toEqual({ requested: false, access: null });
    await expect(loadAgentProposalDogfoodAccess({
      pageUrl: 'https://app.getbased.health/app?agentProposalDogfood=1',
      currentProfileId: 'default',
      fetchImpl,
    })).resolves.toEqual({ requested: false, access: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('loads matching disposable credentials without persisting them', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      profileId: 'default',
      token: TEST_TOKEN,
      contextKey: TEST_CONTEXT_KEY,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await loadAgentProposalDogfoodAccess({
      pageUrl: 'http://127.0.0.1:8198/app?agentProposalGateway=/api&agentProposalDogfood=1',
      currentProfileId: 'default',
      fetchImpl,
    });

    expect(result).toEqual({
      requested: true,
      access: {
        enabled: true,
        token: TEST_TOKEN,
        contextKey: TEST_CONTEXT_KEY,
      },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8198/api/agent-proposal-dogfood-bootstrap',
      {
        cache: 'no-store',
        headers: { 'X-GetBased-Dogfood-Bootstrap': 'agent-proposals-v1' },
      },
    );
  });

  it('rejects a mismatched profile or malformed credential payload', async () => {
    const mismatched = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      profileId: 'other-profile',
      token: TEST_TOKEN,
      contextKey: TEST_CONTEXT_KEY,
    }), { status: 200 }));
    const malformed = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      profileId: 'default',
      token: 'not-a-token',
      contextKey: TEST_CONTEXT_KEY,
    }), { status: 200 }));

    await expect(loadAgentProposalDogfoodAccess({
      pageUrl: 'http://localhost:8198/app?agentProposalDogfood=1',
      currentProfileId: 'default',
      fetchImpl: mismatched,
    })).resolves.toEqual({ requested: true, access: null, error: 'profile_mismatch' });
    await expect(loadAgentProposalDogfoodAccess({
      pageUrl: 'http://localhost:8198/app?agentProposalDogfood=1',
      currentProfileId: 'default',
      fetchImpl: malformed,
    })).resolves.toEqual({ requested: true, access: null, error: 'invalid_bootstrap' });
  });
});

describe('proposal dogfood startup wiring', () => {
  it('loads disposable access before the first proposal poll and exposes the dev-only endpoint', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const startup = fs.readFileSync(path.join(root, 'js/startup-orchestrator.js'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'dev-server.js'), 'utf8');

    expect(startup).toContain("from './agent-proposal-dogfood-bootstrap.js'");
    expect(startup.indexOf('await loadAgentProposalDogfoodAccess')).toBeGreaterThan(0);
    expect(startup.indexOf('await loadAgentProposalDogfoodAccess')).toBeLessThan(startup.indexOf('startAgentProposalPolling()'));
    expect(startup).toContain('configureAgentAccessProposalDeps');
    expect(server).toContain("from './lib/dev-agent-proposal-dogfood.js'");
    expect(server).toContain("pathname === '/api/agent-proposal-dogfood-bootstrap'");
    expect(server).toContain('_handleAgentProposalDogfoodBootstrap(req, res)');
  });
});
