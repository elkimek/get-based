// Vercel Function adapter for encrypted profile-share storage.
// Browser encryption and the request contract live in the public runtime-
// neutral service; this adapter supplies the existing private Blob backend.

import { handleProfileShareRequest } from '../lib/profile-share-service.js';
import { createProfileShareTransitionHandler } from '../lib/profile-share-transition.js';
import { createVercelBlobProfileShareStore } from '../lib/profile-share-vercel-blob-store.js';

export const config = { runtime: 'edge' };

export function createVercelProfileShareHandler(env = process.env) {
  const legacyStore = createVercelBlobProfileShareStore(env.BLOB_READ_WRITE_TOKEN);
  return createProfileShareTransitionHandler({
    upstreamUrl: env.GETBASED_PROFILE_SHARE_UPSTREAM_URL,
    startedAt: env.GETBASED_PROFILE_SHARE_TRANSITION_STARTED_AT,
    legacyBlobUntil: env.GETBASED_PROFILE_SHARE_LEGACY_BLOB_UNTIL,
    legacyStore,
    legacyHandler: handleProfileShareRequest,
  });
}

export default function handler(req) {
  return createVercelProfileShareHandler()(req);
}
