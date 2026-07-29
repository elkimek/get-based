// @ts-check
// Shared proxy abuse control. Hosted Vercel deployments use atomic Vercel
// Blob markers so the limit spans function instances. Local and explicitly
// opted-in self-hosted deployments retain a bounded in-process fallback.

import {
  BlobPreconditionFailedError,
  del as deleteBlobs,
  list as listBlobs,
  put as putBlob,
} from '@vercel/blob';

const DEFAULT_PROXY_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_PROXY_RATE_LIMIT_MAX = 300;
const MAX_DISTRIBUTED_RATE_LIMIT_SLOTS = 1_000;
const MAX_LOCAL_RATE_LIMIT_BUCKETS = 4_096;
const DISTRIBUTED_RATE_LIMIT_TIMEOUT_MS = 5_000;
const RATE_LIMIT_PREFIX = 'proxy-rate/v2/';
const RATE_LIMIT_CLEANUP_PREFIX = 'proxy-rate-cleanup/v2/';
const localRateLimitBuckets = new Map();

function readBoundedEnvInteger(name, fallback, min, max) {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function getProxyRateLimitSubject(req) {
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

function windowStartFor(now, windowMs) {
  return Math.floor(now / windowMs) * windowMs;
}

function windowPrefix(subjectHash, windowStart) {
  return `${RATE_LIMIT_PREFIX}${windowStart}/${subjectHash}/`;
}

function markerPath(subjectHash, windowStart, slot) {
  return `${windowPrefix(subjectHash, windowStart)}${slot}.json`;
}

function randomSlot(maxRequests) {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % maxRequests;
}

function isSlotConflict(error) {
  return error instanceof BlobPreconditionFailedError
    || /precondition|already exists|overwrite/i.test(String(error?.message || ''));
}

function cleanupLeasePath(windowStart) {
  return `${RATE_LIMIT_CLEANUP_PREFIX}${windowStart}.json`;
}

function markerWindowStart(pathname, prefix) {
  const relative = String(pathname || '').slice(prefix.length);
  return Number(relative.split('/')[0]?.replace(/\.json$/, ''));
}

async function deleteExpiredPrefix(prefix, currentWindowStart, token, abortSignal) {
  let cursor;
  do {
    const page = await listBlobs({ prefix, cursor, limit: 1_000, token, abortSignal });
    const stale = [];
    for (const blob of page.blobs || []) {
      const windowStart = markerWindowStart(blob.pathname, prefix);
      if (Number.isFinite(windowStart) && windowStart < currentWindowStart) {
        stale.push(blob.pathname);
      }
    }
    if (stale.length) await deleteBlobs(stale, { token, abortSignal });
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

async function cleanupExpiredMarkers(currentWindowStart, token, abortSignal) {
  const completionPath = cleanupLeasePath(currentWindowStart);
  const completion = await listBlobs({
    prefix: completionPath,
    limit: 1,
    token,
    abortSignal,
  });
  if ((completion.blobs || []).some(blob => blob.pathname === completionPath)) {
    return;
  }

  // Write the completion marker only after both global sweeps succeed.
  // Concurrent first requests may duplicate the idempotent sweep, but a
  // failed/aborted cleaner cannot leave a poisoned lease that suppresses
  // cleanup for the rest of the window.
  await deleteExpiredPrefix(
    RATE_LIMIT_PREFIX,
    currentWindowStart,
    token,
    abortSignal,
  );
  await deleteExpiredPrefix(
    RATE_LIMIT_CLEANUP_PREFIX,
    currentWindowStart,
    token,
    abortSignal,
  );
  try {
    await putBlob(completionPath, '{}', {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 60,
      contentType: 'application/json',
      token,
      abortSignal,
    });
  } catch (error) {
    if (!isSlotConflict(error)) throw error;
  }
}

async function enforceDistributedRateLimit(
  subject,
  now,
  windowMs,
  maxRequests,
  token,
  abortSignal,
) {
  const subjectHash = await sha256Hex(subject);
  const windowStart = windowStartFor(now, windowMs);
  const resetAt = windowStart + windowMs;
  const prefix = windowPrefix(subjectHash, windowStart);
  const page = await listBlobs({
    prefix,
    limit: Math.min(maxRequests + 1, 1_000),
    token,
    abortSignal,
  });
  const occupied = new Set();
  for (const blob of page.blobs || []) {
    const match = String(blob.pathname || '').slice(prefix.length).match(/^(\d+)\.json$/);
    if (match) occupied.add(Number(match[1]));
  }
  if (occupied.size >= maxRequests) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      scope: 'distributed',
    };
  }

  const offset = randomSlot(maxRequests);
  for (let attempt = 0; attempt < maxRequests; attempt++) {
    const slot = (offset + attempt) % maxRequests;
    if (occupied.has(slot)) continue;
    try {
      await putBlob(markerPath(subjectHash, windowStart, slot), '{}', {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: 60,
        contentType: 'application/json',
        token,
        abortSignal,
      });
      await cleanupExpiredMarkers(windowStart, token, abortSignal);
      return {
        limited: false,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
        scope: 'distributed',
      };
    } catch (error) {
      if (isSlotConflict(error)) continue;
      throw error;
    }
  }

  return {
    limited: true,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    scope: 'distributed',
  };
}

function enforceLocalRateLimit(subject, now, windowMs, maxRequests) {
  let bucket = localRateLimitBuckets.get(subject);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
  }
  bucket.count++;
  localRateLimitBuckets.set(subject, bucket);

  if (localRateLimitBuckets.size > MAX_LOCAL_RATE_LIMIT_BUCKETS) {
    for (const [key, candidate] of localRateLimitBuckets) {
      if (candidate.resetAt <= now || localRateLimitBuckets.size > MAX_LOCAL_RATE_LIMIT_BUCKETS) {
        localRateLimitBuckets.delete(key);
      }
    }
  }

  return {
    limited: bucket.count > maxRequests,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    scope: 'instance',
  };
}

export async function enforceProxyRateLimit(req) {
  const now = Date.now();
  const windowMs = readBoundedEnvInteger(
    'PROXY_RATE_LIMIT_WINDOW_MS',
    DEFAULT_PROXY_RATE_LIMIT_WINDOW_MS,
    1_000,
    60 * 60 * 1000,
  );
  const maxRequests = readBoundedEnvInteger(
    'PROXY_RATE_LIMIT_MAX',
    DEFAULT_PROXY_RATE_LIMIT_MAX,
    1,
    MAX_DISTRIBUTED_RATE_LIMIT_SLOTS,
  );
  const subject = getProxyRateLimitSubject(req);
  const env = typeof process !== 'undefined' ? process.env || {} : {};
  const token = env.PROXY_RATE_LIMIT_BLOB_TOKEN || env.BLOB_READ_WRITE_TOKEN || '';

  if (token) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new Error('Proxy distributed rate limit timed out'));
    }, DISTRIBUTED_RATE_LIMIT_TIMEOUT_MS);
    try {
      return await enforceDistributedRateLimit(
        subject,
        now,
        windowMs,
        maxRequests,
        token,
        controller.signal,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  if (env.VERCEL && env.PROXY_ALLOW_INSTANCE_RATE_LIMIT !== '1') {
    return {
      limited: false,
      unavailable: true,
      retryAfterSeconds: 60,
      scope: 'unavailable',
    };
  }
  return enforceLocalRateLimit(subject, now, windowMs, maxRequests);
}
