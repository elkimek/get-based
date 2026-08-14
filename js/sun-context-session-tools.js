// @ts-check
// sun-context-session-tools.js — Agent-facing Sun session projection APIs.

import { state } from './state.js';
import { sunContextDeps, _debugWarn } from './sun-context-runtime.js';

const SLICE_DEFAULT_FIELDS = ['date', 'duration', 'channels', 'safety', 'atmosphere', 'body'];
const SLICE_ALL_FIELDS = ['date', 'duration', 'channels', 'safety', 'atmosphere', 'body', 'eyes', 'location', 'notes'];

// Project a sun session to a canonical, cap-bounded shape. `fields`
// gates each section so callers can ask for only the columns they need.
function projectSession(sess, fields) {
  const out = {};
  if (fields.includes('date') && sess.startedAt) {
    out.date = new Date(sess.startedAt).toISOString().slice(0, 10);
  }
  if (fields.includes('duration')) {
    out.durationMin = Math.round(sess.durationMin || 0);
  }
  if (fields.includes('channels') && sess.doses) {
    out.channels = {};
    for (const [k, v] of Object.entries(sess.doses)) {
      out.channels[k] = Math.round(v * 10) / 10;
    }
  }
  if (fields.includes('safety') && sess.safety) {
    const s = sess.safety;
    out.safety = {
      sed: s.sed != null ? +s.sed.toFixed(2) : null,
      medFraction: s.medFraction != null ? +s.medFraction.toFixed(2) : null,
      fitzpatrick: s.fitzpatrick || null,
      ocularActinicUV: (s.ocularActinicUV ?? s.retinalUV) != null ? +(s.ocularActinicUV ?? s.retinalUV).toFixed(1) : null,
    };
  }
  if (fields.includes('atmosphere') && sess.atmosphere) {
    const a = sess.atmosphere;
    out.atmosphere = {
      uvIndex: a.uvIndex != null ? +a.uvIndex.toFixed(1) : null,
      ozoneDU: a.ozoneDU || null,
      cloudCover: a.cloudCover != null ? a.cloudCover : null,
      temperatureC: a.temperatureC != null ? Math.round(a.temperatureC) : null,
      source: a.source || null,
      confidence: a.confidence != null ? +a.confidence.toFixed(2) : null,
    };
  }
  if (fields.includes('body') && sess.bodyExposure) {
    const b = sess.bodyExposure;
    out.body = {
      preset: b.preset || null,
      fraction: b.fraction != null ? +b.fraction.toFixed(2) : null,
      regions: Array.isArray(b.regions) ? b.regions.slice() : [],
      sunscreenSPF: b.sunscreenSPF || null,
      glassBetween: !!b.glassBetween,
    };
  }
  if (fields.includes('eyes') && sess.eyeExposure) {
    const e = sess.eyeExposure;
    out.eyes = {
      mode: e.mode || null,
      lensTint: e.lensTint || 'clear',
      durationSec: e.durationSec || 0,
    };
  }
  if (fields.includes('location') && sess.location) {
    // Honor the user's network privacyRounding setting; default to 0.01°.
    let p = 0.01;
    try {
      const cfg = typeof sunContextDeps.getMeteoConfig === 'function' ? sunContextDeps.getMeteoConfig() : null;
      p = cfg?.privacyRounding || 0.01;
    } catch (e) {
      _debugWarn('[sun-context] getMeteoConfig failed', e);
    }
    const f = 1 / p;
    out.location = {
      lat: Math.round(sess.location.lat * f) / f,
      lon: Math.round(sess.location.lon * f) / f,
      altitudeM: sess.location.altitudeM || 0,
      privacyRoundingDeg: p,
    };
  }
  if (fields.includes('notes') && sess.notes) out.notes = sess.notes;
  return out;
}

// Agent-callable. Returns recent sessions projected to requested fields,
// capped at `days` (max 90). Location stays off by default.
/**
 * @param {{ days?: number, fields?: string[], includeActive?: boolean }} [opts]
 */
export function getSunSessionsSlice({ days = 30, fields, includeActive = false } = {}) {
  const sessions = state.importedData?.sunSessions || [];
  if (sessions.length === 0) return [];
  const cap = Math.max(1, Math.min(90, Math.floor(days)));
  const cutoff = Date.now() - cap * 86400 * 1000;
  let selectedFields = Array.isArray(fields) && fields.length > 0
    ? fields.filter(field => SLICE_ALL_FIELDS.includes(field))
    : SLICE_DEFAULT_FIELDS.slice();
  if (selectedFields.length === 0) selectedFields = SLICE_DEFAULT_FIELDS.slice();
  const out = [];
  for (const sess of sessions) {
    if (!sess.startedAt || sess.startedAt < cutoff) continue;
    if (!includeActive && !sess.endedAt) continue;
    const projected = projectSession(sess, selectedFields);
    projected.id = sess.id;
    out.push(projected);
  }
  // Most recent first — matches every other Light & Sun list ordering.
  out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return out;
}

// Agent-callable. Returns one session projected to the full field set.
export function getSunSessionDetail(id) {
  const sessions = state.importedData?.sunSessions || [];
  const sess = sessions.find(session => session.id === id);
  if (!sess) return null;
  const projected = projectSession(sess, SLICE_ALL_FIELDS);
  projected.id = sess.id;
  return projected;
}
