// Runtime-neutral encrypted profile share service.
// The browser encrypts before upload; this route stores and returns only
// ciphertext envelopes. Runtime adapters supply a private object store.

export interface ProfileShareRequestOptions {
  abortSignal?: AbortSignal | undefined;
}
export interface ProfileShareListOptions extends ProfileShareRequestOptions {
  prefix?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}
export interface ProfileShareListItem {
  pathname: string;
  uploadedAt: Date;
}
export interface ProfileShareListPage {
  blobs: ProfileShareListItem[];
  cursor?: string | undefined;
  hasMore: boolean;
}
export interface ProfileShareObjectStore extends Record<string, unknown> {
  get(pathname: string, options?: ProfileShareRequestOptions): Promise<string | null>;
  put(pathname: string, body: string, options?: Record<string, unknown> & ProfileShareRequestOptions): Promise<unknown>;
  list(options?: ProfileShareListOptions): Promise<ProfileShareListPage>;
  delete(pathnames: string[], options?: ProfileShareRequestOptions): Promise<void>;
  isPreconditionFailure(error: unknown): boolean;
  hashRateLimitSubject?: ((subject: string) => Promise<string> | string) | undefined;
}
export type ProfileShareHandler = (request: Request, store: ProfileShareObjectStore | null) => Response | Promise<Response>;
type StoreOptions = ProfileShareObjectStore & ProfileShareRequestOptions & Record<string, unknown>;
interface ShareEnvelope extends Record<string, unknown> {
  expiresAt?: unknown;
  kdf?: {
    name?: unknown;
    hash?: unknown;
    iterations?: unknown;
  } | null;
  cipher?: {
    name?: unknown;
  } | null;
  ciphertext?: unknown;
}
interface ShareBody extends Record<string, unknown> {
  envelope?: ShareEnvelope | null;
}
interface ShareRecord extends Record<string, unknown> {
  expiresAt?: unknown;
  manageTokenHash?: unknown;
  envelope?: unknown;
}

async function getBlob(pathname: string, options: StoreOptions) {
  const text = await options.get(pathname, { abortSignal: options.abortSignal });
  return text == null ? null : { stream: new Blob([text]).stream() };
}

function privateJsonOptions(options: StoreOptions, allowOverwrite: boolean): StoreOptions {
  return {
    ...options,
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  };
}

function putBlob(pathname: string, body: string, options: StoreOptions) {
  return options.put(pathname, body, options);
}

function listBlobs(options: StoreOptions & ProfileShareListOptions) {
  return options.list({
    prefix: options.prefix,
    cursor: options.cursor,
    limit: options.limit,
    abortSignal: options.abortSignal,
  });
}

function deleteBlobs(pathnames: string | string[], options: StoreOptions) {
  return options.delete(Array.isArray(pathnames) ? pathnames : [pathnames], {
    abortSignal: options.abortSignal,
  });
}

