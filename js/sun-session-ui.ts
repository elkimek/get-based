// sun-session-ui.js — UI rendering/editing for saved sun sessions.

import type { SessionReader, SessionCalls, DoseReader, OptionOperations } from '../types/sun-session-ui.js';

import { renderHTML } from './components/LightSessionPresentation.svelte.html.js';
import { detailField, detailChannel, sessionCalculationNotice, type SessionDetailField } from './light-session-detail-presentation.js';
import { activeSunSessionView, sessionChannelChip, type SessionChannelChip } from './light-active-session-presentation.js';
import { projectCompletedSunSession } from './light-session-presentation.js';

import { state } from './state.js';
import { bindDetachedModalSyncRefresh, formatDate, showNotification, showPromptDialog, showConfirmDialog } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { BODY_REGIONS } from './sun-body-silhouette.js';
import { installSunSessionActionDelegates } from './sun-session-actions.js';
import { bindPastSessionDurationHint, bindPastSessionRegionPicker, renderPastSessionLogModal } from './sun-session-log-modal.js';

const uiDeps: SessionCalls = {
  getSessions: () => [],
  deleteSession: async () => false,
  updateSession: async () => null,
  logCompletedSession: async () => null,
  hydrateSession: async () => null,
  getSunCoords: () => null,
  refreshSurfaces: () => {},
  summarizeBodyExposure: () => 'Body unset',
  formatElapsed: () => '0:00',
  exposurePresets: [],
  eyeModes: [],
  lensTints: [],
  postureOptions: [],
  surfaceOptions: [],
  channelDisplay: {},
  channelTier: () => 0,
  tierLabel: () => 'none',
  formatChannelUnit: () => '',
  tooShortForChannelVerdictMin: 2,
  quickLogSunSession: () => {},
  pauseSunSession: () => {},
  resumeSunSession: () => {},
  flipSidesMidSession: () => {},
  changeCoverageMidSession: () => {},
  applySunscreenMidSession: () => {},
  setOzoneOverrideMidSession: () => {},
  forgotStopPrompt: () => {},
  openChannelOnLightPage: () => {},
  getSessionAIDetailView: () => null,
  navigate: () => {},
  openLightSetup: () => {},
  solarZenithAngle: null, reconstructSpectrum: null,
  geneticVitaminDMultiplier: () => ({ mult: 1.0, contributors: [] }),
  vitaminDIU: null, vitaminDIUPerSession: null,
  pbmJoulesPerCm2: null, circadianMelanopicLux: null,
};

const sunSessionDelegateActions = {
  openSunSessionDetail,
  deleteSunSession,
  editSunSessionDuration,
  retrySunSessionCalculation,
  quickLogSunSession: () => uiDeps.quickLogSunSession(),
  pauseSunSession: (id: unknown) => uiDeps.pauseSunSession(id),
  resumeSunSession: (id: unknown) => uiDeps.resumeSunSession(id),
  flipSidesMidSession: (id: unknown) => uiDeps.flipSidesMidSession(id),
  changeCoverageMidSession: (id: unknown) => uiDeps.changeCoverageMidSession(id),
  applySunscreenMidSession: (id: unknown) => uiDeps.applySunscreenMidSession(id),
  setOzoneOverrideMidSession: () => uiDeps.setOzoneOverrideMidSession(),
  forgotStopPrompt: (id: unknown) => uiDeps.forgotStopPrompt(id),
  openChannelOnLightPage: (channel: string) => uiDeps.openChannelOnLightPage(channel),
};

if (typeof document !== 'undefined') {
  installSunSessionActionDelegates(sunSessionDelegateActions);
}

export function configureSunSessionUI(deps: unknown = {}) {
  Object.assign(uiDeps, deps);
}

function refreshLightView() {
  if (state.currentView === 'light') uiDeps.navigate('light');
}

// ─── UI: Sessions list (used by the dedicated Light & Sun page) ────────

function resolvedSessionDurationMin(sess: SessionReader | null | undefined) {
  const stored = sess?.durationMin == null ? Number.NaN : Number(sess.durationMin);
  if (Number.isFinite(stored) && stored >= 0) return stored;
  const start = Number(sess?.startedAt);
  const end = Number(sess?.endedAt);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return (end - start) / 60000;
  }
  return null;
}

