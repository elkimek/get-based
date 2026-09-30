import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeOAuthCallbackState } from '../js/wearable-oauth-state.js';
import { completeOAuthCallback as oura } from '../js/wearables-oura-auth.js';
import { completeOAuthCallback as polar } from '../js/wearables-polar-auth.js';
import { completeOAuthCallback as ultrahuman } from '../js/wearables-ultrahuman-auth.js';
import { completeOAuthCallback as whoop } from '../js/wearables-whoop-auth.js';
import { completeOAuthCallback as withings } from '../js/wearables-withings-auth.js';
import { completeOAuthCallback as fitbit } from '../js/wearables-fitbit-auth.js';
import { completeOAuthCallback as googleHealth } from '../js/wearables-google-health-auth.js';

const now = 1_000_000;
const params = new URLSearchParams('code=unused-code&state=expected-state');
const fetchMock = vi.fn(async () => new Response('{}'));
const providers = [
  ['oura', oura], ['polar', polar], ['ultrahuman', ultrahuman],
  ['whoop', whoop], ['withings', withings], ['fitbit', fitbit],
  ['google_health', googleHealth],
] as const;

function storePending(key: string, startedAt = now - 600_001, state = 'expected-state') {
  const pending = { state, startedAt, clientId: 'unused-client', redirectUri: 'https://example.test/' };
  sessionStorage.setItem(key, JSON.stringify(pending));
  return pending;
}

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('wearable OAuth callback security', () => {
  it.each(providers)('%s rejects and consumes expired state before exchanging credentials', async (provider, complete) => {
    const key = `${provider}-oauth-pending`;
    storePending(key);
    await expect(complete(params)).resolves.toEqual({
      ok: false, error: 'OAuth flow expired — please try connecting again',
    });
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts the exact ten-minute boundary and consumes the state', () => {
    const pending = storePending('boundary', now - 600_000);
    expect(consumeOAuthCallbackState(params, 'boundary', 'Boundary')).toEqual({
      ok: true, code: 'unused-code', pending,
    });
    expect(sessionStorage.getItem('boundary')).toBeNull();
  });

  it('consumes mismatched state before rejecting CSRF', () => {
    storePending('mismatch', now, 'wrong-state');
    expect(consumeOAuthCallbackState(params, 'mismatch', 'Mismatch')).toEqual({
      ok: false, error: 'State mismatch — possible CSRF, aborting',
    });
    expect(sessionStorage.getItem('mismatch')).toBeNull();
  });

  it('consumes malformed state before reporting the parse failure', () => {
    sessionStorage.setItem('corrupt', '{');
    expect(consumeOAuthCallbackState(params, 'corrupt', 'Corrupt')).toEqual({
      ok: false, error: 'Corrupt pending state',
    });
    expect(sessionStorage.getItem('corrupt')).toBeNull();
  });
});
