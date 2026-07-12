// @ts-check
// sun-active-session.js — active sun-session UI, live dose ticker, and
// active-session modal. Core persisted session storage and hydration live in
// sun-sessions-store.js; this module receives those operations through
// configuration to avoid importing sun.js back into the active UI layer.

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { POSTURE_MULTIPLIERS, SURFACE_ALBEDO } from './sun-session-model.js';
import { renderChannelChips } from './sun-session-ui.js';
import { configureSunSessionStartUI, openStartSunSessionDialog } from './sun-session-start-ui.js';

const SAFETY_ATMOSPHERE_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * @typedef {object} SunActiveSessionDeps
 * @property {() => any[]} getSessions
 * @property {() => any} getActiveSession
 * @property {(opts?: any) => Promise<any>} startSession
 * @property {(id: any) => Promise<any>} stopSession
 * @property {(id: any, coords?: any) => Promise<any>} hydrateSession
 * @property {() => any} getSunCoords
 * @property {() => any} getCachedConditionsAtmosphere
 * @property {(atMs?: number) => number} cumulativeOcularEffectiveDose8h
 * @property {number} uviFetchTimeoutMs
 * @property {() => Promise<void> | void} saveImportedData
 * @property {(atm: any) => any} applyAtmOverrides
 * @property {(scrollAnchor?: string) => void} refreshSurfaces
 * @property {(raw: any) => string} normalizePSMTier
 * @property {(tier?: any) => number} photosensitiveMedScale
 * @property {Array<{ key: string, label: string, pickerLabel?: string }>} eyeModes
 * @property {Array<{ key: string, label: string }>} lensTints
 * @property {Array<{ key: string, label: string }>} postureOptions
 * @property {Array<{ key: string, label: string }>} surfaceOptions
 * Runtime math/render hooks are also configured here; defaults are no-ops.
 */

/** @type {SunActiveSessionDeps & Record<string, any>} */
const activeDeps = {
  getSessions: () => [],
  getActiveSession: () => null,
  startSession: async () => null,
  stopSession: async () => null,
  hydrateSession: async () => null,
  getSunCoords: () => null,
  getCachedConditionsAtmosphere: () => null,
  cumulativeOcularEffectiveDose8h: () => 0,
  uviFetchTimeoutMs: 5000,
  saveImportedData: async () => {},
  applyAtmOverrides: (atm) => atm,
  refreshSurfaces: () => {},
  normalizePSMTier: (raw) => raw || 'none',
  photosensitiveMedScale: () => 1.0,
  eyeModes: [], lensTints: [], postureOptions: [], surfaceOptions: [],
  fetchAtmosphere: async () => null, reconstructSpectrum: () => null,
  computeChannelDoses: () => ({}), erythemalSED: () => 0,
  retinalUVdose: () => 0,
  fractionOfMED: () => 0, solarZenithAngle: () => 90,
  computeUVConfidence: () => 0.5,
  interpolateAtmosphere: () => null,
  vitaminDIU: (channelAu) => channelAu * 60,
  vitaminDIUPerSession: null,
  skinTypeToFitzpatrick: (skinType) => (String(skinType || '').match(/^(I{1,3}|IV|VI?)\b/) || [])[1] || null,
  renderLightChannelsLive: () => {}, renderLightTodayStrip: () => '',
};

/** @param {(Partial<SunActiveSessionDeps> & Record<string, any>)} [deps] */
export function configureSunActiveSession(deps = {}) {
  Object.assign(activeDeps, deps);
  configureSunSessionStartUI({ ...activeDeps, ensureActiveTicker });
}

export { POSTURE_MULTIPLIERS, SURFACE_ALBEDO } from './sun-session-model.js';
export { openStartSunSessionDialog };

// Single-tap "I'm outside now" — starts a session with last-used defaults.
// On stop: skips confirm dialog because the user explicitly tapped stop.
export async function quickLogSunSession() {
  const active = activeDeps.getActiveSession();
  if (active) {
    await activeDeps.stopSession(active.id);
    await hydrateSunSessionFromProfileCoords(active.id);
    const sess = activeDeps.getSessions().find(s => s.id === active.id);
    const durationMin = Number(sess?.durationMin) || 0;
    const summary = _plainStopSummary(sess, durationMin);
    showNotification(summary, summary.includes('over your burn threshold') ? 'error' : 'success', 7000);
    // The live card disappears during the rebuild. Anchor the first stable
    // post-session widget so stopping cannot strand the user far down the
    // newly shortened page.
    activeDeps.refreshSurfaces('[data-widget-id="light-best-next-step"]');
    return;
  }
  return openStartSunSessionDialog();
}

