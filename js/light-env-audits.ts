import type{EnvironmentAIView}from'./light-environment-ai-presentation.js';
// light-env-audits.js — saved Light Environment snapshots and compare UI.
//
// The live environment remains owned by light-env.js. This module receives
// environment access, room severity, and UI refresh callbacks through
// configureLightEnvAudits() so audit storage/rendering can stay separate
// without importing light-env.js back into itself.

import { state } from './state.js';
import { showNotification, showPromptDialog, showConfirmDialog } from './utils.js';
import { saveImportedData } from './data.js';
import { deleteImportedArrayItems } from './data-merge.js';
import { createUniqueId } from './unique-id.js';
import { renderHTML as renderAuditBlockHTML } from './components/LightAuditBlock.svelte.html.js';
import { auditActionValue, auditComparisonArrow, type LightAuditBlockView, type LightAuditCardView, type LightAuditDetailView, type LightAuditComparisonView, type LightAuditComparisonRoomView, type LightAuditComparisonRowView } from './light-audit-presentation.js';

// Mirrors the EMF Assessment pattern: each audit is a dated, labeled,
// immutable snapshot of the rooms + screens + room-mapped measurements at
// that point in time. Used for the "measure -> mitigate -> re-measure ->
// see delta" loop. The live `lightEnvironment.rooms[]` continues to
// drive AI weighting; audits are pure historical records.
//
// Audit shape:
//   { id, date (YYYY-MM-DD), label, notes, rooms: [...deep-copy],
//     screens: [...deep-copy], measurements: [...room-mapped readings, deep-copy],
//     createdAt, updatedAt? }

import type { LightRoom, LightScreen, LightMeasurement } from './light-env-model.js';

// These private views describe unchecked readers, not normalized persisted DTOs.
type AuditRoomReader = { [Key in keyof LightRoom]?: unknown };
type AuditScreenReader = { [Key in keyof LightScreen]?: unknown };
interface AuditMeasurementReader extends Record<string, unknown> { tool?: unknown; roomId?: unknown; value?: unknown; capturedAt?: unknown; extra?: Record<string, unknown> | null }
interface AuditReader extends Record<string, unknown> { id?: unknown; date?: unknown; label?: unknown; notes?: unknown; rooms?: AuditRoomReader[] | null; screens?: AuditScreenReader[] | null; measurements?: AuditMeasurementReader[] | null; createdAt?: unknown; updatedAt?: unknown }
interface EnvironmentReader { rooms?: AuditRoomReader[] | null; screens?: unknown }
interface SeverityReader { tier: number; color?: unknown; label?: unknown; reason?: unknown }
interface ArithmeticMeasurementReader extends Omit<AuditMeasurementReader, 'value' | 'extra'> { value: number; extra: { cameraBlueRatioProxy: number; melanopic: number } }
type AuditDependencyName = 'getEnvironment' | 'computeRoomSeverity' | 'refreshLightEnvironmentUI' | 'hasAIProvider' | 'maybeAnalyzeAuditAfterSave' | 'getAuditAIView' | 'getAuditDotView' | 'openChatPanel';
type AuditDependencies = Record<AuditDependencyName, unknown>;
interface ComparisonChannel { tool: string; label: string; fmt: (value: unknown, measurement?: AuditMeasurementReader | null) => string; better: string }
interface KeyedRoom { key: unknown; room: AuditRoomReader }
const auditDeps: AuditDependencies = {
  getEnvironment: () => state.importedData?.lightEnvironment || null,
  computeRoomSeverity: () => ({
    tier: 0,
    color: 'incomplete',
    label: 'Needs setup',
    reason: 'Light environment unavailable',
  }),
  refreshLightEnvironmentUI: () => {},
  hasAIProvider: () => false,
  maybeAnalyzeAuditAfterSave: () => {},
  getAuditAIView: () => null,
  getAuditDotView: () => null,
  openChatPanel: null,
};

