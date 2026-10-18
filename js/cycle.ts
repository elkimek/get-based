/// <reference lib="es2023.array" />
import type { ActiveData } from './data-view-types.js';
import type { CyclePhase, RecordedDrawPhase } from './cycle-draw-phases.js';
import type { ProfileData } from '../types/app-state.js';

// Persisted scalars remain opaque: the original readers coerce them at use sites.
interface CyclePeriodInput {
  startDate: string; endDate?: string | null; flow?: string | null;
  symptoms?: string[] | null; confidence?: unknown; source?: unknown; notes?: unknown;
}
interface CycleProfileInput {
  periods?: CyclePeriodInput[] | null;
  cycleLength?: unknown; periodLength?: unknown; cycleStatus?: unknown;
  regularity?: unknown; flow?: unknown; contraceptive?: unknown; conditions?: unknown;
}
interface PredictedCyclePhase {
  cycleDay: number; phase: CyclePhase; phaseName: string;
  confidence: unknown; basedOnStartDate: string; source: unknown;
}
type BloodDrawPhase = RecordedDrawPhase | (PredictedCyclePhase & { phaseDetailName: string });
interface CycleIronAlert {
  marker: string | null; severity: 'critical' | 'warning' | 'info'; message: string;
  value?: number; unit?: string | undefined;
}
interface CycleDisplayAlert { kind?: string; severity: string; title: string; message: string }
export interface CycleDisplayOptions { variant?: string; showHeader?: boolean }