function localSessionStamp(timestamp: unknown) {
  const date = new Date(timestamp as number);
  if (Number.isNaN(date.getTime())) return { date: 'Date unavailable', time: '' };
  const localKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    date: formatDate(localKey),
    time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  };
}

function getCompletedSunSessionRowView(sess: SessionReader) {
  const stamp = localSessionStamp(sess.startedAt);
  const durationMin = resolvedSessionDurationMin(sess);
  const dur = durationMin != null ? `${Math.round(durationMin)} min` : 'duration unavailable';
  const vitaminD = sess.doses?.vitamin_d
    ? _sessionChipValue('vitamin_d', sess.doses.vitamin_d, sess)
    : '';
  return { kind: 'row' as const, view: projectCompletedSunSession(sess, stamp, dur, vitaminD) };
}

export function getSunSessionRowView(sess: SessionReader) {
  const isActive = !sess.endedAt;
  if (!isActive) return getCompletedSunSessionRowView(sess);
  const eyeLabels = Object.fromEntries(uiDeps.eyeModes.map(e => [e.key, e.label]));
  const start = localSessionStamp(sess.startedAt).date;
  const now = Date.now();
  const currentPauseMs = sess.paused && Number.isFinite(sess.pausedAt) ? Math.max(0, now - (sess.pausedAt as number)) : 0;
  const activeElapsedMs = Math.max(0, now - (sess.startedAt as number) - ((sess.accumulatedPausedMs || 0) as number) - currentPauseMs);
  const elapsed = uiDeps.formatElapsed(activeElapsedMs);
  const chips = sessionChannelChipViews(sess.doses, sess);
  return { kind: 'active' as const, view: activeSunSessionView(sess, start, elapsed,
    uiDeps.summarizeBodyExposure(sess), eyeLabels[sess.eyeExposure?.mode as string], chips, now) };
}
export function renderSunSessionRow(sess: SessionReader){return renderHTML(getSunSessionRowView(sess));}

export function renderSessionsList() {
  const sessions = [...uiDeps.getSessions()].sort((a, b) => ((b.startedAt || 0) as number) - ((a.startedAt || 0) as number));
  return renderHTML({ kind: 'history', rows: collectSunSessionViews(sessions), total: sessions.length,
    sunCount: sessions.length, deviceCount: 0, modal: false, showMore: false, emptySun: true });
}

