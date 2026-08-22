// @ts-check
// Private Vercel Blob adapter for the runtime-neutral profile-share service.

import {
  BlobNotFoundError,
  blobStoreOptions,
  deleteBlobs,
  getBlob,
  isBlobPreconditionFailure,
  listBlobs,
  putBlob,
} from './vercel-blob-rest.js';

/**
 * @param {string | undefined} token
 * @returns {import('./profile-share-service.js').ProfileShareObjectStore | null}
 */
export function createVercelBlobProfileShareStore(token) {
  const options = blobStoreOptions(token);
  if (!options) return null;
  return {
    async get(pathname, requestOptions = {}) {
      try {
        const result = await getBlob(pathname, {
          ...options,
          access: 'private',
          useCache: false,
          abortSignal: requestOptions.abortSignal,
        });
        if (!result?.stream) return null;
        return new Response(result.stream).text();
      } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw error;
      }
    },
    put(pathname, body, putOptions = {}) {
      return putBlob(pathname, body, {
        ...options,
        ...putOptions,
        access: 'private',
      });
    },
    list(listOptions = {}) {
      return listBlobs({ ...options, ...listOptions });
    },
    delete(pathnames, requestOptions = {}) {
      return deleteBlobs(pathnames, {
        ...options,
        abortSignal: requestOptions.abortSignal,
      });
    },
    isPreconditionFailure(error) {
      return isBlobPreconditionFailure(error);
    },
  };
}