function _plainStopSummary(sess, dur) {
  const durationLabel = dur > 0 && dur < 1 ? '<1 min' : `${Math.round(dur)} min`;
  if (!sess) return `Session saved — ${durationLabel}`;
  const parts = [`Saved · ${durationLabel} outside`];
  const exactSafety = sess.calculation?.precision?.allowsExactSafety === true;
  const highModelConfidence = Number(sess.calculation?.confidence?.score) >= 0.8;
  const fitz = sess.safety?.fitzpatrick || 'III';
  const uvi = sess.atmosphere?.uvIndex;
  const vitDAu = sess.doses?.vitamin_d || 0;
  if (vitDAu > 0 && activeDeps.vitaminDIU) {
    const bf = sess.bodyExposure?.fraction;
    const iu = (Number.isFinite(bf) && bf > 0 && typeof activeDeps.vitaminDIUPerSession === 'function')
      ? activeDeps.vitaminDIUPerSession(vitDAu, fitz, uvi, !!sess.bodyExposure?.rotatedSides, state.importedData?.genetics || null, bf)
      : activeDeps.vitaminDIU(vitDAu, fitz, uvi, !!sess.bodyExposure?.rotatedSides, state.importedData?.genetics || null);
    if (iu >= 100 && highModelConfidence) {
      const lo = Math.round(iu * 0.6 / 50) * 50;
      const hi = Math.round(iu * 1.5 / 50) * 50;
      parts.push(`~${lo}–${hi} IU vitamin D`);
    }
  } else if (vitDAu > 0) {
    parts.push('vitamin D estimate recorded');
  } else if (sess.bodyExposure?.glassBetween) {
    parts.push('UVB blocked by glass');
  }
  const med = sess.safety?.medFraction || 0;
  if (med >= 1.0) {
    parts.push(exactSafety ? 'modeled burn threshold reached' : 'rounded burn estimate is high');
  } else if (med >= 0.7) {
    const pct = exactSafety ? Math.round(med * 100) : Math.round(med * 10) * 10;
    parts.push(`${exactSafety ? '' : '~'}${pct}% modeled burn dose — avoid more UV today`);
  } else if (med >= 0.3) {
    const pct = exactSafety ? Math.round(med * 100) : Math.round(med * 10) * 10;
    parts.push(`${exactSafety ? '' : '~'}${pct}% modeled burn dose`);
  }
  return parts.join(' · ');
}

let _activeTicker = null;
const _liveState = new Map();

function _getLiveState(id) { return _liveState.get(id) || null; }
function _restoreLiveStateFromCheckpoint(sess) {
  const checkpoint = sess?.liveCheckpoint;
  if (!sess?.id || !checkpoint || _liveState.has(sess.id)) return _getLiveState(sess?.id);
  setSunLiveState(sess.id, {
    ratePerMin: checkpoint.ratePerMin || null,
    sedPerMin: Number(checkpoint.sedPerMin) || 0,
    fitzpatrick: checkpoint.fitzpatrick || 'III',
    medScale: Number.isFinite(checkpoint.medScale) ? checkpoint.medScale : 1,
    psmTier: checkpoint.psmTier || 'none',
    atm: checkpoint.atm || null,
    zenith: Number.isFinite(checkpoint.zenith) ? checkpoint.zenith : null,
    baselineZenith: Number.isFinite(checkpoint.baselineZenith) ? checkpoint.baselineZenith : null,
    snapshotAt: Number(checkpoint.snapshotAt) || sess.startedAt,
    committedDoses: { ...(checkpoint.committedDoses || {}) },
    committedSED: Number(checkpoint.committedSED) || 0,
    committedRetinalUV: Number(checkpoint.committedRetinalUV) || 0,
    doseSegments: Array.isArray(checkpoint.doseSegments) ? checkpoint.doseSegments.map(segment => ({ ...segment })) : [],
    fractionOfMEDFn: activeDeps.fractionOfMED,
    pending: false,
  });
  return _getLiveState(sess.id);
}
export function setSunLiveState(id, patch) {
  const cur = _liveState.get(id) || {};
  _liveState.set(id, Object.assign(cur, patch));
}
export function clearSunLiveState(id) { _liveState.delete(id); }

function _liveSafetyConfidence(live) {
  if (!live?.atm) return { score: 0, exact: false };
  const score = Number(activeDeps.computeUVConfidence({
    source: live.atm.source,
    snapshotAgeSec: live.atm?._camsMeta?.ageSec ?? null,
    cloudCover: live.atm.cloudCover ?? null,
    zenithDeg: live.zenith ?? null,
    uvIndex: live.atm.uvIndex ?? null,
    isStale: !!live.atm._stale,
    manualOverridden: !!live.atm._uvOverridden,
  }));
  return {
    score: Number.isFinite(score) ? score : 0,
    exact: Number.isFinite(score) && score >= 0.65 && !live.atm._stale && live.psmTier === 'none',
  };
}

export function _formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

