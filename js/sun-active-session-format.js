// @ts-check

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
