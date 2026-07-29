// Vercel Function — encrypted profile share storage.
// The browser encrypts before upload; this route stores and returns only
// ciphertext envelopes using a private Vercel Blob store.

import { errorMessage } from '../lib/error-utils.js';

export const config = { runtime: 'edge' };

const VERCEL_BLOB_API_URL = 'https://vercel.com/api/blob';
const VERCEL_BLOB_API_VERSION = '12';
const SHARE_PREFIX = 'profile-shares/v1/';
const SHARE_ID_RE = /^[A-Za-z0-9_-]{20,80}$/;
const SHARE_SCHEMA = 'getbased-profile-share';
const SHARE_VERSION = 1;
const MAX_SHARE_BYTES = 3_750_000;
const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_KDF_ITERATIONS = 100_000;
const MANAGE_TOKEN_HASH_RE = /^[a-f0-9]{64}$/;
const RATE_LIMIT_PREFIX = 'profile-share-rate/v1/';
const POST_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const POST_RATE_LIMIT_MAX = 20;
const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

class BlobNotFoundError extends Error {}
class BlobPreconditionFailedError extends Error {}

function jsonResponse(req, status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(req), ...extraHeaders },
  });
}

function corsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  if (!origin || !isAllowedOrigin(req, origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function isAllowedOrigin(req, origin) {
  try {
    const requestUrl = new URL(req.url);
    const originUrl = new URL(origin);
    if (originUrl.origin === requestUrl.origin) return true;
    if (process.env.NODE_ENV === 'development' && ['localhost', '127.0.0.1'].includes(originUrl.hostname)) return true;
    return [
      'getbased.health',
      'www.getbased.health',
      'app.getbased.health',
      'get-based.vercel.app',
    ].includes(originUrl.hostname);
  } catch {
    return false;
  }
}

function sharePath(id) {
  return `${SHARE_PREFIX}${id}.json`;
}

function validateId(id) {
  return SHARE_ID_RE.test(id || '') ? id : '';
}

function parseStoreIdFromReadWriteToken(token) {
  return String(token || '').split('_')[3] || '';
}

function blobUrl(path, options, access = 'private') {
  return `https://${options.storeId}.${access}.blob.vercel-storage.com/${path}`;
}

async function parseBlobError(response) {
  let code = '';
  let message = '';
  try {
    const body = await response.json();
    code = body?.error?.code || '';
    message = body?.error?.message || '';
  } catch {}
  if (response.status === 404 || code === 'not_found') {
    return new BlobNotFoundError(message || 'Blob not found.');
  }
  if (response.status === 412 || code === 'precondition_failed') {
    return new BlobPreconditionFailedError(message || 'Blob precondition failed.');
  }
  return new Error(message || `Vercel Blob request failed (${response.status}).`);
}

async function blobApi(path, init, options) {
  const response = await fetch(`${VERCEL_BLOB_API_URL}${path}`, {
    ...init,
    headers: {
      'x-api-version': VERCEL_BLOB_API_VERSION,
      'x-vercel-blob-store-id': options.storeId,
      'authorization': `Bearer ${options.token}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw await parseBlobError(response);
  return response.status === 204 ? null : response.json();
}

async function get(path, options) {
  const url = new URL(blobUrl(path, options));
  url.searchParams.set('cache', '0');
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'authorization': `Bearer ${options.token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw await parseBlobError(response);
  return { stream: response.body };
}

async function put(path, body, options) {
  const params = new URLSearchParams({ pathname: path });
  return blobApi(`/?${params.toString()}`, {
    method: 'PUT',
    headers: {
      'x-vercel-blob-access': options.access || 'private',
      'x-add-random-suffix': options.addRandomSuffix ? '1' : '0',
      'x-allow-overwrite': options.allowOverwrite ? '1' : '0',
      ...(options.contentType ? { 'x-content-type': options.contentType } : {}),
      ...(options.cacheControlMaxAge != null ? { 'x-cache-control-max-age': String(options.cacheControlMaxAge) } : {}),
    },
    body,
  }, options);
}

async function list(options) {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.prefix) params.set('prefix', options.prefix);
  if (options.cursor) params.set('cursor', options.cursor);
  const body = await blobApi(`?${params.toString()}`, { method: 'GET' }, options);
  return {
    blobs: (body?.blobs || []).map(blob => ({ ...blob, uploadedAt: new Date(blob.uploadedAt) })),
    cursor: body?.cursor,
    hasMore: !!body?.hasMore,
  };
}

async function del(pathOrPaths, options) {
  const urls = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];
  await blobApi('/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ urls }),
  }, options);
}

function rateLimitSubjectPrefix(hash) {
  return `${RATE_LIMIT_PREFIX}${hash}/`;
}

function rateLimitWindowStart(now) {
  return Math.floor(now / POST_RATE_LIMIT_WINDOW_MS) * POST_RATE_LIMIT_WINDOW_MS;
}

function rateLimitMarkerPath(hash, windowStart, slot) {
  return `${rateLimitSubjectPrefix(hash)}${windowStart}/${slot}.json`;
}

function randomRateLimitSlotOffset() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % POST_RATE_LIMIT_MAX;
}

function getClientRateSubject(req) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || req.headers.get('cf-connecting-ip')
    || 'unknown-client';
  return String(ip).slice(0, 128);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function blobOptions(extra = {}) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  const storeId = parseStoreIdFromReadWriteToken(token);
  if (!storeId) return null;
  return { token, storeId, ...extra };
}

function normalizeEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error('Missing encrypted profile payload.');
  }
  if (envelope.schema !== SHARE_SCHEMA || envelope.version !== SHARE_VERSION) {
    throw new Error('Unsupported encrypted profile payload.');
  }
  const expiresAt = Date.parse(envelope.expiresAt || '');
  const now = Date.now();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new Error('Share expiry must be in the future.');
  }
  if (expiresAt - now > MAX_TTL_MS) {
    throw new Error('Share expiry cannot exceed 30 days.');
  }
  if (envelope.kdf?.name !== 'PBKDF2' || envelope.kdf?.hash !== 'SHA-256') {
    throw new Error('Unsupported key derivation.');
  }
  const iterations = Number(envelope.kdf?.iterations);
  if (!Number.isInteger(iterations) || iterations < MIN_KDF_ITERATIONS) {
    throw new Error(`PBKDF2 iterations must be at least ${MIN_KDF_ITERATIONS}.`);
  }
  if (envelope.cipher?.name !== 'AES-GCM') {
    throw new Error('Unsupported cipher.');
  }
  if (typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length < 16) {
    throw new Error('Encrypted profile payload is empty.');
  }
  const serialized = JSON.stringify(envelope);
  const sizeBytes = new TextEncoder().encode(serialized).length;
  if (sizeBytes > MAX_SHARE_BYTES) {
    throw new Error('Encrypted profile payload is too large for link sharing.');
  }
  return { envelope, serialized, sizeBytes, expiresAt };
}