async function _snapshotActiveRate(sess, { force = false } = {}) {
  const cur = _getLiveState(sess.id) || _restoreLiveStateFromCheckpoint(sess);
  if (cur && cur.ratePerMin && !force) return cur;
  if (cur && cur.pending) return null;
  setSunLiveState(sess.id, { pending: true });
  try {
    const {
      reconstructSpectrum,
      computeChannelDoses,
      erythemalSED,
      fractionOfMED,
      solarZenithAngle,
      fetchAtmosphere,
    } = activeDeps;
    const coords = sess.location || activeDeps.getSunCoords();
    if (!coords) {
      setSunLiveState(sess.id, { pending: false });
      return null;
    }
    const now = new Date();
    let atm = await fetchAtmosphere({ lat: coords.lat, lon: coords.lon, isoTime: now.toISOString() });
    if (sess.endedAt) {
      clearSunLiveState(sess.id);
      return null;
    }
    const atmosphereAgeMs = Number.isFinite(atm?.fetchedAt) ? Date.now() - atm.fetchedAt : 0;
    if (atm?._stale && atmosphereAgeMs > SAFETY_ATMOSPHERE_MAX_AGE_MS) {
      throw new Error('Atmosphere data is too stale for live UV safety math');
    }
    atm = activeDeps.applyAtmOverrides(atm);
    const priorAtm = _getLiveState(sess.id)?.atm;
    if (priorAtm && Number.isFinite(priorAtm.uvIndex) && Number.isFinite(atm?.uvIndex)) {
      const primarySrc = (s) => String(s || '').split('+')[0];
      const sourcesDiffer = primarySrc(priorAtm.source) !== primarySrc(atm.source);
      const priorConf = priorAtm.confidence ?? 0.6;
      const newConf = atm.confidence ?? 0.6;
      const downgraded = newConf < priorConf - 0.15;
      const uviDelta = Math.abs(atm.uvIndex - priorAtm.uvIndex);
      const largeJump = priorAtm.uvIndex > 0 && uviDelta > priorAtm.uvIndex * 0.25;
      if (sourcesDiffer && downgraded && largeJump) {
        atm = { ...priorAtm, _sourceFlipBlocked: { from: priorAtm.source, to: atm.source, attemptedUvi: atm.uvIndex, at: Date.now() } };
      }
    }
    const zenith = solarZenithAngle(now, coords.lat, coords.lon);
    const spectrum = reconstructSpectrum({
      zenithDeg: zenith,
      ozoneDU: atm.ozoneDU ?? 300,
      altitudeM: coords.altitudeM ?? 0,
      cloudCover: (atm.cloudCover ?? 0) / 100,
      aod: atm?.airQuality?.aod ?? null,
      uvIndex: atm.uvIndex ?? null,
    });
    const liveBodyModifiers = {
      glassBetween: !!sess.bodyExposure?.glassBetween,
      sunscreenSPF: sess.bodyExposure?.sunscreenSPF || 0,
    };
    const ratePerMin = computeChannelDoses({
      spectrum,
      durationMin: 1,
      bodyExposureFraction: sess.bodyExposure?.fraction ?? 0,
      eyeExposure: sess.eyeExposure,
      bodyModifiers: liveBodyModifiers,
    });
    const sedPerMin = erythemalSED({
      spectrum,
      durationMin: 1,
      incidenceMultiplier: 1,
      bodyModifiers: liveBodyModifiers,
    });
    const lcSkin = state.importedData?.lightCircadian?.skinType;
    const lcRoman = lcSkin && activeDeps.skinTypeToFitzpatrick(lcSkin);
    const fitzpatrick = state.importedData?.sunDefaults?.fitzpatrick || lcRoman || 'III';
    const psmTier = activeDeps.normalizePSMTier(state.importedData?.sunDefaults?.photosensitiveMeds);
    const medScale = activeDeps.photosensitiveMedScale(psmTier);
    let existing = _getLiveState(sess.id) || {};
    const isReSnapshot = !!(existing.atm || existing.committedDoses);
    // The network request can take seconds. Commit that interval with the
    // previous atmosphere before switching snapshots so it cannot disappear
    // from the persisted totals.
    if (isReSnapshot && existing.snapshotAt && !sess.paused) {
      commitSunLiveSlice(sess);
      existing = _getLiveState(sess.id) || existing;
    }
    const sliceStart = isReSnapshot ? (existing.snapshotAt || Date.now()) : sess.startedAt;
    setSunLiveState(sess.id, {
      ratePerMin, sedPerMin, fitzpatrick, medScale, psmTier, atm, zenith,
      baselineZenith: existing.baselineZenith ?? zenith,
      snapshotAt: sliceStart,
      committedDoses: existing.committedDoses || {},
      committedSED: existing.committedSED || 0,
      committedRetinalUV: existing.committedRetinalUV || 0,
      fractionOfMEDFn: fractionOfMED,
      pending: false,
    });
    return _getLiveState(sess.id);
  } catch (e) {
    if (sess.endedAt) {
      clearSunLiveState(sess.id);
      return null;
    }
    globalThis.console?.warn?.('snapshotActiveRate failed', e);
    setSunLiveState(sess.id, { pending: false });
    return null;
  }
}

