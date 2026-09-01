// @ts-check
// deployment-policy.js — operator identity and supplementary policy metadata.

import { isOfficialGetbasedHost } from './url-safety.js';

const OFFICIAL_OPERATOR = Object.freeze({
  name: 'getbased',
  privacyUrl: 'https://getbased.health/privacy',
  termsUrl: 'https://getbased.health/terms',
});

function cleanUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, globalThis.location?.origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

function metaContent(name) {
  if (typeof document === 'undefined') return '';
  return String(document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '').trim();
}

function configuredOperator() {
  const runtime = /** @type {any} */ (globalThis).GETBASED_DEPLOYMENT_CONFIG?.operator || {};
  return {
    name: String(runtime.name || metaContent('getbased-operator-name') || '').trim(),
    privacyUrl: cleanUrl(runtime.privacyUrl || metaContent('getbased-operator-privacy-url')),
    termsUrl: cleanUrl(runtime.termsUrl || metaContent('getbased-operator-terms-url')),
  };
}

/**
 * Policy metadata for the deployment operator. Official-host defaults are
 * intentionally applied only on an official getbased host; independent
 * self-hosts never fall back to getbased policies.
 */
export function getDeploymentOperatorPolicy(locationLike = globalThis.location) {
  const configured = configuredOperator();
  if (configured.name || configured.privacyUrl || configured.termsUrl) return configured;
  return isOfficialGetbasedHost(locationLike) ? { ...OFFICIAL_OPERATOR } : configured;
}

export function getSupplementaryDeploymentPolicy(locationLike = globalThis.location) {
  const policy = getDeploymentOperatorPolicy(locationLike);
  return policy.name || policy.privacyUrl || policy.termsUrl ? policy : null;
}

export function getOfficialGetbasedPolicy() {
  return { ...OFFICIAL_OPERATOR };
}
