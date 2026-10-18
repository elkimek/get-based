import type { ActiveSessionCalls, SessionOperations, AtmosphereOperations, LiveOperations, LiveDosesOperations, SunLiveDosesReader, SunLiveSegmentReader, ElapsedReader, StopSummaryReader } from '../types/sun-active-session.js';
export type { SunLiveDosesReader, SunLiveSegmentReader } from '../types/sun-active-session.js';
// sun-active-session.js — active sun-session UI and live dose ticker.
import { renderHTML } from './components/LightSessionPresentation.svelte.html.js';
import { projectStartSunSessionForm } from './light-session-presentation.js';
import { liveSessionReadouts } from './light-active-session-presentation.js';
import { state } from './state.js';
import { showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { BODY_REGIONS, projectBodySilhouette, renderBodySilhouette, bindBodySilhouette } from './sun-body-silhouette.js';
import { sunSessionInputKey, sunSessionExposure } from './sun-session-model.js';
import { renderChannelChips } from './sun-session-ui.js';
import { setSunChannelChipsExpanded } from './sun-session-actions.js';
import { activeElapsedMs as _activeElapsedMs, formatElapsed as _formatElapsed, plainStopSummary, _renderUVIPreflightBanner, _buildStartSessionToast } from './sun-active-session-format.js';

const activeDeps: ActiveSessionCalls = {
  getSessions: () => [],
  getActiveSession: () => null,
  startSession: async () => null,
  stopSession: async () => null,
  hydrateSession: async () => null,
  getSunCoords: () => null,
  saveImportedData: async () => {},
  applyAtmOverrides: (atm) => atm,
  refreshSurfaces: () => {},
  normalizePSMTier: (raw) => raw || 'none',
  photosensitiveMedScale: () => 1.0,
  openLightSetup: () => {},
  eyeModes: [], lensTints: [], postureOptions: [], surfaceOptions: [],
  fetchAtmosphere: async () => null, reconstructSpectrum: () => null,
  computeChannelDoses: () => ({}), erythemalSED: () => 0,
  ocularActinicUVdose: () => 0,
  fractionOfMED: () => 0, solarZenithAngle: () => 90,
  interpolateAtmosphere: () => null,
  vitaminDIU: channelAu => channelAu * 60,
  vitaminDIUPerSession: null,
  skinTypeToFitzpatrick: (skinType) => (String(skinType || '').match(/^(I{1,3}|IV|VI?)\b/) || [])[1] || null,
  renderLightChannelsLive: () => {}, renderLightTodayStrip: () => '',
};

export function configureSunActiveSession(deps: unknown = {}) { Object.assign(activeDeps, deps); }

export { POSTURE_MULTIPLIERS, SURFACE_ALBEDO } from './sun-session-model.js';
export { _formatElapsed };

export async function quickLogSunSession() {
  const active = activeDeps.getActiveSession();
  if (active) {
    const isCurrent = activeSessionOwnership(active);
    await activeDeps.stopSession(active.id);
    if (!isCurrent()) return false;
    await hydrateSunSessionFromProfileCoords(active.id);
    if (!isCurrent()) return false;
    const sess = activeDeps.getSessions().find(s => s.id === active.id);
    const dur = Math.round(sess?.durationMin || 0);
    const summary = _plainStopSummary(sess, dur);
    showNotification(summary, summary.includes('stop UV exposure') ? 'error' : 'success', 7000);
    activeDeps.refreshSurfaces();
    return true;
  }
  return openStartSunSessionDialog();
}

async function _fetchCurrentUVI() {
  const coords = activeDeps.getSunCoords();
  if (!coords) return null;
  try {
    const atm = await activeDeps.fetchAtmosphere({
      lat: coords.lat, lon: coords.lon, isoTime: new Date().toISOString(),
    });
    const overridden = activeDeps.applyAtmOverrides(atm);
    return overridden?.uvIndex ?? null;
  } catch (e) { return null; }
}

export async function openStartSunSessionDialog() {
  const configuredFitz = state.importedData?.sunDefaults?.fitzpatrick || null;
  if (!/^(I|II|III|IV|V|VI)$/.test(String(configuredFitz || ''))) {
    showNotification(
      'Confirm your Fitzpatrick skin type in Light setup before starting a session. It anchors the UV and skin-response estimates.',
      'info',
      7000,
    );
    activeDeps.openLightSetup();
    return false;
  }
  const startCoords = activeDeps.getSunCoords();
  if (!startCoords || startCoords.source === 'country-band') {
    showNotification(
      startCoords?.source === 'country-band'
        ? 'A country-level location is too broad for live UV safety guidance. Add a home postal area or use your privacy-rounded current location today before starting.'
        : 'A location is needed for live UV safety guidance. Add a home location or use your privacy-rounded current location today before starting.',
      'info',
      8000,
    );
    activeDeps.openLightSetup();
    return false;
  }
  const last = activeDeps.getSessions().filter(s => s.endedAt).slice(-1)[0];
  const lastRegions = new Set((last?.bodyExposure?.regions || []) as Iterable<string>);
  const fitz = configuredFitz;
  const psm = state.importedData?.sunDefaults?.photosensitiveMeds ?? 'unknown';
  const uviPromise = _fetchCurrentUVI();
  let latestPreflightUvi: number | null = null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = renderHTML({ kind: 'start', view: projectStartSunSessionForm({ lastUsed: last ?? null,
    eyeModes: activeDeps.eyeModes, lensTints: activeDeps.lensTints,
    postureOptions: activeDeps.postureOptions, surfaceOptions: activeDeps.surfaceOptions,
  }), silhouetteView: projectBodySilhouette(lastRegions) });
  const closeDialog = () => removeModalOverlay(overlay);
  overlay.querySelectorAll('[data-sun-start-close]').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });
  openAppendedModalOverlay(overlay, closeDialog);

  const selected = new Set(lastRegions);
  const slot = overlay.querySelector('#sun-start-silhouette-slot');
  const hint = overlay.querySelector('#sun-start-hint');
  const confirm = overlay.querySelector('#start-confirm');
  if (!(slot instanceof HTMLElement) || !(hint instanceof HTMLElement) || !(confirm instanceof HTMLElement)) { closeDialog(); return false; }
  const updateHint = () => {
    const fraction = Array.from(selected).reduce((sum, key) => {
      const r = BODY_REGIONS.find(b => b.key === key);
      return sum + (r?.fraction || 0);
    }, 0);
    if (selected.size === 0) {
      hint.textContent = 'Tap any body region to toggle whether it\'s uncovered.';
    } else {
      const labels = Array.from(selected).map(k => BODY_REGIONS.find(b => b.key === k)?.label || k).join(', ');
      const pctLabel = fraction >= 0.94 ? 'full body' : `${(fraction * 100).toFixed(0)}% of skin`;
      hint.textContent = `${selected.size} region${selected.size === 1 ? '' : 's'} exposed (${pctLabel}) — ${labels}`;
    }
  };
  overlay.querySelector('#sun-start-clear')?.addEventListener('click', () => {
    selected.clear();
    slot.innerHTML = renderBodySilhouette(selected);
    updateHint();
  });
  bindBodySilhouette(slot, selected, updateHint);
  updateHint();

  uviPromise.then((uvi) => {
    if (!Number.isFinite(uvi)) return;
    latestPreflightUvi = uvi as number;
    const banner = overlay.querySelector('#sun-start-uvi-banner');
    if (!(banner instanceof HTMLElement)) return;
    const html = _renderUVIPreflightBanner(uvi as number, fitz as string, psm as string, !configuredFitz, activeDeps.photosensitiveMedScale);
    if (html) {
      banner.innerHTML = html;
      banner.hidden = false;
    }
  }).catch(() => {});

  confirm.addEventListener('click', async (): Promise<{} | null | void> => {
    const eyeMode = (overlay.querySelector('#start-eye-mode') as HTMLSelectElement | null)?.value || 'direct';
    const lensTint = (overlay.querySelector('#start-lens-tint') as HTMLSelectElement | null)?.value || 'clear';
    const glassBetween = !!(overlay.querySelector('#start-glass') as HTMLInputElement | null)?.checked;
    const posture = (overlay.querySelector('#start-posture') as HTMLSelectElement | null)?.value || 'standing';
    const surfaceAlbedo = (overlay.querySelector('#start-surface') as HTMLSelectElement | null)?.value || 'grass';
    const modeledEyeMode = glassBetween && eyeMode === 'direct' ? 'glass-window' : eyeMode;
    const regions = Array.from(selected);
    if (regions.length === 0) {
      hint.textContent = 'Tap at least one region before starting — what part of you is uncovered?';
      hint.classList.add('sun-silhouette-hint-error');
      setTimeout(() => hint.classList.remove('sun-silhouette-hint-error'), 2500);
      return;
    }
    const id = await activeDeps.startSession({ regions, eyeMode: modeledEyeMode, lensTint, glassBetween, posture, surfaceAlbedo, rotatedSides: false, location: startCoords });
    closeDialog();
    showNotification(_buildStartSessionToast({
      regionCount: regions.length,
      uvi: latestPreflightUvi,
      psmTier: state.importedData?.sunDefaults?.photosensitiveMeds,
      eyeMode: modeledEyeMode,
    }, activeDeps.normalizePSMTier as (raw: unknown) => string), 'success', 4500);
    activeDeps.refreshSurfaces();
    ensureActiveTicker();
    return id as {} | null | void;
  });
  return true;
}