// Explicit refresh hook used by lifecycle callers and regression tests. The
// previous atmosphere continues integrating until the replacement snapshot is
// ready, so a slow request cannot create a dose gap.
export function refreshSunLiveRate(sess) {
  return _snapshotActiveRate(sess, { force: true });
}

function _rateAtInstant(sess, instantMs) {
  const live = _getLiveState(sess?.id);
  if (!live || !live.atm) return null;
  const {
    reconstructSpectrum,
    computeChannelDoses,
    erythemalSED,
    solarZenithAngle,
    interpolateAtmosphere,
  } = activeDeps;

  const coords = sess.location;
  if (!coords) return null;
  const when = new Date(instantMs);
  const isoTime = when.toISOString();
  let atmAtT = live.atm;
  if (interpolateAtmosphere) {
    const interp = interpolateAtmosphere(live.atm, isoTime);
    if (interp) {
      atmAtT = {
        ...live.atm,
        uvIndex: interp.uvIndex ?? live.atm.uvIndex,
        cloudCover: interp.cloudCover ?? live.atm.cloudCover,
        temperatureC: interp.temperatureC ?? live.atm.temperatureC,
      };
    }
  }
  atmAtT = activeDeps.applyAtmOverrides(atmAtT);

  const baseFraction = sess.bodyExposure?.fraction ?? 0;
  const postureMult = POSTURE_MULTIPLIERS[sess.posture] ?? 1.0;
  const albedoMult = 1 + (SURFACE_ALBEDO[sess.surfaceAlbedo] ?? 0) * 0.5;
  const effFraction = baseFraction * postureMult * albedoMult;

  const zenith = solarZenithAngle(when, coords.lat, coords.lon);
  const spectrum = reconstructSpectrum({
    zenithDeg: zenith,
    ozoneDU: atmAtT.ozoneDU ?? 300,
    altitudeM: coords.altitudeM ?? 0,
    cloudCover: (atmAtT.cloudCover ?? 0) / 100,
    aod: atmAtT?.airQuality?.aod ?? null,
    uvIndex: atmAtT.uvIndex ?? null,
  });
  const bodyModifiers = {
    glassBetween: !!sess.bodyExposure?.glassBetween,
    sunscreenSPF: sess.bodyExposure?.sunscreenSPF || 0,
  };
  const rate = computeChannelDoses({
    spectrum,
    durationMin: 1,
    bodyExposureFraction: effFraction,
    eyeExposure: sess.eyeExposure,
    bodyModifiers,
  });
  const sedPerMin = erythemalSED({
    spectrum,
    durationMin: 1,
    incidenceMultiplier: postureMult * albedoMult,
    bodyModifiers,
  });
  let retinalUVPerMin = 0;
  if (sess.eyeExposure?.mode === 'direct') {
    retinalUVPerMin = activeDeps.retinalUVdose({
      spectrum,
      eyeExposure: { ...sess.eyeExposure, durationSec: 60 },
      zenithDeg: zenith,
    });
  }
  return { rate, sedPerMin, retinalUVPerMin };
}

function _integrateSlice(sess, startMs, endMs) {
  if (endMs <= startMs) return { doses: {}, sed: 0, retinalUV: 0 };
  const totals = { doses: {}, sed: 0, retinalUV: 0 };
  const maxSliceMs = 5 * 60 * 1000;
  for (let sliceStart = startMs; sliceStart < endMs; sliceStart += maxSliceMs) {
    const sliceEnd = Math.min(endMs, sliceStart + maxSliceMs);
    const durationMin = (sliceEnd - sliceStart) / 60000;
    const midMs = (sliceStart + sliceEnd) / 2;
    const r0 = _rateAtInstant(sess, sliceStart);
    const r1 = _rateAtInstant(sess, midMs);
    const r2 = _rateAtInstant(sess, sliceEnd);
    if (!r0 || !r1 || !r2) continue;
    for (const k of Object.keys(r1.rate)) {
      const a = r0.rate[k] ?? 0;
      const m = r1.rate[k] ?? 0;
      const b = r2.rate[k] ?? 0;
      totals.doses[k] = (totals.doses[k] || 0) + durationMin * (a + 4 * m + b) / 6;
    }
    totals.sed += durationMin * (r0.sedPerMin + 4 * r1.sedPerMin + r2.sedPerMin) / 6;
    totals.retinalUV += durationMin * (r0.retinalUVPerMin + 4 * r1.retinalUVPerMin + r2.retinalUVPerMin) / 6;
  }
  return totals;
}

