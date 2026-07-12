// @ts-check
// light-next-step.js — deterministic, safety-first action for the Light page.

import { escapeHTML, escapeAttr } from './utils.js';

function localDayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sessionDayKey(session) {
  const ts = session?.endedAt || session?.startedAt;
  return Number.isFinite(ts) ? localDayKey(new Date(ts)) : '';
}

function locationTimeMs(value, offsetSeconds = 0) {
  if (typeof value !== 'string') return new Date(value).getTime();
  if (/[zZ]$|[+-]\d\d:\d\d$/.test(value)) return new Date(value).getTime();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return new Date(value).getTime();
  return Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], match[6] ? +match[6] : 0)
    - (Number(offsetSeconds) || 0) * 1000;
}

function result(tone, eyebrow, title, body, reason, action = null) {
  return { tone, eyebrow, title, body, reason, action };
}

/**
 * Return one useful action from current conditions and recorded behavior.
 * This deliberately avoids health-outcome targets and never asks the user to
 * increase UV exposure to improve a score.
 * @param {Record<string, any>} input
 */
export function buildBestNextStep(input = {}) {
  const now = input.now instanceof Date ? input.now : new Date(input.now || Date.now());
  const hour = now.getHours();
  const atmosphere = input.atmosphere || null;
  const uvi = Number.isFinite(atmosphere?.uvIndex) ? Number(atmosphere.uvIndex) : null;
  const medToday = Math.max(0, Number(input.medToday) || 0);
  const medYesterday = Math.max(0, Number(input.medYesterday) || 0);
  const psmTier = String(input.photosensitiveMedTier || 'none');
  const sunToday = (input.sessions || []).some(session => session?.endedAt && sessionDayKey(session) === localDayKey(now));
  const offsetSeconds = Number(atmosphere?.hourly?.utcOffsetSeconds) || 0;
  const sunriseMs = atmosphere?.daily?.sunrise ? locationTimeMs(atmosphere.daily.sunrise, offsetSeconds) : NaN;
  const sunsetMs = atmosphere?.daily?.sunset ? locationTimeMs(atmosphere.daily.sunset, offsetSeconds) : NaN;
  const beforeSunrise = Number.isFinite(sunriseMs) && now.getTime() < sunriseMs;
  const afterSunset = Number.isFinite(sunsetMs) && now.getTime() >= sunsetMs;

  if (input.activeSun) {
    return result(
      'active',
      'Session in progress',
      'Keep the live timer in view',
      'The app is updating modeled exposure as conditions change. Stop if your skin feels hot or uncomfortable; do not wait for redness.',
      uvi != null ? `Current UVI ${uvi.toFixed(1)} · live session running` : 'Live session running · current UVI is still loading',
      { type: 'quick-log-sun', label: 'Stop sun session' }
    );
  }

  if (input.activeDevice) {
    return result(
      'active',
      'Session in progress',
      'Your light-device timer is running',
      'Keep the device at the logged distance and follow its eye-protection and duration instructions.',
      'Device output is estimated from its saved specification',
      { type: 'scroll-live-session', label: 'View live timer' }
    );
  }

  if (medToday >= 1) {
    return result(
      'danger',
      'Safety first',
      'Avoid more UV today',
      'The modeled burn threshold has been reached. Choose shade, clothing, and indoor or non-UV light instead.',
      `${Math.round(medToday * 100)}% modeled burn dose recorded today`,
      { type: 'scroll-conditions', label: 'Review conditions' }
    );
  }

  if (medToday >= 0.7 || (medToday + medYesterday > 1 && medToday >= 0.3)) {
    return result(
      'caution',
      'Protect your skin',
      'Choose shade for the rest of today',
      'You already have substantial modeled UV exposure. More is not needed to complete a chart or comparison band.',
      `${Math.round(medToday * 100)}% modeled burn dose today${medYesterday ? ` · ${Math.round(medYesterday * 100)}% yesterday` : ''}`,
      { type: 'scroll-conditions', label: 'Review conditions' }
    );
  }

  if (!input.hasCoords) {
    return result(
      'setup',
      'Unlock local guidance',
      'Add your location',
      'Location lets the app show current UV, sunrise and sunset, and whether an outdoor break makes sense now.',
      'No location is available for this profile',
      { type: 'request-precise-location', label: 'Use my location' }
    );
  }

  if (!input.hasSkinType) {
    return result(
      'setup',
      input.setupDeferred ? 'Ready when you are' : 'One detail needed',
      input.setupDeferred ? 'Finish setup when you’re ready' : 'Set your skin sensitivity',
      'This makes UV warnings more relevant. Home lighting, eyewear, and the routine check can be added later.',
      'Current conditions can load, but burn estimates need a confirmed skin type',
      { type: 'open-light-setup', label: 'Set skin sensitivity' }
    );
  }

  if (hour >= 20 || hour < 5 || afterSunset) {
    return result(
      'evening',
      'Evening move',
      'Make the next hour visibly dimmer',
      'Lower the brightest room light and reduce screen brightness. The aim is a clear contrast with daytime—not perfect darkness.',
      sunToday ? 'Outdoor light is already logged today · it is now late evening' : 'It is late evening · no extra outdoor-light target is needed',
      { type: 'open-light-environment', label: input.hasRooms ? 'Review evening setup' : 'Map my evening space' }
    );
  }

  if (psmTier !== 'none') {
    return result(
      'caution',
      'Medicine precaution',
      'Check your sun-sensitivity instructions',
      'Some medicines and supplements can increase sun sensitivity, but the app cannot calculate your exact response. Follow the label or your clinician’s advice and favor shade and protection.',
      `${psmTier} medication-sensitivity flag${uvi != null ? ` · current UVI ${uvi.toFixed(1)}` : ''}`,
      { type: 'scroll-conditions', label: 'Review conditions' }
    );
  }

  if (!atmosphere) {
    return result(
      'loading',
      'Checking outside',
      'Current conditions are loading',
      'The next action will update as soon as current UV and sun timing are available.',
      'Using your location and records while weather data loads',
      { type: 'scroll-conditions', label: 'View conditions' }
    );
  }

  if (uvi != null && uvi >= 8) {
    return result(
      'caution',
      'Very high UV',
      'Use shade if you go outside',
      'Outdoor brightness is available without deliberately exposing skin. Use clothing, sunglasses, shade, and sunscreen as appropriate.',
      `Current UVI ${uvi.toFixed(1)}${psmTier !== 'none' ? ` · ${psmTier} medication-sensitivity flag` : ''}`,
      { type: 'scroll-conditions', label: 'Review conditions' }
    );
  }

  if (sunToday && hour >= 16) {
    return result(
      'done',
      'Useful record made',
      'Let today’s outdoor session be enough',
      'You have an outdoor-light record today. A calmer, dimmer evening is now a more useful experiment than adding exposure.',
      `Outdoor session logged today${uvi != null ? ` · current UVI ${uvi.toFixed(1)}` : ''}`,
      { type: 'open-light-environment', label: input.hasRooms ? 'Review evening setup' : 'Map my evening space' }
    );
  }

  if (beforeSunrise) {
    return result(
      'neutral',
      'Before sunrise',
      'Wait for outdoor light to build',
      'There is no outdoor-light target to complete in darkness. Check again after sunrise or review your indoor morning setup.',
      'Today’s sunrise has not happened yet',
      { type: 'scroll-conditions', label: 'See today’s sun timing' }
    );
  }

  if (hour >= 5 && hour < 20 && !afterSunset) {
    const protection = uvi != null && uvi >= 3
      ? 'Use normal sun protection; this is an outdoor-light break, not a UV target.'
      : 'Comfortable outdoor light is enough; never look at the sun.';
    return result(
      'daylight',
      hour < 10 ? 'Morning opportunity' : 'Daylight opportunity',
      sunToday ? 'A short outdoor break is optional' : 'Take one comfortable outdoor break',
      `${protection} Log it if you want the app to compare your weekly pattern.`,
      `${uvi != null ? `Current UVI ${uvi.toFixed(1)}` : 'UV unavailable'} · ${sunToday ? 'outdoor session already logged today' : 'no outdoor session logged today'}`,
      sunToday
        ? { type: 'scroll-conditions', label: 'Review today’s conditions' }
        : { type: 'quick-log-sun', label: 'Start outdoor log' }
    );
  }

  return result(
    'neutral',
    'Next useful step',
    'Check back in daylight',
    'There is no light target to complete right now. Use the evening to review your room setup or recent records.',
    'Outside the daytime guidance window',
    { type: 'open-light-environment', label: input.hasRooms ? 'Review indoor light' : 'Map a room' }
  );
}

/** @param {ReturnType<typeof buildBestNextStep>} step */
export function renderBestNextStep(step) {
  if (!step) return '';
  const action = step.action
    ? `<button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-next-step-cta" data-light-page-action="${escapeAttr(step.action.type)}">${escapeHTML(step.action.label)}</button>`
    : '';
  return `<section class="light-next-step light-next-step-${escapeAttr(step.tone)}" aria-labelledby="light-next-step-title">
    <div class="light-next-step-marker" aria-hidden="true"></div>
    <div class="light-next-step-content">
      <div class="light-next-step-kicker">${escapeHTML(step.eyebrow)}</div>
      <h3 id="light-next-step-title">${escapeHTML(step.title)}</h3>
      <p>${escapeHTML(step.body)}</p>
      <div class="light-next-step-reason"><span>Why this</span>${escapeHTML(step.reason)}</div>
    </div>
    ${action}
  </section>`;
}
