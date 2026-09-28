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
  container.innerHTML = `<p class="corr-help">Associations do not establish cause and effect. ${selection.lagDays ? `Lab results are paired with the dose recorded ${selection.lagDays} days earlier.` : 'Lab results are paired with the dose recorded on the same date.'}</p>`
    + selection.comparisons.map((comparison, index) => {
      const history = selection.histories.find(h => h.id === comparison.therapyId);
      const current = history.currentDoses.map(d => `<li><span><span class="corr-ingredient-label">Active ingredient</span>${escapeHTML(d.ingredient)}</span><span><strong>${escapeHTML(doseLabel(d.value, d.unit, 'day'))}</strong><small>${d.confirmedSince ? `Recorded since ${escapeHTML(d.confirmedSince)}` : 'Start date not confirmed'}</small></span></li>`).join('');
      const needsDates = history.currentDoses.some(d => !d.confirmedSince);
      const status = comparison.r !== null ? `Exploratory Pearson r = ${comparison.r.toFixed(2)}`
        : !comparison.n && needsDates ? 'Confirm dose dates to check which lab results can be compared.'
        : `Coefficient unavailable: ${comparison.unavailable}.`;
      const groups = comparison.groups.map(g => `<tr><td>${escapeHTML((g.ingredient ? `${g.ingredient}: ` : '') + doseLabel(g.dose, g.unit, g.basis))}</td><td>${g.n}</td><td>${escapeHTML(formatValue(g.mean))} ${escapeHTML(comparison.unit)}</td><td>${escapeHTML(g.dates[0])} – ${escapeHTML(g.dates.at(-1))}</td></tr>`).join('');
      const rows = comparison.rows.map(row => `<tr><td>${escapeHTML(row.date)}</td><td>${escapeHTML(formatValue(row.value))} ${escapeHTML(comparison.unit)}</td><td>${escapeHTML(row.exposureDate)}</td><td>${escapeHTML(row.exposure.label)}</td><td>${row.exposure.daysSinceChange ?? '—'}</td><td>${escapeHTML(row.reason || 'Included')}</td><td>${escapeHTML(row.sources.map(s => s.id || s.source || s.date).join(', ') || 'Calculated / derived marker')}</td></tr>`).join('');
      const periods = history.periods.map(p => `<li>${escapeHTML(p.start)} → ${escapeHTML(p.end || 'ongoing')}: ${escapeHTML(typeof p.dose === 'string' ? p.dose : p.quantity?.text || 'Dose not recorded')}</li>`).join('');
      return `<section class="corr-therapy-card" aria-labelledby="corr-therapy-title-${index}">
        <h4 id="corr-therapy-title-${index}">${escapeHTML(comparison.markerName)} × ${escapeHTML(comparison.therapyName)}</h4>
        ${current ? `<div class="corr-current-dose"><div class="corr-current-heading"><strong>Saved dose today</strong><button type="button" class="corr-review-dose" data-compare-action="review-therapy" data-compare-key="${escapeHTML(history.id)}">Review dose dates</button></div><ul>${current}</ul>${needsDates ? '<p>These amounts belong to this product. They are not assigned to earlier dates until you confirm when they applied.</p>' : ''}</div>` : ''}
        <p class="corr-stat">${escapeHTML(status)} <span>${comparison.rows.length} lab results · ${comparison.n} matched to numeric doses</span></p>
        <div class="corr-dose-chart"><canvas id="corr-dose-chart-${index}" role="img" aria-label="${escapeHTML(comparison.markerName)} measurements${history.quantity ? ` and ${escapeHTML(comparison.therapyName)} recorded doses` : ''}; usage periods are in the separate strip below"></canvas></div>
        <div class="corr-use-timeline" id="corr-use-timeline-${index}"><div class="corr-use-heading">Recorded use <span>Same dates as the chart · not a dose scale</span></div><div class="corr-use-track"></div><div class="corr-use-key"><span><i class="corr-use-recorded"></i>Recorded use</span><span><i class="corr-use-paused"></i>Break / stopped</span><span><i class="corr-use-unknown"></i>Unknown</span></div></div>
        <p class="corr-help">${history.quantity ? `The purple step line shows dated doses${history.quantity.ingredient ? ` of ${escapeHTML(history.quantity.ingredient)}` : ''}; its height follows the dose axis.` : 'No numeric dose history to plot yet. Recorded use is shown in the strip; the saved amount above is a current reference.'}${selection.lagDays ? ` Dose history and the strip are shifted ${selection.lagDays} days forward to align with lab results.` : ''}</p>
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

export function drawTherapyCorrelationCharts(selection) {
  const colors = getChartColors();
  selection.comparisons.forEach((comparison, index) => {
    const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById(`corr-dose-chart-${index}`));
    if (!canvas || !comparison.rows.length) return;
    const history = selection.histories.find(h => h.id === comparison.therapyId);
    const days = comparison.rows.map(r => correlationDay(r.date));
    if (!history.invalid) for (const p of history.periods) {
      if (p.start > history.today) continue;
      days.push(correlationDay(p.start) + selection.lagDays, correlationDay(p.end && p.end < history.today ? p.end : history.today) + selection.lagDays);
    }
    if (history.currentDoses.length) days.push(correlationDay(history.today));
    const start = Math.min(...days), end = Math.max(start, ...days) + 1;
    const segments = therapySegments(history, correlationDate(start - selection.lagDays), correlationDate(end - selection.lagDays));
    const dosePoints = segments.flatMap(s => [
      { x: s.start + selection.lagDays, y: history.quantity ? s.value : null, label: s.label },
      { x: s.end + selection.lagDays, y: history.quantity ? s.value : null, label: s.label },
    ]);
    const hasDose = dosePoints.some(p => p.y !== null);
    const shifted = selection.lagDays ? ` · shifted ${selection.lagDays} days` : '';
    const timeline = document.getElementById(`corr-use-timeline-${index}`);
    const track = timeline?.querySelector('.corr-use-track');
    if (track) track.innerHTML = segments.filter(s => s.start + selection.lagDays < end).map(s => {
      const from = Math.max(start, s.start + selection.lagDays), to = Math.min(end, s.end + selection.lagDays);
      const status = s.usage === 1 ? 'recorded' : s.usage === 0 ? 'paused' : 'unknown';
      const label = `${correlationDate(s.start)} to ${correlationDate(s.end - 1)}: ${s.usage === 1 ? 'Recorded use' : s.usage === 0 ? 'Break / stopped' : 'Unknown history'}. ${s.label}`;
      return `<span class="corr-use-segment corr-use-${status}" role="img" tabindex="0" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}" style="left:${(from - start) / (end - start) * 100}%;width:${(to - from) / (end - start) * 100}%"></span>`;
    }).join('');
    const chart = createChartRuntime(canvas, {
      type: 'line',
      plugins: [{ id: 'therapy-use-alignment', afterLayout: chart => {
        if (!timeline) return;
        timeline.style.setProperty('--corr-plot-left', `${chart.chartArea.left}px`);
        timeline.style.setProperty('--corr-plot-right', `${chart.width - chart.chartArea.right}px`);
      } }],
      data: { datasets: [
        { label: `${comparison.markerName} (${comparison.unit})`, data: comparison.rows.map(r => ({ x: correlationDay(r.date), y: r.conflict || r.date > history.today ? null : r.value })), yAxisID: 'y', borderColor: '#38bdf8', backgroundColor: '#38bdf8', pointRadius: 4, tension: 0, spanGaps: false },
        ...(hasDose ? [{ label: `${history.name} dose (${history.quantity.unit}${history.quantity.basis === 'day' ? '/day' : ' per dose'})${shifted}`, data: dosePoints, yAxisID: 'dose', borderColor: '#a78bfa', backgroundColor: '#a78bfa', pointRadius: 0, borderWidth: 2, stepped: 'after', spanGaps: false }] : []),
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { labels: { color: colors.legendColor, boxWidth: 12 } },
          tooltip: { callbacks: {
            title: items => items.length ? correlationDate(Math.floor(items[0].parsed.x)) : '',
            label: item => item.datasetIndex > 0 ? item.raw.label : `${comparison.markerName}: ${formatValue(item.parsed.y)} ${comparison.unit}`,
          } },
        },
        scales: {
          x: { type: 'linear', min: start, max: end, ticks: { color: colors.tickColor, maxTicksLimit: 5, includeBounds: false, callback: value => correlationDate(Math.round(Number(value))) }, grid: { color: colors.gridColor } },
          y: { position: 'left', title: { display: true, text: comparison.unit, color: colors.tickColor }, ticks: { color: colors.tickColor }, grid: { color: colors.gridColor } },
          dose: { position: 'right', beginAtZero: true, display: hasDose, title: { display: true, text: history.quantity ? `${history.quantity.unit}${history.quantity.basis === 'day' ? '/day' : ' per recorded dose'}` : '', color: colors.tickColor }, ticks: { color: colors.tickColor }, grid: { drawOnChartArea: false } },
        },
      },
    });
    if (chart) state.chartInstances[`correlation-therapy-${index}`] = chart;
  });
}