const LIGHT_AUDITS_ANCHOR = '.light-audits-shell';
const AUDITS_DEFAULT_CAP = 2;

let _expandedAuditId: unknown = null;
let _auditCompareMode = false;
let _showAllAudits = false;
let _auditsBlockOpen = false;

export function configureLightEnvAudits(deps: unknown = {}) {
  const previous = { ...auditDeps };
  for (const [name, value] of Object.entries((deps || {}) as object)) {
    if (Object.prototype.hasOwnProperty.call(auditDeps, name) && typeof value === 'function') {
      auditDeps[name as AuditDependencyName] = value;
    }
  }
  return previous;
}

function getEnvironmentSnapshot() {
  return (auditDeps.getEnvironment as () => unknown)();
}

function computeRoomSeverity(room: AuditRoomReader | null | undefined, measurements: AuditMeasurementReader[], options: { screens?: AuditScreenReader[]; isActiveToday?: () => boolean } = {}) {
  return (auditDeps.computeRoomSeverity as (room: AuditRoomReader | null | undefined, measurements: AuditMeasurementReader[], options: { screens?: AuditScreenReader[]; isActiveToday?: () => boolean }) => unknown)(room, measurements, options) as SeverityReader;
}

function computeAuditRoomSeverity(audit: AuditReader | null | undefined, room: AuditRoomReader | null | undefined) {
  const measurements = (audit?.measurements || []).filter(m => m.roomId === room?.id);
  const screens = (audit?.screens || []).filter(screen => screen?.roomId === room?.id);
  // A saved audit must be interpreted from its own frozen snapshot, not
  // whichever screens happen to be live today.
  return computeRoomSeverity(room, measurements, { screens, isActiveToday: () => true });
}

function refreshLightEnvironmentUI(options: { scrollAnchor?: string; fallbackScrollAnchor?: string } = {}) {
  (auditDeps.refreshLightEnvironmentUI as (options: { scrollAnchor?: string; fallbackScrollAnchor?: string }) => unknown)(options);
}

function maybeAnalyzeAuditAfterSave(audit: unknown) {
  try { (auditDeps.maybeAnalyzeAuditAfterSave as (audit: unknown) => unknown)(audit); } catch (_) {}
}

function getAuditAIView(audit: unknown) {
  try { return (auditDeps.getAuditAIView as (audit: unknown) => Readonly<EnvironmentAIView> | null)(audit) || null; } catch (_) { return null; }
}

function getAuditDotView(audit: unknown) {
  try { return (auditDeps.getAuditDotView as (audit: unknown) => Readonly<EnvironmentAIView> | null)(audit) || null; } catch (_) { return null; }
}

function hasAuditAIProvider() {
  try { return !!(auditDeps.hasAIProvider as () => unknown)(); } catch (_) { return false; }
}

function openAuditCompareChat(prompt: string) {
  if (typeof auditDeps.openChatPanel !== 'function') {
    showNotification('Chat panel unavailable on this build.', 'error');
    return;
  }
  try { (auditDeps.openChatPanel as (prompt: string) => unknown)(prompt); } catch (_) { showNotification('Chat panel unavailable on this build.', 'error'); }
}

function refreshAuditsUI() {
  _auditsBlockOpen = true;
  refreshLightEnvironmentUI({ scrollAnchor: LIGHT_AUDITS_ANCHOR });
}

function cssAttrSelectorValue(value: unknown) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function lightAuditCardAnchor(id: unknown) {
  return `.light-audit-card[data-id="${cssAttrSelectorValue(id)}"]`;
}

function refreshAuditCardUI(id: unknown) {
  _auditsBlockOpen = true;
  refreshLightEnvironmentUI({
    scrollAnchor: lightAuditCardAnchor(id),
    fallbackScrollAnchor: LIGHT_AUDITS_ANCHOR,
  });
}