// ─── UI: per-session detail modal ──────────────────────────────────────
export function openSunSessionDetail(id: unknown) {
  const sess = uiDeps.getSessions().find(s => s.id === id);
  if (!sess) return;
  const start = new Date(sess.startedAt as number);
  const end = sess.endedAt ? new Date(sess.endedAt as number) : null;
  const fmtTime = (d: Date | null) => d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';
  // Modal title date: full month + day + year — avoids the "Sun session
  // — Sun, May 3" stutter and gives a clear timestamp at a glance.
  const fmtTitleDate = (d: Date | null) => d ? d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  const durationMin = resolvedSessionDurationMin(sess);
  const dur = durationMin != null
    ? `${Math.round(durationMin)} min`
    : (end ? 'duration unavailable' : 'in progress');
  // Combined "When" string — a single cell beats three near-redundant ones
  // (Started / Ended / Duration). Renders "10:07–10:32 · 25 min" or
  // "10:07 · started 5 min ago" for in-progress sessions.
  const whenStr = end
    ? `${fmtTime(start)}–${fmtTime(end)} · ${dur}`
    : `${fmtTime(start)} · ${dur}`;

  const presetLabels = Object.fromEntries(uiDeps.exposurePresets.map(p => [p.key, p.label]));
  const eyeLabels = Object.fromEntries(uiDeps.eyeModes.map(e => [e.key, e.label]));
  const lensLabels = Object.fromEntries(uiDeps.lensTints.map(l => [l.key, l.label]));

  // Body exposure summary
  const regions = (sess.bodyExposure?.regions || []) as unknown[];
  const regionLabels = regions.length
    ? regions.map(k => BODY_REGIONS.find(r => r.key === k)?.label || k).join(', ')
    : (sess.bodyExposure?.preset === 'covered' ? 'No skin exposed' : (presetLabels[sess.bodyExposure?.preset as string] || 'Body unset'));
  const fractionPct = Math.round(((sess.bodyExposure?.fraction || 0) as number) * 100);

  // Burn-risk
  const med = sess.safety?.medFraction as number | null | undefined;
  let medStr = '—';
  if (med != null) {
    const pct = Math.round(med * 100);
    let label = 'low modeled dose';
    if (med >= 1) label = 'over threshold';
    else if (med >= 0.7) label = 'high';
    else if (med >= 0.3) label = 'moderate';
    // Non-breaking space between number and label keeps them on one line.
    medStr = `${pct}% · ${label}`;
  }

  let sessZenith: number | null = null;
  try {
    if (sess.startedAt && sess.endedAt && sess.location && uiDeps.solarZenithAngle) {
      const midDate = new Date(((sess.startedAt as number) + (sess.endedAt as number)) / 2);
      sessZenith = uiDeps.solarZenithAngle(midDate, sess.location.lat, sess.location.lon);
    }
  } catch (e) {}
  const channelOrder = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  const channelRows = sess.doses ? channelOrder.map(k => {
    const meta = uiDeps.channelDisplay[k] || {};
    const v = (sess.doses![k] || 0) as number;
    const unitText = uiDeps.formatChannelUnit(k, v, durationMin || 0, sess.safety?.fitzpatrick || 'I', sess.atmosphere?.uvIndex, sessZenith, !!sess.bodyExposure?.rotatedSides, sess.bodyExposure?.fraction || null);
    return detailChannel(k, meta, v, unitText, 'sun');
  }) : [];

  // Location summary (declared above the atmosphere block so derived metrics
  // can read sess.location for zenith + altitude).
  const loc = sess.location as {lat: number; lon: number; source?: unknown; altitudeM?: number} | null | undefined;

  // Atmosphere snapshot + derived geometry. Surfaces zenith, altitude, and
  // a UVA/UVB split so biohackers can audit the math behind the channels.
  const atm = sess.atmosphere as NonNullable<Parameters<NonNullable<SessionCalls['reconstructSpectrum']>>[0]> & {uvIndex?: number | null; ozoneDU?: number | null; cloudCover?: number | null; source?: unknown; airQuality?: {pm25?: number | null; aod?: number | null} | null} | null | undefined;
  let atmosphereFields: SessionDetailField[] = [];
  if (atm) {
    const uvi = atm.uvIndex != null ? Math.round(atm.uvIndex * 10) / 10 : '—';
    // Open-Meteo free tier doesn't expose stratospheric ozone DU; engine
    // substitutes 300 DU internally. Show a clear "—" + "(default 300)"
    // suffix instead of the awkward "— DU".
    const ozoneStr = atm.ozoneDU != null ? `${Math.round(atm.ozoneDU)} DU` : '— (default 300)';
    const cloud = atm.cloudCover != null ? `${Math.round(atm.cloudCover)}%` : '—';
    const aqPm25 = atm.airQuality?.pm25 != null ? Math.round(atm.airQuality.pm25) : '—';
    let zenithStr = '—';
    try {
      if (sess.startedAt && sess.endedAt && loc && uiDeps.solarZenithAngle) {
        const mid = new Date(((sess.startedAt as number) + (sess.endedAt as number)) / 2);
        const z = uiDeps.solarZenithAngle(mid, loc.lat, loc.lon);
        zenithStr = `${z.toFixed(1)}°`;
      }
    } catch (e) {}
    const altStr = (loc?.altitudeM ?? 0) > 0 ? `${Math.round(loc!.altitudeM!)} m` : 'sea level';
    let uvSplitStr = '';
    try {
      if (loc && uiDeps.reconstructSpectrum && uiDeps.solarZenithAngle && atm.uvIndex != null) {
        const mid = new Date(((sess.startedAt as number) + (sess.endedAt as number)) / 2);
        const z = uiDeps.solarZenithAngle(mid, loc.lat, loc.lon);
        if (z < 90) {
          const spec = uiDeps.reconstructSpectrum({
            zenithDeg: z,
            ozoneDU: atm.ozoneDU ?? 300,
            altitudeM: loc!.altitudeM! ?? 0,
            cloudCover: (atm.cloudCover ?? 0) / 100,
            aod: atm?.airQuality?.aod ?? null,
            targetUVI: atm.uvIndex ?? null,
          });
          const dl = 5;
          let uvb = 0, uva = 0;
          for (let i = 0; i < spec.irradiance.length; i++) {
            const nm = spec.wavelengths[i]!;
            if (nm > 400) break;
            const e = spec.irradiance[i]!;
            if (nm < 320) uvb += e * dl;
            else uva += e * dl;
          }
          const total = uvb + uva;
          if (total > 0.001) {
            const uvbPct = (uvb / total * 100).toFixed(1);
            const uvaPct = (uva / total * 100).toFixed(1);
            uvSplitStr = `UVB ${uvbPct}% (${uvb.toFixed(1)} W/m²) · UVA ${uvaPct}% (${uva.toFixed(1)} W/m²)`;
          }
        }
      }
    } catch (e) {}
    // Source label: pretty-print the raw provider key.
    const sourceLabels: Record<string, unknown> = { open_meteo: 'Open-Meteo', open_meteo_cams: 'Open-Meteo + CAMS context', cams: 'CAMS', cams_satellite: 'CAMS + satellite clouds', noaa_nws: 'NOAA NWS', selfhost: 'Self-hosted', manual: 'Manual entry' };
    const sourceStr = sourceLabels[atm.source as string] || atm.source || 'unknown';
    atmosphereFields = [
      detailField('UVI', uvi, 'WHO UV index at session midpoint'),
      detailField('Ozone', ozoneStr, "Total stratospheric ozone column (Dobson Units). Lower DU → more UVB through. Engine defaults to 300 DU when source doesn't expose it."),
      detailField('Cloud', cloud, 'Cloud-cover modifier on direct beam. Diffuse scatter still passes through.'),
      detailField('PM2.5', aqPm25, 'PM2.5 — fine particulate. Affects aerosol optical depth (AOD) and UV scattering.'),
      detailField('Zenith', zenithStr, 'Solar zenith angle at session midpoint — angle between sun and vertical. 0° = directly overhead, 90° = horizon.'),
      detailField('Altitude', altStr, 'Altitude above sea level — UV climbs ~10% per 1000 m.'),
      ...(uvSplitStr ? [detailField('UV split', uvSplitStr, 'UVB-to-UVA ratio at ground level, computed from the reconstructed Bird-Riordan spectrum. Driven by zenith, ozone, cloud cover, and aerosols.', true)] : []),
      detailField('Source', sourceStr, '', true),
    ];
  }

  // Location summary string (uses `loc` declared above).
  const locStr = loc
    ? `${loc.lat.toFixed(2)}°, ${loc.lon.toFixed(2)}° · ${loc.source || 'unknown'}`
    : 'Location not recorded';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  // Body summary — combine fraction + regions onto one line so the section
  // doesn't flag the percent as a label decoration. Also consolidate Eyes
  // + Modifiers into the same section when both fit cleanly.
  const eyeMode = eyeLabels[sess.eyeExposure?.mode as string] || 'Eyes unset';
  const lensTintStr = sess.eyeExposure?.lensTint && sess.eyeExposure.lensTint !== 'clear'
    ? ` · ${lensLabels[sess.eyeExposure.lensTint as string] || ''}` : '';
  const modifierBits: unknown[] = [];
  if (sess.bodyExposure?.glassBetween) modifierBits.push('Behind glass');
  if (sess.bodyExposure?.sunscreenSPF) modifierBits.push(`SPF ${sess.bodyExposure.sunscreenSPF}`);
  if (sess.posture && sess.posture !== 'standing') {
    const postureLabel = (uiDeps.postureOptions.find(p => p.key === sess.posture) || {}).label;
    if (postureLabel) modifierBits.push(postureLabel);
  }
  if (sess.surfaceAlbedo && sess.surfaceAlbedo !== 'grass') {
    const surfLabel = ((uiDeps.surfaceOptions as OptionOperations[]).find(s => s.key === sess.surfaceAlbedo) || {}).label;
    if (surfLabel) modifierBits.push(surfLabel.split(' (')[0]); // drop the "(~25%)" suffix
  }
  const ai = uiDeps.getSessionAIDetailView(sess);
  const summary = [
    detailField('When', whenStr, 'Session start–end and duration'),
    detailField('Burn dose', medStr, 'Cumulative erythemal dose compared with a rough Fitzpatrick base MED. This is not a personal threshold; stop before redness and treat medication warnings separately.'),
  ];
  if (sess.doses?.vitamin_d) {
    const geneInfo = uiDeps.geneticVitaminDMultiplier(state.importedData?.genetics);
    const geneNote = geneInfo.contributors.length > 0
      ? ` Separate serum-genetics context (not applied to this skin estimate): ${geneInfo.contributors.map(c => `${c.gene} ${c.genotype}`).join(', ')}.`
      : '';
    summary.push(detailField('Vitamin D estimate', uiDeps.formatChannelUnit('vitamin_d', sess.doses.vitamin_d, durationMin || 0, sess.safety?.fitzpatrick || 'I', sess.atmosphere?.uvIndex, sessZenith, !!sess.bodyExposure?.rotatedSides, sess.bodyExposure?.fraction || null),
      `Modeled vitamin D IU-equivalent from action-weighted incident UVB, exposed area, and a rough Fitzpatrick ${sess.safety?.fitzpatrick || 'I'} central modifier. It is not measured skin absorption or a predicted blood response. Rotation is preserved in session history but does not double dose.${geneNote} Expect broad multi-fold uncertainty.`));
  }
  overlay.innerHTML = renderHTML({ kind: 'detail', ai: ai || null, view: {
    kind: 'sun', id: String(sess.id ?? ''), title: `Sun session · ${fmtTitleDate(start)}`, summary,
    setup: [detailField(`Skin · ${fractionPct}%`, regionLabels), detailField('Eyes', eyeMode + lensTintStr),
      ...(modifierBits.length ? [detailField('Modifiers', modifierBits.join(' · '))] : [])],
    notices: [], calculation: sessionCalculationNotice(sess.calculationStatus), channels: channelRows,
    channelsEmpty: 'No channel doses computed for this session yet.',
    signalsDescription: 'Estimated stimulation from this session. These signals are not daily targets or proof of an endocrine outcome.',
    lightMetric: null, inputTitle: 'Conditions and model inputs',
    inputDescription: 'Technical inputs retained so the estimate can be audited without crowding the session summary.',
    inputs: atmosphereFields, inputsEmpty: 'Conditions were not available for this session.',
    location: detailField('Approx. model location', locStr), sourceUrl: '', notes: sess.notes ? String(sess.notes) : '',
    canEditDuration: !!sess.endedAt, canEditMode: false,
  } });
  const closeDialog = () => removeModalOverlay(overlay);
  openAppendedModalOverlay(overlay, closeDialog);
  (bindDetachedModalSyncRefresh as (options: Omit<NonNullable<Parameters<typeof bindDetachedModalSyncRefresh>[0]>, 'id' | 'opener' | 'exists'> & {id: unknown; opener(id: unknown): unknown; exists(id: unknown): boolean}) => ReturnType<typeof bindDetachedModalSyncRefresh>)({
    overlay,
    id,
    opener: openSunSessionDetail,
    exists: sessionId => uiDeps.getSessions().some(s => s.id === sessionId),
  });
}

