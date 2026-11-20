import { renderSupplementImpactView, type SupplementImpactView } from './supplement-impact-presentation.js';
import type { SupplementDomainRecord } from './supplement-medication-domain.js';
export interface SupplementImpactReader extends SupplementDomainRecord { dosage?: unknown }

type ImpactData = NonNullable<ReturnType<typeof getActiveData>>;
interface ImpactCacheEntry { fp: string; dot: unknown; summary: unknown }
interface PendingImpactAnalysis { supplement: SupplementImpactReader; editIdx: number }

// supplement-impact.js - supplement dose math and lab impact analysis

import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { callAssistantFeatureAI, getAssistantFeatureIdentity, hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { getActiveData, getFocusCardFingerprint } from './data.js';
import { createLabContextDisclosure } from './lab-context-disclosure.js';
import { isLabMarkersContextEnabled, isSupplementsMedsContextEnabled } from './lab-context-settings.js';
import { profileStorageKey } from './profile.js';
import { hashString, isDebugMode } from './utils.js';
import { getMarkerStorageDotKey } from './marker-placement.js';
import {
  effectiveTimesPerDay,
  ingredientDailyTotal,
  getSupplementRecordId,
  getSupplementPeriods,
  parseSupplementQuantity,
} from './supplement-medication-domain.js';

export { getSupplementPeriods };

// Extract numeric value + unit from amount strings like "890mg", "500 IU", "25 mcg", "5,4 mg".
// Handles both dot and comma decimal separators. Returns null for pure text ("once daily").
export function parseAmount(str: unknown) {
  const parsed = parseSupplementQuantity(str);
  return parsed ? { value: parsed.value, unit: parsed.unit } : null;
}

export { effectiveTimesPerDay, ingredientDailyTotal } from './supplement-medication-domain.js';

export function formatSupplementTotal(total: ReturnType<typeof ingredientDailyTotal>) {
  if (!total) return '';
  const v = total.value % 1 === 0 ? total.value.toString() : total.value.toFixed(2).replace(/\.?0+$/, '');
  return `${v}${total.unit ? ' ' + total.unit : ''}/day`;
}

export function computeSupplementImpact(supplement: SupplementImpactReader, markerKey: string, markerName: string | undefined, unit: string | undefined, values: readonly (number | null)[] | null | undefined, dates: readonly string[] | null | undefined, refMin: number | null | undefined, refMax: number | null | undefined) {
  if (!values || !dates || values.length !== dates.length) return null;
  const pds = getSupplementPeriods(supplement);
  const sortedPds = [...pds].sort((a, b) => (a.start as { localeCompare(other: unknown): number }).localeCompare(b.start));
  const firstStart = sortedPds[0]!.start;
  const isInPeriod = (date: string) => sortedPds.some(p => date >= (p.start as string) && (!p.end || date <= (p.end as string)));
  const beforeValues: number[] = [], afterValues: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    if (values[i] === null) continue;
    if (dates[i]! < (firstStart as string)) {
      beforeValues.push(values[i]!);
    } else if (isInPeriod(dates[i]!)) {
      afterValues.push(values[i]!);
    }
  }
  if (beforeValues.length === 0 && afterValues.length === 0) return null;
  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const beforeMean = beforeValues.length > 0 ? mean(beforeValues) : null;
  const afterMean = afterValues.length > 0 ? mean(afterValues) : null;
  let pctChange: number | null = null, direction = 'stable';
  if (beforeMean !== null && afterMean !== null && beforeMean !== 0) {
    pctChange = ((afterMean - beforeMean) / Math.abs(beforeMean)) * 100;
    direction = Math.abs(pctChange) < 1 ? 'stable' : pctChange > 0 ? 'up' : 'down';
  }
  let confidence = 'low';
  if (beforeValues.length >= 3 && afterValues.length >= 3) confidence = 'high';
  else if (beforeValues.length >= 2 && afterValues.length >= 2) confidence = 'moderate';
  return {
    marker: markerKey, markerName, unit,
    beforeMean, afterMean, pctChange, direction, confidence,
    nBefore: beforeValues.length, nAfter: afterValues.length,
    refMin, refMax
  };
}

