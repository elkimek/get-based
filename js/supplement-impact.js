// supplement-impact.js - supplement dose math and lab impact analysis

import { state } from './state.js';
import { callClaudeAPI, hasAIProvider } from './api.js';
import { getActiveData } from './data.js';
import { profileStorageKey } from './profile.js';
import { escapeHTML, hashString, isDebugMode } from './utils.js';

export function getSupplementPeriods(s) {
  if (s?.periods && s.periods.length > 0) return s.periods;
  return [{ start: s?.startDate, end: s?.endDate }];
}

// Extract numeric value + unit from amount strings like "890mg", "500 IU", "25 mcg", "5,4 mg".
// Handles both dot and comma decimal separators. Returns null for pure text ("once daily").
export function parseAmount(str) {
  if (!str || typeof str !== 'string') return null;
  const match = str.trim().match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Zµμ]+)?/);
  if (!match) return null;
  const value = parseFloat(match[1].replace(',', '.'));
  if (!isFinite(value)) return null;
  const unit = (match[2] || '').trim();
  return { value, unit };
}

// Effective timesPerDay for an ingredient: row override wins, else the supp-level default.
export function effectiveTimesPerDay(ing, supp) {
  if (ing && (ing.timesPerDay === 0 || ing.timesPerDay)) return Number(ing.timesPerDay);
  if (supp && (supp.timesPerDay === 0 || supp.timesPerDay)) return Number(supp.timesPerDay);
  return null;
}

// Compute daily total when amount is parseable and there's an effective timesPerDay.
export function ingredientDailyTotal(ing, supp) {
  const times = effectiveTimesPerDay(ing, supp);
  if (!ing || !times) return null;
  const parsed = parseAmount(ing.amount);
  if (!parsed) return null;
  const total = parsed.value * times;
  if (!isFinite(total)) return null;
  return { value: total, unit: parsed.unit, times };
}

export function formatSupplementTotal(total) {
  if (!total) return '';
  const v = total.value % 1 === 0 ? total.value.toString() : total.value.toFixed(2).replace(/\.?0+$/, '');
  return `${v}${total.unit ? ' ' + total.unit : ''}/day`;
}

