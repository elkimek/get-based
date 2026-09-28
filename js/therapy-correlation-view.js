// @ts-check
import { state } from './state.js';
import { escapeHTML, formatValue } from './utils.js';
import { getChartColors } from './theme.js';
import { createChartRuntime } from './charts-runtime.js';
import { correlationDay, correlationDate, therapySegments } from './therapy-correlations.js';

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

export function renderTherapyCorrelationResults(selection, container) {
  destroyTherapyCorrelationCharts();
  if (!container) return;
  if (!selection.comparisons.length) {
    container.innerHTML = '<p class="corr-help">Select at least one biomarker and one supplement or medication. Items with duplicate record IDs need their history corrected before comparison.</p>';
    return;
  }
  container.innerHTML = `<p class="corr-help">Recorded use does not confirm intake. ${selection.lagDays ? `Lab results are paired with the dose recorded ${selection.lagDays} days earlier.` : 'Lab results are paired with the dose recorded on the same date.'} This alignment does not account for delayed effects or carryover. Associations do not establish cause and effect.</p>`
    + selection.comparisons.map((comparison, index) => {
      const history = selection.histories.find(h => h.id === comparison.therapyId);
      const groups = comparison.groups.map(g => `<tr><td>${escapeHTML(doseLabel(g.dose, g.unit, g.basis))}</td><td>${g.n}</td><td>${escapeHTML(formatValue(g.mean))} ${escapeHTML(comparison.unit)}</td><td>${escapeHTML(g.dates[0])} – ${escapeHTML(g.dates.at(-1))}</td></tr>`).join('');
      const rows = comparison.rows.map(row => `<tr><td>${escapeHTML(row.date)}</td><td>${escapeHTML(formatValue(row.value))} ${escapeHTML(comparison.unit)}</td><td>${escapeHTML(row.exposureDate)}</td><td>${escapeHTML(row.exposure.label)}</td><td>${row.exposure.daysSinceChange ?? '—'}</td><td>${escapeHTML(row.reason || 'Included')}</td><td>${escapeHTML(row.sources.map(s => s.id || s.source || s.date).join(', ') || 'Calculated / derived marker')}</td></tr>`).join('');
      const periods = history.periods.map(p => `<li>${escapeHTML(p.start)} → ${escapeHTML(p.end || 'ongoing')}: ${escapeHTML(typeof p.dose === 'string' ? p.dose : p.quantity?.text || 'Dose not recorded')}</li>`).join('');
      return `<section class="corr-therapy-card" aria-labelledby="corr-therapy-title-${index}">
        <h4 id="corr-therapy-title-${index}">${escapeHTML(comparison.markerName)} × ${escapeHTML(comparison.therapyName)}</h4>
        <p class="corr-stat">${comparison.r === null ? `Coefficient unavailable: ${escapeHTML(comparison.unavailable)}.` : `Exploratory Pearson r = ${comparison.r.toFixed(2)} · ${comparison.n} measurements. This is not a confidence or treatment-effect score.`}</p>
        <div class="corr-dose-chart"><canvas id="corr-dose-chart-${index}" role="img" aria-label="${escapeHTML(comparison.markerName)} measurements and ${escapeHTML(comparison.therapyName)} dose history; values are in the data table below"></canvas></div>
        ${history.quantity ? '' : '<p class="corr-help">A numeric dose line needs compatible, explicit doses. Recorded periods remain available below.</p>'}
        ${comparison.warnings.length ? `<ul class="corr-help">${comparison.warnings.map(w => `<li>${escapeHTML(w)}</li>`).join('')}</ul>` : ''}
        ${comparison.baseline ? `<p class="corr-help">Before first recorded use: ${comparison.baseline.n} measurements, mean ${escapeHTML(formatValue(comparison.baseline.mean))} ${escapeHTML(comparison.unit)}. Prior intake is unknown; these measurements are not assigned a zero dose.</p>` : ''}
        ${groups ? `<div class="corr-data-scroll" tabindex="0" role="region" aria-label="Marker averages by recorded dose"><table class="corr-data-table"><caption>Descriptive averages by recorded dose; measurements may be months apart.</caption><thead><tr><th>Dose</th><th>Measurements</th><th>Mean marker value</th><th>Lab dates</th></tr></thead><tbody>${groups}</tbody></table></div>` : '<p class="corr-help">No lab measurements have usable numeric dose information.</p>'}
        <details><summary>Data used (${comparison.rows.length} measurements, ${comparison.rows.filter(r => r.reason).length} excluded)</summary>
          <div class="corr-data-scroll" tabindex="0" role="region" aria-label="Measurements and exclusions"><table class="corr-data-table"><thead><tr><th>Lab date</th><th>Marker value</th><th>Dose date</th><th>Recorded dose / status</th><th>Days since change</th><th>Analysis status</th><th>Source entry</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No measurements for this marker.</td></tr>'}</tbody></table></div>
          <p class="corr-help">Days since change refers to the start of the dose period or break at the chosen dose date. Conflicting same-date results are excluded; identical repeated results count once. Unknown dose is a gap, not zero. End dates include that whole day. Breaks represent no recorded use, not a biological washout.</p>
          <ul class="corr-period-list">${periods}</ul>
        </details>
      </section>`;
    }).join('');
}

