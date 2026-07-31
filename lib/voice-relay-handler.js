// Vercel Node.js Function — bounded xAI and ElevenLabs STT/TTS relay.
// User API keys pass through for one request and are never stored or logged.

import {
  VOICE_MAX_AUDIO_RESPONSE_BYTES,
  VOICE_MAX_JSON_RESPONSE_BYTES,
  normalizeVoiceAction,
  normalizeVoiceProvider,
  normalizeVoiceTtsPayload,
  readVoiceBearer,
  readVoiceRequestBytes,
  voiceUpstream,
} from './voice-relay-policy.js';
import {
  capReadableStream,
  fetchWithValidatedRedirects,
  readResponseTextWithCap,
} from './proxy-upstream.js';
import { errorCode } from './error-utils.js';

/** @type {Promise<typeof import('./proxy-rate-limit.js')> | null} */
let rateLimitModulePromise = null;

function loadRateLimit() {
  rateLimitModulePromise ||= import('./proxy-rate-limit.js');
  return rateLimitModulePromise;
}

const ALLOWED_CALLER_ORIGINS = [
  'https://app.getbased.health',
  'https://getbased.health',
  'https://www.getbased.health',
  'https://get-based.vercel.app',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

function isAllowedCallerOrigin(request) {
  const origin = request?.headers?.get?.('origin') || '';
  if (!origin) return false;
  try {
    const caller = new URL(origin);
    return caller.origin === new URL(request.url).origin
      || ALLOWED_CALLER_ORIGINS.includes(caller.origin);
  } catch {
    return false;
  }
}

function corsHeaders(request) {
  const origin = request?.headers?.get?.('origin') || '';
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Voice-Provider',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (isAllowedCallerOrigin(request)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function jsonResponse(request, status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

function voiceErrorResponse(request, error) {
  const code = errorCode(error);
  if (code === 'VOICE_REQUEST_TOO_LARGE') {
    return jsonResponse(request, 413, { error: 'Voice request body is too large.' });
  }
  if (code === 'VOICE_INVALID_REQUEST') {
    return jsonResponse(request, 400, { error: error.message || 'Invalid voice request.' });
  }
  if (code === 'PROXY_UPSTREAM_TIMEOUT') {
    return jsonResponse(request, 504, { error: 'Voice provider timed out.' });
  }
  if (code === 'PROXY_DNS_BLOCKED' || code === 'PROXY_REDIRECT_BLOCKED') {
    return jsonResponse(request, 502, { error: 'Voice provider destination was rejected.' });
  }
  return jsonResponse(request, 502, { error: 'Voice provider request failed.' });
}

async function enforceRateLimit(request) {
  try {
    const { enforceProxyRateLimit } = await loadRateLimit();
    return await enforceProxyRateLimit(request);
  } catch {
    return { unavailable: true, retryAfterSeconds: 60 };
  }
}

async function prepareUpstreamRequest(request, provider, action, key) {
  if (action === 'stt') {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
      throw Object.assign(new Error('STT requires multipart/form-data.'), {
        code: 'VOICE_INVALID_REQUEST',
      });
    }
    const bytes = await readVoiceRequestBytes(request);
    const upstream = voiceUpstream(provider, action, key);
    return {
      ...upstream,
      headers: { ...upstream.headers, 'Content-Type': contentType },
      body: bytes,
    };
  }

  if (action === 'tts') {
    const bytes = await readVoiceRequestBytes(request, 256 * 1024);
    let payload;
    try {
      payload = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw Object.assign(new Error('Voice request body must be valid JSON.'), {
        code: 'VOICE_INVALID_REQUEST',
      });
    }
    return voiceUpstream(provider, action, key, normalizeVoiceTtsPayload(provider, payload));
  }

  return voiceUpstream(provider, action, key);
}

async function relayVoiceRequest(request, provider, action, key) {
  const upstream = await prepareUpstreamRequest(request, provider, action, key);
  const response = await fetchWithValidatedRedirects(upstream.url, {
    method: upstream.method,
    headers: upstream.headers,
    body: upstream.body,
  }, { signal: request.signal });

  const contentType = response.headers.get('content-type') || '';
  if (action !== 'tts' || !response.ok) {
    const body = await readResponseTextWithCap(response, VOICE_MAX_JSON_RESPONSE_BYTES);
    return new Response(body, {
      status: response.status,
      headers: {
        ...corsHeaders(request),
        'Content-Type': contentType || 'application/json',
      },
    });
  }

  const contentLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > VOICE_MAX_AUDIO_RESPONSE_BYTES) {
    try { await response.body?.cancel?.(); } catch {}
    return jsonResponse(request, 502, { error: 'Voice provider audio response is too large.' });
  }
  return new Response(capReadableStream(response.body, VOICE_MAX_AUDIO_RESPONSE_BYTES), {
    status: response.status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': contentType || 'audio/mpeg',
      'Content-Disposition': 'inline',
    },
  });
}

export async function handler(request) {
  if (request.method === 'OPTIONS') {
    return isAllowedCallerOrigin(request)
      ? new Response(null, { status: 204, headers: corsHeaders(request) })
      : new Response(null, { status: 403, headers: { Vary: 'Origin' } });
  }
  if (!isAllowedCallerOrigin(request)) {
    return jsonResponse(request, 403, { error: 'Origin not allowed.' });
  }
  if (request.method !== 'POST') {
    return jsonResponse(request, 405, { error: 'Method not allowed.' });
  }

  const provider = normalizeVoiceProvider(request.headers.get('x-voice-provider'));
  const action = normalizeVoiceAction(new URL(request.url).searchParams.get('action'));
  const key = readVoiceBearer(request);
  if (!provider || !action) {
    return jsonResponse(request, 400, { error: 'Unknown voice provider or action.' });
  }
  if (!key) {
    return jsonResponse(request, 401, { error: 'A provider API key is required.' });
  }

  const rateLimit = await enforceRateLimit(request);
  if (rateLimit.unavailable) {
    return jsonResponse(request, 503, {
      error: 'Voice relay rate limit is temporarily unavailable.',
    }, { 'Retry-After': String(rateLimit.retryAfterSeconds || 60) });
  }
  if (rateLimit.limited) {
    return jsonResponse(request, 429, {
      error: 'Too many voice requests. Try again later.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    }, { 'Retry-After': String(rateLimit.retryAfterSeconds) });
  }

  try {
    return await relayVoiceRequest(request, provider, action, key);
  } catch (error) {
    return voiceErrorResponse(request, error);
  }
}