function _plainStopSummary(session: SessionOperations | null | undefined, durationMin: number) {
  return (plainStopSummary as StopSummaryReader)(session, durationMin, {
    vitaminDIU: activeDeps.vitaminDIU,
    vitaminDIUPerSession: activeDeps.vitaminDIUPerSession,
    genetics: state.importedData?.genetics,
  });
}

let _activeTicker: ReturnType<typeof setInterval> | null = null;
const _liveState = new Map<unknown, LiveOperations>();
const _snapshotRequests = new Map<unknown, {isCurrent: () => boolean}>();
let _activeGeneration = 0;

function activeSessionOwnership(sess: SessionOperations) {
  const data = state.importedData;
  const profile = state.currentProfile;
  const generation = _activeGeneration;
  return () => generation === _activeGeneration
    && state.importedData === data && state.currentProfile === profile
    && activeDeps.getSessions().includes(sess);
}

function _getLiveState(id: unknown) {
  const live = _liveState.get(id);
  const request = _snapshotRequests.get(id);
  if ((live?.ownsSession && !live.ownsSession()) || (request && !request.isCurrent())) {
    clearSunLiveState(id);
    return null;
  }
  return live || null;
}
export function setSunLiveState(id: unknown, patch: unknown) {
  const cur = _liveState.get(id) || {};
  if ('ratePerMin' in (patch as object)) {
    _snapshotRequests.delete(id);
    cur.pending = false;
  }
  _liveState.set(id, Object.assign(cur, patch));
}
export function clearSunLiveState(id: unknown) { _liveState.delete(id); _snapshotRequests.delete(id); }

