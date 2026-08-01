// @ts-check

import http from 'node:http';
import https from 'node:https';
import {
  PROXY_MAX_REQUEST_BYTES,
  PROXY_MAX_RESPONSE_BYTES,
  isAllowedProxyUrl,
  normalizeProxyMethod,
  sanitizeProxyHeaders,
} from './proxy-policy.js';

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

const DEV_PROXY_OPERATION_FIELDS = new Map([
  ['wearable_runtime_config', 'wearable-runtime-config'],
  ['oura_token_exchange', 'oura-exchange'],
  ['oura_token_refresh', 'oura-refresh'],
  ['ultrahuman_token_exchange', 'ultrahuman-exchange'],
  ['ultrahuman_token_refresh', 'ultrahuman-refresh'],
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
        writeJson(req, res, corsHeaders, 200, { overrides: collectWearableOverrides(env) });
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
        const secret = env.ULTRAHUMAN_CLIENT_SECRET;
        if (!secret) {
          writeJson(req, res, corsHeaders, 500, { error: 'ULTRAHUMAN_CLIENT_SECRET not set — add it to .env.local' });
          return;
        }
        let form;
        if (operation === 'ultrahuman-exchange') {
          const { code, redirect_uri, client_id } = payload.ultrahuman_token_exchange;
          if (!code || !redirect_uri || !client_id) {
            writeJson(req, res, corsHeaders, 400, '{"error":"ultrahuman_token_exchange requires code, redirect_uri, client_id"}');
            return;
          }
          form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri, client_id, client_secret: secret });
        } else {
          const { refresh_token, client_id } = payload.ultrahuman_token_refresh;
          if (!refresh_token || !client_id) {
            writeJson(req, res, corsHeaders, 400, '{"error":"ultrahuman_token_refresh requires refresh_token, client_id"}');
            return;
          }
          form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token, client_id, client_secret: secret });
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
        if (!secret) {
          writeJson(req, res, corsHeaders, 500, { error: 'GOOGLE_HEALTH_CLIENT_SECRET not set — add it to .env.local before `node dev-server.js`' });
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
        const upstream = configuredUpstream || DEFAULT_UVDATA_UPSTREAM;
        const bearer = env.UVDATA_BEARER || '';
        if (!upstream) {
          writeJson(req, res, corsHeaders, 503, {
            error: 'CAMS relay upstream is empty. Set UVDATA_UPSTREAM or switch Sun Data Source to Open-Meteo/manual.',
          });
          return;
        }
        if (!configuredUpstream && !bearer) {
          writeJson(req, res, corsHeaders, 503, {
            error: 'CAMS hosted relay requires UVDATA_BEARER. Set UVDATA_BEARER for the hosted default, set UVDATA_UPSTREAM for your own relay, or switch Sun Data Source to Open-Meteo/manual.',
          });
          return;
        }
        const latitude = Number(payload.latitude);
        const longitude = Number(payload.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
            || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
          writeJson(req, res, corsHeaders, 400, { error: 'Invalid latitude/longitude' });
          return;
        }
        const time = typeof payload.time === 'string' ? payload.time : '';
        const query = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
        if (time) query.set('time', time);
        const upstreamUrl = `${upstream}/uv?${query.toString()}`;
        const upstreamHeaders = { Accept: 'application/json' };
        if (bearer) upstreamHeaders.Authorization = `Bearer ${bearer}`;
        const responseCapBytes = 256 * 1024;
        const camsReq = https.request(upstreamUrl, { method: 'GET', headers: upstreamHeaders }, camsRes => {
          const contentType = camsRes.headers['content-type'] || 'application/json';
          res.writeHead(camsRes.statusCode || 502, {
            'Content-Type': contentType,
            ...corsHeaders(req),
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          });
          let bytesPiped = 0;
          let stopped = false;
          camsRes.on('data', chunk => {
            if (stopped) return;
            bytesPiped += chunk.length;
            if (bytesPiped > responseCapBytes) {
              stopped = true;
              try { camsRes.destroy(); } catch {}
              try { res.end(); } catch {}
              return;
            }
            try { res.write(chunk); } catch {}
          });
          camsRes.on('end', () => {
            if (!stopped) {
              try { res.end(); } catch {}
            }
          });
          camsRes.on('error', () => {
            if (!stopped) {
              try { res.end(); } catch {}
            }
          });
        });
        camsReq.on('error', error => {
          writeJson(req, res, corsHeaders, 502, { error: `CAMS upstream unreachable: ${errorMessage(error)}` });
        });
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