export function commitSunLiveSlice(sess) {
  const live = _getLiveState(sess?.id) || _restoreLiveStateFromCheckpoint(sess);
  if (!live || !live.atm || !live.snapshotAt) return;
  const sliceStart = live.snapshotAt;
  const sliceEnd = Date.now();
  if (sliceEnd <= sliceStart) return;
  const { doses, sed, retinalUV } = _integrateSlice(sess, sliceStart, sliceEnd);
  const committedDoses = { ...(live.committedDoses || {}) };
  for (const [k, v] of Object.entries(doses)) {
    committedDoses[k] = (committedDoses[k] || 0) + v;
  }
  const committedSED = (live.committedSED || 0) + sed;
  const committedRetinalUV = (live.committedRetinalUV || 0) + retinalUV;
  const doseSegments = [...(live.doseSegments || []), {
    startedAt: sliceStart,
    endedAt: sliceEnd,
    source: 'sun',
    bodyRegions: Array.isArray(sess.bodyExposure?.regions) ? [...sess.bodyExposure.regions] : [],
    bodyFraction: Number(sess.bodyExposure?.fraction) || 0,
    doses: { ...doses },
    erythemalSED: sed,
    ocularEffectiveDose: retinalUV,
    atmosphere: {
      source: live.atm?.source || null,
      uvIndex: Number.isFinite(live.atm?.uvIndex) ? live.atm.uvIndex : null,
      fetchedAt: Number.isFinite(live.atm?.fetchedAt) ? live.atm.fetchedAt : null,
    },
  }];
  setSunLiveState(sess.id, {
    committedDoses,
    committedSED,
    committedRetinalUV,
    doseSegments,
    snapshotAt: sliceEnd,
  });
  // Persist the integration boundary so a reload, crash, or mobile tab
  // eviction does not rewrite the earlier session using today's latest
  // coverage, sunscreen, or atmosphere. Runtime functions stay in memory;
  // only serializable dose state is checkpointed.
  sess.liveCheckpoint = {
    ratePerMin: { ...(live.ratePerMin || {}) },
    sedPerMin: Number(live.sedPerMin) || 0,
    fitzpatrick: live.fitzpatrick || 'III',
    medScale: Number.isFinite(live.medScale) ? live.medScale : 1,
    psmTier: live.psmTier || 'none',
    atm: live.atm || null,
    zenith: Number.isFinite(live.zenith) ? live.zenith : null,
    baselineZenith: Number.isFinite(live.baselineZenith) ? live.baselineZenith : null,
    snapshotAt: sliceEnd,
    committedDoses,
    committedSED,
    committedRetinalUV,
    doseSegments,
    savedAt: Date.now(),
  };
  Promise.resolve(activeDeps.saveImportedData()).catch(() => {});
}

export function liveDosesFor(sess, atMs = Date.now()) {
  const live = _getLiveState(sess?.id) || _restoreLiveStateFromCheckpoint(sess);
  if (!live) return null;
  if (sess?.paused) {
    const committed = live.committedDoses || {};
    const sed = live.committedSED || 0;
    const retinalUV = live.committedRetinalUV || 0;
    const medFraction = live.fractionOfMEDFn ? live.fractionOfMEDFn({ sed, fitzpatrick: live.fitzpatrick, medScale: live.medScale ?? 1.0 }) : 0;
    return { doses: { ...committed }, sed, ocularEffectiveDose: retinalUV, retinalUV, medFraction, fitzpatrick: live.fitzpatrick, medScale: live.medScale, psmTier: live.psmTier, atm: live.atm, doseSegments: [...(live.doseSegments || [])], paused: true };
  }
  // During the five-minute atmosphere refresh, ratePerMin is intentionally
  // cleared but the last atmosphere snapshot remains usable. Continue
  // integrating from the committed boundary so Stop cannot lose this gap.
  if (!live.ratePerMin && !live.atm) return null;
  const sliceStart = live.snapshotAt || sess.startedAt;
  const { doses: sliceDoses, sed: sliceSed, retinalUV: sliceRetinalUV } = _integrateSlice(sess, sliceStart, atMs);
  const committed = live.committedDoses || {};
  const doses = { ...committed };
  for (const [k, v] of Object.entries(sliceDoses)) {
    doses[k] = (doses[k] || 0) + v;
  }
  const sed = (live.committedSED || 0) + sliceSed;
  const retinalUV = (live.committedRetinalUV || 0) + sliceRetinalUV;
  const medFraction = live.fractionOfMEDFn ? live.fractionOfMEDFn({ sed, fitzpatrick: live.fitzpatrick, medScale: live.medScale ?? 1.0 }) : 0;
  const doseSegments = [...(live.doseSegments || [])];
  if (atMs > sliceStart) {
    doseSegments.push({
      startedAt: sliceStart,
      endedAt: atMs,
      source: 'sun',
      bodyRegions: Array.isArray(sess.bodyExposure?.regions) ? [...sess.bodyExposure.regions] : [],
      bodyFraction: Number(sess.bodyExposure?.fraction) || 0,
      doses: { ...sliceDoses },
      erythemalSED: sliceSed,
      ocularEffectiveDose: sliceRetinalUV,
      atmosphere: {
        source: live.atm?.source || null,
        uvIndex: Number.isFinite(live.atm?.uvIndex) ? live.atm.uvIndex : null,
        fetchedAt: Number.isFinite(live.atm?.fetchedAt) ? live.atm.fetchedAt : null,
      },
    });
  }
  return { doses, sed, ocularEffectiveDose: retinalUV, retinalUV, medFraction, fitzpatrick: live.fitzpatrick, medScale: live.medScale, psmTier: live.psmTier, atm: live.atm, doseSegments };
}