// Persisted slices are the source of truth after a client closes. Recovery
// restores their totals, never reintegrates them or guesses a missing pause.
function recoveredSunSlices(sess: SessionOperations): LiveOperations {
  const recovered: LiveOperations = { committedDoses: {}, committedSED: 0, committedRetinalUV: 0 };
  for (const raw of Array.isArray(sess.exposureSegments) ? sess.exposureSegments : []) {
    if (!raw || typeof raw !== 'object') continue;
    const segment = raw as { durationMin?: number; endedAt?: number; doses?: Record<string, number>; sed?: number; ocularActinicUV?: number; retinalUV?: number; atmosphere?: AtmosphereOperations };
    if (!(Number(segment.durationMin) > 0)) continue;
    for (const [key, value] of Object.entries(segment.doses || {})) {
      if (Number.isFinite(value)) recovered.committedDoses![key] = (recovered.committedDoses![key] || 0) + value;
    }
    recovered.committedSED! += Number(segment.sed) || 0;
    recovered.committedRetinalUV! += Number(segment.ocularActinicUV ?? segment.retinalUV) || 0;
    if (segment.atmosphere) recovered.atm = segment.atmosphere;
    if (Number.isFinite(segment.endedAt)) recovered.snapshotAt = Math.max(recovered.snapshotAt || sess.startedAt, segment.endedAt!);
  }
  return recovered;
}

