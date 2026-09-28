// @ts-check
// Read-only preparation shared by correlation charts, tables and AI prompts.
import { CORRELATION_LAGS, getSupplementPeriods, getSupplementRecordId, localDateKey, normalizeSupplementUnit } from './supplement-medication-domain.js';
import { getMarkerStorageDotKey } from './marker-placement.js';

const DAY = 86400000;
export { CORRELATION_LAGS } from './supplement-medication-domain.js';

export function correlationDay(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date ? value / DAY : null;
}

export function correlationDate(day) { return new Date(day * DAY).toISOString().slice(0, 10); }

/** Only explicit quantities are numeric. Never infer dose from the current product label. */
export function parseCorrelationDose(raw) {
  const structured = raw && typeof raw === 'object' ? raw : null;
  if (structured?.basis && !['day', 'dose'].includes(structured.basis)) return null;
  const text = structured
    ? (typeof structured.value === 'number' && structured.unit ? `${structured.value} ${structured.unit}${structured.basis === 'day' ? '/day' : ''}` : structured.text || '')
    : typeof raw === 'string' ? raw.trim() : '';
  const match = text.match(/^(\d+(?:[.,]\d+)*|\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d+)?)\s*(mcg|µg|μg|ug|mg|g|ml|iu|cfu|mmol|meq|units?|capsules?|tablets?|drops?|scoops?|sprays?|patch(?:es)?)(?:\s*(\/day|per day|daily|\/dose|per dose))?$/i);
  if (!match) return null;
  let number = match[1].replace(/[ \u00a0]/g, '');
  if (/^[1-9]\d{0,2}(,\d{3})+$/.test(number)) number = number.replace(/,/g, '');
  else if ((number.match(/,/g) || []).length === 1 && !number.includes('.')) number = number.replace(',', '.');
  const value = Number(number);
  if (!Number.isFinite(value) || value <= 0) return null;
  const originalUnit = normalizeSupplementUnit(match[2].toLowerCase());
  const mass = { g: 1000, mg: 1, mcg: 0.001 }[originalUnit];
  const unit = mass ? 'mg' : originalUnit === 'unit' ? 'units' : originalUnit;
  const basis = /day|daily/i.test(match[3] || '') ? 'day' : 'dose';
  if (!Number.isFinite(value * (mass || 1))) return null;
  const result = { value: value * (mass || 1), unit, basis, text, key: `${unit}:${basis}` };
  if (structured?.text && typeof structured.value === 'number' && structured.unit) {
    const fromText = parseCorrelationDose(structured.text);
    if (!fromText || fromText.value !== result.value || fromText.key !== result.key) return null;
  }
  return result;
}

export function prepareTherapyHistory(record, today = localDateKey()) {
  const raw = getSupplementPeriods(record);
  const periods = raw.filter(p => p && correlationDay(p.start) !== null
    && (p.end === null || p.end === undefined || p.end === '' || correlationDay(p.end) !== null)
    && (!p.end || p.end >= p.start))
    .map(p => ({ ...p, end: p.end || null, quantity: parseCorrelationDose(p.dose) }))
    .sort((a, b) => a.start.localeCompare(b.start));
  const invalid = periods.length !== raw.length || !periods.length
    || periods.some((p, i) => i > 0 && (!periods[i - 1].end || periods[i - 1].end >= p.start));
  const keys = [...new Set(periods.filter(p => p.quantity).map(p => p.quantity.key))];
  const quantity = keys.length === 1 ? periods.find(p => p.quantity)?.quantity : null;
  const warnings = [];
  if (invalid) warnings.push('Invalid or overlapping usage periods: numeric comparisons are unavailable until the history is corrected.');
  if (periods.some(p => !p.quantity)) warnings.push('Some periods have no unambiguous numeric dose; those periods remain unknown.');
  if (keys.length > 1) warnings.push('Dose units or amount bases differ; they are not pooled into one coefficient.');
  if (periods.some(p => !p.schedule)) warnings.push('Historical frequency is not saved for every period. Recorded dose is not verified daily intake.');
  return { id: getSupplementRecordId(record), name: record.name || 'Unnamed item', type: record.type || 'supplement', record, periods, invalid, quantity, mixedUnits: keys.length > 1, today, warnings };
}

