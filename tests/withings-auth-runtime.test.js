import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  completeOAuthCallback,
  refreshTokens,
} from '../js/wearables-withings-auth.js';

const realFetch = globalThis.fetch;

function storePendingCallback() {
  sessionStorage.setItem('withings-oauth-pending', JSON.stringify({
    state: 'withings-state',
    redirectUri: 'https://app.getbased.health/',
    startedAt: Date.now(),
    clientId: 'withings-client',
    profileId: 'profile-1',
  }));
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('Withings OAuth proxy failures', () => {
  it('bounds callback exchange time and returns a renderable reconnect error', async () => {
    const timeoutSignal = new AbortController().signal;
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutSignal);
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect(init.signal).toBe(timeoutSignal);
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    storePendingCallback();

    const result = await completeOAuthCallback(
      new URLSearchParams('code=withings-code&state=withings-state'),
    );

    expect(AbortSignal.timeout).toHaveBeenCalledWith(20_000);
    expect(result).toEqual({
      ok: false,
      error: 'Withings token exchange timed out — please connect Withings again',
    });
    expect(sessionStorage.getItem('withings-oauth-pending')).toBeNull();
  });

  it('surfaces refresh transport failures without waiting for the host timeout', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(new AbortController().signal);
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('network unavailable');
    });

    await expect(refreshTokens({
      clientId: 'withings-client',
      refreshToken: 'withings-refresh',
    })).rejects.toMatchObject({
      message: 'Withings token refresh failed — check your connection and try again',
      code: 'network',
      status: 503,
    });
  });
});