export function computeSupplementImpact(supplement, markerKey, markerName, unit, values, dates, refMin, refMax) {
  if (!values || !dates || values.length !== dates.length) return null;
  const pds = getSupplementPeriods(supplement);
  const sortedPds = [...pds].sort((a, b) => a.start.localeCompare(b.start));
  const firstStart = sortedPds[0].start;
  const isInPeriod = (date) => sortedPds.some(p => date >= p.start && (!p.end || date <= p.end));
  const beforeValues = [], afterValues = [];
  for (let i = 0; i < dates.length; i++) {
    if (values[i] === null) continue;
    if (dates[i] < firstStart) {
      beforeValues.push(values[i]);
    } else if (isInPeriod(dates[i])) {
      afterValues.push(values[i]);
    }
  }
  if (beforeValues.length === 0 && afterValues.length === 0) return null;
  const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
  const beforeMean = beforeValues.length > 0 ? mean(beforeValues) : null;
  const afterMean = afterValues.length > 0 ? mean(afterValues) : null;
  let pctChange = null, direction = 'stable';
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

export function computeAllImpacts(supplement, data) {
  if (!data || !data.categories || !data.dates) return [];
  const results = [];
  for (const [catKey, cat] of Object.entries(data.categories)) {
    for (const [mKey, marker] of Object.entries(cat.markers)) {
      const dotKey = catKey + '.' + mKey;
      const impact = computeSupplementImpact(
        supplement, dotKey, marker.name, marker.unit,
        marker.values, data.dates, marker.refMin, marker.refMax
      );
      if (impact && impact.pctChange !== null && Math.abs(impact.pctChange) >= 1) {
        results.push(impact);
      }
    }
  }
  results.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
  return results;
}

function getOverlappingSupplements(supplement, supps) {
  const sPds = getSupplementPeriods(supplement);
  return supps.filter(s => {
    if (s === supplement) return false;
    const oPds = getSupplementPeriods(s);
    return sPds.some(sp => oPds.some(op => {
      const sEnd = sp.end || '9999-12-31';
      const oEnd = op.end || '9999-12-31';
      return sp.start <= oEnd && op.start <= sEnd;
    }));
  });
}

// Per-supplement fingerprint: changes when that supp's edit-visible fields or lab dates change.
// Editing dosage/ingredients/periods for one supp invalidates only that supp's cache entry.
function getSuppFingerprint(supp, data) {
  const labPart = (data.dates || []).join(',');
  const pds = getSupplementPeriods(supp);
  const ings = (supp.ingredients || []).map(i => `${i.name}:${i.amount || ''}:${i.timesPerDay || ''}`).join(',');
  const suppPart = `${supp.name}|${supp.dosage || ''}|${supp.timesPerDay || ''}|${supp.type || ''}|${ings}|${pds.map(p => p.start + '~' + (p.end || '')).join(',')}`;
  return hashString(labPart + '||' + suppPart);
}

function getImpactCache() {
  try {
    const key = profileStorageKey(state.currentProfile, 'suppImpact');
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    // Migrate old batch-fingerprint schema (values without `fp` field) by discarding.
    for (const k of Object.keys(parsed)) {
      if (!parsed[k] || typeof parsed[k] !== 'object' || typeof parsed[k].fp !== 'string') delete parsed[k];
    }
    return parsed;
  } catch { return {}; }
}

function setImpactCache(cache) {
  try {
    const key = profileStorageKey(state.currentProfile, 'suppImpact');
    localStorage.setItem(key, JSON.stringify(cache));
  } catch { /* quota exceeded */ }
}

// Debounced queue: coalesces multiple render calls into a single AI request for only the stale/missing supps.
let _pendingAnalyses = new Map(); // suppName -> { supplement, editIdx }
let _analyzeTimer = null;
let _batchPromise = null;

export function renderSupplementImpact(supplement, editIdx) {
  const hasAI = hasAIProvider();
  const data = getActiveData();
  if (!data || !data.dates || data.dates.length < 2) {
    return `<div class="supp-impact-section"><div class="supp-impact-header"><span class="ctx-health-dot ctx-health-dot-gray"></span><span>Impact Analysis</span></div><div class="supp-impact-hint">Needs at least 2 lab dates to compare</div></div>`;
  }
  const impacts = computeAllImpacts(supplement, data);
  if (impacts.length === 0) {
    const hasAfter = data.dates.some(d => d >= supplement.startDate);
    const hasBefore = data.dates.some(d => d < supplement.startDate);
    const hint = !hasBefore ? 'No lab results from before this supplement was started'
      : !hasAfter ? 'No lab results since starting this supplement'
      : 'No significant marker changes detected yet';
    return `<div class="supp-impact-section"><div class="supp-impact-header"><span class="ctx-health-dot ctx-health-dot-gray"></span><span>Impact Analysis</span></div><div class="supp-impact-hint">${hint}</div></div>`;
  }

  const fp = getSuppFingerprint(supplement, data);
  const cache = getImpactCache();
  const entry = cache[supplement.name];
  const cached = (entry && entry.fp === fp) ? entry : null;

  const dotColor = cached ? `ctx-health-dot-${cached.dot}` : (hasAI ? 'ctx-health-dot-shimmer' : 'ctx-health-dot-gray');
  const summaryClass = cached ? `supp-impact-summary-visible supp-impact-summary-${cached.dot}` : '';
  const summaryText = cached ? escapeHTML(cached.summary) : (hasAI ? '' : 'Set up an AI provider for impact insights');

  const html = `<div class="supp-impact-section">
    <div class="supp-impact-header">
      <span class="ctx-health-dot ${dotColor}" id="supp-impact-dot-${editIdx}"></span>
      <span>Impact Analysis</span>
      ${cached && hasAI ? `<button class="supp-impact-refresh" onclick="refreshSupplementImpact(${editIdx})" title="Re-analyze with current data">refresh</button>` : ''}
    </div>
    <div class="supp-impact-summary ${summaryClass}" id="supp-impact-summary-${editIdx}">${summaryText}</div>
  </div>`;

  // Auto-fire only if fingerprint mismatch (edit) or missing entirely - scoped to this supp only.
  if (!cached && hasAI) scheduleAnalyze(supplement, editIdx, data);
  return html;
}

function scheduleAnalyze(supplement, editIdx, data) {
  _pendingAnalyses.set(supplement.name, { supplement, editIdx });
  if (_analyzeTimer) return;
  _analyzeTimer = setTimeout(() => { _analyzeTimer = null; flushAnalyses(data); }, 50);
}

async function flushAnalyses(data) {
  const pending = [..._pendingAnalyses.values()];
  _pendingAnalyses.clear();
  if (pending.length === 0) return;
  if (_batchPromise) await _batchPromise;
  await loadImpactsForSupps(pending, data);
}

async function loadImpactsForSupps(pending, data) {
  const allSupps = state.importedData.supplements || [];
  const suppEntries = [];
  for (const { supplement: s, editIdx } of pending) {
    const impacts = computeAllImpacts(s, data);
    if (impacts.length === 0) continue;
    suppEntries.push({ supplement: s, impacts, editIdx });
  }
  if (suppEntries.length === 0) return;

  const fmtVal = v => v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  let ctx = `Analyze ${suppEntries.length} supplement${suppEntries.length === 1 ? '' : 's'}:\n`;
  for (const { supplement: s, impacts } of suppEntries) {
    const top = impacts.slice(0, 5);
    const overlapping = getOverlappingSupplements(s, allSupps);
    const pds = getSupplementPeriods(s);
    const pdStr = pds.length === 1
      ? `since ${pds[0].start}${pds[0].end ? ' until ' + pds[0].end : ''}`
      : `CYCLING: ${pds.map(p => p.start + ' to ' + (p.end || 'ongoing')).join('; ')}`;
    ctx += `\n[${s.name}] ${s.dosage || ''} (${s.type}) ${pdStr}`;
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
      ctx += `  ${imp.markerName}: ${fmtVal(imp.beforeMean)}→${fmtVal(imp.afterMean)} ${imp.unit} (${imp.pctChange > 0 ? '+' : ''}${imp.pctChange.toFixed(0)}%)`;
      if (imp.refMin != null || imp.refMax != null) ctx += ` ref ${imp.refMin ?? ''}–${imp.refMax ?? ''}`;
      ctx += `\n`;
    }
  }

  const names = suppEntries.map(e => `"${e.supplement.name}"`).join(', ');
  const system = `ONLY JSON, no thinking, no explanation: {${names}: {"dot":"green|yellow|red|gray","summary":"max 20 words"}, ...}
green=beneficial, yellow=mixed, red=concerning, gray=insufficient data. Mention key markers.`;

  _batchPromise = (async () => {
    try {
      const result = await callClaudeAPI({ system, messages: [{ role: 'user', content: ctx }], maxTokens: 300 * suppEntries.length + 1000 });
      const cleaned = result.text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;
      const parsed = JSON.parse(jsonMatch[0]);

      const cache = getImpactCache();
      for (const { supplement: s, editIdx } of suppEntries) {
        const entry = parsed[s.name];
        if (!entry || typeof entry !== 'object') continue;
        const record = {
          fp: getSuppFingerprint(s, data),
          dot: ['green', 'yellow', 'red', 'gray'].includes(entry.dot) ? entry.dot : 'gray',
          summary: typeof entry.summary === 'string' ? entry.summary.slice(0, 150) : ''
        };
        cache[s.name] = record;
        applyImpactToDOM(editIdx, record);
      }
      // Cap cache at 50 entries (one per supp).
      const keys = Object.keys(cache);
      if (keys.length > 50) { for (const k of keys.slice(0, keys.length - 50)) delete cache[k]; }
      setImpactCache(cache);
    } catch (e) { if (isDebugMode()) console.warn('[suppImpact] AI failed:', e.message || e); }
  })();

  await _batchPromise;
  _batchPromise = null;
}