type SignificantImpact = NonNullable<ReturnType<typeof computeSupplementImpact>> & { pctChange: number };

export function computeAllImpacts(supplement: SupplementImpactReader, data: ImpactData | null | undefined) {
  if (!data || !data.categories || !data.dates) return [];
  const results: SignificantImpact[] = [];
  for (const [catKey, cat] of Object.entries(data.categories)) {
    for (const [mKey, marker] of Object.entries(cat.markers)) {
      const dotKey = getMarkerStorageDotKey(marker, `${catKey}_${mKey}`);
      if (!dotKey) continue;
      const impact = computeSupplementImpact(
        supplement, dotKey, marker.name, marker.unit,
        marker.values, data.dates, marker.refMin, marker.refMax
      );
      if (!impact || impact.pctChange === null || Math.abs(impact.pctChange) < 1) continue;
      results.push({ ...impact, pctChange: impact.pctChange });
    }
  }
  results.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
  return results;
}

function getOverlappingSupplements(supplement: SupplementImpactReader, supps: SupplementImpactReader[]) {
  const sPds = getSupplementPeriods(supplement);
  return supps.filter(s => {
    if (s === supplement) return false;
    const oPds = getSupplementPeriods(s);
    return sPds.some(sp => oPds.some(op => {
      const sEnd = sp.end || '9999-12-31';
      const oEnd = op.end || '9999-12-31';
      return (sp.start as string) <= (oEnd as string) && (op.start as string) <= (sEnd as string);
    }));
  });
}

// Per-supplement fingerprint: changes when that supp's edit-visible fields or lab dates change.
// Editing dosage/ingredients/periods for one supp invalidates only that supp's cache entry.
function getSuppFingerprint(supp: SupplementImpactReader, data: ImpactData) {
  const labPart = JSON.stringify(computeAllImpacts(supp, data));
  const pds = getSupplementPeriods(supp);
  const ings = (supp.ingredients || []).map(i => `${i.name}:${i.amount || ''}:${i.amountValue ?? ''}:${i.amountUnit || ''}:${i.timesPerDay || ''}`).join(',');
  const schedule = supp.schedule && typeof supp.schedule === 'object' ? JSON.stringify(supp.schedule) : '';
  const suppPart = `${supp.name}|${supp.dosage || ''}|${supp.timesPerDay || ''}|${schedule}|${supp.type || ''}|${ings}|${pds.map(p => (p.start as string) + '~' + (p.end || '') + '~' + (p.dose || '')).join(',')}`;
  return hashString(labPart + '||' + suppPart);
}

function parseImpactCache(raw: string | null): Record<string, ImpactCacheEntry> {
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    // Migrate old batch-fingerprint schema (values without `fp` field) by discarding.
    for (const k of Object.keys(parsed)) {
      if (!parsed[k] || typeof parsed[k] !== 'object' || typeof parsed[k].fp !== 'string') delete parsed[k];
    }
    return parsed;
  } catch { return {}; }
}

function getImpactCache() {
  return parseImpactCache(localStorage.getItem(profileStorageKey(state.currentProfile, 'suppImpact')));
}

function captureImpactOwner() {
  const profileId = state.currentProfile;
  const profileData = state.importedData;
  const fingerprint = getFocusCardFingerprint();
  const recipient = JSON.stringify(getAssistantFeatureIdentity());
  return {
    key: profileStorageKey(profileId, 'suppImpact'),
    current: () => state.currentProfile === profileId && state.importedData === profileData
      && getFocusCardFingerprint() === fingerprint
      && JSON.stringify(getAssistantFeatureIdentity()) === recipient
      && isSupplementsMedsContextEnabled() && isLabMarkersContextEnabled(),
  };
}