async function parseRecord(path, options) {
  let result;
  try {
    result = await get(path, { ...options, access: 'private', useCache: false });
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
  if (!result?.stream) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

function isRateLimitSlotTaken(err) {
  return err instanceof BlobPreconditionFailedError
    || /precondition|already exists|overwrite/i.test(String(err?.message || ''));
}

async function cleanupExpiredRateLimitMarkers(subjectHash, currentWindowStart, options) {
  const prefix = rateLimitSubjectPrefix(subjectHash);
  let cursor;
  const stale = [];
  do {
    const page = await list({ ...options, prefix, cursor, limit: 1000 });
    for (const blob of page.blobs || []) {
      const relative = String(blob.pathname || '').slice(prefix.length);
      const windowStart = Number(relative.split('/')[0]);
      if (Number.isFinite(windowStart) && windowStart < currentWindowStart) {
        stale.push(blob.pathname);
      }
    }
    cursor = page.hasMore ? page.cursor : null;
  } while (cursor && stale.length < 1000);
  if (stale.length) await del(stale, options);
}

async function enforcePostRateLimit(req, options) {
  const now = Date.now();
  const subjectHash = await sha256Hex(getClientRateSubject(req));
  const windowStart = rateLimitWindowStart(now);
  const resetAtMs = windowStart + POST_RATE_LIMIT_WINDOW_MS;
  const resetAt = new Date(resetAtMs).toISOString();
  const marker = {
    createdAt: new Date(now).toISOString(),
    windowStart,
    resetAt,
    updatedAt: new Date(now).toISOString(),
  };
  const offset = randomRateLimitSlotOffset();
  for (let attempt = 0; attempt < POST_RATE_LIMIT_MAX; attempt++) {
    const slot = (offset + attempt) % POST_RATE_LIMIT_MAX;
    try {
      await put(rateLimitMarkerPath(subjectHash, windowStart, slot), JSON.stringify(marker), {
        ...options,
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });
      cleanupExpiredRateLimitMarkers(subjectHash, windowStart, options).catch(() => {});
      return { limited: false };
    } catch (err) {
      if (isRateLimitSlotTaken(err)) continue;
      throw err;
    }
  }
  return {
    limited: true,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - now) / 1000)),
  };
}