function liveSkinInputs() {
  const skin = state.importedData?.lightCircadian?.skinType;
  const configured = state.importedData?.sunDefaults?.fitzpatrick || (skin && activeDeps.skinTypeToFitzpatrick(skin)) || null;
  const psmTier = activeDeps.normalizePSMTier(state.importedData?.sunDefaults?.photosensitiveMeds);
  return { fitzpatrick: configured || 'I', fitzpatrickAssumed: !configured, psmTier, medScale: activeDeps.photosensitiveMedScale(psmTier) };
}

function nextSunSliceStart(sess: SessionOperations, existing: LiveOperations, recovered: LiveOperations, now: number) {
  const resumed = Number.isFinite(sess.resumedAt) && sess.resumedAt! >= sess.startedAt && sess.resumedAt! <= now ? sess.resumedAt! : null;
  if (existing.committedDoses) {
    return resumed !== null && resumed > (existing.snapshotAt || 0) ? resumed : now;
  }
  // Old records lack the last resume timestamp. Accruing from now preserves
  // saved doses without assigning an unknown paused interval to UV exposure.
  if (resumed === null && (sess.accumulatedPausedMs || 0) > 0) return now;
  return Math.min(now, Math.max(sess.startedAt, resumed || sess.startedAt, recovered.snapshotAt || sess.startedAt));
}

async function _snapshotActiveRate(sess: SessionOperations) {
  const cur = _getLiveState(sess.id);
  if (cur && cur.ratePerMin) return cur;
  if (cur && cur.pending) return null;
  const ownsSession = activeSessionOwnership(sess);
  const inputKey = sunSessionInputKey(sess, state.importedData);
  const request = { isCurrent: () => ownsSession() && !sess.endedAt && !sess.paused
    && sunSessionInputKey(sess, state.importedData) === inputKey };
  _snapshotRequests.set(sess.id, request);
  const isCurrent = () => request.isCurrent() && _snapshotRequests.get(sess.id) === request;
  setSunLiveState(sess.id, { pending: true, ownsSession });
  try {
    const {
      fractionOfMED,
      fetchAtmosphere,
    } = activeDeps;
    const coords = sess.location || activeDeps.getSunCoords();
    if (!coords) return null;
    const now = new Date();
    let atm = await fetchAtmosphere({ lat: coords.lat, lon: coords.lon, isoTime: now.toISOString() });
    if (!isCurrent()) return null;
    atm = activeDeps.applyAtmOverrides(atm);
    if (!atm) return null;
    const priorAtm = _getLiveState(sess.id)?.atm;
    if (priorAtm && Number.isFinite(priorAtm.uvIndex) && Number.isFinite(atm?.uvIndex)) {
      const primarySrc = (s: unknown) => String(s || '').split('+')[0];
      const sourcesDiffer = primarySrc(priorAtm.source) !== primarySrc(atm.source);
      const priorConf = priorAtm.confidence ?? 0.6;
      const newConf = atm.confidence ?? 0.6;
      const downgraded = newConf < priorConf - 0.15;
      const uviDelta = Math.abs(atm.uvIndex! - priorAtm.uvIndex!);
      const largeJump = priorAtm.uvIndex! > 0 && uviDelta > priorAtm.uvIndex! * 0.25;
      if (sourcesDiffer && downgraded && largeJump) {
        atm = { ...priorAtm, _sourceFlipBlocked: { from: priorAtm.source, to: atm.source, attemptedUvi: atm.uvIndex, at: Date.now() } };
      }
    }
    const snapshot = _rateAtInstant(sess, now.getTime(), atm, coords);
    if (!snapshot) return null;
    const { rate: ratePerMin, sedPerMin, zenith } = snapshot;
    const skinInputs = liveSkinInputs();
    const existing = _getLiveState(sess.id) || {};
    const recovered = recoveredSunSlices(sess);
    const sliceStart = nextSunSliceStart(sess, existing, recovered, Date.now());
    setSunLiveState(sess.id, {
      ratePerMin, sedPerMin, ...skinInputs, atm, zenith,
      baselineZenith: existing.baselineZenith ?? zenith,
      snapshotAt: sliceStart,
      committedDoses: existing.committedDoses || recovered.committedDoses,
      committedSED: existing.committedSED ?? recovered.committedSED,
      committedRetinalUV: existing.committedRetinalUV ?? recovered.committedRetinalUV,
      fractionOfMEDFn: fractionOfMED,
      pending: false,
    });
    return _getLiveState(sess.id);
  } catch (e) {
    if (isCurrent()) globalThis.console?.warn?.('snapshotActiveRate failed', e);
    return null;
  } finally {
    // Never let an old rejection clear the replacement request's pending flag.
    if (_snapshotRequests.get(sess.id) === request) {
      _snapshotRequests.delete(sess.id);
      const live = _getLiveState(sess.id);
      if (live) live.pending = false;
    }
  }
}