import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { PERIOD_SYMPTOMS } from './constants.js';
import { showNotification, showConfirmDialog, linearRegression } from './utils.js';
import { saveImportedData } from './data.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { startCycleTour } from './tour.js';
import { calculateCycleStats, createCyclePeriod, recentCyclePeriods, upgradeMenstrualCycleProfile } from './cycle-summary.js';
import { clearCycleProfileData, getCycleImportSummarySectionView } from './cycle-import-runtime.js';
import { recordContextCardChangeRuntime } from './context-cards-runtime.js';
import { closeCycleModalRuntime, configureCycleAnalysisBridge, isCycleStylesheetLoaded, loadCycleStylesheetForAction, navigateCycleViewRuntime } from './cycle-runtime.js';
import { getRecordedDrawPhase } from './cycle-draw-phases.js';
import { projectCycleEditorPresentation } from './cycle-editor-presentation.js';
import { cycleEditorModalClasses } from './cycle-editor-classes.js';
import { renderHTML as renderCycleEditorPresentation } from './components/CycleEditorPresentation.svelte.html.js';
import { projectCycleOverviewPresentation } from './cycle-overview-presentation.js';
import type { CycleOverviewPresentationInput, CycleOverviewPhaseView, CycleOverviewPeriodView, CycleOverviewAlertView } from './cycle-overview-presentation.js';
import { renderHTML as renderCycleOverviewPresentation } from './components/CycleOverviewPresentation.svelte.html.js';
const CYCLE_ACTIVE_STATUSES = new Set(['regular', 'perimenopause']);
const appWindow = (
  typeof window !== 'undefined' ? window : {}
) as Window & typeof globalThis & { __cycleDelegatesBound?: boolean };
function closeCycleModal() {
  closeCycleModalRuntime();
}
function navigateCycleView(category: string) { navigateCycleViewRuntime(category); }
function closestCycleElement(target: EventTarget | null, selector: string) {
  if (!(target instanceof Element)) return null;
  const el = target.closest(selector);
  return el instanceof HTMLElement ? el : null;
}
function handleCycleClick(event: MouseEvent) {
  const actionEl = closestCycleElement(event.target, '[data-cycle-action]');
  if (!actionEl) return;
  switch (actionEl.dataset.cycleAction || '') {
    case 'close':
      closeCycleModal();
      break;
    case 'delete-period':
      deletePeriodEntry(actionEl.dataset.cycleStartDate || '');
      break;
    case 'toggle-symptom':
      toggleCycleSymptomTag(actionEl);
      break;
    case 'add-period':
      addPeriodEntry();
      break;
    case 'clear':
      clearMenstrualCycle();
      break;
    case 'save':
      saveMenstrualCycle();
      break;
    case 'start-tour':
      startCycleTour(false);
      break;
    case 'open-editor':
      openMenstrualCycleEditor();
      break;
    default:
      break;
  }
}
function handleCycleChange(event: Event) {
  const actionEl = closestCycleElement(event.target, '[data-cycle-action="toggle-fields"]');
  if (!actionEl) return;
  _toggleCycleEditorFields();
}
function initCycleActionDelegates() {
  if (appWindow.__cycleDelegatesBound || typeof document === 'undefined') return;
  appWindow.__cycleDelegatesBound = true;
  document.addEventListener('click', handleCycleClick);
  document.addEventListener('change', handleCycleChange);
}
initCycleActionDelegates();
export { calculateCycleStats };
function getFormField(id: string | null | undefined) {
  if (!id) return null;
  const el = document.getElementById(id);
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  ) {
    return el;
  }
  return null;
}
function getFieldValue(id: string) {
  return getFormField(id)?.value || '';
}
function isHTMLElement(el: Element): el is HTMLElement {
  return el instanceof HTMLElement;
}
function isActiveCycleStatus(status: unknown) {
  return !status || CYCLE_ACTIVE_STATUSES.has(status as string);
}
function fmtCycleDate(dateStr: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  if (!dateStr) return 'No date';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', opts);
}
function flowClass(flow: unknown) {
  if (flow === 'heavy') return 'severity-major';
  if (flow === 'light') return 'severity-minor';
  return 'severity-mild';
}
export function getCyclePhase(dateStr: string, mc: CycleProfileInput | null | undefined): PredictedCyclePhase | null {
  if (!mc || !mc.periods || mc.periods.length === 0) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const sorted = mc.periods.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  let basisPeriod: CyclePeriodInput | null = null;
  for (const p of sorted) {
    if (new Date(p.startDate + 'T00:00:00') <= target) {
      basisPeriod = p;
      break;
    }
  }
  if (!basisPeriod) return null;
  const startDate = new Date(basisPeriod.startDate + 'T00:00:00');
  const cycleDay = Math.floor((target.getTime() - startDate.getTime()) / 86400000) + 1;
  const cycleLen = (mc.cycleLength || 28) as number;
  if (cycleDay > cycleLen + 7) return null; // too far from any known period
  const periodLen = (mc.periodLength || 5) as number;
  const ovulationDay = cycleLen - 14;
  let phase: CyclePhase, phaseName: string;
  if (cycleDay <= periodLen) {
    phase = 'menstrual'; phaseName = 'Menstrual';
  } else if (cycleDay < ovulationDay - 1) {
    phase = 'follicular'; phaseName = 'Follicular';
  } else if (cycleDay <= ovulationDay + 1) {
    phase = 'ovulatory'; phaseName = 'Ovulatory';
  } else {
    phase = 'luteal'; phaseName = 'Luteal';
  }
  const periodEnd = basisPeriod.endDate || basisPeriod.startDate;
  const observedBleedDay = dateStr >= basisPeriod.startDate && dateStr <= periodEnd;
  return {
    cycleDay,
    phase,
    phaseName,
    confidence: observedBleedDay ? 'high' : (basisPeriod.confidence === 'observed' ? 'medium' : basisPeriod.confidence || 'medium'),
    basedOnStartDate: basisPeriod.startDate,
    source: basisPeriod.source || null,
  };
}
export function getNextBestDrawDate(mc: CycleProfileInput | null | undefined) {
  if (!mc || !mc.periods || mc.periods.length === 0) return null;
  const sorted = mc.periods.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const lastStart = new Date(sorted[0]!.startDate + 'T00:00:00');
  const cycleLen = (mc.cycleLength || 28) as number;
  const today = new Date(); today.setHours(0,0,0,0);
  // Find the most recent predicted period start (on or before today)
  let currentPeriodStart = new Date(lastStart.getTime());
  while (currentPeriodStart.getTime() + cycleLen * 86400000 <= today.getTime()) {
    currentPeriodStart = new Date(currentPeriodStart.getTime() + cycleLen * 86400000);
  }
  // Check if today falls within the current cycle's draw window (days 3-5)
  const currentDrawStart = new Date(currentPeriodStart.getTime() + 2 * 86400000);
  const currentDrawEnd = new Date(currentPeriodStart.getTime() + 4 * 86400000);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (today >= currentDrawStart && today <= currentDrawEnd) {
    const dayInCycle = Math.floor((today.getTime() - currentPeriodStart.getTime()) / 86400000) + 1;
    return {
      startDate: currentDrawStart.toISOString().slice(0, 10),
      endDate: currentDrawEnd.toISOString().slice(0, 10),
      description: `Now is ideal! Today is day ${dayInCycle} (early follicular)`
    };
  }
  // Otherwise recommend the next cycle's window
  if (today > currentDrawEnd) {
    currentPeriodStart = new Date(currentPeriodStart.getTime() + cycleLen * 86400000);
  }
  const drawStart = new Date(currentPeriodStart.getTime() + 2 * 86400000);
  const drawEnd = new Date(currentPeriodStart.getTime() + 4 * 86400000);
  return {
    startDate: drawStart.toISOString().slice(0, 10),
    endDate: drawEnd.toISOString().slice(0, 10),
    description: `~${fmt(drawStart)}-${fmt(drawEnd)} (days 3-5, early follicular)`
  };
}

