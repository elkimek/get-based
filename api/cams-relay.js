// Dedicated CAMS operation shared by the hosted and self-hosted proxy entrypoint.
// The official route is pinned, authenticated, privacy-rounded, and POST-only.

import {
  normalizeCamsRelayPayload,
  proxyCorsHeaders,
} from '../lib/proxy-policy.js';
import {
  PROXY_MAX_CREDENTIAL_RESPONSE_BYTES,
  fetchWithValidatedRedirects,
  readResponseTextWithCap,
} from '../lib/proxy-upstream.js';
import { errorCode } from '../lib/error-utils.js';

export const DEFAULT_UVDATA_UPSTREAM = 'https://uvdata.getbased.health';

function errorResponse(req, status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...proxyCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function upstreamError(req, error) {
  const code = errorCode(error);
  const messages = new Map([
    ['PROXY_DNS_BLOCKED', ['URL not allowed', 403]],
    ['PROXY_UPSTREAM_TIMEOUT', ['CAMS upstream timed out', 504]],
    ['PROXY_REDIRECT_BLOCKED', ['CAMS redirect target not allowed', 502]],
    ['PROXY_REDIRECT_LIMIT', ['CAMS redirects are not allowed', 502]],
    ['PROXY_CROSS_ORIGIN_BODY_REDIRECT', ['Cross-origin CAMS redirects are not allowed', 502]],
    ['PROXY_RESPONSE_TOO_LARGE', ['CAMS response exceeds size cap', 502]],
  ]);
  const [message, status] = messages.get(code) || ['CAMS upstream unavailable', 502];
  return errorResponse(req, status, message);
}

/**
 * @param {Record<string, any>} payload
 * @param {Request} req
 * @param {{ operatedHost?: boolean }} [options]
 */
export async function handleCamsRelay(payload, req, { operatedHost = false } = {}) {
  const configured = typeof process !== 'undefined' && process.env?.UVDATA_UPSTREAM
    ? process.env.UVDATA_UPSTREAM.replace(/\/+$/, '')
    : '';
  const upstream = operatedHost ? DEFAULT_UVDATA_UPSTREAM : configured;
  const bearer = typeof process !== 'undefined' && process.env?.UVDATA_BEARER
    ? process.env.UVDATA_BEARER
    : '';
  if (!upstream) {
    return errorResponse(req, 503,
      'CAMS relay upstream is empty. Set UVDATA_UPSTREAM or switch Sun Data Source to Open-Meteo/manual.');
  }
  if (operatedHost && !bearer) {
    return errorResponse(req, 503, 'Hosted CAMS relay is not configured.');
  }
  const normalized = normalizeCamsRelayPayload(payload, {
    forcePrivacyRounding: operatedHost,
  });
  if (!normalized.ok) return errorResponse(req, 400, normalized.error);

  const headers = { Accept: 'application/json' };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  let url;
  let fetchOptions;
  if (operatedHost) {
    const body = {
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      ...(normalized.time ? { time: normalized.time } : {}),
    };
    url = `${upstream}/v1/uv`;
    fetchOptions = {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  } else {
    const query = new URLSearchParams({
      latitude: String(normalized.latitude),
      longitude: String(normalized.longitude),
    });
    if (normalized.time) query.set('time', normalized.time);
    url = `${upstream}/uv?${query.toString()}`;
    fetchOptions = { headers };
  }

  try {
    const response = await fetchWithValidatedRedirects(url, fetchOptions, {
      signal: req.signal,
      maxRedirects: operatedHost ? 0 : undefined,
    });
    const contentType = response.headers.get('content-type') || '';
    if (operatedHost && !/^application\/json(?:;|$)/i.test(contentType)) {
      try { await response.body?.cancel?.(); } catch {}
      return errorResponse(req, 502, 'CAMS relay returned an invalid content type');
    }
    const body = await readResponseTextWithCap(response, PROXY_MAX_CREDENTIAL_RESPONSE_BYTES);
    return new Response(body, {
      status: response.status,
      headers: {
        ...proxyCorsHeaders(req),
        'Content-Type': contentType || 'application/json',
      },
    });
  } catch (error) {
    return upstreamError(req, error);
  }
}
