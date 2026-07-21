// Vercel Node.js Function — AI API proxy
// Eliminates CORS restrictions for all AI providers.
// Keys pass through from the client, never stored server-side.

import {
  PROXY_MAX_REQUEST_BYTES,
  PROXY_MAX_RESPONSE_BYTES,
  isAllowedProxyUrl,
  normalizeProxyMethod,
  sanitizeProxyHeaders,
} from '../lib/proxy-policy.js';
import { fetchWithPinnedProxyDns } from '../lib/proxy-network.js';

const DEFAULT_UVDATA_UPSTREAM = 'https://uvdata.getbased.health';
const PROXY_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const PROXY_MAX_REDIRECTS = 5;
const DEFAULT_PROXY_UPSTREAM_TIMEOUT_MS = 180_000;
const DEFAULT_PROXY_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_PROXY_RATE_LIMIT_MAX = 300;
const MAX_PROXY_RATE_LIMIT_BUCKETS = 4_096;
const proxyRateLimitBuckets = new Map();

export default async function handler(req) {
  // Treat Origin as a server-side browser boundary, not merely a response
  // decoration. It prevents another website from driving this credentialed
  // relay. Non-browser clients can forge Origin, so the rate limit below and
  // deployment-level firewall controls remain important defence in depth.
  if (req.method === 'OPTIONS') {
    if (!isAllowedCallerOrigin(req)) {
      return new Response(null, { status: 403, headers: { 'Vary': 'Origin' } });
    }
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req),
    });
  }

  if (!isAllowedCallerOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed.' }), {
      status: 403,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed. Use POST with {url, headers, body?, method?}' }), {
      status: 405,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const rateLimit = enforceProxyRateLimit(req);
  if (rateLimit.limited) {
    return new Response(JSON.stringify({
      error: 'Too many proxy requests. Try again later.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    }), {
      status: 429,
      headers: {
        ...corsHeaders(req),
        'Content-Type': 'application/json',
        'Retry-After': String(rateLimit.retryAfterSeconds),
      },
    });
  }

  let payload;
  try {
    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > PROXY_MAX_REQUEST_BYTES) {
      return new Response(JSON.stringify({ error: 'Proxy request body too large' }), {
        status: 413,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > PROXY_MAX_REQUEST_BYTES) {
      return new Response(JSON.stringify({ error: 'Proxy request body too large' }), {
        status: 413,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return new Response(JSON.stringify({ error: 'Proxy payload must be an object' }), {
      status: 400,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // ─── Self-host OAuth client_id overrides ───────────────────────
  // Surfaces *_CLIENT_ID env vars to the browser so self-hosters can run
  // their own OAuth apps without patching js/wearable-adapters.js. Hosted
  // production deploys leave these unset → empty map → hardcoded values
  // win. See issue #145.
  if (payload.wearable_runtime_config) {
    const env = (typeof process !== 'undefined' && process.env) ? process.env : {};
    const overrides = {};
    for (const [key, id] of [
      ['OURA_CLIENT_ID', 'oura'],
      ['WITHINGS_CLIENT_ID', 'withings'],
      ['ULTRAHUMAN_CLIENT_ID', 'ultrahuman'],
      ['POLAR_CLIENT_ID', 'polar'],
      ['WHOOP_CLIENT_ID', 'whoop'],
      ['FITBIT_CLIENT_ID', 'fitbit'],
    ]) {
      const v = env[key];
      if (typeof v === 'string' && v.trim()) overrides[id] = v.trim();
    }
    return new Response(JSON.stringify({ overrides }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // ─── Oura OAuth2 server-side flow ───────────────────────────────
  // Client-secret-bearing requests — secret never reaches the browser.
  // Single place in the codebase that reads OURA_CLIENT_SECRET.
  if (payload.oura_token_exchange || payload.oura_token_refresh) {
    return handleOuraTokenRequest(payload, req);
  }

  // ─── Withings OAuth2 server-side flow ───────────────────────────
  // Same pattern as Oura. Withings's token endpoint demands
  // `action=requesttoken` / `requesttoken2` in the form body alongside the
  // grant params; single place that reads WITHINGS_CLIENT_SECRET.
  if (payload.withings_token_exchange || payload.withings_token_refresh) {
    return handleWithingsTokenRequest(payload, req);
  }

  // ─── Ultrahuman OAuth2 server-side flow ─────────────────────────
  // Confidential client (has client_secret). Token endpoint at
  // partner.ultrahuman.com/api/partners/oauth/token.
  if (payload.ultrahuman_token_exchange || payload.ultrahuman_token_refresh) {
    return handleUltrahumanTokenRequest(payload, req);
  }

  // ─── Polar AccessLink OAuth2 server-side flow ───────────────────
  // Confidential client. Token endpoint at polarremote.com/v2/oauth2/token,
  // authentication via Basic auth (base64 clientId:clientSecret).
  if (payload.polar_token_exchange || payload.polar_token_refresh) {
    return handlePolarTokenRequest(payload, req);
  }

  // ─── CAMS atmosphere relay (getbased-uvdata) ────────────────────
  // Browser fetches `{meteo: 'cams', latitude, longitude, time}`; we
  // forward to the maintainer-run getbased-uvdata instance with a
  // server-injected bearer so the token never reaches the client.
  // Self-hosters bypass this entirely via the `selfhost` Sun Data
  // Source mode (URL + bearer entered in Settings → Light & Sun).
  if (payload.meteo === 'cams') {
    return handleCamsRelay(payload, req);
  }

  const { url, headers, body, method: upstreamMethod } = payload;

  if (!url || !isAllowedProxyUrl(url)) {
    return new Response(JSON.stringify({ error: 'URL not allowed' }), {
      status: 403,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  const fetchMethod = normalizeProxyMethod(upstreamMethod);
  if (!fetchMethod) {
    return new Response(JSON.stringify({ error: 'Proxy method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  const safeHeaders = sanitizeProxyHeaders(headers);
  if (!safeHeaders.ok) {
    return new Response(JSON.stringify({ error: safeHeaders.error }), {
      status: 400,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    const reqHeaders = { ...safeHeaders.headers };
    const hasCT = Object.keys(reqHeaders).some(k => k.toLowerCase() === 'content-type');
    if (fetchMethod !== 'GET' && !hasCT) reqHeaders['Content-Type'] = 'application/json';
    const fetchOpts = {
      method: fetchMethod,
      headers: reqHeaders,
    };
    if (fetchMethod !== 'GET' && body) {
      fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const upstreamRes = await fetchWithValidatedRedirects(url, fetchOpts);

    // For non-streaming responses or errors, forward as-is
    const contentType = upstreamRes.headers.get('content-type') || '';
    const isStream = contentType.includes('text/event-stream') || contentType.includes('application/x-ndjson');

    if (!isStream) {
      const responseBody = await readResponseTextWithCap(upstreamRes);
      return new Response(responseBody, {
        status: upstreamRes.status,
        headers: {
          ...corsHeaders(req),
          'Content-Type': contentType || 'application/json',
        },
      });
    }

    // Stream SSE response through
    return new Response(capReadableStream(upstreamRes.body, PROXY_MAX_RESPONSE_BYTES), {
      status: upstreamRes.status,
      headers: {
        ...corsHeaders(req),
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e) {
    const dnsBlocked = e?.code === 'PROXY_DNS_BLOCKED';
    const timedOut = e?.code === 'PROXY_UPSTREAM_TIMEOUT';
    const error = dnsBlocked ? 'URL not allowed' : `Upstream error: ${e.message}`;
    return new Response(JSON.stringify({ error }), {
      status: dnsBlocked ? 403 : (timedOut ? 504 : 502),
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
}

function readBoundedEnvInteger(name, fallback, min, max) {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function proxyRuntimeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function redirectRequestOptions(status, options) {
  const method = String(options.method || 'GET').toUpperCase();
  if (status !== 303 && !((status === 301 || status === 302) && method === 'POST')) {
    return options;
  }
  const headers = { ...(options.headers || {}) };
  for (const name of Object.keys(headers)) {
    if (['content-length', 'content-type'].includes(name.toLowerCase())) delete headers[name];
  }
  return { ...options, method: 'GET', headers, body: undefined };
}

function stripProxyCredentialHeaders(options) {
  const headers = { ...(options.headers || {}) };
  for (const name of Object.keys(headers)) {
    if (['api-key', 'authorization', 'x-api-key'].includes(name.toLowerCase())) delete headers[name];
  }
  return { ...options, headers };
}

async function discardResponseBody(response) {
  try { await response.body?.cancel?.(); } catch {}
}

// Fetch redirects manually so every destination passes the same SSRF policy.
// Credentialed/body-bearing cross-origin redirects are constrained so API
// secrets and request payloads never migrate to a new host. Safe GET redirects
// remain supported for ordinary product pages that canonicalize to `www`.
async function fetchWithValidatedRedirects(initialUrl, initialOptions) {
  const timeoutMs = readBoundedEnvInteger(
    'PROXY_UPSTREAM_TIMEOUT_MS',
    DEFAULT_PROXY_UPSTREAM_TIMEOUT_MS,
    10,
    300_000,
  );
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let url = new URL(initialUrl).toString();
  let options = { ...initialOptions };
  let redirects = 0;

  try {
    while (true) {
      if (!isAllowedProxyUrl(url)) {
        throw proxyRuntimeError('PROXY_REDIRECT_BLOCKED', 'Proxy redirect target not allowed');
      }
      let response;
      try {
        response = await fetchWithPinnedProxyDns(url, {
          ...options,
          redirect: 'manual',
          signal: controller.signal,
        });
      } catch (error) {
        if (timedOut || controller.signal.aborted) {
          throw proxyRuntimeError('PROXY_UPSTREAM_TIMEOUT', 'Proxy upstream timed out');
        }
        throw error;
      }

      if (!PROXY_REDIRECT_STATUSES.has(response.status)) return response;
      const location = response.headers.get('location');
      if (!location) return response;
      if (redirects >= PROXY_MAX_REDIRECTS) {
        await discardResponseBody(response);
        throw proxyRuntimeError('PROXY_REDIRECT_LIMIT', 'Proxy redirect limit exceeded');
      }

      let nextUrl;
      try {
        nextUrl = new URL(location, url).toString();
      } catch {
        await discardResponseBody(response);
        throw proxyRuntimeError('PROXY_REDIRECT_BLOCKED', 'Proxy redirect target not allowed');
      }
      if (!isAllowedProxyUrl(nextUrl)) {
        await discardResponseBody(response);
        throw proxyRuntimeError('PROXY_REDIRECT_BLOCKED', 'Proxy redirect target not allowed');
      }
      let nextOptions = redirectRequestOptions(response.status, options);
      if (new URL(nextUrl).origin !== new URL(url).origin && nextOptions.body != null) {
        await discardResponseBody(response);
        throw proxyRuntimeError(
          'PROXY_CROSS_ORIGIN_BODY_REDIRECT',
          'Cross-origin proxy redirects with a request body are not allowed',
        );
      }
      if (new URL(nextUrl).origin !== new URL(url).origin) {
        nextOptions = stripProxyCredentialHeaders(nextOptions);
      }

      await discardResponseBody(response);
      options = nextOptions;
      url = nextUrl;
      redirects++;
    }
  } finally {
    clearTimeout(timeout);
  }
}

function getProxyRateLimitSubject(req) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || req.headers.get('cf-connecting-ip')
    || 'unknown-client';
  return `${req.headers.get('origin') || 'no-origin'}|${String(ip).slice(0, 128)}`;
}

// Function instances do not share memory, so this is a per-instance abuse brake,
// not a replacement for a deployment-level distributed rate limit.
function enforceProxyRateLimit(req) {
  const now = Date.now();
  const windowMs = readBoundedEnvInteger(
    'PROXY_RATE_LIMIT_WINDOW_MS',
    DEFAULT_PROXY_RATE_LIMIT_WINDOW_MS,
    1_000,
    60 * 60 * 1000,
  );
  const maxRequests = readBoundedEnvInteger(
    'PROXY_RATE_LIMIT_MAX',
    DEFAULT_PROXY_RATE_LIMIT_MAX,
    1,
    10_000,
  );
  const subject = getProxyRateLimitSubject(req);
  let bucket = proxyRateLimitBuckets.get(subject);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
  }
  bucket.count++;
  proxyRateLimitBuckets.set(subject, bucket);

  if (proxyRateLimitBuckets.size > MAX_PROXY_RATE_LIMIT_BUCKETS) {
    for (const [key, candidate] of proxyRateLimitBuckets) {
      if (candidate.resetAt <= now || proxyRateLimitBuckets.size > MAX_PROXY_RATE_LIMIT_BUCKETS) {
        proxyRateLimitBuckets.delete(key);
      }
    }
  }

  return {
    limited: bucket.count > maxRequests,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

async function readResponseTextWithCap(response) {
  const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
  if (contentLength > PROXY_MAX_RESPONSE_BYTES) throw new Error('Proxy response exceeds size cap');
  const reader = response.body?.getReader?.();
  if (!reader) return response.text();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value?.byteLength || 0;
    if (bytes > PROXY_MAX_RESPONSE_BYTES) {
      try { await reader.cancel(); } catch {}
      throw new Error('Proxy response exceeds size cap');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(out);
}

function capReadableStream(body, maxBytes) {
  if (!body?.getReader || typeof ReadableStream !== 'function') return body;
  const reader = body.getReader();
  let bytes = 0;
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      bytes += value?.byteLength || 0;
      if (bytes > maxBytes) {
        try { await reader.cancel(); } catch {}
        controller.error(new Error('Proxy response exceeds size cap'));
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

// Origins permitted to call /api/proxy. Same-origin requests support self-hosted
// deployments; explicit production surfaces cover app.getbased.health calling
// the apex API. Localhost:8000 remains available for the documented dev server.
const ALLOWED_CALLER_ORIGINS = [
  'https://app.getbased.health',
  'https://getbased.health',
  'https://www.getbased.health',
  'https://get-based.vercel.app',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

function isAllowedCallerOrigin(req) {
  const origin = req?.headers?.get?.('origin') || '';
  if (!origin) return false;
  try {
    const caller = new URL(origin);
    const requestUrl = new URL(req.url);
    return caller.origin === requestUrl.origin || ALLOWED_CALLER_ORIGINS.includes(caller.origin);
  } catch {
    return false;
  }
}

function corsHeaders(req) {
  const origin = req?.headers?.get?.('origin') || '';
  const allow = isAllowedCallerOrigin(req) ? origin : '';
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (allow) h['Access-Control-Allow-Origin'] = allow;
  return h;
}

// ─── Oura token handler ────────────────────────────────────────────
// Payloads:
//   { oura_token_exchange: { code, redirect_uri, client_id } }
//   { oura_token_refresh:  { refresh_token, client_id } }
// client_id is sent from the browser (public value) so the proxy stays
// provider-agnostic — the secret is the only thing kept server-side.
async function handleOuraTokenRequest(payload, req) {
  const secret = typeof process !== 'undefined' ? process.env?.OURA_CLIENT_SECRET : undefined;
  if (!secret) {
    return new Response(JSON.stringify({ error: 'OURA_CLIENT_SECRET not configured on this deployment' }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  let form;
  if (payload.oura_token_exchange) {
    const { code, redirect_uri, client_id } = payload.oura_token_exchange;
    if (!code || !redirect_uri || !client_id) {
      return new Response(JSON.stringify({ error: 'oura_token_exchange requires code, redirect_uri, client_id' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    form = new URLSearchParams({
      grant_type: 'authorization_code',
      code, redirect_uri, client_id, client_secret: secret,
    });
  } else {
    const { refresh_token, client_id } = payload.oura_token_refresh;
    if (!refresh_token || !client_id) {
      return new Response(JSON.stringify({ error: 'oura_token_refresh requires refresh_token, client_id' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    form = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token, client_id, client_secret: secret,
    });
  }

  try {
    const res = await fetchWithPinnedProxyDns('https://api.ouraring.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { ...corsHeaders(req), 'Content-Type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Token endpoint unreachable: ' + e.message }), {
      status: 502, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
}

// ─── Withings token handler ────────────────────────────────────────
// Payloads:
//   { withings_token_exchange: { code, redirect_uri, client_id } }
//   { withings_token_refresh:  { refresh_token, client_id } }
// Withings's token endpoint is POST wbsapi.withings.net/v2/oauth2 with
// `action=requesttoken` in the body — same action for both the initial
// authorization-code exchange and refresh-token rotation (validated end-to-end
// in v1.22.0 → v1.31.0). The grant_type field distinguishes the two flows.
async function handleWithingsTokenRequest(payload, req) {
  const secret = typeof process !== 'undefined' ? process.env?.WITHINGS_CLIENT_SECRET : undefined;
  if (!secret) {
    return new Response(JSON.stringify({ error: 'WITHINGS_CLIENT_SECRET not configured on this deployment' }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  let form;
  if (payload.withings_token_exchange) {
    const { code, redirect_uri, client_id } = payload.withings_token_exchange;
    if (!code || !redirect_uri || !client_id) {
      return new Response(JSON.stringify({ error: 'withings_token_exchange requires code, redirect_uri, client_id' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    form = new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'authorization_code',
      client_id, client_secret: secret,
      code, redirect_uri,
    });
  } else {
    const { refresh_token, client_id } = payload.withings_token_refresh;
    if (!refresh_token || !client_id) {
      return new Response(JSON.stringify({ error: 'withings_token_refresh requires refresh_token, client_id' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    form = new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'refresh_token',
      client_id, client_secret: secret,
      refresh_token,
    });
  }

  try {
    const res = await fetchWithPinnedProxyDns('https://wbsapi.withings.net/v2/oauth2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { ...corsHeaders(req), 'Content-Type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Withings token endpoint unreachable: ' + e.message }), {
      status: 502, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
}

// ─── Ultrahuman token handler ──────────────────────────────────────
async function handleUltrahumanTokenRequest(payload, req) {
  const secret = typeof process !== 'undefined' ? process.env?.ULTRAHUMAN_CLIENT_SECRET : undefined;
  if (!secret) {
    return new Response(JSON.stringify({ error: 'ULTRAHUMAN_CLIENT_SECRET not configured on this deployment' }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  let form;
  if (payload.ultrahuman_token_exchange) {
    const { code, redirect_uri, client_id } = payload.ultrahuman_token_exchange;
    if (!code || !redirect_uri || !client_id) {
      return new Response(JSON.stringify({ error: 'ultrahuman_token_exchange requires code, redirect_uri, client_id' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    form = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id, client_secret: secret, code, redirect_uri,
    });
  } else {
    const { refresh_token, client_id } = payload.ultrahuman_token_refresh;
    if (!refresh_token || !client_id) {
      return new Response(JSON.stringify({ error: 'ultrahuman_token_refresh requires refresh_token, client_id' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    form = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id, client_secret: secret, refresh_token,
    });
  }

  try {
    const res = await fetchWithPinnedProxyDns('https://partner.ultrahuman.com/api/partners/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { ...corsHeaders(req), 'Content-Type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Ultrahuman token endpoint unreachable: ' + e.message }), {
      status: 502, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
}

// ─── Polar token handler ───────────────────────────────────────────
// Polar AccessLink requires HTTP Basic auth (base64 of client_id:client_secret)
// on every token call. Single place that reads POLAR_CLIENT_SECRET.
async function handlePolarTokenRequest(payload, req) {
  const secret = typeof process !== 'undefined' ? process.env?.POLAR_CLIENT_SECRET : undefined;
  if (!secret) {
    return new Response(JSON.stringify({ error: 'POLAR_CLIENT_SECRET not configured on this deployment' }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  let form, clientId;
  if (payload.polar_token_exchange) {
    const { code, redirect_uri, client_id } = payload.polar_token_exchange;
    if (!code || !redirect_uri || !client_id) {
      return new Response(JSON.stringify({ error: 'polar_token_exchange requires code, redirect_uri, client_id' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    clientId = client_id;
    form = new URLSearchParams({
      grant_type: 'authorization_code',
      code, redirect_uri,
    });
  } else {
    const { refresh_token, client_id } = payload.polar_token_refresh;
    if (!refresh_token || !client_id) {
      return new Response(JSON.stringify({ error: 'polar_token_refresh requires refresh_token, client_id' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    clientId = client_id;
    form = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
    });
  }

  const basicAuth = 'Basic ' + btoa(`${clientId}:${secret}`);
  try {
    const res = await fetchWithPinnedProxyDns('https://polarremote.com/v2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json;charset=UTF-8',
        'Authorization': basicAuth,
      },
      body: form.toString(),
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { ...corsHeaders(req), 'Content-Type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Polar token endpoint unreachable: ' + e.message }), {
      status: 502, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
}

// CAMS atmosphere relay → getbased-uvdata. Defaults to the maintainer-run
// instance so Sun Data Source `auto` is genuinely CAMS-first out of the box.
// UVDATA_UPSTREAM can override the upstream, and UVDATA_BEARER is injected
// server-side when configured so the token never reaches the browser.
// Self-host users can also go straight via the `selfhost` Sun Data Source
// mode instead.
//
// env:
//   UVDATA_UPSTREAM — optional base URL override, e.g. https://your-uvdata.example.com
//   UVDATA_BEARER   — token to send on Authorization header
async function handleCamsRelay(payload, req) {
  const configuredUpstream = (typeof process !== 'undefined' && process.env?.UVDATA_UPSTREAM)
    ? process.env.UVDATA_UPSTREAM.replace(/\/+$/, '')
    : '';
  const upstream = configuredUpstream || DEFAULT_UVDATA_UPSTREAM;
  const bearer = (typeof process !== 'undefined' && process.env?.UVDATA_BEARER) ? process.env.UVDATA_BEARER : '';
  if (!upstream) {
    return new Response(JSON.stringify({
      error: 'CAMS relay upstream is empty. Set UVDATA_UPSTREAM or switch Sun Data Source to Open-Meteo/manual.',
    }), {
      status: 503,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  if (!configuredUpstream && !bearer) {
    return new Response(JSON.stringify({
      error: 'CAMS hosted relay requires UVDATA_BEARER. Set UVDATA_BEARER for the hosted default, set UVDATA_UPSTREAM for your own relay, or switch Sun Data Source to Open-Meteo/manual.',
    }), {
      status: 503,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  const lat = Number(payload.latitude);
  const lon = Number(payload.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return new Response(JSON.stringify({ error: 'Invalid latitude/longitude' }), {
      status: 400,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  const time = typeof payload.time === 'string' ? payload.time : '';
  const qs = new URLSearchParams({ latitude: String(lat), longitude: String(lon) });
  if (time) qs.set('time', time);
  const url = `${upstream}/uv?${qs.toString()}`;
  const headers = { 'Accept': 'application/json' };
  if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
  try {
    const res = await fetchWithPinnedProxyDns(url, { headers });
    // Cap upstream response so a misbehaving / compromised CAMS relay
    // can't blow up the function's memory. Real CAMS UV payloads sit
    // around 5-10 KB; 256 KB leaves generous headroom while bounding
    // the worst case. Greptile PR #175 review caught this.
    const MAX_UPSTREAM_BYTES = 256 * 1024;
    const cl = parseInt(res.headers.get('content-length') || '0', 10);
    if (Number.isFinite(cl) && cl > MAX_UPSTREAM_BYTES) {
      return new Response(JSON.stringify({ error: 'CAMS response exceeds size cap' }), {
        status: 502,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    // Even when Content-Length is absent or lying, read with a running
    // byte counter and bail past the cap.
    const reader = res.body?.getReader();
    if (!reader) {
      return new Response(JSON.stringify({ error: 'CAMS response had no body' }), {
        status: 502,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    const chunks = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_UPSTREAM_BYTES) {
        try { await reader.cancel(); } catch (_) {}
        return new Response(JSON.stringify({ error: 'CAMS response exceeds size cap' }), {
          status: 502,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        });
      }
      chunks.push(value);
    }
    const body = new TextDecoder().decode(
      chunks.length === 1 ? chunks[0] : (() => {
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) { out.set(c, off); off += c.byteLength; }
        return out;
      })()
    );
    return new Response(body, {
      status: res.status,
      headers: {
        ...corsHeaders(req),
        'Content-Type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'CAMS upstream unreachable: ' + e.message }), {
      status: 502,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
}
