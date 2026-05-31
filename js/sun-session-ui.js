// sun-session-ui.js — UI rendering/editing for saved sun sessions.
// Core session storage, dose hydration, and sun math stay in sun.js. This
// module receives those core operations through configureSunSessionUI() so
// the UI layer can stay separate without importing sun.js and creating a cycle.

import { state } from './state.js';
import { bindDetachedModalSyncRefresh, escapeHTML, escapeAttr, formatDate, showNotification, showPromptDialog, showConfirmDialog } from './utils.js';
import { BODY_REGIONS, renderBodySilhouette, bindBodySilhouette } from './sun-body-silhouette.js';

const uiDeps = {
  getSessions: () => [],
  deleteSession: async () => false,
  updateSession: async () => null,
  logCompletedSession: async () => null,
  hydrateSession: async () => null,
  getSunCoords: () => null,
  refreshSurfaces: () => {},
  wireBackdropClose: () => {},
  trapModalFocus: () => {},
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
};

export function configureSunSessionUI(deps = {}) {
  Object.assign(uiDeps, deps);
}

// ─── UI: Sessions list (used by the dedicated Light & Sun page) ────────

// Render a single sun-session row. Extracted so the unified
// sun+device sessions list (views.js renderUnifiedSessionsList) can
// reuse the same rich treatment instead of rebuilding a stripped-down
// row from scratch — channel chips + burn-risk meta + click-to-open
// detail modal stay consistent whether the user owns devices or not.
export function renderSunSessionRow(sess) {
  const eyeLabels = Object.fromEntries(uiDeps.eyeModes.map(e => [e.key, e.label]));
  const start = formatDate(new Date(sess.startedAt).toISOString().slice(0, 10));
  const isActive = !sess.endedAt;
  const dur = isActive
    ? uiDeps.formatElapsed(Date.now() - sess.startedAt)
    : (sess.durationMin ? `${Math.round(sess.durationMin)} min` : 'in progress');
  const med = sess.safety?.medFraction;
  let medStr = '';
  if (med != null) {
    const pct = Math.round(med * 100);
    let label = 'safe', cls = '';
    if (med >= 1) { label = 'over threshold'; cls = 'over'; }
    else if (med >= 0.7) { label = 'high'; cls = 'warn'; }
    else if (med >= 0.3) { label = 'moderate'; cls = ''; }
    medStr = `<span class="sun-session-med ${cls}" title="Burn dose: ${pct}% of your burn threshold (Fitzpatrick ${escapeAttr(sess.safety.fitzpatrick || 'III')})">Burn dose: ${escapeHTML(label)}</span>`;
  }
  const channelChips = renderChannelChips(sess.doses, sess);
  // Active-session controls: Pause/Resume + Sunscreen re-applied + Set
  // ozone. Stop propagation so the row's open-detail click handler
  // doesn't fire when these are tapped.
  let activeControls = '';
  if (isActive) {
    const isPaused = !!sess.paused;
    const pauseLabel = isPaused ? '▶ Resume' : '⏸ Pause';
    const pauseAction = isPaused ? `window.resumeSunSession('${escapeAttr(sess.id)}')` : `window.pauseSunSession('${escapeAttr(sess.id)}')`;
    const isRotated = !!sess.bodyExposure?.rotatedSides;
    const flipBtn = isRotated
      ? `<button class="sun-session-ctl" disabled title="Already logged as rotated — vit-D IU already counts both sides." aria-label="Rotated"><span aria-hidden="true">🔄</span> <span class="sun-session-ctl-label">Rotated ✓</span></button>`
      : `<button class="sun-session-ctl" onclick="event.stopPropagation();window.flipSidesMidSession('${escapeAttr(sess.id)}')" title="Tap when you flip front↔back. Doubles vit-D IU to reflect that both sides got exposure." aria-label="Flip front-back"><span aria-hidden="true">🔄</span> <span class="sun-session-ctl-label">Flip</span></button>`;
    activeControls = `<div class="sun-session-active-controls" onclick="event.stopPropagation()">
      <div class="sun-session-ctl-primary">
        <button class="sun-session-ctl sun-session-ctl-stop" onclick="event.stopPropagation();window.quickLogSunSession()" title="Stop and save the current session"><span aria-hidden="true">⏹</span> <span class="sun-session-ctl-label">Stop &amp; save</span></button>
        <button class="sun-session-ctl" onclick="event.stopPropagation();${pauseAction}" title="${isPaused ? 'Resume dose accrual' : 'Pause dose accrual (shade break, indoors)'}" aria-label="${isPaused ? 'Resume' : 'Pause'} session"><span aria-hidden="true">${isPaused ? '▶' : '⏸'}</span> <span class="sun-session-ctl-label">${isPaused ? 'Resume' : 'Pause'}</span></button>
      </div>
      <div class="sun-session-ctl-secondary">
        ${flipBtn}
        <button class="sun-session-ctl" onclick="event.stopPropagation();window.changeCoverageMidSession('${escapeAttr(sess.id)}')" title="Dressed or undressed — opens the body-region picker, commits the dose accrued so far, applies the new coverage from this moment forward" aria-label="Change coverage"><span aria-hidden="true">👕</span> <span class="sun-session-ctl-label">Coverage</span></button>
        <button class="sun-session-ctl" onclick="event.stopPropagation();window.applySunscreenMidSession('${escapeAttr(sess.id)}')" title="Reapplied sunscreen — commits current slice and starts a new one with the new SPF" aria-label="Reapply sunscreen"><span aria-hidden="true">🧴</span> <span class="sun-session-ctl-label">Sunscreen</span></button>
        <button class="sun-session-ctl" onclick="event.stopPropagation();window.setOzoneOverrideMidSession()" title="Calibrate ozone column from a meter / weather station" aria-label="Override ozone"><span aria-hidden="true">🛰</span> <span class="sun-session-ctl-label">Ozone</span></button>
      </div>
    </div>`;
  }
  const pausedBadge = isActive && sess.paused ? `<span class="sun-session-paused" title="Dose accrual paused — elapsed time still ticks but channel + burn totals stay frozen.">⏸ paused</span>` : '';
  const forgotBanner = isActive && (Date.now() - sess.startedAt > 12 * 3600 * 1000)
    ? `<div class="sun-session-forgot" onclick="event.stopPropagation();window._forgotStopPrompt && window._forgotStopPrompt('${escapeAttr(sess.id)}')" role="button" tabindex="0">⚠ This session has been running for ${Math.round((Date.now() - sess.startedAt) / 3600000)}h. Tap to end it.</div>`
    : '';
  // Click anywhere on the card (except the × delete) to open the detail
  // modal. Each delete button stops propagation so it only deletes.
  return `<div class="sun-session light-session-row light-session-sun" data-id="${escapeAttr(sess.id)}" role="button" tabindex="0" aria-label="Open ${start} session details" onclick="window.openSunSessionDetail && window.openSunSessionDetail('${escapeAttr(sess.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openSunSessionDetail && window.openSunSessionDetail('${escapeAttr(sess.id)}')}">
    <div class="sun-session-head">
      <span class="light-session-icon" aria-hidden="true">☀</span>
      <span class="sun-session-date">${start}</span>
      <span class="sun-session-duration"${isActive ? ' aria-live="off"' : ''}>${dur}</span>
      ${pausedBadge}
      ${medStr}
      <button class="sun-session-delete" onclick="event.stopPropagation();window.deleteSunSession('${escapeAttr(sess.id)}')" title="Delete session" aria-label="Delete session">×</button>
    </div>
    <div class="sun-session-meta">
      ${escapeHTML(uiDeps.summarizeBodyExposure(sess))} · ${sess.eyeExposure?.mode === 'direct' ? `<span class="sun-eye-warn" title="Never look directly at the sun">⚠</span> ` : ''}${escapeHTML(eyeLabels[sess.eyeExposure?.mode] || 'Eyes unset')}${sess.bodyExposure?.glassBetween ? ' · through glass' : ''}${sess.bodyExposure?.sunscreenSPF ? ` · SPF ${sess.bodyExposure.sunscreenSPF}` : ''}
    </div>
    ${forgotBanner}
    ${activeControls}
    ${channelChips}
    ${typeof window !== 'undefined' && window.renderSessionAIInline ? window.renderSessionAIInline(sess) : ''}
  </div>`;
}