export function getBloodDrawPhases(mc: CycleProfileInput | null | undefined, dates: readonly string[] | null | undefined, entryContextByDate: Record<string, Record<string, unknown>> = {}) {
  if (!dates) return {};
  const phases: Record<string, BloodDrawPhase> = {};
  for (const d of dates) {
    const recordedPhase = getRecordedDrawPhase(entryContextByDate[d]);
    if (recordedPhase) {
      phases[d] = recordedPhase;
      continue;
    }
    const p = mc ? getCyclePhase(d, mc) : null;
    if (p) phases[d] = { ...p, phaseDetailName: p.phaseName, source: 'predicted' };
  }
  return phases;
}

export function detectPerimenopausePattern(mc: CycleProfileInput | null | undefined, dob: string | null | undefined) {
  if (!mc?.periods || mc.periods.length < 4 || !dob) return null;
  const age = (Date.now() - new Date(dob + 'T00:00:00').getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (age < 35) return null;

  const sorted = mc.periods.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]!.startDate + 'T00:00:00');
    const curr = new Date(sorted[i]!.startDate + 'T00:00:00');
    intervals.push(Math.round((curr.getTime() - prev.getTime()) / 86400000));
  }
  if (intervals.length < 3) return null;

  const indicators: string[] = [];

  // 1. Lengthening trend: positive slope on cycle lengths
  const reg = linearRegression(intervals);
  if (reg.slope > 0.5 && reg.r2 > 0.3) {
    indicators.push('lengthening cycles');
  }

  // 2. Increasing variability: stdev of second half > first half
  const mid = Math.floor(intervals.length / 2);
  const firstHalf = intervals.slice(0, mid);
  const secondHalf = intervals.slice(mid);
  const stdev = (arr: number[]) => { const m = arr.reduce((a, b) => a + b, 0) / arr.length; return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length); };
  if (secondHalf.length >= 2 && firstHalf.length >= 2) {
    if (stdev(secondHalf) > stdev(firstHalf) * 1.5) {
      indicators.push('increasing variability');
    }
  }

  // 3. Any cycle > 38 days (classic perimenopause marker)
  if (intervals.some(i => i > 38)) {
    indicators.push('cycles >38 days');
  }

  // 4. Heavy flow increase
  const recentPeriods = sorted.slice(-4);
  const heavyCount = recentPeriods.filter(p => p.flow === 'heavy').length;
  if (heavyCount >= 3) {
    indicators.push('predominantly heavy flow');
  }

  // 5. Perimenopause-specific symptoms in recent entries
  const recentSymptoms = sorted.slice(-6).flatMap(p => p.symptoms || []);
  const periSymptoms = ['Hot flashes', 'Night sweats'];
  if (periSymptoms.some(s => recentSymptoms.includes(s))) {
    indicators.push('vasomotor symptoms (hot flashes/night sweats)');
  }

  // 6. Cycle skipping — gap > 1.5× average cycle length suggests missed period
  if (intervals.length >= 3) {
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const skippedCount = intervals.filter(i => i > avgInterval * 1.5).length;
    if (skippedCount >= 1) {
      indicators.push('possible skipped cycles');
    }
  }

  // Need 2+ indicators to flag
  if (indicators.length < 2) return null;

  return {
    indicators,
    age: Math.floor(age),
    message: `Possible perimenopause pattern detected (age ${Math.floor(age)}): ${indicators.join(', ')}. Consider discussing with your healthcare provider.`
  };
}