function _renderActiveCardBody(sess) {
  const elapsed = _formatElapsed(Date.now() - sess.startedAt);
  const live = liveDosesFor(sess);
  let medStr = '';
  if (live && Number.isFinite(live.medFraction)) {
    const confidence = _liveSafetyConfidence(live);
    const rawPct = live.medFraction * 100;
    const pct = confidence.exact ? Math.round(rawPct) : Math.round(rawPct / 10) * 10;
    let label = 'low recorded dose', cls = '';
    if (live.medFraction >= 1) { label = 'over threshold'; cls = 'over'; }
    else if (live.medFraction >= 0.7) { label = 'high'; cls = 'warn'; }
    else if (live.medFraction >= 0.3) { label = 'moderate'; cls = ''; }
    const qualifier = confidence.exact ? '' : '~';
    const title = confidence.exact
      ? `Modeled burn dose so far — ${pct}% of the Fitzpatrick ${live.fitzpatrick} threshold.`
      : `Rounded burn estimate. Atmosphere or biological-response uncertainty prevents an exact display.`;
    medStr = `<span class="sun-session-med ${cls}" title="${escapeAttr(title)}">${qualifier}${pct}% modeled burn dose · ${escapeHTML(label)}</span>`;
  }
  const channelChips = live?.doses ? renderChannelChips(live.doses, sess) : '';
  let vitaminDStr = '';
  if (live?.doses?.vitamin_d > 0) {
    const fitz = live.fitzpatrick || sess.safety?.fitzpatrick || 'III';
    const uvi = live.atm?.uvIndex ?? sess.atmosphere?.uvIndex ?? null;
    const rotated = !!sess.bodyExposure?.rotatedSides;
    const bf = sess.bodyExposure?.fraction;
    const iu = (Number.isFinite(bf) && bf > 0 && typeof activeDeps.vitaminDIUPerSession === 'function')
      ? activeDeps.vitaminDIUPerSession(live.doses.vitamin_d, fitz, uvi, rotated, state.importedData?.genetics || null, bf)
      : activeDeps.vitaminDIU(live.doses.vitamin_d, fitz, uvi, rotated, state.importedData?.genetics || null);
    if (iu >= 50) {
      const iuLabel = iu >= 10000 ? (iu / 1000).toFixed(1).replace(/\.0$/, '') + 'k IU'
        : iu >= 1000 ? Math.round(iu / 100) * 100 + ' IU'
        : Math.round(iu / 10) * 10 + ' IU';
      vitaminDStr = `<span class="sun-session-vitd" title="Modeled vitamin-D potential from recorded UV. This is a comparison estimate, not a measured result or a reason to extend the session.">☀ ~${iuLabel}-equivalent vitamin-D potential</span>`;
    }
  }
  let heatStr = '';
  const tempC = live?.atm?.temperatureC ?? null;
  const elapsedMin = (Date.now() - sess.startedAt) / 60000;
  if (Number.isFinite(tempC) && tempC > 30 && elapsedMin > 30) {
    heatStr = `<span class="sun-session-heat" title="Ambient ${tempC.toFixed(0)}°C — heat-stress risk rises with duration. Drink water, take a 10-min shade break.">🌡 ${Math.round(tempC)}°C · take a break</span>`;
  }
  let retinalStr = '';
  if (sess.eyeExposure?.mode === 'direct' && Number.isFinite(live?.retinalUV) && live.retinalUV > 3) {
    const ruv = live.retinalUV;
    const ruvDisplay = ruv >= 10 ? Math.round(ruv) : ruv.toFixed(1);
    const cls = ruv >= 15 ? ' warn' : '';
    const label = ruv >= 30 ? 'at ICNIRP daily limit' : ruv >= 15 ? 'half the daily limit' : 'building';
    retinalStr = `<span class="sun-session-retinal${cls}" title="Actinic-weighted UV at the eye (≈ICNIRP S(λ)). Daily limit 30 J/m²; photokeratitis appears above ~50 J/m². At ${ruvDisplay} J/m² you're ${label}.">👁 ${ruvDisplay} J/m² eye UV</span>`;
  }
  return { elapsed, medStr, vitaminDStr, channelChips, heatStr, retinalStr };
}

