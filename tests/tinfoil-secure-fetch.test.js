import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const secureMocks = vi.hoisted(() => ({
  clients: [],
  verification: { securityVerified: true, hpkePublicKey: 'verified-hpke-key' },
  decryptResponseWithToken: vi.fn(async response => response),
  encryptRequestWithContext: vi.fn(async request => ({ request, context: { sender: true } })),
  extractSessionRecoveryToken: vi.fn(async () => ({ token: true })),
  fromPublicKeyHex: vi.fn(),
}));

vi.mock('../vendor/tinfoil-browser.js', () => ({
  SecureClient: class SecureClient {
    constructor(options) {
      this.options = options;
      this.ready = vi.fn(async () => {});
      this.reset = vi.fn();
      secureMocks.clients.push(this);
    }
    getVerificationDocument() {
      return secureMocks.verification;
    }
    getBaseURL() {
      return this.options.baseURL;
    }
    getEnclaveURL() {
      return 'https://verified-enclave.example';
    }
  },
}));

vi.mock('../vendor/ehbp-browser.js', () => {
  class KeyConfigMismatchError extends Error {}
  return {
    Identity: { fromPublicKeyHex: secureMocks.fromPublicKeyHex },
    KeyConfigMismatchError,
    PROTOCOL: {
      PROBLEM_JSON_MEDIA_TYPE: 'application/problem+json',
      KEY_CONFIG_PROBLEM_TYPE: 'urn:ietf:params:ehbp:error:key-config',
      RESPONSE_NONCE_HEADER: 'Ehbp-Response-Nonce',
    },
    decryptResponseWithToken: secureMocks.decryptResponseWithToken,
    extractSessionRecoveryToken: secureMocks.extractSessionRecoveryToken,
  };
});

import {
  clearTinfoilSecureFetchCache,
  createTinfoilSecureFetch,
} from '../js/tinfoil-secure-fetch.js';

const realFetch = globalThis.fetch;

beforeEach(() => {
  secureMocks.clients.length = 0;
  secureMocks.verification = { securityVerified: true, hpkePublicKey: 'verified-hpke-key' };
  secureMocks.decryptResponseWithToken.mockClear();
  secureMocks.encryptRequestWithContext.mockClear();
  secureMocks.extractSessionRecoveryToken.mockClear();
  secureMocks.fromPublicKeyHex.mockReset();
  secureMocks.fromPublicKeyHex.mockResolvedValue({
    encryptRequestWithContext: secureMocks.encryptRequestWithContext,
  });
  clearTinfoilSecureFetchCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  clearTinfoilSecureFetchCache();
});

describe('verified Tinfoil EHBP transport', () => {
  it('fails closed when readiness does not produce a verified EHBP key', async () => {
    secureMocks.verification = { securityVerified: false, hpkePublicKey: '' };

    await expect(createTinfoilSecureFetch({ baseUrl: 'https://node.example' }))
      .rejects.toThrow('did not produce a verified EHBP key');
  });

  it('returns plaintext proxy errors without attempting enclave decryption', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'balance' }), {
      status: 402,
      headers: { 'Content-Type': 'application/json' },
    }));
    const secure = await createTinfoilSecureFetch({ baseUrl: 'https://node.example' });
    const response = await secure.fetch('https://node.example/v1/chat/completions', {
      method: 'POST',
      body: '{"model":"glm-5-2"}',
    });

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: 'balance' });
    expect(secureMocks.decryptResponseWithToken).not.toHaveBeenCalled();
    expect(secureMocks.fromPublicKeyHex).toHaveBeenCalledWith('verified-hpke-key');
  });

  it('rejects a successful plaintext response instead of accepting unverified content', async () => {
    globalThis.fetch = vi.fn(async () => new Response('plaintext success'));
    const secure = await createTinfoilSecureFetch({ baseUrl: 'https://node.example' });

    await expect(secure.fetch('https://node.example/v1/chat/completions', {
      method: 'POST',
      body: '{}',
    })).rejects.toThrow('Missing Ehbp-Response-Nonce');
    expect(secureMocks.decryptResponseWithToken).not.toHaveBeenCalled();
  });

  it('decrypts enclave responses only when the EHBP nonce is present', async () => {
    globalThis.fetch = vi.fn(async () => new Response('ciphertext', {
      headers: { 'Ehbp-Response-Nonce': 'nonce' },
    }));
    const secure = await createTinfoilSecureFetch({ baseUrl: 'https://node.example' });
    const response = await secure.fetch('https://node.example/v1/chat/completions', {
      method: 'POST',
      body: 'encrypted request',
    });

    expect(response.status).toBe(200);
    expect(secureMocks.extractSessionRecoveryToken).toHaveBeenCalledWith({ sender: true });
    expect(secureMocks.decryptResponseWithToken).toHaveBeenCalledOnce();
  });

  it('refuses to send an attested client request to an unrelated origin', async () => {
    globalThis.fetch = vi.fn();
    const secure = await createTinfoilSecureFetch({ baseUrl: 'https://node.example' });
    await expect(secure.fetch('https://attacker.example/v1/chat/completions', {
      method: 'POST',
      body: '{}',
    })).rejects.toThrow('unverified origin');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('re-attests and retries once after an EHBP key rotation response', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        type: 'urn:ietf:params:ehbp:error:key-config',
      }), {
        status: 422,
        headers: { 'Content-Type': 'application/problem+json' },
      }))
      .mockResolvedValueOnce(new Response('ciphertext', {
        headers: { 'Ehbp-Response-Nonce': 'nonce' },
      }));
    const secure = await createTinfoilSecureFetch({ baseUrl: 'https://node.example' });
    const response = await secure.fetch('https://node.example/v1/chat/completions', {
      method: 'POST',
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(secureMocks.clients[0].reset).toHaveBeenCalledOnce();
    expect(secureMocks.clients[0].ready).toHaveBeenCalledTimes(2);
  });
});
