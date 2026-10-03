// sun-context-environment.js — Indoor light-environment prompt projection.

import { state } from './state.js';
import {
  getRoomEveningHoursAfterSunset,
  roomUsesEveningAfterSunset,
} from './light-env-evening.js';
import { isQuantitativeDarknessMeasurement } from './light-env-model.js';
import {
  sunContextDeps,
  _debugWarn,
  _safeText,
} from './sun-context-runtime.js';


import type { LightRoom, LightScreen, LightMeasurement } from './light-env-model.js';
type RawFields<Model> = { [Key in keyof Model]?: unknown };
interface RoomPromptReader extends RawFields<LightRoom> { aiAnalysis?: { dot?: unknown } | null }
interface ScreenPromptReader extends RawFields<LightScreen> {}
interface MeasurementPromptReader extends Omit<LightMeasurement, 'capturedAt' | 'extra'> {
  roomId?: string; tool: string; capturedAt?: unknown; takenAt?: unknown;
  extra?: NonNullable<LightMeasurement['extra']> & { label?: unknown; levelLabel?: unknown } | null;
}
interface AuditPromptReader { id?: unknown; date?: unknown; label?: unknown; aiAnalysis?: { dot?: unknown } | null; rooms?: RoomPromptReader[] | null; measurements?: MeasurementPromptReader[] | null }
type MeasurementsByRoom = Record<string, Record<string, MeasurementPromptReader>>;
interface BurdenPromptReader { label?: unknown; tier: number }
interface DeficitPromptOperations { d2?: number | null; d3?: number | null; daylightKnown?: unknown; eveningKnown?: unknown }
// Private structural/numeric views preserve unchecked imported-row operations;
// this module exports prompt text, never a validated persisted data record.