function isBlobPreconditionFailure(error: unknown, options: ProfileShareObjectStore) {
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

function jsonResponse(req: Request, status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(req), ...extraHeaders },
  });
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  if (!origin || !isAllowedOrigin(req, origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function isAllowedOrigin(req: Request, origin: string | null) {
  try {
    const requestUrl = new URL(req.url);
    const originUrl = new URL(origin as string);
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

function legacySharePath(id: unknown) {
  return `${LEGACY_SHARE_PREFIX}${id}.json`;
}

function sharePath(id: unknown) {
  return `${SHARE_PREFIX}${id}.json`;
}

function shareExpiryPath(id: unknown, expiresAt: number) {
  return `${SHARE_EXPIRY_PREFIX}${expiresAt}/${id}.json`;
}

function validateId(id: unknown) {
  return SHARE_ID_RE.test((id || '') as string) ? id : '';
}

function rateLimitWindowStart(now: number) {
  return Math.floor(now / POST_RATE_LIMIT_WINDOW_MS) * POST_RATE_LIMIT_WINDOW_MS;
}

function rateLimitMarkerPath(hash: string, windowStart: number, slot: number) {
  return `${RATE_LIMIT_PREFIX}${windowStart}/${hash}/${slot}.json`;
}

function randomRateLimitSlotOffset() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0]! % POST_RATE_LIMIT_MAX;
}

function getClientRateSubject(req: Request) {
  const forwarded = req.headers.get('x-vercel-forwarded-for')
    || req.headers.get('x-forwarded-for')
    || '';
  const ip = forwarded.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || req.headers.get('cf-connecting-ip')
    || 'unknown-client';
  return String(ip).slice(0, 128);
}

async function sha256Hex(value: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeEnvelope(envelope: ShareEnvelope | null | undefined) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { error: 'Missing encrypted profile payload.' };
  }
  if (envelope.schema !== SHARE_SCHEMA || envelope.version !== SHARE_VERSION) {
    return { error: 'Unsupported encrypted profile payload.' };
  }
  const expiresAt = Date.parse((envelope.expiresAt || '') as string);
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

async function parseRecord(path: string, options: StoreOptions): Promise<ShareRecord | null> {
  const result = await getBlob(path, { ...options, access: 'private', useCache: false });
  if (!result?.stream) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

function isRateLimitSlotTaken(err: unknown, options: ProfileShareObjectStore) {
  return isBlobPreconditionFailure(err, options);
}

function maintenancePath(windowStart: number) {
  return `${MAINTENANCE_PREFIX}${windowStart}.json`;
}

function shareExpirySubject(pathname: unknown) {
  const relative = String(pathname || '').slice(SHARE_EXPIRY_PREFIX.length);
  const [expiryPart, filePart] = relative.split('/');
  return {
    expiresAt: Number(expiryPart),
    id: String(filePart || '').replace(/\.json$/, ''),
  };
}

function v2RateWindow(pathname: unknown) {
  const relative = String(pathname || '').slice(RATE_LIMIT_PREFIX.length);
  return Number(relative.split('/')[0]);
}

function legacyRateWindow(pathname: unknown) {
  const relative = String(pathname || '').slice(LEGACY_RATE_LIMIT_PREFIX.length);
  return Number(relative.split('/')[1]);
}

function maintenanceWindow(pathname: unknown) {
  const relative = String(pathname || '').slice(MAINTENANCE_PREFIX.length);
  return Number(relative.replace(/\.json$/, ''));
}

async function listCleanupPage(prefix: string, cursor: string, limit: number, options: StoreOptions) {
  try {
    return await listBlobs({ ...options, prefix, cursor, limit });
  } catch (error) {
    if (!cursor) throw error;
    return listBlobs({ ...options, prefix, limit });
  }
}

function nextCleanupCursor(page: ProfileShareListPage) {
  return page.hasMore && page.cursor ? page.cursor : '';
}

function cleanupCursor(state: unknown, key: string) {
  const value = state && typeof state === 'object' ? (state as Record<string, unknown>)[key] : '';
  return typeof value === 'string' ? value : '';
}

async function collectStaleBlobPaths(prefix: string, cursor: string, options: StoreOptions, isStale: (blob: ProfileShareListItem) => unknown) {
  const page = await listCleanupPage(prefix, cursor, CLEANUP_PAGE_LIMIT, options);
  const paths = (page.blobs || [])
    .filter(isStale)
    .slice(0, CLEANUP_PAGE_LIMIT)
    .map(blob => blob.pathname);
  return { cursor: nextCleanupCursor(page), paths };
}

async function collectExpiredSharePaths(now: number, cursor: string, options: StoreOptions) {
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
      const recordExpiresAt = Date.parse((record?.expiresAt || '') as string);
      return record && recordExpiresAt === marker.expiresAt
        ? [marker.pathname, path]
        : [marker.pathname];
    } catch {
      return [];
    }
  }));
  return { cursor: nextCleanupCursor(page), paths: staleGroups.flat() };
}