function _rateAtInstant(sess: SessionOperations, instantMs: number, snapshotAtmosphere: AtmosphereOperations | null = null, coords = sess.location) {
  const atmosphere = snapshotAtmosphere || _getLiveState(sess?.id)?.atm;
  if (!atmosphere || !coords) return null;
  const {
    reconstructSpectrum,
    computeChannelDoses,
    erythemalSED,
    solarZenithAngle,
    interpolateAtmosphere,
  } = activeDeps;

  const when = new Date(instantMs);
  const isoTime = when.toISOString();
  let atmAtT = atmosphere;
  if (!snapshotAtmosphere && interpolateAtmosphere) {
    const interp = interpolateAtmosphere(atmosphere, isoTime);
    if (interp) {
      atmAtT = {
        ...atmosphere,
        uvIndex: interp.uvIndex ?? atmosphere.uvIndex,
        cloudCover: interp.cloudCover ?? atmosphere.cloudCover,
        temperatureC: interp.temperatureC ?? atmosphere.temperatureC,
      };
    }
  }
  atmAtT = activeDeps.applyAtmOverrides(atmAtT)!;

  const exposure = sunSessionExposure(sess);
  const zenith = solarZenithAngle(when, coords.lat, coords.lon);
  const spectrum = reconstructSpectrum({
    zenithDeg: zenith,
    ozoneDU: atmAtT.ozoneDU ?? 300,
    altitudeM: coords.altitudeM ?? 0,
    cloudCover: (atmAtT.cloudCover ?? 0) / 100,
    aod: atmAtT?.airQuality?.aod ?? null,
    targetUVI: atmAtT.uvIndex ?? null,
  });
  const rate = computeChannelDoses({
    spectrum,
    durationMin: 1,
    ...exposure,
  });
  const sedPerMin = erythemalSED({
    spectrum,
    durationMin: 1,
    ...exposure,
  });
  const retinalUVPerMin = activeDeps.ocularActinicUVdose({
    spectrum,
    eyeExposure: { ...(exposure.eyeExposure || {}), durationSec: 60 },
    zenithDeg: zenith,
    glassBetween: exposure.bodyModifiers.glassBetween,
  });
  return { rate, sedPerMin, retinalUVPerMin, zenith };
}

function _integrateSlice(sess: SessionOperations, startMs: number, endMs: number) {
  const durationMin = Math.max(0, (endMs - startMs) / 60000);
  if (durationMin <= 0) return { doses: {}, sed: 0, retinalUV: 0 };
  const midMs = (startMs + endMs) / 2;
  const r0 = _rateAtInstant(sess, startMs);
  const r1 = _rateAtInstant(sess, midMs);
  const r2 = _rateAtInstant(sess, endMs);
  if (!r0 || !r1 || !r2) return { doses: {}, sed: 0, retinalUV: 0 };
  const doses: Record<string, number> = {};
  for (const k of Object.keys(r1.rate)) {
    const a = r0.rate[k] ?? 0;
    const m = r1.rate[k] ?? 0;
    const b = r2.rate[k] ?? 0;
    doses[k] = durationMin * (a + 4 * m + b) / 6;
  }
  const sed = durationMin * (r0.sedPerMin + 4 * r1.sedPerMin + r2.sedPerMin) / 6;
  const retinalUV = durationMin * (r0.retinalUVPerMin + 4 * r1.retinalUVPerMin + r2.retinalUVPerMin) / 6;
  return { doses, sed, retinalUV };
}

