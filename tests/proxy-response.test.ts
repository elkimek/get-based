import { describe, expect, it, vi } from 'vitest';
import { proxyJsonResponse } from '../lib/proxy-response.js';
import type { ProxyCaller } from '../lib/proxy-policy.js';

describe('shared proxy JSON responses', () => {
  it('preserves status, JSON bytes, CORS and no-store headers', async () => {
    const req = new Request('https://app.getbased.health/api/proxy', {
      headers: { origin: 'https://app.getbased.health' },
    });
    const response = proxyJsonResponse(req, 429, { error: 'rate limit', retryAfterSeconds: 60 }, () => ({ 'Retry-After': '60' }));
    expect(response.status).toBe(429);
    expect(await response.text()).toBe('{"error":"rate limit","retryAfterSeconds":60}');
    expect(Object.fromEntries(response.headers)).toEqual({
      'access-control-allow-headers': 'Content-Type',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-origin': 'https://app.getbased.health',
      'cache-control': 'no-store',
      'content-type': 'application/json',
      'retry-after': '60',
      vary: 'Origin',
    });
  });

  it('serializes before reading CORS inputs and evaluating extra headers', () => {
    const trace: string[] = [];
    const req: ProxyCaller = {
      get url() { trace.push('url'); return 'https://app.getbased.health/api/proxy'; },
      headers: { get(name) { trace.push(`header:${name}`); return 'https://app.getbased.health'; } },
    };
    const payload = { toJSON() { trace.push('json'); return { ok: true }; } };
    proxyJsonResponse(req, 200, payload, () => { trace.push('extra'); return { 'Retry-After': '1' }; });
    expect(trace).toEqual(['json', 'header:origin', 'header:origin', 'url', 'extra']);
  });

  it('leaves headers unread when JSON serialization fails', () => {
    const get = vi.fn(() => null), extra = vi.fn(() => ({}));
    const req: ProxyCaller = { url: 'https://app.getbased.health/api/proxy', headers: { get } };
    const payload = { toJSON() { throw new Error('serialization failed'); } };
    expect(() => proxyJsonResponse(req, 500, payload, extra)).toThrow('serialization failed');
    expect(get).not.toHaveBeenCalled();
    expect(extra).not.toHaveBeenCalled();
  });

  it('retains the caller-origin rejection in the shared header policy', () => {
    const req = new Request('https://app.getbased.health/api/proxy', { headers: { origin: 'https://attacker.example' } });
    expect(proxyJsonResponse(req, 403, { error: 'Origin not allowed.' }).headers.has('Access-Control-Allow-Origin')).toBe(false);
  });
});