// Debounced queue: coalesces multiple render calls into a single AI request for only the stale/missing supps.
const _pendingAnalyses = new Map<unknown, PendingImpactAnalysis>();
let _pendingOwner: ReturnType<typeof captureImpactOwner> | null = null;
let _analyzeTimer: ReturnType<typeof setTimeout> | null = null;
let _batchPromise: Promise<void> | null = null;

export function renderSupplementImpact(supplement: SupplementImpactReader, editIdx: number) {
  return renderSupplementImpactView(projectSupplementImpact(supplement, editIdx));
}

export function projectSupplementImpact(supplement: SupplementImpactReader, editIdx: number): SupplementImpactView {
  const canDisclose = isSupplementsMedsContextEnabled() && isLabMarkersContextEnabled();
  const hasAI = canDisclose && hasAssistantFeatureProvider();
  const data = getActiveData();
  if (!data || !data.dates || data.dates.length < 2) {
    return { kind: 'hint', hint: 'Needs at least 2 lab dates to compare' };
  }
  const impacts = computeAllImpacts(supplement, data);
  if (impacts.length === 0) {
    const hasAfter = data.dates.some(d => d >= (supplement.startDate as string));
    const hasBefore = data.dates.some(d => d < (supplement.startDate as string));
    const hint = !hasBefore ? 'No lab results from before this supplement was started'
      : !hasAfter ? 'No lab results since starting this supplement'
      : 'No significant marker changes detected yet';
    return { kind: 'hint', hint };
  }

  const currentData = createLabContextDisclosure().project(data);
  const fp = getSuppFingerprint(supplement, currentData);
  const cache = canDisclose ? getImpactCache() : {};
  const cacheKey = getSupplementRecordId(supplement) || supplement.name;
  const entry = cache[cacheKey as string] || cache[supplement.name as string];
  const cached = (entry && entry.fp === fp) ? entry : null;

  const dotColor = cached ? `ctx-health-dot-${cached.dot}` : (hasAI ? 'ctx-health-dot-shimmer' : 'ctx-health-dot-gray');
  const summaryClass = cached ? `supp-impact-summary-visible supp-impact-summary-${cached.dot}` : '';
  const summaryText = cached ? String(cached.summary ?? '') : (hasAI ? '' : 'Set up an AI provider for impact insights');

  // Capture each original index interpolation independently before scheduling.
  const dotId = `supp-impact-dot-${editIdx}`;
  const refreshIndex = cached && hasAI ? `${editIdx}` : null;
  const summaryId = `supp-impact-summary-${editIdx}`;
  const view: SupplementImpactView = { kind: 'analysis', dotClass: dotColor,
    dotId, refreshIndex, summaryClass, summaryId, summaryText };

  // Auto-fire only if fingerprint mismatch (edit) or missing entirely - scoped to this supp only.
  if (!cached && hasAI) scheduleAnalyze(supplement, editIdx);
  else if (!cached && canDisclose) void restoreSavedImpact(supplement, editIdx, fp);
  return view;
}

async function restoreSavedImpact(supplement: SupplementImpactReader, editIdx: number, fingerprint: string) {
  const owner = captureImpactOwner();
  // Plain saved entries were already handled by the synchronous render.
  if (!localStorage.getItem(owner.key)?.startsWith('v1:')) return;
  const { encryptedGetItem } = await import('./crypto.js');
  const cache = parseImpactCache(await encryptedGetItem(owner.key).catch(() => null));
  if (!owner.current() || state.importedData.supplements?.[editIdx] !== supplement) return;
  const entry = cache[String(getSupplementRecordId(supplement) || supplement.name)] || cache[String(supplement.name)];
  if (entry?.fp === fingerprint) applyImpactToDOM(editIdx, entry);
}

