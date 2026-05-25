// sync-delta-readiness.js - Phase 2 cutover readiness checks.

import { state } from './state.js';
import { getAt } from './data-merge.js';
import { DELTA_ARRAYS, DELTA_MAPS, DELTA_SCALARS } from './sync-delta-registry.js';
import { currentDeltaEvolu, currentDeltaItemRowQuery } from './sync-delta-observability-context.js';

// Hard gate before Phase 2 drops fat-blob writes. Reports whether every
// surface that has local data also has at least one corresponding itemRow
// in this device's Evolu DB.
export function getDeltaCutoverReadiness(profileId, importedData) {
  if (!profileId) return { ready: false, error: 'no-profile', surfaces: {} };
  if (!importedData) importedData = state.importedData || {};
  const surfaces = {};
  let blockers = 0;

  const evolu = currentDeltaEvolu();
  const itemRowQuery = currentDeltaItemRowQuery();
  const allItemRows = (evolu && itemRowQuery) ? (evolu.getQueryRows(itemRowQuery) || []) : [];
  const rowsByName = new Map();
  for (const r of allItemRows) {
    if (!r || r.profileId !== profileId) continue;
    if (!rowsByName.has(r.arrayName)) rowsByName.set(r.arrayName, []);
    rowsByName.get(r.arrayName).push(r);
  }

  function classify(name, localCount, rowCount) {
    let status;
    if (localCount === 0 && rowCount === 0) status = 'no-data';
    else if (localCount > 0 && rowCount === 0) { status = 'missing-rows'; blockers++; }
    else if (localCount === 0 && rowCount > 0) status = 'rows-only';
    else status = 'ok';
    surfaces[name] = { shape: undefined, localCount, rowCount, status };
  }

  for (const arrayName of DELTA_ARRAYS) {
    const raw = arrayName.includes('.')
      ? getAt(importedData, arrayName)
      : importedData[arrayName];
    const items = Array.isArray(raw) ? raw : [];
    const rows = (rowsByName.get(arrayName) || []).filter(r => !r.isDeleted);
    classify(arrayName, items.length, rows.length);
    surfaces[arrayName].shape = 'array';
  }
  for (const mapName of DELTA_MAPS) {
    const obj = mapName.includes('.') ? getAt(importedData, mapName) : importedData[mapName];
    const localCount = (obj && typeof obj === 'object' && !Array.isArray(obj)) ? Object.keys(obj).length : 0;
    const rows = (rowsByName.get(mapName) || []).filter(r => !r.isDeleted);
    classify(mapName, localCount, rows.length);
    surfaces[mapName].shape = 'map';
  }
  for (const scalarName of DELTA_SCALARS) {
    const v = scalarName.includes('.')
      ? getAt(importedData, scalarName)
      : importedData[scalarName];
    const hasValue = v !== null && v !== undefined && !(typeof v === 'string' && v.length === 0);
    const rows = (rowsByName.get(scalarName) || []).filter(r => !r.isDeleted);
    classify(scalarName, hasValue ? 1 : 0, rows.length);
    surfaces[scalarName].shape = 'scalar';
  }

  return {
    ready: blockers === 0,
    blockerCount: blockers,
    surfaceCount: Object.keys(surfaces).length,
    surfaces,
  };
}
