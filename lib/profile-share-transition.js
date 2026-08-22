// @ts-check
// Bounded bridge from the legacy same-origin profile-share endpoint to a
// standalone service. It preserves still-live encrypted links without copying
// their opaque envelopes or leaving an indefinite storage fallback.

import { handleProfileShareRequest } from './profile-share-service.js';

const MAX_LEGACY_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
const JSON_HEADERS = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };

function isExactLoopback(url) {
  return url.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

function normalizeUpstream(value) {
  try {
    const url = new URL(String(value || ''));
    if ((url.protocol !== 'https:' && !isExactLoopback(url))
        || url.username || url.password || url.search || url.hash) return '';
    return url.toString();
  } catch {
    return '';
  }
}

/**
 * @param {{upstreamUrl?: string, startedAt?: string, legacyBlobUntil?: string}} settings
 */
export function resolveProfileShareTransition(settings) {
  const values = [settings?.upstreamUrl, settings?.startedAt, settings?.legacyBlobUntil]
    .map(value => String(value || '').trim());
  if (values.every(value => !value)) return { mode: 'legacy' };
  const upstreamUrl = normalizeUpstream(values[0]);
  const startedAt = Date.parse(values[1]);
  const legacyBlobUntil = Date.parse(values[2]);
  if (!upstreamUrl
      || !Number.isFinite(startedAt)
      || !Number.isFinite(legacyBlobUntil)
      || legacyBlobUntil <= startedAt
      || legacyBlobUntil - startedAt > MAX_LEGACY_WINDOW_MS) {
    return { mode: 'invalid' };
  }
  return { mode: 'transition', upstreamUrl, startedAt, legacyBlobUntil };
}

function unavailableResponse() {
  return new Response(JSON.stringify({ error: 'Profile sharing transition is not configured safely.' }), {
    status: 503,
    headers: JSON_HEADERS,
  });
}

function redirectToUpstream(req, upstreamUrl) {
  const source = new URL(req.url);
  const target = new URL(upstreamUrl);
  target.search = source.search;
  return new Response(null, {
    status: 307,
    headers: {
      'Cache-Control': 'no-store',
      'Location': target.toString(),
      'Referrer-Policy': 'no-referrer',
    },
  });
}

async function legacyRecordMissing(req, response) {
  if (req.method === 'GET') return response.status === 404;
  if (req.method !== 'DELETE' || response.status !== 200) return false;
  try {
    return Boolean((await response.clone().json())?.missing);
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   upstreamUrl?: string,
 *   startedAt?: string,
 *   legacyBlobUntil?: string,
 *   legacyStore: import('./profile-share-service.js').ProfileShareObjectStore | null,
 *   now?: () => number,
 *   legacyHandler?: typeof handleProfileShareRequest,
 * }} settings
 */
export function createProfileShareTransitionHandler(settings) {
  const transition = resolveProfileShareTransition(settings);
  const now = settings.now || Date.now;
  const legacyHandler = settings.legacyHandler || handleProfileShareRequest;
  return async function profileShareTransitionHandler(req) {
    if (transition.mode === 'invalid') return unavailableResponse();
    const currentTime = now();
    if (transition.mode === 'legacy' || currentTime < transition.startedAt) {
      return legacyHandler(req, settings.legacyStore);
    }
    if (!['GET', 'POST', 'DELETE', 'OPTIONS'].includes(req.method)) {
      return legacyHandler(req, settings.legacyStore);
    }
    if (['POST', 'OPTIONS'].includes(req.method) || currentTime >= transition.legacyBlobUntil) {
      return redirectToUpstream(req, transition.upstreamUrl);
    }
    if (!settings.legacyStore) return unavailableResponse();
    const legacyResponse = await legacyHandler(req, settings.legacyStore);
    return await legacyRecordMissing(req, legacyResponse)
      ? redirectToUpstream(req, transition.upstreamUrl)
      : legacyResponse;
  };
}
