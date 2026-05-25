// sync-delta-telemetry.js - Phase 1 delta push/pull telemetry.

import { getPullDeltaSnapshot } from './sync-delta-pull-snapshot.js';

const _DELTA_TELEMETRY_CAP = 50; // last-N pushes; ~6 KB at p99 entry size

function _deltaTelemetryKey(profileId) {
  return `labcharts-${profileId}-delta-telemetry`;
}

function _readDeltaTelemetry(profileId) {
  try {
    const raw = localStorage.getItem(_deltaTelemetryKey(profileId));
    return raw ? (JSON.parse(raw) || { pushes: [] }) : { pushes: [] };
  } catch { return { pushes: [] }; }
}

export function _recordPushTelemetry(profileId, blobBytes, deltaPlans) {
  if (!profileId) return;
  const perArray = {};
  let totalDeltaBytes = 0;
  let totalOps = 0;
  for (const { arrayName, plan } of deltaPlans) {
    let ins = 0, upd = 0, tom = 0, bytes = 0;
    for (const op of plan.ops) {
      if (op.kind === 'insert') ins++;
      else if (op.kind === 'update') upd++;
      else if (op.kind === 'tombstone') tom++;
      bytes += (op.args?.payload || '').length;
    }
    perArray[arrayName] = { ins, upd, tom, bytes };
    totalDeltaBytes += bytes;
    totalOps += plan.ops.length;
  }
  const entry = { at: Date.now(), blobBytes: blobBytes | 0, totalDeltaBytes, totalOps, perArray };
  try {
    const cur = _readDeltaTelemetry(profileId);
    cur.pushes.push(entry);
    if (cur.pushes.length > _DELTA_TELEMETRY_CAP) cur.pushes.splice(0, cur.pushes.length - _DELTA_TELEMETRY_CAP);
    localStorage.setItem(_deltaTelemetryKey(profileId), JSON.stringify(cur));
  } catch {}
}

export function getDeltaTelemetry(profileId) {
  if (!profileId) return null;
  const t = _readDeltaTelemetry(profileId);
  const pushes = Array.isArray(t.pushes) ? t.pushes : [];
  let aggBlob = 0, aggDelta = 0, aggOps = 0;
  for (const p of pushes) {
    aggBlob += p.blobBytes || 0;
    aggDelta += p.totalDeltaBytes || 0;
    aggOps += p.totalOps || 0;
  }
  const ratio = aggBlob > 0 ? aggDelta / aggBlob : 0;
  return {
    pushes,
    pull: getPullDeltaSnapshot(profileId),
    summary: { count: pushes.length, totalBlobBytes: aggBlob, totalDeltaBytes: aggDelta, totalOps: aggOps, ratio },
  };
}

export function resetDeltaTelemetry(profileId) {
  if (!profileId) return false;
  try { localStorage.removeItem(_deltaTelemetryKey(profileId)); return true; } catch { return false; }
}
