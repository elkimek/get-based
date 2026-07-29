// @ts-check
// Minimal runtime-neutral Vercel Blob REST client used by hosted functions.
// Keeping this boundary on platform fetch avoids loading the Node-oriented
// @vercel/blob SDK before lightweight preflight and health responses.

const VERCEL_BLOB_API_URL = 'https://vercel.com/api/blob';
const VERCEL_BLOB_API_VERSION = '12';

export class BlobNotFoundError extends Error {}
export class BlobPreconditionFailedError extends Error {}

export function parseBlobStoreId(token) {
  return String(token || '').split('_')[3] || '';
}

export function blobStoreOptions(token, extra = {}) {
  const storeId = parseBlobStoreId(token);
  if (!token || !storeId) return null;
  return { token, storeId, ...extra };
}

function blobUrl(pathname, options, access = 'private') {
  return `https://${options.storeId}.${access}.blob.vercel-storage.com/${pathname}`;
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
  const storeId = options.storeId || parseBlobStoreId(options.token);
  if (!storeId) throw new Error('Vercel Blob store id is missing.');
  const response = await fetch(`${VERCEL_BLOB_API_URL}${path}`, {
    ...init,
    signal: options.abortSignal,
    headers: {
      'x-api-version': VERCEL_BLOB_API_VERSION,
      'x-vercel-blob-store-id': storeId,
      'authorization': `Bearer ${options.token}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw await parseBlobError(response);
  return response.status === 204 ? null : response.json();
}

export async function getBlob(pathname, options) {
  const storeId = options.storeId || parseBlobStoreId(options.token);
  if (!storeId) throw new Error('Vercel Blob store id is missing.');
  const url = new URL(blobUrl(pathname, { ...options, storeId }, options.access || 'private'));
  url.searchParams.set('cache', '0');
  const response = await fetch(url.toString(), {
    method: 'GET',
    signal: options.abortSignal,
    headers: { 'authorization': `Bearer ${options.token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw await parseBlobError(response);
  return { stream: response.body };
}

export async function putBlob(pathname, body, options) {
  const params = new URLSearchParams({ pathname });
  return blobApi(`/?${params.toString()}`, {
    method: 'PUT',
    headers: {
      'x-vercel-blob-access': options.access || 'private',
      'x-add-random-suffix': options.addRandomSuffix ? '1' : '0',
      'x-allow-overwrite': options.allowOverwrite ? '1' : '0',
      ...(options.contentType ? { 'x-content-type': options.contentType } : {}),
      ...(options.cacheControlMaxAge != null
        ? { 'x-cache-control-max-age': String(options.cacheControlMaxAge) }
        : {}),
    },
    body,
  }, options);
}

export async function listBlobs(options) {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.prefix) params.set('prefix', options.prefix);
  if (options.cursor) params.set('cursor', options.cursor);
  const body = await blobApi(`?${params.toString()}`, { method: 'GET' }, options);
  return {
    blobs: (body?.blobs || []).map(blob => ({
      ...blob,
      uploadedAt: new Date(blob.uploadedAt),
    })),
    cursor: body?.cursor,
    hasMore: !!body?.hasMore,
  };
}

export async function deleteBlobs(pathOrPaths, options) {
  const urls = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];
  await blobApi('/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ urls }),
  }, options);
}

export function isBlobPreconditionFailure(error) {
  return error instanceof BlobPreconditionFailedError
    || /precondition|already exists|overwrite/i.test(String(error?.message || ''));
}