async function handlePost(req) {
  const options = blobOptions();
  if (!options) return jsonResponse(req, 503, { error: 'Profile sharing storage is not configured.' });
  let rateLimit;
  try {
    rateLimit = await enforcePostRateLimit(req, options);
  } catch (err) {
    return jsonResponse(req, 503, { error: errorMessage(err, 'Could not verify profile sharing rate limit.') });
  }
  if (rateLimit?.limited) {
    return jsonResponse(
      req,
      429,
      {
        error: 'Too many profile share links created. Try again later.',
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      { 'Retry-After': String(rateLimit.retryAfterSeconds) },
    );
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, 400, { error: 'Invalid JSON body.' });
  }
  const id = validateId(body?.id);
  if (!id) return jsonResponse(req, 400, { error: 'Invalid share id.' });
  const manageTokenHash = String(body?.manageTokenHash || '');
  if (!MANAGE_TOKEN_HASH_RE.test(manageTokenHash)) {
    return jsonResponse(req, 400, { error: 'Invalid share management token.' });
  }
  let normalized;
  try {
    normalized = normalizeEnvelope(body.envelope);
  } catch (err) {
    return jsonResponse(req, 400, { error: errorMessage(err, 'Invalid encrypted profile payload.') });
  }
  const record = {
    id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(normalized.expiresAt).toISOString(),
    manageTokenHash,
    envelope: normalized.envelope,
  };
  try {
    await put(sharePath(id), JSON.stringify(record), {
      ...options,
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    });
  } catch (err) {
    return jsonResponse(req, 409, { error: errorMessage(err, 'Could not store shared profile.') });
  }
  return jsonResponse(req, 201, {
    id,
    expiresAt: record.expiresAt,
    sizeBytes: normalized.sizeBytes,
  });
}

async function handleGet(req) {
  const options = blobOptions();
  if (!options) return jsonResponse(req, 503, { error: 'Profile sharing storage is not configured.' });
  const id = validateId(new URL(req.url).searchParams.get('id'));
  if (!id) return jsonResponse(req, 400, { error: 'Invalid share id.' });
  const path = sharePath(id);
  let record;
  try {
    record = await parseRecord(path, options);
  } catch (err) {
    return jsonResponse(req, 500, { error: errorMessage(err, 'Could not load shared profile.') });
  }
  if (!record) return jsonResponse(req, 404, { error: 'Shared profile not found.' });
  if (Date.parse(record.expiresAt || '') <= Date.now()) {
    del(path, options).catch(() => {});
    return jsonResponse(req, 410, { error: 'Shared profile link has expired.' });
  }
  return jsonResponse(req, 200, {
    id,
    expiresAt: record.expiresAt,
    envelope: record.envelope,
  });
}

async function handleDelete(req) {
  const options = blobOptions();
  if (!options) return jsonResponse(req, 503, { error: 'Profile sharing storage is not configured.' });
  const id = validateId(new URL(req.url).searchParams.get('id'));
  if (!id) return jsonResponse(req, 400, { error: 'Invalid share id.' });
  const path = sharePath(id);
  let record;
  try {
    record = await parseRecord(path, options);
  } catch (err) {
    return jsonResponse(req, 500, { error: errorMessage(err, 'Could not stop sharing link.') });
  }
  if (!record) return jsonResponse(req, 200, { ok: true, missing: true });
  if (record.manageTokenHash) {
    let body = {};
    try { body = await req.json(); } catch {}
    const token = String(body?.manageToken || req.headers.get('x-profile-share-manage-token') || '');
    const tokenHash = token ? await sha256Hex(token) : '';
    if (!token || tokenHash !== record.manageTokenHash) {
      return jsonResponse(req, 403, { error: 'This link can only be stopped from the browser that created it.' });
    }
  }
  try {
    await del(path, options);
  } catch (err) {
    return jsonResponse(req, 500, { error: errorMessage(err, 'Could not stop sharing link.') });
  }
  return jsonResponse(req, 200, { ok: true });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(req, req.headers.get('origin') || '')) {
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.headers.get('origin') && !isAllowedOrigin(req, req.headers.get('origin'))) {
    return jsonResponse(req, 403, { error: 'Origin not allowed.' });
  }
  if (req.method === 'POST') return handlePost(req);
  if (req.method === 'GET') return handleGet(req);
  if (req.method === 'DELETE') return handleDelete(req);
  return jsonResponse(req, 405, { error: 'Method not allowed.' });
}
