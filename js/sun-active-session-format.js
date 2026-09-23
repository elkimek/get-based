// @ts-check
import { escapeHTML } from './utils.js';

export function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = value => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function activeElapsedMs(session, now = Date.now()) {
  const currentPause = session?.paused && Number.isFinite(session?.pausedAt)
    ? Math.max(0, now - session.pausedAt)
    : 0;
  return Math.max(0, now - (session?.startedAt || now) - (session?.accumulatedPausedMs || 0) - currentPause);
}

export function plainStopSummary(session, durationMin, options = {}) {
  if (!session) return `Session saved — ${durationMin} min`;
  const parts = [`Saved · ${durationMin} min outside`];
  const fitzpatrick = session.safety?.fitzpatrick || 'I';
  const uvIndex = session.atmosphere?.uvIndex;
  const vitaminDAu = session.doses?.vitamin_d || 0;
  if (vitaminDAu > 0 && typeof options.vitaminDIU === 'function') {
    const bodyFraction = session.bodyExposure?.fraction;
    const estimate = Number.isFinite(bodyFraction) && bodyFraction > 0 && typeof options.vitaminDIUPerSession === 'function'
      ? options.vitaminDIUPerSession(vitaminDAu, fitzpatrick, uvIndex, !!session.bodyExposure?.rotatedSides, options.genetics || null, bodyFraction)
      : options.vitaminDIU(vitaminDAu, fitzpatrick, uvIndex, !!session.bodyExposure?.rotatedSides, options.genetics || null);
    if (estimate >= 100) {
      const low = Math.round(estimate * 0.25 / 50) * 50;
      const high = Math.round(estimate * 2 / 50) * 50;
      parts.push(`~${low}–${high} IU-equivalent vitamin D estimate`);
    }
  } else if (session.bodyExposure?.glassBetween) {
    parts.push('negligible modeled vitamin-D-effective UVB through the generic glass model');
  } else if (uvIndex != null) {
    parts.push(`negligible modeled vitamin-D-effective UVB at UVI ${uvIndex.toFixed(1)}`);
  }
  const medFraction = session.safety?.medFraction || 0;
  if (medFraction >= 1) parts.push('over the base skin-type burn estimate — stop UV exposure');
  else if (medFraction >= 0.7) parts.push(`base burn dose ${Math.round(medFraction * 100)}% — close to the modeled limit`);
  else if (medFraction >= 0.3) parts.push(`base burn dose ${Math.round(medFraction * 100)}% — model only; avoid redness`);
  return parts.join(' · ');
}

function _estimateMedMinutes(uvi, fitzpatrick, psmTier, photosensitiveMedScale) {
  if (!Number.isFinite(uvi) || uvi <= 0) return null;
  const fitzMED = { I: 200, II: 250, III: 300, IV: 450, V: 600, VI: 1000 };
  const baseMED = fitzMED[fitzpatrick] ?? fitzMED.III;
  const med = baseMED * (photosensitiveMedScale(psmTier) || 1.0);
  const irradiance = uvi * 25; // 1 UVI unit = 25 mW/m² CIE-erythemal irradiance.
  const seconds = (med * 1000) / irradiance;
  return Math.round(seconds / 60);
}

export function _renderUVIPreflightBanner(uvi, fitzpatrick, psmTier, fitzpatrickAssumed, photosensitiveMedScale) {
  if (!Number.isFinite(uvi)) return '';
  const psmHigh = psmTier === 'moderate' || psmTier === 'severe';
  const fairSkin = fitzpatrick === 'I' || fitzpatrick === 'II';
  if (uvi < 8 && !psmHigh && !fairSkin) return '';
  if (uvi < 5 && !psmHigh) return '';
  const medMin = _estimateMedMinutes(uvi, fitzpatrick, psmTier, photosensitiveMedScale);
  let cls = 'sun-uvi-warn';
  let icon = '☀';
  let title = '';
  if (uvi >= 11) { cls = 'sun-uvi-extreme'; icon = '⚠'; title = `Extreme UV (UVI ${uvi.toFixed(1)})`; }
  else if (uvi >= 8) { cls = 'sun-uvi-veryhigh'; title = `Very high UV (UVI ${uvi.toFixed(1)})`; }
  else { title = `UV ${uvi.toFixed(1)} — burn risk elevated ${psmHigh ? 'by photosensitizer' : 'for fair skin'}`; }
  const medLine = medMin
    ? `${fitzpatrickAssumed ? 'Conservative Type I assumption because skin type is unset' : `Fitzpatrick ${fitzpatrick} base-MED model`}: ~${medMin} min to the modeled base MED under current UVI—not a safe exposure time.`
    : '';
  const medicationLine = psmTier !== 'none'
    ? ' Medication effects are not included because a drug-specific burn threshold cannot be inferred; follow the label or clinician.'
    : '';
  return `<div class="${cls}"><strong>${icon} ${escapeHTML(title)}</strong> ${escapeHTML(medLine + medicationLine)} Use shade, clothing, and suitable sun protection; shorten or skip the session when warnings apply.</div>`;
}

export function _buildStartSessionToast({ regionCount, uvi, psmTier, eyeMode }, normalizePSMTier) {
  const parts = [`Outdoor session started · ${regionCount} region${regionCount === 1 ? '' : 's'} exposed`];
  const notes = [];
  if (Number.isFinite(uvi) && uvi >= 11) notes.push(`extreme UV ${uvi.toFixed(1)}`);
  else if (Number.isFinite(uvi) && uvi >= 8) notes.push(`high UV ${uvi.toFixed(1)}`);
  const tier = normalizePSMTier(psmTier);
  if (tier === 'unknown') notes.push('sunlight warnings not reviewed');
  else if (tier !== 'none') notes.push(`${tier} photosensitivity caution`);
  if (eyeMode === 'direct') notes.push('eyes uncovered');
  if (notes.length) parts.push(`${notes.join(' + ')} · keep it short`);
  return parts.join(' · ');
}