export function renderSessionsList() {
  const sessions = [...uiDeps.getSessions()].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  if (sessions.length === 0) {
    return `<div class="sun-empty">
      <p>No sun sessions logged yet.</p>
      <button class="import-btn import-btn-primary" onclick="window.quickLogSunSession()">Log your first session</button>
    </div>`;
  }
  let html = `<div class="sun-sessions-list">`;
  for (const sess of sessions) html += renderSunSessionRow(sess);
  html += `</div>`;
  return html;
}

// ─── UI: per-session detail modal ──────────────────────────────────────
//
// Click any saved session row to inspect: full duration, regions exposed,
// eyewear + sunscreen + glass, atmosphere snapshot at session midpoint
// (UVI / ozone / cloud), and per-channel dose breakdown with tier labels.
export function openSunSessionDetail(id) {
  const sess = uiDeps.getSessions().find(s => s.id === id);
  if (!sess) return;
  const start = new Date(sess.startedAt);
  const end = sess.endedAt ? new Date(sess.endedAt) : null;
  const fmtTime = (d) => d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';
  // Modal title date: full month + day + year — avoids the "Sun session
  // — Sun, May 3" stutter and gives a clear timestamp at a glance.
  const fmtTitleDate = (d) => d ? d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  const dur = sess.durationMin ? `${Math.round(sess.durationMin)} min` : 'in progress';
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
  const regions = sess.bodyExposure?.regions || [];
  const regionLabels = regions.length
    ? regions.map(k => BODY_REGIONS.find(r => r.key === k)?.label || k).join(', ')
    : (presetLabels[sess.bodyExposure?.preset] || 'Body unset');
  const fractionPct = Math.round((sess.bodyExposure?.fraction || 0) * 100);

  // Burn-risk
  const med = sess.safety?.medFraction;
  let medStr = '—';
  if (med != null) {
    const pct = Math.round(med * 100);
    let label = 'safe';
    if (med >= 1) label = 'over threshold';
    else if (med >= 0.7) label = 'high';
    else if (med >= 0.3) label = 'moderate';
    // Non-breaking space between number and label keeps them on one line.
    medStr = `${pct}% · ${label}`;
  }

  // Per-channel breakdown. Real-world units (IU, J/cm², M-EDI lux)
  // surface where defensible; tier-only for channels without a clean
  // single SI unit. See sun-spectrum.js {vitaminDIU, pbmJoulesPerCm2,
  // circadianMelanopicLux} for the conversions and their sources.
  // Compute zenith at session midpoint once so vit-D's uncertainty band
  // can tighten when conditions are favorable (high noon clear sky).
  let sessZenith = null;
  try {
    if (sess.startedAt && sess.endedAt && sess.location && window.solarZenithAngle) {
      const midDate = new Date((sess.startedAt + sess.endedAt) / 2);
      sessZenith = window.solarZenithAngle(midDate, sess.location.lat, sess.location.lon);
    }
  } catch (e) {}
  const channelOrder = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  const channelRows = sess.doses ? channelOrder.map(k => {
    const meta = uiDeps.channelDisplay[k] || {};
    const v = sess.doses[k] || 0;
    const t = uiDeps.channelTier(v, k);
    const tlabel = uiDeps.tierLabel(t);
    const target = meta.dailyTarget || 0;
    const pctOfTarget = (target > 0 && v > 0) ? Math.round(100 * v / target) : null;
    const unitText = uiDeps.formatChannelUnit(k, v, sess.durationMin || 0, sess.safety?.fitzpatrick || 'III', sess.atmosphere?.uvIndex, sessZenith, !!sess.bodyExposure?.rotatedSides, sess.bodyExposure?.fraction || null);
    const ariaLabel = `${meta.label || k} — ${tlabel}${unitText ? ', ' + unitText : ''}. Open channel details.`;
    return `<div class="sun-detail-channel-row sun-detail-channel-row-clickable sun-chip-tier-${t}" data-channel="${escapeAttr(k)}" role="button" tabindex="0" aria-label="${escapeAttr(ariaLabel)}" onclick="this.closest('.modal-overlay')?.remove();window._openChannelOnLightPage && window._openChannelOnLightPage('${escapeAttr(k)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.closest('.modal-overlay')?.remove();window._openChannelOnLightPage && window._openChannelOnLightPage('${escapeAttr(k)}')}">
      <span class="sun-detail-channel-icon" aria-hidden="true">${meta.icon || '·'}</span>
      <span class="sun-detail-channel-label">${escapeHTML(meta.label || k)}</span>
      <span class="sun-detail-channel-value"${pctOfTarget != null && !unitText ? ` title="${escapeAttr(pctOfTarget + '% of typical-active-day target — calibrated to roughly 30-60 min of moderate-body-fraction midday exposure (skin channels) or 10-30 min eye-direct outdoor light (eye channels). Over 100% means you got more than typical, NOT more than safe — burn risk is the % MED chip, not this. Targets are dosing references, not exposure ceilings.')}"` : ''}>${unitText || (pctOfTarget != null ? `${pctOfTarget}%` : '')}</span>
      <span class="sun-detail-channel-tier">${escapeHTML(tlabel)}</span>
      <span class="sun-detail-channel-chevron" aria-hidden="true">›</span>
    </div>`;
  }).join('') : '<p class="sun-detail-empty">No channel doses computed for this session yet.</p>';

  // Location summary (declared above the atmosphere block so derived metrics
  // can read sess.location for zenith + altitude).
  const loc = sess.location;

  // Atmosphere snapshot + derived geometry. Surfaces zenith, altitude, and
  // a UVA/UVB split so biohackers can audit the math behind the channels.
  const atm = sess.atmosphere;
  let atmHtml = '';
  if (atm) {
    const uvi = atm.uvIndex != null ? Math.round(atm.uvIndex * 10) / 10 : '—';
    // Open-Meteo free tier doesn't expose stratospheric ozone DU; engine
    // substitutes 300 DU internally. Show a clear "—" + "(default 300)"
    // suffix instead of the awkward "— DU".
    const ozoneStr = atm.ozoneDU != null ? `${Math.round(atm.ozoneDU)} DU` : '— (default 300)';
    const cloud = atm.cloudCover != null ? `${Math.round(atm.cloudCover)}%` : '—';
    const aqPm25 = atm.airQuality?.pm25 != null ? Math.round(atm.airQuality.pm25) : '—';
    let zenithStr = '—', elevStr = '';
    try {
      if (sess.startedAt && sess.endedAt && loc && window.solarZenithAngle) {
        const mid = new Date((sess.startedAt + sess.endedAt) / 2);
        const z = window.solarZenithAngle(mid, loc.lat, loc.lon);
        zenithStr = `${z.toFixed(1)}°`;
        elevStr = `${Math.max(0, 90 - z).toFixed(1)}° above horizon`;
      }
    } catch (e) {}
    const altStr = (loc?.altitudeM ?? 0) > 0 ? `${Math.round(loc.altitudeM)} m` : 'sea level';
    // UVA / UVB split — reconstruct the actual spectrum at session
    // midpoint and integrate over each band:
    //   UVB: 280–320 nm (vit-D synthesis + sunburn)
    //   UVA: 320–400 nm (NO release, POMC, photoaging)
    // Surfaces both the absolute irradiance (W/m²) and the percent split
    // so users can see the real numbers, not a hand-waved fallback. No
    // more `~5%` placeholder when ozoneDU is missing — Bird-Riordan
    // already substitutes 300 DU internally so the spectrum is computed
    // either way.
    let uvSplitStr = '';
    try {
      if (loc && window.reconstructSpectrum && window.solarZenithAngle && atm.uvIndex != null) {
        const mid = new Date((sess.startedAt + sess.endedAt) / 2);
        const z = window.solarZenithAngle(mid, loc.lat, loc.lon);
        if (z < 90) {
          const spec = window.reconstructSpectrum({
            zenithDeg: z,
            ozoneDU: atm.ozoneDU ?? 300,
            altitudeM: loc.altitudeM ?? 0,
            cloudCover: (atm.cloudCover ?? 0) / 100,
            aod: atm?.airQuality?.aod ?? null,
          });
          const dl = 5;
          let uvb = 0, uva = 0;
          for (let i = 0; i < spec.irradiance.length; i++) {
            const nm = spec.wavelengths[i];
            if (nm > 400) break;
            const e = spec.irradiance[i];
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
    const sourceLabels = { open_meteo: 'Open-Meteo', cams: 'CAMS', noaa_nws: 'NOAA NWS', selfhost: 'Self-hosted', manual: 'Manual entry' };
    const sourceStr = sourceLabels[atm.source] || atm.source || 'unknown';
    atmHtml = `<div class="sun-detail-atm">
      <div title="WHO UV index at session midpoint${atm._uvOverridden ? ' (manual override active)' : ''}"><span>UVI${atm._uvOverridden ? ' (manual)' : ''}</span><strong>${uvi}</strong></div>
      <div title="Total stratospheric ozone column (Dobson Units). Lower DU → more UVB through. Engine defaults to 300 DU when source doesn't expose it."><span>Ozone</span><strong>${ozoneStr}</strong></div>
      <div title="Cloud-cover modifier on direct beam. Diffuse scatter still passes through."><span>Cloud</span><strong>${cloud}</strong></div>
      <div title="PM2.5 — fine particulate. Affects aerosol optical depth (AOD) and UV scattering."><span>PM2.5</span><strong>${aqPm25}</strong></div>
      <div title="Solar zenith angle at session midpoint — angle between sun and vertical. 0° = directly overhead, 90° = horizon."><span>Zenith</span><strong>${zenithStr}</strong></div>
      <div title="Altitude above sea level — UV climbs ~10% per 1000 m."><span>Altitude</span><strong>${altStr}</strong></div>
      ${uvSplitStr ? `<div class="sun-detail-atm-uvsplit" title="UVB-to-UVA ratio at ground level, computed from the reconstructed Bird-Riordan spectrum. Driven by zenith, ozone, cloud cover, and aerosols."><span>UV split</span><strong>${uvSplitStr}</strong></div>` : ''}
      <div class="sun-detail-atm-source"><span>Source</span><strong>${escapeHTML(sourceStr)}</strong></div>
    </div>`;
  }

  // Location summary string (uses `loc` declared above).
  const locStr = loc
    ? `${loc.lat.toFixed(2)}°, ${loc.lon.toFixed(2)}° · ${escapeHTML(loc.source || 'unknown')}`
    : 'Location not recorded';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  // Body summary — combine fraction + regions onto one line so the section
  // doesn't flag the percent as a label decoration. Also consolidate Eyes
  // + Modifiers into the same section when both fit cleanly.
  const eyeMode = eyeLabels[sess.eyeExposure?.mode] || 'Eyes unset';
  const lensTintStr = sess.eyeExposure?.lensTint && sess.eyeExposure.lensTint !== 'clear'
    ? ` · ${lensLabels[sess.eyeExposure.lensTint] || ''}` : '';
  const modifierBits = [];
  if (sess.bodyExposure?.glassBetween) modifierBits.push('Behind glass');
  if (sess.bodyExposure?.sunscreenSPF) modifierBits.push(`SPF ${sess.bodyExposure.sunscreenSPF}`);
  if (sess.posture && sess.posture !== 'standing') {
    const postureLabel = (uiDeps.postureOptions.find(p => p.key === sess.posture) || {}).label;
    if (postureLabel) modifierBits.push(postureLabel);
  }
  if (sess.surfaceAlbedo && sess.surfaceAlbedo !== 'grass') {
    const surfLabel = (uiDeps.surfaceOptions.find(s => s.key === sess.surfaceAlbedo) || {}).label;
    if (surfLabel) modifierBits.push(surfLabel.split(' (')[0]); // drop the "(~25%)" suffix
  }

  overlay.innerHTML = `<div class="modal sun-detail-modal" data-session-kind="sun" role="dialog" aria-label="Sun session details">
    <div class="modal-header">
      <h3>Sun session · ${escapeHTML(fmtTitleDate(start))}</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${typeof window !== 'undefined' && window.renderSessionAIDetail ? window.renderSessionAIDetail(sess) : ''}
      <div class="sun-detail-grid">
        <div title="Session start–end and duration"><span>When</span><strong>${escapeHTML(whenStr)}</strong></div>
        <div title="Cumulative erythemal dose as a fraction of your personal MED (Fitzpatrick-scaled). 70%+ recommends shade; 100% is sunburn threshold."><span>Burn dose</span><strong>${escapeHTML(medStr)}</strong></div>
        ${sess.doses?.vitamin_d ? (() => {
          const geneInfo = (typeof window.geneticVitaminDMultiplier === 'function')
            ? window.geneticVitaminDMultiplier(state.importedData?.genetics)
            : { mult: 1.0, contributors: [] };
          const geneNote = geneInfo.contributors.length > 0
            ? ` Genetics applied (${(geneInfo.mult * 100 - 100).toFixed(0)}% net): ${geneInfo.contributors.map(c => `${c.gene} ${c.genotype} ×${c.multiplier.toFixed(2)}`).join(', ')}.`
            : '';
          return `<div title="Approximate vitamin D₃ synthesis (effective serum response). Holick 2008 + Bogh &amp; Wulf 2010 conversion, scaled by Fitzpatrick ${sess.safety?.fitzpatrick || 'III'}, gated by UVI ≥ 2-3 (Webb 2018), saturates around 20,000 IU per session.${sess.bodyExposure?.rotatedSides ? ' Doubled because both sides were exposed (rotated during session).' : ' Assumes you stayed on one side — tap the 🔄 Flip control during the session if you flipped front↔back.'}${geneNote} Model accuracy ±20-45% by zenith. Inter-individual blood 25(OH)D response to the same UV dose varies an additional 2-3×."><span>Vitamin D</span><strong>${escapeHTML(uiDeps.formatChannelUnit('vitamin_d', sess.doses.vitamin_d, sess.durationMin || 0, sess.safety?.fitzpatrick || 'III', sess.atmosphere?.uvIndex, sessZenith, !!sess.bodyExposure?.rotatedSides, sess.bodyExposure?.fraction || null))}</strong></div>`;
        })() : ''}
      </div>

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Skin exposed · ${fractionPct}%</div>
        <div class="sun-detail-section-value">${escapeHTML(regionLabels)}</div>
      </div>

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Eyes</div>
        <div class="sun-detail-section-value">${escapeHTML(eyeMode + lensTintStr)}</div>
      </div>

      ${modifierBits.length ? `
        <div class="sun-detail-section">
          <div class="sun-detail-section-label">Modifiers</div>
          <div class="sun-detail-section-value">${escapeHTML(modifierBits.join(' · '))}</div>
        </div>
      ` : ''}

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Per-channel dose</div>
        <div class="sun-detail-channels">${channelRows}</div>
      </div>

      ${atmHtml ? `
        <div class="sun-detail-section">
          <div class="sun-detail-section-label">Conditions during this session</div>
          ${atmHtml}
        </div>
      ` : ''}

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Location</div>
        <div class="sun-detail-section-value">${locStr}</div>
      </div>

      ${sess.notes ? `
        <div class="sun-detail-section">
          <div class="sun-detail-section-label">Notes</div>
          <div class="sun-detail-section-value">${escapeHTML(sess.notes)}</div>
        </div>
      ` : ''}

      <div class="modal-actions" style="margin-top:18px">
        ${sess.endedAt ? `<button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove();window.editSunSessionDuration('${escapeAttr(sess.id)}')" title="Override the session duration. Use when a re-end on a second device set it wrong, or you forgot to stop on time.">Edit duration</button>` : ''}
        <button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red)" onclick="this.closest('.modal-overlay').remove();window.deleteSunSession('${escapeAttr(sess.id)}')">Delete session</button>
      </div>
    </div>
  </div>`;
  uiDeps.wireBackdropClose(overlay);
  document.body.appendChild(overlay);
  uiDeps.trapModalFocus(overlay);
  bindDetachedModalSyncRefresh({
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
//   circadian → ~k M-EDI lux (peak melanopic during the session)
//   no_cv / pomc / violet_eye → percent of daily target
// Returns '' when the value is sub-meaningful so chips for low channels
// stay tight (icon + label only).
function _sessionChipValue(channelKey, channelAu, sess) {
  if (!Number.isFinite(channelAu) || channelAu <= 0) return '';
  const meta = uiDeps.channelDisplay[channelKey] || {};
  const fitz = sess?.safety?.fitzpatrick || 'III';
  const uvi = sess?.atmosphere?.uvIndex ?? null;
  const dur = sess?.durationMin || 0;
  // Mirror formatChannelUnit's too-short gate: short sessions get the
  // icon + label only, no spurious value. Keeps the chip readable
  // without misleading numbers.
  if (dur > 0 && dur < uiDeps.tooShortForChannelVerdictMin) return '';
  if (channelKey === 'vitamin_d' && typeof window.vitaminDIU === 'function') {
    // Session chip uses per-session cap when bodyFraction is set
    // (Audit P1 #8). Falls back to daily-cap helper for legacy chip
    // contexts where bodyFraction wasn't recorded.
    const bf = sess?.bodyExposure?.fraction;
    const iu = (Number.isFinite(bf) && bf > 0 && typeof window.vitaminDIUPerSession === 'function')
      ? window.vitaminDIUPerSession(channelAu, fitz, uvi, !!sess?.bodyExposure?.rotatedSides, state.importedData?.genetics || null, bf)
      : window.vitaminDIU(channelAu, fitz, uvi, !!sess?.bodyExposure?.rotatedSides, state.importedData?.genetics || null);
    if (iu < 30) return '';
    if (iu >= 1000) return `~${(iu / 1000).toFixed(1).replace(/\.0$/, '')}k IU`;
    return `~${Math.round(iu / 10) * 10} IU`;
  }
  if (channelKey === 'nir_solar' && typeof window.pbmJoulesPerCm2 === 'function') {
    const j = window.pbmJoulesPerCm2(channelAu);
    if (j < 0.1) return '';
    if (j >= 10) return `${Math.round(j)} J/cm²`;
    return `${j.toFixed(1)} J/cm²`;
  }
  if (channelKey === 'circadian' && dur > 0 && typeof window.circadianMelanopicLux === 'function') {
    const lux = window.circadianMelanopicLux(channelAu, dur);
    if (lux < 100) return '';
    // Round aggressively at this magnitude — peak M-EDI lux is a big
    // number and chip-width-readable form beats decimal precision.
    if (lux >= 10000) return `~${Math.round(lux / 1000)}k lux`;
    if (lux >= 1000) return `~${(lux / 1000).toFixed(1)}k lux`;
    return `~${Math.round(lux / 10) * 10} lux`;
  }
  // Unitless channels — percent-of-daily-target. Past hit-target the
  // exact number is noise (the user got more than enough); collapse
  // anything ≥ 200% to "✓ over" so the chip stays informative without
  // a 4-digit percentage that adds nothing actionable.
  const target = meta.dailyTarget || 0;
  if (target > 0) {
    const pct = Math.round(100 * channelAu / target);
    if (pct < 5) return '';
    if (pct >= 200) return '✓ over';
    if (pct >= 100) return `✓ ${pct}%`;
    return `${pct}%`;
  }
  return '';
}

export function renderChannelChips(doses, sess = null) {
  if (!doses) return '';
  const order = ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'nir_solar'];
  // Top-3 contributing channels for at-a-glance reading. Full grid lives on
  // the Light & Sun page; per-row noise is what the v1.7.0a UX review flagged.
  const ranked = order
    .map(key => ({ key, v: doses[key] || 0, tier: uiDeps.channelTier(doses[key] || 0, key) }))
    .sort((a, b) => b.tier - a.tier || b.v - a.v);
  const showAll = ranked.filter(r => r.tier > 0).length > 3;
  const visible = showAll ? ranked.slice(0, 3) : ranked;
  const chipFor = (r, extraClass = '') => {
    const meta = uiDeps.channelDisplay[r.key];
    const label = meta?.label || r.key.replace('_', ' ');
    const valueStr = _sessionChipValue(r.key, r.v, sess);
    const tip = valueStr
      ? `${meta?.what || ''} — this session: ${valueStr}`
      : `${meta?.what || ''} (level: ${uiDeps.tierLabel(r.tier)})`;
    return `<span class="sun-chip sun-chip-tier-${r.tier}${extraClass}" data-channel="${r.key}" title="${escapeAttr(tip)}">
      <span class="sun-chip-icon">${meta?.icon || '·'}</span>
      <span class="sun-chip-label">${escapeHTML(label)}</span>
      ${valueStr ? `<span class="sun-chip-value">${escapeHTML(valueStr)}</span>` : ''}
    </span>`;
  };
  let html = `<div class="sun-channel-chips">`;
  for (const r of visible) html += chipFor(r);
  if (showAll) {
    html += `<button class="sun-chip-more" onclick="this.parentElement.classList.toggle('sun-chips-expanded')">+ ${ranked.length - 3} more</button>`;
    for (const r of ranked.slice(3)) html += chipFor(r, ' sun-chip-extra');
  }
  html += `</div>`;
  return html;
}

// ─── UI: detailed session log (anatomical regions + sunscreen + glass) ─

export function openDetailedSessionDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  const lastUsed = uiDeps.getSessions().filter(s => s.endedAt).slice(-1)[0];
  const eyeMode = lastUsed?.eyeExposure?.mode || 'direct';
  const lensTint = lastUsed?.eyeExposure?.lensTint || 'clear';
  const lastRegions = new Set(lastUsed?.bodyExposure?.regions || []);

  // Default the "Ended at" picker to now so quick "log the session that just
  // ended" stays one-click. Users backfilling earlier sessions can pick any
  // moment up to the present. <input type="datetime-local"> needs a local-tz
  // string; build it manually so we don't rely on the browser's locale guess.
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmtLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const localNow = fmtLocal(now);
  // Started-at defaults to now − 15 min so the most-common quick-log
  // ("I just had a 15-min session") works with zero edits. Users
  // logging older sessions adjust both timestamps.
  const localStartDefault = fmtLocal(new Date(now.getTime() - 15 * 60 * 1000));

  // Region picker as a checkable chip grid — clearer than a tap-target SVG
  // silhouette per the v1.7.0a UX review. Each chip shows the region label
  // and toggles on click. Free-form, accessible, mobile-friendly.

  overlay.innerHTML = `<div class="modal sun-detailed-modal" role="dialog" aria-label="Past session log">
    <div class="modal-header">
      <h3>Log a past session</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">For sessions that already happened. Tap each body region that was uncovered.${lastUsed ? ' Body regions, eyewear, and lens tint default to your last session.' : ''}</p>

      <label class="ctx-label">Body regions exposed</label>
      <div class="sun-silhouette-wrap" id="sun-silhouette-slot">${renderBodySilhouette(lastRegions)}</div>
      <div class="sun-silhouette-hint" id="sun-silhouette-hint">Tap any body region to toggle whether it was uncovered.</div>

      <div class="sun-detailed-row">
        <label class="ctx-label">Started at
          <input type="datetime-local" id="det-started-at" class="ctx-input" value="${escapeAttr(localStartDefault)}" max="${escapeAttr(localNow)}" />
        </label>
        <label class="ctx-label">Ended at
          <input type="datetime-local" id="det-ended-at" class="ctx-input" value="${escapeAttr(localNow)}" max="${escapeAttr(localNow)}" />
        </label>
      </div>
      <div class="sun-silhouette-hint" id="det-duration-hint" style="margin-top:-6px">Duration: 15 min</div>

      <div class="sun-detailed-row">
        <label class="ctx-label">Sunscreen SPF
          <input type="number" id="det-spf" class="ctx-input" min="0" max="100" placeholder="none" />
        </label>
        <div class="ctx-label sun-detailed-glass" style="margin-top:24px;display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span style="flex:1;min-width:0">Behind glass (window / car / sunroom)</span>
          <label class="toggle-switch">
            <input type="checkbox" id="det-glass" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="sun-detailed-row">
        <label class="ctx-label">Eyes
          <select id="det-eye-mode" class="ctx-select">
            ${uiDeps.eyeModes.map(e => `<option value="${escapeAttr(e.key)}"${e.key === eyeMode ? ' selected' : ''}>${escapeHTML(e.pickerLabel || e.label)}</option>`).join('')}
          </select>
        </label>
        <label class="ctx-label">Lens tint
          <select id="det-lens-tint" class="ctx-select">
            ${uiDeps.lensTints.map(l => `<option value="${escapeAttr(l.key)}"${l.key === lensTint ? ' selected' : ''}>${escapeHTML(l.label)}</option>`).join('')}
          </select>
        </label>
      </div>

      <div class="sun-detailed-row">
        <label class="ctx-label">Posture
          <select id="det-posture" class="ctx-select">
            ${uiDeps.postureOptions.map(o => `<option value="${escapeAttr(o.key)}"${o.key === (lastUsed?.posture || 'standing') ? ' selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
          </select>
        </label>
        <label class="ctx-label">Surface
          <select id="det-surface" class="ctx-select">
            ${uiDeps.surfaceOptions.map(o => `<option value="${escapeAttr(o.key)}"${o.key === (lastUsed?.surfaceAlbedo || 'grass') ? ' selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
          </select>
        </label>
      </div>

      <label class="ctx-label">Notes
        <textarea id="det-notes" class="ctx-input" rows="2" placeholder="Optional"></textarea>
      </label>

      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-primary" id="det-save">Save session</button>
      </div>
    </div>
  </div>`;
  uiDeps.wireBackdropClose(overlay);
  document.body.appendChild(overlay);
  uiDeps.trapModalFocus(overlay);

  const selected = new Set(lastRegions);
  const slot = overlay.querySelector('#sun-silhouette-slot');
  const hint = overlay.querySelector('#sun-silhouette-hint');
  const updateHint = () => {
    if (!hint) return;
    const fraction = Array.from(selected).reduce((sum, key) => {
      const r = BODY_REGIONS.find(b => b.key === key);
      return sum + (r?.fraction || 0);
    }, 0);
    if (selected.size === 0) {
      hint.textContent = 'Tap any body region to toggle whether it was uncovered.';
    } else {
      const labels = Array.from(selected).map(k => BODY_REGIONS.find(b => b.key === k)?.label || k).join(', ');
      hint.textContent = `${selected.size} region${selected.size === 1 ? '' : 's'} exposed (${(fraction * 100).toFixed(0)}% of skin) — ${labels}`;
    }
  };
  bindBodySilhouette(slot, selected, updateHint);
  updateHint();

  // Live "Duration: N min" hint derived from the two timestamps. Doubles
  // as a validation channel — surfaces "Ended must be after Started"
  // and "over 4 hours" right under the inputs without a separate error
  // field. Clamps display only; save handler does the final validation.
  const startEl = overlay.querySelector('#det-started-at');
  const endEl = overlay.querySelector('#det-ended-at');
  const hintEl = overlay.querySelector('#det-duration-hint');
  const updateDurationHint = () => {
    if (!startEl || !endEl || !hintEl) return;
    const sMs = new Date(startEl.value).getTime();
    const eMs = new Date(endEl.value).getTime();
    if (!Number.isFinite(sMs) || !Number.isFinite(eMs)) {
      hintEl.textContent = 'Duration: —';
      return;
    }
    const min = Math.round((eMs - sMs) / 60000);
    if (min <= 0) hintEl.textContent = `Ended must be after Started (currently ${min} min)`;
    else if (min > 240) hintEl.textContent = `Duration: ${min} min — over 4 hours, double-check the times`;
    else hintEl.textContent = `Duration: ${min} min`;
  };
  startEl?.addEventListener('input', updateDurationHint);
  endEl?.addEventListener('input', updateDurationHint);
  updateDurationHint();

  overlay.querySelector('#det-save').addEventListener('click', async () => {
    const eyeModeVal = overlay.querySelector('#det-eye-mode').value || 'direct';
    const lensTintVal = overlay.querySelector('#det-lens-tint').value || 'clear';
    const spf = parseInt(overlay.querySelector('#det-spf').value, 10) || null;
    const glass = overlay.querySelector('#det-glass').checked;
    const notes = overlay.querySelector('#det-notes').value || '';

    // Resolve the two timestamps. Both fields default to a sensible
    // 15-min window ending now, so the empty-field fallback never fires
    // in practice — but we guard anyway in case a user clears one.
    const startedAtRaw = overlay.querySelector('#det-started-at').value;
    const endedAtRaw = overlay.querySelector('#det-ended-at').value;
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
    const durationMin = Math.max(1, Math.round((endedAt - start) / 60000));

    // Compute exposure fraction from selected regions
    const regions = Array.from(selected);
    const fraction = regions.reduce((sum, key) => {
      const r = BODY_REGIONS.find(b => b.key === key);
      return sum + (r?.fraction || 0);
    }, 0);
    const posture = overlay.querySelector('#det-posture')?.value || 'standing';
    const surfaceAlbedo = overlay.querySelector('#det-surface')?.value || 'grass';
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
      bodyExposure: { preset: regions.length === 0 ? 'face_hands' : 'detailed', fraction: Math.max(0.05, fraction), regions, sunscreenSPF: spf, glassBetween: glass },
      eyeExposure: { mode: eyeModeVal, lensTint: lensTintVal, durationSec: durationMin * 60 },
      posture, surfaceAlbedo,
      notes,
    });
    if (sessId) await uiDeps.hydrateSession(sessId);
    overlay.remove();
    showNotification(`Detailed session saved: ${durationMin} min, ${regions.length} regions.`);
    if (window.navigate && state.currentView === 'light') window.navigate('light');
  });
}

// Delete from window for inline onclick
export async function deleteSunSession(id) {
  if (await showConfirmDialog('Delete this sun session?')) {
    await uiDeps.deleteSession(id);
    uiDeps.refreshSurfaces();
  }
}

// ─── Window-backed actions ─────────────────────────────────────────────

// User-facing edit-duration entry point — prompts for a new minutes
// value, validates the range, calls updateSession (which bumps
// updatedAt + re-hydrates doses on duration change), then re-renders.
export async function editSunSessionDuration(id) {
  const sess = uiDeps.getSessions().find(s => s.id === id);
  if (!sess) {
    showNotification('Session not found', 'error');
    return;
  }
  const current = Math.max(0, Math.round(sess.durationMin || 0));
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
  await uiDeps.updateSession(id, { durationMin: next });
  showNotification(`Session duration set to ${next} min. Other devices will pull this on next sync.`, 'success');
  if (window.navigate && state.currentView === 'light') window.navigate('light');
}