export function therapyExposure(history, date) {
  const day = correlationDay(date);
  const unknown = (reason) => ({ date, value: null, unit: '', basis: '', label: reason, periodStart: '', daysSinceChange: null, key: '', status: 'unknown' });
  if (day === null || date > history.today) return unknown('Outside recorded history');
  if (history.invalid) return unknown('Invalid or overlapping periods');
  const period = history.periods.find(p => p.start <= date && (!p.end || date <= p.end));
  if (period) {
    const quantity = period.quantity;
    const mode = period.schedule?.mode || history.record.schedule?.mode;
    const doseText = typeof period.dose === 'string' ? period.dose : quantity?.text || period.dose?.text || 'Dose not recorded';
    const label = doseText + (period.schedule?.timesPerDay ? ` · schedule: ${period.schedule.timesPerDay} uses/day` : '');
    const base = { date, periodStart: period.start, daysSinceChange: day - correlationDay(period.start), label, status: 'recorded' };
    if (mode === 'prn') return { ...unknown('As-needed use; actual intake unknown'), ...base, label: `${label} · as needed; actual intake unknown`, status: 'unknown' };
    if (!quantity) return { ...unknown(label), ...base, status: 'unknown' };
    return { ...base, value: quantity.value, unit: quantity.unit, basis: quantity.basis, key: quantity.key };
  }
  const previous = history.periods.filter(p => p.end && p.end < date).at(-1);
  if (!previous) return unknown('Before first recorded use');
  const start = correlationDay(previous.end) + 1;
  return { date, value: history.quantity ? 0 : null, unit: history.quantity?.unit || '', basis: history.quantity?.basis || '', key: history.quantity?.key || '', label: 'Recorded break / stopped', periodStart: correlationDate(start), daysSinceChange: day - start, status: 'paused' };
}

/** Piecewise segments, including unknown gaps. Boundaries are calendar days, not lab indexes. */
export function therapySegments(history, startDate, endDate) {
  const start = correlationDay(startDate), end = correlationDay(endDate);
  if (start === null || end === null || start > end) return [];
  const cuts = new Set([start, end + 1]);
  for (const p of history.periods) {
    cuts.add(correlationDay(p.start));
    if (p.end) cuts.add(correlationDay(p.end) + 1);
  }
  cuts.add(correlationDay(history.today) + 1);
  const sorted = [...cuts].filter(d => d >= start && d <= end + 1).sort((a, b) => a - b);
  return sorted.slice(0, -1).map((day, i) => ({ start: day, end: sorted[i + 1], ...therapyExposure(history, correlationDate(day)) }));
}

function pearson(rows) {
  const mx = rows.reduce((sum, r) => sum + r.exposure.value, 0) / rows.length;
  const my = rows.reduce((sum, r) => sum + r.value, 0) / rows.length;
  let xy = 0, xx = 0, yy = 0;
  for (const r of rows) {
    const x = r.exposure.value - mx, y = r.value - my;
    xy += x * y; xx += x * x; yy += y * y;
  }
  const result = xx > 0 && yy > 0 ? xy / Math.sqrt(xx) / Math.sqrt(yy) : NaN;
  return Number.isFinite(result) ? Math.max(-1, Math.min(1, result)) : null;
}

