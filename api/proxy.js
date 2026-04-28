// Vercel Edge Function — AI API proxy
// Eliminates CORS restrictions for all AI providers.
// Keys pass through from the client, never stored server-side.

export const config = { runtime: 'edge' };

// Allowlisted provider URL prefixes — these always pass without further
// checks. User-configured endpoints (Custom API, decentralized Routstr
// nodes) are allowed too, but only over HTTPS with a non-private host.
const ALLOWED_ORIGINS = [
  'https://openrouter.ai/',
  'https://api.venice.ai/',
  'https://api.routstr.com/',
  'https://api.ppq.ai/',
  'https://api.ouraring.com/',
  'https://api.prod.whoop.com/',
  'https://partner.ultrahuman.com/',
  'https://wbsapi.withings.net/',
  'https://api.fitbit.com/',
  'https://www.polaraccesslink.com/',
  'https://polarremote.com/',
];

/// Block literal IPs in private / reserved / cloud-metadata ranges so
/// attackers can't use the proxy to probe Vercel's internal network or
/// hit cloud metadata services (AWS/GCP 169.254.169.254, Azure
/// 168.63.129.16). Hostnames that DNS-resolve to private IPs would still
/// reach them; that's the next-tier fix (DNS resolution + re-check
/// before fetch), out of scope for this pass.
function _isBlockedHost(host) {
  if (!host) return true;
  // Strip IPv6 brackets if present — URL.hostname keeps them on bracketed
  // literals depending on runtime, so normalise both shapes.
  const h = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  // Loopback + localhost aliases
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (h.endsWith('.local') || h.endsWith('.localhost')) return true;
  // Azure metadata
  if (h === '168.63.129.16') return true;

  // IPv6 literal: block loopback, unique-local (fc00::/7), link-local
  // (fe80::/10), unspecified (::), IPv4-mapped (::ffff:127.0.0.1 / :a.b.c.d
  // / :hex), and IPv4-compatible (::w.x.y.z). The check is conservative:
  // any string containing ':' is treated as IPv6 and inspected.
  if (h.includes(':')) {
    const lower = h.toLowerCase();
    if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;
    // fc00::/7 unique-local: high byte 0xfc or 0xfd (binary 1111110x)
    if (/^fc[0-9a-f]{2}:/.test(lower) || /^fd[0-9a-f]{2}:/.test(lower)) return true;
    // fe80::/10 link-local
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
    // IPv4-mapped/translated: ::ffff:a.b.c.d / ::ffff:0:a.b.c.d / ::a.b.c.d
    const v4Embed = lower.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4Embed) return _isBlockedHost(v4Embed[1]);
    // IPv4-mapped hex form ::ffff:7f00:0001 etc — collapse and recheck via
    // last 32 bits when it's a clear ::ffff: prefix.
    if (lower.startsWith('::ffff:')) {
      const tail = lower.slice(7);
      // Hex pair → dotted quad if it looks like 0001:0002 etc.
      const hex = tail.replace(/:/g, '');
      if (/^[0-9a-f]{1,8}$/.test(hex)) {
        const padded = hex.padStart(8, '0');
        const a = parseInt(padded.slice(0, 2), 16);
        const b = parseInt(padded.slice(2, 4), 16);
        const c = parseInt(padded.slice(4, 6), 16);
        const d = parseInt(padded.slice(6, 8), 16);
        return _isBlockedHost(`${a}.${b}.${c}.${d}`);
      }
    }
    // Unknown / private IPv6 ranges we haven't enumerated — be safe and
    // allow only globally routable (2000::/3) IPv6 addresses through.
    return !/^[23][0-9a-f]{3}:/.test(lower);
  }

  // IPv4 literal check — reject strictly-decimal 0-255 octets in reserved ranges
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  for (let i = 1; i <= 4; i++) {
    const octet = m[i];
    // Strict decimal — reject leading zeros (0255 is octal territory)
    if (octet.length > 1 && octet[0] === '0') return true;
    const n = +octet;
    if (n > 255) return true;
  }
  const a = +m[1], b = +m[2];
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 127) return true;                         // loopback
  if (a === 169 && b === 254) return true;            // link-local + AWS/GCP metadata
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
  if (a === 192 && b === 168) return true;            // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT 100.64.0.0/10
  if (a === 0) return true;                           // 0.0.0.0/8
  return false;
}

function isAllowedUrl(url) {
  if (ALLOWED_ORIGINS.some(origin => url.startsWith(origin))) return true;
  // Allow any HTTPS endpoint (Custom API, decentralized Routstr nodes)
  // provided the host is public — blocks SSRF into Vercel's internal
  // network and cloud metadata services.
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (_isBlockedHost(u.hostname)) return false;
    return true;
  } catch { return false; }
}

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req),
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed. Use POST with {url, headers, body?, method?}' }), {
      status: 405,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
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

  const { url, headers, body, method: upstreamMethod } = payload;

  if (!url || !isAllowedUrl(url)) {
    return new Response(JSON.stringify({ error: 'URL not allowed' }), {
      status: 403,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    const fetchMethod = (upstreamMethod || 'POST').toUpperCase();
    const fetchOpts = {
      method: fetchMethod,
      headers: {
        ...(fetchMethod !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
    };
    if (fetchMethod !== 'GET' && body) {
      fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const upstreamRes = await fetch(url, fetchOpts);

    // For non-streaming responses or errors, forward as-is
    const contentType = upstreamRes.headers.get('content-type') || '';
    const isStream = contentType.includes('text/event-stream') || contentType.includes('application/x-ndjson');

    if (!isStream) {
      const responseBody = await upstreamRes.text();
      return new Response(responseBody, {
        status: upstreamRes.status,
        headers: {
          ...corsHeaders(req),
          'Content-Type': contentType || 'application/json',
        },
      });
    }

    // Stream SSE response through
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: {
        ...corsHeaders(req),
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `Upstream error: ${e.message}` }), {
      status: 502,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
}

// Origins permitted to call /api/proxy. Lock to our production surfaces +
// localhost:8000 dev. Previously we returned `Access-Control-Allow-Origin: *`
// which let any page on the internet use our proxy as an authenticated-request
// relay; now the browser enforces the allowlist via CORS.
const ALLOWED_CALLER_ORIGINS = [
  'https://app.getbased.health',
  'https://getbased.health',
  'http://localhost:8000',
];

function corsHeaders(req) {
  // Reflect the caller's Origin if and only if it's in the allowlist. Any
  // other origin gets no Allow-Origin header at all, which causes the browser
  // to block the response (effective 403 client-side).
  const origin = req?.headers?.get?.('origin') || '';
  const allow = ALLOWED_CALLER_ORIGINS.includes(origin) ? origin : '';
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
    const res = await fetch('https://api.ouraring.com/oauth/token', {
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
// Withings's token endpoint is POST wbsapi.withings.net/v2/oauth2 with an
// `action=requesttoken` (or `requesttoken2` for refresh) in the body.
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
    const res = await fetch('https://wbsapi.withings.net/v2/oauth2', {
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
    const res = await fetch('https://partner.ultrahuman.com/api/partners/oauth/token', {
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
    const res = await fetch('https://polarremote.com/v2/oauth2/token', {
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
