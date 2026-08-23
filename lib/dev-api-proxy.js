// @ts-check

import http from 'node:http';
import https from 'node:https';
import {
  PROXY_MAX_REQUEST_BYTES,
  PROXY_MAX_RESPONSE_BYTES,
  isAllowedProxyUrl,
  normalizeCamsRelayPayload,
  normalizeProxyMethod,
  sanitizeProxyHeaders,
} from './proxy-policy.js';

// Used only to recognize an operator's explicit UVDATA_UPSTREAM choice and
// select the private POST contract. Merely running the public source never
// opts a self-hoster into getbased infrastructure.
export const DEFAULT_UVDATA_UPSTREAM = 'https://uvdata.getbased.health';
export const WEARABLE_CLIENT_ID_VARS = [
  ['OURA_CLIENT_ID', 'oura'],
  ['WITHINGS_CLIENT_ID', 'withings'],
  ['ULTRAHUMAN_CLIENT_ID', 'ultrahuman'],
  ['POLAR_CLIENT_ID', 'polar'],
  ['WHOOP_CLIENT_ID', 'whoop'],
  ['FITBIT_CLIENT_ID', 'fitbit'],
  ['GOOGLE_HEALTH_CLIENT_ID', 'google_health'],
];

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function collectWearableOverrides(env) {
  const out = {};
  if (!env || typeof env !== 'object') return out;
  for (const [key, id] of WEARABLE_CLIENT_ID_VARS) {
    const value = env[key];
    if (typeof value === 'string' && value.trim()) out[id] = value.trim();
  }
  return out;
}

export function collectWearableConfigured(env) {
  const hasEnv = key => typeof env?.[key] === 'string' && env[key].trim();
  return {
    google_health: env?.GOOGLE_HEALTH_ENABLED === 'true'
      && Boolean(hasEnv('GOOGLE_HEALTH_CLIENT_ID') && hasEnv('GOOGLE_HEALTH_CLIENT_SECRET')),
    ultrahuman: env?.ULTRAHUMAN_ENABLED === 'true'
      && Boolean(hasEnv('ULTRAHUMAN_CLIENT_ID') && hasEnv('ULTRAHUMAN_CLIENT_SECRET')),
    whoop: env?.WHOOP_ENABLED === 'true'
      && Boolean(hasEnv('WHOOP_CLIENT_ID') && hasEnv('WHOOP_CLIENT_SECRET')),
  };
}

const DEV_PROXY_OPERATION_FIELDS = new Map([
  ['wearable_runtime_config', 'wearable-runtime-config'],
  ['oura_token_exchange', 'oura-exchange'],
  ['oura_token_refresh', 'oura-refresh'],
  ['ultrahuman_token_exchange', 'ultrahuman-exchange'],
  ['ultrahuman_token_refresh', 'ultrahuman-refresh'],
  ['whoop_token_exchange', 'whoop-exchange'],
  ['whoop_token_refresh', 'whoop-refresh'],
  ['withings_token_exchange', 'withings-exchange'],
  ['withings_token_refresh', 'withings-refresh'],
  ['polar_token_exchange', 'polar-exchange'],
  ['polar_token_refresh', 'polar-refresh'],
  ['google_health_token_exchange', 'google-health-exchange'],
  ['google_health_token_refresh', 'google-health-refresh'],
]);

export function classifyDevProxyOperation(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'Proxy request body must be an object' };
  }
  const requested = [];
  for (const [field, operation] of DEV_PROXY_OPERATION_FIELDS) {
    if (field === 'wearable_runtime_config' ? payload[field] === true : Boolean(payload[field])) {
      requested.push(operation);
    }
  }
  if (payload.meteo === 'cams') requested.push('cams');
  if (payload.meteo === 'postal_geocode') requested.push('postal-geocode');
  if (requested.length > 1 || (requested.length === 1 && payload.url)) {
    return { ok: false, error: 'Proxy request must select exactly one operation' };
  }
  return { ok: true, operation: requested[0] || 'generic' };
}