let _lastChannelRefreshAt = 0;
const RETINAL_ALERT_GRACE_MS = 10 * 60 * 1000;
function _tickActiveCards() {
  // A sync conflict can temporarily leave more than one open record. The
  // store chooses the freshest deterministically; only that canonical session
  // may accrue live dose or receive Stop/pause alerts.
  const canonicalActive = activeDeps.getActiveSession();
  const sessions = canonicalActive ? [canonicalActive] : [];
  if (sessions.length === 0) {
    if (_activeTicker) { clearInterval(_activeTicker); _activeTicker = null; }
    return;
  }
  for (const sess of sessions) {
    const live = _getLiveState(sess.id);
    if (!sess.paused && (!live || !live.ratePerMin) && (!live || !live.pending)) _snapshotActiveRate(sess);
    if (live && live.ratePerMin && !live.pending && !sess.paused) {
      const last = live.snapshotAt || 0;
      if (Date.now() - last > 5 * 60 * 1000) {
        commitSunLiveSlice(sess);
        refreshSunLiveRate(sess);
      }
    }

    const liveDoses = liveDosesFor(sess);
    if (liveDoses && Number.isFinite(liveDoses.medFraction)) {
      const med = liveDoses.medFraction;
      const cur = _getLiveState(sess.id) || {};
      const confidence = _liveSafetyConfidence(liveDoses);
      if (med >= 1.0 && !cur.alertedOver) {
        setSunLiveState(sess.id, { alertedOver: true });
        showNotification(_jargonPrefix('med') + `${confidence.exact ? 'Modeled burn threshold reached.' : 'Modeled burn exposure may be at or above your threshold.'} Move to shade or cover up; do not wait for redness.`, 'error', 10000);
      } else if (med >= 0.7 && !cur.alerted70) {
        setSunLiveState(sess.id, { alerted70: true });
        showNotification(_jargonPrefix('med') + `${confidence.exact ? 'Modeled burn dose is building.' : 'The rounded burn estimate is getting high.'} Shade or cover up now; do not use the estimate as a safe-time allowance.`, 'warning', 8000);
      }
    }

    if (liveDoses && Number.isFinite(liveDoses.retinalUV) && sess.eyeExposure?.mode === 'direct') {
      const ruv = Math.max(liveDoses.retinalUV, Number(activeDeps.cumulativeOcularEffectiveDose8h?.()) || 0);
      const cur = _getLiveState(sess.id) || {};
      const elapsedMs = Date.now() - sess.startedAt;
      if (elapsedMs < RETINAL_ALERT_GRACE_MS) {
        setSunLiveState(sess.id, {
          alertedRetinal500: cur.alertedRetinal500 || ruv >= 15,
          alertedRetinalOver: cur.alertedRetinalOver || ruv >= 30,
        });
      } else if (ruv >= 30 && !cur.alertedRetinalOver) {
        setSunLiveState(sess.id, { alertedRetinalOver: true, alertedRetinal500: true });
        showNotification('Eye UV is high. Put on UV-blocking sunglasses or take a shade break.', 'warning', 8000);
      } else if (ruv >= 15 && !cur.alertedRetinal500) {
        setSunLiveState(sess.id, { alertedRetinal500: true });
        showNotification('Eye UV is building. Sunglasses or look-down breaks are a good idea.', 'warning', 6500);
      }
    }

    const tempC = liveDoses?.atm?.temperatureC ?? null;
    const elapsedMinNow = (Date.now() - sess.startedAt) / 60000;
    if (Number.isFinite(tempC) && tempC > 30 && elapsedMinNow > 30) {
      const cur = _getLiveState(sess.id) || {};
      if (!cur.alertedHeat) {
        setSunLiveState(sess.id, { alertedHeat: true });
        showNotification(`${tempC.toFixed(0)}°C ambient — drink water, take a 10-min shade break. Heat exhaustion ramps faster than UV burn at this temperature.`, 'warning', 8000);
      }
    }

    if (document.hidden) continue;
    if (state.currentView !== 'light'
        && state.currentView !== 'dashboard'
        && !document.querySelector('.modal-overlay [data-id], .modal-overlay [data-live-elapsed-for]')) {
      continue;
    }

    const elapsedFmt = _formatElapsed(Date.now() - sess.startedAt);
    document.querySelectorAll(`[data-live-elapsed-for="${CSS.escape(sess.id)}"]`).forEach(el => {
      el.textContent = elapsedFmt;
    });

    const cards = document.querySelectorAll(`[data-id="${CSS.escape(sess.id)}"]`);
    if (!cards.length) continue;
    const body = _renderActiveCardBody(sess);
    const patchChip = (el, html) => {
      if (!html) { el.remove(); return; }
      const tmpl = document.createElement('template');
      tmpl.innerHTML = html.trim();
      const fresh = tmpl.content.firstElementChild;
      if (!fresh) return;
      if (el.className !== fresh.className) el.className = fresh.className;
      const newTitle = fresh.getAttribute('title') || '';
      if (el.getAttribute('title') !== newTitle) el.setAttribute('title', newTitle);
      const newText = fresh.textContent;
      if (el.textContent !== newText) el.textContent = newText;
    };
    cards.forEach(card => {
      const durEl = card.querySelector('.sun-session-duration');
      if (durEl) durEl.textContent = body.elapsed;
      const medEl = card.querySelector('.sun-session-med');
      if (medEl) patchChip(medEl, body.medStr);
      else if (body.medStr) {
        const head = card.querySelector('.sun-session-head .sun-session-duration');
        if (head) head.insertAdjacentHTML('afterend', body.medStr);
      }
      const vitdEl = card.querySelector('.sun-session-vitd');
      if (vitdEl) patchChip(vitdEl, body.vitaminDStr);
      else if (body.vitaminDStr) {
        const after = card.querySelector('.sun-session-med') || card.querySelector('.sun-session-duration');
        if (after) after.insertAdjacentHTML('afterend', body.vitaminDStr);
      }
      const heatEl = card.querySelector('.sun-session-heat');
      if (heatEl) patchChip(heatEl, body.heatStr);
      else if (body.heatStr) {
        const after = card.querySelector('.sun-session-vitd') || card.querySelector('.sun-session-med') || card.querySelector('.sun-session-duration');
        if (after) after.insertAdjacentHTML('afterend', body.heatStr);
      }
      const retinalEl = card.querySelector('.sun-session-retinal');
      if (retinalEl) patchChip(retinalEl, body.retinalStr);
      else if (body.retinalStr) {
        const after = card.querySelector('.sun-session-heat') || card.querySelector('.sun-session-vitd') || card.querySelector('.sun-session-med') || card.querySelector('.sun-session-duration');
        if (after) after.insertAdjacentHTML('afterend', body.retinalStr);
      }
      const oldChips = card.querySelector('.sun-channel-chips');
      if (oldChips) oldChips.outerHTML = body.channelChips || '';
      else if (body.channelChips) card.insertAdjacentHTML('beforeend', body.channelChips);
    });
  }
  const now = Date.now();
  if (now - _lastChannelRefreshAt >= 5000) {
    _lastChannelRefreshAt = now;
    _refreshLiveChannelSurfaces();
  }
}