async function cleanupExpiredBlobState(now: number, currentWindowStart: number, options: StoreOptions) {
  let state: ShareRecord = {};
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
    shares: groups[0]!.cursor,
    sharesV2: groups[1]!.cursor,
    legacyShares: groups[2]!.cursor,
    rateV2: groups[3]!.cursor,
    rateV1: groups[4]!.cursor,
    maintenance: groups[5]!.cursor,
    updatedAt: new Date(now).toISOString(),
  }), privateJsonOptions(options, true));
}

async function runBoundedMaintenance(now: number, currentWindowStart: number, options: StoreOptions) {
  const claimPath = maintenancePath(currentWindowStart);
  const cleanupOptions = {
    ...options,
    abortSignal: AbortSignal.timeout(CLEANUP_TIMEOUT_MS),
  };
  try {
    await putBlob(claimPath, JSON.stringify({ claimedAt: new Date(now).toISOString() }), privateJsonOptions(cleanupOptions, false));
  } catch (error) {
    return;
  }
  try {
    await cleanupExpiredBlobState(now, currentWindowStart, cleanupOptions);
  } catch {}
}

async function resolveShareRecord(id: unknown, options: StoreOptions) {
  const currentPath = sharePath(id);
  const current = await parseRecord(currentPath, options);
  if (current) return { path: currentPath, record: current };
  const legacyPath = legacySharePath(id);
  return { path: legacyPath, record: await parseRecord(legacyPath, options) };
}

async function legacyShareIdExists(id: unknown, options: StoreOptions) {
  const path = legacySharePath(id);
  const page = await listBlobs({ ...options, prefix: path, limit: 1 });
  return (page.blobs || []).some(blob => blob.pathname === path);
}

async function enforcePostRateLimit(req: Request, options: StoreOptions) {
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
      await putBlob(rateLimitMarkerPath(subjectHash, windowStart, slot), JSON.stringify(marker), privateJsonOptions(options, false));
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

async function handlePost(req: Request, options: StoreOptions | null) {
  if (!options) return jsonResponse(req, 503, { error: 'Profile sharing storage is not configured.' });
  let body: ShareBody | null | undefined;
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
  const normalization = normalizeEnvelope(body!.envelope);
  if (normalization.error) return jsonResponse(req, 400, { error: normalization.error });
  const normalized = normalization.value!;
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
    await putBlob(shareExpiryPath(id, normalized.expiresAt), '{}', privateJsonOptions(options, true));
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

async function handleGet(req: Request, options: StoreOptions | null) {
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
  if (Date.parse((record.expiresAt || '') as string) <= Date.now()) {
    try {
      const paths = path.startsWith(SHARE_PREFIX)
        ? [path, shareExpiryPath(id, Date.parse((record.expiresAt || '') as string))]
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

async function handleDelete(req: Request, options: StoreOptions | null) {
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
    let body: ShareBody | null | undefined = {};
    try { body = await req.json(); } catch {}
    const token = String(body?.manageToken || req.headers.get('x-profile-share-manage-token') || '');
    const tokenHash = token ? await sha256Hex(token) : '';
    if (!token || tokenHash !== record.manageTokenHash) {
      return jsonResponse(req, 403, { error: 'This link can only be stopped from the browser that created it.' });
    }
  }
  try {
    const paths = path.startsWith(SHARE_PREFIX)
      ? [path, shareExpiryPath(id, Date.parse((record.expiresAt || '') as string))]
      : [path];
    await deleteBlobs(paths, options);
  } catch {
    return jsonResponse(req, 500, { error: 'Could not stop sharing link.' });
  }
  return jsonResponse(req, 200, { ok: true });
}

export async function handleProfileShareRequest(req: Request, options: ProfileShareObjectStore | null) {
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

export async function maintainProfileShareStorage(options: ProfileShareObjectStore | null, now = Date.now()) {
  if (!options) return;
  await runBoundedMaintenance(now, rateLimitWindowStart(now), options);
}