export function _sendCappedProxyResponse(req, res, proxyRes, corsHeaders) {
  const contentType = proxyRes.headers?.['content-type'] || 'application/json';
  const contentLength = parseInt(proxyRes.headers?.['content-length'] || '0', 10);
  const proxyCorsHeaders = {
    ...corsHeaders(req),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  const fail = (message) => {
    try { proxyRes.destroy?.(); } catch {}
    res.writeHead(502, { 'Content-Type': 'application/json', ...corsHeaders(req) });
    res.end(JSON.stringify({ error: message }));
  };
  if (contentLength > PROXY_MAX_RESPONSE_BYTES) {
    fail('Proxy response exceeds size cap');
    return;
  }
  const chunks = [];
  let responseBytes = 0;
  let finished = false;
  proxyRes.on('data', chunk => {
    if (finished) return;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    responseBytes += buffer.length;
    if (responseBytes > PROXY_MAX_RESPONSE_BYTES) {
      finished = true;
      fail('Proxy response exceeds size cap');
      return;
    }
    chunks.push(buffer);
  });
  proxyRes.on('end', () => {
    if (finished) return;
    finished = true;
    res.writeHead(proxyRes.statusCode || 200, { 'Content-Type': contentType, ...proxyCorsHeaders });
    res.end(Buffer.concat(chunks, responseBytes));
  });
  proxyRes.on('error', error => {
    if (finished) return;
    finished = true;
    fail(`Upstream error: ${errorMessage(error)}`);
  });
}

function writeJson(req, res, corsHeaders, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders(req) });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function handleDevPostalGeocode(payload, req, res, corsHeaders) {
  const country = typeof payload.country === 'string' ? payload.country.trim() : '';
  const postalCode = typeof payload.postalCode === 'string' ? payload.postalCode.trim() : '';
  if (!country || !postalCode || country.length > 80 || postalCode.length > 24
      || (postalCode && !/^[\p{L}\p{N} .-]+$/u.test(postalCode))) {
    writeJson(req, res, corsHeaders, 400, { error: 'Invalid country/postal code' });
    return;
  }
  const qs = new URLSearchParams({
    country,
    postalcode: postalCode,
    format: 'jsonv2',
    limit: '3',
    addressdetails: '1',
  });
  const endpoint = `https://nominatim.openstreetmap.org/search?${qs.toString()}`;
  let finished = false;
  const fail = (status, message) => {
    if (finished) return;
    finished = true;
    writeJson(req, res, corsHeaders, status, { error: message });
  };
  const upstream = https.get(endpoint, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'getbased-health-location-proxy/1.0 (+https://getbased.health)',
    },
  }, upstreamRes => {
    const chunks = [];
    let bytes = 0;
    upstreamRes.on('data', chunk => {
      if (finished) return;
      bytes += chunk.length;
      if (bytes > 64 * 1024) {
        fail(502, 'Location response exceeds size cap');
        upstreamRes.destroy();
        return;
      }
      chunks.push(chunk);
    });
    upstreamRes.on('end', () => {
      if (finished) return;
      if ((upstreamRes.statusCode || 500) >= 400) {
        fail(upstreamRes.statusCode || 502, 'Location lookup unavailable');
        return;
      }
      try {
        const json = JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
        const results = Array.isArray(json) ? json : [];
        const normalizedPostal = postalCode.replace(/\s+/g, '').toLowerCase();
        const match = results.find(item => String(item?.address?.postcode || item?.name || '').replace(/\s+/g, '').toLowerCase() === normalizedPostal)
          || results[0];
        const latitude = Number(match?.lat);
        const longitude = Number(match?.lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          fail(404, 'Location not found');
          return;
        }
        finished = true;
        writeJson(req, res, corsHeaders, 200, {
          latitude: Math.round(latitude * 10) / 10,
          longitude: Math.round(longitude * 10) / 10,
          accuracyKm: 11,
          timezone: null,
          label: typeof match.display_name === 'string' ? match.display_name : `${postalCode}, ${country}`,
          source: 'postal-area',
          resolvedAt: Date.now(),
          attribution: '© OpenStreetMap contributors',
        });
      } catch {
        fail(502, 'Invalid location response');
      }
    });
    upstreamRes.on('error', error => fail(502, `Location lookup unavailable: ${errorMessage(error)}`));
  });
  upstream.on('error', error => {
    fail(502, `Location lookup unavailable: ${errorMessage(error)}`);
  });
}

