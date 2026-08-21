// @ts-check
// Runtime routing for the narrow compatibility proxy.
//
// Official getbased deployments send only the fixed, policy-classified
// compatibility operations to the maintainer-operated VPS relay. Independent
// self-hosted deployments keep their own same-origin /api/proxy endpoint.

import { isOfficialGetbasedHost } from './url-safety.js';

export const HOSTED_PROXY_API_URL = 'https://sync.getbased.health/compatibility-proxy';

const MANAGED_PREVIEW_HOSTS = new Set([
  'get-based-managed-subscription-v2.vercel.app',
]);

/**
 * @param {Location | { hostname?: string } | undefined} [locationLike]
 */
export function getProxyApiUrl(locationLike = globalThis.location) {
  const hostname = String(locationLike?.hostname || '').toLowerCase().replace(/\.$/, '');
  if (isOfficialGetbasedHost(/** @type {Location} */ (locationLike))
      || MANAGED_PREVIEW_HOSTS.has(hostname)) {
    return HOSTED_PROXY_API_URL;
  }
  return '/api/proxy';
}