export function commitSunLiveSlice(sess: unknown): SunLiveSegmentReader | null {
  const live = _getLiveState((sess as SessionOperations)?.id);
  if (!live || !live.ratePerMin || !live.snapshotAt) return null;
  const sliceStart = live.snapshotAt;
  const sliceEnd = Date.now();
  if (sliceEnd <= sliceStart) return null;
  const { doses, sed, retinalUV } = _integrateSlice((sess as SessionOperations), sliceStart, sliceEnd);
  const committedDoses = { ...(live.committedDoses || {}) };
  for (const [k, v] of Object.entries(doses)) {
    committedDoses[k] = (committedDoses[k] || 0) + v;
  }
  const committedSED = (live.committedSED || 0) + sed;
  const committedRetinalUV = (live.committedRetinalUV || 0) + retinalUV;
  const segment = {
    startedAt: sliceStart,
    endedAt: sliceEnd,
    durationMin: (sliceEnd - sliceStart) / 60000,
    doses: { ...doses },
    sed,
    ocularActinicUV: retinalUV,
    bodyExposure: { ...((sess as SessionOperations).bodyExposure || {}), regions: [...((sess as SessionOperations).bodyExposure?.regions || [])] },
    eyeExposure: { ...((sess as SessionOperations).eyeExposure || {}) },
    posture: (sess as SessionOperations).posture || 'standing',
    surfaceAlbedo: (sess as SessionOperations).surfaceAlbedo || 'grass',
    atmosphere: live.atm ? { ...live.atm } : null,
    zenith: live.zenith ?? null,
  };
  if (!Array.isArray((sess as SessionOperations).exposureSegments)) (sess as SessionOperations).exposureSegments = [];
  (sess as SessionOperations).exposureSegments!.push(segment);
  setSunLiveState((sess as SessionOperations).id, { committedDoses, committedSED, committedRetinalUV, snapshotAt: sliceEnd });
  return segment;
}

export function liveDosesFor(sess: unknown): SunLiveDosesReader | null {
  const session = sess as SessionOperations;
  let live = _getLiveState(session?.id);
  if (!live && session?.paused && session.exposureSegments?.length) {
    setSunLiveState(session.id, { ...recoveredSunSlices(session), ...liveSkinInputs(),
      fractionOfMEDFn: activeDeps.fractionOfMED, ownsSession: activeSessionOwnership(session) });
    live = _getLiveState(session.id);
  }
  if (!live) return null;
  if (session?.paused) {
    const committed = live.committedDoses || {};
    const sed = live.committedSED || 0;
    const retinalUV = live.committedRetinalUV || 0;
    const medFraction = live.fractionOfMEDFn ? live.fractionOfMEDFn({ sed, fitzpatrick: live.fitzpatrick as string, medScale: live.medScale ?? 1.0 }) : 0;
    return { doses: { ...committed }, sed, retinalUV, medFraction, fitzpatrick: live.fitzpatrick as string, fitzpatrickAssumed: live.fitzpatrickAssumed, psmTier: live.psmTier, atm: live.atm, paused: true };
  }
  if (!live.ratePerMin) return null;
  const sliceStart = live.snapshotAt || (sess as SessionOperations).startedAt;
  const now = Date.now();
  const { doses: sliceDoses, sed: sliceSed, retinalUV: sliceRetinalUV } = _integrateSlice((sess as SessionOperations), sliceStart, now);
  const committed = live.committedDoses || {};
  const doses = { ...committed };
  for (const [k, v] of Object.entries(sliceDoses)) {
    doses[k] = (doses[k] || 0) + v;
  }
  const sed = (live.committedSED || 0) + sliceSed;
  const retinalUV = (live.committedRetinalUV || 0) + sliceRetinalUV;
  const medFraction = live.fractionOfMEDFn ? live.fractionOfMEDFn({ sed, fitzpatrick: live.fitzpatrick as string, medScale: live.medScale ?? 1.0 }) : 0;
  return { doses, sed, retinalUV, medFraction, fitzpatrick: live.fitzpatrick as string, fitzpatrickAssumed: live.fitzpatrickAssumed, psmTier: live.psmTier, atm: live.atm };
}

