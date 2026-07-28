// @ts-check
// sun-context-environment.js — Indoor light-environment prompt projection.

import { state } from './state.js';
import {
  getRoomEveningHoursAfterSunset,
  roomUsesEveningAfterSunset,
} from './light-env-evening.js';
import {
  sunContextDeps,
  _debugWarn,
  _safeText,
} from './sun-context-runtime.js';

// Indoor light environment summary — rooms, screens, light audits,
// computed indoor burden. Returns empty string when nothing is logged
// so the prompt stays compact for users who haven't set this up.
export function lightEnvironmentBlock() {
  const env = state.importedData?.lightEnvironment;
  const audits = state.importedData?.lightAudits || [];
  const rooms = (env && Array.isArray(env.rooms)) ? env.rooms : [];
  const screens = (env && Array.isArray(env.screens)) ? env.screens : [];
  if (rooms.length === 0 && screens.length === 0 && audits.length === 0) return '';

  let s = `### Indoor light environment\n`;
  if (rooms.length > 0) {
    s += `- Rooms tracked: ${rooms.length}`;
    const eveningRooms = rooms.filter(roomUsesEveningAfterSunset);
    if (eveningRooms.length > 0) {
      s += `; ${eveningRooms.length} used after sunset`;
    }
    const blueBlocked = rooms.filter(r => r.blueBlocker).length;
    if (blueBlocked > 0) s += `; ${blueBlocked} with blue-blocker`;
    s += '\n';
    // Per-room one-liner: name, primary source, hours/day, severity.
    for (const r of rooms) {
      const src = r.primarySource || 'unknown source';
      const hrs = r.hoursOccupiedPerDay ? `${r.hoursOccupiedPerDay}h/day` : '';
      const evHr = getRoomEveningHoursAfterSunset(r);
      const evening = evHr ? `${evHr}h after sunset` : '';
      const severity = r.aiAnalysis?.dot ? ` · AI verdict: ${r.aiAnalysis.dot}` : '';
      const parts = [src, hrs, evening].filter(Boolean).join(', ');
      s += `  - ${_safeText(r.name) || 'Room'} (${parts})${severity}\n`;
    }
  }
  if (screens.length > 0) {
    const evening = screens.filter(sc => sc.eveningUseAfterSunset).length;
    const blueOff = screens.filter(sc => sc.eveningUseAfterSunset && !sc.blueBlocker).length;
    s += `- Screens tracked: ${screens.length}`;
    if (evening > 0) s += `; ${evening} used after sunset`;
    if (blueOff > 0) s += ` (${blueOff} without blue-blocker — direct retinal melatonin suppression)`;
    s += '\n';
    // Per-screen one-liner: device type, hours, evening use, blocker status.
    for (const sc of screens) {
      const hours = sc.hoursPerDay ? `${sc.hoursPerDay}h/day` : '';
      const eveHr = sc.eveningUseAfterSunset || 0;
      const eve = eveHr > 0 ? `${eveHr}h after sunset` : 'daytime only';
      const blocker = sc.blueBlockerEnabled ? '✓ blocker' : '✗ no blocker';
      const parts = [hours, eve, blocker].filter(Boolean).join(', ');
      s += `  - ${sc.device || 'screen'} (${parts})\n`;
    }
  }
  // `lightAudits` = before/after snapshots; Tool 8 walkthroughs = per-pause
  // lux measurements bound to rooms (`lightMeasurements` with tool='audit').
  const eyeLevel = (state.importedData?.lightMeasurements || []).filter(m => m && m.tool === 'audit');
  if (audits.length > 0 || eyeLevel.length > 0) {
    const parts = [];
    if (audits.length > 0) parts.push(`${audits.length} before/after`);
    if (eyeLevel.length > 0) parts.push(`${eyeLevel.length} eye-level`);
    s += `- Light audits: ${parts.join(' · ')}\n`;
    // Cap at five recent audits and show latest reading per room/tool.
    const recentAudits = audits.slice().sort((x, y) => (y.date || '').localeCompare(x.date || '')).slice(0, 5);
    const auditsByDateAsc = audits.slice().sort((x, y) => (x.date || '').localeCompare(y.date || ''));
    const measurementsByAudit = audit => {
      const out = {};
      for (const m of (audit.measurements || [])) {
        if (!m.roomId) continue;
        const room = out[m.roomId] = out[m.roomId] || {};
        if (!room[m.tool] || (m.capturedAt || 0) > (room[m.tool].capturedAt || 0)) room[m.tool] = m;
      }
      return out;
    };
    const formatMetric = (current, prior, formatValue, formatDelta) => {
      const currentText = current != null ? formatValue(current) : null;
      const priorText = prior != null ? formatValue(prior) : null;
      if (currentText == null) return null;
      if (priorText == null) return currentText;
      const delta = formatDelta ? formatDelta(current, prior) : null;
      return delta ? `${priorText}→${currentText} (${delta})` : `${priorText}→${currentText}`;
    };
    for (const audit of recentAudits) {
      const label = audit.label || `Audit`;
      const dot = audit.aiAnalysis?.dot ? ` · AI verdict: ${audit.aiAnalysis.dot}` : '';
      const thisIndex = auditsByDateAsc.findIndex(candidate => candidate.id === audit.id);
      const priorAudit = thisIndex > 0 ? auditsByDateAsc[thisIndex - 1] : null;
      const headerTag = priorAudit
        ? ` · delta vs ${priorAudit.date || '?'}`
        : ' · baseline — no prior audit to compare';
      s += `  - ${audit.date || '?'}: ${label} (${(audit.rooms || []).length} rooms, ${(audit.measurements || []).length} measurements)${dot}${headerTag}\n`;
      const roomById = Object.fromEntries((audit.rooms || []).map(room => [room.id, room]));
      const byRoom = measurementsByAudit(audit);
      const priorByRoom = priorAudit ? measurementsByAudit(priorAudit) : {};
      for (const [roomId, byTool] of Object.entries(byRoom)) {
        const room = roomById[roomId];
        if (!room) continue;
        const prior = priorByRoom[roomId] || {};
        const lux = formatMetric(
          byTool.lux?.value, prior.lux?.value,
          value => `${Math.round(value)} lux`,
          (current, previous) => {
            const delta = Math.round(current - previous);
            return (delta > 0 ? '+' : '') + delta + ' lux';
          });
        const cct = formatMetric(
          byTool.cct?.value, prior.cct?.value,
          value => `${Math.round(value)}K`,
          (current, previous) => {
            const delta = Math.round(current - previous);
            return (delta > 0 ? '+' : '') + delta + 'K';
          });
        const flicker = formatMetric(
          byTool.flicker?.value, prior.flicker?.value,
          value => `flicker ${Math.round(value)}`,
          (current, previous) => {
            const delta = Math.round(current - previous);
            return (delta > 0 ? '+' : '') + delta;
          });
        const darkness = formatMetric(
          byTool.darkness?.value, prior.darkness?.value,
          value => `darkness ${Number(value).toFixed(1)} lux`,
          (current, previous) => {
            const delta = Number((current - previous).toFixed(1));
            return (delta > 0 ? '+' : '') + delta + ' lux';
          });
        let spectrum = null;
        if (byTool.spectrum) {
          const current = byTool.spectrum.value || byTool.spectrum.extra?.label || '?';
          const previous = prior.spectrum
            ? (prior.spectrum.value || prior.spectrum.extra?.label || '?')
            : null;
          spectrum = previous && previous !== current
            ? `spectrum ${previous}→${current}`
            : `spectrum: ${current}`;
        }
        const parts = [lux, cct, flicker, darkness, spectrum].filter(Boolean);
        if (parts.length) s += `    · ${_safeText(room.name) || 'Room'}: ${parts.join(', ')}\n`;
      }
    }
  }
  // Indoor burden tier + deficit axes — collapsed onto one line.
  if (typeof sunContextDeps.computeIndoorBurden === 'function') {
    try {
      const burden = sunContextDeps.computeIndoorBurden();
      if (burden && typeof burden === 'object') {
        const burdenLabel = burden.label || ['Light load', 'Moderate load', 'Heavy load'][burden.tier] || 'unknown';
        let line = `- Indoor light burden: ${burdenLabel} (tier ${burden.tier}/2 · 0=light, 2=heavy across screens/sleep/daylight)`;
        if (typeof sunContextDeps.computeDeficitAxes === 'function') {
          try {
            const axes = sunContextDeps.computeDeficitAxes();
            if (axes && (axes.d2 != null || axes.d3 != null)) {
              line += ` · d2=${(axes.d2 ?? 0).toFixed(2)} (intensity gap, 0=no gap, 5+=severe) · d3=${(axes.d3 ?? 0).toFixed(2)} (after-sunset blue, 0=clean, 3+=heavy)`;
            }
          } catch (e) {
            _debugWarn('[sun-context] computeDeficitAxes failed', e);
          }
        }
        s += line + '\n';
      }
    } catch (e) {
      _debugWarn('[sun-context] indoor-burden line build failed', e);
    }
  }
  // Surface only warning-level current measurements.
  const recent = state.importedData?.lightMeasurements || [];
  const roomNames = new Map();
  for (const room of rooms) {
    if (room && room.id) roomNames.set(room.id, _safeText(room.name) || 'a room');
  }
  const roomTag = id => {
    if (!id) return '';
    const name = roomNames.get(id);
    return ` · in ${name || 'unknown room'}`;
  };
  const warnings = [];
  for (const measurement of recent) {
    if (measurement.tool === 'flicker' && Number.isFinite(measurement.value) && measurement.value >= 2) {
      warnings.push(`flicker score ${measurement.value} (visible PWM)${roomTag(measurement.roomId)}`);
    } else if (measurement.tool === 'darkness' && Number.isFinite(measurement.value) && measurement.value > 1) {
      warnings.push(`bedroom too bright at the pillow (${measurement.value.toFixed(1)} lux; WHO threshold for full melatonin = <1 lux)${roomTag(measurement.roomId)}`);
    } else if (measurement.tool === 'cct' && Number.isFinite(measurement.value) && measurement.value > 3500) {
      const hour = measurement.takenAt ? new Date(measurement.takenAt).getHours() : null;
      if (hour != null && hour >= 19) {
        warnings.push(`after-sunset CCT ${measurement.value}K (>3500K = still cool/blue when sun has set)${roomTag(measurement.roomId)}`);
      }
    }
  }
  if (warnings.length > 0) {
    s += `- Active light-tool warnings: ${warnings.slice(0, 6).join('; ')}${warnings.length > 6 ? `; +${warnings.length - 6} more` : ''}\n`;
  }
  return s + '\n';
}
