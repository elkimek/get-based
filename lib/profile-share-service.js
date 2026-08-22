// Runtime-neutral encrypted profile share service.
// The browser encrypts before upload; this route stores and returns only
// ciphertext envelopes. Runtime adapters supply a private object store.

/**
 * @typedef {Object} ProfileShareObjectStore
 * @property {(pathname: string, options?: { abortSignal?: AbortSignal }) => Promise<string | null>} get
 * @property {(pathname: string, body: string, options?: Record<string, unknown>) => Promise<unknown>} put
 * @property {(options?: { prefix?: string, cursor?: string, limit?: number, abortSignal?: AbortSignal }) => Promise<{ blobs: Array<{ pathname: string, uploadedAt: Date }>, cursor?: string, hasMore: boolean }>} list
 * @property {(pathnames: string[], options?: { abortSignal?: AbortSignal }) => Promise<void>} delete
 * @property {(error: unknown) => boolean} isPreconditionFailure
 * @property {((subject: string) => Promise<string> | string)=} hashRateLimitSubject
 */

/** @param {string} pathname @param {ProfileShareObjectStore & { abortSignal?: AbortSignal }} options */
async function getBlob(pathname, options) {
  const text = await options.get(pathname, { abortSignal: options.abortSignal });
  return text == null ? null : { stream: new Blob([text]).stream() };
}

/** @param {string} pathname @param {string} body @param {ProfileShareObjectStore & Record<string, unknown>} options */
function putBlob(pathname, body, options) {
  return options.put(pathname, body, options);
}

/** @param {ProfileShareObjectStore & { prefix?: string, cursor?: string, limit?: number, abortSignal?: AbortSignal }} options */
function listBlobs(options) {
  return options.list({
    prefix: options.prefix,
    cursor: options.cursor,
    limit: options.limit,
    abortSignal: options.abortSignal,
  });
}

/** @param {string | string[]} pathnames @param {ProfileShareObjectStore & { abortSignal?: AbortSignal }} options */
function deleteBlobs(pathnames, options) {
  return options.delete(Array.isArray(pathnames) ? pathnames : [pathnames], {
    abortSignal: options.abortSignal,
  });
}

/** @param {unknown} error @param {ProfileShareObjectStore} options */
function isBlobPreconditionFailure(error, options) {
  return options.isPreconditionFailure(error);
}

const LEGACY_SHARE_PREFIX = 'profile-shares/v1/';
const SHARE_PREFIX = 'profile-shares/v2/';
const SHARE_EXPIRY_PREFIX = 'profile-share-expiry/v1/';
const SHARE_ID_RE = /^[A-Za-z0-9_-]{20,80}$/;
const SHARE_SCHEMA = 'getbased-profile-share';
const SHARE_VERSION = 1;
const MAX_SHARE_BYTES = 3_750_000;
const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_KDF_ITERATIONS = 100_000;
const MANAGE_TOKEN_HASH_RE = /^[a-f0-9]{64}$/;
const LEGACY_RATE_LIMIT_PREFIX = 'profile-share-rate/v1/';
const RATE_LIMIT_PREFIX = 'profile-share-rate/v2/';
const MAINTENANCE_PREFIX = 'profile-share-maintenance/v2/';
const MAINTENANCE_STATE_PATH = 'profile-share-maintenance-state/v1/cursors.json';
const POST_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const POST_RATE_LIMIT_MAX = 20;
const CLEANUP_PAGE_LIMIT = 100;
const CLEANUP_SHARE_LIMIT = 20;
const CLEANUP_TIMEOUT_MS = 4_000;
const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

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
    return new Set([
      'https://getbased.health',
      'https://www.getbased.health',
      'https://app.getbased.health',
      'https://beta.getbased.health',
      'https://get-based.vercel.app',
    ]).has(originUrl.origin);
  } catch {
    return false;
  }
}

function legacySharePath(id) {
  return `${LEGACY_SHARE_PREFIX}${id}.json`;
}

function sharePath(id) {
  return `${SHARE_PREFIX}${id}.json`;
}

function shareExpiryPath(id, expiresAt) {
  return `${SHARE_EXPIRY_PREFIX}${expiresAt}/${id}.json`;
}

function validateId(id) {
  return SHARE_ID_RE.test(id || '') ? id : '';
}

function rateLimitWindowStart(now) {
  return Math.floor(now / POST_RATE_LIMIT_WINDOW_MS) * POST_RATE_LIMIT_WINDOW_MS;
}

function rateLimitMarkerPath(hash, windowStart, slot) {
  return `${RATE_LIMIT_PREFIX}${windowStart}/${hash}/${slot}.json`;
}

