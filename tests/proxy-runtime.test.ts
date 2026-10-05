import { describe, expect, it } from 'vitest';

import { HOSTED_PROXY_API_URL, getProxyApiUrl } from '../js/proxy-runtime.js';

describe('proxy runtime routing', () => {
  it.each([
    'getbased.health',
    'app.getbased.health',
    'beta.getbased.health',
    'get-based.vercel.app',
    'get-based-managed-subscription-v2.vercel.app',
  ])('routes the getbased-operated host %s to the VPS relay', hostname => {
    expect(getProxyApiUrl({ hostname })).toBe(HOSTED_PROXY_API_URL);
  });

  it.each(['localhost', '127.0.0.1', 'health.example.net', 'get-based.example.com']) (
    'keeps the independent deployment %s on its same-origin proxy',
    hostname => {
      expect(getProxyApiUrl({ hostname })).toBe('/api/proxy');
    },
  );
});