export function getLightAudits(): unknown {
  if (!state.importedData) return [];
  if (!Array.isArray(state.importedData.lightAudits)) state.importedData.lightAudits = [];
  return state.importedData.lightAudits;
}

export async function saveLightAudit(label: unknown = '') {
  const env = getEnvironmentSnapshot() as EnvironmentReader | null | undefined;
  if (!env) return null;
  const audits = (getLightAudits() as unknown[]);
  // Snapshot only room-mapped measurements. Unmapped readings do not
  // have enough context to grade or compare an environment change.
  const roomIds = new Set((env.rooms || []).map(r => r.id).filter(Boolean));
  const measurements = ((state.importedData?.lightMeasurements || []) as Array<LightMeasurement & { roomId?: unknown }>)
    .filter(m => m?.roomId && roomIds.has(m.roomId))
    .map(m => JSON.parse(JSON.stringify(m)) as unknown);
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const audit = {
    id: createUniqueId('la_'),
    date,
    label: String(label || `Audit ${audits.length + 1}`).replace(/\s+/g, ' ').trim().slice(0, 80),
    notes: '',
    rooms: JSON.parse(JSON.stringify(env.rooms || [])) as unknown,
    screens: JSON.parse(JSON.stringify(env.screens || [])) as unknown,
    measurements,
    createdAt: Date.now(),
  };
  audits.push(audit);
  await saveImportedData();
  // Audits are explicit checkpoint events — saving one is the user
  // saying "freeze my environment as it is now." Auto-fire the AI
  // verdict so the snapshot is interpretable from the moment it lands,
  // same way session-stop and onboarding-save do. Manual refresh on the
  // card re-rolls. Best-effort, no-throw — sync push handles propagation.
  maybeAnalyzeAuditAfterSave(audit);
  return audit;
}

export async function updateLightAudit(id: unknown, patch: unknown) {
  const audits = (getLightAudits() as AuditReader[]);
  const a = audits.find(x => x.id === id);
  if (!a) return;
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'label')) {
    a.label = String((patch as { label?: unknown }).label || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'notes')) {
    a.notes = String((patch as { notes?: unknown }).notes || '').slice(0, 1000);
  }
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'date')) {
    const date = String((patch as { date?: unknown }).date || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(new Date(`${date}T00:00:00`).getTime())) a.date = date;
  }
  a.updatedAt = Date.now();
  await saveImportedData();
}

export async function deleteLightAudit(id: unknown) {
  deleteImportedArrayItems(state.importedData, 'lightAudits', a => (a as AuditReader).id === id);
  await saveImportedData();
}

// Worst-room-tier rolls up to the audit-level severity badge.
function computeAuditSeverity(audit: AuditReader | null | undefined) {
  const rooms = audit?.rooms || [];
  let worstTier = 0;
  let hasInterpretableRoom = false;
  for (const r of rooms) {
    const sev = computeAuditRoomSeverity(audit, r);
    if (sev.color !== 'incomplete') hasInterpretableRoom = true;
    if (sev.tier > worstTier) worstTier = sev.tier;
  }
  if (rooms.length === 0 || !hasInterpretableRoom) {
    return { tier: 0, color: 'incomplete', label: 'Needs details' };
  }
  const colorMap = ['green', 'yellow', 'orange', 'red', 'red'];
  const labelMap = ['No concern flagged', 'Worth checking', 'Needs attention', 'High signal', 'Strong signal'];
  return { tier: worstTier, color: colorMap[Math.min(worstTier, 4)], label: labelMap[Math.min(worstTier, 4)] };
}

// Most-recent measurement of a tool, scoped to a room, inside an audit.
function latestInAudit(audit: AuditReader | null | undefined, tool: unknown, roomId: unknown) {
  return (audit?.measurements || [])
    .filter(m => m.tool === tool && m.roomId === roomId)
    .sort((a, b) => ((b.capturedAt || 0) as number) - ((a.capturedAt || 0) as number))[0];
}