function _renderActiveCardBody(sess: SessionOperations) {
  const elapsed = _formatElapsed((_activeElapsedMs as ElapsedReader)(sess));
  const live = liveDosesFor(sess) as LiveDosesOperations | null;
  const channelChips = live?.doses ? renderChannelChips(live.doses, sess) : '';
  let vitaminD: { iu: number; ratePerMin: number } | null = null;
  if (live && live.doses?.vitamin_d! > 0) {
    const elapsedMin = (_activeElapsedMs as ElapsedReader)(sess) / 60000;
    const fitz = live.fitzpatrick || sess.safety?.fitzpatrick || 'I';
    const uvi = live.atm?.uvIndex ?? sess.atmosphere?.uvIndex ?? null;
    const rotated = !!sess.bodyExposure?.rotatedSides;
    const bf = sess.bodyExposure?.fraction as number;
    const iu = (Number.isFinite(bf) && bf > 0 && typeof activeDeps.vitaminDIUPerSession === 'function')
      ? activeDeps.vitaminDIUPerSession(live.doses.vitamin_d!, fitz, uvi, rotated, state.importedData?.genetics || null, bf)
      : activeDeps.vitaminDIU(live.doses.vitamin_d!, fitz, uvi, rotated, state.importedData?.genetics || null);
    vitaminD = { iu, ratePerMin: elapsedMin > 0 ? iu / elapsedMin : 0 };
  }
  const elapsedMin = (_activeElapsedMs as ElapsedReader)(sess) / 60000;
  const liveReadouts = renderHTML({ kind: 'live-readouts', readouts: liveSessionReadouts(live, vitaminD, elapsedMin) });
  return { elapsed, liveReadouts, channelChips };
}