function scheduleAnalyze(supplement: SupplementImpactReader, editIdx: number) {
  if (!_pendingOwner?.current()) {
    _pendingAnalyses.clear();
    _pendingOwner = captureImpactOwner();
  }
  _pendingAnalyses.set(getSupplementRecordId(supplement) || supplement.name, { supplement, editIdx });
  if (_analyzeTimer) return;
  _analyzeTimer = setTimeout(() => { _analyzeTimer = null; void flushAnalyses(); }, 50);
}

async function flushAnalyses() {
  const pending = [..._pendingAnalyses.values()];
  const owner = _pendingOwner;
  _pendingOwner = null;
  _pendingAnalyses.clear();
  if (pending.length === 0 || !owner?.current()) return;
  if (_batchPromise) await _batchPromise;
  if (owner.current()) await loadImpactsForSupps(pending, owner);
}

async function loadImpactsForSupps(pending: PendingImpactAnalysis[], owner: ReturnType<typeof captureImpactOwner>, userInitiated = false) {
  const { encryptedGetItem, encryptedSetItem } = await import('./crypto.js');
  const cache = parseImpactCache(await encryptedGetItem(owner.key).catch(() => null));
  if (!owner.current()) return;
  const data = createLabContextDisclosure().project(getActiveData());
  const allSupps = state.importedData.supplements || [];
  const suppEntries: Array<PendingImpactAnalysis & { impacts: SignificantImpact[] }> = [];
  for (const { supplement: s, editIdx } of pending) {
    if (allSupps[editIdx] !== s) continue;
    const cached = cache[String(getSupplementRecordId(s) || s.name)];
    if (!userInitiated && cached?.fp === getSuppFingerprint(s, data)) {
      applyImpactToDOM(editIdx, cached);
      continue;
    }
    const impacts = computeAllImpacts(s, data);
    if (impacts.length === 0) continue;
    suppEntries.push({ supplement: s, impacts, editIdx });
  }
  if (suppEntries.length === 0) return;

  const fmtVal = (v: number) => v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  let ctx = `Analyze ${suppEntries.length} supplement${suppEntries.length === 1 ? '' : 's'}:\n`;
  for (const { supplement: s, impacts } of suppEntries) {
    const top = impacts.slice(0, 5);
    const overlapping = getOverlappingSupplements(s, allSupps);
    const pds = getSupplementPeriods(s);
    const pdStr = pds.length === 1
      ? `since ${pds[0]!.start}${pds[0]!.end ? ' until ' + pds[0]!.end : ''}`
      : `CYCLING: ${pds.map(p => (p.start as string) + ' to ' + (p.end || 'ongoing')).join('; ')}`;
    const regimen = s.schedule?.mode === 'prn'
      ? `PRN${s.schedule?.maxPerDay ? ` (max ${s.schedule.maxPerDay}/day)` : ''}`
      : [s.schedule?.mode, s.schedule?.details].filter(Boolean).join(': ');
    ctx += `\n[${s.name}] ${s.dosage || ''} (${s.type}) ${pdStr}${regimen ? `; schedule ${regimen}` : ''}`;
    if (s.ingredients?.length) ctx += ` ingredients: ${s.ingredients.map(ing => {
      const total = ingredientDailyTotal(ing, s);
      const times = effectiveTimesPerDay(ing, s);
      if (total) return `${ing.name} ${ing.amount} × ${times}/day = ${formatSupplementTotal(total)}`;
      if (times) return `${ing.name}${ing.amount ? ' ' + ing.amount : ''} × ${times}/day`;
      return `${ing.name}${ing.amount ? ' ' + ing.amount : ''}`;
    }).join(', ')}`;
    if (overlapping.length > 0) ctx += ` (also taking: ${overlapping.map(o => o.name).join(', ')})`;
    ctx += `\n`;
    for (const imp of top) {
      ctx += `  ${imp.markerName}: ${fmtVal(imp.beforeMean!)}→${fmtVal(imp.afterMean!)} ${imp.unit} (${imp.pctChange > 0 ? '+' : ''}${imp.pctChange.toFixed(0)}%)`;
      if (imp.refMin != null || imp.refMax != null) ctx += ` ref ${imp.refMin ?? ''}–${imp.refMax ?? ''}`;
      ctx += `\n`;
    }
  }

  const names = suppEntries.map(e => `"${e.supplement.name}"`).join(', ');
  const system = `ONLY JSON, no thinking, no explanation: {${names}: {"dot":"green|yellow|red|gray","summary":"max 20 words"}, ...}
green=beneficial, yellow=mixed, red=concerning, gray=insufficient data. Mention key markers.`;

  _batchPromise = (async () => {
    try {
      const result = await callAssistantFeatureAI({
        system, messages: [{ role: 'user', content: ctx }], maxTokens: 300 * suppEntries.length + 1000,
        requestCurrent: owner.current, consentKind: userInitiated ? 'text' : 'automatic-insight',
      }) as { text?: unknown };
      if (!owner.current()) return;
      const cleaned = ((result.text as { replace(pattern: RegExp, replacement: string): unknown }).replace(/<think>[\s\S]*?<\/think>/g, '') as { trim(): unknown }).trim();
      const jsonMatch = (cleaned as { match(pattern: RegExp): { 0?: unknown } | null | undefined }).match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;
      const parsed = JSON.parse(jsonMatch[0] as string) as Record<PropertyKey, unknown>;

      for (const { supplement: s, editIdx } of suppEntries) {
        const entry = parsed[s.name as string] as { dot?: unknown; summary?: unknown } | null | undefined;
        if (!entry || typeof entry !== 'object') continue;
        const record = {
          fp: getSuppFingerprint(s, data),
          dot: ['green', 'yellow', 'red', 'gray'].includes(entry.dot as string) ? entry.dot : 'gray',
          summary: typeof entry.summary === 'string' ? (entry.summary as { slice(start: number, end: number): unknown }).slice(0, 150) : ''
        };
        const cacheKey = getSupplementRecordId(s) || s.name;
        cache[cacheKey as string] = record;
        if (cacheKey !== s.name) delete cache[s.name as string];
        applyImpactToDOM(editIdx, record);
      }
      // Cap cache at 50 entries (one per supp).
      const keys = Object.keys(cache);
      if (keys.length > 50) { for (const k of keys.slice(0, keys.length - 50)) delete cache[k]; }
      await encryptedSetItem(owner.key, JSON.stringify(cache));
    } catch (e) { if (isDebugMode()) console.warn('[suppImpact] AI failed:', getErrorMessage(e, e)); }
  })();

  await _batchPromise;
  _batchPromise = null;
}

