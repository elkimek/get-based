// @ts-check
// Shared proxy safety policy for Vercel, the standalone Node relay, and local development.

export const PROXY_ALLOWED_URL_PREFIXES = [
  'https://openrouter.ai/',
  'https://api.venice.ai/',
  'https://nras.attestation.nvidia.com/v3/attest/gpu',
  'https://api.routstr.com/',
  'https://api.ppq.ai/',
  'https://api.ouraring.com/',
  'https://api.prod.whoop.com/',
  'https://partner.ultrahuman.com/',
  'https://wbsapi.withings.net/',
  'https://api.fitbit.com/',
  'https://www.polaraccesslink.com/',
  'https://polarremote.com/',
  'https://health.googleapis.com/',
  'https://oauth2.googleapis.com/',
];

export const PROXY_ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT']);
export const PROXY_MAX_REQUEST_BYTES = 8 * 1024 * 1024;
export const PROXY_MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

const ALLOWED_CALLER_ORIGINS = new Set([
  'https://app.getbased.health',
  'https://getbased.health',
  'https://www.getbased.health',
  'https://beta.getbased.health',
  'https://get-based.vercel.app',
  'https://get-based-managed-subscription-v2.vercel.app',
]);
export const OFFICIAL_WEARABLE_CLIENT_IDS = Object.freeze({
  oura: '8bb386cb-1b6e-4ab8-b852-ff47662667f6',
  withings: 'a91db99c24c9b52cea01993ad2bd67bb1515921b09d0a3c04d40a7dc1d1b748a',
  polar: 'd4402bda-aaf6-4b54-be8c-00b789938a1f',
});
const OFFICIAL_WEARABLE_REDIRECT_URIS = new Set([
  'https://app.getbased.health/',
  'https://getbased.health/app',
  'https://beta.getbased.health/',
  'https://beta.getbased.health/app',
]);