export function detectCycleIronAlerts(mc: CycleProfileInput | null | undefined, data: Pick<ActiveData, 'categories'>) {
  if (!mc?.periods?.length) return [];
  const alerts: CycleIronAlert[] = [];

  // Check if any recent periods are heavy flow
  const sorted = mc.periods.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const recentHeavy = sorted.slice(0, 3).filter(p => p.flow === 'heavy');
  if (recentHeavy.length === 0) return [];

  // Check iron-related markers
  const ironMarkers = [
    { cat: 'hematology', key: 'ferritin', label: 'Ferritin' },
    { cat: 'hematology', key: 'hemoglobin', label: 'Hemoglobin' },
    { cat: 'hematology', key: 'iron', label: 'Iron' }
  ];

  for (const im of ironMarkers) {
    const marker = data.categories[im.cat]?.markers[im.key];
    if (!marker) continue;
    const latestIdx = marker.values.findLastIndex(v => v !== null);
    if (latestIdx === -1) continue;
    const v = marker.values[latestIdx] as number;
    const r = { min: marker.refMin, max: marker.refMax };
    if (r.min == null) continue;

    // Alert if low or in bottom 25% of range
    const threshold = r.min + ((r.max as number) - r.min) * 0.25;
    if (v <= threshold) {
      const severity = v < r.min ? 'critical' : 'warning';
      alerts.push({
        marker: im.label,
        value: v,
        unit: marker.unit,
        severity,
        message: v < r.min
          ? `${im.label} is below range (${v} ${marker.unit}) with recent heavy flow \u2014 discuss iron supplementation with your provider`
          : `${im.label} is in the low range (${v} ${marker.unit}) with recent heavy flow \u2014 monitor closely`
      });
    }
  }

  // Alert if iron markers are missing entirely with heavy flow
  const hasAnyIron = ironMarkers.some(im => {
    const m = data.categories[im.cat]?.markers[im.key];
    return m && m.values.some(v => v !== null);
  });
  if (!hasAnyIron && recentHeavy.length >= 2) {
    alerts.push({
      marker: null,
      severity: 'info',
      message: 'Heavy menstrual flow detected but no iron panel on file \u2014 consider testing ferritin, hemoglobin, and iron'
    });
  }

  return alerts;
}

