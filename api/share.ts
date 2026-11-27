// Vercel Function adapter for encrypted profile-share storage.
// Browser encryption and the request contract live in the public runtime-
// neutral service; this adapter supplies the existing private Blob backend.

import { isHostedRecoveryRequest } from '../lib/hosted-transition.js';
import { isGetbasedOperatedRelayHost } from '../lib/proxy-policy.js';
import { handleProfileShareRequest } from '../lib/profile-share-service.js';
import { createProfileShareTransitionHandler } from '../lib/profile-share-transition.js';
import { createVercelBlobProfileShareStore } from '../lib/profile-share-vercel-blob-store.js';

export const config = { runtime: 'edge' };

export function createVercelProfileShareHandler(env: NodeJS.ProcessEnv = process.env) {
  const legacyStore = createVercelBlobProfileShareStore(env.BLOB_READ_WRITE_TOKEN);
  const transitionHandler = createProfileShareTransitionHandler({
    upstreamUrl: env.GETBASED_PROFILE_SHARE_UPSTREAM_URL,
    startedAt: env.GETBASED_PROFILE_SHARE_TRANSITION_STARTED_AT,
    legacyBlobUntil: env.GETBASED_PROFILE_SHARE_LEGACY_BLOB_UNTIL,
    legacyStore,
    legacyHandler: handleProfileShareRequest,
  });
  return (req: Request) => {
    if (isHostedRecoveryRequest(req, isGetbasedOperatedRelayHost(req))) {
      return new Response(
        JSON.stringify({ error: 'The hosted app is recovery-only. Use your self-hosted app for profile sharing.' }),
        { status: 410, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
      );
    }
    return transitionHandler(req);
  };
}

export default function handler(req: Request) {
  return createVercelProfileShareHandler()(req);
}