// Per-channel chip value — small inline real-unit number rendered on
// the chip. Channel-aware so units match what the user expects:
//   vitamin_d → IU
//   nir_solar → J/cm²
//   circadian → estimated melanopic-equivalent illuminance for modeled SPDs
//   no_cv / pomc / violet_eye → no invented percentage; label only
// Returns '' when a compact chip should use its plain signal label.
function _sessionChipValue(channelKey: string, channelAu: unknown, sess: SessionReader | null | undefined) {
  if (!Number.isFinite(channelAu) || (channelAu as number) <= 0) return '';
  const fitz = sess?.safety?.fitzpatrick || 'I';
  const uvi = sess?.atmosphere?.uvIndex ?? null;
  const dur = resolvedSessionDurationMin(sess) || 0;
  // Mirror formatChannelUnit's too-short gate: short sessions get the
  // icon + label only, no spurious value. Keeps the chip readable
  // without misleading numbers.
  if (dur > 0 && dur < uiDeps.tooShortForChannelVerdictMin) return '';
  if (channelKey === 'vitamin_d' && typeof uiDeps.vitaminDIU === 'function') {
    // Session chip uses per-session cap when bodyFraction is set
    // (Audit P1 #8). Falls back to daily-cap helper for legacy chip
    // contexts where bodyFraction wasn't recorded.
    const bf = sess?.bodyExposure?.fraction as number | null | undefined;
    const iu = (Number.isFinite(bf) && (bf as number) > 0 && typeof uiDeps.vitaminDIUPerSession === 'function')
      ? uiDeps.vitaminDIUPerSession(channelAu, fitz, uvi, !!sess?.bodyExposure?.rotatedSides, state.importedData?.genetics || null, bf)
      : uiDeps.vitaminDIU(channelAu, fitz, uvi, !!sess?.bodyExposure?.rotatedSides, state.importedData?.genetics || null);
    if (iu < 30) return '';
    if (iu >= 1000) return `~${(iu / 1000).toFixed(1).replace(/\.0$/, '')}k IU-eq`;
    return `~${Math.round(iu / 10) * 10} IU-eq`;
  }
  if (channelKey === 'nir_solar' && typeof uiDeps.pbmJoulesPerCm2 === 'function') {
    const j = uiDeps.pbmJoulesPerCm2(channelAu);
    if (j < 0.1) return '';
    if (j >= 10) return `${Math.round(j)} J/cm²`;
    return `${j.toFixed(1)} J/cm²`;
  }
  if (channelKey === 'circadian' && dur > 0 && typeof uiDeps.circadianMelanopicLux === 'function') {
    const lux = uiDeps.circadianMelanopicLux(channelAu, dur);
    if (lux < 100) return '';
    // Round aggressively at this magnitude; this is an SPD-model estimate.
    if (lux >= 10000) return `~${Math.round(lux / 1000)}k est. mel lx`;
    if (lux >= 1000) return `~${(lux / 1000).toFixed(1)}k est. mel lx`;
    return `~${Math.round(lux / 10) * 10} est. mel lx`;
  }
  return '';
}