function fmtAuditDate(d: unknown) {
  return new Date((d as string) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function flickerLabel(score: unknown) {
  return ['No banding detected', 'Some banding', 'Clear banding', 'Strong banding'][Math.min(3, Math.max(0, Math.round(score as number)))] || String(score);
}

function fmtAuditLux(m?: AuditMeasurementReader | null) {
  const value = Math.round(Number(m?.value) || 0);
  if (m?.extra?.source === 'camera-estimate') return `~${value} lux (camera estimate)`;
  if (['AmbientLightSensor', 'manual-entry', 'meter-entry'].includes(m?.extra?.source as string)) return `${value} lux`;
  return `${value} lux (method unknown)`;
}

function fmtAuditDarkness(m?: AuditMeasurementReader | null) {
  if (m?.extra?.method === 'camera-relative') return `${m.extra?.levelLabel || 'Qualitative'} camera check`;
  if (m?.extra?.method === 'meter-entry' || m?.extra?.source === 'meter-entry') return `${Number(m?.value || 0).toFixed(2)} lux (meter)`;
  return `${Number(m?.value || 0).toFixed(2)} legacy value (method unknown)`;
}

function sortAuditsNewestFirst(audits: AuditReader[]) {
  return audits.slice().sort((a, b) => {
    const byDate = ((b.date || '') as { localeCompare(other: unknown): unknown }).localeCompare(a.date || '');
    if (byDate) return byDate as number;
    return ((b.createdAt || 0) as number) - ((a.createdAt || 0) as number);
  });
}

function keepAuditVisible(id: unknown) {
  const visibleIds = new Set(sortAuditsNewestFirst((getLightAudits() as AuditReader[])).slice(0, AUDITS_DEFAULT_CAP).map(a => a.id));
  if (!visibleIds.has(id)) _showAllAudits = true;
}

function readLightAuditCard(a: AuditReader, expanded: boolean): LightAuditCardView {
  const severity = computeAuditSeverity(a);
  const roomsCount = (a.rooms || []).length;
  const measurementsCount = (a.measurements || []).length;
  const date = fmtAuditDate(a.date);
  const meta = `${roomsCount} room${roomsCount === 1 ? '' : 's'} · ${measurementsCount} measurement${measurementsCount === 1 ? '' : 's'}`;
  // Preserve callback order and laziness: dot follows rollup grading; detail
  // callbacks and historical room grading run only for the expanded card.
  const aiDot = getAuditDotView(a);
  return {
    id: String(a.id ?? ''),
    actionId: auditActionValue(a.id),
    expanded,
    ariaLabel: `${date}${a.label ? ' — ' + a.label : ''} — ${roomsCount} room${roomsCount === 1 ? '' : 's'}, ${measurementsCount} measurement${measurementsCount === 1 ? '' : 's'}, ${severity.label}${expanded ? ', expanded' : ', collapsed'}`,
    date,
    label: String(a.label || ''),
    meta,
    severity: { color: String(severity.color), label: String(severity.label ?? '') },
    aiDot,
    detail: expanded ? readLightAuditDetail(a) : null,
  };
}

// Pull the per-channel measurement values for a room inside an audit.
// Returns null for any tool that has no reading; callers decide whether
// to render the row at all.
function _auditRoomChannels(audit: AuditReader, room: AuditRoomReader) {
  const lux = latestInAudit(audit, 'lux', room.id);
  const dark = latestInAudit(audit, 'darkness', room.id);
  const fli = latestInAudit(audit, 'flicker', room.id);
  const cct = latestInAudit(audit, 'cct', room.id) as ArithmeticMeasurementReader | undefined;
  const spec = latestInAudit(audit, 'spectrum', room.id) as ArithmeticMeasurementReader;
  return [
    lux ? { key: 'lux', label: 'Brightness', text: fmtAuditLux(lux) } : null,
    dark ? { key: 'darkness', label: 'Sleep light', text: fmtAuditDarkness(dark) } : null,
    fli ? { key: 'flicker', label: 'Flicker', text: flickerLabel(fli.value) } : null,
    cct ? { key: 'cct', label: 'Warm / cool', text: `~${Math.round(cct.value / 100) * 100} K (camera)` } : null,
    (spec?.extra?.cameraBlueRatioProxy ?? spec?.extra?.melanopic) != null
      ? { key: 'camera-blue-proxy', label: 'Camera blue proxy', text: `${((spec.extra.cameraBlueRatioProxy ?? spec.extra.melanopic) * 100).toFixed(0)}%` }
      : null,
  ].filter(ch => ch !== null);
}

function readLightAuditDetail(audit: AuditReader): LightAuditDetailView {
  const ai = getAuditAIView(audit);
  return {
    date: String(audit.date ?? ''),
    label: String(audit.label || ''),
    ai,
    rooms: (audit.rooms || []).map(room => {
      const severity = computeAuditRoomSeverity(audit, room);
      return {
        name: String(room.name || 'Room'),
        severity: { color: String(severity.color), label: String(severity.label ?? '') },
        channels: _auditRoomChannels(audit, room),
      };
    }),
  };
}

// Per-channel metadata for compare. `better` is the improvement direction:
// flicker down is better; lux, darkness and CCT retain neutral direction.
// The camera blue proxy has its own two-percentage-point deadband below.
const COMPARE_CHANNELS: ComparisonChannel[] = [
  { tool: 'lux',      label: 'Brightness', fmt: (_v, m) => fmtAuditLux(m), better: 'depends' },
  { tool: 'darkness', label: 'Sleep light', fmt: (_v, m) => fmtAuditDarkness(m), better: 'depends' },
  { tool: 'flicker',  label: 'Banding', fmt: v => flickerLabel(v), better: 'lower' },
  { tool: 'cct',      label: 'Warm / cool', fmt: v => `~${Math.round((v as number) / 100) * 100} K`, better: 'depends' },
];

// Serialize an audit pair into a plain-text comparison the AI can
// reason about. Format mirrors EMF's interpretEMFComparison but stays
// terse — only rooms with measurements show up, channels are labeled
// in plain English, deltas are explicit.
function serializeAuditComparison(a1: AuditReader, a2: AuditReader) {
  const fmtDate = (d: unknown) => new Date((d as string) + 'T00:00:00').toLocaleDateString();
  const lines: string[] = [];
  lines.push(`Light environment audit comparison`);
  lines.push(`Before: ${fmtDate(a1.date)}${a1.label ? ` (${a1.label})` : ''}`);
  lines.push(`After:  ${fmtDate(a2.date)}${a2.label ? ` (${a2.label})` : ''}`);
  lines.push('');

  const roomNames = [...new Set([
    ...(a1.rooms || []).map(r => r.name),
    ...(a2.rooms || []).map(r => r.name),
  ])];

  for (const name of roomNames) {
    const r1 = (a1.rooms || []).find(r => r.name === name);
    const r2 = (a2.rooms || []).find(r => r.name === name);
    const sev1 = r1 ? computeAuditRoomSeverity(a1, r1) : null;
    const sev2 = r2 ? computeAuditRoomSeverity(a2, r2) : null;
    const channels: string[] = [];
    for (const ch of COMPARE_CHANNELS) {
      const m1 = r1 ? latestInAudit(a1, ch.tool, r1.id) : null;
      const m2 = r2 ? latestInAudit(a2, ch.tool, r2.id) : null;
      if (!m1 && !m2) continue;
      const before = m1 ? ch.fmt(m1.value, m1) : '—';
      const after = m2 ? ch.fmt(m2.value, m2) : '—';
      channels.push(`  ${ch.label}: ${before} → ${after}`);
    }
    const sp1 = r1 ? latestInAudit(a1, 'spectrum', r1.id) : null;
    const sp2 = r2 ? latestInAudit(a2, 'spectrum', r2.id) : null;
    const mel1 = (sp1?.extra?.cameraBlueRatioProxy ?? sp1?.extra?.melanopic) as number | null | undefined;
    const mel2 = (sp2?.extra?.cameraBlueRatioProxy ?? sp2?.extra?.melanopic) as number | null | undefined;
    if (mel1 != null || mel2 != null) {
      const before = mel1 != null ? `${(mel1 * 100).toFixed(0)}%` : '—';
      const after = mel2 != null ? `${(mel2 * 100).toFixed(0)}%` : '—';
      channels.push(`  Camera RGB blue-ratio proxy (not melanopic EDI): ${before} → ${after}`);
    }
    if (!channels.length && !(sev1 || sev2)) continue;
    let header = `Room: ${name}`;
    if (sev1 && sev2) header += ` — status ${sev1.label} → ${sev2.label}`;
    else if (sev2) header += ` — status (new) ${sev2.label}`;
    else if (sev1) header += ` — status ${sev1.label} (room since removed)`;
    lines.push(header);
    if (channels.length) lines.push(...channels);
    else lines.push('  (no measurements)');
    lines.push('');
  }
  return lines.join('\n').trim();
}

function readLightAuditComparison(audits: AuditReader[]): LightAuditComparisonView {
  const sorted = sortAuditsNewestFirst(audits);
  const after = sorted[0]!;
  const before = (sorted[1] || sorted[0])!;
  // Stable IDs preserve renamed and same-name rooms; old snapshots fall back
  // to their historical name key. Preserve first-seen order across both sides.
  const keyed = (audit: AuditReader): KeyedRoom[] => (audit.rooms || []).map(room => ({ key: room.id || `name:${room.name}`, room }));
  const oldRooms = keyed(before), newRooms = keyed(after);
  const keys = [...new Set([...oldRooms.map(entry => entry.key), ...newRooms.map(entry => entry.key)])];
  const find = (entries: KeyedRoom[], key: unknown) => entries.find(entry => entry.key === key)?.room || null;
  const hasAI = hasAuditAIProvider();
  const rooms: LightAuditComparisonRoomView[] = [];
  for (const key of keys) {
    const oldRoom = find(oldRooms, key), newRoom = find(newRooms, key);
    const oldSeverity = oldRoom ? computeAuditRoomSeverity(before, oldRoom) : null;
    const newSeverity = newRoom ? computeAuditRoomSeverity(after, newRoom) : null;
    const rows: LightAuditComparisonRowView[] = [];
    for (const channel of COMPARE_CHANNELS) {
      const oldReading = oldRoom ? latestInAudit(before, channel.tool, oldRoom.id) : null;
      const newReading = newRoom ? latestInAudit(after, channel.tool, newRoom.id) : null;
      if (!oldReading && !newReading) continue;
      rows.push({
        label: channel.label, title: undefined,
        before: oldReading ? channel.fmt(oldReading.value, oldReading) : '—',
        after: newReading ? channel.fmt(newReading.value, newReading) : '—',
        arrow: oldReading && newReading ? auditComparisonArrow(Number(newReading.value) - Number(oldReading.value), channel.better) : { glyph: '→', tone: 'neutral' },
      });
    }
    const oldSpectrum = oldRoom ? latestInAudit(before, 'spectrum', oldRoom.id) : null;
    const newSpectrum = newRoom ? latestInAudit(after, 'spectrum', newRoom.id) : null;
    // Legacy `melanopic` held a camera RGB ratio, not melanopic EDI. Prefer
    // the explicit proxy key and preserve the original numeric deadband.
    const oldProxy = (oldSpectrum?.extra?.cameraBlueRatioProxy ?? oldSpectrum?.extra?.melanopic) as number | null | undefined;
    const newProxy = (newSpectrum?.extra?.cameraBlueRatioProxy ?? newSpectrum?.extra?.melanopic) as number | null | undefined;
    if (oldProxy != null || newProxy != null) {
      const delta = oldProxy != null && newProxy != null ? newProxy - oldProxy : null;
      rows.push({
        label: 'Camera blue proxy', title: 'Normalized phone-camera RGB blue ratio; not CIE melanopic EDI',
        before: oldProxy != null ? `${(oldProxy * 100).toFixed(0)}%` : '—',
        after: newProxy != null ? `${(newProxy * 100).toFixed(0)}%` : '—',
        arrow: delta == null ? { glyph: '→', tone: 'neutral' } : auditComparisonArrow(delta, Math.abs(delta) < 0.02 ? 'depends' : 'lower'),
      });
    }
    const severityChanged = oldSeverity && newSeverity && oldSeverity.tier !== newSeverity.tier;
    if (!rows.length && !severityChanged) continue;
    const severityView = (severity: SeverityReader | null) => severity ? { color: String(severity.color), label: String(severity.label ?? '') } : null;
    rooms.push({
      name: String(newRoom?.name || oldRoom?.name || '?'),
      before: severityView(oldSeverity), after: severityView(newSeverity), rows,
      verdict: severityChanged ? (newSeverity.tier < oldSeverity.tier ? 'improved' : 'regressed') : rows.length ? 'measured' : 'unchanged',
    });
  }
  return {
    before: `Before: ${fmtAuditDate(before.date)}${before.label ? ' — ' + before.label : ''}`,
    after: `After: ${fmtAuditDate(after.date)}${after.label ? ' — ' + after.label : ''}`,
    oldId: auditActionValue(before.id), newId: auditActionValue(after.id), hasAI, rooms,
    note: sorted.length > 2 ? `Comparing the two most recent audits. ${sorted.length - 2} earlier audit${sorted.length > 3 ? 's' : ''} not shown.` : '',
  };
}

export function readLightAuditsView(): LightAuditBlockView {
  const audits = getLightAudits() as AuditReader[];
  const compareMode = _auditCompareMode && audits.length >= 2;
  const sorted = compareMode ? [] : sortAuditsNewestFirst(audits);
  const visible = _showAllAudits ? sorted : sorted.slice(0, AUDITS_DEFAULT_CAP);
  const hidden = sorted.length - visible.length;
  return {
    open: _auditsBlockOpen,
    count: audits.length, compareMode: _auditCompareMode,
    comparison: compareMode ? readLightAuditComparison(audits) : null,
    cards: visible.map(audit => readLightAuditCard(audit, _expandedAuditId === audit.id)),
    historyLabel: hidden > 0 ? `Show ${hidden} older audit${hidden === 1 ? '' : 's'}` : _showAllAudits && sorted.length > AUDITS_DEFAULT_CAP ? `Show only latest ${AUDITS_DEFAULT_CAP} audits` : '',
  };
}

export function renderLightAuditsBlock() {
  return renderAuditBlockHTML({ view: readLightAuditsView() });
}

export async function saveLightAuditFromUI() {
  const defaultLabel = `Audit ${(getLightAudits() as AuditReader[]).length + 1}`;
  const label = await showPromptDialog('Audit label (e.g. "Pre-mitigation", "After LED swap")', {
    defaultValue: defaultLabel,
    okLabel: 'Save audit',
    placeholder: 'Audit label',
  });
  // showPromptDialog resolves to null on Cancel/Esc/backdrop-click.
  if (label === null) return;
  const trimmed = label.trim() || defaultLabel;
  const audit = await saveLightAudit(trimmed);
  if (audit) {
    showNotification(`Saved audit: ${audit.label}`);
    _expandedAuditId = audit.id;
    _showAllAudits = false;
    refreshAuditCardUI(audit.id);
  }
}

export function toggleLightAudit(id: unknown) {
  _expandedAuditId = (_expandedAuditId === id) ? null : id;
  refreshAuditCardUI(id);
}

export function toggleLightAuditCompare() {
  _auditCompareMode = !_auditCompareMode;
  _expandedAuditId = null;
  refreshAuditsUI();
}

export function toggleLightAuditHistory() {
  _showAllAudits = !_showAllAudits;
  if (!_showAllAudits && _expandedAuditId) {
    const visibleIds = new Set(sortAuditsNewestFirst((getLightAudits() as AuditReader[])).slice(0, AUDITS_DEFAULT_CAP).map(a => a.id));
    if (!visibleIds.has(_expandedAuditId)) _expandedAuditId = null;
  }
  refreshAuditsUI();
}

export function toggleLightAuditsBlock(event?: Event) {
  const target = event?.target as Element | null | undefined;
  const control = target?.closest?.<HTMLButtonElement>('[data-light-env-action="toggle-audits-block"]');
  const owner = control?.closest('.modal-overlay') || control?.closest('[data-light-audit-block]')?.parentElement;
  const hadFocus = !!control && typeof document !== 'undefined' && document.activeElement === control;
  _auditsBlockOpen = !_auditsBlockOpen;
  refreshLightEnvironmentUI({ scrollAnchor: LIGHT_AUDITS_ANCHOR });
  // Native details kept focus without a redraw. Preserve that behavior across
  // the stable owner's replacement, while respecting any explicit new focus.
  if (hadFocus && owner?.isConnected && (document.activeElement === document.body || document.activeElement === control)) {
    owner.querySelector<HTMLButtonElement>('[data-light-env-action="toggle-audits-block"]')?.focus({ preventScroll: true });
  }
}

export function setLightAuditsBlockOpen(open: unknown) {
  _auditsBlockOpen = !!open;
}

export async function updateLightAuditField(id: unknown, field: unknown, value: unknown) {
  await updateLightAudit(id, { [field as PropertyKey]: value });
  _expandedAuditId = id;
  keepAuditVisible(id);
  refreshAuditCardUI(id);
}

export async function deleteLightAuditConfirm(id: unknown) {
  if (await showConfirmDialog('Delete this audit? This cannot be undone.')) {
    const deletingExpandedAudit = _expandedAuditId === id;
    await deleteLightAudit(id);
    _auditsBlockOpen = true;
    if ((getLightAudits() as AuditReader[]).length < 2) _auditCompareMode = false;
    if (deletingExpandedAudit) {
      _expandedAuditId = sortAuditsNewestFirst((getLightAudits() as AuditReader[]))[0]?.id || null;
    }
    if (_expandedAuditId) {
      keepAuditVisible(_expandedAuditId);
      refreshAuditCardUI(_expandedAuditId);
    } else {
      refreshAuditsUI();
    }
  }
}

export function interpretLightAuditCompare(oldId: unknown, newId: unknown) {
  const audits = (getLightAudits() as AuditReader[]);
  const a1 = audits.find(a => a.id === oldId);
  const a2 = audits.find(a => a.id === newId);
  if (!a1 || !a2) {
    showNotification('Could not find one of the audits to compare.', 'error');
    return;
  }
  const summary = serializeAuditComparison(a1, a2);
  const prompt = `Here is a Light Environment audit comparison from my home. ` +
    `Walk me through what improved, what regressed, and what one or two changes ` +
    `would have the biggest circadian impact next.\n\n${summary}`;
  openAuditCompareChat(prompt);
}

export const lightEnvAuditActionHandlers = Object.freeze({
  saveLightAuditFromUI,
  toggleLightAudit,
  toggleLightAuditCompare,
  toggleLightAuditHistory,
  setLightAuditsBlockOpen,
  toggleLightAuditsBlock,
  updateLightAuditField,
  deleteLightAuditConfirm,
  interpretLightAuditCompare,
});