const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const PROXY_ALLOWED_HEADER_NAMES = new Set([
  'accept',
  'authorization',
  'content-type',
  'api-key',
  'x-api-key',
  'anthropic-version',
  'openai-organization',
  'openai-project',
  'http-referer',
  'x-title',
]);
const PROXY_BLOCKED_HEADER_NAMES = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'proxy-authorization',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/** @param {Request} req */
export function isGetbasedOperatedRelayHost(req) {
  const productionUrl = typeof process !== 'undefined'
    ? String(process.env?.VERCEL_PROJECT_PRODUCTION_URL || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
    : '';
  // Vercel supplies this immutable project-level value to production and
  // Preview functions. It distinguishes our Preview URLs from an unrelated
  // self-hoster whose project also happens to be deployed on vercel.app.
  if (productionUrl === 'get-based.vercel.app') return true;
  const hostnames = [];
  try { hostnames.push(new URL(req.url).hostname); } catch {}
  for (const header of ['host', 'x-forwarded-host']) {
    const value = req.headers.get(header);
    if (value) hostnames.push(String(value).split(',')[0].trim().split(':')[0]);
  }
  return hostnames.some(value => {
    const hostname = String(value || '').toLowerCase().replace(/\.$/, '');
    return hostname === 'getbased.health'
      || hostname.endsWith('.getbased.health')
      || hostname === 'get-based.vercel.app';
  });
}

/** @param {Request} req */
export function isAllowedProxyCallerOrigin(req) {
  const origin = req.headers.get('origin') || '';
  if (!origin) return false;
  try {
    const caller = new URL(origin);
    const requestUrl = new URL(req.url);
    return caller.origin === requestUrl.origin || ALLOWED_CALLER_ORIGINS.has(caller.origin);
  } catch {
    return false;
  }
}

/** @param {Request} req */
export function proxyCorsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
  if (isAllowedProxyCallerOrigin(req)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

/** @param {Record<string, any>} payload */
export function validateOperatedOAuthPayload(payload) {
  for (const provider of ['oura', 'withings', 'polar']) {
    for (const mode of ['exchange', 'refresh']) {
      const request = payload[`${provider}_token_${mode}`];
      if (!request) continue;
      if (typeof request !== 'object' || Array.isArray(request)) {
        return 'Hosted OAuth request has an invalid shape.';
      }
      const allowedKeys = mode === 'exchange'
        ? new Set(['code', 'redirect_uri', 'client_id'])
        : new Set(['refresh_token', 'client_id']);
      if (!Object.keys(request).every(key => allowedKeys.has(key))) {
        return 'Hosted OAuth request contains unsupported fields.';
      }
      if (request.client_id !== OFFICIAL_WEARABLE_CLIENT_IDS[provider]) {
        return 'Hosted OAuth client_id does not match the official application.';
      }
      if (mode === 'exchange' && !OFFICIAL_WEARABLE_REDIRECT_URIS.has(request.redirect_uri)) {
        return 'Hosted OAuth redirect_uri is not registered for the official application.';
      }
    }
  }
  return '';
}

/**
 * Validate the dedicated CAMS envelope. A getbased-operated relay forces the
 * privacy grid even if a hostile client sends more precise coordinates.
 * @param {Record<string, any>} payload
 * @param {{ forcePrivacyRounding?: boolean }} [options]
 */
export function normalizeCamsRelayPayload(payload, { forcePrivacyRounding = false } = {}) {
  const allowedKeys = new Set(['meteo', 'latitude', 'longitude', 'time']);
  if (!Object.keys(payload).every(key => allowedKeys.has(key))) {
    return { ok: false, error: 'CAMS request contains unsupported fields' };
  }
  const latitude = payload.latitude;
  const longitude = payload.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number'
      || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { ok: false, error: 'Invalid latitude/longitude' };
  }
  const time = payload.time == null ? '' : payload.time;
  if (typeof time !== 'string' || time.length > 40 || /[\r\n]/.test(time)
      || (time && !Number.isFinite(Date.parse(time)))) {
    return { ok: false, error: 'Invalid CAMS time' };
  }
  const round = value => {
    const rounded = Math.round(value * 10) / 10;
    return Object.is(rounded, -0) ? 0 : rounded;
  };
  return {
    ok: true,
    latitude: forcePrivacyRounding ? round(latitude) : latitude,
    longitude: forcePrivacyRounding ? round(longitude) : longitude,
    time,
  };
}

export function isProxyHostBlocked(host) {
  if (!host) return true;
  const h = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if ([
    '.home',
    '.internal',
    '.invalid',
    '.lan',
    '.local',
    '.localdomain',
    '.localhost',
    '.test',
  ].some(suffix => h.endsWith(suffix))) return true;
  if (h === '168.63.129.16') return true;
  if (h.includes(':')) {
    const lower = h.toLowerCase();
    if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;
    if (/^fc[0-9a-f]{2}:/.test(lower) || /^fd[0-9a-f]{2}:/.test(lower)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
    const v4Embed = lower.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4Embed) return isProxyHostBlocked(v4Embed[1]);
    if (lower.startsWith('::ffff:')) {
      const tail = lower.slice(7);
      const groups = tail.split(':');
      if (groups.length === 2 && groups.every(g => /^[0-9a-f]{1,4}$/.test(g))) {
        const g0 = parseInt(groups[0], 16);
        const g1 = parseInt(groups[1], 16);
        const a = (g0 >> 8) & 0xff;
        const b = g0 & 0xff;
        const c = (g1 >> 8) & 0xff;
        const d = g1 & 0xff;
        return isProxyHostBlocked(`${a}.${b}.${c}.${d}`);
      }
    }
    const sixToFour = /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})(?::|$)/.exec(lower);
    if (sixToFour) {
      const g0 = parseInt(sixToFour[1], 16);
      const g1 = parseInt(sixToFour[2], 16);
      const a = (g0 >> 8) & 0xff;
      const b = g0 & 0xff;
      const c = (g1 >> 8) & 0xff;
      const d = g1 & 0xff;
      return isProxyHostBlocked(`${a}.${b}.${c}.${d}`);
    }
    return !/^[23][0-9a-f]{3}:/.test(lower);
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  for (let i = 1; i <= 4; i++) {
    const octet = m[i];
    if (octet.length > 1 && octet[0] === '0') return true;
    const n = +octet;
    if (n > 255) return true;
  }
  const a = +m[1], b = +m[2];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 0) return true;
  return false;
}

export function isAllowedProxyUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    if (isProxyHostBlocked(u.hostname)) return false;
    if (PROXY_ALLOWED_URL_PREFIXES.some(prefix => u.href.startsWith(prefix))) return true;
    return true;
  } catch {
    return false;
  }
}

export function normalizeProxyMethod(method) {
  const normalized = String(method || 'POST').trim().toUpperCase();
  return PROXY_ALLOWED_METHODS.has(normalized) ? normalized : null;
}

