// @ts-check
import { state } from './state.js';
import { saveCorrelationWorkspace } from './correlation-workspace-store.js';
import { escapeHTML, formatValue } from './utils.js';
import { getChartColors } from './theme.js';
import { createChartRuntime } from './charts-runtime.js';
import { localDateKey, getSupplementPeriods } from './supplement-medication-domain.js';
import { correlationDay, correlationDate, therapyExposure, therapySegments } from './therapy-correlations.js';

export function destroyTherapyCorrelationCharts() {
  for (const key of Object.keys(state.chartInstances)) {
    if (!key.startsWith('correlation-therapy-')) continue;
    state.chartInstances[key].destroy();
    delete state.chartInstances[key];
  }
}

const sourceLabel = sources => [...new Set(sources.map(s => s.source || s.id || s.date))].join(', ');

function doseLabel(value, unit, basis) {
  return `${Number(value.toPrecision(8))} ${unit}${basis === 'day' ? '/day' : ' (recorded dose)'}`;
}

function renderTherapyCorrelationResults(comparison, history, container) {
  if (!container) return;
      const needsDates = history.currentDoses.length && comparison.rows.some(r => r.exposure.value === null && r.date >= history.periods[0]?.start);
      const status = comparison.r !== null ? `Exploratory Pearson r = ${comparison.r.toFixed(2)}`
        : !comparison.n && needsDates ? 'Confirm dose dates to match lab results.'
        : `Coefficient unavailable: ${comparison.unavailable}.`;
      const groups = comparison.groups.map(g => `<tr><td>${escapeHTML((g.ingredient ? `${g.ingredient}: ` : '') + doseLabel(g.dose, g.unit, g.basis))}</td><td>${g.n}</td><td>${escapeHTML(formatValue(g.mean))} ${escapeHTML(comparison.unit)}</td><td>${escapeHTML(g.dates[0])} – ${escapeHTML(g.dates.at(-1))}</td></tr>`).join('');
      const rows = comparison.rows.map(row => `<tr><td>${escapeHTML(row.date)}</td><td>${escapeHTML(formatValue(row.value))} ${escapeHTML(comparison.unit)}</td><td>${escapeHTML(row.exposure.label)}</td><td>${row.exposure.daysSinceChange ?? '—'}</td><td>${escapeHTML(row.reason || 'Included')}</td><td>${escapeHTML(sourceLabel(row.sources) || 'Calculated / derived marker')}</td></tr>`).join('');
      const periods = history.periods.map(p => `<li>${escapeHTML(p.start)} → ${escapeHTML(p.end || 'ongoing')}: ${escapeHTML(typeof p.dose === 'string' ? p.dose : p.quantity?.text || 'Dose not recorded')}</li>`).join('');
      container.innerHTML = `<section class="corr-therapy-card" aria-label="${escapeHTML(comparison.markerName)} × ${escapeHTML(comparison.therapyName)}">
<p class="corr-stat">${escapeHTML(status)}</p>
<details><summary>Data &amp; limitations · ${comparison.rows.filter(r => r.reason).length} excluded lab results</summary>
${comparison.warnings.length ? `<ul class="corr-help">${comparison.warnings.map(w => `<li>${escapeHTML(w)}</li>`).join('')}</ul>` : ''}
${comparison.baseline ? `<p class="corr-help">Before first recorded use: ${comparison.baseline.n} measurements, mean ${escapeHTML(formatValue(comparison.baseline.mean))} ${escapeHTML(comparison.unit)}. Prior intake is unknown, not zero.</p>` : ''}
${groups ? `<div class="corr-data-scroll" tabindex="0" role="region" aria-label="Marker averages by recorded dose"><table class="corr-data-table"><caption>Dose-group averages; lab dates may be months apart.</caption><thead><tr><th>Dose</th><th>Measurements</th><th>Mean marker value</th><th>Lab dates</th></tr></thead><tbody>${groups}</tbody></table></div>` : '<p class="corr-help">No lab measurements have usable numeric dose information.</p>'}
<div class="corr-data-scroll" tabindex="0" role="region" aria-label="Measurements and exclusions"><table class="corr-data-table"><thead><tr><th>Lab date</th><th>Marker value</th><th>Recorded dose / status</th><th>Days since change</th><th>Analysis status</th><th>Source entry</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No measurements for this marker.</td></tr>'}</tbody></table></div>
<p class="corr-help">Use is recorded, not verified. Days since change runs from period start to lab date. Conflicting same-date results are excluded; duplicates count once. Gaps mean unknown, not zero. End dates are inclusive; breaks do not imply washout.</p>
<ul class="corr-period-list">${periods}</ul>
</details>
</section>`;
}