export function openMenstrualCycleEditor(): void | false | Promise<void | false> {
  if (typeof document !== 'undefined' && document.querySelector('[data-cycle-stylesheet-anchor]') && !isCycleStylesheetLoaded()) {
    return loadCycleStylesheetForAction().then(function openCycleEditorAfterStylesheet(loaded) { return loaded ? openMenstrualCycleEditor() : false; });
  }
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  if (!(modal instanceof HTMLElement)) return false;
  const mc = (state.importedData!.menstrualCycle || {}) as CycleProfileInput;
  const periods = (mc.periods || []).slice().sort(function newestCyclePeriodFirst(a, b) { return b.startDate.localeCompare(a.startDate); });
  const stats = calculateCycleStats(mc.periods);
  const activeCycle = isActiveCycleStatus(mc.cycleStatus);
  modal.className = cycleEditorModalClasses();
  const coverage = getCycleImportSummarySectionView(mc);
  const periodViews = periods.map(p => ({
    startDate: p.startDate,
    dateLabel: `${fmtCycleDate(p.startDate, { month: 'short', day: 'numeric', year: 'numeric' })} - ${fmtCycleDate(p.endDate, { month: 'short', day: 'numeric', year: 'numeric' })}`,
    deleteAriaLabel: `Delete period starting ${fmtCycleDate(p.startDate)}`,
    flowClass: flowClass(p.flow), flow: p.flow, symptoms: p.symptoms, notes: p.notes,
  }));
  const today = new Date().toISOString().slice(0, 10);
  const defaultEnd = new Date(Date.now() + (((mc.periodLength || 5) as number) - 1) * 86400000).toISOString().slice(0, 10);
  modal.innerHTML = renderCycleEditorPresentation({view: projectCycleEditorPresentation({
    profile: mc, stats, activeCycle, periods: periodViews, today, defaultEnd, symptoms: PERIOD_SYMPTOMS,
    coverage, showClear: Boolean(state.importedData!.menstrualCycle),
  })});
  openModalOverlay(overlay);
}
export function saveMenstrualCycle() {
  const mc = syncMenstrualCycleProfileFromForm();
  if (!mc) {
    showNotification('Menstrual cycle profile could not be initialized', 'error');
    return;
  }
  // Auto-add pending period if form has data that hasn't been added yet
  const cycleStatus = getFieldValue('mc-cycle-status') || 'regular';
  const pendingStart = getFieldValue('mc-period-start');
  const pendingEnd = getFieldValue('mc-period-end');
  if (isActiveCycleStatus(cycleStatus) && pendingStart && pendingEnd && pendingEnd >= pendingStart) {
    const periods = mc.periods || [];
    const exists = periods.some(p => p.startDate === pendingStart);
    const overlaps = periods.some(p => pendingStart <= (p.endDate || p.startDate) && pendingEnd >= p.startDate);
    if (!exists && !overlaps) {
      const flow = getFieldValue('mc-period-flow') || 'moderate';
      const symptoms = getSelectedCycleSymptoms();
      const notes = getFieldValue('mc-period-notes').trim();
      const updatedAt = new Date().toISOString();
      const period = createCyclePeriod({ startDate: pendingStart, endDate: pendingEnd, flow, symptoms, notes, updatedAt });
      if (!period) {
        showNotification('Period dates are invalid', 'error');
        return;
      }
      mc.periods.push(period);
      state.importedData!.menstrualCycle = upgradeMenstrualCycleProfile(mc, { now: updatedAt });
    }
  }
  recordContextCardChangeRuntime('menstrualCycle');
  saveImportedData();
  closeCycleModal();
  const activeNav = document.querySelector(".nav-item.active");
  navigateCycleView(activeNav instanceof HTMLElement ? activeNav.dataset.category || "dashboard" : "dashboard");
  showNotification('Menstrual cycle profile saved', 'success');
  // Auto-trigger cycle tour after dashboard re-renders
  setTimeout(() => { startCycleTour(true); }, 600);
}
export async function clearMenstrualCycle() {
  if (await showConfirmDialog('Clear all menstrual cycle data? This cannot be undone.')) {
    try { await clearCycleProfileData(); }
    catch (error) { showNotification(`Menstrual cycle data could not be cleared: ${getErrorMessage(error)}`, 'error'); return; }
    closeCycleModal();
    const activeNav = document.querySelector(".nav-item.active");
    navigateCycleView(activeNav instanceof HTMLElement ? activeNav.dataset.category || "dashboard" : "dashboard");
    showNotification('Menstrual cycle data cleared', 'info');
  }
}

