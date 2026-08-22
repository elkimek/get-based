import { describe, expect, it } from 'vitest';

import {
  classifyHostedProxyRequest,
  isAllowedProxyCallerOrigin,
  normalizeCamsRelayPayload,
} from '../lib/proxy-policy.js';

const bearer = { Authorization: 'Bearer wearable-token' };

describe('getbased-operated proxy allowlist', () => {
  it('allows same-origin development without trusting localhost cross-origin on production', () => {
    expect(isAllowedProxyCallerOrigin(new Request('http://localhost:8000/api/proxy', {
      headers: { Origin: 'http://localhost:8000' },
    }))).toBe(true);
    expect(isAllowedProxyCallerOrigin(new Request('https://app.getbased.health/api/proxy', {
      headers: { Origin: 'http://localhost:8000' },
    }))).toBe(false);
    expect(isAllowedProxyCallerOrigin(new Request('https://get-based.vercel.app/api/proxy', {
      headers: { Origin: 'https://beta.getbased.health' },
    }))).toBe(true);
  });

  it('allows the named managed preview but rejects lookalike Vercel origins', () => {
    const requestUrl = 'https://integrations.getbased.health/api/proxy';
    expect(isAllowedProxyCallerOrigin(new Request(requestUrl, {
      headers: { Origin: 'https://get-based-managed-subscription-v2.vercel.app' },
    }))).toBe(true);
    expect(isAllowedProxyCallerOrigin(new Request(requestUrl, {
      headers: { Origin: 'https://get-based-managed-subscription-v2-attacker.vercel.app' },
    }))).toBe(false);
  });

  it('allows only the Oura collections used by the hosted app', () => {
    expect(classifyHostedProxyRequest({
      url: 'https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=2026-08-01&end_date=2026-08-02',
      method: 'GET',
      headers: bearer,
    })).toEqual({ ok: true, operation: 'oura-data' });

    expect(classifyHostedProxyRequest({
      url: 'https://api.ouraring.com/v2/usercollection/sessions',
      method: 'GET',
      headers: bearer,
    }).ok).toBe(false);
    expect(classifyHostedProxyRequest({
      url: 'https://api.ouraring.com/v2/usercollection/daily_sleep?redirect=https://example.com',
      method: 'GET',
      headers: bearer,
    }).ok).toBe(false);
  });

  it('allows exact Withings, Polar, and legacy Fitbit compatibility calls', () => {
    expect(classifyHostedProxyRequest({
      url: 'https://wbsapi.withings.net/measure',
      method: 'POST',
      headers: { ...bearer, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'action=getmeas&startdate=1&enddate=2&category=1',
    }).operation).toBe('withings-data');

    expect(classifyHostedProxyRequest({
      url: 'https://www.polaraccesslink.com/v3/users/u/activity-transactions/t',
      method: 'PUT',
      headers: bearer,
    }).operation).toBe('polar-data');

    expect(classifyHostedProxyRequest({
      url: 'https://api.fitbit.com/1/user/-/hrv/date/2026-08-01/2026-08-02.json',
      method: 'GET',
      headers: bearer,
    }).operation).toBe('fitbit-data');
  });

  it('keeps WHOOP, Ultrahuman, Google Health, AI, and custom APIs off the operated proxy', () => {
    for (const request of [
      { url: 'https://api.prod.whoop.com/developer/v1/recovery', method: 'GET', headers: bearer },
      { url: 'https://partner.ultrahuman.com/api/partners/v1/user_data/metrics', method: 'GET', headers: bearer },
      { url: 'https://health.googleapis.com/v4/users/me/identity', method: 'GET', headers: bearer },
      { url: 'https://openrouter.ai/api/v1/chat/completions', method: 'POST', headers: bearer, body: '{}' },
      { url: 'https://customer.example/api/chat', method: 'POST', headers: bearer, body: '{}' },
    ]) expect(classifyHostedProxyRequest(request).ok).toBe(false);
  });

  it('requires an explicit purpose and forbids credentials on public-page reads', () => {
    expect(classifyHostedProxyRequest({
      purpose: 'public-page',
      url: 'https://shop.example/product',
      method: 'GET',
      headers: { Accept: 'text/html' },
    })).toEqual({ ok: true, operation: 'public-page' });
    expect(classifyHostedProxyRequest({
      purpose: 'public-page',
      url: 'https://shop.example/product',
      method: 'GET',
      headers: bearer,
    }).ok).toBe(false);
    expect(classifyHostedProxyRequest({
      url: 'https://shop.example/product',
      method: 'GET',
      headers: {},
    }).ok).toBe(false);
  });

  it('accepts only the fixed CAMS envelope and forces the hosted privacy grid', () => {
    expect(normalizeCamsRelayPayload({
      meteo: 'cams',
      latitude: 50.0755,
      longitude: 14.4378,
      time: '2026-06-06T12:00:00Z',
    }, { forcePrivacyRounding: true })).toEqual({
      ok: true,
      latitude: 50.1,
      longitude: 14.4,
      time: '2026-06-06T12:00:00Z',
    });
    expect(normalizeCamsRelayPayload({
      meteo: 'cams', latitude: 50.1, longitude: 14.4, prompt: 'not allowed',
    }).ok).toBe(false);
    expect(normalizeCamsRelayPayload({
      meteo: 'cams', latitude: '50.1', longitude: 14.4,
    }).ok).toBe(false);
    expect(normalizeCamsRelayPayload({
      meteo: 'cams', latitude: 50.1, longitude: 14.4, time: 'not-a-time',
    }).ok).toBe(false);
  });
});