const esc = escapeHTML;
const darkStyles = ['#38bdf8', '#a78bfa', '#fbbf24', '#34d399', '#fb7185', '#22d3ee', '#e879f9', '#a3e635'];
const amountUnit = q => q ? `${q.unit}${q.basis === 'day' ? '/day' : q.basis === 'marker' ? '' : ' per dose'}` : '';
const textDose = q => `${formatValue(q.value)} ${amountUnit(q)}`;

const choices = (key, label, options, value, disabled = false) => `<div class="corr-control"${disabled ? ' hidden' : ''}><span>${label}</span><div class="date-range-filter" id="corr-${key}" role="group" aria-label="${label}">${options.map(([v, t]) => `<button type="button" class="range-btn${v === value ? ' active' : ''}" id="corr-${key}-${v}" data-corr-choice="${key}" data-corr-value="${v}" aria-pressed="${v === value}"${disabled ? ' disabled' : ''}>${t}</button>`).join('')}</div></div>`;

export function renderCorrelationWorkspace(selection, container, refresh) {
  destroyTherapyCorrelationCharts();
  const styles = document.documentElement.dataset.theme === 'light' ? ['#007da8', '#7651b9', '#a45300', '#007f5b', '#b52c4b', '#007786', '#963dad', '#567500'] : darkStyles;
  const view = state.correlationView;
  const grouping = view.grouping || 'combined', layout = view.layout || 'overlay', tab = view.tab || 'timeline';
  const rangePreset = view.rangePreset || (view.start || view.end ? 'custom' : 'all');
  const pairs = selection.pairs;
  const pairIndex = Math.max(0, pairs.findIndex(p => p.pairKey === selection.activePairKey));
  const pair = pairs[pairIndex];
  const scatterRows = pair?.rows.filter(r => !r.reason) || [];
  const scatterCompatible = new Set(scatterRows.map(r => r.exposure.key || 'marker')).size <= 1;
  const hidden = new Set(view.hidden || []);
  const series = [
    ...selection.markers.map((m, i) => ({ id: m.key, name: m.name, unit: m.unit || 'Unit unavailable', kind: 'marker', marker: m, color: styles[i % styles.length], index: i })),
    ...selection.histories.map((h, i) => ({ id: h.id, name: h.name, unit: amountUnit(h.quantity), kind: 'dose', history: h, color: styles[(selection.markers.length + i) % styles.length], index: selection.markers.length + i })),
  ];
  const days = selection.markers.flatMap(m => m.rows.map(r => correlationDay(r.date)));
  for (const h of selection.histories) if (!h.invalid) for (const p of h.periods) {
    if (p.start <= h.today) days.push(correlationDay(p.start), correlationDay(p.end && p.end < h.today ? p.end : h.today));
  }
  const validDays = days.filter(day => day !== null);
  const fallback = /** @type {number} */ (correlationDay(localDateKey()));
  const requestedEnd = correlationDay(selection.range.end);
  const naturalStart = validDays.length ? Math.min(...validDays) : fallback;
  const start = correlationDay(selection.range.start) ?? Math.min(naturalStart, requestedEnd ?? naturalStart);
  const last = requestedEnd ?? Math.max(start, fallback, validDays.length ? Math.max(...validDays) : fallback);
  const end = Math.max(start + 1, last + 1);
  let cursor = Math.min(end - 1, Math.max(start, correlationDay(view.inspectDate) ?? (correlationDay(selection.markers[0]?.rows.at(-1)?.date) ?? last)));
  const segmentsById = new Map(selection.histories.map(h => [h.id, therapySegments(h, correlationDate(start), correlationDate(end - 1))]));
  const numeric = s => s.kind === 'marker' || (s.history.quantity && segmentsById.get(s.id).some(seg => seg.value !== null));
  const scaleKey = s => `${s.kind}:${s.unit === 'Unit unavailable' ? s.id : s.unit}`;
  const axesFor = items => {
    const axes = new Map();
    for (const s of items.filter(numeric)) if (!axes.has(scaleKey(s))) {
      const base = s.kind === 'marker' ? 'y' : 'dose';
      axes.set(scaleKey(s), { id: [...axes.values()].some(a => a.id === base) ? `${base}2` : base, unit: s.unit, kind: s.kind, position: axes.size ? 'right' : 'left' });
    }
    return axes;
  };
  const visible = series.filter(s => !hidden.has(s.id));
  let groups = grouping === 'separate'
    ? pairs.map(p => visible.filter(s => s.id === p.markerKey || s.id === p.therapyId || s.id === p.xMarkerKey)) : [visible];
  const lanes = layout === 'lanes';
  if (lanes) groups = groups.flatMap(g => {
    const plots = g.filter(numeric).map(s => [s]);
    const tracks = g.filter(s => !numeric(s));
    if (!plots.length) return [tracks];
    plots[0].push(...tracks);
    return plots;
  });
  groups = groups.filter(g => g.length);
  const plotCount = groups.filter(g => g.some(numeric)).length;
  const missingDoses = visible.filter(s => s.kind === 'dose' && (!numeric(s) || (selection.comparisons.some(p => p.therapyId === s.id && p.rows.length) && !selection.comparisons.some(p => p.therapyId === s.id && p.n))));
  const relative = g => !lanes && axesFor(g).size > 2;
  const current = selection.histories.map(h => `<section class="corr-current-dose"><div class="corr-current-heading"><strong>${esc(h.name)}</strong><button type="button" class="corr-review-dose" data-compare-action="review-therapy" data-compare-key="${esc(h.id)}">Edit dose history</button></div>${h.currentDoses.length ? `<ul>${h.currentDoses.map(d => `<li><span>${esc(d.ingredient)}</span><span><strong>${esc(textDose(d))}</strong><small>${d.confirmedSince ? `Recorded since ${esc(d.confirmedSince)}` : 'Dates not confirmed'}</small></span></li>`).join('')}</ul>` : '<p>No daily amount saved.</p>'}</section>`).join('');
  container.innerHTML = `<div class="corr-workspace-tools">
${choices('rangePreset', 'Date range', [['3m', '3M'], ['6m', '6M'], ['1y', '1Y'], ['all', 'All'], ['custom', 'Custom']], rangePreset)}
${rangePreset === 'custom' ? `<div class="corr-custom-dates"><label>From<input id="corr-start" type="date" data-corr-setting="start" value="${esc(selection.range.start)}"></label><label>To<input id="corr-end" type="date" data-corr-setting="end" value="${esc(selection.range.end)}"></label></div>` : ''}
</div>
<p class="corr-help">${rangePreset === 'all' ? 'All recorded history through today.' : rangePreset === 'custom' ? 'Custom date range.' : `${esc(selection.range.start)} → ${esc(selection.range.end)} · through today.`}</p>
<div class="corr-workspace-tools"${tab !== 'timeline' ? ' hidden' : ''}>
${choices('grouping', 'Chart grouping', [['combined', 'Combined'], ['separate', 'Separate pairs']], grouping, pairs.length <= 1)}
${choices('layout', 'Display', [['overlay', 'Single chart'], ['lanes', 'Aligned lanes']], layout)}
</div>
${!selection.markers.some(m => m.rows.length) && !selection.rangeError ? '<p class="corr-dose-notice" role="status">No lab results in this date range. Choose a wider range to include earlier measurements.</p>' : ''}
<p id="corr-layout-status" class="sr-only" role="status"${tab !== 'timeline' ? ' hidden' : ''}>${grouping === 'combined' ? 'Combined selection' : 'Separate pairs'} · ${plotCount} ${plotCount === 1 ? 'chart' : 'charts'}. ${pairs.length === 1 ? 'Only one pair is selected.' : grouping === 'separate' ? 'Each pair has a panel below.' : 'All visible series share one view.'}</p>
${selection.rangeError ? `<p role="alert">${esc(selection.rangeError)}</p>` : ''}
<div class="corr-workspace-tabs" aria-label="Analysis view">${['timeline', 'scatter', 'data'].map(t => `<button type="button" id="corr-tab-${t}" data-corr-tab="${t}" aria-pressed="${t === tab}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
${selection.histories.filter(h => h.ingredientOptions.length > 1).map(h => `<label class="corr-ingredient-picker">Dose ingredient · ${esc(h.name)}<select data-corr-ingredient="${esc(h.id)}">${h.ingredientOptions.map(name => `<option value="${esc(name)}"${name === h.selectedIngredient ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`).join('')}
<div class="corr-series" aria-label="Visible series"${tab !== 'timeline' ? ' hidden' : ''}>${series.map(s => `<button type="button" data-corr-series="${esc(s.id)}" aria-pressed="${!hidden.has(s.id)}"><i style="border-color:${s.color};border-top-style:${s.index % 2 ? 'dashed' : 'solid'}"></i>${esc(s.name)}${s.history?.ingredientOptions.length > 1 && s.history?.selectedIngredient ? ` · ${esc(s.history.selectedIngredient)}` : ''}${s.unit ? ` · ${esc(s.unit)}` : ' · usage only'}</button>`).join('')}</div>
${tab === 'timeline' ? missingDoses.map(s => {
    const first = s.history.periods.find(p => p.quantity)?.start;
    const message = s.history.invalid ? 'Usage dates overlap or are invalid.' : s.history.mixedUnits ? 'Historical dose units or amount bases differ.' : first && !numeric(s) ? `Dose history begins ${first}; no matching dose in range.` : first && numeric(s) ? `Dose history starts ${first}; no matching lab dates.` : s.history.currentDoses.length ? `Current amount: ${s.history.currentDoses.map(d => textDose(d)).join(', ')}. Confirm its dates to plot past doses.` : 'No numeric dose recorded for this range.';
    const unconfirmed = !s.history.invalid && s.history.currentDoses.length ? getSupplementPeriods(s.history.record).flatMap((p, i) => !p.dose && !p.ingredientDoses?.length ? [{ ...p, index: i }] : []) : [];
    return `<div class="corr-dose-notice"><span><strong>${esc(s.name)}</strong> · ${esc(message)}</span>${unconfirmed.length ? `<details class="corr-confirm-dose"><summary>Confirm dose dates</summary><p>Use ${esc(s.history.currentDoses.map(d => `${d.ingredient}: ${textDose(d)}`).join('; '))} for this period only if unchanged.</p>${unconfirmed.map(p => `<div><span>${esc(p.start)} → ${esc(p.end || 'ongoing')}</span><button type="button" class="corr-review-dose" data-corr-confirm-dose="${esc(s.id)}" data-corr-period="${p.index}">Confirm &amp; save this period</button></div>`).join('')}<p class="corr-confirm-status" role="status"></p></details>` : ''}<button type="button" class="corr-review-dose" data-compare-action="review-therapy" data-compare-key="${esc(s.id)}">${unconfirmed.length ? 'Edit supplement' : 'Review dose dates'}</button></div>`;
  }).join('') : ''}
<div id="corr-workspace-plots"${tab !== 'timeline' || selection.rangeError ? ' hidden' : ''}>${groups.map((g, i) => `<section class="corr-timeline-panel${grouping === 'separate' ? ' corr-pair-panel' : ''}"><h4${grouping === 'combined' && !lanes ? ' class="sr-only"' : ''}>${g.map(s => esc(s.name)).join(' + ')}</h4>${g.some(numeric) ? `<p class="corr-scale-label">${relative(g) ? 'Relative trends · each series scaled 0–100 · actual values below' : [...axesFor(g).values()].map(a => `${a.position === 'left' ? 'Left' : 'Right'}: ${esc(a.unit)}`).join(' · ')}</p><div class="corr-dose-chart${lanes ? ' corr-lane-chart' : ''}"><canvas id="corr-workspace-chart-${i}" role="img" aria-label="${esc(g.map(s => s.name).join(' and '))} over calendar time"></canvas></div>` : ''}${g.filter(s => s.kind === 'dose' && !numeric(s)).map(s => `<div class="corr-use-timeline" data-corr-track="${esc(s.id)}"><div class="corr-use-heading">${esc(s.name)} · Recorded use <span>Not a dose scale</span></div><div class="corr-use-track"></div></div>`).join('')}</section>`).join('') || '<p>Turn on a series above.</p>'}</div>
<div class="corr-inspector"${tab !== 'timeline' || selection.rangeError ? ' hidden' : ''}><div class="corr-date-heading"><strong>Values on <time id="corr-inspect-label">${correlationDate(cursor)}</time></strong><button type="button" id="corr-unpin" class="corr-review-dose"${view.inspectDate ? '' : ' hidden'}>Unpin date</button><details class="corr-jump"><summary>Jump to date</summary><label class="sr-only" for="corr-inspect">Jump to date</label><input type="date" id="corr-inspect" value="${correlationDate(cursor)}" min="${correlationDate(start)}" max="${correlationDate(end - 1)}"></details></div><div id="corr-readout" aria-live="polite"></div></div>
<details class="corr-method"${tab !== 'timeline' ? ' hidden' : ''}><summary>How to read this chart</summary><p>Hover to preview; click to pin a date. Lines join lab results; steps show dated doses. Gaps mean unknown; dose zero means a break or off-day. Relative scales run from each series’ minimum (0) to maximum (100), not health thresholds; constant values sit at 50. Analysis uses raw values, including hidden series.</p></details>
<details class="corr-analysis-disclosure" data-analysis-tab="${esc(tab)}"${tab === 'timeline' && !view.analysisOpen ? '' : ' open'}><summary>Statistics &amp; data</summary>
<div class="corr-pair-analysis">${pairs.length > 1 ? `<div class="corr-pair-tabs" role="tablist" aria-label="Comparison">${pairs.map((p, i) => `<button type="button" role="tab" id="corr-pair-${i}" data-corr-pair="${i}" aria-selected="${i === pairIndex}" aria-controls="corr-analysis-panel" tabindex="${i === pairIndex ? 0 : -1}">${esc(p.markerName)} × ${esc(p.therapyName)}</button>`).join('')}</div>` : ''}
<div id="corr-analysis-panel"${pairs.length > 1 ? ` role="tabpanel" aria-labelledby="corr-pair-${pairIndex}" tabindex="0"` : ''}>
<p class="corr-help">${pair ? `${pair.n} paired · ${pair.rows.length - pair.n} excluded` : 'No pairs available'}</p>
${tab === 'scatter' && !scatterCompatible ? '<p role="status">Scatter unavailable: dose units, bases or ingredients differ.</p>' : ''}
<div class="corr-dose-chart"${tab !== 'scatter' || selection.rangeError || !scatterCompatible ? ' hidden' : ''}><canvas id="corr-scatter" role="img" aria-label="Paired observations; excluded rows are not plotted"></canvas></div>
<div id="corr-pair-detail"></div>
</div></div>
</details>
${current ? `<details class="corr-history"><summary>Current doses</summary><div class="corr-current-references">${current}</div></details>` : ''}`;

  container.querySelectorAll('[data-corr-confirm-dose]').forEach(el => {
    const button = /** @type {HTMLButtonElement} */ (el);
    const history = selection.histories.find(h => h.id === button.dataset.corrConfirmDose);
    const expected = JSON.stringify(history.record);
    const profile = state.currentProfile;
    button.addEventListener('click', async () => {
      const status = button.closest('.corr-confirm-dose')?.querySelector('.corr-confirm-status');
      if (!status) return;
      button.disabled = true;
      status.textContent = 'Saving dose dates…';
      try {
        const { saveSupplementIngredientPeriod } = await import('./supplements.js');
        if (state.currentProfile !== profile || !container.contains(button)) return;
        const saved = await saveSupplementIngredientPeriod(history.id, Number(button.dataset.corrPeriod), expected);
        if (state.currentProfile !== profile || !container.contains(button)) return;
        if (saved) refresh();
        else status.textContent = 'Dose dates were not saved. Review the latest record and try again.';
      } catch { status.textContent = 'Could not save dose dates. Please try again.'; }
      finally { button.disabled = false; }
    });
  });

  const workspaceProfile = state.currentProfile;
  container.querySelector('.corr-analysis-disclosure').addEventListener('toggle', event => {
    if (tab !== 'timeline' || !container.isConnected || !container.contains(/** @type {Node} */ (event.target)) || state.currentProfile !== workspaceProfile) return;
    state.correlationView.analysisOpen = /** @type {HTMLDetailsElement} */ (event.target).open;
    void saveCorrelationWorkspace();
  });
  const updateSetting = (key, value) => { if (tab === 'timeline') state.correlationView.analysisOpen = container.querySelector('.corr-analysis-disclosure').hasAttribute('open'); if (key === 'pair') state.correlationView.pairKey = pairs[Number(value)]?.pairKey; state.correlationView = { ...state.correlationView, [key]: value }; refresh(); };
  container.querySelectorAll('[data-corr-setting]').forEach(el => el.addEventListener('change', () => updateSetting(el.getAttribute('data-corr-setting'), /** @type {HTMLInputElement} */ (el).value)));
  container.querySelectorAll('[data-corr-choice]').forEach(el => el.addEventListener('click', () => {
    const key = el.getAttribute('data-corr-choice'), value = el.getAttribute('data-corr-value');
    if (key === 'rangePreset') state.correlationView = { ...view, start: value === 'custom' ? selection.range.start : '', end: value === 'custom' ? selection.range.end : '' };
    updateSetting(key, value);
  }));
  container.querySelectorAll('[data-corr-pair]').forEach(el => {
    el.addEventListener('click', () => updateSetting('pair', el.getAttribute('data-corr-pair')));
    el.addEventListener('keydown', event => {
      const e = /** @type {KeyboardEvent} */ (event);
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? pairs.length - 1 : (pairIndex + (e.key === 'ArrowRight' ? 1 : -1) + pairs.length) % pairs.length;
      updateSetting('pair', String(next));
      container.querySelector(`#corr-pair-${next}`)?.focus();
    });
  });
  container.querySelectorAll('[data-corr-tab]').forEach(el => el.addEventListener('click', () => updateSetting('tab', el.getAttribute('data-corr-tab'))));
  container.querySelectorAll('[data-corr-series]').forEach(el => el.addEventListener('click', () => {
    const id = el.getAttribute('data-corr-series');
    if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
    updateSetting('hidden', [...hidden]);
  }));
  container.querySelectorAll('[data-corr-ingredient]').forEach(el => el.addEventListener('change', () => updateSetting('ingredients', { ...view.ingredients, [el.getAttribute('data-corr-ingredient')]: /** @type {HTMLSelectElement} */ (el).value })));
  const detail = container.querySelector('#corr-pair-detail');
  if (pair?.therapyId) {
    renderTherapyCorrelationResults(pair, selection.histories.find(h => h.id === pair.therapyId), detail);
    if (tab === 'data') detail.querySelector('details')?.setAttribute('open', '');
  } else if (pair) {
    detail.innerHTML = `<p class="corr-stat">${pair.r === null ? esc(pair.unavailable) : `Exploratory Pearson r = ${pair.r.toFixed(2)}`}</p><details${tab === 'data' ? ' open' : ''}><summary>Data &amp; limitations</summary><div class="corr-data-scroll" tabindex="0"><table class="corr-data-table"><thead><tr><th>Lab date</th><th>${esc(pair.markerName)} (${esc(pair.unit)})</th><th>${esc(pair.therapyName)} (${esc(pair.xUnit)})</th><th>Status</th><th>Source</th></tr></thead><tbody>${pair.rows.map(r => `<tr><td>${r.date}</td><td>${formatValue(r.value)}</td><td>${r.exposure.value === null ? '—' : formatValue(r.exposure.value)}</td><td>${esc(r.reason || 'Included')}</td><td>${esc(sourceLabel(r.sources))}</td></tr>`).join('')}</tbody></table></div><p class="corr-help">Pairs require same-date results, without interpolation. Correlation is not causation.</p></details>`;
  }
  if (selection.rangeError) return;
  const colors = getChartColors();
  const charts = [];
  function inspect(day, announce = true) {
    cursor = Math.min(end - 1, Math.max(start, day));
    const date = correlationDate(cursor);
    const input = /** @type {HTMLInputElement} */ (container.querySelector('#corr-inspect'));
    input.value = date;
    container.querySelector('#corr-unpin').toggleAttribute('hidden', !state.correlationView.inspectDate);
    container.querySelector('#corr-inspect-label').textContent = date;
    const readout = container.querySelector('#corr-readout');
    readout.setAttribute('aria-live', announce ? 'polite' : 'off');
    readout.innerHTML = visible.map(s => {
      const row = s.marker?.rows.find(r => r.date === date);
      const exposure = s.history ? therapyExposure(s.history, date) : null;
      const value = s.kind === 'marker' ? row ? row.reason || `${formatValue(row.value)} ${s.unit}` : 'No measurement on this date'
        : !exposure ? 'No recorded dose' : exposure.value === null ? exposure.label : exposure.status === 'recorded' ? `${s.history.ingredientOptions.length > 1 && 'ingredient' in exposure && exposure.ingredient ? `${exposure.ingredient}: ` : ''}${textDose(exposure)}` : `${textDose(exposure)} · ${exposure.label}`;
      return `<div><strong>${esc(s.name)}</strong><span>${esc(value)}</span></div>`;
    }).join('');
    charts.forEach(c => c.draw());
  }
  container.querySelector('#corr-unpin').addEventListener('click', () => { delete state.correlationView.inspectDate; inspect(cursor); void saveCorrelationWorkspace(); });
  container.querySelector('#corr-inspect').addEventListener('change', e => {
    const day = correlationDay(/** @type {HTMLInputElement} */ (e.target).value);
    if (day !== null) { state.correlationView.inspectDate = correlationDate(day); inspect(day); void saveCorrelationWorkspace(); }
  });
  if (tab === 'timeline') groups.forEach((items, index) => {
    const tracks = [...container.querySelectorAll('.corr-timeline-panel')][index].querySelectorAll('[data-corr-track]');
    const axes = axesFor(items);
    let datasets = items.flatMap(s => {
      const common = { therapyId: s.kind === 'dose' ? s.id : '', label: `${s.name}${s.kind === 'dose' ? s.history.quantity?.ingredient ? ` · ${s.history.quantity.ingredient}` : ' dose' : ''} (${s.unit})`, borderColor: s.color, backgroundColor: s.color, borderDash: s.index % 2 ? [7, 4] : [], borderWidth: 2, tension: 0, spanGaps: false, yAxisID: axes.get(scaleKey(s))?.id, pointRadius: s.kind === 'dose' ? 2 : 4, pointStyle: s.index % 2 ? 'rectRot' : 'circle' };
      if (s.marker) return [{ ...common, data: s.marker.rows.map(r => ({ x: correlationDay(r.date), y: r.reason ? null : r.value })) }];
      const segments = segmentsById.get(s.id);
      const track = [...tracks].find(t => t.getAttribute('data-corr-track') === s.id)?.querySelector('.corr-use-track');
      if (track) track.innerHTML = segments.map(seg => `<span class="corr-use-segment corr-use-${seg.usage === 1 ? 'recorded' : seg.usage === 0 ? 'paused' : 'unknown'}" style="left:${(seg.start - start) / (end - start) * 100}%;width:${(seg.end - seg.start) / (end - start) * 100}%" role="img" tabindex="0" aria-label="${esc(`${correlationDate(seg.start)} through ${correlationDate(seg.end - 1)}: ${seg.label}`)}" title="${esc(seg.label)}"></span>`).join('');
      const points = segments.flatMap(seg => [{ x: seg.start, y: s.history.quantity ? seg.value : null, label: seg.label }, { x: seg.end, y: s.history.quantity ? seg.value : null, label: seg.label }]);
      return points.some(p => p.y !== null) ? [{ ...common, data: points, stepped: 'after' }] : [];
    });
    if (!datasets.length) return;
    const normalized = relative(items);
    if (normalized) datasets = datasets.map(d => {
      const values = d.data.map(p => p.y).filter(v => v !== null && Number.isFinite(v));
      const min = Math.min(...values), max = Math.max(...values);
      return { ...d, yAxisID: 'relative', data: d.data.map(p => ({ ...p, rawValue: p.y, y: p.y === null ? null : max === min ? 50 : (p.y - min) / (max - min) * 100 })) };
    });
    const numericScales = { y: { display: false, position: 'left' }, dose: { display: false, position: 'right' } };
    for (const axis of normalized ? [] : axes.values()) numericScales[axis.id] = {
      display: true, position: axis.position, beginAtZero: axis.kind === 'dose',
      afterFit: a => { a.width = 65; },
      title: { display: true, text: axis.unit, color: colors.tickColor },
      ticks: { color: colors.tickColor }, grid: { drawOnChartArea: axis.position === 'left', color: colors.gridColor },
    };
    if (normalized) numericScales.relative = { display: true, position: 'left', min: 0, max: 100, title: { display: true, text: 'Relative trend (0–100)', color: colors.tickColor }, ticks: { color: colors.tickColor }, grid: { color: colors.gridColor } };
    const pointerDay = event => {
      const day = chart.scales.x.getValueForPixel(event.x);
      const nearby = items.flatMap(s => s.marker?.rows.map(r => correlationDay(r.date)) || []).sort((a, b) => Math.abs(a - day) - Math.abs(b - day))[0];
      return nearby != null && Math.abs(chart.scales.x.getPixelForValue(nearby) - event.x) <= 8 ? nearby : Math.round(day);
    };
    const chart = createChartRuntime(container.querySelector(`#corr-workspace-chart-${index}`), {
      type: 'line', data: { datasets },
      plugins: [{ id: 'correlation-calendar-cursor', afterLayout: c => {
        tracks.forEach(t => { t.style.setProperty('--corr-plot-left', `${c.chartArea.left}px`); t.style.setProperty('--corr-plot-right', `${c.width - c.chartArea.right}px`); });
      }, afterDraw: c => {
        const x = c.scales.x.getPixelForValue(cursor), a = c.chartArea, ctx = c.ctx;
        ctx.save(); ctx.strokeStyle = colors.tickColor; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke(); ctx.restore();
      } }],
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        layout: { padding: { left: 0, right: normalized || axes.size > 1 ? 0 : 65 } },
        onHover: event => { if (!state.correlationView.inspectDate && event.x >= chart.chartArea.left && event.x <= chart.chartArea.right) inspect(pointerDay(event), false); },
        onClick: event => { const day = pointerDay(event); if (Number.isFinite(day)) { state.correlationView.inspectDate = correlationDate(day); inspect(day); void saveCorrelationWorkspace(); } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: points => points.length ? correlationDate(Math.floor(points[0].parsed.x)) : '', label: p => { const history = selection.histories.find(h => h.id === p.dataset.therapyId); const value = history ? therapyExposure(history, correlationDate(Math.floor(p.parsed.x))).label : formatValue(p.raw.rawValue ?? p.parsed.y); return `${p.dataset.label}: ${value}`; } } } },
        scales: {
          x: { type: 'linear', min: start, max: end, afterBuildTicks: axis => { const count = axis.chart.width < 480 ? 3 : 5; axis.ticks = Array.from({ length: count }, (_, i) => ({ value: Math.round(start + (end - 1 - start) * i / (count - 1)) })); }, title: { display: true, text: 'Calendar date', color: colors.tickColor }, ticks: { color: colors.tickColor, maxTicksLimit: 4, includeBounds: false, callback: v => correlationDate(Math.round(Number(v))) }, grid: { color: colors.gridColor } },
          ...numericScales,
        },
      },
    });
    if (chart) { state.chartInstances[`correlation-therapy-${index}`] = chart; charts.push(chart); }
  });
  if (tab === 'scatter' && pair && scatterCompatible) {
    const eligible = scatterRows;
    const unit = eligible.length ? amountUnit(eligible[0].exposure) : pair.xUnit || '';
    const chart = createChartRuntime(container.querySelector('#corr-scatter'), {
      type: 'scatter', data: { datasets: [{ label: `${pair.markerName} × ${pair.therapyName}`, data: eligible.map(r => ({ x: r.exposure.value, y: r.value, date: r.date, exposureDate: r.exposureDate })), backgroundColor: styles[0], pointRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: p => p.length ? `${p[0].raw.date} · paired date ${p[0].raw.exposureDate}` : '' } } }, scales: { x: { title: { display: true, text: `${pair.therapyName} (${unit})`, color: colors.tickColor }, ticks: { color: colors.tickColor }, grid: { color: colors.gridColor } }, y: { title: { display: true, text: `${pair.markerName} (${pair.unit})`, color: colors.tickColor }, ticks: { color: colors.tickColor }, grid: { color: colors.gridColor } } } },
    });
    if (chart) state.chartInstances['correlation-therapy-scatter'] = chart;
  }
  inspect(cursor);
}