// Indoor light environment summary — rooms, screens, light audits,
// computed indoor burden. Returns empty string when nothing is logged
// so the prompt stays compact for users who haven't set this up.
export function lightEnvironmentBlock() {
  const env = state.importedData?.lightEnvironment;
  const audits = (state.importedData?.lightAudits || []) as AuditPromptReader[];
  const rooms = ((env && Array.isArray(env.rooms)) ? env.rooms : []) as RoomPromptReader[];
  const screens = ((env && Array.isArray(env.screens)) ? env.screens : []) as ScreenPromptReader[];
  if (rooms.length === 0 && screens.length === 0 && audits.length === 0) return '';

  let s = `### Indoor light environment\n`;
  if (rooms.length > 0) {
    s += `- Rooms tracked: ${rooms.length}`;
    const eveningRooms = rooms.filter(roomUsesEveningAfterSunset);
    if (eveningRooms.length > 0) {
      s += `; ${eveningRooms.length} used after sunset`;
    }
    s += '\n';
    // Per-room one-liner: name, primary source, hours/day, severity.
    for (const r of rooms) {
      const src = r.primarySource || 'unknown source';
      const hrs = r.hoursOccupiedPerDay ? `${r.hoursOccupiedPerDay}h/day` : '';
      const evHr = getRoomEveningHoursAfterSunset(r);
      const evening = evHr ? `${evHr}h after sunset` : '';
      const severity = r.aiAnalysis?.dot ? ` · AI verdict: ${r.aiAnalysis.dot}` : '';
      const daylight = r.daylightLevel && r.daylightLevel !== 'unknown' ? `${r.daylightLevel} daylight` : '';
      const parts = [src, daylight, hrs, evening].filter(Boolean).join(', ');
      s += `  - ${_safeText(r.name) || 'Room'} (${parts})${severity}\n`;
    }
  }
  if (screens.length > 0) {
    const evening = screens.filter(sc => sc.eveningUseAfterSunset).length;
    const blueOff = screens.filter(sc => sc.eveningUseAfterSunset && !sc.blueBlockerEnabled).length;
    s += `- Screens tracked: ${screens.length}`;
    if (evening > 0) s += `; ${evening} used after sunset`;
    if (blueOff > 0) s += `; ${blueOff} without a recorded blue-reduction measure`;
    s += '\n';
    // Per-screen one-liner: device type, hours, evening use, blocker status.
    for (const sc of screens) {
      const hours = sc.hoursPerDay ? `${sc.hoursPerDay}h/day` : '';
      const eveHr = (sc.eveningUseAfterSunset || 0) as number;
      const eve = eveHr > 0 ? `${eveHr}h after sunset` : 'daytime only';
      const blocker = sc.blueBlockerEnabled ? 'blue reduction noted (not zero exposure)' : 'no blue reduction noted';
      const parts = [hours, eve, blocker].filter(Boolean).join(', ');
      s += `  - ${sc.device || 'screen'} (${parts})\n`;
    }
  }
  // `lightAudits` = before/after snapshots; Tool 8 walkthroughs = per-pause
  // lux measurements bound to rooms (`lightMeasurements` with tool='audit').
  const eyeLevel = ((state.importedData?.lightMeasurements || []) as MeasurementPromptReader[]).filter(m => m && m.tool === 'audit');
  if (audits.length > 0 || eyeLevel.length > 0) {
    const parts: string[] = [];
    if (audits.length > 0) parts.push(`${audits.length} before/after`);
    if (eyeLevel.length > 0) parts.push(`${eyeLevel.length} eye-level`);
    s += `- Light audits: ${parts.join(' · ')}\n`;
    // Cap at five recent audits and show latest reading per room/tool.
    const recentAudits = audits.slice().sort((x, y) => (((y.date || '') as { localeCompare(other: unknown): unknown }).localeCompare(x.date || '') as number)).slice(0, 5);
    const auditsByDateAsc = audits.slice().sort((x, y) => (((x.date || '') as { localeCompare(other: unknown): unknown }).localeCompare(y.date || '') as number));
    const measurementsByAudit = (audit: AuditPromptReader) => {
      const out: MeasurementsByRoom = {};
      for (const m of (audit.measurements || [])) {
        if (!m.roomId) continue;
        const room = out[m.roomId] = out[m.roomId] || {};
        if (!room[m.tool] || ((m.capturedAt || 0) as number) > ((room[m.tool]!.capturedAt || 0) as number)) room[m.tool] = m;
      }
      return out;
    };
    const formatMetric = (current: unknown, prior: unknown, formatValue: (value: unknown) => string, formatDelta: ((current: unknown, previous: unknown) => string | null) | null) => {
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
      const priorAudit = thisIndex > 0 ? auditsByDateAsc[thisIndex - 1]! : null;
      const headerTag = priorAudit
        ? ` · delta vs ${priorAudit.date || '?'}`
        : ' · baseline — no prior audit to compare';
      s += `  - ${audit.date || '?'}: ${label} (${(audit.rooms || []).length} rooms, ${(audit.measurements || []).length} measurements)${dot}${headerTag}\n`;
      const roomById = (Object.fromEntries as (entries: Iterable<readonly [unknown, RoomPromptReader]>) => Record<string, RoomPromptReader>)((audit.rooms || []).map(room => [room.id, room]));
      const byRoom = measurementsByAudit(audit);
      const priorByRoom = priorAudit ? measurementsByAudit(priorAudit) : {};
      for (const [roomId, byTool] of Object.entries(byRoom)) {
        const room = roomById[roomId];
        if (!room) continue;
        const prior = priorByRoom[roomId] || {};
        const lux = formatMetric(
          byTool.lux?.value, prior.lux?.value,
          value => `${Math.round(value as number)} photopic lux`,
          (current, previous) => {
            const delta = Math.round((current as number) - (previous as number));
            return (delta > 0 ? '+' : '') + delta + ' lux';
          });
        const cct = formatMetric(
          byTool.cct?.value, prior.cct?.value,
          value => `~${Math.round((value as number) / 100) * 100}K camera estimate`,
          (current, previous) => {
            const delta = Math.round((current as number) - (previous as number));
            return (delta > 0 ? '+' : '') + delta + 'K';
          });
        const flicker = formatMetric(
          byTool.flicker?.value, prior.flicker?.value,
          value => `camera banding score ${Math.round(value as number)}`,
          (current, previous) => {
            const delta = Math.round((current as number) - (previous as number));
            return (delta > 0 ? '+' : '') + delta;
          });
        const darkness = formatMetric(
          byTool.darkness?.value, prior.darkness?.value,
          value => byTool.darkness?.extra?.method === 'camera-relative'
            ? `sleep-light camera check ${byTool.darkness.extra?.levelLabel || 'qualitative'}`
            : `sleep-time meter ${Number(value).toFixed(1)} photopic lux`,
          (current, previous) => {
            if (byTool.darkness?.extra?.method === 'camera-relative' || prior.darkness?.extra?.method === 'camera-relative') return null;
            const delta = Number(((current as number) - (previous as number)).toFixed(1));
            return (delta > 0 ? '+' : '') + delta + ' lux';
          });
        let spectrum: string | null = null;
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
      const burden = (sunContextDeps.computeIndoorBurden as () => unknown)() as BurdenPromptReader | null | undefined;
      if (burden && typeof burden === 'object') {
        const burdenLabel = burden.label || ['Generally aligned', 'Mixed signals', 'Needs attention'][burden.tier] || 'unknown';
        let line = `- Indoor light screening picture: ${burdenLabel} (tier ${burden.tier}/2; heuristic context, not measured dose)`;
        if (typeof sunContextDeps.computeDeficitAxes === 'function') {
          try {
            const axes = (sunContextDeps.computeDeficitAxes as () => unknown)() as DeficitPromptOperations | null | undefined;
            if (axes && (axes.d2 != null || axes.d3 != null)) {
              line += ` · d2=${(axes.d2 ?? 0).toFixed(2)} and d3=${(axes.d3 ?? 0).toFixed(2)} (bounded 0–10 screening scores, not hours/dose) · daylight evidence ${axes.daylightKnown || 0}, evening evidence ${axes.eveningKnown || 0}`;
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
  const recent = (state.importedData?.lightMeasurements || []) as MeasurementPromptReader[];
  const roomNames = new Map<unknown, string>();
  for (const room of rooms) {
    if (room && room.id) roomNames.set(room.id, _safeText(room.name) || 'a room');
  }
  const roomTag = (id: unknown) => {
    if (!id) return '';
    const name = roomNames.get(id);
    return ` · in ${name || 'unknown room'}`;
  };
  const warnings: string[] = [];
  for (const measurement of recent) {
    if (measurement.tool === 'flicker' && Number.isFinite(measurement.value) && (measurement.value as number) >= 2) {
      warnings.push(`camera banding score ${measurement.value} (rolling-shutter pattern; no frequency inferred)${roomTag(measurement.roomId)}`);
    } else if ((isQuantitativeDarknessMeasurement as (measurement: Pick<MeasurementPromptReader, 'tool' | 'value' | 'extra'>) => ReturnType<typeof isQuantitativeDarknessMeasurement>)(measurement) && (measurement.value as number) > 1) {
      warnings.push(`sleep-time meter entry ${(measurement.value as number).toFixed(1)} photopic lux (spectrum and melanopic EDI unknown)${roomTag(measurement.roomId)}`);
    } else if (measurement.tool === 'cct' && Number.isFinite(measurement.value) && (measurement.value as number) > 3500) {
      const capturedAt = measurement.capturedAt || measurement.takenAt;
      const hour = capturedAt ? new Date(capturedAt as string | number).getHours() : null;
      if (hour != null && hour >= 19) {
        warnings.push(`after-sunset camera warm/cool estimate ~${Math.round((measurement.value as number) / 100) * 100}K (not spectrum or melanopic EDI)${roomTag(measurement.roomId)}`);
      }
    }
  }
  if (warnings.length > 0) {
    s += `- Active light-tool warnings: ${warnings.slice(0, 6).join('; ')}${warnings.length > 6 ? `; +${warnings.length - 6} more` : ''}\n`;
  }
  return s + '\n';
}
