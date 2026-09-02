// @ts-check
// agent-proposal-dogfood-bootstrap.js — explicit loopback-only disposable test identity.

const DOGFOOD_QUERY = 'agentProposalDogfood';
const DOGFOOD_ENDPOINT = '/api/agent-proposal-dogfood-bootstrap';
const DOGFOOD_HEADER = 'agent-proposals-v1';
const TOKEN_RE = /^[a-f0-9]{64}$/u;
const CONTEXT_KEY_RE = /^gbctx_v1_[A-Za-z0-9_-]{43}$/u;
const PROFILE_ID_RE = /^[A-Za-z0-9_-]{1,80}$/u;

/** @param {unknown} value @param {string[]} allowed */
function exactKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every(key => allowed.includes(key));
}

/**
 * Load a disposable Agent Access identity only when an explicit loopback
 * preview URL requests it. Credentials remain in memory and are never saved.
 * @param {{ pageUrl?: string, currentProfileId?: string, fetchImpl?: typeof fetch }} [options]
 */
export async function loadAgentProposalDogfoodAccess({
  pageUrl = globalThis.location?.href || '',
  currentProfileId,
  fetchImpl = globalThis.fetch,
} = {}) {
  let page;
  try { page = new URL(pageUrl); } catch { return { requested: false, access: null }; }
  const loopback = page.hostname === 'localhost' || page.hostname === '127.0.0.1' || page.hostname === '[::1]';
  if (!loopback || page.searchParams.get(DOGFOOD_QUERY) !== '1') {
    return { requested: false, access: null };
  }
  let response;
  try {
    response = await fetchImpl(new URL(DOGFOOD_ENDPOINT, page.origin).href, {
      cache: 'no-store',
      headers: { 'X-GetBased-Dogfood-Bootstrap': DOGFOOD_HEADER },
    });
  } catch {
    return { requested: true, access: null, error: 'bootstrap_unavailable' };
  }
  if (!response?.ok) return { requested: true, access: null, error: 'bootstrap_unavailable' };
  let payload;
  try { payload = await response.json(); } catch {
    return { requested: true, access: null, error: 'invalid_bootstrap' };
  }
  if (!exactKeys(payload, ['version', 'profileId', 'token', 'contextKey'])
      || payload.version !== 1
      || !PROFILE_ID_RE.test(payload.profileId)
      || !TOKEN_RE.test(payload.token)
      || !CONTEXT_KEY_RE.test(payload.contextKey)) {
    return { requested: true, access: null, error: 'invalid_bootstrap' };
  }
  if (payload.profileId !== currentProfileId) {
    return { requested: true, access: null, error: 'profile_mismatch' };
  }
  return {
    requested: true,
    access: {
      enabled: true,
      token: payload.token,
      contextKey: payload.contextKey,
    },
  };
}
