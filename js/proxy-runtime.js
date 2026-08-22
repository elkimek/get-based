// @ts-check
// Runtime routing for the narrow compatibility proxy.
//
// Official getbased deployments send only the fixed, policy-classified
// compatibility operations to the maintainer-operated VPS relay. Independent
// self-hosted deployments keep their own same-origin /api/proxy endpoint.

import { isOfficialGetbasedHost } from './url-safety.js';

export const HOSTED_PROXY_API_URL = 'https://integrations.getbased.health/api/proxy';

/**
 * @param {Location | { hostname?: string } | undefined} [locationLike]
 */
export function getProxyApiUrl(locationLike = globalThis.location) {
  if (isOfficialGetbasedHost(/** @type {Location} */ (locationLike))) {
    return HOSTED_PROXY_API_URL;
  }
  return '/api/proxy';
}