let _lastChannelRefreshAt = 0;
function _tickActiveCards() {
  const sessions = activeDeps.getSessions().filter(s => !s.endedAt);
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
        setSunLiveState(sess.id, { ratePerMin: null });
      }
    }

    const liveDoses = liveDosesFor(sess) as LiveDosesOperations | null;
    if (liveDoses && Number.isFinite(liveDoses.medFraction)) {
      const med = liveDoses.medFraction;
      const cur = _getLiveState(sess.id) || {};
      if (med >= 1.0 && !cur.alertedOver) {
        setSunLiveState(sess.id, { alertedOver: true });
        showNotification(_jargonPrefix('med') + 'The base skin-type MED reference is reached. Stop UV exposure and move to shade or cover up; this model is not a personal threshold.', 'error', 10000);
      } else if (med >= 0.7 && !cur.alerted70) {
        setSunLiveState(sess.id, { alerted70: true });
        showNotification(_jargonPrefix('med') + '70% of the base skin-type MED reference. Move to shade or cover up, and stop before warmth, tenderness, or pinkness.', 'warning', 8000);
      }
    }

    if (liveDoses && Number.isFinite(liveDoses.retinalUV)) {
      const ruv = liveDoses.retinalUV;
      const cur = _getLiveState(sess.id) || {};
      if (ruv >= 30 && !cur.alertedRetinalOver) {
        setSunLiveState(sess.id, { alertedRetinalOver: true, alertedRetinal500: true });
        showNotification('Ocular actinic UV reached the ICNIRP 8-hour reference. Use UV-blocking sunglasses or move to shade. Never look at the sun.', 'warning', 8000);
      } else if (ruv >= 15 && !cur.alertedRetinal500) {
        setSunLiveState(sess.id, { alertedRetinal500: true });
        showNotification('Ocular actinic UV is building. Use UV-blocking sunglasses or take a shade break; never look at the sun.', 'warning', 6500);
      }
    }

    const tempC = (liveDoses?.atm?.temperatureC ?? null) as number;
    const elapsedMinNow = (_activeElapsedMs as ElapsedReader)(sess) / 60000;
    if (Number.isFinite(tempC) && tempC > 30 && elapsedMinNow > 30) {
      const cur = _getLiveState(sess.id) || {};
      if (!cur.alertedHeat) {
        setSunLiveState(sess.id, { alertedHeat: true });
        showNotification(`${tempC.toFixed(0)}°C ambient — heat risk is separate from UV dose. Move to a cool or shaded place, hydrate, and stop if you feel unwell.`, 'warning', 8000);
      }
    }

    if (document.hidden) continue;
    if (state.currentView !== 'light'
        && state.currentView !== 'dashboard'
        && !document.querySelector('.modal-overlay [data-id], .modal-overlay [data-live-elapsed-for]')) {
      continue;
    }

    const elapsedFmt = _formatElapsed((_activeElapsedMs as ElapsedReader)(sess));
    document.querySelectorAll(`[data-live-elapsed-for="${CSS.escape(sess.id)}"]`).forEach(el => {
      el.textContent = elapsedFmt;
    });

    const cards = document.querySelectorAll(`[data-id="${CSS.escape(sess.id)}"]`);
    if (!cards.length) continue;
    const body = _renderActiveCardBody(sess);
    cards.forEach(card => {
      const durEl = card.querySelector('.sun-session-duration');
      if (durEl) durEl.textContent = body.elapsed;
      const legacyHeadReadouts = card.querySelectorAll('.sun-session-head > .sun-session-med, .sun-session-head > .sun-session-vitd, .sun-session-head > .sun-session-heat, .sun-session-head > .sun-session-retinal');
      legacyHeadReadouts.forEach(el => el.remove());
      let liveReadoutsEl = card.querySelector('.sun-session-live-readouts');
      if (!liveReadoutsEl) {
        const readoutAnchor = card.querySelector('.sun-session-meta') || card.querySelector('.sun-session-head');
        if (readoutAnchor) readoutAnchor.insertAdjacentHTML('afterend', body.liveReadouts);
      } else {
        const wrap = document.createElement('div');
        wrap.innerHTML = body.liveReadouts;
        const fresh = wrap.firstElementChild;
        if (fresh) {
          for (const attr of fresh.getAttributeNames()) {
            const value = fresh.getAttribute(attr);
            if (value !== null && liveReadoutsEl.getAttribute(attr) !== value) liveReadoutsEl.setAttribute(attr, value);
          }
          if (liveReadoutsEl.innerHTML !== fresh.innerHTML) liveReadoutsEl.innerHTML = fresh.innerHTML;
        }
      }
      const oldChips = card.querySelector('.sun-channel-chips');
      if (oldChips) {
        const wasExpanded = oldChips.classList.contains('sun-chips-expanded');
        const focused = oldChips.contains(document.activeElement) ? document.activeElement : null;
        const focusedChannel = focused?.getAttribute('data-channel');
        const focusedToggle = focused?.getAttribute('data-sun-session-action') === 'toggle-chips';
        oldChips.outerHTML = body.channelChips || '';
        const freshChips = card.querySelector('.sun-channel-chips');
        if (freshChips) {
          setSunChannelChipsExpanded(freshChips, wasExpanded);
          if (focusedChannel || focusedToggle) {
            const selector = focusedToggle ? '[data-sun-session-action="toggle-chips"]' : `[data-channel="${CSS.escape(focusedChannel!)}"]`;
            freshChips.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
          }
        }
      }
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
            if (newVal !== null && strip.getAttribute(attr) !== newVal) strip.setAttribute(attr, newVal);
          }
          const freshInner = fresh.innerHTML;
          if (strip.innerHTML !== freshInner) strip.innerHTML = freshInner;
        }
      }
    }
  }
}

export function ensureActiveTicker() {
  if (_activeTicker || !activeDeps.getActiveSession()) return;
  _tickActiveCards();
  _activeTicker = setInterval(_tickActiveCards, 1000);
}

export function resumeActiveTickerIfNeeded() {
  if (activeDeps.getActiveSession()) ensureActiveTicker();
}

export async function hydrateSunSessionFromProfileCoords(id: unknown) {
  const coords = activeDeps.getSunCoords();
  if (!coords) return;
  const sess = activeDeps.getSessions().find(s => s.id === id);
  if (!sess) return;
  const isCurrent = activeSessionOwnership(sess);
  sess.location = { lat: coords.lat, lon: coords.lon, altitudeM: 0, source: coords.source };
  await activeDeps.saveImportedData();
  if (!isCurrent()) return;
  await activeDeps.hydrateSession(id);
}

const _JARGON_DEFINITIONS: Record<string, unknown> = { med: 'MED = the smallest UV dose that turns your skin slightly pink (Fitzpatrick-tuned). ' };
function _jargonPrefix(key: string) {
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
  _activeGeneration++;
  _snapshotRequests.clear();
  if (_activeTicker) { clearInterval(_activeTicker); _activeTicker = null; }
  _liveState.clear();
  _lastChannelRefreshAt = 0;
}