export function refreshSupplementImpact(editIdx: number) {
  const supps = state.importedData.supplements || [];
  const s = supps[editIdx];
  if (!s) return;
  const owner = captureImpactOwner();
  if (!owner.current()) return;
  const dotEl = document.getElementById(`supp-impact-dot-${editIdx}`);
  if (dotEl) dotEl.className = 'ctx-health-dot ctx-health-dot-shimmer';
  const sumEl = document.getElementById(`supp-impact-summary-${editIdx}`);
  if (sumEl) { sumEl.textContent = ''; sumEl.className = 'supp-impact-summary'; }
  const refreshBtn = dotEl?.closest('.supp-impact-header')?.querySelector('.supp-impact-refresh');
  if (refreshBtn) refreshBtn.remove();
  void loadImpactsForSupps([{ supplement: s, editIdx }], owner, true);
}

function applyImpactToDOM(editIdx: number, cached: ImpactCacheEntry | null | undefined) {
  if (!cached) return;
  const dotEl = document.getElementById(`supp-impact-dot-${editIdx}`);
  if (dotEl) dotEl.className = `ctx-health-dot ctx-health-dot-${cached.dot}`;
  const sumEl = document.getElementById(`supp-impact-summary-${editIdx}`);
  if (sumEl) {
    sumEl.textContent = cached.summary as string;
    sumEl.className = `supp-impact-summary supp-impact-summary-visible supp-impact-summary-${cached.dot}`;
  }
}
