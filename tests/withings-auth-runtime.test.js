import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  completeOAuthCallback,
  refreshTokens,
} from '../js/wearables-withings-auth.js';

const realFetch = globalThis.fetch;
let savedAbortSignalTimeoutDescriptor;

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
  savedAbortSignalTimeoutDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = realFetch;
  if (savedAbortSignalTimeoutDescriptor) {
    Object.defineProperty(AbortSignal, 'timeout', savedAbortSignalTimeoutDescriptor);
  } else {
    delete AbortSignal.timeout;
  }
  vi.restoreAllMocks();
});

describe('Withings OAuth proxy failures', () => {
  it('bounds callback exchange time without AbortSignal.timeout and returns a renderable reconnect error', async () => {
    vi.useFakeTimers();
    Object.defineProperty(AbortSignal, 'timeout', {
      configurable: true,
      value: undefined,
    });
    let requestSignal;
    globalThis.fetch = vi.fn((_url, init) => {
      requestSignal = init.signal;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      });
    });
    storePendingCallback();

    const resultPromise = completeOAuthCallback(
      new URLSearchParams('code=withings-code&state=withings-state'),
    );
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await resultPromise;

    expect(requestSignal).toBeInstanceOf(AbortSignal);
    expect(requestSignal.aborted).toBe(true);
    expect(result).toEqual({
      ok: false,
      error: 'Withings token exchange timed out — please connect Withings again',
    });
    expect(sessionStorage.getItem('withings-oauth-pending')).toBeNull();
  });

  it('surfaces refresh transport failures without waiting for the host timeout', async () => {
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

  it('keeps the callback deadline active while the response body is pending', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: () => new Promise(() => {}),
    }));
    storePendingCallback();

    const resultPromise = completeOAuthCallback(
      new URLSearchParams('code=withings-code&state=withings-state'),
    );
    await vi.advanceTimersByTimeAsync(20_000);

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      error: 'Withings token exchange timed out — please connect Withings again',
    });
  });
});
