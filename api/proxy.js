// Privacy-scoped compatibility proxy. A getbased-operated deployment accepts
// only the fixed product operations classified below. User-owned deployments
// retain the generic same-origin path for integrations they operate themselves.

import {
  PROXY_MAX_REQUEST_BYTES,
  PROXY_MAX_RESPONSE_BYTES,
  classifyHostedProxyRequest,
  isAllowedProxyCallerOrigin,
  isAllowedProxyUrl,
  isGetbasedOperatedRelayHost,
  normalizeProxyMethod,
  proxyCorsHeaders as corsHeaders,
  sanitizeProxyHeaders,
  validateOperatedOAuthPayload,
} from '../lib/proxy-policy.js';
import {
  PROXY_MAX_CREDENTIAL_RESPONSE_BYTES,
  capReadableStream,
  fetchWithValidatedRedirects,
  readRequestTextWithCap,
  readResponseTextWithCap,
} from '../lib/proxy-upstream.js';
import { errorCode } from '../lib/error-utils.js';
import { handlePostalGeocode } from './postal-geocode.js';
import { handleCamsRelay } from './cams-relay.js';

const HOSTED_PUBLIC_PAGE_MAX_BYTES = 2 * 1024 * 1024;
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
  const operatedHost = isGetbasedOperatedRelayHost(req);
  // Treat Origin as a server-side browser boundary, not merely a response
  // decoration. It prevents another website from driving this credentialed
  // relay. Non-browser clients can forge Origin, so the rate limit below and
  // deployment-level firewall controls remain important defence in depth.
  if (req.method === 'OPTIONS') {
    if (!isAllowedProxyCallerOrigin(req)) {
      return new Response(null, { status: 403, headers: { 'Vary': 'Origin' } });
    }
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req),
    });
  }

  if (!isAllowedProxyCallerOrigin(req)) {
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
    rateLimit = await enforceProxyRateLimit(req, { allowInstanceFallback: !operatedHost });
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

  const selectedOperations = [
    payload.wearable_runtime_config === true,
    Boolean(payload.oura_token_exchange),
    Boolean(payload.oura_token_refresh),
    Boolean(payload.withings_token_exchange),
    Boolean(payload.withings_token_refresh),
    Boolean(payload.ultrahuman_token_exchange),
    Boolean(payload.ultrahuman_token_refresh),
    Boolean(payload.whoop_token_exchange),
    Boolean(payload.whoop_token_refresh),
    Boolean(payload.polar_token_exchange),
    Boolean(payload.polar_token_refresh),
    Boolean(payload.google_health_token_exchange),
    Boolean(payload.google_health_token_refresh),
    payload.meteo === 'cams',
    payload.meteo === 'postal_geocode',
    Object.prototype.hasOwnProperty.call(payload, 'url'),
  ].filter(Boolean).length;
  if (selectedOperations !== 1) {
    return new Response(JSON.stringify({ error: 'Proxy request must select exactly one operation' }), {
      status: 400,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  if (operatedHost && payload.meteo === 'postal_geocode') {
    return new Response(JSON.stringify({
      code: 'HOSTED_LOCATION_RELAY_DISABLED',
      error: 'The hosted app does not accept plaintext location relay requests.',
    }), {
      status: 403,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  const selfHostOnlyOperation = [
    'ultrahuman_token_exchange',
    'ultrahuman_token_refresh',
    'whoop_token_exchange',
    'whoop_token_refresh',
    'google_health_token_exchange',
    'google_health_token_refresh',
  ].find(field => payload[field]);
  if (operatedHost && selfHostOnlyOperation) {
    return new Response(JSON.stringify({
      code: 'SELF_HOST_ONLY_PROVIDER',
      error: 'This provider is available only on a user-controlled deployment configured with its own OAuth application.',
    }), {
      status: 403,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  const operatedOAuthError = operatedHost ? validateOperatedOAuthPayload(payload) : '';
  if (operatedOAuthError) {
    return new Response(JSON.stringify({
      code: 'HOSTED_OAUTH_REQUEST_BLOCKED',
      error: operatedOAuthError,
    }), {
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
      if (operatedHost && ['ultrahuman', 'whoop', 'google_health'].includes(id)) continue;
      const v = env[key];
      if (typeof v === 'string' && v.trim()) overrides[id] = v.trim();
    }
    const hasEnv = key => typeof env[key] === 'string' && env[key].trim();
    const configured = {
      google_health: !operatedHost && env.GOOGLE_HEALTH_ENABLED === 'true'
        && Boolean(hasEnv('GOOGLE_HEALTH_CLIENT_ID') && hasEnv('GOOGLE_HEALTH_CLIENT_SECRET')),
      ultrahuman: !operatedHost && env.ULTRAHUMAN_ENABLED === 'true'
        && Boolean(hasEnv('ULTRAHUMAN_CLIENT_ID') && hasEnv('ULTRAHUMAN_CLIENT_SECRET')),
      whoop: !operatedHost && env.WHOOP_ENABLED === 'true'
        && Boolean(hasEnv('WHOOP_CLIENT_ID') && hasEnv('WHOOP_CLIENT_SECRET')),
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

  // ─── WHOOP OAuth2 server-side flow ─────────────────────────────
  // WHOOP is a confidential client: the deployment secret is injected here
  // for authorization-code exchange and refresh.
  if (payload.whoop_token_exchange || payload.whoop_token_refresh) {
    return handleWhoopTokenRequest(payload, req);
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
    return handleCamsRelay(payload, req, { operatedHost });
  }
  if (payload.meteo === 'postal_geocode') {
    return handlePostalGeocode(payload, req, { corsHeaders, proxyUpstreamErrorResponse });
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
  let hostedOperation = '';
  if (operatedHost) {
    const hostedRequest = classifyHostedProxyRequest({
      url,
      method: fetchMethod,
      headers: safeHeaders.headers,
      body,
      purpose: payload.proxy_purpose,
    });
    if (!hostedRequest.ok) {
      return new Response(JSON.stringify({
        code: 'HOSTED_PROXY_OPERATION_BLOCKED',
        error: hostedRequest.error,
      }), {
        status: 403,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    hostedOperation = hostedRequest.operation;
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

    if (hostedOperation === 'public-page'
        && !/^(?:text\/(?:html|plain)|application\/(?:xhtml\+xml|json))(?:;|$)/i.test(contentType)) {
      try { await upstreamRes.body?.cancel?.(); } catch {}
      return new Response(JSON.stringify({ error: 'Product URL did not return a readable public page' }), {
        status: 415,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    if (!isStream) {
      const responseBody = await readResponseTextWithCap(
        upstreamRes,
        hostedOperation === 'public-page' ? HOSTED_PUBLIC_PAGE_MAX_BYTES : PROXY_MAX_RESPONSE_BYTES,
      );
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
  const env = typeof process !== 'undefined' ? process.env || {} : {};
  const clientId = typeof env.ULTRAHUMAN_CLIENT_ID === 'string' ? env.ULTRAHUMAN_CLIENT_ID.trim() : '';
  const secret = env.ULTRAHUMAN_CLIENT_SECRET;
  if (env.ULTRAHUMAN_ENABLED !== 'true' || !clientId || typeof secret !== 'string' || !secret.trim()) {
    return new Response(JSON.stringify({ error: 'Ultrahuman is disabled on this deployment' }), {
      status: 503, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  let form;
  if (payload.ultrahuman_token_exchange) {
    const { code, redirect_uri, client_id: requestedClientId } = payload.ultrahuman_token_exchange;
    if (!code || !redirect_uri || !requestedClientId) {
      return new Response(JSON.stringify({ error: 'ultrahuman_token_exchange requires code, redirect_uri, client_id' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    if (requestedClientId !== clientId) {
      return new Response(JSON.stringify({ error: 'Ultrahuman client_id does not match this deployment' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    form = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId, client_secret: secret, code, redirect_uri,
    });
  } else {
    const { refresh_token, client_id: requestedClientId } = payload.ultrahuman_token_refresh;
    if (!refresh_token || !requestedClientId) {
      return new Response(JSON.stringify({ error: 'ultrahuman_token_refresh requires refresh_token, client_id' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    if (requestedClientId !== clientId) {
      return new Response(JSON.stringify({ error: 'Ultrahuman client_id does not match this deployment' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    form = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId, client_secret: secret, refresh_token,
    });
  }

  return relayGuardedText('https://partner.ultrahuman.com/api/partners/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  }, req, 'Ultrahuman token endpoint unavailable');
}

// ─── WHOOP token handler ──────────────────────────────────────────
async function handleWhoopTokenRequest(payload, req) {
  const env = typeof process !== 'undefined' ? process.env || {} : {};
  const clientId = typeof env.WHOOP_CLIENT_ID === 'string' ? env.WHOOP_CLIENT_ID.trim() : '';
  const secret = env.WHOOP_CLIENT_SECRET;
  if (env.WHOOP_ENABLED !== 'true' || !clientId || typeof secret !== 'string' || !secret.trim()) {
    return new Response(JSON.stringify({ error: 'WHOOP is disabled on this deployment' }), {
      status: 503, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  let form;
  if (payload.whoop_token_exchange) {
    const { code, redirect_uri, client_id: requestedClientId } = payload.whoop_token_exchange;
    if (!code || !redirect_uri || !requestedClientId) {
      return new Response(JSON.stringify({ error: 'whoop_token_exchange requires code, redirect_uri, client_id' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    if (requestedClientId !== clientId) {
      return new Response(JSON.stringify({ error: 'WHOOP client_id does not match this deployment' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    form = new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri,
      client_id: clientId, client_secret: secret,
    });
  } else {
    const { refresh_token, client_id: requestedClientId } = payload.whoop_token_refresh;
    if (!refresh_token || !requestedClientId) {
      return new Response(JSON.stringify({ error: 'whoop_token_refresh requires refresh_token, client_id' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    if (requestedClientId !== clientId) {
      return new Response(JSON.stringify({ error: 'WHOOP client_id does not match this deployment' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    form = new URLSearchParams({
      grant_type: 'refresh_token', refresh_token,
      client_id: clientId, client_secret: secret, scope: 'offline',
    });
  }

  return relayGuardedText('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  }, req, 'WHOOP token endpoint unavailable');
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
