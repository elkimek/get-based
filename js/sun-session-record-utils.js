// @ts-check
// sun-session-record-utils.js — pure provenance and conflict-resolution helpers.

import { state } from './state.js';
import { _normalizePSMTier } from './sun-session-model.js';

function atmosphereProvenanceKind(atmosphere) {
  const source = String(atmosphere?.source || 'unknown');
  if (source === 'manual_meter') return 'measured';
  if (atmosphere?._uvOverridden || source === 'manual' || source === 'manual_entry') return 'user-entered';
  if (source === 'zenith_offline') return 'modeled-offline';
  if (['cams', 'noaa_nws', 'open_meteo', 'selfhost'].includes(source)) return 'weather-derived';
  return 'unknown';
}
function confidenceLevel(score) {
  if (score >= 0.8) return 'high';
  if (score >= 0.55) return 'medium';
  return 'low';
}

function hasFiniteValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

/**
 * @param {{
 *   session?: any,
 *   atmosphere?: any,
 *   integrationMethod?: string,
 *   zenithDeg?: number | null,
 *   generatedAt?: number,
 *   inferredDuringMigration?: boolean
 * }} [options]
 */
/** @param {any} [options] @param {Record<string, any>} [deps] */
export function buildSunSessionCalculationCore({
  session,
  atmosphere = session?.atmosphere || null,
  integrationMethod = session?.doseIntegration?.method || 'unknown',
  zenithDeg = null,
  generatedAt = Date.now(),
  inferredDuringMigration = false,
} = {}, { computeUVConfidence = (..._args) => 0.5, engineVersion = 10 } = {}) {
  const source = atmosphere?.source || 'unknown';
  const snapshotAgeSec = Number.isFinite(atmosphere?._camsMeta?.ageSec)
    ? atmosphere._camsMeta.ageSec
    : null;
  let score = Number(computeUVConfidence({
    source,
    snapshotAgeSec,
    cloudCover: atmosphere?.cloudCover ?? null,
    zenithDeg,
    uvIndex: atmosphere?.uvIndex ?? null,
    isStale: !!atmosphere?._stale,
    manualOverridden: !!atmosphere?._uvOverridden,
  }));
  if (!Number.isFinite(score)) score = Number(atmosphere?.confidence);
  if (!Number.isFinite(score)) score = 0.5;

  const reasons = [];
  const sourceKind = atmosphereProvenanceKind(atmosphere);
  reasons.push(sourceKind === 'measured'
    ? 'UVI came from a meter reading.'
    : sourceKind === 'user-entered'
      ? 'UVI was entered by the user.'
      : sourceKind === 'weather-derived'
        ? `UVI came from ${source}.`
        : sourceKind === 'modeled-offline'
          ? 'UVI used the offline clear-sky model.'
          : 'Atmosphere source is unknown.');

  if (integrationMethod.startsWith('live-time-integrated')) {
    reasons.push('Dose was integrated across live time slices.');
  } else if (integrationMethod.startsWith('midpoint-estimate-after-duration-edit')) {
    score *= 0.7;
    reasons.push('Duration extension required a midpoint estimate for unobserved time.');
  } else if (integrationMethod.startsWith('midpoint-estimate')) {
    score *= 0.85;
    reasons.push('Dose uses one midpoint atmosphere snapshot.');
  } else {
    score *= 0.75;
    reasons.push('Dose integration method is unavailable.');
  }
  if (inferredDuringMigration) {
    score *= 0.9;
    reasons.push('Provenance metadata was inferred from a legacy record.');
  }
  if (!hasFiniteValue(session?.location?.lat) || !hasFiniteValue(session?.location?.lon)) {
    score *= 0.8;
    reasons.push('Precise session coordinates were not recorded.');
  }
  if (!hasFiniteValue(atmosphere?.uvIndex)) {
    score *= 0.65;
    reasons.push('No UVI anchor was available.');
  }
  if (atmosphere?._stale) reasons.push('The atmosphere provider marked this snapshot stale.');
  if (Number.isFinite(zenithDeg) && zenithDeg > 70) reasons.push('Low solar elevation increases spectral uncertainty.');
  const psmTier = _normalizePSMTier(session?.safety?.photosensitiveMedTier ?? state.importedData?.sunDefaults?.photosensitiveMeds);
  if (psmTier !== 'none') reasons.push('Medication sensitivity is qualitative, not a personalized burn threshold.');

  score = Math.max(0.05, Math.min(0.99, score));
  const allowsExactSafety = score >= 0.65
    && !atmosphere?._stale
    && hasFiniteValue(atmosphere?.uvIndex)
    && psmTier === 'none';
  return {
    engineVersion: session?.engineVersion ?? engineVersion,
    generatedAt,
    provenance: {
      atmosphere: {
        kind: sourceKind,
        source,
        fetchedAt: Number.isFinite(atmosphere?.fetchedAt) ? atmosphere.fetchedAt : null,
      },
      spectrum: {
        kind: 'modeled',
        model: 'Bird-Riordan reconstruction',
        resolutionNm: 5,
        uvIndexAnchored: hasFiniteValue(atmosphere?.uvIndex),
      },
      dose: {
        kind: 'modeled',
        integrationMethod,
      },
    },
    confidence: {
      score: Math.round(score * 100) / 100,
      level: confidenceLevel(score),
      reasons,
    },
    precision: {
      allowsExactSafety,
      reason: allowsExactSafety
        ? 'Atmosphere and integration inputs support a more precise modeled safety display; individual response can still vary.'
        : 'Show rounded safety estimates because inputs or biological response are uncertain.',
    },
  };
}


export function compareActiveFreshness(a, b) {
  return (b.updatedAt || b.startedAt || 0) - (a.updatedAt || a.startedAt || 0)
    || String(b.id || '').localeCompare(String(a.id || ''));
}

export function supersedeActiveSessionRecord(session, canonical, resolvedAt) {
  if (!session || session.endedAt) return;
  const startedAt = Number(session.startedAt) || resolvedAt;
  const lastObservedAt = Math.max(
    startedAt,
    Number(session.updatedAt) || startedAt,
    Number(canonical.startedAt) || startedAt
  );
  const endedAt = Math.max(startedAt, Math.min(resolvedAt, lastObservedAt));
  if (session.paused && Number.isFinite(session.pausedAt)) {
    if (!Array.isArray(session.pausePeriods)) session.pausePeriods = [];
    session.pausePeriods.push({ startedAt: session.pausedAt, endedAt });
  }
  const pausedMs = (session.pausePeriods || []).reduce((sum, period) => {
    const start = Number(period?.startedAt);
    const end = Number(period?.endedAt);
    return sum + (Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0);
  }, 0);
  session.endedAt = endedAt;
  session.durationMin = Math.max(0, (endedAt - startedAt - pausedMs) / 60000);
  session.updatedAt = resolvedAt;
  session.paused = false;
  delete session.pausedAt;
  delete session.liveCheckpoint;
  session.syncResolution = {
    status: 'superseded',
    reason: 'duplicate-active-session',
    canonicalSessionId: canonical.id,
    resolvedAt,
  };
  session.doseIntegration = {
    ...(session.doseIntegration || {}),
    method: session.doseIntegration?.method || 'superseded-active-conflict',
    completedAt: endedAt,
  };
  return true;
}