export function _toggleCycleEditorFields() {
  const status = getFieldValue('mc-cycle-status');
  const fields = document.getElementById('mc-active-fields');
  const periodLog = document.getElementById('mc-period-log-section');
  const isActive = isActiveCycleStatus(status);
  if (fields) fields.hidden = !isActive;
  if (periodLog) periodLog.hidden = !isActive;
}

export function toggleCycleSymptomTag(btn: HTMLElement | null) {
  if (!btn) return;
  const active = btn.classList.toggle('active');
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function getSelectedCycleSymptoms() {
  const symptomTags = document.querySelectorAll('#mc-period-symptoms .ctx-tag.active');
  return Array.from(symptomTags).filter(isHTMLElement).map(tag => tag.dataset.value || '').filter(Boolean);
}

export function syncMenstrualCycleProfileFromForm() {
  const mc = (state.importedData!.menstrualCycle || {}) as CycleProfileInput;
  const cycleLengthAuto = document.getElementById('mc-cycle-length-auto');
  const periodLengthAuto = document.getElementById('mc-period-length-auto');
  const regularityAuto = document.getElementById('mc-regularity-auto');
  const flowAuto = document.getElementById('mc-flow-auto');
  const parsedCycleLength = cycleLengthAuto instanceof HTMLElement ? parseInt(cycleLengthAuto.dataset.value || '', 10) : (mc.cycleLength || 28);
  const parsedPeriodLength = periodLengthAuto instanceof HTMLElement ? parseInt(periodLengthAuto.dataset.value || '', 10) : (mc.periodLength || 5);
  const cycleLength = Number.isFinite(parsedCycleLength) ? parsedCycleLength : (mc.cycleLength || 28);
  const periodLength = Number.isFinite(parsedPeriodLength) ? parsedPeriodLength : (mc.periodLength || 5);
  const regularity = regularityAuto instanceof HTMLElement ? regularityAuto.dataset.value : (mc.regularity || 'regular');
  const flow = flowAuto instanceof HTMLElement ? flowAuto.dataset.value : (mc.flow || 'moderate');
  const contraceptive = getFieldValue('mc-contraceptive');
  const conditions = getFieldValue('mc-conditions').trim();
  const cycleStatus = getFieldValue('mc-cycle-status') || 'regular';
  const base = state.importedData!.menstrualCycle
    ? { ...state.importedData!.menstrualCycle, cycleStatus, cycleLength, periodLength, regularity, flow, contraceptive, conditions }
    : { cycleStatus, cycleLength, periodLength, regularity, flow, contraceptive, conditions, periods: [] };
  const profile = upgradeMenstrualCycleProfile(base);
  state.importedData!.menstrualCycle = profile;
  return profile;
}

export function addPeriodEntry() {
  const startDate = getFieldValue('mc-period-start');
  const endDate = getFieldValue('mc-period-end');
  const flow = getFieldValue('mc-period-flow');
  const symptoms = getSelectedCycleSymptoms();
  const notes = getFieldValue('mc-period-notes').trim();
  if (!startDate) { showNotification('Start date is required', 'error'); return; }
  if (!endDate) { showNotification('End date is required', 'error'); return; }
  if (endDate < startDate) { showNotification('End date must be on or after start date', 'error'); return; }
  const mc = syncMenstrualCycleProfileFromForm();
  if (!mc) {
    showNotification('Menstrual cycle profile could not be initialized', 'error');
    return;
  }
  const exists = mc.periods.some(p => p.startDate === startDate);
  if (exists) { showNotification('A period entry with this start date already exists', 'error'); return; }
  const overlaps = mc.periods.some(p =>
    startDate <= (p.endDate || p.startDate) && endDate >= p.startDate
  );
  if (overlaps) { showNotification('This overlaps with an existing period entry', 'error'); return; }
  const updatedAt = new Date().toISOString();
  const period = createCyclePeriod({ startDate, endDate, flow, symptoms, notes, updatedAt });
  if (!period) { showNotification('Period dates are invalid', 'error'); return; }
  mc.periods.push(period);
  state.importedData!.menstrualCycle = upgradeMenstrualCycleProfile(mc, { now: updatedAt });
  saveImportedData();
  openMenstrualCycleEditor();
}

export function deletePeriodEntry(startDate: string) {
  if (!state.importedData!.menstrualCycle || !state.importedData!.menstrualCycle.periods) return;
  const mc = syncMenstrualCycleProfileFromForm();
  if (!mc) return;
  mc.periods = mc.periods.filter(p => p.startDate !== startDate);
  state.importedData!.menstrualCycle = upgradeMenstrualCycleProfile(mc);
  saveImportedData();
  openMenstrualCycleEditor();
}

export function projectMenstrualCycleSection(data: ActiveData | ProfileData | null, opts: CycleDisplayOptions = {}) {
  const compact = opts?.variant === 'dashboard';
  const showHeader = opts?.showHeader !== false;
  const mc = state.importedData!.menstrualCycle ? upgradeMenstrualCycleProfile(state.importedData!.menstrualCycle) : null;
  // Coerce at the original rendering sites; authored text nodes escape these literals once.
  const literal = (value: unknown): string => value === null || value === undefined ? '' : String(value);
  const prepareAlert = (alert: CycleDisplayAlert): CycleOverviewAlertView => {
    const tone = alert.kind === 'perimenopause'
      ? 'perimenopause'
      : alert.severity === 'critical'
        ? 'critical'
        : alert.severity === 'warning'
          ? 'warning'
          : 'info';
    const icon = alert.severity === 'info' ? 'info' : 'warning';
    return {tone, icon, title: literal(alert.title), message: literal(alert.message)};
  };
  const input: CycleOverviewPresentationInput = {
    compact, showHeader, hasProfile: Boolean(mc), summary: null, drawDescription: null,
    phases: [], phaseOverflow: 0, periods: [], alerts: [],
  };
  if (mc) {
    const regLabel = mc.regularity === 'very_irregular' ? 'very irregular' : mc.regularity || 'regular';
    const statusLabels: Record<string, string> = { postmenopause: 'Postmenopause', perimenopause: 'Perimenopause', pregnant: 'Pregnant', breastfeeding: 'Breastfeeding', absent: 'No active cycle' };
    let summaryPrimary;
    const summaryMeta: unknown[] = [];
    if (mc.cycleStatus && mc.cycleStatus !== 'regular' && statusLabels[mc.cycleStatus as string]) {
      summaryPrimary = statusLabels[mc.cycleStatus as string];
      if (isActiveCycleStatus(mc.cycleStatus)) {
        summaryMeta.push(`${mc.cycleLength || 28}-day cycle`, regLabel, `${mc.flow || 'moderate'} flow`);
      }
    } else {
      summaryPrimary = `${mc.cycleLength || 28}-day cycle`;
      summaryMeta.push(regLabel, `${mc.flow || 'moderate'} flow`);
    }
    if (mc.contraceptive) summaryMeta.push(mc.contraceptive);
    if (mc.conditions) summaryMeta.push(mc.conditions);
    const sortedPeriods = recentCyclePeriods(mc, 12);
    const coverage = mc.coverage;
    if (coverage?.periodCount) summaryMeta.push(`${coverage.periodCount} periods`);
    if (compact && sortedPeriods[0]?.startDate) summaryMeta.push(`Last ${fmtCycleDate(sortedPeriods[0].startDate)}`);
    const summaryAria = [summaryPrimary, ...summaryMeta].filter(Boolean).join(', ');
    const aria = literal(summaryAria);
    const primary = literal(summaryPrimary);
    const meta = summaryMeta.filter(Boolean).map(literal);
    input.summary = {primary, aria, meta};
    const isActiveCycle = isActiveCycleStatus(mc.cycleStatus);
    const drawRec = isActiveCycle ? getNextBestDrawDate(mc) : null;
    if (drawRec) input.drawDescription = literal(drawRec.description);
    if (isActiveCycle && ((data as ActiveData | null)?.dates?.length as number) > 0) {
      const phases = getBloodDrawPhases(mc, (data as ActiveData).dates, (data as ActiveData).entryContextByDate);
      const phaseDates = Object.entries(phases);
      if (phaseDates.length > 0) {
        const visiblePhaseDates = compact ? phaseDates.slice(0, 2) : phaseDates;
        const phaseViews: CycleOverviewPhaseView[] = [];
        for (const [date, p] of visiblePhaseDates) {
          const sourceLabel = p.source === 'recorded' ? 'Recorded' : 'Predicted';
          phaseViews.push({
            phase: `${p.phase}`, label: literal(p.phaseDetailName || p.phaseName),
            dateLabel: literal(fmtCycleDate(date, { month: 'short', day: 'numeric', year: 'numeric' })),
            dayLabel: p.cycleDay ? `Day ${p.cycleDay}` : null, sourceLabel,
          });
        }
        input.phases = phaseViews;
        if (compact && phaseDates.length > visiblePhaseDates.length) {
          input.phaseOverflow = phaseDates.length - visiblePhaseDates.length;
        }
      }
    }
    const periods = compact ? [] : sortedPeriods.slice(0, 6);
    if (periods.length > 0) {
      const periodViews: CycleOverviewPeriodView[] = [];
      for (const p of periods) {
        const dateLabel = `${fmtCycleDate(p.startDate)}-${fmtCycleDate(p.endDate || p.startDate)}`;
        periodViews.push({
          dateLabel: literal(dateLabel), flowClass: flowClass(p.flow), flow: literal(p.flow || 'moderate'),
          symptoms: (p.symptoms && p.symptoms.length) ? p.symptoms.map(literal) : [],
          notes: p.notes ? literal(p.notes) : null,
        });
      }
      input.periods = periodViews;
    }
    // Perimenopause pattern detection
    const perimenopause = detectPerimenopausePattern(mc, state.profileDob);
    // Heavy flow + iron alerts
    const ironAlerts = data ? detectCycleIronAlerts(mc, data as ActiveData) : [];
    const alerts = [
      perimenopause ? { kind: 'perimenopause', severity: 'warning', title: 'Possible Perimenopause Pattern', message: perimenopause.message } : null,
      ...ironAlerts.map(alert => ({ ...alert, title: alert.marker ? `${alert.marker} + Heavy Flow` : 'Iron Panel Missing' }))
    ].filter(Boolean);
    const alertViews: CycleOverviewAlertView[] = [];
    for (const alert of compact ? alerts.slice(0, 1) : alerts) {
      alertViews.push(prepareAlert(alert!));
    }
    input.alerts = alertViews;
  }
  return projectCycleOverviewPresentation(input);
}
export function renderMenstrualCycleSection(data: ActiveData | ProfileData | null, opts: CycleDisplayOptions = {}) {
  return renderCycleOverviewPresentation({view: projectMenstrualCycleSection(data, opts)});
}
configureCycleAnalysisBridge({ detectCycleIronAlerts, detectPerimenopausePattern, getBloodDrawPhases, getNextBestDrawDate });
