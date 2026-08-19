import { describe, expect, it } from 'vitest';

import {
  SELF_HOSTED_WEARABLE_MESSAGE,
  isOfficialGetbasedHost,
} from '../js/url-safety.js';
import {
  adapterById,
  isWearableRelayUnavailable,
} from '../js/wearable-adapters.js';

describe('official hosted plaintext boundary', () => {
  it.each([
    'getbased.health',
    'app.getbased.health',
    'beta.getbased.health',
    'get-based.vercel.app',
  ])('recognizes operator-hosted domain %s', hostname => {
    expect(isOfficialGetbasedHost({ hostname })).toBe(true);
  });

  it.each(['localhost', '127.0.0.1', 'health.example.net', 'my-health-app.vercel.app', 'get-based-personal.vercel.app'])('leaves user-controlled host %s outside the boundary', hostname => {
    expect(isOfficialGetbasedHost({ hostname })).toBe(false);
  });

  it('keeps experimental providers self-host-only without disabling supported hosted wearables', () => {
    const hosted = { hostname: 'app.getbased.health' };
    expect(isWearableRelayUnavailable(adapterById('oura'), hosted)).toBe(false);
    expect(isWearableRelayUnavailable(adapterById('withings'), hosted)).toBe(false);
    expect(isWearableRelayUnavailable(adapterById('polar'), hosted)).toBe(false);
    expect(isWearableRelayUnavailable(adapterById('whoop'), hosted)).toBe(true);
    expect(isWearableRelayUnavailable(adapterById('ultrahuman'), hosted)).toBe(true);
    expect(isWearableRelayUnavailable(adapterById('google_health'), hosted)).toBe(true);
    expect(isWearableRelayUnavailable(adapterById('fitbit'), hosted)).toBe(false);
    expect(SELF_HOSTED_WEARABLE_MESSAGE).toContain('user-controlled deployment');
  });
});