function randomRateLimitSlotOffset() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % POST_RATE_LIMIT_MAX;
}

function getClientRateSubject(req) {
  const forwarded = req.headers.get('x-vercel-forwarded-for')
    || req.headers.get('x-forwarded-for')
    || '';
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

function normalizeEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { error: 'Missing encrypted profile payload.' };
  }
  if (envelope.schema !== SHARE_SCHEMA || envelope.version !== SHARE_VERSION) {
    return { error: 'Unsupported encrypted profile payload.' };
  }
  const expiresAt = Date.parse(envelope.expiresAt || '');
  const now = Date.now();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return { error: 'Share expiry must be in the future.' };
  }
  if (expiresAt - now > MAX_TTL_MS) {
    return { error: 'Share expiry cannot exceed 30 days.' };
  }
  if (envelope.kdf?.name !== 'PBKDF2' || envelope.kdf?.hash !== 'SHA-256') {
    return { error: 'Unsupported key derivation.' };
  }
  const iterations = Number(envelope.kdf?.iterations);
  if (!Number.isInteger(iterations) || iterations < MIN_KDF_ITERATIONS) {
    return { error: `PBKDF2 iterations must be at least ${MIN_KDF_ITERATIONS}.` };
  }
  if (envelope.cipher?.name !== 'AES-GCM') {
    return { error: 'Unsupported cipher.' };
  }
  if (typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length < 16) {
    return { error: 'Encrypted profile payload is empty.' };
  }
  const serialized = JSON.stringify(envelope);
  const sizeBytes = new TextEncoder().encode(serialized).length;
  if (sizeBytes > MAX_SHARE_BYTES) {
    return { error: 'Encrypted profile payload is too large for link sharing.' };
  }
  return { value: { envelope, serialized, sizeBytes, expiresAt } };
}