function _refreshLiveChannelSurfaces() {
  if (state.currentView === 'light') {
    try { activeDeps.renderLightChannelsLive(); } catch (e) {}
  }
  if (state.currentView === 'dashboard') {
    const strip = document.querySelector('.light-today-strip');
    if (strip) {
      const html = activeDeps.renderLightTodayStrip();
      if (html) {
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        const fresh = wrap.firstElementChild;
        if (fresh) {
          for (const attr of fresh.getAttributeNames()) {
            const newVal = fresh.getAttribute(attr);
            if (strip.getAttribute(attr) !== newVal) strip.setAttribute(attr, newVal);
          }
          const freshInner = fresh.innerHTML;
          if (strip.innerHTML !== freshInner) strip.innerHTML = freshInner;
        }
      }
    }
  }
}

export function ensureActiveTicker() {
  if (_activeTicker) return;
  _tickActiveCards();
  _activeTicker = setInterval(_tickActiveCards, 1000);
}

export function resumeActiveTickerIfNeeded() {
  if (activeDeps.getActiveSession()) ensureActiveTicker();
}

export async function hydrateSunSessionFromProfileCoords(id) {
  const coords = activeDeps.getSunCoords();
  if (!coords) return;
  const sess = activeDeps.getSessions().find(s => s.id === id);
  if (!sess) return;
  sess.location = {
    lat: coords.lat,
    lon: coords.lon,
    altitudeM: Number.isFinite(coords.altitudeM) ? coords.altitudeM : (sess.location?.altitudeM ?? 0),
    source: coords.source || sess.location?.source || null,
  };
  await activeDeps.saveImportedData();
  if (sess.doseIntegration?.method === 'live-time-integrated') return sess;
  await activeDeps.hydrateSession(id);
  return sess;
}

const _JARGON_DEFINITIONS = {
  med: 'MED = the smallest UV dose that turns your skin slightly pink (Fitzpatrick-tuned). ',
};
function _jargonPrefix(key) {
  if (typeof localStorage === 'undefined') return '';
  const def = _JARGON_DEFINITIONS[key];
  if (!def) return '';
  const flag = `gb_jargon_seen_${key}`;
  try {
    if (localStorage.getItem(flag)) return '';
    localStorage.setItem(flag, '1');
  } catch (e) { return ''; }
  return def;
}

export function resetSunActiveSessionState() {
  if (_activeTicker) { clearInterval(_activeTicker); _activeTicker = null; }
  _liveState.clear();
  _lastChannelRefreshAt = 0;
}