export function sanitizeProxyHeaders(headers = {}) {
  if (headers == null) return { ok: true, headers: {} };
  if (typeof headers !== 'object' || Array.isArray(headers)) {
    return { ok: false, error: 'Proxy headers must be an object' };
  }
  const out = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    if (rawValue == null) continue;
    const name = String(rawName || '').trim();
    const lower = name.toLowerCase();
    if (!name || !HEADER_NAME_RE.test(name)) return { ok: false, error: `Proxy header not allowed: ${name || '(empty)'}` };
    if (PROXY_BLOCKED_HEADER_NAMES.has(lower) || lower.startsWith('x-forwarded-')) {
      return { ok: false, error: `Proxy header not allowed: ${name}` };
    }
    if (!PROXY_ALLOWED_HEADER_NAMES.has(lower)) {
      return { ok: false, error: `Proxy header not allowed: ${name}` };
    }
    const value = String(rawValue);
    if (/[\r\n]/.test(value)) return { ok: false, error: `Proxy header has invalid value: ${name}` };
    out[name] = value;
  }
  return { ok: true, headers: out };
}

const HOSTED_OURA_PATHS = new Set([
  '/v2/usercollection/personal_info',
  '/v2/usercollection/sleep',
  '/v2/usercollection/daily_sleep',
  '/v2/usercollection/daily_readiness',
  '/v2/usercollection/daily_spo2',
  '/v2/usercollection/daily_activity',
  '/v2/usercollection/daily_stress',
  '/v2/usercollection/daily_resilience',
  '/v2/usercollection/daily_cardiovascular_age',
  '/v2/usercollection/vO2_max',
  '/v2/usercollection/heartrate',
]);

function lowerCaseHeaders(headers) {
  return Object.fromEntries(Object.entries(headers || {}).map(([name, value]) => [name.toLowerCase(), value]));
}

function onlyHeaderNames(headers, allowed) {
  return Object.keys(headers).every(name => allowed.has(name));
}

function hasBearerAuthorization(headers) {
  return typeof headers.authorization === 'string'
    && /^Bearer [^\s\r\n]{1,8192}$/.test(headers.authorization);
}

function hasNoBody(body) {
  return body == null || body === '';
}

function hasOnlyQueryKeys(url, allowed) {
  const seen = new Set();
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || seen.has(key) || value.length > 4096) return false;
    seen.add(key);
  }
  return true;
}

function isHostedOuraQuery(url) {
  const allowed = url.pathname === '/v2/usercollection/heartrate'
    ? new Set(['start_datetime', 'end_datetime', 'next_token'])
    : new Set(['start_date', 'end_date', 'next_token']);
  return hasOnlyQueryKeys(url, allowed) && !url.hash;
}

function isHostedWithingsBody(url, body) {
  if (url.search || url.hash) return false;
  const expectedAction = new Map([
    ['/measure', 'getmeas'],
    ['/v2/sleep', 'getsleepsummary'],
  ]).get(url.pathname);
  if (!expectedAction) return false;
  const allowed = new Set([
    'action', 'startdate', 'enddate', 'lastupdate', 'category',
    'startdateymd', 'enddateymd', 'data_fields',
  ]);
  const params = new URLSearchParams(body);
  if (params.get('action') !== expectedAction || !hasOnlyQueryKeys({ searchParams: params }, allowed)) return false;
  return [...params.values()].every(value => value.length <= 4096);
}

function isHostedFitbitTokenBody(body) {
  const params = new URLSearchParams(body);
  const grantType = params.get('grant_type');
  const allowed = grantType === 'authorization_code'
    ? new Set(['grant_type', 'code', 'redirect_uri', 'client_id', 'code_verifier'])
    : grantType === 'refresh_token'
      ? new Set(['grant_type', 'refresh_token', 'client_id'])
      : null;
  if (!allowed || !hasOnlyQueryKeys({ searchParams: params }, allowed)) return false;
  if (![...allowed].every(key => params.has(key) && params.get(key).length > 0 && params.get(key).length <= 8192)) return false;
  if (params.get('client_id') !== '23VBN8') return false;
  if (grantType === 'authorization_code' && !new Set([
    'https://app.getbased.health',
    'https://getbased.health/app',
    'https://beta.getbased.health/',
  ]).has(params.get('redirect_uri'))) return false;
  return true;
}