function sessionChannelChipViews(doses: DoseReader | null | undefined, sess: SessionReader | null): SessionChannelChip[] | null {
  if (!doses) return null;
  const order = ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'nir_solar'];
  return order.map(key => ({ key, value: doses[key] || 0 }))
    .filter(row => Number.isFinite(row.value) && (row.value as number) > 0)
    .map(row => sessionChannelChip(row.key, uiDeps.channelDisplay[row.key], _sessionChipValue(row.key, row.value, sess)));
}

export function renderChannelChips(doses: DoseReader | null | undefined, sess: SessionReader | null = null) {
  const chips = sessionChannelChipViews(doses, sess);
  return chips === null ? '' : renderHTML({ kind: 'channel-chips', chips });
}

// ─── UI: detailed session log (anatomical regions + sunscreen + glass) ─

export function openDetailedSessionDialog() {
  const configuredFitz = state.importedData?.sunDefaults?.fitzpatrick || null;
  if (!/^(I|II|III|IV|V|VI)$/.test(String(configuredFitz || ''))) {
    showNotification(
      'Confirm your Fitzpatrick skin type in Light setup before logging a sun session.',
      'info',
      7000,
    );
    uiDeps.openLightSetup();
    return false;
  }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const lastUsed = uiDeps.getSessions().filter(s => s.endedAt).slice(-1)[0];
  const eyeMode = lastUsed?.eyeExposure?.mode || 'direct';
  const lensTint = lastUsed?.eyeExposure?.lensTint || 'clear';
  const lastRegions = new Set((lastUsed?.bodyExposure?.regions || []) as Iterable<unknown>);

  // Default the "Ended at" picker to now so quick "log the session that just
  // ended" stays one-click. Users backfilling earlier sessions can pick any
  // moment up to the present. <input type="datetime-local"> needs a local-tz
  // string; build it manually so we don't rely on the browser's locale guess.
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmtLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const localNow = fmtLocal(now);
  // Started-at defaults to now − 15 min so the most-common quick-log
  // ("I just had a 15-min session") works with zero edits. Users
  // logging older sessions adjust both timestamps.
  const localStartDefault = fmtLocal(new Date(now.getTime() - 15 * 60 * 1000));

  // Region picker as a checkable chip grid — clearer than a tap-target SVG
  // silhouette per the v1.7.0a UX review. Each chip shows the region label
  // and toggles on click. Free-form, accessible, mobile-friendly.

  overlay.innerHTML = (renderPastSessionLogModal as (options: Omit<Parameters<typeof renderPastSessionLogModal>[0], 'lastRegions' | 'lastUsed'> & {lastRegions: Set<unknown>; lastUsed: SessionReader | undefined}) => ReturnType<typeof renderPastSessionLogModal>)({
    lastUsed,
    lastRegions,
    eyeMode,
    lensTint,
    localStartDefault,
    localNow,
    eyeModes: uiDeps.eyeModes,
    lensTints: uiDeps.lensTints,
    postureOptions: uiDeps.postureOptions,
    surfaceOptions: uiDeps.surfaceOptions,
  });
  const closeDialog = () => removeModalOverlay(overlay);
  openAppendedModalOverlay(overlay, closeDialog);

  const selected = bindPastSessionRegionPicker(overlay, lastRegions);
  bindPastSessionDurationHint(overlay);

  const saveButton = overlay.querySelector('#det-save');
  if (!saveButton) return closeDialog();
  saveButton.addEventListener('click', async () => {
    const eyeModeVal = (overlay.querySelector('#det-eye-mode') as HTMLSelectElement | null)?.value || 'direct';
    const lensTintVal = (overlay.querySelector('#det-lens-tint') as HTMLSelectElement | null)?.value || 'clear';
    const spf = parseInt((overlay.querySelector('#det-spf') as HTMLInputElement | null)?.value || '', 10) || null;
    const glass = !!(overlay.querySelector('#det-glass') as HTMLInputElement | null)?.checked;
    const modeledEyeMode = glass && eyeModeVal === 'direct' ? 'glass-window' : eyeModeVal;
    const notes = (overlay.querySelector('#det-notes') as HTMLTextAreaElement | null)?.value || '';

    // Resolve the two timestamps. Both fields default to a sensible
    // 15-min window ending now, so the empty-field fallback never fires
    // in practice — but we guard anyway in case a user clears one.
    const startedAtRaw = (overlay.querySelector('#det-started-at') as HTMLInputElement | null)?.value || '';
    const endedAtRaw = (overlay.querySelector('#det-ended-at') as HTMLInputElement | null)?.value || '';
    const endedMsRaw = endedAtRaw ? new Date(endedAtRaw).getTime() : Date.now();
    const startedMsRaw = startedAtRaw
      ? new Date(startedAtRaw).getTime()
      : (endedMsRaw - 15 * 60 * 1000);
    if (!Number.isFinite(startedMsRaw) || !Number.isFinite(endedMsRaw)) {
      showNotification('Invalid Started at / Ended at — check the times', 'error');
      return;
    }
    if (startedMsRaw >= endedMsRaw) {
      showNotification('Ended at must be after Started at', 'error');
      return;
    }
    const endedAt = Math.min(endedMsRaw, Date.now());
    const start = Math.min(startedMsRaw, endedAt - 60 * 1000);
    const durationMin = Math.max(1, (endedAt - start) / 60000);

    // Compute exposure fraction from selected regions
    const regions = Array.from(selected);
    const fraction = regions.reduce<number>((sum, key) => {
      const r = BODY_REGIONS.find(b => b.key === key);
      return sum + (r?.fraction || 0);
    }, 0);
    const posture = (overlay.querySelector('#det-posture') as HTMLSelectElement | null)?.value || 'standing';
    const surfaceAlbedo = (overlay.querySelector('#det-surface') as HTMLSelectElement | null)?.value || 'grass';
    // Resolve coordinates so hydrateSession has somewhere to fetch
    // atmosphere from. Without this the past-session save records the
    // session but `useLat == null` short-circuits hydration → channels
    // and safety stay null forever and the detail modal opens to a
    // mostly-empty card. quickLogSunSession resolves coords before
    // calling startSession; the after-the-fact path needs the same step.
    const location = uiDeps.getSunCoords();
    const sessId = await uiDeps.logCompletedSession({
      startedAt: start,
      endedAt,
      location,
      bodyExposure: { preset: regions.length === 0 ? 'covered' : 'detailed', fraction: regions.length === 0 ? 0 : fraction, regions, sunscreenSPF: spf, glassBetween: glass },
      eyeExposure: { mode: modeledEyeMode, lensTint: lensTintVal, durationSec: durationMin * 60 },
      posture, surfaceAlbedo,
      notes,
    });
    if (sessId) await uiDeps.hydrateSession(sessId);
    closeDialog();
    showNotification(`Detailed session saved: ${Math.round(durationMin)} min, ${regions.length} regions.`);
    refreshLightView();
  });
}

