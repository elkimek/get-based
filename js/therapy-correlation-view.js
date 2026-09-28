// @ts-check
import { state } from './state.js';
import { escapeHTML, formatValue } from './utils.js';
import { getChartColors } from './theme.js';
import { createChartRuntime } from './charts-runtime.js';
import { correlationDay, correlationDate, therapyExposure, therapySegments } from './therapy-correlations.js';

export function destroyTherapyCorrelationCharts() {
  for (const key of Object.keys(state.chartInstances)) {
    if (!key.startsWith('correlation-therapy-')) continue;
    state.chartInstances[key].destroy();
    delete state.chartInstances[key];
  }
}

function doseLabel(value, unit, basis) {
  return `${Number(value.toPrecision(8))} ${unit}${basis === 'day' ? '/day' : ' (recorded dose)'}`;
}

function renderTherapyCorrelationResults(selection, container) {
  if (!container) return;
  if (!selection.comparisons.length) {
    container.innerHTML = '<p class="corr-help">Select at least one biomarker and one supplement or medication. Items with duplicate record IDs need their history corrected before comparison.</p>';
    return;
  }
  container.innerHTML = selection.comparisons.map((comparison, index) => {
      const history = selection.histories.find(h => h.id === comparison.therapyId);
      const needsDates = history.currentDoses.some(d => !d.confirmedSince);
      const status = comparison.r !== null ? `Exploratory Pearson r = ${comparison.r.toFixed(2)}`
        : !comparison.n && needsDates ? 'Confirm dose dates to check which lab results can be compared.'
        : `Coefficient unavailable: ${comparison.unavailable}.`;
      const groups = comparison.groups.map(g => `<tr><td>${escapeHTML((g.ingredient ? `${g.ingredient}: ` : '') + doseLabel(g.dose, g.unit, g.basis))}</td><td>${g.n}</td><td>${escapeHTML(formatValue(g.mean))} ${escapeHTML(comparison.unit)}</td><td>${escapeHTML(g.dates[0])} – ${escapeHTML(g.dates.at(-1))}</td></tr>`).join('');
      const rows = comparison.rows.map(row => `<tr><td>${escapeHTML(row.date)}</td><td>${escapeHTML(formatValue(row.value))} ${escapeHTML(comparison.unit)}</td><td>${escapeHTML(row.exposureDate)}</td><td>${escapeHTML(row.exposure.label)}</td><td>${row.exposure.daysSinceChange ?? '—'}</td><td>${escapeHTML(row.reason || 'Included')}</td><td>${escapeHTML(row.sources.map(s => s.id || s.source || s.date).join(', ') || 'Calculated / derived marker')}</td></tr>`).join('');
      const periods = history.periods.map(p => `<li>${escapeHTML(p.start)} → ${escapeHTML(p.end || 'ongoing')}: ${escapeHTML(typeof p.dose === 'string' ? p.dose : p.quantity?.text || 'Dose not recorded')}</li>`).join('');
      return `<section class="corr-therapy-card" aria-labelledby="corr-therapy-title-${index}">
        <h4 id="corr-therapy-title-${index}">${escapeHTML(comparison.markerName)} × ${escapeHTML(comparison.therapyName)}</h4>
        <p class="corr-stat">${escapeHTML(status)} <span>${comparison.rows.length} lab results · ${comparison.n} matched to numeric doses</span></p>
        <details><summary>Data &amp; limitations · ${comparison.rows.filter(r => r.reason).length} lab results excluded from dose correlation</summary>
          ${comparison.warnings.length ? `<ul class="corr-help">${comparison.warnings.map(w => `<li>${escapeHTML(w)}</li>`).join('')}</ul>` : ''}
          ${comparison.baseline ? `<p class="corr-help">Before first recorded use: ${comparison.baseline.n} measurements, mean ${escapeHTML(formatValue(comparison.baseline.mean))} ${escapeHTML(comparison.unit)}. Prior intake is unknown; these measurements are not assigned a zero dose.</p>` : ''}
          ${groups ? `<div class="corr-data-scroll" tabindex="0" role="region" aria-label="Marker averages by recorded dose"><table class="corr-data-table"><caption>Descriptive averages by recorded dose; measurements may be months apart.</caption><thead><tr><th>Dose</th><th>Measurements</th><th>Mean marker value</th><th>Lab dates</th></tr></thead><tbody>${groups}</tbody></table></div>` : '<p class="corr-help">No lab measurements have usable numeric dose information.</p>'}
          <div class="corr-data-scroll" tabindex="0" role="region" aria-label="Measurements and exclusions"><table class="corr-data-table"><thead><tr><th>Lab date</th><th>Marker value</th><th>Dose date</th><th>Recorded dose / status</th><th>Days since change</th><th>Analysis status</th><th>Source entry</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No measurements for this marker.</td></tr>'}</tbody></table></div>
          <p class="corr-help">Recorded use does not confirm intake. A lag does not account for carryover or establish a biological response time. Days since change refers to the start of the dose period or break at the chosen dose date. Conflicting same-date results are excluded; identical repeated results count once. Unknown dose is a gap, not zero. End dates include that whole day. Breaks represent no recorded use, not a biological washout.</p>
          <ul class="corr-period-list">${periods}</ul>
        </details>
      </section>`;
    }).join('');
}