async function parseRecord(path, options) {
  let result;
  try {
    result = await getBlob(path, { ...options, access: 'private', useCache: false });
  } catch (err) {
    throw err;
  }
  if (!result?.stream) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

function isRateLimitSlotTaken(err, options) {
  return isBlobPreconditionFailure(err, options);
}

function maintenancePath(windowStart) {
  return `${MAINTENANCE_PREFIX}${windowStart}.json`;
}

function shareExpirySubject(pathname) {
  const relative = String(pathname || '').slice(SHARE_EXPIRY_PREFIX.length);
  const [expiryPart, filePart] = relative.split('/');
  return {
    expiresAt: Number(expiryPart),
    id: String(filePart || '').replace(/\.json$/, ''),
  };
}

function v2RateWindow(pathname) {
  const relative = String(pathname || '').slice(RATE_LIMIT_PREFIX.length);
  return Number(relative.split('/')[0]);
}

function legacyRateWindow(pathname) {
  const relative = String(pathname || '').slice(LEGACY_RATE_LIMIT_PREFIX.length);
  return Number(relative.split('/')[1]);
}

function maintenanceWindow(pathname) {
  const relative = String(pathname || '').slice(MAINTENANCE_PREFIX.length);
  return Number(relative.replace(/\.json$/, ''));
}

async function listCleanupPage(prefix, cursor, limit, options) {
  try {
    return await listBlobs({ ...options, prefix, cursor, limit });
  } catch (error) {
    if (!cursor) throw error;
    return listBlobs({ ...options, prefix, limit });
  }
}

function nextCleanupCursor(page) {
  return page.hasMore && page.cursor ? page.cursor : '';
}

function cleanupCursor(state, key) {
  const value = state && typeof state === 'object' ? state[key] : '';
  return typeof value === 'string' ? value : '';
}

async function collectStaleBlobPaths(prefix, cursor, options, isStale) {
  const page = await listCleanupPage(prefix, cursor, CLEANUP_PAGE_LIMIT, options);
  const paths = (page.blobs || [])
    .filter(isStale)
    .slice(0, CLEANUP_PAGE_LIMIT)
    .map(blob => blob.pathname);
  return { cursor: nextCleanupCursor(page), paths };
}

async function collectExpiredSharePaths(now, cursor, options) {
  const page = await listCleanupPage(
    SHARE_EXPIRY_PREFIX,
    cursor,
    CLEANUP_SHARE_LIMIT,
    options,
  );
  const markers = (page.blobs || [])
    .map(blob => ({ ...shareExpirySubject(blob.pathname), pathname: blob.pathname }))
    .filter(marker => (
      Number.isFinite(marker.expiresAt)
      && marker.expiresAt <= now
      && validateId(marker.id)
    ))
    .slice(0, CLEANUP_SHARE_LIMIT);
  const staleGroups = await Promise.all(markers.map(async marker => {
    try {
      const path = sharePath(marker.id);
      const record = await parseRecord(path, options);
      const recordExpiresAt = Date.parse(record?.expiresAt || '');
      return record && recordExpiresAt === marker.expiresAt
        ? [marker.pathname, path]
        : [marker.pathname];
    } catch {
      return [];
    }
  }));
  return { cursor: nextCleanupCursor(page), paths: staleGroups.flat() };
}

async function cleanupExpiredBlobState(now, currentWindowStart, options) {
  let state = {};
  try {
    state = await parseRecord(MAINTENANCE_STATE_PATH, options) || {};
  } catch {}
  const groups = await Promise.all([
    collectExpiredSharePaths(now, cleanupCursor(state, 'shares'), options),
    collectStaleBlobPaths(
      SHARE_PREFIX,
      cleanupCursor(state, 'sharesV2'),
      options,
      object => object.uploadedAt?.getTime?.() + MAX_TTL_MS <= now,
    ),
    collectStaleBlobPaths(
      LEGACY_SHARE_PREFIX,
      cleanupCursor(state, 'legacyShares'),
      options,
      blob => blob.uploadedAt?.getTime?.() + MAX_TTL_MS <= now,
    ),
    collectStaleBlobPaths(
      RATE_LIMIT_PREFIX,
      cleanupCursor(state, 'rateV2'),
      options,
      blob => v2RateWindow(blob.pathname) < currentWindowStart,
    ),
    collectStaleBlobPaths(
      LEGACY_RATE_LIMIT_PREFIX,
      cleanupCursor(state, 'rateV1'),
      options,
      blob => legacyRateWindow(blob.pathname) < currentWindowStart,
    ),
    collectStaleBlobPaths(
      MAINTENANCE_PREFIX,
      cleanupCursor(state, 'maintenance'),
      options,
      blob => maintenanceWindow(blob.pathname) < currentWindowStart,
    ),
  ]);
  const stale = Array.from(new Set(groups.flatMap(group => group.paths)));
  if (stale.length) await deleteBlobs(stale, options);
  await putBlob(MAINTENANCE_STATE_PATH, JSON.stringify({
    shares: groups[0].cursor,
    sharesV2: groups[1].cursor,
    legacyShares: groups[2].cursor,
    rateV2: groups[3].cursor,
    rateV1: groups[4].cursor,
    maintenance: groups[5].cursor,
    updatedAt: new Date(now).toISOString(),
  }), {
    ...options,
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}

async function runBoundedMaintenance(now, currentWindowStart, options) {
  const claimPath = maintenancePath(currentWindowStart);
  const cleanupOptions = {
    ...options,
    abortSignal: AbortSignal.timeout(CLEANUP_TIMEOUT_MS),
  };
  try {
    await putBlob(claimPath, JSON.stringify({ claimedAt: new Date(now).toISOString() }), {
      ...cleanupOptions,
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    });
  } catch (error) {
    return;
  }
  try {
    await cleanupExpiredBlobState(now, currentWindowStart, cleanupOptions);
  } catch {}
}

async function resolveShareRecord(id, options) {
  const currentPath = sharePath(id);
  const current = await parseRecord(currentPath, options);
  if (current) return { path: currentPath, record: current };
  const legacyPath = legacySharePath(id);
  return { path: legacyPath, record: await parseRecord(legacyPath, options) };
}

async function legacyShareIdExists(id, options) {
  const path = legacySharePath(id);
  const page = await listBlobs({ ...options, prefix: path, limit: 1 });
  return (page.blobs || []).some(blob => blob.pathname === path);
}

async function enforcePostRateLimit(req, options) {
  const now = Date.now();
  const rateSubject = getClientRateSubject(req);
  const subjectHash = options.hashRateLimitSubject
    ? await options.hashRateLimitSubject(rateSubject)
    : await sha256Hex(rateSubject);
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
      await putBlob(rateLimitMarkerPath(subjectHash, windowStart, slot), JSON.stringify(marker), {
        ...options,
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });
      await runBoundedMaintenance(now, windowStart, options);
      return { limited: false };
    } catch (err) {
      if (isRateLimitSlotTaken(err, options)) continue;
      throw err;
    }
  }
  return {
    limited: true,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - now) / 1000)),
  };
}

