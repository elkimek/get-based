// sync-delta-planner-context.js - Shared dependency access for push-side delta planners.

let _getEvolu = () => null;
let _getItemRowQuery = () => null;

export function configureSyncDeltaPlannerContext({ getEvolu, getItemRowQuery } = {}) {
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof getItemRowQuery === 'function') _getItemRowQuery = getItemRowQuery;
}

export function getPlannerItemRows(profileId, arrayName) {
  let evolu = null;
  let itemRowQuery = null;
  try { evolu = _getEvolu?.() || null; } catch {}
  try { itemRowQuery = _getItemRowQuery?.() || null; } catch {}
  const allItemRows = (evolu && itemRowQuery) ? (evolu.getQueryRows(itemRowQuery) || []) : [];
  return allItemRows.filter(r => r.profileId === profileId && r.arrayName === arrayName);
}