const esc = escapeHTML;
const darkStyles = ['#38bdf8', '#a78bfa', '#fbbf24', '#34d399', '#fb7185', '#22d3ee', '#e879f9', '#a3e635'];
const amountUnit = q => q ? `${q.unit}${q.basis === 'day' ? '/day' : q.basis === 'marker' ? '' : ' per dose'}` : '';
const textDose = q => `${formatValue(q.value)} ${amountUnit(q)}`;
const field = (key, label, choices, value) => `<label>${label}<select data-corr-setting="${key}" id="corr-${key}">${choices.map(([v, t]) => `<option value="${v}"${v === value ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`;

export function renderCorrelationWorkspace(selection, container, refresh) {
  destroyTherapyCorrelationCharts();
  const styles = document.documentElement.dataset.theme === 'light' ? ['#007da8', '#7651b9', '#a45300', '#007f5b', '#b52c4b', '#007786', '#963dad', '#567500'] : darkStyles;
  const view = state.correlationView;
  const grouping = view.grouping || 'combined', layout = view.layout || 'overlay', tab = view.tab || 'timeline';
  const pairs = selection.comparisons.length ? selection.comparisons : selection.markerPairs;
  const pairIndex = Math.min(Math.max(0, Number(view.pair) || 0), Math.max(0, pairs.length - 1));
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
  const fallback = correlationDay(selection.histories[0]?.today || new Date().toISOString().slice(0, 10));
  const requestedEnd = correlationDay(selection.range.end);
  const naturalStart = days.length ? Math.min(...days) : fallback;
  const start = correlationDay(selection.range.start) ?? Math.min(naturalStart, requestedEnd ?? naturalStart);
  const last = requestedEnd ?? Math.max(start, days.length ? Math.max(...days) : fallback);
  const end = Math.max(start + 1, last + 1);
  let cursor = Math.min(end - 1, Math.max(start, correlationDay(view.inspectDate) ?? (selection.markers[0]?.rows.length ? correlationDay(selection.markers[0].rows.at(-1).date) : last)));
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
  const lanes = layout === 'lanes' || groups.some(g => axesFor(g).size > 2);
  if (lanes) groups = groups.flatMap(g => {
    const plots = g.filter(numeric).map(s => [s]);
    const tracks = g.filter(s => !numeric(s));
    if (!plots.length) return [tracks];
    plots[0].push(...tracks);
    return plots;
  });
  groups = groups.filter(g => g.length);
  const plotCount = groups.filter(g => g.some(numeric)).length;
  const missingDoses = visible.filter(s => s.kind === 'dose' && !numeric(s));
  const current = selection.histories.map(h => `<section class="corr-current-dose"><div class="corr-current-heading"><strong>${esc(h.name)} · Saved dose today</strong><button type="button" class="corr-review-dose" data-compare-action="review-therapy" data-compare-key="${esc(h.id)}">Review dose dates</button></div>${h.currentDoses.length ? `<ul>${h.currentDoses.map(d => `<li><span><span class="corr-ingredient-label">Active ingredient</span>${esc(d.ingredient)}</span><span><strong>${esc(textDose(d))}</strong><small>${d.confirmedSince ? `Recorded since ${esc(d.confirmedSince)}` : 'Start date not confirmed'}</small></span></li>`).join('')}</ul><p>These amounts belong to this product. They are not assigned to earlier dates until you confirm when they applied.</p>` : '<p>No current daily ingredient amount is available.</p>'}${h.record.ingredients?.length > 1 ? '<p>Each ingredient keeps its own dated dose. Choose the ingredient above to compare; ingredient amounts are never added together.</p>' : ''}</section>`).join('');
  container.innerHTML = `<div class="corr-workspace-tools">
    ${field('grouping', 'Chart grouping', [['combined', 'Combined'], ['separate', 'Separate pairs']], grouping)}
    ${field('layout', 'Display', [['overlay', 'Single chart'], ['lanes', 'Aligned lanes']], layout)}
    <label>From<input id="corr-start" type="date" data-corr-setting="start" value="${esc(selection.range.start)}"></label>
    <label>To<input id="corr-end" type="date" data-corr-setting="end" value="${esc(selection.range.end)}"></label>
    <button type="button" data-corr-reset>All time</button>
  </div>
  <p id="corr-layout-status" class="corr-help" role="status"${tab !== 'timeline' ? ' hidden' : ''}>${grouping === 'combined' ? 'Combined selection' : 'Separate pairs'} · ${plotCount} ${plotCount === 1 ? 'chart' : 'charts'}. ${pairs.length === 1 ? 'Only one pair is selected, so both grouping options show the same data.' : grouping === 'separate' ? 'Each pair has its own panel below; scroll to see the remaining pairs.' : 'All visible series share this view.'}</p>
  <p class="corr-help">${!selection.histories.length ? 'Markers are paired only on matching lab dates. ' : selection.lagDays ? `Lab results are paired with doses ${selection.lagDays} days earlier. ` : 'Lab results are paired with doses on the test date. '}History stays on its actual dates. Recorded use does not confirm intake; associations do not establish cause and effect.</p>
  ${selection.rangeError ? `<p role="alert">${esc(selection.rangeError)}</p>` : ''}
  <div class="corr-workspace-tabs" aria-label="Analysis view">${['timeline', 'scatter', 'data'].map(t => `<button type="button" id="corr-tab-${t}" data-corr-tab="${t}" aria-pressed="${t === tab}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
  ${selection.histories.filter(h => h.ingredientOptions.length > 1).map(h => `<label class="corr-ingredient-picker">Dose ingredient · ${esc(h.name)}<select data-corr-ingredient="${esc(h.id)}">${h.ingredientOptions.map(name => `<option value="${esc(name)}"${name === h.selectedIngredient ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`).join('')}
  <div class="corr-series" aria-label="Visible series"${tab !== 'timeline' ? ' hidden' : ''}>${series.map(s => `<button type="button" data-corr-series="${esc(s.id)}" aria-pressed="${!hidden.has(s.id)}"><i style="border-color:${s.color};border-top-style:${s.index % 2 ? 'dashed' : 'solid'}"></i>${esc(s.name)}${s.history?.selectedIngredient ? ` · ${esc(s.history.selectedIngredient)}` : ''}${s.unit ? ` · ${esc(s.unit)}` : ' · usage only'}</button>`).join('')}</div>
  <p class="corr-help"${tab !== 'timeline' ? ' hidden' : ''}>Series buttons change visibility only. Analysis includes all selected items in this date range.</p>
  ${tab === 'timeline' ? missingDoses.map(s => `<section class="corr-dose-notice"><strong>${esc(s.name)} · No dose line in this date range</strong>${s.history.currentDoses.length ? `<p>Saved today: ${s.history.currentDoses.map(d => `${esc(d.ingredient)} ${esc(textDose(d))}`).join('; ')}.</p>` : ''}<p>${s.history.currentDoses.some(d => !d.confirmedSince) ? 'Confirm when this amount applied before it can appear as a historical dose line. A change from 500 to 2,000 mg needs a dated record for each amount.' : 'A dose line needs compatible numeric amounts on dated records. Review missing amounts, units and schedules.'} The bar below shows recorded use only; its height does not represent dose.</p><button type="button" class="corr-review-dose" data-compare-action="review-therapy" data-compare-key="${esc(s.id)}">Set dose dates</button></section>`).join('') : ''}
  <div id="corr-workspace-plots"${tab !== 'timeline' || selection.rangeError ? ' hidden' : ''}>${groups.map((g, i) => `<section class="corr-timeline-panel${grouping === 'separate' ? ' corr-pair-panel' : ''}"><h4>${g.map(s => esc(s.name)).join(' + ')}</h4>${g.some(numeric) ? `<p class="corr-help">${[...axesFor(g)].map(([key, axis]) => `${axis.position === 'left' ? 'Left' : 'Right'}: ${g.filter(s => numeric(s) && scaleKey(s) === key).map(s => esc(s.name)).join(', ')} (${esc(axis.unit)})`).join(' · ')}</p><div class="corr-dose-chart${lanes ? ' corr-lane-chart' : ''}"><canvas id="corr-workspace-chart-${i}" role="img" aria-label="${esc(g.map(s => s.name).join(' and '))} over calendar time"></canvas></div>` : ''}${g.filter(s => s.kind === 'dose').map(s => `<div class="corr-use-timeline" data-corr-track="${esc(s.id)}"><div class="corr-use-heading">${esc(s.name)} · Recorded use <span>Not a dose scale</span></div><div class="corr-use-track"></div></div>`).join('')}</section>`).join('') || '<p>No visible series. Turn a series on above.</p>'}</div>
  <p class="corr-help"${tab !== 'timeline' ? ' hidden' : ''}>${lanes ? 'Aligned lanes share the same calendar. Each lane has its own labeled scale.' : 'Axis labels show each series’ original units. Heights across different axes are not comparable.'} Points are measured lab results; connecting lines are visual guides. Dose steps show dated records, gaps mean unknown, and zero means a recorded break or scheduled off-day.</p>
  ${layout === 'overlay' && lanes ? '<p class="corr-help">Aligned lanes are used because the selected units or dose bases differ and need more than two scales. Hide a series to fit the remaining data in one chart.</p>' : ''}
  ${selection.histories.length && tab === 'timeline' ? '<div class="corr-use-key"><span><i class="corr-use-recorded"></i>Recorded use</span><span><i class="corr-use-paused"></i>Break / scheduled off-day</span><span><i class="corr-use-unknown"></i>Unknown history</span></div>' : ''}
  <div class="corr-inspector"${tab !== 'timeline' || selection.rangeError ? ' hidden' : ''}><label>Inspect date<input type="date" id="corr-inspect" value="${correlationDate(cursor)}" min="${correlationDate(start)}" max="${correlationDate(end - 1)}"></label><div id="corr-readout" aria-live="polite"></div></div>
  <div class="corr-pair-analysis"><label>Analysis pair<select id="corr-pair" data-corr-setting="pair">${pairs.map((p, i) => `<option value="${i}"${i === pairIndex ? ' selected' : ''}>${esc(p.markerName)} × ${esc(p.therapyName)}</option>`).join('')}</select></label>
    <p class="corr-help">${pair ? `${pair.n} eligible · ${pair.rows.length - pair.n} excluded${pair.therapyId ? ` · ${pair.groups?.length || 0} dose levels` : ''}. ` : 'No pairs available. '}Coefficients are exploratory; repeated observations, time trends and overlapping treatments can affect them.</p>
    ${tab === 'scatter' && !scatterCompatible ? '<p role="status">Scatter unavailable: these rows use different dose units, bases or ingredients. They cannot share one numeric dose axis.</p>' : ''}
    <div class="corr-dose-chart"${tab !== 'scatter' || selection.rangeError || !scatterCompatible ? ' hidden' : ''}><canvas id="corr-scatter" role="img" aria-label="Paired observations; excluded rows are not plotted"></canvas></div>
    <div id="corr-pair-detail"></div>
  </div>
  <div class="corr-current-references">${current}</div>`;

  for (const id of ['corr-grouping', 'corr-layout']) container.querySelector(`#${id}`).disabled = tab !== 'timeline' || (id === 'corr-grouping' && pairs.length <= 1);
  const updateSetting = (key, value) => { state.correlationView = { ...state.correlationView, [key]: value }; refresh(); };
  container.querySelectorAll('[data-corr-setting]').forEach(el => el.addEventListener('change', () => updateSetting(el.getAttribute('data-corr-setting'), /** @type {HTMLInputElement} */ (el).value)));
  container.querySelector('[data-corr-reset]').addEventListener('click', () => { state.correlationView = { ...view, start: '', end: '' }; refresh(); });
  container.querySelectorAll('[data-corr-tab]').forEach(el => el.addEventListener('click', () => updateSetting('tab', el.getAttribute('data-corr-tab'))));
  container.querySelectorAll('[data-corr-series]').forEach(el => el.addEventListener('click', () => {
    const id = el.getAttribute('data-corr-series');
    if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
    updateSetting('hidden', [...hidden]);
  }));
  container.querySelectorAll('[data-corr-ingredient]').forEach(el => el.addEventListener('change', () => updateSetting('ingredients', { ...view.ingredients, [el.getAttribute('data-corr-ingredient')]: /** @type {HTMLSelectElement} */ (el).value })));
  const detail = container.querySelector('#corr-pair-detail');
  if (pair?.therapyId) {
    renderTherapyCorrelationResults({ ...selection, comparisons: [pair] }, detail);
    if (tab === 'data') detail.querySelector('details')?.setAttribute('open', '');
  } else if (pair) {
    detail.innerHTML = `<p class="corr-stat">${pair.r === null ? esc(pair.unavailable) : `Exploratory Pearson r = ${pair.r.toFixed(2)}`}</p><details${tab === 'data' ? ' open' : ''}><summary>Data &amp; limitations</summary><div class="corr-data-scroll" tabindex="0"><table class="corr-data-table"><thead><tr><th>Lab date</th><th>${esc(pair.markerName)} (${esc(pair.unit)})</th><th>${esc(pair.therapyName)} (${esc(pair.xUnit)})</th><th>Status</th><th>Source</th></tr></thead><tbody>${pair.rows.map(r => `<tr><td>${r.date}</td><td>${formatValue(r.value)}</td><td>${r.exposure.value === null ? '—' : formatValue(r.exposure.value)}</td><td>${esc(r.reason || 'Included')}</td><td>${esc(r.sources.map(s => s.id || s.source || s.date).join(', '))}</td></tr>`).join('')}</tbody></table></div><p class="corr-help">Only same-date measurements are paired. Missing values are not interpolated. Correlation does not establish causation.</p></details>`;
  }
  if (selection.rangeError) return;
  const colors = getChartColors();
  const charts = [];
  function inspect(day, announce = true) {
    cursor = Math.min(end - 1, Math.max(start, day));
    const date = correlationDate(cursor);
    const input = /** @type {HTMLInputElement} */ (container.querySelector('#corr-inspect'));
    input.value = date;
    const readout = container.querySelector('#corr-readout');
    readout.setAttribute('aria-live', announce ? 'polite' : 'off');
    readout.innerHTML = visible.map(s => {
      const row = s.marker?.rows.find(r => r.date === date);
      const exposure = s.history ? therapyExposure(s.history, date) : null;
      const value = s.kind === 'marker' ? row ? row.reason || `${formatValue(row.value)} ${s.unit}` : 'No measurement on this date'
        : exposure.value === null ? exposure.label : `${textDose(exposure)} · ${exposure.label}`;
      return `<div><strong>${esc(s.name)}</strong><span>${esc(value)}</span></div>`;
    }).join('');
    charts.forEach(c => c.draw());
  }
  container.querySelector('#corr-inspect').addEventListener('change', e => {
    const day = correlationDay(/** @type {HTMLInputElement} */ (e.target).value);
    if (day !== null) { state.correlationView.inspectDate = correlationDate(day); inspect(day); }
  });
  if (tab === 'timeline') groups.forEach((items, index) => {
    const tracks = [...container.querySelectorAll('.corr-timeline-panel')][index].querySelectorAll('[data-corr-track]');
    const axes = axesFor(items);
    const datasets = items.flatMap(s => {
      const common = { label: `${s.name}${s.kind === 'dose' ? s.history.quantity?.ingredient ? ` · ${s.history.quantity.ingredient}` : ' dose' : ''} (${s.unit})`, borderColor: s.color, backgroundColor: s.color, borderDash: s.index % 2 ? [7, 4] : [], borderWidth: 2, tension: 0, spanGaps: false, yAxisID: axes.get(scaleKey(s))?.id, pointRadius: s.kind === 'dose' ? 0 : 4, pointStyle: s.index % 2 ? 'rectRot' : 'circle' };
      if (s.marker) return [{ ...common, data: s.marker.rows.map(r => ({ x: correlationDay(r.date), y: r.reason ? null : r.value })) }];
      const segments = segmentsById.get(s.id);
      const track = [...tracks].find(t => t.getAttribute('data-corr-track') === s.id)?.querySelector('.corr-use-track');
      if (track) track.innerHTML = segments.map(seg => `<span class="corr-use-segment corr-use-${seg.usage === 1 ? 'recorded' : seg.usage === 0 ? 'paused' : 'unknown'}" style="left:${(seg.start - start) / (end - start) * 100}%;width:${(seg.end - seg.start) / (end - start) * 100}%" role="img" tabindex="0" aria-label="${esc(`${correlationDate(seg.start)} through ${correlationDate(seg.end - 1)}: ${seg.label}`)}" title="${esc(seg.label)}"></span>`).join('');
      const points = segments.flatMap(seg => [{ x: seg.start, y: s.history.quantity ? seg.value : null, label: seg.label }, { x: seg.end, y: s.history.quantity ? seg.value : null, label: seg.label }]);
      return points.some(p => p.y !== null) ? [{ ...common, data: points, stepped: 'after' }] : [];
    });
    if (!datasets.length) return;
    const numericScales = { y: { display: false, position: 'left' }, dose: { display: false, position: 'right' } };
    for (const axis of axes.values()) numericScales[axis.id] = {
      display: true, position: axis.position, beginAtZero: axis.kind === 'dose',
      afterFit: a => { a.width = 65; },
      title: { display: true, text: axis.unit, color: colors.tickColor },
      ticks: { color: colors.tickColor }, grid: { drawOnChartArea: axis.position === 'left', color: colors.gridColor },
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
        layout: { padding: { left: 0, right: axes.size > 1 ? 0 : 65 } },
        onHover: event => { if (event.x >= chart.chartArea.left && event.x <= chart.chartArea.right) inspect(Math.floor(chart.scales.x.getValueForPixel(event.x)), false); },
        onClick: event => { const day = Math.floor(chart.scales.x.getValueForPixel(event.x)); if (Number.isFinite(day)) { state.correlationView.inspectDate = correlationDate(day); inspect(day); } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: points => points.length ? correlationDate(Math.floor(points[0].parsed.x)) : '', label: p => `${p.dataset.label}: ${p.raw.label || formatValue(p.parsed.y)}` } } },
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