function proxyOAuthToken(req, res, corsHeaders, endpoint, form, errorPrefix, headers = {}) {
  const tokenReq = https.request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
  }, tokenRes => {
    const contentType = tokenRes.headers['content-type'] || 'application/json';
    res.writeHead(tokenRes.statusCode || 502, {
      'Content-Type': contentType,
      ...corsHeaders(req),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    tokenRes.pipe(res);
  });
  tokenReq.on('error', error => {
    writeJson(req, res, corsHeaders, 502, { error: `${errorPrefix}: ${errorMessage(error)}` });
  });
  tokenReq.write(form.toString());
  tokenReq.end();
}

export function handleDevApiProxy(req, res, options) {
  const corsHeaders = options.corsHeaders;
  const env = options.env ?? process.env;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...corsHeaders(req),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return true;
  }
  if (req.method !== 'POST') return false;

  let body = '';
  let bytes = 0;
  let aborted = false;
  req.on('data', chunk => {
    if (aborted) return;
    bytes += chunk.length;
    if (bytes > PROXY_MAX_REQUEST_BYTES) {
      aborted = true;
      writeJson(req, res, corsHeaders, 413, '{"error":"Proxy request body too large"}');
      req.destroy();
      return;
    }
    body += chunk;
  });
  req.on('end', () => {
    if (aborted) return;
    try {
      const payload = JSON.parse(body);
      const classified = classifyDevProxyOperation(payload);
      if (!classified.ok) {
        writeJson(req, res, corsHeaders, 400, { error: classified.error });
        return;
      }
      const operation = classified.operation;

      if (operation === 'wearable-runtime-config') {
        writeJson(req, res, corsHeaders, 200, {
          overrides: collectWearableOverrides(env),
          configured: collectWearableConfigured(env),
        });
        return;
      }

      if (operation === 'postal-geocode') {
        handleDevPostalGeocode(payload, req, res, corsHeaders);
        return;
      }

      if (operation === 'oura-exchange' || operation === 'oura-refresh') {
        const secret = env.OURA_CLIENT_SECRET;
        if (!secret) {
          writeJson(req, res, corsHeaders, 500, { error: 'OURA_CLIENT_SECRET not set — export it before `node dev-server.js`' });
          return;
        }
        let form;
        if (operation === 'oura-exchange') {
          const { code, redirect_uri, client_id } = payload.oura_token_exchange;
          if (!code || !redirect_uri || !client_id) {
            writeJson(req, res, corsHeaders, 400, '{"error":"oura_token_exchange requires code, redirect_uri, client_id"}');
            return;
          }
          form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri, client_id, client_secret: secret });
        } else {
          const { refresh_token, client_id } = payload.oura_token_refresh;
          if (!refresh_token || !client_id) {
            writeJson(req, res, corsHeaders, 400, '{"error":"oura_token_refresh requires refresh_token, client_id"}');
            return;
          }
          form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token, client_id, client_secret: secret });
        }
        proxyOAuthToken(req, res, corsHeaders, 'https://api.ouraring.com/oauth/token', form, 'Token endpoint unreachable');
        return;
      }

      if (operation === 'ultrahuman-exchange' || operation === 'ultrahuman-refresh') {
        const clientId = typeof env.ULTRAHUMAN_CLIENT_ID === 'string' ? env.ULTRAHUMAN_CLIENT_ID.trim() : '';
        const secret = env.ULTRAHUMAN_CLIENT_SECRET;
        if (env.ULTRAHUMAN_ENABLED !== 'true' || !clientId || typeof secret !== 'string' || !secret.trim()) {
          writeJson(req, res, corsHeaders, 503, { error: 'Ultrahuman is disabled on this deployment' });
          return;
        }
        let form;
        if (operation === 'ultrahuman-exchange') {
          const { code, redirect_uri, client_id: requestedClientId } = payload.ultrahuman_token_exchange;
          if (!code || !redirect_uri || !requestedClientId) {
            writeJson(req, res, corsHeaders, 400, '{"error":"ultrahuman_token_exchange requires code, redirect_uri, client_id"}');
            return;
          }
          if (requestedClientId !== clientId) {
            writeJson(req, res, corsHeaders, 400, { error: 'Ultrahuman client_id does not match this deployment' });
            return;
          }
          form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri, client_id: clientId, client_secret: secret });
        } else {
          const { refresh_token, client_id: requestedClientId } = payload.ultrahuman_token_refresh;
          if (!refresh_token || !requestedClientId) {
            writeJson(req, res, corsHeaders, 400, '{"error":"ultrahuman_token_refresh requires refresh_token, client_id"}');
            return;
          }
          if (requestedClientId !== clientId) {
            writeJson(req, res, corsHeaders, 400, { error: 'Ultrahuman client_id does not match this deployment' });
            return;
          }
          form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token, client_id: clientId, client_secret: secret });
        }
        proxyOAuthToken(
          req,
          res,
          corsHeaders,
          'https://partner.ultrahuman.com/api/partners/oauth/token',
          form,
          'Ultrahuman token endpoint unreachable',
        );
        return;
      }

      if (operation === 'whoop-exchange' || operation === 'whoop-refresh') {
        const clientId = typeof env.WHOOP_CLIENT_ID === 'string' ? env.WHOOP_CLIENT_ID.trim() : '';
        const secret = env.WHOOP_CLIENT_SECRET;
        if (env.WHOOP_ENABLED !== 'true' || !clientId || typeof secret !== 'string' || !secret.trim()) {
          writeJson(req, res, corsHeaders, 503, { error: 'WHOOP is disabled on this deployment' });
          return;
        }
        let form;
        if (operation === 'whoop-exchange') {
          const { code, redirect_uri, client_id: requestedClientId } = payload.whoop_token_exchange;
          if (!code || !redirect_uri || !requestedClientId) {
            writeJson(req, res, corsHeaders, 400, '{"error":"whoop_token_exchange requires code, redirect_uri, client_id"}');
            return;
          }
          if (requestedClientId !== clientId) {
            writeJson(req, res, corsHeaders, 400, { error: 'WHOOP client_id does not match this deployment' });
            return;
          }
          form = new URLSearchParams({
            grant_type: 'authorization_code', code, redirect_uri,
            client_id: clientId, client_secret: secret,
          });
        } else {
          const { refresh_token, client_id: requestedClientId } = payload.whoop_token_refresh;
          if (!refresh_token || !requestedClientId) {
            writeJson(req, res, corsHeaders, 400, '{"error":"whoop_token_refresh requires refresh_token, client_id"}');
            return;
          }
          if (requestedClientId !== clientId) {
            writeJson(req, res, corsHeaders, 400, { error: 'WHOOP client_id does not match this deployment' });
            return;
          }
          form = new URLSearchParams({
            grant_type: 'refresh_token', refresh_token,
            client_id: clientId, client_secret: secret, scope: 'offline',
          });
        }
        proxyOAuthToken(
          req,
          res,
          corsHeaders,
          'https://api.prod.whoop.com/oauth/oauth2/token',
          form,
          'WHOOP token endpoint unreachable',
        );
        return;
      }

      if (operation === 'withings-exchange' || operation === 'withings-refresh') {
        const secret = env.WITHINGS_CLIENT_SECRET;
        if (!secret) {
          writeJson(req, res, corsHeaders, 500, { error: 'WITHINGS_CLIENT_SECRET not set — export it before `node dev-server.js`' });
          return;
        }
        let form;
        if (operation === 'withings-exchange') {
          const { code, redirect_uri, client_id } = payload.withings_token_exchange;
          if (!code || !redirect_uri || !client_id) {
            writeJson(req, res, corsHeaders, 400, '{"error":"withings_token_exchange requires code, redirect_uri, client_id"}');
            return;
          }
          form = new URLSearchParams({
            action: 'requesttoken',
            grant_type: 'authorization_code',
            client_id,
            client_secret: secret,
            code,
            redirect_uri,
          });
        } else {
          const { refresh_token, client_id } = payload.withings_token_refresh;
          if (!refresh_token || !client_id) {
            writeJson(req, res, corsHeaders, 400, '{"error":"withings_token_refresh requires refresh_token, client_id"}');
            return;
          }
          form = new URLSearchParams({
            action: 'requesttoken',
            grant_type: 'refresh_token',
            client_id,
            client_secret: secret,
            refresh_token,
          });
        }
        proxyOAuthToken(
          req,
          res,
          corsHeaders,
          'https://wbsapi.withings.net/v2/oauth2',
          form,
          'Withings token endpoint unreachable',
        );
        return;
      }

      if (operation === 'polar-exchange' || operation === 'polar-refresh') {
        const secret = env.POLAR_CLIENT_SECRET;
        if (!secret) {
          writeJson(req, res, corsHeaders, 500, { error: 'POLAR_CLIENT_SECRET not set — add it to .env.local before `node dev-server.js`' });
          return;
        }
        let form;
        let clientId;
        if (operation === 'polar-exchange') {
          const { code, redirect_uri, client_id } = payload.polar_token_exchange;
          if (!code || !redirect_uri || !client_id) {
            writeJson(req, res, corsHeaders, 400, '{"error":"polar_token_exchange requires code, redirect_uri, client_id"}');
            return;
          }
          clientId = client_id;
          form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri });
        } else {
          const { refresh_token, client_id } = payload.polar_token_refresh;
          if (!refresh_token || !client_id) {
            writeJson(req, res, corsHeaders, 400, '{"error":"polar_token_refresh requires refresh_token, client_id"}');
            return;
          }
          clientId = client_id;
          form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token });
        }
        const authorization = `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`;
        proxyOAuthToken(
          req,
          res,
          corsHeaders,
          'https://polarremote.com/v2/oauth2/token',
          form,
          'Polar token endpoint unreachable',
          { Accept: 'application/json;charset=UTF-8', Authorization: authorization },
        );
        return;
      }

      if (operation === 'google-health-exchange' || operation === 'google-health-refresh') {
        const secret = env.GOOGLE_HEALTH_CLIENT_SECRET;
        const clientId = env.GOOGLE_HEALTH_CLIENT_ID;
        if (env.GOOGLE_HEALTH_ENABLED !== 'true' || !secret || !clientId) {
          writeJson(req, res, corsHeaders, 503, { error: 'Google Health is disabled — set GOOGLE_HEALTH_ENABLED=true and configure both Google OAuth credentials' });
          return;
        }
        let form;
        if (operation === 'google-health-exchange') {
          const { code, redirect_uri, client_id } = payload.google_health_token_exchange;
          if (!code || !redirect_uri || !client_id) {
            writeJson(req, res, corsHeaders, 400, '{"error":"google_health_token_exchange requires code, redirect_uri, client_id"}');
            return;
          }
          form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri, client_id, client_secret: secret });
        } else {
          const { refresh_token, client_id } = payload.google_health_token_refresh;
          if (!refresh_token || !client_id) {
            writeJson(req, res, corsHeaders, 400, '{"error":"google_health_token_refresh requires refresh_token, client_id"}');
            return;
          }
          form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token, client_id, client_secret: secret });
        }
        proxyOAuthToken(
          req,
          res,
          corsHeaders,
          'https://oauth2.googleapis.com/token',
          form,
          'Google OAuth token endpoint unreachable',
        );
        return;
      }

      if (operation === 'cams') {
        const configuredUpstream = env.UVDATA_UPSTREAM ? env.UVDATA_UPSTREAM.replace(/\/+$/, '') : '';
        const bearer = env.UVDATA_BEARER || '';
        const upstream = configuredUpstream;
        if (!upstream) {
          writeJson(req, res, corsHeaders, 503, {
            error: 'CAMS relay upstream is empty. Set UVDATA_UPSTREAM or switch Sun Data Source to Open-Meteo.',
          });
          return;
        }
        const usePrivateRoute = upstream === DEFAULT_UVDATA_UPSTREAM;
        if (usePrivateRoute && !bearer) {
          writeJson(req, res, corsHeaders, 503, { error: 'CAMS relay bearer is not configured.' });
          return;
        }
        const normalized = normalizeCamsRelayPayload(payload, { forcePrivacyRounding: usePrivateRoute });
        if (!normalized.ok) {
          writeJson(req, res, corsHeaders, 400, { error: normalized.error });
          return;
        }
        const upstreamHeaders = { Accept: 'application/json' };
        if (bearer) upstreamHeaders.Authorization = `Bearer ${bearer}`;
        let requestBody = '';
        let upstreamUrl;
        if (usePrivateRoute) {
          upstreamUrl = `${upstream}/v1/uv`;
          upstreamHeaders['Content-Type'] = 'application/json';
          requestBody = JSON.stringify({
            latitude: normalized.latitude,
            longitude: normalized.longitude,
            ...(normalized.time ? { time: normalized.time } : {}),
          });
          upstreamHeaders['Content-Length'] = String(Buffer.byteLength(requestBody));
        } else {
          const query = new URLSearchParams({
            latitude: String(normalized.latitude),
            longitude: String(normalized.longitude),
          });
          if (normalized.time) query.set('time', normalized.time);
          upstreamUrl = `${upstream}/uv?${query.toString()}`;
        }
        const parsedUpstream = new URL(upstreamUrl);
        const transport = parsedUpstream.protocol === 'https:' ? https : http;
        const responseCapBytes = 256 * 1024;
        const camsReq = transport.request(upstreamUrl, {
          method: usePrivateRoute ? 'POST' : 'GET',
          headers: upstreamHeaders,
        }, camsRes => {
          const contentType = camsRes.headers['content-type'] || 'application/json';
          if (usePrivateRoute && !/^application\/json(?:;|$)/i.test(contentType)) {
            try { camsRes.destroy(); } catch {}
            writeJson(req, res, corsHeaders, 502, { error: 'CAMS relay returned an invalid content type' });
            return;
          }
          const declaredBytes = Number.parseInt(camsRes.headers['content-length'] || '0', 10);
          if (declaredBytes > responseCapBytes) {
            try { camsRes.destroy(); } catch {}
            writeJson(req, res, corsHeaders, 502, { error: 'CAMS response exceeds size cap' });
            return;
          }
          const chunks = [];
          let bytesPiped = 0;
          let finished = false;
          const fail = message => {
            if (finished) return;
            finished = true;
            try { camsRes.destroy(); } catch {}
            writeJson(req, res, corsHeaders, 502, { error: message });
          };
          camsRes.on('data', chunk => {
            if (finished) return;
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
            bytesPiped += buffer.length;
            if (bytesPiped > responseCapBytes) {
              fail('CAMS response exceeds size cap');
              return;
            }
            chunks.push(buffer);
          });
          camsRes.on('end', () => {
            if (finished) return;
            finished = true;
            res.writeHead(camsRes.statusCode || 502, {
              'Content-Type': contentType,
              ...corsHeaders(req),
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            });
            res.end(Buffer.concat(chunks, bytesPiped));
          });
          camsRes.on('error', () => fail('CAMS upstream response failed'));
        });
        camsReq.on('error', error => {
          writeJson(req, res, corsHeaders, 502, { error: `CAMS upstream unreachable: ${errorMessage(error)}` });
        });
        if (requestBody) camsReq.write(requestBody);
        camsReq.end();
        return;
      }

      const { url: targetUrl, headers: forwardHeaders, body: forwardBody, method: upstreamMethod } = payload;
      if (!targetUrl) {
        writeJson(req, res, corsHeaders, 400, '{"error":"missing url"}');
        return;
      }
      if (!isAllowedProxyUrl(targetUrl)) {
        writeJson(req, res, corsHeaders, 403, '{"error":"URL not allowed"}');
        return;
      }
      const parsedUrl = new URL(targetUrl);
      const transport = parsedUrl.protocol === 'https:' ? https : http;
      const fetchMethod = normalizeProxyMethod(upstreamMethod);
      if (!fetchMethod) {
        writeJson(req, res, corsHeaders, 405, '{"error":"Proxy method not allowed"}');
        return;
      }
      const safeHeaders = sanitizeProxyHeaders(forwardHeaders);
      if (!safeHeaders.ok) {
        writeJson(req, res, corsHeaders, 400, { error: safeHeaders.error });
        return;
      }
      const requestHeaders = { ...safeHeaders.headers };
      const hasContentType = Object.keys(requestHeaders).some(key => key.toLowerCase() === 'content-type');
      if (fetchMethod !== 'GET' && !hasContentType) requestHeaders['Content-Type'] = 'application/json';
      const proxyReq = transport.request(targetUrl, { method: fetchMethod, headers: requestHeaders }, proxyRes => {
        _sendCappedProxyResponse(req, res, proxyRes, corsHeaders);
      });
      proxyReq.on('error', error => {
        writeJson(req, res, corsHeaders, 502, { error: `Upstream error: ${errorMessage(error)}` });
      });
      if (fetchMethod !== 'GET' && forwardBody) {
        proxyReq.write(typeof forwardBody === 'string' ? forwardBody : JSON.stringify(forwardBody));
      }
      proxyReq.end();
    } catch (error) {
      writeJson(req, res, corsHeaders, 400, { error: `Invalid JSON: ${errorMessage(error)}` });
    }
  });
  return true;
}