// User-facing delete entry point shared by delegated UI actions.
export async function deleteSunSession(id: unknown) {
  if (await showConfirmDialog('Delete this sun session?')) {
    await uiDeps.deleteSession(id);
    uiDeps.refreshSurfaces();
  }
}

export async function retrySunSessionCalculation(id: unknown) {
  const sess = uiDeps.getSessions().find(s => s.id === id);
  if (!sess) return;
  const fallback = uiDeps.getSunCoords?.();
  const coords = sess.location?.lat != null && sess.location?.lon != null
    ? { lat: sess.location.lat, lon: sess.location.lon }
    : fallback;
  if (!coords || coords.lat == null || coords.lon == null) {
    showNotification('Add a ZIP code or allow phone location before retrying this calculation.', 'error', 7000);
    return;
  }
  const hydrated = await uiDeps.hydrateSession(id, coords);
  uiDeps.refreshSurfaces();
  if (hydrated?.calculationStatus === 'computed') {
    showNotification('Session estimates recalculated.', 'success');
  } else {
    showNotification('Session estimates are still unavailable. Try again when conditions data is reachable.', 'error', 7000);
  }
}

// ─── Session actions ───────────────────────────────────────────────────

// User-facing edit-duration entry point — prompts for a new minutes
// value, validates the range, calls updateSession (which bumps
// updatedAt + re-hydrates doses on duration change), then re-renders.
export async function editSunSessionDuration(id: unknown) {
  const sess = uiDeps.getSessions().find(s => s.id === id);
  if (!sess) {
    showNotification('Session not found', 'error');
    return;
  }
  const current = Math.max(0, Math.round((sess.durationMin || 0) as number));
  const raw = await showPromptDialog('New duration (in minutes)', {
    defaultValue: String(current),
    okLabel: 'Save',
    placeholder: 'e.g. 26',
  });
  if (raw === null) return; // user cancelled
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 600) {
    showNotification('Enter a duration between 0 and 600 minutes.', 'error');
    return;
  }
  const next = Math.round(parsed);
  if (next === current) return; // nothing to do
  const updated = await uiDeps.updateSession(id, { durationMin: next });
  if (updated?.calculationStatus === 'computed') {
    showNotification(`Session duration set to ${next} min and estimates recalculated.`, 'success');
  } else if (updated?.calculationStatus === 'needs-location') {
    showNotification(`Session duration set to ${next} min. Add a ZIP code or allow phone location to recalculate estimates.`, 'info', 7000);
  } else {
    showNotification(`Session duration set to ${next} min, but estimates are unavailable. Open the session to retry.`, 'error', 7000);
  }
  refreshLightView();
}

function collectSunSessionViews(sessions:SessionReader[]){const rows:import('./light-session-presentation.js').LightSessionRowProps[]=[];sessions.map(session=>{rows.push(getSunSessionRowView(session));return '';}).join('');return rows;}