function isHostedPolarRequest(url, method, headers, body) {
  if (url.origin !== 'https://www.polaraccesslink.com' || url.search || url.hash) return false;
  const segment = '[A-Za-z0-9._~-]+';
  const apiHeaders = new Set(['accept', 'authorization', 'content-type']);
  if (!hasBearerAuthorization(headers) || !onlyHeaderNames(headers, apiHeaders)) return false;

  if (method === 'POST' && url.pathname === '/v3/users') {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        && Object.keys(parsed).length === 1
        && typeof parsed['member-id'] === 'string'
        && parsed['member-id'].length > 0
        && parsed['member-id'].length <= 255;
    } catch {
      return false;
    }
  }
  if (method === 'GET' && hasNoBody(body)) {
    return new RegExp(`^/v3/users/${segment}(?:/nights/sleep)?$`).test(url.pathname)
      || new RegExp(`^/v3/users/${segment}/(?:activity-transactions/${segment}/activities/${segment}|exercise-transactions/${segment}/exercises/${segment}|activity/${segment}|exercises/${segment})$`).test(url.pathname);
  }
  if (method === 'POST' && hasNoBody(body)) {
    return new RegExp(`^/v3/users/${segment}/(?:activity-transactions|exercise-transactions)$`).test(url.pathname);
  }
  if (method === 'PUT' && hasNoBody(body)) {
    return new RegExp(`^/v3/users/${segment}/(?:activity-transactions|exercise-transactions)/${segment}$`).test(url.pathname);
  }
  return false;
}

/**
 * Classify the legacy generic envelope on a getbased-operated deployment.
 * Only the exact compatibility calls still used by the hosted product are
 * admitted. Arbitrary authenticated or body-bearing forwarding is reserved
 * for infrastructure controlled by a self-hoster.
 */
export function classifyHostedProxyRequest({ url: rawUrl, method, headers: rawHeaders, body, purpose }) {
  let url;
  try { url = new URL(rawUrl); } catch { return { ok: false, error: 'Hosted proxy URL is invalid' }; }
  const headers = lowerCaseHeaders(rawHeaders);

  if (url.href === 'https://nras.attestation.nvidia.com/v3/attest/gpu'
      && method === 'POST'
      && typeof body === 'string'
      && body.length > 0
      && onlyHeaderNames(headers, new Set(['accept', 'content-type']))) {
    return { ok: true, operation: 'nvidia-nras-attestation' };
  }

  if (url.origin === 'https://api.ouraring.com'
      && method === 'GET'
      && HOSTED_OURA_PATHS.has(url.pathname)
      && isHostedOuraQuery(url)
      && hasNoBody(body)
      && hasBearerAuthorization(headers)
      && onlyHeaderNames(headers, new Set(['accept', 'authorization']))) {
    return { ok: true, operation: 'oura-data' };
  }

  if (isHostedPolarRequest(url, method, headers, body)) {
    return { ok: true, operation: 'polar-data' };
  }

  if (url.origin === 'https://wbsapi.withings.net'
      && method === 'POST'
      && typeof body === 'string'
      && isHostedWithingsBody(url, body)
      && hasBearerAuthorization(headers)
      && headers['content-type'] === 'application/x-www-form-urlencoded'
      && onlyHeaderNames(headers, new Set(['accept', 'authorization', 'content-type']))) {
    return { ok: true, operation: 'withings-data' };
  }

  if (url.origin === 'https://api.fitbit.com'
      && method === 'GET'
      && !url.search
      && !url.hash
      && /^\/(?:1|1\.2)\/user\/-\/(?:profile\.json|hrv\/date\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}\.json|activities\/(?:heart|steps)\/date\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}\.json|sleep\/date\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}\.json|spo2\/date\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}\.json|temp\/skin\/date\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}\.json|body\/log\/weight\/date\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}\.json)$/.test(url.pathname)
      && hasNoBody(body)
      && hasBearerAuthorization(headers)
      && onlyHeaderNames(headers, new Set(['accept', 'authorization']))) {
    return { ok: true, operation: 'fitbit-data' };
  }

  if (url.href === 'https://api.fitbit.com/oauth2/token'
      && method === 'POST'
      && typeof body === 'string'
      && isHostedFitbitTokenBody(body)
      && headers['content-type'] === 'application/x-www-form-urlencoded'
      && onlyHeaderNames(headers, new Set(['accept', 'content-type']))) {
    return { ok: true, operation: 'fitbit-oauth' };
  }

  // Product/device URL import needs an arbitrary public page, but never user
  // credentials or a request body. Redirect and DNS validation still apply.
  if (purpose === 'public-page'
      && method === 'GET'
      && hasNoBody(body)
      && onlyHeaderNames(headers, new Set(['accept']))) {
    return { ok: true, operation: 'public-page' };
  }

  return {
    ok: false,
    error: 'This hosted proxy operation is not available. Use browser-direct access or a proxy on infrastructure you control.',
  };
}
