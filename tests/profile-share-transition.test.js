import { describe, expect, it, vi } from 'vitest';

import {
  createProfileShareTransitionHandler,
  resolveProfileShareTransition,
} from '../lib/profile-share-transition.js';

const STARTED_AT = '2026-08-22T12:00:00.000Z';
const LEGACY_UNTIL = '2026-09-21T12:00:00.000Z';
const UPSTREAM = 'https://sync.getbased.health/profile-share';

function request(method = 'GET', id = 'abcdefghijklmnopqrstuvwx') {
  return new Request(`https://app.getbased.health/api/share?id=${id}`, { method });
}

function handlerFor(legacyHandler, now) {
  return createProfileShareTransitionHandler({
    upstreamUrl: UPSTREAM,
    startedAt: STARTED_AT,
    legacyBlobUntil: LEGACY_UNTIL,
    legacyStore: /** @type {any} */ ({}),
    legacyHandler,
    now: () => Date.parse(now),
  });
}

describe('profile-share bounded transition', () => {
  it('requires an all-or-nothing HTTPS configuration with a bounded legacy window', () => {
    expect(resolveProfileShareTransition({})).toEqual({ mode: 'legacy' });
    expect(resolveProfileShareTransition({ upstreamUrl: UPSTREAM })).toEqual({ mode: 'invalid' });
    expect(resolveProfileShareTransition({
      upstreamUrl: 'http://example.com/profile-share',
      startedAt: STARTED_AT,
      legacyBlobUntil: LEGACY_UNTIL,
    })).toEqual({ mode: 'invalid' });
    expect(resolveProfileShareTransition({
      upstreamUrl: UPSTREAM,
      startedAt: STARTED_AT,
      legacyBlobUntil: '2026-10-01T12:00:00.000Z',
    })).toEqual({ mode: 'invalid' });
    expect(resolveProfileShareTransition({
      upstreamUrl: UPSTREAM,
      startedAt: STARTED_AT,
      legacyBlobUntil: LEGACY_UNTIL,
    })).toMatchObject({ mode: 'transition', upstreamUrl: UPSTREAM });
  });

  it('keeps the old store before cutover and redirects new writes after cutover', async () => {
    const legacyHandler = vi.fn(async () => new Response('{"legacy":true}', { status: 201 }));
    const before = handlerFor(legacyHandler, '2026-08-22T11:59:59.000Z');
    expect((await before(request('POST'))).status).toBe(201);
    expect(legacyHandler).toHaveBeenCalledTimes(1);

    const active = handlerFor(legacyHandler, '2026-08-22T12:00:01.000Z');
    const redirected = await active(request('POST'));
    expect(redirected.status).toBe(307);
    expect(redirected.headers.get('location')).toBe(`${UPSTREAM}?id=abcdefghijklmnopqrstuvwx`);
    expect(redirected.headers.get('cache-control')).toBe('no-store');
    expect(legacyHandler).toHaveBeenCalledTimes(1);
  });

  it('serves legacy records during the window and forwards only misses', async () => {
    const found = vi.fn(async () => new Response('{"envelope":{}}', { status: 200 }));
    expect((await handlerFor(found, '2026-08-23T12:00:00.000Z')(request())).status).toBe(200);

    const missing = vi.fn(async () => new Response('{"error":"missing"}', { status: 404 }));
    const getRedirect = await handlerFor(missing, '2026-08-23T12:00:00.000Z')(request());
    expect(getRedirect.status).toBe(307);

    const missingDelete = vi.fn(async () => new Response('{"ok":true,"missing":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const deleteRedirect = await handlerFor(missingDelete, '2026-08-23T12:00:00.000Z')(
      request('DELETE'),
    );
    expect(deleteRedirect.status).toBe(307);
  });

  it('stops reading legacy storage after the fixed deadline', async () => {
    const legacyHandler = vi.fn(async () => new Response('{"envelope":{}}', { status: 200 }));
    const response = await handlerFor(legacyHandler, LEGACY_UNTIL)(request());
    expect(response.status).toBe(307);
    expect(legacyHandler).not.toHaveBeenCalled();
  });

  it('fails closed on partial transition configuration', async () => {
    const handler = createProfileShareTransitionHandler({
      upstreamUrl: UPSTREAM,
      legacyStore: /** @type {any} */ ({}),
    });
    const response = await handler(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Profile sharing transition is not configured safely.',
    });
  });
});
