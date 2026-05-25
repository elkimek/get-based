// sync-delta-id.js - Per-row sync item identity helpers.

// Stable hash for content-equality detection. djb2 is sufficient for
// unchanged-item detection and deterministic synthetic item IDs.
export function _djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Defence-in-depth against prototype pollution via relay-controlled itemId
// or map key. The allowlist regex accepts these keys, so reject them
// explicitly at every itemId-from-payload path.
const _PROTO_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function _isProtoPollutionKey(id) {
  return _PROTO_POLLUTION_KEYS.has(id);
}

export function _isAllowlistSafeId(id) {
  return typeof id === 'string'
    && id.length > 0
    && /^[a-zA-Z0-9_.-]+$/.test(id)
    && !_isProtoPollutionKey(id);
}