async function handlePost(req, options) {
  if (!options) return jsonResponse(req, 503, { error: 'Profile sharing storage is not configured.' });
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
  const normalization = normalizeEnvelope(body.envelope);
  if (normalization.error) return jsonResponse(req, 400, { error: normalization.error });
  const normalized = normalization.value;
  // Reject malformed or oversized input before touching persistent abuse
  // controls. Only a request that could create a share consumes a rate slot.
  let rateLimit;
  try {
    rateLimit = await enforcePostRateLimit(req, options);
  } catch {
    return jsonResponse(req, 503, { error: 'Could not verify profile sharing rate limit.' });
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
  try {
    if (await legacyShareIdExists(id, options)) {
      return jsonResponse(req, 409, { error: 'A shared profile with this id already exists.' });
    }
  } catch {
    return jsonResponse(req, 503, { error: 'Could not verify the share id.' });
  }
  const record = {
    id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(normalized.expiresAt).toISOString(),
    manageTokenHash,
    envelope: normalized.envelope,
  };
  try {
    await putBlob(sharePath(id), JSON.stringify(record), {
      ...options,
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    });
  } catch (err) {
    const status = isBlobPreconditionFailure(err, options) ? 409 : 503;
    const error = status === 409
      ? 'A shared profile with this id already exists.'
      : 'Could not store shared profile.';
    return jsonResponse(req, status, { error });
  }
  try {
    await putBlob(shareExpiryPath(id, normalized.expiresAt), '{}', {
      ...options,
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    });
  } catch {
    try { await deleteBlobs([sharePath(id)], options); } catch {}
    return jsonResponse(req, 503, { error: 'Could not store shared profile.' });
  }
  return jsonResponse(req, 201, {
    id,
    expiresAt: record.expiresAt,
    sizeBytes: normalized.sizeBytes,
  });
}

async function handleGet(req, options) {
  if (!options) return jsonResponse(req, 503, { error: 'Profile sharing storage is not configured.' });
  const id = validateId(new URL(req.url).searchParams.get('id'));
  if (!id) return jsonResponse(req, 400, { error: 'Invalid share id.' });
  let resolved;
  try {
    resolved = await resolveShareRecord(id, options);
  } catch {
    return jsonResponse(req, 500, { error: 'Could not load shared profile.' });
  }
  const { path, record } = resolved;
  if (!record) return jsonResponse(req, 404, { error: 'Shared profile not found.' });
  if (Date.parse(record.expiresAt || '') <= Date.now()) {
    try {
      const paths = path.startsWith(SHARE_PREFIX)
        ? [path, shareExpiryPath(id, Date.parse(record.expiresAt || ''))]
        : [path];
      await deleteBlobs(paths, options);
    } catch {
      return jsonResponse(req, 503, {
        error: 'The shared profile expired but could not be removed yet.',
      });
    }
    return jsonResponse(req, 410, { error: 'Shared profile link has expired.' });
  }
  return jsonResponse(req, 200, {
    id,
    expiresAt: record.expiresAt,
    envelope: record.envelope,
  });
}

async function handleDelete(req, options) {
  if (!options) return jsonResponse(req, 503, { error: 'Profile sharing storage is not configured.' });
  const id = validateId(new URL(req.url).searchParams.get('id'));
  if (!id) return jsonResponse(req, 400, { error: 'Invalid share id.' });
  let resolved;
  try {
    resolved = await resolveShareRecord(id, options);
  } catch {
    return jsonResponse(req, 500, { error: 'Could not stop sharing link.' });
  }
  const { path, record } = resolved;
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
    const paths = path.startsWith(SHARE_PREFIX)
      ? [path, shareExpiryPath(id, Date.parse(record.expiresAt || ''))]
      : [path];
    await deleteBlobs(paths, options);
  } catch {
    return jsonResponse(req, 500, { error: 'Could not stop sharing link.' });
  }
  return jsonResponse(req, 200, { ok: true });
}

/**
 * @param {Request} req
 * @param {ProfileShareObjectStore | null} options
 */
export async function handleProfileShareRequest(req, options) {
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(req, req.headers.get('origin') || '')) {
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.headers.get('origin') && !isAllowedOrigin(req, req.headers.get('origin'))) {
    return jsonResponse(req, 403, { error: 'Origin not allowed.' });
  }
  if (req.method === 'POST') return handlePost(req, options);
  if (req.method === 'GET') return handleGet(req, options);
  if (req.method === 'DELETE') return handleDelete(req, options);
  return jsonResponse(req, 405, { error: 'Method not allowed.' });
}

/**
 * Runs the same bounded expiry/rate-marker cleanup used after link creation.
 * Standalone services call this at startup and on a quiet hourly interval so
 * expired ciphertext is removed even when no new share is created.
 *
 * @param {ProfileShareObjectStore | null} options
 * @param {number} [now]
 */
export async function maintainProfileShareStorage(options, now = Date.now()) {
  if (!options) return;
  await runBoundedMaintenance(now, rateLimitWindowStart(now), options);
}