/** Values are from the app's unit-resolved marker series; raw entries identify ambiguous draws. */
export function prepareTherapyComparison({ history, marker, markerKey, dates, entries = [], lagDays = 0 }) {
  const lag = CORRELATION_LAGS.includes(lagDays) ? lagDays : 0;
  const storageKey = getMarkerStorageDotKey(marker, markerKey.replace('.', '_')) || markerKey;
  const rows = dates.flatMap((date, index) => {
    const value = marker.values?.[index];
    if (typeof value !== 'number' || !Number.isFinite(value) || correlationDay(date) === null) return [];
    const sources = entries.filter(e => e.date === date && Object.hasOwn(e.markers || {}, storageKey));
    const conflict = new Set(sources.map(e => e.markers[storageKey])).size > 1;
    const exposureDate = correlationDate(correlationDay(date) - lag);
    const exposure = therapyExposure(history, exposureDate);
    const reason = date > history.today ? 'Future measurement' : conflict ? 'Conflicting results on the same date' : exposure.value === null ? exposure.label : '';
    return [{ date, value, exposureDate, exposure, reason, sources: sources.map(e => ({ id: e.id || '', date: e.date, source: e.markerSources?.[storageKey]?.file || e.sourceFile || e.lab || '' })), conflict }];
  });
  const eligible = rows.filter(r => !r.reason);
  const keys = [...new Set(eligible.map(r => r.exposure.key))];
  const baselineRows = history.invalid ? [] : rows.filter(r => r.date < history.periods[0]?.start && r.date <= history.today && !r.conflict);
  const baseline = baselineRows.length ? { n: baselineRows.length, mean: baselineRows.reduce((sum, r) => sum + r.value, 0) / baselineRows.length } : null;
  const groups = [];
  for (const row of eligible) {
    const key = `${row.exposure.key}:${row.exposure.value}`;
    let group = groups.find(g => g.key === key);
    if (!group) {
      group = { key, dose: row.exposure.value, unit: row.exposure.unit, basis: row.exposure.basis, values: [], dates: [] };
      groups.push(group);
    }
    group.values.push(row.value); group.dates.push(row.date);
  }
  groups.sort((a, b) => a.unit.localeCompare(b.unit) || a.dose - b.dose);
  const summaries = groups.map(g => ({ ...g, n: g.values.length, mean: g.values.reduce((a, b) => a + b, 0) / g.values.length }));
  let unavailable = '';
  if (keys.length > 1 || history.mixedUnits) unavailable = 'Incompatible dose units or amount bases';
  else if (eligible.length < 6) unavailable = 'At least 6 eligible measurements are needed';
  else if (groups.length < 2 || groups.filter(g => g.values.length >= 2).length < 2) unavailable = 'At least 2 dose levels with 2 measurements each are needed';
  const r = unavailable ? null : pearson(eligible);
  if (!unavailable && r === null) unavailable = 'No variation in dose or marker values';
  return { therapyId: history.id, therapyName: history.name, markerName: marker.name, markerKey, unit: marker.unit || '', lagDays: lag, rows, baseline, groups: summaries, n: eligible.length, r, unavailable, warnings: history.warnings };
}

export function prepareCorrelationSelection(data, importedData, markerKeys, therapyIds, lagDays = 0) {
  const records = importedData.supplements || [];
  // Duplicate legacy IDs are ambiguous; never select an arbitrary matching record.
  const histories = therapyIds.flatMap(id => {
    const matching = records.filter(s => getSupplementRecordId(s) === id);
    return matching.length === 1 ? [prepareTherapyHistory(matching[0])] : [];
  });
  for (const history of histories) {
    const others = records.filter(s => getSupplementRecordId(s) !== history.id && getSupplementPeriods(s).some(p =>
      correlationDay(p?.start) !== null && history.periods.some(h => p.start <= (h.end || history.today) && h.start <= (p.end || history.today))));
    if (others.length) history.warnings.push(`Other recorded treatments overlap: ${others.map(s => s.name).join(', ')}. Their individual contributions cannot be separated here.`);
  }
  const comparisons = histories.flatMap(history => markerKeys.flatMap(key => {
    const [category, name] = key.split('.');
    const marker = data.categories?.[category]?.markers?.[name];
    return marker && !marker.singlePoint ? [prepareTherapyComparison({ history, marker, markerKey: key, dates: data.dates, entries: importedData.entries || [], lagDays })] : [];
  }));
  return { histories, comparisons, lagDays: CORRELATION_LAGS.includes(lagDays) ? lagDays : 0 };
}

export function therapyCorrelationPrompt(selection) {
  return 'Explain these exploratory associations between recorded doses and lab measurements. This is observational history, not evidence of treatment effects. Do not infer adherence, daily intake, causality, or recommend medication changes. A chosen lag is an alignment assumption, not a validated biological response time. Discuss sparse observations, time trends, carryover, unknown historical schedules, and overlapping treatments. Do not substitute different observations or silently include excluded rows.\n\n'
    + JSON.stringify({ lagDays: selection.lagDays,
      histories: selection.histories.map(h => ({ name: h.name, type: h.type, periods: h.periods.map(p => ({ start: p.start, end: p.end, dose: p.dose, schedule: p.schedule })), warnings: h.warnings })),
      comparisons: selection.comparisons,
    }, null, 2);
}
