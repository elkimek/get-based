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
import {
  PROXY_MAX_CREDENTIAL_RESPONSE_BYTES,
  capReadableStream,
  fetchWithValidatedRedirects,
  readRequestTextWithCap,
  readResponseTextWithCap,
} from '../lib/proxy-upstream.js';
import { errorCode } from '../lib/error-utils.js';

const DEFAULT_UVDATA_UPSTREAM = 'https://uvdata.getbased.health';
/** @type {Promise<typeof import('../lib/proxy-rate-limit.js')> | null} */
let proxyRateLimitModulePromise = null;

// The distributed limiter pulls in Vercel's Node-only Blob client. Keep that
// dependency outside the entrypoint's initialization path so preflight,
// rejected-origin, and method-probe responses remain available even if a
// deployment packages the optional storage transport incorrectly.
function loadProxyRateLimit() {
  proxyRateLimitModulePromise ||= import('../lib/proxy-rate-limit.js');
  return proxyRateLimitModulePromise;
}

export async function handler(req) {
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

  let rateLimit;
  try {
    const { enforceProxyRateLimit } = await loadProxyRateLimit();
    rateLimit = await enforceProxyRateLimit(req);
  } catch {
    return new Response(JSON.stringify({
      error: 'Proxy rate limit is temporarily unavailable.',
    }), {
      status: 503,
      headers: {
        ...corsHeaders(req),
        'Content-Type': 'application/json',
        'Retry-After': '60',
      },
    });
  }
  if (rateLimit.unavailable) {
    return new Response(JSON.stringify({
      error: 'Proxy rate limit is not configured for this hosted deployment.',
    }), {
      status: 503,
      headers: {
        ...corsHeaders(req),
        'Content-Type': 'application/json',
        'Retry-After': String(rateLimit.retryAfterSeconds),
      },
    });
  }
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
    const rawBody = await readRequestTextWithCap(req, PROXY_MAX_REQUEST_BYTES);
    payload = JSON.parse(rawBody);
  } catch (error) {
    if (errorCode(error) === 'PROXY_REQUEST_TOO_LARGE') {
      return new Response(JSON.stringify({ error: 'Proxy request body too large' }), {
        status: 413,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
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
  // their own OAuth apps without patching js/wearable-adapters.js. Google
  // Health is enabled only when this deployment explicitly opts in and
  // provides both credentials; only the boolean capability and public client
  // ID reach the browser.
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
      ['GOOGLE_HEALTH_CLIENT_ID', 'google_health'],
    ]) {
      const v = env[key];
      if (typeof v === 'string' && v.trim()) overrides[id] = v.trim();
    }
    const hasEnv = key => typeof env[key] === 'string' && env[key].trim();
    const configured = {
      google_health: env.GOOGLE_HEALTH_ENABLED === 'true'
        && Boolean(hasEnv('GOOGLE_HEALTH_CLIENT_ID') && hasEnv('GOOGLE_HEALTH_CLIENT_SECRET')),
    };
    return new Response(JSON.stringify({ overrides, configured }), {
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

  // ─── Google Health OAuth2 server-side flow ─────────────────────
  // Google Health uses Google's confidential Web Server OAuth client. The
  // deployment's client secret is injected here and is never returned to the
  // browser or stored in profile data.
  if (payload.google_health_token_exchange || payload.google_health_token_refresh) {
    return handleGoogleHealthTokenRequest(payload, req);
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
    const upstreamRes = await fetchWithValidatedRedirects(url, fetchOpts, { signal: req.signal });

    // For non-streaming responses or errors, forward as-is
    const contentType = upstreamRes.headers.get('content-type') || '';
    const isStream = contentType.includes('text/event-stream') || contentType.includes('application/x-ndjson');

    if (!isStream) {
      const responseBody = await readResponseTextWithCap(upstreamRes, PROXY_MAX_RESPONSE_BYTES);
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
    return proxyUpstreamErrorResponse(req, e);
  }
}

// Use Vercel's explicit Web-standard Node.js function contract. A bare
// default function is also the legacy (request, response) handler shape; when
// it returns a Web Response instead of ending the legacy response, the
// platform can leave the invocation open until timeout.
export default { fetch: handler };

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
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
  if (allow) h['Access-Control-Allow-Origin'] = allow;
  return h;
}

function proxyUpstreamErrorResponse(req, error, fallback = 'Upstream request failed') {
  const code = error?.code;
  const dnsBlocked = code === 'PROXY_DNS_BLOCKED';
  const timedOut = code === 'PROXY_UPSTREAM_TIMEOUT';
  const knownMessages = new Map([
    ['PROXY_REDIRECT_BLOCKED', 'Proxy redirect target not allowed'],
    ['PROXY_REDIRECT_LIMIT', 'Proxy redirect limit exceeded'],
    ['PROXY_CROSS_ORIGIN_BODY_REDIRECT', 'Cross-origin proxy redirects with a request body are not allowed'],
    ['PROXY_RESPONSE_TOO_LARGE', 'Proxy response exceeds size cap'],
  ]);
  const message = dnsBlocked
    ? 'URL not allowed'
    : timedOut
      ? 'Proxy upstream timed out'
      : knownMessages.get(code) || fallback;
  return new Response(JSON.stringify({ error: message }), {
    status: dnsBlocked ? 403 : (timedOut ? 504 : 502),
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

async function relayGuardedText(url, options, req, fallback) {
  try {
    const response = await fetchWithValidatedRedirects(url, options, { signal: req.signal });
    const body = await readResponseTextWithCap(
      response,
      PROXY_MAX_CREDENTIAL_RESPONSE_BYTES,
    );
    return new Response(body, {
      status: response.status,
      headers: {
        ...corsHeaders(req),
        'Content-Type': response.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error) {
    return proxyUpstreamErrorResponse(req, error, fallback);
  }
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

  return relayGuardedText('https://api.ouraring.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  }, req, 'Oura token endpoint unavailable');
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

  return relayGuardedText('https://wbsapi.withings.net/v2/oauth2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  }, req, 'Withings token endpoint unavailable');
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

  return relayGuardedText('https://partner.ultrahuman.com/api/partners/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  }, req, 'Ultrahuman token endpoint unavailable');
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
  return relayGuardedText('https://polarremote.com/v2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json;charset=UTF-8',
      'Authorization': basicAuth,
    },
    body: form.toString(),
  }, req, 'Polar token endpoint unavailable');
}

// ─── Google Health token handler ─────────────────────────────────
// Payloads:
//   { google_health_token_exchange: { code, redirect_uri, client_id } }
//   { google_health_token_refresh:  { refresh_token, client_id } }
async function handleGoogleHealthTokenRequest(payload, req) {
  const env = typeof process !== 'undefined' ? process.env : {};
  const secret = env?.GOOGLE_HEALTH_CLIENT_SECRET;
  const clientId = env?.GOOGLE_HEALTH_CLIENT_ID;
  if (env?.GOOGLE_HEALTH_ENABLED !== 'true' || !secret || !clientId) {
    return new Response(JSON.stringify({ error: 'Google Health is disabled on this deployment' }), {
      status: 503, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  let form;
  if (payload.google_health_token_exchange) {
    const { code, redirect_uri, client_id } = payload.google_health_token_exchange;
    if (!code || !redirect_uri || !client_id) {
      return new Response(JSON.stringify({ error: 'google_health_token_exchange requires code, redirect_uri, client_id' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    form = new URLSearchParams({
      grant_type: 'authorization_code',
      code, redirect_uri, client_id, client_secret: secret,
    });
  } else {
    const { refresh_token, client_id } = payload.google_health_token_refresh;
    if (!refresh_token || !client_id) {
      return new Response(JSON.stringify({ error: 'google_health_token_refresh requires refresh_token, client_id' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    form = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token, client_id, client_secret: secret,
    });
  }

  return relayGuardedText('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  }, req, 'Google OAuth token endpoint unavailable');
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
    const res = await fetchWithValidatedRedirects(url, { headers }, { signal: req.signal });
    // Cap upstream response so a misbehaving / compromised CAMS relay
    // can't blow up the function's memory. Real CAMS UV payloads sit
    // around 5-10 KB; 256 KB leaves generous headroom while bounding
    // the worst case. Greptile PR #175 review caught this.
    const body = await readResponseTextWithCap(
      res,
      PROXY_MAX_CREDENTIAL_RESPONSE_BYTES,
    );
    return new Response(body, {
      status: res.status,
      headers: {
        ...corsHeaders(req),
        'Content-Type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error) {
    const fallback = errorCode(error) === 'PROXY_RESPONSE_TOO_LARGE'
      ? 'CAMS response exceeds size cap'
      : 'CAMS upstream unavailable';
    return proxyUpstreamErrorResponse(req, error, fallback);
  }
}