export function drawTherapyCorrelationCharts(selection) {
  const colors = getChartColors();
  selection.comparisons.forEach((comparison, index) => {
    const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById(`corr-dose-chart-${index}`));
    if (!canvas || !comparison.rows.length) return;
    const history = selection.histories.find(h => h.id === comparison.therapyId);
    const first = comparison.rows[0].date, last = comparison.rows.at(-1).date;
    const start = correlationDay(first), end = Math.max(start + 1, correlationDay(last));
    const segments = therapySegments(history, correlationDate(start - selection.lagDays), correlationDate(end - selection.lagDays));
    const dosePoints = segments.flatMap(s => [
      { x: s.start + selection.lagDays, y: history.quantity ? s.value : null, label: s.label },
      { x: s.end + selection.lagDays, y: history.quantity ? s.value : null, label: s.label },
    ]);
    const chart = createChartRuntime(canvas, {
      type: 'line',
      data: { datasets: [
        { label: `${comparison.markerName} (${comparison.unit})`, data: comparison.rows.map(r => ({ x: correlationDay(r.date), y: r.conflict || r.date > history.today ? null : r.value })), yAxisID: 'y', borderColor: '#38bdf8', backgroundColor: '#38bdf8', pointRadius: 4, tension: 0, spanGaps: false },
        { label: `${history.name}: ${history.quantity?.unit || 'dose'}${history.quantity?.basis === 'day' ? '/day' : ' (recorded dose)'}${selection.lagDays ? ` · shifted ${selection.lagDays} days` : ''}`, data: dosePoints, yAxisID: 'dose', borderColor: '#a78bfa', backgroundColor: '#a78bfa', pointRadius: 0, borderWidth: 2, stepped: 'after', spanGaps: false },
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { labels: { color: colors.legendColor, boxWidth: 12 } },
          tooltip: { callbacks: {
            title: items => items.length ? correlationDate(Math.floor(items[0].parsed.x)) : '',
            label: item => item.datasetIndex === 1 ? item.raw.label : `${comparison.markerName}: ${formatValue(item.parsed.y)} ${comparison.unit}`,
          } },
        },
        scales: {
          x: { type: 'linear', min: start, max: end, ticks: { color: colors.tickColor, maxTicksLimit: 5, callback: value => correlationDate(Math.round(Number(value))) }, grid: { color: colors.gridColor } },
          y: { position: 'left', title: { display: true, text: comparison.unit, color: colors.tickColor }, ticks: { color: colors.tickColor }, grid: { color: colors.gridColor } },
          dose: { position: 'right', beginAtZero: true, display: !!history.quantity, title: { display: true, text: history.quantity ? `${history.quantity.unit}${history.quantity.basis === 'day' ? '/day' : ' per recorded dose'}` : '', color: colors.tickColor }, ticks: { color: colors.tickColor }, grid: { drawOnChartArea: false } },
        },
      },
    });
    if (chart) state.chartInstances[`correlation-therapy-${index}`] = chart;
  });
}