export function refreshSupplementImpact(editIdx) {
  const supps = state.importedData.supplements || [];
  const s = supps[editIdx];
  if (!s) return;
  const data = getActiveData();
  if (!data) return;
  const cache = getImpactCache();
  delete cache[s.name];
  setImpactCache(cache);
  const dotEl = document.getElementById(`supp-impact-dot-${editIdx}`);
  if (dotEl) dotEl.className = 'ctx-health-dot ctx-health-dot-shimmer';
  const sumEl = document.getElementById(`supp-impact-summary-${editIdx}`);
  if (sumEl) { sumEl.textContent = ''; sumEl.className = 'supp-impact-summary'; }
  const refreshBtn = dotEl?.closest('.supp-impact-header')?.querySelector('.supp-impact-refresh');
  if (refreshBtn) refreshBtn.remove();
  scheduleAnalyze(s, editIdx, data);
}

function applyImpactToDOM(editIdx, cached) {
  if (!cached) return;
  const dotEl = document.getElementById(`supp-impact-dot-${editIdx}`);
  if (dotEl) dotEl.className = `ctx-health-dot ctx-health-dot-${cached.dot}`;
  const sumEl = document.getElementById(`supp-impact-summary-${editIdx}`);
  if (sumEl) {
    sumEl.textContent = cached.summary;
    sumEl.className = `supp-impact-summary supp-impact-summary-visible supp-impact-summary-${cached.dot}`;
  }
}
